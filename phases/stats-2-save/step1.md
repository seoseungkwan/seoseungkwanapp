# Step 1: stats-storage

> **TASK-7** 통계 숫자 저장·읽기 · **REQ-507** · AC-507.1 ~ AC-507.3
> Phase 2 · 저장과 처방 추세 `stats-2-save` · Step 1 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-507(통계 숫자 저장·읽기 (`lib/storage/stats.ts`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-507.1**: Given 저장 모양(달·일)·덮은 기간·출처(`'bit'|'file'`), When `saveStats`, Then 모든 값이 `validateMonthPayload`·`validateDayPayload`를 지날 때만 `stats_months`·`stats_days`에 upsert(충돌 열쇠 `hospital_id + month|day`)하고, 그 뒤 덮은 기간이 null이 아닐 때만 `stats_coverage`에 한 줄을 넣는다(null이면 덮은 기간 줄을 쓰지 않는다 — 시험이 본다). 하나라도 걸리면 아무것도 보내지 않고 `E-STATS-SAVE-FAILED`다. 보내는 줄의 칸은 `month|day`·`partial`·`source`·`payload`(덮은 기간 줄은 `from_day`·`to_day`·`source`)뿐이다. 보내기가 실패해도 `E-STATS-SAVE-FAILED`다
- **AC-507.2**: Given 기간, When `readDays({from, to})`·`readMonths({from, to})`·`readCoverage({from, to})`, Then 그 기간 줄만 읽어 검사를 지난 것만 날짜(달) 순으로 돌려주고, 검사에 걸려 뺀 줄 수와 가장 최근 `updated_at`·`source`를 같이 준다. `readCoverage`는 그 기간과 겹치는 덮은 기간을 합쳐(`mergeRanges`) 돌려준다. 읽기 실패는 `E-STATS-READ-FAILED`다
- **AC-507.3**: Given `src/lib/storage/stats.ts`(통계 파일만 — 다른 브랜치의 `lib/storage` 파일에 규칙을 씌우지 않는다), When ESLint를 돌리면, Then `lib/parsers`·`lib/bridge`·`workers`를 import할 수 없고 `lib/analytics`는 `dates`·`coverage`만 된다. 환자 자료 구역은 지금처럼 `lib/storage`를 import할 수 없다. `console`·브라우저 저장소를 쓰지 않는다. 시험: `src/guardrails.test.ts`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-507
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-7
- `/specs/stats/tasks.md` — TASK-7 (수정 범위·메모)
- `/src/lib/supabase/browser.ts` (`supabaseBrowser()`), `/src/components/admin/applications.ts` (브라우저에서 Supabase를 읽는 본보기)
- `/src/lib/payload/validate.ts`, `/src/types/payload.ts`, `/src/types/db.ts`(TASK-6의 `MonthRow`·`DayRow`)
- `/eslint.config.mjs`, `/src/guardrails.test.ts` (구역 블록과 그 시험 방식)
- `/src/types/errors.ts`, `/src/lib/errors.ts`
- 이전 step에서 만든 파일: TASK-6 (`stats_months`·`stats_days`·`stats_coverage` 표)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/storage/stats.ts`
  - `src/lib/storage/stats.test.ts`
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/storage/stats.test.ts`
  - `src/guardrails.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required
- 메모: 오류 번호 `E-STATS-SAVE-FAILED`·`E-STATS-READ-FAILED`를 더한다(앞말 `E-STATS-`, cross-branch C3). 시험은 가짜 Supabase 클라이언트로(실제 Supabase에 붙지 않는다)

## 꼭 지킬 규칙 (CRITICAL)

- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **비밀값**: Supabase 키·토큰을 코드·시험·출력에 쓰지 않는다. 시험은 가짜 클라이언트만 쓰고 실제 Supabase에 붙지 않는다 (CLAUDE.md)
- **브라우저 저장소·주소 안 씀**: 숫자·처방 이름·보고 글을 `localStorage`·`sessionStorage`·`indexedDB`·주소(URL·쿼리)·`history.state`에 넣지 않는다. 화면 상태와 Worker 메모리에만 둔다
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 통계 숫자는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 페이지·`*.server.ts`는 통계 표를 읽지 않는다 (CLAUDE.md, ADR-004)

## 작업

### 1. 저장·읽기 (`src/lib/storage/stats.ts`)
```ts
export type StatsSource = 'bit' | 'file'
export class StorageError extends Error { readonly code: 'E-STATS-SAVE-FAILED' | 'E-STATS-READ-FAILED' }
export async function saveStats(input: { months: MonthPayload[]; days: DayPayload[]; covered: DateRange | null; source: StatsSource }, deps?: { client?: SupabaseLike }): Promise<{ saved: number }>
export async function readCoverage(range: { from: string; to: string }, deps?: …): Promise<DateRange[]>   // 겹치는 덮은 기간을 mergeRanges로 합침
export async function readDays(range: { from: string; to: string }, deps?: …): Promise<{ rows: DayPayload[]; dropped: number; latest: { at: string; source: StatsSource } | null }>
export async function readMonths(range: { from: string; to: string }, deps?: …): Promise<{ rows: MonthPayload[]; dropped: number; latest: … }>
```
- 저장(AC-507.1): 모든 값을 먼저 검사 → 하나라도 null이면 아무것도 보내지 않고 `E-STATS-SAVE-FAILED`. 줄 = `{ month|day, partial, source, payload }`만. `stats_months`·`stats_days`에 `upsert(rows, { onConflict: 'hospital_id,month' | 'hospital_id,day' })`, 200줄씩 → 다 되면 `covered`가 null이 아닐 때만 `stats_coverage`에 `{ from_day, to_day, source }` 한 줄. 실패 응답도 `E-STATS-SAVE-FAILED`(응답 내용은 옮기지 않는다)
- 읽기(AC-507.2): `.select('month|day, partial, source, payload, updated_at').gte().lte().order()` → 줄마다 검사, 걸린 줄은 빼고 수만 센다. `readCoverage`는 겹치는 줄을 `mergeRanges`로 합친다. 실패는 `E-STATS-READ-FAILED`
- `deps.client`는 시험용(가짜 클라이언트). 기본은 `supabaseBrowser()`

### 2. 울타리 (`eslint.config.mjs`, `src/guardrails.test.ts`)
- `src/lib/storage/stats.ts` 블록(AC-507.3, 통계 파일만 — 다른 브랜치가 `src/lib/storage/`에 둘 파일에 규칙을 씌우지 않는다): `@/lib/parsers*`·`@/lib/bridge*`·`@/workers*` import 금지, `@/lib/analytics/*`는 `dates`·`coverage` 밖 금지, `console`·`localStorage`·`sessionStorage`·`indexedDB` 금지. 지금 환자 구역의 `lib/storage` import 금지는 그대로
- `guardrails.test.ts`에 그 블록의 시험(막히는 코드·되는 코드)을 지금 시험과 같은 방식으로 더한다

### 3. 오류 번호 (앞말 `E-STATS-`, 다른 브랜치와 같은 번호를 더하지 않는다 — cross-branch C3)
- `E-STATS-SAVE-FAILED`: "통계 숫자를 저장하지 못했어요" · "인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요"
- `E-STATS-READ-FAILED`: "저장된 통계를 읽지 못했어요" · "잠시 뒤 [다시 읽기]를 눌러 주세요"

### 4. 시험 (`src/lib/storage/stats.test.ts`)
- 가짜 클라이언트가 받은 호출(표 이름 `stats_*`·줄 칸·충돌 열쇠·나눔·덮은 기간 줄)과 결과. 검사 걸림 → 호출 0번. 읽기 → 검사 걸린 줄 빠짐·`dropped`·`latest`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/storage src/guardrails.test.ts src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-507.1 ~ AC-507.3이 이 TASK의 시험과 이어져 보여야 한다

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

- 저장 전에 검사를 건너뛰거나 검사한 값 밖의 칸을 보내지 마라. 이유: 서버에 가는 모양은 정해 둔 것만이다(CLAUDE.md, AC-507.1)
- 실제 Supabase에 붙는 시험을 만들지 마라. 이유: E2E가 아닌 단위 시험이고, 표가 아직 운영 DB에 없다
- 환자 구역 울타리를 풀거나 넓히지 마라(`lib/storage`를 구역에서 import 가능하게 등). 이유: 환자 줄이 저장소로 새지 않게(ADR-020)
- `hospital_id`를 줄에 넣지 마라. 이유: DB 기본값이 정하고 권한이 막는다(AC-506.2)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
