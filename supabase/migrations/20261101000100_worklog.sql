-- 업무일지 하루 숫자 표(worklog_days), RLS, 공용 함수 둘
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- auth migration(20261028000000_auth.sql)이 먼저 들어가 있어야 한다. 붙여 넣는 때는 사용자 OK 뒤다
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)는 자기 병원 줄만 읽고,
-- 날짜와 값 19칸만 넣고 고친다. 병원 id는 DB 기본값으로만 채워지고, updated_at은 기본값·방아쇠로만 바뀐다(칸 권한 없음).
-- 지우기 권한은 아무에게도 없다(화면에 지우기가 없고, 빈 칸으로 저장하면 된다).
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다. 업무사항 칸은 없다(그 PC 브라우저에만 둔다)

-- 공용 함수 둘: 갈래마다 글자 그대로 같다(cross-branch C1). 어느 갈래가 먼저 들어가도 된다. 고치지 않는다
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

create table public.worklog_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  -- 인원
  new_patients integer check (new_patients between 0 and 99999),
  return_patients integer check (return_patients between 0 and 99999),
  -- 수입(원)
  total_fee bigint check (total_fee between 0 and 999999999999),
  claim_amount bigint check (claim_amount between 0 and 999999999999),
  cash_in bigint check (cash_in between 0 and 999999999999),
  card_in bigint check (card_in between 0 and 999999999999),
  transfer_in bigint check (transfer_in between 0 and 999999999999),
  local_currency_in bigint check (local_currency_in between 0 and 999999999999),
  unpaid_new bigint check (unpaid_new between 0 and 999999999999),
  unpaid_paid bigint check (unpaid_paid between 0 and 999999999999),
  -- 지출(원)
  spend_cash bigint check (spend_cash between 0 and 999999999999),
  spend_card bigint check (spend_card between 0 and 999999999999),
  spend_refund bigint check (spend_refund between 0 and 999999999999),
  spend_free bigint check (spend_free between 0 and 999999999999),
  -- 비고
  note_cash text check (char_length(note_cash) between 1 and 100),
  note_card text check (char_length(note_card) between 1 and 100),
  note_refund text check (char_length(note_refund) between 1 and 100),
  note_free text check (char_length(note_free) between 1 and 100),
  note_total text check (char_length(note_total) between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, work_date)
);

alter table public.worklog_days enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.worklog_days from anon, authenticated;
grant select on table public.worklog_days to authenticated;
-- 칸 단위: hospital_id·updated_at은 빠진다. upsert가 보낸 칸을 모두 SET에 쓰니 work_date에도 고치기 권한이 있다
grant insert (
  work_date,
  new_patients, return_patients,
  total_fee, claim_amount, cash_in, card_in, transfer_in, local_currency_in, unpaid_new, unpaid_paid,
  spend_cash, spend_card, spend_refund, spend_free,
  note_cash, note_card, note_refund, note_free, note_total
) on table public.worklog_days to authenticated;
grant update (
  work_date,
  new_patients, return_patients,
  total_fee, claim_amount, cash_in, card_in, transfer_in, local_currency_in, unpaid_new, unpaid_paid,
  spend_cash, spend_card, spend_refund, spend_free,
  note_cash, note_card, note_refund, note_free, note_total
) on table public.worklog_days to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장)
create policy "내 병원 하루 읽기" on public.worklog_days
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 하루 넣기" on public.worklog_days
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 하루 고치기" on public.worklog_days
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

-- 방아쇠로 불릴 때는 실행 권한을 보지 않는다
create trigger worklog_days_updated_at before update on public.worklog_days
  for each row execute function public.touch_updated_at();
