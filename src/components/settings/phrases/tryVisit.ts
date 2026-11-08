import type { Phrases } from '@/lib/precheck/memo'
import type { Visit } from '@/types/precheck'

// '메모 시험'의 가짜 진료(memo-settings AC-3007.4, design.md §4). 차트 글(한 줄에 하나)과 처방("코드 수량" 한 줄에 하나)으로 만든다.
// 화면 상태에만 두고 저장하지 않는다. 환자 자료가 아니다. 순수 함수다

/** 메모 시험 글: 화면 상태에만 둔다 */
export type TryText = { chart: string; rx: string }

/** 처음 글: 지난 화면의 가짜 진료(LBP / MBB L4,5 both, LA358 2) */
export const TRY_CHART = 'LBP\nMBB L4,5 both'
export const TRY_RX = 'LA358 2'

const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

/** 차트 글: 한 줄에 하나, 빈 줄은 뺀다 */
export const parseChartText = (text: string): string[] => linesOf(text)

/** 처방: 한 줄에 "코드 수량". 수량이 없거나 0 이하·숫자가 아니면 1이다 */
export function parseRxText(text: string): { code: string; qty: number }[] {
  return linesOf(text).map((line) => {
    const [code, quantity] = line.split(/\s+/)
    const qty = Number(quantity)
    return { code, qty: quantity !== undefined && Number.isFinite(qty) && qty > 0 ? qty : 1 }
  })
}

/** 가짜 진료 한 건: 처방은 모두 급여이고 이름은 코드 사전의 메모 이름(없으면 코드)이다 */
export function tryVisit(chart: string, rx: string, phrases: Pick<Phrases, 'CODEMAP'>): Visit {
  const lines = parseChartText(chart)
  return {
    key: 'try',
    chart: '1',
    date: '2026-01-05',
    month: '2026-01',
    name: '가짜 진료',
    lines,
    hints: lines.map(() => null),
    rx: parseRxText(rx).map(({ code, qty }) => ({ code, name: Object.hasOwn(phrases.CODEMAP, code) ? phrases.CODEMAP[code].n : code, qty, benefit: true, pay: '급여' })),
    dx: [],
    memosInBit: [],
  }
}
