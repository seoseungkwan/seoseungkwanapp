-- 관리자 여럿 · 주 관리자 · 관리자만 보는 탭: 관리자가 가입 승인 화면에서 승인된 원장 계정을 관리자로 정하고 빼는 함수 둘
-- (set_admin·admin_hospitals), 주 관리자 표시 admins.is_owner, 관리자만 보는 탭 표 tab_access와 고치는 함수 set_tab_access
-- (spec multi-admin REQ-7701·REQ-7705, ADR-041·ADR-042)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 supabase/first-admin.sql이 들어가 있어야 한다(운영자가 admins에 있어야 함).
-- 두 번 붙여 넣어도 그대로다(주 관리자는 없을 때만 정하고, 칸·표·색인은 없을 때만 만들고, 탭 줄은 없을 때만 넣고,
-- 함수는 바꿔 쓰고 권한은 거두고 다시 준다. 주 관리자가 바꾼 탭 값과 관리자 줄은 그대로).
-- 멈춤: 주 관리자가 아직 없고 후보(구글로 들어왔고 메일 앞부분에 e2e-가 없고 admins에 있는 계정)가 정확히 하나가 아니면
-- 아무것도 바꾸지 않고 알기 쉬운 오류로 멈춘다(맨 앞 검사). 그 글을 Claude에게 알린다.
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 가입 승인 화면이 관리자 목록을 못 읽고,
-- 관리자가 아닌 계정(다른 병원 원장·데스크)은 탭 목록을 못 읽어 앱 오류 화면이다).
--
-- 무엇을 왜: 지금까지 admins는 운영자 한 줄이고 SQL 편집기로만 넣었다. 이제 관리자 누구나 가입 승인 화면 '승인' 탭에서
-- 승인된 병원의 주인 계정을 관리자로 정하거나 뺀다(권한은 지금 관리자와 똑같다 — admins를 보는 곳이 저절로 따라온다).
-- 운영자 계정은 주 관리자(is_owner)라 아무도 빼지 못하고, 주 관리자만 설정에서 '관리자만 보는 탭'을 고른다.
-- 줄 없는 탭 = 관리자만(새 탭은 처음엔 관리자만). 지금 탭 12개는 모두 '모두에게'로 넣어 둔다(지금 보이는 그대로).
-- 관리자만 탭은 관리자가 아닌 계정의 메뉴·주소만 막는다 — 그 탭 자료의 RLS는 바꾸지 않는다(ADR-042).
-- first-admin.sql과 20261028000000_auth.sql 머리 주석(운영자 1줄·SQL 편집기로만)은 옛 판 그대로 두고, 바뀐 점은 여기 적는다.
-- 환자 자료는 들어가지 않는다.
--
-- 권한: admins 표 쓰기 권한은 여전히 아무에게도 없다(내 줄 읽기만, 정책 '내 관리자 줄 읽기' 그대로). 쓰기는 정의자 함수
-- set_admin 하나로만 — 관리자만, 승인된 남의 병원 주인만, 자기 자신·주 관리자 줄은 못 바꾼다. 누가 관리자인지는
-- 정의자 함수 admin_hospitals()가 관리자에게만 준다(admins 정책 안에서 admins를 다시 읽으면 무한 되부름 42P17이라
-- admins에 정책을 더하지 않는다). tab_access는 hospital_id 없는 공용 표(ADR-037 같은 예외)로 로그인한 사람 모두 읽고,
-- 쓰기는 정의자 함수 set_tab_access(주 관리자만)로만. 세 함수 모두 실행은 로그인한 사용자(authenticated)만.
-- hospitals 표·칸·정책·권한과 admins 정책·표 권한은 바꾸지 않는다

-- ① 검사만(바꾸기 전에 멈춘다): 주 관리자가 아직 없으면 후보가 정확히 하나여야 한다. 이미 있으면 건너뛴다(두 번째 실행)
do $$
declare
  v_has_owner boolean := false;
  v_count integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'admins' and column_name = 'is_owner') then
    execute 'select exists (select 1 from public.admins where is_owner)' into v_has_owner;
  end if;
  if v_has_owner then
    return;
  end if;
  select count(*) into v_count
    from auth.users u
    join public.admins a on a.user_id = u.id
   where u.raw_app_meta_data -> 'providers' ? 'google'
     and split_part(lower(u.email), '@', 1) not like '%e2e-%';
  if v_count = 0 then
    raise exception '주 관리자로 정할 계정(구글로 들어온 관리자, 시험 계정 빼고)이 0개예요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
  elsif v_count > 1 then
    raise exception '주 관리자로 정할 계정(구글로 들어온 관리자, 시험 계정 빼고)이 2개 이상이에요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
  end if;
end;
$$;

