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
import { queryLocation } from '@/components/location/clients'
import { RoleProvider } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { errorInfo } from '@/lib/errors'
import { ContactsStorageError, listWarrantySoon } from '@/lib/storage/contacts'
import { loadInventory } from '@/lib/storage/inventory'
import { addEvents, listUnseenEvents, listWatchCandidates, markEventsSeen, setWatchChecked } from '@/lib/storage/location'
import { ruleAlerts, unreadCount } from '@/lib/storage/notices'
import { readDays, StorageError } from '@/lib/storage/stats'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { WarrantyItem } from '@/types/contacts'
import type { InvInventory } from '@/types/inventory'
import type { LocationEvent } from '@/types/location'
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
// 고시·공지(notices TASK-20): 맨 위 경고(RuleAlert)와 '고시·공지' 칸(NoticesCard)이 읽는 저장소. 시험이 답을 주지 않으면 늘 읽는 중이라
// 두 부품은 아무것도 그리지 않는다 — 이 파일의 다른 시험은 지금 모양 그대로다. 진짜 Supabase에 붙지 않는다
const pendingRead = () => new Promise<never>(() => {})
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(() => new Promise<never>(() => {})),
  unreadCount: vi.fn(() => new Promise<never>(() => {})),
  listNotices: vi.fn(() => new Promise<never>(() => {})),
  sourceStates: vi.fn(() => new Promise<never>(() => {})),
}))
// 대시보드 재고 칸(spec inventory AC-7512.4)은 스스로 loadInventory({ seed: false })로 읽는다 → 가짜. 처음은 물품 없음(칸 없음, 지금 화면 그대로)
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn() }))
// 무상 수리 알림(contacts AC-6507.1·AC-6507.2): 저장 함수 listWarrantySoon과 Supabase 클라이언트도 잡아 둔다. 진짜 Supabase에 붙지 않는다.
// 기본은 지금처럼 Supabase 설정이 없는 환경(supabaseBrowser가 던짐)이고, 알림 시험만 가짜 클라이언트를 준다
vi.mock('@/lib/storage/contacts', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/contacts')>()
  return { ...real, listWarrantySoon: vi.fn() }
})
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
// 새 경쟁 의원 알림(location AC-7915.1~AC-7915.3): 알림 저장 함수와 바깥 자료 부르기(queryLocation)도 잡아 둔다. 진짜 Supabase·서버 경로에 붙지 않는다.
// 기본은 관리자 아님(isAdmin 없음)이라 아무것도 부르지 않는다 — 이 파일의 다른 시험은 지금 그대로다
vi.mock('@/lib/storage/location', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/location')>()
  return { ...real, listWatchCandidates: vi.fn(), addEvents: vi.fn(), setWatchChecked: vi.fn(), listUnseenEvents: vi.fn(), markEventsSeen: vi.fn() }
})
vi.mock('@/components/location/clients', () => ({ queryLocation: vi.fn() }))

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

// 재고(spec inventory AC-7512.4): 물품 없음 · 최소 수량보다 적은 물품 하나('주문하세요' 1, 지어낸 물품)
const NO_INVENTORY: InvInventory = { categories: [], items: [] }
const LOW_INVENTORY: InvInventory = {
  categories: [{ id: 'c1', name: '약품', sortOrder: 0 }],
  items: [
    {
      id: 'i1',
      categoryId: 'c1',
      name: '히알루론산 주사 2mL',
      unit: '개',
      minQty: 10,
      qty: 4,
      lastCountQty: 4,
      lastCountedAt: null,
      expiry: null,
      vendor: null,
      unitPrice: null,
      bitCode: null,
      sortOrder: 0,
      hidden: false,
      orderedAt: null,
    },
  ],
}

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

// ── 잡아 둔 무상 수리 읽기(contacts AC-6507.1): 부른 차례대로 쌓이고, 시험이 답을 준다 ──
type WarrantyRead = { client: unknown; today: string; resolve(items: WarrantyItem[]): void; reject(error: unknown): void }
const warrantyReads: WarrantyRead[] = []
const warrantyAnswer = (items: WarrantyItem[], i = warrantyReads.length - 1) =>
  act(async () => {
    warrantyReads[i]!.resolve(items)
  })
const warrantyFail = (error: unknown, i = warrantyReads.length - 1) =>
  act(async () => {
    warrantyReads[i]!.reject(error)
  })

const onBitPc = () => vi.stubGlobal('chrome', { runtime: { connect: vi.fn() } })
const notBitPc = () => vi.stubGlobal('chrome', undefined)
const draw = () => render(<LiveDashboard today={TODAY} />)
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

