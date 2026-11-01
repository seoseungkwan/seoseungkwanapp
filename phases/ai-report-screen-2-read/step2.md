# Step 2: report-client

> **TASK-7** 브라우저 쪽 부르기 · **REQ-707** · AC-707.1 ~ AC-707.4
> Phase 2 `ai-report-screen-2-read` · Step 2. **병렬 step**: Step 1과 같은 폴더에서 동시에 돈다. 수정 파일은 겹치지 않는다. 공유 타입과 `parseShownReport`만 쓴다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-707, REQ-713), `/specs/ai-report-screen/design.md`('브라우저', '뒷단에서 넘겨받은 것' 1번), `/specs/ai-report-screen/tasks.md`(머리말, TASK-7)
- `/src/types/aiReport.ts`(`ReportView`·`ShownReport`·`AiUsageView`·`AiErrorCode`), `/src/lib/ai/savedReport.ts`(`parseShownReport`)

## 수정 범위
- `src/components/ai-report/reportClient.ts`, `src/components/ai-report/reportClient.test.ts` (새 파일)

## 작업
design.md의 타입 그대로 export한다.
```ts
type Reauth = { kind: 'reauth' }
type LoadResult = { kind: 'ok'; view: ReportView } | { kind: 'error'; code: 'E-AI-READ' } | Reauth
type AnalyzeResult = { kind: 'ok'; report: ShownReport } | { kind: 'error'; code: AiErrorCode } | Reauth
export async function loadMonth(month: string): Promise<LoadResult>
export async function analyzeMonth(month: string): Promise<AnalyzeResult>
```
**두 함수는 절대 던지지 않는다.** 결과는 값으로 돌려준다.

공통:
- 주소는 같은 origin의 상대 경로 `/api/ai/report`다. 두 부름 모두 `redirect: 'manual'`이다.
- **"로그인 확인 필요"(`reauth`) 판정**: 상태 401·403, 3xx, 그리고 **`response.type === 'opaqueredirect'`**. 이 판정은 몸통을 읽기 전에 한다.
  - 진짜 브라우저는 `redirect: 'manual'`일 때 돌려보내는 응답을 `type: 'opaqueredirect'`, **`status: 0`** 으로 준다. 3xx 숫자만 보면 실제 브라우저에서 놓친다. 이 경우를 반드시 시험한다(`Response` 생성자로는 status 0을 못 만드니 시험에서는 모양을 흉내 낸 객체를 쓴다).
- 페이지 다시 읽기(`location.reload`)는 화면(TASK-9)의 일이다. 이 파일은 `reauth`를 돌려주기만 한다.
- console을 쓰지 않는다. 다시 시도하지 않는다. 시간 한도를 새로 두지 않는다.

`loadMonth(month)`:
- `GET /api/ai/report?month=` + `encodeURIComponent(month)`. `cache: 'no-store'`.
- 200이고 모양이 맞으면 `{ kind: 'ok', view }`. 모양: `report`가 `null`이거나 `parseShownReport`를 통과, `stale`이 boolean, `usage`의 `calls`·`tokens`·`costMicroUsd`가 유한한 0 이상 숫자. `view.report`에는 **검사가 돌려준 값**을 쓴다.
- 그 밖은 모두 `{ kind: 'error', code: 'E-AI-READ' }`: 연결 끊김, 몸통 읽다 끊김, JSON 아님, 모양 틀림, 그 밖의 상태.

`analyzeMonth(month)`:
- `POST /api/ai/report`, 머리 `Content-Type: application/json`, 몸통은 정확히 `{"month":"YYYY-MM"}`. 숫자나 다른 칸을 보내지 않는다.
- 판정 순서(reauth를 본 뒤):
  1. 응답을 못 받음(`fetch`가 던짐) 또는 몸통을 읽다 끊김 → `E-AI-BUSY`.
  2. 몸통이 JSON 객체이고 `code`가 AI 오류 번호 넷 중 하나 → 그 번호. `E-AI-READ`나 모르는 번호는 AI 오류 번호가 아니다(이 판정을 지나쳐 3·4·5로 간다).
  3. 200이고 `parseShownReport(body.report)`가 통과 → `{ kind: 'ok', report }`.
  4. 5xx이고 몸통이 비었거나 JSON이 아님 → `E-AI-BUSY`.
  5. 그 밖 → `E-AI-FAILED`. (200인데 모양 틀림, 400, 5xx인데 JSON이지만 AI 번호 아님 등)
- 네 번호 목록은 `includes`로 글자를 비교한다. `code`가 글자가 아니거나 `__proto__` 같은 값이어도 안전해야 한다.

## 시험에 꼭 넣을 것
`vi.stubGlobal('fetch', ...)`로 가짜를 둔다. 끝나면 되돌린다.
- AC-707.1: 주소가 정확히 `/api/ai/report`(http로 시작하지 않음), `method: 'POST'`, 몸통 글자가 정확히 `{"month":"2026-10"}`, `redirect: 'manual'`.
- `loadMonth`도 주소에 달이 들어가고 `redirect: 'manual'`이다.
- AC-707.2: 200 `{ report }` → 그 리포트 / 네 번호 각각 / `E-AI-READ` 번호를 담은 502 JSON → `E-AI-FAILED` / `fetch` 던짐·몸통 읽다 던짐 → `E-AI-BUSY` / 몸통 없는 503·HTML 502 → `E-AI-BUSY` / 번호 없는 JSON 500 → `E-AI-FAILED` / 200 모양 틀림·JSON 아닌 200 → `E-AI-FAILED` / 400 → `E-AI-FAILED`.
- AC-707.3: 정상 리포트·`report: null` → ok / `report` 모양 틀림·`stale` 없음·`usage` 칸 빠짐·음수·문자 → `E-AI-READ` / `fetch` 던짐·JSON 아님·500 → `E-AI-READ`. 응답에 `inputHash`가 더 와도 `view.report`에 남지 않는다.
- AC-707.4: 두 함수 모두 401·403·302·`opaqueredirect`(status 0) → `{ kind: 'reauth' }`. 이때 몸통을 읽지 않는다(`json`·`text`가 불리지 않음).
- 두 함수가 어떤 경우에도 reject하지 않는다.

## 꼭 지킬 규칙
- 앱 경로에 지어낸 숫자를 넣지 않는다. 시험 값은 시험 파일 안에만 둔다.
- `server-only`·`supabase`·SDK를 import하지 않는다. 이 파일은 브라우저 코드다.
- 환자 자료 구역(`lib/payload`·`lib/analytics`·`lib/parsers`)을 고치지 않는다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect red`로 RED를 기록한다. 그 전에는 `reportClient.ts`를 만들지 않는다.
3. 구현 뒤 `... tdd-run TASK-7 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/components/ai-report/reportClient.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect green
npx eslint src/components/ai-report/reportClient.ts src/components/ai-report/reportClient.test.ts --max-warnings=0
```
병렬 step이므로 `npm run build`·전체 `npm test`·`npx tsc`·`npm install`을 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 병렬이라 부딪힌다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `src/app/**`를 고치지 마라. 이유: 병렬 step의 파일이다. 화면 부품(`AiReportScreen` 등)을 만들지 마라. 이유: 다음 단계 TASK다.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
