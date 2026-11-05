import type { CatalogCode, ClaimMonth, CodeEntry, DrugInfoEntry, Grade, RuleDef, RxLine, Tables, Visit } from '@/types/precheck'
import { compiled, INJECTION_CLASSES, up, type Compiled, type DrugClass } from './compile'
import type { Context, Dx, Hit, Line, LineBase, PastDay, Target } from './types'

// 점검 한 번의 자료(원본의 캐시·전역 값 RXDATA·HIST·CODEMAP·DRUGINFO를 month·tables로 바꾼 것) [환자 자료 구역].
// 원본 baseOf·lineOf·matchTarget·contextOf·pastOf·nameOf를 옮겼다. 점검마다 새로 만들고 Worker 밖으로 내보내지 않는다

// 원본 STEROID · TPL_DEF.lidoCodes: 약 역할을 코드로 정한 기본값. 병원 설정으로 바꾸는 자리는 아직 없다
const STEROID = ['A21', 'A19']
const LIDO_CODES = new Set(['A15'])

const text = (value: unknown) => String(value ?? '').trim()

/** 원본 CODEMAP 한 줄에서 점검이 읽는 칸 */
type Entry = Partial<CodeEntry> & {
  standardCode?: string
  edi?: string
  ediCode?: string
  displayName?: string
  steroid?: boolean
  localAnesthetic?: boolean
  cartilage?: boolean
}

/** 원본 hospital-update-model base: 보험코드에서 기본 시술 코드(LA·KK 세 자리)를 꺼낸다 */
const procedureBase = (value: string) => (/^(?:LA\d{3}|KK\d{3})$/i.test(value) ? value.toUpperCase() : /^LA\d{6}$/i.test(value) ? value.slice(0, 5).toUpperCase() : '')

/**
 * 원본 hospital-code-rules drugNameDefaults·drugNameRoles: 병원이 약 이름을 고치지 않았을 때의 목록(차례가 줄 이름을 정한다)과 역할.
 * 점검이 읽는 역할만 옮겼다. 원본의 injectionDrug는 메모 문구용이라 점검이 읽지 않는다
 */
const DEFAULT_DRUG_NAMES: readonly { name: string; role: 'localAnesthetic' | 'steroid' | 'cartilage' }[] = [
  { name: '리도카인', role: 'localAnesthetic' },
  { name: '트리암', role: 'steroid' },
  { name: '덱사', role: 'steroid' },
  { name: '아라간', role: 'cartilage' },
  { name: '히알', role: 'cartilage' },
]
/** 원본 fresh pendingReview의 종류. 이름 없는 줄은 종류와 상관없이 대기 줄이다 */
const AWAITING_KINDS: readonly CatalogCode['kind'][] = ['drug', 'procedure', 'lab', 'unknown']

/**
 * 처방 목록 한 줄 → 사전 한 줄(점검이 읽는 칸만). 원본 hospital-update-model fresh + 병원 모드 cm을 합쳤다.
 * 보험코드가 확인된 시술은 기본 사전의 이름을 쓴다. 나머지 대기 줄은 이름(이름 없으면 코드 글자)에 기본 약 이름이 들면 그 역할을 얻고 줄 이름도 목록의 이름이 된다.
 * 원본 cm이 함께 바꾸는 k·pendingReview·add·memo 등은 점검이 읽지 않아 옮기지 않았다
 */
function catalogEntry(row: CatalogCode, defaults: Tables['codeMap']): Entry {
  const item: Entry = { n: row.name || row.code, displayName: row.name, standardCode: row.standardCode }
  const standard = procedureBase(row.standardCode)
  const compact = row.name.replace(/\s/g, '')
  const nerve = /신경/.test(compact) && /차단/.test(compact)
  const known = row.kind === 'procedure' && row.name && standard && ((standard.startsWith('LA') && nerve) || ['KK061', 'KK062', 'KK090'].includes(standard))
  if (known && Object.hasOwn(defaults, standard) && defaults[standard].k === 'proc') {
    item.n = defaults[standard].n
    return item
  }
  if (row.name && !AWAITING_KINDS.includes(row.kind)) return item
  const label = (row.name || row.code).toUpperCase()
  const matched = DEFAULT_DRUG_NAMES.filter(({ name }) => label.includes(name))
  if (matched.length) item.n = matched[0].name
  for (const { role } of matched) item[role] = true
  return item
}

