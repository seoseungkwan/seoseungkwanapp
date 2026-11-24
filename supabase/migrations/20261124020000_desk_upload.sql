-- 데스크 계정 올리기 DB: 값은 못 읽고 자기 병원 줄만 쓰는 정의자 함수 열하나 —
-- 계획·잡기·보고 desk_upload_plan·desk_claim_upload·desk_report_upload, 날짜·참거짓만 주는 표시 넷 desk_sales_marks·
-- desk_stats_day_marks·desk_stats_month_marks·desk_stats_coverage, 쓰기 넷 desk_save_revenue_range·desk_upsert_stats_months·
-- desk_upsert_stats_days·desk_add_stats_coverage (spec admin-view REQ-8024, design.md '데스크 계정 올리기', ADR-049)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 차례: 20261124010000_admin_sync.sql 다음에 붙인다 — 이 파일은 그 파일의 auto_upload_plans·auto_upload_status 표,
-- 20261124000000_admin_view.sql의 admin_view_hospital_id(), 20261118100000_desk_accounts.sql의 my_desk_hospital_id()와
-- 매출·통계 표(sales_days·sales_day_codes·stats_days·stats_months·stats_coverage)를 쓰기만 한다(다시 만들지 않는다).
-- 그 앞 모든 migration도 들어가 있어야 한다.
-- 두 번 붙여 넣어도 그대로다(함수만 바꿔 쓰고, 권한은 거두고 다시 준다. 표·줄은 건드리지 않는다).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 데스크 계정으로 켜진 비트 PC의 저절로 올리기가 함수를 못 불러
-- 그날은 아무것도 올리지 않는다 — 원장 계정 길은 그대로). 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(아무도 이 함수를 부르지 않는다).
--
-- 무엇을 왜(ADR-049, 사용자 2026-11-24 "데스크 계정도 올리기 (추천)"): 비트 PC가 데스크 계정으로 로그인돼 있어도 저절로 올리기가 돌아야 한다.
-- 데스크는 매출·통계 표에 읽기·쓰기 정책이 없고 그 표들의 hospital_id 기본값(my_hospital_id())도 데스크에게 null이다.
-- RLS 쓰기 정책을 열면 upsert가 부딪친 옛 줄을 SELECT 정책으로 읽어야 해 값이 읽히므로, 정의자 함수만 더한다.
-- 병원은 함수 안에서 my_desk_hospital_id()로만 정한다(병원 id 인자 없음 — 다른 병원 줄은 어떤 부르기로도 바뀌지 않는다).
-- 계획·잡기·보고는 20261124010000_admin_sync.sql의 원장 함수(my_auto_upload_plan·claim_auto_upload·report_auto_upload)와 같은 규칙을
-- 데스크 병원의 같은 상태 줄에 한다(원장 탭과 데스크 탭이 같은 잡음을 다툰다 — 한 곳만 잡는다). 원장 함수는 고치지 않는다(데스크에게 지금처럼 막힘).
-- 표시 넷은 날짜와 참·거짓만 준다(금액·환자 수·payload·sections 없음 — 저장 안 된 날을 고르는 재료뿐, 기간 3,700일 이하).
-- 매출 저장은 지금 save_revenue_range(20261115000000_sales_day_rough.sql)의 검사·upsert 칸·코드 줄 바꿈을 글자 그대로 옮기고
-- 병원 자리만 데스크 병원으로 둔다. 통계 저장은 지금 PostgREST upsert가 보내는 칸을 source = 'bit'로 넣거나 고치고, 덮은 기간은 800일 이하만.
-- 표 제약(판 번호 2·크기 한도·금액 모양)과 '다 된 줄을 덜 된 줄이 덮지 않음' 트리거는 정의자로 써도 그대로 걸린다.
-- 지금 표·칸·기본값·정책·표 권한·트리거·함수는 하나도 바꾸지 않는다(새 함수만 더하기). 환자 자료는 들어가지 않는다.
--
-- 권한: 열한 함수는 로그인한 사용자(authenticated)만 실행하고 PUBLIC·anon은 못 한다. 승인된 병원의 데스크(my_desk_hospital_id())만 —
-- 원장·승인 전 병원 데스크·데스크 아님·보는 중(admin_view_hospital_id()가 있음)이면 desk_upload_plan은 줄이 없고 나머지 열은 42501
-- (값보다 먼저, 잡기·보고는 탭 id가 없어도 42501). 틀린 인자는 22023(매출 저장의 검사 글은 save_revenue_range와 같다).
-- 날짜는 한국 날짜((now() at time zone 'Asia/Seoul')::date)

