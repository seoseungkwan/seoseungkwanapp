// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateRxPick } from '@/lib/payload/validate'
import { addRxPick, clearRxPicks, readRxPicks, removeRxPick } from '@/lib/storage/rxPicks'
import type { RxPick } from '@/types/rxPicks'
import { useRxPicks } from './useRxPicks'

// 고른 처방 훅 (rx-picker REQ-812, design.md '훅'). 저장은 가짜다. 처방은 모두 지어낸 값이다.
// 가짜 저장은 메모리의 줄을 실제처럼 바꾼다: 넣기는 대문자로 견줘 겹치면 'already', 검사에 걸리면 진짜처럼 실패, 지우기는 받은 글자 그대로.
// 요청은 sent에 차례대로 적히고, holdNext로 답을 잡아 두거나 failNext로 실패시킨다

vi.mock('@/lib/storage/rxPicks', () => ({
  readRxPicks: vi.fn(),
  addRxPick: vi.fn(),
  removeRxPick: vi.fn(),
  clearRxPicks: vi.fn(),
}))

const A: RxPick = { code: 'A100', name: '가짜처방 가' }
const B: RxPick = { code: 'B200', name: '가짜처방 나' }
const C: RxPick = { code: 'C300', name: '가짜처방 다' }
const LOWER: RxPick = { code: 'abc', name: '가짜처방 소문자' }
const UPPER: RxPick = { code: 'ABC', name: '가짜처방 대문자' }

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

let stored: RxPick[]
let sent: string[]
let gates: Map<string, Gate>
let failing: Map<string, number>

async function request<T>(label: string, work: () => T): Promise<T> {
  sent.push(label)
  const gate = gates.get(label)
  if (gate) {
    gates.delete(label)
    await gate.wait
  }
  const left = failing.get(label) ?? 0
  if (left > 0) {
    failing.set(label, left - 1)
    throw new Error('가짜 실패')
  }
  return work()
}

const holdNext = (label: string) => {
  const gate = makeGate()
  gates.set(label, gate)
  return gate
}
const failNext = (label: string, times = 1) => failing.set(label, times)

const settle = () => act(async () => void (await new Promise((done) => setTimeout(done))))
const release = async (gate: Gate) => {
  gate.open()
  await settle()
}

const draw = () => renderHook(() => useRxPicks())
type View = ReturnType<typeof draw>

const ready = async (view: View = draw()) => {
  await waitFor(() => expect(view.result.current.state).toBe('ready'))
  sent.length = 0
  return view
}
const codes = (view: View) => view.result.current.picks.map((pick) => pick.code)
const toggle = (view: View, line: RxPick) => act(() => view.result.current.toggle(line))
const remove = (view: View, code: string) => act(() => view.result.current.remove(code))
const clear = (view: View) => act(() => view.result.current.clear())
const retry = (view: View) => act(() => view.result.current.retrySave())

beforeEach(() => {
  stored = []
  sent = []
  gates = new Map()
  failing = new Map()
  vi.mocked(readRxPicks).mockReset().mockImplementation(() => request('read', () => stored.map((row) => ({ ...row }))))
  vi.mocked(addRxPick)
    .mockReset()
    .mockImplementation((pick) =>
      request(`add ${pick.code}`, () => {
        if (validateRxPick(pick) === null) throw new Error('검사에 걸림') // 진짜 addRxPick도 이때 저장 실패로 던진다
        if (stored.some((row) => row.code.toUpperCase() === pick.code.toUpperCase())) return 'already' as const
        stored.push(pick)
        return 'added' as const
      }),
    )
  vi.mocked(removeRxPick)
    .mockReset()
    .mockImplementation((code) =>
      request(`remove ${code}`, () => {
        stored = stored.filter((row) => row.code !== code)
      }),
    )
  vi.mocked(clearRxPicks)
    .mockReset()
    .mockImplementation(() =>
      request('clear', () => {
        stored = []
      }),
    )
})

afterEach(cleanup)

