# Step 0: rule-data

> **TASK-7** 규칙표 · 약 · 상병 표 · **REQ-007** · AC-007.1 ~ AC-007.5
> Phase 2 `precheck-2-rules` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-007에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-007.1**: `src/lib/precheck/data/rules.json`은 원본 `tools/precheck_rules.json`(2a1069b)과 같은 `version`·`code_groups`(76)·`drug_classes`(27)·`regions`(16키)와 규칙 262개. 규칙마다 원본 16칸(`id`·`domain`·`title`·`type`·`params`·`grade`·`message`·`basis`·`confidence`·`data_needed`·`automatable`·`stage`·`enabled_default`·`effective_from`·`effective_to`·`notes`)이 같고, `id`가 겹치지 않으며, `grade`는 `확인필요`·`알림`·`참고`, `basis`마다 `doc`·`number`
- **AC-007.2**: `dxFlags.json`(원본 `assets/knowledge/dx_flags.json`의 I·N 목록)·`drugInfo.json`(edi → 분류·성분)·`codeMap.json`(원본 기본 CODEMAP)이 원본과 줄 수·값이 같다
- **AC-007.3**: 옮기기 스크립트 `scripts/precheck/import-tables.mjs`를 같은 원본으로 두 번 돌리면 같은 바이트의 파일. 원본 경로는 인자로만, 저장소에 원본을 두지 않는다
- **AC-007.4**: `src/` 전체에서 표 파일(`lib/precheck/data/*.json`)을 부르는 곳은 `src/workers/precheck/tables.ts`의 글자로 고정한 동적 `import()`뿐, 정적 import 없음(시험: 소스 검사). 다른 화면 번들에 표가 들어가지 않는다
- **AC-007.5**: `loadTables()`는 네 표를 한 번만 불러 기억하고, 실패하면 `E-RULES-LOAD-FAILED`(점검을 시작하지 않는다)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-007
- `/specs/precheck/design.md` — 2절 표(점검 규칙·추천 상병 원본), 3절(`lib/precheck/data/`), 8-1절(규칙 ID 제약 `^[A-Z]{2}-[0-9]{2,3}[a-z]?$`), 15절(표는 Worker의 `import()`)
- `/specs/precheck/tasks.md` — TASK-7 (수정 범위·메모)
- `/eslint.config.mjs` (환자 자료 구역: 동적 `import()`는 글자 경로만)
- `/src/workers/analyzeFiles.ts`, `/src/workers/analyze.worker.ts` (기존 Worker 방식)
- 이전 step에서 만든 파일:
  - `eslint.config.mjs`·`src/guardrails.test.ts` (Phase 1 Step 3: `lib/precheck`가 환자 자료 구역)
  - `src/lib/errors.ts`, `src/types/errors.ts` (Phase 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `tools/precheck_rules.json` (규칙 262개, `version`·`meta`·`code_groups`·`drug_classes`·`regions`·`rules`)
  - `assets/knowledge/dx_flags.json` (상병 I·N 목록)
  - `assets/knowledge/drug_class_map.json`·`medicore/drug_info.py` (원본 화면은 `NEW_MEDICORE_DRUG_INFO_FETCH`로 이 표에서 edi → `[분류, 성분, …]`을 받아 `DRUGINFO`에 넣는다, `assets/mx999_v22.html` 9350줄 부근 `setDrugInfo`)
  - `assets/mx999_v22.html` 2157줄 `let CODEMAP = {…}` (기본 CODEMAP, `CODEMAP_DEF`)
  - `tests/test_claim_precheck.py` (규칙표 모양 검사 사례)

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `scripts/precheck/import-tables.mjs`
  - `src/lib/precheck/data/*`
  - `src/lib/precheck/tables.ts`
  - `src/lib/precheck/tables.test.ts`
  - `src/workers/precheck/tables.ts`
  - `src/workers/precheck/tables.test.ts`
  - `src/types/precheck.ts`
  - `fixtures/precheck/fake-source/*`
  - `fixtures/precheck/import-tables.test.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/precheck/tables.test.ts`
  - `src/workers/precheck/tables.test.ts`
  - `fixtures/precheck/import-tables.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)
- **오류 문구 한 곳**: 오류 안내는 `src/lib/errors.ts`('무엇이 · 어떻게 고치나 · 번호'), 번호 타입은 `src/types/errors.ts`. 새 번호는 design.md 4-5 목록에서 고른다. 화면에 원래 오류 내용(예외 메시지·스택·도우미가 준 글)을 보이지 않는다 (CLAUDE.md)

## 작업

### 1. 옮기기 스크립트 `scripts/precheck/import-tables.mjs`
```
node scripts/precheck/import-tables.mjs --src "$YANGJI_SRC" --out src/lib/precheck/data
```
- 원본 네 곳을 읽어 `rules.json`·`dxFlags.json`·`drugInfo.json`·`codeMap.json`을 쓴다. 키 순서·들여쓰기·줄바꿈을 고정해 두 번 돌려도 같은 바이트가 나오게 한다(AC-007.3)
- `codeMap.json`: `mx999_v22.html`에서 `let CODEMAP = {` 블록을 꺼내 JSON으로 바꾼다(`node:vm`으로 그 블록만 평가해도 된다)
- `drugInfo.json`: edi → `[분류, 성분, …]`. 원본이 화면에 넘기는 모양과 같게 한다(크기가 크다 — 필요한 칸만 남기되 값은 원본 그대로)
- `scripts/`는 ESLint 밖이다(설정의 `ignores`). 원본 경로는 인자로만 받는다

### 2. 시험용 작은 원본 `fixtures/precheck/fake-source/*`
- 원본과 같은 폴더 모양의 아주 작은 가짜 원본(규칙 3개, 상병 몇 줄, 약 몇 줄, `mx999_v22.html` 흉내 파일에 짧은 `let CODEMAP = {…}`). 실제 원본을 복사하지 않는다
- `fixtures/precheck/import-tables.test.ts`: 가짜 원본으로 스크립트를 두 번 돌려 같은 바이트(AC-007.3), 원본 경로를 인자로 주지 않으면 실패

### 3. 표 파일 `src/lib/precheck/data/*` (원본에서 옮긴 결과, 커밋)
- `src/lib/precheck/tables.test.ts`: 규칙 262개, 16칸, `id` 겹침 없음·모양 `^[A-Z]{2}-[0-9]{2,3}[a-z]?$`(design.md 8-1 DB 제약과 같다), 등급 셋, `basis.doc`·`number`, `code_groups` 76·`drug_classes` 27·`regions` 16키(AC-007.1). `dxFlags`·`drugInfo`·`codeMap` 줄 수(AC-007.2 — 원본 줄 수는 스크립트가 표 안 `meta`나 시험 상수로 남긴다)
- 이 시험은 `node:fs`로 JSON을 읽는다(구역 안 시험이 가짜 파일을 `node:fs`로 읽는 것은 허용)

### 4. 불러오기
```ts
// src/lib/precheck/tables.ts — 표 타입과 검사(순수)
export type Tables = { rules: RulesFile; dxFlags: DxFlags; drugInfo: DrugInfo; codeMap: CodeMap }
export function checkTables(t: unknown): Tables          // 모양이 틀리면 던진다
// src/workers/precheck/tables.ts — 표를 부르는 유일한 곳
export async function loadTables(): Promise<Tables>      // 한 번만, 실패하면 E-RULES-LOAD-FAILED
```
- `loadTables`는 `import('@/lib/precheck/data/rules.json')`처럼 **글자로 고정한 경로**의 동적 import 네 개로 불러 기억한다. 실패하면 기억을 비우고 `E-RULES-LOAD-FAILED`
- `src/workers/precheck/tables.test.ts`: 한 번만 부름(가짜 로더 주입), 실패 → `E-RULES-LOAD-FAILED`(AC-007.5), **소스 검사**: `src/` 아래 모든 `.ts/.tsx`에서 `data/*.json`을 부르는 곳이 이 파일의 `import()`뿐(AC-007.4)
- `src/types/precheck.ts`: 표 타입(`RuleDef`·`Basis`·`Grade` 등). TASK-9가 이 파일에 계산 모양을 더한다
- 오류 번호 `E-RULES-LOAD-FAILED`를 `errors.ts`에 더한다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
node scripts/precheck/import-tables.mjs --src "$YANGJI_SRC" --out src/lib/precheck/data && git diff --exit-code src/lib/precheck/data   # 다시 돌려도 같음
npx vitest run src/lib/precheck/tables.test.ts src/workers/precheck/tables.test.ts fixtures/precheck/import-tables.test.ts src/lib/errors.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-007.1 ~ AC-007.5이 이 TASK의 시험과 이어져 보여야 한다

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

- 표 JSON을 화면 컴포넌트·`lib/precheck`의 다른 파일에서 정적으로 import하지 마라. 이유: 2.5MB 표가 모든 화면 번들에 들어간다. 부르는 곳은 `workers/precheck/tables.ts` 하나다(AC-007.4)
- 규칙 내용(문구·근거·등급·조건)을 옮기면서 고치지 마라. 이유: 원본과 같아야 골든 테스트가 맞는다. 고칠 것은 우리 앱 설정 화면에서 한다(사용자: 규칙은 우리 앱에서만 고친다)
- `fetch`로 표를 받지 마라. 이유: 환자 자료 구역은 네트워크를 못 쓴다. 정적 파일은 `import()`로 받는다(design.md 15절)
- 원본 HTML·Python 파일을 `fixtures/`에 복사하지 마라. 이유: 원본 파일은 커밋하지 않는다. 시험용 가짜 원본은 새로 지은 작은 파일이다
- 기존 테스트를 깨뜨리지 마라. 이유: `errors.ts` 문구 시험 등이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
