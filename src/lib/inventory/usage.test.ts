import { describe, expect, it } from 'vitest'
import { changeText, monthlyReport, usageIntervals } from './usage'

// 쓴 양(세기 사이)과 달별 보고(spec inventory REQ-7502 AC-7502.1·AC-7502.2, design.md 2절).
// 쓴 양 = 앞 세기 수 + (앞 세기 저장 시각 < 입고 저장 시각 ≤ 뒤 세기 저장 시각) 입고 수 − 뒤 세기 수. 물품·숫자는 지어낸 값

/** Supabase가 주는 timestamptz 모양 */
const at = (day: string, hour = 1) => `${day}T${String(hour).padStart(2, '0')}:00:00.123456+00:00`
const count = (itemId: string, day: string, qty: number, savedAt = at(day)) => ({ itemId, day, savedAt, qty })
const receipt = (itemId: string, savedAt: string, qty: number) => ({ itemId, savedAt, qty })

describe('AC-7502.1 usageIntervals', () => {
  it('AC-7502.1: 잇단 두 세기 사이 쓴 양 = 앞 수 + 그 사이 저장된 입고 − 뒤 수, 달은 뒤 세기 날짜의 달', () => {
    const counts = [count('a', '2026-11-07', 10), count('a', '2026-11-14', 6)]
    const receipts = [receipt('a', at('2026-11-10', 2), 5)]
    expect(usageIntervals(counts, receipts)).toEqual([
      { itemId: 'a', from: '2026-11-07', to: '2026-11-14', month: '2026-11', used: 9, missing: false },
    ])
  })

  it('AC-7502.1: 앞 세기와 같은 시각 입고는 빼고(<), 뒤 세기와 같은 시각 입고는 넣는다(≤). 앞·뒤 밖 입고는 빼고', () => {
    const counts = [count('a', '2026-11-07', 10), count('a', '2026-11-14', 6)]
    const receipts = [
      receipt('a', at('2026-11-07'), 100), // = 앞 세기 저장 시각 → 앞 세기에 들었음
      receipt('a', at('2026-11-14'), 3), // = 뒤 세기 저장 시각 → 이 사이
      receipt('a', at('2026-11-01'), 50), // 앞 세기보다 먼저
      receipt('a', at('2026-11-15'), 70), // 뒤 세기보다 뒤
    ]
    expect(usageIntervals(counts, receipts)).toEqual([
      { itemId: 'a', from: '2026-11-07', to: '2026-11-14', month: '2026-11', used: 7, missing: false },
    ])
  })

  it('AC-7502.1: 세기는 세기 날짜 차례로 이웃을 잇고(받은 차례와 상관없이), 달이 넘어가면 뒤 세기의 달', () => {
    const counts = [count('a', '2026-11-11', 4), count('a', '2026-10-28', 20), count('a', '2026-11-04', 12)]
    expect(usageIntervals(counts, [])).toEqual([
      { itemId: 'a', from: '2026-10-28', to: '2026-11-04', month: '2026-11', used: 8, missing: false },
      { itemId: 'a', from: '2026-11-04', to: '2026-11-11', month: '2026-11', used: 8, missing: false },
    ])
  })

  it('AC-7502.1: 첫 세기 앞에는 사이가 없다(세기 하나뿐이거나 없으면 빈 목록)', () => {
    expect(usageIntervals([count('a', '2026-11-07', 10)], [receipt('a', at('2026-11-01'), 5)])).toEqual([])
    expect(usageIntervals([], [receipt('a', at('2026-11-01'), 5)])).toEqual([])
  })

  it('AC-7502.1: 쓴 양이 0보다 작으면 0으로 세고 missing: true', () => {
    const counts = [count('a', '2026-11-07', 5), count('a', '2026-11-14', 9)]
    expect(usageIntervals(counts, [receipt('a', at('2026-11-10'), 2)])).toEqual([
      { itemId: 'a', from: '2026-11-07', to: '2026-11-14', month: '2026-11', used: 0, missing: true },
    ])
  })

  it('AC-7502.1: 물품마다 따로 잇고 다른 물품의 입고는 세지 않는다', () => {
    const counts = [
      count('a', '2026-11-07', 10),
      count('b', '2026-11-07', 100),
      count('a', '2026-11-14', 6),
      count('b', '2026-11-14', 40),
    ]
    const receipts = [receipt('b', at('2026-11-10'), 20), receipt('a', at('2026-11-12'), 1)]
    expect(usageIntervals(counts, receipts)).toEqual([
      { itemId: 'a', from: '2026-11-07', to: '2026-11-14', month: '2026-11', used: 5, missing: false },
      { itemId: 'b', from: '2026-11-07', to: '2026-11-14', month: '2026-11', used: 80, missing: false },
    ])
  })

  it('AC-7502.1: 저장 시각은 글자가 아니라 실제 시각으로 견준다(시간대·소수 자릿수가 달라도, 백만분의 1초까지)', () => {
    const counts = [
      count('a', '2026-11-07', 10, '2026-11-07T10:00:00+09:00'), // = 01:00:00Z
      count('a', '2026-11-14', 0, '2026-11-14T01:00:00.5+00:00'),
    ]
    const receipts = [
      receipt('a', '2026-11-07T01:00:00+00:00', 1000), // 앞 세기와 같은 시각 → 뺌
      receipt('a', '2026-11-07T01:00:00.000001Z', 1), // 1µs 뒤 → 넣음
      receipt('a', '2026-11-14T01:00:00.499999+00:00', 2), // 뒤 세기 1µs 앞 → 넣음
      receipt('a', '2026-11-14T10:00:00.5+09:00', 4), // 뒤 세기와 같은 시각 → 넣음
      receipt('a', '2026-11-14T01:00:00.500001+00:00', 2000), // 뒤 세기 1µs 뒤 → 뺌
    ]
    expect(usageIntervals(counts, receipts)[0]).toMatchObject({ used: 17, missing: false })
  })
})

