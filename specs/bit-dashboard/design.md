# 설계: 비트 연결하면 대시보드 숫자 자동 채움

## 개요
- 비트 읽기는 통계 탭의 것을 함께 쓴다(사용자 결정, ADR-025). 이 기능이 새로 만드는 것은 대시보드가 저절로 읽고 그리는 화면, 날짜 고르기, 연결 뒤 돌아오기, 도우미 버전 올리기다.
- 브랜치는 `feat-stats` 위에 쌓는다. `feat-stats`가 먼저 `main`에 합쳐져야 이 기능도 합칠 수 있다. 대조한 기준은 `feat-stats` `dd86bcc`다. 그 뒤 달라지면 `git merge origin/feat-stats`로 받아 시험으로 확인한다.
- 화면은 이미 만들어 둔 연결 뒤 모양을 쓴다.

## 통계에서 그대로 쓰는 것 (고치지 않음)
- 도우미 `stats.rows`(`helper/src/Precheck.Core/Stats/`): 등록 확인 → 통계 줄 → 보고 숫자 → 조각. 비트 로그인 창은 첫 등록 때 한 번만 뜬다.
- `src/workers/stats.worker.ts`, `src/workers/statsClient.ts`의 `createStatsWorker`·`requestLoad`. 답은 `StatsLoaded`다.
- 오류 번호 `E-STATS-HISTORY`·`E-STATS-TOO-BIG`·`E-BIT-READ-FAILED`와 등록 관련 번호.

## 통계 쪽에서 먼저 바뀌어야 하는 것
- 내원환자 접수 기준(REQ-602). `dd86bcc`의 `VisitRowsSql`은 `FROM Orders`이고 `loadJob`은 그 줄만 `aggregate`에 넣어, 처방 줄이 없는 접수가 환자 수에서 빠진다. 같은 날 두 번 접수도 1명이 된다(`VisitRowsSql`의 `SELECT DISTINCT`에 내원 번호가 없고, `aggregate`의 `totals.patients`는 칸 안의 고유 환자 수다). 도우미 `days`의 `visits`(`VisitDaysSql`의 `COUNT_BIG(*)`)는 이미 접수 건수인데 지금은 Worker 메모리에만 쓰인다. 수정은 통계를 만드는 창이 `specs/stats`를 고쳐 재승인한 뒤 한다.
- 이 기능은 시험(TASK-7)으로 그 결과를 확인한다. 통계 쪽 수정이 들어오기 전에는 이 시험이 실패 상태로 남고, 이 기능은 PR을 만들지 않는다.

## 구성 요소 / 인터페이스

### 읽기
```ts
// src/components/dashboard/live/readBitDays.ts
export const LOOKBACK_DAYS = 100
export const READ_TIMEOUT_MS = 180_000
export type ReadResult = { kind: 'days'; days: DayPayload[] } | { kind: 'not-ready' } | { kind: 'failed'; code: ErrorCode }
export function readBitDays(deps: { runtime: ChromeRuntimeLike | undefined; createWorker: () => StatsWorkerLike; today: string; timeoutMs?: number }): Promise<ReadResult>
```
- 차례: `runtime` 없으면 `not-ready`(Worker도 안 만든다) → `connectScreenBridge` → `hello` → `busy`면 `failed(E-BIT-IN-USE)`, `ready`가 아니면 `not-ready` → `bit.check`의 세 단계가 모두 됨이고 `registered`가 아니면 `not-ready` → `stream('stats.rows', {from, to})`와 `requestLoad`(`closeToday: false`, 3분) → 결과. `finally`에서 통로를 닫고 Worker를 끝낸다.
- `StatsLoaded`에서 `days`만 꺼낸다. `months`·`report`·`checks`는 화면 상태에 담지 않는다(AC-601.9). `days`가 `null`이면 `failed(E-BIT-DATA-UNSURE)`다.
- `E-ANALYZE-TIMEOUT`은 `E-BIT-READ-FAILED`로 바꾼다. 그 문구가 "계산이 30초 넘게 걸려"라 여기 맞지 않고, 통계 표를 고치지 않으려는 것이다.
- `useBridge`는 쓰지 않는다. 화면이 떠 있는 동안 통로를 쥐기 때문이다. `connectScreenBridge`를 직접 불러 읽는 동안만 연다.

