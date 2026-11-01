# Step 3: revenue-e2e

> **TASK-11** E2E · **REQ-011** · AC-011.1 ~ AC-011.4
> Phase 3 `revenue-3-screen` · Step 3 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-011에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-011.1**: 승인된 시험 계정·확장 없는 브라우저로 `/revenue` 390·768·1440 → 저장된 줄 없으면 '비트 PC 연결 필요', 가로 스크롤 없음(AC-009.5도 이름에). 시작 전에 시험 계정 매출 줄을 지운다(다시 돌려도 같다)
- **AC-011.2**: 가짜 확장(시험 코드가 넣는 가짜 `chrome.runtime`, 가짜 숫자)으로 열기 → 숫자가 보이고, 가로챈 나간 요청은 `sales_days`·`sales_codes`뿐, 본문 칸은 정해 둔 것뿐, 차트번호·이름·전화번호·주민번호·파일 이름 모양 없음
- **AC-011.3**: 같은 계정 390에서 다시 열기 → 저장된 숫자·"의원 PC에서 …에 가져온 숫자예요", [다시 가져오기] 없음
- **AC-011.4**: 저장 뒤 같은 계정으로 `sales_days`·`sales_codes` 줄을 다시 읽기 → 칸 이름은 정해 둔 것뿐, 값에 차트번호·이름·전화번호·주민번호·파일 이름 모양 없음. 끝나면 시험 계정 매출 줄 지우기

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 3절, 6절
- `/docs/ADR.md` ADR-017(E2E 방식)
- `/playwright.config.ts`, `/e2e/config.ts`, `/e2e/support.ts`, `/e2e/lib/session.ts`(세션 쿠키로 로그인), `/e2e/preflight.ts`
- `/src/lib/bridge/client.ts`(확장과 주고받는 봉투 모양 — 가짜 runtime이 흉내 낼 것)
- 이전 step에서 만든 파일:
  - `src/app/(app)/revenue/page.tsx`·`src/components/revenue/*` (Phase 3 Step 1·2)
  - `supabase/migrations/20261101000400_revenue.sql` (Phase 2 Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `e2e/revenue.spec.ts`
  - `e2e/lib/revenueFakeBridge.ts`
  - `e2e/lib/revenueFakeBridge.test.ts`
- Tests:
  - `e2e/lib/revenueFakeBridge.test.ts`
  - `e2e/revenue.spec.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **시험 로그인은 시험 코드만**: 앱 코드에 시험용 로그인·우회 길을 만들지 않는다. 세션 쿠키는 `e2e/lib/session.ts`로 넣는다. 시험 계정은 `.env.local`에만 (CLAUDE.md)
- **산출물에 비밀 없음**: trace·스크린샷·네트워크 기록에 쿠키·토큰을 남기지 않는다(`trace: 'off'`)
- **먼저 확인**: 실제 Supabase에 `20261101000400_revenue.sql`이 붙어 있고 `.env.local`에 E2E 값이 있어야 한다. 없으면 `blocked`(사유: "매출 표를 실제 Supabase에 붙여 넣기·E2E 값 필요 — 사용자 할 일")

## 작업

### 1. 가짜 통로 (`e2e/lib/revenueFakeBridge.ts`)
- `page.addInitScript`로 넣을 글자를 만드는 순수 함수: `window.chrome.runtime.connect(EXTENSION_ID)`가 가짜 포트를 주고, `hello` → 버전 맞는 답, `revenue.days` → 가짜 숫자(정해 둔 칸만, 차트번호 없음) 답. 확장 ID·protocol·버전은 `src/lib/bridge/commands.json`·`versions.ts`에서 읽는다
- `revenueFakeBridge.test.ts`(vitest): 만든 글자의 답이 `isRevenueDays`를 통과, 칸 이름이 정해 둔 것뿐

### 2. `e2e/revenue.spec.ts` (Playwright)
- 시작 전 정리: 시험 계정 세션으로 `sales_days`·`sales_codes`의 내 줄을 지운다(RLS의 지우기 권한, AC-004.2). 확장 없음 390·768·1440: 줄 없음 → '비트 PC 연결 필요', `scrollWidth <= innerWidth`(AC-011.1·AC-009.5)
- 가짜 통로 1440: 가져오기 → 숫자 보임. `page.on('request')`로 나간 요청을 모두 가로채 Supabase 요청의 표 이름이 `sales_days`·`sales_codes`뿐이고 본문 칸이 정해 둔 것뿐인지, 본문에 차트번호 모양(6자리 이상 숫자만인 글자)·이름(`name`·`chart` 칸)·전화번호(`010-…`)·주민번호(6자리-7자리)·파일 이름(`.xls`·`.xlsx`·`.csv`) 모양이 없는지(AC-011.2)
- 같은 계정 390 다시: 저장된 숫자 + "의원 PC에서" + [다시 가져오기] 없음(AC-011.3)
- 저장된 줄 다시 읽기: 시험 계정 세션으로 `sales_days`·`sales_codes`를 select해 칸 이름과 값을 같은 금지 모양으로 검사(AC-011.4, 갈래 규칙 C7)
- 끝나면 시험 계정의 `sales_days`·`sales_codes` 줄 지우기(시험 계정 세션으로, RLS 안에서)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-011.2 나간 요청은 sales_days와 sales_codes뿐 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run e2e/lib/revenueFakeBridge.test.ts   # 가짜 통로
npm run e2e -- e2e/revenue.spec.ts          # AC-011.1~AC-011.4 (실제 Supabase + 시험 계정, .env.local 필요)
python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green
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
3. 결과에 따라 `phases/revenue-3-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 앱 코드(`src/`)에 시험용 분기·가짜 통로를 넣지 마라. 이유: 시험용 길이 운영에 남는다(CLAUDE.md 보안 규칙)
- 시험 계정이 아닌 줄을 지우지 마라. 이유: 실제 Supabase다. 시험 계정 세션의 RLS 안에서만 지운다
- 가짜 숫자에 실제처럼 보이는 차트번호·이름을 넣지 마라. 이유: 금지 자료가 나가지 않는 것을 증명하는 시험이다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
