import { REGION, RG_EN, SIDE_STYLES, reEsc } from './chart'
import { FIXED_FALLBACK, SITE_FALLBACK } from './engine'
import { LEARN_KINDS_MAX, LEARN_MAX, PHRASES_MAX_CHARS } from './phrases'
import type { LearnKind, LearnRule, LearnWhen, Phrases, PhraseTemplates } from './types'

// 청구 메모 학습(specs/claim-learn design.md 2~5절). 순수 함수만 있다 [환자 자료 구역]
// 학습은 엔진 글(createMemoEngine().fullText) 위에 덧씌운다: 엔진은 바꾸지 않아 학습이 없으면 메모 글은 한 글자도 같다.
// 줄 틀 = 엔진 줄의 좌우·레벨·부위 글자를 {좌우}·{레벨}·{부위}로 바꾼 것. 다음 진료의 엔진 줄이 틀과 줄 전체로 맞으면 그 줄에 학습을 쓴다

export type SlotKey = '좌우' | '레벨' | '부위'
/** 줄에서 잡은 바뀌는 칸 값 */
export type Slots = Partial<Record<SlotKey, string>>
/** 바뀌는 칸으로 알아볼 글자: 좌우 글자·부위 글자와 줄 앞 표시(TPL.mark, 견주기 전에 뗀다) */
export type SlotWords = { side: string[]; site: string[]; mark: string }
/** 학습 문장에 {} 없이 남은 그 칸 글자('글자 그대로' 안내, AC-9301.4) */
export type LiteralSlot = { word: string; slot: SlotKey }
/** 덧씌울 때 보는 그 진료의 값(Worker가 만든다). codes는 그 진료의 모든 처방 코드 */
export type LearnContext = { codes: ReadonlySet<string>; regions: ReadonlySet<string>; chartText: string; doctors: readonly string[]; words: SlotWords }
/** 엔진 글과 고친 글의 줄 차이 하나. before = 엔진 글에서 그 자리 바로 앞 줄(없으면 '') */
export type LineDiff = { kind: LearnKind; old: string; new: string; before: string }
export type StyleField = 'sideStyle' | 'siteNames' | 'fixedPhrases' | 'levelSep'
/** 모든 메모에 해당하는 모양 고침(AC-9303.1). label은 notes '전체에 적용'의 칸 이름, patch는 설정에 얹을 값 */
export type StyleChange = { field: StyleField; label: string; from: string; to: string; patch: Partial<Phrases> }

// ── 바뀌는 칸 글자 ─────────────

const BASE_SIDES = ['Rt', 'Lt', 'both', 'Both', '우측', '좌측', '양측', 'Right', 'Left']
/** 좌우 표기를 고르지 않았을 때(엔진 styleSides가 바꾸지 않는 글자) */
const PLAIN_SIDES: Record<string, string> = { rt: 'Rt', lt: 'Lt', both: 'both' }

const styleOf = (tpl: PhraseTemplates) => (typeof tpl.sideStyle === 'string' && Object.hasOwn(SIDE_STYLES, tpl.sideStyle) ? tpl.sideStyle : null)
const siteNamesOf = (tpl: PhraseTemplates): Readonly<Record<string, string>> => (tpl.siteNames && typeof tpl.siteNames === 'object' ? tpl.siteNames : SITE_FALLBACK)
const fixedOf = (tpl: PhraseTemplates) => (Array.isArray(tpl.fixedPhrases) ? tpl.fixedPhrases : FIXED_FALLBACK)

/**
 * 바뀌는 칸 글자(design.md 3절). 좌우 = Rt·Lt·both·우측·좌측·양측·Right·Left·Both + 병원 좌우 표기.
 * 부위 = 병원 부위 영어 표기(없으면 기본)·영어 부위 이름·한글 부위 이름. 한 글자 표기(L·C)는 C-arm·레벨 글자와 가를 수 없어 넣지 않는다
 */
