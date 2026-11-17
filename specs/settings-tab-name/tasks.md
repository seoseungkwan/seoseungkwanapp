# 작업 분할: 설정 안쪽 메뉴 이름 '청구'로

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 안쪽 메뉴 이름 '청구'
- Phase: 1
- AC: AC-5201.1, AC-5201.2
- REQ: REQ-5201
- Files: src/components/settings/SettingsPage.tsx, src/components/claim/setup/SetupScreen.tsx, src/app/(app)/settings/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- Tests: src/app/(app)/settings/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required
