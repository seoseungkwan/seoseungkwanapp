# Step 1: claude-stream-errors-log

> **TASK-10** Claude 부르기 — 고친 점: 조각 도중 오류 나누기, SDK 로그 끄기 · **REQ-510** · AC-510.7, AC-510.9 ~ AC-510.11
> Phase 3c `ai-report-3c-fixes` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3c
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점' 9~11, 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-10의 '할 일(3c)'만 한다. 다른 TASK의 일은 하지 않는다.
> **차례로 돈다**: Step 0 → Step 1. 두 step은 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않는다. **이 step에는 `npm install`이 없다**(SDK 1.3.0 그대로).

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-510에 있다. 시험 이름에 이 AC ID를 넣는다.

- **AC-510.7**(넓어짐): 조각 받는 도중 온 오류(상태가 없는 `APIError`에 `type`이 있음)는 `type`이 `rate_limit_error`·`overloaded_error`·`api_error`·`timeout_error`면 `E-AI-BUSY`, `billing_error`면 `E-AI-LIMIT`, 그 밖의 `type`(예: `invalid_request_error`·`authentication_error`·모르는 `type`)이면 `E-AI-FAILED`, 사용량 없음. 같은 오류가 HTTP 상태로 와도(504 `timeout_error`, 402 `billing_error`) 같은 번호
- **AC-510.9**: 조각 받는 도중 연결이 끊김(`cause`에 `TypeError: terminated`를 담은 `AnthropicError`), 또는 끝맺지 않고 닫힘(`message_stop` 없이 닫혀 `stream ended without producing a Message with role=assistant`나 `request ended without sending any chunks`)이면 `E-AI-BUSY`, 사용량 없음. 끝까지 받은 답은 그대로 성공
- **AC-510.10**: `APIError` 아닌 `AnthropicError`인데 끊김·끝맺지 않음이 아니면(예: 열쇠에 헤더에 못 쓰는 글자, `ANTHROPIC_BASE_URL`이 주소 모양이 아님, JSON으로 못 바꾸는 요청, 깨진 조각, 모양·순서가 틀린 조각, 몸통 없는 응답, `terminated`가 아닌 `TypeError`) `E-AI-FAILED`, 사용량 없음, 결과에 열쇠 글자 없음
- **AC-510.11**: `callClaude`가 스스로 만든 SDK 클라이언트(`deps.client` 없음)는 깨진 조각·`ANTHROPIC_LOG=debug`·재시도되는 HTTP 오류에도 `console`의 어느 함수도 부르지 않는다. `timeout`·`maxRetries`는 그대로
- AC-510.1 ~ AC-510.8의 기존 시험은 그대로 통과해야 한다(AC-510.7의 기존 시험도 지금 뜻 그대로 맞다)

## 읽어야 할 파일

- `/CLAUDE.md` (서버 코드는 `app/api/ai/` 하나, 비밀값, AI 경로 로그 규칙)
- `/specs/ai-report/requirements.md` — '고친 점' 10·11, REQ-510
- `/specs/ai-report/design.md` — 'Claude 부르기'의 SDK 로그 끄기, 오류 나누기 1~6과 그 아래 까닭, '결정과 트레이드오프'의 '끊김은 SDK 글자로 알아본다', '위험' 7
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3c, TASK-10 '할 일(3c)'
- 이전 step에서 만든 파일:
  - `src/app/api/ai/claude.ts` (`errorCode`·`BUSY_TYPES`, 43번째 줄쯤의 `new Anthropic`)
  - `src/app/api/ai/claude.test.ts` (`fakeClient`·`message()`·`errorBody()` 도우미)
