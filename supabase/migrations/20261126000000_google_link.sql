-- 웹앱 ↔ 병원 구글 시트·캘린더 잇기 DB: 예약 줄(calendar_appts) 구글 칸·5분 시작·시행자 없는 예약, 종일 줄(calendar_allday) 구글 칸·메모 고치기,
-- 새 표 여덟(gcal_links·gcal_state·gcal_fixes·gcal_deletes·gcal_off_days·gsheet_settings·gsheet_months·gsheet_runs),
-- 트리거(calendar_appts_gdel·calendar_appts_gwait·calendar_allday_guard·calendar_allday_gwait·calendar_allday_gdel·calendar_allday_offwait·
-- gcal_state_forward·gcal_fixes_prune·gsheet_runs_prune), 예약 색 옮기기(옛 20색 → 구글 11색, gcal_color_name), 이어지지 않은 직원의 휴무 'm-' 줄,
-- off 줄 이름 목록 calendar_off_names()
-- (spec google-link REQ-8502, design.md 7절, ADR-052~055)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261117010000_calendar.sql·20261118100000_desk_accounts.sql(my_desk_hospital_id()·my_clinic_hospital_id())·
-- 20261119000000_clinic_profile.sql(clinic_profiles.staff)·20261121000000_staff.sql(휴가 트리거 둘·calendar_allday.part·leave_id)·
-- 20261124000000_admin_view.sql(admin_view_hospital_id()·보는 관리자 정책)이 들어가 있어야 한다(지금 모든 migration 뒤에 붙인다).
-- my_hospital_id()·my_clinic_hospital_id()·calendar_appts_move()·calendar_appts_prune()은 여기서 다시 만들지 않는다(글자·권한 그대로).
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 칸은 없을 때만 더하고, 이름 있는 제약은 없을 때만 더하거나(시작·처음 자리 둘은 지우고 같은 이름으로
-- 다시), 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만들고, 색 옮기기는 새 이름을 새 이름으로 두고, 휴무 채우기는 있는 줄을 건너뛴다).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(새 사이트는 예약 g 칸·gcal_*·gsheet_* 표를 읽어, 없으면 예약 탭·수납일지 탭 읽기가 실패한다).
-- 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(새 칸은 기본값이 있고, 옛 사이트는 새 표를 읽지 않는다. 옛 색 이름은 새 이름으로 바뀐다).
-- 주의: 20261121000000_staff.sql을 나중에 다시 붙여 넣으면 휴가 트리거 둘이 옛 글('m-' 갈래 없음)로 돌아가니 그때는 이 파일도 다시 붙여 넣는다.
--
-- 무엇을 왜(ADR-052~055): 수납일지는 비트 PC 도우미가 환자 수납 줄을 그 병원 구글 시트로 바로 보내고, 서버에는 숫자(넣은 기록 gsheet_runs)·
-- 달 파일 id(gsheet_months)·설정(gsheet_settings — 코드 주소·함께 쓸 메일은 도우미에만이라 그 열쇠가 든 설정은 DB가 거부)만 둔다.
-- 예약은 웹앱과 병원 구글 캘린더 하나를 양쪽으로 맞춘다: 예약·종일 줄에 구글 일정 id와 맞춤 칸을 더하고, 지운 줄(gcal_deletes)·휴무 날(gcal_off_days)은
-- 트리거가 적어 브라우저가 구글로 보낸다. 1년 지우기(calendar_appts_prune)가 지운 지난 줄은 적지 않는다(구글 일정은 그대로 둠).
-- '나중 고친 쪽'은 g_wait_at(사용자가 고친 때 — 트리거만 적고 사용자는 못 씀)으로 견준다(updated_at은 도착·맞춤 표시에도 바뀐다).
-- 예약 색은 구글 일정 11색 이름으로 옮기고(색 이름 함수 gcal_color_name은 이 파일 안에서만), 시작은 5분 단위, 시행자는 세 칸이 모두 비어도 된다.
-- 예약 시행자와 이어지지 않은 직원(데스크 직원 등)의 하루 종일 휴가도 'm-' + 직원 id 휴무 줄이 생겨 구글 off 줄 이름에 든다.
-- 환자 자료는 새 표에 들어가지 않는다(예약 이름·차트번호는 지금처럼 calendar_appts에만, ADR-030).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 새 표는 public·anon·authenticated 권한을 다 거둔 뒤 칸 단위로만 준다(design.md 7-5 권한 표).
-- 원장 = my_hospital_id(), 데스크 = my_desk_hospital_id(). gcal_links(비밀 글자)는 원장 읽기·넣기·고치기, 데스크 읽기만. gcal_deletes는 읽기·지우기만(넣기는 트리거).
-- 보는 관리자(ADR-046)는 gcal_*를 한 줄도 못 읽고(restrictive 하나), gsheet_*는 읽기만(permissive + restrictive — admin_view.sql과 같은 이름·꼴).
-- 예약 g 칸은 g_wait_at 밖은 넣기·고치기 권한을 주고, 종일 줄은 g 칸 넣기와 day·memo·g 칸 고치기(off 줄의 day·memo 고치기는 트리거가 P0001로 거절).
-- hospital_id·id·created_at·updated_at·at은 칸 권한이 없어 DB(기본값·트리거)만 정한다. 승인 대기·거절·병원 없는 사용자는 아무 줄도 못 보고 못 넣는다

-- ① 예약 줄: 5분 시작·처음 자리, 시행자 없는 예약, 구글 칸 ─────────────────────────────────

