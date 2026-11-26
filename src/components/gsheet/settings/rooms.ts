import type { Dept, Hospital } from './replies'

// 진료과 → 시트 진료실 번호 저절로 붙이기·표 차례·병원 저절로 정하기(spec google-link AC-8516.3).
// 규칙은 비트시트 그대로 옮긴다: Core/Catalog.cs RoomPlan.Plan·DisplayOrder·NaturalCode, Core/HospitalPick.cs Auto·Sorted
// (도우미 helper/src/Precheck.Core/Sheet의 같은 이름과 같다 — 넣을 때 도우미가 붙이는 번호와 화면이 미리 채운 번호가 같게)

export const MAX_ROOM = 10
/** 예전 판 기본 맞춤(OS→1, OS2→2). 다른 병원에서 이것이 그대로면 사람이 맞춘 것이 아니다 */
const OLD_DEFAULT: Record<string, number> = { OS: 1, OS2: 2 }

export const isRoom = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_ROOM

/** 코드 차례: 글자는 글자대로, 숫자 묶음은 수 크기대로(OS2 < OS10) */
export function naturalCompare(a: string, b: string): number {
  const x = a.toUpperCase()
  const y = b.toUpperCase()
  let i = 0
  let j = 0
  const digit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
  while (i < x.length && j < y.length) {
    if (digit(x[i]) && digit(y[j])) {
      const si = i
      const sj = j
      while (digit(x[i])) i++
      while (digit(y[j])) j++
      const na = x.slice(si, i).replace(/^0+/, '')
      const nb = y.slice(sj, j).replace(/^0+/, '')
      if (na.length !== nb.length) return na.length - nb.length
      if (na !== nb) return na < nb ? -1 : 1
    } else {
      if (x[i] !== y[j]) return x[i]! < y[j]! ? -1 : 1
      i++
      j++
    }
  }
  return x.length - i - (y.length - j)
}

const byCode = (a: { code: string }, b: { code: string }) => naturalCompare(a.code, b.code)
const group = (d: Dept) => (d.n90 > 0 ? 0 : d.today ? 1 : 2)

/** 진료실 표 차례: 최근 90일 환자가 있는 과 → 오늘 쓰는 과 → 쓰지 않는 과, 각각 코드 차례 */
export function displayOrder(depts: readonly Dept[]): Dept[] {
  return [...depts].sort((a, b) => group(a) - group(b) || byCode(a, b))
}

/** 대소문자를 가리지 않고 찾은 번호 */
export const roomOf = (rooms: Readonly<Record<string, number>>, code: string): number | undefined => {
  const hit = Object.keys(rooms).find((k) => k.toUpperCase() === code.toUpperCase())
  return hit === undefined ? undefined : rooms[hit]
}

function sameAsOldDefault(rooms: Readonly<Record<string, number>>): boolean {
  const keys = Object.keys(rooms)
  return keys.length === Object.keys(OLD_DEFAULT).length && Object.entries(OLD_DEFAULT).every(([code, n]) => roomOf(rooms, code) === n)
}

/**
 * 새 맞춤이 필요하면 그것, 아니면 null(지금 것 그대로). confirmed = 이 병원 맞춤이 이미 확인됨(deptRoomsHospital = 병원).
 * 맞춘 과가 하나도 없거나 옛 기본값 그대로면 최근 90일 환자가 있는 과(없으면 오늘 쓰는 과)를 코드 차례로 1, 2, …(10까지)
 */
export function planRooms(depts: readonly Dept[], current: Readonly<Record<string, number>>, confirmed: boolean): Record<string, number> | null {
  if (confirmed || depts.length === 0) return null
  const anyMapped = depts.some((d) => isRoom(roomOf(current, d.code)))
  if (anyMapped && !sameAsOldDefault(current)) return null
  let pick = depts.filter((d) => d.n90 > 0)
  if (pick.length === 0) pick = depts.filter((d) => d.today)
  const plan: Record<string, number> = {}
  pick
    .sort(byCode)
    .slice(0, MAX_ROOM)
    .forEach((d, i) => {
      plan[d.code] = i + 1
    })
  return plan
}

/** 병원이 하나뿐이면 그것, 최근 환자가 있는 병원이 딱 하나면 그것. 아니면 ''(사람이 고른다) */
export function autoHospital(hospitals: readonly Hospital[]): string {
  if (hospitals.length === 1) return hospitals[0]!.code
  const active = hospitals.filter((h) => h.recent > 0)
  return active.length === 1 ? active[0]!.code : ''
}

/** 고르기 창 차례: 최근 환자가 많은 차례(같으면 코드 글자 차례) */
export function sortHospitals(hospitals: readonly Hospital[]): Hospital[] {
  return [...hospitals].sort((a, b) => b.recent - a.recent || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}
