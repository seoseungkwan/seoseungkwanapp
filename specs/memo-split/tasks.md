# 작업 분할: 비트에 입력 — 환자별 두 칸 보기와 복사(완료)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다.
>
> **할 순서**: Phase 1(TASK-1 ‖ TASK-2) → Phase 2(TASK-3 ‖ TASK-4, 그다음 TASK-5 ‖ TASK-6) → Phase 3(TASK-7). 같은 Phase 안에서 파일이 겹치지 않는 것은 일꾼 둘까지 동시에(각자 worktree).
> 검토는 끝에 한 번(전체 시험·lint·build·1440px 화면 사진 포함). 도우미·확장·서버·DB·`OutsideCounts`·`ResultStep`은 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 화면 목업 `docs/mockups/memo-split/index.html`(시안 4)은 사용자와 네 번 다듬었다. 이 명세 승인을 목업 승인으로도 본다
2. 사용자가 `/sdd approve memo-split`을 입력한다

## TASK-1: 목록 줄의 완료와 자리 지키기
- REQ: REQ-3104
- AC: AC-3104.4, AC-3104.5
- Files: src/types/precheck.ts, src/lib/precheck/inputTargets.ts, src/lib/precheck/inputTargets.test.ts
- Tests: src/lib/precheck/inputTargets.test.ts
- TDD: required — `TargetRow.done`, `TargetContext.keep`, keep인 완료 줄은 같은 묶음, `replacing`·`MAX_BATCH`·0명 안내는 완료를 뺌. `PrecheckFromScreen`에 `memoCopied`·`memoUndone` 모양만 더한다
- 차례: Phase 1

## TASK-2: 클립보드 복사
- REQ: REQ-3103
- AC: AC-3103.1, AC-3103.3
- Files: src/components/claim/memo/copyMemo.ts, src/components/claim/memo/copyMemo.test.ts
- Tests: src/components/claim/memo/copyMemo.test.ts
- TDD: required — `navigator.clipboard` 성공·거절·없음, 예비 `execCommand` 성공·실패, 오류를 밖으로 내지 않음
- 차례: Phase 1

## TASK-3: Worker — 복사 완료·완료 풀기
- REQ: REQ-3104
- AC: AC-3104.1, AC-3104.2, AC-3104.4, AC-3104.5, AC-3104.7
- Files: src/workers/precheck/jobs.ts, src/workers/precheck/jobs.test.ts, src/components/claim/claimLoad.ts
- Tests: src/workers/precheck/jobs.test.ts
- TDD: required — `memoCopied`(글 같음·다름·확인 표시·이미 완료), `memoUndone`(완료 표시·같음·완료 아님), 보낸 store.save의 `done` 칸, `copiedNow`가 보기에서만 자리를 지키고 입력 묶음에는 들지 않음, `loadStart`에서 비움, 다시 불러온 store.load로 완료가 남음
- 차례: Phase 2 (TASK-1 뒤)

## TASK-4: 환자 줄 화면 — 목록과 상세
- REQ: REQ-3101, REQ-3103, REQ-3105, REQ-3107
- AC: AC-3101.1~AC-3101.4, AC-3101.7, AC-3103.2, AC-3103.3, AC-3103.5~AC-3103.8, AC-3104.3, AC-3104.6, AC-3105.1~AC-3105.5, AC-3107.3
- Files: src/components/claim/rows/leftGroups.ts, src/components/claim/rows/MemoList.tsx, src/components/claim/rows/MemoList.test.tsx, src/components/claim/rows/MemoDetail.tsx, src/components/claim/rows/MemoDetail.test.tsx, src/components/claim/rows/StuckBand.tsx
- Tests: src/components/claim/rows/MemoList.test.tsx, src/components/claim/rows/MemoDetail.test.tsx
- TDD: required — props로만 그리는 것: 묶음 머리·줄(환자 정보만)·상태 표 글자·고른 줄 `aria-current`, 상세 머리·단추 줄·상태 줄 글(CopyStatus마다)·두 칸·증상/처방 표·고치는 칸. `StuckBand`는 `LEFT_GROUPS` import 줄만 바꾼다
- 차례: Phase 2 (TASK-1 뒤, TASK-3과 동시)

