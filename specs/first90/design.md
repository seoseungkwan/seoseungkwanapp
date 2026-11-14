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
   ─화면─▶ 대시보드 하루 분석·기간별 흐름                                                   (REQ-4404)
           통계 화면 개선(redesign.html): 틀·바로가기 띠·카드 다섯                          (REQ-4411·4416·4417)
             환자 요약(90일초진 칸) · 매출 요약 + 참고 금액 포함 스위치(상태 하나)          (REQ-4403·4408)
             환자 · 매출 · 처방(신환이 그 처방을 받은 횟수) · 진료 운영 · 보고              (REQ-4410·4412~4415)
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
- 조각 읽기(AC-4409.3, `stats/loadPlan.ts` `partSave`): 읽은 끝날이 저장 끝날보다 뒤인 조각(가장 새 조각이 아닌 것)은 `after30`을 null로 보내는 것과 같은 자리에서 날 줄 `rx[]`의 `once` 열쇠를 뺀다. 달 줄에는 `once`가 없어 그대로다. 저장된 날 줄에는 '언제까지 셌나' 날짜가 없다(`stats_days.updated_at`은 줄마다 화면에 넘기지 않는다). 그래서 화면은 날짜 대신 글(AC-4410.1·4410.3)로 범위를 알린다.

### 3-4. payload·검사
- `toDayPayloads.ts`·`toMonthPayload.ts`·`groupCounts.ts`·`history.ts copyTotals`: `first90`·`once`가 있을 때만 옮긴다. 달 `rx[].once`는 두지 않는다. 표는 날 payload로 센다.
- `validate.ts totalsOf`: 네 열쇠 또는 다섯 열쇠(AC-4402.5). 처방 줄 `once`는 선택 열쇠이고 `0 ≤ once ≤ newPatients` 정수다.
- `lib/ai/input.ts`: totals를 옮길 때 정해진 열쇠만 고른다(AC-4402.6). 덕분에 `output.ts`의 숫자 단어 막기에 걸리지 않는다. 재진은 `returning + (first90 ?? 0)`로 넣어 옛 뜻(접수 건수 − 신환 − 알 수 없음)을 지킨다. 이번 달이 v4이고 작년 달이 v3이어도 재진이 거짓으로 줄어 보이지 않는다.

## 4. 매출 자료

- `revenueResult.ts`: 날 줄 열쇠 검사에 `roughTotal`을 선택 열쇠로 더한다. 규칙은 `unconfirmed` 참일 때만, |값| ≤ 10^12 정수(AC-4406.4).
- `types/revenue.ts`: `RevenueDayRow.roughTotal?: number | null`(저장 줄에서 읽으면 없을 때 null, 도우미 답 검사는 null을 받지 않는다). DB 줄은 `storage/revenue.ts`의 `DbSavedDay.rough_total: number | null`.
- `storage/revenue.ts`: `save_revenue_range` 인자 줄에 `rough_total`, 읽기 select에 `rough_total`.
- SQL `supabase/migrations/20261115000000_sales_day_rough.sql`:
  - `alter table … add column if not exists rough_total bigint`.
  - CHECK `rough_total is null or total is null`을 지우고 다시 만든다.
  - `grant insert (rough_total), update (rough_total)`.
  - `create or replace function save_revenue_range`. 지금 함수 글에 `rough_total`만 더한다.
  - 사용자가 SQL Editor에 붙여 실행한다.
- 다시 읽기: 저장 표시(`saved`)를 만드는 곳에서 아래 조건이면 그날을 '덜 저장됨'(false)으로 둔다. `planRevenue` 자체의 날 고르기는 그대로다.
  - `unconfirmed && rough_total === null && helperAtLeast('0.7.0')`.
  - 도우미 판은 `useStatsWorker`가 연결 정보의 `hello.helperVersion`을 `helperVersion`으로 내보내고, `StatsScreen`이 `useStatsRevenue({ …, helperVersion })`로 넘긴다.

