// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeError } from '@/lib/bridge/protocol'
import { errorInfo } from '@/lib/errors'
import type { DayCount as BridgeDay } from '@/types/bridge'
import type { ClaimView, InputResultView, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import { claimChannel, type ClaimChannel } from './claimLoad'
import { ClaimScreen } from './ClaimScreen'
import { useCountsUpload } from './useCountsUpload'

// 건수 올리기(AC-019.3·AC-019.4): 불러오기 앞에 물은 진료 수를 받을 때 붙인다 · 바뀐 날짜 줄만 · 실패하면 메모리에 두고 다음에 바뀔 때·창 초점이 올 때 다시 · E-COUNTS-FAILED 작은 줄.
// 청구 화면의 claim.dates 다시 묻기(AC-013.1)도 여기서 본다. Worker가 언제 보내는지는 jobs.test.ts, 묻는 차례는 claimLoad.test.ts·ClaimScreen.test.tsx가 본다.
// 실제 DB에 붙지 않는다

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null; status?: number } | 'throw'

const db = vi.hoisted(() => ({
  upserts: [] as { table: string; rows: unknown[]; options: unknown }[],
  /** 올리기 답 차례. 비면 성공 */
  replies: [] as unknown[],
  /** 올리기 답을 기다리게 한다 */
  gate: null as Promise<void> | null,
  counts: [] as unknown[],
  countsReads: 0,
  countsFail: false,
  /** 있으면 그때 시작한 건수 읽기가 이것을 기다린다 */
  countsGate: null as Promise<void> | null,
  /** 도우미 claim.dates */
  days: [] as unknown[],
  datesCalls: [] as unknown[],
  datesFail: false,
  datesGate: null as Promise<void> | null,
  /** 자료 불러오기를 멈춰 둔다 */
  streamGate: null as Promise<void> | null,
}))

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'user-1' } } }, error: null }) },
    from(table: string) {
      return {
        upsert(rows: unknown[], options: unknown) {
          db.upserts.push({ table, rows, options })
          const reply = (db.replies.shift() ?? {}) as Reply
          const answer = () => {
            if (reply === 'throw') return Promise.reject(new Error('relation secret'))
            return Promise.resolve({ data: null, error: reply.error ?? null, status: reply.status ?? 201 })
          }
          return { then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => (db.gate ? db.gate.then(answer) : answer()).then(ok, no) }
        },
        select() {
          if (table === 'claim_day_counts') db.countsReads += 1
          const counts = db.counts
          const failing = db.countsFail
          const gate = table === 'claim_day_counts' ? db.countsGate : null
          const read = () => {
            if (table === 'claim_day_counts') {
              const reply = failing ? { data: null, error: { code: '500' }, status: 500 } : { data: counts, error: null, status: 200 }
              return gate ? gate.then(() => reply) : Promise.resolve(reply)
            }
            return Promise.resolve(table === 'claim_rule_settings' ? { data: [], error: null } : { data: null, error: null })
          }
          const query = {
            gte: () => query,
            lte: () => query,
            maybeSingle: read,
            then: (ok: (value: unknown) => unknown, no: (reason: unknown) => unknown) => read().then(ok, no),
          }
          return query
        },
      }
    },
  }),
}))

// 메모 칸은 TASK-18이 본다. 여기서는 단계만 알린다
const memoStage = vi.hoisted(() => ({ stage: 'pick' as string }))
vi.mock('./memo/MemoPanel', () => ({
  MemoPanel: ({ onStage }: { onStage?(stage: string): void }) => {
    useEffect(() => {
      onStage?.(memoStage.stage)
    }, [onStage])
    return createElement('div', null, '메모 칸 자리')
  },
}))

type Listener = (event: Event) => void
function fakeWorker() {
  const listeners = new Set<Listener>()
  const posted: PrecheckFromScreen[] = []
  const emit = (data: unknown) => {
    for (const fn of listeners) fn({ data } as unknown as Event)
  }
  return {
    posted,
    emit,
    listeners,
    postMessage(message: unknown) {
      const m = message as PrecheckFromScreen
      posted.push(m)
      const reply: PrecheckToScreen | null =
        m.type === 'month'
          ? { type: 'month', id: m.id, load: m.load, ok: true, visits: 1, months: ['2026-10'] }
          : m.type === 'loadPart'
            ? { type: 'loadPart', part: m.part, id: m.id, load: m.load, ok: true }
            : m.type === 'check'
              ? { type: 'check', check: m.check, load: m.load, ok: true, view: VIEW, usedCopy: null }
              : null
      if (reply) queueMicrotask(() => emit(reply))
    },
    addEventListener(type: string, fn: Listener) {
      if (type === 'message') listeners.add(fn)
    },
  }
}
type Fake = ReturnType<typeof fakeWorker>

const VIEW: ClaimView = { period: { from: '2026-10-28', to: '2026-10-28' }, hasDx: true, enabledRules: 1, memoBlocked: null, totals: { checked: 0, hi: 0, mid: 0, lo: 0, patients: 0, historySkips: 0 }, groups: [], visits: [] }

/** Worker 줄(다섯 칸) */
const W = (visit_date: string, need_memo: number, entered: number, needs_check = 0, skipped = 0) => ({ visit_date, need_memo, entered, needs_check, skipped })
/** 올리는 줄(여섯 칸). 진료 수는 화면이 붙인다 */
const U = (visit_date: string, need_memo: number, entered: number, needs_check = 0, skipped = 0, visits = 10) => ({ visit_date, visits, need_memo, entered, needs_check, skipped })
const onServer = (visit_date: string, need_memo: number, entered: number, updated_at = `${visit_date}T02:00:00+00:00`, visits = 10) => ({ ...U(visit_date, need_memo, entered, 0, 0, visits), updated_at })
/** 사라진 날을 덮는 줄 */
const ZERO = (visit_date: string) => U(visit_date, 0, 0, 0, 0, 0)

