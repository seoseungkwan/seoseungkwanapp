// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listStatsRxGroups, saveStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { RxGroupDef } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { groupDefs, groupKey } from './treatmentView'
import { FOR_LOAD_LIMIT_MS, useStatsRxGroups } from './useStatsRxGroups'

// 처방별 추세 묶음 훅 (treatment-trend REQ-1204·1205·1211·1213, design.md '묶음 훅' · 제외할 처방은 rx-group-exclude AC-2706.4·2706.6). 저장 코드는 가짜다. 처방·묶음은 모두 지어낸 값이다.
// 가짜 서버는 메모리의 줄을 실제처럼 바꾼다: 저장은 목록 통째 바꾸기이고 id 없는 줄에 새 id를 준다.
// 요청은 sent에 차례대로 적히고, holdNext로 답을 잡아 두거나(열지 않으면 끝나지 않음) failNext로 실패시킨다

vi.mock('@/lib/storage/statsRxGroups', () => ({
  listStatsRxGroups: vi.fn(),
  saveStatsRxGroups: vi.fn(),
}))

type Label = 'list' | 'save'
type Gate = { open(): void; fail(): void; wait: Promise<void> }

function makeGate(): Gate {
  let open!: () => void
  let fail!: () => void
  const wait = new Promise<void>((yes, no) => {
    open = yes
    fail = () => no(new Error('가짜 실패'))
  })
  return { open, fail, wait }
}

let stored: StatsRxGroup[]
let sent: Label[]
let saves: StatsRxGroup[][]
let gates: Map<Label, Gate[]>
let failing: Map<Label, number>
let nextId: number

async function request<T>(label: Label, work: () => T): Promise<T> {
  sent.push(label)
  const gate = gates.get(label)?.shift()
  if (gate) await gate.wait
  const left = failing.get(label) ?? 0
  if (left > 0) {
    failing.set(label, left - 1)
    throw new Error('가짜 실패')
  }
  return work()
}

const holdNext = (label: Label) => {
  const gate = makeGate()
  gates.set(label, [...(gates.get(label) ?? []), gate])
  return gate
}
const failNext = (label: Label, times = 1) => failing.set(label, times)
const copy = (rows: readonly StatsRxGroup[]) => rows.map((row) => ({ ...row, codes: [...row.codes] }))

