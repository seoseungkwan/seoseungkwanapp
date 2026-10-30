# Step 4: memo-screen

> **TASK-18** 메모 화면 · 입력 결과 · 병원 문구 칸 · **REQ-018** · AC-018.1 ~ AC-018.7
> Phase 3 `precheck-3-memo` · Step 4 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-18 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-018에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-018.1**: 점검한 기간의 메모 칸: 진료마다 메모 초안(고친 것은 고친 것), 비트 메모와의 비교(같음·다름·비트에 없음·조회 못함), 입력 상태가 목업 승인본처럼, 아직 입력 안 된 것만 거를 수 있다
- **AC-018.2**: 메모를 고친 뒤 1초 동안 더 고치지 않으면 `store.save`로 PC에 저장. 저장 실패면 값을 그대로 두고 `E-STORE-FAILED`와 [다시 저장]. 브라우저 저장소는 쓰지 않는다
- **AC-018.3**: [비트에 입력] → 아직 안 된 진료(이미 있음·완료 제외)로 묶음을 만들어 `bit.input`, "PC 화면의 확인 창에서 [확인]을 눌러 주세요" 안내와 진행 숫자(`done/total`). 설정이 바뀐 띠가 있으면 [다시 점검] 전까지 막는다
- **AC-018.4**: 입력 결과는 완료·확인 필요·건너뜀(이유)으로 나눠 보이고, [다시 하기]는 건너뜀 가운데 '이미 있음'이 아닌 것만 다시 묶어 입력. 취소였으면 "입력하지 않았어요"
- **AC-018.5**: 다시 연 청구 화면에서 같은 기간을 불러오면 저장해 둔 고친 메모·결과가 이어서 보인다(도우미 저장 + 비트 비교)
- **AC-018.6**: 다른 창에서 이미 청구 화면이 연결됨(`E-BRIDGE-BUSY`)이면 "다른 창에서 작업 중" 안내만, 불러오기·입력 단추 없음
- **AC-018.7**: 설정 화면의 '병원 문구'·'상병 연결표' 칸은 원본 설정 엔진의 분류(기본·시술별·보조·부위별 문구, 표기 규칙)로 고칠 수 있고, [저장] 전에 `validatePhrases`로 검사해 틀린 칸을 보인다. [메모 시험해 보기]는 가짜 진료 한 건으로 문장을 보여 준다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-018
- `/specs/precheck/design.md` — 6-5절(설정 바뀜 → 입력 막기), 7절 표 '청구'·'설정', 9-4절(결과 세 가지·이어서 하기·웹 창이 닫혀도), 15절(창 하나·덮어쓰기 없음)
- `/specs/precheck/tasks.md` — TASK-18 (수정 범위·메모)
- `/docs/UI_GUIDE.md` '앱 화면'(표·입력·오류 카드·확인 창)
- `/eslint.config.mjs`·`/src/guardrails.test.ts` (Phase 2가 친 `components/claim/rows` 울타리)
- 이전 step에서 만든 파일:
  - `src/components/claim/*`(청구 화면·`useBridge`·`SettingsChangedBanner`), `src/components/claim/rows/*`, `src/workers/precheck.worker.ts`·`jobs.ts` (Phase 2 Step 6)
  - `src/lib/precheck/memo/*`(`buildMemo`·`validatePhrases`·`defaultPhrases`) (Step 0)
  - `src/lib/precheck/memoCompare.ts`(`inputPlan`) (Step 2)
  - `helper/src/Precheck.Core/Input/*` (Step 3: `bit.input` 진행·결과 모양, 이유 문구)
  - `src/lib/storage/claimSettings.ts`(`readHospitalSettings`·`writeHospitalSettings`), `src/components/settings/SettingsPage.tsx` (Phase 2 Step 5)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 메모 화면·결과 분류 문구, `tools/claim_batch_result.py`
  - `tools/claim_hospital_settings.js`·`claim_hospital_ui.js`·`claim_hospital_ui.css` (설정 엔진 분류: 기본·시술별·보조·부위별 문구, 표기 규칙)
  - `assets/mx999_v22.html`의 상병 연결표(`snapshot.rules`) 편집

## 승인된 목업 (화면 step)

- 화면 4 '청구 · 메모 확인·수정'(`id="v-memo"` 부분)
- 화면 5 '도우미 PC 확인 창'(`id="v-confirm"` 부분)
- 화면 6 '청구 · 입력 결과'(`id="v-result"` 부분)
- 화면 10 '설정'(`id="v-config"` 부분)

