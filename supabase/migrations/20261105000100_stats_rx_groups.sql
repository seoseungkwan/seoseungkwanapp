-- 통계 탭 '처방별 추세'의 묶음(stats_rx_groups)과 묶음 저장 함수(save_stats_rx_groups)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 처방별 추세 칸만 읽기 오류를 보이고 다른 칸·불러오기는 그대로다.
--
-- 왜: 매출 탭 묶음(rx_groups)과 따로 둔다. 한쪽을 고쳐도 다른 쪽은 그대로다(2026-11-05 사용자 결정). 휴대폰과 컴퓨터가 같은 묶음을 보려고 계정에 둔다.
-- 묶음 이름·처방 코드·차례뿐이고 환자 칸은 없다. 처방 코드는 통계 일 숫자(stats_days)에 이미 있는 값이다.
--
-- 권한: rx_groups와 같은 모양이다. 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 고치고 지운다.
-- hospital_id·id·updated_at은 칸 권한이 없어 DB가 정한다. 처방 하나는 한 병원의 한 묶음에만 든다(대소문자 무시, 저장이 끝날 때 검사).
-- 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- 코드 목록: 1000개까지, 칸마다 1~100자, 제어 문자 없음. 통계 일 숫자의 코드 규칙(validate.ts isCode, 100자)보다 좁지 않다
create function public.stats_rx_group_codes_ok(codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select cardinality(codes) <= 1000 and coalesce(bool_and(c is not null and char_length(c) between 1 and 100 and c !~ '[[:cntrl:]]'), true) from unnest(codes) c $$;
  -- bool_and는 null을 건너뛰므로 c is not null을 같이 본다(null 칸 거부)
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 /rest/v1/rpc/로 못 부르게 막는다
revoke all on function public.stats_rx_group_codes_ok(text[]) from public, anon;
grant execute on function public.stats_rx_group_codes_ok(text[]) to authenticated;

create table public.stats_rx_groups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)
                             and name !~ '[[:cntrl:]]' and name !~ '[0-9]{6,}'),   -- rx_groups와 같은 울타리
  codes text[] not null default '{}' check (public.stats_rx_group_codes_ok(codes)),
  sort_order integer not null default 0 check (sort_order between 0 and 49),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name) deferrable initially deferred);   -- 이름 맞바꾸기를 한 저장 안에서 허용(끝에 검사)

-- 트리거만 부른다
create function public.stats_rx_groups_touch() returns trigger language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.stats_rx_groups_touch() from public, anon, authenticated;
create trigger stats_rx_groups_updated_at before update on public.stats_rx_groups for each row execute function public.stats_rx_groups_touch();

-- 처방 하나는 한 병원의 한 묶음에만(대소문자 무시, 한 묶음 안 두 번도 막음). 한 저장 안에서 묶음 사이로 옮길 수 있게 끝(commit)에 본다.
-- 부른 사람 권한으로 돌아 RLS가 자기 병원 줄만 보인다
create function public.stats_rx_groups_code_once() returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.stats_rx_groups g cross join lateral unnest(g.codes) as c(code)
     where g.hospital_id = new.hospital_id
     group by upper(c.code) having count(*) > 1
  ) then
    raise exception 'code in two groups' using errcode = '23505';
  end if;
  return null;
end $$;
revoke all on function public.stats_rx_groups_code_once() from public, anon, authenticated;
create constraint trigger stats_rx_groups_code_once after insert or update on public.stats_rx_groups
  deferrable initially deferred for each row execute function public.stats_rx_groups_code_once();

-- 묶음 목록 한꺼번에 저장(save_rx_groups와 같은 규칙. 부른 사람 권한, RLS 그대로, 한 트랜잭션이라 도중 실패면 아무것도 안 바뀜)
create function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then   -- 새 묶음은 넣기만(줄은 id로만 고른다)
      insert into public.stats_rx_groups (name, codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), (g->>'sort_order')::int) returning id into gid;
    else
      update public.stats_rx_groups set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')), sort_order = (g->>'sort_order')::int
        where id = gid;
      if not found then raise exception 'not my group'; end if;   -- 남의 병원 id(RLS로 안 보임)
    end if;
    keep := keep || gid;
  end loop;
  delete from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() and not (s.id = any(keep));
  return query select * from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() order by s.sort_order;
end $$;
revoke all on function public.save_stats_rx_groups(jsonb) from public, anon;
grant execute on function public.save_stats_rx_groups(jsonb) to authenticated;

alter table public.stats_rx_groups enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_rx_groups from anon, authenticated;
grant select, delete on table public.stats_rx_groups to authenticated;
grant insert (name, codes, sort_order), update (name, codes, sort_order) on table public.stats_rx_groups to authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 통계 묶음 읽기" on public.stats_rx_groups
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 넣기" on public.stats_rx_groups
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 고치기" on public.stats_rx_groups
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 지우기" on public.stats_rx_groups
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
