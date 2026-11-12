# 작업 분할: 처방별 신환·재진: 우리 병원 첫 방문 날만 신환

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> - 시험 자료는 모두 지어낸 값이다(차트번호는 9로 시작하는 가짜, 처방코드도 가짜). 실제 환자 파일·비트 자료를 열지 않는다
> - 화면 코드(`components/`)는 바꾸지 않는다. 끝나면 `npm run lint`·관련 시험·`npm run build`를 돌린다
> - **보강(2026-11-12, 2차) 할 순서**: TASK-1은 끝났다. TASK-2·TASK-3은 같은 Phase에서 **병렬**이다(고치는 파일이 겹치지 않는다). `src/workers/stats/jobs.test.ts`는 TASK-2만 고친다. 둘 다 합친 뒤 메인 세션이 `npm run lint`·`npm test`·`npm run build`를 돌린다

## TASK-1: 기간 처방 줄 신환 = 우리 병원 최초 내원일(f)에 받은 처방
- AC: AC-3801.1, AC-3801.2, AC-3801.3, AC-3801.4, AC-3802.1
- REQ: REQ-3801, REQ-3802
- Files: src/lib/analytics/rxVisitSplit.ts, src/lib/analytics/rxVisitSplit.test.ts, src/workers/stats/jobs.test.ts, fixtures/stats/golden/rx-visit-split-summary.json, fixtures/stats/golden/rx-visit-split-text.json, scripts/stats/golden/rx_visit_split.py
- Tests: src/lib/analytics/rxVisitSplit.test.ts, src/workers/stats/jobs.test.ts
- TDD: required
- 할 일: design.md '구성 요소'의 `splitLines`(한 환자 한 번)·`rxVisitSplit`(`row.f === row.d`). AC-3801.1~3801.3·AC-3802.1은 rxVisitSplit.test.ts(골든 견주기가 knownDiffs `cases`를 따르게), AC-3801.4는 jobs.test.ts. 골든 JSON은 머리 `knownDiffs`만 고치고 몸통·`rx-visit-split-days.json`은 그대로. 스크립트는 상수(`SUMMARY_DIFFS`·`TEXT_DIFFS`)에 같은 줄만 더한다. 지금 있는 jobs.test.ts 기대값은 바뀌지 않아야 한다(바뀌면 멈추고 알린다)

## TASK-2: 환자 구성 [신환] = 우리 병원 최초 내원일(f) 날의 접수
- AC: AC-3803.1, AC-3803.2, AC-3803.3, AC-3803.4
- REQ: REQ-3803
- Files: src/lib/analytics/patientMix.ts, src/lib/analytics/patientMix.test.ts, src/workers/stats/jobs.test.ts
- Tests: src/lib/analytics/patientMix.test.ts, src/workers/stats/jobs.test.ts
- TDD: required
- 할 일: design.md 보강 '환자 구성' — `countPeriod`의 [신환] 거르기를 `isFirstDayLine(line)`(접수일 = 그 환자의 f)로 바꾸고 머리 주석을 고친다. 명·보험·나이·동네 규칙은 그대로(명 = 거른 접수 중 마지막). AC-3803.1~3803.3은 patientMix.test.ts(옛 AC-2703.3 시험은 새 기대값 3명·3건으로 고치고 이름에 AC-3803.3), AC-3803.4는 jobs.test.ts(`:1137-1151`의 `mix.new.total`). jobs.test.ts의 다른 기대값은 바뀌지 않아야 한다(바뀌면 멈추고 알린다). `jobs.ts`·화면·`toMonthSections`는 고치지 않는다

## TASK-3: 주·달 칸 처방·묶음 신환·재진 = 받은(센) 날의 그날 표시
- AC: AC-3804.1, AC-3804.2, AC-3804.3, AC-3804.4, AC-3804.5
- REQ: REQ-3804
- Files: src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts, src/lib/payload/toMonthPayload.test.ts
- Tests: src/lib/analytics/aggregate.test.ts, src/lib/payload/toMonthPayload.test.ts
- TDD: required
- 할 일: design.md 보강 '주·달 칸' — 일 칸 `visit`만 채우고, `RxAcc.visit`(줄을 다 훑은 뒤 그날 표시를 세 칸에 큰 값으로 올림)와 `GroupDays`(`ats`·`seen`)로 신환·재진을 나눈다. 묶음 판단 구조(group-exclude TASK-4)는 그대로 두고 `addGroupDay`에 그날 표시만 넘긴다. AC-3804.1~3804.4는 aggregate.test.ts(느린 기준 `naiveAggregate`·`naiveGroupBuckets`의 신환·재진 나누기를 새 규칙으로, 옛 규칙 시험 `:416`·`:794`·`:1856`은 새 기대값으로 고치고 이름에 AC-3804.x), AC-3804.5는 toMonthPayload.test.ts(`:243-262`). 고치지 않고 돌려만 보는 시험: `compare.test.ts`·`analyzeFiles.test.ts`·`runAnalysis.test.ts`·`helperData.test.ts`·`validate.test.ts`·`groupCounts.test.ts`·`toDayPayloads.test.ts`·`jobs.test.ts`(TASK-2 몫) — 하나라도 깨지면 멈추고 알린다. 10만 줄 1초 시험 둘을 지나야 한다
