# 설계: 통계 탭 (비트 PC 자료 읽기 · 저장 · 통계 화면)

## 개요
- 숫자는 한 길로 만든다: 자료(도우미 줄 또는 파일) → Worker 안 `aggregate` → `buildSummary` → 저장 모양(`MonthPayload`·`DayPayload`, stats-core v2 + `within30`) → 서버 `months`·`days` 표. 화면(통계 탭·대시보드)은 **저장 모양만** 그린다. 그래서 PC와 휴대폰, 통계 탭과 대시보드의 숫자가 같다
- 저장 모양으로 만들 수 없는 두 가지(처방별 신환·재진 = 기간 안 서로 다른 환자 수, 원장님 보고 문장 = 금액)는 비트 PC에서 불러온 직후 Worker 메모리·화면 상태에만 있다. 휴대폰에서는 "비트 PC에서 불러오면 보여요"
- 도우미는 main에 있는 1단계 부품(메시지 틀·등록 확인 `RequireHospital`·읽기 전용 `IBitDb`·`ReadOnlyGuard`·`Chunker`)만 쓰고, 비트 통계 화면 표(47) 대신 **원본 양지바른의 통계 SQL**(`RxVisitSplit`·`TrendDataSource` 처방 목록·`OperationalReportSql`)로 읽는다. 원본의 통계 기능(추세·코호트·처방별 신환·일일보고)도 모두 SQL로 읽었다. 화면 표 읽기(`VendorGridExport`)는 청구 2단계 몫이라 기다리지 않는다
- 파일 올리기(stats-core)는 고치지 않고 예비로 쓴다. 30일 재방문만 세기·요약·저장 모양에 더한다

## 구성 요소 / 인터페이스

### Phase 1 · 계산 더하기와 자료 길

#### TASK-1 30일 재방문 (`lib/analytics`)
```ts
// types/analysis.ts (더하기만)
export type RevisitCounts = { cohort: number; within7: number; within14: number; within30: number }
export type RevisitView = { cohort: number; within7: number | null; within14: number | null; within30: number | null
  rate7: number | null; rate14: number | null; rate30: number | null }
```
- `aggregate.ts`: 지금 7·14일을 세는 같은 고리에서 `diffDays(f, v) ≤ 30`을 더 본다. `compare.ts`: 지금 `revisitView`의 N일 판정(`bucketState({from: 칸 첫날, to: addDays(칸 끝날, N)}) === 'complete'`)에 30을 더한다

#### TASK-2 저장 모양 (`lib/payload`, `types/payload.ts`)
```ts
export type RevisitPayload = { cohort: number; within7: number | null; within14: number | null; within30: number | null }
```
- `schemaVersion: 2` 그대로(저장한 줄이 없다 — stats-core '`v1 읽기는 만들지 않는다`'와 같은 판단). 검사 규칙: `7 ≤ 14 ≤ 30 ≤ 집단 ≤ 칸 신환`, null은 앞에서 뒤로 번진다

#### TASK-3·4 도우미 `stats.rows` (C#)
- 새 폴더 `helper/src/Precheck.Core/Stats/`:
```cs
public static class StatsSql            // 원본 SQL 상수 + 매개변수 표(이름·Char/VarChar·길이). IsAllowed / ParametersOf
public static class StatsErrors         // "E-STATS-HISTORY", "E-STATS-TOO-BIG"
public static class StatsRows           // Read(IBitDb db, string hospitalScope, string from, string to) → StatsRowsResult (TASK-3)
public static class StatsReport         // Read(IBitDb db, string hospitalScope, string to) → ReportSet[4] (TASK-4)
public static class StatsPayload        // Build(...) → JSON 글자 하나 (System.Text.Json, 정해 둔 열쇠만)
public static class StatsCommands       // Register(Dispatcher, BitServices): "stats.rows" → RequireHospital → Build → Chunker.Split
```
- 원본 사본: `helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql`(원본 파일 통째가 아니라 SQL 문장만, 청구 `Bit/original-sql`과 같은 방식)
- SQL 목록(모두 원본 `seoseungkwan/shared@2a1069b` `YangjiBareun_사전점검/vendor/drbit_export/`):

