# 작업 분할: 수납일지 '초진' 글을 '신환'으로

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 화면 글 '초진' → '신환'
- Phase: 1
- AC: AC-5601.1, AC-5601.2, AC-5601.3, AC-5601.4
- REQ: REQ-5601
- Files: src/components/sunap/labels.ts, src/components/sunap/rows/LedgerRows.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/SunapCards.tsx, src/components/sunap/SunapSettings.tsx, src/components/sunap/SunapSettings.test.tsx, src/components/sunap/DoctorTable.tsx, src/components/sunap/DoctorTable.test.tsx, src/components/sunap/RemoteView.test.tsx, src/components/sunap/SunapScreen.test.tsx, src/components/stats/sections/SunapSection.tsx, src/components/stats/sections/SunapSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/sunap/SunapScreen.test.tsx, src/components/sunap/DoctorTable.test.tsx, src/components/sunap/SunapSettings.test.tsx, src/components/stats/sections/SunapSection.test.tsx
- TDD: required
