import { describe, expect, it } from 'vitest'
import type { InputTargets, LeftReason, MemoCompare, TargetRow } from '@/types/precheck'
import { canCopy, copyStatus, keepOrFirst, listGroups, neighbor, positionOf, showCounts } from './memoSplit'

// 두 칸 보기의 목록 펼치기·옮기기·상태 줄 고르기(AC-3101.2·AC-3101.3·AC-3101.5·AC-3101.6·AC-3101.8·AC-3102.2·AC-3103.5~AC-3103.8). 순수 함수다. 이름·차트는 지어낸 것이다

const row = (key: string, over: Partial<TargetRow> = {}): TargetRow => ({
  key,
  date: '2099-03-02',
  text: `◈메모 ${key}`,
  hasMemo: true,
  unfinished: false,
  compare: '비트에 없음' as MemoCompare,
  chart: `9${key}`,
  name: `가상환자${key}`,
  rx: [],
  rxNames: [],
  warned: false,
  chartLines: [],
  rxRows: [],
  sameDay: 1,
  foundByPc: false,
  chip: null,
  done: false,
  ...over,
})
const targets = (batch: TargetRow[], left: { reason: LeftReason; rows: TargetRow[] }[] = []): InputTargets => ({ problem: null, range: null, code: null, batch, left, chips: [], typedOverChip: false, replacing: 0 })
const ids = (groups: ReturnType<typeof listGroups>) => groups.map((group) => group.id)
const keysOf = (groups: ReturnType<typeof listGroups>) => groups.flatMap((group) => group.rows.map((item) => item.key))

const SAMPLE = targets(
  [row('a', { chip: '새 메모' }), row('b', { chip: '새 메모', done: true }), row('c', { chip: '메모 바꿈' })],
  [
    { reason: 'done', rows: [row('d', { done: true })] },
    { reason: 'nomemo', rows: [row('e', { hasMemo: false, text: '' })] },
    { reason: 'mark', rows: [row('f', { unfinished: true })] },
    { reason: 'manual', rows: [row('g')] },
    { reason: 'diff', rows: [row('h', { compare: '다름' })] },
    { reason: 'unread', rows: [row('i')] },
    { reason: 'held', rows: [row('j')] },
  ],
)

describe('AC-3101.2 묶음 차례', () => {
  it('AC-3101.2: 입력할 사람 → 확인 필요 → 다른 메모 있음 → 직접 입력 → 지난번 건너뜀 → 읽지 못함 → 이미 입력됨 → 메모 없음', () => {
    const groups = listGroups(SAMPLE, 'all', null)
    expect(ids(groups)).toEqual(['batch', 'mark', 'diff', 'manual', 'held', 'unread', 'done', 'nomemo'])
    expect(groups.map((group) => group.name)).toEqual(['입력할 사람', '확인 필요', '다른 메모 있음', '직접 입력', '지난번 건너뜀', '비트 메모를 읽지 못함', '이미 입력됨', '메모 없음'])
    expect(keysOf(groups)).toEqual(['a', 'b', 'c', 'f', 'h', 'g', 'j', 'i', 'd', 'e'])
    expect(groups[0]).toMatchObject({ total: 3 })
  })

  it('AC-3101.2: 사람이 없는 묶음은 없다', () => {
    expect(ids(listGroups(targets([], [{ reason: 'mark', rows: [row('m', { unfinished: true })] }]), 'all', null))).toEqual(['mark'])
    expect(listGroups(targets([]), 'all', null)).toEqual([])
  })
})

describe('AC-3101.5·AC-3101.6 전체·미완료·완료 보기', () => {
  it('AC-3101.5: 수는 지금 조건 안의 사람 수다', () => {
    expect(showCounts(SAMPLE)).toEqual({ all: 10, todo: 8, done: 2 })
  })

  it('AC-3101.5: 미완료는 완료가 아닌 줄만, 완료는 완료 줄만 남고 묶음 전체 수(total)는 그대로다', () => {
    const todo = listGroups(SAMPLE, 'todo', null)
    expect(keysOf(todo)).toEqual(['a', 'c', 'f', 'h', 'g', 'j', 'i', 'e'])
    expect(todo[0]).toMatchObject({ id: 'batch', total: 3 })
    expect(keysOf(listGroups(SAMPLE, 'done', null))).toEqual(['b', 'd'])
  })

  it('AC-3101.3: 입력할 사람 줄의 번호(no)는 보기로 거르기 전 차례이고 positionOf의 i와 같다. 다른 묶음 줄에는 번호가 없다', () => {
    const nos = (groups: ReturnType<typeof listGroups>) => groups.flatMap((group) => group.rows.map((item) => [item.key, item.no]))
    expect(nos(listGroups(SAMPLE, 'all', null)).slice(0, 4)).toEqual([['a', 1], ['b', 2], ['c', 3], ['f', undefined]])
    expect(nos(listGroups(SAMPLE, 'todo', null)).slice(0, 2)).toEqual([['a', 1], ['c', 3]])
    expect(nos(listGroups(SAMPLE, 'done', null))).toEqual([['b', 2], ['d', undefined]])
    expect(nos(listGroups(SAMPLE, 'todo', 'b')).slice(0, 3)).toEqual([['a', 1], ['b', 2], ['c', 3]])
    for (const key of ['a', 'b', 'c']) expect(listGroups(SAMPLE, 'all', null)[0].rows.find((item) => item.key === key)?.no).toBe(positionOf(SAMPLE, key)?.index)
    expect(listGroups(SAMPLE, 'all', null).slice(1).flatMap((group) => group.rows).every((item) => !('no' in item))).toBe(true)
  })

  it('AC-3101.6: 머물 사람(stayKey)은 보기에 맞지 않아도 남는다', () => {
    expect(keysOf(listGroups(SAMPLE, 'todo', 'b'))).toEqual(['a', 'b', 'c', 'f', 'h', 'g', 'j', 'i', 'e'])
    expect(keysOf(listGroups(SAMPLE, 'done', 'a'))).toEqual(['a', 'b', 'd'])
  })
})

