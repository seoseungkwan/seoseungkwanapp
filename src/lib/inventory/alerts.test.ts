import { describe, expect, it } from 'vitest'
import { countWarning, expiryText, inventoryAlerts } from './alerts'

// 챙길 것(주문하세요·기한 가까움)과 세기 경고(spec inventory REQ-7502 AC-7502.3·AC-7502.4). 물품·숫자는 지어낸 값

const TODAY = '2026-11-21' // + 30일 = 2026-12-21
type Over = { id: string; qty?: number; minQty?: number | null; expiry?: string | null; hidden?: boolean; orderedAt?: string | null }
const item = ({ id, qty = 0, minQty = null, expiry = null, hidden = false, orderedAt = null }: Over) => ({
  id,
  name: `물품 ${id}`,
  qty,
  minQty,
  expiry,
  hidden,
  orderedAt,
})

describe('AC-7502.3 inventoryAlerts', () => {
  const list = [
    item({ id: 'a', qty: 4, minQty: 10, expiry: '2027-03-31' }), // 주문하세요
    item({ id: 'b', qty: 26, minQty: 10, expiry: '2026-12-05' }), // 기한 14일 남음
    item({ id: 'c', qty: 40, minQty: 100, orderedAt: '2026-11-20T02:00:00+00:00' }), // 주문함
    item({ id: 'd', qty: 5, minQty: 3, expiry: '2026-11-18' }), // 기한 3일 지남
    item({ id: 'e', qty: 3, minQty: 4, expiry: '2026-12-21' }), // 주문하세요 + 기한 30일 남음
    item({ id: 'f', qty: 10, minQty: 10, expiry: '2026-12-22' }), // 같은 수·31일 → 알림 없음
    item({ id: 'g', qty: 0, minQty: 5, expiry: '2026-11-01', hidden: true }), // 숨김 → 알림 없음
    item({ id: 'h', qty: 0 }), // 최소 수량·기한 없음 → 알림 없음
    item({ id: 'i', qty: 1, minQty: 5, expiry: TODAY, orderedAt: '2026-11-19T00:00:00+00:00' }), // 주문함 + 오늘까지
  ]
  const at = (r: { item: { id: string }; kind: string; days: number | null; ordered: boolean }) => [r.item.id, r.kind, r.days, r.ordered]

  it('AC-7502.3: 줄 차례는 주문하세요 → 기한 가까움 → 주문함이고 각각 받은 목록 차례', () => {
    const out = inventoryAlerts(list, TODAY)
    expect(out.rows.map(at)).toEqual([
      ['a', 'low', null, false],
      ['e', 'low', null, false],
      ['b', 'expiry', 14, false],
      ['d', 'expiry', -3, false],
      ['e', 'expiry', 30, false],
      ['i', 'expiry', 0, false],
      ['c', 'low', null, true],
      ['i', 'low', null, true],
    ])
  })

  it('AC-7502.3: 주문하세요 수는 주문함을 빼고, 기한 가까움 수는 이미 지난 것·주문한 물품의 기한도 센다', () => {
    const out = inventoryAlerts(list, TODAY)
    expect(out.low).toBe(2)
    expect(out.soon).toBe(4)
  })

  it('AC-7502.3: 수량 < 최소 수량일 때만 주문하세요(같으면 없음), 최소 수량이 비면 알림 없음', () => {
    expect(inventoryAlerts([item({ id: 'x', qty: 9, minQty: 10 })], TODAY).rows).toHaveLength(1)
    expect(inventoryAlerts([item({ id: 'x', qty: 10, minQty: 10 })], TODAY).rows).toEqual([])
    expect(inventoryAlerts([item({ id: 'x', qty: -2, minQty: null })], TODAY).rows).toEqual([])
    expect(inventoryAlerts([item({ id: 'x', qty: -1, minQty: 0 })], TODAY)).toMatchObject({ low: 1, soon: 0 })
  })

  it('AC-7502.3: 기한 ≤ 오늘 + 30일이면 기한 가까움(days = 기한 − 오늘), 31일 뒤는 없음', () => {
    const days = (expiry: string) => inventoryAlerts([item({ id: 'x', expiry })], TODAY).rows.map((r) => r.days)
    expect(days('2026-12-21')).toEqual([30])
    expect(days('2026-12-22')).toEqual([])
    expect(days(TODAY)).toEqual([0])
    expect(days('2026-11-20')).toEqual([-1])
    expect(days('2025-11-21')).toEqual([-365])
  })

  it('AC-7502.3: 숨긴 물품은 보지 않는다', () => {
    const hidden = [item({ id: 'x', qty: 0, minQty: 5, expiry: TODAY, hidden: true })]
    expect(inventoryAlerts(hidden, TODAY)).toEqual({ low: 0, soon: 0, rows: [] })
  })

  it('AC-7502.3: 알림 줄은 받은 물품 그대로를 담고, 물품이 없으면 0·빈 목록', () => {
    const one = item({ id: 'x', qty: 1, minQty: 2 })
    expect(inventoryAlerts([one], TODAY).rows[0].item).toBe(one)
    expect(inventoryAlerts([], TODAY)).toEqual({ low: 0, soon: 0, rows: [] })
  })
})

describe('AC-7502.3 expiryText', () => {
  it("AC-7502.3: 'n일 남음' · '오늘까지' · 'n일 지났어요'", () => {
    expect(expiryText(14)).toBe('14일 남음')
    expect(expiryText(1)).toBe('1일 남음')
    expect(expiryText(0)).toBe('오늘까지')
    expect(expiryText(-1)).toBe('1일 지났어요')
    expect(expiryText(-3)).toBe('3일 지났어요')
  })
})

describe('AC-7502.4 countWarning', () => {
  it('AC-7502.4: 적은 수 > 지금 수량이면 지난 수량·들어온 수와 함께 경고 글', () => {
    expect(countWarning(18, { qty: 8, lastCountQty: 8 })).toBe(
      '센 수량 18이 지난 수량 8 + 들어온 0 = 8보다 많아요. 입고 기록이 빠졌을 수 있어요.',
    )
    expect(countWarning(20, { qty: 15, lastCountQty: 5 })).toBe(
      '센 수량 20이 지난 수량 5 + 들어온 10 = 15보다 많아요. 입고 기록이 빠졌을 수 있어요.',
    )
  })

  it('AC-7502.4: 지난 세기가 없으면 지난 수량 0, 들어온 = 지금 수량', () => {
    expect(countWarning(7, { qty: 5, lastCountQty: null })).toBe(
      '센 수량 7이 지난 수량 0 + 들어온 5 = 5보다 많아요. 입고 기록이 빠졌을 수 있어요.',
    )
  })

  it('AC-7502.4: 적은 수가 지금 수량 이하이거나 비었으면 경고 없음(null)', () => {
    expect(countWarning(8, { qty: 8, lastCountQty: 8 })).toBeNull()
    expect(countWarning(3, { qty: 8, lastCountQty: 2 })).toBeNull()
    expect(countWarning(0, { qty: 0, lastCountQty: null })).toBeNull()
    expect(countWarning(null, { qty: 8, lastCountQty: 8 })).toBeNull()
  })
})
