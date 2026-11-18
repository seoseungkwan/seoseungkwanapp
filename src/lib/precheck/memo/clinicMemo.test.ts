import { describe, expect, it } from 'vitest'
import type { RxLine, Visit } from '@/types/precheck'
import {
  createMemoEngine,
  DEFAULT_INTERVAL_CODES,
  DEFAULT_INTERVAL_DAYS,
  DEFAULT_MAIN_CENTRAL_CODES,
  DEFAULT_TWO_SITE_RULES,
  defaultPhrases,
  fullText,
  neutralPhrases,
  ourClinicPhrases,
  prepareVisit,
  validatePhrases,
  type MemoTables,
  type Phrases,
} from './index'

// 다른 병원 청구메모(clinic-profile TASK-5): 중립 기본 문구(AC-6607.3), 그 병원 연골주사 약 이름(REQ-6609), 차트 줄임말(REQ-6612).
// 우리 의원 결과가 글자까지 같은지는 golden.test.ts가 본다(AC-6609.3·AC-6612.3). 여기서는 다른 병원 값과 우리 의원 몇 건을 직접 본다

const PRIVATE_CODES = ['A15', 'A19', 'A21', 'A41', 'A49', 'carm1', 'sono1']
const rx = (code: string, qty: number | null = 1, name = code): RxLine => ({ code, name, qty, benefit: true, pay: '급여' })
function visit(lines: string[], rows: RxLine[]): Visit {
  return { key: 't1', chart: '900001', date: '2026-10-12', month: '2026-10', name: '가상환자01', lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] }
}
const memo = (phrases: Phrases, lines: string[], rows: RxLine[], tables: MemoTables = {}) => fullText(prepareVisit(visit(lines, rows), phrases, tables), phrases, tables)

/** 다른 병원: 중립 기본 문구 + 연골주사 약 하나(이름은 그 병원 것) + 관절강내주사 날 그 약 넣기 */
function otherClinic(name: string, row: Record<string, unknown> = {}, place: 'afterProc' | 'afterEnding' = 'afterEnding'): Phrases {
  const value = neutralPhrases()
  value.CODEMAP.X7 = { n: name, k: 'drug', rg: null, ...row }
  value.procedureDrugs = { KK090: { [name]: { use: 'include', place } } }
  return value
}
const hyalRole: MemoTables = { roles: new Map([['X7', 'cartilage']]) }

describe('AC-6607.3 중립 기본 문구(neutralPhrases)', () => {
  it('AC-6607.3: 원본 기본값에서 우리 의원 코드 7개만 빠지고 나머지 코드는 그대로다', () => {
    const neutral = neutralPhrases()
    const original = defaultPhrases()
    const hidden = new Set(PRIVATE_CODES.map((code) => code.toUpperCase()))
    for (const code of Object.keys(neutral.CODEMAP)) expect(hidden.has(code.toUpperCase()), code).toBe(false)
    const kept = Object.fromEntries(Object.entries(original.CODEMAP).filter(([code]) => !hidden.has(code.toUpperCase())))
    expect(neutral.CODEMAP).toEqual(kept)
    expect(Object.keys(original.CODEMAP).length - Object.keys(neutral.CODEMAP).length).toBe(7)
    expect(neutral.CODEMAP_DEL).toEqual(original.CODEMAP_DEL)
  })

  it('AC-6607.3: lidoCodes는 빈 글자, procedureDrugs는 비었고 memoRules는 없으며 다른 문구 칸은 원본 기본값 그대로다', () => {
    const neutral = neutralPhrases()
    expect(neutral.TPL.lidoCodes).toBe('')
    expect(neutral.procedureDrugs).toEqual({})
    expect(Object.hasOwn(neutral, 'memoRules')).toBe(false)
    const original = defaultPhrases()
    expect(original.TPL.lidoCodes).not.toBe('')
    expect(neutral.TPL).toEqual({ ...original.TPL, lidoCodes: '' })
  })

  it('AC-6607.3: 검사(validatePhrases)를 지나고 같은 값을 돌려준다', () => {
    const result = validatePhrases(neutralPhrases())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual(neutralPhrases())
  })

  it('AC-6607.3: 부를 때마다 새 값이고 defaultPhrases()·ourClinicPhrases()는 바뀌지 않는다', () => {
    const neutral = neutralPhrases()
    neutral.TPL.mark = '※'
    neutral.CODEMAP.KK090.n = '바뀜'
    expect(neutralPhrases().TPL.mark).toBe(defaultPhrases().TPL.mark)
    expect(neutralPhrases().CODEMAP.KK090.n).toBe('IA')
    for (const code of PRIVATE_CODES) {
      expect(Object.hasOwn(defaultPhrases().CODEMAP, code), code).toBe(true)
      expect(Object.hasOwn(ourClinicPhrases().CODEMAP, code), code).toBe(true)
    }
    expect(defaultPhrases().TPL.lidoCodes).toBe('A15')
    expect(ourClinicPhrases().TPL.lidoCodes).toBe('A15')
    expect(Object.keys(ourClinicPhrases().procedureDrugs).length).toBeGreaterThan(0)
  })
})

