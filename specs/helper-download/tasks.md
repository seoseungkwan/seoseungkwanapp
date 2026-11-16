# 작업 분할: 도우미·확장 웹앱에서 받기

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬, 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 마지막에 전체 검사·검토 한 번.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | SQL·보관함 권한 + 함수·오류 |
> | 2 | TASK-2 | 받기 단추(연결 화면·설정 탭) |
> | 2 | TASK-3 | 관리자 '설치 파일' 칸 |
> | 3 | TASK-4 | 연결 화면 '새 도우미' 줄·GitHub 주소 지우기(구현 중 찾은 빠진 곳) |
>
> - **사용자 단계**: 배포 전 `20261117000000_install_files.sql`을 Supabase SQL Editor에 붙여 넣기 → 배포 뒤 관리자 화면에서 도우미·확장 zip 올리기

## TASK-1: 보관함 SQL + 함수·오류
- Phase: 1
- AC: AC-5101.1, AC-5101.2, AC-5101.3, AC-5102.1, AC-5102.2, AC-5102.3, AC-5102.4
- REQ: REQ-5101, REQ-5102
- Files: supabase/migrations/20261117000000_install_files.sql, supabase/installFiles.rls.test.ts, src/lib/storage/installFiles.ts, src/lib/storage/installFiles.test.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: supabase/installFiles.rls.test.ts, src/lib/storage/installFiles.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 'SQL'·'함수'·'오류'. SQL은 Write 도구로 쓴다

## TASK-2: 받기 단추 (비트 PC 연결 화면·설정 탭)
- Phase: 2
- AC: AC-5103.1, AC-5103.2, AC-5103.3
- REQ: REQ-5103
- Files: src/components/install/**, src/components/claim/setup/StepGuide.tsx, src/components/claim/setup/links.ts, src/components/claim/setup/*.test.tsx, src/components/settings/InstallFilesCard.tsx, src/components/settings/InstallFilesCard.test.tsx, src/components/settings/SettingsPage.tsx
- Tests: src/components/install/DownloadButton.test.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/settings/InstallFilesCard.test.tsx
- TDD: required — design.md '화면'. 순서 글은 고치지 않는다. GitHub 주소를 기대하던 기존 시험(`SetupScreen.test.tsx`)은 새 단추 기대로 바꾸고 보관함 읽기는 가짜로 둔다

## TASK-3: 관리자 '설치 파일' 칸
- Phase: 2
- AC: AC-5104.1, AC-5104.2
- REQ: REQ-5104
- Files: src/components/admin/InstallFilesAdmin.tsx, src/components/admin/InstallFilesAdmin.test.tsx, src/app/(app)/admin/page.tsx, src/app/(app)/admin/page.test.tsx
- Tests: src/components/admin/InstallFilesAdmin.test.tsx, src/app/(app)/admin/page.test.tsx
- TDD: required — design.md '화면'. `src/components/install/**`(TASK-2)는 고치지 않는다(크기·날짜 글자 함수가 필요하면 `src/lib/storage/installFiles.ts`의 것을 쓴다 — TASK-1이 `installMeta(file)`로 '0.9.0 · 0.9MB · 11월 17일 올림' 글자를 함께 만든다)

## TASK-4: 연결 화면 '새 도우미' 줄·GitHub 주소 지우기
- Phase: 3
- AC: AC-5103.4
- REQ: REQ-5103
- Files: src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/links.ts, src/components/claim/setup/SetupScreen.test.tsx, src/components/install/noGithub.test.ts
- Tests: src/components/claim/setup/SetupScreen.test.tsx, src/components/install/noGithub.test.ts
- TDD: required — TASK-2 일꾼이 찾은 빠진 곳: `SetupScreen.tsx`의 `<a href={HELPER_RELEASES_URL}>새 도우미 내려받기</a>`(import 포함) 두 군데만 `DownloadButton kind="helper" variant="secondary"`로 바꾸고, `links.ts`에서 상수를 지우고, `src/`에 GitHub 릴리스 주소가 없음을 시험한다
