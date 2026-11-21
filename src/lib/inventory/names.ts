// 재고 물품 이름 견주기 (spec inventory REQ-7502 AC-7502.6, design.md 2절). 순수 함수만: 네트워크·DB·React 없음.
// 입력 타입은 필요한 칸만 적는다(src/types/inventory.ts의 InvItem·InvAlias와 칸 이름이 같아 그대로 넘어간다)

export type MatchHow = 'name' | 'alias' | 'ai' | 'new'

type MatchItem = { id: string; name: string; hidden: boolean }
type MatchAlias = { alias: string; itemId: string }
type ReadLine = { name: string; itemId: string | null; unsure: boolean }

/** 견줄 때 쓰는 이름: NFC, 앞뒤 빈칸 뗌, 빈칸 여럿 → 하나, 영문 작은 글자. 별칭(inventory_aliases.alias)도 이 값으로 둔다 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[A-Z]+/g, (m) => m.toLowerCase())
}

/**
 * 명세서에서 읽은 줄마다 목록 물품을 고른다: (1) 이름이 같은 숨기지 않은 물품 (2) 별칭이 같은 물품(기억한 이름)
 * (3) AI가 고른 숨기지 않은 물품 (4) 새 물품(itemId null). 별칭·AI 답이 목록에 없거나 숨긴 물품을 가리키면 건너뛴다
 * (숨긴 물품은 확인 화면 고르기에 없다, AC-7506.5). unsure는 AI가 고른 줄에서만 참으로 남는다('확인해 주세요' 칩)
 */
export function matchLines<L extends ReadLine>(
  lines: readonly L[],
  items: readonly MatchItem[],
  aliases: readonly MatchAlias[],
): (L & { itemId: string | null; how: MatchHow })[] {
  const shown = new Map<string, MatchItem>()
  const byName = new Map<string, string>()
  for (const item of items) {
    if (item.hidden) continue
    shown.set(item.id, item)
    const key = normalizeName(item.name)
    if (!byName.has(key)) byName.set(key, item.id)
  }
  const byAlias = new Map<string, string>()
  for (const { alias, itemId } of aliases) {
    const key = normalizeName(alias)
    if (shown.has(itemId) && !byAlias.has(key)) byAlias.set(key, itemId)
  }

  return lines.map((line) => {
    const key = normalizeName(line.name)
    const named = key === '' ? undefined : byName.get(key)
    if (named !== undefined) return { ...line, itemId: named, unsure: false, how: 'name' as const }
    const aliased = key === '' ? undefined : byAlias.get(key)
    if (aliased !== undefined) return { ...line, itemId: aliased, unsure: false, how: 'alias' as const }
    if (line.itemId !== null && shown.has(line.itemId)) return { ...line, itemId: line.itemId, how: 'ai' as const }
    return { ...line, itemId: null, unsure: false, how: 'new' as const }
  })
}
