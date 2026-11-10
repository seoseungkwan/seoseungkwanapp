// 확장 설정(design.md 4절 설정 모양): 처음 값·저장·불러오기·도우미에 보낼 묶음·코드 찾기와 고르기 규칙
// 설정 화면(options.ts)과 ERP 화면 쪽(main.ts)이 같이 쓴다. 그래서 types.js 말고는 불러오지 않는다
import { AMOUNT_KEYS, CODE_PATTERN, GROUP_KEYS, MAX_CODE_LENGTH, PREFIX_PATTERN, RSV_ROWS, SETTINGS_KEY } from './types.js'
import type { AmountKey, AmountRule, ClosingCodes, ClosingDayArgs, EtcKey, OverlapChoice, Settings } from './types.js'

/** 항목마다 고를 수 있는 코드 수(closing.day args codes max) */
export const MAX_CODES = 20
/** 찾기 결과 수 */
export const MAX_RESULTS = 30
/** 기타1~4 ERP 줄 이름 글자 수 */
export const MAX_ETC_NAME = 20
/** 씨암·SONO 매출 규칙 앞글자 수(closing.day args amountPrefixes max). 더 셀 코드는 MAX_CODES(20)개까지 */
export const MAX_PREFIXES = 5

export const ETC_KEYS: readonly EtcKey[] = ['etc1', 'etc2', 'etc3', 'etc4']

const OVERLAP_CHOICES: readonly OverlapChoice[] = ['carm', 'sono', 'both']

/**
 * 처음 값(requirements 이미 정한 것 7). 예약 6줄은 비어 있다(기본값 다). 새 값은 defaults()로 받는다.
 * 물리치료 MM085·MM080·MM020·크라이오 CRYO3은 2026-11-10 밤에 더했다. 이미 저장한 설정에는 저절로 들어가지 않는다.
 * 씨암·SONO 매출 규칙(기본값 (자), TASK-15)은 앞글자 LA · 더 셀 코드 없음이고, 저장값에 규칙이 없으면 normalize가 이 값으로 채운다.
 * 함께 있는 진료 선택(overlap)은 처음엔 없다
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
  }
}

/** 매출 규칙 처음 값 한 묶음(기본값 (자)) */
function defaultRule(): AmountRule {
  return { prefixes: ['LA'], codes: [] }
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
 * 코드 꼴(고른 코드·더 셀 코드·예약 메모 번호, AC-3607.7): 앞뒤 공백을 떼고 가운데 이어진 빈칸을 하나로 줄인 뒤
 * `^\S(?: ?\S)*$` 1~20자면 그 글자, 아니면 null. 탭·다른 빈칸 글자가 든 코드는 받지 않는다(도우미 명령 표와 같은 꼴)
 */
export function cleanCode(text: string): string | null {
  const code = text.trim().replace(/ {2,}/g, ' ')
  return code.length <= MAX_CODE_LENGTH && CODE_PATTERN.test(code) ? code : null
}

/** 매출 규칙 앞글자: 앞뒤 공백을 떼고 대문자로, 빈칸 없는 1~10자면 그 글자, 아니면 null */
export function cleanPrefix(text: string): string | null {
  const prefix = text.trim().toUpperCase()
  return PREFIX_PATTERN.test(prefix) ? prefix : null
}

/** 글자 목록에서 틀린 것·겹친 것을 떼고(clean으로 정리) max개까지 */
function cleanList(value: unknown, max: number, clean: (text: string) => string | null = cleanCode): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (out.length >= max) break
    const text = typeof item === 'string' ? clean(item) : null
    if (text !== null && !out.includes(text)) out.push(text)
  }
  return out
}

/** 기타 줄 이름: 앞뒤 공백을 떼고 20자까지 */
export function cleanEtcName(text: string): string {
  return text.trim().slice(0, MAX_ETC_NAME).trim()
}

