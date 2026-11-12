// 처방별 추세 묶음 고치기 규칙(treatment-trend TASK-5, REQ-1210 · group-exclude TASK-8, REQ-3710). 묶음 이름·처방 코드는 모두 이 파일에서 지어낸 값이다
import { describe, expect, it } from 'vitest'
import { RX_GROUPS_MAX, type RxCond, type RxGroup, type StatsRxGroup } from '@/types/rxGroups'
import {
  addBlankGroup,
  addCond,
  draftProblem,
  forSave,
  groupLabel,
  movedNote,
  moveGroup,
  outNote,
  ownerOf,
  pickCode,
  pickOut,
  pickOutGroup,
  removeCode,
  removeCond,
  removeGroup,
  removeOut,
  savedNote,
  setName,
  TOO_MANY_GROUPS,
} from './treatmentEdit'

const group = (name: string, codes: string[], sortOrder: number, id: string | null = null): RxGroup => ({
  id,
  name,
  codes,
  sortOrder,
})
// 빼는 처방·조건 칸이 있는 통계 묶음(group-exclude). extra에 준 칸만 싣는다
const statsGroup = (
  name: string,
  codes: string[],
  sortOrder: number,
  id: string | null,
  extra: { out?: string[]; cond?: RxCond[] },
): StatsRxGroup => ({ ...group(name, codes, sortOrder, id), ...extra })

// 받은 목록을 건드리면 던지게 얼린다(ESM은 strict라 얼린 값을 바꾸면 TypeError). 끝에 처음 모습과 견준다
function frozen(groups: StatsRxGroup[]): readonly StatsRxGroup[] {
  for (const g of groups) {
    Object.freeze(g.codes)
    if (g.out) Object.freeze(g.out)
    if (g.cond) {
      for (const item of g.cond) {
        Object.freeze(item.unless)
        Object.freeze(item)
      }
      Object.freeze(g.cond)
    }
    Object.freeze(g)
  }
  return Object.freeze(groups)
}
const copyOf = (groups: readonly StatsRxGroup[]) => JSON.parse(JSON.stringify(groups)) as StatsRxGroup[]
const names = (groups: readonly RxGroup[]) => groups.map((g) => g.name)
const orders = (groups: readonly RxGroup[]) => groups.map((g) => g.sortOrder)
const outs = (groups: readonly StatsRxGroup[]) => groups.map((g) => g.out)
const conds = (groups: readonly StatsRxGroup[]) => groups.map((g) => g.cond)
// 빼는 처방·조건 칸이 있는 묶음 자리
const withParts = (groups: readonly StatsRxGroup[]) =>
  groups.flatMap((g, i) => ('out' in g || 'cond' in g ? [i] : []))

const three = () =>
  frozen([
    group('도수치료', ['도수'], 0, 'g1'),
    group('체외충격파', ['ESWT1', 'ESWT2'], 1, 'g2'),
    group('초음파', ['SONO1'], 2, 'g3'),
  ])

