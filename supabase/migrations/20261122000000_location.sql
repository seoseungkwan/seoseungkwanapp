-- 입지 분석 서버 표: 설정(location_settings)·후보(location_candidates)·매물(location_listings)·메모(location_notes)·
-- 사진 줄(location_photos)·새 경쟁 의원 알림(location_events) 여섯, 점수 설정 검사 함수(location_score_rule_ok),
-- 의원 과목 고르기 검사 함수(location_dept_rule_ok — 설정 칸 dept_rule), 사진 바구니(Storage) location-photos
-- (spec location REQ-7902·REQ-7919·REQ-7921, design.md 7·8·18절, ADR-042~044)
--
-- 이 파일을 dept_rule 칸이 생기기 전에 한 번 붙여 넣었어도 다시 붙이면 된다: 설정 표에 dept_rule 칸만 더하고(add column if not exists)
-- 이미 있던 설정 줄은 그 칸에 처음 값(경쟁 = 정형외과·신경외과·마취통증의학과·재활의학과)을 받는다.
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원·관리자 표)·20261030000000_precheck_settings.sql(my_hospital_id())·
-- 20261121000000_contacts.sql(주소록 업체 표 — 매물의 중개사 칸이 가리킨다)이 들어가 있어야 한다. my_hospital_id()는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만들고,
-- 바구니 설정은 이 파일 값으로 되돌린다. 이미 있던 줄과 사진은 그대로). 트리거 바꿔 쓰기(create or replace trigger)는 Postgres 14 이상,
-- 바깥 키의 'on delete set null (칸)'은 Postgres 15 이상이다(Supabase는 15 이상).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 입지 분석 탭은 읽기 실패 글이고 대시보드 새 경쟁 의원 알림은 비어 있다).
-- 실행 뒤 Storage 화면에 location-photos 바구니가 보이고 'Private'(공개 아님)인지 본다.
--
-- 무엇을 왜: 새로 개원할 자리를 찾는 관리자가 후보 자리(직접 고른 점·적은 이름·적은 주소 글)·붙여 넣은 매물·메모·현장 사진·
-- 개원 준비 값(비용·협상표·점검표·일정 다 함)과 후보를 저장한 날의 공공 자료 숫자(snapshot)를 둔다. 환자 정보는 없다.
-- 카카오에서 받은 주소 글·좌표·장소 목록·거리·로드뷰는 저장하지 않는다(카카오 운영정책, ADR-044).
-- jsonb 크기는 jsonb 글자(::text — 열쇠 뒤 ': '·항목 사이 ', '의 빈칸 포함)의 바이트로 잰다. 앱도 같은 모양으로 재서 줄인다.
-- 바깥 키는 (hospital_id, 부모 id) 둘로 건다(바깥 키 검사는 RLS를 보지 않아, 남의 병원 후보·업체 id를 알아도 그 밑에 못 달게).
-- 후보를 지우면 그 메모·사진 줄·알림 줄이 함께 지워지고, 매물은 남되 후보 칸만 빈다. 주소록 업체를 지우면 매물의 중개사 칸만 빈다.
-- 사진 파일(Storage)은 앱이 지운다. 사진 줄은 후보마다 30줄까지다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 원장(my_hospital_id())이면서 관리자(admins에 자기 줄)인 사람만
-- 자기 병원 줄을 읽고 정해 둔 칸으로 넣고 고치고 지운다(설정은 지우기 없음, 메모·사진 줄은 고치기 없음, 알림 줄은 본 시각만 고친다).
-- 관리자가 아닌 원장·데스크·승인 대기·거절·병원 없는 사용자는 관리자 줄이 있어도 아무 줄도 못 보고 못 바꾼다(데스크 정책 없음).
-- id·hospital_id·created_at·updated_at은 칸 권한이 없어 DB(기본값·트리거)만 정한다.
-- 사진은 관리자가 자기 병원 폴더('<병원 id>/<후보 id>/<uuid>.jpg') 것만 읽고 올리고 지운다(고치기 없음)

