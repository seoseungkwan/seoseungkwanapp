-- 통계 '처방별 추세' 묶음에 빼는 처방(out_codes)과 넣는 처방마다 조건(cond)을 더한다 (specs/group-exclude)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261105000100_stats_rx_groups.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 안 붙이고 올리면 처방별 추세 칸이 묶음 읽기 오류를 보인다.
-- 묶음 이름·처방 코드뿐이고 환자 칸은 없다. 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다

-- 칸 검사(한 줄 안): 빼는 처방은 코드 규칙(stats_rx_group_codes_ok)·대소문자 무시 겹침 없음·넣는 처방과 안 겹침.
-- 조건은 [{ "code": 넣는 처방, "unless": [코드…] }] 배열. code는 그 줄 넣는 처방(대소문자 무시)·항목끼리 안 겹침, unless는 1~1000개·코드 규칙·안에서 안 겹침·code 자신 아님
create function public.stats_rx_group_parts_ok(codes text[], out_codes text[], cond jsonb) returns boolean language plpgsql immutable set search_path = ''
as $$
declare e jsonb; seen text[] := '{}'; u text[];
begin
  if out_codes is null or not public.stats_rx_group_codes_ok(out_codes) then return false; end if;
  if (select count(distinct upper(c)) from unnest(out_codes) c) <> cardinality(out_codes) then return false; end if;
  if exists (select 1 from unnest(out_codes) o join unnest(codes) c on upper(o) = upper(c)) then return false; end if;
  if cond is null or jsonb_typeof(cond) <> 'array' or jsonb_array_length(cond) > 1000 then return false; end if;
  for e in select * from jsonb_array_elements(cond) loop
    -- or는 앞에서부터 끊긴다는 보장이 없어 검사를 나눈다(객체가 아닌 값에 jsonb_object_keys를 부르지 않게)
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(e)) <> 2 then return false; end if;
    if jsonb_typeof(e->'code') is distinct from 'string' or jsonb_typeof(e->'unless') is distinct from 'array' then return false; end if;
    if exists (select 1 from jsonb_array_elements(e->'unless') x where jsonb_typeof(x) <> 'string') then return false; end if;
    u := array(select jsonb_array_elements_text(e->'unless'));
    if cardinality(u) < 1 or not public.stats_rx_group_codes_ok(u) or not public.stats_rx_group_codes_ok(array[e->>'code']) then return false; end if;
    if (select count(distinct upper(x)) from unnest(u) x) <> cardinality(u) then return false; end if;
    if upper(e->>'code') = any(array(select upper(x) from unnest(u) x)) then return false; end if;
    if not upper(e->>'code') = any(array(select upper(c) from unnest(codes) c)) then return false; end if;
    if upper(e->>'code') = any(seen) then return false; end if;
    seen := seen || upper(e->>'code');
  end loop;
  return true;
end $$;
revoke all on function public.stats_rx_group_parts_ok(text[], text[], jsonb) from public, anon;
grant execute on function public.stats_rx_group_parts_ok(text[], text[], jsonb) to authenticated;

alter table public.stats_rx_groups
  add column out_codes text[] not null default '{}',
  add column cond jsonb not null default '[]'::jsonb,
  add constraint stats_rx_groups_parts_ok check (public.stats_rx_group_parts_ok(codes, out_codes, cond));

-- 새 칸 권한(이미 있는 name·codes·sort_order 권한은 그대로)
grant insert (out_codes, cond), update (out_codes, cond) on table public.stats_rx_groups to authenticated;

-- 저장 함수: 항목의 out_codes·cond도 넣는다. 열쇠가 없는 항목(옛 앱)은 빈 값. 배열이 아니면 bad groups
create or replace function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid; outs text[]; conds jsonb;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    if g ? 'out_codes' and jsonb_typeof(g->'out_codes') <> 'array' then raise exception 'bad groups'; end if;
    if g ? 'cond' and jsonb_typeof(g->'cond') <> 'array' then raise exception 'bad groups'; end if;
    outs := array(select jsonb_array_elements_text(coalesce(g->'out_codes', '[]'::jsonb)));
    conds := coalesce(g->'cond', '[]'::jsonb);
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then
      insert into public.stats_rx_groups (name, codes, out_codes, cond, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), outs, conds, (g->>'sort_order')::int) returning id into gid;
    else
      -- 열쇠가 없는 항목(옛 앱 탭)은 그 칸을 지금 값 그대로 둔다
      update public.stats_rx_groups s set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')),
        out_codes = case when g ? 'out_codes' then outs else s.out_codes end,
        cond = case when g ? 'cond' then conds else s.cond end,
        sort_order = (g->>'sort_order')::int
        where s.id = gid;
      if not found then raise exception 'not my group'; end if;
    end if;
    keep := keep || gid;
  end loop;
  delete from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() and not (s.id = any(keep));
  return query select * from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() order by s.sort_order;
end $$;
revoke all on function public.save_stats_rx_groups(jsonb) from public, anon;
grant execute on function public.save_stats_rx_groups(jsonb) to authenticated;
