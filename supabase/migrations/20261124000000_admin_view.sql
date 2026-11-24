-- 다른 의원 보기·의원 비교 DB: 보기 줄(admin_views — 본 기록, 줄 id가 그 브라우저의 보기 열쇠)·지역 고친 값(hospital_regions) 표 둘,
-- 보기 함수(admin_view_key·admin_view_hospital_id·read_hospital_id·admin_view_open·start_admin_view·stop_admin_view·my_admin_view·
-- admin_view_log·admin_view_hospitals·set_hospital_region), 병원별 표 정책 둘씩('관리자 보는 의원 읽기'·'보는 중에는 그 의원만 · 쓰기 없음'),
-- 비공개 바구니 다섯 읽기 정책('관리자 보는 의원 파일 읽기'), 다시 만드는 읽기 함수 여섯(sales_code_totals·notice_list·notice_unread_count·
-- notice_rule_alerts·rule_change_alerts·desk_members), 비교 읽기 함수 admin_rows
-- (spec admin-view REQ-8001~8003, design.md 'DB'·'병원별 표'·'다시 만드는 읽기 함수'·'비교 읽기', ADR-046·047)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 지금 모든 migration(20261028000000_auth.sql부터 20261123000000_location_flow_cache.sql까지)이 들어가 있어야 한다 —
-- 이 파일이 정책을 더하는 병원별 표와 다시 만드는 함수가 모두 있어야 한다. my_hospital_id()는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다.
-- 이미 있던 보기 줄·지역 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 관리자 탭이 의원 목록을 못 읽어 화면 오류다 — 관리자만, 다른 화면은 그대로).
-- 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(요청 머리 x-ssk-view가 없으면 더한 정책은 아무것도 바꾸지 않는다).
--
-- 무엇을 왜: 관리자가 다른 승인된 의원의 화면을 그 의원이 된 것처럼 읽기만 하며 본다(사용자 2026-11-24). 관리자가 의원을 고르면
-- start_admin_view가 본 기록 한 줄을 넣고 그 줄 id(보기 열쇠)를 준다. 브라우저는 열쇠를 세션 쿠키 ssk_view에 두고 요청 머리 x-ssk-view로
-- 보낸다(PostgREST가 request.headers로 넘긴다). admin_view_hospital_id()는 머리의 열쇠가 '부른 관리자의 끝나지 않은 12시간 안 줄'이고
-- 그 의원이 승인 상태일 때만 그 의원 id를 준다(아니면 null — 모양이 틀린 머리에도 던지지 않는다).
-- 병원별 표마다 정책 둘을 더해, 보는 중에는 그 의원 줄만 보이고(내 줄은 숨김) 넣기·고치기·지우기가 모두 막힌다. 보는 중이 아니면
-- 두 정책은 아무것도 바꾸지 않는다. 예약 줄(calendar_appts — 환자 이름·차트번호·메모)·환자·청구 표는 restrictive 하나만 더해
-- 보는 중 아무 줄도 안 보인다. 예약 숫자는 admin_rows('calendar_counts')가 이름·차트번호·메모 없이 준다.
-- 함수 안에서 읽을 병원을 고르는 읽기 함수 여섯은 마지막 정의를 글자 그대로 옮기고 그 자리만 read_hospital_id()(보는 의원, 없으면 내 병원)로 바꾼다.
-- 의원 비교는 정의자 함수 admin_rows가 관리자에게만, 승인된 병원 줄만, 종류마다 정해 둔 칸만 jsonb로 준다(이름·연락처·계좌·차트번호·메모 없음,
-- 부를 때마다 병원 30곳·400일까지). 지역 고친 값(hospital_regions)은 관리자가 정한 것만 둔다(sido null = '지역 모름'으로 정함,
-- 줄이 없으면 앱이 병원 정보 주소에서 읽는다). 본 기록은 지우지 않는다(목록은 최근 30일). 보인 의원에는 알리지 않는다.
-- Storage는 요청 머리를 정책에 넘기는지 확인하지 못해, 파일 읽기는 '부른 관리자가 그 의원을 열어 둔 보기 줄이 있나'로 본다(머리를 보지 않음).
-- 지금 표·칸·정책·표 권한은 하나도 바꾸지 않는다(정책을 더하기만). hospitals·admins·hospital_members에는 정책을 더하지 않는다
-- (문지기가 hospitals·admins 내 줄을 읽어야 하고, admins 정책 안에서 admins를 다시 읽으면 무한 되부름 42P17).
-- 앞으로 hospital_id 표를 만드는 migration은 '병원별 표'처럼 정책 둘(환자·청구 표면 restrictive 하나)을 더해야 한다(시험 AC-8002.8이 잡는다).
-- 환자 자료는 들어가지 않는다.
--
-- 권한: 두 표는 표 권한·정책이 없다(정의자 함수로만 쓰고 읽는다). 사용자가 부르는 함수는 로그인한 사용자(authenticated)만 실행하고
-- PUBLIC·anon은 못 한다. 시작·끝·본 기록·의원 목록·지역 고치기·비교 읽기는 관리자(admins에 자기 줄)만(아니면 42501, 인자보다 먼저),
-- 틀린 인자는 22023. admin_view_key()는 아무에게도 주지 않는다(정의자 함수 안에서만 돈다).
-- 보는 중 정의자 쓰기 함수(AI 리포트 저장 등)는 DB가 보기 상태를 보지 않는다 — 브라우저 거르기와 단추 숨김이 막는다(ADR-046 트레이드오프)

