// 처방별 추세 묶음 고치기 규칙(spec treatment-trend design.md '고치기 규칙', REQ-1210 · group-exclude REQ-3710). 순수 함수: 네트워크·저장소·React 없음.
// 모든 함수는 받은 목록을 바꾸지 않고 새 목록을 돌려준다. 없는 자리를 받으면 같은 내용의 새 목록을 돌려준다.
// 빼는 처방(out)·조건(cond) 칸은 groupOut·groupCond로 읽고, 빈 칸을 새로 만들지 않는다(있던 칸만 새 배열로 돌려준다). 처방이 같은지는 codeKey(대소문자 무시)로 본다.
// 이름 규칙은 매출 묶음의 renameGroup(= DB CHECK)을 그대로 쓴다. 초안에는 빈 이름 칸이 있을 수 있어 검사는 [저장] 때(draftProblem) 한다
import { groupCond, groupKey, groupOut } from '@/components/stats/treatmentView'
import { codeKey } from '@/components/stats/view'
import { renameGroup, type GroupEditError } from '@/lib/revenue/treatments'
import { RX_GROUP_NAME_MAX, RX_GROUPS_MAX, type RxCond, type RxGroup, type StatsRxGroup } from '@/types/rxGroups'

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

const renumber = (groups: readonly StatsRxGroup[]): StatsRxGroup[] => groups.map((g, sortOrder) => ({ ...g, sortOrder }))
const hasKey = (codes: readonly string[], key: string) => codes.some((c) => codeKey(c) === key)
const hasCode = (group: RxGroup, key: string) => hasKey(group.codes, key)
// 넣는 처방 key의 조건 항목을 뺀다. 조건 칸이 없던 묶음은 그대로다
const withoutCond = (group: StatsRxGroup, key: string): StatsRxGroup =>
  group.cond ? { ...group, cond: group.cond.filter((item) => codeKey(item.code) !== key) } : group
// index 자리 묶음만 edit로 바꾼 새 목록
const editAt = (groups: readonly StatsRxGroup[], index: number, edit: (group: StatsRxGroup) => StatsRxGroup): StatsRxGroup[] =>
  groups.map((g, i) => (i === index ? edit(g) : g))

/** 묶음을 글에 쓸 때의 이름. 비었으면(빈칸만 있어도) '이름 없는 묶음' */
export const groupLabel = (group: RxGroup): string => group.name.trim() || NO_NAME

/** 다른 묶음에서 옮겨 온 뒤 이 묶음 아래에 두는 글(AC-1210.6) */
export const movedNote = (code: string, from: string): string => `${code}을(를) ${from}에서 옮겨 왔어요.`

/** 묶음째 고르기 뒤 이 묶음 아래에 두는 글(AC-3710.10). name = 고른 묶음 이름(groupLabel), added = pickOutGroup이 넣은 수 */
export const outNote = (name: string, added: number): string =>
  added > 0 ? `${name} 묶음의 처방 ${added}개를 빼는 처방에 넣었어요.` : `${name} 묶음의 처방은 이미 다 들어 있어요.`

/** ▲(-1)·▼(1): 이웃과 자리를 바꾼다. 맨 위의 ▲·맨 아래의 ▼는 그대로 */
export function moveGroup(groups: readonly StatsRxGroup[], index: number, step: -1 | 1): StatsRxGroup[] {
  const to = index + step
  if (!groups[index] || !groups[to]) return [...groups]
  const next = [...groups]
  ;[next[index], next[to]] = [next[to], next[index]]
  return renumber(next)
}

/** [+ 묶음 더하기]: 이름이 빈 새 묶음을 끝에(빼는 처방·조건 칸 없음). 50개면 'tooMany' */
export function addBlankGroup(groups: readonly StatsRxGroup[]): StatsRxGroup[] | 'tooMany' {
  if (groups.length >= RX_GROUPS_MAX) return 'tooMany'
  return renumber([...groups, { id: null, name: '', codes: [], sortOrder: groups.length }])
}

/** [묶음 지우기]: 다시 묻지 않고 처방째 뺀다(매출 deleteGroup과 같은 규칙: 빼고 차례를 다시 매긴다) */
export function removeGroup(groups: readonly StatsRxGroup[], index: number): StatsRxGroup[] {
  if (!groups[index]) return [...groups]
  return renumber(groups.filter((_, i) => i !== index))
}