## TASK-5: 목록 펼치기·옮기기·키
- REQ: REQ-3101, REQ-3102, REQ-3103
- AC: AC-3101.2, AC-3101.5, AC-3101.6, AC-3101.8, AC-3102.2~AC-3102.4, AC-3103.5~AC-3103.8
- Files: src/components/claim/memo/memoSplit.ts, src/components/claim/memo/memoSplit.test.ts, src/components/claim/memo/useSplitKeys.ts, src/components/claim/memo/useSplitKeys.test.tsx
- Tests: src/components/claim/memo/memoSplit.test.ts, src/components/claim/memo/useSplitKeys.test.tsx
- TDD: required — `listGroups`(차례·보기·stayKey), `showCounts`, `neighbor`, `keepOrFirst`, `copyStatus` 차례, `canCopy`; 키: ↑↓·C(한글 자판 `code`)·반복·글 칸·동그라미·Ctrl/Alt/⌘·꺼짐
- 차례: Phase 2 (TASK-4 뒤에 TASK-6과 동시. `ListGroup`·`CopyStatus` 모양을 TASK-4에서 가져온다)

## TASK-6: 입력 방식 한 줄·처음 값
- REQ: REQ-3106
- AC: AC-3106.2, AC-3106.3
- Files: src/components/claim/memo/InputMode.tsx, src/components/claim/memo/InputMode.test.tsx
- Tests: src/components/claim/memo/InputMode.test.tsx
- TDD: required — 라벨·동작은 그대로 한 줄 모양, children 없음, `defaultSelection`이 날짜별·기간·불러온 기간 전체. 처방코드별을 전제로 한 시험은 먼저 처방코드별을 고르게 고친다
- 차례: Phase 2 (TASK-5와 동시)

## TASK-7: 메모 칸 잇기 — 두 칸·복사·완료 풀기·메모 표 없애기
- REQ: REQ-3101, REQ-3102, REQ-3103, REQ-3104, REQ-3105, REQ-3106, REQ-3107
- AC: AC-3101.1, AC-3101.5, AC-3101.6, AC-3101.8, AC-3102.1, AC-3102.3, AC-3102.5, AC-3103.1~AC-3103.4, AC-3103.6, AC-3103.7, AC-3104.5, AC-3104.6, AC-3105.6, AC-3106.1, AC-3106.4, AC-3107.1, AC-3107.2, AC-3107.3
- Files: src/components/claim/memo/MemoPanel.tsx, src/components/claim/memo/MemoPanel.test.tsx, src/components/claim/rows/MemoRows.tsx, src/components/claim/rows/MemoRows.test.tsx, src/components/claim/rows/MemoTable.tsx, src/components/claim/rows/MemoTable.test.tsx
- Tests: src/components/claim/memo/MemoPanel.test.tsx
- TDD: required — 가짜 Worker·가짜 클립보드로: 처음 맨 위 사람·[전체], 줄 누름·↑↓, 처음 고를 때만 claim.memos 한 번, C·단추 → 클립보드 글·`memoCopied` 보냄·상태 줄, 실패면 보내지 않음·'✕ 복사 못 함' 남음, 느린 복사 중 옮겨도 누른 사람에게, [완료 풀기] → `memoUndone`, 고치면 '완료가 풀렸어요', `focusKey`·[먼저 고치기]는 그 사람 고치는 칸, [비트에 입력 (N명)]은 완료 뺀 수, 메모 표 없음. AC-3107.2의 대신하는 시험은 새 AC 이름으로 바꾸고, `MemoRows`·`MemoTable` 파일과 시험은 지운다(`git rm`)
- 차례: Phase 3 (TASK-1~TASK-6 뒤)
