import type { RevenueDayRow } from '@/types/revenue'
import type { WorklogCountKey, WorklogDay, WorklogNumberKey } from '@/types/worklog'
import { cellKindOf, readCell } from './cellText'

// 비트 숫자 맞추기(design.md 20-2·20-3절). 순수 함수다: 통로·저장·화면을 부르지 않는다.
// 비트 숫자는 매출 명령 revenue.days의 하루 줄 하나에서만 온다. 칸 위치로 채우고 항목 이름은 보지 않는다

/** 비트 값이 있는 칸만 */
export type BitValues = Partial<Record<WorklogNumberKey, number>>
export type BitDiffer = { key: WorklogNumberKey; typed: string; bit: number }
export type BitMerge = { day: WorklogDay; bitFields: WorklogNumberKey[]; changed: boolean; differs: BitDiffer[] }

// 20-2절 표: 업무일지 칸 ← revenue.days 칸. 미수발생·지역화폐는 계약에 생기기 전에는 없다
const SOURCE_OF = {
  newPatients: 'newPatients',
  returnPatients: 'returnVisits',
  totalFee: 'total',
  claimAmount: 'insurer',
  cashIn: 'cash',
  cardIn: 'card',
  transferIn: 'transfer',
  unpaidPaid: 'receivableIn',
} as const satisfies Partial<Record<WorklogNumberKey, keyof RevenueDayRow>>
type BitFillKey = keyof typeof SOURCE_OF

const FILL_KEYS = Object.keys(SOURCE_OF) as BitFillKey[]
/** 비트에서 채우는 여덟 칸(20-2절 '채움') */
export const BIT_FILL_KEYS: readonly WorklogNumberKey[] = FILL_KEYS

const COUNT_KEYS: readonly BitFillKey[] = ['newPatients', 'returnPatients'] satisfies readonly WorklogCountKey[]

// 확인 필요 날은 금액 칸을, 나눔만 못 센 날은 조합청구액을 채우지 않는다(값이 와도 지어내지 않는다)
function heldBack(key: BitFillKey, row: RevenueDayRow): boolean {
  if (row.unconfirmed) return !COUNT_KEYS.includes(key)
  return row.splitUnconfirmed && key === 'claimAmount'
}

// 0.13.0 전 도우미의 확인 필요한 날은 총진료비만 그날 비트 총진료비(참고 금액 roughTotal, 0 그대로)로 채운다(bit-total AC-6910.1).
// 음수는 채우지 않는다: 칸에 '-'로 시작하는 글자가 들어가면 readCell이 합계 제외로 읽는다(손으로 적은 음수와 같은 규칙)
function roughFee(row: RevenueDayRow): number | null {
  const fee = row.roughTotal
  return typeof fee === 'number' && fee >= 0 ? fee : null
}

/**
 * 하루 줄 → 업무일지 칸 값. unconfirmed는 확인 필요한 날 가운데 금액 칸을 하나도 못 채운 날만 참이다
 * (roughTotal이 없거나 음수, bit-total AC-6910.1). splitUnconfirmed인 날은 false
 */
export function bitValuesFrom(revenueDay: RevenueDayRow | null): { values: BitValues; unconfirmed: boolean } {
  if (!revenueDay) return { values: {}, unconfirmed: false }
  const values: BitValues = {}
  for (const key of FILL_KEYS) {
    const value = revenueDay[SOURCE_OF[key]]
    if (value !== null && !heldBack(key, revenueDay)) values[key] = value
  }
  if (!revenueDay.unconfirmed) return { values, unconfirmed: false }
  const fee = roughFee(revenueDay)
  if (fee === null) return { values, unconfirmed: true }
  values.totalFee = fee
  return { values, unconfirmed: false }
}

/** 사람이 비트 칸을 고치면 그 칸은 비트 칸이 아니다(화면이 부른다) */
export function dropBitField(bitFields: readonly WorklogNumberKey[], key: WorklogNumberKey): WorklogNumberKey[] {
  return bitFields.filter((field) => field !== key)
}

// 맞추기는 비트 칸 목록에 더하기만 하고, 채우는 여덟 칸 밖은 쓰지 않는다
function changedFrom(
  day: WorklogDay,
  bitFields: readonly WorklogNumberKey[],
  next: WorklogDay,
  fields: readonly WorklogNumberKey[],
): boolean {
  return fields.length !== bitFields.length || FILL_KEYS.some((key) => next[key] !== day[key])
}

// 손으로 적은 칸은 readCell 규칙으로 읽은 숫자가 비트 값과 같을 때만 같다(숫자 없음·합계 제외는 다름)
function sameAsBit(key: WorklogNumberKey, typed: string, bit: number): boolean {
  const read = readCell(cellKindOf(key), typed)
  return read.kind === 'number' && read.value === bit
}

/** 빈 칸은 채우고 비트 칸으로, 비트 칸은 비트 값을 따라가고, 손으로 적은 칸은 그대로 두고 다르면 알린다 */
export function mergeBit(day: WorklogDay, bitFields: readonly WorklogNumberKey[], bit: BitValues): BitMerge {
  const next: WorklogDay = { ...day }
  const fields: WorklogNumberKey[] = [...bitFields]
  const differs: BitDiffer[] = []
  for (const key of FILL_KEYS) {
    const value = bit[key]
    if (value === undefined) continue
    const text = String(value)
    if (fields.includes(key)) {
      next[key] = text
    } else if (!day[key].trim()) {
      next[key] = text
      fields.push(key)
    } else if (!sameAsBit(key, day[key], value)) {
      differs.push({ key, typed: day[key], bit: value })
    }
  }
  return { day: next, bitFields: fields, changed: changedFrom(day, bitFields, next, fields), differs }
}

/** [비트 숫자로 바꾸기]: 적은 글자를 덮어 비트 칸으로 두고, 남은 칸은 mergeBit처럼 맞춘다 */
export function takeBitValue(
  day: WorklogDay,
  bitFields: readonly WorklogNumberKey[],
  key: WorklogNumberKey,
  bit: BitValues,
): BitMerge {
  const value = bit[key]
  if (value === undefined || !BIT_FILL_KEYS.includes(key)) return mergeBit(day, bitFields, bit)
  const fields = bitFields.includes(key) ? [...bitFields] : [...bitFields, key]
  const merged = mergeBit({ ...day, [key]: String(value) }, fields, bit)
  return { ...merged, changed: changedFrom(day, bitFields, merged.day, merged.bitFields) }
}
