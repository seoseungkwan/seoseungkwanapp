# 작업 분할: 대시보드 UI/UX와 AI 경영 리포트 요약

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 2026-11-07 Phase 2를 합친 뒤 고칠 범위에 빠진 시험 파일(대시보드 페이지·탭 틀·폴더 파일 목록 시험)을 더하고, 통합 작업(TASK-5)은 대시보드 폴더 전체로 넓혔다(재승인).
> 사용자 지시(2026-11-07): Phase 2(TASK-1·2)와 Phase 3(TASK-3·4)는 파일이 겹치지 않게 둘씩 나란히, Phase 4(TASK-5·6)는 차례로, 전체 검토는 마지막에 한 번.

## TASK-1: 읽기 상태 — 뼈대·묶음 먼저 그리기·머리 줄·늦은 답
- Step: Phase 2 · 트랙 A (TASK-2와 나란히)
- AC: AC-2701.1, AC-2701.2, AC-2701.3, AC-2701.4, AC-2701.5, AC-2701.6
- REQ: REQ-2701
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/live/DashboardSkeleton.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx, src/components/dashboard/summary/source.ts, src/components/dashboard/summary/source.test.ts, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx, src/components/dashboard/summary/source.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
- 머리 줄(StatusHeader)은 지금 `ReadLine` 자리(보고 문장 블록 안)에 둔다. 차례 옮기기는 TASK-5. DashboardAnalysis는 처방 상위의 '묶음 읽는 중'만 고친다

## TASK-2: 주요 메뉴 다섯 + 더보기 · 추이 기간 묶음 · 기간 고르기 판 맞춤
- Step: Phase 2 · 트랙 B (TASK-1과 나란히)
- AC: AC-2702.1, AC-2702.2, AC-2702.3, AC-2702.4, AC-2702.5, AC-2703.2, AC-2703.3
- REQ: REQ-2702, REQ-2703
- Files: src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/AllMenu.tsx, src/components/shell/MoreMenu.tsx, src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/stats/PeriodPicker.tsx, src/components/stats/PeriodPicker.test.tsx, src/components/dashboard/summary/PeriodButtons.tsx, src/components/dashboard/summary/PeriodButtons.test.tsx, src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/source.test.ts
- Tests: src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/stats/PeriodPicker.test.tsx, src/components/dashboard/summary/PeriodButtons.test.tsx, src/components/ui/classes.test.ts, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/source.test.ts
- TDD: required
- `ds.segment`(기간 단추 모양, 지금 PERIOD_* 값 그대로)를 여기서 더하고 PeriodPicker·PeriodButtons가 쓴다. PeriodButtons를 대시보드에 꽂는 일은 TASK-5. AllMenu.tsx는 MoreMenu.tsx로 바꾸고 지운다

## TASK-3: AI 경영 리포트 요약 · 보고 문장 구분
- Step: Phase 3 · 트랙 A (TASK-4와 나란히, TASK-1 뒤)
- AC: AC-2704.1, AC-2704.2, AC-2704.3, AC-2704.4, AC-2704.5, AC-2704.6, AC-2704.7, AC-2704.8, AC-2705.1
- REQ: REQ-2704, REQ-2705
- Files: src/components/dashboard/ai/useAiBrief.ts, src/components/dashboard/ai/AiBrief.tsx, src/components/dashboard/ai/AiBrief.test.tsx, src/components/dashboard/ai/useAiBrief.test.tsx, src/lib/ai/reportScreen.ts, src/lib/ai/reportScreen.test.ts, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/ai/AiBrief.test.tsx, src/components/dashboard/ai/useAiBrief.test.tsx, src/lib/ai/reportScreen.test.ts, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
- 유료 API는 부르지 않는다: 시험은 `fetch`를 가짜로 바꿔 합성 답(지어낸 리포트·오류 번호)만 준다. AiBrief를 대시보드에 꽂는 일은 TASK-5. BitDashboard.test는 보고 문장 h1이 바뀐 곳만 고친다

## TASK-4: 그래프 표로 보기 · 상태 구분 · 증감 공통
- Step: Phase 3 · 트랙 B (TASK-3과 나란히, TASK-1 뒤)
- AC: AC-2706.1, AC-2706.2, AC-2706.3, AC-2706.4
- REQ: REQ-2706
- Files: src/components/charts/ChartTable.tsx, src/components/charts/ChartTable.test.tsx, src/components/charts/DeltaText.tsx, src/components/charts/DeltaText.test.tsx, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/KpiStat.tsx, src/components/charts/KpiStat.test.tsx, src/components/charts/rules.test.ts, src/components/dashboard/summary/TableToggle.tsx, src/components/dashboard/summary/TableToggle.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/flow.ts, src/components/dashboard/summary/flow.test.ts, src/components/charts/**, src/components/dashboard/summary/source.test.ts
- Tests: src/components/charts/ChartTable.test.tsx, src/components/charts/DeltaText.test.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/KpiStat.test.tsx, src/components/dashboard/summary/TableToggle.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/flow.test.ts, src/components/dashboard/summary/source.test.ts
- TDD: required
- 툴팁은 만들지 않는다. StackedBarChart의 `srTable` 기본값은 true라 통계 탭 그림은 한 글자도 바뀌지 않는다

## TASK-5: 화면 통합 — 차례·AI 구역 강조·DashboardAnalysis 나누기·기준일 이름
- Step: Phase 4 (TASK-1~4 뒤, 혼자)
- AC: AC-2703.1, AC-2707.1, AC-2707.2, AC-2707.3, AC-2707.4
- REQ: REQ-2703, REQ-2707
- Files: src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/ReadyNow.tsx, src/components/dashboard/briefing/layout.ts, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/DateControl.tsx, src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/live/DashboardSkeleton.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/summary/FlowSection.tsx, src/components/dashboard/summary/PeriodButtons.tsx, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/ai/AiBrief.tsx, src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/stats/PeriodPicker.tsx, src/components/stats/sections/parts.tsx, src/components/dashboard/**, src/app/(app)/dashboard/**, src/app/(app)/tabFrame.test.tsx, src/components/stats/PeriodPicker.test.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/**, src/components/charts/**
- Tests: src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/DashboardSkeleton.test.tsx, src/components/ui/classes.test.ts, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/summary/source.test.ts
- TDD: required
- `ds.chartNoSideScroll`을 더하고 대시보드·통계 `parts.tsx`가 같은 값을 쓴다(통계 그림 그대로)

## TASK-6: 이름 바로잡기와 불러오는 코드 울타리
- Step: Phase 4 (TASK-5 뒤)
- AC: AC-2707.5, AC-2707.6
- REQ: REQ-2707
- Files: src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/common/NotFoundScreen.tsx, src/app/notFound.test.tsx, src/components/dashboard/imports.test.ts
- Tests: src/components/ui/classes.test.ts, src/components/dashboard/live/BitDashboard.test.tsx, src/app/notFound.test.tsx, src/components/dashboard/imports.test.ts
- TDD: required
