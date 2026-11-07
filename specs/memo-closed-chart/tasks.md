# 작업 분할: 청구 메모 목록 닫힌 줄에 시술 코드×총투여량과 증상 차트

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → TASK-1 → 전체 검사 + 검토 한 번. 화면 파일 하나라 나눌 것이 없다.
> 시험 자료는 모두 지어낸 값이다. `helper/**`·`extension/**`·`src/lib/bridge/**`·`src/workers/**`는 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 사용자가 design.md '화면 목업'(`docs/mockups/precheck/memo-closed-chart.html`)을 승인한다
2. 사용자가 `/sdd approve memo-closed-chart`를 입력한다

## TASK-1: 닫힌 줄에 시술 줄과 증상 칸 (MemoRows)
- REQ: REQ-2604, REQ-2605
- AC: AC-2604.1, AC-2604.2, AC-2604.3, AC-2604.4, AC-2605.1, AC-2605.2, AC-2605.3, AC-2605.4, AC-2605.5
- Files: src/components/claim/rows/MemoRows.tsx, src/components/claim/rows/MemoRows.test.tsx
- Tests: src/components/claim/rows/MemoRows.test.tsx
- TDD: required — 새 시험을 먼저 쓰고 RED를 본다. 기대값을 바꾸는 지금 시험은 AC-2602.3(닫힌 줄 확인)·AC-2602.4 둘뿐이다(AC-2605.5)
- 차례: 1

## 마무리: 전체 검사·검토 (코드 작업 아님)
- `npx tsc --noEmit`·`npm run lint`·`npm test`(`src/guardrails.test.ts` 포함)·`npm run build`. 이 PC에서만 실패하는 시험(C# dotnet·윈도우 경로·CRLF·chmod)은 바꾸기 전 사본과 견준다
- `harness-reviewer` 검토 한 번
