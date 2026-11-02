# Step 2: boundary-test

> **TASK-14** 울타리 시험 · **REQ-513** · AC-513.1 ~ AC-513.3
> Phase 4 `ai-report-4-flow` · Step 2 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2). 이 시험은 앞 step까지 만든 `src/app/api/ai/`·`src/lib/ai/` 파일 전부를 본다. 다음 phase(`ai-report-5-commands`)가 더하는 `scripts/`·`src/lib/ai/markdown.ts`도 이 시험 아래에서 만들어진다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-513에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-513.1**: 저장소의 모든 소스에서 `@anthropic-ai/sdk` import는 `src/app/api/ai/`와 `scripts/` 밖에는 없다
- **AC-513.2**: `src/app/api/ai/` 아래 시험 아닌 `.ts` 파일의 첫 줄은 `import 'server-only'`다(경로 파일 `route.ts` 제외)
- **AC-513.3**: `src/lib/ai/` 시험 아닌 파일의 import에 supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈이 없고 `fetch`가 없다(순수 함수만)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 서버 코드는 `app/api/ai/` 하나, 울타리는 시험으로 증명)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-004·020·023
- `/specs/ai-report/requirements.md` — REQ-513
- `/specs/ai-report/design.md` — '흐름'(SDK는 `claude.ts` 한 곳, `lib/ai`는 순수 함수), '위험' 4(CRLF)
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-14(RED를 보는 법 메모)
- `/src/guardrails.test.ts` (저장소의 기존 울타리 시험 모양 — 고치지 않는다)
- `/eslint.config.mjs` (`scripts/`는 린트가 보지 않는다 — 이 시험이 대신 본다)
- 이전 step에서 만든 파일(이 시험이 검사하는 대상):
  - `src/lib/ai/input.ts`·`basis.ts`·`prompt.ts`·`cost.ts`·`output.ts` (Phase 1~3)
  - `src/app/api/ai/claude.ts`·`store.ts` (Phase 3), `generate.ts` (Phase 4 Step 0), `report/route.ts` (Phase 4 Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/ai/boundary.test.ts`
- Tests:
  - `src/lib/ai/boundary.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **시험만 더한다**: 이 TASK의 수정 범위는 시험 파일 하나다. 앞 TASK의 파일이 규칙을 어기면 고치지 말고 `blocked`(어느 파일·어느 줄)로 멈춘다
- **CRLF**: 파일 줄은 늘 `split(/\r?\n/)`로 나눈다. 첫 줄 앞의 BOM(`\uFEFF`)도 뺀 뒤 비교한다 (design 위험 4)
- **자기 자신을 잡지 않게**: 이 시험 파일 안의 규칙 위반 견본 글자(가짜 파일 목록)가 실제 저장소 검사에 걸리지 않게 한다 — 저장소 검사에서 이 파일을 빼거나, 견본 글자를 이어 붙여 만든다(`'@anthropic' + '-ai/sdk'`)
- **`node_modules`·`.next` 제외**: 저장소 소스는 `src`·`scripts`·`e2e`·`fixtures`·`supabase` 아래 `.ts`·`.tsx`·`.js`·`.mjs`·`.cjs` 파일. `node_modules`·`.next`·`extension/dist`는 보지 않는다

## 작업

### 1. 판정 함수 (시험 파일 안, export하지 않음)
```ts
type SourceFile = { path: string; text: string }        // path는 저장소 기준 '/' 경로
function sdkImportsOutsideAllowed(files: SourceFile[]): string[]   // AC-513.1 — 어긴 파일 경로
function missingServerOnly(files: SourceFile[]): string[]          // AC-513.2
function impureLibAi(files: SourceFile[]): string[]                // AC-513.3
```
- AC-513.1: `from '@anthropic-ai/sdk…'`·`import '@anthropic-ai/sdk…'`·`import('@anthropic-ai/sdk…')`·`require('@anthropic-ai/sdk…')`(작은·큰따옴표, 하위 경로 포함)가 있는 파일 중 `src/app/api/ai/`·`scripts/` 밖의 것
- AC-513.2: `src/app/api/ai/` 아래 `.ts` 파일 중 시험(`*.test.ts`)과 `route.ts`를 뺀 것의 첫 줄이 `import 'server-only'`(끝 `;` 허용)가 아닌 것
- AC-513.3: `src/lib/ai/` 아래 시험 아닌 파일 중 import(정적·동적·`require`)가 `@supabase/`·`…/supabase…`·`next`·`next/…`·`react`·`react-dom`·`@anthropic-ai/sdk`·`node:…`(그리고 `fs`·`path`·`crypto` 같은 맨 이름 Node 내장)인 것, 또는 `fetch(` 호출이 있는 것

### 2. 시험 (`src/lib/ai/boundary.test.ts`)
- 판정 함수마다 두 가지 `it`:
  - 가짜 파일 목록(어긴 것·지킨 것 섞어)으로 판정 함수가 어긴 것만 정확히 잡는다(예: `src/lib/ai/bad.ts`의 `import { readFileSync } from 'node:fs'`, `src/components/x.tsx`의 SDK import, 첫 줄이 주석인 `src/app/api/ai/x.ts`, CRLF 줄바꿈의 정상 파일은 안 잡힘)
  - 실제 저장소 파일(`node:fs`로 읽음)에 대해 판정 결과가 빈 목록
- 시험 이름 예: `it('AC-513.1 SDK import는 src/app/api/ai/와 scripts/ 밖에 없다', …)`, `it('AC-513.1 판정 함수는 밖의 SDK import를 잡는다', …)`

## TDD 순서

앞 TASK들이 규칙을 이미 지키므로 저장소 검사만으로는 RED가 나오지 않는다. tasks.md TASK-14 메모대로 판정 함수의 RED를 먼저 본다.

1. 시험을 먼저 쓴다. 판정 함수는 처음에 빈 목록만 돌려주게(`return []`) 두고, 가짜 파일 목록 시험이 어긴 것을 잡기를 기대하게 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다(가짜 위반을 못 잡는다). 이 TASK는 시험 파일 하나라 RED 전에도 고칠 수 있지만, RED 기록을 먼저 남긴다
3. 판정 함수를 채우고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다. 실제 저장소 검사도 통과해야 한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). 경로는 `path.relative` 뒤 `\`를 `/`로 바꿔 비교한다(윈도우 경로 구분자)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/boundary.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint -- --max-warnings=0
npm run build
npm test   # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-513.1 ~ AC-513.3이 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 코드·SDK는 `src/app/api/ai/`·`scripts/`만, `lib/ai`는 순수)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/ai-report-4-flow/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정, 앞 TASK 파일의 규칙 위반 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 보는 폴더·확장자, 판정 규칙을 한 줄에 담는다(다음 phase가 이 울타리 아래에서 `scripts/`·`markdown.ts`를 만든다)

## 금지사항

- 앞 TASK의 파일을 고쳐 시험을 통과시키지 마라. 이유: 이 TASK의 수정 범위는 시험 하나다. 위반이 있으면 `blocked`로 멈추고 어느 파일인지 적는다
- `src/guardrails.test.ts`·`eslint.config.mjs`를 고치지 마라. 이유: 환자 자료 구역 울타리이고 수정 범위 밖이다
- 판정 규칙을 느슨하게 해(예: 첫 다섯 줄 안이면 통과, `node:`만 보고 맨 이름 내장은 안 봄) 통과시키지 마라. 이유: 울타리가 새면 SDK·DB 코드가 브라우저 묶음에 섞인다(AC-513.1·513.3)
- 실제 저장소 검사를 `skip`하거나 가짜 목록 시험만 남기지 마라. 이유: 판정 함수가 맞아도 저장소를 보지 않으면 울타리를 증명하지 못한다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
