# Step 6: precheck-screen

> **TASK-13** 청구 화면 · 날짜 목록 · 점검 · **REQ-013** · AC-013.1 ~ AC-013.9
> Phase 2 `precheck-2-rules` · Step 6 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-013에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-013.1**: 도우미 `claim.dates`와 서버 `claim_day_counts`로 `buildDateList`: 진료 0건인 날을 빼고 ① 덜 끝난 날(메모 필요 > 입력, 또는 아직 불러오지 않은 날)을 오래된 날부터 ② 다 끝난 날을 최근 날부터. 날마다 진료 수·남은 수·마지막으로 바뀐 시각
- **AC-013.2**: 시작·끝 날을 고르면 달을 넘겨도 되고 35일 이하만(AC-008.1). [자료 불러오기] → `claim.month`·`claim.memos`·`store.load`를 부르고, 모두 끝나야 점검. 누른 동안 단추를 막고 진행 상태를 보인다
- **AC-013.3**: 점검 결과: 환자(진료)마다 등급 칩(확인 필요·알림·참고)과 규칙 제목·내용·고시 근거, 추천 상병, 상병 확인 경고가 목업 승인본처럼. 등급·규칙으로 거를 수 있고, 등급은 색만이 아니라 글자로도 구분
- **AC-013.4**: [엑셀 내려받기] → Worker가 원본과 같은 두 시트(규칙별 `[규칙, 제목, 분야, 등급, 건수, 근거]`, 내원별 `[진료일, 차트번호, 이름, 등급, 규칙, 제목, 내용, 세부]`)의 xlsx를 만들어 그 PC에 내려받는다. 서버로 보내지 않는다
- **AC-013.5**: `E-CLAIM-PARTIAL`·`E-RULES-LOAD-FAILED`·읽기 오류면 점검 결과를 보이지 않고 오류 카드("다시 불러오세요")와 [다시 불러오기]
- **AC-013.6**: 점검 뒤 설정이 바뀌면(창 초점이 돌아올 때 다시 읽음) `settingsChanged`가 `true`일 때 "설정이 바뀌었어요, 다시 점검하세요" 띠와 [다시 점검]
- **AC-013.7**: `src/components/claim/rows/**`는 네트워크·console·브라우저 저장소·supabase·storage·auth import가 막힌다(JSX는 된다). `src/components/claim/**`·`src/app/(app)/claim/**`에서 오류 보고 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`) import가 막힌다. `package.json`에 그런 패키지가 없다(guardrails 시험)
- **AC-013.8**: 휴대폰이나 확장 없는 브라우저에서 `/claim`은 점검 칸 대신 밖에서 보는 건수(REQ-019) 자리와, PC 크롬이면 설치·연결 확인으로 가는 링크
- **AC-013.9**: 서버 설정 읽기 실패면 도우미에 둔 마지막 설정 사본(REQ-015)으로 점검하고 "서버에 닿지 않아 마지막으로 받은 설정을 씁니다". 사본도 없으면 점검하지 않고 `E-SETTINGS-FAILED`. 설정을 읽으면 사본을 새로 저장

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-013
- `/specs/precheck/design.md` — 6-2절(Worker), 6-4절(날짜 목록), 6-5절(설정이 바뀌었을 때), 7절 표 '청구'·'밖에서 보는 건수', 5절(화면 줄 울타리·오류 수집 없음), 15절(엑셀은 Worker에서 `xlsx`)
- `/specs/precheck/tasks.md` — TASK-13 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(표·칩·오류 카드·빈 상태·폰)
- `/src/components/common/ErrorCard.tsx`, `/src/components/ui/classes.ts`
- `/eslint.config.mjs`, `/src/guardrails.test.ts`
- 이전 step에서 만든 파일:
  - `src/components/claim/useBridge.ts`, `src/app/(app)/claim/page.tsx`(자리만 있음), `src/components/claim/setup/*` (Phase 1 Step 5)
  - `src/workers/precheck.worker.ts`, `src/workers/precheck/jobs.ts`·`assemble.ts`·`tables.ts` (Step 0·2~4)
  - `src/lib/precheck/rules/*`, `src/lib/precheck/dx/*` (Step 3·4)
  - `src/lib/storage/claimSettings.ts`, `src/lib/precheck/settingsChanged.ts` (Step 5)
  - `src/lib/bridge/commands.json` (`claim.dates`·`claim.month`·`claim.memos`·`store.load`·`store.save` args)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 엑셀 내보내기(두 시트 칸 순서), `tools/xlsx_export_integration.py`·`tests/test_excel_export_html.py`
  - `assets/mx999_v22.html`의 결과 목록·거르기(배치는 목업을 따른다)

## 승인된 목업 (화면 step)

- 화면 2 '청구 · 날짜 목록'(`id="v-dates"` 부분)
- 화면 3 '청구 · 점검 결과'(`id="v-check"` 부분)
- 화면 11 '밖에서 보는 건수'(`id="v-outside"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/claim/page.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/components/claim/*`
  - `src/components/claim/rows/*`
  - `src/lib/precheck/excel.ts`
  - `src/lib/precheck/excel.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/lib/storage/claimCounts.ts`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/types/db.ts`
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/storage/claimCounts.test.ts`
  - `src/components/claim/dateList.test.ts`
  - `src/components/claim/ClaimScreen.test.tsx`
  - `src/components/claim/SettingsChangedBanner.test.tsx`
  - `src/components/claim/rows/FindingRows.test.tsx`
  - `src/lib/precheck/excel.test.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/guardrails.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-017)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-017)
- **서버에는 건수와 설정만**: 건수 표 칸은 `uuid`(병원)·`date`·`integer`·`timestamptz`뿐이고, DB 제약이 0~100,000 정수만 받는다. 이름·차트번호·메모 글·경고 내용을 서버에 보내지 않는다 (ADR-018)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 울타리 먼저 (`eslint.config.mjs`, `src/guardrails.test.ts`)
- `src/components/claim/rows/**`: 네트워크·console·브라우저 저장소 금지, `@/lib/supabase/*`·`@supabase/*`·`lib/storage`·`lib/auth` import 금지(JSX는 허용)
- `src/components/claim/**`·`src/app/(app)/claim/**`: `@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights` import 금지
- guardrails: 규칙마다 '막힌다' 시험 + `package.json`에 그런 패키지가 없다(AC-013.7)

### 2. 날짜 목록
```ts
// src/components/claim/dateList.ts
export function buildDateList(days: { date: string; visits: number; memoInBit: number }[], counts: ClaimDayCount[]): DateRow[]
// src/lib/storage/claimCounts.ts — 이 step은 읽기만
export async function readDayCounts(sb: SupabaseClient, from: string, to: string): Promise<ClaimDayCount[]>   // 표가 없으면(마이그레이션 전) []
```
- 순서: ① 덜 끝난 날(메모 필요 > 입력, 또는 서버 건수 없음)을 오래된 날부터 ② 다 끝난 날을 최근 날부터. 진료 0건인 날은 뺀다
- 기간: 도우미 최근 60일 + 서버 건수에 남은 일이 있는 더 옛날(design.md 15절)
- `claimCounts.ts` 쓰기는 TASK-19가 만든다

### 3. 불러오기·점검 흐름 (`src/components/claim/*`, Worker)
- `useBridge({ worker })`: 화면은 `precheck.worker.ts` Worker 객체만 넘긴다. 조각은 통로 울타리 안 `workerSink`가 전용 포트로 Worker에 넣고, 화면 코드는 조각을 받지 않는다(AC-004.11)
- [자료 불러오기]: 기간 검사(달 넘김 허용, 35일 이하) → `stream('claim.month')`·`stream('claim.memos')`·`stream('store.load')` → 모두 끝나면 Worker `check`. 누르는 동안 `disabled`와 진행 상태(목업 화면 2 '불러오는 중')
- 설정: 점검 직전에 `readRuleSettings`·`readHospitalSettings`로 읽어 Worker에 넘기고, 읽었으면 Worker에 `saveSettingsCopy`를 시켜 Worker가 `store.save {settings}` 글자를 통로 포트로 보내게 한다(화면에는 `send`가 없다, AC-004.11). 서버 읽기 실패면 `store.load {settings: true}` 사본으로 점검하고 안내 한 줄, 사본도 없으면 `E-SETTINGS-FAILED`(AC-013.9)
- **순서 문제(Phase 2 시점)**: `claim.memos`(TASK-16)·`store.load/save`(TASK-15)의 도우미 처리기는 Phase 3에 생긴다. 지금 도우미는 이 명령에 `E-HELPER-UNKNOWN-COMMAND`로 답한다(명령 표에는 있음). 이 번호일 때만 메모 비교는 '조회 못함'(AC-016.2), 저장한 작업·설정 사본은 '없음'으로 보고 점검은 계속하며, 안내 한 줄("도우미 업데이트 뒤 메모 비교·이어서 하기가 됩니다")을 보인다. 다른 오류는 AC-013.5대로 멈춘다. Phase 2에는 비트 입력이 없어 두 번 입력 위험이 없다. 이 처리를 summary에 적는다
- 결과(목업 화면 3): 진료마다 등급 칩(글자 포함)·규칙 제목·내용·고시 근거·추천 상병·상병 경고. 등급·규칙 거르기. 환자 줄은 `components/claim/rows/FindingRows.tsx`가 props로만 그린다
- 오류(AC-013.5): `E-CLAIM-PARTIAL`·`E-RULES-LOAD-FAILED`·읽기 오류면 결과를 지우고 오류 카드 + [다시 불러오기](목업 화면 2 '자료 일부만 옴')
- 설정 바뀜(AC-013.6): `window` `focus` 때 설정을 다시 읽어 `settingsChanged` → `SettingsChangedBanner`("설정이 바뀌었어요, 다시 점검하세요" + [다시 점검])

### 4. 엑셀 (`src/lib/precheck/excel.ts`, Worker에서)
```ts
export function buildPrecheckXlsx(view: ClaimView, tables: Tables): Uint8Array   // 시트 '규칙별'·'내원별', 칸 순서는 AC-013.4
```
- 이미 있는 `xlsx` 패키지를 쓴다. Worker가 바이트를 만들고, 화면이 `Blob` → `a[download]`로 그 PC에 저장한다. 파일 이름에 환자 값을 넣지 않는다(예: `사전점검_2026-10-27_2026-10-29.xlsx`)

### 5. 확장 없는 곳 (AC-013.8)
- `useBridge` 상태가 `no-extension`이면 점검 칸 대신 '밖에서 보는 건수' 자리(목업 화면 11 모양, 건수는 TASK-19가 채운다 — 지금은 빈 안내 한 줄). PC 크롬이면(확장이 없거나 도우미가 없으면) 설치·연결 확인 링크

### 6. 시험
- `dateList.test.ts`(AC-013.1), `ClaimScreen.test.tsx`(jsdom, 가짜 통로·가짜 Worker: AC-013.2·013.3·013.5·013.8·013.9와 위 순서 문제 처리), `SettingsChangedBanner.test.tsx`(AC-013.6), `rows/FindingRows.test.tsx`(칩 글자·근거), `excel.test.ts`(시트 이름·칸 순서·서버 호출 없음: AC-013.4), `claimCounts.test.ts`(읽기·표 없음 → []), `jobs.test.ts`(점검 job·엑셀 job), `page.test.tsx`, `guardrails.test.ts`(AC-013.7)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/claim/dateList.test.ts src/components/claim/ClaimScreen.test.tsx src/components/claim/SettingsChangedBanner.test.tsx src/components/claim/rows/FindingRows.test.tsx
npx vitest run src/lib/precheck/excel.test.ts src/lib/storage/claimCounts.test.ts src/workers/precheck/jobs.test.ts "src/app/(app)/claim/page.test.tsx" src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-013.1 ~ AC-013.9이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-2-rules/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 점검 결과·환자 줄·엑셀을 서버(supabase)나 `fetch`로 보내지 마라. 이유: 환자 자료는 PC 밖으로 나가지 않는다. 서버에는 건수만(ADR-017·018)
- 일부만 온 자료로 결과를 보이지 마라. 이유: 빠진 환자가 '문제 없음'처럼 보인다(AC-013.5)
- `E-HELPER-UNKNOWN-COMMAND` 말고 다른 오류를 '없음'으로 넘기지 마라. 이유: 도우미 저장이 깨졌거나(`E-STORE-BROKEN`) 읽기가 실패한 것을 숨기면 두 번 입력·빠뜨림이 생긴다
- 날짜 목록·결과·고친 메모를 `localStorage` 등에 기억하지 마라. 이유: 청구 쪽은 브라우저 저장소를 쓰지 않는다(ADR-017)
- 오류 수집·분석 도구(Sentry·Vercel Analytics 등)를 붙이지 마라. 이유: 오류 보고에 환자 줄이 섞여 나갈 수 있다(AC-013.7, ADR-017)
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: Phase 1 `/claim` 자리 시험(`page.test.tsx`)을 바뀐 화면에 맞게 고치되 AC-006.5·013.8 내용은 지킨다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 2 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(실제 한 달 자료로 점검하고 같은 달을 양지바른 결과와 나란히 비교). 사용자 할 일: 설정 마이그레이션(`20261030000000_precheck_settings.sql`)을 SQL 편집기에 붙여 넣기(Step 5)
- Phase가 끝나면 Phase PR을 만든다. 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때마다 지시할 때만 한다. Claude가 자동으로 하지 않는다. 의원 PC 시험은 그 뒤에 한다(확장·`commands.json`에는 운영 주소 하나만 있어 새 화면이 운영에 배포돼야 시험할 수 있다. tasks.md 머리말, design.md 12절)
- 이 Phase에는 메모 비교·이어서 하기가 아직 없다(도우미 처리기는 Phase 3). 의원 PC 시험 목록에 그렇게 적는다
