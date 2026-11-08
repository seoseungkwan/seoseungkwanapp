import type { ClaimMonth, RxLine, Visit } from '@/types/precheck'
import {
  PCODE, REGION, RG_EN, RX_NONBEN, RX_PROC, SIDE_EN, SIDE_STYLES, SIDE_TOK, FINGER_RE,
  cleanKo, codeSet, dayDiff, distSide, durOf, dxKo, expandAek, filterByRxOriginal, fxOf, imgKo, imgSrc, klOf, lineKindOf, normLine, reEsc, regionOf, segProcNames, sideKey, sideOf, splitProc, stripNonBen,
} from './chart'
import { defaultDictionary, dictionaryTerms, normalizeDictionary } from './dictionary'
import { DEFAULT_ARA } from './phrases'
import type { DrugChoice, DrugPlace, MemoCode, MemoDictionary, MemoItem, MemoParts, MemoSegment, MemoTables, MemoVisit, Phrases, QuantityMap, Region, RxAddition } from './types'

// 청구메모 글 만들기(원본 mx999_v22.html, seoseungkwan/shared@2a1069b). 원본 스크립트를 끝까지 돌린 뒤의 함수를 옮겼다(design.md 19-2).
// 원본 전역 값(TPL·CODEMAP·RXDATA·FILL_VISIT)은 이 엔진 하나의 안쪽 값이 된다. 문구·표기·약은 받은 설정에서만 읽는다(AC-014.7). [환자 자료 구역]
// 옮기지 않은 것(골든 knownDiffs에 적었다): 병원 모드(TPL.__catalog), 옛 좌우 규칙(검사가 2로 바꾼다), 화면 점검 칸(checks·chips·tags·have), 고친 메모 칸 edits(fullText 밖에서 받는다).
// 일부러 다른 것: 약 규칙(design.md 19-4). 원본 DRUG_EN·리도카인 이름·A49 글자·ARA_RE·drugLocal 대신 procedureDrugs만 본다. 약 계획은 drugPlan이 한 곳에서 정한다

const SIDE_WORD = '(?:\\b(?:both|Rt|Lt|right|left)\\b|양측|양쪽|우측|좌측|\\[좌우\\s*확인\\])'
const MISS_SITE = '[부위 확인]'
const TEMPLATE_TOKENS = ['좌우', '한글방향', '영문방향', '레벨', '부위', '시술', '약제', 'KLG', '검사', '기간', '진단', '영상']
const LEVEL_CODES = new Set(['LA248', 'LA354', 'LA355', 'LA356', 'LA358', 'LA359'])
const CARTILAGE_NAME = /아라간|히알|하이알|hyal|연골\s*주사/i
const IA_SET_CODES = /^(LA274|LA272)$/i
/** IA 줄 부위로 읽는 관절(AC-3001.1). 척추·늑골·상지는 IA 부위가 아니다 */
const IA_REGIONS = ['shoulder', 'knee', 'ankle', 'elbow', 'wrist', 'hip', 'hand', 'foot']
const IA_WORD = /\bIA\b|관절강|관절내|intra.?artic|injection/i
/** 연골주사 날 일반 IA 줄로 고를 차트 줄의 IA 말(AC-3001.2). 'injection'만 있는 줄은 다른 시술 줄이라 고르지 않는다 */
const IA_LINE_WORD = /\bIA\b|관절강|관절내|intra.?artic/i
/** fixedPhrases 칸이 없을 때 쓰는 고정 멘트. 설정 화면도 이 값을 보인다(phrases/constants.ts가 다시 내보냄) */
export const FIXED_FALLBACK: readonly { token: string; text: string; on: boolean }[] = [{ token: 'C-arm', text: 'C-arm guide 하에', on: true }, { token: 'Sono', text: 'Sono guide 하에', on: true }, { token: '시행함', text: '시행함', on: true }]
/** siteNames 칸이 없을 때 쓰는 부위 영어 표기. 설정 화면도 이 값을 보인다 */
export const SITE_FALLBACK: Readonly<Record<string, string>> = { cervical: 'C', lumbar: 'L', shoulder: 'shoulder', knee: 'knee', ankle: 'ankle', elbow: 'elbow', wrist: 'wrist', hand: 'hand', hip: 'hip', chest: 'rib', foot: 'foot', upper: 'upper extremity' }
const LEVEL_NOTATION_SUFFIX = '(?![A-Za-z0-9.])'

const text = (value: unknown) => String(value ?? '')
const upper = (value: unknown) => String(value ?? '').toUpperCase()
const codeEscape = (value: unknown) => text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const sideTokens = (value: unknown) => [
  ...new Set((text(value).match(/\b(?:Rt|Lt|both|right|left)\b|우측|좌측|양측|양쪽/gi) || []).map((word) => (/^(?:rt|right|우측)$/i.test(word) ? 'Rt' : /^(?:lt|left|좌측)$/i.test(word) ? 'Lt' : 'both'))),
]
const explicitLevel = (value: unknown) => /(?:^|\s)(?:[CTLS]\s*)?\d+(?:\s*[,/\-~]\s*(?:[CTLS]\s*)?\d+)*(?:\s*(?:levels?|레벨))?(?=\s|$)/i.test(text(value))

/** 원본 sideWords: 흔한 좌우 표기를 Rt·Lt·both 또는 우측·좌측·양측으로 */
const koreanSide = (_: string, before: string, side: string) => `${before}${{ 우: '우측', 좌: '좌측', 양: '양측' }[side]} `
const normalizeSideWords = (value: unknown) =>
  text(value)
    .replace(/[(\[]\s*([RLB])\s*[)\]]/g, (_, side: 'R' | 'L' | 'B') => ({ R: 'Rt', L: 'Lt', B: 'both' })[side])
    .replace(/(^|[^A-Za-z0-9])(?:B\/L|bilateral|bilat|bil|bth|bt)(?![A-Za-z0-9])/gi, '$1both')
    .replace(/오른쪽/g, '우측').replace(/왼쪽/g, '좌측').replace(/([우좌양])\s+측/g, '$1측')
    .replace(/(^|[^가-힣])([우좌양])\s*(?=어깨|무릎|슬관절|견관절|고관절|족관절|주관절|허리|발목|손목|팔꿈치|다리|엉덩이|골반|둔부|대퇴|종아리)/g, koreanSide)
    .replace(/(^|[^가-힣])([우좌양])\s+(?=[목발손팔])/g, koreanSide)

/** 원본 normalizeMbbLevels: MBB 레벨 표기를 쉼표로 모은다. 떨어진 레벨의 붙임표는 범위라 그대로 둔다 */
function normalizeMbbLevels(value: unknown): string {
  const source = text(value)
    .replace(/(^|[^A-Za-z0-9])L[ \t]*-?[ \t]*MBB[ \t]*(?=S?\d)/gi, '$1MBB L')
    .replace(/(^|[^A-Za-z0-9])L[ \t]*-?[ \t]*MBB(?![A-Za-z])/gi, '$1MBB L')
    .replace(/(^|[^A-Za-z0-9])C[ \t]*-?[ \t]*MBB(?![A-Za-z])/gi, '$1C-MBB')
    .replace(/(^|[^A-Za-z0-9])MBB([CLT])(?=[ \t]*S?\d)/gi, '$1MBB $2')
    .replace(/(^|[^A-Za-z0-9])mbb(?![A-Za-z])/gi, '$1MBB')
  const head = /(?:^|[^A-Za-z0-9])(?:C-MBB[ \t]*|MBB[ \t]*(?:([CLT])(?![A-Za-z])[ \t]*)?)/gi
  const gap = /[ \t]*([,\-/.~])[ \t]*|[ \t]+|/y
  let out = ''
  let from = 0
  let match: RegExpExecArray | null
  while ((match = head.exec(source))) {
    const digit = /^t$/i.test(match[1] || '') ? '1[0-2]|\\d' : '\\d'
    const token = new RegExp(`(S[ \\t]?[1-5])(?![0-9A-Za-z])|(${digit})(?=$|[^A-Za-z]|S[ \\t]?[1-5]|(?:Rt|Lt|both|right|left)(?![A-Za-z]))`, 'iy')
    const start = head.lastIndex
    const levels: string[] = []
    let at = start
    let last = -1
    let range = false
    for (;;) {
      let next = at
      let sep = ''
      if (levels.length) {
        gap.lastIndex = at
        const found = gap.exec(source)!
        next = at + found[0].length
        sep = found[1] || ''
      }
      token.lastIndex = next
      const found = token.exec(source)
      if (!found) break
      const level = (found[1] || found[2]).replace(/[ \t]/g, '').toUpperCase()
      const order = level[0] === 'S' ? 100 + Number(level.slice(1)) : Number(level)
      if (order <= last) break
      if ((sep === '-' || sep === '~') && !(order - last === 1 || (last === 5 && order === 101))) range = true
      levels.push(level)
      last = order
      at = token.lastIndex
    }
    if (levels.length > 1 && !range) {
      out += source.slice(from, start) + levels.join(',')
      from = at
    }
    head.lastIndex = Math.max(head.lastIndex, at)
  }
  return out + source.slice(from)
}

/** 원본 unresolved: 확인 표시가 남은 메모(AC-014.12). [약 확인: 약 이름]도 걸린다 */
export const unfinished = (memo: unknown) => /\[[^\]\n]*(?:확인|미확인|미정|누락)[^\]\n]*\]|\{[^{}\n]+\}/.test(text(memo))

type Rule = { code: string; names: string[]; codes: string[]; quantity: number | null; mode: string; procedureType: string; conflict: boolean; omit: boolean; preserve: boolean; side: string }
type Renderer = (template: string, vars: Record<string, unknown>) => string
/**
 * name은 메모에 쓰는 표기(label), drug는 코드 표의 약 이름([약 확인: 이름]에 쓴다).
 * owner: 시술 2개 이상인 날 그 약이 넣기인 시술 키(procKeys 모양, REQ-3002). 주인 약은 그 시술 줄에만 놓인다. cartilage: 연골주사약(연골주사 줄에 놓인다)
 */
type DrugItem = { name: string; qty: number | null; drug: string; owner?: string; cartilage?: boolean }
type DrugPlan = {
  decisions: Map<string, { use: 'include' | 'exclude' | 'check'; place?: DrugPlace; owner?: string }>
  /** 틀의 {약제} 자리(없으면 {시술} 바로 뒤)에 넣을 약. 연골주사 날의 연골주사약은 그 자리에 넣지 않는다(원본 cartilageLine처럼 연골주사 줄이 있다) */
  afterProc: DrugItem[]
  afterEnding: DrugItem[]
  ownLine: DrugItem[]
  /** [약 확인: 약 이름] */
  checks: string[]
}

export type MemoEngine = ReturnType<typeof createMemoEngine>

