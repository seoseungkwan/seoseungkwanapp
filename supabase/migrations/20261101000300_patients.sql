-- 환자 탭 서버 표: 문자 문구(message_templates)·연락 남은 건수(contact_counts), RLS, 공용 함수 둘
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 실행한다(앱·CLI는 실행하지 않는다).
-- auth migration(20261028000000_auth.sql)이 먼저 들어가 있어야 한다. 붙여 넣는 때는 사용자 OK 뒤다.
-- 파일 이름은 cross-branch 규칙 C2로 정해 둔 것이다(20261101000300_patients.sql)
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)는 자기 병원 줄만 읽고,
-- 정해 둔 칸만 넣고 고친다(문구는 지우기도). 병원 id는 DB 기본값으로만 채워진다(칸 권한 없음).
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
-- contact_counts는 병원마다 한 줄, 정수 둘과 바뀐 시각뿐이다. 환자 정보가 글자로 섞이지 않게 글자·jsonb 칸을 두지 않는다(ADR-021)
--
-- 두 번 실행해도 된다. 같은 함수를 업무일지·통계·매출·precheck migration이 함께 쓴다(C1).
-- 그래서 create or replace이고 글이 갈래마다 글자까지 같다. 함수 줄은 고치지 않는다

create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('injection', 'followup')),
  name text not null check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 2000),
  sort_order int not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_counts (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  followup_left int not null check (followup_left between 0 and 100000),
  injection_left int not null check (injection_left between 0 and 100000),
  updated_at timestamptz not null default now()
);

alter table public.message_templates enable row level security;
alter table public.contact_counts enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.message_templates, public.contact_counts from anon, authenticated;
-- 칸 단위: id·hospital_id·updated_at은 빠진다(기본값과 트리거로만)
grant select, delete on table public.message_templates to authenticated;
grant insert (kind, name, body, sort_order) on table public.message_templates to authenticated;
grant update (kind, name, body, sort_order) on table public.message_templates to authenticated;
grant select on table public.contact_counts to authenticated;
grant insert (followup_left, injection_left) on table public.contact_counts to authenticated;
grant update (followup_left, injection_left) on table public.contact_counts to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장)
drop policy if exists "내 병원 문구 읽기" on public.message_templates;
create policy "내 병원 문구 읽기" on public.message_templates
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 문구 넣기" on public.message_templates;
create policy "내 병원 문구 넣기" on public.message_templates
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 문구 고치기" on public.message_templates;
create policy "내 병원 문구 고치기" on public.message_templates
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 문구 지우기" on public.message_templates;
create policy "내 병원 문구 지우기" on public.message_templates
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 건수 읽기" on public.contact_counts;
create policy "내 병원 건수 읽기" on public.contact_counts
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 건수 넣기" on public.contact_counts;
create policy "내 병원 건수 넣기" on public.contact_counts
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 건수 고치기" on public.contact_counts;
create policy "내 병원 건수 고치기" on public.contact_counts
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop trigger if exists message_templates_touch_updated_at on public.message_templates;
create trigger message_templates_touch_updated_at
  before update on public.message_templates
  for each row execute function public.touch_updated_at();

drop trigger if exists contact_counts_touch_updated_at on public.contact_counts;
create trigger contact_counts_touch_updated_at
  before update on public.contact_counts
  for each row execute function public.touch_updated_at();