// ── 가짜 일 줄 ──────────────────────────────────────────
type Rx = DayPayload['rx'][number]
const rx = (code: string): Rx => ({ code, name: `가짜 ${code}`, type: '처치', patients: 1, newPatients: 0, returning: 1 })
function day(ymd: string, codes: string[]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: codes.map(rx),
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

const NO_DAYS: readonly DayPayload[] = []
// 고른 기간(11월)과 비교 기간(10월)에 나뉘어 있다. AA254는 다섯 규칙 어디에도 맞지 않는다
const DAYS: readonly DayPayload[] = [day('2026-10-20', ['도수', 'ESWT1', 'AA254']), day('2026-11-02', ['eswt7', 'CARM1', 'SONO1', 'CRYO'])]
const OTHER_DAYS: readonly DayPayload[] = [day('2026-11-03', ['ESWT9', 'CRYO2'])]

const group = (name: string, codes: string[], sortOrder: number, id: string | null = `s${sortOrder}`): RxGroup => ({ id, name, codes, sortOrder })
// 제안 묶음과 forSave 값은 제외할 처방이 빈 배열이다(AC-2706.4·AC-2706.6)
const noExclude = (row: RxGroup): StatsRxGroup => ({ ...row, exclude: [] })
const SUGGESTED_NAMES = ['도수치료', '체외충격파', 'C-arm 주사', '초음파', '냉동치료']
const SUGGESTED_FROM_DAYS: StatsRxGroup[] = [
  group('도수치료', ['도수'], 0, null),
  group('체외충격파', ['ESWT1', 'eswt7'], 1, null),
  group('C-arm 주사', ['CARM1'], 2, null),
  group('초음파', ['SONO1'], 3, null),
  group('냉동치료', ['CRYO'], 4, null),
].map(noExclude)
const SAVED: RxGroup[] = [group('물리치료 묶음', ['PT1', 'PT2'], 0, 'g-a'), group('주사 묶음', ['INJ1'], 1, 'g-b')]

beforeEach(() => {
  stored = []
  sent = []
  saves = []
  gates = new Map()
  failing = new Map()
  nextId = 1
  vi.mocked(listStatsRxGroups)
    .mockReset()
    .mockImplementation(() => request('list', () => copy(stored)))
  vi.mocked(saveStatsRxGroups)
    .mockReset()
    .mockImplementation((after) => {
      saves.push(copy(after))
      return request('save', () => {
        stored = after.map((row) => ({ ...row, id: row.id ?? `n${nextId++}`, codes: [...row.codes] }))
        return copy(stored)
      })
    })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))
const release = async (gate: Gate) => {
  gate.open()
  await settle()
}

const draw = (days: readonly DayPayload[] = NO_DAYS) =>
  renderHook(({ days: shown }: { days: readonly DayPayload[] }) => useStatsRxGroups(shown), { initialProps: { days } })
type View = ReturnType<typeof draw>

const ready = async (view: View) => {
  await waitFor(() => expect(view.result.current.state).toBe('ready'))
  sent.length = 0
  return view
}
const codesOf = (view: View) => view.result.current.groups.map((g) => g.codes)
const namesOf = (view: View) => view.result.current.groups.map((g) => g.name)

/** forLoad를 부르고 답을 담아 둔다(거절되면 failure에 담긴다. 거절하면 안 된다) */
function callForLoad(view: View) {
  const outcome: { defs: RxGroupDef[] | null; failure: unknown } = { defs: null, failure: null }
  act(() => {
    void view.result.current.forLoad().then(
      (defs) => {
        outcome.defs = defs
      },
      (error: unknown) => {
        outcome.failure = error
      },
    )
  })
  return outcome
}
async function forLoadNow(view: View): Promise<RxGroupDef[]> {
  let defs: RxGroupDef[] = []
  await act(async () => {
    defs = await view.result.current.forLoad()
  })
  return defs
}

describe('AC-1211.1~AC-1211.3 읽기 상태', () => {
  it('AC-1211.1 처음에는 reading이고 묶음이 없다. 읽기가 끝나면 ready다', async () => {
    stored = copy(SAVED)
    const gate = holdNext('list')
    const view = draw(DAYS)
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.groups).toEqual([])
    expect(view.result.current.suggested).toBe(false)
    await settle()
    expect(view.result.current.state).toBe('reading')

    await release(gate)
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.groups).toEqual(SAVED)
    expect(sent).toEqual(['list'])
  })

  it('AC-1211.2 읽기 실패면 read-failed이고 묶음이 없다(빈 목록으로 보고 제안으로 바꾸지 않는다)', async () => {
    failNext('list')
    const view = draw(DAYS)
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))
    expect(view.result.current.groups).toEqual([])
    expect(view.result.current.suggested).toBe(false)
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-1211.2 [다시 읽기]는 reading을 거쳐 서버에서 다시 읽은 줄을 보인다', async () => {
    stored = copy(SAVED)
    failNext('list')
    const view = draw(DAYS)
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))

    sent.length = 0
    const gate = holdNext('list')
    act(() => view.result.current.reread())
    expect(view.result.current.state).toBe('reading')
    expect(sent).toEqual(['list'])

    await release(gate)
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.groups).toEqual(SAVED)
  })

  it('AC-1211.3 다른 기기에서 저장한 묶음은 서버에서 읽은 그 줄 그대로이고 sortOrder 차례다(suggested 거짓)', async () => {
    stored = [SAVED[1], SAVED[0]] // 서버가 섞어 줘도 sortOrder 차례로 둔다
    const view = await ready(draw(DAYS))
    expect(view.result.current.groups).toEqual(SAVED)
    expect(view.result.current.suggested).toBe(false)
    expect(view.result.current.saving).toBe(false)
    expect(view.result.current.saveFailed).toBe(false)
  })
})

describe('AC-1204.1 처음 다섯 묶음', () => {
  it('AC-1204.1 저장된 묶음이 없으면 suggestGroups의 다섯(이 차례, id 없음)이고 처방은 화면 일 숫자에서 규칙에 맞는 코드다(AA254는 어디에도 없다)', async () => {
    const view = await ready(draw(DAYS))
    expect(view.result.current.suggested).toBe(true)
    expect(view.result.current.groups).toEqual(SUGGESTED_FROM_DAYS)
    expect(view.result.current.groups.flatMap((g) => g.codes)).not.toContain('AA254')
  })

  it('AC-1204.1 대소문자만 다른 코드는 한 번만 든다(가장 최근 날의 글자)', async () => {
    const days = [day('2026-10-20', ['eswt7']), day('2026-11-02', ['ESWT7']), day('2026-11-01', ['Eswt7'])]
    const view = await ready(draw(days))
    expect(view.result.current.groups[1]).toEqual(noExclude(group('체외충격파', ['ESWT7'], 1, null)))
  })

  it('AC-1204.1 맞는 코드가 없어도 다섯이 처방 없이 나온다', async () => {
    const view = await ready(draw([day('2026-11-02', ['AA254'])]))
    expect(namesOf(view)).toEqual(SUGGESTED_NAMES)
    expect(codesOf(view)).toEqual([[], [], [], [], []])
    expect(view.result.current.groups.every((g) => g.id === null)).toBe(true)
  })
})

