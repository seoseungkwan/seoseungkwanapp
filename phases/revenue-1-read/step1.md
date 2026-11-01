# Step 1: bridge-contract

> **TASK-2** 명령 표 `revenue.days` · 답 검사 · **REQ-002** · AC-002.1 ~ AC-002.4
> Phase 1 `revenue-1-read` · Step 1 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-2 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-002에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-002.1**: `commands.json`에 `revenue.days`(`patient: false`, `maxDays: 31`, `args {from: date, to: date}`). 웹 `SMALL_COMMANDS`와 도우미 명령 표 시험이 숫자 명령으로 안다(명령 수를 고정 숫자로 시험하지 않는다)
- **AC-002.2**: `checkResult('revenue.days', data)`는 칸이 정확히 `days`·`codes`일 때만 통과. days 줄 = `date`·`visits`·`newPatients`·`returnVisits`·`patientsToDate`·`total`·`insurer`·`noncovered`·`copay`·`otherTotal`·`cash`·`card`·`transfer`·`receivableIn`·`unconfirmed`(design.md 5절 표, `copay`·`otherTotal`은 2026-11-01 더함), 날짜 오름차순·하루도 빠짐없이·31개 이하, 숫자 칸은 0 이상 안전한 정수 또는 `null`, `unconfirmed: true`면 금액 아홉 칸(`total`~`receivableIn`) 모두 `null`, `false`면 모두 숫자. codes 줄 = `code`(`^[0-9A-Za-z가-힣_.\-]{1,30}$`)·`name`(1~100자, 줄바꿈·제어 문자 없음, 또는 `null`)·`count`(0 이상 정수)·`amount`(0 이상 안전한 정수 또는 `null`), 1,000개 이하·중복 없음. 어긋나면 `E-BRIDGE-BAD-REPLY`
- **AC-002.3**: 정해 둔 칸 밖의 칸(`chart`·`name` 등)이 하나라도 있거나 금액이 글자·소수·음수면 통과하지 않는다
- **AC-002.4**: `connectScreenBridge({runtime})`(Worker 없음)로 `call('revenue.days', {from, to})` → 봉투 하나를 보내고 검사한 답을 돌려준다. 조각을 받지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 1절(Worker를 쓰지 않는 까닭), 5절
- `/specs/precheck/design.md` — 4-2·4-3절(봉투·명령 표), 5절(통로 코드)
- `/src/lib/bridge/commands.json`, `/src/lib/bridge/protocol.ts`(`checkResult`·`isClaimDates`의 검사 방식), `/src/lib/bridge/protocol.test.ts`, `/src/lib/bridge/client.ts`, `/src/lib/bridge/client.test.ts`(가짜 runtime 만드는 법), `/src/lib/bridge/workerSink.ts`
- `/src/types/bridge.ts`
- `/helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs`(`TableHasTwelveCommands`), `/helper/tests/protocol.dotnet.test.ts`

## 수정 범위 (tasks.md TASK-2)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/bridge/commands.json`
  - `src/types/bridge.ts`
  - `src/types/revenue.ts`
  - `src/lib/bridge/protocol.ts`
  - `src/lib/bridge/revenueResult.ts`
  - `src/lib/bridge/revenueResult.test.ts`
  - `src/lib/bridge/revenueCall.test.ts`
  - `helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs`
