-- 주소록 서버 표: 업체(contacts_companies)·담당자(contacts_people)·장비(contacts_equipment)·수리 기록(contacts_repairs)과
-- 엑셀 넣기 함수(contacts_import) (spec contacts REQ-6501, ADR-035)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261030000000_precheck_settings.sql(또는 my_hospital_id()를 만드는 다른 앞 migration)이
-- 들어가 있어야 한다(hospitals 표, my_hospital_id() 함수). my_hospital_id()는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다.
-- 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(표가 없으면 주소록 탭은 읽기 실패 글을 보이고 대시보드 무상 수리 알림은 비어 있다).
--
-- 무엇을 왜: 거래처·수리 업체·기관의 연락처·담당자, 들여온 장비와 무상 수리 끝나는 날, 수리 기록을 한곳에 둔다. 환자 정보는 없다.
-- 사이트 비밀번호(site_pw)·계좌(account)는 잠그지 않고 다른 칸처럼 글자로 둔다(ADR-035, 사용자 결정). 앱이 따로 암호화하지 않는다.
-- 바깥 키는 (hospital_id, 부모 id) 둘로 건다. 바깥 키 검사는 RLS를 보지 않아서 id 하나로만 걸면 남의 병원 업체 id를 알 때
-- 그 밑에 줄을 달 수 있다. 둘로 걸면 내 hospital_id(기본값)와 다른 병원의 부모는 거부된다.
-- 같은 병원 안 업체 이름과 같은 업체 안 담당자 이름은 하나뿐이다(엑셀 다시 올리기가 이름으로 찾는다). 장비에는 겹침 제약이 없다.
-- 업체를 지우면 그 담당자·장비·수리 기록이, 장비를 지우면 그 수리 기록이 함께 지워진다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 원장(authenticated, my_hospital_id())만 자기 병원 줄을 읽고
-- 넣고 고치고 지운다. id·hospital_id·created_at은 칸 권한이 없어 DB(기본값)만 정한다. 담당자·장비의 업체와 수리 기록의 장비는
-- 넣을 때만 정한다. 데스크 계정(ADR-031)·승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
-- 데스크 정책은 더하지 않는다. 넣기 함수는 부른 사람 권한이라 RLS·칸 권한·기본값이 그대로 지켜지고, 한 번 부르기가 한 트랜잭션이다

-- 업체 한 곳. 분류 넷 = 거래처(supplier)·수리·관리(repair)·기관·보험(agency)·기타(other). 이름은 앞뒤 빈칸 없이 병원 안에서 하나
create table if not exists public.contacts_companies (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  category text not null check (category in ('supplier', 'repair', 'agency', 'other')),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  phone text not null default '' check (char_length(phone) <= 30),
  work text not null default '' check (char_length(work) <= 100), -- 하는 일·품목
  address text not null default '' check (char_length(address) <= 200),
  homepage text not null default '' check (char_length(homepage) <= 200),
  biz_no text not null default '' check (char_length(biz_no) <= 20),
  account text not null default '' check (char_length(account) <= 100),
  site_id text not null default '' check (char_length(site_id) <= 100),
  site_pw text not null default '' check (char_length(site_pw) <= 100),
  memo text not null default '' check (char_length(memo) <= 1000),
  created_at timestamptz not null default now(),
  unique (hospital_id, name),
  unique (hospital_id, id) -- 아래 표들의 바깥 키 자리
);

-- 담당자 한 명. 같은 업체 안에서 이름은 하나
create table if not exists public.contacts_people (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  company_id uuid not null,
  name text not null check (char_length(name) between 1 and 20 and name = btrim(name)),
  mobile text not null default '' check (char_length(mobile) <= 30),
  role text not null default '' check (char_length(role) <= 40), -- 맡은 일
  created_at timestamptz not null default now(),
  foreign key (hospital_id, company_id) references public.contacts_companies (hospital_id, id) on delete cascade,
  unique (company_id, name)
);

-- 장비 한 대. 이름·일련번호 겹침 제약 없음(엑셀이 고칠 장비를 하나로 못 고르면 앱이 넣지 않는 줄로 뺀다)
create table if not exists public.contacts_equipment (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  company_id uuid not null,
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  serial text not null default '' check (char_length(serial) <= 60 and serial = btrim(serial)),
  bought_on date,
  warranty_until date, -- 무상 수리 끝나는 날(들여온 날보다 앞서도 받는다)
  created_at timestamptz not null default now(),
  foreign key (hospital_id, company_id) references public.contacts_companies (hospital_id, id) on delete cascade,
  unique (hospital_id, id) -- 수리 기록의 바깥 키 자리
);
create index if not exists contacts_equipment_company on public.contacts_equipment (company_id);
-- 대시보드 무상 수리 알림(오늘 ~ 오늘+30일)
create index if not exists contacts_equipment_warranty on public.contacts_equipment (hospital_id, warranty_until);

