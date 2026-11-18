import type { RulesFile } from '@/types/precheck'
import type { Line, ParsedChart, Target } from './types'

// 규칙표 읽기(원본 new-medicore-precheck의 앞부분) [환자 자료 구역]. 정규식·코드 묶음·약 분류·부위 표를 한 번 만들어 둔다.
// 표(tables)는 Worker가 나눠 쓰므로 고치지 않는다. 원본이 표에 낱말을 더하던 자리는 복사본에 더한다(AC-010.6)

export const up = (value: unknown) => String(value ?? '').trim().toUpperCase()

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null

// 차트 낱말 보강: 흔한 증상 낱말(요통·아픔·저림 등)도 증상·진찰 기록으로 본다(원본 KEY_EXTRA)
const KEY_EXTRA: Record<string, string> = {
  symptom_exam: 'pain|아프|아픔|요통|경통|견통|슬통|저리|시림|뻐근|부종|swelling',
  physician_exam: 'pain|아프|아픔|통증|요통|저림|저리|tender|압통',
}
// 규칙 목록의 prefix_rule(원본 PREFIX)
const PREFIX = new Map([
  ['xr_all', /^G[1-9]\d{3}/],
  ['us_covered', /^EB[45]\d{2}/],
])
// 조사 노트 밖의 흔한 상품명·성분명(오탐보다 누락이 위험한 것만, 원본 EXTRA)
const EXTRA: Record<string, string> = {
  steroid_injection: '트리암|triam|케나콧|kenacort|디프로스판|diprospan|데포\\s*-?\\s*메드롤|depo-?\\s*medrol|솔루\\s*-?\\s*메드롤|solu-?\\s*medrol|덱사|dexa',
  local_anesthetic: '자일로카인|xylocain|마카인|marcain|나로핀|naropin|키로카인|chirocain',
  contrast: '옴니파크|omnipaque|울트라비스트|ultravist|파미레이|pamiray|비지파크|visipaque|iodixanol|이오디사놀|조영',
  hyaluronate_20mg: '히루안|하이루|hyruan',
  muscle_relaxant: '에페리손|eperison|클로르족사존|chlorzoxazon|메토카르바몰|methocarbamol|오르페나드린|orphenadrin|바클로펜|baclofen|아페낙|이소프렌|미오날',
  nsaid: '이부프로펜|ibuprofen|덱시부프로펜|dexibuprofen|나프록센|naproxen|에토돌락|etodolac|잘토프로펜|zaltoprofen|펠루비프로펜|pelubiprofen|플루르비프로펜|flurbiprofen|에어탈|airtal|쎄레브렉스|celebrex|모빅|mobic',
  oral_corticosteroid: '메틸프레드니솔론|methylprednisolon|소론도|메치론|데플라자코트|deflazacort',
}
export const INJECTION_CLASSES = new Set([
  'steroid_injection', 'local_anesthetic', 'contrast', 'hyaluronate_20mg', 'hyaluronate_25mg', 'hyaluronate_single', 'pn', 'collagen',
  'dextrose_injection', 'placenta_extract', 'vitamin_injection', 'normal_saline',
])
const escapeRx = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type CodeGroup = {
  name: string
  exact: Set<string>
  base: Set<string>
  points: Map<string, number>
  names: Map<string, string>
  regex: RegExp | null
  pairs: string[][] | null
  prefix: RegExp | null
}
export type DrugClass = { regex: RegExp | null; codes: Set<string>; sub: Map<string, DrugClass>; union: string[] | null }
export type SiteRule = { key: string; region: string; re: RegExp | null }

export type Compiled = ReturnType<typeof compile>

