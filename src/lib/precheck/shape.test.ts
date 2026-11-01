import { describe, expect, it } from 'vitest'
import type { ClaimMonth, ClaimMonthJson, GridRow, HistoryRow } from '@/types/precheck'
import { buildFakeClaims } from '../../../fixtures/precheck/make-fake-claims'
import { PrecheckError, shapeClaimMonth } from './shape'

// 점검용 모양 만들기(REQ-009 AC-009.3~AC-009.5). 도우미 claim.month JSON(풀린 것) → design.md 6-3 ClaimMonth.
// 원본 mx999 selectWorkbook·build·splitCell(83 증상), selectWorkbook·parseRx(47 소모), new-medicore-diagnoses parse(83D 상병),
// loadHistory(12개월 이력), dx-recommend readTrend(상병 추세)의 줄 바꾸기를 그대로 옮겼는지 본다. 가짜 자료만 쓴다

const fake = (name: string) => buildFakeClaims().find((c) => c.name === name)!.json

const r83 = (visit: string, chart: string, name: string, text: string, day: string): GridRow => ({
  내원번호: visit,
  차트번호: chart,
  환자명: name,
  증상: text,
  기록날짜: day,
})
const r47 = (code: string, name: string, chart: string, day: string, pay = '급여', qty = '1'): GridRow => ({
  처방코드: code,
  처방명칭: name,
  차트번호: chart,
  처방일자: day,
  급여구분: pay,
  수량: qty,
})
const r83d = (visit: string, chart: string, code: string, role: string, name = `상병 ${code}`): GridRow => ({
  내원번호: visit,
  차트번호: chart,
  상병청구코드: code,
  상병명칭: name,
  주상병여부: role,
  산정특례기호: '',
  과목코드: 'OS',
  진단일자: '20261005',
})
const hist = (v: string, p: string, d: string, c: string[], m = ''): HistoryRow => ({ v, p, d, c, m })

/** 작은 한 달 자료. 넘긴 칸만 바꾸고 counts는 줄 수로 맞춘다(counts를 넘기면 그대로) */
function raw(parts: Partial<ClaimMonthJson> = {}): ClaimMonthJson {
  const base: Omit<ClaimMonthJson, 'counts'> = {
    version: 1,
    period: { from: '2026-10-01', to: '2026-10-07' },
    historyRange: { from: '2025-10-01', to: '2026-10-07' },
    trendRange: { from: '2025-11-04', to: '2026-11-03' },
    s83: [r83('a1', '900001', '가상환자01', 'S) knee pain', '20261005')],
    s83d: [],
    s47: [r47('KK090', '관절강내주사', '900001', '20261005')],
    history: [hist('a1', '900001', '2026-10-05', ['KK090'])],
    historyStats: { invalidRows: 0, invalidCodes: 0, truncated: 0 },
    dxTrend: { visits: 0, invalidRows: 0, truncated: 0, codes: [], suggestions: [] },
    catalog: { codes: [], la: [] },
  }
  const merged = { ...base, ...parts }
  const counts = parts.counts ?? {
    s83: merged.s83.length,
    s83d: merged.s83d.length,
    s47: merged.s47.length,
    history: merged.history.length,
  }
  return { ...merged, counts }
}

/** 멈추면 그 번호, 아니면 'shaped' */
function stopCode(input: unknown): string {
  try {
    shapeClaimMonth(input)
    return 'shaped'
  } catch (error) {
    return error instanceof PrecheckError ? error.code : 'other-error'
  }
}

const visit = (month: ClaimMonth, key: string) => month.visits.find((v) => v.key === key)!

