// 확장 설정(design.md 4절 설정 모양): 처음 값·저장·불러오기·도우미에 보낼 묶음·코드 찾기와 고르기 규칙,
// [저장] 전 검사(겹침·처방 없는 코드)와 처음 값 판(TASK-18), 읽지 않을 처방 규칙(REQ-3709, design.md 11절)
// 설정 화면(options.ts)과 ERP 화면 쪽(main.ts)이 같이 쓴다. 그래서 types.js와 고정 줄 이름(cells.js, types.js만 부름) 말고는 불러오지 않는다
import { ETC_CLASH_ROWS } from './cells.js'
import { AMOUNT_KEYS, CODE_PATTERN, EXCLUDE_KEYS, GROUP_KEYS, MAX_CODE_LENGTH, RSV_ROWS, SETTINGS_KEY } from './types.js'
import type {
  AmountKey,
  AmountRule,
  ClosingCodes,
  ClosingDay,
  ClosingDayArgs,
  EtcKey,
  ExcludeRule,
  GroupKey,
  OverlapChoice,
  RsvRow,
  Settings,
} from './types.js'

/**
 * 처음 값 판(기본값 (타)). 2 = 물리치료 MM085·MM080·MM020 · 크라이오 CRYO3을 더한 판(2026-11-10 밤).
 * 저장값의 defaultsSeen이 이보다 작으면 설정 화면이 '새 처음 코드'를 알리고, [저장]하면 이 값으로 쓴다
 */
export const DEFAULTS_VERSION = 2

/** 항목마다 고를 수 있는 코드 수(closing.day args codes max) */
export const MAX_CODES = 20
/** 찾기 결과 수 */
export const MAX_RESULTS = 30
/** 기타1~4 ERP 줄 이름 글자 수 */
export const MAX_ETC_NAME = 20
/** 읽지 않을 처방: 줄마다 규칙 수 · 규칙마다 같이 있을 처방 수(closing.day exclude 꼴, AC-3709.2) */
export const MAX_RULES = 20
export const MAX_WITH = 5

export const ETC_KEYS: readonly EtcKey[] = ['etc1', 'etc2', 'etc3', 'etc4']

const OVERLAP_CHOICES: readonly OverlapChoice[] = ['carm', 'sono', 'both']

/**
 * 처음 값(requirements 이미 정한 것 7). 예약 6줄은 비어 있다(기본값 다). 새 값은 defaults()로 받는다.
 * 물리치료 MM085·MM080·MM020·크라이오 CRYO3은 2026-11-10 밤에 더했다. 이미 저장한 설정에는 저절로 들어가지 않는다.
 * 씨암·SONO 매출 규칙(REQ-3707)은 셀 코드 없음이고(앞글자는 읽지 않아 늘 빈 목록), 저장값에 규칙이 없으면 normalize가 이 값으로 채운다.
 * 함께 있는 진료 선택(overlap)은 처음엔 없다. defaultsSeen은 지금 처음 값 판(DEFAULTS_VERSION)이다
 */
export function defaults(): Settings {
  return {
    v: 1,
    picks: {
      carm: ['CARM1'],
      sono: ['SONO1'],
      arthro: ['HA280'],
      manual: ['도수'],
      eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
      pt: ['MM010', 'MM015', 'MM011', 'MM085', 'MM080', 'MM020'],
      etc1: ['CRYO', 'CRYO3'],
      ptVisit: ['AA222'],
    },
    etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
    reservations: {},
    amounts: { carm: defaultRule(), sono: defaultRule() },
    defaultsSeen: DEFAULTS_VERSION,
  }
}

/** 매출 규칙 처음 값 한 묶음(AC-3707.2): 셀 코드 없음. prefixes는 도우미 모양 때문에 남긴 칸이라 늘 빈 목록 */
function defaultRule(): AmountRule {
  return { prefixes: [], codes: [] }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}