## 5. 화면 (통계 화면 개선, redesign.html)

### 5-0. 시안 → 파일
| 시안 | 파일 | 하는 일 |
|---|---|---|
| 토큰·움직임 | `app/globals.css` | 아래 5-1·5-3 |
| 규칙 예외 | `ui/classes.test.ts`, `app/theme.test.ts`, `app/globals.test.ts`, `charts/rules.test.ts`, `docs/UI_GUIDE.md` | 아래 5-2 |
| 차트 기반 | `charts/StackedBarChart.tsx`, `charts/InlineBar.tsx`, 새 `charts/DonutChart.tsx`, 새 `stats/trendSeries.ts` | 아래 5-4 |
| 틀·카드 | `sections/parts.tsx`, `sections/StatsSections.tsx`, `stats/StatsScreen.tsx` | 아래 5-5 |
| 바로가기 띠 | `stats/StatsToc.tsx` | `TOC_LINKS` 여섯(요약 `stats-summary` · 환자 `stats-patients` · 매출 `stats-revenue` · 처방 `stats-rx` · 진료 운영 `stats-ops` · 보고 `stats-report`). `tocRangeText`와 띠 왼쪽 글을 없앤다. 지금 칸 고르기·모션 줄이기는 그대로. 띠 모양은 5-5 |
| 환자 요약 | `sections/PeriodSummary.tsx`, `stats/view.ts summaryCells`, `stats/periodPick.ts` | 칸 넷 + 칸 안 증감(5-6). 매출 줄은 빼서 `RevenueSummary`로 |
| 매출 요약·스위치 | 새 `sections/RevenueSummary.tsx`, 새 `sections/RoughSwitch.tsx`, 새 `sections/SummaryCell.tsx`, `stats/revenueView.ts revenueCells`, `lib/revenue/summary.ts` | 5-7. 요약 칸 모양은 `SummaryCell` 하나를 두 줄이 같이 쓴다(대시보드 `KpiStat`은 그대로 둔다) |
| 환자 카드 | `sections/PatientTrendSection.tsx`, 새 `sections/VisitMixSection.tsx`, `sections/RevisitSection.tsx`, `sections/PatientMixSection.tsx`, `stats/view.ts`(visitMix·재방문 대상 기간) | 도넛은 `PatientTrendSection`이 일별 내원 왼쪽(좁으면 위)에 놓는다. `StatsSections`는 고치지 않는다 |
| 매출 카드 | `sections/RevenueSection.tsx`, `stats/revenueView.ts revenueTabs`, `revenue/MonthBars.tsx`, `revenue/RevenueParts.tsx`, `revenue/TreatmentBars.tsx` | 점선·빗금 막대(5-7), 치료별 매출 가로 막대 순위. `components/revenue/*`는 통계 매출 칸만 쓴다 |
| 처방 카드 | `sections/RxSection.tsx`, `sections/TreatmentTrendSection.tsx`, `sections/TreatmentTable.tsx`, `sections/RxSplitSection.tsx`, `sections/RxPickerSection.tsx` | 순위 줄 모양·머리 칸·폰 쌓기 |
| 횟수 막대 | 새 `stats/onceView.ts`, 새 `sections/RxPickOnce.tsx` | 5-8 |
| 진료 운영 | `sections/WeekdaySection.tsx`, `sections/VisitHoursSection.tsx`, `sections/DoctorsSection.tsx` | 히트맵 폰 요일 고르기, 원장님 폰 카드 |
| 보고 | `sections/ReportSection.tsx` | 네 줄 미리보기·[전체 보기]·[복사] |
| 대시보드 | `dashboard/summary/*` | 5-9 |

