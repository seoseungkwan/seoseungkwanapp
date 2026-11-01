# Step 0: generate-flow

> **TASK-12** 리포트 만들기 흐름 · **REQ-511** · AC-511.1 ~ AC-511.5
> Phase 4 `ai-report-4-flow` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다. AC-511.6(`loadReportMonths`)은 TASK-11이 이미 했다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2). 다음 step(서버 경로)이 이 step의 `generateReport`를 부른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-511에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-511.1**: 고른 달 숫자가 없거나 `validateMonthPayload`를 못 넘으면 Claude를 부르지 않고 `E-AI-NO-DATA`. 비교 달이 검사를 못 넘으면 그 달은 없는 달로 본다
- **AC-511.2**: 숫자가 있으면 입력 → 지시문 → Claude → 답 검사 → 저장(리포트·지문·모델) → 사용량 기록 순서이고, 저장한 리포트를 돌려준다
- **AC-511.3**: Claude가 답했지만 검사가 null이면 저장하지 않고, 사용량은 기록하고 `E-AI-FAILED`
- **AC-511.4**: Claude 오류(사용량 없음)면 저장·사용량 기록을 하지 않고 그 오류 번호. 사용량이 있는 오류(`refusal` 등)는 사용량을 기록한다
- **AC-511.5**: 저장이나 사용량 기록이 실패하면 `E-AI-FAILED`(만든 리포트를 저장 없이 보여 주지 않는다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: AI 경로는 서버가 DB에서 읽어 `validate.ts`로 검사한 집계만 보낸다)
- `/docs/ARCHITECTURE.md` — AI 흐름 줄(Phase 1 Step 0이 저장 단계를 더함)
- `/docs/ADR.md` — ADR-004·007·008·023
- `/specs/ai-report/requirements.md` — REQ-511, 배경 1·4·5·10
- `/specs/ai-report/design.md` — '흐름', '만들기 흐름', '저장', '결정과 트레이드오프'의 '사용량 기록'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-12
- `/src/lib/payload/validate.ts` (`validateMonthPayload` — 읽기만)
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`SavedReport`·`AiUsage`·`AiErrorCode`·`ReportInput`, Phase 1 Step 2)
  - `src/lib/ai/input.ts` (`buildReportInput`·`reportFingerprint`·`ValidReportMonths`, Phase 1 Step 2)
  - `fixtures/fake-ai/months/*.json`·`fixtures/fake-ai/groups.json` (가짜 숫자 — 시험이 읽는다, Phase 2 Step 0)
  - `src/lib/ai/prompt.ts` (`systemPrompt`·`userMessage`·`reportJsonSchema`, Phase 2 Step 3)
  - `src/lib/ai/cost.ts` (`costMicroUsd`, Phase 2 Step 4)
  - `src/lib/ai/output.ts` (`parseAiReport`, Phase 3 Step 0)
  - `src/app/api/ai/claude.ts` (`callClaude`·`ClaudeResult`, Phase 3 Step 1)
  - `src/app/api/ai/store.ts` (`ReportMonths`·`loadReportMonths`·`saveReport`·`addUsage`, Phase 3 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/api/ai/generate.ts`
  - `src/app/api/ai/generate.test.ts`
- Tests:
  - `src/app/api/ai/generate.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **읽은 숫자도 검사**: `deps.loadMonths`가 준 세 달은 `unknown`이다. 셋 다 `validateMonthPayload`로 검사한다. 고른 달이 못 넘으면 `E-AI-NO-DATA`(Claude를 부르지 않는다), 비교 달이 못 넘으면 null(없는 달) (CLAUDE.md, AC-511.1)
- **저장 없이 보여 주지 않는다**: 저장이나 사용량 기록 중 하나라도 실패하면 `E-AI-FAILED`. 만든 리포트를 돌려주지 않는다 (AC-511.5)
- **비용을 놓치지 않는다**: Claude가 사용량을 준 모든 경우(성공·검사 실패·`refusal`·`max_tokens`)에 사용량을 기록한다. 저장이 실패해도 사용량은 기록한 뒤 `E-AI-FAILED` (design '만들기 흐름')
- **deps로만 바깥과 닿는다**: DB·Claude·시각은 모두 `deps`로 받는다. 이 파일은 SDK를 import하지 않는다 — `callClaude`의 타입만 `import type`으로 가져온다(`typeof callClaude`). `console`을 쓰지 않는다
- **첫 줄 `import 'server-only'`** (AC-513.2)
- **진짜 Claude를 부르지 않는다**: 시험의 deps는 모두 가짜다

## 작업

### 1. 코드 (`src/app/api/ai/generate.ts`)
```ts
import 'server-only'
export type GenerateDeps = {
  loadMonths(month: string): Promise<ReportMonths>
  callClaude: typeof callClaude
  saveReport(r: SavedReport): Promise<boolean>
  addUsage(u: AiUsage & { costMicroUsd: number }): Promise<boolean>
  now(): Date
}
export async function generateReport(month: string, deps: GenerateDeps):
  Promise<{ ok: true; report: SavedReport; usage: AiUsage } | { ok: false; code: AiErrorCode }>
```
순서(REQ-511):
1. `deps.loadMonths(month)` → `selected`·`prev`·`lastYear`를 `validateMonthPayload`로 검사. 고른 달 null → `{ ok: false, code: 'E-AI-NO-DATA' }`
2. `input = buildReportInput({ selected, prev, lastYear, groupNames })`, `inputHash = await reportFingerprint(input)`
3. `res = await deps.callClaude({ system: systemPrompt(), user: userMessage(input), schema: reportJsonSchema() })`
4. `res.ok === false`: `res.usage`가 있으면 사용량 기록(실패하면 `E-AI-FAILED`) 뒤 `res.code`. 없으면 기록 없이 `res.code`
5. `parsed = parseAiReport(res.text, input)`. null → 사용량 기록 → `E-AI-FAILED`(저장하지 않는다)
6. `report: SavedReport = { month, partial: input.partial, summary, cards, model: res.usage.model, inputHash, createdAt: deps.now().toISOString() }` — 모델은 답한 모델(`fallbacks`로 바뀌었을 수 있다)
7. `deps.saveReport(report)` → 사용량 기록(`{ ...res.usage, costMicroUsd: costMicroUsd(res.usage) }`) → 둘 중 하나라도 `false`면 `E-AI-FAILED`
8. `{ ok: true, report, usage: res.usage }`
- `deps`의 함수가 던지면 `E-AI-FAILED`로 바꾼다(오류 내용은 버린다). 다만 Claude를 부르기 전 단계에서 던졌으면 Claude를 부르지 않는다

### 2. 시험 (`src/app/api/ai/generate.test.ts`)
- 가짜 숫자는 `fixtures/fake-ai/`를 `node:fs`로 읽어 쓴다(`2026-10`을 고른 달로). deps는 모두 가짜이고, 부른 차례를 배열에 기록한다
- 가짜 `callClaude`의 답 글자는 입력에 있는 지표 ID(예: `total.newPatients`)로 숫자 없는 카드 3개 이상을 만든 JSON
- AC-511.1: `selected` null·검사 못 넘는 모양 → `E-AI-NO-DATA`, `callClaude`가 안 불림. 비교 달이 검사를 못 넘으면 Claude에 간 입력의 `hasPrev`(또는 `hasLastYear`)가 false
- AC-511.2: 차례가 `loadMonths → callClaude → saveReport → addUsage`. `saveReport`가 받은 리포트의 `inputHash`가 `reportFingerprint(input)`, `model`이 답한 모델, `createdAt`이 `now()`. 돌려준 리포트가 저장한 것과 같다
- AC-511.3: 검사 null이 될 답(숫자 쓴 요약) → `saveReport` 안 불림, `addUsage` 불림, `E-AI-FAILED`
- AC-511.4: `{ ok: false, code: 'E-AI-BUSY', usage: null }` → 저장·기록 없음, `E-AI-BUSY`. `{ ok: false, code: 'E-AI-FAILED', usage: {…} }`(refusal) → `addUsage`만 불림
- AC-511.5: `saveReport` false → `E-AI-FAILED`이고 `addUsage`는 불림. `addUsage` false → `E-AI-FAILED`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-511.5 저장이 실패하면 사용량은 기록하고 E-AI-FAILED', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-12 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/app/api/ai/generate.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-12 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). JSON 파일은 `JSON.parse`로 통째로 읽는다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
node -e "const l=require('fs').readFileSync('src/app/api/ai/generate.ts','utf8').split(/\r?\n/);process.exit(l[0].trim()===\"import 'server-only'\"?0:1)"
npx vitest run src/app/api/ai/generate.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-12 --expect green
npm run lint -- --max-warnings=0
npm run build
npm test   # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-511.1 ~ AC-511.6이 TASK-11·12의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (서버 코드는 `src/app/api/ai/`만, 경로 아닌 파일)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (검사한 집계만, 지어낸 숫자는 시험에만)
3. 결과에 따라 `phases/ai-report-4-flow/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `generateReport`·`GenerateDeps` 모양, 실패 규칙을 한 줄에 담는다

## 금지사항

- 고른 달이 검사를 못 넘을 때 Claude를 부르지 마라. 이유: 검사하지 않은 숫자를 Claude에 보내지 않는다(CLAUDE.md AI 경로 규칙, AC-511.1)
- 저장이나 사용량 기록이 실패했는데 리포트를 돌려주지 마라. 이유: 저장 없이 보여 준 리포트는 다시 볼 수 없고 비용 기록이 어긋난다(AC-511.5)
- Claude가 사용량을 준 경우에 사용량 기록을 빼먹지 마라. 이유: 비용을 놓치면 이번 달 사용량 표시가 실제보다 작다(design '사용량 기록')
- 이 파일에서 `@anthropic-ai/sdk`를 import하거나 `claude.ts`를 값으로 import하지 마라. 이유: 흐름은 deps로만 Claude와 닿는다. 시험·`ai:try`가 가짜·진짜를 넣는다
- 가짜 숫자를 `generate.ts` 안에 두거나 `fixtures/`를 앱 코드에서 읽지 마라. 이유: 앱 경로에는 지어낸 숫자가 없어야 한다(requirements 배경 1)
- 앞 step의 파일(`lib/ai/*`·`claude.ts`·`store.ts`)을 고치지 마라. 이유: 수정 범위 밖이다. 고칠 것이 보이면 summary에 적는다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
