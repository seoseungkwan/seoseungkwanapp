# 작업 분할: first90

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files·Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 시험 이름에는 이 명세의 AC ID를 넣는다. 지금 시험의 기대값을 고칠 때는 이 명세가 바꾸는 글·구조만 고치고, 그 시험 이름에 바꾼 AC ID를 더한다. 계산 시험은 고치지 않는다.
> 도우미 C# 시험은 앞에 `PATH="$HOME/.dotnet:$PATH"`를 붙여 돌린다.
> 이 PC에서 원래 나는 실패 4개는 `specs/stats-revenue/known-failures.md`에 있다.
> 화면 작업(TASK-5~12)은 글자를 requirements.md 따옴표 글 그대로, 모양은 `docs/mockups/first90/redesign.html` 그대로 쓴다. 끝나면 합성 자료 화면(ssk-screen-check)으로 1440·1024·768·390px를 찍어 시안과 견준다.

## 할 순서
- 먼저(코드 작업 아님): 사용자가 `/sdd approve first90`를 입력한다.
- Phase 1 (병렬 2): TASK-1 도우미 ‖ TASK-2 웹 분석 자료
- Phase 2 (병렬 2, Phase 1 뒤): TASK-3 매출 자료·SQL ‖ TASK-5 토큰·규칙 예외·차트 기반
- Phase 3 (병렬 2, Phase 2 뒤): TASK-4 대시보드 ‖ TASK-6 틀·바로가기 띠
- Phase 4 (병렬 2, Phase 3 뒤): TASK-7 환자 요약·매출 요약·스위치 ‖ TASK-8 처방 카드
- Phase 5 (병렬 2, Phase 4 뒤): TASK-9 환자 카드 ‖ TASK-10 매출 카드
- Phase 6 (병렬 2, Phase 5 뒤): TASK-11 진료 운영 카드 ‖ TASK-12 보고 카드
- 마지막(코드 작업 아님): 전체 시험·lint·build를 한 번 돌리고, 합성 자료 화면을 찍고, 검토를 한 번 받는다.
- 병렬인 두 TASK는 서로의 파일을 고치지 않는다. `StatsSections.tsx`는 TASK-6·7만, `view.ts`는 TASK-7·9·11만(서로 다른 Phase), `revenueView.ts`·`RevenueSection.tsx`는 TASK-7·10만 고친다.

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
- Files: src/lib/bridge/revenueResult.ts, src/types/revenue.ts, src/lib/storage/revenue.ts, src/lib/revenue/sync.ts, src/components/stats/useStatsRevenue.ts, src/components/stats/useStatsWorker.ts, src/components/stats/StatsScreen.tsx, supabase/migrations/20261115000000_sales_day_rough.sql, src/lib/bridge/revenueResult.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/components/stats/useStatsRevenue.test.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/StatsScreen.test.tsx, supabase/salesDayRough.rls.test.ts
- Tests: src/lib/bridge/revenueResult.test.ts, src/lib/storage/revenue.test.ts, src/lib/revenue/sync.test.ts, src/components/stats/useStatsRevenue.test.ts, src/components/stats/useStatsWorker.test.ts, src/components/stats/StatsScreen.test.tsx, supabase/salesDayRough.rls.test.ts, supabase/salesDayCodes.rls.test.ts, supabase/revenue.rls.test.ts
- TDD: required
  - 답 검사: unconfirmed 줄의 `roughTotal` 받음(음수 포함) · 열쇠 없음 받음 · 확인된 날에 열쇠 있음 거부 · 소수·10^12 넘음 거부.
  - 저장소: 넣기 인자에 `rough_total`, 읽기 select·옮기기, 옛 줄 null.
  - `sync.ts`: 저장 표시 함수(예: `savedMark(row, helperVersion)`)가 아래처럼 판단한다.
    - 확인 필요한 날, 참고 금액 null, 도우미 0.7.0 → false(다시 읽음).
    - 0.6.0 → 지금 그대로.
    - 확인된 날 → 지금 그대로.
  - 훅이 그 함수를 쓴다. 도우미 판은 `useStatsWorker`가 `hello.helperVersion`을 내보내고 `StatsScreen`이 `useStatsRevenue`에 넘긴다(연결 전·판 모름은 null).
  - SQL(PGlite, 지금 RLS 시험과 같은 흉내):
    - 두 번 실행해도 됨, 칸·CHECK(`rough_total`이 있으면 `total`은 null), 칸 권한.
    - `save_revenue_range`가 `rough_total`을 저장하고, 옛 인자(열쇠 없음)는 null로 저장.
    - anon 막힘, A/B 자기 줄만. 옛 두 RLS 시험은 그대로 통과.