describe('AC-812.1 읽는 상태', () => {
  it('AC-812.1 처음에는 reading이고 읽기가 끝나면 ready다', async () => {
    stored = [A]
    const gate = holdNext('read')
    const view = draw()
    expect(view.result.current.state).toBe('reading')
    expect(view.result.current.picks).toEqual([])
    await settle()
    expect(view.result.current.state).toBe('reading')

    await release(gate)
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.picks).toEqual([A])
  })

  it('AC-812.1 읽는 동안 고르기·빼기·모두 지우기는 화면도 서버도 바꾸지 않는다', async () => {
    stored = [A]
    const gate = holdNext('read')
    const view = draw()

    toggle(view, B)
    remove(view, 'A100')
    clear(view)
    await settle()
    expect(view.result.current.picks).toEqual([])
    expect(sent).toEqual(['read'])

    await release(gate)
    expect(view.result.current.picks).toEqual([A])
    expect(sent).toEqual(['read'])
    expect(stored).toEqual([A])
  })
})

describe('AC-812.2 저장된 차례', () => {
  it('AC-812.2 읽기가 끝나면 저장된 차례 그대로다', async () => {
    stored = [C, A, B]
    const view = await ready()
    expect(codes(view)).toEqual(['C300', 'A100', 'B200'])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.2 고르고 내렸다가 같은 저장으로 다시 그리면 같은 처방이 같은 차례로 나온다', async () => {
    const first = await ready()
    toggle(first, C)
    toggle(first, A)
    toggle(first, B)
    await settle()
    first.unmount()

    const second = await ready()
    expect(second.result.current.picks).toEqual([C, A, B])
  })
})

describe('AC-812.3 읽기 실패', () => {
  it('AC-812.3 읽기에 실패하면 read-failed이고 "없음"으로 보이지 않으며 고르기도 막힌다', async () => {
    failNext('read')
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))
    expect(view.result.current.saveFailed).toBe(false)

    sent.length = 0
    toggle(view, A)
    await settle()
    expect(view.result.current.picks).toEqual([])
    expect(sent).toEqual([])
    expect(stored).toEqual([])
  })

  it('AC-812.3 [다시 읽기]는 읽는 중을 거쳐 저장된 줄을 보인다', async () => {
    stored = [B, A]
    failNext('read')
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))

    const gate = holdNext('read')
    act(() => view.result.current.reread())
    expect(view.result.current.state).toBe('reading')

    await settle()
    await release(gate)
    expect(view.result.current.state).toBe('ready')
    expect(codes(view)).toEqual(['B200', 'A100'])

    toggle(view, C)
    await settle()
    expect(stored).toEqual([B, A, C])
  })

  it('AC-812.3 다시 읽어도 실패하면 read-failed로 돌아온다', async () => {
    failNext('read', 2)
    const view = draw()
    await waitFor(() => expect(view.result.current.state).toBe('read-failed'))

    act(() => view.result.current.reread())
    expect(view.result.current.state).toBe('reading')
    await settle()
    expect(view.result.current.state).toBe('read-failed')
  })

  it('AC-812.3 이미 읽었으면 reread는 다시 읽지 않고 화면을 지우지 않는다', async () => {
    stored = [A]
    const view = await ready()
    act(() => view.result.current.reread())
    await settle()
    expect(sent).toEqual([])
    expect(view.result.current.state).toBe('ready')
    expect(view.result.current.picks).toEqual([A])
  })
})

