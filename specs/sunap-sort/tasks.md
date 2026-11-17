# 작업 분할: 수납일지 장부 줄 세우기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 줄 세우기 규칙
- Phase: 1
- AC: AC-5301.1, AC-5301.2, AC-5301.3, AC-5301.4
- REQ: REQ-5301
- Files: src/lib/sunap/ledgerSort.ts, src/lib/sunap/ledgerSort.test.ts
- Tests: src/lib/sunap/ledgerSort.test.ts
- TDD: required

## TASK-2: 장부 화면 제목 버튼·다음 예약 목록·안내 줄
- Phase: 2
- AC: AC-5302.1, AC-5302.2, AC-5302.3, AC-5302.4
- REQ: REQ-5302
- Files: src/components/sunap/rows/LedgerRows.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/rows/SortMenu.tsx
- Tests: src/components/sunap/rows/LedgerRows.test.tsx
- TDD: required
