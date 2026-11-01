# Step 0: stats-tables

> **TASK-6** 통계 숫자 저장 표 (DB) · **REQ-506** · AC-506.1 ~ AC-506.5
> Phase 2 · 저장과 처방 추세 `stats-2-save` · Step 0 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-506(통계 숫자 저장 표 (`stats_months` · `stats_days` · `stats_coverage`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-506.1**: Given 마이그레이션 `supabase/migrations/20261101000200_stats.sql`을 PGlite에서 인증 마이그레이션 뒤에 돌림, When 표를 보면, Then `public.stats_months`(`hospital_id`·`month`·`partial`·`source`·`payload`·`updated_at`, 기본 키 `hospital_id + month`), `public.stats_days`(같은 칸, `month` 대신 `day date`), `public.stats_coverage`(`hospital_id`·`from_day`·`to_day`·`source`·`created_at`, 불러온 기간 한 줄씩)가 있고 RLS가 켜져 있으며 `anon` 권한이 하나도 없다. `public.my_hospital_id()`는 여러 브랜치가 같이 쓰는 글자 그대로(`create or replace`, security definer, `search_path = ''`)이고, 다른 브랜치 마이그레이션이 같은 함수를 먼저 만들어 두었어도 이 마이그레이션이 오류 없이 돈다
- **AC-506.2**: Given 승인된 병원 A의 사용자, When 읽고 넣고 고치면, Then 자기 병원 줄만 보이고, 넣을 때 `hospital_id`는 DB가 정한다(사용자는 그 칸을 보낼 수 없다). 지우기는 안 되고, `stats_coverage`는 고치기도 안 된다(넣기만). 승인 대기·거절된 병원의 사용자와 다른 병원 B의 사용자는 A 줄을 읽지도 넣지도 고치지도 못한다
- **AC-506.3**: Given `payload`, When 넣거나 고치면, Then jsonb 객체이고 `schemaVersion`이 2이며 `payload.month`(또는 `day`)·`partial`이 칸 값과 같고, 글자 크기가 65,536바이트 이하이고, `source`가 'bit'·'file' 가운데 하나일 때만 들어간다. 열쇠가 빠진 payload(`{}`, `schemaVersion`·`month`·`day`·`partial` 가운데 하나 없음)는 거부한다(제약이 NULL로 통과하지 않는다). `stats_coverage`는 `from_day ≤ to_day`이고 800일 이하일 때만 들어간다
- **AC-506.4**: Given 완전한 줄(`partial` false), When 같은 병원·같은 달(날)을 덜 덮인 줄(`partial` true)로 고치면, Then 옛 줄이 그대로 남는다(트리거). 완전 → 완전, 덜 → 완전, 덜 → 덜은 바뀌고 `updated_at`이 새 시각이다. PostgREST upsert 꼴(`insert … on conflict (hospital_id, day) do update set …`)이 사용자 역할로 돈다
- **AC-506.5**: Given 세 표의 칸, When 보면, Then 환자 번호·차트번호·이름 칸이 없다. 실제 Supabase에 이 SQL을 붙이는 일은 그때 사용자가 허락한 뒤 사용자가 SQL 편집기에서 한다(시험은 PGlite)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-506
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-6(SQL 뼈대), '결정과 트레이드오프'(트리거·`hospital_id` 기본값·덮은 기간 표·표 이름), '다른 작업과 겹치는 파일'
- `/specs/stats/tasks.md` — TASK-6 (수정 범위·메모)
- `/tmp/claude-1000/-home-developer/e95c76cc-42cc-429c-acc9-4833022da887/scratchpad/cross-branch-rules.md`가 있으면 C1·C2·C7 (없으면 design.md TASK-6의 함수 글자가 기준)
- `/supabase/migrations/20261028000000_auth.sql` (권한 회수·RLS·`(select auth.uid())` 방식)
- `/supabase/rls.test.ts` (PGlite로 Supabase 흉내 + 역할 바꿔 보기)
- `/src/types/db.ts`, `/docs/ARCHITECTURE.md` 'DB 표'
- `/src/types/payload.ts`, `/src/lib/payload/validate.ts` (payload 모양)
- 이전 step에서 만든 파일: TASK-2 (저장 모양 선택 칸)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261101000200_stats.sql`
  - `supabase/stats-rls.test.ts`
  - `src/types/db.ts`
  - `docs/ARCHITECTURE.md`
- Tests:
  - `supabase/stats-rls.test.ts`
- TDD: required
- 메모: DB 바꿈 TASK다. 시험은 PGlite에서만 돈다. **실제 Supabase에 붙이는 일은 이 TASK가 하지 않는다** — Phase 2가 끝날 때 사용자에게 SQL 편집기 순서를 채팅으로 드리고 허락을 받는다
- 메모: `docs/ARCHITECTURE.md`는 DB 표의 통계 줄(`months`·`days` → `stats_months`·`stats_days`·`stats_coverage`, 칸·트리거)과 '데이터 흐름'의 통계 줄만 고친다
- 메모: `my_hospital_id()`는 cross-branch C1 글자 그대로다. 다른 브랜치가 먼저 만든 경우를 시험한다

## 꼭 지킬 규칙 (CRITICAL)

- **DB 규칙**: 표는 RLS를 켜고, 기본 권한을 먼저 모두 회수(revoke)한 뒤 필요한 것만 준다(Supabase는 새 표·함수에 `anon`·`authenticated` 권한을 기본으로 준다). 사용자는 자기 병원·승인 상태를 바꿀 수 없다. service role 키를 두지 않는다. 같은 효과면 코드 대신 DB 제약 (CLAUDE.md)
- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **비밀값**: Supabase 키·토큰을 코드·시험·출력에 쓰지 않는다. 시험은 가짜 클라이언트만 쓰고 실제 Supabase에 붙지 않는다 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 마이그레이션 (`supabase/migrations/20261101000200_stats.sql`, SQL 편집기에 붙여 넣는 파일)
- design.md TASK-6 뼈대대로: `public.my_hospital_id()`(여러 브랜치가 같이 쓰는 함수 — **design.md 글자 그대로**, `create or replace`·security definer·`search_path = ''`, `revoke … from public, anon` → `grant execute … to authenticated`), `public.stats_months`·`public.stats_days`·`public.stats_coverage`
- 칸 제약: `month` 'YYYY-MM' / `day` date, `partial` boolean, `source in ('bit','file')`, `payload` jsonb 객체 · `payload->'schemaVersion' = '2'` · `payload->'month'|'day'`·`payload->'partial'`이 칸 값과 같음(`to_jsonb`) · `octet_length(payload::text) <= 65536`. 이 묶음 전체를 `( … ) is true`로 감싸 열쇠가 없어 NULL이 되면 거부한다(AC-506.3). `stats_coverage`: `from_day <= to_day`, 800일 미만
- 권한: `revoke all on table … from anon, authenticated`. `stats_months`·`stats_days`: `grant select`, `grant insert (month|day, partial, source, payload)`, `grant update (month|day, partial, source, payload)`(PostgREST upsert는 보낸 칸 모두를 `DO UPDATE SET`에 넣는다 — 열쇠 칸도). `stats_coverage`: `grant select`, `grant insert (from_day, to_day, source)`. `hospital_id`는 어느 권한에도 없다. delete 없음
- RLS: select·insert(`with check`)·update(`using`·`with check`) 모두 `hospital_id = (select public.my_hospital_id())`
- 트리거 함수 `public.stats_keep_complete()`(통계 이름, definer 아님, `set search_path = ''`), before update: `old.partial = false and new.partial = true`면 `return old`, 아니면 `new.updated_at := now(); return new`
- 맨 위 주석: 무엇을 왜 · "실제 Supabase에는 사용자가 허락한 뒤 SQL 편집기에서 붙인다"

### 2. 모양 (`src/types/db.ts`에 더함)
```ts
export type StatsSourceColumn = 'bit' | 'file'
export type StatsMonthRow = { hospital_id: string; month: string; partial: boolean; source: StatsSourceColumn; payload: unknown; updated_at: string }
export type StatsDayRow = { hospital_id: string; day: string; partial: boolean; source: StatsSourceColumn; payload: unknown; updated_at: string }
export type StatsCoverageRow = { hospital_id: string; from_day: string; to_day: string; source: StatsSourceColumn; created_at: string }
```

### 3. 시험 (`supabase/stats-rls.test.ts`, PGlite)
- `rls.test.ts`의 Supabase 흉내를 같은 방식으로 두고 인증 마이그레이션 → 통계 마이그레이션을 돌린다(`rls.test.ts`는 고치지 않는다)
- AC-506.1: 세 표·RLS·anon 권한 없음, 그리고 **다른 브랜치가 `my_hospital_id()`를 같은 글자로 먼저 만든 DB**에서도 통계 마이그레이션이 오류 없이 돈다
- AC-506.2: A 승인·A 대기·A 거절·B 사용자 읽기·넣기·고치기·지우기, `hospital_id`를 보내면 권한 거부, `stats_coverage` 고치기 거부
- AC-506.3: 제약마다 넣기 실패, **열쇠가 빠진 payload**(`{}`, `schemaVersion`만 없음, `partial`만 없음, `day`만 없음) 거부(달·일 표 둘 다)
- AC-506.4: 완전 → 덜이면 옛 줄 그대로, 나머지 셋은 바뀜 + `updated_at`, PostgREST 꼴 `insert … on conflict (hospital_id, day) do update set day = excluded.day, partial = excluded.partial, source = excluded.source, payload = excluded.payload`가 사용자 역할로 돈다
- AC-506.5: 칸 목록에 환자 칸 없음

### 4. 문서 (`docs/ARCHITECTURE.md`)
- 'DB 표'의 `months`·`days` 줄을 `stats_months`·`stats_days`·`stats_coverage`(칸·트리거 한 줄)로, '데이터 흐름' 통계 줄의 `(예정) lib/storage`를 지금 모양으로

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/stats-rls.test.ts supabase/rls.test.ts supabase/setup-sql.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-506.1 ~ AC-506.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-2-save/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 실제 Supabase에 SQL을 붙이거나(SQL 편집기·CLI·API) 키를 쓰지 마라. 이유: DB 바꿈은 그때 사용자의 허락이 필요하다(specs/stats/tasks.md TASK-6)
- `my_hospital_id()` 글자를 바꾸지 마라(이름·본문·권한). 이유: 다른 브랜치가 같은 글자를 쓴다 — 다르면 합칠 때 나중 것이 앞 것을 덮어 뜻이 바뀐다
- 인증 마이그레이션(`20261028000000_auth.sql`)·`rls.test.ts`를 고치지 마라. 이유: 이미 운영 DB에 붙은 파일이다
- delete 권한·정책을 주지 마라, `hospital_id`를 사용자가 넣게 하지 마라. 이유: 남의 병원 줄을 만들거나 지우는 길이 없어야 한다(AC-506.2)
- payload 안 모양을 DB에서 다시 검사하려고 큰 함수를 만들지 마라. 이유: 모양 검사는 `validate.ts` 한 곳이고, DB는 열쇠 몇 개·크기만 본다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 (`docs/ARCHITECTURE.md`의 정한 두 줄은 이 step 범위다). 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