export function createMemoEngine(phrases: Phrases, tables: MemoTables) {
  const TPL = phrases.TPL
  // 원본 applyCfg: 지운 코드는 사전에 없는 코드다
  const deleted = new Set(phrases.CODEMAP_DEL)
  const CODEMAP = Object.fromEntries(Object.entries(phrases.CODEMAP).filter(([code]) => !deleted.has(code)))
  const dictionary: MemoDictionary = tables.dictionary ?? defaultDictionary()
  const entries = Object.entries(CODEMAP)
  const hasCode = (key: string) => Object.hasOwn(CODEMAP, key)

  /** 원본 cm: 글자 그대로 → 대문자 → 소문자 */
  function cm(code: unknown): MemoCode | null {
    if (!code) return null
    const raw = String(code)
    for (const key of [raw, raw.toUpperCase(), raw.toLowerCase()]) if (hasCode(key)) return CODEMAP[key]
    return null
  }
  const entry = cm

  // 원본 catalogCache: 코드표에서 얻는 계산은 다시 하지 않는다
  const patterns = new Map<string, RegExp>()
  function compiled(pattern: string, flags = 'i'): RegExp {
    const key = `${flags}|${pattern}`
    let expression = patterns.get(key)
    if (!expression) {
      expression = new RegExp(pattern, flags)
      patterns.set(key, expression)
    }
    expression.lastIndex = 0
    return expression
  }
  const procedureRows = entries.filter(([, row]) => row.k === 'proc' && row.pendingReview !== true)

  // ── 코드 규칙(원본 hospital-code-rules, 병원 모드가 아닐 때) ─────────────────

  function configRow(code: unknown): MemoCode | null {
    const key = String(code || '')
    if (hasCode(key)) return CODEMAP[key]
    const matching = Object.keys(CODEMAP).filter((value) => value.toUpperCase() === key.toUpperCase())
    return matching.length === 1 ? CODEMAP[matching[0]] : null
  }
  function configuredValue(values: Record<string, string>, code: unknown): string | undefined {
    const key = String(code || '')
    if (Object.hasOwn(values, key)) return values[key]
    const matching = Object.keys(values).filter((value) => value.toUpperCase() === key.toUpperCase())
    return matching.length === 1 ? values[matching[0]] : undefined
  }
  const baseOf = (raw: string) => (/^(?:LA\d{3}|KK\d{3})$/.test(raw) ? raw : /^LA\d{6}$/.test(raw) ? raw.slice(0, 5) : '')
  function trustedProcedureBase(code: unknown): string {
    const row = configRow(code)
    if (!row || row.k !== 'proc' || row.pendingReview === true) return ''
    const imported = !!TPL.__catalog || Object.hasOwn(row, 'bitKind')
    return baseOf(String(row.standardCode || (!imported ? code : '') || '').trim().toUpperCase())
  }
  const procedureType = (code: unknown) => (LEVEL_CODES.has(trustedProcedureBase(code)) ? 'level' : 'side')
  function sidePolicy(code: unknown): { type: string; enabled: boolean; mode: string } {
    const type = procedureType(code)
    const value = configuredValue(TPL.sideByCode || {}, code)
    if (value === 'omit') return { type, enabled: false, mode: 'omit' }
    if (type === 'level') return { type, enabled: true, mode: 'keep' }
    const mode = value === 'keep' || value === 'quantity' ? value : TPL.sideMode === 'chart' ? 'keep' : 'quantity'
    return { type, enabled: true, mode }
  }
  /** 원본 hospital-code-rules base */
  function procedureBase(code: unknown): string {
    const row = entry(code)
    if (!row || row.k === 'skip' || row.pendingReview === true || row.k !== 'proc') return ''
    return baseOf(String(row.standardCode || (Object.hasOwn(row, 'bitKind') ? '' : code) || '').trim().toUpperCase())
  }
  const procKeys = (v: Pick<Visit, 'rx'>) => new Set(v.rx.filter((item) => { const row = entry(item.code); return row?.k === 'proc' && row.pendingReview !== true }).map((item) => upper(entry(item.code)!.standardCode || item.code)))

  function addQuantity(target: QuantityMap, name: unknown, value: number | null, code: string) {
    const key = String(name || '').trim().toUpperCase()
    if (!key) return
    if (!Object.hasOwn(target, '__nmSideRows')) Object.defineProperty(target, '__nmSideRows', { value: [], enumerable: false })
    target.__nmSideRows!.push({ code: String(code), name: key, quantity: value })
    if (!Object.hasOwn(target, key)) target[key] = value
    else {
      const old = target[key]
      target[key] = old === null || value === null ? null : Math.max(old, value)
    }
  }

  // ── 문구 사전·줄 읽기(원본 review-safety) ──────────────────────────────

  const procedureNamesCache = new Map<boolean, string[]>()
  function procedureNames(levelOnly = false): string[] {
    const cached = procedureNamesCache.get(levelOnly)
    if (cached) return cached
    const names = new Set<string>()
    for (const [code, row] of procedureRows) {
      if (levelOnly && procedureType(code) !== 'level') continue
      for (const value of [row.n, row.templateKey]) if (text(value).trim()) names.add(text(value).trim())
    }
    const result = [...names].sort((a, b) => b.length - a.length)
    procedureNamesCache.set(levelOnly, result)
    return result
  }
  function normalizeLevelNotation(value: unknown, names = procedureNames()): string {
    let result = text(value)
    let found = false
    for (const name of names) {
      const token = codeEscape(name)
      if (compiled(`(^|[^A-Z0-9가-힣])${token}(?=$|[^A-Z가-힣])`, 'i').test(result)) found = true
      result = result.replace(compiled(`(^|[^A-Z0-9가-힣])(${token})(?=\\d)`, 'gi'), '$1$2 ')
    }
    return found ? result.replace(/(\d)(Rt|Lt|both|right|left)(?![A-Z])/gi, '$1 $2') : result
  }
  const normalizeChartLine = (line: unknown) => normalizeLevelNotation(normalizeMbbLevels(normalizeSideWords(normalizeDictionary(text(line), null, dictionary))))
  function normalizeAnalyzedLine(value: unknown): string {
    const normalized = normalizeChartLine(value)
    const protectedNames: string[] = []
    let token = '\uE700NMC\uE701'
    while (normalized.includes(token)) token += '\uE701'
    let result = normalized
    for (const name of procedureNames(true)) {
      result = result.replace(compiled(`(^|[^A-Z0-9가-힣])(${codeEscape(name)})(?![A-Z0-9가-힣])`, 'gi'), (_, prefix: string, match: string) => {
        const marker = `${token}${protectedNames.length}\uE702`
        protectedNames.push(match)
        return prefix + marker
      })
    }
    result = normLine(result)
    protectedNames.forEach((name, index) => {
      result = result.split(`${token}${index}\uE702`).join(name)
    })
    return result
  }
  const hasExplicitLevelProcedure = (value: unknown) => procedureNames(true).some((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])`, 'i').test(text(value))) && explicitLevel(value)
  const hasNamedLevels = (value: unknown, names: string[]) =>
    names.some((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])[ \\t]+(?:${SIDE_WORD}[ \\t]+)?(?:[CTLS][ \\t]*)?\\d+(?:[ \\t]*[,/\\-~][ \\t]*(?:[CTLS][ \\t]*)?\\d+)*(?:[ \\t]*(?:levels?|레벨))?${LEVEL_NOTATION_SUFFIX}`, 'i').test(text(value)))
  const hasNumericProcedure = (value: unknown) => procedureNames().some((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?=$|[^A-Z0-9가-힣])`, 'i').test(text(value)))

  function filterByRx(value: string, names: Set<string>): string {
    const filtered = filterByRxOriginal(value, names)
    if (filtered) return filtered
    const prescribed = new Set([...names].map((name) => text(name).toUpperCase()))
    const levelNames = procedureNames(true).filter((name) => prescribed.has(name.toUpperCase()))
    return hasNamedLevels(value, levelNames) ? value : filtered
  }

  function lineKind(value: string, hint: string | null): string {
    const raw = text(value)
    const contains = (kind: string) => dictionaryTerms(kind, dictionary).some((term) => raw.toLocaleLowerCase().includes(text(term).toLocaleLowerCase()))
    if (contains('cancel') || contains('hold') || contains('conditional') || contains('planned')) return 'plan'
    const result = lineKindOf(raw, hint)
    return (result === 'dx' || result === 'subj') && hasNumericProcedure(raw) && explicitLevel(raw) ? 'proc' : result
  }

  // ── 좌우 규칙(원본 review-safety fixedGroupRules·quantitySideText·renderQuantityProcedure) ─────

  function quantityRules(qmap: QuantityMap | null | undefined, exactCode?: unknown): Rule[] {
    const metadata = qmap?.__nmSideRows
    const groups = new Map<string, { name: string; names: Set<string>; items: { code: string; quantity: number | null | undefined; type: string; enabled: boolean; mode: string }[] }>()
    const items: { code: string; quantity: number | null | undefined }[] = metadata?.length ? metadata : procedureRows.map(([code, row]) => ({ code, quantity: qmap?.[text(row.n).trim().toUpperCase()] }))
    for (const item of items) {
      if (exactCode !== undefined && item.code.toUpperCase() !== text(exactCode).toUpperCase()) continue
      const row = entry(item.code)
      if (!row || row.k !== 'proc' || row.pendingReview === true) continue
      const name = text(row.n).trim()
      if (!name) continue
      const key = name.toUpperCase()
      const group = groups.get(key) ?? { name, names: new Set<string>(), items: [] }
      for (const alias of [name, row.templateKey]) if (text(alias).trim()) group.names.add(text(alias).trim())
      group.items.push({ ...item, ...sidePolicy(item.code) })
      groups.set(key, group)
    }
    return [...groups].map(([code, group]) => {
      for (const name of [...group.names]) {
        const renamed = stripSideWords(applyRename(name))
        if (renamed) group.names.add(renamed)
      }
      const modes = new Set(group.items.map((item) => item.mode))
      const types = new Set(group.items.map((item) => item.type))
      const conflict = modes.size > 1 || types.size > 1
      const mode = conflict ? 'keep' : [...modes][0]
      const values = group.items.map((item) => item.quantity)
      const known = values.length > 0 && values.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
      const quantity = known ? Math.max(...(values as number[])) : null
      return {
        code,
        names: [...group.names],
        codes: group.items.map((item) => item.code),
        quantity,
        mode,
        procedureType: types.size === 1 ? [...types][0] : 'side',
        conflict,
        omit: mode === 'omit',
        preserve: mode === 'keep',
        side: mode === 'quantity' && known && quantity! >= 1.5 ? 'both' : '',
      }
    })
  }
  const stripSideWords = (value: unknown) => text(value).replace(new RegExp(SIDE_WORD, 'gi'), '').replace(/\s{2,}/g, ' ').trim()
  const matchingRules = (value: unknown, qmap: QuantityMap | null | undefined, exactCode?: unknown) =>
    quantityRules(qmap, exactCode).filter((rule) => rule.names.some((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])`, 'i').test(text(value))))

  function quantitySideText(value: unknown, qmap: QuantityMap | null | undefined, exactCode?: unknown, appendSide = true): string {
    let result = text(value)
    const rules = quantityRules(qmap, exactCode)
    const aliases: { name: string; rule: Rule }[] = []
    for (const rule of rules) if (!rule.preserve) for (const name of rule.names) aliases.push({ name, rule })
    aliases.sort((a, b) => b.name.length - a.name.length)
    const selected = new Map<string, { name: string; rule: Rule }>()
    for (const { name, rule } of aliases) {
      const key = name.toUpperCase()
      if (!selected.has(key)) selected.set(key, { name, rule })
    }
    if (selected.size) {
      const token = [...selected.values()].map(({ name }) => codeEscape(name)).join('|')
      const end = '(?![A-Z0-9가-힣])'
      const marker = text(markOf()).trim()
      const prefix = `(^|[\\n/,;·:：◈◇◆●○▪▸]${marker ? `|${codeEscape(marker)}` : ''})`
      result = result.replace(new RegExp(`${prefix}([ \\t]*)[(\\[]?${SIDE_WORD}[)\\]]?[ \\t]+(${token})${end}`, 'gi'), (_, before: string, space: string, proc: string) => before + space + proc)
      const levelNames = [...selected.values()].map(({ name }) => name)
      if (levelNames.length) {
        result = normalizeLevelNotation(result, levelNames)
        const levels = `([ \\t]+(?:[CTLS][ \\t]*)?\\d+(?:[ \\t]*[,/\\-~][ \\t]*(?:[CTLS][ \\t]*)?\\d+)*(?:[ \\t]*(?:levels?|레벨))?${LEVEL_NOTATION_SUFFIX}|[ \\t]+[CTLS](?![A-Za-z0-9-]))?`
        const sides = `(?:[ \\t]*[(\\[]?${SIDE_WORD}[)\\]]?)*`
        result = result.replace(new RegExp(`(^|[^A-Z0-9가-힣])(${levelNames.map(codeEscape).join('|')})${end}${sides}${levels}${sides}`, 'gi'), (_, before: string, proc: string, level: string | undefined) => {
          const side = appendSide ? selected.get(proc.toUpperCase())!.rule.side : ''
          return before + proc + (level ? ` ${level.trimStart()}` : '') + (side ? ` ${side}` : '')
        })
      }
    }
    return result
  }
  const sideFix = (value: unknown, qmap: QuantityMap | null | undefined) => quantitySideText(value, qmap).trim()

  const CARTILAGE_SIDES: Record<string, [string, string]> = { Rt: ['우측', 'Rt'], Lt: ['좌측', 'Lt'], both: ['양측', 'both'] }
  function cartilageText(template: string, vars: Record<string, unknown>, rules: Rule[], renderer: Renderer): string {
    const values = { ...vars }
    const charted = sideTokens(values['좌우'])
    const unsure = text(values['좌우']).includes('[좌우 확인]')
    if (rules.some((rule) => rule.mode === 'omit')) values['좌우'] = ''
    const side = rules.some((rule) => rule.mode === 'omit') ? '' : charted.length === 1 ? charted[0] : rules.some((rule) => !rule.preserve && rule.side === 'both') ? 'both' : ''
    values['좌우'] = side ? CARTILAGE_SIDES[side][TPL.cartilageSideLang === 'en' ? 1 : 0] : !rules.some((rule) => rule.mode === 'omit') && (unsure || charted.length > 1) ? '[좌우 확인]' : ''
    if (!text(values['회차']).trim()) values['회차'] = '[회차 확인]'
    return text(renderer(template, values)).replace(/\[회차 확인\]\s*회차/g, '[회차 확인]').replace(/\s{2,}/g, ' ').trim()
  }
  /** {레벨}: 차트에 적힌 레벨 숫자만(척추 글자·좌우 없이) */
  function levelOf(procedure: unknown): string {
    const match = normalizeLevelNotation(text(procedure)).match(/(?:^|[^A-Za-z0-9])(?:[CTLS][ \t-]*)?(\d+(?:[ \t]*[,/~-][ \t]*(?:[CTLS][ \t]*)?\d+)*(?:[ \t]*(?:levels?|레벨))?)(?![A-Za-z0-9])/i)
    return match ? match[1].replace(/[ \t]*([,/~-])[ \t]*/g, '$1').trim() : ''
  }
  /** {코드} {처방명}: 이 시술 줄의 보험 코드와 비트에 등록된 처방 이름 */
  function procedureCodeVars(p: unknown, qmap: QuantityMap | null | undefined, exactCode?: unknown) {
    const up = String(p || '').toUpperCase()
    const rows = (exactCode ? [String(exactCode)] : procPool(qmap)).filter((code) => {
      const row = hasCode(code) ? CODEMAP[code] : null
      return row && (exactCode || (row.k === 'proc' && (procNamed(row.n, up) || procNamed(row.templateKey, up))))
    })
    const codes = [...new Set(rows.map((code) => String(procedureBase(code) || CODEMAP[code].standardCode || code).toUpperCase()))]
    const names = [...new Set(rows.map((code) => String(CODEMAP[code].bitName || CODEMAP[code].displayName || CODEMAP[code].n || '').trim()).filter(Boolean))]
    return { 코드: codes.join(', '), 처방명: names.join(', ') }
  }

  /** 약 자리 afterProc에서 틀에 {약제}가 없으면 {시술} 바로 뒤를 그 자리로 삼는다. 첫 시술 줄 한 번만 */
  let drugSlotOpen = false
  function withDrugSlot(template: string): string {
    if (!drugSlotOpen) return template
    drugSlotOpen = false
    if (template.includes('{약제}')) return template
    return template.includes('{시술}') ? template.replace('{시술}', '{시술}{약제}') : `${template}{약제}`
  }

  /** siteSide: {부위}에 붙은 차트 좌우를 떼지 않는다(memoRules.iaSide, AC-3003.1). 그 좌우가 있으면 수량 양측을 더 붙이지 않는다 */
  function renderQuantityProcedure(procedure: unknown, template0: unknown, vars: Record<string, unknown>, qmap: QuantityMap | null | undefined, renderer: Renderer = fill, exactCode?: unknown, siteSide = false): string {
    const allMatches = matchingRules(procedure, qmap, exactCode)
    const matches = allMatches.filter((rule) => !rule.preserve)
    const values = { ...vars }
    const isCartilage = Object.hasOwn(values, '회차')
    const template = isCartilage ? text(template0) : withDrugSlot(text(template0))
    if (template.includes('{레벨}') && values['레벨'] === undefined) values['레벨'] = levelOf(procedure) || '[레벨 확인]'
    if (/\{(?:코드|처방명)\}/.test(template)) {
      const found = procedureCodeVars(procedure, qmap, exactCode)
      for (const key of ['코드', '처방명'] as const) if (values[key] === undefined) values[key] = found[key] || ''
    }
    if (isCartilage) return cartilageText(template, values, allMatches, renderer)
    if (allMatches.some((rule) => rule.procedureType === 'level' && rule.preserve && !rule.conflict)) {
      const sides = sideTokens(procedure)
      values['좌우'] = template.includes('{시술}') ? '' : sides.length === 1 ? sides[0] : ''
    }
    if (matches.length) {
      const others = segProcNames(text(procedure)).filter((name) => !matches.some((rule) => rule.names.some((alias) => alias.toUpperCase() === name.toUpperCase())))
      if (!others.length) {
        const sides = new Set(matches.map((rule) => rule.side))
        values['좌우'] = matches.some((rule) => rule.procedureType === 'level') ? '' : sides.size === 1 ? [...sides][0] : ''
        if (values['부위'] && !siteSide) values['부위'] = text(values['부위']).replace(new RegExp(`^\\s*${SIDE_WORD}\\s*`, 'i'), '')
      }
    }
    const charted = sideTokens(procedure)
    const ruled = ({ rt: 'Rt', right: 'Rt', 우측: 'Rt', lt: 'Lt', left: 'Lt', 좌측: 'Lt', both: 'both', 양측: 'both', 양쪽: 'both' } as Record<string, string>)[text(values['좌우']).trim().toLowerCase()] || ''
    const direction = matches.length ? ruled : ruled || (charted.length === 1 ? charted[0] : '')
    const held: Record<string, string> = { 한글방향: ({ Rt: '우측', Lt: '좌측', both: '양측' } as Record<string, string>)[direction] || '', 영문방향: direction }
    const markers: [string, string][] = []
    let shaped = template
    for (const [key, value] of Object.entries(held)) {
      if (!shaped.includes(`{${key}}`)) continue
      const marker = `\uE720${markers.length}\uE721`
      markers.push([marker, value])
      shaped = shaped.split(`{${key}}`).join(marker)
    }
    const rendered = renderer(shaped, values)
    const sitedSide = siteSide && sideTokens(values['부위']).length > 0
    let output = quantitySideText(rendered, qmap, exactCode, !markers.length && !sitedSide)
    const counts = (value: string) => {
      const found: Record<string, number> = {}
      for (const word of text(value).match(/\b(?:both|Rt|Lt)\b/gi) || []) {
        const key = word.toLowerCase()
        found[key] = (found[key] || 0) + 1
      }
      return found
    }
    const before = counts(rendered)
    const after = counts(output)
    if (Object.keys(after).some((key) => after[key] > (before[key] || 0) && (before[key] || 0) > 0)) output = quantitySideText(rendered, qmap, exactCode, false)
    if (markers.length) output = output.replace(/(^|[^A-Za-z가-힣])(?:\b(?:both|Rt|Lt|right|left)\b|양측|양쪽|우측|좌측)(?=$|[^A-Za-z가-힣])/gi, '$1')
    for (const [marker, value] of markers) output = output.split(marker).join(value)
    output = output.replace(/\s{2,}/g, ' ')
    if (!markers.length && !sitedSide && output.trim() && matches.length && matches.every((rule) => rule.side === 'both') && !/\bboth\b|양측/i.test(output)) output += ' both'
    return output.trim()
  }

  // ── 표기 ───────────────────────────────────────────────

  const markOf = () => (TPL.mark == null ? '◈' : String(TPL.mark))
  const gapify = (t: string) => t
  const fixedPhrases = () => (Array.isArray(TPL.fixedPhrases) ? TPL.fixedPhrases : FIXED_FALLBACK)
  function siteName(rg: string | null | undefined, fallback?: string): string {
    const names = TPL.siteNames && typeof TPL.siteNames === 'object' ? TPL.siteNames : SITE_FALLBACK
    return rg && Object.hasOwn(names, rg) ? String(names[rg]) : fallback || ''
  }

  let FILL_VISIT: MemoVisit | null = null
  /** 이번 글에서 {약제}가 있는 틀을 썼나(없으면 약 자리를 {시술} 뒤로 잡는다) */
  let drugTokenUsed = false

  /** 원본 fill: 문구 틀의 말 채우기. 모르는 말은 그대로 둔다(AC-014.2) */
  function fill(tpl: unknown, vars: Record<string, unknown>): string {
    let t = String(tpl || '')
    if (t.includes('{약제}')) drugTokenUsed = true
    const side = sideKey(vars['좌우'])
    const extra: Record<string, unknown> = { 한글방향: ({ Rt: '우측', Lt: '좌측', both: '양측' } as Record<string, string>)[side] || '', 영문방향: side }
    // 연골주사 날에는 틀이 {약제}를 스스로 채우지 않는다: 그날 일반 약은 일반 IA 줄(araEtcLine이 약제를 넘김)에만 놓이거나 [약 확인]으로 남는다(AC-3001.3).
    // 연골주사·부위별·Peripheral·시술 이름별·코드별 메모 문구 어느 틀로 와도 같다
    if (!Object.hasOwn(vars, '약제') && FILL_VISIT) extra['약제'] = iaKind(FILL_VISIT) === 'ara' ? '' : drugTxt(FILL_VISIT)
    fixedPhrases().forEach((p) => {
      if (p && p.token) extra[p.token] = p.on === false ? '' : String(p.text || '')
    })
    Object.entries({ ...extra, ...vars }).forEach(([k, val]) => {
      t = t.split(`{${k}}`).join(val == null ? '' : String(val))
    })
    ;[...TEMPLATE_TOKENS, '시술목록', '회차', 'KL1', 'KL2', '투여량', '코드', '처방명', '표기', '골절'].forEach((k) => {
      t = t.split(`{${k}}`).join('')
    })
    return t.replace(/\s{2,}/g, ' ').replace(/\s+([.,)])/g, '$1').replace(/,\s*\./g, '.').replace(/\(\s*\)/g, '').trim()
  }

  function applyRename(t: unknown): string {
    let s = String(t || '')
    String(TPL.rename || '').split(/\n/).forEach((line) => {
      const p = line.split(/\s*(?:>|→|=>|->)\s*/)
      if (p.length < 2) return
      const from = p[0].trim()
      const to = p.slice(1).join(' > ').trim()
      if (!from) return
      const body = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]*')
      const head = /[A-Za-z0-9가-힣]/.test(from[0]) ? '\\b' : ''
      const tail = /[A-Za-z0-9가-힣]/.test(from[from.length - 1]) ? '\\b' : ''
      try {
        s = s.replace(new RegExp(head + body + tail, 'gi'), to)
      } catch {
        // 원본처럼 틀린 표기는 건너뛴다
      }
    })
    return s.replace(/\s{2,}/g, ' ').trim()
  }

  function icnbSideOf(v: Pick<MemoVisit, 'segAll' | 'lines'>): string {
    const segments = (v.segAll || []).map((s) => s.t).filter((t) => /\bICNB\b/i.test(t))
    const explicit = [...new Set(segments.flatMap(sideTokens))]
    if (explicit.length) return explicit.length === 1 ? explicit[0] : ''
    const context = (v.lines || []).filter((t) => /\brib\b|늑골|늑간|\bchest\b|흉부/i.test(t))
    const sides = [...new Set(context.flatMap(sideTokens))]
    return sides.length === 1 ? sides[0] : ''
  }
  const icnbSideShown = () => {
    const codes = Object.keys(CODEMAP).filter((code) => entry(code)?.k === 'proc' && /^ICNB$/i.test(text(entry(code)?.n)))
    return !codes.length || codes.some((code) => sidePolicy(code).enabled)
  }
  function icnbFix(value: unknown, contextSide: string | undefined): string {
    const raw = text(value)
    if (!TPL.icnb || !/\bICNB\b/i.test(raw)) return raw
    const shown = icnbSideShown()
    const ownSides = sideTokens(raw)
    const side = ownSides.length === 1 ? ownSides[0] : ownSides.length ? '' : contextSide || ''
    if (/\b\d+\s*levels?\b|\d+\s*레벨|\b[CT]\d+\b/i.test(raw)) return raw
    const replacement = fill(TPL.icnb, { 좌우: shown ? side || '[좌우 확인]' : '' })
    return raw.replace(/(?:\b(?:both|Rt|Lt|right|left)\s+|(?:우측|좌측|양측|양쪽)\s*)?\bICNB\b(?:\s+(?:both|Rt|Lt|right|left)\b|\s*(?:우측|좌측|양측|양쪽))?/gi, () => replacement).replace(/\s{2,}/g, ' ').trim()
  }

  // ── 시술 줄 문구 고르기 ─────────────────────────────────

  const procNameRe = new Map<string, RegExp>()
  function procNamed(name: unknown, up: string): boolean {
    const n = String(name || '').trim().toUpperCase()
    if (!n) return false
    if (!procNameRe.has(n)) procNameRe.set(n, new RegExp(`(^|[^A-Z0-9])${reEsc(n)}([^A-Z0-9]|$)`))
    return procNameRe.get(n)!.test(up)
  }
  function procPool(qmap: QuantityMap | null | undefined): string[] {
    const pool = qmap && qmap.__nmSideRows && qmap.__nmSideRows.length
      ? qmap.__nmSideRows.map((r) => r.code)
      : qmap
        ? Object.keys(CODEMAP).filter((c) => CODEMAP[c] && Object.hasOwn(qmap, String(CODEMAP[c].n || '').trim().toUpperCase()))
        : []
    return pool.length ? pool : Object.keys(CODEMAP)
  }
  function isCentralProc(p: unknown, qmap: QuantityMap | null | undefined): boolean {
    const central = codeSet(TPL.mainCentralCodes ?? 'LA321, LA323, LA326, LA354, LA356, LA357, LA358, LA359')
    if (!central.size) return false
    const up = String(p || '').toUpperCase()
    return procPool(qmap).some((code) => {
      const row = hasCode(code) ? CODEMAP[code] : null
      if (!row || row.k !== 'proc') return false
      const base = String(procedureBase(code) || row.standardCode || code).toUpperCase()
      return (central.has(base) || central.has(String(code).toUpperCase())) && (procNamed(row.n, up) || procNamed(row.templateKey, up))
    })
  }
  const mainTpl = (p: unknown, qmap: QuantityMap | null | undefined) => (isCentralProc(p, qmap) ? TPL.mainCentral : TPL.mainPeripheral) ?? TPL.main
  function tplForProc(p: unknown, rg: string | null | undefined, qmap: QuantityMap | null | undefined): string | undefined {
    const upperP = String(p || '').toUpperCase()
    const byP = TPL.byProc || {}
    for (const [, row] of entries) {
      if (row.k !== 'proc' || !row.templateKey || !Object.hasOwn(byP, row.templateKey)) continue
      if (new RegExp(`(^|[^A-Z0-9])${reEsc(String(row.n).toUpperCase())}([^A-Z0-9]|$)`).test(upperP)) return byP[row.templateKey]
    }
    const keys = Object.keys(byP).filter((k) => String(k).trim()).sort((a, b) => b.length - a.length)
    for (const k of keys) {
      if (new RegExp(`(^|[^A-Z0-9])${reEsc(k.toUpperCase())}([^A-Z0-9]|$)`).test(upperP)) return byP[k]
    }
    return (rg && TPL.byRegion && Object.hasOwn(TPL.byRegion, rg) && TPL.byRegion[rg]) || mainTpl(p, qmap)
  }

  // ── 분석(원본 analyze·rebuildMemos·buildMemo) ─────────────────────────

  type Working = Visit & Partial<MemoVisit>

  function applyChartContextDirections(v: Working) {
    const prescribed = v.rx
    const eligible = ([code, row]: [string, MemoCode | null]) => row?.k === 'proc' && row.pendingReview !== true && procedureType(code) === 'level' && sidePolicy(code).enabled
    const namesOf = (rows: [string, MemoCode | null][]) => [...new Set(rows.filter(eligible).map(([, row]) => row!.n))]
    const levelNames = prescribed.length ? namesOf(prescribed.map((item) => [item.code, entry(item.code)])) : namesOf(procedureRows)
    for (const segment of v.segAll || []) {
      if (segment.sourceText === undefined) segment.sourceText = segment.t
      segment.t = segment.sourceText
      const names = levelNames.filter((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])`, 'i').test(segment.t))
      if (!names.length || !segment.rg || !hasNamedLevels(segment.t, names)) continue
      const contexts = (v.items || []).filter((item) => item.rg === segment.rg && ['dx', 'subj', 'exam'].includes(item.k))
      const contextSides = [...new Set(contexts.flatMap((item) => sideTokens(item.t)))]
      if (sideTokens(segment.t).length) continue
      if (contextSides.length === 1) segment.t += ` ${contextSides[0]}`
    }
  }

  function buildMemoOf(v: Working, rg: string): MemoParts {
    const ko = REGION.find((r) => r[0] === rg)![1]
    const items = v.items || []
    const pick = (k: string) => items.filter((i) => i.k === k && i.rg === rg)
    const segAll = v.segAll || []
    const procs = segAll.filter((s) => s.rg === rg)
    const exams = pick('exam')
    const imgs = pick('img')
    const dxs = items.filter((i) => i.k === 'dx' && i.rg === rg)
    const side = procs.map((i) => i.sd).find(Boolean) || dxs.map((i) => i.sd).find(Boolean)
    const isCerv = rg === 'cervical'
    const headTxt = isCerv ? '후경부 통증' : `${side ? `${side} ` : ''}${ko} 통증`
    const examTxt = exams.map((i) => i.t.trim())
    const kl = dxs.map((i) => klOf(i.t)).find(Boolean)
    const klN = (kl || '').match(/(\d)\s*\/\s*(\d)/)
    const klTxt = rg === 'knee' && kl ? `(${kl})` : ''
    const omissions = dictionary.omissions
    const RX_HIDE = /\b(root|epi)\b/i
    const hasCxMBB = segAll.some((x) => x.rg === 'cervical' && /MBB/i.test(x.t))
    const dropANB = (t: string) =>
      omissions.dropShoulderAnbWithCervicalMbb === true && rg === 'shoulder' && hasCxMBB
        ? t.replace(/\bANB\b/gi, '').replace(/[,，]\s*(?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ').replace(/[,，\s]+$/, '').trim()
        : t
    const hideTok = (t: string) => t.replace(/(?:\b[CLT]\s*-\s*)?\b(?:root|epi)\b/gi, '').replace(/[,，]\s*(?=[,，]|$)/g, '').replace(/^[\s,，/]+|[\s,，/]+$/g, '').replace(/\s{2,}/g, ' ').trim()
    let benSegs = procs
      .map((s) => cleanKo(stripNonBen(s.t)))
      .filter((t) => t && !RX_NONBEN.test(t))
      .map((t) => (omissions.dropRootEpi === true && RX_HIDE.test(t) && !hasExplicitLevelProcedure(t) ? hideTok(t) : t))
      .filter((t) => t && !/^(?:both|rt|lt|right|left|양측|우측|좌측)$/i.test(t))
      .map((t) => distSide(expandAek(dropANB(t))))
      .filter(Boolean)
    const rxNames = v.rxNames
    if (rxNames) benSegs = benSegs.map((t) => filterByRx(t, rxNames)).filter(Boolean)
    const ik = iaKind(v)
    if (ik === 'ara' || (ik === 'etc' && TPL.iaEtc)) {
      benSegs = benSegs
        .map((t) => t.replace(/(?:\b(?:both|Both|BOTH|Rt|RT|Lt|LT)\s+)?\bIA\b(?:\s*(?:both|Both|BOTH|Rt|RT|Lt|LT))?/g, '').replace(/\s{2,}/g, ' ').replace(/^[/,\s]+|[/,\s]+$/g, '').trim())
        .filter((t) => t && RX_PROC.test(t))
    }
    const dropped = procs.map((s) => s.t.trim()).filter((t) => RX_NONBEN.test(t))
    let snbSide: string | null = null
    let snbSeg: string | null = null
    benSegs = benSegs
      .map((t) => {
        if (rg !== 'lumbar' || TPL.splitSnb === false) return t
        if (!/\bSNB\b/.test(t)) return t
        const SD = '(both|Both|BOTH|Rt|RT|Lt|LT)'
        const SN_T = new RegExp(`\\s*\\bSNB\\b\\s*${SD}`)
        const SN_L = new RegExp(`^${SD}\\s+\\bSNB\\b`)
        const SN_B = /\s*\bSNB\b/
        let raw = ''
        let rest = t
        let m = t.match(SN_T)
        if (m) {
          raw = m[1]
          rest = t.replace(SN_T, '')
        } else if ((m = t.match(SN_L))) {
          raw = m[1]
          rest = t.replace(SN_L, '')
        } else rest = t.replace(SN_B, '')
        rest = rest.replace(/\s{2,}/g, ' ').replace(/^[/,\s]+|[/,\s]+$/g, '').trim()
        if (new RegExp(`^${SD}$`).test(rest)) rest = ''
        snbSide = /both/i.test(raw) ? '양측' : /rt/i.test(raw) ? '우측' : /lt/i.test(raw) ? '좌측' : side || '양측'
        snbSeg = sideFix(`SNB ${raw || 'both'}`.trim(), v.rxQty)
        return rest
      })
      .filter(Boolean)
    const splitCpb = TPL.splitCpb !== false
    const cpbSegs = splitCpb ? benSegs.filter((t) => /\bCPB\b/i.test(t)) : []
    const mainSegs = splitCpb ? benSegs.filter((t) => !/\bCPB\b/i.test(t)) : benSegs.slice()
    return {
      rg,
      ko,
      side,
      headTxt,
      examTxt,
      procTxt: mainSegs.join(' / '),
      procList: mainSegs.slice(),
      cpbTxt: cpbSegs.join(' / '),
      snbSide,
      snbSeg,
      dropped,
      klTxt,
      araV: ik === 'ara',
      rxQty: v.rxQty || null,
      icnbSide: icnbSideOf({ segAll, lines: v.lines }),
      kl1: klN ? klN[1] : null,
      kl2: klN ? klN[2] : null,
      dxKo: dxs.map((i) => dxKo(i.t)).find(Boolean),
      dur: durOf(items.filter((i) => i.k === 'subj').map((i) => i.t)),
      imgTxt: imgs.map((i) => `${imgSrc(i.t)}상 ${imgKo(i.t)}`).join(', '),
    }
  }

  function rebuildMemos(v: Working) {
    applyChartContextDirections(v)
    const segAll = v.segAll || []
    const finalRgs = [...new Set(segAll.map((s) => s.rg).filter((x): x is string => !!x))]
    let memos = finalRgs.map((rg) => buildMemoOf(v, rg))
    const cx = memos.find((m) => m.rg === 'cervical' && /MBB/i.test(m.procTxt))
    const sh = memos.find((m) => m.rg === 'shoulder' && /SSNB/i.test(m.procTxt))
    if (cx && sh) {
      const merged: MemoParts = {
        rg: 'cx_sh',
        ko: '경추부 + 견관절',
        side: sh.side,
        sub: [cx, sh],
        procTxt: [cx.procTxt, sh.procTxt].filter(Boolean).join(' / '),
        klTxt: '',
        dropped: [...cx.dropped, ...sh.dropped],
      }
      memos = [merged, ...memos.filter((m) => m !== cx && m !== sh)]
    }
    memos = memos.filter((m) => m.procTxt || m.cpbTxt || (m.sub && m.sub.some((x) => x.procTxt || x.cpbTxt)))
    const rxNames = v.rxNames
    const lines = segAll
      .filter((segment) => !segment.rg && hasNumericProcedure(segment.t) && explicitLevel(segment.t))
      .map((segment) => segment.t)
      .filter((line) => !rxNames || segProcNames(line).some((name) => rxNames.has(name)) || [...rxNames].some((name) => line.includes(name)))
    if (lines.length) {
      memos.push({ rg: 'unassigned_level', ko: '[부위 확인]', side: null, headTxt: '', examTxt: [], procTxt: lines.join(' / '), procList: lines, cpbTxt: '', snbSide: null, snbSeg: null, dropped: [], klTxt: '', araV: false, rxQty: v.rxQty || null, icnbSide: icnbSideOf({ segAll, lines: v.lines }), kl1: null, kl2: null })
    }
    v.memos = memos
  }

  function analyze(visit: Visit): Working {
    const v: Working = { ...visit }
    const items: MemoItem[] = visit.lines.map((raw, idx) => {
      const t = normalizeAnalyzedLine(raw)
      const hint = visit.hints[idx] || null
      const k = lineKind(t, hint)
      const it: MemoItem = { t, raw, k, rg: regionOf(t), sd: sideOf(t), hint }
      if (k === 'proc') it.segs = splitProc(t)
      return it
    })
    items.forEach((it, idx) => {
      if (it.rg || !['exam', 'img'].includes(it.k)) return
      for (let d = 1; d < items.length; d++) {
        const b = items[idx - d]
        const f = items[idx + d]
        if (b && b.rg) {
          it.rg = b.rg
          it.inherit = true
          break
        }
        if (f && f.rg) {
          it.rg = f.rg
          it.inherit = true
          break
        }
      }
    })
    const segAll: MemoSegment[] = items.filter((i) => i.k === 'proc').flatMap((i) => i.segs || [])
    const rgs = [...new Set(segAll.map((s) => s.rg).filter((x): x is string => !!x))]
    const orphanSegs = segAll.filter((s) => !s.rg)
    if (orphanSegs.length) {
      const dxr = [...new Set(items.filter((i) => i.k === 'dx' && i.rg).map((i) => i.rg as string))]
      if (rgs.length === 1) orphanSegs.forEach((s) => (s.rg = rgs[0]))
      else if (!rgs.length && dxr.length === 1) {
        orphanSegs.forEach((s) => (s.rg = dxr[0]))
        rgs.push(dxr[0])
      } else if (rgs.length > 1) orphanSegs.forEach((s) => (s.rg = rgs[0]))
      else if (!rgs.length && dxr.length) {
        orphanSegs.forEach((s) => (s.rg = dxr[0]))
        rgs.push(dxr[0])
      }
    }
    const dxRg = new Set(items.filter((i) => i.k === 'dx' && i.rg).map((i) => i.rg as string))
    segAll.filter((s) => !s.rg || s.rg === 'lumbar').forEach((s) => {
      if (!/\bFNB\b|\bSNB\b|\bIA\b|아라간/i.test(s.t)) return
      if (/MBB/i.test(s.t)) return
      const pref = ['knee', 'ankle', 'foot'].find((r) => dxRg.has(r))
      if (pref) s.rg = pref
    })
    segAll.filter((s) => s.rg === 'upper').forEach((s) => {
      const pref = ['wrist', 'hand', 'elbow', 'shoulder'].find((r) => dxRg.has(r))
      if (pref) s.rg = pref
    })
    v.items = items
    v.segAll = segAll
    rebuildMemos(v)
    return v
  }

  // ── 처방(원본 applyRx·iaKind) ──────────────────────────────

  function isCartilageDrug(row: Pick<RxLine, 'code' | 'name'>): boolean {
    const registered = cm(row.code)
    if (registered && registered.k !== 'drug') return false
    if (registered && typeof registered.cartilage === 'boolean') return registered.cartilage
    return CARTILAGE_NAME.test(String((registered && registered.n) || '')) || CARTILAGE_NAME.test(String(row.name || ''))
  }
  const rxHasAra = (v: Pick<Visit, 'rx'>) => v.rx.some(isCartilageDrug)
  function araInChart(v: Working): boolean {
    const t = [
      ...(v.items || []).map((i) => i.t),
      ...(v.segAll || []).map((s) => s.t),
      ...(v.memos || []).flatMap((m) => [m.procTxt, (m.procList || []).join(' '), ...(m.sub ? m.sub.map((x) => [x.procTxt, (x.procList || []).join(' ')].join(' ')) : [])]),
    ].join(' ')
    return /아라간/.test(t)
  }
  function iaKind(v: Working): 'ara' | 'etc' | null {
    if (!v.rx.some((x) => upper(x.code) === 'KK090')) return null
    return rxHasAra(v) || araInChart(v) ? 'ara' : 'etc'
  }

  function applyRx(v: Working) {
    v.rxAdd = []
    v.rxNone = false
    v.rxNames = null
    v.rxQty = null
    v.shortItv = null
    const list = v.rx
    if (!list.length) v.rxNone = true
    else {
      const names = new Set<string>()
      const qty = Object.create(null) as QuantityMap
      list.forEach(({ code, benefit, qty: q }) => {
        const o = cm(code)
        if (!o || o.k !== 'proc' || o.pendingReview === true || !o.n || !benefit) return
        names.add(o.n)
        addQuantity(qty, o.n, q, code)
      })
      v.rxNames = names
      v.rxQty = qty
    }
    if (v.segAll) rebuildMemos(v)
    const memos = v.memos!
    const rxNames = v.rxNames
    if (rxNames) {
      const esc2 = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const inMemo = memos.map((m) => [m.procTxt, m.cpbTxt, m.snbSeg, ...(m.sub ? m.sub.map((x) => `${x.procTxt} ${x.cpbTxt || ''} ${x.snbSeg || ''}`) : [])].join(' ')).join(' ')
      const segAll = v.segAll || []
      const chartTxt = segAll.map((s) => s.t).join(' ')
      const cxMBB = segAll.some((x) => x.rg === 'cervical' && /MBB/i.test(x.t))
      const onPurpose = (n: string) =>
        (dictionary.omissions.dropShoulderAnbWithCervicalMbb === true && n === 'ANB' && cxMBB && segAll.some((x) => x.rg === 'shoulder' && /\bANB\b/i.test(x.t))) ||
        segAll.some((x) => RX_NONBEN.test(x.t) && new RegExp(`\\b${esc2(n)}\\b`, 'i').test(x.t))
      const hasName = (n: string) =>
        n === 'IA' ? /\bIA\b/i.test(inMemo) || /아라간/.test(inMemo) || /아라간/.test(chartTxt) : new RegExp(`(^|[^A-Z0-9가-힣])${esc2(n)}(?![A-Z0-9가-힣])`, 'i').test(inMemo) || onPurpose(n)
      const seen = new Set<string>()
      v.rx.forEach(({ code, benefit, qty }) => {
        const o = cm(code)
        if (!o || o.k !== 'proc' || !o.n || !benefit) return
        if (seen.has(o.n)) return
        seen.add(o.n)
        if (hasName(o.n)) return
        if (o.add === false) return
        let rg = o.rg
        if (!rg) {
          const rgs = [...new Set(memos.flatMap((m) => (m.sub ? m.sub.map((x) => x.rg) : [m.rg])))]
          if (rgs.length === 1) rg = rgs[0]
          else if (!rgs.length) {
            const dxr = [...new Set((v.items || []).filter((i) => i.k === 'dx' && i.rg).map((i) => i.rg as string))]
            if (dxr.length === 1) rg = dxr[0]
          }
        }
        v.rxAdd!.push({ name: o.n, rg, code, qty })
      })
    }
    if (memos.length) return
    if (!(v.rxAdd.length || iaLinesOf(v as MemoVisit, true).length || noteLines(v as MemoVisit).length)) return
    const rgs = [...new Set(v.rxAdd.map((a) => a.rg).filter((x): x is string => !!x))]
    const RGKO = Object.fromEntries(REGION.map(([k, ko]) => [k, ko]))
    v.memos = [{ rg: 'rx', rxOnly: true, ko: rgs.length ? rgs.map((r) => RGKO[r]).join(' · ') : '처방내역', side: null, headTxt: '', examTxt: [], procTxt: '', procList: [], cpbTxt: '', snbSide: null, snbSeg: null, dropped: [], klTxt: '', araV: false, rxQty: v.rxQty, icnbSide: undefined, kl1: null, kl2: null }]
  }

  function prepareVisit(visit: Visit): MemoVisit {
    const v = analyze(visit)
    applyRx(v)
    return v as MemoVisit
  }

  /** 원본 computeIntervals(hospital-code-rules가 덮어쓴 판, AC-014.6): 읽은 기간 전체의 급여 처방으로 본다. 12개월 이력은 보지 않는다 */
  function computeIntervals(month: Pick<ClaimMonth, 'rxByDay'>, visits: MemoVisit[]) {
    const intervalCodes = String(TPL.intervalCodes ?? 'LA358, KK090').toUpperCase().split(/[\s,]+/).filter(Boolean)
    const limit = Number.isInteger(TPL.intervalDays) && TPL.intervalDays! > 0 ? TPL.intervalDays! : 7
    const sites = new Map<string, Set<string>>()
    for (const visit of visits) {
      visit.shortItv = null
      const t = (visit.segAll || []).map((row) => row.t).join(' ')
      const set = new Set<string>()
      if (/C-?MBB/i.test(t)) set.add('MBB C')
      if (/MBB\s*L/i.test(t)) set.add('MBB L')
      if (set.size) sites.set(`${visit.chart}|${visit.date}`, set)
    }
    const siteOfKey = (key: string) => {
      const set = sites.get(key)
      return set ? [...set] : null
    }
    const history = new Map<string, Map<string, string[]>>()
    for (const [chart, days] of month.rxByDay) {
      for (const [date, list] of days) {
        for (const row of list) {
          if (row.benefit === false) continue
          const code = procedureBase(row.code)
          if (!intervalCodes.includes(code)) continue
          const byCode = history.get(chart) ?? new Map<string, string[]>()
          const dates = byCode.get(code) ?? []
          dates.push(date)
          byCode.set(code, dates)
          history.set(chart, byCode)
        }
      }
    }
    for (const byCode of history.values()) for (const [code, dates] of byCode) byCode.set(code, [...new Set(dates)].sort())
    for (const visit of visits) {
      const past = history.get(visit.chart)
      if (!past) continue
      for (const [code, dates] of past) {
        if (!dates.includes(visit.date)) continue
        const currentSite = code === 'LA358' ? siteOfKey(`${visit.chart}|${visit.date}`) : null
        for (const previous of dates.filter((date) => date < visit.date).reverse()) {
          const previousSite = code === 'LA358' ? siteOfKey(`${visit.chart}|${previous}`) : null
          if (currentSite && previousSite && !previousSite.some((value) => currentSite.includes(value))) continue
          const days = dayDiff(previous, visit.date)
          if (days <= limit && !(visit.shortItv && visit.shortItv.d <= days)) {
            visit.shortItv = {
              nm: code === 'LA358' ? (currentSite?.length === 1 ? currentSite[0] : 'MBB') : code === 'KK090' ? 'IA' : String(cm(code)?.n || code),
              code,
              d: days,
              prev: previous,
              src: '처방',
              lim: limit,
              steroid: false,
              exact: code !== 'LA358' || !!(currentSite && previousSite),
            }
          }
          break
        }
      }
    }
  }

  function analyzeMonth(month: Pick<ClaimMonth, 'visits' | 'rxByDay'>): MemoVisit[] {
    const visits = month.visits.map(prepareVisit)
    computeIntervals(month, visits)
    return visits
  }

  // ── 약 규칙(design.md 19-4, 원본과 일부러 다르다) ───────────────────────

  // 표시는 늘 한 줄이다: unfinished 정규식은 줄을 넘지 않아 줄이 나뉘면 표시가 있어도 입력 대상이 된다(AC-014.12). 이름의 줄바꿈은 원본 검사를 지나므로(AC-014.3) 여기서 편다
  const drugCheck = (name: string) => `[약 확인: ${name.replace(/\s+/g, ' ').trim()}]`
  const planCache = new WeakMap<object, DrugPlan>()
  const choiceOf = (proc: string, name: string): DrugChoice | undefined => {
    const drugs = phrases.procedureDrugs
    return Object.hasOwn(drugs, proc) && Object.hasOwn(drugs[proc], name) ? drugs[proc][name] : undefined
  }

  /** 둘 이상인 날: 넣기인 시술이 딱 하나이고 나머지가 모두 빼기면 그 시술(REQ-3002). 하나라도 안 정했거나 넣기가 둘 이상이면 없다 */
  function soleOwner(keys: string[], choices: (DrugChoice | undefined)[]): string | null {
    if (phrases.memoRules?.singleOwnerDrug === false) return null
    if (!choices.every((choice) => choice?.use === 'include' || choice?.use === 'exclude')) return null
    const owners = keys.filter((_, index) => choices[index]!.use === 'include')
    return owners.length === 1 ? owners[0] : null
  }

  /**
   * 그날 처방의 약을 시술별 약 설정으로 나눈다. 시술 종류가 0이면 약 글도 표시도 없다(AC-014.14). 부위 메모가 없는 날도 쓸 줄이 없어 원본처럼 빈 글이다(AC-014.5).
   * 하나: 넣기는 자리에, 빼기는 빼고, 안 정했으면 표시. 둘 이상: 모두 빼기면 빼고, 넣기인 시술이 하나뿐이면 그 시술 줄에(owner, REQ-3002), 나머지는 표시(AC-3002.2).
   * memoRules.singleOwnerDrug가 false면 옛 규칙(AC-014.10)대로 둘 이상인 날은 자동으로 넣지 않는다(AC-3002.5).
   * 설정에 적힌 값만 본다. 이름·역할로 짐작하지 않는다(AC-014.9)
   */
  function drugPlan(v: MemoVisit): DrugPlan {
    const cached = planCache.get(v)
    if (cached) return cached
    const plan: DrugPlan = { decisions: new Map(), afterProc: [], afterEnding: [], ownLine: [], checks: [] }
    const keys = [...procKeys(v)]
    if (keys.length && v.memos.length) {
      const ara = iaKind(v) === 'ara'
      for (const row of v.rx) {
        const o = cm(row.code)
        if (!o || o.k !== 'drug' || !o.n) continue
        const name = o.n
        let decision = plan.decisions.get(name)
        if (!decision) {
          const choices = keys.map((key) => choiceOf(key, name))
          if (keys.length === 1) {
            const [choice] = choices
            decision = !choice ? { use: 'check' } : choice.use === 'exclude' ? { use: 'exclude' } : { use: 'include', place: choice.place ?? 'afterProc' }
          } else if (choices.every((choice) => choice?.use === 'exclude')) decision = { use: 'exclude' }
          else {
            const owner = soleOwner(keys, choices)
            decision = owner ? { use: 'include', place: choiceOf(owner, name)!.place ?? 'afterProc', owner } : { use: 'check' }
          }
          plan.decisions.set(name, decision)
          if (decision.use === 'check') plan.checks.push(drugCheck(name))
        }
        if (decision.use !== 'include') continue
        const label = (keys.length === 1 && choiceOf(keys[0], name)?.label) || (decision.owner && choiceOf(decision.owner, name)?.label) || name
        const item: DrugItem = { name: label, qty: row.qty, drug: name, ...(decision.owner ? { owner: decision.owner } : {}), ...(isCartilageDrug(row) ? { cartilage: true } : {}) }
        if (decision.place === 'afterEnding') plan.afterEnding.push(item)
        else if (decision.place === 'ownLine') plan.ownLine.push(item)
        else if (!(ara && isCartilageDrug(row))) plan.afterProc.push(item)
      }
    }
    planCache.set(v, plan)
    return plan
  }
  /**
   * 연골주사 줄을 쓰는가. 그 줄은 시술 줄이고 넣기·빼기는 약 이름만 정한다(clinic-memo-samples.md 보기 1: 연골주사약 처음 값이 빼기여도 줄을 쓴다).
   * 아직 안 정한 약만 줄 대신 [약 확인]을 남긴다(AC-014.9·AC-014.10). 코드 표의 약이 아니면 약 규칙 대상이 아니라 원본대로 쓴다
   */
  function cartilageWritten(v: MemoVisit, row: Pick<RxLine, 'code'>): boolean {
    const o = cm(row.code)
    if (!o || o.k !== 'drug' || !o.n) return true
    const decision = drugPlan(v).decisions.get(o.n)
    return !decision || decision.use !== 'check'
  }
  /** 처방의 연골주사약이 모두 아직 안 정한 약이라 차트의 연골주사 줄도 쓰지 않는 날 */
  function cartilageHeld(v: MemoVisit): boolean {
    const drugs = cartilageDrugs(v)
    return drugs.length > 0 && !drugs.some((row) => cartilageWritten(v, row))
  }

  function drugNames(items: DrugItem[]): string[] {
    const merged = new Map<string, number>()
    items.forEach(({ name, qty }) => {
      if (name) merged.set(name, (merged.get(name) || 0) + (Number(qty) || 0))
    })
    return [...merged].map(([name, qty]) => (TPL.drugQty === true && qty ? `${name} ${+qty.toFixed(3)}${String(TPL.drugUnit || '')}` : name))
  }
  /** 원본 formatDrugs: 괄호로 묶기(기본) 또는 괄호 없이 · 투여량과 단위 붙이기 */
  function formatDrugs(items: DrugItem[]): string {
    const list = drugNames(items)
    if (!list.length) return ''
    return TPL.drugWrap === 'plain' ? ` ${list.join(', ')}` : `(${list.join(', ')})`
  }
  /** 주인 없는 약(시술 하나인 날). 이 약만 틀의 {약제}·첫 시술 줄 자리에 들어간다 */
  const free = (items: DrugItem[]) => items.filter((item) => !item.owner)
  const ownedBy = (items: DrugItem[], key: string) => items.filter((item) => item.owner === key)
  const drugTxt = (v: MemoVisit) => formatDrugs(free(drugPlan(v).afterProc))
  /** IA 줄에 놓을 연골주사 아닌 약: 시술 하나인 날의 afterProc, 또는 주인이 KK090인 약(자리 무관) */
  function iaBound(plan: DrugPlan): DrugItem[] {
    const owned = [...plan.afterProc, ...plan.afterEnding, ...plan.ownLine].filter((item) => item.owner === 'KK090' && !item.cartilage)
    return [...free(plan.afterProc), ...owned]
  }
  /** 무릎 세트 날(FNB·SNB + IA)에 IA 줄을 생략하는가. kneeSetIaWithDrug가 참이고 IA 줄에 놓을 약이 있으면 쓴다(AC-3003.2) */
  function kneeSetSkips(v: MemoVisit, raw: boolean): boolean {
    if (TPL.kneeSetSkipIa === false || !v.rx.some((x) => IA_SET_CODES.test(String(x.code)))) return false
    return raw || phrases.memoRules?.kneeSetIaWithDrug !== true || !iaBound(drugPlan(v)).length
  }

  // ── 부위 찾기(원본 siteOf. 수량은 부위 근거가 아니라 0으로 부른다) ─────────────

  function siteOf(v: Pick<MemoVisit, 'items' | 'memos'>, kw: RegExp | null, only: string[] | null, finger?: boolean): string {
    const items = v.items || []
    const hit = items.filter((i) => (kw && kw.test(i.raw || i.t)) || (kw && kw.test(i.t)))
    const pool = hit.length ? hit : items
    const ok = (rg: string | null | undefined): rg is string => !!rg && (!only || only.includes(rg))
    let rgs = [...new Set(pool.map((i) => i.rg).filter(ok))]
    if (!rgs.length) rgs = [...new Set(items.filter((i) => i.k === 'dx' || i.k === 'proc').map((i) => i.rg).filter(ok))]
    if (!rgs.length) rgs = [...new Set((v.memos || []).flatMap((m) => (m.sub ? m.sub.map((x) => x.rg) : [m.rg])).filter(ok))]
    if (!rgs.length) rgs = [...new Set(items.map((i) => i.rg).filter(ok))]
    let fg: string | null = null
    if (finger) {
      for (const i of pool.concat(items)) {
        const f = FINGER_RE.find(([re]) => re.test(i.raw || i.t))
        if (f) {
          fg = f[1]
          break
        }
      }
    }
    if (!rgs.length && !fg) return ''
    const sideFor = (rg: string | undefined) => {
      const ls = pool.filter((i) => !rg || i.rg === rg).concat(items.filter((i) => i.rg === rg))
      let sd: string | null | undefined = null
      for (const i of pool.concat(items)) {
        for (const sg of i.segs || []) {
          if (rg && sg.rg && sg.rg !== rg) continue
          if (kw && !kw.test(sg.t)) continue
          if (sg.sd) {
            sd = sg.sd
            break
          }
        }
        if (sd) break
      }
      if (!sd) {
        const mixed = (i: MemoItem) => i.segs && new Set(i.segs.map((x) => x.sd).filter(Boolean)).size > 1
        sd = ls.filter((i) => !mixed(i)).map((i) => i.sd).find(Boolean)
      }
      if (sd) return Object.hasOwn(SIDE_EN, sd) ? SIDE_EN[sd] : sd
      return ''
    }
    if (fg) return [sideFor(rgs[0] || 'hand'), fg].filter(Boolean).join(' ')
    return rgs.map((rg) => [sideFor(rg), Object.hasOwn(RG_EN, rg) ? RG_EN[rg] : rg].filter(Boolean).join(' ')).join(', ')
  }

  // ── 연골주사(원본 claim-cartilage-rules) ──────────────────────────────

  function cartilageDrugs(v: Pick<Visit, 'rx'>): RxLine[] {
    const seen = new Set<string>()
    return v.rx.filter((row) => {
      const key = upper(row.code)
      if (!key || seen.has(key) || !isCartilageDrug(row)) return false
      seen.add(key)
      return true
    })
  }
  const ownTemplate = (row: Pick<RxLine, 'code'>) => String((cm(row.code) || ({} as MemoCode)).cartilageMemo || '').trim()
  const usesOwnTemplate = (v: Pick<Visit, 'rx'>) => cartilageDrugs(v).some((row) => !!ownTemplate(row))
  function mentions(body: string, value: unknown): boolean {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean)
    return !!words.length && new RegExp(`(?:^|[^A-Za-z0-9가-힣_.-])${words.map(codeEscape).join('\\s*')}(?=$|[^A-Za-z0-9가-힣_.-])`, 'i').test(body)
  }
  function matchedItems(v: Pick<MemoVisit, 'items'>, drug: RxLine, drugs: RxLine[]): MemoItem[] {
    return (v.items || []).filter((item) => {
      const body = String(item.raw || item.t || '')
      const owners = drugs.filter((row) => {
        const registered = cm(row.code) || ({} as MemoCode)
        return mentions(body, row.code) || [registered.n, row.name].filter((name) => typeof name === 'string' && name.trim().length > 1 && name.toUpperCase() !== String(row.code).toUpperCase()).some((name) => mentions(body, name))
      })
      return owners.length === 1 && String(owners[0].code).toUpperCase() === String(drug.code).toUpperCase()
    })
  }
  function hasChartCartilageLine(v: Pick<MemoVisit, 'memos'>): boolean {
    const has = (m: MemoParts): boolean => !m.rxOnly && ((m.procList || []).some((t) => /아라간/.test(t)) || (m.sub || []).some(has))
    return (v.memos || []).some(has)
  }
  function cartilageVars(v: MemoVisit, drug: RxLine | null): Record<string, string> {
    const registered = drug && (cm(drug.code) || ({} as MemoCode))
    const drugs = cartilageDrugs(v)
    const matched = drug ? matchedItems(v, drug, drugs) : []
    if (drug && drugs.length > 1 && !matched.length) {
      return { 좌우: '[좌우 확인]', 회차: '[회차 확인]', 부위: MISS_SITE, 약제: String(registered!.n || drug.name || drug.code), 코드: upper(drug.code) }
    }
    const relevant = matched.length ? matched : (v.items || []).filter((i) => CARTILAGE_NAME.test(i.raw || i.t || ''))
    const rounds = [...new Set(relevant.flatMap((i) => [...String(i.raw || i.t).matchAll(/(\d+)\s*(?:회차|차)/g)].map((m) => m[1])))]
    const site = siteOf(matched.length ? { ...v, items: matched, ...(drugs.length > 1 ? { memos: [] } : {}) } : v, matched.length ? null : /아라간|히알|하이알|hyal|연골\s*주사|\bIA\b|관절강|관절내/i, null, false)
    const sides = [...new Set(site.match(/\b(?:Rt|Lt|Both)\b/g) || [])]
    const evidence = [...new Set((matched.length ? matched : relevant).map((i) => sideOf(i.raw || i.t || '')).filter(Boolean))]
    const side = sides.length === 1 && evidence.length < 2 ? ({ Rt: '우측', Lt: '좌측', Both: '양측' } as Record<string, string>)[sides[0]] : '[좌우 확인]'
    return {
      좌우: side,
      회차: rounds.length === 1 ? rounds[0] : '[회차 확인]',
      부위: site.replace(/\b(?:Rt|Lt|Both)\s*/g, '').trim() || MISS_SITE,
      약제: drug ? String(registered!.n || drug.name || drug.code) : '',
      코드: drug ? upper(drug.code) : '',
    }
  }
  function cartilageLine(v: MemoVisit, raw: boolean): string[] {
    const drugs = cartilageDrugs(v)
    const custom = drugs.some((row) => !!ownTemplate(row))
    if (!custom && hasChartCartilageLine(v)) return []
    const out: string[] = []
    const seen = new Set<string>()
    for (const drug of drugs.length ? drugs : [null]) {
      // 아직 안 정한 약이면 줄 대신 [약 확인]을 남긴다(AC-014.9·AC-014.10). raw는 원본 그대로 줄이 있는지만 볼 때다
      if (!raw && drug && !cartilageWritten(v, drug)) continue
      let template = (drug && ownTemplate(drug)) || String(TPL.ara || '')
      if (!template.trim()) continue
      const vars = cartilageVars(v, drug)
      // 빼기인 약은 틀에 {약제}가 있어도 이름을 쓰지 않는다(AC-014.9). raw에서는 약 계획을 읽지 않는다: 분석 중에 읽으면 메모가 없는 계획이 캐시에 남는다
      if (!raw && drug && drugPlan(v).decisions.get(String(cm(drug.code)?.n))?.use === 'exclude') vars['약제'] = ''
      if (template === DEFAULT_ARA && !/\bknee\b/i.test(vars['부위'])) template = template.replace('슬관절 강내', '{부위} 관절강내')
      const ia = v.rx.find((row) => (procedureBase(row.code) || upper(row.code)) === 'KK090')
      const line = ia ? renderQuantityProcedure(cm(ia.code)?.n || 'IA', template, vars, v.rxQty, fill, ia.code) : fill(template, vars)
      const key = lineKey(line)
      if (line && !seen.has(key)) {
        seen.add(key)
        out.push(markOf() + line)
      }
    }
    return out
  }
  function withoutLegacyCartilage(m: MemoParts): MemoParts {
    return {
      ...m,
      procList: (m.procList || []).flatMap((line) => (/아라간/.test(line) ? String(line).split(/[,，]/).filter((part) => !/아라간/.test(part)) : [line])),
      ...(m.sub ? { sub: m.sub.map(withoutLegacyCartilage) } : {}),
    }
  }

  // ── 줄 만들기 ──────────────────────────────────────────

  /**
   * fullText가 어느 줄이 시술 줄이고(procOut) 어느 코드의 줄인지(lineTags, 줄 꼬리표, memo-settings design.md 2절) 알게 적어 둔다.
   * 끝맺음 뒤·따로 한 줄 약의 자리와 [코드 확인]은 시술 줄을, 주인 약의 자리(REQ-3002)는 시술 줄의 꼬리표를, 줄 순서(REQ-3005)는 모든 줄의 꼬리표를 본다.
   * 코드별 메모 줄(시술 아닌 코드)은 꼬리표만 있다. 연골주사 줄은 따로 적는다(연골주사약만 그 줄에 놓인다)
   */
  let procOut = new Set<string>()
  let lineTags = new Map<string, Set<string>>()
  let cartilageOut = new Set<string>()
  function tagLine(line: string, codes: Iterable<string>): string {
    const tags = lineTags.get(line) ?? new Set<string>()
    for (const code of codes) if (code) tags.add(code)
    lineTags.set(line, tags)
    return line
  }
  function procLine(line: string, codes: Iterable<string>, cartilage = false): string {
    procOut.add(line)
    if (cartilage) cartilageOut.add(line)
    return tagLine(line, codes)
  }
  /** 처방 코드 하나의 꼬리표: 그 코드, 표준 코드(procKeys 모양), 기본 코드 */
  function codeTags(code: unknown): string[] {
    const row = cm(code)
    return [...new Set([upper(code), upper(row?.standardCode || code), procedureBase(code)].filter(Boolean))]
  }
  /** 시술 글에 이름이 든 처방 시술의 꼬리표(procedureCodeVars와 같은 처방 모음에서 찾는다) */
  function lineCodes(p: unknown, qmap: QuantityMap | null | undefined): string[] {
    const up = upper(p)
    return procPool(qmap)
      .filter((code) => {
        const row = hasCode(code) ? CODEMAP[code] : null
        return !!row && row.k === 'proc' && (procNamed(row.n, up) || procNamed(row.templateKey, up))
      })
      .flatMap(codeTags)
  }
  const IA_TAGS = ['KK090']

  function splitProcs(t: string): { c: string; sd: string | null }[] | null {
    const raw = String(t || '').trim().split(/[\s,，]+/).filter(Boolean)
    if (raw.length < 2) return null
    if (!raw.every((x) => PCODE.test(x) || SIDE_TOK.test(x))) return null
    if (!raw.some((x) => PCODE.test(x))) return null
    const units: { c: string; sd: string | null }[] = []
    let pend: string | null = null
    raw.forEach((tk) => {
      if (SIDE_TOK.test(tk)) {
        if (units.length && !units[units.length - 1].sd) units[units.length - 1].sd = tk
        else pend = tk
        return
      }
      units.push({ c: tk, sd: pend })
      pend = null
    })
    if (units.length < 1) return null
    if (units.length === 1 && !units[0].sd) return null
    const given = units.map((u) => u.sd).filter(Boolean)
    if (given.length === 1 && TPL.sideSpread !== 'adjacent') units.forEach((u) => (u.sd = u.sd || given[0]))
    return units
  }

  /** cartilage: 차트의 아라간 글로 만든 연골주사 줄 */
  type ProcText = { t: string; cartilage: boolean }
  function procLines(list: string[] | undefined, qmap: QuantityMap | null | undefined, icSide: string | undefined, regionName: string): ProcText[] {
    const out: ProcText[] = []
    const push = (t: string, cartilage = false) => out.push({ t, cartilage })
    ;(list || []).forEach((t) => {
      if (/아라간/.test(t) && /[,，]/.test(t)) {
        const ps = t.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
        const ara = ps.filter((x) => /아라간/.test(x))
        const rest = ps.filter((x) => !/아라간/.test(x))
        if (ara.length && rest.length) {
          out.push(...procLines([ara.join(' ')], qmap, icSide, regionName))
          rest.forEach((r) => out.push(...procLines([r], qmap, icSide, regionName)))
          return
        }
      }
      if (/아라간/.test(t)) {
        const sd = /양|both/i.test(t) ? '양측' : /\bRt\b/i.test(t) ? '우측' : /\bLt\b/i.test(t) ? '좌측' : ''
        const cha = (t.match(/(\d+)\s*차/) || [])[1]
        // {약제}는 비운다: 원본은 이 자리에 연골주사 날 afterProc 약(연골주사약은 빠짐)을 넣었는데, 그 일반 약은 이제 일반 IA 줄에만 놓이거나
        // [약 확인]으로 남는다(AC-3001.3). 일반 약이 없는 날은 원본과 같다(골든 cartilage-words)
        push(renderQuantityProcedure('IA', TPL.ara, { 좌우: sd, 회차: cha || '', 부위: regionName || MISS_SITE, 약제: '' }, qmap), true)
        return
      }
      const units = splitProcs(t)
      if (units) {
        const parts = units.map((u) => sideFix(`${u.c}${u.sd ? ` ${u.sd}` : ''}`.trim(), qmap)).filter(Boolean)
        if (TPL.splitEach) parts.forEach((x) => push(x))
        else push(parts.join(' '))
        return
      }
      push(sideFix(t, qmap))
    })
    return out.filter((x) => x.t).map((x) => ({ ...x, t: applyRename(icnbFix(x.t, icSide)) })).filter((x) => x.t)
  }

  /** 원본 compose(규칙 단계 CL은 늘 0이다: 상세 모드는 옮기지 않는다) */
  function compose(m: MemoParts): string {
    if (m.rxOnly) return ''
    if (m.sub) return [compose(m.sub[0]), compose(m.sub[1])].join('\n')
    const isCerv = m.rg === 'cervical'
    const vars: Record<string, unknown> = {
      좌우: isCerv ? '' : m.side || '',
      부위: siteName(m.rg, m.ko),
      시술: applyRename(m.procTxt || ''),
      KLG: m.klTxt || '',
      검사: '',
      기간: '',
      진단: '',
      영상: '',
    }
    const mains = procLines(m.procList, m.rxQty, m.icnbSide, m.ko).map(({ t: p, cartilage }) => ({
      line: renderQuantityProcedure(p, tplForProc(p, m.rg, m.rxQty), { ...vars, 시술: p }, m.rxQty),
      codes: cartilage ? IA_TAGS : lineCodes(p, m.rxQty),
      cartilage,
    }))
    const cpbSide = m.cpbTxt ? (m.cpbTxt.match(/\b(both|Rt|Lt)\b/i) || [])[1] : null
    const cpbKo = ({ both: '양측', rt: '우측', lt: '좌측' } as Record<string, string>)[String(cpbSide).toLowerCase()] || m.side || ''
    const cpbLine = m.cpbTxt ? renderQuantityProcedure(m.cpbTxt, TPL.cpb, { ...vars, 좌우: cpbKo, 시술: applyRename(sideFix(m.cpbTxt, m.rxQty)) }, m.rxQty) : null
    const snbLine = m.snbSide ? renderQuantityProcedure(m.snbSeg || 'SNB', TPL.snb, { ...vars, 좌우: m.snbSide, 시술: applyRename(m.snbSeg || 'SNB both') }, m.rxQty) : null
    const klgLine = m.rg === 'knee' && m.araV && TPL.klg && (m.kl1 || m.kl2) ? fill(TPL.klg, { KL1: m.kl1 || '', KL2: m.kl2 || '' }) : null
    const lines = [
      ...mains,
      { line: cpbLine, codes: lineCodes(m.cpbTxt, m.rxQty), cartilage: false },
      { line: snbLine, codes: lineCodes(m.snbSeg || 'SNB', m.rxQty), cartilage: false },
    ]
      .filter((x): x is { line: string; codes: string[]; cartilage: boolean } => !!x.line)
      .map((x) => procLine(markOf() + x.line, x.codes, x.cartilage))
    if (klgLine) lines.push(markOf() + klgLine)
    return lines.join('\n')
  }

  function memoText(v: MemoVisit, m: MemoParts): string {
    return compose(iaKind(v) === 'ara' && usesOwnTemplate(v) ? withoutLegacyCartilage(m) : m)
  }
  /** fullText의 부위 메모: 원본 memoText + 연골주사약을 아직 안 정한 날은 차트의 연골주사 줄도 뺀다(AC-014.9·AC-014.10) */
  function memoTextForFull(v: MemoVisit, m: MemoParts): string {
    return compose(iaKind(v) === 'ara' && (usesOwnTemplate(v) || cartilageHeld(v)) ? withoutLegacyCartilage(m) : m)
  }

  /** 이번 글에서 자리에 넣은 약. 놓을 줄이 없던 약은 [약 확인]으로 돌린다(AC-3001.3) */
  let placedDrugs = new Set<DrugItem>()

  /** IA·건초내주사 줄 {부위}에 차트 좌우를 쓰는가(AC-3003.1) */
  const iaSide = () => phrases.memoRules?.iaSide === true
  /** IA·건초내주사 줄 {약제}의 약: 주인 없는 약 + 그 시술이 주인인 약(REQ-3002) */
  const slotDrugs = (plan: DrugPlan, owner: string) => [...free(plan.afterProc), ...ownedBy(plan.afterProc, owner)]
  /** 그 줄을 썼고 틀에 {약제}가 있으면 그 약은 놓였다. 아니면 [약 확인]으로 돌아간다 */
  function placeSlot(line: string, tpl: string, items: DrugItem[]) {
    if (line && tpl.includes('{약제}')) items.forEach((item) => placedDrugs.add(item))
  }

  /**
   * 연골주사 날의 일반 IA 줄(AC-3001.2): IA 줄에 놓을 일반 약이 있으면 아라간이 아닌 IA 차트 줄의 부위로 iaEtc 줄을 하나 더 쓴다.
   * KK090 수량은 연골주사와 나눠 쓰므로 양측 근거로 보지 않는다(수량 1로 본다). 그런 줄이 없으면 약은 fullTextBody가 [약 확인]으로 돌린다(AC-3001.3)
   */
  function araEtcLine(v: MemoVisit): string[] {
    const tpl = TPL.iaEtc
    const plan = drugPlan(v)
    if (!tpl || !iaBound(plan).length || kneeSetSkips(v, false)) return []
    const chart = (v.items || []).filter((i) => i.k === 'proc' && IA_LINE_WORD.test(i.raw || i.t) && !CARTILAGE_NAME.test(i.raw || i.t))
    if (!chart.length) return []
    const ia = v.rx.find((x) => upper(x.code) === 'KK090')!
    const name = cm(ia.code)?.n || 'IA'
    const one = Object.create(null) as QuantityMap
    addQuantity(one, name, 1, ia.code)
    const site = siteOf({ items: chart, memos: [] }, IA_WORD, IA_REGIONS)
    const slot = slotDrugs(plan, 'KK090')
    const drugs = [...new Set(slot.map((item) => item.name))]
    const line = renderQuantityProcedure(name, tpl, { 좌우: '', 약제: drugs.length ? `(${drugs.join(', ')})` : '', 투여량: '', 부위: site || MISS_SITE }, one, fill, ia.code, iaSide())
    placeSlot(line, tpl, slot)
    return line ? [markOf() + line] : []
  }

  function iaLinesOf(v: MemoVisit, raw: boolean): string[] {
    const k = iaKind(v)
    // raw는 원본 그대로 줄이 있는지만 볼 때라 약 계획을 읽지 않는다
    if (k === 'ara') return [...cartilageLine(v, raw), ...(raw ? [] : araEtcLine(v))]
    if (!k) return []
    const tpl = TPL.iaEtc
    if (!tpl) return []
    if (kneeSetSkips(v, raw)) return []
    const ia = v.rx.find((x) => upper(x.code) === 'KK090')!
    const slot = raw ? [] : slotDrugs(drugPlan(v), 'KK090')
    const drugs = [...new Set(slot.map((item) => item.name))]
    const site = siteOf(v, IA_WORD, IA_REGIONS)
    const qty = ia.qty ?? 0
    const iaVars = { 좌우: qty >= 2 ? ' - both' : '', 약제: drugs.length ? `(${drugs.join(', ')})` : '', 투여량: ia.qty || '', 부위: site || MISS_SITE }
    const line = renderQuantityProcedure(cm(ia.code)?.n || 'IA', tpl, iaVars, v.rxQty, fill, ia.code, !raw && iaSide())
    placeSlot(line, tpl, slot)
    return line ? [markOf() + line] : []
  }
  /** fullText의 IA 줄: 꼬리표 KK090, 연골주사 줄은 따로 적는다 */
  function iaLines(v: MemoVisit): string[] {
    if (iaKind(v) !== 'ara') return iaLinesOf(v, false).map((line) => procLine(line, IA_TAGS))
    return [...cartilageLine(v, false).map((line) => procLine(line, IA_TAGS, true)), ...araEtcLine(v).map((line) => procLine(line, IA_TAGS))]
  }

  function noteLines(v: MemoVisit): string[] {
    const araVisit = iaKind(v) === 'ara'
    const seen = new Set<string>()
    const out: string[] = []
    v.rx.forEach(({ code, qty }) => {
      const o = cm(code)
      if (!o || !o.memo || o.k === 'skip') return
      const C = upper(code)
      if (araVisit && C === 'KK090') return
      if (o.k === 'proc' && (v.rxAdd || []).some((a) => upper(a.code) === C)) return
      const needSite = /\{부위\}/.test(o.memo)
      const needFx = /\{골절\}/.test(o.memo)
      const site = needSite ? siteOf(v, C === 'C8140010' ? /aspir|\basp\b|천자|흡인|tapping/i : null, null) : ''
      const noteVars = { 좌우: qty === 1.5 ? 'both' : '', 투여량: qty || '', 코드: C, 표기: o.n || '', 부위: needSite ? site || MISS_SITE : '', 골절: needFx ? fxOf(v.items || []) : '' }
      const line = o.k === 'proc' ? renderQuantityProcedure(o.n, o.memo, noteVars, v.rxQty, fill, code) : fill(o.memo, noteVars)
      if (!line || seen.has(line)) return
      if (araVisit && /\bIA\b/i.test(line)) return
      seen.add(line)
      out.push(o.k === 'proc' ? procLine(markOf() + line, codeTags(code)) : tagLine(markOf() + line, codeTags(code)))
    })
    return out
  }

  function rxLines(v: MemoVisit): string[] {
    if (!v.rxAdd || !v.rxAdd.length) return []
    const RGKO = Object.fromEntries(REGION.map(([k, ko]) => [k, ko]))
    const icS = icnbSideOf(v)
    const hasIaLine = !!iaKind(v)
    const empty = { 좌우: '', 부위: '', KLG: '', 검사: '', 기간: '', 진단: '', 영상: '' }
    return v.rxAdd
      .filter((a: RxAddition) => !((a.name === 'IA' || upper(a.code) === 'KK090') && hasIaLine))
      .map((a) => {
        const tags = codeTags(a.code)
        if (upper(a.code) === 'KK062' && TPL.ts) {
          const s = siteOf(v, /건초|tendon\s*sheath|trigger\s*finger|방아쇠|quervain|tenosyn|\bTS\b|\bSTI\b/i, null, true)
          const slot = slotDrugs(drugPlan(v), 'KK062')
          const line = renderQuantityProcedure(a.name, TPL.ts, { 부위: s || MISS_SITE, 좌우: '', 약제: formatDrugs(slot) }, v.rxQty, fill, a.code, iaSide())
          placeSlot(line, TPL.ts, slot)
          return procLine(markOf() + line, tags)
        }
        const txt = applyRename(icnbFix(sideFix(a.name, v.rxQty), icS))
        if (a.name === 'SNB') return procLine(markOf() + renderQuantityProcedure(txt, tplForProc(txt, null, v.rxQty), { ...empty, 시술: txt }, v.rxQty), tags)
        const ko = a.rg ? siteName(a.rg, RGKO[a.rg]) : ''
        return procLine(markOf() + renderQuantityProcedure(txt, tplForProc(txt, a.rg, v.rxQty), { ...empty, 부위: ko, 시술: txt }, v.rxQty), tags)
      })
  }

  // 2부위 규칙: 기준코드가 처방되고 그 밖의 시술이 함께 있으면 2부위다
  function twoSiteRules() {
    return text(TPL.twoSiteRules ?? 'KK090 = LA274, LA272\nKK061\nKK062')
      .split('\n')
      .map((line) => line.split('='))
      .map(([code, also = '']) => ({ code: code.trim().toUpperCase(), also: also.toUpperCase().split(/[\s,]+/).filter(Boolean) }))
      .filter((rule) => rule.code)
  }
  function twoSites(v: Pick<Visit, 'rx'>): boolean {
    const codes = new Set(v.rx.filter((row) => row.benefit !== false).map((row) => procedureBase(row.code)).filter(Boolean))
    return twoSiteRules().some((rule) => codes.has(rule.code) && [...codes].some((code) => code !== rule.code && !rule.also.includes(code)))
  }
  function patientLines(v: MemoVisit): string[] {
    const twoSiteReason = text(TPL.ia2).trim()
    const intervalReason = text(TPL.itv).trim()
    const two = twoSiteReason && twoSites(v) ? fill(twoSiteReason, {}) : ''
    const gap = intervalReason && v.shortItv ? fill(intervalReason, {}) : ''
    return (TPL.reasonPriority === 'both' ? [two, gap] : TPL.reasonPriority === 'interval' ? [gap || two] : [two || gap]).filter(Boolean)
  }

  const lineKey = (s: unknown) =>
    String(s || '').replace(/^\s*◈\s*/, '').replace(new RegExp(`^\\s*${reEsc(markOf().trim())}\\s*`), '').replace(/\s+/g, '').replace(/[.。]+$/, '').toLowerCase()

  function repeatLevels(list: string): string {
    const head = list.match(/^([CTL])[ \t]*/i)
    if (!head) return list
    return list
      .slice(head[0].length)
      .split(/[ \t]*,[ \t]*/)
      .map((level) => (/^[CTLS]/i.test(level) ? level.toUpperCase() : head[1].toUpperCase() + level))
      .join(', ')
  }
  function formatLevels(value: unknown): string {
    if (TPL.levelSep !== 'dash' && TPL.levelSep !== 'repeat') return text(value)
    const names = procedureNames(true)
    if (!names.length) return text(value)
    return text(value)
      .split('\n')
      .map((line) =>
        names.some((name) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])`, 'i').test(line))
          ? line.replace(/(?:[CTLS][ \t]*)?\d+(?:[ \t]*,[ \t]*(?:[CTLS][ \t]*)?\d+)+/gi, (list) => (TPL.levelSep === 'repeat' ? repeatLevels(list) : list.replace(/[ \t]*,[ \t]*/g, '-')))
          : line,
      )
      .join('\n')
  }
  function sentenceMemo(v: MemoVisit, body: unknown, reasons: string[]): string {
    const mark = text(markOf()).trim()
    const lines = text(body).split('\n').map((line) => line.trim()).filter(Boolean).map((line) => (mark && line.startsWith(mark) ? line.slice(mark.length).trim() : line))
    const extra = lines.filter((line) => /^K-?L\s*grade/i.test(line))
    let items = lines.filter((line) => !extra.includes(line)).map((line) => line.replace(/\s*시행(?:함|하였음)?\s*[.。]?$/, '').trim()).filter(Boolean)
    const english = (item: string) => [...new Set((item.match(/\b(?:Rt|Lt|both)\b/gi) || []).map((word) => (/^rt$/i.test(word) ? 'Rt' : /^lt$/i.test(word) ? 'Lt' : 'Both')))]
    const sides = [...new Set(items.flatMap(english))]
    let side = ''
    if (sides.length === 1 && items.every((item) => english(item).length <= 1) && !items.some((item) => /우측|좌측|양측|양쪽/.test(item))) {
      side = sides[0]
      items = items.map((item) => item.replace(/[ \t]*\b(?:Rt|Lt|both)\b/gi, '').replace(/\s{2,}/g, ' ').trim())
    }
    const names = procedureNames()
    const levelNames = procedureNames(true)
    const has = (item: string, name: string) => compiled(`(^|[^A-Z0-9가-힣])${codeEscape(name)}(?![A-Z0-9가-힣])`, 'i').test(item)
    const named = items.map((item) => names.find((name) => has(item, name)) || item)
    const levels = items.filter((item) => levelNames.some((name) => has(item, name))).map(levelOf).filter(Boolean)
    const sites = [...new Set((v.memos || []).map((memo) => siteName(memo.rg, '')).filter(Boolean))]
    const kl = (v.memos || []).map((memo) => text(memo.klTxt)).find(Boolean) || ''
    const sentence = items.length ? fill(text(TPL.sentence), { 좌우: side, 시술목록: items.join(', '), 시술: [...new Set(named)].join(', '), 레벨: levels.join(', '), 부위: sites.join(', '), KLG: kl }) : ''
    return [sentence, ...extra, ...reasons].filter((line) => text(line).trim()).join(TPL.lineJoin === 'oneLine' ? ' ' : '\n')
  }
  function styleSides(t: unknown): string {
    const style = TPL.sideStyle && Object.hasOwn(SIDE_STYLES, TPL.sideStyle) ? SIDE_STYLES[TPL.sideStyle] : null
    if (!style) return t as string
    return String(t).replace(/(^|[^A-Za-z0-9가-힣])(Rt|Lt|both)\.?(?![A-Za-z0-9가-힣])/gi, (_, pre: string, word: string) => pre + style[word.toLowerCase()])
  }
  function oneLineMemo(t: unknown): string {
    const mark = markOf().trim()
    const lines = String(t).split('\n').map((x) => x.trim()).filter(Boolean)
    const sentence = (x: string) => /[.。]$/.test(x)
    const procs = lines.filter((x) => !sentence(x)).map((x) => (mark && x.startsWith(mark) ? x.slice(mark.length).trim() : x))
    return [procs.length ? (mark ? mark : '') + procs.join(', ') : '', ...lines.filter(sentence)].filter(Boolean).join(' ')
  }

  /** IA·건초내주사 시술이 주인인 afterProc 약은 그 줄 {약제}에만 놓인다(그 줄을 만들 때 넣었다) */
  const SLOT_OWNERS = new Set(['KK090', 'KK062'])

  /**
   * 끝맺음 뒤·따로 한 줄 약을 놓는다. 주인 없는 약(시술 하나인 날)은 마지막 시술 줄에, 시술 줄이 없으면 쓸 자리가 없어 쓰지 않는다.
   * 주인 약(REQ-3002)은 꼬리표가 주인 시술인 첫 줄에(연골주사약은 연골주사 줄, 그 밖의 약은 연골주사 아닌 줄): afterProc·afterEnding은 그 줄 끝, ownLine은 그 줄 바로 아래.
   * 자리는 모두 원래 줄에서 찾은 뒤 한 번에 붙인다. 원래 줄마다 [그 줄, 붙은 ◈약: 줄]을 돌려준다(줄 순서가 함께 옮긴다)
   */
  function placeDrugs(lines: string[], plan: DrugPlan): string[][] {
    const slots = new Map<number, { proc: DrugItem[]; ending: DrugItem[]; own: DrugItem[] }>()
    const put = (at: number, key: 'proc' | 'ending' | 'own', items: DrugItem[]) => {
      if (at < 0 || !items.length) return
      const slot = slots.get(at) ?? { proc: [], ending: [], own: [] }
      slot[key].push(...items)
      slots.set(at, slot)
      items.forEach((item) => placedDrugs.add(item))
    }
    let last = -1
    for (let i = lines.length - 1; i >= 0 && last < 0; i--) if (procOut.has(lines[i])) last = i
    put(last, 'ending', free(plan.afterEnding))
    put(last, 'own', free(plan.ownLine))
    const ownerLine = (item: DrugItem) => lines.findIndex((line) => procOut.has(line) && !!lineTags.get(line)?.has(item.owner!) && cartilageOut.has(line) === !!item.cartilage)
    for (const item of plan.afterProc) if (item.owner && !SLOT_OWNERS.has(item.owner) && !placedDrugs.has(item)) put(ownerLine(item), 'proc', [item])
    for (const item of plan.afterEnding) if (item.owner) put(ownerLine(item), 'ending', [item])
    for (const item of plan.ownLine) if (item.owner) put(ownerLine(item), 'own', [item])
    return lines.map((line, at) => {
      const slot = slots.get(at)
      if (!slot) return [line]
      let out = line + formatDrugs(slot.proc)
      if (slot.ending.length) out += ` ${formatDrugs(slot.ending).trim()}`
      return slot.own.length ? [out, `${markOf()}약: ${drugNames(slot.own).join(', ')}`] : [out]
    })
  }

  /** 줄 순서 번호(REQ-3005): 그 줄 꼬리표 코드 중 가장 작은 memoRules.order 번호. 없으면 null */
  function rankOf(line: string): number | null {
    const order = phrases.memoRules?.order
    if (!order) return null
    const ranks = [...(lineTags.get(line) ?? [])].filter((code) => Object.hasOwn(order, code) && Number.isInteger(order[code])).map((code) => order[code])
    return ranks.length ? Math.min(...ranks) : null
  }
  /**
   * 본문 줄 순서(REQ-3005): 번호 있는 줄이 하나라도 있으면 번호 있는 줄을 번호 작은 차례로 먼저, 나머지는 원래 차례로 둔다(안정 정렬).
   * 붙은 ◈약: 줄은 함께 옮기고, 정렬하면 빈 줄 구분은 없앤다. 번호 있는 줄이 없으면 지금 그대로다(AC-3005.1)
   */
  function orderLines(groups: string[][], ranks: (number | null)[]): string {
    if (!ranks.some((rank) => rank !== null)) return groups.map((group) => group.join('\n')).join('\n')
    const rankAt = (at: number) => ranks[at] ?? Number.POSITIVE_INFINITY
    return groups
      .map((group, at) => ({ group, at }))
      .filter(({ group }) => group[0].trim())
      .sort((a, b) => (rankAt(a.at) === rankAt(b.at) ? a.at - b.at : rankAt(a.at) - rankAt(b.at)))
      .flatMap(({ group }) => group)
      .join('\n')
  }

  const isDeleted = (code: unknown) => [text(code), upper(code), text(code).toLowerCase()].some((key) => deleted.has(key))
  /**
   * 사전에 없는 처방코드(AC-3004.1): 그날 메모에 시술 줄이 있으면 급여 처방 중 사전(CODEMAP)에도 지운 코드(CODEMAP_DEL)에도 없는 코드마다 한 번 [코드 확인: 처방 이름].
   * 이름은 줄바꿈·괄호 없이 한 줄로 쓴다(unfinished 정규식이 줄과 ]를 넘지 않는다, AC-014.12)
   */
  function codeChecks(v: MemoVisit, hasProcLine: boolean): string[] {
    if (!v.memos.length || !hasProcLine) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const row of v.rx) {
      const key = upper(row.code).trim()
      if (!key || row.benefit === false || cm(row.code) || isDeleted(row.code) || seen.has(key)) continue
      seen.add(key)
      out.push(`[코드 확인: ${text(row.name).replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim() || key}]`)
    }
    return out
  }

  /** 놓을 줄이 없던 약의 표시: 연골주사 날 넣기인 일반 약(일반 IA 줄에만 놓인다, AC-3001.3)과 주인 약(AC-3002.3) */
  function unplacedChecks(v: MemoVisit, plan: DrugPlan): string[] {
    const owned = [...plan.afterProc, ...plan.afterEnding, ...plan.ownLine].filter((item) => item.owner)
    const lost = [...(iaKind(v) === 'ara' ? free(plan.afterProc) : []), ...owned].filter((item) => !placedDrugs.has(item))
    return [...new Set(lost.map((item) => drugCheck(item.drug)))].filter((mark) => !plan.checks.includes(mark))
  }

  function fullTextBody(v: MemoVisit): string {
    procOut = new Set()
    lineTags = new Map()
    cartilageOut = new Set()
    placedDrugs = new Set()
    const seen = new Set<string>()
    const slot = drugTxt(v)
    const uniq = (line: string) => {
      // 약 자리를 잡아 다시 쓸 때 첫 줄에만 약이 붙으므로 약 글을 빼고 견준다
      const k = lineKey(slot ? line.replace(slot, '') : line)
      if (!k) return true
      if (seen.has(k)) return false
      seen.add(k)
      return true
    }
    const filled = (x: string) => !!x && !!x.trim()
    const regionBlock = v.memos.map((m) => memoTextForFull(v, m)).filter(filled).map((b) => b.split('\n').filter(uniq).join('\n')).filter((x) => x.trim()).join('\n\n')
    const rxB = rxLines(v).filter(filled).filter(uniq).join('\n')
    const iaB = iaLines(v).filter(filled).filter(uniq).join('\n')
    const noteB = noteLines(v).filter(filled).filter(uniq).join('\n')
    const procB = [regionBlock, rxB, noteB].filter(filled).join('\n')
    const plan = drugPlan(v)
    const lines = [procB, iaB].filter(filled).join('\n\n').split('\n')
    const ranks = lines.map(rankOf)
    const base = orderLines(placeDrugs(lines, plan), ranks)
    // 확인 표시 자리: [약 확인] → 놓을 줄이 없던 약 → [코드 확인]. 사유 문장은 그 뒤다
    const checks = [...plan.checks, ...unplacedChecks(v, plan), ...codeChecks(v, lines.some((line) => procOut.has(line)))]
    const pl = patientLines(v)
    const body = formatLevels(base)
    if (String(TPL.sentence || '').trim()) {
      return gapify([styleSides(sentenceMemo(v, body, [])), ...checks, ...pl].filter((x) => String(x).trim()).join(TPL.lineJoin === 'oneLine' ? ' ' : '\n'))
    }
    const styled = [styleSides(body), ...checks].filter(Boolean).join('\n')
    const memo = pl.length ? `${styled}\n\n${pl.join('\n')}` : styled
    return gapify(TPL.lineJoin === 'oneLine' ? oneLineMemo(memo) : memo)
  }

  /** 원본 fullText: 비트에 들어가는 글(AC-014.5). 분석하지 않은 Visit이면 그 진료만 분석한다(내원 간격은 analyzeMonth로만 계산된다) */
  function fullText(visit: Visit | MemoVisit): string {
    const v = 'memos' in visit && Array.isArray(visit.memos) ? (visit as MemoVisit) : prepareVisit(visit)
    const previous = FILL_VISIT
    FILL_VISIT = v
    try {
      drugTokenUsed = false
      drugSlotOpen = false
      const first = fullTextBody(v)
      if (!free(drugPlan(v).afterProc).length || drugTokenUsed || iaKind(v) === 'ara') return first
      // 넣을 약이 있는데 {약제} 자리가 어느 틀에도 없었다: 첫 시술 줄의 {시술} 바로 뒤를 자리로 삼아 다시 쓴다(AC-014.9). 주인 약은 이 자리에 오지 않는다(REQ-3002)
      drugSlotOpen = true
      const second = fullTextBody(v)
      drugSlotOpen = false
      return second
    } finally {
      FILL_VISIT = previous
    }
  }

  /** 원본 savedMemoMissing: 고친 메모에 없는 사유 문장을 돌려준다. 고친 메모는 건드리지 않는다(AC-014.4) */
  function savedMemoMissing(saved: string | undefined, visit: Visit | MemoVisit): string[] {
    if (saved === undefined) return []
    const v = 'memos' in visit && Array.isArray(visit.memos) ? (visit as MemoVisit) : prepareVisit(visit)
    const norm = (s: unknown) => String(s || '').replace(/\s+/g, ' ').trim()
    const have = norm(saved)
    return patientLines(v).filter((line) => norm(line) && !have.includes(norm(line)))
  }

  function buildMemo(visit: Visit | MemoVisit, region: Region): MemoParts {
    const v = 'memos' in visit && Array.isArray(visit.memos) ? (visit as MemoVisit) : prepareVisit(visit)
    return buildMemoOf(v, region)
  }

  return {
    prepareVisit,
    analyzeMonth,
    computeIntervals,
    buildMemo,
    memoText,
    fullText,
    fill,
    rxLines,
    iaLines,
    noteLines,
    patientLines,
    savedMemoMissing,
    lineKey,
    formatLevels,
    sentenceMemo,
    styleSides,
    gapify,
    oneLineMemo,
    procKeys,
  }
}

