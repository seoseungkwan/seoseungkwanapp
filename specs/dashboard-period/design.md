# 설계: 대시보드 기간 고르기 (기간별 흐름에 일별·주별·월별 + 달·해 고르기 + 직접 날짜)

## 개요
- 고른 것(`FlowChoice`)은 빠른 단추(`Period` 7·30·90) 또는 통계의 `StatsPick` 하나다. `DashboardAnalysis`의 상태 하나이고(지금 `period` 자리), 저장하지 않는다
- 화면은 `flowOf(today, choice, todayDone)`로 `Flow` 하나를 얻고, 그래프 넷은 `flow.current`(센 기간)·`flow.bucket`(막대 칸)만 본다. 빠른 단추 갈래는 지금 함수(`periodRange`·`trendBuckets`·`revisitView(…, period)`)를 그대로 부른다
- 숫자는 손에 든 숫자(오늘 − 100 ~ 오늘)로 그리고, 고른 기간이 그보다 앞에서 시작할 때만 그 기간의 저장 숫자를 한 번 더 읽는다(`usePeriodDays`)
- 고르기 부품·날짜 셈·막대 칸 셈은 통계 탭 것을 불러 쓴다(`PeriodPicker`·`periodPick`·`patientTrend`). 통계 파일은 한 줄도 고치지 않는다

## 구성 요소 / 인터페이스
```ts
// summary/view.ts (TASK-1). 통계를 부르지 않는다(아래 '불러오기 고리')
export function dayCount(days: readonly DayPayload[], range: { from: string; to: string }): number // daysIn 날 수 = groupRank가 센 날
export function revisitSkipped(days: readonly DayPayload[], range: { from: string; to: string }): Record<'d7' | 'd14' | 'd30', boolean> // 그 값이 null이라 뺀 날이 있음

// summary/flow.ts (TASK-2, 새 파일). 통계는 여기서만 부른다: periodPick(pickRange·lastDayOf·타입), view(patientTrend·타입)
export type FlowChoice = Period | StatsPick
export type Flow = {
  period: Period | null // 빠른 단추면 일 수, 고른 기간이면 null
  current: PeriodRange // 그래프 넷이 세는 기간(빠른 단추 = periodRange, 고른 기간 = pickRange(…).current)
  head: string // 머리 줄 기간 글. 빠른 단추는 지금 periodRange label 그대로
  span: string // 처방 상위 날짜 줄 앞부분 = 기간 글 + ' (어제까지)'·' (오늘까지)'(빠른 단추는 늘 ' (어제까지)')
  bucket: TrendBucket // 빠른 단추 'day', 고른 기간은 pickRange의 bucket
  lastDay: string // lastDayOf(today, todayDone) → PeriodPicker lastDay
  picker: StatsChoice // PeriodPicker choice. 빠른 단추는 QUICK_CHOICE(7 → '7d')
  range: StatsRange | null // 고른 기간의 통계 범위(patientTrend에 넘긴다)
}
export const QUICK_CHOICE: Record<Period, StatsPeriod>
export function todayFinished(today: string, held: readonly DayPayload[]): boolean // 오늘 줄이 있고 partial false
export function flowOf(today: string, choice: FlowChoice, todayDone: boolean): Flow
export function flowTrend(days: readonly DayPayload[], flow: Flow): BarBucket[] | null
export function flowTicks(flow: Flow): { day: string; label: string }[] // 빈 틀 눈금. 고른 기간 주·달은 []
export function rankLine(flow: Flow, count: number | null): string // count ≥ 1이면 `${span} · 자료 있는 ${count}일`, 아니면 span

// summary/source.ts (TASK-3, 타입 하나)
/** 옛 기간 읽기. from = 손에 든 숫자의 첫날(오늘 − LOOKBACK_DAYS). read = 저장 숫자 한 번(10초 한도), null = 실패·한도 */
export type OlderDays = { from: string; read: (range: { from: string; to: string }) => Promise<readonly DayPayload[] | null> }

// summary/usePeriodDays.ts (TASK-3, 새 파일). lib/storage를 부르지 않는다(읽기는 주입받는다)
export type PeriodDays = { kind: 'ready'; days: readonly DayPayload[] } | { kind: 'reading' } | { kind: 'failed'; retrying: boolean }
export function usePeriodDays(held: readonly DayPayload[], current: { from: string; to: string }, older?: OlderDays): { state: PeriodDays; retry: () => void }

// DashboardAnalysis (TASK-4): props에 older?: OlderDays. BitDashboard (TASK-5): props에 older?: OlderDays를 받아 그대로 넘긴다
```

