# 설계: 통계 기간 고르기 (일별·주별·월별 + 달·해 고르기 + 직접 날짜, 바로 전·작년 비교)

## 개요
- 고른 것(`StatsChoice`)은 빠른 단추(`StatsPeriod` 글자 그대로) 또는 새 `StatsPick` 하나다. 화면은 `rangeOf(today, choice, todayDone)`로 `StatsRange` 하나를 얻고, 모든 섹션은 지금처럼 `input.range`만 본다. 그래서 섹션마다 따로 기간을 셈하지 않는다
- `StatsRange`를 넓힌다: 섹션이 `PERIOD_NAME[range.period]`·`COMPARE_NAME[range.period]`·`DETAIL_BUCKET[range.period]`로 찾던 것을 range의 칸(`name`·`previous.name`·`bucket`)으로 읽는다. 고른 기간은 `period: null`이라 표를 기간 이름으로 찾는 곳이 타입 오류로 모두 드러난다
- 날짜·이름 셈은 새 순수 모듈 `periodPick.ts`, 숫자 셈은 지금 `view.ts`에 `period === null` 갈래로 더한다(일 칸 규칙 `slotsOf`·`buildTrend`의 partial을 그대로 쓰려고). 빠른 단추 갈래는 한 줄도 바꾸지 않는다

## 구성 요소 / 인터페이스
```ts
// view.ts (TASK-1·3)
export type CompareRange = PeriodRange & { name: string; why: string } // name '9월' · why '바로 전 달'
export type StatsRange = { period: StatsPeriod | null; name: string; current: PeriodRange; previous: CompareRange; lastYear: CompareRange | null
  finishedCohort: DateRange | null; load: DateRange; grain: 'day' | 'month'; bucket: TrendBucket; label: string } // 고른 기간은 grain 'day'
export const PERIOD_NAME // parts.tsx에서 옮겨 오고 parts.tsx는 다시 내보낸다
export function rangeOf(today: string, choice: StatsChoice, todayDone: boolean): StatsRange
export function readSpan(range: StatsRange): DateRange // 가장 앞 비교 첫날 ~ current 끝
export function periodDesc(desc: string, range: StatsRange): string // 고른 기간이면 desc + " · " + name, 빠른 단추면 desc 그대로
export type SummaryCell = { key: 'average' | 'new' | 'returning' | 'compare' | 'lastYear'; … } // 'lastYear' = 둘째 비교 칸(TASK-1)
export type RxTrendRow = … & { lastYear?: { previous: number | null; delta: Delta } } // 고른 기간 + 작년 비교일 때만

// periodPick.ts (TASK-2). view.ts에서는 타입만 불러온다(실행 순환 없음)
export type PickUnit = 'day' | 'week' | 'month'
export type StatsPick = { kind: 'month'; unit: 'day' | 'week'; month: string } | { kind: 'year'; year: string } | { kind: 'custom'; unit: PickUnit; from: string; to: string }
export type StatsChoice = StatsPeriod | StatsPick
export function lastDayOf(today: string, todayDone: boolean): string
export function pickRange(today: string, pick: StatsPick, todayDone: boolean): StatsRange
export function defaultPick(unit: PickUnit, lastDay: string): StatsPick // 일·주 = lastDay가 든 달의 앞 달, 월 = lastDay의 해
export function stepPick(pick: StatsPick, dir: -1 | 1, lastDay: string): StatsPick | null // null = 못 감(▶ disabled)
export function checkCustom(from: string, to: string, unit: PickUnit, lastDay: string, todayDone = false): { kind: 'ok'; days: number } | { kind: 'error' | 'warn'; text: string; days?: number }
export function pickReportText(range: StatsRange, cells: readonly SummaryCell[], top: readonly { name: string; count: number }[]): string | null

// PeriodPicker.tsx (TASK-5): <PeriodPicker choice lastDay todayDone onChoose={(c: StatsChoice) => void} />
```
- 날짜는 `lib/analytics/dates.ts`만 쓴다: 작년 같은 날 `addMonthsToDay(d, -12)`(2월 29일 → 28일), 바로 전 달 같은 날 `min(일, 그달 말일)`, 주 시작 `weekStartOf`. 직접 날짜의 바로 전 N일은 `comparisonRange(…, 'PreviousEqualDays')`
- label: current는 늘 해를 붙인다('2026년 10월 1일 – 31일'). 비교 label은 오늘과 해가 다를 때만 해를 붙이고, 해를 넘는 기간은 양 끝에 붙인다
- 끝나지 않은 기간: 끝 = `lastDayOf`. 비교 끝은 같은 차례 날(달: 같은 일, 해: 같은 월·일)이고 why는 '… 같은 날까지'다

