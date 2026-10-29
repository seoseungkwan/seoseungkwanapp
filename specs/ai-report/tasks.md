# 작업 분할: 월간보고 PPT (AI 요약, 내 양식 고정)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> TASK 번호 = 실행 순서. 시험 `describe` 이름 앞에 AC ID를 붙인다(예: `describe('AC-002.2 countChange', …)`).
> 1단계만 다룬다(로그인·화면·서버 없음). 2단계는 requirements.md '범위 밖'.

## TASK-1: 오류 번호 (보고서·AI 자료·AI 답)
- REQ: REQ-009
- Files: src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/errors.test.ts
- TDD: required

시험: AC-009.1(ALL_CODES 목록에 새 번호 셋 추가, 빠짐없이), AC-009.2(문구 그대로). 기존 AC-003.4 시험은 고치지 않는다.

## TASK-2: 한국 날짜·시각 글자
- REQ: REQ-008
- Files: src/lib/analytics/dates.ts, src/lib/analytics/dates.test.ts
- Tests: src/lib/analytics/dates.test.ts
- TDD: required

시험: AC-008.1(`koreaDateTime`, 시간대를 바꿔도 같은 글자), AC-008.2(`koreanMonth`·`axisMonth`·`monthSpan`). 환자 자료 구역 파일이라 구역 규칙(네트워크·console 금지) 그대로 지킨다.

## TASK-3: 양식 정의
- REQ: REQ-001
- Files: src/types/report.ts, src/lib/report/template.ts, src/lib/report/template.test.ts
- Tests: src/lib/report/template.test.ts
- TDD: required

시험: AC-001.1~AC-001.7. `src/types/report.ts`는 이 TASK에서 만들고 뒤 TASK가 자기 타입을 더한다.

## TASK-4: 숫자·늘고 준 폭 글자
- REQ: REQ-002
- Files: src/types/report.ts, src/lib/report/format.ts, src/lib/report/format.test.ts
- Tests: src/lib/report/format.test.ts
- TDD: required

시험: AC-002.1~AC-002.6.

## TASK-5: 월간 숫자 계산 (카드·그래프·결론 줄·요약 표·계산 기준)
- REQ: REQ-003
- Files: src/types/report.ts, src/lib/report/numbers.ts, src/lib/report/numbers.test.ts
- Tests: src/lib/report/numbers.test.ts
- TDD: required

시험: AC-003.1~AC-003.10. 시험용 달 숫자는 시험 파일 안에서 만들고 `validateMonthPayload`를 통과하는지 먼저 확인한다.

## TASK-6: 개인정보 모양 찾기
- REQ: REQ-004
- Files: src/lib/report/sensitive.ts, src/lib/report/sensitive.test.ts
- Tests: src/lib/report/sensitive.test.ts
- TDD: required

시험: AC-004.1. 주민번호·전화 모양은 파일럿 시험처럼 조각을 이어 만든다(소스에 통째로 쓰지 않는다). `lib/payload/validate.test.ts`의 같은 사례를 넣는다.

## TASK-7: AI 요청 만들기
- REQ: REQ-004
- Files: src/types/report.ts, src/lib/report/aiInput.ts, src/lib/report/aiInput.test.ts
- Tests: src/lib/report/aiInput.test.ts
- TDD: required

시험: AC-004.2~AC-004.6. 실제 API는 부르지 않는다.

## TASK-8: AI 답 검사
- REQ: REQ-005
- Files: src/types/report.ts, src/lib/report/aiAnswer.ts, src/lib/report/aiAnswer.test.ts
- Tests: src/lib/report/aiAnswer.test.ts
- TDD: required

시험: AC-005.1~AC-005.8.

## TASK-9: PPT 만들기 (pptxgenjs 넣기)
- REQ: REQ-006
- Files: package.json, package-lock.json, src/lib/report/deck.ts, src/lib/report/deck.test.ts, src/lib/report/pptxTestUtil.ts
- Tests: src/lib/report/deck.test.ts
- TDD: required

시험: AC-006.1~AC-006.9. RED 전에 `npm install pptxgenjs@4.0.1 jszip@3.10.2 --save-exact`(MIT, 사용자 승인 대상: ADR-016)만 하고, 시험이 "deck.ts가 없어서" 실패하는 것을 확인한 뒤 구현한다. 시험은 만든 바이트를 `pptxTestUtil.ts`(jszip)로 풀어 XML을 본다.

## TASK-10: 예시 PPT와 만들기 명령
- REQ: REQ-007
- Files: package.json, src/lib/report/sample.ts, src/lib/report/sample.test.ts, scripts/make-sample-deck.ts
- Tests: src/lib/report/sample.test.ts
- TDD: required

시험: AC-007.1~AC-007.3. `scripts/make-sample-deck.ts`는 `buildSampleDecks()` 결과를 `out/report/`에 쓰는 몇 줄뿐이라 따로 시험하지 않는다(계산·PPT는 sample.test.ts가 본다). 끝 조건: `npm run report:sample`로 세 파일이 생긴다.
