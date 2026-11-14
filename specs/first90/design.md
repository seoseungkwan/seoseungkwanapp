# 설계: first90

## 1. 자료 흐름 (바뀌는 곳만)

```
비트 DB ─도우미 0.7.0─▶ stats.rows v4: patientDays에 다섯째 칸(90일초진 접수 수)          (REQ-4401)
                     └▶ revenue.days: unconfirmed 날에만 roughTotal                         (REQ-4405)
   ─확장─▶ lib/bridge ─▶ Worker
      workers/stats/helperData.ts  parseStatsRows: v2·v3 네 칸 / v4 다섯 칸                 (REQ-4402)
      lib/analytics/aggregate.ts   totals.first90(선택) · 처방 줄 once(선택)                 (REQ-4402·4409)
      lib/payload/*                날·달 payload에 옮김 · validate가 둘 다 받음
   ─저장─▶ stats_days / stats_months payload jsonb (SQL 바꿈 없음)
           sales_days.rough_total (새 칸, SQL 파일 하나)                                    (REQ-4406)
   ─화면─▶ 통계 기간 요약·환자 수 추이·보고 문장 / 대시보드 하루 분석·기간별 흐름            (REQ-4403·4404)
           통계 매출 [빼고 보기|넣고 보기] (기간 요약 + 매출 칸, 상태 하나)                  (REQ-4408)
           처방 골라 보기 → 신환이 한 번만 받은 처방                                        (REQ-4410)
```

## 2. 도우미 (C#, Precheck.Core)

### 2-1. PatientDaysSql 다섯째 칸
`StatsSql.PatientDaysSql`의 자기 SELECT만 바꾼다. `PeriodVisits`에는 이미 `VisitId`(= `OcmNum`)가 있다.
```sql
SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay,
 SUM(CASE WHEN o.OcmDgsNfs='3' THEN 1 ELSE 0 END) First90
FROM PeriodVisits v LEFT HASH JOIN FirstVisits f ON f.PatientId=v.PatientId
JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId
WHERE v.PatientId IS NOT NULL
GROUP BY v.PatientId,v.VisitDay,f.FirstDtm
ORDER BY v.PatientId,v.VisitDay
```
- 공유 `Visits` CTE는 그대로 둔다. 원본 SQL 글을 고정한 시험이 여럿이다.
- HASH 힌트는 지금처럼 한 번(`FirstVisits` 쪽)뿐이다. `OcmInf` 잇기는 기본 키 잇기라 힌트가 없다.
- 고정 시험 가운데 바뀌는 것:
  - `StatsSql.test.cs`의 PatientDaysSelect 글.
  - `visitBasis.test.ts`의 `patientDaysSql()` 글 비교.
  - `HelperStatsSpeedSql.test.cs`·`BitReadSpeedSql.test.cs`는 HASH가 한 번인지만 본다. 돌려서 확인한다.
- `StatsRows`는 줄을 `[patient, date, receptions, firstVisit, first90]`로 낸다.
- `StatsPayload.Version`을 3에서 4로 올린다.

### 2-2. revenue.days의 roughTotal
`RevenueDays.ReadMoney`가 `row.Unconfirmed = true`로 끝나는 두 곳(세 검사, 음수)에서 `row.RoughTotal = Rough(db, values)`를 부른다.
- `Rough`는 `StatsSql.DoctorMoneyNormalSql`·`DoctorMoneyReceivableSql`(원장님별 `doctorDays`와 같은 글)을 그대로 쓴다.
  - 그날 값을 그 문장의 매개변수 이름(ReportDay·ReportNextDay·ReportHospital)으로 넣는다.
  - 줄의 셋째 칸(총진료비)을 원 미만 버림으로 바꾸고 모두 더한다. 환불 음수는 그대로다.
- `RevenueDay.RoughTotal`은 `long?`이다. JSON에는 값이 있을 때만 `"roughTotal"` 열쇠를 쓴다(확인된 날은 열쇠가 없다).
- 판 0.7.0: 바꾸는 곳과 판 번호가 박힌 시험.
  - 바꾸는 곳: `Directory.Build.props`, `versions.ts` `LATEST_HELPER`, `RevenueDays.cs`의 판 주석.
  - 시험: `input-wiring.dotnet.test.ts`, `revenue-read.dotnet.test.ts`, `RevenueCommands.test.cs`, `Dispatcher.test.cs`, `build.test.ts`, `handshake.test.ts`, `client.test.ts`, `revenueCall.test.ts`, `revenueResult.test.ts`.
  - 올리기 전에 `gh release list`로 다른 창이 판을 냈는지 본다.

## 3. 웹 자료 (환자 자료 구역)