### 5-1. 토큰 (`globals.css :root`에 더함, 지금 값은 그대로)
- 바탕·글자·선: `--st-canvas #F4F6F9`, `--st-ink #172B4D`, `--st-ink-2 #3B4A63`, `--st-muted #5B6B82`, `--st-line #E5EAF1`, `--st-line-2 #CBD3DF`.
- 계열: 신환은 지금 `--accent #2563EB`, `--st-f90 #0D9488`, `--st-ret #6B89BF`, `--st-ref #B7791F`(그림), `--st-ref-2 #E9C98F`(빗금 옅은 줄), `--st-warn-ink #975A16`(글자). 옅은 노랑 바탕은 지금 `--warning-soft`다.
- 시간대 칸: `--st-h0 #F1F4F8`, `--st-h1 #DCE8FC`, `--st-h2 #B5CEF8`, `--st-h3 #7FA9F1`, `--st-h4 #3F7BE6`, `--st-h5 #1D4ED8`.
- 모서리·그림자: `--st-r 14px`(768px 미만 12px), `--st-r-sm 8px`, `--st-card-shadow 0 1px 2px rgb(23 43 77 / 0.04)`.
- 글자: `--fs-st-15 15px`, `--fs-st-17 17px`, `--fs-st-18 18px`, `--fs-st-22 22px`, `--fs-st-34 34px`, `--fs-st-40 40px`(768px 미만은 34→28, 40→34).
- 움직임: `--st-t-toggle 200ms`, `--st-t-period 300ms`, `--st-t-first 450ms`.
- `@theme inline`에 `--color-st-*`·`--text-st-*`·`--radius-st-*`·`--shadow-st-card`로 이름을 준다(값은 `var()`로만).
- 대비: 글자 `#172B4D` 14.1:1, `#5B6B82` 5.43:1, `#975A16` 5.54:1(흰 바탕). `#B7791F`·`#6B89BF`·`#0D9488`은 그림·막대에만 쓰고 작은 글자에는 쓰지 않는다.

### 5-2. 규칙 예외 (사용자 승인 시안, 2026-11-14)
- 예외 파일: `src/components/stats/**`, `src/components/revenue/**`(시험 파일 빼고), `src/components/charts/DonutChart.tsx`·`StackedBarChart.tsx`·`InlineBar.tsx`·`ChartLegend.tsx`(범례 색 표시).
- 허용하는 것(이 파일들에서만):
  - 화면 폭 접두사 `min-[1100px]:`·`min-[1200px]:`·`max-[1200px]:`·`max-[380px]:`(Tailwind 4의 `max-[N]:`은 N 미만).
  - 모서리 `rounded-st`·`rounded-st-sm`·`rounded-full`(스위치·꼬리표·바로가기 링크만), 그림자 `shadow-st-card`.
  - 글자 `text-st-15`·`text-st-17`·`text-st-18`·`text-st-22`·`text-st-34`·`text-st-40`과 `text-st-*`·`bg-st-*`·`border-st-*` 색.
  - 움직임은 Tailwind `animate-*`·`transition*` 클래스가 아니라 `globals.css`의 이름 붙은 클래스(`st-move-period`·`st-move-heat`·`st-move-toggle`·`st-donut`·`st-rise`·`st-tag-in`·`st-flash`)로만 한다. `@keyframes`는 `st-donut`·`st-rise`·`st-in` 셋을 더한다.
- `charts/rules.test.ts`: 차트 부품은 지금처럼 `'use client'`·hooks·`animate-*`·`transition*`가 없다. 이름 붙은 `st-*` 움직임 클래스는 `DonutChart`·`StackedBarChart`·`InlineBar`에서만 받고, 다른 차트 파일에 있으면 잡는다.
- 그대로 지키는 것: 600 넘는 굵기 금지(시안 700 → 600), 그라데이션 금지(빗금은 svg `pattern`·path, 보고 미리보기에 흐림 덧칠 없음, 바로가기 띠도 흐림 없이 불투명 바탕), 지어낸 숫자 금지, 다크 모드 없음.
- `UI_GUIDE.md`에 '통계 화면(first90)' 절을 더해 위 목록을 적는다. 규칙 시험은 예외 목록을 상수로 두고, 목록 밖 파일이 쓰면 실패한다(지금 `WIDE_1280` 방식). 환자 구성 1280px 예외(`WIDE_1280`)는 환자 구성을 탭으로 바꾸는 작업(TASK-9)에서 없앤다.

