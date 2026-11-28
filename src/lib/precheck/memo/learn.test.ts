import { describe, expect, it } from 'vitest'
import {
  FIXED_FALLBACK,
  LEARN_KINDS_MAX,
  LEARN_MAX,
  SITE_FALLBACK,
  applyLearned,
  diffLines,
  fillTemplate,
  literalSlots,
  matchPattern,
  neutralPhrases,
  overLearnLimit,
  personalHit,
  slotWords,
  styleChange,
  toPattern,
  toSlot,
  whenCount,
  type LearnContext,
  type LearnRule,
  type Phrases,
} from './index'

// 청구 메모 학습 순수 함수(specs/claim-learn design.md 2~5절). 학습은 엔진 글 위에 덧씌운다. 시험 글·코드·차트는 지어낸 값이다

const P = (tpl: Record<string, unknown> = {}): Phrases => {
  const value = neutralPhrases()
  value.TPL = { ...value.TPL, ...tpl }
  return value
}
const W = (tpl: Record<string, unknown> = {}) => slotWords(P(tpl))

const rule = (patch: Partial<LearnRule> = {}): LearnRule => ({
  id: 'l00000001',
  name: 'LA358 · 허리',
  kind: 'replace',
  from: '',
  to: '',
  after: '',
  when: { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] },
  on: true,
  left: 3,
  made: '2026-11-28',
  ...patch,
})

const ctx = (patch: Partial<LearnContext> = {}): LearnContext => ({
  codes: new Set(['LA358', 'KK090']),
  regions: new Set(['lumbar']),
  chartText: 'LBP\nMBB L3,4 Lt C-arm',
  doctors: ['D01'],
  words: W(),
  ...patch,
})

const MBB = '◈Lt L3,4 MBB 시행 (C-arm guide 하에)'
const MBB_FROM = '{좌우} {레벨} MBB 시행 (C-arm guide 하에)'
const IA = '◈IA injection of - Rt knee'
const IA_FROM = 'IA injection of - {좌우} {부위}'

describe('AC-9301.4 바뀌는 칸 글자 목록(slotWords)', () => {
  it('AC-9301.4: 좌우 글자는 Rt·Lt·both·우측·좌측·양측·Right·Left·Both와 병원 좌우 표기이고, 줄 앞 표시를 함께 준다', () => {
    const words = W()
    for (const word of ['Rt', 'Lt', 'both', 'Both', '우측', '좌측', '양측', 'Right', 'Left']) expect(words.side, word).toContain(word)
    expect(words.side).not.toContain('RT')
    expect(W({ sideStyle: 'upper' }).side).toEqual(expect.arrayContaining(['RT', 'LT', 'BOTH']))
    expect(W({ sideStyle: 'dot' }).side).toEqual(expect.arrayContaining(['Rt.', 'Lt.']))
    expect(W({ sideStyle: 'koShort' }).side).toEqual(expect.arrayContaining(['우', '좌', '양']))
    expect(words.mark).toBe('◈')
    expect(W({ mark: '▶' }).mark).toBe('▶')
  })

  it('AC-9301.4: 부위 글자는 병원 부위 영어 표기(없으면 기본)·영어 부위 이름·한글 부위 이름이고, 한 글자 표기(L·C)는 넣지 않는다', () => {
    const words = W()
    for (const word of ['knee', 'shoulder', 'upper extremity', 'rib', 'neck', 'arm', '슬관절', '요추부', '견관절']) expect(words.site, word).toContain(word)
    expect(words.site).not.toContain('L')
    expect(words.site).not.toContain('C')
    expect(W({ siteNames: { ...SITE_FALLBACK, knee: 'Knee joint' } }).site).toContain('Knee joint')
  })
})

