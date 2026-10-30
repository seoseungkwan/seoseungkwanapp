# Step 2: month-close-screen

> **TASK-22** 월말 마감 화면 · **REQ-022** · AC-022.1 ~ AC-022.5
> Phase 4 `precheck-4-sam` · Step 2 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-22 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-022에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-022.1**: `/claim/close`에서 달을 고르고 [청구 파일 불러오기] → `sam.latest`로 파일을 받아 대조, 미완료·빠진 것·확인 표시 남은 것을 목업 승인본처럼 나눠 보이고 파일 이름·받은 시각
- **AC-022.2**: 줄 하나를 누르면 그 진료가 있는 청구 화면(날짜·환자)으로 간다
- **AC-022.3**: 대조가 끝나면 `claim_month_counts`에 `{claim_month, incomplete, missing, flagged}` 정수만 upsert(실패 처리는 REQ-019 건수 올리기와 같음)
- **AC-022.4**: 밖에서 보는 건수에 월말 마감 남은 일(미완료·빠진 것·확인 표시)을 달마다 마지막 바뀐 시각과 함께
- **AC-022.5**: `E-SAM-NOT-FOUND`면 "청구 파일이 없어요"와 찾는 폴더(`C:\HIRA\DDMD\sam\in\backup`)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-022
- `/specs/precheck/design.md` — 7절 표 '월말 마감'·'밖에서 보는 건수', 8-2절(`claim_month_counts`), 6-4절(월말 마감은 달마다)
- `/specs/precheck/tasks.md` — TASK-22 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'
- 이전 step에서 만든 파일:
  - `src/lib/precheck/sam/*`, `jobs.ts`의 `samMatch` (Step 1)
  - `src/components/claim/*`(청구 화면·안쪽 탭 `메모 점검 | 월말 마감`·`useBridge`), `src/components/claim/rows/*` (Phase 2·3)
  - `src/lib/storage/claimCounts.ts`, `src/components/claim/OutsideCounts.tsx`, `src/components/claim/useCountsUpload.ts`, `src/lib/precheck/counts.ts` (Phase 3 Step 5)
  - `supabase/migrations/20261030000100_precheck_counts.sql` (`claim_month_counts`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 월말 마감 화면(무엇을 보이는지 — 배치는 목업)

## 승인된 목업 (화면 step)

- 화면 7 '월말 마감'(`id="v-close"` 부분)
- 화면 11 '밖에서 보는 건수'(`id="v-outside"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-22)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/claim/close/page.tsx`
  - `src/app/(app)/claim/close/page.test.tsx`
  - `src/components/claim/close/*`
  - `src/components/claim/rows/*`
  - `src/components/claim/OutsideCounts.tsx`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/lib/storage/claimCounts.ts`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/components/claim/close/MonthClose.test.tsx`
  - `src/components/claim/rows/CloseRows.test.tsx`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/app/(app)/claim/close/page.test.tsx`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-017)
- **서버에는 건수와 설정만**: 건수 표 칸은 `uuid`(병원)·`date`·`integer`·`timestamptz`뿐이고, DB 제약이 0~100,000 정수만 받는다. 이름·차트번호·메모 글·경고 내용을 서버에 보내지 않는다 (ADR-018)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)

## 작업

### 1. 화면 (목업 화면 7 '월말 마감')
- `/claim/close` → `src/components/claim/close/MonthClose.tsx`. 청구 안쪽 탭 `메모 점검 | 월말 마감`에서 '월말 마감' 선택 상태
- 달 고르기 → [청구 파일 불러오기] → `stream('sam.latest')`(조각은 Worker로) → Worker `samMatch(month, …)` → '심평원 청구 파일' 칸(파일 이름·받은 시각)과 '남은 일' 칸(미완료·빠진 것·확인 표시 남은 것)
- 환자 줄은 `components/claim/rows/CloseRows.tsx`가 props로만 그린다
- 줄 누르기(AC-022.2): 청구 화면으로 가되 **주소에는 날짜만** 넣고(예: `/claim?from=2026-10-27&to=2026-10-27`), 어느 진료인지는 메모리 안 key로 넘긴다(같은 탭 안 상태). 차트번호·이름을 주소에 넣지 않는다
- `E-SAM-NOT-FOUND`(AC-022.5): "청구 파일이 없어요"와 폴더 `C:\HIRA\DDMD\sam\in\backup`

### 2. 건수 (AC-022.3·022.4)
```ts
// src/lib/precheck/counts.ts 에 더함
export type MonthCount = { claim_month: string /* YYYY-MM-01 */; incomplete: number; missing: number; flagged: number }
export function monthCounts(view: MonthCloseView): MonthCount
// src/lib/storage/claimCounts.ts 에 더함
export function checkMonthCount(row: unknown): MonthCount
export async function upsertMonthCount(sb: SupabaseClient, row: MonthCount): Promise<void>   // 실패 → E-COUNTS-FAILED
```
- 올리기 실패 처리는 `useCountsUpload`와 같은 방식(메모리에 두고 다음에·초점 때 다시)
- `OutsideCounts.tsx`: '월말 마감 남은 일' 칸을 채운다(달마다 미완료·빠진 것·확인 표시 수와 마지막 바뀐 시각). 목업 화면 11

### 3. 오류 번호
- `E-SAM-NOT-FOUND`(문구에 폴더 경로), `E-COUNTS-FAILED`(이미 있으면 그대로)

### 4. 시험 (jsdom, 가짜 통로·가짜 Worker)
- `MonthClose.test.tsx`(AC-022.1·022.5), `rows/CloseRows.test.tsx`(줄 누르기 → 주소에 날짜만: AC-022.2), `counts.test.ts`·`claimCounts.test.ts`(월 건수 칸 검사·요청 몸통에 정수·날짜만: AC-022.3), `OutsideCounts.test.tsx`(AC-022.4), `page.test.tsx`, `jobs.test.ts`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-22 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-22 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/claim/close/MonthClose.test.tsx src/components/claim/rows/CloseRows.test.tsx src/components/claim/OutsideCounts.test.tsx "src/app/(app)/claim/close/page.test.tsx"
npx vitest run src/lib/storage/claimCounts.test.ts src/lib/precheck/counts.test.ts src/workers/precheck/jobs.test.ts src/lib/errors.test.ts src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-22 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-022.1 ~ AC-022.5이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-4-sam/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 차트번호·이름·청구번호를 주소(쿼리 포함)에 넣지 마라. 이유: 주소는 서버 로그·브라우저 기록에 남는다(AC-022.2)
- 월말 건수에 정해 둔 4칸 밖의 값을 실어 보내지 마라. 이유: 건수 표에는 숫자만 간다(ADR-018)
- SAM 파일·대조 결과를 서버나 브라우저 저장소에 두지 마라. 이유: 청구 파일에는 환자 정보가 있다
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 청구 화면·밖에서 보는 건수 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 4 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(지난달 청구 파일로 대조). 새 도우미 zip(`sam.latest` 포함) 설치 안내
