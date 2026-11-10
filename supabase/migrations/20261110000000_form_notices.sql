-- 서식 탭 휴진 안내문(form_notices) (spec forms REQ-3508)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 서식 탭의 저장·목록만 오류를 보인다.
--
-- 왜: 만든 안내문을 휴대폰과 컴퓨터에서 같이 보고 다시 고치려고 계정에 둔다.
-- 연·월·카드(날짜·이름·상태)·테마뿐이고 환자 칸은 없다. 카드 안 모양(열쇠·글자 길이·개인정보 모양)은 앱이 checkNotice로
-- 저장 전·읽은 뒤에 본다. DB는 배열인지·장수(1~4)·크기(4,000바이트)만 막는다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 고치고 지운다.
-- hospital_id·id·kind·created_at·updated_at은 칸 권한이 없어 DB가 정한다. updated_at은 고칠 때마다 트리거가 지금 시각으로 바꾼다.
-- 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.form_notices (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null default 'closure' check (kind = 'closure'),
  year smallint not null check (year between 2020 and 2100),
  month smallint not null check (month between 1 and 12),
  cards jsonb not null check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 4 and octet_length(cards::text) <= 4000),
  theme text check (theme ~ '^[a-z0-9-]{1,32}$'),   -- null = 테마를 저절로 고른다
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 트리거만 부른다
create function public.form_notices_touch() returns trigger language plpgsql security invoker set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.form_notices_touch() from public, anon, authenticated;
create trigger form_notices_updated_at before update on public.form_notices for each row execute function public.form_notices_touch();

alter table public.form_notices enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.form_notices from public, anon, authenticated;
grant select, delete on table public.form_notices to authenticated;
grant insert (year, month, cards, theme), update (year, month, cards, theme) on table public.form_notices to authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 안내문 읽기" on public.form_notices
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 안내문 넣기" on public.form_notices
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 안내문 고치기" on public.form_notices
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 안내문 지우기" on public.form_notices
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