-- 수리 기록 한 줄. 비용은 원 정수(비움 = 모름)
create table if not exists public.contacts_repairs (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  equipment_id uuid not null,
  day date not null,
  content text not null check (char_length(content) between 1 and 200 and content = btrim(content)),
  cost bigint check (cost between 0 and 9999999999),
  created_at timestamptz not null default now(),
  foreign key (hospital_id, equipment_id) references public.contacts_equipment (hospital_id, id) on delete cascade
);
create index if not exists contacts_repairs_equipment on public.contacts_repairs (equipment_id);

-- 엑셀 넣기: 몸통 { companies: [...], people: [...], equipment: [...] }(키 = DB 칸 이름, 없는 키는 빈 배열).
-- 선택 칸은 키가 없으면 그대로다('' 값은 빈 글자로 고친다). 엑셀로는 아무것도 지우지 않는다.
-- 차례: 업체(이름으로 찾아 있으면 몸통 칸만 고치고 없으면 넣는다) → 담당자((업체 이름, 이름)으로 같은 규칙) →
-- 장비(id가 있으면 그 업체의 그 장비 몸통 칸만 고치고, 없으면 넣는다). 어느 줄이든 틀리면 raise로 끝나 아무것도 바뀌지 않는다.
-- on conflict를 쓰지 않는다(이미 있는 업체를 분류 없이 고칠 때 not null 검사가 먼저 걸리므로). 오류 글에 몸통 값을 담지 않는다
create or replace function public.contacts_import(p jsonb) returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_companies jsonb;
  v_people jsonb;
  v_equipment jsonb;
  r jsonb;
  v_company uuid;
