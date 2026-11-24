// 의원 비교 줄 차례(spec admin-view REQ-8014 AC-8014.3, design.md 기본값 15). 순수 함수.
// 순위 표만 고른 칸으로 줄을 세운다(sortRows·nextSort). 월급·매출 표·나란히 보기는 ownFirst(내 의원 먼저 + 이름 차례)

export type SortDir = 'asc' | 'desc'
export type SortState = { key: string; dir: SortDir }
/** 칸 열쇠 → 값. null·없는 열쇠(급여 없음 포함) = 빈 값(화면 –) */
export type SortValues = Readonly<Record<string, number | null | undefined>>

/** 처음 차례: 총진료비(salesRow total) 내림차순 */
export const FIRST_SORT: SortState = { key: 'total', dir: 'desc' }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'ko')
const valueOf = (values: SortValues, key: string): number | null => {
  const value = values[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 빈 값은 차례와 상관없이 늘 맨 아래(그끼리 이름 차례), 같은 값은 이름 차례. 새 목록을 준다 */
export function sortRows<R extends { name: string; values: SortValues }>(rows: readonly R[], key: string, dir: SortDir): R[] {
  return [...rows].sort((a, b) => {
    const x = valueOf(a.values, key)
    const y = valueOf(b.values, key)
    if (x === null || y === null) return x === y ? byName(a, b) : x === null ? 1 : -1
    return (dir === 'asc' ? x - y : y - x) || byName(a, b)
  })
}

/** 칸 이름을 눌렀을 때: 다른 칸이면 오름, 같은 칸 오름이면 내림, 같은 칸 내림이면 오름 */
export function nextSort(now: SortState, key: string): SortState {
  return { key, dir: now.key === key && now.dir === 'asc' ? 'desc' : 'asc' }
}

/** 내 의원 먼저, 나머지는 이름 차례. 새 목록을 준다 */
export function ownFirst<R extends { name: string; own: boolean }>(rows: readonly R[]): R[] {
  return [...rows].sort((a, b) => (a.own === b.own ? byName(a, b) : a.own ? -1 : 1))
}
