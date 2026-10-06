-- Stage 3: only the existing server role may write fictional practice notes.
-- Existing rows, columns, owner_id and the absence of an auth.users FK are preserved.
begin;
alter table public.aleph_defense_notes enable row level security;
revoke all on table public.aleph_defense_notes from public, anon, authenticated;
grant select, insert, update, delete on table public.aleph_defense_notes to service_role;
commit;
