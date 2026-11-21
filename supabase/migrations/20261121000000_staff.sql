-- 직원 탭 DB: 표 열(staff_members·staff_week_plans·staff_day_changes·staff_overtime·staff_leaves·staff_settings·staff_incentive_rules·
-- staff_pay_lines·staff_pay_months·staff_files)·휴가 → 예약 '휴무' 잇기(calendar_allday.part·leave_id와 트리거 둘)·직원 파일 바구니(Storage) staff-files
-- (spec staff REQ-7601·REQ-7602·REQ-7603, ADR-035)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql·20261030000000_precheck_settings.sql(my_hospital_id())·업무일지 넷·통계 묶음 둘·20261116000000_sunap.sql·
-- 20261117010000_calendar.sql(calendar_allday·calendar_bump())·20261118100000_desk_accounts.sql(my_clinic_hospital_id())·
-- 20261119000000_clinic_profile.sql(clinic_profiles.staff)·20261119300000_clinic_emr.sql·20261119400000_hospital_emr.sql이 들어가 있어야 한다.
-- my_hospital_id()·calendar_bump()는 여기서 다시 만들지 않는다(글자·권한 그대로).
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 칸·이름 있는 제약은 없을 때만 더하고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고,
-- 정책은 지우고 다시 만들고, 바구니 설정은 이 파일 값으로 되돌린다. 이미 있던 줄은 그대로). 앞 파일을 다시 붙여 넣어도 이 파일이 더한 것은 그대로다.
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(예약 달력이 calendar_allday.part를 읽어, 없으면 예약 종일 줄 읽기가 실패한다. 직원 탭도 표가 없으면 읽기 실패 글을 보인다).
-- 실행 뒤 Storage 화면에 staff-files 바구니가 보이고 'Private'(공개 아님)인지 본다.
--
-- 무엇을 왜(ADR-035): 원장이 직원 명단·근무표·휴가·급여를 한 곳에서 본다. 직원 연락처·주소·생일·계좌·근무·휴가·급여·서류 파일을 서버에 둔다
-- (plan.md 4절 '서버로 가는 것'을 넓힘). 주민번호 칸은 어느 표에도 없다. 환자 자료는 들어가지 않는다. 금액은 원 단위 정수다.
-- 휴가 → 예약 '휴무'는 앱이 아니라 DB 트리거가 잇는다: 예약 시행자와 이어진 직원의 휴가를 넣으면 그날 그 시행자 '휴무' 줄(반차는 오전·오후)이 생기고,
-- 휴가를 지우면 함께 지워지며, 연결을 끊거나 바꾸면 다시 맞춘다. 손으로 넣은 '휴무' 줄은 건드리지 않는다.
-- 급여 확정 잠금은 없다. 직원을 지워도(퇴사 3년 뒤) 그 사람 달별 급여 줄은 staff_id만 비워 남는다(달별 인건비가 안 바뀐다).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 원장(authenticated, my_hospital_id())만 자기 병원 줄을 읽고 쓴다.
-- 데스크 정책은 두지 않는다(데스크·승인 대기·거절·병원 없는 사용자는 아무 줄도 못 본다). 표마다 public·anon·authenticated 권한을 다 거둔 뒤
-- 칸 단위로만 준다. id·hospital_id·created_at·updated_at은 칸 권한이 없어 DB(기본값·트리거)만 정한다. 휴가·파일 줄은 고치기 없음(지우고 다시 넣음),
-- 설정·급여 줄·달 줄은 지우기 없음. 직원 지우기는 퇴사일 + 3년이 한국 오늘보다 앞인 사람만이다.
-- 기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄은 앱이 '고치고, 없으면 넣기'로 저장한다(그 열쇠 줄의 값 칸만 고치고, 없으면 열쇠와 함께 넣는다).
-- 그래서 열쇠 칸(직원·시작일·날·종류·달)에는 고치기 권한이 없다(넣기만). 직원 id + 병원 id 외래 키가 남의 병원 직원을 막는다.
-- 앞 판(열쇠 칸 고치기를 주던 것)을 이미 실행한 DB에 다시 붙여 넣어도 권한을 다 거두고 다시 주므로 이 표가 된다.
-- calendar_allday의 part·leave_id는 사용자 넣기 권한이 없어 트리거만 쓴다(읽기는 표 권한대로 원장·데스크 모두).
-- 직원 파일은 비공개 바구니 staff-files의 '<병원 id>/doc/<직원 id>/<uuid>.<확장자>'·'<병원 id>/tax/<YYYY-MM>/<uuid>.<확장자>'에 두고,
-- 원장이 자기 병원 폴더 것만 읽고 지우며, 올리기는 같은 이름의 staff_files 줄을 먼저 넣었을 때만이다(덮어쓰기 없음).
-- 직원마다 서류·달마다 세무사 파일은 20개까지다

