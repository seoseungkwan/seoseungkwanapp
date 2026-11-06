-- 업무일지 현금 시재 (worklog-cash-float REQ-1602): 그날 센 장수·그날 시재·환불/미수입금 현금 표시·차이 이유, 병원 시재 설정
-- 실행: 운영자가 Supabase SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 0100(업무일지)·0110(비트 칸 표시)·0200(업무사항 글씨 크기)이 먼저 들어가 있어야 한다.
-- 관문: 새 화면부터 읽기가 이 칸들을 고른다. 이 파일을 붙여 넣기 전에는 새 화면을 사이트에 올리지 않는다(붙여 넣는 것은 지금 사이트에 해가 없다).
-- 칸끼리 묶는 제약은 두지 않는다: upsert는 충돌 전에 넣을 줄을 검사해 장수만 보낸 저장이 거부된다. 두 번 붙여 넣어도 그대로다

-- 1) 업무일지 하루 줄에 시재 12칸. 장수는 권종마다 0~9999장, 그날 시재는 처음 장수를 적을 때의 설정 금액(없으면 아직 안 셈).
--    이미 있던 줄은 장수 0·시재 없음·확인란 꺼짐·이유 없음이 된다. 칸이 이미 있으면 건너뛴다.
--    정책(my_hospital_id())·다른 칸·공용 함수는 그대로다. 금액·합계는 저장하지 않고 화면이 계산한다
alter table public.worklog_days
  add column if not exists cash_count_50000 integer not null default 0 check (cash_count_50000 between 0 and 9999),
  add column if not exists cash_count_10000 integer not null default 0 check (cash_count_10000 between 0 and 9999),
  add column if not exists cash_count_5000 integer not null default 0 check (cash_count_5000 between 0 and 9999),
  add column if not exists cash_count_1000 integer not null default 0 check (cash_count_1000 between 0 and 9999),
  add column if not exists cash_count_500 integer not null default 0 check (cash_count_500 between 0 and 9999),
  add column if not exists cash_count_100 integer not null default 0 check (cash_count_100 between 0 and 9999),
  add column if not exists cash_count_50 integer not null default 0 check (cash_count_50 between 0 and 9999),
  add column if not exists cash_count_10 integer not null default 0 check (cash_count_10 between 0 and 9999),
  add column if not exists cash_float integer check (cash_float between 0 and 10000000),
  add column if not exists cash_refund_cash boolean not null default false,
  add column if not exists cash_unpaid_cash boolean not null default false,
  add column if not exists cash_reason text check (char_length(cash_reason) between 1 and 200);

-- 읽기는 표 권한(select)에 이미 들어 있다. upsert가 보낸 칸을 모두 SET에 쓰니 넣기·고치기 둘 다 준다
grant insert (
  cash_count_50000, cash_count_10000, cash_count_5000, cash_count_1000,
  cash_count_500, cash_count_100, cash_count_50, cash_count_10,
  cash_float, cash_refund_cash, cash_unpaid_cash, cash_reason
), update (
  cash_count_50000, cash_count_10000, cash_count_5000, cash_count_1000,
  cash_count_500, cash_count_100, cash_count_50, cash_count_10,
  cash_float, cash_refund_cash, cash_unpaid_cash, cash_reason
) on table public.worklog_days to authenticated;

-- 2) 병원 업무일지 설정 한 줄: 시재 금액(원). 줄이 없는 병원은 앱이 300,000원으로 본다.
--    병원 id는 DB 기본값으로만 채워진다(칸 권한 없음). 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
--    지우기 권한은 아무에게도 없다(정책이 for all이어도 표 권한이 없으면 거부된다). 저장 시각 칸·방아쇠는 없다(업무일지와 같게)
create table if not exists public.worklog_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  cash_float integer not null default 300000 check (cash_float between 0 and 10000000)
);

alter table public.worklog_settings enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.worklog_settings from anon, authenticated;
grant select on table public.worklog_settings to authenticated;
grant insert (cash_float), update (cash_float) on table public.worklog_settings to authenticated;

-- 다시 붙여 넣어도 되게 있던 정책을 지우고 다시 만든다. (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장)
drop policy if exists "승인된 내 병원 줄만" on public.worklog_settings;
create policy "승인된 내 병원 줄만" on public.worklog_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
