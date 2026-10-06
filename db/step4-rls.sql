-- Scope: only public.aleph_defense_notes. No credentials or note bodies.
-- Review and run in the official Supabase SQL Editor after step4-owners.sql.
select 'before' as phase, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'aleph_defense_notes'
    and grantee in ('PUBLIC', 'anon', 'authenticated') order by grantee, privilege_type;
select 'before' as phase, role_name, privilege,
    has_table_privilege(role_name, 'public.aleph_defense_notes', privilege) as permitted
  from (values ('anon'), ('authenticated')) as roles(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as permissions(privilege);

begin;
alter table public.aleph_defense_notes enable row level security;
revoke all on table public.aleph_defense_notes from public, anon, authenticated;
-- Remove old policies on this dedicated practice table only: permissive
-- policies combine with OR, so an older broad policy must not survive.
do $policies$
declare p record;
begin
  for p in select policyname from pg_policies
      where schemaname = 'public' and tablename = 'aleph_defense_notes' loop
    execute format('drop policy %I on public.aleph_defense_notes', p.policyname);
  end loop;
end $policies$;
grant select, insert, update, delete on table public.aleph_defense_notes to authenticated;
create policy aleph_owner_select on public.aleph_defense_notes
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy aleph_owner_insert on public.aleph_defense_notes
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy aleph_owner_update on public.aleph_defense_notes
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy aleph_owner_delete on public.aleph_defense_notes
  for delete to authenticated using ((select auth.uid()) = owner_id);
commit;

select 'after' as phase, grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'aleph_defense_notes'
    and grantee in ('PUBLIC', 'anon', 'authenticated') order by grantee, privilege_type;
select 'after' as phase, role_name, privilege,
    has_table_privilege(role_name, 'public.aleph_defense_notes', privilege) as permitted
  from (values ('anon'), ('authenticated')) as roles(role_name)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as permissions(privilege);
select relrowsecurity as rls_enabled from pg_class
  where oid = 'public.aleph_defense_notes'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies
  where schemaname = 'public' and tablename = 'aleph_defense_notes' order by policyname;
