// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayPayload } from '@/types/payload'
import type { OlderDays } from './source'
import { usePeriodDays } from './usePeriodDays'

// 대시보드 옛 기간 읽기 (dashboard-period REQ-1804, design.md '데이터 흐름 (읽기)'). 읽기는 주입받는 가짜이고 답은 잡아 두었다 푼다.
// 시험의 오늘은 2026-11-06, 손에 든 숫자의 첫날(오늘 − 100)은 2026-07-29다. 가짜 DayPayload는 이 파일 안에서만 만든다

const HELD_FROM = '2026-07-29'

function day(ymd: string, patients = 10): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients, newPatients: 2, returning: patients - 2, unknown: 0 },
    rx: [],
    groups: [],
    revisit: { cohort: 2, within7: 0, within14: 0 },
  }
}

// 손에 든 숫자(저장 숫자 또는 비트 숫자): 7월 29일부터
const HELD: readonly DayPayload[] = [day('2026-07-29', 20), day('2026-08-03'), day('2026-11-05')]
const JULY = { from: '2026-07-01', to: '2026-07-31' }
const JUNE = { from: '2026-06-01', to: '2026-06-30' }
const AUGUST = { from: '2026-08-01', to: '2026-08-31' }

type Rows = readonly DayPayload[] | null
function deferred() {
  let resolve!: (value: Rows) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Rows>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

// 부를 때마다 새 답 자리를 하나 만든다. answers[i] = i번째 읽기의 답
function olderReader(from = HELD_FROM) {
  const answers: ReturnType<typeof deferred>[] = []
  const read = vi.fn((range: { from: string; to: string }) => {
    void range
    const answer = deferred()
    answers.push(answer)
    return answer.promise
  })
  const older: OlderDays = { from, read }
  return { older, read, answers }
}

type Props = { current: { from: string; to: string }; older?: OlderDays; held?: readonly DayPayload[] }
const draw = (initial: Props, wrapper?: (p: { children: ReactNode }) => ReactNode) =>
  renderHook(({ current, older, held = HELD }: Props) => usePeriodDays(held, current, older), { initialProps: initial, wrapper })

const settle = async (answer: ReturnType<typeof deferred>, rows: Rows) => {
  await act(async () => {
    answer.resolve(rows)
    await answer.promise
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePeriodDays — 손에 든 숫자로 그리는 기간 (AC-1804.1)', () => {
  it('AC-1804.1: older가 없으면 늘 ready(손에 든 숫자 그 배열)이고 아무것도 읽지 않는다', () => {
    const { result } = draw({ current: JULY })
    expect(result.current.state).toEqual({ kind: 'ready', days: HELD })
    expect(result.current.state.kind === 'ready' && result.current.state.days).toBe(HELD)
  })

  it.each([
    ['첫날이 손에 든 숫자의 첫날과 같음', { from: HELD_FROM, to: '2026-08-15' }],
    ['8월', AUGUST],
    ['10월 안 직접 날짜', { from: '2026-10-03', to: '2026-10-20' }],
    ['최근 90일', { from: '2026-08-08', to: '2026-11-05' }],
    ['최근 7일', { from: '2026-10-30', to: '2026-11-05' }],
  ])('AC-1804.1: %s — 첫날 ≥ older.from이면 새로 읽지 않고 손에 든 숫자로 ready다', (_, current) => {
    const { older, read } = olderReader()
    const { result } = draw({ current, older })
    expect(result.current.state).toEqual({ kind: 'ready', days: HELD })
    expect(read).not.toHaveBeenCalled()
  })
})

describe('usePeriodDays — 옛 기간 한 번 읽기 (AC-1804.2)', () => {
  it('AC-1804.2: 첫날이 앞(2026년 7월)이면 그 기간으로 한 번 읽고, 읽는 동안 reading(숫자 없음)이다', () => {
    const { older, read } = olderReader()
    const { result } = draw({ current: JULY, older })
    expect(result.current.state).toEqual({ kind: 'reading' })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(JULY)
  })

  it('AC-1804.2: 다 읽으면 읽은 줄에 손에 든 숫자를 얹어 ready다(읽은 줄 먼저, 손에 든 줄 뒤 — 같은 날은 뒤의 것을 쓰므로 손에 든 것이 이긴다)', async () => {
    const { older, answers } = olderReader()
    const { result } = draw({ current: { from: '2026-07-15', to: '2026-08-10' }, older })
    const rows = [day('2026-07-15'), day('2026-07-29', 99)]
    await settle(answers[0]!, rows)
    expect(result.current.state).toEqual({ kind: 'ready', days: [...rows, ...HELD] })
  })

  it('AC-1804.2: StrictMode에서도 한 번만 읽는다', () => {
    const { older, read } = olderReader()
    const { result } = draw({ current: JULY, older }, ({ children }) => createElement(StrictMode, null, children))
    expect(result.current.state).toEqual({ kind: 'reading' })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-1804.2: 같은 기간에서 단위만 바꾸면(같은 첫날·끝날의 새 객체) 다시 읽지 않는다 — 읽는 중에도, 읽은 뒤에도', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    rerender({ current: { ...JULY }, older })
    expect(read).toHaveBeenCalledTimes(1)
    await settle(answers[0]!, [day('2026-07-10')])
    rerender({ current: { ...JULY }, older })
    expect(read).toHaveBeenCalledTimes(1)
    expect(result.current.state.kind).toBe('ready')
  })

  it('AC-1804.2: 읽는 중에 다른 기간을 고르면 앞 답은 버리고 새 기간을 읽는다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    rerender({ current: JUNE, older })
    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenLastCalledWith(JUNE)
    await settle(answers[0]!, [day('2026-07-10')]) // 늦게 온 7월 답
    expect(result.current.state).toEqual({ kind: 'reading' })
    const june = [day('2026-06-10')]
    await settle(answers[1]!, june)
    expect(result.current.state).toEqual({ kind: 'ready', days: [...june, ...HELD] })
  })

  it('AC-1804.2: 앞 기간의 답은 남겨 두지 않는다 — 다른 기간을 갔다 돌아오면 다시 읽고, 그동안 앞 숫자를 보이지 않는다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    await settle(answers[0]!, [day('2026-07-10')])
    rerender({ current: JUNE, older })
    rerender({ current: JULY, older })
    expect(read).toHaveBeenCalledTimes(3)
    expect(result.current.state).toEqual({ kind: 'reading' })
  })

  it('AC-1804.1·AC-1804.2: 옛 기간을 읽는 중에 손에 든 기간으로 옮기면 바로 ready(손에 든 숫자)이고 늦게 온 답은 쓰지 않는다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    rerender({ current: AUGUST, older })
    expect(result.current.state).toEqual({ kind: 'ready', days: HELD })
    await settle(answers[0]!, [day('2026-07-10')])
    expect(result.current.state).toEqual({ kind: 'ready', days: HELD })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-1804.2: 손에 든 숫자가 바뀌면(비트 숫자가 옴) 다시 읽지 않고 새 손에 든 숫자를 얹는다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    const rows = [day('2026-07-10')]
    await settle(answers[0]!, rows)
    const bit = [day('2026-07-30', 5)]
    rerender({ current: JULY, older, held: bit })
    expect(read).toHaveBeenCalledTimes(1)
    expect(result.current.state).toEqual({ kind: 'ready', days: [...rows, ...bit] })
  })

  it('AC-1804.2: 떠난 뒤 온 답은 버린다(오류 없음)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { older, answers } = olderReader()
    const { unmount } = draw({ current: JULY, older })
    unmount()
    await settle(answers[0]!, [day('2026-07-10')])
    expect(error).not.toHaveBeenCalled()
  })

  it('AC-1804.2: 읽기는 주입받는다 — usePeriodDays.ts는 react · ./source · dates · 저장 모양 타입만 부르고 lib/storage를 부르지 않는다', () => {
    // 주석을 뺀 코드
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/summary/usePeriodDays.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    const imports = [...text.matchAll(/^import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(imports.sort()).toEqual(['./source', '@/lib/analytics/dates', '@/types/payload', 'react'])
    expect(text).not.toMatch(/lib\/storage|readDays|supabase|\bfetch\s*\(|localStorage|sessionStorage|indexedDB/)
  })
})

describe('usePeriodDays — 실패·한도·다시 읽기 (AC-1804.3)', () => {
  it('AC-1804.3: 읽기가 실패·한도(null)면 failed(다시 읽는 중 아님)이고 숫자가 없다', async () => {
    const { older, answers } = olderReader()
    const { result } = draw({ current: JULY, older })
    await settle(answers[0]!, null)
    expect(result.current.state).toEqual({ kind: 'failed', retrying: false })
  })

  it('AC-1804.3: 읽기가 던져도 failed다', async () => {
    const { older, answers } = olderReader()
    const { result } = draw({ current: JULY, older })
    await act(async () => {
      answers[0]!.reject(new Error('E-STATS-READ-FAILED'))
      await answers[0]!.promise.catch(() => {})
    })
    expect(result.current.state).toEqual({ kind: 'failed', retrying: false })
  })

  it('AC-1804.3: retry는 같은 기간을 다시 읽고 그동안 failed · retrying(단추 막힘)이며, 성공하면 ready(카드가 없어진다)', async () => {
    const { older, read, answers } = olderReader()
    const { result } = draw({ current: JULY, older })
    await settle(answers[0]!, null)
    act(() => result.current.retry())
    expect(result.current.state).toEqual({ kind: 'failed', retrying: true })
    expect(read).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenLastCalledWith(JULY)
    act(() => result.current.retry()) // 다시 읽는 중에는 더 읽지 않는다
    expect(read).toHaveBeenCalledTimes(2)
    const rows = [day('2026-07-10')]
    await settle(answers[1]!, rows)
    expect(result.current.state).toEqual({ kind: 'ready', days: [...rows, ...HELD] })
  })

  it('AC-1804.3: 다시 읽기도 실패하면 failed(다시 읽는 중 아님)로 돌아온다', async () => {
    const { older, answers } = olderReader()
    const { result } = draw({ current: JULY, older })
    await settle(answers[0]!, null)
    act(() => result.current.retry())
    await settle(answers[1]!, null)
    expect(result.current.state).toEqual({ kind: 'failed', retrying: false })
  })

  it('AC-1804.3: 실패가 아닐 때(읽는 중·ready·손에 든 기간) retry는 아무것도 읽지 않는다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    act(() => result.current.retry())
    expect(read).toHaveBeenCalledTimes(1)
    await settle(answers[0]!, [day('2026-07-10')])
    act(() => result.current.retry())
    rerender({ current: AUGUST, older })
    act(() => result.current.retry())
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('AC-1804.3: 다시 읽는 중에 다른 기간을 고르면 그 답은 버린다', async () => {
    const { older, read, answers } = olderReader()
    const { result, rerender } = draw({ current: JULY, older })
    await settle(answers[0]!, null)
    act(() => result.current.retry())
    rerender({ current: JUNE, older })
    expect(read).toHaveBeenCalledTimes(3)
    expect(result.current.state).toEqual({ kind: 'reading' })
    await settle(answers[1]!, [day('2026-07-10')])
    expect(result.current.state).toEqual({ kind: 'reading' })
  })
})
