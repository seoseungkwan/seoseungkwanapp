# Step 1: db-rls

> **TASK-4** DB 표 둘과 쓰기 함수 둘 (RLS) · **REQ-504** · AC-504.1 ~ AC-504.7
> Phase 2 `ai-report-2-parts` · Step 1 — `specs/ai-report/tasks.md` 머리말 '할 순서'
> 명세 `specs/ai-report/`는 사용자가 승인한 뒤에만 이 step을 돌린다. 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **병렬 가능**: 이 phase의 Step 0~4는 서로의 결과를 쓰지 않고 수정 범위가 겹치지 않아 동시에 돌 수 있다. 같은 폴더에서 동시에 돌면 `npm run build`(`.next/`를 같이 쓴다)가 부딪힌다 — 오케스트레이터가 step마다 따로 worktree를 주거나, `npm run build`·`npm test`는 한 번에 하나만 돌린다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/ai-report/requirements.md`의 REQ-504에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-504.1**: `anon`이 `ai_reports`·`ai_usage`를 읽거나 쓰거나 두 함수를 부르면 모두 거부
- **AC-504.2**: 승인된 병원 사용자 A가 `save_ai_report('2026-10', 리포트, 지문, 모델)` → A 병원 2026-10 줄 하나. 같은 달로 다시 부르면 줄은 하나 그대로이고 내용·지문·모델·`created_at`이 새 값
- **AC-504.3**: 다른 병원 사용자 B는 A의 줄이 보이지 않는다. 관리자도 남의 줄을 보지 못한다
- **AC-504.4**: 승인 대기·거절 병원 사용자, 병원 없는 사용자가 두 함수를 부르면 거부되고 줄이 생기지 않는다
- **AC-504.5**: 로그인한 사용자가 두 표에 insert·update·delete를 직접 하면 거부(쓰기는 함수로만)
- **AC-504.6**: `save_ai_report`에 달이 'YYYY-MM'이 아니거나, 리포트가 JSON 객체가 아니거나 32KB를 넘거나, 지문이 소문자 16진수 64자가 아니면 거부
- **AC-504.7**: `add_ai_usage(입력 토큰, 출력 토큰, 비용)`을 승인된 사용자가 두 번 부르면 한국 날짜 기준 이번 달 줄 하나에 횟수 2, 토큰·비용은 두 번의 합. 음수는 거부

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL: DB 표는 모두 RLS, 기본 권한을 먼저 모두 회수, service role 키 없음, 시험으로 증명)
- `/docs/ARCHITECTURE.md` — DB 표
- `/docs/ADR.md` — ADR-004·005·023
- `/specs/ai-report/requirements.md` — REQ-504
- `/specs/ai-report/design.md` — 'DB' (표 두 개 SQL과 함수 설명), '결정과 트레이드오프'의 '쓰기는 DB 함수로만'
- `/specs/ai-report/tasks.md` — 머리말 '모든 TASK 공통', TASK-4
- `/supabase/migrations/20261028000000_auth.sql` (`hospitals`·`admins` 표, `set_hospital_status`의 security definer·`search_path`·errcode·권한 회수 모양을 그대로 따른다)
- `/supabase/rls.test.ts` (PGlite + `SUPABASE_MOCK`, `operator`·`become`·`becomeAnon`·`addHospital`·`addAdmin` 돕는 함수 — 이 파일은 고치지 않고 복사해 쓴다)
- 이전 step에서 만든 파일:
  - `src/types/aiReport.ts` (`SavedReport` — `report` jsonb에 들어갈 `{ partial, summary, cards }` 모양, Phase 1 Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다. 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000000_ai_report.sql`
  - `supabase/aiReport.rls.test.ts`
