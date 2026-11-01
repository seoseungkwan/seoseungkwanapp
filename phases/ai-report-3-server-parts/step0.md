# Step 0: output-check

> **TASK-7** AI 답 검사 · **REQ-507** · AC-507.1 ~ AC-507.5
> Phase 3 `ai-report-3-server-parts` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~2는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 Step 1의 `npm install`(`node_modules/`)과 `npm run build`(`.next/`)가 다른 step의 시험·빌드와 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, Step 1의 `npm install`이 끝난 뒤에 시험을 돌리고 `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-507에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-507.1**: 요약(1~200자)과 카드 3~8개(꼬리표 `up`·`down`·`watch`·`guess`, 문장 1~120자, 입력에 있는 지표 ID)면 `parseAiReport`가 카드마다 근거 줄을 붙인 리포트를 돌려준다
- **AC-507.2**: 입력에 없는 지표 ID를 쓴 카드는 빠진다
- **AC-507.3**: 문장에 숫자가 있는 카드는, 허용 낱말("7일"·"14일"·"N월"·"YYYY년")을 빼고도 숫자가 남으면 빠진다
- **AC-507.4**: 요약에 허용 낱말 밖 숫자가 있거나, 남은 카드가 3개 미만이거나, JSON 모양이 다르면(빠진 칸·남는 칸·글자 길이 초과) null
- **AC-507.5**: 같은 지표 ID를 쓴 카드가 여럿이면 모두 남는다. 카드는 8개를 넘지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (AI 답은 글자로만 그린다)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-007·023
- `/specs/ai-report/requirements.md` — REQ-507, 배경 7·8
- `/specs/ai-report/design.md` — 'AI 답 검사'(1~6 단계), '결정과 트레이드오프'의 '근거 숫자는 앱이 채운다'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-7
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`AiCard`·`AiReportRaw`·`ReportCard`·`CardTag`·`ReportInput`, Phase 1 Step 2)
  - `src/lib/ai/input.ts` (`buildReportInput` — 시험 입력 만들기, 지표 ID 모양, Phase 1 Step 2)
  - `src/lib/ai/basis.ts` (`basisLine(metric, input)` — 남은 카드에 붙인다, Phase 2 Step 2)
  - `src/lib/ai/prompt.ts` (`reportJsonSchema()` — 같은 모양을 Claude에 준다, Phase 2 Step 3)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/ai/output.ts`
  - `src/lib/ai/output.test.ts`
- Tests:
  - `src/lib/ai/output.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **AI 답은 믿지 않는다**: 모양이 조금이라도 다르면 고쳐 쓰지 않고 null이다. 숫자 규칙을 어긴 카드는 고쳐 쓰지 않고 버린다 (design '결정과 트레이드오프')
- **근거 숫자는 앱이**: 카드의 `basis`는 `basisLine`으로만 만든다. AI가 준 글자에서 숫자를 꺼내 쓰지 않는다 (requirements 배경 8)
- **남는 칸 금지**: 최상위는 정확히 `{ summary, cards }`, 카드는 정확히 `{ tag, text, metric }`. 돌려주는 객체는 정해진 칸만 골라 새로 만든다(받은 객체를 그대로 넘기지 않는다 — `validate.ts`와 같은 원칙)
- **`src/lib/ai/`는 순수 함수만**: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`를 쓰지 않는다 (AC-513.3)

## 작업

### 1. 코드 (`src/lib/ai/output.ts`)
```ts
export const SUMMARY_MAX = 200
export const CARD_TEXT_MAX = 120
export const MIN_CARDS = 3
export const MAX_CARDS = 8
export function hasForbiddenNumber(text: string): boolean
export function parseAiReport(text: string, input: ReportInput): { summary: string; cards: ReportCard[] } | null
```
design.md 'AI 답 검사' 순서 그대로:
1. `JSON.parse` 실패 → null. 모양은 정확히 `{ summary, cards }`(`cards`는 배열), 카드는 정확히 `{ tag, text, metric }`(모두 글자). 남는 칸·빠진 칸 → null
2. `summary` 1~200자, 카드 문장 1~120자(앞뒤 빈칸 뺀 길이), 꼬리표 4종. 어기면 null. 돌려주는 글자는 앞뒤 빈칸을 뺀 것
3. 카드 거르기: 지표 ID가 `input.metrics`에 없거나 숫자 규칙을 어기면 그 카드를 뺀다
4. 숫자 규칙(`hasForbiddenNumber`): 글자에서 `/\d{4}년/g`, `/\d{1,2}월/g`, `14일`, `7일`을 지운 뒤 `/\d/`가 남으면 어김
5. 요약이 숫자 규칙을 어기거나 남은 카드가 3개 미만 → null. 8개 넘으면 앞 8개만
6. 남은 카드에 `basis: basisLine(metric, input)`을 붙인다
- 같은 지표 ID를 쓴 카드는 모두 남긴다(AC-507.5)

### 2. 시험 (`src/lib/ai/output.test.ts`)
- 입력은 `buildReportInput`으로 작게 만든다(시험 안의 손으로 만든 `MonthPayload`)
- AC-507.1: 정상 답 → 요약·카드, 카드마다 `basis`가 `basisLine` 결과와 같다
- AC-507.2: 없는 지표 ID 카드 하나 → 그 카드만 빠짐
- AC-507.3: "신환이 524명으로" → 빠짐. "10월 신환이 크게 늘었습니다"·"7일 재방문율이 조금 줄었습니다"·"2025년 10월보다" → 남음. "17일" → 빠짐
- AC-507.4: 요약에 숫자 → null. 남은 카드 2개 → null. 빠진 칸·남는 칸·꼬리표 밖 값·201자 요약·121자 문장·JSON 아님 → null
- AC-507.5: 같은 지표 카드 셋 → 셋 다 남음. 카드 10개 → 앞 8개

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-507.3 허용 낱말을 빼고도 숫자가 남는 카드는 빠진다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/lib/ai/output.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/output.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-507.1 ~ AC-507.5가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/lib/ai/`는 순수 함수)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (AI 답은 글자로만, HTML 없음)
3. 결과에 따라 `phases/ai-report-3-server-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `parseAiReport` 모양, 숫자 규칙을 한 줄에 담는다

## 금지사항

- 숫자 규칙을 어긴 카드의 숫자를 지우거나 고쳐 쓰지 마라. 이유: 고친 문장은 AI가 쓴 뜻과 달라질 수 있다. 버린다(design '결정과 트레이드오프')
- AI 답의 남는 칸을 결과에 실어 보내지 마라. 이유: 화면·DB에 정해진 모양만 들어가야 한다(32KB 한도, 글자로만 그리기)
- 근거 줄을 AI 글자로 채우거나 `basisLine` 밖에서 만들지 마라. 이유: 근거 숫자는 앱이 진짜 값으로만 만든다
- `basis.ts`·`prompt.ts`·`input.ts`를 고치지 마라. 이유: 앞 step의 결과이고 수정 범위 밖이다. 고칠 것이 보이면 summary에 적는다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