describe('AC-9302.1 줄 틀(toPattern·matchPattern·fillTemplate)', () => {
  it('AC-9302.1: 엔진 줄의 좌우·레벨·부위 글자를 {좌우}·{레벨}·{부위}로 바꾸고 줄 앞 표시를 뗀다', () => {
    const words = W()
    expect(toPattern(MBB, words)).toBe(MBB_FROM)
    expect(toPattern(IA, words)).toBe(IA_FROM)
    expect(toPattern('◈우측 슬관절 IA', words)).toBe('{좌우} {부위} IA')
    expect(toPattern('◈MBB L4, L5, S1 both', words)).toBe('MBB {레벨} {좌우}')
    expect(toPattern('◈MBB L4-5-S1 both', words)).toBe('MBB {레벨} {좌우}')
    expect(toPattern('Lt MBB 4,5 시행함.', words)).toBe('{좌우} MBB {레벨} 시행함.')
    expect(toPattern('  ◈MBB   L4,5   Rt  ', words)).toBe('MBB {레벨} {좌우}')
  })

  it('AC-9302.1: 레벨·부위가 아닌 글자(C-arm·1.5cc·K-L grade 3·단어 안의 글자)는 그대로 둔다', () => {
    const words = W()
    expect(toPattern('C-arm guide 하에 1.5cc', words)).toBe('C-arm guide 하에 1.5cc')
    expect(toPattern('K-L grade 3', words)).toBe('K-L grade 3')
    expect(toPattern('Ltx kneecap PDRN2', words)).toBe('Ltx kneecap PDRN2')
  })

  it('AC-9302.1: 줄 전체가 틀과 맞으면 잡은 값을 준다(앞뒤·사이 빈칸·줄 앞 표시는 보지 않는다)', () => {
    const words = W()
    expect(matchPattern(MBB_FROM, MBB, words)).toEqual({ 좌우: 'Lt', 레벨: 'L3,4' })
    expect(matchPattern(MBB_FROM, '  ◈ Rt   L4,5,S1 MBB 시행 (C-arm guide 하에) ', words)).toEqual({ 좌우: 'Rt', 레벨: 'L4,5,S1' })
    expect(matchPattern(IA_FROM, '◈IA injection of - both shoulder', words)).toEqual({ 좌우: 'both', 부위: 'shoulder' })
  })

  it('AC-9302.1: 줄 일부만 맞거나 칸 자리에 그 종류 글자가 없으면 맞지 않는다(틀 글자는 정규식 글자가 아니다)', () => {
    const words = W()
    expect(matchPattern(MBB_FROM, `${MBB} 추가`, words)).toBeNull()
    expect(matchPattern(MBB_FROM, '◈Xt L3,4 MBB 시행 (C-arm guide 하에)', words)).toBeNull()
    expect(matchPattern(MBB_FROM, '◈Lt L3,4 MBB 시행 xC-arm guide 하에)', words)).toBeNull()
    expect(matchPattern('a.b {좌우}', 'axb Rt', words)).toBeNull()
    expect(matchPattern('MBB {레벨}', 'MBB 3', words)).toBeNull()
  })

  it('AC-9302.1: 한 줄에 같은 칸이 두 번이면 첫 값을 쓴다', () => {
    expect(matchPattern('{좌우} knee, {좌우} ankle', 'Rt knee, Lt ankle', W())).toEqual({ 좌우: 'Rt' })
  })

  it('AC-9302.1: 문장 틀의 칸을 잡은 값으로 채우고, 없는 칸은 [좌우 확인]·[레벨 확인]·[부위 확인]이다', () => {
    expect(fillTemplate('{좌우} {레벨} MBB 시행함', { 좌우: 'Lt', 레벨: 'L3,4' })).toBe('Lt L3,4 MBB 시행함')
    expect(fillTemplate('{좌우} {부위} {레벨}', {})).toBe('[좌우 확인] [부위 확인] [레벨 확인]')
    expect(fillTemplate('{부위} {약제}', { 부위: 'knee' })).toBe('knee {약제}')
  })
})