- Tests:
  - `supabase/aiReport.rls.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **RLS·권한 회수 먼저**: 두 표 모두 `enable row level security`, `revoke all … from anon, authenticated` 뒤 `grant select … to authenticated`만. 읽기 정책은 `hospital_id`가 내(`owner_id = (select auth.uid())`) 병원인 줄만 — **관리자 예외 없음**(auth migration의 hospitals 정책과 다르다) (CLAUDE.md, design 'DB')
- **쓰기는 함수 둘로만**: `security definer` + `set search_path = ''`, 안의 이름은 모두 `public.`·`auth.`로 적는다. 함수 안에서 내 병원이 `approved`인지 확인하고, 아니면(대기·거절·병원 없음) `42501`로 멈춘다
- **함수 실행 권한**: `revoke all on function … from public, anon, authenticated` 뒤 `grant execute … to authenticated`만 (auth migration과 같은 모양)
- **service role 키 없음**: 운영자가 SQL 편집기로 실행하는 파일이다. 앱·CLI가 실행하지 않는다(이번에는 실행하지 않아도 된다 — design 'DB')
- **가짜 자료만**: 시험 사용자·병원은 `rls.test.ts`처럼 가짜 uuid·`@fake.test` 메일·'가짜병원'

## 작업

### 1. migration (`supabase/migrations/20261101000000_ai_report.sql`)
design.md 'DB'의 SQL을 그대로 쓴다. 머리 주석은 auth migration처럼(무엇·누가 실행·권한 요약).
```sql
create table public.ai_reports ( hospital_id uuid … , month text … check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  report jsonb not null check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 32768),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  model text not null check (char_length(model) between 1 and 100),
  created_at timestamptz not null default now(), primary key (hospital_id, month) );
create table public.ai_usage ( hospital_id … , month … , calls integer … , input_tokens bigint … ,
  output_tokens bigint … , cost_micro_usd bigint … , updated_at … , primary key (hospital_id, month) );

create function public.save_ai_report(p_month text, p_report jsonb, p_input_hash text, p_model text) returns void
-- insert … on conflict (hospital_id, month) do update set report, input_hash, model, created_at = now()
create function public.add_ai_usage(p_input bigint, p_output bigint, p_cost bigint) returns void
-- month = to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'). 음수 → errcode 22023
-- insert … on conflict do update set calls = calls + 1, 토큰·비용 더하기, updated_at = now()
```
- 인자 이름(`p_month`·`p_report`·`p_input_hash`·`p_model`, `p_input`·`p_output`·`p_cost`)은 이 이름 그대로 둔다 — 다음 phase의 `src/app/api/ai/store.ts`가 `rpc('save_ai_report', { p_month, … })`로 부른다
- AC-504.6의 거부는 표의 check 제약으로 충분하다(함수에서 미리 막아도 된다). 함수가 달·지문 모양을 먼저 보면 오류 번호 `22023`을 쓴다

### 2. 시험 (`supabase/aiReport.rls.test.ts`)
- `rls.test.ts`의 `SUPABASE_MOCK`·돕는 함수를 이 파일에 복사한다. `beforeAll`에서 auth migration → 이 migration 차례로 `exec`
- 사용자: A(승인 병원), B(다른 승인 병원), 대기·거절 병원 사용자, 병원 없는 사용자, 관리자(병원 없음 또는 자기 병원)
- AC-504.1: `becomeAnon()`으로 두 표 select·insert, 두 함수 호출 → 모두 거부
- AC-504.2: A가 저장 → 줄 하나. 다시 저장(다른 리포트·지문·모델) → 줄 하나, 값이 새 것, `created_at`이 처음보다 뒤(같은 트랜잭션 시각이 겹치지 않게 처음 값을 운영자로 과거로 돌려 두고 비교해도 된다)
- AC-504.3: B·관리자로 select → A의 줄 0개
- AC-504.4: 대기·거절·병원 없음 → 두 함수 거부(`42501`), 운영자로 보면 줄 0개
- AC-504.5: A가 두 표에 insert·update·delete 직접 → 거부
- AC-504.6: 달 `2026-13`·`2026-1`, 리포트 `'[]'::jsonb`·`'"x"'::jsonb`, 32KB 넘는 객체, 지문 대문자·63자 → 거부
- AC-504.7: 두 번 부르기 → 이번 달(`to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM')`과 같은 달) 줄 하나에 `calls = 2`, 합. 음수 하나라도 → 거부(`22023`)
- PGlite 첫 실행이 느리므로 `rls.test.ts`처럼 시간 제한을 넉넉히(`{ timeout: 30_000 }`)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-504.3 다른 병원 사용자와 관리자는 A의 리포트를 보지 못한다', …)`
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다(migration 파일이 아직 없다). RED 기록 전에는 migration 파일을 만들 수 없다(훅이 막는다). 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

