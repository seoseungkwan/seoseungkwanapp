# Step 3: patients-worker

> **TASK-4** Worker — 조각 모으기 · 읽을 조각 · 보기 모양 · 연락 표시 · 건수 · **REQ-604** · AC-604.1 ~ AC-604.8
> Phase 1 `patients-1-lists`(명단 계산 (웹, 골든)) · Step 3 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-4 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-604에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-604.1**: chunk…end를 모아 조각 수·바이트·SHA-256이 맞을 때만 JSON으로. 다르면 `E-BRIDGE-BAD-REPLY`, abort면 받은 번호. 반쪽 자료 안 씀
- **AC-604.2**: `readPlan`: F/U 최근 120일 → 31일 이하 조각(오래된 것부터), 정기 주사 → 마지막 읽은 달 1일 ~ 오늘(처음이면 가장 긴 간격 + 1개월 전 달 1일부터) 달 조각
- **AC-604.3**: 종류마다 따로: F/U 조각이 다 오면 `FollowupView`, 정기 주사 조각이 다 오고 store.load가 됐으면 `RecallView`. 한 종류가 실패·시간 초과면 그 종류만 `null` + 그 종류 번호, 다른 종류는 그대로
- **AC-604.4**: [연락함] → Worker가 `store.save {contact}` 글자를 통로 포트로, 됨이면 바뀐 보기 모양·건수, 실패면 그대로 + 오류 번호. 잇따라 누르면 저장을 하나씩 차례로, 차례가 온 저장은 그때의 최신 표시로 글자를 만듦(답이 뒤바뀌어 와도 둘 다 남음). 화면 메시지에 보낼 글자 없음
- **AC-604.5**: `contactCounts`: F/U = 예정이고 다음 내원일이 내일인데 연락함 아님, 정기 주사 = 예정일이 오늘까지(지난 것 포함)인데 연락함 아님. 0 이상 정수 둘(늘). 보기 모양 하나라도 없거나 연락 표시를 못 불러왔으면 handler가 `contactCounts`를 부르지 않고 건수 `null`
- **AC-604.6**: 저장 글자 `{contact: {v: 1, marks, recall}}`. 보기 모양이 있는 종류마다 그 보기 모양에 열쇠가 있는 표시만 남김(날짜는 안 봄), 보기 모양 없는 종류의 표시는 그대로(정기 주사 합쳐 저장해도 내일 F/U 연락함은 남음). 30MB 넘으면 증상 글을 자르지 않고 가장 오래된 정기 주사 기록부터 빼고 `from`을 늦춤
- **AC-604.7**: 연락함 뒤 다시 오지 않은 정기 주사 환자(예정일 1년 넘게 지남)는 다음에 열어도 연락함이고 `injection_left`에 다시 안 들어감
- **AC-604.8**: `stored`가 성공하기 전·실패한 뒤에는 [연락함]·기록 합치기에서 `store.save`를 보내지 않고 오류 번호만(PC 저장을 덮어쓰지 않음). F/U는 연락 표시 없이(`marksLoaded: false`), 건수 `null`, 정기 주사 보기 모양 `null`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-604
- `/specs/patients/design.md` — '도우미 `contact.targets` 답 모양', '`contact` 안쪽 모양', '계산 모양', 'Worker 메시지 약속', '데이터 흐름'
- `/specs/patients/tasks.md` — TASK-4
- `/src/lib/bridge/workerSink.ts`(포트 메시지 `chunk`·`end`·`abort`·`send`·`sent`), `/src/lib/bridge/commands.json`(`store.save` payload 칸 `contact`, `store.load` 칸 `contact`)
- `/src/workers/analyze.worker.ts`·`runAnalysis.ts`(Worker 입구와 순수 함수 나누는 방식)
- 이전 step에서 만든 파일: `src/lib/patients/followup.ts`·`recall.ts`, `src/types/patients.ts`, `fixtures/patients/make-fake-patients.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-4)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/workers/patients.worker.ts`
  - `src/workers/patients/assemble.ts`
  - `src/workers/patients/assemble.test.ts`
  - `src/workers/patients/plan.ts`
  - `src/workers/patients/plan.test.ts`
  - `src/workers/patients/jobs.ts`
  - `src/workers/patients/jobs.test.ts`
  - `src/workers/patients/handler.ts`
  - `src/workers/patients/handler.test.ts`
  - `src/types/patients.ts`
  - `fixtures/patients/fake/*`
  - `fixtures/patients/make-fake-patients.ts`
  - `fixtures/patients/make-fake-patients.test.ts`