describe('AC-009.3 원본 사례(v1~v18) → ClaimMonth', () => {
  const month = shapeClaimMonth(fake('rules-v1-v18'))

  it('AC-009.3: 진료는 날짜 → 차트번호(숫자) 차례(원본 byVisitDate)이고, 증상이 빈 v17은 진료가 되지 않는다(원본 build)', () => {
    expect(month.visits.map((v) => v.key)).toEqual([
      'v9', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v10', 'v11', 'v14', 'v15', 'v16', 'v18', 'v16b', 'v7b',
      'v12', 'v13',
    ])
  })

  it('AC-009.3: v1의 칸(key·chart·date·name·lines·rx·dx·memosInBit)이 원본 모양 그대로다. 날짜는 YYYY-MM-DD', () => {
    expect(visit(month, 'v1')).toEqual({
      key: 'v1',
      chart: '900001',
      date: '2026-10-05',
      month: '2026-10',
      name: '가상환자01',
      lines: ['MBB L4,5 both', 'LBP'],
      hints: [null, null],
      rx: [
        { code: 'LA358', name: '후지내측지', qty: 2.5, benefit: true, pay: '급여' },
        { code: 'LA357', name: '척추부신경', qty: 1, benefit: true, pay: '급여' },
        { code: 'A21', name: '트리암주', qty: 1, benefit: true, pay: '급여' },
      ],
      dx: [{ c: 'M5456', n: '상병 M5456', m: true, s: '', d: 'OS', t: '2026-10-05' }],
      memosInBit: [],
    })
  })

  it('AC-009.3: 상병은 주 → 부 → 배제 차례(원본 rank)이고 원본 표기 그대로(true·false·x)다', () => {
    expect(visit(month, 'v16').dx.map((d) => [d.c, d.m])).toEqual([
      ['M5456', true],
      ['M1706', 'x'],
    ])
    expect(visit(month, 'v16b').dx.map((d) => [d.c, d.m])).toEqual([['M1706', false]])
    expect(month.hasDx).toBe(true)
  })

  it('AC-009.3: 이력은 차트번호 → 날짜로 묶고(원본 HIST.byChart), 같은 날 두 내원의 코드·메모를 합친다', () => {
    const day = month.history.get('900010')?.get('2026-09-15')
    expect(day).toEqual({ codes: ['KR006', 'MM010'], memo: '도수 1회' })
    expect(month.history.get('900001')?.get('2026-10-05')).toEqual({ codes: ['LA358', 'LA357', 'A21'], memo: '' })
    expect(month.historyRange).toEqual({ from: '2025-10-01', to: '2026-10-07' })
    expect(month.period).toEqual({ from: '2026-10-01', to: '2026-10-07' })
  })

  it('AC-009.3: 비트에 이미 있는 메모는 이력의 같은 내원(내원번호·차트번호)에서 가져온다', () => {
    expect(visit(month, 'v8').memosInBit).toEqual(['물리치료 메모(가상)'])
    expect(visit(month, 'v2').memosInBit).toEqual([])
  })

  it('AC-009.3: 상병 추세(원본 readTrend 모양)와 처방 목록이 함께 온다', () => {
    expect(month.dxTrend.from).toBe('2025-11-04')
    expect(month.dxTrend.to).toBe('2026-11-03')
    expect(month.dxTrend.visits).toBe(120)
    expect(month.dxTrend.codes.get('KK090')).toEqual({
      n: 40,
      d: [
        { c: 'M1706', nm: '상병 M1706', m: 30, s: 6, x: 0, l: 420 },
        { c: 'M5456', nm: '상병 M5456', m: 2, s: 8, x: 0, l: 90 },
      ],
    })
    expect(month.dxTrend.suggestions).toEqual([
      { rx: 'KK090', n: 40, k: 900, miss: 4, groups: [{ c: 'M17', nm: '상병 M1706', k: 900, x: 0 }] },
    ])
    expect(month.catalog.codes.find((c) => c.code === 'LA358')).toEqual({
      code: 'LA358',
      name: '후지내측지',
      kind: 'procedure',
      active: true,
      standardCode: 'LA358',
    })
    expect(month.catalog.la.map((c) => c.code)).toEqual(['LA357', 'LA358'])
  })

  it('AC-009.3: 처방은 차트번호·날짜로도 찾는다(원본 RXDATA). 진료가 안 된 v17의 처방도 남는다', () => {
    expect(month.rxByDay.get('900001')?.get('2026-10-05')).toEqual(visit(month, 'v1').rx)
    expect(month.rxByDay.get('900014')?.get('2026-10-05')).toEqual([
      { code: 'MM010', name: '표층열', qty: 1, benefit: true, pay: '급여' },
    ])
  })

  it('AC-009.3: 그날 처방 목록은 47 표에서 (차트, 날짜)가 처음 나온 차례다(원본 Object.values(RXDATA)). 같은 날로 되돌아온 줄은 처음 자리의 목록에 붙는다', () => {
    const month = shapeClaimMonth(
      raw({
        s83: [r83('a1', '900001', '가상환자01', 'S) knee pain', '20261001')],
        s47: [
          r47('MM010', '표층열', '900001', '20261001'),
          r47('Q1', '가상주', '900002', '20261002'),
          r47('Q1', '트리암주', '900001', '20261005'),
          r47('KK090', '관절강내주사', '900001', '20261001'),
          r47('MM020', '심층열', '900002', '20261002'),
        ],
      }),
    )
    expect(month.rxDayOrder.map((list) => list.map((line) => line.code))).toEqual([['MM010', 'KK090'], ['Q1', 'MM020'], ['Q1']])
    // 복사가 아니라 차트번호·날짜로 찾는 목록과 같은 배열이다. 진료의 처방도 같은 배열을 가리킨다
    expect(month.rxDayOrder[0]).toBe(month.rxByDay.get('900001')?.get('2026-10-01'))
    expect(month.rxDayOrder[1]).toBe(month.rxByDay.get('900002')?.get('2026-10-02'))
    expect(month.rxDayOrder[2]).toBe(month.rxByDay.get('900001')?.get('2026-10-05'))
    expect(visit(month, 'a1').rx).toBe(month.rxDayOrder[0])
  })
})

