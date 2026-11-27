// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { BitDashboard } from '@/components/dashboard/live/BitDashboard'
import type { SummarySource } from '@/components/dashboard/summary/source'
import { RoleProvider } from '@/components/shell/role'
import { ViewingProvider } from '@/components/shell/viewing'
import { StatsScreen } from '@/components/stats/StatsScreen'
import { statsRange } from '@/components/stats/view'
import { eachDay } from '@/lib/analytics/dates'
import { listCalendarCounts, loadCalendarSettings } from '@/lib/storage/calendar'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { loadGoal } from '@/lib/storage/goals'
import { readCoverage, readDays, readMonths } from '@/lib/storage/stats'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { listSunapDays, loadSunapSettings } from '@/lib/storage/sunap'
import { readUisPeriods } from '@/lib/storage/uisarang'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import type { EmrKind } from '@/types/clinicProfile'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { DEFAULT_RSV_KINDS } from '@/types/sunap'
import { UisUpload, type UisUploadLook } from './UisUpload'
import type { UisUploadView } from './useUisUpload'

// 올리기 칸이 놓이는 자리(specs/uisarang-upload design.md §10-1·§10-2·§10-3, 시안 ?s=dash-empty·dash-data·stats).
// 대시보드는 BitDashboard에 진짜 UisUpload를 그리는 함수를 넘겨 시작 칸(펼침)·머리 줄 아래(접음)를 보고, 통계 탭은 진짜 StatsScreen을 그린다.
// 병원 정보 훅·저장 읽기·Worker는 모두 가짜이고 숫자·이름은 이 파일에서 지어낸 값이다. 진짜 Supabase·확장·Claude에 붙지 않는다
const clinic = vi.hoisted(() => ({ view: null as unknown }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: () => clinic.view }))
vi.mock('@/components/dashboard/live/readBitDays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/dashboard/live/readBitDays')>()),
  readBitDays: vi.fn(() => new Promise<never>(() => {})),
}))
vi.mock('@/workers/statsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/workers/statsClient')>()),
  createStatsWorker: vi.fn(() => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null })),
}))
vi.mock('@/workers/runUisarang', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/workers/runUisarang')>()), runUisarang: vi.fn() }))
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(() => new Promise<never>(() => {})),
  unreadCount: vi.fn(() => new Promise<never>(() => {})),
  listNotices: vi.fn(() => new Promise<never>(() => {})),
  sourceStates: vi.fn(() => new Promise<never>(() => {})),
}))
vi.mock('@/lib/storage/inventory', () => ({ loadInventory: vi.fn(async () => ({ categories: [], items: [] })) }))
vi.mock('@/lib/storage/uisarang', () => ({ readUisPeriods: vi.fn(), saveUisPlan: vi.fn(), readUisHave: vi.fn() }))
vi.mock('@/lib/storage/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/stats')>()),
  readDays: vi.fn(),
  readMonths: vi.fn(),
  readCoverage: vi.fn(),
  saveStats: vi.fn(),
}))
vi.mock('@/lib/storage/rxPicks', () => ({ readRxPicks: vi.fn(() => new Promise(() => undefined)), addRxPick: vi.fn(), removeRxPick: vi.fn(), clearRxPicks: vi.fn() }))
vi.mock('@/lib/storage/statsRxGroups', () => ({ listStatsRxGroups: vi.fn(), saveStatsRxGroups: vi.fn(), StatsRxGroupStoreError: class extends Error {} }))
const revenueStore = vi.hoisted(() => ({ saveRange: vi.fn(), loadDays: vi.fn(), codeTotals: vi.fn(), monthCodes: vi.fn() }))
vi.mock('@/lib/storage/revenue', () => ({ createRevenueStore: vi.fn(() => revenueStore) }))
vi.mock('@/lib/storage/adminRows', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/storage/adminRows')>()), readAdminRows: vi.fn(async () => []) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))
vi.mock('@/lib/storage/sunap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/sunap')>()),
  loadSunapSettings: vi.fn(),
  listSunapDays: vi.fn(),
}))
vi.mock('@/lib/storage/calendar', () => ({ listCalendarCounts: vi.fn(), loadCalendarSettings: vi.fn(), listCalendarSlots: vi.fn(async () => []), listAllDay: vi.fn(async () => []) }))
vi.mock('@/lib/storage/goals', () => ({ loadGoal: vi.fn(), saveGoal: vi.fn() }))

