# 설계: 통계 탭 (비트 PC 자료 읽기 · 저장 · 통계 화면)

## 개요
- 숫자는 한 길로 만든다: 자료(도우미 줄 또는 파일) → Worker 안 `aggregate` → `buildSummary` → 저장 모양(`MonthPayload`·`DayPayload`, stats-core v2 + 선택 칸 `within30`·`after30`) + 덮은 기간 → 서버 `stats_months`·`stats_days`·`stats_coverage` 표. 화면(통계 탭·대시보드)은 **저장 모양만** 그린다. 그래서 PC와 휴대폰, 통계 탭과 대시보드의 숫자가 같다
- 저장 모양으로 만들 수 없는 두 가지(처방별 신환·재진 = 기간 안 서로 다른 환자 수, 원장님 보고 문장 = 금액)는 비트 PC에서 불러온 직후 Worker 메모리·화면 상태에만 있다. 휴대폰에서는 "비트 PC에서 불러오면 보여요"
- 도우미는 main에 있는 1단계 부품(메시지 틀·등록 확인 `HospitalGate`(Core, 도우미 `RequireHospital`이 감싸는 관문)·읽기 전용 `IBitDb`·`ReadOnlyGuard`·`Chunker`)만 쓰고, 비트 통계 화면 표(47) 대신 **원본 양지바른의 통계 SQL**(`RxVisitSplit`·`TrendDataSource` 처방 목록·`OperationalReportSql`)로 읽는다. 원본의 통계 기능(추세·코호트·처방별 신환·일일보고)도 모두 SQL로 읽었다. 화면 표 읽기(`VendorGridExport`)는 청구 2단계 몫이라 기다리지 않는다
- 파일 올리기(stats-core)는 예비로 쓴다. 파서·`analyzeFiles`·`runAnalysis`는 고치지 않고, 30일 재방문을 세기·요약·저장 모양에 더하고 주·달 `totals`를 일 칸의 합으로 바꾼다(AC-501.6)
- 환자 수는 접수 기준이다(requirements.md 배경 '환자 수의 뜻', 2026-11-01 사용자 결정). 도우미 길은 접수 줄(`patientDays`)로 세고, 파일 길은 줄 표시로 센 일 칸을 그대로 둔다. 화면은 저장된 `totals`만 읽으므로 따라온다

## 구성 요소 / 인터페이스

### Phase 1 · 계산 더하기와 자료 길

#### TASK-1 30일 재방문 (`lib/analytics`)
```ts
// types/analysis.ts (더하기만)
export type RevisitCounts = { cohort: number; within7: number; within14: number; within30: number; after30: number }
export type RevisitView = { cohort: number; within7: number | null; within14: number | null; within30: number | null
  after30: number | null; rate7: number | null; rate14: number | null; rate30: number | null }
```
- `aggregate.ts`: 지금 7·14일을 세는 같은 고리에서 `diffDays(f, v) ≤ 30`을 더 본다. 첫 재방문(가장 이른 v > f)이 31일째 이후면 `after30`(원본 `ReturnAfter30Days`, 불러온 자료 끝날까지 본 수). `compare.ts`: 지금 `revisitView`의 N일 판정(`bucketState({from: 칸 첫날, to: addDays(칸 끝날, N)}) === 'complete'`)에 30을 더한다
- **환자 수는 접수 기준(AC-501.6, 2026-11-01)**:
```ts
// types/analysis.ts (더하기만)
export type PatientDay = { patient: number; date: string; receptions: number; firstVisit: boolean }
// lib/analytics/aggregate.ts
export function aggregate(rows: ConsumptionRow[], groups: readonly RxGroupDef[] = [], patientDays?: readonly PatientDay[]): Aggregates
```
  - 두 길 모두: 주·달 `totals` = 그 주·달 일 칸 네 칸(`patients`·`newPatients`·`returning`·`unknown`)의 합. 옛 '서로 다른 환자 수'를 못 박은 시험은 이 이유로만 바뀐다
  - 셋째 인자 없음(파일 길): 일 칸은 지금 그대로(줄 표시로 센 그날 환자)
  - 셋째 인자 있음(도우미 길): 모든 날짜에 처방 줄이 없어도 일·주·월 칸이 생긴다. 일 칸 `totals` = `{ patients: receptions 합, newPatients: firstVisit이 참인 줄 수, returning: patients − newPatients, unknown: 0 }`. 재방문을 세는 외래 날(`visitDays`)과 첫 신환일도 접수 줄을 본다. 그래서 처방 없는 재방문도 재방문이고 처방 없는 첫 내원 환자도 집단에 든다
  - 두 길 모두 `rx[]`·`groups[]`·동네는 그대로다. 접수 줄은 칸의 `visit`에 쓰지 않는다
  - 저장 모양 검사는 고치지 않아도 맞는다: `patients = 신환 + 재진 + 알 수 없음`은 합해도 그대로이고, `cohort ≤ 칸 신환`도 그대로다(도우미 길은 한 환자의 첫 내원일이 하나라 `cohort` = 칸 신환이고, 파일 길의 주·달 칸 신환은 합이라 서로 다른 신환 수보다 작아지지 않는다). `rx: []`도 지금 검사를 지난다
  - 화면과 대시보드는 저장된 `totals`만 읽는다. 그래서 기간 요약 평균, 환자 수 추이, 요일별, 대시보드 "오늘 환자 n명"은 코드를 고치지 않아도 접수 기준을 따라온다. `AC-511.2`·`AC-511.3`·`AC-511.5`·REQ-516은 '서로 다른 환자'라고 적지 않았다. TASK-11·TASK-16은 이 숫자를 다시 계산하지 않는다

#### TASK-2 저장 모양 (`lib/payload`, `types/payload.ts`)
```ts
export type RevisitPayload = { cohort: number; within7: number | null; within14: number | null; within30?: number | null; after30?: number | null }
```
- `schemaVersion: 2` 그대로(저장한 줄이 없다 — stats-core '`v1 읽기는 만들지 않는다`'와 같은 판단). 두 칸은 **선택**이다: `toMonthPayload`·`toDayPayloads`는 늘 쓰고, 검사는 없으면 null로 읽는다. 그래서 다른 브랜치(`feat-ai-report`)와 지금 시험의 옛 가짜 달·일 자료가 고치지 않고 통과한다(C6: 검사를 조여 남의 가짜 자료를 깨지 않는다). 검사 규칙: `7 ≤ 14 ≤ 30 ≤ 집단 ≤ 칸 신환`, `30 + after30 ≤ 집단`, null은 앞에서 뒤로 번진다

#### TASK-3·4 도우미 `stats.rows` (C#)
- 새 폴더 `helper/src/Precheck.Core/Stats/`:
```cs
public static class StatsSql            // 원본 SQL 상수 + 매개변수 표(이름·Char/VarChar·길이). IsAllowed / ParametersOf
public static class StatsErrors         // "E-STATS-HISTORY", "E-STATS-TOO-BIG"
public static class StatsRows           // Read(IBitDb db, string hospitalScope, string from, string to) → StatsRowsResult (TASK-3)
public static class StatsReport         // Read(IBitDb db, string hospitalScope, string to) → ReportSet[4] (TASK-4)
public static class StatsPayload        // Build(...) → JSON 글자 하나 (System.Text.Json, 정해 둔 열쇠만)
public static class StatsCommands       // Register(Dispatcher, BitServices): "stats.rows" → HospitalGate.Open → Build → Chunker.Send
// (RequireHospital은 Precheck.Helper 안(internal)이라 Core에서는 부르지 못한다 — 같은 관문 HospitalGate.Open을 쓴다)
```
- 원본 사본: `helper/tests/Precheck.Core.Tests/Stats/original-sql/*.sql`(원본 파일 통째가 아니라 SQL 문장만, 청구 `Bit/original-sql`과 같은 방식)
- SQL 목록(모두 원본 `seoseungkwan/shared@2a1069b` `YangjiBareun_사전점검/vendor/drbit_export/`):

| 상수 | 원본 | 매개변수 |
|---|---|---|
| `VisitRowsSql` | `RxVisitSplit.Visits + RowsSql`에서 처방 코드 거르기 한 덩어리만 뺌 | `@from`·`@to` Char(12) `yyyyMMdd0000`, `@hospital` VarChar(32) |
| `VisitSummarySql` · `VisitDaysSql` | `RxVisitSplit.SummarySql` · `DaysSql` 그대로 | 같음 |
| `PatientDaysSql` (2026-11-01) | **원본에 없는 새 문장**. `RxVisitSplit.Visits` 글 그대로 + 아래 SELECT. 사본 대조는 `Visits` 부분에만 한다(AC-503.2·AC-503.5) | 같음 |
| `CodeNamesSql` | `TrendDataSource.LoadCodes`의 SQL(선택 코드 없음 `codeFilter = ""`) | `@from`·`@to`·`@priorFrom`·`@priorTo` Char(8). 앞 둘 = 기간, 뒤 둘 = 같은 값 |
| `HistoryGuardSql` · `UnsupportedFinanceSql` · `PatientsSql` · `TreatmentsSql` · `LaCodesSql` · `FinanceNormalSql` · `FinanceReceivableSql` · `FinanceMultiplicitySql` · `ReceivableMultiplicitySql` | `OperationalReportSql` 그대로 | `@day`·`@nextDay` Char(8), `@from`·`@to` Char(12), `@hospital` VarChar(32), `@daily` **Char(1)** |

