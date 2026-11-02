import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import { buildMemo, createMemoEngine, fill, memoText, ourClinicPhrases, prepareVisit, savedMemoMissing, unfinished, type Phrases } from './index'

// 부위 메모 조각과 말 채우기(원본 buildMemo·compose·fill). 원본과 글자까지 같은지는 golden.test.ts가 본다. 여기는 말마다의 뜻을 짧게 적어 둔다

const NO_TABLES = {}
const rx = (code: string, qty: number | null = 1, name = code, benefit = true): RxLine => ({ code, name, qty, benefit, pay: benefit ? '급여' : '비급여' })
const visit = (lines: string[], rows: RxLine[]): Visit => ({ key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] })
const phrases = (patch: Record<string, unknown> = {}): Phrases => {
  const value = ourClinicPhrases()
  Object.assign(value.TPL, patch)
  return value
}

describe('AC-014.2 fill: 문구 틀의 말 채우기', () => {
  const base = phrases()

  it.each([
    ['{좌우} {시술}', { 좌우: 'Rt', 시술: 'SSNB' }, 'Rt SSNB'],
    ['{한글방향} {영문방향}', { 좌우: 'both' }, '양측 both'],
    ['{한글방향}{영문방향}', { 좌우: 'Rt Lt' }, ''], // 두 쪽이 섞이면 방향을 쓰지 않는다
    ['{레벨} {부위} {약제} {KLG} {검사} {기간} {진단} {영상}', {}, ''], // 값이 없으면 빈칸
    ['{회차}회차 {KL1}/{KL2} {투여량} {코드} {처방명} {표기} {골절}', {}, '회차 /'],
  ])('AC-014.2: fill(%s)', (tpl, vars, out) => {
    expect(fill(tpl, vars, base, NO_TABLES)).toBe(out)
  })

  it('AC-014.2: 모르는 말은 원본처럼 그대로 둔다', () => {
    expect(fill('{모르는말} {시술}', { 시술: 'MBB' }, base, NO_TABLES)).toBe('{모르는말} MBB')
    expect(unfinished(fill('{모르는말}', {}, base, NO_TABLES))).toBe(true)
  })

  it('AC-014.2: 고정 멘트는 설정에서 읽고, 꺼져 있으면 빈칸이다', () => {
    expect(fill('{C-arm} {시술} {시행함}', { 시술: 'MBB' }, base, NO_TABLES)).toBe('C-arm guide 하에 MBB 시행함')
    const off = phrases({ fixedPhrases: [{ token: 'C-arm', text: '투시 하에', on: false }, { token: '내말', text: '끝', on: true }] })
    expect(fill('{C-arm} {시술} {내말}', { 시술: 'MBB' }, off, NO_TABLES)).toBe('MBB 끝')
  })

  it('AC-014.2: 빈칸이 남긴 공백·구두점을 원본처럼 정리한다', () => {
    expect(fill('{시술} , . ( ) 끝', { 시술: 'MBB' }, base, NO_TABLES)).toBe('MBB.  끝')
  })
})

