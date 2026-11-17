import type { LedgerRow, RsvKind, VisitKind } from '@/types/sunap'

// 수납일지 장부 줄 세우기 [환자 자료 구역] (spec sunap-sort REQ-5301). 순수 함수만: 받은 배열을 바꾸지 않고 새 배열을 돌려준다.
// 화면은 { row, no }(no = 접수 번호)를 넘긴다 → 세운 뒤에도 no가 그대로다. 비교가 같으면 받은 차례(접수 순)를 지킨다

export type LedgerSort =
  | { key: 'name' | 'kind' | 'cash' | 'card' | 'transfer' | 'unpaid' | 'block' | 'pt'; dir: 'asc' | 'desc' }
  | { key: 'rsv'; by: 'kind' | 'date'; dir: 'asc' | 'desc' }

const NAME = new Intl.Collator('ko')
// 구분 초진 → 90일초진 → 재진. 예약 종류 주사치료 → 진료(경과) → 기타 → 종류 모름('예약 안 하고 가심'은 따로 늘 맨 뒤)
const KIND_ORDER: Record<VisitKind, number> = { new: 0, d90: 1, re: 2 }
const RSV_ORDER: Record<RsvKind, number> = { inj: 0, visit: 1, etc: 2, unknown: 3, none: 4 }
const AT = /^\d{12}$/

/** 예약 시각 yyyyMMddHHmm(없거나 모양이 틀리면 null) */
const atOf = (row: LedgerRow): string | null => (row.rsv.at !== null && AT.test(row.rsv.at) ? row.rsv.at : null)
const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 날짜 있는 줄끼리는 sign 쪽으로, 날짜 없는 줄은 sign과 상관없이 뒤 */
function compareAt(a: LedgerRow, b: LedgerRow, sign: number): number {
  const x = atOf(a)
  const y = atOf(b)
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
  return sign * textOrder(x, y)
}

function comparer(sort: LedgerSort): (a: LedgerRow, b: LedgerRow) => number {
  const sign = sort.dir === 'desc' ? -1 : 1
  switch (sort.key) {
    case 'name':
      return (a, b) => sign * NAME.compare(a.name, b.name)
    case 'kind':
      return (a, b) => sign * (KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    case 'cash':
    case 'card':
    case 'transfer':
    case 'unpaid': {
      const field = sort.key
      // FREE 줄은 네 칸이 다 0원이다
      return (a, b) => sign * (a[field] - b[field])
    }
    case 'block':
    case 'pt': {
      const field = sort.key
      // 오름차순 = 체크 안 한 줄 → 체크한 줄
      return (a, b) => sign * (Number(a[field]) - Number(b[field]))
    }
    case 'rsv': {
      const byKind = sort.by === 'kind'
      return (a, b) => {
        const an = a.rsv.kind === 'none'
        const bn = b.rsv.kind === 'none'
        // '예약 안 하고 가심'은 asc·desc 모두 맨 뒤
        if (an || bn) return an === bn ? 0 : an ? 1 : -1
        if (byKind) {
          const kind = RSV_ORDER[a.rsv.kind] - RSV_ORDER[b.rsv.kind]
          if (kind !== 0) return sign * kind
        }
        return compareAt(a, b, sign)
      }
    }
  }
}

/** 장부 줄 세우기(AC-5301.1~4). 기준 null이면 받은 차례 그대로(새 배열) */
export function sortLedger<T extends { row: LedgerRow }>(items: readonly T[], sort: LedgerSort | null): T[] {
  if (sort === null) return [...items]
  const compare = comparer(sort)
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item.row, b.item.row) || a.index - b.index)
    .map(({ item }) => item)
}