describe('AC-1204.2 보기만으로는 저장 안 함', () => {
  it('AC-1204.2 제안을 보기만 하면(다시 그리고 days가 바뀌어도) saveStatsRxGroups를 부르지 않는다', async () => {
    const view = await ready(draw(DAYS))
    view.rerender({ days: OTHER_DAYS })
    view.rerender({ days: DAYS })
    await settle()
    expect(view.result.current.suggested).toBe(true)
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })
})

describe('AC-1204.3 제안 저장', () => {
  it('AC-1204.3 [저장]은 forSave 값(이름 trim, sortOrder 0부터)을 한 번 저장하고, 기다리는 동안 saving이며 성공하면 true와 돌려받은 줄이다', async () => {
    const view = await ready(draw(DAYS))
    const edited = [{ ...view.result.current.groups[1], name: ' 충격파 ', sortOrder: 7 }, view.result.current.groups[0]]
    const gate = holdNext('save')
    let saved: boolean | null = null
    act(() => {
      void view.result.current.save(edited).then((ok) => {
        saved = ok
      })
    })
    expect(view.result.current.saving).toBe(true)
    expect(saves).toEqual([[noExclude(group('충격파', ['ESWT1', 'eswt7'], 0, null)), noExclude(group('도수치료', ['도수'], 1, null))]])

    await release(gate)
    expect(saved).toBe(true)
    expect(view.result.current.saving).toBe(false)
    expect(view.result.current.saveFailed).toBe(false)
    expect(view.result.current.suggested).toBe(false)
    expect(view.result.current.groups).toEqual([noExclude(group('충격파', ['ESWT1', 'eswt7'], 0, 'n1')), noExclude(group('도수치료', ['도수'], 1, 'n2'))])
    expect(sent).toEqual(['save'])
  })

  it('AC-1204.3 [저장]이 실패하면 false이고 saveFailed가 참이며 묶음은 그대로다. 다시 눌러 성공하면 saveFailed가 풀린다', async () => {
    const view = await ready(draw(DAYS))
    failNext('save')
    let first: boolean | null = null
    await act(async () => {
      first = await view.result.current.save(view.result.current.groups)
    })
    expect(first).toBe(false)
    expect(view.result.current.saving).toBe(false)
    expect(view.result.current.saveFailed).toBe(true)
    expect(view.result.current.suggested).toBe(true)
    expect(view.result.current.groups).toEqual(SUGGESTED_FROM_DAYS)

    let second: boolean | null = null
    await act(async () => {
      second = await view.result.current.save(view.result.current.groups)
    })
    expect(second).toBe(true)
    expect(view.result.current.saveFailed).toBe(false)
    expect(view.result.current.suggested).toBe(false)
  })

  it('AC-1204.3 처방 든 제안이 있으면 forLoad가 그때의 다섯을 저장하고 그 다섯의 정의로 푼다', async () => {
    const view = await ready(draw(DAYS))
    const defs = await forLoadNow(view)
    expect(sent).toEqual(['list', 'save'])
    expect(saves).toEqual([SUGGESTED_FROM_DAYS])
    expect(defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
    expect(defs.map((d) => d.codes)).toEqual([['도수'], ['ESWT1', 'eswt7'], ['CARM1'], ['SONO1'], ['CRYO']])
    expect(view.result.current.suggested).toBe(false)
    expect(view.result.current.groups.every((g) => g.id !== null)).toBe(true)
    expect(view.result.current.saving).toBe(false) // 불러오기 쪽 저장은 [저장] 단추 상태가 아니다
  })

  it('AC-1204.3 불러오기 쪽 저장이 실패해도 그 다섯의 처방으로 센다(정의를 내고 거절하지 않는다). 저장 실패 표시는 없고 제안 그대로다', async () => {
    const view = await ready(draw(DAYS))
    failNext('save')
    const outcome = callForLoad(view)
    await settle()
    expect(outcome.failure).toBeNull()
    expect(outcome.defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
    expect(view.result.current.saveFailed).toBe(false)
    expect(view.result.current.suggested).toBe(true)
    expect(view.result.current.groups).toEqual(SUGGESTED_FROM_DAYS)
  })

  it('AC-1204.3 처방이 든 제안이 하나도 없으면 forLoad는 저장하지 않고 빈 정의로 푼다', async () => {
    const view = await ready(draw([day('2026-11-02', ['AA254'])]))
    const defs = await forLoadNow(view)
    expect(defs).toEqual([])
    expect(sent).toEqual(['list'])
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
    expect(view.result.current.suggested).toBe(true)
  })
})

describe('AC-1204.4 모두 지우고 저장', () => {
  it('AC-1204.4 묶음을 모두 지우고 저장하면(저장된 줄 0개) 다시 다섯 제안이다', async () => {
    stored = copy(SAVED)
    const view = await ready(draw(DAYS))
    expect(view.result.current.suggested).toBe(false)

    let ok: boolean | null = null
    await act(async () => {
      ok = await view.result.current.save([])
    })
    expect(ok).toBe(true)
    expect(saves).toEqual([[]])
    expect(view.result.current.suggested).toBe(true)
    expect(view.result.current.groups).toEqual(SUGGESTED_FROM_DAYS)
  })

  it('AC-1204.4 다음에 읽을 때 저장된 줄이 0개면 다섯 제안이다', async () => {
    stored = []
    const view = await ready(draw(DAYS))
    expect(view.result.current.suggested).toBe(true)
    expect(namesOf(view)).toEqual(SUGGESTED_NAMES)
  })
})

describe('AC-1204.5 저장된 줄이 없는 동안 제안은 days를 따른다', () => {
  it('AC-1204.5 (가) 읽기가 빈 목록으로 days보다 먼저 끝나면 처방 없는 제안이다가, days가 오면 코드가 차고 forLoad가 그 코드로 정의를 낸다', async () => {
    const view = await ready(draw(NO_DAYS))
    expect(view.result.current.suggested).toBe(true)
    expect(codesOf(view)).toEqual([[], [], [], [], []])

    view.rerender({ days: DAYS })
    expect(view.result.current.groups).toEqual(SUGGESTED_FROM_DAYS)

    const defs = await forLoadNow(view)
    expect(defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
    expect(defs.map((d) => d.id)).toEqual(SUGGESTED_FROM_DAYS.map((g) => groupKey(g.codes)))
  })

  it('AC-1204.5 (나) forLoad의 제안 저장이 성공한 뒤 days를 바꿔도 묶음 코드가 그대로이고 suggested가 거짓이다', async () => {
    const view = await ready(draw(DAYS))
    await forLoadNow(view)
    expect(view.result.current.suggested).toBe(false)

    view.rerender({ days: OTHER_DAYS })
    expect(view.result.current.suggested).toBe(false)
    expect(codesOf(view)).toEqual(SUGGESTED_FROM_DAYS.map((g) => g.codes))
    expect(namesOf(view)).toEqual(SUGGESTED_NAMES)
  })

  it('AC-1204.5 [저장] 성공 뒤에도 days를 바꿔도 묶음 코드가 그대로다', async () => {
    const view = await ready(draw(DAYS))
    await act(async () => {
      await view.result.current.save(view.result.current.groups)
    })
    view.rerender({ days: OTHER_DAYS })
    expect(view.result.current.suggested).toBe(false)
    expect(codesOf(view)).toEqual(SUGGESTED_FROM_DAYS.map((g) => g.codes))
  })

  it('AC-1204.5 저장이 성공한 뒤에 늦게 온 앞 읽기(빈 목록)는 저장된 줄을 제안으로 되돌리지 않는다', async () => {
    const first = holdNext('list')
    const view = draw(DAYS)
    await settle()
    expect(view.result.current.state).toBe('reading')

    await act(async () => {
      await view.result.current.save(SUGGESTED_FROM_DAYS)
    })
    expect(view.result.current.suggested).toBe(false)

    stored = [] // 앞 읽기가 저장 전 모습을 늦게 가져온다
    await release(first)
    view.rerender({ days: OTHER_DAYS })
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.suggested).toBe(false)
    expect(codesOf(view)).toEqual(SUGGESTED_FROM_DAYS.map((g) => g.codes))
  })
})

describe('AC-1205.7 불러올 때 다시 읽기', () => {
  it('AC-1205.7 forLoad는 서버에서 다시 읽고, 다른 기기에서 고친 줄이 있으면 그 줄로 상태를 바꾸고 그 정의를 낸다', async () => {
    stored = copy(SAVED)
    const view = await ready(draw(DAYS))
    const changed = [group('다른 기기 묶음', ['NEW1'], 0, 'g-c')]
    stored = copy(changed)

    const defs = await forLoadNow(view)
    expect(sent).toEqual(['list'])
    expect(defs).toEqual([{ id: groupKey(['NEW1']), codes: ['NEW1'] }])
    expect(view.result.current.groups).toEqual(changed)
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
  })

  it('AC-1205.7 다시 읽기가 실패하면 화면에 있는 저장된 묶음의 정의로 풀린다(거절하지 않고 상태도 그대로다)', async () => {
    stored = copy(SAVED)
    const view = await ready(draw(DAYS))
    failNext('list')
    const outcome = callForLoad(view)
    await settle()
    expect(outcome.failure).toBeNull()
    expect(outcome.defs).toEqual(groupDefs(SAVED))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.groups).toEqual(SAVED)
  })

  it('AC-1205.7 다시 읽기가 실패하면 화면의 제안 묶음 정의로 풀리고 제안을 저장하지 않는다', async () => {
    const view = await ready(draw(DAYS))
    failNext('list')
    const defs = await forLoadNow(view)
    expect(defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
    expect(view.result.current.suggested).toBe(true)
  })

  it('AC-1205.7 읽은 적이 없고(읽기 실패) 다시 읽기도 실패하면 빈 정의로 풀린다(거절하지 않는다)', async () => {
    failNext('list', 2)
    const view = draw(DAYS)
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))
    const outcome = callForLoad(view)
    await settle()
    expect(outcome.failure).toBeNull()
    expect(outcome.defs).toEqual([])
    expect(view.result.current.state).toBe('read-failed')
  })

  it('AC-1205.7 읽기 실패 상태에서 forLoad의 다시 읽기가 줄을 받으면 그 줄이 묶음이 된다', async () => {
    failNext('list')
    const view = draw(DAYS)
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))
    stored = copy(SAVED)
    const defs = await forLoadNow(view)
    expect(defs).toEqual(groupDefs(SAVED))
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.groups).toEqual(SAVED)
  })
})

