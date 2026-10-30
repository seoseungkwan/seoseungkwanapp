# Step 3: bridge-client

> **TASK-4** 웹 통로 코드 · 울타리 · **REQ-004** · AC-004.1 ~ AC-004.11
> Phase 1 `precheck-1-helper` · Step 3 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-004에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-004.1**: `src/lib/bridge/**`에 기존 환자 자료 구역 규칙(네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import·JSX 금지)이 모두 걸리고, 더해서 `window.postMessage`·`BroadcastChannel`·`parent`·`top`·`opener`가 막히며, `chrome.runtime.connect`·`sendMessage`는 첫 인자가 `EXTENSION_ID`가 아니면 막힌다. `src/guardrails.test.ts`가 규칙마다 증명
- **AC-004.2**: `src/lib/precheck/**`에도 같은 환자 자료 구역 규칙이 걸린다(guardrails 시험)
- **AC-004.3**: `chrome.runtime`이 없으면 `connectBridge` 상태가 `no-extension`이 되고 던지지 않는다. 연결이 곧바로 끊기면(`lastError`) `no-extension`, 확장이 `E-HELPER-MISSING`이면 `no-helper`, `E-BRIDGE-BUSY`면 `busy`
- **AC-004.4**: `checkVersions({web, extension, helper})`: protocol이 모두 같고 도우미 ≥ `MIN_HELPER`, 확장 ≥ `MIN_EXTENSION`이면 `ok`(도우미 < `LATEST_HELPER`면 `helperUpdateAvailable: true`), 도우미가 낮거나 도우미 protocol이 다르면 `update-helper`, 확장이 낮거나 확장 protocol이 다르면 `update-extension`
- **AC-004.5**: 환자 자료 명령(`patient: true`)의 답 조각은 `JSON.parse` 없이 `sink.chunk(id, seq, data)`·`sink.end(...)`로 Worker에 넘기고, 부른 쪽에는 `{id, count}`만 준다
- **AC-004.6**: 숫자·상태 명령의 `result`는 명령마다 정해 둔 모양(숫자·날짜·정해 둔 상태 글자)인지 검사해 돌려준다. 다르면 `E-BRIDGE-BAD-REPLY`. 환자 자료 명령에 `result`가 오거나 숫자 명령에 `chunk`가 와도 같은 오류
- **AC-004.7**: 연결이 끊기면 기다리던 요청은 `E-BRIDGE-DISCONNECTED`로 끝나고, 환자 자료 요청은 `sink.abort(id, code)`로 모으던 조각을 버리게 한다
- **AC-004.8**: `buildCsp` 운영·개발 값이 이 기능 전과 글자까지 같다(`chrome-extension:`·확장 ID 없음)
- **AC-004.9**: `send(cmd, payload)`(`store.save`·`bit.input`, Worker가 만든 JSON 글자)는 `payload`를 풀거나 고치지 않고 봉투 `{v: 1, id, cmd, args: {payload}}`에 글자 그대로 넣어 넘긴다. 다른 명령이거나 `payload`가 글자가 아니면 보내지 않고 `E-BRIDGE-REJECTED`. 답은 `store.save`면 `result {saved: true}`인지 검사, `bit.input`이면 결과 조각을 sink로 넘기고 `{id, count}`
- **AC-004.10**: `bit.input` 요청의 `progress`는 칸이 `{v, id, type, done, total}`뿐이고 `0 ≤ done ≤ total ≤ 500` 정수일 때만 `onProgress({id, done, total})`. 다르거나 `bit.input`이 아닌 요청에 오면 `E-BRIDGE-BAD-REPLY`로 그 요청을 끝내고 `sink.abort(id, code)`
- **AC-004.11**: 화면이 쓰는 입구 `connectScreenBridge({runtime, worker})`(`src/lib/bridge/workerSink.ts`): 조각·`end`·`abort`와 Worker가 보낼 글자는 `workerSink`가 만든 전용 `MessageChannel` 포트로만 Worker와 오간다. 화면이 받는 것(약속 값·`onState`·`onProgress`)은 상태·숫자·상태 명령의 검사한 답·진행 숫자·`{id, count}`·오류 번호뿐이고 `ScreenBridge`에는 `send`가 없다. `client.ts`는 `src/lib/bridge/**` 밖에서 import할 수 없다(ESLint, guardrails). 시험: 가짜 조각·보낼 글자 속 '가상환자01'이 화면 쪽 어디에도 없다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-004
- `/specs/precheck/design.md` — 4절(메시지 약속, 4-4 버전, 4-5 오류 번호), 5절(환자 자료 길과 울타리), 6-1절(`client.ts`·`workerSink.ts` 시그니처, Worker 포트 메시지), 6-2절(Worker가 받는 일), 15절(환자 자료 답은 늘 조각)
- `/specs/precheck/tasks.md` — TASK-4 (수정 범위·메모)
- `/eslint.config.mjs`, `/src/guardrails.test.ts`, `/src/lib/csp.ts`, `/src/lib/csp.test.ts`
- `/src/lib/errors.ts`, `/src/types/errors.ts`, `/src/lib/errors.test.ts`
- 이전 step에서 만든 파일:
  - `src/lib/bridge/commands.json` (Step 0)
  - `extension/src/relay.ts`, `extension/src/background.ts` (Step 2: 확장이 무엇을 넘기고 무엇을 거절하는지)
  - `helper/src/Precheck.Core/Protocol/*` (Step 0: 봉투·조각·`end` 모양, sha256 소문자 hex)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/bridge/protocol.ts`
  - `src/lib/bridge/versions.ts`
  - `src/lib/bridge/extensionId.ts`
  - `src/lib/bridge/handshake.ts`
  - `src/lib/bridge/client.ts`
  - `src/lib/bridge/workerSink.ts`
  - `src/lib/bridge/*.test.ts`
  - `src/types/bridge.ts`
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
  - `src/lib/csp.test.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/bridge/protocol.test.ts`
  - `src/lib/bridge/handshake.test.ts`
  - `src/lib/bridge/client.test.ts`
  - `src/lib/bridge/workerSink.test.ts`
  - `src/guardrails.test.ts`
  - `src/lib/csp.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **통로 코드**: `src/lib/bridge`는 확장에 `chrome.runtime.connect(EXTENSION_ID)`로만 말한다. 환자 자료 답 조각은 `JSON.parse` 없이 바로 Worker(sink)로 넘긴다. `window.postMessage`·`BroadcastChannel`·`parent`·`top`·`opener`를 쓰지 않는다 (ADR-017, design.md 5절)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)

## 작업

### 1. 울타리 먼저 (`eslint.config.mjs`, `src/guardrails.test.ts`)
- 환자 자료 구역 `files`에 `src/lib/bridge/**`, `src/lib/precheck/**`를 더한다. 안내 문구(`PATIENT_ZONE_MESSAGE` 등)에 새 폴더 이름을 넣는다
- `src/lib/bridge/**`에만 더하는 규칙:
  - `window.postMessage`·`BroadcastChannel`·`parent`·`top`·`opener` 금지(`no-restricted-globals`·`no-restricted-properties`)
  - `chrome.runtime.connect(...)`·`chrome.runtime.sendMessage(...)`는 첫 인자가 식별자 `EXTENSION_ID`일 때만(`no-restricted-syntax`, 예: `CallExpression[callee.property.name=/^(connect|sendMessage)$/]:not([arguments.0.name='EXTENSION_ID'])`). 주입받은 `runtime.connect`도 같은 규칙에 걸리게 선택자를 짠다
- `src/lib/bridge/client.ts`는 `src/lib/bridge/**` 밖에서 import 금지(`no-restricted-imports`, `@/lib/bridge/client`와 상대 경로 모두). 화면은 `workerSink.ts`만 쓴다(AC-004.11). `worker.postMessage`·`MessagePort.postMessage`·`MessageChannel`은 막지 않는다(막는 것은 `window.postMessage`와 전역 `postMessage`)
- `src/guardrails.test.ts`: 새 규칙마다 '막힌다' 시험, `lib/precheck`도 기존 규칙이 걸린다는 시험(AC-004.1·004.2). `EXTENSION_ID`로 부르는 것은 '막히지 않는다' 시험도 하나. `components/claim`에서 `client.ts` import는 막히고 `workerSink.ts` import는 된다(AC-004.11)

### 2. 모양·상수
- `src/types/bridge.ts`: `Request`·`Reply`(design.md 4-2), `BridgeState`, `ChunkSink`, `HelloResult`, 명령별 `ArgsOf`·`ResultOf`
- `protocol.ts`: `PROTOCOL`, 명령 표 읽기(`commands.json` 정적 import), `isPatient(cmd)`
- `extensionId.ts`: `export const EXTENSION_ID = commands.extensionId` 하나
- `versions.ts`: `MIN_HELPER`·`LATEST_HELPER`·`MIN_EXTENSION`(지금은 `0.1.0`). 도우미 버전을 올릴 때 같은 커밋에서 같이 올린다(design.md 13절)
- `handshake.ts`: `checkVersions({ web, extension, helper }): { status: 'ok' | 'update-helper' | 'update-extension'; helperUpdateAvailable?: boolean }` — 버전은 `x.y.z` 숫자 비교

### 3. `client.ts` (design.md 6-1)
```ts
export function connectBridge(deps: { runtime: ChromeRuntimeLike | undefined; sink: ChunkSink; newId?: () => string }): Bridge
```
- `runtime`이 없으면 `no-extension`(던지지 않음). `connect(EXTENSION_ID)` 뒤 곧바로 `onDisconnect` + `lastError`면 `no-extension`
- `hello()`: `hello`를 보내 확장·도우미 버전을 받아 `checkVersions` → 상태 `ready`·`update-helper`·`update-extension`. `E-HELPER-MISSING`이면 `no-helper`, `E-BRIDGE-BUSY`면 `busy`
- `call(cmd, args)`: `patient: false` 명령만. `result.data`를 명령마다 정한 검사기(숫자 범위·`YYYY-MM-DD`·정해 둔 상태 글자·`E-` 번호)로 확인. 틀리면 `E-BRIDGE-BAD-REPLY`
- `stream(cmd, args)`: `patient: true` 명령만. 들어오는 `chunk`는 `sink.chunk(id, seq, data)`로, `end`는 `sink.end(id, count, bytes, sha256)`로 바로 넘기고, 약속은 `{ id, count }`로 끝난다. `error`면 `sink.abort(id, code)` 뒤 거절. 조각 글자를 풀거나 들여다보지 않는다
- `send(cmd, payload)`: `store.save`·`bit.input`만. 봉투 `{v: 1, id, cmd, args: {payload}}`에 Worker가 만든 JSON 글자를 그대로 넣는다(풀지 않음. 글자가 아니거나 다른 명령이면 `E-BRIDGE-REJECTED`). `store.save`는 `result {saved: true}`인지 검사한다. `bit.input`은 `progress`를 검사해(`{v, id, type, done, total}`만, `0 ≤ done ≤ total ≤ 500` 정수) `onProgress`로 알리고 결과 조각은 sink로, 약속은 `{id, count}`(AC-004.9·004.10)
- `onProgress(fn)`: `Bridge` 타입에 더한다(design.md 6-1). 숫자만 넘긴다
- 끊김: 기다리던 요청 모두 `E-BRIDGE-DISCONNECTED`, 환자 자료 요청은 `sink.abort(id, 'E-BRIDGE-DISCONNECTED')`
- 시험은 가짜 `runtime`(Port 흉내)으로 한다

### 3-1. `workerSink.ts` (design.md 6-1, AC-004.11)
```ts
export type WorkerLike = { postMessage(message: unknown, transfer: Transferable[]): void }
export type ScreenBridge = Omit<Bridge, 'send'>
export function connectScreenBridge(deps: { runtime: ChromeRuntimeLike | undefined; worker?: WorkerLike; newId?: () => string }): ScreenBridge
```
- `MessageChannel`을 만들어 `port2`를 Worker에 한 번 넘긴다: `worker.postMessage({type: 'bridge-port'}, [port2])`
- 안에서 `connectBridge({runtime, sink})`를 부르고, sink는 `port1`로 `{type: 'chunk', id, seq, data}`·`{type: 'end', id, count, bytes, sha256}`·`{type: 'abort', id, code}`를 보낸다
- `port1`로 Worker가 보낸 `{type: 'send', ticket, cmd, payload}`를 받으면 `send(cmd, payload)` → `port1`로 `{type: 'sent', ticket, ok: true, id?, count?}` 또는 `{type: 'sent', ticket, ok: false, code}`. `cmd`가 `store.save`·`bit.input`이 아니면 보내지 않고 `E-BRIDGE-REJECTED`
- 돌려주는 `ScreenBridge`에는 `send`가 없다. 화면 쪽 콜백·약속 값에는 상태·숫자·상태 명령의 검사한 답(AC-004.6)·진행 숫자·`{id, count}`·오류 번호만 간다
- `worker`가 없으면(설치 화면) sink는 받은 조각을 울타리 안에서 버린다
- `workerSink.test.ts`: 가짜 Worker(받은 포트를 시험이 쥔다)로 조각·`end`·`abort`가 포트로만 가는지, `send` 요청의 `payload`가 봉투 `args.payload`에 글자 그대로 들어가는지, 화면 쪽 콜백·약속 값에 '가상환자01'이 없는지, `ScreenBridge`에 `send`가 없는지(타입 시험)

### 4. 오류 번호와 CSP
- `src/types/errors.ts`·`src/lib/errors.ts`: 연결 오류 번호를 더한다 — `E-EXT-MISSING`·`E-HELPER-MISSING`·`E-HELPER-OLD`·`E-EXT-OLD`·`E-BRIDGE-BUSY`·`E-BRIDGE-DISCONNECTED`·`E-BRIDGE-REJECTED`·`E-BRIDGE-BAD-REPLY`·`E-HELPER-BAD-MESSAGE`·`E-HELPER-UNKNOWN-COMMAND`. 문구는 '무엇이·어떻게 고치나', 쉬운 말. 비트 접속 번호는 TASK-6이 더한다
- `src/lib/csp.test.ts`: 지금 `buildCsp(true/false, url)` 결과 글자를 고정해 두는 시험 + `chrome-extension`·`EXTENSION_ID` 글자가 없다(AC-004.8). `src/lib/csp.ts`는 고치지 않는다(수정 범위 밖이고 바꿀 일도 없다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/bridge/protocol.test.ts src/lib/bridge/handshake.test.ts src/lib/bridge/client.test.ts src/lib/bridge/workerSink.test.ts
npx vitest run src/guardrails.test.ts src/lib/csp.test.ts src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-004.1 ~ AC-004.11이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-1-helper/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 통로 코드에서 조각을 `JSON.parse`하거나 내용을 들여다보지 마라. 이유: 통로가 환자 자료를 풀 일이 아예 없게 하는 것이 설계다(AC-004.5, design.md 15절)
- 화면에 조각이나 보낼 글자를 넘기는 콜백·반환 값을 만들지 마라. 이유: 화면 코드(`components/claim`)는 환자 자료 구역 울타리 밖이다(AC-004.11)
- `EXTENSION_ID`를 두 군데 이상에 적거나 바깥에서 받게 하지 마라. 이유: 확장 ID는 `commands.json` → `extensionId.ts` 상수 하나다. 다른 값으로 말을 걸 길을 남기지 않는다(AC-004.1)
- `src/lib/csp.ts`와 CSP 값을 바꾸지 마라. 이유: 네이티브 메시징은 `connect-src`와 상관없다. CSP는 이 기능 전과 글자까지 같아야 한다(AC-004.8, ADR-017)
- 울타리 시험을 '경고'로 낮추거나 `eslint-disable` 주석으로 피하지 마라. 이유: 울타리가 환자 개인정보를 지키는 장치다(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 기존 환자 자료 구역 시험(`lib/parsers` 등)과 문구 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 구현 메모 (명세 2차 리뷰 참고 사항)
- AC-004.6('환자 자료 명령에 result가 오면 오류')에서 `store.save`는 예외다. 이 명령은 보내는 쪽만 환자 자료이고 답은 result `{ saved: true }`다(AC-004.9). 시험에 이 예외 사례를 넣는다