describe("AC-9301.4 학습 문장의 '글자 그대로'(literalSlots·toSlot)", () => {
  it('AC-9301.4: {} 없이 쓴 좌우·레벨·부위 글자를 나온 차례로 한 번씩 알린다', () => {
    const words = W()
    expect(literalSlots('Lt L3,4 MBB 시행 knee', words)).toEqual([
      { word: 'Lt', slot: '좌우' },
      { word: 'L3,4', slot: '레벨' },
      { word: 'knee', slot: '부위' },
    ])
    expect(literalSlots('Rt knee, Rt ankle', words)).toEqual([
      { word: 'Rt', slot: '좌우' },
      { word: 'knee', slot: '부위' },
      { word: 'ankle', slot: '부위' },
    ])
  })

  it('AC-9301.4: 바뀌는 칸·C-arm·숫자 하나는 알리지 않는다', () => {
    expect(literalSlots('{좌우} {레벨} MBB 시행 (C-arm guide 하에) 1회', W())).toEqual([])
  })

  it('AC-9301.4: [{좌우}로 바꾸기]는 그 글자를 모두 바뀌는 칸으로 바꾸고, 그 뒤에는 그 글자를 알리지 않는다', () => {
    const words = W()
    const to = toSlot('Lt L3,4 MBB, Lt facet', { word: 'Lt', slot: '좌우' }, words)
    expect(to).toBe('{좌우} L3,4 MBB, {좌우} facet')
    expect(literalSlots(to, words)).toEqual([{ word: 'L3,4', slot: '레벨' }])
    expect(toSlot(to, { word: 'L3,4', slot: '레벨' }, words)).toBe('{좌우} {레벨} MBB, {좌우} facet')
  })
})

describe('AC-9302.1 AC-9302.2 덧씌우기(applyLearned)', () => {
  const text = [IA, MBB, '◈두 부위 시술 사유.'].join('\n')

  it('AC-9302.1: 줄 바꿈 학습은 틀과 맞는 줄을 학습 문장으로 바꾸고 칸은 그 줄 값으로 채운다(줄 앞 표시는 다시 붙인다)', () => {
    const r = rule({ from: MBB_FROM, to: '{좌우} {레벨} MBB 시행함 (C-arm guided)' })
    expect(applyLearned(text, [r], ctx(), undefined)).toEqual({
      text: [IA, '◈Lt L3,4 MBB 시행함 (C-arm guided)', '◈두 부위 시술 사유.'].join('\n'),
      used: ['l00000001'],
    })
  })

  it('AC-9302.1: 줄 틀에 없는 칸이 학습 문장에 있으면 그 자리는 [부위 확인]이고, 학습 문장 앞 표시는 겹치지 않는다', () => {
    const r = rule({ from: MBB_FROM, to: '◈{부위} {좌우} MBB' })
    expect(applyLearned(MBB, [r], ctx(), undefined).text).toBe('◈[부위 확인] Lt MBB')
  })

  it('AC-9302.2: 줄 더함 학습은 앞 줄 틀과 맞는 첫 줄 바로 뒤에 더하고, 칸은 그 앞 줄 값으로 채운다', () => {
    const r = rule({ kind: 'add', after: IA_FROM, to: '{좌우} {부위} 초음파 유도 하 시행' })
    expect(applyLearned(text, [r], ctx(), undefined)).toEqual({
      text: [IA, 'Rt knee 초음파 유도 하 시행', MBB, '◈두 부위 시술 사유.'].join('\n'),
      used: ['l00000001'],
    })
  })

  it('AC-9302.2: 앞 줄 틀과 맞는 줄이 없거나 앞 줄 틀이 비면 메모 끝에 더한다', () => {
    const none = rule({ kind: 'add', after: 'SSNB {좌우}', to: 'Sono guide 하에 시행' })
    expect(applyLearned(text, [none], ctx(), undefined).text).toBe(`${text}\nSono guide 하에 시행`)
    const empty = rule({ kind: 'add', after: '', to: 'Sono guide 하에 시행' })
    expect(applyLearned(text, [empty], ctx(), undefined).text).toBe(`${text}\nSono guide 하에 시행`)
  })

  it('AC-9302.2: 같은 글 줄이 이미 있으면 더하지 않는다', () => {
    const r = rule({ kind: 'add', after: IA_FROM, to: 'Lt L3,4 MBB 시행 (C-arm guide 하에)' })
    expect(applyLearned(text, [r], ctx(), undefined)).toEqual({ text, used: [] })
  })

  it('AC-9302.2: 줄 뺌 학습은 틀과 맞는 줄을 뺀다', () => {
    const r = rule({ kind: 'remove', from: IA_FROM })
    expect(applyLearned(text, [r], ctx(), undefined)).toEqual({ text: [MBB, '◈두 부위 시술 사유.'].join('\n'), used: ['l00000001'] })
  })

  it('AC-9302.2: 뺀 줄 뒤에 더하는 학습은 그 자리에 들어간다', () => {
    const gone = rule({ id: 'l00000001', kind: 'remove', from: IA_FROM })
    const add = rule({ id: 'l00000002', kind: 'add', after: IA_FROM, to: 'knee IA 대신 Sono guide 하에 시행' })
    expect(applyLearned(text, [gone, add], ctx(), undefined)).toEqual({
      text: ['knee IA 대신 Sono guide 하에 시행', MBB, '◈두 부위 시술 사유.'].join('\n'),
      used: ['l00000001', 'l00000002'],
    })
  })

  it('AC-9302.1: 학습이 없거나 맞는 줄이 없으면 글은 한 글자도 같다', () => {
    expect(applyLearned(text, [], ctx(), undefined)).toEqual({ text, used: [] })
    expect(applyLearned(text, [rule({ from: 'SSNB {좌우}', to: 'x' })], ctx(), undefined)).toEqual({ text, used: [] })
  })

  it('AC-9302.1: 같은 학습이 여러 줄에 쓰여도 used에는 한 번이다', () => {
    const r = rule({ from: MBB_FROM, to: '{좌우} {레벨} MBB' })
    expect(applyLearned(`${MBB}\n◈Rt L4,5 MBB 시행 (C-arm guide 하에)`, [r], ctx(), undefined)).toEqual({
      text: '◈Lt L3,4 MBB\n◈Rt L4,5 MBB',
      used: ['l00000001'],
    })
  })

  it('AC-9302.1: 한 줄 모드(oneLine)는 글 전체를 한 줄로 보고 줄 바꿈 학습만 쓴다', () => {
    const one = '◈IA injection of - Rt knee, Lt L3,4 MBB'
    const swap = rule({ id: 'l00000001', from: 'IA injection of - {좌우} {부위}, {좌우} {레벨} MBB', to: '{좌우} {부위} IA, {레벨} MBB' })
    const add = rule({ id: 'l00000002', kind: 'add', to: '더한 줄' })
    const gone = rule({ id: 'l00000003', kind: 'remove', from: 'IA injection of - {좌우} {부위}, {좌우} {레벨} MBB' })
    expect(applyLearned(one, [swap, add], ctx(), 'oneLine')).toEqual({ text: '◈Rt knee IA, L3,4 MBB', used: ['l00000001'] })
    expect(applyLearned(one, [gone, add], ctx(), 'oneLine')).toEqual({ text: one, used: [] })
  })
})