### 5-3. 움직임 (`globals.css`, CSS만)
- 차트 부품은 클라이언트 코드 없이 클래스만 붙인다. 움직임은 모두 CSS가 한다.
- `.st-donut .seg`: `@keyframes st-donut`(`stroke-dasharray` 0 → 제 길이) 450ms, 붙을 때 한 번. 같은 요소를 다시 그리면(값만 바뀜) 되풀이하지 않는다.
- `.st-move-period`: `height`·`width`·`flex-basis`·`stroke-dasharray`·`stroke-dashoffset` 300ms ease-out. `.st-move-heat`: `background-color`·`color` 200ms.
- `.st-move-toggle`: 스위치 손잡이 `transform` 200ms. `.st-rise`: 빗금 막대 `transform: scaleY(0→1)` 200ms(아래 기준). `.st-tag-in`: "참고 포함" 꼬리표 `opacity` 200ms.
- `.st-flash`: 매출 요약 칸 바탕 `--accent-soft`. `RevenueSummary`가 mode가 바뀔 때 붙이고 250ms 타이머로 뗀다(타이머 하나, 다시 바뀌면 지우고 새로).
- `@media (prefers-reduced-motion: reduce)`: 위 클래스의 `animation`·`transition`을 모두 끈다.
- 탭 밑줄·펼치기·단추 묶음에는 움직임 클래스를 붙이지 않는다. 숫자 글은 바로 바뀐다.

### 5-4. 차트 기반
- `StackedBarChart`:
  - `BarSeries.tone`에 `'f90'`(`bg-st-f90`)·`'ret'`(`bg-st-ret`)·`'rough'`(빗금, `--st-ref`·`--st-ref-2`)를 더한다. 지금 tone은 그대로다.
  - `BarBucket`에 `mark?: 'unchecked'`를 더한다. 그 칸은 막대 대신 점선 칸(`border-dashed border-st-line-2`)과 칸 위 글 "확인 필요"다.
  - 선택 props: `motion?: boolean`(true면 막대에 `st-move-period`, 빗금 조각에 `st-rise`), `selected?: string`(고른 칸 키 표시), `onPick?: (key: string) => void`(칸을 누름·올림). 주지 않으면 지금 마크업 그대로다(대시보드·preview 그대로).
  - 차트 안에는 hooks가 없다. 고른 칸 상태와 아래 줄 글(`role="status"`)은 통계 칸이 갖는다.
- `InlineBar`: 선택 prop `motion?: boolean`(true면 `st-move-period`). 주지 않으면 지금 마크업 그대로다.
- `ChartLegend`: `LegendItem.mark`에 `'f90'`·`'ret'`(색 칸)·`'rough'`(참고 금액 빗금)·`'unchecked'`(점선 칸)를 더한다. 쌓은 막대 계열 tone을 그대로 범례 표시로 넘길 수 있다(대시보드 미리보기 포함). 지금 표시는 그대로다.
- `DonutChart({ slices: { name, value, tone }[], center: [string, string], motion?: boolean })`: svg 원 조각, `aria-hidden`. 화면 읽기용 값은 범례 글이 맡는다.
- `stats/trendSeries.ts`: `trendSeries(known: boolean): BarSeries[]` — known이면 신환(accent)·90일초진(f90)·재진(ret), 아니면 신환·"재진(90일초진 포함)"(ret). 통계 일별 내원과 대시보드 기간별 흐름이 같이 쓴다. `parts.tsx TREND_SERIES`는 처방 자세히 차트(`RxPickDetail`·`TreatmentDetail`)가 계속 쓰므로 그대로 둔다.

