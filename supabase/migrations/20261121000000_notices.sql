-- 고시·공지 탭 DB: 공용 표 넷(notices·notice_posts·notice_sources·notice_weeks)·실행 기록(notice_runs)·모으기 계정 목록(notice_collectors)·
-- 병원 표시(notice_marks)·묻기 횟수(notice_ask_days·notice_ask_holds)와 그 권한·함수 (spec notices REQ-7402·REQ-7403, ADR-036·ADR-037)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원·관리자 표)이 들어가 있어야 한다. my_hospital_id()는 C1 글자 그대로 다시 만든다(다른 공용 함수는 만들지도 부르지도 않는다).
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다.
-- 출처 세 줄은 없을 때만 넣는다. 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 고시·공지 화면·대시보드 칸·탭 숫자가 읽기 실패를 보이고 모으기가 멈춘다).
-- 붙인 뒤 모으기 계정 넣기(design 13절): Authentication에서 모으기 전용 사용자를 만들고(메일 확인 끝, 16자 넘는 비밀번호) 메일만 바꿔 한 번 실행한다.
--   insert into public.notice_collectors (user_id) select id from auth.users where email = '<모으기 메일>';
--
-- 무엇을 왜(ADR-036·ADR-037): 고시·공지 글은 병원과 상관없는 같은 자료라 hospital_id 없이 한 벌만 둔다(요약도 한 번만).
-- 공용 줄은 모으기 계정(notice_collectors에 있는 로그인 계정, 병원 줄 없음)만 넣고 고친다. 지우는 길은 없다(잘못 들어간 글은 SQL 편집기로 지운다).
-- 병원마다 다른 것(읽음·별표·메모·규칙 확인, 묻기 횟수)은 hospital_id 표다. service role 키는 쓰지 않는다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 공용 표 넷은 승인된 원장(my_hospital_id()가 있음)과 모으기 계정만 읽고,
-- 데스크·승인 대기·거절·병원 없는 계정은 0줄이다. 넣기·고치기는 모으기 계정만 정해 둔 칸에(id·시각·rule_count는 DB가 정한다).
-- notice_runs(토큰·비용·건수 숫자만)는 관리자·모으기 계정만 읽고, 쓰기는 정의자 함수(notice_start_run·notice_add_run_usage·notice_finish_run)로만.
-- notice_marks는 승인된 원장이 자기 병원 줄만 읽고 넣고 고친다(hospital_id는 DB 기본값으로만, 지우기 없음).
-- notice_collectors·notice_ask_days·notice_ask_holds는 표 권한·정책이 없다(목록은 SQL 편집기로만, 묻기 수는 take_notice_ask·end_notice_ask로만)

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- 줄 제약이 부르는 검사 함수 둘(바뀌지 않는 값만 본다). 넣는 사람(authenticated)이 부를 수 있어야 제약이 돈다
-- 붙임 목록: 배열 10개까지, 항목은 {name 1~200자, url 500자까지·두 사이트 https 주소}만
create or replace function public.notice_links_ok(p jsonb) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) > 10 then false
    else not exists (
      select 1
        from jsonb_array_elements(p) as e (item)
       where not coalesce(
         case
           when jsonb_typeof(e.item) <> 'object' then false
           else (select array_agg(k order by k) from jsonb_object_keys(e.item) as k) = array['name', 'url']
                and jsonb_typeof(e.item -> 'name') = 'string'
                and jsonb_typeof(e.item -> 'url') = 'string'
                and char_length(e.item ->> 'name') between 1 and 200
                and char_length(e.item ->> 'url') <= 500
                and (e.item ->> 'url') ~ '^https://www[.](hira[.]or[.]kr|mohw[.]go[.]kr)/'
         end,
         false)
    )
  end
$$;

-- 주간 꼭 알 것: 배열 3개까지, 항목은 {head 60자까지, body 120자까지}만
create or replace function public.notice_top3_ok(p jsonb) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'array' then false
    when jsonb_array_length(p) > 3 then false
    else not exists (
      select 1
        from jsonb_array_elements(p) as e (item)
       where not coalesce(
         case
           when jsonb_typeof(e.item) <> 'object' then false
           else (select array_agg(k order by k) from jsonb_object_keys(e.item) as k) = array['body', 'head']
                and jsonb_typeof(e.item -> 'head') = 'string'
                and jsonb_typeof(e.item -> 'body') = 'string'
                and char_length(e.item ->> 'head') <= 60
                and char_length(e.item ->> 'body') <= 120
         end,
         false)
    )
  end
