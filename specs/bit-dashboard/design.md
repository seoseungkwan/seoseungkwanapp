# 설계: 비트 연결하면 대시보드 숫자 자동 채움

## 개요
- 원본은 양지바른·메디코어 1.25.0 `[통계 대시보드]`다. README가 밝힌 대로 "보고 [처방별 신환·재진]과 같은 방식"으로 읽는다. 실제 코드는 `vendor/drbit_export/RxVisitSplit.cs`다. 비트 통계 화면을 띄우지 않고, 등록한 병원으로 확인한 읽기 전용 접속에서 정해 둔 SELECT만 돌린다. 원본 경로는 `C:\Users\tjtmd\Desktop\1.25.0 대시보드\양지바른정형외과_1.25.0_대시보드_수정용소스\`이고, 저장소에 복사하지 않는다.
- 이 방식은 비트 로그인 창이 첫 등록 때 한 번만 뜬다. 원본 `RxVisitSplit.Run`도, 우리 `HospitalGate.Open`도 로그인 없이 등록 값으로 확인한다. 그래서 "자동으로"가 가능하다.
- 도우미 → 확장 → `lib/bridge` → Worker(ADR-020) 길에 그대로 싣는다. 명령은 명령 표에 이미 있는 `stats.rows`를 쓴다. 확장은 빌드할 때 명령 표를 넣으므로, 새 명령을 만들면 확장까지 다시 깔아야 한다. 있는 이름을 쓰면 도우미만 바꾸면 된다.
- Worker는 있는 계산(`aggregate`·`buildSummary`·`toDayPayloads`)을 고치지 않고 쓴다. 화면은 이미 만들어 둔 연결 뒤 모양을 쓴다.

## 구성 요소 / 인터페이스

### 도우미 (C#, `Precheck.Core`)
- 새 파일 `Stats/StatsSql.cs`에 상수 6개와 매개변수 표를 둔다. `Bit/Sql.cs`에는 클래스 맨 끝에 정적 생성자 하나만 더해 허용 목록에 합친다. 다른 창의 안 올린 `feat-precheck`가 `Sql.cs`를 크게 고치고 있어(+161줄) 합칠 때 충돌을 줄이려는 것이다. 사본은 `helper/tests/Precheck.Core.Tests/Bit/original-sql/stats-*.sql`.

| 상수 | 원본 | 매개변수 | 고친 곳 |
|---|---|---|---|
| `StatsHistoryGuardSql` | `OperationalReportSql.HistoryGuard` | 없음 | 없음 |
| `StatsIdentitySql` | `TreatmentUsage.IdentitySql` | `@scope` VarChar 32, `@institution` Char 8, `@firstDay`·`@lastDay` Char 8 | 없음 |
| `StatsSummarySql` | `RxVisitSplit.SummarySql` | `@from`·`@to` Char 12, `@hospital` VarChar 32 | 없음 |
| `StatsVisitRowsSql` | `RxVisitSplit.Visits` + `DaysSql`의 JOIN | 위와 같음 | 뒤 SELECT를 `SELECT DISTINCT v.PatientId,v.VisitDay,LEFT(f.FirstDtm,8)`로 |
| `StatsOrderRowsSql` | `RxVisitSplit.RowsSql` | 위와 같음 | 코드 거르기(`@c0…@c99`·`@eswt`) 줄을 뺀다, 뒤 SELECT에서 `FirstDay`를 뺀다 |
| `StatsRxNamesSql` | `TrendDataSource.LoadCodes` | `@firstDay`·`@lastDay` Char 8 | 코드·이름 두 칸만, 비교 기간·`IsSystem` 뺌 |

- `Bit/BitErrors.cs`: `DataUnsure = "E-BIT-DATA-UNSURE"`, `TooMany = "E-BIT-TOO-MANY"`.
- `Stats/StatsPayload.cs`: `public static string Build(IBitDb db, HospitalRegistration registration, DateTime from, DateTime to)`
  - 차례: 이관 자료 확인 → 기간 기관기호 확인 → 요약(누락·중복·첫 내원) → 내원 줄 → 처방 줄 → 이름. 시간 제한은 원본과 같다(메타 15초, 요약·내원 90초, 처방 120초).
  - 환자 번호: `Dictionary<string,int>`로 차트번호를 1부터의 숫자로 바꾸고 답에 차트번호를 싣지 않는다. 이 사전은 함수가 끝나면 사라진다.
  - 검사(`E-BIT-DATA-UNSURE`): 환자 칸 `^[0-9A-Za-z-]{1,20}$`, 날짜 `^[0-9]{8}$`, 첫 내원일 ≤ 내원일, 서로 다른 환자 수 = 요약의 실환자 수, 처방 줄의 환자는 내원 줄에 있어야 한다.
  - 처방코드 `^[0-9A-Z가-힣._+*()/-]{1,40}$`에 안 맞으면 뺀다(AC-001.9).
  - 줄 수 합 > 300,000이면 `E-BIT-TOO-MANY`.
- `Stats/StatsCommands.cs`: `Register(Dispatcher, BitServices)`. `stats.rows` 처리기는 `HospitalGate.Open` → `StatsPayload.Build` → `Chunker.Send`. 자료를 다 만든 뒤에 나누므로 실패하면 `error`만 간다.
- `Precheck.Helper/Program.cs`: `StatsCommands.Register(...)` 한 줄.
- `to`는 그 날 다음 날 0시까지(`@to` = 다음 날 + `0000`), `@firstDay`·`@lastDay`는 `yyyyMMdd`.

### Worker (`src/workers/`, 환자 자료 구역)
```ts
// src/workers/bitStats/assemble.ts
export function createAssembler(): {
  chunk(id: string, seq: number, data: string): void
  finish(id: string, count: number, bytes: number, sha256: string): Promise<string> // 어긋나면 던진다
}
// src/workers/bitStats/toDays.ts
export type StatsRows = { from: string; to: string; visits: [number, string, string][]; orders: [number, string, string][]; names: Record<string, string>; skippedCodes: number }
export function parseStatsRows(json: string): StatsRows | null          // 모양이 어긋나면 null
export function toConsumptionRows(stats: StatsRows): ConsumptionRow[]   // 내원마다 빈 코드 줄 + 처방 줄
export function toDays(stats: StatsRows, today: string): DayPayload[] | null
// src/workers/bitStats.worker.ts: {type:'bridge-port'} 포트의 chunk·end·abort, {type:'start', today}
```
- 처방 없는 내원을 세는 법: 내원 줄마다 `rxCode: ''`인 줄을 넣어 `aggregate`가 환자로 세게 하고, 결과의 일·주·월 칸 `rx`에서 빈 코드를 지운 뒤 `buildSummary`·`toDayPayloads`로 넘긴다. `aggregate`는 고치지 않는다.
- `firstVisit`은 `첫 내원일 === 내원일`, `outpatient`는 `true`(SQL이 외래만 읽는다), `region`은 `null`(일별 자료에 동네가 없다), `rxType`은 `''`.
- `covered`는 `[from, to]`. 답이 그 기간 전체를 읽었다는 뜻이다. `quality`는 `valid`.
- 끝에서 `validateDayPayload`를 모두 통과해야 보낸다(`toDayPayloads`는 변환만, 검사는 여기서).

### 화면
```ts
// src/components/dashboard/live/readBitDays.ts
export const LOOKBACK_DAYS = 100
export type ReadResult = { kind: 'days'; days: DayPayload[] } | { kind: 'not-ready' } | { kind: 'failed'; code: ErrorCode }
export function readBitDays(deps: { runtime: ChromeRuntimeLike | undefined; createWorker: () => BitStatsWorker; today: string; timeoutMs?: number }): Promise<ReadResult>
```
- 차례: `runtime` 없으면 `not-ready`(Worker도 안 만든다) → `connectScreenBridge` → `hello` → `busy`면 `failed(E-BIT-IN-USE)`, `ready`가 아니면 `not-ready` → `bit.check`의 세 단계가 모두 됨이고 `registered`가 아니면 `not-ready` → `stats.rows` → Worker 결과. `finally`에서 통로를 닫고 Worker를 끝낸다.
- `useBridge`는 쓰지 않는다. 화면이 떠 있는 동안 통로를 쥐기 때문이다. `connectScreenBridge`를 직접 불러 읽는 동안만 연다.
- `src/components/dashboard/live/DashboardLive.tsx`('use client'): `{ today, initial: SummarySource }`. 상태는 `idle | reading | data | failed`. 효과 안에서 `chrome.runtime`이 있을 때만 `reading`으로 가고 `readBitDays`를 부른다. 서버가 그린 첫 모양은 지금의 연결 전 그대로다.
- `DashboardHome`은 `report`로 모양을 정하는 방식 그대로 두고, 선택 prop `dateLine`만 더한다(주면 날짜 글자 대신 그린다). `report` 자리에 읽는 중·실패 블록(`ReadStatus.tsx`, 둘 다 h1)을 넘긴다. 데이터가 있으면 `ReportBlock` + `ReadLine`(읽은 시각·[다시 읽기], 같은 파일)이고, 다시 읽기 실패면 `ReadLine`의 단추를 빼고 그 아래 오류 상자를 둔다.
- [연결 확인]의 주소는 `/claim/setup?next=dashboard`다.
- `DashboardAnalysis`에 선택 props `emptyChip`·`emptyText`·`gainsTitle`·`gainsNote`·`day`를 더한다. 기본값은 지금 글("비트 PC 연결 전"·"연결하면 보여요"·"연결하면 생기는 것 4가지")과 오늘이다. `days`가 빈 배열이면 `DashboardLive`가 `emptyChip`·`emptyText`로 "자료 없음"을 넘긴다.
- 상태별 칩·숫자 칸: 읽는 중 "읽는 중"·"읽는 중" / 처음 실패 "읽지 못함"·"읽지 못했어요" / 다른 창 사용 중 "기다리는 중"·"아직 못 읽었어요".
- `dashboard/page.tsx`는 `DashboardLive`에 `today`와 `dashboardSummarySource()`를 넘긴다. `source.ts`는 그대로 둔다(서버 저장이 생기면 그 자리에서 바뀐다).
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
- 고른 날은 `DashboardLive`의 상태 하나다(주소·저장소에 두지 않는다). 처음은 `today`이고 다시 읽기로 바뀌지 않는다. 새로 열면 오늘이다.
- `DateControl`: [이전 날] · 날짜 글자 위에 투명하게 겹친 `<input type="date" min max>` · [다음 날] · 오늘이 아닐 때 [오늘로]. 범위는 `addDays(today, -LOOKBACK_DAYS)` ~ `today`. 날짜 계산은 `lib/analytics/dates.ts`만 쓴다. 폰 폭에서 단추는 44px이다.
- 지난 날짜도 `todayView(selected, days)`를 그대로 쓴다. `partial: false`라 저절로 끝난 날이 되고 7일 전과 견준다. 문장의 "오늘"만 `dayLabel`로 바꾼다.
- `ReportBlock`에 선택 prop `selected`를, `DashboardAnalysis`에 `day`를 더한다. 없으면 지금처럼 오늘이다. 자료 없는 지난 날짜는 AC-006.4 문구이고, 오늘 자료가 아직 없을 때는 지금 문구 그대로다.
- 기간별 흐름은 `today`로만 계산해 고른 날과 상관없다. 날짜를 바꿔도 비트를 다시 읽지 않는다.

### 문구 (`lib/errors.ts`, 모두 ~요)
- `E-BIT-DATA-UNSURE`: 무엇이 "비트 자료로 신환을 확정할 수 없어요" · 고치기 "비트에 과거 이관 자료나 차트번호 없는 접수가 있는지 확인하고, 계속되면 오류 번호와 함께 문의해 주세요."
- `E-BIT-TOO-MANY`: 무엇이 "한 번에 읽기엔 자료가 너무 많아요" · 고치기 "오류 번호와 함께 문의해 주세요."
- `E-BIT-IN-USE`(새 번호): 무엇이 "다른 창이 비트 자료를 쓰고 있어요" · 고치기 "한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요." 지금 `E-BRIDGE-BUSY` 문구는 "청구 화면이 다른 창에서 열려 있어요"라 다른 창이 대시보드일 때 맞지 않는다. 청구 화면은 그 번호와 문구를 그대로 쓴다.
- `E-HELPER-OLD`: 고치기를 "이 PC의 도우미가 예전 버전이라 대시보드 숫자와 청구 화면을 쓸 수 없어요. 고치던 메모는 이 PC에 그대로 있어요."로 바꾼다.
- 읽는 중·실패 제목 등 화면 글은 요구사항과 시안(`docs/mockups/bit-dashboard/`)을 따른다. 처음 실패의 제목·설명·번호는 `errorInfo(code)`에서 가져오고, 다시 읽기 실패의 "아래 숫자는 …" 한 줄만 화면 글이다.

## 데이터 흐름
```
[대시보드 열림] → chrome.runtime 있음 → hello → bit.check(등록 확인)
  → stats.rows(오늘-100 ~ 오늘)
