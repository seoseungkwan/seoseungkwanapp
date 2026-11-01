-- 매출 탭 표 셋(sales_days·sales_codes·rx_groups), RLS, 묶음 저장 함수, 공용 함수 my_hospital_id()·touch_updated_at()
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- auth migration(20261028000000_auth.sql)이 먼저 들어가 있어야 한다. 붙여 넣는 때는 사용자 OK 뒤다
--
-- 무엇을 왜: 매출 탭이 의원 PC에서 가져온 집계 숫자만 저장한다. 날짜별 합계 금액·건수(sales_days)와 달별 처방 코드·건수·금액(sales_codes),
-- 총괄이 직접 만든 치료 묶음(rx_groups)뿐이다. 환자 칸(이름·차트번호·접수 번호·주민번호)은 어느 표에도 없다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자(authenticated)는 자기 병원 줄만 다룬다.
-- hospital_id·id·fetched_at·updated_at은 칸 권한이 없어 DB 기본값·트리거로만 채워진다(남의 병원 줄을 만들 길이 없다).
-- 승인 대기·거절 병원은 my_hospital_id()가 null이라 아무 줄도 못 보고 못 넣는다.
-- 지우기 권한은 E2E가 시험 계정 줄을 지우는 데도 쓴다(service role 키가 없다)

-- 공용 함수: 갈래마다 글자 그대로 같다(갈래 규칙 C1). 어느 갈래가 먼저 들어가도 된다. 고치지 않는다
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- 트리거만 부른다
create function public.sales_touch_fetched_at() returns trigger language plpgsql set search_path = ''
  as $$ begin new.fetched_at := now(); return new; end $$;
revoke all on function public.sales_touch_fetched_at() from public, anon, authenticated;

create table public.sales_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  visits integer check (visits between 0 and 100000),
  new_patients integer check (new_patients between 0 and 100000),
  return_visits integer check (return_visits between 0 and 100000),
  patients_to_date integer check (patients_to_date between 0 and 1000000),
  total bigint check (total >= 0),
  insurer bigint check (insurer >= 0),
  noncovered bigint check (noncovered >= 0),
  copay bigint check (copay >= 0),
  other_total bigint check (other_total >= 0),
  cash bigint check (cash >= 0),
  card bigint check (card >= 0),
  transfer bigint check (transfer >= 0),
  receivable_in bigint check (receivable_in >= 0),
  unconfirmed boolean not null,
  split_unconfirmed boolean not null,
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, day),
  -- 금액 아홉 칸의 세 모양(계약 5-2): 모두 빔 · 나눔 넷만 빔 · 모두 있음
  check ((unconfirmed and not split_unconfirmed and num_nulls(total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in) = 9)
      or (split_unconfirmed and not unconfirmed and num_nulls(insurer, noncovered, copay, other_total) = 4 and num_nonnulls(total, cash, card, transfer, receivable_in) = 5)
      or (not unconfirmed and not split_unconfirmed and num_nonnulls(total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in) = 9)));
create table public.sales_codes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  month date not null check (extract(day from month) = 1 and month >= date '2000-01-01'),
  code text not null check (code ~ '^[0-9A-Za-z가-힣_.-]{1,30}$'),
  name text check (char_length(name) between 1 and 100),
  count integer not null check (count between 0 and 10000000),
  amount bigint check (amount >= 0),
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, month, code));
create trigger sales_days_fetched_at before update on public.sales_days for each row execute function public.sales_touch_fetched_at();