-- 시작·처음 자리: 10분 칸(0~1430)에서 5분 칸(0~1435)으로. 앞 SQL이 칸 옆에 둔 제약(자동 이름)을 같은 이름으로 다시 만든다
alter table public.calendar_appts drop constraint if exists calendar_appts_start_min_check;
alter table public.calendar_appts
  add constraint calendar_appts_start_min_check check (start_min between 0 and 1435 and start_min % 5 = 0);
alter table public.calendar_appts drop constraint if exists calendar_appts_orig_start_check;
alter table public.calendar_appts
  add constraint calendar_appts_orig_start_check check (orig_start between 0 and 1435 and orig_start % 5 = 0);

-- 시행자: 세 칸이 모두 비거나(시행자 없이 가져온 지난 예약) 모두 찬다. 칸 길이 제약은 그대로
alter table public.calendar_appts
  alter column staff_id drop not null,
  alter column staff_name drop not null,
  alter column staff_mark drop not null;

-- 구글 칸. g_event_id = 구글 일정 id(웹앱이 만든 일정은 'ssk' + 32자 16진수). Postgres 정규식은 반복 수가 255까지라 길이는 char_length로 본다
alter table public.calendar_appts add column if not exists g_event_id text
  check (g_event_id ~ '^[A-Za-z0-9_]+$' and char_length(g_event_id) between 5 and 300);