$$;

-- 고칠 때마다 updated_at = 지금(이 기능의 표만 쓰는 함수. 공용 touch_updated_at은 부르지 않는다). 트리거만 부른다
create or replace function public.notices_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 모으기 계정 목록(admins처럼 SQL 편집기로만 넣는다). 표 권한·정책이 없어 누구도 바로 읽고 쓰지 못한다
create table if not exists public.notice_collectors (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 지금 로그인한 계정이 모으기 계정인가(정의자: 목록 표를 대신 읽는다)
create or replace function public.is_notice_collector() returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.notice_collectors c where c.user_id = (select auth.uid()))
$$;

-- 묶음 하나 = 화면 한 줄(같은 고시가 여러 곳에 오면 group_key로 한 줄). 요약·규칙 연결·요약 상태도 여기에 둔다
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique check (char_length(group_key) between 3 and 200),
  title text not null check (char_length(title) between 1 and 300),
  kind text not null check (kind in ('gosi', 'notice', 'interp', 'guide', 'case')),
  posted_on date not null check (posted_on >= date '2026-01-01'),
  notice_no text check (notice_no ~ '^[0-9]{4}-[0-9]{1,4}$'),
  body text not null default '' check (char_length(body) <= 20000),
  attach_text text not null default '' check (char_length(attach_text) <= 20000),
  read_mode text check (read_mode in ('full', 'text', 'body')),
  related boolean,
  summary jsonb check (summary is null or (jsonb_typeof(summary) = 'object' and octet_length(summary::text) <= 4000)),
  rule_hits jsonb not null default '[]' check (case when jsonb_typeof(rule_hits) = 'array' then jsonb_array_length(rule_hits) <= 50 else false end),
  rule_count integer generated always as (case when jsonb_typeof(rule_hits) = 'array' then jsonb_array_length(rule_hits) else 0 end) stored,
  state text not null default 'wait' check (state in ('wait', 'batch', 'done', 'failed')),
  tries integer not null default 0 check (tries between 0 and 5),
  batch_id text check (batch_id ~ '^[A-Za-z0-9_]{1,100}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notices_posted_on on public.notices (posted_on desc);
create index if not exists notices_state on public.notices (state);

-- 출처 글(한 묶음에 출처마다 하나 이상). 주소·붙임 주소는 두 사이트 https만
create table if not exists public.notice_posts (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  source text not null check (source in ('hira_notice', 'hira_crtr', 'mohw_rss')),
  source_key text not null check (char_length(source_key) between 1 and 100),
  title text not null check (char_length(title) between 1 and 300),
  url text not null check (char_length(url) <= 500 and url ~ '^https://www[.](hira[.]or[.]kr|mohw[.]go[.]kr)/'),
  posted_on date not null,
  attachments jsonb not null default '[]' check (public.notice_links_ok(attachments)),
  created_at timestamptz not null default now(),
  unique (source, source_key)
);
create index if not exists notice_posts_notice on public.notice_posts (notice_id);

-- 출처마다 한 줄: 마지막 확인·성공·멈춘 시각, 지난 글 채우기 쪽 표시(cursor)와 끝 여부
create table if not exists public.notice_sources (
  source text primary key check (source in ('hira_notice', 'hira_crtr', 'mohw_rss')),
  state text not null default 'ok' check (state in ('ok', 'stopped')),
  error_code text check (error_code in ('blocked', 'http', 'shape')),
  checked_at timestamptz,
  last_ok_at timestamptz,
  stopped_since timestamptz,
  cursor jsonb not null default '{}' check (jsonb_typeof(cursor) = 'object' and octet_length(cursor::text) <= 1000),
  backfill_done boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 주간 모음(주의 월요일마다 하나). top3 = 꼭 알 것 0~3개
create table if not exists public.notice_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  top3 jsonb not null default '[]' check (public.notice_top3_ok(top3)),
  created_at timestamptz not null default now()
);

-- 모으기 실행 기록(숫자만, 글 내용 없음). 비용은 백만분의 1달러
create table if not exists public.notice_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  counts jsonb not null default '{}' check (jsonb_typeof(counts) = 'object' and octet_length(counts::text) <= 2000),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0)
);

-- 병원마다 글 하나에 표시 한 줄(읽음·별표·메모 500자·메모 시각·규칙 확인 시각)
create table if not exists public.notice_marks (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  notice_id uuid not null references public.notices (id) on delete cascade,
  read_at timestamptz,
  starred boolean not null default false,
  memo text not null default '' check (char_length(memo) <= 500),
  memo_at timestamptz,
  rules_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (hospital_id, notice_id)
);