- SDK(읽기만, `node_modules/@anthropic-ai/sdk` 1.3.0) — 설계가 기댄 사실을 다시 확인할 때:
  - `lib/BetaMessageStream.js`: `_handleError`(모든 `Error`를 `new AnthropicError(error.message)`로 감싸고 `cause`에 원본), `_getFinalMessage`(`stream ended without producing a Message with role=assistant`), `_endRequest`(`request ended without sending any chunks`), `accumulateMessage`(`Unexpected event order…`)
  - `core/streaming.js`: 깨진 조각의 `logger.error`, SSE `error` 이벤트 → 상태 없는 `APIError`, `Attempted to iterate over a response with no body`
  - `client.js` 생성자의 `logLevel` 차례, `makeRequest`(`fetch()` 실패 → `APIConnectionError`), `internal/utils/log.js`(`makeLogFn`, console 객체별 캐시 `cachedLoggers`)
- 설계가 기댄 사실이 SDK와 다르면 구현을 바꾸지 말고 `blocked`로 멈춘다(무엇이 어떻게 다른지 적는다)

## 수정 범위 (tasks.md TASK-10)

- Files: `package.json`, `package-lock.json`, `src/app/api/ai/claude.ts`, `src/app/api/ai/claude.test.ts`
- Tests: `src/app/api/ai/claude.test.ts`
- TDD: required
- **이 step은 `src/app/api/ai/claude.ts`·`claude.test.ts`만 고친다.** `package.json`·`package-lock.json`은 고치지 않는다(`npm install` 없음)

## 꼭 지킬 규칙 (CRITICAL)

- **첫 줄 `import 'server-only'`** 그대로 (AC-513.2)
- **열쇠**: `process.env.ANTHROPIC_API_KEY`만, 시험은 `sk-ant-fake…`. 열쇠·오류 내용을 로그·결과에 담지 않는다. 이 파일은 `console`을 쓰지 않는다. 열쇠에 가운데 줄바꿈이 있으면 SDK 오류 글자에 열쇠가 그대로 든다 — 오류 글자를 어디에도 옮기지 않는다
- **진짜 Claude·네트워크를 쓰지 않는다**: 새 시험의 `fetch`는 늘 가짜다. 이 세션도 진짜 API를 부르지 않는다(비용)
- **SDK 클라이언트 설정은 한 칸만 바꾼다**: `new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1, logLevel: 'off' })`. `phases/ai-report-3b-fixes/step4.md`의 "SDK 클라이언트 설정은 그대로"를 **`logLevel` 이 칸 하나에 한해** 이 step이 덮어쓴다. `timeout`·`maxRetries`는 그대로 둔다
- **오류 나누기 차례**(design '오류 나누기' 1~6): 신호 끊김·`APIUserAbortError`를 지금처럼 가장 먼저 본다
- **넓은 규칙을 쓰지 않는다**: "`APIError`가 아닌 `AnthropicError`면 BUSY"나 "`cause`가 `TypeError`면 BUSY"로 쓰지 않는다. SDK가 부르기 안의 모든 `Error`를 `AnthropicError`로 감싸므로, 열쇠·주소 설정 잘못과 코드 잘못까지 "AI가 바쁘다"고 말하게 된다

## 작업

### 1. 오류 나누기 (AC-510.7·AC-510.9·AC-510.10, design '오류 나누기' 1~6)

```ts
import Anthropic, { AnthropicError, APIConnectionError, APIError, APIUserAbortError, InternalServerError, RateLimitError } from '@anthropic-ai/sdk'

const BUSY_TYPES: ReadonlySet<string> = new Set(['rate_limit_error', 'overloaded_error', 'api_error', 'timeout_error'])
// SDK 1.3.0 lib/BetaMessageStream.js가 조각이 끝맺지 않고 닫혔을 때 던지는 글자. 시험이 진짜 SDK로 이 글자를 지킨다
const ENDED_EARLY: ReadonlySet<string> = new Set([
  'stream ended without producing a Message with role=assistant',
  'request ended without sending any chunks',
])

function errorCode(err: unknown, signal: AbortSignal): AiErrorCode {
  if (signal.aborted || err instanceof APIUserAbortError) return 'E-AI-BUSY'
  if (err instanceof APIConnectionError || err instanceof RateLimitError || err instanceof InternalServerError) return 'E-AI-BUSY'
  if (err instanceof APIError) {
    if (err.status === 402) return 'E-AI-LIMIT'
    if (err.status === undefined && err.type === 'billing_error') return 'E-AI-LIMIT'
    if (err.status === undefined && err.type !== null && BUSY_TYPES.has(err.type)) return 'E-AI-BUSY'
    return 'E-AI-FAILED'
  }
  if (err instanceof AnthropicError) {
    if (err.cause instanceof TypeError && err.cause.message === 'terminated') return 'E-AI-BUSY'
    if (ENDED_EARLY.has(err.message)) return 'E-AI-BUSY'
  }
  return 'E-AI-FAILED'
}
```