/**
 * 매출 규칙 두 묶음. 저장값에 amounts가 없으면(직원이 이미 저장한 설정) 처음 값으로 채우고(한 묶음만 빠졌으면 그 묶음만),
 * 있으면 앞글자는 대문자로 5개까지·더 셀 코드는 코드 꼴로 20개까지 둔다(둘 다 비운 규칙은 빈 그대로)
 */
function cleanAmounts(raw: unknown): Settings['amounts'] {
  const rules = isRecord(raw) ? raw : {}
  const one = (key: AmountKey): AmountRule => {
    const rule = rules[key]
    if (!isRecord(rule)) return defaultRule()
    return { prefixes: cleanList(rule.prefixes, MAX_PREFIXES, cleanPrefix), codes: cleanList(rule.codes, MAX_CODES) }
  }
  return { carm: one('carm'), sono: one('sono') }
}

const isOverlap = (value: unknown): value is OverlapChoice => OVERLAP_CHOICES.includes(value as OverlapChoice)

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
  const settings: Settings = { v: 1, picks, etcNames, reservations, amounts: cleanAmounts(raw.amounts) }
  if (isOverlap(raw.overlap)) settings.overlap = raw.overlap
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
 * 함께 있는 진료 선택(overlap)은 ERP 화면이 saveOverlap으로만 바꾸므로, 여기서는 화면이 가진 값이 아니라 지금 저장된 값을 그대로 둔다
 */
export async function save(settings: Settings): Promise<Settings> {
  const clean = normalize({ ...settings, overlap: undefined })
  if (!clean) throw new Error('settings shape')
  const before = normalize(await stored())
  if (before?.overlap) clean.overlap = before.overlap
  await chrome.storage.local.set({ [SETTINGS_KEY]: clean })
  return clean
}

/** ERP 화면에서 고른 함께 있는 진료 선택만 바꿔 쓴다(설정의 다른 칸은 그대로). 저장한 설정이 없으면 아무것도 쓰지 않는다 */
export async function saveOverlap(choice: OverlapChoice): Promise<void> {
  const current = normalize(await stored())
  if (!current || !isOverlap(choice)) return
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, overlap: choice } })
}

/**
 * closing.day args groups: 코드가 있는 항목만 GROUP_KEYS 차례로. 씨암·SONO에는 매출 규칙의 앞글자·더 셀 코드 둘 중 하나라도 있으면
 * amountPrefixes·amountCodes 두 칸을 붙인다(둘 다 비면 붙이지 않아 TASK-14 규칙). 규칙이 빠진 설정은 normalize처럼 처음 값으로 본다
 */
export function toGroups(settings: Settings): ClosingDayArgs['groups'] {
  const amounts = cleanAmounts(settings.amounts)
  return GROUP_KEYS.flatMap((key) => {
    const codes = settings.picks[key] ?? []
    if (codes.length === 0) return []
    const group: ClosingDayArgs['groups'][number] = { key, codes: [...codes] }
    const rule = (AMOUNT_KEYS as readonly string[]).includes(key) ? amounts[key as AmountKey] : null
    if (rule && (rule.prefixes.length > 0 || rule.codes.length > 0)) {
      group.amountPrefixes = [...rule.prefixes]
      group.amountCodes = [...rule.codes]
    }
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

/** 매출 규칙 앞글자 더하기: 대문자로 끝에 붙인다. 꼴이 틀렸거나 이미 있거나 5개면 그대로 */
export function addPrefix(list: readonly string[], text: string): string[] {
  const prefix = cleanPrefix(text)
  return prefix === null || list.includes(prefix) || list.length >= MAX_PREFIXES ? [...list] : [...list, prefix]
}

/** 예약 메모 번호 더하기: 이미 있으면 그대로 */
export function addKind(list: readonly string[], kind: string): string[] {
  return list.includes(kind) ? [...list] : [...list, kind]
}

/** [×] 빼기 */
export function without(list: readonly string[], value: string): string[] {
  return list.filter((item) => item !== value)
}
