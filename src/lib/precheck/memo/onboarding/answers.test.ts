import { describe, expect, it } from 'vitest'
import type { Visit } from '@/types/precheck'
import { createMemoEngine, defaultPhrases, diffPhrases, neutralPhrases, ourClinicPhrases, validatePhrases, type Phrases, type PhraseTemplates } from '../index'
import { answersOf, applyAnswers, CARM_KEYS, ENDING_KEYS, SONO_KEYS, type Answers } from './answers'
import { PRESETS } from './presets'

// 처음 질문 답 넣기(clinic-profile AC-6614.7): 바뀌는 칸만 바뀌고, 두 번 넣어도 토큰이 겹치지 않고, 되읽으면 같은 답이다

/** 병원이 손댄 문구: 이미 토큰이 있고 다른 고정 멘트·시술 이름별 문구·약·규칙·차트 줄임말이 있다 */
function edited(): Phrases {
  const value = neutralPhrases()
  value.TPL.main = '{C-arm} {C-arm} {시술} {시행함}'
  // 옛 처음 질문이 말초 신경차단 문구에도 붙였던 {C-arm}
  value.TPL.mainPeripheral = '{C-arm} {시술} {시행함}'
  value.TPL.fixedPhrases = [{ token: '투시', text: '투시 하에', on: true }, { token: 'C-arm', text: '영상 하에', on: true }]
  value.TPL.byProc = { SSNB: '{투시} {시술}' }
  value.TPL.rename = 'C-MBB > MBB C'
  value.chartWords = [{ term: '내측', target: 'MBB' }]
  value.memoRules = { iaSide: true }
  value.procedureDrugs = { KK090: { 트리암: { use: 'include', place: 'afterProc' } } }
  return value
}

const BASES: [string, () => Phrases][] = [
  ['중립 기본 문구', neutralPhrases],
  ['원본 기본 문구', defaultPhrases],
  ['우리 의원 문구', ourClinicPhrases],
  ['병원이 손댄 문구', edited],
]
const OWN: Answers = { sideStyle: 'dot', cartilageSideLang: 'en', sideMode: 'quantity', sideSpread: 'adjacent', carm: '투시 하에', sono: null, ending: '시행하였음', levelSep: 'repeat', klg: 'plain', mark: '▶', lineJoin: 'oneLine' }
const ANSWERS: [string, Answers][] = [...PRESETS.map((preset, at): [string, Answers] => [`보기 ${at + 1}`, { ...preset.answers }]), ['직접 고른 답', OWN]]
const CASES = BASES.flatMap(([base, make]) => ANSWERS.map(([name, answers]): [string, string, () => Phrases, Answers] => [base, name, make, answers]))

/** 답이 앞뒤 토큰을 붙이거나 떼는 시술 문구(AC-6614.7) */
const TOUCHED = ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'iaEtc', 'iaAra', 'ts'] as const
/** 답이 바꾸는 TPL 칸 */
const CHANGED = ['sideStyle', 'cartilageSideLang', 'sideMode', 'sideSpread', 'levelSep', 'klg', 'mark', 'lineJoin', 'fixedPhrases', ...TOUCHED] as const
const FIXED = ['C-arm', 'Sono', '시행함']

function others(value: Phrases) {
  const TPL: Record<string, unknown> = { ...value.TPL }
  for (const key of CHANGED) delete TPL[key]
  return { ...value, TPL }
}
/** 답이 붙이고 떼는 토큰을 뺀 문구 */
const bare = (template: string | undefined) => template?.replace(/^(?:\s*\{(?:C-arm|Sono)\})+\s*/, '').replace(/(?:\s*\{시행함\})+\s*$/, '')
const count = (template: string | undefined, token: string) => (template ?? '').split(token).length - 1

const NEUTRAL: Answers = { sideStyle: 'Rt', cartilageSideLang: 'ko', sideMode: 'quantity', sideSpread: 'all', carm: null, sono: null, ending: null, levelSep: 'comma', klg: 'paren', mark: '◈', lineJoin: 'lines' }

