# 설계: 매출 가져올 기간

> 지금 매출 흐름(spec revenue design.md 7·8·9절)을 그대로 두고 달 수·읽는 범위·글만 넓힌다. 도우미·확장·DB·서버는 그대로다.

## 1. `src/lib/revenue/sync.ts` (순수 계획)
- `export type FetchSpan = '1y' | '2y' | 'all'`, `export const ALL_FROM_MONTH = '2020-01'`
- `planFetch(today, savedDays, months = 13)`: 셋째 인자로 최근 달부터 거꾸로 볼 달 수. 기본값이라 지금 부르는 곳·시험은 그대로
- `spanMonths(span, today): number` — '1y' 13, '2y' 25, 'all' = `ALL_FROM_MONTH` ~ `firstMonth(today)` 달 수(오늘 2026-11-10이면 83)
- `syncRevenue`는 그대로(`months` 목록을 이미 받는다. 고른 기간은 `planFetch(...).map(monthOf)`를 `months`로 넘긴다 → 새 달부터·저장된 달 건너뜀·멈춰도 다시 누르면 남은 달만)

## 2. `src/components/revenue/range.ts` (새 파일, 순수 글) · `view.ts`
- `range.ts` (React 없음, 글은 목업 그대로):
  - `SPAN_NAMES: { key: FetchSpan; name: string }[]` = 최근 1년·최근 2년·전체 기간
  - `spanLabel(span, today)` — AC-3501.2의 기간 이름
  - `timeText(n)` — AC-3501.3의 {시간}(한 달 10초, 분 올림)
  - `spanHint(span, today, missing): { text: string; disabled: boolean }` — AC-3501.3·3501.4
  - `fetchingBody(span, today, total)` — AC-3502.2 본문
  - `doneNotice(months: string[], firstShown): { lead: string; rest: string } | null` — AC-3502.3(months = 가져온 달, 비면 null)
  - `stoppedLine(span, months: string[], remaining): string | null` — AC-3502.4
  - `boundText(firstShown)` — AC-3503.1 '· YYYY년 M월부터 넘겨 볼 수 있어요'
- `view.ts`:
  - `RevenueViewInput`에 `firstShown?: string`(넘겨 볼 끝 달, 없으면 최근 13달 첫 달)과 `RevenueSync`에 `body?: string`(있으면 `fetchingView` 본문을 이것으로)을 더한다. 둘 다 고를 수 있는 칸이라 지금 시험 입력은 그대로 통한다
  - `seriesOf(days, today, month)`: 끝 달 = 고른 달이 `addMonths(firstMonth(today), -12)`보다 이르면 고른 달, 아니면 `firstMonth(today)`. `monthSeries`(summary.ts)는 이미 끝 달을 받아 고치지 않는다
  - 막대 제목: 끝 달이 최근 달이면 지금 글, 아니면 '달마다 매출 · {끝 달 −12} – {끝 달}'(건당 진료비도)
  - empty 글: 연결된 PC(`bridge: 'ready'`)·고른 달이 최근 13달보다 옛날·그 달 날 줄 없음·실패 목록에 없음 → AC-3503.3 글
  - 제안 묶음(`suggestGroups`)에 넘기는 코드는 최근 13달 달 줄만(AC-3504.2)

## 3. 부품 `src/components/revenue/RevenueRange.tsx` (새 파일) · `RevenueStates.tsx`
- `LoadRangePanel({ spans, selected, onSelect, hint, disabled, onLoad })` — 목업 `#picker` 모양: '가져올 기간' 이름, `role="group"` 묶음(`aria-pressed`), [비트에서 가져오기](`ds.button` 주 단추, `disabled`), 안내 줄. 받는 값은 글·불·콜백뿐(view 타입에 기대지 않는다)
- `RangeDoneNotice({ lead, rest })` — `role="status"` 초록 알림(`bg-positive-soft`), `RangeStoppedLine({ text })` — 오류 카드 아래 한 줄
- `PeriodRow`에 `bound?: string`를 더해 있으면 기간 글 옆에 `text-small text-muted`로 그린다

## 4. `src/components/revenue/RevenueScreen.tsx` (잇기)
- 상태: `older: Saved | null | 'failed'`(옛 달 읽기), `span: FetchSpan`('1y'), `rangeRun: { span; total; done: string[]; outcome: 'done' | 'stopped' } | null`
- 열 때: 지금 흐름(최근 13달 읽기 → 저절로 가져오기) 그대로 + 최근 13달 읽기가 끝난 뒤 `loadRevenue(ALL_FROM_MONTH, addMonths(oldest, -1))`를 기다리지 않고 따로 읽어 `older`에 둔다(실패 → 'failed')
- 그리는 자료: `days = [...older.days, ...saved.days]`, `codes = [...older.codes, ...saved.codes]`. `knownCodes`에는 지금처럼 `saved.codes`만. `firstShown = min(oldest, 합친 날 가운데 가장 옛 달)`(older가 배열일 때만), [지난달]은 `month > firstShown`
- 칸: `connected && older 배열 && (view.state === 'ready' || 'empty')`일 때만. 남은 달 = `planFetch(today, 합친 날 집합, spanMonths(span, today))`
- [비트에서 가져오기]: `rangeRun`을 지우고 `pull({ months }, months, keep, …)`(`sync.body = fetchingBody(...)`). onProgress의 `done`으로 다룬 달을 세고 실패 달을 빼 가져온 달을 안다. 끝나면 `saved`·`older` 둘 다 다시 읽고 `rangeRun`을 둔다. 멈춤(`stopped`)이면 오류 화면 아래 `stoppedLine`
- `pull`의 다시 읽기·`fetchOpen`·`generation` 규칙은 지금 그대로 쓴다

## 위험
- 옛 달 코드 줄은 많을 수 있다(달마다 수백 줄 × 최대 70여 달). 첫 그림을 막지 않게 따로 읽고, 다 읽기 전에는 칸·옛 달 넘기기를 보이지 않는다
- 걸리는 시간 글은 어림이다(이 PC 실측 한 달 대개 9초)
