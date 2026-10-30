# Step 2: extension

> **TASK-3** 크롬 확장 · **REQ-003** · AC-003.1 ~ AC-003.8
> Phase 1 `precheck-1-helper` · Step 2 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-003에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-003.1**: `extension/manifest.json`: `manifest_version` 3, `permissions`는 `["nativeMessaging"]` 하나, `host_permissions`·`content_scripts`·`web_accessible_resources` 없음, `externally_connectable.matches`는 우리 사이트 origin 하나(와일드카드 도메인 없음)
- **AC-003.2**: 웹에서 온 연결(`onConnectExternal`)의 `sender.origin`이 우리 origin이 아니면 바로 끊고 도우미를 켜지 않는다
- **AC-003.3**: 우리 origin의 메시지가 봉투 `{v, id, cmd, args}` 모양이고 `cmd`가 명령 표에 있으면 도우미에 그대로 넘기고, 아니면 `E-BRIDGE-REJECTED`로 답하고 넘기지 않는다
- **AC-003.4**: 도우미 답은 고치거나 쌓아 두지 않고 그 웹 연결에 그대로 넘긴다. `extension/src/**`는 `chrome.storage`·`localStorage`·`indexedDB`·console·`fetch`·`XMLHttpRequest`·`WebSocket`을 쓰지 않는다(ESLint가 막고 `src/guardrails.test.ts`가 증명)
- **AC-003.5**: 웹 연결이 이미 하나 있으면 두 번째 연결은 `E-BRIDGE-BUSY`로 답하고 끊는다. 첫 연결이 끊기면 다시 받는다
- **AC-003.6**: `hello`: 도우미 답에 확장 버전(`manifest.version`)과 확장 `protocol`을 붙여 돌려준다. 도우미를 켜지 못하면(`connectNative` 끊김·`lastError`) `E-HELPER-MISSING`
- **AC-003.7**: `bit.input` 진행 중 웹 연결이 끊기면 도우미 연결은 그 요청의 `end`·`error`가 오거나 30분이 지날 때까지 두었다가 닫는다. 그 밖의 명령 중 끊기면 도우미 연결도 바로 닫는다
- **AC-003.8**: `npm run ext:build` → `extension/tsconfig.json`으로 `extension/dist/`에 JS와 manifest를 만든다. 루트 `tsconfig.json`은 `extension/`·`helper/`를 빼서 `npm run build`가 그대로 통과

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-003
- `/specs/precheck/design.md` — 3절(`extension/` 폴더), 4-1~4-3절(메시지·명령 표), 5절(울타리), 12절(`extension` 일), 14절(`@types/chrome`), 15절(창 하나), 16절(압축 풀린 확장 시험)
- `/specs/precheck/tasks.md` — TASK-3 (수정 범위·메모)
- `/eslint.config.mjs`, `/src/guardrails.test.ts` (울타리 방식)
- `/package.json`, `/vitest.config.ts`, `/tsconfig.json`
- 이전 step에서 만든 파일:
  - `src/lib/bridge/commands.json`(`origin`·`extensionId`·`extensionKey`·명령 표) (Step 0)
  - `.github/workflows/helper.yml` (Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `extension/manifest.json`
  - `extension/tsconfig.json`
  - `extension/src/background.ts`
  - `extension/src/relay.ts`
  - `extension/src/chromeLike.ts`
  - `extension/src/*.test.ts`
  - `package.json`
  - `package-lock.json`
  - `vitest.config.ts`
  - `tsconfig.json`
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
  - `.gitignore`
  - `.github/workflows/helper.yml`
- Tests:
  - `extension/src/manifest.test.ts`
  - `extension/src/relay.test.ts`
  - `extension/src/background.test.ts`
  - `src/guardrails.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **비밀값**: 키·토큰 값을 코드·시험 이름·로그·출력에 남기지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키를 두지 않는다 (CLAUDE.md 보안 규칙)

## 작업

### 1. 패키지·설정
- `@types/chrome`을 dev 패키지로 **정확한 버전**으로 넣는다(`npm install -D -E @types/chrome@<지금 판>`)
- `package.json` 스크립트 `ext:build`: `tsc -p extension/tsconfig.json` 뒤 `manifest.json`을 `extension/dist/`로 복사. 새 스크립트 파일은 수정 범위 밖이므로 한 줄 `node -e`로 한다
- `extension/tsconfig.json`: `outDir: extension/dist`, ES 모듈, `types: ["chrome"]`. 서비스 워커(`"background": {"service_worker": "background.js", "type": "module"}`)에서 바로 돌아가는 모양으로 낸다. 명령 표 JSON을 서비스 워커가 그대로 import하지 못하면 빌드 때 JS 모듈로 옮겨 쓴다(어떻게 했는지 summary에)
- `.gitignore`·ESLint `ignores`에 `extension/dist/`
- `vitest.config.ts`의 `extension/**/*.test.ts`는 Step 0이 이미 넣었다(확인만)

### 2. `extension/manifest.json`
- `manifest_version: 3`, `name`, `version`(예: `0.1.0`), `permissions: ["nativeMessaging"]`, `background`, `externally_connectable: {"matches": ["https://seoseungkwanapp.vercel.app/*"]}`(`commands.json` `origin`과 같은 호스트, 경로의 `/*`만 허용, 호스트 와일드카드 없음), `key: <commands.json extensionKey>`
- `host_permissions`·`content_scripts`·`web_accessible_resources`·`action`의 팝업 페이지를 두지 않는다

### 3. 코드 (시그니처)
```ts
// chromeLike.ts — 시험에서 가짜 chrome을 넣을 수 있게 필요한 모양만
export type PortLike = { name?: string; sender?: { origin?: string }; postMessage(m: unknown): void; disconnect(): void;
  onMessage: { addListener(fn: (m: unknown) => void): void }; onDisconnect: { addListener(fn: () => void): void } }
export type ChromeLike = { runtime: { onConnectExternal: { addListener(fn: (p: PortLike) => void): void };
  connectNative(host: string): PortLike; lastError?: { message?: string } } }

// relay.ts — 순수 함수(시험 대상). commands.json을 읽는다
export function isOurOrigin(origin: string | undefined): boolean
export function checkRequest(msg: unknown): { ok: true; req: Envelope } | { ok: false; reply: ErrorReply } // E-BRIDGE-REJECTED
export function withExtensionInfo(reply: unknown, ext: { version: string; protocol: number }): unknown  // hello 답에만
export const INPUT_KEEP_MS = 30 * 60 * 1000

// background.ts — 서비스 워커 입구
export function startBackground(chrome: ChromeLike, manifest: { version: string }): void
```
- 흐름: 웹 연결 → origin 검사(아니면 끊기, `connectNative` 부르지 않음) → 이미 연결이 있으면 `E-BRIDGE-BUSY` 후 끊기 → 첫 메시지 때 `connectNative(hostName)` → 웹 메시지마다 `checkRequest` → 통과하면 그대로 넘김 → 도우미 답은 그대로 웹에 넘김(`hello`의 `result`에만 확장 정보 붙임)
- 도우미 연결이 `onDisconnect`로 끊기고 `lastError`가 있으면 기다리던 요청마다 `E-HELPER-MISSING`
- 웹이 끊길 때 진행 중인 `bit.input` 요청이 있으면 도우미 연결을 그 요청의 `end`·`error`까지, 길어도 30분까지 두고 닫는다. 그 사이 새 웹 연결은 `E-BRIDGE-BUSY`
- 답을 쌓아 두거나 고치지 않는다. 조각은 1MB 이하로 이미 나뉘어 온다

### 4. 울타리
- `eslint.config.mjs`: `extension/src/**`에 `chrome.storage`·`localStorage`·`sessionStorage`·`indexedDB`·`console`·`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource` 금지(`no-restricted-globals`·`no-restricted-properties`·`no-restricted-syntax`로 `chrome.storage` 멤버 접근)
- `src/guardrails.test.ts`: 규칙마다 '막힌다' 시험 하나씩(AC-003.4). 기존 시험 모양(ESLint API로 가짜 파일 검사)을 따른다

### 5. workflow `extension` 일
- `.github/workflows/helper.yml`에 `extension` 일(`ubuntu-latest`): `npm ci` → `npm run ext:build` → `precheck-extension-<manifest.version>.zip` → artifact. `release` 일이 이 zip도 함께 올린다
- 이 step에서 고친 뒤 `helper/tests/build.test.ts`(Step 1)가 계속 통과해야 한다

### 6. 시험
- `manifest.test.ts`: AC-003.1(칸 검사) + `key`로 계산한 ID가 `commands.json` `extensionId`와 같다 + `externally_connectable` 호스트가 `commands.json` `origin`과 같다
- `relay.test.ts`: AC-003.2·003.3·003.6(정보 붙이기)
- `background.test.ts`: 가짜 `ChromeLike`로 AC-003.2·003.4·003.5·003.6(`E-HELPER-MISSING`)·003.7(가짜 시계로 30분)
- AC-003.8은 `npm run ext:build` 뒤 `extension/dist/manifest.json`·`background.js`가 있는지 보는 시험(또는 AC 커맨드)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npm run ext:build && ls extension/dist/manifest.json extension/dist/background.js
npx vitest run extension/src/manifest.test.ts extension/src/relay.test.ts extension/src/background.test.ts src/guardrails.test.ts
npx vitest run helper/tests/build.test.ts                    # Step 1 시험이 계속 통과
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint && npm test && npm run build                    # 루트 빌드가 extension/을 빼고 통과(AC-003.8)
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-003.1 ~ AC-003.8이 이 TASK의 시험과 이어져 보여야 한다

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

- `permissions`에 `nativeMessaging` 말고 다른 권한(`storage`·`tabs`·`<all_urls>` 등)을 넣지 마라. 이유: AC-003.1. 권한이 늘면 웹스토어 심사와 보안 범위가 커진다(ADR-016)
- 확장에서 답을 저장·기록·변환하지 마라(`chrome.storage`·console 포함). 이유: 환자 자료가 확장 안에 남거나 로그로 샌다(AC-003.4, ADR-017)
- origin 검사 전에 `connectNative`를 부르지 마라. 이유: 남의 사이트가 연결만 해도 도우미가 켜진다(AC-003.2)
- `externally_connectable.matches`에 `*.vercel.app`·`http://localhost` 같은 넓은 주소를 넣지 마라. 이유: 다른 사이트가 확장에 말할 수 있게 된다(AC-003.1)
- 새 번들러·빌드 도구 패키지를 넣지 마라. 이유: design.md 14절: 웹 쪽 새 패키지는 `@types/chrome` 하나다
- 기존 테스트를 깨뜨리지 마라. 이유: `eslint.config.mjs`·`vitest.config.ts`·`tsconfig.json`을 고치므로 전체 시험을 다시 돌린다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 웹스토어 심사 전에는 '압축 풀린 확장 불러오기'(`extension/dist/`)로 시험한다. manifest `key` 덕분에 ID가 `commands.json`과 같다(design.md 16절)
