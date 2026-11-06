import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { formatDelta } from '@/components/charts/format'
import { compareNumbers } from '@/lib/analytics/compare'
import { addMonths, eachDay } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import {
  addedRateText,
  COLUMN_NAME,
  GRAIN_NAME,
  pickComparedNote,
  rateText,
  rxCatalog,
  rxPeriodCounts,
  rxPickCopyText,
  rxPickTotal,
  searchCatalog,
} from './rxPickView'
import { rangeOf, rxPickRows, statsRange, type RxPickRow, type StatsInput, type StatsPeriod } from './view'
import type { Delta } from '@/types/analysis'
import type { StatsPick } from './periodPick'

// 처방 골라 보기의 글자·찾기·복사 (rx-picker REQ-802·804·805·808). 일 줄과 처방 이름은 모두 이 파일에서 지어낸 값이다

type Rx = DayPayload['rx'][number]
const rx = (code: string, patients: number, o: { name?: string; newPatients?: number; returning?: number } = {}): Rx => ({
  code,
  name: o.name ?? `처방 ${code}`,
  type: '처치',
  patients,
  newPatients: o.newPatients ?? 0,
  returning: o.returning ?? patients - (o.newPatients ?? 0),
})

function day(ymd: string, lines: Rx[], partial = false): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: lines,
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

const input = (today: string, period: StatsPeriod, days: DayPayload[], covered: DateRange[]): StatsInput => ({ days, covered, range: statsRange(today, period) })
const row = (o: Partial<RxPickRow> = {}): RxPickRow => ({
  code: 'A',
  name: '처방 A',
  count: 0,
  newCount: 0,
  returningCount: 0,
  gapCount: 0,
  partial: false,
  comparable: { current: 0, previous: 0 },
  delta: compareNumbers(0, 0),
  ...o,
})
const line = (code: string, name = `처방 ${code}`) => ({ code, name })
const always = () => true

const today = '2026-11-13'
// '7d': 이번 기간 11월 6일 ~ 12일, 비교 기간 10월 30일 ~ 11월 5일
const bothWeeks = [{ from: '2026-10-30', to: '2026-11-12' }]

describe('AC-804.4 rateText', () => {
  it('AC-804.4 건수 3·신환 1·재진 2 → 33.3%·66.6%(반올림하지 않는다)', () => {
    expect(rateText(1, 3)).toBe('33.3%')
    expect(rateText(2, 3)).toBe('66.6%')
  })

  it('AC-804.4 밑수가 건수이고 소수 첫째 자리까지 버린 글자다', () => {
    expect(rateText(29, 100)).toBe('29.0%') // 0.29 × 100 = 28.999…에서 28.9가 되지 않는다
    expect(rateText(5, 5)).toBe('100.0%')
    expect(rateText(0, 5)).toBe('0.0%')
  })

  it('AC-804.4 건수 0이면 –다', () => {
    expect(rateText(0, 0)).toBe('–')
  })
})

describe('AC-805.5 addedRateText', () => {
  it('AC-805.5 건수 7·신환 1·재진 5·구분 없음 1 → 보이는 글자 14.2%·71.4%의 합 85.6%', () => {
    const sample = row({ count: 7, newCount: 1, returningCount: 5, gapCount: 1 })
    expect(rateText(sample.newCount, sample.count)).toBe('14.2%')
    expect(rateText(sample.returningCount, sample.count)).toBe('71.4%')
    expect(addedRateText(sample)).toBe('85.6%')
  })

  it('AC-805.5 건수 3·신환 1·재진 2는 보이는 글자의 합 99.9%다(비율을 먼저 더해 100%로 만들지 않는다)', () => {
    expect(addedRateText(row({ count: 3, newCount: 1, returningCount: 2 }))).toBe('99.9%')
  })

  it('AC-805.5 소수를 그대로 더하면 오차가 나는 값도 글자가 깨끗하고 끝자리 0을 지킨다', () => {
    // 0.1 + 0.2처럼 14.3 + 28.6 = 42.900000000000006이다
    expect(addedRateText(row({ count: 7, newCount: 1, returningCount: 2, gapCount: 4 }))).toBe('42.7%')
    expect(addedRateText(row({ count: 1000, newCount: 143, returningCount: 286, gapCount: 571 }))).toBe('42.9%')
    expect(addedRateText(row({ count: 8, newCount: 1, returningCount: 3, gapCount: 4 }))).toBe('50.0%')
  })

  it('AC-805.5 건수 0이면 –다', () => {
    expect(addedRateText(row())).toBe('–')
  })
})