도우미: 등록 확인 → SELECT 6개(되돌리는 트랜잭션) → 차트번호를 번호로 → JSON → 1MB 조각
확장 → lib/bridge → Worker 포트(화면은 조각을 못 본다)
Worker: 합치기·해시 → ConsumptionRow → aggregate → buildSummary → DayPayload[] → 검사
화면: DayPayload[](숫자만) → 보고 문장·오늘 숫자·기간별 흐름
서버: 아무것도 가지 않는다
```

## 결정과 트레이드오프
- **비트 통계 화면(47번 표) 대신 SQL (Claude 판단, ADR-025).** `specs/precheck` TASK-27은 47번 표를 비트 DLL로 띄워 읽게 되어 있다. 대신 원본 대시보드가 실제로 쓴 SQL을 쓴다. 비트 로그인 창이 매번 뜨지 않고, 숨은 비트 창을 띄울 일이 없고, 이름·주소 칸을 아예 읽지 않는다. 대가는 다음 줄이다.
- **신환 기준이 파일 길과 다를 수 있다.** 파일 길은 비트의 `초재진구분` 칸이고, 이 길은 비트 일일보고와 같은 "이 병원 첫 내원일"이다. 원본 프로그램의 일일보고·대시보드와 같은 기준이라 전에 보던 숫자와 맞는다. 재진료 첫 접수처럼 칸과 첫 내원일이 다른 환자는 파일 숫자와 다를 수 있다.
- **환자 수는 처방이 아니라 내원으로 센다.** 처방이 없는 내원도 든다. 다만 하루에 한 사람은 한 명이다(`SELECT DISTINCT`). 원본 일일보고의 총환은 내원 건수(`COUNT_BIG(*) FROM PeriodVisits`)라 같은 날 다시 접수한 환자를 한 번 더 센다. 그래서 대시보드 환자 수는 일일보고 총환보다 적을 수 있다. 원본 보고의 [처방별 신환·재진]이 쓰는 실환자와 같은 기준이다.
- **차트번호를 브라우저에 보내지 않는다.** 같은 사람 묶기에는 숫자 번호면 충분하다. 환자 자료 구역 규칙보다 더 좁게 간다. 다만 줄 자체는 내원 기록이라 `patient: true`(조각 + Worker 전용)로 둔다.
- **이 기능은 서버에 저장하지 않는다.** 먼저 비트 PC에서 숫자가 나오는지 확인하고, 저장은 다음 기능으로 나눈다. 그동안 휴대폰에서는 연결 전 모양이다.
- **`MIN_HELPER`를 0.2.0으로 올린다.** 옛 도우미는 `stats.rows`를 모른다. 청구 화면은 아직 준비 중이라 막혀서 잃는 기능이 없다.
- **기간은 100일.** 화면의 가장 긴 기간이 90일이고 그 앞뒤 비교(지난주 같은 요일)가 그 안에 든다. 날짜 고르기도 이 안에서만 한다. 더 옛날을 고르게 하려면 읽는 양이 늘어 3분 제한과 부딪히므로 사용자가 원할 때 따로 정한다.
- **날짜를 고르면 하루 줄만 바꾼다.** 이미 읽은 `DayPayload[]`로 그리므로 다시 읽지 않는다. 기간별 흐름까지 고른 날 기준으로 옮기면 "최근 N일"의 뜻이 흐려져 그대로 둔다.
- 옛 시험을 바꾸는 곳: `MIN_HELPER`·`LATEST_HELPER`를 못 박은 `handshake.test.ts`, `[비트 PC 연결 시작]` 주소를 본 `DashboardHome.test.tsx`·`StickyConnect.test.tsx`·`page.test.tsx`. 이 요구사항 때문에 값만 바꾼다. 시험을 약하게 만들지 않는다.

## 위험 / 미해결 질문
- **의원 PC에서 된 것은 설치·등록 5단계까지다.** 청구 창의 답(2026-11-01)에 따르면 도우미 0.1.1이 2026-11-01 15:49 KST에 5단계를 모두 마친 기록이 있다. 다만 단계 묶음 기록이고, 환자 줄을 읽는 SQL은 진짜 비트에서 돌린 적이 없다. 이 기능의 SQL이 처음이고 첫 의원 PC 시험에서 드러난다.
- **도우미 버전 번호를 청구 창과 맞춘다.** 청구 쪽(`feat-precheck`, `claim.*`)도 도우미를 낼 때 버전을 올려야 하는데 번호와 때가 안 정해졌다. 먼저 내는 쪽이 0.2.0을 쓰고 다음 쪽이 그다음 번호를 쓴다.
- 청구 쪽의 통계 화면 읽기(`VendorGridExport`)는 도우미를 켠 뒤 첫 읽기에 비트 로그인 창이 한 번 뜬다. 이 기능은 그 길을 쓰지 않아 부딪히지 않는다. 한 창만 통로를 쓰는 규칙(`busy`)이 동시 읽기를 막는다.
- 실제 비트 DB에 대한 시험은 저장소에서 못 한다. SQL 원문은 원본과 같게 두고, 숫자 비교는 사용자가 의원 PC에서 한다(같음/다름과 건수만 알려 주신다).
- 이 PC에는 .NET SDK 8만 있고 C# 시험은 `net10.0`이다. 사용자 폴더(`~/.dotnet`)에 .NET 10 SDK를 넣어 돌린다(precheck design.md 14절). 관리자 권한은 필요 없다.
- 실제 화면 시험에는 합치기와 배포, 도우미 릴리스(`helper-v0.2.0` 태그)가 필요하다. 확장이 정식 주소에서만 말을 받기 때문이다. 합치기·태그·배포는 그때 사용자에게 묻는다.