-- ① 보기 줄(= 본 기록). id가 이 브라우저의 보기 열쇠. 표 권한·정책 없음 — 정의자 함수로만
create table if not exists public.admin_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists admin_views_started on public.admin_views (started_at desc);
alter table public.admin_views enable row level security;
revoke all on table public.admin_views from public, anon, authenticated;

-- ② 관리자가 정한 지역(줄이 없으면 주소에서 읽음, sido null = '지역 모름'으로 정함). 표 권한·정책 없음
create table if not exists public.hospital_regions (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  sido text check (sido in ('서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원',
                            '충북', '충남', '전북', '전남', '경북', '경남', '제주')),
  updated_at timestamptz not null default now()
);
alter table public.hospital_regions enable row level security;
revoke all on table public.hospital_regions from public, anon, authenticated;

-- ③ 보기 열쇠(요청 머리 x-ssk-view)와 보는 의원. 모양이 틀려도 던지지 않는다(null)
create or replace function public.admin_view_key()
returns uuid language plpgsql stable set search_path = ''
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-ssk-view';
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- 부른 관리자의 끝나지 않은 12시간 안 보기 줄 + 승인된 의원일 때만 그 의원 id
create or replace function public.admin_view_hospital_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select v.hospital_id
    from public.admin_views v
    join public.admins a on a.user_id = v.user_id
    join public.hospitals h on h.id = v.hospital_id and h.status = 'approved'
   where v.id = public.admin_view_key()
     and v.user_id = (select auth.uid())
     and v.ended_at is null
     and v.started_at > now() - interval '12 hours'
$$;

-- 읽을 병원: 보는 의원, 없으면 내 병원(읽기 함수 여섯이 씀. 쓰기에는 쓰지 않는다)
create or replace function public.read_hospital_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select coalesce(public.admin_view_hospital_id(), public.my_hospital_id()) $$;

-- 파일 읽기용: 부른 관리자가 그 의원(첫 폴더 글자)을 열어 둔 보기 줄이 있나(머리를 보지 않는다 — Storage)
create or replace function public.admin_view_open(p_hospital text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_views v
      join public.admins a on a.user_id = v.user_id
      join public.hospitals h on h.id = v.hospital_id and h.status = 'approved'
     where v.user_id = (select auth.uid())
       and v.hospital_id::text = p_hospital
       and v.ended_at is null
       and v.started_at > now() - interval '12 hours')
$$;