| 상수 | 원본 | 매개변수 |
|---|---|---|
| `VisitRowsSql` | `RxVisitSplit.Visits + RowsSql`에서 처방 코드 거르기 한 덩어리만 뺌 | `@from`·`@to` Char(12) `yyyyMMdd0000`, `@hospital` VarChar(32) |
| `VisitSummarySql` · `VisitDaysSql` | `RxVisitSplit.SummarySql` · `DaysSql` 그대로 | 같음 |
| `CodeNamesSql` | `TrendDataSource.LoadCodes`의 SQL(선택 코드 없음 `codeFilter = ""`) | `@from`·`@to`·`@priorFrom`·`@priorTo` Char(8). 앞 둘 = 기간, 뒤 둘 = 같은 값 |
| `HistoryGuardSql` · `UnsupportedFinanceSql` · `PatientsSql` · `TreatmentsSql` · `LaCodesSql` · `FinanceNormalSql` · `FinanceReceivableSql` · `FinanceMultiplicitySql` · `ReceivableMultiplicitySql` | `OperationalReportSql` 그대로 | `@day`·`@nextDay` Char(8), `@from`·`@to` Char(12), `@hospital` VarChar(32), `@daily` **Char(1)** |

- 관문: `Sql.cs`의 `IsAllowed`·`ParametersOf` 두 줄이 `StatsSql`에 없으면 거절하던 것을 `StatsSql`도 본다(아래 '다른 작업과 겹치는 파일'). `Sql.All`은 청구 목록 그대로라 청구 시험(`ReadOnlyGuard.test.cs`의 사본 대조)이 바뀌지 않는다
- 시간 제한: 원본처럼 자료 SQL 150초, 메타(`HistoryGuard`) 15초. 넘으면 `E-BIT-READ-FAILED`
- 읽는 순서: `RequireHospital.Open` → `HistoryGuard`(1이면 `E-STATS-HISTORY`) → 진료 줄(700,000줄 넘으면 `E-STATS-TOO-BIG`) → 기간 합계 → 날짜별 → 처방 이름(진료 줄에 나온 코드만 남김) → 보고 네 벌(TASK-4) → JSON → `Chunker.Split`. 하나라도 예외면 `error`만(반쪽 없음, 청구 design.md 9-2와 같은 규칙)
- `Program.cs`: `StatsCommands.Register(dispatcher, services)` 한 줄(지금 `BitCommands.Register` 다음)

#### 도우미 → Worker JSON (`stats.rows` 답, 조각을 모은 글자)
```jsonc
{
  "v": 1, "from": "2026-09-01", "to": "2026-11-01",
  "summary": { "visits": 0, "patients": 0, "newPatients": 0, "noChart": 0, "duplicate": 0, "noFirst": 0 },
  "days":   [["20260901", 0, 0, 0]],                 // [날짜, 내원, 실환자, 신환]
  "codes":  [["MM042", "처방 이름"]],                  // 진료 줄에 나온 코드만
  "rows":   [["9xxxxx", "20260901", "MM042", "20260115"]], // [차트번호, 진료일, 처방코드, 첫 내원일(없으면 null)]
  "report": {
    "daily":   [ /* to, to−1 */ ],
    "monthly": [ /* to가 든 달, 그 앞 달 */ ]
    // 한 벌: { "ok": true, "period": "2026-11-01" | "2026-11", "totalVisits", "newPatients", "returnPatients",
    //   "totalAmount", "insurerAmount", "noncoveredAmount", "cashAmount", "cardAmount", "transferAmount",
    //   "treatments": { "manual", "eswt", "carm", "sono", "cryo" }, "laCodes": [{ "code", "count" }],
    //   "financeUnconfirmed": false, "financeUnconfirmedReason": "…"?, "notes": [] }
    //   또는 { "ok": false, "period": "…", "reason": "invalid_aggregate" }
  }
}
```
- 줄은 배열(객체보다 작다, 700,000줄 ≈ 28MB → 조각 약 30개). 이름·전화·주민번호·주소는 원본 SQL도 읽지 않는다