function compile(file: RulesFile) {
  const REG = structuredClone(file.regions) as Rec
  const keywords = REG.chart_keywords
  if (isRecord(keywords)) {
    for (const [key, extra] of Object.entries(KEY_EXTRA)) if (typeof keywords[key] === 'string') keywords[key] += `|${extra}`
  }

  // ── 정규식: 규칙 목록은 파이썬식 (?i) 표시를 쓴다 ──
  const RXC = new Map<string, RegExp | null>()
  function rx(source: unknown): RegExp | null {
    if (source == null || source === '') return null
    const key = String(source)
    if (RXC.has(key)) return RXC.get(key) ?? null
    let out: RegExp | null = null
    try {
      out = new RegExp(key.replace(/\(\?i\)/g, ''), 'i')
    } catch {
      out = null
    }
    RXC.set(key, out)
    return out
  }
  function regionPath(path: unknown): unknown {
    const parts = String(path || '').split('.')
    if (parts[0] !== 'regions') return undefined
    let node: unknown = REG
    for (const part of parts.slice(1)) {
      if (!isRecord(node)) return undefined
      node = node[part]
    }
    return node
  }
  /** 차트 낱말 규칙(없는 키는 null: 판정하지 않음) */
  function keyTest(path: unknown, t: string): boolean | null {
    const value = regionPath(path)
    if (typeof value === 'string') {
      const re = rx(value)
      return re ? re.test(t) : null
    }
    if (isRecord(value)) {
      const list = Object.values(value)
        .map((v) => (typeof v === 'string' ? rx(v) : isRecord(v) && v.regex ? rx(v.regex) : null))
        .filter((re): re is RegExp => Boolean(re))
      return list.length ? list.some((re) => re.test(t)) : null
    }
    return null
  }

  // ── 코드 묶음 ──
  const GROUPS = new Map<string, CodeGroup>()
  for (const [name, spec] of Object.entries(file.code_groups)) {
    const specRec = isRecord(spec) && !Array.isArray(spec) ? spec : null
    const list: unknown[] = Array.isArray(spec) ? spec : specRec && Array.isArray(specRec.codes) ? specRec.codes : []
    const group: CodeGroup = { name, exact: new Set(), base: new Set(), points: new Map(), names: new Map(), regex: null, pairs: null, prefix: PREFIX.get(name) ?? null }
    for (const item of list) {
      const row = isRecord(item) ? item : null
      const code = up(typeof item === 'string' ? item : row?.code)
      if (!code) continue
      group.exact.add(code)
      if (code.length === 5) group.base.add(code)
      if (typeof row?.points_2026 === 'number') group.points.set(code, row.points_2026)
      if (row?.name) group.names.set(code, String(row.name))
    }
    if (specRec?.name_regex) group.regex = rx(specRec.name_regex)
    if (specRec && Array.isArray(specRec.pairs)) group.pairs = (specRec.pairs as string[][]).map((pair) => pair.map(up))
    GROUPS.set(name, group)
  }
  function inGroup(line: Line, name: string): boolean {
    const group = GROUPS.get(name)
    if (!group) return false
    if (group.exact.has(line.edi) || group.exact.has(line.code)) return true
    if (line.edi.length > 5 && group.base.has(line.edi.slice(0, 5))) return true
    if (group.prefix && group.prefix.test(line.edi)) return name !== 'xr_all' || !/^G0400/.test(line.edi)
    return Boolean(group.regex && group.regex.test(line.label))
  }
  function pointsOf(code: string): number | null {
    for (const group of GROUPS.values()) {
      const p = group.points.get(code) ?? group.points.get(code.slice(0, 5))
      if (p != null) return p
    }
    return null
  }
  const groupKnown = (name: string) => {
    const g = GROUPS.get(name)
    return Boolean(g && (g.exact.size || g.regex || g.pairs || g.prefix))
  }
  const targetKnown = (target: Target | undefined) =>
    Boolean(target) &&
    ((Array.isArray(target?.codes) && target.codes.length > 0) ||
      (Array.isArray(target?.code_groups) && target.code_groups.some(groupKnown)) ||
      (Array.isArray(target?.drug_classes) && target.drug_classes.length > 0) ||
      Boolean(target?.name_regex))

  // ── 약 분류(성분명 정규식 + 보험코드 + 대표 상품명). 병원마다 다른 처방코드는 묶지 않는다(약 역할은 run.ts가 성분으로 정한다, REQ-6608) ──
  function compileClass(name: string, specRaw: unknown): DrugClass {
    const spec = isRecord(specRaw) ? specRaw : null
    const out: DrugClass = { regex: null, codes: new Set(), sub: new Map(), union: (spec?.union_of as string[] | undefined) ?? null }
    if (!spec) return out
    const parts: string[] = []
    if (spec.regex) parts.push(String(spec.regex).replace(/\(\?i\)/g, ''))
    else if (Array.isArray(spec.name_patterns) && spec.name_patterns.length) parts.push(spec.name_patterns.map((p) => escapeRx(String(p))).join('|'))
    if (Array.isArray(spec.extra_patterns_not_in_notes)) {
      parts.push(spec.extra_patterns_not_in_notes.map((p) => escapeRx(String(p).replace(/\(.*?\)/g, '').trim())).filter(Boolean).join('|'))
    }
    if (Object.hasOwn(EXTRA, name)) parts.push(EXTRA[name])
    const joined = parts.filter(Boolean).join('|')
    if (joined) out.regex = rx(joined)
    for (const item of (spec.edi_codes as unknown[] | undefined) ?? []) out.codes.add(up(typeof item === 'string' ? item : isRecord(item) ? item.code : ''))
    if (isRecord(spec.subgroups)) {
      for (const [sub, subSpec] of Object.entries(spec.subgroups)) out.sub.set(sub, compileClass(`${name}.${sub}`, subSpec))
    }
    return out
  }
  const CLASSES = new Map(Object.entries(file.drug_classes).map(([name, spec]) => [name, compileClass(name, spec)]))

  // ── 차팅 원문 ──
  const SITES: SiteRule[] = Object.entries((REG.chart_site_map as Record<string, { region: string; regex: string }> | undefined) ?? {}).map(([key, spec]) => ({
    key,
    region: spec.region,
    // '목'·'등' 한 글자는 '목소리'·'~등'에도 걸려서 뺀다
    re: rx(String(spec.regex).replace(/\(\?i\)/g, '').split('|').filter((part) => !/^(목|등)$/.test(part)).join('|')),
  }))
  const SIDE: Record<string, RegExp | null> = {}
  for (const [key, value] of Object.entries((REG.chart_side_regex as Record<string, string> | undefined) ?? {})) SIDE[key] = rx(value)
  const LEVEL_PARSE = (REG.chart_level_parse as { spine_levels?: string; level_count?: string } | undefined) ?? {}
  const LEVEL_COUNT = rx(LEVEL_PARSE.level_count)
  const LEVEL_RE = (() => {
    if (!LEVEL_PARSE.spine_levels) return null
    try {
      return new RegExp(String(LEVEL_PARSE.spine_levels).replace(/\(\?i\)/g, ''), 'gi')
    } catch {
      return null
    }
  })()
  const SPINE_KEY: Record<string, string> = { C: 'C', T: 'T', L: 'LS', S: 'LS' }

  function parseChart(t: string): ParsedChart {
    const sites = new Set<string>()
    const joints = new Set<string>()
    for (const site of SITES) {
      if (site.re && site.re.test(t)) {
        sites.add(site.region)
        joints.add(site.key)
      }
    }
    const right = Boolean(SIDE.right && SIDE.right.test(t))
    const left = Boolean(SIDE.left && SIDE.left.test(t))
    const both = Boolean(SIDE.bilateral && SIDE.bilateral.test(t))
    const side = both || (right && left) ? 'bilateral' : right || left ? 'unilateral' : 'unknown'
    const levels = new Map<string, Set<number>>()
    const spine = new Map<string, Set<string>>()
    if (LEVEL_RE) {
      LEVEL_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = LEVEL_RE.exec(t))) {
        const letter = m[1].toUpperCase()
        const nums = [m[2]].concat(String(m[3] || '').split(/[,/]/).map((x) => x.trim()).filter(Boolean))
        const set = levels.get(letter) ?? new Set<number>()
        const key = SPINE_KEY[letter]
        const seg = spine.get(key) ?? new Set<string>()
        for (const n of nums) {
          const k = Number(n)
          if (k > 0 && k < 30) {
            set.add(k)
            seg.add(letter + k)
          }
        }
        levels.set(letter, set)
        spine.set(key, seg)
      }
    }
    const count = LEVEL_COUNT ? LEVEL_COUNT.exec(t) : null
    return { sites, joints, side, right: right || both, left: left || both, levels, spine, levelCount: count ? Number(count[1]) : null }
  }

  // ── 상병 부위 ──
  const KPREFIX: [string, string][] = []
  for (const [region, list] of Object.entries((REG.kcd_prefix_map as Record<string, unknown> | undefined) ?? {})) {
    if (region.startsWith('_') || !Array.isArray(list)) continue
    list.forEach((p) => KPREFIX.push([up(p), region]))
  }
  KPREFIX.sort((a, b) => b[0].length - a[0].length)
  const FIFTH = (REG.kcd_fifth_char_rules as { applies_to_prefixes?: string[]; position?: number; map?: Record<string, string[]> }[] | undefined) ?? []
  function dxRegions(code: string): Set<string> {
    const out = new Set<string>()
    let best = 0
    for (const [prefix, region] of KPREFIX) {
      if (prefix.length < best) break
      if (!code.startsWith(prefix)) continue
      best = prefix.length
      out.add(region)
    }
    if (out.size) return out
    for (const rule of FIFTH) {
      if (!(rule.applies_to_prefixes ?? []).some((p) => code.startsWith(p))) continue
      const ch = code.charAt((rule.position || 5) - 1)
      ;((rule.map && rule.map[ch]) || ['unspecified']).forEach((r) => out.add(r))
      return out
    }
    return out
  }

  const LACODE = (REG.la_code_region as Record<string, string[]> | undefined) ?? {}
  const LEVEL_BASED = new Set(((REG.la_level_based_codes as string[] | undefined) ?? []).map(up))
  const LEVEL_REGION = (REG.la_level_region as Record<string, string[]> | undefined) ?? {}
  /** 시술 부위: LA 코드 표 → 레벨로 정하는 코드는 차트 레벨 → 차트 부위로 좁힘. 관절 주사처럼 표에 없으면 차트 부위 */
  function procRegions(line: Line, chart: ParsedChart): Set<string> {
    const base = line.edi.slice(0, 5)
    let regions = new Set<string>(Object.hasOwn(LACODE, base) ? LACODE[base] : [])
    if (LEVEL_BASED.has(base) && chart.levels.size) {
      const r = new Set<string>()
      for (const letter of chart.levels.keys()) (Object.hasOwn(LEVEL_REGION, letter) ? LEVEL_REGION[letter] : []).forEach((x) => r.add(x))
      if (r.size) regions = r
    }
    if (!regions.size) return new Set(chart.sites)
    const narrowed = [...regions].filter((r) => chart.sites.has(r))
    return narrowed.length ? new Set(narrowed) : regions
  }
  function lesionOf(line: Line, chart: ParsedChart): string {
    if (line.edi.slice(0, 5) === 'LA357') return 'spine_all'
    const regions = [...procRegions(line, chart)].filter((r) => r !== 'spine_any')
    return regions.length === 1 ? regions[0] : 'unknown'
  }

  return {
    REG,
    BY_ID: new Map(file.rules.map((rule) => [rule.id, rule])),
    keyNames: (REG.keys as Record<string, string> | undefined) ?? {},
    views: ((keywords as Rec | undefined)?.views as Record<string, string> | undefined) ?? {},
    rx,
    regionPath,
    keyTest,
    GROUPS,
    CLASSES,
    inGroup,
    pointsOf,
    targetKnown,
    parseChart,
    dxRegions,
    procRegions,
    lesionOf,
  }
}