- 화면은 승인된 목업 https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (위 화면 번호)과 같게 만든다(배치·문구·상태). 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/48cae04e-0cd2-4603-a1ad-b361628f7242/scratchpad/mockup/index.html` — 화면마다 `<section class="screen" id="v-…">` 한 덩어리다. 사본이 없으면 artifact 읽기 도구(`read_artifact`, slug `499cp2Sodph7jYJ4gX4exj`)로 읽는다. 둘 다 안 되면 `blocked`(사유: 승인 목업을 읽을 수 없음)
- 목업 안의 환자 이름·차트번호·숫자·고시 번호·오류 번호(`E-PC-101` 같은 것)는 지어낸 예시다. 오류 번호는 design.md 4-5의 것을 쓴다
- 모양 규칙은 `docs/UI_GUIDE.md` '앱 화면'(Tailwind 토큰은 `src/app/globals.css` `@theme`, 반복 모양은 `src/components/ui/classes.ts`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다
- 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-18)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/claim/*`
  - `src/components/claim/memo/*`
  - `src/components/claim/rows/*`
  - `src/components/settings/HospitalPhrases.tsx`
  - `src/components/settings/HospitalPhrases.test.tsx`
  - `src/components/settings/DxLinks.tsx`
  - `src/components/settings/DxLinks.test.tsx`
  - `src/components/settings/SettingsPage.tsx`
  - `src/app/(app)/claim/page.tsx`
  - `src/app/(app)/claim/page.test.tsx`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/components/claim/memo/MemoPanel.test.tsx`
  - `src/components/claim/memo/InputResults.test.tsx`
  - `src/components/claim/memo/useMemoDrafts.test.ts`
  - `src/components/claim/rows/MemoRows.test.tsx`
  - `src/components/settings/HospitalPhrases.test.tsx`
  - `src/components/settings/DxLinks.test.tsx`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 줄 화면 울타리**: `src/components/claim/rows/**`·`src/components/contact/rows/**`는 JSX는 되지만 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import를 못 쓴다. 줄은 props로만 받는다. `components/claim/**`·`components/contact/**`·`app/(app)/claim/**`·`app/(app)/contact/**`는 오류 수집 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`)를 import하지 않는다 (ADR-017)
- **브라우저 저장소 안 씀**: 고친 메모·완료 표시·입력 기록·연락 표시·설정 사본은 도우미 작업 저장(`store.save`)에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-017)
- **PC 확인 창**: 비트에 쓰는 일(`bit.input`)과 처음 등록(`bit.register`)은 도우미가 띄우는 윈도우 창에서 사람이 [확인]을 눌러야만 시작한다. 창의 글은 도우미가 묶음·비트에서 직접 만든다(웹이 보낸 글을 보이지 않는다). [취소]·창 닫기·5분 지남이면 아무것도 하지 않는다 (ADR-016, design.md 9-1·9-4)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 새로 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 설정·건수는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다 (ADR-004·018)
- **주소에 환자 값 없음**: 차트번호·이름·메모·전화를 주소(URL)·쿼리·화면 제목·`history.state` 밖 어디에도 넣지 않는다. 주소는 서버 로그와 브라우저 기록에 남는다. 화면 사이에는 날짜와 메모리 안 key만 넘긴다
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)
- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)

## 작업

### 1. 메모 칸 (목업 화면 4)
- 단계 줄 `1 날짜 고르기 · 2 점검 결과 · 3 메모 확인 · 4 비트에 입력 · 5 입력 결과`와 안쪽 탭 `메모 점검 | 월말 마감`(월말 마감 화면은 TASK-22)
- `src/components/claim/memo/MemoPanel.tsx`: 진료마다 초안(고친 것 표시)·비교 상태 칩(같음·다름·비트에 없음·조회 못함, 글자로)·입력 상태. '아직 입력 안 된 것만' 거르기. 환자 줄은 `components/claim/rows/MemoRows.tsx`가 props로만 그린다
- `useMemoDrafts.ts`: 고친 메모를 Worker에 `editMemo`로 알리고, 1초 동안 더 고치지 않으면 Worker가 만든 `store.save` 글자를 `bridge.send('store.save', payload)`로 보낸다. 실패면 값을 그대로 두고 `E-STORE-FAILED` + [다시 저장]

### 2. 비트에 입력 (목업 화면 5의 웹 쪽 상태)
- [비트에 입력]: 설정을 다시 읽어(design.md 6-5) 바뀌었으면 띠를 띄우고 막는다. 아니면 Worker `buildInputBatch`(이미 있음·완료 제외) → `bridge.send('bit.input', payload)` → '확인 기다리는 중'("PC 화면의 확인 창에서 [확인]을 눌러 주세요", 창이 안 보이면 작업 표시줄 '청구메모 도우미') → `progress`로 '입력하는 중 N / M명'
- 웹은 확인 창을 흉내 내지 않는다. 확인은 도우미 창에서만

### 3. 입력 결과 (목업 화면 6)
- `InputResults.tsx`: 완료·확인 필요·건너뜀(이유 원본 문구) 묶음과 수. [다시 하기]는 건너뜀 중 '이미 있음'이 아닌 것만 다시 묶는다. 취소면 "입력하지 않았어요". 멈춤(`E-BIT-UI-CHANGED` 등)은 목업 '비트 화면이 바뀌어 멈춤' 상태처럼 넣은 수·남은 수와 [이어서 하기]
- 결과 조각은 Worker `applyInputResults`로 들어가 보기 모양이 된다
- `E-BRIDGE-BUSY`(AC-018.6): 목업 '다른 창에서 열려 있음' — 안내와 [다시 확인]·[건수만 보기]만, 불러오기·입력 단추 없음

### 4. 이어서 (AC-018.5)
- 같은 기간을 불러오면 `store.load`의 고친 메모·입력 기록과 `claim.memos` 비교로 이어서 보인다(Phase 2 Step 6의 'Phase 2 시점 순서 문제' 처리는 이제 도우미가 명령을 알므로 실제로는 타지 않는다)

### 5. 설정: 병원 문구·상병 연결표 (목업 화면 10)
- `HospitalPhrases.tsx`: 원본 설정 엔진의 분류(기본·시술별·보조·부위별 문구, 표기 규칙)로 고치기. [저장] 전에 `validatePhrases` → 틀린 칸 표시. 저장은 `writeHospitalSettings`. [메모 시험해 보기]: 가짜 진료 한 건(코드에 넣은 고정 가짜 값)으로 `buildMemo` 결과를 보인다(표가 필요하면 Worker로)
- `DxLinks.tsx`: 상병 연결표 `[rx, dx, nm, ex, src]` 줄 더하기·고치기·지우기
- `SettingsPage.tsx`의 '청구·연락' 안에 '점검 규칙' 다음 자리로 끼운다. 저장 실패면 값 유지 + [다시 저장]
- 목업의 `{부위}` 같은 자리 표시는 예시다. 실제 말은 원본 `fill`의 말(`부위`·`시술` 등)이다

### 6. 오류 번호
- `E-STORE-FAILED`·`E-STORE-BROKEN`·`E-BIT-UI-CHANGED`·`E-BIT-UNSAVED-RX`·`E-INPUT-STOPPED`

### 7. 시험 (jsdom, 가짜 통로·가짜 Worker)
- `MemoPanel.test.tsx`(AC-018.1·018.3·018.6), `useMemoDrafts.test.ts`(1초, 실패 → 다시 저장, 브라우저 저장소 안 씀: AC-018.2), `InputResults.test.tsx`(AC-018.4·018.5), `rows/MemoRows.test.tsx`, `HospitalPhrases.test.tsx`·`DxLinks.test.tsx`(AC-018.7), `jobs.test.ts`(`editMemo`·`buildInputBatch`·`applyInputResults`)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/claim/memo/MemoPanel.test.tsx src/components/claim/memo/InputResults.test.tsx src/components/claim/memo/useMemoDrafts.test.ts src/components/claim/rows/MemoRows.test.tsx
npx vitest run src/components/settings/HospitalPhrases.test.tsx src/components/settings/DxLinks.test.tsx src/workers/precheck/jobs.test.ts src/lib/errors.test.ts src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-18 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-018.1 ~ AC-018.7이 이 TASK의 시험과 이어져 보여야 한다

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

- 고친 메모를 `localStorage`·`sessionStorage`·`indexedDB`에 두지 마라(잠깐이라도). 이유: 청구 쪽은 브라우저 저장소를 쓰지 않는다. 도우미 저장만(AC-018.2, ADR-017)
- 웹 화면에 '확인' 단추를 두어 도우미 확인 창을 대신하게 하지 마라. 이유: 입력은 PC 확인 창에서만 시작한다(ADR-016)
- 설정이 바뀐 띠가 있는데 입력을 보내지 마라. 이유: 다른 설정으로 만든 메모가 비트에 들어간다(AC-018.3)
- [다시 하기]에 '이미 있음' 건너뜀을 넣지 마라. 이유: 비트에 있는 다른 메모를 덮어쓰려는 것이 된다(AC-018.4)
- 메모·이름·차트번호를 주소·쿼리·`console`에 남기지 마라. 이유: 주소와 로그는 PC 밖으로 나갈 수 있다
- 화면을 목업과 다른 배치·문구로 새로 짓지 마라. 이유: 화면은 승인된 목업대로(CLAUDE.md CRITICAL)
- 기존 테스트를 깨뜨리지 마라. 이유: Phase 2 청구 화면·설정 화면 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