-- ④ 시작·끝·지금 보는 의원·본 기록·의원 목록·지역 고치기
create or replace function public.start_admin_view(p_hospital_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_hospital_id is null or not exists (
       select 1 from public.hospitals h
        where h.id = p_hospital_id and h.status = 'approved' and h.owner_id <> (select auth.uid())) then
    raise exception 'view not allowed' using errcode = '22023';
  end if;
  -- 이 브라우저가 보던 줄(머리의 열쇠)은 끝낸다
  update public.admin_views set ended_at = now()
   where id = public.admin_view_key() and user_id = (select auth.uid()) and ended_at is null;
  insert into public.admin_views (user_id, hospital_id) values ((select auth.uid()), p_hospital_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stop_admin_view()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  update public.admin_views set ended_at = now()
   where id = public.admin_view_key() and user_id = (select auth.uid()) and ended_at is null;
end;
$$;

-- 이 브라우저가 보는 의원(id·이름 = 병원 정보 이름, 없으면 가입 이름). 보는 중이 아니면 빈 목록. 앱 틀 레이아웃이 읽는다(쓰지 않는다)
create or replace function public.my_admin_view()
returns table (hospital_id uuid, name text) language sql stable security definer set search_path = ''
as $$
  select h.id, coalesce(nullif(btrim(p.display_name), ''), h.name)
    from public.hospitals h
    left join public.clinic_profiles p on p.hospital_id = h.id
   where h.id = public.admin_view_hospital_id()
$$;

-- 본 기록: 시작이 최근 30일 안인 줄 모두, 최근 시작 차례(끝 시각은 주지 않는다, 30일 전 줄은 지우지 않고 답에만 없다). 관리자만
create or replace function public.admin_view_log()
returns table (started_at timestamptz, viewer_name text, viewer_email text, hospital_id uuid, hospital_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select v.started_at,
           coalesce(nullif(btrim(vp.display_name), ''), vh.name),
           coalesce(vh.email, u.email)::text,
           h.id,
           coalesce(nullif(btrim(p.display_name), ''), h.name)
      from public.admin_views v
      join public.hospitals h on h.id = v.hospital_id
      left join public.clinic_profiles p on p.hospital_id = h.id
      left join public.hospitals vh on vh.owner_id = v.user_id
      left join public.clinic_profiles vp on vp.hospital_id = vh.id
      left join auth.users u on u.id = v.user_id
     where v.started_at > now() - interval '30 days'
     order by v.started_at desc, v.id;
end;
$$;

-- 승인된 의원 목록(이름 차례): id · 이름(병원 정보 이름, 없으면 가입 이름) · 주소 · 관리자가 지역을 정했는지 · 정한 지역 · 내 병원인지. 관리자만
create or replace function public.admin_view_hospitals()
returns table (hospital_id uuid, name text, address text, region_set boolean, region text, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select h.id, coalesce(nullif(btrim(p.display_name), ''), h.name), p.address, r.hospital_id is not null, r.sido,
           h.owner_id = (select auth.uid())
      from public.hospitals h
      left join public.clinic_profiles p on p.hospital_id = h.id
      left join public.hospital_regions r on r.hospital_id = h.id
     where h.status = 'approved'
     order by 2, 1;
end;
$$;

create or replace function public.set_hospital_region(p_hospital_id uuid, p_sido text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_hospital_id is null or not exists (select 1 from public.hospitals h where h.id = p_hospital_id and h.status = 'approved')
     or (p_sido is not null and p_sido not in ('서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원',
                                               '충북', '충남', '전북', '전남', '경북', '경남', '제주')) then
    raise exception 'region not allowed' using errcode = '22023';
  end if;
  -- null = 관리자가 '지역 모름'으로 정함(줄을 남긴다). 줄을 지우는 길은 없다(시안 고르기에 '주소에서 읽기' 없음)
  insert into public.hospital_regions (hospital_id, sido) values (p_hospital_id, p_sido)
  on conflict (hospital_id) do update set sido = excluded.sido, updated_at = now();
end;
$$;

-- ⑤ 병원별 표 정책 둘씩('병원별 표' 표 그대로). 지금 정책은 건드리지 않는다
--   보기 ○: permissive '관리자 보는 의원 읽기'(보는 의원 줄) + restrictive '보는 중에는 그 의원만 · 쓰기 없음'
--   보기 ×(예약 줄·환자·청구): restrictive 하나만(보는 중 아무 줄도 안 보임)
--   restrictive는 지금 permissive 정책과 AND로 묶인다: 보는 중이 아니면 늘 참, 보는 중이면 보는 의원 줄만 보이고
--   with check가 거짓이라 넣기·고치기·upsert가 42501(고치기·지우기는 보는 의원 줄에 맞는 쓰기 정책이 없어 0줄)
do $$
declare
  t text;
  v_view text[] := array[
    'stats_months', 'stats_days', 'stats_coverage', 'stats_rx_picks', 'stats_rx_groups', 'stats_goals',
    'sales_days', 'sales_codes', 'sales_day_codes', 'rx_groups',
    'worklog_days', 'worklog_settings', 'sunap_days', 'sunap_spends', 'sunap_settings',
    'staff_members', 'staff_week_plans', 'staff_day_changes', 'staff_overtime', 'staff_leaves', 'staff_settings',
    'staff_incentive_rules', 'staff_pay_lines', 'staff_pay_months', 'staff_files',
    'notice_marks', 'notice_keywords', 'notice_keyword_hits', 'rule_change_marks',
    'location_settings', 'location_candidates', 'location_listings', 'location_notes', 'location_photos',
    'location_events', 'location_flow_cache',
    'inventory_categories', 'inventory_items', 'inventory_counts', 'inventory_count_lines', 'inventory_receipts',
    'inventory_receipt_lines', 'inventory_aliases',
    'contacts_companies', 'contacts_people', 'contacts_equipment', 'contacts_repairs',
    'form_notices', 'form_guides', 'form_backgrounds', 'ai_reports', 'ai_usage',
    'clinic_profiles', 'claim_rule_settings', 'claim_hospital_settings', 'calendar_settings', 'calendar_allday'];
  v_hidden text[] := array[
    'calendar_appts', 'calendar_rev', 'message_templates', 'contact_counts',
    'claim_day_counts', 'claim_month_counts', 'claim_day_closes'];
begin
  foreach t in array v_view loop
    execute format('drop policy if exists %I on public.%I', '관리자 보는 의원 읽기', t);
    execute format('create policy %I on public.%I for select to authenticated '
                   'using (hospital_id = (select public.admin_view_hospital_id()))', '관리자 보는 의원 읽기', t);
  end loop;
  foreach t in array v_view || v_hidden loop
    execute format('drop policy if exists %I on public.%I', '보는 중에는 그 의원만 · 쓰기 없음', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated '
                   'using ((select public.admin_view_hospital_id()) is null '
                   'or hospital_id = (select public.admin_view_hospital_id())) '
                   'with check ((select public.admin_view_hospital_id()) is null)', '보는 중에는 그 의원만 · 쓰기 없음', t);
  end loop;
end;
$$;

-- ⑥ 비공개 바구니 다섯: 그 의원을 열어 둔 관리자는 읽기만(올리기·지우기 정책은 그대로 — 내 병원 폴더. install-files·다른 바구니는 그대로)
drop policy if exists "관리자 보는 의원 파일 읽기" on storage.objects;
create policy "관리자 보는 의원 파일 읽기" on storage.objects
  for select to authenticated
  using (bucket_id in ('clinic-logos', 'staff-files', 'inventory-photos', 'location-photos', 'form-backgrounds')
         and public.admin_view_open((storage.foldername(name))[1]));

-- ⑦ 읽기 함수 여섯 다시 만들기: 마지막 정의를 글자 그대로 옮기고 읽을 병원을 고르는 자리의 my_hospital_id()만 read_hospital_id()로.
--   인자·답 모양·호출자·search_path·권한 검사·권한 줄은 그대로다

-- 20261114000000_sales_day_codes.sql에서 옮김, 읽을 병원만 바꿈
create or replace function public.sales_code_totals(p_from date, p_to date)
  returns table (code text, count bigint, amount bigint, missing boolean) language sql stable security invoker set search_path = ''
as $$
  select d.code, sum(d.count)::bigint, coalesce(sum(d.amount), 0)::bigint, bool_or(d.amount is null)
  from public.sales_day_codes d where d.hospital_id = (select public.read_hospital_id()) and d.day between p_from and p_to
  group by d.code order by d.code
$$;
revoke all on function public.sales_code_totals(date, date) from public, anon;
grant execute on function public.sales_code_totals(date, date) to authenticated;

-- 20261121000001_notice_keywords.sql에서 옮김, 읽을 병원(표시·맞춤 줄을 잇는 병원)만 바꿈
create or replace function public.notice_list(
  p_related boolean, p_sources text[], p_starred boolean, p_ids uuid[], p_unread_only boolean, p_limit integer, p_offset integer
) returns jsonb language sql stable security invoker set search_path = ''
as $$
  with me as (
    select (select public.read_hospital_id()) as hospital_id, (now() at time zone 'Asia/Seoul')::date as today
  ),
  picked as (
    select n.id, n.title, n.kind, n.posted_on, n.notice_no, n.related, n.summary, n.read_mode, n.state, n.rule_hits, n.created_at,
           m.read_at, coalesce(m.starred, false) as starred, coalesce(m.memo, '') as memo, m.memo_at, m.rules_checked_at,
           (n.posted_on > me.today - 14 and m.read_at is null) as unread,
           coalesce(h.words, '{}'::text[]) as keywords
      from public.notices n
     cross join me
      left join public.notice_marks m on m.notice_id = n.id and m.hospital_id = me.hospital_id
      left join public.notice_keyword_hits h on h.notice_id = n.id and h.hospital_id = me.hospital_id
     where (not coalesce(p_related, false) or n.related is not false or n.state <> 'done' or h.notice_id is not null)
       and (p_sources is null or exists (select 1 from public.notice_posts p where p.notice_id = n.id and p.source = any (p_sources)))
       and (not coalesce(p_starred, false) or coalesce(m.starred, false))
       and (p_ids is null or n.id = any (p_ids))
  ),
  kept as (
    select * from picked where not coalesce(p_unread_only, false) or unread
  ),
  page as (
    select *
      from kept
     order by posted_on desc, created_at desc, id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from kept),
    'unread', (select count(*) from kept where unread),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', g.id,
                 'title', g.title,
                 'kind', g.kind,
                 'postedOn', g.posted_on,
                 'noticeNo', g.notice_no,
                 'related', g.related,
                 'summary', g.summary,
                 'readMode', g.read_mode,
                 'state', g.state,
                 'ruleHits', g.rule_hits,
                 'posts', (
                   select coalesce(jsonb_agg(
                            jsonb_build_object('source', p.source, 'title', p.title, 'url', p.url, 'postedOn', p.posted_on, 'attachments', p.attachments)
                            order by case p.source when 'mohw_rss' then 0 when 'hira_notice' then 1 else 2 end, p.posted_on, p.created_at, p.id),
                          '[]'::jsonb)
                     from public.notice_posts p
                    where p.notice_id = g.id
                 ),
                 'mark', jsonb_build_object(
                   'readAt', g.read_at, 'starred', g.starred, 'memo', g.memo, 'memoAt', g.memo_at, 'rulesCheckedAt', g.rules_checked_at
                 ),
                 'keywords', g.keywords,
                 'unread', g.unread
               )
               order by g.posted_on desc, g.created_at desc, g.id desc)
        from page g
    ), '[]'::jsonb)
  )
