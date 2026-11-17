-- 예약 탭 서버 표: 병원 설정(calendar_settings)·예약 한 줄(calendar_appts)·종일 줄(calendar_allday)·바뀜 숫자(calendar_rev)
-- (spec clinic-calendar REQ-5901·REQ-5906, ADR-030)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261030000000_precheck_settings.sql(또는 my_hospital_id()를 만드는 다른 앞 migration)이
-- 들어가 있어야 한다(hospitals 표, my_hospital_id() 함수). my_hospital_id()는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다.
-- 이미 있던 줄은 그대로). 트리거 바꿔 쓰기(create or replace trigger)는 Postgres 14 이상이다(Supabase는 15 이상).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(표가 없으면 예약 탭 읽기·저장이 실패 글을 보인다).
--
-- 무엇을 왜(ADR-030): 예약 탭이 의원 공용 구글 캘린더를 대신한다. 접수·치료실·진료실 PC와 폰이 같은 예약표를 보려고
-- 예약 한 줄(날짜·시작·길이·환자 이름·차트번호(없어도 됨)·시행자·종류·메모·도착 상태·처음 자리)을 서버에 둔다.
-- 이것은 "환자 개인정보는 의원 PC 밖으로 나가지 않는다"의 예외이고 이 표들에만 연다.
-- 두지 않는 것: 전화번호·주민번호·주소·성별·나이·생일·마지막 내원·비트 접수 목록·비트 자체 예약. 그런 칸이 없다.
-- 이름·메모의 개인정보 모양(전화·주민번호·메일)은 앱이 보내지 않는다. DB는 길이·모양·종류만 막는다.
-- 비트에서 서버로 오는 값은 비트 PC가 정한 도착 표시(auto: came·noshow·비움) 하나다.
-- 지난 예약: 날짜가 한국 날짜 오늘 − 1년보다 이른 예약·종일 줄은 예약을 넣을 때마다 트리거가 지운다(확장 기능·예약 작업 없음).
-- 다른 PC: 세 표가 바뀔 때마다 트리거가 calendar_rev 숫자를 늘리고, 화면은 5초마다 그 숫자 하나만 읽는다(Realtime 안 씀).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)만 자기 병원 줄을 읽고,
-- 예약은 넣고·고치고·지우고, 종일 줄은 넣고·지우고(고치기 없음), 설정은 넣고·고치고(지우기 없음), rev는 읽기만 한다.
-- hospital_id·id·created_at·updated_at·처음 자리(orig_day·orig_start)는 칸 권한이 없어 DB(기본값·트리거)만 정한다.
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다

-- 병원 설정 한 줄. 종류(kinds)·시행자(staff) 안 모양은 앱이 checkCalendarSettings로 본다. DB는 배열인지·크기만 막는다
create table if not exists public.calendar_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  -- color null = 시행자 색 따름
  kinds jsonb not null default '[{"id":"dosu","name":"도수","len":30,"color":null},{"id":"jabo","name":"자보도수","len":30,"color":null},{"id":"shock","name":"충격파","len":15,"color":null},{"id":"inj","name":"주사","len":10,"color":"pink"},{"id":"visit","name":"진료","len":10,"color":"lime"}]'::jsonb
    check (jsonb_typeof(kinds) = 'array' and octet_length(kinds::text) < 8000),
  staff jsonb not null default '[]'::jsonb check (jsonb_typeof(staff) = 'array' and octet_length(staff::text) < 8000),
  open_hour integer not null default 8 check (open_hour between 5 and 12),
  close_hour integer not null default 20 check (close_hour between 12 and 24),
  sunday boolean not null default false
);

