// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome } from '@/components/dashboard/briefing/DashboardHome'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import { DashboardSkeleton } from '@/components/dashboard/live/DashboardSkeleton'
import { LOOKBACK_DAYS, readBitDays, type ReadResult } from '@/components/dashboard/live/readBitDays'
import { readDashboardGroups, type DashboardGroups } from '@/components/dashboard/live/rxGroups'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { readDays, StorageError } from '@/lib/storage/stats'
import type { DayPayload } from '@/types/payload'
import { DashboardAnalysis } from './DashboardAnalysis'
import { LiveDashboard, SAVED_READ_TIMEOUT_MS } from './LiveDashboard'
import type { SummarySource } from './source'

// 대시보드가 저장 숫자를 먼저 읽어 BitDashboard에 넘김 (bit-dashboard AC-601.14·AC-601.19, stats AC-516.1·AC-516.3, design.md '### 화면').
// 통계 탭 묶음도 여기서 한 번 읽어 넘긴다(AC-606.8·AC-606.5, design.md '처방 상위 = 통계 탭 묶음').
// 저장 숫자 읽기(readDays)·묶음 읽기(readDashboardGroups)·비트 읽기(readBitDays)는 잡아 두고 답을 시험이 정한다. 진짜 Supabase·확장에 붙지 않는다.
// 가짜 DayPayload·묶음은 이 시험 파일 안에서만 만든다(AC-312.3)
// dashboard-ux REQ-2701: 저장 숫자를 읽는 동안은 뼈대(연결 전 화면이 아니다), 저장 숫자가 오면 묶음을 기다리지 않고 바로 그린다(처방 상위만 '묶음을 읽는 중')
vi.mock('@/lib/storage/stats', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/stats')>()
  return { ...real, readDays: vi.fn() }
})
vi.mock('@/components/dashboard/live/rxGroups', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/dashboard/live/rxGroups')>()
  return { ...real, readDashboardGroups: vi.fn() }
})
vi.mock('@/components/dashboard/live/readBitDays', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/dashboard/live/readBitDays')>()
  return { ...real, readBitDays: vi.fn() }
})
vi.mock('@/workers/statsClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/workers/statsClient')>()
  return { ...real, createStatsWorker: vi.fn() }
})

type SavedResult = Awaited<ReturnType<typeof readDays>>

const TODAY = '2026-11-02' // 월요일
const RANGE = { from: '2026-07-25', to: TODAY } // 오늘 − 100일(LOOKBACK_DAYS) ~ 오늘
const NONE: SummarySource = { kind: 'none' }

const day = (ymd: string, newPatients: number, returning: number, partial = false): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial,
  totals: { patients: newPatients + returning, newPatients, returning, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: newPatients, within7: 0, within14: 0 },
})
// 저장 숫자(오늘 5명) · 비트 숫자(오늘 64명)
const SAVED_ROWS = [day('2026-10-26', 7, 60), day(TODAY, 2, 3, true)]
const BIT_DAYS = [day('2026-10-26', 7, 60), day(TODAY, 9, 55, true)]
const SAVED_H1 = '오늘 지금까지 환자 5명이 왔습니다.'
const BIT_H1 = '오늘 지금까지 환자 64명이 왔습니다.'
const CONNECT_H1 = '비트 PC를 연결하면 오늘 숫자가 여기에 채워져요'
const READ_H1 = '비트에서 오늘 숫자를 읽고 있어요'
const READ_FAILED = errorInfo('E-STATS-READ-FAILED')
const HEADER_H1 = '대시보드' // 숫자가 있는 화면 머리 줄의 h1(dashboard-ux AC-2701.3)
const SKELETON_STATUS = '대시보드 숫자를 불러오고 있어요' // AC-2701.1
const GROUPS_PENDING = '묶음을 읽는 중' // AC-2701.2

// 통계 탭 묶음 둘(가짜 이름·열쇠·코드). 일 줄 groups[].id가 묶음 열쇠다(AC-606.1)
const NO_GROUPS: DashboardGroups = { lines: [], defs: [] }
const GROUPS: DashboardGroups = {
  lines: [
    { name: '운동치료', key: 'key-exercise' },
    { name: '체외충격파', key: 'key-shock' },
  ],
  defs: [
    { id: 'key-exercise', codes: ['MM301'] },
    { id: 'key-shock', codes: ['MM302', 'MM303'] },
  ],
}
const keyed = (d: DayPayload, exercise: number, shock: number): DayPayload => ({
  ...d,
  groups: [
    { id: 'key-exercise', patients: exercise, newPatients: 0, returning: exercise },
    { id: 'key-shock', patients: shock, newPatients: 0, returning: shock },
  ],
})
// 묶음 열쇠 줄을 실은 저장 숫자(오늘 5명)·비트 숫자(오늘 64명). 기간(지난 30일) 안 날은 10월 26일 하루다
const SAVED_KEYED = [keyed(day('2026-10-26', 7, 60), 12, 5), keyed(day(TODAY, 2, 3, true), 1, 1)]
const BIT_KEYED = [keyed(day('2026-10-26', 7, 60), 4, 20), keyed(day(TODAY, 9, 55, true), 2, 2)]
const SAVED_RANK = [
  ['운동치료', '12건'],
  ['체외충격파', '5건'],
]
const BIT_RANK = [
  ['체외충격파', '20건'],
  ['운동치료', '4건'],
]
const GROUPS_UNREAD = '통계 탭 묶음을 읽지 못했어요. 화면을 새로 열면 다시 읽어요.' // AC-606.5

