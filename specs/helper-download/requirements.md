# 요구사항: 도우미·확장 웹앱에서 받기

> 기능 ID: `helper-download` · 형식: `### REQ-5101: 제목` 아래 `- AC-5101.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-5101~5104(sunap-ilji 4901~4907, sunap-doctors 5001~5004와 겹치지 않음).
> **MVP 모드**(최소안·검토는 마지막 한 번). SQL 한 번(사용자가 붙여 넣음). 도우미·확장 새 판 없음.

## 배경 / 목표
- 지금 [도우미 내려받기]·[확장 내려받기]는 비공개 GitHub 릴리스 주소라 GitHub 로그인이 있어야 받는다. 다른 병원은 아예 못 받는다.
- 웹앱 안 비공개 보관함(Supabase Storage)에서 **로그인하고 승인된 사람만** 받게 한다. 파일은 **관리자만** 웹앱에서 올린다.
- 승인 시안: `docs/mockups/helper-download/index.html`(?s=settings·setup·none·update·ext·admin·uploading·bad·done).

## 이미 정한 것 (다시 묻지 않는다)
1. 받는 사람 = 로그인 + 승인된 병원 사용자(어느 병원이든) 또는 관리자. 공개 주소는 만들지 않는다(2026-11-16 사용자 "로그인한 사람만 받기")
2. 받을 파일 = 도우미 + 크롬 확장 둘 다(2026-11-17)
3. 자리 = 청구 탭 아래 '비트 PC 연결' 화면의 받기 단추 + **설정 탭 맨 위 새 칸**(2026-11-17 "설정 탭에도") + 관리자 화면 '설치 파일' 칸(올리기)
4. 올리기는 관리자가 웹앱에서 zip을 고른다(service role 키를 두지 않으므로 자동 올리기 없음). 새 판마다 Claude가 바탕화면 `도우미-설치파일` 폴더에 zip을 놓아 둔다
5. 예전 판은 지우지 않는다. 받기 단추는 가장 높은 판을 준다
6. 설치 순서 글(압축 풀기·install.cmd·개발자 모드)은 지금 그대로다. 단추만 바뀐다

## 요구사항

### REQ-5101: 보관함과 권한 (SQL `20261117000000_install_files.sql`)
- AC-5101.1: Given 새 SQL, When 두 번 돌리면, Then 오류 없이 Storage 버킷 `install-files`가 비공개·한 파일 5,000,000바이트·`application/zip`만으로 있다
- AC-5101.2: Given 버킷의 파일, When 승인된 병원 사용자나 관리자가 읽으면(목록·받기) 되고, 승인 전·거절된 사용자와 anon은 한 줄도 못 읽는다
- AC-5101.3: Given 올리기, When 관리자가 `helper/precheck-helper-X.Y.Z.zip`·`extension/precheck-extension-X.Y.Z.zip` 모양 이름으로 넣으면 되고, 관리자가 아니거나 이름 모양이 다르면(폴더와 종류가 다름 포함) 거절된다. 고치기·지우기는 누구도 못 한다

### REQ-5102: 목록·받기·올리기 함수 (`src/lib/storage/installFiles.ts`)
- AC-5102.1: Given `parseInstallName(name)`, When `precheck-helper-0.9.0.zip`이면 `{kind:'helper', version:[0,9,0]}`, `precheck-extension-0.3.0.zip`이면 extension, 그 밖은 null이다. 판 견주기는 숫자로 한다(0.10.0 > 0.9.0)
- AC-5102.2: Given `latestInstallFiles()`, When 두 폴더를 읽으면, Then 종류마다 가장 높은 판 `{kind, version, name, path, size, uploadedAt}` 또는 null이다. 이름 모양이 틀린 파일은 무시한다. `installMeta(file)`은 '0.9.0 · 0.9MB · 11월 17일 올림' 모양(1MB 이상 소수 한 자리 MB·아래는 KB 버림, 한국 날짜)이다. 읽기 실패는 `InstallFilesError('E-INSTALL-READ-FAILED')`
- AC-5102.3: Given `downloadInstallFile(file)`, When 받으면, Then 보관함에서 받은 파일을 원래 이름으로 저장시키고(임시 주소는 바로 거둠) 실패는 `E-INSTALL-DOWNLOAD-FAILED`다
- AC-5102.4: Given `uploadInstallFile(file)`, When 이름 모양이 틀리면 `E-INSTALL-FILE-NAME`, 5,000,000바이트를 넘으면 `E-INSTALL-FILE-SIZE`(둘 다 네트워크 없이), 같은 이름이 이미 있으면 `E-INSTALL-FILE-EXISTS`, 그 밖 실패는 `E-INSTALL-UPLOAD-FAILED`다. 올릴 때 `contentType: 'application/zip'`, `upsert: false`

### REQ-5103: 받기 단추 (비트 PC 연결 화면·설정 탭)
- AC-5103.1: Given 비트 PC 연결 화면, When 도우미·확장 단계나 옛 판 경고의 받기 단추([도우미 내려받기]·[확장 내려받기]·[새 도우미 내려받기])를 그리면, Then 웹앱 받기 단추이고 옆에 '판 · 크기 · M월 D일 올림'이 보인다. 파일이 없으면 단추는 눌리지 않고 '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'가 보인다. 웹스토어 주소가 있을 때의 [확장 설치하러 가기]는 그대로다. `src/`에 GitHub 릴리스 주소가 남지 않는다
- AC-5103.2: Given 설정 탭, When 열면, Then 맨 위에 '비트 PC 연결 · 설치 파일' 칸(설명 글, 크롬 확장·도우미 두 줄: 이름·설명·지금 판·크기·[확장 내려받기]·[도우미 내려받기] 보조 단추, 아래 '비트 PC 연결 확인하러 가기 →' 링크(`/claim/setup`))이 있다
- AC-5103.3: Given 받기 실패, When 단추를 누른 뒤 실패하면, Then `E-INSTALL-DOWNLOAD-FAILED` 안내(무엇이·어떻게·번호)가 단추 가까이에 보인다. 목록 읽기 실패면 `E-INSTALL-READ-FAILED` 안내다

### REQ-5104: 관리자 '설치 파일' 칸
- AC-5104.1: Given 관리자 화면(/admin), When 열면, Then 가입 신청 위에 '설치 파일' 칸(설명 글, 도우미·크롬 확장 두 줄: 지금 판·크기·올린 날·[새 파일 올리기], 아래 안내 글)이 있다. 파일 고르기는 `.zip`만 보인다
- AC-5104.2: Given [새 파일 올리기], When 파일을 고르면, Then `uploadInstallFile`을 부르고 그동안 그 단추는 '올리는 중…'으로 눌리지 않는다. 성공하면 '{도우미|크롬 확장} {판}을 올렸어요' 상자와 목록이 새로 보이고, 실패면 errors.ts 안내와 번호가 보인다
