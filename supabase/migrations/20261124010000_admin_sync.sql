-- 저절로 올리기 DB: 채울 기간(auto_upload_plans)·올림 상태(auto_upload_status) 표 둘과 정의자 함수 여섯 —
-- 의원 쪽 my_auto_upload_plan·claim_auto_upload·report_auto_upload, 관리자 쪽 admin_auto_upload_list·set_auto_upload_months·
-- admin_compare_first_month (spec admin-view REQ-8019, design.md '저절로 올리기 DB', ADR-048)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 차례: 20261124000000_admin_view.sql 다음에 붙인다 — 이 파일은 그 파일의 admin_view_hospital_id()와 앞 migration의 my_hospital_id()·
-- admins 표를 부르기만 한다(다시 만들지 않는다). 그 앞 모든 migration도 들어가 있어야 한다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 함수는 바꿔 쓰고, 권한은 거두고 다시 준다. 이미 있던 계획·상태 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 의원 PC의 저절로 올리기가 함수를 못 불러 그날은 아무것도 올리지 않고,
-- 관리자 가입 승인 표가 읽기 오류다). 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(아무도 이 표·함수를 부르지 않는다).
--
-- 무엇을 왜: 의원 비트 PC에서 그날 처음 앱을 열면 브라우저가 어제까지 안 올라온 매출·통계 숫자를 지금 저장 길로 뒤에서 올린다
-- (사용자 2026-11-24 2차 시안 "이대로 승인"). 관리자가 의원마다 채울 기간(1·2·3·6·12·24·36·60·120달, 줄이 없으면 2달)을 정하고,
-- 올림 상태(어디까지 올라왔나·어느 달까지 채웠나·마지막으로 올린 때·마지막 오류 번호)를 관리자만 읽는다.
-- 의원 쪽은 자기 병원 채울 기간·다 올라온 날 두 칸만 읽고(그날 처음인지 알려고), 상태는 자기 병원 줄만 잡은 탭이 쓴다.
-- 겹침 막기: 다른 PC·탭과는 잡음(lease_by·lease_until, 7분, 일마다 늘림)으로 한 곳만 돈다(한 줄 upsert라 동시에 둘이 잡지 못한다).
-- 다른 의원 비트 막기: 처음 올린 비트 PC의 요양기관번호 SHA-256(16진 64자 — 번호 글자는 두지 않는다)을 그 병원에 묶고, 다른 표시로
-- 잡으려 하면 잡지 않고 E-AUTO-OTHER-BIT만 적는다. 표시 없이(null — 판이 낡은 도우미·번호 없는 의원) 잡으면 묶기·검사를 건너뛴다.
-- 상태에는 오류 번호만 적는다(글자는 관리자 화면이 lib/errors.ts에서) — 오류 글·환자 자료가 이 표로 오지 않는다.
-- 채울 기간을 줄여도 매출·통계 줄(sales_days·stats_*)은 지우지 않는다(사용자 결정). 의원 비교 달 고르기의 가장 이른 달은
-- 승인된 병원의 stats_days·sales_days 가운데 가장 이른 날의 달 1일이다(지역과 상관없음, 10년 자르기는 화면이 한다).
-- 지금 표·칸·정책·표 권한·함수는 하나도 바꾸지 않는다(더하기만). 두 표는 정책이 없어 보기 정책 둘(ADR-046)이 필요 없다
-- (admin_views·hospital_regions와 같은 '함수로만' 표). 환자 자료는 들어가지 않는다.
--
-- 권한: 두 표는 표 권한·정책이 없다(정의자 함수로만 쓰고 읽는다). 여섯 함수는 로그인한 사용자(authenticated)만 실행하고 PUBLIC·anon은 못 한다.
-- 의원 쪽 셋은 승인된 원장(my_hospital_id())만 — 데스크·승인 전·보는 중(admin_view_hospital_id()가 있음)이면 my_auto_upload_plan은 줄이 없고
-- claim·report는 42501(탭 id가 없어도 42501, 인자보다 먼저). 관리자 쪽 셋은 관리자(admins에 자기 줄)만(아니면 42501, 인자보다 먼저).
-- 틀린 인자는 22023. 날짜는 한국 날짜((now() at time zone 'Asia/Seoul')::date)

-- ① 표 둘(RLS 켬, 정책 없음 = 함수로만)
create table if not exists public.auto_upload_plans (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  months smallint not null default 2 check (months in (1, 2, 3, 6, 12, 24, 36, 60, 120)),
  updated_at timestamptz not null default now()
);
alter table public.auto_upload_plans enable row level security;
revoke all on table public.auto_upload_plans from public, anon, authenticated;

create table if not exists public.auto_upload_status (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  -- '{M월 D일}까지' = 어제 쪽으로 끊김 없이 다 올라온 가장 늦은 날
  through_day date,
  -- '{YYYY년 M월}까지 채움' = through_day에서 거꾸로 끊김 없이 다 올라온 가장 이른 달 1일
  filled_from date check (filled_from is null or extract(day from filled_from) = 1),
  -- '마지막으로 올린 때'
  last_ok_at timestamptz,
  -- 오류 번호만(글자는 화면이 lib/errors.ts에서)
  error_code text check (error_code is null or error_code ~ '^E-[A-Z0-9-]{1,40}$'),
  error_at timestamptz,
  -- 처음 올린 비트 PC의 요양기관번호 SHA-256(번호 글자는 두지 않음, 다른 의원 비트 막기)
  bit_mark text check (bit_mark is null or bit_mark ~ '^[0-9a-f]{64}$'),
  -- 지금 올리는 탭의 무작위 id와 잡음 끝(겹침 막기)
  lease_by uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check (filled_from is null or (through_day is not null and filled_from <= through_day))
);
alter table public.auto_upload_status enable row level security;
revoke all on table public.auto_upload_status from public, anon, authenticated;

