# Step 0: memo-text

> **TASK-14** 청구메모 문장 (골든) · **REQ-014** · AC-014.1 ~ AC-014.14
> Phase 3 `precheck-3-memo` · Step 0 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-014에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-014.1**: 가짜 자료와 원본 기본 병원 문구(`TPL_DEF`·`FIXED_PHRASES_DEF`·`SITE_NAMES_DEF`)로 `buildMemo(visit, region, phrases)`·`memoText`가 원본 `buildMemo`·`compose`·`fill`과 같은 문장(골든 `memo-*.json`)
- **AC-014.2**: 문구 틀의 말(`좌우`·`한글방향`·`영문방향`·`레벨`·`부위`·`시술`·`약제`·`KLG`·`검사`·`기간`·`진단`·`영상`)을 원본 `fill`과 같게 채우고, 모르는 말은 원본처럼 둔다(골든)
- **AC-014.3**: 병원 문구 값에 `validatePhrases`·`defaultPhrases`·`diffPhrases`가 원본 `claim_hospital_settings.js`의 `validate`·`defaults`·`diff`와 같은 결과(원본 `sideRuleVersion` 1→2 바꿈 포함, 골든)
- **AC-014.4**: 사용자가 고친 메모는 다시 점검해도 원본처럼 그대로 두고 빠진 문장만 경고한다(원본 `savedMemoMissing`, 골든)
- **AC-014.5**: `fullText(visit, phrases, tables)`가 원본 `fullText`·`fullTextBody`와 같은 글(골든 `memo-full-*.json`): `memoText` 묶음 + `rxLines` + `iaLines` + `noteLines` + `patientLines`, `lineKey`, `formatLevels`, `sentenceMemo`, `styleSides`, `gapify`, `oneLineMemo`. 비트에 들어가는 글은 이것이다
- **AC-014.6**: `applyRx`·`computeIntervals`·문구 사전(`NEW_MEDICORE_DICTIONARY`) 결과가 원본과 같다(골든). 내원 간격은 읽은 기간 전체(AC-013.13)의 급여 처방으로 원본에서 덮어쓴 판을 따른다. 12개월 이력으로 계산하지 않는다
- **AC-014.7**: 문구·표기·약은 인자로 받은 설정에서만 읽는다. `ourClinicPhrases()`로 만든 `fullText`는 원본 기본값과 같다(다른 곳은 AC-014.10의 약뿐, `knownDiffs`). `scripts/precheck/our-clinic-settings.mjs <병원 ID>`는 이 값을 넣는 SQL 한 벌을 출력한다
- **AC-014.8**: 병원 설정 줄이 없거나 문구 칸이 `validatePhrases`를 지나지 못하면(빈 `{}`·`procedureDrugs` 없음 포함) 규칙·상병 결과는 그대로 내고 메모는 만들지 않으며 `memoBlocked: 'E-MEMO-NO-SETTINGS'`. 기본값으로 대신 만들지 않는다
- **AC-014.9**: 시술 종류가 하나인 진료: `procedureDrugs`의 '넣기'는 고른 자리(`afterProc`·`afterEnding`·`ownLine`)에, '빼기'는 뺀다. 아직 안 정한 약은 `[약 확인: 약 이름]`. 대상은 `CODEMAP.k='drug'` 약 전부이고 국소마취제·연골주사약도 같다. 메모를 만들 때는 설정에 적힌 값만 보고, 적히지 않은 약은 마취제도 아직 안 정한 약이다(마취제 '빼기' 기본값은 설정을 채울 때 쓴다)
- **AC-014.10**: 시술 종류가 둘 이상인 진료: 한 시술이라도 '넣기'이거나 아직 안 정했으면 늘 `[약 확인: 약 이름]`이고 자동으로 넣지 않는다. 모든 시술에서 '빼기'일 때만 뺀다. 국소마취제·연골주사약도 같다(원본 `ambiguousDrug`·`cartilageLine`과 일부러 다름, `knownDiffs`)
- **AC-014.11**: 설정이 바뀌면 손대지 않은 자동 메모만 새 설정으로 다시 만든다. 고쳤거나 완료한 메모는 그대로(원본 `protectWork`)
- **AC-014.12**: `unfinished(memo)`가 원본 `unresolved`와 같은 판단. `[약 확인: …]`도 확인 표시다
- **AC-014.13**: 상병 자료가 있는데 상병이 없고 처방은 비급여뿐이며 부위 메모가 있는 진료는 `missingDx`가 참. `dxViews`의 `hasMemo`를 이 TASK가 잇는다
- **AC-014.14**: 부위 메모는 있는데 시술 종류(`procKeys`)가 0이고 약이 있으면 원본과 같이 약 글도 `[약 확인]`도 없다(사용자 결정)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-014
- `/specs/precheck/design.md` — 2절 표(청구메모 문장·병원 문구·메모 전체 글 원본), 8-1절(`claim_hospital_settings.phrases`), 8-4절(값 감싸기), 10절(골든), 19-2·19-3·19-4·19-9절
- `/docs/precheck/clinic-memo-plan.md` §7·§9, `/docs/precheck/clinic-memo-samples.md` (약 결정의 근거. 약 규칙은 design.md 19-4 표가 이 글보다 앞선다)
- `/specs/precheck/tasks.md` — TASK-14 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `src/lib/precheck/shape.ts`·`src/types/precheck.ts`, `fixtures/precheck/make-fake-claims.ts` (Phase 2 Step 2)
  - `scripts/precheck/golden/*` (Phase 2 Step 3·4: 원본 스크립트 꺼내기 방식)
  - `src/lib/storage/claimSettings.ts`의 `readHospitalSettings` (Phase 2 Step 5: `phrases` 모양)
  - `src/workers/precheck/jobs.ts`(`dxViews`, TASK-11), `src/lib/precheck/dx/recommend.ts`(`dxContext`의 `hasMemo`) (Phase 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `assets/mx999_v22.html` 본 스크립트: `buildMemo`·`compose`·`fill`·`memoText`·`savedMemoMissing`, 문구 틀 `TPL_DEF`·`FIXED_PHRASES_DEF`·`SITE_NAMES_DEF`, `sideRuleVersion`
  - 같은 파일의 메모 전체 글: `fullText`·`fullTextBody`(3986~4010줄), `rxLines`·`iaLines`·`noteLines`·`patientLines`·`lineKey`·`styleSides`·`gapify`·`oneLineMemo`, `applyRx`, 덮어쓴 판 `computeIntervals`(7788줄), `NEW_MEDICORE_DICTIONARY`(7466줄), `NEW_MEDICORE_CLAIM_REVIEW_SAFETY`의 `formatLevels`·`sentenceMemo`·`unresolved`, `protectWork`, `ambiguousDrug`·`procKeys`, `cartilageLine`·`iaKind`, `TPL.drugLocal`
  - `tools/claim_hospital_settings.js` (`defaults`·`validate`·`diff`)
  - `tests/test_claim_memo.py`, `test_claim_hospital_settings.py`, `test_claim_side_policy_v2.py`, `test_claim_text.py`, `test_claim_review_safety.py`(`savedMemoMissing`)

## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/precheck/memo/*`
  - `scripts/precheck/golden/*`
  - `scripts/precheck/our-clinic-settings.mjs`
  - `fixtures/precheck/our-clinic-settings.test.ts`
  - `fixtures/precheck/golden/memo-*.json`
  - `fixtures/precheck/golden/phrases-*.json`
  - `fixtures/precheck/fake/*`
  - `fixtures/precheck/make-fake-claims.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/types/precheck.ts`
  - `src/lib/errors.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/lib/precheck/memo/buildMemo.test.ts`
  - `src/lib/precheck/memo/fullText.test.ts`
  - `src/lib/precheck/memo/drugs.test.ts`
  - `src/lib/precheck/memo/ourClinic.test.ts`
  - `src/lib/precheck/memo/phrases.test.ts`
  - `src/lib/precheck/memo/golden.test.ts`
  - `fixtures/precheck/our-clinic-settings.test.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **골든 테스트**: 같은 가짜 자료를 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/precheck/golden/`의 스크립트로 한 번 만들어 `fixtures/precheck/golden/<이름>.json`에 커밋한다. JS 원본은 `node:vm`으로(원본 시험 `tests/test_claim_html.py`가 스크립트를 꺼내는 방식과 같게), Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": … }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 골든 시험은 원본 없이 커밋한 골든 파일과 비교해서 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요) (design.md 10절)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`). 실제 비트 내보내기·청구 파일(`*.GHP`·`*.CAR`)을 커밋하지 않는다 (CLAUDE.md, design.md 10절)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 골든
- `scripts/precheck/golden/memo.mjs`: `mx999_v22.html` 본 스크립트에서 `buildMemo`·`compose`·`fill`·`memoText`·`savedMemoMissing`과 문구 틀 상수를 꺼내 `node:vm`에서 돌린다 → `fixtures/precheck/golden/memo-*.json`
- 같은 스크립트로 `fullText`와 그 부품·재료를 돌려 `fixtures/precheck/golden/memo-full-*.json`을 만든다. `computeIntervals`·`iaLines`·`noteLines`·`rxLines`는 원본 뒤쪽 스크립트가 덮어쓴 판이 실제로 도니, 스크립트를 끝까지 돌린 뒤의 함수로 만든다(design.md 19-2)
- `scripts/precheck/golden/phrases.mjs`: `tools/claim_hospital_settings.js`의 `defaults`·`validate`·`diff`를 돌린다(틀린 값·옛 `sideRuleVersion: 1` 사례 포함) → `fixtures/precheck/golden/phrases-*.json`
- 머리 `{source, file, entry, knownDiffs}`

### 2. 코드 (`src/lib/precheck/memo/*`)
```ts
export type Phrases = { /* 원본 claim_hospital_settings 모양 + procedureDrugs(design.md 19-3) */ }
export function ourClinicPhrases(): Phrases                       // 우리 병원 값. 앱 코드에 병원 ID를 두지 않는다
export function fullText(visit: Visit, phrases: Phrases, tables: Tables): string   // 비트에 들어가는 글(AC-014.5)
export function unfinished(memo: string): boolean                 // 원본 unresolved(AC-014.12)
export function defaultPhrases(): Phrases                         // 원본 TPL_DEF·FIXED_PHRASES_DEF·SITE_NAMES_DEF
export function validatePhrases(p: unknown): { ok: true; value: Phrases } | { ok: false; errors: { path: string; code: string }[] }
export function diffPhrases(a: Phrases, b: Phrases): PhraseDiff
export function buildMemo(visit: Visit, region: Region, phrases: Phrases, tables: Tables): MemoParts
export function memoText(parts: MemoParts): string
export function savedMemoMissing(saved: string, fresh: MemoParts): string[]   // 고친 메모에서 빠진 문장
```
- 원본 줄을 그대로 옮긴다. `fill`이 모르는 말은 원본처럼 남긴다(AC-014.2)
- `sideRuleVersion` 1 → 2 바꿈을 `validatePhrases`/`defaultPhrases` 흐름에 원본 그대로(AC-014.3)
- 병원 문구는 서버 `claim_hospital_settings.phrases`가 원본이다. 이 step은 순수 함수만 만든다(화면은 TASK-18)
- 약 규칙은 design.md 19-4 표대로(AC-014.9·014.10). 골든 `knownDiffs`에는 시술 종류가 둘 이상인 날의 주사약(`ambiguousDrug`)과 연골주사 줄(`cartilageLine`)을 이유와 함께 적는다. 시술 종류가 0인 날은 원본과 같으므로 적지 않는다. 원본 `validate`·`defaults`·`diff` 골든은 원본 칸만 보고 `procedureDrugs`는 따로 검사한다
- 오류 번호 `E-MEMO-NO-SETTINGS`를 `lib/errors.ts`에 더한다. 문구는 '처음 질문을 먼저 해 주세요'

### 2-1. 우리 병원 설정 (`scripts/precheck/our-clinic-settings.mjs`)
- `<병원 ID>`를 받아 `ourClinicPhrases()` 값을 `claim_hospital_settings`에 넣는 SQL 한 벌을 출력한다(값 감싸기는 design.md 8-4). 환자 정보가 없다. 운영 DB에 직접 넣지 않는다. 붙여 넣기는 사용자가 한다(Phase 3 의원 PC 시험 전)

### 3. Worker 연결 (`jobs.ts`)
- 점검 보기 모양에 진료마다 메모 초안(`fullText`)을 더한다. 고친 메모는 인자로 받아, 있으면 그것을 두고 `savedMemoMissing` 경고만 붙인다(AC-014.4). `store.load`의 저장값을 이 인자에 잇는 것은 TASK-16이다(`loadPart`). 이 step의 시험은 가짜 값을 넘긴다
- 설정 줄이 없거나 `validatePhrases`를 지나지 못하면 메모 없이 `memoBlocked: 'E-MEMO-NO-SETTINGS'`(AC-014.8). 손대지 않은 자동 메모만 새 설정으로 다시 만든다(AC-014.11)
- `dxViews`에 메모 결과를 넘겨 `dxContext`의 `hasMemo`를 잇는다(AC-014.13). `jobs.check`에 `dxViews`를 잇는 것은 TASK-13이다(AC-013.14)

### 4. 시험
- `buildMemo.test.ts`(말 채우기 단위), `fullText.test.ts`(AC-014.5·014.6), `drugs.test.ts`(AC-014.9, AC-014.10의 세 경우마다 한 사례 이상, 연골주사약 사례 포함, AC-014.14), `ourClinic.test.ts`(AC-014.7, AC-014.9: 코드 표의 약 5개 × 시술 15개 칸마다 값이 있음), `phrases.test.ts`(검사·기본값·차이), `golden.test.ts`(AC-014.1~014.7·014.12 골든 깊은 비교), `our-clinic-settings.test.ts`(출력한 SQL을 PGlite에서 돌려 같은 값을 읽는다), `jobs.test.ts`(초안·고친 메모 유지, AC-014.8·014.11·014.13), `errors.test.ts`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/precheck/memo/buildMemo.test.ts src/lib/precheck/memo/fullText.test.ts src/lib/precheck/memo/drugs.test.ts src/lib/precheck/memo/ourClinic.test.ts src/lib/precheck/memo/phrases.test.ts src/lib/precheck/memo/golden.test.ts fixtures/precheck/our-clinic-settings.test.ts src/workers/precheck/jobs.test.ts src/lib/errors.test.ts
npx vitest run src/lib/precheck/rules/golden.test.ts src/lib/precheck/dx/golden.test.ts   # 앞 골든 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-014.1 ~ AC-014.14가 이 TASK의 시험과 이어져 보여야 한다

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

- 고친 메모를 새 초안으로 덮어쓰지 마라. 이유: 사용자가 고친 글이 사라진다. 원본처럼 그대로 두고 빠진 문장만 알린다(AC-014.4)
- 문구 틀·말 채우기 규칙을 '자연스럽게' 다듬지 마라. 이유: 원본과 같은 문장이어야 심평원 메모가 양지바른 때와 같다(AC-014.1)
- `memoText`만 비트에 보낼 글로 삼지 마라. 이유: 원본이 입력하는 글은 `fullText`다(AC-014.5)
- 설정 줄이 없는 병원에 기본값으로 메모를 만들어 주지 마라. 이유: 다른 병원은 가입 질문이 생길 때까지 메모를 만들지 않는다(AC-014.8, 사용자 결정)
- 설정에 없는 약을 이름이나 역할로 짐작해 넣거나 빼지 마라(마취제도 같다). 이유: 국소마취제·연골주사약도 시술별로 고르고 마취제는 '빼기'에서 시작하는 것은 사용자 결정이고, 메모를 만들 때 설정에 없는 값을 `[약 확인: 약 이름]`으로 남겨 자동 입력하지 않는 것은 **(Claude 판단)**이다(AC-014.9)
- 시술 종류가 둘 이상인 진료에서 '넣기'가 한 시술뿐이라고 그 시술에 약을 넣지 마라. 이유: 그 옛 규칙은 사용자가 없앴다(AC-014.10)
- 앱 코드에 특정 병원 ID를 두지 마라. 이유: 우리 병원 값은 SQL을 사용자가 붙여 넣어 넣는다(design.md 19-3)
- 메모 글을 진단 기록·오류 메시지·시험 이름에 넣지 마라. 이유: 메모에는 환자 진료 내용이 들어간다
- 기존 테스트를 깨뜨리지 마라. 이유: 가짜 자료를 바꾸면 규칙·상병 골든도 원본으로 다시 만들어 맞춘다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
