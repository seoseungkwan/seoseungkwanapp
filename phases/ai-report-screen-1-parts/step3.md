# Step 3: stale-check

> **TASK-5** 숫자가 바뀌었는지 보기 · **REQ-705** · AC-705.1 ~ AC-705.3
> Phase 1 `ai-report-screen-1-parts` · Step 3. **병렬 step**: Step 1·2와 같은 폴더에서 동시에 돈다. 수정 파일은 겹치지 않는다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-705), `/specs/ai-report-screen/design.md`('숫자 바뀜 비교는 만들 때와 같은 코드로', '서버'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-5)
- `/src/app/api/ai/generate.ts`, `/src/app/api/ai/generate.test.ts`, `/src/app/api/ai/store.ts`(`ReportMonths`), `/src/lib/ai/input.ts`(`buildReportInput`·`reportFingerprint`), `/fixtures/fake-ai/`(가짜 세 달)

## 수정 범위
- `src/app/api/ai/generate.ts`, `src/app/api/ai/generate.test.ts`

## 작업
```ts
export async function isReportStale(
  month: string,
  savedHash: string,
  loadMonths: (month: string) => Promise<ReportMonths>,
): Promise<boolean>
```
- `generateReport` 안의 "세 달 읽어 검사 → `buildReportInput`" 부분을 이 파일의 내부 함수 하나로 꺼내 `generateReport`와 `isReportStale`이 함께 쓴다. **두 곳이 따로 입력을 만들면 안 된다.** 어긋나면 모든 리포트에 '숫자가 바뀌었어요'가 잘못 뜬다.
- `generateReport`의 동작은 그대로다(순서·오류 번호·부르는 횟수). 기존 시험은 고치지 않고 그대로 통과해야 한다.
- `isReportStale`:
  - 지금 지문이 `savedHash`와 다르면 true, 같으면 false.
  - 고른 달이 없거나, 검사를 못 넘거나, 그 달이 아닌 자료면 false다.
  - `loadMonths`나 입력 만들기·지문이 던져도 false다(던지지 않는다). 모르면 "바뀌었어요"라고 하지 않고 리포트 보기를 막지 않는다.
  - 비교 달이 검사를 못 넘거나 그 달이 아니면 만들 때처럼 없는 달로 본다.
- 시험 AC-705.1은 **진짜 `generateReport`**로 만든다: 가짜 `callClaude`·`saveReport`로 돌려 저장 지문을 받고, 같은 세 달 자료로 `isReportStale`을 불러 false를 본다. 지문을 손으로 적지 않는다.
- 시험 AC-705.2는 고른 달·지난달·작년 같은 달 각각의 숫자 하나를 바꾼 세 경우를 본다.
- 시험 AC-705.3은 고른 달 없음·검사 실패·다른 달 자료·읽기가 던짐을 보고, 비교 달이 다른 달 자료여도 없는 달로 보아 false인 경우를 본다.

## 꼭 지킬 규칙
- 이 파일은 console을 쓰지 않는다. 오류 내용은 버린다(기존 원칙).
- 앱 경로에 지어낸 숫자를 넣지 않는다. 가짜 숫자는 시험과 `fixtures/fake-ai/`에만 있다.
- 진짜 Claude를 부르지 않는다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect red`로 RED를 기록한다. 그 전에는 `generate.ts`를 고치지 않는다.
3. 구현 뒤 `... tdd-run TASK-5 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/app/api/ai/generate.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect green
npx eslint src/app/api/ai/generate.ts src/app/api/ai/generate.test.ts --max-warnings=0
```
병렬 step이므로 `npm run build`·전체 `npm test`·`npm install`을 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 병렬이라 부딪힌다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `route.ts`·`store.ts`를 고치지 마라. 이유: 다음 단계 TASK다.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