#### TASK-5 통계 Worker (`src/workers/stats*`, 환자 자료 구역)
```ts
// src/workers/stats/assemble.ts — 통로 포트의 조각 모으기 (청구 2단계 assemble과 같은 일, 그쪽이 나중에 이것을 쓸 수 있다)
export function createAssembler(): { chunk(id, seq, data): void; end(id, count, bytes, sha256): Promise<string /* JSON 글자 */>; abort(id, code): void }
// src/workers/stats/helperData.ts — 검사와 변환
export function parseStatsRows(text: string, req: { from: string; to: string }): StatsRowsData   // 모양이 틀리면 throw StatsDataError('E-BRIDGE-BAD-REPLY')
export function toConsumptionRows(data: StatsRowsData, ids: PatientIds): ConsumptionRow[]       // firstVisit = (f === d), outpatient true, region null, rxType ''
// src/workers/stats/jobs.ts — 순수 함수(시험은 바로 부른다)
export function loadJob(text: string, opts: { from; to; today; closeToday: boolean }): { view: StatsLoaded; memory: StatsMemory }
// src/workers/stats.worker.ts — 받기: bridge-port / load / split(TASK-9). 보내기: loaded / split-result / failed
// src/workers/statsClient.ts — 화면 쪽 입구(Worker 객체를 만들고, 일을 시키고, 시간 제한 120초)
export function createStatsWorker(): Worker
export function requestLoad(worker, req: { streamId: string; from; to; today; closeToday }): Promise<StatsLoaded>
export function requestSplit(worker, req: { from; to }): Promise<RxSplitView>
```
```ts
// src/types/stats.ts — 화면이 받는 모양(숫자만)
export type StatsChecks = { noChart: number; duplicate: number; noFirst: number }
export type StatsLoaded = {
  range: { from: string; to: string }
  quality: 'valid' | 'incomplete'; checks: StatsChecks
  months: MonthPayload[] | null; days: DayPayload[] | null      // incomplete면 null
  report: { daily: ReportNumbers[]; monthly: ReportNumbers[] }   // types/report.ts
}
```
- 흐름: 화면이 `stream('stats.rows')`를 부르면 조각은 통로 → Worker 포트로 바로 간다(`workerSink`). `stream`이 `{id, count}`로 끝나면 화면이 Worker에 `load {streamId: id, …}`를 보낸다. Worker는 그 id의 글자를 꺼내 검사 → `ConsumptionRow` → `aggregate`(그룹 없음) → `buildSummary`(`covered = [{from, to: min(to, today)}]`, `quality` = 확인 건수가 모두 0이면 valid, `today` = closeToday면 내일) → `AnalysisResult` → 저장 모양(동네 비움) → 화면
- 진료 줄(`{ p: 메모리 번호, d, c, f }[]`)·기간 합계·날짜별 합계·처방 이름은 Worker의 `memory`에 둔다. 다음 `load`가 덮어쓴다

### Phase 2 · 저장

#### TASK-6 표 (`supabase/migrations/20261101000000_stats.sql`)
```sql
create function public.my_hospital_id() returns uuid language sql stable security invoker
  as $$ select id from public.hospitals where owner_id = (select auth.uid()) and status = 'approved' $$;
create table public.months (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  partial boolean not null,
  source text not null check (source in ('bit', 'file')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'schemaVersion' = '2'
    and payload->>'month' = month and (payload->>'partial')::boolean = partial and octet_length(payload::text) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, month)
);
-- days: month 대신 day date, payload->>'day' = day::text
-- 권한: revoke all from anon, authenticated → grant select, insert (month|day, partial, source, payload), update (month|day, partial, source, payload)
--   (PostgREST upsert는 보낸 칸 모두를 DO UPDATE SET에 넣는다 — 열쇠 칸 month|day도. hospital_id는 보내지 않으니 권한이 없다)
-- RLS: select/insert/update 모두 hospital_id = public.my_hospital_id() (승인된 내 병원만). delete 정책 없음
-- 트리거 before update: old.partial = false and new.partial = true면 return old(옛 줄 그대로), 아니면 new.updated_at = now()
```
- 시험: `supabase/stats-rls.test.ts`(PGlite, 지금 `rls.test.ts`의 Supabase 흉내 + 인증 마이그레이션 → 통계 마이그레이션)
- **실제 Supabase에 붙이기는 그때 사용자의 허락이 필요하다**(SQL 편집기, 사용자가 한다). 그 전에는 화면이 읽기·저장에서 `E-STATS-READ-FAILED`·`E-SAVE-FAILED`를 보인다

