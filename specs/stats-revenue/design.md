# 설계: 매출을 통계에 섞기

## 개요
- 자료 길은 하나 더 생기고(날 단위 처방 금액), 화면은 하나 줄어든다(매출 탭이 통계 안 '매출' 칸이 된다)
  1. **도우미 0.6.0**: 새 명령 없이 `revenue.days` 답에 셋째 열쇠 `dayCodes`(날마다 처방별 건수·금액)를 더한다. 확장은 명령 이름만 보고 답 안은 보지 않으므로 확장 새 판이 필요 없다. 업무일지는 `days`만 쓴다
  2. **Supabase**: 새 표 `sales_day_codes` + `sales_days.day_codes` 칸 + 함수 둘(`save_revenue_range` 저장 · `sales_code_totals` 코드별 합). 옛 `sales_codes`(달 합계)는 읽기만 한다
  3. **불러오기**: [비트에서 불러오기]가 통계 조각을 모두 저장한 뒤, 같은 비트 연결로 그 불러올 기간의 **매출 빈 날**만 31일 덩어리로 읽어 저장한다
  4. **화면**: 기간 요약 둘째 줄(매출 네 칸) · '매출' 칸(탭 넷, 처방 칸과 같은 탭 부품) · 목차 열 개 · 원장님별 '건당 진료비'. 숫자는 통계 기간·비교·막대 칸 규칙으로 다시 센다
  5. **정리**: 위 메뉴 '매출' · `/revenue` 화면 · 매출 가져올 기간 · 매출 묶음 화면을 지우고 `/revenue`는 `/stats`로 넘긴다
- 매출 숫자의 뜻(총진료비 · 확인 필요한 날 · 나눔 · 건당 진료비 · 처방 금액)은 `lib/revenue/summary.ts`·`treatments.ts`의 함수를 그대로 쓴다. 바뀌는 것은 '어느 기간을 어떻게 묶어 보느냐'뿐이다

## 잰 것 (2026-11-14, 이 PC 비트 DB, ssk-bit-db-probe 읽기 전용 도구, 숫자만)
`CodeAmounts`와 같은 WHERE로 `LEFT(o.OdrDtm,8)`별 `COUNT(DISTINCT RTRIM(OdrCod))`만 셌다. 환자 칸·이름·차트번호는 읽지 않았다. 달마다 한 문장, 25달 13초(진료 중 토요일 10시, 가벼움)

| 잰 것 | 값 |
|---|---|
| 기간 | 2024-11-01 ~ 2026-11-14 (진료한 날 562일) |
| 하루 서로 다른 처방 코드 수 | **최대 136**(2025년 6월) · 달마다 평균 84~103 · 전체 평균 약 95 |
| 하루 처방 줄 수 최대 | 1,058줄 |
| 한 달 날×코드 줄 수(= 31일 답의 `dayCodes` 줄 수) | 최대 2,635 |
| 서로 다른 코드 수 | 최근 12개월 410 · 최근 24개월 516 |
| 가장 긴 코드 | 10자 |

- 그래서 31일 답의 `dayCodes`는 많아야 약 2,700줄 × 40바이트 ≈ 110KB다. 도우미 한 번 답 한도 1,000,000바이트(`Framing.MaxOutgoing`) 안에 넉넉하다
- 하루 한도 **300줄**(잰 최대의 2배 넘음) · 답 한도 **9,300줄**(31 × 300)로 둔다. tech.md의 600줄·15,000줄보다 낮춘 까닭: 코드가 30자 한글처럼 긴 최악에도 1MB 안에 들게 하려고. 넘친 날만 `_REST`로 접는다
- 서버 줄 수: 1년 약 29,000줄(달 2,400줄 × 12), 6년 약 17만 줄. 무료 500MB 안이다. `sales_code_totals` 답은 12개월이어도 410줄쯤이지만 1,000줄씩 끝까지 읽는다(Supabase 한 번 최대 1,000줄)

