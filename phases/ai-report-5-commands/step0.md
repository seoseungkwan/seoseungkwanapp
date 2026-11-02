# Step 0: ai-try

> **TASK-15** 리포트 뽑아 보기 명령 `npm run ai:try` · **REQ-514** · AC-514.1 ~ AC-514.3
> Phase 5 `ai-report-5-commands` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1). 둘 다 `package.json`을 고치고, 다음 step의 `scripts/aiKey.test.ts`는 이 step이 `vitest.config.ts`에 더하는 `scripts/**/*.test.ts`로 돈다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-514에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-514.1**: `reportMarkdown`이 제목(달·진행 중이면 "진행 중인 달" 경고), 요약, 카드마다 꼬리표 이름(늘었어요 등)·문장·근거 줄, 끝에 모델·토큰·비용(달러)이 있는 Markdown을 만든다
- **AC-514.2**: 명령은 `fixtures/fake-ai/`의 가짜 숫자로 `generateReport`를 부르고(진짜 Claude, 저장·사용량은 메모리에만), `.ai-try/`에 Markdown 파일을 쓰고 경로를 알린다. DB·Supabase에 닿지 않는다
- **AC-514.3**: `.env.local`에 열쇠가 없으면 Claude를 부르지 않고 `npm run ai:key`로 넣으라는 안내와 함께 끝난다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 비밀값, 가짜 자료만)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-007·023
- `/specs/ai-report/requirements.md` — REQ-514, 배경 1·12
- `/specs/ai-report/design.md` — '흐름'의 `[npm run ai:try]`, '뽑아 보기·열쇠 명령', '비용'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-15(`vitest.config.ts`는 한 줄만, `ai-try.ts`는 시험하지 않음)
- `/package.json` (`scripts` — `e2e:env`처럼 `tsx`로 돈다), `/vitest.config.ts` (`include` 목록, `server-only` 별칭)
- `/eslint.config.mjs` (`scripts/`는 린트가 보지 않는다 — 대신 `next build`의 타입 검사와 TASK-14 울타리 시험이 본다)
- `/src/lib/errors.ts` (`errorInfo` — 실패 때 찍을 문구)
- `/src/lib/analytics/dates.ts` (`addMonths`·`isMonth` — 읽기만), `/src/components/charts/format.ts` (`formatCount` — import만)
- 이전 step에서 만든 파일:
  - `fixtures/fake-ai/months/*.json`·`groups.json` (Phase 2 Step 0)
  - `src/types/aiReport.ts` (`SavedReport`·`AiUsage`·`CardTag`, Phase 1 Step 2)
  - `src/lib/ai/cost.ts` (`costMicroUsd`, Phase 2 Step 4)
  - `src/app/api/ai/claude.ts` (`callClaude` — 진짜 부름, Phase 3 Step 1), `src/app/api/ai/store.ts` (`ReportMonths`, Phase 3 Step 2)
  - `src/app/api/ai/generate.ts` (`generateReport`·`GenerateDeps`, Phase 4 Step 0)
  - `src/lib/ai/boundary.test.ts` (울타리: `scripts/`는 SDK를 써도 되지만 `src/lib/ai/`는 순수 — `markdown.ts`도 이 아래, Phase 4 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `package.json`
  - `vitest.config.ts`
  - `src/lib/ai/markdown.ts`
  - `src/lib/ai/markdown.test.ts`
  - `scripts/aiTry.ts`
  - `scripts/aiTry.test.ts`
  - `scripts/ai-try.ts`
- Tests:
  - `src/lib/ai/markdown.test.ts`
  - `scripts/aiTry.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **이 세션은 `npm run ai:try`를 치지 않는다**: 진짜 Claude를 부르고 비용(1회 약 150~200원)이 든다. 끝에 사용자가 직접 친다 (tasks.md TASK-15)
- **열쇠**: `.env.local`을 열거나 열쇠 값을 읽어 찍지 않는다. 명령은 `--env-file-if-exists=.env.local`로 받은 `process.env.ANTHROPIC_API_KEY`가 있는지만 본다. 열쇠 글자를 출력·파일에 쓰지 않는다 (CLAUDE.md 보안 규칙)
- **DB에 닿지 않는다**: `ai-try.ts`는 `supabaseServer`·`store.ts`의 `saveReport`·`addUsage`를 쓰지 않는다. 저장·사용량은 메모리 배열에 담는다 (AC-514.2)
- **가짜 숫자는 `fixtures/fake-ai/`에서만 읽는다**: 숫자를 코드에 쓰지 않는다
- **`src/lib/ai/markdown.ts`는 순수 함수**: `node:` 모듈·SDK·supabase·next·react·`fetch` 없음(울타리 시험이 본다). 파일 쓰기·`node:fs`는 `scripts/`에서만 (AC-513.3, design '뽑아 보기·열쇠 명령')
- **`vitest.config.ts`는 한 줄만**: `include`에 `'scripts/**/*.test.ts',` 한 줄을 더한다. 다른 줄은 고치지 않는다

## 작업

### 1. `package.json`
- `scripts`에 한 줄: `"ai:try": "tsx --conditions=react-server --env-file-if-exists=.env.local scripts/ai-try.ts"` (`server-only`가 react-server 조건에서만 열린다. Node 24는 `--env-file-if-exists`가 있다)

### 2. Markdown (`src/lib/ai/markdown.ts`)
```ts
export const TAG_LABEL: Readonly<Record<CardTag, string>>   // up 늘었어요 · down 줄었어요 · watch 살펴볼 것 · guess 추정
export function reportMarkdown(report: SavedReport, usage: AiUsage): string
```
- requirements AC-514.1은 `reportMarkdown(report, input)`으로 적었지만, 끝의 토큰·비용은 사용량에서만 나온다. design.md '뽑아 보기·열쇠 명령'의 `reportMarkdown(report, usage)`를 따른다(달·`partial`·근거 줄은 `report`에 있다). 이 결정을 summary에 적는다
- 모양(예):
  ```
  # AI 월간 리포트 · 2026년 10월
  > 진행 중인 달이에요. 아직 끝나지 않아 숫자가 적게 보일 수 있어요.      ← partial일 때만
  ## 요약
  <summary>
  ## 카드
  ### 늘었어요
  <text>
  <basis>
  ---
  모델 claude-opus-5-5 · 입력 토큰 12,345 · 출력 토큰 2,345 · 비용 $0.120000
  ```
- 비용은 `costMicroUsd(usage)`(백만분의 1달러 정수)를 정수 계산으로 소수 여섯째 자리까지 그대로 쓴다(반올림 없음, 예: 120000 → `$0.120000`). 토큰은 `formatCount`
- 줄바꿈은 `\n`

### 3. 시험할 논리 (`scripts/aiTry.ts`)
```ts
export function fakeMonthsLoader(dir: string): (month: string) => Promise<ReportMonths>
export function resultFileName(month: string, now: Date): string        // '<달>-<YYYYMMDD-HHmmss>.md', 한국 시각
export function missingKeyMessage(env: Record<string, string | undefined>): string | null
```
- `fakeMonthsLoader`: `<dir>/months/<달>.json`을 고른 달·`addMonths(달, -1)`·`addMonths(달, -12)`로 읽어 `JSON.parse`(파일이 없으면 null), `groupNames`는 `<dir>/groups.json`. 검사는 하지 않는다(`generateReport`가 한다)
- `resultFileName('2026-10', now)` → 예 `2026-10-20261101-093015.md`(한국 시각 — `Intl.DateTimeFormat` `timeZone: 'Asia/Seoul'`)
- `missingKeyMessage`: `ANTHROPIC_API_KEY`가 없거나 빈 글자(앞뒤 빈칸만)면 "열쇠가 없어요. 따로 연 터미널에서 `npm run ai:key`로 넣어 주세요" 같은 안내, 있으면 null. 안내에 열쇠 값·일부를 담지 않는다

### 4. 이어 붙이기 (`scripts/ai-try.ts`, 시험하지 않음)
- 인자 `--month YYYY-MM`(기본 `2026-10`, `isMonth`가 아니면 안내 후 코드 1)
- `missingKeyMessage(process.env)`가 글자면 찍고 코드 1로 끝(Claude를 부르지 않는다 — AC-514.3)
- `generateReport(month, { loadMonths: fakeMonthsLoader('fixtures/fake-ai'), callClaude, saveReport: 배열에 담고 true, addUsage: 배열에 담고 true, now: () => new Date() })`
- 성공: `.ai-try/`를 만들고(`mkdirSync(…, { recursive: true })`) `reportMarkdown(report, usage)`를 `resultFileName`으로 쓴 뒤 경로와 비용을 찍는다
- 실패: 오류 번호와 `errorInfo(code)`의 what·fix를 찍고 코드 1
- `console.log`로 찍어도 된다(사용자가 터미널에서 보는 명령). 단 열쇠·요청 글자는 찍지 않는다

### 5. 시험
- `vitest.config.ts`에 한 줄을 먼저 더한다(설정 파일은 RED 전에도 고칠 수 있다). 그래야 `scripts/aiTry.test.ts`가 잡힌다
- `src/lib/ai/markdown.test.ts`(AC-514.1): 제목에 달, `partial: true`면 "진행 중인 달" 줄이 있고 false면 없다. 카드마다 `TAG_LABEL` 이름·문장·근거 줄. 끝 줄에 모델·토큰(쉼표)·`$0.120000`(입력 10,000·출력 4,000, `claude-opus-5-5`)
- `scripts/aiTry.test.ts`:
  - AC-514.2: `fakeMonthsLoader('fixtures/fake-ai')('2026-10')`이 세 달과 그룹 이름을 돌려주고, 없는 달(`2020-01`)이면 셋 다 null. 그 결과로 가짜 `callClaude`를 넣은 `generateReport`가 성공하고 저장·사용량이 메모리 배열에 담긴다(DB 클라이언트를 만들지 않는다). `resultFileName`이 `.md`로 끝나고 한국 시각
  - AC-514.3: `missingKeyMessage({})`·`({ ANTHROPIC_API_KEY: '' })`·`('  ')` → `npm run ai:key`가 든 안내, `({ ANTHROPIC_API_KEY: 'sk-ant-fake-x' })` → null. 안내에 `sk-ant-`가 없다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-514.3 열쇠가 없으면 npm run ai:key 안내', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-15 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/lib/ai/markdown.ts`·`scripts/aiTry.ts`·`scripts/ai-try.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일(`package.json`·`vitest.config.ts`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-15 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일(만든 Markdown 포함)을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). 경로는 `node:path`의 `join`으로 만든다(`\`·`/` 섞임)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/markdown.test.ts scripts/aiTry.test.ts src/lib/ai/boundary.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-15 --expect green
ANTHROPIC_API_KEY= npx tsx --conditions=react-server scripts/ai-try.ts; test $? -eq 1   # 열쇠 빈 값 → 안내만, Claude 안 부름(.env.local을 읽지 않는 꼴로만 돌린다)
npm run lint -- --max-warnings=0
npm run build   # scripts/도 타입 검사를 받는다
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- 세 번째 줄은 `--env-file-if-exists`를 빼고 열쇠를 빈 값으로 덮어 돌리는 것이라 Claude를 부르지 않는다. `npm run ai:try`(열쇠를 읽는 꼴)는 치지 않는다
- `sdd status ai-report`에서 AC-514.1 ~ AC-514.3이 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/lib/ai/`는 순수, 파일 쓰기는 `scripts/`)
   - ADR 기술 스택을 벗어나지 않았는가? (새 패키지 없음 — `tsx`는 이미 있다)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (열쇠 값 출력 없음, DB 안 닿음)
