# Step 1: rx-trend

> **TASK-28** 처방 추세 · **REQ-028** · AC-028.1 ~ AC-028.4
> Phase 6 `precheck-6-stats` · Step 1 — `docs/precheck/plan.md` §6
> 명세 `specs/precheck/`는 사용자가 승인했다. 이 step은 TASK-28 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`의 REQ-028에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-028.1**: 추세 사실로 `buildTrend({from, to, bucket, comparison, scope, codes})`가 원본 `TrendMath.Build`처럼 일·주·월 칸마다 건수·소모량·금액. 원본 `TrendTests.cs`의 사례·기대값을 그대로 옮겨 통과
- **AC-028.2**: 비교 기간(원본 `TrendComparison`)에 `comparisonRange`·`comparisonLabel`이 원본과 같은 기간·이름(원본 시험 사례)
- **AC-028.3**: 신환·재진 나눔(원본 `SplitByFirstVisit`)이 원본과 같다. 금액은 원 단위 정수로 더하고 반올림하지 않는다
- **AC-028.4**: 파일 올리기 자료(금액·소모량 없음)로 추세를 만들면 건수만, 금액·소모량은 `null`('자료 없음')

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021·022
- `/docs/precheck/plan.md` §6 (Phase·Step 순서)
- `/specs/precheck/requirements.md` — REQ-028
- `/specs/precheck/design.md` — 2절 표(처방 추세 원본), 10절(C# 원본만 있는 계산은 원본 시험 사례를 옮긴다), 15절(통계 금액·소모량)
- `/specs/precheck/tasks.md` — TASK-28 (수정 범위·메모)
- `/src/lib/analytics/dates.ts` (일·주·월 칸 — 주 시작 규칙은 지금 통계와 같게)
- `/src/lib/analytics/compare.ts`, `/src/types/analysis.ts` (지금 통계 모양)
- 이전 step에서 만든 파일:
  - `src/workers/precheck/statsRows.ts`(`toTrendFacts`), `src/types/precheck.ts`(`TrendFact`) (Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 브랜치 `main`, 폴더 `YangjiBareun_사전점검/`, 커밋 `2a1069b` (README 1.24.5)
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 이 사본은 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다(GitHub 비교로 확인). 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `vendor/drbit_export/TrendMath.cs` (`Build`·`SplitByFirstVisit`)
  - `vendor/drbit_export/TrendContracts.cs` (`TrendBucket`·`TrendComparison`·`TrendPatientScope`·`TrendValues`)
  - `vendor/drbit_export/TrendTests.cs` (옮길 사례·기대값)
  - `vendor/drbit_export/AnalysisDetails.cs`·`AnalysisDetailsTests.cs` (비교 이름이 여기 있으면 참고)

## 수정 범위 (tasks.md TASK-28)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/analytics/rxTrend.ts`
  - `src/lib/analytics/rxTrend.test.ts`
  - `src/types/analysis.ts`
- Tests:
  - `src/lib/analytics/rxTrend.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/bridge`·`src/lib/precheck`·`src/workers`(그리고 기존 `lib/parsers`·`lib/analytics`·`lib/payload`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만 쓴다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 자체(예: `mx999_v22.html`)를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 옮긴 표, 골든 결과, design.md 10절이 정한 원본 SQL 사본뿐이다 (tasks.md 머리말)

## 작업

### 1. 코드 (`src/lib/analytics/rxTrend.ts`, 환자 자료 구역)
```ts
export type TrendBucket = 'day' | 'week' | 'month'
export type TrendComparison = /* 원본 enum 값 그대로 */
export type TrendScope = /* 원본 TrendPatientScope 그대로 */
export type TrendPoint = { key: string; count: number; quantity: number | null; amount: number | null }
export function buildTrend(facts: TrendFact[], req: { from: string; to: string; bucket: TrendBucket; comparison: TrendComparison; scope: TrendScope; codes: string[] }): { current: TrendPoint[]; previous: TrendPoint[] | null; split?: … }
export function comparisonRange(from: string, to: string, c: TrendComparison): { from: string; to: string } | null
export function comparisonLabel(c: TrendComparison, …): string
export function splitByFirstVisit(facts: TrendFact[], …): { newPatients: TrendFact[]; returning: TrendFact[] }
```
- 원본 C# 줄을 옮긴다. 날짜·칸 키는 `dates.ts`(원본 주 시작 규칙과 지금 통계 규칙이 다르면 원본을 따르고 summary에 적는다)
- 금액은 정수로 더한다. 소모량은 원본처럼 소수가 될 수 있다(금액만 정수 규칙)
- 파일 자료(AC-028.4): 사실에 금액·소모량이 없으면 칸 값이 `null`

### 2. 시험 (`rxTrend.test.ts`)
- 원본 `TrendTests.cs`의 사례·기대값을 하나씩 옮긴다(시험 이름에 AC ID와 원본 시험 이름). 일·주·월(AC-028.1), 비교 기간·이름(AC-028.2), 신환·재진 나눔·금액 정수(AC-028.3), 파일 자료 `null`(AC-028.4)
- `src/types/analysis.ts`에 추세 모양을 더한다(지금 모양은 고치지 않는다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-004.3 chrome.runtime이 없으면 no-extension', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-28 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-28 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/analytics/rxTrend.test.ts
npx vitest run src/lib/analytics/compare.test.ts src/lib/analytics/aggregate.test.ts   # 지금 통계 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-28 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status precheck`에서 AC-028.1 ~ AC-028.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/precheck-6-stats/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 금액을 `Math.round`·`toFixed`로 반올림하지 마라. 이유: 원 단위 정수, 반올림 없음(CLAUDE.md, AC-028.3)
- 파일 자료의 금액·소모량을 0으로 채우지 마라. 이유: 없는 것과 0은 다르다. `null`('자료 없음')이다(AC-028.4)
- 원본 시험 기대값을 우리 결과에 맞춰 바꾸지 마라. 이유: 원본 `TrendTests.cs` 값 그대로가 AC다(AC-028.1)
- 기존 `src/types/analysis.ts` 모양을 바꾸지 마라(더하기만). 이유: 지금 통계 코드와 시험이 그 모양을 쓴다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 시험이 계속 통과해야 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