// ── 잡아 둔 저장 숫자 읽기: 화면이 부른 차례대로 쌓이고, 시험이 답을 준다 ──
type SavedRead = { range: Parameters<typeof readDays>[0]; resolve(result: SavedResult): void; reject(error: unknown): void }
const savedReads: SavedRead[] = []
const rowsOf = (rows: readonly DayPayload[], at: string | null = null): SavedResult => ({
  rows: [...rows],
  dropped: 0,
  latest: at === null ? null : { at, source: 'bit' },
  fromFile: false,
})
const savedAnswer = (rows: readonly DayPayload[], i = savedReads.length - 1, at: string | null = null) =>
  act(async () => {
    savedReads[i]!.resolve(rowsOf(rows, at))
  })
const savedFail = (i = savedReads.length - 1, error: unknown = new StorageError('E-STATS-READ-FAILED')) =>
  act(async () => {
    savedReads[i]!.reject(error)
  })

// ── 잡아 둔 묶음 읽기: 시험이 holdGroups()로 잡지 않으면 바로 '묶음 없음'으로 끝난다 ──
type GroupRead = { resolve(result: DashboardGroups | null): void; reject(error: unknown): void }
const groupReads: GroupRead[] = []
const holdGroups = () =>
  vi.mocked(readDashboardGroups).mockImplementation(
    () =>
      new Promise<DashboardGroups | null>((resolve, reject) => {
        groupReads.push({ resolve, reject })
      }),
  )
const groupAnswer = (result: DashboardGroups | null, i = groupReads.length - 1) =>
  act(async () => {
    groupReads[i]!.resolve(result)
  })
const groupThrow = (i = groupReads.length - 1) =>
  act(async () => {
    groupReads[i]!.reject(new Error('묶음 읽기 실패'))
  })

// ── 잡아 둔 비트 읽기 ──
type BitRead = { deps: Parameters<typeof readBitDays>[0]; resolve(result: ReadResult): void }
const bitReads: BitRead[] = []
const bitAnswer = (result: ReadResult, i = bitReads.length - 1) =>
  act(async () => {
    bitReads[i]!.resolve(result)
  })
const bitDays = (list: readonly DayPayload[] = BIT_DAYS): ReadResult => ({ kind: 'days', days: [...list] })

const onBitPc = () => vi.stubGlobal('chrome', { runtime: { connect: vi.fn() } })
const notBitPc = () => vi.stubGlobal('chrome', undefined)
const draw = () => render(<LiveDashboard today={TODAY} />)
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

// ── 화면 읽기 도우미 ──
// 큰 문장 h1(연결 전·읽는 중·보고 문장). 숫자가 있으면 머리 줄 h1 "대시보드"가 더 있어 빼고 본다(AC-2701.3)
const h1 = () => {
  const found = screen.getAllByRole('heading', { level: 1 }).filter((heading) => heading.textContent !== HEADER_H1)
  expect(found).toHaveLength(1)
  return found[0]!
}
// 머리 줄: h1 "대시보드"를 감싼 칸(AC-2701.3)
const header = () => screen.getByRole('heading', { level: 1, name: HEADER_H1 }).parentElement as HTMLElement
// 저장 숫자를 읽는 동안의 뼈대(AC-2701.1): 화면 읽기 글 하나 · h1·연결 전 화면·BitDashboard가 없다
const expectSkeleton = () => {
  expect(screen.getByRole('status').textContent).toBe(SKELETON_STATUS)
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  expect(screen.queryByText(CONNECT_H1)).toBeNull()
  expect(screen.queryByRole('link', { name: '비트 PC 연결 시작' })).toBeNull()
  expect(screen.queryByRole('region', { name: '오늘 브리핑' })).toBeNull()
}
const savedCard = () => screen.queryByText(READ_FAILED.what)?.closest('[role="alert"]') ?? null
// 카드와 그 아래 단추를 감싼 칸
const savedCardBox = () => savedCard()!.parentElement as HTMLElement
const retryButton = () => within(savedCardBox()).getByRole('button')
// '처방 상위' 칸과 그 순위 막대 줄([이름, 값])
const rankChart = () => screen.getByRole('group', { name: '처방 상위' })
const rankRows = () =>
  Array.from(rankChart().querySelectorAll('ol[aria-label="처방 상위"] > li')).map((li) => [li.children[0]!.textContent, li.children[2]!.textContent])
const expectGroupsUnread = () => {
  expect(within(rankChart()).getByText(GROUPS_UNREAD)).toBeTruthy()
  expect(rankChart().querySelector('ol[aria-label]')).toBeNull() // 숫자를 지어내지 않는다
}
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
// useId 값은 그린 차례마다 달라 빼고 견준다
const withoutIds = (html: string) => html.replace(/\s(?:id|for|aria-labelledby|aria-describedby|aria-controls)="[^"]*"/g, '')
const markupOf = (node: React.ReactElement) => {
  const { container, unmount } = render(node)
  const html = withoutIds(container.innerHTML)
  unmount()
  return html
}
const BEFORE_CONNECT = <DashboardHome today={TODAY} report={null} analysis={<DashboardAnalysis today={TODAY} source={NONE} />} />