-- 묻기 횟수: 병원·한국 날짜마다 받은 표 수(0~20)와 아직 끝나지 않은 표
create table if not exists public.notice_ask_days (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count between 0 and 20),
  primary key (hospital_id, day)
);
create table if not exists public.notice_ask_holds (
  token uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now()
);

create or replace trigger notices_touch before update on public.notices
  for each row execute function public.notices_touch();
create or replace trigger notice_sources_touch before update on public.notice_sources
  for each row execute function public.notices_touch();
create or replace trigger notice_marks_touch before update on public.notice_marks
  for each row execute function public.notices_touch();

alter table public.notices enable row level security;
alter table public.notice_posts enable row level security;
alter table public.notice_sources enable row level security;
alter table public.notice_weeks enable row level security;
alter table public.notice_runs enable row level security;
alter table public.notice_collectors enable row level security;
alter table public.notice_marks enable row level security;
alter table public.notice_ask_days enable row level security;
alter table public.notice_ask_holds enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.notices, public.notice_posts, public.notice_sources, public.notice_weeks, public.notice_runs,
  public.notice_collectors, public.notice_marks, public.notice_ask_days, public.notice_ask_holds
  from public, anon, authenticated;

-- 공용 표 넷: 읽기 + 정해 둔 칸 넣기·고치기(누가 되는지는 정책이 정한다). 지우기 권한 없음.
-- upsert(onConflict)는 보낸 칸을 모두 SET에 쓰므로 넣기 칸과 고치기 칸이 같다
grant select on table public.notices, public.notice_posts, public.notice_sources, public.notice_weeks to authenticated;
grant insert (group_key, title, kind, posted_on, notice_no, body, attach_text, read_mode, related, summary, rule_hits, state, tries, batch_id),
  update (group_key, title, kind, posted_on, notice_no, body, attach_text, read_mode, related, summary, rule_hits, state, tries, batch_id)
  on table public.notices to authenticated;
grant insert (notice_id, source, source_key, title, url, posted_on, attachments),
  update (notice_id, source, source_key, title, url, posted_on, attachments)
  on table public.notice_posts to authenticated;
grant insert (source, state, error_code, checked_at, last_ok_at, stopped_since, cursor, backfill_done),
  update (source, state, error_code, checked_at, last_ok_at, stopped_since, cursor, backfill_done)
  on table public.notice_sources to authenticated;
grant insert (week_start, top3), update (week_start, top3) on table public.notice_weeks to authenticated;
-- 실행 기록: 읽기만(쓰기는 정의자 함수)
grant select on table public.notice_runs to authenticated;
-- 내 병원 표시: hospital_id·updated_at은 뺀다(남의 병원으로 쓰지 못하게). notice_id는 upsert의 SET이 같은 값을 다시 쓴다
grant select on table public.notice_marks to authenticated;
grant insert (notice_id, read_at, starred, memo, memo_at, rules_checked_at),
  update (notice_id, read_at, starred, memo, memo_at, rules_checked_at)
  on table public.notice_marks to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인된 원장이 아니면 my_hospital_id()가 null이다
drop policy if exists "공용 읽기(승인된 원장·모으기 계정)" on public.notices;
create policy "공용 읽기(승인된 원장·모으기 계정)" on public.notices
  for select to authenticated
  using ((select public.my_hospital_id()) is not null or (select public.is_notice_collector()));
drop policy if exists "모으기 계정 넣기" on public.notices;
create policy "모으기 계정 넣기" on public.notices
  for insert to authenticated
  with check ((select public.is_notice_collector()));
drop policy if exists "모으기 계정 고치기" on public.notices;
create policy "모으기 계정 고치기" on public.notices
  for update to authenticated
  using ((select public.is_notice_collector()))
  with check ((select public.is_notice_collector()));

drop policy if exists "공용 읽기(승인된 원장·모으기 계정)" on public.notice_posts;
create policy "공용 읽기(승인된 원장·모으기 계정)" on public.notice_posts
  for select to authenticated
  using ((select public.my_hospital_id()) is not null or (select public.is_notice_collector()));
drop policy if exists "모으기 계정 넣기" on public.notice_posts;
create policy "모으기 계정 넣기" on public.notice_posts
  for insert to authenticated
  with check ((select public.is_notice_collector()));