describe('AC-804.9 rxPickTotal', () => {
  it('AC-804.9 고른 처방이 하나 이하면 합계가 없다', () => {
    expect(rxPickTotal([])).toBeNull()
    expect(rxPickTotal([row()])).toBeNull()
  })

  it('AC-804.9 건수·신환·재진·구분 없음은 줄의 합이고 비율은 합계 건수를 밑수로 다시 낸다', () => {
    const total = rxPickTotal([row({ code: 'A', count: 3, newCount: 1, returningCount: 2 }), row({ code: 'B', count: 7, newCount: 1, returningCount: 5, gapCount: 1 })])!
    expect(total).toMatchObject({ count: 10, newCount: 2, returningCount: 7, gapCount: 1 })
    expect(rateText(total.newCount, total.count)).toBe('20.0%')
    expect(rateText(total.returningCount, total.count)).toBe('70.0%')
  })

  it('AC-804.9 오늘 2026-11-13의 12개월, 두 처방 모두 11월 건수가 있음 — 합계 증감은 끝난 11달의 합끼리이고 합계 건수 − 합계 지난 기간 건수 ≠ 증감 크기', () => {
    const monthDays = (first: string, a: number, b: number) =>
      Array.from({ length: 12 }, (_, i) => day(`${addMonths(first, i)}-01`, [rx('A', a), rx('B', b)]))
    const days = [...monthDays('2024-12', 2, 1), ...monthDays('2025-12', 3, 5)]
    const rows = rxPickRows(input(today, '12m', days, [{ from: '2024-12-01', to: '2026-11-12' }]), [line('A'), line('B')])
    const total = rxPickTotal(rows)!
    expect(total.count).toBe(96) // (3 + 5) × 12달, 덜 끝난 11월 포함
    expect(total.comparable).toEqual({ current: 88, previous: 33 }) // 끝난 11달끼리
    expect(total.delta).toEqual(compareNumbers(88, 33))
    expect(total.count - total.comparable!.previous).not.toBe(55)
  })

  it('AC-804.9 증감은 비교 기간이 0건이면 새로 생김이다(건수가 아니라 짝의 합으로 낸다)', () => {
    const total = rxPickTotal([row({ count: 4, comparable: { current: 2, previous: 0 } }), row({ code: 'B', count: 1, comparable: { current: 1, previous: 0 } })])!
    expect(total.comparable).toEqual({ current: 3, previous: 0 })
    expect(total.delta).toEqual({ kind: 'new' })
  })

  it('AC-804.9 견줄 짝이 없으면 AC-804.8과 같다', () => {
    const none = row({ comparable: null, delta: { kind: 'unavailable' } })
    const total = rxPickTotal([none, { ...none, code: 'B' }])!
    expect(total.comparable).toBeNull()
    expect(total.delta).toEqual({ kind: 'unavailable' })
    expect(formatDelta(total.delta, '건').text).toBe('비교할 수 없음')
  })
})

describe('AC-805.7 pickComparedNote', () => {
  it('AC-805.7 12개월에서 덜 끝난 달이 빠지면 끝난 N달만 견준다고 적는다', () => {
    expect(pickComparedNote(input(today, '12m', [], [{ from: '2024-12-01', to: '2026-11-12' }]))).toBe('증감과 지난 기간 건수는 끝난 11달만 견줘요. 건수는 기간 전체예요.')
  })

  it('AC-805.7 날 기간에서 덮이지 않은 날이 빠지면 두 기간 모두 자료가 있는 N일만 견준다고 적는다', () => {
    expect(pickComparedNote(input(today, '7d', [], [{ from: '2026-11-02', to: '2026-11-12' }]))).toBe('증감과 지난 기간 건수는 두 기간 모두 자료가 있는 4일만 견줘요. 건수는 기간 전체예요.')
  })

  it('AC-805.7 빠진 짝이 없으면 없다', () => {
    expect(pickComparedNote(input(today, '7d', [], bothWeeks))).toBeNull()
  })

  it('AC-805.7 남은 짝이 하나도 없으면 없다(증감이 비교할 수 없음이다)', () => {
    expect(pickComparedNote(input(today, '7d', [], [{ from: '2026-11-06', to: '2026-11-12' }]))).toBeNull()
  })

  it('AC-805.7 칸 이름: 7·30일은 일, 90일은 주, 12개월은 달이다', () => {
    expect(GRAIN_NAME).toEqual({ '7d': '일', '30d': '일', '90d': '주', '12m': '달' })
  })
})

