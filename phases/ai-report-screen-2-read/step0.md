# Step 0: saved-values-read

> **TASK-4** 저장된 값 읽기 · **REQ-704** · AC-704.1 ~ AC-704.3
> Phase 2 `ai-report-screen-2-read` · Step 0. 이 step이 끝나야 Step 1이 시작한다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-704), `/specs/ai-report-screen/design.md`('읽기는 브라우저 직접 읽기 대신', '서버'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-4)
- `/src/app/api/ai/store.ts`, `/src/app/api/ai/store.test.ts`, `/src/lib/ai/savedReport.ts`(`parseSavedReport`), `/src/types/aiReport.ts`(`SavedReport`·`AiUsageView`), `/supabase/migrations/20261101000000_ai_report.sql`(표의 칸 이름)

## 수정 범위
- `src/app/api/ai/store.ts`, `src/app/api/ai/store.test.ts`

## 작업
```ts
export async function readSavedReport(supabase: SupabaseClient, month: string): Promise<SavedReport | null | 'failed'>
export async function readUsage(supabase: SupabaseClient, thisMonth: string): Promise<AiUsageView | 'failed'>
```
- `readSavedReport`: `ai_reports`에서 `month, report, input_hash, model, created_at`을 그 달 조건 하나로 한 줄 읽는다(`maybeSingle`).
  - 줄이 없으면 `null`. `error`가 있거나 던지거나 `parseSavedReport`가 null이거나 읽은 줄의 달이 요청한 달과 다르면 `'failed'`.
- `readUsage`: `ai_usage`에서 `calls, input_tokens, output_tokens, cost_micro_usd`를 `thisMonth` 조건 하나로 한 줄 읽는다.
  - 줄이 없으면 `{ calls: 0, tokens: 0, costMicroUsd: 0 }`. 있으면 `tokens`는 입력+출력.
  - `error`·던짐이면 `'failed'`. 칸이 유한한 0 이상 숫자가 아니어도 `'failed'`다(모양이 틀린 값을 화면에 보내지 않는다).
- **병원을 고르는 조건을 넣지 않는다**(AC-704.1). RLS가 내 병원 줄만 보여 준다. `select`에도 `hospital_id`를 넣지 않는다. 시험으로 못 박는다.
- `thisMonth`는 인자로 받는다. 이 파일에서 오늘 날짜를 구하지 않는다(경로가 한국 날짜로 구해 넘긴다).
- 오류 내용은 어디에도 내지 않는다. 돌려주는 값은 정확히 `'failed'`다.

## 고쳐야 하는 기존 시험 (이 하나만 허락한다)
`store.test.ts`의 `AC-511.2 store.ts는 첫 줄이 server-only이고, 직접 쓰기·service role·console이 없다`는 소스에 `.from(`이 있으면 실패한다. 이번 TASK의 읽기는 `.from`을 써야 하므로 반드시 깨진다.
- 시험 이름이 막으려는 것은 **직접 쓰기**다. 쓰기 금지는 약하게 하지 않는다: `.insert(`·`.upsert(`·`.update(`·`.delete(` 금지는 그대로 둔다.
- `.from(` 금지는 "소스의 모든 `.from(` 호출이 `.from('ai_reports')` 또는 `.from('ai_usage')`다"로 바꾼다. 그리고 `.from(` 호출이 정확히 2개임을 본다.
- service role·`createClient`·`supabaseServer`·console·fixtures 금지 줄과 첫 줄 검사는 그대로 둔다.
- `addUsage`·`saveReport` 시험의 `touched`가 `['rpc']`인 검사는 그대로 둔다. 쓰기가 `from`을 쓰면 여전히 실패해야 한다. 파일 위쪽 `fakeClient`의 주석에서 "직접 읽기·쓰기"는 뜻이 맞게 고친다.
- 읽기 시험에는 `from` 사슬을 가진 가짜를 따로 만든다. 그 가짜는 부른 표 이름·`select` 글자·`eq` 인자를 기록한다.
- 고친 내용을 답에 적어라. 리뷰어가 본다.

## 시험에 꼭 넣을 것
- AC-704.1: 진짜 Postgres 시각 모양(`2026-11-01T12:34:56.123456+00:00`)의 줄이 `SavedReport`로 나온다 / 줄 없음 → null / `eq`가 `('month', 달)` 한 번뿐이고 `hospital_id`가 어디에도 없다.
- AC-704.2: `error` 있음 / 던짐 / 검사 못 넘는 줄 / 다른 달 줄 → 모두 정확히 `'failed'`. 오류 객체에 든 글자가 답에 없다.
- AC-704.3: 입력+출력 합 / 줄 없음 → 모두 0 / `error`·던짐 → `'failed'` / 칸이 문자·음수·`null`·`NaN` → `'failed'`. 표 이름이 `ai_usage`이고 달 조건이 `thisMonth`다.

## 꼭 지킬 규칙
- `store.ts`는 console을 쓰지 않는다. service role을 쓰지 않는다. 새 클라이언트를 만들지 않는다.
- 앱 경로에 지어낸 숫자를 넣지 않는다. 진짜 Claude를 부르지 않는다.
- `loadReportMonths`·`saveReport`·`addUsage`의 동작을 바꾸지 않는다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-4 --expect red`로 RED를 기록한다. 그 전에는 `store.ts`를 고치지 않는다.
3. 구현 뒤 `... tdd-run TASK-4 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/app/api/ai/store.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-4 --expect green
npx eslint src/app/api/ai/store.ts src/app/api/ai/store.test.ts --max-warnings=0
npx tsc --noEmit
```
`npm run build`·전체 `npm test`·`npm install`은 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 메인이 기록한다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `route.ts`·`generate.ts`를 고치지 마라. 이유: 다음 step이거나 끝난 TASK다.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 위에서 허락한 하나 말고 기존 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
