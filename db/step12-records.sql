-- 12단계: 배포 저장점마다 확정한 공개용 자기 점검 기록 한 건.
-- 새 SQL Query에서 전체 실행합니다. 비밀값 입력은 없습니다.
-- 기존 메모/소유자/백업/감사/RLS는 변경하지 않습니다.
begin;
create table if not exists public.aleph_operations_reports (
  commit text primary key check (commit ~ '^[0-9a-f]{40}$'),
  report jsonb not null check (report->>'schema' = 'aleph.operations.report.v1'
    and report->>'commit' = commit and report->>'recordId' = commit
    and pg_column_size(report) <= 131072),
  inserted_at timestamptz not null default now()
);
alter table public.aleph_operations_reports enable row level security;
revoke all on public.aleph_operations_reports from public, anon, authenticated, service_role;
grant select, insert on public.aleph_operations_reports to service_role;
-- 서버도 확정 기록의 UPDATE/DELETE는 할 수 없습니다.
commit;
select r.role,
  has_table_privilege(r.role,'public.aleph_operations_reports','SELECT') as can_select,
  has_table_privilege(r.role,'public.aleph_operations_reports','INSERT') as can_insert,
  has_table_privilege(r.role,'public.aleph_operations_reports','UPDATE') as can_update,
  has_table_privilege(r.role,'public.aleph_operations_reports','DELETE') as can_delete
from (values ('anon'),('authenticated'),('service_role')) as r(role);
select relrowsecurity as rls_enabled from pg_class
where oid='public.aleph_operations_reports'::regclass;
