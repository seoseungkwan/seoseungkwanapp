# Step 1: rx-visit-split

> **TASK-9** 처방별 신환·재진 (골든 + Worker `split` 일) · **REQ-509** · AC-509.1 ~ AC-509.4
> Phase 3 · 숫자와 글 `stats-3-numbers` · Step 1 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-9 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-029 (AC-029.3·029.4) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-509(처방별 신환·재진 (`lib/analytics/rxVisitSplit.ts`))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-509.1**: Given Worker 메모리의 진료 줄(환자 번호·진료일·처방코드·첫 내원일)·기간 합계와 기간·코드 목록, When `rxVisitSplit`, Then 원본 `medicore/rx_visit_split.py`의 `summarize`처럼 처방마다 신환(첫 내원일 ≥ 기간 첫날)·재진 환자 수·합계와 기간 합계(내원·환자·신환·재진)를 낸다. 골든: 원본을 `python3 -I`로 같은 가짜 줄에 돌린 `fixtures/stats/golden/rx-visit-split-*.json`과 순서까지 같다
- **AC-509.2**: Given 같은 입력과 날짜별 합계, When `rxVisitSplitDays`, Then `summarize_days`처럼 날마다 처방별 신환(첫 내원일 = 그날)·재진 수가 골든과 같다
- **AC-509.3**: Given 결과와 병원 이름, When `formatRxVisitSplit`·`formatRxVisitSplitDays`·`rxVisitHeadline`, Then 원본 `format_text`·`format_days_text`·`headline`과 같은 글이다(골든)
- **AC-509.4**: Given Worker의 `split` 일, When 화면이 기간을 주면, Then Worker는 메모리의 진료 줄로 그 기간의 처방별 결과(처방마다 수와 이름만, 합계가 큰 차례, 같으면 코드 순)와 글을 보낸다. 환자 번호가 없다. 불러온 자료가 없거나 기간이 불러온 범위 밖이면 `{ kind: 'none' }`이다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-509
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-9, TASK-5(Worker `memory`)
- `/specs/stats/tasks.md` — TASK-9 (수정 범위·메모)
- `/src/workers/stats/jobs.ts`·`helperData.ts`(`toVisitRows`)·`/src/workers/stats.worker.ts`·`/src/workers/statsClient.ts`, `/src/types/stats.ts` (TASK-5)
- `/src/lib/analytics/dates.ts`
- 이전 step에서 만든 파일: TASK-5 (Worker `load`와 `memory`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 원본 (양지바른, 읽기만)

- GitHub: 저장소 `seoseungkwan/shared`, 커밋 `2a1069b`, 폴더 `YangjiBareun_사전점검/`
- 이 서버의 사본(나중에 지워질 수 있음): `/tmp/claude-1000/-home-developer/4601ab55-16fe-474f-813a-c7a0d544b749/scratchpad/yangji/repo/YangjiBareun_사전점검/`
  - 얕은 clone(HEAD `c66488e`)이다. `2a1069b`와 `c66488e` 사이에 이 폴더 안 파일은 바뀌지 않았다. 그대로 써도 된다
- 사본이 없으면 저장소 밖 임시 폴더에 받는다: `git clone https://github.com/seoseungkwan/shared.git <임시폴더>/shared && git -C <임시폴더>/shared checkout 2a1069b` → `export YANGJI_SRC=<임시폴더>/shared/YangjiBareun_사전점검`. 받을 수 없으면 `blocked`(사유: 원본 저장소 접근 필요)로 멈춘다
- 원본 시험(`tests/*.py`·`*Tests.cs`)은 모두 가짜 자료다. 사례를 시험 씨앗으로 옮겨도 된다

- 이 step에서 볼 원본(폴더 `YangjiBareun_사전점검/` 기준):
  - `medicore/rx_visit_split.py` (`summarize`·`summarize_days`·`format_text`·`format_days_text`·`headline`·`period_text`·`day_label`·`validate_split`)
  - `tests/test_rx_visit_split.py`, `tests/test_rx_visit_split_sql.py` (사례)
  - `vendor/drbit_export/RxVisitSplit.cs` (`MaximumDays` 365, 결과 칸)

## 수정 범위 (tasks.md TASK-9)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/analytics/rxVisitSplit.ts`
  - `src/lib/analytics/rxVisitSplit.test.ts`
  - `scripts/stats/golden/rx_visit_split.py`
  - `fixtures/stats/golden/rx-visit-split-*.json`
  - `src/workers/stats/jobs.ts`
  - `src/workers/stats/jobs.test.ts`
  - `src/workers/stats.worker.ts`
  - `src/workers/statsClient.ts`
  - `src/workers/statsClient.test.ts`
  - `src/types/stats.ts`
- Tests:
  - `src/lib/analytics/rxVisitSplit.test.ts`
  - `src/workers/stats/jobs.test.ts`
  - `src/workers/statsClient.test.ts`
- TDD: required
- 메모: Worker 쪽은 `split` 일을 붙이는 것만 한다(TASK-5의 `load`는 고치지 않는다)

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **골든 테스트**: 같은 가짜 입력을 원본(양지바른 `2a1069b`)과 우리 함수에 넣어 결과가 순서까지 같은지 깊은 비교한다. 원본 결과는 `scripts/stats/golden/`의 작은 실행 글로 한 번 만들어 `fixtures/stats/golden/<이름>.json`에 커밋한다. Python 원본은 `python3 -I`로 돌린다. 골든 파일 머리에 `{ "source": "seoseungkwan/shared@2a1069b", "file": …, "entry": …, "knownDiffs": [...] }`를 적는다. 일부러 다르게 한 것만 `knownDiffs`에 이유와 함께 적고, 적지 않은 차이는 실패다. 시험은 원본 없이 커밋한 골든 파일과 견주어 돈다(골든을 다시 만들 때만 `YANGJI_SRC`가 필요)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **원본은 저장소 밖**: 원본 경로는 `YANGJI_SRC` 환경 변수나 스크립트 인자로만 받는다. 원본 파일 통째를 저장소에 복사·커밋하지 않는다. 커밋하는 것은 옮긴 코드, 원본 SQL 문장 사본(`original-sql/*.sql`), 골든 결과뿐이다 (specs/stats/tasks.md 머리말)

## 작업

### 1. 코드 (`src/lib/analytics/rxVisitSplit.ts`)
- design.md TASK-9 시그니처. 원본 Python 줄을 옮긴다. 원본의 집합(`new`·`returning`)은 수로만 돌려준다. 병원 이름은 인자다. `eswt`는 원본의 기본(끔)과 같게만 둔다(범위 밖)

### 2. 골든 (`scripts/stats/golden/rx_visit_split.py`, `fixtures/stats/golden/`)
- 작은 실행 글: `YANGJI_SRC`의 `medicore/rx_visit_split.py`를 `python3 -I`로 불러 가짜 입력(`fixtures/stats/golden/rx-visit-split-input.json`: 원본 `validate_split`을 지나는 모양, 차트번호 `9`로 시작하는 가짜, 처방 4~5개, 기간 첫날 전 신환·기간 안 신환·재진, 하루 여러 처방)에 돌려 `rx-visit-split-summary.json`·`rx-visit-split-days.json`·`rx-visit-split-text.json`(글 셋)을 쓴다. 머리 `{source, file, entry, knownDiffs}`
- 시험은 커밋한 골든과 견준다(원본 없이 돈다)

### 3. Worker `split` 일 (`jobs.ts`·`stats.worker.ts`·`statsClient.ts`·`types/stats.ts`)
```ts
export function splitJob(memory: StatsMemory | null, req: { from: string; to: string }): RxSplitView   // { kind: 'none' } | { kind: 'split'; split: RxSplit; days: RxSplitDay[]; text: string; headline: string }
export function requestSplit(worker: WorkerLike, req: { from: string; to: string }, opts?): Promise<RxSplitView>
```
- 코드 목록 = 그 기간 진료 줄의 모든 처방코드, 줄은 합계가 큰 차례(같으면 코드 순)(AC-509.4). 불러온 자료가 없거나 기간이 불러온 범위 밖이면 `{ kind: 'none' }`
- `load` 일(TASK-5)은 고치지 않는다

### 4. 시험
- `rxVisitSplit.test.ts`(AC-509.1~509.3 골든), `jobs.test.ts`(AC-509.4: 결과에 환자 번호 없음, 범위 밖 → none), `statsClient.test.ts`(`requestSplit` 시간 초과·실패 번호)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/analytics/rxVisitSplit.test.ts src/workers/stats src/workers/statsClient.test.ts
npx vitest run src/lib/analytics src/workers   # 지금 통계·Worker 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-9 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-509.1 ~ AC-509.4이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-3-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 원본 Python 글(문장·띄어쓰기·숫자 모양·`ljust` 폭)을 다듬지 마라. 이유: 골든과 같아야 한다(AC-509.3)
- 골든 파일을 손으로 고치지 마라. 이유: 실행 글이 원본에서 만든 값이어야 한다
- 환자 번호·진료 줄을 Worker 밖으로 보내지 마라. 이유: 화면에는 처방마다 수만(AC-509.4)
- TASK-5의 `load` 일 동작을 바꾸지 마라. 이유: 저장 모양 시험이 그 동작에 기댄다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
