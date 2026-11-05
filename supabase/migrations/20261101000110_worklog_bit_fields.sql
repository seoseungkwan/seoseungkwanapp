-- 업무일지 비트 칸 표시(bit_fields): 그날 어느 칸이 비트에서 불러온 숫자인지 적어 둔다 (worklog REQ-015, design.md 20-4절)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 업무일지 migration(20261101000100_worklog.sql)이 먼저 들어가 있어야 한다. 붙여 넣는 때는 사용자 OK 뒤다.
-- 관문: 업무일지 4단계부터 읽기·쓰기가 이 칸을 쓴다. 이 파일을 붙여 넣기 전에는 4단계를 main에 합치거나 배포하지 않는다
--
-- 칸 하나와 그 칸의 넣기·고치기 권한만 더한다. 정책(my_hospital_id())·다른 칸·공용 함수는 그대로다.
-- 이미 있던 줄은 빈 목록 '{}'이 된다. 칸이 이미 있으면 건너뛰므로 두 번 붙여 넣어도 그대로다.
-- 받는 이름은 비트가 채울 수 있는 숫자 칸(DB 칸 이름) 열 개뿐이다. 지금 채우지 않는 미수발생·지역화폐도 나중 계약을 위해 받는다.
-- 지출·비고·업무사항·항목 이름은 손으로만 적으므로 받지 않는다

alter table public.worklog_days add column if not exists bit_fields text[] not null default '{}'
  check (bit_fields <@ array[
    'new_patients', 'return_patients',
    'total_fee', 'claim_amount', 'cash_in', 'card_in', 'transfer_in', 'local_currency_in', 'unpaid_new', 'unpaid_paid'
  ]::text[]);

-- 읽기는 표 권한(select)에 이미 들어 있다. upsert가 보낸 칸을 모두 SET에 쓰니 넣기·고치기 둘 다 준다
grant insert (bit_fields), update (bit_fields) on table public.worklog_days to authenticated;