-- 직원 한 사람. 근무 형태 regular(정규직)·contract(계약직)·part(파트타임). 0.5 단위 = x * 2가 정수.
-- used_before = 앱을 쓰기 전 이번 연차 기간에 이미 쓴 연차, used_before_from = 그 값을 적은 날이 든 연차 기간 시작일
-- carry_start = 넘어온 연차 시작 값('carry' 병원 셈에서 시작 기간(등록일이 든 연차 기간)으로 넘어온 일수, −30~100, 0.5 단위, 안 보내면 0)
-- registered_on = 웹앱에 처음 넣은 날(넣은 때의 한국 오늘, 시작 기간을 정함). 칸 권한이 없어 DB 기본값만 정한다
create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  job text not null check (job in ('간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타')),
  job_other text,
  employment text not null check (employment in ('regular', 'contract', 'part')),
  weekly_hours numeric(4, 1) not null default 40 check (weekly_hours between 0 and 80 and weekly_hours * 2 = trunc(weekly_hours * 2)),
  hired_on date not null,
  left_on date,
  phone text check (phone ~ '^[0-9]{9,11}$'),
  birthday date,
  address text check (char_length(address) <= 100),
  bank text check (char_length(bank) <= 20),
  account_no text check (account_no ~ '^[0-9-]{6,30}$'),
  calendar_staff_id text check (char_length(calendar_staff_id) between 1 and 40),
  memo text check (char_length(memo) <= 500),
  used_before numeric(3, 1) not null default 0 check (used_before between 0 and 50 and used_before * 2 = trunc(used_before * 2)),
  used_before_from date,
  carry_start numeric(4, 1) not null default 0 check (carry_start between -30 and 100 and carry_start * 2 = trunc(carry_start * 2)),
  registered_on date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 직접 적은 직종은 '기타'일 때만
  check (job_other is null or (job = '기타' and char_length(job_other) between 1 and 20)),
  check (left_on is null or left_on >= hired_on),
  unique (hospital_id, name, hired_on),
  unique (id, hospital_id)
);
-- 두 칸이 없는 앞 판 표를 이미 실행한 DB에도 같은 정의로 더한다(있으면 그대로. 이미 있던 줄은 0·붙여 넣은 날 한국 오늘이 된다)
alter table public.staff_members add column if not exists carry_start numeric(4, 1) not null default 0 check (carry_start between -30 and 100 and carry_start * 2 = trunc(carry_start * 2));
alter table public.staff_members add column if not exists registered_on date not null default (now() at time zone 'Asia/Seoul')::date;
-- 같은 예약 시행자 id는 병원 안 한 사람에게만
create unique index if not exists staff_members_calendar_one on public.staff_members (hospital_id, calendar_staff_id) where calendar_staff_id is not null;

-- 기본 근무 한 판(시작일부터). week = 월~일 일곱 칸({start, end, lunchFrom, lunchTo} 분 또는 null = 쉼). 안 모양은 앱이 checkWeek로 본다.
-- DB는 배열·길이·크기만 막는다. sat_rotation = 토요일 'every'(매주)·'1-3'(첫째·셋째)·'2-4'(둘째·넷째)
create table if not exists public.staff_week_plans (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  staff_id uuid not null,
  from_day date not null,
  week jsonb not null check (
    case when jsonb_typeof(week) = 'array' then jsonb_array_length(week) = 7 and octet_length(week::text) <= 1000 else false end
  ),
  sat_rotation text not null check (sat_rotation in ('every', '1-3', '2-4')),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade,
  unique (staff_id, from_day)
);

