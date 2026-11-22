import type { ListingNumbers } from '@/types/location'
import { m2ToPyeong } from './area'

// 매물 견주기(design.md 11절, AC-7910.2). 저장한 매물끼리만 견준다(상권 임대료 시세는 쓰지 않음, 명세가 정한 것 9).
// 넓이는 저장 ㎡(numeric(8,2)), 평은 화면에 보이는 평(area.ts m2ToPyeong — 30평으로 적은 99.17㎡는 30평) 한 곳이다.
// 금액은 원 정수이고 계산은 0.1평 단위 정수로 해서 버림이 흔들리지 않게 한다.
// 매물 줄 모양은 types/location.ts 한 곳이다(예전 import 길을 위해 여기서도 내보낸다)
export type { ListingNumbers }

/** 견주려면 같은 값(넓이 + 월세 또는 보증금)이 있는 매물이 이만큼 있어야 한다 */
export const MIN_LISTINGS_TO_COMPARE = 2
export const FEW_LISTINGS_TEXT = '매물을 2개 이상 저장하면 서로 견줘 드려요'

/** ㎡ → 화면 평의 0.1평 수(정수). 0 이하·숫자 아님은 null */
function pyeongTenths(areaM2: number): number | null {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return null
  return Math.round(m2ToPyeong(areaM2) * 10)
}

/** 평당 값 = 버림(won ÷ 화면 평). 넓이가 0.1평이 안 되면(0.32㎡ 이하) 셀 수 없어 RangeError */
export function perPyeong(won: number, areaM2: number): number {
  if (!Number.isSafeInteger(won) || won < 0) throw new RangeError(`금액은 0 이상 원 정수로 주세요: ${won}`)
  const tenths = pyeongTenths(areaM2)
  if (tenths === null || tenths <= 0) throw new RangeError(`넓이는 0.1평 이상 ㎡로 주세요: ${areaM2}`)
  // won ≤ 2^53, × 10이라도 셈은 BigInt로 해 버림이 흔들리지 않게 한다
  return Number((BigInt(won) * BigInt(10)) / BigInt(tenths))
}

/** perPyeong의 null 버전: 금액이나 넓이가 없거나 셀 수 없으면 null(위험 신호·견주기가 같이 쓴다) */
export function perPyeongOf(won: number | null, areaM2: number | null): number | null {
  if (won === null || areaM2 === null || !Number.isSafeInteger(won) || won < 0) return null
  const tenths = pyeongTenths(areaM2)
  return tenths === null || tenths <= 0 ? null : perPyeong(won, areaM2)
}

export type VsAverage = { pct: number; text: string }

/** 차이 % = 버림((값 − 평균) × 100 ÷ 평균), 0 쪽으로 버려 위·아래가 같다. |n| < 1이면 같아요 */
export function vsAverage(value: number, avg: number): VsAverage | null {
  if (avg <= 0) return value === avg ? { pct: 0, text: '평균과 같아요' } : null
  const pct = Math.trunc(((value - avg) * 100) / avg) + 0 // + 0: −0을 0으로
  if (pct === 0) return { pct, text: '평균과 같아요' }
  return { pct, text: `저장한 매물 평균보다 ${Math.abs(pct)}% ${pct > 0 ? '비싸요' : '싸요'}` }
}

export type ListingSide = { perPy: number; vs: VsAverage | null }
export type ListingView = { rent: ListingSide | null; deposit: ListingSide | null }
export type ListingComparison = {
  /** 견줄 매물이 모자라면 안내 글, 견주면 null */
  notice: string | null
  rentAvg: number | null
  depositAvg: number | null
  /** 매물 id → 평당 월세·보증금(넓이나 그 금액이 없으면 null)과 평균 견주기 */
  items: Record<string, ListingView>
}

type Side = 'rent' | 'deposit'

function sideOf(rows: readonly ListingNumbers[], side: Side): { perPy: Map<string, number>; avg: number | null } {
  const perPy = new Map<string, number>()
  for (const row of rows) {
    const value = perPyeongOf(row[side], row.areaM2)
    if (value !== null) perPy.set(row.id, value)
  }
  if (perPy.size < MIN_LISTINGS_TO_COMPARE) return { perPy, avg: null }
  let sum = 0
  for (const v of perPy.values()) sum += v
  return { perPy, avg: Math.floor(sum / perPy.size) }
}

function view(id: string, side: { perPy: Map<string, number>; avg: number | null }): ListingSide | null {
  const perPy = side.perPy.get(id)
  if (perPy === undefined) return null
  return { perPy, vs: side.avg === null ? null : vsAverage(perPy, side.avg) }
}

/** 평균은 넓이·그 금액이 있는 저장 매물 모두의 평당 값 평균(버림). 월세·보증금은 따로 센다 */
export function compareListings(rows: readonly ListingNumbers[]): ListingComparison {
  const rent = sideOf(rows, 'rent')
  const deposit = sideOf(rows, 'deposit')
  const items: Record<string, ListingView> = {}
  for (const row of rows) items[row.id] = { rent: view(row.id, rent), deposit: view(row.id, deposit) }
  const notice = rent.avg === null && deposit.avg === null ? FEW_LISTINGS_TEXT : null
  return { notice, rentAvg: rent.avg, depositAvg: deposit.avg, items }
}

export type PyeongRange = { from: number | null; to: number | null }

/** ○평~○평(양 끝 넣음), 화면에 보이는 평(m2ToPyeong)으로 견준다. 둘 다 비우면 그대로, 하나라도 정하면 넓이 없는 매물은 뺀다 */
export function filterByPyeong<T extends ListingNumbers>(rows: readonly T[], range: PyeongRange): readonly T[] {
  if (range.from === null && range.to === null) return rows
  const { from, to } = range
  return rows.filter((row) => {
    if (row.areaM2 === null || !Number.isFinite(row.areaM2) || row.areaM2 < 0) return false
    const py = m2ToPyeong(row.areaM2)
    return (from === null || py >= from) && (to === null || py <= to)
  })
}
