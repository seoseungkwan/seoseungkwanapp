# Step 3: contact-screen

> **TASK-26** 환자 연락 화면 · **REQ-026** · AC-026.1 ~ AC-026.6
> Phase 5 `precheck-5-contact` · Step 3 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-26 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-026에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-026.1**: `/contact`를 열면 `contact.targets`를 불러 F/U 명단과 정기 주사 명단을 목업 승인본처럼: 이름·전화·다음 날짜·지남/남은 날·내용·근거 문구. 기간을 고를 수 있다
- **AC-026.2**: 줄 하나에서 [연락함]을 누르면 연락 표시를 `store.save`로 PC(`contact.dat`)에 저장하고 그 줄을 '연락함'으로. 브라우저 저장소는 쓰지 않는다
- **AC-026.3**: 명단에서 [문구 복사]를 누르면 그 명단 종류의 문자 문구를 채워 복사한다(REQ-025)
- **AC-026.4**: 연락 표시가 바뀌어 저장되면 남은 건수(오늘까지 날짜가 온 것 중 연락함이 아닌 것)를 `contact_counts {followup_left, injection_left}` 정수로 upsert하고, 밖에서 보는 건수에 마지막 바뀐 시각과 함께
- **AC-026.5**: `src/components/contact/rows/**`·`src/components/contact/**`·`src/app/(app)/contact/**`에 청구 화면과 같은 울타리(REQ-013의 화면 줄 울타리·오류 보고 패키지 금지)가 걸린다. 탭 줄에 목업 승인본 위치의 [환자 연락] 탭
- **AC-026.6**: 휴대폰이나 확장 없는 브라우저에서 `/contact`는 명단 대신 연락 남은 건수만

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-026
- `/specs/precheck/design.md` — 7절 표 '환자 연락'·'밖에서 보는 건수', 5절(화면 줄 울타리), 8-2절(`contact_counts`), 9-3절(`contact.dat`)
- `/specs/precheck/tasks.md` — TASK-26 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'
- `/src/components/shell/menu.ts`, `/src/components/shell/shell.test.tsx`
- `/eslint.config.mjs`, `/src/guardrails.test.ts` (청구 화면 울타리를 그대로 넓힌다)
- 이전 step에서 만든 파일:
  - `src/lib/precheck/followup/*`, `jobs.ts`의 `followup` (Step 1)
  - `src/lib/messages/fill.ts`, `src/lib/storage/claimSettings.ts`(`readTemplates`), `src/components/common/CopyButton.tsx` (Step 2)
  - `src/components/claim/useBridge.ts`, `src/components/claim/OutsideCounts.tsx`, `src/components/claim/useCountsUpload.ts`, `src/lib/storage/claimCounts.ts`, `src/lib/precheck/counts.ts` (Phase 1·3·4)
  - `helper/src/Precheck.Core/Store/*`(`contact.dat`), `helper/src/Precheck.Core/Contact/*` (Phase 3·5)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/revisit_schedule.html`·`tools/revisit_source_boot.js`의 명단 칸(무엇을 보이는지 — 배치는 목업)

## 승인된 목업 (화면 step)

- 화면 8 '환자 연락'(`id="v-contact"` 부분)
- 화면 11 '밖에서 보는 건수'(`id="v-outside"` 부분)
- 탭 자리: 목업 맨 위 '탭 자리 제안'(`id="pp-h"` 부분) — 새 탭의 순서와 위치

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-26)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/contact/page.tsx`
  - `src/app/(app)/contact/page.test.tsx`
  - `src/components/contact/*`
  - `src/components/contact/rows/*`
  - `src/components/claim/OutsideCounts.tsx`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/components/claim/useBridge.ts`
  - `src/lib/storage/claimCounts.ts`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
- Tests:
  - `src/components/contact/ContactScreen.test.tsx`
  - `src/components/contact/rows/ContactRows.test.tsx`
  - `src/components/claim/OutsideCounts.test.tsx`
  - `src/lib/storage/claimCounts.test.ts`
  - `src/lib/precheck/counts.test.ts`
  - `src/app/(app)/contact/page.test.tsx`
  - `src/workers/precheck/jobs.test.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/guardrails.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-020)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-020)
- **서버에는 건수와 설정만**: 건수 표 칸은 `uuid`(병원)·`date`·`integer`·`timestamptz`뿐이고, DB 제약이 0~100,000 정수만 받는다. 이름·차트번호·메모 글·경고 내용을 서버에 보내지 않는다 (ADR-021)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·021)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)

## 작업

### 1. 울타리 먼저 (AC-026.5)
- `eslint.config.mjs`: `src/components/contact/rows/**`에 `components/claim/rows`와 같은 규칙, `src/components/contact/**`·`src/app/(app)/contact/**`에 오류 보고 패키지 금지
- `src/guardrails.test.ts`: 규칙마다 '막힌다' 시험