## 코드로 확인한 것
| # | 사실 | 결과 | 근거 |
|---|---|---|---|
| 1 | 답 열쇠는 웹이 정확히 본다 | `RESULT_KEYS = ['days','codes']` + `exactKeys` → 지금 운영 웹은 `dayCodes`가 든 답을 거부한다 | `lib/bridge/revenueResult.ts:19` |
| 2 | 확장은 답 안을 보지 않는다 | 명령 이름만 표로 막고 result는 그대로 넘긴다(hello만 손댐) | `extension/src/relay.ts:46`·`:51` |
| 3 | 화면 통로 `call`은 Worker를 붙인 연결에서도 쓸 수 있다 | `useBridge`가 `call`을 돌려주고 `connectScreenBridge`가 worker 유무와 상관없이 `bridge.call`을 낸다. 통계 훅은 지금 `call`을 꺼내지 않는다 | `components/claim/useBridge.ts:99`, `lib/bridge/workerSink.ts`, `components/stats/useStatsWorker.ts:47` |
| 4 | 읽기 관문은 `RevenueSql.Parameters`에 있는 문장을 허용한다 | 새 문장은 그 표에 넣기만 하면 관문을 지난다(`ReadOnlyGuard.cs`는 그대로) | `helper/src/Precheck.Core/Bit/Sql.cs:247` |
| 5 | 도우미 답은 `RevenueResult` 한 객체를 그대로 직렬화한다 | 셋째 속성 `dayCodes`를 더하면 된다 | `RevenueCommands.cs:29`, `RevenueDays.cs:142` |
| 6 | 옛 저장은 달 1일부터만 받는다 | `saveMonth`가 첫날이 1일이 아니면 실패 → 빈 날만 읽으려면 새 저장 길이 필요하다 | `lib/storage/revenue.ts:73` |
| 7 | 업무일지는 `days`만 쓴다 | `call('revenue.days', {from: 그날, to: 그날})` 뒤 날 줄만 읽는다 | `components/worklog/useBitFill.ts:88` |
| 8 | 매출 묶음 셈은 코드 글자를 그대로 견준다 | `firstGroup.get(row.code)` — 통계 묶음은 대소문자를 가리지 않으므로 맞춘다 | `lib/revenue/treatments.ts:55`, `components/stats/view.ts` `codeKey` |
| 9 | 처방 칸 탭 부품은 제목·탭 묶음 이름이 상수다 | `TITLE = '처방'`·`TABLIST_LABEL = '처방 보기'` → 매출 칸도 쓰게 넘김 값으로 바꾼다 | `sections/RxSection.tsx` |
| 10 | 목차 id는 `TOC_LINKS` 차례로 꺼낸다 | `const [SUMMARY_ID, TREND_ID, …] = TOC_LINKS.map(…)` → 링크를 더하는 일과 칸을 놓는 일은 한 작업이어야 한다 | `sections/StatsSections.tsx` |
| 11 | 매출 칸 부품은 `components/revenue`에 있고 보기 타입은 `view.ts`에 있다 | 숫자 칸 줄(`KpiRow`)·안내 줄(`NoticeLine`)·증감 글(`DeltaCell`)·순위 막대(`TreatmentBars`)·급여 표(`RevenueSplit` 안 `SplitTable`)·세 겹 막대(`StackBars`)·금액 글(`money.ts`). 시안이 이 부품을 그대로 떠 왔다 | `components/revenue/*`, 시안 `notes.md` 첫 줄 |
| 12 | `/revenue`를 아는 곳 | 메뉴·타입(`menu.ts:25·34·58`), 대시보드 목차(`features.ts:27`), 미리보기 탭(`preview/sample.ts:14`), 시험 `shell`·`tabFrame:69·172·211`·`titles:85·105`·`notFound:149`·`notReadyPages:102~104`·`features.test`·`DashboardPreview.test:88`·`sample.test:150`·`DashboardHome.test` | grep |
| 13 | 매출 묶음 저장 코드를 시험이 가짜로 바꾼다 | `TreatmentTrendSection.test.tsx`가 `lib/storage/rxGroups`를 `vi.mock`하고 'AC-1210.15'에서 부르지 않는지 본다 → 그 파일을 지우면 이 시험도 고친다 | `TreatmentTrendSection.test.tsx:12·33·758` |
| 14 | 원장님별 이름은 화면과 [표 복사] 두 곳 | `DoctorsSection.tsx:19·20`, `lib/analytics/doctorStats.ts:23`(복사 머리, 환자 자료 구역 파일이지만 글자만 바꾼다) | grep `1인당` |

## 시안·tech.md와 다르게 정한 것 (까닭)
1. **날별 합 = 기간 합 맞춤 검사를 하지 않는다**(tech.md 2절): 진료 중에는 두 문장 사이에 처방이 더해져 어긋날 수 있고, 그때마다 실패하면 오늘·어제 읽기가 자주 깨진다. 두 문장이 같은 WHERE·금액 식인지는 SQL 시험(AC-4101.2)이 글자로 지킨다
2. **하루 300줄·답 9,300줄**(tech.md 600·15,000): 위 '잰 것'
3. **옛 도우미 답도 그 범위 `sales_day_codes`를 지운다**: `day_codes = false`와 '날 단위 줄 없음'이 늘 같게(어긋난 반쪽 자료가 없게)
4. **매출 읽기 실패 번호는 `E-STATS-READ-FAILED`**: 같은 화면의 저장 숫자 읽기 실패와 같은 카드·같은 [다시 읽기]. `lib/errors.ts`를 바꾸지 않는다. 매출 묶음 오류 번호 둘(`E-REVENUE-GROUP-*`)은 쓰는 곳이 없어지지만 오류 표 시험이 지키므로 남긴다
5. **시안 글 `1인당 진료비`(원장님별·건당 진료비 설명)는 `건당 진료비`**: 결정 6(requirements 기본값 1)
6. **처방 칸 탭 부품(`RxSection`)을 매출 칸이 같이 쓴다**: 이름은 그대로 두고 `title`·`label`·`notice`를 넘김 값으로 연다(기본값은 지금 글자). 새 탭 부품을 만들면 키·포커스·portal 규칙이 둘이 된다