export function slotWords(phrases: Phrases): SlotWords {
  const tpl = phrases.TPL
  const style = styleOf(tpl)
  const side = [...new Set([...BASE_SIDES, ...(style ? Object.values(SIDE_STYLES[style]) : [])])]
  const site = [...new Set([...Object.values(siteNamesOf(tpl)), ...Object.values(RG_EN), ...REGION.map(([, ko]) => ko)].map((word) => String(word ?? '').trim()).filter((word) => word.length >= 2))]
  return { side, site, mark: (tpl.mark == null ? '◈' : String(tpl.mark)).trim() }
}

/** 낱말 앞뒤로 오면 한 낱말로 보는 글자(C-arm의 arm을 부위로 읽지 않게 붙임표도 넣는다) */
const WORD = 'A-Za-z0-9가-힣\\-'
/** 레벨 모양: 척추 글자가 붙었거나(L5·L4,5) 여럿을 나눈 것(4,5)만. 숫자 하나(1회·grade 3)는 레벨이 아니다 */
const LEVEL = '(?<![A-Za-z0-9])(?:[CTLS][ \\t]*\\d+(?:[ \\t]*[,/~-][ \\t]*(?:[CTLS][ \\t]*)?\\d+)*|\\d+(?:[ \\t]*[,/~-][ \\t]*(?:[CTLS][ \\t]*)?\\d+)+)(?![A-Za-z0-9]|\\.\\d)'
const wordsOf = (list: readonly string[]) =>
  list.length ? `(?<![${WORD}])(?:${[...list].sort((a, b) => b.length - a.length).map(reEsc).join('|')})(?![${WORD}])` : '(?!)'
const SLOT_SOURCE: Record<SlotKey, (words: SlotWords) => string> = { 레벨: () => LEVEL, 좌우: (words) => wordsOf(words.side), 부위: (words) => wordsOf(words.site) }
/** 레벨·좌우·부위 글자를 한 번에 찾는다(무리 1 = 레벨, 2 = 좌우, 3 = 부위) */
const scanOf = (words: SlotWords) => new RegExp(`(${LEVEL})|(${wordsOf(words.side)})|(${wordsOf(words.site)})`, 'g')
const slotOf = (level: string | undefined, side: string | undefined): SlotKey => (level !== undefined ? '레벨' : side !== undefined ? '좌우' : '부위')

/** 줄 앞 표시와 앞뒤 빈칸을 뗀 줄 몸과, 뗀 앞부분 */
function splitMark(line: string, mark: string): { prefix: string; body: string } {
  const trimmed = String(line).trim()
  const body = mark && trimmed.startsWith(mark) ? trimmed.slice(mark.length).trimStart() : trimmed
  return { prefix: trimmed.slice(0, trimmed.length - body.length), body }
}

// ── 줄 틀(design.md 3절) ─────────────

/** 줄에서 좌우·레벨·부위 글자를 {좌우}·{레벨}·{부위}로 바꾼 틀. 줄 앞 표시·앞뒤 빈칸은 떼고 빈칸은 하나로 */
export function toPattern(line: string, words: SlotWords): string {
  return splitMark(line, words.mark)
    .body.replace(scanOf(words), (_all, level: string | undefined, side: string | undefined) => `{${slotOf(level, side)}}`)
    .replace(/\s+/g, ' ')
    .trim()
}

type Compiled = { re: RegExp; kinds: SlotKey[] } | null
const compiledCache = new WeakMap<SlotWords, Map<string, Compiled>>()

function compile(pattern: string, words: SlotWords): Compiled {
  let cache = compiledCache.get(words)
  if (!cache) compiledCache.set(words, (cache = new Map()))
  if (cache.has(pattern)) return cache.get(pattern)!
  const body = splitMark(pattern, words.mark).body
  let compiled: Compiled = null
  if (body) {
    const kinds: SlotKey[] = []
    const source = body
      .split(/\{(좌우|레벨|부위)\}/)
      .map((part, index) => {
        if (index % 2 === 0) return part.split(/\s+/).map(reEsc).join('\\s+')
        kinds.push(part as SlotKey)
        return `(${SLOT_SOURCE[part as SlotKey](words)})`
      })
      .join('')
    compiled = { re: new RegExp(`^${source}$`), kinds }
  }
  cache.set(pattern, compiled)
  return compiled
}

