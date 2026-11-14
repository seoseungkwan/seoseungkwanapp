-- 통계 매출 칸의 날 단위 처방 금액: 표 sales_day_codes, sales_days.day_codes 칸, 저장 함수 save_revenue_range, 합계 함수 sales_code_totals
-- (specs/stats-revenue REQ-4103)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261101000400_revenue.sql이 들어가 있어야 한다(hospitals·sales_days 표, my_hospital_id() 함수).
-- 웹을 올리기 전에 붙인다. 안 붙이고 올리면 통계 매출 칸이 읽기 실패 카드를, [비트에서 불러오기]가 매출만 실패 상자를 보인다(통계는 그대로).
-- 두 번 붙여도 된다(표·칸은 없을 때만 만들고, 정책은 지우고 다시 만들고, 함수는 바꿔 쓴다. 이미 있던 줄은 그대로).
-- 공용 함수(my_hospital_id 등)는 만들지 않고 부르기만 한다. 옛 표 sales_codes(달 합계)·rx_groups는 건드리지 않는다.
--
-- 무엇을 왜: 도우미 0.6.0이 날마다 처방 코드별 건수·금액을 준다. 통계 기간(7일·30일·고른 기간)으로 치료별 매출을 세려고 날 단위로 둔다.
-- 칸은 병원·날·처방 코드·건수·금액·가져온 시각뿐이다. 환자 칸(이름·차트번호·접수 번호·주민번호)은 없다.
-- sales_days.day_codes: 그날 날 단위 처방 줄을 함께 저장했는지(옛 도우미로 읽은 날은 거짓 → 새 도우미로 다시 읽을 날).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)는 자기 병원 줄만 읽고·넣고·지운다.
-- 고치기는 없다(다시 저장할 때는 그 범위를 지우고 넣는다). hospital_id·fetched_at은 칸 권한이 없어 DB 기본값으로만 채워진다.
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
-- 두 함수는 부른 사람 권한(security invoker)으로 돌아 위 RLS·칸 권한이 그대로 지켜진다. search_path는 비우고 이름은 모두 public.으로 쓴다

create table if not exists public.sales_day_codes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  code text not null check (code ~ '^[0-9A-Za-z가-힣_.-]{1,30}$'),
  count integer not null check (count between 0 and 10000000),
  amount bigint check (amount >= 0),
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, day, code));

-- 이미 있던 날 줄은 거짓이 된다(날 단위 처방 줄 없음)
alter table public.sales_days add column if not exists day_codes boolean not null default false;

alter table public.sales_day_codes enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.sales_day_codes from anon, authenticated;
grant select, delete on table public.sales_day_codes to authenticated;
grant insert (day, code, count, amount) on table public.sales_day_codes to authenticated;
-- sales_days의 다른 권한(매출 migration)은 그대로 두고 새 칸만 더한다
grant insert (day_codes), update (day_codes) on table public.sales_days to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄도 맞지 않는다
drop policy if exists "내 병원 날 단위 처방 금액 읽기" on public.sales_day_codes;
create policy "내 병원 날 단위 처방 금액 읽기" on public.sales_day_codes
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 날 단위 처방 금액 넣기" on public.sales_day_codes;
create policy "내 병원 날 단위 처방 금액 넣기" on public.sales_day_codes
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 날 단위 처방 금액 지우기" on public.sales_day_codes;
create policy "내 병원 날 단위 처방 금액 지우기" on public.sales_day_codes
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