/** 처음 값(읽기만) */
export const DEFAULTS: Readonly<Settings> = deepFreeze(defaults())

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 코드 꼴(고른 코드·셀 코드·예약 메모 번호, AC-3607.7): 앞뒤 공백을 떼고 가운데 이어진 빈칸을 하나로 줄인 뒤
 * `^\S(?: ?\S)*$` 1~20자면 그 글자, 아니면 null. 탭·다른 빈칸 글자가 든 코드는 받지 않는다(도우미 명령 표와 같은 꼴)
 */
export function cleanCode(text: string): string | null {
  const code = text.trim().replace(/ {2,}/g, ' ')
  return code.length <= MAX_CODE_LENGTH && CODE_PATTERN.test(code) ? code : null
}

/** 글자 목록에서 틀린 것·겹친 것을 떼고(cleanCode로 정리) max개까지 */
function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (out.length >= max) break
    const text = typeof item === 'string' ? cleanCode(item) : null
    if (text !== null && !out.includes(text)) out.push(text)
  }
  return out
}

/** 기타 줄 이름: 앞뒤 공백을 떼고 20자까지 */
export function cleanEtcName(text: string): string {
  return text.trim().slice(0, MAX_ETC_NAME).trim()
}

/**
 * 매출 규칙 두 묶음. 저장값에 amounts가 없으면(직원이 이미 저장한 설정) 처음 값(셀 코드 없음)으로 채우고(한 묶음만 빠졌으면 그 묶음만),
 * 있으면 셀 코드만 코드 꼴로 20개까지 둔다. 저장값의 앞글자(전 판 처음 값 LA 등)는 읽지 않고 버려 늘 빈 목록이다(AC-3707.2)
 */
function cleanAmounts(raw: unknown): Settings['amounts'] {
  const rules = isRecord(raw) ? raw : {}
  const one = (key: AmountKey): AmountRule => {
    const rule = rules[key]
    if (!isRecord(rule)) return defaultRule()
    return { prefixes: [], codes: cleanList(rule.codes, MAX_CODES) }
  }
  return { carm: one('carm'), sono: one('sono') }
}

// --- 읽지 않을 처방 규칙(REQ-3709, design.md 11절) ---

const isAmountKey = (key: GroupKey): key is AmountKey => (AMOUNT_KEYS as readonly string[]).includes(key)

/** 규칙의 '이 처방'이 될 수 있는 코드: 그 줄 고른 코드, 씨암·SONO는 이어서 셀 코드(겹친 것은 한 번) */
function ownCodes(key: GroupKey, picks: Settings['picks'], amounts: Settings['amounts'] | undefined): string[] {
  const cells = isAmountKey(key) ? (amounts?.[key]?.codes ?? []) : []
  return [...(picks[key] ?? []), ...cells].filter((code, i, all) => all.indexOf(code) === i)
}

/** 설정 화면 '이 처방' 고르기 목록(AC-3709.1) */
export function ruleCodes(settings: Settings, key: GroupKey): string[] {
  return ownCodes(key, settings.picks, settings.amounts)
}

/** 이 처방 · 같이 있을 처방(차례 상관없이) · 빼는 때가 모두 같은 규칙인가 */
function sameRule(a: ExcludeRule, b: ExcludeRule): boolean {
  return a.code === b.code && a.all === b.all && a.with.length === b.with.length && a.with.every((code) => b.with.includes(code))
}

/** 규칙 하나: code는 그 줄 코드에 있어야 하고, with는 코드 꼴만·겹침·code와 같은 것을 떼고 5개까지(비면 null), all은 참일 때만 true */
function cleanRule(raw: unknown, own: readonly string[]): ExcludeRule | null {
  if (!isRecord(raw) || typeof raw.code !== 'string') return null
  const code = cleanCode(raw.code)
  if (code === null || !own.includes(code)) return null
  const withs: string[] = []
  for (const item of Array.isArray(raw.with) ? raw.with : []) {
    if (withs.length >= MAX_WITH) break
    const other = typeof item === 'string' ? cleanCode(item) : null
    if (other !== null && other !== code && !withs.includes(other)) withs.push(other)
  }
  return withs.length > 0 ? { code, with: withs, all: raw.all === true } : null
}