alter table public.calendar_appts add column if not exists g_updated timestamptz; -- 마지막으로 본·쓴 구글 updated
alter table public.calendar_appts add column if not exists g_title text check (char_length(g_title) <= 200); -- 마지막으로 본·쓴 구글 제목
-- 일정 자기 색 '1'~'11'(null = 캘린더 기본 색)
alter table public.calendar_appts add column if not exists g_color text
  check (g_color in ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'));
-- google = 구글에서 온 색 그대로 칠함
alter table public.calendar_appts add column if not exists color_from text not null default 'app' check (color_from in ('app', 'google'));
alter table public.calendar_appts add column if not exists g_keep_title boolean not null default false; -- 참 = 구글 제목을 웹앱 꼴로 다시 쓰지 않음
alter table public.calendar_appts add column if not exists g_moved boolean not null default false; -- 구글에서 변경 색이 됨
alter table public.calendar_appts add column if not exists g_gone boolean not null default false; -- 구글에서 지워짐
-- 아직 못 보낸 바뀜(null = 구글과 같음)
alter table public.calendar_appts add column if not exists g_wait text
  check (g_wait in ('new', 'edit', 'move', 'cancel', 'uncancel', 'color'));
alter table public.calendar_appts add column if not exists g_wait_at timestamptz; -- 사용자가 고친 때. 트리거 calendar_appts_gwait만 적는다
alter table public.calendar_appts add column if not exists g_note text check (char_length(g_note) <= 100); -- 덮인 쪽 한 줄
alter table public.calendar_appts add column if not exists g_from text check (g_from in ('import', 'pull', 'web')); -- 들어온 길
-- 알아본 출처 {staff, kind, memo, gStart, gEnd}. 안 모양은 앱이 본다
alter table public.calendar_appts add column if not exists g_how jsonb
  check (jsonb_typeof(g_how) = 'object' and octet_length(g_how::text) <= 600);

-- ② 종일 줄: 구글 칸 ───────────────────────────────────────────────────────────
alter table public.calendar_allday add column if not exists g_event_id text
  check (g_event_id ~ '^[A-Za-z0-9_]+$' and char_length(g_event_id) between 5 and 300);
alter table public.calendar_allday add column if not exists g_updated timestamptz;
alter table public.calendar_allday add column if not exists g_wait boolean not null default false; -- 참 = 아직 못 보낸 메모
alter table public.calendar_allday add column if not exists g_wait_at timestamptz; -- 트리거 calendar_allday_gwait만 적는다

-- 이름 있는 제약·유일(없을 때만). 유일은 부분 색인이 아니라 제약이라 on conflict가 쓴다(null id는 여럿 된다)
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_appts'::regclass and conname = 'calendar_appts_staff_all') then
    alter table public.calendar_appts add constraint calendar_appts_staff_all check (
      (staff_id is null and staff_name is null and staff_mark is null)
      or (staff_id is not null and staff_name is not null and staff_mark is not null)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_appts'::regclass and conname = 'calendar_appts_g_event_one') then
    alter table public.calendar_appts add constraint calendar_appts_g_event_one unique (hospital_id, g_event_id);
  end if;
  -- 구글 일정 id는 메모 줄에만(off 줄의 구글 짝은 gcal_off_days)
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_allday'::regclass and conname = 'calendar_allday_g_memo') then
    alter table public.calendar_allday add constraint calendar_allday_g_memo check (type = 'memo' or g_event_id is null);
  end if;
  -- 여러 날 메모는 날마다 한 줄(같은 일정 id)
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_allday'::regclass and conname = 'calendar_allday_g_event_day') then
    alter table public.calendar_allday add constraint calendar_allday_g_event_day unique (hospital_id, g_event_id, day);
  end if;
end
$$;

-- ③ 새 표 여덟 ─────────────────────────────────────────────────────────────────

-- 병원 하나에 한 줄: 예약 구글 코드 주소·비밀 글자·고른 캘린더·이은 날(맞춤 시작 0시)·맞춤 규칙·보이기. rules·look 안 모양은 앱이 checkGcalRules·checkGcalLook으로 본다.
-- 주소·비밀 글자는 비어도 된다(연결 전에 보이기·규칙만 먼저 저장하면 그 두 칸 없이 줄이 생긴다). 값이 있으면 모양을 본다
create table if not exists public.gcal_links (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  -- 개인 계정 꼴과 회사(Workspace) 계정 꼴
  script_url text check (script_url is null or script_url ~ '^https://script\.google\.com/(a/macros/[A-Za-z0-9.-]{1,253}|macros)/s/[A-Za-z0-9_-]{10,200}/exec$'),
  secret text check (secret is null or secret ~ '^[A-Za-z0-9_-]{32,128}$'),
  calendar_id text check (char_length(calendar_id) <= 300),
  calendar_name text check (char_length(calendar_name) <= 100),
  default_hex text check (default_hex ~ '^#[0-9A-Fa-f]{6}$'),
  linked_on date,
  rules jsonb check (jsonb_typeof(rules) = 'object' and octet_length(rules::text) <= 2000),
  look jsonb check (jsonb_typeof(look) = 'object' and octet_length(look::text) <= 4000),
  updated_at timestamptz not null default now()
);

-- 맞춤 상태 한 줄. pulled_until은 트리거가 뒤로 안 가게 한다
create table if not exists public.gcal_state (
  hospital_id uuid primary key default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  pulled_until timestamptz,
  last_ok_at timestamptz,
  fail_since timestamptz,
  fail_code text check (fail_code ~ '^E-[A-Z0-9-]{1,30}$'),
  arrival_until date,
  arrival_done boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 고쳐야 할 구글 예약(알아보지 못한 일정). guess = 알아본 칸(차트번호·이름·종류·시행자·메모·고를 거리). 넣을 때 그 병원 한국 오늘 − 1년보다 이른 줄을 지운다
create table if not exists public.gcal_fixes (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  g_event_id text not null check (g_event_id ~ '^[A-Za-z0-9_]+$' and char_length(g_event_id) between 5 and 300),
  day date not null,
  start_min smallint not null check (start_min between 0 and 1435),
  len_min smallint not null check (len_min between 1 and 1440),
  all_day boolean not null default false,
  g_color text check (g_color in ('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11')),
  g_title text not null check (char_length(g_title) <= 200),
  reason text not null check (reason in ('no-staff', 'no-staff-color', 'bad-mark', 'bad-kind', 'not-appt', 'too-long', 'off-name')),
  guess jsonb not null default '{}'::jsonb check (jsonb_typeof(guess) = 'object' and octet_length(guess::text) <= 2000),
  state text not null default 'open' check (state in ('open', 'skip')),
  g_updated timestamptz not null,
  created_at timestamptz not null default now(),
  unique (hospital_id, g_event_id, day)
);

-- 구글에서 지울 것(웹앱에서 지운 예약·메모). 트리거만 넣는다
create table if not exists public.gcal_deletes (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  g_event_id text not null check (g_event_id ~ '^[A-Za-z0-9_]+$' and char_length(g_event_id) between 5 and 300),
  day date not null,
  kind text not null check (kind in ('appt', 'memo')),
  label text check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  primary key (hospital_id, g_event_id, day)
);

-- 그날 구글 off 줄 짝(사람 이름만, 환자 없음). wait = 그날 휴무 줄이 바뀌어 다시 보낼 것
create table if not exists public.gcal_off_days (
  hospital_id uuid not null default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null,
  g_event_id text check (g_event_id ~ '^[A-Za-z0-9_]+$' and char_length(g_event_id) between 5 and 300),
  g_title text check (char_length(g_title) <= 200),
  g_updated timestamptz,
  wait boolean not null default false,
  wait_at timestamptz,
  primary key (hospital_id, day)
);

-- 넣은 기록 칸 검사: counts 값은 모두 숫자·참거짓(4,000바이트까지), cells는 20개까지 '시트!칸' 모양. 확인 제약 안에서 부른다
create or replace function public.gsheet_counts_ok(p_counts jsonb) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select jsonb_typeof(p_counts) = 'object'
     and octet_length(p_counts::text) <= 4000
     and not exists (select 1 from jsonb_each(p_counts) as e (k, v) where jsonb_typeof(e.v) not in ('number', 'boolean'))
$$;

create or replace function public.gsheet_cells_ok(p_cells text[]) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select cardinality(p_cells) <= 20
     and not exists (select 1 from unnest(p_cells) as c (cell) where c.cell is null or c.cell !~ '^[^!]{1,31}![A-Z]{1,3}[0-9]{1,4}$')
$$;

-- 확인 제약이 부른다. 함수는 기본으로 public이 부를 수 있고, Supabase는 anon에도 준다. 거두고 authenticated에만 준다
revoke all on function public.gsheet_counts_ok(jsonb) from public, anon, authenticated;
revoke all on function public.gsheet_cells_ok(text[]) from public, anon, authenticated;
grant execute on function public.gsheet_counts_ok(jsonb) to authenticated;
grant execute on function public.gsheet_cells_ok(text[]) to authenticated;

-- 수납 시트 설정 한 벌. 안 모양은 앱이 checkGsheetSettings로 본다. 코드 주소(scriptUrl·url)·함께 쓸 메일(shareWith)은 넣는 PC 도우미에만 둔다(ADR-052)
create table if not exists public.gsheet_settings (
  hospital_id uuid primary key default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  conf jsonb not null default '{}'::jsonb check (
    jsonb_typeof(conf) = 'object' and octet_length(conf::text) <= 16000 and not (conf ?| array['scriptUrl', 'url', 'shareWith'])
  ),
  secret_tag text check (secret_tag ~ '^[0-9a-f]{16}$'), -- SHA-256(비밀 글자) 16진수 앞 16자(비밀 글자는 두지 않는다)
  updated_at timestamptz not null default now()
);

-- 달 파일 id·날짜 시트 gid({"1"~"31": 0 이상 정수})
create table if not exists public.gsheet_months (
  hospital_id uuid not null default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  ym text not null check (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  file_id text not null check (file_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  gids jsonb not null default '{}'::jsonb check (
    jsonb_typeof(gids) = 'object'
    and octet_length(gids::text) <= 2000
    and not jsonb_path_exists(gids, 'strict $.keyvalue() ? (!(@.key like_regex "^([1-9]|[12][0-9]|3[01])$") || @.value.type() != "number" || @.value < 0 || @.value.floor() != @.value)')
  ),
  seen_at timestamptz not null default now(),
  primary key (hospital_id, ym)
);

-- 넣은 기록(숫자·칸 주소만, 환자 없음). 넣을 때 그 병원의 14일보다 오래된 줄을 지운다
create table if not exists public.gsheet_runs (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_clinic_hospital_id() references public.hospitals (id) on delete cascade,
  at timestamptz not null default now(),
  day date not null,
  via text not null check (via in ('auto', 'hand', 'evening', 'past')),
  mode text not null check (mode in ('fillEmpty', 'overwrite')),
  outcome text not null check (outcome in ('ok', 'warn', 'same', 'fail')),
  code text check (code ~ '^E-[A-Z0-9-]{1,30}$'),
  rows integer not null default 0 check (rows >= 0),
  counts jsonb not null default '{}'::jsonb check (public.gsheet_counts_ok(counts)),
  cells text[] not null default '{}'::text[] check (public.gsheet_cells_ok(cells))
);
create index if not exists gsheet_runs_at on public.gsheet_runs (hospital_id, at);

-- ④ 트리거 함수 ────────────────────────────────────────────────────────────────

-- 예약을 지우면 구글 일정 지울 것 한 줄. 한국 오늘 − 1년보다 이른 날(1년 지우기가 지운 줄)은 적지 않는다(구글 일정은 그대로 둠).
-- 병원 줄이 함께 지워지는 중(가입 삭제)이면 적지 않는다. 사용자에게 gcal_deletes 넣기 권한이 없어 함수 주인 권한으로 쓴다. 쓰는 줄은 지운 줄의 병원 것뿐이다
create or replace function public.calendar_appts_gdel() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.g_event_id is not null
     and old.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
     and exists (select 1 from public.hospitals h where h.id = old.hospital_id) then
    insert into public.gcal_deletes (hospital_id, g_event_id, day, kind, label)
      values (old.hospital_id, old.g_event_id, old.day, 'appt', old.g_title)
      on conflict do nothing;
  end if;
  return null;
end
$$;

-- 사용자가 고친 때: g_wait가 비면 비우고, 처음 적거나 바뀌었거나 사용자 칸이 바뀌면 DB 지금 시각, 그 밖(도착·맞춤 표시만)은 그대로.
-- 사용자에게 g_wait_at 칸 권한이 없고, 보낸 값도 여기서 덮는다
create or replace function public.calendar_appts_gwait() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.g_wait is null then
    new.g_wait_at := null;
  elsif tg_op = 'INSERT'
     or old.g_wait is null
     or new.g_wait is distinct from old.g_wait
     or (new.day, new.start_min, new.len_min, new.name, new.chart, new.staff_id, new.staff_name, new.staff_mark,
         new.kind_id, new.kind_name, new.memo, new.status)
        is distinct from
        (old.day, old.start_min, old.len_min, old.name, old.chart, old.staff_id, old.staff_name, old.staff_mark,
         old.kind_id, old.kind_name, old.memo, old.status) then
    new.g_wait_at := clock_timestamp();
  else
    new.g_wait_at := old.g_wait_at;
  end if;
  return new;
end
$$;

-- off 줄은 날짜·메모를 고치지 않는다(지금처럼 넣기·지우기로만 — 휴가 트리거와 짝이 맞게). 메모 줄은 고친다(구글에서 고친 글을 같은 줄에)
create or replace function public.calendar_allday_guard() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if old.type <> 'memo' and (new.day is distinct from old.day or new.memo is distinct from old.memo) then
    raise exception 'off rows are changed by insert and delete only' using errcode = 'P0001';
  end if;
  return new;
end
$$;

-- 종일 메모가 고친 때: 예약과 같은 규칙(사용자 칸은 day·memo, g_wait가 거짓이면 비움)
create or replace function public.calendar_allday_gwait() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if not new.g_wait then
    new.g_wait_at := null;
  elsif tg_op = 'INSERT'
     or not old.g_wait
     or (new.day, new.memo) is distinct from (old.day, old.memo) then
    new.g_wait_at := clock_timestamp();
  else
    new.g_wait_at := old.g_wait_at;
  end if;
  return new;
end
$$;

-- 구글과 이은 종일 메모를 지우면 지울 것 한 줄(예약과 같은 1년·병원 규칙)
create or replace function public.calendar_allday_gdel() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.type = 'memo'
     and old.g_event_id is not null
     and old.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
     and exists (select 1 from public.hospitals h where h.id = old.hospital_id) then
    insert into public.gcal_deletes (hospital_id, g_event_id, day, kind, label)
      values (old.hospital_id, old.g_event_id, old.day, 'memo', old.memo)
      on conflict do nothing;
  end if;
  return null;
end
$$;

-- 하루 종일 off 줄(part 없음)을 넣거나 지우면 그날 구글 off 줄을 다시 보낼 것(wait). 한국 오늘 − 1년보다 이른 날·병원 줄이 지워지는 중이면 아무것도 안 한다.
-- 휴가 트리거(정의자)가 넣는 줄도 같다. 쓰는 줄은 그 줄의 병원 것뿐이다
create or replace function public.calendar_allday_offwait() returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.calendar_allday := case when tg_op = 'DELETE' then old else new end;
begin
  if v_row.type = 'off'
     and v_row.part is null
     and v_row.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
     and exists (select 1 from public.hospitals h where h.id = v_row.hospital_id) then
    insert into public.gcal_off_days as o (hospital_id, day, wait, wait_at)
      values (v_row.hospital_id, v_row.day, true, now())
      on conflict (hospital_id, day) do update set wait = true, wait_at = now();
  end if;
  return null;
end
$$;

-- 고친 시각은 DB가(gcal_links·gsheet_settings)
create or replace function public.google_link_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 맞춤 상태: 받은 데까지(pulled_until)는 뒤로 안 간다(더 이른 값·null이면 그대로). 고친 시각은 DB가
create or replace function public.gcal_state_forward() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.pulled_until := greatest(old.pulled_until, new.pulled_until);
  new.updated_at := now();
  return new;
end
$$;

-- 고쳐야 할 것 1년 지우기: calendar_appts_prune과 같은 모양(넣은 사람 권한 그대로 내 병원 줄만, 지울 줄이 있을 때만 지우는 문장)
create or replace function public.gcal_fixes_prune() returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_hospital uuid := public.my_clinic_hospital_id();
  v_cutoff date := ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date;
begin
  if v_hospital is null then
    return null;
  end if;
  if exists (select 1 from public.gcal_fixes f where f.hospital_id = v_hospital and f.day < v_cutoff) then
    delete from public.gcal_fixes f where f.hospital_id = v_hospital and f.day < v_cutoff;
  end if;
  return null;
end
$$;

-- 넣은 기록 14일 지우기: 같은 모양이지만 사용자에게 gsheet_runs 지우기 권한이 없어(7-5 — 읽기·넣기만) 함수 주인 권한으로 지운다.
-- 지우는 줄은 넣은 사람의 병원(my_clinic_hospital_id()) 것뿐이다
create or replace function public.gsheet_runs_prune() returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_clinic_hospital_id();
begin
  if v_hospital is null then
    return null;
  end if;
  if exists (select 1 from public.gsheet_runs r where r.hospital_id = v_hospital and r.at < now() - interval '14 days') then
    delete from public.gsheet_runs r where r.hospital_id = v_hospital and r.at < now() - interval '14 days';
  end if;
  return null;
end
$$;

-- 휴가 → 예약 '휴무': 20261121000000_staff.sql의 지금 글 그대로 + 이어지지 않은 직원의 하루 종일 휴가는 'm-' + 직원 id(빼기 없음) 줄
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
  -- google-link: 예약 시행자와 이어지지 않은 직원의 하루 종일 휴가(반차는 아님)
  insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id)
  select new.hospital_id, new.day, 'off', 'm-' || replace(m.id::text, '-', ''), left(m.name, 10), null, new.id
    from public.staff_members m
   where m.id = new.staff_id and m.hospital_id = new.hospital_id and m.calendar_staff_id is null and new.part is null
  on conflict (hospital_id, day, staff_id) where type = 'off' do nothing;
  return null;
end
$$;

-- 연결 바꾸기: 20261121000000_staff.sql의 지금 글 그대로 + 새 id가 비면 한국 오늘 − 1년 이후 하루 종일 휴가마다 'm-' 줄로 다시 넣는다
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
  -- google-link: 연결을 끊으면 하루 종일 휴가는 'm-' 줄로
  if new.calendar_staff_id is null then
    insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id)
    select l.hospital_id, l.day, 'off', 'm-' || replace(new.id::text, '-', ''), left(new.name, 10), null, l.id
      from public.staff_leaves l
     where l.staff_id = new.id and l.hospital_id = new.hospital_id and l.part is null
       and l.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
    on conflict (hospital_id, day, staff_id) where type = 'off' do nothing;
  end if;
  return null;
end
$$;

-- 트리거만 부른다. 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거둔다
revoke all on function public.calendar_appts_gdel() from public, anon, authenticated;
revoke all on function public.calendar_appts_gwait() from public, anon, authenticated;
revoke all on function public.calendar_allday_guard() from public, anon, authenticated;
revoke all on function public.calendar_allday_gwait() from public, anon, authenticated;
revoke all on function public.calendar_allday_gdel() from public, anon, authenticated;
revoke all on function public.calendar_allday_offwait() from public, anon, authenticated;
revoke all on function public.google_link_touch() from public, anon, authenticated;
revoke all on function public.gcal_state_forward() from public, anon, authenticated;
revoke all on function public.gcal_fixes_prune() from public, anon, authenticated;
revoke all on function public.gsheet_runs_prune() from public, anon, authenticated;
revoke all on function public.staff_leave_link() from public, anon, authenticated;
revoke all on function public.staff_member_relink() from public, anon, authenticated;

create or replace trigger calendar_appts_gdel after delete on public.calendar_appts
  for each row execute function public.calendar_appts_gdel();
create or replace trigger calendar_appts_gwait before insert or update on public.calendar_appts
  for each row execute function public.calendar_appts_gwait();
create or replace trigger calendar_allday_guard before update on public.calendar_allday
  for each row execute function public.calendar_allday_guard();
create or replace trigger calendar_allday_gwait before insert or update on public.calendar_allday
  for each row execute function public.calendar_allday_gwait();
create or replace trigger calendar_allday_gdel after delete on public.calendar_allday
  for each row execute function public.calendar_allday_gdel();
create or replace trigger calendar_allday_offwait after insert or delete on public.calendar_allday
  for each row execute function public.calendar_allday_offwait();
create or replace trigger gcal_links_touch before update on public.gcal_links
  for each row execute function public.google_link_touch();
create or replace trigger gsheet_settings_touch before update on public.gsheet_settings
  for each row execute function public.google_link_touch();
create or replace trigger gcal_state_forward before update on public.gcal_state
  for each row execute function public.gcal_state_forward();
create or replace trigger gcal_fixes_prune after insert on public.gcal_fixes
  for each statement execute function public.gcal_fixes_prune();
create or replace trigger gsheet_runs_prune after insert on public.gsheet_runs
  for each statement execute function public.gsheet_runs_prune();

-- ⑤ off 줄 이름 목록: 내 병원(원장·데스크) 병원 정보 사람마다 {id, name} + 예약 시행자와 이어지지 않은 재직 직원마다 {'m-' id, name}.
-- 데스크는 직원 표를 못 읽어 정의자 함수로 이름만 준다. 병원이 없거나(대기·거절·병원 없음) 보는 중인 관리자면 빈 목록
create or replace function public.calendar_off_names() returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x.item order by x.n1, x.n2), '[]'::jsonb)
    from (
      select 1 as n1, e.n as n2, jsonb_build_object('id', e.person ->> 'id', 'name', e.person ->> 'name') as item
        from public.clinic_profiles p
       cross join lateral jsonb_array_elements(p.staff) with ordinality as e (person, n)
       where p.hospital_id = public.my_clinic_hospital_id()
         and public.admin_view_hospital_id() is null
         and coalesce(e.person ->> 'id', '') <> ''
         and coalesce(e.person ->> 'name', '') <> ''
      union all
      select 2, row_number() over (order by m.name, m.id), jsonb_build_object('id', 'm-' || replace(m.id::text, '-', ''), 'name', m.name)
        from public.staff_members m
       where m.hospital_id = public.my_clinic_hospital_id()
         and public.admin_view_hospital_id() is null
         and m.calendar_staff_id is null
         and (m.left_on is null or m.left_on > (now() at time zone 'Asia/Seoul')::date)
    ) x
$$;

revoke all on function public.calendar_off_names() from public, anon, authenticated;
grant execute on function public.calendar_off_names() to authenticated;

-- ⑥ RLS·권한 ──────────────────────────────────────────────────────────────────

alter table public.gcal_links enable row level security;
alter table public.gcal_state enable row level security;
alter table public.gcal_fixes enable row level security;
alter table public.gcal_deletes enable row level security;
alter table public.gcal_off_days enable row level security;
alter table public.gsheet_settings enable row level security;
alter table public.gsheet_months enable row level security;
alter table public.gsheet_runs enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.gcal_links from public, anon, authenticated;
revoke all on table public.gcal_state from public, anon, authenticated;
revoke all on table public.gcal_fixes from public, anon, authenticated;
revoke all on table public.gcal_deletes from public, anon, authenticated;
revoke all on table public.gcal_off_days from public, anon, authenticated;
revoke all on table public.gsheet_settings from public, anon, authenticated;
revoke all on table public.gsheet_months from public, anon, authenticated;
revoke all on table public.gsheet_runs from public, anon, authenticated;

-- 예약 줄 구글 칸: 넣기·고치기(g_wait_at은 읽기만 — 표 읽기 권한이 이미 모든 칸을 준다)
grant insert (g_event_id, g_updated, g_title, g_color, color_from, g_keep_title, g_moved, g_gone, g_wait, g_note, g_from, g_how),
  update (g_event_id, g_updated, g_title, g_color, color_from, g_keep_title, g_moved, g_gone, g_wait, g_note, g_from, g_how)
  on table public.calendar_appts to authenticated;
-- 종일 줄: 구글 칸 넣기, 날짜·메모·구글 칸 고치기(type·staff·part·leave_id·g_wait_at은 고치기 없음)
grant insert (g_event_id, g_updated, g_wait), update (day, memo, g_event_id, g_updated, g_wait)
  on table public.calendar_allday to authenticated;

-- 예약 구글 연결: 읽기, 넣기·고치기(지우기 없음 — 끊기는 칸을 비운다)
grant select on table public.gcal_links to authenticated;
grant insert (script_url, secret, calendar_id, calendar_name, default_hex, linked_on, rules, look),
  update (script_url, secret, calendar_id, calendar_name, default_hex, linked_on, rules, look)
  on table public.gcal_links to authenticated;
-- 맞춤 상태: 읽기, 넣기·고치기
grant select on table public.gcal_state to authenticated;
grant insert (pulled_until, last_ok_at, fail_since, fail_code, arrival_until, arrival_done),
  update (pulled_until, last_ok_at, fail_since, fail_code, arrival_until, arrival_done)
  on table public.gcal_state to authenticated;
-- 고쳐야 할 것: 읽기·지우기, 넣기·고치기(upsert onConflict (hospital_id, g_event_id, day)가 보낸 칸을 모두 SET에 쓴다)
grant select, delete on table public.gcal_fixes to authenticated;
grant insert (g_event_id, day, start_min, len_min, all_day, g_color, g_title, reason, guess, state, g_updated),
  update (g_event_id, day, start_min, len_min, all_day, g_color, g_title, reason, guess, state, g_updated)
  on table public.gcal_fixes to authenticated;
-- 지울 것: 읽기·지우기(넣기는 트리거)
grant select, delete on table public.gcal_deletes to authenticated;
-- off 날: 읽기·지우기, 넣기·고치기
grant select, delete on table public.gcal_off_days to authenticated;
grant insert (day, g_event_id, g_title, g_updated, wait, wait_at), update (day, g_event_id, g_title, g_updated, wait, wait_at)
  on table public.gcal_off_days to authenticated;
-- 수납 시트 설정·달 파일: 읽기, 넣기·고치기(지우기 없음)
grant select on table public.gsheet_settings to authenticated;
grant insert (conf, secret_tag), update (conf, secret_tag) on table public.gsheet_settings to authenticated;
grant select on table public.gsheet_months to authenticated;
grant insert (ym, file_id, gids, seen_at), update (ym, file_id, gids, seen_at) on table public.gsheet_months to authenticated;
-- 넣은 기록: 읽기·넣기(고치기·지우기 없음 — 14일 지우기는 트리거)
grant select on table public.gsheet_runs to authenticated;
grant insert (day, via, mode, outcome, code, rows, counts, cells) on table public.gsheet_runs to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장·데스크가 아니면 null이라 아무 줄과도 같지 않다

-- 종일 줄 고치기(원장·데스크, 내 병원). 보는 관리자 restrictive(admin_view.sql)는 그대로라 보는 중에는 쓰기 없음
drop policy if exists "내 병원 종일 줄 고치기" on public.calendar_allday;
create policy "내 병원 종일 줄 고치기" on public.calendar_allday
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 종일 줄 고치기" on public.calendar_allday;
create policy "데스크 종일 줄 고치기" on public.calendar_allday
  for update to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

-- 예약 구글 연결(비밀 글자): 원장 읽기·넣기·고치기, 데스크 읽기만
drop policy if exists "내 병원 예약 구글 연결 읽기" on public.gcal_links;
create policy "내 병원 예약 구글 연결 읽기" on public.gcal_links
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 예약 구글 연결 넣기" on public.gcal_links;
create policy "내 병원 예약 구글 연결 넣기" on public.gcal_links
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 예약 구글 연결 고치기" on public.gcal_links;
create policy "내 병원 예약 구글 연결 고치기" on public.gcal_links
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 예약 구글 연결 읽기" on public.gcal_links;
create policy "데스크 예약 구글 연결 읽기" on public.gcal_links
  for select to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()));