## 숫자 (view.ts, `period === null` 갈래)
- 기간 요약: 일 칸(`slotsOf`)으로 current와 비교마다 따로 끝난 날 평균(버림)을 낸다. 날 수가 달라 짝을 짓지 않는다. 비교 기간에 끝나지 않은 칸이 하나라도 있으면 그 비교는 '–'다
- 막대: 고른 기간은 칸을 모두 만든다. 일별은 날마다(휴진한 날 = 줄 없고 덮은 날만 칸 없음, 지금과 같다), 주는 월–일을 기간으로 자름, 달은 1~12월. partial = 기간에 잘림 ∨ 끝나지 않음 ∨ 끝나지 않은 날이 듦. 자료 없는 칸은 `blank: 'no-data'`, 월별의 앞으로 올 달은 `blank: 'future'`다. 눈금 글자는 지금 `tickLabels` 규칙(31일 이하 30일 눈금, 넘으면 90일)
- `BarBucket`에 선택 칸 `blank?: 'no-data' | 'future'`를 더한다(`StackedBarChart`, TASK-9). no-data = 막대·합계 자리에 '–'(화면 읽기 표도 '–'), future = 달 글자만 있는 빈 칸(화면 읽기 표에 없음). 주지 않으면 지금 그림과 한 글자도 다르지 않다(대시보드 그대로). [자세히] 표는 no-data 줄의 숫자를 '–'로, future 줄은 넣지 않는다
- 처방 행(처방별 추세·처방 골라 보기·합계): 건수는 current 합. 비교마다 두 기간의 `buildTrend` 일 점에 partial이 없을 때만 비교 기간 전체 합과 견준다. 처방별 추세는 `groupInput`이 그 묶음으로 세지 않은 비교 기간마다 덮은 기간에서 빼서(지금 규칙) 그 비교만 '–'가 된다
- `rxComparedCells`는 고른 기간에서 `{ kept: 0, dropped: false }`라 '짝만 견줘요' 안내가 나오지 않는다. 그래프(`rxDetail`)는 `range.bucket` 칸, 회색은 previous다

## 데이터 흐름 (읽기·불러오기)
- `useStatsData(choice, today)`: 키는 고른 것이다(todayDone 아님). 읽기는 `rangeOf(today, choice, true)`(끝나지 않은 기간은 오늘까지)로 `readDays`를 current·previous·lastYear에, `readCoverage`를 가장 앞 비교 첫날~오늘에 한다. 오늘이 덮였으면 todayDone 참이고 `input.range = rangeOf(today, choice, todayDone)`. 읽은 범위가 늘 더 넓어 다시 읽지 않는다. 화면은 `data.todayDone`으로 같은 range를 셈해 기간 글·불러오기·끝난 날(`lastDay`)에 쓴다
- 덮은 기간은 `readCoverage`(가장 앞 비교 첫날~오늘) 한 번으로 읽어 todayDone을 정한 뒤, `input.covered`에는 세 읽기 범위(current 읽기 범위·previous·lastYear)와 겹치는 조각만 남긴다. 그 사이(10월이면 2025-11-01~2026-08-31)는 줄을 읽지 않았으므로 '덮었는데 줄 없음 = 휴진'으로 보이면 안 된다. 저장하지 못한 숫자의 덮은 기간도 같이 자른다. 출처 줄의 '…까지 끝난 날로 저장했어요'는 자르기 전 덮은 기간의 끝(`data.coveredTo`)을 쓴다
- 같은 처방 재방문(`againView.ts`): 고른 기간에서는 앞으로 옮기지 않는다(옮긴 범위는 읽지 않은 날일 수 있다). 센 시작일 = current 첫날 ~ min(current 끝, 어제 − 창)(빠른 단추는 기간 끝이 어제라 지금 값과 같다). 창이 다 지난 날이 없으면 '아직 셀 수 없어요' 글 하나다
- 불러오기 범위(`load`)는 지금 규칙("비교 첫날이 든 달 1일 ~ 오늘")을 가장 앞 비교로 넓힌 것이다. 10월 → 2025-10-01부터, 2025년 → 2024-01-01부터
- 작년 줄이 서버에 없으면(비트 PC가 그만큼 불러온 적이 없음) 그 비교·칸은 '–'와 "자료가 없어요"다. 처방별 신환·재진은 Worker 메모리(마지막 불러오기 범위) 밖이면 지금 글 '이 기간은 아직 불러오지 않았어요'다
- 새 표·RPC·API·서버 코드·마이그레이션 없음. 서버로 가는 값은 지금 저장 모양 그대로다

## 결정과 트레이드오프 (시안과 다른 곳)
- 위쪽 [일별][주별][월별]은 직접 날짜 중이면 그 기간의 단위만 바꾼다(시안대로). 일별로 92일을 넘으면 바꾸지 않고 판을 경고와 함께 연다. 직접 날짜가 아니면 달·해 고르기로 간다
- 덜 끝난 칸 표시 글자는 지금 앱의 '일부 기간'이다(시안은 '일부')
- [고른 기간 보고]는 고르기 중에만 보인다(빠른 단추는 지금과 똑같이). 저장된 숫자로 만들어 비트 없이도 된다. 처방 문장은 처방별 추세의 준비된 줄 건수 1·2위다
- 직접 날짜의 작년 기간이 고른 기간과 하루라도 겹치면(보통 366일 이상, 윤년이 들면 하루 다를 수 있다) 작년 비교를 빼고 바로 전 N일 하나만 보인다. 작년 날짜는 `addMonthsToDay(d, -12)`로 내고 `comparisonRange('PreviousYear')`는 쓰지 않는다(1년 이상이면 던진다). ◀는 2020년 1월(월별은 2020년)까지. 직접 날짜는 2020-01-01부터, 한 번에 1827일까지(AC-1702.4)

## 위험 / 미해결 질문
- 불러오기 범위가 길어진다: 먼 해를 고르고 [비트에서 불러오기]를 누르면 2년 넘게 읽어 `MAX_STATS_ROWS`(70만 줄)·SQL 한도에 걸릴 수 있다. 그러면 지금 오류 카드가 뜬다. 상한은 이 명세에 없다
- 작년 비교는 비트 PC가 작년 기간을 불러와 저장해야 숫자가 나온다(처방별 추세 묶음은 다시 불러와야 한다). 그 전에는 '–'다
- `StatsRange.period`를 넓혀 TASK-1 뒤부터 TASK-8 전까지 `tsc`가 깨질 수 있다(vitest는 돈다). 전체 검사는 Phase 4 끝에 한다
