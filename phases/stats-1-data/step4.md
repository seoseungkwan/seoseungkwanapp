# Step 4: stats-worker

> **TASK-5** 통계 Worker (도우미 자료 → 저장 모양) · **REQ-505** · AC-505.1 ~ AC-505.7
> Phase 1 · 계산 더하기와 자료 길 `stats-1-data` · Step 4 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-5 하나만 한다. 다른 TASK의 일은 하지 않는다.
> 옮겨 옴: precheck REQ-027 (AC-027.2) — 사전점검 명세의 같은 몫은 그 명세가 다음에 뺀다. 이 step은 `specs/stats`만 따른다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-505(통계 Worker (도우미 자료 → 저장 모양))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-505.1**: Given 통로가 Worker 포트로 넘긴 `chunk`들과 `end {count, bytes, sha256}`, When 모으면, Then `seq`가 0부터 빠짐없이 이어지고 조각 수·UTF-8 바이트 수·SHA-256이 모두 맞을 때만 JSON 하나로 푼다. 하나라도 다르면 버리고 `E-BRIDGE-BAD-REPLY`, `abort`면 버리고 받은 번호다
- **AC-505.2**: Given 푼 JSON, When 검사하면, Then 정해 둔 열쇠·모양(진료 줄 = 4칸 배열 — 앞 셋은 글자, 넷째 첫 내원일은 글자 또는 null(null이면 그 환자는 신환이 아니고 기간 합계의 `noFirst`에 든다), 날짜 `YYYYMMDD`, 첫 내원일 ≤ 진료일, 한 환자의 첫 내원일은 하나, 처방코드 1~40자, 줄 수 700,000 이하, 기간이 요청과 같음, 보고 벌의 숫자는 0 이상 정수)일 때만 받는다. 아니면 `E-BRIDGE-BAD-REPLY`
- **AC-505.3**: Given 같은 가짜 자료를 파일 길(`fixtures/fake-bit/` → `parseBit`)과 도우미 JSON 길로 넣음, When 도우미 길이 진료 줄을 `ConsumptionRow`(첫 내원일 = 진료일이면 신환, 외래, 동네 없음, 차트번호는 메모리 번호 `PatientIds`)로 바꿔 지금 `aggregate`에 넣으면, Then 동네(지역)를 뺀 결과가 파일 길과 깊은 비교로 같다. 파일 올리기 길(`parseBit`·`aggregate`·`analyzeFiles`·`runAnalysis`·`analyze.worker.ts`)은 고치지 않는다
- **AC-505.4**: Given 검사한 도우미 자료, When `load` 일을 하면, Then Worker가 `buildSummary`(덮은 기간 = `[from, min(to, 오늘)]`) → `toMonthPayload`·`toDayPayloads`를 만들어 화면에는 달·일 저장 모양, 덮은 기간, 기간 합계의 확인 건수(차트번호 없는 내원·중복 내원·첫 내원 못 찾은 환자), 보고 숫자 네 벌만 보낸다. 확인 건수가 하나라도 0이 아니면 품질 incomplete이고 저장 모양은 null이다. 저장 모양의 동네는 비운다(`regions: []`)
- **AC-505.5**: Given 화면에 보내는 모든 메시지, When 열쇠와 값을 훑으면, Then 차트번호·환자 번호·진료 줄이 없다(숫자·처방코드·처방 이름·날짜만). 진료 줄은 Worker 메모리에만 남고(처방별 신환·재진 계산용), 새로 불러오면 바뀐다
- **AC-505.6**: Given "오늘 진료 끝" 표시를 켜고 불러옴, When 요약하면, Then 오늘을 끝난 날로 본다(요약에 넘기는 오늘 = 내일) → 오늘 일 숫자가 `partial: false`다. 끄면 지금처럼 오늘은 `partial: true`다
- **AC-505.7**: Given 화면 쪽 입구(`src/workers/statsClient.ts`), When 일을 시키면, Then Worker에는 기간·오늘·"오늘 진료 끝" 표시·통로 요청 id만 가고, 정해 둔 시간(120초)이 넘으면 `E-ANALYZE-TIMEOUT`, Worker 오류는 `E-ANALYZE-FAILED`이며 예외 내용을 옮기지 않는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-505
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-5와 '도우미 → Worker JSON', '데이터 흐름'
- `/specs/stats/tasks.md` — TASK-5 (수정 범위·메모)
- `/specs/precheck/design.md` — 5절(환자 자료 길)·6-1절(통로·`workerSink` 포트 메시지) — 읽기만
- `/src/lib/bridge/workerSink.ts`·`client.ts`(`stream`), `/src/types/bridge.ts`
- `/src/workers/analyze.worker.ts`·`analyzeFiles.ts`·`runAnalysis.ts`, `/src/types/analyze.ts` (본보기)
- `/src/lib/parsers/bit/parseBit.ts`·`columnMap.ts`, `/src/types/consumption.ts` (`ConsumptionRow`·`PatientIds`)
- `/src/lib/analytics/aggregate.ts`·`compare.ts`, `/src/lib/payload/toMonthPayload.ts`·`toDayPayloads.ts`
- `/fixtures/make-fake-fixtures.ts`, `/fixtures/fake-bit/` (가짜 비트 파일)
- `/src/types/errors.ts`, `/src/lib/errors.ts`
- 이전 step에서 만든 파일: TASK-1·2(`within30`), TASK-3·4(도우미 JSON 모양)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-5)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/workers/stats.worker.ts`
  - `src/workers/stats/assemble.ts`
  - `src/workers/stats/assemble.test.ts`
  - `src/workers/stats/helperData.ts`
  - `src/workers/stats/helperData.test.ts`
  - `src/workers/stats/jobs.ts`
  - `src/workers/stats/jobs.test.ts`
  - `src/workers/statsClient.ts`
  - `src/workers/statsClient.test.ts`
  - `src/types/stats.ts`
  - `src/types/clinicReport.ts`
  - `src/types/errors.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
