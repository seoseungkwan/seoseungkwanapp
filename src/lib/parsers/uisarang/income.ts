import type { RevenueDayRow } from '@/types/revenue'
import type { UisRead, UisSpan } from '@/types/uisarang'
import { badRow, badTotal, bodyRows, isCount, numberOf, ok, squash, won, type Body, type Sheet } from './cells'

// 일일수입통계 → 그날 매출 한 줄(specs/uisarang-upload design.md §4-1) [환자 자료 구역].
// 합계 줄만 읽는다(보험구분 줄·초진수·재진수·현금영수증수납액은 쓰지 않는다 — 현금영수증은 현금 안에 이미 들어 있다)

const TOTAL = '합계'
const MONEY = ['총진료비', '급여총액', '청구액', '진료수납액', '본인부담금', '비급여', '현금수납액', '카드수납액'] as const
type Money = (typeof MONEY)[number]

const NINE_NULL = {
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
} as const

const below0 = (n: number | null): boolean => n === null || n < 0

export function readIncome(sheet: Sheet, span: UisSpan): Body<UisRead> {
  const { grid, col } = sheet
  let totalAt = -1
  for (const { row, i } of bodyRows(sheet)) {
    if (squash(row[col['보험구분']]) === TOTAL) {
      totalAt = i
      break
    }
  }
  if (totalAt === -1) return badTotal()
  const row = grid[totalAt]

  // 금액은 원 미만을 버린다. 못 읽는 글자·안전한 정수 밖이면 그 줄 E-UIS-ROW
  const money = {} as Record<Money, number | null>
  for (const name of MONEY) {
    const value = numberOf(row[col[name]])
    if (value !== null && !(Number.isFinite(value) && Number.isSafeInteger(won(value)))) return badRow(totalAt + 1)
    money[name] = value === null ? null : won(value)
  }
  // 총진료비는 합친 칸이라 한 줄 아래에 값이 있을 수 있다
  if (money['총진료비'] === null && totalAt + 1 < grid.length) {
    const value = numberOf(grid[totalAt + 1][col['총진료비']])
    if (value !== null && !(Number.isFinite(value) && Number.isSafeInteger(won(value)))) return badRow(totalAt + 2)
    money['총진료비'] = value === null ? null : won(value)
  }
  const visits = numberOf(row[col['인원계']])
  if (visits !== null && !isCount(visits)) return badRow(totalAt + 1)

  const date = span.from
  const head = { date, visits, newPatients: null, returnVisits: null } // 초진수는 신환(병원 첫 내원)이 아니다 — 신환은 위쪽 표에서만
  const { 총진료비: total, 현금수납액: cash, 카드수납액: card, 진료수납액: paid } = money
  if (total === null || cash === null || card === null || total < 0 || cash < 0 || card < 0 || (paid !== null && paid !== cash + card)) {
    return ok({ kind: 'income', span, row: { ...head, ...NINE_NULL, unconfirmed: true, splitUnconfirmed: false } })
  }

  const { 청구액: insurer, 본인부담금: copay, 비급여: noncovered, 급여총액: covered } = money
  const otherTotal = insurer === null || copay === null || noncovered === null ? null : total - insurer - copay - noncovered
  const split =
    insurer === null || copay === null || noncovered === null || otherTotal === null || covered === null ||
    [insurer, copay, noncovered, covered, otherTotal].some(below0) || insurer + copay !== covered
  const parts = split ? { insurer: null, noncovered: null, copay: null, otherTotal: null } : { insurer, noncovered, copay, otherTotal }
  const result: RevenueDayRow = {
    ...head,
    total,
    insurer: parts.insurer,
    noncovered: parts.noncovered,
    copay: parts.copay,
    otherTotal: parts.otherTotal,
    cash, // 계좌이체는 현금에 들어 있다
    card,
    transfer: 0,
    receivableIn: 0, // 엑셀에 미수 입금이 없다
    unconfirmed: false,
    splitUnconfirmed: split,
  }
  return ok({ kind: 'income', span, row: result })
}
