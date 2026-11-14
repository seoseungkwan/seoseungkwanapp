# 작업 분할: first90

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files·Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 시험 이름에는 이 명세의 AC ID를 넣는다. 지금 시험의 기대값을 고칠 때는 이 명세가 바꾸는 글·구조만 고치고, 그 시험 이름에 바꾼 AC ID를 더한다.
> 도우미 C# 시험은 앞에 `PATH="$HOME/.dotnet:$PATH"`를 붙여 돌린다.
> 이 PC에서 원래 나는 실패 4개는 `specs/stats-revenue/known-failures.md`에 있다.

## 할 순서
- 먼저(코드 작업 아님): 사용자가 `/sdd approve first90`를 입력한다.
- Phase 1 (병렬 2): TASK-1 도우미 ‖ TASK-2 웹 분석 자료
- Phase 2 (병렬 2, Phase 1 뒤): TASK-3 매출 자료·SQL ‖ TASK-4 통계 환자 칸
- Phase 3 (병렬 2, Phase 2 뒤): TASK-5 대시보드 ‖ TASK-6 신환 1회 표
- Phase 4 (Phase 3 뒤): TASK-7 넣고 보기 화면
- 마지막(코드 작업 아님): 전체 시험·lint·build를 한 번 돌리고, 검토를 한 번 받는다.
- 병렬인 두 TASK는 서로의 파일을 고치지 않는다.

## 사용자 할 일 (차례가 중요)
1. **SQL 붙여넣기**: TASK-3이 합쳐진 뒤, 웹을 올리기 전에 한다. Claude가 `supabase/migrations/20261115000000_sales_day_rough.sql`을 건넨다. 사용자는 Supabase → SQL Editor에 통째로 붙여 Run한다.
2. **웹 배포**: 사용자가 "배포해"라고 할 때만 한다.
3. **새 도우미(0.7.0) 설치**: 웹 배포가 끝난 뒤에만 한다. 운영 웹은 v4 답을 거부하기 때문이다. 정식 판은 사용자가 "판 만들어"라고 할 때만 만든다.
4. **다시 불러오기**: 통계에서 [비트에서 불러오기]를 누른다. 90일초진·1회 신환은 다시 불러온 날부터 보인다. 확인 필요한 날은 참고 금액이 없는 날만 한 번 다시 읽는다.

## TASK-1: 도우미 — 90일초진 칸 · 참고 금액 · 판 0.7.0
- REQ: REQ-4401, REQ-4405
- AC: AC-4401.1, AC-4401.2, AC-4401.3, AC-4405.1, AC-4405.2, AC-4405.3
- Files: helper/src/Precheck.Core/Stats/StatsSql.cs, helper/src/Precheck.Core/Stats/StatsRows.cs, helper/src/Precheck.Core/Stats/StatsPayload.cs, helper/src/Precheck.Core/Revenue/RevenueDays.cs, helper/src/Precheck.Core/Revenue/RevenueSql.cs, helper/Directory.Build.props, src/lib/bridge/versions.ts, helper/tests/Precheck.Core.Tests/Stats/StatsSql.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsRows.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsExtra.test.cs, helper/tests/Precheck.Core.Tests/Stats/StatsReport.test.cs, helper/tests/Precheck.Core.Tests/HelperStatsSpeed/HelperStatsSpeedSql.test.cs, helper/tests/Precheck.Core.Tests/BitReadSpeed/BitReadSpeedSql.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueDays.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueFakes.test.cs, helper/tests/Precheck.Core.Tests/Revenue/RevenueCommands.test.cs, helper/tests/Precheck.Core.Tests/Protocol/Dispatcher.test.cs, helper/tests/stats-rows.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/tests/build.test.ts, src/components/dashboard/live/visitBasis.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts, src/lib/bridge/revenueCall.test.ts, src/lib/bridge/revenueResult.test.ts
- Tests: helper/tests/stats-rows.dotnet.test.ts, helper/tests/revenue-read.dotnet.test.ts, helper/tests/helper-stats-speed.dotnet.test.ts, helper/tests/bit-read-speed.dotnet.test.ts, helper/tests/input-wiring.dotnet.test.ts, helper/tests/build.test.ts, src/components/dashboard/live/visitBasis.test.ts, src/lib/bridge/handshake.test.ts, src/lib/bridge/client.test.ts
- TDD: required. C# 시험 이름에 AC ID를 넣는다.
  - PatientDaysSql: 다섯째 칸 글, 공유 `Visits`는 그대로, HASH 한 번.
  - 가짜 DB 줄: '3' 접수 두 건 → 다섯째 칸 2. 첫 내원일 줄도 그대로 보냄. 답 `v` 4.
  - ReadMoney:
    - 세 검사에 걸린 날과 음수로 버린 날에 `roughTotal` = 정상 + 미수입금 줄 총진료비 합(원 미만 버림, 환불 음수).
    - 확인된 날은 열쇠가 없음. 답 JSON 모양.
  - 판 0.6.0 → 0.7.0. 판 번호가 박힌 시험만 고친다.
  - 판을 올리기 전에 `gh release list`로 확인한다.