// ── 화면 읽기 도우미 ──
// 큰 문장: 연결 전·읽는 중·실패는 h1 하나(머리 줄 없음). 숫자가 있으면 h1은 머리 줄 "대시보드" 하나뿐이고(dashboard-ux AC-2701.3·AC-2705.1),
// 큰 문장 자리는 보고 문장 한 단락(이름 줄 "{오늘|M월 D일} 보고 문장" 다음 단락)의 첫 문장 조각이다 — 보고 문장은 h1이 아니다
const REPORT_NAME = /^(오늘|\d+월 \d+일) 보고 문장$/
const bigLine = () => {
  const found = screen.getAllByRole('heading', { level: 1 })
  if (found.length === 1 && found[0]!.textContent === HEADER_H1) {
    const paragraph = screen.getByText(REPORT_NAME).parentElement!.nextElementSibling!
    expect(paragraph.tagName).toBe('P')
    return paragraph.children[0]!
  }
  expect(found.map((heading) => heading.textContent).filter((text) => text === HEADER_H1)).toEqual([])
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
// 숫자가 있는 화면은 AI 요약이 저장 리포트를 읽는다(합성 답, dashboard-ux AC-2704.1). 그 답까지 끝난 마크업
const settledMarkupOf = async (node: React.ReactElement) => {
  const { container, unmount } = render(node)
  await act(async () => {})
  const html = withoutIds(container.innerHTML)
  unmount()
  return html
}
const BEFORE_CONNECT = <DashboardHome today={TODAY} report={null} analysis={<DashboardAnalysis today={TODAY} source={NONE} />} />

// 대시보드 AI 요약(dashboard-ux AC-2704.1)이 여는 저장 리포트 읽기(GET)에 주는 합성 답: 리포트 없음. 진짜 서버·유료 API에 닿지 않는다
const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }
const aiRead = () => vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } }))
// 비트·저장 숫자를 서버로 보내지 않는다: 부른 요청은 AI 요약의 GET /api/ai/report?month=(몸통 없음)뿐이다
const expectOnlyAiRead = () => {
  for (const [url, init] of vi.mocked(fetch).mock.calls) {
    expect(String(url)).toMatch(/^\/api\/ai\/report\?month=\d{4}-\d{2}$/)
    expect((init as RequestInit | undefined)?.method).toBe('GET')
    expect((init as RequestInit | undefined)?.body).toBeUndefined()
  }
}

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
  vi.mocked(loadInventory).mockReset()
  vi.mocked(loadInventory).mockResolvedValue(NO_INVENTORY)
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-02T06:42:00Z')) // 한국 오후 3시 42분
  // 쓰면 안 되는 길: 불리면 시험이 잡는다
  vi.stubGlobal('fetch', aiRead())
  // 무상 수리 알림: 기본은 Supabase 설정 없음(지금 시험 환경 그대로). 알림 시험이 가짜 클라이언트로 바꾼다
  warrantyReads.length = 0
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockImplementation(() => {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요')
  })
  vi.mocked(listWarrantySoon).mockReset()
  vi.mocked(listWarrantySoon).mockImplementation(
    (client, today) =>
      new Promise<WarrantyItem[]>((resolve, reject) => {
        warrantyReads.push({ client, today, resolve, reject })
      }),
  )
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
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => {})
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(await settledMarkupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} savedRefresh={{ refreshing: false, failed: false, onRefresh: () => {} }} />))
  })

  it('AC-601.14: 비트 PC면 저장 숫자 읽기가 끝난 뒤에야 비트를 읽고, 저장 숫자를 둔 채 "다시 읽는 중"이다', async () => {
    onBitPc()
    draw()
    expect(readBitDays).not.toHaveBeenCalled()
    await savedAnswer(SAVED_ROWS)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.today).toBe(TODAY)
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(screen.getByRole('button', { name: '비트에서 읽는 중' })).toBeTruthy()
    await bitAnswer(bitDays())
    expect(bigLine().textContent).toBe(BIT_H1)
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
    expect(bigLine().textContent).toBe(CONNECT_H1)
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
    expect(bigLine().textContent).toBe(READ_H1)
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
    expectOrder(card, retry, screen.getByRole('region', { name: '오늘 브리핑' }), bigLine())
  })

  it('AC-601.19: 비트 PC가 아니어도 실패하면 연결 전 모양 위에 같은 카드다', async () => {
    notBitPc()
    draw()
    await savedFail()
    expect(bigLine().textContent).toBe(CONNECT_H1)
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
    expect(bigLine().textContent).toBe(READ_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-601.19: 한도 뒤에 늦게 온 첫 읽기의 답은 쓰지 않는다', async () => {
    notBitPc()
    draw()
    await wait(SAVED_READ_TIMEOUT_MS)
    await savedAnswer(SAVED_ROWS, 0)
    expect(bigLine().textContent).toBe(CONNECT_H1)
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
    expect(bigLine().textContent).toBe(CONNECT_H1)
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
    expect(bigLine().textContent).toBe(CONNECT_H1)
  })

  it('AC-601.19: 다시 읽기가 data로 성공하면 카드가 없어지고 BitDashboard가 그 숫자로 새로 그려진다(비트 읽기는 처음부터 다시)', async () => {
    onBitPc()
    draw()
    await savedFail()
    expect(bigLine().textContent).toBe(READ_H1)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(bitReads[0]!.deps.signal?.aborted).toBe(true)
    expect(readBitDays).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '비트에서 읽는 중' })).toBeTruthy()
  })

  it('AC-601.19: 비트 PC가 아니면 다시 읽기로 받은 저장 숫자만 그린다', async () => {
    notBitPc()
    const { container } = draw()
    await savedFail()
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    await act(async () => {})
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(await settledMarkupOf(<BitDashboard today={TODAY} initial={{ kind: 'data', days: SAVED_ROWS }} savedRefresh={{ refreshing: false, failed: false, onRefresh: () => {} }} />))
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
    expect(bigLine().textContent).toBe(READ_H1)
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
    expect(bigLine().textContent).toBe(BIT_H1)
    await savedAnswer(SAVED_ROWS, 1)
    expect(bigLine().textContent).toBe(BIT_H1)
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
    expect(bigLine().textContent).toBe(BIT_H1)
  })
})