/** 불러오기 앞에 물은 진료 수: 시험에 쓰는 날은 모두 10명 */
const dates = (n: number, from = 19, to = 31) => new Map(Array.from({ length: to - from + 1 }, (_, i) => [`2026-10-${from + i}`, n]))
const ALL_TEN = dates(10)
const rangeOf = (rows: readonly { visit_date: string }[]) => {
  const sorted = rows.map((row) => row.visit_date).sort()
  return { from: sorted[0] ?? '2026-10-28', to: sorted.at(-1) ?? '2026-10-28' }
}
const message = (rows: readonly { visit_date: string }[], over: Record<string, unknown> = {}) => ({ type: 'dayCounts', load: 1, rows, range: rangeOf(rows), ...over })

const settled = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

/** 번호 1로 진료 수를 쥔 훅 */
function mount(worker: Fake = fakeWorker(), held: ReadonlyMap<string, number> | null = ALL_TEN) {
  const hook = renderHook(() => useCountsUpload(worker))
  act(() => hook.result.current.hold(1, held))
  return { worker, ...hook }
}
async function emit(worker: Fake, data: unknown) {
  await act(async () => {
    worker.emit(data)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
const receive = (worker: Fake, ...rows: ReturnType<typeof W>[]) => emit(worker, message(rows))
const focus = () =>
  act(async () => {
    window.dispatchEvent(new Event('focus'))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

beforeEach(() => {
  db.upserts = []
  db.replies = []
  db.gate = null
  db.counts = []
  db.countsReads = 0
  db.countsFail = false
  db.countsGate = null
  db.days = DAYS
  db.datesCalls = []
  db.datesFail = false
  db.datesGate = null
  db.streamGate = null
  memoStage.stage = 'pick'
})
afterEach(cleanup)

describe('AC-019.4 바뀐 날짜 줄만 올린다', () => {
  it('AC-019.4: Worker가 보낸 건수에 진료 수를 붙여 그 표에 upsert한다', async () => {
    const { worker, result } = mount()
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts).toEqual([{ table: 'claim_day_counts', rows: [U('2026-10-28', 7, 2)], options: { onConflict: 'hospital_id,visit_date' } }])
    expect(result.current.failed).toBe(false)
    expect(result.current.lastUploadedAt).not.toBeNull()
    expect(Number.isNaN(Date.parse(result.current.lastUploadedAt!))).toBe(false)
  })

  it('AC-019.4: 같은 건수가 다시 오면 올리지 않고, 바뀐 날짜 줄만 올린다', async () => {
    const { worker } = mount()
    await receive(worker, W('2026-10-28', 7, 2), W('2026-10-29', 3, 0))
    expect(db.upserts).toHaveLength(1)
    await receive(worker, W('2026-10-28', 7, 2), W('2026-10-29', 3, 0))
    expect(db.upserts).toHaveLength(1)
    await receive(worker, W('2026-10-28', 7, 5), W('2026-10-29', 3, 0))
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 5)])
  })

  it.each<[string, ReturnType<typeof W>, ReturnType<typeof U>]>([
    ['입력 수', W('2026-10-28', 7, 3), U('2026-10-28', 7, 3)],
    ['메모 필요 수', W('2026-10-28', 8, 2), U('2026-10-28', 8, 2)],
    ['확인 필요 수', W('2026-10-28', 7, 2, 1), U('2026-10-28', 7, 2, 1)],
    ['건너뜀 수', W('2026-10-28', 7, 2, 0, 1), U('2026-10-28', 7, 2, 0, 1)],
  ])('AC-019.4: %s만 바뀌어도 올린다', async (_name, changed, sent) => {
    const { worker } = mount()
    await receive(worker, W('2026-10-28', 7, 2))
    await receive(worker, changed)
    expect(db.upserts[1].rows).toEqual([sent])
  })

  it('AC-019.4: 진료 수만 달라져도 올린다', async () => {
    const { worker, result } = mount()
    await receive(worker, W('2026-10-28', 7, 2))
    act(() => result.current.hold(2, dates(23)))
    await emit(worker, message([W('2026-10-28', 7, 2)], { load: 2 }))
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 2, 0, 0, 23)])
  })

  it('AC-019.4: 서버에서 읽어 둔 값과 같으면 올리지 않는다: 바뀐 시각이 불러올 때마다 새로 찍히지 않는다', async () => {
    const { worker, result } = mount()
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], result.current.readMark()))
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts).toEqual([])
    expect(result.current.synced).toBe(true)
    await receive(worker, W('2026-10-28', 7, 3))
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 7, 3)])
  })

  it('AC-019.4: 서버 값과 진료 수가 다르면 다섯 칸이 같아도 올린다', async () => {
    const { worker, result } = mount()
    act(() => result.current.remember([onServer('2026-10-28', 7, 2, '2026-10-28T02:00:00+00:00', 9)], result.current.readMark()))
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 7, 2)])
  })

  it('AC-019.4: 서버에서 읽은 가장 늦은 시각을 마지막으로 올린 시각으로 안다', () => {
    const { result } = mount()
    act(() => result.current.remember([onServer('2026-10-28', 7, 2, '2026-10-28T02:00:00+00:00'), onServer('2026-10-27', 1, 1, '2026-10-29T02:00:00+00:00')], result.current.readMark()))
    expect(result.current.lastUploadedAt).toBe('2026-10-29T02:00:00+00:00')
  })

  it('AC-019.4: 올리는 동안 온 새 값은 앞 요청이 끝난 뒤 이어서 올린다', async () => {
    let open: () => void = () => {}
    db.gate = new Promise((resolve) => {
      open = resolve
    })
    const { worker } = mount()
    await receive(worker, W('2026-10-28', 7, 2))
    await receive(worker, W('2026-10-28', 7, 3))
    expect(db.upserts).toHaveLength(1)
    db.gate = null
    open()
    await settled()
    await settled()
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 3)])
  })

  it('AC-019.4: 건수가 아닌 Worker 메시지는 무시한다', async () => {
    const { worker } = mount()
    await emit(worker, { type: 'check', ok: true })
    await emit(worker, { type: 'dayCounts' })
    await emit(worker, { type: 'dayCounts', load: 1, rows: [W('2026-10-28', 7, 2)] })
    expect(db.upserts).toEqual([])
  })

  it('AC-019.3·AC-019.6: 정해 둔 모양 밖의 줄은 보내지 않고 남겨 두지도 않는다. 같이 온 맞는 줄은 올린다', async () => {
    const { worker, result } = mount()
    const rows = [{ ...W('2026-10-28', 7, 2), name: '가상환자A' }, W('2026-10-29', 3, 0)]
    await emit(worker, message(rows))
    expect(JSON.stringify(db.upserts)).not.toContain('가상환자')
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-29', 3, 0)])
    await focus()
    expect(db.upserts).toHaveLength(1)
    expect(result.current.failed).toBe(false)
  })

  it('AC-019.3: 틀린 줄뿐이면 보내지 않고 실패로 알린다', async () => {
    const { worker, result } = mount()
    const rows = [{ ...W('2026-10-28', 7, 2), chart: '900019' }]
    await emit(worker, message(rows))
    expect(db.upserts).toEqual([])
    expect(result.current.failed).toBe(true)
  })

  it('AC-019.3: Worker가 진료 수까지 실어 보내도 받지 않는다(그 칸은 화면이 붙인다)', async () => {
    const { worker } = mount()
    const rows = [{ ...W('2026-10-28', 7, 2), visits: 999 }]
    await emit(worker, message(rows))
    expect(db.upserts).toEqual([{ table: 'claim_day_counts', rows: [U('2026-10-28', 7, 2)], options: { onConflict: 'hospital_id,visit_date' } }])
  })
})