-- 바뀐 날 한 줄: 근무(시작·끝, 점심은 둘 다 있거나 없고 근무 안) 또는 쉼(모두 null). 분, 10분 단위
create table if not exists public.staff_day_changes (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  staff_id uuid not null,
  day date not null,
  start_min smallint check (start_min >= 0 and start_min % 10 = 0),
  end_min smallint check (end_min <= 1440 and end_min % 10 = 0),
  lunch_from smallint check (lunch_from % 10 = 0),
  lunch_to smallint check (lunch_to % 10 = 0),
  memo text check (char_length(memo) <= 50),
  check ((start_min is null) = (end_min is null)),
  check ((lunch_from is null) = (lunch_to is null)),
  check (start_min < end_min),
  check (lunch_from is null or (start_min is not null and start_min <= lunch_from and lunch_from < lunch_to and lunch_to <= end_min)),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade,
  unique (staff_id, day)
);

-- 더 일한 시간: 연장(extended)·야간(night)·휴일(holiday), 30분 단위
create table if not exists public.staff_overtime (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  staff_id uuid not null,
  day date not null,
  kind text not null check (kind in ('extended', 'night', 'holiday')),
  minutes smallint not null check (minutes between 30 and 1440 and minutes % 30 = 0),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade,
  unique (staff_id, day, kind)
);

-- 휴가 하루 한 줄(여러 날 휴가는 같은 group_id). 반차만 오전·오후, 유급 표시는 병가만 고른다(무급(결근)은 늘 무급, 나머지는 늘 유급).
-- 고치기 없음(묶음을 지우고 다시 넣는다)
create table if not exists public.staff_leaves (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  group_id uuid not null,
  staff_id uuid not null,
  day date not null,
  kind text not null check (kind in ('annual', 'half', 'family', 'sick', 'maternity', 'unpaid')),
  part text check (part in ('am', 'pm')),
  paid boolean not null default true,
  memo text check (char_length(memo) <= 50),
  check ((kind = 'half') = (part is not null)),
  check (kind = 'sick' or paid = (kind <> 'unpaid')),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade,
  unique (staff_id, day)
);

-- 병원 직원 설정 한 줄: 연차 기준(입사일 hire·1월 1일 jan1)·못 쓴 연차(수당 pay·다음 해로 carry)·급여 항목 목록.
-- 급여 항목 안 모양은 앱이 checkPayItems로 본다. DB는 배열·30개·4,000바이트만 막는다. 지우기 없음
create table if not exists public.staff_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  leave_basis text not null default 'hire' check (leave_basis in ('hire', 'jan1')),
  leftover text not null default 'pay' check (leftover in ('pay', 'carry')),
  pay_items jsonb not null default '[{"id":"base","name":"기본급","kind":"amount","base":true,"removedFrom":null},{"id":"overtime","name":"연장수당","kind":"amount","base":true,"removedFrom":null},{"id":"meal","name":"식대","kind":"amount","base":true,"removedFrom":null},{"id":"incentive","name":"인센티브","kind":"incentive","base":true,"removedFrom":null},{"id":"bonus","name":"상여","kind":"amount","base":true,"removedFrom":null}]'::jsonb
    check (case when jsonb_typeof(pay_items) = 'array' then jsonb_array_length(pay_items) <= 30 and octet_length(pay_items::text) <= 4000 else false end),
  updated_at timestamptz not null default now()
);

-- 사람마다 인센티브 규칙: 건당 정액(per_case)·고정 수당(fixed)은 금액(원), 매출의 %(percent)는 0~100 소수 둘째 자리
create table if not exists public.staff_incentive_rules (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  staff_id uuid not null,
  name text not null check (char_length(name) between 1 and 20),
  method text not null check (method in ('per_case', 'percent', 'fixed')),
  unit_amount bigint check (unit_amount >= 0),
  percent numeric(5, 2) check (percent between 0 and 100),
  sort integer not null default 0,
  check (
    (method = 'percent' and percent is not null and unit_amount is null)
    or (method in ('per_case', 'fixed') and unit_amount is not null and percent is null)
  ),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade
);