#### TASK-7 저장·읽기 (`src/lib/storage/stats.ts`, 환자 구역 밖)
```ts
export type StatsSource = 'bit' | 'file'
export async function saveStats(input: { months: MonthPayload[]; days: DayPayload[]; source: StatsSource }, deps?: { client?: SupabaseLike }): Promise<{ saved: number }>   // 실패 throw StorageError('E-SAVE-FAILED')
export async function readDays(range: DateRange, deps?): Promise<{ rows: DayPayload[]; dropped: number; latest: { at: string; source: StatsSource } | null }>
export async function readMonths(range: { from: string /* YYYY-MM */; to: string }, deps?): Promise<{ rows: MonthPayload[]; dropped: number; latest: … }>
```
- 클라이언트는 `lib/supabase/browser.ts`의 `supabaseBrowser()`. upsert는 `onConflict: 'hospital_id,day'`(`hospital_id`는 DB 기본값). 한 번에 200줄씩 나눠 보낸다
- ESLint에 `src/lib/storage/**` 블록을 더한다(파일럿에서 미뤄 둔 블록, stats-core design.md '울타리'): `lib/parsers`·`lib/bridge`·`workers`·`lib/analytics`(`dates` 밖) import 금지, `console`·브라우저 저장소 금지

### Phase 3 · 숫자와 글

#### TASK-8 처방 추세 (`src/lib/analytics/rxTrend.ts`)
```ts
export type TrendBucket = 'day' | 'week' | 'month'
export type TrendComparison = 'PreviousEqualDays' | 'PreviousYear' | 'PreviousMonth'   // 원본 enum 이름 그대로
export type TrendPoint = { code: string; start: string; end: string; label: string; partial: boolean
  count: number; newCount: number; returningCount: number; quantity: null; amount: null }
export function comparisonRange(from: string, to: string, c: TrendComparison): { from: string; to: string; notes: string[] }
export function comparisonLabel(c: TrendComparison): string
export function buildTrend(days: readonly DayPayload[], req: { from; to; bucket: TrendBucket; codes: string[] }): { points: TrendPoint[]; totals: Map<string, number> }
```
- 원본 `TrendMath.cs`의 줄을 옮긴다. 다른 점은 시험 머리 `knownDiffs`: 자료는 저장 모양(처방 `patients` = 그날 그 처방 환자 수 = 건)이고 소모량·금액이 없다, 일 숫자가 없는 날은 0으로 채우지 않는다, 증감 글자는 `compareNumbers`·`formatDelta`

#### TASK-9 처방별 신환·재진 (`src/lib/analytics/rxVisitSplit.ts`)
```ts
export type VisitRow = { p: number; d: string; c: string; f: string }          // 메모리 번호·YYYY-MM-DD
export type RxSplitLine = { code: string; label: string; newPatients: number; returning: number; total: number }
export type RxSplit = { from: string; to: string; visits: number; patients: number; newPatients: number; returning: number; lines: RxSplitLine[]; invalidCodes: number }
export function rxVisitSplit(rows: readonly VisitRow[], totals: …, codes: readonly string[], range: DateRange, names: ReadonlyMap<string, string>): RxSplit
export function rxVisitSplitDays(…): RxSplitDay[]
export function formatRxVisitSplit(hospital: string, s: RxSplit): string
export function formatRxVisitSplitDays(hospital: string, s: RxSplit, days: RxSplitDay[]): string
export function rxVisitHeadline(s: RxSplit): string
```
- 골든: `scripts/stats/golden/rx_visit_split.py`(작은 실행 글, `python3 -I`, 원본 경로는 `YANGJI_SRC`)가 `medicore/rx_visit_split.py`를 가짜 줄(`fixtures/stats/golden/rx-visit-split-input.json`, 차트번호 `9`로 시작하는 가짜)에 돌려 `fixtures/stats/golden/rx-visit-split-*.json`에 쓴다. 머리 `{ source: "seoseungkwan/shared@2a1069b", file, entry, knownDiffs }`. 시험은 원본 없이 커밋한 골든과 견준다
- Worker에 `split` 일을 붙인다(`jobs.ts`의 `splitJob(memory, {from, to})`, `stats.worker.ts`): 코드 목록 = 그 기간 진료 줄의 모든 처방코드, 줄은 합계가 큰 차례(같으면 코드 순). ESWT 묶음은 끈다(범위 밖)

#### TASK-10 보고 문장 (`src/lib/report/reportText.ts`, `src/types/report.ts`)
```ts
export type ReportNumbers = { ok: true; period: string; totalVisits; newPatients; returnPatients; totalAmount; insurerAmount
  noncoveredAmount; cashAmount; cardAmount; transferAmount; treatments: { manual; eswt; carm; sono; cryo }
  laCodes: { code: string; count: number }[]; financeUnconfirmed: boolean; financeUnconfirmedReason?: string; notes: string[] }
  | { ok: false; period: string; reason: string }
export function formatReport(input: { mode: 'daily' | 'monthly'; numbers: ReportNumbers; hospitalName: string }, today: string):
  { text: string; notes: string[]; unconfirmedLines: number[] } | { error: 'future-date' } | { error: 'unconfirmed'; reason: string }
```
- 원본 `format_report`·`report_notes`의 줄을 그대로 옮긴다(띄어쓰기·"고생하셨습니다 !!"까지). 골든: `scripts/stats/golden/reports.py` → `fixtures/stats/golden/report-*.json`(일일·월말·확인 필요·LA 없음·총환 0명 사례)
- `knownDiffs`: 금액·건당진료비는 원 미만 버림(원본 `ROUND_HALF_UP`)

