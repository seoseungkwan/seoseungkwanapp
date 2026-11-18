import { describe, expect, it } from 'vitest'
import { neutralPhrases, unfinished, validatePhrases } from '../index'
import { applyAnswers, MARK_CHOICES } from './answers'
import { NONE_PRESET, PRESETS } from './presets'
import { previewMemos } from './preview'
import { SAMPLE_LABELS, sampleVisits } from './sampleVisits'

// 처음 질문 보기 4개(clinic-profile AC-6614.9): 중립 기본 문구에 보기 답을 넣어 진짜 메모 엔진으로 가짜 진료 3건을 만든다.
// 아래 EXPECTED가 보기 메모 글을 정한다(손으로 쓴 2026-11-01 보기와 다른 점은 requirements.md 'Claude가 정한 것')

const EXPECTED: string[][] = [
  [
    '◈MBB L4,5,S1 both\n◈SNB Rt',
    '◈IA injection of - Rt shoulder',
    '◈우측 슬관절 강내 연골주사 2회차\n◈K-L grade (3)/(3)',
  ],
  [
    'C-arm guide 하에 MBB L4,5,S1 both 시행함\nC-arm guide 하에 SNB Rt 시행함',
    'Sono guide 하에 IA injection of - Rt shoulder 시행함',
    'C-arm guide 하에 Rt 슬관절 강내 연골주사 2회차 시행함\nK-L grade (3)/(3)',
  ],
  [
    'C-arm 가이드 하에 MBB L4-5-S1 양측 시행함\nC-arm 가이드 하에 SNB 우측 시행함',
    '초음파 가이드 하에 IA injection of - 우측 shoulder 시행함',
    'C-arm 가이드 하에 우측 슬관절 강내 연골주사 2회차 시행함\nK-L 등급 3/3',
  ],
  [
    'C-arm 가이드하에 MBB L4-5-S1 both 시행함, C-arm 가이드하에 SNB Rt 시행함',
    'Sono 가이드하에 IA injection of - Rt shoulder 시행함',
    'C-arm 가이드하에 Rt 슬관절 강내 연골주사 2회차 시행함, K-L grade 3/3',
  ],
]

const memos = (at: number) => previewMemos(applyAnswers(neutralPhrases(), PRESETS[at].answers))
const linesOf = (at: number) => memos(at).flatMap((memo) => memo.split('\n'))
const NERVE = /\b(?:MBB|SNB)\b/
const JOINT = /IA injection of/
const KL = /^K-L/
const ENDING = /(?:시행함|시행|시행하였음)$/