/** 줄 전체가 틀과 맞으면 잡은 값(같은 칸이 두 번이면 첫 값), 아니면 null. 틀 글자는 그대로 견주고 빈칸 한 개 이상은 같게 본다 */
export function matchPattern(pattern: string, line: string, words: SlotWords): Slots | null {
  const compiled = compile(pattern, words)
  const found = compiled && compiled.re.exec(splitMark(line, words.mark).body)
  if (!compiled || !found) return null
  const slots: Slots = {}
  compiled.kinds.forEach((kind, index) => {
    if (slots[kind] === undefined) slots[kind] = found[index + 1]
  })
  return slots
}

/** 문장 틀의 {좌우}·{레벨}·{부위}를 채운다. 값이 없는 칸은 [좌우 확인]·[레벨 확인]·[부위 확인]이다(AC-9302.1) */
export function fillTemplate(to: string, slots: Slots): string {
  return to.replace(/\{(좌우|레벨|부위)\}/g, (_all, key: SlotKey) => slots[key] || `[${key} 확인]`)
}

/** 학습 문장에 {} 없이 남은 좌우·레벨·부위 글자(나온 차례, 같은 글자는 한 번) */
export function literalSlots(to: string, words: SlotWords): LiteralSlot[] {
  const hits: LiteralSlot[] = []
  for (const found of to.matchAll(scanOf(words))) {
    const hit = { word: found[0], slot: slotOf(found[1], found[2]) }
    if (!hits.some((seen) => seen.word === hit.word && seen.slot === hit.slot)) hits.push(hit)
  }
  return hits
}

/** [{좌우}로 바꾸기] 등: 그 글자(같은 칸 종류로 읽힌 것)를 모두 바뀌는 칸으로 바꾼다 */
export function toSlot(to: string, hit: LiteralSlot, words: SlotWords): string {
  return to.replace(scanOf(words), (all: string, level: string | undefined, side: string | undefined) => (all === hit.word && slotOf(level, side) === hit.slot ? `{${hit.slot}}` : all))
}

// ── 덧씌우기(design.md 4절) ─────────────

const squash = (value: string) => value.replace(/\s+/g, '').toLowerCase()

/** 켠 조건 수: 칩마다 하나, 진료한 원장님은 몇 명을 골라도 하나(AC-9302.4의 견주기) */
export function whenCount(when: LearnWhen): number {
  return when.codes.length + when.regions.length + when.chartWords.length + when.withCodes.length + (when.doctors.length ? 1 : 0)
}

function whenMet(when: LearnWhen, ctx: LearnContext, codes: ReadonlySet<string>, chart: string): boolean {
  const has = (code: string) => codes.has(code.toUpperCase())
  return (
    when.codes.every(has) &&
    when.withCodes.every(has) &&
    when.regions.every((region) => ctx.regions.has(region)) &&
    when.chartWords.every((word) => chart.includes(squash(word))) &&
    (!when.doctors.length || when.doctors.some((doctor) => ctx.doctors.includes(doctor)))
  )
}

type Live = { rule: LearnRule; index: number; count: number }
/** 켠 조건이 많은 것 → 나중에 만든 것 → 목록 뒤의 것(AC-9302.4) */
const ahead = (a: Live, b: Live) => a.count > b.count || (a.count === b.count && (a.rule.made > b.rule.made || (a.rule.made === b.rule.made && a.index > b.index)))

/**
 * 엔진 글 위에 학습을 덧씌운다(AC-9302.1~.4). 켜져 있고 켠 조건이 모두 맞는 학습만 쓴다(켠 조건이 없는 학습은 쓰지 않는다).
 * 줄마다 맞는 줄 바꿈·줄 뺌 가운데 하나, 줄 더함은 앞 줄 틀과 맞는 첫 엔진 줄 바로 뒤(없으면 끝, 같은 글 줄이 있으면 더하지 않음).
 * 한 줄 모드(lineJoin 'oneLine')는 글 전체가 한 줄이고 줄 바꿈만 쓴다. used = 쓰인 학습 번호(쓴 차례, 겹침 없음)
 */
