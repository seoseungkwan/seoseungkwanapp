-- 통계 숫자 저장 표: 달마다·날마다 합계(stats_months·stats_days)와 불러온 기간(stats_coverage)
--
-- 왜: PC에서 불러온 통계 숫자를 휴대폰·대시보드에서도 같게 보려고 병원 계정에 둔다. 환자 번호·차트번호·이름 칸은 없다.
-- 불러온 기간을 따로 두는 까닭: 저장 모양은 진료가 있는 날만 있어, 줄이 없는 날이 휴진인지 아직 안 불러온 날인지 가르려면 기간이 필요하다
--
-- 실행: 실제 Supabase에는 사용자가 허락한 뒤 SQL 편집기에서 인증 마이그레이션 다음에 붙인다(앱·CLI는 실행하지 않는다. 시험은 PGlite)
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 사용자만 자기 병원 줄을 읽고 넣고 고친다.
-- hospital_id는 DB가 정한다(어느 권한에도 없다). 지우기는 아무에게도 없고, stats_coverage는 넣기만 한다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로. 다른 브랜치가 먼저 만들어도 다시 돌아간다)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- payload 안 모양 검사는 lib/payload/validate.ts 한 곳이다. DB는 열쇠 몇 개와 크기만 본다.
-- check는 NULL을 통과시킨다. 열쇠가 없어 비교가 NULL이 되면 거부하려고 묶음 전체를 is true로 감싼다
create table public.stats_months (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  partial boolean not null,
  source text not null check (source in ('bit', 'file')),
  payload jsonb not null check ((
    jsonb_typeof(payload) = 'object'
    and payload -> 'schemaVersion' = '2'::jsonb
    and payload -> 'month' = to_jsonb(month)
    and payload -> 'partial' = to_jsonb(partial)
    -- 달 줄은 그달 처방 전부와 동네가 들어 날 줄(65536)보다 크게 둔다. 처방 코드가 400개를 넘는 달에 막히지 않게 1MiB
    and octet_length(payload::text) <= 1048576
  ) is true),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, month)
);

create table public.stats_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null,
  partial boolean not null,
  source text not null check (source in ('bit', 'file')),
  payload jsonb not null check ((
    jsonb_typeof(payload) = 'object'
    and payload -> 'schemaVersion' = '2'::jsonb
    and payload -> 'day' = to_jsonb(day::text)
    and payload -> 'partial' = to_jsonb(partial)
    and octet_length(payload::text) <= 65536
  ) is true),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, day)
);

-- 불러온(덮은) 기간 한 줄씩, 넣기만. to_day - from_day < 800은 양 끝을 합쳐 800일까지다
create table public.stats_coverage (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  from_day date not null,
  to_day date not null,
  source text not null check (source in ('bit', 'file')),
  created_at timestamptz not null default now(),
  check (from_day <= to_day and to_day - from_day < 800)
);

alter table public.stats_months enable row level security;
alter table public.stats_days enable row level security;
alter table public.stats_coverage enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_months, public.stats_days, public.stats_coverage from anon, authenticated;
grant select on table public.stats_months, public.stats_days, public.stats_coverage to authenticated;
-- PostgREST upsert는 보낸 칸 모두를 DO UPDATE SET에 넣는다 — 열쇠 칸 month|day도. 그래서 update에도 준다
grant insert (month, partial, source, payload), update (month, partial, source, payload) on table public.stats_months to authenticated;
grant insert (day, partial, source, payload), update (day, partial, source, payload) on table public.stats_days to authenticated;
grant insert (from_day, to_day, source) on table public.stats_coverage to authenticated;

-- 승인되지 않은 병원은 my_hospital_id()가 NULL이라 자기 줄도 안 보이고 넣지도 못한다. delete 정책은 두지 않는다
create policy "내 병원 달 숫자 읽기" on public.stats_months
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 달 숫자 넣기" on public.stats_months
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 달 숫자 고치기" on public.stats_months
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 일 숫자 읽기" on public.stats_days
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 일 숫자 넣기" on public.stats_days
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 일 숫자 고치기" on public.stats_days
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 불러온 기간 읽기" on public.stats_coverage
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 불러온 기간 넣기" on public.stats_coverage
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));

-- 완전한 줄은 덜 덮인 줄로 안 바뀐다: 짧은 파일을 넣어도 이미 완전한 달·날이 망가지지 않게 옛 줄을 그대로 둔다
create function public.stats_keep_complete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.partial = false and new.partial = true then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon·authenticated에도 열어 둔다. 트리거는 이 권한 없이 돈다
revoke all on function public.stats_keep_complete() from public, anon, authenticated;

create trigger stats_months_keep_complete before update on public.stats_months
  for each row execute function public.stats_keep_complete();

create trigger stats_days_keep_complete before update on public.stats_days
  for each row execute function public.stats_keep_complete();