describe('AC-3101.8·AC-3102.2 고를 사람과 앞·뒤 사람', () => {
  const groups = listGroups(SAMPLE, 'all', null)

  it('AC-3101.8: 지금 사람이 목록에 있으면 그대로, 없으면 맨 위 사람이고, 아무도 없으면 null이다', () => {
    expect(keepOrFirst(groups, 'h')).toBe('h')
    expect(keepOrFirst(groups, 'zz')).toBe('a')
    expect(keepOrFirst(groups, null)).toBe('a')
    expect(keepOrFirst([], 'a')).toBeNull()
  })

  it('AC-3102.2: 보이는 차례로 앞·뒤 사람이고 묶음을 넘어가며, 끝이면 null이다', () => {
    expect(neighbor(groups, 'c', 1)).toBe('f')
    expect(neighbor(groups, 'f', -1)).toBe('c')
    expect(neighbor(groups, 'a', -1)).toBeNull()
    expect(neighbor(groups, 'e', 1)).toBeNull()
    expect(neighbor(groups, 'zz', 1)).toBeNull()
  })

  it('AC-3105.1: 상세 머리의 위치는 묶음 이름과 묶음 전체에서 몇째인가다(보기로 걸러도 같다)', () => {
    expect(positionOf(SAMPLE, 'c')).toEqual({ id: 'batch', name: '입력할 사람', index: 3, total: 3 })
    expect(positionOf(SAMPLE, 'h')).toEqual({ id: 'diff', name: '다른 메모 있음', index: 1, total: 1 })
    expect(positionOf(SAMPLE, 'zz')).toBeNull()
  })
})

describe('AC-3103.5~AC-3103.8 복사할 수 있나와 상태 줄', () => {
  const base = { editing: false, failed: false, reopened: false, justCopied: false, locked: false, storeStuck: false }

  it('AC-3103.5: 우리 메모 글이 있고 확인 표시가 없을 때만 복사할 수 있다', () => {
    expect(canCopy(row('a'))).toBe(true)
    expect(canCopy(row('a', { unfinished: true }))).toBe(false)
    expect(canCopy(row('a', { hasMemo: false }))).toBe(false)
    expect(canCopy(row('a', { text: ' \n ' }))).toBe(false)
  })

  it('AC-3103.7: 보통은 ready, 완료면 done, 방금 복사했으면 copied다', () => {
    expect(copyStatus({ ...base, row: row('a') })).toBe('ready')
    expect(copyStatus({ ...base, row: row('a', { done: true }) })).toBe('done')
    expect(copyStatus({ ...base, row: row('a', { done: true }), justCopied: true })).toBe('copied')
    expect(copyStatus({ ...base, row: row('a'), justCopied: true })).toBe('ready')
  })

  it('AC-3103.3: 복사 실패는 failed, 완료였던 사람이면 failedAgain이다', () => {
    expect(copyStatus({ ...base, row: row('a'), failed: true })).toBe('failed')
    expect(copyStatus({ ...base, row: row('a', { done: true }), failed: true, justCopied: true })).toBe('failedAgain')
  })

  it('AC-3103.5: 메모 없음은 none, 확인 표시는 mark다', () => {
    expect(copyStatus({ ...base, row: row('a', { hasMemo: false, text: '' }) })).toBe('none')
    expect(copyStatus({ ...base, row: row('a', { unfinished: true }) })).toBe('mark')
  })

  it('AC-3104.6: 고쳐서 완료가 풀렸으면 reopened다(복사 실패보다 뒤, 확인 표시보다 앞)', () => {
    expect(copyStatus({ ...base, row: row('a'), reopened: true })).toBe('reopened')
    expect(copyStatus({ ...base, row: row('a', { unfinished: true }), reopened: true })).toBe('reopened')
    expect(copyStatus({ ...base, row: row('a'), reopened: true, failed: true })).toBe('failed')
  })

  it('AC-3103.6·AC-3103.8: 고치는 중 > 입력 중 > 저장 막힘이 다른 모든 것보다 앞이다', () => {
    const all = { row: row('a', { done: true, unfinished: true }), failed: true, reopened: true, justCopied: true }
    expect(copyStatus({ ...base, ...all, editing: true, locked: true, storeStuck: true })).toBe('editing')
    expect(copyStatus({ ...base, ...all, locked: true, storeStuck: true })).toBe('locked')
    expect(copyStatus({ ...base, ...all, storeStuck: true })).toBe('stuck')
  })
})
