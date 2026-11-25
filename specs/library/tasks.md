# 작업 분할: 자료실 탭

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** Phase 1은 명세 승인 뒤, Phase 2는 Phase 1을 합친 뒤, Phase 3(독립 검토 고침)은 Phase 2를 합친 뒤 시작한다.
> MVP 모드: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일만 돌리고, 마지막에 전체 검사 → 독립 검토 한 번(재검토는 사용자에게 묻고).
> 화면 글자·자리·모양은 승인된 시안(`docs/mockups/library/index.html`·`notes.md`, 2026-11-25)과 requirements.md '화면 글자' 그대로다. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21) — 새로 쓰는 화면 코드에 `max-md:` 같은 폰 폭 클래스를 쓰지 않는다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | DB: 표 `library_files`·바구니 `library` SQL + RLS 시험 + ADR-051·ARCHITECTURE |
> | 1 | TASK-2 | 순수 함수 `lib/library/files.ts` · 저장 함수 `lib/storage/library.ts` · E-LIBRARY- 번호 일곱 |
> | 2 | TASK-3 | 자료실 화면 `components/library/**`(표·올리기 창·지우기 창·알림) + `/library` 페이지 |
> | 2 | TASK-4 | 탭 자리: `LIBRARY_TAB`·[더보기] 판·데스크 탭 띠·데스크 주소 |
> | 2 | TASK-5 | 설정·관리자 옛 '설치 파일' 칸 → 작은 칸 · 받기 단추를 자료실로 · 옛 올리기 번호 넷 지우기 |
> | 3 | TASK-6 | 받기 이름 고침(독립 검토): `createSignedUrl`에 download 옵션 빼고 주소에 `download=파일 이름` 한 번 붙임 |
>
> - 같은 Phase 파일 겹침 확인: Phase 1 — TASK-1은 `supabase/`·`docs/`, TASK-2는 `src/lib/library/`·`src/lib/storage/library*`·`src/lib/errors*`·`src/types/errors.ts` → 겹침 없음. Phase 2 — TASK-3 `src/components/library/**`·`src/app/(app)/library/`·`src/app/titles.test.tsx`·`src/app/notFound.test.tsx`, TASK-4 `src/components/shell/`의 다섯 시험·세 소스·`src/app/(app)/tabFrame.test.tsx`·`src/app/(app)/layout.test.tsx`, TASK-5 `src/components/settings/`의 칸·시험·`src/components/admin/InstallFilesAdmin*`·`src/app/(app)/admin/`·`src/lib/storage/installFiles*`·`src/components/install/`·`src/components/claim/setup/SetupScreen.test.tsx`·`src/lib/errors*`·`src/types/errors.ts`·`supabase/deskInstallFiles.rls.test.ts` → 겹침 없음(`supabase/deskInstallFiles.rls.test.ts`는 TASK-5만 고친다 — TASK-1은 본보기로 읽기만). (`src/lib/errors*`는 TASK-2(Phase 1)와 TASK-5(Phase 2)만 — Phase가 다르다)
> - Phase 2의 셋은 서로 부르지 않는다: TASK-3 화면은 메뉴를 몰라도 되고, TASK-4 메뉴는 `/library` 페이지 파일을 보지 않으며(페이지 파일 있음·탭 이름은 TASK-3의 `titles.test`·`notFound.test`), TASK-5의 작은 칸은 `/library`로 가는 링크 글자만 쓴다
> - 다른 갈래와 겹칠 수 있는 파일: `docs/ADR.md`(번호 051 — 050은 erp-uisarang), `src/lib/errors.ts`·`src/types/errors.ts`, 메뉴 고정 시험들. 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다
> - **마무리(TASK 아님, 모두 합친 뒤 한 번)**: 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 앞 명세의 known-failures와 견줌) → 화면 확인(ssk-screen-check: 로그인 없는 하네스, 지어낸 파일 목록, PC 폭 1440·1024만, 시안 `?s=user`·`admin`·`upload`·`uploading`·`too-big`·`done`·`delete`·`empty`·`error`·`settings`·`admin-tab`·`menu`·`desk`와 견줌 — 폰 폭 사진은 찍지 않는다) → 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것은 위 TASK의 Files 안에서만 고치고, 그 밖이면 명세를 고친 뒤 한다
> - **사용자 단계**: design.md '배포 순서' — (1) `/sdd approve library` (2) 배포 전 `supabase/migrations/20261125000000_library.sql`을 Supabase SQL Editor에 붙여 넣고 바구니 Private·전체 올리기 한도 50MB 이상 확인 (3) 배포 (4) 배포 바로 뒤 관리자가 지금 도우미·확장 zip을 자료실에 올리기 (5) 한글 이름 파일 받기 확인. Claude는 실제 Supabase에 붙지 않는다. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다. 도우미·확장 새 판은 없다

