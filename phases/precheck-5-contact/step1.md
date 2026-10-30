# Step 1: followup-logic

> **TASK-24** F/U · 정기 주사 목록 계산 (골든) · **REQ-024** · AC-024.1 ~ AC-024.4
> Phase 5 `precheck-5-contact` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-24 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-024에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-024.1**: 가짜 증상 글로 `parseFU(visitDate, lines)`가 원본처럼 '1주/N주 뒤·내일·모레·다음주+요일·N월 초/중/말'과 적어 둔 날짜(10.17·10/19·10월 17일, 120일 안)를 읽어 `{dateStr, sortDate, kind(예정·조건부), evidence}`(골든, JS·Python 원본)
- **AC-024.2**: 'N차' 기록에 `aragan`이 원본처럼 N < 3이면 다음 날짜를 +7일(골든)
- **AC-024.3**: 진료 기록으로 `scheduleRows`·`undecidedRows`·`visitKind`가 원본과 같은 내원 예정 명단·추후 재내원(미정)과 주사·F/U 구분(골든)
- **AC-024.4**: 정기 주사 기본값(원본 `DEFAULTS`: 연골 `A49` 3차 6개월, 비타민 D `A32` 3개월)과 기록으로 `recallCompute`·`recallSelect(from, to, overdue)`·`recallStatus`가 원본처럼 마지막 기록에서 달을 더해(말일 맞춤) 날짜를 내고 "지남 N일"·"오늘"·"N일 남음"(골든)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-024
- `/specs/precheck/design.md` — 2절 표(F/U 목록·정기 주사 명단 원본), 10절(골든: JS는 `node:vm`, Python은 `python3 -I`)
- `/specs/precheck/tasks.md` — TASK-24 (수정 범위·메모)
- `/src/lib/analytics/dates.ts` (달 더하기·말일 맞춤은 여기 함수로)
- 이전 step에서 만든 파일:
  - `helper/src/Precheck.Core/Contact/*` (Step 0: `contact.targets` JSON 모양)
  - `src/workers/precheck/jobs.ts`·`assemble.ts`, `fixtures/precheck/make-fake-claims.ts`, `scripts/precheck/golden/*` (Phase 2~4)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/revisit_schedule.html` (`parseFU`·`aragan`·`visitKind`·`scheduleRows`·`undecidedRows`)
  - `tools/revisit_source_parts.py` (적어 둔 날짜 읽기 — Python 원본)
  - `tools/revisit_source_boot.js` (`NEW_MEDICORE_RECALL`: `DEFAULTS`·`compute`·`select`·`status`)
  - `tests/test_revisit_source.py`, `tests/test_revisit_import_html.py`

## 수정 범위 (tasks.md TASK-24)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/precheck/followup/*`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/followup-*.json`
  - `fixtures/precheck/fake/*`
  - `fixtures/precheck/make-fake-claims.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/types/precheck.ts`
- Tests:
  - `src/lib/precheck/followup/parseFU.test.ts`
  - `src/lib/precheck/followup/recall.test.ts`
  - `src/lib/precheck/followup/golden.test.ts`
  - `src/workers/precheck/jobs.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 골든 (`scripts/precheck/golden/followup.mjs` + Python)
- JS: `revisit_schedule.html`의 스크립트와 `revisit_source_boot.js`를 `node:vm`에서 가짜 기록으로 돌린다 → `fixtures/precheck/golden/followup-*.json`
- Python: `revisit_source_parts.py`를 `python3 -I`로(원본 경로를 `sys.path`에 넣는 작은 실행 글을 `scripts/precheck/golden/`에 둔다) — 적어 둔 날짜 사례
- 기준 날짜(오늘)를 고정해 넣는다. 골든이 실행 날짜에 따라 바뀌지 않게
- 가짜 사례를 `make-fake-claims.ts`에 더한다: '1주 뒤'·'내일'·'모레'·'다음주 화요일'·'11월 초/중/말'·'10.17'·'10/19'·'10월 17일'·120일 넘는 날짜·'2차'·'3차'·연골 `A49`·비타민 D `A32`·말일(1/31 + 1개월)

### 2. 코드 (`src/lib/precheck/followup/*`)
```ts
export function parseFU(visitDate: string, lines: string[], today: string): { dateStr: string; sortDate: string; kind: '예정' | '조건부'; evidence: string }[]
export function aragan(records: …): …
export function visitKind(visit: …): '주사' | 'F/U' | …
export function scheduleRows(records: …, from: string, to: string): ScheduleRow[]
export function undecidedRows(records: …): UndecidedRow[]
export const RECALL_DEFAULTS = /* 원본 DEFAULTS 그대로 */
export function recallCompute(records: …, defaults = RECALL_DEFAULTS): RecallRow[]
export function recallSelect(rows: RecallRow[], from: string, to: string, overdue: boolean): RecallRow[]
export function recallStatus(row: RecallRow, today: string): string   // "지남 N일" | "오늘" | "N일 남음"
```
- 원본 줄을 옮기되 날짜 계산은 `dates.ts` 함수로 한다(달 더하기 말일 맞춤 포함). 결과는 원본과 같아야 한다
- `jobs.ts`: `followup(contactJson, today)` → F/U·정기 주사 보기 모양(`ContactView`)

### 3. 시험
- `parseFU.test.ts`(표현마다, AC-024.1·024.2), `recall.test.ts`(AC-024.4, 말일), `golden.test.ts`(AC-024.1~024.4), `jobs.test.ts`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-24 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-24 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/precheck/followup/parseFU.test.ts src/lib/precheck/followup/recall.test.ts src/lib/precheck/followup/golden.test.ts src/workers/precheck/jobs.test.ts
npx vitest run src/lib/precheck/rules/golden.test.ts src/lib/precheck/memo/golden.test.ts   # 가짜 자료를 바꿔도 앞 골든 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-24 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-024.1 ~ AC-024.4이 이 TASK의 시험과 이어져 보여야 한다

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

- `new Date()`(오늘)를 함수 안에서 직접 읽지 마라. 이유: 결과가 실행 날짜에 따라 바뀌어 골든이 깨진다. 오늘은 인자로 받는다
- 날짜 표현 읽기 규칙을 넓히거나 줄이지 마라. 이유: 원본과 같은 명단이 나와야 의원 PC에서 양지바른과 비교된다(AC-024.1)
- 정기 주사 기본값(`A49`·`A32` 주기)을 바꾸지 마라. 이유: 원본 `DEFAULTS` 그대로가 AC다(AC-024.4)
- 기존 테스트를 깨뜨리지 마라. 이유: 가짜 자료를 바꾸면 앞 골든을 원본으로 다시 만들어 맞춘다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