- Tests:
  - `src/lib/bridge/revenueResult.test.ts`
  - `src/lib/bridge/revenueCall.test.ts`
  - `src/lib/bridge/protocol.test.ts`
  - `helper/tests/protocol.dotnet.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **통로 코드는 환자 자료 구역**: `lib/bridge`는 네트워크·console·브라우저 저장소·React/Next/supabase import를 쓰지 않는다. `revenueResult.ts`도 같다(ESLint가 막는다, ADR-020)
- **더하기만**: 기존 명령·`protocol`(1)·`checkResult`의 다른 case·`client.ts`를 바꾸지 않는다. 다른 기능(청구 사전점검)과 겹치는 파일이라 줄을 더하기만 한다(design.md 11절)

## 작업

### 1. 명령 표
- `src/lib/bridge/commands.json`의 `commands`에 `"revenue.days": { "patient": false, "maxDays": 31, "args": { "from": { "type": "date" }, "to": { "type": "date" } } }`를 `stats.rows` 뒤에 더한다
- `helper/tests/Precheck.Core.Tests/Protocol/CommandTable.test.cs`: `TableHasTwelveCommands`의 `notPatient`에 `"revenue.days"` 한 줄만 더한다. 시험 이름·함수 이름의 숫자는 고치지 않는다(다른 갈래도 같은 목록에 한 줄씩 더하는 합칠 곳, 갈래 규칙 C4·C5). 다른 시험은 고치지 않는다

### 2. 타입
```ts
// src/types/revenue.ts (새 파일)
export type RevenueDayRow = {
  date: string; visits: number | null; newPatients: number | null; returnVisits: number | null; patientsToDate: number | null
  total: number | null; insurer: number | null; noncovered: number | null; copay: number | null; otherTotal: number | null; cash: number | null; card: number | null; transfer: number | null; receivableIn: number | null
  unconfirmed: boolean
}
export const REVENUE_DAY_KEYS = ['date', 'visits', 'newPatients', 'returnVisits', 'patientsToDate', 'total', 'insurer', 'noncovered', 'copay', 'otherTotal', 'cash', 'card', 'transfer', 'receivableIn', 'unconfirmed'] as const
export const REVENUE_MONEY_KEYS = ['total', 'insurer', 'noncovered', 'copay', 'otherTotal', 'cash', 'card', 'transfer', 'receivableIn'] as const   // unconfirmed면 모두 null
export type RevenueCodeRow = { code: string; name: string | null; count: number; amount: number | null }
export type RevenueDaysResult = { days: RevenueDayRow[]; codes: RevenueCodeRow[] }
export const REVENUE_CODE_SHAPE = /^[0-9A-Za-z가-힣_.\-]{1,30}$/
export const REVENUE_MAX_DAYS = 31
export const REVENUE_MAX_CODES = 1000
```
- `src/types/bridge.ts`: `SmallCommand`에 `'revenue.days'`, `ArgsMap`에 `'revenue.days': Period`, `ResultMap`에 `'revenue.days': RevenueDaysResult`

### 3. 답 검사
```ts
// src/lib/bridge/revenueResult.ts (새 파일)
export function isRevenueDays(data: unknown): data is RevenueDaysResult
```
- 칸 이름은 정확히 같아야 한다(`protocol.ts`의 `exactKeys` 방식, 칸 목록은 `src/types/revenue.ts`의 상수 하나에서). 날짜는 `YYYY-MM-DD` 진짜 날짜·오름차순·하루씩 이어짐. 정수는 `Number.isSafeInteger` 이고 0 이상. `unconfirmed: true`면 금액 아홉 칸이 모두 `null`, `false`면 모두 숫자(AC-004.3과 같은 짝). 코드는 `REVENUE_CODE_SHAPE`, 중복 없음
- `protocol.ts`: `checkResult` switch에 `case 'revenue.days': return isRevenueDays(data)`와 import 한 줄. 다른 줄은 그대로

### 4. 시험
- `revenueResult.test.ts`: 맞는 답 통과, 칸 하나 더함(`chart`)·빠짐·소수·음수·글자 금액·`unconfirmed`와 금액 아홉 칸 짝 어긋남·날짜 뒤바뀜·중복·하루 건너뜀·32일·코드 모양·1,001개 거부(AC-002.2·002.3). 가짜 자료만
- `revenueCall.test.ts`: `client.test.ts`처럼 가짜 runtime으로 `connectScreenBridge({ runtime })`(worker 없음) → `hello` → `call('revenue.days', {from, to})`가 봉투 하나를 보내고 맞는 답이면 그 답, 칸이 섞인 답이면 `E-BRIDGE-BAD-REPLY`로 거부(AC-002.4). `SMALL_COMMANDS`에 `revenue.days`가 있고 `isPatient('revenue.days')`가 false(AC-002.1)
- 도우미 쪽 명령 표 시험은 `helper/tests/protocol.dotnet.test.ts`가 돈다(AC-002.1)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2 칸이 하나 더 있으면 E-BRIDGE-BAD-REPLY …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

- C# 시험 파일 이름은 `*.test.cs`다(하네스가 시험 파일로 알아본다). xUnit 이름에 AC ID를 넣는다: `[Fact(DisplayName = "AC-003.2 환불이 있는 날은 금액 null, unconfirmed")]`
- 하네스 TDD 기록은 vitest 감싸개(`helper/tests/*.dotnet.test.ts`)로 남긴다. 감싸개는 `helper/tests/runDotnet.ts`의 `runDotnet('<시험 이름공간>')`을 부르고 `it` 이름에도 AC ID를 넣는다. 시간 제한은 넉넉히(예: 300초)
- RED를 기록하기 전에 `export PATH="$HOME/.dotnet:$PATH" && dotnet --version` 이 되는지 먼저 본다. dotnet이 없어서 실패한 것은 RED가 아니다
- execute.py로 돌리면 허용 도구에 dotnet이 있어야 한다: `HARNESS_ALLOWED_TOOLS="Read,Edit,Write,Bash(npm:*),Bash(npx:*),Bash(node:*),Bash(python3:*),Bash(git add:*),Bash(git diff:*),Bash(dotnet:*)"`

## Acceptance Criteria

```bash
npx vitest run src/lib/bridge/revenueResult.test.ts src/lib/bridge/revenueCall.test.ts   # AC-002.1~AC-002.4
npx vitest run src/lib/bridge                                                               # 통로 시험 전부 그대로
export PATH="$HOME/.dotnet:$PATH" && npx vitest run helper/tests/protocol.dotnet.test.ts     # 도우미 명령 표에 revenue.days
npx vitest run extension
python3 ~/.claude/harness/bin/tdd-run TASK-2 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-1-read/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `revenue.days`를 `patient: true`로 두지 마라. 이유: 답이 숫자뿐이라 조각·Worker 길이 필요 없고, 화면이 바로 받아 저장해야 한다(design.md 1절)
- `protocol`(1)을 올리지 마라. 이유: 확장·도우미 버전 맞추기가 깨진다. 옛 도우미는 `E-HELPER-UNKNOWN-COMMAND`로 답하고 화면이 '도우미 새로 깔기'를 보인다
- `client.ts`·`workerSink.ts`·`extension/`을 고치지 마라. 이유: 명령 표에서 목록을 읽으므로 바꿀 필요가 없고, 청구 사전점검과 겹친다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