const TITLE = '의사랑 엑셀 올리기'
const DROP = '파일을 여기에 끌어다 놓으세요'
const HELP_OPEN = '도움말 보기'
const START_H1 = '의사랑 엑셀을 올리면 숫자가 여기에 채워져요'
const START_LEAD = '의사랑 통계에서 엑셀을 저장해 아래에 넣어 주세요. 그날 숫자와 보고 문장, 기간별 흐름이 채워져요. 업무일지·예약·서식은 그대로 쓸 수 있어요.'
const CHANGE = '쓰는 EMR 바꾸기'
const VIEWING = { hospitalId: '00000000-0000-4000-8000-000000000001', name: '가나 정형외과의원' }

const profileView = (emr: EmrKind, state: ClinicProfileView['state'] = 'ready'): ClinicProfileView => ({
  state,
  profile: { ...defaultProfile(), emr },
  saved: true,
  signupName: '',
  signupPhone: null,
  name: '',
  logoDataUrl: null,
  reload: () => undefined,
})
const idle = (): UisUploadView => ({ phase: 'idle', count: 0, today: null, rows: null, missing: null, error: null, busy: false, take: vi.fn(), retrySave: vi.fn() })
const uisDay = (ymd: string, patients: number, newPatients: number): DayPayload => ({
  schemaVersion: 2,
  quality: 'valid',
  day: ymd,
  partial: false,
  totals: { patients, newPatients, returning: patients - newPatients, unknown: 0 },
  rx: [],
  groups: [],
  revisit: { cohort: 0, within7: null, within14: null },
})

const box = () => screen.getByRole('region', { name: TITLE })
const noBox = () => expect(screen.queryByRole('region', { name: TITLE })).toBeNull()
const lookOf = (region: HTMLElement): UisUploadLook => {
  const folded = within(region).queryByRole('button', { name: HELP_OPEN }) !== null
  const open = within(region).queryByText(DROP) !== null
  expect(folded !== open, '접은 모양과 펼친 모양 중 하나').toBe(true)
  return folded ? 'folded' : 'open'
}
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
const viewingWrap = (node: ReactNode) => <ViewingProvider viewing={VIEWING}>{node}</ViewingProvider>
const deskWrap = (node: ReactNode) => <RoleProvider desk>{node}</RoleProvider>
const plain = (node: ReactNode) => node

const AI_EMPTY = { report: null, stale: false, usage: { calls: 0, tokens: 0, costMicroUsd: 0 } }