- Tests:
  - `src/workers/patients/assemble.test.ts`
  - `src/workers/patients/plan.test.ts`
  - `src/workers/patients/jobs.test.ts`
  - `src/workers/patients/handler.test.ts`
  - `fixtures/patients/make-fake-patients.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/patients`·`src/lib/analytics`·`src/workers`(그리고 `lib/parsers`·`lib/payload`·`lib/precheck`·`lib/bridge`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020, REQ-601)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)
- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)

## 작업

### 1. 조각 모으기 (`assemble.ts`, AC-604.1)
```ts
export function createAssembler(): {
  chunk(id: string, seq: number, data: string): void
  end(id: string, count: number, bytes: number, sha256: string): void
  abort(id: string, code: string): void
  take(id: string): Promise<{ ok: true; json: unknown } | { ok: false; code: string }>   // end·abort가 오기 전에 부르면 올 때까지 기다린다
}
```
- `seq`는 0부터 빠짐없이 차례로. 조각 수·UTF-8 바이트 수·SHA-256(`crypto.subtle.digest`, 16진 소문자)이 `end`와 다르면 `E-BRIDGE-BAD-REPLY`. `JSON.parse` 실패도 같다. 끝난 요청은 메모리에서 지운다

### 2. 읽을 조각 (`plan.ts`, AC-604.2)
```ts
export type Range = { from: string; to: string }
export const FOLLOWUP_DAYS = 120, MAX_PIECE_DAYS = 31
export function followupPlan(today: string): Range[]                                     // [today-119, today]를 31일 이하로, 오래된 것부터
export function recallPlan(history: RecallHistory, rules: readonly RecallRule[], today: string): Range[]   // 달 1일~말일(마지막은 today)
```
- 정기 주사 처음(`readThrough === null`): 켠 규칙의 가장 긴 `months` + 1개월 전 달의 1일부터. 그 뒤: `readThrough`가 든 달의 1일부터(그 달을 다시 읽어 정정 반영, 원본 ingest와 같은 뜻)