describe('AC-802.2 rxPeriodCounts', () => {
  it('AC-802.2 대문자 코드마다 표의 건수와 같은 셈이다: 덮은 기간 안 날만, 덜 끝난 날 포함, 비교 기간 제외', () => {
    const days = [
      day('2026-11-01', [rx('A', 100)]), // 비교 기간
      day('2026-11-06', [rx('A', 50)]), // 덮은 기간 밖
      day('2026-11-08', [rx('a', 3), rx('B', 1)]),
      day('2026-11-12', [rx('A', 2), rx('C', 0)], true),
    ]
    const stats = input(today, '7d', days, [{ from: '2026-10-30', to: '2026-11-05' }, { from: '2026-11-07', to: '2026-11-12' }])
    const counts = rxPeriodCounts(stats)
    expect(counts.get('A')).toBe(5)
    expect(counts.get('B')).toBe(1)
    expect(counts.get('C')).toBe(0)
    for (const picked of rxPickRows(stats, [line('a'), line('B'), line('C')])) expect(counts.get(picked.code.toUpperCase())).toBe(picked.count)
  })

  it('AC-802.2 같은 날 줄이 둘이면 뒤의 것만 센다(표와 같다)', () => {
    const days = [day('2026-11-08', [rx('A', 9)]), day('2026-11-08', [rx('A', 2)])]
    const stats = input(today, '7d', days, bothWeeks)
    expect(rxPeriodCounts(stats).get('A')).toBe(2)
    expect(rxPickRows(stats, [line('A')])[0].count).toBe(2)
  })

  it('AC-802.2 이 기간에 없는 처방은 들어 있지 않다(부르는 쪽이 0건으로 그린다)', () => {
    expect(rxPeriodCounts(input(today, '7d', [day('2026-11-01', [rx('A', 4)])], bothWeeks)).has('A')).toBe(false)
  })

  it('AC-802.2 12개월은 덜 끝난 달까지 기간 전체를 센다', () => {
    const days = [day('2025-12-05', [rx('A', 2)]), day('2026-11-03', [rx('A', 5)])]
    const stats = input(today, '12m', days, [{ from: '2025-12-01', to: '2026-11-12' }])
    expect(rxPeriodCounts(stats).get('A')).toBe(7)
    expect(rxPickRows(stats, [line('A')])[0].count).toBe(7)
  })
})