## 부품과 인터페이스

### 도우미 (`helper/src/Precheck.Core/Revenue`)
```csharp
// RevenueSql.cs — CodeAmounts와 WHERE·금액 식·MissingValues가 글자까지 같고, SELECT 첫 칸과 GROUP BY만 다르다. 이름(SeeMst) 하위 질의 없음
public const string CodeAmountsByDay = @"WITH Codes AS (
  SELECT LEFT(o.OdrDtm,8) AS Day, RTRIM(o.OdrCod) AS Code, COUNT_BIG(*) AS Lines, <Amount 식>, <MissingValues 식>
  FROM dbo.OdrInf o WHERE <CodeAmounts와 같음>
  GROUP BY LEFT(o.OdrDtm,8), RTRIM(o.OdrCod))
SELECT c.Day, c.Code, c.Lines, c.Amount, c.MissingValues FROM Codes c";
// Parameters 표에 [CodeAmountsByDay] = { From, To, Hospital }

// RevenueDays.cs
public const int MaxDayCodesPerDay = 300;           // MaxDays × 이것 = 9,300
public sealed class RevenueResult { … [JsonPropertyName("dayCodes")] public IReadOnlyList<object?[]> DayCodes { get; } }  // [날짜, 코드, 건수, 금액|null]
private static IReadOnlyList<object?[]> ReadDayCodes(IBitDb db, string scope, DateTime first, DateTime last)
```
- `Read`: 지금 차례(관문 → HistoryGuard → 날마다 → `CodeAmounts`) 뒤에 `CodeAmountsByDay`를 기간에 한 번 부른다
- 정리(지금 `TidyCodes`와 같은 규칙을 날마다): 날 글자 `yyyyMMdd` → `yyyy-MM-dd`(기간 밖이면 읽기 실패) · 코드 앞뒤 공백 빼고 합침 · 모양 틀림·`_REST` → 그날 `_REST` · 금액 큰 차례(null 맨 뒤) 299개 뒤 → 그날 `_REST` · 금액은 합친 decimal에서 원 미만 버림, MissingValues가 하나라도 0이 아니면 null · 건수는 Lines 합
- 차례: 날짜 오름차순, 같은 날은 코드 Ordinal 차례(`_REST`도 글자 차례 그대로). 시험이 JSON 글자로 본다
- 판: `Directory.Build.props` `0.6.0` + `versions.ts` `LATEST_HELPER = '0.6.0'` 같은 커밋. `MIN_HELPER`는 0.3.0 그대로(0.3.0 이상은 모두 `revenue.days`를 안다 → 옛 도우미는 치료별 매출만 못 본다)
- C# 시험은 `PATH="$HOME/.dotnet:$PATH"`로 돌린다(vitest 감싸개 `helper/tests/revenue-read.dotnet.test.ts`가 AC ID별로 본다)

### 웹 계약 (`src/types/revenue.ts`, `src/lib/bridge/revenueResult.ts`)
```ts
/** 날 단위 처방 한 줄(도우미 0.6.0부터): [날짜, 코드, 건수, 금액 또는 null] */
export type RevenueDayCodeRow = readonly [date: string, code: string, count: number, amount: number | null]
export type RevenueDaysResult = { days: RevenueDayRow[]; codes: RevenueCodeRow[]; dayCodes?: RevenueDayCodeRow[] } // 없음 = 옛 도우미
export const REVENUE_DAY_CODES_PER_DAY = 300
export const REVENUE_MAX_DAY_CODES = 9300 // REVENUE_MAX_DAYS × 300
// 저장된 것(읽기용)
export type SavedRevenueDay = RevenueDayRow & { dayCodes: boolean }
export type RevenueCodeTotal = { code: string; count: number; amount: number; missing: boolean }
export type RevenueMonthCode = RevenueCodeRow & { month: string } // 'YYYY-MM', 옛 sales_codes
```
- `isRevenueDays`: 열쇠 두 벌 가운데 하나와 정확히 같을 때만. `dayCodes` 검사(AC-4102.2)는 `days` 검사 뒤(날짜 목록을 쓴다)