describe('AC-1205.9 기다림 한도 5초', () => {
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  async function readyWithClock(days: readonly DayPayload[]) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const view = draw(days)
    await advance(0)
    expect(view.result.current.state).toBe('ready')
    sent.length = 0
    return view
  }

  it('AC-1205.9 FOR_LOAD_LIMIT_MS는 5,000이다', () => {
    expect(FOR_LOAD_LIMIT_MS).toBe(5_000)
  })

  it('AC-1205.9 다시 읽기가 끝나지 않으면 4,999ms에는 안 풀리고 5,000ms에 화면 묶음의 정의로 풀린다. 늦게 온 답은 상태만 바꾸고 넘긴 정의는 그대로다', async () => {
    stored = copy(SAVED)
    const view = await readyWithClock(DAYS)
    const gate = holdNext('list')
    const outcome = callForLoad(view)

    await advance(FOR_LOAD_LIMIT_MS - 1)
    expect(outcome.defs).toBeNull()
    await advance(1)
    expect(outcome.failure).toBeNull()
    expect(outcome.defs).toEqual(groupDefs(SAVED))
    const handed = structuredClone(outcome.defs)

    const late = [group('늦게 온 묶음', ['LATE1'], 0, 'g-late')]
    stored = copy(late)
    gate.open()
    await advance(0)
    expect(view.result.current.groups).toEqual(late)
    expect(outcome.defs).toEqual(handed)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-1205.9 제안 저장이 끝나지 않아도 5,000ms에 그 제안의 정의로 풀리고, 늦게 성공하면 상태만 저장된 줄이 된다', async () => {
    const view = await readyWithClock(DAYS)
    const gate = holdNext('save')
    const outcome = callForLoad(view)

    await advance(FOR_LOAD_LIMIT_MS - 1)
    expect(sent).toEqual(['list', 'save'])
    expect(outcome.defs).toBeNull()
    await advance(1)
    expect(outcome.defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
    expect(view.result.current.suggested).toBe(true)

    gate.open()
    await advance(0)
    expect(view.result.current.suggested).toBe(false)
    expect(view.result.current.groups.every((g) => g.id !== null)).toBe(true)
    expect(outcome.defs).toEqual(groupDefs(SUGGESTED_FROM_DAYS))
  })

  it('AC-1205.9 읽은 적이 없고 첫 읽기·다시 읽기가 끝나지 않으면 5,000ms에 빈 정의로 풀린다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    holdNext('list')
    holdNext('list')
    const view = draw(DAYS)
    await advance(0)
    expect(view.result.current.state).toBe('reading')
    const outcome = callForLoad(view)

    await advance(FOR_LOAD_LIMIT_MS - 1)
    expect(outcome.defs).toBeNull()
    await advance(1)
    expect(outcome.failure).toBeNull()
    expect(outcome.defs).toEqual([])
    expect(view.result.current.state).toBe('reading')
  })

  it('AC-1205.9 읽기가 빨리 끝나면 시계를 기다리지 않고 풀리고 시계가 남지 않는다', async () => {
    stored = copy(SAVED)
    const view = await readyWithClock(DAYS)
    const outcome = callForLoad(view)
    await advance(0)
    expect(outcome.defs).toEqual(groupDefs(SAVED))
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AC-2706.6 제안 묶음의 제외할 처방', () => {
  it('AC-2706.6 저장된 줄이 없어 나오는 제안 다섯은 묶음마다 exclude: []다(맞는 코드가 있든 없든)', async () => {
    for (const days of [DAYS, [day('2026-11-02', ['AA254'])]]) {
      const view = await ready(draw(days))
      expect(view.result.current.suggested).toBe(true)
      expect(view.result.current.groups).toHaveLength(5)
      expect(view.result.current.groups.map((g) => g.exclude)).toEqual([[], [], [], [], []])
      view.unmount()
    }
  })

  it('AC-2706.6 days가 바뀌어 다시 고른 제안도 묶음마다 exclude: []다', async () => {
    const view = await ready(draw(NO_DAYS))
    view.rerender({ days: OTHER_DAYS })
    expect(view.result.current.suggested).toBe(true)
    expect(view.result.current.groups.map((g) => g.exclude)).toEqual([[], [], [], [], []])
  })

  it('AC-2706.6 forLoad가 저장하는 제안 다섯도 묶음마다 exclude: []로 보낸다', async () => {
    const view = await ready(draw(DAYS))
    await forLoadNow(view)
    expect(saves).toHaveLength(1)
    expect(saves[0].map((g) => g.exclude)).toEqual([[], [], [], [], []])
  })
})

describe('AC-2706.4 저장에 제외할 처방', () => {
  it('AC-2706.4 [저장]은 묶음의 제외할 처방을 forSave 값(늘 배열)으로 보내고, 돌려받은 줄의 제외할 처방이 묶음에 남는다', async () => {
    stored = copy(SAVED)
    const view = await ready(draw(DAYS))
    const edited: StatsRxGroup[] = [{ ...SAVED[0], exclude: ['ESWT7'] }, SAVED[1]]
    let ok: boolean | null = null
    await act(async () => {
      ok = await view.result.current.save(edited)
    })
    expect(ok).toBe(true)
    expect(saves).toEqual([[{ ...SAVED[0], exclude: ['ESWT7'] }, noExclude(SAVED[1])]])
    expect(view.result.current.groups.map((g) => g.exclude)).toEqual([['ESWT7'], []])
  })

  it('AC-2706.4 서버에서 읽은 줄의 제외할 처방은 묶음에 그대로 남고, forLoad는 그 줄로 만든 groupDefs를 넘긴다', async () => {
    stored = [{ ...SAVED[0], exclude: ['ESWT7'] }, { ...SAVED[1], exclude: [] }]
    const view = await ready(draw(DAYS))
    const defs = await forLoadNow(view)
    expect(defs).toEqual(groupDefs(stored))
    expect(view.result.current.groups).toEqual(stored)
    expect(saveStatsRxGroups).not.toHaveBeenCalled()
  })
})

describe('AC-1213.1 브라우저 저장소 없음', () => {
  it('AC-1213.1 훅 소스는 브라우저 저장소·document.cookie·console·lib/bridge/client를 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/stats/useStatsRxGroups.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console', 'lib/bridge/client', 'history.', 'location.', 'fetch(']) {
      expect(text, word).not.toContain(word)
    }
  })

  it('AC-1213.1 묶음을 읽고 저장해도 브라우저 저장소에 아무것도 넣지 않는다', async () => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    const view = await ready(draw(DAYS))
    await forLoadNow(view)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
