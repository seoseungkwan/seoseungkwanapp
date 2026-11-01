# Step 3: revenue-sync

> **TASK-7** 저장·가져오기 · **REQ-007** · AC-007.1 ~ AC-007.5
> Phase 2 `revenue-2-numbers` · Step 3 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-007에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-007.1**: `planFetch(today, savedDays)`: 어제가 속한 달부터 거꾸로 13달 가운데 와야 할 날이 하나라도 없는 달을 **최근 달부터**, 달마다 1일 ~ 와야 할 마지막 날(31일 이하). 다 저장된 달은 빼기
- **AC-007.2**: `saveMonth(month, result)`: 답 첫 날이 그 달 1일인지 확인(아니면 `E-REVENUE-SAVE-FAILED`) → 그 달 `sales_codes` 지우기 → 넣기(`month`·`code`·`name`·`count`·`amount`) → **마지막에** `sales_days` upsert(`hospital_id`+`day`, 열세 칸). 보내는 칸은 정해 둔 것뿐. 실패하면 `E-REVENUE-SAVE-FAILED`
- **AC-007.3**: `syncRevenue`: 달마다 가져오기 → 저장, `onProgress`. 그 달의 읽기·검사·저장 오류(`E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`)는 `failed`에 넣고 계속, 그 밖의 번호는 `stopped`로 멈춤. `months`면 그 달만. `E-HELPER-UNKNOWN-COMMAND` → `helperOld`, `E-BRIDGE-REJECTED` → `extensionOld`
- **AC-007.4**: `loadRevenue(fromMonth, toMonth)`: 그 달들의 날 줄·코드 줄(이름 포함)과 가장 늦은 `fetched_at`
- **AC-007.5**: `E-REVENUE-SAVE-FAILED`의 '무엇이 · 어떻게 고치나' 문구가 `lib/errors.ts`에

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 3절(자료 길), 7절(`sync.ts` 모양), 8절(저장·`E-REVENUE-SAVE-FAILED` 문구), 11절(errors.ts 겹침)
- `/src/lib/supabase/browser.ts`(브라우저 Supabase 클라이언트), `/src/lib/errors.ts`·`/src/types/errors.ts`·`/src/lib/errors.test.ts`(오류 번호 더하는 방식)
- `/src/lib/analytics/dates.ts`
- 이전 step에서 만든 파일:
  - `src/types/revenue.ts`
  - `src/lib/revenue/summary.ts`(`firstMonth`) · `treatments.ts`
  - `supabase/migrations/20261101000400_revenue.sql`(칸 이름·권한)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/revenue/sync.ts`
  - `src/lib/revenue/sync.test.ts`
  - `src/lib/storage/revenue.ts`
  - `src/lib/storage/revenue.test.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
  - `src/types/errors.ts`