// 저장된 숫자 새로고침 (dashboard-ux AC-2701.7·AC-2701.8, design.md §2 2026-11-08). 숫자가 있는 화면에서 저장 숫자를 손으로 다시 읽는 길
describe('AC-2701.7·AC-2701.8: [저장된 숫자 새로고침] — 저장 숫자만 보이는 화면의 손으로 다시 읽기', () => {
  const NEWER_SAVED_ROWS = [day('2026-10-26', 7, 60), day(TODAY, 4, 6, true)]
  const NEWER_SAVED_H1 = '오늘 지금까지 환자 10명이 왔습니다.'
  const SAVED_TIME_1205 = '서버에 마지막으로 저장된 시각 11월 2일 오후 12:05 · 날짜마다 저장된 때가 달라요'
  const refreshButton = () => within(header()).getByRole('button', { name: /^저장된 숫자/ }) as HTMLButtonElement

  it('AC-2701.8: 누르면 같은 범위로 저장 숫자만 다시 읽고(같은 틱 두 번도 하나) 그동안 숫자를 둔 채 두 단추가 막힌다. 성공하면 다시 놓지 않고 숫자·서버 저장 시각만 바뀌며 비트 읽기·AI 요약 읽기를 새로 하지 않는다', async () => {
    onBitPc()
    draw()
    await savedAnswer(SAVED_ROWS, 0, '2026-11-02T03:05:00.000+00:00')
    await bitAnswer({ kind: 'not-ready' }) // 저절로 읽은 비트는 조용히 끝남
    const briefing = screen.getByRole('region', { name: '오늘 브리핑' })
    const aiReads = vi.mocked(fetch).mock.calls.length
    const button = refreshButton()
    expect(button.textContent).toBe('저장된 숫자 새로고침')
    act(() => {
      button.click()
      button.click()
    })
    expect(readDays).toHaveBeenCalledTimes(2)
    expect(savedReads[1]!.range).toEqual(RANGE)
    expect(refreshButton().textContent).toBe('저장된 숫자 읽는 중')
    expect(refreshButton().disabled).toBe(true)
    expect((within(header()).getByRole('button', { name: '비트에서 다시 읽기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(bigLine().textContent).toBe(SAVED_H1)
    await savedAnswer(NEWER_SAVED_ROWS, 1, '2026-11-02T05:30:00.000+00:00') // 한국 오후 2시 30분
    expect(bigLine().textContent).toBe(NEWER_SAVED_H1)
    expect(within(header()).getByText('서버에 마지막으로 저장된 시각 11월 2일 오후 2:30 · 날짜마다 저장된 때가 달라요')).toBeTruthy()
    expect(screen.getByRole('region', { name: '오늘 브리핑' })).toBe(briefing)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls.length).toBe(aiReads)
    expect(refreshButton().textContent).toBe('저장된 숫자 새로고침')
    expect(refreshButton().disabled).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-2701.8: 실패하면 위쪽 카드가 아니라 머리 줄 아래 오류 상자이고 숫자·상태 표시·저장 시각은 그대로다. 누르기 전에는 다시 부르지 않고, 상자의 [다시 읽기]로 다시 읽어 성공하면 상자가 없어진다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS, 0, '2026-11-02T03:05:00.000+00:00')
    fireEvent.click(refreshButton())
    await savedFail(1)
    const box = screen.getByRole('alert')
    expect(screen.getAllByRole('alert')).toEqual([box]) // 위쪽 카드(처음 읽기 실패용)는 없다
    expectOrder(header(), box, screen.getByRole('region', { name: '오늘 하루 분석' }))
    expect(within(box).getByText('오류 번호 E-STATS-READ-FAILED')).toBeTruthy()
    expect(within(box).getByText(`아래 숫자는 전에 읽어 둔 그대로예요. ${READ_FAILED.fix}`)).toBeTruthy()
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(within(header()).getByText('서버에 저장된 숫자')).toBeTruthy()
    expect(within(header()).getByText(SAVED_TIME_1205)).toBeTruthy()
    expect(within(header()).queryByRole('button', { name: /^저장된 숫자/ })).toBeNull()
    await wait(SAVED_READ_TIMEOUT_MS * 2)
    expect(readDays).toHaveBeenCalledTimes(2)
    fireEvent.click(within(box).getByRole('button', { name: '다시 읽기' }))
    expect(readDays).toHaveBeenCalledTimes(3)
    expect((within(screen.getByRole('alert')).getByRole('button', { name: '다시 읽는 중' }) as HTMLButtonElement).disabled).toBe(true)
    await savedAnswer(NEWER_SAVED_ROWS, 2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bigLine().textContent).toBe(NEWER_SAVED_H1)
    expect(refreshButton().textContent).toBe('저장된 숫자 새로고침')
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
    expect(bigLine().textContent).toBe(SAVED_H1)
    // 숫자 칸 줄은 기준일 묶음 다음 grid다(dashboard-ux AC-2703.1)
    expect(screen.getByRole('region', { name: '오늘 하루 분석' }).querySelector(':scope > div.grid')!.children[0]!.textContent).toBe('오늘 환자 수5명')
    for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수']) expect(screen.getByRole('group', { name })).toBeTruthy()
    expect(within(rankChart()).getByRole('status').textContent).toBe(GROUPS_PENDING)
    expect(rankChart().querySelector('ol[aria-label]')).toBeNull()
    // 비트 읽기는 묶음 정의가 올 때까지 기다린다(AC-606.7)
    expect(readBitDays).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '비트에서 읽는 중' })).toBeNull()

    // 지난 날을 고른 채로 묶음이 온다 → 다시 놓지 않아 고른 날·숫자가 그대로이고 처방 상위만 바뀐다
    fireEvent.click(within(screen.getByRole('group', { name: '날짜 고르기' })).getByRole('button', { name: '이전 날' }))
    const picked = bigLine().textContent
    expect(picked).not.toBe(SAVED_H1)
    const briefing = screen.getByRole('region', { name: '오늘 브리핑' })
    await groupAnswer(GROUPS)
    expect(screen.getByRole('region', { name: '오늘 브리핑' })).toBe(briefing)
    expect(bigLine().textContent).toBe(picked)
    expect(within(rankChart()).queryByRole('status')).toBeNull()
    expect(rankRows()).toEqual(SAVED_RANK)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.groups).toEqual(GROUPS.defs)
    expect(screen.getByRole('button', { name: '비트에서 읽는 중' })).toBeTruthy()
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
    expect(bigLine().textContent).toBe(SAVED_H1)
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
    expect(bigLine().textContent).toBe(READ_H1)
    expect(savedCard()).not.toBeNull()
  })

  it('AC-606.1·AC-606.8: 저장 숫자로 먼저 그릴 때 처방 상위는 묶음 이름·기간 안 열쇠 줄 건수이고, 비트 숫자가 오면 같은 묶음으로 다시 센다', async () => {
    onBitPc()
    vi.mocked(readDashboardGroups).mockResolvedValue(GROUPS)
    draw()
    await savedAnswer(SAVED_KEYED)
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(rankRows()).toEqual(SAVED_RANK)
    await bitAnswer(bitDays(BIT_KEYED))
    expect(bigLine().textContent).toBe(BIT_H1)
    expect(rankRows()).toEqual(BIT_RANK)
    expect(readDashboardGroups).toHaveBeenCalledTimes(1)
    expectOnlyAiRead()
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
      expect(bigLine().textContent).toBe(SAVED_H1)
      expectGroupsUnread()
      for (const name of ['환자 수 추이', '신환 재방문율', '요일별 환자 수']) expect(screen.getByRole('group', { name })).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(readBitDays).toHaveBeenCalledTimes(1)
      expect(bitReads[0]!.deps.groups).toEqual([])
      await bitAnswer(bitDays(BIT_KEYED))
      expect(bigLine().textContent).toBe(BIT_H1)
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
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(within(rankChart()).getByRole('status').textContent).toBe(GROUPS_PENDING)
    await wait(1)
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(bitReads[0]!.deps.groups).toEqual([])
    expect(bigLine().textContent).toBe(SAVED_H1)
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
    expectOnlyAiRead()
  })

  it('AC-1805.1: 기간을 골라도(옛 기간 읽기 실패 포함) 원장님 보고 문장·하루 날짜 고르기는 그대로다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    const report = bigLine().textContent
    const dateLine = screen.getByRole('group', { name: '날짜 고르기' }).outerHTML
    toJuly()
    await savedFail(1)
    expect(periodCard()).not.toBeNull()
    expect(bigLine().textContent).toBe(report)
    expect(screen.getByRole('group', { name: '날짜 고르기' }).outerHTML).toBe(dateLine)
  })
})