-- 예약 한 줄. 시작·길이는 분(시작 10분 칸, 길이 5분씩). 시행자·종류는 설정의 id와 그때 이름을 함께 둔다(목록에서 지워도 이름이 남는다)
create table if not exists public.calendar_appts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null,
  start_min smallint not null check (start_min between 0 and 1430 and start_min % 10 = 0),
  len_min smallint not null check (len_min between 5 and 240 and len_min % 5 = 0),
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  chart text check (chart ~ '^[0-9]{1,10}$'), -- 신환은 비움
  staff_id text not null check (char_length(staff_id) between 1 and 40),
  staff_name text not null check (char_length(staff_name) between 1 and 10),
  staff_mark text not null check (char_length(staff_mark) = 1),
  kind_id text not null check (char_length(kind_id) between 1 and 40),
  kind_name text not null check (char_length(kind_name) between 1 and 10),
  memo text not null default '' check (char_length(memo) <= 100),
  status text not null default 'auto' check (status in ('auto', 'came', 'noshow', 'cancel')), -- auto = 도착은 비트 따라
  auto text check (auto in ('came', 'noshow')), -- 비트 PC가 정한 도착 표시(비움 = 아직)
  orig_day date, -- 처음 자리(날짜·시작을 처음 옮기기 전). 트리거만 적는다
  orig_start smallint check (orig_start between 0 and 1430),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((orig_day is null) = (orig_start is null))
);
create index if not exists calendar_appts_day on public.calendar_appts (hospital_id, day);

-- 종일 한 줄: 메모(20자) 또는 시행자 휴무. 고치기 없음(지우고 다시 넣는다)
create table if not exists public.calendar_allday (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null,
  type text not null check (type in ('memo', 'off')),
  memo text check (char_length(memo) between 1 and 20 and memo = btrim(memo)),
  staff_id text check (char_length(staff_id) between 1 and 40),
  staff_name text check (char_length(staff_name) between 1 and 10),
  created_at timestamptz not null default now(),
  check (
    (type = 'memo' and memo is not null and staff_id is null and staff_name is null)
    or (type = 'off' and memo is null and staff_id is not null and staff_name is not null)
  )
);
create index if not exists calendar_allday_day on public.calendar_allday (hospital_id, day);
-- 같은 날 같은 시행자 휴무는 하나만
create unique index if not exists calendar_allday_off_one on public.calendar_allday (hospital_id, day, staff_id) where type = 'off';

-- 병원마다 바뀜 숫자 한 줄. 사용자는 읽기만 하고 트리거(calendar_bump)만 넣고 늘린다
create table if not exists public.calendar_rev (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  rev bigint not null default 0,
  changed_at timestamptz not null default now()
);

-- 처음 자리: 고칠 때마다 updated_at = 지금. 날짜나 시작이 바뀌면 도착 자동 값을 비우고(새 자리에서 다시 셈),
-- 처음 자리가 비어 있으면 바꾸기 전 자리를 적는다(여러 번 옮겨도 처음 것만). 처음 자리로 되돌아오면 두 칸을 비운다
create or replace function public.calendar_appts_move() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.day is distinct from old.day or new.start_min is distinct from old.start_min then
    new.auto := null;
    if old.orig_day is null then
      new.orig_day := old.day;
      new.orig_start := old.start_min;
    end if;
    if new.day = new.orig_day and new.start_min = new.orig_start then
      new.orig_day := null;
      new.orig_start := null;
    end if;
  end if;
  return new;
end
$$;

-- 1년 지우기: 예약을 넣은 사람 권한 그대로(RLS 적용) 내 병원의 지난 줄만 지운다. 지울 줄이 없으면 지우는 문장을 돌리지 않는다
create or replace function public.calendar_appts_prune() returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_cutoff date := ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date;
begin
  if v_hospital is null then
    return null;
  end if;
  if exists (select 1 from public.calendar_appts a where a.hospital_id = v_hospital and a.day < v_cutoff) then
    delete from public.calendar_appts a where a.hospital_id = v_hospital and a.day < v_cutoff;
  end if;
  if exists (select 1 from public.calendar_allday d where d.hospital_id = v_hospital and d.day < v_cutoff) then
    delete from public.calendar_allday d where d.hospital_id = v_hospital and d.day < v_cutoff;
  end if;
  return null;
end
$$;