describe('AC-812.4 누른 차례대로 하나씩', () => {
  it('AC-812.4 답을 잡아 둔 채 셋을 고르면 화면은 먼저 바뀌고 첫 요청만 나가 있다. 답이 오면 다음이 나간다', async () => {
    const view = await ready()
    const [first, second] = [holdNext('add A100'), holdNext('add B200')]

    toggle(view, A)
    toggle(view, B)
    toggle(view, C)
    expect(codes(view)).toEqual(['A100', 'B200', 'C300'])
    await settle()
    expect(sent).toEqual(['add A100'])

    await release(first)
    expect(sent).toEqual(['add A100', 'add B200'])

    await release(second)
    expect(sent).toEqual(['add A100', 'add B200', 'add C300'])
    expect(stored).toEqual([A, B, C])
    expect(codes(view)).toEqual(['A100', 'B200', 'C300'])
  })

  it('AC-812.4 고르기·빼기·모두 지우기가 섞여도 누른 차례 그대로 나간다', async () => {
    stored = [C]
    const view = await ready()
    const first = holdNext('add A100')

    toggle(view, A)
    toggle(view, B)
    remove(view, 'A100')
    expect(codes(view)).toEqual(['C300', 'B200'])
    clear(view)
    expect(codes(view)).toEqual([])
    toggle(view, C)
    expect(codes(view)).toEqual(['C300'])
    await settle()
    expect(sent).toEqual(['add A100'])

    await release(first)
    expect(sent).toEqual(['add A100', 'add B200', 'remove A100', 'clear', 'add C300'])
    expect(stored).toEqual([C])
  })

  it('AC-812.4 한 틱에 두 번 눌러도 뒤의 누름이 앞의 누름을 본다', async () => {
    const view = await ready()
    act(() => {
      view.result.current.toggle(A)
      view.result.current.toggle(A)
    })
    expect(codes(view)).toEqual([])
    await settle()
    expect(sent).toEqual(['add A100', 'remove A100'])
    expect(stored).toEqual([])
  })

  it('AC-812.4 화면에 없는 줄의 빼기와 빈 목록의 모두 지우기는 요청을 만들지 않는다', async () => {
    const view = await ready()
    remove(view, 'A100')
    clear(view)
    await settle()
    expect(sent).toEqual([])
  })

  it('AC-802.8 고르는 개수에 한도가 없다: 250개를 차례대로 저장한다', async () => {
    const lines = Array.from({ length: 250 }, (_, at) => ({ code: `X${at}`, name: `가짜처방 ${at}` }))
    const view = await ready()
    act(() => {
      for (const line of lines) view.result.current.toggle(line)
    })
    expect(view.result.current.picks).toHaveLength(250)
    await settle()
    expect(stored).toEqual(lines)
    expect(view.result.current.saveFailed).toBe(false)
  })
})

describe('AC-812.5 저장 실패', () => {
  it('AC-812.5 실패하면 화면은 그대로이고 saveFailed이며 뒤 요청은 나가지 않는다', async () => {
    const view = await ready()
    failNext('add A100')

    toggle(view, A)
    toggle(view, B)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)
    expect(codes(view)).toEqual(['A100', 'B200'])
    expect(sent).toEqual(['add A100'])
    expect(stored).toEqual([])
  })

  it('AC-812.5 [다시 저장]은 멈춘 요청부터 차례대로 보내고 모두 성공하면 saveFailed가 꺼진다', async () => {
    const view = await ready()
    failNext('add A100')
    toggle(view, A)
    toggle(view, B)
    await settle()

    retry(view)
    await settle()
    expect(sent).toEqual(['add A100', 'add A100', 'add B200'])
    expect(view.result.current.saveFailed).toBe(false)
    expect(stored).toEqual([A, B])
  })

  it('AC-812.5 다시 보내는 동안에는 카드가 남고 모두 끝나야 꺼진다', async () => {
    const view = await ready()
    failNext('add A100')
    toggle(view, A)
    await settle()

    const gate = holdNext('add A100')
    retry(view)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)

    await release(gate)
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 다시 보내도 실패하면 그 자리에서 또 멈춘다', async () => {
    const view = await ready()
    failNext('add A100', 2)
    toggle(view, A)
    toggle(view, B)
    await settle()

    retry(view)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)
    expect(sent).toEqual(['add A100', 'add A100'])

    retry(view)
    await settle()
    expect(view.result.current.saveFailed).toBe(false)
    expect(stored).toEqual([A, B])
  })

  it('AC-812.5 다음 고르기도 멈춘 요청부터 잇는다', async () => {
    const view = await ready()
    failNext('add A100')
    toggle(view, A)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)

    toggle(view, B)
    expect(codes(view)).toEqual(['A100', 'B200'])
    await settle()
    expect(sent).toEqual(['add A100', 'add A100', 'add B200'])
    expect(stored).toEqual([A, B])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 다음 빼기와 모두 지우기도 멈춘 요청부터 잇는다', async () => {
    stored = [C]
    const view = await ready()
    failNext('remove C300')
    remove(view, 'C300')
    await settle()
    expect(view.result.current.saveFailed).toBe(true)

    toggle(view, A)
    clear(view)
    await settle()
    expect(sent).toEqual(['remove C300', 'remove C300', 'add A100', 'clear'])
    expect(stored).toEqual([])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 요청이 나가 있는 동안 [다시 저장]을 눌러도 두 번 보내지 않는다', async () => {
    const view = await ready()
    const gate = holdNext('add A100')
    toggle(view, A)
    await settle()

    retry(view)
    await settle()
    expect(sent).toEqual(['add A100'])

    await release(gate)
    expect(sent).toEqual(['add A100'])
    expect(stored).toEqual([A])
  })

  it('AC-812.5 보낼 것이 없을 때 [다시 저장]은 아무 요청도 만들지 않는다', async () => {
    const view = await ready()
    retry(view)
    await settle()
    expect(sent).toEqual([])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 StrictMode로 두 번 그려도 저장 실패를 알린다', async () => {
    const view = renderHook(() => useRxPicks(), { wrapper: StrictMode })
    await ready(view)
    failNext('add A100')
    toggle(view, A)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)

    retry(view)
    await settle()
    expect(view.result.current.saveFailed).toBe(false)
    expect(view.result.current.picks).toEqual([A])
  })
})