beforeEach(() => {
  clinic.view = profileView('uisarang')
  vi.stubGlobal('chrome', undefined)
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(AI_EMPTY), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ── 대시보드: BitDashboard가 받은 그리는 함수로 진짜 UisUpload를 그린다(LiveDashboard가 넘기는 모양 그대로) ──
const DASH_TODAY = '2026-11-02' // 월요일
const NONE: SummarySource = { kind: 'none' }
const SAVED: SummarySource = { kind: 'data', days: [uisDay('2026-10-30', 132, 9), uisDay('2026-10-29', 121, 7)] }
const drawDash = (initial: SummarySource, wrap: (node: ReactNode) => ReactNode = plain, upload: UisUploadView = idle()) =>
  render(
    <>
      {wrap(
        <BitDashboard today={DASH_TODAY} initial={initial} savedAt={initial.kind === 'data' ? '2026-10-30T10:05:00Z' : null} uisUpload={(look) => <UisUpload look={look} upload={upload} />} />,
      )}
    </>,
  )

describe('대시보드 자리 (AC-8811.1 · AC-8810.6 · AC-8810.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T06:42:00Z'))
  })

  it('AC-8811.1·AC-8810.1: 의사랑 · 저장 숫자 없음 — h1 → 안내 → 펼친 올리기 칸(놓는 자리) → [쓰는 EMR 바꾸기] 차례이고 칸은 하나다', () => {
    drawDash(NONE)
    expect(screen.getAllByRole('region', { name: TITLE })).toHaveLength(1)
    expect(lookOf(box())).toBe('open')
    expectOrder(screen.getByRole('heading', { level: 1, name: START_H1 }), screen.getByText(START_LEAD), box(), screen.getByRole('link', { name: CHANGE }))
  })

  it('AC-8810.6·AC-8811.2: 의사랑 · 저장 숫자 있음 — 머리 줄(대시보드) 바로 아래 접은 올리기 칸 하나', () => {
    drawDash(SAVED)
    expect(screen.getAllByRole('region', { name: TITLE })).toHaveLength(1)
    expect(lookOf(box())).toBe('folded')
    const head = screen.getByRole('heading', { level: 1, name: '대시보드' })
    expectOrder(head, box())
    expect(screen.queryByText(START_H1)).toBeNull()
  })

  it('AC-8810.7: 관리자가 다른 의원을 보는 중이면 시작 칸·숫자 화면 모두 올리기 칸이 없다', () => {
    const { unmount } = drawDash(NONE, viewingWrap)
    noBox()
    unmount()
    drawDash(SAVED, viewingWrap)
    noBox()
  })

  it('AC-8810.7: 데스크 계정이면 시작 칸·숫자 화면 모두 올리기 칸이 없다', () => {
    const { unmount } = drawDash(NONE, deskWrap)
    noBox()
    unmount()
    drawDash(SAVED, deskWrap)
    noBox()
  })

  it.each([
    ['bit', 'ready'],
    ['egis', 'ready'],
    ['other', 'ready'],
    ['uisarang', 'loading'],
    ['uisarang', 'failed'],
  ] as const)('AC-8810.7·AC-8811.9: EMR %s · 병원 정보 %s이면 올리기 칸이 없다(비트·그 밖 화면 그대로)', (emr, state) => {
    clinic.view = profileView(emr, state)
    const { unmount } = drawDash(NONE)
    noBox()
    unmount()
    drawDash(SAVED)
    noBox()
  })
})

// ── 통계 탭: 진짜 StatsScreen 안 SourcePicker 자리 ──
const STATS_TODAY = '2026-11-27' // 금요일
const R30 = statsRange(STATS_TODAY, '30d')
const SAVED_AT = { at: '2026-11-26T10:05:00Z', source: 'uisarang' as const }
type Read = Awaited<ReturnType<typeof readDays>>
const readOf = (rows: DayPayload[], latest: Read['latest']): Read => ({ rows, dropped: 0, latest, fromFile: false })

function statsReads(saved: boolean) {
  vi.mocked(readDays).mockReset()
  vi.mocked(readDays).mockImplementation(async (range: DateRange) =>
    saved && range.from === R30.current.from ? readOf(eachDay({ from: '2026-11-20', to: '2026-11-26' }).map((d) => uisDay(d, 10, 2)), SAVED_AT) : readOf([], null),
  )
  vi.mocked(readMonths).mockReset()
  vi.mocked(readMonths).mockResolvedValue([] as never)
  vi.mocked(readCoverage).mockReset()
  vi.mocked(readCoverage).mockResolvedValue(saved ? [{ from: '2026-11-01', to: '2026-11-26' }] : [])
  vi.mocked(readUisPeriods).mockReset()
  vi.mocked(readUisPeriods).mockResolvedValue([])
  vi.mocked(listStatsRxGroups).mockReset()
  vi.mocked(listStatsRxGroups).mockResolvedValue([])
  vi.mocked(loadSunapSettings).mockReset()
  vi.mocked(loadSunapSettings).mockResolvedValue({ blockGroup: null, ptGroup: null, kinds: DEFAULT_RSV_KINDS })
  vi.mocked(listSunapDays).mockReset()
  vi.mocked(listSunapDays).mockResolvedValue([])
  vi.mocked(listCalendarCounts).mockReset()
  vi.mocked(listCalendarCounts).mockResolvedValue([])
  vi.mocked(loadCalendarSettings).mockReset()
  vi.mocked(loadCalendarSettings).mockResolvedValue(DEFAULT_CAL_SETTINGS)
  vi.mocked(loadGoal).mockReset()
  vi.mocked(loadGoal).mockResolvedValue({ visits: null, newPatients: null, revenue: null })
  for (const fn of Object.values(revenueStore)) fn.mockReset()
  revenueStore.loadDays.mockResolvedValue([])
  revenueStore.codeTotals.mockResolvedValue([])
  revenueStore.monthCodes.mockResolvedValue([])
}
const drawStats = (wrap: (node: ReactNode) => ReactNode = plain) => render(<>{wrap(<StatsScreen hospitalName="가짜가나의원" today={STATS_TODAY} />)}</>)
const statsShown = () =>
  waitFor(() => {
    expect(screen.queryByRole('heading', { name: '환자 요약', level: 2 })).toBeTruthy()
    expect(screen.queryByText('불러오는 중')).toBeNull()
  })
