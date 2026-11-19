# 설계: 확인 필요 없이 비트 총진료비로 (bit-total)

## 1. 한 규칙을 어디에 두나 (정한 것)
- **규칙**: 그날 매출 = `total ?? roughTotal`(둘 다 없으면 null). `src/lib/revenue/summary.ts`(매출 숫자의 뜻을 정하는 순수 모듈, 환자 자료 구역 아님)에 둔다.
  ```ts
  /** 그날 매출(bit-total AC-6901.1). 0·음수 그대로 */
  export function dayRevenue(row: Pick<RevenueDayRow, 'total' | 'roughTotal'>): number | null
  /** dayRevenue가 숫자인 날만 { day, value } (goalPace의 DayValue와 같은 모양, AC-6901.2) */
  export function revenueDayValues(rows: readonly Pick<RevenueDayRow, 'date' | 'total' | 'roughTotal'>[]): { day: string; value: number }[]
  ```
- **읽는 곳(경계)에서 줄을 고쳐 쓰지 않는다** — 줄은 저장된 그대로 두고, 세는 곳이 이 규칙을 부른다. 까닭:
  1. `loadDays`의 답은 [비트에서 불러오기]의 다시 읽기 표시(`savedMark`, first90 AC-4407.1)에도 쓰인다. unconfirmed·roughTotal을 지우면 옛 날을 다시 읽지 못한다.
  2. 도우미 답(`lib/bridge/revenueResult`)은 그대로 sales_days에 저장된다. total을 채우면 DB 제약(rough_total은 total이 null일 때만)과 짝 검사(unconfirmed ⇔ 금액 아홉 칸 null)에 걸린다 — DB를 바꾸지 않기로 했다.
  3. 'unconfirmed를 거짓 + splitUnconfirmed 참 + total = rough'로 바꾸면 `types/revenue.ts`의 약속(splitUnconfirmed면 total·cash·card·transfer·receivableIn 다섯 칸은 숫자)을 깬다(입금 네 칸은 여전히 null).
- **쓰는 곳**: 매출 요약·매출 칸(`sumPeriod`), 이번 달 목표·월간 보고서(`revenueDayValues`), 업무일지(`bitValuesFrom`). 보고 문장은 날 줄이 아니라 도우미 보고 벌이라 같은 기준의 원장님 금액 줄(doctorDays)로 센다(5절).

## 2. 매출 요약·매출 칸 (TASK-5)
- `lib/revenue/summary.ts` `sumPeriod(rows, range)`:
  - `options.withRough`·`roughDays`·`roughSum`·`uncheckedDays`를 없앤다. 금액이 null인 날(`dayRevenue` null = 확인 필요 + roughTotal 없음)은 줄이 없는 날처럼 건너뛴다(내원도 세지 않음, AC-6906.1).
  - 금액이 있는 날: `days += 1`, `total += dayRevenue`, 접수 건수를 알면 건당 짝(perVisitTotal·perVisitCount), 모르면 noVisitDays, `splitDay`가 null이면 noSplitDays(확인 필요 날은 `splitDay`가 늘 null이라 나눔을 못 한 날이 된다, AC-6905.4).
  - `isWorkDay(row) = dayRevenue(row) !== null && !isAllZero(row)`.
  - `null`(자료 없음) = 센 줄이 없거나, 나눔을 못 한 날 없이 모두 쉬는 날.
- `components/stats/revenueView.ts`:
  - `contextOf`의 `byDay`는 `dayRevenue`가 null인 날을 뺀 줄로 만든다 → `savedAll`이 그날을 '저장 안 한 날'로 보아 견주지 않고, 날 칸 아래 글이 '…아직 불러오지 않은 날…'이 된다(AC-6906.1).
  - `revenueCells(input)`: 인자 `mode` 없음, 칸 둘(`key: 'total' | 'perVisit'`), `tone: 'ink' | 'none'`, `tag` 없음. `RevenueMode`·`RoughInfo`·`roughInfo`·`roughOf`·`uncheckedNotes`·`comparedMissing`·`comparedNote`·`outsideNote`·켜짐 글 모두 지운다.
  - `RevenueTabs` ready = `{ trend, split, treatments, perVisit }`(`rough` 없음). `TrendTab`에 `tag` 없음.
  - 막대 값 `BarValue = number | null`(계열 하나, `mark: 'unchecked'` 안 씀), 범례는 늘 빈 배열, 아래 줄 글 `{when} {kind.text(sum)}`. 음수는 지금처럼 `toZero`.
  - `barNote`: 날 칸 = CLOSED_NOTE | CLOSED_OR_UNSAVED_NOTE, 주·달 칸 = 끝나지 않은 달 빗금 글만.
  - 글: `trendHow` 세 문단(AC-6905.3), `perVisitHow` 한 문단, `SPLIT_DAY_BARS`·`splitSpanBars`에서 '확인 필요한 날과 ' 빼기, `LABELS.unchecked` 지우기.