/** 이름 칸: 치는 글자를 그대로 둔다(한글 조합·띄어쓰기가 끊기지 않게). 맞는지는 draftProblem이 [저장] 때 본다 */
export function setName(groups: readonly StatsRxGroup[], index: number, name: string): StatsRxGroup[] {
  return editAt(groups, index, (g) => ({ ...g, name }))
}

/** 넣는 처방 [지우기]: 그 묶음에서 그 처방 줄을 빼고, 그 처방의 조건 항목도 같이 뺀다(AC-3710.6) */
export function removeCode(groups: readonly StatsRxGroup[], index: number, code: string): StatsRxGroup[] {
  return editAt(groups, index, (g) => {
    const codes = g.codes.filter((c) => c !== code)
    return codes.length === g.codes.length ? { ...g, codes } : { ...withoutCond(g, codeKey(code)), codes }
  })
}

/** 처방이 든 묶음 자리(넣는 처방만, 대소문자 무시), 없으면 -1 */
export function ownerOf(groups: readonly RxGroup[], code: string): number {
  const key = codeKey(code)
  return groups.findIndex((g) => hasCode(g, key))
}

/**
 * 찾은 처방을 toIndex 묶음 끝에 넣는다. 처방 하나는 한 묶음에만 들므로 다른 묶음에 있으면(대소문자만 달라도) 거기서 그 조건 항목과 함께 뺀다(AC-3710.6).
 * from = 뺀 묶음 이름(groupLabel), 다른 묶음에 없었으면 null. 이 묶음 넣는 처방·빼는 처방에 이미 있으면 그대로다(AC-3710.7)
 */
export function pickCode(groups: readonly StatsRxGroup[], toIndex: number, code: string): { groups: StatsRxGroup[]; from: string | null } {
  const key = codeKey(code)
  const target = groups[toIndex]
  if (!target || hasCode(target, key) || hasKey(groupOut(target), key)) return { groups: [...groups], from: null }
  let from: string | null = null
  const next = groups.map((g, i) => {
    if (i === toIndex) return { ...withoutCond(g, key), codes: [...g.codes, code] }
    if (!hasCode(g, key)) return g
    from ??= groupLabel(g)
    return { ...withoutCond(g, key), codes: g.codes.filter((c) => codeKey(c) !== key) }
  })
  return { groups: renumber(next), from }
}

/** 빼는 처방 고르기: index 묶음 빼는 처방 끝에 넣는다. 그 묶음 넣는 처방·빼는 처방에 이미 있으면 그대로다. 다른 묶음에서 옮기지 않는다(AC-3710.1) */
export function pickOut(groups: readonly StatsRxGroup[], index: number, code: string): StatsRxGroup[] {
  const key = codeKey(code)
  return editAt(groups, index, (g) => (hasCode(g, key) || hasKey(groupOut(g), key) ? g : { ...g, out: [...groupOut(g), code] }))
}

/**
 * 묶음째 고르기: from 묶음 넣는 처방 가운데 index 묶음 넣는 처방·빼는 처방에 없는 것을 from 차례대로 index 빼는 처방 끝에 복사한다(AC-3710.2).
 * from 묶음은 그대로다(나중에 그 묶음을 고쳐도 따라 바뀌지 않는다). added = 넣은 수
 */
export function pickOutGroup(groups: readonly StatsRxGroup[], index: number, from: number): { groups: StatsRxGroup[]; added: number } {
  const target = groups[index]
  const source = groups[from]
  if (!target || !source) return { groups: [...groups], added: 0 }
  const taken = new Set([...target.codes, ...groupOut(target)].map(codeKey))
  const adding = source.codes.filter((c) => {
    const key = codeKey(c)
    if (taken.has(key)) return false
    taken.add(key)
    return true
  })
  if (adding.length === 0) return { groups: [...groups], added: 0 }
  return { groups: editAt(groups, index, (g) => ({ ...g, out: [...groupOut(g), ...adding] })), added: adding.length }
}