- 차례: Phase 1 (TASK-2와 병렬)

## TASK-2: 웹 분석 자료 — v4 받기 · totals.first90 · 처방 once · payload·검사
- REQ: REQ-4402, REQ-4409
- AC: AC-4402.1, AC-4402.2, AC-4402.3, AC-4402.4, AC-4402.5, AC-4402.6, AC-4409.1, AC-4409.2
- Files: src/workers/stats/helperData.ts, src/workers/stats/jobs.ts, src/types/analysis.ts, src/types/payload.ts, src/lib/analytics/aggregate.ts, src/lib/analytics/history.ts, src/lib/payload/toDayPayloads.ts, src/lib/payload/toMonthPayload.ts, src/lib/payload/groupCounts.ts, src/lib/payload/validate.ts, src/lib/ai/input.ts, src/workers/stats/helperData.test.ts, src/workers/stats/jobs.test.ts, src/lib/analytics/aggregate.test.ts, src/lib/analytics/history.test.ts, src/lib/payload/toDayPayloads.test.ts, src/lib/payload/toMonthPayload.test.ts, src/lib/payload/groupCounts.test.ts, src/lib/payload/validate.test.ts, src/lib/ai/input.test.ts
- Tests: src/workers/stats/helperData.test.ts, src/workers/stats/jobs.test.ts, src/lib/analytics/aggregate.test.ts, src/lib/analytics/history.test.ts, src/lib/payload/toDayPayloads.test.ts, src/lib/payload/toMonthPayload.test.ts, src/lib/payload/groupCounts.test.ts, src/lib/payload/validate.test.ts, src/lib/ai/input.test.ts
- TDD: required
  - parseStatsRows: v2·v3 네 칸 받음, v4 다섯 칸 받음. 이런 줄은 거부: v4 네 칸 · v3 다섯 칸 · 다섯째 칸 음수·소수·접수 수 초과.
  - totals:
    - v4 날: first90은 첫 내원일이 아닌 줄만 더함. returning은 그만큼 줄어듦.
    - 첫 내원일의 '3'은 신환 쪽. v3·파일 길은 열쇠가 없음.
    - 주·달은 모든 일 칸에 있을 때만.
  - once:
    - 첫 내원일 처방을 하루만 받음 → 1. 다른 날에 같은 처방을 또 받음 → 0. 다른 처방만 다시 받음 → 1. 같은 날 두 줄 → 1.
    - `once ≤ newPatients`.
  - payload: 옮기기 · 달 first90 규칙 · 그룹·기록 복사.
  - validate: 네·다섯 열쇠 식, `once` 선택·범위.
  - AI 입력: 네 열쇠만.
- 차례: Phase 1 (TASK-1과 병렬)

## TASK-3: 매출 자료 — roughTotal 받기·저장 · SQL · 다시 읽을 날
- REQ: REQ-4406, REQ-4407
- AC: AC-4406.1, AC-4406.2, AC-4406.3, AC-4406.4, AC-4407.1, AC-4407.2
- Files: src/lib/bridge/revenueResult.ts, src/types/revenue.ts, src/lib/storage/revenue.ts, src/lib/revenue/sync.ts, src/components/stats/useStatsRevenue.ts, supabase/migrations/20261115000000_sales_day_rough.sql, src/lib/bridge/revenueResult.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/components/stats/useStatsRevenue.test.ts, supabase/salesDayRough.rls.test.ts
- Tests: src/lib/bridge/revenueResult.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/components/stats/useStatsRevenue.test.ts, supabase/salesDayRough.rls.test.ts, supabase/salesDayCodes.rls.test.ts, supabase/revenue.rls.test.ts
- TDD: required
  - 답 검사: unconfirmed 줄의 `roughTotal` 받음(음수 포함) · 열쇠 없음 받음 · 확인된 날에 열쇠 있음 거부 · 소수·10^12 넘음 거부.
  - 저장소: 넣기 인자에 `rough_total`, 읽기 select·옮기기, 옛 줄 null.
  - `sync.ts`: 저장 표시 함수(예: `savedMark(row, helperVersion)`)가 아래처럼 판단한다.
    - 확인 필요한 날, 참고 금액 null, 도우미 0.7.0 → false(다시 읽음).
    - 0.6.0 → 지금 그대로.
    - 확인된 날 → 지금 그대로.
  - 훅이 그 함수를 쓴다.
  - SQL(PGlite, 지금 RLS 시험과 같은 흉내):
    - 두 번 실행해도 됨, 칸·CHECK(`rough_total`이 있으면 `total`은 null), 칸 권한.
    - `save_revenue_range`가 `rough_total`을 저장하고, 옛 인자(열쇠 없음)는 null로 저장.
    - anon 막힘, A/B 자기 줄만. 옛 두 RLS 시험은 그대로 통과.