-- 의원 과목 고르기 검사(design.md 18절 모양). { "v": 1, "rival": [과목 id], "hide": [과목 id] } — 경쟁 의원 · 안 보기(둘 다 아니면 둘레로 보기).
-- 과목 id는 아래 스물하나(앱 lib/location/depts.ts DEPTS와 차례까지 같다 — 시험이 견준다) 가운데 글자, 한 목록에 같은 id 두 번 없음,
-- rival과 hide에 같은 과목 없음, 열쇠가 더 있거나 모자라면 false. 빈 목록(경쟁 0개)은 된다. 크기(1,000바이트)는 표 제약이 본다.
-- or는 앞에서부터 끊긴다는 보장이 없어 종류 검사와 값 검사를 나눈다
create or replace function public.location_dept_rule_ok(p_rule jsonb) returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  ids constant text[] := array['im', 'neuro', 'psy', 'gs', 'ortho', 'ns', 'cs', 'plastic', 'pain', 'obgy', 'ped', 'eye', 'ent', 'derm', 'uro', 'rad', 'rehab', 'fm', 'oem', 'dental', 'korean'];
  k text;
  x jsonb;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_rule)) <> 3 or not (p_rule ?& array['v', 'rival', 'hide']) then return false; end if;
  if p_rule -> 'v' is distinct from '1'::jsonb then return false; end if;

  -- 경쟁 의원(rival)·안 보기(hide): 과목 id 글자의 배열, 한 목록 안에 되풀이 없음
  foreach k in array array['rival', 'hide'] loop
    if jsonb_typeof(p_rule -> k) <> 'array' then return false; end if;
    for x in select value from jsonb_array_elements(p_rule -> k) loop
      if jsonb_typeof(x) <> 'string' then return false; end if;
      if not ((x #>> '{}') = any (ids)) then return false; end if;
    end loop;
    if (select count(distinct value) from jsonb_array_elements(p_rule -> k)) <> jsonb_array_length(p_rule -> k) then return false; end if;
  end loop;

  -- 같은 과목을 경쟁과 안 보기에 함께 두지 않는다
  if exists (select 1 from jsonb_array_elements(p_rule -> 'rival') r join jsonb_array_elements(p_rule -> 'hide') h on r.value = h.value) then
    return false;
  end if;
  return true;
end
$$;
-- 표 검사가 넣는 사람 권한으로 부르므로 authenticated에 준다(public·anon에서는 거둔다)
revoke all on function public.location_dept_rule_ok(jsonb) from public, anon;
grant execute on function public.location_dept_rule_ok(jsonb) to authenticated;

-- 점수 설정 검사(design.md 8절 모양). { "v": 1, "weights": {항목 다섯: 0~100 정수}, "bands": [0~10 정수 1~11개, 겹침 없음],
-- "items": {세부 id: {"w": 0~100 정수, "full": 1 이상 정수} 또는 {"w", "best", "worst": 정수, best < worst}} }. 열쇠가 더 있거나 모자라면 false.
-- 항목·세부 id 목록과 처음 값은 앱 lib/location/score.ts(DEFAULT_SCORE_RULE) 한 곳이고 DB는 모양·범위만 본다. 크기(4,000바이트)는 표 제약이 본다.
-- or는 앞에서부터 끊긴다는 보장이 없어 종류 검사와 숫자 검사를 나눈다(숫자가 아닌 값을 numeric으로 바꾸지 않게)
create or replace function public.location_score_rule_ok(p_rule jsonb) returns boolean language plpgsql immutable security invoker set search_path = ''
as $$
declare
  x jsonb;
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_rule)) <> 4 or not (p_rule ?& array['v', 'weights', 'bands', 'items']) then return false; end if;
  if p_rule -> 'v' is distinct from '1'::jsonb then return false; end if;

  -- 바깥 무게: 열쇠 다섯
  if jsonb_typeof(p_rule -> 'weights') <> 'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(p_rule -> 'weights')) <> 5 then return false; end if;
  for x in select value from jsonb_each(p_rule -> 'weights') loop
    if jsonb_typeof(x) <> 'number' then return false; end if;
    if x::numeric <> trunc(x::numeric) or x::numeric not between 0 and 100 then return false; end if;
  end loop;

  -- 셀 나이대: 10세 11칸의 번호(0 = 0~9세 … 10 = 100세 이상)
  if jsonb_typeof(p_rule -> 'bands') <> 'array' then return false; end if;
  if jsonb_array_length(p_rule -> 'bands') not between 1 and 11 then return false; end if;
  for x in select value from jsonb_array_elements(p_rule -> 'bands') loop
    if jsonb_typeof(x) <> 'number' then return false; end if;
    if x::numeric <> trunc(x::numeric) or x::numeric not between 0 and 10 then return false; end if;
  end loop;
  if (select count(distinct value::numeric) from jsonb_array_elements(p_rule -> 'bands')) <> jsonb_array_length(p_rule -> 'bands') then
    return false;
  end if;

  -- 세부 항목: 많을수록 좋음 {w, full} · 적을수록 좋음 {w, best, worst}
  if jsonb_typeof(p_rule -> 'items') <> 'object' then return false; end if;
  for x in select value from jsonb_each(p_rule -> 'items') loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    if jsonb_typeof(x -> 'w') is distinct from 'number' then return false; end if;
    if (x -> 'w')::numeric <> trunc((x -> 'w')::numeric) or (x -> 'w')::numeric not between 0 and 100 then return false; end if;
    if x ? 'full' then
      if (select count(*) from jsonb_object_keys(x)) <> 2 then return false; end if;
      if jsonb_typeof(x -> 'full') <> 'number' then return false; end if;
      if (x -> 'full')::numeric <> trunc((x -> 'full')::numeric) or (x -> 'full')::numeric < 1 then return false; end if;
    else
      if (select count(*) from jsonb_object_keys(x)) <> 3 or not (x ?& array['best', 'worst']) then return false; end if;
      if jsonb_typeof(x -> 'best') <> 'number' or jsonb_typeof(x -> 'worst') <> 'number' then return false; end if;
      if (x -> 'best')::numeric <> trunc((x -> 'best')::numeric) or (x -> 'worst')::numeric <> trunc((x -> 'worst')::numeric)
         or (x -> 'best')::numeric >= (x -> 'worst')::numeric then
        return false;
      end if;
    end if;
  end loop;
  return true;