-- 바뀜 숫자: 내 병원 줄을 넣거나 rev + 1. 사용자에게 rev 쓰기 권한이 없어 함수 주인 권한(security definer)으로 쓴다.
-- 쓰는 줄은 my_hospital_id() 하나뿐이다(운영자·승인 안 된 사용자는 null이라 아무것도 안 한다).
-- 문장마다 한 번이라 0줄을 고친 문장도 내 rev를 늘린다(다른 PC가 한 번 더 읽을 뿐이고 남의 병원 rev는 건드리지 않는다)
create or replace function public.calendar_bump() returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
begin
  if v_hospital is not null then
    insert into public.calendar_rev as r (hospital_id, rev, changed_at) values (v_hospital, 1, now())
      on conflict (hospital_id) do update set rev = r.rev + 1, changed_at = now();
  end if;
  return null;
end
$$;

-- 트리거만 부른다. 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거둔다
revoke all on function public.calendar_appts_move() from public, anon, authenticated;
revoke all on function public.calendar_appts_prune() from public, anon, authenticated;
revoke all on function public.calendar_bump() from public, anon, authenticated;

create or replace trigger calendar_appts_move before update on public.calendar_appts
  for each row execute function public.calendar_appts_move();
create or replace trigger calendar_appts_prune after insert on public.calendar_appts
  for each statement execute function public.calendar_appts_prune();
create or replace trigger calendar_appts_bump after insert or update or delete on public.calendar_appts
  for each statement execute function public.calendar_bump();
create or replace trigger calendar_allday_bump after insert or update or delete on public.calendar_allday
  for each statement execute function public.calendar_bump();
create or replace trigger calendar_settings_bump after insert or update or delete on public.calendar_settings
  for each statement execute function public.calendar_bump();

alter table public.calendar_settings enable row level security;
alter table public.calendar_appts enable row level security;
alter table public.calendar_allday enable row level security;
alter table public.calendar_rev enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.calendar_settings from anon, authenticated;
revoke all on table public.calendar_appts from anon, authenticated;
revoke all on table public.calendar_allday from anon, authenticated;
revoke all on table public.calendar_rev from anon, authenticated;

-- 설정: 읽기, 넣기·고치기는 다섯 칸(지우기 없음). upsert(onConflict hospital_id)가 보낸 칸을 모두 SET에 쓴다
grant select on table public.calendar_settings to authenticated;
grant insert (kinds, staff, open_hour, close_hour, sunday), update (kinds, staff, open_hour, close_hour, sunday)
  on table public.calendar_settings to authenticated;

-- 예약: 읽기·지우기, 넣기는 열두 칸, 고치기는 같은 칸 + 도착 표시(auto). 처음 자리·시각·id·hospital_id는 칸 권한 없음
grant select, delete on table public.calendar_appts to authenticated;
grant insert (day, start_min, len_min, name, chart, staff_id, staff_name, staff_mark, kind_id, kind_name, memo, status),
  update (day, start_min, len_min, name, chart, staff_id, staff_name, staff_mark, kind_id, kind_name, memo, status, auto)
  on table public.calendar_appts to authenticated;

-- 종일: 읽기·지우기, 넣기는 다섯 칸(고치기 없음)
grant select, delete on table public.calendar_allday to authenticated;
grant insert (day, type, memo, staff_id, staff_name) on table public.calendar_allday to authenticated;

-- 바뀜 숫자: 읽기만
grant select on table public.calendar_rev to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
drop policy if exists "내 병원 예약 설정 읽기" on public.calendar_settings;
create policy "내 병원 예약 설정 읽기" on public.calendar_settings
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 예약 설정 넣기" on public.calendar_settings;
create policy "내 병원 예약 설정 넣기" on public.calendar_settings
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 예약 설정 고치기" on public.calendar_settings;
create policy "내 병원 예약 설정 고치기" on public.calendar_settings
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "승인된 내 병원 예약만" on public.calendar_appts;
create policy "승인된 내 병원 예약만" on public.calendar_appts
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "승인된 내 병원 종일 줄만" on public.calendar_allday;
create policy "승인된 내 병원 종일 줄만" on public.calendar_allday
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 예약 바뀜 숫자 읽기" on public.calendar_rev;
create policy "내 병원 예약 바뀜 숫자 읽기" on public.calendar_rev
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
