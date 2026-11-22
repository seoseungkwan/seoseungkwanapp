// 매물 견주기(design.md 11절, AC-7910.2). 저장한 매물끼리만 견준다(상권 임대료 시세는 쓰지 않음, 명세가 정한 것 9).
// 넓이는 저장 ㎡(numeric(8,2)), 1평 = 400/121㎡. 금액은 원 정수이고 계산은 0.01㎡ 단위 정수로 해서 버림이 흔들리지 않게 한다.
// 매물 줄 모양은 types/location.ts(TASK-2)가 생기기 전이라 여기서 필요한 칸만 둔다(합칠 때 맞춤)

export type ListingNumbers = { id: string; areaM2: number | null; rent: number | null; deposit: number | null }

/** 견주려면 같은 값(넓이 + 월세 또는 보증금)이 있는 매물이 이만큼 있어야 한다 */
export const MIN_LISTINGS_TO_COMPARE = 2
export const FEW_LISTINGS_TEXT = '매물을 2개 이상 저장하면 서로 견줘 드려요'

/** ㎡ → 0.01㎡ 정수(저장 값은 소수 2자리라 반올림은 소수 오차만 없앤다) */
const centiM2 = (m2: number) => Math.round(m2 * 100)
/** 평 → 0.01㎡ 정수, 버림(평으로 적어 ㎡로 버려 저장한 값과 같은 수) */
const centiM2OfPyeong = (py: number) => Math.floor((Math.round(py * 100) * 400) / 121)

/** 평당 값 = 버림(won ÷ 평), 평 = ㎡ × 121 ÷ 400 */
export function perPyeong(won: number, areaM2: number): number {
  if (!Number.isSafeInteger(won) || won < 0) throw new RangeError(`금액은 0 이상 원 정수로 주세요: ${won}`)
  const area = centiM2(areaM2)
  if (!Number.isFinite(areaM2) || area <= 0) throw new RangeError(`넓이는 0보다 큰 ㎡로 주세요: ${areaM2}`)
  return Math.floor((won * 40_000) / (area * 121))
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
    const won = row[side]
    if (won !== null && row.areaM2 !== null) perPy.set(row.id, perPyeong(won, row.areaM2))
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

/** ○평~○평(양 끝 넣음). 둘 다 비우면 그대로, 하나라도 정하면 넓이 없는 매물은 뺀다 */
export function filterByPyeong<T extends ListingNumbers>(rows: readonly T[], range: PyeongRange): readonly T[] {
  if (range.from === null && range.to === null) return rows
  const min = range.from === null ? null : centiM2OfPyeong(range.from)
  const max = range.to === null ? null : centiM2OfPyeong(range.to)
  return rows.filter((row) => {
    if (row.areaM2 === null) return false
    const area = centiM2(row.areaM2)
    return (min === null || area >= min) && (max === null || area <= max)
  })
}