### 5-5. 틀·카드 (`parts.tsx`·`StatsSections.tsx`)
- `StatsCard({ id, title, desc, action, children })`: `section`(`rounded-st bg-surface shadow-st-card`) + h2 + 옆 글 + 오른쪽 자리. `id`는 바로가기 자리이고 `TOC_SCROLL`을 붙인다.
- `StatsCard` 안의 `Section`은 h3 작은 칸으로 그린다(문맥 `CardContext`). 칸 사이는 얇은 선(`border-st-line`)뿐이다. 카드 밖에서 그리는 `Section`(각 칸 시험)은 지금처럼 h2다.
- 카드에 칸이 하나뿐이고 칸 제목이 카드 제목과 같으면(매출·처방·보고) 칸 머리를 따로 그리지 않는다. 칸의 옆 글·오른쪽 단추는 카드 머리 자리에 그린다(지금 탭 패널 방식과 같다). 제목이 두 번 나오지 않는다.
- `HowCounted`는 그대로 쓰고, 긴 설명 글은 그 칸의 "어떻게 세나요?" 안으로 옮긴다(AC-4411.4).
- `StatsSections` 차례(AC-4411.1): 환자 요약 → 매출 요약(`stats-summary` 한 자리) → 환자 카드(일별 내원·재방문율·환자 구성) → 매출 카드 → 처방 카드 → 진료 운영 카드(요일별·시간대별·원장님별, 1200px 이상 30:70) → 보고 카드.
- 화면 바탕: `StatsScreen` 맨 바깥에 `data-st-canvas`를 둔다. `globals.css`의 `#main:has([data-st-canvas])`가 앱 본문 바탕을 `--st-canvas`로 칠한다(인쇄는 흰 바탕). 그래서 1280px보다 넓은 화면도 양옆까지 회색이다. 앱 틀 파일(`AppShell`)은 고치지 않는다. 음수 여백으로 덮지 않는다.
- 바로가기 띠 모양(시안 `.s-nav`): 띠 바탕 `bg-st-canvas`(불투명, 흐림 없음)·아래 선 `border-st-line`. 링크는 알약(`rounded-full`, 높이 36px 이상, 14px·600). 지금 카드 링크는 `bg-st-ink text-white`, 올리면 `bg-st-line`. 초점 고리는 지금 규칙.

### 5-6. 환자 요약 셈 (`view.ts`·`periodPick.ts`)
- `SummaryCell`에 `delta2: { label: string; delta: Delta } | null`(작년 줄)과 칸 키 `first90`을 더한다. `compare` 칸 키는 없앤다.
- 빠르게 보기 합계 증감: 지금 짝(`paired`) 칸끼리 `sum(newPatients)`·`sum(first90)`·`sum(returning)`을 `compareNumbers`로 견준다. 90일초진은 짝 칸 모두 `first90`이 있을 때만.
- 재진 값: 모든 날이 앎이면 `returning` 합, 아니면 `returning + (first90 ?? 0)` 합(AC-4403.3).
- 머리 옆 글의 '과/와'는 `{비교 이름}` 끝 글자 받침으로 고른다(작은 함수 하나).
- `pickReportText` 첫 문장(AC-4403.4)은 `periodPick.ts`.

