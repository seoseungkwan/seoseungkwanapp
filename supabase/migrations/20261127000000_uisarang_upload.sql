-- 의사랑 엑셀 올리기 DB: 처방·나이대 숫자 표 uis_periods, 통계 출처에 'uisarang'(stats_days·stats_coverage),
-- 관리자 의원 비교 읽기 함수 admin_uis_rows (spec uisarang-upload REQ-8801, design.md 7절, ADR-056)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261101000200_stats.sql(stats_days·stats_coverage)·20261101000400_revenue.sql(sales_days)·
-- 20261119300000_clinic_emr.sql(clinic_profiles.emr)·20261119400000_hospital_emr.sql(hospitals.emr)·
-- 20261124000000_admin_view.sql(admin_view_hospital_id)이 들어가 있어야 한다. my_hospital_id()·touch_updated_at()·
-- admin_view_hospital_id()·admin_rows·stats_months는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 제약·정책·트리거는 지우고 다시 만들고, 함수는 바꿔 쓰고, 권한은 같은 것을 다시 준다.
-- 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 의사랑 저장이 모두 실패 카드다 — 출처 'uisarang'을 DB가 받지 않고
-- uis_periods 표가 없다. 관리자 의원 비교는 함수가 없으면 새 두 종류를 빈 목록으로 보고 넘어간다). 비트 의원 화면은 그대로다.
--
-- 무엇을 왜: 의사랑 의원은 원장이 의사랑 통계 엑셀을 브라우저에 끌어다 놓고, Web Worker가 읽어 날마다의 숫자만 서버에 둔다.
-- 날 숫자(내원·신환)는 지금 표 stats_days(출처 'uisarang')·stats_coverage에, 매출은 sales_days(save_revenue_range)에 둔다.
-- 날 숫자로 못 나누는 것 — 기간 합인 처방 코드별 처방량(하루·월~일 한 주·1일~말일 한 달)과 아래쪽 표 나이대 수(하루) — 만
-- 새 표 uis_periods에 둔다. 환자 칸(차트번호·이름·주민번호·전화·주소)은 없다. 파일 이름도 오지 않는다.
-- stats_months는 그대로다(의사랑은 달 줄을 쓰지 않는다).
-- 관리자 비교는 admin_rows를 고치지 않고 같은 관문의 정의자 함수 admin_uis_rows(종류 둘: uis_periods·clinic_emr)를 더한다.
--
-- 권한: uis_periods는 RLS를 켜고 기본 권한을 모두 거둔 뒤, 로그인한 사용자(authenticated)에게 읽기와 네 칸(kind·from_day·to_day·payload)
-- 넣기·고치기만 준다. hospital_id·updated_at은 칸 권한이 없어 기본값(내 병원 · 지금)으로만 채워지고, 고칠 때도 트리거가 지금 시각을 적는다.
-- 지우기 권한·정책은 없다(같은 기간은 upsert로 바꾼다). 정책은 승인된 의원 원장의 내 병원 줄만(데스크·승인 대기·거절은 my_hospital_id()가
-- null이라 0줄), 그리고 admin_view.sql과 같은 보는 중 정책 둘(보는 중이면 그 의원 줄만 · 넣기·고치기 모두 막힘).
-- 로그인 안 한 사용자(anon)는 아무것도 못 한다. admin_uis_rows는 authenticated만 실행하고(PUBLIC·anon 못 함), 관리자가 아니면 42501
-- (인자보다 먼저), 틀린 인자는 22023이다. 승인된 의원 줄만 준다.
-- check는 NULL을 통과시킨다(stats.sql과 같은 함정): payload 검사는 묶음 전체를 is true로 감싸 'v' 열쇠가 없는 payload도 막는다.
-- 안 모양 검사는 앱 lib/payload/uisarang.ts 한 곳이다. DB는 객체·v = 1·크기(262,144바이트)만 본다

-- ① 표: 처방(하루·한 주·한 달)과 나이대(하루) 숫자. 환자 칸 없음
create table if not exists public.uis_periods (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('rx', 'age')),
  from_day date not null check (from_day >= date '2020-01-01'),
  to_day date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (hospital_id, kind, from_day, to_day));
alter table public.uis_periods drop constraint if exists uis_periods_span_ok;
alter table public.uis_periods add constraint uis_periods_span_ok check (
  from_day = to_day
  or (kind = 'rx' and extract(isodow from from_day) = 1 and to_day = from_day + 6)
  or (kind = 'rx' and extract(day from from_day) = 1
      and to_day = (date_trunc('month', from_day) + interval '1 month' - interval '1 day')::date));