-- 달('YYYY-MM')마다 한 사람 급여 줄: 항목 금액 {항목 id: 원}·그때 인센티브 규칙 복사와 실적·조정(±). 직원을 지우면 staff_id만 비워 남는다. 지우기 없음
create table if not exists public.staff_pay_lines (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  staff_id uuid,
  amounts jsonb not null default '{}'::jsonb check (jsonb_typeof(amounts) = 'object' and octet_length(amounts::text) <= 2000),
  incentives jsonb not null default '[]'::jsonb check (jsonb_typeof(incentives) = 'array' and octet_length(incentives::text) <= 4000),
  adjust bigint not null default 0 check (adjust between -100000000 and 100000000),
  adjust_reason text check (adjust_reason in ('prorate', 'deduct', 'other')),
  adjust_memo text check (char_length(adjust_memo) <= 30),
  updated_at timestamptz not null default now(),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete set null (staff_id),
  unique (hospital_id, month, staff_id)
);

-- 병원·달마다 한 줄: 병원 부담분(원, 비움 가능)·저장한 날·지난달 금액 가져온 날. 지우기 없음
create table if not exists public.staff_pay_months (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  employer_cost bigint check (employer_cost >= 0),
  cost_saved_on date,
  copied_on date,
  primary key (hospital_id, month)
);

-- 바구니 staff-files의 파일 한 줄: 직원 서류(doc: 직원 있음·달 없음, PDF·JPEG·PNG) 또는 세무사 파일(tax: 직원 없음·달 있음, PDF·ZIP·XLSX·XLS·JPEG·PNG).
-- 경로 '<병원 id>/doc/<직원 id>/<uuid>.<확장자>'·'<병원 id>/tax/<YYYY-MM>/<uuid>.<확장자>'(첫 폴더 = 이 줄의 병원). 고치기 없음
create table if not exists public.staff_files (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('doc', 'tax')),
  staff_id uuid,
  month text check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  name text not null check (char_length(name) between 1 and 100),
  path text not null unique check (
    char_length(path) <= 200
    and path ~ '^[0-9a-f-]{36}/(doc/[0-9a-f-]{36}|tax/[0-9]{4}-[0-9]{2})/[0-9a-f-]{36}\.[a-z0-9]{1,5}$'
  ),
  size integer not null check (size between 1 and 10000000),
  mime text not null,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = hospital_id::text),
  check (
    (kind = 'doc' and staff_id is not null and month is null
      and split_part(path, '/', 2) = 'doc' and split_part(path, '/', 3) = staff_id::text
      and mime in ('application/pdf', 'image/jpeg', 'image/png'))
    or (kind = 'tax' and staff_id is null and month is not null
      and split_part(path, '/', 2) = 'tax' and split_part(path, '/', 3) = month
      and mime in ('application/pdf', 'application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                   'application/vnd.ms-excel', 'image/jpeg', 'image/png'))
  ),
  foreign key (staff_id, hospital_id) references public.staff_members (id, hospital_id) on delete cascade
);

-- 예약 종일 줄에 반차(part: 'am'·'pm', 'off' 줄만, null = 종일)와 휴가 줄(leave_id: 휴가가 지워지면 함께 지움)을 더한다.
-- 사용자 넣기 칸 목록(day, type, memo, staff_id, staff_name)은 그대로 두어 두 칸은 아래 트리거만 쓴다
alter table public.calendar_allday add column if not exists part text;
alter table public.calendar_allday add column if not exists leave_id uuid references public.staff_leaves (id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.calendar_allday'::regclass and conname = 'calendar_allday_part'
  ) then
    alter table public.calendar_allday
      add constraint calendar_allday_part check (part is null or (type = 'off' and part in ('am', 'pm')));
  end if;
end
$$;

-- 고칠 때마다 updated_at = 지금(직원·설정·급여 줄. clinic_profiles_touch와 같은 모양). 트리거만 부른다
create or replace function public.staff_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 파일 20개 한도: 같은 병원 같은 직원 서류(doc) 또는 같은 달 세무사 파일(tax)이 이미 20개면 넣지 않는다.
-- 넣는 사람 권한 그대로(RLS 적용) 세므로 내 병원 줄만 센다
create or replace function public.staff_files_limit() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (
    select count(*) from public.staff_files f
     where f.hospital_id = new.hospital_id and f.kind = new.kind
       and (case when new.kind = 'doc' then f.staff_id = new.staff_id else f.month = new.month end)
  ) >= 20 then
    raise exception 'staff files limit 20' using errcode = '23514';
  end if;
  return new;
end
$$;

-- 휴가 → 예약 '휴무': 직원의 예약 시행자 id가 그 병원 병원 정보 직원 목록(clinic_profiles.staff)에 있으면 그날 그 시행자 'off' 줄을 넣는다
-- (이름은 병원 정보 이름 앞 10자, 반차면 part). 그날 그 시행자 'off' 줄이 이미 있으면(손으로 넣음) 그대로 둔다.
-- 사용자에게 part·leave_id 넣기 권한이 없어 함수 주인 권한(security definer)으로 쓴다. 쓰는 줄은 이 휴가의 병원 것뿐이다.
-- 종일 줄 트리거 calendar_bump()가 그대로 내 rev를 올린다
create or replace function public.staff_leave_link() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id)
  select new.hospital_id, new.day, 'off', m.calendar_staff_id, who.staff_name, new.part, new.id
    from public.staff_members m
   cross join lateral (
     select left(e.person ->> 'name', 10) as staff_name
       from public.clinic_profiles p
      cross join lateral jsonb_array_elements(p.staff) as e (person)
      where p.hospital_id = m.hospital_id
        and e.person ->> 'id' = m.calendar_staff_id
        and coalesce(e.person ->> 'name', '') <> ''
      limit 1
   ) who
   where m.id = new.staff_id and m.hospital_id = new.hospital_id and m.calendar_staff_id is not null
  on conflict (hospital_id, day, staff_id) where type = 'off' do nothing;
  return null;