### 3-1. parseStatsRows (`workers/stats/helperData.ts`)
- `v: 2 | 3 | 4`. v4는 v3과 같은 열쇠이고 `patientDays` 줄만 다섯 칸이다.
- `PatientDay`(types/analysis.ts)에 `first90?: number`를 더한다. v4에서만 채운다.
- 메모리(BitMemory)에는 판을 알 수 있게 둔다. 예: 모든 줄에 `first90`이 있으면 v4다.

### 3-2. totals (`lib/analytics/aggregate.ts` 376-386 근처)
- `Totals`에 `first90?: number`를 더한다.
- v4 날:
  - `first90 = Σ (firstVisit 아님) first90`.
  - `returning = patients − newPatients − first90 − unknown`.
- 주·달 칸은 일 칸의 합이다. 모든 일 칸에 `first90`이 있을 때만 둔다.
- 파일 길과 v2·v3에는 열쇠를 두지 않는다.

### 3-3. once (처방 줄)
- `RxStats`·`DayPayload.rx[]`에 `once?: number`를 더한다.
- 셈은 처방 줄을 세는 곳(같은 파일)에서 메모리의 진료 줄(`VisitRow {p,d,c,f}`)로 한다.
  1. 환자·코드마다 받은 서로 다른 날 수를 한 번 모은다: `Map<p, Map<c, Set<d>>>`. 불러온 자료 전체가 대상이다.
  2. 날 칸 d, 코드 c에서 `f === d`인 환자 p 가운데 `days(p, c).size === 1`인 수를 센다.
- 첫 내원일 뒤의 날은 모두 그 뒤에 있다. 그래서 '불러온 자료 끝날까지'다.
- 파일 길도 같은 셈이다.

### 3-4. payload·검사
- `toDayPayloads.ts`·`toMonthPayload.ts`·`groupCounts.ts`·`history.ts copyTotals`: `first90`·`once`가 있을 때만 옮긴다. 달 `rx[].once`는 두지 않는다. 표는 날 payload로 센다.
- `validate.ts totalsOf`: 네 열쇠 또는 다섯 열쇠(AC-4402.5). 처방 줄 `once`는 선택 열쇠이고 `0 ≤ once ≤ newPatients` 정수다.
- `lib/ai/input.ts`: totals를 옮길 때 정해진 네 열쇠만 고른다(AC-4402.6). 덕분에 `output.ts`의 숫자 단어 막기에 걸리지 않는다.

## 4. 매출 자료

- `revenueResult.ts`: 날 줄 열쇠 검사에 `roughTotal`을 선택 열쇠로 더한다. 규칙은 `unconfirmed` 참일 때만, |값| ≤ 10^12 정수(AC-4406.4).
- `types/revenue.ts`: `RevenueDay.roughTotal?: number`. 저장 줄 `SalesDayRow.rough_total: number | null`.
- `storage/revenue.ts`: `save_revenue_range` 인자 줄에 `rough_total`, 읽기 select에 `rough_total`.
- SQL `supabase/migrations/20261115000000_sales_day_rough.sql`:
  - `alter table … add column if not exists rough_total bigint`.
  - CHECK `rough_total is null or total is null`을 지우고 다시 만든다.
  - `grant insert (rough_total), update (rough_total)`.
  - `create or replace function save_revenue_range`. 지금 함수 글에 `rough_total`만 더한다.
  - 사용자가 SQL Editor에 붙여 실행한다.
- 다시 읽기: 저장 표시(`saved`)를 만드는 곳에서 아래 조건이면 그날을 '덜 저장됨'(false)으로 둔다. `planRevenue` 자체의 날 고르기는 그대로다.
  - `unconfirmed && rough_total === null && helperAtLeast('0.7.0')`.
  - 도우미 판은 지금 연결 정보에서 받는다.

## 5. 화면

### 5-1. 통계 기간 요약·추이·문장 (`components/stats/view.ts`·`periodPick.ts`·`sections/*`)
- `summaryCells`·`pickSummaryCells`에 열쇠 `first90` 칸을 더한다(값 null = '–'). 재진 칸 값은 AC-4403.1·.2를 따른다.
- 기간 요약 첫 줄: `PeriodSummary` `CELLS`·`PICK_GRID`가 5칸이 된다(`grid-cols-5`, 768px 미만 2칸, 다섯째 칸 `max-md:col-span-2`). 매출 줄은 4칸 그대로다.
- `parts.tsx TREND_SERIES`를 세 갈래로 바꾼다. 셋 다 알지 못하면 지금 두 갈래 배열을 쓴다. 고르는 함수를 parts에 둔다.
- 대시보드 `FlowSection`도 같은 함수를 쓴다.