## TASK-1: DB — 자료실 표·바구니·ADR-051
- Phase: 1
- AC: AC-8101.1, AC-8101.2, AC-8101.3, AC-8101.4, AC-8101.5, AC-8101.6
- REQ: REQ-8101
- Files: supabase/migrations/20261125000000_library.sql, supabase/library.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md
- Tests: supabase/library.rls.test.ts
- TDD: required — design.md 'SQL'(표 칸·제약·권한·정책 셋, 바구니·`storage.objects` 정책 셋, 고치기 없음)·'시험'. SQL은 Write 도구로 쓴다(두 번 실행 안전: `create table if not exists` · `on conflict (id) do update` · `drop policy if exists` 뒤 `create policy`, RLS → revoke → 필요한 권한만, 함수는 만들지 않음, `tab_access`·`install-files`는 건드리지 않음, 줄 끝 LF, 머리 주석에 무엇·실행·먼저·두 번·관문·`REQ-8101`·`ADR-051`). 시험은 `supabase/deskInstallFiles.rls.test.ts`처럼 PGlite에서 진짜 migration 사슬을 차례로 돌린다(사람 여덟, 메일은 지어낸 것). `docs/ADR.md` 끝에 design.md 'ADR-051' 글만 더한다(ADR-031 등 지금 글은 고치지 않음 — `deskInstallFiles.rls.test.ts`가 ADR-031 글을 본다), `docs/ARCHITECTURE.md`는 DB 표 한 줄·공용 표 예외 줄·Storage 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 순수 함수·저장 함수·오류 번호
- Phase: 1
- AC: AC-8102.1, AC-8102.2, AC-8102.3, AC-8102.4, AC-8102.5, AC-8102.6, AC-8103.1, AC-8103.2, AC-8103.3, AC-8103.4, AC-8103.5, AC-8103.6, AC-8104.1
- REQ: REQ-8102, REQ-8103, REQ-8104
- Files: src/lib/library/files.ts, src/lib/library/files.test.ts, src/lib/storage/library.ts, src/lib/storage/library.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: src/lib/library/files.test.ts, src/lib/storage/library.test.ts, src/lib/errors.test.ts
- TDD: required — design.md '순수 함수'(시그니처 그대로, 시안 `index.html`의 `verOf`·`guessCat`·`sizeTxt`·`mbTxt`·`dayTxt`·`versionGroups`·`tableBody`와 같은 결과)·'저장 함수'·'오류'. `files.ts`는 React·supabase·네트워크·저장소·시계 없음(`files.test.ts`가 소스 글자로도 본다). 저장 함수 시험은 가짜 supabase client(`supabaseBrowser` 흉내)로 부른 바구니·표·칸·옵션을 그대로 견주고, XHR은 `vi.stubGlobal('XMLHttpRequest', …)`로 진행률·413·400 + 몸통 `statusCode` `'413'`·네트워크 끊김·멈춤(PUT 중·PUT 뒤)을 흉내 낸다. 실패마다 오류에 Supabase 글·파일 내용이 없는지 본다. E-LIBRARY- 일곱의 what·fix는 requirements.md 표 글자 그대로(끝 마침표 있음). E-INSTALL- 번호는 이 TASK에서 건드리지 않는다. `library.ts` 머리 주석에 `데스크`(승인된 의원의 데스크도 받는다)와 `20261125000000_library.sql`을 적는다 — TASK-5가 옮기는 `deskInstallFiles.rls.test.ts` AC-7007.1 시험이 이 글자를 본다