describe('AC-6609.1 그 병원 연골주사 약 이름', () => {
  it("AC-6609.1: 역할(tables.roles)이 연골주사인 '하이알플러스'를 차트에 적은 날 연골주사 줄이 만들어지고 약 이름은 '하이알플러스'이며 '아라간'이 없다", () => {
    const out = memo(otherClinic('하이알플러스'), ['하이알플러스 rt knee 2차'], [rx('KK090'), rx('X7', 1, '하이알플러스주')], hyalRole)
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차 (하이알플러스)')
    expect(out).not.toContain('아라간')
  })

  it('AC-6609.1: 처방코드 탭 깃발(cartilage)로 정한 연골주사 약도 같다', () => {
    const out = memo(otherClinic('하이알플러스', { cartilage: true }), ['하이알플러스 rt knee 2차'], [rx('KK090'), rx('X7', 1, '하이알플러스주')])
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차 (하이알플러스)')
    expect(out).not.toContain('아라간')
  })

  it('AC-6609.1: 이름으로 짐작할 수 없는 약(시노비안)도 역할이 연골주사면 차트 줄을 연골주사 줄로 읽는다', () => {
    const out = memo(otherClinic('시노비안'), ['Rt knee OA', '시노비안 Lt knee 3차'], [rx('KK090'), rx('X7', 1, '시노비안주')], hyalRole)
    expect(out).toBe('◈좌측 슬관절 강내 연골주사 3회차 (시노비안)')
    expect(out).not.toContain('아라간')
    expect(out).not.toContain('IA injection')
  })

  it('AC-6609.1: 비트 이름·표시 이름으로 적어도 연골주사 줄로 읽는다', () => {
    const out = memo(otherClinic('시노비안', { bitName: '시노비안주6mL' }), ['시노비안주6mL Rt knee 2차'], [rx('KK090'), rx('X7', 1, '시노비안주6mL')], hyalRole)
    expect(out).toBe('◈우측 슬관절 강내 연골주사 2회차 (시노비안)')
  })

  it("AC-6609.1: 약마다 정한 연골주사 메모 문구의 {약제}는 그 약 이름이고 '아라간'이 없다", () => {
    const value = otherClinic('하이알플러스', { cartilageMemo: '{좌우} {부위} {약제} {회차}차' }, 'afterProc')
    const out = memo(value, ['하이알플러스 rt knee 2차'], [rx('KK090'), rx('X7', 1, '하이알플러스주')], hyalRole)
    expect(out).toBe('◈우측 knee 하이알플러스 2차')
    expect(out).not.toContain('아라간')
  })

  it("AC-6609.1: 역할이 '아님'이면 이름이 연골주사처럼 보여도 연골주사 약이 아니다", () => {
    const out = memo(otherClinic('하이알플러스'), ['Rt knee OA', 'IA Rt knee'], [rx('KK090'), rx('X7', 1, '하이알플러스주')], { roles: new Map([['X7', 'none']]) })
    expect(out).not.toContain('연골주사')
    expect(out).toContain('IA injection')
  })
})

describe('AC-6609.2 연골주사 약 이름을 모르는 날', () => {
  const nameSlot = () => {
    const value = neutralPhrases()
    value.TPL.ara = '{좌우} 슬관절 강내 {약제} {회차}회차'
    return value
  }

  it('AC-6609.2: 역할인 약이 없어도 차트의 연골주사로 연골주사 줄을 지금처럼 만든다', () => {
    expect(memo(neutralPhrases(), ['연골주사 Rt knee 3차'], [rx('KK090')])).toBe('◈우측 슬관절 강내 연골주사 3회차')
  })

  it("AC-6609.2: 그 줄의 약 이름 자리는 '연골주사약'이다", () => {
    const out = memo(nameSlot(), ['연골주사 Rt knee 3차'], [rx('KK090')])
    expect(out).toBe('◈우측 슬관절 강내 연골주사약 3회차')
    expect(out).not.toContain('아라간')
  })

  it('AC-6609.2: 처방 목록에서 넘어온 연골주사 약 이름(cartilageNames)이 있으면 그 첫 이름이다', () => {
    const out = memo(nameSlot(), ['연골주사 Rt knee 3차'], [rx('KK090')], { cartilageNames: ['하이알플러스', '시노비안'] })
    expect(out).toBe('◈우측 슬관절 강내 하이알플러스 3회차')
  })
})

