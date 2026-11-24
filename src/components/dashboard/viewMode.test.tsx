// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readBitDays, type ReadResult } from '@/components/dashboard/live/readBitDays'
import { readDashboardGroups } from '@/components/dashboard/live/rxGroups'
import { LiveDashboard } from '@/components/dashboard/summary/LiveDashboard'
import { queryLocation } from '@/components/location/clients'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { listWarrantySoon } from '@/lib/storage/contacts'
import { loadInventory } from '@/lib/storage/inventory'
import { addEvents, listUnseenEvents, listWatchCandidates, markEventsSeen, readDeptRule, setWatchChecked } from '@/lib/storage/location'
import { readDays } from '@/lib/storage/stats'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { LocationEvent, QueryReply, WatchCandidate } from '@/types/location'
import type { DayPayload } from '@/types/payload'
import { createStatsWorker } from '@/workers/statsClient'

// 다른 의원 보기 중 대시보드 (admin-view REQ-8008 AC-8008.3, design.md '탭마다 읽기만', 시안 docs/mockups/admin-view ?s=viewing).
// LiveDashboard를 ViewingProvider viewing={가짜 의원} 안에서 그려 쓰기·비트 단추가 없고 비트 읽기·입지 저절로 적기·AI 만들기가 불리지 않는지,
// [저장된 숫자 새로고침]이 저장 숫자(stats_days, readDays)만 다시 읽는지, viewing={null}이면 지금과 같은지 본다.
// 저장 코드·비트 읽기·바깥 자료 부르기·chrome.runtime은 모두 가짜다. 의원·후보 이름은 지어낸 값이다. 진짜 Supabase·서버 경로에 붙지 않는다

vi.mock('@/lib/storage/stats', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/stats')>()), readDays: vi.fn() }))
vi.mock('@/components/dashboard/live/rxGroups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/dashboard/live/rxGroups')>()),
  readDashboardGroups: vi.fn(),
}))
vi.mock('@/components/dashboard/live/readBitDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/dashboard/live/readBitDays')>()),
  readBitDays: vi.fn(),
}))
vi.mock('@/workers/statsClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/workers/statsClient')>()), createStatsWorker: vi.fn() }))
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(() => new Promise<never>(() => {})),
  unreadCount: vi.fn(() => new Promise<never>(() => {})),
  listNotices: vi.fn(() => new Promise<never>(() => {})),
  sourceStates: vi.fn(() => new Promise<never>(() => {})),
}))
vi.mock('@/lib/storage/ruleChanges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/ruleChanges')>()),
  ruleChangeAlerts: vi.fn(() => new Promise<never>(() => {})),
}))
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn() }))
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/contacts')>()), listWarrantySoon: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/storage/location', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/location')>()),
  listWatchCandidates: vi.fn(),
  addEvents: vi.fn(),
  setWatchChecked: vi.fn(),
  listUnseenEvents: vi.fn(),
  markEventsSeen: vi.fn(),
  readDeptRule: vi.fn(),
}))
vi.mock('@/components/location/clients', () => ({ queryLocation: vi.fn() }))

const TODAY = '2026-11-02'
const RANGE = { from: '2026-07-25', to: TODAY } // 저장 숫자 읽기 범위(오늘 − 100일 ~ 오늘)
const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000d2', name: '가짜다라정형외과의원' }
const CLIENT = { from: vi.fn(), rpc: vi.fn(), storage: {} }

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
const SAVED_ROWS = [day('2026-10-26', 7, 60), day(TODAY, 2, 3, true)]
type SavedResult = Awaited<ReturnType<typeof readDays>>
const saved = (rows: readonly DayPayload[]): SavedResult => ({ rows: [...rows], dropped: 0, latest: { at: '2026-11-02T03:05:00Z', source: 'bit' }, fromFile: false })

