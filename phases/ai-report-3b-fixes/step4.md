# Step 4: claude-usage-time

> **TASK-10** Claude 부르기 — 고친 점: 모든 시도의 사용량, 전체 시간 한도, 조각 도중 오류, 대신 답한 글자만 · **REQ-510** · AC-510.5 ~ AC-510.8
> Phase 3b `ai-report-3b-fixes` · Step 4 — `specs/ai-report/tasks.md` 머리말 '할 순서' 3b
> 명세 `specs/ai-report/`는 사용자가 고친 명세(requirements.md '고친 점', 2026-11-01)를 다시 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-10의 '할 일(3b)'만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. **이 step에는 `npm install`이 없다**(SDK 1.3.0 그대로). 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`)·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-510에 있다. 시험 이름에 이 AC ID를 넣는다.

- **AC-510.5**: 답의 `usage.iterations`에 항목이 여럿(예: 거절한 시도 `message` + 대신 답한 시도 `fallback_message`)이면 입력·출력 토큰은 모든 항목의 합이고 모델은 답의 `model`. `usage.iterations`가 없거나(null) 비면 맨 위 `usage` 값. 정상 답과 `refusal`·`max_tokens`로 끝난 답 모두 같다
- **AC-510.6**: 요청 옵션에 끊기 신호(`signal`) 하나를 넣고, 그 신호는 부르기 시작부터 `CALL_TIMEOUT_MS`(100초) 뒤에 끊긴다. 신호가 끊겨 SDK가 던진 오류(`APIUserAbortError`)나 신호가 끊긴 뒤 온 어떤 오류든 `E-AI-BUSY`, 사용량 없음
- **AC-510.7**: 조각 받는 도중 온 오류(상태가 없는 `APIError`에 `type`이 있음)는 `type`이 `rate_limit_error`·`overloaded_error`·`api_error`면 `E-AI-BUSY`, 그 밖의 `type`(예: `invalid_request_error`·`authentication_error`)이면 `E-AI-FAILED`
- **AC-510.8**: 답의 `content`에 `fallback` 블록이 있으면(조각 도중 거절한 모델의 덜 쓴 `text` → `fallback` 블록 → 대신 답한 모델의 `text`) 마지막 `fallback` 블록 뒤의 `text` 블록만 이어 붙인다. 없으면 모든 `text` 블록. 사용량은 AC-510.5 그대로
- AC-510.1 ~ AC-510.4의 기존 시험은 그대로 통과해야 한다(AC-510.1의 "SDK에 넣는 값" 시험은 두 번째 인자가 더해져도 첫 인자는 그대로다)

## 읽어야 할 파일

- `/CLAUDE.md` (서버 코드는 `app/api/ai/` 하나, 비밀값, AI 경로 로그 규칙)
- `/specs/ai-report/requirements.md` — 배경 10, '고친 점' 2·4·5, REQ-510
- `/specs/ai-report/design.md` — 'Claude 부르기'(전체 시간 한도, 사용량, 오류 나누기 1~5), '비용'의 '대신 답한 부름', '위험' 1
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통'·'할 순서' 3b, TASK-10 '할 일(3b)'
- 이전 step에서 만든 파일:
  - `src/app/api/ai/claude.ts` (`callClaude`·`AnthropicLike`·`errorCode`·`BUSY_TYPES`, Phase 3 Step 1)
  - `src/app/api/ai/claude.test.ts` (`fakeClient`·`message()`·`errorBody()` 도우미)
- SDK(읽기만, `node_modules/@anthropic-ai/sdk` 1.3.0) — 설계가 기댄 사실을 다시 확인할 때:
  - `resources/beta/messages/messages.d.ts`: `BetaIterationsUsage`, `BetaMessageIterationUsage`(`type: 'message'`), `BetaFallbackMessageIterationUsage`(`type: 'fallback_message'`), 각 항목의 `input_tokens`·`output_tokens`·`model`
  - `client.js` `makeRequest`·`retryRequest`·`fetchWithTimeout`(타이머는 fetch에만, 시도마다 `options.signal.aborted` 확인), `internal/utils/sleep.js`(신호로 깸)
  - `lib/BetaMessageStream.js` `_createMessage`(받은 신호를 자기 controller에 잇고, 끊기면 `APIUserAbortError`)
  - `core/streaming.js`(SSE `error` 이벤트 → `new APIError(undefined, body, undefined, headers, type)`), `core/error.js`(`APIUserAbortError`는 `APIError`의 하위, 상태·`type` 없음)
- 설계가 기댄 사실이 SDK와 다르면 구현을 바꾸지 말고 `blocked`로 멈춘다(무엇이 어떻게 다른지 적는다)

## 수정 범위 (tasks.md TASK-10)

- Files: `package.json`, `package-lock.json`, `src/app/api/ai/claude.ts`, `src/app/api/ai/claude.test.ts`
- Tests: `src/app/api/ai/claude.test.ts`
- TDD: required
- **이 step은 `src/app/api/ai/claude.ts`·`claude.test.ts`만 고친다.** `package.json`·`package-lock.json`은 고치지 않는다(`npm install` 없음)

## 꼭 지킬 규칙 (CRITICAL)

- **첫 줄 `import 'server-only'`** 그대로 (AC-513.2)
- **열쇠**: `process.env.ANTHROPIC_API_KEY`만, 시험은 `sk-ant-fake…`. 열쇠·오류 내용을 로그·결과에 담지 않는다. 이 파일은 `console`을 쓰지 않는다
- **진짜 Claude를 부르지 않는다**: 시험은 가짜 클라이언트만. 이 세션도 진짜 API를 부르지 않는다(비용)
- **SDK 클라이언트 설정은 그대로**: `new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1 })`. 전체 한도는 요청마다 넣는 신호가 맡는다
- **오류 나누기 차례**(design '오류 나누기' 1~5): 신호 끊김·`APIUserAbortError`를 가장 먼저 본다 — `APIUserAbortError`는 상태·`type`이 없는 `APIError`라서 뒤의 '상태 없음' 갈래보다 앞서야 BUSY가 된다

## 작업

### 1. 사용량 (AC-510.5, design 'Claude 부르기' 사용량)
- `message.usage.iterations`가 비지 않은 배열이면 모든 항목의 `input_tokens`·`output_tokens`를 각각 더한다. 아니면(null·없음·빈 배열) `message.usage.input_tokens`·`output_tokens`
- `model`은 `message.model`(마지막에 답한 모델)
- 성공·`refusal`·`max_tokens` 세 길 모두 같은 함수로 만든다
- `cost.ts`는 고치지 않는다(대신 답하는 `claude-opus-5`·`claude-opus-4-8`은 표의 가장 비싼 값 5·25와 같아 적게 세지 않는다 — design '비용')

### 2. 전체 시간 한도 (AC-510.6, design 'Claude 부르기' 전체 시간 한도)
```ts
export const CALL_TIMEOUT_MS = 100_000   // 경로 maxDuration 120초 - 다른 일 몫 20초
export type AnthropicLike = {
  beta: { messages: { stream(params: BetaMessageStreamParams, options?: { signal?: AbortSignal }): { finalMessage(): Promise<BetaMessage> } } }
}
export async function callClaude(
  req: { system: string; user: string; schema: object },
  deps?: { client?: AnthropicLike; apiKey?: string; timeoutMs?: number },
): Promise<ClaudeResult>
```
- 열쇠 확인 뒤, 부르기 바로 전에 `const signal = AbortSignal.timeout(deps?.timeoutMs ?? CALL_TIMEOUT_MS)`
- `client.beta.messages.stream({ …지금 그대로… }, { signal }).finalMessage()`
- 오류 나누기 맨 앞: `signal.aborted`이거나 `err instanceof APIUserAbortError` → `E-AI-BUSY`, 사용량 없음
- 진짜 `Anthropic` 클라이언트가 새 `AnthropicLike` 모양에 그대로 맞아야 한다(`tsc`·`npm run build`로 확인)

### 3. 조각 도중 오류 (AC-510.7, design '오류 나누기' 4)
- 지금 코드(`BUSY_TYPES`)가 이미 나눈다. 시험으로 고정하고, 차례가 design 1~5와 같은지 본다: `status`가 없는 `APIError` + `type` ∈ {`rate_limit_error`,`overloaded_error`,`api_error`} → BUSY, 그 밖의 `type` → FAILED

### 3-1. 대신 답한 글자만 (AC-510.8, design 'Claude 부르기' 답)
- 지금 코드는 `text` 블록을 모두 이어 붙인다. 조각 도중 거절이 나면 거절한 모델의 덜 쓴 글자가 앞에 붙어 JSON이 깨진다
- `content`에서 `type === 'fallback'`인 마지막 블록의 위치를 찾고, 그 뒤의 `text` 블록만 이어 붙인다. 없으면 처음부터. 가짜 클라이언트의 답 타입(`AnthropicLike`)이 `fallback` 블록을 받아들이게 한다(SDK `BetaFallbackBlock`: `type`·`from`·`to`·`trigger`)

### 4. 시험 (`src/app/api/ai/claude.test.ts`에 더한다)
- 가짜 클라이언트가 `stream`의 두 번째 인자(옵션)도 기록하게 한다
- AC-510.5: iterations `[{type:'message', model:'claude-opus-5-5', input_tokens:900, output_tokens:40}, {type:'fallback_message', model:'claude-opus-5', input_tokens:1000, output_tokens:200}]`, 맨 위 usage 1000/200, `model:'claude-opus-5'` → `{ inputTokens: 1900, outputTokens: 240, model: 'claude-opus-5' }`. iterations `null`·`[]` → 맨 위 값. `refusal`로 끝난 답도 합으로 돌려준다
- AC-510.6: `CALL_TIMEOUT_MS === 100_000`. 옵션의 `signal`이 `AbortSignal`이고 부를 때는 아직 안 끊겼다. `deps.timeoutMs: 20` + 신호가 끊길 때 `new APIUserAbortError()`로 실패하는 가짜 `finalMessage` → `E-AI-BUSY`, 사용량 없음. 신호가 끊긴 뒤 SDK 밖 오류(`new Error('boom')`)가 와도 BUSY. `APIUserAbortError`를 바로 던져도 BUSY
- AC-510.7: 상태 없는 `new APIError(undefined, errorBody(t), undefined, new Headers(), t)`로 `rate_limit_error`·`overloaded_error`·`api_error` → BUSY, `invalid_request_error`·`authentication_error` → **FAILED**(이 시험은 꼭 둔다)
- AC-510.8: content `[text '{"summ', fallback{from:{model:'claude-opus-5-5'}, to:{model:'claude-opus-5'}, trigger:…}, text '{"summary":"ok"}']` → `text`는 `'{"summary":"ok"}'`. `fallback`이 둘이면 마지막 것 뒤만. `fallback` 없는 답은 지금처럼 모든 `text`를 이어 붙인다(기존 시험 그대로)
- 실제 시간을 길게 기다리지 않는다(20ms 정도). 열쇠는 `sk-ant-fake-…`만

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름에 AC ID를 넣는다. 예: `it('AC-510.6 끊기 신호가 끊기면 E-AI-BUSY, 사용량 없음', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다(AC-510.7 시험은 지금 코드로도 통과할 수 있다 — AC-510.5·AC-510.6·AC-510.8 시험이 실패하면 된다). RED 기록 전에는 `src/app/api/ai/claude.ts`를 고칠 수 없다(훅이 막는다)
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다
- `execute.py`는 이 PC에서 쓰지 않는다. 오케스트레이터가 step마다 새 세션을 연다. 이 세션은 이 step 하나만 하고 끝낸다
- 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`
- `npm test` 기준선: 46개가 이미 실패한다(2026-11-01). 실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과해야 한다

## Acceptance Criteria

```bash
node -e "const l=require('fs').readFileSync('src/app/api/ai/claude.ts','utf8').split(/\r?\n/);process.exit(l[0].trim()===\"import 'server-only'\"?0:1)"
node -e "const t=require('fs').readFileSync('src/app/api/ai/claude.ts','utf8');process.exit(/CALL_TIMEOUT_MS\s*=\s*100_000/.test(t)&&t.includes('AbortSignal.timeout')&&t.includes('iterations')&&!t.includes('console.')?0:1)"
git diff --quiet -- package.json package-lock.json   # 이 step은 의존성을 고치지 않는다
npx vitest run src/app/api/ai/claude.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개 이하
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다). `git diff --quiet`는 이 step 전부터 `package.json`이 바뀌어 있었다면 시작 때와 견준다
- `sdd status ai-report`에서 AC-510.5 ~ AC-510.8이 `src/app/api/ai/claude.test.ts`와 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트:
   - 서버 코드·SDK는 `src/app/api/ai/`에만 있는가? (ADR-004)
   - 신호 하나가 재시도·조각 받기까지 덮는다는 설계의 SDK 사실이 1.3.0 소스와 같은가? (다르면 `blocked`)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음, `console` 없음)
