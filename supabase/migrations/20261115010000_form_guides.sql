-- 서식 탭 환자 안내문(form_guides) (spec forms-guide REQ-4508)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 환자 안내문의 저장·목록만 오류를 보인다.
--
-- 왜: 만든 환자 안내문(접수대·대기실에 붙이는 A4 한 장)을 휴대폰과 컴퓨터에서 같이 보고 다시 고치려고 계정에 둔다.
-- 머리표·제목·큰 문구·상자·그림 이름·줄·작은 글뿐이고 환자 칸은 없다. 안 모양(열쇠·글자 길이·개인정보 모양·배치)은
-- 앱이 checkGuideValue로 저장 전·읽은 뒤에 본다. DB는 객체인지·크기(4,000바이트)만 막는다(휴진 안내와 같은 까닭).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 고치고 지운다.
-- hospital_id·id·created_at·updated_at은 칸 권한이 없어 DB가 정한다. updated_at은 고칠 때마다 트리거가 지금 시각으로 바꾼다.
-- 다른 갈래의 함수(touch_updated_at, 휴진 안내의 트리거 함수 등)는 만들지도 부르지도 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.form_guides (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 트리거만 부른다
create function public.form_guides_touch() returns trigger language plpgsql security invoker set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.form_guides_touch() from public, anon, authenticated;
create trigger form_guides_updated_at before update on public.form_guides for each row execute function public.form_guides_touch();

alter table public.form_guides enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.form_guides from public, anon, authenticated;
grant select, delete on table public.form_guides to authenticated;
grant insert (content), update (content) on table public.form_guides to authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 환자 안내문 읽기" on public.form_guides
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 환자 안내문 넣기" on public.form_guides
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 환자 안내문 고치기" on public.form_guides
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 환자 안내문 지우기" on public.form_guides
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
