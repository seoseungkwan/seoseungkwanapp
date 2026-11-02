# Step 1: saved-report-check

> **TASK-2** 저장된 리포트 검사 · **REQ-702** · AC-702.1 ~ AC-702.3
> Phase 1 `ai-report-screen-1-parts` · Step 1. **병렬 step**: Step 2·3과 같은 폴더에서 동시에 돈다. 수정 파일은 겹치지 않는다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-702), `/specs/ai-report-screen/design.md`('순수 함수'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-2)
- `/src/types/aiReport.ts`(Step 0이 더한 `ShownReport`), `/src/lib/ai/output.ts`(같은 말투의 검사: 정해 둔 칸만 골라 새 객체)
- `/src/lib/ai/boundary.test.ts`(이 폴더 울타리), `/src/lib/analytics/dates.ts`(`isMonth`), `/supabase/migrations/20261101000000_ai_report.sql`(칸 이름)

## 수정 범위
- `src/lib/ai/savedReport.ts`, `src/lib/ai/savedReport.test.ts`

## 작업
```ts
export function parseSavedReport(row: unknown): SavedReport | null
export function parseShownReport(value: unknown): ShownReport | null
```
- `parseSavedReport`가 받는 모양은 DB 줄이다: `{ month, report: { partial, summary, cards }, input_hash, model, created_at }`. 돌려주는 값은 `SavedReport`(`inputHash`·`createdAt`, 카멜 표기)다.
- `parseShownReport`가 받는 모양은 서버 답의 리포트다: `{ month, partial, summary, cards, model, createdAt }`. 다른 칸이 더 있어도(예: `POST` 답의 `inputHash`) 돌려준 값에는 없다.
- 두 함수는 카드 검사를 함께 쓴다. 카드는 `{ tag, text, metric, basis }`이고, `tag`는 `up`·`down`·`watch`·`guess` 넷 가운데 하나, 나머지는 글자다.
- 이렇게 하면 null이다: 객체가 아님, 칸이 빠짐, 글자 칸이 글자가 아님, `partial`이 참·거짓이 아님, `month`가 `isMonth`를 못 넘음, `cards`가 배열이 아님, 꼬리표가 넷 밖임, **`created_at`이 날짜로 읽히지 않음**(뒤에서 시각 글자를 만들 때 터지지 않게. 시험은 AC-702.2 이름으로).
- 카드 개수는 여기서 보지 않는다(3~8개 규칙은 AI 답을 받을 때 `output.ts`가 본다). 빈 목록도 통과한다.
- 정해 둔 칸만 골라 새 객체로 돌려준다. 카드 안과 `report` 안의 남는 칸은 버린다(AC-702.3).

## 꼭 지킬 규칙
- `src/lib/ai/`는 순수 함수만: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`를 쓰지 않는다.
- `output.ts`를 고치지 않는다(범위 밖). 꼬리표 목록은 이 파일에 따로 둔다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-2 --expect red`로 RED를 기록한다. 그 전에는 구현 파일을 만들지 않는다.
3. 구현 뒤 `... tdd-run TASK-2 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/lib/ai/savedReport.test.ts src/lib/ai/boundary.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-2 --expect green
npx eslint src/lib/ai/savedReport.ts src/lib/ai/savedReport.test.ts --max-warnings=0
```
병렬 step이므로 `npm run build`·전체 `npm test`·`npm install`을 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 병렬이라 부딪힌다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