end
$$;

-- 연결 바꾸기: 직원의 예약 시행자 id가 바뀌면 그 직원 휴가에서 온 줄을 모두 지우고, 새 id가 있으면 한국 오늘 − 1년 이후 휴가마다 위와 같이 다시 넣는다
-- (지난 예약·종일 줄을 1년 뒤 지우는 것과 같은 경계). 손으로 넣은 줄(leave_id 없음)은 건드리지 않는다
create or replace function public.staff_member_relink() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.calendar_allday d
   where d.hospital_id = new.hospital_id
     and d.leave_id in (select l.id from public.staff_leaves l where l.staff_id = new.id);
  if new.calendar_staff_id is not null then
    insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id)
    select l.hospital_id, l.day, 'off', new.calendar_staff_id, who.staff_name, l.part, l.id
      from public.staff_leaves l
     cross join lateral (
       select left(e.person ->> 'name', 10) as staff_name
         from public.clinic_profiles p
        cross join lateral jsonb_array_elements(p.staff) as e (person)
        where p.hospital_id = new.hospital_id
          and e.person ->> 'id' = new.calendar_staff_id
          and coalesce(e.person ->> 'name', '') <> ''
        limit 1
     ) who
     where l.staff_id = new.id and l.hospital_id = new.hospital_id
       and l.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
    on conflict (hospital_id, day, staff_id) where type = 'off' do nothing;
  end if;
  return null;
end
$$;

-- 트리거만 부른다. 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거둔다
revoke all on function public.staff_touch() from public, anon, authenticated;
revoke all on function public.staff_files_limit() from public, anon, authenticated;
revoke all on function public.staff_leave_link() from public, anon, authenticated;
revoke all on function public.staff_member_relink() from public, anon, authenticated;

create or replace trigger staff_members_touch before update on public.staff_members
  for each row execute function public.staff_touch();
create or replace trigger staff_settings_touch before update on public.staff_settings
  for each row execute function public.staff_touch();
create or replace trigger staff_pay_lines_touch before update on public.staff_pay_lines
  for each row execute function public.staff_touch();
create or replace trigger staff_files_limit before insert on public.staff_files
  for each row execute function public.staff_files_limit();
