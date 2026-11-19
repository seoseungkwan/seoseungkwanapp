-- 서식 탭 휴진 안내 글씨·로고 크기·색 여섯 칸(form_notices.title_scale·body_scale·logo_scale·title_color·body_color·logo_color)
-- (spec form-style REQ-6806)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261110000000_form_notices.sql(휴진 안내 표),
-- 20261115030000_form_notices_accent.sql(글자 색 칸)이 들어가 있어야 한다.
-- 사이트에 올리기 전에 붙인다. 붙이기 전에 새 화면을 올리면 휴진 안내 저장·목록이 여섯 칸이 없어 실패한다.
-- 여러 번 실행해도 된다: 칸이 이미 있으면 건너뛰고, 검사 제약은 지우고 같은 글자로 다시 만들고, 권한은 같은 것을 다시 준다.
--
-- 왜: 안내문마다 제목·본문 글씨 크기, 로고 크기, 제목·본문·로고 색을 사용자가 직접 골라 저장하려고.
-- 크기는 % 숫자: 제목·본문 80~130, 로고 60~150, 모두 5의 배수. null = 처음대로(100%).
-- 색은 '#' + 소문자 16진수 6자리만 받는다. null = 자동(제목·본문) 또는 원래 색(로고).
-- 이미 있던 줄은 여섯 칸 모두 null(처음대로)이라 제약을 넘는다.
--
-- 권한: 여섯 칸과 그 칸들의 넣기·고치기 권한만 더한다(읽기는 표 권한에 이미 들어 있다).
-- 표 RLS 정책(my_hospital_id())·다른 칸 권한·트리거·다른 표와 함수는 건드리지 않는다
alter table public.form_notices add column if not exists title_scale smallint;
alter table public.form_notices add column if not exists body_scale smallint;
alter table public.form_notices add column if not exists logo_scale smallint;
alter table public.form_notices add column if not exists title_color text;
alter table public.form_notices add column if not exists body_color text;
alter table public.form_notices add column if not exists logo_color text;
alter table public.form_notices drop constraint if exists form_notices_style_check;
alter table public.form_notices add constraint form_notices_style_check check ((title_scale is null or (title_scale between 80 and 130 and title_scale % 5 = 0)) and (body_scale is null or (body_scale between 80 and 130 and body_scale % 5 = 0)) and (logo_scale is null or (logo_scale between 60 and 150 and logo_scale % 5 = 0)) and (title_color is null or title_color ~ '^#[0-9a-f]{6}$') and (body_color is null or body_color ~ '^#[0-9a-f]{6}$') and (logo_color is null or logo_color ~ '^#[0-9a-f]{6}$'));
grant insert (title_scale, body_scale, logo_scale, title_color, body_color, logo_color), update (title_scale, body_scale, logo_scale, title_color, body_color, logo_color) on table public.form_notices to authenticated;