/**
 * 읽지 않을 처방 규칙 다듬기(design.md 11절): EXCLUDE_KEYS 줄만(모르는 key·injection·ptVisit 버림) 줄마다 cleanRule로 맞추고,
 * 똑같은 규칙은 앞 것만 20개까지. 규칙이 있는 줄만 둔다. 줄에서 코드를 빼면 이것으로 그 코드가 '이 처방'인 규칙이 빠진다
 */
export function cleanExcludes(
  raw: unknown,
  picks: Settings['picks'],
  amounts: Settings['amounts'] | undefined,
): NonNullable<Settings['excludes']> {
  const rows = isRecord(raw) ? raw : {}
  const out: NonNullable<Settings['excludes']> = {}
  for (const key of EXCLUDE_KEYS) {
    const list = rows[key]
    if (!Array.isArray(list)) continue
    const own = ownCodes(key, picks, amounts)
    const rules: ExcludeRule[] = []
    for (const item of list) {
      if (rules.length >= MAX_RULES) break
      const rule = cleanRule(item, own)
      if (rule && !rules.some((r) => sameRule(r, rule))) rules.push(rule)
    }
    if (rules.length > 0) out[key] = rules
  }
  return out
}

/** [규칙 더하기]를 막는 까닭(AC-3709.4): '이 처방' 안 고름 · 같이 있을 처방 없음 · 똑같은 규칙이 있음 · 20개 */
export type RuleProblem = 'noCode' | 'noWith' | 'same' | 'full'

/** 새 규칙을 그 줄 규칙 끝에 더할 수 있으면 null, 아니면 까닭(이 차례로 본다) */
export function ruleProblem(rules: readonly ExcludeRule[], rule: ExcludeRule): RuleProblem | null {
  if (!rule.code) return 'noCode'
  if (rule.with.length === 0) return 'noWith'
  if (rules.some((r) => sameRule(r, rule))) return 'same'
  if (rules.length >= MAX_RULES) return 'full'
  return null
}

const isOverlap = (value: unknown): value is OverlapChoice => OVERLAP_CHOICES.includes(value as OverlapChoice)

/** 처음 값 판: 1 이상 정수면 그 수, 없거나 틀리면 1(TASK-18 전에 저장한 설정) */
const cleanSeen = (value: unknown): number => (Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : 1)

/** 저장·불러오기 때 설정 모양으로 맞춘다. 판이 1이 아니거나 객체가 아니면 null */
export function normalize(raw: unknown): Settings | null {
  if (!isRecord(raw) || raw.v !== 1) return null
  const rawPicks = isRecord(raw.picks) ? raw.picks : {}
  const picks: Settings['picks'] = {}
  for (const key of GROUP_KEYS) {
    const codes = cleanList(rawPicks[key], MAX_CODES)
    if (codes.length > 0) picks[key] = codes
  }
  const rawNames = isRecord(raw.etcNames) ? raw.etcNames : {}
  const etcNames = { etc1: '', etc2: '', etc3: '', etc4: '' }
  for (const key of ETC_KEYS) {
    const name = rawNames[key]
    if (typeof name === 'string') etcNames[key] = cleanEtcName(name)
  }
  const rawRsv = isRecord(raw.reservations) ? raw.reservations : {}
  const reservations: Settings['reservations'] = {}
  for (const row of RSV_ROWS) {
    const kinds = cleanList(rawRsv[row], Infinity)
    if (kinds.length > 0) reservations[row] = kinds
  }
  const amounts = cleanAmounts(raw.amounts)
  const settings: Settings = { v: 1, picks, etcNames, reservations, amounts }
  // 읽지 않을 처방 규칙은 있는 줄만, 하나도 없으면 칸을 두지 않는다(지금 저장 모양 그대로)
  const excludes = cleanExcludes(raw.excludes, picks, amounts)
  if (Object.keys(excludes).length > 0) settings.excludes = excludes
  if (isOverlap(raw.overlap)) settings.overlap = raw.overlap
  settings.defaultsSeen = cleanSeen(raw.defaultsSeen)
  return settings
}