describe('AC-6614.9 보기 4개(presets)', () => {
  it("AC-6614.9: 보기는 '기호 + 영어 짧게'·'가이드 + 영어 + 시행함'·'한글 문장'·'한 줄 이어쓰기'이고 [비슷한 게 없어요]는 보기 2다", () => {
    expect(PRESETS.map((preset) => preset.name)).toEqual(['기호 + 영어 짧게', '가이드 + 영어 + 시행함', '한글 문장', '한 줄 이어쓰기'])
    expect(NONE_PRESET).toBe(1)
    expect(PRESETS[NONE_PRESET].name).toBe('가이드 + 영어 + 시행함')
  })

  it.each(PRESETS.map((preset, at) => [at + 1, preset.name, at] as const))('AC-6614.9: 보기 %i(%s)의 메모는 진짜 엔진이 만든 이 글이다', (_, __, at) => {
    expect(memos(at)).toEqual(EXPECTED[at])
  })

  it('AC-6614.9: 보기 1 — 줄 머리 ◈ · 가이드 없음 · 끝맺음 없음 · 레벨 쉼표', () => {
    const lines = linesOf(0)
    for (const line of lines) expect(line.startsWith('◈'), line).toBe(true)
    for (const line of lines) expect(line).not.toMatch(/C-arm|Sono|초음파|가이드|guide/)
    for (const line of lines) expect(line).not.toMatch(ENDING)
    expect(memos(0)[0]).toContain('L4,5,S1')
  })

  it("AC-6614.9: 보기 2 — 기호 없음 · 신경차단술 줄은 'C-arm guide 하에'로 · 관절 주사 줄은 'Sono guide 하에'로 시작 · 시술 줄은 '시행함'으로 끝남", () => {
    const lines = linesOf(1)
    for (const line of lines) expect(MARK_CHOICES.some((mark) => line.startsWith(mark)), line).toBe(false)
    const nerve = lines.filter((line) => NERVE.test(line))
    expect(nerve).toHaveLength(2)
    for (const line of nerve) expect(line.startsWith('C-arm guide 하에 '), line).toBe(true)
    const joint = lines.filter((line) => JOINT.test(line))
    expect(joint).toHaveLength(1)
    for (const line of joint) expect(line.startsWith('Sono guide 하에 '), line).toBe(true)
    for (const line of lines.filter((item) => !KL.test(item))) expect(line.endsWith(' 시행함'), line).toBe(true)
  })

  it("AC-6614.9: 보기 3 — 좌우 한글 · 'C-arm 가이드 하에' · '초음파 가이드 하에' · 레벨 대시 · 'K-L 등급'", () => {
    const lines = linesOf(2)
    for (const line of lines) expect(line).not.toMatch(/\b(?:Rt|Lt|both)\b/i)
    expect(lines.join('\n')).toMatch(/양측/)
    expect(lines.join('\n')).toMatch(/우측/)
    for (const line of lines.filter((item) => NERVE.test(item))) expect(line.startsWith('C-arm 가이드 하에 '), line).toBe(true)
    for (const line of lines.filter((item) => JOINT.test(item))) expect(line.startsWith('초음파 가이드 하에 '), line).toBe(true)
    expect(memos(2)[0]).toContain('L4-5-S1')
    expect(memos(2)[2]).toContain('K-L 등급 3/3')
  })

  it("AC-6614.9: 보기 4 — 한 줄 이어쓰기 · 레벨 대시 · 'K-L grade n/n'", () => {
    for (const memo of memos(3)) expect(memo).not.toContain('\n')
    expect(memos(3)[0]).toMatch(/L4-5-S1 .*, .*SNB/)
    expect(memos(3)[2]).toMatch(/K-L grade \d\/\d$/)
  })

  it.each(PRESETS.map((preset, at) => [at + 1, at] as const))('AC-6614.9: 보기 %i 값을 넣은 문구는 검사(validatePhrases)를 지나고 메모에 확인 표시·남은 토큰이 없다', (_, at) => {
    expect(validatePhrases(applyAnswers(neutralPhrases(), PRESETS[at].answers)).ok).toBe(true)
    for (const memo of memos(at)) expect(unfinished(memo), memo).toBe(false)
  })
})

describe('AC-6614.9 가짜 진료 3건(sampleVisits·previewMemos)', () => {
  it('AC-6614.9: 허리 신경차단술 2개·어깨 관절 주사·무릎 연골주사이고 처방은 중립 기본 문구의 표준 코드, 이름·차트번호는 가짜다', () => {
    const visits = sampleVisits()
    expect(SAMPLE_LABELS).toEqual(['허리 신경차단술 2개', '어깨 관절 주사', '무릎 연골주사'])
    expect(visits).toHaveLength(SAMPLE_LABELS.length)
    const codemap = neutralPhrases().CODEMAP
    for (const visit of visits) {
      expect(visit.name).toContain('가짜')
      expect(visit.chart).toContain('가짜')
      expect(visit.hints).toHaveLength(visit.lines.length)
      for (const row of visit.rx) expect(codemap[row.code]?.k, row.code).toBe('proc')
    }
    expect(visits.map((visit) => visit.rx.map((row) => row.code))).toEqual([['LA358', 'LA272'], ['KK090'], ['KK090']])
  })

  it('AC-6614.9: 부를 때마다 새 진료라 보기 메모가 늘 같다', () => {
    expect(sampleVisits()[0]).not.toBe(sampleVisits()[0])
    const phrases = applyAnswers(neutralPhrases(), PRESETS[1].answers)
    expect(previewMemos(phrases)).toEqual(previewMemos(phrases))
    expect(previewMemos(phrases)).toHaveLength(3)
  })
})