describe('고시·공지 맨 위 경고 (notices TASK-20 · AC-7422.1)', () => {
  // 지어낸 고시 하나(규칙 2개). 환자 자료가 없다
  const ALERT = { id: '00000000-0000-4000-8000-000000000218', noticeNo: '2026-218', title: '관절강내 주사 인정기준 일부개정', ruleCount: 2 }
  const WARN_TITLE = '점검 규칙 확인 필요'
  const warning = () => screen.queryByText(WARN_TITLE)?.closest('[role="status"]') ?? null

  beforeEach(() => {
    vi.mocked(ruleAlerts).mockReset()
    vi.mocked(ruleAlerts).mockImplementation(pendingRead)
    vi.mocked(unreadCount).mockClear()
  })

  afterEach(() => {
    vi.mocked(ruleAlerts).mockImplementation(pendingRead)
  })

  it('AC-7422.1: 저장 숫자를 읽은 뒤 맨 위(날짜 줄·머리 줄·일별 현황보다 앞)에 경고를 놓는다 — 뼈대 동안은 없다', async () => {
    vi.mocked(ruleAlerts).mockResolvedValue([ALERT])
    notBitPc()
    const { container } = draw()
    expect(warning()).toBeNull()
    await savedAnswer(SAVED_ROWS)
    const box = warning()
    expect(box).not.toBeNull()
    expect(container.firstElementChild).toBe(box)
    expectOrder(box!, screen.getByRole('heading', { level: 1, name: HEADER_H1 }), screen.getByRole('region', { name: '오늘 하루 분석' }))
    expect(within(box as HTMLElement).getByRole('link', { name: '글 보기' }).getAttribute('href')).toBe(`/notices?id=${ALERT.id}`)
  })

  it('AC-7422.1: 연결 전 화면(저장 숫자 없음)에서도 맨 위에 놓고, 0개면 놓지 않는다', async () => {
    vi.mocked(ruleAlerts).mockResolvedValue([ALERT])
    notBitPc()
    const first = draw()
    await savedAnswer([])
    expect(first.container.firstElementChild).toBe(warning())
    expectOrder(warning()!, screen.getByRole('heading', { level: 1, name: CONNECT_H1 }))
    first.unmount()

    vi.mocked(ruleAlerts).mockResolvedValue([])
    draw()
    await savedAnswer(SAVED_ROWS, 1)
    expect(warning()).toBeNull()
  })

  it('AC-7422.1: 데스크 계정(RoleProvider desk)에게는 경고와 칸을 놓지 않고 읽지도 않는다', async () => {
    vi.mocked(ruleAlerts).mockResolvedValue([ALERT])
    notBitPc()
    render(
      <RoleProvider desk>
        <LiveDashboard today={TODAY} />
      </RoleProvider>,
    )
    await savedAnswer(SAVED_ROWS)
    expect(warning()).toBeNull()
    expect(ruleAlerts).not.toHaveBeenCalled()
    expect(unreadCount).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: '고시·공지' })).toBeNull()
  })
})