alter table public.uis_periods drop constraint if exists uis_periods_payload_ok;
-- check는 NULL을 통과시킨다(stats.sql 머리 주석과 같은 함정): 'v' 열쇠가 없으면 payload ->> 'v' = '1'이 NULL이라 묶음 전체를 is true로 감싼다
alter table public.uis_periods add constraint uis_periods_payload_ok check (
  (jsonb_typeof(payload) = 'object' and payload ->> 'v' = '1' and octet_length(payload::text) <= 262144) is true);
-- 고칠 때도 지금 시각(지금 공용 함수 touch_updated_at를 부르기만 한다)
drop trigger if exists uis_periods_touch on public.uis_periods;
create trigger uis_periods_touch before update on public.uis_periods
  for each row execute function public.touch_updated_at();

alter table public.uis_periods enable row level security;
revoke all on table public.uis_periods from anon, authenticated;
grant select on table public.uis_periods to authenticated;
grant insert (kind, from_day, to_day, payload), update (kind, from_day, to_day, payload) on table public.uis_periods to authenticated;
-- 지우기 권한 없음(같은 기간은 upsert로 바꾼다)

drop policy if exists "내 병원 의사랑 숫자 읽기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 읽기" on public.uis_periods for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 의사랑 숫자 넣기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 넣기" on public.uis_periods for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 의사랑 숫자 고치기" on public.uis_periods;
create policy "내 병원 의사랑 숫자 고치기" on public.uis_periods for update to authenticated
  using (hospital_id = (select public.my_hospital_id())) with check (hospital_id = (select public.my_hospital_id()));
-- 보는 중 정책 둘(admin_view.sql ⑤와 같은 글자 · 이 표만)
drop policy if exists "관리자 보는 의원 읽기" on public.uis_periods;
create policy "관리자 보는 의원 읽기" on public.uis_periods for select to authenticated
  using (hospital_id = (select public.admin_view_hospital_id()));
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.uis_periods;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.uis_periods as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);

-- ② 통계 출처에 'uisarang'(달 줄 표는 그대로 — 의사랑은 달 줄을 쓰지 않는다)
-- 제약 이름은 20261101000200_stats.sql의 칸 안 check가 Postgres에서 받은 자동 이름이다
alter table public.stats_days drop constraint if exists stats_days_source_check;
alter table public.stats_days add constraint stats_days_source_check check (source in ('bit', 'file', 'uisarang'));
alter table public.stats_coverage drop constraint if exists stats_coverage_source_check;
alter table public.stats_coverage add constraint stats_coverage_source_check check (source in ('bit', 'file', 'uisarang'));

-- ③ 관리자 비교 읽기(admin_rows와 같은 관문 · 새 두 종류만)
--   uis_periods: 기간과 겹치는 줄 {kind, from_day, to_day, payload}를 (병원, kind, from_day, to_day) 차례로
--   clinic_emr: 병원마다 한 줄 {emr} — 병원 정보 EMR, 줄이 없으면 가입 때 EMR
--   부를 때마다 병원 1~30곳, 기간 400일까지(끝 − 시작 ≤ 399). 보기 상태(요청 머리)와 상관없다
create or replace function public.admin_uis_rows(p_kind text, p_hospital_ids uuid[], p_from date, p_to date)
returns table (hospital_id uuid, "row" jsonb) language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('uis_periods', 'clinic_emr') or p_hospital_ids is null or p_from is null or p_to is null
     or coalesce(cardinality(p_hospital_ids), 0) not between 1 and 30
     or p_from > p_to or p_to - p_from >= 400 then
    raise exception 'rows not allowed' using errcode = '22023';
  end if;
  select coalesce(array_agg(h.id), '{}') into v_ids
    from public.hospitals h where h.id = any (p_hospital_ids) and h.status = 'approved';
  if p_kind = 'uis_periods' then
    return query
      select u.hospital_id, jsonb_build_object('kind', u.kind, 'from_day', u.from_day, 'to_day', u.to_day, 'payload', u.payload)
        from public.uis_periods u
       where u.hospital_id = any (v_ids) and u.from_day <= p_to and u.to_day >= p_from
       order by u.hospital_id, u.kind, u.from_day, u.to_day;
  else
    return query
      select h.id, jsonb_build_object('emr', coalesce(p.emr, h.emr))
        from public.hospitals h left join public.clinic_profiles p on p.hospital_id = h.id
       where h.id = any (v_ids)
       order by h.id;
  end if;
end;
$$;
revoke all on function public.admin_uis_rows(text, uuid[], date, date) from public, anon;
grant execute on function public.admin_uis_rows(text, uuid[], date, date) to authenticated;