### 5-2. 대시보드 (`components/dashboard/summary/*`)
- `todayView.counts.first90: number | null`.
- `DailySection` `KPI_CELLS` 5칸.
- `reportSentence` 둘째 문장(AC-4404.2).

### 5-3. 매출 [빼고 보기 | 넣고 보기]
- 상태 하나 `revenueMode: 'out' | 'in'`(처음 'out')를 `StatsSections`(또는 `StatsScreen`)의 React 상태로 둔다. 기간 요약과 매출 칸에 같은 값·바꾸는 함수를 내린다. 저장하지 않는다.
- 단추 부품 하나(`RoughToggle`)를 두 곳에 쓴다. 이름 id는 `useId`로 따로 만든다.
- `lib/revenue/summary.ts sumPeriod(days, { withRough })`:
  - 'in'이면 확인 필요한 날 가운데 `roughTotal`이 있는 날의 그 값과 그날 접수 건수를 더한다.
  - 급여·비급여·기타 합에는 넣지 않는다.
  - 결과에 `roughDays: string[]`, `roughSum`을 더한다.
- `revenueView.ts`: `revenueCells`·`revenueTabs`가 mode를 받는다. 막대 칸 종류는 `'rough'`(빗금)를 새로 둔다. 빗금 모양은 `RxPickAgain`의 svg path 빗금과 같은 방법이다.

### 5-4. 신환이 한 번만 받은 처방
- 순수 함수 `onceView(days, code, range, today)` → `{ rows: [{ month, sub, info, newPatients, once: number | null }], total, missing }` (`components/stats/onceView.ts`).
- 부품 `sections/RxPickOnce.tsx`. `RxPickerSection`이 '같은 처방 재방문' 아래에 놓는다. 고른 처방 상태는 React 상태다(처음 첫째 처방).
- 표 모양은 `RxPickAgain` 표와 같은 grid 규칙이다(1024px 미만 두 열로 쌓임).

## 6. 결정과 이유
- 1회 신환은 도우미를 고치지 않고 Worker에서 센다. 진료 줄(환자 번호·날·코드·첫 내원일)이 이미 Worker 메모리에 있고, 첫 내원일 뒤의 날은 모두 불러온 범위 안에 있어서다. 옛 도우미(0.6.0)로도 된다.
- 90일초진은 접수 수 기준이다. 지금 통계의 환자 수가 접수 건수라서 같은 기준으로 맞췄다.
- `schemaVersion`은 올리지 않는다. 올리면 DB CHECK 때문에 SQL이 필요하다. 새 열쇠는 선택이고, 없으면 '못 셈'으로 그린다.

## 7. 위험
1. **판 차례**: 새 도우미(v4·roughTotal)를 운영 웹(v2·v3만 받음)에 쓰면 통계 불러오기가 실패한다.
   - 웹을 먼저 배포한 뒤 도우미를 설치한다.
   - SQL을 먼저 붙인다. 안 붙인 채로 새 웹을 올리면 매출 저장이 `rough_total` 때문에 실패한다.
2. **1회 신환이 낡을 수 있음**: 지난 날 칸의 `once`는 그 날을 불러온 때의 자료 끝날까지 센 값이다. 그 뒤 그 날을 다시 불러오지 않으면, 그동안 다시 온 환자도 1회로 남는다. ⓘ와 "불러온 자료 끝날까지" 글로 알리고, 최근 1년 다시 불러오기로 맞춘다.
3. **넣고 보기 비교**: 비교 기간에 참고 금액이 없는 확인 필요한 날이 있으면 두 기간의 기준이 조금 다르다. 그런 날은 지금처럼 빠진다.

## 8. 시안과 다른 곳 (기본값)
- 옛 도우미 상태의 처방 표: 시안은 "도우미가 예전 판이라…" 안내였다. 이제 Worker가 세므로 옛 도우미로도 표가 나온다. 이 기능 전에 저장한 날만 AC-4410.4 글이 나온다.
- "어떻게 세나요?" 글:
  - "불러온 날(11월 14일)까지" → "불러온 자료 끝날까지".
  - "이틀 넘게" → "이틀 이상".
  - 예의 처방 이름 "관절강 내 주사" → "그 처방".
- 대시보드 칸 아래 글: 시안의 "그날 처음 온 분"·"90일 넘어 다시 온 분"은 넣지 않는다. 지금 대시보드처럼 아래 글이 없다. 단, 모르는 경우의 "새 도우미(0.7.0)면 나와요"·"90일초진 포함"은 넣는다.
- 기간 요약 90일초진 칸 아래 글 "기간 합계 · 90일 넘어 다시 온 분"은 시안 그대로다.