async function stored(): Promise<unknown> {
  const got = await chrome.storage.local.get(SETTINGS_KEY)
  return got[SETTINGS_KEY]
}

/** 저장한 설정. 한 번도 저장하지 않았으면 null(그때는 채우지 않고 설정 화면을 연다, 기본값 다) */
export async function load(): Promise<Settings | null> {
  return normalize(await stored())
}

/**
 * chrome.storage.local의 erpClosing 한 칸에 쓴다. 쓴 값(모양을 맞춘 것)을 돌려준다.
 * 함께 있는 진료 선택(overlap)은 ERP 화면이 saveOverlap으로만 바꾸므로, 여기서는 화면이 가진 값이 아니라 지금 저장된 값을 그대로 둔다.
 * 처음 값 판(defaultsSeen)은 늘 지금 판으로 쓴다(새 처음 코드를 더하지 않고 저장해도 다시 알리지 않는다, AC-3615.6).
 * chrome.storage가 쓰지 못하면 그 오류를 그대로 던진다(설정 화면이 저장 실패 글을 보인다)
 */
export async function save(settings: Settings): Promise<Settings> {
  const clean = normalize({ ...settings, overlap: undefined })
  if (!clean) throw new Error('settings shape')
  const before = normalize(await stored())
  if (before?.overlap) clean.overlap = before.overlap
  clean.defaultsSeen = DEFAULTS_VERSION
  await chrome.storage.local.set({ [SETTINGS_KEY]: clean })
  return clean
}

/**
 * 함께 있는 진료(씨암·SONO 둘 다 든 진료)를 어디에 넣을지 물어야 하나(REQ-3710, spec erp-closing-range design.md 13절).
 * 줄마다 '돈 코드' = 그 줄 셀 코드(amounts)가 있으면 셀 코드, 없으면 그 줄 고른 코드(picks). 씨암·SONO 돈 코드에 같은 코드가
 * 하나라도 있을 때(대문자·앞뒤 공백 뗀 값으로 견줌)만 true — 그때만 같은 금액이 두 줄에 두 번 들어간다
 */
export function overlapNeedsAsk(settings: Settings): boolean {
  const tidy = (list: readonly string[] | undefined) => (list ?? []).map((code) => code.trim().toUpperCase()).filter((code) => code !== '')
  const money = (key: AmountKey) => {
    const cells = tidy(settings.amounts?.[key]?.codes)
    return cells.length > 0 ? cells : tidy(settings.picks[key])
  }
  const sono = new Set(money('sono'))
  return money('carm').some((code) => sono.has(code))
}

/**
 * 그날 함께 있는 진료를 어디에 넣을지 물을까(REQ-3711 AC-3711.2, design.md 14절 — 하루·기간 같은 조건 한 곳).
 * 함께 있는 진료가 있고(visits > 0), 도우미가 그날 두 번 센 돈(shared)을 주면 shared > 0일 때만 true.
 * shared 칸이 없는 옛 도우미 답이면 설정만 보고(overlapNeedsAsk, AC-3710.1·AC-3710.2) 정한다
 */
export function overlapAsks(overlap: ClosingDay['overlap'], settings: Settings): boolean {
  if (!overlap || overlap.visits <= 0) return false
  return typeof overlap.shared === 'number' ? overlap.shared > 0 : overlapNeedsAsk(settings)
}

/** ERP 화면에서 고른 함께 있는 진료 선택만 바꿔 쓴다(설정의 다른 칸은 그대로). 저장한 설정이 없으면 아무것도 쓰지 않는다 */
export async function saveOverlap(choice: OverlapChoice): Promise<void> {
  const current = normalize(await stored())
  if (!current || !isOverlap(choice)) return
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, overlap: choice } })
}