describe('AC-9302.3 학습 조건', () => {
  const swap = (when: Partial<LearnRule['when']>) => rule({ from: MBB_FROM, to: 'X', when: { codes: [], regions: [], chartWords: [], withCodes: [], doctors: [], ...when } })
  const used = (when: Partial<LearnRule['when']>, c: Partial<LearnContext> = {}) => applyLearned(MBB, [swap(when)], ctx(c), undefined).used.length === 1

  it('AC-9302.3: 처방 코드는 고른 코드가 모두 그 진료 처방에 있을 때만(대소문자 무시)', () => {
    expect(used({ codes: ['LA358'] })).toBe(true)
    expect(used({ codes: ['LA358', 'KK090'] })).toBe(true)
    expect(used({ codes: ['LA358', 'MM410'] })).toBe(false)
    expect(used({ codes: ['LA358'] }, { codes: new Set(['la358']) })).toBe(true)
  })

  it('AC-9302.3: 부위는 고른 부위가 모두 그 진료 부위에 있을 때만', () => {
    expect(used({ regions: ['lumbar'] })).toBe(true)
    expect(used({ regions: ['lumbar', 'knee'] })).toBe(false)
  })

  it('AC-9302.3: 차트에 쓴 말은 그 진료 차트 글에 있을 때만(대소문자·띄어쓰기 무시, 여럿이면 모두)', () => {
    expect(used({ chartWords: ['c-arm'] })).toBe(true)
    expect(used({ chartWords: ['mbb  l3,4'] })).toBe(true)
    expect(used({ chartWords: ['MBBL3'] })).toBe(true)
    expect(used({ chartWords: ['C-arm', '초음파'] })).toBe(false)
  })

  it('AC-9302.3: 함께 한 다른 시술은 고른 코드가 모두 그 진료 처방에 있을 때만', () => {
    expect(used({ codes: ['LA358'], withCodes: ['KK090'] })).toBe(true)
    expect(used({ codes: ['LA358'], withCodes: ['KK090', 'MM410'] })).toBe(false)
  })

  it('AC-9302.3: 진료한 원장님은 고른 코드가 그 진료 진료의에 있을 때만이고, 진료의를 모르면 맞지 않는다', () => {
    expect(used({ doctors: ['D01'] })).toBe(true)
    expect(used({ doctors: ['D02'] })).toBe(false)
    expect(used({ doctors: ['D01'] }, { doctors: [] })).toBe(false)
  })

  it('AC-9302.3: 켠 조건이 모두 맞아야 하고, 켠 조건이 하나도 없는 학습은 쓰지 않는다', () => {
    expect(used({ codes: ['LA358'], regions: ['lumbar'], chartWords: ['C-arm'], withCodes: ['KK090'], doctors: ['D01'] })).toBe(true)
    expect(used({ codes: ['LA358'], regions: ['lumbar'], chartWords: ['C-arm'], withCodes: ['KK090'], doctors: ['D02'] })).toBe(false)
    expect(used({})).toBe(false)
  })

  it('AC-9302.3: 켠 조건 수는 칩마다 하나, 원장님은 몇 명을 골라도 하나다', () => {
    expect(whenCount({ codes: ['LA358', 'KK090'], regions: ['lumbar'], chartWords: ['C-arm'], withCodes: ['MM410'], doctors: ['D01', 'D02'] })).toBe(6)
    expect(whenCount({ codes: [], regions: [], chartWords: [], withCodes: [], doctors: [] })).toBe(0)
  })
})