#### TASK-11 화면 숫자 (`src/components/stats/view.ts`, 순수)
```ts
export type StatsPeriod = '7d' | '30d' | '90d' | '12m'
export const DEFAULT_STATS_PERIOD: StatsPeriod = '30d'
export function statsRange(today: string, period: StatsPeriod): { current: Range; previous: Range; load: { from; to }; grain: 'day' | 'month'; label: string }
export function summaryCells(input: { days; months; range }): SummaryCell[]           // 네 칸
export function patientTrend(input): BarBucket[] | null                                 // 일: dashboard trendBuckets 재사용, 12m: 달
export function revisitRates(input): { d7: RateCell; d14: RateCell; d30: RateCell; firstRevisit: FirstRevisit | null }
export function weekdayBars(days, range): BarBucket[] | null                            // dashboard weekdayBuckets 재사용
export function rxList(input): RxTrendRow[] | null                                      // 상위 5개 + 비교·신환/재진
export function rxDetail(input, code): TrendPoint[]                                    // buildTrend 사용
```

### Phase 4 · 화면 (목업 승인 뒤)

#### TASK-12 목업 (`docs/mockups/stats/`)
- `index.html`(ui-90 시안 도구 `docs/mockups/ui-90/app/`의 토큰·글자 단계·css를 따라 만든 정적 시안, 예시 숫자) + `notes.md`(화면별 문구·상태·배치·모양 값). 온라인 artifact로 올려 사용자에게 링크를 준다. 승인되면 `notes.md` 맨 위에 날짜·링크를 적는다
- 옛 시안 `docs/mockups/tab-frame/index.html`의 통계 탭 내용과 사전점검 시안 화면 9(`v-stats`, https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj)를 참고한다

#### TASK-13 섹션 (`src/components/stats/sections/*`)
- `PeriodSummary`·`PatientTrendSection`·`RevisitSection`·`RxTrendSection`·`RxSplitSection`·`ReportSection`·`WeekdaySection`, 공용 `DetailToggle`(자세히 열기·닫기 + 숫자 표)·`CopyButton`(대시보드 `ReportBlock`의 복사 동작을 옮긴 통계 쪽 단추)
- 모두 props만 받는다(서버 컴포넌트로 그릴 수 있는 것은 그렇게, 자세히·복사·고르기만 `'use client'`)

#### TASK-14 화면 (`src/components/stats/StatsScreen.tsx` 등, `'use client'`)
```ts
export function StatsScreen(props: { hospitalName: string; today: string }): JSX.Element
// useStatsData(period) — readDays·readMonths, 기간 바꿈마다 그 기간 + 비교 기간만 읽음
// useStatsWorker() — createStatsWorker 하나(화면을 떠나면 terminate), useBridge({ worker })
```
- 상태: `period`, 저장 숫자(읽은 것 + 방금 만든 것), 불러오기 진행·오류, 보고 숫자·처방별 결과(메모리), "오늘 진료 끝" 체크
- 파일 길: `runAnalysis(files)` → `toMonthPayload`·`toDayPayloads` → `saveStats(source 'file')`

#### TASK-15 탭 연결
- `menu.ts`(통계 `href: '/stats'`, `ready: true`), `briefing/features.ts`(통계 `connect-first`), `notReadyFeatures.ts`(통계 빼기), `src/app/(app)/stats/page.tsx`(`StatsScreen`, `currentMe()`의 병원 이름, `dynamic = 'force-dynamic'`), 이 넷을 맞추는 시험들

#### TASK-16 대시보드 읽기
- `components/dashboard/summary/LiveDashboard.tsx`(`'use client'`, 새 파일): `readDays([today − 97, today])` → `SummarySource` → 지금 `DashboardHome`(report·analysis 자리)을 그린다. `dashboard/page.tsx`는 이것 하나를 놓는다. `source.ts`는 `toSummarySource(result)`(읽은 결과 → none/data, 순수)로 바뀐다
- `view.ts` `revisitView`에 `d30`, `DashboardAnalysis` 30일 줄이 진짜 값을 쓴다