end
$$;
-- 표 검사가 넣는 사람 권한으로 부르므로 authenticated에 준다(public·anon에서는 거둔다)
revoke all on function public.location_score_rule_ok(jsonb) from public, anon;
grant execute on function public.location_score_rule_ok(jsonb) to authenticated;

-- (1) 설정: 병원마다 한 줄. 점수 설정(바깥 무게·세부 무게·기준·나이대, 처음 값은 design.md 8절 표)과 지금 의원 체외충격파 1회 값(원),
-- 의원 과목 고르기(처음 값 = 앱 lib/location/depts.ts DEFAULT_DEPT_RULE과 글자까지 같다). dept_rule은 맨 끝 칸이라
-- 먼저 붙인 표에 아래 add column으로 더해도 새로 만든 표와 칸 차례가 같다
create table if not exists public.location_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  score_rule jsonb not null default '{
    "v": 1,
    "weights": {"people": 30, "rivals": 25, "transit": 20, "site": 15, "cost": 10},
    "bands": [4, 5, 6, 7, 8, 9, 10],
    "items": {
      "p-density": {"w": 40, "full": 10000}, "p-senior": {"w": 15, "full": 25}, "p-households": {"w": 5, "full": 20000},
      "p-apts": {"w": 10, "full": 10000}, "p-trend": {"w": 10, "full": 5}, "p-accidents": {"w": 5, "full": 3},
      "p-industry": {"w": 5, "full": 20000}, "p-schools": {"w": 5, "full": 5}, "p-facilities": {"w": 5, "full": 30},
      "p-welfare": {"w": 0, "full": 5},
      "c-count": {"w": 30, "best": 0, "worst": 6}, "c-perRival": {"w": 35, "full": 20000}, "c-newOpen": {"w": 15, "best": 0, "worst": 3},
      "c-gaps": {"w": 10, "full": 10}, "c-price": {"w": 10, "full": 20},
      "t-station": {"w": 40, "best": 200, "worst": 1500}, "t-stops": {"w": 20, "full": 10}, "t-flow": {"w": 40, "full": 30000},
      "s-floor": {"w": 25, "best": 1, "worst": 5}, "s-elevator": {"w": 20, "full": 1}, "s-parking": {"w": 15, "full": 30},
      "s-age": {"w": 10, "best": 5, "worst": 30}, "s-neighbors": {"w": 10, "full": 1}, "s-sign": {"w": 10, "full": 1},
      "s-violation": {"w": 10, "full": 1}, "s-clinics": {"w": 0, "full": 3},
      "k-rentPy": {"w": 35, "best": 50000, "worst": 200000}, "k-deposit": {"w": 15, "best": 30000000, "worst": 200000000},
      "k-premium": {"w": 20, "best": 0, "worst": 100000000}, "k-vsAvg": {"w": 30, "best": -20, "worst": 20}
    }
  }'::jsonb check (public.location_score_rule_ok(score_rule) and octet_length(score_rule::text) <= 4000),
  home_eswt bigint check (home_eswt between 0 and 9999999999),
  updated_at timestamptz not null default now(),
  dept_rule jsonb not null default '{"v": 1, "rival": ["ortho", "ns", "pain", "rehab"], "hide": []}'::jsonb check (public.location_dept_rule_ok(dept_rule) and octet_length(dept_rule::text) <= 1000)
);
-- dept_rule 칸이 생기기 전에 만든 표: 칸만 더한다(위 칸 정의와 글자까지 같게. 이미 있으면 건너뛴다)
alter table public.location_settings add column if not exists dept_rule jsonb not null default '{"v": 1, "rival": ["ortho", "ns", "pain", "rehab"], "hide": []}'::jsonb check (public.location_dept_rule_ok(dept_rule) and octet_length(dept_rule::text) <= 1000);

