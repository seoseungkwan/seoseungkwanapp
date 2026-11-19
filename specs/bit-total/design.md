# 설계: 확인 필요 없이 비트 총진료비로 (bit-total)

## 0. 큰 그림 (2026-11-19 사용자 답 반영)
- **새 자료(도우미 0.13.0)**: 도우미가 그런 날·달도 보통 날처럼 금액을 다 읽는다(10절). 웹에 오는 줄·보고 벌은 그냥 확인된 날이다 → 매출 요약·막대·급여·비급여·기타·보고 문장(비급여 포함)·업무일지(현금·카드 포함)가 모두 보통 날처럼 채워진다.
- **옛 자료(0.13.0 전에 저장된 sales_days 줄, 0.13.0 전 도우미의 답)**: 웹이 `total ?? roughTotal`로 그날 매출을 정한다(1절). 나눌 수 없는 칸은 비워 두고 '확인 필요' 말은 쓰지 않는다.
- **넘어가기**: 0.13.0으로 [비트에서 불러오기]를 하면 옛 확인 필요한 날을 한 번 다시 읽는다(11절).

## 1. 한 규칙을 어디에 두나 (정한 것)
- **규칙**: 그날 매출 = `total ?? roughTotal`(둘 다 없으면 null). `src/lib/revenue/summary.ts`(매출 숫자의 뜻을 정하는 순수 모듈, 환자 자료 구역 아님)에 둔다.
  ```ts
  /** 그날 매출(bit-total AC-6901.1). 0·음수 그대로 */
  export function dayRevenue(row: Pick<RevenueDayRow, 'total' | 'roughTotal'>): number | null
  /** dayRevenue가 숫자인 날만 { day, value } (goalPace의 DayValue와 같은 모양, AC-6901.2) */
  export function revenueDayValues(rows: readonly Pick<RevenueDayRow, 'date' | 'total' | 'roughTotal'>[]): { day: string; value: number }[]
  ```
- **읽는 곳(경계)에서 줄을 고쳐 쓰지 않는다** — 줄은 저장된 그대로 두고, 세는 곳이 이 규칙을 부른다. 까닭:
  1. `loadDays`의 답은 [비트에서 불러오기]의 다시 읽기 표시(`savedMark`)에도 쓰인다. unconfirmed·roughTotal을 지우면 옛 날을 다시 읽지 못한다.
  2. 도우미 답(`lib/bridge/revenueResult`)은 그대로 sales_days에 저장된다. total을 채우면 DB 제약(rough_total은 total이 null일 때만)과 짝 검사(unconfirmed ⇔ 금액 아홉 칸 null)에 걸린다 — DB를 바꾸지 않기로 했다.
  3. 'unconfirmed를 거짓 + splitUnconfirmed 참 + total = rough'로 바꾸면 `types/revenue.ts`의 약속(splitUnconfirmed면 total·cash·card·transfer·receivableIn 다섯 칸은 숫자)을 깬다.
- **쓰는 곳**: 매출 요약·매출 칸(`sumPeriod`), 이번 달 목표·월간 보고서(`revenueDayValues`), 업무일지(`bitValuesFrom`). 보고 문장은 날 줄이 아니라 도우미 보고 벌이라 도우미 쪽에서 채운다(5·10절).

## 2. 매출 요약·매출 칸 (TASK-5)
- `lib/revenue/summary.ts` `sumPeriod(rows, range)`:
  - `options.withRough`·`roughDays`·`roughSum`·`uncheckedDays`를 없앤다. 금액이 null인 날(`dayRevenue` null = 확인 필요 + roughTotal 없음)은 줄이 없는 날처럼 건너뛴다(내원도 세지 않음, AC-6906.1).
  - 금액이 있는 날: `days += 1`, `total += dayRevenue`, 접수 건수를 알면 건당 짝(perVisitTotal·perVisitCount), 모르면 noVisitDays, `splitDay`가 null이면 noSplitDays(옛 확인 필요 날은 `splitDay`가 늘 null이라 나눔을 못 한 날이 된다, AC-6905.4).
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
- `components/sunap/SunapScreen.tsx`: `view?.unsure === true` 알림 줄 지우기. `unsure`는 답·장부 모양에 그대로 남는다(쓰지 않을 뿐, `lib/sunap`·`workers/sunap`·도우미 `SunapTargets`는 그대로).
- **도우미 수납일지 쪽은 고치지 않는다(최소안)**: `unsure`는 답 v:3의 필수 칸이라 빼면 답 판·웹 검사까지 바꿔야 한다. 세 검사는 수납일지 답에서 `unsure` 하나만 정하고 장부 금액(환자 줄·미수 입금)은 원래 그 검사와 상관없이 다 보낸다 → 장부 숫자는 0.13.0에서도 같다.