describe('AC-019.3·AC-019.4 진료 수(visits)는 불러오기 앞에 물은 값이다', () => {
  it('AC-019.3: 번호가 다른 건수 메시지는 버린다', async () => {
    const { worker } = mount()
    await emit(worker, message([W('2026-10-28', 7, 2)], { load: 2 }))
    await emit(worker, message([W('2026-10-28', 7, 2)], { load: 0 }))
    expect(db.upserts).toEqual([])
  })

  it('AC-019.3: 쥔 번호가 없으면(아직 불러오지 않음) 버린다', async () => {
    const worker = fakeWorker()
    renderHook(() => useCountsUpload(worker))
    await emit(worker, message([W('2026-10-28', 7, 2)]))
    expect(db.upserts).toEqual([])
  })

  it('AC-019.4: 건수 메시지가 오지 않으면 claim.dates 값이 있어도 아무것도 올리지 않는다', async () => {
    const { result } = mount()
    act(() => result.current.hold(2, dates(23)))
    await focus()
    await settled()
    expect(db.upserts).toEqual([])
    expect(result.current.synced).toBe(false)
  })

  it('AC-019.3: [다시 점검]·입력 끝처럼 같은 번호의 메시지는 그 값을 그대로 쓰고 새 불러오기에서만 바뀐다', async () => {
    const { worker, result } = mount(fakeWorker(), dates(7))
    await receive(worker, W('2026-10-28', 7, 2))
    await receive(worker, W('2026-10-28', 7, 3))
    expect(db.upserts.map((call) => call.rows)).toEqual([[U('2026-10-28', 7, 2, 0, 0, 7)], [U('2026-10-28', 7, 3, 0, 0, 7)]])

    act(() => result.current.hold(2, dates(23)))
    await emit(worker, message([W('2026-10-28', 7, 3)], { load: 2 }))
    expect(db.upserts[2].rows).toEqual([U('2026-10-28', 7, 3, 0, 0, 23)])
    // 옛 번호는 이제 버린다
    await emit(worker, message([W('2026-10-28', 7, 9)], { load: 1 }))
    expect(db.upserts).toHaveLength(3)
  })

  it('AC-019.3: 답에 그 날이 없으면 진료 수는 0이다', async () => {
    const { worker } = mount(fakeWorker(), new Map([['2026-10-29', 8]]))
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 7, 2, 0, 0, 0)])
  })

  it('AC-019.3: 묻지 못했으면 진료 수는 0이다', async () => {
    const { worker } = mount(fakeWorker(), null)
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 7, 2, 0, 0, 0)])
  })

  it('AC-019.3: 실패해 대기 중인 줄은 새 불러오기가 값을 바꾼 뒤 초점이 와도 받을 때의 진료 수로 올라간다', async () => {
    const { worker, result } = mount(fakeWorker(), dates(5))
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-28', 7, 2))
    expect(result.current.failed).toBe(true)

    // 새 불러오기가 값을 23으로 바꾸고 실패했다(건수 메시지 없음)
    act(() => result.current.hold(2, dates(23)))
    await focus()
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 2, 0, 0, 5)])
  })

  it('AC-019.4: 증상이 빈 내원만 있는 날(Worker 줄 없음, claim.dates 있음)은 진료 수와 나머지 0인 줄을 올린다', async () => {
    const { worker } = mount(fakeWorker(), new Map([['2026-10-28', 8], ['2026-10-29', 6]]))
    await emit(worker, message([W('2026-10-28', 7, 2)], { range: { from: '2026-10-28', to: '2026-10-29' } }))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual(expect.arrayContaining([U('2026-10-28', 7, 2, 0, 0, 8), U('2026-10-29', 0, 0, 0, 0, 6)]))
    expect(db.upserts[0].rows).toHaveLength(2)
  })

  it('AC-019.4: 진료 없는 기간의 빈 줄 메시지에서도 claim.dates가 있는 날은 올린다', async () => {
    const { worker } = mount(fakeWorker(), new Map([['2026-10-28', 8]]))
    await emit(worker, message([], { range: { from: '2026-10-28', to: '2026-10-28' } }))
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 0, 0, 0, 0, 8)])
  })

  it('AC-019.4: 사라진 날(줄도 claim.dates도 없음)은 서버에 수가 있으면 진료 수까지 모두 0으로 덮는다', async () => {
    const { worker, result } = mount(fakeWorker(), new Map())
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], result.current.readMark()))
    await emit(worker, message([], { range: { from: '2026-10-28', to: '2026-10-28' } }))
    expect(db.upserts[0].rows).toEqual([ZERO('2026-10-28')])
  })

  it('AC-019.4: claim.dates에 0명으로 답한 날도 사라진 날과 같다', async () => {
    const { worker, result } = mount(fakeWorker(), new Map([['2026-10-28', 0]]))
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], result.current.readMark()))
    await emit(worker, message([], { range: { from: '2026-10-28', to: '2026-10-28' } }))
    expect(db.upserts[0].rows).toEqual([ZERO('2026-10-28')])
  })

  it('AC-019.4: 사라진 날에 대기 중인 수가 있으면 그것도 모두 0으로 바꾼다', async () => {
    const { worker, result } = mount()
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-28', 7, 2))
    expect(result.current.failed).toBe(true)
    act(() => result.current.hold(2, new Map()))
    await emit(worker, message([], { load: 2, range: { from: '2026-10-28', to: '2026-10-28' } }))
    expect(db.upserts.at(-1)?.rows).toEqual([ZERO('2026-10-28')])
  })

  it('AC-019.4: 수가 없던 날과 이미 0인 날은 새로 채우지 않는다', async () => {
    const { worker, result } = mount(fakeWorker(), new Map())
    act(() => result.current.remember([{ ...ZERO('2026-10-29'), updated_at: '2026-10-29T02:00:00+00:00' }], result.current.readMark()))
    await emit(worker, message([], { range: { from: '2026-10-28', to: '2026-10-29' } }))
    expect(db.upserts).toEqual([])
    expect(result.current.synced).toBe(true)
  })

  it('AC-019.4: 고른 기간 밖의 날은 건드리지 않는다', async () => {
    const { worker, result } = mount(fakeWorker(), new Map([['2026-10-29', 9]]))
    act(() => result.current.remember([onServer('2026-10-27', 7, 2)], result.current.readMark()))
    await emit(worker, message([W('2026-10-28', 1, 1)], { range: { from: '2026-10-28', to: '2026-10-28' } }))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 1, 1, 0, 0, 0)])
  })

  it('AC-019.4: 묻지 못한 불러오기에서는 줄이 없는 날을 건드리지 않는다(서버에 수가 있어도)', async () => {
    const { worker, result } = mount(fakeWorker(), null)
    act(() => result.current.remember([onServer('2026-10-29', 7, 2)], result.current.readMark()))
    await emit(worker, message([W('2026-10-28', 1, 1)], { range: { from: '2026-10-28', to: '2026-10-29' } }))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-28', 1, 1, 0, 0, 0)])
  })
})