-- 나머지 일곱: 원장·데스크가 같다(실제로 되는 일은 위 표·칸 권한대로)
drop policy if exists "승인된 내 병원 예약 맞춤 상태만" on public.gcal_state;
create policy "승인된 내 병원 예약 맞춤 상태만" on public.gcal_state
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 예약 맞춤 상태" on public.gcal_state;
create policy "데스크 예약 맞춤 상태" on public.gcal_state
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 구글 고쳐야 할 것만" on public.gcal_fixes;
create policy "승인된 내 병원 구글 고쳐야 할 것만" on public.gcal_fixes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 구글 고쳐야 할 것" on public.gcal_fixes;
create policy "데스크 구글 고쳐야 할 것" on public.gcal_fixes
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 구글 지울 것만" on public.gcal_deletes;
create policy "승인된 내 병원 구글 지울 것만" on public.gcal_deletes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 구글 지울 것" on public.gcal_deletes;
create policy "데스크 구글 지울 것" on public.gcal_deletes
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 구글 off 날만" on public.gcal_off_days;
create policy "승인된 내 병원 구글 off 날만" on public.gcal_off_days
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 구글 off 날" on public.gcal_off_days;
create policy "데스크 구글 off 날" on public.gcal_off_days
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 수납 시트 설정만" on public.gsheet_settings;
create policy "승인된 내 병원 수납 시트 설정만" on public.gsheet_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 수납 시트 설정" on public.gsheet_settings;
create policy "데스크 수납 시트 설정" on public.gsheet_settings
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 수납 시트 달 파일만" on public.gsheet_months;
create policy "승인된 내 병원 수납 시트 달 파일만" on public.gsheet_months
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 수납 시트 달 파일" on public.gsheet_months;
create policy "데스크 수납 시트 달 파일" on public.gsheet_months
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