$$;

-- 20261121000001_notice_keywords.sql에서 옮김(글자 그대로 — 읽음 표시를 보는 병원은 위 notice_list가 read_hospital_id()로 고른다)
create or replace function public.notice_unread_count() returns integer language sql stable security invoker set search_path = ''
as $$
  select (public.notice_list(true, null, false, null, false, 1, 0) ->> 'unread')::integer
$$;
revoke all on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.notice_unread_count() from public, anon, authenticated;
grant execute on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) to authenticated;
grant execute on function public.notice_unread_count() to authenticated;

-- 20261122000000_rule_auto.sql에서 옮김, 읽을 병원(표시를 보는 병원)만 바꿈 — "내 병원이 승인됨" 검사는 my_hospital_id() 그대로
create or replace function public.rule_change_alerts() returns table (id uuid, notice_no text, title text, change_count integer)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.notice_no, n.title, count(*)::integer
    from public.notices n
    join public.rule_changes c on c.notice_id = n.id and c.verdict = 'change' and c.state = 'live'
    left join public.rule_change_marks m on m.change_id = c.id and m.hospital_id = (select public.read_hospital_id())
   where (select public.my_hospital_id()) is not null
     and m.seen_at is null
     and not coalesce(m.reverted, false)
   group by n.id
   order by n.posted_on desc, n.created_at desc, n.id desc