- `sections/RevenueSummary.tsx`: props `{ cells }`만. 스위치·250ms 강조 없음. 격자 PC `grid-cols-5`(총매출 `col-span-3`, 건당 `col-span-2` + 왼쪽 선), 768px 미만 `grid-cols-1`(총매출 아래 선).
- `sections/RevenueSection.tsx`: props `mode`·`onMode`·`rough` 없음, `RoughSwitch`·꼬리표(`ROUGH_TAG`·`TAG`)·`outside` 없음, 막대는 늘 `tabs.trend`·`tabs.perVisit`.
- `sections/StatsSections.tsx`: `mode` 상태·`roughInfo` 없음, `revenueCells(revenueIn)`.
- `sections/RoughSwitch.tsx`·`RoughSwitch.test.tsx`: 지운다(쓰는 곳이 없다).
- `sections/PeriodSummary.tsx`: `HELPER_LEAD` 글만(AC-6907.1). 그 시험 파일의 두 스위치 묶음 시험(first90 AC-4408.1)은 '스위치가 없다' 시험으로 바꾼다.
- 차트 부품·SummaryCell·globals.css는 그대로 둔다(범위 밖, 안 쓰는 모양이 남는다).

## 3. 이번 달 목표·월간 보고서 (TASK-8)
- `components/stats/useStatsGoals.ts` `readRevenue`, `components/stats/report/useReportReads.ts` `readSales`: `days.flatMap(… row.total === null …)` → `revenueDayValues(days)`. 머리 주석의 '총액이 빈 날은 뺀다'를 새 규칙으로 고친다.
- `components/stats/report/reportData.ts`: 매출 글 세 곳(한 달 요약·목표·달라진 것)만 `formatManWon` → `formatWon`(`@/components/revenue/money`). 신환 1명당 칸은 `formatManWon` 그대로(AC-6902.4).

## 4. 원장님별·수납일지 (TASK-3)
- `sections/DoctorsSection.tsx`: `FOOT` 끝 문장 지우기, `FOOT_NOW`와 그 줄 지우기.
- `components/sunap/SunapScreen.tsx`: `view?.unsure === true` 알림 줄 지우기. `unsure`는 답·장부 모양에 그대로 남는다(쓰지 않을 뿐, `lib/sunap`·`workers/sunap`은 그대로).

## 5. 원장님 보고 문장 (TASK-6)
- 보고 숫자는 도우미 보고 벌(`stats.rows`의 `report`)이고, 금액 확인 필요 벌은 도우미가 금액을 0으로 둔다(`StatsReport.SetFinanceUnconfirmed`). 도우미를 바꾸지 않으므로 같은 답의 원장님 금액 줄 `extra.doctorDays`(도우미 `DoctorMoneyNormalSql`·`DoctorMoneyReceivableSql` = 보고 금액과 같은 NativeRows를 수납일·진료의로 묶은 OrpTotAmt 합 = rough_total·원장님별과 같은 기준)로 그 기간 총진료비를 센다.
- `types/clinicReport.ts`: ok 벌에 `bitTotal?: number`(웹 Worker가 단 것, 확인 필요 벌이고 기간을 다 덮을 때만). `ClinicReportResult`의 글 벌에서 `unconfirmedLines`를 지운다.
- `workers/stats/jobs.ts`:
  ```ts
  /** AC-6908.1: 확인 필요 벌에만 bitTotal. range = 불러온 범위, days = toStatsExtra의 doctorDays(없으면 null → 그대로) */
  export function withBitTotals(report: StatsLoaded['report'], days: readonly DoctorDay[] | null, range: DateRange): StatsLoaded['report']
  ```
  `loadJob`이 `toStatsExtra` 뒤에 `view.report = withBitTotals(data.report, extra?.doctorDays ?? null, { from, to })`. 화면에는 합 하나만 간다(원장님별 줄은 Worker 안).
- `lib/clinicReport/reportText.ts`: `addMoney` 대신 확인 필요 벌은 '–'·bitTotal 글(AC-6908.2), 안내(AC-6908.3), 도우미 안내 바꾸기 표(정확히 같은 글 두 개, AC-6908.4). '확인 필요' 상수·사유 줄 지우기.
- `sections/ReportSection.tsx`: `dateLine`의 ' · 금액 확인 필요'와 노란 줄(`Shown.unconfirmed`) 지우기. ok false 벌(`Unconfirmable`)은 그대로.
- 골든(`fixtures/stats/golden/report-*.json`, 원본 양지바른 글): 파일은 그대로 두고, `reportText.test.ts`의 '원본과 같은 글' 비교(AC-510.1)는 확인 필요가 아닌 사례만 돈다. 확인 필요 사례 셋(daily-unconfirmed·daily-zero-visits-unconfirmed·monthly-unconfirmed)은 같은 입력으로 이 명세 글(AC-6908.2·AC-6908.3)을 본다 — 일부러 원본과 달라졌기 때문이다.