describe('AC-1210.3 차례 바꾸기·묶음 지우기', () => {
  it('AC-1210.3: ▲(step -1)는 앞 묶음과 자리를 바꾸고 sortOrder를 0부터 다시 매긴다', () => {
    const before = three()
    const after = moveGroup(before, 1, -1)
    expect(names(after)).toEqual(['체외충격파', '도수치료', '초음파'])
    expect(orders(after)).toEqual([0, 1, 2])
    expect(after.map((g) => g.id)).toEqual(['g2', 'g1', 'g3'])
    expect(after[0].codes).toEqual(['ESWT1', 'ESWT2'])
  })

  it('AC-1210.3: ▼(step 1)는 뒤 묶음과 자리를 바꾼다', () => {
    const after = moveGroup(three(), 1, 1)
    expect(names(after)).toEqual(['도수치료', '초음파', '체외충격파'])
    expect(orders(after)).toEqual([0, 1, 2])
  })

  it('AC-1210.3: 맨 위의 ▲, 맨 아래의 ▼, 없는 자리는 차례를 바꾸지 않고 같은 내용의 새 목록을 돌려준다', () => {
    const before = three()
    for (const [index, step] of [
      [0, -1],
      [2, 1],
      [5, -1],
      [-1, 1],
    ] as const) {
      const after = moveGroup(before, index, step)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })

  it('AC-1210.3: [묶음 지우기](removeGroup)는 다시 묻지 않고 그 묶음을 처방째 빼고 차례를 다시 매긴다', () => {
    const after = removeGroup(three(), 1)
    expect(names(after)).toEqual(['도수치료', '초음파'])
    expect(orders(after)).toEqual([0, 1])
    expect(after.flatMap((g) => g.codes)).toEqual(['도수', 'SONO1'])
    expect(ownerOf(after, 'ESWT1')).toBe(-1)
  })

  it('AC-1210.3: 없는 자리를 지우라고 하면 같은 내용의 새 목록이다', () => {
    const before = three()
    const after = removeGroup(before, 7)
    expect(after).not.toBe(before)
    expect(after).toEqual(copyOf(before))
  })

  it('AC-1210.3: 차례 바꾸기·지우기는 받은 목록을 바꾸지 않는다', () => {
    const before = three()
    const snapshot = copyOf(before)
    moveGroup(before, 0, 1)
    moveGroup(before, 2, -1)
    removeGroup(before, 0)
    expect(before).toEqual(snapshot)
  })
})

describe('AC-1210.4 처방 빼기', () => {
  it('AC-1210.4: [빼기](removeCode)는 그 묶음에서 그 처방 한 줄만 빼고 다른 묶음은 그대로다', () => {
    const after = removeCode(three(), 1, 'ESWT1')
    expect(after.map((g) => g.codes)).toEqual([['도수'], ['ESWT2'], ['SONO1']])
    expect(names(after)).toEqual(['도수치료', '체외충격파', '초음파'])
  })

  it('AC-1210.4: 처방을 모두 빼면 처방 없는 묶음으로 남는다(묶음은 지우지 않는다)', () => {
    const after = removeCode(three(), 2, 'SONO1')
    expect(after).toHaveLength(3)
    expect(after[2]).toEqual({ id: 'g3', name: '초음파', codes: [], sortOrder: 2 })
  })

  it('AC-1210.4: 그 묶음에 없는 처방·없는 자리는 같은 내용의 새 목록이고, 받은 목록을 바꾸지 않는다', () => {
    const before = three()
    const snapshot = copyOf(before)
    expect(removeCode(before, 0, 'ESWT1')).toEqual(snapshot)
    expect(removeCode(before, 9, '도수')).toEqual(snapshot)
    expect(removeCode(before, 0, '도수')).not.toBe(before)
    expect(before).toEqual(snapshot)
  })
})

describe('AC-1210.6 다른 묶음에서 옮기기·옮긴 글', () => {
  it('AC-1210.6: ownerOf는 처방이 든 묶음 자리를 대소문자 무시로 찾고, 없으면 -1이다', () => {
    const groups = three()
    expect(ownerOf(groups, 'ESWT2')).toBe(1)
    expect(ownerOf(groups, 'eswt2')).toBe(1)
    expect(ownerOf(groups, 'sono1')).toBe(2)
    expect(ownerOf(groups, 'CRYO')).toBe(-1)
  })

  it('AC-1210.6: 다른 묶음에 없는 처방을 고르면 이 묶음 끝에 들어가고 from은 null이다', () => {
    const { groups, from } = pickCode(three(), 0, 'CRYO')
    expect(groups.map((g) => g.codes)).toEqual([['도수', 'CRYO'], ['ESWT1', 'ESWT2'], ['SONO1']])
    expect(from).toBeNull()
  })

  it('AC-1210.6: 다른 묶음에 있는 처방을 고르면 그 묶음에서 빠지고 이 묶음 끝에 들어가며 from은 그 묶음 이름이다', () => {
    const { groups, from } = pickCode(three(), 2, 'ESWT1')
    expect(groups.map((g) => g.codes)).toEqual([['도수'], ['ESWT2'], ['SONO1', 'ESWT1']])
    expect(from).toBe('체외충격파')
    expect(orders(groups)).toEqual([0, 1, 2])
  })

  it('AC-1210.6: 대소문자만 다른 코드도 다른 묶음에서 빠진다(처방 하나는 한 묶음에만)', () => {
    const before = frozen([group('충격파', ['eswt1', 'ESWT9'], 0, 'g1'), group('새 묶음', [], 1)])
    const { groups, from } = pickCode(before, 1, 'ESWT1')
    expect(groups.map((g) => g.codes)).toEqual([['ESWT9'], ['ESWT1']])
    expect(from).toBe('충격파')
    expect(ownerOf(groups, 'eswt1')).toBe(1)
  })

  it('AC-1210.6: 뺀 묶음 이름이 비었으면(빈칸만 있어도) from은 `이름 없는 묶음`이다', () => {
    const before = frozen([group('', ['A1'], 0), group('   ', ['B1'], 1), group('도수치료', [], 2)])
    expect(pickCode(before, 2, 'A1').from).toBe('이름 없는 묶음')
    expect(pickCode(before, 2, 'b1').from).toBe('이름 없는 묶음')
    expect(groupLabel(before[0])).toBe('이름 없는 묶음')
    expect(groupLabel(before[1])).toBe('이름 없는 묶음')
    expect(groupLabel(group('  체외충격파 ', [], 0))).toBe('체외충격파')
  })

  it('AC-1210.6: 이 묶음에 이미 있는 처방(대소문자 무시)은 다시 넣지 않고 from은 null이다', () => {
    const before = three()
    const { groups, from } = pickCode(before, 1, 'eswt2')
    expect(groups).not.toBe(before)
    expect(groups).toEqual(copyOf(before))
    expect(from).toBeNull()
  })

  it('AC-1210.6: 옮긴 글은 `<코드>을(를) <그 묶음 이름>에서 옮겨 왔어요.`다', () => {
    expect(movedNote('ESWT1', '체외충격파')).toBe('ESWT1을(를) 체외충격파에서 옮겨 왔어요.')
    const { from } = pickCode(frozen([group('', ['MA4'], 0), group('도수치료', [], 1)]), 1, 'MA4')
    expect(movedNote('MA4', from ?? '')).toBe('MA4을(를) 이름 없는 묶음에서 옮겨 왔어요.')
  })

  it('AC-1210.6: 옮기기는 받은 목록을 바꾸지 않는다', () => {
    const before = three()
    const snapshot = copyOf(before)
    pickCode(before, 0, 'ESWT2')
    pickCode(before, 2, 'CRYO')
    pickCode(before, 9, 'CRYO')
    expect(before).toEqual(snapshot)
  })
})

describe('AC-1210.9 묶음 더하기(50개까지)', () => {
  it('AC-1210.9: [+ 묶음 더하기]는 이름이 빈 새 묶음(id null, 처방 없음)을 끝에 더한다', () => {
    const after = addBlankGroup(three())
    expect(after).not.toBe('tooMany')
    if (after === 'tooMany') return
    expect(after).toHaveLength(4)
    expect(after[3]).toEqual({ id: null, name: '', codes: [], sortOrder: 3 })
    expect(names(after).slice(0, 3)).toEqual(['도수치료', '체외충격파', '초음파'])
  })

  it('AC-1210.9: 49개면 50개째를 더하고, 50개면 더하지 않고 tooMany와 `묶음은 50개까지 만들 수 있어요.`', () => {
    const many = (n: number) => frozen(Array.from({ length: n }, (_, i) => group(`묶음${i}`, [], i)))
    const fifty = addBlankGroup(many(RX_GROUPS_MAX - 1))
    expect(fifty).not.toBe('tooMany')
    expect((fifty as RxGroup[]).length).toBe(50)
    expect(addBlankGroup(many(RX_GROUPS_MAX))).toBe('tooMany')
    expect(TOO_MANY_GROUPS).toBe('묶음은 50개까지 만들 수 있어요.')
  })

  it('AC-1210.9: 묶음 더하기는 받은 목록을 바꾸지 않는다', () => {
    const before = three()
    const snapshot = copyOf(before)
    addBlankGroup(before)
    expect(before).toEqual(snapshot)
  })
})

describe('AC-1210.11 [저장] 전 이름 검사', () => {
  it('AC-1210.11: 이름 칸(setName)은 치는 글자를 그대로 두고(앞뒤 빈칸·빈 이름도) 검사는 [저장] 때 한다', () => {
    const before = three()
    const snapshot = copyOf(before)
    expect(setName(before, 1, ' 충격파 ')[1].name).toBe(' 충격파 ')
    expect(setName(before, 0, '')[0].name).toBe('')
    expect(setName(before, 0, '')[0].codes).toEqual(['도수'])
    expect(setName(before, 9, 'x')).toEqual(snapshot)
    expect(before).toEqual(snapshot)
  })

  it('AC-1210.11: 문제 없는 목록(앞뒤 빈칸은 떼고 봄, 30자, 숫자 5개)은 null이다', () => {
    expect(draftProblem(three())).toBeNull()
    expect(draftProblem([group(' 도수치료 ', [], 0), group('가'.repeat(30), [], 1), group('12345 묶음', [], 2)])).toBeNull()
    expect(draftProblem([])).toBeNull()
  })

  it('AC-1210.11: 이름이 빈 묶음(빈칸만 있어도)은 `이름이 빈 묶음이 있어요. 이름을 적어 주세요.`', () => {
    expect(draftProblem([group('도수치료', [], 0), group('  ', [], 1)])).toEqual({
      index: 1,
      message: '이름이 빈 묶음이 있어요. 이름을 적어 주세요.',
    })
  })

  it('AC-1210.11: 앞뒤 빈칸을 뺀 이름이 겹치면 `"<이름>" 묶음이 두 개예요. 이름을 다르게 적어 주세요.`(뒤쪽 칸)', () => {
    expect(draftProblem([group('도수치료', [], 0), group('초음파', [], 1), group(' 도수치료  ', [], 2)])).toEqual({
      index: 2,
      message: '"도수치료" 묶음이 두 개예요. 이름을 다르게 적어 주세요.',
    })
  })

  it('AC-1210.11: 31자 이상이면 `묶음 이름은 30자까지 쓸 수 있어요.`', () => {
    expect(draftProblem([group('가'.repeat(31), [], 0)])).toEqual({
      index: 0,
      message: '묶음 이름은 30자까지 쓸 수 있어요.',
    })
  })

  it('AC-1210.11: 제어 문자가 있으면 `줄바꿈 같은 제어 문자는 넣을 수 없어요.`', () => {
    for (const name of ['도수\n치료', '도수\t치료', '도수\u0085치료']) {
      expect(draftProblem([group(name, [], 0)])).toEqual({
        index: 0,
        message: '줄바꿈 같은 제어 문자는 넣을 수 없어요.',
      })
    }
  })

  it('AC-1210.11: 숫자 6개 이상이 이어지면 `숫자를 6개 이상 이어 쓸 수 없어요.`', () => {
    expect(draftProblem([group('묶음 123456', [], 0)])).toEqual({
      index: 0,
      message: '숫자를 6개 이상 이어 쓸 수 없어요.',
    })
  })

  it('AC-1210.11: 문제가 여럿이면 맨 앞 칸의 문제 하나를 낸다(초점이 그 칸에 간다)', () => {
    const groups = [group('도수치료', [], 0), group('가'.repeat(31), [], 1), group('', [], 2), group('도수치료', [], 3)]
    expect(draftProblem(groups)).toEqual({ index: 1, message: '묶음 이름은 30자까지 쓸 수 있어요.' })
  })

  it('AC-1210.11: 검사는 받은 목록을 바꾸지 않는다', () => {
    const before = frozen([group(' 도수치료 ', ['도수'], 0), group('', [], 1)])
    const snapshot = copyOf(before)
    draftProblem(before)
    expect(before).toEqual(snapshot)
  })
})

describe('AC-1210.12 저장 값·저장 글', () => {
  it('AC-1210.12: forSave는 앞뒤 빈칸을 뗀 이름과 지금 차례(sortOrder 0부터)로 새 목록을 만든다', () => {
    const before = frozen([group(' 초음파 ', ['SONO1'], 7, 'g3'), group('도수치료', ['도수'], 2, 'g1'), group('새 묶음  ', [], 9)])
    const after = forSave(before)
    expect(after).toEqual([
      { id: 'g3', name: '초음파', codes: ['SONO1'], sortOrder: 0 },
      { id: 'g1', name: '도수치료', codes: ['도수'], sortOrder: 1 },
      { id: null, name: '새 묶음', codes: [], sortOrder: 2 },
    ])
    expect(after[0].codes).not.toBe(before[0].codes)
  })

  it('AC-1210.12: forSave는 묶음 칸 넷(id·name·codes·sortOrder) 밖의 값(제안 표시 등)을 싣지 않는다', () => {
    const suggested = { ...group('도수치료', ['도수'], 0), suggested: true as const }
    expect(Object.keys(forSave([suggested])[0]).sort()).toEqual(['codes', 'id', 'name', 'sortOrder'])
  })

  it('AC-1210.12: 이름·차례만 바꾸고 지우기만 했으면 `저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.`', () => {
    const before = three()
    const renamed = forSave([group('충격파', ['ESWT1', 'ESWT2'], 1, 'g2'), group(' 도수 ', ['도수'], 0, 'g1')])
    expect(savedNote(before, renamed)).toBe('저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.')
    expect(savedNote(before, forSave(removeGroup(before, 0)))).toBe('저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.')
  })

  it('AC-1210.12: 처방 모음이 같으면(차례·대소문자만 다름) 바뀐 것으로 세지 않는다', () => {
    const before = three()
    const after = [group('도수치료', ['도수'], 0, 'g1'), group('체외충격파', ['eswt2', 'esWt1'], 1, 'g2'), group('초음파', ['SONO1'], 2, 'g3')]
    expect(savedNote(before, after)).toBe('저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.')
  })

  it('AC-1210.12: 빈 새 묶음만 더했으면 이름과 순서만 바뀐 것으로 본다', () => {
    const before = three()
    const added = addBlankGroup(before) as RxGroup[]
    const after = forSave(setName(added, 3, '냉동치료'))
    expect(savedNote(before, after)).toBe('저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.')
  })

  it('AC-1210.12: 처방을 넣거나 뺀 묶음·옮긴 처방이 있으면 `저장했어요.`', () => {
    const before = three()
    expect(savedNote(before, forSave(removeCode(before, 1, 'ESWT2')))).toBe('저장했어요.')
    expect(savedNote(before, forSave(pickCode(before, 0, 'CRYO').groups))).toBe('저장했어요.')
    expect(savedNote(before, forSave(pickCode(before, 2, 'ESWT1').groups))).toBe('저장했어요.')
  })

  it('AC-1210.12: 처방이 든 새 묶음이 있으면 `저장했어요.`(초안의 id null, 저장 뒤 새 id 모두)', () => {
    const before = three()
    const added = addBlankGroup(before) as RxGroup[]
    const draft = forSave(pickCode(setName(added, 3, '냉동치료'), 3, 'CRYO').groups)
    expect(savedNote(before, draft)).toBe('저장했어요.')
    const returned = draft.map((g) => (g.id === null ? { ...g, id: 'g9' } : g))
    expect(savedNote(before, returned)).toBe('저장했어요.')
  })

  it('AC-1210.12: 저장된 줄이 없던 제안(id null)에 처방이 들어 있으면 새 묶음이라 `저장했어요.`', () => {
    const before = frozen([group('도수치료', ['도수'], 0), group('초음파', [], 1)])
    expect(savedNote(before, forSave(before))).toBe('저장했어요.')
    const emptyOnly = frozen([group('초음파', [], 0)])
    expect(savedNote(emptyOnly, forSave(emptyOnly))).toBe('저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.')
  })

  it('AC-1210.12: 저장 값·저장 글은 받은 목록을 바꾸지 않는다', () => {
    const before = three()
    const after = frozen(forSave(removeCode(before, 0, '도수')))
    const snapshots = [copyOf(before), copyOf(after)]
    forSave(before)
    savedNote(before, after)
    expect([before, after]).toEqual(snapshots)
  })
})

// group-exclude REQ-3710. ESWT7은 '체외충격파'의 넣는 처방이면서 '기본 PT'의 빼는 처방이다(다른 묶음 넣는 처방도 빼는 처방이 될 수 있다)
const parts = () =>
  frozen([
    statsGroup('기본 PT', ['MM010', 'MM015', 'MM080'], 0, 'g1', {
      out: ['ESWT7'],
      cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }],
    }),
    group('체외충격파', ['ESWT1', 'ESWT7', 'ESWT9'], 1, 'g2'),
    group('도수치료', ['도수', 'MA4'], 2, 'g3'),
  ])