$$;

-- 20261122000000_rule_auto.sql에서 옮김, 읽을 병원(표시를 보는 병원)만 바꿈
create or replace function public.notice_rule_alerts() returns table (id uuid, notice_no text, title text, rule_count integer)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.notice_no, n.title, h.n
    from public.notices n
   cross join lateral (
     select count(*)::integer as n
       from public.rule_changes c
      where c.notice_id = n.id and c.verdict = 'human' and c.state = 'live'
   ) h
   where h.n > 0
     and not exists (
       select 1
         from public.notice_marks m
        where m.notice_id = n.id and m.hospital_id = (select public.read_hospital_id()) and m.rules_checked_at is not null
     )
   order by n.posted_on desc, n.created_at desc, n.id desc
$$;
revoke all on function public.rule_change_alerts() from public, anon, authenticated;
revoke all on function public.notice_rule_alerts() from public, anon, authenticated;
grant execute on function public.rule_change_alerts() to authenticated;
grant execute on function public.notice_rule_alerts() to authenticated;

-- 20261118100000_desk_accounts.sql에서 옮김, 읽을 병원(목록을 고르는 병원)만 바꿈 — 원장이 아니면(보는 중도 아니면) 빈 목록 그대로
create or replace function public.desk_members() returns table (id uuid, email text, created_at timestamptz, signed_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.email, m.created_at,
         (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = m.email and u.last_sign_in_at > m.created_at)
    from public.hospital_members m
   where m.hospital_id = public.read_hospital_id()
   order by m.created_at, m.id
$$;
revoke all on function public.desk_members() from public, anon, authenticated;
grant execute on function public.desk_members() to authenticated;

-- ⑧ 비교 읽기: 관리자만, 승인된 병원 줄만, 종류마다 정해 둔 칸만 jsonb로(열쇠 = 지금 lib/storage가 그 표에서 고르는 칸 이름).
--   이름·연락처·계좌·차트번호·메모 칸은 주지 않는다. 차례는 (병원, 날·달·id)로 정해 두어 나눠 읽기(range)가 겹치지 않는다.
--   부를 때마다 병원 1~30곳, 기간 400일까지(끝 − 시작 ≤ 399). 보기 상태(요청 머리)와 상관없다
create or replace function public.admin_rows(p_kind text, p_hospital_ids uuid[], p_from date, p_to date)
returns table (hospital_id uuid, "row" jsonb) language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_from_month text;
  v_to_month text;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_kind is null or p_hospital_ids is null or p_from is null or p_to is null
     or coalesce(cardinality(p_hospital_ids), 0) not between 1 and 30
     or p_from > p_to or p_to - p_from >= 400 then
    raise exception 'rows not allowed' using errcode = '22023';
  end if;
  select coalesce(array_agg(h.id), '{}') into v_ids
    from public.hospitals h where h.id = any (p_hospital_ids) and h.status = 'approved';
  -- 달 줄('YYYY-MM')은 기간의 첫 달~끝 달
  v_from_month := to_char(p_from, 'YYYY-MM');
  v_to_month := to_char(p_to, 'YYYY-MM');

  if p_kind = 'stats_days' then
    -- lib/storage/stats.ts readPeriod 칸(payload는 날 줄 그대로 — 64KB 한도)
    return query
      select d.hospital_id, jsonb_build_object('day', d.day, 'partial', d.partial, 'source', d.source,
                                               'payload', d.payload, 'updated_at', d.updated_at)
        from public.stats_days d where d.hospital_id = any (v_ids) and d.day between p_from and p_to
       order by d.hospital_id, d.day;
  elsif p_kind = 'stats_months' then
    -- 달 줄 payload 전체(1 MiB)를 주지 않고 rx·groups·dropoff(없으면 null)와 sections만
    return query
      select m.hospital_id, jsonb_build_object('month', m.month, 'partial', m.partial, 'rx', m.payload -> 'rx',
                                               'groups', m.payload -> 'groups', 'dropoff', m.payload -> 'dropoff',
                                               'sections', m.sections)
        from public.stats_months m where m.hospital_id = any (v_ids) and m.month between v_from_month and v_to_month
       order by m.hospital_id, m.month;
  elsif p_kind = 'stats_day_totals' then
    return query
      select d.hospital_id, jsonb_build_object('day', d.day, 'partial', d.partial, 'totals', d.payload -> 'totals')
        from public.stats_days d where d.hospital_id = any (v_ids) and d.day between p_from and p_to
       order by d.hospital_id, d.day;
  elsif p_kind = 'stats_coverage' then
    -- lib/storage/stats.ts readCoverage 칸, 기간과 겹치는 줄
    return query
      select c.hospital_id, jsonb_build_object('from_day', c.from_day, 'to_day', c.to_day)
        from public.stats_coverage c where c.hospital_id = any (v_ids) and c.from_day <= p_to and c.to_day >= p_from
       order by c.hospital_id, c.from_day, c.to_day;
  elsif p_kind = 'stats_rx_groups' then
    -- lib/storage/statsRxGroups.ts 칸(의원마다 자기 처방 묶음)
    return query
      select g.hospital_id, jsonb_build_object('id', g.id, 'name', g.name, 'codes', g.codes, 'out_codes', g.out_codes,
                                               'cond', g.cond, 'sort_order', g.sort_order)
        from public.stats_rx_groups g where g.hospital_id = any (v_ids)
       order by g.hospital_id, g.sort_order, g.id;
  elsif p_kind = 'stats_goals' then
    return query
      select o.hospital_id, jsonb_build_object('month', o.month, 'visits', o.visits, 'new_patients', o.new_patients,
                                               'revenue', o.revenue)
        from public.stats_goals o where o.hospital_id = any (v_ids) and o.month between v_from_month and v_to_month
       order by o.hospital_id, o.month;
  elsif p_kind = 'sales_days' then
    -- lib/storage/revenue.ts SAVED_DAY_SELECT 칸
    return query
      select s.hospital_id, jsonb_build_object('day', s.day, 'visits', s.visits, 'new_patients', s.new_patients,
                                               'return_visits', s.return_visits, 'total', s.total, 'insurer', s.insurer,
                                               'noncovered', s.noncovered, 'copay', s.copay, 'other_total', s.other_total,
                                               'cash', s.cash, 'card', s.card, 'transfer', s.transfer,
                                               'receivable_in', s.receivable_in, 'unconfirmed', s.unconfirmed,
                                               'split_unconfirmed', s.split_unconfirmed, 'rough_total', s.rough_total,
                                               'day_codes', s.day_codes)
        from public.sales_days s where s.hospital_id = any (v_ids) and s.day between p_from and p_to
       order by s.hospital_id, s.day;
  elsif p_kind = 'sales_code_totals' then
    -- sales_code_totals와 같은 합(건수 합 · 금액 합(null 뺌) · 금액이 빠진 줄이 있었는지), 병원마다 코드 차례
    return query
      select d.hospital_id, jsonb_build_object('code', d.code, 'count', sum(d.count)::bigint,
                                               'amount', coalesce(sum(d.amount), 0)::bigint, 'missing', bool_or(d.amount is null))
        from public.sales_day_codes d where d.hospital_id = any (v_ids) and d.day between p_from and p_to
       group by d.hospital_id, d.code
       order by d.hospital_id, d.code;
  elsif p_kind = 'sales_codes' then
    -- lib/storage/revenue.ts CODE_SELECT 칸, 기간의 달(달 첫날 줄)
    return query
      select c.hospital_id, jsonb_build_object('month', c.month, 'code', c.code, 'name', c.name, 'count', c.count,
                                               'amount', c.amount)
        from public.sales_codes c
       where c.hospital_id = any (v_ids) and to_char(c.month, 'YYYY-MM') between v_from_month and v_to_month
       order by c.hospital_id, c.month, c.code;
  elsif p_kind = 'sunap_settings' then
    -- lib/storage/sunap.ts SETTINGS_COLUMNS
    return query
      select s.hospital_id, jsonb_build_object('block_group', s.block_group, 'pt_group', s.pt_group, 'rsv_words', s.rsv_words)
        from public.sunap_settings s where s.hospital_id = any (v_ids)
       order by s.hospital_id;
  elsif p_kind = 'sunap_days' then
    -- lib/storage/sunap.ts DAY_COLUMNS(마감 칸 + 서버 숫자 24칸)
    return query
      select s.hospital_id, jsonb_build_object('work_date', s.work_date, 'closed_at', s.closed_at, 'late', s.late,
                                               'visits', s.visits, 'first_n', s.first_n, 'd90_n', s.d90_n, 'ret_n', s.ret_n,
                                               'block_n', s.block_n, 'pt_n', s.pt_n, 'rsv_first', s.rsv_first,
                                               'rsv_d90', s.rsv_d90, 'first_block', s.first_block, 'd90_block', s.d90_block,
                                               'ret_block', s.ret_block, 'cash_n', s.cash_n, 'cash_won', s.cash_won,
                                               'card_n', s.card_n, 'card_won', s.card_won, 'transfer_n', s.transfer_n,
                                               'transfer_won', s.transfer_won, 'paid_cash_n', s.paid_cash_n,
                                               'paid_cash_won', s.paid_cash_won, 'paid_card_n', s.paid_card_n,
                                               'paid_card_won', s.paid_card_won, 'free_n', s.free_n, 'unpaid_n', s.unpaid_n,
                                               'unpaid_won', s.unpaid_won)
        from public.sunap_days s where s.hospital_id = any (v_ids) and s.work_date between p_from and p_to
       order by s.hospital_id, s.work_date;
  elsif p_kind = 'calendar_settings' then
    -- lib/storage/calendar.ts SETTINGS_COLUMNS
    return query
      select s.hospital_id, jsonb_build_object('kinds', s.kinds, 'staff', s.staff, 'open_hour', s.open_hour,
                                               'close_hour', s.close_hour, 'sunday', s.sunday)
        from public.calendar_settings s where s.hospital_id = any (v_ids)
       order by s.hospital_id;
  elsif p_kind = 'calendar_allday' then
    -- lib/storage/calendar.ts ALLDAY_COLUMNS
    return query
      select d.hospital_id, jsonb_build_object('id', d.id, 'day', d.day, 'type', d.type, 'memo', d.memo,
                                               'staff_id', d.staff_id, 'staff_name', d.staff_name, 'part', d.part)
        from public.calendar_allday d where d.hospital_id = any (v_ids) and d.day between p_from and p_to
       order by d.hospital_id, d.day, d.created_at, d.id;
  elsif p_kind = 'calendar_counts' then
    -- lib/storage/calendar.ts COUNT_COLUMNS — 예약 줄의 숫자 칸만(이름·차트번호·메모 없음)
    return query
      select a.hospital_id, jsonb_build_object('day', a.day, 'staff_id', a.staff_id, 'staff_name', a.staff_name,
                                               'kind_id', a.kind_id, 'kind_name', a.kind_name, 'status', a.status,
                                               'auto', a.auto, 'orig_day', a.orig_day)
        from public.calendar_appts a where a.hospital_id = any (v_ids) and a.day between p_from and p_to
       order by a.hospital_id, a.day, a.id;
  elsif p_kind = 'clinic_profiles' then
    -- 카드 글·진료 시간에 드는 칸만(전화·주소·로고 자리 없음)
    return query
      select p.hospital_id, jsonb_build_object('display_name', p.display_name, 'honorific', p.honorific, 'hours', p.hours,
                                               'closed_dates', p.closed_dates, 'staff', p.staff)
        from public.clinic_profiles p where p.hospital_id = any (v_ids)
       order by p.hospital_id;
  elsif p_kind = 'staff_members' then
    -- 직군·고용 형태·들어온 날·나간 날만(이름·전화·생일·주소·계좌·메모 없음)
    return query
      select s.hospital_id, jsonb_build_object('id', s.id, 'job', s.job, 'employment', s.employment,
                                               'hired_on', s.hired_on, 'left_on', s.left_on)
        from public.staff_members s where s.hospital_id = any (v_ids)
       order by s.hospital_id, s.id;
  elsif p_kind = 'staff_pay' then
    -- 그달 급여 줄의 금액 칸만(조정 사유·메모 없음)
    return query
      select l.hospital_id, jsonb_build_object('month', l.month, 'staff_id', l.staff_id, 'amounts', l.amounts,
                                               'incentives', l.incentives, 'adjust', l.adjust)
        from public.staff_pay_lines l where l.hospital_id = any (v_ids) and l.month between v_from_month and v_to_month
       order by l.hospital_id, l.month, l.id;
  elsif p_kind = 'staff_settings' then
    return query
      select s.hospital_id, jsonb_build_object('pay_items', s.pay_items)
        from public.staff_settings s where s.hospital_id = any (v_ids)
       order by s.hospital_id;
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;
end;
$$;

-- 권한: Postgres는 새 함수를 PUBLIC에, Supabase는 anon·authenticated에도 연다. 다 거두고 필요한 것만 authenticated에 준다.
-- admin_view_key는 거두기만(정의자 함수 안에서만 쓴다). admin_view_hospital_id·read_hospital_id·admin_view_open은 정책·invoker 함수 안에서
-- 사용자 권한으로 돌아 authenticated가 부를 수 있어야 한다(답은 부른 사람 자신의 보기뿐)
revoke all on function public.admin_view_key() from public, anon, authenticated;
revoke all on function public.admin_view_hospital_id() from public, anon, authenticated;
revoke all on function public.read_hospital_id() from public, anon, authenticated;
revoke all on function public.admin_view_open(text) from public, anon, authenticated;
revoke all on function public.start_admin_view(uuid) from public, anon, authenticated;
revoke all on function public.stop_admin_view() from public, anon, authenticated;
revoke all on function public.my_admin_view() from public, anon, authenticated;
revoke all on function public.admin_view_log() from public, anon, authenticated;
revoke all on function public.admin_view_hospitals() from public, anon, authenticated;
revoke all on function public.set_hospital_region(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_rows(text, uuid[], date, date) from public, anon, authenticated;
grant execute on function public.admin_view_hospital_id() to authenticated;
grant execute on function public.read_hospital_id() to authenticated;
grant execute on function public.admin_view_open(text) to authenticated;
grant execute on function public.start_admin_view(uuid) to authenticated;
grant execute on function public.stop_admin_view() to authenticated;
grant execute on function public.my_admin_view() to authenticated;
grant execute on function public.admin_view_log() to authenticated;
grant execute on function public.admin_view_hospitals() to authenticated;
grant execute on function public.set_hospital_region(uuid, text) to authenticated;
grant execute on function public.admin_rows(text, uuid[], date, date) to authenticated;