describe('AC-812.5 저장 줄에는 검사를 지난 줄만 들어간다', () => {
  const BAD: Array<[string, RxPick]> = [
    ['코드가 빈 글자', { code: '', name: '가짜처방' }],
    ['코드에 줄바꿈', { code: 'A\n100', name: '가짜처방' }],
    ['코드에 전화 모양', { code: '010-0000-0000', name: '가짜처방' }],
    ['코드가 101자', { code: 'X'.repeat(101), name: '가짜처방' }],
    ['이름에 제어 문자', { code: 'A100', name: '가짜\u0007처방' }],
    ['이름이 101자', { code: 'A100', name: '가'.repeat(101) }],
  ]

  it.each(BAD)('AC-812.5 %s인 줄은 화면에도 줄에도 들어가지 않고 다음 고르기를 막지 않는다', async (_why, line) => {
    expect(validateRxPick(line)).toBeNull() // 이 줄이 실제로 검사에 걸리는지부터 본다
    const view = await ready()

    toggle(view, line)
    expect(view.result.current.picks).toEqual([])
    await settle()
    expect(sent).toEqual([])
    expect(addRxPick).not.toHaveBeenCalled()
    expect(view.result.current.saveFailed).toBe(false)

    toggle(view, B)
    await settle()
    expect(sent).toEqual(['add B200'])
    expect(stored).toEqual([B])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 다른 열쇠가 더 붙은 줄도 코드·이름만 검사해 코드·이름만 보낸다', async () => {
    const view = await ready()
    const withCount = { ...A, patients: 3 } as RxPick

    toggle(view, withCount)
    await settle()
    expect(vi.mocked(addRxPick).mock.calls[0][0]).toEqual(A)
    expect(view.result.current.picks).toEqual([A])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 화면의 줄을 고쳐도 줄 선 요청의 값이 바뀌지 않는다', async () => {
    const view = await ready()
    const gate = holdNext('add A100')
    const line = { ...B }

    toggle(view, A)
    toggle(view, line)
    line.code = 'A\n100' // 나중에 검사에 걸리는 값으로 바뀌어도 줄에는 검사한 복사본이 있다
    await release(gate)
    expect(sent).toEqual(['add A100', 'add B200'])
    expect(stored).toEqual([A, B])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.5 화면에 있는 줄을 뺄 때는 검사와 상관없이 뺀다', async () => {
    stored = [A]
    const view = await ready()
    toggle(view, { code: 'a100', name: 'X'.repeat(101) })
    await settle()
    expect(sent).toEqual(['remove A100'])
    expect(view.result.current.picks).toEqual([])
  })
})