- 차례: Phase 2 (TASK-4와 병렬)

## TASK-4: 통계 환자 칸 — 기간 요약 5칸 · 환자 수 추이 세 갈래 · 보고 문장
- REQ: REQ-4403
- AC: AC-4403.1, AC-4403.2, AC-4403.3, AC-4403.4
- Files: src/components/stats/view.ts, src/components/stats/periodPick.ts, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/PatientTrendSection.tsx, src/components/stats/sections/parts.tsx, src/components/stats/sections/ReportSection.tsx, src/components/stats/view.test.ts, src/components/stats/periodPick.test.ts, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/parts.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/view.test.ts, src/components/stats/periodPick.test.ts, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/parts.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 모든 날이 앎 → 5칸 차례·글·재진 = returning 합.
  - 하루라도 모름 → '–'·글·재진 = returning + first90.
  - 폰 칸 class.
  - 추이: 세 갈래 색·범례·표 열·제목 옆 글. 모름이면 두 갈래 + 안내.
  - 보고 문장 두 모양. 기간 골라 보기도 같음.
- 차례: Phase 2 (TASK-3과 병렬)

## TASK-5: 대시보드 — 하루 분석 5칸 · 보고 문장 · 기간별 흐름
- REQ: REQ-4404
- AC: AC-4404.1, AC-4404.2, AC-4404.3
- Files: src/components/dashboard/summary/view.ts, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/summary/FlowSection.tsx, src/components/dashboard/summary/flow.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/flow.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/flow.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- TDD: required
  - 5칸 이름 차례(오늘·지난 날).
  - 모름: '–'·"새 도우미(0.7.0)면 나와요"·재진 "90일초진 포함".
  - 문장 두 모양.
  - 흐름 막대 세 갈래는 TASK-4의 parts 함수를 쓴다.
- 차례: Phase 3 (TASK-6과 병렬)

## TASK-6: 처방 골라 보기 — 신환이 한 번만 받은 처방 표
- REQ: REQ-4410
- AC: AC-4410.1, AC-4410.2, AC-4410.3, AC-4410.4, AC-4410.5
- Files: src/components/stats/onceView.ts, src/components/stats/sections/RxPickOnce.tsx, src/components/stats/sections/RxPickerSection.tsx, src/components/stats/onceView.test.ts, src/components/stats/sections/RxPickOnce.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx
- Tests: src/components/stats/onceView.test.ts, src/components/stats/sections/RxPickOnce.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx
- TDD: required
  - onceView:
    - 달로 묶기, 일부 달의 날짜 범위 글. 신환·1회·2회 이상·비율(버림), 합계.
    - 신환 0 → '–'. once 없는 날이 든 달 → null + missing.
    - 오늘 달·앞 달 ⓘ.
  - 부품:
    - 제목·옆 글·처방 단추(처음 첫째, 바꾸면 표가 바뀜)·머리 칸.
    - "어떻게 세나요?" 다섯 줄 글자. missing 안내.
    - 처방을 안 고르면 묶음이 없음.
- 차례: Phase 3 (TASK-5와 병렬)

## TASK-7: 매출 [빼고 보기 | 넣고 보기] 화면
- REQ: REQ-4408
- AC: AC-4408.1, AC-4408.2, AC-4408.3, AC-4408.4, AC-4408.5
- Files: src/lib/revenue/summary.ts, src/components/stats/revenueView.ts, src/components/stats/sections/RoughToggle.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/lib/revenue/summary.test.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RoughToggle.test.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/lib/revenue/summary.test.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RoughToggle.test.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - sumPeriod `withRough`: 매출·접수 건수·건당(버림)·roughDays·roughSum. 급여·비급여·기타는 그대로. 참고 금액 없는 날은 빠짐.
  - 단추: 두 곳, 이름 "확인 필요한 날 {n}일", `aria-pressed`, 같이 바뀜, 처음 빼고. 그런 날이 없으면 없음.
  - 넣고 보기: "참고 포함" 표, 확인 필요한 날 칸 글, 비교도 같은 방식, 줄 아래 글, 빗금 막대 + "참고", 범례, 머리 글, 막대 아래 글.
  - 급여·비급여·기타·치료별 매출은 그대로.
- 차례: Phase 4