describe('AC-6612.2 차트 줄임말', () => {
  const withWords = (rows: { term: string; target: string }[], base = neutralPhrases()) => ({ ...base, chartWords: rows }) as Phrases

  it("AC-6612.2: '무주 = IA'면 차트 '무주 Lt knee'가 'IA Lt knee'로 적은 것과 같은 메모다", () => {
    const value = withWords([{ term: '무주', target: 'IA' }])
    const rows = [rx('KK090')]
    const written = memo(value, ['Rt shoulder pain', 'IA Lt knee'], rows)
    expect(memo(value, ['Rt shoulder pain', '무주 Lt knee'], rows)).toBe(written)
    expect(memo(neutralPhrases(), ['Rt shoulder pain', '무주 Lt knee'], rows)).not.toBe(written)
  })

  it('AC-6612.2: 줄임말로 적은 레벨 시술도 시술 이름으로 적은 것과 같다', () => {
    const value = withWords([{ term: '내측', target: 'MBB' }])
    expect(memo(value, ['LBP', '내측 L4,5 Rt'], [rx('LA358')])).toBe('◈MBB L4,5 Rt')
    expect(memo(neutralPhrases(), ['LBP', '내측 L4,5 Rt'], [rx('LA358')])).not.toBe('◈MBB L4,5 Rt')
  })

  it('AC-6612.2: 긴 말부터 한 번만 바꾸고 A→B 다음 B→C로 잇지 않는다', () => {
    const value = withWords([
      { term: '무주', target: 'IA' },
      { term: 'IA', target: 'SSNB' },
      { term: '무주사', target: 'TPI' },
    ])
    const engine = createMemoEngine(value, {})
    const items = engine.prepareVisit(visit(['무주 Lt knee', '무주사 Rt shoulder'], [])).items
    expect(items[0].t).toContain('IA')
    expect(items[0].t).not.toContain('SSNB')
    expect(items[1].t).toContain('TPI')
  })
})

describe('AC-6609.3 AC-6612.3 우리 의원 설정은 그대로', () => {
  const our = ourClinicPhrases()
  const ara = (qty = 2) => rx('A49', qty, '아라간플러스주')
  /** 고치기 전 엔진이 낸 글(2026-11-18). 골든에 없는 처방 이름 줄과 운영 표(roles·cartilageNames)를 함께 본다 */
  const cases: [string, string[], RxLine[], string][] = [
    ['차트 아라간', ['Rt knee OA', '아라간 Rt knee 2차'], [rx('KK090', 2), ara()], '◈우측 슬관절 강내 연골주사 2회차'],
    ['차트 연골주사', ['연골주사 Rt knee 3차', '무릎 OA KLG 2/3'], [rx('KK090', 1), ara(1)], '◈우측 슬관절 강내 연골주사 3회차\n◈K-L grade (2)/(3)'],
    ['차트에 없음', ['Both knee OA', 'KLG 3/3'], [rx('KK090', 2), ara()], '◈양측 슬관절 강내 연골주사 [회차 확인]'],
    ['처방 이름으로 적음', ['Rt knee OA', '아라간플러스주 Rt knee 2차'], [rx('KK090', 2), ara()], '◈우측 슬관절 강내 연골주사 2회차'],
    ['일반 IA', ['Rt knee IA'], [rx('KK090'), rx('A21', 1, '트리암주')], '◈IA injection of - knee(triam)'],
    ['레벨 시술', ['LBP', 'MBB L4,5 Rt'], [rx('LA358')], '◈MBB L4,5 Rt'],
  ]
  const production: MemoTables = { roles: new Map([['A15', 'localAnesthetic'], ['A19', 'steroid'], ['A21', 'steroid'], ['A41', 'none'], ['A49', 'cartilage']]), cartilageNames: ['아라간플러스주'] }

  it.each(cases)('AC-6609.3: %s — 글이 고치기 전과 같다(운영 표를 넘겨도 같다)', (_name, lines, rows, want) => {
    expect(memo(our, lines, rows)).toBe(want)
    expect(memo(our, lines, rows, production)).toBe(want)
  })

  it.each(cases)('AC-6612.3: %s — 줄임말 표가 비었거나 없으면 같다', (_name, lines, rows, want) => {
    expect(Object.hasOwn(our, 'chartWords')).toBe(false)
    expect(memo({ ...our, chartWords: [] }, lines, rows)).toBe(want)
  })

  it("AC-6609.3: 연골주사 메모 문구에 {약제}가 있는 우리 의원 설정은 처방한 날 '아라간'(A49 이름) 그대로다", () => {
    const value = ourClinicPhrases()
    value.TPL.ara = '{좌우} knee {회차}회차 {약제} {코드}'
    expect(memo(value, ['Both knee OA', 'KLG 3/3'], [rx('KK090', 2), ara()])).toBe('◈양측 knee [회차 확인] 아라간 A49')
    expect(memo(value, ['Rt knee OA', '아라간 Rt knee 2차'], [rx('KK090', 2), ara()])).toBe('◈우측 knee 2회차 KK090')
  })

  it('AC-6609.3: 엔진 기본값 상수는 옮기기 전 값 그대로다(design.md 15절)', () => {
    expect(DEFAULT_MAIN_CENTRAL_CODES).toBe('LA321, LA323, LA326, LA354, LA356, LA357, LA358, LA359')
    expect(DEFAULT_INTERVAL_CODES).toBe('LA358, KK090')
    expect(DEFAULT_TWO_SITE_RULES).toBe('KK090 = LA274, LA272\nKK061\nKK062')
    expect(DEFAULT_INTERVAL_DAYS).toBe(7)
  })
})