### 화면
- `src/components/dashboard/live/BitDashboard.tsx`('use client'): `{ today, initial: SummarySource }`. 상태는 `idle | reading | data | failed`이고 `initial`이 `data`면 그 숫자로 시작한다(AC-601.13). 효과 안에서 `chrome.runtime`이 있을 때만 읽기를 시작하고 `readBitDays`를 부른다. 서버가 그린 첫 모양은 `initial` 그대로다.
- 통계의 `summary/LiveDashboard.tsx`와 역할을 나눈다. 그쪽은 저장 숫자를 읽고, 이쪽은 비트에서 읽어 화면을 고른다. 합치면 `LiveDashboard`가 읽은 값을 `BitDashboard`의 `initial`로 넘긴다(TASK-8). 지금은 `dashboard/page.tsx`가 `dashboardSummarySource()`를 넘긴다.
- `DashboardHome`은 `report`로 모양을 정하는 방식 그대로 두고, 선택 prop `dateLine`만 더한다(주면 날짜 글자 대신 그린다). `report` 자리에 읽는 중·실패 블록(`ReadStatus.tsx`, 둘 다 h1)을 넘긴다. 데이터가 있으면 `ReportBlock` + `ReadLine`(읽은 시각·[다시 읽기], 같은 파일)이고, 다시 읽기 실패면 `ReadLine`의 단추를 빼고 그 아래 오류 상자를 둔다.
- [연결 확인]의 주소는 `/claim/setup?next=dashboard`다.
- `DashboardAnalysis`에 선택 props `emptyChip`·`emptyText`·`gainsTitle`·`gainsNote`·`day`를 더한다. 기본값은 지금 글("비트 PC 연결 전"·"연결하면 보여요"·"연결하면 생기는 것 4가지")과 오늘이다. `days`가 빈 배열이면 `BitDashboard`가 `emptyChip`·`emptyText`로 "자료 없음"을 넘긴다.
- 상태별 칩·숫자 칸: 읽는 중 "읽는 중"·"읽는 중" / 처음 실패 "읽지 못함"·"읽지 못했어요" / 다른 창 사용 중 "기다리는 중"·"아직 못 읽었어요".
- `source.ts`는 고치지 않는다. 통계의 REQ-516이 맡는다.
- [비트 PC 연결 시작] 두 곳의 `href`를 `/claim/setup?next=dashboard`로. "비트 PC 연결 다시 확인"·"비트 PC 연결부터"는 그대로 `/claim/setup`.
- `claim/setup/page.tsx`: `searchParams.next === 'dashboard'`일 때만 `returnTo="/dashboard"`를 넘긴다. `SetupScreen`은 `allOk && checked.at`이면 `<ReturnWhenReady to={returnTo} />`를 그린다. 이 부품은 "5단계를 모두 마쳤어요. 대시보드로 돌아가요."(`role="status"`)를 그리고 1.5초 뒤 `router.replace`한다. `useRouter`는 이 작은 부품 안에만 둔다.
- 도우미 업데이트 순서 3줄은 `StepGuide.tsx`에 두고 `SetupAlert`의 선택 prop `steps`로 오류 상자 안에 넣는다. 시안은 2단계 줄 안에 그렸지만, 진짜 문제는 위 오류 상자가 맡는 ui-90 규칙을 따른다.

