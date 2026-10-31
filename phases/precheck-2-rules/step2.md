# Step 2: claim-shape

> **TASK-9** 점검용 모양 · 조각 모으기 (Worker) · **REQ-009** · AC-009.1 ~ AC-009.5
> Phase 2 `precheck-2-rules` · Step 2 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-009에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-009.1**: 한 요청의 조각들과 `end`를 Worker의 `assemble`이 모으면 조각 수·바이트 수·SHA-256이 `end`와 같을 때만 JSON으로 풀고, 순서가 뒤바뀌어 와도 `seq`대로 잇는다
- **AC-009.2**: 빠진 조각·남는 조각·SHA-256 다름·`abort`·`error`면 그 요청의 조각을 모두 버리고 `E-CLAIM-PARTIAL`을 화면에 알린다. 점검을 돌리지 않는다
- **AC-009.3**: 풀린 한 달 자료를 `shapeClaimMonth`로 design.md 6-3의 `ClaimMonth`로 바꾼다: 진료(`key`·`chart`·`date`·`name`·`lines`·`rx`·`dx`·`memosInBit`), 차트번호·날짜로 묶은 이력, 상병 추세, 처방 목록. 날짜는 `lib/analytics/dates.ts`로 `YYYY-MM-DD`
- **AC-009.4**: 증상·소모 중 하나가 비었거나 이력이 없거나 선언한 줄 수와 받은 줄 수가 다르면 `E-CLAIM-PARTIAL`로 멈춘다. 상병(83D)은 원본처럼 없어도 된다
- **AC-009.5**: 달을 넘기는 기간(예: 10/30~11/2)이면 진료마다 진료 달(`YYYY-MM`)을 붙이고 한 번에 점검한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-009
- `/specs/precheck/design.md` — 5절(환자 자료 길), 6-2절(Worker 받는 일·보내는 것), 6-3절(계산 모양), 10절(가짜 자료 생성기)
- `/specs/precheck/tasks.md` — TASK-9 (수정 범위·메모)
- `/src/workers/analyze.worker.ts`, `/src/workers/analyzeFiles.ts`, `/src/workers/runAnalysis.ts` (기존 Worker: 입구는 얇게, 순수 함수를 시험)
- `/src/lib/analytics/dates.ts`
- `/fixtures/make-fake-fixtures.ts` (기존 가짜 파일 생성기 방식)
- 이전 step에서 만든 파일:
  - `src/lib/bridge/client.ts`, `src/types/bridge.ts` (Phase 1: `ChunkSink` 모양)
  - `src/lib/bridge/workerSink.ts` (Phase 1: Worker에 넘기는 포트와 `chunk`·`end`·`abort`·`send`·`sent` 메시지 모양)
  - `helper/src/Precheck.Core/Protocol/Chunker.cs` (Phase 1: `end.sha256`은 소문자 hex, `bytes`는 UTF-8 바이트 수)
  - `helper/src/Precheck.Core/Claim/ClaimMonthPayload.cs` (Step 1: JSON 모양·`counts`)
  - `src/workers/precheck/tables.ts`, `src/types/precheck.ts` (Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html`의 `build`·`parseRx`(줄 → 진료·처방), `loadHistory`(이력 `HIST.byChart`)
  - `medicore/claim_import.py` (표 줄 → `VISITS`·`RXDATA`)
  - `tests/test_claim_precheck.py` (가짜 사례 v1~v18 — 생성기로 옮길 씨앗)
  - `tests/test_claim_import.py`·`test_claim_import_html.py`

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/workers/precheck/assemble.ts`
  - `src/workers/precheck/assemble.test.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/workers/precheck.worker.ts`
  - `src/lib/precheck/shape.ts`
  - `src/lib/precheck/shape.test.ts`
  - `src/types/precheck.ts`
  - `fixtures/precheck/fake/*`
  - `fixtures/precheck/make-fake-claims.ts`
  - `fixtures/precheck/make-fake-claims.test.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/workers/precheck/assemble.test.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/precheck/shape.test.ts`
  - `fixtures/precheck/make-fake-claims.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **1MB 나눠 보내기**: 도우미 → 크롬 메시지 하나는 앞 4바이트 길이를 포함해 1,000,000바이트 이하다(크롬 한도 1MB). 환자 자료 명령(명령 표 `patient: true`)의 답은 작아도 늘 `chunk`(`seq` 0부터) … `end {count, bytes, sha256}`로 보낸다. 자료를 다 만든 뒤에 나눈다. 도중에 실패하면 `end` 대신 `error`를 보내고 반쪽 자료를 보내지 않는다 (design.md 4절, AC-001.5)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)

## 작업

### 1. 조각 모으기 (`src/workers/precheck/assemble.ts`)
```ts
export type AssembleResult = { ok: true; text: string } | { ok: false; code: 'E-CLAIM-PARTIAL' }
export function createAssembler(): {
  chunk(id: string, seq: number, data: string): void
  end(id: string, count: number, bytes: number, sha256: string): Promise<AssembleResult>
  abort(id: string, code: string): void          // 그 id의 조각을 모두 버린다
}
```
- `seq` 순서로 잇고, 조각 수 = `count`, UTF-8 바이트 수 = `bytes`, SHA-256(소문자 hex) = `sha256`일 때만 `ok`. 하나라도 다르면 조각을 버리고 `E-CLAIM-PARTIAL`. SHA-256은 `crypto.subtle.digest`(네트워크 아님)
- JSON으로 푸는 것은 이 다음(`jobs.ts`)에서 한 번만

### 2. 모양 만들기 (`src/lib/precheck/shape.ts`, `src/types/precheck.ts`)
```ts
export function shapeClaimMonth(raw: unknown): ClaimMonth    // 틀리면 PrecheckError('E-CLAIM-PARTIAL')
```
- `types/precheck.ts`에 design.md 6-3 모양(`Visit`·`RxLine`·`DxLine`·`History`·`ClaimMonth`·`Finding`)을 그대로 둔다. `Visit`에 진료 달 `month: 'YYYY-MM'`을 더한다(AC-009.5)
- 원본 `build`·`parseRx`·`claim_import.py`의 줄 바꾸기를 그대로 옮긴다(원본 전역 값 `VISITS`·`RXDATA`·`HIST.byChart`를 이 모양 하나로 묶는다)
- 멈춤(AC-009.4): 증상(83)이나 소모(47)가 비었음, 이력 0줄, `counts`와 받은 줄 수가 다름. 상병(83D)은 없어도 된다
- 날짜는 `lib/analytics/dates.ts` 함수로만 바꾼다

### 3. Worker (`src/workers/precheck/jobs.ts`, `src/workers/precheck.worker.ts`)
- `jobs.ts`는 시험이 바로 부르는 순수 함수 모음이다. 이 step: `loadMonth(text) → ClaimMonth | { code }`
- `precheck.worker.ts`(입구, 얇게): 처음에 통로(`lib/bridge/workerSink.ts`)가 보낸 `{type: 'bridge-port'}`의 `MessagePort`를 받아 두고, 그 포트로 오는 `chunk`·`end`·`abort`를 `assemble` → `jobs`로 넘긴다(화면 메시지 길과 따로, design.md 6-1·6-2, AC-004.11). 보내는 것은 보기 모양·오류 번호뿐(조각 글자·풀린 자료를 화면으로 돌려보내지 않는다)
- **설정 화면용 규칙 목록**도 이 입구에 지금 넣는다: 메시지 `ruleList` → `loadTables()` 뒤 규칙마다 `{id, title, domain, grade, basis, enabled_default}`만 돌려준다(환자 자료 아님). TASK-12(설정 화면) 수정 범위에 Worker 파일이 없고, 표 JSON은 `workers/precheck/tables.ts`만 부를 수 있기(AC-007.4) 때문이다. summary에 적는다

### 4. 가짜 자료 (`fixtures/precheck/make-fake-claims.ts`, `fixtures/precheck/fake/*`)
- 씨앗을 고정한 생성기. 같은 씨앗이면 같은 결과(시험이 두 번 만들어 비교). 이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`
- 도우미 `claim.month` JSON과 같은 모양을 만든다(Step 1의 `counts` 포함). 원본 `test_claim_precheck.py` v1~v18 사례를 옮기고, 달을 넘기는 기간(10/30~11/2) 사례를 하나 넣는다
- 뒤 TASK(10·11·14·16·24)가 이 생성기에 사례를 더한다. 사례마다 이름을 붙여 찾기 쉽게 한다
- `package.json`의 `fixtures` 스크립트는 수정 범위 밖이다. 생성기는 `npx tsx fixtures/precheck/make-fake-claims.ts`로 돌린다

### 5. 오류 번호
- `E-CLAIM-PARTIAL`(문구: 자료가 다 오지 않아 점검을 멈췄어요 · 다시 불러오세요)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx tsx fixtures/precheck/make-fake-claims.ts && git diff --exit-code fixtures/precheck/fake   # 다시 만들어도 같음
npx vitest run src/workers/precheck/assemble.test.ts src/workers/precheck/jobs.test.ts src/lib/precheck/shape.test.ts fixtures/precheck/make-fake-claims.test.ts src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-009.1 ~ AC-009.5이 이 TASK의 시험과 이어져 보여야 한다

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

- 조각이 다 맞기 전에 `JSON.parse`하거나 일부 자료로 점검을 시작하지 마라. 이유: 반쪽 자료로 점검하면 빠진 환자가 '문제 없음'으로 보인다(AC-009.2·009.4)
- Worker가 풀린 자료·조각 글자를 화면(`postMessage`)으로 돌려보내지 마라. 이유: 화면에는 Worker가 만든 보기 모양만 간다(design.md 5절)
- `new Date()`·`toISOString()`으로 날짜를 직접 만들지 마라. 이유: UTC로 하루 밀린다. `dates.ts`만 쓴다(CLAUDE.md)
- 생성기에 `Math.random()`·현재 시각을 씨앗 없이 쓰지 마라. 이유: 가짜 자료와 골든이 실행할 때마다 달라져 시험이 흔들린다
- 기존 테스트를 깨뜨리지 마라. 이유: 기존 `analyze` Worker와 그 시험은 그대로 둔다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
