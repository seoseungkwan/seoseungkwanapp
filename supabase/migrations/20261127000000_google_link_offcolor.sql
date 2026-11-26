-- 휴무 줄 색 따라가기 DB: 내 병원 구글 연결 줄(gcal_links)의 휴무 줄 색(look.offColor) 한 칸만 바꾸는 정의자 함수 하나 gcal_set_off_color(p_color)
-- (spec google-link REQ-8547 AC-8547.4, design.md 21-5, ADR-053)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261126000000_google_link.sql(gcal_links 표·gcal_links_touch 트리거)과 20261118100000_desk_accounts.sql(my_clinic_hospital_id())·
-- 20261124000000_admin_view.sql(admin_view_hospital_id())이 들어가 있어야 한다(지금 모든 migration 뒤에 붙인다). 그 함수·표는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(함수는 바꿔 쓰고, 권한은 거두고 다시 준다. 표·칸·정책·트리거·줄은 건드리지 않는다).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 새 사이트의 받기·처음 가져오기가 휴무 줄 색만 못 맞추고 — 그 실패는 삼켜서 —
-- 다른 일은 그대로 돈다). 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(아무도 이 함수를 부르지 않는다).
--
-- 무엇을 왜(사용자 결정 8 — 2026-11-26): 구글 캘린더에서 off 일정 색을 바꾸면 웹앱 휴무 줄 색도 그 색을 따른다. 받기는 원장 PC·데스크 PC 어디서나 도는데
-- 데스크는 gcal_links를 고칠 권한이 없다(원장만 쓰기) → 좁은 정의자 함수 하나로 offColor 한 칸만 바꾼다. 다른 look 칸·rules·비밀 글자·주소는 그대로.
-- 고친 시각(updated_at)은 지금 트리거(gcal_links_touch)가 적는다. 환자 자료는 들어가지 않는다.
--
-- 권한: 로그인한 사용자(authenticated)만 실행하고 PUBLIC·anon은 못 한다. 병원은 함수 안에서 my_clinic_hospital_id()(원장·데스크 모두 자기 병원 하나,
-- 승인 전·병원 없음은 null → 0줄)로만 정한다(병원 id 인자 없음 — 다른 병원 줄은 어떤 부르기로도 바뀌지 않는다).
-- 관리자 '다른 의원 보기' 중(admin_view_hospital_id()가 있음)이면 아무것도 바꾸지 않고 거짓. 구글 11색 이름 밖의 글·null은 22023으로 거절.
-- 답: 바꾼 줄이 있으면 참, 없으면(연결 줄이 없음·보이기 look이 아직 없음) 거짓

create or replace function public.gcal_set_off_color(p_color text) returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  -- 관리자 '다른 의원 보기' 중이면 아무것도 안 함(보기는 읽기만)
  if public.admin_view_hospital_id() is not null then
    return false;
  end if;
  if p_color is null or p_color not in ('lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato') then
    raise exception 'gcal_set_off_color: 구글 11색이 아님' using errcode = '22023';
  end if;
  update public.gcal_links
     set look = jsonb_set(look, '{offColor}', to_jsonb(p_color))
   where hospital_id = public.my_clinic_hospital_id()
     and jsonb_typeof(look) = 'object';
  return found;
end
$$;

revoke all on function public.gcal_set_off_color(text) from public, anon, authenticated;
grant execute on function public.gcal_set_off_color(text) to authenticated;
