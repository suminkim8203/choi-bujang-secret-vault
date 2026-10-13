-- 10단계: 학습용 가상 메모의 비공개 사전 사본과 추가 전용 감사 기록.
-- Supabase aleph-defense의 새 SQL Query에서 전체 실행합니다. 비밀값 입력은 없습니다.
-- 기존 메모·소유자·RLS·원본 권한·다른 서비스 정책은 변경하지 않습니다.
begin;
do $$ begin
  if not (has_table_privilege('service_role','public.aleph_defense_notes','SELECT')
    and has_table_privilege('service_role','public.aleph_defense_notes','INSERT')
    and has_table_privilege('service_role','public.aleph_defense_notes','UPDATE')) then
    raise exception 'existing_server_permissions_required';
  end if;
end $$;

create table if not exists public.aleph_note_backups (
  id uuid primary key, owner_id uuid not null, title text not null, content text not null,
  created_at timestamptz not null, content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  backed_up_at timestamptz not null default now(), version text not null default 'note-v1'
);
create table if not exists public.aleph_recovery_audit (
  audit_id bigint generated always as identity primary key,
  at timestamptz not null default now(), note_id uuid not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','RESTORE')),
  content_hash text
);
alter table public.aleph_note_backups enable row level security;
alter table public.aleph_recovery_audit enable row level security;
revoke all on public.aleph_note_backups, public.aleph_recovery_audit from public, anon, authenticated, service_role;
grant select on public.aleph_note_backups to service_role;
grant select, insert on public.aleph_recovery_audit to service_role;
grant usage, select on sequence public.aleph_recovery_audit_audit_id_seq to service_role;

create or replace function public.aleph_note_hash(p_title text, p_content text)
returns text language sql immutable strict set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.octet_length(p_title)::text || ':' || p_title || ':' ||
    pg_catalog.octet_length(p_content)::text || ':' || p_content, 'UTF8')), 'hex');
$$;
revoke all on function public.aleph_note_hash(text,text) from public, anon, authenticated;
grant execute on function public.aleph_note_hash(text,text) to service_role;

-- INSERT 시의 첫 사본만 저장합니다. 이후 수정·삭제·재복구로 사본을 덮어쓰지 않습니다.
create or replace function public.aleph_capture_note_backup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_hash text;
begin
  if TG_OP = 'INSERT' then
    if NEW.owner_id is null then raise exception 'backup_owner_required'; end if;
    row_hash := public.aleph_note_hash(NEW.title,NEW.content);
    insert into public.aleph_note_backups(id,owner_id,title,content,created_at,content_hash)
      values(NEW.id,NEW.owner_id,NEW.title,NEW.content,NEW.created_at,row_hash)
      on conflict(id) do nothing;
    if not exists(select 1 from public.aleph_note_backups b
      where b.id=NEW.id and b.owner_id=NEW.owner_id) then
      raise exception 'backup_owner_conflict';
    end if;
  elsif TG_OP = 'UPDATE' then
    row_hash := public.aleph_note_hash(NEW.title,NEW.content);
  else
    row_hash := public.aleph_note_hash(OLD.title,OLD.content);
  end if;
  insert into public.aleph_recovery_audit(note_id,operation,content_hash)
    values(case when TG_OP='DELETE' then OLD.id else NEW.id end,TG_OP,row_hash);
  return null;
end $$;
revoke all on function public.aleph_capture_note_backup() from public, anon, authenticated, service_role;
-- 이 전용 트리거만 재설정합니다. 다른 기존 트리거는 보존합니다.
drop trigger if exists aleph_note_backup_capture on public.aleph_defense_notes;
create trigger aleph_note_backup_capture after insert or update or delete
  on public.aleph_defense_notes for each row execute function public.aleph_capture_note_backup();

-- 기존 가상 자료를 처음 한 번만 저장합니다. 다시 실행해도 사본을 덮어쓰지 않습니다.
insert into public.aleph_note_backups(id,owner_id,title,content,created_at,content_hash)
  select id,owner_id,title,content,created_at,public.aleph_note_hash(title,content)
  from public.aleph_defense_notes where owner_id is not null on conflict(id) do nothing;

-- 서버가 검증한 소유자로 한 건만 복원합니다. 누락·변조·소유자 충돌이면 중단합니다.
create or replace function public.aleph_restore_note(p_id uuid,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare b public.aleph_note_backups%rowtype; restored_id uuid;
begin
  select * into b from public.aleph_note_backups where id=p_id and owner_id=p_owner for share;
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
revoke all on function public.aleph_restore_note(uuid,uuid) from public, anon, authenticated;
grant execute on function public.aleph_restore_note(uuid,uuid) to service_role;
commit;
notify pgrst, 'reload schema';

-- 결과는 권한·건수만 표시합니다. 본문·소유자 ID·계정 주소·키를 출력하지 않습니다.
-- anon/authenticated 네 열은 false. service_role은 backup_read/audit_read/restore_execute만 true.
select roles.role_name,
  has_table_privilege(role_name,'public.aleph_note_backups','SELECT') as backup_read,
  has_table_privilege(role_name,'public.aleph_note_backups','UPDATE') as backup_update,
  has_table_privilege(role_name,'public.aleph_recovery_audit','SELECT') as audit_read,
  has_function_privilege(role_name,'public.aleph_restore_note(uuid,uuid)','EXECUTE') as restore_execute
from (values('anon'),('authenticated'),('service_role')) roles(role_name);
select count(*) as backup_count,
  bool_and(content_hash=public.aleph_note_hash(title,content)) as all_hashes_valid
from public.aleph_note_backups;
select c.relname,c.relrowsecurity as rls_enabled from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('aleph_note_backups','aleph_recovery_audit');