describe('AC-019.4 읽기와 올리기가 겹쳐도 아는 값이 뒤로 가지 않는다', () => {
  it('AC-019.4: 올리기 답이 먼저 오고 그 전에 시작한 읽기가 늦게 와도 옛 값으로 덮지 않는다: 뒤에 실제로 옛 값이 되면 올린다', async () => {
    const { worker, result } = mount()
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], result.current.readMark()))
    const mark = result.current.readMark() // 읽기를 시작했다. 서버에는 아직 7/2다
    await receive(worker, W('2026-10-28', 7, 5)) // 그 뒤에 7/5를 올렸다
    expect(db.upserts).toHaveLength(1)
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], mark)) // 옛 답이 늦게 왔다

    await receive(worker, W('2026-10-28', 7, 2)) // 비트 메모가 지워져 진짜로 7/2가 됐다
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 2)])
  })

  it('AC-019.4: 읽기가 올리기 뒤에 시작했으면 그 값을 믿는다', async () => {
    const { worker, result } = mount()
    await receive(worker, W('2026-10-28', 7, 5))
    const mark = result.current.readMark()
    act(() => result.current.remember([onServer('2026-10-28', 9, 7)], mark)) // 다른 PC가 바꿨다
    await receive(worker, W('2026-10-28', 9, 7))
    expect(db.upserts).toHaveLength(1)
  })

  it('AC-019.4: 대기 중인 날은 읽은 값으로 덮지 않는다: 올리는 값이 그대로 올라간다', async () => {
    const { worker, result } = mount()
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-28', 7, 5))
    expect(result.current.failed).toBe(true)
    // 대기 중에 읽은 값이 옛 값이어도 올라갈 값은 그대로다
    act(() => result.current.remember([onServer('2026-10-28', 7, 2)], result.current.readMark()))
    await focus()
    expect(db.upserts.at(-1)?.rows).toEqual([U('2026-10-28', 7, 5)])

    await receive(worker, W('2026-10-28', 7, 5))
    expect(db.upserts).toHaveLength(2)
  })

  it('AC-019.4: 대기 중인 날은 읽은 값이 올라갈 값과 같아도 아는 값으로 적지 않는다: 줄을 버리지 않고 올린다', async () => {
    const { worker, result } = mount()
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-28', 7, 5))
    act(() => result.current.remember([onServer('2026-10-28', 7, 5)], result.current.readMark()))
    await focus()
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 5)])
  })

  it('AC-019.4: 돌아올 때 대기 중인 줄의 올리기와 건수 읽기가 함께 나가 올리기가 먼저 끝나도 뒤에 온 옛 읽기가 덮지 않는다(청구 화면)', async () => {
    const worker = fakeWorker()
    db.replies = [{ error: { code: '500' }, status: 500 }]
    const first = mount(worker)
    db.counts = [onServer('2026-10-20', 2, 1)]
    await receive(worker, W('2026-10-20', 2, 2))
    expect(first.result.current.failed).toBe(true)
    first.unmount()

    // 돌아왔다: 서버의 답은 아직 옛 값(2/1)이고 올리기(2/2)는 먼저 끝난다
    show(worker)
    await screen.findByRole('table', { name: '진료한 날짜' })
    await settled()
    expect(db.upserts.at(-1)?.rows).toEqual([U('2026-10-20', 2, 2)])
    const sent = db.upserts.length

    // 옛 값이 실제 값이 되면 올라가야 한다
    await receive(worker, W('2026-10-20', 2, 1))
    expect(db.upserts).toHaveLength(sent + 1)
    expect(db.upserts.at(-1)?.rows).toEqual([U('2026-10-20', 2, 1)])
  })
})

