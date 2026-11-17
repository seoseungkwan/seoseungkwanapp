# 작업 분할: 업무일지 탭을 주요 탭 줄 수납일지 왼쪽으로

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: MENU 차례와 primary
- Phase: 1
- AC: AC-5801.1, AC-5801.2, AC-5801.3
- REQ: REQ-5801
- Files: src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/MoreMenu.tsx, src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/shell/shell.test.tsx
- TDD: required
