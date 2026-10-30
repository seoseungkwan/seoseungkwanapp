# Step 4: dx-check

> **TASK-11** 추천 상병 · 상병 확인 (골든) · **REQ-011** · AC-011.1 ~ AC-011.4
> Phase 2 `precheck-2-rules` · Step 4 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-011에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-011.1**: 가짜 자료와 상병 추세로 `recommendDx(code, name)`가 원본 `recommend`와 같은 `{visits, list[{dx, nm, src, ex, t}]}`를 돌려준다(원본 상수 `TOP=3`·`LIFT=150`·`EX_SHARE=700`, 골든)
- **AC-011.2**: 진료 하나에 `dxIssues(visit)`·`needsCheck`·`missingDx`가 원본과 같다(불완전 코드 I·주상병 불가 N 표 포함, 골든)
- **AC-011.3**: 병원 설정의 상병 연결표(원본 `snapshot.rules` 모양 `[rx, dx, nm, ex, src]`)가 원본과 같은 우선순위로 섞인다(골든)
- **AC-011.4**: 상병 추세가 없으면 고시·연결표만으로 추천하고 오류를 내지 않는다(원본과 같음)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·017·018·019
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-011
- `/specs/precheck/design.md` — 2절 표(추천 상병·상병 확인 원본), 8-1절(`dx_links` jsonb), 10절(골든), 15절(상병 연결표)
- `/specs/precheck/tasks.md` — TASK-11 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `src/lib/precheck/data/dxFlags.json`, `src/workers/precheck/tables.ts` (Step 0)
  - `src/lib/precheck/shape.ts`, `src/types/precheck.ts`(`DxTrend`), `fixtures/precheck/make-fake-claims.ts` (Step 2)
  - `scripts/precheck/golden/*`(원본 스크립트 꺼내기 방식), `src/lib/precheck/rules/*` (Step 3)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html` 안 `<script id="new-medicore-dx-recommend">` (`recommend`·`issues`·`needsCheck`·`missingDx`, `TOP`·`LIFT`·`EX_SHARE`)
  - `tools/claim_dx_recommend.py`, `tools/claim_diagnoses.py`
  - `assets/knowledge/dx_flags.json`
  - `tests/test_claim_dx_recommend.py`, `tests/test_claim_diagnoses.py`, `tests/test_rx_dx_trend.py`

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/precheck/dx/*`
  - `scripts/precheck/golden/*`
  - `fixtures/precheck/golden/dx-*.json`
  - `fixtures/precheck/fake/*`
  - `fixtures/precheck/make-fake-claims.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/types/precheck.ts`
- Tests:
  - `src/lib/precheck/dx/recommend.test.ts`
  - `src/lib/precheck/dx/golden.test.ts`
  - `src/workers/precheck/jobs.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-017)
- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 골든
- `scripts/precheck/golden/dx.mjs`(Step 3 스크립트와 같은 꺼내기 방식): `<script id="new-medicore-dx-recommend">`을 `node:vm`에서 돌려 `recommend`·`issues`·`needsCheck`·`missingDx` 결과를 `fixtures/precheck/golden/dx-*.json`에 쓴다. 머리 `{source, file, entry, knownDiffs}`
- 사례: 상병 추세 있음/없음(AC-011.4), I·N 표에 걸리는 코드(AC-011.2), 상병 연결표 있음·없음·우선순위가 부딪히는 경우(AC-011.3)

### 2. 코드 (`src/lib/precheck/dx/*`)
```ts
export type DxLink = [rx: string, dx: string, nm: string, ex: number | string, src: string]   // 원본 snapshot.rules 한 줄
export function recommendDx(code: string, name: string, ctx: { trend: DxTrend | null; links: DxLink[]; tables: Tables }): { visits: number; list: { dx: string; nm: string; src: string; ex: number; t: string }[] }
export function dxIssues(visit: Visit, tables: Tables): DxIssue[]
export function needsCheck(visit: Visit, tables: Tables): boolean
export function missingDx(visit: Visit, tables: Tables): string[]
```
- 원본 줄을 그대로 옮긴다. 상수 `TOP=3`·`LIFT=150`·`EX_SHARE=700`을 원본 이름 그대로 둔다
- 상병 연결표(`links`)는 서버 설정 `claim_hospital_settings.dx_links`(TASK-12)에서 온다. 이 step에서는 인자로만 받는다

### 3. Worker 연결
- `jobs.ts`: 점검 결과 보기 모양에 진료마다 추천 상병과 상병 확인 경고를 더한다(`jobs.check`가 `runRules`와 함께 부름)
- `src/types/precheck.ts`: `DxIssue`·추천 모양

### 4. 시험
- `recommend.test.ts`: 상수·우선순위·추세 없음 단위 시험
- `golden.test.ts`: 골든과 깊은 비교(AC-011.1~011.3), 추세 없음에서 오류 없음(AC-011.4)
- `jobs.test.ts`: 보기 모양에 추천·경고가 들어감

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/precheck/dx/recommend.test.ts src/lib/precheck/dx/golden.test.ts src/workers/precheck/jobs.test.ts
npx vitest run src/lib/precheck/rules/golden.test.ts src/lib/precheck/rules/coverage.test.ts   # Step 3 골든 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-011.1 ~ AC-011.4이 이 TASK의 시험과 이어져 보여야 한다

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

- 추천 상병을 진료 자료에 자동으로 넣지 마라. 이유: 추천은 보여 주기만 한다. 상병을 바꾸는 것은 사람이 비트에서 한다(원본도 같음)
- 상수(`TOP`·`LIFT`·`EX_SHARE`)나 우선순위를 조정하지 마라. 이유: 원본과 같은 결과가 목표다(AC-011.1·011.3)
- 생성기 사례를 바꾸면서 Step 3 골든을 다시 만들지 않은 채 두지 마라. 이유: 가짜 자료가 바뀌면 규칙 골든도 원본으로 다시 만들어 맞춘다
- 기존 테스트를 깨뜨리지 마라. 이유: 규칙 골든·덮기 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
