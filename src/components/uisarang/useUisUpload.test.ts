// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUisHave, saveUisPlan } from '@/lib/storage/uisarang'
import type { RevenueDayRow } from '@/types/revenue'
import type { UisFileResult, UisHave, UisPlan } from '@/types/uisarang'
import { runUisarang, UisRunError } from '@/workers/runUisarang'
import { useUisUpload } from './useUisUpload'

// 올리기 칸 상태(specs/uisarang-upload design.md §10-1 useUisUpload, REQ-8810).
// 읽기(runUisarang, TASK-3)·저장(saveUisPlan)·있는 것 읽기(readUisHave, TASK-2)는 잡아 두고 답을 시험이 정한다. 저장 계획(planUisSave)·아직 없는 파일 셈(missingFiles)은 진짜다.
// 파일·숫자·이름은 모두 지어낸 값이다. 진짜 Worker·Supabase에 붙지 않는다
vi.mock('@/workers/runUisarang', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/workers/runUisarang')>()), runUisarang: vi.fn() }))
vi.mock('@/lib/storage/uisarang', () => ({ saveUisPlan: vi.fn(), readUisHave: vi.fn(), readUisPeriods: vi.fn() }))

const TODAY = '2026-11-26' // 목요일, 한국 19시 10분
const NOW = new Date('2026-11-26T10:10:00Z')

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}

const daySpan = (day: string) => ({ from: day, to: day, unit: 'day' as const })
const revenueRow = (date: string): RevenueDayRow => ({
  date,
  visits: 132,
  newPatients: null,
  returnVisits: null,
  total: 4_000_000,
  insurer: 2_000_000,
  noncovered: 1_000_000,
  copay: 900_000,
  otherTotal: 100_000,
  cash: 1_000_000,
  card: 2_000_000,
  transfer: 0,
  receivableIn: 0,
  unconfirmed: false,
  splitUnconfirmed: false,
})
const income = (day: string): UisFileResult => ({ status: 'read', read: { kind: 'income', span: daySpan(day), row: revenueRow(day) } })
const visits = (day: string): UisFileResult => ({ status: 'read', read: { kind: 'visits', span: daySpan(day), days: [{ day, patients: 132, newPatients: 9 }] } })
const rx = (from: string, to: string, unit: 'day' | 'week' | 'month' = 'day'): UisFileResult => ({
  status: 'read',
  read: { kind: 'rx', span: { from, to, unit }, payload: { v: 1, rows: [{ code: 'MT30', name: '가짜 도수 30분', qty: 2, amount: 160_000 }], total: 160_000 } },
})
const age = (day: string): UisFileResult => ({
  status: 'read',
  read: { kind: 'visitPatients', span: daySpan(day), payload: { v: 1, patients: 3, newPatients: 1, bands: [0, 0, 0, 1, 1, 1, 0, 0, 0, 0], newBands: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0] } },
})
// 검사를 못 지나는 처방 모양(코드 빈칸) — planUisSave가 refused에 둔다(일어나면 안 되는 길)
const badRx = (day: string): UisFileResult => ({
  status: 'read',
  read: { kind: 'rx', span: daySpan(day), payload: { v: 1, rows: [{ code: '', name: '', qty: 1, amount: 1 }], total: null } },
})
const NOTHING: UisHave = { covered: [], worked: [], income: [], rx: [], age: [] }

// 파일 이름에 가짜 환자 이름을 넣는다: 이름은 결과 줄에만 있어야 한다(AC-8810.8)
const file = (name: string) => new File(['가짜 바이트'], name, { type: 'application/vnd.ms-excel' })
const NAMES = ['일일수입통계_홍길동_1125.xls', '일일수입통계_1126.xls', '내원일별_아래_1126.xls']

