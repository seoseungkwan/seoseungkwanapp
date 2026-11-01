# Step 1: calc-format

> **TASK-2** 합계·칸 글자·날짜 규칙 · **REQ-002** · AC-002.1 ~ AC-002.4, AC-002.6 ~ AC-002.10
> Phase 1 `worklog-1-data` · Step 1 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이미 된 일 (2026-11-01 명세 변경)

- **이미 커밋됨(16ef2ce). 기존 파일을 고친다. 시험을 먼저 바꿔 RED를 확인한다.** 새로 만들지 않는다
- 바뀌는 것: 칸이 모두 글자가 된다(`WorklogDay`), 항목 이름 12칸·`memo`가 더해진다, `calc`는 읽은 숫자(`WorklogNumbers`)로 합계만 내고 `parseCount`·`parseWon`을 지운다, `notes`는 막는 모양을 넓히고 이름이 `privacyProblem`이 된다
- `calc.test.ts`의 `parseCount`·`parseWon` 시험은 지운다(명세가 그 AC를 REQ-003으로 옮겼다. TASK-3이 같은 뜻을 다시 시험한다). 그 AC 번호는 더 쓰지 않는다
- 이 step 뒤로 커밋 안 된 `src/lib/storage/worklogDays.ts`·`memoStore.ts`는 타입이 어긋날 수 있다. TASK-3·5가 고친다. 이 TASK의 시험만 본다

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-002에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-002.1**: 환자 합계 = 신환 + 재진의 읽은 숫자(없으면 0, 엑셀 `D6`)
- **AC-002.2**: 수납액 = 현금수납 + 카드수납 + 계좌이체 + 지역화폐만(`E15`). 총진료비·조합청구액·미수발생·미수입금 제외
- **AC-002.3**: 총지불액 = 지출 현금 + 카드 + 환불 + free(`E22`)
- **AC-002.4**: 합계 = 수납액 − 총지불액, 음수 그대로(`E23`), 정수
- **AC-002.6**: 숫자 → 글자 — 입력 칸 ''/'1,234,500원', 초점 중 '1,234,500', 자동 칸 0 → '원', 음수 '-12,000원', 인원 '86', 환자 합계 0 → '0'
- **AC-002.7**: '2026-10-28' → '2026/10/28 수'
- **AC-002.8**: 전날·다음 날(오늘이면 null)·날짜 모양 아님/미래 → 오늘. 일요일·휴일도 건너뛰지 않는다
- **AC-002.9**: 자정 넘김 — 옛 오늘을 보고 있었으면 새 오늘, 아니면 그대로
- **AC-002.10**: 칸 글자 개인정보 모양(전화 `010-0000-1234`·`01000001234`·`010-00001234`·`0200001234`·`(02)000-1234`·`+82 10-0000-1234`, 주민번호 `900101-1234567`·`900101 1234567`·붙여 쓴 13자리, 메일) 검사. '1234567'·'12,000'·'2건 12,000'·'00012'·보통 글자는 문제 아님

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-002
- `/specs/worklog/design.md` — 2절(엑셀 계산식·서식), 5절(자료 모양 표), 6절(순수 함수)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/lib/analytics/dates.ts` — `addDays`·`compareYmd`·`isYmd`·`weekdayOf`(1=월 … 7=일)
- `/src/components/shell/kstNow.ts` — 한국 시각 읽는 법(`Intl.DateTimeFormat` Asia/Seoul h23)
- `/src/lib/payload/validate.ts` 19~23줄 — 전화·주민번호·메일 정규식(옮겨 쓴다, 불러오지 않는다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/types/worklog.ts`
  - `src/lib/worklog/calc.ts`
  - `src/lib/worklog/calc.test.ts`
  - `src/lib/worklog/days.ts`
  - `src/lib/worklog/days.test.ts`
  - `src/lib/worklog/notes.ts`
  - `src/lib/worklog/notes.test.ts`
