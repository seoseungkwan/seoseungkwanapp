import { describe, expect, it } from 'vitest'
import type { LedgerRow, LedgerRsv } from '@/types/sunap'
import { sortLedger, type LedgerSort } from './ledgerSort'

// 수납일지 장부 줄 세우기 규칙(spec sunap-sort REQ-5301). 화면은 { row, no }(no = 접수 번호)를 넘긴다.
// 이름은 ○○로 가린 가짜, 차트번호·금액·예약 시각은 지어낸 값

const base: LedgerRow = {
  chart: '',
  name: '',
  time: '09:00',
  kind: 're',
  cash: 0,
  card: 0,
  transfer: 0,
  unpaid: 0,
  free: false,
  block: false,
  pt: false,
  rsv: { kind: 'none', source: 'bit', at: null },
  note: '',
  edited: [],
  doctor: null,
}
function row(over: Partial<LedgerRow>): LedgerRow {
  const r = { ...base, ...over }
  return { ...r, free: r.cash + r.card + r.transfer + r.unpaid === 0 }
}
/** 받은 차례대로 no 1, 2, 3 … */
const items = (rows: LedgerRow[]) => rows.map((r, index) => ({ row: r, no: index + 1 }))
const nos = (list: { no: number }[]) => list.map(({ no }) => no)
const rsv = (kind: LedgerRsv['kind'], at: string | null, source: LedgerRsv['source'] = 'bit'): LedgerRsv => ({ kind, source, at })

describe('AC-5301.1 이름·구분·금액·Block·물리치료로 세우기', () => {
  it('AC-5301.1: 이름은 가나다 순(asc), desc는 거꾸로이고 같은 이름은 접수 차례 그대로', () => {
    const list = items([
      row({ chart: '1', name: '하○○' }),
      row({ chart: '2', name: '김○○' }),
      row({ chart: '3', name: '가○○' }),
      row({ chart: '4', name: '김○○' }),
      row({ chart: '5', name: '나○○' }),
    ])
    expect(nos(sortLedger(list, { key: 'name', dir: 'asc' }))).toEqual([3, 2, 4, 5, 1])
    expect(nos(sortLedger(list, { key: 'name', dir: 'desc' }))).toEqual([1, 5, 2, 4, 3])
  })

  it('AC-5301.1: 이름 비교는 한국어 비교(앞 글자가 같으면 다음 글자, 짧은 이름이 먼저)', () => {
    const list = items([row({ name: '김영희' }), row({ name: '김영' }), row({ name: '강하늘' }), row({ name: '김가람' })])
    expect(sortLedger(list, { key: 'name', dir: 'asc' }).map(({ row: r }) => r.name)).toEqual(['강하늘', '김가람', '김영', '김영희'])
  })

  it('AC-5301.1: 구분은 초진 → 90일초진 → 재진, desc는 재진 → 90일초진 → 초진. 같은 구분은 접수 차례', () => {
    const list = items([
      row({ kind: 're' }),
      row({ kind: 'd90' }),
      row({ kind: 'new' }),
      row({ kind: 're' }),
      row({ kind: 'new' }),
      row({ kind: 'd90' }),
    ])
    expect(nos(sortLedger(list, { key: 'kind', dir: 'asc' }))).toEqual([3, 5, 2, 6, 1, 4])
    expect(nos(sortLedger(list, { key: 'kind', dir: 'desc' }))).toEqual([1, 4, 2, 6, 3, 5])
  })

  it('AC-5301.1: 금액은 그 칸 숫자(FREE 줄은 0원). 현금·카드·계좌·미수 모두', () => {
    const list = items([
      row({ cash: 4700, card: 15000 }),
      row({}), // FREE
      row({ cash: 12000, transfer: 25000 }),
      row({ card: 9800, unpaid: 16300 }),
      row({ cash: 3900, unpaid: 2000 }),
    ])
    expect(sortLedger(list, { key: 'cash', dir: 'asc' }).map(({ row: r }) => r.cash)).toEqual([0, 0, 3900, 4700, 12000])
    expect(nos(sortLedger(list, { key: 'cash', dir: 'asc' }))).toEqual([2, 4, 5, 1, 3])
    expect(nos(sortLedger(list, { key: 'cash', dir: 'desc' }))).toEqual([3, 1, 5, 2, 4])
    expect(nos(sortLedger(list, { key: 'card', dir: 'asc' }))).toEqual([2, 3, 5, 4, 1])
    expect(nos(sortLedger(list, { key: 'card', dir: 'desc' }))).toEqual([1, 4, 2, 3, 5])
    expect(nos(sortLedger(list, { key: 'transfer', dir: 'desc' }))).toEqual([3, 1, 2, 4, 5])
    expect(nos(sortLedger(list, { key: 'unpaid', dir: 'asc' }))).toEqual([1, 2, 3, 5, 4])
    expect(nos(sortLedger(list, { key: 'unpaid', dir: 'desc' }))).toEqual([4, 5, 1, 2, 3])
  })

  it('AC-5301.1: Block·물리치료는 asc 체크 안 한 줄 → 체크한 줄, desc 체크한 줄 먼저. 같으면 접수 차례', () => {
    const list = items([
      row({ block: true, pt: false }),
      row({ block: false, pt: true }),
      row({ block: true, pt: true }),
      row({ block: false, pt: false }),
    ])
    expect(nos(sortLedger(list, { key: 'block', dir: 'asc' }))).toEqual([2, 4, 1, 3])
    expect(nos(sortLedger(list, { key: 'block', dir: 'desc' }))).toEqual([1, 3, 2, 4])
    expect(nos(sortLedger(list, { key: 'pt', dir: 'asc' }))).toEqual([1, 4, 2, 3])
    expect(nos(sortLedger(list, { key: 'pt', dir: 'desc' }))).toEqual([2, 3, 1, 4])
  })

  it('AC-5301.1: 받은 줄 차례가 접수 차례다(거르고 받은 no가 띄엄띄엄이어도 no·row를 그대로 돌려준다)', () => {
    const a = { row: row({ name: '나○○' }), no: 7 }
    const b = { row: row({ name: '가○○' }), no: 3 }
    const c = { row: row({ name: '나○○' }), no: 2 }
    expect(sortLedger([a, b, c], { key: 'name', dir: 'asc' })).toEqual([b, a, c])
    expect(sortLedger([a, b, c], { key: 'name', dir: 'desc' })).toEqual([a, c, b])
  })
})