describe('AC-009.3 83 증상 줄 → 진료(원본 selectWorkbook·build·splitCell)', () => {
  it('AC-009.3: 같은 내원번호의 줄은 한 진료로 모이고, 칸 하나의 여러 줄·머리말(S) O) P))을 나눠 힌트를 단다', () => {
    const month = shapeClaimMonth(
      raw({
        s83: [
          r83('a1', ' 900001 ', ' 가상환자01 ', 'Rt knee IA\nS) knee pain', '20261005'),
          r83('a1', '900001', '가상환자01', 'O) Td(+); P) IA', '20261005'),
        ],
      }),
    )
    expect(month.visits).toHaveLength(1)
    expect(month.visits[0]).toMatchObject({
      key: 'a1',
      chart: '900001',
      name: '가상환자01',
      lines: ['Rt knee IA', 'knee pain', 'Td(+)', 'IA'],
      hints: [null, 'subj', 'exam', 'plan'],
    })
  })

  it('AC-009.3: 증상이 빈 줄(빈 줄·합계 줄 【총계】)은 건너뛴다', () => {
    const month = shapeClaimMonth(
      raw({
        s83: [
          r83('', '【총계】', '', '', ''),
          r83('', '2건', '', '', ''),
          r83('a1', '900001', '가상환자01', 'S) knee pain', '20261005'),
          r83('a2', '900002', '가상환자02', '   ', '20261005'),
        ],
      }),
    )
    expect(month.visits.map((v) => v.key)).toEqual(['a1'])
  })

  it.each([
    ['20261005', '2026-10-05'],
    ['2026-10-05', '2026-10-05'],
    ['2026.10.05 09:30', '2026-10-05'],
    ['46300', '2026-10-05'],
  ])('AC-009.3: 기록날짜 %s → %s(lib/analytics/dates.ts), 진료 달은 YYYY-MM', (cell, ymd) => {
    const month = shapeClaimMonth(raw({ s83: [r83('a1', '900001', '가상환자01', 'LBP', cell)] }))
    expect(month.visits[0].date).toBe(ymd)
    expect(month.visits[0].month).toBe('2026-10')
  })

  it.each([
    ['기록날짜를 읽지 못함', r83('a1', '900001', '가상환자01', 'LBP', '2026-13-01')],
    ['기록날짜가 빔', r83('a1', '900001', '가상환자01', 'LBP', '')],
    ['차트번호가 빔', r83('a1', '', '가상환자01', 'LBP', '20261005')],
    ['내원번호가 빔', r83('', '900001', '가상환자01', 'LBP', '20261005')],
  ])('AC-009.3: 증상이 있는 줄의 %s → E-CLAIM-PARTIAL(원본은 가져오기를 멈춘다)', (_, row) => {
    expect(stopCode(raw({ s83: [r83('a0', '900009', '가상환자09', 'S) LBP', '20261005'), row] }))).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.3: 같은 내원번호에 다른 환자나 날짜가 있으면 E-CLAIM-PARTIAL', () => {
    const rows = [r83('a1', '900001', '가상환자01', 'LBP', '20261005'), r83('a1', '900002', '가상환자02', 'LBP', '20261005')]
    expect(stopCode(raw({ s83: rows }))).toBe('E-CLAIM-PARTIAL')
  })
})