## TASK-3: 자료실 화면·`/library` 페이지
- Phase: 2
- AC: AC-8105.1, AC-8105.2, AC-8105.3, AC-8105.4, AC-8105.5, AC-8105.6, AC-8105.7, AC-8106.1, AC-8106.2, AC-8106.3, AC-8106.4, AC-8106.5, AC-8106.6, AC-8106.7, AC-8106.8, AC-8107.1, AC-8107.2, AC-8107.3
- REQ: REQ-8105, REQ-8106, REQ-8107
- Files: src/components/library/**, src/app/(app)/library/page.tsx, src/app/(app)/library/page.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx
- Tests: src/components/library/LibraryScreen.test.tsx, src/components/library/UploadDialog.test.tsx, src/components/library/DeleteDialog.test.tsx, src/app/(app)/library/page.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx
- TDD: required — design.md '화면'(`LibraryScreen`·`useLibrary`·`LibraryTable`·`UploadDialog`·`DeleteDialog`·알림·그림·페이지), requirements.md '화면 글자' 글자·자리·모양 그대로(**승인 시안 `docs/mockups/library/index.html`을 열어 상태마다 견준다**: user·admin·upload·uploading·too-big·done·delete·empty·error). `lib/storage/library.ts`를 흉내 내고(목록·받기·올리기의 `onProgress`·`signal`·`LibraryStopped`·지우기), 줄 만들기·글자·검사는 TASK-2의 `lib/library/files.ts`를 쓴다(고치지 않음). 보는 중은 `ViewingProvider`로 감싸 [파일 올리기]·[지우기]·표 아래 줄이 없고 [받기]는 있음을 본다. 페이지 시험은 `../currentMe.server`를 흉내 내 관리자·관리자 아닌 원장·데스크의 `isAdmin` 값과 metadata.title `자료실`을 본다. `titles.test.tsx`는 앱 페이지 표에 `/library`(`자료실`)를 더하고 MENU 밖 주소 목록·수(18 → 19)만 맞춘다, `notFound.test.tsx`는 라우트 표에 `/library` 한 줄. 표 감싸개 `overflow-x: auto`, 폰 폭 클래스 없음. `lib/library`·`lib/storage`·메뉴·설정 파일은 고치지 않는다

## TASK-4: 탭 자리 — `LIBRARY_TAB`·[더보기]·데스크
- Phase: 2
- AC: AC-8108.1, AC-8108.2, AC-8108.3, AC-8108.4
- REQ: REQ-8108
- Files: src/components/shell/menu.ts, src/components/shell/MoreMenu.tsx, src/components/shell/TabBar.tsx, src/components/shell/shell.test.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/shell/tabAccess.test.ts, src/components/shell/DeskGate.test.tsx, src/components/shell/viewShell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/layout.test.tsx
- Tests: src/components/shell/shell.test.tsx, src/components/shell/hiddenTabs.test.tsx, src/components/shell/tabAccess.test.ts, src/components/shell/DeskGate.test.tsx, src/components/shell/viewShell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/layout.test.tsx
- TDD: required — design.md '메뉴'. 승인 시안 `?s=menu`(원장·관리자 판 차례)·`?s=desk`(데스크 탭 띠 넷)와 견준다. `LOCATION_TAB`처럼 MENU 밖 상수(MENU·`DASHBOARD_FEATURES`·`NOT_READY_FEATURES`·`TAB_ACCESS_MENU`·`PREVIEW_TABS` 그대로 — `tabFrame.test.tsx`에 입지 분석 시험과 같은 모양의 자료실 시험 하나), [더보기] 판은 설정 바로 앞에 끼우고 머리 수가 하나 는다(원장 7·관리자 8 — 수를 고정한 지금 시험은 수와 자료실 칸만 맞춘다), 숨긴 탭이 있어도 남음, 데스크 `DESK_TABS`·`isDeskPath('/library')`(DESK_MENU 셋·`deskHomeOf`·`DESK_HOME`·막힌 화면 글은 그대로 — 지금 시험 그대로 지나야 한다. 단 데스크 탭 띠 글자를 고정한 시험은 끝에 `자료실`이 붙는다: `shell.test.tsx`의 데스크 탭 띠 시험들, `src/app/(app)/layout.test.tsx` 약 250줄 `['업무일지', '수납일지', '예약']` → `[…, '자료실']`·약 373줄 수납일지 숨김 `['업무일지', '예약']` → `['업무일지', '예약', '자료실']`), 보는 중 판에 자료실·`/library` 안 막힘. `lib/auth/gate.ts`·`DeskGate.tsx`·`TabGate.tsx`·`ViewGate.tsx`·`AppShell.tsx`는 고치지 않는다

## TASK-5: 설치 파일 칸 둘을 작은 칸으로 · 받기 단추를 자료실로
- Phase: 2
- AC: AC-8109.1, AC-8109.2, AC-8109.3, AC-8109.4
- REQ: REQ-8109
- Files: src/components/settings/InstallFilesCard.tsx, src/components/settings/InstallFilesCard.test.tsx, src/components/settings/viewMode.test.tsx, src/components/settings/SettingsPage.tsx, src/components/admin/InstallFilesAdmin.tsx, src/components/admin/InstallFilesAdmin.test.tsx, src/app/(app)/admin/page.tsx, src/app/(app)/admin/page.test.tsx, src/lib/storage/installFiles.ts, src/lib/storage/installFiles.test.ts, src/components/install/DownloadButton.tsx, src/components/install/DownloadButton.test.tsx, src/components/install/useInstallFiles.ts, src/components/claim/setup/SetupScreen.test.tsx, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts, supabase/deskInstallFiles.rls.test.ts
- Tests: src/components/settings/InstallFilesCard.test.tsx, src/components/settings/viewMode.test.tsx, src/components/admin/InstallFilesAdmin.test.tsx, src/app/(app)/admin/page.test.tsx, src/lib/storage/installFiles.test.ts, src/components/install/DownloadButton.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/lib/errors.test.ts, supabase/deskInstallFiles.rls.test.ts
- TDD: required — design.md '설정·관리자 칸과 받기 단추'. 두 작은 칸은 **승인 시안 `?s=settings`·`?s=admin-tab`의 `.mini-card`** 글자·모양 그대로(h2 `설치 파일`·글 한 줄·[자료실 열기 →] `/library` 링크, 목록 읽기 없음, 폰 폭 클래스 없음). `installFiles.ts`는 TASK-2의 `listLibraryFiles`·`downloadLibraryFile`·`latestOfKind`·`versionOf`·`sizeText`·`dayText` 위의 얇은 잇기로 다시 쓰고(내보내는 이름·`InstallFile` 모양 그대로, `uploadInstallFile`·바구니 `install-files` 지움), `src/`에 `install-files` 바구니를 부르는 코드가 없음을 시험한다. `DownloadButton.tsx`·`useInstallFiles.ts`는 주석만 고칠 수 있다(코드 그대로). 시험은 옆 글 크기 기대값(예 `889KB` → `869KB`)과 설정 칸 기대(`viewMode.test.tsx`의 설치 파일 [받기] → [자료실 열기] 링크)만 맞추고, `admin/page.test.tsx` 차례 시험(h1 `가입 승인` → h2 `설치 파일`)은 그대로 지나야 한다. 번호 넷(E-INSTALL-FILE-NAME·FILE-SIZE·FILE-EXISTS·UPLOAD-FAILED)을 `errors.ts`·`types/errors.ts`·`errors.test.ts`에서 지우고 E-INSTALL-READ-FAILED·DOWNLOAD-FAILED 글은 그대로 둔다. `supabase/deskInstallFiles.rls.test.ts`의 AC-7007.1 '머리 주석' 시험(약 522~527줄)은 지우지 않고 기대 자리만 옮긴다(까닭: 이 명세 — 데스크가 받는 길이 자료실로 바뀜): `installFiles.ts` 주석의 `데스크`·`20261119200000_desk_install_files.sql` 기대 → `src/lib/storage/library.ts` 주석의 `데스크`·`20261125000000_library.sql`(TASK-2가 써 둔 머리 주석), `DownloadButton.tsx` 주석의 `데스크` 기대는 그대로. 시험 이름에 `AC-7007.1`과 `AC-8109.4`를 함께 적는다. 이 파일의 다른 시험(ADR-031 글 등)은 고치지 않는다 — 이 파일을 고치는 TASK는 TASK-5 하나뿐이다. `lib/library`·`lib/storage/library.ts`·`StepGuide.tsx`·`SetupScreen.tsx`는 고치지 않는다

## TASK-6: 받기 이름 고침 — 서명 주소에 `download` 한 번만 붙이기
- Phase: 3
- AC: AC-8103.2
- REQ: REQ-8103
- Files: src/lib/storage/library.ts, src/lib/storage/library.test.ts
- Tests: src/lib/storage/library.test.ts
- TDD: required — 독립 검토가 찾음: `createSignedUrl(storagePath, 60, { download: fileName })`은 storage-js 2.117.3이 이름을 두 번 바꿔 적어(URLSearchParams 뒤 주소 전체 `encodeURI`) 한글·`+ # & %` 이름이 깨진다. design.md '저장 함수' 받기 그대로: `createSignedUrl(storagePath, 60)`(옵션 없음, 60초 그대로) → http(s) 검사 그대로 → `const u = new URL(signedUrl); u.searchParams.set('download', fileName)` → 링크 href = `u.toString()`. 새 시험은 가짜 client가 아니라 진짜 `StorageClient`(`@supabase/supabase-js`가 내보내는 것을 먼저 쓰고, 없으면 `@supabase/storage-js`)에 가짜 fetch를 넣어 부르고, `new URL(href).searchParams.get('download')`가 `청구 도우미 설명서.pdf`·`+ # & %`가 든 이름과 같음을 본다(시험 이름에 AC-8103.2). 지금 AC-8103.2 시험의 옵션 기대(`{ download: … }`)는 옵션 없음으로 맞추고, 같은 시험의 링크 href 기대(`href: SIGNED_URL`, 고정 주소에 `&download=x`가 들어 있음)도 `download`가 파일 이름으로 덮어써진 주소로 맞춘다(고정 주소의 `&download=x`는 그대로 두어 덮어쓰는지 본다). 다른 저장 함수·오류 글·머리 주석(`데스크`·`20261125000000_library.sql`)은 고치지 않는다
