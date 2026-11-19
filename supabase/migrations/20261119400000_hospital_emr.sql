-- 가입 신청 줄의 쓰는 EMR: 가입 신청 표 hospitals에 emr('bit' 비트·'uisarang' 의사랑·'egis' 이지스·'other' 그 밖의 EMR)을 더하고,
-- 승인된 원장·데스크가 자기 병원 가입 EMR을 읽는 함수 my_signup_emr()을 만든다 (spec emr-signup REQ-7301)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261118100000_desk_accounts.sql(my_clinic_hospital_id() 함수)이 들어가 있어야 한다.
-- 두 번 붙여 넣어도 그대로다(칸은 없을 때만 더하고, 함수는 다시 만들고, 권한은 같은 것을 다시 준다. 이미 고른 값은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 새 가입 신청이 emr 칸 없음으로 실패하고 관리자 목록 읽기도 실패한다).
--
-- 무엇을 왜: 다른 병원이 가입 신청 때 쓰는 EMR을 고르고, 관리자가 승인 목록에서 본다. 승인 뒤 병원 정보 줄이 아직 없으면
-- 앱이 my_signup_emr()로 그 EMR을 기본값으로 쓴다(병원 정보에서 저장하면 그 값이 이긴다). 이미 있는 가입 줄은 모두 'bit'가 된다.
-- 환자 자료는 들어가지 않는다.
--
-- 권한: 넣기는 칸 단위 그대로(name·applicant_name·phone에 emr만 더함, 소유자·상태·메일·날짜는 여전히 기본값으로만).
-- 고치기 권한은 아무에게도 없다(가입 신청 뒤 바꾸지 않는다). 읽기는 표 정책 그대로(내 줄·관리자).
-- my_signup_emr()은 승인된 원장의 내 병원·데스크의 그 병원(my_clinic_hospital_id()) emr만 돌려주고, 그 밖은 null.
-- 실행은 로그인한 사용자(authenticated)만. 값은 넷만 DB 제약이 받는다. 다른 칸·정책·함수는 바꾸지 않는다

alter table public.hospitals
  add column if not exists emr text not null default 'bit'
  check (emr in ('bit', 'uisarang', 'egis', 'other'));

-- 가입 신청(앱 submitSignup)이 보내는 네 칸
grant insert (name, applicant_name, phone, emr) on table public.hospitals to authenticated;

-- 데스크는 hospitals 줄을 못 읽어 함수로 읽는다(원장도 같은 길)
create or replace function public.my_signup_emr() returns text language sql stable security definer set search_path = ''
as $$ select h.emr from public.hospitals h where h.id = public.my_clinic_hospital_id() $$;

revoke all on function public.my_signup_emr() from public, anon, authenticated;
grant execute on function public.my_signup_emr() to authenticated;