const pickerShown = () => screen.queryByRole('button', { name: '불러오기 설정' }) !== null || document.querySelector('input[type="file"]') !== null

describe('통계 탭 자리 (AC-8812.1 · AC-8810.6 · AC-8810.7)', () => {
  it('AC-8812.1·AC-8810.6: 의사랑 · 저장 숫자 있음 — 비트·파일 고르기 칸 대신 접은 올리기 칸(흰 상자 + st 선) 하나가 자료 줄 다음에 있다', async () => {
    statsReads(true)
    drawStats()
    await statsShown()
    expect(screen.getAllByRole('region', { name: TITLE })).toHaveLength(1)
    expect(lookOf(box())).toBe('folded')
    expect(box().className.split(/\s+/)).toEqual(expect.arrayContaining(['bg-surface', 'border-st-line']))
    expect(pickerShown()).toBe(false)
    expectOrder(screen.getByText(/^자료: 의사랑 엑셀 · .+ 저장/), box())
  })

  it('AC-8812.1·AC-8810.1: 의사랑 · 저장 숫자 없음 — 펼친 올리기 칸이고 빈 글 둘은 그대로다', async () => {
    statsReads(false)
    drawStats()
    await statsShown()
    await waitFor(() => expect(lookOf(box())).toBe('open'))
    expect(screen.getByText('아직 올린 의사랑 엑셀이 없어요')).toBeTruthy()
    expect(pickerShown()).toBe(false)
  })

  it('AC-8810.7: 다른 의원을 보는 중이면 통계 탭에 올리기 칸이 없다', async () => {
    statsReads(true)
    drawStats(viewingWrap)
    noBox()
    await waitFor(() => expect(readDays).toHaveBeenCalled())
    noBox()
    expect(pickerShown()).toBe(false)
  })

  it('AC-8810.7: 데스크 계정이면 통계 탭에 올리기 칸이 없다', async () => {
    statsReads(true)
    drawStats(deskWrap)
    await statsShown()
    noBox()
  })

  it('AC-8812.9: 비트 의원은 올리기 칸이 없고 지금 고르기 칸 그대로다', async () => {
    clinic.view = profileView('bit')
    statsReads(false)
    drawStats()
    await statsShown()
    noBox()
    expect(pickerShown()).toBe(true)
  })
})

describe('잇는 코드 (AC-8810.9 · AC-8810.10)', () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

  it('AC-8810.10: LiveDashboard는 이른 return 앞 맨 위에서 useUisUpload를 한 번 부르고 BitDashboard에 그리는 함수를 넘긴다(BitDashboard key 밖)', () => {
    const text = source('src/components/dashboard/summary/LiveDashboard.tsx')
    expect(text.match(/useUisUpload\(/g)).toHaveLength(1)
    expect(text.indexOf('useUisUpload(')).toBeLessThan(text.indexOf('if (drawn === null)'))
    expect(text).toContain('uisUpload={(look) => <UisUpload look={look} upload={upload} />}')
  })

  it('AC-8810.9: StatsScreen은 저장 뒤 data.reread()·revenue.reread()를 부르는 useUisUpload를 들고 null 자리 대신 통계 모양 UisUpload를 그린다', () => {
    const text = source('src/components/stats/StatsScreen.tsx')
    expect(text).toMatch(/useUisUpload\(\{\s*onSaved: \(\) => \{\s*data\.reread\(\)\s*revenue\.reread\(\)\s*\},?\s*\}\)/)
    expect(text).toContain('<UisUpload look={look} upload={upload} place="stats" />')
    expect(text).not.toMatch(/uisUploadSlot: UisUploadSlot = \(\) => null/)
  })
})
