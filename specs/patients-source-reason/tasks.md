# 작업 분할: 환자 탭 E-PATIENTS-SOURCE 오류 이유 낱말 보이기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> - 차례: TASK-1(Worker) → TASK-2(화면). TASK-2는 TASK-1의 `ViewReasons`·`isPatientsSourceReason`을 쓴다
> - 시험 자료는 모두 지어낸 값이다. 실제 환자 파일·비트 자료를 열지 않는다
> - 끝나면 `npm run lint`·`npm test`·`npm run build`를 돌린다

## TASK-1: Worker가 views 답에 이유를 싣는다
- AC: AC-2101.1, AC-2101.2, AC-2101.3
- REQ: REQ-2101
- Files: src/types/patients.ts, src/workers/patients/handler.ts, src/workers/patients/handler.test.ts
- Tests: src/workers/patients/handler.test.ts
- TDD: required
- 할 일: design.md '구성 요소'의 `types/patients.ts`·`handler.ts`. 지금 있는 AC-604.3 시험의 뜻은 바꾸지 않는다. 환자 자료 구역 울타리(네트워크·console·저장소 없음)를 지킨다

## TASK-2: 화면이 번호 줄에 이유 낱말을 붙인다
- AC: AC-2102.1, AC-2102.2, AC-2102.3
- REQ: REQ-2102
- Files: src/components/patients/usePatientsWorker.ts, src/components/patients/PatientsScreen.tsx, src/components/patients/PatientsScreen.test.tsx, src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.test.tsx
- Tests: src/components/patients/PatientsScreen.test.tsx, src/components/common/ErrorCard.test.tsx
- TDD: required
- 할 일: design.md '구성 요소'의 `usePatientsWorker.ts`·`PatientsScreen.tsx`·`ErrorCard.tsx`. 번호 줄은 글자 한 덩어리로 둔다(지금 시험의 `getByText('오류 번호 …')`가 그대로 통과)