describe('AC-802.2 rxCatalog', () => {
  it('AC-802.2 이름 가나다 차례이고 같으면 코드 차례다', () => {
    const days = [day('2026-11-08', [rx('Z', 1, { name: '다' }), rx('B', 1, { name: '가' }), rx('A', 1, { name: '가' }), rx('Y', 1, { name: '나' })])]
    expect(rxCatalog(days, [], always).map(({ code }) => code)).toEqual(['A', 'B', 'Y', 'Z'])
  })

  it("AC-802.2 차례는 글자 번호가 아니라 localeCompare(…, 'ko')다: 한글이 영문보다 앞이고 영문은 대소문자를 가리지 않는다", () => {
    const days = [day('2026-11-08', [rx('1', 1, { name: 'B주사' }), rx('2', 1, { name: 'a주사' }), rx('3', 1, { name: '가주사' })])]
    expect(rxCatalog(days, [], always).map(({ name }) => name)).toEqual(['가주사', 'a주사', 'B주사']) // 글자 번호 차례라면 B주사, a주사, 가주사
  })

  it('AC-802.11 저장 검사에 걸리는 줄은 목록에 없다', () => {
    const days = [day('2026-11-08', [rx('GOOD', 1), rx('BAD', 1)])]
    expect(rxCatalog(days, [line('ALSO-BAD')], ({ code }) => !code.includes('BAD'))).toEqual([line('GOOD')])
  })

  it('AC-802.11 검사는 코드·이름 두 열쇠만 있는 줄을 받고 목록 줄도 두 열쇠뿐이다(validateRxPick은 다른 열쇠가 있으면 거부한다)', () => {
    const check = vi.fn<(line: { code: string; name: string }) => boolean>(always)
    const list = rxCatalog([day('2026-11-08', [rx('A', 3)])], [{ ...line('B'), extra: 1 } as ReturnType<typeof line>], check)
    for (const [checked] of check.mock.calls) expect(Object.keys(checked).sort()).toEqual(['code', 'name'])
    expect(check).toHaveBeenCalled()
    expect(list).toEqual([line('A'), line('B')])
    for (const item of list) expect(Object.keys(item).sort()).toEqual(['code', 'name'])
  })

  it('AC-802.11 가장 최근 날 줄이 검사에 걸리면 그 줄만 빠지고 앞 날의 줄이 남는다', () => {
    const days = [day('2026-11-08', [rx('A', 1, { name: '좋은 이름' })]), day('2026-11-09', [rx('A', 1, { name: '나쁜 이름' })])]
    expect(rxCatalog(days, [], ({ name }) => name !== '나쁜 이름')).toEqual([line('A', '좋은 이름')])
  })

  it('AC-802.12 대소문자만 다른 코드는 한 줄이고 가장 최근 날의 글자·이름이다(받은 차례와 상관없다)', () => {
    const days = [day('2026-11-09', [rx('ABC', 1, { name: '새 이름' })]), day('2026-11-08', [rx('abc', 1, { name: '옛 이름' })])]
    expect(rxCatalog(days, [], always)).toEqual([line('ABC', '새 이름')])
  })

  it('AC-802.12 고른 처방(extra)은 날 줄에 없을 때만 저장한 글자·이름으로 들어간다', () => {
    const days = [day('2026-11-09', [rx('ABC', 1, { name: '날 줄의 이름' })])]
    expect(rxCatalog(days, [line('abc', '저장한 이름'), line('OLD', '넓은 범위 밖 처방')], always)).toEqual([line('ABC', '날 줄의 이름'), line('OLD', '넓은 범위 밖 처방')])
  })

  it('AC-802.12 extra 안에서 대소문자만 다르면 처음 것이다', () => {
    expect(rxCatalog([], [line('abc', '처음'), line('ABC', '뒤')], always)).toEqual([line('abc', '처음')])
  })
})

describe('AC-802.3 searchCatalog', () => {
  const catalog = [line('HA100', '가나다 주사'), line('AA3322', 'Zenadol 정'), line('B-7', '라마바 찜질')]

  it('AC-802.3 이름 일부로 찾는다', () => {
    expect(searchCatalog(catalog, '나다')).toEqual([catalog[0]])
  })

  it('AC-802.3 코드 일부로 찾는다', () => {
    expect(searchCatalog(catalog, '332')).toEqual([catalog[1]])
  })

  it('AC-802.3 소문자로 적은 코드도 찾고 영문 이름도 대소문자를 가리지 않는다', () => {
    expect(searchCatalog(catalog, 'ha10')).toEqual([catalog[0]])
    expect(searchCatalog(catalog, 'ZENA')).toEqual([catalog[1]])
  })

  it('AC-802.3 앞뒤 빈칸을 뺀다. 가운데 빈칸은 글자 그대로다', () => {
    expect(searchCatalog(catalog, '  b-7 ')).toEqual([catalog[2]])
    expect(searchCatalog(catalog, ' 다 주')).toEqual([catalog[0]])
    expect(searchCatalog(catalog, '다주')).toEqual([])
  })

  it('AC-802.2 글자가 없거나 빈칸뿐이면 전체가 받은 차례 그대로다', () => {
    expect(searchCatalog(catalog, '')).toEqual(catalog)
    expect(searchCatalog(catalog, '   ')).toEqual(catalog)
  })

  it('AC-802.4 맞는 줄이 없으면 빈 목록이다', () => {
    expect(searchCatalog(catalog, '없는 처방')).toEqual([])
  })
})