drop policy if exists "승인된 내 병원 수납 시트 넣은 기록만" on public.gsheet_runs;
create policy "승인된 내 병원 수납 시트 넣은 기록만" on public.gsheet_runs
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "데스크 수납 시트 넣은 기록" on public.gsheet_runs;
create policy "데스크 수납 시트 넣은 기록" on public.gsheet_runs
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

-- 보는 관리자(ADR-046, admin_view.sql과 같은 이름·꼴): gsheet 셋은 보기 ○(permissive 읽기 + restrictive), gcal 다섯은 보기 ×(restrictive 하나 — 비밀 글자·예약 일정 id)
drop policy if exists "관리자 보는 의원 읽기" on public.gsheet_settings;
create policy "관리자 보는 의원 읽기" on public.gsheet_settings
  for select to authenticated
  using (hospital_id = (select public.admin_view_hospital_id()));
drop policy if exists "관리자 보는 의원 읽기" on public.gsheet_months;
create policy "관리자 보는 의원 읽기" on public.gsheet_months
  for select to authenticated
  using (hospital_id = (select public.admin_view_hospital_id()));
drop policy if exists "관리자 보는 의원 읽기" on public.gsheet_runs;
create policy "관리자 보는 의원 읽기" on public.gsheet_runs
  for select to authenticated
  using (hospital_id = (select public.admin_view_hospital_id()));

drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_settings;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_settings
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_months;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_months
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_runs;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gsheet_runs
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_links;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_links
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_state;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_state
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_fixes;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_fixes
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_deletes;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_deletes
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);
drop policy if exists "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_off_days;
create policy "보는 중에는 그 의원만 · 쓰기 없음" on public.gcal_off_days
  as restrictive for all to authenticated
  using ((select public.admin_view_hospital_id()) is null or hospital_id = (select public.admin_view_hospital_id()))
  with check ((select public.admin_view_hospital_id()) is null);

-- ⑦ 예약 색 옮기기(옛 20색 → 구글 일정 11색, design.md 7-4) ─────────────────────────

-- 이미 새 이름이면 그대로, 옛 이름은 표대로, 모르는 값은 흑연. 이 파일 안에서만 쓴다(권한 거둠)
create or replace function public.gcal_color_name(p_color text) returns text language sql immutable security invoker set search_path = ''
as $$
  select case
    when p_color in ('lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato') then p_color
    when p_color in ('blue', 'navy') then 'blueberry'
    when p_color in ('teal', 'green', 'forest') then 'basil'
    when p_color in ('purple', 'magenta') then 'grape'
    when p_color in ('orange', 'brown') then 'tangerine'
    when p_color = 'yellow' then 'banana'
    when p_color in ('black', 'gray') then 'graphite'
    when p_color in ('pink', 'coral') then 'flamingo'
    when p_color in ('lime', 'mint') then 'sage'
    when p_color = 'sky' then 'peacock'
    when p_color in ('red', 'wine') then 'tomato'
    else 'graphite'
  end
