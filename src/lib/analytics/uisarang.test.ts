import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { eachDay } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { UisAgePayload, UisGroupDef, UisHave, UisPeriodRow, UisRxPayload, UisRxRow } from '@/types/uisarang'
import { dayListText, formatQty, missingFiles, sumAges, sumRxCodes, sumRxGroups, tileRx } from './uisarang'

// 의사랑 숫자 셈(specs/uisarang-upload design.md §8). 순수 함수 — 환자 자료 구역 규칙 안이다. 처방 코드·이름은 지어낸 것이다

const AT = '2026-11-20T01:00:00+00:00'
const LATER = '2026-11-21T01:00:00+00:00'
const rxLine = (code: string, qty: number, amount: number, name = `${code} 처방`): UisRxRow => ({ code, name, qty, amount })
const rx = (from: string, to: string, rows: UisRxRow[] = [rxLine('A001', 1, 100)], updatedAt = AT): UisPeriodRow<UisRxPayload> => ({
  kind: 'rx',
  from,
  to,
  payload: { v: 1, rows, total: rows.reduce((sum, row) => sum + row.amount, 0) },
  updatedAt,
})
const days = (from: string, to: string) => eachDay({ from, to })
const dayRows = (from: string, to: string) => days(from, to).map((day) => rx(day, day))
const spansOf = (used: UisPeriodRow[]) => used.map((row) => `${row.from}~${row.to}`)
const known = (covered: DateRange[] = [], worked: string[] = []) => ({ covered, worked: new Set(worked) })
const TODAY = '2026-11-27'

