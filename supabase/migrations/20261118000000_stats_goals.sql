-- 통계 요약 '이번 달 목표'(stats_goals): 병원·달마다 내원·신환·매출 목표 숫자 (stats-insights REQ-6102 AC-6102.1)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다(hospitals 표). 사이트에 올리기 전에 붙인다.
-- 안 붙이고 새 웹을 올리면 통계 요약의 '이번 달 목표' 칸만 읽기 실패 카드를 보이고 다른 칸은 그대로다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 권한·정책은 거두고 다시 준다. 이미 있던 줄은 그대로).
--
-- 칸은 병원·달('YYYY-MM')·세 숫자뿐이다. 글자 칸은 달 하나라 이름·차트번호·메모가 들어갈 수 없다(집계 숫자만).
-- 세 숫자는 비울 수 있다(null = 그 지표 목표 없음). 셋 다 빈 줄은 두지 않는다(앱이 그 줄을 지우고, CHECK도 막는다).
-- 내원·신환은 0~1,000,000명, 매출은 0~100,000,000,000원.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)만 자기 병원 줄을 읽고 넣고 고치고 지운다.
-- 넣기·고치기는 달·세 숫자 칸만 된다(hospital_id는 DB 기본값 my_hospital_id()) → 남의 병원 줄을 만들거나 내 줄의 병원을 바꿀 수 없다.
-- my_hospital_id()만 C1 글자 그대로 다시 만든다. 다른 함수·트리거는 만들지 않는다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table if not exists public.stats_goals (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  visits integer check (visits between 0 and 1000000),
  new_patients integer check (new_patients between 0 and 1000000),
  revenue bigint check (revenue between 0 and 100000000000),
  check (visits is not null or new_patients is not null or revenue is not null),
  primary key (hospital_id, month)
);

alter table public.stats_goals enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_goals from public, anon, authenticated;
grant select, delete on table public.stats_goals to authenticated;
-- PostgREST upsert는 보낸 칸 모두를 DO UPDATE SET에 넣는다 — 열쇠 칸 month도. 그래서 update에도 준다
grant insert (month, visits, new_patients, revenue), update (month, visits, new_patients, revenue) on table public.stats_goals to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다. 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
drop policy if exists "승인된 내 병원 목표만" on public.stats_goals;
create policy "승인된 내 병원 목표만" on public.stats_goals
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
