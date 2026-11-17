# 작업 분할: 예약 탭 다듬기 — 색 20색 · 시작 시간 쳐서 넣기 · 같은 시간 하나 더

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. 세 TASK는 파일이 겹치지 않아 Phase 1에서 함께 돈다(일꾼 셋). 검토는 마지막 한 번.

## TASK-1: 예약 색판 20색
- Phase: 1
- AC: AC-6001.1, AC-6001.2, AC-6001.3, AC-6001.4, AC-6001.5
- REQ: REQ-6001
- Files: src/types/calendar.ts, src/components/calendar/colors.ts, src/components/calendar/colors.test.ts, src/components/calendar/CalendarSettings.tsx, src/components/calendar/CalendarSettings.test.tsx, src/components/calendar/CalendarToolbar.tsx, src/app/globals.css, src/app/theme.test.ts, docs/UI_GUIDE.md, src/lib/storage/calendar.test.ts
- Tests: src/components/calendar/colors.test.ts, src/app/theme.test.ts, src/components/calendar/CalendarSettings.test.tsx, src/lib/storage/calendar.test.ts
- TDD: required

## TASK-2: 시작 시간 쳐서 넣기
- Phase: 1
- AC: AC-6002.1, AC-6002.2, AC-6002.3, AC-6002.4
- REQ: REQ-6002
- Files: src/lib/calendar/rules.ts, src/lib/calendar/rules.test.ts, src/components/calendar/AddPanel.tsx, src/components/calendar/AddPanel.test.tsx, src/components/calendar/CalendarScreen.test.tsx
- Tests: src/lib/calendar/rules.test.ts, src/components/calendar/AddPanel.test.tsx, src/components/calendar/CalendarScreen.test.tsx
- TDD: required

## TASK-3: 예약 칸 오른쪽 빈 줄
- Phase: 1
- AC: AC-6003.1, AC-6003.2, AC-6003.3
- REQ: REQ-6003
- Files: src/components/calendar/rows/ApptBlock.tsx, src/components/calendar/rows/TimeGrid.tsx, src/components/calendar/rows/TimeGrid.test.tsx
- Tests: src/components/calendar/rows/TimeGrid.test.tsx
- TDD: required