describe('AC-8809.1 tileRx: 고른 기간을 처방 줄로 겹치지 않게 덮기', () => {
  it('AC-8809.1: 기간과 똑같은 줄이 있으면 그것 하나만 쓴다(안에 든 하루 줄은 쓰지 않는다)', () => {
    const rows = [...dayRows('2026-10-01', '2026-10-31'), rx('2026-10-01', '2026-10-31')]
    const tiled = tileRx({ from: '2026-10-01', to: '2026-10-31' }, rows, known(), TODAY)
    expect(tiled).toEqual({ ok: true, used: [rx('2026-10-01', '2026-10-31')], counts: { month: 1, week: 0, day: 0 } })
    const week = tileRx({ from: '2026-11-02', to: '2026-11-08' }, [...dayRows('2026-11-02', '2026-11-08'), rx('2026-11-02', '2026-11-08')], known(), TODAY)
    expect(week).toEqual({ ok: true, used: [rx('2026-11-02', '2026-11-08')], counts: { month: 0, week: 1, day: 0 } })
  })

  it('AC-8809.1: 같은 기간 줄이 둘이면 updated_at이 늦은 것이다', () => {
    const old = rx('2026-10-01', '2026-10-31', [rxLine('A001', 1, 100)], AT)
    const fresh = rx('2026-10-01', '2026-10-31', [rxLine('A001', 2, 200)], LATER)
    expect(tileRx({ from: '2026-10-01', to: '2026-10-31' }, [fresh, old], known(), TODAY)).toMatchObject({ ok: true, used: [fresh] })
    expect(tileRx({ from: '2026-10-01', to: '2026-10-31' }, [old, fresh], known(), TODAY)).toMatchObject({ ok: true, used: [fresh] })
    const dayOld = rx('2026-11-03', '2026-11-03', [rxLine('A001', 1, 100)], AT)
    const dayNew = rx('2026-11-03', '2026-11-03', [rxLine('A001', 5, 500)], LATER)
    const tiled = tileRx({ from: '2026-11-02', to: '2026-11-03' }, [dayNew, rx('2026-11-02', '2026-11-02'), dayOld], known(), TODAY)
    expect(tiled).toMatchObject({ ok: true, used: [rx('2026-11-02', '2026-11-02'), dayNew], counts: { month: 0, week: 0, day: 2 } })
  })

  it('AC-8809.1: 달 → 주 → 하루 차례로 고르고, 이미 고른 날과 겹치는 주·하루 줄은 버린다(기간 밖으로 나가는 줄도 쓰지 않는다)', () => {
    const rows = [
      rx('2026-10-01', '2026-10-31'), // 한 달
      rx('2026-09-21', '2026-09-27'), // 한 주
      rx('2026-09-28', '2026-10-04'), // 한 달과 겹치는 주 → 버림
      rx('2026-11-01', '2026-11-30'), // 기간 밖으로 나가는 달 → 쓰지 않음
      ...dayRows('2026-09-28', '2026-09-30'),
      rx('2026-10-15', '2026-10-15'), // 고른 달 안 → 버림
      ...dayRows('2026-11-01', '2026-11-03'),
    ]
    const tiled = tileRx({ from: '2026-09-21', to: '2026-11-03' }, rows, known(), TODAY)
    expect(tiled.ok).toBe(true)
    if (!tiled.ok) return
    expect(spansOf(tiled.used)).toEqual([
      '2026-09-21~2026-09-27',
      '2026-09-28~2026-09-28',
      '2026-09-29~2026-09-29',
      '2026-09-30~2026-09-30',
      '2026-10-01~2026-10-31',
      '2026-11-01~2026-11-01',
      '2026-11-02~2026-11-02',
      '2026-11-03~2026-11-03',
    ])
    expect(tiled.counts).toEqual({ month: 1, week: 1, day: 6 })
  })

  it('AC-8809.1: 겹치는 주를 버린 자리는 하루 줄로 채운다 — 하루 줄도 없으면 그 날이 모자란 날이다', () => {
    const rows = [rx('2026-10-01', '2026-10-31'), rx('2026-10-26', '2026-11-01'), ...dayRows('2026-11-02', '2026-11-08')]
    const tiled = tileRx({ from: '2026-10-01', to: '2026-11-08' }, rows, known(), TODAY)
    expect(tiled).toEqual({ ok: false, gap: ['2026-11-01'] })
    const filled = tileRx({ from: '2026-10-01', to: '2026-11-08' }, [...rows, rx('2026-11-01', '2026-11-01')], known(), TODAY)
    expect(filled).toMatchObject({ ok: true, counts: { month: 1, week: 0, day: 8 } })
  })

  it('AC-8809.1: 휴진(덮은 기간 안 · 진료한 날 아님)은 줄이 없어도 모자라지 않다. 덮이지 않았거나 진료한 날이면 모자란 날이다', () => {
    const range = { from: '2026-11-16', to: '2026-11-22' }
    const rows = dayRows('2026-11-16', '2026-11-20')
    const worked = days('2026-11-16', '2026-11-20')
    expect(tileRx(range, rows, known([range], worked), TODAY)).toEqual({ ok: true, used: rows, counts: { month: 0, week: 0, day: 5 } })
    expect(tileRx(range, rows, known([{ from: '2026-11-16', to: '2026-11-20' }], worked), TODAY)).toEqual({
      ok: false,
      gap: ['2026-11-21', '2026-11-22'],
    })
    expect(tileRx(range, rows, known([range], [...worked, '2026-11-21']), TODAY)).toEqual({ ok: false, gap: ['2026-11-21'] })
  })

  it('AC-8809.1: 오늘(아직 끝나지 않은 날)·오늘 뒤는 줄이 없어도 모자라지 않다', () => {
    const rows = dayRows('2026-11-01', '2026-11-26')
    expect(tileRx({ from: '2026-11-01', to: '2026-11-30' }, rows, known(), TODAY)).toMatchObject({ ok: true, counts: { day: 26 } })
    const withToday = tileRx({ from: '2026-11-01', to: '2026-11-30' }, [...rows, rx(TODAY, TODAY)], known(), TODAY)
    expect(withToday).toMatchObject({ ok: true, counts: { day: 27 } })
  })

  it('AC-8809.1: 모자란 날은 날 차례로 모두 준다', () => {
    const rows = dayRows('2026-11-01', '2026-11-20').filter((row) => !['2026-11-10', '2026-11-03', '2026-11-01'].includes(row.from))
    expect(tileRx({ from: '2026-11-01', to: '2026-11-20' }, rows, known(), TODAY)).toEqual({
      ok: false,
      gap: ['2026-11-01', '2026-11-03', '2026-11-10'],
    })
  })

  it('AC-8809.1: 기간보다 넓은 줄만 있으면 쓰지 않는다(한 주를 골랐는데 한 달 줄만 있음)', () => {
    expect(tileRx({ from: '2026-10-05', to: '2026-10-11' }, [rx('2026-10-01', '2026-10-31')], known(), TODAY)).toEqual({
      ok: false,
      gap: days('2026-10-05', '2026-10-11'),
    })
  })

  it('AC-8809.1: 줄이 없어도 기간이 모두 휴진·오늘 뒤면 ok이고 쓴 줄이 없다', () => {
    const range = { from: '2026-11-21', to: '2026-11-22' }
    expect(tileRx(range, [], known([range]), TODAY)).toEqual({ ok: true, used: [], counts: { month: 0, week: 0, day: 0 } })
    expect(tileRx({ from: '2026-11-28', to: '2026-11-30' }, [], known(), TODAY)).toEqual({ ok: true, used: [], counts: { month: 0, week: 0, day: 0 } })
  })
})