drop policy if exists "모으기 계정 고치기" on public.notice_posts;
create policy "모으기 계정 고치기" on public.notice_posts
  for update to authenticated
  using ((select public.is_notice_collector()))
  with check ((select public.is_notice_collector()));

drop policy if exists "공용 읽기(승인된 원장·모으기 계정)" on public.notice_sources;
create policy "공용 읽기(승인된 원장·모으기 계정)" on public.notice_sources
  for select to authenticated
  using ((select public.my_hospital_id()) is not null or (select public.is_notice_collector()));
drop policy if exists "모으기 계정 넣기" on public.notice_sources;
create policy "모으기 계정 넣기" on public.notice_sources
  for insert to authenticated
  with check ((select public.is_notice_collector()));
drop policy if exists "모으기 계정 고치기" on public.notice_sources;
create policy "모으기 계정 고치기" on public.notice_sources
  for update to authenticated
  using ((select public.is_notice_collector()))
  with check ((select public.is_notice_collector()));

drop policy if exists "공용 읽기(승인된 원장·모으기 계정)" on public.notice_weeks;
create policy "공용 읽기(승인된 원장·모으기 계정)" on public.notice_weeks
  for select to authenticated
  using ((select public.my_hospital_id()) is not null or (select public.is_notice_collector()));
drop policy if exists "모으기 계정 넣기" on public.notice_weeks;
create policy "모으기 계정 넣기" on public.notice_weeks
  for insert to authenticated
  with check ((select public.is_notice_collector()));
drop policy if exists "모으기 계정 고치기" on public.notice_weeks;
create policy "모으기 계정 고치기" on public.notice_weeks
  for update to authenticated
  using ((select public.is_notice_collector()))
  with check ((select public.is_notice_collector()));

-- 실행 기록: 관리자(admins에 내 줄)와 모으기 계정만 읽는다
drop policy if exists "실행 기록 읽기(관리자·모으기 계정)" on public.notice_runs;
create policy "실행 기록 읽기(관리자·모으기 계정)" on public.notice_runs
  for select to authenticated
  using (
    exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    or (select public.is_notice_collector())
  );

drop policy if exists "내 병원 표시 읽기" on public.notice_marks;
create policy "내 병원 표시 읽기" on public.notice_marks
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 표시 넣기" on public.notice_marks;
create policy "내 병원 표시 넣기" on public.notice_marks
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 표시 고치기" on public.notice_marks;
create policy "내 병원 표시 고치기" on public.notice_marks
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

-- 출처 세 줄(복지부는 RSS 글만이라 지난 글 채우기가 처음부터 끝). 이미 있으면 그대로
insert into public.notice_sources (source, backfill_done)
  values ('hira_notice', false), ('hira_crtr', false), ('mohw_rss', true)
  on conflict (source) do nothing;

-- 실행 시작: 모으기 계정만. 표를 잠근 뒤 끝나지 않은 실행이 6분 안에 시작됐으면 null(다른 실행이 돎), 아니면 새 줄 id
create or replace function public.notice_start_run() returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_notice_collector() then
    raise exception 'not a notice collector' using errcode = '42501';
  end if;
  -- 같은 때 두 실행이 와도 하나씩 본다(잠금은 이 거래가 끝날 때 풀린다)
  lock table public.notice_runs in share row exclusive mode;
  if exists (select 1 from public.notice_runs r where r.finished_at is null and r.started_at > now() - interval '6 minutes') then
    return null;
  end if;
  insert into public.notice_runs default values returning id into v_id;
  return v_id;
end
$$;

-- 실행 줄에 Claude 사용량을 더한다(모으기 계정만, 0 이상만)
create or replace function public.notice_add_run_usage(p_id uuid, p_input bigint, p_output bigint, p_cost bigint) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_notice_collector() then
    raise exception 'not a notice collector' using errcode = '42501';
  end if;
  if p_input is null or p_output is null or p_cost is null or p_input < 0 or p_output < 0 or p_cost < 0 then
    raise exception 'usage must be zero or more' using errcode = '22023';
  end if;
  update public.notice_runs r
     set input_tokens = r.input_tokens + p_input,
         output_tokens = r.output_tokens + p_output,
         cost_micro_usd = r.cost_micro_usd + p_cost
   where r.id = p_id;
end
$$;

