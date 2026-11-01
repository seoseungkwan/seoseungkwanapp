# Step 1: bit-column

> **TASK-15** 비트 칸 표시 저장 · **REQ-015** · AC-015.1 ~ AC-015.2
> Phase 4 `worklog-4-bitfill` · Step 1 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-015에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-015.1**: 새 migration이 `bit_fields text[] not null default '{}'`(채울 수 있는 DB 칸 이름 열 개의 부분 집합만) 더함
- **AC-015.2**: 승인 사용자 upsert에 `bit_fields` 됨, 다른 규칙은 REQ-004 그대로

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-015
- `/specs/worklog/design.md` — 20-4절, 8절
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/supabase/migrations/20261101000100_worklog.sql`·`/supabase/worklog.rls.test.ts` (Phase 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000110_worklog_bit_fields.sql`
  - `supabase/worklog.rls.test.ts`
- Tests:
  - `supabase/worklog.rls.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **실제 Supabase에 실행하지 않는다**(사용자 OK). 파일과 PGlite 시험만
- `alter table … add column`과 칸 권한(`insert`·`update`의 `bit_fields`)만 더한다. RLS 정책(`my_hospital_id()`)·다른 칸·공용 함수는 그대로(공용 함수를 다시 만들지 않는다)
- TASK-4 migration 파일은 고치지 않는다(이미 붙여 넣었을 수 있다)
- **합치기·배포 관문**: 이 step 뒤로 읽기·쓰기가 `bit_fields`를 쓴다. 사용자가 `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣기 전에는 Phase 4를 main에 합치거나 배포하지 않는다(tasks.md 머리말). summary에 이 관문을 적는다

## 작업

- design.md 20-4절 SQL. `check` 목록은 열 칸(`new_patients`·`return_patients`·`total_fee`·`claim_amount`·`cash_in`·`card_in`·`transfer_in`·`local_currency_in`·`unpaid_new`·`unpaid_paid`) — 지금 채우지 않는 미수발생·지역화폐도 나중 계약을 위해 받는다
- 시험: auth → worklog → 이 파일 차례로 실행. 기본값 `{}`, 목록 밖 이름(`'memo'`·`'spend_cash'`) 거부, 승인 사용자 upsert 됨, `bit_fields`를 SET에 넣지 않은 upsert는 저장된 `bit_fields`를 바꾸지 않음, 다른 병원·anon 거부 그대로

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/worklog.rls.test.ts   # AC-015.1~AC-015.2 + REQ-004 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-015.1 ~ AC-015.2가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-4-bitfill/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `spend_*`·비고·업무사항 이름을 `check` 목록에 넣지 마라. 이유: 지출·업무사항은 손으로만(사용자)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