describe('AC-014.1 buildMemo·memoText', () => {
  it('AC-014.1: 요추 시술 줄이 처방으로 걸러져 부위 메모가 된다', () => {
    const p = phrases()
    const v = prepareVisit(visit(['LBP', 'MBB L4,5 both SNB Rt'], [rx('LA358', 2), rx('LA272')]), p, NO_TABLES)
    const parts = buildMemo(v, 'lumbar', p, NO_TABLES)
    expect(parts).toMatchObject({ rg: 'lumbar', ko: '요추부', procTxt: 'MBB L4,5 both', snbSide: '우측', snbSeg: 'SNB' })
    expect(memoText(v, parts, p, NO_TABLES)).toBe('◈MBB L4,5 both\n◈SNB')
  })

  it('AC-014.1: 처방에 없는 시술은 메모에서 뺀다', () => {
    const p = phrases()
    const v = prepareVisit(visit(['Rt shoulder pain', 'Rt SSNB ANB'], [rx('LA247')]), p, NO_TABLES)
    expect(v.memos.map((m) => m.procTxt)).toEqual(['Rt SSNB'])
  })

  it('AC-014.1: 줄머리 기호는 설정에서 읽는다(비우면 없다)', () => {
    const p = phrases({ mark: '' })
    const v = prepareVisit(visit(['Rt shoulder pain', 'Rt SSNB'], [rx('LA247')]), p, NO_TABLES)
    expect(memoText(v, v.memos[0], p, NO_TABLES)).toBe('SSNB')
  })

  it('AC-014.1: K-L grade 줄은 연골주사 날에만 넣는다', () => {
    const p = phrases()
    const ara = prepareVisit(visit(['Rt knee OA KLG 3/2', '아라간 Rt knee 2차'], [rx('KK090'), rx('A49')]), p, NO_TABLES)
    expect(memoText(ara, ara.memos[0], p, NO_TABLES).split('\n')).toContain('◈K-L grade (3)/(2)')
    const other = prepareVisit(visit(['Rt knee OA KLG 3/2', 'FNB Rt'], [rx('LA274')]), p, NO_TABLES)
    expect(memoText(other, other.memos[0], p, NO_TABLES)).not.toContain('K-L grade')
  })
})

describe('AC-014.4 savedMemoMissing', () => {
  const p = phrases()
  const v = prepareVisit(visit(['Rt shoulder pain', 'Rt SSNB IA'], [rx('LA247'), rx('KK090')]), p, NO_TABLES)
  const reason = String(p.TPL.ia2)

  it('AC-014.4: 고친 메모가 없으면 경고가 없다', () => {
    expect(savedMemoMissing(undefined, v, p, NO_TABLES)).toEqual([])
  })
  it('AC-014.4: 고친 메모에 사유 문장이 빠졌으면 그 문장을 돌려준다', () => {
    expect(savedMemoMissing('◈SSNB', v, p, NO_TABLES)).toEqual([reason])
  })
  it('AC-014.4: 공백만 달라도 있는 것으로 본다', () => {
    expect(savedMemoMissing(`◈SSNB\n\n${reason.replace(/ /g, '  ')}`, v, p, NO_TABLES)).toEqual([])
  })
})

describe('AC-014.12 unfinished', () => {
  it.each([
    ['[부위 확인] aspiration', true],
    ['MBB [좌우 미확인]', true],
    ['[회차 미정]', true],
    ['[처방 누락] 있음', true],
    ['{항목} 남음', true],
    ['[약 확인: 트리암]', true],
    ['◈MBB L4,5 both', false],
    ['[참고] 끝', false],
    ['', false],
  ])('AC-014.12: unfinished(%s) = %s', (memo, out) => {
    expect(unfinished(memo)).toBe(out)
  })
})

describe('AC-014.7 엔진은 받은 설정만 읽는다', () => {
  it('AC-014.7: 지운 코드(CODEMAP_DEL)는 사전에 없는 코드다', () => {
    const p = phrases()
    p.CODEMAP_DEL = ['LA247']
    const engine = createMemoEngine(p, NO_TABLES)
    expect(engine.fullText(engine.prepareVisit(visit(['Rt shoulder pain'], [rx('LA247')])))).toBe('')
  })

  it('AC-014.7: 사전의 코드 이름을 바꾸면 메모도 바뀐다', () => {
    const p = phrases()
    p.CODEMAP.LA247 = { ...p.CODEMAP.LA247, n: 'SSB' }
    const engine = createMemoEngine(p, NO_TABLES)
    const v = engine.prepareVisit(visit(['Rt shoulder pain'], [rx('LA247')]))
    expect(engine.fullText(v)).toContain('SSB')
    expect(engine.fullText(v)).not.toContain('SSNB')
  })
})