-- (2) 후보 자리: 사용자가 고른 점(위도 33~39·경도 124~132)·적은 이름·적은 주소 글·살필 범위(일곱 값, m)·진행 상태 다섯,
-- 층·넓이(㎡)·간판 보임·위반 건축물 고름, 비용(원 정수 열쇠들)·협상표·점검표·목표 개원일·다 한 할 일,
-- 그날 값(공공 자료로 만든 숫자, 출처·기준 날짜 포함)과 받은 시각, 새 경쟁 의원 마지막 확인 날
create table if not exists public.location_candidates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  address_note text not null default '' check (char_length(address_note) <= 100),
  lat double precision not null check (lat between 33 and 39),
  lng double precision not null check (lng between 124 and 132),
  radius_m integer not null default 1000 check (radius_m in (300, 500, 700, 1000, 1500, 2000, 3000)),
  status text not null default 'watching' check (status in ('watching', 'contacted', 'visited', 'reviewing', 'dropped')),
  floor_label text not null default '' check (char_length(floor_label) <= 20),
  area_m2 numeric(8, 2) check (area_m2 > 0),
  sign_visible text check (sign_visible in ('yes', 'no', 'unknown')),
  violation text check (violation in ('yes', 'no', 'unknown')),
  costs jsonb not null default '{}' check (jsonb_typeof(costs) = 'object' and octet_length(costs::text) <= 2000),
  terms jsonb not null default '{}' check (jsonb_typeof(terms) = 'object' and octet_length(terms::text) <= 6000),
  checks jsonb not null default '{}' check (jsonb_typeof(checks) = 'object' and octet_length(checks::text) <= 4000),
  open_on date,
  tasks_done jsonb not null default '[]' check (jsonb_typeof(tasks_done) = 'array' and octet_length(tasks_done::text) <= 2000),
  snapshot jsonb check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536),
  snapshot_at timestamptz,
  watch_checked_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, id) -- 아래 표들의 바깥 키 자리
);

-- (3) 붙여 넣은 매물: 링크(https만)·제목·넓이·층·보증금·월세·권리금·관리비(원 정수)·중개사(주소록 업체)·메모·점(있으면 둘 다).
-- 후보를 지우면 후보 칸만, 업체를 지우면 중개사 칸만 빈다(병원 칸은 그대로)
create table if not exists public.location_listings (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  candidate_id uuid,
  title text not null check (char_length(title) between 1 and 40 and title = btrim(title)),
  url text not null default '' check (url = '' or (url ~ '^https://' and char_length(url) <= 500)),
  area_m2 numeric(8, 2) check (area_m2 > 0),
  floor_label text not null default '' check (char_length(floor_label) <= 20),
  deposit bigint check (deposit between 0 and 9999999999),
  rent bigint check (rent between 0 and 9999999999),
  premium bigint check (premium between 0 and 9999999999),
  mgmt bigint check (mgmt between 0 and 9999999999),
  broker_id uuid,
  broker_note text not null default '' check (char_length(broker_note) <= 40),
  memo text not null default '' check (char_length(memo) <= 500),
  lat double precision check (lat between 33 and 39),
  lng double precision check (lng between 124 and 132),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  foreign key (hospital_id, candidate_id) references public.location_candidates (hospital_id, id) on delete set null (candidate_id),
  foreign key (hospital_id, broker_id) references public.contacts_companies (hospital_id, id) on delete set null (broker_id)
);
create index if not exists location_listings_candidate on public.location_listings (candidate_id);
create index if not exists location_listings_broker on public.location_listings (broker_id);