describe('AC-3710.1 빼는 처방 고르기(pickOut)', () => {
  it('AC-3710.1: 그 묶음 빼는 처방 끝에 넣고, 다른 묶음은 바뀌지 않는다', () => {
    const before = parts()
    const after = pickOut(before, 0, 'MA4')
    expect(after[0].out).toEqual(['ESWT7', 'MA4'])
    expect(after[0].codes).toEqual(['MM010', 'MM015', 'MM080'])
    expect(after[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS'] }])
    expect(after.slice(1)).toEqual(copyOf(before).slice(1))
  })

  it('AC-3710.1: 다른 묶음의 넣는 처방을 골라도 그 묶음에서 옮기지 않는다', () => {
    const after = pickOut(parts(), 0, 'ESWT1')
    expect(after[0].out).toEqual(['ESWT7', 'ESWT1'])
    expect(after[1].codes).toEqual(['ESWT1', 'ESWT7', 'ESWT9'])
    expect(ownerOf(after, 'ESWT1')).toBe(1)
  })

  it('AC-3710.1: 빼는 처방 칸이 없던 묶음은 고른 처방 하나로 칸이 생긴다', () => {
    const after = pickOut(parts(), 2, 'ESWT7')
    expect(after[2]).toEqual({ id: 'g3', name: '도수치료', codes: ['도수', 'MA4'], sortOrder: 2, out: ['ESWT7'] })
  })

  it('AC-3710.1: 그 묶음 넣는 처방·빼는 처방에 이미 있으면(대소문자 무시) 그대로다', () => {
    const before = parts()
    for (const [index, code] of [
      [0, 'eswt7'],
      [0, 'ESWT7'],
      [0, 'mm015'],
      [2, 'ma4'],
    ] as const) {
      const after = pickOut(before, index, code)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })

  it('AC-3710.1: 없는 자리는 같은 내용의 새 목록이다', () => {
    const before = parts()
    expect(pickOut(before, 9, 'MA4')).toEqual(copyOf(before))
  })
})

describe('AC-3710.2 묶음째 빼는 처방에 넣기(pickOutGroup)', () => {
  it('AC-3710.2: j의 넣는 처방 가운데 i의 넣는 처방·빼는 처방에 없는 것을 j 차례대로 i 빼는 처방 끝에 넣고 넣은 수를 돌려준다', () => {
    const before = parts()
    const { groups, added } = pickOutGroup(before, 0, 1)
    expect(groups[0].out).toEqual(['ESWT7', 'ESWT1', 'ESWT9'])
    expect(added).toBe(2)
    const next = pickOutGroup(groups, 0, 2)
    expect(next.groups[0].out).toEqual(['ESWT7', 'ESWT1', 'ESWT9', '도수', 'MA4'])
    expect(next.added).toBe(2)
  })

  it('AC-3710.2: j는 바뀌지 않는다(넣는 처방을 옮기지 않고 복사한다)', () => {
    const before = parts()
    const { groups } = pickOutGroup(before, 0, 1)
    expect(groups[1]).toEqual(copyOf(before)[1])
    expect(groups[2]).toEqual(copyOf(before)[2])
    expect(groups[0].codes).toEqual(['MM010', 'MM015', 'MM080'])
    expect(groups[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS'] }])
  })

  it('AC-3710.2: 이미 있는지는 대소문자를 무시하고 본다', () => {
    const before = frozen([
      statsGroup('기본 PT', ['mm010'], 0, 'g1', { out: ['eswt7'] }),
      group('섞인 묶음', ['ESWT7', 'MM010', 'CRYO'], 1, 'g2'),
    ])
    const { groups, added } = pickOutGroup(before, 0, 1)
    expect(groups[0].out).toEqual(['eswt7', 'CRYO'])
    expect(added).toBe(1)
  })

  it('AC-3710.2: 빼는 처방 칸이 없던 묶음은 칸이 생긴다', () => {
    const { groups, added } = pickOutGroup(parts(), 2, 1)
    expect(groups[2].out).toEqual(['ESWT1', 'ESWT7', 'ESWT9'])
    expect(added).toBe(3)
  })

  it('AC-3710.2: 넣을 것이 없으면(다 들어 있음·j가 비었거나 i 자신·없는 자리) 0을 돌려주고 같은 내용의 새 목록이다', () => {
    const full = frozen([statsGroup('기본 PT', ['MM010'], 0, 'g1', { out: ['ESWT1', 'eswt7', 'ESWT9'] }), ...copyOf(parts()).slice(1)])
    const empty = frozen([group('도수치료', ['도수'], 0, 'g1'), group('새 묶음', [], 1)])
    for (const [before, i, j] of [
      [full, 0, 1],
      [empty, 0, 1],
      [empty, 0, 0],
      [empty, 0, 5],
      [empty, 5, 0],
    ] as const) {
      const { groups, added } = pickOutGroup(before, i, j)
      expect(added).toBe(0)
      expect(groups).not.toBe(before)
      expect(groups).toEqual(copyOf(before))
    }
  })
})

describe('AC-3710.3 빼는 처방 지우기(removeOut)', () => {
  it('AC-3710.3: 그 빼는 처방만 빠지고 넣는 처방·조건·다른 묶음은 그대로다', () => {
    const before = frozen([statsGroup('기본 PT', ['MM010', 'MM080'], 0, 'g1', { out: ['ESWT7', 'MA4', 'CRYO'], cond: [{ code: 'MM080', unless: ['MM020'] }] }), group('도수치료', ['MA4'], 1, 'g2')])
    const after = removeOut(before, 0, 'MA4')
    expect(after[0]).toEqual({
      id: 'g1',
      name: '기본 PT',
      codes: ['MM010', 'MM080'],
      sortOrder: 0,
      out: ['ESWT7', 'CRYO'],
      cond: [{ code: 'MM080', unless: ['MM020'] }],
    })
    expect(after[1]).toEqual(copyOf(before)[1])
  })

  it('AC-3710.3: 마지막 빼는 처방을 지우면 빈 빼는 처방이다', () => {
    expect(removeOut(parts(), 0, 'ESWT7')[0].out).toEqual([])
  })

  it('AC-3710.3: 그 묶음 빼는 처방에 없는 처방·없는 자리는 같은 내용의 새 목록이다', () => {
    const before = parts()
    expect(removeOut(before, 0, 'MA4')).toEqual(copyOf(before))
    expect(removeOut(before, 1, 'ESWT7')).toEqual(copyOf(before))
    expect(removeOut(before, 9, 'ESWT7')).toEqual(copyOf(before))
  })
})

describe('AC-3710.4 조건 더하기(addCond)', () => {
  it('AC-3710.4: 넣는 처방 code의 조건 끝에 unless를 넣는다', () => {
    const after = addCond(parts(), 0, 'MM080', 'MM030')
    expect(after[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS', 'MM030'] }])
    expect(after[0].codes).toEqual(['MM010', 'MM015', 'MM080'])
    expect(after[0].out).toEqual(['ESWT7'])
    expect(after.slice(1)).toEqual(copyOf(parts()).slice(1))
  })

  it('AC-3710.4: 그 처방의 항목이 없으면 조건 끝에 새 항목을 만든다(조건 칸이 없던 묶음도)', () => {
    expect(addCond(parts(), 0, 'MM010', 'TENS')[0].cond).toEqual([
      { code: 'MM080', unless: ['MM020', 'TENS'] },
      { code: 'MM010', unless: ['TENS'] },
    ])
    expect(addCond(parts(), 2, 'MA4', 'ESWT1')[2]).toEqual({
      id: 'g3',
      name: '도수치료',
      codes: ['도수', 'MA4'],
      sortOrder: 2,
      cond: [{ code: 'MA4', unless: ['ESWT1'] }],
    })
  })

  it('AC-3710.4: 넣는 처방은 대소문자를 무시하고 찾고, 새 항목의 code는 넣는 처방 글자 그대로다', () => {
    expect(addCond(parts(), 0, 'mm080', 'MM030')[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS', 'MM030'] }])
    expect(addCond(parts(), 2, 'ma4', 'ESWT1')[2].cond).toEqual([{ code: 'MA4', unless: ['ESWT1'] }])
  })

  it('AC-3710.4: 조건 처방은 같은 묶음 다른 넣는 처방·빼는 처방·다른 묶음 넣는 처방이어도 된다', () => {
    const after = addCond(addCond(addCond(parts(), 0, 'MM080', 'MM010'), 0, 'MM080', 'ESWT7'), 0, 'MM080', '도수')
    expect(after[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS', 'MM010', 'ESWT7', '도수'] }])
    expect(after[0].out).toEqual(['ESWT7'])
    expect(after[2].codes).toEqual(['도수', 'MA4'])
  })

  it('AC-3710.4: unless가 code 자신이거나 이미 있으면(대소문자 무시), code가 그 묶음 넣는 처방이 아니면, 없는 자리면 그대로다', () => {
    const before = parts()
    for (const [index, code, unless] of [
      [0, 'MM080', 'MM080'],
      [0, 'MM080', 'mm080'],
      [0, 'MM010', 'mm010'],
      [0, 'MM080', 'tens'],
      [0, 'ESWT7', 'MM020'],
      [0, 'MA4', 'MM020'],
      [2, 'MM080', 'MM020'],
      [9, 'MM080', 'MM030'],
    ] as const) {
      const after = addCond(before, index, code, unless)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })
})

describe('AC-3710.5 조건 처방 지우기(removeCond)', () => {
  it('AC-3710.5: 그 조건 처방만 빠진다', () => {
    const after = removeCond(parts(), 0, 'MM080', 'MM020')
    expect(after[0].cond).toEqual([{ code: 'MM080', unless: ['TENS'] }])
    expect(after[0].codes).toEqual(['MM010', 'MM015', 'MM080'])
    expect(after[0].out).toEqual(['ESWT7'])
  })

  it('AC-3710.5: 남은 조건 처방이 없으면 그 항목이 없어지고 다른 항목은 그대로다', () => {
    const before = frozen([
      statsGroup('기본 PT', ['MM010', 'MM080'], 0, 'g1', {
        cond: [
          { code: 'MM010', unless: ['ESWT7'] },
          { code: 'MM080', unless: ['MM020'] },
        ],
      }),
    ])
    expect(removeCond(before, 0, 'MM010', 'ESWT7')[0].cond).toEqual([{ code: 'MM080', unless: ['MM020'] }])
    expect(removeCond(removeCond(before, 0, 'MM010', 'ESWT7'), 0, 'MM080', 'MM020')[0].cond).toEqual([])
  })

  it('AC-3710.5: 없는 항목·없는 조건 처방·없는 자리는 같은 내용의 새 목록이다', () => {
    const before = parts()
    for (const [index, code, unless] of [
      [0, 'MM010', 'MM020'],
      [0, 'MM080', 'MM030'],
      [2, 'MA4', 'ESWT1'],
      [9, 'MM080', 'MM020'],
    ] as const) {
      const after = removeCond(before, index, code, unless)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })
})

describe('AC-3710.6 넣는 처방을 지우거나 옮기면 그 조건도 없어짐', () => {
  it('AC-3710.6: removeCode로 조건 있는 넣는 처방을 지우면 그 처방의 조건 항목이 같이 없어진다', () => {
    const before = frozen([
      statsGroup('기본 PT', ['MM010', 'MM080'], 0, 'g1', {
        out: ['ESWT7'],
        cond: [
          { code: 'MM010', unless: ['ESWT1'] },
          { code: 'MM080', unless: ['MM020'] },
        ],
      }),
    ])
    const after = removeCode(before, 0, 'MM080')
    expect(after[0]).toEqual({
      id: 'g1',
      name: '기본 PT',
      codes: ['MM010'],
      sortOrder: 0,
      out: ['ESWT7'],
      cond: [{ code: 'MM010', unless: ['ESWT1'] }],
    })
    expect(removeCode(after, 0, 'MM010')[0].cond).toEqual([])
  })

  it('AC-3710.6: removeCode로 조건 없는 넣는 처방을 지우면 조건은 그대로다', () => {
    expect(removeCode(parts(), 0, 'MM010')[0].cond).toEqual([{ code: 'MM080', unless: ['MM020', 'TENS'] }])
  })

  it('AC-3710.6: pickCode로 다른 묶음에 옮기면 원래 묶음에서 조건 항목이 없어지고 옮겨 간 묶음에는 조건이 없다', () => {
    const { groups, from } = pickCode(parts(), 2, 'mm080')
    expect(from).toBe('기본 PT')
    expect(groups[0].codes).toEqual(['MM010', 'MM015'])
    expect(groups[0].cond).toEqual([])
    expect(groups[0].out).toEqual(['ESWT7'])
    expect(groups[2]).toEqual({ id: 'g3', name: '도수치료', codes: ['도수', 'MA4', 'mm080'], sortOrder: 2 })
  })
})

describe('AC-3710.7 빼는 처방에 있는 처방은 넣는 처방으로 고르지 못함', () => {
  it('AC-3710.7: pickCode의 code가 i의 빼는 처방에 있으면(대소문자 무시) 그대로이고 from은 null이다', () => {
    const before = parts()
    for (const code of ['ESWT7', 'eswt7']) {
      const { groups, from } = pickCode(before, 0, code)
      expect(groups).not.toBe(before)
      expect(groups).toEqual(copyOf(before))
      expect(from).toBeNull()
    }
  })

  it('AC-3710.7: 다른 묶음의 빼는 처방에 있는 처방은 지금처럼 고른다', () => {
    const { groups, from } = pickCode(parts(), 2, 'ESWT7')
    expect(from).toBe('체외충격파')
    expect(groups[2].codes).toEqual(['도수', 'MA4', 'ESWT7'])
    expect(groups[0].out).toEqual(['ESWT7'])
  })
})

describe('AC-3710.8 저장 값의 빼는 처방·조건(forSave)', () => {
  it('AC-3710.8: 빼는 처방이 있으면 out, 남는 조건이 있으면 cond를 더한다(새 배열)', () => {
    const before = frozen([
      statsGroup(' 기본 PT ', ['MM010', 'MM080'], 4, 'g1', { out: ['ESWT7', 'MA4'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] }),
      group('도수치료', ['도수'], 1, 'g3'),
    ])
    const after = forSave(before)
    expect(after).toEqual([
      { id: 'g1', name: '기본 PT', codes: ['MM010', 'MM080'], sortOrder: 0, out: ['ESWT7', 'MA4'], cond: [{ code: 'MM080', unless: ['MM020', 'TENS'] }] },
      { id: 'g3', name: '도수치료', codes: ['도수'], sortOrder: 1 },
    ])
    expect(after[0].out).not.toBe(before[0].out)
    expect(after[0].cond).not.toBe(before[0].cond)
    expect(after[0].cond?.[0]).not.toBe(before[0].cond?.[0])
    expect(after[0].cond?.[0].unless).not.toBe(before[0].cond?.[0].unless)
  })

  it('AC-3710.8: cond는 넣는 처방에 있고(대소문자 무시) unless가 빈 배열이 아닌 항목만 남기고, 항목은 code·unless만 싣는다', () => {
    const extra = { code: 'mm010', unless: ['ESWT1'], note: '안 실음' } as RxCond
    const before = frozen([
      statsGroup('기본 PT', ['MM010', 'MM080'], 0, 'g1', {
        cond: [extra, { code: 'MM080', unless: [] }, { code: 'MM999', unless: ['TENS'] }],
      }),
    ])
    const [saved] = forSave(before)
    expect(saved.cond).toEqual([{ code: 'mm010', unless: ['ESWT1'] }])
    expect(Object.keys(saved.cond?.[0] ?? {}).sort()).toEqual(['code', 'unless'])
    expect(Object.keys(saved).sort()).toEqual(['codes', 'cond', 'id', 'name', 'sortOrder'])
  })

  it('AC-3710.8: 빼는 처방·남는 조건이 둘 다 없으면 지금 모양(id·name·codes·sortOrder) 그대로다', () => {
    const before = frozen([
      statsGroup('기본 PT', ['MM010'], 0, 'g1', { out: [], cond: [] }),
      statsGroup('체외충격파', ['ESWT1'], 1, 'g2', { cond: [{ code: 'MM080', unless: ['MM020'] }, { code: 'ESWT1', unless: [] }] }),
      group('도수치료', ['도수'], 2, 'g3'),
    ])
    const after = forSave(before)
    for (const g of after) expect(Object.keys(g).sort()).toEqual(['codes', 'id', 'name', 'sortOrder'])
  })
})

describe('AC-3710.9 저장 글(열쇠가 달라졌는지)', () => {
  const SAVED = '저장했어요.'
  const AT_ONCE = '저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.'

  it('AC-3710.9: 빼는 처방을 넣거나 지운 묶음이 있으면 `저장했어요.`', () => {
    const before = parts()
    expect(savedNote(before, forSave(pickOut(before, 0, 'MA4')))).toBe(SAVED)
    expect(savedNote(before, forSave(removeOut(before, 0, 'ESWT7')))).toBe(SAVED)
    expect(savedNote(before, forSave(pickOutGroup(before, 2, 1).groups))).toBe(SAVED)
  })

  it('AC-3710.9: 조건을 넣거나 지운 묶음이 있으면 `저장했어요.`', () => {
    const before = parts()
    expect(savedNote(before, forSave(addCond(before, 0, 'MM080', 'MM030')))).toBe(SAVED)
    expect(savedNote(before, forSave(addCond(before, 0, 'MM010', 'TENS')))).toBe(SAVED)
    expect(savedNote(before, forSave(removeCond(before, 0, 'MM080', 'TENS')))).toBe(SAVED)
  })

  it('AC-3710.9: 이름·차례만 바꾸면 빼는 처방·조건이 있어도 `저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.`', () => {
    const before = parts()
    expect(savedNote(before, forSave(setName(moveGroup(before, 0, 1), 1, '기본 물리치료')))).toBe(AT_ONCE)
    expect(savedNote(before, forSave(removeGroup(before, 2)))).toBe(AT_ONCE)
  })

  it('AC-3710.9: 빼는 처방 차례·대소문자, 조건 항목 차례·unless 차례·대소문자만 다르면 열쇠가 같아 바로 반영이다', () => {
    const before = frozen([
      statsGroup('기본 PT', ['MM010', 'MM080'], 0, 'g1', {
        out: ['ESWT7', 'MA4'],
        cond: [
          { code: 'MM010', unless: ['ESWT1'] },
          { code: 'MM080', unless: ['MM020', 'TENS'] },
        ],
      }),
    ])
    const after = [
      statsGroup('기본 PT', ['MM080', 'mm010'], 0, 'g1', {
        out: ['ma4', 'eswt7'],
        cond: [
          { code: 'mm080', unless: ['tens', 'MM020'] },
          { code: 'MM010', unless: ['eswt1'] },
        ],
      }),
    ]
    expect(savedNote(before, after)).toBe(AT_ONCE)
  })

  it('AC-3710.9: 넣는 처방에 없는 조건 항목·빈 unless 항목은 열쇠를 바꾸지 않는다', () => {
    const before = parts()
    const after = [
      statsGroup('기본 PT', ['MM010', 'MM015', 'MM080'], 0, 'g1', {
        out: ['ESWT7'],
        cond: [
          { code: 'MM080', unless: ['MM020', 'TENS'] },
          { code: 'MM999', unless: ['TENS'] },
          { code: 'MM010', unless: [] },
        ],
      }),
      ...copyOf(before).slice(1),
    ]
    expect(savedNote(before, after)).toBe(AT_ONCE)
  })

  it('AC-3710.9: 처방 든 새 묶음은 `저장했어요.`, 넣는 처방 없이 빼는 처방만 든 새 묶음은 바로 반영이다', () => {
    const before = parts()
    const added = addBlankGroup(before) as StatsRxGroup[]
    const named = setName(added, 3, '냉동치료')
    expect(savedNote(before, forSave(pickCode(pickOut(named, 3, 'ESWT1'), 3, 'CRYO').groups))).toBe(SAVED)
    expect(savedNote(before, forSave(pickOut(named, 3, 'ESWT1')))).toBe(AT_ONCE)
  })

  it('AC-3710.9: 빼는 처방·조건이 없던 묶음은 지금처럼 넣는 처방 모음으로 본다', () => {
    const before = three()
    expect(savedNote(before, forSave(moveGroup(before, 0, 1)))).toBe(AT_ONCE)
    expect(savedNote(before, forSave(removeCode(before, 1, 'ESWT2')))).toBe(SAVED)
  })
})

describe('AC-3710.10 묶음째 고른 뒤 글(outNote)', () => {
  it('AC-3710.10: 넣은 수가 있으면 `{name} 묶음의 처방 {added}개를 빼는 처방에 넣었어요.`', () => {
    expect(outNote('체외충격파', 2)).toBe('체외충격파 묶음의 처방 2개를 빼는 처방에 넣었어요.')
    expect(outNote('도수치료', 1)).toBe('도수치료 묶음의 처방 1개를 빼는 처방에 넣었어요.')
  })

  it('AC-3710.10: 0이면 `{name} 묶음의 처방은 이미 다 들어 있어요.`', () => {
    expect(outNote('체외충격파', 0)).toBe('체외충격파 묶음의 처방은 이미 다 들어 있어요.')
    const { groups, added } = pickOutGroup(pickOutGroup(parts(), 0, 1).groups, 0, 1)
    expect(outNote(groupLabel(groups[1]), added)).toBe('체외충격파 묶음의 처방은 이미 다 들어 있어요.')
  })
})

describe('AC-3710.11 받은 목록을 바꾸지 않고 빈 칸을 만들지 않음', () => {
  // 고치기 함수마다 한 번씩 부른다. 결과 목록만 모은다
  const everyEdit = (before: readonly StatsRxGroup[]) => [
    moveGroup(before, 0, 1),
    removeGroup(before, 1),
    setName(before, 0, '새 이름'),
    removeCode(before, 0, before[0].codes[0]),
    removeCode(before, 2, 'MA4'),
    pickCode(before, 2, before[0].codes[1]).groups,
    pickCode(before, 0, 'CRYO').groups,
    pickOut(before, 0, 'MM010'),
    pickOutGroup(before, 0, 0).groups,
    removeOut(before, 2, 'ESWT7'),
    addCond(before, 2, 'MM999', 'TENS'),
    removeCond(before, 2, 'MA4', 'TENS'),
    forSave(before),
  ]

  it('AC-3710.11: 모든 고치기 함수는 받은 목록(빼는 처방·조건 안까지)을 바꾸지 않고 새 목록을 돌려준다', () => {
    const before = parts()
    const snapshot = copyOf(before)
    const results = [
      ...everyEdit(before),
      pickOut(before, 0, 'MA4'),
      pickOutGroup(before, 0, 1).groups,
      removeOut(before, 0, 'ESWT7'),
      addCond(before, 0, 'MM080', 'MM030'),
      addCond(before, 0, 'MM010', 'TENS'),
      removeCond(before, 0, 'MM080', 'MM020'),
      removeCond(before, 0, 'MM080', 'TENS'),
      removeCode(before, 0, 'MM080'),
      pickCode(before, 2, 'MM080').groups,
    ]
    for (const after of results) expect(after).not.toBe(before)
    savedNote(before, forSave(before))
    expect(before).toEqual(snapshot)
  })

  it('AC-3710.11: 빼는 처방·조건이 없는 묶음에는 빈 out·cond 칸을 새로 만들지 않는다', () => {
    const before = frozen([group('도수치료', ['도수', 'MM010'], 0, 'g1'), group('체외충격파', ['ESWT1', 'ESWT7'], 1, 'g2'), group('초음파', ['MA4', 'SONO1'], 2, 'g3')])
    for (const after of everyEdit(before)) expect(withParts(after)).toEqual([])
    const added = addBlankGroup(before)
    expect(added).not.toBe('tooMany')
    if (added === 'tooMany') return
    expect(added[3]).toEqual({ id: null, name: '', codes: [], sortOrder: 3 })
    expect(withParts(added)).toEqual([])
  })

  it('AC-3710.11: 차례 바꾸기·지우기·이름 고치기·묶음 더하기는 빼는 처방·조건을 그대로 둔다', () => {
    const before = parts()
    const cond = [{ code: 'MM080', unless: ['MM020', 'TENS'] }]
    expect(outs(moveGroup(before, 0, 1))).toEqual([undefined, ['ESWT7'], undefined])
    expect(conds(moveGroup(before, 0, 1))).toEqual([undefined, cond, undefined])
    expect(outs(removeGroup(before, 1))).toEqual([['ESWT7'], undefined])
    expect(conds(setName(before, 0, '기본 물리치료'))).toEqual([cond, undefined, undefined])
    const added = addBlankGroup(before)
    if (added === 'tooMany') throw new Error('묶음이 더해지지 않았어요')
    expect(outs(added)).toEqual([['ESWT7'], undefined, undefined, undefined])
    expect(withParts(added)).toEqual([0])
  })
})
