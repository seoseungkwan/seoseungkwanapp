-- 확인 필요한 날의 참고 금액: sales_days.rough_total 칸과 그 CHECK·칸 권한, 저장 함수 save_revenue_range가 그 칸도 저장
-- (specs/first90 REQ-4406)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261101000400_revenue.sql과 20261114000000_sales_day_codes.sql이 들어가 있어야 한다(sales_days 표·day_codes 칸, save_revenue_range 함수).
-- 웹을 올리기 전에 붙인다. 안 붙이고 새 웹을 올리면 rough_total 칸이 없어 통계 매출 칸이 읽기 실패 카드를, [비트에서 불러오기]가 매출만 실패 상자를 보인다(통계는 그대로).
-- 두 번 붙여도 된다(칸은 없을 때만 더하고, 제약은 지우고 다시 만들고, 함수는 바꿔 쓴다. 이미 있던 줄은 그대로).
-- 공용 함수(my_hospital_id 등)는 만들지 않고 부르기만 한다. 표·정책은 새로 만들지 않고 다른 칸 권한도 건드리지 않는다.
--
-- 무엇을 왜: 도우미 0.7.0이 확인 필요한 날(unconfirmed)에 참고 금액(roughTotal)을 준다. 원장님별 매출과 같은 기준
-- (그날 정상수납 + 미수입금 줄 총진료비 합, 줄마다 원 미만 버림)이고 환불은 음수 그대로라 음수일 수 있다.
-- 그날 금액(total)은 여전히 비어 있고, 화면은 '참고 금액 포함'을 켤 때만 더한다. 그래서 참고 금액은 total이 빈 날에만 둔다(CHECK).
-- 이미 있던 날 줄은 null이 된다(참고 금액 모름 → 새 도우미로 한 번 다시 읽을 날). 환자 칸은 더하지 않는다.
--
-- 권한: 칸 권한은 rough_total 넣기·고치기만 더한다. RLS·정책은 그대로라 승인된 병원 사용자는 자기 병원 줄만, anon은 아무것도 못 한다.
-- 저장 함수는 부른 사람 권한(security invoker)으로 돌아 RLS·칸 권한이 그대로 지켜진다. search_path는 비우고 이름은 모두 public.으로 쓴다

-- 이미 있던 줄은 null(참고 금액 모름). 금액은 원 단위 정수
alter table public.sales_days add column if not exists rough_total bigint;

-- 참고 금액은 그날 금액(total)이 빈 날(확인 필요한 날)에만 둔다. 지우고 다시 만들어 두 번 붙여도 같다
alter table public.sales_days drop constraint if exists sales_days_rough_total_check;
alter table public.sales_days add constraint sales_days_rough_total_check check (rough_total is null or total is null);

-- 매출·날 단위 처방 migration의 칸 권한은 그대로 두고 새 칸만 더한다(upsert가 고치기로도 쓰므로 둘 다)
grant insert (rough_total), update (rough_total) on table public.sales_days to authenticated;

-- 지금 함수(20261114000000_sales_day_codes.sql) 글에 rough_total만 더했다. 덩어리 하나(31일까지) 저장. 한 트랜잭션이라 하나라도 어기면 raise exception으로 아무것도 안 바뀐다.
-- 차례: 범위 → 날 줄(배열·줄 수 = 날 수·모든 날이 범위 안) → 코드 줄(null이 아니면 배열·9,300줄 이하·모든 날이 범위 안)
--       → sales_days upsert(열다섯 칸 + day_codes = 코드 줄을 줬는지 + rough_total) → 그 범위 내 병원 코드 줄 지움 → 준 코드 줄 넣음.
-- rough_total 열쇠가 없는 날 줄(옛 웹·확인된 날)은 null로 저장한다(다시 저장하면 옛 참고 금액도 null로 바뀐다). 확인된 날에 값이 오면 CHECK가 막는다.
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
                                 cash, card, transfer, receivable_in, unconfirmed, split_unconfirmed, day_codes, rough_total)
    select r.day, r.visits, r.new_patients, r.return_visits, r.total, r.insurer, r.noncovered, r.copay, r.other_total,
           r.cash, r.card, r.transfer, r.receivable_in, r.unconfirmed, r.split_unconfirmed, p_day_codes is not null, r.rough_total
    from jsonb_to_recordset(p_days) as r(day date, visits integer, new_patients integer, return_visits integer, total bigint,
      insurer bigint, noncovered bigint, copay bigint, other_total bigint, cash bigint, card bigint, transfer bigint,
      receivable_in bigint, unconfirmed boolean, split_unconfirmed boolean, rough_total bigint)
  on conflict (hospital_id, day) do update set
    visits = excluded.visits, new_patients = excluded.new_patients, return_visits = excluded.return_visits,
    total = excluded.total, insurer = excluded.insurer, noncovered = excluded.noncovered, copay = excluded.copay,
    other_total = excluded.other_total, cash = excluded.cash, card = excluded.card, transfer = excluded.transfer,
    receivable_in = excluded.receivable_in, unconfirmed = excluded.unconfirmed, split_unconfirmed = excluded.split_unconfirmed,
    day_codes = excluded.day_codes, rough_total = excluded.rough_total;

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
