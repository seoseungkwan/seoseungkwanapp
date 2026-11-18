import { FIXED_FALLBACK, type Phrases, type PhraseTemplates } from '../index'

// 처음 질문의 답(clinic-profile REQ-6614, design.md 16절): 답 ↔ 병원 문구. 순수 함수만 있다 [환자 자료 구역]
// 엔진에서 다른 시술 문구 안에 들어가 그려지는 icnb(ICNB 글자를 바꾸는 틀)와 ara(차트로 만든 연골주사 줄)는 바깥 문구(mainPeripheral 등)의
// 가이드·끝맺음을 그대로 받으므로 토큰을 붙이지 않는다(붙이면 두 번 나온다)

export const SIDE_STYLES = ['Rt', 'upper', 'dot', 'bil', 'ko', 'koShort'] as const
export type SideStyle = (typeof SIDE_STYLES)[number]
export const LEVEL_SEPS = ['comma', 'dash', 'repeat'] as const
export type LevelSep = (typeof LEVEL_SEPS)[number]
export type KlgStyle = 'paren' | 'plain' | 'ko'

/** 처음 질문의 답. 가이드·끝맺음의 null은 '안 씀', mark ''는 기호 없음이다 */
export type Answers = {
  sideStyle: SideStyle
  cartilageSideLang: 'ko' | 'en'
  sideMode: 'quantity' | 'chart'
  sideSpread: 'all' | 'adjacent'
  carm: string | null
  sono: string | null
  ending: string | null
  levelSep: LevelSep
  klg: KlgStyle
  mark: string
  lineJoin: 'lines' | 'oneLine'
}

/** 고르는 글(AC-6614.5). 붙인 메모도 이 글만 읽는다(AC-6614.3) */
export const CARM_CHOICES = ['C-arm guide 하에', 'C-arm 가이드 하에', 'C-arm 가이드하에'] as const
export const SONO_CHOICES = ['Sono guide 하에', '초음파 가이드 하에', 'Sono 가이드하에'] as const
export const ENDING_CHOICES = ['시행함', '시행', '시행하였음'] as const
export const MARK_CHOICES = ['◈', '◆', '▶', '→', '-', '·', '*', '※', '□'] as const
export const KLG_TEMPLATES: Readonly<Record<KlgStyle, string>> = { paren: 'K-L grade ({KL1})/({KL2})', plain: 'K-L grade {KL1}/{KL2}', ko: 'K-L 등급 {KL1}/{KL2}' }

/** 앞에 {C-arm}을 붙이는 신경차단술 문구 */
export const CARM_KEYS = ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb'] as const
/** 앞에 {Sono}를 붙이는 관절 주사 문구 */
export const SONO_KEYS = ['iaEtc', 'iaAra', 'ts'] as const
/** 끝에 {시행함}을 붙이는 시술 문구. 문구 글에 이미 '시행'이 있으면(건초내주사 기본 문구) 더 붙이지 않는다 */
export const ENDING_KEYS = [...CARM_KEYS, ...SONO_KEYS] as const

/** 칸이 없을 때 엔진이 쓰는 값(engine.ts: 좌우 모양 없음 = Rt, mark 없음 = ◈ 등) */
const ENGINE_DEFAULTS = { sideStyle: 'Rt', cartilageSideLang: 'ko', sideMode: 'quantity', sideSpread: 'all', levelSep: 'comma', mark: '◈', lineJoin: 'lines' } as const
const PLAIN_KEYS = Object.keys(ENGINE_DEFAULTS) as (keyof typeof ENGINE_DEFAULTS)[]

type TemplateKey = (typeof ENDING_KEYS)[number]
type FixedRow = NonNullable<PhraseTemplates['fixedPhrases']>[number]

const PREFIX: Record<'C-arm' | 'Sono', RegExp> = { 'C-arm': /^(?:\s*\{C-arm\})+\s*/, Sono: /^(?:\s*\{Sono\})+\s*/ }
const SUFFIX = /(?:\s*\{시행함\})+\s*$/
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const used = (value: string | null): value is string => value !== null && value.trim() !== ''
const pick = <V extends string>(value: unknown, list: readonly V[], fallback: V): V => (list.includes(value as V) ? (value as V) : fallback)
const ownEnding = (body: string) => /시행/.test(body.replace(/\{[^{}]*\}/g, ''))

/** 문구 하나: 관리하는 앞·끝 토큰을 떼고, 켜진 답이면 한 번씩 다시 붙인다. 빈 문구는 엔진이 '안 씀'으로 읽어 비운 채 둔다 */
function shape(template: string, token: 'C-arm' | 'Sono', guide: boolean, ending: boolean): string {
  const body = template.replace(PREFIX[token], '').replace(SUFFIX, '')
  if (!body.trim()) return body
  return `${guide ? `{${token}} ` : ''}${body}${ending && !ownEnding(body) ? ' {시행함}' : ''}`
}

