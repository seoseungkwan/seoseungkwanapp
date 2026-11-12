// 처방별 추세 묶음 고치기 규칙(treatment-trend TASK-5, REQ-1210 · 제외할 처방은 rx-group-exclude TASK-6, REQ-2706). 묶음 이름·처방 코드는 모두 이 파일에서 지어낸 값이다
import { describe, expect, it } from 'vitest'
import { RX_GROUPS_MAX, type RxGroup, type StatsRxGroup } from '@/types/rxGroups'
import {
  addBlankGroup,
  draftProblem,
  forSave,
  groupLabel,
  inExclude,
  movedNote,
  moveGroup,
  ownerOf,
  pickCode,
  pickExclude,
  removeCode,
  removeExclude,
  removeGroup,
  savedNote,
  setName,
  TOO_MANY_GROUPS,
} from './treatmentEdit'

// exclude를 주지 않으면 그 칸이 없는 묶음이다(예전 모양 그대로)
const group = (name: string, codes: string[], sortOrder: number, id: string | null = null, exclude?: string[]): StatsRxGroup => ({
  id,
  name,
  codes,
  sortOrder,
  ...(exclude ? { exclude } : {}),
})

// 받은 목록을 건드리면 던지게 얼린다(ESM은 strict라 얼린 값을 바꾸면 TypeError). 끝에 처음 모습과 견준다
function frozen(groups: StatsRxGroup[]): readonly StatsRxGroup[] {
  for (const g of groups) {
    Object.freeze(g.codes)
    if (g.exclude) Object.freeze(g.exclude)
    Object.freeze(g)
  }
  return Object.freeze(groups)
}
const copyOf = (groups: readonly StatsRxGroup[]) => JSON.parse(JSON.stringify(groups)) as StatsRxGroup[]
const names = (groups: readonly RxGroup[]) => groups.map((g) => g.name)
const orders = (groups: readonly RxGroup[]) => groups.map((g) => g.sortOrder)
const excludes = (groups: readonly StatsRxGroup[]) => groups.map((g) => g.exclude)

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
  it('AC-1210.9: [+ 묶음 더하기]는 이름이 빈 새 묶음(id null, 처방 없음, 제외할 처방 없음 = 빈 배열)을 끝에 더한다', () => {
    const after = addBlankGroup(three())
    expect(after).not.toBe('tooMany')
    if (after === 'tooMany') return
    expect(after).toHaveLength(4)
    expect(after[3]).toEqual({ id: null, name: '', codes: [], exclude: [], sortOrder: 3 })
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
      { id: 'g3', name: '초음파', codes: ['SONO1'], exclude: [], sortOrder: 0 },
      { id: 'g1', name: '도수치료', codes: ['도수'], exclude: [], sortOrder: 1 },
      { id: null, name: '새 묶음', codes: [], exclude: [], sortOrder: 2 },
    ])
    expect(after[0].codes).not.toBe(before[0].codes)
  })

  it('AC-1210.12·AC-2706.4: forSave는 묶음 칸(id·name·codes·exclude·sortOrder) 밖의 값(제안 표시 등)을 싣지 않는다', () => {
    const suggested = { ...group('도수치료', ['도수'], 0), suggested: true as const }
    expect(Object.keys(forSave([suggested])[0]).sort()).toEqual(['codes', 'exclude', 'id', 'name', 'sortOrder'])
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

// ── 제외할 처방(rx-group-exclude REQ-2706) ──────────────────────────
// 표층열만 = MM010 중 같은 날 ESWT1을 받은 환자는 빼고, 체외충격파 = ESWT7·ESWT2, 초음파는 제외할 처방 칸이 없다(예전 모양)
const withExclude = () =>
  frozen([
    group('표층열만', ['MM010'], 0, 'g1', ['ESWT1']),
    group('체외충격파', ['ESWT7', 'ESWT2'], 1, 'g2', []),
    group('초음파', ['SONO1'], 2, 'g3'),
  ])

describe('AC-2706.1 제외할 처방 넣기(pickExclude)·inExclude', () => {
  it('AC-2706.1: 그 묶음의 제외할 처방 끝에 더하고 넣은 처방은 그대로다', () => {
    const after = pickExclude(withExclude(), 0, 'CRYO')
    expect(after[0]).toEqual({ id: 'g1', name: '표층열만', codes: ['MM010'], exclude: ['ESWT1', 'CRYO'], sortOrder: 0 })
    expect(orders(after)).toEqual([0, 1, 2])
  })

  it('AC-2706.1: 제외할 처방 칸이 없는 묶음(예전 모양)에는 그 코드 하나짜리 목록이 생긴다', () => {
    const after = pickExclude(withExclude(), 2, 'ESWT7')
    expect(after[2]).toEqual({ id: 'g3', name: '초음파', codes: ['SONO1'], exclude: ['ESWT7'], sortOrder: 2 })
  })

  it('AC-2706.1: 다른 묶음에 든 처방도 고를 수 있고 그 묶음은 그대로다(옮기지 않는다)', () => {
    const before = withExclude()
    const after = pickExclude(before, 0, 'ESWT7')
    expect(after[0].exclude).toEqual(['ESWT1', 'ESWT7'])
    expect(after[0].codes).toEqual(['MM010'])
    expect(after[1]).toEqual(copyOf(before)[1])
    expect(after[2]).toEqual(copyOf(before)[2])
    expect(ownerOf(after, 'ESWT7')).toBe(1)
  })

  it('AC-2706.1: 다른 묶음의 제외할 처방은 바꾸지 않는다(같은 코드를 두 묶음이 제외할 수 있다)', () => {
    const after = pickExclude(pickExclude(withExclude(), 1, 'ESWT1'), 2, 'ESWT1')
    expect(excludes(after)).toEqual([['ESWT1'], ['ESWT1'], ['ESWT1']])
  })

  it('AC-2706.1: 이 묶음의 넣은 처방에 있는 코드(대소문자 무시)는 그대로다(같은 내용의 새 목록)', () => {
    const before = withExclude()
    for (const code of ['MM010', 'mm010']) {
      const after = pickExclude(before, 0, code)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
    expect(pickExclude(before, 1, 'eswt2')).toEqual(copyOf(before))
  })

  it('AC-2706.1: 이미 제외할 처방에 있는 코드(대소문자 무시)는 다시 넣지 않는다', () => {
    const before = withExclude()
    for (const code of ['ESWT1', 'eswt1', 'Eswt1']) {
      const after = pickExclude(before, 0, code)
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })

  it('AC-2706.1: 없는 자리는 같은 내용의 새 목록이다', () => {
    const before = withExclude()
    for (const index of [3, -1, 9]) {
      const after = pickExclude(before, index, 'CRYO')
      expect(after).not.toBe(before)
      expect(after).toEqual(copyOf(before))
    }
  })

  it('AC-2706.1: 제외할 처방 넣기는 받은 목록을 바꾸지 않는다', () => {
    const before = withExclude()
    const snapshot = copyOf(before)
    pickExclude(before, 0, 'CRYO')
    pickExclude(before, 1, 'MM010')
    pickExclude(before, 2, 'ESWT7')
    pickExclude(before, 0, 'mm010')
    expect(before).toEqual(snapshot)
  })

  it('AC-2706.1: inExclude는 그 묶음의 제외할 처방에 있는지를 대소문자 무시로 본다(넣은 처방·칸 없음은 거짓)', () => {
    const [shallow, shock, sono] = withExclude()
    expect(inExclude(shallow, 'ESWT1')).toBe(true)
    expect(inExclude(shallow, 'eswt1')).toBe(true)
    expect(inExclude(shallow, 'MM010')).toBe(false)
    expect(inExclude(shallow, 'ESWT7')).toBe(false)
    expect(inExclude(shock, 'ESWT7')).toBe(false)
    expect(inExclude(sono, 'SONO1')).toBe(false)
    expect(inExclude(sono, 'ESWT1')).toBe(false)
  })
})

describe('AC-2706.2 제외할 처방 빼기(removeExclude)', () => {
  it('AC-2706.2: 그 묶음의 제외할 처방에서 그 코드만 빼고 넣은 처방·다른 묶음은 그대로다', () => {
    const before = frozen([
      group('표층열만', ['MM010'], 0, 'g1', ['ESWT1', 'CRYO', 'ESWT7']),
      group('초음파', ['SONO1'], 1, 'g3', ['CRYO']),
    ])
    const after = removeExclude(before, 0, 'CRYO')
    expect(after[0]).toEqual({ id: 'g1', name: '표층열만', codes: ['MM010'], exclude: ['ESWT1', 'ESWT7'], sortOrder: 0 })
    expect(after[1]).toEqual(copyOf(before)[1])
  })

  it('AC-2706.2: 마지막 하나를 빼면 빈 목록이 남는다(묶음은 그대로)', () => {
    const after = removeExclude(withExclude(), 0, 'ESWT1')
    expect(after).toHaveLength(3)
    expect(after[0]).toEqual({ id: 'g1', name: '표층열만', codes: ['MM010'], exclude: [], sortOrder: 0 })
  })

  it('AC-2706.2: 제외할 처방에 없는 코드·넣은 처방의 코드·칸 없는 묶음·없는 자리는 같은 내용의 새 목록이다', () => {
    const before = withExclude()
    const snapshot = copyOf(before)
    for (const [index, code] of [
      [0, 'CRYO'],
      [0, 'MM010'],
      [1, 'ESWT7'],
      [2, 'ESWT1'],
      [7, 'ESWT1'],
    ] as const) {
      const after = removeExclude(before, index, code)
      expect(after).not.toBe(before)
      expect(after).toEqual(snapshot)
    }
  })

  it('AC-2706.2: 제외할 처방 빼기는 받은 목록을 바꾸지 않는다', () => {
    const before = withExclude()
    const snapshot = copyOf(before)
    removeExclude(before, 0, 'ESWT1')
    removeExclude(before, 2, 'ESWT1')
    expect(before).toEqual(snapshot)
  })
})

describe('AC-2706.3 처방 넣기(pickCode)와 제외할 처방', () => {
  it('AC-2706.3: 이 묶음의 제외할 처방에 있는 코드(대소문자 무시)는 넣지 않는다(같은 내용의 새 목록, from null)', () => {
    const before = withExclude()
    for (const code of ['ESWT1', 'eswt1']) {
      const { groups, from } = pickCode(before, 0, code)
      expect(groups).not.toBe(before)
      expect(groups).toEqual(copyOf(before))
      expect(from).toBeNull()
    }
  })

  it('AC-2706.3: 이 묶음이 제외한 코드가 다른 묶음에 들어 있어도 옮기지 않는다', () => {
    const before = frozen([group('표층열만', ['MM010'], 0, 'g1', ['ESWT7']), group('체외충격파', ['ESWT7', 'ESWT2'], 1, 'g2')])
    const { groups, from } = pickCode(before, 0, 'ESWT7')
    expect(groups).toEqual(copyOf(before))
    expect(ownerOf(groups, 'ESWT7')).toBe(1)
    expect(from).toBeNull()
  })

  it('AC-2706.3: 다른 묶음의 제외할 처방에 있는 코드는 지금처럼 넣고, 그 묶음의 제외할 처방은 그대로다', () => {
    const { groups, from } = pickCode(withExclude(), 2, 'ESWT1')
    expect(groups.map((g) => g.codes)).toEqual([['MM010'], ['ESWT7', 'ESWT2'], ['SONO1', 'ESWT1']])
    expect(excludes(groups)).toEqual([['ESWT1'], [], undefined])
    expect(from).toBeNull()
  })

  it('AC-2706.3: 다른 묶음에서 옮겨 올 때도 제외할 처방은 어느 묶음에서도 바뀌지 않는다', () => {
    const before = frozen([
      group('표층열만', ['MM010'], 0, 'g1', ['ESWT7']),
      group('체외충격파', ['ESWT7', 'ESWT2'], 1, 'g2', ['CRYO']),
      group('새 묶음', [], 2, null, []),
    ])
    const { groups, from } = pickCode(before, 2, 'eswt7')
    expect(groups.map((g) => g.codes)).toEqual([['MM010'], ['ESWT2'], ['eswt7']])
    expect(excludes(groups)).toEqual([['ESWT7'], ['CRYO'], []])
    expect(from).toBe('체외충격파')
  })

  it('AC-2706.3: pickCode는 제외할 처방이 있는 받은 목록을 바꾸지 않는다', () => {
    const before = withExclude()
    const snapshot = copyOf(before)
    pickCode(before, 0, 'ESWT1')
    pickCode(before, 2, 'ESWT1')
    pickCode(before, 0, 'ESWT7')
    expect(before).toEqual(snapshot)
  })
})

describe('AC-2706.4 저장 값에 제외할 처방', () => {
  it('AC-2706.4: forSave는 묶음마다 exclude를 늘 배열로 싣는다(없으면 [], 있으면 새 배열로 옮겨 적음)', () => {
    const before = withExclude()
    const after = forSave(before)
    expect(after).toEqual([
      { id: 'g1', name: '표층열만', codes: ['MM010'], exclude: ['ESWT1'], sortOrder: 0 },
      { id: 'g2', name: '체외충격파', codes: ['ESWT7', 'ESWT2'], exclude: [], sortOrder: 1 },
      { id: 'g3', name: '초음파', codes: ['SONO1'], exclude: [], sortOrder: 2 },
    ])
    expect(after.every((g) => Array.isArray(g.exclude))).toBe(true)
    expect(after[0].exclude).not.toBe(before[0].exclude)
    expect(after[1].exclude).not.toBe(before[1].exclude)
  })

  it('AC-2706.4: 차례 바꾸기·지우기·이름·처방 넣고 빼기를 거쳐도 제외할 처방이 남아 저장 값에 실린다', () => {
    let draft: readonly StatsRxGroup[] = withExclude()
    draft = moveGroup(draft, 0, 1)
    draft = setName(draft, 1, ' 표층열 ')
    draft = removeCode(draft, 0, 'ESWT2')
    draft = pickCode(draft, 1, 'MM011').groups
    draft = removeGroup(draft, 2)
    draft = pickExclude(draft, 0, 'CRYO')
    expect(forSave(draft)).toEqual([
      { id: 'g2', name: '체외충격파', codes: ['ESWT7'], exclude: ['CRYO'], sortOrder: 0 },
      { id: 'g1', name: '표층열', codes: ['MM010', 'MM011'], exclude: ['ESWT1'], sortOrder: 1 },
    ])
  })

  it('AC-2706.4: forSave는 제외할 처방이 있는 받은 목록을 바꾸지 않는다', () => {
    const before = withExclude()
    const snapshot = copyOf(before)
    forSave(before)
    expect(before).toEqual(snapshot)
  })
})

describe('AC-2706.5 저장 글과 제외할 처방', () => {
  const SAVED = '저장했어요.'
  const AT_ONCE = '저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.'

  it('AC-2706.5: 처방이 든 묶음에 제외할 처방을 넣으면 `저장했어요.`(다시 불러와야 숫자가 나온다)', () => {
    const before = withExclude()
    expect(savedNote(before, forSave(pickExclude(before, 0, 'CRYO')))).toBe(SAVED)
    expect(savedNote(before, forSave(pickExclude(before, 1, 'CRYO')))).toBe(SAVED)
    expect(savedNote(before, forSave(pickExclude(before, 2, 'CRYO')))).toBe(SAVED) // 칸 없던 묶음
  })

  it('AC-2706.5: 제외할 처방을 빼거나 바꾸면 `저장했어요.`', () => {
    const before = withExclude()
    expect(savedNote(before, forSave(removeExclude(before, 0, 'ESWT1')))).toBe(SAVED)
    expect(savedNote(before, forSave(pickExclude(removeExclude(before, 0, 'ESWT1'), 0, 'CRYO')))).toBe(SAVED)
  })

  it('AC-2706.5: 제외할 처방 모음이 같으면(차례·대소문자만 다름, 칸 없음 = 빈 배열) 바뀐 것으로 세지 않는다', () => {
    const before = frozen([group('표층열만', ['MM010'], 0, 'g1', ['ESWT1', 'CRYO']), group('초음파', ['SONO1'], 1, 'g3')])
    const after = [group('표층열만', ['MM010'], 0, 'g1', ['cryo', 'Eswt1']), group('초음파', ['SONO1'], 1, 'g3', [])]
    expect(savedNote(before, after)).toBe(AT_ONCE)
    expect(savedNote(before, forSave(before))).toBe(AT_ONCE)
    expect(savedNote(after, [group('표층열만', ['MM010'], 0, 'g1', ['ESWT1', 'CRYO']), group('초음파', ['SONO1'], 1, 'g3')])).toBe(AT_ONCE)
  })

  it('AC-2706.5: 넣은 처방이 없는 묶음의 제외할 처방만 바뀌었으면 바로 반영했다고 말한다', () => {
    const before = frozen([group('도수치료', ['도수'], 0, 'g1'), group('빈 묶음', [], 1, 'g2', ['ESWT1'])])
    expect(savedNote(before, forSave(pickExclude(before, 1, 'CRYO')))).toBe(AT_ONCE)
    expect(savedNote(before, forSave(removeExclude(before, 1, 'ESWT1')))).toBe(AT_ONCE)
    const added = addBlankGroup(before) as StatsRxGroup[]
    expect(savedNote(before, forSave(pickExclude(setName(added, 2, '새 묶음'), 2, 'CRYO')))).toBe(AT_ONCE)
  })

  it('AC-2706.5: 이름·차례만 바꾸면 제외할 처방이 있어도 바로 반영했다고 말한다', () => {
    const before = withExclude()
    expect(savedNote(before, forSave(setName(moveGroup(before, 0, 1), 1, '표층열')))).toBe(AT_ONCE)
  })

  it('AC-2706.5: 저장 글은 제외할 처방이 있는 받은 목록을 바꾸지 않는다', () => {
    const before = withExclude()
    const after = frozen(forSave(pickExclude(before, 0, 'CRYO')))
    const snapshots = [copyOf(before), copyOf(after)]
    savedNote(before, after)
    expect([before, after]).toEqual(snapshots)
  })
})