### 2. 화면 (목업 화면 8 '환자 연락')
- `/contact` → `src/components/contact/ContactScreen.tsx`: 기간 고르기(이번 주·다음 주·오늘), 안쪽 탭 `F/U 목록 | 정기 주사`(남은 수), 줄마다 연락함·차트번호·환자·전화·마지막 진료·이유(근거 문구)·연락할 날(지남/남은 날)·문자([문구 보기]/복사). 환자 줄은 `components/contact/rows/ContactRows.tsx`가 props로만
- 불러오기: `useBridge({ worker })`의 `stream('contact.targets', {kind, from, to})` → Worker `followup` → `ContactView`. 연락 표시는 `store.load {contact: true}`로 가져와 합친다
- [연락함](AC-026.2): Worker에 연락 표시를 시킨다. Worker가 `store.save {contact}` 글자를 만들어 통로 포트로 보내고(화면에는 `send`가 없다, AC-004.11) 됨·오류 번호만 알린다 → 됨이면 '연락함'. 실패면 값 유지 + 오류 줄
- [문구 복사](AC-026.3): 그 명단 종류(`followup`·`injection`)의 문자 문구를 `fillTemplate`로 채워 `CopyButton`
- `useBridge.ts`는 청구·연락이 같이 쓴다. 창 하나 규칙(`E-BRIDGE-BUSY`)도 같다 — 청구 화면이 다른 탭에 열려 있으면 이 화면도 '다른 창에서 작업 중'

### 3. 건수 (AC-026.4)
```ts
// src/lib/precheck/counts.ts 에 더함
export type ContactCount = { followup_left: number; injection_left: number }
export function contactCounts(view: ContactView, today: string): ContactCount   // 오늘까지 날짜가 온 것 중 연락함이 아닌 것
// src/lib/storage/claimCounts.ts 에 더함
export function checkContactCount(row: unknown): ContactCount
export async function upsertContactCount(sb: SupabaseClient, row: ContactCount): Promise<void>
```
- `OutsideCounts.tsx`: '연락 남은 건수' 칸(F/U·정기 주사 수, 마지막 바뀐 시각). 목업 화면 11

### 4. 탭과 확장 없는 곳
- `menu.ts`: [환자 연락](`/contact`)을 [청구] 바로 뒤에(목업 '탭 자리 제안'). `aria-current`
- 확장 없는 곳·휴대폰(AC-026.6): 명단 대신 연락 남은 건수만

### 5. 시험
- `ContactScreen.test.tsx`(jsdom, 가짜 통로·Worker: AC-026.1·026.2·026.3·026.6), `rows/ContactRows.test.tsx`, `counts.test.ts`·`claimCounts.test.ts`(정수만·요청 몸통에 이름·전화 없음: AC-026.4), `OutsideCounts.test.tsx`, `page.test.tsx`, `jobs.test.ts`, `shell.test.tsx`(탭 순서), `guardrails.test.ts`(AC-026.5)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-26 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-26 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/contact/ContactScreen.test.tsx src/components/contact/rows/ContactRows.test.tsx "src/app/(app)/contact/page.test.tsx" src/components/claim/OutsideCounts.test.tsx
npx vitest run src/lib/storage/claimCounts.test.ts src/lib/precheck/counts.test.ts src/workers/precheck/jobs.test.ts src/components/shell/shell.test.tsx src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-26 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-026.1 ~ AC-026.6이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-5-contact/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 연락 표시·명단을 `localStorage` 등에 두지 마라. 이유: 환자 이름·전화가 브라우저에 남는다. 도우미 `contact.dat`에만(AC-026.2)
- 이름·전화·차트번호를 서버(건수 포함)·주소·console로 보내지 마라. 이유: 서버에는 남은 건수 정수 둘만(AC-026.4, ADR-021)
- 문자를 자동으로 보내는 기능을 넣지 마라. 이유: 복사만 한다(범위 밖)
- 환자 연락 화면에 오류 수집·분석 도구를 붙이지 마라. 이유: 청구 화면과 같은 울타리(AC-026.5)
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: 탭 순서 시험(`shell.test.tsx`)과 청구 화면 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 5 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(이번 주 F/U 명단을 양지바른과 비교). 새 도우미 zip(`contact.targets` 포함) 설치 안내
- Phase가 끝나면 Phase PR을 만든다. 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)는 사용자가 그때마다 지시할 때만 한다. Claude가 자동으로 하지 않는다. 의원 PC 시험은 그 뒤에 한다(확장·`commands.json`에는 운영 주소 하나만 있어 새 화면이 운영에 배포돼야 시험할 수 있다. tasks.md 머리말, design.md 12절)