create or replace trigger staff_leave_link after insert on public.staff_leaves
  for each row execute function public.staff_leave_link();
create or replace trigger staff_member_relink after update of calendar_staff_id on public.staff_members
  for each row when (old.calendar_staff_id is distinct from new.calendar_staff_id) execute function public.staff_member_relink();

alter table public.staff_members enable row level security;
alter table public.staff_week_plans enable row level security;
alter table public.staff_day_changes enable row level security;
alter table public.staff_overtime enable row level security;
alter table public.staff_leaves enable row level security;
alter table public.staff_settings enable row level security;
alter table public.staff_incentive_rules enable row level security;
alter table public.staff_pay_lines enable row level security;
alter table public.staff_pay_months enable row level security;
alter table public.staff_files enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.staff_members from public, anon, authenticated;
revoke all on table public.staff_week_plans from public, anon, authenticated;
revoke all on table public.staff_day_changes from public, anon, authenticated;
revoke all on table public.staff_overtime from public, anon, authenticated;
revoke all on table public.staff_leaves from public, anon, authenticated;
revoke all on table public.staff_settings from public, anon, authenticated;
revoke all on table public.staff_incentive_rules from public, anon, authenticated;
revoke all on table public.staff_pay_lines from public, anon, authenticated;
revoke all on table public.staff_pay_months from public, anon, authenticated;
revoke all on table public.staff_files from public, anon, authenticated;

-- 직원: 읽기·지우기(정책이 퇴사 3년 지난 사람만), 넣기·고치기는 값 칸 열일곱(registered_on은 칸 권한이 없어 DB 기본값만)
grant select, delete on table public.staff_members to authenticated;
grant insert (name, job, job_other, employment, weekly_hours, hired_on, left_on, phone, birthday, address, bank, account_no,
              calendar_staff_id, memo, used_before, used_before_from, carry_start),
  update (name, job, job_other, employment, weekly_hours, hired_on, left_on, phone, birthday, address, bank, account_no,
          calendar_staff_id, memo, used_before, used_before_from, carry_start)
  on table public.staff_members to authenticated;

-- 기본 근무·바뀐 날·더 일한 시간: 읽기·지우기, 넣기, 고치기는 값 칸만(열쇠 칸 직원·시작일·날·종류는 고치기 없음 — 고치고, 없으면 넣기)
grant select, delete on table public.staff_week_plans to authenticated;
grant insert (staff_id, from_day, week, sat_rotation), update (week, sat_rotation)
  on table public.staff_week_plans to authenticated;
grant select, delete on table public.staff_day_changes to authenticated;
grant insert (staff_id, day, start_min, end_min, lunch_from, lunch_to, memo),
  update (start_min, end_min, lunch_from, lunch_to, memo)
  on table public.staff_day_changes to authenticated;
grant select, delete on table public.staff_overtime to authenticated;
grant insert (staff_id, day, kind, minutes), update (minutes) on table public.staff_overtime to authenticated;

-- 휴가: 읽기·지우기·넣기(고치기 없음 — 묶음을 지우고 다시 넣는다)
grant select, delete on table public.staff_leaves to authenticated;
grant insert (group_id, staff_id, day, kind, part, paid, memo) on table public.staff_leaves to authenticated;

-- 설정: 읽기, 넣기·고치기 세 칸(지우기 없음, upsert onConflict hospital_id)
grant select on table public.staff_settings to authenticated;
grant insert (leave_basis, leftover, pay_items), update (leave_basis, leftover, pay_items) on table public.staff_settings to authenticated;

-- 인센티브 규칙: 읽기·지우기, 넣기, 고치기(직원은 그대로)
grant select, delete on table public.staff_incentive_rules to authenticated;
grant insert (staff_id, name, method, unit_amount, percent, sort), update (name, method, unit_amount, percent, sort)
  on table public.staff_incentive_rules to authenticated;

-- 급여 줄·달 줄: 읽기, 넣기, 고치기는 값 칸만(지우기 없음, 열쇠 칸 달·직원은 고치기 없음 — 고치고, 없으면 넣기)
grant select on table public.staff_pay_lines to authenticated;
grant insert (month, staff_id, amounts, incentives, adjust, adjust_reason, adjust_memo),
  update (amounts, incentives, adjust, adjust_reason, adjust_memo)
  on table public.staff_pay_lines to authenticated;
