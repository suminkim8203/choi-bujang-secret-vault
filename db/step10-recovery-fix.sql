-- 앞서 실행한 복구 함수의 백업 읽기 잠금만 수정합니다. 데이터·권한은 변경하지 않습니다.
create or replace function public.aleph_restore_note(p_id uuid,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.aleph_note_backups%rowtype; restored_id uuid;
begin
  -- 사본은 서버에 읽기만 허용됩니다. 행 잠금의 추가 UPDATE 권한을 요구하지 않습니다.
  select * into b from public.aleph_note_backups where id=p_id and owner_id=p_owner;
  if not found then raise exception using errcode='P0002', message='verified_backup_not_found'; end if;
  if b.version <> 'note-v1' or b.content_hash <> public.aleph_note_hash(b.title,b.content) then
    raise exception using errcode='22000', message='backup_verification_failed';
  end if;
  insert into public.aleph_defense_notes as n(id,owner_id,title,content,created_at)
    values(b.id,b.owner_id,b.title,b.content,b.created_at)
    on conflict(id) do update set title=excluded.title,content=excluded.content,
      created_at=excluded.created_at where n.owner_id=excluded.owner_id returning id into restored_id;
  if restored_id is distinct from b.id or not exists(
    select 1 from public.aleph_defense_notes n where n.id=b.id and n.owner_id=b.owner_id
      and public.aleph_note_hash(n.title,n.content)=b.content_hash) then
    raise exception using errcode='42501',message='restore_owner_or_hash_conflict';
  end if;
  insert into public.aleph_recovery_audit(note_id,operation,content_hash) values(b.id,'RESTORE',b.content_hash);
  return pg_catalog.jsonb_build_object('id',b.id,'restored',true,
    'contentHash',b.content_hash,'ownerMatched',true);
end $$;
notify pgrst, 'reload schema';
