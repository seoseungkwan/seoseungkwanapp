// 임대 조건 협상표 (spec location AC-7910.3, design.md 11절). 후보 줄 `terms`(jsonb ≤ 6,000바이트)에
// 열쇠 여섯 × { now: 지금 제안, want: 바라는 것 } 글 100자씩을 둔다. 같은 칸의 `terms.memo`(임대 조건 메모, 개원 준비 TASK-42)와
// 모르는 열쇠는 건드리지 않고 그대로 넘긴다. 줄 이름·도움말은 승인된 시안(?s=listings NEGO) 글 그대로

export const TERM_KEYS = ['freeRent', 'mgmt', 'raise', 'restore', 'period', 'premium'] as const
export type TermKey = (typeof TERM_KEYS)[number]
export type TermSide = 'now' | 'want'
export type TermPair = { now: string; want: string }

/** 칸마다 글자 수 끝 */
export const TERM_MAX = 100

export const TERM_ROWS: readonly { key: TermKey; label: string; help: string }[] = [
  { key: 'freeRent', label: '무상 기간', help: '공사하는 동안 월세를 안 내는 기간' },
  { key: 'mgmt', label: '관리비', help: '평당 얼마인지, 전기·물값이 들어 있는지' },
  { key: 'raise', label: '월세 올리는 비율', help: '해마다인지 2년마다인지' },
  { key: 'restore', label: '원상 복구', help: '나갈 때 어디까지 되돌려 놓나' },
  { key: 'period', label: '계약 기간', help: '처음 몇 년, 더 살 권리' },
  { key: 'premium', label: '권리금', help: '바닥 권리금·시설 권리금' },
]

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 저장할 글: 앞뒤 빈칸을 빼고(NFC) 100자까지 */
export function termText(value: string): string {
  return Array.from(value.normalize('NFC').trim()).slice(0, TERM_MAX).join('')
}

/** 저장된 terms에서 한 줄을 읽는다. 모양이 틀린 값은 빈 글자 */
export function termOf(terms: Readonly<Record<string, unknown>>, key: TermKey): TermPair {
  const v = terms[key]
  if (!isRecord(v)) return { now: '', want: '' }
  return { now: typeof v.now === 'string' ? v.now : '', want: typeof v.want === 'string' ? v.want : '' }
}

/** 한 칸을 바꾼 새 terms(받은 것은 그대로 둠). 두 칸이 다 비면 그 열쇠를 뺀다 */
export function withTerm(terms: Readonly<Record<string, unknown>>, key: TermKey, side: TermSide, value: string): Record<string, unknown> {
  const pair: TermPair = { ...termOf(terms, key), [side]: termText(value) }
  const next: Record<string, unknown> = { ...terms }
  if (pair.now === '' && pair.want === '') delete next[key]
  else next[key] = pair
  return next
}
