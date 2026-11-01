# Step 1: ai-key

> **TASK-16** 열쇠 넣기 명령 `npm run ai:key` · **REQ-515** · AC-515.1 ~ AC-515.2
> Phase 5 `ai-report-5-commands` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-16 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1). 이 step의 시험은 Step 0이 `vitest.config.ts`에 더한 `scripts/**/*.test.ts`로 잡힌다. 둘 다 `package.json`을 고친다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-515에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-515.1**: `.env.local` 글자와 새 열쇠로 넣는 함수를 부르면 `ANTHROPIC_API_KEY` 줄만 바뀌거나 더해지고 다른 줄은 그대로다(`upsertEnvText`)
- **AC-515.2**: 입력은 친 글자가 화면에 나오지 않고(`hiddenKeys`), `sk-ant-`로 시작하지 않으면 쓰지 않고 다시 넣으라고 한다. 파일은 `writePrivateFile`로 쓴다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 비밀값은 `.env.local`과 서버 환경 변수에만, 출력·로그·채팅 붙여넣기 금지)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-017(E2E 값 넣기 도우미)·023
- `/specs/ai-report/requirements.md` — REQ-515
- `/specs/ai-report/design.md` — '뽑아 보기·열쇠 명령'(`ai-key.ts`·`applyApiKey`)
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-16(`e2e/lib/envFile`은 import만, Claude는 이 명령을 실행하지 않음)
- `/e2e/lib/envFile.ts` (`hiddenKeys`·`upsertEnvText`·`writePrivateFile`·`checkEnvValue`·`runEnvSetup(deps)` — import만, 고치지 않는다)
- `/e2e/setup-env.ts` (raw 모드 숨김 입력·터미널 아니면 멈춤·Ctrl+C 처리 — `ai-key.ts`가 같은 모양을 따른다)
- `/e2e/lib/envFile.test.ts` (주입 deps로 시험하는 모양)
- `/package.json`
- 이전 step에서 만든 파일:
  - `vitest.config.ts`의 `'scripts/**/*.test.ts'` 줄, `package.json`의 `ai:try` (Phase 5 Step 0)
  - `scripts/aiTry.ts`의 `missingKeyMessage`(열쇠가 없을 때 `npm run ai:key` 안내 — 이 명령이 그 짝, Phase 5 Step 0)
  - `.env.example`의 `ANTHROPIC_API_KEY=` 줄 (Phase 1 Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-16)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `package.json`
  - `scripts/aiKey.ts`
  - `scripts/aiKey.test.ts`
  - `scripts/ai-key.ts`
- Tests:
  - `scripts/aiKey.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **Claude(이 세션)는 `npm run ai:key`를 실행하지 않는다**: 사용자가 따로 연 터미널에서 직접 친다. 열쇠를 채팅에 붙여 넣게 하지 않는다 (tasks.md TASK-16, CLAUDE.md)
- **넣은 값은 한 글자도 내지 않는다**: 질문·안내·오류 글자에 열쇠 값·일부를 담지 않는다. 보일 수 있는 것은 "넣음"·"그대로"·글자 수 정도(`e2e/lib/envFile.ts` 머리 주석과 같은 규칙)
- **숨김 입력**: raw 모드로 직접 받아 `hiddenKeys`로 처리한다(되울림 없음). 터미널이 아니면(입력을 숨길 수 없으면) 묻지 않고 멈춘다
- **모양이 틀리면 쓰지 않는다**: `sk-ant-`로 시작하지 않거나 `checkEnvValue`가 `'ok'`가 아니면 파일에 한 번도 쓰지 않고 다시 묻는다
- **파일은 `writePrivateFile`로**: 권한 600, 임시 파일을 바꿔 끼워 반쯤 쓴 파일이 남지 않게
- **`e2e/lib/envFile.ts`는 import만**: 고치지 않는다(E2E 값 넣기가 같은 파일을 쓴다)

## 작업

### 1. `package.json`
- `scripts`에 한 줄: `"ai:key": "tsx scripts/ai-key.ts"`

### 2. 시험할 논리 (`scripts/aiKey.ts`)
```ts
export const KEY_NAME = 'ANTHROPIC_API_KEY'
export const KEY_PREFIX = 'sk-ant-'
export function applyApiKey(text: string, key: string): { ok: true; text: string } | { ok: false; reason: string }
export type AiKeyDeps = {
  isTerminal: boolean
  ask(): Promise<string | null>          // 숨김 입력 한 번. Ctrl+C면 null
  read(): string | null                  // 지금 .env.local 글자(없으면 null)
  write(text: string): void              // writePrivateFile
  print(line: string): void
}
export async function runAiKey(deps: AiKeyDeps): Promise<number>   // 종료 코드
```
- `applyApiKey`: `key`가 `KEY_PREFIX`로 시작하고 `checkEnvValue(key) === 'ok'`이면 `{ ok: true, text: upsertEnvText(text, { [KEY_NAME]: key }) }`. 아니면 `{ ok: false, reason }`(이유 글자에 열쇠를 담지 않는다)
- `runAiKey`: 터미널이 아니면 묻지 않고 안내 후 1. `read()` → 묻기 → 모양이 틀리면 "저장하지 않았어요 … 다시 넣어 주세요"를 찍고 다시 묻는다 → 맞으면 `write(applyApiKey(...).text)` 한 번, "넣음" 안내 후 0. 빈 입력(Enter만)은 그대로 두고 끝(0). `ask()`가 null(Ctrl+C)이면 아무것도 쓰지 않고 멈춤 코드(130)
- 다 넣은 뒤 안내: "이제 `npm run ai:try`로 가짜 숫자 리포트를 뽑아 볼 수 있어요"

### 3. 이어 붙이기 (`scripts/ai-key.ts`, 시험하지 않음)
- `e2e/setup-env.ts`처럼: `.env.local` 경로, `readFileSync`(ENOENT면 null), raw 모드 + `hiddenKeys`로 `ask`, `writePrivateFile(ENV_FILE, text)`로 `write`, `process.stdin.isTTY`로 `isTerminal`, 끝에 터미널 되돌리기
- `runAiKey(deps)`의 결과로 `process.exitCode`

### 4. 시험 (`scripts/aiKey.test.ts`)
- 열쇠 글자는 `sk-ant-fake-…` 같은 가짜만
- AC-515.1: `.env.local` 글자(다른 이름 몇 줄 + 주석 + 기존 `ANTHROPIC_API_KEY=old`)에 `applyApiKey` → 그 줄만 새 값, 나머지 줄(순서·주석)은 그대로. 이름이 없던 글자에는 줄이 더해진다. 줄 비교는 `split(/\r?\n/)`
- AC-515.2:
  - `applyApiKey(text, 'abc')`·`('sk-ant-x y')`(빈칸)·`("sk-ant-x'")`(따옴표) → `ok: false`, `reason`에 넣은 글자가 없다
  - `runAiKey` 가짜 deps: 처음 `'abc'`, 다음 `'sk-ant-fake-1'`을 답하면 `write`는 한 번만(두 번째 값으로) 불리고, 그 사이 "다시" 안내가 찍힌다
  - 찍힌 모든 줄에 넣은 글자(`abc`·`sk-ant-fake-1`)가 없다(화면에 나오지 않음)
  - `isTerminal: false` → `ask`·`write`가 안 불리고 1
  - `ask()`가 null → `write` 안 불림, 130
  - `ai-key.ts`가 숨김 입력에 `hiddenKeys`, 쓰기에 `writePrivateFile`을 쓰는지는 파일 글자로 확인해도 된다(`split(/\r?\n/)`로 import 줄을 찾는다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-515.2 sk-ant-로 시작하지 않으면 쓰지 않고 다시 묻는다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-16 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`scripts/aiKey.ts`·`scripts/ai-key.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일(`package.json`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-16 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일·`.env` 글자를 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있고, 사용자가 메모장으로 고친 `.env.local`도 CRLF일 수 있다)