export function applyLearned(text: string, rules: readonly LearnRule[], ctx: LearnContext, lineJoin: string | undefined): { text: string; used: string[] } {
  const codes = new Set([...ctx.codes].map((code) => code.toUpperCase()))
  const chart = squash(ctx.chartText)
  const live = rules.map((rule, index) => ({ rule, index, count: whenCount(rule.when) })).filter(({ rule, count }) => rule.on && count > 0 && whenMet(rule.when, ctx, codes, chart))
  if (!live.length) return { text, used: [] }
  const oneLine = lineJoin === 'oneLine'
  const words = ctx.words
  const lines = oneLine ? [text] : text.split('\n')
  const parts = lines.map((line) => splitMark(line, words.mark))
  const swaps = live.filter(({ rule }) => rule.kind === 'replace' || (!oneLine && rule.kind === 'remove'))
  const adds = oneLine ? [] : live.filter(({ rule }) => rule.kind === 'add')
  const used: string[] = []
  const noteUsed = (id: string) => {
    if (!used.includes(id)) used.push(id)
  }

  const out = lines.map((line, i): string[] => {
    const { prefix, body } = parts[i]
    if (!body) return [line]
    let best: { live: Live; slots: Slots } | null = null
    for (const entry of swaps) {
      const slots = matchPattern(entry.rule.from, body, words)
      if (slots && (!best || ahead(entry, best.live))) best = { live: entry, slots }
    }
    if (!best) return [line]
    noteUsed(best.live.rule.id)
    if (best.live.rule.kind === 'remove') return []
    return [prefix + fillTemplate(splitMark(best.live.rule.to, words.mark).body, best.slots)]
  })

  const tails = lines.map((): string[] => [])
  const end: string[] = []
  const key = (line: string) => splitMark(line, words.mark).body.replace(/\s+/g, ' ')
  for (const { rule } of adds) {
    let at = -1
    let slots: Slots = {}
    if (rule.after.trim()) {
      for (let i = 0; i < parts.length && at < 0; i++) {
        const found = parts[i].body ? matchPattern(rule.after, parts[i].body, words) : null
        if (found) [at, slots] = [i, found]
      }
    }
    const line = fillTemplate(rule.to.trim(), slots)
    const mine = key(line)
    if (!mine || [...out.flat(), ...tails.flat(), ...end].some((other) => key(other) === mine)) continue
    ;(at < 0 ? end : tails[at]).push(line)
    noteUsed(rule.id)
  }
  return { text: [...lines.flatMap((_line, i) => [...out[i], ...tails[i]]), ...end].join('\n'), used }
}

// ── 줄 차이(design.md 5절) ─────────────

/**
 * 엔진 글과 고친 글을 줄 단위로 견준다(앞뒤 빈칸·빈 줄 무시, LCS). 붙어 있는 뺌과 더함은 하나씩 짝지어 바꿈으로 본다.
 * before는 엔진 글에서 그 자리 바로 앞 줄이다: 바꿈·뺌은 옛 줄 바로 앞, 남는 더함은 그 무리의 마지막 엔진 줄(없으면 그 앞 같은 줄)
 */
export function diffLines(auto: string, edited: string): LineDiff[] {
  const linesOf = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)
  const a = linesOf(auto)
  const b = linesOf(edited)
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1])
  }
  const result: LineDiff[] = []
  let prev = ''
  let gone: string[] = []
  let added: string[] = []
  const flush = () => {
    const pairs = Math.min(gone.length, added.length)
    gone.forEach((old, k) => {
      const before = k === 0 ? prev : gone[k - 1]
      result.push(k < pairs ? { kind: 'replace', old, new: added[k], before } : { kind: 'remove', old, new: '', before })
    })
    const anchor = gone.length ? gone[gone.length - 1] : prev
    for (const line of added.slice(pairs)) result.push({ kind: 'add', old: '', new: line, before: anchor })
    if (gone.length) prev = gone[gone.length - 1]
    gone = []
    added = []
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush()
      prev = a[i]
      i++
      j++
    } else if (j >= b.length || (i < a.length && common[i + 1][j] >= common[i][j + 1])) {
      gone.push(a[i])
      i++
    } else {
      added.push(b[j])
      j++
    }
  }
  flush()
  return result
}

// ── 모양 고침 알아보기(design.md 5절, AC-9303.1) ─────────────

