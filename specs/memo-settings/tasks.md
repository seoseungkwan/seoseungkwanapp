# 작업 분할: 청구메모 설정 확장

> 형식: `## TASK-n: 제목` + `- REQ:` / `- Files:`(승인 뒤 고칠 수 있는 범위) / `- Tests:` / `- TDD:`.
> **차례**: Phase 1(TASK-1 ∥ TASK-2) → Phase 2(엔진 TASK-3→4→5 차례로 ∥ 화면 TASK-6→7 차례로) → Phase 3(합치기·전체 검사·마지막 검토 한 번). 동시에 일꾼 2명까지, 같은 파일을 함께 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 화면 시안 `docs/mockups/memo-settings/index.html`을 사용자에게 보인다. 이 명세 승인을 시안 승인으로도 본다
2. 사용자가 `/sdd approve memo-settings`를 입력한다

## TASK-1: 설정 값 모양 memoRules·검사·비교 이름표
- REQ: REQ-3006
- Files: src/lib/precheck/memo/types.ts, src/lib/precheck/memo/phrases.ts, src/lib/precheck/memo/phrases.test.ts, src/lib/precheck/memo/index.ts
- Tests: src/lib/precheck/memo/phrases.test.ts
- TDD: required — `validateMemoRules`(맞는 값·틀린 값 경로·없어도 지남), `diffPhrases` 새 이름표. 골든 phrases-engine은 그대로 통과
- 차례: Phase 1

## TASK-2: 처방코드 목록 만들기(통계 날별 처방)
- REQ: REQ-3004
- Files: src/components/settings/codeCatalog.ts, src/components/settings/codeCatalog.test.ts
- Tests: src/components/settings/codeCatalog.test.ts
- TDD: required — AC-3004.2: 최근 92일·전체·사전 코드 늘 포함·새 코드 표시·정렬·마지막 처방일
- 차례: Phase 1 (TASK-1과 함께)

## TASK-3: 엔진 고장 2개(IA 부위·아라간 날 일반 약)
- REQ: REQ-3001
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/*.test.ts, fixtures/precheck/golden/memo-*.json, scripts/precheck/golden/memo.mjs
- Tests: src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/golden.test.ts
- TDD: required — AC-3001.1~3001.3. 달라진 골든 사례는 `knownDiffCases`에 where와 함께(스크립트 DIFF_CASES도 같이)
- 차례: Phase 2-가 (TASK-1 뒤)

## TASK-4: 시술 2개 이상인 날의 약 + 고르는 칸 두 개
- REQ: REQ-3002, REQ-3003
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/drugs.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/*.test.ts, fixtures/precheck/golden/memo-*.json, scripts/precheck/golden/memo.mjs
- Tests: src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/drugs.test.ts, src/lib/precheck/memo/golden.test.ts
- TDD: required — AC-3002.1~3002.5, AC-3003.1~3003.2. 기존 AC-014.10 시험은 `singleOwnerDrug:false`로 남긴다
- 차례: Phase 2-가 (TASK-3 뒤)

## TASK-5: [코드 확인]과 줄 순서
- REQ: REQ-3004, REQ-3005
- Files: src/lib/precheck/memo/engine.ts, src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/golden.test.ts, src/lib/precheck/memo/*.test.ts, fixtures/precheck/golden/memo-*.json, scripts/precheck/golden/memo.mjs, src/workers/precheck/jobs.test.ts
- Tests: src/lib/precheck/memo/memoSettings.test.ts, src/lib/precheck/memo/golden.test.ts
- TDD: required — AC-3004.1, AC-3005.1~3005.2
- 차례: Phase 2-가 (TASK-4 뒤)

## TASK-6: 설정 화면 묶음 나누기·표기 규칙·시술 문구·저장 전 비교
- REQ: REQ-3002, REQ-3007
- Files: src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/ProcedureDrugs.tsx, src/components/settings/ProcedureDrugs.test.tsx, src/components/settings/phrases/**
- Tests: src/components/settings/HospitalPhrases.test.tsx, src/components/settings/ProcedureDrugs.test.tsx, src/components/settings/phrases/**
- TDD: required — AC-3002.6, AC-3007.1·3007.2·3007.3·3007.5·3007.6
- 차례: Phase 2-나 (TASK-1 뒤, 엔진과 함께)

## TASK-7: 처방코드 묶음·메모 시험 묶음
- REQ: REQ-3004, REQ-3007
- Files: src/components/settings/HospitalPhrases.tsx, src/components/settings/HospitalPhrases.test.tsx, src/components/settings/phrases/**, src/components/settings/codeCatalog.ts
- Tests: src/components/settings/phrases/**, src/components/settings/HospitalPhrases.test.tsx
- TDD: required — AC-3004.3·3004.4·3004.5, AC-3007.4
- 차례: Phase 2-나 (TASK-2·TASK-6 뒤)
