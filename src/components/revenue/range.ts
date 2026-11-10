import { addMonths, compareYmd } from '@/lib/analytics/dates'
import { firstMonth } from '@/lib/revenue/summary'
import { ALL_FROM_MONTH, spanMonths, type FetchSpan } from '@/lib/revenue/sync'
import { fullMonthName } from './view'

// 매출 가져올 기간의 글(spec revenue-load-range design.md 2절). 순수 함수다: React·네트워크·저장소 없음, 오늘은 인자로만 받는다.
// 글은 requirements.md와 승인된 시안 docs/mockups/revenue-load-range/ 그대로다

/** 한 달 읽는 어림(초). 이 PC 실측은 대개 9초라 10초로 센다(시안 notes.md) */
const SECONDS_PER_MONTH = 10
const ALL_NOTE = ' 한 번 가져온 달은 남으니 처음 한 번만 하면 돼요.'
const AUTO_NOTE = ' 화면을 열 때마다 새로 생긴 날을 저절로 가져와요.'

export const SPAN_NAMES: { key: FetchSpan; name: string }[] = [
  { key: '1y', name: '최근 1년' },
  { key: '2y', name: '최근 2년' },
  { key: 'all', name: '전체 기간' },
]

const between = (from: string, to: string) => `${fullMonthName(from)} – ${fullMonthName(to)}`

/** 달 목록의 가장 옛 달·가장 새 달과 달 수. 차례는 상관없다 */
function monthSpan(months: string[]): { oldest: string; newest: string; count: number } | null {
  const sorted = [...new Set(months)].sort(compareYmd)
  const oldest = sorted[0]
  const newest = sorted.at(-1)
  return oldest === undefined || newest === undefined ? null : { oldest, newest, count: sorted.length }
}

// 한 달이면 범위 대신 그 달 하나
const spanText = ({ oldest, newest }: { oldest: string; newest: string }) => (oldest === newest ? fullMonthName(oldest) : between(oldest, newest))

/** 최근 1년 = '최근 1년(2025년 11월 – 2026년 11월, 13달)', 최근 2년 = '2024년 11월 – 2026년 11월(2년)', 전체 기간 = '2020년 1월 – 2026년 11월' */
export function spanLabel(span: FetchSpan, today: string): string {
  const latest = firstMonth(today)
  const count = spanMonths(span, today)
  const first = addMonths(latest, -(count - 1))
  if (span === '1y') return `최근 1년(${between(first, latest)}, ${count}달)`
  if (span === '2y') return `${between(first, latest)}(2년)`
  return between(ALL_FROM_MONTH, latest)
}

/** 한 달 10초, 분은 올림. 1분 이하면 '1분 안에 끝나요.' */
export function timeText(months: number): string {
  const minutes = Math.ceil((months * SECONDS_PER_MONTH) / 60)
  return minutes <= 1 ? '1분 안에 끝나요.' : `${minutes}분쯤 걸려요.`
}

/** missing = 고른 기간의 남은 달 수(planFetch 규칙). 0이면 [비트에서 가져오기]가 막힌다 */
export function spanHint(span: FetchSpan, today: string, missing: number): { text: string; disabled: boolean } {
  const label = spanLabel(span, today)
  if (missing === 0) return { text: `${label}은 다 가져와 있어요.${span === '1y' ? AUTO_NOTE : ''}`, disabled: true }
  return { text: `${label} 가운데 아직 안 가져온 ${missing}달을 가져와요. ${timeText(missing)}${span === 'all' ? ALL_NOTE : ''}`, disabled: false }
}

/** 고른 기간을 가져오는 동안의 본문(진행 줄은 view.ts 그대로) */
export function fetchingBody(span: FetchSpan, today: string, total: number): string {
  return `${spanLabel(span, today)} 가운데 아직 안 가져온 ${total}달을 읽어요. ${timeText(total)} 다 끝날 때까지 이 창을 닫지 말아 주세요.`
}

/** months = 가져온(실패하지 않은) 달, firstShown = 넘겨 볼 끝 달. 가져온 달이 없으면 null */
export function doneNotice(months: string[], firstShown: string): { lead: string; rest: string } | null {
  const done = monthSpan(months)
  if (done === null) return null
  return {
    lead: `${spanText(done)}의 ${done.count}달을 가져왔어요.`,
    rest: `이제 기간 줄의 ‹ 단추로 ${fullMonthName(firstShown)}까지 넘겨 볼 수 있어요.`,
  }
}

/** 멈춘 뒤 오류 카드 아래 줄. months = 그때까지 가져온 달, remaining = 남은 달 수(N − K). 가져온 달이 없으면 null */
export function stoppedLine(span: FetchSpan, months: string[], remaining: number): string | null {
  const done = monthSpan(months)
  if (done === null) return null
  const name = SPAN_NAMES.find((item) => item.key === span)?.name ?? ''
  return `가져온 ${done.count}달(${spanText(done)})은 저장됐어요. 연결한 뒤 [${name}]을 다시 고르고 [비트에서 가져오기]를 누르면 남은 ${remaining}달만 읽어요.`
}

/** 기간 줄 옆 글 */
export function boundText(firstShown: string): string {
  return `· ${fullMonthName(firstShown)}부터 넘겨 볼 수 있어요`
}