const oneLineText = (value: string, max: number) => value.length <= max && !/[\u0000-\u001f]/.test(value)

/** 옛 줄을 나누개로 자른 뒤 다른 글 w로 이으면 새 줄이 되는가. 되면 w(모든 자리에 같은 w) */
function solve(old: string, next: string, divider: string | RegExp): string | null {
  const pieces = old.split(divider)
  const count = pieces.length - 1
  if (count < 1) return null
  const extra = next.length - pieces.join('').length
  if (extra <= 0 || extra % count) return null
  const word = next.slice(pieces[0].length, pieces[0].length + extra / count)
  return pieces.join(word) === next ? word : null
}

type Side = 'rt' | 'lt' | 'both'

/** 좌우 표기: 옛 줄의 좌우 글자를 다른 표기로 모두 바꾸면 새 줄이 되는가 */
function sideChange(old: string, next: string, tpl: PhraseTemplates): StyleChange | null {
  const current = styleOf(tpl) ?? 'Rt'
  const read: Record<string, Side> = { Rt: 'rt', Lt: 'lt', both: 'both', Both: 'both', RT: 'rt', LT: 'lt', BOTH: 'both', Bil: 'both', 우측: 'rt', 좌측: 'lt', 양측: 'both' }
  if (current === 'dot') Object.assign(read, { 'Rt.': 'rt', 'Lt.': 'lt' })
  if (current === 'koShort') Object.assign(read, { 우: 'rt', 좌: 'lt', 양: 'both' })
  const scan = new RegExp(wordsOf(Object.keys(read)), 'g')
  for (const style of ['Rt', ...Object.keys(SIDE_STYLES)]) {
    if (style === current) continue
    const table = style === 'Rt' ? PLAIN_SIDES : SIDE_STYLES[style]
    let first: { from: string; to: string } | null = null
    const out = old.replace(scan, (word) => {
      const to = table[read[word]]
      if (!first && to !== word) first = { from: word, to }
      return to
    })
    if (out === next && first) return { field: 'sideStyle', label: '좌우 표기', ...(first as { from: string; to: string }), patch: { TPL: { ...tpl, sideStyle: style } } }
  }
  return null
}

/** 부위 영어 표기: 옛 줄의 표기 하나를 다른 글로 모두 바꾸면 새 줄이 되는가 */
function siteChange(old: string, next: string, tpl: PhraseTemplates): StyleChange | null {
  const names = siteNamesOf(tpl)
  for (const [key, value] of Object.entries(names)) {
    const from = String(value ?? '').trim()
    if (from.length < 2) continue
    const to = solve(old, next, new RegExp(wordsOf([from])))
    if (to !== null && to !== from && to === to.trim() && oneLineText(to, 40)) return { field: 'siteNames', label: '부위 표기', from, to, patch: { TPL: { ...tpl, siteNames: { ...names, [key]: to } } } }
  }
  return null
}

/** 고정 문구: 켜진 고정 문구 글 하나를 다른 글로 모두 바꾸면 새 줄이 되는가(긴 글부터) */
function fixedChange(old: string, next: string, tpl: PhraseTemplates): StyleChange | null {
  const list = fixedOf(tpl)
  const order = list
    .map((row, index) => ({ text: typeof row?.text === 'string' ? row.text : '', on: row?.on !== false, index }))
    .filter((row) => row.on && row.text.trim())
    .sort((a, b) => b.text.length - a.text.length)
  for (const { text, index } of order) {
    const to = solve(old, next, text)
    if (to !== null && to !== text && to.trim() && oneLineText(to, 200)) {
      return { field: 'fixedPhrases', label: '고정 문구', from: text, to, patch: { TPL: { ...tpl, fixedPhrases: list.map((row, at) => (at === index ? { ...row, text: to } : { ...row })) } } }
    }
  }
  return null
}

const LEVEL_LIST = /(?<![A-Za-z0-9])(?:[CTLS][ \t]*)?\d+(?:[ \t]*[,-][ \t]*(?:[CTLS][ \t]*)?\d+)+(?![A-Za-z0-9]|\.\d)/g
type LevelSep = 'comma' | 'dash' | 'repeat'

