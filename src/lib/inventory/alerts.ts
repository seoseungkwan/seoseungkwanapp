import { addDays, compareYmd, diffDays, isYmd } from '@/lib/analytics/dates'

// 챙길 것(주문하세요·기한 가까움)과 세기 경고 (spec inventory REQ-7502 AC-7502.3·AC-7502.4, design.md 2절). 순수 함수만.
// 입력 타입은 필요한 칸만 적는다(src/types/inventory.ts의 InvItem과 칸 이름이 같다)

/** 기한 가까움: 기한 ≤ 오늘 + 30일(이미 지난 것 포함) */
export const EXPIRY_WINDOW_DAYS = 30

export type AlertKind = 'low' | 'expiry'
type AlertItem = { qty: number; minQty: number | null; expiry: string | null; hidden: boolean; orderedAt: string | null }
/** days = 기한 − 오늘(음수 = 지남, 'low'는 null). ordered = 주문함('low' 줄만) */
export type AlertRow<T> = { item: T; kind: AlertKind; days: number | null; ordered: boolean }
export type InventoryAlerts<T> = { low: number; soon: number; rows: AlertRow<T>[] }

/**
 * 숨기지 않은 물품만 보고 (물품, 종류)마다 줄 하나. 차례: 주문하세요 → 기한 가까움 → 주문함, 각각 받은 차례(목록 차례로 넘긴다).
 * low = 주문함이 아닌 주문하세요 수, soon = 기한 가까움 수(주문해도 남는다)
 */
export function inventoryAlerts<T extends AlertItem>(items: readonly T[], today: string): InventoryAlerts<T> {
  const until = addDays(today, EXPIRY_WINDOW_DAYS)
  const low: AlertRow<T>[] = []
  const soon: AlertRow<T>[] = []
  const ordered: AlertRow<T>[] = []
  for (const item of items) {
    if (item.hidden) continue
    if (item.minQty !== null && item.qty < item.minQty) {
      const isOrdered = item.orderedAt !== null
      ;(isOrdered ? ordered : low).push({ item, kind: 'low', days: null, ordered: isOrdered })
    }
    if (item.expiry !== null && isYmd(item.expiry) && compareYmd(item.expiry, until) <= 0) {
      soon.push({ item, kind: 'expiry', days: diffDays(today, item.expiry), ordered: false })
    }
  }
  return { low: low.length, soon: soon.length, rows: [...low, ...soon, ...ordered] }
}

/** 'n일 남음' · '오늘까지' · 'n일 지났어요' */
export function expiryText(days: number): string {
  if (days > 0) return `${days}일 남음`
  if (days === 0) return '오늘까지'
  return `${-days}일 지났어요`
}

/** 센 수가 지금 수량(지난 수량 + 그 뒤 들어옴)보다 많을 때만 경고 글. 저장은 막지 않는다 */
export function countWarning(entered: number | null, item: { qty: number; lastCountQty: number | null }): string | null {
  if (entered === null || !(entered > item.qty)) return null
  const last = item.lastCountQty ?? 0
  return `센 수량 ${entered}이 지난 수량 ${last} + 들어온 ${item.qty - last} = ${item.qty}보다 많아요. 입고 기록이 빠졌을 수 있어요.`
}
