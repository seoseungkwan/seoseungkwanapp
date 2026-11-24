// 의사랑 설정(spec erp-uisarang design.md 8-3·9-2): 처음 값·저장 모양·저장·불러오기, [코드 목록 읽기] 목록, 도우미에 보낼 closing.day args,
// 코드 찾기, 비트·의사랑 설정 저장 여부. 설정 화면(uisOptions.ts)과 ERP 화면 쪽(uisFlow.ts)이 같이 쓴다
// - 의사랑 설정은 erpClosingUis 한 칸, 코드 목록은 erpClosingUisCodes 한 칸에만 쓴다. 비트 erpClosing은 읽지도 쓰지도 않는다
//   (savedSources만 있는지 본다 — 값 모양은 보지 않는다)
// - 코드 꼴·기타 이름 정리는 비트 settings.ts 규칙(cleanCode·cleanEtcName·20개)을 그대로 쓴다. settings.ts는 고치지 않는다
import { cleanCode, cleanEtcName, ETC_KEYS, MAX_CODES, MAX_RESULTS } from './settings.js'
import { SETTINGS_KEY } from './types.js'
import { UIS_CODES_KEY, UIS_COUNT_KEYS, UIS_SALES_KEYS, UIS_SETTINGS_KEY } from './uisTypes.js'
import type { UisCodeRow, UisCodes, UisDayArgs, UisSettings } from './uisTypes.js'

/** 코드 목록 줄 수(도우미 closing.uisCodes가 내는 수, design.md 3-3) */
export const MAX_UIS_CODES = 2000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 처음 값(design.md 9-2): 고른 코드 없음, 기타 이름 '' */
export function uisEmpty(): UisSettings {
  return { v: 1, counts: {}, sales: {}, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' } }
}

/**
 * 코드 목록 한 묶음: cleanCode 꼴만, 겹친 것은 앞 것만(대소문자만 다른 것도 겹침 — 도우미는 대문자로 견준다), 20개까지
 */
function cleanCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (out.length >= MAX_CODES) break
    const code = typeof item === 'string' ? cleanCode(item) : null
    if (code === null || seen.has(code.toUpperCase())) continue
    seen.add(code.toUpperCase())
    out.push(code)
  }
  return out
}

/** 묶음 key마다 정리한 코드 목록. 정해 둔 key만, 빈 목록인 묶음은 칸을 두지 않는다 */
function cleanGroups<K extends string>(raw: unknown, keys: readonly K[]): Partial<Record<K, string[]>> {
  const rows = isRecord(raw) ? raw : {}
  const out: Partial<Record<K, string[]>> = {}
  for (const key of keys) {
    const codes = cleanCodes(rows[key])
    if (codes.length > 0) out[key] = codes
  }
  return out
}

/** 저장·불러오기 때 설정 모양으로 맞춘다(design.md 9-2). 객체가 아니거나 판이 1이 아니면 null. 비트 설정 칸은 버린다 */
export function normalizeUis(raw: unknown): UisSettings | null {
  if (!isRecord(raw) || raw.v !== 1) return null
  const rawNames = isRecord(raw.etcNames) ? raw.etcNames : {}
  const etcNames = { etc1: '', etc2: '', etc3: '', etc4: '' }
  for (const key of ETC_KEYS) {
    const name = rawNames[key]
    if (typeof name === 'string') etcNames[key] = cleanEtcName(name)
  }
  return { v: 1, counts: cleanGroups(raw.counts, UIS_COUNT_KEYS), sales: cleanGroups(raw.sales, UIS_SALES_KEYS), etcNames }
}

async function stored(key: string): Promise<unknown> {
  const got = await chrome.storage.local.get(key)
  return got[key]
}

/** 저장한 의사랑 설정. 저장한 적 없거나 모양이 틀리면 null(그때는 채우지 않고 설정 화면을 연다, 시안 ⑭) */
export async function loadUis(): Promise<UisSettings | null> {
  return normalizeUis(await stored(UIS_SETTINGS_KEY))
}

/** [저장](AC-4214.4): erpClosingUis 한 칸에 정리한 모양으로 쓰고 쓴 값을 돌려준다. 모양이 틀리거나 chrome.storage가 못 쓰면 던진다 */
export async function saveUis(s: UisSettings): Promise<UisSettings> {
  const clean = normalizeUis(s)
  if (!clean) throw new Error('uis settings shape')
  await chrome.storage.local.set({ [UIS_SETTINGS_KEY]: clean })
  return clean
}

