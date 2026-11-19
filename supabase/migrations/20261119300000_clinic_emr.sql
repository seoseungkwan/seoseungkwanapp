-- 쓰는 EMR 칸: 병원 정보 표 clinic_profiles에 emr('bit' 비트·'uisarang' 의사랑·'egis' 이지스·'other' 그 밖의 EMR)을 더한다
-- (spec emr-choice REQ-7101, ADR-033)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261119000000_clinic_profile.sql(clinic_profiles 표·권한·정책)이 들어가 있어야 한다.
-- 두 번 붙여 넣어도 그대로다(칸은 없을 때만 더하고, 권한은 같은 것을 다시 준다. 이미 고른 값은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 병원 정보 읽기가 칸 없음으로 실패해 앱은 기본 병원 정보로 돈다).
-- 주의: 20261119000000_clinic_profile.sql을 나중에 다시 붙여 넣으면 그 파일의 revoke all이 emr 넣기·고치기 권한을 지우니 그때는 이 파일도 다시 붙여 넣는다.
--
-- 무엇을 왜: 다른 병원은 비트가 아닌 EMR(의사랑·이지스 등)을 쓴다. 병원 정보에 쓰는 EMR을 적어 두면 대시보드·비트 PC 연결 화면이
-- 비트가 아닌 병원에 '준비하고 있어요' 안내를 보인다. 이미 있는 병원 정보 줄은 모두 'bit'(지금과 같음)가 된다. 환자 자료는 들어가지 않는다.
--
-- 권한: 읽기는 표의 select 권한·정책(원장은 내 병원, 데스크는 자기 병원) 그대로다. 넣기·고치기는 emr 칸 권한만 authenticated에 주고,
-- 넣기·고치기 정책(원장 내 병원 줄만)이 그대로 막아 데스크·다른 병원·승인 안 된 사용자는 못 넣고 못 고친다. 로그인 안 한 사용자(anon)는 아무것도 못 한다.
-- 값은 넷만 DB 제약이 받는다. 다른 칸·정책·함수는 바꾸지 않는다

alter table public.clinic_profiles
  add column if not exists emr text not null default 'bit'
  check (emr in ('bit', 'uisarang', 'egis', 'other'));

-- 앱 저장(upsert onConflict hospital_id)이 보내는 emr을 넣기·고치기에 쓴다(지우기 없음)
grant insert (emr), update (emr) on table public.clinic_profiles to authenticated;