### Supabase (`supabase/migrations/20261114000000_sales_day_codes.sql`)
- 머리 주석: 실행 방법(운영자가 SQL Editor에 붙여 한 번) · 먼저 `20261101000400_revenue.sql` · **웹을 올리기 전에 붙인다** · 두 번 붙여도 된다
- 두 번 실행해도 되게: `create table if not exists` · `add column if not exists` · `drop policy if exists` 뒤 `create policy` · `create or replace function`. 공용 함수(`my_hospital_id` 등)는 만들지 않고 부르기만 한다
```sql
create table if not exists public.sales_day_codes (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  code text not null check (code ~ '^[0-9A-Za-z가-힣_.-]{1,30}$'),
  count integer not null check (count between 0 and 10000000),
  amount bigint check (amount >= 0),
  fetched_at timestamptz not null default now(),
  primary key (hospital_id, day, code));
alter table public.sales_days add column if not exists day_codes boolean not null default false;
alter table public.sales_day_codes enable row level security;
revoke all on table public.sales_day_codes from anon, authenticated;
grant select, delete on table public.sales_day_codes to authenticated;
grant insert (day, code, count, amount) on table public.sales_day_codes to authenticated;
grant insert (day_codes), update (day_codes) on table public.sales_days to authenticated;
-- 정책 셋(읽기·넣기·지우기): hospital_id = (select public.my_hospital_id())
create or replace function public.save_revenue_range(p_from date, p_to date, p_days jsonb, p_day_codes jsonb)
  returns void language plpgsql security invoker set search_path = '' as $$ … $$;
create or replace function public.sales_code_totals(p_from date, p_to date)
  returns table (code text, count bigint, amount bigint, missing boolean) language sql stable security invoker set search_path = '' as $$
  select d.code, sum(d.count)::bigint, coalesce(sum(d.amount), 0)::bigint, bool_or(d.amount is null)
  from public.sales_day_codes d where d.hospital_id = (select public.my_hospital_id()) and d.day between p_from and p_to
  group by d.code order by d.code $$;
-- 두 함수: revoke all … from public, anon; grant execute … to authenticated
```
- `save_revenue_range` 차례: 범위 검사(null·시작 > 끝·31일 넘음) → `p_days` 배열·줄 수 = 날 수·모든 날이 범위 안 → `p_day_codes`가 null이 아니면 배열·9,300줄 이하·모든 날이 범위 안 → `sales_days` upsert(`jsonb_to_recordset`으로 열다섯 칸 + `day_codes = p_day_codes is not null`, `on conflict (hospital_id, day) do update`) → 그 범위 내 병원 `sales_day_codes` 지움 → `p_day_codes`를 `{day, code, count, amount}` 객체 목록으로 넣음. 하나라도 어기면 `raise exception`(한 트랜잭션이라 아무것도 안 바뀜). 같은 날 두 번은 upsert가, 같은 날 같은 코드 두 번은 기본 키가 막는다
- 시험(`supabase/salesDayCodes.rls.test.ts`): 지금 RLS 시험과 같은 방법(PGlite에 auth → revenue → 새 파일 차례로, Supabase 기본 권한 흉내). 같은 파일 두 번 실행 · anon 막힘 · 칸 권한 · A/B/대기/거절 · 저장 함수 성공과 거부 뒤 표 그대로 · 합계 함수 · 옛 표 그대로

### 저장소 (`src/lib/storage/revenue.ts`) — 함수를 더하고 옛 함수는 TASK-9에서 지운다
```ts
saveRange(range: DateRange, result: RevenueDaysResult): Promise<void>        // rpc save_revenue_range. 실패 E-REVENUE-SAVE-FAILED
loadDays(range: DateRange): Promise<SavedRevenueDay[]>                       // sales_days(15칸 + day_codes), 1,000줄씩
codeTotals(range: DateRange): Promise<RevenueCodeTotal[]>                     // rpc sales_code_totals, 1,000줄씩(.range)
monthCodes(fromMonth: string, toMonth: string): Promise<RevenueMonthCode[]>   // 옛 sales_codes, 1,000줄씩
// 읽기 셋은 실패하면 E-STATS-READ-FAILED. 서버 오류 글은 버린다
```
- `p_days`는 지금 `toDbDay`(열다섯 칸)를 그대로, `p_day_codes`는 튜플을 `{day, code, count, amount}` 새 객체로

### 매출 읽기 차례 (`src/lib/revenue/sync.ts`) — 함수를 더하고 옛 달 함수는 TASK-9에서 지운다
```ts
export function planRevenue(whole: DateRange, today: string, closeToday: boolean, saved: ReadonlyMap<string, boolean /* dayCodes */>): DateRange[]
export type RangeSyncResult = { stopped: string | null; failed: { range: DateRange; code: string }[]; noDayCodes: boolean }
export async function syncRanges(deps: {
  call: (range: DateRange) => Promise<RevenueDaysResult>
  store: { saveRange(range: DateRange, result: RevenueDaysResult): Promise<void> }
  ranges: readonly DateRange[]
  onProgress?: (p: { done: number; total: number }) => void
}): Promise<RangeSyncResult>
```
- 덩어리만 실패하는 번호 셋은 지금 `MONTH_ONLY_CODES`와 같다. 번호 없는 오류는 `E-PAGE-FAILED`로 적는다(지금 `codeOf`)