## 숫자
- 끝난 날: `todayFinished` = 손에 든 오늘 줄이 있고 `partial: false`(대시보드의 '오늘 진료 끝', 오늘 하루 분석의 closed와 같다). 통계는 덮은 기간에 오늘이 드는지로 정하지만, '오늘 진료 끝'으로 저장한 날의 오늘 줄이 `partial: false`라 뜻이 같다. 비트 PC의 비트 숫자는 오늘이 늘 partial이라 어제까지다
- 기간 글(고른 기간): `periodPick`의 비교 글 규칙과 같다(오늘과 해가 같으면 해 없음, 다르면 앞에, 해를 넘으면 양 끝, 같은 달이면 끝은 'N일'). `periodPick`의 `spanLabel`은 내보내지 않아 flow.ts에 몇 줄로 둔다(`longDate`·`monthOf`만 쓴다). 끝나지 않은 달·해 = current 끝이 그 달·해 끝보다 앞
- 환자 수 추이: 빠른 단추 = `trendBuckets` 그대로. 고른 기간 = 통계 `patientTrend({ days, covered: [current], range })`. 대시보드는 덮은 기간을 읽지 않으므로 고른 기간 하나를 덮은 것으로 넘겨 '줄 없는 날 = 칸 없음'(지금 대시보드 규칙)을 맞춘다. 그러면 주·달 칸의 '일부 기간'은 기간에 잘림·끝나지 않음·partial 줄로만 정해지고, 줄 없는 주·달은 `blank: 'no-data'`('–'), 해 고르기의 앞으로 올 달은 `blank: 'future'`다. 눈금은 통계 규칙(31일 이하 7일마다, 넘으면 21일마다). `dense` = 빠른 단추는 지금처럼 `period !== 7`, 고른 기간은 칸 7개 넘음
- 신환 재방문율: 고른 기간은 `revisitView(days, current)`(period 없이) = 30일 줄도 고른 기간 그대로다. 통계 탭의 고른 기간(`finishedCohort: null`, 옮기지 않음)과 같은 규칙이다. 옮기면 읽지 않은 날을 세게 되고, 고른 달이 '그 달에 온 신환'이 아니게 된다. 대신 값이 null이라 뺀 날이 있으면 그 줄 아래에 한 줄(`revisitSkipped`)을 붙여, 예를 들어 11월 6일에 본 10월의 30일 줄이 10월 1–6일 신환으로만 셌다는 것을 알린다. 빠른 단추는 지금 그대로(30일만 '가장 최근 신환' 글)
- 요일별: `weekdayBuckets(days, current)` 그대로(통계 `weekdayBars`도 이것을 부른다). 몇 년이어도 요일마다 자료 있는 날 평균이다
- 처방 상위: `groupRank(days, current, lines)` 그대로. 날짜 줄 N = `dayCount(days, current)`. `GroupRank` 모양은 바꾸지 않는다(지금 시험 기대값 그대로)

