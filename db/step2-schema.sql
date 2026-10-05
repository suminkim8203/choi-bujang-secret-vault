-- 기존 2단계 생성 SQL의 구조·권한 부분입니다. 메모 행과 키 값은 포함하지 않습니다.
-- 이미 생성된 운영 DB에 다시 실행하지 않습니다. 이 파일 공개만으로 운영 설정을 증명하지 않습니다.
begin;
create table public.aleph_defense_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  content text not null check (char_length(content) between 1 and 5000),
  owner_id uuid,
  created_at timestamptz not null default now()
);
alter table public.aleph_defense_notes enable row level security;
revoke all on table public.aleph_defense_notes from public, anon, authenticated;
grant select on table public.aleph_defense_notes to service_role;
commit;
