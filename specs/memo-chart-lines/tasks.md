# 작업 분할: 청구 메모 목록에 증상·처방내역(총투여량)을 한 줄씩

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1 · TASK-2 · TASK-3 병렬, 파일이 겹치지 않음. 모양은 design.md '구성 요소'에 못 박음) → Phase 2(전체 검사 + 검토 한 번).
> 시험 자료는 모두 지어낸 값이다. `helper/**`·`extension/**`·`src/lib/bridge/**`는 고치지 않는다. 지금 시험의 기대값은 바꾸지 않는다(AC-2603.3).

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 design.md '화면 목업'(`docs/mockups/precheck/memo-chart-lines.html`)을 승인한다
2. 사용자가 `/sdd approve memo-chart-lines`를 입력한다

## TASK-1: 목록 줄에 증상 줄·처방내역 싣기 (Worker)
- REQ: REQ-2601, REQ-2603
- AC: AC-2601.1, AC-2601.2, AC-2601.3, AC-2603.1, AC-2603.3
- Files: src/types/precheck.ts, src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/lib/precheck/inputTargets.test.ts
- Tests: src/workers/precheck/jobs.test.ts
- TDD: required — design.md 그대로: `memoViews` 선택 인자 `kinds`, `kindsCache`, `targetVisits`의 `chartLines`·`rxRows`. `inputTargets.test.ts`는 줄 자료에 빈 새 칸만 더한다
- 차례: Phase 1

## TASK-2: 열린 줄에 증상·처방내역 칸 (MemoRows)
- REQ: REQ-2602, REQ-2603
- AC: AC-2602.1, AC-2602.2, AC-2602.3, AC-2602.4, AC-2603.2
- Files: src/components/claim/rows/MemoRows.tsx, src/components/claim/rows/MemoRows.test.tsx
- Tests: src/components/claim/rows/MemoRows.test.tsx
- TDD: required — 줄은 props로만, 새 import 없음
- 차례: Phase 1

## TASK-3: [메모 고치기]가 줄도 연다 (MemoPanel)
- REQ: REQ-2602, REQ-2603
- AC: AC-2602.5, AC-2603.3
- Files: src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx
- Tests: src/components/claim/memo/MemoPanel.test.tsx
- TDD: required — `onEdit`에서 `setEditing`과 함께 그 줄을 `open`에 더한다. 시험 줄 자료에 새 칸만 더한다
- 차례: Phase 1

## Phase 2: 전체 검사·검토 (코드 작업 아님)
- `npx tsc --noEmit`·`npm run lint`·`npm test`(`src/guardrails.test.ts` 포함). CRLF 탓으로 이 PC에서만 실패하는 시험 10개는 LF 사본에서 확인한다
- `harness-reviewer` 검토 한 번