### 3. 보기 모양·건수·저장 글자 (`jobs.ts`, AC-604.3~604.6)
```ts
export function readTargets(json: unknown, expect: { kind: 'followup' | 'injection'; from: string; to: string }): { chart: string[][]; rx: string[][] }   // v·kind·from·to·칸 이름 검사, 틀리면 'E-BRIDGE-BAD-REPLY'
export function readStore(json: unknown): ContactStoreData                    // {} → 빈 것. 모양이 틀리면 빈 것으로 시작하지 말고 'E-STORE-BROKEN'
export function buildFollowup(pieces: { chart: string[][]; rx: string[][] }[], marks: ContactStoreData['marks'], today: string): FollowupView
export function mergeRecall(history: RecallHistory, pieces: { range: Range; chart: string[][]; rx: string[][] }[], rules: readonly RecallRule[], today: string): RecallHistory
export function buildRecall(history: RecallHistory, rules: readonly RecallRule[], marks: ContactStoreData['marks'], phones: Record<string, string>, today: string): RecallView
export function filterFollowup(view: FollowupView, f: FollowupFilters): { rows: FollowupRow[]; undecided: UndecidedRow[]; copy: { list: string; listWithDate: string } }
export function filterRecall(view: RecallView, f: RecallFilters, today: string): { rows: RecallRow[]; copy: { list: string; phones: string; missingPhones: number } }
export function markKey(row: { kind: 'f' | 'r'; … }): string                 // design.md 줄 열쇠
export function setMark(store: ContactStoreData, key: string, on: boolean, today: string): ContactStoreData
export function pruneMarks(marks: ContactStoreData['marks'], views: { followup: FollowupView | null; recall: RecallView | null }, today: string): ContactStoreData['marks']
    // 보기 모양이 있는 종류(열쇠 머리 'f|'·'r|')는 그 보기 모양의 줄 열쇠에 있는 표시만 남김(날짜는 보지 않는다). 보기 모양이 null인 종류의 표시는 그대로
export const MAX_STORE_BYTES = 30 * 1024 * 1024                  // 도우미 ContactStore.MaxContactBytes(32MB) 아래
export function fitStore(store: ContactStoreData): { store: ContactStoreData; trimmed: number }   // UTF-8 JSON이 MAX_STORE_BYTES를 넘으면 가장 오래된 recall 기록부터 빼고 recall.from을 남은 첫 기록 날짜로(증상 글은 자르지 않는다)
export function storePayload(store: ContactStoreData): string   // JSON.stringify({ contact: store }) — pruneMarks·fitStore를 거친 store만
export function contactCounts(fu: FollowupView, rc: RecallView, today: string): ContactCount   // 늘 정수 둘. null(보기 모양 없음·연락 표시 못 불러옴)은 handler가 정한다
```
- 조각 여러 개는 표 머리 줄을 한 번만 두고 이어 붙여 `prepareSchedule`·`preparePhones`·`prepareRx`에 넣는다
- 정기 주사 전화(`phones`)는 F/U 조각의 47 표 전화가 먼저, 없으면 기록의 전화(원본 `phone()`)
- `mergeRecall` 뒤에는 늘 `fitStore`를 먼저 거쳐 메모리 기록을 줄이고, `buildRecall`은 줄인 기록으로 만든다. `coverage.trimmed` = `fitStore`가 뺀 수(AC-604.6)

### 4. 메시지 (`handler.ts`·`patients.worker.ts`, design.md 'Worker 메시지 약속')
```ts
export function createHandler(deps: { post(message: unknown): void }): { onScreen(message: unknown): void; onPort(message: unknown): void; setPort(port: { postMessage(m: unknown): void }): void }
```
- `patients.worker.ts`: `self.onmessage`에서 `{type: 'bridge-port'}`면 `event.ports[0]`을 `setPort`하고 그 포트의 `onmessage`를 `onPort`에 잇는다. 나머지는 `onScreen`
- 종류마다 따로(AC-604.3): F/U 조각이 하나라도 실패하면 `followup: null`·`codes.followup`, 정기 주사 조각이나 `store.load`가 실패하면 `recall: null`·`codes.recall`. 다른 종류는 그대로 보낸다
- 정기 주사 조각을 합쳐 기록이 바뀌면 `views`를 보내기 전에 `store.save`를 보낸다(`stored`가 성공했을 때만). 저장이 실패해도 명단은 보이고 `codes.store`를 함께 보낸다
- 저장 줄 세우기(AC-604.4): `store.save`는 한 번에 하나. `mark` 요청은 '해야 할 바꿈' 줄에 쌓고, 보낸 저장의 `sent`가 오면 다음 차례를 보낸다. 차례가 오면 그때의 확정된 표시 + 줄에 쌓인 바꿈으로 `pruneMarks` → `fitStore` → `storePayload`. `sent` ok면 그 바꿈을 확정하고 `marked`, 실패면 그 바꿈만 버리고 `{ok: false, code}`(앞서 확정된 표시는 그대로). `ticket`으로 답을 짝짓고, 답이 늦게 와도 줄 순서를 지킨다
- 저장 상태(AC-604.8): `'unknown' | 'loaded' | 'failed'`. 처음과 `{type: 'reload'}` 뒤는 `'unknown'`, `stored` 성공이면 `'loaded'`. `'loaded'`가 아니면 어떤 경우에도 `store.save`를 보내지 않고 `mark`에는 `{ok: false, code: 'E-STORE-FAILED'(또는 store.load가 준 번호)}`만 돌려준다
- 화면으로 가는 메시지에 `payload`·조각 글자가 없다(시험이 메시지 키를 본다)
- 연락 표시를 저장할 때는 늘 `pruneMarks` → `fitStore` → `storePayload` 순서. 날짜로 표시를 지우지 않는다(연락한 환자가 '미연락'으로 돌아온다)