## 데이터 흐름 (읽기)
- 손에 든 숫자 = `source.days`: LiveDashboard의 저장 숫자(오늘 − `LOOKBACK_DAYS` ~ 오늘) 또는 비트 PC의 비트 숫자(같은 범위). 고른 기간 첫날 ≥ `older.from`이면 그대로 쓴다. 빠른 단추는 늘 이쪽이다(최근 90일 첫날 = 오늘 − 90)
- 첫날이 그보다 앞이면 `older.read(current)` 한 번. `older`는 LiveDashboard가 `{ from: addDays(today, -LOOKBACK_DAYS), read: (r) => withinLimit(() => readDays(r)) → rows }`로 만들어 BitDashboard → DashboardAnalysis로 넘긴다. 저장 숫자를 읽는 코드는 지금처럼 LiveDashboard 한 곳이다(bit-dashboard AC-601.14). 한도는 같은 `SAVED_READ_TIMEOUT_MS`(10초)
- `usePeriodDays`: 키 = `current.from~current.to`. 키가 바뀌면 읽고, 떠났거나 키가 바뀐 뒤 온 답은 버린다(지금 효과들의 `gone` 모양). 답 rows → `ready`, 그릴 날 = `[...rows, ...held]`(`daysIn`은 같은 날 뒤의 것을 써서 손에 든 숫자가 이긴다. 비트 PC면 비트 숫자). null → `failed`. `retry`는 같은 키로 다시 읽는다. 단위만 바뀌면 키가 같아 읽지 않는다. 앞 키의 답은 하나도 남겨 두지 않는다(◀ ▶로 돌아오면 다시 읽는다, 단순하게)
- 덮은 기간(`readCoverage`)·`range.load`는 쓰지 않는다: 비교가 없어 current만 읽으면 되고, 대시보드에는 [비트에서 불러오기]가 없으며, 휴진·자료 없음 가르기는 통계 탭이 한다. 읽기는 한 번(`readDays`)뿐이다
- 비트 읽기(`readBitDays`, 오늘 − 100 ~ 오늘)는 그대로다. 고른 옛 기간은 저장 숫자로만 본다(비트 PC도). 비트를 더 길게 읽으면 3분 한도·통로 점유가 길어진다
- 서버로 보내는 것 없음. 새 표·RPC·API·마이그레이션 없음. 저장 숫자 [다시 읽기]가 성공해 BitDashboard를 새로 놓으면(지금 `key`) 고른 것도 최근 30일로 돌아간다(지금 기간 단추와 같다)

## 화면 (DashboardAnalysis)
- 머리 줄(h2 · 기간 글 · 빠른 단추)은 클래스까지 그대로이고, 기간 글만 고른 기간이면 `flow.head`다. `PeriodPicker`는 빠른 단추 바로 오른쪽 같은 줄에 둔다(사용자 결정 2026-11-06, 통계 탭과 같은 자리). 머리 줄은 `flex-wrap`이고 고르기 묶음은 한 덩어리라 폭이 모자라면 통째로 다음 줄로 간다(묶음 안에서 꺾이지 않음). 부품의 '기간 골라 보기' 이름 줄이 높이를 어긋나게 하면 통계 탭(`StatsScreen.tsx`)이 맞춘 방법을 그대로 따른다. 768px 미만은 지금처럼 한 줄씩 전체 폭
- 고르기는 그래프를 그리는 갈래(`FlowCharts`)에만 있다. 연결 전·읽는 중·읽기 실패의 목록(`Gains`)에는 볼 숫자가 없어 두지 않는다
- `PeriodPicker` props: `choice={flow.picker}`·`lastDay={flow.lastDay}`·`todayDone`·`onChoose`(받은 것이 `StatsPick`일 때만 상태로. 부품은 고르기만 돌려준다)
- 읽는 중: 그래프 넷이 지금 빈 틀 + 가운데 '읽는 중'(추이 `EmptyTrend`, 요일별 빈 막대, 처방 상위 빈 줄 다섯, 재방문율 '–' + 줄 아래 '읽는 중')
- 실패: 고르기 아래 `ErrorCard`(`E-STATS-READ-FAILED`) + [이 기간 다시 읽기](LiveDashboard 오류 카드와 같은 모양, 폰 전체 폭) + 그래프 넷은 줄 없음('자료 없음'). 단추 이름은 위쪽 [다시 읽기](비트·저장 숫자 전체)와 헷갈리지 않게 '이 기간 다시 읽기'다
- 환자 수 추이 설명은 bucket마다 '하루씩'·'한 주씩'·'한 달씩'. 범례 '일부 기간'(`hatch`)은 고른 기간에 그런 칸이 있을 때만(빠른 단추 범례는 그대로)
- 처방 상위: `Chart`에 설명 바로 아래 줄(`sub`) 하나, 설명과 같은 small muted + `tabular-nums`. 가운데 글·링크·빈 줄 다섯은 지금 그대로
- 휴대폰: `PeriodPicker` 자체 규칙(한 줄씩 전체 폭·44px·판은 단추 아래 `static`)을 그대로 쓴다. 대시보드 쪽은 줄 감싸개만 전체 폭

