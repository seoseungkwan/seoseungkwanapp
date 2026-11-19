# 작업 분할: 신환 1명당 탭을 고른 기간 그대로 (pv-month)

> 기준 갈래 `feat-pv-month`(운영 `f26c45a1`에서). 작아서 내 폴더에서 차례로 한다(TASK-1 → TASK-2). 검토는 마지막 한 번.

## TASK-1: Worker가 고른 기간으로 세기
- Phase: 1
- AC: AC-7201.1, AC-7201.2
- REQ: REQ-7201
- Files: src/lib/analytics/patientValue.ts, src/lib/analytics/patientValue.test.ts, src/types/stats.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts
- Tests: src/lib/analytics/patientValue.test.ts, src/workers/stats/jobs.test.ts
- TDD: required — design.md 1절. 옛 `monthValues`·`values` 시험(AC-6911.1~6911.3)은 고치지 않고 통과해야 한다.

## TASK-2: 신환 1명당 탭 글과 기간 넘기기
- Phase: 2
- AC: AC-7202.1, AC-7202.2, AC-7202.3
- REQ: REQ-7202
- Files: src/components/stats/sections/PatientValueSection.tsx, src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/RevenueSection.test.tsx, src/components/stats/sections/StatsSections.tsx
- Tests: src/components/stats/sections/PatientValueSection.test.tsx, src/components/stats/sections/RevenueSection.test.tsx
- TDD: required — design.md 2절. TASK-1 다음. 옛 AC-6911.4 시험은 새 글로 옮기고(AC-7202.x 이름), 막대·받은 치료 이름 시험은 `period` 데이터로 그대로 지킨다. 월간 보고서 시험(AC-6911.5)은 고치지 않고 통과해야 한다.
