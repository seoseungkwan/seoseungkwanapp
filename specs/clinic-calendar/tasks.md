# 작업 분할: 예약 탭 (구글 캘린더 대신)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬(최대 2)이고 **같은 Phase의 TASK끼리 파일이 겹치지 않는다**. 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 마지막에 전체 검사·검토 한 번. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 서버 표 migration·RLS 시험·저장 함수·타입 + ADR-030·CLAUDE.md |
> | 1 | TASK-2 | 도우미 0.10.0: 비트 찾기(calfind)·접수와 비트 예약(calday)·수납일지 건강생활 칸 |
> | 1 | TASK-3 | 순수 셈 `lib/calendar`(칸 놓기·경고·도착·월 수·요약 수) + 구역 울타리 |
> | 1 | TASK-4 | 수납일지 건강생활 칩(웹: 답 v3 읽기·FREE 규칙·칩·범례) |
> | 2 | TASK-5 | 예약 Worker(찾기·도착·비트 예약 칸) |
> | 2 | TASK-6 | 예약표 그리기 부품(`components/calendar/rows` 울타리·월 칸·색 토큰) |
> | 2 | TASK-7 | 판 부품(더하기·자세히·종일·설정·요약 줄·표·통계 '예약' 칸 부품) |
> | 3 | TASK-8 | 예약 화면 잇기·`/calendar`·메뉴 + 전체 검사·화면 확인 |
> | 3 | TASK-9 | 통계 탭 '예약' 칸 잇기 |
>
> - 겹치는 파일은 Phase가 다를 때만: `eslint.config.mjs`·`src/guardrails.test.ts`는 TASK-3(Phase 1) → TASK-6(Phase 2) 차례
> - 타입: `src/types/calendar.ts`는 TASK-1 것. TASK-3은 같은 이름의 셈 입력 모양을 `src/lib/calendar/shapes.ts`에 따로 둔다(design.md '모양')
> - **사용자 단계**: (1) Phase 3 전에 `feat-nav-worklog`를 합친다 (2) 배포 전 `20261117010000_calendar.sql`을 Supabase SQL Editor에 붙여 넣기 (3) 배포 뒤 도우미 0.10.0 정식 판을 비트 PC마다 설치. Claude는 실제 Supabase에 붙지 않는다