describe('AC-8809.2 sumRxCodes: 고른 줄을 코드마다 더하기', () => {
  it('AC-8809.2: 처방량 합(셋째 자리 반올림)·총액 합·이름(가장 늦은 기간 줄의 이름)이고 총액 큰 차례(같으면 코드 차례)다', () => {
    const used = [
      rx('2026-11-03', '2026-11-03', [rxLine('A001', 2.2, 50, 'A 새 이름'), rxLine('C001', 0.0004, 300)]),
      rx('2026-10-01', '2026-10-31', [rxLine('A001', 1.1, 100, 'A 옛 이름'), rxLine('B001', 3, 300), rxLine('C001', 0.0004, 0)]),
    ]
    expect(sumRxCodes(used)).toEqual([
      { code: 'B001', name: 'B001 처방', qty: 3, amount: 300 },
      { code: 'C001', name: 'C001 처방', qty: 0.001, amount: 300 },
      { code: 'A001', name: 'A 새 이름', qty: 3.3, amount: 150 },
    ])
  })

  it('AC-8809.2: 줄이 없으면 빈 목록, 음수 처방량·총액은 그대로 더한다', () => {
    expect(sumRxCodes([])).toEqual([])
    expect(sumRxCodes([rx('2026-11-03', '2026-11-03', [rxLine('A001', -1.5, -100)]), rx('2026-11-04', '2026-11-04', [rxLine('A001', 0.5, 40)])])).toEqual([
      { code: 'A001', name: 'A001 처방', qty: -1, amount: -60 },
    ])
  })
})

const group = (id: string, codes: string[], over: Partial<UisGroupDef> = {}): UisGroupDef => ({ id, codes, out: [], cond: [], ...over })

describe('AC-8809.3 sumRxGroups: 묶음마다 더하기', () => {
  const codes = [
    { code: 'ESWT 1부위', name: '충격파 1부위', qty: 10, amount: 1000 },
    { code: 'carm', name: '가짜 처방', qty: 3.5, amount: 300 },
    { code: 'mm010 100/100', name: '가짜 주사', qty: 2.25, amount: 200 },
    { code: 'X9', name: '그 밖', qty: 1, amount: 50 },
  ]

  it('AC-8809.3: 넣는 처방 코드(앞뒤 빈칸 뗌 · 대소문자 무시)만 더하고, 어느 묶음에도 없는 코드는 그 밖 처방, 모두 합은 합계(총액만)다', () => {
    const summed = sumRxGroups(codes, [group('t1', [' eswt 1부위 ']), group('t2', ['CARM', 'mm010 100/100'])])
    expect(summed).toEqual({
      groups: [
        { id: 't1', qty: 10, amount: 1000 },
        { id: 't2', qty: 5.75, amount: 500 },
      ],
      other: { amount: 50 },
      total: { amount: 1550 },
      ignored: false,
    })
  })

  it('AC-8809.3: 빼는 처방·조건이 있는 묶음이 하나라도 있으면 ignored이고, 넣는 처방만 더한다(빼지 않는다)', () => {
    const withOut = sumRxGroups(codes, [group('t1', ['ESWT 1부위', 'carm'], { out: ['carm'] })])
    expect(withOut).toEqual({ groups: [{ id: 't1', qty: 13.5, amount: 1300 }], other: { amount: 250 }, total: { amount: 1550 }, ignored: true })
    const withCond = sumRxGroups(codes, [group('t1', ['ESWT 1부위']), group('t2', [], { cond: [{ any: true }] })])
    expect(withCond.ignored).toBe(true)
    expect(withCond.groups).toEqual([
      { id: 't1', qty: 10, amount: 1000 },
      { id: 't2', qty: 0, amount: 0 },
    ])
  })

  it('AC-8809.3: 두 묶음에 든 코드는 두 묶음에 다 더하고, 그 밖 처방에는 없으며 합계에는 한 번이다', () => {
    const summed = sumRxGroups(codes, [group('t1', ['carm']), group('t2', ['CARM'])])
    expect(summed.groups).toEqual([
      { id: 't1', qty: 3.5, amount: 300 },
      { id: 't2', qty: 3.5, amount: 300 },
    ])
    expect(summed.other).toEqual({ amount: 1250 })
    expect(summed.total).toEqual({ amount: 1550 })
  })

  it('AC-8809.3: 묶음이 없으면 모두 그 밖 처방이다', () => {
    expect(sumRxGroups(codes, [])).toEqual({ groups: [], other: { amount: 1550 }, total: { amount: 1550 }, ignored: false })
    expect(sumRxGroups([], [group('t1', ['carm'])])).toEqual({ groups: [{ id: 't1', qty: 0, amount: 0 }], other: { amount: 0 }, total: { amount: 0 }, ignored: false })
  })
})

