# Step 0: fake-months

> **TASK-3** 가짜 숫자 (세 달 + 그룹 이름) · **REQ-503** · AC-503.1 ~ AC-503.3
> Phase 2 `ai-report-2-parts` · Step 0 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`를 같이 쓴다)가 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-503에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-503.1**: `fixtures/fake-ai/months/2025-10.json`·`2026-09.json`·`2026-10.json`을 `validateMonthPayload`에 넣으면 셋 다 null이 아니고 `month`가 파일 이름과 같다
- **AC-503.2**: `fixtures/fake-ai/groups.json`에 세 달의 모든 `groups[].id`의 이름(1~30자)이 있다
- **AC-503.3**: 2026-10의 신환이 2026-09보다 많고, 처방 그룹 하나는 줄었고, `2026-10`은 `partial: false`다(늘었어요·줄었어요가 둘 다 나올 거리)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: 실제 환자 파일은 커밋하지 않는다, 가짜만)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — ADR-007·023
- `/specs/ai-report/requirements.md` — REQ-503, 배경 1(가짜 숫자는 `fixtures/fake-ai/`·시험·`ai:try`에만)
- `/specs/ai-report/design.md` — '지표 목록'(가짜 숫자가 채울 칸), '근거 줄'(예: 신환 486·524·470)
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-3(정형외과다운 모양 메모)
- `/src/types/payload.ts` (`MonthPayload`)
- `/src/lib/payload/validate.ts` (`validateMonthPayload` — 이 검사가 기준. 읽기만)
- `/fixtures/make-fake-fixtures.ts`·`/fixtures/make-fake-fixtures.test.ts` (가짜 자료 말투·시험 모양)
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts`, `src/lib/ai/input.ts` (Phase 1 Step 2 — 가짜 숫자가 이 입력으로 들어간다. 이 step은 고치지 않는다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `fixtures/fake-ai/months/2025-10.json`
  - `fixtures/fake-ai/months/2026-09.json`
  - `fixtures/fake-ai/months/2026-10.json`
  - `fixtures/fake-ai/groups.json`
  - `fixtures/fake-ai/fakeAi.test.ts`
- Tests:
  - `fixtures/fake-ai/fakeAi.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **가짜만**: 처방코드는 지어낸 글자(`FAKE-001` …)로, 실제 비트·EDI 코드처럼 보이지 않게. 사람 이름·전화·주민번호·메일 모양 글자를 넣지 않는다(검사가 거부하고, 넣어서도 안 된다) (CLAUDE.md, tasks.md TASK-3)
- **검사 규칙을 그대로 맞춘다** (`validate.ts`): 열쇠는 정해진 것만, `schemaVersion: 2`, `quality: 'valid'`, `totals.patients = newPatients + returning + unknown`, 처방·그룹은 `newPatients + returning ≤ patients`이고 `followup` 네 칸 합 = `patients`, 그룹 id는 `/^[A-Za-z0-9-]{1,64}$/`, 재방문은 `within7 ≤ within14 ≤ cohort ≤ 신환`(`within7`이 null이면 `within14`도 null), 동네는 5명 이상만. 처방은 코드 순, 그룹은 id 순, 동네는 이름 순으로 적는다(`types/payload.ts` 주석)
- **지어낸 숫자는 이 폴더와 시험에만**: 이 파일들을 앱 코드(`src/`)가 import하지 않는다(뒤에서 `generate.test.ts`·`scripts/`만 읽는다)

## 작업

### 1. 가짜 숫자 세 달 (`fixtures/fake-ai/months/*.json`)
- 손으로 쓴다(만드는 스크립트는 수정 범위 밖이다). 정형외과다운 모양:
  - 그룹 다섯: 도수치료·체외충격파·물리치료·주사·약물. id 예 `fake-manual`·`fake-eswt`·`fake-pt`·`fake-inj`·`fake-med`
  - 처방 40개쯤(`FAKE-001` …, 이름은 '도수치료 30분'·'체외충격파'·'간섭파'·'핫팩'처럼 흔한 말), 동네 25개쯤(지어낸 동 이름)
- 세 달: `2025-10`(작년 같은 달), `2026-09`(지난달), `2026-10`(고른 달, `partial: false`)
- 근거 줄 예(design '근거 줄')와 맞추면 `ai:try` 결과를 읽기 쉽다: 신환 2026-09 486 → 2026-10 524 · 2025-10 470
- 2026-10에서 그룹 하나는 2026-09보다 환자 수가 줄게 한다. 처방 몇 개는 한 달에만 있게 해 0이 나오는 칸도 만든다
- `2026-10`의 `within14`를 null(집계 중)로 두어도 된다(검사 규칙 안). 그러면 `ai:try`에서 '집계 중' 근거 줄을 볼 수 있다

### 2. 그룹 이름 (`fixtures/fake-ai/groups.json`)
- 모양은 `{ "<그룹 id>": "<이름>" }` — `ReportMonths.groupNames`(design '저장')·`ValidReportMonths.groupNames`(Phase 1 Step 2)와 같은 `Record<string, string>`
- 이름은 1~30자

### 3. 시험 (`fixtures/fake-ai/fakeAi.test.ts`)
- `node:fs`로 읽고 `JSON.parse`. 시험 파일은 `node:` 모듈을 써도 된다(환자 자료 구역·`lib/ai` 밖)
- AC-503.1: 세 파일 모두 `validateMonthPayload(…) !== null`, `month`가 파일 이름(`2026-10.json` → `'2026-10'`)
- AC-503.2: 세 달의 모든 `groups[].id`가 `groups.json`에 있고 이름 길이 1~30
- AC-503.3: 2026-10 신환 > 2026-09 신환, 두 달에 다 있는 그룹 중 하나 이상은 2026-10 환자 수가 더 적다, 2026-10 `partial === false`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-503.1 세 달 가짜 숫자는 validateMonthPayload를 통과하고 month가 파일 이름과 같다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다(파일이 아직 없다). RED 기록 전에는 가짜 숫자 JSON을 만들 수 없다(구현 파일로 본다, 훅이 막는다). 시험 파일은 RED 전에도 고칠 수 있다
3. JSON을 쓰고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). `JSON.parse`는 CRLF를 그대로 읽는다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run fixtures/fake-ai/fakeAi.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-503.1 ~ AC-503.3이 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (가짜 자료는 `fixtures/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (실제 자료·개인정보 모양 글자 없음)
3. 결과에 따라 `phases/ai-report-2-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 그룹 id 목록, 줄어든 그룹, 신환 세 달 값을 한 줄에 담는다

## 금지사항

- 실제 비트 코드·실제 동네 통계·사람 이름·전화 모양 글자를 쓰지 마라. 이유: 실제 환자 자료는 커밋하지 않는다(CLAUDE.md). 가짜 처방코드는 `FAKE-…`로
- 가짜 숫자를 `fixtures/fake-ai/` 밖(특히 `src/`)에 복사하지 마라. 이유: 앱 경로에는 지어낸 숫자가 없어야 한다(requirements 배경 1)
- `validate.ts`를 고쳐 가짜 숫자를 통과시키지 마라. 이유: 검사가 기준이고, 환자 자료 구역이라 수정 범위 밖이다
- `fixtures/make-fake-fixtures.ts`·`fixtures/fake-bit/`를 고치지 마라. 이유: 다른 시험이 쓰는 가짜 비트 파일이다. 수정 범위 밖이다
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