// ── contacts: 대시보드 무상 수리 알림 (REQ-6507, design.md '대시보드 알림', 시안 docs/mockups/contacts/index.html ?s=dashboard·?s=dashboard-off) ──
// LiveDashboard가 화면을 열 때 useWarrantySoon(오늘)으로 한 번(10초 한도) 읽어 BitDashboard에 notice로 넘긴다. 읽기 실패는 조용히 비운다(오류 카드 없음)
describe('무상 수리 알림: LiveDashboard가 한 번 읽어 맨 위 줄 바로 아래에 둔다 (contacts AC-6507.1·AC-6507.2)', () => {
  const NOTICE_NAME = '무상 수리 알림'
  const CLIENT = { from: vi.fn(), rpc: vi.fn() }
  // 오늘(11월 2일) 끝나는 원내 서버 PC, 12일 남은 충격파 기계(지어낸 업체·장비)
  const ITEMS: WarrantyItem[] = [
    { equipmentId: 'e-server', companyId: 'c-pc', companyName: '예시전산', name: '원내 서버 PC', warrantyUntil: TODAY },
    { equipmentId: 'e-shock', companyId: 'c-medi', companyName: '예시메디칼', name: '충격파 기계', warrantyUntil: '2026-11-14' },
  ]
  const LINES = ['원내 서버 PC 무상 수리 오늘 끝나요 · 예시전산주소록에서 보기', '충격파 기계 무상 수리 12일 남음 · 예시메디칼주소록에서 보기']
  const noticeEl = () => screen.getByRole('status', { name: NOTICE_NAME })
  const noNotice = () => expect(screen.queryByRole('status', { name: NOTICE_NAME })).toBeNull()
  const lines = () => within(noticeEl()).getAllByRole('link')
  const headerH1 = () => screen.getByRole('heading', { level: 1, name: HEADER_H1 })
  const todaySection = () => screen.getByRole('region', { name: '오늘 하루 분석' })
  // 알림 읽기가 실패해도 오류 카드·오류 번호가 없다(저장 숫자 카드 E-STATS-…와 다른 글)
  const noWarrantyError = () => {
    expect(screen.queryByText(/E-CONTACTS/)).toBeNull()
    expect(screen.queryByText(/주소록을 읽지 못했어요/)).toBeNull()
  }

  beforeEach(() => {
    vi.mocked(supabaseBrowser).mockReset()
    vi.mocked(supabaseBrowser).mockReturnValue(CLIENT as never)
  })

  it('AC-6507.1: 화면을 열면 supabaseBrowser()와 오늘로 listWarrantySoon을 한 번 읽고, 숫자 화면에서는 머리 줄 바로 아래 · 오늘 하루 분석 앞에 알림을 그린다', async () => {
    notBitPc()
    draw()
    await act(async () => {})
    expect(warrantyReads.map((r) => [r.client, r.today])).toEqual([[CLIENT, TODAY]])
    // 저장 숫자를 읽는 동안은 뼈대뿐이다(알림도 아직 없다)
    await warrantyAnswer(ITEMS)
    expectSkeleton()
    noNotice()
    await savedAnswer(SAVED_ROWS)
    expect(lines().map((a) => a.textContent)).toEqual(LINES)
    expect(lines().map((a) => a.getAttribute('href'))).toEqual(['/contacts?c=c-pc', '/contacts?c=c-medi'])
    expect(noticeEl().previousElementSibling).toBe(header())
    expectOrder(headerH1(), noticeEl(), todaySection())
    expect(within(noticeEl()).queryAllByRole('button')).toEqual([]) // [닫기] 없음
    expect(listWarrantySoon).toHaveBeenCalledTimes(1)
  })

  it('AC-6507.1: 저장 숫자가 비면(연결 전) 날짜 줄 바로 아래 · 큰 문장 앞이다 — 저장 숫자가 먼저 와도 알림은 답이 오면 그 자리에 생긴다', async () => {
    notBitPc()
    draw()
    await savedAnswer([])
    noNotice()
    expect(bigLine().textContent).toBe(CONNECT_H1)
    await warrantyAnswer(ITEMS)
    const h1 = screen.getByRole('heading', { level: 1, name: CONNECT_H1 })
    expect(noticeEl().nextElementSibling).toBe(h1)
    expect(noticeEl().previousElementSibling?.tagName).toBe('P') // 날짜 줄
    expect(lines().map((a) => a.textContent)).toEqual(LINES)
  })

  it('AC-6507.2: 알림 읽기를 기다리지 않는다 — 저장 숫자로 그리고 비트 읽기를 시작하며, 비트 숫자도 알림 없이 그린다', async () => {
    onBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(bitReads).toHaveLength(1)
    await bitAnswer(bitDays())
    expect(bigLine().textContent).toBe(BIT_H1)
    noNotice()
    expect(warrantyReads).toHaveLength(1)
    await warrantyAnswer(ITEMS)
    expectOrder(headerH1(), noticeEl(), todaySection())
    expect(bigLine().textContent).toBe(BIT_H1)
  })

  it.each([
    ['ContactsStorageError offline', new ContactsStorageError('offline')],
    ['ContactsStorageError failed', new ContactsStorageError('failed')],
  ])('AC-6507.2: 읽기 실패(%s)면 알림 묶음도 오류 카드도 없고 나머지 대시보드는 그대로다', async (_name, error) => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    await warrantyFail(error)
    noNotice()
    noWarrantyError()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bigLine().textContent).toBe(SAVED_H1)
  })

  it('AC-6507.2: 10초 한도를 넘기면 그리지 않고, 늦게 온 답도 버린다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    await wait(SAVED_READ_TIMEOUT_MS)
    noNotice()
    await warrantyAnswer(ITEMS)
    noNotice()
    noWarrantyError()
    expect(bigLine().textContent).toBe(SAVED_H1)
  })

  it('AC-6507.2: 0줄이면 아무것도 그리지 않는다(빈 상자 없음) — 알림 읽기가 없는 화면과 같다', async () => {
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    await warrantyAnswer([])
    noNotice()
    expect(header().nextElementSibling).toBeNull() // 머리 줄 아래 빈 자리가 없다
  })

  it('AC-6507.2: Supabase가 없으면(supabaseBrowser가 던짐) 읽지 않고 그리지 않는다', async () => {
    vi.mocked(supabaseBrowser).mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요')
    })
    notBitPc()
    draw()
    await savedAnswer(SAVED_ROWS)
    await wait(SAVED_READ_TIMEOUT_MS)
    expect(listWarrantySoon).not.toHaveBeenCalled()
    noNotice()
    noWarrantyError()
  })

  it('AC-6507.2: 저장 숫자 다시 읽기로 BitDashboard가 다시 놓여도 다시 읽지 않고 알림은 그대로다', async () => {
    notBitPc()
    draw()
    await act(async () => {}) // 읽기는 효과 안 다음 차례에 시작한다
    await warrantyAnswer(ITEMS)
    await savedFail()
    expect(savedCard()).not.toBeNull()
    expect(lines().map((a) => a.textContent)).toEqual(LINES)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(savedCard()).toBeNull()
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(lines().map((a) => a.textContent)).toEqual(LINES)
    expect(listWarrantySoon).toHaveBeenCalledTimes(1)
  })

  it('AC-6507.2: 비트 다시 읽기·날짜가 바뀌어도 다시 읽지 않고, 끝나는 날 다음 날이면 그 장비는 빠진다', async () => {
    onBitPc()
    const { rerender } = draw()
    await act(async () => {})
    await warrantyAnswer(ITEMS)
    await savedAnswer(SAVED_ROWS)
    await bitAnswer(bitDays())
    fireEvent.click(screen.getByRole('button', { name: '비트에서 다시 읽기' }))
    await bitAnswer(bitDays())
    expect(lines().map((a) => a.textContent)).toEqual(LINES)
    rerender(<LiveDashboard today="2026-11-03" />)
    await savedAnswer(SAVED_ROWS)
    expect(lines().map((a) => a.textContent)).toEqual(['충격파 기계 무상 수리 11일 남음 · 예시메디칼주소록에서 보기'])
    expect(listWarrantySoon).toHaveBeenCalledTimes(1)
  })

  it('AC-6507.2: LiveDashboard 소스는 useWarrantySoon(today)을 부르고 BitDashboard에 notice로 WarrantyNotice를 넘긴다 — Supabase를 직접 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/summary/LiveDashboard.tsx'), 'utf8')
    expect(text).toMatch(/useWarrantySoon\(today\)/)
    expect(text).toMatch(/notice=\{<WarrantyNotice items=\{warranty\} today=\{today\} \/>\}/)
    expect(text).not.toMatch(/listWarrantySoon|lib\/supabase/)
  })
})