/**
 * closing.day args groups: 코드가 있는 항목만 GROUP_KEYS 차례로. 씨암·SONO에는 셀 코드가 있을 때만
 * amountPrefixes(늘 빈 목록, 도우미 0.2.0 모양)·amountCodes 두 칸을 붙인다(셀 코드가 비면 붙이지 않아 TASK-14 규칙, AC-3707.2).
 * 규칙이 빠진 설정은 normalize처럼 처음 값(셀 코드 없음)으로 본다.
 * 읽지 않을 처방 규칙이 있는 묶음에만 exclude: [{ code, with, all }]를 붙인다(AC-3709.3, normalize와 같은 다듬기)
 */
export function toGroups(settings: Settings): ClosingDayArgs['groups'] {
  const amounts = cleanAmounts(settings.amounts)
  const excludes = cleanExcludes(settings.excludes, settings.picks, amounts)
  return GROUP_KEYS.flatMap((key) => {
    const codes = settings.picks[key] ?? []
    if (codes.length === 0) return []
    const group: ClosingDayArgs['groups'][number] = { key, codes: [...codes] }
    const rule = isAmountKey(key) ? amounts[key] : null
    if (rule && rule.codes.length > 0) {
      group.amountPrefixes = []
      group.amountCodes = [...rule.codes]
    }
    const rules = excludes[key]
    if (rules) group.exclude = rules.map((r) => ({ code: r.code, with: [...r.with], all: r.all }))
    return [group]
  })
}

/** 코드나 이름에 그 글자가 든 코드(대소문자 무시), 1년 진료 수가 많은 차례로 30개까지. 빈 글자면 없음 */
export function search(codes: ClosingCodes['codes'], text: string): ClosingCodes['codes'] {
  const q = text.trim().toLowerCase()
  if (!q) return []
  return codes
    .filter((c) => c.code.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, MAX_RESULTS)
}

/** 코드 더하기: 끝에 붙인다. 이미 있거나 20개면 그대로 */
export function addCode(list: readonly string[], code: string): string[] {
  return list.includes(code) || list.length >= MAX_CODES ? [...list] : [...list, code]
}

/** 예약 메모 번호 더하기: 이미 있으면 그대로 */
export function addKind(list: readonly string[], kind: string): string[] {
  return list.includes(kind) ? [...list] : [...list, kind]
}

/** [×] 빼기 */
export function without(list: readonly string[], value: string): string[] {
  return list.filter((item) => item !== value)
}

// --- [저장] 전 검사·처음 값 판(TASK-18, design.md 4절 settings.ts) ---

/**
 * 새 처음 코드(AC-3615.6): 저장값의 처음 값 판이 지금 판보다 작으면, 처음 값 코드 가운데 저장값 그 항목에 없는 코드를
 * GROUP_KEYS 차례로(항목마다 처음 값 차례). 판이 같거나 크면 없음
 */
export function newDefaultCodes(saved: Settings): { key: GroupKey; codes: string[] }[] {
  if (cleanSeen(saved.defaultsSeen) >= DEFAULTS_VERSION) return []
  const first = defaults().picks
  return GROUP_KEYS.flatMap((key) => {
    const mine = saved.picks[key] ?? []
    const codes = (first[key] ?? []).filter((code) => !mine.includes(code))
    return codes.length > 0 ? [{ key, codes }] : []
  })
}

/**
 * [처음 값으로] → [바꾸기](AC-3615.5): 고른 코드(picks)·씨암·SONO 매출 규칙(amounts)만 처음 값이고 읽지 않을 처방 규칙은 비운다
 * (AC-3709.4, 처음 값은 규칙 없음이라 칸을 뺀다). 나머지 칸은 그대로(새 복사본)
 */
export function resetCodes(settings: Settings): Settings {
  const first = defaults()
  const copy = JSON.parse(JSON.stringify(settings)) as Settings
  delete copy.excludes
  return { ...copy, picks: first.picks, amounts: first.amounts }
}