describe('AC-808 rxPickCopyText', () => {
  const range = statsRange(today, '30d')
  const args = { hospitalName: '○○의원', periodName: '최근 30일', range }
  const rate = '신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수'
  const header = (column: string) => ['코드', '처방', '건수', column, '증감', '신환', '신환율', '재진', '재진율', '구분 없음'].join('\t')
  const two = [
    row({ code: 'HA100', name: '가주사', count: 7, newCount: 1, returningCount: 5, gapCount: 1, comparable: { current: 6, previous: 3 }, delta: compareNumbers(6, 3) }),
    row({ code: 'B7', name: '나찜질', count: 3, newCount: 1, returningCount: 2, comparable: { current: 3, previous: 4 }, delta: compareNumbers(3, 4) }),
  ]

  it('AC-808.1 머리 세 줄, 처방마다 한 줄, 코드 칸이 빈 합계 줄, 끝줄 비율 뜻이고 칸은 탭, 줄바꿈은 \\n이다', () => {
    const text = rxPickCopyText({ ...args, rows: two, total: rxPickTotal(two) })
    expect(text.split('\n')).toEqual([
      '○○의원 처방 골라 보기',
      '최근 30일 (10월 14일 – 11월 12일) · 비교: 9월 14일 – 10월 13일 (지난 30일)',
      header('지난 30일'),
      ['HA100', '가주사', '7', '3', '▲ 3건 (+100.0%)', '1', '14.2%', '5', '71.4%', '1'].join('\t'),
      ['B7', '나찜질', '3', '4', '▼ 1건 (−25.0%)', '1', '33.3%', '2', '66.6%', '0'].join('\t'),
      ['', '합계', '10', '7', '▲ 2건 (+28.5%)', '2', '20.0%', '7', '70.0%', '1'].join('\t'),
      rate,
    ])
    expect(text).not.toContain('\r')
  })

  it('AC-808.1 고른 처방이 하나면 합계 줄이 없다', () => {
    const lines = rxPickCopyText({ ...args, rows: [two[0]], total: rxPickTotal([two[0]]) }).split('\n')
    expect(lines).toHaveLength(5)
    expect(lines.join('\n')).not.toContain('합계')
  })

  it.each([
    ['7d', '최근 7일', '지난 7일', '지난 7일'],
    ['90d', '최근 90일', '지난 90일', '지난 90일'],
    ['12m', '최근 12개월', '작년 같은 달', '작년 같은 12달'],
  ] as const)('AC-808.1 %s는 비교 칸 이름과 비교 이름이 기간을 따른다', (period, periodName, column, compared) => {
    const periodRange = statsRange(today, period)
    const lines = rxPickCopyText({ hospitalName: '○○의원', periodName, range: periodRange, rows: [row()], total: null }).split('\n')
    expect(lines[1]).toBe(`${periodName} (${periodRange.current.label}) · 비교: ${periodRange.previous.label} (${compared})`)
    expect(lines[2]).toBe(header(column))
    expect(COLUMN_NAME[period]).toBe(column)
  })

  it('AC-808.1 30일의 비교 칸 이름도 지난 30일이다', () => {
    expect(COLUMN_NAME['30d']).toBe('지난 30일')
  })

  it('AC-808.2 건수·신환·재진·구분 없음·지난 기간은 쉼표 없는 숫자다', () => {
    const big = row({ count: 12345, newCount: 1234, returningCount: 10000, gapCount: 1111, comparable: { current: 12345, previous: 2345 }, delta: compareNumbers(12345, 2345) })
    const cells = rxPickCopyText({ ...args, rows: [big], total: null }).split('\n')[3].split('\t')
    expect([cells[2], cells[3], cells[5], cells[7], cells[9]]).toEqual(['12345', '2345', '1234', '10000', '1111'])
  })

  it('AC-808.2 증감은 ▲·▼ + formatDelta 글자다', () => {
    const delta = compareNumbers(3500, 1000)
    const cells = rxPickCopyText({ ...args, rows: [row({ delta })], total: null }).split('\n')[3].split('\t')
    expect(cells[4]).toBe(`▲ ${formatDelta(delta, '건').text}`)
    expect(cells[4]).toBe('▲ 2,500건 (+250.0%)')
  })

  it.each([
    ['비교할 수 없음', { kind: 'unavailable' }],
    ['새로 생김', { kind: 'new' }],
    ['변화 없음', compareNumbers(4, 4)],
  ] as const)('AC-808.2 %s에는 기호가 없다', (text, delta) => {
    const cells = rxPickCopyText({ ...args, rows: [row({ delta })], total: null }).split('\n')[3].split('\t')
    expect(cells[4]).toBe(text)
  })

  it('AC-808.2 지난 기간이 없으면 –이고 건수 0이면 비율이 –다', () => {
    const none = row({ comparable: null, delta: { kind: 'unavailable' } })
    expect(rxPickCopyText({ ...args, rows: [none], total: null }).split('\n')[3].split('\t')).toEqual(['A', '처방 A', '0', '–', '비교할 수 없음', '0', '–', '0', '–', '0'])
  })

  it('AC-808.2 이름의 탭·줄바꿈은 빈칸으로 바꿔 줄과 칸이 밀리지 않는다', () => {
    const lines = rxPickCopyText({ ...args, hospitalName: '○○\n의원', rows: [row({ name: '가\t나\r\n다\n라' })], total: null }).split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe('○○ 의원 처방 골라 보기')
    expect(lines[3].split('\t')).toHaveLength(10)
    expect(lines[3].split('\t')[1]).toBe('가 나 다 라')
  })

  it('AC-808.2 표 줄(rxPickRows)을 그대로 넣으면 표와 같은 숫자다', () => {
    const days = [day('2026-11-08', [rx('A', 7, { newPatients: 1, returning: 5 })])]
    const stats = input(today, '30d', days, [{ from: '2026-09-14', to: '2026-11-12' }])
    const cells = rxPickCopyText({ ...args, rows: rxPickRows(stats, [line('A')]), total: null }).split('\n')[3].split('\t')
    expect(cells).toEqual(['A', '처방 A', '7', '0', '새로 생김', '1', '14.2%', '5', '71.4%', '1'])
  })
})