-- 덩어리 하나(31일까지) 저장. 한 트랜잭션이라 하나라도 어기면 raise exception으로 아무것도 안 바뀐다.
-- 차례: 범위 → 날 줄(배열·줄 수 = 날 수·모든 날이 범위 안) → 코드 줄(null이 아니면 배열·9,300줄 이하·모든 날이 범위 안)
--       → sales_days upsert(열다섯 칸 + day_codes = 코드 줄을 줬는지) → 그 범위 내 병원 코드 줄 지움 → 준 코드 줄 넣음.
-- 같은 날 날 줄 두 번은 upsert가('cannot affect row a second time'), 같은 날 같은 코드 두 번은 기본 키가 막는다.
-- 줄은 정해 둔 칸만 꺼낸다(hospital_id·fetched_at 열쇠가 있어도 쓰지 않는다). 칸 제약·RLS는 표가 지킨다
create or replace function public.save_revenue_range(p_from date, p_to date, p_days jsonb, p_day_codes jsonb)
  returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 31 then raise exception 'bad range'; end if;
  -- jsonb_typeof(null)은 null이라 따로 본다
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> p_to - p_from + 1 then
    raise exception 'bad days';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_days) as r(day date) where r.day is null or r.day < p_from or r.day > p_to) then
    raise exception 'bad days';
  end if;
  if p_day_codes is not null then
    if jsonb_typeof(p_day_codes) <> 'array' or jsonb_array_length(p_day_codes) > 9300 then raise exception 'bad day codes'; end if;
    if exists (select 1 from jsonb_to_recordset(p_day_codes) as c(day date) where c.day is null or c.day < p_from or c.day > p_to) then
      raise exception 'bad day codes';
    end if;
  end if;

  insert into public.sales_days (day, visits, new_patients, return_visits, total, insurer, noncovered, copay, other_total,
                                 cash, card, transfer, receivable_in, unconfirmed, split_unconfirmed, day_codes)
    select r.day, r.visits, r.new_patients, r.return_visits, r.total, r.insurer, r.noncovered, r.copay, r.other_total,
           r.cash, r.card, r.transfer, r.receivable_in, r.unconfirmed, r.split_unconfirmed, p_day_codes is not null
    from jsonb_to_recordset(p_days) as r(day date, visits integer, new_patients integer, return_visits integer, total bigint,
      insurer bigint, noncovered bigint, copay bigint, other_total bigint, cash bigint, card bigint, transfer bigint,
      receivable_in bigint, unconfirmed boolean, split_unconfirmed boolean)
  on conflict (hospital_id, day) do update set
    visits = excluded.visits, new_patients = excluded.new_patients, return_visits = excluded.return_visits,
    total = excluded.total, insurer = excluded.insurer, noncovered = excluded.noncovered, copay = excluded.copay,
    other_total = excluded.other_total, cash = excluded.cash, card = excluded.card, transfer = excluded.transfer,
    receivable_in = excluded.receivable_in, unconfirmed = excluded.unconfirmed, split_unconfirmed = excluded.split_unconfirmed,
    day_codes = excluded.day_codes;

  -- 옛 도우미(코드 줄 null)여도 지운다: day_codes 거짓과 '날 단위 줄 없음'이 늘 같게
  delete from public.sales_day_codes d where d.hospital_id = (select public.my_hospital_id()) and d.day between p_from and p_to;

  if p_day_codes is not null then
    insert into public.sales_day_codes (day, code, count, amount)
      select c.day, c.code, c.count, c.amount
      from jsonb_to_recordset(p_day_codes) as c(day date, code text, count integer, amount bigint);
  end if;
end $$;
revoke all on function public.save_revenue_range(date, date, jsonb, jsonb) from public, anon;
grant execute on function public.save_revenue_range(date, date, jsonb, jsonb) to authenticated;

-- 범위 안 내 병원 날 단위 줄을 코드마다 더한다: 건수 합 · 금액 합(null 뺌) · 금액이 빠진 줄이 있었는지. 코드 차례
create or replace function public.sales_code_totals(p_from date, p_to date)
  returns table (code text, count bigint, amount bigint, missing boolean) language sql stable security invoker set search_path = ''
as $$
  select d.code, sum(d.count)::bigint, coalesce(sum(d.amount), 0)::bigint, bool_or(d.amount is null)
  from public.sales_day_codes d where d.hospital_id = (select public.my_hospital_id()) and d.day between p_from and p_to
  group by d.code order by d.code
$$;
revoke all on function public.sales_code_totals(date, date) from public, anon;
grant execute on function public.sales_code_totals(date, date) to authenticated;
