# Step 0: revenue-tables

> **TASK-4** 매출 표 (migration) · **REQ-004** · AC-004.1 ~ AC-004.6
> Phase 2 `revenue-2-numbers` · Step 0 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-004에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-004.1**: `supabase/migrations/20261101000400_revenue.sql`을 PGlite에서 auth migration 뒤에 실행 → `sales_days`(`hospital_id`·`day`·`visits`·`new_patients`·`return_visits`·`patients_to_date`·`total`·`insurer`·`noncovered`·`copay`·`other_total`·`cash`·`card`·`transfer`·`receivable_in`·`unconfirmed`·`fetched_at`)·`sales_codes`(`hospital_id`·`month`·`code`·`name`·`count`·`amount`·`fetched_at`)·`rx_groups`(`id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`), 기본 키, RLS 켜짐. 칸 목록은 정확히 이것뿐
- **AC-004.2**: anon 거부. authenticated는 승인된 자기 병원 줄만: `sales_days` 읽기·넣기·고치기·지우기, `sales_codes` 읽기·넣기·지우기. 남의 병원 줄 안 보임·안 지워짐, `hospital_id` 직접 넣기·바꾸기 거부, 승인 대기·거절은 아무것도 못 함
- **AC-004.3**: DB 제약: 0 이상 정수, `unconfirmed`면 금액 아홉 칸 모두 null(아니면 모두 있음), `day` ≥ 2000-01-01, `month`는 1일, `code` 모양, `sales_codes.name` 1~100자 또는 null, `rx_groups.name` 앞뒤 공백 없는 1~30자·제어 문자 없음·숫자 6개 이상 이어지지 않음·병원 안에서 겹치지 않음, `rx_groups.codes` 1,000개 이하·`null` 칸 없음·모양 맞음·`_REST` 없음, `sort_order` 0~999
- **AC-004.4**: `hospital_id`를 빼고 넣으면 `public.my_hospital_id()`가 채우고, 고치면 `fetched_at`이 DB 시각으로 바뀐다. 다른 갈래가 같은 글자의 `my_hospital_id()`를 먼저 만든 DB에서도 migration이 오류 없이 된다
- **AC-004.5**: `rx_groups`: 승인된 자기 병원 줄만 읽기·넣기·고치기·지우기, `id`·`hospital_id`·`updated_at`은 DB가 채움(칸 권한 없음), 고치면 `updated_at` 바뀜(`public.touch_updated_at()` C1 글자 그대로, 이미 있어도 됨)
- **AC-004.6**: DB 함수 `public.save_rx_groups(groups jsonb)`(호출한 사람 권한, RLS 그대로): 한 트랜잭션 안에서 `id` 있는 내 묶음 고치기, `id` 없으면 넣기만(줄은 `id`로만 고름), 목록에 없는 내 묶음 지우기 → 저장된 목록. 하나라도 실패하면 아무것도 안 바뀜, 이름 맞바꾸기·'A 지우고 새 A'는 순서와 상관없이 됨(이름 겹침 검사는 끝에), 남긴 묶음과 같은 이름의 새 묶음은 오류, 남의 `id`는 오류이고 남의 줄 그대로, `groups`가 `null`·배열 아님·50개 넘음이면 거부

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 6절(표 SQL·권한·정책), 11절(`my_hospital_id()` 겹침)
- `/specs/precheck/design.md` — 8-1·8-3절(같은 `my_hospital_id()` 정의와 권한 방식)
- `/supabase/migrations/20261028000000_auth.sql`, `/supabase/rls.test.ts`(PGlite로 Supabase 흉내 내는 법·`SLOW`·사용자 바꾸기)
- 이전 step에서 만든 파일:
  - `src/types/revenue.ts` (칸 이름·코드 모양, Phase 1 Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000400_revenue.sql`
  - `supabase/revenue.rls.test.ts`
- Tests:
  - `supabase/revenue.rls.test.ts`
  - `supabase/rls.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **RLS와 권한 회수**: 두 표 모두 RLS를 켜고, `anon`·`authenticated` 권한을 먼저 모두 거둔 뒤 필요한 것만 칸 단위로 준다. 사용자는 자기 병원·승인 상태를 바꿀 수 없다. 시험으로 증명한다 (CLAUDE.md 보안 규칙)
- **같은 효과면 DB 제약**: 금액 0 이상·확인 필요 짝·달 1일·코드 모양은 CHECK로 막는다 (plan.md §0)
- **실제 Supabase에 붙여 넣지 않는다**: 이 step은 파일과 PGlite 시험만 한다. 붙여 넣기는 사용자 OK를 받은 뒤 운영자가 SQL 편집기에서 한다(design.md 6절). 끝나면 summary에 "실제 Supabase 붙여 넣기 사용자 OK 필요"라고 적는다

## 작업

### 1. migration
- design.md 6절 SQL 그대로: `create or replace function public.my_hospital_id()`(갈래 규칙 C1 글자 그대로) + 실행 권한(`public`·`anon` 회수, `authenticated`만), 트리거 함수 `public.sales_touch_fetched_at()`(실행 권한 모두 회수), `public.touch_updated_at()`(C1 글자 그대로, `create or replace`), CHECK용 `public.rx_group_codes_ok(text[])`(`c is not null`을 같이 본다: `bool_and`는 `null`을 건너뛴다), 표 셋(`sales_days`·`sales_codes`·`rx_groups`, `rx_groups`의 이름 겹침은 `deferrable initially deferred`), 트리거 둘, 저장 함수 `public.save_rx_groups(jsonb)`(호출한 사람 권한, `authenticated`만 실행), `enable row level security`, `revoke all … from anon, authenticated`, 칸 단위 `grant`, 정책(`using`·`with check` = `hospital_id = (select public.my_hospital_id())`)
- 파일 머리 주석: 무엇을 왜(집계 숫자만, 환자 칸 없음), SQL 편집기에 붙여 넣는 순서(auth 다음)

### 2. 시험 (`supabase/revenue.rls.test.ts`, PGlite)
- `rls.test.ts`의 Supabase 흉내(`SUPABASE_MOCK`)와 사용자 바꾸기 방식을 이 파일 안에 그대로 둔다(그 파일은 고치지 않는다). auth migration → 이 migration 순서로 실행
- 사례: 칸 목록이 정확함(`information_schema.columns`, AC-004.1·환자 칸 없음) · RLS 켜짐 · anon 읽기·쓰기 거부 · 승인된 A는 자기 줄만, B 줄 안 보임·못 씀 · 승인 대기·거절 사용자 거부 · `hospital_id` 직접 넣기·바꾸기 거부(칸 권한) · upsert(`on conflict (hospital_id, day) do update`)가 된다 · 금액 음수·소수·글자, `unconfirmed`와 금액 짝 어긋남, `month` 15일, 코드 모양 틀림 거부 · `hospital_id` 빼고 넣으면 내 병원 · 고치면 `fetched_at` 바뀜 · `sales_days`·`sales_codes` 지우기는 내 줄만(B 줄은 그대로, E2E 정리에 쓴다)(AC-004.1~004.4) · 같은 `my_hospital_id()`를 미리 만든 DB(다른 갈래가 먼저 들어간 경우)에서 이 migration 실행 → 오류 없음(AC-004.4, 갈래 규칙 C1)
- `rx_groups` 사례(AC-004.3·004.5): A는 자기 묶음만 읽기·넣기·고치기·지우기, B 묶음 안 보임·안 바뀜, `id`·`hospital_id` 직접 넣기 거부, 같은 이름 두 번 거부, 31자·앞뒤 공백·제어 문자·`900101-1234567`·`01012345678` 같은 이름 거부(`12345` 다섯 자리 숫자는 되고 `123456` 여섯 자리는 거부 — 경계 시험), `codes`에 `null` 칸·`_REST`·모양 틀린 코드·1,001개 거부, 고치면 `updated_at` 바뀜, `touch_updated_at()`을 미리 만든 DB에서도 migration 됨
- `save_rx_groups` 사례(AC-004.6): `null`·`{}`(배열 아님)·51개 → 거부 · 제안 다섯 개(id 없음) 저장 → 다섯 줄 · 다섯 개 가운데 하나의 이름이 31자면 오류이고 표는 그대로(0줄) · 첫 호출 실패 뒤 같은 목록 다시 → 다섯 줄 · 남긴 묶음(id 있음)과 같은 이름의 새 묶음 → 오류이고 표 그대로(이름으로 덮어쓰지 않음) · 목록에서 뺀 묶음 A와 새 묶음 A를 함께(어느 순서든) → 됨 · A↔B 이름 맞바꾸기 됨 · 목록에서 뺀 묶음은 지워짐 · B 병원의 `id`를 넣으면 오류이고 B 줄 그대로 · anon은 실행 못 함
- 기존 `supabase/rls.test.ts`도 그대로 통과해야 한다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.2 남의 병원 줄은 보이지 않는다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/revenue.rls.test.ts   # AC-004.1~AC-004.6
npx vitest run supabase/rls.test.ts           # auth 표 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green
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

- 실제 Supabase(원격)에 접속하거나 SQL을 붙여 넣지 마라. 이유: 운영 DB 변경은 사용자 OK가 먼저다(design.md 6절)
- `hospital_id`에 insert·update 칸 권한을 주지 마라. 이유: 남의 병원 줄을 만들 길이 생긴다(AC-004.2)
- `my_hospital_id()`를 precheck 정의와 다르게 쓰지 마라. 이유: 두 migration이 같은 함수를 만든다. 글자가 같아야 어느 쪽이 먼저 들어가도 같다(design.md 11절)
- 표에 글자 칸(처방명·메모 등)이나 jsonb 칸을 더하지 마라. 이유: 정해 둔 집계 숫자만 저장한다(AC-004.1)
- `supabase/rls.test.ts`·auth migration을 고치지 마라. 이유: 로그인·승인 기능의 시험이다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