- 윈도우에서 `writePrivateFile`의 권한 600은 일부만 먹는다(그대로 둔다 — `e2e:env`와 같다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run scripts/aiKey.test.ts scripts/aiTry.test.ts src/lib/ai/boundary.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-16 --expect green
node -e "const s=require('./package.json').scripts;process.exit(s['ai:key']==='tsx scripts/ai-key.ts'&&typeof s['ai:try']==='string'?0:1)"
npm run lint -- --max-warnings=0
npm run build   # scripts/도 타입 검사를 받는다
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `npm run ai:key`·`npm run ai:try`는 치지 않는다(사용자가 따로 연 터미널에서 친다)
- `sdd status ai-report`에서 AC-515.1 ~ AC-515.2가 이 TASK의 시험과 이어져 보여야 한다. 이 step이 마지막이므로 REQ-502 ~ REQ-515의 모든 AC가 시험과 이어져야 한다(REQ-501은 문서 확인 명령으로 본다)
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (명령은 `scripts/`, 숨김 입력 도우미는 `e2e/lib/envFile` 재사용)
   - ADR 기술 스택을 벗어나지 않았는가? (새 패키지 없음)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 출력 없음, `.env.local`에만)
3. 결과에 따라 `phases/ai-report-5-commands/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 단계(사용자 확인)에 그대로 전달한다. 만든 파일과 사용자가 칠 순서(따로 연 터미널에서 `npm run ai:key` → `npm run ai:try` → `.ai-try/` 파일 읽기)를 한 줄에 담는다

## 금지사항

- `npm run ai:key`를 실행하거나 사용자에게 열쇠를 채팅에 붙여 넣으라고 하지 마라. 이유: 열쇠가 대화 기록에 남는다(CLAUDE.md 보안 규칙). 사용자가 따로 연 터미널에서 친다
- `.env.local`을 열어 읽거나 내용을 찍지 마라. 이유: 다른 비밀값(Supabase·E2E 계정)도 들어 있다
- 넣은 값·그 일부를 `print`·오류·예외 글자에 담지 마라. 이유: 화면·로그에 열쇠가 남는다(AC-515.2)
- 터미널이 아닐 때 보이는 입력으로 묻지 마라. 이유: 친 글자가 화면·기록에 남는다(`e2e/setup-env.ts`와 같은 규칙)
- `e2e/lib/envFile.ts`·`e2e/setup-env.ts`를 고치지 마라(import만). 이유: E2E 값 넣기가 같은 파일을 쓰고, 수정 범위 밖이다(tasks.md TASK-16)
- `.env.local`에 `ANTHROPIC_API_KEY` 밖의 줄을 바꾸거나 지우지 마라. 이유: 다른 값이 망가지면 앱·E2E가 멈춘다(AC-515.1)
- `NEXT_PUBLIC_ANTHROPIC_API_KEY` 같은 이름을 쓰지 마라. 이유: `NEXT_PUBLIC_*`는 브라우저로 나간다
- `package.json`에 `ai:key` 밖의 것을 더하거나 `ai:try` 줄을 고치지 마라. 이유: 이 TASK는 `ai:key` 한 줄만 더한다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다. `e2e/lib/envFile.test.ts`·울타리 시험도 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
