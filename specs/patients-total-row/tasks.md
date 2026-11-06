# 작업 분할: 환자 탭: 도우미 83 표 끝 총계 줄을 환자 줄로 읽지 않기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> - 시험 자료는 모두 지어낸 값이다(가짜 조각 `fixtures/patients/fake/targets-*.json`에 시험 안에서 총계 줄을 덧붙인다). 실제 환자 파일·비트 자료를 열지 않는다
> - 끝나면 `npm run lint`·관련 시험·`npm run build`를 돌린다

## TASK-1: Worker가 도우미 83 표의 총계 줄을 거른다
- AC: AC-2201.1, AC-2201.2, AC-2201.3, AC-2201.4, AC-2201.5
- REQ: REQ-2201
- Files: src/workers/patients/jobs.ts, src/workers/patients/jobs.test.ts, src/workers/patients/handler.test.ts
- Tests: src/workers/patients/jobs.test.ts, src/workers/patients/handler.test.ts
- TDD: required
- 할 일: design.md '구성 요소'의 `isHelperTotalRow`·`dropHelperTotalRows`·`scheduleOf`. AC-2201.1~2201.4는 jobs.test.ts, AC-2201.5(Worker 전체 흐름)는 handler.test.ts. 환자 자료 구역 울타리(네트워크·console·저장소 없음)를 지킨다