### 5-7. 매출 요약·스위치·막대 (`summary.ts`·`revenueView.ts`)
- 상태 하나 `revenueMode: 'out' | 'in'`(처음 'out')를 `StatsSections`의 `useState`로 둔다. `RevenueSummary`와 `RevenueSection`에 같은 값과 바꾸는 함수를 내린다. 저장하지 않는다.
- `RoughSwitch({ mode, onChange, days, roughDays })`: `button role="switch" aria-checked`, 이름 "참고 금액 포함", 아래 글 셋(AC-4408.1). 참고 금액이 있는 날이 없으면 `aria-disabled="true"`. 확인 필요한 날이 없으면 그리지 않는다. 두 곳의 이름 id는 `useId`로 따로 만든다.
- `sumPeriod(rows, range, { withRough })`: 'in'이면 확인 필요한 날 가운데 `roughTotal`이 있는 날의 금액과 접수 건수를 더하고 `roughDays: string[]`·`roughSum`을 낸다. 급여·비급여·기타 합에는 넣지 않는다. `workDays`도 그날을 센다.
- 비교 기간도 같은 `withRough`로 센다. 건당 진료비 증감은 `compare(now, before)`의 비율만 쓴다.
- `revenueCells(input, mode)` → 칸 셋(총매출·건당 진료비·확인 필요한 날). `revenueTabs(input, mode)`: 매출 추이·건당 진료비 탭의 막대 칸은 'out'이면 확인 필요한 날을 `mark: 'unchecked'`(값 없음), 'in'이고 참고 금액이 있으면 `'rough'` 계열 막대(값 = 참고 금액). 급여·비급여·기타·치료별 매출 탭은 mode와 상관없다(AC-4408.4). 켜짐 건당 진료비 탭은 막대뿐 아니라 숫자 칸 셋·안내 줄도 켜짐 셈(`perVisitTab(roughCtx, true)`)이라 매출 요약 건당 진료비와 같다. 첫 칸 아래 글에 " · 참고 금액 포함"을 붙이고 [어떻게 세나요?] 둘째 문단만 켜짐 글로 바꾼다(사용자 결정 2026-11-15: 한 화면에 같은 이름 두 숫자가 보이지 않게).

- 검토 보완(2026-11-15, AC-4408.1~4408.4): 켜짐 스위치 글에 빠진 날 수("참고 금액 {m}일 포함 · {k}일 금액 미확인"), 눌리지 않는 글은 저장된 자료 기준, 총매출 아래 비교 기간 빠진 날 줄, 음수 참고 금액 막대는 0 쪽 버림·하루 칸은 빗금 계열, 켜짐 매출 추이 [어떻게 세나요?] 둘째 문단, 켜짐 급여·비급여·기타·치료별 매출 맨 위 안내. `RoughTabs`에 켜짐 두 탭 안내 글(`outside: string`)을 더하고 `RevenueSection`이 켜짐일 때만 그 두 탭에 그린다. `StackedBarChart`는 음수 값의 높이를 0%로 자른다(지금 양수 칸 마크업은 같다).

### 5-8. 신환이 그 처방을 받은 횟수 (`onceView.ts`·`RxPickOnce.tsx`)
- `onceView(days, code, range, today)` → `{ rows: { month, label, sub, counting, newPatients, once: number | null }[], total: { newPatients, once: number | null }, missing: boolean }`.
- `label`: 첫 줄·1월은 'YYYY년 M월', 그 밖 'M월'. `sub`: '(13일까지)' · '(15일부터)' · '(7일 – 13일)' · null. `counting`: 오늘 달 또는 그 앞 달.
- 비율은 `Math.floor(once / newPatients * 1000) / 10`. 2회 이상 = 신환 − 1회.
- 부품은 100% 가로 막대 두 갈래(`bg-accent`·`bg-st-ink`)이고 막대 안에 인원 숫자. 2회 이상은 처음 `bg-st-ret`(흰 글자 대비 약 3.5:1)였으나 사용자 결정(2026-11-15 "더 진한 색으로")으로 `bg-st-ink`(약 14:1)로 바꿨다. `st-ret`는 재진 계열 색으로 그대로 둔다. 집계 중이면 막대 바탕을 옅은 색으로 바꾸고 숫자를 진하게 한다: 1회 `bg-st-h2`, 2회 이상 `bg-st-line-2`, 숫자 `text-st-ink`(대비 약 8.8:1·9.3:1). 처음은 막대 전체 `opacity-55`였으나 최근 30일에서는 두 달 모두 집계 중이라 숫자가 늘 흐려서 바꿨다(사용자 결정 2026-11-15 "옅은 바탕 + 진한 숫자"). `RxPickerSection`이 '같은 처방 재방문' 아래에 놓고, 고른 처방은 React 상태(처음 첫째)다.