begin
  -- 승인된 병원 원장만(데스크·승인 대기·거절·병원 없음은 null이라 빈 몸통이어도 거부)
  if v_hospital is null then
    raise exception 'contacts_import: no hospital' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'contacts_import: bad body' using errcode = '22023';
  end if;
  v_companies := coalesce(p -> 'companies', '[]'::jsonb);
  v_people := coalesce(p -> 'people', '[]'::jsonb);
  v_equipment := coalesce(p -> 'equipment', '[]'::jsonb);
  if jsonb_typeof(v_companies) <> 'array' or jsonb_typeof(v_people) <> 'array' or jsonb_typeof(v_equipment) <> 'array' then
    raise exception 'contacts_import: bad body' using errcode = '22023';
  end if;
  if jsonb_array_length(v_companies) > 2000 or jsonb_array_length(v_people) > 2000 or jsonb_array_length(v_equipment) > 1000 then
    raise exception 'contacts_import: too many rows' using errcode = '22023';
  end if;

  -- (1) 업체
  for r in select value from jsonb_array_elements(v_companies) loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'name') is distinct from 'string' then
      raise exception 'contacts_import: bad company' using errcode = '22023';
    end if;
    update public.contacts_companies t set
      category = case when r ? 'category' then r ->> 'category' else t.category end,
      phone = case when r ? 'phone' then r ->> 'phone' else t.phone end,
      work = case when r ? 'work' then r ->> 'work' else t.work end,
      address = case when r ? 'address' then r ->> 'address' else t.address end,
      homepage = case when r ? 'homepage' then r ->> 'homepage' else t.homepage end,
      biz_no = case when r ? 'biz_no' then r ->> 'biz_no' else t.biz_no end,
      account = case when r ? 'account' then r ->> 'account' else t.account end,
      site_id = case when r ? 'site_id' then r ->> 'site_id' else t.site_id end,
      site_pw = case when r ? 'site_pw' then r ->> 'site_pw' else t.site_pw end,
      memo = case when r ? 'memo' then r ->> 'memo' else t.memo end
    where t.hospital_id = v_hospital and t.name = r ->> 'name';
    if not found then
      -- 분류가 없으면 not null로 실패한다
      insert into public.contacts_companies (category, name, phone, work, address, homepage, biz_no, account, site_id, site_pw, memo)
      values (r ->> 'category', r ->> 'name', coalesce(r ->> 'phone', ''), coalesce(r ->> 'work', ''), coalesce(r ->> 'address', ''),
              coalesce(r ->> 'homepage', ''), coalesce(r ->> 'biz_no', ''), coalesce(r ->> 'account', ''), coalesce(r ->> 'site_id', ''),
              coalesce(r ->> 'site_pw', ''), coalesce(r ->> 'memo', ''));
    end if;
  end loop;

  -- (2) 담당자
  for r in select value from jsonb_array_elements(v_people) loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'company') is distinct from 'string'
       or jsonb_typeof(r -> 'name') is distinct from 'string' then
      raise exception 'contacts_import: bad person' using errcode = '22023';
    end if;
    select t.id into v_company from public.contacts_companies t where t.hospital_id = v_hospital and t.name = r ->> 'company';
    if not found then
      raise exception 'contacts_import: unknown company' using errcode = 'P0002';
    end if;
    update public.contacts_people t set
      mobile = case when r ? 'mobile' then r ->> 'mobile' else t.mobile end,
      role = case when r ? 'role' then r ->> 'role' else t.role end
    where t.company_id = v_company and t.name = r ->> 'name';
    if not found then
      insert into public.contacts_people (company_id, name, mobile, role)
      values (v_company, r ->> 'name', coalesce(r ->> 'mobile', ''), coalesce(r ->> 'role', ''));
    end if;
  end loop;

  -- (3) 장비: 이름으로 찾지 않고 브라우저 계획이 고른 id로 고친다
  for r in select value from jsonb_array_elements(v_equipment) loop
    if jsonb_typeof(r) <> 'object' or jsonb_typeof(r -> 'company') is distinct from 'string'
       or jsonb_typeof(r -> 'name') is distinct from 'string'
       or (r ? 'id' and (jsonb_typeof(r -> 'id') <> 'string'
                         or (r ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
      raise exception 'contacts_import: bad equipment' using errcode = '22023';
    end if;
    select t.id into v_company from public.contacts_companies t where t.hospital_id = v_hospital and t.name = r ->> 'company';
    if not found then
      raise exception 'contacts_import: unknown company' using errcode = 'P0002';
    end if;
    if r ? 'id' then
      update public.contacts_equipment t set
        serial = case when r ? 'serial' then r ->> 'serial' else t.serial end,
        bought_on = case when r ? 'bought_on' then (r ->> 'bought_on')::date else t.bought_on end,
        warranty_until = case when r ? 'warranty_until' then (r ->> 'warranty_until')::date else t.warranty_until end
      where t.id = (r ->> 'id')::uuid and t.company_id = v_company;
      if not found then -- 없는 장비·남의 병원 장비(RLS로 안 보임)·다른 업체 장비
        raise exception 'contacts_import: unknown equipment' using errcode = 'P0002';
      end if;
    else
      insert into public.contacts_equipment (company_id, name, serial, bought_on, warranty_until)
      values (v_company, r ->> 'name', coalesce(r ->> 'serial', ''), (r ->> 'bought_on')::date, (r ->> 'warranty_until')::date);
    end if;
  end loop;
end $$;
revoke all on function public.contacts_import(jsonb) from public, anon;
grant execute on function public.contacts_import(jsonb) to authenticated;

alter table public.contacts_companies enable row level security;
alter table public.contacts_people enable row level security;
alter table public.contacts_equipment enable row level security;
alter table public.contacts_repairs enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.contacts_companies from anon, authenticated;
revoke all on table public.contacts_people from anon, authenticated;
revoke all on table public.contacts_equipment from anon, authenticated;
revoke all on table public.contacts_repairs from anon, authenticated;

grant select, delete on table public.contacts_companies to authenticated;
grant insert (category, name, phone, work, address, homepage, biz_no, account, site_id, site_pw, memo),
  update (category, name, phone, work, address, homepage, biz_no, account, site_id, site_pw, memo)
  on table public.contacts_companies to authenticated;

grant select, delete on table public.contacts_people to authenticated;
grant insert (company_id, name, mobile, role), update (name, mobile, role) on table public.contacts_people to authenticated;

grant select, delete on table public.contacts_equipment to authenticated;
grant insert (company_id, name, serial, bought_on, warranty_until), update (name, serial, bought_on, warranty_until)
  on table public.contacts_equipment to authenticated;

grant select, delete on table public.contacts_repairs to authenticated;
grant insert (equipment_id, day, content, cost), update (day, content, cost) on table public.contacts_repairs to authenticated;

-- (select …): 문장마다 한 번 계산한다. 원장 전용 my_hospital_id()만 본다(데스크·승인 안 된 병원은 null이라 아무 줄도 맞지 않는다)
drop policy if exists "내 병원 주소록 업체" on public.contacts_companies;
create policy "내 병원 주소록 업체" on public.contacts_companies
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 주소록 담당자" on public.contacts_people;
create policy "내 병원 주소록 담당자" on public.contacts_people
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 주소록 장비" on public.contacts_equipment;
create policy "내 병원 주소록 장비" on public.contacts_equipment
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 주소록 수리 기록" on public.contacts_repairs;
create policy "내 병원 주소록 수리 기록" on public.contacts_repairs
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