## 데이터 흐름
```
[비트 PC] 화면 [비트에서 불러오기]
   → useBridge.stream('stats.rows', {from, to})            (통로는 조각을 풀지 않고 Worker 포트로)
   → 도우미: RequireHospital → StatsSql 읽기(읽기 전용) → JSON → Chunker → chunk…end
   → Worker: 모으기·sha256 → 검사 → ConsumptionRow(메모리 번호) → aggregate → buildSummary → 저장 모양
      └ 메모리: 진료 줄 {p,d,c,f} · 기간·날짜 합계 · 처방 이름        (split 일이 쓴다)
   → 화면 ← {저장 모양, 확인 건수, 보고 숫자 네 벌}               (차트번호·진료 줄 없음)
   → saveStats(source 'bit') → Supabase months·days (RLS, 숫자만)
   → 화면 = 저장 모양으로 그림 + 처방별 신환·재진(Worker split) + 보고 문장(formatReport, 화면에서)
[파일]   끌어다 놓기 → runAnalysis(지금 그대로) → toMonthPayload·toDayPayloads → saveStats(source 'file') → 같은 그림
[휴대폰·다른 PC] /stats·/dashboard → readDays·readMonths → 같은 그림 (처방별 신환·재진·보고 문장은 "비트 PC에서 불러오면 보여요")
```
- 서버로 가는 것: 달·일 저장 모양(합계·처방코드·처방 이름·처방별 환자·신환·재진 수, 재방문 수)과 출처('bit'|'file')뿐. 차트번호·진료 줄·금액·보고 글·파일 이름은 가지 않는다
- 기간: 일 기간 = 어제까지 N일(대시보드와 같다), 12개월 = 이번 달 포함 12달. 비교 = 바로 앞 같은 일수 / 작년 같은 12달. 불러올 범위 = 비교 기간 첫날이 든 달 1일 ~ 오늘(달 경계에서 시작해 이미 완전한 달이 덜 덮인 달로 바뀌지 않게, 트리거도 한 번 더 막는다)

## 결정과 트레이드오프
- **도우미는 원본 SQL로 읽는다(화면 표 47이 아니라)**: 청구 2단계의 `VendorGridExport`를 기다리지 않고 main의 1단계 부품만 쓴다. 원본 통계 기능도 SQL이었다. 대가: 신환 기준이 파일과 다를 수 있다 — 도우미는 '비트에 남은 그 환자의 첫 유효 내원일'(원본 일일보고와 같은 기준), 파일은 '초재진구분' 칸. 같은 가짜 자료로는 두 길이 같음을 시험한다(AC-505.3). 실제 숫자 차이는 의원 PC 시험에서 지난달을 비교해 본다. 화면 출처 줄(AC-514.7)로 어느 길 숫자인지 보인다
- **진료 줄 SQL은 원본에서 처방 코드 거르기만 뺐다**: 원본은 고른 코드(최대 100개)만 읽었지만, 통계는 모든 처방이 필요하다. 다른 줄은 원본 그대로이고 시험이 그 한 덩어리만 다른지 본다
- **`@daily`를 Char(1)로**: 관문(`ReadOnlyGuard`)·`SqlBitDb`는 글자 매개변수만 안다. SQL Server는 `@daily=1`에서 '1'을 숫자로 바꿔 비교한다. 의원 PC 시험에서 일일·월말 숫자를 원본과 견준다
- **화면은 저장 모양만 그린다**: PC·휴대폰·대시보드 숫자가 같다. 대가: 주 단위·임의 기간의 '서로 다른 환자 수'는 저장 모양으로 못 만든다 → 처방 추세는 '건'(그날 그 처방 환자 수의 합), 처방별 신환·재진(명)은 비트 PC에서 불러온 직후만
- **처방 추세는 건수만**: 저장 모양에 금액·소모량이 없고, 사용자가 정한 통계 내용에도 없다. 원본 금액 사실 SQL(`VisitFactsSql`)은 고른 코드 목록이 필요해 `stats.rows {from, to}`로는 못 돈다. 금액은 매출 탭에서(사용자에게 물을 것 2)
- **첫 재방문까지 날수의 마지막 칸은 "30일 안에 다시 안 옴"**: 원본 `ReturnAfter30Days`(30일 넘어 다시 옴)는 관찰 끝날에 따라 늘 바뀌어 저장 숫자로 못 둔다. 7일·14일·30일 누적 수로 네 칸을 만든다(합 = 집단)
- **보고 숫자는 저장하지 않는다**: 금액은 서버에 두지 않고(통계 표는 숫자만이지만 매출 표는 매출 명세가 정한다), 휴대폰 복사는 범위 밖(사용자에게 물을 것 1)
- **`schemaVersion`은 2 그대로**: 저장 표가 이 명세에서 처음 생긴다. 옛 v2 줄이 없으니 버전 올림과 옛 줄 읽기가 필요 없다
- **완전한 줄은 덜 덮인 줄로 안 바뀐다(트리거)**: 짧은 파일을 넣어도 이미 완전한 달이 망가지지 않는다(코드보다 DB 제약, plan.md §0)
- **`hospital_id`는 DB 기본값**: 브라우저가 병원 id를 보낼 길이 없다(권한 열에서 뺌). RLS가 한 번 더 막는다
- **도우미 자료는 동네를 비운다**: 원본 SQL은 주소를 읽지 않는다. 동네 보기는 범위 밖
- **"오늘 진료 끝"은 사람이 켠다**: 진료 끝 시각이 요일마다 달라 시각으로 정하지 않는다(사용자에게 물을 것 3). 켜지 않으면 오늘 숫자는 '덜 끝남'이라 대시보드 '지난주 같은 요일보다'가 기다린다
- **복사 단추는 통계 폴더에**: 사전점검 5단계가 만들 `components/common/CopyButton.tsx`와 겹치지 않게 `components/stats/sections/CopyButton.tsx`에 둔다. 나중에 하나로 합칠 수 있다
- **조각 모으기는 통계 Worker에 따로**: 청구 2단계 `workers/precheck/assemble.ts`가 main에 없다. 같은 일을 `workers/stats/assemble.ts`에 만들고, 청구가 나중에 이것을 불러 쓸 수 있게 이름·모양을 일반으로 둔다

