-- 문자 문구 종류에 '예약 안내'(reservation)를 더한다 (spec patients-bit-lists REQ-2805, AC-2805.1)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다). 붙여 넣는 때는 사용자 OK 뒤다.
-- 20261101000300_patients.sql(라이브 줄은 20261030000000_precheck_settings.sql도)이 먼저 들어가 있어야 한다. 두 파일 모두 kind 제약을
-- 이름 없이 만들어 Postgres가 message_templates_kind_check로 이름을 붙였다. 그 제약을 지우고 같은 이름으로 세 종류를 받게 다시 둔다.
-- 관문: 예약 안내를 보내는 새 화면은 이 파일을 붙인 뒤에 사이트에 올린다. 그 전에는 예약 안내 줄이 제약에 걸려 저장이 실패한다
-- (저장한 문구가 없는 의원은 기본 문구 셋을 한 번에 넣으므로 주사·진료 안내까지 함께 안 들어간다).
-- 붙여 넣는 것은 지금 사이트에 해가 없다: 옛 화면은 주사·진료 안내만 보내고, 있던 줄은 그대로다.
-- 바꾸는 것은 kind 제약 하나뿐이다. 칸·권한·RLS·정책·트리거·공용 함수는 그대로다. 한 문장이라 반만 바뀌지 않고, 두 번 붙여 넣어도 그대로다
alter table public.message_templates
  drop constraint if exists message_templates_kind_check,
  add constraint message_templates_kind_check check (kind in ('injection', 'followup', 'reservation'));