describe('AC-019.4 실패하면 메모리에 두고 다시 올린다', () => {
  const FAILED = { error: { code: '500', message: 'relation secret' }, status: 500 }

  it('AC-019.4: 실패하면 failed이고 마지막으로 올린 시각은 그대로다', async () => {
    const { worker, result } = mount()
    act(() => result.current.remember([onServer('2026-10-27', 1, 1, '2026-10-29T02:00:00+00:00')], result.current.readMark()))
    db.replies = [FAILED]
    await receive(worker, W('2026-10-28', 7, 2))
    expect(result.current.failed).toBe(true)
    expect(result.current.synced).toBe(false)
    expect(result.current.lastUploadedAt).toBe('2026-10-29T02:00:00+00:00')
  })

  it('AC-019.4: 다음에 바뀔 때 못 올린 줄을 새 줄과 함께 다시 올린다. 같은 날은 마지막 값만이다', async () => {
    const { worker, result } = mount()
    db.replies = [FAILED]
    await receive(worker, W('2026-10-28', 7, 2), W('2026-10-29', 3, 0))
    await receive(worker, W('2026-10-28', 7, 4))
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual(expect.arrayContaining([U('2026-10-28', 7, 4), U('2026-10-29', 3, 0)]))
    expect(db.upserts[1].rows).toHaveLength(2)
    expect(result.current.failed).toBe(false)
  })

  it('AC-019.4: 창 초점이 오면 못 올린 줄을 다시 올린다. 성공하면 failed가 풀린다', async () => {
    const { worker, result } = mount()
    db.replies = [FAILED]
    await receive(worker, W('2026-10-28', 7, 2))
    expect(result.current.failed).toBe(true)
    await focus()
    expect(db.upserts).toHaveLength(2)
    expect(db.upserts[1].rows).toEqual([U('2026-10-28', 7, 2)])
    expect(result.current.failed).toBe(false)
    expect(result.current.lastUploadedAt).not.toBeNull()
  })

  it('AC-019.4: 또 실패하면 다시 메모리에 남고 failed다', async () => {
    const { worker, result } = mount()
    db.replies = [FAILED, 'throw']
    await receive(worker, W('2026-10-28', 7, 2))
    await focus()
    expect(result.current.failed).toBe(true)
    await focus()
    expect(db.upserts).toHaveLength(3)
    expect(result.current.failed).toBe(false)
  })

  it('AC-019.4: 못 올린 줄이 없으면 창 초점이 와도 보내지 않는다', async () => {
    const { worker } = mount()
    await focus()
    expect(db.upserts).toEqual([])
    await receive(worker, W('2026-10-28', 7, 2))
    await focus()
    expect(db.upserts).toHaveLength(1)
  })

  it('AC-019.4: 못 올린 값이 서버 값으로 되돌아오면 보낼 것이 없어 failed가 풀린다', async () => {
    const { worker, result } = mount()
    await receive(worker, W('2026-10-28', 7, 2))
    db.replies = [FAILED]
    await receive(worker, W('2026-10-28', 7, 3))
    expect(result.current.failed).toBe(true)
    await receive(worker, W('2026-10-28', 7, 2))
    expect(db.upserts).toHaveLength(2)
    expect(result.current.failed).toBe(false)
  })

  it('AC-019.4: 다른 탭에 다녀와도(훅이 내렸다 올라와도) 못 올린 줄이 남아 돌아오면 다시 올린다. Worker 듣기는 하나다', async () => {
    const worker = fakeWorker()
    db.replies = [FAILED]
    const first = mount(worker)
    await receive(worker, W('2026-10-28', 7, 2))
    expect(first.result.current.failed).toBe(true)
    first.unmount()
    const listeners = worker.listeners.size

    // 다른 탭에 있는 동안 창 초점이 와도 보내지 않는다
    await focus()
    expect(db.upserts).toHaveLength(1)

    const second = renderHook(() => useCountsUpload(worker))
    await settled()
    expect(worker.listeners.size).toBe(listeners)
    expect(db.upserts).toHaveLength(2)
    expect(second.result.current.failed).toBe(false)
  })

  it.each<[string, Reply]>([
    ['PGRST205', { error: { code: 'PGRST205', message: 'relation secret' }, status: 404 }],
    ['42P01', { error: { code: '42P01', message: 'relation secret' }, status: 400 }],
    ['상태 404', { error: { code: '', message: 'relation secret' }, status: 404 }],
  ])('AC-019.4: 표가 아직 없으면(마이그레이션 전, %s) 던지지 않고 실패로 두었다가 표가 생긴 뒤 창 초점에 올린다', async (_name, missing) => {
    const { worker, result } = mount()
    db.replies = [missing, missing]
    await receive(worker, W('2026-10-28', 7, 2))
    expect(result.current.failed).toBe(true)
    await focus()
    expect(result.current.failed).toBe(true)
    await focus() // 이제 표가 있다
    expect(db.upserts).toHaveLength(3)
    expect(result.current.failed).toBe(false)
  })
})

// ── 청구 화면에 이은 것 ──────────

const DAYS: BridgeDay[] = [
  { date: '2026-10-20', visits: 10, memoInBit: 0 },
  { date: '2026-10-21', visits: 10, memoInBit: 0 },
  { date: '2026-10-22', visits: 10, memoInBit: 0 },
]
const REGISTERED = { steps: [{ name: 'find', ok: true }], registered: true, institutionCode: '12345678' }
const grown = (date: string, visits: number) => (DAYS as BridgeDay[]).map((day) => (day.date === date ? { ...day, visits } : day))

function show(worker: Fake = fakeWorker(), result?: InputResultView['status']) {
  const channel: ClaimChannel = claimChannel(worker)
  if (result) channel.keepMemo({ bit: null, result: { status: result } as InputResultView })
  const call = vi.fn((cmd: string, args: unknown) => {
    if (cmd === 'bit.check') return Promise.resolve(REGISTERED)
    db.datesCalls.push(args)
    if (db.datesFail) return Promise.reject(new BridgeError('E-BIT-READ-FAILED'))
    const days = db.days
    return db.datesGate ? db.datesGate.then(() => ({ days })) : Promise.resolve({ days })
  })
  const stream = vi.fn((cmd: string) => (db.streamGate ? db.streamGate.then(() => ({ id: cmd, count: 1 })) : Promise.resolve({ id: cmd, count: 1 })))
  const view = render(createElement(ClaimScreen, { channel, call: call as never, stream: stream as never }))
  return { worker, channel, call, ...view }
}
/** 화면이 쓰는 것과 같은 올리기(Worker 하나에 하나)에 번호를 쥐여 준다 */
function holdOn(worker: Fake, held: ReadonlyMap<string, number> | null = ALL_TEN, load = 1) {
  const hook = renderHook(() => useCountsUpload(worker))
  act(() => hook.result.current.hold(load, held))
}
const pressLoad = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '자료 불러오기' }))
}
/** 날짜 목록 → [자료 불러오기] → 점검 결과 */
async function toResult(worker: Fake = fakeWorker()) {
  const made = show(worker)
  const user = userEvent.setup()
  await pressLoad(user)
  await screen.findByRole('button', { name: '다음: 메모 확인' })
  return { ...made, user }
}
/** 날짜 목록 → [자료 불러오기] → 점검 결과 → 메모 칸 */
async function toMemo(worker: Fake, status?: InputResultView['status']) {
  const made = await toResult(worker)
  if (status) made.channel.keepMemo({ bit: null, result: { status } as InputResultView })
  await made.user.click(screen.getByRole('button', { name: '다음: 메모 확인' }))
  await screen.findByText('메모 칸 자리')
  return made
}
const left = (n: number) => `아직 입력 안 된 날짜 ${n}일`
const inputs = () => ({ from: (screen.getByLabelText('시작') as HTMLInputElement).value, to: (screen.getByLabelText('끝') as HTMLInputElement).value })