### 매출 셈 (`src/lib/revenue/summary.ts`·`treatments.ts`)
- `PeriodSum`에 `workDays`(진료한 날 수: 확인 필요 아님 · `isAllZero` 아님)를 더한다. 나머지 칸·뜻은 그대로
- `groupTreatments`: 코드 견주기를 대문자로 맞춘다(통계 `codeKey`와 같은 규칙). `_REST`·그 밖·차례 첫 묶음 규칙은 그대로

### 매출 보기 (`src/components/stats/revenueView.ts`, 새 순수 모듈)
```ts
export type RevenueInput = {
  range: StatsRange
  lastDay: string                                            // 마지막 끝난 날(어제, 오늘 진료 끝이면 오늘)
  days: readonly (RevenueDayRow & { dayCodes: boolean })[]   // readSpan(range) 안 저장된 날
  codes: readonly { code: string; count: number; amount: number; missing: boolean }[] // 보는 기간 날 단위 합
  monthCodes: readonly (RevenueCodeRow & { month: string })[]  // 보는 기간에 걸친 달의 옛 달 합계
  groups: readonly RxGroup[] | 'reading' | 'read-failed'     // 통계 처방 묶음(저장된 것 또는 제안)
  noDayCodes: boolean                                        // 도우미 예전 판 표시(기본값 9)
}
export type RevenueCell = { key: 'total' | 'perVisit' | 'unchecked' | 'compare'; label: string; value: string; unit: string | null; note: string | null; tone: Tone }
export function revenueCells(input: RevenueInput | 'reading' | 'read-failed'): RevenueCell[]        // 기간 요약 둘째 줄 넷
export type RevenueTabs =
  | { kind: 'empty' }                                                                               // AC-4107.7
  | { kind: 'ready'; trend: TrendTab; split: SplitTab; treatments: TreatmentsTab; perVisit: PerVisitTab }
export function revenueTabs(input: RevenueInput): RevenueTabs
```
- 탭 모양: `TrendTab = { desc; lead: { text; amount; rest }; buckets: BarBucket[]; dense: boolean; note: string; how: string[] }` · `SplitTab = { desc; notice: Notice | null; head: string[]; rows: SplitRow[]; how: string[]; chart: StackChart | null }` · `TreatmentsTab = { desc; state: 'rows' | 'reading' | 'read-failed' | 'none'; lead; rows: TreatmentRow[]; notice: Notice | null; lines: string[]; how: string[] }` · `PerVisitTab = { desc; kpis: Kpi[]; buckets; dense; note; notice: Notice | null; how: string[] }`
- 보기 타입(`Tone`·`Kpi`·`DeltaText`·`Notice`·`SrTable`·`LegendItem`·`Axis`·`BarKind`·`Column`·`Chart`·`StackSegment`·`StackColumn`·`StackChart`·`SplitRow`·`TreatmentRow`)은 `components/revenue/view.ts`에서 새 `components/revenue/types.ts`로 옮기고 `view.ts`는 그것을 다시 내보낸다(그동안 매출 화면이 깨지지 않게). `revenueView.ts`·`RevenueSection.tsx`는 `@/components/revenue/types`에서 불러오고, 남는 부품의 `./view` 불러오기는 TASK-8이 `./types`로 바꾼다. 입력 타입은 TASK-3과 병렬이라 `types/revenue.ts`의 새 이름 대신 같은 모양을 풀어 적는다(구조 타입이라 그대로 맞는다). 숫자는 `summary.ts`의 `sumPeriod`·`splitDay`·`compare`·`perVisit`, 금액 글은 `money.ts`
- 막대 칸(AC-4105.3, 기본값 7): 날 칸은 날마다 `sumPeriod(그날)`로 `BarBucket`(값 하나 = 만 원 아래 버림). 확인 필요한 날은 `blank: 'no-data'`(`–`). 휴진·저장 안 한 날은 칸 없음. 주 칸은 월–일을 기간으로 자르고, 달 칸은 달마다, 끝나지 않은 칸은 `state: 'partial'`. 눈금 글은 환자 수 추이와 같은 함수(`tickLabels`)로. `dense` = 칸이 31개 넘음
- 비교(기본값 5): `compareSpans(range, lastDay)` → 지금·비교 두 기간(12개월은 끝나지 않은 달과 작년 같은 달을 뺀 기간 목록). 두 쪽에 저장 줄 없는 날이 있으면 `null`
- 이 모듈은 `components/stats/`에 둔다(통계 기간 타입·막대 칸 함수 옆). 환자 자료 구역이 아니다(집계 숫자만)