### 5-9. 대시보드 (`components/dashboard/summary/*`)
- `todayView.counts.first90: number | null`.
- `DailySection` `KPI_CELLS` 5칸.
- `reportSentence` 둘째 문장(AC-4404.2).
- `FlowSection`·`flow.ts`는 세 갈래면 `trendSeries(true)`를 쓴다. 두 갈래(`TWO_SERIES`)는 색(`accent`·`chart-3`)을 그대로 두고 둘째 이름만 "재진(90일초진 포함)"이다(AC-4404.3, 2026-11-15 검토 보완). 대시보드 모양·움직임은 바꾸지 않는다(`motion` 주지 않음).

## 6. 결정과 이유
- 1회 신환은 도우미를 고치지 않고 Worker에서 센다. 진료 줄(환자 번호·날·코드·첫 내원일)이 이미 Worker 메모리에 있고, 첫 내원일 뒤의 날은 모두 불러온 범위 안에 있어서다. 옛 도우미(0.6.0)로도 된다.
- 90일초진은 접수 수 기준이다. 지금 통계의 환자 수가 접수 건수라서 같은 기준으로 맞췄다.
- `schemaVersion`은 올리지 않는다. 올리면 DB CHECK 때문에 SQL이 필요하다. 새 열쇠는 선택이고, 없으면 '못 셈'으로 그린다.
- 통계 화면 모양은 승인된 시안(둥근 카드·옅은 그림자·1100/1200/380px 경계·큰 숫자·차트 움직임)을 따른다. 지금 디자인 규칙과 부딪히는 곳은 통계 화면 파일에서만 예외로 적고 시험으로 묶는다(5-2). 다른 화면은 지금 규칙 그대로다.
- 움직임은 CSS만으로 한다. 차트 부품에 클라이언트 코드를 넣지 않는 지금 규칙을 지키기 위해서다.
- 매출 요약을 환자 요약과 다른 부품으로 나눈다. 스위치와 강조 움직임이 매출 줄에만 있어서다.

## 7. 위험
1. **판 차례**: 새 도우미(v4·roughTotal)를 운영 웹(v2·v3만 받음)에 쓰면 통계 불러오기가 실패한다.
   - 웹을 먼저 배포한 뒤 도우미를 설치한다.
   - SQL을 먼저 붙인다. 안 붙인 채로 새 웹을 올리면 새 웹이 없는 `rough_total` 칸을 읽으려다 실패해 매출 칸이 읽기 실패로 나온다(옛 저장 함수는 모르는 칸을 무시해 저장은 된다).
2. **1회 신환이 낡을 수 있음**: 지난 날 칸의 `once`는 그 날을 불러온 때의 자료 끝날까지 센 값이다. 그 뒤 그 날을 다시 불러오지 않으면, 그동안 다시 온 환자도 1회로 남는다. 최근 두 달뿐 아니라 오래된 달도 그렇다. 옆 글·아래 글(AC-4410.1·4410.3)로 알리고, '최근 2년' 다시 불러오기로 맞춘다. 2년보다 오래된 날은 조각으로 나눠 읽어 끝까지 셀 수 없어 비운다(AC-4409.3). 날마다 '셌던 끝날'을 저장해 보이는 일은 하지 않았다(후속 제안).
5. **웹만 되돌리기(b0280b3 등)**: 옛 웹은 도우미 0.7.0의 통계 답(`first90`·`once` 열쇠)과 매출 답(`roughTotal`)을 열쇠를 정확히 맞춰 보다가 거부하고, 새 웹이 저장한 통계 날 줄도 읽을 때 버린다. 그래서 웹을 되돌릴 때는 도우미도 0.6.0으로 되돌리고, 그 사이 저장된 기간을 다시 불러와야 한다. 그러면 그 기간의 90일초진 구분과 참고 금액이 사라진다(재진에 90일초진이 다시 들어가 숫자 뜻은 맞다). DB 칸 `rough_total`은 옛 웹이 읽지 않아 그대로 둬도 된다.
6. **옛 도우미로 다시 불러오기**: 0.7.0 뒤에 0.6.0으로 같은 기간을 불러오면 그 기간 날 줄이 v3로 덮여 90일초진 구분이 사라진다(재진에 다시 들어가 합은 맞다). 막지 않고, 환자 요약의 0.6.0 안내로 알린다. 매출 참고 금액은 0.7.0이 다시 연결되면 한 번 다시 읽어 되살린다(REQ-4407).
3. **참고 금액 포함 비교**: 비교 기간에 참고 금액이 없는 확인 필요한 날이 있으면 두 기간의 기준이 조금 다르다. 그런 날은 지금처럼 빠진다.
4. **화면 고침 범위가 넓음**: 칸마다 지금 시험이 많다. 지금 시험의 글·구조 기대값은 이 명세가 바꾸는 것만 고치고, 계산 시험은 고치지 않는다. 대시보드·preview가 같이 쓰는 `StackedBarChart`는 새 props를 주지 않으면 마크업이 같아야 한다.

