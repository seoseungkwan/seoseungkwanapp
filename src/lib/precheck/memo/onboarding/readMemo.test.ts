import { describe, expect, it } from 'vitest'
import { neutralPhrases } from '../index'
import { applyAnswers, CARM_CHOICES, ENDING_CHOICES, LEVEL_SEPS, MARK_CHOICES, SIDE_STYLES, SONO_CHOICES, type Answers } from './answers'
import { PRESETS } from './presets'
import { previewMemos } from './preview'
import { READ_KEYS, readMemo, type MemoReading } from './readMemo'

// 붙인 예전 메모 읽기(clinic-profile AC-6614.3): 정해 둔 값 목록에서만 고르고, 둘 이상이면 섞임, 없으면 못 찾음. 결과에 메모 글이 없다

const read = <K extends keyof Answers>(text: string, key: K) => readMemo(text)[key]
const ALL_NULL: MemoReading = {
  sideStyle: null, cartilageSideLang: null, sideMode: null, sideSpread: null, carm: null, sono: null, ending: null, levelSep: null, klg: null, mark: null, lineJoin: null,
}

describe('AC-6614.3 항목마다 읽기', () => {
  it.each([
    ['MBB L4,5 both\nSNB Rt', 'Rt'],
    ['MBB L4,5 BOTH\nSNB RT', 'upper'],
    ['SNB Rt.\nSSNB Lt.', 'dot'],
    ['MBB L4,5 Bil\nSNB Rt', 'bil'],
    ['MBB L4,5 양측\nSNB 우측', 'ko'],
  ])('AC-6614.3: 좌우 모양 — %j → %s', (text, value) => {
    expect(read(text, 'sideStyle')).toEqual({ value })
  })

  it('AC-6614.3: 좌우 모양은 연골주사 줄(연골주사 좌우 말을 따로 쓴다)을 보지 않는다', () => {
    expect(read('◈MBB L4,5 both\n◈우측 슬관절 강내 연골주사 2회차', 'sideStyle')).toEqual({ value: 'Rt' })
  })

  it.each([
    ['MBB L4,5,S1 both', 'comma'],
    ['MBB L4-5-S1 both', 'dash'],
    ['MBB L4, L5, S1 both', 'repeat'],
  ])('AC-6614.3: 레벨 — %j → %s', (text, value) => {
    expect(read(text, 'levelSep')).toEqual({ value })
  })

  it.each([
    ['SNB Rt 시행함', '시행함'],
    ['SNB Rt 시행', '시행'],
    ['SNB Rt 시행하였음', '시행하였음'],
    ['IA injection of - Rt shoulder 시행함 (트리암 1A)', '시행함'],
    ['SNB Rt 시행함.', '시행함'],
    ['MBB L4-5-S1 both 시행함, SNB Rt 시행함', '시행함'],
  ])('AC-6614.3: 끝맺음 — 줄 끝 %j → %s', (text, value) => {
    expect(read(text, 'ending')).toEqual({ value })
  })

  it('AC-6614.3: 끝맺음은 줄 끝 낱말만 본다(사유 문장 안의 주사시행·중간의 시행함은 아니다)', () => {
    expect(read('환자 스케쥴상 다른 날 내원이 어려워 금일 주사시행.', 'ending')).toBeNull()
    expect(read('시행함 뒤 경과 관찰', 'ending')).toBeNull()
  })

  it.each(MARK_CHOICES.map((mark) => [mark] as const))('AC-6614.3: 줄 머리 기호 — 모든 줄이 %s로 시작하면 그 기호', (mark) => {
    expect(read(`${mark}MBB L4,5 Rt\n${mark} SNB Rt`, 'mark')).toEqual({ value: mark })
  })

  it("AC-6614.3: 줄 머리 기호 — 아무 줄에도 없으면 '없음'(빈 글자)", () => {
    expect(read('MBB L4,5 Rt\nSNB Rt', 'mark')).toEqual({ value: '' })
  })

  it('AC-6614.3: 줄 머리 기호 — 엔진도 기호를 붙이지 않는 사유 문장·확인 표시 줄은 보지 않는다', () => {
    expect(read('◈MBB L4,5 Rt\n[약 확인: 트리암]\n환자 스케쥴상 다른 날 내원이 어려워 금일 주사시행.', 'mark')).toEqual({ value: '◈' })
  })

  it('AC-6614.3: 줄 머리 기호 — 목록에 없는 기호로만 시작하면 못 찾음이다', () => {
    expect(read('▷MBB L4,5 Rt\n▷SNB Rt', 'mark')).toBeNull()
  })

  it.each(CARM_CHOICES.map((choice) => [choice] as const))('AC-6614.3: C-arm 글자 — %s', (choice) => {
    expect(read(`${choice} MBB L4,5 Rt`, 'carm')).toEqual({ value: choice })
  })

  it('AC-6614.3: C-arm 글자는 대소문자와 빈칸 수를 가리지 않고 목록의 글로 읽는다', () => {
    expect(read('c-arm  Guide 하에 MBB L4,5 Rt', 'carm')).toEqual({ value: 'C-arm guide 하에' })
  })

  it.each(SONO_CHOICES.map((choice) => [choice] as const))('AC-6614.3: 초음파 글자 — %s', (choice) => {
    expect(read(`${choice} IA injection of - Rt shoulder`, 'sono')).toEqual({ value: choice })
  })

  it.each([
    ['K-L grade (3)/(3)', 'paren'],
    ['K-L grade 3/3', 'plain'],
    ['K-L 등급 2/3', 'ko'],
  ])('AC-6614.3: K-L 문장 — %j → %s', (text, value) => {
    expect(read(text, 'klg')).toEqual({ value })
  })

  it('AC-6614.3: 줄 나눔 — 한 줄에 시술 둘 이상이 쉼표로 이어지면 한 줄 이어쓰기', () => {
    expect(read('C-arm 가이드하에 Both MBB L4-5-S1, Rt SNB 시행함', 'lineJoin')).toEqual({ value: 'oneLine' })
    expect(read('MBB L4, L5, S1 both', 'lineJoin')).toBeNull()
    expect(read('◈MBB L4,5 Rt\n◈SNB Rt', 'lineJoin')).toBeNull()
  })
})