describe('AC-511.7 소스 (rxPickView.ts도 같은 규칙)', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/stats/rxPickView.ts'), 'utf8')

  it('AC-511.7 순수 함수다(화면 라이브러리·서버·네트워크·브라우저 저장소 없음)', () => {
    expect(source).not.toMatch(/react|supabase|fetch|localStorage|sessionStorage|indexedDB/i)
    expect(source).not.toMatch(/new Date|Date\.(UTC|now)/)
    expect(source).not.toContain('MonthPayload')
  })
})

// ── 고른 기간 (stats-period TASK-3): 합계·[표 복사]의 비교마다. 오늘 2026-11-06, 10월 일별(9월 · 작년 10월과 견줌)
describe('AC-1705.1·AC-1705.3 rxPickTotal·rxPickCopyText — 고른 기간의 비교마다', () => {
  const P_TODAY = '2026-11-06'
  const OCT: StatsPick = { kind: 'month', unit: 'day', month: '2026-10' }
  const COVER: DateRange[] = [
    { from: '2025-10-01', to: '2025-10-31' },
    { from: '2026-09-01', to: '2026-11-05' },
  ]
  const each = (from: string, to: string, a: number, b: number) => eachDay({ from, to }).map((d) => day(d, [rx('A', a), rx('B', b)]))
  // A: 작년 10월 3건 · 9월 1건 · 10월 2건, B: 날마다 1건
  const DAYS = [...each('2025-10-01', '2025-10-31', 3, 1), ...each('2026-09-01', '2026-09-30', 1, 1), ...each('2026-10-01', '2026-10-31', 2, 1)]
  const range = rangeOf(P_TODAY, OCT, false)
  const LINES = [
    { code: 'A', name: '처방 A' },
    { code: 'B', name: '처방 B' },
  ]
  const rowsOf = (days = DAYS, covered = COVER, choice: StatsPick = OCT) => rxPickRows({ days, covered, range: rangeOf(P_TODAY, choice, false) }, LINES)
  const deltaCell = (delta: Delta) => {
    const view = formatDelta(delta, '건')
    return `${view.dir === 'up' ? '▲ ' : view.dir === 'down' ? '▼ ' : ''}${view.text}`
  }

  it('AC-1705.1 합계 줄은 비교마다 더한다 — 바로 전은 comparable·delta, 작년은 lastYear', () => {
    const total = rxPickTotal(rowsOf())!
    expect(total).toMatchObject({ count: 93, comparable: { current: 93, previous: 60 }, delta: compareNumbers(93, 60) })
    expect(total.lastYear).toEqual({ previous: 124, delta: compareNumbers(93, 124) })
  })

  it('AC-1705.1 작년을 견줄 수 없으면 합계의 작년은 previous null · 비교할 수 없음이다', () => {
    const total = rxPickTotal(rowsOf(DAYS, [COVER[1]!]))!
    expect(total.delta).toEqual(compareNumbers(93, 60))
    expect(total.lastYear).toEqual({ previous: null, delta: { kind: 'unavailable' } })
  })

  it('AC-1705.1 빠른 단추 합계에는 lastYear가 없다', () => {
    expect(rxPickTotal([row(), row({ code: 'B' })])).not.toHaveProperty('lastYear')
  })

  it("AC-1705.3 [표 복사] 둘째 줄은 '{name} ({label}) · 비교: {label} (바로 전 달) · {label} (작년 같은 달)'이다", () => {
    const rows = rowsOf()
    const lines = rxPickCopyText({ hospitalName: '○○의원', periodName: range.name, range, rows, total: rxPickTotal(rows) }).split('\n')
    expect(lines[1]).toBe('2026년 10월 (2026년 10월 1일 – 31일) · 비교: 9월 1일 – 30일 (바로 전 달) · 2025년 10월 1일 – 31일 (작년 같은 달)')
  })

  it("AC-1705.3 머리 줄에 비교마다 '{name}'·'{name}보다'가 있고 줄마다 그 칸이 있다", () => {
    const rows = rowsOf()
    const lines = rxPickCopyText({ hospitalName: '○○의원', periodName: range.name, range, rows, total: rxPickTotal(rows) }).split('\n')
    expect(lines[2]!.split('\t')).toEqual(['코드', '처방', '건수', '9월', '9월보다', '작년 10월', '작년 10월보다', '신환', '신환율', '재진', '재진율', '구분 없음'])
    expect(lines[3]!.split('\t')).toEqual(['A', '처방 A', '62', '30', deltaCell(compareNumbers(62, 30)), '93', deltaCell(compareNumbers(62, 93)), '0', '0.0%', '62', '100.0%', '0'])
    expect(lines[5]!.split('\t')).toEqual(['', '합계', '93', '60', deltaCell(compareNumbers(93, 60)), '124', deltaCell(compareNumbers(93, 124)), '0', '0.0%', '93', '100.0%', '0'])
  })

  it("AC-1705.3 견줄 수 없는 비교 칸은 '–'와 '비교할 수 없음'이다", () => {
    const rows = rowsOf(DAYS, [COVER[1]!])
    const cells = rxPickCopyText({ hospitalName: '○○의원', periodName: range.name, range, rows, total: null }).split('\n')[3]!.split('\t')
    expect(cells.slice(3, 7)).toEqual(['30', deltaCell(compareNumbers(62, 30)), '–', '비교할 수 없음'])
  })

  it('AC-1705.3 해 고르기는 비교가 하나다(2024년)', () => {
    const year: StatsPick = { kind: 'year', year: '2025' }
    const yearRange = rangeOf(P_TODAY, year, false)
    const rows = rowsOf(DAYS, [{ from: '2024-01-01', to: '2025-12-31' }], year)
    const lines = rxPickCopyText({ hospitalName: '○○의원', periodName: yearRange.name, range: yearRange, rows, total: null }).split('\n')
    expect(lines[1]).toBe('2025년 (2025년 1월 1일 – 12월 31일) · 비교: 2024년 1월 1일 – 12월 31일 (작년)')
    expect(lines[2]!.split('\t')).toEqual(['코드', '처방', '건수', '2024년', '2024년보다', '신환', '신환율', '재진', '재진율', '구분 없음'])
    expect(lines[3]!.split('\t')).toHaveLength(10)
  })
})
