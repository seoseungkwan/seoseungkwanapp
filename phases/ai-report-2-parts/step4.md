# Step 4: cost-calc

> **TASK-9** 비용 계산 · **REQ-509** · AC-509.1 ~ AC-509.2
> Phase 2 `ai-report-2-parts` · Step 4 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`를 같이 쓴다)가 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-509에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-509.1**: `claude-opus-5-5`와 입력 10,000·출력 4,000 토큰 → `costMicroUsd`는 120,000(= $0.12, 백만분의 1달러 정수)
- **AC-509.2**: 가격표에 없는 모델 이름(예: 대신 답한 모델)은 가격표에서 가장 비싼 값으로 센다(적게 세지 않게)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (금액은 정수, 반올림하지 않는다)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-007·008·023
- `/plan.md` §2-3 (비용: 콘솔 월 한도, 이번 달 사용량 표시)
- `/specs/ai-report/requirements.md` — REQ-509, 배경 10
- `/specs/ai-report/design.md` — '비용', '결정과 트레이드오프'의 'fallbacks: "default"'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-9
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`AiUsage` — `{ inputTokens, outputTokens, model }`, Phase 1 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/ai/cost.ts`
  - `src/lib/ai/cost.test.ts`
- Tests:
  - `src/lib/ai/cost.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **정수만**: 단가는 토큰 하나에 백만분의 1달러(micro USD) 정수다. 곱과 합만 하고 나누지 않는다(소수·반올림이 생기지 않게) (CLAUDE.md 금액 규칙, design '비용')
- **적게 세지 않는다**: 모르는 모델 이름은 가격표의 가장 비싼 값으로 센다. 대신 답한 모델(`fallbacks`)이 표에 없을 수 있다
- **원화 바꾸기 없음**: 환율을 코드에 박지 않는다. 원화 표시는 화면 명세가 한다
- **`src/lib/ai/`는 순수 함수만**: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`를 쓰지 않는다 (AC-513.3)

## 작업

### 1. 코드 (`src/lib/ai/cost.ts`)
```ts
export type Price = { input: number; output: number }   // 백만분의 1달러 / 토큰
export const PRICES: Readonly<Record<string, Price>>
export function costMicroUsd(u: Pick<AiUsage, 'model' | 'inputTokens' | 'outputTokens'>): number
```
- 가격표(design '비용', claude-api skill 2026-10 표):
  - `claude-opus-5-5`: 입력 4 · 출력 20
  - `claude-opus-5`: 입력 5 · 출력 25
  - `claude-opus-4-8`: 입력 5 · 출력 25
- `costMicroUsd` = `inputTokens × input + outputTokens × output`
- 모르는 모델: 입력·출력 단가를 각각 표에서 가장 큰 값으로 쓴다(지금 표로는 5·25)
- 표에 있는 이름인지는 `Object.hasOwn(PRICES, model)`로 본다(`'constructor'` 같은 이름이 원형에서 찾히지 않게)

### 2. 시험 (`src/lib/ai/cost.test.ts`)
- AC-509.1: `{ model: 'claude-opus-5-5', inputTokens: 10_000, outputTokens: 4_000 }` → `120_000`. 결과가 정수(`Number.isSafeInteger`)
- AC-509.2: `'claude-unknown-x'`·`'constructor'` → 표의 가장 큰 단가로 센 값(10,000·4,000이면 150,000), `claude-opus-5-5`보다 적지 않다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-509.1 opus-5-5 입력 10,000·출력 4,000이면 120,000 micro USD', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-9 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/lib/ai/cost.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-9 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/cost.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-509.1 ~ AC-509.2가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/lib/ai/`는 순수 함수)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (정수, 반올림 없음)
3. 결과에 따라 `phases/ai-report-2-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `costMicroUsd` 모양, 가격표 내용을 한 줄에 담는다

## 금지사항

- 달러를 소수로 계산하거나 반올림하지 마라. 이유: 비용은 백만분의 1달러 정수로 DB(`cost_micro_usd bigint`)에 들어간다. 소수 오차가 쌓이면 안 된다
- 환율·원화 값을 코드에 넣지 마라. 이유: 원화 바꾸기는 화면 명세가 한다(design '비용')
- 모르는 모델을 0원이나 가장 싼 값으로 세지 마라. 이유: 비용을 적게 세면 사용량 표시가 실제 청구보다 작아진다(AC-509.2)
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