## 다른 작업과 겹치는 파일
- 청구 사전점검 브랜치(`feat-precheck`)와 겹침 — 작게, 더하기만:
  - `helper/src/Precheck.Core/Bit/Sql.cs`: `IsAllowed`·`ParametersOf`가 `StatsSql`도 보게 두 줄 (TASK-3)
  - `helper/src/Precheck.Helper/Program.cs`: `StatsCommands.Register(...)` 한 줄 (TASK-3)
  - `src/types/errors.ts`·`src/lib/errors.ts`·`src/lib/errors.test.ts`: `E-STATS-HISTORY`·`E-STATS-TOO-BIG`(TASK-5), `E-SAVE-FAILED`·`E-STATS-READ-FAILED`(TASK-7)를 끝에 더함
  - `eslint.config.mjs`·`src/guardrails.test.ts`: `lib/storage` 블록 더함 (TASK-7)
  - 고치지 않음: `src/workers/precheck/jobs.ts`(없음, 만들지 않음), `helper/src/Precheck.Helper/Commands/*`, `helper/src/Precheck.Windows/SqlBitDb.cs`, `src/types/precheck.ts`, `src/lib/bridge/*`(명령 표에 `stats.rows`가 이미 있다)
- 다른 탭 명세(환자·매출·업무일지 등)와 겹칠 수 있음 — 탭을 진짜 화면으로 바꿀 때 같은 줄을 고친다:
  - `src/components/shell/menu.ts`·`shell.test.tsx`, `src/components/dashboard/briefing/features.ts`·`features.test.ts`·`DashboardHome.test.tsx`(목차 옆 글의 개수), `src/components/common/notReadyFeatures.ts`·`notReadyFeatures.test.ts`, `src/app/(app)/notReadyPages.test.tsx`·`tabFrame.test.tsx` (TASK-15)
  - `src/components/ui/classes.test.ts`의 `APP_DIRS`에 `src/components/stats` 한 줄 (TASK-13)
- 탭 틀·대시보드(이미 main, tab-frame·ui-90 명세): `components/dashboard/summary/*`·`src/app/(app)/dashboard/page.tsx`·그 시험 (TASK-2 가짜 자료 칸, TASK-16 읽기)
- stats-core(이미 main): `lib/analytics/aggregate.ts`·`compare.ts`·`types/analysis.ts`(TASK-1), `lib/payload/*`·`types/payload.ts`(TASK-2)
- `phases/index.json`: 통계 Phase 넷을 끝에 더함(사전점검 줄은 그대로 둠)