const UPLOADED = '날짜별 입력 현황이 서버에 건수로 올라갔어요. 집이나 휴대폰에서 볼 수 있어요.'

describe('AC-019.4 청구 화면', () => {
  it('AC-019.4: 읽어 둔 서버 건수와 같은 값은 올리지 않고, 바뀐 값만 올린다', async () => {
    db.counts = [onServer('2026-10-20', 2, 2)]
    const { worker } = show()
    holdOn(worker)
    await screen.findByRole('table', { name: '진료한 날짜' })
    await settled()
    await receive(worker, W('2026-10-20', 2, 2), W('2026-10-21', 5, 0))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-21', 5, 0)])
  })

  it('AC-019.3·AC-013.2: [자료 불러오기] 앞에 물은 값을 진료 수로 붙이고, 그 번호의 메시지에만 쓴다', async () => {
    const worker = fakeWorker()
    const made = await toResult(worker)
    const load = made.channel.lastLoad()!
    db.days = grown('2026-10-21', 23) // 물은 뒤에 온 환자는 들지 않는다
    await emit(worker, message([W('2026-10-21', 5, 5)], { load }))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-21', 5, 5, 0, 0, 10)])
    await emit(worker, message([W('2026-10-21', 5, 0)], { load: load - 1 }))
    expect(db.upserts).toHaveLength(1)
  })

  it('AC-019.4: 건수 메시지가 오지 않은 불러오기는 아무것도 올리지 않는다', async () => {
    db.counts = [onServer('2026-10-20', 2, 2, '2026-10-20T02:00:00+00:00', 5)]
    await toResult(fakeWorker())
    await settled()
    expect(db.upserts).toEqual([])
  })

  it('AC-019.3: 묻지 못한 불러오기는 진료 수 0이고 줄이 없는 날을 건드리지 않는다', async () => {
    db.counts = [onServer('2026-10-22', 2, 2)]
    const worker = fakeWorker()
    const made = show(worker)
    const user = userEvent.setup()
    await screen.findByRole('table', { name: '진료한 날짜' })
    db.datesFail = true
    await pressLoad(user)
    await screen.findByRole('button', { name: '다음: 메모 확인' })
    await emit(worker, message([W('2026-10-21', 5, 5)], { load: made.channel.lastLoad(), range: { from: '2026-10-20', to: '2026-10-22' } }))
    expect(db.upserts).toHaveLength(1)
    expect(db.upserts[0].rows).toEqual([U('2026-10-21', 5, 5, 0, 0, 0)])
  })

  it('AC-019.4: 올리지 못하면 E-COUNTS-FAILED 작은 줄과 마지막으로 올린 시각이 보이고, 화면은 그대로 쓸 수 있다. 원래 오류 글이 없다', async () => {
    db.counts = [onServer('2026-10-20', 2, 2, '2026-10-29T07:41:00+00:00')]
    const { worker } = show()
    holdOn(worker)
    await screen.findByRole('table', { name: '진료한 날짜' })
    await settled()
    db.replies = [{ error: { code: 'PGRST205', message: 'relation secret' }, status: 404 }]
    await receive(worker, W('2026-10-21', 5, 0))

    const line = await screen.findByText(new RegExp(errorInfo('E-COUNTS-FAILED').what))
    expect(line.textContent).toContain('오류 번호 E-COUNTS-FAILED')
    expect(line.textContent).toContain('마지막으로 올린 시각 10월 29일 (목) 16:41')
    expect(line.getAttribute('role')).toBe('status')
    expect(line.className).toContain('text-caption')
    expect(document.body.textContent).not.toContain('relation')
    expect(screen.queryByRole('alert')).toBeNull()
    // 화면이 깨지지 않았다
    expect(screen.getByRole('table', { name: '진료한 날짜' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '자료 불러오기' })).toBeTruthy()

    await focus()
    await waitFor(() => expect(screen.queryByText(new RegExp(errorInfo('E-COUNTS-FAILED').what))).toBeNull())
  })

  it('AC-019.4: 올린 적 없이 실패하면 시각 없이 번호만 보인다', async () => {
    const { worker } = show()
    holdOn(worker)
    await screen.findByRole('table', { name: '진료한 날짜' })
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-21', 5, 0))
    const line = await screen.findByText(new RegExp(errorInfo('E-COUNTS-FAILED').what))
    expect(line.textContent).not.toContain('마지막으로 올린 시각')
  })

  it('AC-019.4(목업 화면 6): 입력이 끝난 결과 칸에서 건수를 올렸으면 "서버에 건수로 올라갔어요" 한 줄이 보인다', async () => {
    const worker = fakeWorker()
    memoStage.stage = 'result'
    const made = await toMemo(worker, 'finished')
    await emit(worker, message([W('2026-10-21', 5, 5)], { load: made.channel.lastLoad() }))
    expect(await screen.findByText(UPLOADED)).toBeTruthy()
  })

  it('AC-019.4: 올리기가 실패하면 그 한 줄 대신 E-COUNTS-FAILED 줄이다', async () => {
    const worker = fakeWorker()
    memoStage.stage = 'result'
    const made = await toMemo(worker, 'finished')
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await emit(worker, message([W('2026-10-21', 5, 5)], { load: made.channel.lastLoad() }))
    await screen.findByText(new RegExp(errorInfo('E-COUNTS-FAILED').what))
    expect(screen.queryByText(UPLOADED)).toBeNull()
  })

  it.each<[string, string, InputResultView['status'] | undefined]>([
    ['결과 칸이 아니면(고르는 중)', 'pick', 'finished'],
    ['중간에 멈춘 결과면(목업: 끝남에만 있다)', 'result', 'stopped'],
    ['결과가 없으면', 'result', undefined],
  ])('AC-019.4: %s 그 한 줄이 없다', async (_name, stage, status) => {
    const worker = fakeWorker()
    memoStage.stage = stage
    const made = await toMemo(worker, status)
    await emit(worker, message([W('2026-10-21', 5, 5)], { load: made.channel.lastLoad() }))
    await settled()
    expect(db.upserts).toHaveLength(1)
    expect(screen.queryByText(UPLOADED)).toBeNull()
  })

  it('AC-019.4: 건수를 받지 않았으면(메모를 만들지 않는 병원) 끝난 결과여도 그 한 줄이 없다: 올라갔다고 말하지 않는다', async () => {
    const worker = fakeWorker()
    memoStage.stage = 'result'
    await toMemo(worker, 'finished')
    await settled()
    expect(screen.queryByText(UPLOADED)).toBeNull()
  })
})

