# 작업 분할: 환자 구성 동네 이름 겹침 구별

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: [구·시] 이름 겹침 구별
- REQ: REQ-3901
- Files: src/lib/analytics/patientMix.ts, src/lib/analytics/patientMix.test.ts
- Tests: src/lib/analytics/patientMix.test.ts
- TDD: required