3. 결과에 따라 `phases/ai-report-5-commands/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `reportMarkdown` 인자 결정, `vitest.config.ts`에 더한 줄, 사용자가 칠 명령(`npm run ai:key` 뒤 `npm run ai:try`)을 한 줄에 담는다

## 금지사항

- `npm run ai:try`를 치지 마라. 이유: 진짜 Claude를 부르고 비용이 든다. 사용자가 끝에 직접 친다(tasks.md TASK-15)
- `.env.local`을 열거나, 열쇠 값·그 일부·길이를 찍지 마라. 이유: 비밀값은 출력·로그·채팅에 나오면 안 된다(CLAUDE.md)
- `ai-try.ts`에서 `supabaseServer`·`store.ts`·DB를 쓰지 마라. 이유: 뽑아 보기 명령은 DB·Supabase에 닿지 않는다(AC-514.2)
- `src/lib/ai/markdown.ts`에서 `node:fs`·`node:path`를 쓰지 마라. 이유: `lib/ai`는 순수 함수만이다(AC-513.3). 파일 쓰기는 `scripts/`가 한다
- `vitest.config.ts`의 다른 줄(별칭·환경·다른 include)을 고치지 마라. 이유: 모든 시험의 설정이다. 이 TASK는 한 줄만 더한다
- `package.json`에 `ai:try` 밖의 스크립트·패키지를 더하지 마라. 이유: `ai:key`는 다음 step(TASK-16)이 더한다. 둘이 같은 파일이라 차례로 돈다
- `.ai-try/`의 결과 파일을 저장소에 남기지 마라. 이유: `.gitignore`가 거른다(Phase 1 Step 0). 시험이 만든 임시 파일은 시험이 지운다(OS 임시 폴더를 쓴다)
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다. 울타리 시험(`boundary.test.ts`)도 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
