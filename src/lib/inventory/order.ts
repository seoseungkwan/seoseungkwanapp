// 재고 물품·분류 차례 (spec inventory REQ-7502 AC-7502.5, design.md 2절). 순수 함수만: 받은 배열을 바꾸지 않는다.
// 입력 타입은 필요한 칸만 적는다(src/types/inventory.ts의 InvItem·InvCategory와 칸 이름이 같다)

type OrderCategory = { id: string; sortOrder: number; name: string }
type OrderItem = { categoryId: string; sortOrder: number; name: string }
/** 옮길 줄. 물품은 categoryId 안에서만, 분류(categoryId 없음)는 전체 안에서 옮긴다 */
type Movable = { id: string; categoryId?: string }

const NAME = new Intl.Collator('ko')

/** sort_order → 이름 → 받은 차례 */
function bySortOrder<T extends { sortOrder: number; name: string }>(list: readonly T[]): T[] {
  return list
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.sortOrder - b.value.sortOrder || NAME.compare(a.value.name, b.value.name) || a.index - b.index)
    .map(({ value }) => value)
}

/** 목록 차례: 분류 sort_order → 물품 sort_order → 이름. 목록에 없는 분류의 물품은 맨 뒤 */
export function sortItems<T extends OrderItem>(items: readonly T[], categories: readonly OrderCategory[]): T[] {
  const rank = new Map(bySortOrder(categories).map((c, index) => [c.id, index]))
  const rankOf = (item: T) => rank.get(item.categoryId) ?? rank.size
  return items
    .map((value, index) => ({ value, index }))
    .sort(
      (a, b) =>
        rankOf(a.value) - rankOf(b.value) ||
        a.value.sortOrder - b.value.sortOrder ||
        NAME.compare(a.value.name, b.value.name) ||
        a.index - b.index,
    )
    .map(({ value }) => value)
}

/** id 줄을 같은 묶음(분류) 안 rank 번째로 옮긴 전체 id 차례. 묶음 밖 자리는 다른 줄이 그대로 */
function placeInGroup(sorted: readonly Movable[], id: string, toRank: (slots: number[], from: number) => number | null): string[] {
  const ids = sorted.map((x) => x.id)
  const at = ids.indexOf(id)
  if (at < 0) return ids
  const group = sorted[at].categoryId
  const slots = sorted.flatMap((x, index) => (x.categoryId === group ? [index] : []))
  const from = slots.indexOf(at)
  const to = toRank(slots, from)
  if (to === null || to === from) return ids
  const members = slots.map((index) => ids[index])
  members.splice(to, 0, ...members.splice(from, 1))
  slots.forEach((index, k) => {
    ids[index] = members[k]
  })
  return ids
}

/** 끌어 놓기: toIndex = 전체 목록에서 놓은 자리. 같은 분류의 첫·끝 자리 밖이면 거기서 멈춘다 */
export function moveItem(sorted: readonly Movable[], id: string, toIndex: number): string[] {
  return placeInGroup(sorted, id, (slots) => {
    const before = slots.filter((index) => index < toIndex).length
    return Math.min(before, slots.length - 1)
  })
}

/** ▲▼: 같은 분류 안에서 step(±1)칸. 분류 첫 줄에서 위·끝 줄에서 아래는 그대로 */
export function moveBy(sorted: readonly Movable[], id: string, step: number): string[] {
  return placeInGroup(sorted, id, (slots, from) => {
    const to = from + step
    return to < 0 || to >= slots.length ? null : to
  })
}