describe('AC-009.3 47 소모 줄 → 처방(원본 selectWorkbook·parseRx)', () => {
  it('AC-009.3: 급여구분에 비급여가 있으면 benefit false, 수량은 원본 normalizeQuantity(쉼표·소수, 못 읽으면 null)', () => {
    const month = shapeClaimMonth(
      raw({
        s47: [
          r47('KK090', '관절강내주사', '900001', '20261005', '급여', '1,000'),
          r47('KR006', '도수치료', '900001', '20261005', '비급여', '1.5'),
          r47('A21', '트리암주', '900001', '20261005', '급여', ''),
          r47('A15', '리도카인주', '900001', '20261005', '급여', 'abc'),
          { 처방코드: 'MM010', 차트번호: '900001', 처방일자: '20261005' },
        ],
      }),
    )
    expect(month.visits[0].rx).toEqual([
      { code: 'KK090', name: '관절강내주사', qty: 1000, benefit: true, pay: '급여' },
      { code: 'KR006', name: '도수치료', qty: 1.5, benefit: false, pay: '비급여' },
      { code: 'A21', name: '트리암주', qty: null, benefit: true, pay: '급여' },
      { code: 'A15', name: '리도카인주', qty: null, benefit: true, pay: '급여' },
      { code: 'MM010', name: '', qty: null, benefit: true, pay: '' },
    ])
  })

  it('AC-009.3: 차트번호가 빈 줄(합계·소계 줄)은 건너뛰고, 처방은 그 차트번호·날짜의 진료에 붙는다', () => {
    const month = shapeClaimMonth(
      raw({
        s83: [r83('a1', '900001', '가상환자01', 'LBP', '20261005'), r83('a2', '900002', '가상환자02', 'LBP', '20261006')],
        s47: [
          r47('KK090', '관절강내주사', '900001', '2026-10-05'),
          r47('▶ 소계', '', '', ''),
          r47('MM010', '표층열', '900002', '20261006'),
        ],
      }),
    )
    expect(visit(month, 'a1').rx.map((r) => r.code)).toEqual(['KK090'])
    expect(visit(month, 'a2').rx.map((r) => r.code)).toEqual(['MM010'])
  })

  it.each([
    ['처방일자를 읽지 못함', r47('KK090', '관절강내주사', '900001', '2026-02-30')],
    ['처방코드가 빔', r47('', '관절강내주사', '900001', '20261005')],
    ['집계 표시(◀▶)가 환자 줄에 섞임', r47('◀ KK090', '관절강내주사', '900001', '20261005')],
  ])('AC-009.3: 차트번호가 있는 줄의 %s → E-CLAIM-PARTIAL', (_, row) => {
    expect(stopCode(raw({ s47: [r47('KK090', '관절강내주사', '900001', '20261005'), row] }))).toBe('E-CLAIM-PARTIAL')
  })
})

describe('AC-009.3 83D 상병 줄 → 진료의 상병(원본 new-medicore-diagnoses parse·get)', () => {
  it('AC-009.3: 주상병여부(주상병·부상병·배재상병·배제상병)를 true·false·x로, 코드는 공백을 빼고 대문자로, 같은 코드는 한 번만', () => {
    const month = shapeClaimMonth(
      raw({
        s83d: [
          r83d('a1', '900001', 'm 1706', '배재상병'),
          r83d('a1', '900001', 'M5456', '부상병'),
          r83d('a1', '900001', 'M7710', '배제상병'),
          r83d('a1', '900001', 'M545', '주상병'),
          r83d('a1', '900001', 'M5456', '주상병'),
          r83d('a1', '900001', 'M17.06', '부상병'),
          r83d('a1', '900001', '', ''),
        ],
      }),
    )
    expect(month.visits[0].dx.map((d) => [d.c, d.m])).toEqual([
      ['M545', true],
      ['M5456', false],
      ['M1706', 'x'],
      ['M7710', 'x'],
    ])
  })

  it('AC-009.3: 내원번호가 같아도 차트번호가 다르면 붙이지 않는다(앞의 0은 같은 차트로 본다)', () => {
    const month = shapeClaimMonth(
      raw({ s83d: [r83d('a1', '0900001', 'M1706', '주상병'), r83d('a1', '900002', 'M5456', '주상병')] }),
    )
    expect(month.visits[0].dx.map((d) => d.c)).toEqual(['M1706'])
  })

  it('AC-009.3: 주상병여부 칸이 없는 표면 m은 원본처럼 null(모름)이다', () => {
    const month = shapeClaimMonth(raw({ s83d: [{ 내원번호: 'a1', 차트번호: '900001', 상병청구코드: 'M1706' }] }))
    expect(month.visits[0].dx).toEqual([{ c: 'M1706', n: '', m: null, s: '', d: '', t: '' }])
  })
})