describe('AC-9302.4 맞는 학습이 여럿일 때', () => {
  const base = { from: MBB_FROM }
  const two = { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] }
  const three = { ...two, chartWords: ['C-arm'] }

  it('AC-9302.4: 켠 조건 수가 많은 학습 하나만 쓴다', () => {
    const a = rule({ ...base, id: 'l0000000a', to: 'A', when: three, made: '2026-11-01' })
    const b = rule({ ...base, id: 'l0000000b', to: 'B', when: two, made: '2026-11-20' })
    expect(applyLearned(MBB, [a, b], ctx(), undefined)).toEqual({ text: '◈A', used: ['l0000000a'] })
    expect(applyLearned(MBB, [b, a], ctx(), undefined)).toEqual({ text: '◈A', used: ['l0000000a'] })
  })

  it('AC-9302.4: 조건 수가 같으면 나중에 만든 학습, 만든 날도 같으면 목록 뒤의 학습을 쓴다', () => {
    const a = rule({ ...base, id: 'l0000000a', to: 'A', when: two, made: '2026-11-20' })
    const b = rule({ ...base, id: 'l0000000b', to: 'B', when: two, made: '2026-11-01' })
    expect(applyLearned(MBB, [a, b], ctx(), undefined).text).toBe('◈A')
    expect(applyLearned(MBB, [b, a], ctx(), undefined).text).toBe('◈A')
    const c = rule({ ...base, id: 'l0000000c', to: 'C', when: two, made: '2026-11-20' })
    expect(applyLearned(MBB, [a, c], ctx(), undefined).text).toBe('◈C')
    expect(applyLearned(MBB, [c, a], ctx(), undefined).text).toBe('◈A')
  })

  it('AC-9302.4: 줄 바꿈과 줄 뺌도 같은 차례로 하나만 고른다', () => {
    const swap = rule({ ...base, id: 'l0000000a', to: 'A', when: two })
    const gone = rule({ ...base, id: 'l0000000b', kind: 'remove', to: '', when: three })
    expect(applyLearned(MBB, [swap, gone], ctx(), undefined)).toEqual({ text: '', used: ['l0000000b'] })
  })

  it('AC-9302.4: 꺼 둔 학습은 조건이 더 많아도 쓰지 않는다', () => {
    const off = rule({ ...base, id: 'l0000000a', to: 'A', when: three, on: false })
    const on = rule({ ...base, id: 'l0000000b', to: 'B', when: two })
    expect(applyLearned(MBB, [off, on], ctx(), undefined)).toEqual({ text: '◈B', used: ['l0000000b'] })
    expect(applyLearned(MBB, [off], ctx(), undefined)).toEqual({ text: MBB, used: [] })
  })
})