-- ② 주 관리자 표시 칸. 참인 줄은 하나만(부분 유일 색인). 쓰기 권한은 여전히 아무에게도 없다(내 줄 읽기만)
alter table public.admins add column if not exists is_owner boolean not null default false;
create unique index if not exists admins_one_owner on public.admins (is_owner) where is_owner;

-- ③ 관리자만 보는 탭(공용 표, hospital_id 없음 — ADR-042). 줄 없는 탭 = 관리자만
create table if not exists public.tab_access (
  path text primary key
    check (path ~ '^/[a-z][a-z0-9-]*$' and path not in ('/dashboard', '/settings', '/admin')),
  admin_only boolean not null
);
alter table public.tab_access enable row level security;
revoke all on table public.tab_access from anon, authenticated;
grant select on table public.tab_access to authenticated;
drop policy if exists "로그인한 사람 모두 탭 목록 읽기" on public.tab_access;
create policy "로그인한 사람 모두 탭 목록 읽기" on public.tab_access
  for select to authenticated
  using (true);
-- 지금 탭 12개는 모두 '모두에게'(지금 보이는 그대로). 이미 있는 줄(주 관리자가 바꾼 값)은 그대로
insert into public.tab_access (path, admin_only) values
  ('/stats', false), ('/claim', false), ('/notices', false), ('/patients', false),
  ('/worklog', false), ('/sunap', false), ('/calendar', false), ('/ai-report', false),
  ('/forms', false), ('/staff', false), ('/inventory', false), ('/contacts', false)
on conflict (path) do nothing;

-- ④ 관리자 표시: 주인이 관리자인 승인된 병원 · 부른 사람 자신의 병원인지 · 주 관리자 병원인지. 관리자만
create or replace function public.admin_hospitals()
returns table (hospital_id uuid, is_me boolean, is_owner boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select h.id, h.owner_id = (select auth.uid()), a.is_owner
      from public.hospitals h
      join public.admins a on a.user_id = h.owner_id
     where h.status = 'approved';
end;
$$;

-- ⑤ 관리자 정하기(p_admin true)·빼기(false). 관리자만, 승인된 남의 병원 주인만, 주 관리자 줄은 못 바꾼다
create or replace function public.set_admin(p_hospital_id uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- 부른 사람의 관리자 줄을 잠그며 본다: 두 관리자가 서로를 같은 때 빼도 한쪽만 된다(0명이 되지 않게)
  perform 1 from public.admins a where a.user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select h.owner_id into v_owner from public.hospitals h where h.id = p_hospital_id and h.status = 'approved';
  if v_owner is null or p_admin is null or v_owner = (select auth.uid())
     or exists (select 1 from public.admins o where o.user_id = v_owner and o.is_owner) then
    raise exception 'admin change not allowed' using errcode = '22023';
  end if;

  if p_admin then
    insert into public.admins (user_id) values (v_owner) on conflict (user_id) do nothing;
  else
    delete from public.admins a where a.user_id = v_owner;
  end if;
end;
$$;

-- ⑥ 관리자만 보는 탭 저장(주 관리자만). 보낸 경로만 넣거나 고친다(p_admin_only 참, p_everyone 거짓). 지우지 않는다
create or replace function public.set_tab_access(p_admin_only text[], p_everyone text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_all text[];
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.is_owner) then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  if p_admin_only is null or p_everyone is null then
    raise exception 'tab access not allowed' using errcode = '22023';
  end if;
  v_all := p_admin_only || p_everyone;
  if exists (select 1 from unnest(v_all) p
              where p is null or p !~ '^/[a-z][a-z0-9-]*$' or p in ('/dashboard', '/settings', '/admin'))
     or (select count(*) from unnest(v_all)) <> (select count(distinct p) from unnest(v_all) p) then
    raise exception 'tab access not allowed' using errcode = '22023';
  end if;
  insert into public.tab_access (path, admin_only)
    select p, true from unnest(p_admin_only) p
    union all
    select p, false from unnest(p_everyone) p
  on conflict (path) do update set admin_only = excluded.admin_only;
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 연다. 거두고 authenticated에만 준다
revoke all on function public.admin_hospitals() from public, anon, authenticated;
grant execute on function public.admin_hospitals() to authenticated;
revoke all on function public.set_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
revoke all on function public.set_tab_access(text[], text[]) from public, anon, authenticated;
grant execute on function public.set_tab_access(text[], text[]) to authenticated;

-- ⑦ 주 관리자 정하기(①이 후보 하나를 이미 확인했다. 이미 있으면 바꾸지 않는다)
update public.admins a
   set is_owner = true
 where not exists (select 1 from public.admins o where o.is_owner)
   and a.user_id = (
     select u.id
       from auth.users u
       join public.admins b on b.user_id = u.id
      where u.raw_app_meta_data -> 'providers' ? 'google'
        and split_part(lower(u.email), '@', 1) not like '%e2e-%'
   );