- `PatientDaysSql`(접수 줄, 환자·날마다 한 줄). 처방 표를 잇지 않으므로 처방 없는 접수도 나오고, `Visits`의 조건(`OcmComStt IN ('WN','HN','TN','PN')`·`OcmRsuYon<>'O'`)을 지나지 못한 접수는 나오지 않는다:
```sql
-- StatsSql.Visits 뒤에 잇는다
SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay
FROM PeriodVisits v LEFT JOIN FirstVisits f ON f.PatientId=v.PatientId
WHERE v.PatientId IS NOT NULL
GROUP BY v.PatientId,v.VisitDay,f.FirstDtm
ORDER BY v.PatientId,v.VisitDay
```
- 관문: `Sql.cs`의 `IsAllowed`·`ParametersOf` 두 줄이 `StatsSql`에 없으면 거절하던 것을 `StatsSql`도 본다(아래 '다른 작업과 겹치는 파일'). `Sql.All`은 청구 목록 그대로라 청구 시험(`ReadOnlyGuard.test.cs`의 사본 대조)이 바뀌지 않는다
- 시간 제한: 원본처럼 자료 SQL 150초, 메타(`HistoryGuard`) 15초. 넘으면 `E-BIT-READ-FAILED`
- 읽는 순서: `HospitalGate.Open(services)` → `HistoryGuard`(1이면 `E-STATS-HISTORY`) → 진료 줄(700,000줄 넘으면 `E-STATS-TOO-BIG`) → 접수 줄(`PatientDaysSql`, 700,000줄 넘으면 `E-STATS-TOO-BIG`) → 기간 합계 → 날짜별 → 처방 이름(진료 줄에 나온 코드만 남김) → 보고 네 벌(TASK-4) → JSON → `Chunker.Send(sink, request.Id, json)`(안에서 `Split`으로 나눠 보냄). 하나라도 예외면 `error`만(반쪽 없음, 청구 design.md 9-2와 같은 규칙)
- `Program.cs`: 지금 `BitCommands.Register(dispatcher, HelperServices.Create());` 다음에 `StatsCommands.Register(dispatcher, HelperServices.Create());` 한 줄만 더한다(지금 `services` 변수가 없다. 지금 줄을 고치지 않는 가장 작은 더하기. `HelperServices.Create()`는 만들기만 하고 비트를 건드리지 않아 두 번 불러도 된다)

#### 도우미 → Worker JSON (`stats.rows` 답, 조각을 모은 글자)
```jsonc
{
  "v": 2, "from": "2026-09-01", "to": "2026-11-01",
  "summary": { "visits": 0, "patients": 0, "newPatients": 0, "noChart": 0, "duplicate": 0, "noFirst": 0 },
  "days":   [["20260901", 0, 0, 0]],                 // [날짜, 내원, 실환자, 신환] (RxVisitSplit 메모리용)
  "patientDays": [["9xxxxx", "20260901", 2, "20260115"]], // [차트번호, 진료일, 접수 건수, 첫 내원일(없으면 null)], 환자·날마다 한 줄
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
- `patientDays`의 차트번호는 `rows`처럼 Worker 밖으로 나가지 않는다. `days`는 `RxVisitSplit` 메모리용으로 그대로 두고 `patientDays`와 대조하지 않는다(문장이 몇 초 간격으로 돌아 진료 시간에 강하게 대조하면 불러오기가 들쭉날쭉 실패한다)
- 보고 벌의 건수는 0 이상이고, 금액 6칸은 음수일 수 있다(절댓값 10^14 이하, AC-505.2, '결정과 트레이드오프')

#### TASK-5 통계 Worker (`src/workers/stats*`, 환자 자료 구역)
```ts
// src/workers/stats/assemble.ts — 통로 포트의 조각 모으기 (통계 몫. 다른 브랜치가 쓰리라 기대하지 않는다)
export function createAssembler(): { chunk(id, seq, data): void; end(id, count, bytes, sha256): Promise<string /* JSON 글자 */>; abort(id, code): void }
// src/workers/stats/helperData.ts — 검사와 변환
export function parseStatsRows(text: string, req: { from: string; to: string }): StatsRowsData   // 모양이 틀리면 throw StatsDataError('E-BRIDGE-BAD-REPLY'), rows와 patientDays가 어긋나면 throw StatsDataError('E-STATS-CHANGED')
export function toConsumptionRows(data: StatsRowsData, ids: PatientIds): ConsumptionRow[]       // firstVisit = (f === d), outpatient true, region null, rxType ''
export function toPatientDays(data: StatsRowsData, ids: PatientIds): PatientDay[]               // firstVisit = (f === d). ids는 진료 줄과 같은 PatientIds
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
  covered: { from: string; to: string } | null   // 저장할 덮은 기간 = [from, min(to, 끝난 마지막 날)], 끝난 마지막 날 = closeToday ? 오늘 : 어제. 비면 null
  // (요약 buildSummary에 넣는 덮은 기간은 [from, min(to, 오늘)] 그대로 — 오늘 줄은 partial이다)
  quality: 'valid' | 'incomplete'; checks: StatsChecks
  months: MonthPayload[] | null; days: DayPayload[] | null      // incomplete면 null
  report: { daily: ClinicReportNumbers[]; monthly: ClinicReportNumbers[] }   // types/clinicReport.ts (C6: report.ts는 feat-ai-report 몫)
}
```
- 흐름: 화면이 `stream('stats.rows')`를 부르면 조각은 통로 → Worker 포트로 바로 간다(`workerSink`). `stream`이 `{id, count}`로 끝나면 화면이 Worker에 `load {streamId: id, …}`를 보낸다. Worker는 그 id의 글자를 꺼내 검사 → `ConsumptionRow`·`PatientDay` → `aggregate(rows, [], patientDays)`(그룹 없음) → `buildSummary`(`covered = [{from, to: min(to, today)}]`, `quality` = 확인 건수가 모두 0이면 valid, `today` = closeToday면 내일) → `AnalysisResult` → 저장 모양(동네 비움) → 화면
- 진료 줄(`{ p: 메모리 번호, d, c, f }[]`)·기간 합계·날짜별 합계·처방 이름은 Worker의 `memory`에 둔다. 다음 `load`가 덮어쓴다. 접수 줄은 `load` 안에서 세는 데만 쓰고 `memory`에 두지 않는다
- 검사 더하기(AC-505.2): `v` 2, 접수 줄 4칸(차트번호 빈칸 아닌 글자, 기간 안의 맞는 날짜, 건수는 1 이상 정수, 첫 내원일은 글자 또는 null이고 ≤ 진료일), 700,000줄 이하, 환자·날마다 한 줄, 한 환자의 첫 내원일은 배열마다 하나. 아니면 `E-BRIDGE-BAD-REPLY`. 모양이 맞은 뒤 두 배열을 대조한다: `rows`의 환자·날이 `patientDays`에 없거나 한 환자의 첫 내원일이 두 배열에서 다르면 `E-STATS-CHANGED`(Worker가 정하는 번호이고 도우미는 보내지 않는다). `withoutFirst`는 두 배열의 환자를 모두 센다
- 처방 없는 접수만 있는 날은 `rx: []`인 `DayPayload`로 저장한다. `validate.ts`·`toDayPayloads`·`toMonthPayload`는 고치지 않는다(AC-505.8)

### Phase 2 · 저장과 처방 추세 (TASK-6·7·8)

#### TASK-6 표 (`supabase/migrations/20261101000200_stats.sql`)
```sql
-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로. 다른 브랜치가 먼저 만들어도 다시 돌아간다)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.stats_months (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  partial boolean not null,
  source text not null check (source in ('bit', 'file')),
  payload jsonb not null check ((
    jsonb_typeof(payload) = 'object' and payload->'schemaVersion' = '2'::jsonb
    and payload->'month' = to_jsonb(month) and payload->'partial' = to_jsonb(partial)
    and octet_length(payload::text) <= 1048576) is true),        -- 열쇠가 없어 NULL이면 거부(is true). 크기는 '결정과 트레이드오프'
  updated_at timestamptz not null default now(),
  primary key (hospital_id, month)
);
-- stats_days: month 대신 day date, payload->'day' = to_jsonb(day::text), 크기는 <= 65536
create table public.stats_coverage (           -- 불러온(덮은) 기간 한 줄씩, 넣기만
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals(id) on delete cascade,
  from_day date not null, to_day date not null, source text not null check (source in ('bit', 'file')),
  created_at timestamptz not null default now(),
  check (from_day <= to_day and to_day - from_day < 800)
);
-- 권한: revoke all from anon, authenticated →
--   stats_months·stats_days: grant select, insert (month|day, partial, source, payload), update (month|day, partial, source, payload)
--   (PostgREST upsert는 보낸 칸 모두를 DO UPDATE SET에 넣는다 — 열쇠 칸 month|day도. hospital_id는 어느 권한에도 없다)
--   stats_coverage: grant select, insert (from_day, to_day, source)
-- RLS: select/insert/update 모두 hospital_id = (select public.my_hospital_id()). delete 정책 없음
-- 트리거 함수 public.stats_keep_complete()(통계 이름, definer 아님, search_path = ''), before update:
--   old.partial = false and new.partial = true면 return old(옛 줄 그대로), 아니면 new.updated_at = now(); return new
```
- 시험: `supabase/stats-rls.test.ts`(PGlite, 지금 `rls.test.ts`의 Supabase 흉내 + 인증 마이그레이션 → 통계 마이그레이션). `my_hospital_id()`를 다른 브랜치 글자로 먼저 만들어 둔 뒤 돌려도 되는지, 열쇠가 빠진 payload(`{}` 등) 거부, upsert 꼴 문장을 사용자 역할로
- 표 이름은 plan.md §5의 `months`·`days` 대신 `stats_*`다(다른 브랜치 표와 이름이 부딪히지 않게, C6). TASK-6이 `docs/ARCHITECTURE.md` 'DB 표'를 고친다
- **실제 Supabase에 붙이기는 그때 사용자의 허락이 필요하다**(SQL 편집기, 사용자가 한다). 그 전에는 화면이 읽기·저장에서 `E-STATS-READ-FAILED`·`E-STATS-SAVE-FAILED`를 보인다

#### TASK-7 저장·읽기 (`src/lib/storage/stats.ts`, 환자 구역 밖)
```ts
export type StatsSource = 'bit' | 'file'
export async function saveStats(input: { months: MonthPayload[]; days: DayPayload[]; covered: DateRange | null; source: StatsSource }, deps?: { client?: SupabaseLike }): Promise<{ saved: number }>   // 실패 throw StorageError('E-STATS-SAVE-FAILED')
export async function readCoverage(range: DateRange, deps?): Promise<DateRange[]>          // 겹치는 덮은 기간을 mergeRanges로 합침
export async function readDays(range: DateRange, deps?): Promise<{ rows: DayPayload[]; dropped: number; latest: { at: string; source: StatsSource } | null; fromFile: boolean }>   // fromFile = 남긴 줄 가운데 source가 'file'인 줄이 있음
export async function readMonths(range: { from: string /* YYYY-MM */; to: string }, deps?): Promise<{ rows: MonthPayload[]; dropped: number; latest: … }>
```
- 클라이언트는 `lib/supabase/browser.ts`의 `supabaseBrowser()`. upsert는 `onConflict: 'hospital_id,day'`(`hospital_id`는 DB 기본값). 한 번에 200줄씩 나눠 보내고, 다 되면 `stats_coverage`에 덮은 기간 한 줄
- 파일의 덜 덮인 달 줄(AC-507.1): `source`가 'file'이고 `partial: true`인 달 줄은 보내지 않고 그 달의 일 줄은 보낸다. 덮은 기간을 읽지 않는다. 그 줄에는 그 파일 하나가 든 숫자만 있고, 달 줄을 읽는 곳은 `feat-ai-report`뿐이다. 'bit'의 덜 덮인 달 줄은 지금처럼 보내고 덜 덮인 'bit' 줄을 바꾼다. 트리거는 커밋한 그대로다. `saved`는 보낸 줄 수다
- `readMonths`는 이미 만든 그대로 둔다. 읽는 곳은 `feat-ai-report`이고 통계 화면은 쓰지 않는다
- ESLint에 `src/lib/storage/stats.ts` 블록을 더한다(통계 파일만 — 다른 브랜치가 `src/lib/storage/`에 둘 파일에는 규칙을 씌우지 않는다. 파일럿에서 미뤄 둔 블록, stats-core design.md '울타리'): `lib/parsers`·`lib/bridge`·`workers`·`lib/analytics`(`dates`·`coverage` 밖) import 금지, `console`·브라우저 저장소 금지

#### TASK-8 처방 추세 (`src/lib/analytics/rxTrend.ts`)
```ts
export type TrendBucket = 'day' | 'week' | 'month'
export type TrendComparison = 'PreviousEqualDays' | 'PreviousYear' | 'PreviousMonth'   // 원본 enum 이름 그대로
export type TrendPoint = { code: string; start: string; end: string; label: string; partial: boolean
  count: number; newCount: number; returningCount: number; quantity: null; amount: null }