- Tests:
  - `src/workers/stats/assemble.test.ts`
  - `src/workers/stats/helperData.test.ts`
  - `src/workers/stats/jobs.test.ts`
  - `src/workers/statsClient.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required
- 메모: `src/types/clinicReport.ts`는 보고 숫자 모양(`ClinicReportNumbers`)만 이 TASK에서 만든다. 글 만들기는 TASK-10. `src/types/report.ts`·`ReportNumbers`·`src/lib/report/*`는 `feat-ai-report` 몫이라 쓰지 않는다(C6)
- 메모: 오류 번호 `E-STATS-HISTORY`·`E-STATS-TOO-BIG`을 `types/errors.ts`·`lib/errors.ts` 끝에 더한다

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/parsers`·`src/lib/analytics`·`src/lib/payload`·`src/lib/precheck`·`src/lib/bridge`·`src/workers`에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. 동적 `import()`는 글자로 고정한 경로만. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 모양 (`src/types/stats.ts`, `src/types/clinicReport.ts`)
- design.md의 `StatsChecks`·`StatsLoaded`(덮은 기간 `covered` 포함), 보고 숫자 `ClinicReportNumbers`(design.md TASK-10 모양, 이 step은 타입만). `src/types/report.ts`·`ReportNumbers`는 `feat-ai-report` 몫이라 쓰지 않는다(cross-branch C6)

### 2. 조각 모으기 (`src/workers/stats/assemble.ts`)
```ts
export function createAssembler(): {
  chunk(id: string, seq: number, data: string): void
  end(id: string, count: number, bytes: number, sha256: string): Promise<string>   // 맞으면 JSON 글자
  abort(id: string, code: string): void
}
```
- `seq`가 0부터 빠짐없이, 조각 수·UTF-8 바이트 수·SHA-256(`crypto.subtle.digest`, 16진수 소문자)이 맞을 때만 글자를 돌려준다. 다르면 그 id를 버리고 `StatsDataError('E-BRIDGE-BAD-REPLY')`, `abort`면 버리고 그 번호(AC-505.1)
- 이름·모양은 일반으로 둔다(청구가 나중에 쓸 수 있게). 통로 포트 메시지 모양은 `workerSink.ts`의 `{type: 'chunk'|'end'|'abort', …}` 그대로

### 3. 검사·바꾸기 (`src/workers/stats/helperData.ts`)
```ts
export function parseStatsRows(text: string, req: { from: string; to: string }): StatsRowsData
export function toConsumptionRows(data: StatsRowsData, ids: PatientIds): ConsumptionRow[]
export function toVisitRows(data: StatsRowsData, ids: PatientIds): VisitRow[]   // { p, d: 'YYYY-MM-DD', c, f } — TASK-9가 쓴다
```
- 검사(AC-505.2): 정해 둔 열쇠만, 줄 = 4칸(앞 셋은 글자, 넷째 첫 내원일은 글자 또는 null — null이면 그 환자는 신환이 아니고 `summary.noFirst`에 든다), 날짜 `YYYYMMDD`이고 진짜 날짜, 첫 내원일 ≤ 진료일, 한 차트번호의 첫 내원일은 하나, 처방코드 1~40자, 줄 수 ≤ 700,000, `from`·`to`가 요청과 같음, 보고 벌 숫자는 0 이상 안전한 정수. 아니면 `E-BRIDGE-BAD-REPLY`
- 바꾸기(AC-505.3): `rxCode` = 코드, `rxName` = `codes`의 이름(없으면 코드), `rxType` = '', `date` = 진료일, `firstVisit` = (첫 내원일 = 진료일), `outpatient` = true, `region` = null, `patient` = `ids.idOf(차트번호)`(지금 파서가 쓰는 메모리 번호 만들기를 그대로 쓴다)

### 4. 일 (`src/workers/stats/jobs.ts`, `src/workers/stats.worker.ts`)
```ts
export function loadJob(text: string, opts: { from: string; to: string; today: string; closeToday: boolean }): { view: StatsLoaded; memory: StatsMemory }
```
- `aggregate(rows)` → `buildSummary({ covered: [{ from, to: min(to, today) }], quality, today: closeToday ? addDays(today, 1) : today })` → `AnalysisResult` → `toMonthPayload`·`toDayPayloads` → 동네 비우기(`regions: []`) → `StatsLoaded`(덮은 기간 `covered` 포함, AC-505.4·505.6). 확인 건수(`noChart`·`duplicate`·`noFirst`)가 하나라도 0이 아니면 `quality: 'incomplete'`, 저장 모양 null
- `memory`: 진료 줄(`VisitRow[]`)·기간 합계·날짜별 합계·처방 이름(Worker 안에만, AC-505.5)
- Worker: `{type: 'bridge-port'}`로 받은 포트의 조각을 `createAssembler`에, 화면의 `{type: 'load', streamId, from, to, today, closeToday}` → `{type: 'loaded', view}` 또는 `{type: 'failed', code}`(예외 내용 없이 번호만). 마지막 `memory`를 들고 있는다

### 5. 화면 쪽 입구 (`src/workers/statsClient.ts`)
```ts
export const STATS_TIMEOUT_MS = 120_000
export function createStatsWorker(): Worker   // new Worker(new URL('./stats.worker.ts', import.meta.url), { type: 'module' })
export function requestLoad(worker: WorkerLike, req: { streamId: string; from: string; to: string; today: string; closeToday: boolean }, opts?: { timeoutMs?: number }): Promise<StatsLoaded>
```
- 시간 초과 `E-ANALYZE-TIMEOUT`, Worker 오류 `E-ANALYZE-FAILED`(AC-505.7). `runAnalysis.ts`와 같은 방식(시험은 가짜 Worker)

### 6. 오류 번호 (`types/errors.ts`·`lib/errors.ts` 끝에 더함)
- `E-STATS-HISTORY`: 무엇이 "비트에 옛 자료가 따로 있어 신환을 정할 수 없어요" · 어떻게 "파일 올리기로 통계를 넣어 주세요"
- `E-STATS-TOO-BIG`: 무엇이 "고른 기간의 진료 기록이 너무 많아요" · 어떻게 "기간을 줄여 다시 불러오세요"

### 7. 시험
- `assemble.test.ts`(AC-505.1), `helperData.test.ts`(AC-505.2·505.3: `fixtures/fake-bit/`의 가짜 파일 → `parseBit` → `aggregate`와, 같은 가짜 줄로 만든 도우미 JSON → `toConsumptionRows` → `aggregate`가 동네 칸을 빼고 깊은 비교로 같다), `jobs.test.ts`(AC-505.4·505.5·505.6: 확인 건수 → incomplete, `regions: []`, 오늘 진료 끝, 화면에 가는 값을 모두 훑어 가짜 차트번호 글자가 없음), `statsClient.test.ts`(AC-505.7), `errors.test.ts`(새 번호 문구가 빈 글자가 아님)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-501.2 31일째에만 다시 오면 30일 재방문이 아니다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일(`*.config.*`·`tsconfig*.json`·`package.json`·`.gitignore`)과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/workers/stats src/workers/statsClient.test.ts src/lib/errors.test.ts
npx vitest run src/workers/analyzeFiles.test.ts src/workers/runAnalysis.test.ts src/lib/parsers src/lib/analytics src/lib/payload   # 파일 길 그대로
npx vitest run src/guardrails.test.ts src/lib/bridge
python3 ~/.claude/harness/bin/tdd-run TASK-5 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status stats`에서 AC-505.1 ~ AC-505.7이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-1-data/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 파일 올리기 길(`parseBit`·`aggregate`의 규칙·`analyzeFiles`·`runAnalysis`·`analyze.worker.ts`)을 고치지 마라. 이유: 파일 올리기는 예비로 그대로 둔다(사용자, AC-505.3)
- 차트번호·환자 번호·진료 줄을 화면 메시지·오류·예외 글에 넣지 마라. 이유: 통계는 메모리 안 번호로만 센다(ARCHITECTURE '데이터 흐름', AC-505.5)
- 조각을 `lib/bridge`나 화면에서 풀지 마라. 이유: 통로는 풀지 않고 Worker 포트로만 넘긴다(청구 design.md 5절)
- 청구 쪽 파일(`src/workers/precheck/*`·`src/types/precheck.ts`·`src/lib/bridge/*`)을 만들거나 고치지 마라. 이유: 청구 브랜치 몫이다
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 1 · 계산 더하기와 자료 길의 마지막 step이다. 메인 세션이 할 일: `verify` → 쉬운 말 보고 → 도우미 빌드(Actions)가 도는지 확인