// 확인할 때가 된 후보 하나(확인한 적 없음)와 안 본 알림 줄 하나
const CAND: WatchCandidate = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: '예시빌딩 3층',
  status: 'watching',
  lat: 37.5,
  lng: 127.0,
  radiusM: 1000,
  watchCheckedOn: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  place: { sidoName: '서울특별시', sggName: '예시구' },
}
const EVENT: LocationEvent = {
  id: 'e0000000-0000-4000-8000-000000000001',
  candidateId: CAND.id,
  kind: 'open',
  clinicName: '예시★★정형외과의원',
  dept: '정형외과',
  eventOn: '2026-10-28',
  distM: 300,
  seenAt: null,
  createdAt: '2026-11-02T00:00:00.000Z',
}
const LICENSE_OK: QueryReply = { ok: true, value: { rows: [], capped: false }, src: 'clinic-license', asOf: TODAY }
const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }

const draw = (viewing: Viewing | null) =>
  render(
    <ViewingProvider viewing={viewing}>
      <LiveDashboard today={TODAY} isAdmin />
    </ViewingProvider>,
  )
const settle = () =>
  act(async () => {
    for (let i = 0; i < 40; i += 1) await Promise.resolve()
  })
const header = () => screen.getByRole('heading', { level: 1, name: '대시보드' }).parentElement as HTMLElement
const alertBox = () => screen.getByRole('status', { name: '입지 알림' })
const savedReads = () => vi.mocked(readDays).mock.calls.filter(([range]) => range.from === RANGE.from && range.to === RANGE.to).length
const button = (name: string | RegExp) => screen.queryByRole('button', { name })

/** 이 PC에 확장이 있다(chrome.runtime 있음): 보는 중이 아니면 비트를 읽는 PC다 */
const onBitPc = () => {
  const connect = vi.fn()
  vi.stubGlobal('chrome', { runtime: { connect } })
  return connect
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-02T06:42:00Z'))
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  vi.mocked(readDays).mockReset()
  vi.mocked(readDays).mockImplementation(async (range) => saved(range.from === RANGE.from ? SAVED_ROWS : []))
  vi.mocked(readDashboardGroups).mockReset()
  vi.mocked(readDashboardGroups).mockResolvedValue({ lines: [], defs: [] })
  vi.mocked(readBitDays).mockReset()
  vi.mocked(readBitDays).mockImplementation(() => new Promise<ReadResult>(() => {}))
  vi.mocked(createStatsWorker).mockReset()
  vi.mocked(loadInventory).mockReset()
  vi.mocked(loadInventory).mockResolvedValue({ categories: [], items: [] })
  vi.mocked(listWarrantySoon).mockReset()
  vi.mocked(listWarrantySoon).mockResolvedValue([])
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockReturnValue(CLIENT as never)
  for (const fn of [listWatchCandidates, addEvents, setWatchChecked, listUnseenEvents, markEventsSeen, readDeptRule, queryLocation]) vi.mocked(fn).mockReset()
  vi.mocked(readDeptRule).mockResolvedValue(DEFAULT_DEPT_RULE)
  vi.mocked(listWatchCandidates).mockResolvedValue([CAND])
  vi.mocked(queryLocation).mockResolvedValue(LICENSE_OK)
  vi.mocked(addEvents).mockResolvedValue(undefined)
  vi.mocked(setWatchChecked).mockResolvedValue(undefined)
  vi.mocked(listUnseenEvents).mockResolvedValue([EVENT])
  vi.mocked(markEventsSeen).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('대시보드: 다른 의원 보는 중은 읽기만 (AC-8008.3)', () => {
  it('AC-8008.3: 머리 줄은 h1 · 칩 · 저장 시각 · [저장된 숫자 새로고침]뿐이다 — [비트에서 다시 읽기]·비트 PC 연결 안내가 없고, 이 PC 비트를 읽지 않는다', async () => {
    const connect = onBitPc()
    draw(VIEWING)
    await settle()
    expect(within(header()).getAllByRole('button').map((b) => b.textContent)).toEqual(['저장된 숫자 새로고침'])
    expect(within(header()).queryByRole('link')).toBeNull()
    expect(button('비트에서 다시 읽기')).toBeNull()
    expect(screen.queryByRole('link', { name: '비트 PC 연결 안내' })).toBeNull()
    expect(readBitDays).not.toHaveBeenCalled()
    expect(createStatsWorker).not.toHaveBeenCalled()
    expect(connect).not.toHaveBeenCalled()
  })

  it('AC-8008.3: 보는 의원의 저장 숫자로 그리고, [저장된 숫자 새로고침]은 저장 숫자(readDays)만 다시 읽는다 — 비트 읽기·쓰기 없음', async () => {
    onBitPc()
    draw(VIEWING)
    await settle()
    // 보는 중 처음 날은 어제다(올림은 어제까지) — [오늘로]로 오늘 저장 숫자를 본다
    fireEvent.click(screen.getByRole('button', { name: '오늘로' }))
    expect(screen.getByText('오늘 지금까지 환자 5명이 왔습니다.')).toBeTruthy()
    expect(savedReads()).toBe(1)
    fireEvent.click(within(header()).getByRole('button', { name: '저장된 숫자 새로고침' }))
    await settle()
    expect(savedReads()).toBe(2)
    expect(readBitDays).not.toHaveBeenCalled()
    for (const fn of [addEvents, setWatchChecked, markEventsSeen]) expect(fn).not.toHaveBeenCalled()
    // 서버로 간 요청은 AI 요약의 저장 리포트 읽기(GET)뿐이다
    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toMatch(/^\/api\/ai\/report\?month=\d{4}-\d{2}$/)
      expect((init as RequestInit | undefined)?.method).toBe('GET')
    }
  })

  it('AC-8008.3: AI 경영 리포트 칸에 [AI 리포트 만들기]·[다시 분석]이 없다(리포트 만들기 POST 없음)', async () => {
    onBitPc()
    draw(VIEWING)
    await settle()
    expect(screen.getByRole('heading', { name: '우리 병원 AI 경영 리포트' })).toBeTruthy()
    expect(button('AI 리포트 만들기')).toBeNull()
    expect(button('다시 분석')).toBeNull()
    for (const [, init] of vi.mocked(fetch).mock.calls) expect((init as RequestInit | undefined)?.method).toBe('GET')
  })

  it('AC-8008.3: 입지 알림은 보는 의원의 안 본 줄을 읽어 보이되 [닫기]가 없고, 저절로 확인(queryLocation·addEvents·setWatchChecked)·본 것 적기를 하지 않는다', async () => {
    onBitPc()
    draw(VIEWING)
    await settle()
    expect(within(alertBox()).getAllByRole('link').length).toBeGreaterThan(0)
    expect(within(alertBox()).queryByRole('button')).toBeNull()
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
    expect(queryLocation).not.toHaveBeenCalled()
    expect(addEvents).not.toHaveBeenCalled()
    expect(setWatchChecked).not.toHaveBeenCalled()
    expect(markEventsSeen).not.toHaveBeenCalled()
  })
})