-- 치료 묶음(총괄이 만든다). 이름이 일반적인 까닭: 통계 탭도 합친 뒤 같은 표를 쓴다(plan.md §5의 rx_groups)
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
-- 위 줄은 C1 글자 그대로 두고 권한만 따로 거둔다. 트리거는 이 권한 없이도 돈다
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create function public.rx_group_codes_ok(codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select cardinality(codes) <= 1000 and coalesce(bool_and(c is not null and c ~ '^[0-9A-Za-z가-힣_.-]{1,30}$' and c <> '_REST'), true) from unnest(codes) c $$;
  -- bool_and는 null을 건너뛰므로 c is not null을 같이 본다(null 칸 거부)
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 /rest/v1/rpc/로 못 부르게 막는다
revoke all on function public.rx_group_codes_ok(text[]) from public, anon;
grant execute on function public.rx_group_codes_ok(text[]) to authenticated;
create table public.rx_groups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)
                             and name !~ '[[:cntrl:]]' and name !~ '[0-9]{6,}'),   -- 가벼운 울타리: 제어 문자·주민번호/전화/차트번호 모양 막기
  codes text[] not null default '{}' check (public.rx_group_codes_ok(codes)),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name) deferrable initially deferred);   -- 이름 맞바꾸기를 한 트랜잭션 안에서 허용(끝에 검사)
create trigger rx_groups_updated_at before update on public.rx_groups for each row execute function public.touch_updated_at();

-- 묶음 목록 한꺼번에 저장(호출한 사람 권한, RLS 그대로, 한 트랜잭션이라 도중 실패면 아무것도 안 바뀜)
create function public.save_rx_groups(groups jsonb) returns setof public.rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;   -- jsonb_typeof(null)은 null이라 따로 본다
  for g in select * from jsonb_array_elements(groups) loop
    -- codes가 빠지면 array(...)가 조용히 '{}'가 되어 CHECK를 지나고 손으로 만든 코드가 날아간다. 이름·순서가 빠질 때처럼 거부한다
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then   -- 새 묶음은 넣기만(이름으로 다른 줄을 고르지 않는다, 줄은 id로만 고른다)
      insert into public.rx_groups (name, codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), (g->>'sort_order')::int) returning id into gid;
    else
      update public.rx_groups set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')), sort_order = (g->>'sort_order')::int
        where id = gid;
      if not found then raise exception 'not my group'; end if;   -- 남의 병원 id(RLS로 안 보임)
    end if;
    keep := keep || gid;
  end loop;
  delete from public.rx_groups r where r.hospital_id = public.my_hospital_id() and not (r.id = any(keep));
  return query select * from public.rx_groups r where r.hospital_id = public.my_hospital_id() order by r.sort_order;
end $$;
revoke all on function public.save_rx_groups(jsonb) from public, anon;
grant execute on function public.save_rx_groups(jsonb) to authenticated;

alter table public.sales_days enable row level security;
alter table public.sales_codes enable row level security;
alter table public.rx_groups enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.sales_days, public.sales_codes, public.rx_groups from anon, authenticated;

grant select, delete on table public.sales_days to authenticated;
-- 칸 단위: day~split_unconfirmed 열여섯 칸. upsert가 충돌 칸도 SET하므로 day 포함. hospital_id·fetched_at은 없다
grant insert (day, visits, new_patients, return_visits, patients_to_date, total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in, unconfirmed, split_unconfirmed),
      update (day, visits, new_patients, return_visits, patients_to_date, total, insurer, noncovered, copay, other_total, cash, card, transfer, receivable_in, unconfirmed, split_unconfirmed)
  on table public.sales_days to authenticated;

-- 고치기가 없다: 달을 다시 저장할 때는 지우고 넣는다
grant select, delete on table public.sales_codes to authenticated;
grant insert (month, code, name, count, amount) on table public.sales_codes to authenticated;

grant select, delete on table public.rx_groups to authenticated;
grant insert (name, codes, sort_order), update (name, codes, sort_order) on table public.rx_groups to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 날짜별 매출 읽기" on public.sales_days
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 날짜별 매출 넣기" on public.sales_days
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 날짜별 매출 고치기" on public.sales_days
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 날짜별 매출 지우기" on public.sales_days
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 처방 합계 읽기" on public.sales_codes
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 처방 합계 넣기" on public.sales_codes
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 처방 합계 지우기" on public.sales_codes
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

create policy "내 병원 치료 묶음 읽기" on public.rx_groups
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 치료 묶음 넣기" on public.rx_groups
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 치료 묶음 고치기" on public.rx_groups
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 치료 묶음 지우기" on public.rx_groups
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
