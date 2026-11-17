// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBridge } from '@/components/claim/useBridge'
import { BridgeError } from '@/lib/bridge/protocol'
import { listAppts, setApptAuto } from '@/lib/storage/calendar'
import type { BridgeState } from '@/types/bridge'
import type { ApptAuto, CalAppt } from '@/types/calendar'
import type { CalendarWorkerMessage } from '@/workers/calendar/messages'
import { DAYS_POLL_MS, daysRange, findQuery, useCalendarWorker, type CalendarWorkerHandle } from './useCalendarWorker'

// 예약 탭 비트 흐름(spec clinic-calendar AC-5905.6·AC-5905.7·AC-5905.8, design.md '흐름'·'다시 읽기').
// 통로(useBridge)·Worker·저장 함수·시계는 흉내 낸다. 화면은 스트림을 열어 {id}·오류 번호만 Worker에 넘기고,
// 찾은 사람·도착 auto·비트 예약 칸·오류 번호만 받는다. 받은 auto는 setApptAuto로 서버에 적는다

vi.mock('@/components/claim/useBridge', () => ({ useBridge: vi.fn() }))
const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/calendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/calendar')>()),
  listAppts: vi.fn(),
  setApptAuto: vi.fn(),
}))

class FakeWorker implements CalendarWorkerHandle {
  posted: unknown[] = []
  private listeners = new Map<string, Set<(event: Event) => void>>()
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener)
  }
  async reply(message: CalendarWorkerMessage) {
    await act(async () => {
      for (const listener of [...(this.listeners.get('message') ?? [])]) listener(new MessageEvent('message', { data: message }))
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

const stream = vi.fn()
function link(state: BridgeState, helperVersion?: string) {
  vi.mocked(useBridge).mockReturnValue({
    state,
    hello: helperVersion ? ({ state, helperVersion } as never) : null,
    helloError: null,
    helperUpdateAvailable: false,
    call: vi.fn(),
    stream,
    onProgress: vi.fn(),
    close: vi.fn(),
    retry: vi.fn(),
  } as never)
}

const appt = (id: string, over: Partial<CalAppt> = {}): CalAppt => ({
  id,
  day: '2026-11-17',
  start: 570,
  len: 30,
  name: '김○○',
  chart: '10231',
  staffId: 'ga',
  staffName: '한○○',
  staffMark: '가',
  kindId: 'dosu',
  kindName: '도수',
  memo: '허리',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
  ...over,
})
const APPTS = [appt('a1'), appt('a2', { day: '2026-11-18', chart: null, name: '신○○' })]
const GHOST = { key: 'bit-202611181030-0', day: '2026-11-18', start: 630, chart: '25190', name: '오○○' }

type Opts = Parameters<typeof useCalendarWorker>[1]
const WEEK: Opts = { view: 'week', from: '2026-11-16', to: '2026-11-22', appts: APPTS, onAuto: vi.fn() }

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function setup(opts: Partial<Opts> = {}) {
  const worker = new FakeWorker()
  const onAuto = vi.fn()
  const hook = renderHook((o: Opts) => useCalendarWorker(worker, o), { initialProps: { ...WEEK, onAuto, ...opts } })
  return { worker, hook, onAuto }
}

const daysPosts = (worker: FakeWorker) => worker.posted.filter((m) => (m as { type: string }).type === 'days')
const streamsOf = (kind: string) => stream.mock.calls.filter(([, args]) => (args as { kind: string }).kind === kind)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T01:40:00Z')) // 한국 11/17 (화) 10:40
  stream.mockReset()
  let n = 0
  stream.mockImplementation(async () => ({ id: `s${++n}`, count: 1 }))
  vi.mocked(listAppts).mockReset().mockResolvedValue([appt('m1', { day: '2026-11-05' })])
  vi.mocked(setApptAuto).mockReset().mockResolvedValue(undefined)
  link('ready', '0.10.0')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-5905.8 비트 PC 판정', () => {
  it.each([
    ['ready', '0.10.0', true],
    ['ready', '0.11.2', true],
    ['ready', '0.9.1', false],
    ['ready', undefined, false],
    ['no-extension', undefined, false],
    ['connecting', '0.10.0', false],
    ['update-helper', '0.10.0', false],
  ] as const)('AC-5905.8: 통로 %s · 도우미 %s → 비트 PC %s (CAL_HELPER 0.10.0 이상만)', async (state, version, bit) => {
    link(state, version)
    const { hook } = setup()
    await settle()
    expect(hook.result.current.bit).toBe(bit)
  })

  it('AC-5905.8: 비트 PC가 아니면 비트에 아무것도 묻지 않는다(찾기·days 없음, 비트 예약 칸 없음)', async () => {
    link('no-extension')
    const { worker, hook } = setup()
    await settle(DAYS_POLL_MS * 2)
    act(() => hook.result.current.find('10231'))
    await settle()
    expect(stream).not.toHaveBeenCalled()
    expect(worker.posted).toEqual([])
    expect(hook.result.current.ghosts).toEqual([])
  })
})

describe('AC-5905.6 비트 찾기', () => {
  it('AC-5905.6: find(q)는 contact.targets {kind: calfind, from = to = 한국 오늘, q}를 열고 {id}를 find에 실어 보낸다. found가 오면 그 q의 결과다', async () => {
    const { worker, hook } = setup()
    await settle()
    act(() => hook.result.current.find('김○'))
    await settle()
    expect(stream).toHaveBeenCalledWith('contact.targets', { kind: 'calfind', from: '2026-11-17', to: '2026-11-17', q: '김○' })
    const sent = worker.posted.find((m) => (m as { type: string }).type === 'find') as { targets: unknown }
    expect(sent).toEqual({ type: 'find', targets: { id: expect.any(String) } })
    const rows = [{ chart: '10231', name: '김○○', sex: '여' as const, age: 61, last: '2026-11-10' }]
    await worker.reply({ type: 'found', rows, more: false })
    expect(hook.result.current.found).toEqual({ q: '김○', rows, more: false })
  })

  it('AC-5905.6: 스트림이 거절되면 오류 번호를 find에 싣고, Worker 오류는 그 q의 오류 번호다', async () => {
    stream.mockImplementation(async (_cmd: string, args: { kind: string }) => {
      if (args.kind === 'calfind') throw new BridgeError('E-HELPER-BAD-MESSAGE')
      return { id: 'd1', count: 1 }
    })
    const { worker, hook } = setup()
    await settle()
    act(() => hook.result.current.find('10231'))
    await settle()
    expect(worker.posted.at(-1)).toEqual({ type: 'find', targets: { code: 'E-HELPER-BAD-MESSAGE' } })
    await worker.reply({ type: 'error', op: 'find', code: 'E-HELPER-BAD-MESSAGE' })
    expect(hook.result.current.found).toEqual({ q: '10231', code: 'E-HELPER-BAD-MESSAGE' })
  })

  it('AC-5905.6: find(null)은 결과를 지우고, 그 뒤에 온 앞 찾기 답은 버린다', async () => {
    const { worker, hook } = setup()
    await settle()
    act(() => hook.result.current.find('김○'))
    await settle()
    act(() => hook.result.current.find(null))
    await worker.reply({ type: 'found', rows: [], more: false })
    expect(hook.result.current.found).toBeNull()
  })

  it.each([
    ['chart', '10231', '10231'],
    ['chart', ' 10231 ', '10231'],
    ['chart', '12345678901', null],
    ['chart', '', null],
    ['name', '김', null],
    ['name', ' 김○ ', '김○'],
    ['name', '김%', null],
    ['name', '김_', null],
    ['name', '김[', null],
    ['name', '김1', null],
    ['name', '가'.repeat(21), null],
  ] as const)('AC-5905.6: findQuery(%s, "%s") → %s (이름 두 글자 이상·LIKE 글자 없음, 차트번호 숫자 1~10자리)', (field, text, q) => {
    expect(findQuery(field, text)).toBe(q)
  })
})

describe('AC-5905.7 도착 auto·비트 예약 칸', () => {
  it('AC-5905.7: 기간을 그리면 contact.targets {kind: calday, 그 기간}을 열어 days에 그 기간 예약(셈에 쓰는 일곱 칸만)과 now를 싣는다', async () => {
    const { worker } = setup()
    await settle()
    expect(streamsOf('calday')).toEqual([['contact.targets', { kind: 'calday', from: '2026-11-16', to: '2026-11-22' }]])
    const [sent] = daysPosts(worker) as { now: number; appts: object[]; targets: unknown }[]
    expect(sent.now).toBe(Date.parse('2026-11-17T01:40:00Z'))
    expect(sent.targets).toEqual({ id: expect.any(String) })
    expect(sent.appts).toEqual([
      { id: 'a1', day: '2026-11-17', start: 570, len: 30, chart: '10231', status: 'auto', auto: null },
      { id: 'a2', day: '2026-11-18', start: 570, len: 30, chart: null, status: 'auto', auto: null },
    ])
    expect(JSON.stringify(sent)).not.toMatch(/김○○|허리|한○○/)
  })

  it('AC-5905.7: 받은 auto는 하나씩 setApptAuto(id, auto)로 서버에 적고, 적힌 것만 onAuto로 알린다. 비트 예약 칸은 ghosts다', async () => {
    vi.mocked(setApptAuto).mockImplementation(async (_c, id) => {
      if (id === 'bad') throw new Error('failed')
    })
    const { worker, hook, onAuto } = setup()
    await settle()
    const auto: [string, ApptAuto][] = [
      ['a1', 'came'],
      ['bad', 'noshow'],
    ]
    await worker.reply({ type: 'days', from: '2026-11-16', to: '2026-11-22', auto, ghosts: [GHOST] })
    expect(setApptAuto).toHaveBeenCalledWith(CLIENT, 'a1', 'came')
    expect(setApptAuto).toHaveBeenCalledWith(CLIENT, 'bad', 'noshow')
    expect(onAuto).toHaveBeenCalledWith([['a1', 'came']])
    expect(hook.result.current.ghosts).toEqual([GHOST])
  })

  it('AC-5905.7: 오늘이 든 기간을 보는 동안 60초마다 다시 부른다', async () => {
    const { worker } = setup()
    await settle()
    expect(daysPosts(worker)).toHaveLength(1)
    await settle(DAYS_POLL_MS)
    expect(daysPosts(worker)).toHaveLength(2)
    await settle(DAYS_POLL_MS)
    expect(daysPosts(worker)).toHaveLength(3)
  })

  it('AC-5905.7: 오늘이 없는 기간은 그릴 때 한 번만 부르고, 기간을 바꾸면 새 기간으로 다시 부른다. 앞 기간의 비트 예약 칸은 보이지 않는다', async () => {
    const { worker, hook, onAuto } = setup({ from: '2026-11-23', to: '2026-11-29' })
    await settle()
    await worker.reply({ type: 'days', from: '2026-11-23', to: '2026-11-29', auto: [], ghosts: [{ ...GHOST, day: '2026-11-24' }] })
    await settle(DAYS_POLL_MS * 2)
    expect(daysPosts(worker)).toHaveLength(1)
    expect(hook.result.current.ghosts).toHaveLength(1)
    hook.rerender({ ...WEEK, onAuto })
    await settle()
    expect(hook.result.current.ghosts).toEqual([])
    expect(streamsOf('calday').at(-1)).toEqual(['contact.targets', { kind: 'calday', from: '2026-11-16', to: '2026-11-22' }])
    expect(daysPosts(worker)).toHaveLength(2)
  })

  it('AC-5905.7: 예약을 아직 못 읽었으면(appts null) 기다렸다가 읽은 뒤에 부른다', async () => {
    const { worker, hook, onAuto } = setup({ appts: null })
    await settle()
    expect(daysPosts(worker)).toHaveLength(0)
    hook.rerender({ ...WEEK, onAuto })
    await settle()
    expect(daysPosts(worker)).toHaveLength(1)
  })

  it('AC-5905.7: 월 보기는 그 달 중 오늘까지(calday 범위 안)를 묻고, 도착 셈에 쓸 예약은 listAppts로 그 기간만 읽는다', async () => {
    const { worker } = setup({ view: 'month', from: '2026-10-26', to: '2026-12-06', appts: null })
    await settle()
    expect(listAppts).toHaveBeenCalledWith(CLIENT, '2026-10-26', '2026-11-17')
    expect(streamsOf('calday')).toEqual([['contact.targets', { kind: 'calday', from: '2026-10-26', to: '2026-11-17' }]])
    const [sent] = daysPosts(worker) as { appts: { id: string }[] }[]
    expect(sent.appts.map((a) => a.id)).toEqual(['m1'])
  })

  it.each([
    ['week', '2026-11-16', '2026-11-22', { from: '2026-11-16', to: '2026-11-22' }],
    ['day', '2026-11-20', '2026-11-20', { from: '2026-11-20', to: '2026-11-20' }],
    ['week', '2026-09-07', '2026-09-13', null], // 모두 오늘−62일보다 앞
    ['week', '2026-09-14', '2026-09-20', { from: '2026-09-16', to: '2026-09-20' }], // 오늘−62일 = 9/16
    ['week', '2027-02-15', '2027-02-21', { from: '2027-02-15', to: '2027-02-17' }], // 오늘+92일 = 2/17
    ['week', '2027-02-22', '2027-02-28', null],
    ['month', '2026-10-26', '2026-12-06', { from: '2026-10-26', to: '2026-11-17' }], // 월은 오늘까지
    ['month', '2026-11-30', '2027-01-03', null],
  ] as const)('AC-5905.7: daysRange(%s, %s~%s, 오늘 11/17) → %j (calday 범위: 오늘−62일 ~ 오늘+92일, 42일까지)', (view, from, to, range) => {
    expect(daysRange(view, from, to, '2026-11-17')).toEqual(range)
  })

  it('AC-5905.7: daysRange는 42일을 넘으면 42일로 자른다', () => {
    expect(daysRange('month', '2026-09-28', '2026-11-08', '2026-11-30')).toEqual({ from: '2026-09-29', to: '2026-11-08' })
    const r = daysRange('week', '2026-11-01', '2026-12-31', '2026-11-17')!
    expect(r.from).toBe('2026-11-01')
    expect(r.to).toBe('2026-12-12')
  })

  it('AC-5904.3: Worker 오류(days)는 오류 번호뿐이고 서버에 아무것도 적지 않는다', async () => {
    const { worker, onAuto } = setup()
    await settle()
    await worker.reply({ type: 'error', op: 'days', code: 'E-BRIDGE-BAD-REPLY' })
    expect(setApptAuto).not.toHaveBeenCalled()
    expect(onAuto).not.toHaveBeenCalled()
  })
})