const ten = (values: Record<number, number>) => Array.from({ length: 10 }, (_, i) => values[i] ?? 0)
const age = (day: string, bands: Record<number, number>, newBands: Record<number, number> = {}, updatedAt = AT): UisPeriodRow<UisAgePayload> => {
  const b = ten(bands)
  const n = ten(newBands)
  return {
    kind: 'age',
    from: day,
    to: day,
    payload: { v: 1, patients: b.reduce((s, x) => s + x, 0), newPatients: n.reduce((s, x) => s + x, 0), bands: b, newBands: n },
    updatedAt,
  }
}

describe('AC-8809.4 sumAges: 기간 나이대 합', () => {
  it('AC-8809.4: 띠마다 내원·신환 합, 나이대 줄이 있는 날 수, 진료한 날인데 아래쪽 표가 없는 날 수다(기간 밖 줄은 빼고)', () => {
    const rows = [age('2026-11-02', { 3: 2, 9: 1 }, { 3: 1 }), age('2026-11-03', { 3: 1, 5: 4 }, { 5: 2 }), age('2026-10-31', { 0: 9 }, { 0: 9 })]
    const summed = sumAges(rows, { from: '2026-11-01', to: '2026-11-07' }, new Set(['2026-10-31', '2026-11-02', '2026-11-03', '2026-11-04']))
    expect(summed).toEqual({ bands: ten({ 3: 3, 5: 4, 9: 1 }), newBands: ten({ 3: 1, 5: 2 }), days: 2, missingDays: 1 })
  })

  it('AC-8809.4: 같은 날 줄이 둘이면 updated_at이 늦은 것이다', () => {
    const rows = [age('2026-11-02', { 3: 5 }, {}, LATER), age('2026-11-02', { 3: 1 }, {}, AT)]
    expect(sumAges(rows, { from: '2026-11-02', to: '2026-11-02' }, new Set(['2026-11-02']))).toEqual({
      bands: ten({ 3: 5 }),
      newBands: ten({}),
      days: 1,
      missingDays: 0,
    })
  })

  it('AC-8809.4: 줄이 없으면 모두 0이고 진료한 날 수만큼 빠진 날이다', () => {
    expect(sumAges([], { from: '2026-11-01', to: '2026-11-30' }, new Set(['2026-11-02', '2026-11-03']))).toEqual({
      bands: ten({}),
      newBands: ten({}),
      days: 0,
      missingDays: 2,
    })
  })
})

const have = (over: Partial<UisHave> = {}): UisHave => ({ covered: [], worked: [], income: [], rx: [], age: [], ...over })

