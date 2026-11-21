import { normalizeName } from './names'

// 비트 코드에서 고르기 목록 (spec inventory REQ-7514 AC-7514.1, design.md 2절·8절). 순수 함수만.
// stats_months 줄의 payload->rx(달마다 처방 코드·이름·환자 수, types/payload.ts MonthPayload.rx)에서만 읽는다.
// 코드·이름·수뿐이고 환자 정보는 없다. 입력 타입은 필요한 칸만 적는다(InvItem과 칸 이름이 같다)

export type BitCode = { code: string; name: string; count: number; taken: boolean }

type BitMonth = { month: string; rx: unknown }
type BitItem = { name: string; bitCode: string | null }

const CODE_MAX = 100 // inventory_items.bit_code 1~100자
const NAME_MAX = 40 // inventory_items.name 1~40자
const CONTROL = /\p{Cc}/u
const CONTROLS = /\p{Cc}/gu

const length = (s: string) => Array.from(s).length

/** 이름 다듬기: 제어 문자·빈칸 여럿 → 빈칸 하나, NFC, 앞뒤 빈칸 뗌, 40자. 글자 크기는 그대로(보이는 이름) */
function cleanName(s: string): string {
  const tidy = s.normalize('NFC').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(tidy).slice(0, NAME_MAX).join('').trim()
}

type RxLine = { code: string; name: string; patients: number }

/** rx 한 줄. 코드 1~100자 글자(제어 문자 없음)·이름 있음·환자 수 0 이상 정수가 아니면 null */
function rxLine(value: unknown): RxLine | null {
  if (typeof value !== 'object' || value === null) return null
  const { code, name, patients } = value as Record<string, unknown>
  if (typeof code !== 'string' || typeof name !== 'string') return null
  if (typeof patients !== 'number' || !Number.isSafeInteger(patients) || patients < 0) return null
  const trimmed = code.trim()
  if (trimmed === '' || length(trimmed) > CODE_MAX || CONTROL.test(trimmed)) return null
  const cleaned = cleanName(name)
  return cleaned === '' ? null : { code: trimmed, name: cleaned, patients }
}

/**
 * 달 줄들 → 코드 목록. 코드는 대소문자 없이 하나로 묶고(코드·이름은 가장 늦은 달 값) count = 달마다 환자 수 합,
 * count 큰 차례·같으면 코드 차례. 그 코드가 물품 비트 코드(대소문자 무시)이거나 같은 이름 물품(안 쓰는 물품 포함,
 * normalizeName으로 견줌)이 있으면 taken. items에는 숨긴 물품도 넘긴다
 */
export function bitCodeList(months: readonly BitMonth[], items: readonly BitItem[]): BitCode[] {
  const merged = new Map<string, { code: string; name: string; month: string; count: number }>()
  for (const { month, rx } of months) {
    if (typeof month !== 'string' || !Array.isArray(rx)) continue
    for (const value of rx) {
      const line = rxLine(value)
      if (line === null) continue
      const key = line.code.toUpperCase()
      const seen = merged.get(key)
      if (seen === undefined) {
        merged.set(key, { code: line.code, name: line.name, month, count: line.patients })
        continue
      }
      seen.count += line.patients
      if (month > seen.month) Object.assign(seen, { code: line.code, name: line.name, month })
    }
  }

  const takenCodes = new Set(items.flatMap((i) => (i.bitCode === null ? [] : [i.bitCode.trim().toUpperCase()])))
  const takenNames = new Set(items.map((i) => normalizeName(i.name)))
  return [...merged.entries()]
    .map(([key, { code, name, count }]) => ({
      code,
      name,
      count,
      taken: takenCodes.has(key) || takenNames.has(normalizeName(name)),
    }))
    .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/** 이름·코드에 찾는 말이 들어 있는 것(대소문자·앞뒤 빈칸 무시), 받은 차례 그대로. 비면 모두(새 배열) */
export function searchBitCodes<T extends { code: string; name: string }>(list: readonly T[], q: string): T[] {
  const needle = normalizeName(q)
  if (needle === '') return [...list]
  return list.filter((c) => normalizeName(c.name).includes(needle) || normalizeName(c.code).includes(needle))
}
