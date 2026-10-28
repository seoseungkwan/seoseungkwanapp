# 작업 분할: 통계 엔진: 파일럿 계산 이식 + 새 지표

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 옮기는 원본: `seoseungkwan/tonggye-bunseok` main `fbb303a`(같은 경로). 옮긴 시험의 `describe` 이름 앞에 AC ID를 붙인다.

## TASK-1: 프로젝트 뼈대 (Next.js 15 · TypeScript · vitest · ESLint)
- REQ: REQ-001
- Files: package.json, package-lock.json, tsconfig.json, next.config.ts, vitest.config.ts, eslint.config.mjs, .gitignore, src/app/layout.tsx, src/app/page.tsx
- TDD: exempt — 설정·스캐폴딩만 한다. 계산 코드가 없고, `npm test`·`npm run lint`·`npm run build`가 도는 것까지가 끝이다. eslint.config.mjs는 next 기본 규칙만(구역 규칙은 TASK-2)

## TASK-2: 환자 자료 구역 울타리 (ESLint)
- REQ: REQ-001
- Files: eslint.config.mjs, src/guardrails.test.ts
- Tests: src/guardrails.test.ts
- TDD: required

## TASK-3: 날짜 계산
- REQ: REQ-002
- Files: src/types/dates.ts, src/lib/analytics/dates.ts, src/lib/analytics/dates.test.ts
- Tests: src/lib/analytics/dates.test.ts
- TDD: required

## TASK-4: 파일 읽기 공통 · 지역 · 오류 번호
- REQ: REQ-003
- Files: src/types/parse.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/lib/parsers/common.ts, src/lib/parsers/common.test.ts, src/lib/parsers/region.ts, src/lib/parsers/region.test.ts
- Tests: src/lib/errors.test.ts, src/lib/parsers/common.test.ts, src/lib/parsers/region.test.ts
- TDD: required

## TASK-5: 가짜 비트 파일
- REQ: REQ-005
- Files: fixtures/make-fake-fixtures.ts, fixtures/make-fake-fixtures.test.ts, fixtures/fake-bit/*, public/fake-sample/*
- Tests: fixtures/make-fake-fixtures.test.ts
- TDD: required

## TASK-6: 비트 파서 + 붙여 쓴 주민번호 검사
- REQ: REQ-004
- Files: src/types/consumption.ts, src/lib/parsers/bit/*
- Tests: src/lib/parsers/bit/columnMap.test.ts, src/lib/parsers/bit/header.test.ts, src/lib/parsers/bit/patientIds.test.ts, src/lib/parsers/bit/parseBit.test.ts
- TDD: required

## TASK-7: 칸마다 세기 (처방 재진 · 그룹 · 재방문)
- REQ: REQ-006
- Files: src/types/analysis.ts, src/lib/analytics/aggregate.ts, src/lib/analytics/aggregate.test.ts
- Tests: src/lib/analytics/aggregate.test.ts
- TDD: required

## TASK-8: 요약·증감 (비율 · 재방문 집계 중 · 그룹 비교)
- REQ: REQ-007
- Files: src/types/analysis.ts, src/lib/analytics/coverage.ts, src/lib/analytics/coverage.test.ts, src/lib/analytics/compare.ts, src/lib/analytics/compare.test.ts
- Tests: src/lib/analytics/coverage.test.ts, src/lib/analytics/compare.test.ts
- TDD: required

## TASK-9: 저장 모양 v2 (달 숫자 · 일 숫자 · 검사)
- REQ: REQ-008
- Files: src/types/payload.ts, src/types/analyze.ts, src/lib/payload/*
- Tests: src/lib/payload/toMonthPayload.test.ts, src/lib/payload/toDayPayloads.test.ts, src/lib/payload/validate.test.ts
- TDD: required

## TASK-10: 저장된 달 기록 보기
- REQ: REQ-009
- Files: src/types/history.ts, src/lib/analytics/history.ts, src/lib/analytics/history.test.ts
- Tests: src/lib/analytics/history.test.ts
- TDD: required

## TASK-11: Web Worker 분석 + 그룹 전달
- REQ: REQ-010
- Files: src/types/analyze.ts, src/workers/*
- Tests: src/workers/analyzeFiles.test.ts, src/workers/runAnalysis.test.ts
- TDD: required
