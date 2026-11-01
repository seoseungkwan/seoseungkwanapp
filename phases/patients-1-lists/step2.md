# Step 2: recall-logic

> **TASK-3** 정기 주사 명단 계산 (골든) · **REQ-603** · AC-603.1 ~ AC-603.5
> Phase 1 `patients-1-lists`(명단 계산 (웹, 골든)) · Step 2 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-603에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-603.1**: `RECALL_DEFAULTS`(연골주사 A49 3차 뒤 6개월, 비타민D A32 3개월)·`roundTest`(3차 ≠ 13차·23차)·`addMonthsToDay`(말일 맞춤, dates.ts) 원본과 같다(골든)
- **AC-603.2**: `ingestRecall(history, piece, codes, today)`: 코드가 처방된 내원만 쌓기, 그 기간 예전 기록 바꾸기, 36개월 지난 것 지우기, 50,000건 넘으면 최근 것만, `from` 갱신(골든)
- **AC-603.3**: `recallCompute`·`recallSelect(from, to, overdue)`·`recallStatus`: 마지막 주사만, 조건 맞을 때만 예정일, "지남 N일"·"오늘"·"N일 남음"(골든)
- **AC-603.4**: `recallCoverage(history, rules, today)`: 원본 `coverageNote`와 같은 판정(건수·시작 날짜·짧은 규칙)(골든은 판정만)
- **AC-603.5**: `recallCopyLines`(이름·전화·이름·종류)·`recallPhones`(숫자만·같은 번호 한 번·번호 없는 수) 원본과 같다(골든)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-603
- `/specs/patients/design.md` — '`contact` 안쪽 모양'(`recall`·`RecallRecord`·`readThrough`), '계산 모양'
- `/specs/patients/tasks.md` — TASK-3
- `/src/lib/analytics/dates.ts`·`dates.test.ts`
- 이전 step에서 만든 파일: `src/lib/patients/followup.ts`(`prepareSchedule`·`preparePhones`·`dateKey`·`phoneOf`), `src/types/patients.ts`, `scripts/patients/golden/revisit.mjs`(원본 꺼내기 방식), `fixtures/patients/make-fake-patients.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(precheck에서 GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`)의 자료는 모두 가짜다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `tools/revisit_source_boot.js`(같은 코드가 `assets/revisit_schedule.html` 1791줄 근처에도 있다): `DEFAULTS`·`KEEP_MONTHS`·`MAX_RECORDS`·`validateRules`·`validRecord`·`validateHistory`·`roundTest`·`addMonths`·`ingest`·`compute`·`select`·`status`·`coverageNote`·[명단 복사](`nmRecallCopy`)·[번호 복사](`nmRecallPhones`, `firstPhone`), `window.NEW_MEDICORE_RECALL`로 드러난 함수
  - `assets/revisit_schedule.html`의 `prepareRx`(1693)·`firstPhone`
  - `tests/test_revisit_source.py`(`test_recall_rules_compute_and_select`·`test_history_ingest_replaces_period_and_keeps_phone`·`test_rx_index_and_recall_sheet`)

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/patients/recall.ts`
  - `src/lib/patients/recall.test.ts`
  - `src/lib/patients/goldenRecall.test.ts`
  - `src/lib/analytics/dates.ts`
  - `src/lib/analytics/dates.test.ts`
  - `src/types/patients.ts`
  - `scripts/patients/golden/*`
  - `fixtures/patients/golden/recall-*.json`
  - `fixtures/patients/fake/*`
  - `fixtures/patients/make-fake-patients.ts`
  - `fixtures/patients/make-fake-patients.test.ts`
- Tests:
  - `src/lib/patients/recall.test.ts`
  - `src/lib/patients/goldenRecall.test.ts`
  - `src/lib/analytics/dates.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/patients`·`src/lib/analytics`·`src/workers`(그리고 `lib/parsers`·`lib/payload`·`lib/precheck`·`lib/bridge`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020, REQ-601)
- **골든 시험**: 같은 가짜 자료를 원본(`2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/patients/golden/`의 스크립트로 한 번 만들어 `fixtures/patients/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_revisit_import_html.py`가 `<script>`를 꺼내 `vm.runInContext`로 돌리는 방식과 같게) 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요). 원본의 `Date` 값은 골든 파일에 `YYYY-MM-DD` 글자로 적는다
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(`revisit_schedule.html`·`message_templates.html` 등)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드와 골든 결과뿐이다
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. `dates.ts`에 하나 더하기
```ts
export function addMonthsToDay(ymd: string, n: number): string   // 원본 addMonths: 그 달 1일에 n달을 더하고 날은 min(원래 날, 그 달 말일). 1/31 + 1 → 2/28(윤년 2/29), n은 음수도
```
- 기존 함수는 바꾸지 않는다. `dates.test.ts`에 사례를 더한다(말일·윤년·연말 넘김·음수)

### 2. 가짜 자료 더하기 (`make-fake-patients.ts`)
- `recall-cases.json`: 연골 A49 1·2·3차, 3차 뒤 다시 1차 시작(명단에서 빠짐), 13차·23차(3차 아님), 비타민D A32 여러 번, 두 코드 같은 날, 1/31 주사(+6개월 말일), 36개월 넘은 기록, 같은 기간 다시 읽기(바뀐 줄), 전화 바뀜, 50,001건 사례(작게 만들 수 있으면 원본 한도를 시험 안에서만 바꾸지 말고 실제 수로 만든다)

### 3. 골든 (`scripts/patients/golden/recall.mjs`)
- `revisit.mjs`와 같은 방식으로 원본을 돌리고 `window.NEW_MEDICORE_RECALL`의 함수에 가짜 사례를 넣는다. '오늘'은 인자(`today`)로 고정한다
- 결과: `fixtures/patients/golden/recall-ingest.json`·`recall-compute.json`(compute·select 네 조합·status)·`recall-coverage.json`·`recall-copy.json`(명단 복사·번호 복사 글)
- `readThrough`는 원본에 없는 칸이다 → `knownDiffs`에 이유("우리는 달 조각으로 읽어 마지막 읽은 날을 기억한다")와 함께

### 4. 코드 (`src/lib/patients/recall.ts`)
```ts
export type RecallRule = { id: string; enabled: boolean; label: string; codes: string[]; round: string; months: number }
export const RECALL_DEFAULTS: readonly RecallRule[]      // 원본 DEFAULTS 그대로
export const KEEP_MONTHS = 36, MAX_RECORDS = 50_000
export function roundTest(round: string): (text: string) => boolean
export function prepareRx(rows: unknown[][]): Map<string, Set<string>>        // 'chart|YYYYMMDD' → 처방코드
export function validateHistory(value: unknown): RecallHistory                 // 원본 + readThrough(null 또는 YYYY-MM-DD)
export function ingestRecall(history: RecallHistory, piece: { visits: ChartVisit[]; rx: Map<string, Set<string>>; phones: Record<string, string>; from: string; to: string }, codes: string[], today: string): RecallHistory
export type RecallItem = { ruleId: string; label: string; months: number; chart: string; name: string; phone: string; last: string; due: string; evidence: string }
export function recallCompute(records: RecallRecord[], rules: readonly RecallRule[]): RecallItem[]
export function recallSelect(items: RecallItem[], from: string | null, to: string | null, overdue: boolean, today: string): RecallItem[]
export function recallStatus(item: RecallItem, today: string): string
export function recallCoverage(history: RecallHistory, rules: readonly RecallRule[], today: string): RecallCoverage
export function recallCopyLines(items: RecallItem[], phoneOf: (chart: string) => string): string
export function recallPhones(items: RecallItem[], phoneOf: (chart: string) => string): { text: string; count: number; missing: number }
```
- `ingestRecall`은 원본 `ingest`처럼 `codes`(꺼 둔 규칙 포함 모든 규칙의 코드)를 받는다. `readThrough`는 `max(전 값, piece.to)`
- 전화: 원본처럼 지금 읽은 전화(`phoneOf`)가 있으면 그것, 없으면 기록할 때의 전화

### 5. 시험
- `recall.test.ts`: 사례마다(AC-603.1~603.5). `goldenRecall.test.ts`: 골든 파일과 깊은 비교

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx tsx fixtures/patients/make-fake-patients.ts && git diff --exit-code fixtures/patients/fake
npx vitest run src/lib/patients/recall.test.ts src/lib/patients/goldenRecall.test.ts src/lib/analytics/dates.test.ts   # AC-603.1~AC-603.5
npx vitest run src/lib/patients/followup.test.ts src/lib/patients/goldenFollowup.test.ts   # 앞 step 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-603.1 ~ AC-603.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-1-lists/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 원본처럼 50,000건을 넘으면 오래된 것을 잘라 낸다. 이것을 "멈춤"으로 바꾸지 마라. 이유: 원본과 같아야 하고, 잘리는 것은 36개월 안에서도 가장 오래된 기록뿐이다(design.md)
- `dates.ts`의 기존 함수 동작을 바꾸지 마라. 이유: 통계·청구 시험이 그 함수에 기대고 있다
- 약제코드·간격을 사용자 설정으로 받는 화면·저장을 만들지 마라. 이유: 이번 범위 밖(requirements.md 범위 밖)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