grant select on table public.staff_pay_months to authenticated;
grant insert (month, employer_cost, cost_saved_on, copied_on), update (employer_cost, cost_saved_on, copied_on)
  on table public.staff_pay_months to authenticated;

-- 파일 줄: 읽기·지우기·넣기(고치기 없음)
grant select, delete on table public.staff_files to authenticated;
grant insert (kind, staff_id, month, name, path, size, mime) on table public.staff_files to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장이 아니면(데스크·대기·거절) null이라 아무 줄과도 같지 않다
drop policy if exists "내 병원 직원 읽기" on public.staff_members;
create policy "내 병원 직원 읽기" on public.staff_members
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 직원 넣기" on public.staff_members;
create policy "내 병원 직원 넣기" on public.staff_members
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 직원 고치기" on public.staff_members;
create policy "내 병원 직원 고치기" on public.staff_members
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
-- 지우기는 퇴사일 + 3년이 한국 오늘보다 앞인 사람만(임금대장 3년 보존)
drop policy if exists "퇴사 3년 지난 내 병원 직원 지우기" on public.staff_members;
create policy "퇴사 3년 지난 내 병원 직원 지우기" on public.staff_members
  for delete to authenticated
  using (
    hospital_id = (select public.my_hospital_id())
    and left_on is not null
    and left_on + interval '3 years' < (now() at time zone 'Asia/Seoul')::date
  );

drop policy if exists "승인된 내 병원 기본 근무만" on public.staff_week_plans;
create policy "승인된 내 병원 기본 근무만" on public.staff_week_plans
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 바뀐 날만" on public.staff_day_changes;
create policy "승인된 내 병원 바뀐 날만" on public.staff_day_changes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 더 일한 시간만" on public.staff_overtime;
create policy "승인된 내 병원 더 일한 시간만" on public.staff_overtime
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 휴가만" on public.staff_leaves;
create policy "승인된 내 병원 휴가만" on public.staff_leaves
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 직원 설정만" on public.staff_settings;
create policy "승인된 내 병원 직원 설정만" on public.staff_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 인센티브 규칙만" on public.staff_incentive_rules;
create policy "승인된 내 병원 인센티브 규칙만" on public.staff_incentive_rules
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 급여 줄만" on public.staff_pay_lines;
create policy "승인된 내 병원 급여 줄만" on public.staff_pay_lines
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 급여 달 줄만" on public.staff_pay_months;
create policy "승인된 내 병원 급여 달 줄만" on public.staff_pay_months
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "승인된 내 병원 직원 파일 줄만" on public.staff_files;
create policy "승인된 내 병원 직원 파일 줄만" on public.staff_files
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

-- 직원 파일 바구니: 공개 아님, 한 파일 10,000,000바이트, PDF·JPEG·PNG·ZIP·XLSX·XLS만. 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('staff-files', 'staff-files', false, 10000000, array['application/pdf', 'image/jpeg', 'image/png', 'application/zip',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
  on conflict (id) do update set public = false, file_size_limit = 10000000,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'application/zip',
                               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];

-- 파일 이름의 첫 폴더가 내 병원 id인 것만 원장이 읽고 지운다. 올리기는 거기에 더해 같은 이름의 내 병원 staff_files 줄이 먼저 있을 때만
-- (줄을 먼저 넣고 → 올린다). 고치기(덮어쓰기) 규칙은 두지 않는다. 데스크는 my_hospital_id()가 null이라 아무것도 못 한다
drop policy if exists "내 병원 직원 파일 읽기" on storage.objects;
create policy "내 병원 직원 파일 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-files' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
drop policy if exists "내 병원 직원 파일 올리기" on storage.objects;
create policy "내 병원 직원 파일 올리기" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-files'
    and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
    and exists (
      select 1 from public.staff_files f
       where f.hospital_id = (select public.my_hospital_id()) and f.path = objects.name
    )
  );
drop policy if exists "내 병원 직원 파일 지우기" on storage.objects;
create policy "내 병원 직원 파일 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-files' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
