-- 처방별 추세 묶음에 '제외할 처방'(exclude_codes)을 더한다 (specs/rx-group-exclude)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261105000100_stats_rx_groups.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다.
-- 안 붙이고 올리면 통계 탭 처방별 추세 칸·대시보드 '처방 상위'의 묶음 읽기와 AI 리포트 만들기가 실패한다.
-- 그 사이에 비트·파일로 불러온 날은 묶음 숫자 없이 저장되어, 이 파일을 붙인 뒤에도 그 날을 다시 불러올 때까지 '다시 불러오면 보여요'다(틀린 숫자는 보이지 않는다).
-- 다른 칸 숫자는 그대로다. 이 파일을 먼저 붙이고 예전 사이트를 그대로 두는 것은 괜찮다(예전 화면은 이 칸을 읽지 않고, 예전 화면이 저장해도 제외할 처방은 그대로 남는다).
--
-- 왜: 그날 묶음 처방을 받았어도 같은 날 제외할 처방을 받은 환자는 그 묶음에서 세지 않으려고(2026-11-12 사용자 결정).
-- 처방 코드뿐이고 환자 칸은 없다. 권한은 stats_rx_groups 그대로이고 이 칸만 authenticated가 넣고 고칠 수 있다.

-- 제외할 처방: 같은 줄의 넣은 처방과 겹치지 않고(대소문자 무시) 제외 목록 안에서도 두 번 나오지 않는다
create function public.stats_rx_group_exclude_ok(codes text[], exclude_codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select (select count(distinct upper(e)) from unnest(exclude_codes) e) = cardinality(exclude_codes)
           and not exists (select 1 from unnest(codes) c join unnest(exclude_codes) e on upper(c) = upper(e)) $$;
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 막는다(stats_rx_group_codes_ok와 같다)
revoke all on function public.stats_rx_group_exclude_ok(text[], text[]) from public, anon;
grant execute on function public.stats_rx_group_exclude_ok(text[], text[]) to authenticated;

alter table public.stats_rx_groups
  add column exclude_codes text[] not null default '{}' check (public.stats_rx_group_codes_ok(exclude_codes)),
  add constraint stats_rx_groups_exclude_apart check (public.stats_rx_group_exclude_ok(codes, exclude_codes));

grant insert (exclude_codes), update (exclude_codes) on table public.stats_rx_groups to authenticated;

-- 묶음 목록 한꺼번에 저장: 20261105000100의 규칙 그대로에 exclude_codes만 더한다.
-- 열쇠가 없으면(예전 화면) 새 묶음은 빈 배열, 이미 있는 묶음은 그 값을 그대로 둔다(예전 화면이 저장해도 제외할 처방이 지워지지 않게)
create or replace function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid; has_exclude boolean;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    has_exclude := g ? 'exclude_codes';
    if has_exclude and jsonb_typeof(g->'exclude_codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then
      insert into public.stats_rx_groups (name, codes, exclude_codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')),
                case when has_exclude then array(select jsonb_array_elements_text(g->'exclude_codes')) else '{}'::text[] end,
                (g->>'sort_order')::int)
        returning id into gid;
    else
      update public.stats_rx_groups
         set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')),
             exclude_codes = case when has_exclude then array(select jsonb_array_elements_text(g->'exclude_codes')) else exclude_codes end,
             sort_order = (g->>'sort_order')::int
       where id = gid;
      if not found then raise exception 'not my group'; end if;
    end if;
    keep := keep || gid;
  end loop;
  delete from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() and not (s.id = any(keep));
  return query select * from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() order by s.sort_order;
end $$;
revoke all on function public.save_stats_rx_groups(jsonb) from public, anon;
grant execute on function public.save_stats_rx_groups(jsonb) to authenticated;