## 5. 원장님 보고 문장 (TASK-6, 웹)
- 0.13.0 도우미는 보고 벌을 늘 금액까지 채워 보낸다(AC-6912.4) → 웹 글은 확인된 벌과 같은 길(AC-6908.1, 지금 코드 그대로 — 시험만 더함). 비급여·입금액 모두 보인다.
- 0.13.0 전 도우미의 financeUnconfirmed 벌만 웹이 다룬다(설치 전까지의 잠깐):
  - `lib/clinicReport/reportText.ts`: '확인 필요' 상수·`※` 사유 줄·`unconfirmedLines`를 지우고 금액 줄 일곱(월말 넷)을 '–'로(AC-6908.2). 웹 안내는 AC-6908.3 글. 도우미 안내 바꾸기 표(정확히 같은 글 두 개, AC-6908.4) — 새 글은 0.13.0 도우미의 금액 안내(AC-6912.5)와 같다.
  - `types/clinicReport.ts`: `ClinicReportResult`의 글 벌에서 `unconfirmedLines`를 지운다.
  - `sections/ReportSection.tsx`: `dateLine`의 ' · 금액 확인 필요'와 노란 줄(`Shown.unconfirmed`) 지우기. ok false 벌(`Unconfirmable`)은 그대로.
- **지난 시안에서 바꾼 것**: Worker가 원장님 금액 줄로 총진료비를 더해 주는 `bitTotal`은 만들지 않는다. 도우미가 금액을 다 주므로 쓸 곳이 '0.13.0 설치 전'뿐이고, 그때는 '–' + 도우미를 올리라는 안내로 충분하다(`workers/stats/jobs.ts`를 이 TASK에서 건드리지 않음).
- 골든(`fixtures/stats/golden/report-*.json`, 원본 양지바른 글): 파일은 그대로 두고, `reportText.test.ts`의 '원본과 같은 글' 비교(AC-510.1)는 확인 필요가 아닌 사례만 돈다. 확인 필요 사례 셋(daily-unconfirmed·daily-zero-visits-unconfirmed·monthly-unconfirmed)은 같은 입력으로 이 명세 글(AC-6908.2·AC-6908.3)을 본다 — 일부러 원본과 달라졌기 때문이다.

## 6. 업무일지 (TASK-7)
- 0.13.0 도우미의 revenue.days는 그런 날도 보통 날이다 → 지금 코드 그대로 여덟 칸(신환·재진·총진료비·조합청구액·현금·카드·계좌·미수입금)을 채운다("현금 카드 채워").
- 옛 도우미 답(또는 0.13.0에서 금액이 음수라 unconfirmed + roughTotal인 날): `lib/worklog/bitFill.ts` `bitValuesFrom(row)`의 `totalFee`는 `dayRevenue(row)`에서, 나머지 금액 다섯 칸은 지금처럼 채우지 않는다. 돌려주는 `unconfirmed = row.unconfirmed && dayRevenue(row) === null`(= 금액을 하나도 못 채운 날). `useBitFill`은 그대로(그 값으로 상태 'unconfirmed'/'ready'를 정한다).
- `components/worklog/BitNotice.tsx`: `NOTICE_TEXT.unconfirmed` = '이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요'.

## 7. 신환 1명당 매출 = 그 달 신환 (TASK-4)
- `types/stats.ts`: `export type MonthValue = PatientValue & { month: string; to: string }`. `BitSectionsView` ready의 `value?: PatientValue` → `values?: MonthValue[]`(이름을 바꿔 옛 값을 쓰는 곳이 컴파일에서 드러나게).
- `lib/analytics/patientValue.ts`(환자 자료 구역, 순수): `patientValue` →
  ```ts
  export type ValueDay = { patient: number; date: string; firstVisit: boolean } // PatientDay가 그대로 들어온다
  export type MonthValueInput = { days: readonly ValueDay[]; rows: readonly ValueRow[]; pays: readonly ValuePay[]; groups: readonly RxGroupDef[]; range: DateRange }
  export function monthValues(input: MonthValueInput): MonthValue[]
  ```
  달마다 대상 표를 새로 만든다(대상 = 그 달 `firstVisit`이 참인 접수 줄의 환자). 금액·내원·처방은 그 달 기간 안 줄만. 조합·줄 규칙(MIN_PEOPLE 5·MAX_LINES 5·'그 밖')과 나누기 규칙(`per`·`perOne`)은 그대로. `first`(가장 이른 신환 날) 입력과 SPAN 90은 지운다.
