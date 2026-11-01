# Step 1: claude-call

> **TASK-10** Claude 부르기 (SDK 넣기) · **REQ-510** · AC-510.1 ~ AC-510.4
> Phase 3 `ai-report-3-server-parts` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-10 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~2는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다(`package.json`·`package-lock.json`은 이 step만 고친다). 같은 폴더에서 동시에 돌면 이 step의 `npm install`(`node_modules/`)과 `npm run build`(`.next/`)가 다른 step의 시험·빌드와 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, 이 step의 `npm install`을 먼저 끝낸 뒤 다른 step의 시험을 돌리고 `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-510에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-510.1**: `callClaude`가 SDK에 모델 `claude-opus-5-5`, `max_tokens` 16000, effort `medium`, JSON 스키마 출력 형식, 거절 대신 다른 모델(`fallbacks: "default"`)을 넣어 조각으로 받고 끝까지 모은 답을 쓴다
- **AC-510.2**: 정상 답이면 글자(JSON)와 사용량(입력·출력 토큰, 답한 모델)을 돌려준다
- **AC-510.3**: SDK 오류 429·529·5xx·연결 끊김·시간 초과 → `E-AI-BUSY`, 402(`billing_error`) → `E-AI-LIMIT`, 그 밖 → `E-AI-FAILED`. 답이 `refusal`·`max_tokens`로 끝나면 `E-AI-FAILED`이고 사용량은 그대로 돌려준다
- **AC-510.4**: 열쇠 `ANTHROPIC_API_KEY`가 없으면 SDK를 부르지 않고 `E-AI-FAILED`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 서버 코드는 `app/api/ai/` 하나, 비밀값은 `.env.local`·서버 환경 변수에만, AI 경로 로그 규칙)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-004·007·023
- `/specs/ai-report/requirements.md` — REQ-510, 배경 6·9
- `/specs/ai-report/design.md` — 'Claude 부르기', '위험' 1·2·3
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-10(SDK 넣기 메모)
- `/package.json` (의존성은 정확한 판으로 고정하는 버릇 — 예 `"@supabase/ssr": "0.12.7"`)
- `/vitest.config.ts` (`server-only`를 시험에서 빈 모듈로 바꾸는 별칭)
- **claude-api skill**(Skill 도구로 `claude-api`를 불러 읽는다): `typescript/claude-api/README.md`, `streaming.md`, `tool-use.md`(구조화 출력), fallback(서버 쪽 다른 모델) 문서 — 칸 이름·beta 이름·오류 클래스를 구현 전에 확인한다
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`AiUsage`·`AiErrorCode`, Phase 1 Step 2)
  - `src/types/errors.ts`·`src/lib/errors.ts`의 AI 번호 넷 (Phase 1 Step 1)
  - `src/lib/ai/prompt.ts` (`reportJsonSchema()` — 이 함수가 받는 `schema`, Phase 2 Step 3)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-10)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `package.json`
  - `package-lock.json`
  - `src/app/api/ai/claude.ts`
  - `src/app/api/ai/claude.test.ts`
- Tests:
  - `src/app/api/ai/claude.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **SDK는 한 곳**: `@anthropic-ai/sdk` import는 `src/app/api/ai/`(그리고 뒤의 `scripts/`)에만. `src/lib/ai/`·화면·`lib/*`에서 import하지 않는다. TASK-14가 시험으로 막는다 (AC-513.1, ADR-004)