- `errorCode` 위 주석의 'design 오류 나누기 1~5'를 '1~6'으로 고친다

### 2. SDK 로그 끄기 (AC-510.11, design 'Claude 부르기')

- `new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1, logLevel: 'off' })`. 옵션이 `ANTHROPIC_LOG`를 이긴다(SDK 1.3.0 `client.js`)

### 3. 시험 (`src/app/api/ai/claude.test.ts`에 더한다)

**클라이언트 설정을 시험하는 법**: 지금 시험 파일은 클라이언트 설정을 고정하지 않는다. 모든 시험이 `deps.client`를 넣어서 `new Anthropic` 줄을 아예 돌리지 않고, `vi.mock`도 없다. 그래서 따라 할 본보기가 없다. `vi.mock('@anthropic-ai/sdk')`로 생성자 인자를 보지 마라(오류 클래스까지 바뀌어 `instanceof` 시험이 무너지고, 로그가 정말 꺼졌는지는 보지 못한다). 대신 **`deps.client`를 넣지 않고 진짜 SDK 클래스 + 가짜 `fetch`로 동작을 본다**: `callClaude(REQ, { apiKey: FAKE_KEY })`. 네트워크가 없고 열쇠는 가짜다. `timeout`·`maxRetries` 글자는 아래 'Acceptance Criteria'의 찾기 명령이 지킨다.

도우미(이 모양은 명세를 고칠 때 진짜 SDK로 돌려 확인했다):

```ts
const enc = new TextEncoder()
const sse = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
const sseError = (type: string) => sse('error', { type: 'error', error: { type, message: `가짜 ${type}` } })
const MALFORMED = 'event: content_block_delta\ndata: {"type":"content_block_delta" 비밀조각\n\n'
// START(message_start)·BLOCK(content_block_start)·DELTA(text_delta)·BLOCK_STOP·MSG_DELTA·MSG_STOP도 sse(...)로 만든다

// pull로 하나씩 준다: controller.error()는 쌓여 있던 조각을 버려서, start에서 넣고 바로 error하면 앞 조각이 전해지지 않는다
function sseResponse(chunks: string[], end: 'close' | Error = 'close'): Response {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) return c.enqueue(enc.encode(chunks[i++]))
      if (end === 'close') c.close()
      else c.error(end)
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
// retry-after-ms: SDK 재시도를 기다리지 않게
function jsonError(status: number, type: string): Response {
  return new Response(JSON.stringify(errorBody(type)), { status, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } })
}
function fakeFetch(make: () => Response) {
  const f = vi.fn(async () => make())
  vi.stubGlobal('fetch', f)
  return f
}
// 시험마다 새 console 객체를 넣는다(아래 함정 1)
function freshConsole() {
  const c = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  vi.stubGlobal('console', c)
  return c
}
const terminated = () => new TypeError('terminated', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
```

**함정**(모두 실제로 돌려 확인했다):

1. **`vi.spyOn(console, 'error')`로 AC-510.11을 보지 마라.** SDK는 로거를 console 객체별로 캐시하고(`internal/utils/log.js` `cachedLoggers`) 그때의 함수를 묶어 둔다. 앞 시험이 진짜 클라이언트를 이미 만들었으면 뒤에 단 spy는 호출을 못 본다 — **고치기 전 코드에서도 시험이 통과해 RED를 놓친다**. 시험마다 `freshConsole()`로 새 객체를 넣고, 그 다음에 `callClaude`를 부른다
2. 진짜 SDK를 쓰는 시험이 가짜 `fetch`를 빠뜨리면 네트워크로 나간다. `describe`의 `beforeEach`에서 먼저 실패하는 가짜를 넣어 막는다: `vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('가짜 fetch를 먼저 넣어야 한다'))))`
3. 파일 맨 위 `afterEach`에 `vi.unstubAllGlobals()`를 더한다(`console`·`fetch`가 다음 시험으로 새지 않게). `vi.restoreAllMocks()`는 이것을 되돌리지 않는다