/** 코드 견주기 꼴: 대문자(AC-3607.7) */
const codeKey = (code: string) => code.toUpperCase()

/**
 * 최근 1년에 처방이 없는 코드(AC-3615.4, 기본값 (타)): 이번에 새로 고른 코드(저장값 그 항목에 없던 것, 저장값이 없으면 모두,
 * 씨암·SONO 매출 규칙 셀 코드 포함) 가운데 도우미 목록(list)에 없는 것. GROUP_KEYS 차례이고 씨암·SONO는 고른 코드 다음에 셀 코드
 */
export function unusedCodes(settings: Settings, saved: Settings | null, list: ClosingCodes['codes']): { key: GroupKey; code: string }[] {
  const known = new Set(list.map((c) => codeKey(c.code)))
  const fresh = (key: GroupKey, mine: readonly string[], before: readonly string[] | undefined) => {
    const had = new Set((before ?? []).map(codeKey))
    return mine.filter((code) => !known.has(codeKey(code)) && (saved === null || !had.has(codeKey(code)))).map((code) => ({ key, code }))
  }
  return GROUP_KEYS.flatMap((key) => {
    const found = fresh(key, settings.picks[key] ?? [], saved?.picks[key])
    if (!(AMOUNT_KEYS as readonly string[]).includes(key)) return found
    const amountKey = key as AmountKey
    return [...found, ...fresh(key, settings.amounts?.[amountKey]?.codes ?? [], saved?.amounts?.[amountKey]?.codes)]
  })
}

/** [저장]을 막는 겹침 하나(AC-3615.7, design.md 5-3 막는 글 셋의 재료) */
export type Conflict =
  | { kind: 'fixedName'; etc: EtcKey; name: string }
  | { kind: 'sameName'; etcs: EtcKey[]; name: string }
  | { kind: 'sameMemo'; memo: string; rows: RsvRow[] }

/** 줄 이름 견주기 꼴: 앞뒤 빈칸을 떼고 이어진 빈칸을 하나로, 영문 대소문자 무시 */
const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase()
const FIXED_NAMES = new Set(ETC_CLASH_ROWS.map(nameKey))

/**
 * [저장] 전 겹침(AC-3615.7). 차례: 기타 이름이 업무일지 2 고정 줄 이름(cells.ts ETC_CLASH_ROWS)과 같음(기타 줄 차례) →
 * 두 기타 줄 이름이 같음(고정 줄 이름과 같은 것은 앞에서 알렸으니 빼고) → 같은 예약 메모 번호가 두 줄 이상(RSV_ROWS 차례로 처음 나온 번호 차례).
 * 빈 기타 이름은 겹치지 않는다. 보이는 이름은 앞뒤 빈칸을 뗀 그대로
 */
export function conflicts(settings: Settings): Conflict[] {
  const out: Conflict[] = []
  const named = ETC_KEYS.map((etc) => ({ etc, name: cleanEtcName(settings.etcNames[etc] ?? '') })).filter((n) => n.name !== '')
  for (const { etc, name } of named) {
    if (FIXED_NAMES.has(nameKey(name))) out.push({ kind: 'fixedName', etc, name })
  }
  const sameNames = new Map<string, { etcs: EtcKey[]; name: string }>()
  for (const { etc, name } of named) {
    const key = nameKey(name)
    if (FIXED_NAMES.has(key)) continue
    const group = sameNames.get(key)
    if (group) group.etcs.push(etc)
    else sameNames.set(key, { etcs: [etc], name })
  }
  for (const group of sameNames.values()) if (group.etcs.length > 1) out.push({ kind: 'sameName', ...group })
  const memos = new Map<string, RsvRow[]>()
  for (const row of RSV_ROWS) {
    for (const memo of cleanList(settings.reservations[row], Infinity)) {
      const rows = memos.get(memo)
      if (rows) rows.push(row)
      else memos.set(memo, [row])
    }
  }
  for (const [memo, rows] of memos) if (rows.length > 1) out.push({ kind: 'sameMemo', memo, rows })
  return out
}