/** 고정 멘트 C-arm·Sono·시행함 줄: 켜진 답이면 글과 켜짐, '안 씀'이면 끔(글은 둔다). 다른 줄은 그대로, 없는 줄은 기본 줄로 더한다 */
function fixedRows(rows: PhraseTemplates['fixedPhrases'], values: Record<'C-arm' | 'Sono' | '시행함', string | null>): FixedRow[] {
  const list: FixedRow[] = (Array.isArray(rows) ? rows : FIXED_FALLBACK).map((row) => ({ ...row }))
  for (const [token, value] of Object.entries(values)) {
    let row = list.find((item) => item.token === token)
    if (!row) {
      row = { ...FIXED_FALLBACK.find((item) => item.token === token)! }
      list.push(row)
    }
    if (used(value)) Object.assign(row, { text: value, on: true })
    else row.on = false
  }
  return list
}

/** 답을 문구에 넣는다(AC-6614.7). 바뀌는 칸은 좌우 4칸·고정 멘트 세 줄·문구 앞뒤 토큰·levelSep·klg·mark·lineJoin뿐이다. 받은 값은 고치지 않는다 */
export function applyAnswers(base: Phrases, answers: Answers): Phrases {
  const next = clone(base)
  const T = next.TPL
  for (const key of PLAIN_KEYS) {
    // 칸이 없을 때 엔진이 쓰는 값과 같은 답이면 칸을 새로 만들지 않는다(확인 쪽 '바뀌는 것'에 안 바뀐 줄이 나오지 않게)
    if (T[key] !== undefined || answers[key] !== ENGINE_DEFAULTS[key]) T[key] = answers[key]
  }
  T.klg = KLG_TEMPLATES[answers.klg]
  const ending = used(answers.ending)
  const reshape = (keys: readonly TemplateKey[], token: 'C-arm' | 'Sono', guide: boolean) => {
    for (const key of keys) {
      const value = T[key]
      if (typeof value === 'string') T[key] = shape(value, token, guide, ending)
    }
  }
  reshape(CARM_KEYS, 'C-arm', used(answers.carm))
  reshape(SONO_KEYS, 'Sono', used(answers.sono))
  T.fixedPhrases = fixedRows(T.fixedPhrases, { 'C-arm': answers.carm, Sono: answers.sono, 시행함: answers.ending })
  return next
}

/** 고정 멘트 줄이 켜져 있고 그 토큰을 붙인 문구가 하나라도 있으면 그 글, 아니면 '안 씀' */
function fixedAnswer(T: PhraseTemplates, token: 'C-arm' | 'Sono' | '시행함', keys: readonly TemplateKey[], has: (template: string) => boolean): string | null {
  const row = (Array.isArray(T.fixedPhrases) ? T.fixedPhrases : FIXED_FALLBACK).find((item) => item && item.token === token)
  if (!row || row.on === false) return null
  const value = String(row.text ?? '')
  const marked = keys.some((key) => {
    const template = T[key]
    return typeof template === 'string' && has(template)
  })
  return used(value) && marked ? value : null
}

/** 지금 문구의 답(다시 할 때 시작 값). 엔진처럼 없거나 모르는 값은 엔진이 쓰는 값으로 읽는다. answersOf(applyAnswers(x, a))는 a다 */
export function answersOf(phrases: Phrases): Answers {
  const T = phrases.TPL
  const klg = (Object.keys(KLG_TEMPLATES) as KlgStyle[]).find((key) => KLG_TEMPLATES[key] === T.klg)
  return {
    sideStyle: pick(T.sideStyle, SIDE_STYLES, ENGINE_DEFAULTS.sideStyle),
    cartilageSideLang: T.cartilageSideLang === 'en' ? 'en' : ENGINE_DEFAULTS.cartilageSideLang,
    sideMode: T.sideMode === 'chart' ? 'chart' : ENGINE_DEFAULTS.sideMode,
    sideSpread: T.sideSpread === 'adjacent' ? 'adjacent' : ENGINE_DEFAULTS.sideSpread,
    carm: fixedAnswer(T, 'C-arm', CARM_KEYS, (t) => PREFIX['C-arm'].test(t)),
    sono: fixedAnswer(T, 'Sono', SONO_KEYS, (t) => PREFIX.Sono.test(t)),
    ending: fixedAnswer(T, '시행함', ENDING_KEYS, (t) => SUFFIX.test(t)),
    levelSep: pick(T.levelSep, LEVEL_SEPS, ENGINE_DEFAULTS.levelSep),
    klg: klg ?? 'paren',
    mark: T.mark == null ? ENGINE_DEFAULTS.mark : String(T.mark),
    lineJoin: T.lineJoin === 'oneLine' ? 'oneLine' : ENGINE_DEFAULTS.lineJoin,
  }
}