-- ① 계획 · 잡기 · 보고(원장 함수와 같은 규칙, 병원 = 데스크 병원)

-- 데스크 병원 한 줄: 채울 기간(계획 줄 없으면 2)과 다 올라온 날(상태 줄 없으면 null)뿐. 오류·시각·잡음·표시는 주지 않는다
create or replace function public.desk_upload_plan()
returns table (months smallint, through_day date) language sql stable security definer set search_path = ''
as $$
  select coalesce(p.months, 2::smallint), s.through_day
    from public.hospitals h
    left join public.auto_upload_plans p on p.hospital_id = h.id
    left join public.auto_upload_status s on s.hospital_id = h.id
   where h.id = public.my_desk_hospital_id()
     and public.admin_view_hospital_id() is null
$$;

-- 잡기: 잡으면 true, 다른 탭(원장 탭 포함)이 잡고 있거나 다른 의원 비트면 false
create or replace function public.desk_claim_upload(p_tab uuid, p_bit_mark text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
  v_mark text;
  v_ok boolean;
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null or p_tab is null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_bit_mark is not null and p_bit_mark !~ '^[0-9a-f]{64}$' then
    raise exception 'bad bit mark' using errcode = '22023';
  end if;
  -- 묶인 표시와 다르면 잡지 않고 오류 번호만 적는다(표시·잡음은 그대로)
  if p_bit_mark is not null then
    select s.bit_mark into v_mark from public.auto_upload_status s where s.hospital_id = v_hospital;
    if v_mark is not null and v_mark <> p_bit_mark then
      update public.auto_upload_status
         set error_code = 'E-AUTO-OTHER-BIT', error_at = now(), updated_at = now()
       where hospital_id = v_hospital;
      return false;
    end if;
  end if;
  -- 한 줄 upsert: 잡음이 없거나 끝났거나 내 탭이면 잡는다(같은 줄을 두 곳이 함께 잡지 못한다). 처음 표시를 묶는다
  insert into public.auto_upload_status as s (hospital_id, lease_by, lease_until, bit_mark)
  values (v_hospital, p_tab, now() + interval '7 minutes', p_bit_mark)
  on conflict (hospital_id) do update
     set lease_by = excluded.lease_by,
         lease_until = excluded.lease_until,
         bit_mark = coalesce(s.bit_mark, excluded.bit_mark),
         updated_at = now()
   where (s.lease_until is null or s.lease_until < now() or s.lease_by = p_tab)
     and (excluded.bit_mark is null or s.bit_mark is null or s.bit_mark = excluded.bit_mark)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- 보고: 잡은 탭만 데스크 병원 줄을 고친다(아니면 아무것도 안 함). 검사·쓰기는 report_auto_upload와 같다
create or replace function public.desk_report_upload(p_tab uuid, p_through date, p_filled_from date, p_error text, p_done boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
  v_done boolean := coalesce(p_done, false);
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null or p_tab is null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_through > (now() at time zone 'Asia/Seoul')::date - 1
     or (p_filled_from is not null
         and (extract(day from p_filled_from) <> 1 or p_through is null or p_filled_from > p_through))
     or (p_error is not null and p_error !~ '^E-[A-Z0-9-]{1,40}$') then
    raise exception 'bad upload report' using errcode = '22023';
  end if;
  update public.auto_upload_status
     set through_day = p_through,
         filled_from = p_filled_from,
         last_ok_at = case when p_error is null then now() else last_ok_at end,
         error_code = p_error,
         error_at = case when p_error is null then null else now() end,
         lease_by = case when v_done then null else lease_by end,
         lease_until = case when v_done then null else now() + interval '7 minutes' end,
         updated_at = now()
   where hospital_id = v_hospital
     and lease_by = p_tab;
end;
$$;

-- ② 표시 넷: 데스크 병원 줄의 날짜와 참·거짓만(금액·환자 수·payload·sections 없음). 기간은 시작 ≤ 끝, 3,700일 이하

-- 매출 날 줄 표시: 날 단위 코드 줄을 함께 저장했는지 · 확인 필요한 날인지 · 참고 금액이 있는지. 날 차례
create or replace function public.desk_sales_marks(p_from date, p_to date)
returns table (day date, day_codes boolean, unconfirmed boolean, has_rough boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 3700 then
    raise exception 'bad range' using errcode = '22023';
  end if;
  return query
    select s.day, s.day_codes, s.unconfirmed, s.rough_total is not null
      from public.sales_days s
     where s.hospital_id = v_hospital and s.day between p_from and p_to
     order by s.day;
end;
$$;

-- 통계 날 줄 표시: 덜 된 줄인지 · 수납 합계 열쇠가 있는지. 날 차례
create or replace function public.desk_stats_day_marks(p_from date, p_to date)
returns table (day date, partial boolean, has_sunap boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 3700 then
    raise exception 'bad range' using errcode = '22023';
  end if;
  return query
    select d.day, d.partial, d.payload ? 'sunap'
      from public.stats_days d
     where d.hospital_id = v_hospital and d.day between p_from and p_to
     order by d.day;
end;
$$;

-- 통계 달 줄 표시(기간의 첫 달~끝 달): 달 1일 · 덜 된 줄인지 · '몇 번까지 받나' 합계의 자료 끝 날(없으면 null). 달 차례
create or replace function public.desk_stats_month_marks(p_from date, p_to date)
returns table (month date, partial boolean, dropoff_as_of date)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 3700 then
    raise exception 'bad range' using errcode = '22023';
  end if;
  return query
    select (m.month || '-01')::date, m.partial, (m.payload -> 'dropoff' ->> 'asOf')::date
      from public.stats_months m
     where m.hospital_id = v_hospital and m.month between to_char(p_from, 'YYYY-MM') and to_char(p_to, 'YYYY-MM')
     order by m.month;
end;
$$;

-- 덮은 기간: 기간과 겹치는 줄의 두 날만(출처 칸 없음)
create or replace function public.desk_stats_coverage(p_from date, p_to date)
returns table (from_day date, to_day date)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 3700 then
    raise exception 'bad range' using errcode = '22023';
  end if;
  return query
    select c.from_day, c.to_day
      from public.stats_coverage c
     where c.hospital_id = v_hospital and c.from_day <= p_to and c.to_day >= p_from
     order by c.from_day, c.to_day;
end;
$$;

-- ③ 쓰기 넷: 데스크 병원 줄만 넣거나 고친다. 아무것도 돌려주지 않는다

-- 매출 덩어리 하나(31일까지) 저장: save_revenue_range(20261115000000_sales_day_rough.sql)의 검사·upsert 칸·코드 줄 바꿈을 글자 그대로 옮기고
-- 넣는 줄·지우는 줄의 병원만 데스크 병원으로. 한 트랜잭션이라 하나라도 어기면 raise exception으로 아무것도 안 바뀐다.
-- 차례: 범위 → 날 줄(배열·줄 수 = 날 수·모든 날이 범위 안) → 코드 줄(null이 아니면 배열·9,300줄 이하·모든 날이 범위 안)
--       → sales_days upsert(열다섯 칸 + day_codes = 코드 줄을 줬는지 + rough_total) → 그 범위 데스크 병원 코드 줄 지움 → 준 코드 줄 넣음.
-- 줄은 정해 둔 칸만 꺼낸다(hospital_id·fetched_at 열쇠가 있어도 쓰지 않는다). 칸 제약은 표가 지킨다
create or replace function public.desk_save_revenue_range(p_from date, p_to date, p_days jsonb, p_day_codes jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
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

  insert into public.sales_days (hospital_id, day, visits, new_patients, return_visits, total, insurer, noncovered, copay, other_total,
                                 cash, card, transfer, receivable_in, unconfirmed, split_unconfirmed, day_codes, rough_total)
    select v_hospital, r.day, r.visits, r.new_patients, r.return_visits, r.total, r.insurer, r.noncovered, r.copay, r.other_total,
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
  delete from public.sales_day_codes d where d.hospital_id = v_hospital and d.day between p_from and p_to;

  if p_day_codes is not null then
    insert into public.sales_day_codes (hospital_id, day, code, count, amount)
      select v_hospital, c.day, c.code, c.count, c.amount
      from jsonb_to_recordset(p_day_codes) as c(day date, code text, count integer, amount bigint);
  end if;
end;
$$;

-- 통계 달 줄 넣기·고치기: 줄마다 month·partial·payload·sections를 source = 'bit'로(바꾸는 칸 = 지금 PostgREST upsert가 보내는 칸).
-- 줄의 hospital_id·source 열쇠는 쓰지 않는다. 판 번호·크기 제약과 '다 된 줄을 덜 된 줄이 덮지 않음' 트리거는 표가 지킨다
create or replace function public.desk_upsert_stats_months(p_rows jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad rows' using errcode = '22023';
  end if;
  insert into public.stats_months (hospital_id, month, partial, source, payload, sections)
    select v_hospital, r.month, r.partial, 'bit', r.payload, r.sections
      from jsonb_to_recordset(p_rows) as r(month text, partial boolean, payload jsonb, sections jsonb)
  on conflict (hospital_id, month) do update set
    month = excluded.month, partial = excluded.partial, source = excluded.source, payload = excluded.payload,
    sections = excluded.sections;
end;
$$;

-- 통계 날 줄 넣기·고치기: 같은 꼴로 day·partial·payload
create or replace function public.desk_upsert_stats_days(p_rows jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad rows' using errcode = '22023';
  end if;
  insert into public.stats_days (hospital_id, day, partial, source, payload)
    select v_hospital, r.day, r.partial, 'bit', r.payload
      from jsonb_to_recordset(p_rows) as r(day date, partial boolean, payload jsonb)
  on conflict (hospital_id, day) do update set
    day = excluded.day, partial = excluded.partial, source = excluded.source, payload = excluded.payload;
end;
$$;

-- 덮은 기간 한 줄(데스크 병원, 시작, 끝, 'bit'). 시작 ≤ 끝, 양 끝을 합쳐 800일 이하
create or replace function public.desk_add_stats_coverage(p_from date, p_to date)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_desk_hospital_id();
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null then
    raise exception 'desk upload not allowed' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from + 1 > 800 then
    raise exception 'bad range' using errcode = '22023';
  end if;
  insert into public.stats_coverage (hospital_id, from_day, to_day, source) values (v_hospital, p_from, p_to, 'bit');
end;
$$;

-- 권한: Postgres는 새 함수를 PUBLIC에, Supabase는 anon·authenticated에도 연다. 다 거두고 authenticated에만 실행을 준다
revoke all on function public.desk_upload_plan() from public, anon, authenticated;
revoke all on function public.desk_claim_upload(uuid, text) from public, anon, authenticated;
revoke all on function public.desk_report_upload(uuid, date, date, text, boolean) from public, anon, authenticated;
revoke all on function public.desk_sales_marks(date, date) from public, anon, authenticated;
revoke all on function public.desk_stats_day_marks(date, date) from public, anon, authenticated;
revoke all on function public.desk_stats_month_marks(date, date) from public, anon, authenticated;
revoke all on function public.desk_stats_coverage(date, date) from public, anon, authenticated;
revoke all on function public.desk_save_revenue_range(date, date, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.desk_upsert_stats_months(jsonb) from public, anon, authenticated;
revoke all on function public.desk_upsert_stats_days(jsonb) from public, anon, authenticated;
revoke all on function public.desk_add_stats_coverage(date, date) from public, anon, authenticated;
grant execute on function public.desk_upload_plan() to authenticated;
grant execute on function public.desk_claim_upload(uuid, text) to authenticated;
grant execute on function public.desk_report_upload(uuid, date, date, text, boolean) to authenticated;
grant execute on function public.desk_sales_marks(date, date) to authenticated;
grant execute on function public.desk_stats_day_marks(date, date) to authenticated;
grant execute on function public.desk_stats_month_marks(date, date) to authenticated;
grant execute on function public.desk_stats_coverage(date, date) to authenticated;
grant execute on function public.desk_save_revenue_range(date, date, jsonb, jsonb) to authenticated;
grant execute on function public.desk_upsert_stats_months(jsonb) to authenticated;
grant execute on function public.desk_upsert_stats_days(jsonb) to authenticated;
grant execute on function public.desk_add_stats_coverage(date, date) to authenticated;
