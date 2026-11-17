# 작업 분할: 수납일지 다음 예약 종류 직접 만들기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 종류 목록 규칙·장부·Worker·설정 저장
- Phase: 1
- AC: AC-5501.1, AC-5501.2, AC-5501.3, AC-5502.1, AC-5502.2, AC-5502.3, AC-5502.4, AC-5502.5
- REQ: REQ-5501, REQ-5502
- Files: src/types/sunap.ts, src/lib/sunap/kinds.ts, src/lib/sunap/kinds.test.ts, src/lib/sunap/memo.ts, src/lib/sunap/memo.test.ts, src/lib/sunap/ledger.ts, src/lib/sunap/ledger.test.ts, src/lib/sunap/ledgerSort.ts, src/lib/sunap/ledgerSort.test.ts, src/workers/sunap/read.ts, src/workers/sunap/messages.ts, src/workers/sunap/handler.ts, src/workers/sunap/handler.test.ts, src/lib/storage/sunap.ts, src/lib/storage/sunap.test.ts
- Tests: src/lib/sunap/kinds.test.ts, src/lib/sunap/memo.test.ts, src/lib/sunap/ledger.test.ts, src/lib/sunap/ledgerSort.test.ts, src/workers/sunap/handler.test.ts, src/lib/storage/sunap.test.ts
- TDD: required

## TASK-2: 설정 판·고르기·장부·카드·통계 글
- Phase: 2
- AC: AC-5503.1, AC-5503.2, AC-5503.3, AC-5503.4, AC-5503.5, AC-5503.6, AC-5503.7, AC-5503.8
- REQ: REQ-5503
- Files: src/components/sunap/SunapSettings.tsx, src/components/sunap/SunapSettings.test.tsx, src/components/sunap/SunapScreen.tsx, src/components/sunap/SunapScreen.test.tsx, src/components/sunap/SunapCards.tsx, src/components/sunap/RemoteView.tsx, src/components/sunap/RemoteView.test.tsx, src/components/sunap/labels.ts, src/components/sunap/useSunapWorker.ts, src/components/sunap/useSunapWorker.test.ts, src/components/sunap/rows/LedgerRows.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/rows/RsvPicker.tsx, src/components/sunap/rows/SortMenu.tsx, src/components/stats/sections/SunapSection.tsx, src/components/stats/sections/SunapSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/sunap/SunapSettings.test.tsx, src/components/sunap/RemoteView.test.tsx, src/components/sunap/SunapScreen.test.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/useSunapWorker.test.ts, src/components/stats/sections/SunapSection.test.tsx
- TDD: required
