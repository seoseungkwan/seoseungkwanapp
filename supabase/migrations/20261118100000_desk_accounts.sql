-- 데스크 계정: 병원마다 '데스크' 역할 메일(hospital_members)·정의자 함수 여섯·데스크 정책·넣는 기본값·예약 트리거 둘·가입 막기
-- (spec desk-feedback REQ-6303, ADR-031)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql·20261030000000_precheck_settings.sql(my_hospital_id())·업무일지 넷(20261101000100_worklog.sql·
-- 20261101000110_worklog_bit_fields.sql·20261105000200_worklog_memo_font.sql·20261105000300_worklog_cash_float.sql)·
-- 20261105000100_stats_rx_groups.sql·20261112000000_stats_rx_groups_exclude.sql·20261116000000_sunap.sql·20261117010000_calendar.sql이
-- 들어가 있어야 한다. my_hospital_id()는 여기서 다시 만들지 않는다(글자·권한 그대로).
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다. 이미 있던 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 병원 줄 없는 사용자의 문지기가 my_desk()를 못 불러 오류 화면이 된다).
-- 주의: 20261117010000_calendar.sql을 나중에 다시 붙여 넣으면 예약 트리거 둘이 옛 글로 돌아가니 그때는 이 파일도 다시 붙여 넣는다.
--
-- 무엇을 왜(ADR-031): 데스크 PC는 업무일지·수납일지·예약만 쓴다. 원장(병원 계정)이 설정에서 데스크 구글 메일을 5개까지 더하고,
-- 그 메일로 로그인한 사람은 가입 승인 없이 그 병원의 데스크다(로그인 메일 = JWT의 email로 맞춘다. 사용자 id는 적지 않는다).
-- my_hospital_id()(원장 전용)는 그대로 두고, 데스크에게 열 표에만 '데스크 …' 정책을 더한다. 그래서 다른 표(통계·매출·청구·AI·서식 등)는
-- 데스크에게 닫혀 있다. 세 탭에 새 표가 생기면 그 표에도 데스크 정책을 따로 더해야 한다.
-- 메일로 맞추므로 Supabase 인증 설정의 메일 확인(Confirm email)을 끄지 않는다(끄면 남이 그 메일로 가입해 데스크가 될 수 있다).
--
-- 권한: hospital_members는 anon·authenticated 표 권한이 하나도 없다(정책도 없음). 더하기·읽기·빼기는 정의자 함수로만 하고,
-- 원장(승인된 병원)만 자기 병원 줄을 다룬다. 이미 병원 가입 신청(승인·대기·거절)이 있는 메일은 데스크가 될 수 없고,
-- 데스크 메일은 병원 가입 신청을 못 한다(restrictive 정책). 줄을 빼면 그 데스크는 바로 다음 문장부터 아무 줄도 못 본다

-- 병원의 데스크 메일 한 줄. 메일은 소문자·앞뒤 빈칸 없는 메일 모양이고 표 전체에서 하나뿐이다(한 메일 = 한 병원의 데스크)
create table if not exists public.hospital_members (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  email text not null unique check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  role text not null default 'desk' check (role = 'desk'),
  created_at timestamptz not null default now()
);
create index if not exists hospital_members_hospital on public.hospital_members (hospital_id);

alter table public.hospital_members enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 다 거두고 아무것도 주지 않는다(함수로만)
revoke all on table public.hospital_members from anon, authenticated;

-- 데스크인 사용자의 병원 id. 로그인 메일이 승인된 병원의 데스크 줄과 같고 자기 병원 줄(어느 상태든)이 없을 때만, 아니면 null
create or replace function public.my_desk_hospital_id() returns uuid language sql stable security definer set search_path = ''
as $$
  select m.hospital_id
    from public.hospital_members m
    join public.hospitals h on h.id = m.hospital_id and h.status = 'approved'
   where m.email = lower((select auth.jwt()) ->> 'email')
     and not exists (select 1 from public.hospitals o where o.owner_id = (select auth.uid()))
$$;

-- 이 사용자가 쓰는 병원 id: 원장이면 내 병원, 아니면 데스크 병원(둘 다 아니면 null). 넣는 기본값과 예약 트리거가 쓴다
create or replace function public.my_clinic_hospital_id() returns uuid language sql stable security definer set search_path = ''
as $$
  select coalesce(public.my_hospital_id(), public.my_desk_hospital_id())
$$;

-- 문지기가 읽는 내 데스크 줄: 데스크면 그 병원 id·이름 한 줄, 아니면 빈 목록
create or replace function public.my_desk() returns table (hospital_id uuid, hospital_name text) language sql stable security definer set search_path = ''
as $$
  select h.id, h.name from public.hospitals h where h.id = public.my_desk_hospital_id()
$$;