describe('AC-009.3 12개월 이력·추세·처방 목록', () => {
  it('AC-009.3: 이력 코드는 대문자로 겹치지 않게, 메모는 줄바꿈으로 잇고, 모양이 틀린 줄은 원본처럼 건너뛴다', () => {
    const month = shapeClaimMonth(
      raw({
        history: [
          hist('h1', '900001', '2026-03-02', ['kk090', 'A21'], '메모 하나'),
          hist('h2', '900001', '2026-03-02', ['KK090', 'A15'], '메모 둘'),
          hist('h3', '900001', '2026-03-02', [], '메모 하나'),
          hist('h4', '900001', '20260302', ['MM010']),
          { v: 'h5', p: '900001', d: '2026-03-03', c: 'KK090', m: '' } as unknown as HistoryRow,
          hist('a1', '900001', '2026-10-05', ['KK090'], '비트에 있던 메모'),
        ],
      }),
    )
    expect(month.history.get('900001')?.get('2026-03-02')).toEqual({ codes: ['KK090', 'A21', 'A15'], memo: '메모 하나\n메모 둘' })
    expect([...(month.history.get('900001')?.keys() ?? [])]).toEqual(['2026-03-02', '2026-10-05'])
    expect(month.visits[0].memosInBit).toEqual(['비트에 있던 메모'])
  })

  it('AC-009.3: 추세의 상병 코드가 틀리거나 묶음이 비면 E-CLAIM-PARTIAL(원본 readTrend가 거절)', () => {
    const good = { c: 'KK090', n: 1, d: [{ c: 'M1706', nm: '상병', m: 1, s: 0, x: 0, l: 100 }] }
    expect(stopCode(raw({ dxTrend: { visits: 1, invalidRows: 0, truncated: 0, codes: [good], suggestions: [] } }))).toBe('shaped')
    const badDx = { ...good, d: [{ ...good.d[0], c: 'm17.06' }] }
    expect(stopCode(raw({ dxTrend: { visits: 1, invalidRows: 0, truncated: 0, codes: [badDx], suggestions: [] } }))).toBe(
      'E-CLAIM-PARTIAL',
    )
    const emptyGroups = { c: 'KK090', n: 1, k: 500, miss: 0, g: [] }
    expect(
      stopCode(raw({ dxTrend: { visits: 1, invalidRows: 0, truncated: 0, codes: [], suggestions: [emptyGroups] } })),
    ).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.3: 처방 목록의 종류가 원본 KINDS(drug·procedure·lab·other·unknown) 밖이면 E-CLAIM-PARTIAL', () => {
    const code = { code: 'KK090', name: '관절강내주사', kind: 'procedure' as const, active: true, standardCode: 'KK090' }
    expect(stopCode(raw({ catalog: { codes: [code], la: [] } }))).toBe('shaped')
    expect(stopCode(raw({ catalog: { codes: [{ ...code, kind: 'surgery' as 'other' }], la: [] } }))).toBe('E-CLAIM-PARTIAL')
  })
})