## 8. 시안과 다른 곳 (기본값)
- 옛 도우미 상태의 처방 표: 첫 시안은 "도우미가 예전 판이라…" 안내였다. Worker가 세므로 옛 도우미로도 막대가 나온다. 이 기능 전에 저장한 날만 AC-4410.4 글이 나온다.
- 보고 미리보기의 "90일초진 6명"은 예다. 일일·월말보고 글은 이번에 바꾸지 않는다(범위 밖).
- 시안의 굵기 700은 600으로 그린다(글꼴 파일이 600까지).
- 보고 미리보기 아래 흐려지는 덧칠은 없다(그라데이션 금지). 네 줄에서 자른다.
- 빗금은 CSS 그라데이션이 아니라 svg 무늬로 그린다. 보이는 모양은 같다.
- 빈 자료 글은 시안의 "이 기간에 불러온 자료가 없어요. …"가 아니라 지금 칸마다의 글 그대로다(파일로 넣은 자료일 때도 맞게).
- 지금 칸의 긴 설명 글(원장님별·시간대별·처방 추세 등)은 지우지 않고 "어떻게 세나요?" 안에 둔다. 시안에는 그 접는 칸이 그려져 있지 않다.
- 시간대별 `[자세히]` 합계 표, 처방 표 열기·고치기, 고른 기간 비교 칸은 시안에 없지만 그대로 둔다.
- 바로가기 띠의 기간 글은 시안대로 없앤다. 기간은 기간 줄에서 본다.
- 신환이 그 처방을 받은 횟수: 첫 시안의 "어떻게 세나요?" 다섯 줄은 개선 시안에 없어 뺀다. 시안은 최근 12개월 예이고, 달은 보는 기간을 따른다.
- 신환이 그 처방을 받은 횟수의 기간 앞 일부 달 글("(15일부터)")과 한 달 안 기간 글("(7일 – 13일)")은 시안에 없어 정했다.
- 환자 요약 증감: 고른 기간은 날 수가 달라 합계 증감을 내지 않고 하루 평균 칸에만 둔다(시안은 빠르게 보기만 있다).
- 옛 도우미 글의 판 번호 "0.6.0"은 지금 운영 도우미 판이다. 시안 글 그대로 쓴다.
- 대시보드 칸 아래 글: 첫 시안의 "그날 처음 온 분"·"90일 넘어 다시 온 분"은 넣지 않는다. 지금 대시보드처럼 아래 글이 없다. 단, 모르는 경우의 "새 도우미(0.7.0)면 나와요"·"90일초진 포함"은 넣는다.
- 대시보드 흐름 막대 색은 통계 일별 내원과 같은 새 색(신환 `--accent`, 90일초진 `--st-f90`, 재진 `--st-ret`)이다.