3. 결과에 따라 `phases/ai-report-3b-fixes/index.json`의 Step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (설계와 다른 SDK 동작 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(편집 도구는 훅이 막는다). 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`에는 `CALL_TIMEOUT_MS`, 새 `AnthropicLike`·`callClaude` 모양, 사용량 규칙, 오류 나누기 차례, 더한 시험 수, RED→GREEN을 한 줄로 담는다

## 금지사항

- 시험이나 이 세션에서 진짜 Claude API를 부르지 마라(`npm run ai:try`도 치지 마라). 이유: 비용이 든다
- 진짜 열쇠를 읽거나 `.env.local`을 열지 마라. 이유: 비밀값은 출력·로그·채팅에 나오면 안 된다(CLAUDE.md)
- `npm install`을 하거나 `package.json`·`package-lock.json`을 고치지 마라. 이유: 이번 고친 점은 SDK 1.3.0 그대로 된다
- SDK 클라이언트 설정(`timeout`·`maxRetries`)이나 요청 칸(모델·`max_tokens`·effort·`fallbacks`·스키마)을 바꾸지 마라. 이유: 승인된 설계 그대로다
- `console`로 오류 내용·요청·답 글자를 남기지 마라. 이유: AI 경로 로그는 경로 파일이 번호만 남긴다(plan §8)
- `cost.ts`·`store.ts` 등 다른 파일을 고치지 마라. 이유: 이 step의 범위가 아니다
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀린다. 명세와 다른 점을 찾으면 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊긴다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니다