-- (4) 날짜별 메모(1~500자, 빈칸·줄바꿈만은 안 됨)
create table if not exists public.location_notes (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  candidate_id uuid not null,
  day date not null,
  body text not null check (char_length(body) between 1 and 500 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default now(),
  foreign key (hospital_id, candidate_id) references public.location_candidates (hospital_id, id) on delete cascade
);
create index if not exists location_notes_candidate on public.location_notes (candidate_id);

-- (5) 현장 사진 줄: 파일 자리 '<병원 id>/<후보 id>/<uuid>.jpg'(그 줄의 병원·후보와 같아야 함)·이름·찍은 날(처음 값 한국 오늘)
create table if not exists public.location_photos (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  candidate_id uuid not null,
  path text not null unique
    check (path ~ ('^' || hospital_id::text || '/' || candidate_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')),
  label text not null default '' check (char_length(label) <= 40),
  taken_on date not null default ((now() at time zone 'Asia/Seoul')::date),
  created_at timestamptz not null default now(),
  foreign key (hospital_id, candidate_id) references public.location_candidates (hospital_id, id) on delete cascade
);
create index if not exists location_photos_candidate on public.location_photos (candidate_id);

-- (6) 새 경쟁 의원 알림 줄(행정안전부 인허가 공공 자료): 개업·폐업·의원 이름·과목·날·후보에서 거리(m)·본 시각. 같은 줄은 한 번만
create table if not exists public.location_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  candidate_id uuid not null,
  kind text not null check (kind in ('open', 'close')),
  clinic_name text not null check (char_length(clinic_name) between 1 and 100),
  dept text not null default '' check (char_length(dept) <= 50),
  event_on date not null,
  dist_m integer not null check (dist_m between 0 and 3000),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_id, kind, clinic_name, event_on),
  foreign key (hospital_id, candidate_id) references public.location_candidates (hospital_id, id) on delete cascade
);

-- 고칠 때마다 updated_at = 지금(설정·후보·매물). 트리거만 부른다
create or replace function public.location_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 사진 줄 30개 한도: 그 후보의 줄이 이미 30개면 넣지 않는다. 넣는 사람 권한 그대로(RLS 적용) 세는데,
-- 후보는 바깥 키로 내 병원 것이므로 그 후보 줄은 모두 보인다
create or replace function public.location_photo_limit() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if (select count(*) from public.location_photos p where p.candidate_id = new.candidate_id) >= 30 then
    raise exception 'location photos limit 30' using errcode = '23514';
  end if;
  return new;
end
$$;

-- 트리거만 부른다. 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거둔다
revoke all on function public.location_touch() from public, anon, authenticated;
revoke all on function public.location_photo_limit() from public, anon, authenticated;

create or replace trigger location_settings_touch before update on public.location_settings
  for each row execute function public.location_touch();
create or replace trigger location_candidates_touch before update on public.location_candidates
  for each row execute function public.location_touch();
create or replace trigger location_listings_touch before update on public.location_listings
  for each row execute function public.location_touch();
create or replace trigger location_photo_limit before insert on public.location_photos
  for each row execute function public.location_photo_limit();

alter table public.location_settings enable row level security;
alter table public.location_candidates enable row level security;
alter table public.location_listings enable row level security;
alter table public.location_notes enable row level security;
alter table public.location_photos enable row level security;
alter table public.location_events enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고(칸 권한도 함께 거둬진다) 필요한 것만 준다
revoke all on table public.location_settings from public, anon, authenticated;
revoke all on table public.location_candidates from public, anon, authenticated;
revoke all on table public.location_listings from public, anon, authenticated;
revoke all on table public.location_notes from public, anon, authenticated;
revoke all on table public.location_photos from public, anon, authenticated;
revoke all on table public.location_events from public, anon, authenticated;

-- 설정: 읽기 + 값 칸 넣기·고치기(병원마다 한 줄 upsert, on conflict (hospital_id)). 지우기 없음([기본값으로]는 처음 값을 저장한다)
grant select on table public.location_settings to authenticated;
grant insert (score_rule, home_eswt, dept_rule), update (score_rule, home_eswt, dept_rule) on table public.location_settings to authenticated;

grant select, delete on table public.location_candidates to authenticated;
grant insert (name, address_note, lat, lng, radius_m, status, floor_label, area_m2, sign_visible, violation, costs, terms, checks, open_on,
              tasks_done, snapshot, snapshot_at, watch_checked_on),
  update (name, address_note, lat, lng, radius_m, status, floor_label, area_m2, sign_visible, violation, costs, terms, checks, open_on,
          tasks_done, snapshot, snapshot_at, watch_checked_on)
  on table public.location_candidates to authenticated;

grant select, delete on table public.location_listings to authenticated;
grant insert (candidate_id, title, url, area_m2, floor_label, deposit, rent, premium, mgmt, broker_id, broker_note, memo, lat, lng),
  update (candidate_id, title, url, area_m2, floor_label, deposit, rent, premium, mgmt, broker_id, broker_note, memo, lat, lng)
  on table public.location_listings to authenticated;

-- 메모·사진 줄: 넣기·읽기·지우기(고치기 없음)
grant select, delete on table public.location_notes to authenticated;
grant insert (candidate_id, day, body) on table public.location_notes to authenticated;

grant select, delete on table public.location_photos to authenticated;
grant insert (candidate_id, path, label, taken_on) on table public.location_photos to authenticated;

-- 알림 줄: 넣기(같은 줄은 on conflict do nothing으로 건너뜀 — 넣기 권한만 쓴다)·읽기·본 시각 고치기·지우기
grant select, delete on table public.location_events to authenticated;
grant insert (candidate_id, kind, clinic_name, dept, event_on, dist_m), update (seen_at) on table public.location_events to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장 전용 my_hospital_id()와 admins의 내 줄을 함께 본다
-- (데스크·승인 안 된 병원은 my_hospital_id()가 null이라 아무 줄도 맞지 않는다. admins는 자기 줄만 읽혀 내 줄이 있는지만 본다)
drop policy if exists "내 병원 입지 설정(관리자)" on public.location_settings;
create policy "내 병원 입지 설정(관리자)" on public.location_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "내 병원 입지 후보(관리자)" on public.location_candidates;
create policy "내 병원 입지 후보(관리자)" on public.location_candidates
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "내 병원 입지 매물(관리자)" on public.location_listings;
create policy "내 병원 입지 매물(관리자)" on public.location_listings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "내 병원 입지 메모(관리자)" on public.location_notes;
create policy "내 병원 입지 메모(관리자)" on public.location_notes
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "내 병원 입지 사진 줄(관리자)" on public.location_photos;
create policy "내 병원 입지 사진 줄(관리자)" on public.location_photos
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "내 병원 입지 알림(관리자)" on public.location_events;
create policy "내 병원 입지 알림(관리자)" on public.location_events
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
  with check (hospital_id = (select public.my_hospital_id()) and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- 현장 사진 바구니: 공개 아님, 한 파일 3,000,000바이트, JPEG만(앱이 브라우저에서 줄여 JPEG로 올린다). 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('location-photos', 'location-photos', false, 3000000, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 3000000, allowed_mime_types = array['image/jpeg'];

-- 파일 이름의 첫 폴더가 내 병원 id이고 관리자인 것만 읽고 올리고 지운다. 고치기(덮어쓰기) 규칙은 두지 않는다
drop policy if exists "내 병원 입지 사진 읽기(관리자)" on storage.objects;
create policy "내 병원 입지 사진 읽기(관리자)" on storage.objects
  for select to authenticated
  using (bucket_id = 'location-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
         and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists "내 병원 입지 사진 올리기(관리자)" on storage.objects;
create policy "내 병원 입지 사진 올리기(관리자)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'location-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
              and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists "내 병원 입지 사진 지우기(관리자)" on storage.objects;
create policy "내 병원 입지 사진 지우기(관리자)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'location-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
         and exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