describe('AC-812.7 대소문자와 저장된 글자', () => {
  it('AC-812.7 저장 abc에 toggle ABC면 addRxPick 없이 removeRxPick(abc)다', async () => {
    stored = [LOWER]
    const view = await ready()
    toggle(view, UPPER)
    expect(view.result.current.picks).toEqual([])
    await settle()
    expect(addRxPick).not.toHaveBeenCalled()
    expect(removeRxPick).toHaveBeenCalledExactlyOnceWith('abc')
    expect(stored).toEqual([])
  })

  it('AC-812.7 remove도 대문자로 찾아 저장된 글자로 지운다', async () => {
    stored = [LOWER]
    const view = await ready()
    remove(view, 'ABC')
    expect(view.result.current.picks).toEqual([])
    await settle()
    expect(removeRxPick).toHaveBeenCalledExactlyOnceWith('abc')
  })

  it('AC-812.7 다른 기기가 고른 abc를 모르고 ABC를 고르면(already) 되읽어 표는 한 줄이고 다음 빼기가 removeRxPick(abc)다', async () => {
    const view = await ready()
    stored.push(LOWER) // 다른 기기

    toggle(view, UPPER)
    expect(codes(view)).toEqual(['ABC'])
    await settle()
    expect(sent).toEqual(['add ABC', 'read'])
    expect(view.result.current.picks).toEqual([LOWER])
    expect(view.result.current.saveFailed).toBe(false)

    toggle(view, UPPER)
    await settle()
    expect(sent).toEqual(['add ABC', 'read', 'remove abc'])
    expect(stored).toEqual([])
    expect(view.result.current.picks).toEqual([])
  })

  it('AC-812.7 되읽기는 그 고르기의 요청 칸 안에서 끝난다: 되읽기 전에 빼기를 눌러도 끝난 뒤 removeRxPick(abc)가 나간다', async () => {
    const view = await ready()
    stored.push(LOWER)
    const gate = holdNext('read')

    toggle(view, UPPER)
    await settle()
    expect(sent).toEqual(['add ABC', 'read'])

    toggle(view, UPPER)
    expect(view.result.current.picks).toEqual([])
    await settle()
    expect(sent).toEqual(['add ABC', 'read']) // 빼기는 되읽기를 기다린다

    await release(gate)
    expect(sent).toEqual(['add ABC', 'read', 'remove abc'])
    expect(stored).toEqual([])
    expect(view.result.current.picks).toEqual([]) // 이미 뺀 줄을 되읽기가 되살리지 않는다
  })

  it('AC-812.7 되읽기가 끝나기 전 다른 줄을 고른 것도 되읽기 뒤에 나간다', async () => {
    const view = await ready()
    stored.push(LOWER)
    const gate = holdNext('read')

    toggle(view, UPPER)
    await settle()
    toggle(view, B)
    await settle()
    expect(sent).toEqual(['add ABC', 'read'])

    await release(gate)
    expect(sent).toEqual(['add ABC', 'read', 'add B200'])
    expect(view.result.current.picks).toEqual([LOWER, B])
  })

  it('AC-812.7 되읽기가 실패하면 빼기가 나가지 않고 저장 실패로 멈춘다. [다시 저장]이 고르기부터 다시 가서 removeRxPick(abc)로 끝난다', async () => {
    const view = await ready()
    stored.push(LOWER)
    failNext('read')

    toggle(view, UPPER)
    toggle(view, UPPER)
    await settle()
    expect(sent).toEqual(['add ABC', 'read'])
    expect(removeRxPick).not.toHaveBeenCalled()
    expect(view.result.current.saveFailed).toBe(true)

    retry(view)
    await settle()
    expect(sent).toEqual(['add ABC', 'read', 'add ABC', 'read', 'remove abc'])
    expect(view.result.current.saveFailed).toBe(false)
    expect(stored).toEqual([])
  })

  it('AC-812.7 되읽기가 실패하면 화면의 줄은 그대로이고, 다시 가서 성공하면 저장 글자로 바뀐다', async () => {
    const view = await ready()
    stored.push(LOWER)
    failNext('read')

    toggle(view, UPPER)
    await settle()
    expect(view.result.current.picks).toEqual([UPPER])
    expect(view.result.current.saveFailed).toBe(true)

    retry(view)
    await settle()
    expect(view.result.current.picks).toEqual([LOWER])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.7 되읽기에 그 줄이 없어도(그새 다른 기기가 지움) 줄을 멈추지 않고, 빼기는 보낸 글자로 간다', async () => {
    const view = await ready()
    vi.mocked(addRxPick).mockImplementationOnce((pick) => request(`add ${pick.code}`, () => 'already' as const))

    toggle(view, UPPER)
    toggle(view, B)
    await settle()
    expect(sent).toEqual(['add ABC', 'read', 'add B200'])
    expect(view.result.current.saveFailed).toBe(false)
    expect(view.result.current.picks).toEqual([UPPER, B])

    toggle(view, UPPER)
    await settle()
    expect(sent).toEqual(['add ABC', 'read', 'add B200', 'remove ABC'])
    expect(view.result.current.saveFailed).toBe(false)
  })

  it('AC-812.7 뺐다가 다른 글자로 다시 고르면 다음 빼기는 새로 저장한 글자로 간다', async () => {
    stored = [LOWER]
    const view = await ready()

    toggle(view, LOWER)
    toggle(view, UPPER)
    await settle()
    expect(stored).toEqual([UPPER])
    expect(view.result.current.picks).toEqual([UPPER])

    toggle(view, LOWER)
    await settle()
    expect(sent).toEqual(['remove abc', 'add ABC', 'remove ABC'])
    expect(stored).toEqual([])
  })

  it('AC-812.7 방금 고른 줄을 바로 빼면 보낸 글자 그대로 지운다', async () => {
    const view = await ready()
    toggle(view, UPPER)
    toggle(view, LOWER)
    await settle()
    expect(sent).toEqual(['add ABC', 'remove ABC'])
    expect(stored).toEqual([])
  })

  it('AC-812.7 모두 지운 뒤 다시 고른 줄은 그 뒤에 저장한 글자로 지운다', async () => {
    stored = [LOWER]
    const view = await ready()
    clear(view)
    toggle(view, UPPER)
    await settle()
    toggle(view, UPPER)
    await settle()
    expect(sent).toEqual(['clear', 'add ABC', 'remove ABC'])
    expect(stored).toEqual([])
  })
})