## 사전점검 명세가 할 일 (이 명세는 고치지 않는다)
- `specs/precheck/requirements.md`에서 REQ-027~031을 빼고 "통계 명세(`specs/stats`)로 옮김"이라 적는다. `tasks.md`의 TASK-27~31, `design.md` 2절 표의 통계 줄(처방 추세·30일 재방문·처방별 신환·재진·일일·월말 보고)·4-3절 `stats.rows` 설명·6-2절 `stats` 일·15절 '통계 금액·소모량'·16·17절 통계 화면 줄도 같다
- `phases/precheck-6-stats/`를 지우고 `phases/index.json`에서 그 줄을 뺀다. Phase 7(백업)은 번호를 그대로 둘지 그 명세가 정한다
- 청구 2단계 `assemble.ts`는 `src/workers/stats/assemble.ts`를 불러 쓸 수 있다. 사전점검 5단계 `components/common/CopyButton.tsx`는 `components/stats/sections/CopyButton.tsx`와 합칠 수 있다
- 명령 표의 `stats.rows`(`maxDays` 800)는 그대로 쓴다. 도우미 `Commands/RequireHospital.cs` 주석의 `stats.rows`도 맞다

## 사용자에게 물을 것 (기본값대로 계획했다)
1. **처방별 신환·재진 표와 원장님 보고 문장은 비트 PC에서 불러온 뒤에만** 보여도 될까요? 휴대폰에서는 "비트 PC에서 불러오면 보여요"이고, 금액과 진료 줄은 서버에 저장하지 않습니다. (기본: 예)
2. **처방 추세는 건수만** 보여도 될까요? 처방별 금액·소모량은 매출 탭에서 봅니다. (기본: 예)
3. **오늘 숫자를 '끝난 날'로 정하는 법**: [비트에서 불러오기] 옆 "오늘 진료 끝" 체크를 켜고 불러오면 오늘 숫자를 확정합니다. 켜지 않으면 오늘은 '진행 중'이라 대시보드의 '지난주 같은 요일보다'가 비어 있습니다. (기본: 체크 상자)
4. 보고 문장 고르기: 일일보고는 오늘·어제, 월말보고는 이번 달(지금까지)·지난달. (기본: 이 넷)
5. 기간 단추: 최근 7일·30일(처음)·90일·12개월. (기본: 이 넷)
6. 첫 재방문까지 날수의 넷째 칸: 원본의 "30일 넘어 다시 옴" 대신 "30일 안에 다시 안 옴". (기본: 이렇게)

## 위험 / 미해결 질문
- **실제 비트 DB에서의 SQL**: 리눅스에서는 가짜 `IBitDb`로만 시험한다. 진료 줄 SQL(원본에서 한 덩어리 뺌)과 `@daily` Char(1)은 의원 PC 시험에서 확인한다: 지난달 숫자를 양지바른 결과·비트 통계와 비교, 800일 읽기 시간 재기
- **줄 수·크기**: 800일 모든 처방 줄이 700,000줄을 넘을 수 있다. 넘으면 `E-STATS-TOO-BIG`("기간을 줄여 다시")이고, 12개월 보기는 그때 불러올 범위를 줄인다(그 결정은 의원 PC 시험 뒤)
- **12개월 일 숫자 읽기**: 12개월 보기의 요일별은 일 숫자 365줄을 읽는다(처방 목록 때문에 줄마다 수 KB, 합 수 MB). 휴대폰에서 느리면 그때 요일별만 최근 90일로 줄인다
- **실제 Supabase 표**: TASK-6 SQL을 사용자가 붙이기 전에는 저장·읽기가 실패한다(화면은 오류 카드). 붙일 때 허락을 받는다
- **대시보드 첫 그림**: 대시보드가 브라우저에서 읽으므로 읽는 동안 잠깐 연결 전 모양이 보일 수 있다. TASK-16에서 읽는 동안은 분석 자리에 "불러오는 중"을 둔다
- **신환 기준 차이**: 위 '결정'. 파일과 도우미를 번갈아 쓰면 같은 날 숫자가 조금 바뀔 수 있다(가장 최근 저장이 이긴다, 완전한 줄끼리)
- **원본 사본 접근**: 골든·SQL 사본을 만들 때 원본(`seoseungkwan/shared@2a1069b`)이 필요하다. 없으면 그 step은 `blocked`
