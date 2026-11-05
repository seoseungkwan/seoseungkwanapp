# 작업 분할: 통계 파일의 구분 줄·꾸민 합계 표시 줄 건너뛰기

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.

## TASK-1: 과목 구분 줄 건너뛰기
- REQ: REQ-901
- Files: src/lib/parsers/bit/parseBit.ts, src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts, src/types/consumption.ts
- Tests: src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts
- TDD: required

## TASK-2: 꾸민 합계 표시 줄 건너뛰기
- REQ: REQ-902
- Files: src/lib/parsers/bit/parseBit.ts, src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts
- Tests: src/lib/parsers/bit/parseBit.test.ts, src/workers/analyzeFiles.test.ts
- TDD: required