시험 목록(시험 이름에 AC ID):

- **AC-510.7**: 가짜 클라이언트로 상태 없는 `timeout_error` → BUSY, `billing_error` → LIMIT. 진짜 SDK로 SSE `error` 이벤트 `timeout_error`·`api_error` → BUSY, `billing_error` → LIMIT, `invalid_request_error`·`authentication_error`·`some_new_error` → FAILED. 같은 오류의 두 길: HTTP 504 `timeout_error`와 SSE `timeout_error`가 둘 다 BUSY, HTTP 402 `billing_error`와 SSE `billing_error`가 둘 다 LIMIT. 모두 `usage: null`
- **AC-510.9**(진짜 SDK, 모두 BUSY·`usage: null`): `sseResponse([START, BLOCK, DELTA], terminated())`, `sseResponse([], terminated())`, `sseResponse([START, BLOCK, DELTA])`, `sseResponse([START, BLOCK, DELTA, BLOCK_STOP, MSG_DELTA])`, `sseResponse([])`. `MSG_STOP`까지 받은 답은 `ok: true`. 가짜 클라이언트로 `Object.assign(new AnthropicError('terminated'), { cause: terminated() })` → BUSY
- **AC-510.10**(진짜 SDK, 모두 FAILED·`usage: null`): 열쇠 `'sk-ant-fake-키'`(`fetch`가 불리지 않고, 결과에 `sk-ant-fake` 글자가 없다), 열쇠 `'sk-ant-fake\nX-Evil: 1'`(결과에 `sk-ant-fake` 글자가 없다), `vi.stubEnv('ANTHROPIC_BASE_URL', 'not a url')`, 자기를 가리키는 스키마(`schema.self = schema`), `[START, MALFORMED]`, `[START, sse('message_delta', { type: 'message_delta' })]`, `[START, START]`, `new Response(null, { status: 200 })`, `sseResponse([START], new TypeError('Cannot read properties of undefined'))`
- **AC-510.11**(진짜 SDK + `freshConsole()`, `log`·`info`·`warn`·`error`·`debug` 모두 안 불림): `[START, MALFORMED]`(결과는 FAILED), `vi.stubEnv('ANTHROPIC_LOG', 'debug')` + 끝까지 받는 답, `vi.stubEnv('ANTHROPIC_LOG', 'debug')` + `jsonError(500, 'api_error')`(결과는 BUSY)
- 파일 맨 위 주석 "가짜 클라이언트만 넣는다"를 사실에 맞게 고친다(진짜 SDK 클래스 + 가짜 `fetch`도 쓴다, 네트워크 없음)
- 실제 시간을 길게 기다리지 않는다. 열쇠는 `sk-ant-fake-…`만

### 4. 고친 뒤 확인

- 편집 도구는 `\uXXXX`를 보이지 않는 글자 그대로 파일에 써 넣을 수 있다. 눈으로는 구별되지 않으니 고칠 때마다 아래 'Acceptance Criteria'의 보이지 않는 글자 찾기를 돌린다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다. 예: `it('AC-510.9 글자를 받다가 연결이 끊김 → BUSY, 사용량 없음', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. 지금 코드로는 AC-510.7의 `timeout_error`·`billing_error` 시험, AC-510.9, AC-510.11 시험이 실패한다. AC-510.10 시험은 지금 코드로도 통과한다(지금은 모두 FAILED로 떨어진다) — 넓은 규칙을 막으려고 두는 시험이니 그래도 쓴다. RED 기록 전에는 `src/app/api/ai/claude.ts`를 고칠 수 없다(훅이 막는다)
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터가 step마다 새 세션을 연다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`
- `git status`에는 줄바꿈만 다른 가짜 "M" 파일이 수백 개 보인다. 무엇이 바뀌었는지는 `git diff -w --ignore-cr-at-eol -- <파일>`로 본다
- `npm test` 기준선: 46개가 이미 실패한다(2026-11-01). 실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과해야 한다