function routeOf(info: DrugInfoEntry | null, label: string): string {
  if (info && info[1] && String(info[1]).length >= 7) {
    const r = String(info[1]).charAt(6).toUpperCase()
    if ('ABCD'.includes(r)) return r
  }
  if (/외용|패치|겔|크림|연고|플라스타|파프|카타플라스마|로션|스프레이|patch|\bgel\b|cream|ointment/i.test(label)) return 'C'
  if (/주사|주\s*\d|주(\s|\(|$)|\binj|앰플|바이알|프리필드/i.test(label)) return 'B'
  if (/정\s*\d|정(\s|\(|$)|캡슐|\btab|\bcap|시럽/i.test(label)) return 'A'
  return ''
}

const classHit = (cls: DrugClass, base: LineBase) => cls.codes.has(base.code) || cls.codes.has(base.edi) || Boolean(cls.regex && cls.regex.test(base.label))

export type Run = ReturnType<typeof createRun>

export function createRun(month: ClaimMonth, tables: Tables) {
  const C: Compiled = compiled(tables.rules)
  const lineBases = new Map<string, LineBase>()
  const matchMemo = new WeakMap<Target, Map<string, boolean>>()
  const contexts = new Map<string, Context>()
  let names: Map<string, string> | null = null

  // 병원 처방 목록이 있으면 그 목록이 사전 전부다(원본 병원 모드 hospital-update-model plan: CODEMAP을 통째로 바꾼다).
  // 기본 사전은 한 의원의 표라 목록에 없는 코드(만료·국가 코드)에 빌려 쓰지 않는다. 목록이 없을 때만 본다
  // 줄마다 원본 병원 모드 cm이 돌려주는 값을 미리 만들어 둔다(catalogEntry). 원본은 사전을 바꿀 때 병원 모드도 켜기 때문이다.
  // 열쇠는 대문자로 접는다. 원본 hospital-code-rules importedRow가 글자 그대로 → 대소문자를 접어 하나뿐인 줄 차례로 찾기 때문이다.
  // 처방 줄·이력 코드는 대문자로 오므로 대소문자가 섞인 코드(예: Zm1)도 찾는다. 대소문자만 다른 코드 둘은 도우미가 막아(CatalogRead) 열쇠는 코드마다 하나다
  const catalog = new Map<string, Entry>()
  for (const row of month.catalog.codes) catalog.set(row.code.toUpperCase(), catalogEntry(row, tables.codeMap))
  /** 원본 cm: 목록이 있으면 위처럼 찾고 없는 코드는 없는 것으로 둔다. 목록이 없으면 기본 사전에서 그대로 → 대문자 → 소문자 차례로 찾는다 */
  function cm(code: string): Entry | null {
    if (!code) return null
    if (catalog.size) return catalog.get(code.toUpperCase()) ?? null
    const map = tables.codeMap
    for (const key of [code, code.toUpperCase(), code.toLowerCase()]) if (Object.hasOwn(map, key)) return map[key]
    return null
  }
  const ediOf = (code: string, entry: Entry | null) => up((entry && (entry.standardCode || entry.edi || entry.ediCode)) || code)

  // 원본 requestDrugInfo: 이번 달 처방(RXDATA)의 코드와 그 보험코드 중 9자리만, 나온 차례로 5000개까지 약 표에 묻는다.
  // 이력에만 있는 코드는 묻지 않아 약 정보가 없다. 다른 환자가 이번 달에 처방한 코드면 이력 줄에서도 읽는다
  const nineDigits = new Set<string>()
  for (const list of month.rxDayOrder) {
    for (const item of list) {
      const code = up(item.code)
      const edi = ediOf(code, cm(code))
      if (/^\d{9}$/.test(edi)) nineDigits.add(edi)
      if (/^\d{9}$/.test(code)) nineDigits.add(code)
    }
  }
  const asked = new Set([...nineDigits].slice(0, 5000))
  /** 물었는데 표에 없는 코드는 답에서 빠져, 묻지 않은 코드와 같다(원본 drug_info.lookup) */
  function drugInfo(code: string): DrugInfoEntry | null {
    const map = tables.drugInfo.map
    if (!asked.has(code) || !Object.hasOwn(map, code)) return null
    const info = map[code]
    return [String(info[0] || ''), String(info[1] || ''), String(info[2] || '')]
  }

  function classesOf(base: LineBase, entry: Entry | null): Set<string> {
    const out = new Set<string>()
    for (const [name, cls] of C.CLASSES) {
      if (cls.union) continue
      let found = classHit(cls, base)
      for (const [sub, subCls] of cls.sub) {
        if (classHit(subCls, base)) {
          out.add(`${name}.${sub}`)
          found = true
        }
      }
      if (found) out.add(name)
    }
    // 병원 문구 설정의 약 역할(병원 코드 방식)과 기본 표시
    if (entry) {
      if (entry.steroid === true) out.add('steroid_injection')
      if (entry.localAnesthetic === true) out.add('local_anesthetic')
      if (entry.cartilage === true && ![...out].some((x) => /^(hyaluronate|pn|collagen)/.test(x))) out.add('hyaluronate_20mg')
    }
    if (STEROID.includes(base.code)) out.add('steroid_injection')
    if (LIDO_CODES.has(base.code)) out.add('local_anesthetic')
    // 먹는 약·바르는 약은 주사 분류에서 뺀다(덱사메타손정 ≠ 스테로이드 주사)
    if (base.route === 'A' || base.route === 'C') for (const name of [...out]) if (INJECTION_CLASSES.has(name)) out.delete(name)
    if (base.route === 'B' || base.route === 'C') out.delete('oral_corticosteroid')
    // 비타민 주사 묶음에서 콜레칼시페롤 단독 근육주사는 뺀다(오탐 줄이기)
    if (out.has('vitamin_injection') && [...out].some((x) => x.startsWith('vitamin_d'))) out.delete('vitamin_injection')
    for (const [name, cls] of C.CLASSES) if (cls.union && cls.union.some((u) => out.has(u))) out.add(name)
    return out
  }

  function baseOf(code: string, name: string): LineBase {
    const key = `${code}\u0001${name}`
    const known = lineBases.get(key)
    if (known) return known
    const entry = cm(code)
    const edi = ediOf(code, entry)
    const info = drugInfo(edi) ?? drugInfo(code)
    const label = [name, entry && entry.n, entry && entry.displayName, info && info[2]].filter(Boolean).join(' ')
    const base: LineBase = { key, code, edi, name, label, info, route: routeOf(info, [name, info && info[2]].filter(Boolean).join(' ')), classes: new Set() }
    base.classes = classesOf(base, entry)
    lineBases.set(key, base)
    return base
  }

  function lineOf(item: Pick<RxLine, 'code' | 'name' | 'qty' | 'benefit'>): Line {
    return { ...baseOf(up(item.code), text(item.name)), qty: Number(item.qty) || 0, benefit: item.benefit !== false }
  }

  function matchRaw(line: Line, target: Target): boolean {
    if (
      Array.isArray(target.codes) &&
      target.codes.some((code) => {
        const K = up(code)
        return line.edi === K || line.code === K || (K.length === 5 && line.edi.slice(0, 5) === K)
      })
    ) {
      return true
    }
    if (Array.isArray(target.code_groups) && target.code_groups.some((name) => C.inGroup(line, name))) return true
    if (Array.isArray(target.drug_classes) && target.drug_classes.some((name) => line.classes.has(name))) return true
    if (target.name_regex && C.rx(target.name_regex)?.test(line.label)) return true
    return false
  }
  function matchTarget(line: Line, target: Target | undefined): boolean {
    if (!target) return false
    let memo = matchMemo.get(target)
    if (!memo) {
      memo = new Map()
      matchMemo.set(target, memo)
    }
    let out = memo.get(line.key)
    if (out === undefined) {
      out = matchRaw(line, target)
      memo.set(line.key, out)
    }
    return out
  }

  /** 상병 자료가 아예 없으면 null(원본 store.has() 거짓) */
  function dxOf(v: Visit): Dx[] | null {
    if (!month.hasDx) return null
    return v.dx.map((item) => ({
      code: up(item.c).replace(/[.\s*†]/g, ''),
      raw: text(item.c),
      name: text(item.n),
      pos: item.m === true ? 'main' : item.m === 'x' ? 'excluded' : 'sub',
    }))
  }

  // ── 색인: 차트번호별 처방 날짜(오름차순) · 차트번호+날짜별 내원(첫 진료) ──
  const visitIndex = new Map<string, Visit>()
  for (const v of month.visits) {
    const key = `${v.chart}|${v.date}`
    if (!visitIndex.has(key)) visitIndex.set(key, v)
  }

  /** 이력 줄의 이름: 이번 달 처방(47 표에서 차트·날짜가 처음 나온 차례, 원본 Object.values(RXDATA)) → 코드 묶음 → 사전 */
  function nameOf(code: string): string {
    if (!names) {
      names = new Map()
      for (const list of month.rxDayOrder) {
        for (const item of list) {
          const K = up(item.code)
          if (K && item.name && !names.has(K)) names.set(K, text(item.name))
        }
      }
      for (const group of C.GROUPS.values()) for (const [K, name] of group.names) if (!names.has(K)) names.set(K, name)
    }
    return names.get(code) || cm(code)?.n || ''
  }

  function contextOf(v: Visit): Context {
    const id = `${v.key}|${v.chart}|${v.date}`
    const known = contexts.get(id)
    if (known) return known
    const lines = v.rx.map(lineOf)
    const t = v.lines.join('\n')
    const c: Context = { v, date: v.date, chart: v.chart, lines, ben: lines.filter((l) => l.benefit), dx: dxOf(v), text: t, parsed: C.parseChart(t), classes: new Set(), past: null }
    lines.forEach((line) => line.classes.forEach((x) => c.classes.add(x)))
    contexts.set(id, c)
    return c
  }

  /** 과거 기록: 이번 달 처방내역 + 비트 12개월 이력. 오늘 이전 날짜만 */
  function pastOf(c: Context): PastDay[] {
    if (c.past) return c.past
    type Draft = Pick<PastDay, 'date' | 'lines' | 'text' | 'v'>
    const map = new Map<string, Draft>()
    const days = month.rxByDay.get(c.chart)
    if (days) {
      for (const date of [...days.keys()].sort()) {
        if (date >= c.date) break
        const v = visitIndex.get(`${c.chart}|${date}`) ?? null
        map.set(date, { date, lines: (days.get(date) ?? []).map(lineOf), text: v ? v.lines.join('\n') : '', v })
      }
    }
    const rows = month.history.get(c.chart)
    if (rows) {
      for (const [date, row] of rows) {
        if (date >= c.date) continue
        const known = map.get(date)
        if (known) {
          if (row.memo && !known.text.includes(row.memo)) known.text += (known.text ? '\n' : '') + row.memo
          continue
        }
        map.set(date, { date, lines: row.codes.map((code) => lineOf({ code, name: nameOf(code), qty: 1, benefit: true })), text: row.memo || '', v: null })
      }
    }
    const out = [...map.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p): PastDay => {
        const classes = new Set<string>()
        p.lines.forEach((l) => l.classes.forEach((x) => classes.add(x)))
        return { ...p, parsed: C.parseChart(p.text), classes }
      })
    c.past = out
    return out
  }

  // 상병마스터(원본 DX_I·DX_N)
  const dxI = new Set(tables.dxFlags.I)
  const dxN = new Set(tables.dxFlags.N)

  return { C, month, tables, dxI, dxN, matchTarget, dxOf, contextOf, pastOf }
}

export const hasClass = (c: Pick<Context, 'classes'>, names: string[] | undefined) => (names ?? []).some((name) => c.classes.has(name))
export const isInjected = (l: Line) => [...l.classes].some((x) => INJECTION_CLASSES.has(x))
export const codesText = (lines: Line[]) => [...new Set(lines.map((l) => l.code))].join('·')
export const pct = (n: number) => `${Math.round(n * 100)}%`

export function hit(rule: RuleDef, grade: Grade | null | undefined, message: string | null | undefined, detail: string): Hit {
  return { id: rule.id, rule, grade: grade || rule.grade, message: message || rule.message, detail: detail || '' }
}

export function ingredientOf(line: Line): string {
  if (line.info && line.info[1]) {
    const code = String(line.info[1])
    return code.slice(0, 4) + (code.charAt(6) || '')
  }
  // 약제급여목록 성분이 없으면 상품명 줄기로(괄호 안은 용량이라 쓰지 않음): '합성에페리손정_(50mg/1정)' → '합성에페리손'
  const stem = String(line.name || '')
    .split(/[_(（]/)[0]
    .replace(/\d+(\.\d+)?\s*(mg|g|ml|mcg|㎎|밀리그램|%)?/gi, '')
    .replace(/(서방|이알|cr|sr|정|캡슐|주사|주|시럽|과립|\s)+$/gi, '')
    .trim()
  return stem || line.code
}
