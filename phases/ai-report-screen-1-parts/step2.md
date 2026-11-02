# Step 2: screen-text

> **TASK-3** 화면 글자를 만드는 순수 함수 · **REQ-703** · AC-703.1 ~ AC-703.8
> Phase 1 `ai-report-screen-1-parts` · Step 2. **병렬 step**: Step 1·3과 같은 폴더에서 동시에 돈다. 수정 파일은 겹치지 않는다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-703 전체 — 글자는 여기가 기준이다), `/specs/ai-report-screen/design.md`('순수 함수'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-3)
- `/src/types/aiReport.ts`(`ShownReport`·`AiUsageView`), `/src/lib/analytics/dates.ts`(`addMonths`·`monthOf`), `/src/lib/ai/markdown.ts`(`TAG_LABEL`을 가져다 쓴다), `/src/components/charts/format.ts`(`formatCount`), `/src/lib/ai/basis.ts`(달 글자 말투), `/src/lib/ai/boundary.test.ts`

## 수정 범위
- `src/lib/ai/reportScreen.ts`, `src/lib/ai/reportScreen.test.ts`

## 작업
```ts
export const REPORT_FIRST_MONTH = '2026-01'
export function firstMonth(today: string): string                // 지난달, 처음 달보다 앞이면 처음 달
export function canGoPrev(month: string): boolean
export function canGoNext(month: string, today: string): boolean
export function longMonth(month: string): string                 // '2026년 10월'
export function shortMonth(month: string): string                // '10월'
export function compareMonths(month: string): string             // '9월, 작년 10월' · 1월이면 '작년 12월, 작년 1월'
export function compareLine(month: string): string               // '2026년 10월을 9월, 작년 10월과 견줘요'
export function madeAtText(createdAt: string, now: Date): string // '방금 만들었어요' · '11월 2일 오전 9:12에 만들었어요'
export function modelName(model: string): string
export function usageText(usage: AiUsageView): { calls: string; tokens: string; cost: string }
export function reportCopyText(report: Pick<ShownReport, 'month' | 'summary' | 'cards'>): string
export function partialNotice(report: Pick<ShownReport, 'month' | 'partial'>, today: string):
  { chip: string; title: string; body: string } | null
```
- `today`는 `YYYY-MM-DD`(한국 날짜)다. 이번 달은 `monthOf(today)`로 구한다. 달 계산을 새로 만들지 않는다.
- `madeAtText`: 시각 차이가 60초 미만이면 '방금'이다(저장 시각이 조금 미래여도 '방금'). 그 밖은 늘 한국 시각이다. 낮 12시는 `오후 12:00`, 밤 0시는 `오전 12:00`이고 분은 두 자리다.
- 시험: 한국 날짜가 UTC와 달라지는 순간(`2026-11-01T15:30:00Z` → `11월 2일 오전 12:30에 만들었어요`)을 넣고, 컴퓨터 시간대가 달라도(`TZ`) 같은 글이 나오는지 본다. 시간대를 바꿨으면 시험 끝에 되돌린다.
- `usageText`: 비용은 **정수로** 센트까지 자른 뒤 글자로 만든다(`Math.floor(micro / 10000)` → 달러·센트, 센트는 두 자리). 소수 계산과 `toFixed`·반올림을 쓰지 않는다. 1,999,999는 `$1.99`, 120,000은 `$0.12`, 0은 `$0.00`이다. 횟수와 토큰은 `formatCount`.
- `reportCopyText`의 모양은 AC-703.7 그대로다. 꼬리표 이름은 `TAG_LABEL`을 쓴다.
- `partialNotice`의 글자는 AC-703.8 그대로이고, `11월` 자리에 그 달 이름이 들어간다.

## 꼭 지킬 규칙
- `src/lib/ai/`는 순수 함수만: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`를 쓰지 않는다.
- `markdown.ts`·`dates.ts`·`format.ts`는 import만 한다(범위 밖).

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-3 --expect red`로 RED를 기록한다. 그 전에는 구현 파일을 만들지 않는다.
3. 구현 뒤 `... tdd-run TASK-3 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/lib/ai/reportScreen.test.ts src/lib/ai/boundary.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-3 --expect green
npx eslint src/lib/ai/reportScreen.ts src/lib/ai/reportScreen.test.ts --max-warnings=0
```
병렬 step이므로 `npm run build`·전체 `npm test`·`npm install`을 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 병렬이라 부딪힌다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
