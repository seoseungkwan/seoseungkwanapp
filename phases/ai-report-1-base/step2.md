# Step 2: input-types

> **TASK-5** 타입과 입력 묶음·지문 · **REQ-505** · AC-505.1 ~ AC-505.5
> Phase 1 `ai-report-1-base` · Step 2 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 이 phase는 차례로 돈다(Step 0 → 1 → 2). 이 step이 만드는 `src/types/aiReport.ts`를 뒤의 모든 step이 쓴다 — 이름·모양을 design.md 그대로 지킨다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-505에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-505.1**: 고른 달·지난달·작년 같은 달 `MonthPayload`(검사 통과)와 그룹 이름으로 `buildReportInput`을 부르면 입력에 고른 달, `partial`, 비교 달 두 개와 자료 여부(`hasPrev`·`hasLastYear`), 지표 목록(지표마다 ID·이름·세 달 값)이 있다. 자료 없는 달의 값은 null, 자료가 있는 달에 그 처방·그룹·동네가 없으면 0
- **AC-505.2**: 지표 목록은 전체 환자·신환·재진, 신환 7일·14일 재방문율, 처방 그룹마다 환자·신환·재진, 고른 달 환자 수 상위 30개 처방, 고른 달 환자 수 상위 20개 동네. 순서는 늘 같다(design.md '지표 목록')
- **AC-505.3**: 재방문 `within7`이 null(집계 중)이거나 `cohort`가 0이면 그 달 값은 null
- **AC-505.4**: 같은 자료로 두 번 만든 입력의 `reportFingerprint`는 같은 소문자 16진수 64자. 숫자 하나만 바꾸면 달라진다
- **AC-505.5**: 그룹 이름이 없는 그룹의 지표 이름은 "이름 없는 그룹"(자료 통째로 실패하지 않는다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙, 특히 "AI 경로는 … `validate.ts`로 검사한 집계만 보낸다")
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-004·007·008·023
- `/specs/ai-report/requirements.md` — REQ-505, 배경 3·4
- `/specs/ai-report/design.md` — '흐름', '타입', '지표 목록'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-5
- `/src/types/payload.ts` (`MonthPayload`·`RevisitPayload` — 입력의 재료), `/src/types/analysis.ts` (`Totals`)
- `/src/lib/payload/validate.ts` (`validateMonthPayload` — 시험용 자료가 이 검사를 통과해야 한다. 읽기만)
- `/src/lib/analytics/dates.ts` (`addMonths`·`isMonth` — 달 계산은 이 파일만. 읽기만)
- `/src/types/errors.ts` (`ErrorCode`)
- 이전 step에서 만든 파일:
  - `docs/ADR.md` ADR-023 (Step 0)
  - `src/types/errors.ts`의 `E-AI-BUSY`·`E-AI-LIMIT`·`E-AI-FAILED`·`E-AI-NO-DATA`, `src/lib/errors.ts` 문구 (Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/types/aiReport.ts`
  - `src/lib/ai/input.ts`
  - `src/lib/ai/input.test.ts`
- Tests:
  - `src/lib/ai/input.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **`src/lib/ai/`는 순수 함수만**: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈 import와 `fetch`를 쓰지 않는다. 지문은 `globalThis.crypto.subtle`로 만든다(브라우저·Node 둘 다 있다). TASK-14가 시험으로 막는다 (AC-513.3, design '흐름')
- **순서가 곧 지문**: 지표 순서와 객체 열쇠 순서를 늘 같게 만든다. 정렬은 글자 코드 비교(`a < b`)로 한다 — `localeCompare`는 실행 환경마다 다를 수 있어 쓰지 않는다
- **null과 0을 가른다**: 달 자체가 없으면 null, 자료가 있는 달에 그 처방·그룹·동네가 없으면 0 (design '지표 목록' 아래 정리)
- **환자 자료 구역은 읽기만**: `lib/payload`·`lib/analytics`는 import만 하고 고치지 않는다 (tasks.md 공통)
- **지어낸 숫자는 시험 파일 안에만**: 시험 자료는 시험 파일 안에서 손으로 만든다(`fixtures/fake-ai/`는 다음 phase가 만든다)

## 작업

### 1. 타입 (`src/types/aiReport.ts`)
design.md '타입'을 그대로 옮긴다:
```ts
export type MetricKind = 'count' | 'rate'
export type ReportMetric = {
  id: string
  label: string
  kind: MetricKind
  values: { selected: number | null; prev: number | null; lastYear: number | null }
}
export type ReportInput = {
  month: string; partial: boolean; prevMonth: string; lastYearMonth: string
  hasPrev: boolean; hasLastYear: boolean; metrics: ReportMetric[]
}
export type CardTag = 'up' | 'down' | 'watch' | 'guess'
export type AiCard = { tag: CardTag; text: string; metric: string }
export type AiReportRaw = { summary: string; cards: AiCard[] }
export type ReportCard = AiCard & { basis: string }
export type SavedReport = {
  month: string; partial: boolean; summary: string; cards: ReportCard[]
  model: string; inputHash: string; createdAt: string
}
export type AiUsage = { inputTokens: number; outputTokens: number; model: string }
export type AiErrorCode = 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'
```
- `ReportInput`의 열쇠 순서는 위 순서 그대로 만든다(지문이 `JSON.stringify` 순서를 본다)
- `AiErrorCode`가 `ErrorCode`(Step 1)의 일부인지 시험 파일에서 타입으로 확인한다(`expectTypeOf<AiErrorCode>()`로 `ErrorCode`에 들어감). 뒤 TASK가 `errorInfo(code)`를 바로 부를 수 있어야 한다

### 2. 입력 묶음 (`src/lib/ai/input.ts`)
```ts
export const UNNAMED_GROUP = '이름 없는 그룹'
export const TOP_RX = 30
export const TOP_REGIONS = 20
export type ValidReportMonths = {
  selected: MonthPayload            // validateMonthPayload를 통과한 것
  prev: MonthPayload | null         // 없거나 검사를 못 넘으면 null
  lastYear: MonthPayload | null
  groupNames: Record<string, string>
}
export function buildReportInput(months: ValidReportMonths): ReportInput
export async function reportFingerprint(input: ReportInput): Promise<string>
```
- `month = selected.month`, `partial = selected.partial`, `prevMonth = addMonths(month, -1)`, `lastYearMonth = addMonths(month, -12)`, `hasPrev = prev !== null`, `hasLastYear = lastYear !== null`
- 지표 순서(design.md '지표 목록' 표 그대로):
  1. `total.patients` '전체 환자' · 2. `total.newPatients` '신환' · 3. `total.returning` '재진' — count, `totals`의 같은 칸
  4. `revisit.within7` '신환 7일 재방문율' · 5. `revisit.within14` '신환 14일 재방문율' — rate, `withinN / cohort`. `withinN`이 null이거나 `cohort`가 0이면 null(AC-505.3)
  6. 처방 그룹: 세 달에 나온 그룹 id의 합집합을 id 순으로, 그룹마다 `group:<id>.patients`·`group:<id>.newPatients`·`group:<id>.returning`, 이름 `처방 그룹 '<이름>' 환자`·`… 신환`·`… 재진`. 이름은 `groupNames[id]`, 없으면 `UNNAMED_GROUP`(AC-505.5)
  7. 처방: 고른 달 `rx`를 `patients` 큰 순(같으면 코드 순)으로 상위 `TOP_RX`개, `rx:<code>`, 이름 `처방 '<고른 달 이름>' 환자`, 값은 `patients`
  8. 동네: 고른 달 `regions`를 `patients` 큰 순(같으면 이름 순)으로 상위 `TOP_REGIONS`개, `region:<이름>`, 이름 `동네 '<이름>' 환자`
- 비교 달 값: 달이 없으면 null. 달이 있는데 그 그룹·처방·동네가 없으면 0(AC-505.1)
- 지문: `JSON.stringify(input)`을 UTF-8로 바꿔(`TextEncoder`) `crypto.subtle.digest('SHA-256', …)` → 소문자 16진수 64자

### 3. 시험 (`src/lib/ai/input.test.ts`)
- 시험 안에서 작은 `MonthPayload` 세 개를 손으로 만들고, 먼저 `validateMonthPayload`를 통과하는지 확인한 뒤 쓴다(가짜 처방코드는 `FAKE-…`)
- AC-505.1: 입력의 달·`partial`·비교 달·`hasPrev`·`hasLastYear`, 지표마다 ID·이름·세 달 값. 지난달이 null이면 그 칸 null, 작년 같은 달에 없는 처방은 0
- AC-505.2: ID 목록이 표 순서 그대로. 처방 31개·동네 21개를 넣으면 30개·20개만, 같은 환자 수는 코드·이름 순
- AC-505.3: `within7` null, `cohort` 0 → null
- AC-505.4: 같은 자료 두 번 → 같은 지문(`/^[0-9a-f]{64}$/`), 숫자 하나 바꾸면 다른 지문
- AC-505.5: `groupNames`에 없는 그룹 → "이름 없는 그룹"

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-505.3 within7이 집계 중이면 7일 재방문율은 null', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/types/aiReport.ts`·`src/lib/ai/input.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/input.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint -- --max-warnings=0
npm run build
npm test   # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-505.1 ~ AC-505.5가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/lib/ai/`는 순수 함수, 타입은 `src/types/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/ai-report-1-base/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 내보낸 이름(`ValidReportMonths`·`buildReportInput`·`reportFingerprint`·상수), 지표 ID 모양을 한 줄에 담는다

## 금지사항

- `src/lib/ai/input.ts`에서 `node:crypto`·`fetch`·supabase·next·react를 쓰지 마라. 이유: `lib/ai`는 순수 함수만이고 브라우저 화면도 같은 지문 함수를 쓴다(AC-513.3)
- 설계와 다른 타입 이름·칸 이름을 만들지 마라. 이유: 뒤의 모든 step이 design.md '타입' 이름 그대로 쓴다. 칸이 더 필요해 보이면 summary에 적는다
- 비교 달에 없는 지표를 null로 두거나, 없는 달을 0으로 채우지 마라. 이유: AI가 "그 달에 없었음"과 "자료 없음"을 헷갈린다(design '지표 목록')
- 지시문 판(`PROMPT_VERSION`)·모델 이름을 입력에 넣지 마라. 이유: 지문은 숫자만 본다 — 지시문을 고쳐도 '숫자가 바뀌었어요'가 뜨지 않게(design '지시문')
- `src/lib/payload`·`src/lib/analytics`·`src/lib/parsers`를 고치지 마라(import해서 쓰기만). 이유: 환자 자료 구역이고 수정 범위 밖이다 (tasks.md 공통)
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 지어낸 숫자를 시험 파일 밖에 두지 마라. 이유: 앱 경로에는 지어낸 숫자가 없어야 한다(requirements 배경 1)
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
