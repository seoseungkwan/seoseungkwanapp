# 작업 분할: 비트 PC 청구 화면에서 고른 기간의 날짜를 완료로 저장

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다.
>
> **할 순서**: Phase 1(TASK-1) → Phase 2(TASK-2). 작아서 일꾼 없이 차례로 한다. 검토는 끝에 한 번(전체 검사·build·1440px 화면 사진 포함).
> `OutsideCounts.tsx`·저장소·마이그레이션·도우미는 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 화면 목업 `docs/mockups/claim-day-done-pc/index.html`의 '나'는 사용자가 2026-11-08 "나"로 골랐다. 이 명세 승인을 목업 승인으로도 본다
2. 사용자가 `/sdd approve claim-day-done-pc`를 입력한다

## TASK-1: 줄에 바꾼 시각 싣기·고른 기간의 덜 끝난 날
- REQ: REQ-2901, REQ-2902
- AC: AC-2901.1(N 세기), AC-2902.1(closedAt)
- Files: src/components/claim/dateList.ts, src/components/claim/dateList.test.ts
- Tests: src/components/claim/dateList.test.ts
- TDD: required — `DateRow.closedAt`, `buildDateList`·`listRange`가 Map도 받기, `closablePeriodDates`
- 차례: Phase 1

## TASK-2: 비트 PC 화면 — 고르기 줄·저장·알림·되돌리기
- REQ: REQ-2901, REQ-2902, REQ-2903
- AC: AC-2901.1~AC-2901.6, AC-2902.1~AC-2902.3, AC-2903.1~AC-2903.3
- Files: src/components/claim/DateStep.tsx, src/components/claim/ClaimScreen.tsx, src/components/claim/ClaimScreen.test.tsx
- Tests: src/components/claim/ClaimScreen.test.tsx
- TDD: required — design.md 그대로. 가짜 서버에 `claim_day_closes` upsert·delete를 더해 보낸 표·칸·날짜를 본다. AC-2804.5 시험은 AC-2903.2대로 바꾼다
- 차례: Phase 2 (TASK-1 뒤)