/** 빼는 처방 [지우기]: 그 빼는 처방만 뺀다(AC-3710.3) */
export function removeOut(groups: readonly StatsRxGroup[], index: number, code: string): StatsRxGroup[] {
  const key = codeKey(code)
  return editAt(groups, index, (g) => (g.out ? { ...g, out: g.out.filter((c) => codeKey(c) !== key) } : g))
}

/**
 * 조건 처방 고르기: 넣는 처방 code의 조건 끝에 unless를 넣는다(항목이 없으면 끝에 만들고, code는 넣는 처방 글자 그대로).
 * unless가 code 자신이거나 이미 있으면, code가 그 묶음 넣는 처방이 아니면 그대로다(AC-3710.4). unless는 어떤 처방이든 된다
 */
export function addCond(groups: readonly StatsRxGroup[], index: number, code: string, unless: string): StatsRxGroup[] {
  const key = codeKey(code)
  const other = codeKey(unless)
  return editAt(groups, index, (g) => {
    const own = g.codes.find((c) => codeKey(c) === key)
    if (own === undefined || other === key) return g
    const cond = groupCond(g)
    const at = cond.findIndex((item) => codeKey(item.code) === key)
    if (at < 0) return { ...g, cond: [...cond, { code: own, unless: [unless] }] }
    if (hasKey(cond[at].unless, other)) return g
    return { ...g, cond: cond.map((item, n) => (n === at ? { code: item.code, unless: [...item.unless, unless] } : item)) }
  })
}

/** 조건 처방 [지우기]: 그 조건 처방만 빼고, 남은 것이 없으면 그 항목을 뺀다(AC-3710.5) */
export function removeCond(groups: readonly StatsRxGroup[], index: number, code: string, unless: string): StatsRxGroup[] {
  const key = codeKey(code)
  const other = codeKey(unless)
  return editAt(groups, index, (g) => {
    if (!g.cond) return g
    const cond = g.cond.flatMap((item): RxCond[] => {
      if (codeKey(item.code) !== key) return [item]
      const rest = item.unless.filter((c) => codeKey(c) !== other)
      return rest.length > 0 ? [{ code: item.code, unless: rest }] : []
    })
    return { ...g, cond }
  })
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

/**
 * 저장할 값: 앞뒤 빈칸을 뗀 이름과 지금 차례(sortOrder 0부터). 묶음 칸 넷(id·name·codes·sortOrder)에
 * 빼는 처방이 있으면 out, 넣는 처방에 있고 unless가 빈 배열이 아닌 조건 항목이 있으면 cond({ code, unless }만)를 더한다(AC-3710.8)
 */
export function forSave(groups: readonly StatsRxGroup[]): StatsRxGroup[] {
  return groups.map((g, sortOrder) => {
    const out = groupOut(g)
    const cond = groupCond(g).filter((item) => hasCode(g, codeKey(item.code)) && item.unless.length > 0)
    return {
      id: g.id,
      name: g.name.trim(),
      codes: [...g.codes],
      sortOrder,
      ...(out.length > 0 ? { out: [...out] } : {}),
      ...(cond.length > 0 ? { cond: cond.map((item) => ({ code: item.code, unless: [...item.unless] })) } : {}),
    }
  })
}

// 넣는 처방·빼는 처방·조건의 지문(불러올 때 쓰는 열쇠와 같다)
const keyOf = (group: StatsRxGroup) => groupKey(group.codes, { out: groupOut(group), cond: groupCond(group) })

/**
 * 저장한 뒤의 글(AC-1210.12·AC-3710.9). 처방이 든 새 묶음(id가 before에 없음)이나 열쇠가 바뀐 묶음(넣는 처방·빼는 처방·조건 가운데 하나라도 바뀜)이 있으면
 * 다시 불러와야 숫자가 나오므로 '저장했어요.'만, 없으면 바로 반영했다고 말한다
 */
export function savedNote(before: readonly StatsRxGroup[], after: readonly StatsRxGroup[]): string {
  const saved = new Map(before.filter((g) => g.id !== null).map((g) => [g.id, g]))
  const needsReload = after.some((g) => {
    const was = g.id === null ? undefined : saved.get(g.id)
    return was ? keyOf(was) !== keyOf(g) : g.codes.length > 0
  })
  return needsReload ? SAVED : SAVED_AT_ONCE
}