- 신환 날 표시: Worker `toPatientDays`의 `firstVisit`(v5 답 = 그 환자·날 접수에 비트 신환 표시가 있음, spec new-mark) — 통계 탭 '신환'과 같은 표시다. 금액 줄은 0.11.0 이상의 v5 답에만 있으므로 이 셈은 늘 v5 표시를 쓴다.
- **두 달에 표시가 있으면 두 달 모두**(AC-6911.2, 사용자 "두 달 모두 세기 (추천)"): 통계 탭 그 달 '신환' 수가 그 표시로 세므로 같은 사람을 그 달 신환으로 본다.
- `workers/stats/jobs.ts`: `valueOf` → `valuesOf(bit, pays): MonthValue[]`(WeakMap으로 메모리마다 한 번), `sectionsJob`이 `view.values = valuesOf(...)`.
- `sections/PatientValueSection.tsx`: `values.at(-1)`을 그린다(AC-6911.4). 칸 위 줄은 `month`·`to`로 만든다. 금액 글 `wonText` 그대로.
- `report/reportData.ts`: `ready?.values?.find((v) => v.month === month)`, 칸 이름에서 '(90일)'을 지운다(AC-6911.5).

## 8. 자료 흐름
1. [비트에서 불러오기] → 도우미 revenue.days → 저장. 0.13.0이면 그런 날도 금액 아홉 칸이 다 있는 확인된 줄이다(음수인 날만 unconfirmed + rough_total).
2. 통계 탭: `loadDays` → (그대로) → `revenueView`/`sumPeriod`가 `dayRevenue`로 센다. 목표·보고서는 `revenueDayValues`.
3. 보고 문장: stats.rows의 보고 네 벌(도우미가 금액까지) → `reportText`.
4. Worker: `sectionsJob`이 달마다 신환 1명당 값을 낸다(합·평균 숫자만).
5. 업무일지: 도우미 `revenue.days` 하루 줄 → `bitValuesFrom` → 칸.

