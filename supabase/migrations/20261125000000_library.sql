-- 자료실: 모든 의원이 같이 보는 파일 목록 표 library_files와 비공개 Storage 바구니 library, 그 읽기·넣기·지우기 규칙
-- (spec library REQ-8101, design.md 'SQL', ADR-051)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원·관리자 표)·20261118100000_desk_accounts.sql(my_clinic_hospital_id())이 들어가 있어야 한다.
-- my_hospital_id()·my_clinic_hospital_id()는 여기서 다시 만들지 않는다(글자·권한 그대로). 함수는 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 권한은 거두고 다시 주고, 규칙(정책)은 지우고 다시 만들고,
-- 바구니 설정은 이 파일 값으로 되돌린다. 이미 올린 파일과 목록 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 자료실 탭은 읽기 실패 카드이고,
-- 비트 PC 연결 화면의 받기 단추는 '설치 파일 목록을 읽지 못했어요'를 보인다).
-- 실행 뒤 Storage 화면에 library 바구니가 보이고 'Private'(공개 아님)인지, Storage 설정의 'Upload file size limit'(프로젝트 전체
-- 올리기 한도)이 50MB 이상인지 본다(작으면 큰 파일이 너무 크다고 막힌다).
--
-- 무엇을 왜(ADR-051): 의원 PC에 깔 프로그램(청구 도우미·크롬 확장 등)과 설명서를 웹앱 한곳(자료실 탭)에서 받는다.
-- 자료실은 병원마다 따로가 아니라 모든 의원이 같은 한 벌이라 hospital_id가 없다(ADR-037·042 같은 공용 표 예외).
-- 파일은 바구니 library에 uuid 이름(폴더 없음)으로 둔다 — Supabase Storage는 한글 이름을 받지 않는다. 원래 파일 이름(판 묶기·받을 때
-- 저장 이름)·목록에 보이는 이름·분류(install 설치 파일 · guide 설명서 · other 그 밖)·설명 한 줄(60자까지)·크기는 library_files 한 줄에 둔다.
-- 어떤 형식이든 한 파일 50MB(52,428,800바이트)까지. 같은 파일 이름은 하나만.
-- 옛 설치 파일 바구니 install-files(20261117000000_install_files.sql·20261119200000_desk_install_files.sql)와 그 두 규칙은 건드리지 않는다
-- (지우지 않고 남는다 — 앱이 더 읽지 않을 뿐). tab_access 줄은 넣지 않는다(자료실은 메뉴 밖 늘 보이는 탭이다).
-- hospitals·admins 표·정책·권한도 바꾸지 않는다. 환자 자료는 들어가지 않는다(설치 파일·설명서만).
--
-- 권한: 읽기(목록·받기)는 승인된 의원의 원장·승인된 의원의 데스크(my_clinic_hospital_id()가 null이 아님)·관리자(admins에 자기 줄).
-- 넣기·지우기는 관리자만(목록 줄의 uploaded_by는 자기 id만, 바구니 이름은 uuid 모양만).
-- 고치기는 누구도 못 한다(표 update 권한 없음, 바구니 고치기 규칙 없음 — 같은 이름 덮어쓰기도 고치기라 막힌다).
-- 로그인 안 한 사용자(anon)·승인 대기·거절 의원의 원장과 데스크·병원 줄도 데스크 줄도 없는 사용자는 아무것도 못 한다.
-- 관리자가 다른 의원을 보는 중(ADR-046)의 쓰기는 DB가 따로 막지 않는다 — 자료실은 보는 의원의 자료가 아니고, 브라우저 거르기와
-- 단추 숨김이 막는다. storage.objects 표 자체(RLS·권한)는 Supabase가 이미 갖춘 것이라 건드리지 않고 규칙(정책)만 더한다

-- (1) 목록 표: 파일 하나 = 한 줄. 모든 의원이 같은 한 벌(hospital_id 없음)
create table if not exists public.library_files (
  id uuid primary key default gen_random_uuid(),
  -- 올릴 때의 파일 이름(판 묶기·받을 때 저장 이름). 같은 이름은 하나만
  file_name text not null unique check (char_length(file_name) between 1 and 200),
  -- 목록에 보이는 이름
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  category text not null check (category in ('install', 'guide', 'other')),
  description text not null default '' check (char_length(description) <= 60),
  -- 바구니 안 이름: 소문자 uuid 하나(폴더 없음)
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  size bigint not null check (size between 0 and 52428800),
  -- 올린 관리자(화면에는 안 보임). 계정이 지워지면 비운다
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.library_files enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고(칸 권한도 함께 거둬진다) 필요한 것만 준다.
-- 고치기(update)는 주지 않는다
revoke all on table public.library_files from public, anon, authenticated;
grant select, insert, delete on table public.library_files to authenticated;

-- 읽기: 승인된 원장·승인된 의원의 데스크(my_clinic_hospital_id()가 null이 아님)나 관리자 — 옛 설치 파일 읽기 규칙과 같은 판정.
-- (select …)는 줄마다가 아니라 문장마다 한 번 계산한다. 정책 이름은 Postgres 이름 한도(63바이트) 안이라 잘리지 않는다
drop policy if exists "자료실 목록 읽기(승인된 원장·데스크·관리자)" on public.library_files;
create policy "자료실 목록 읽기(승인된 원장·데스크·관리자)" on public.library_files
  for select to authenticated
  using (
    (select public.my_clinic_hospital_id()) is not null
    or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );

-- 넣기: 관리자만, 올린 사람 칸은 자기 id만
drop policy if exists "자료실 목록 넣기(관리자)" on public.library_files;
create policy "자료실 목록 넣기(관리자)" on public.library_files
  for insert to authenticated
  with check (
    exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    and uploaded_by = (select auth.uid())
  );

-- 지우기: 관리자만
drop policy if exists "자료실 목록 지우기(관리자)" on public.library_files;
create policy "자료실 목록 지우기(관리자)" on public.library_files
  for delete to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- (2) 바구니: 공개 아님, 한 파일 52,428,800바이트(50MB), 파일 형식 제한 없음. 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('library', 'library', false, 52428800, null)
  on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = null;

-- 파일 읽기: 목록 읽기와 같은 판정. 받기 서명과 지우기(Storage의 remove는 읽기도 필요)에 쓰인다
drop policy if exists "자료실 파일 읽기(승인된 원장·데스크·관리자)" on storage.objects;
create policy "자료실 파일 읽기(승인된 원장·데스크·관리자)" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library'
    and (
      (select public.my_clinic_hospital_id()) is not null
      or exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    )
  );

-- 파일 올리기: 관리자만, 이름은 소문자 uuid 하나(폴더 없음). 고치기 규칙은 두지 않는다(덮어쓰기 없음)
drop policy if exists "자료실 파일 올리기(관리자)" on storage.objects;
create policy "자료실 파일 올리기(관리자)" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'library'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

-- 파일 지우기: 관리자만
drop policy if exists "자료실 파일 지우기(관리자)" on storage.objects;
create policy "자료실 파일 지우기(관리자)" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'library'
    and exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
  );