### 매출 훅 (`src/components/stats/useStatsRevenue.ts`, 새)
```ts
export type StatsRevenue = {
  state: 'reading' | 'ready' | 'read-failed'
  days: readonly SavedRevenueDay[]; codes: readonly RevenueCodeTotal[]; monthCodes: readonly RevenueMonthCode[]
  noDayCodes: boolean                                    // 이 화면에서 읽은 답에 dayCodes가 없었음(기억 안 함)
  progress: { done: number; total: number } | null       // 매출 덩어리 읽는 중
  failure: { code: string; savedTo: string | null } | null // 매출만 실패 상자(기본값 13)
  reread(): void
  sync(args: { whole: DateRange; closeToday: boolean }): Promise<void> // 거절하지 않는다. 끝나면 다시 읽는다
}
export function useStatsRevenue(o: { range: StatsRange; today: string; lastDay: string; call: ((r: DateRange) => Promise<RevenueDaysResult>) | null }): StatsRevenue
```
- 읽기: `readSpan(range)`가 바뀔 때·저장 뒤·[다시 읽기]에 `loadDays(readSpan)` · `codeTotals(보는 기간, 끝은 lastDay)` · `monthCodes(보는 기간의 첫 달, 끝 달)`. 늦게 온 앞 기간 답은 버린다(useStatsData와 같은 방식)
- `sync`: `loadDays(whole)` → `planRevenue` → `syncRanges`(진행을 `progress`로) → 결과로 `failure`·`noDayCodes` → 다시 읽기. `call`이 null(비트 PC 아님)이면 아무것도 안 한다
- 저장소는 `createRevenueStore(supabaseBrowser())`. 숫자는 React 상태에만 둔다

### 통계 훅·불러오기 글
- `useStatsWorker`: `useBridge({ worker })`에서 `call`도 꺼내 `revenueDays(range) = call('revenue.days', { from, to })`를 돌려준다(새 연결 없음)
- `loadPlan.ts`: `loadHint` 첫 줄 끝을 `…의 환자·처방·매출을 함께 읽어요.` / `…의 환자·처방·매출을 2년씩 {n}번에 나눠 읽어요.`로. 새 상수 `REVENUE_HINT`(둘째 줄)·새 함수 `revenueProgressText(done, total)`(기본값 12)
- `SourcePicker.tsx`: 펼칠 칸 안내 첫 줄 아래에 `REVENUE_HINT` 한 줄(같은 글자 모양). 읽는 중 줄은 지금처럼 `progress`가 있으면 그것을 쓴다

### 칸 부품
- `sections/RxSection.tsx`: `{ tabs, className, title = '처방', label = '처방 보기', notice?: ReactNode }`. `notice`는 머리 줄과 탭 줄 사이(도우미 예전 판 노란 줄). 나머지 동작 그대로
- `sections/RevenueSection.tsx`(새): `RevenueSection({ tabs: RevenueTabs | 'reading' | 'read-failed'; noDayCodes; onReread; className })`
  - `ready` → `RxSection title="매출" label="매출 보기" notice={noDayCodes && 예전 판 줄}` + 패널 넷. 패널마다 `Section`(탭 패널 모드, `desc` = 탭 설명)을 쓰므로 설명이 탭 따라 바뀐다
  - 매출 추이: 첫 줄 → `StackedBarChart`(계열 하나 `accent`, 단위 `만 원`, 환자 수 추이와 같은 감싸개 클래스) → `Note` → `HowCounted`
  - 급여·비급여·기타: `NoticeLine` → 12칸 격자(왼쪽 5칸 `SplitTable` + `HowCounted`, 오른쪽 `StackBars`)
  - 치료별 매출: 첫 줄 → `TreatmentBars` → `NoticeLine`(빠진 날) → `HowCounted`. 상태 글(기본값 3·4, AC-4107.8)
  - 건당 진료비: `NoticeLine`(접수 건수 모름) → `KpiRow`(셋) → `StackedBarChart`(단위 `천 원`) → `Note` → `HowCounted`
  - `empty` → 보통 `Section title="매출"` + 한 줄. `reading` → 보통 `Section` + `불러오는 중`. `read-failed` → 보통 `Section` + `ErrorCard` + [다시 읽기]
  - 예전 판 줄: `RevenueParts`의 `BANNER` + `bg-warning-soft`, `role="note"`, 오른쪽 `next/link` `/settings`(`ds.button.secondarySmall` 모양)
- `components/revenue/RevenueSplit.tsx`: 안의 `SplitTable`을 `export`만 한다(지금 매출 화면이 그대로 쓰게)
- `sections/PeriodSummary.tsx`: `revenue?: RevenueCell[]`. 있으면 첫 줄 격자 아래에 같은 `CELLS`·휴대폰 2칸 × 2줄 격자로 네 칸(값 글 + 작은 단위, 아래 글, 색). 없으면 지금 그대로(따로 그린 시험 그대로)
- `sections/DoctorsSection.tsx`·`lib/analytics/doctorStats.ts`: 머리 글자 `건당 진료비`, `FOOT` 끝 문장 바꾸고 한 문장 더함