### 5. 시험 (가짜 조각: `fixtures/patients/fake/targets-*.json`, `store-*.json`)
- `assemble.test.ts`(AC-604.1): 맞음·조각 빠짐·순서 바뀜·바이트 다름·SHA 다름·abort·end 전에 take
- `plan.test.ts`(AC-604.2): 오늘이 월말·월초·윤년, 처음·이어 읽기
- `jobs.test.ts`(AC-604.3·604.5·604.6·604.7): 보기 모양, 건수 정의(기간·도구와 상관없음, 조건부 제외, 내일만, 지난 정기 주사 포함), 연락 표시 정리(보기 모양에 있으면 1년 지나도 남음·열쇠가 바뀐 표시는 빠짐·정기 주사 보기 모양이 없으면 정기 주사 표시는 그대로·**정기 주사 기록을 합쳐 저장해도 내일 오실 F/U 줄의 연락함 표시가 남음**), **연락함 뒤 다시 오지 않은 정기 주사 환자가 다음 열기에도 연락함이고 `injection_left`에 안 들어가는 사례**(AC-604.7), 크기: 30MB를 넘는 가짜 기록(긴 증상 글 × 많은 건) → `fitStore`가 오래된 기록부터 빼고 증상 글은 그대로·`from`이 늦춰짐·`trimmed` 수, `contactCounts`는 늘 정수 둘(AC-604.5)
- `handler.test.ts`(AC-604.3·604.4·604.8): 가짜 포트·가짜 post로 전체 흐름(plan → piece × n → stored → build → mark → sent ok/실패), F/U 조각 하나 실패 → F/U만 `null`이고 정기 주사는 보임(반대도), `store.load` 실패 → 정기 주사 `null`·F/U는 `marksLoaded: false`·건수 `null`·[연락함]에 `store.save` 없음, **다시 불러오는 중(`reload` 뒤 새 `stored` 전)과 다시 불러오기가 실패한 뒤 옛 줄로 [연락함]을 눌러도 포트에 `send`가 하나도 없음**(PC 저장을 덮어쓰지 않음), 건수 `null`은 handler가 정함(보기 모양 하나 없음·연락 표시 못 불러옴, AC-604.5), **두 줄을 잇따라 [연락함] → `send`가 하나씩 차례로 나가고 두 번째 payload에 첫 표시도 들어 있음, 답을 뒤바꿔(늦게) 보내도 둘 다 남음, 첫 저장이 실패하면 첫 표시만 빠지고 두 번째는 남음**(AC-604.4), 30MB 넘는 기록을 합치면 `views.recall.coverage.trimmed` > 0이고 `coverage.records`가 줄인 뒤 수(AC-604.6)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/workers/patients/assemble.test.ts src/workers/patients/plan.test.ts src/workers/patients/jobs.test.ts src/workers/patients/handler.test.ts fixtures/patients/make-fake-patients.test.ts   # AC-604.1~AC-604.8
npx vitest run src/lib/patients   # 앞 step 그대로
python3 ~/.claude/harness/bin/tdd-run TASK-4 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-604.1 ~ AC-604.8가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-1-lists/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 조각이 모자라거나 검사가 틀린 자료로 명단을 만들지 마라. 이유: 일부만 보이면 연락해야 할 환자가 빠진다(AC-604.1·604.3)
- 화면에 조각 글자나 `store.save` payload를 보내지 마라. 이유: 화면은 보낼 글자를 쥐지 않는다(precheck 004.11, 이 명세 AC-604.4)
- Worker 안에서 `fetch`·저장소·`console`을 쓰지 마라. 이유: 환자 자료 구역(TASK-1 울타리)
- 명령 표에 없는 명령·칸을 만들지 마라(`store.save`의 `contact`, `store.load`의 `contact`, `contact.targets`의 `kind`·`from`·`to`만). 이유: 확장·도우미가 거절한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
