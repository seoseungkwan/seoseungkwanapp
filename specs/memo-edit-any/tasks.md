# 작업 분할: 어느 메모든 고치기 (완료·같음 메모도 고치고, 목록의 메모 줄마다 [메모 고치기])

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1 · TASK-3 · TASK-4 병렬) → Phase 2(TASK-2, TASK-1의 `entered`를 쓴다). 같은 Phase끼리 파일이 겹치지 않는다.
> 검토는 끝에 한 번. 전체 검사(`tsc`·lint·vitest, `src/guardrails.test.ts` 포함)와 390·1440px 화면 사진은 Phase 2 끝에 한다.
> 시험 자료는 모두 지어낸 값이다. `helper/**`·`extension/**`·`src/lib/bridge/**`·`MemoPanel.tsx`는 고치지 않는다(design.md '도우미 영향'). 지금 시험의 기대값은 바꾸지 않는다(예외는 AC-2204.3의 시험 이름 하나).

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 design.md '화면 목업'을 승인한다. 승인 전에는 TASK-3·TASK-4(화면 코드)를 시작하지 않는다
2. 사용자가 `/sdd approve memo-edit-any`를 입력한다

## TASK-1: 방금 넣은 글로 견주기 (memoCompare)
- REQ: REQ-2202
- AC: AC-2202.3(비교 재료)
- Files: src/lib/precheck/memoCompare.ts, src/lib/precheck/memoCompare.test.ts
- Tests: src/lib/precheck/memoCompare.test.ts
- TDD: required — `MemoSource`에 선택 칸 `entered` 하나만 더한다. `visitMemos`는 그 칸에 있는 사람이면 받은 비트 메모 대신 그 글과 견주고(4,000자를 넘으면 읽지 못한 것), 없으면 지금 그대로다. `compareMemo`·`bitMemoOf`·`replacesOf`·`inputPlan`과 C# 사례 파일은 바꾸지 않는다
- 차례: Phase 1

## TASK-2: 고치면 완료 풀기 (Worker)
- REQ: REQ-2202, REQ-2204
- AC: AC-2202.1~AC-2202.8, AC-2204.1, AC-2204.3(jobs.test.ts 기대값 그대로)
- Files: src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts
- Tests: src/workers/precheck/jobs.test.ts
- TDD: required — design.md '구성 요소'의 jobs.ts 줄 그대로: `loadStore`의 done false → `released`, `finishedKeys`에서 released 빼기, `editMemo`가 완료한 사람이면 풀기(store.save 한 번에 drafts·done), `unsaved`의 `release`와 `applyUnsaved`, `afterEntry`를 Map으로, '완료' 끝 답에서 released 지우기, `memoRows`가 released ∩ afterEntry만 `entered`로 넘김. 새 메시지·새 명령·새 칸 없음
- 차례: Phase 2 (TASK-1 뒤)

## TASK-3: 메모 표 칸 (MemoTable)
- REQ: REQ-2201, REQ-2204
- AC: AC-2201.1, AC-2201.2, AC-2201.3, AC-2204.2
- Files: src/components/claim/rows/MemoTable.tsx, src/components/claim/rows/MemoTable.test.tsx
- Tests: src/components/claim/rows/MemoTable.test.tsx
- TDD: required — 새 시험 파일(jsdom, 줄은 props로만). `readOnly={locked}` 하나로 바꾸고, `locked`면 칸 모양을 `ds.readonly`로. 칩·'지난 입력'·[아직 입력 안 된 것만]은 지금 그대로. 새 import 없음
- 차례: Phase 1

## TASK-4: 목록의 [메모 고치기] (MemoRows)
- REQ: REQ-2203, REQ-2204
- AC: AC-2203.1~AC-2203.4, AC-2204.2, AC-2204.3(시험 이름 하나)
- Files: src/components/claim/rows/MemoRows.tsx, src/components/claim/rows/MemoRows.test.tsx
- Tests: src/components/claim/rows/MemoRows.test.tsx
- TDD: required — `editable` = `hasMemo`이고 `isBlankMemo`가 아님(`@/lib/precheck/memoCompare`, 이 파일의 새 import는 이것 하나). 줄마다 단추 줄 하나(지금 단추 + [메모 고치기], `disabled={locked}`), 고치는 줄은 [메모 고치기] 자리에 지금 `Editor`. `LEFT_GROUPS` 글·[다시 하기 (N명)]·다른 단추의 막힘은 그대로. 지금 시험은 140행 이름의 '[바꾸지 않기]만'을 '[바꾸지 않기]·[메모 고치기]만'으로 고치는 것 말고는 손대지 않는다
- 차례: Phase 1
