# Step 2: revisit-30

> **TASK-29** 신환 30일 재방문 · 처방별 신환·재진 · **REQ-029** · AC-029.1 ~ AC-029.4
> Phase 6 `precheck-6-stats` · Step 2 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-29 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-029에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-029.1**: `ConsumptionRow`로 `revisit30`이 신환 중 30일 안에 다른 날 다시 온 수·비율을 지금 7·14일과 같은 규칙(신환일과 다른 날, 첫 신환일만, 30일을 다 못 덮으면 '집계 중')으로
- **AC-029.2**: 신환의 첫 재방문까지 날수를 원본 `CohortContracts`의 칸(7일 안·8~14일·15~30일·30일 넘음)으로 나눠 센다. 원본 `CohortTests.cs`의 사례·기대값을 옮겨 통과
- **AC-029.3**: 처방 코드 목록과 기간으로 `rxVisitSplit`이 원본 `RxVisitSplit`·`rx_visit_split.py`의 `summarize`·`summarize_days`처럼 처방별 진료·환자·신환 수(골든: Python 원본)
- **AC-029.4**: `rxVisitSplit` 결과로 `formatRxVisitSplit`·`headline`이 원본 Python과 같은 글(골든)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-029
- `/specs/precheck/design.md` — 2절 표(30일 재방문·첫 재방문 날수·처방별 신환·재진 원본), 10절(골든: Python은 `python3 -I`, C#만 있는 것은 원본 시험 사례)
- `/specs/precheck/tasks.md` — TASK-29 (수정 범위·메모)
- `/src/lib/analytics/compare.ts` (지금 7·14일 재방문: `revisitView`·'집계 중' 규칙)
- `/src/lib/analytics/aggregate.ts`, `/src/lib/analytics/coverage.ts`, `/src/types/analysis.ts`, `/src/types/consumption.ts`
- 이전 step에서 만든 파일:
  - `src/workers/precheck/statsRows.ts`(`toConsumptionRows`) (Step 0)
  - `src/lib/analytics/rxTrend.ts` (Step 1)
  - `scripts/precheck/golden/*` (앞 Phase: 골든 만들기 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/CohortContracts.cs`·`CohortDataSource.cs`·`CohortTests.cs`
  - `vendor/drbit_export/RxVisitSplit.cs` (`MaximumDays = 365`)
  - `medicore/rx_visit_split.py` (`summarize`·`summarize_days`·`format_text`·`headline`)
  - `tests/test_rx_visit_split.py`, `tests/test_rx_visit_split_sql.py`

## 수정 범위 (tasks.md TASK-29)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/analytics/revisit30.ts`
  - `src/lib/analytics/revisit30.test.ts`
  - `src/lib/analytics/rxVisitSplit.ts`
  - `src/lib/analytics/rxVisitSplit.test.ts`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/rx-visit-split-*.json`
  - `src/types/analysis.ts`
- Tests:
  - `src/lib/analytics/revisit30.test.ts`
  - `src/lib/analytics/rxVisitSplit.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 30일 재방문 (`src/lib/analytics/revisit30.ts`)
```ts
export function revisit30(rows: ConsumptionRow[], range: DateRange, coverage: DateRange[], today: string): { cohort: number; within30: number | null /* null = 집계 중 */; rate: number | null }
export function firstRevisitBuckets(rows: ConsumptionRow[], range: DateRange): { within7: number; d8to14: number; d15to30: number; over30: number }
```
- 규칙은 지금 7·14일(`compare.ts`)과 같다: 신환일과 다른 날, 첫 신환일만, '칸 첫날 ~ 칸 끝날 + 30일'을 다 덮고 지났을 때만 숫자. 비율은 소수 둘째 자리까지(CLAUDE.md %)
- 첫 재방문 날수 칸은 원본 `CohortContracts` 그대로. 원본 `CohortTests.cs` 사례·기대값을 시험으로 옮긴다(AC-029.2)

### 2. 처방별 신환·재진 (`src/lib/analytics/rxVisitSplit.ts`)
```ts
export function rxVisitSplit(rows: ConsumptionRow[], codes: string[], range: DateRange): RxVisitSplit      // summarize
export function rxVisitSplitDays(rows: ConsumptionRow[], codes: string[], range: DateRange): RxVisitSplitDay[]   // summarize_days
export function formatRxVisitSplit(r: RxVisitSplit): string   // format_text
export function headline(r: RxVisitSplit): string
```
- 골든: `scripts/precheck/golden/rx_visit_split.py`(작은 실행 글)가 `medicore/rx_visit_split.py`를 `python3 -I`로 가짜 줄에 돌려 `fixtures/precheck/golden/rx-visit-split-*.json`에(AC-029.3·029.4). 머리 `{source, file, entry, knownDiffs}`
- 가짜 줄은 이 step 시험 안이나 골든 스크립트 입력 파일로 둔다(차트번호 `9`로 시작, 이름 없음)

### 3. 시험
- `revisit30.test.ts`(AC-029.1·029.2), `rxVisitSplit.test.ts`(AC-029.3·029.4 골든 비교)
- `src/types/analysis.ts`에 모양을 더한다(지금 모양은 고치지 않는다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-29 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-29 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/analytics/revisit30.test.ts src/lib/analytics/rxVisitSplit.test.ts
npx vitest run src/lib/analytics/compare.test.ts src/lib/analytics/rxTrend.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-29 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-029.1 ~ AC-029.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-6-stats/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 지금 7·14일 재방문 계산(`compare.ts`)을 고치지 마라. 이유: 수정 범위 밖이고, 30일은 같은 규칙을 따로 쓴다(AC-029.1)
- 다 덮지 못한 기간의 30일 재방문을 숫자로 보이지 마라. 이유: '집계 중'이어야 한다. 덜 모인 숫자는 낮게 보여 잘못 읽힌다
- 원본 Python 글(문장·띄어쓰기·숫자 모양)을 다듬지 마라. 이유: 골든과 같아야 한다(AC-029.4)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계·추세 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
