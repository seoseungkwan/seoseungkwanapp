-- 수납일지 서버 표: 마감한 날 합계 숫자(sunap_days)·그날 지출(sunap_spends)·병원 설정(sunap_settings) (spec sunap-ilji REQ-4903)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261030000000_precheck_settings.sql(또는 my_hospital_id()를 만드는 다른 앞 migration)이
-- 들어가 있어야 한다(hospitals 표, my_hospital_id() 함수). 함수는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다. 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(표가 없으면 수납일지 마감·지출·설정 저장이 실패 글을 보인다).
--
-- 무엇을 왜: 장부(환자 이름·차트·고친 칸·비고)는 접수 PC 안(도우미 암호화 저장)에만 둔다. 서버에는 마감할 때 그날 합계 숫자 24칸만 오고,
-- 지출과 설정은 다른 기기(폰·도우미 없는 PC)도 보려고 둔다. 환자 칸(이름·차트번호·접수 번호·주민번호)은 없다.
-- 지출 내용은 앱이 개인정보 모양(전화·주민번호·메일)이면 보내지 않는다. DB는 길이·종류·금액만 막는다.
-- 묶음 칸(block_group·pt_group)은 통계 처방 묶음(stats_rx_groups) id지만 바깥 키를 두지 않는다(지워진 묶음 = 아직 안 고름).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)만 자기 병원 줄을 읽고 넣고 고치고 지운다
-- (설정은 지우기 없음). hospital_id·id·created_at은 칸 권한이 없어 DB가 정한다. 지출의 날짜(work_date)는 넣을 때만 정한다.
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다

-- 마감한 날 한 줄. 다시 마감하면 같은 줄을 덮어쓰고(upsert), 마감을 풀면 지운다
create table if not exists public.sunap_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  closed_at timestamptz not null default now(),
  late boolean not null default false, -- 처음 마감이 그날 뒤(한국 날짜)였음
  visits integer not null default 0 check (visits between 0 and 1000000000),
  first_n integer not null default 0 check (first_n between 0 and 1000000000),
  d90_n integer not null default 0 check (d90_n between 0 and 1000000000),
  ret_n integer not null default 0 check (ret_n between 0 and 1000000000),
  block_n integer not null default 0 check (block_n between 0 and 1000000000),
  pt_n integer not null default 0 check (pt_n between 0 and 1000000000),
  rsv_first integer not null default 0 check (rsv_first between 0 and 1000000000),
  rsv_d90 integer not null default 0 check (rsv_d90 between 0 and 1000000000),
  first_block integer not null default 0 check (first_block between 0 and 1000000000),
  d90_block integer not null default 0 check (d90_block between 0 and 1000000000),
  ret_block integer not null default 0 check (ret_block between 0 and 1000000000),
  cash_n integer not null default 0 check (cash_n between 0 and 1000000000),
  cash_won integer not null default 0 check (cash_won between 0 and 1000000000),
  card_n integer not null default 0 check (card_n between 0 and 1000000000),
  card_won integer not null default 0 check (card_won between 0 and 1000000000),
  transfer_n integer not null default 0 check (transfer_n between 0 and 1000000000),
  transfer_won integer not null default 0 check (transfer_won between 0 and 1000000000),
  paid_cash_n integer not null default 0 check (paid_cash_n between 0 and 1000000000),
  paid_cash_won integer not null default 0 check (paid_cash_won between 0 and 1000000000),
  paid_card_n integer not null default 0 check (paid_card_n between 0 and 1000000000),
  paid_card_won integer not null default 0 check (paid_card_won between 0 and 1000000000),
  free_n integer not null default 0 check (free_n between 0 and 1000000000),
  unpaid_n integer not null default 0 check (unpaid_n between 0 and 1000000000),
  unpaid_won integer not null default 0 check (unpaid_won between 0 and 1000000000),
  primary key (hospital_id, work_date)
);

-- 그날 지출 한 줄. 종류는 고정 넷: 현금·카드·기타·현금(주차지원)
create table if not exists public.sunap_spends (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('cash', 'card', 'etc', 'parking')),
  memo text not null check (char_length(memo) between 1 and 50),
  amount integer not null check (amount between 0 and 100000000),
  created_at timestamptz not null default now()
);
create index if not exists sunap_spends_day on public.sunap_spends (hospital_id, work_date);

-- 병원 설정 한 줄: Block·물리치료 묶음 id(안 골랐으면 null)와 예약 메모 말
create table if not exists public.sunap_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  block_group uuid,
  pt_group uuid,
  rsv_words jsonb not null default '{"inj": ["주사", "블록"], "visit": ["경과", "진료"], "etc": ["기타"]}'::jsonb
    check (jsonb_typeof(rsv_words) = 'object' and octet_length(rsv_words::text) < 4000)
);

alter table public.sunap_days enable row level security;
alter table public.sunap_spends enable row level security;
alter table public.sunap_settings enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.sunap_days from anon, authenticated;
revoke all on table public.sunap_spends from anon, authenticated;
revoke all on table public.sunap_settings from anon, authenticated;

-- 마감: 읽기·지우기(마감 풀기), 넣기·고치기는 hospital_id 뺀 칸. upsert가 보낸 칸을 모두 SET에 쓰니 work_date에도 고치기 권한이 있다
grant select, delete on table public.sunap_days to authenticated;
grant insert (
  work_date, closed_at, late,
  visits, first_n, d90_n, ret_n, block_n, pt_n, rsv_first, rsv_d90, first_block, d90_block, ret_block,
  cash_n, cash_won, card_n, card_won, transfer_n, transfer_won,
  paid_cash_n, paid_cash_won, paid_card_n, paid_card_won, free_n, unpaid_n, unpaid_won
), update (
  work_date, closed_at, late,
  visits, first_n, d90_n, ret_n, block_n, pt_n, rsv_first, rsv_d90, first_block, d90_block, ret_block,
  cash_n, cash_won, card_n, card_won, transfer_n, transfer_won,
  paid_cash_n, paid_cash_won, paid_card_n, paid_card_won, free_n, unpaid_n, unpaid_won
) on table public.sunap_days to authenticated;

-- 지출: 읽기·지우기, 넣기는 날짜·종류·내용·금액, 고치기는 종류·내용·금액(다른 날로 옮기지 않는다)
grant select, delete on table public.sunap_spends to authenticated;
grant insert (work_date, kind, memo, amount), update (kind, memo, amount) on table public.sunap_spends to authenticated;

-- 설정: 읽기, 넣기·고치기는 세 칸(지우기 없음)
grant select on table public.sunap_settings to authenticated;
grant insert (block_group, pt_group, rsv_words), update (block_group, pt_group, rsv_words) on table public.sunap_settings to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
drop policy if exists "승인된 내 병원 수납 마감만" on public.sunap_days;
create policy "승인된 내 병원 수납 마감만" on public.sunap_days
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "승인된 내 병원 수납 지출만" on public.sunap_spends;
create policy "승인된 내 병원 수납 지출만" on public.sunap_spends
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 수납 설정 읽기" on public.sunap_settings;
create policy "내 병원 수납 설정 읽기" on public.sunap_settings
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 수납 설정 넣기" on public.sunap_settings;
create policy "내 병원 수납 설정 넣기" on public.sunap_settings
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 수납 설정 고치기" on public.sunap_settings;
create policy "내 병원 수납 설정 고치기" on public.sunap_settings
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
