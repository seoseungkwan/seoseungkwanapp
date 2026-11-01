# Step 2: cell-text

> **TASK-3** 칸 글자 읽기 · **REQ-003** · AC-003.6 ~ AC-003.15
> Phase 1 `worklog-1-data` · Step 2 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-3 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이미 된 일 (2026-11-01 명세 변경)

- 옛 TASK-3(업무사항 이 PC 저장소)은 없어졌다. 작업 폴더의 커밋 안 된 `src/lib/worklog/memoStore.ts`·`memoStore.test.ts`를 **지운다**(`rm`, 되돌리는 git 명령은 쓰지 않는다)
- 옛 AC 번호(1~5번)는 다른 뜻으로 다시 쓰지 않는다. 이 REQ는 6번부터다

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-003에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-003.6**: 숫자만·쉼표·"원" → 그 숫자("1,234,500원" → 1234500, "00012" → 12). 빈 글자·공백뿐 → 없음
- **AC-003.7**: 글 안에 숫자 하나 → 그 숫자('12,000 별도' → 12000, '12,000-' → 12000). 쉼표는 한 숫자에 속한다
- **AC-003.8**: 숫자 없음('별도 보고') → 없음
- **AC-003.9**: 숫자 둘 이상('2건 12,000'·'12 000'·'10/28') → 합계 제외
- **AC-003.10**: 소수점('12.5'·'.5')·빼기 표시('-5,000'·'- 5,000'·'△5,000'·'(5,000)')·전각 숫자('１２,０００')·숫자 바로 뒤 백·천·만·억·조('12만원'·'12 만원'·'3백원')·인원 5자리·금액 12자리 초과(앞의 0은 세지 않음) → 합계 제외. 앞자리만 잘라 읽지 않는다
- **AC-003.11**: 개인정보 모양 → 합계 제외
- **AC-003.12**: 합계에 쓸 숫자 = 숫자로 읽힌 칸만 값. 업무사항·비고·항목 이름은 읽지 않는다
- **AC-003.13**: "합계에서 빠졌어요" 칸 = 합계에 들어가는 열 칸 중 합계 제외인 칸뿐. 총진료비·조합청구액·미수발생·미수입금은 안 듦
- **AC-003.14**: 화면 글자 — 숫자만(쉼표·"원")이고 숫자로 읽히면 엑셀 모양(금액 "1,234,500원", 초점 중 "1,234,500", 0 → 빈 글자, 인원 "86"), 그 밖은 친 글자 그대로
- **AC-003.15**: 저장할 글자 — 숫자 칸·항목 이름은 앞뒤 공백만 지움, 항목 이름이 기본 이름과 같으면 빈 글자, 비고·업무사항은 그대로

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-003
- `/specs/worklog/design.md` — 7절(칸 글자 읽기: 읽는 순서·표), 5절(칸 표·상수), 6절(`calc`·`notes`)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/types/worklog.ts`·`/src/lib/worklog/*` (Phase 1 Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-3)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/worklog/cellText.ts`
  - `src/lib/worklog/cellText.test.ts`
  - `src/lib/worklog/memoStore.ts` (지운다)
  - `src/lib/worklog/memoStore.test.ts` (지운다)
- Tests:
  - `src/lib/worklog/cellText.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **짐작하지 않는다**(사용자 원칙): 어떻게 읽을지 애매하면 더하지 않고 합계 제외로 둔다. 앞자리만 잘라 읽거나 단위를 곱하지 않는다
- 순수 TS다: React·supabase·`fetch`·브라우저 저장소·`console`을 쓰지 않는다
- 칸 글자를 오류 메시지·로그에 넣지 않는다
- 의존 방향은 `cellText` → `calc`(글자 모양)·`notes`(모양 검사)·`types`. `calc`가 `cellText`를 부르지 않는다

## 작업

```ts
export type CellKind = 'count' | 'won'
export type CellRead = { kind: 'number'; value: number } | { kind: 'none' } | { kind: 'excluded' }
export function cellKindOf(key: WorklogNumberKey): CellKind
export function readCell(kind: CellKind, text: string): CellRead
export function readDayNumbers(day: WorklogDay): WorklogNumbers
export function excludedSumKeys(day: WorklogDay): WorklogNumberKey[]
export function cellShownText(kind: CellKind, text: string, focused: boolean): string
export function cellSaveText(key: WorklogCellKey, text: string): string
```
- `readCell`은 design.md 7절 '읽는 순서' 1~7 그대로: 앞뒤 공백 지움 → 빈 글자 `none` → `privacyProblem`이면 `excluded` → 전각 숫자(`０`~`９`)가 있으면 `excluded`(덩이를 찾기 전에 본다) → 숫자 덩이 `/\d[\d,]*/g`(없으면 `none`, 둘 이상 `excluded`) → 앞(공백 건너)이 `.`·`-`·`−`·`–`·`—`·`－`·`△`·`▲`·`▼`·`(`·`（`면 `excluded` → 뒤(공백 건너)가 `백`·`천`·`만`·`억`·`조`면 `excluded` → 쉼표·앞의 0을 지운 자릿수가 한도(인원 5·금액 12)를 넘으면 `excluded` → `number`
- `readDayNumbers`: 숫자 칸 14개마다 `number`면 값, 아니면 `null`. `worklogTotals(readDayNumbers(day))`가 합계다
- `excludedSumKeys`: `WORKLOG_SUM_KEYS` 순서로 `excluded`인 칸
- `cellShownText`: `/^\d[\d,]*\s*원?$/`이고 `number`면 금액 `wonInputText(value, focused)`·인원 `countText(value)`, 아니면 친 글자 그대로(앞뒤 공백을 지운 글자)
- `cellSaveText`: 숫자 칸·항목 이름은 `trim`, 항목 이름이 `WORKLOG_DEFAULT_NAMES`와 같으면 `''`, 비고·`memo`는 그대로
- 시험: design.md 7절 표의 모든 줄(읽기·합계·표시), `worklogTotals(readDayNumbers(day))`로 '12,000 별도'는 더해지고 '2건 12,000'은 안 더해지는지, 금액 12자리·13자리와 인원 5자리·6자리 경계, 표시 칸(열 칸 각각 들고, 넷은 '2건 12,000'이어도 안 듦, `memo`·비고의 숫자는 안 듦), 막는 모양(`01000001234`)이 쉼표 금액으로 보이지 않음, 저장할 글자('12,000 별도 ' → '12,000 별도', 쉼표·"원"은 그대로, 항목 이름 기본 글자 → ''). 가짜 숫자·가짜 번호만 쓴다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/worklog/cellText.test.ts src/lib/worklog/calc.test.ts   # AC-003.6~AC-003.15
python3 ~/.claude/harness/bin/tdd-run TASK-3 --expect green
test ! -e src/lib/worklog/memoStore.ts && test ! -e src/lib/worklog/memoStore.test.ts
npm run lint   # 전체 시험·verify는 TASK-5까지 끝난 뒤
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. Phase 1 전체 확인(`npm test`·`verify`)은 TASK-5 뒤에 한다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-003.6 ~ AC-003.15가 이 TASK의 시험과 이어져 보여야 한다

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

- 합계·표시 규칙을 화면 파일에 다시 쓰지 마라. 이유: 칸 읽기는 이 파일 한 곳이다(Phase 4 비트 비교도 같은 규칙을 쓴다)
- 업무사항·비고의 숫자를 읽거나 더하지 마라. 이유: 사용자 결정("업무사항에 있는 건 빼고")
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