describe('대시보드: viewing={null}이면 지금과 같다 (AC-8008.3)', () => {
  it('AC-8008.3: 비트 PC면 비트를 읽고 [비트에서 다시 읽기]가 있으며, AI [AI 리포트 만들기]·입지 [닫기]가 있고 입지 확인(queryLocation·setWatchChecked)을 한다', async () => {
    onBitPc()
    draw(null)
    await settle()
    expect(readBitDays).toHaveBeenCalledTimes(1)
    expect(within(header()).getAllByRole('button').map((b) => b.textContent)).toEqual(['저장된 숫자 새로고침', '비트에서 읽는 중'])
    expect(button('AI 리포트 만들기')).toBeTruthy()
    expect(within(alertBox()).getAllByRole('button').length).toBeGreaterThan(0)
    expect(queryLocation).toHaveBeenCalled()
    expect(setWatchChecked).toHaveBeenCalledWith(CLIENT, CAND.id, TODAY)
    fireEvent.click(within(alertBox()).getAllByRole('button')[0]!)
    await settle()
    expect(markEventsSeen).toHaveBeenCalledWith(CLIENT, [EVENT.id])
  })

  it('AC-8008.3: 확장이 없는 PC면 지금처럼 [비트 PC 연결 안내] 링크다', async () => {
    vi.stubGlobal('chrome', undefined)
    draw(null)
    await settle()
    expect(within(header()).getByRole('link', { name: '비트 PC 연결 안내' })).toBeTruthy()
  })
})