## 9. 시험 (바뀌는 옛 시험 포함)
- TASK-2: `summary.test.ts`에 dayRevenue·revenueDayValues, `sync.test.ts`에 0.13.0 다시 읽기(AC-6913.x, 옛 AC-4407 시험은 그대로 통과해야 함).
- TASK-3: `DoctorsSection.test.tsx`(AC-2706.4·AC-4414.4 글 시험을 새 글로), `SunapScreen.test.tsx`(AC-4905.9 시험을 '줄 없음'으로).
- TASK-4: `patientValue.test.ts`(달 셈으로 다시), `jobs.test.ts`(value → values), `PatientValueSection.test.tsx`, `RevenueSection.test.tsx`(다섯째 탭 고정값 `value` → `values`, 칸 이름), `reportData.test.ts`(BIT 고정값·칸 이름).
- TASK-5: `summary.test.ts`(sumPeriod·withRough 시험 정리), `revenueView.test.ts`(켜짐·꺼짐·점선·빗금 시험을 새 셈으로), `RevenueSummary.test.tsx`, `RevenueSection.test.tsx`(스위치·꼬리표·outside), `PeriodSummary.test.tsx`(두 스위치 묶음 시험·안내 글), `RoughSwitch.test.tsx`(지움), `StatsScreen.test.tsx`(매출 요약 칸 셋 → 둘).
- TASK-6: `reportText.test.ts`(AC-510.2 시험·골든 비교 범위·0.13.0 벌), `ReportSection.test.tsx`(AC-513.6 시험).
- TASK-7: `bitFill.test.ts`, `BitNotice.test.tsx`·`WorklogScreen.test.tsx`(안내 글), `useBitFill.test.tsx`(roughTotal 있는 날 = ready).
- TASK-8: `useStatsGoals.test.ts`, `reportData.test.ts`·`ReportSection.test.tsx`·`StatsScreen.test.tsx`(보고서 매출 '만 원' → 원 단위, roughTotal 있는 날 더함).
- TASK-9(C#): `RevenueDays.test.cs`(세 검사 시험 → AC-6912.1~3, 하루 문장 8개 → 5개, 참고 금액은 음수인 날만), `RevenueFakes.test.cs`(보통 날 문장 목록), `RevenueCommands.test.cs`(세 검사로 확인 필요를 만들던 두 시험을 음수로·판), `StatsReport.test.cs`(AC-504.2 네 시험 → AC-6912.4, 한 벌 차례, 안내 글 AC-6912.5), `StatsRows.test.cs`(가짜 답 정리만 할 수 있음), 판 시험(`CalendarTargets`·`StatsExtra`·`SunapTargets`·`RevenueCommands` C# 판 줄, `input-wiring.dotnet.test.ts`, `src/lib/bridge/handshake.test.ts`·`client.test.ts`), 감싸개 `revenue-read.dotnet.test.ts`·`stats-report.dotnet.test.ts`(AC-003.1·AC-003.2·AC-504.2 글을 새 뜻으로, REQ-6912 묶음 더함).
- 손대지 않는 시험(같은 말이 고정값으로만 나온다): 차트 부품·SummaryCell·parts·storage·bridge(revenueResult)·helperData·useStatsRevenue·globals, C# `RevenueSql`·`StatsSql`(문장 글 그대로)·`SunapTargets`(판 줄만).

## 10. 도우미 0.13.0 (TASK-9, C#)
- `helper/src/Precheck.Core/Revenue/RevenueDays.cs` `ReadMoney`:
  - 세 검사 `foreach`를 지운다. 바로 FinanceNormal·FinanceReceivable·두 Extra를 읽는다(AC-6912.1).
  - 음수 검사(total·cash·card·transfer·receivableIn) → `Unconfirmed` + `Rough`는 그대로 남긴다: sales_days의 `check (… >= 0)`와 웹 `isCount`가 음수 금액을 받지 않는다(AC-6912.2). 그래서 `RoughTotal`은 이 날에만 생긴다.
  - 나눔: `sameInsured` 비교를 지우고(AC-6912.3) 음수 검사만 남긴다(`insurer`·`noncovered`·`copay`·`otherTotal` 가운데 음수 → `SplitUnconfirmed`, DB `>= 0` 제약 때문). Extra 두 문장은 copay를 주므로 계속 읽는다.
  - 머리 주석·`RevenueDay` 주석을 새 뜻으로. `RevenueSql`의 세 검사 상수·관문 표는 그대로(수납일지가 씀).
- `helper/src/Precheck.Core/Stats/StatsReport.cs` `Load`:
  - `UnsupportedFinanceSql`·`FinanceMultiplicitySql`·`ReceivableMultiplicitySql` 부르기와 `SetFinanceUnconfirmed`를 지우고 늘 `AddFinance`(AC-6912.4). `FinanceUnconfirmed` 속성·`StatsPayload`의 `financeUnconfirmed` 칸은 늘 false로 남긴다(답 모양 그대로, 웹 검사 그대로).
  - 안내: 금액 안내 글을 AC-6912.5 글로, `if (result.FinanceUnconfirmed) …` 안내 줄을 지운다.
- 같은 금액 문장인가: 원장님별·참고 금액 문장(`StatsSql.DoctorMoneyNormalSql`·`DoctorMoneyReceivableSql`)은 보고 금액 문장(`FinanceNormalSql`·`FinanceReceivableSql`)의 같은 NativeRows를 날·진료의로 다시 묶은 것이다. 그래서 0.13.0의 그날 총진료비는 지금 참고 금액과 같은 수납 줄의 합이다(다른 점은 원 미만을 줄마다 버리느냐 합에서 버리느냐뿐).
- 판: `helper/Directory.Build.props` `<Version>0.13.0</Version>`, `src/lib/bridge/versions.ts` `LATEST_HELPER = '0.13.0'`(같은 TASK, MIN_HELPER 그대로). 판을 박아 둔 시험 모두 0.13.0으로.
- dotnet 시험은 이 TASK 하나만 돈다(다른 dotnet TASK 없음 → 같은 Phase의 웹 TASK와 겹쳐도 됨).

## 11. 0.13.0으로 옛 날 다시 읽기 (TASK-2, 웹)
- `lib/revenue/sync.ts` `savedMark(row, helperVersion)`: `const FULL_HELPER = '0.13.0'`(같은 파일의 `ROUGH_HELPER` 옆). 판이 그 이상이면 `row.dayCodes && !row.unconfirmed && !row.splitUnconfirmed`, 아니면 지금 식 그대로(AC-6913.1·AC-6913.2). `row` 모양에 `splitUnconfirmed?: boolean`을 더한다(옛 시험 고정값은 열쇠 없음 = 거짓).
- `useStatsRevenue.ts`는 그대로(저장 줄 전체를 넘긴다).

## 12. 릴리스 (구현이 끝난 뒤, 이 명세의 TASK 밖)
1. 갈래를 합친 뒤 GitHub Actions 도우미 빌드 → `precheck-helper-0.13.0.zip`.
2. 웹앱 설정의 설치 파일 올리기로 그 zip을 올린다(웹 배포와 함께, LATEST_HELPER가 0.13.0이라 '새 도우미가 있어요'가 뜬다).
3. 의원 PC(접수 PC 포함)에 0.13.0 설치.
4. 통계 탭에서 그런 날이 든 달을 [비트에서 불러오기] → 11절 규칙이 옛 확인 필요한 날을 한 번 다시 읽어 금액·나눔을 채운다. 업무일지·수납일지·보고 문장은 그때그때 읽으므로 설치만 하면 된다.

## 13. 위험 — 합이 맞지 않거나 사용자가 알아야 할 곳
1. **그런 날 금액은 비트 원본 통계와 다를 수 있다**: 원본 도구가 세 검사로 멈춘 까닭은 환불·변경수납·예치금 줄이 정상수납 문장에 들지 않거나(환불 줄 OrcPatTyp='R'은 빠짐), 연결 중복이면 같은 내원이 두 번 셀 수 있어서다. 0.13.0은 그래도 같은 문장으로 센다(사용자 "무조건 비트 총진료비", "도우미도 고치기"). 보고 문장 안내에 한 줄(AC-6912.5)만 남긴다.
2. **0.13.0 설치 전**: 보고 문장의 그런 날·달은 금액 줄이 모두 '–'(지금 운영의 '확인 필요' 자리, 도우미를 올리라는 안내가 붙는다). 업무일지는 총진료비만, 급여·비급여·기타는 옛 줄이 '나눔을 못 한 날'.
3. **다시 불러오기를 해야 옛 날이 채워진다**: 설치만 하고 [비트에서 불러오기]를 하지 않으면 옛 줄은 참고 금액(총진료비)만 있고 나눔이 없다.
4. **음수인 날**(환불이 더 많은 날): 0.13.0에서도 unconfirmed + 참고 금액으로 남는다(DB가 음수를 받지 않음). 그날은 매출에 음수로 들어가 총매출을 줄이고, 급여·비급여·기타에서는 '나눔을 못 한 날'이며, 업무일지는 총진료비만 채워진다. 그리고 11절 규칙 때문에 0.13.0으로 불러올 때마다 그날을 다시 읽는다(드물어서 받아들임). 나눔 칸만 음수인 날(splitUnconfirmed)도 같다.
5. **급여·비급여·기타 탭**: 옛 줄이 남은 기간은 셋의 합이 총매출보다 작다(지금 있는 안내 한 줄이 알려 줌).
6. **치료별 매출 탭**: 원래 처방 금액 기준이라 총매출과 다르다(지금 그대로). 옛 '참고 금액 … 합이 총매출과 달라요.' 줄이 없어진다.
7. **수납일지 장부**: 비트와 다를 수 있는 날을 알리는 줄이 없어진다(도우미의 `unsure`는 계속 셈하지만 웹이 쓰지 않음).
8. **금액을 모르는 옛 날**(0.7.0 전에 저장된 확인 필요 날): '아직 불러오지 않은 날'처럼 빠지고 그 기간은 견주지 않는다. 다시 불러오면 채워진다.
9. **매출 요약 vs 원장님별**: 같은 기준이지만, 원장님별은 불러온 오늘(진료 중) 줄을 넣고 매출 요약은 마지막 끝난 날까지라 오늘이 든 기간은 다를 수 있다(지금도 그렇다).
10. **월간 보고서와 이번 달 목표 칸**: 같은 셈이지만 글 모양이 다르다(보고서 원 단위, 목표 칸 만 원).
11. **도우미 안내 바꾸기**(옛 도우미 글): 정확히 같은 글만 바꾼다.
12. **신환 1명당 매출**: (a) 그 달 늦게 온 신환일수록 그 달 안 날이 적어 평균이 작게 잡힌다(정의가 그렇다). (b) 이번 달은 자료 끝 날(진료 중 오늘 포함)까지라 보고서의 다른 이번 달 숫자(어제까지)와 하루 어긋날 수 있다. (c) 인원 n은 서로 다른 환자 수라, 한 달에 신환 표시가 두 날인 사람이 있으면 통계 탭 '신환' 수(날마다 센 접수 줄)와 조금 다를 수 있다. (d) 불러온 범위가 그 달 1일을 덮지 않으면 그 달은 세지 않는다('그 달 1일부터 불러오면 볼 수 있어요').
