-- 메모 입력 현황의 날짜별 완료 표시(claim_day_closes): 사람이 '완료'로 바꾼 날 (claim-day-done REQ-2805)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261030000100_precheck_counts.sql(그 앞의 precheck_settings 포함)이 들어가 있어야 한다
-- (hospitals 표, my_hospital_id() 함수). 함수는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 권한·정책은 거두고 다시 준다. 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다. 거꾸로 올려도 해는 없다
-- (표가 없으면 읽기는 완료 표시 없음으로 보고, [완료로 저장]만 E-DAYCLOSE-FAILED가 난다)
--
-- 칸은 병원·날짜·바꾼 시각뿐이다. 글자 칸이 없어 이름·차트번호·메모 글이 들어갈 수 없다(ADR-021).
-- 건수 표(claim_day_counts)와 묶지 않는다: 건수를 다시 올려도, 건수 줄이 없어도 완료 표시는 그대로다.
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 사용자(authenticated)만 자기 병원 줄을 보고 넣고 지운다.
-- 넣기는 visit_date 칸만(hospital_id는 DB 기본값, closed_at은 DB가 찍는 시각). 고치기 권한은 없다 → 처음 시각을 꾸밀 수 없다

create table if not exists public.claim_day_closes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  visit_date date not null,
  closed_at timestamptz not null default now(),
  primary key (hospital_id, visit_date)
);

alter table public.claim_day_closes enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.claim_day_closes from anon, authenticated;
grant select, delete on table public.claim_day_closes to authenticated;
-- 이미 있는 날은 on conflict do nothing으로 건너뛴다(고치기 권한 없이 된다)
grant insert (visit_date) on table public.claim_day_closes to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
drop policy if exists "승인된 내 병원 줄만" on public.claim_day_closes;
create policy "승인된 내 병원 줄만" on public.claim_day_closes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