$$;

revoke all on function public.gcal_color_name(text) from public, anon, authenticated;

-- 새 기본 종류(제목에서 알아볼 글 words 포함, 충격파 = 세이지)
alter table public.calendar_settings alter column kinds set default '[{"id":"dosu","name":"도수","len":30,"color":null,"words":["도수"]},{"id":"jabo","name":"자보도수","len":30,"color":null,"words":["자보도수","자보"]},{"id":"shock","name":"충격파","len":15,"color":"sage","words":["충격파","타"]},{"id":"inj","name":"주사","len":10,"color":null,"words":["주사"]},{"id":"visit","name":"진료","len":10,"color":null,"words":["진료"]}]'::jsonb;

-- 종류: color가 null(시행자 색 따름)·'default'(캘린더 기본 색)가 아니면 새 이름, words가 없으면 기본 단어. 시행자(옛 목록): 사람마다 색 새 이름(null 그대로).
-- 바뀌는 줄만 고치고(두 번째 실행은 아무것도 안 바꿈), 크기 제약(8,000바이트)을 넘게 되는 병원은 건너뛴다
update public.calendar_settings s
   set kinds = moved.kinds, staff = moved.staff
  from (
    select c.hospital_id,
           (select coalesce(jsonb_agg(
                     case
                       when jsonb_typeof(k.kind -> 'color') = 'string' and k.kind ->> 'color' <> 'default'
                         then jsonb_set(k.kind, '{color}', to_jsonb(public.gcal_color_name(k.kind ->> 'color')))
                       else k.kind
                     end
                     || case
                          when k.kind ? 'words' then '{}'::jsonb
                          else jsonb_build_object('words', case k.kind ->> 'id'
                                 when 'dosu' then '["도수"]'::jsonb
                                 when 'jabo' then '["자보도수","자보"]'::jsonb
                                 when 'shock' then '["충격파","타"]'::jsonb
                                 when 'inj' then '["주사"]'::jsonb
                                 when 'visit' then '["진료"]'::jsonb
                                 else jsonb_build_array(k.kind ->> 'name')
                               end)
                        end
                     order by k.n), '[]'::jsonb)
              from jsonb_array_elements(c.kinds) with ordinality as k (kind, n)) as kinds,
           (select coalesce(jsonb_agg(
                     case
                       when jsonb_typeof(p.person -> 'color') = 'string' and p.person ->> 'color' <> 'default'
                         then jsonb_set(p.person, '{color}', to_jsonb(public.gcal_color_name(p.person ->> 'color')))
                       else p.person
                     end
                     order by p.n), '[]'::jsonb)
              from jsonb_array_elements(c.staff) with ordinality as p (person, n)) as staff
      from public.calendar_settings c
  ) moved
 where s.hospital_id = moved.hospital_id
   and (s.kinds is distinct from moved.kinds or s.staff is distinct from moved.staff)
   and octet_length(moved.kinds::text) < 8000
   and octet_length(moved.staff::text) < 8000;

