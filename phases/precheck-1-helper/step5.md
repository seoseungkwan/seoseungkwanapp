# Step 5: setup-screen

> **TASK-6** 설치·연결 확인 화면 · **REQ-006** · AC-006.1 ~ AC-006.6
> Phase 1 `precheck-1-helper` · Step 5 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-006에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-006.1**: `/claim/setup`에서 통로 상태가 `no-extension`·`no-helper`·`update-helper`·`update-extension`·`busy`이면 목업 승인본의 상태별 안내: 확장 설치 링크, 도우미 zip 받는 곳과 설치 순서(경고 창 넘기는 법 포함), "도우미를 업데이트하세요", "확장을 업데이트하세요", "다른 창에서 작업 중"
- **AC-006.2**: 상태 `ready`에서 [연결 확인] → `bit.check` → 단계마다 ✓/✗와 오류 번호. 등록이 없으면 [처음 등록] → `bit.register` → 다시 확인. 누른 동안 단추를 막는다
- **AC-006.3**: `helperUpdateAvailable`이면 "새 도우미가 있어요" 한 줄과 받는 곳 링크, 나머지는 그대로 쓸 수 있다
- **AC-006.4**: 탭 줄의 목업 승인본 위치에 [청구] 탭이 `/claim` 링크로 있다(`aria-current` 포함). 기관기호는 뒤 4자리를 가려 보인다
- **AC-006.5**: 휴대폰이나 확장 없는 브라우저에서 `/claim/setup`을 열면 "비트 PC의 크롬에서 엽니다" 안내와 밖에서 보는 건수(`/claim`)로 가는 링크
- **AC-006.6**: 새 오류 번호(design.md 4-5 중 연결·도우미·비트 접속 것)는 `errorInfo(code)`로 '무엇이·어떻게 고치나' 문구가 `lib/errors.ts`에서 나온다. 원래 오류 내용은 화면에 보이지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-006
- `/specs/precheck/design.md` — 4-4절(버전 맞추기), 4-5절(오류 번호), 7절 표 '설치·연결 확인', 9-1절(기관기호 가림), 12절(설치 안내), 13절(업데이트 안내)
- `/specs/precheck/tasks.md` — TASK-6 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(토큰·탭·단추·오류 카드·폰)
- `/src/components/shell/menu.ts`, `/src/components/shell/TabBar.tsx`, `/src/components/shell/shell.test.tsx`, `/src/components/ui/classes.ts`, `/src/components/common/ErrorCard.tsx`
- `/src/app/(app)/layout.tsx`, `/src/app/(app)/dashboard/page.tsx` (앱 틀 안 페이지 모양)
- 이전 step에서 만든 파일:
  - `src/lib/bridge/client.ts`·`handshake.ts`·`versions.ts`·`protocol.ts`, `src/types/bridge.ts` (Step 3)
  - `src/lib/errors.ts`, `src/types/errors.ts` (Step 3이 연결 번호를 더함)
  - `helper/install/README.md` (Step 1: 설치 순서 글의 바탕)
  - `helper/src/Precheck.Helper/Commands/*` (Step 4: `bit.check`·`bit.register` 답 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- 화면 1 '설치·연결 확인'(`id="v-setup"` 부분)
- 탭 자리: 목업 맨 위 '탭 자리 제안'(`id="pp-h"` 부분) — 새 탭의 순서와 위치
- 화면 6 '청구 · 입력 결과'(`id="v-result"` 부분)
- 화면 11 '밖에서 보는 건수'(`id="v-outside"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/claim/setup/page.tsx`
  - `src/app/(app)/claim/setup/page.test.tsx`
  - `src/app/(app)/claim/page.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/components/claim/setup/*`
  - `src/components/claim/useBridge.ts`
  - `src/components/claim/useBridge.test.ts`
  - `src/components/claim/maskInstitution.ts`
  - `src/components/claim/maskInstitution.test.ts`
  - `src/components/shell/menu.ts`
  - `src/components/shell/TabBar.tsx`
  - `src/components/shell/shell.test.tsx`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/app/(app)/claim/setup/page.test.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/components/claim/setup/SetupScreen.test.tsx`
  - `src/components/claim/useBridge.test.ts`
  - `src/components/claim/maskInstitution.test.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-017)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-017)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다

## 작업

### 1. 목업과 경로
- 목업 화면 1은 이 화면을 **설정 탭 안 [비트 연결]**에 그렸고, "연결이 안 된 채로 청구 탭을 열면 이 화면이 먼저 나와요"라고 적었다. 경로는 명세대로 `/claim/setup`이다(design.md 3절: 경로는 Claude 판단, 탭 위치는 목업)
- 그래서 `/claim/setup`은 목업 화면 1처럼 제목 '설정'과 안쪽 탭 `청구·연락 | 비트 연결`(비트 연결 선택)을 그린다. `청구·연락`은 `menu.ts`의 [설정] 항목 `href`를 따른다 — 지금은 `null`이라 '준비 중'(링크 아님)이고, TASK-12(Phase 2 Step 5)가 `/settings`로 바꾸면 저절로 링크가 된다. 탭 줄에서는 `/claim/setup`일 때 목업처럼 [설정] 자리를 현재 탭으로 보인다(설정 `href`가 없을 때도 표시만). 어떻게 했는지 summary에 적는다
- 화면 1의 본문: 상태 줄(준비됨/확장 없음/도우미 없음/버전 안 맞음), '준비 순서 5단계'(확장 → 도우미 → 비트 찾기 → DB 읽기 → 등록), '이 PC'(병원 이름·기관기호 가림·도우미·확장 버전), '이렇게 지켜요'. 목업 오류 번호 `E-PC-101` 등은 예시다 — design.md 4-5 번호를 쓴다
- '다른 창에서 작업 중'(`busy`) 안내 모양은 목업 화면 6의 '다른 창에서 열려 있음' 상태를 따른다

