# Step 1: sam-match

> **TASK-21** SAM 대조 (골든) · **REQ-021** · AC-021.1 ~ AC-021.3
> Phase 4 `precheck-4-sam` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-21 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-021에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-021.1**: 가짜 SAM 파일(생성기 `fixtures/precheck/make-fake-sam.ts`, EUC-KR 고정 폭)로 `parseSam(bytes, name)`이 원본 `parseSam`과 같은 `{file, key, name, date, codes, memo, dx, dxs, items[{hang, gb, code, price, qty, cnt, days, amt}]}` 줄을 만든다(골든)
- **AC-021.2**: 가짜 SAM 줄과 메모·진료로 `samCheck`·`samNameCheck`가 원본처럼 필요한 말이 있는지(`samRules`의 `CODE = 말|말`, `LA*`, `{이름}`)로 `bad`·`part`·`ok`·`none`을 정하고, 이름+날짜로 맞추며 동명이인은 '확인 필요'(골든)
- **AC-021.3**: 한 청구 달에 `collectMonthClose`가 원본 월말 마감 `collect`처럼 미완료·빠진 것·확인 표시 남은 것을 모은다(골든). 달을 넘긴 묶음이어도 진료 달로 나눈다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-021
- `/specs/precheck/design.md` — 2절 표(SAM 대조·월말 마감 원본), 10절(골든), 6-4절(월말 마감은 달마다)
- `/specs/precheck/tasks.md` — TASK-21 (수정 범위·메모)
- `/package.json` (`iconv-lite`는 이미 dev 패키지 — 가짜 EUC-KR 파일 만들기에 쓴다)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Sam/SamFiles.cs` (Step 0: `{version, files[{kind,name,month,modified,size,data}]}`)
  - `src/workers/precheck/jobs.ts`·`assemble.ts`, `src/types/precheck.ts` (Phase 2·3)
  - `src/lib/precheck/memo/*`·`memoCompare.ts` (Phase 3)
  - `scripts/precheck/golden/*` (원본 스크립트 꺼내기 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 `parseSam`(EUC-KR 고정 폭)·`samRules`·`samCheck`·`samNameCheck`
  - `assets/mx999_v22.html` 안 `<script id="new-medicore-month-close">` (`collect`)
  - `tools/claim_month_close.py`, `tests/test_claim_month_close.py`

## 수정 범위 (tasks.md TASK-21)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/precheck/sam/*`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/sam-*.json`
  - `fixtures/precheck/make-fake-sam.ts`
  - `fixtures/precheck/make-fake-sam.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/types/precheck.ts`
- Tests:
  - `src/lib/precheck/sam/parseSam.test.ts`
  - `src/lib/precheck/sam/samCheck.test.ts`
  - `src/lib/precheck/sam/monthClose.test.ts`
  - `src/lib/precheck/sam/golden.test.ts`
  - `fixtures/precheck/make-fake-sam.test.ts`
  - `src/workers/precheck/jobs.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 가짜 SAM 생성기 (`fixtures/precheck/make-fake-sam.ts`)
- 원본 `parseSam`이 읽는 고정 폭 자리대로 EUC-KR 바이트를 만든다(`iconv-lite`). 씨앗 고정, 같은 결과(시험이 두 번 만들어 비교). 이름 '가상환자NN', 가짜 기관기호
- 파일은 시험이 그때 만든다(임시 폴더나 메모리). 저장소에 `.GHP`·`.CAR`을 두지 않는다(`.gitignore`가 막는다)

### 2. 골든 (`scripts/precheck/golden/sam.mjs`)
- `parseSam`·`samRules`·`samCheck`·`samNameCheck`와 `new-medicore-month-close`의 `collect`를 `node:vm`에서 가짜 SAM·가짜 메모로 돌려 `fixtures/precheck/golden/sam-*.json`에. 동명이인·달 넘김 사례 포함

### 3. 코드 (`src/lib/precheck/sam/*`)
```ts
export function parseSam(bytes: Uint8Array, name: string): SamRow[]        // EUC-KR은 TextDecoder('euc-kr')
export function samCheck(row: SamRow, memo: string, rules: SamRules): 'bad' | 'part' | 'ok' | 'none'
export function samNameCheck(rows: SamRow[], visits: Visit[]): SamMatch[]   // 이름+날짜, 동명이인 → '확인 필요'
export function collectMonthClose(month: string, sam: SamRow[], view: ClaimView): MonthCloseView   // 미완료·빠진 것·확인 표시 남음
```
- 원본 줄을 그대로 옮긴다. 진료 달(`Visit.month`)로 나눈다(AC-021.3)
- `jobs.ts`: `samMatch(month, samJson, view)` — 도우미 JSON의 `data`(base64)를 풀어 `parseSam` → 대조 → `MonthCloseView`와 월말 건수 `{claim_month, incomplete, missing, flagged}`(TASK-22가 올린다)

### 4. 시험
- `parseSam.test.ts`(자리·EUC-KR), `samCheck.test.ts`(`CODE = 말|말`·`LA*`·`{이름}`), `monthClose.test.ts`(달 나눔), `golden.test.ts`(AC-021.1~021.3), `make-fake-sam.test.ts`(같은 씨앗 같은 바이트), `jobs.test.ts`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-21 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-21 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/precheck/sam/parseSam.test.ts src/lib/precheck/sam/samCheck.test.ts src/lib/precheck/sam/monthClose.test.ts src/lib/precheck/sam/golden.test.ts fixtures/precheck/make-fake-sam.test.ts src/workers/precheck/jobs.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-21 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-021.1 ~ AC-021.3이 이 TASK의 시험과 이어져 보여야 한다

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

- 가짜 SAM 파일을 `.GHP`·`.CAR` 이름으로 저장소에 커밋하지 마라. 이유: 실제 청구 파일과 구별이 안 된다. `.gitignore`도 막는다
- 대조 규칙(`samRules`)·동명이인 처리를 바꾸지 마라. 이유: 원본과 같아야 월말 마감 결과가 양지바른과 같다(AC-021.2)
- SAM 바이트·풀린 줄을 Worker 밖(화면·서버)으로 보내지 마라. 이유: SAM에는 환자 정보가 있다. 화면에는 보기 모양만, 서버에는 건수만
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 골든(규칙·상병·메모) 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
