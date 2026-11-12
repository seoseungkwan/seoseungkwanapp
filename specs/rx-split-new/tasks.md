# 작업 분할: 처방별 신환·재진: 우리 병원 첫 방문 날만 신환

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> - 시험 자료는 모두 지어낸 값이다(차트번호는 9로 시작하는 가짜, 처방코드도 가짜). 실제 환자 파일·비트 자료를 열지 않는다
> - 화면 코드(`components/`)는 바꾸지 않는다. 끝나면 `npm run lint`·관련 시험·`npm run build`를 돌린다

## TASK-1: 기간 처방 줄 신환 = 우리 병원 최초 내원일(f)에 받은 처방
- AC: AC-3801.1, AC-3801.2, AC-3801.3, AC-3801.4, AC-3802.1
- REQ: REQ-3801, REQ-3802
- Files: src/lib/analytics/rxVisitSplit.ts, src/lib/analytics/rxVisitSplit.test.ts, src/workers/stats/jobs.test.ts, fixtures/stats/golden/rx-visit-split-summary.json, fixtures/stats/golden/rx-visit-split-text.json, scripts/stats/golden/rx_visit_split.py
- Tests: src/lib/analytics/rxVisitSplit.test.ts, src/workers/stats/jobs.test.ts
- TDD: required
- 할 일: design.md '구성 요소'의 `splitLines`(한 환자 한 번)·`rxVisitSplit`(`row.f === row.d`). AC-3801.1~3801.3·AC-3802.1은 rxVisitSplit.test.ts(골든 견주기가 knownDiffs `cases`를 따르게), AC-3801.4는 jobs.test.ts. 골든 JSON은 머리 `knownDiffs`만 고치고 몸통·`rx-visit-split-days.json`은 그대로. 스크립트는 상수(`SUMMARY_DIFFS`·`TEXT_DIFFS`)에 같은 줄만 더한다. 지금 있는 jobs.test.ts 기대값은 바뀌지 않아야 한다(바뀌면 멈추고 알린다)