-- 실행 마감: 끝 시각과 건수(숫자·출처 이름만, 2,000바이트까지는 표 제약이 막는다)
create or replace function public.notice_finish_run(p_id uuid, p_counts jsonb) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_notice_collector() then
    raise exception 'not a notice collector' using errcode = '42501';
  end if;
  update public.notice_runs r
     set finished_at = now(), counts = coalesce(p_counts, '{}'::jsonb)
   where r.id = p_id;
end
$$;

-- 묻기 표 받기: 승인된 원장만(아니면 42501). 내 병원 오늘(한국 날짜) 수가 20 밑이면 하나 올리고 표(uuid), 20이면 null.
-- 하루 지난 표는 이때 지운다. 동시에 눌러도 on conflict가 줄을 잠그고 세므로 20을 넘지 않는다
create or replace function public.take_notice_ask() returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_count integer;
  v_token uuid;
begin
  if v_hospital is null then
    raise exception 'not an approved hospital owner' using errcode = '42501';
  end if;
  delete from public.notice_ask_holds h where h.day < v_day;
  insert into public.notice_ask_days as d (hospital_id, day, count)
  values (v_hospital, v_day, 1)
  on conflict (hospital_id, day) do update
     set count = d.count + 1
   where d.count < 20
  returning d.count into v_count;
  if v_count is null then
    return null;
  end if;
  insert into public.notice_ask_holds (hospital_id, day) values (v_hospital, v_day) returning token into v_token;
  return v_token;
end
$$;