- 차례: Phase 2 (TASK-5와 병렬)

## TASK-4: 대시보드 — 하루 분석 5칸 · 보고 문장 · 기간별 흐름
- REQ: REQ-4404
- AC: AC-4404.1, AC-4404.2, AC-4404.3
- Files: src/components/dashboard/summary/view.ts, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/summary/FlowSection.tsx, src/components/dashboard/summary/flow.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/flow.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/flow.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- TDD: required
  - 5칸 이름 차례(오늘·지난 날).
  - 모름: '–'·"새 도우미(0.7.0)면 나와요"·재진 "90일초진 포함".
  - 문장 두 모양.
  - 흐름 막대: 모든 칸이 앎이면 TASK-5의 `trendSeries(true)` 세 갈래·색, 아니면 지금 두 갈래. 대시보드 모양·움직임은 그대로(`motion` 안 줌).
- 차례: Phase 3 (TASK-6과 병렬)

## TASK-5: 통계 화면 기반 — 토큰 · 규칙 예외 · 움직임 CSS · 차트 기반
- REQ: REQ-4416, REQ-4417
- AC: AC-4416.1, AC-4416.2, AC-4416.3, AC-4417.1, AC-4417.2, AC-4417.4
- Files: src/app/globals.css, src/app/globals.test.ts, src/app/theme.test.ts, src/components/ui/classes.test.ts, src/components/charts/rules.test.ts, docs/UI_GUIDE.md, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/InlineBar.tsx, src/components/charts/InlineBar.test.tsx, src/components/charts/ChartLegend.tsx, src/components/charts/ChartLegend.test.tsx, src/components/charts/DonutChart.tsx, src/components/charts/DonutChart.test.tsx, src/components/stats/trendSeries.ts, src/components/stats/trendSeries.test.ts
- Tests: src/app/globals.test.ts, src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/components/charts/rules.test.ts, src/components/charts/StackedBarChart.test.tsx, src/components/charts/InlineBar.test.tsx, src/components/charts/ChartLegend.test.tsx, src/components/charts/DonutChart.test.tsx, src/components/charts/ChartTable.test.tsx, src/components/stats/trendSeries.test.ts, src/components/preview/DashboardPreview.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- TDD: required
  - 토큰: design.md 5-1의 `--st-*` 값과 `@theme inline` 이름. 지금 토큰 값은 그대로(지금 theme 시험 통과).
  - 규칙 예외: 예외 파일 목록 × 허용 클래스(5-2)는 통과, 목록 밖 파일이 `rounded-st`·`min-[1100px]:`·`text-st-40` 등을 쓰면 실패(가짜 소스로 증명). 굵기 600 넘음·그라데이션은 예외 파일에서도 실패.
  - `@keyframes`는 지금 것 + `st-donut`·`st-rise`·`st-in`만. reduced-motion 안에서 `st-*` 움직임 클래스가 모두 꺼짐.
  - 차트 규칙: 차트 파일은 여전히 'use client'·hooks·`animate-*`·`transition*` 없음. `st-*` 움직임 클래스는 DonutChart·StackedBarChart·InlineBar만.
  - StackedBarChart: 새 tone `f90`·`ret`·`rough`(svg 빗금), `mark: 'unchecked'` 점선 칸 + "확인 필요", `motion`·`selected`·`onPick`. 새 props를 안 주면 지금 마크업과 같다(대시보드·preview 시험 그대로 통과).
  - ChartLegend 새 표시 `f90`·`ret`·`rough`·`unchecked`, 지금 표시 마크업 그대로. 계열 tone을 범례로 넘기는 `DashboardPreview`가 형식 검사를 통과.
  - InlineBar `motion`. DonutChart 조각 비율·가운데 두 줄·`aria-hidden`·`motion`일 때만 `st-donut`.
  - trendSeries: 앎 → 신환·90일초진·재진(accent·f90·ret), 모름 → 신환·"재진(90일초진 포함)".
  - UI_GUIDE '통계 화면(first90)' 절(시험 아님, 문서).
- 차례: Phase 2 (TASK-3과 병렬)

