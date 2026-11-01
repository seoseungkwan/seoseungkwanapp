-- 업무일지 하루 표(worklog_days), RLS, 공용 함수 my_hospital_id()
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- auth migration(20261028000000_auth.sql)이 먼저 들어가 있어야 한다. 붙여 넣는 때는 사용자 OK 뒤다
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)는 자기 병원 줄만 읽고,
-- 날짜와 값 32칸만 넣고 고친다. 병원 id는 DB 기본값으로만 채워진다(칸 권한 없음).
-- 지우기 권한은 아무에게도 없다(화면에 지우기가 없고, 빈 칸으로 저장하면 된다).
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
-- 숫자 칸은 글자 칸이고 DB는 길이만 본다. 합계는 저장하지 않고 화면이 낸다. 업무사항은 memo 칸에 둔다.
-- 고친 사람·시각은 남기지 않는다(저장 시각 칸·방아쇠 없음)

-- 공용 함수: 갈래마다 글자 그대로 같다(cross-branch C1). 어느 갈래가 먼저 들어가도 된다. 고치지 않는다
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.worklog_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  -- 인원(글자)
  new_patients text check (char_length(new_patients) between 1 and 50),
  return_patients text check (char_length(return_patients) between 1 and 50),
  -- 수입(글자)
  total_fee text check (char_length(total_fee) between 1 and 50),
  claim_amount text check (char_length(claim_amount) between 1 and 50),
  cash_in text check (char_length(cash_in) between 1 and 50),
  card_in text check (char_length(card_in) between 1 and 50),
  transfer_in text check (char_length(transfer_in) between 1 and 50),
  local_currency_in text check (char_length(local_currency_in) between 1 and 50),
  unpaid_new text check (char_length(unpaid_new) between 1 and 50),
  unpaid_paid text check (char_length(unpaid_paid) between 1 and 50),
  -- 지출(글자)
  spend_cash text check (char_length(spend_cash) between 1 and 50),
  spend_card text check (char_length(spend_card) between 1 and 50),
  spend_refund text check (char_length(spend_refund) between 1 and 50),
  spend_free text check (char_length(spend_free) between 1 and 50),
  -- 비고
  note_cash text check (char_length(note_cash) between 1 and 100),
  note_card text check (char_length(note_card) between 1 and 100),
  note_refund text check (char_length(note_refund) between 1 and 100),
  note_free text check (char_length(note_free) between 1 and 100),
  note_total text check (char_length(note_total) between 1 and 100),
  -- 업무사항
  memo text check (char_length(memo) between 1 and 2000),
  -- 항목 이름(금액 칸마다 하나, 그날만)
  name_total_fee text check (char_length(name_total_fee) between 1 and 20),
  name_claim_amount text check (char_length(name_claim_amount) between 1 and 20),
  name_cash_in text check (char_length(name_cash_in) between 1 and 20),
  name_card_in text check (char_length(name_card_in) between 1 and 20),
  name_transfer_in text check (char_length(name_transfer_in) between 1 and 20),
  name_local_currency_in text check (char_length(name_local_currency_in) between 1 and 20),
  name_unpaid_new text check (char_length(name_unpaid_new) between 1 and 20),
  name_unpaid_paid text check (char_length(name_unpaid_paid) between 1 and 20),
  name_spend_cash text check (char_length(name_spend_cash) between 1 and 20),
  name_spend_card text check (char_length(name_spend_card) between 1 and 20),
  name_spend_refund text check (char_length(name_spend_refund) between 1 and 20),
  name_spend_free text check (char_length(name_spend_free) between 1 and 20),
  primary key (hospital_id, work_date)
);

alter table public.worklog_days enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.worklog_days from anon, authenticated;
grant select on table public.worklog_days to authenticated;
-- 칸 단위: hospital_id는 빠진다. upsert가 보낸 칸을 모두 SET에 쓰니 work_date에도 고치기 권한이 있다
grant insert (
  work_date,
  new_patients, return_patients,
  total_fee, claim_amount, cash_in, card_in, transfer_in, local_currency_in, unpaid_new, unpaid_paid,
  spend_cash, spend_card, spend_refund, spend_free,
  note_cash, note_card, note_refund, note_free, note_total,
  memo,
  name_total_fee, name_claim_amount, name_cash_in, name_card_in, name_transfer_in, name_local_currency_in, name_unpaid_new, name_unpaid_paid,
  name_spend_cash, name_spend_card, name_spend_refund, name_spend_free
) on table public.worklog_days to authenticated;
grant update (
  work_date,
  new_patients, return_patients,
  total_fee, claim_amount, cash_in, card_in, transfer_in, local_currency_in, unpaid_new, unpaid_paid,
  spend_cash, spend_card, spend_refund, spend_free,
  note_cash, note_card, note_refund, note_free, note_total,
  memo,
  name_total_fee, name_claim_amount, name_cash_in, name_card_in, name_transfer_in, name_local_currency_in, name_unpaid_new, name_unpaid_paid,
  name_spend_cash, name_spend_card, name_spend_refund, name_spend_free
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