/**
 * 코드 목록 한 줄(design.md 3-3): 코드는 빈 글자가 아닌 글자(21자 넘어도 목록에는 둔다 — 설정 화면이 고를 수 없게 한다),
 * 처방명칭은 글자 또는 null, 총투여량은 수(소수 가능), 총액은 원 정수. 아니면 null
 */
function cleanRow(raw: unknown): UisCodeRow | null {
  if (!isRecord(raw)) return null
  const { code, name, qty, amount } = raw
  if (typeof code !== 'string' || code.trim() === '') return null
  if (name !== null && typeof name !== 'string') return null
  if (typeof qty !== 'number' || !Number.isFinite(qty) || !Number.isSafeInteger(amount)) return null
  return { code, name, qty, amount: amount as number }
}

/** [코드 목록 읽기] 목록 모양(design.md 9-2). 판·기간·목록 모양이 틀리면 null, 틀린 줄은 빼고 2,000줄까지(차례 그대로) */
export function normalizeCodes(raw: unknown): UisCodes | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.from !== 'string' || typeof raw.to !== 'string' || !Array.isArray(raw.codes)) return null
  const codes: UisCodeRow[] = []
  for (const item of raw.codes) {
    if (codes.length >= MAX_UIS_CODES) break
    const row = cleanRow(item)
    if (row) codes.push(row)
  }
  return { v: 1, from: raw.from, to: raw.to, codes }
}

/** 기억해 둔 코드 목록. 없거나 모양이 틀리면 null(설정 화면 ⑮ '처방 코드 목록이 아직 없어요.') */
export async function loadUisCodes(): Promise<UisCodes | null> {
  return normalizeCodes(await stored(UIS_CODES_KEY))
}

/** 코드 목록을 erpClosingUisCodes 한 칸에 곧바로 쓴다(설정 [저장]과 따로, AC-4214.3). 모양이 틀리거나 못 쓰면 던진다 */
export async function saveUisCodes(c: UisCodes): Promise<void> {
  const clean = normalizeCodes(c)
  if (!clean) throw new Error('uis codes shape')
  await chrome.storage.local.set({ [UIS_CODES_KEY]: clean })
}

/**
 * 의사랑 closing.day args(design.md 3-1): 코드를 고른 묶음만 groups(건수, UIS_COUNT_KEYS 차례)·sales(매출, UIS_SALES_KEYS 차례).
 * 정리하지 않은 설정이 와도 normalizeUis와 같은 꼴로 맞춰 보낸다. 기타 이름은 보내지 않는다
 */
export function toUisArgs(date: string, s: UisSettings): UisDayArgs {
  const clean = normalizeUis(s) ?? uisEmpty()
  return {
    date,
    groups: UIS_COUNT_KEYS.flatMap((key) => {
      const codes = clean.counts[key] ?? []
      return codes.length > 0 ? [{ key, codes: [...codes] }] : []
    }),
    sales: UIS_SALES_KEYS.flatMap((key) => {
      const codes = clean.sales[key] ?? []
      return codes.length > 0 ? [{ key, codes: [...codes] }] : []
    }),
  }
}

/** 코드나 처방명칭에 그 글자가 든 줄(대소문자 무시), 목록 차례(총액 큰 차례) 그대로 30개까지. 빈 글자면 없음 */
export function searchUis(codes: readonly UisCodeRow[], text: string): UisCodeRow[] {
  const q = text.trim().toLowerCase()
  if (!q) return []
  return codes.filter((c) => c.code.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q)).slice(0, MAX_RESULTS)
}

/**
 * 비트 설정(erpClosing)·의사랑 설정(erpClosingUis)이 저장돼 있나(AC-4211.1 단추 이름 정하기). 값 모양은 보지 않고 있는지만 본다.
 * 열쇠 하나씩 읽는다(chrome.storage.local.get(key))
 */
export async function savedSources(): Promise<{ bit: boolean; uis: boolean }> {
  const [bit, uis] = await Promise.all([stored(SETTINGS_KEY), stored(UIS_SETTINGS_KEY)])
  return { bit: bit !== undefined, uis: uis !== undefined }
}