describe('AC-9301.2 줄 차이(diffLines)', () => {
  it('AC-9301.2: 같으면(앞뒤 빈칸·빈 줄 무시) 차이가 없다', () => {
    expect(diffLines('A\nB', ' A \n\n  B ')).toEqual([])
  })

  it('AC-9301.2: 바꾼 줄·더한 줄·뺀 줄과 바로 앞의 엔진 줄', () => {
    expect(diffLines('A\nB\nC', 'A\nB2\nC')).toEqual([{ kind: 'replace', old: 'B', new: 'B2', before: 'A' }])
    expect(diffLines('A\nB', 'A\nX\nB')).toEqual([{ kind: 'add', old: '', new: 'X', before: 'A' }])
    expect(diffLines('A\nB', 'X\nA\nB')).toEqual([{ kind: 'add', old: '', new: 'X', before: '' }])
    expect(diffLines('A\nB\nC', 'A\nC')).toEqual([{ kind: 'remove', old: 'B', new: '', before: 'A' }])
  })

  it('AC-9301.2: 붙어 있는 뺌과 더함은 하나씩 짝지어 바꿈이고, 남는 더함은 그 무리의 마지막 엔진 줄 뒤다', () => {
    expect(diffLines('A\nB\nC', 'A\nB2\nX\nC')).toEqual([
      { kind: 'replace', old: 'B', new: 'B2', before: 'A' },
      { kind: 'add', old: '', new: 'X', before: 'B' },
    ])
    expect(diffLines('A\nB\nC\nD', 'A\nZ\nD')).toEqual([
      { kind: 'replace', old: 'B', new: 'Z', before: 'A' },
      { kind: 'remove', old: 'C', new: '', before: 'B' },
    ])
  })
})

describe('AC-9303.1 모양 고침 알아보기(styleChange)', () => {
  it('AC-9303.1: 좌우 표기만 다르면 sideStyle 고침이다', () => {
    const p = P()
    const change = styleChange('◈Lt L3,4 MBB 시행', '◈좌측 L3,4 MBB 시행', p)
    expect(change).toEqual({ field: 'sideStyle', label: '좌우 표기', from: 'Lt', to: '좌측', patch: { TPL: { ...p.TPL, sideStyle: 'ko' } } })
    expect(styleChange('◈MBB L4,5 both', '◈MBB L4,5 BOTH', p)).toMatchObject({ field: 'sideStyle', from: 'both', to: 'BOTH', patch: { TPL: { sideStyle: 'upper' } } })
    expect(styleChange('우측 knee IA', 'Rt knee IA', P({ sideStyle: 'ko' }))).toMatchObject({ field: 'sideStyle', from: '우측', to: 'Rt', patch: { TPL: { sideStyle: 'Rt' } } })
  })

  it('AC-9303.1: 부위 영어 표기 하나만 다르면 siteNames 고침이다(없던 칸은 기본 표기에서 그 칸만 바꾼다)', () => {
    const p = P()
    expect(styleChange(IA, '◈IA injection of - Rt knee joint', p)).toEqual({
      field: 'siteNames',
      label: '부위 표기',
      from: 'knee',
      to: 'knee joint',
      patch: { TPL: { ...p.TPL, siteNames: { ...SITE_FALLBACK, knee: 'knee joint' } } },
    })
  })

  it('AC-9303.1: 고정 문구 글 하나만 다르면 fixedPhrases 고침이다', () => {
    const p = P()
    expect(styleChange(MBB, '◈Lt L3,4 MBB 시행 (C-arm guided)', p)).toEqual({
      field: 'fixedPhrases',
      label: '고정 문구',
      from: 'C-arm guide 하에',
      to: 'C-arm guided',
      patch: { TPL: { ...p.TPL, fixedPhrases: FIXED_FALLBACK.map((row) => (row.token === 'C-arm' ? { ...row, text: 'C-arm guided' } : { ...row })) } },
    })
  })

  it('AC-9303.1: 레벨 사이 글자만 다르면 levelSep 고침이다', () => {
    const p = P()
    expect(styleChange('◈MBB L4,5,S1 both', '◈MBB L4-5-S1 both', p)).toEqual({ field: 'levelSep', label: '레벨 사이 글자', from: 'L4,5,S1', to: 'L4-5-S1', patch: { TPL: { ...p.TPL, levelSep: 'dash' } } })
    expect(styleChange('◈MBB L4,5,S1 both', '◈MBB L4, L5, S1 both', p)).toMatchObject({ field: 'levelSep', to: 'L4, L5, S1', patch: { TPL: { levelSep: 'repeat' } } })
    expect(styleChange('◈MBB L4-5 both', '◈MBB L4,5 both', P({ levelSep: 'dash' }))).toMatchObject({ field: 'levelSep', patch: { TPL: { levelSep: 'comma' } } })
  })

  it('AC-9303.1: 둘 이상이 다르거나 알아보는 고침이 아니면 묻지 않는다(null)', () => {
    const p = P()
    expect(styleChange('Lt L3,4 MBB', '좌측 L3-4 MBB', p)).toBeNull()
    expect(styleChange('Lt knee IA', 'Left knee IA', p)).toBeNull()
    expect(styleChange('MBB 시행', 'MBB 시행 후 경과 관찰', p)).toBeNull()
    expect(styleChange(MBB, ` ${MBB} `, p)).toBeNull()
    expect(styleChange('우측 knee IA', '좌측 knee IA', P({ sideStyle: 'ko' }))).toBeNull()
  })

  it('AC-9303.1: 받은 설정을 고치지 않는다', () => {
    const p = P()
    const copy = structuredClone(p)
    styleChange(MBB, '◈좌측 L3,4 MBB 시행 (C-arm guide 하에)', p)
    styleChange(MBB, '◈Lt L3,4 MBB 시행 (C-arm guided)', p)
    expect(p).toEqual(copy)
  })
})

