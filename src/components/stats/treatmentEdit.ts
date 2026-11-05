// 처방별 추세 묶음 고치기 규칙(spec treatment-trend design.md '고치기 규칙', REQ-1210). 순수 함수: 네트워크·저장소·React 없음.
// 모든 함수는 받은 목록을 바꾸지 않고 새 목록을 돌려준다. 없는 자리를 받으면 같은 내용의 새 목록을 돌려준다.
// 이름 규칙은 매출 묶음의 renameGroup(= DB CHECK)을 그대로 쓴다. 초안에는 빈 이름 칸이 있을 수 있어 검사는 [저장] 때(draftProblem) 한다
import { codeKey } from '@/components/stats/view'
import { deleteGroup, renameGroup, type GroupEditError } from '@/lib/revenue/treatments'
import { RX_GROUP_NAME_MAX, RX_GROUPS_MAX, type RxGroup } from '@/types/rxGroups'

export const TOO_MANY_GROUPS = `묶음은 ${RX_GROUPS_MAX}개까지 만들 수 있어요.`

const NO_NAME = '이름 없는 묶음'
const SAVED = '저장했어요.'
const SAVED_AT_ONCE = '저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.'

const NAME_PROBLEM: Record<GroupEditError, (name: string) => string> = {
  empty: () => '이름이 빈 묶음이 있어요. 이름을 적어 주세요.',
  duplicate: (name) => `"${name}" 묶음이 두 개예요. 이름을 다르게 적어 주세요.`,
  tooLong: () => `묶음 이름은 ${RX_GROUP_NAME_MAX}자까지 쓸 수 있어요.`,
  badChars: () => '줄바꿈 같은 제어 문자는 넣을 수 없어요.',
  digits: () => '숫자를 6개 이상 이어 쓸 수 없어요.',
  tooMany: () => TOO_MANY_GROUPS,
}

const renumber = (groups: readonly RxGroup[]): RxGroup[] => groups.map((g, sortOrder) => ({ ...g, sortOrder }))
const hasCode = (group: RxGroup, key: string) => group.codes.some((c) => codeKey(c) === key)

/** 묶음을 글에 쓸 때의 이름. 비었으면(빈칸만 있어도) '이름 없는 묶음' */
export const groupLabel = (group: RxGroup): string => group.name.trim() || NO_NAME

/** 다른 묶음에서 옮겨 온 뒤 이 묶음 아래에 두는 글(AC-1210.6) */
export const movedNote = (code: string, from: string): string => `${code}을(를) ${from}에서 옮겨 왔어요.`

/** ▲(-1)·▼(1): 이웃과 자리를 바꾼다. 맨 위의 ▲·맨 아래의 ▼는 그대로 */
export function moveGroup(groups: readonly RxGroup[], index: number, step: -1 | 1): RxGroup[] {
  const to = index + step
  if (!groups[index] || !groups[to]) return [...groups]
  const next = [...groups]
  ;[next[index], next[to]] = [next[to], next[index]]
  return renumber(next)
}

/** [+ 묶음 더하기]: 이름이 빈 새 묶음을 끝에. 50개면 'tooMany' */
export function addBlankGroup(groups: readonly RxGroup[]): RxGroup[] | 'tooMany' {
  if (groups.length >= RX_GROUPS_MAX) return 'tooMany'
  return renumber([...groups, { id: null, name: '', codes: [], sortOrder: groups.length }])
}

/** [묶음 지우기]: 다시 묻지 않고 처방째 뺀다 */
export function removeGroup(groups: readonly RxGroup[], index: number): RxGroup[] {
  return deleteGroup([...groups], index)
}

/** 이름 칸: 치는 글자를 그대로 둔다(한글 조합·띄어쓰기가 끊기지 않게). 맞는지는 draftProblem이 [저장] 때 본다 */
export function setName(groups: readonly RxGroup[], index: number, name: string): RxGroup[] {
  return groups.map((g, i) => (i === index ? { ...g, name } : g))
}

/** [빼기]: 그 묶음에서 그 처방 줄을 뺀다 */
export function removeCode(groups: readonly RxGroup[], index: number, code: string): RxGroup[] {
  return groups.map((g, i) => (i === index ? { ...g, codes: g.codes.filter((c) => c !== code) } : g))
}

/** 처방이 든 묶음 자리(대소문자 무시), 없으면 -1 */
export function ownerOf(groups: readonly RxGroup[], code: string): number {
  const key = codeKey(code)
  return groups.findIndex((g) => hasCode(g, key))
}

/**
 * 찾은 처방을 toIndex 묶음 끝에 넣는다. 처방 하나는 한 묶음에만 들므로 다른 묶음에 있으면(대소문자만 달라도) 거기서 뺀다.
 * from = 뺀 묶음 이름(groupLabel), 다른 묶음에 없었으면 null. 이 묶음에 이미 있으면 그대로다
 */
export function pickCode(groups: readonly RxGroup[], toIndex: number, code: string): { groups: RxGroup[]; from: string | null } {
  const key = codeKey(code)
  const target = groups[toIndex]
  if (!target || hasCode(target, key)) return { groups: [...groups], from: null }
  let from: string | null = null
  const next = groups.map((g, i) => {
    if (i === toIndex) return { ...g, codes: [...g.codes, code] }
    if (!hasCode(g, key)) return g
    from ??= groupLabel(g)
    return { ...g, codes: g.codes.filter((c) => codeKey(c) !== key) }
  })
  return { groups: renumber(next), from }
}

/** [저장] 전 이름 검사: 맨 앞 칸의 문제 하나. 앞뒤 빈칸을 떼고 보며, 겹치는 이름은 뒤쪽 칸이 걸린다 */
export function draftProblem(groups: readonly RxGroup[]): { index: number; message: string } | null {
  const trimmed = groups.map((g) => ({ ...g, name: g.name.trim() }))
  for (let index = 0; index < trimmed.length; index += 1) {
    const result = renameGroup(trimmed.slice(0, index + 1), index, trimmed[index].name)
    if (typeof result === 'string') return { index, message: NAME_PROBLEM[result](trimmed[index].name) }
  }
  return null
}

/** 저장할 값: 앞뒤 빈칸을 뗀 이름과 지금 차례(sortOrder 0부터). 묶음 칸 넷만 싣는다 */
export function forSave(groups: readonly RxGroup[]): RxGroup[] {
  return groups.map((g, sortOrder) => ({ id: g.id, name: g.name.trim(), codes: [...g.codes], sortOrder }))
}

const sameCodes = (a: readonly string[], b: readonly string[]) => {
  const x = new Set(a.map(codeKey))
  const y = new Set(b.map(codeKey))
  return x.size === y.size && [...x].every((key) => y.has(key))
}

/**
 * 저장한 뒤의 글(AC-1210.12). 처방이 든 새 묶음(id가 before에 없음)이나 처방 모음이 바뀐 묶음(대소문자 무시 집합)이 있으면
 * 다시 불러와야 숫자가 나오므로 '저장했어요.'만, 없으면 바로 반영했다고 말한다
 */
export function savedNote(before: readonly RxGroup[], after: readonly RxGroup[]): string {
  const saved = new Map(before.filter((g) => g.id !== null).map((g) => [g.id, g]))
  const needsReload = after.some((g) => {
    const was = g.id === null ? undefined : saved.get(g.id)
    return was ? !sameCodes(was.codes, g.codes) : g.codes.length > 0
  })
  return needsReload ? SAVED : SAVED_AT_ONCE
}