// 다음 예약 시험 줄(no = 차례)
const RSV_ROWS = items([
  row({ rsv: rsv('inj', '202611201100') }), // 1
  row({ rsv: rsv('none', null) }), // 2
  row({ rsv: rsv('visit', '202611181000') }), // 3
  row({ rsv: rsv('inj', null, 'hand') }), // 4 직접 고름(날짜 없음)
  row({ rsv: rsv('inj', '202611191030') }), // 5
  row({ rsv: rsv('unknown', '202611210930') }), // 6
  row({ rsv: rsv('etc', '202611220900') }), // 7
  row({ rsv: rsv('visit', null, 'hand') }), // 8 직접 고름(날짜 없음)
  row({ rsv: rsv('none', null, 'hand') }), // 9 직접 고른 예약 안 하고 가심
  row({ rsv: rsv('visit', '202611241400') }), // 10
])

describe('AC-5301.2 다음 예약 종류 순', () => {
  it('AC-5301.2: asc 주사치료 → 진료(경과) → 기타 → 종류 모름, 같은 종류 안은 가까운 날 먼저·날짜 없는 줄은 그 종류 맨 뒤, 예약 안 하고 가심은 맨 뒤', () => {
    expect(nos(sortLedger(RSV_ROWS, { key: 'rsv', by: 'kind', dir: 'asc' }))).toEqual([5, 1, 4, 3, 10, 8, 7, 6, 2, 9])
  })

  it('AC-5301.2: desc 종류 모름 → 기타 → 진료(경과) → 주사치료, 같은 종류 안은 먼 날 먼저·날짜 없는 줄은 그 종류 맨 뒤, 예약 안 하고 가심은 그래도 맨 뒤', () => {
    expect(nos(sortLedger(RSV_ROWS, { key: 'rsv', by: 'kind', dir: 'desc' }))).toEqual([6, 7, 10, 3, 8, 1, 5, 4, 2, 9])
  })

  it('AC-5301.2: 같은 종류·같은 날짜면 접수 차례(asc·desc 모두)', () => {
    const list = items([
      row({ rsv: rsv('inj', '202611191030') }),
      row({ rsv: rsv('inj', '202611191030') }),
      row({ rsv: rsv('inj', null, 'hand') }),
      row({ rsv: rsv('inj', null, 'hand') }),
    ])
    expect(nos(sortLedger(list, { key: 'rsv', by: 'kind', dir: 'asc' }))).toEqual([1, 2, 3, 4])
    expect(nos(sortLedger(list, { key: 'rsv', by: 'kind', dir: 'desc' }))).toEqual([1, 2, 3, 4])
  })
})

