# 작업 분할: 환자 탭: F/U 명단 읽는 기간을 120일에서 30일로

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> - TASK-1(Worker)과 TASK-2(화면 글자)는 파일이 겹치지 않아 동시에 할 수 있다
> - 시험 자료는 모두 지어낸 값이다. 실제 환자 파일·비트 자료를 열지 않는다
> - 끝나면 `npm run lint`·관련 시험·`npm run build`를 돌리고, 독립 검토는 맨 끝에 한 번만 한다(사용자 지시)

## TASK-1: Worker가 F/U를 오늘 포함 30일 한 조각으로 읽는다
- AC: AC-2401.1, AC-2401.2, AC-2401.3
- REQ: REQ-2401
- Files: src/workers/patients/plan.ts, src/workers/patients/plan.test.ts, src/workers/patients/handler.test.ts, src/workers/patients/jobs.test.ts, src/components/patients/usePatientsWorker.test.ts, fixtures/patients/make-fake-patients.ts, fixtures/patients/fake/targets-followup.json
- Tests: src/workers/patients/plan.test.ts, src/workers/patients/handler.test.ts, src/workers/patients/jobs.test.ts
- TDD: required
- 할 일: design.md '구성 요소'의 `FOLLOWUP_DAYS`·가짜 F/U 조각 하나·시험 옮기기. 환자 자료 구역 울타리(네트워크·console·저장소 없음)를 지킨다

## TASK-2: 읽는 중 안내를 30일로
- AC: AC-2402.1
- REQ: REQ-2402
- Files: src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, docs/mockups/patients/index.html
- Tests: src/components/patients/PatientsScreen.test.tsx
- TDD: required
- 할 일: 30행 `note` 글자와 목업의 같은 글자만 바꾼다
