-- 5단계: 전용 가상 메모 테이블의 직접 접근만 회수합니다.
-- Auth 서비스·다른 테이블·기존 자료·owner_id·RLS 정책·서버 역할은 변경하지 않습니다.
-- 먼저 아래 실행 전 결과에서 service_role의 CRUD 네 권한이 true인지 확인합니다.
select 'before' as phase, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'aleph_defense_notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

select 'before' as phase, role_name,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'DELETE') as can_delete
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);

begin;
-- 서버 역할에 필요한 기존 권한이 없으면 변경하지 않고 전체 트랜잭션을 중단합니다.
do $$
begin
  if not (has_table_privilege('service_role', 'public.aleph_defense_notes', 'SELECT')
      and has_table_privilege('service_role', 'public.aleph_defense_notes', 'INSERT')
      and has_table_privilege('service_role', 'public.aleph_defense_notes', 'UPDATE')
      and has_table_privilege('service_role', 'public.aleph_defense_notes', 'DELETE')) then
    raise exception 'Server CRUD permissions must already exist';
  end if;
end $$;
alter table public.aleph_defense_notes enable row level security;
revoke all privileges on table public.aleph_defense_notes from public, anon, authenticated;
commit;

-- 정상 결과: PUBLIC/anon/authenticated 행 없음, service_role 기존 권한 유지.
select 'after' as phase, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'aleph_defense_notes'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by grantee, privilege_type;

-- 마지막 표: anon/authenticated의 모든 can_*는 false,
-- service_role의 CRUD는 true, rls_enabled=true, 기존 정책 수는 4.
select roles.role_name,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'UPDATE') as can_update,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'DELETE') as can_delete,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'TRUNCATE') as can_truncate,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'REFERENCES') as can_reference,
  has_table_privilege(role_name, 'public.aleph_defense_notes', 'TRIGGER') as can_trigger,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies where schemaname='public'
    and tablename='aleph_defense_notes') as policy_count
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
cross join pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='aleph_defense_notes';