describe('AC-5301.3 다음 예약 날짜 순', () => {
  it('AC-5301.3: asc 가까운 날 먼저, 날짜 없는 예약 줄은 날짜 있는 줄 뒤, 예약 안 하고 가심은 맨 뒤', () => {
    expect(nos(sortLedger(RSV_ROWS, { key: 'rsv', by: 'date', dir: 'asc' }))).toEqual([3, 5, 1, 6, 7, 10, 4, 8, 2, 9])
  })

  it('AC-5301.3: desc 먼 날 먼저, 날짜 없는 예약 줄은 그래도 날짜 있는 줄 뒤, 예약 안 하고 가심은 맨 뒤', () => {
    expect(nos(sortLedger(RSV_ROWS, { key: 'rsv', by: 'date', dir: 'desc' }))).toEqual([10, 7, 6, 1, 5, 3, 4, 8, 2, 9])
  })

  it('AC-5301.3: 같은 날짜·시각이면 종류와 상관없이 접수 차례(asc·desc 모두), 같은 날 다른 시각은 시각 순', () => {
    const list = items([
      row({ rsv: rsv('visit', '202611191030') }),
      row({ rsv: rsv('inj', '202611191030') }),
      row({ rsv: rsv('etc', '202611190900') }),
      row({ rsv: rsv('unknown', '202611191030') }),
    ])
    expect(nos(sortLedger(list, { key: 'rsv', by: 'date', dir: 'asc' }))).toEqual([3, 1, 2, 4])
    expect(nos(sortLedger(list, { key: 'rsv', by: 'date', dir: 'desc' }))).toEqual([1, 2, 4, 3])
  })
})

describe('AC-5301.4 접수 순·받은 배열', () => {
  const SORTS: (LedgerSort | null)[] = [
    null,
    { key: 'name', dir: 'asc' },
    { key: 'kind', dir: 'desc' },
    { key: 'cash', dir: 'asc' },
    { key: 'card', dir: 'desc' },
    { key: 'transfer', dir: 'asc' },
    { key: 'unpaid', dir: 'desc' },
    { key: 'block', dir: 'asc' },
    { key: 'pt', dir: 'desc' },
    { key: 'rsv', by: 'kind', dir: 'asc' },
    { key: 'rsv', by: 'date', dir: 'desc' },
  ]

  it('AC-5301.4: 기준 null이면 받은 차례(접수 순) 그대로', () => {
    expect(nos(sortLedger(RSV_ROWS, null))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('AC-5301.4: 어떤 기준이든 받은 배열을 바꾸지 않고 새 배열을 돌려준다', () => {
    const before = [...RSV_ROWS]
    const frozen = Object.freeze([...RSV_ROWS])
    for (const sort of SORTS) {
      const out = sortLedger(frozen, sort)
      expect(out).not.toBe(frozen)
      expect(out).toHaveLength(frozen.length)
      expect(frozen).toEqual(before)
    }
  })
})
