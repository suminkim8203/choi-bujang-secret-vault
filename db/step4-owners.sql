-- Replace both placeholders only in the official Supabase SQL Editor.
-- Never save the filled-in account identifiers to Git or submission files.
-- Preserve all four existing fictional seed rows: A gets three and B gets one.
begin;
do $owners$
declare
  email_a text := 'REPLACE_A_EMAIL';
  email_b text := 'REPLACE_B_EMAIL';
  user_a uuid;
  user_b uuid;
begin
  if email_a = 'REPLACE_A_EMAIL' or email_b = 'REPLACE_B_EMAIL'
      or lower(email_a) = lower(email_b) then
    raise exception 'Replace both placeholders with distinct practice accounts';
  end if;
  select id into strict user_a from auth.users where lower(email) = lower(email_a);
  select id into strict user_b from auth.users where lower(email) = lower(email_b);
  if user_a = user_b then raise exception 'Practice accounts must be distinct'; end if;
  if (select count(*) from public.aleph_defense_notes where id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid)) <> 4 then
    raise exception 'Expected four existing fictional seed rows';
  end if;
  if exists (select 1 from public.aleph_defense_notes where id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid)
      and owner_id is not null and owner_id <> case
        when id = '00000000-0000-4000-8000-000000000004'::uuid then user_b else user_a end) then
    raise exception 'Seed owner differs; inspect before reassigning';
  end if;
  update public.aleph_defense_notes set owner_id = case
      when id = '00000000-0000-4000-8000-000000000004'::uuid then user_b else user_a end
    where id in (
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid,
      '00000000-0000-4000-8000-000000000004'::uuid);
end $owners$;
select case when id = '00000000-0000-4000-8000-000000000004'::uuid then 'B' else 'A' end
    as practice_account, count(*) as seed_rows, bool_and(owner_id is not null) as owner_assigned
  from public.aleph_defense_notes where id in (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000002'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid)
  group by 1 order by 1;
commit;