## Acceptance Criteria

```bash
node -e "const l=require('fs').readFileSync('src/app/api/ai/claude.ts','utf8').split(/\r?\n/);process.exit(l[0].trim()===\"import 'server-only'\"?0:1)"
node -e "const t=require('fs').readFileSync('src/app/api/ai/claude.ts','utf8');process.exit(t.includes(\"new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1, logLevel: 'off' })\")&&['timeout_error','billing_error','stream ended without producing a Message with role=assistant','request ended without sending any chunks',\"=== 'terminated'\"].every(w=>t.includes(w))&&!t.includes('console.')?0:1)"
node -e "for (const f of ['src/app/api/ai/claude.ts','src/app/api/ai/claude.test.ts']){const t=require('fs').readFileSync(f,'utf8');if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\u2060\uFEFF]/.test(t)){console.error('보이지 않는 글자: '+f);process.exit(1)}}"
git diff -w --ignore-cr-at-eol --quiet -- package.json package-lock.json   # 이 step은 의존성을 고치지 않는다
npx vitest run src/app/api/ai/claude.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint -- --max-warnings=0
npm run build
npm test        # 실패는 기준선 46개 이하
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-510.7, AC-510.9 ~ AC-510.11이 `src/app/api/ai/claude.test.ts`와 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트:
   - 서버 코드·SDK는 `src/app/api/ai/`에만 있는가? (ADR-004)
   - 신호·`APIUserAbortError`를 여전히 가장 먼저 보는가?
   - `AnthropicError` 규칙이 `terminated`와 정해 둔 글자 둘로만 BUSY인가? (넓은 규칙이면 AC-510.10 시험이 실패한다)
   - 설계가 기댄 SDK 사실이 1.3.0 소스와 같은가? (다르면 `blocked`)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음, `console` 없음)
3. 결과에 따라 `phases/ai-report-3c-fixes/index.json`의 Step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (설계와 다른 SDK 동작 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 오류 나누기 차례, 더한 `type`, `AnthropicError` 규칙, `logLevel`, 더한 시험 수, RED→GREEN을 한 줄로 담는다

## 금지사항

- 시험이나 이 세션에서 진짜 Claude API를 부르지 마라(`npm run ai:try`도 치지 마라). 이유: 비용이 든다
- 진짜 열쇠를 읽거나 `.env.local`을 열지 마라. 이유: 비밀값은 출력·로그·채팅에 나오면 안 된다(CLAUDE.md)
- `npm install`을 하거나 `package.json`·`package-lock.json`을 고치지 마라. 이유: 이번 고친 점은 SDK 1.3.0 그대로 된다. SDK 판이 바뀌면 오류 글자도 바뀔 수 있다
- `logLevel` 밖의 SDK 클라이언트 설정(`timeout`·`maxRetries`)이나 요청 칸(모델·`max_tokens`·effort·`fallbacks`·스키마)을 바꾸지 마라. 이유: 승인된 설계 그대로다
- `callClaude`의 `deps`에 `fetch` 같은 칸을 더하거나 `AnthropicLike` 모양을 바꾸지 마라. 이유: 가짜 `fetch`는 `vi.stubGlobal`로 넣으면 되고, 앱 코드에 시험용 길을 늘리지 않는다
- `console`로 오류 내용·요청·답 글자를 남기지 마라. 이유: AI 경로 로그는 경로 파일이 번호만 남긴다(plan §8)
- 오류 글자·`cause`를 결과에 담지 마라. 이유: 열쇠나 자료 글자가 들어 있을 수 있다
- 다른 파일을 고치지 마라(`cost.ts`·`store.ts`·`lib/errors.ts` 등). 이유: 이 step의 범위가 아니다. 문구는 그대로이고 어떤 번호를 고르느냐만 바뀐다
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊긴다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니다
