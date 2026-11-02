-- 청구 사전점검 건수 DB: 날짜별 메모 수(claim_day_counts)·월말 마감 남은 일(claim_month_counts)·연락 남은 건수(contact_counts)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261030000000_precheck_settings.sql이 들어가 있어야 한다(hospitals 표, my_hospital_id()·touch_updated_at() 함수). 두 함수는 여기서 다시 만들지 않는다.
--
-- 칸은 uuid(병원)·date·integer·timestamptz뿐이다. 글자 칸이 없어 실수로도 이름·차트번호·메모 글이 들어갈 수 없다(ADR-021).
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 사용자(authenticated)만 자기 병원 줄을 보고 고친다. 지우기는 없다.
-- hospital_id는 DB 기본값으로만 들어가고(열 권한 없음), updated_at은 트리거로만 바뀐다

-- visits는 그 줄을 올릴 때 비트(claim.dates)가 준 그 날 진료 수다. 날짜 목록이 지금 진료 수와 견주어 오후에 온 환자를 놓치지 않게 한다
create table public.claim_day_counts (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  visit_date date not null,
  visits int not null check (visits between 0 and 100000),
  need_memo int not null check (need_memo between 0 and 100000),
  entered int not null check (entered between 0 and need_memo),
  needs_check int not null check (needs_check between 0 and 100000),
  skipped int not null check (skipped between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, visit_date)
);

-- claim_month는 그 달 1일이다. TASK-22가 쓴다
create table public.claim_month_counts (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  claim_month date not null check (extract(day from claim_month) = 1),
  incomplete int not null check (incomplete between 0 and 100000),
  missing int not null check (missing between 0 and 100000),
  flagged int not null check (flagged between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, claim_month)
);

-- 병원마다 한 줄이다. TASK-26이 쓴다
create table public.contact_counts (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  followup_left int not null check (followup_left between 0 and 100000),
  injection_left int not null check (injection_left between 0 and 100000),
  updated_at timestamptz not null default now()
);

create trigger claim_day_counts_touch before update on public.claim_day_counts
  for each row execute function public.touch_updated_at();
create trigger claim_month_counts_touch before update on public.claim_month_counts
  for each row execute function public.touch_updated_at();
create trigger contact_counts_touch before update on public.contact_counts
  for each row execute function public.touch_updated_at();

alter table public.claim_day_counts enable row level security;
alter table public.claim_month_counts enable row level security;
alter table public.contact_counts enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.claim_day_counts, public.claim_month_counts, public.contact_counts from anon, authenticated;

-- 넣기·고치기는 칸 단위: hospital_id·updated_at은 뺀다(남의 병원으로 쓰지 못하게, 바꾼 날을 꾸미지 못하게)
grant select on table public.claim_day_counts, public.claim_month_counts, public.contact_counts to authenticated;
grant insert (visit_date, visits, need_memo, entered, needs_check, skipped), update (visit_date, visits, need_memo, entered, needs_check, skipped) on table public.claim_day_counts to authenticated;
grant insert (claim_month, incomplete, missing, flagged), update (claim_month, incomplete, missing, flagged) on table public.claim_month_counts to authenticated;
grant insert (followup_left, injection_left), update (followup_left, injection_left) on table public.contact_counts to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
create policy "승인된 내 병원 줄만" on public.claim_day_counts
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "승인된 내 병원 줄만" on public.claim_month_counts
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "승인된 내 병원 줄만" on public.contact_counts
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
