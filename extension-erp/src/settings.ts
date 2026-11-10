// 확장 설정(design.md 4절 설정 모양): 처음 값·저장·불러오기·도우미에 보낼 묶음·코드 찾기와 고르기 규칙
// 설정 화면(options.ts)과 ERP 화면 쪽(main.ts)이 같이 쓴다. 그래서 types.js 말고는 불러오지 않는다
import { GROUP_KEYS, RSV_ROWS, SETTINGS_KEY } from './types.js'
import type { ClosingCodes, ClosingDayArgs, EtcKey, Settings } from './types.js'

/** 항목마다 고를 수 있는 코드 수(closing.day args codes max) */
export const MAX_CODES = 20
/** 찾기 결과 수 */
export const MAX_RESULTS = 30
/** 기타1~4 ERP 줄 이름 글자 수 */
export const MAX_ETC_NAME = 20

export const ETC_KEYS: readonly EtcKey[] = ['etc1', 'etc2', 'etc3', 'etc4']

/** 도우미가 받는 코드 모양(closing.day args pattern). 예약 메모 번호도 같은 꼴로 둔다 */
const CODE = /^\S{1,20}$/

/** 처음 값(requirements 이미 정한 것 7). 예약 6줄은 비어 있다(기본값 다). 새 값은 defaults()로 받는다 */
export function defaults(): Settings {
  return {
    v: 1,
    picks: {
      carm: ['CARM1'],
      sono: ['SONO1'],
      arthro: ['HA280'],
      manual: ['도수'],
      eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
      pt: ['MM010', 'MM015', 'MM011'],
      etc1: ['CRYO'],
      ptVisit: ['AA222'],
    },
    etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
    reservations: {},
  }
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

/** 글자 목록에서 틀린 것·겹친 것을 떼고 max개까지 */
function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (out.length >= max) break
    if (typeof item === 'string' && CODE.test(item) && !out.includes(item)) out.push(item)
  }
  return out
}

/** 기타 줄 이름: 앞뒤 공백을 떼고 20자까지 */
export function cleanEtcName(text: string): string {
  return text.trim().slice(0, MAX_ETC_NAME).trim()
}

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
  return { v: 1, picks, etcNames, reservations }
}

/** 저장한 설정. 한 번도 저장하지 않았으면 null(그때는 채우지 않고 설정 화면을 연다, 기본값 다) */
export async function load(): Promise<Settings | null> {
  const got = await chrome.storage.local.get(SETTINGS_KEY)
  return normalize(got[SETTINGS_KEY])
}

/** chrome.storage.local의 erpClosing 한 칸에 쓴다. 쓴 값(모양을 맞춘 것)을 돌려준다 */
export async function save(settings: Settings): Promise<Settings> {
  const clean = normalize(settings)
  if (!clean) throw new Error('settings shape')
  await chrome.storage.local.set({ [SETTINGS_KEY]: clean })
  return clean
}

/** closing.day args groups: 코드가 있는 항목만 GROUP_KEYS 차례로 */
export function toGroups(settings: Settings): ClosingDayArgs['groups'] {
  return GROUP_KEYS.flatMap((key) => {
    const codes = settings.picks[key] ?? []
    return codes.length > 0 ? [{ key, codes: [...codes] }] : []
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