## TASK-1: 서버 표·저장 함수·ADR-030
- Phase: 1
- AC: AC-5901.1, AC-5901.2, AC-5901.3, AC-5901.4, AC-5901.5, AC-5901.6, AC-5906.1
- REQ: REQ-5901, REQ-5906
- Files: supabase/migrations/20261117010000_calendar.sql, supabase/calendar.rls.test.ts, src/types/calendar.ts, src/lib/storage/calendar.ts, src/lib/storage/calendar.test.ts, docs/ADR.md, docs/ARCHITECTURE.md, CLAUDE.md
- Tests: supabase/calendar.rls.test.ts, src/lib/storage/calendar.test.ts
- TDD: required — design.md 'DB'·'모양'·'저장 함수'. RLS 시험은 `supabase/sunap.rls.test.ts`처럼 PGlite로 진짜 migration을 차례로 돌린다(1년 지우기는 시험이 한국 오늘 날짜로 줄을 심어 본다, 처음 자리 트리거·rev 트리거 포함). 저장 시험은 보내는 칸 목록이 정해 둔 것과 똑같은지(전화·성별·나이·생일 없음) 본다. `docs/ADR.md` 끝에 design.md 'ADR-030' 글, `CLAUDE.md`는 그 줄 하나 + 구역 목록에 `lib/calendar`·`components/calendar/rows` 두 단어, `docs/ARCHITECTURE.md`는 DB 표 넷·폴더 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 도우미 0.10.0 — 비트 찾기·접수·비트 예약·건강생활 칸
- Phase: 1
- AC: AC-5903.1, AC-5903.2, AC-5903.3, AC-5903.4, AC-5903.5, AC-5908.1
- REQ: REQ-5903, REQ-5908
- Files: helper/src/Precheck.Core/Calendar/**, helper/src/Precheck.Core/Contact/ContactCommands.cs, helper/src/Precheck.Core/Bit/Sql.cs, helper/src/Precheck.Core/Sunap/SunapTargets.cs, helper/Directory.Build.props, helper/tests/**, src/lib/bridge/commands.json, src/lib/bridge/versions.ts, src/lib/bridge/*.test.ts, src/types/bridge.ts
- Tests: helper/tests/calendar-read.dotnet.test.ts, helper/tests/sunap-read.dotnet.test.ts, helper/tests/Precheck.Core.Tests/Calendar/CalendarTargets.test.cs, helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs, helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs, src/lib/bridge/handshake.test.ts, src/lib/bridge/protocol.test.ts
- TDD: required — design.md '도우미 답'·'수납일지 건강생활'. SQL은 가짜 DB(기존 Sunap·Contact 시험 방식)로 본다. `calendar-read.dotnet.test.ts`는 `sunap-read.dotnet.test.ts`처럼 FILTER 'Calendar'로 감싼다. `PbsSexTyp` 값 종류·이름 찾기 시간은 `ssk-bit-db-probe`로 개수·시간만 본다(이름·차트번호 출력 금지). 판 박힌 기존 시험은 0.9.1 → 0.10.0 숫자만. `src/types/bridge.ts`는 `contact.targets` kind에 `'calfind' | 'calday'`, 선택 칸 `q?: string`만. 확장(`extension/`)은 고치지 않는다. dotnet 시험은 `PATH="$HOME/.dotnet:$PATH"`

## TASK-3: 순수 셈 `lib/calendar` + 구역 울타리
- Phase: 1
- AC: AC-5902.1, AC-5902.2, AC-5902.3, AC-5902.4, AC-5902.5, AC-5902.6, AC-5902.7, AC-5902.8, AC-5907.1
- REQ: REQ-5902, REQ-5907
- Files: src/lib/calendar/**, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/lib/calendar/layout.test.ts, src/lib/calendar/rules.test.ts, src/lib/calendar/counts.test.ts, src/guardrails.test.ts
- TDD: required — design.md '순수 셈'·'예'. 입력 모양은 `src/lib/calendar/shapes.ts`(`types/calendar.ts`를 import하지 않음). 날짜는 `lib/analytics/dates.ts`. eslint 환자 자료 구역 목록에 `src/lib/calendar/**`를 더하고 guardrails에 증명 하나

## TASK-4: 수납일지 건강생활 칩 (웹)
- Phase: 1
- AC: AC-5908.2, AC-5908.3, AC-5908.4
- REQ: REQ-5908
- Files: src/types/sunap.ts, src/workers/sunap/**, src/lib/sunap/**, src/components/sunap/**
- Tests: src/workers/sunap/handler.test.ts, src/lib/sunap/ledger.test.ts, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/SunapCards.test.tsx
- TDD: required — design.md '수납일지 건강생활'. `read.ts`는 v1·v2를 그대로 받고 v3만 더한다. `LedgerRow`에 `health`를 넣어 깨지는 기존 시험 자료는 이 Files 안에서만 맞춘다. 칩 글자·범례 글자는 AC 그대로

## TASK-5: 예약 Worker
- Phase: 2
- AC: AC-5904.1, AC-5904.2, AC-5904.3
- REQ: REQ-5904
- Files: src/workers/calendar.worker.ts, src/workers/calendar/**
- Tests: src/workers/calendar/handler.test.ts
- TDD: required — design.md 'Worker 메시지'. 본보기 `src/workers/sunap.worker.ts`·`sunap/handler.ts`(가짜 port로 조각을 넣어 본다). `arrivalOf`·`visibleGhosts`·`ageOn`은 `lib/calendar`의 것을 쓴다(고치지 않음)

## TASK-6: 예약표 그리기 부품 + rows 울타리 + 색 토큰
- Phase: 2
- AC: AC-5905.1, AC-5905.6, AC-5905.7, AC-5905.8, AC-5905.11, AC-5906.2, AC-5906.3
- REQ: REQ-5905, REQ-5906
- Files: src/components/calendar/rows/**, src/components/calendar/MonthGrid.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/colors.ts, src/components/calendar/colors.test.ts, src/app/globals.css, src/app/theme.test.ts, docs/UI_GUIDE.md, eslint.config.mjs, src/guardrails.test.ts
- Tests: src/components/calendar/rows/TimeGrid.test.tsx, src/components/calendar/rows/PhoneWeekList.test.tsx, src/components/calendar/rows/BitPicks.test.tsx, src/components/calendar/MonthGrid.test.tsx, src/components/calendar/colors.test.ts, src/app/theme.test.ts, src/guardrails.test.ts
- TDD: required — design.md '화면'의 rows·MonthGrid·colors, 시안 `?s=week`·`day`·`month`·`phone-week`·`phone-day`·`empty` 모양과 글자 그대로. props만 받는 부품(자료 읽기·저장 없음). 시안 10색을 `:root` `--cal-*` 토큰으로 넣고 토큰 표(`docs/UI_GUIDE.md`)·`theme.test.ts`를 그만큼만 맞춘다. eslint에 `components/calendar/rows` 블록(`components/sunap/rows` 본보기)과 guardrails 증명

## TASK-7: 판 부품 — 더하기·자세히·종일·설정·요약 줄·표·통계 칸
- Phase: 2
- AC: AC-5905.2, AC-5905.3, AC-5905.4, AC-5905.5, AC-5905.6, AC-5906.2, AC-5907.2, AC-5907.3
- REQ: REQ-5905, REQ-5906, REQ-5907
- Files: src/components/calendar/CalendarToolbar.tsx, src/components/calendar/CalendarToolbar.test.tsx, src/components/calendar/AddPanel.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/DetailPanel.tsx, src/components/calendar/DetailPanel.test.tsx, src/components/calendar/AllDayPanel.tsx, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/CalendarSettings.tsx, src/components/calendar/CalendarSettings.test.tsx, src/components/calendar/SummaryLine.tsx, src/components/calendar/SummaryLine.test.tsx, src/components/calendar/RateTable.tsx, src/components/calendar/RateTable.test.tsx, src/components/stats/sections/CalendarSection.tsx, src/components/stats/sections/CalendarSection.test.tsx
- Tests: src/components/calendar/CalendarToolbar.test.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/DetailPanel.test.tsx, src/components/calendar/AllDayPanel.test.tsx, src/components/calendar/CalendarSettings.test.tsx, src/components/calendar/SummaryLine.test.tsx, src/components/calendar/RateTable.test.tsx, src/components/stats/sections/CalendarSection.test.tsx
- TDD: required — 시안 `?s=new`·`phone-new`·`overlap-warn`·`off-warn`·`detail`·`settings`·`summary`·`stats` 글자 그대로. props·콜백만(저장은 화면이 한다). 더하기 판의 비트 찾기 자리는 `lookup` 칸으로 받아 비트 자료를 props로 쥐지 않는다. 경고·요약 수는 `lib/calendar`, 설정 검사는 `checkCalendarSettings`를 쓴다. 통계 칸 모양은 `components/stats/sections/SunapSection.tsx`·`components/charts` 본보기

## TASK-8: 예약 화면 잇기·`/calendar`·메뉴 + 마무리
- Phase: 3
- AC: AC-5905.1, AC-5905.2, AC-5905.3, AC-5905.4, AC-5905.5, AC-5905.6, AC-5905.7, AC-5905.8, AC-5905.9, AC-5905.10, AC-5906.2, AC-5907.2
- REQ: REQ-5905, REQ-5906, REQ-5907
- Files: src/components/calendar/**, src/app/(app)/calendar/page.tsx, src/app/(app)/calendar/page.test.tsx, src/components/shell/menu.ts, src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/preview/sample.ts, src/components/preview/sample.test.ts, src/components/preview/DashboardPreview.test.tsx
- Tests: src/components/calendar/CalendarScreen.test.tsx, src/components/calendar/useCalendarData.test.ts, src/components/calendar/useCalendarWorker.test.ts, src/app/(app)/calendar/page.test.tsx, src/components/shell/shell.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx
- TDD: required — design.md '화면'·'다시 읽기'·'메뉴'. `CalendarScreen`·`useCalendarData`(5초 rev, 숨으면 멈춤)·`useCalendarWorker`(`CAL_HELPER` 판정, 60초 `days`, `setApptAuto`)를 만들고 Phase 2 부품을 잇는다. 저장 함수·Worker·`useBridge`·시계는 시험에서 흉내 낸다. 메뉴 줄 하나 + 주소 화면 하나 + 메뉴를 고정한 시험은 수만 맞춘다(`feat-nav-worklog` 합친 뒤 기준). `src/lib/csp.ts`·`next.config.ts`는 고치지 않는다. 그 뒤 전체 검사(`npm test`·`npm run lint`·`npm run build`)와 화면 확인(로그인 없는 하네스, 1440·390, 합성 자료). 화면 확인에서 고칠 것이 나오면 `src/components/calendar/**`만 고친다

## TASK-9: 통계 탭 '예약' 칸 잇기
- Phase: 3
- AC: AC-5907.3
- REQ: REQ-5907
- Files: src/components/stats/useStatsCalendar.ts, src/components/stats/useStatsCalendar.test.ts, src/components/stats/StatsToc.tsx, src/components/stats/StatsToc.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/useStatsCalendar.test.ts, src/components/stats/StatsToc.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — `useStatsCalendar`는 `useStatsSunap` 본보기(늦은 답 버림, [다시 읽기]). 이번 달 1일 −11달 ~ 오늘을 `listCalendarCounts`로 읽고 `rateSummary`·`monthTrend`로 센다. 목차·칸 목록을 고정한 시험은 새 칸 하나만큼만 고친다('예약·전환' 다음 '예약')
