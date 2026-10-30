# Step 5: claim-counts

> **TASK-19** 입력 현황 건수 · 밖에서 보기 · **REQ-019** · AC-019.1 ~ AC-019.6
> Phase 3 `precheck-3-memo` · Step 5 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-19 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-019에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-019.1**: 마이그레이션 `20261030000100_precheck_counts.sql`을 PGlite로 돌리면 `claim_day_counts`·`claim_month_counts`·`contact_counts`의 칸 종류는 `uuid`(병원)·`date`·`integer`·`timestamp with time zone`뿐(글자·jsonb 칸 없음)이고, RLS·권한 회수·내 병원만·`hospital_id` 기본값만 규칙이 REQ-012와 같다
- **AC-019.2**: 음수·100,000 넘는 수·입력 수 > 메모 필요 수·달 첫날이 아닌 `claim_month`를 넣으면 거부
- **AC-019.3**: Worker의 점검·입력 결과로 `dayCounts(view)` → 날짜마다 `{visit_date, need_memo, entered, needs_check, skipped}` 정수만. `lib/storage/claimCounts.ts`는 이 모양 밖의 칸이 있으면 보내지 않는다(검사)
- **AC-019.4**: 불러오기·입력이 끝나 건수가 바뀌었으면 그 날짜 줄을 upsert. 실패하면 메모리에 두고 다음에 바뀔 때·창 초점이 올 때 다시 올리며 `E-COUNTS-FAILED`를 작은 줄로
- **AC-019.5**: 밖에서 보는 건수(`/claim`, 확장 없는 곳·휴대폰)는 날짜별 남은 메모 수(남은 날만)를 그 줄의 마지막 바뀐 시각과 함께. 환자 정보·경고 내용 없음. 올린 건수가 없으면 빈 안내 한 줄
- **AC-019.6**: 서버에 보낸 요청 몸통에는 정해 둔 칸과 정수·날짜만 있고 이름·차트번호·메모 글이 없다(시험)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-019
- `/specs/precheck/design.md` — 8-2절(건수 표 SQL), 8-3절(권한), 7절 표 '밖에서 보는 건수', 15절(건수 올리기 실패)
- `/specs/precheck/tasks.md` — TASK-19 (수정 범위·메모)
- `/supabase/rls.test.ts`, `/supabase/precheck.rls.test.ts` (PGlite 방식)
- `/docs/UI_GUIDE.md` '앱 화면'(빈 상태·폰)
- 이전 step에서 만든 파일:
  - `supabase/migrations/20261030000000_precheck_settings.sql`(`my_hospital_id()`·`touch_updated_at()`), `supabase/precheck.rls.test.ts` (Phase 2 Step 5)
  - `src/lib/storage/claimCounts.ts`(읽기만), `src/components/claim/*`(청구 화면·밖에서 보는 자리) (Phase 2 Step 6)
  - `src/lib/precheck/memoCompare.ts`(`dayMemoCounts`) (Step 2)
  - `src/components/claim/memo/*` (Step 4: 입력 결과)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- 화면 11 '밖에서 보는 건수'(`id="v-outside"` 부분)
