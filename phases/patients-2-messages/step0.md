# Step 0: patients-db

> **TASK-5** 서버 표 — message_templates · contact_counts · **REQ-607** · AC-607.1 ~ AC-607.4
> Phase 2 `patients-2-messages`(문자 문구 · 서버 표) · Step 0 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-607에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-607.1**: auth migration 다음에 실행하면 `message_templates`(kind injection·followup, 이름 1~30, 내용 1~2000, sort_order 0~99)와 `contact_counts`(병원마다 한 줄, 정수 둘 0~100000, 바뀐 시각, 글자·jsonb 칸 없음)가 생기고 `hospital_id`는 `my_hospital_id()` 기본값으로만
- **AC-607.2**: anon·다른 병원·승인 안 된 병원·`hospital_id` 직접 넣기·범위 밖 값은 모두 거부. 승인된 내 병원은 내 줄만 읽고 쓴다(`message_templates`는 지우기도)
- **AC-607.3**: 기본 권한 회수 → `authenticated`에 칸 단위 insert·update(id·hospital_id·updated_at 제외)·select(·delete). 함수는 security definer·search_path ''·public·anon 실행 회수
- **AC-607.4**: 두 번 실행해도, 함수가 이미 있어도 깨지지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-607
- `/specs/patients/design.md` — '서버 표'
- `/specs/patients/tasks.md` — TASK-5
- `/supabase/migrations/20261028000000_auth.sql`(표 `hospitals` 칸 이름·`set_hospital_status`의 권한 회수 방식)
- `/supabase/rls.test.ts`(Supabase 흉내 `SUPABASE_MOCK`·역할 바꾸기·`request.jwt.claims`로 사용자 정하기)
- `/specs/precheck/design.md` 8-1·8-3(같은 표를 처음 설계한 곳, 읽기만)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000000_patients.sql`
  - `supabase/patients.rls.test.ts`
- Tests:
  - `supabase/patients.rls.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **DB 규칙**: 모든 표는 RLS를 켠다. 기본 권한을 먼저 모두 회수(`revoke all … from anon, authenticated`)한 뒤 필요한 것만 칸 단위로 준다(Supabase는 새 표·함수에 `anon`·`authenticated` 권한을 기본으로 준다). 사용자는 `hospital_id`를 직접 넣거나 바꿀 수 없다(DB 기본값으로만). 이 규칙은 PGlite 시험으로 증명한다 (CLAUDE.md 보안 규칙)
- **실제 Supabase는 건드리지 않는다**: 이 step은 파일과 PGlite 시험만 만든다. 실제 Supabase에 붙이는 일은 Phase 끝에 사용자 OK를 받고 운영자가 SQL 편집기로 한다
- **비밀값 금지**: Supabase 키·service role 키를 파일·시험·출력에 넣지 않는다. service role 키는 두지 않는다

## 작업

### 1. migration (`supabase/migrations/20261101000000_patients.sql`)
- design.md '서버 표'의 SQL을 그대로 쓰고 아래를 채운다
  - `my_hospital_id()`·`touch_updated_at()`: `create or replace`. `revoke execute … from public, anon` → `grant execute … to authenticated`
  - 표: `create table if not exists`. `alter table … enable row level security` → `revoke all on table … from anon, authenticated`
  - `message_templates`: `grant select, delete` + `grant insert (kind, name, body, sort_order)` + `grant update (kind, name, body, sort_order)` to authenticated
  - `contact_counts`: `grant select` + `grant insert (followup_left, injection_left)` + `grant update (followup_left, injection_left)` to authenticated
  - 정책(표마다 `drop policy if exists` 뒤 `create policy`): select·insert·update(·delete) 모두 `hospital_id = (select public.my_hospital_id())`(insert는 `with check`, update는 `using`과 `with check`)
  - 트리거: `drop trigger if exists … ; create trigger … before update … execute function public.touch_updated_at()`
  - `hospitals`의 승인 상태 칸 이름·값은 auth migration에서 확인해 맞춘다(design.md는 `owner_id`·`status = 'approved'`로 적었다)
- 맨 위 주석: 무엇을 만드는지, 운영자가 SQL 편집기에 붙인다, 같은 함수를 precheck 설정 표 파일이 함께 쓴다(그래서 `create or replace`)

### 2. 시험 (`supabase/patients.rls.test.ts`, PGlite)
- `rls.test.ts`의 Supabase 흉내를 이 파일에 그대로 옮겨 쓴다(`rls.test.ts`는 고치지 않는다). auth migration → 이 migration 순서로 실행
- AC-607.1: 표·칸·제약(이름 0자·31자, 내용 2001자, kind 다른 값, sort_order 100, 건수 -1·100001·소수·글자 거부). `contact_counts` 칸 종류가 uuid·integer·timestamptz뿐(information_schema로)
- AC-607.2: anon은 select·insert 모두 거부, 승인된 A는 자기 줄만, B는 A 줄을 못 봄·못 고침·못 지움, 승인 안 된 C는 아무 줄도 못 씀, `hospital_id`를 넣는 insert는 권한 오류
- `contact_counts` upsert: supabase-js `upsert(…, { onConflict: 'hospital_id' })`가 만드는 모양(`insert into public.contact_counts (followup_left, injection_left) values (…) on conflict (hospital_id) do update set followup_left = excluded.followup_left, injection_left = excluded.injection_left`)이 승인된 병원에서 되고 두 번째에 값만 바뀐다. `updated_at`이 바뀐다
- AC-607.3: `has_table_privilege`·`has_column_privilege`·`has_function_privilege`로 권한을 본다
- AC-607.4: 이 migration을 두 번 실행해도 오류가 없다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/patients.rls.test.ts   # AC-607.1~AC-607.4
npx vitest run supabase/rls.test.ts supabase/setup-sql.test.ts   # 기존 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-607.1 ~ AC-607.4가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-2-messages/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 실제 Supabase(운영·시험 프로젝트)에 SQL을 실행하지 마라. 이유: DB 변경은 그때 사용자 OK가 필요하다(명세 tasks.md 시작 조건)
- `contact_counts`에 글자·jsonb·날짜 글자 칸을 더하지 마라. 이유: 환자 정보가 글자로 섞여 들어갈 칸을 만들지 않는다(ADR-021)
- `20261028000000_auth.sql`·`rls.test.ts`·`setup-sql.test.ts`를 고치지 마라. 이유: 이미 운영에 붙인 파일과 그 시험이다
- `create function`(or replace 없이)·`create table`(if not exists 없이)·`create policy`(drop 없이)를 쓰지 마라. 이유: 두 번 실행·precheck 파일과 함께 붙이기가 깨진다(AC-607.4)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
