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
- REQ: REQ-601, REQ-604
- Files: src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/components/dashboard/live/readBitDays.test.ts
- TDD: required

## TASK-4: 대시보드 화면
- REQ: REQ-601, REQ-603
- Files: src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/dashboard/summary/source.test.ts, src/app/globals.css, src/app/globals.test.ts, src/app/theme.test.ts, src/components/ui/classes.test.ts
- Tests: src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/briefing/StickyConnect.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/dashboard/summary/source.test.ts, src/app/globals.test.ts
- TDD: required

## TASK-5: 연결 끝나면 대시보드로
- REQ: REQ-603, REQ-604
- Files: src/app/(app)/claim/setup/page.tsx, src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.tsx, src/components/claim/setup/SetupScreen.test.tsx, src/components/claim/setup/ReturnWhenReady.tsx, src/components/claim/setup/SetupAlert.tsx, src/components/claim/setup/StepGuide.tsx
- Tests: src/app/(app)/claim/setup/page.test.tsx, src/components/claim/setup/SetupScreen.test.tsx
- TDD: required

## TASK-6: 날짜 고르기
- REQ: REQ-605
- Files: src/components/dashboard/live/DateControl.tsx, src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/summary/source.test.ts, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/live/DateControl.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/source.test.ts, src/app/(app)/dashboard/page.test.tsx
- TDD: required

## TASK-7: 접수 기준 확인 (통계 쪽 수정이 들어와야 끝난다)
- REQ: REQ-602
- Files: src/components/dashboard/live/visitBasis.test.ts
- Tests: src/components/dashboard/live/visitBasis.test.ts
- TDD: required

## TASK-8: 통계의 저장 숫자 읽기와 잇기 (`LiveDashboard`)
- REQ: REQ-601
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- TDD: required
- AC-601.14·AC-601.19와 통계 AC-516.1·AC-516.3·AC-516.4(페이지 쪽)를 맞춘다. 시험 이름에 두 명세의 AC ID를 함께 적는다. `tabFrame.test.tsx`는 페이지가 바뀌어 꼭 필요할 때만 고친다
- 통계 TASK-16과 동시에 돌 수 있다. 그 TASK의 여섯 파일(`source.ts`·`view.ts`·`DashboardAnalysis.tsx`와 그 시험)을 고치지 않고 `toSummarySource`는 design.md의 모양대로 부른다. GREEN 기록은 TASK-16의 `toSummarySource`가 작업 폴더에 생긴 뒤 한다

## TASK-9: 90일 그래프 아래 빈 곳 (공용 부품 `StackedBarChart`)
- REQ: REQ-601
- Files: src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- Tests: src/components/charts/StackedBarChart.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx
- TDD: required

## TASK-10: 덜 끝난 지난 날의 보고 문장
- REQ: REQ-605
- Files: src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx
- Tests: src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/ReportBlock.test.tsx
- TDD: required
- AC-605.9. 같은 `view.ts`·`view.test.ts`를 고치는 통계 TASK-16이 끝난 뒤에 한다. TASK-8과는 파일이 겹치지 않아 동시에 돌 수 있다

## TASK-11: 묶음별 처방 상위 숫자 (`groupRank`, 자료 모양)
- REQ: REQ-606
- Files: src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/source.ts, src/components/dashboard/summary/source.test.ts
- Tests: src/components/dashboard/summary/view.test.ts, src/components/dashboard/summary/source.test.ts
- TDD: required
- AC-606.1·606.2·606.3의 숫자 쪽(셀 수 있음/다시 불러와야 함, 차례, 5줄, 0건). `RxGroupLine`·`SummarySource.groups` 타입을 `source.ts`에 더한다(불러오기·`toSummarySource`는 그대로). `topRx`는 이 TASK에서 지우지 않는다(TASK-12). `keyedIn`과 견주는 시험 하나(design.md). TASK-13과 파일이 겹치지 않아 동시에 돌 수 있다. TASK-12·14는 이 TASK의 함수·타입을 쓰므로 이 TASK 뒤에 한다

## TASK-12: '처방 상위' 칸 그리기 (`DashboardAnalysis`)
- REQ: REQ-606
- Files: src/components/dashboard/summary/DashboardAnalysis.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/view.ts, src/components/dashboard/summary/view.test.ts, src/app/(app)/dashboard/page.test.tsx
- Tests: src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/components/dashboard/summary/view.test.ts, src/app/(app)/dashboard/page.test.tsx
- TDD: required
- AC-606.3~606.6의 화면 쪽(design.md '처방 상위 = 통계 탭 묶음'의 ①~⑤, 링크, 설명 글, 연결 전 넷째 설명). TASK-11 뒤에 한다. TASK-14와 파일이 겹치지 않아 동시에 돌 수 있다. `view.ts`·`view.test.ts`에서는 `topRx`와 그 시험만 지운다. AC-311.8 허락 목록에 `next/link` 한 줄을 더하고, 움직임 검사는 '처방 상위' 머리 링크만 뺀다(design.md '칸 그리기')

## TASK-13: 비트 읽기에 묶음 싣기 (`readBitDays`)
- REQ: REQ-606
- Files: src/components/dashboard/live/readBitDays.ts, src/components/dashboard/live/readBitDays.test.ts
- Tests: src/components/dashboard/live/readBitDays.test.ts
- TDD: required
- AC-606.7의 읽기 쪽: 받은 `groups`를 `requestLoad`에 그대로 싣고, 주지 않으면 `[]`. 지금의 읽기 시험은 그대로 지난다

## TASK-14: 묶음 읽기 (`live/rxGroups.ts`)
- REQ: REQ-606
- Files: src/components/dashboard/live/rxGroups.ts, src/components/dashboard/live/rxGroups.test.ts
- Tests: src/components/dashboard/live/rxGroups.test.ts
- TDD: required
- AC-606.1(이름·열쇠)·606.4(처방 없는 묶음 뺌)·606.5(실패 = null)·606.7(`defs`)·606.8(받아 오기만 함)의 묶음 쪽. `toDashboardGroups`(차례, 처방 없는 묶음 뺌, 열쇠 = `groupKey`, `defs` = `groupDefs`)와 `readDashboardGroups`(실패 = null, 서버로 보내는 것 없음). `listStatsRxGroups`는 시험에서 가짜로 바꾼다. `RxGroupLine` 타입을 쓰므로 TASK-11 뒤에 한다(TASK-12와 동시에 돌 수 있다)

## TASK-15: 잇기 (`LiveDashboard`·`BitDashboard`)
- REQ: REQ-606
- Files: src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/(app)/tabFrame.test.tsx
- Tests: src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/summary/DashboardAnalysis.test.tsx, src/app/(app)/dashboard/page.test.tsx
- TDD: required
- AC-606.5·606.7·606.8과 AC-606.1의 두 길(저장 숫자로 먼저·비트 숫자로 바꾼 뒤). TASK-11~14 뒤에 한다. `DashboardAnalysis.test.tsx`는 AC-311.8의 `LIVE_IMPORTS`에 `LiveDashboard.tsx: @/components/dashboard/live/rxGroups` 한 줄만 더한다. `page.test.tsx`·`tabFrame.test.tsx`는 묶음 읽기를 가짜로 바꿔야 할 때만 고친다
