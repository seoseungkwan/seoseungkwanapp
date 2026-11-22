import { isYmd } from '@/lib/analytics/dates'
import { floorNumber } from '@/lib/location/score'

// 건물 층 글·이 자리 찾기·빈 층 짐작(specs/location AC-7909.4, design.md 6절 building·stores). 순수 함수만.
// 층 이름은 건축물대장 층별개요(bld-floor)와 상가정보(stores)가 같은 모양이다: '지1'·'1'·'옥탑'·'옥탑2', 모르면 '층 모름'.
// 받은 층 줄은 아래층부터(지하 깊은 층 → 지상 → 옥탑 → 모름)다. 화면은 시안처럼 위층부터 보인다.
// 빈 층은 상가정보 가게 수로만 짐작한다(공실률 자료는 쓰지 않음, 이 명세가 정한 것 9)

export const UNKNOWN_FLOOR = '층 모름'

type FloorIn = { label: string; usage: string; m2: number }
type StoresIn = { floor: string; count: number }

const squash = (s: string) => s.replace(/\s+/g, '')

/** 층 이름 → 화면 글: '1' → '1층' · '지1' → '지하 1층' · '옥탑' · '옥탑2' → '옥탑 2층' · 그 밖은 그대로 */
export function floorText(label: string): string {
  const above = /^(\d+)$/.exec(label)
  if (above) return `${above[1]}층`
  const below = /^지(\d+)$/.exec(label)
  if (below) return `지하 ${below[1]}층`
  const roof = /^옥탑(\d+)?$/.exec(label)
  if (roof) return roof[1] ? `옥탑 ${roof[1]}층` : '옥탑'
  return label
}

// 옥탑 몇째 층(옥탑·옥상 = 1). 옥탑이 아니면 null
function roofNo(text: string): number | null {
  const m = /^(?:옥탑|옥상)(\d+)?(?:층)?$/.exec(squash(text))
  return m ? Number(m[1] ?? 1) : null
}

/** 후보 층 글(사용자가 적음, '3층'·'지하 1층' 등)과 건물 층 이름이 같은 층인가. 숫자로 견주고(score.ts floorNumber), 옥탑은 옥탑끼리만 */
export function sameFloor(mine: string | null | undefined, label: string): boolean {
  if (typeof mine !== 'string' || squash(mine) === '' || label === UNKNOWN_FLOOR) return false
  const a = roofNo(mine)
  const b = roofNo(label)
  if (a !== null || b !== null) return a === b
  const n = floorNumber(mine)
  return n !== null && n === floorNumber(label)
}

/** 사용승인 뒤 햇수(해끼리 뺌, 시안 그대로). 날짜가 없거나 'YYYY-MM-DD'가 아니면 null */
export function buildingAge(approvedOn: string | null, today: string): number | null {
  if (approvedOn === null || !isYmd(approvedOn) || !isYmd(today)) return null
  return Number(today.slice(0, 4)) - Number(approvedOn.slice(0, 4))
}

// 층 이름마다 묶어 위층부터(같은 층 줄은 받은 차례 그대로), 층 모름은 맨 끝
function topFirst<T>(rows: readonly T[], labelOf: (row: T) => string): T[] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const label = labelOf(row)
    const group = groups.get(label)
    if (group) group.push(row)
    else groups.set(label, [row])
  }
  const known = [...groups].filter(([label]) => label !== UNKNOWN_FLOOR).reverse()
  const unknown = groups.get(UNKNOWN_FLOOR) ?? []
  return [...known.flatMap(([, group]) => group), ...unknown]
}

export type FloorRow = FloorIn & { here: boolean }

/** 층별 표 줄: 위층부터, 후보 층이면 here */
export function floorRows(floors: readonly FloorIn[], mine: string): FloorRow[] {
  return topFirst(floors, (f) => f.label).map((f) => ({ label: f.label, usage: f.usage, m2: f.m2, here: sameFloor(mine, f.label) }))
}

export type VacancyRow = { label: string; stores: number; empty: boolean; here: boolean }
/** rows = 짐작하는 층(위층부터) · empty = 빈 층 같은 층 수 · unknownStores = 층이 적히지 않아 세지 않은 가게 수 */
export type VacancyView = { rows: VacancyRow[]; empty: number; unknownStores: number }

const PARKING = /주차장/

/**
 * 빈 칸 짐작: 건물 층마다 그 층에 들어선 가게 수(상가정보, 후보 30m 안). 가게가 없는 층은 빈 층 같다.
 * 주차장만 있는 층과 층 모름은 짐작하지 않는다. 건물에 없는 층의 가게(둘레 다른 건물)는 세지 않는다
 */
export function vacancyOf(floors: readonly FloorIn[], stores: readonly StoresIn[], mine: string): VacancyView {
  const count = new Map<string, number>()
  for (const s of stores) count.set(s.floor, (count.get(s.floor) ?? 0) + s.count)
  const labels = topFirst(floors, (f) => f.label)
    .map((f) => f.label)
    .filter((label, i, all) => all.indexOf(label) === i && label !== UNKNOWN_FLOOR)
    .filter((label) => !floors.filter((f) => f.label === label).every((f) => PARKING.test(f.usage)))
  const rows = labels.map((label) => {
    const n = count.get(label) ?? 0
    return { label, stores: n, empty: n === 0, here: sameFloor(mine, label) }
  })
  return { rows, empty: rows.filter((r) => r.empty).length, unknownStores: rows.length ? (count.get(UNKNOWN_FLOOR) ?? 0) : 0 }
}