describe('AC-7502.2 changeText', () => {
  it('AC-7502.2: 지난달과 견준 증감 글 — 차이와 비율(소수 첫째 자리까지 버림), 빼기는 −', () => {
    expect(changeText(34, 30)).toBe('+4 (+13.3%)')
    expect(changeText(26, 30)).toBe('−4 (−13.3%)')
    expect(changeText(1, 3)).toBe('−2 (−66.6%)')
    expect(changeText(0, 5)).toBe('−5 (−100.0%)')
  })

  it('AC-7502.2: 금액은 단위와 세 자리 쉼표를 붙인다', () => {
    expect(changeText(1_092_500, 1_000_000, '원')).toBe('+92,500원 (+9.2%)')
    expect(changeText(1_000_000, 2_500_000, '원')).toBe('−1,500,000원 (−60.0%)')
  })

  it("AC-7502.2: 지난달이 없거나 0이면 '새로 생김', 둘 다 0·없음이면 '–', 같으면 '변화 없음'(시안 글자)", () => {
    expect(changeText(5, null)).toBe('새로 생김')
    expect(changeText(5, 0)).toBe('새로 생김')
    expect(changeText(0, 0)).toBe('–')
    expect(changeText(0, null)).toBe('–')
    expect(changeText(null, null)).toBe('–')
    expect(changeText(null, 5)).toBe('–')
    expect(changeText(30, 30)).toBe('변화 없음')
  })
})