-- 원장이 데스크 메일을 더한다. 답: bad(메일 모양 아님) → taken(어느 병원이든 가입 신청 메일) → used(이미 데스크 메일) → limit(5개) → added
create or replace function public.add_desk_member(p_email text) returns text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_hospital_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_hospital is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  if not (char_length(v_email) between 3 and 254 and v_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    return 'bad';
  end if;
  -- 같은 병원이 동시에 더하면 줄을 세운다(5개 세기가 어긋나지 않게)
  perform 1 from public.hospitals h where h.id = v_hospital for update;
  if exists (select 1 from public.hospitals h where lower(h.email) = v_email) then
    return 'taken';
  end if;
  if exists (select 1 from public.hospital_members m where m.email = v_email) then
    return 'used';
  end if;
  if (select count(*) from public.hospital_members m where m.hospital_id = v_hospital) >= 5 then
    return 'limit';
  end if;
  -- 다른 병원이 같은 메일을 동시에 더하면 한쪽만 들어간다(늦은 쪽은 used)
  insert into public.hospital_members (hospital_id, email) values (v_hospital, v_email) on conflict (email) do nothing;
  if not found then
    return 'used';
  end if;
  return 'added';
end
$$;

-- 원장이 보는 내 병원 데스크 목록(더한 차례). signed_in_at = 그 메일 계정의 마지막 로그인이 더한 시각보다 뒤일 때만. 원장이 아니면 빈 목록
create or replace function public.desk_members() returns table (id uuid, email text, created_at timestamptz, signed_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.email, m.created_at,
         (select max(u.last_sign_in_at) from auth.users u where lower(u.email) = m.email and u.last_sign_in_at > m.created_at)
    from public.hospital_members m
   where m.hospital_id = public.my_hospital_id()
   order by m.created_at, m.id
$$;

-- 원장이 내 병원 데스크 줄 하나를 뺀다. 남의 병원 id거나 원장이 아니면 아무것도 하지 않는다
create or replace function public.remove_desk_member(p_id uuid) returns void language sql volatile security definer set search_path = ''
as $$
  delete from public.hospital_members m where m.id = p_id and m.hospital_id = public.my_hospital_id()
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon에도 준다. 다 거두고 authenticated에만 준다
revoke all on function public.my_desk_hospital_id() from public, anon, authenticated;
revoke all on function public.my_clinic_hospital_id() from public, anon, authenticated;
revoke all on function public.my_desk() from public, anon, authenticated;
revoke all on function public.add_desk_member(text) from public, anon, authenticated;
revoke all on function public.desk_members() from public, anon, authenticated;
revoke all on function public.remove_desk_member(uuid) from public, anon, authenticated;
grant execute on function public.my_desk_hospital_id() to authenticated;
grant execute on function public.my_clinic_hospital_id() to authenticated;
grant execute on function public.my_desk() to authenticated;
grant execute on function public.add_desk_member(text) to authenticated;
grant execute on function public.desk_members() to authenticated;
grant execute on function public.remove_desk_member(uuid) to authenticated;

-- 데스크가 넣는 줄도 그 병원 id가 들어가게 넣는 표 일곱의 기본값을 바꾼다(원장에게는 값이 같다)
alter table public.worklog_days alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.sunap_days alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.sunap_spends alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.sunap_settings alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.calendar_settings alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.calendar_appts alter column hospital_id set default public.my_clinic_hospital_id();
alter table public.calendar_allday alter column hospital_id set default public.my_clinic_hospital_id();

-- 예약 트리거 둘: 20261117010000_calendar.sql과 같은 글이고 my_hospital_id() 자리만 my_clinic_hospital_id()다
-- (데스크가 바꿔도 다른 PC가 다시 읽고, 데스크가 예약을 넣어도 1년 지난 줄을 지운다)
create or replace function public.calendar_appts_prune() returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_hospital uuid := public.my_clinic_hospital_id();
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

create or replace function public.calendar_bump() returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_hospital uuid := public.my_clinic_hospital_id();
begin
  if v_hospital is not null then
    insert into public.calendar_rev as r (hospital_id, rev, changed_at) values (v_hospital, 1, now())
      on conflict (hospital_id) do update set rev = r.rev + 1, changed_at = now();
  end if;
  return null;
end
$$;

-- 트리거만 부른다(누구도 바로 부르지 못하게, 예약 SQL과 같게)
revoke all on function public.calendar_appts_prune() from public, anon, authenticated;
revoke all on function public.calendar_bump() from public, anon, authenticated;

-- 데스크 정책: 기존 원장 정책(my_hospital_id())은 그대로 두고 더하기만 한다. 실제로 되는 일은 지금 표·칸 권한대로다.
-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 데스크가 아니면 null이라 아무 줄과도 같지 않다
drop policy if exists "데스크 업무일지 하루" on public.worklog_days;
create policy "데스크 업무일지 하루" on public.worklog_days
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 수납 마감" on public.sunap_days;
create policy "데스크 수납 마감" on public.sunap_days
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 수납 지출" on public.sunap_spends;
create policy "데스크 수납 지출" on public.sunap_spends
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 수납 설정" on public.sunap_settings;
create policy "데스크 수납 설정" on public.sunap_settings
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 예약 설정" on public.calendar_settings;
create policy "데스크 예약 설정" on public.calendar_settings
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 예약" on public.calendar_appts;
create policy "데스크 예약" on public.calendar_appts
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 종일 줄" on public.calendar_allday;
create policy "데스크 종일 줄" on public.calendar_allday
  for all to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()))
  with check (hospital_id = (select public.my_desk_hospital_id()));

-- 읽기만: 시재 설정(설정 탭 몫)·통계 처방 묶음(수납일지가 Block·물리치료 묶음 정의로 읽음)·예약 바뀜 숫자
drop policy if exists "데스크 업무일지 설정 읽기" on public.worklog_settings;
create policy "데스크 업무일지 설정 읽기" on public.worklog_settings
  for select to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 통계 묶음 읽기" on public.stats_rx_groups;
create policy "데스크 통계 묶음 읽기" on public.stats_rx_groups
  for select to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()));
drop policy if exists "데스크 예약 바뀜 숫자 읽기" on public.calendar_rev;
create policy "데스크 예약 바뀜 숫자 읽기" on public.calendar_rev
  for select to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()));

-- 데스크 메일은 병원 가입 신청을 못 한다(기존 가입 정책과 함께 둘 다 맞아야 들어간다)
drop policy if exists "데스크 메일은 병원 가입 못 함" on public.hospitals;
create policy "데스크 메일은 병원 가입 못 함" on public.hospitals
  as restrictive for insert to authenticated
  with check ((select public.my_desk_hospital_id()) is null);