describe('AC-9301.5 개인정보 거르기(personalHit)', () => {
  it.each([
    ['휴대전화', '연락 010-1234-5678'],
    ['붙여 쓴 휴대전화', '01012345678'],
    ['지역 번호', '02-123-4567'],
    ['주민번호', '900101-1234567'],
    ['붙여 쓴 주민번호', '9001011234567'],
    ['메일', 'a.b@clinic.kr'],
  ])('AC-9301.5: %s 모양이면 참', (_name, text) => {
    expect(personalHit(text, [])).toBe(true)
  })

  it('AC-9301.5: 그 진료의 환자 이름·차트번호(2자 이상)가 들어 있으면 참이다(대소문자·띄어쓰기 무시)', () => {
    expect(personalHit('홍길동 님 MBB', ['홍길동', '12345'])).toBe(true)
    expect(personalHit('차트 12345 MBB', ['홍길동', '12345'])).toBe(true)
    expect(personalHit('홍 길동 MBB', ['홍길동'])).toBe(true)
    expect(personalHit('김 MBB', ['김'])).toBe(false)
    expect(personalHit('MBB', ['', ' '])).toBe(false)
  })

  it('AC-9301.5: 메모 줄·차트 말은 거짓', () => {
    for (const text of [MBB, MBB_FROM, 'K-L grade 3', 'L4,5,S1', 'C-arm', 'PDRN 2cc 1.5']) expect(personalHit(text, ['홍길동', '12345']), text).toBe(false)
  })
})

describe('AC-9304.3 학습 한도(overLearnLimit)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => rule({ id: `l${i.toString(16).padStart(8, '0')}` }))

  it(`AC-9304.3: 학습 ${300}개까지는 되고 더 많으면 막는다`, () => {
    expect(LEARN_MAX).toBe(300)
    expect(overLearnLimit({ ...P(), learned: many(300) })).toBe(false)
    expect(overLearnLimit({ ...P(), learned: many(301) })).toBe(true)
    expect(overLearnLimit(P())).toBe(false)
  })

  it('AC-9304.3: 처음 학습 종류는 2000개까지, 설정 글자는 200만 자까지다', () => {
    expect(LEARN_KINDS_MAX).toBe(2000)
    expect(overLearnLimit({ ...P(), learnKinds: Array.from({ length: 2000 }, (_, i) => `K${i}|lumbar`) })).toBe(false)
    expect(overLearnLimit({ ...P(), learnKinds: Array.from({ length: 2001 }, (_, i) => `K${i}|lumbar`) })).toBe(true)
    expect(overLearnLimit({ ...P(), learned: [rule({ to: 'x'.repeat(2_000_000) })] })).toBe(true)
  })
})
