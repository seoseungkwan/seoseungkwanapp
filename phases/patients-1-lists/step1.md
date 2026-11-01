# Step 1: followup-logic

> **TASK-2** F/U 명단 계산 (골든) · **REQ-602** · AC-602.1 ~ AC-602.5
> Phase 1 `patients-1-lists`(명단 계산 (웹, 골든)) · Step 1 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-602에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-602.1**: `parseFU(visitDate, lines)`: 1주/N주 뒤·내일·모레·다음주+요일·N월 초/중/말·적어 둔 날짜(10.17·10/19·10월 17일, 120일 안) → `{dateStr, sortDate, kind, evidence}` 원본과 같다. VAS 7/10·L4.5는 날짜 아님(골든)
- **AC-602.2**: `aragan`: N차 < 3이면 +7일(골든)
- **AC-602.3**: `prepareSchedule(rows)`: 내원번호·차트번호로 묶고 줄 이어 붙임, 날짜 → 내원번호 순서, 차트별 마지막 내원. 원본이 멈추는 사례는 `E-PATIENTS-SOURCE`(골든)
- **AC-602.4**: `preparePhones(rows)`: 전화 칸 찾기(팩스 제외)·번호 나누기·번호 하나인 차트만 `map`·충돌이면 `E-PATIENTS-SOURCE`(골든)
- **AC-602.5**: `scheduleRows`·`undecidedRows`·`visitKind`·`passFilters`·`pasteRows` 원본과 같다(골든, 기준 날짜 고정)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-602
- `/specs/patients/design.md` — '도우미 `contact.targets` 답 모양'(`chart`·`rx` 표 줄이 이 함수들의 입력이다), '계산 모양', '결정과 트레이드오프'의 복사·오류 번호
- `/specs/patients/tasks.md` — TASK-2
- `/src/lib/analytics/dates.ts`(`addDays`·`weekdayOf`·`diffDays`·`parseDateCell`)
- `/src/lib/precheck/`가 main에 있으면 원본 옮김의 말투만 참고(고치지 않는다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(precheck에서 GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`)의 자료는 모두 가짜다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/revisit_schedule.html` — 원본 계산이 모두 이 파일 안에 있다. 함수 자리(줄 번호는 참고): 정규식 `WD`·`YOIL`·`COND_RE`·`FU_RE`·`FU_DATE_RE`·`INJ_RE`·`INJ_EX_RE`(752~758), `phoneOf`(770), `writtenDate`(780), `parseFU`(791), `ARAGAN_RE`·`aragan`(849~), `extractTx`(867), `SITE_RULES`·`extractSite`(880~910), `INJECT_RE`·`ROUND_RE`·`NOT_INJ_RE`·`visitKind`(929~934), `symptomFull`(942), `baseDate`·`scheduleRows`·`undecidedRows`(973~989), `passFilters`(1011), `pasteRows`(1028), 그리고 `NEW_MEDICORE_REVISIT` 묶음의 `dateKey`(1389)·`recordedStamp`(1411)·`isChartSummaryRow`(1442)·`phoneColumn`(1588)·`phoneTokens`(1595)·`headerFor`(1611)·`prepareSchedule`(1622)·`preparePhones`(1650)
  - `tools/revisit_source_parts.py` — 적어 둔 날짜(`writtenDate`)를 끼워 넣는 도구다. 이미 끼워진 결과가 `revisit_schedule.html`이라 따로 돌리지 않는다(같은지 눈으로만 확인)
  - `tests/test_revisit_import_html.py`(30~60줄: `<script>`를 꺼내 `vm.createContext`에 가짜 `document`를 넣고 차례로 돌리는 방식), `tests/test_revisit_source.py`(적어 둔 날짜 사례)

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/patients/followup.ts`
  - `src/lib/patients/followup.test.ts`
  - `src/lib/patients/goldenFollowup.test.ts`
  - `src/lib/patients/sourceError.ts`
  - `src/types/patients.ts`
  - `scripts/patients/golden/*`
  - `fixtures/patients/golden/followup-*.json`
  - `fixtures/patients/golden/phone-columns.json`
  - `fixtures/patients/fake/*`
  - `fixtures/patients/make-fake-patients.ts`
  - `fixtures/patients/make-fake-patients.test.ts`
- Tests:
  - `src/lib/patients/followup.test.ts`
  - `src/lib/patients/goldenFollowup.test.ts`
  - `fixtures/patients/make-fake-patients.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/patients`·`src/lib/analytics`·`src/workers`(그리고 `lib/parsers`·`lib/payload`·`lib/precheck`·`lib/bridge`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020, REQ-601)
- **골든 시험**: 같은 가짜 자료를 원본(`2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/patients/golden/`의 스크립트로 한 번 만들어 `fixtures/patients/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_revisit_import_html.py`가 `<script>`를 꺼내 `vm.runInContext`로 돌리는 방식과 같게) 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요). 원본의 `Date` 값은 골든 파일에 `YYYY-MM-DD` 글자로 적는다
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(`revisit_schedule.html`·`message_templates.html` 등)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드와 골든 결과뿐이다
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 가짜 자료 (`fixtures/patients/make-fake-patients.ts` → `fixtures/patients/fake/*.json`)
- 씨앗을 고정해 늘 같은 파일을 만든다. 스크립트로 부른다: `npx tsx fixtures/patients/make-fake-patients.ts`
- `followup-cases.json`: `parseFU` 사례 — '1주 뒤'·'2주뒤 f/u'·'내일'·'모레'·'다음주 화요일'·'담주 금'·'11월 초/중/말'·'10.17'·'10/19'·'10월 17일'·120일 넘는 날짜·'VAS 7/10'·'L4.5'·'아프면 오세요'(조건부)·'아라간 2차'·'아라간 3차'·주사/F/U 구분 문구·날짜 미정('9월 초')
- `chart-rows.json`·`rx-rows.json`: 83·47 표 줄(첫 줄 칸 이름, design.md 답 모양). 같은 내원 여러 줄, 엑셀 일련번호 날짜와 `YYYY-MM-DD`·`YYYYMMDD` 날짜, 전화 칸 '휴대폰'·'보호자연락처'·'팩스'·여러 번호·충돌 번호, 오류 사례(환자명 빔·같은 내원번호 다른 환자·필수 칸 중복)
- `make-fake-patients.test.ts`: 두 번 만들면 같다, 이름·차트번호·전화가 가짜 모양뿐이다(정규식으로 검사)

### 2. 골든 (`scripts/patients/golden/revisit.mjs`)
- `node scripts/patients/golden/revisit.mjs "$YANGJI_SRC"` → `revisit_schedule.html`에서 `<script>`를 꺼내 원본 시험처럼 `vm`에서 돌리고 가짜 사례를 넣어 결과를 쓴다
  - `fixtures/patients/golden/followup-parse.json`(parseFU·aragan·visitKind·extractTx·extractSite)
  - `fixtures/patients/golden/followup-schedule.json`(prepareSchedule → scheduleRows(조건부·지난 예정 네 조합)·undecidedRows·pasteRows(날짜 머리 줄 있음·없음, 기간 있음·없음), 원본이 던지는 사례는 `{ "throws": true }`)
  - `fixtures/patients/golden/followup-phones.json`(preparePhones·phoneTokens)
  - `fixtures/patients/golden/phone-columns.json`(칸 이름 목록마다 `phoneColumn` 결과. TASK-8의 C# `IsPhoneColumn`이 같은 파일로 견준다)
- 원본이 '오늘'을 쓰는 곳은 고정 날짜를 넣는다(`baseDate`는 자료의 마지막 진료일). 원본 `Date`는 `YYYY-MM-DD`로 적는다

### 3. 코드 (`src/lib/patients/followup.ts`)
```ts
export type FuNext = { dateStr: string; sortDate: string | null; kind: '예정' | '조건부' | ''; evidence: string }   // 원본 모양, Date → 'YYYY-MM-DD'
export type ChartVisit = { visitNo: string; chart: string; name: string; date: string; recordedAt: string; lines: string[]; next: FuNext; tx: string; site: string }
export function writtenDate(visitDate: string, month: number, day: number, before: string): string | null
export function parseFU(visitDate: string, lines: string[]): FuNext
export function aragan(visitDate: string, lines: string[]): /* 원본 반환 모양 그대로 */
export function extractTx(lines: string[]): string
export function extractSite(lines: string[]): string
export function visitKind(v: { next: FuNext }): '주사' | 'F/U'
export function dateKey(raw: unknown): string | null                       // 원본처럼 'YYYYMMDD'
export function prepareSchedule(rows: unknown[][]): { visits: ChartVisit[]; latest: Record<string, ChartVisit> }
export function phoneColumn(header: unknown): boolean
export function phoneTokens(raw: unknown): { values: { number: string; raw: string }[]; invalid: boolean }
export function preparePhones(rows: unknown[][], allowMissing?: boolean): { map: Record<string, string>; loaded: boolean; count: number; missing: boolean }
export function phoneOf(map: Record<string, string>, chart: string): string
export function baseDate(visits: ChartVisit[]): string
export function scheduleRows(latest: Record<string, ChartVisit>, o: { includeCond: boolean; includePast: boolean; base: string }): ChartVisit[]
export function undecidedRows(latest: Record<string, ChartVisit>): ChartVisit[]
export function passFilters(v: ChartVisit, f: { kind: '' | '주사' | 'F/U'; from?: string; to?: string }, useDate: boolean): boolean
export function pasteRows(list: ChartVisit[], phones: { map: Record<string, string>; loaded: boolean }, o: { from?: string; to?: string; withDate: boolean }): string[][]
```
- 원본 줄을 그대로 옮기되 날짜는 `YYYY-MM-DD` 글자와 `dates.ts` 함수로 계산한다(결과는 원본과 같아야 한다). 원본이 화면 요소(`document.getElementById`)에서 읽는 값은 인자로 받는다
- 원본이 `throw new Error(…)` 하는 곳은 `sourceError.ts`의 `PatientsSourceError`(`code = 'E-PATIENTS-SOURCE'`, `message`에 환자 값 없음)를 던진다
- 타입은 `src/types/patients.ts`에 둔다(design.md '계산 모양'의 줄 타입 포함)

### 4. 시험
- `followup.test.ts`: 표현마다 한 줄씩(AC-602.1·602.2), 묶기·순서·오류(AC-602.3), 전화(AC-602.4), 명단·붙여넣기(AC-602.5)
- `goldenFollowup.test.ts`: 골든 파일 셋을 `node:fs`로 읽어 우리 함수 결과와 깊은 비교(순서까지). `knownDiffs`에 적은 것만 넘어간다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx tsx fixtures/patients/make-fake-patients.ts && git diff --exit-code fixtures/patients/fake   # 두 번째 실행에서 바뀐 것이 없어야 한다
npx vitest run src/lib/patients/followup.test.ts src/lib/patients/goldenFollowup.test.ts fixtures/patients/make-fake-patients.test.ts   # AC-602.1~AC-602.5
python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-602.1 ~ AC-602.5가 이 TASK의 시험과 이어져 보여야 한다

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

- 원본에 없는 날짜 표현을 새로 읽게 만들지 마라. 이유: 원본과 같아야 한다(골든). 고칠 점을 찾으면 summary에 적는다
- 원본 HTML·JS를 저장소에 복사하지 마라. 이유: 원본은 저장소 밖(YANGJI_SRC)
- `dates.ts`를 고치지 마라. 이유: 달 더하기는 TASK-3 몫이고 이 step은 날짜 더하기·요일만 쓴다
- 오류 메시지나 시험 실패 글에 가짜라도 환자 이름·전화를 넣는 습관을 만들지 마라. 이유: 진짜 자료에서 같은 코드가 돈다. 오류는 번호만
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