### 화면 잇기 (`StatsScreen.tsx`·`StatsSections.tsx`·`StatsToc.tsx`)
- `StatsToc`: `TOC_LINKS`에 `{ id: 'stats-revenue', name: '매출' }`를 `재방문율` 다음에(열 개)
- `StatsSections`: 새 prop `revenue?: { state: 'reading' | 'ready' | 'read-failed'; days; codes; monthCodes; noDayCodes: boolean; lastDay: string; onReread(): void }`(= `useStatsRevenue` 값 + 마지막 끝난 날). 있으면 `RevenueInput`(range = `input.range`, 묶음 = 이미 받는 `groups`의 state가 reading·read-failed면 그 값, 아니면 `groups.groups`)을 만들어 `revenueCells`·`revenueTabs`를 `useMemo`로 → `PeriodSummary revenue=…`와 `SectionAnchor(REVENUE_ID) > RevenueSection`(재방문율 다음)에 넘긴다. 없으면 매출 칸·둘째 줄이 없다(`bit`처럼, 따로 그린 시험 그대로)
- `StatsScreen`:
  - `const revenue = useStatsRevenue({ range, today, lastDay: lastDayOf(today, todayDone), call: state === 'ready' ? revenueDays : null })`
  - `readParts`가 '모든 조각 저장'이면 참을 돌려준다. `loadFromBit`·`resumeLoad`는 참일 때 같은 `runJob('bit')` 안에서 `await revenue.sync({ whole: plan.whole, closeToday })`. [이어서 불러오기] 뒤 매출은 처음 누를 때의 `closeToday`로 읽는다(그래서 `LoadRun`에 처음 값을 둔다). 그동안 `progress` 줄은 `revenueProgressText`
  - 띠 아래(나눠 읽기 상자 다음) 매출만 실패 상자(`role="status"`, 지금 `LoadRunBox`와 같은 모양) + [매출만 다시 읽기] → `runJob('bit', …, { keep: true })`(다른 안내를 지우지 않음) → 같은 `whole`·`closeToday`로 `revenue.sync`. 마지막 불러오기의 `whole`·`closeToday`는 화면 상태에만 둔다
  - `WAITING`에 `{ title: '매출', place: 'col-span-12' }`를 `신환 재방문율` 다음에

### 정리 (메뉴·주소·대시보드·지우기)
- `menu.ts`: '매출' 줄·`MenuLabel`·`MenuPath`·`MenuHref`의 `/revenue`를 뺀다(탭 열둘, 주요 넷). 주석 '13개'·'다섯'을 고친다
- `next.config.ts`: `async redirects() { return [{ source: '/revenue', destination: '/stats', permanent: false }] }`(쿼리는 Next가 붙여 넘긴다). 고정 경로라 열린 넘기기가 아니다. 머리 줄(CSP) 규칙은 그대로
- `features.ts`: '매출' 줄 빼고 통계 설명(기본값 17). `preview/sample.ts`: `PREVIEW_TABS`에서 '매출'
- **지우는 것**: `app/(app)/revenue/page.tsx`·`page.test.tsx` · `components/revenue/`의 `RevenueScreen`·`RevenueStates`·`RevenueRange`·`range.ts`·`RevenueTrend`·`RevenuePerVisit`·`RevenueTreatments`·`view.ts`와 그 시험(`RevenueScreen.test.tsx`·`RevenueRange.test.tsx`·`range.test.ts`·`view.test.ts`) · `components/revenue/groups/*`(시험 포함) · `lib/storage/rxGroups.ts`·`.test.ts` · `lib/storage/revenue.ts`의 `saveMonth`·`loadRevenue` · `lib/revenue/sync.ts`의 `planFetch`·`spanMonths`·`syncRevenue`·`ALL_FROM_MONTH`·`FetchSpan` · `summary.ts`의 `periodsFor`·`firstMonth`·`monthSeries`·`MonthPoint` · `treatments.ts`의 `addGroup`·`deleteGroup`·`moveCode`(쓰는 곳이 매출 묶음 화면뿐)
- **남기는 것**(`components/revenue/`): `RevenueParts.tsx`·`TreatmentBars.tsx`·`RevenueSplit.tsx`(→ `SplitTable`만)·`MonthBars.tsx`(→ `StackBars`만)·`money.ts`(+시험)·`types.ts`. `parts.test.tsx`는 남는 부품과 폴더 소스 규칙만 보게 줄이고, 지운 파일이 없고 아무도 부르지 않는다는 시험을 더한다
- 문서: `docs/ARCHITECTURE.md`(폴더 줄·흐름 줄·표 줄에 `sales_day_codes`), `plan.md`(매출 줄), `docs/revenue/pc-check.md`(맨 위 한 줄)

