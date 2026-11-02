import { describe, expect, it } from 'vitest'
import type { ClaimMonth, RxLine, Visit } from '@/types/precheck'
import { analyzeMonth, createMemoEngine, fullText, ourClinicPhrases, prepareVisit, unfinished, type MemoTables, type Phrases } from './index'

// 비트에 들어가는 글(원본 fullText·fullTextBody, AC-014.5)과 재료(applyRx·computeIntervals·문구 사전, AC-014.6).
// 원본과 글자까지 같은지는 golden.test.ts가 본다

const NO_TABLES: MemoTables = {}
const rx = (code: string, qty: number | null = 1, benefit = true): RxLine => ({ code, name: code, qty, benefit, pay: benefit ? '급여' : '비급여' })
function visit(key: string, lines: string[], rows: RxLine[], date = '2026-10-12', chart = '900001'): Visit {
  return { key, chart, date, month: date.slice(0, 7), name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] }
}
const phrases = (patch: Record<string, unknown> = {}): Phrases => {
  const value = ourClinicPhrases()
  Object.assign(value.TPL, patch)
  return value
}
const text = (lines: string[], rows: RxLine[], patch: Record<string, unknown> = {}, tables: MemoTables = NO_TABLES) => {
  const p = phrases(patch)
  return fullText(prepareVisit(visit('t1', lines, rows), p, tables), p, tables)
}
function monthOf(visits: Visit[], extra: [chart: string, date: string, rows: RxLine[]][] = []): ClaimMonth {
  const rxByDay: ClaimMonth['rxByDay'] = new Map()
  const add = (chart: string, date: string, rows: RxLine[]) => {
    const days = rxByDay.get(chart) ?? new Map<string, RxLine[]>()
    days.set(date, rows)
    rxByDay.set(chart, days)
  }
  for (const v of visits) add(v.chart, v.date, v.rx)
  for (const [chart, date, rows] of extra) add(chart, date, rows)
  return { visits, rxByDay } as unknown as ClaimMonth
}

describe('AC-014.5 fullText: 비트에 들어가는 글', () => {
  it('AC-014.5: memoText 묶음 + rxLines + noteLines 차례이고 IA 줄만 한 줄 띄워 맨 아래다', () => {
    const out = text(['Rt shoulder pain', 'Rt shoulder IA', 'Rt SSNB'], [rx('LA247'), rx('KK090'), rx('HA280')])
    expect(out).toBe('◈SSNB\n◈관절조영 시행\n\n◈IA injection of - shoulder\n\n환자 스케쥴상 주1회 내원 밖에 안되어 당일 주사치료 2부위 시행함. 환자 증상 호소 심해 치료 요하는 상태임')
  })

  it('AC-014.5: 처방에는 있고 차트에 없는 시술은 처방 줄로 채운다(rxLines)', () => {
    expect(text(['Rt elbow'], [rx('KK061')])).toBe('◈신경간내주사')
  })

  it('AC-014.5: 같은 문장은 한 번만 넣는다(lineKey: 기호·공백·대소문자·끝 마침표를 뺀 비교)', () => {
    const p = phrases()
    const engine = createMemoEngine(p, NO_TABLES)
    expect(engine.lineKey('◈ MBB  L4,5.')).toBe(engine.lineKey('mbb l4,5'))
    expect(text(['MBB L4,5 Rt', 'LBP', 'MBB L4,5 Rt'], [rx('LA358')]).match(/MBB/g)).toHaveLength(1)
  })

  it('AC-014.5: formatLevels: 레벨 구분을 설정대로 바꾼다', () => {
    const lines = ['LBP', 'MBB L4,5,S1 both']
    expect(text(lines, [rx('LA358', 3)])).toBe('◈MBB L4,5,S1 both')
    expect(text(lines, [rx('LA358', 3)], { levelSep: 'dash' })).toBe('◈MBB L4-5-S1 both')
    expect(text(lines, [rx('LA358', 3)], { levelSep: 'repeat' })).toBe('◈MBB L4, L5, S1 both')
  })

  it('AC-014.5: styleSides: 좌우 표기를 설정 모양으로 바꾼다', () => {
    const lines = ['LBP', 'MBB L4,5 both']
    expect(text(lines, [rx('LA358', 3)], { sideStyle: 'ko' })).toBe('◈MBB L4,5 양측')
    expect(text(lines, [rx('LA358', 3)], { sideStyle: 'upper' })).toBe('◈MBB L4,5 BOTH')
    expect(text(lines, [rx('LA358', 3)])).toBe('◈MBB L4,5 both')
  })

  it('AC-014.5: oneLineMemo: 시술 줄은 쉼표로 잇는다', () => {
    const out = text(['Rt shoulder pain', 'Rt SSNB ANB'], [rx('LA247'), rx('LA346')], { lineJoin: 'oneLine', ia2: '', itv: '' })
    expect(out).toBe('◈SSNB, ANB')
  })

  it('AC-014.5: sentenceMemo: 한 줄 문장 틀이 있으면 그 틀로 쓴다', () => {
    const out = text(['Lt lumbar pain', 'MBB L4,5 Lt'], [rx('LA358')], { sentence: '{C-arm} {좌우} {시술} {레벨} {시행함}.' })
    expect(out).toBe('C-arm guide 하에 Lt MBB 4,5 시행함.')
  })

  it('AC-014.5: sentenceMemo: 시술이 없는 날은 문장을 만들지 않는다', () => {
    expect(text(['상담만'], [], { sentence: '{시술목록} {시행함}.' })).toBe('')
  })
})