describe('AC-812.8 내려간 뒤', () => {
  const unhandled = vi.fn()
  beforeEach(() => {
    unhandled.mockReset()
    process.on('unhandledRejection', unhandled)
  })
  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  it('AC-812.8 남은 요청을 차례대로 끝까지 보내고 상태는 건드리지 않는다', async () => {
    const view = await ready()
    const gate = holdNext('add A100')
    toggle(view, A)
    toggle(view, B)
    remove(view, 'A100')
    await settle()
    const last = view.result.current

    view.unmount()
    expect(sent).toEqual(['add A100'])
    await release(gate)

    expect(sent).toEqual(['add A100', 'add B200', 'remove A100'])
    expect(stored).toEqual([B])
    expect(view.result.current).toBe(last)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-812.8 내려간 뒤 실패하면 거기서 멈춰 조용히 버린다(뒤 요청 없음, 잡히지 않은 오류 없음)', async () => {
    const view = await ready()
    const gate = holdNext('add A100')
    toggle(view, A)
    toggle(view, B)
    await settle()
    const last = view.result.current

    view.unmount()
    gate.fail()
    await settle()

    expect(sent).toEqual(['add A100'])
    expect(stored).toEqual([])
    expect(view.result.current).toBe(last)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-812.8 이미 멈춘 줄을 두고 내려가면 더 보내지 않는다', async () => {
    const view = await ready()
    failNext('add A100')
    toggle(view, A)
    toggle(view, B)
    await settle()
    expect(view.result.current.saveFailed).toBe(true)

    view.unmount()
    await settle()
    expect(sent).toEqual(['add A100'])
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-812.8 내려간 뒤에도 already의 되읽기가 뒤 빼기의 저장 글자를 정한다', async () => {
    const view = await ready()
    stored.push(LOWER)
    const gate = holdNext('add ABC')
    toggle(view, UPPER)
    toggle(view, UPPER)
    await settle()

    view.unmount()
    await release(gate)
    expect(sent).toEqual(['add ABC', 'read', 'remove abc'])
    expect(stored).toEqual([])
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-812.8 내려간 뒤 되읽기가 실패해도 빼기를 보내지 않고 조용히 버린다', async () => {
    const view = await ready()
    stored.push(LOWER)
    const gate = holdNext('add ABC')
    failNext('read')
    toggle(view, UPPER)
    toggle(view, UPPER)
    await settle()

    view.unmount()
    await release(gate)
    expect(sent).toEqual(['add ABC', 'read'])
    expect(removeRxPick).not.toHaveBeenCalled()
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-812.8 읽는 중에 내려가면 늦은 답·실패 어느 쪽도 오류를 남기지 않는다', async () => {
    const answered = holdNext('read')
    const first = draw()
    first.unmount()
    await release(answered)

    const failed = holdNext('read')
    const second = draw()
    second.unmount()
    failed.fail()
    await settle()

    expect(unhandled).not.toHaveBeenCalled()
  })
})