-- 묻기 표 끝내기: 내 병원·오늘 표가 있으면 지우고, p_ok가 거짓이면(AI 실패) 그날 수를 1 되돌린다.
-- 없는 표·다른 병원 표·이미 쓴 표·어제 표·원장이 아닌 계정은 아무것도 바꾸지 않는다
create or replace function public.end_notice_ask(p_token uuid, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_day date := (now() at time zone 'Asia/Seoul')::date;
begin
  delete from public.notice_ask_holds h
   where h.token = p_token and h.hospital_id = v_hospital and h.day = v_day;
  if found and p_ok is false then
    update public.notice_ask_days d
       set count = d.count - 1
     where d.hospital_id = v_hospital and d.day = v_day and d.count > 0;
  end if;
end
$$;

-- 오늘(한국 날짜) 남은 묻기 수 = 20 − 오늘 수. 승인된 원장만(아니면 42501)
create or replace function public.notice_ask_left() returns integer language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
begin
  if v_hospital is null then
    raise exception 'not an approved hospital owner' using errcode = '42501';
  end if;
  return 20 - coalesce(
    (select d.count from public.notice_ask_days d where d.hospital_id = v_hospital and d.day = (now() at time zone 'Asia/Seoul')::date),
    0);
end
$$;

-- 찾기(호출자 권한: 읽을 수 있는 글만). 앞뒤 공백을 뗀 1~50자, 빈칸으로 나눈 낱말 5개까지(넘는 낱말은 버림)가 모두
-- 제목·본문·붙임 글자·요약 네 칸(what·when·who·forUs) 안에 든 글 id를 최근 글부터 200개. \·%·_는 글자 그대로 찾는다(escape).
-- 색인 없는 ilike다(design 14절)
create or replace function public.notice_search(p_q text) returns setof uuid language sql stable security invoker set search_path = ''
as $$
  with q as (
    select regexp_replace(coalesce(p_q, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') as s
  ),
  words as (
    select t.w, t.n
      from q, regexp_split_to_table(q.s, '[[:space:]]+') with ordinality as t (w, n)
     where char_length(q.s) between 1 and 50
  ),
  pats as (
    select '%' || replace(replace(replace(w.w, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' as pat
      from words w
     where w.n <= 5 and w.w <> ''
  )
  select n.id
    from public.notices n
   where exists (select 1 from pats)
     and not exists (
       select 1
         from pats
        where concat_ws(' ', n.title, n.body, n.attach_text,
                        n.summary ->> 'what', n.summary ->> 'when', n.summary ->> 'who', n.summary ->> 'forUs')
              not ilike pats.pat escape E'\\'
     )
   order by n.posted_on desc, n.created_at desc, n.id desc
   limit 200
$$;

-- 목록(호출자 권한). { total, unread, rows }이고 rows는 최근 글부터 p_limit(1~50으로 맞춤)개·p_offset부터.
-- 줄 모양(src/types/notices.ts NoticeView): id·title·kind·postedOn·noticeNo·related·summary·readMode·state·ruleHits·
-- posts([{source, title, url, postedOn, attachments}], 복지부 → 심평원 공지 → 심평원 심사기준 차례)·
-- mark({readAt, starred, memo, memoAt, rulesCheckedAt}, 없으면 기본 모양)·unread.
-- 거르기: p_related 참이면 관련 글과 요약 전·실패 글(요약이 끝난 무관 글만 뺀다), p_sources는 그 출처 글이 하나라도 든 묶음(null = 모두),
-- p_starred는 내 별표, p_ids는 그 id만(null = 모두), p_unread_only는 안 읽음만.
-- unread = 올라온 지 14일(한국 날짜, 오늘 포함) 안이고 내 읽음 표시가 없음. total·unread는 거른 전체 수다
create or replace function public.notice_list(
  p_related boolean, p_sources text[], p_starred boolean, p_ids uuid[], p_unread_only boolean, p_limit integer, p_offset integer
) returns jsonb language sql stable security invoker set search_path = ''
as $$
  with me as (
    select (select public.my_hospital_id()) as hospital_id, (now() at time zone 'Asia/Seoul')::date as today
  ),
  picked as (
    select n.id, n.title, n.kind, n.posted_on, n.notice_no, n.related, n.summary, n.read_mode, n.state, n.rule_hits, n.created_at,
           m.read_at, coalesce(m.starred, false) as starred, coalesce(m.memo, '') as memo, m.memo_at, m.rules_checked_at,
           (n.posted_on > me.today - 14 and m.read_at is null) as unread
      from public.notices n
     cross join me
      left join public.notice_marks m on m.notice_id = n.id and m.hospital_id = me.hospital_id
     where (not coalesce(p_related, false) or n.related is not false or n.state <> 'done')
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
                 'unread', g.unread
               )
               order by g.posted_on desc, g.created_at desc, g.id desc)
        from page g
    ), '[]'::jsonb)
  )
$$;

-- 탭 숫자·대시보드: 관련 글(목록의 '관련 글만'과 같은 거르기) 가운데 안 읽은 수
create or replace function public.notice_unread_count() returns integer language sql stable security invoker set search_path = ''
as $$
  select (public.notice_list(true, null, false, null, false, 1, 0) ->> 'unread')::integer
$$;

-- 대시보드 맨 위 경고: 규칙 연결이 있고 내 병원 규칙 확인이 없는 글(최근 글부터)
create or replace function public.notice_rule_alerts() returns table (id uuid, notice_no text, title text, rule_count integer)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.notice_no, n.title, n.rule_count
    from public.notices n
   where n.rule_count > 0
     and not exists (
       select 1
         from public.notice_marks m
        where m.notice_id = n.id and m.hospital_id = (select public.my_hospital_id()) and m.rules_checked_at is not null
     )
   order by n.posted_on desc, n.created_at desc, n.id desc
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거두고 authenticated에만 준다(트리거 함수는 아무에게도)
revoke all on function public.notice_links_ok(jsonb) from public, anon, authenticated;
revoke all on function public.notice_top3_ok(jsonb) from public, anon, authenticated;
revoke all on function public.notices_touch() from public, anon, authenticated;
revoke all on function public.is_notice_collector() from public, anon, authenticated;
revoke all on function public.notice_start_run() from public, anon, authenticated;
revoke all on function public.notice_add_run_usage(uuid, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.notice_finish_run(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.take_notice_ask() from public, anon, authenticated;
revoke all on function public.end_notice_ask(uuid, boolean) from public, anon, authenticated;
revoke all on function public.notice_ask_left() from public, anon, authenticated;
revoke all on function public.notice_search(text) from public, anon, authenticated;
revoke all on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.notice_unread_count() from public, anon, authenticated;
revoke all on function public.notice_rule_alerts() from public, anon, authenticated;
grant execute on function public.notice_links_ok(jsonb) to authenticated;
grant execute on function public.notice_top3_ok(jsonb) to authenticated;
grant execute on function public.is_notice_collector() to authenticated;
grant execute on function public.notice_start_run() to authenticated;
grant execute on function public.notice_add_run_usage(uuid, bigint, bigint, bigint) to authenticated;
grant execute on function public.notice_finish_run(uuid, jsonb) to authenticated;
grant execute on function public.take_notice_ask() to authenticated;
grant execute on function public.end_notice_ask(uuid, boolean) to authenticated;
grant execute on function public.notice_ask_left() to authenticated;
grant execute on function public.notice_search(text) to authenticated;
grant execute on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) to authenticated;
grant execute on function public.notice_unread_count() to authenticated;
grant execute on function public.notice_rule_alerts() to authenticated;