beforeEach(() => {
  savedReads.length = 0
  groupReads.length = 0
  bitReads.length = 0
  vi.mocked(readDashboardGroups).mockReset()
  vi.mocked(readDashboardGroups).mockResolvedValue(NO_GROUPS)
  vi.mocked(readDays).mockReset()
  vi.mocked(readDays).mockImplementation(
    (range) =>
      new Promise<SavedResult>((resolve, reject) => {
        savedReads.push({ range, resolve, reject })
      }),
  )
  vi.mocked(readBitDays).mockReset()
  vi.mocked(readBitDays).mockImplementation(
    (deps) =>
      new Promise<ReadResult>((resolve) => {
        bitReads.push({ deps, resolve })
      }),
  )
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-02T06:42:00Z')) // 한국 오후 3시 42분
  // 쓰면 안 되는 길: 불리면 시험이 잡는다
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-601.14·AC-516.1: 저장 숫자를 한 번 읽어 처음 자료로 넘긴다', () => {
  it('AC-2701.1·AC-601.14·AC-516.1: 서버 그림은 저장 숫자를 읽기 전이라 뼈대(DashboardSkeleton)다 — 연결 전 화면이 아니고, 저장 숫자도 비트도 읽지 않는다', () => {
    onBitPc()
    const html = renderToStaticMarkup(<LiveDashboard today={TODAY} />)
    expect(html).toBe(renderToStaticMarkup(<DashboardSkeleton />))
    expect(html).not.toContain(CONNECT_H1)
    expect(html).not.toBe(renderToStaticMarkup(BEFORE_CONNECT))
    expect(readDays).not.toHaveBeenCalled()
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-601.14·AC-516.1: 브라우저에 붙으면 저장 숫자(오늘 − LOOKBACK_DAYS ~ 오늘)를 readDays로 한 번 읽는다', () => {
    notBitPc()
    draw()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readDays).toHaveBeenCalledWith({ from: addDays(TODAY, -LOOKBACK_DAYS), to: TODAY })
    expect(savedReads[0]!.range).toEqual(RANGE)
  })

  it('AC-601.14: 서버 그림 위에 붙을 때 어긋나지 않고, 붙은 뒤에 한 번 읽는다', async () => {
    onBitPc()
    const container = document.createElement('div')
    document.body.append(container)
    container.innerHTML = renderToString(<LiveDashboard today={TODAY} />)
    const recoverable = vi.fn()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root!: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(container, <LiveDashboard today={TODAY} />, { onRecoverableError: recoverable })
    })
    expect(recoverable).not.toHaveBeenCalled()
    expect(logged).not.toHaveBeenCalled()
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readBitDays).not.toHaveBeenCalled()
    logged.mockRestore()
    await act(async () => root.unmount())
    container.remove()
  })

  it('AC-2701.1: 저장 숫자를 읽는 동안은 뼈대와 "대시보드 숫자를 불러오고 있어요"이고 연결 전 화면·BitDashboard를 그리지 않는다 — 비트 PC에서도 비트 읽기가 아직 없다', () => {
    onBitPc()
    const { container } = draw()
    expect(readBitDays).not.toHaveBeenCalled()
    expectSkeleton()
    expect(screen.queryByText(READ_H1)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<DashboardSkeleton />))
  })

  it('AC-601.14·AC-516.1: 줄이 있으면 { kind: "data", days }를 처음 자료로 넘긴다 — 비트 PC가 아니면 저장 숫자만 그린다', async () => {
    notBitPc()
    const { container } = draw()
    await savedAnswer(SAVED_ROWS)
    expect(h1().textContent).toBe(SAVED_H1)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} />))
  })

  it('AC-601.14: 비트 PC면 저장 숫자 읽기가 끝난 뒤에야 비트를 읽고, 저장 숫자를 둔 채 "다시 읽는 중"이다', async () => {
    onBitPc()
    draw()
    expect(readBitDays).not.toHaveBeenCalled()
    await savedAnswer(SAVED_ROWS)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.today).toBe(TODAY)
    expect(h1().textContent).toBe(SAVED_H1)
    expect(screen.getByRole('button', { name: '다시 읽는 중' })).toBeTruthy()
    await bitAnswer(bitDays())
    expect(h1().textContent).toBe(BIT_H1)
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-2701.3: 저장 숫자의 마지막 저장 시각(latest.at)을 머리 줄에 넘긴다 — 저장 숫자만이면 "서버에 저장된 숫자"·서버 저장 시각, 비트에서 읽으면 "비트에서 읽은 숫자"·비트 시각만이다', async () => {
    onBitPc()
    draw()
    await savedAnswer(SAVED_ROWS, 0, '2026-11-02T03:05:00.000+00:00') // 한국 낮 12시 5분
    expect(within(header()).getByText('서버에 마지막으로 저장된 시각 11월 2일 오후 12:05 · 날짜마다 저장된 때가 달라요')).toBeTruthy()
    expect(within(header()).getByText('비트에서 다시 읽는 중')).toBeTruthy()
    await bitAnswer(bitDays())
    expect(within(header()).getByText('비트에서 읽은 숫자')).toBeTruthy()
    expect(within(header()).getByText('비트에서 읽은 시각 오늘 오후 3:42')).toBeTruthy()
    expect(header().textContent).not.toContain('서버에 마지막으로 저장된 시각')
    expect(document.body.textContent).not.toMatch(/연결됨/)
  })

  it('AC-601.14·AC-516.1: 줄이 없으면 { kind: "none" } — 연결 전 모양이고 오류 카드가 없다', async () => {
    notBitPc()
    const { container } = draw()
    await savedAnswer([])
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={NONE} />))
  })

  it('AC-601.14: 읽는 동안 화면을 떠나도 오류 없이 끝난다', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = draw()
    unmount()
    await savedAnswer(SAVED_ROWS)
    await wait(SAVED_READ_TIMEOUT_MS)
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('AC-601.19: 저장 숫자 읽기 실패·10초 한도', () => {
  it('AC-601.19: 한도는 10초다', () => {
    expect(SAVED_READ_TIMEOUT_MS).toBe(10_000)
  })

  it('AC-601.19: 실패하면 BitDashboard를 저장 숫자 없이 그려 비트 읽기를 막지 않고, 그 위에 오류 카드(통계 탭과 같은 글)와 카드 아래 [다시 읽기]를 둔다', async () => {
    onBitPc()
    const failure = new StorageError('E-STATS-READ-FAILED')
    failure.message = '서버 답 비밀 글자'
    const { container } = draw()
    await savedFail(0, failure)
    // 비트 읽기는 그대로 시작된다(저장 숫자 없이 처음 읽는 중)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(h1().textContent).toBe(READ_H1)
    // 카드: 무엇이 · 어떻게 고치나 · 번호 (새 번호 없음). 원래 오류 글은 보이지 않는다
    const card = savedCard()!
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(READ_FAILED.fix)).toBeTruthy()
    expect(within(card as HTMLElement).getByText('오류 번호 E-STATS-READ-FAILED')).toBeTruthy()
    expect(container.textContent).not.toContain('서버 답 비밀 글자')
    // 카드 → [다시 읽기] → 대시보드(날짜 줄·큰 문장)
    const retry = retryButton()
    expect(retry.textContent).toBe('다시 읽기')
    expect((retry as HTMLButtonElement).disabled).toBe(false)
    expect((retry.getAttribute('class') ?? '').split(/\s+/)).toEqual(expect.arrayContaining(ds.button.secondarySmall.split(/\s+/).filter(Boolean)))
    expectOrder(card, retry, screen.getByRole('region', { name: '오늘 브리핑' }), h1())
  })

  it('AC-601.19: 비트 PC가 아니어도 실패하면 연결 전 모양 위에 같은 카드다', async () => {
    notBitPc()
    draw()
    await savedFail()
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).not.toBeNull()
    expect(readBitDays).not.toHaveBeenCalled()
  })

  it('AC-601.19·AC-2701.1: 10초 안에 끝나지 않으면 실패로 그린다 — 그 전까지는 뼈대이고 비트 읽기도 기다린다', async () => {
    onBitPc()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expectSkeleton()
    expect(readBitDays).not.toHaveBeenCalled()
    expect(savedCard()).toBeNull()
    await wait(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(h1().textContent).toBe(READ_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 한도 뒤에 늦게 온 첫 읽기의 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS)
    await savedAnswer(SAVED_ROWS, 0)
    expect(h1().textContent).toBe(CONNECT_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: [다시 읽기]는 저장 숫자 읽기만 같은 범위로 다시 하고, 그동안 "다시 읽는 중"으로 막힌다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedReads[1]!.range).toEqual(RANGE)
    expect(readBitDays).toHaveBeenCalledTimes(1) // 비트 읽기는 다시 하지 않는다
    expect(bitReads[0]!.deps.signal?.aborted).toBe(false)
    const busy = retryButton() as HTMLButtonElement
    expect(busy.textContent).toBe('다시 읽는 중')
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-2701.5: 같은 틱에 [다시 읽기]를 두 번 눌러도 저장 숫자 읽기는 하나다 — 그동안 "다시 읽는 중"(막힘)이고, 성공하면 카드가 없어지며 머리 줄에 받은 저장 시각이 나온다', async () => {
    notBitPc()
    draw()
    await savedFail()
    const retry = retryButton() as HTMLButtonElement
    act(() => {
      retry.click()
      retry.click()
    })
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(retryButton().textContent).toBe('다시 읽는 중')
    expect((retryButton() as HTMLButtonElement).disabled).toBe(true)
    await savedAnswer(SAVED_ROWS, 1, '2026-11-02T03:05:00.000+00:00')
    expect(savedCard()).toBeNull()
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(within(header()).getByText('서버에 마지막으로 저장된 시각 11월 2일 오후 12:05 · 날짜마다 저장된 때가 달라요')).toBeTruthy()
  })

  it('AC-2701.6: [다시 읽기]의 답이 날짜가 바뀐 뒤에 오면 쓰지 않고, 화면을 떠난 뒤에 와도 오류 없이 끝난다', async () => {
    notBitPc()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender, unmount } = draw()
    await savedFail()
    fireEvent.click(retryButton()) // [1] 11월 2일 범위 다시 읽기
    rerender(<LiveDashboard today="2026-11-03" />) // [2] 날짜가 바뀌어 새 범위로 읽기
    expect(readDays).toHaveBeenCalledTimes(3)
    await savedFail(2)
    await savedAnswer(SAVED_ROWS, 1) // 바뀌기 전 날짜의 늦은 답
    expect(savedCard()).not.toBeNull()
    expect(screen.queryByRole('group', { name: '날짜 고르기' })).toBeNull()
    expect(retryButton().textContent).toBe('다시 읽기')
    fireEvent.click(retryButton()) // [3]
    unmount()
    await savedAnswer(SAVED_ROWS, 3)
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })

  it('AC-601.19: 다시 실패하면 카드가 그대로고 [다시 읽기]가 돌아온다', async () => {
    notBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedFail()
    expect(savedCard()).not.toBeNull()
    expect(retryButton().textContent).toBe('다시 읽기')
    expect((retryButton() as HTMLButtonElement).disabled).toBe(false)
    expect(h1().textContent).toBe(CONNECT_H1)
  })

  it('AC-601.19: 다시 읽기도 같은 10초 한도다 — 넘으면 카드가 그대로고, 늦게 온 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(retryButton().textContent).toBe('다시 읽는 중')
    await wait(1)
    expect(retryButton().textContent).toBe('다시 읽기')
    expect(savedCard()).not.toBeNull()
    await savedAnswer(SAVED_ROWS, 1)
    expect(savedCard()).not.toBeNull()
    expect(h1().textContent).toBe(CONNECT_H1)
  })

  it('AC-601.19: 다시 읽기가 data로 성공하면 카드가 없어지고 BitDashboard가 그 숫자로 새로 그려진다(비트 읽기는 처음부터 다시)', async () => {
    onBitPc()
    draw()
    await savedFail()
    expect(h1().textContent).toBe(READ_H1)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(SAVED_H1)
    expect(bitReads[0]!.deps.signal?.aborted).toBe(true)
    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '다시 읽는 중' })).toBeTruthy()
  })

  it('AC-601.19: 비트 PC가 아니면 다시 읽기로 받은 저장 숫자만 그린다', async () => {
    notBitPc()
    const { container } = draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} />))
  })

  it('AC-601.19: 다시 읽기가 성공했는데 줄이 없으면 카드만 없어지고 BitDashboard를 다시 놓지 않는다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedAnswer([])
    expect(savedCard()).toBeNull()
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.signal?.aborted).toBe(false)
    expect(h1().textContent).toBe(READ_H1)
  })

  it.each<[string, readonly DayPayload[]]>([
    ['일 숫자', BIT_DAYS],
    ['빈 배열', []],
  ])('AC-601.19: 비트 숫자가 오면(%s) 카드가 없어진다', async (_name, list) => {
    onBitPc()
    draw()
    await savedFail()
    await bitAnswer(bitDays(list))
    expect(savedCard()).toBeNull()
    expect(screen.queryByText('오류 번호 E-STATS-READ-FAILED')).toBeNull()
  })

  it('AC-601.19: 비트 읽기가 days 없이 끝나면(실패·not-ready) 카드는 그대로다', async () => {
    onBitPc()
    draw()
    await savedFail()
    await bitAnswer({ kind: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(savedCard()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 확인' }))
    await bitAnswer({ kind: 'not-ready' })
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 비트 숫자가 온 뒤에 끝난 저장 숫자 다시 읽기의 답은 쓰지 않는다 — 성공이어도 실패여도', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    fireEvent.click(screen.getByRole('button', { name: '다시 읽는 중' })) // 막혀 있다
    await bitAnswer(bitDays())
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(BIT_H1)
    await savedAnswer(SAVED_ROWS, 1)
    expect(h1().textContent).toBe(BIT_H1)
    expect(savedCard()).toBeNull()
    expect(readBitDays).toHaveBeenCalledTimes(1)
  })

  it('AC-601.19: 비트 숫자가 온 뒤에 실패한 다시 읽기도 카드를 다시 보이지 않는다', async () => {
    onBitPc()
    draw()
    await savedFail()
    fireEvent.click(retryButton())
    await bitAnswer(bitDays())
    await savedFail(1)
    expect(savedCard()).toBeNull()
    expect(h1().textContent).toBe(BIT_H1)
  })
})

describe('AC-606.8·AC-606.1: 통계 탭 묶음을 저장 숫자 읽기와 함께 한 번 읽는다', () => {
  it('AC-606.8: 서버 그림에서는 묶음을 읽지 않고, 브라우저에 붙으면 readDashboardGroups로 저장 숫자 읽기와 함께 한 번 읽는다', () => {
    onBitPc()
    renderToStaticMarkup(<LiveDashboard today={TODAY} />)
    expect(readDashboardGroups).not.toHaveBeenCalled()
    draw()
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-2701.2·AC-606.7: 저장 숫자가 먼저 오면 묶음을 기다리지 않고 바로 그린다(처방 상위만 "묶음을 읽는 중") — 비트 읽기는 묶음이 온 뒤 그 정의를 싣고 한 번 시작하고, 묶음이 와도 화면을 새로 놓지 않는다(고른 날 유지)', async () => {
    onBitPc()
    holdGroups()
    draw()
    await savedAnswer(SAVED_KEYED)
    // 숫자 칸·다른 그래프는 저장 숫자로 바로 그린다
    expect(h1().textContent).toBe(SAVED_H1)
    expect(screen.getByRole('region', { name: '오늘 하루 분석' }).children[1]!.children[0]!.textContent).toBe('오늘 환자 수5명')
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수']) expect(screen.getByRole('group', { name })).toBeTruthy()
    expect(within(rankChart()).getByRole('status').textContent).toBe(GROUPS_PENDING)
    expect(rankChart().querySelector('ol[aria-label]')).toBeNull()
    // 비트 읽기는 묶음 정의가 올 때까지 기다린다(AC-606.7)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '다시 읽는 중' })).toBeNull()

    // 지난 날을 고른 채로 묶음이 온다 → 다시 놓지 않아 고른 날·숫자가 그대로이고 처방 상위만 바뀐다
    fireEvent.click(within(screen.getByRole('group', { name: '날짜 고르기' })).getByRole('button', { name: '이전 날' }))
    const picked = h1().textContent
    expect(picked).not.toBe(SAVED_H1)
    const briefing = screen.getByRole('region', { name: '오늘 브리핑' })
    await groupAnswer(GROUPS)
    expect(screen.getByRole('region', { name: '오늘 브리핑' })).toBe(briefing)
    expect(h1().textContent).toBe(picked)
    expect(within(rankChart()).queryByRole('status')).toBeNull()
    expect(rankRows()).toEqual(SAVED_RANK)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.groups).toEqual(GROUPS.defs)
    expect(screen.getByRole('button', { name: '다시 읽는 중' })).toBeTruthy()
  })

  it('AC-606.8·AC-2701.1: 묶음이 먼저 와도 저장 숫자 읽기가 끝나기 전에는 뼈대다', async () => {
    onBitPc()
    holdGroups()
    draw()
    await groupAnswer(GROUPS)
    expect(readBitDays).not.toHaveBeenCalled()
    expectSkeleton()
    await savedAnswer(SAVED_KEYED)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(h1().textContent).toBe(SAVED_H1)
  })

  it('AC-606.8·AC-601.19·AC-2701.1: 두 읽기 모두 10초 안에 끝나지 않으면 한도에서 저장 숫자·묶음 없이 오류 카드와 함께 그린다 — 그 전까지는 뼈대다', async () => {
    onBitPc()
    holdGroups()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(readBitDays).not.toHaveBeenCalled()
    expectSkeleton()
    await wait(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.groups).toEqual([])
    expect(h1().textContent).toBe(READ_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-606.1·AC-606.8: 저장 숫자로 먼저 그릴 때 처방 상위는 묶음 이름·기간 안 열쇠 줄 건수이고, 비트 숫자가 오면 같은 묶음으로 다시 센다', async () => {
    onBitPc()
    vi.mocked(readDashboardGroups).mockResolvedValue(GROUPS)
    draw()
    await savedAnswer(SAVED_KEYED)
    expect(h1().textContent).toBe(SAVED_H1)
    expect(rankRows()).toEqual(SAVED_RANK)
    await bitAnswer(bitDays(BIT_KEYED))
    expect(h1().textContent).toBe(BIT_H1)
    expect(rankRows()).toEqual(BIT_RANK)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('AC-606.1·AC-606.8: 비트 PC가 아니면 저장 숫자와 묶음으로만 그린다', async () => {
    notBitPc()
    vi.mocked(readDashboardGroups).mockResolvedValue(GROUPS)
    draw()
    await savedAnswer(SAVED_KEYED)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(rankRows()).toEqual(SAVED_RANK)
  })

  it('AC-606.8·AC-606.5: 묶음은 열 때 한 번만 읽는다 — [다시 읽기]로 BitDashboard가 다시 놓여도, 연 채 날짜가 바뀌어 저장 숫자를 다시 읽어도 처음 값을 그대로 둔다', async () => {
    onBitPc()
    holdGroups()
    const { rerender } = draw()
    await groupAnswer(GROUPS)
    await savedFail()
    expect(bitReads[0]!.deps.groups).toEqual(GROUPS.defs)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_KEYED)
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    // 새로 놓인 BitDashboard도 같은 묶음으로 그리고 읽는다
    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(bitReads[1]!.deps.groups).toEqual(GROUPS.defs)
    expect(rankRows()).toEqual(SAVED_RANK)
    rerender(<LiveDashboard today="2026-11-03" />)
    expect(readDays).toHaveBeenCalledTimes(3)
    await savedAnswer(SAVED_KEYED)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    expect(rankRows().map(([name]) => name)).toEqual(['운동치료', '체외충격파'])
  })

  it('AC-606.8: 묶음을 읽는 동안 화면을 떠나도 오류 없이 끝나고, 늦게 온 답은 쓰지 않는다', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    holdGroups()
    const { unmount } = draw()
    unmount()
    await groupAnswer(GROUPS)
    await savedAnswer(SAVED_KEYED)
    await wait(SAVED_READ_TIMEOUT_MS)
    expect(logged).not.toHaveBeenCalled()
    logged.mockRestore()
  })
})

describe('AC-606.5: 묶음 읽기 실패·10초 한도', () => {
  it.each<[string, () => Promise<void>]>([
    ['null로 끝남', () => groupAnswer(null)],
    ['던짐', () => groupThrow()],
  ])(
    'AC-606.5: 묶음 읽기가 실패하면(%s) 처방 상위 칸에 "통계 탭 묶음을 읽지 못했어요…" — 보고 문장·다른 그래프·비트 읽기(묶음 없이)는 그대로이고 오류 카드는 없다',
    async (_name, settle) => {
      onBitPc()
      holdGroups()
      draw()
      await savedAnswer(SAVED_KEYED)
      await settle()
      expect(h1().textContent).toBe(SAVED_H1)
      expectGroupsUnread()
      for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수']) expect(screen.getByRole('group', { name })).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(readBitDays).toHaveBeenCalledTimes(1)
      expect(bitReads[0]!.deps.groups).toEqual([])
      await bitAnswer(bitDays(BIT_KEYED))
      expect(h1().textContent).toBe(BIT_H1)
      expectGroupsUnread()
      expect(screen.queryByRole('alert')).toBeNull()
    },
  )

  it('AC-606.5·AC-2701.2: 묶음 읽기가 10초 안에 끝나지 않으면 읽지 못함(null)으로 그린다 — 그 전까지는 저장 숫자로 그린 채 처방 상위만 "묶음을 읽는 중"이고 비트 읽기는 기다리며, 늦게 온 답은 쓰지 않는다', async () => {
    onBitPc()
    holdGroups()
    draw()
    await savedAnswer(SAVED_KEYED)
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(h1().textContent).toBe(SAVED_H1)
    expect(within(rankChart()).getByRole('status').textContent).toBe(GROUPS_PENDING)
    await wait(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.groups).toEqual([])
    expect(h1().textContent).toBe(SAVED_H1)
    expectGroupsUnread()
    await groupAnswer(GROUPS, 0)
    expectGroupsUnread()
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
  })

  it('AC-606.5: [다시 읽기]는 지금처럼 저장 숫자만 다시 읽는다 — 읽지 못한 묶음은 다시 읽지 않고 그대로 "읽지 못했어요"다', async () => {
    notBitPc()
    holdGroups()
    draw()
    await savedFail()
    await groupAnswer(null)
    expect(savedCard()).not.toBeNull()
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_KEYED)
    expect(savedCard()).toBeNull()
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    expectGroupsUnread()
  })
})

