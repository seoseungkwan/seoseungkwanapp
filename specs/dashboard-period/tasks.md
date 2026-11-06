# 작업 분할: 대시보드 기간 고르기 (기간별 흐름에 일별·주별·월별 + 달·해 고르기 + 직접 날짜)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: 먼저 할 일 → Phase 1(TASK-1 · TASK-2 · TASK-3 병렬) → Phase 2(TASK-4) → Phase 3(TASK-5). 같은 Phase끼리 파일이 겹치지 않는다.
> 검토는 끝에 한 번. 전체 검사(`tsc`·lint·vitest)와 390·1440px 화면 사진은 Phase 3 끝에 한다.
> 시험 자료는 모두 지어낸 값이고 실제 환자 파일을 열지 않는다. 통계 탭 파일(`src/components/stats/**`)은 고치지 않는다.

## 먼저 할 일 (코드 작업 아님, 끝나기 전에는 TASK를 시작하지 않는다)
1. `feat-stats-period`의 TASK-8이 끝나고 검토를 통과하면 그 브랜치를 이 브랜치(`feat-dashboard-period`)에 합친다. `PeriodPicker.tsx`·`periodPick.ts`·`StackedBarChart`의 `blank`가 그 브랜치에만 있다
2. 합친 뒤 `npm test`·`npm run lint`·`tsc`가 통과하는지 본다(합치기만 했으니 고칠 것이 없어야 한다)
3. (끝남, 2026-11-06) 사용자 결정: 고르기는 빠른 단추와 같은 줄(통계 탭처럼), 처방 상위 날짜 줄은 "설명 바로 아래", 명세 내용 승인("이대로 만들어")

## TASK-1: 날 수와 뺀 날 (대시보드 view.ts)
- REQ: REQ-1802, REQ-1803
- AC: AC-1802.3(뺀 날 셈), AC-1803.3(N 셈)
- Files: src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts
- Tests: src/components/dashboard/summary/view.test.ts
- TDD: required — `dayCount`(같은 날 두 줄은 하루, `groupRank`가 센 날과 같다)·`revisitSkipped`(그 값이 null이라 뺀 날이 있는 줄)만 더한다. 이 파일은 통계를 부르지 않는다. 있는 함수와 시험 기대값은 그대로

## TASK-2: 고른 기간 잇기 (새 순수 모듈 flow.ts)
- REQ: REQ-1801, REQ-1802, REQ-1803
- AC: AC-1801.3, AC-1801.4, AC-1802.1·AC-1802.2(칸 셈·눈금·dense), AC-1803.1, AC-1803.2
- Files: src/components/dashboard/summary/flow.ts, src/components/dashboard/summary/flow.test.ts
- Tests: src/components/dashboard/summary/flow.test.ts
- TDD: required — `QUICK_CHOICE`·`todayFinished`·`flowOf`·`flowTrend`(빠른 단추 = `trendBuckets` 그대로, 고른 기간 = 통계 `patientTrend`에 `covered: [current]`)·`flowTicks`·`rankLine`. 통계에서는 `periodPick`(`pickRange`·`lastDayOf`·타입)과 `view`(`patientTrend`·타입)만 부른다. 날짜는 `lib/analytics/dates.ts`만

## TASK-3: 옛 기간 읽기 훅
- REQ: REQ-1804
- AC: AC-1804.1, AC-1804.2(읽기 한 번·얹기·같은 키 안 읽음·앞 답 버림), AC-1804.3(실패·한도·다시 읽기 상태)
- Files: src/components/dashboard/summary/usePeriodDays.ts, src/components/dashboard/summary/usePeriodDays.test.ts, src/components/dashboard/summary/source.ts
- Tests: src/components/dashboard/summary/usePeriodDays.test.ts
- TDD: required — `OlderDays` 타입은 `source.ts`에 더한다(다른 모양은 그대로). 읽기 함수는 주입받고 이 파일은 `lib/storage`를 부르지 않는다. `older`가 없거나 첫날 ≥ `older.from`이면 늘 `ready`(손에 든 숫자)

## TASK-4: 기간별 흐름 화면
- REQ: REQ-1801, REQ-1802, REQ-1803, REQ-1804, REQ-1805
- AC: AC-1801.1, AC-1801.2, AC-1801.4(머리 줄 글), AC-1801.5, AC-1802.1~AC-1802.5(그리기), AC-1803.1~AC-1803.3(날짜 줄), AC-1804.2(읽는 중 틀), AC-1804.3(오류 카드·단추), AC-1805.1(오늘 하루 분석), AC-1805.2
- Files: src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- Tests: src/components/dashboard/summary/DashboardAnalysis.test.tsx
- TDD: required — 상태 `FlowChoice`(처음 30), `older` prop, 빠른 단추 오른쪽 같은 줄 `PeriodPicker`(그래프 갈래에만, 묶음째 줄바꿈), `usePeriodDays` 상태별 그리기, 처방 상위 설명 아래 줄(`Chart`의 `sub`), 재방문율 줄 아래 글, 범례 '일부 기간'. AC-311.8 허락 목록에는 design.md '결정과 트레이드오프'의 줄만 더하고 `view.ts`가 `components/stats`를 부르지 않는다는 검사를 더한다. 지금 시험 기대값은 바꾸지 않는다

## TASK-5: 읽기 잇기 (LiveDashboard → BitDashboard → DashboardAnalysis)
- REQ: REQ-1804, REQ-1805
- AC: AC-1804.2(`readDays` 범위·10초 한도), AC-1804.3(한도 = null), AC-1804.4, AC-1805.1(보고 문장·하루 날짜 고르기)
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- TDD: required — LiveDashboard가 `older`(첫날 = 오늘 − `LOOKBACK_DAYS`, 읽기 = `withinLimit(() => readDays(range))`의 rows)를 만들어 BitDashboard에 넘기고, BitDashboard는 DashboardAnalysis에 그대로 넘긴다. `readBitDays`·`stats.rows` 범위는 바꾸지 않고, 고르기로 `stats.rows`를 부르지 않음을 시험한다. AC-311.8의 `LIVE_IMPORTS`는 그대로다(새 불러오기 없음)
