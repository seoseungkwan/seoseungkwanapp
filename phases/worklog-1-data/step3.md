# Step 3: db-table

> **TASK-4** 서버 표 `worklog_days` · **REQ-004** · AC-004.1 ~ AC-004.7
> Phase 1 `worklog-1-data` · Step 3 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-004에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-004.1**: 표 칸이 정해 둔 목록과 정확히 같다(`hospital_id`·`work_date` 기본 열쇠, 인원 2·수입 8·지출 4·비고 5, `updated_at`). 업무사항 칸 없음
- **AC-004.2**: anon은 읽기·쓰기 모두 거부
- **AC-004.3**: 승인된 병원 사용자는 내 줄 넣기·읽기·`insert … on conflict (hospital_id, work_date) do update` 고치기 됨
- **AC-004.4**: 다른 병원 줄은 안 보이고, 그 병원 id로 넣기·내 줄을 그 병원으로 옮기기는 거부
- **AC-004.5**: 승인 대기·거절 병원 사용자는 아무 줄도 못 보고 못 씀
- **AC-004.6**: 음수·인원 99,999 초과·금액 999,999,999,999 초과·빈 글자 비고·101자 비고 거부, null은 됨
- **AC-004.7**: 지우기·`updated_at` 직접 넣기 거부, 고치면 `updated_at`이 바뀜

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-004
- `/specs/worklog/design.md` — 8절(DB 표·권한·적용은 사용자 OK), 5절(칸 표)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/supabase/migrations/20261028000000_auth.sql` — 표 만들기·revoke·칸 단위 grant·정책 쓰는 법
- `/supabase/rls.test.ts` — PGlite에 Supabase 흉내(역할·auth 스키마·기본 권한)와 사용자 바꿔 가며 SQL 돌리는 법
- `/src/types/worklog.ts` — `WORKLOG_COLUMNS`(DB 칸 이름, Step 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000000_worklog.sql`
  - `supabase/worklog.rls.test.ts`
- Tests:
  - `supabase/worklog.rls.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **DB 표는 RLS를 켜고, 먼저 `anon`·`authenticated` 권한을 모두 거둔 뒤 필요한 것만 준다**(CLAUDE.md 보안 규칙). 사용자가 자기 병원 밖 줄을 보거나 쓸 수 없다는 것을 시험으로 증명한다
- **실제 Supabase에 이 SQL을 실행하지 않는다.** 붙여 넣기는 사용자 OK 뒤 운영자가 SQL 편집기에서 한다(design.md 8절). 이 step은 파일과 PGlite 시험만
- 표에 업무사항(글 칸)을 두지 않는다. 비고 다섯 칸만 글자다
- `service role`·`security definer` 함수를 쓰지 않는다(방아쇠 함수는 `security invoker` 기본 + `search_path = ''`)

## 작업

### 1. `supabase/migrations/20261101000000_worklog.sql`
design.md 8절 그대로. 머리 주석은 auth migration처럼(무엇·실행하는 법·권한 요약).
- 칸 19개는 `WORKLOG_COLUMNS` 순서와 이름 그대로. 인원 `integer check (… between 0 and 99999)`, 금액 `bigint check (… between 0 and 999999999999)`, 비고 `text check (char_length(…) between 1 and 100)`
- `enable row level security` → `revoke all … from anon, authenticated` → `grant select` · `grant insert (hospital_id, work_date, <19칸>)` · `grant update (hospital_id, work_date, <19칸>)` to authenticated. delete·`updated_at`에는 권한 없음
- 정책 셋: select `using`, insert `with check`, update `using` + `with check` — 모두 `hospital_id = (select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved')`
- `public.worklog_days_touch()` 방아쇠 함수 + `before update` 방아쇠

### 2. `supabase/worklog.rls.test.ts`
- `rls.test.ts`의 `SUPABASE_MOCK`·사용자 바꾸기 방식을 이 파일 안에 그대로 옮긴다(그 파일은 고치지 않는다). auth migration을 먼저, 이 migration을 다음에 실행
- 준비: 병원 A(승인)·B(승인)·C(대기)·D(거절) 줄을 운영자로 넣는다
- AC-004.1: `information_schema.columns`의 칸 이름·종류 목록이 정해 둔 목록과 같다. `memo`·`work_note`·`업무` 같은 칸이 없다
- AC-004.3: A 사용자로 insert → select → 같은 열쇠로 `insert … on conflict (hospital_id, work_date) do update set <보낸 칸 모두 excluded>`(PostgREST upsert와 같은 모양)
- AC-004.4·004.5·004.6·004.7: 거부는 오류 코드(`42501` 권한·RLS, `23514` check)로 본다
- PGlite 첫 실행이 느리니 시험 시간 제한을 넉넉히(`rls.test.ts`의 `SLOW`)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/worklog.rls.test.ts   # AC-004.1~AC-004.7
npx vitest run supabase/rls.test.ts           # auth migration 시험 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-004.1 ~ AC-004.7가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `supabase/migrations/20261028000000_auth.sql`·`supabase/rls.test.ts`를 고치지 마라. 이유: 이미 운영에 들어간 migration이고 다른 갈래도 그대로 쓴다
- `public.my_hospital_id()` 같은 공용 함수를 만들지 마라. 이유: 사전점검 2단계 migration이 같은 이름을 `create function`으로 만들 예정이라 붙여 넣기가 실패한다(design.md 8절)
- delete 권한·정책을 주지 마라. 이유: 화면에 지우기가 없고, 빈 칸 저장으로 충분하다(AC-004.7)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