describe('AC-601.14·AC-516.3: 저장 숫자를 읽는 곳은 한 곳이다', () => {
  const ROOT = process.cwd()
  const read = (file: string) => readFileSync(file, 'utf8')
  // 주석을 뺀 코드
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const appFiles = (dir: string) =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(dir, f).replace(/\\/g, '/')) // 윈도우의 '\'도 '/'로 견준다
  const isClient = (file: string) => /^\s*['"]use client['"]/.test(read(join(ROOT, file)))
  const LIVE = 'src/components/dashboard/summary/LiveDashboard.tsx'

  it("AC-601.14·AC-516.3: 저장 숫자를 읽는 코드는 summary/LiveDashboard.tsx('use client') 하나다 — BitDashboard·브리핑·분석·페이지는 통계 저장을 부르지 않는다", () => {
    const files = [...appFiles('src/components/dashboard'), ...appFiles('src/app/(app)/dashboard')]
    expect(files).toContain(LIVE)
    expect(files).toContain('src/components/dashboard/live/BitDashboard.tsx')
    // 값으로 불러오거나 부르는 곳만 센다(source.ts의 `import type`·`typeof readDays`는 모양만 빌린다)
    const reads = /^import\s+(?!type\b)[^;]*from\s+['"]@\/lib\/storage\/stats['"]|\breadDays\s*\(|stats_days/m
    const readers = files.filter((f) => reads.test(code(read(join(ROOT, f)))))
    expect(readers).toEqual([LIVE])
    expect(isClient(LIVE)).toBe(true)
  })

  it("AC-516.3: 브리핑 폴더의 'use client'는 지금처럼 폰 아래 단추 파일 하나뿐이다", () => {
    const clients = appFiles('src/components/dashboard/briefing').filter(isClient)
    expect(clients).toEqual(['src/components/dashboard/briefing/StickyConnect.tsx'])
  })

  it('AC-601.14: 연결 전·뒤 모양은 BitDashboard가 고른다 — LiveDashboard는 BitDashboard를 놓고 보고 문장·날짜 고르기·연결 판정을 스스로 하지 않는다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).toMatch(/<BitDashboard\b[^>]*\bkey=/)
    expect(text).toMatch(/toSummarySource\(/)
    // 한도 범위(LOOKBACK_DAYS)는 readBitDays.ts의 상수를 빌리지만 비트 읽기는 부르지 않는다
    expect(text).not.toMatch(/ReportBlock|DateControl|isConnected|\breadBitDays\b(?!['"])|chrome/)
  })

  it('AC-601.14: 저장 숫자 읽기는 비트 숫자를 보내지 않는다 — LiveDashboard에 저장·서버 요청·브라우저 저장소가 없다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).not.toMatch(/saveStats|\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|lib\/supabase/)
  })

  it('AC-606.8: 묶음은 받아 오기만 한다 — LiveDashboard는 readDashboardGroups 하나로 읽고, 묶음 표·저장·제안 묶음을 직접 다루지 않는다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).toMatch(/\breadDashboardGroups\b/)
    expect(text).not.toMatch(/listStatsRxGroups|saveStatsRxGroups|stats_rx_groups|storage\/statsRxGroups|toDashboardGroups|suggest/i)
  })

  it('AC-1804.4: 옛 기간 읽기(older)도 여기 한 곳이 만들어 BitDashboard에 넘긴다 — 읽기는 같은 한도의 readDays 하나이고 새 표·RPC·서버 요청이 없다', () => {
    const text = code(read(join(ROOT, LIVE)))
    expect(text).toMatch(/<BitDashboard\b[^>]*\bolder=\{/)
    expect(text).toMatch(/withinLimit\(\(\) => readDays\(range\)\)/)
    expect(text).not.toMatch(/\.rpc\(|\.from\(['"]|saveStats|\bfetch\s*\(/)
  })
})

// 대시보드 기간 고르기의 옛 기간 읽기 (dashboard-period REQ-1804·REQ-1805, design.md '데이터 흐름 (읽기)').
// 오늘 11월 2일, 손에 든 숫자의 첫날(오늘 − LOOKBACK_DAYS)은 7월 25일. 저장 숫자·비트 숫자 모두 오늘이 덜 끝나 [일별]은 2026년 10월이고 ◀ 세 번이 7월이다
describe('dashboard-period: 옛 기간은 LiveDashboard가 만든 older(readDays · 10초 한도)로 읽는다', () => {
  const JULY = { from: '2026-07-01', to: '2026-07-31' }
  const flowRegion = () => screen.getByRole('region', { name: '기간별 흐름' })
  const picker = () => within(flowRegion()).getByRole('group', { name: '기간 골라 보기' })
  const unit = (name: string) => within(within(picker()).getAllByRole('group', { name: '보는 단위' })[0]!).getByRole('button', { name })
  const stepBack = () => fireEvent.click(within(picker()).getByRole('button', { name: '이전 달' }))
  const toJuly = () => {
    fireEvent.click(unit('일별'))
    for (let i = 0; i < 3; i++) stepBack()
  }
  const rankSub = () => rankChart().children[2] as HTMLElement
  const periodCard = () => within(flowRegion()).queryByRole('alert')
  const periodRetry = () => within(flowRegion()).queryByRole('button', { name: /이 기간 다시 읽기|다시 읽는 중/ })

  it('AC-1804.2: 저장 숫자로 그린 뒤 첫날이 오늘 − LOOKBACK_DAYS보다 앞인 7월을 고르면 readDays를 그 기간으로 한 번 더 부르고 읽은 줄로 그린다 — 손에 든 기간(9월·8월)은 읽지 않는다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    fireEvent.click(unit('일별'))
    stepBack()
    stepBack()
    expect(readDays).toHaveBeenCalledTimes(1)
    stepBack()
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedReads[1]!.range).toEqual(JULY)
    expect(within(rankChart()).getByText('읽는 중')).toBeTruthy()
    await savedAnswer([day('2026-07-06', 1, 2), day('2026-07-20', 3, 4)], 1)
    expect(rankSub().textContent).toBe('7월 1일 – 31일 · 자료 있는 2일')
    expect(periodCard()).toBeNull()
  })

  it('AC-1804.2·AC-1804.3: 같은 10초 한도다 — 넘으면 고르기 아래 오류 카드(E-STATS-READ-FAILED)와 [이 기간 다시 읽기]이고, 늦게 온 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    toJuly()
    await wait(SAVED_READ_TIMEOUT_MS - 1)
    expect(periodCard()).toBeNull()
    await wait(1)
    expect(periodCard()!.textContent).toContain('오류 번호 E-STATS-READ-FAILED')
    expect(periodRetry()!.textContent).toBe('이 기간 다시 읽기')
    await savedAnswer([day('2026-07-06', 1, 2)], 1)
    expect(periodCard()).not.toBeNull()
    expect(rankSub().textContent).toBe('7월 1일 – 31일')
  })

  it('AC-1804.3: 읽기가 던져도 같은 카드이고, [이 기간 다시 읽기]는 같은 기간을 readDays로 다시 읽어("다시 읽는 중"으로 막힘) 성공하면 카드가 없어진다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    toJuly()
    await savedFail(1)
    expect(periodCard()).not.toBeNull()
    fireEvent.click(periodRetry()!)
    expect(readDays).toHaveBeenCalledTimes(3)
    expect(savedReads[2]!.range).toEqual(JULY)
    expect(periodRetry()!.textContent).toBe('다시 읽는 중')
    expect((periodRetry() as HTMLButtonElement).disabled).toBe(true)
    await savedAnswer([day('2026-07-06', 1, 2)], 2)
    expect(periodCard()).toBeNull()
    expect(rankSub().textContent).toBe('7월 1일 – 31일 · 자료 있는 1일')
  })

  it('AC-1804.4: 비트 PC도 옛 기간은 저장 숫자로만 읽는다 — 비트 읽기는 열 때 한 번이고, 같은 날은 비트 숫자가 이기며, 서버 요청이 없다', async () => {
    onBitPc()
    vi.mocked(readDashboardGroups).mockResolvedValue(GROUPS)
    draw()
    await savedAnswer(SAVED_KEYED)
    await bitAnswer(bitDays([keyed(day('2026-07-30', 1, 1), 1, 1), ...BIT_KEYED]))
    toJuly()
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedReads[1]!.range).toEqual(JULY)
    await savedAnswer([keyed(day('2026-07-10', 1, 1), 3, 0), keyed(day('2026-07-30', 9, 9), 50, 50)], 1)
    expect(rankRows()).toEqual([
      ['운동치료', '4건'],
      ['체외충격파', '1건'],
    ])
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('AC-1805.1: 기간을 골라도(옛 기간 읽기 실패 포함) 원장님 보고 문장·하루 날짜 고르기는 그대로다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    const report = h1().textContent
    const dateLine = screen.getByRole('group', { name: '날짜 고르기' }).outerHTML
    toJuly()
    await savedFail(1)
    expect(periodCard()).not.toBeNull()
    expect(h1().textContent).toBe(report)
    expect(screen.getByRole('group', { name: '날짜 고르기' }).outerHTML).toBe(dateLine)
  })
})