// 순수 계산은 dateList.test.ts가 본다. 여기는 화면이 그 계산에 새 값을 주는지다
describe('AC-013.1 claim.dates를 다시 묻는다', () => {
  const FINISHED = () => [onServer('2026-10-20', 3, 3), onServer('2026-10-21', 2, 2), onServer('2026-10-22', 2, 2)]

  it('AC-013.1: 화면을 열 때는 한 번만 묻는다', async () => {
    show()
    await screen.findByRole('table', { name: '진료한 날짜' })
    await settled()
    expect(db.datesCalls).toHaveLength(1)
    expect(db.countsReads).toBe(1)
  })

  it('AC-013.1: 날짜 칸에서 창 초점이 돌아와 진료 수가 늘었으면 화면을 다시 열지 않아도 덜 끝남이 되고 [입력 안 된 날짜 모두]에 든다', async () => {
    db.counts = FINISHED()
    show()
    const user = userEvent.setup()
    await screen.findByText(left(0))
    expect((screen.getByRole('button', { name: '입력 안 된 날짜 모두' }) as HTMLButtonElement).disabled).toBe(true)

    db.days = grown('2026-10-21', 23)
    await focus()
    await screen.findByText(left(1))
    await user.click(screen.getByRole('button', { name: '입력 안 된 날짜 모두' }))
    expect(inputs()).toEqual({ from: '2026-10-21', to: '2026-10-21' })
  })

  it('AC-013.1: 날짜 칸으로 돌아올 때 진료 수가 늘었으면 덜 끝남이 된다', async () => {
    db.counts = FINISHED()
    const made = await toResult()
    const before = db.datesCalls.length
    db.days = grown('2026-10-21', 23)
    await made.user.click(screen.getByRole('button', { name: '날짜 고르기' }))
    await screen.findByText(left(1))
    expect(db.datesCalls).toHaveLength(before + 1)
  })

  it('AC-013.1: 건수를 올린 뒤 다시 물어 끝남으로 읽고 버튼이 끝난 날을 건너뛴다(화면을 다시 열지 않아도)', async () => {
    db.counts = []
    const { worker } = show()
    holdOn(worker)
    const user = userEvent.setup()
    const table = await screen.findByRole('table', { name: '진료한 날짜' })
    expect(screen.getByText(left(3))).toBeTruthy()
    await settled()
    const asked = db.datesCalls.length

    // 10/20을 다 넣었다. 올린 뒤 서버 값은 그 줄이 끝남이다
    db.counts = [onServer('2026-10-20', 2, 2)]
    await receive(worker, W('2026-10-20', 2, 2))
    await settled()
    expect(db.upserts).toHaveLength(1)
    expect(db.datesCalls).toHaveLength(asked + 1)
    await screen.findByText(left(2))
    expect(within(table).getByText('입력이 끝난 날짜')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '입력 안 된 날짜 모두' }))
    expect(inputs()).toEqual({ from: '2026-10-21', to: '2026-10-22' })
  })

  it('AC-013.1: 올리기가 실패하면 다시 묻지 않는다', async () => {
    const { worker } = show()
    holdOn(worker)
    await screen.findByRole('table', { name: '진료한 날짜' })
    await settled()
    const asked = db.datesCalls.length
    db.replies = [{ error: { code: '500' }, status: 500 }]
    await receive(worker, W('2026-10-20', 2, 2))
    await settled()
    expect(db.datesCalls).toHaveLength(asked)
    expect(db.countsReads).toBe(1)
  })

  it.each<[string, () => void]>([
    ['claim.dates', () => void (db.datesFail = true)],
    ['서버 건수', () => void (db.countsFail = true)],
  ])('AC-013.1: %s를 묻지 못하면 보던 목록이 그대로 남고 오류 카드가 없다', async (_name, fail) => {
    db.counts = [onServer('2026-10-20', 3, 3)]
    show()
    await screen.findByText(left(2))
    fail()
    db.days = grown('2026-10-20', 23)
    db.counts = []
    await focus()
    await settled()
    expect(screen.getByRole('table', { name: '진료한 날짜' })).toBeTruthy()
    expect(screen.getByText(left(2))).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-013.1: 불러오는 중에는 창 초점이 와도 목록을 새로 그리려고 묻지 않는다(불러오기 앞의 한 번은 따로다)', async () => {
    db.streamGate = new Promise(() => {})
    const { worker } = show()
    const user = userEvent.setup()
    await pressLoad(user)
    await settled()
    expect(worker.posted.filter((m) => m.type === 'loadStart')).toHaveLength(1)
    const asked = db.datesCalls.length
    expect(asked).toBe(2) // 화면을 열 때 + 불러오기 앞
    await focus()
    await settled()
    expect(db.datesCalls).toHaveLength(asked)
  })

  it('AC-013.1: 불러오는 중에 건수를 올려도 목록을 새로 그리려고 묻지 않는다', async () => {
    db.streamGate = new Promise(() => {})
    const worker = fakeWorker()
    const made = show(worker)
    const user = userEvent.setup()
    await pressLoad(user)
    await settled()
    const asked = db.datesCalls.length
    await emit(worker, message([W('2026-10-20', 2, 2)], { load: made.channel.lastLoad() }))
    await settled()
    expect(db.upserts).toHaveLength(1)
    expect(db.datesCalls).toHaveLength(asked)
  })

  it('AC-013.1: 물어 둔 답이 불러오기가 시작된 뒤에 와도 목록을 새로 그리지 않는다', async () => {
    db.counts = [onServer('2026-10-20', 3, 3)]
    db.streamGate = new Promise(() => {})
    show()
    const user = userEvent.setup()
    await screen.findByText(left(2))
    let open: () => void = () => {}
    db.datesGate = new Promise((resolve) => {
      open = resolve
    })
    db.days = grown('2026-10-20', 23)
    await focus()
    db.datesGate = null
    await pressLoad(user)
    await settled()
    open()
    await settled()
    expect(screen.getByText(left(2))).toBeTruthy()
  })

  describe('서버 건수를 읽는 사이에 사정이 바뀌면 claim.dates를 묻지 않는다', () => {
    const gated = () => {
      let open: () => void = () => {}
      db.countsGate = new Promise((resolve) => {
        open = resolve
      })
      return () => open()
    }

    it('AC-013.1: 그 사이에 불러오기가 시작됐으면 더 묻지 않는다(불러오기 앞의 한 번뿐이다)', async () => {
      db.streamGate = new Promise(() => {})
      show()
      const user = userEvent.setup()
      await screen.findByRole('table', { name: '진료한 날짜' })
      await settled()
      const open = gated()
      await focus()
      db.countsGate = null
      await pressLoad(user)
      await settled()
      expect(db.datesCalls).toHaveLength(2) // 화면을 열 때 + 불러오기 앞
      open()
      await settled()
      expect(db.datesCalls).toHaveLength(2)
    })

    it('AC-013.1: 그 사이에 화면을 떠났으면 묻지 않는다', async () => {
      const made = show()
      await screen.findByRole('table', { name: '진료한 날짜' })
      await settled()
      const open = gated()
      await focus()
      made.unmount()
      open()
      await settled()
      expect(db.datesCalls).toHaveLength(1)
    })

    it('AC-013.1: 그 사이에 새로 물었으면 옛 읽기는 묻지 않는다(새 읽기의 한 번뿐이다)', async () => {
      show()
      await screen.findByRole('table', { name: '진료한 날짜' })
      await settled()
      const open = gated()
      await focus()
      db.countsGate = null
      await focus()
      await settled()
      expect(db.datesCalls).toHaveLength(2)
      open()
      await settled()
      expect(db.datesCalls).toHaveLength(2)
    })
  })

  it('AC-013.1: 입력 중에는 창 초점이 와도, 건수를 올려도 묻지 않는다', async () => {
    const worker = fakeWorker()
    memoStage.stage = 'run'
    const made = await toMemo(worker)
    await settled()
    const asked = db.datesCalls.length
    await focus()
    await emit(worker, message([W('2026-10-20', 2, 2)], { load: made.channel.lastLoad() }))
    await settled()
    expect(db.upserts).toHaveLength(1)
    expect(db.datesCalls).toHaveLength(asked)
  })

  it('AC-013.1: 먼저 물은 답이 늦게 와도 새 답을 덮지 않는다', async () => {
    db.counts = [onServer('2026-10-20', 3, 3)]
    show()
    await screen.findByText(left(2))
    let open: () => void = () => {}
    db.datesGate = new Promise((resolve) => {
      open = resolve
    })
    db.days = DAYS
    await focus() // 옛 답: 2일 남음 그대로
    db.datesGate = null
    db.days = grown('2026-10-20', 23)
    await focus() // 새 답: 3일 남음
    await screen.findByText(left(3))
    open()
    await settled()
    expect(screen.getByText(left(3))).toBeTruthy()
  })

  describe('다시 읽어도 고른 기간은 그대로다', () => {
    const choose = () => {
      fireEvent.change(screen.getByLabelText('시작'), { target: { value: '2026-10-21' } })
      fireEvent.change(screen.getByLabelText('끝'), { target: { value: '2026-10-21' } })
    }
    const CHOSEN = { from: '2026-10-21', to: '2026-10-21' }

    it('AC-013.1: 창 초점으로 다시 읽어 덜 끝난 날이 바뀌어도 사용자가 고른 기간이 그대로다', async () => {
      db.counts = [onServer('2026-10-20', 3, 3), onServer('2026-10-21', 2, 2)]
      show()
      await screen.findByText(left(1))
      choose()
      db.days = grown('2026-10-20', 23)
      await focus()
      await screen.findByText(left(2))
      expect(inputs()).toEqual(CHOSEN)
    })

    it('AC-013.1: 건수를 올린 뒤 다시 읽어도 사용자가 고른 기간이 그대로다', async () => {
      const { worker } = show()
      holdOn(worker)
      await screen.findByText(left(3))
      await settled()
      choose()
      db.counts = [onServer('2026-10-20', 2, 2)]
      await receive(worker, W('2026-10-20', 2, 2))
      await screen.findByText(left(2))
      expect(inputs()).toEqual(CHOSEN)
    })

    it('AC-013.1: 날짜 칸으로 돌아와 다시 읽어도 불러온 기간이 그대로다', async () => {
      db.counts = [onServer('2026-10-20', 3, 3), onServer('2026-10-21', 2, 2)]
      const worker = fakeWorker()
      show(worker)
      const user = userEvent.setup()
      await screen.findByText(left(1))
      choose()
      await pressLoad(user)
      await screen.findByRole('button', { name: '다음: 메모 확인' })
      db.days = grown('2026-10-20', 23)
      await user.click(screen.getByRole('button', { name: '날짜 고르기' }))
      await screen.findByText(left(2))
      expect(inputs()).toEqual(CHOSEN)
    })
  })
})
