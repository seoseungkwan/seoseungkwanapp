# Step 2: basis-line

> **TASK-6** 근거 줄 · **REQ-506** · AC-506.1 ~ AC-506.4
> Phase 2 `ai-report-2-parts` · Step 2 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`를 같이 쓴다)가 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-506에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-506.1**: 숫자 지표 신환, 세 달 값(지난달 486·고른 달 524·작년 같은 달 470), 고른 달 2026-10 → `"근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명"`
- **AC-506.2**: 비교 달 값이 null이면 그 자리가 "9월 자료 없음" 또는 "작년 10월 자료 없음". 고른 달이 1월이면 지난달은 "작년 12월"
- **AC-506.3**: 비율 지표(재방문율)는 `formatRate`처럼 %로 소수 첫째 자리까지 버린 글자(반올림 안 함). 그 달 자료가 있는데 값이 null이면 "집계 중"
- **AC-506.4**: 천 이상 숫자는 세 자리마다 쉼표(`formatCount`)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (금액·숫자는 반올림하지 않는다)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-008·023
- `/specs/ai-report/requirements.md` — REQ-506, 배경 8(근거 숫자는 앱이 채운다)
- `/specs/ai-report/design.md` — '근거 줄', '타입'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-6
- `/src/components/charts/format.ts` (`formatCount`·`formatRate` — import만 한다. 이 파일은 고치지 않는다)
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`ReportMetric`·`ReportInput`·`MetricKind`, Phase 1 Step 2)
  - `src/lib/ai/input.ts` (`buildReportInput` — 지표 ID·이름 모양, 비교 달 null/0 규칙, Phase 1 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/ai/basis.ts`
  - `src/lib/ai/basis.test.ts`
- Tests:
  - `src/lib/ai/basis.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **숫자 표시는 통계 화면과 같은 함수**: `formatCount`·`formatRate`(`@/components/charts/format`)를 그대로 쓴다. 따로 반올림·`toFixed`를 하지 않는다 (ADR-008, design '근거 줄')
- **`src/lib/ai/`는 순수 함수만**: supabase·next·react·`@anthropic-ai/sdk`·`node:` 모듈과 `fetch`를 쓰지 않는다. `format.ts`는 타입만 import하는 순수 파일이라 써도 된다 (AC-513.3)
- **달 글자는 숫자로 계산**: '10월'은 `'2026-10'`에서 `Number(달)`로 만든다. 지난달은 `input.prevMonth`, 작년 같은 달은 `input.lastYearMonth`를 쓴다(달 계산을 다시 하지 않는다 — `addMonths`는 이미 `buildReportInput`이 했다)

## 작업

### 1. 코드 (`src/lib/ai/basis.ts`)
```ts
export function basisLine(metric: ReportMetric, input: ReportInput): string
```
- 모양: `근거 · <이름> <지난달> <값> → <고른 달> <값> · <작년 같은 달> <값>`
- 달 글자: 고른 달 `10월`. 지난달은 고른 달과 같은 해면 `9월`, 해가 다르면 `작년 12월`. 작년 같은 달은 `작년 10월`
- 값:
  - count → `formatCount(n)` + `명`
  - rate → `formatRate(r)` + `%`
  - null: count → `자료 없음`. rate → 그 달 자료가 있으면 `집계 중`, 없으면 `자료 없음`. 자료 여부는 고른 달은 늘 있음, 지난달은 `input.hasPrev`, 작년 같은 달은 `input.hasLastYear`
- 예(design): `근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명`, `근거 · 신환 7일 재방문율 9월 41.2% → 10월 집계 중 · 작년 10월 자료 없음`

### 2. 시험 (`src/lib/ai/basis.test.ts`)
- `ReportInput`·`ReportMetric`을 시험 안에서 손으로 만든다(작은 입력이면 충분하다)
- AC-506.1: 위 신환 예 글자와 정확히 같다
- AC-506.2: 지난달 null → `9월 자료 없음`, 작년 null → `작년 10월 자료 없음`. 고른 달 `2026-01` → 지난달 글자 `작년 12월`
- AC-506.3: 0.41234 → `41.2%`(버림), 0.29 → `29.0%`(부동소수 오차에도), 그 달 자료가 있고 null → `집계 중`, 자료 없는 달 → `자료 없음`
- AC-506.4: 12345 → `12,345명`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-506.1 신환 근거 줄은 "근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명"', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일(`src/lib/ai/basis.ts`)을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다)
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run src/lib/ai/basis.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-506.1 ~ AC-506.4가 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/lib/ai/`는 순수 함수)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (반올림 없음)
3. 결과에 따라 `phases/ai-report-2-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, `basisLine` 모양, 다음 step(답 검사)이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `src/components/charts/format.ts`를 고치지 마라(import만). 이유: 통계 화면이 같은 함수를 쓴다. 수정 범위 밖이다(tasks.md TASK-6)
- 숫자를 반올림하거나 `toFixed`로 자르지 마라. 이유: 보이는 숫자는 버린다(ADR-008). 통계 화면과 같은 글자가 나와야 한다
- 근거 줄에 AI가 쓴 글자를 넣지 마라. 이유: 근거 줄은 앱이 진짜 값으로만 만든다(requirements 배경 8)
- 달 계산을 이 파일에서 다시 하지 마라. 이유: 날짜 계산은 `lib/analytics/dates.ts` 한 곳이고, 비교 달은 이미 입력에 있다(CLAUDE.md)
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `eslint-disable`로 규칙을 피하지 마라. 이유: 린트 경고 0이 끝 조건이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