## TASK-6: 통계 틀 — 카드 · 바로가기 띠 · 차례
- REQ: REQ-4411
- AC: AC-4411.1, AC-4411.2, AC-4411.3, AC-4411.4
- Files: src/components/stats/sections/parts.tsx, src/components/stats/sections/parts.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsToc.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/app/(app)/stats/page.test.tsx
- Tests: src/components/stats/sections/parts.test.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/StatsScreen.test.tsx, src/app/(app)/stats/page.test.tsx, src/components/stats/sections/*.test.tsx
- TDD: required
  - `StatsCard`: section·h2·옆 글·오른쪽 자리·id. 카드 안 `Section`은 h3, 카드 밖은 지금처럼 h2(각 칸 시험 그대로 통과). 칸 하나·같은 제목이면 칸 머리 없이 옆 글·단추가 카드 머리로.
  - 카드 다섯의 h2·옆 글(AC-4411.3). 환자 카드 옆 글 "{기간 이름} · {시작 날짜} – {끝 날짜}".
  - 화면 차례(AC-4411.1). 매출을 주지 않으면 매출 요약·매출 카드·"매출" 링크가 없다.
  - 바로가기 띠: `nav` 이름 "통계 바로가기", 링크 여섯 차례·누르면 그 카드로, `aria-current`·모션 줄이기 그대로, 기간 글 없음(`tocRangeText` 없앰).
  - "어떻게 세나요?"·빈 자료 글·읽는 중 글은 칸 안에 그대로 남는다(AC-4411.4, 지금 칸 시험이 증명).
  - `StatsScreen.test.tsx`는 카드 h2·차례·바로가기만 본다. 작은 칸(h3) 이름·글은 각 칸 시험이 본다. 그래야 TASK-8~12가 이 파일을 고치지 않는다.
- 차례: Phase 3 (TASK-4와 병렬)

## TASK-7: 환자 요약 · 매출 요약 · 참고 금액 포함 스위치
- REQ: REQ-4403, REQ-4408, REQ-4417
- AC: AC-4403.1, AC-4403.2, AC-4403.3, AC-4403.4, AC-4408.1, AC-4408.2, AC-4417.3
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts, src/components/stats/periodPick.ts, src/components/stats/periodPick.test.ts, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/SummaryCell.tsx, src/components/stats/sections/SummaryCell.test.tsx, src/components/stats/sections/RevenueSummary.tsx, src/components/stats/sections/RevenueSummary.test.tsx, src/components/stats/sections/RoughSwitch.tsx, src/components/stats/sections/RoughSwitch.test.tsx, src/lib/revenue/summary.ts, src/lib/revenue/summary.test.ts, src/components/stats/revenueView.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/view.test.ts, src/components/stats/periodPick.test.ts, src/components/stats/sections/PeriodSummary.test.tsx, src/components/stats/sections/SummaryCell.test.tsx, src/components/stats/sections/RevenueSummary.test.tsx, src/components/stats/sections/RoughSwitch.test.tsx, src/lib/revenue/summary.test.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 환자 요약: 칸 넷 차례·이름·옆 글·값 단위, 12개월 첫 칸, 머리 옆 글의 과/와. 폰 두 칸씩·옆 글이 이름 아래.
  - 증감: 하루 평균 = 지금 비교 칸 값. 빠르게 보기 신환·90일초진·재진 합계 증감(짝 끝난 칸끼리, 90일초진은 두 기간 모두 앎일 때만). 고른 기간은 하루 평균만 + 작년 둘째 줄. 견줄 수 없음 → "비교할 자료가 없어요". 넷째 칸 '비교 기간보다' 없음.
  - 모름: "확인 불가"·옛 도우미 글·증감 없음, 재진 "90일초진 포함"·`returning + first90`, 안내 글과 링크 "새 도우미 내려받기".
  - 보고 첫 문장 두 모양(AC-4403.4).
  - sumPeriod `withRough`: 매출·접수 건수·건당(버림)·roughDays·roughSum·workDays. 급여·비급여·기타는 그대로. 참고 금액 없는 날은 빠짐. 비교 기간도 같은 방식.
  - 매출 요약 칸 셋 글(꺼짐·켜짐·참고 금액 없는 날), 건당 진료비 증감 비율만, "참고 포함" 꼬리표. 읽는 중·실패·자료 없음 글 그대로.
  - 스위치: 두 곳(매출 요약 머리·매출 칸 머리), `role="switch"`·이름·`aria-checked`, 처음 꺼짐, 같이 바뀜, 아래 글 셋, 참고 금액 없음 → `aria-disabled` + 글, 확인 필요한 날 없음 → 없음.
  - 움직임: 스위치 손잡이 `st-move-toggle`, 바뀔 때 요약 칸 `st-flash`가 붙고 250ms 뒤 떨어짐, 빠르게 여러 번 눌러도 남지 않음(가짜 타이머).
- 차례: Phase 4 (TASK-8과 병렬)

## TASK-8: 처방 카드 — 묶음별 추세 순위 · 처방별 신환·재진 · 신환이 그 처방을 받은 횟수
- REQ: REQ-4413, REQ-4410, REQ-4417
- AC: AC-4413.1, AC-4413.2, AC-4413.3, AC-4410.1, AC-4410.2, AC-4410.3, AC-4410.4, AC-4417.2
- Files: src/components/stats/sections/RxSection.tsx, src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/treatmentView.ts, src/components/stats/treatmentView.test.ts, src/components/stats/sections/RxSplitSection.tsx, src/components/stats/sections/RxSplitSection.test.tsx, src/components/stats/sections/RxPickerSection.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/onceView.ts, src/components/stats/onceView.test.ts, src/components/stats/sections/RxPickOnce.tsx, src/components/stats/sections/RxPickOnce.test.tsx
- Tests: src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/TreatmentTable.test.tsx, src/components/stats/treatmentView.test.ts, src/components/stats/sections/RxSplitSection.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx, src/components/stats/onceView.test.ts, src/components/stats/sections/RxPickOnce.test.tsx, src/components/stats/sections/RevenueSection.test.tsx
- TDD: required
  - 처방 카드 머리 [묶음 고치기], 탭 셋 이름·차례 그대로(RxSection 탭 구조를 쓰는 매출 칸 시험도 그대로 통과).
  - 묶음별 추세: 머리 칸 글·"{비교 이름}보다", 건수 "{n}건" 크게, 수 칸 오른쪽 정렬, 1023px 이하 쌓기·이름표·표 위 비교 글, 아래 글. 열기·조건·빼는 처방·고른 기간 비교 칸 그대로. 가로 막대 `motion`.
  - 처방별 신환·재진: 같은 순위 모양, 숫자·[표 복사] 그대로.
  - onceView: 달로 묶기·달 이름(첫 줄·1월은 해)·일부 달 글 셋, 신환·1회·2회 이상·비율(버림)·합계, 신환 0, 오늘 달·앞 달 `counting`, `once` 없는 날 → null + missing.
  - RxPickOnce: h3·옆 글·처방 단추(`aria-pressed`, 처음 첫째, 바꾸면 줄이 바뀜)·범례·100% 막대 안 숫자·줄 끝 글·합계 줄·"집계 중" 꼬리표와 옅은 막대·아래 글, missing 줄·안내 글. 처방을 안 고르면 묶음이 없음. 막대 폭 `st-move-period`.
- 차례: Phase 4 (TASK-7과 병렬)

## TASK-9: 환자 카드 — 내원 구성 · 일별 내원 · 신환 재방문율 · 환자 구성
- REQ: REQ-4412, REQ-4417
- AC: AC-4412.1, AC-4412.2, AC-4412.3, AC-4412.4, AC-4417.1, AC-4417.2
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts, src/components/stats/sections/PatientTrendSection.tsx, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/trendLabels.ts, src/components/stats/sections/VisitMixSection.tsx, src/components/stats/sections/VisitMixSection.test.tsx, src/components/stats/sections/RevisitSection.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/PatientMixSection.tsx, src/components/stats/sections/PatientMixSection.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/stats/view.test.ts, src/components/stats/sections/PatientTrendSection.test.tsx, src/components/stats/sections/VisitMixSection.test.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/PatientMixSection.test.tsx, src/components/ui/classes.test.ts, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 내원 구성: h3·옆 글, 가운데 "누적 내원"/"{n}건", 범례 세 줄 비율(버림), 모름 → 두 갈래 + 안내 글. 1100px 이상 막대 왼쪽·좁으면 위·380px 미만 범례 아래. 도넛 `motion`(처음 한 번).
  - 일별 내원: h3 일별·주별·월별, 세 갈래(`trendSeries`)·범례·화면 읽기 표 열, 모름 → 두 갈래 범례 "재진(90일초진 포함)", "(건)", 아래 글(지금 덧붙임 규칙 그대로), 막대 위 숫자 768px 이상, 누르면 아래 줄 글(`role="status"`, 두 모양). 막대 `motion`.
  - 재방문율: h3·옆 글, 줄 셋 글, 대상 기간(7·14일: N일 다 지난 날까지, 30일: `finishedCohort`)·인원, 셀 수 없는 줄 글 그대로, 까닭 단락(30일 문장은 최근 30일만, 셀 수 있는 줄 둘 미만이면 없음), 첫 재방문 접기(처음 닫힘). 계산 시험은 고치지 않는다.
  - 환자 구성: h3·옆 글, [전체][신환], 탭 셋(처음 연령대), [구·시][동], 줄 글·계산 그대로, 1100px 이상 두 열 세로 채움, 아래 글, 비트 없음·기다림 안내 그대로. `WIDE_1280` 예외를 규칙 시험에서 없앤다.
- 차례: Phase 5 (TASK-10과 병렬)

## TASK-10: 매출 카드 — 점선·빗금 막대 · 범례·아래 글 · 치료별 매출 순위
- REQ: REQ-4408, REQ-4417
- AC: AC-4408.3, AC-4408.4, AC-4408.5, AC-4417.3
- Files: src/components/stats/revenueView.ts, src/components/stats/revenueView.test.ts, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/revenue/MonthBars.tsx, src/components/revenue/RevenueParts.tsx, src/components/revenue/RevenueSplit.tsx, src/components/revenue/TreatmentBars.tsx, src/components/revenue/parts.test.tsx
- Tests: src/components/stats/revenueView.test.ts, src/components/stats/sections/RevenueSection.test.tsx, src/components/revenue/parts.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 꺼짐: 확인 필요한 날 `mark: 'unchecked'`(0원 막대 아님)·"확인 필요"·범례·막대 아래 글.
  - 켜짐: 참고 금액 날 `rough` 빗금 막대·칸 위 금액·범례·머리 글 "참고 포함" 꼬리표(`st-tag-in`)·막대 아래 글. 빗금 조각 `st-rise`.
  - 막대 누르기 아래 줄 글 세 모양(`role="status"`).
  - 급여·비급여·기타·치료별 매출은 mode와 상관없이 지금 값(AC-4408.4). 탭 넷·탭 안 내용 그대로, 치료별 매출은 가로 막대 순위.
- 차례: Phase 5 (TASK-9와 병렬)

## TASK-11: 진료 운영 카드 — 요일별 내원 · 시간대별 접수 · 원장님별
- REQ: REQ-4414, REQ-4417
- AC: AC-4414.1, AC-4414.2, AC-4414.3, AC-4414.4, AC-4417.2
- Files: src/components/stats/sections/WeekdaySection.tsx, src/components/stats/sections/WeekdaySection.test.tsx, src/components/stats/sections/VisitHoursSection.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/stats/view.ts, src/components/stats/view.test.ts, src/lib/analytics/visitHours.ts, src/lib/analytics/visitHours.test.ts, src/lib/analytics/doctorStats.ts, src/lib/analytics/doctorStats.test.ts
- Tests: src/components/stats/sections/WeekdaySection.test.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/stats/view.test.ts, src/lib/analytics/visitHours.test.ts, src/lib/analytics/doctorStats.test.ts, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 1200px 이상 30:70, 좁으면 시간대별이 아래 전체 폭(class로 증명).
  - 요일별: h3·옆 글, 요일마다 가로 막대·"{n}건", 진료한 날 없음, '오늘(진료 중)'·'일부 기간'·평균 계산 그대로. 막대 `motion`.
  - 시간대별: h3·옆 글, 가장 붐비는 때 머리 줄, 칸 색 범례 여섯, 문 연 날 없는 요일 줄, 칸 누르기 아래 줄 글·처음 글, 아래 글, 768px 미만 요일 단추·시간 가로 막대·[전체 표 보기]/[요일별로 보기]·"옆으로 밀어 보세요 →", `[자세히]` 그대로. 칸 색 `st-move-heat`. 붐비는 때·평균 숫자 계산은 지금 `visitHours` 셈을 쓴다.
  - 원장님별: h3·옆 글, 768px 이상 표 머리·합계 줄, 768px 미만 카드(이름·매출 크게, 칸 다섯, 합계 카드), 아래 글, 숫자·한 분일 때 글 그대로.
- 차례: Phase 6 (TASK-12와 병렬)

## TASK-12: 보고 카드 — 네 줄 미리보기 · 전체 보기 · 복사
- REQ: REQ-4415
- AC: AC-4415.1, AC-4415.2
- Files: src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx
- Tests: src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required
  - 보고 고르기 단추·날짜 줄 그대로, 글은 처음 네 줄만, [전체 보기] → [접기](`aria-expanded`), [복사]는 글 전체.
  - 네 줄 이하면 [전체 보기] 없음. 흐림 덧칠(그라데이션) 없음.
  - 보고 글(`formatClinicReport`)은 바꾸지 않는다.
- 차례: Phase 6 (TASK-11과 병렬)