- Tests:
  - `src/lib/worklog/calc.test.ts`
  - `src/lib/worklog/days.test.ts`
  - `src/lib/worklog/notes.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- 날짜 계산은 `lib/analytics/dates.ts` 한 곳만 쓴다(CLAUDE.md). `Date`로 날짜를 더하거나 빼지 않는다. 시험은 `TZ=Asia/Seoul`(vitest 설정)
- 합계는 원 단위 정수다. 소수·반올림이 없다(나눗셈이 없다). 칸은 글자지만 합계는 읽은 숫자로만 낸다
- 이 파일들은 순수 TS다: React·supabase·`fetch`·브라우저 저장소·`console`을 쓰지 않는다
- 업무사항(`memo`)·항목 이름도 `WorklogDay`의 글자 칸이다. 합계 계산에는 들어가지 않는다(design.md 5절)

## 작업

### 1. `src/types/worklog.ts` (고침)
design.md 5절 그대로: `WorklogCountKey`·`WorklogWonKey`·`WorklogNumberKey`·`WorklogNoteKey`·`WorklogNameKey`·`WorklogCellKey`·`WorklogDay`(모두 글자, 빈 칸 `''`)·`WorklogChanges`·`WorklogNumbers`·`WorklogTotals`, 상수 `WORKLOG_COUNT_KEYS`·`WORKLOG_WON_KEYS`·`WORKLOG_NOTE_KEYS`·`WORKLOG_NAME_KEYS`·`WORKLOG_CELL_KEYS`(32칸)·`WORKLOG_SUM_KEYS`(열 칸)·`WORKLOG_COLUMNS`(열쇠 → DB 칸, 32개)·`WORKLOG_LABELS`(열쇠 → `aria-label`)·`WORKLOG_NAME_OF`(금액 칸 → 항목 이름 칸)·`WORKLOG_DEFAULT_NAMES`(엑셀 글자)·`CELL_MAX = 50`·`NAME_MAX = 20`·`NOTE_MAX = 100`·`MEMO_MAX = 2000`, `emptyWorklogDay()`(모든 칸 `''`).
- 순서는 엑셀 줄 순서(신환·재진·총진료비 … 지출 free / 비고는 현금·카드·환불·free·총지불액 / 업무사항 / 항목 이름은 금액 칸 순서)

### 2. `src/lib/worklog/calc.ts` (고침)
```ts
export function worklogTotals(numbers: WorklogNumbers): WorklogTotals   // 칸 글자를 읽지 않는다. 읽은 숫자(cellText.readDayNumbers, TASK-3)만 받는다
export function wonInputText(n: number | null, focused: boolean): string
export function wonAutoText(n: number): string
export function countText(n: number | null): string
export function visitsText(n: number): string
```
- `parseCount`·`parseWon`을 지운다. `calc`는 `cellText`를 부르지 않는다(방향은 `cellText` → `calc`)
- 쉼표는 `Intl.NumberFormat('ko-KR')`. 음수 자동 칸은 '-' + 절댓값 쉼표 + '원'
- 시험: 엑셀 계산식 넷을 칸마다 따로(더하면 안 되는 칸에 값을 넣어도 수납액이 그대로인지), 빈 날(모두 null) → 0·0·0·0, 음수 합계. `WORKLOG_SUM_KEYS`의 칸만 합계를 움직이는지 칸마다 본다

### 3. `src/lib/worklog/days.ts` (그대로)
- 코드는 그대로다. 시험에 일요일·휴일을 건너뛰지 않는지(토요일의 다음 날은 일요일) 하나를 더한다(`AC-002.8`)

### 4. `src/lib/worklog/notes.ts` (고침)
```ts
export function privacyProblem(text: string): boolean
export function blockedCellKeys(cells: WorklogChanges): WorklogCellKey[]   // 값이 개인정보 모양인 칸. 모든 입력 칸
```
- design.md 6절의 정규식(`lib/payload/validate.ts`를 옮겨 업무일지에 한해 넓힌 것)을 이 파일에 쓰고 출처·넓힌 까닭을 주석으로 적는다. `notePrivacyProblem` 이름은 없앤다
- `privacyProblem`은 검사 전에 줄표(`－`·`—`·`–`·`―`·`‐`·`‑`·`−`·`ㅡ`)를 `-`로 바꾼 뒤 `normalize('NFKC')`로 맞춘다(design.md 6절). 받은 글자는 바꾸지 않는다
- 시험: 위 AC-002.10 모양 모두와 전각·긴 줄표로 적은 것('０１０-００００-１２３４'·'９００１０１-１２３４５６７'·'010－0000－1234'·'010—0000—1234'·'010ㅡ0000ㅡ1234') → 참 / '1234567'·'12,000'·'2건 12,000'·'00012'·'12,000 별도'·'택배비'·'' → 거짓. `blockedCellKeys`는 숫자 칸·비고·업무사항·항목 이름 어디에 있어도 그 칸을 돌려주고, 값이 없는 칸은 돌려주지 않는다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/worklog/calc.test.ts src/lib/worklog/days.test.ts src/lib/worklog/notes.test.ts   # AC-002.1~AC-002.4, AC-002.6~AC-002.10
python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint   # 전체 시험·verify는 TASK-5까지 끝난 뒤(옛 저장 파일 타입이 잠시 어긋난다)
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. Phase 1 전체 확인(`npm test`·`verify`)은 TASK-5 뒤에 한다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-002.1 ~ AC-002.4, AC-002.6 ~ AC-002.10이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `lib/payload/validate.ts`를 고치거나 불러오지 마라. 이유: 환자 자료 구역 파일이고 상수를 내보내지 않는다. 넓힌 모양은 업무일지에만 쓴다(그 파일은 처방코드 같은 숫자를 잘못 거르지 않아야 한다)
- 합계를 저장할 값으로 만들지 마라(`WorklogDay`에 합계 칸 없음). 이유: 저장은 원래 숫자만, 합계는 그릴 때 계산한다(design.md 1절)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