## 6. 업무일지 (TASK-7)
- `lib/worklog/bitFill.ts` `bitValuesFrom(row)`: `totalFee`는 `dayRevenue(row)`에서, 확인 필요 날의 나머지 금액 다섯 칸은 지금처럼 채우지 않는다. 돌려주는 `unconfirmed = row.unconfirmed && dayRevenue(row) === null`(= 금액을 하나도 못 채운 날). `useBitFill`은 그대로(그 값으로 상태 'unconfirmed'/'ready'를 정한다).
- `components/worklog/BitNotice.tsx`: `NOTICE_TEXT.unconfirmed` = '이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요'.
- 나머지 다섯 칸이 비었다는 따로 안내는 두지 않는다("확인필요 구분없이").

## 7. 신환 1명당 매출 = 그 달 신환 (TASK-4)
- `types/stats.ts`: `export type MonthValue = PatientValue & { month: string; to: string }`. `BitSectionsView` ready의 `value?: PatientValue` → `values?: MonthValue[]`(이름을 바꿔 옛 값을 쓰는 곳이 컴파일에서 드러나게).
- `lib/analytics/patientValue.ts`(환자 자료 구역, 순수): `patientValue` → 
  ```ts
  export type ValueDay = { patient: number; date: string; firstVisit: boolean } // PatientDay가 그대로 들어온다
  export type MonthValueInput = { days: readonly ValueDay[]; rows: readonly ValueRow[]; pays: readonly ValuePay[]; groups: readonly RxGroupDef[]; range: DateRange }
  export function monthValues(input: MonthValueInput): MonthValue[]
  ```
  달마다 대상 표를 새로 만든다(대상 = 그 달 `firstVisit`이 참인 접수 줄의 환자). 금액·내원·처방은 그 달 기간 안 줄만. 조합·줄 규칙(MIN_PEOPLE 5·MAX_LINES 5·'그 밖')과 나누기 규칙(`per`·`perOne`)은 그대로. `first`(가장 이른 신환 날) 입력과 SPAN 90은 지운다.
- 신환 날 표시: Worker `toPatientDays`의 `firstVisit`(v5 답 = 그 환자·날 접수에 비트 신환 표시가 있음, spec new-mark) — 통계 탭 '신환'과 같은 표시다. 금액 줄은 0.11.0의 v5 답에만 있으므로 이 셈은 늘 v5 표시를 쓴다.
- **두 달에 표시가 있으면 두 달 모두**(AC-6911.2): 통계 탭 그 달 '신환' 수가 그 표시로 세므로 같은 사람을 그 달 신환으로 본다. '가장 이른 달만'으로 하면 통계 탭이 그 달 신환으로 센 사람이 1명당 매출에서는 빠져 두 숫자가 어긋난다.
- `workers/stats/jobs.ts`: `valueOf` → `valuesOf(bit, pays): MonthValue[]`(WeakMap으로 메모리마다 한 번), `sectionsJob`이 `view.values = valuesOf(...)`.
- `sections/PatientValueSection.tsx`: `values.at(-1)`을 그린다(AC-6911.4). 칸 위 줄은 `month`·`to`로 만든다. 금액 글 `wonText` 그대로.
- `report/reportData.ts`: `ready?.values?.find((v) => v.month === month)`, 칸 이름에서 '(90일)'을 지운다(AC-6911.5).

## 8. 자료 흐름
1. [비트에서 불러오기] → 도우미 답 → 저장(지금 그대로, 확인 필요 날은 total null + rough_total).
2. 통계 탭: `loadDays` → (그대로) → `revenueView`/`sumPeriod`가 `dayRevenue`로 센다. 목표·보고서는 `revenueDayValues`.
3. Worker: `loadJob`이 보고 벌에 `bitTotal`을 달고, `sectionsJob`이 달마다 신환 1명당 값을 낸다(합·평균 숫자만).
4. 업무일지: 도우미 `revenue.days` 하루 줄 → `bitValuesFrom` → 총진료비 칸.