const draw = (onSaved = vi.fn()) => ({ onSaved, ...renderHook(() => useUisUpload({ onSaved })) })
const settle = () => act(async () => {})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.mocked(runUisarang).mockReset()
  vi.mocked(saveUisPlan).mockReset()
  vi.mocked(readUisHave).mockReset()
  vi.mocked(saveUisPlan).mockResolvedValue({ failed: [] })
  vi.mocked(readUisHave).mockResolvedValue(NOTHING)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AC-8810.2: 읽는 중 → 저장 중 → 결과', () => {
  it('AC-8810.2: 처음은 idle이고, 놓으면 읽는 중(파일 수) → 저장 중 → 결과(파일 차례 그대로)다. 그동안 busy', async () => {
    const reading = deferred<UisFileResult[]>()
    const saving = deferred<{ failed: number[] }>()
    vi.mocked(runUisarang).mockReturnValue(reading.promise)
    vi.mocked(saveUisPlan).mockReturnValue(saving.promise)
    const { result } = draw()
    expect(result.current.phase).toBe('idle')
    expect(result.current.busy).toBe(false)
    expect(result.current.rows).toBeNull()

    act(() => result.current.take(NAMES.map(file)))
    expect(result.current.phase).toBe('reading')
    expect(result.current.count).toBe(3)
    expect(result.current.busy).toBe(true)
    expect(result.current.rows).toBeNull()
    expect(runUisarang).toHaveBeenCalledTimes(1)
    expect(vi.mocked(runUisarang).mock.calls[0]![1]).toEqual({ today: TODAY })

    await act(async () => reading.resolve([income('2026-11-25'), income('2026-11-26'), age('2026-11-26')]))
    expect(result.current.phase).toBe('saving')
    expect(result.current.busy).toBe(true)
    expect(result.current.rows).toBeNull()

    await act(async () => saving.resolve({ failed: [] }))
    await settle()
    expect(result.current.phase).toBe('done')
    expect(result.current.busy).toBe(false)
    expect(result.current.today).toBe(TODAY)
    expect(result.current.rows!.map((row) => [row.name, row.status])).toEqual([
      [NAMES[0], 'saved'],
      [NAMES[1], 'saved'],
      [NAMES[2], 'saved'],
    ])
  })

  it('AC-8810.2: 읽는 동안·저장하는 동안 다시 놓은 파일은 받지 않는다(읽기를 다시 부르지 않음)', async () => {
    const reading = deferred<UisFileResult[]>()
    vi.mocked(runUisarang).mockReturnValue(reading.promise)
    const { result } = draw()
    act(() => result.current.take([file('a.xls')]))
    act(() => result.current.take([file('b.xls')]))
    expect(runUisarang).toHaveBeenCalledTimes(1)
    expect(result.current.count).toBe(1)
    await act(async () => reading.resolve([income(TODAY)]))
    await settle()
    expect(result.current.phase).toBe('done')
    act(() => result.current.take([]))
    expect(result.current.phase).toBe('done') // 빈 목록은 아무것도 하지 않는다
  })

  it('AC-8810.2: 새로 놓으면 앞 결과는 지우고 읽는 중부터 다시 시작한다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income(TODAY)])
    const { result } = draw()
    act(() => result.current.take([file('a.xls')]))
    await settle()
    expect(result.current.rows).toHaveLength(1)
    const reading = deferred<UisFileResult[]>()
    vi.mocked(runUisarang).mockReturnValueOnce(reading.promise)
    act(() => result.current.take([file('b.xls'), file('c.xls')]))
    expect(result.current.phase).toBe('reading')
    expect(result.current.rows).toBeNull()
    expect(result.current.missing).toBeNull()
    expect(result.current.count).toBe(2)
  })

  it('AC-8807.3·AC-8807.4: 읽기 전체가 실패하면(UisRunError) 그 번호 하나만 · 저장하지 않는다. 다른 예외는 E-ANALYZE-FAILED', async () => {
    vi.mocked(runUisarang).mockRejectedValueOnce(new UisRunError('E-UIS-TOO-MANY'))
    const { result, onSaved } = draw()
    act(() => result.current.take([file('a.xls')]))
    await settle()
    expect(result.current.phase).toBe('done')
    expect(result.current.error).toBe('E-UIS-TOO-MANY')
    expect(result.current.rows).toBeNull()
    expect(saveUisPlan).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    vi.mocked(runUisarang).mockRejectedValueOnce(new Error('가짜 예외'))
    act(() => result.current.take([file('a.xls')]))
    expect(result.current.error).toBeNull() // 새로 놓으면 앞 오류를 지운다
    await settle()
    expect(result.current.error).toBe('E-ANALYZE-FAILED')
  })
})

describe('AC-8810.3: 결과 줄 상태', () => {
  it('AC-8810.3: read → 저장함(실패한 번호면 저장 못 함) · skipped → 건너뜀 · refused → 받지 않음 · 검사를 못 지난 모양(plan.refused) → 받지 않음', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([
      income(TODAY),
      { status: 'refused', code: 'E-UIS-PERIOD', kind: 'rx', span: { from: '2026-11-01', to: '2026-11-26' } },
      visits(TODAY),
      { status: 'skipped', why: 'rsv', kind: 'rsv', span: null },
      badRx(TODAY),
      { status: 'skipped', why: 'same', kind: 'income', span: daySpan(TODAY) },
    ])
    vi.mocked(saveUisPlan).mockResolvedValueOnce({ failed: [2] })
    const { result } = draw()
    act(() => result.current.take(['a', 'b', 'c', 'd', 'e', 'f'].map((n) => file(`${n}.xls`))))
    await settle()
    expect(result.current.rows!.map((row) => row.status)).toEqual(['saved', 'refused', 'failed', 'skipped', 'refused', 'skipped'])
    expect(result.current.phase).toBe('saveFailed')
    // 검사를 못 지난 줄은 보내지 않는다
    const plan = vi.mocked(saveUisPlan).mock.calls[0]![0]
    expect(plan.periods).toEqual([])
    expect(plan.refused).toEqual([4])
  })
})