// ── 재고 칸 자리 (spec inventory REQ-7512 AC-7512.4, design.md 6절 TASK-15) ──
// 저장 숫자 읽는 중 뼈대·읽기 실패 카드에서는 LiveDashboard가 재고 칸을 맨 위(뼈대·카드 앞)에 두고, 그때 BitDashboard는 맨 위 칸을 두지 않는다 → 한 화면에 하나
describe('AC-7512.4: 대시보드 재고 칸 — 뼈대·읽기 실패 카드', () => {
  const inventoryCards = () => screen.queryAllByRole('region', { name: '재고' })
  const settle = () => act(async () => {})
  const lowStock = () => vi.mocked(loadInventory).mockResolvedValue(LOW_INVENTORY)
  const todaySection = () => screen.getByRole('region', { name: '오늘 하루 분석' })

  it('AC-7512.4: 저장 숫자를 읽는 동안 — 재고 칸이 뼈대 앞(맨 위)에 하나', async () => {
    notBitPc()
    lowStock()
    const { container } = draw()
    await settle()
    expectSkeleton()
    const cards = inventoryCards()
    expect(cards).toHaveLength(1)
    expect(container.firstElementChild!.contains(cards[0]!)).toBe(true)
    expectOrder(cards[0]!, screen.getByRole('status'))
    expect(loadInventory).toHaveBeenCalledWith({ seed: false })
  })

  it('AC-7512.4: 저장 숫자 읽기 실패 카드 — 재고 칸이 그 카드 앞(맨 위)에 하나이고 아래 연결 전 화면에는 없다', async () => {
    notBitPc()
    lowStock()
    const { container } = draw()
    await savedFail()
    await settle()
    expect(bigLine().textContent).toBe(CONNECT_H1)
    const cards = inventoryCards()
    expect(cards).toHaveLength(1)
    expect(container.firstElementChild!.contains(cards[0]!)).toBe(true)
    expectOrder(cards[0]!, savedCard()!, screen.getByRole('region', { name: '오늘 브리핑' }))
  })

  it('AC-7512.4: 읽기 실패 카드 뒤 비트 숫자가 오면 카드가 걷히고 재고 칸은 보고 문장 오른쪽 하나뿐이다', async () => {
    onBitPc()
    lowStock()
    draw()
    await savedFail()
    await settle()
    expect(inventoryCards()).toHaveLength(1)
    await bitAnswer(bitDays())
    await settle()
    expect(savedCard()).toBeNull()
    const cards = inventoryCards()
    expect(cards).toHaveLength(1)
    expect(todaySection().contains(cards[0]!)).toBe(true)
  })

  it('AC-7512.4: 저장 숫자가 오면 뼈대 앞 재고 칸은 사라지고 보고 문장 오른쪽 하나뿐이다', async () => {
    notBitPc()
    lowStock()
    draw()
    await settle()
    expect(inventoryCards()).toHaveLength(1)
    await savedAnswer(SAVED_ROWS)
    await settle()
    const cards = inventoryCards()
    expect(cards).toHaveLength(1)
    expect(todaySection().contains(cards[0]!)).toBe(true)
  })

  it('AC-7512.4: 알림이 없으면 뼈대·실패 카드 모양은 지금 그대로다(재고 칸 없음)', async () => {
    notBitPc()
    const { container } = draw()
    await settle()
    expect(inventoryCards()).toHaveLength(0)
    const html = withoutIds(container.innerHTML)
    cleanup()
    expect(html).toBe(markupOf(<DashboardSkeleton />))
    draw()
    await savedFail()
    await settle()
    expect(inventoryCards()).toHaveLength(0)
    expect(savedCard()).not.toBeNull()
  })
})