- 화면 6 '청구 · 입력 결과'(`id="v-result"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-19)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `supabase/migrations/20261030000100_precheck_counts.sql`
  - `supabase/precheck.rls.test.ts`
  - `src/lib/storage/claimCounts.ts`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/types/db.ts`
  - `src/components/claim/OutsideCounts.tsx`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/components/claim/useCountsUpload.ts`
  - `src/components/claim/useCountsUpload.test.ts`
  - `src/components/claim/ClaimScreen.tsx`
  - `src/app/(app)/claim/page.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `supabase/precheck.rls.test.ts`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/components/claim/useCountsUpload.test.ts`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **서버에는 건수와 설정만**: 건수 표 칸은 `uuid`(병원)·`date`·`integer`·`timestamptz`뿐이고, DB 제약이 0~100,000 정수만 받는다. 이름·차트번호·메모 글·경고 내용을 서버에 보내지 않는다 (ADR-018)
- **RLS와 권한**: 새 표는 RLS를 켜고, `anon`·`authenticated` 권한을 먼저 모두 회수(`revoke all`)한 뒤 design.md 8-3의 것만 준다. `hospital_id`는 DB 기본값(`public.my_hospital_id()`)으로만 들어가고 사용자가 넣거나 바꿀 수 없다. 승인 안 된 병원은 아무 줄도 못 본다. PGlite 시험으로 증명한다 (CLAUDE.md 보안 규칙, design.md 8절)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)

## 작업

### 1. 마이그레이션 (`supabase/migrations/20261030000100_precheck_counts.sql`)
- design.md 8-2 SQL 그대로: `claim_day_counts`(`visit_date`, `need_memo`, `entered between 0 and need_memo`, `needs_check`, `skipped`), `claim_month_counts`(`claim_month` 달 첫날, `incomplete`·`missing`·`flagged`), `contact_counts`(`followup_left`·`injection_left`). 정수는 `between 0 and 100000`
- 권한·정책은 설정 마이그레이션과 같다(RLS → `revoke all` → `select` + 칸 단위 `insert`·`update`, `hospital_id`·`updated_at` 제외). `my_hospital_id()`·`touch_updated_at()`는 이미 있는 것을 쓴다(다시 만들지 않는다)
- 세 표를 지금 모두 만든다. `claim_month_counts`는 TASK-22, `contact_counts`는 TASK-26이 쓴다

### 2. RLS 시험 (`supabase/precheck.rls.test.ts`에 더함)
- 칸 종류가 `uuid`·`date`·`integer`·`timestamptz`뿐(`information_schema.columns`로 확인, AC-019.1), 권한·정책(AC-019.1), 제약 거부 사례(AC-019.2), 남의 병원·anon·승인 안 된 병원

### 3. 건수 만들기·올리기
```ts
// src/lib/precheck/counts.ts (환자 자료 구역, Worker가 부름)
export type DayCount = { visit_date: string; need_memo: number; entered: number; needs_check: number; skipped: number }
export function dayCounts(view: ClaimView): DayCount[]
// src/lib/storage/claimCounts.ts (읽기는 Phase 2에 있음, 쓰기를 더함)
export function checkDayCount(row: unknown): DayCount          // 정해 둔 5칸 밖·정수 아님·날짜 아님 → 던짐(보내지 않음)
export async function upsertDayCounts(sb: SupabaseClient, rows: DayCount[]): Promise<void>   // 실패 → E-COUNTS-FAILED
export async function readOutsideCounts(sb): Promise<{ days: …; months: …; contact: … }>      // 밖에서 보기용
// src/components/claim/useCountsUpload.ts
export function useCountsUpload(): { push(rows: DayCount[]): void; lastUploadedAt: string | null; failed: boolean }
```
- 바뀐 날짜 줄만 올린다. 실패하면 메모리에 두고 다음 `push`·창 `focus` 때 다시. 실패 중에는 작은 줄 `E-COUNTS-FAILED`와 '마지막으로 올린 시각'
- `ClaimScreen.tsx`: 불러오기·입력이 끝나면 Worker의 `dayCounts`를 받아 `push`. 목업 화면 6의 "날짜별 입력 현황이 서버에 건수로 올라갔어요" 한 줄

### 4. 밖에서 보는 건수 (목업 화면 11)
- `OutsideCounts.tsx`: '메모 입력 현황'(남은 날만, 날짜·메모 필요·입력함·상태·마지막 바뀐 시각). 월말 마감 남은 일(TASK-22)·연락 남은 건수(TASK-26) 칸은 자리만 두고 '아직 올린 건수가 없어요'. 휴대폰 모양(폭 390)도 목업대로
- `/claim`: 확장 없는 곳·휴대폰이면 이 화면(AC-013.8 자리를 채움). PC 크롬이면 '설치·연결 확인' 링크

### 5. 시험
- `counts.test.ts`(AC-019.3), `claimCounts.test.ts`(칸 검사, 요청 몸통에 정해 둔 칸·정수·날짜만, 가짜 이름·차트번호·메모 글자가 없음: AC-019.6), `useCountsUpload.test.ts`(실패 → 다시: AC-019.4), `OutsideCounts.test.tsx`·`page.test.tsx`(AC-019.5), `jobs.test.ts`, RLS(AC-019.1·019.2)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-19 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-19 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run supabase/precheck.rls.test.ts supabase/rls.test.ts
npx vitest run src/lib/storage/claimCounts.test.ts src/lib/precheck/counts.test.ts src/components/claim/OutsideCounts.test.tsx src/components/claim/useCountsUpload.test.ts "src/app/(app)/claim/page.test.tsx" src/workers/precheck/jobs.test.ts src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-19 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-019.1 ~ AC-019.6이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-3-memo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 건수 표에 `text`·`varchar`·`jsonb` 칸이나 '메모'·'비고' 같은 글자 칸을 만들지 마라. 이유: 글자 칸이 없으면 실수로도 환자 정보가 서버에 갈 수 없다(AC-019.1, ADR-018)
- 정해 둔 5칸 밖의 값을 upsert에 실어 보내지 마라. 이유: Worker 보기 모양에서 이름·차트번호가 섞여 나갈 수 있다(AC-019.3·019.6)
- 새 서버 경로·Edge Function으로 건수를 받지 마라. 이유: 브라우저 + RLS만(ADR-004·018)
- 기존 마이그레이션 파일을 고치지 마라. 이유: 운영 DB에 이미 붙여 넣은 파일이다. 새 파일로만 더한다
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 설정 RLS 시험과 청구 화면 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 3 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(먼저 시험용 환자 한 명으로 입력 → 그다음 실제 하루치)
- 사용자 할 일(Phase 3 의원 PC 시험 전): 건수 마이그레이션(`20261030000100_precheck_counts.sql`)을 SQL 편집기에 붙여 넣기. 새 도우미 zip(Phase 3 처리기 포함)을 설치