describe('AC-8809.5 missingFiles: 넣은 날 가운데 아직 없는 파일', () => {
  it('AC-8809.5: 휴진·오늘 뒤 날을 빼고 종류마다 아직 없는 날을 준다(차례: 일일수입통계 · 기간별처방통계 · 위쪽 표 · 아래쪽 표)', () => {
    const got = missingFiles(
      ['2026-11-04', '2026-11-02', '2026-11-03', '2026-11-28', '2026-11-02'],
      have({
        covered: [{ from: '2026-11-02', to: '2026-11-03' }],
        worked: ['2026-11-02'], // 11-03은 덮었고 진료 없음 = 휴진
        income: ['2026-11-02'],
        rx: [{ from: '2026-11-02', to: '2026-11-02' }],
        age: [],
      }),
      TODAY,
    )
    expect(got).toEqual([
      { kind: 'income', days: ['2026-11-04'] },
      { kind: 'rx', days: ['2026-11-04'] },
      { kind: 'visits', days: ['2026-11-04'] },
      { kind: 'visitPatients', days: ['2026-11-02', '2026-11-04'] },
    ])
  })

  it('AC-8809.5: 처방은 그날을 덮는 한 주·한 달 줄이 있으면 있는 것이고, 다 있으면 빈 목록이다', () => {
    const full = have({
      covered: [{ from: '2026-11-02', to: '2026-11-08' }],
      worked: ['2026-11-02', '2026-11-27'],
      income: ['2026-11-02', '2026-11-27'],
      rx: [
        { from: '2026-11-01', to: '2026-11-30' },
        { from: '2026-11-02', to: '2026-11-08' },
      ],
      age: ['2026-11-02', '2026-11-27'],
    })
    expect(missingFiles(['2026-11-02', '2026-11-27'], { ...full, covered: [...full.covered, { from: TODAY, to: TODAY }] }, TODAY)).toEqual([])
  })

  it('AC-8809.5: 오늘은 빼지 않는다(오늘 뒤만 뺀다)', () => {
    expect(missingFiles([TODAY], have(), TODAY)).toEqual([
      { kind: 'income', days: [TODAY] },
      { kind: 'rx', days: [TODAY] },
      { kind: 'visits', days: [TODAY] },
      { kind: 'visitPatients', days: [TODAY] },
    ])
    expect(missingFiles(['2026-11-28'], have(), TODAY)).toEqual([])
  })
})

describe('AC-8809.6 formatQty: 처방량 글', () => {
  it.each<[number, string]>([
    [1234.5, '1,234.5'],
    [12, '12'],
    [0.245, '0.25'],
    [0, '0'],
    [100, '100'],
    [1000, '1,000'],
    [2.1, '2.1'],
    [2.1 + 0.2, '2.3'],
    [0.1 + 0.2, '0.3'],
    [1234567.891, '1,234,567.89'],
    [0.004, '0'],
    [0.005, '0.01'],
    [-1234.5, '-1,234.5'],
    [-0.245, '-0.25'],
    [-0.001, '0'],
    [1_000_000_000, '1,000,000,000'],
  ])('AC-8809.6: %s → %s', (value, text) => {
    expect(formatQty(value)).toBe(text)
  })
})

describe('AC-8809.7 dayListText: 날 목록 글', () => {
  it.each<[string, string[], string]>([
    ['하루', ['2026-11-03'], '11월 3일'],
    ['이어진 날', ['2026-11-03', '2026-11-04', '2026-11-05'], '11월 3일~5일'],
    ['달이 바뀌는 이어진 날', ['2026-10-30', '2026-10-31', '2026-11-01'], '10월 30일~11월 1일'],
    ['차례가 뒤섞이고 겹친 날', ['2026-11-05', '2026-11-03', '2026-11-01', '2026-11-02', '2026-11-03'], '11월 1일~3일, 11월 5일'],
    ['올해가 아닌 날', ['2025-12-30', '2025-12-31'], '2025년 12월 30일~31일'],
    ['해가 섞임', ['2025-12-31', '2026-01-02'], '2025년 12월 31일, 1월 2일'],
    ['빈 목록', [], ''],
  ])('AC-8809.7: %s', (_name, list, text) => {
    expect(dayListText(list, TODAY)).toBe(text)
  })

  it('AC-8809.7: 덩어리가 열 개면 다 쓰고, 열 개를 넘으면 열 개 뒤 외 {남은 날 수}일이다', () => {
    const odd = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i * 2 + 1).padStart(2, '0')}`)
    expect(dayListText(odd, TODAY)).toBe('11월 1일, 11월 3일, 11월 5일, 11월 7일, 11월 9일, 11월 11일, 11월 13일, 11월 15일, 11월 17일, 11월 19일')
    expect(dayListText([...odd, '2026-11-21', '2026-11-23', '2026-11-24'], TODAY)).toBe(
      '11월 1일, 11월 3일, 11월 5일, 11월 7일, 11월 9일, 11월 11일, 11월 13일, 11월 15일, 11월 17일, 11월 19일 외 3일',
    )
  })
})

describe('AC-8809.1 환자 자료 구역 규칙', () => {
  it('AC-8809.1: lib/analytics/uisarang.ts는 React·supabase·lib/storage·네트워크·저장소·console을 쓰지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/analytics/uisarang.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*(react|next|supabase|storage|auth|parsers|workers)/)
    expect(source).not.toMatch(/\b(fetch|localStorage|sessionStorage|indexedDB|console)\b/)
    // 지역 설정에 따라 쉼표가 달라지지 않게 직접 쉼표를 찍는다
    expect(source).not.toContain('toLocaleString')
  })
})