-- 병원 정보 원장님·직원: 사람마다 색 새 이름(null 그대로). 바뀌는 줄만
update public.clinic_profiles c
   set staff = moved.staff
  from (
    select pr.hospital_id,
           (select coalesce(jsonb_agg(
                     case
                       when jsonb_typeof(p.person -> 'color') = 'string' and p.person ->> 'color' <> 'default'
                         then jsonb_set(p.person, '{color}', to_jsonb(public.gcal_color_name(p.person ->> 'color')))
                       else p.person
                     end
                     order by p.n), '[]'::jsonb)
              from jsonb_array_elements(pr.staff) with ordinality as p (person, n)) as staff
      from public.clinic_profiles pr
  ) moved
 where c.hospital_id = moved.hospital_id
   and c.staff is distinct from moved.staff
   and octet_length(moved.staff::text) <= 12000;

-- ⑧ 휴무 'm-' 줄 한 번 채우기: 한국 오늘 − 1년 이후 이어지지 않은 직원의 하루 종일 휴가 가운데 줄이 없는 것(있으면 건너뜀)
insert into public.calendar_allday (hospital_id, day, type, staff_id, staff_name, part, leave_id)
select l.hospital_id, l.day, 'off', 'm-' || replace(m.id::text, '-', ''), left(m.name, 10), null, l.id
  from public.staff_leaves l
  join public.staff_members m on m.id = l.staff_id and m.hospital_id = l.hospital_id
 where m.calendar_staff_id is null
   and l.part is null
   and l.day >= ((now() at time zone 'Asia/Seoul')::date - interval '1 year')::date
on conflict (hospital_id, day, staff_id) where type = 'off' do nothing;