describe('AC-6614.7 답을 문구에 넣기(applyAnswers)', () => {
  it.each(CASES)('AC-6614.7: %s + %s — 처방코드·시술별 약·사유·표기 바꾸기·전용 규칙·차트 줄임말과 다른 문구는 그대로다', (_, __, make, answers) => {
    const before = make()
    const after = applyAnswers(before, answers)
    expect(others(after)).toEqual(others(before))
    for (const key of TOUCHED) expect(bare(after.TPL[key]), key).toBe(bare(before.TPL[key]))
    const rest = (rows: PhraseTemplates['fixedPhrases']) => (rows ?? []).filter((row) => !FIXED.includes(row.token))
    expect(rest(after.TPL.fixedPhrases)).toEqual(rest(before.TPL.fixedPhrases))
  })

  it.each(CASES)('AC-6614.7: %s + %s — 두 번 넣어도 같고 토큰은 문구마다 한 번이다', (_, __, make, answers) => {
    const once = applyAnswers(make(), answers)
    expect(applyAnswers(once, answers)).toEqual(once)
    for (const key of CARM_KEYS) expect(count(once.TPL[key], '{C-arm}'), key).toBeLessThanOrEqual(1)
    expect(count(once.TPL.mainPeripheral, '{C-arm}')).toBe(0)
    for (const key of SONO_KEYS) expect(count(once.TPL[key], '{Sono}'), key).toBeLessThanOrEqual(1)
    for (const key of ENDING_KEYS) expect(count(once.TPL[key], '{시행함}'), key).toBeLessThanOrEqual(1)
    for (const token of FIXED) expect(once.TPL.fixedPhrases?.filter((row) => row.token === token)).toHaveLength(1)
  })

  it.each(CASES)('AC-6614.7: %s + %s — 되읽으면 같은 답이고(answersOf) 검사를 지난다', (_, __, make, answers) => {
    const next = applyAnswers(make(), answers)
    expect(answersOf(next)).toEqual(answers)
    expect(validatePhrases(next).ok).toBe(true)
  })

  it('AC-6614.7: 다른 답으로 다시 넣으면 새 답만 남는다', () => {
    for (const [, first] of ANSWERS) {
      for (const [, second] of ANSWERS) expect(answersOf(applyAnswers(applyAnswers(neutralPhrases(), first), second))).toEqual(second)
    }
  })

  it('AC-6614.7: 받은 문구는 고치지 않는다', () => {
    const base = edited()
    const before = JSON.stringify(base)
    applyAnswers(base, PRESETS[1].answers)
    expect(JSON.stringify(base)).toBe(before)
  })

  it('AC-6614.7: 붙이는 문구 — {C-arm}은 main·mainCentral·cpb·snb, {Sono}는 iaEtc·iaAra·ts, {시행함}은 main·mainCentral·mainPeripheral·cpb·snb·iaEtc·iaAra', () => {
    expect(CARM_KEYS).toEqual(['main', 'mainCentral', 'cpb', 'snb'])
    expect(SONO_KEYS).toEqual(['iaEtc', 'iaAra', 'ts'])
    expect(ENDING_KEYS).toEqual(['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'iaEtc', 'iaAra'])
  })

  it('AC-6614.7: 켜진 답은 신경차단술 문구 앞 {C-arm}, 관절 주사 문구 앞 {Sono}, 시술 문구 끝 {시행함}과 고정 멘트 글·켜짐이다', () => {
    const T = applyAnswers(neutralPhrases(), PRESETS[1].answers).TPL
    for (const key of ['main', 'mainCentral', 'cpb', 'snb'] as const) expect(T[key], key).toBe('{C-arm} {시술} {시행함}')
    expect(T.mainPeripheral).toBe('{시술} {시행함}')
    expect(T.iaEtc).toBe('{Sono} IA injection of - {부위}{약제} {시행함}')
    expect(T.fixedPhrases).toEqual([
      { token: 'C-arm', text: 'C-arm guide 하에', on: true },
      { token: 'Sono', text: 'Sono guide 하에', on: true },
      { token: '시행함', text: '시행함', on: true },
    ])
    expect(T.klg).toBe('K-L grade ({KL1})/({KL2})')
    expect(applyAnswers(neutralPhrases(), PRESETS[2].answers).TPL.klg).toBe('K-L 등급 {KL1}/{KL2}')
    expect(applyAnswers(neutralPhrases(), PRESETS[3].answers).TPL.klg).toBe('K-L grade {KL1}/{KL2}')
  })

  it("AC-6614.7: '안 씀'은 토큰을 떼고 고정 멘트를 끈다(글은 둔다). 다른 고정 멘트는 그대로다", () => {
    const T = applyAnswers(edited(), PRESETS[0].answers).TPL
    expect(T.main).toBe('{시술}')
    expect(T.mainPeripheral).toBe('{시술}')
    expect(T.fixedPhrases).toEqual([
      { token: '투시', text: '투시 하에', on: true },
      { token: 'C-arm', text: '영상 하에', on: false },
      { token: 'Sono', text: 'Sono guide 하에', on: false },
      { token: '시행함', text: '시행함', on: false },
    ])
    expect(T.byProc).toEqual({ SSNB: '{투시} {시술}' })
  })

  it("AC-6614.7: 이미 '시행'으로 끝나는 건초내주사 문구(ts)는 끝맺음을 건드리지 않고, 빈 문구(iaAra)는 빈 채다", () => {
    const T = applyAnswers(neutralPhrases(), PRESETS[1].answers).TPL
    expect(T.ts).toBe('{Sono} {부위} 건초내주사 시행{약제}')
    expect(T.iaAra).toBe('')
    const own = neutralPhrases()
    own.TPL.ts = '{부위} 건초내주사 {시행함}'
    expect(applyAnswers(own, PRESETS[0].answers).TPL.ts).toBe('{부위} 건초내주사 {시행함}')
    expect(applyAnswers(own, PRESETS[1].answers).TPL.ts).toBe('{Sono} {부위} 건초내주사 {시행함}')
  })

  it('AC-6614.7: 옛 문구의 말초 신경차단 문구(mainPeripheral) 앞 {C-arm}은 어느 답이든 뗀다', () => {
    for (const [, answers] of ANSWERS) expect(applyAnswers(edited(), answers).TPL.mainPeripheral).toMatch(/^\{시술\}/)
  })

  it('AC-6614.7: 바깥 문구가 감싸 그리는 icnb·ara는 그대로라 끝맺음이 한 번이고, 말초 문구로 그려지는 ICNB·차트 연골주사 줄에는 C-arm 글자가 없다', () => {
    const base = neutralPhrases()
    const phrases = applyAnswers(base, PRESETS[1].answers)
    expect(phrases.TPL.icnb).toBe(base.TPL.icnb)
    expect(phrases.TPL.ara).toBe(base.TPL.ara)
    const visit = (lines: string[], code: string): Visit => ({
      key: '가짜', chart: '가짜', date: '2026-01-05', month: '2026-01', name: '가짜 환자', lines, hints: lines.map(() => null),
      rx: [{ code, name: code, qty: 1, benefit: true, pay: '급여' }], dx: [], memosInBit: [],
    })
    const engine = createMemoEngine(phrases, {})
    expect(engine.fullText(visit(['Rt chest wall pain', 'ICNB Rt'], 'LA248'))).toBe('ICNB Rt 3 level 시행함')
    expect(engine.fullText(visit(['Rt knee OA', '연골주사 Rt knee 2차'], 'KK090'))).toBe('Rt 슬관절 강내 연골주사 2회차 시행함')
    expect(engine.fullText(visit(['LBP', 'MBB L4,5 both'], 'LA358'))).toBe('C-arm guide 하에 MBB L4,5 both 시행함')
  })

  it("AC-6614.7: 칸이 없을 때 엔진이 쓰는 값과 같은 답은 칸을 새로 만들지 않는다(확인 쪽 '바뀌는 것'에 안 바뀐 줄이 없다)", () => {
    const after = applyAnswers(neutralPhrases(), PRESETS[0].answers)
    expect(diffPhrases(neutralPhrases(), after).map((row) => row.path)).toEqual(['TPL.fixedPhrases', 'TPL.sideMode'])
    expect(after.TPL).not.toHaveProperty('levelSep')
    expect(after.TPL).not.toHaveProperty('sideStyle')
  })
})

describe('AC-6614.7 지금 문구의 답(answersOf)', () => {
  it('AC-6614.7: 중립 기본 문구는 좌우 Rt·수량 기준·가이드와 끝맺음 안 씀·쉼표·K-L grade (n)/(n)·◈·시술마다 한 줄이다', () => {
    expect(answersOf(neutralPhrases())).toEqual(NEUTRAL)
    expect(answersOf(defaultPhrases())).toEqual(NEUTRAL)
  })

  it('AC-6614.7: 고정 멘트가 켜져 있어도 그 토큰을 붙인 문구가 없으면 안 씀이고, 토큰이 있어도 꺼져 있으면 안 씀이다', () => {
    const value = neutralPhrases()
    value.TPL.fixedPhrases = [{ token: 'C-arm', text: '투시 하에', on: true }, { token: 'Sono', text: '초음파 하에', on: false }]
    value.TPL.iaEtc = `{Sono} ${value.TPL.iaEtc}`
    expect(answersOf(value)).toMatchObject({ carm: null, sono: null, ending: null })
    value.TPL.snb = '{C-arm} {시술}'
    expect(answersOf(value).carm).toBe('투시 하에')
  })

  it('AC-6614.7: 모르는 값은 엔진이 쓰는 값으로 읽는다', () => {
    const value = neutralPhrases()
    Object.assign(value.TPL, { sideStyle: 'weird', levelSep: 'slash', klg: 'KLG {KL1}', mark: undefined })
    expect(answersOf(value)).toMatchObject({ sideStyle: 'Rt', levelSep: 'comma', klg: 'paren', mark: '◈' })
  })
})
