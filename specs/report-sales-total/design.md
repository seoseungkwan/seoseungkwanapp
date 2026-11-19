# 설계: 월간 보고서 매출 = 총진료비 그대로 (report-sales-total)

## 1. 바꾸는 곳
- `src/components/stats/report/reportData.ts` (순수)
  - 새 함수 `export function reportDaySales(days: readonly SavedRevenueDay[]): DayValue[]` — 줄마다 `total ?? roughTotal`, 둘 다 null이면 뺀다(AC-6901.1).
  - 매출 글자 세 곳(한 달 요약 180줄 근처, 목표 195줄 근처, 달라진 것 210줄 근처)의 `formatManWon` → `formatWon`(`@/components/revenue/money`에 이미 있음). 신환 1명당 매출 두 칸은 `formatManWon` 그대로(AC-6902.4).
- `src/components/stats/report/useReportReads.ts`
  - `readSales`의 `days.flatMap(… row.total === null ? [] : …)`을 `reportDaySales(days)`로 바꾼다. 읽는 범위·다시 읽기·고른 달 규칙은 그대로. 머리 주석의 '총액이 빈 날은 뺀다 — 목표 칸과 같다'를 새 규칙으로 고친다.

## 2. 시험
- `reportData.test.ts`: reportDaySales(total만·roughTotal만·둘 다·둘 다 null·음수 roughTotal), monthlyReport 요약·목표·달라진 것 글자가 원 단위, 신환 1명당 칸은 만 원 그대로. 매출 글자를 만 원으로 기대하던 옛 시험은 원 단위로 고친다.
- `StatsScreen.test.tsx`: 보고서 종이 '한 달 요약' 매출 칸(`paperSales`)을 만 원(`300만 원`·`600만 원`)으로 기대하던 곳을 원 단위(`3,000,000원`·`6,000,000원`)로 고친다. 통계 화면 목표 칸('매출600만 원 / 목표 …')은 범위 밖이라 그대로다.
- `ReportSection.test.tsx`: loadDays가 확인 필요한 날(total null, roughTotal 있음)을 돌려줄 때 그 금액이 매출에 더해짐. '1억 1,000만 원'처럼 보고서 매출을 만 원으로 기대하던 곳은 원 단위(`110,000,000원`)로 고친다. 시험 도우미 `salesDay`에 roughTotal을 받을 수 있게 한다.

## 3. 결정
- 확인 필요한 날의 금액은 매출 탭 빗금 막대와 같은 참고 금액(rough_total)이다. 사용자 "참고금액 상관없이" → 보고서에서는 따로 표시·경고 없이 그대로 더한다.
- 통계 화면 '이번 달 목표' 칸은 지금처럼 확인 필요한 날을 빼고 만 원으로 보이므로, 같은 달이라도 보고서 '매출'과 숫자가 다를 수 있다(범위 밖, 사용자에게 알린다).

## 4. 위험
- 확인 필요한 날의 참고 금액은 비트 외래환자경영통계와 조금 다를 수 있다(매출 탭 설명과 같다).