describe('AC-014.6 applyRx·computeIntervals·문구 사전', () => {
  it('AC-014.6: applyRx는 급여 시술 처방으로 수량 표와 처방 보충 줄을 만든다', () => {
    const p = phrases()
    const v = prepareVisit(visit('t1', ['Rt shoulder pain'], [rx('LA247', 1.5), rx('LA346', 1, false), rx('A15')]), p, NO_TABLES)
    expect({ ...v.rxQty }).toEqual({ SSNB: 1.5 })
    expect([...v.rxNames!]).toEqual(['SSNB'])
    expect(v.rxAdd.map((a) => a.code)).toEqual(['LA247'])
  })

  it('AC-014.6: 처방이 없는 진료는 차트만 본다', () => {
    const p = phrases()
    const v = prepareVisit(visit('t1', ['MBB L4,5 Rt', 'LBP'], []), p, NO_TABLES)
    expect(v.rxNames).toBeNull()
    expect(v.rxNone).toBe(true)
  })

  it('AC-014.6: 같은 코드가 기본 7일 안에 다시 있으면 간격 사유를 넣는다(그날 포함 7일)', () => {
    const p = phrases()
    const a = visit('a', ['Rt knee IA'], [rx('KK090')], '2026-10-05')
    const b = visit('b', ['Rt knee IA'], [rx('KK090')], '2026-10-12')
    const c = visit('c', ['Rt knee IA'], [rx('KK090')], '2026-10-20')
    const [va, vb, vc] = analyzeMonth(monthOf([a, b, c]), p, NO_TABLES)
    expect(va.shortItv).toBeNull()
    expect(vb.shortItv).toMatchObject({ nm: 'IA', code: 'KK090', d: 7, prev: '2026-10-05', lim: 7 })
    expect(vc.shortItv).toBeNull()
    expect(fullText(vb, p, NO_TABLES)).toContain(String(p.TPL.itv))
    expect(fullText(vc, p, NO_TABLES)).not.toContain(String(p.TPL.itv))
  })

  it('AC-014.6: 진료가 안 된 날의 처방도 읽은 기간 안이면 앞 내원으로 본다(AC-013.13)', () => {
    const p = phrases()
    const b = visit('b', ['Rt knee IA'], [rx('KK090')], '2026-10-12')
    const [vb] = analyzeMonth(monthOf([b], [['900001', '2026-10-08', [rx('KK090')]]]), p, NO_TABLES)
    expect(vb.shortItv).toMatchObject({ d: 4, prev: '2026-10-08' })
  })

  it('AC-014.6: 비급여 앞 내원은 보지 않는다', () => {
    const p = phrases()
    const b = visit('b', ['Rt knee IA'], [rx('KK090')], '2026-10-12')
    const [vb] = analyzeMonth(monthOf([b], [['900001', '2026-10-08', [rx('KK090', 1, false)]]]), p, NO_TABLES)
    expect(vb.shortItv).toBeNull()
  })

  it('AC-014.6: 12개월 이력으로 계산하지 않는다(읽은 기간에 없으면 이력에 있어도 간격이 없다)', () => {
    const p = phrases()
    const b = visit('b', ['Rt knee IA'], [rx('KK090')], '2026-10-12')
    const history = new Map([['900001', new Map([['2026-10-08', { codes: ['KK090'], memo: '' }]])]])
    const month = { ...monthOf([b]), history }
    const [vb] = analyzeMonth(month, p, NO_TABLES)
    expect(vb.shortItv).toBeNull()
  })

  it('AC-014.6: intervalCodes·intervalDays는 설정에서 읽는다', () => {
    const p = phrases({ intervalCodes: 'LA247', intervalDays: 3 })
    const a = visit('a', ['Rt SSNB', 'shoulder'], [rx('LA247'), rx('KK090')], '2026-10-08')
    const b = visit('b', ['Rt SSNB', 'shoulder'], [rx('LA247'), rx('KK090')], '2026-10-10')
    const [, vb] = analyzeMonth(monthOf([a, b]), p, NO_TABLES)
    expect(vb.shortItv).toMatchObject({ code: 'LA247', d: 2, lim: 3 })
  })

  it('AC-014.6: LA358은 다른 척추 부위면 간격으로 보지 않는다', () => {
    const p = phrases()
    const a = visit('a', ['C-MBB 4,5,6 Rt'], [rx('LA358')], '2026-10-08')
    const b = visit('b', ['MBB L4,5 Rt'], [rx('LA358')], '2026-10-10')
    const [, vb] = analyzeMonth(monthOf([a, b]), p, NO_TABLES)
    expect(vb.shortItv).toBeNull()
  })

  it('AC-014.6: 문구 사전의 줄임말이 시술 이름으로 바뀐다', () => {
    const dictionary = { aliases: [{ id: 'a', kind: 'procedure', term: '견갑상차단', target: 'SSNB' }], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false } }
    expect(text(['Rt shoulder pain', 'Rt 견갑상차단'], [rx('LA247')], {}, { dictionary })).toBe('◈SSNB')
  })

  it('AC-014.6: 문구 사전의 생략 규칙(어깨 ANB)을 따른다', () => {
    const lines = ['shoulder pain', 'Rt SSNB ANB + C-MBB 4,5,6 Rt']
    const rows = [rx('LA247'), rx('LA346'), rx('LA358', 3)]
    const dictionary = { aliases: [], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: true } }
    expect(text(lines, rows)).toContain('ANB')
    expect(text(lines, rows, {}, { dictionary })).not.toContain('ANB')
  })

  it('AC-014.6: 문구 사전의 취소·보류 낱말이 든 줄은 시술로 보지 않는다', () => {
    const dictionary = { aliases: [{ id: 'a', kind: 'hold', term: '이번엔보류', target: '보류' }], omissions: { dropRootEpi: false, dropShoulderAnbWithCervicalMbb: false } }
    const p = phrases()
    const v = prepareVisit(visit('t1', ['Rt shoulder pain', 'Rt SSNB 이번엔보류'], []), p, { dictionary })
    expect(v.items.find((i) => i.raw.includes('보류'))?.k).toBe('plan')
  })
})

describe('AC-014.5 확인 표시', () => {
  it('AC-014.5: 부위를 못 찾은 IA 줄은 확인 표시가 남는다', () => {
    const out = text(['통증'], [rx('KK090')])
    expect(out).toBe('◈IA injection of - [부위 확인]')
    expect(unfinished(out)).toBe(true)
  })
})