### 날짜 고르기
```ts
// src/components/dashboard/live/DateControl.tsx ('use client')
export function DateControl(props: { today: string; selected: string; onChange(day: string): void }): JSX.Element
// src/components/dashboard/summary/view.ts
export function reportSentence(view: TodayView, dayLabel?: string): { first: string; rest: string; full: string } | null // dayLabel = '10월 31일'
```
- 고른 날은 `BitDashboard`의 상태 하나다(주소·저장소에 두지 않는다). 처음은 `today`이고 다시 읽기로 바뀌지 않는다. 새로 열면 오늘이다.
- `DateControl`: [이전 날] · 날짜 글자 위에 투명하게 겹친 `<input type="date" min max>` · [다음 날] · 오늘이 아닐 때 [오늘로]. 범위는 `addDays(today, -LOOKBACK_DAYS)` ~ `today`. 날짜 계산은 `lib/analytics/dates.ts`만 쓴다. 폰 폭에서 단추는 44px이다.
- 지난 날짜도 `todayView(selected, days)`를 그대로 쓴다. `partial: false`라 저절로 끝난 날이 되고 7일 전과 견준다. 문장의 "오늘"만 `dayLabel`로 바꾼다.
- `ReportBlock`에 선택 prop `selected`를, `DashboardAnalysis`에 `day`를 더한다. 없으면 지금처럼 오늘이다. 자료 없는 지난 날짜는 AC-605.4 문구이고, 오늘 자료가 아직 없을 때는 지금 문구 그대로다.
- 기간별 흐름은 `today`로만 계산해 고른 날과 상관없다. 날짜를 바꿔도 비트를 다시 읽지 않는다.

### 문구 (`lib/errors.ts`, 모두 ~요)
- `E-BIT-DATA-UNSURE`(웹에서만 쓰는 새 번호): 무엇이 "비트 자료로 신환을 확정할 수 없어요" · 고치기 "비트에 차트번호 없는 접수나 중복 접수가 있는지 확인하고, 계속되면 오류 번호와 함께 문의해 주세요."
- `E-BIT-IN-USE`(새 번호): 무엇이 "다른 창이 비트 자료를 쓰고 있어요" · 고치기 "한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요." 지금 `E-BRIDGE-BUSY` 문구는 "청구 화면이 다른 창에서 열려 있어요"라 다른 창이 대시보드일 때 맞지 않는다. 청구 화면은 그 번호와 문구를 그대로 쓴다.
- `E-HELPER-OLD`: 고치기를 "이 PC의 도우미가 예전 버전이라 대시보드 숫자와 청구 화면을 쓸 수 없어요. 고치던 메모는 이 PC에 그대로 있어요."로 바꾼다.
- 읽는 중·실패 제목 등 화면 글은 요구사항과 시안(`docs/mockups/bit-dashboard/`)을 따른다. 처음 실패의 제목·설명·번호는 `errorInfo(code)`에서 가져오고, 다시 읽기 실패의 "아래 숫자는 …" 한 줄만 화면 글이다.

### 도우미 버전
- `helper/Directory.Build.props`, `src/lib/bridge/versions.ts`의 `MIN_HELPER`·`LATEST_HELPER`를 `0.2.0`으로 올린다. `specs/stats`에는 버전 올리기가 없어 이 기능이 맡는다. 옛 도우미는 `stats.rows`를 모른다. 청구 화면은 아직 준비 중이라 막혀서 잃는 기능이 없다.

## 데이터 흐름
```
[대시보드 열림] → (저장 숫자가 있으면 먼저 그림) → chrome.runtime 있음 → hello → bit.check(등록 확인)
  → stats.rows(오늘-100 ~ 오늘)
도우미: 등록 확인 → SELECT(되돌리는 트랜잭션) → JSON → 1MB 조각
확장 → lib/bridge → 통계 Worker 포트(화면은 조각을 못 본다)
Worker: 합치기·해시 → 검사 → aggregate → buildSummary → 저장 모양
화면: days(숫자만) → 보고 문장·오늘 숫자·기간별 흐름
서버: 아무것도 가지 않는다
```

## 결정과 트레이드오프
- **도우미·Worker를 통계와 함께 쓴다 (사용자 결정, ADR-025).** 같은 이름의 명령과 파일이 두 벌이 되지 않는다. 대가는 다음 세 가지다.
  - 진짜 차트번호가 Worker까지 간다. 프로젝트 규칙(CLAUDE.md, ADR-020) 안이고 화면과 서버로는 가지 않는다(`specs/stats` AC-505.5). 첫 계획의 "번호만 넘긴다"보다 넓다.
  - `stats.rows`는 금액 보고까지 매번 읽는다. 대시보드를 열 때 더 느려질 수 있고, 보고 SQL이 실패하면 숫자도 나오지 않는다. 뺄지는 의원 PC 시험 뒤 `specs/stats`에서 정한다.
  - 통계가 먼저 합쳐져야 이 기능을 합칠 수 있다.
