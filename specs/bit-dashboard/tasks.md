# 작업 분할: 비트 연결하면 대시보드 숫자 자동 채움

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 시작 전에 `origin/feat-stats`를 이 브랜치에 합친다. 실제 환자 자료는 쓰지 않는다. 시험은 가짜 자료만 쓴다.

## TASK-1: 웹 오류 문구
- REQ: REQ-601, REQ-604
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required

## TASK-2: 도우미 0.2.0
- REQ: REQ-604
- Files: helper/Directory.Build.props, src/lib/bridge/versions.ts, src/lib/bridge/handshake.test.ts, helper/tests/build.test.ts, src/lib/bridge/client.test.ts, src/lib/bridge/workerSink.test.ts, src/components/claim/useBridge.test.ts, src/components/claim/setup/SetupScreen.test.tsx
- Tests: src/lib/bridge/handshake.test.ts, helper/tests/build.test.ts, src/lib/bridge/client.test.ts, src/lib/bridge/workerSink.test.ts, src/components/claim/useBridge.test.ts, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required

## TASK-3: 비트 읽기 한 번 (`readBitDays`)
- REQ: REQ-601
- Files: src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/components/dashboard/live/readBitDays.test.ts
- TDD: required

## TASK-4: 대시보드 화면
- REQ: REQ-601, REQ-603
- Files: src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required

## TASK-5: 연결 끝나면 대시보드로
- REQ: REQ-603, REQ-604
- Files: src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/setup/ReturnWhenReady.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx
- Tests: src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required

## TASK-6: 날짜 고르기
- REQ: REQ-605
- Files: src/components/dashboard/live/DateControl.tsx, src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx
- Tests: src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- TDD: required

## TASK-7: 접수 기준 확인 (통계 쪽 수정이 들어와야 끝난다)
- REQ: REQ-602
- Files: src/components/dashboard/live/visitBasis.test.ts
- Tests: src/components/dashboard/live/visitBasis.test.ts
- TDD: required

## TASK-8: 통계의 저장 숫자 읽기와 잇기 (`LiveDashboard`가 합쳐진 뒤)
- REQ: REQ-601
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required