-- ② 의원 쪽: 내 계획 두 칸 · 잡기 · 보고(승인된 원장만, 보는 중이 아님)

-- 내 병원 한 줄: 채울 기간(계획 줄 없으면 2)과 다 올라온 날(상태 줄 없으면 null)뿐. 오류·시각·잡음·표시는 주지 않는다
create or replace function public.my_auto_upload_plan()
returns table (months smallint, through_day date) language sql stable security definer set search_path = ''
as $$
  select coalesce(p.months, 2::smallint), s.through_day
    from public.hospitals h
    left join public.auto_upload_plans p on p.hospital_id = h.id
    left join public.auto_upload_status s on s.hospital_id = h.id
   where h.id = public.my_hospital_id()
     and public.admin_view_hospital_id() is null
$$;

-- 잡기: 잡으면 true, 다른 탭이 잡고 있거나 다른 의원 비트면 false
create or replace function public.claim_auto_upload(p_tab uuid, p_bit_mark text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_mark text;
  v_ok boolean;
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null or p_tab is null then
    raise exception 'auto upload not allowed' using errcode = '42501';
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

-- 보고: 잡은 탭만 내 병원 줄을 고친다(아니면 아무것도 안 함 — 늦게 끝난 탭이 남의 상태를 덮지 않는다).
-- 오류 없음 = 다 올라온 날·채운 달·마지막으로 올린 때를 쓰고 오류 칸을 비움. 오류 있음 = 그때까지 된 날·채운 달과 오류 번호·시각(마지막으로 올린 때는 그대로).
-- 끝이면 잡음을 풀고, 아니면 7분 뒤로 늘린다
create or replace function public.report_auto_upload(p_tab uuid, p_through date, p_filled_from date, p_error text, p_done boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_done boolean := coalesce(p_done, false);
begin
  if v_hospital is null or public.admin_view_hospital_id() is not null or p_tab is null then
    raise exception 'auto upload not allowed' using errcode = '42501';
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

-- ③ 관리자 쪽: 상태 목록 · 채울 기간 바꾸기 · 의원 비교 가장 이른 달(관리자만)

-- 승인된 병원마다 한 줄(계획 줄 없으면 2달, 상태 줄 없으면 나머지 null). 잡음·표시 칸은 주지 않는다
create or replace function public.admin_auto_upload_list()
returns table (hospital_id uuid, months smallint, through_day date, filled_from date, last_ok_at timestamptz, error_code text, error_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select h.id, coalesce(p.months, 2::smallint), s.through_day, s.filled_from, s.last_ok_at, s.error_code, s.error_at
      from public.hospitals h
      left join public.auto_upload_plans p on p.hospital_id = h.id
      left join public.auto_upload_status s on s.hospital_id = h.id
     where h.status = 'approved'
     order by h.id;
end;
$$;

-- 채울 기간 바꾸기(승인된 병원, 아홉 값 가운데 하나). 매출·통계 줄은 건드리지 않는다(줄여도 지우지 않음)
create or replace function public.set_auto_upload_months(p_hospital_id uuid, p_months smallint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_hospital_id is null or not exists (select 1 from public.hospitals h where h.id = p_hospital_id and h.status = 'approved')
     or p_months is null or p_months not in (1, 2, 3, 6, 12, 24, 36, 60, 120) then
    raise exception 'fill months not allowed' using errcode = '22023';
  end if;
  insert into public.auto_upload_plans (hospital_id, months) values (p_hospital_id, p_months)
  on conflict (hospital_id) do update set months = excluded.months, updated_at = now();
end;
$$;

-- 승인된 병원의 stats_days·sales_days 가운데 가장 이른 날의 달 1일(없으면 null, 지역과 상관없음)
create or replace function public.admin_compare_first_month()
returns date language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return date_trunc('month', least(
    (select min(d.day) from public.stats_days d join public.hospitals h on h.id = d.hospital_id and h.status = 'approved'),
    (select min(d.day) from public.sales_days d join public.hospitals h on h.id = d.hospital_id and h.status = 'approved')
  ))::date;
end;
$$;

-- 권한: Postgres는 새 함수를 PUBLIC에, Supabase는 anon·authenticated에도 연다. 다 거두고 authenticated에만 실행을 준다
revoke all on function public.my_auto_upload_plan() from public, anon, authenticated;
revoke all on function public.claim_auto_upload(uuid, text) from public, anon, authenticated;
revoke all on function public.report_auto_upload(uuid, date, date, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_auto_upload_list() from public, anon, authenticated;
revoke all on function public.set_auto_upload_months(uuid, smallint) from public, anon, authenticated;
revoke all on function public.admin_compare_first_month() from public, anon, authenticated;
grant execute on function public.my_auto_upload_plan() to authenticated;
grant execute on function public.claim_auto_upload(uuid, text) to authenticated;
grant execute on function public.report_auto_upload(uuid, date, date, text, boolean) to authenticated;
grant execute on function public.admin_auto_upload_list() to authenticated;
grant execute on function public.set_auto_upload_months(uuid, smallint) to authenticated;
grant execute on function public.admin_compare_first_month() to authenticated;
