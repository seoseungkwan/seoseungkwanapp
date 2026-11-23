-- 입지 분석 승하차 저장(location_flow_cache): 같은 병원·시군구·달의 정류장별 이용량 한 달 줄을 한 번 받아 두고 다음 모으기가 쓴다
-- (spec location REQ-7902 AC-7902.6 · REQ-7908 AC-7908.5, design.md 4·7절, TASK-97 — 2026-11-23 다시 받기를 거듭해 하루 1,000번을 다 씀).
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261122000000_location.sql(입지 분석 표 여섯)이 들어가 있어야 한다. my_hospital_id()는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 원장(my_hospital_id())이면서 관리자(admins에 자기 줄)인 사람만
-- 자기 병원 줄을 읽고 넣는다. 고치기·지우기는 없다(지난 달 자료는 바뀌지 않는다. 병원을 지우면 함께 지워진다).
-- 담는 것은 공공데이터(국토교통부 정류장별 이용량)의 정류장 ID마다 한 달 승차·하차·날 수뿐이다. 환자·카카오 자료는 없다.

create table if not exists public.location_flow_cache (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  sgg text not null check (sgg ~ '^[0-9]{5}$'),
  ym text not null check (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  as_of date not null,
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and octet_length(rows::text) <= 1000000),
  created_at timestamptz not null default now(),
  primary key (hospital_id, sgg, ym)
);

alter table public.location_flow_cache enable row level security;

-- Supabase가 새 표에 준 기본 권한을 먼저 모두 거두고 읽기·값 칸 넷 넣기만 다시 준다
revoke all on table public.location_flow_cache from public, anon, authenticated;
grant select on table public.location_flow_cache to authenticated;
grant insert (sgg, ym, as_of, rows) on table public.location_flow_cache to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장 전용 my_hospital_id()와 admins의 내 줄을 함께 본다
drop policy if exists "내 병원 입지 승하차 저장(관리자)" on public.location_flow_cache;
create policy "내 병원 입지 승하차 저장(관리자)" on public.location_flow_cache
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