- **첫 줄 `import 'server-only'`**: `claude.ts`의 맨 첫 줄이다(AC-513.2)
- **열쇠**: `process.env.ANTHROPIC_API_KEY`만 읽는다(시험은 `deps.apiKey`로 `sk-ant-fake…` 같은 가짜 글자). 열쇠가 없거나 빈 글자면 SDK 클라이언트를 만들지도 부르지도 않는다. 열쇠 값을 로그·오류 글자·결과에 담지 않는다 (CLAUDE.md 보안 규칙)
- **진짜 Claude를 부르지 않는다**: 시험은 가짜 클라이언트(`AnthropicLike`)를 넣는다. 이 step 세션도 진짜 API를 부르지 않는다(비용)
- **판 고정**: `npm install --save-exact @anthropic-ai/sdk@<최신 판>`. `package.json`에 `^`·`~` 없이 정확한 판
- **설계와 다르면 멈춘다**: SDK 문서로 본 칸 이름·beta 조합이 design.md와 다르면(예: `fallbacks`·`output_config.format`이 beta 스트림에서 안 됨, 한도 오류가 402가 아님) 구현을 바꾸지 말고 `blocked`(사유: 설계 위험 2·3, 무엇이 어떻게 다른지)로 멈춘다 — 설계를 고쳐 재승인 받아야 한다 (tasks.md TASK-10, design '위험')

## 작업

### 1. SDK 넣기
- claude-api skill로 최신 판과 칸 이름을 확인한 뒤 `npm install --save-exact @anthropic-ai/sdk@<판>`. `package.json`·`package-lock.json`만 바뀐다

### 2. 코드 (`src/app/api/ai/claude.ts`)
```ts
import 'server-only'
export const MODEL = 'claude-opus-5-5'
export const MAX_TOKENS = 16000
export type AnthropicLike = { beta: { messages: { stream(params: …): { finalMessage(): Promise<…> } } } }   // 시험이 넣는 작은 모양
export type ClaudeResult =
  | { ok: true; text: string; usage: AiUsage }
  | { ok: false; code: AiErrorCode; usage: AiUsage | null }
export async function callClaude(
  req: { system: string; user: string; schema: object },
  deps?: { client?: AnthropicLike; apiKey?: string },
): Promise<ClaudeResult>
```
- 열쇠: `deps.apiKey`가 주어지면 그것, 아니면 `process.env.ANTHROPIC_API_KEY`. 없거나 빈 글자 → `{ ok: false, code: 'E-AI-FAILED', usage: null }`(클라이언트를 만들지 않고, 주어진 `deps.client`도 부르지 않는다 — AC-510.4)
- 클라이언트: `deps.client ?? new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1 })`
- 부르기(design 그대로, 칸 이름은 문서로 확인):
  ```ts
  client.beta.messages.stream({
    model: MODEL, max_tokens: MAX_TOKENS,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system, messages: [{ role: 'user', content: user }],
  }).finalMessage()
  ```
  - `thinking`은 보내지 않는다(Opus 5.5는 늘 adaptive, `disabled`는 400)
  - 조각으로 받는 까닭은 긴 답의 HTTP 시간 초과를 피하려는 것. 화면에는 조각을 보내지 않는다
- 답: `stop_reason`이 `refusal`·`max_tokens` → `{ ok: false, code: 'E-AI-FAILED', usage }`. 아니면 `content`의 `text` 블록을 이어 붙인 글자 + 사용량 `{ inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, model: 답의 model }`
- 오류 나누기(가장 좁은 것부터, `instanceof`): `APIConnectionTimeoutError`·`APIConnectionError`·`RateLimitError`(429)·`InternalServerError`(5xx·529) → `E-AI-BUSY`. `APIError`이고 `status === 402` → `E-AI-LIMIT`. 나머지 → `E-AI-FAILED`. 오류에서는 `usage: null`
- 오류 내용(메시지·요청·답 글자)을 로그에 쓰지 않는다. 이 파일은 `console`을 쓰지 않는다(로그는 경로 파일이 번호만 남긴다)