## 결정과 트레이드오프
- **불러오기 고리**: 통계 `view.ts` → 대시보드 `summary/view.ts`(실행 불러오기), `PeriodPicker.tsx` → 통계 `view.ts`·`periodPick.ts`, `periodPick.ts` → 통계 `view.ts`는 타입만. 대시보드 `summary/view.ts`가 통계를 부르면 고리가 되지만, `flow.ts`·`DashboardAnalysis.tsx`는 통계 쪽 누구도 부르지 않아 고리가 아니다. 그래서 `summary/view.ts`는 계속 통계를 부르지 않고(AC-1805.2 시험), 통계를 부르는 곳은 이 두 파일뿐이다. 공용 조각을 옮기는 길은 다른 작업자의 통계 파일을 고쳐야 해서 고르지 않았다
- **무게**: 통계 `view.ts`(와 그것이 부르는 `periodPick.ts`)는 이미 `LiveDashboard` → `live/rxGroups.ts` → `treatmentView.ts`로 대시보드에 들어와 있다. 새로 더해지는 것은 `PeriodPicker.tsx`뿐이다
- **eslint 울타리**: `eslint.config.mjs`에는 `components/dashboard`·`components/stats` 규칙이 없다(환자 자료 구역은 `lib/…`·`workers`, 그 밖은 `bridge/client` 금지뿐). `PeriodPicker`·`periodPick`은 그 둘을 쓰지 않는다. 대시보드 summary 폴더의 울타리는 AC-311.8 시험의 허락 목록이고, 거기에 `flow.ts: @/components/stats/periodPick`·`flow.ts: @/components/stats/view`·`DashboardAnalysis.tsx: @/components/stats/PeriodPicker`·`DashboardAnalysis.tsx: @/components/common/ErrorCard`와 이 폴더의 `./flow`·`./usePeriodDays`만 더한다. `usePeriodDays.ts`는 `react`·`./source`만 부른다
- **막대 칸은 통계 셈을 빌린다**: 주·달 칸·잘린 주·앞으로 올 달 규칙을 대시보드에 두 벌 두지 않으려고 `patientTrend`를 부른다. 대가로 `covered`에 실제 덮은 기간이 아니라 고른 기간 하나를 넘긴다(위 '숫자'). 이 뜻은 flow.ts 주석과 시험 이름에 적는다
- **옛 기간만 읽는다**: 손에 든 100일 안이면 읽지 않아 빠른 단추·최근 달은 기다림이 없다. 걸친 기간(7월 15일 ~ 8월 10일)은 전체를 읽고 손에 든 날을 얹는다
- **실패면 아무것도 안 그린다**: 손에 든 일부 날만 그리면 '고른 기간 전체'처럼 보인다. 그래서 '자료 없음' + 오류 카드다
- **날짜 줄 빈 상태**: 규칙 하나(줄이 하루라도 있으면 ' · 자료 있는 N일', 없거나 읽는 중·실패면 기간 글뿐). 묶음 상태와 상관없이 같은 줄이라 가운데 글만 보면 된다
- **먼저 할 일**: `PeriodPicker`·`periodPick`·`StackedBarChart`의 `blank`는 `feat-stats-period`에만 있다. 그 브랜치(TASK-8 마무리 중)를 합치기 전에는 시험도 돌릴 수 없어 TASK를 시작하지 않는다

## 위험 / 미해결 질문
- 몇 년을 고르면 하루 줄(처방 줄 포함)이 많아 10초 안에 다 못 읽을 수 있다. 그러면 오류 카드와 [이 기간 다시 읽기]다. 한도 늘리기·칸만 읽기는 이 명세에 없다
- 저장하지 않은 날이 낀 주·달 막대는 '일부 기간' 표시 없이 있는 날만 더한다(덮은 기간을 읽지 않아서). 일별은 칸이 비어 보인다. 정확한 구분은 통계 탭
- 묶음을 만들기 전에 저장한 옛 기간은 처방 상위가 '통계 탭에서 이 기간을 다시 불러와야 숫자가 나와요'다(지금 규칙 그대로)
- 통계 부품을 고치면 대시보드도 같이 바뀐다. 같은 부품을 쓰기로 한 결정의 대가다
- 고르기를 빠른 단추와 같은 줄에 두어(사용자 결정) 1024px 안팎 폭에서는 고르기 묶음이 다음 줄로 넘어갈 수 있다. 390·1440px에 더해 1024px 사진도 찍어 본다
- `todayDone`이 바뀌면(저장 숫자의 끝난 오늘 → 비트 숫자의 덜 끝난 오늘) 끝난 날이 하루 앞당겨진다. 이미 고른 직접 날짜는 그대로 두고 다음 고르기부터 한도가 바뀐다