## 데이터 흐름
```
[비트에서 불러오기]
  └ 통계 조각 planLoad(stats.rows → Worker → saveStats) … 하나라도 멈추면 여기서 끝(매출 안 읽음)
  └ 모두 저장 → useStatsRevenue.sync(whole)
        loadDays(whole) → planRevenue(빈 날 + 어제 + 진료 끝이면 오늘, 31일 덩어리, 새것부터)
        덩어리마다: useStatsWorker.revenueDays(같은 연결) → 도우미 revenue.days → {days, codes, dayCodes?}
                     → isRevenueDays(검사) → saveRange → rpc save_revenue_range(한 트랜잭션)
        결과 → 실패 상자 / 예전 판 표시 → 다시 읽기
[화면]
  readSpan(range) → loadDays · codeTotals(rpc) · monthCodes → revenueView(range, lastDay, groups)
    → PeriodSummary 둘째 줄 · RevenueSection 탭 넷
[업무일지] 그대로: revenue.days(그날) → days만
```

## 결정과 트레이드오프
- **새 명령 대신 답에 열쇠 하나**: 확장 웹스토어 새 판이 필요 없다. 값: 옛 웹이 새 답을 거부한다(위험 1) → 도우미는 웹 배포 뒤에 깐다
- **날×코드 줄을 서버에 두고 합계는 서버 함수로**: 12개월 보기에 날×코드 줄 3만 개를 브라우저로 끌어오지 않는다(410줄만). 값: 함수 하나 더(RLS는 부른 사람 권한이라 그대로 지켜진다). 하루 한 줄 jsonb 모양은 칸 제약을 함수로 다시 써야 해서 버렸다
- **저장은 함수 하나로**: 날 줄과 코드 줄이 한 트랜잭션이라 반쪽 저장이 없다. 옛 저장(지우고 넣기 세 번)은 도중 실패 때 다시 가져오기에 기댔다
- **빈 날만 읽기**: 달 1일 맞춤이 없어져 최근 30일은 보통 새 날 1~2일만 읽는다. 처음 한 번(새 도우미 뒤)은 날 단위 처방 금액이 없는 날을 모두 다시 읽는다(30일 보기 75일 ≈ 25초)
- **처방 묶음 한 벌**: 매출은 넣는 처방만 쓴다. 금액은 환자·날로 나뉘어 있지 않아 '그날 같이 받으면 뺀다'를 셀 수 없다 → 글로 알린다
- **매출 칸을 처방 칸 탭 부품으로**: 탭 모양·키·패널 상태 지킴·설명 portal이 같아진다. 값: `RxSection`에 넘김 값 셋
- **지우기를 마지막에**: 그 전 단계마다 매출 화면이 그대로 돌아(시험 그대로 통과) 단계마다 초록이다. 값: 옛 함수와 새 함수가 잠깐 같이 있다

## 위험
1. **옛 웹 + 새 도우미 = 매출·업무일지 비트 칸 깨짐**: 지금 운영 웹은 열쇠가 셋인 답을 `E-BRIDGE-BAD-REPLY`로 거부한다(코드 확인 1). 그래서 차례는 꼭 ① SQL 붙여넣기 → ② 웹 배포 → ③ 새 도우미 설치다(tasks.md '사용자 할 일')
2. **SQL 전에 웹을 올리면**: 매출 읽기(`sales_code_totals`)·저장(`save_revenue_range`)이 없어 매출 칸이 읽기 실패 카드, 불러오기가 매출만 실패 상자를 보인다(통계는 그대로). ssk-deploy 1번 확인이 막는다
3. **처음 '전체 기간'**: 매출 때문에 13분쯤 더 걸린다(한 번 읽은 날은 남는다). 안내 둘째 줄로 알린다
4. **한 연결 규칙**: 매출을 따로 `useBridge`로 붙이면 `E-BRIDGE-BUSY`. 통계 훅의 `call`만 쓴다(AC-4108.2 시험)
5. **숫자 뜻 차이가 한 화면에**: 매출 칸(확인 필요한 날 뺌) · 원장님별(더함) · 보고 문장(날·달 단위) · 치료별(처방 금액) · 처방 칸 '건'. [어떻게 세나요?]와 원장님별 한 문장으로 알린다
6. **옛 달 치료별 매출은 달 단위로만**: 달 중간이 끼는 기간은 새 도우미로 다시 불러오기 전까지 빠진 날 안내
7. **`StatsScreen.test.tsx`(3,330줄) 고치기**: 칸 제목 목록 · 불러오기 차례(매출 읽기 가짜 더함) · 목차 열 개. 기대값은 이 명세가 바꾸는 것만 고치고 고친 시험 이름에 AC를 더한다(AC-4111.1)
8. **E2E**: 실제 Supabase에 SQL이 들어간 뒤에만 매출 칸이 정상이다. 세 E2E는 SQL을 붙인 뒤 `.env.local`이 있을 때 돌린다