describe('AC-7502.2 monthlyReport', () => {
  const categories = [
    { id: 'c-sup', name: '치료 소모품', sortOrder: 1 },
    { id: 'c-med', name: '약품', sortOrder: 0 },
  ]
  const item = (id: string, categoryId: string, name: string, sortOrder: number, hidden = false) => ({
    id,
    categoryId,
    name,
    sortOrder,
    hidden,
  })
  const items = [
    item('c', 'c-sup', '주사기 3cc', 0),
    item('a', 'c-med', '히알루론산 주사 2mL', 0),
    item('e', 'c-sup', '알코올 솜', 2, true), // 숨겼지만 10월 입고가 있다
    item('b', 'c-med', '리도카인 주사', 1),
    item('d', 'c-sup', '주사기 5cc', 1, true), // 숨겼고 자료도 없다 → 줄 없음
    item('f', 'c-med', '새 패치', 2), // 세기 없음, 10월 입고만
  ]
  const counts = [
    // a: 9월 (40→30) 10 + (30+10→20) 20 = 30, 10월 (20+10→12) 18 + (12+24→20) 16 = 34
    count('a', '2026-08-25', 40),
    count('a', '2026-09-08', 30),
    count('a', '2026-09-29', 20),
    count('a', '2026-10-13', 12),
    count('a', '2026-10-27', 20),
    count('a', '2026-11-03', 15), // 11월 사이 → 9·10월 어디에도 안 듦
    // b: 9월 5, 10월 0 + (21→30, 입고 없음) 빠진 입고
    count('b', '2026-09-08', 26),
    count('b', '2026-09-29', 21),
    count('b', '2026-10-13', 21),
    count('b', '2026-10-27', 30),
    // c: 첫 세기가 9/29 → 9월 사이 없음, 10월 (100+200→60) 240 + (60→40) 20 = 260
    count('c', '2026-09-29', 100),
    count('c', '2026-10-13', 60),
    count('c', '2026-10-27', 40),
  ]
  const line = (itemId: string, day: string, savedAt: string, qty: number, amount: number) => ({ itemId, day, savedAt, qty, amount })
  const receipts = [
    line('a', '2026-09-15', at('2026-09-15'), 10, 185_000),
    line('a', '2026-10-05', at('2026-10-05'), 10, 185_000), // 한 입고의 두 줄(저장 시각이 같다)
    line('f', '2026-10-05', at('2026-10-05'), 3, 6_000),
    line('a', '2026-10-20', at('2026-10-20'), 24, 444_000),
    line('c', '2026-09-30', at('2026-10-02'), 200, 19_000), // 명세서는 9월, 저장은 10월 → 구입비는 9월
    line('c', '2026-10-31', at('2026-11-02'), 100, 9_500), // 명세서는 10월, 저장은 11월 → 구입비는 10월
    line('e', '2026-10-08', at('2026-10-08'), 5, 16_000),
  ]
  const report = () => monthlyReport({ month: '2026-10', items, categories, counts, receipts })
  const byId = (id: string) => items.find((i) => i.id === id)!

  it('AC-7502.2: 그 달에 끝난 세기 날짜들과 숫자 셋(구입비 합·들어온 기록 건수·세기 횟수)', () => {
    const r = report()
    expect(r.countDays).toEqual(['2026-10-13', '2026-10-27'])
    expect(r.numbers).toEqual({ cost: 660_500, receipts: 4, counts: 2 })
  })

  it('AC-7502.2: 물품마다 쓴 양(그 달에 끝난 사이 합)·구입비(명세서 날짜의 달)와 지난달·증감, 목록 차례(분류 → 물품)', () => {
    const r = report()
    expect(r.rows).toEqual([
      { item: byId('a'), used: 34, prevUsed: 30, cost: 629_000, prevCost: 185_000, change: '+4 (+13.3%)', missing: false },
      { item: byId('b'), used: 0, prevUsed: 5, cost: 0, prevCost: 0, change: '−5 (−100.0%)', missing: true },
      { item: byId('f'), used: null, prevUsed: null, cost: 6_000, prevCost: 0, change: '–', missing: false },
      { item: byId('c'), used: 260, prevUsed: null, cost: 9_500, prevCost: 19_000, change: '새로 생김', missing: false },
      { item: byId('e'), used: null, prevUsed: null, cost: 16_000, prevCost: 0, change: '–', missing: false },
    ])
    expect(r.rows[0].item).toBe(byId('a'))
  })

  it('AC-7502.2: 분류마다 구입비 합·지난달·증감(물품의 지금 분류 기준, 분류 차례), 전체 합은 항목 금액의 합', () => {
    const r = report()
    expect(r.categories).toEqual([
      { category: categories[1], cost: 635_000, prevCost: 185_000, change: '+450,000원 (+243.2%)' },
      { category: categories[0], cost: 25_500, prevCost: 19_000, change: '+6,500원 (+34.2%)' },
    ])
    expect(r.total).toEqual({ cost: 660_500, prevCost: 204_000, change: '+456,500원 (+223.7%)' })
    expect(r.total.cost).toBe(r.rows.reduce((sum, row) => sum + row.cost, 0))
    expect(r.numbers.cost).toBe(r.total.cost)
  })

  it('AC-7502.2: 세기가 없는 달은 세기 날짜가 비고 쓴 양은 모두 null(지난달 값은 그대로)', () => {
    const r = monthlyReport({ month: '2026-11', items, categories, counts: counts.filter((c) => c.day < '2026-11-01'), receipts })
    expect(r.countDays).toEqual([])
    expect(r.numbers).toEqual({ cost: 0, receipts: 0, counts: 0 })
    expect(r.rows.every((row) => row.used === null)).toBe(true)
    expect(r.rows.find((row) => row.item.id === 'a')).toMatchObject({ used: null, prevUsed: 34, change: '–' })
  })

  it('AC-7502.2: 들어온 기록 건수는 줄이 아니라 입고 한 건(저장 시각)으로 센다', () => {
    const r = monthlyReport({
      month: '2026-10',
      items,
      categories,
      counts: [],
      receipts: [
        line('a', '2026-10-05', at('2026-10-05'), 1, 100),
        line('b', '2026-10-05', at('2026-10-05'), 1, 200),
        line('a', '2026-10-05', at('2026-10-05', 3), 1, 300),
      ],
    })
    expect(r.numbers).toEqual({ cost: 600, receipts: 2, counts: 0 })
  })

  it('AC-7502.2: 물품·자료가 없으면 빈 표와 0', () => {
    const r = monthlyReport({ month: '2026-10', items: [], categories, counts: [], receipts: [] })
    expect(r).toEqual({
      countDays: [],
      numbers: { cost: 0, receipts: 0, counts: 0 },
      rows: [],
      categories: [],
      total: { cost: 0, prevCost: 0, change: '–' },
    })
  })
})