describe('AC-009.4 빠지거나 틀린 자료면 E-CLAIM-PARTIAL로 멈춘다', () => {
  it('AC-009.4: 증상(83)이 비면 멈춘다(줄이 없거나 모든 줄의 증상이 빔)', () => {
    expect(stopCode(raw({ s83: [] }))).toBe('E-CLAIM-PARTIAL')
    expect(stopCode(raw({ s83: [r83('a1', '900001', '가상환자01', '', '20261005')] }))).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.4: 소모(47)가 비면 멈춘다(줄이 없거나 합계 줄뿐)', () => {
    expect(stopCode(raw({ s47: [] }))).toBe('E-CLAIM-PARTIAL')
    expect(stopCode(raw({ s47: [r47('▶ 합계', '', '', '')] }))).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.4: 12개월 이력이 없으면 멈춘다', () => {
    expect(stopCode(raw({ history: [] }))).toBe('E-CLAIM-PARTIAL')
  })

  // 배열 검사가 빠지면 없음·null·{length}는 TypeError가 된다. loadMonth는 그것도 E-CLAIM-PARTIAL로 바꿔 차이가 안 보이므로 여기서 PrecheckError인지 본다
  it.each([
    ['칸이 없음', undefined, 0],
    ['null', null, 0],
    ['글자', 'abc', 3],
    ['length만 맞춘 객체', { length: 1 }, 1],
  ])('AC-009.4: 이력이 %s이면 멈춘다', (_, history, count) => {
    const base = raw()
    expect(stopCode({ ...base, history, counts: { ...base.counts, history: count } })).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.4: 이력 줄이 왔어도 쓸 수 있는 줄이 하나도 없으면 멈춘다(증상·소모처럼 거른 뒤에 센다)', () => {
    const history = [hist('a1', '900001', '20261005', ['KK090']), hist('a2', '900002', '20261006', ['MM010'])]
    expect(stopCode(raw({ history }))).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.4: 상병(83D)은 원본처럼 없어도 된다 — 상병 없음(hasDx false)으로 점검을 이어 간다', () => {
    const month = shapeClaimMonth(raw({ s83d: [] }))
    expect(month.hasDx).toBe(false)
    expect(month.visits[0].dx).toEqual([])
  })

  it.each(['s83', 's83d', 's47', 'history'] as const)('AC-009.4: counts.%s가 받은 줄 수와 다르면 멈춘다', (key) => {
    const base = raw({ s83d: [r83d('a1', '900001', 'M1706', '주상병')] })
    expect(stopCode(base)).toBe('shaped')
    expect(stopCode({ ...base, counts: { ...base.counts, [key]: base.counts[key] + 1 } })).toBe('E-CLAIM-PARTIAL')
  })

  it.each([
    ['글자', 'not-an-object'],
    ['null', null],
    ['약속 번호가 다름', { ...raw(), version: 2 }],
    ['counts 없음', { ...raw(), counts: undefined }],
    ['표가 배열이 아님', { ...raw(), s47: {} }],
    ['줄 값이 글자가 아님', raw({ s83: [{ 내원번호: 'a1', 차트번호: 900001, 증상: 'LBP', 기록날짜: '20261005' } as unknown as GridRow] })],
    ['기간 날짜가 틀림', { ...raw(), period: { from: '2026-10-07', to: '2026-10-01' } }],
    ['추세가 없음', { ...raw(), dxTrend: undefined }],
    ['처방 목록이 없음', { ...raw(), catalog: undefined }],
  ])('AC-009.4: 모양이 틀리면(%s) 멈춘다', (_, input) => {
    expect(stopCode(input)).toBe('E-CLAIM-PARTIAL')
  })

  it('AC-009.4: 멈출 때 오류에는 번호만 있다(환자 글자를 싣지 않는다)', () => {
    try {
      shapeClaimMonth(raw({ s83: [r83('a1', '', '가상환자01', 'S) 가상 증상', '20261005')] }))
      throw new Error('멈추지 않았다')
    } catch (error) {
      expect(error).toBeInstanceOf(PrecheckError)
      expect((error as PrecheckError).message).toBe('E-CLAIM-PARTIAL')
      expect(JSON.stringify(error)).not.toContain('가상')
    }
  })
})

describe('AC-009.5 달을 넘기는 기간(10/30~11/2)', () => {
  it('AC-009.5: 진료마다 진료 달(YYYY-MM)을 붙이고, 두 달의 진료를 한 ClaimMonth로 묶어 한 번에 점검한다', () => {
    const month = shapeClaimMonth(fake('cross-month'))
    expect(month.period).toEqual({ from: '2026-10-30', to: '2026-11-02' })
    expect(month.visits.map((v) => [v.key, v.date, v.month])).toEqual([
      ['c1', '2026-10-30', '2026-10'],
      ['c2', '2026-10-31', '2026-10'],
      ['c3', '2026-11-02', '2026-11'],
      ['c4', '2026-11-02', '2026-11'],
    ])
    // 11월 진료(c3)의 이력에서 10월 진료(c1, 같은 차트)가 보인다
    expect(month.history.get(visit(month, 'c3').chart)?.has('2026-10-30')).toBe(true)
  })
})