## 9. 시험 (바뀌는 옛 시험 포함)
- TASK-2: `summary.test.ts`에 dayRevenue·revenueDayValues.
- TASK-3: `DoctorsSection.test.tsx`(AC-2706.4·AC-4414.4 글 시험을 새 글로), `SunapScreen.test.tsx`(AC-4905.9 시험을 '줄 없음'으로).
- TASK-4: `patientValue.test.ts`(달 셈으로 다시), `jobs.test.ts`(value → values), `PatientValueSection.test.tsx`, `RevenueSection.test.tsx`(다섯째 탭 고정값 `value` → `values`, 칸 이름), `reportData.test.ts`(BIT 고정값·칸 이름).
- TASK-5: `summary.test.ts`(sumPeriod·withRough 시험 정리), `revenueView.test.ts`(켜짐·꺼짐·점선·빗금 시험을 새 셈으로), `RevenueSummary.test.tsx`, `RevenueSection.test.tsx`(스위치·꼬리표·outside), `PeriodSummary.test.tsx`(두 스위치 묶음 시험·안내 글), `RoughSwitch.test.tsx`(지움), `StatsScreen.test.tsx`(매출 요약 칸 셋 → 둘).
- TASK-6: `jobs.test.ts`(withBitTotals), `reportText.test.ts`(AC-510.2 시험·골든 비교 범위), `ReportSection.test.tsx`(AC-513.6 시험).
- TASK-7: `bitFill.test.ts`, `BitNotice.test.tsx`·`WorklogScreen.test.tsx`(안내 글), `useBitFill.test.tsx`(roughTotal 있는 날 = ready).
- TASK-8: `useStatsGoals.test.ts`, `reportData.test.ts`·`ReportSection.test.tsx`·`StatsScreen.test.tsx`(보고서 매출 '만 원' → 원 단위, roughTotal 있는 날 더함).
- 손대지 않는 시험(같은 말이 고정값으로만 나온다): 차트 부품·SummaryCell·parts·storage·sync·bridge·handshake·helperData·useStatsRevenue·globals.

## 10. 위험 — 합이 총매출과 맞지 않을 수 있는 곳 (사용자에게 알린다)
1. **매출 칸 '급여·비급여·기타' 탭**: 그런 날은 나눔이 없어 셋의 합(과 '합계' 줄)이 총매출보다 작다. 지금 있는 '…나눔을 못 해서 이 표에서 빠졌어요. 매출 합계에는 들어 있어요.' 한 줄에 그날이 나온다. 그 탭 막대에도 그날 겹이 없다.
2. **치료별 매출 탭**: 원래 처방 금액 기준이라 총매출과 다르다(지금 그대로). 옛 '참고 금액 … 합이 총매출과 달라요.' 줄이 없어진다.
3. **원장님 보고 문장**: 그런 날·달은 총진료비(와 건당진료비)만 있고 조합청구액·입금액(현금·카드·계좌이체)·비급여는 '–'다. 지난달 월말보고는 불러올 기간이 지난달 1일을 덮지 않으면 총진료비도 '–'.
4. **업무일지**: 그런 날은 총진료비만 채워지고 조합청구액·현금·카드·계좌이체·미수입금 칸은 비어 있다(따로 안내 없음). 시재 추측(비트 현금)도 그날은 없다(지금과 같음).
5. **수납일지 장부**: 그런 날은 장부 금액이 비트와 다를 수 있는데, 이제 알리는 줄이 없다.
6. **음수인 날**(환불이 더 많은 날): 그날 매출이 음수로 들어가 총매출·하루 평균을 줄인다. 막대는 높이 0에 칸 위 숫자만 음수.
7. **금액을 모르는 옛 날**(도우미 0.7.0 전에 저장된 확인 필요 날): '아직 불러오지 않은 날'처럼 빠져 그 기간은 견주지 않는다('비교할 자료가 없어요'). 그 기간을 다시 [비트에서 불러오기]하면(도우미 0.7.0 이상) 채워진다.
8. **매출 요약 vs 원장님별**: 이제 같은 기준이지만, 원장님별은 불러온 오늘(진료 중) 줄을 넣고 매출 요약은 마지막 끝난 날까지라 오늘이 든 기간은 다를 수 있다(지금도 그렇다).
9. **월간 보고서와 이번 달 목표 칸**: 같은 셈이지만 글 모양이 다르다(보고서 원 단위, 목표 칸 만 원).
10. **도우미 안내 바꾸기**: 정확히 같은 글만 바꾼다. 다른 판의 도우미가 글을 조금 다르게 주면 그 글은 그대로 보인다.
11. **신환 1명당 매출**: (a) 그 달 늦게 온 신환일수록 그 달 안 날이 적어 평균이 작게 잡힌다(정의가 그렇다). (b) 이번 달은 자료 끝 날(진료 중 오늘 포함)까지라 보고서의 다른 이번 달 숫자(어제까지)와 하루 어긋날 수 있다. (c) 인원 n은 서로 다른 환자 수라, 한 달에 신환 표시가 두 날인 사람이 있으면 통계 탭 '신환' 수(날마다 센 접수 줄)와 조금 다를 수 있다. (d) 불러온 범위가 그 달 1일을 덮지 않으면 그 달은 세지 않는다(최근 7일 불러오기면 이번 달도 없을 수 있다 — '그 달 1일부터 불러오면 볼 수 있어요').