const memo = new WeakMap<RulesFile, Compiled>()

/** 규칙표마다 한 번만 만든다. 표는 읽기만 한다 */
export function compiled(file: RulesFile): Compiled {
  let out = memo.get(file)
  if (!out) {
    out = compile(file)
    memo.set(file, out)
  }
  return out
}

export const SPINE = ['cervical', 'thoracic', 'lumbosacral', 'sacrococcygeal']

export function overlap(a: Set<string>, b: Set<string>): boolean {
  if (a.has('any') || b.has('any')) return true
  const grow = (set: Set<string>) => {
    const out = new Set(set)
    if (out.has('spine_any')) SPINE.forEach((x) => out.add(x))
    if ([...out].some((x) => SPINE.includes(x))) out.add('spine_any')
    return out
  }
  const A = grow(a)
  const B = grow(b)
  for (const x of A) if (x !== 'spine_any' && B.has(x)) return true
  return false
}

export const sameGroup = (a: string, b: string) =>
  a === 'unknown' || b === 'unknown' || a === b || (a === 'spine_all' && SPINE.includes(b)) || (b === 'spine_all' && SPINE.includes(a))

/** 같은 관절·같은 쪽: 부위·좌우를 모르면 같은 것으로 본다(보수 판정) */
export function sameJoint(a: ParsedChart, b: ParsedChart): boolean {
  if (a.joints.size && b.joints.size && ![...a.joints].some((j) => b.joints.has(j))) return false
  if (a.side === 'unilateral' && b.side === 'unilateral' && (a.right !== b.right || a.left !== b.left)) return false
  return true
}