### 3. 시험 (`src/app/api/ai/claude.test.ts`)
- 가짜 클라이언트: `beta.messages.stream`이 받은 인자를 기록하고 `finalMessage()`가 정해 둔 답을 돌려주거나 던진다. 진짜 SDK 네트워크를 부르지 않는다
- AC-510.1: 받은 인자에 `model: 'claude-opus-5-5'`, `max_tokens: 16000`, `output_config.effort: 'medium'`, `output_config.format.type: 'json_schema'`·`schema`가 넘긴 것과 같음, `fallbacks: 'default'`, `system`·`messages`. `thinking` 칸이 없다
- AC-510.2: `text` 블록 둘 → 이어 붙인 글자, 사용량·답한 모델
- AC-510.3: SDK 오류 클래스(`@anthropic-ai/sdk`에서 import — 이 폴더라 된다)로 429·529·500·연결 끊김·시간 초과 → BUSY, 402 → LIMIT, 400·401 → FAILED. `stop_reason: 'refusal'`·`'max_tokens'` → FAILED + 사용량
- AC-510.4: `apiKey: ''`(그리고 `vi.stubEnv('ANTHROPIC_API_KEY', '')`) → FAILED, 가짜 클라이언트의 `stream`이 불리지 않았다
- 열쇠 글자는 `sk-ant-fake-…`만

## TDD 순서

1. 시험을 먼저 쓴다(SDK를 먼저 넣어야 오류 클래스를 import할 수 있다 — `package.json`·`package-lock.json`은 RED 전에도 고칠 수 있다). 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-510.4 열쇠가 없으면 SDK를 부르지 않고 E-AI-FAILED', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/app/api/ai/claude.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
node -e "const v=require('./package.json').dependencies['@anthropic-ai/sdk'];process.exit(/^\d+\.\d+\.\d+$/.test(v)?0:1)"   # 정확한 판
node -e "const l=require('fs').readFileSync('src/app/api/ai/claude.ts','utf8').split(/\r?\n/);process.exit(l[0].trim()===\"import 'server-only'\"?0:1)"
npx vitest run src/app/api/ai/claude.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-510.1 ~ AC-510.4가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 코드·SDK는 `src/app/api/ai/`만)
   - ADR 기술 스택을 벗어나지 않았는가? (Claude API, 모델 `claude-opus-5-5` — ADR-024)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 없음, `NEXT_PUBLIC_` 없음, 로그 없음)
3. 결과에 따라 `phases/ai-report-3-server-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정, 설계와 다른 SDK 칸 이름 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. SDK 판, 문서로 확인한 칸 이름·beta 이름, `callClaude`·`AnthropicLike` 모양을 한 줄에 담는다

## 금지사항

- 시험이나 이 세션에서 진짜 Claude API를 부르지 마라(`npm run ai:try`도 치지 마라). 이유: 비용이 든다. 진짜 부름은 사용자가 `npm run ai:try`를 칠 때만(tasks.md 공통)
- 진짜 열쇠를 읽거나 `.env.local`을 열지 마라. 시험 열쇠는 `sk-ant-fake…`뿐. 이유: 비밀값은 출력·로그·채팅에 나오면 안 된다(CLAUDE.md)
- 열쇠 이름에 `NEXT_PUBLIC_`를 쓰거나 열쇠를 브라우저 코드로 넘기지 마라. 이유: 브라우저 묶음에 들어가 밖으로 나간다
- `console`로 오류 내용·요청·답 글자를 남기지 마라. 이유: AI 경로 로그는 오류 번호·경로만(plan §8), 그것도 경로 파일(TASK-13)이 한다
- `thinking` 칸을 보내지 마라. 이유: Opus 5.5는 늘 adaptive이고 `disabled`는 400이다(design 'Claude 부르기')
- SDK 문서와 설계가 다를 때 혼자 다른 방법(`messages.parse` 등)으로 바꾸지 마라. 이유: 설계를 고쳐 재승인 받아야 한다(design 위험 2). `blocked`로 멈추고 다른 점을 적는다
- 의존성을 `^`·`~` 범위로 넣거나 다른 패키지를 더하지 마라. 이유: 판 고정이 저장소 규칙이고, 이 TASK가 넣는 것은 `@anthropic-ai/sdk` 하나다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