/** 레벨 목록을 그 나눔 모양으로: 쉼표(L4,5,S1) · 붙임표(L4-5-S1) · 글자 반복(L4, L5, S1 — 엔진 repeatLevels와 같게 C·T·L 머리만) */
function renderLevels(list: string, sep: LevelSep): string {
  const items = list.split(/[ \t]*[,-][ \t]*/).map((item) => item.match(/^([CTLS])?[ \t]*(\d+)$/i))
  if (items.some((item) => !item)) return list
  let head = ''
  const comma = items
    .map((item) => {
      const letter = (item![1] ?? '').toUpperCase()
      if (!letter || letter === head) return item![2]
      head = letter
      return letter + item![2]
    })
    .join(',')
  if (sep === 'comma') return comma
  if (sep === 'dash') return comma.replace(/,/g, '-')
  const lead = comma.match(/^([CTL])/)
  if (!lead) return comma
  return comma
    .slice(1)
    .split(',')
    .map((level) => (/^[CTLS]/.test(level) ? level : lead[1] + level))
    .join(', ')
}

/** 레벨 사이 글자: 옛 줄의 레벨 목록을 다른 나눔 모양으로 모두 바꾸면 새 줄이 되는가 */
function levelChange(old: string, next: string, tpl: PhraseTemplates): StyleChange | null {
  const current: LevelSep = tpl.levelSep === 'dash' || tpl.levelSep === 'repeat' ? tpl.levelSep : 'comma'
  for (const sep of ['comma', 'dash', 'repeat'] as const) {
    if (sep === current) continue
    let first: { from: string; to: string } | null = null
    const out = old.replace(LEVEL_LIST, (list) => {
      const to = renderLevels(list, sep)
      if (!first && to !== list) first = { from: list, to }
      return to
    })
    if (out === next && first) return { field: 'levelSep', label: '레벨 사이 글자', ...(first as { from: string; to: string }), patch: { TPL: { ...tpl, levelSep: sep } } }
  }
  return null
}

/**
 * 바꾼 줄이 엔진 줄과 '알아보는 모양 고침' 하나만 다른가(design.md 5절): 좌우 표기 → 부위 영어 표기 → 고정 문구 → 레벨 사이 글자 차례로 보고 첫 것.
 * 그 설정 칸만 바꿔 옛 줄에 대 보면 새 줄과 한 글자도 같아야 한다. 아니면 null(묻지 않는다, AC-9303.3). 받은 설정은 고치지 않는다
 */
export function styleChange(old: string, next: string, phrases: Phrases): StyleChange | null {
  const a = old.trim()
  const b = next.trim()
  if (a === b) return null
  const tpl = phrases.TPL
  return sideChange(a, b, tpl) ?? siteChange(a, b, tpl) ?? fixedChange(a, b, tpl) ?? levelChange(a, b, tpl)
}

// ── 개인정보·한도(design.md 2절) ─────────────

const PHONE = /0\d{1,2}-?\d{3,4}-?\d{4}/
const NATIONAL_ID = /\d{6}-?[1-4]\d{6}/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/

/** 학습에 저장하면 안 되는 글인가(AC-9301.5): 전화·주민번호·메일 모양, 또는 그 진료의 환자 이름·차트번호(2자 이상, 대소문자·띄어쓰기 무시) */
export function personalHit(text: string, forbidden: readonly string[]): boolean {
  if (PHONE.test(text) || NATIONAL_ID.test(text) || MAIL.test(text)) return true
  const plain = squash(text)
  return forbidden.some((term) => {
    const word = squash(String(term ?? ''))
    return word.length >= 2 && plain.includes(word)
  })
}

/** 저장하려는 병원 문구가 한도를 넘는가(AC-9304.3): 학습 300개 · 처음 학습 종류 2000개 · 설정 글자 200만 자. 서버의 크기 제약(pg_column_size)은 저장 실패로 알린다 */
export function overLearnLimit(next: Phrases): boolean {
  return (next.learned?.length ?? 0) > LEARN_MAX || (next.learnKinds?.length ?? 0) > LEARN_KINDS_MAX || JSON.stringify(next).length > PHRASES_MAX_CHARS
}
