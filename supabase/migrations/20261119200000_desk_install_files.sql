-- 데스크도 설치 파일 보관함(Storage 버킷 install-files)을 읽는다 — 읽기 규칙을 '승인된 사용자·데스크·관리자'로 바꾼다
-- (spec desk-setup REQ-7005, ADR-031)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261117000000_install_files.sql(보관함과 옛 읽기 규칙)·20261118100000_desk_accounts.sql(my_clinic_hospital_id())이
-- 들어가 있어야 한다.
-- 두 번 붙여 넣어도 그대로다(읽기 규칙만 지우고 다시 만든다. 올린 파일·표·함수·버킷 설정은 건드리지 않는다).
-- 사이트에 올리기 전에 붙인다. 붙이기 전에 사이트가 나가면 데스크의 [내려받기]만 '받지 못했어요'를 보이고 다른 곳은 그대로다.
-- 나중에 20261117000000_install_files.sql을 다시 붙이면 옛 정책이 다시 생기지만 데스크 읽기는 새 정책이 그대로 연다
-- (같은 표의 읽기 정책은 '또는'으로 합쳐진다).
--
-- 무엇을 왜(ADR-031): 데스크 PC도 비트 PC 연결 화면에서 확장·도우미를 받아 깔고 연결한다(장부는 그 PC의 비트를 도우미가 읽는다).
-- 그래서 읽기(목록·받기)를 승인된 병원 원장·승인된 병원의 데스크(자기 병원 줄 없음)·관리자에게 연다.
-- my_clinic_hospital_id() = 원장이면 내 병원, 아니면 데스크 병원(둘 다 아니면 null). 대기·거절 병원의 데스크는 null이라 못 읽는다.
--
-- 권한: 로그인 안 한 사용자(anon)·승인 전·거절된 사용자·병원 줄도 데스크 줄도 없는 사용자는 아무것도 못 읽는다.
-- 올리기 규칙 '설치 파일 올리기(관리자)'는 그대로다(데스크는 올리기·고치기·지우기를 못 한다). install-files 밖 버킷은 열지 않는다.
-- 표·함수·버킷은 만들지도 고치지도 않는다

-- 읽기: 승인된 원장·승인된 병원의 데스크(my_clinic_hospital_id()가 null이 아님)나 관리자. (select …)는 문장마다 한 번 계산한다
drop policy if exists "설치 파일 읽기(승인된 사용자·관리자)" on storage.objects;
drop policy if exists "설치 파일 읽기(승인된 사용자·데스크·관리자)" on storage.objects;
create policy "설치 파일 읽기(승인된 사용자·데스크·관리자)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'install-files'
    and (
      (select public.my_clinic_hospital_id()) is not null
      or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    )
  );
