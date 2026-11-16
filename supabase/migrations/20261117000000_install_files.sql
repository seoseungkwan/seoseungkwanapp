-- 도우미·크롬 확장 설치 파일 보관함(Storage 버킷 install-files)과 그 읽기·올리기 규칙 (spec helper-download REQ-5101)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원·관리자 표)이 들어가 있어야 한다.
-- 사이트에 올리기 전에 붙인다. 붙이기 전에는 [내려받기] 단추가 목록을 읽지 못했다는 오류를 보이고, 관리자 올리기도 실패한다.
-- 여러 번 실행해도 된다: 이미 올린 파일은 그대로 두고, 함수·규칙(정책)·버킷 설정만 이 파일 값으로 다시 맞춘다.
-- 실행 뒤 Storage 화면에 install-files 버킷이 보이고 'Private'(공개 아님)인지 본다.
--
-- 만드는 것:
--   (1) 보관함(Storage 버킷) install-files: 공개 아님, 한 파일 5,000,000바이트까지, zip(application/zip)만
--   (2) 읽기(목록·받기) 규칙: 승인된 병원 사용자(어느 병원이든)나 관리자만
--   (3) 올리기 규칙: 관리자만, 이름이 helper/precheck-helper-X.Y.Z.zip · extension/precheck-extension-X.Y.Z.zip 모양일 때만
--
-- 권한: 로그인 안 한 사용자(anon)·승인 전·거절된 사용자는 아무것도 못 한다.
-- 고치기(덮어쓰기·이름 바꾸기)·지우기 규칙은 두지 않아 누구도 못 한다(예전 판은 남긴다).
-- storage.objects 표 자체(RLS·권한)는 Supabase가 이미 갖춘 것이라 건드리지 않고 규칙(정책)만 더한다.
-- 표는 만들지 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- (1) 보관함: 공개 아님, 한 파일 5,000,000바이트, zip만. 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('install-files', 'install-files', false, 5000000, array['application/zip'])
  on conflict (id) do update set public = false, file_size_limit = 5000000, allowed_mime_types = array['application/zip'];

-- (2) 읽기: 승인된 병원 사용자(my_hospital_id()가 null이 아님)나 관리자. (select …)는 문장마다 한 번 계산한다.
-- 관리자는 올린 파일을 돌려받아야 해서(올리기 = 넣기 + 돌려받기) 병원 승인이 없어도 읽는다
drop policy if exists "설치 파일 읽기(승인된 사용자·관리자)" on storage.objects;
create policy "설치 파일 읽기(승인된 사용자·관리자)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'install-files'
    and (
      (select public.my_hospital_id()) is not null
      or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    )
  );

-- (3) 올리기: 관리자만, 폴더와 종류가 맞는 이름만(helper/precheck-helper-… · extension/precheck-extension-…, 판은 숫자 셋 1~3자리).
-- 고치기·지우기 규칙은 두지 않는다(같은 이름 덮어쓰기도 고치기라 막힌다)
drop policy if exists "설치 파일 올리기(관리자)" on storage.objects;
create policy "설치 파일 올리기(관리자)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'install-files'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    and name ~ '^(helper/precheck-helper|extension/precheck-extension)-[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.zip$'
  );