- Tests:
  - `src/lib/revenue/sync.test.ts`
  - `src/lib/storage/revenue.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **날짜**: 한국 날짜 계산은 `src/lib/analytics/dates.ts`의 함수만 쓴다. `new Date()` 산수를 새로 만들지 않는다 (CLAUDE.md)
- **서버 코드 없음**: 저장은 브라우저 Supabase 클라이언트 + RLS로만 한다. `app/api/*`를 만들지 않는다 (ADR-004)
- **보내는 모양을 정해 둔다**: 저장 줄은 정해 둔 칸만 새 객체로 만든다(받은 객체를 그대로 펼쳐 보내지 않는다). `hospital_id`·`fetched_at`은 보내지 않는다(DB가 채운다)
- **겹치는 파일은 더하기만**: `errors.ts`·`types/errors.ts`에 `E-REVENUE-SAVE-FAILED` 한 항목만. 새 번호는 기능 이름(`E-REVENUE-*`)이라 다른 갈래와 겹치지 않는다(갈래 규칙 C3). main에 이미 있는 번호는 그대로 쓴다

## 작업

### 1. `src/lib/revenue/sync.ts`
- `planFetch(today, savedDays)`: `firstMonth(today)`(summary.ts)부터 거꾸로 13달, **최근 달부터** 돌려준다. 달마다 '와야 할 날' = `eachDay(1일 ~ min(말일, 어제))`. 하나라도 `savedDays`에 없으면 그 달 전체 기간을 넣는다(코드 합계가 달 전체여야 해서)
- `syncRevenue`: `months`가 있으면 그 달들만(기간은 같은 규칙), 없으면 `planFetch`. 달마다 `call({from, to})` → `store.saveMonth(month, result)` → `onProgress`. 결과 `SyncResult = { stopped, failed, helperOld, extensionOld }`(design.md 7절): `E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`는 `failed`에 넣고 다음 달, 그 밖의 번호는 `stopped`에 넣고 멈춤. `E-HELPER-UNKNOWN-COMMAND` → `helperOld`, `E-BRIDGE-REJECTED`(옛 확장은 모르는 명령을 막는다) → `extensionOld`(둘 다 멈춤)
- `call`은 화면이 넘긴다(시험에서는 가짜). 이 파일은 `lib/bridge`·supabase를 import하지 않는다

### 2. `src/lib/storage/revenue.ts`
- `createRevenueStore(client)` → `{ saveMonth, loadRevenue }`(design.md 8절). `client`는 인자로 받는다(시험은 가짜 클라이언트로 부른 표 이름·칸·순서를 기록)
- `saveMonth`: 답 첫 날이 그 달 1일이 아니면 저장하지 않고 `E-REVENUE-SAVE-FAILED`(`patientsToDate`가 1일부터 센 값이어야 한다). 순서는 ① 그 달 `sales_codes` 지우기 ② 코드 줄 넣기(`month` = `YYYY-MM-01`, `code`·`name`·`count`·`amount`) ③ **마지막에** `sales_days` upsert `{ onConflict: 'hospital_id,day' }`(camelCase → snake_case, 칸 목록은 `REVENUE_DAY_KEYS`에서). 코드 쪽이 실패하면 날 줄이 없어 그 달을 다시 가져온다. 오류가 하나라도 있으면 `E-REVENUE-SAVE-FAILED`를 던진다(Supabase 오류 내용은 버린다)
- `loadRevenue`: `sales_days`(`day` 범위)·`sales_codes`(`month` 범위)를 읽고 `fetched_at` 가장 늦은 값. 칸을 고른다(`sales_days` 열세 칸 + `fetched_at`, snake_case → camelCase로 돌려 `RevenueDayRow`)

### 3. 오류 문구
- `E-REVENUE-SAVE-FAILED`: 무엇이 "매출 숫자를 저장하지 못했어요" · 어떻게 "인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요"(design.md 8절)

### 4. 시험 (가짜 숫자·가짜 클라이언트)
- 오늘 11월 1일 → 13달(2026-10부터 2025-10까지 최근 달부터), 다 저장된 달 빠짐, 이번 달 진행 중이면 어제까지, 한 날만 빠져도 그 달 전체(AC-007.1)
- 보낸 줄의 칸 이름이 정확히 정해 둔 것(`chart`·`name`·`hospital_id` 없음), 순서 delete → insert(코드) → upsert(날), 코드 넣기 실패 → 날 upsert 없음·`E-REVENUE-SAVE-FAILED`, 첫 날이 1일 아님 → 저장 없이 `E-REVENUE-SAVE-FAILED`(AC-007.2)
- 달 셋 가운데 둘째가 `E-BIT-READ-FAILED` → 첫째·셋째 저장, `failed`에 둘째. 둘째가 `E-BRIDGE-DISCONNECTED` → 거기서 `stopped`. `onProgress` 순서, `months` 하나만, 옛 도우미 → `helperOld`, 옛 확장 `E-BRIDGE-REJECTED` → `extensionOld`(AC-007.3)
- 읽기 범위·`fetchedAt`(AC-007.4) · `ERRORS['E-REVENUE-SAVE-FAILED']`(AC-007.5)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-007.1 하루만 빠져도 그 달 전체를 다시 가져온다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/revenue/sync.test.ts src/lib/storage/revenue.test.ts src/lib/errors.test.ts   # AC-007.1~AC-007.5
python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green
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
3. 결과에 따라 `phases/revenue-2-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 받은 도우미 답 객체를 그대로(`...row`) 저장하지 마라. 이유: 정해 둔 칸만 서버로 간다. 검사를 지났더라도 새 객체로 만든다(CLAUDE.md 보안 규칙)
- 실제 Supabase에 시험 줄을 쓰지 마라. 이유: 이 step 시험은 가짜 클라이언트로 한다. 실제 표는 사용자 OK 뒤 E2E(TASK-11)에서만
- 가져오기를 여러 달 동시에 돌리지 마라. 이유: 도우미는 한 번에 한 명령씩 처리하고, 비트 DB에 부담을 준다. 차례로 한다
- 저장 실패 때 Supabase 오류 글을 화면·기록에 넘기지 마라. 이유: 오류 내용은 그대로 보이지 않는다(CLAUDE.md). 번호만
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