describe('AC-6614.3 섞임·못 찾음·결과에 메모 글 없음', () => {
  it("AC-6614.3: 한 항목에 값이 둘 이상이면 'mixed'(섞여 있어요)다", () => {
    expect(read('C-arm guide 하에 MBB L4,5 Rt\nC-arm 가이드 하에 SNB Rt', 'carm')).toBe('mixed')
    expect(read('MBB L4,5 Rt\nMBB L4-5 Lt', 'levelSep')).toBe('mixed')
    expect(read('SNB Rt 시행함\nSSNB Lt 시행', 'ending')).toBe('mixed')
    expect(read('◈SNB Rt\n◆SSNB Lt', 'mark')).toBe('mixed')
    expect(read('◈SNB Rt\nSSNB Lt', 'mark')).toBe('mixed')
    expect(read('SNB Rt\nSSNB 좌측', 'sideStyle')).toBe('mixed')
    expect(read('K-L grade (3)/(3)\nK-L 등급 2/2', 'klg')).toBe('mixed')
  })

  it("AC-6614.3: 찾을 것이 없으면 못 찾음(null)이다 — 줄 머리 기호만 '기호 없는 줄'이 있으면 '없음'으로 읽는다", () => {
    expect(readMemo('상담만 함')).toEqual({ ...ALL_NULL, mark: { value: '' } })
    expect(readMemo('')).toEqual(ALL_NULL)
    expect(readMemo('\n  \n')).toEqual(ALL_NULL)
  })

  it('AC-6614.3: 규칙이 없는 항목(연골주사 좌우 말·좌우 쓰는 경우·앞에 적힌 좌우)은 늘 못 찾음이다', () => {
    const reading = readMemo('◈우측 슬관절 강내 연골주사 2회차\n◈SNB Rt\n◈Rt SSNB, ANB')
    for (const key of ['cartilageSideLang', 'sideMode', 'sideSpread'] as const) expect(reading[key]).toBeNull()
    expect([...READ_KEYS].sort()).toEqual(['carm', 'ending', 'klg', 'levelSep', 'lineJoin', 'mark', 'sideStyle', 'sono'])
  })

  it('AC-6614.3: 결과에는 값 목록 안의 값만 있고 메모 글(이름·번호·시술 글)은 없다', () => {
    const text = '가짜환자홍길동 900001\n◈C-arm guide 하에 MBB L4,5,S1 both 시행함\n◈Sono guide 하에 IA injection of - Rt shoulder 시행함\n◈K-L grade (3)/(3)'
    const reading = readMemo(text)
    const shown = JSON.stringify(reading)
    for (const piece of ['홍길동', '900001', 'MBB', 'shoulder', 'injection', 'L4']) expect(shown).not.toContain(piece)
    const allowed: Record<keyof Answers, readonly unknown[]> = {
      sideStyle: SIDE_STYLES, cartilageSideLang: [], sideMode: [], sideSpread: [], carm: CARM_CHOICES, sono: SONO_CHOICES, ending: ENDING_CHOICES,
      levelSep: LEVEL_SEPS, klg: ['paren', 'plain', 'ko'], mark: ['', ...MARK_CHOICES], lineJoin: ['oneLine'],
    }
    for (const [key, result] of Object.entries(reading) as [keyof Answers, MemoReading[keyof Answers]][]) {
      if (result && result !== 'mixed') expect(allowed[key], key).toContain(result.value)
    }
  })

  it('AC-6614.3: 보기 4개의 진짜 엔진 메모를 붙이면 그 보기의 값으로 읽는다', () => {
    const readings = PRESETS.map((preset) => readMemo(previewMemos(applyAnswers(neutralPhrases(), preset.answers)).join('\n\n')))
    const found = (answers: Readonly<Answers>, keys: (keyof Answers)[]) => ({ ...ALL_NULL, ...Object.fromEntries(keys.map((key) => [key, { value: answers[key] }])) })
    const always: (keyof Answers)[] = ['sideStyle', 'levelSep', 'klg', 'mark']
    expect(readings[0]).toEqual(found(PRESETS[0].answers, always))
    expect(readings[1]).toEqual(found(PRESETS[1].answers, [...always, 'carm', 'sono', 'ending']))
    expect(readings[2]).toEqual(found(PRESETS[2].answers, [...always, 'carm', 'sono', 'ending']))
    expect(readings[3]).toEqual(found(PRESETS[3].answers, [...always, 'carm', 'sono', 'ending', 'lineJoin']))
  })
})
