-- 서식 탭 휴진 안내 글자 색(form_notices.accent) (spec forms-accent REQ-4704)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql과 20261110000000_form_notices.sql(휴진 안내 표)이 들어가 있어야 한다.
-- 사이트에 올리기 전에 붙인다. 붙이기 전에 새 화면을 올리면 휴진 안내 저장·목록이 accent 칸이 없어 실패한다.
-- 여러 번 실행해도 된다: 칸이 이미 있으면 건너뛰고, 모양 제약은 지우고 같은 글자로 다시 만들고, 권한은 같은 것을 다시 준다.
--
-- 왜: 안내문마다 강조색('N월'·날짜 띠·카드 아래 글) 하나를 사용자가 직접 골라 저장하려고.
-- null = 자동(지금처럼 배경·테마 강조색). 값은 '#' + 소문자 16진수 6자리만 받는다. 이미 있던 줄은 null이라 제약을 넘는다.
--
-- 권한: 칸 하나와 그 칸의 넣기·고치기 권한만 더한다(읽기는 표 권한에 이미 들어 있다).
-- 표 RLS 정책(my_hospital_id())·다른 칸 권한·트리거·다른 표와 함수는 건드리지 않는다
alter table public.form_notices add column if not exists accent text;
alter table public.form_notices drop constraint if exists form_notices_accent_check;
alter table public.form_notices add constraint form_notices_accent_check check (accent ~ '^#[0-9a-f]{6}$');
grant insert (accent), update (accent) on table public.form_notices to authenticated;