### 2. 탭 줄 (`menu.ts`, `TabBar.tsx`)
- 목업 '탭 자리 제안' 순서: 대시보드 · 통계 · AI 리포트 · 매출 · **청구** · 환자 연락 · 재고 · 급여 · 일일마감·보고 · 월간 PDF · 설정 | 관리자. 이 step은 [청구](`/claim`)만 더한다([환자 연락]은 TASK-26)
- `MenuItem.href` 타입을 넓힌다(`'/dashboard' | '/claim' | null` 등). `aria-current="page"`는 `/claim`과 `/claim/*`에서

### 3. 코드 (시그니처)
```ts
// src/components/claim/useBridge.ts ('use client' 훅, 환자 자료 구역 밖)
export function useBridge(opts?: { sink?: ChunkSink }): {
  state: BridgeState; hello: HelloResult | null; helperUpdateAvailable: boolean
  call: Bridge['call']; stream: Bridge['stream']; send: Bridge['send']; retry(): void
}
// src/components/claim/maskInstitution.ts
export function maskInstitution(code: string): string   // '12345678' → '1234****'
```
- `useBridge`는 `globalThis.chrome?.runtime`을 `connectBridge`에 넘기고, 화면을 떠나면 `close()`한다(창 하나 규칙 때문에 연결을 남기지 않는다). sink는 받는 쪽에서 넘긴다 — 이 step에는 Worker가 없으니 기본 sink는 받은 조각을 버린다(TASK-13이 Worker sink를 넣는다)
- `src/components/claim/setup/SetupScreen.tsx`(+필요한 작은 컴포넌트): 상태별 안내, [연결 확인]·[처음 등록](누르는 동안 `disabled`), 단계별 ✓/✗(글자도 같이: '됨'/'안 됨')와 오류 번호
- 링크: 확장 설치 = 웹스토어 주소 상수(등록 전이면 설치 안내 글로 대신), 도우미 받는 곳 = `https://github.com/seoseungkwan/seoseungkwanapp/releases`(태그 `helper-v*`). 주소 상수는 한 곳에 둔다
- `/claim/page.tsx`(이 step에서는 자리만): 통로가 `ready`가 아니고 PC 크롬(확장 있음)이면 `/claim/setup`으로 안내, 확장 없는 곳·휴대폰이면 '밖에서 보는 건수' 자리(빈 안내 한 줄)와 "비트 PC의 크롬에서 엽니다". 점검 화면은 TASK-13, 건수는 TASK-19

### 4. 오류 번호 (AC-006.6)
- 비트 접속 번호를 더한다: `E-BIT-NOT-FOUND`·`E-BIT-DB-FAILED`·`E-BIT-NOT-REGISTERED`·`E-BIT-HOSPITAL-MISMATCH`(연결 번호는 Step 3이 넣었다). 화면은 `errorInfo(code)`만 쓴다

### 5. 시험 (jsdom, `// @vitest-environment jsdom`)
- 상태 5가지 안내(AC-006.1), [연결 확인] → `bit.check` 가짜 답 → ✓/✗·번호, 등록 없음 → [처음 등록] → 다시 확인, 누르는 동안 막힘(AC-006.2), 새 도우미 한 줄(AC-006.3), 탭 [청구] 링크·`aria-current`·가린 기관기호(AC-006.4), 확장 없음 안내·`/claim` 링크(AC-006.5), 오류 문구가 `errors.ts`에서 옴·원래 오류 글이 안 보임(AC-006.6)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run "src/app/(app)/claim/setup/page.test.tsx" "src/app/(app)/claim/page.test.tsx" src/components/claim/setup/SetupScreen.test.tsx
npx vitest run src/components/claim/useBridge.test.ts src/components/claim/maskInstitution.test.ts src/components/shell/shell.test.tsx src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-006.1 ~ AC-006.6이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-1-helper/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 기관기호를 가리지 않은 채 화면·주소·제목에 보이지 마라. 이유: 기관기호는 서버에 올리지 않고 화면에는 뒤 4자리를 가린다(design.md 9-1, AC-006.4)
- 오류 객체의 `message`나 도우미가 준 글을 화면에 그대로 보이지 마라. 이유: 오류 카드는 번호와 `errors.ts` 문구만(AC-006.6, CLAUDE.md)
- 연결 상태·버전을 `localStorage` 등에 기억하지 마라. 이유: 청구 쪽은 브라우저 저장소를 쓰지 않는다(ADR-017). 열 때마다 `hello`로 확인한다
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로만 만든다(CLAUDE.md CRITICAL). 목업에 없는 것이 꼭 필요하면 summary에 적는다
- 기존 테스트를 깨뜨리지 마라. 이유: `shell.test.tsx`의 기존 탭 시험(순서·관리자 탭)이 새 탭과 함께 계속 맞아야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 1 마지막 step이다. 메인 세션이 Phase 끝에 할 일(docs/precheck/plan.md §6): `verify` → 바뀐 화면 캡처(PC·휴대폰) → 쉬운 말 보고 → 의원 PC 시험 목록(설치 → 연결 확인 → 비트 읽기 → 기관기호 확인). Actions 확인이 남은 step(1·4)이 있으면 같이 확인한다