- **내원환자는 접수 기준이다 (사용자 결정).** 같은 날 두 번 접수하면 2건이다(2026-11-01 사용자 결정, 비트 일일보고의 총환과 같다). 접수취소는 세지 않는다(2026-11-01 사용자 결정). 신환은 비트 일일보고와 같은 "이 병원 첫 내원일"이고 사람당 1건이며, 재진은 총환 − 신환이다. 파일 길(비트 `초재진구분` 칸)은 이 기준과 다를 수 있다.
- **이 기능은 서버에 저장하지 않는다.** 먼저 비트 PC에서 숫자가 맞는지 확인한다. 저장은 통계 탭의 [비트에서 불러오기]가 맡는다.
- **저장 숫자를 먼저 보이고 비트 숫자로 바꾼다.** 저장 숫자가 있으면 읽는 3분 동안 빈 화면을 보지 않는다. 비트 숫자가 더 새것이므로 끝나면 바꾼다.
- **`BitDashboard`와 `LiveDashboard`를 두 파일로 둔다.** 처음에는 한 파일로 합치려 했다. 그러면 한쪽이 끝날 때까지 다른 쪽이 기다려야 한다. 역할을 나누면 두 창이 따로 일하고 합칠 때 한 줄로 잇는다.
- **기간은 100일.** 화면의 가장 긴 기간이 90일이고 그 앞뒤 비교(지난주 같은 요일)가 그 안에 든다. 날짜 고르기도 이 안에서만 한다.
- **날짜를 고르면 하루 줄만 바꾼다.** 이미 읽은 `DayPayload[]`로 그리므로 다시 읽지 않는다. 기간별 흐름까지 고른 날 기준으로 옮기면 "최근 N일"의 뜻이 흐려져 그대로 둔다.
- 옛 시험을 바꾸는 곳: `MIN_HELPER`·`LATEST_HELPER`를 못 박은 `handshake.test.ts`, `[비트 PC 연결 시작]` 주소를 본 `DashboardHome.test.tsx`·`StickyConnect.test.tsx`·`page.test.tsx`. 이 요구사항 때문에 값만 바꾼다. 시험을 약하게 만들지 않는다.

## 위험 / 미해결 질문
- **접수취소가 실제로 빠지는지는 의원 PC에서만 확인된다(AC-602.3).** 외래 접수는 `OcmComStt IN ('WN','HN','TN','PN')`만 세므로 다른 상태는 빠진다. 입원 쪽에서 빼는 `VC`·`CN`·`CR`도 이 목록에 없다. 다만 코드의 뜻을 적은 문서가 저장소에 없어, 취소된 접수가 어떤 값으로 남는지는 확정하지 못했다. 시험(TASK-7)은 이 조건 글이 `PeriodVisits`에 남아 있는지만 본다. 취소 건이 있는 날을 비트 화면과 견주어 끝낸다.
- **환자 줄을 읽는 SQL은 진짜 비트에서 돌린 적이 없다.** 첫 의원 PC 시험에서 드러난다. 숫자 비교는 사용자가 의원 PC에서 한다(같음/다름과 건수만 알려 주신다).
- **100일 안에 차트번호 없는 접수나 중복 접수(같은 내원 번호가 두 번. 같은 날 다른 번호로 두 번 접수한 것은 여기 들지 않는다)가 한 건이라도 있으면 숫자가 나오지 않는다**(AC-601.12, 통계의 `quality: incomplete`). 실제 비트에서 자주 나오면 `specs/stats`와 함께 규칙을 다시 정한다.
- **도우미 버전 번호를 청구 창과 맞춘다.** 먼저 내는 쪽이 0.2.0을 쓰고 다음 쪽이 그다음 번호를 쓴다.
- **코드래빗은 이 PC에 없다.** 시험 기준선 실패도 있어 이 PC에서는 `cr-review`가 통과하지 못한다. 어디서 돌릴지는 사용자에게 묻는다.
- 실제 화면 시험에는 합치기와 배포, 도우미 릴리스(`helper-v0.2.0` 태그)가 필요하다. 확장이 정식 주소에서만 말을 받기 때문이다. 합치기·태그·배포는 그때 사용자에게 묻는다.