### 이 PC(윈도우)에서
- 하네스 도구는 `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/<도구>`로 부른다(`python3 ~/.claude/...` 대신)
- `execute.py`는 이 PC에서 쓰지 않는다(리눅스 전용 신호를 쓴다). 오케스트레이터(메인 세션)가 step마다 새 세션을 열어 이 파일을 준다. 이 세션은 이 step 하나만 하고 끝낸다
- 시험에서 파일을 읽어 줄로 나눌 때는 늘 `split(/\r?\n/)`를 쓴다(이 PC의 git은 파일을 CRLF로 꺼낼 수 있다). migration 파일은 통째로 `exec`하므로 CRLF여도 된다
- `npm test` 기준선: 이 PC는 .NET 10이 없어 46개가 이미 실패한다(2026-11-01). 새 실패가 없어야 한다(실패 수가 46개를 넘지 않고, 이 step의 시험은 모두 통과)

## Acceptance Criteria

```bash
npx vitest run supabase/aiReport.rls.test.ts
npx vitest run supabase/rls.test.ts supabase/setup-sql.test.ts   # 기존 DB 시험 그대로
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-4 --expect green
npm run lint -- --max-warnings=0
npm run build   # 같은 폴더에서 다른 step과 동시에 돌고 있으면 한 번에 하나만
npm test        # 실패는 기준선 46개뿐
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/sdd status ai-report
```

- 위 커맨드가 모두 에러 없이 끝나야 한다(`npm test`는 기준선 실패만 남아야 한다)
- `sdd status ai-report`에서 AC-504.1 ~ AC-504.7이 이 TASK의 시험과 이어져 보여야 한다
- `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/verify`는 기준선 실패 때문에 test 단계에서 멈출 수 있다. 그때는 실패 목록이 기준선 그대로인지 보고 summary에 적는다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (migration은 `supabase/migrations/`)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (RLS 켬, 권한 회수 먼저, 관리자 예외 없음, service role 없음)
3. 결과에 따라 `phases/ai-report-2-parts/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python -X utf8`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막는다). 다른 칸과 다른 step은 건드리지 않는다. 같은 phase의 다른 step도 이 파일을 고칠 수 있으니 읽은 바로 뒤에 자기 step 칸만 바꿔 쓴다
- `summary`는 오케스트레이터가 다음 step 프롬프트에 그대로 전달한다. 만든 파일, 두 함수의 이름·인자 이름·오류 번호를 한 줄에 담는다

## 금지사항

- `supabase/rls.test.ts`·`supabase/migrations/20261028000000_auth.sql`을 고치지 마라. 이유: 기존 로그인·가입 DB와 그 시험이다. 수정 범위 밖이다(흉내는 복사해 쓴다)
- 관리자에게 남의 AI 리포트·사용량을 읽는 정책을 주지 마라. 이유: 남의 AI 리포트는 볼 일이 없다(design 'DB')
- `authenticated`에 두 표의 insert·update·delete 권한을 주지 마라. 이유: 쓰기는 승인 확인을 하는 함수 둘로만 한다(AC-504.5)
- 함수에 `set search_path = ''`를 빼거나 이름을 스키마 없이 쓰지 마라. 이유: security definer 함수가 남의 스키마에 속을 수 있다
- `p_hospital_id` 같은 병원 인자를 받지 마라. 이유: 병원은 `auth.uid()`로만 정한다 — 남의 병원에 쓰지 못하게
- service role 키나 그 키를 쓰는 길을 만들지 마라. 이유: CLAUDE.md 보안 규칙
- 화면 코드(`src/app/(app)/**`·`src/components/**`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤 화면 명세가 한다
- 기존 테스트를 깨뜨리지 마라. 이유: 기준선 실패(46개)가 늘면 끝 조건을 못 넘는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 오케스트레이터(메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