// ── location: 대시보드 새 경쟁 의원 알림 (REQ-7915, design.md 12절, 시안 docs/mockups/location/index.html ?s=dashboard) ──
// LiveDashboard가 관리자일 때만 화면을 열 때 한 번 확인·읽고(useLocationWatch, 20초 한도) BitDashboard에 locationNotice로 넘긴다.
// 자리는 무상 수리 알림 바로 아래이고, 저장 숫자·비트 읽기는 이 읽기를 기다리지 않는다. 의원·후보는 지어낸 값이다
describe('입지 알림: LiveDashboard가 관리자일 때 한 번 읽어 무상 수리 알림 아래에 둔다 (location AC-7915.1~AC-7915.3)', () => {
  const NAME = '입지 알림'
  const CLIENT = { from: vi.fn(), rpc: vi.fn(), storage: {} }
  const CAND = '11111111-1111-4111-8111-111111111111'
  const ev = (n: number, kind: 'open' | 'close', clinicName: string, eventOn: string): LocationEvent => ({
    id: `e0000000-0000-4000-8000-00000000000${n}`,
    candidateId: CAND,
    kind,
    clinicName,
    dept: '정형외과',
    eventOn,
    distM: 950,
    seenAt: null,
    createdAt: '2026-11-02T00:00:00.000Z',
  })
  const EVENTS = [ev(1, 'open', '예시★★정형외과', '2026-10-28'), ev(2, 'close', '예시▼▼정형외과', '2026-10-20')]
  const WARRANTY: WarrantyItem[] = [{ equipmentId: 'e-shock', companyId: 'c-medi', companyName: '예시메디칼', name: '충격파 기계', warrantyUntil: '2026-11-14' }]
  const box = () => screen.getByRole('status', { name: NAME })
  const noBox = () => expect(screen.queryByRole('status', { name: NAME })).toBeNull()
  const rows = () => within(box()).getAllByRole('link')
  const headerH1 = () => screen.getByRole('heading', { level: 1, name: HEADER_H1 })
  const todaySection = () => screen.getByRole('region', { name: '오늘 하루 분석' })
  const reads = [listWatchCandidates, listUnseenEvents, queryLocation, addEvents, setWatchChecked] as const
  const drawAdmin = (isAdmin: boolean | PromiseLike<boolean> = true) => render(<LiveDashboard today={TODAY} isAdmin={isAdmin} />)
  // 안 본 줄 읽기를 잡아 둔다(시험이 답을 준다)
  const holdUnseen = () => {
    const held: Array<(events: LocationEvent[]) => void> = []
    vi.mocked(listUnseenEvents).mockImplementation(() => new Promise((resolve) => held.push(resolve)))
    return (events: LocationEvent[]) =>
      act(async () => {
        held.at(-1)!(events)
      })
  }
  const settle = () =>
    act(async () => {
      for (let i = 0; i < 30; i += 1) await Promise.resolve()
    })

  beforeEach(() => {
    vi.mocked(supabaseBrowser).mockReset()
    vi.mocked(supabaseBrowser).mockReturnValue(CLIENT as never)
    for (const fn of reads) vi.mocked(fn).mockReset()
    vi.mocked(listWatchCandidates).mockResolvedValue([]) // 확인할 후보 없음 → 바깥 자료는 부르지 않는다
    vi.mocked(listUnseenEvents).mockResolvedValue(EVENTS)
    vi.mocked(markEventsSeen).mockReset()
    vi.mocked(markEventsSeen).mockResolvedValue(undefined)
  })

  it.each([
    ['isAdmin 없음', undefined],
    ['isAdmin 거짓', false],
  ])('AC-7915.3: 관리자가 아니면(%s) 아무것도 부르지 않고 알림 자리에 아무것도 없다', async (_name, isAdmin) => {
    notBitPc()
    render(<LiveDashboard today={TODAY} {...(isAdmin === undefined ? {} : { isAdmin })} />)
    await savedAnswer(SAVED_ROWS)
    await settle()
    await wait(20_000)
    for (const fn of reads) expect(fn).not.toHaveBeenCalled()
    noBox()
    expect(bigLine().textContent).toBe(SAVED_H1)
  })

  it('AC-7915.2: 관리자면 화면을 열 때 한 번 읽어, 숫자 화면에서 머리 줄 → 무상 수리 알림 → 입지 알림 → 오늘 하루 분석 차례로 그린다(누르면 /location?c=…&tab=detail)', async () => {
    notBitPc()
    drawAdmin()
    await settle()
    await warrantyAnswer(WARRANTY)
    await savedAnswer(SAVED_ROWS)
    const warranty = screen.getByRole('status', { name: '무상 수리 알림' })
    expect(box().previousElementSibling).toBe(warranty)
    expectOrder(headerH1(), warranty, box(), todaySection())
    expect(rows().map((a) => a.getAttribute('href'))).toEqual([`/location?c=${CAND}&tab=detail`, `/location?c=${CAND}&tab=detail`])
    expect(vi.mocked(listWatchCandidates).mock.calls).toEqual([[CLIENT]])
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
  })

  it('AC-7915.2: 페이지가 넘긴 문지기 값(참으로 끝나는 약속)도 받는다 — 연결 전이면 날짜 줄 아래 · 큰 문장 앞이다', async () => {
    notBitPc()
    drawAdmin(Promise.resolve(true))
    await savedAnswer([])
    await settle()
    const h1 = screen.getByRole('heading', { level: 1, name: CONNECT_H1 })
    expect(box().nextElementSibling).toBe(h1)
    expect(rows()).toHaveLength(2)
  })

  it('AC-7915.3: 알림 읽기를 기다리지 않는다 — 저장 숫자로 그리고 비트 읽기를 시작하며, 비트 숫자도 알림 없이 그린다', async () => {
    const release = holdUnseen()
    onBitPc()
    drawAdmin()
    await savedAnswer(SAVED_ROWS)
    expect(bigLine().textContent).toBe(SAVED_H1)
    expect(bitReads).toHaveLength(1)
    await bitAnswer(bitDays())
    expect(bigLine().textContent).toBe(BIT_H1)
    noBox()
    await settle()
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
    await release(EVENTS)
    expectOrder(headerH1(), box(), todaySection())
    expect(bigLine().textContent).toBe(BIT_H1)
  })

  it('AC-7915.3: 확인·읽기가 실패하면 알림 묶음도 오류 카드도 없고 나머지 대시보드는 그대로다', async () => {
    vi.mocked(listWatchCandidates).mockRejectedValue(new Error('후보 읽기 실패'))
    vi.mocked(listUnseenEvents).mockRejectedValue(new Error('알림 읽기 실패'))
    notBitPc()
    drawAdmin()
    await savedAnswer(SAVED_ROWS)
    await settle()
    noBox()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/E-LOC/)).toBeNull()
    expect(bigLine().textContent).toBe(SAVED_H1)
  })

  it('AC-7915.3: 20초 한도를 넘기면 그리지 않고, 늦게 온 답도 버린다', async () => {
    const release = holdUnseen()
    notBitPc()
    drawAdmin()
    await savedAnswer(SAVED_ROWS)
    await settle()
    await wait(20_000)
    await release(EVENTS)
    noBox()
    expect(bigLine().textContent).toBe(SAVED_H1)
  })

  it('AC-7915.2: 저장 숫자 다시 읽기로 BitDashboard가 다시 놓여도 다시 읽지 않고, [닫기]는 그 줄만 감추고 본 것으로 적는다', async () => {
    notBitPc()
    drawAdmin()
    await settle()
    await savedFail()
    expect(rows()).toHaveLength(2)
    fireEvent.click(retryButton())
    await savedAnswer(SAVED_ROWS)
    expect(rows()).toHaveLength(2)
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
    fireEvent.click(within(box()).getByRole('button', { name: '예시★★정형외과 알림 닫기' }))
    expect(rows().map((a) => a.querySelector('small')?.textContent)).toEqual(['예시▼▼정형외과 · 950m · 10월 20일'])
    await settle()
    expect(vi.mocked(markEventsSeen).mock.calls).toEqual([[CLIENT, [EVENTS[0]!.id]]])
    fireEvent.click(within(box()).getByRole('button', { name: '예시▼▼정형외과 알림 닫기' }))
    noBox()
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
  })

  it('AC-7915.2: LiveDashboard 소스는 useLocationWatch(isAdmin, today)를 부르고 BitDashboard에 locationNotice로 LocationAlert를 넘긴다 — Supabase·저장 함수를 직접 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/dashboard/summary/LiveDashboard.tsx'), 'utf8')
    expect(text).toMatch(/useLocationWatch\(isAdmin, today\)/)
    expect(text).toMatch(/locationNotice=\{<LocationAlert events=\{watch\.events\} onClose=\{watch\.close\} \/>\}/)
    expect(text).not.toMatch(/listWatchCandidates|listUnseenEvents|storage\/location|queryLocation|lib\/supabase/)
  })
})