describe('AC-8810.4: 저장 뒤 아직 없는 파일', () => {
  it('AC-8810.4: 저장한 파일이 덮는 날 범위로 readUisHave를 한 번 읽고 missingFiles 답(종류 차례·날 목록)을 준다(시안 ?s=dash-missing)', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income('2026-11-25'), income('2026-11-26'), age('2026-11-26')])
    vi.mocked(readUisHave).mockResolvedValueOnce({ covered: [], worked: [], income: ['2026-11-25', '2026-11-26'], rx: [], age: ['2026-11-26'] })
    const { result } = draw()
    act(() => result.current.take(NAMES.map(file)))
    await settle()
    expect(readUisHave).toHaveBeenCalledTimes(1)
    expect(vi.mocked(readUisHave).mock.calls[0]![0]).toEqual({ from: '2026-11-25', to: '2026-11-26' })
    expect(result.current.missing).toEqual({
      state: 'ready',
      items: [
        { kind: 'rx', days: ['2026-11-25', '2026-11-26'] },
        { kind: 'visits', days: ['2026-11-25', '2026-11-26'] },
        { kind: 'visitPatients', days: ['2026-11-25'] },
      ],
    })
  })

  it('AC-8810.4: 다 있으면 빈 목록 · 한 달 처방 파일은 그 달 1일~오늘이 이번 날이다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([rx('2026-11-01', '2026-11-30', 'month')])
    const all = Array.from({ length: 26 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    vi.mocked(readUisHave).mockResolvedValueOnce({ covered: [{ from: '2026-11-01', to: '2026-11-26' }], worked: all, income: all, rx: [{ from: '2026-11-01', to: '2026-11-30' }], age: all })
    const { result } = draw()
    act(() => result.current.take([file('처방통계_11월.xls')]))
    await settle()
    expect(vi.mocked(readUisHave).mock.calls[0]![0]).toEqual({ from: '2026-11-01', to: TODAY })
    expect(result.current.missing).toEqual({ state: 'ready', items: [] })
  })

  it('AC-8810.4: 있는 것을 읽지 못하면 결과 줄은 그대로 두고 아직 없는 파일 자리만 failed(E-UIS-READ-FAILED 카드)다 — 저장은 됐으니 onSaved는 부른다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income(TODAY)])
    vi.mocked(readUisHave).mockRejectedValueOnce(new Error('가짜 읽기 실패'))
    const { result, onSaved } = draw()
    act(() => result.current.take([file('a.xls')]))
    await settle()
    expect(result.current.rows!.map((row) => row.status)).toEqual(['saved'])
    expect(result.current.missing).toEqual({ state: 'failed' })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('AC-8810.4·AC-8810.9: 저장된 파일이 하나도 없으면 있는 것을 읽지 않고 아직 없는 파일 자리도 없고 onSaved를 부르지 않는다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([
      { status: 'refused', code: 'E-UIS-KIND', kind: null, span: null },
      { status: 'skipped', why: 'rsv', kind: 'rsv', span: null },
    ])
    const { result, onSaved } = draw()
    act(() => result.current.take([file('a.xlsx'), file('b.xls')]))
    await settle()
    expect(result.current.phase).toBe('done')
    expect(readUisHave).not.toHaveBeenCalled()
    expect(result.current.missing).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('AC-8810.9: 저장이 하나라도 되면 onSaved 한 번', () => {
  it('AC-8810.9: 저장이 끝나고 아직 없는 파일까지 읽은 뒤 onSaved를 한 번 부른다(늘 마지막에 받은 함수)', async () => {
    const have = deferred<UisHave>()
    vi.mocked(runUisarang).mockResolvedValueOnce([income(TODAY), visits(TODAY)])
    vi.mocked(readUisHave).mockReturnValueOnce(have.promise)
    const first = vi.fn()
    const last = vi.fn()
    const { result, rerender } = renderHook(({ onSaved }) => useUisUpload({ onSaved }), { initialProps: { onSaved: first } })
    act(() => result.current.take([file('a.xls'), file('b.xls')]))
    await settle()
    rerender({ onSaved: last })
    expect(last).not.toHaveBeenCalled()
    await act(async () => have.resolve(NOTHING))
    expect(first).not.toHaveBeenCalled()
    expect(last).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8810.5: [다시 저장]은 다시 읽지 않고 실패한 번호만', () => {
  it('AC-8810.5: 실패한 줄만 담은 계획을 다시 보내고, 되면 저장함 · 아직 없는 파일을 다시 읽고 onSaved를 부른다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income('2026-11-25'), visits('2026-11-26'), age('2026-11-26')])
    vi.mocked(saveUisPlan).mockResolvedValueOnce({ failed: [1, 2] })
    const { result, onSaved } = draw()
    act(() => result.current.take(NAMES.map(file)))
    await settle()
    expect(result.current.phase).toBe('saveFailed')
    expect(result.current.rows!.map((row) => row.status)).toEqual(['saved', 'failed', 'failed'])
    expect(onSaved).toHaveBeenCalledTimes(1) // 일일수입통계 하나는 저장됐다
    expect(readUisHave).toHaveBeenCalledTimes(1)
    const firstPlan: UisPlan = vi.mocked(saveUisPlan).mock.calls[0]![0]

    const again = deferred<{ failed: number[] }>()
    vi.mocked(saveUisPlan).mockReturnValueOnce(again.promise)
    act(() => result.current.retrySave())
    expect(result.current.phase).toBe('saving')
    expect(result.current.busy).toBe(true)
    expect(result.current.rows).not.toBeNull() // 결과 줄은 그대로 둔다
    act(() => result.current.retrySave()) // 하는 동안 다시 누름은 무시
    expect(saveUisPlan).toHaveBeenCalledTimes(2)
    const retried: UisPlan = vi.mocked(saveUisPlan).mock.calls[1]![0]
    expect(retried).toEqual({ stats: firstPlan.stats, revenue: [], periods: firstPlan.periods, refused: [] })

    await act(async () => again.resolve({ failed: [] }))
    await settle()
    expect(runUisarang).toHaveBeenCalledTimes(1) // 다시 읽지 않는다
    expect(result.current.phase).toBe('done')
    expect(result.current.rows!.map((row) => row.status)).toEqual(['saved', 'saved', 'saved'])
    expect(readUisHave).toHaveBeenCalledTimes(2)
    expect(vi.mocked(readUisHave).mock.calls[1]![0]).toEqual({ from: '2026-11-25', to: '2026-11-26' })
    expect(onSaved).toHaveBeenCalledTimes(2)
  })

  it('AC-8810.5: 다시 저장도 모두 실패하면 그대로 saveFailed이고 onSaved·있는 것 읽기를 더 부르지 않는다. 실패가 없으면 누름은 아무것도 하지 않는다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income(TODAY)])
    vi.mocked(saveUisPlan).mockResolvedValueOnce({ failed: [0] })
    const { result, onSaved } = draw()
    act(() => result.current.take([file('a.xls')]))
    await settle()
    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.missing).toBeNull()
    vi.mocked(saveUisPlan).mockResolvedValueOnce({ failed: [0] })
    act(() => result.current.retrySave())
    await settle()
    expect(result.current.phase).toBe('saveFailed')
    expect(onSaved).not.toHaveBeenCalled()
    expect(readUisHave).not.toHaveBeenCalled()

    vi.mocked(saveUisPlan).mockResolvedValueOnce({ failed: [] })
    act(() => result.current.retrySave())
    await settle()
    expect(result.current.phase).toBe('done')
    expect(onSaved).toHaveBeenCalledTimes(1)
    act(() => result.current.retrySave())
    await settle()
    expect(saveUisPlan).toHaveBeenCalledTimes(3)
  })
})

describe('AC-8810.8: 파일 이름은 결과 줄에만', () => {
  it('AC-8810.8: runUisarang에는 이름 없는 같은 바이트 파일을, 저장·있는 것 읽기에는 이름 없는 값을 넘기고, 이름은 결과 줄에만 놓은 차례로 있다', async () => {
    vi.mocked(runUisarang).mockResolvedValueOnce([income('2026-11-25'), income('2026-11-26'), age('2026-11-26')])
    const { result } = draw()
    const files = NAMES.map(file)
    act(() => result.current.take(files))
    await settle()
    const sent = vi.mocked(runUisarang).mock.calls[0]![0]
    expect(sent).toHaveLength(3)
    for (const [i, one] of sent.entries()) {
      expect(one.name).toBe('')
      expect(one.size).toBe(files[i]!.size)
    }
    const passed = JSON.stringify([vi.mocked(saveUisPlan).mock.calls, vi.mocked(readUisHave).mock.calls, vi.mocked(runUisarang).mock.calls[0]![1]])
    for (const name of NAMES) expect(passed).not.toContain(name)
    expect(passed).not.toContain('홍길동')
    expect(result.current.rows!.map((row) => row.name)).toEqual(NAMES)
  })
})
