-- 로그인·가입 승인 DB: 병원(hospitals)·관리자(admins) 표, RLS, 승인 함수
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다)
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 로그인한 사용자(authenticated)는 자기 병원 줄만 보고,
-- 가입 신청은 이름·신청자·연락처만 넣는다(owner_id·email·status는 DB 기본값으로만).
-- hospitals 고치기·지우기 권한은 아무에게도 없다. 상태는 관리자가 set_hospital_status로만 바꾼다.
-- admins 표는 자기 줄만 읽고 아무도 쓰지 못한다(운영자가 SQL 편집기로만 넣는다)

create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50 and name = btrim(name)),
  applicant_name text not null check (char_length(applicant_name) between 1 and 30 and applicant_name = btrim(applicant_name)),
  phone text check (phone ~ '^[0-9]{9,11}$'),
  -- 관리자 화면이 auth.users를 읽을 수 없어 여기 둔다. 로그인 토큰의 이메일이 기본값으로만 들어간다(열 권한 없음)
  email text not null default (auth.jwt() ->> 'email'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  agreed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.hospitals enable row level security;
alter table public.admins enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.hospitals, public.admins from anon, authenticated;
grant select on table public.hospitals to authenticated;
-- 넣기는 칸 단위: 소유자·이메일·상태·날짜는 기본값으로만(남의 계정·승인 상태·신청 날짜를 꾸미지 못하게)
grant insert (name, applicant_name, phone) on table public.hospitals to authenticated;
grant select on table public.admins to authenticated;

-- (select auth.uid()): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장)
create policy "내 병원 또는 관리자는 모든 병원 읽기" on public.hospitals
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

-- 열 권한이 이미 막지만, 권한이 잘못 풀려도 남의 줄·승인 상태로는 못 넣게 한 겹 더
create policy "내 병원 가입 신청(pending만)" on public.hospitals
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'pending');

create policy "내 관리자 줄 읽기" on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 승인·거절·되돌리기. 허용한 바꿈(pending→approved, pending→rejected, rejected→pending)만 된다
create function public.set_hospital_status(p_hospital_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  update public.hospitals h
     set status = p_status, reviewed_at = now()
   where h.id = p_hospital_id
     and (
       (h.status = 'pending' and p_status in ('approved', 'rejected'))
       or (h.status = 'rejected' and p_status = 'pending')
     );

  if not found then
    raise exception 'status change not allowed' using errcode = '22023';
  end if;
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 열어 둔다. 거두고 authenticated에만 준다
revoke all on function public.set_hospital_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_hospital_status(uuid, text) to authenticated;

-- 처음 설정(운영자, SQL 편집기에서 한 번):
--   1) 운영자 계정으로 사이트에 로그인해 가입 신청을 한다
--   2) 그 계정을 관리자로 넣고 자기 병원을 승인한다. <운영자 이메일>을 바꿔 실행한다:
--      insert into public.admins (user_id) select id from auth.users where email = '<운영자 이메일>';
--      update public.hospitals set status = 'approved', reviewed_at = now()
--       where owner_id = (select id from auth.users where email = '<운영자 이메일>');
