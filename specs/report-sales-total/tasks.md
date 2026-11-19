# 작업 분할: 월간 보고서 매출 = 총진료비 그대로

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 기준 갈래 `feat-report-sales-total`(운영 `9dd09952`에서). 화면 배치는 그대로이고 숫자 글자만 바뀐다 — 사용자가 고른 보기("바뀜: 매출 13,021,450원")를 notes.md에 적었다.

## TASK-1: 결정 기록
- Phase: 0
- AC: AC-6901.1, AC-6902.1
- REQ: REQ-6901, REQ-6902
- Files: docs/mockups/report-sales-total/notes.md
- Tests: 없음
- TDD: exempt — 결정 기록 문서(사용자 답과 보기 글자).

## TASK-2: 보고서 매출 셈과 원 단위 표시
- Phase: 1
- AC: AC-6901.1, AC-6901.2, AC-6902.1, AC-6902.2, AC-6902.3, AC-6902.4
- REQ: REQ-6901, REQ-6902
- Files: src/components/stats/report/reportData.ts, src/components/stats/report/reportData.test.ts, src/components/stats/report/useReportReads.ts, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/report/reportData.test.ts, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — design.md 1·2절.