export function comparisonRange(from: string, to: string, c: TrendComparison): { from: string; to: string; notes: string[] }
export function comparisonLabel(c: TrendComparison): string
export function buildTrend(days: readonly DayPayload[], covered: readonly DateRange[], req: { from; to; bucket: TrendBucket; codes: string[] }): { points: TrendPoint[]; totals: Map<string, number> }
```
- 원본 `TrendMath.cs`의 줄을 옮긴다. 다른 점은 시험 머리 `knownDiffs`: 자료는 저장 모양(처방 `patients` = 그날 그 처방 환자 수 = 건)이고 소모량·금액이 없다, 덮은 기간 밖의 날은 0으로 채우지 않는다(원본은 읽은 기간 전체가 자료라 늘 0 — 우리는 덮은 기간 안의 줄 없는 날만 0 = 휴진), 증감 글자는 `compareNumbers`·`formatDelta`

### Phase 3 · 숫자와 글, 화면 목업 (TASK-9·10·11·12)

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
- Worker에 `split` 일을 붙인다(`jobs.ts`의 `splitJob(memory, {from, to})`, `stats.worker.ts`): 코드 목록 = 그 기간 진료 줄의 모든 처방코드, 줄은 합계가 큰 차례(같으면 코드 순). ESWT 묶음은 끈다(범위 밖). 머리 글의 기간 합계는 고른 기간의 `days` 합이다(AC-509.4). 미완성 불러오기에도 숫자를 보인다

#### TASK-10 보고 문장 (`src/lib/clinicReport/reportText.ts`, `src/types/clinicReport.ts`)
- 이름은 통계 몫으로 짓는다: `src/types/report.ts`·`ReportNumbers`·`src/lib/report/*`는 `feat-ai-report`가 쓴다(C6)
```ts
export type ClinicReportNumbers = { ok: true; period: string; totalVisits; newPatients; returnPatients; totalAmount; insurerAmount
  noncoveredAmount; cashAmount; cardAmount; transferAmount; treatments: { manual; eswt; carm; sono; cryo }
  laCodes: { code: string; count: number }[]; financeUnconfirmed: boolean; financeUnconfirmedReason?: string; notes: string[] }
  | { ok: false; period: string; reason: string }
export function formatClinicReport(input: { mode: 'daily' | 'monthly'; numbers: ClinicReportNumbers; hospitalName: string }, today: string):
  { text: string; notes: string[]; unconfirmedLines: number[] } | { error: 'future-date' } | { error: 'unconfirmed'; reason: string }
```
- 원본 `format_report`·`report_notes`의 줄을 그대로 옮긴다(띄어쓰기·"고생하셨습니다 !!"까지). 골든: `scripts/stats/golden/reports.py` → `fixtures/stats/golden/report-*.json`(일일·월말·확인 필요·LA 없음·총환 0명·음수 금액 사례)
- `knownDiffs`: 금액·건당진료비는 원 미만 버림(원본 `ROUND_HALF_UP`, 음수도 0 쪽으로 버린다), 안내 첫 줄은 '총진료비 ÷ 총환에서 원 미만을 버립니다.'(원본은 '…을 원 단위로 반올림합니다.'), 버린 결과가 0이면 부호 없이 '0원'(원본은 '-0원' 또는 '-1원'). 음수 금액의 글은 골든이 정한다

#### TASK-11 화면 숫자 (`src/components/stats/view.ts`, 순수)
```ts
export type StatsPeriod = '7d' | '30d' | '90d' | '12m'
export const DEFAULT_STATS_PERIOD: StatsPeriod = '30d'
export function statsRange(today: string, period: StatsPeriod): { current: Range; previous: Range; finishedCohort: Range | null; load: { from; to }; grain: 'day' | 'month'; label: string }   // finishedCohort: '30d' = 오늘 − 60 ~ 오늘 − 31(previous와 같은 범위), 나머지 null
export function summaryCells(input: { days; covered; range }): SummaryCell[]          // 네 칸
export function patientTrend(input): BarBucket[] | null                                 // 일: dashboard trendBuckets 재사용, 12m: 달 칸(그 달 일 숫자의 합)
export type StatsRateCell = { kind: 'rate'; value: number; within: number; cohort: number; excluded: boolean } | { kind: 'in-progress' } | { kind: 'none' }   // kind 이름은 대시보드 RateCell과 같다. value 0~1, within·cohort = caption과 [자세히] 표의 숫자, excluded = 값이 null이라 뺀 칸이 있음(목업 "…빼고 셌어요")
export function revisitRates(input): { d7: StatsRateCell; d14: StatsRateCell; d30: StatsRateCell; d30Cohort: { from: string; to: string } | null; firstRevisit: FirstRevisit | null }   // 7일 안·8~14일·15~30일·30일 넘어 다시 옴·아직 다시 안 옴
// d30Cohort: '30d'에서 30일 줄이 비율일 때 센 첫날·끝날(30일 값이 숫자인 날만), 그 밖은 null. FirstRevisit은 센 칸의 첫날·끝날 from·to를 함께 싣는다(기준 줄 날짜)
export function weekdayBars(days, range): BarBucket[] | null                            // dashboard weekdayBuckets 재사용
export function rxList(input): RxTrendRow[] | null                                      // 상위 5개(순위는 count) + 비교·신환/재진
export type RxTrendRow = { code: string; name: string; count: number; newCount: number; returningCount: number
  partial: boolean                                          // '12m'에서 count·newCount·returningCount에 덜 끝난 달이 들면 true('일부 기간' 표시)
  comparable: { current: number; previous: number } | null  // '12m' = 끝난 달끼리의 합(null = 끝난 달 없음). 일 기간 = 날 짝(PreviousEqualDays)에서 어느 한쪽이 partial인 짝을 뺀 합(null = 남은 짝 없음, 표시 칸과 상관없이 늘 날 단위). 비교 기간 건수·막대·비교 눈금의 기준(null이면 막대는 count, 눈금 없음)
  delta: Delta }                                            // compareNumbers(comparable.current, comparable.previous). comparable이 null이면 { kind: 'unavailable' }
export type RxDetailPoint = TrendPoint & { covered: boolean }                            // covered = 그 칸의 날이 하나라도 덮은 기간 안에 있음. false인 비교 칸은 "0건"이 아니라 "–"
export function rxDetail(input, code): { current: RxDetailPoint[]; previous: RxDetailPoint[] }   // buildTrend. 칸: 7·30일 = 일, 90일 = 주, 12개월 = 달
// 모든 셈은 덮은 기간(readCoverage)을 같이 받는다
```
- 환자 수·신환·재진은 저장된 `totals` 그대로 쓴다. 접수 기준(AC-501.6)을 여기서 다시 계산하지 않는다(TASK-1 '환자 수는 접수 기준')
- `'12m'`의 달 칸(AC-511.2·AC-511.3): 통계 화면은 달 줄을 읽지 않는다. 칸의 `totals`는 그 달 `DayPayload.totals`의 합이고 일 줄이 하나라도 있는 달만 칸이 있다. 칸의 `partial`은 `buildTrend` 달 점의 `partial`을 그대로 쓴다(달이 끝나지 않았거나 덮이지 않은 날이 있거나 덜 끝난 일 줄이 있다, AC-508.1). `buildTrend`는 코드가 0개면 `RangeError`이므로 판정만 읽을 때는 코드 하나를 넘긴다(처방 없는 접수만 있는 기간에도 칸이 나와야 한다). `rxTrend.ts`는 고치지 않는다. 합에는 그 달의 일 줄을 모두 넣는다(덮이지 않은 날의 줄도 실제 숫자이고 칸에 '일부 기간'이 붙는다). `buildTrend`의 건수는 그 날을 더하지 않으므로 그 달의 처방 건수와 단위뿐 아니라 날도 다를 수 있다
- `revisitRates`의 `'12m'`(AC-511.4): 달 줄이 아니라 일 줄을 읽되 달 단위로 뺀다. 일 줄을 달로 묶어, 그 달의 어느 날이든 N일 값이 null이면 그 달 전체를 N일 셈(분자·분모)에서 뺀다. 첫 재방문까지 날수도 N = 30으로 같다. 옛 달 줄의 동작과 같고 승인된 목업 문구("온 뒤 {N}일이 안 된 달의 신환은 빼고 셌어요", "(온 뒤 30일이 지난 달만)")가 참이 되므로 문구를 바꾸지 않고 AC-513.1의 예외도 늘리지 않는다. 일 기간은 지금처럼 날 단위다

#### TASK-12 클릭 목업 (`docs/mockups/stats/`)
- `index.html`: **클릭 목업**(CLAUDE.md). ui-90 시안 도구 `docs/mockups/ui-90/app/`(`gen.py`·css·`app.js`)와 같은 방식으로, 기간 단추·[자세히]·보고 고르기·[복사]·[비트에서 불러오기]·화면 상태 고르기가 실제로 눌려 바뀐다. 예시 숫자 + `notes.md`(화면별 문구·상태·배치·모양 값). 온라인 artifact로 올려 사용자에게 링크를 준다. 승인되면 `notes.md` 맨 위에 날짜·링크를 적는다
- 승인 전에는 TASK-13~16을 시작하지 않는다
- 옛 시안 `docs/mockups/tab-frame/index.html`의 통계 탭 내용과 사전점검 시안 화면 9(`v-stats`, https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj)를 참고한다

### Phase 4 · 화면 (목업 승인 뒤, TASK-13~17)

#### TASK-13 섹션 (`src/components/stats/sections/*`)
- `PeriodSummary`·`PatientTrendSection`·`RevisitSection`·`RxTrendSection`·`RxSplitSection`·`ReportSection`·`WeekdaySection`, 공용 `DetailToggle`(자세히 열기·닫기 + 숫자 표)·`CopyButton`(대시보드 `ReportBlock`의 복사 동작을 옮긴 통계 쪽 단추)
- 모두 props만 받는다(서버 컴포넌트로 그릴 수 있는 것은 그렇게, 자세히·복사·고르기만 `'use client'`)
- `StackedBarChart`(`components/charts/StackedBarChart.tsx`)에 선택 값 하나만 더한다(AC-513.2, 승인 시안 `notes.md`의 '칸마다 왼쪽 비교 기간 가는 막대'): `BarBucket`의 `comparison?: number | null`. 숫자가 있는 칸은 쌓은 막대 왼쪽에 가는 `bg-faint` 막대(시안 `.pv`)를 그리고, 눈금은 합계와 숫자인 `comparison` 가운데 가장 큰 값으로 정한다. `null`은 막대를 그리지 않는다. 숫자가 있는 칸이 하나도 없으면 그림·표가 지금과 한 글자도 다르지 않다. 숫자가 있는 칸이 있으면 화면 읽기 표에 "비교 기간" 칸 하나가 더 붙는다(그림은 꾸밈이고 숫자는 표가 주는 이 부품의 규칙, UI_GUIDE. `null`은 "–"). `RxTrendSection`이 처방 줄을 열 때 `rxDetail`의 같은 차례 `previous` 점의 `count`를 넣는다(`covered: false`이면 `null`)

#### TASK-14 화면 (`src/components/stats/StatsScreen.tsx` 등, `'use client'`)
```ts
export function StatsScreen(props: { hospitalName: string; today: string }): JSX.Element
// useStatsData(period) — readDays·readCoverage, 기간 바꿈마다 그 기간 + 비교 기간만 읽음(readMonths를 쓰지 않는다. fromFile은 readDays에서)
// useStatsWorker() — createStatsWorker 하나(화면을 떠나면 terminate), useBridge({ worker })
```
- 상태: `period`, 저장 숫자(표에서 읽은 것. 방금 만든 숫자를 합쳐 보이는 것은 저장 실패 때만이다), 불러오기 진행·오류, 보고 숫자·처방별 결과(메모리), "오늘 진료 끝" 체크
- 파일 안내(AC-514.7): 그 기간을 그리려고 읽은 줄(고른 기간과 비교 기간)의 `fromFile`이 하나라도 참이거나 저장하지 못한 방금 만든 파일 숫자를 보이는 동안이면 출처 줄 옆에 승인된 문장을 글자 그대로 보인다. `latest.source`만 보면 최근 비트 줄과 옛 파일 줄이 섞인 기간을 놓친다. 이 문장은 사용자가 승인했고 목업에 없다(AC-513.1의 예외, 목업을 다시 돌리지 않는다)
- 파일 길: `runAnalysis(files)` → `toMonthPayload`·`toDayPayloads` + 덮은 기간 하나(성공한 파일의 기간 줄·받아들인 줄 범위를 `mergeRanges`로 합친 것 가운데 가장 최근 이어진 구간, 끝은 어제 이하) → `saveStats(source 'file')`. `saveStats`는 덮은 기간 하나(`DateRange | null`)만 받는다. 저장에 성공하면 표에서 다시 읽어 그린다: 트리거(완전 → 덜)가 옛 줄을 남겼을 수 있어 방금 만든 파일 숫자를 저장된 줄 위에 합치면 다시 열었을 때와 숫자가 달라진다(AC-514.4). 저장에 실패하면 방금 만든 숫자를 그대로 둔다(AC-514.6)
- 비트 길: `saveStats(source 'bit')`에 성공해도 표에서 다시 읽어 그린다(AC-514.3). 다시 읽어야 `fromFile`이 새로 정해져 파일 안내가 "자료: 비트 PC" 옆에 남지 않는다

#### TASK-15 탭 연결
- `menu.ts`(통계 `href: '/stats'`, `ready: true`), `briefing/features.ts`(통계 `connect-first`), `notReadyFeatures.ts`(통계 빼기), `src/app/(app)/stats/page.tsx`(`StatsScreen`, `currentMe()`의 병원 이름, `dynamic = 'force-dynamic'`), 이 넷을 맞추는 시험들

#### TASK-16 대시보드 읽기
- 대시보드의 "오늘 환자 n명"·신환·재진은 저장된 `totals` 그대로다. 접수 기준(AC-501.6)을 여기서 다시 계산하지 않는다(TASK-1 '환자 수는 접수 기준')
- `components/dashboard/summary/LiveDashboard.tsx`(`'use client'`, 새 파일): `readDays([today − 97, today])` → `SummarySource` → 지금 `DashboardHome`(report·analysis 자리)을 그린다. `dashboard/page.tsx`는 이것 하나를 놓는다. `source.ts`는 `toSummarySource(result)`(읽은 결과 → none/data, 순수)로 바뀐다
- `view.ts` `revisitView(days, range, period?)`는 `{ d7; d14; d30: RateCell; d30Cohort: { from; to; within; cohort } | null }`을 돌려준다. `rateOf`에 `within30`을 더한다(`within30`은 선택 칸이라 빠진 칸은 null로 친다 — `undefined !== null`로 세어지지 않게). `RateCell`은 고치지 않는다(통계 view가 대시보드 함수를 불러 쓴다, AC-511.7)
- `period`가 30이면 30일 줄만 `addDays(range.from, −30)` ~ `addDays(range.from, −1)`(= 오늘 − 60 ~ 오늘 − 31)의 날로 센다. 비율이면 `d30Cohort`에 그 범위에서 30일 값이 숫자인 첫날·끝날과 `within`·`cohort` 합을 싣고, 그 밖은 null이다. `period`를 주지 않거나 7·90이면 30일 줄도 고른 기간 그대로다. 그래서 지금 시험은 부르는 모양을 고치지 않고 기대값에 30일 칸만 더한다(AC-516.4)
- `DashboardAnalysis`는 `revisitView(days, range, period)`로 부르고 30일 줄을 7·14일과 같은 줄로 그린다. `d30Cohort`가 있으면 그 아래 AC-516.2의 caption({N} = `cohort`, {K} = `within`)을 붙인다. 글자는 `view.ts`에서 만든다(`longDate`·`formatCount`)
- 대시보드 `view.ts`는 자기 안에서 끝낸다: 통계 view가 대시보드 view를 불러 쓰므로 `components/stats`를 불러오면 고리가 생긴다. 통계 `revisitRates`와 몇 줄이 겹치는 것은 받아들인다
- 읽는 범위 `오늘 − 97 ~ 오늘`이 이미 오늘 − 60까지 덮으므로 읽기는 고치지 않는다

#### TASK-17 개인정보 E2E (`e2e/stats-privacy.spec.ts`)
- 사용자가 TASK-6 SQL을 실제 Supabase에 붙인 뒤에만 돈다(`npm run e2e`, 지금 `e2e/support.ts`의 쿠키 넣기 로그인, `trace: 'off'`). 시험 계정(승인됨)으로 `/stats` → 가짜 비트 파일 넣기 → 저장. `page.on('request')`로 모든 요청의 주소·본문과 인증 밖 머리(`authorization`·`apikey`·`cookie` 값은 모으지 않는다, C11)를 모아 가짜 파일의 차트번호·이름 칸 값·전화·주민번호 모양·파일 이름이 없는지(걸리면 `{ kind, where }`만 — 값을 출력하지 않는다), 그 뒤 시험 계정으로 세 표를 다시 읽어 같은 값이 없는지 본다(cross-branch C7). 시험 계정 병원의 통계 줄만 쓴다
- TDD: exempt — 시험만 더한다(대상 코드는 TASK-14·15에서 단위 시험을 통과). 일부러 틀린 기대값으로 실패를 한 번 본다(auth-live TASK-7~9와 같은 방식)

## 데이터 흐름
```
[비트 PC] 화면 [비트에서 불러오기]
   → useBridge.stream('stats.rows', {from, to})            (통로는 조각을 풀지 않고 Worker 포트로)
   → 도우미: HospitalGate.Open → StatsSql 읽기(읽기 전용) → JSON → Chunker → chunk…end
   → Worker: 모으기·sha256 → 검사 → ConsumptionRow·PatientDay(메모리 번호) → aggregate → buildSummary → 저장 모양
      └ 메모리: 진료 줄 {p,d,c,f} · 기간·날짜 합계 · 처방 이름        (split 일이 쓴다)
   → 화면 ← {저장 모양, 확인 건수, 보고 숫자 네 벌}               (차트번호·진료 줄 없음)
   → saveStats(source 'bit', 덮은 기간) → Supabase stats_months·stats_days·stats_coverage (RLS, 숫자만)
   → 화면 = 표에서 다시 읽은 저장 모양으로 그림(저장 실패 때만 방금 만든 숫자) + 처방별 신환·재진(Worker split) + 보고 문장(formatClinicReport, 화면에서)
[파일]   끌어다 놓기 → runAnalysis(지금 그대로) → toMonthPayload·toDayPayloads + 덮은 기간 → saveStats(source 'file', 덜 덮인 달 줄은 보내지 않는다) → 다시 읽어 같은 그림 + 파일 안내 문장
[휴대폰·다른 PC] /stats·/dashboard → readDays·readCoverage → 같은 그림 (처방별 신환·재진·보고 문장은 "비트 PC에서 불러오면 보여요")
```
- 서버로 가는 것: 달·일 저장 모양(합계·처방코드·처방 이름·처방별 환자·신환·재진 수, 재방문 수), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐. 차트번호·진료 줄·금액·보고 글·파일 이름은 가지 않는다
- 기간: 일 기간 = 어제까지 N일(대시보드와 같다), 12개월 = 이번 달 포함 12달. 비교 = 바로 앞 같은 일수 / 작년 같은 12달. 불러올 범위 = 비교 기간 첫날이 든 달 1일 ~ 오늘(달 경계에서 시작해 이미 완전한 달이 덜 덮인 달로 바뀌지 않게, 트리거도 한 번 더 막는다)

## 결정과 트레이드오프
- **도우미는 원본 SQL로 읽는다(화면 표 47이 아니라)**: 청구 2단계의 `VendorGridExport`를 기다리지 않고 main의 1단계 부품만 쓴다. 원본 통계 기능도 SQL이었다. 대가: 신환 기준이 파일과 다를 수 있다 — 도우미는 '비트에 남은 그 환자의 첫 유효 내원일'(원본 일일보고와 같은 기준), 파일은 '초재진구분' 칸. 환자·날마다 접수 한 건이고 처방 없는 접수가 없는 같은 가짜 자료로는 두 길이 같음을 시험한다(AC-505.3). 실제 숫자 차이는 의원 PC 시험에서 지난달을 비교해 본다. 화면 출처 줄(AC-514.7)로 어느 길 숫자인지 보인다
- **진료 줄 SQL은 원본에서 처방 코드 거르기만 뺐다**: 원본은 고른 코드(최대 100개)만 읽었지만, 통계는 모든 처방이 필요하다. 다른 줄은 원본 그대로이고 시험이 그 한 덩어리만 다른지 본다
- **`@daily`를 Char(1)로**: 관문(`ReadOnlyGuard`)·`SqlBitDb`는 글자 매개변수만 안다. SQL Server는 `@daily=1`에서 '1'을 숫자로 바꿔 비교한다. 의원 PC 시험에서 일일·월말 숫자를 원본과 견준다
- **화면은 저장 모양만 그린다**: PC·휴대폰·대시보드 숫자가 같다. 대가: 주 단위·임의 기간의 '서로 다른 환자 수'는 저장 모양으로 못 만든다 → 처방 추세는 '건'(그날 그 처방 환자 수의 합), 처방별 신환·재진(명)은 비트 PC에서 불러온 직후만
- **처방 추세는 건수만**: 저장 모양에 금액·소모량이 없고, 사용자가 정한 통계 내용에도 없다. 원본 금액 사실 SQL(`VisitFactsSql`)은 고른 코드 목록이 필요해 `stats.rows {from, to}`로는 못 돈다. 금액은 매출 탭에서(사용자에게 물을 것 2)
- **첫 재방문까지 날수는 원본 칸 그대로**: 7일 안·8~14일·15~30일·30일 넘어 다시 옴(원본 `ReturnAfter30Days`) + 아직 다시 안 옴(원본 `SingleVisitNewPatients`). '30일 넘어 다시 옴'(`after30`)은 불러온 자료 끝날까지 본 수라 다시 불러오면 늘 수 있다(원본 `ThroughAsOf`와 같은 뜻) — 화면에 그렇다고 적는다
- **덮은 기간을 따로 저장한다(`stats_coverage`)**: `toDayPayloads`는 진료가 있는 날만 만든다. 그래서 줄이 없는 날이 휴진인지 아직 안 불러온 날인지 저장 모양만으로는 모른다. 불러올 때마다 덮은 기간 한 줄을 넣고, 읽을 때 합친다: 덮은 기간 안의 줄 없는 날 = 휴진 = 0, 밖 = 미덮임(일부 기간). 넣기만 하는 표라 길게 쌓여도 작다
- **보고 숫자는 저장하지 않는다**: 금액은 서버에 두지 않고(통계 표는 숫자만이지만 매출 표는 매출 명세가 정한다), 휴대폰 복사는 범위 밖(사용자에게 물을 것 1)
- **`schemaVersion`은 2 그대로**: 저장 표가 이 명세에서 처음 생긴다. 옛 v2 줄이 없으니 버전 올림과 옛 줄 읽기가 필요 없다. 접수 기준 변경(2026-11-01)도 실제 DB에 저장한 줄이 아직 없고 열쇠가 그대로이며 `totals`의 뜻만 바뀐다
- **환자 수는 새 문장 하나로 읽는다, `days`가 아니라(2026-11-01 사용자 결정)**: 매출 `revenue.days`의 `visits`처럼 접수 건수로 센다. `days`는 날짜별 합계뿐이라 재방문(환자별 줄이 필요)을 셀 수 없고, 신환·재진을 `days`에서 따로 읽으면 몇 초 간격의 두 문장이 서로 어긋날 수 있다. 문장 하나는 자기와 어긋날 수 없다. 그래서 환자·날마다 접수 건수와 첫 내원일을 함께 주는 `PatientDaysSql` 하나로 읽는다. 진료 줄과 접수 줄이 몇 초 사이에 어긋나는 경우는 `E-STATS-CHANGED`로 멈춘다(위험)
- **주·달 `totals`는 일 칸의 합, 두 길 모두(2026-11-01 사용자 결정)**: "한달내 같은사람이 5명 오면 5번온걸로 카운트". stats-core AC-006.1의 `totals` 몫을 AC-501.6이 대신한다. 처방 추세·처방별 숫자는 `rx[]`·`RxVisitSplit`·`buildTrend` 그대로라, 건수의 단위가 `totals`와 달라도 그대로 둔다
- **파일 길은 남기고 안내를 붙인다(2026-11-01 사용자 결정 "남기고 안내 붙이기")**: 파일은 처방 한 줄씩이고 내원 번호가 없어 처방 없는 접수와 같은 날 두 번째 접수를 볼 수 없다. 그래서 일 칸은 지금 그대로 두고, 읽은 줄에 파일 줄이 있으면 화면에 안내 문장을 보인다(AC-514.7). `latest.source`로는 섞인 기간을 알 수 없어 `readDays`가 `fromFile`을 준다(AC-507.2)
- **가장 최근 불러오기가 덮어쓴다, 화면은 달 줄을 읽지 않는다(2026-11-01 사용자 결정 "새로 다시 덮어써 오전에한번 오후에 한번할수있으니깨")**: 오전과 오후에 한 번씩 불러올 수 있으므로 출처와 상관없이 가장 최근 불러오기가 그 불러오기가 덮은 날을 바꾼다. 그래서 오후 파일이 오전 비트 숫자를 낮출 수 있고, 위 안내가 그것을 알린다. 트리거는 커밋한 그대로다(완전 → 덜만 막는다). 일 줄은 보낸 날만 바뀌어 안전하다. 달 줄은 한 번 불러온 것만 담아서, 달의 일부만 덮는 파일이면 앞선 숫자를 잃고 나눠 넣은 파일이 합쳐지지 않는다. 그런데 주·달 `totals`는 정의상 일 칸의 합이고(AC-501.6) 12개월 보기는 이미 두 기간의 일 줄을 모두 읽는다(AC-511.5·AC-511.6). 그래서 통계 화면의 달 칸을 일 줄의 합으로 만들면(AC-511.2·AC-511.3) 달 줄이 필요 없고, 나눠 넣은 파일도 합쳐진 덮은 기간으로 맞게 더해진다. 파일의 덜 덮인 달 줄은 저장하지 않는다(AC-507.1): 그 줄에는 그 파일 하나가 든 숫자만 있고, 달 줄을 읽는 곳은 `feat-ai-report`뿐이다
- **달 줄 크기 한도는 1MiB(1,048,576바이트), 날 줄은 65,536바이트 그대로(2026-11-01 사용자 결정: 의원 PC에서 재 보기 전에 지금 올린다)**: 달 줄에는 그달 나온 처방이 모두 `followup`과 함께 들고 동네도 든다. 표가 재는 글자(`jsonb::text`)로 처방 한 줄은 코드 5자·이름 25자·종류 3자라고 치면 약 216바이트이고, 검사(`validate.ts`)가 받는 가장 긴 줄(코드·이름·종류 100자)은 약 841바이트(영문 코드)~1,041바이트(한글 코드)다(가짜 값으로 잰 수다. 실제 의원 자료는 재지 않았다). 옛 한도 65,536바이트로는 보통 줄 약 300개, 가장 긴 줄 약 62~77개까지라 처방 코드가 400개를 넘는 달에 막힐 수 있었다. 달 줄 하나만 걸려도 그 불러오기 전체가 저장되지 않으므로(`saveStats`가 보내기 전에 크기를 본다) 여유를 크게 둔다. 1MiB면 보통 줄 약 4,850개(검사의 처방 상한 `MAX_RX` 5,000개에 거의 닿는다), 가장 긴 줄로도 약 1,000~1,250개다. 한도를 없애지 않는 까닭: 로그인한 사용자가 브라우저에서 표에 바로 넣을 수 있으므로 DB가 줄 크기를 막아야 한다(코드보다 DB 제약, plan.md §0). 검사 상한을 모두 채운 값(약 6MB)까지 받을 까닭은 없다. 정상 사용 기준으로 병원마다 달 줄은 1년에 12개라 모두 한도까지 차도 1년에 12MiB다. 날 줄은 `followup`·동네가 없고 그날 나온 처방만 들어 보통 줄 약 179바이트로 약 360개까지 되므로 그대로 둔다. `saveStats`의 보내기 전 크기 검사도 표마다 같은 수를 쓴다. 실제 Supabase가 한 요청에 받는 크기는 확인하지 않았다. 800일 불러오기면 달 줄 27~28개라 처방 400개인 달만 있어도 달 줄 요청이 약 2.2MB이고, 의원 PC 시험 '800일 불러오기'에서 저장되는지 함께 본다
- **처방별 표 머리 글은 접수 기준이다(2026-11-01 메인 세션 판단. 사용자 말 "하루환자수는 매출 업무일지걸로 통일"에 맞춘다)**: 화면의 기간은 언제나 불러온 범위보다 좁아, 서로 다른 환자 수를 메모리로 만들면 처방 없는 재진 환자가 빠지고 한계도 없다(접수 줄은 메모리에 두지 않는다, AC-505.5). 표시 이름만 바꿔서는 신환(처방 없는 환자 포함)과 재진(제외)이 어긋난다. 날짜별 합계면 정확하다. 도우미 문장 사이에 접수가 바뀌면 기간 요약과 1쯤 다를 수 있다('days'와 'patientDays'는 대조하지 않는다). 처방 줄은 원본대로 서로 다른 환자 수다
- **미완성 불러오기에도 처방별 표의 숫자를 보인다(2026-11-01 사용자 선택 "숫자 보여 주기")**: 승인 시안 그대로다(`docs/mockups/stats/notes.md` 확인 필요 카드). 원본은 이때 신환·재진을 확정할 수 없다며 거절하고(`RxVisitSplit.cs`) 이 숫자는 저장되지 않는다(AC-514.6). 사용자가 그 둘을 듣고 골랐다. 이때 머리 글에는 차트번호 없는 접수·중복 접수도 환자와 재진에 들고, 첫 내원을 못 찾은 환자는 재진에 든다(`VisitDaysSql`이 그 접수를 모두 센다)
- **기간 요약 비교는 짝이 모두 끝난 칸끼리만(2026-11-01 메인 세션 판단. AC-511.6의 '끝난 칸끼리만 견준다'를 따른다)**: 비교 쪽 칸만 덜 끝났을 때 이번 쪽 칸을 그대로 두면 숫자가 같아도 가짜 ▲가 나온다(작년 앞쪽 달이 덮이지 않은 12개월: 209 대 100, +109%). 이번 쪽을 좁히면 증감이 평균 칸 값과 달라지므로, 뺀 칸이 있을 때만 아래 글이 무엇을 견주었는지 말한다. 이 글은 시안에 없고 사용자가 시안에서 승인하지 않았다. Phase 4 화면 캡처로 보여 드린다
- **보고 안내 첫 줄과 '0원'(2026-11-01 메인 세션 판단)**: 원 미만을 버리면서 '반올림합니다'라고 쓰면 거짓 안내라 글을 맞춘다. '-0원'은 뜻이 없고 복사되어 나가므로 '0원'으로 찍는다
- **처방코드가 비었거나 40자를 넘는 진료 줄은 도우미가 읽으면서 건너뛴다(2026-11-01 메인 세션 판단)**: 원본은 고른 코드만 읽어 이런 줄이 오지 않고, 읽은 코드의 형식이 틀리면 건너뛴다(`RxVisitSplit.cs`). 코드 거르기를 뺀 이 앱에서는 이런 줄 하나가 Worker 검사에 걸려 불러오기 전체가 `E-BRIDGE-BAD-REPLY`로 끝나고 도우미를 업데이트하라는 잘못된 해결법을 말한다. 접수 줄·날짜별 합계·기간 합계는 처방 표를 잇지 않는 따로인 문장이고 진료 줄의 환자·날은 늘 접수 줄에 있어, 일·주·달의 내원·신환·재진과 재방문 숫자는 바뀌지 않고 그 처방 줄만 빠진다. 예외 하나: 첫 내원일의 처방이 건너뛴 줄뿐이고 같은 주·달에 다른 코드로 다시 오면 그 칸 `rx[]`의 그 처방은 신환이 아니라 재진으로 든다(처방 없이 첫 내원한 환자와 같다). SQL과 답 모양은 그대로이고 Worker 검사도 그대로다. 화면에 알리지 않는다(원본의 "코드 형식이 달라 빠진 처방 N건" 줄은 지금 넣지 않는다). 실제 자료에 이런 줄이 있는지 모른다. 의원 PC에서 아래 읽기 전용 문장으로 센다(숫자 하나만 나온다). 이 저장소에는 이 문장을 돌릴 길이 없다: 도우미는 목록 밖 SQL을 거부하고 접속 글자는 메모리에만 둔다. 비트 DB에 SQL을 돌릴 길이 있는 사람이나 창이 돌리고, 도우미에서 접속 글자를 꺼내는 길은 만들지 않는다. 길이 없으면 '못 셈'으로 적는다. 0이 아니면 '빠진 처방 N건' 줄을 넣을지 사용자에게 묻는다. 0인지 아닌지만 믿는다: 줄 수라 도우미가 건너뛰는 수(DISTINCT 뒤)보다 많을 수 있고, 탭·전각 공백만 든 코드는 세지 못한다. 병원 거르기는 뺐다
  ```sql
  DECLARE @from char(12)='202610010000', @to char(12)='202611010000'; -- 10월을 불러왔을 때. @to는 마지막 날의 다음 날 0시(StatsRows.cs와 같다)
  SELECT COUNT_BIG(*) FROM dbo.OcmInf c JOIN dbo.OdrInf o ON o.OdrOcmNum=c.OcmNum
  WHERE c.OcmAcpDtm>=@from AND c.OcmAcpDtm<@to AND c.OcmPatTyp='O'
    AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'
    AND NULLIF(RTRIM(c.OcmChtNum),'') IS NOT NULL
    AND o.OdrDelFlg='N' AND o.OdrCanYon='N' AND o.OdrOutCod<>'99'
    AND (NULLIF(RTRIM(o.OdrCod),'') IS NULL OR LEN(RTRIM(o.OdrCod))>40)
  ```
- **완전한 줄은 덜 덮인 줄로 안 바뀐다(트리거)**: 짧은 파일을 넣어도 이미 완전한 달이 망가지지 않는다(코드보다 DB 제약, plan.md §0)
- **`hospital_id`는 DB 기본값**: 브라우저가 병원 id를 보낼 길이 없다(권한 열에서 뺌). RLS가 한 번 더 막는다
- **도우미 자료는 동네를 비운다**: 원본 SQL은 주소를 읽지 않는다. 동네 보기는 범위 밖
- **"오늘 진료 끝"은 사람이 켠다**: 진료 끝 시각이 요일마다 달라 시각으로 정하지 않는다(사용자에게 물을 것 3). 켜지 않으면 오늘 숫자는 '덜 끝남'이라 대시보드 '지난주 같은 요일보다'가 기다린다
- **복사 단추·조각 모으기는 통계 폴더에 따로**: `components/stats/sections/CopyButton.tsx`, `workers/stats/assemble.ts`. 청구(`components/common/CopyButton.tsx`·`workers/precheck/assemble.ts`)와 이름이 겹치지 않고, 서로 불러 쓰리라 기대하지 않는다(C4·C6)
- **도우미 SQL은 `StatsSql` 하나**: 보고 금액 SQL(`OperationalReportSql`)도 통계가 자기 사본으로 둔다. 매출 브랜치(`RevenueSql`)와 같은 원본을 옮기더라도 서로 기대지 않는다(C4)
- **오류 번호는 `E-STATS-*`**: plan.md §8의 `E-SAVE-FAILED` 대신 `E-STATS-SAVE-FAILED`(다른 브랜치와 같은 번호를 더하지 않게, C3)
- **최근 30일의 30일 줄은 끝난 신환으로 센다(S6, 2026-11-01 사용자 결정)**: 최근 30일의 날은 모두 온 지 30일이 안 되어 30일 줄과 첫 재방문 칸이 늘 '집계 중'이었다. `'30d'`만 온 뒤 30일이 지난 가장 최근 신환(오늘 − 60 ~ 오늘 − 31, `previous`와 같은 범위라 읽기는 그대로)을 세고 그 날짜를 적는다. 대가: 7·14일 줄과 세는 날짜가 다르다
- **12개월 처방 증감은 끝난 달끼리(S7, 2026-11-01 사용자 결정)**: 덜 끝난 이번 달과 작년 같은 달 한 달을 견주면 가짜 ▼가 나온다. 어느 한쪽이라도 `partial`인 달은 양쪽에서 뺀다(AC-511.2와 같은 규칙). 건수·신환·재진에는 그 달을 넣고 '일부 기간'을 붙이며, 막대·비교 눈금은 `comparable`로 그려 증감과 기준을 맞춘다
- **일 기간 처방 증감은 날 짝으로 뺀다**: 기간 전체가 덮였을 때만 견주면 불러온 다음 날부터 모든 줄이 "비교할 수 없음"이 된다('오늘 진료 끝'을 켜지 않으면 덮은 기간은 불러온 날 전날에 끝나고 기간은 어제까지다). 그래서 S7과 같은 규칙으로 `partial`인 날과 그 짝만 양쪽에서 뺀다. 대가: 짝을 뺀 날이 있으면 줄의 건수 글자는 기간 합인데 막대·증감은 그보다 적은 날로 세고, 일 기간에는 그 표시가 없다. 남은 짝이 아주 적으면 요일이 어긋난 날끼리 견주어 증감이 크게 나올 수 있다(드물다, 최소 짝 수는 두지 않았다)
- **음수 금액은 원본처럼 보인다(2026-11-01 사용자 결정)**: 원본 `_amount`는 음수를 받고(절댓값 10^14까지) `_won`은 "-1,000원"으로 찍는다. 검사가 보고 숫자를 0 이상만 받으면 금액 한 칸 때문에 불러오기 전체가 `E-BRIDGE-BAD-REPLY`로 실패한다. 그래서 건수만 0 이상이고 금액 6칸은 음수를 받으며, 원 미만은 0 쪽으로 버린다(`Math.Truncate`, `Math.Floor`는 -0.5를 -1로 만든다). 대가: 보고 글에 음수 금액이 그대로 보인다

## 다른 작업과 겹치는 파일
> 같은 main(95cfa53)에서 갈라진 브랜치: `feat-precheck`(청구), `feat-ai-report`, `feat-worklog`, `feat-patients`, `feat-revenue`. 모두 더하기만 하고 아래가 합치는 자리다(cross-branch C8)

| 파일 | 통계가 하는 일 | 같이 고치는 브랜치 |
|---|---|---|
| `supabase/migrations/20261101000200_stats.sql` + `public.my_hospital_id()` | 새 파일. 함수는 C1 글자 그대로(`create or replace`) | 함수: worklog·patients·revenue·precheck(그쪽이 나중에 `create or replace`로) |
| `src/types/errors.ts`·`src/lib/errors.ts`·`src/lib/errors.test.ts` | 끝에 `E-STATS-HISTORY`·`E-STATS-TOO-BIG`·`E-STATS-CHANGED`(TASK-5), `E-STATS-SAVE-FAILED`·`E-STATS-READ-FAILED`(TASK-7) | 전부(번호는 브랜치마다 앞말이 달라 겹치지 않는다, C3) |
| `eslint.config.mjs`·`src/guardrails.test.ts` | `src/lib/storage/stats.ts` 블록 하나 (TASK-7). 합칠 자리: 다른 브랜치가 `src/lib/storage/**` 넓은 블록을 더하면 이 파일도 그 규칙을 받는다 — 합칠 때 두 블록이 서로 막지 않는지 본다 | precheck·patients·worklog(각자 블록. revenue는 고치지 않음) |
| `src/types/db.ts` | 통계 표 줄 모양 셋을 끝에 더함 (TASK-6) | precheck(청구 설정·건수 표), 표를 만드는 다른 브랜치 |
| `src/app/titles.test.tsx` | `/stats` 탭 이름 시험이 준비 중 자료를 가정할 때만 (TASK-15) | 탭을 채우는 브랜치 모두 |
| `docs/ARCHITECTURE.md` | 'DB 표'의 통계 줄·'데이터 흐름' 통계 줄 (TASK-6) | 전부 |
| `docs/UI_GUIDE.md`·`docs/ADR.md` | 고치지 않는다 | — |
| `src/components/common/notReadyFeatures.ts`(+시험)·`src/components/shell/menu.ts`·`shell.test.tsx`·`src/components/dashboard/briefing/features.ts`(+시험)·`DashboardHome.test.tsx`·`src/app/(app)/dashboard/page.test.tsx`(목차 옆 글)·`src/app/(app)/notReadyPages.test.tsx`·`tabFrame.test.tsx` | 통계 줄만 (TASK-15). 개수는 목록에서 센다(C5) | worklog·patients·revenue(각자 자기 탭 줄) |
| `src/components/ui/classes.test.ts` | `APP_DIRS`에 `src/components/stats` 한 줄 (TASK-13) | 화면을 만드는 브랜치 모두 |
| `helper/src/Precheck.Core/Bit/Sql.cs` | `IsAllowed`·`ParametersOf`가 `StatsSql`도 보는 두 줄 (TASK-3) | precheck(청구 SQL), revenue(`RevenueSql`), patients(자기 SQL) |
| `helper/src/Precheck.Helper/Program.cs` | `StatsCommands.Register(dispatcher, HelperServices.Create());` 한 줄 (TASK-3) | precheck·revenue·patients |
| `src/lib/bridge/commands.json` | 고치지 않는다(`stats.rows`가 이미 있다) | revenue·patients가 명령을 더할 수 있음 |
| stats-core·tab-frame 파일(이미 main) | `lib/analytics/aggregate.ts`·`compare.ts`·`types/analysis.ts`(TASK-1), `lib/payload/*`·`types/payload.ts`(TASK-2, 검사는 선택 칸만 더해 남의 가짜 자료가 그대로 통과), `components/dashboard/summary/*`·`dashboard/page.tsx`(TASK-16. `revisitView` 30일 줄은 더하기만이고 feat-revenue·feat-patients·feat-worklog·feat-precheck·feat-ai-report에 이 폴더를 고치는 계획·변경이 없어 C4·C5·C6·C8 그대로) | ai-report(저장 모양 가짜 자료를 씀) |
| `src/components/charts/StackedBarChart.tsx`·`StackedBarChart.test.tsx` | `BarBucket`의 선택 값 `comparison` 하나와 그 시험 (TASK-13). 주지 않으면 지금 그대로 | 없음(위 다섯 브랜치에 이 부품을 고치는 계획·변경이 없고, revenue는 Tests에 charts 시험을 적었을 뿐이다. 더하기만이고 남의 가짜 자료가 바뀌지 않아 C4·C5·C6·C8 그대로) |
| `phases/index.json` | 통계 Phase 넷을 끝에 더함 | 전부 |
- `feat-ai-report`가 알아야 할 것: 통계 달 숫자 표 이름은 `stats_months`(plan.md의 `months`가 아님)·일 숫자는 `stats_days`다. ai-report design.md의 'DB months' 읽기는 `stats_months`를 읽어야 한다. `revisit`의 `within30`·`after30`은 선택 칸이다. `feat-ai-report`의 외래도 접수 기준으로 한다(2026-11-01 사용자 결정 "접수 기준으로 통일"). 그 갈래의 문구 네 곳은 그 갈래에서 고친다. 이 명세는 바뀌지 않는다. 파일로만 채운 달은 달 전체가 든 파일이 아니면 줄이 없다.
- 고치지 않음: `src/workers/precheck/*`, `helper/src/Precheck.Helper/Commands/*`, `helper/src/Precheck.Windows/*`, `src/types/precheck.ts`, `src/lib/bridge/*`, `src/types/report.ts`·`src/lib/report/*`(ai-report 몫)

## 사전점검 명세가 할 일 (이 명세는 고치지 않는다)
- `specs/precheck/requirements.md`에서 REQ-027~031을 빼고 "통계 명세(`specs/stats`)로 옮김"이라 적는다. `tasks.md`의 TASK-27~31, `design.md` 2절 표의 통계 줄(처방 추세·30일 재방문·처방별 신환·재진·일일·월말 보고)·4-3절 `stats.rows` 설명·6-2절 `stats` 일·15절 '통계 금액·소모량'·16·17절 통계 화면 줄도 같다
- `phases/precheck-6-stats/`를 지우고 `phases/index.json`에서 그 줄을 뺀다. Phase 7(백업)은 번호를 그대로 둘지 그 명세가 정한다
- `design.md` 8-1의 `my_hospital_id()`를 C1 글자(`create or replace`)로 바꾼다
- 명령 표의 `stats.rows`(`maxDays` 800)는 그대로 쓴다. 도우미 `Commands/RequireHospital.cs` 주석의 `stats.rows`도 맞다

## 사용자에게 물을 것 (아직 답 없음 — Claude 판단 (기본값)으로 계획했다)
1. **Claude 판단 (기본값)** — 처방별 신환·재진 표와 원장님 보고 문장은 비트 PC에서 불러온 뒤에만 보인다. 휴대폰에서는 "비트 PC에서 불러오면 보여요"이고, 금액과 진료 줄은 서버에 저장하지 않는다 *(개인정보·돈·화면)*
2. **Claude 판단 (기본값)** — 처방 추세는 건수만. 처방별 금액·소모량은 매출 탭에서 본다 *(돈·화면)*
3. **Claude 판단 (기본값)** — 오늘 숫자를 '끝난 날'로 정하는 법: [비트에서 불러오기] 옆 "오늘 진료 끝" 체크를 켜고 불러오면 오늘 숫자를 확정한다. 켜지 않으면 오늘은 '진행 중'이라 대시보드 '지난주 같은 요일보다'가 비어 있다 *(화면)*
4. **Claude 판단 (기본값)** — 보고 문장 고르기: 일일보고 오늘·어제, 월말보고 이번 달(지금까지)·지난달 *(돈·화면)*
5. **Claude 판단 (기본값)** — 기간 단추: 최근 7일·30일(처음)·90일·12개월 *(화면)*

## 위험 / 미해결 질문
- **건너뛴 처방 줄은 화면에 보이지 않는다(알려진 한계)**: 처방코드가 비었거나 40자를 넘는 진료 줄은 건너뛰고 알리지 않는다. 그런 줄이 있으면 첫 내원일의 처방이 그 줄뿐인 환자가 같은 주·달에 다른 코드로 다시 올 때 그 칸 `rx[]`의 그 처방에서 신환 대신 재진으로 든다. 일·주·달의 내원·신환·재진과 재방문 합계는 바뀌지 않는다. 실제 자료에 이런 줄이 있는지는 의원 PC 확인 문장으로만 알 수 있고, 돌릴 길이 없으면 모른 채로 남는다
- **실제 비트 DB에서의 SQL**: 리눅스에서는 가짜 `IBitDb`로만 시험한다. 진료 줄 SQL(원본에서 한 덩어리 뺌)과 `@daily` Char(1)은 의원 PC 시험에서 확인한다: 지난달 숫자를 양지바른 결과·비트 통계와 비교, 800일 읽기 시간 재기
- **접수 줄 SQL은 의원 PC에서 확인한다(2026-11-01)**: `PatientDaysSql`은 원본에 없는 문장이라 리눅스에서는 가짜 `IBitDb`와 일회용 sqlite로만 돌린다. 의원 PC 시험에서 본다: ① 둘 다 숫자를 보이는 날의 내원·신환·재진이 매출 탭·업무일지와 같다 ② 취소된 접수가 있는 날을 비트와 비교한다(원본 시험 `tests/test_rx_visit_split_sql.py:84`는 상태 `CN`을 취소로 다루지만 코드의 뜻을 정한 문서는 없으므로 뜻을 단정하지 않고 숫자로 비교한다) ③ 첫 접수가 취소된 환자의 첫 내원일이 처음 취소되지 않은 접수 날이다
- **통계와 매출·업무일지가 숫자를 비우는 범위가 다르다**: 둘 다 숫자를 보이는 날이면 같다. 차트번호 없는 접수·중복 내원·첫 내원 못 찾은 환자가 불러오는 기간 어디에든 있으면 통계는 그 불러오기를 통째로 저장하지 않고, 매출·업무일지는 그날만 비운다
- **불러오는 도중의 접수·취소**: 접수 줄 문장은 진료 줄 다음에 돌아, 불러오는 중에 생긴 새 접수는 진료 줄이 접수 줄 없이 남지 않는다. 그 몇 초 사이에 취소가 있으면 `rows`의 환자·날이 `patientDays`에 없거나 첫 내원일이 달라 `E-STATS-CHANGED`("불러오는 사이에 접수가 바뀌었어요 · 다시 시도해 주세요 · 계속되면 오류 번호와 함께 문의해 주세요")로 멈춘다. `E-BRIDGE-BAD-REPLY`의 문구는 도우미를 업데이트하라는 말이라 이 경우에 맞지 않는다. 다시 불러오면 된다. `days`와 `patientDays`는 일부러 대조하지 않는다
- **줄 수·크기**: 800일 모든 처방 줄이 700,000줄을 넘을 수 있다. 넘으면 `E-STATS-TOO-BIG`("기간을 줄여 다시")이고, 12개월 보기는 그때 불러올 범위를 줄인다(그 결정은 의원 PC 시험 뒤). 접수 줄도 700,000줄까지이고 문장이 하나 늘어 읽기 시간과 답 크기가 는다. 800일 읽기 시간 재기에 함께 든다
- **12개월 일 숫자 읽기**: 12개월 보기는 고른 기간과 비교 기간의 일 숫자를 모두 읽는다(최대 약 730줄, 처방 목록 때문에 줄마다 수 KB, 합 수 MB). 달 칸·요일별·처방 목록이 모두 일 숫자를 쓰므로 요일별만 줄여서는 읽는 양이 줄지 않는다. 휴대폰에서 느리면 그때 다시 정한다
- **실제 Supabase 표**: TASK-6 SQL을 사용자가 붙이기 전에는 저장·읽기가 실패한다(화면은 오류 카드). 붙일 때 허락을 받는다
- **대시보드 첫 그림**: 대시보드가 브라우저에서 읽으므로 읽는 동안 잠깐 연결 전 모양이 보일 수 있다. TASK-16에서 읽는 동안은 분석 자리에 "불러오는 중"을 둔다
- **덮은 기간이 낡을 수 있음**: 비트에서 진료 기록이 지워진 날은 그 뒤 다시 불러와도 옛 일 숫자 줄이 남는다(지우기 없음). 드물다고 보고 의원 PC 시험에서 본다
- **신환 기준 차이**: 위 '결정'. 파일과 도우미를 번갈아 쓰면 같은 날 숫자가 조금 바뀔 수 있다(가장 최근 저장이 이긴다, 완전한 줄끼리)
- 오전에 '오늘 진료 끝'을 켜고 불러온 뒤 오후에 끄고 불러오면 오늘 일 줄은 트리거가 지켜 오전 숫자로 남는다. 같은 날 진료 끝을 켜고 다시 불러오거나 다음 날 불러오면 풀린다.
- 파일로만 채운 달은 그 달 전체가 든 파일을 한 번에 넣거나 비트로 불러올 때까지 달 줄이 없을 수 있다. 통계 화면은 일 숫자를 더하므로 맞고, 달 줄을 읽는 곳은 `feat-ai-report`뿐이다.
- 한 번에 넣은 파일 사이가 끊기면 앞 구간은 덮은 기간에 남지 않아 그 달은 '일부 기간'으로 남는다. 그 달 전체를 넣거나 비트로 다시 불러오면 맞는다.
- **파일 줄 숫자는 비트보다 적을 수 있다**: 처방 없는 접수와 같은 날 두 번째 접수가 빠진다. 오전에 비트로 불러온 날을 오후에 파일로 넣으면 숫자가 내려갈 수 있다. 안내 문장(AC-514.7)으로 알린다. 처방 없는 접수만 있는 날은 파일 길에서 줄이 없어, 덮은 기간 안이면 휴진 0으로 읽힌다
- **대시보드에는 파일 안내가 없다**: 대시보드에는 출처 줄이 없어 안내 문장을 붙이지 않는다
- **원본 사본 접근**: 골든·SQL 사본을 만들 때 원본(`seoseungkwan/shared@2a1069b`)이 필요하다. 없으면 그 step은 `blocked`
