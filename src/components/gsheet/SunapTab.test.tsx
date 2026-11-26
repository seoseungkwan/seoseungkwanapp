// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { FillOutcome, RunnerDeps } from '@/lib/gsheet/runner'
import type { FillJob } from '@/lib/gsheet/shapes'
import { fillStatus } from '@/lib/gsheet/status'
import { DEFAULT_GSHEET_SETTINGS, type GsheetMonth, type GsheetRun, type GsheetRunInput, type GsheetSaved } from '@/types/gsheet'
import type { BridgeState, HelloResult } from '@/types/bridge'

// 수납일지 탭 묶음(spec google-link REQ-8514 AC-8514.1, design.md 15절 '수납', 시안 docs/mockups/google-link/sunap.html tabHead).
// 탭 머리 두 칸 [구글 시트] [웹앱 수납일지](tablist '수납일지 보기', 숨은 제목 '수납일지') → [구글 시트]는 TASK-15 보기(SheetView)·TASK-16 설정(SheetSettings·SheetGuide)을,
// [웹앱 수납일지]는 지금 수납일지 화면(SunapScreen)을 그대로 그린다. 보기·설정 화면 자체는 각 TASK 시험이 보고, 여기서는 잇기(받는 값·넣기 runFill·도우미 부르기)만 본다.
// 가짜 값만(병원 이름·비밀 글자 표시는 지어낸 것)

const SOURCE = readFileSync(join(process.cwd(), 'src/components/gsheet/SunapTab.tsx'), 'utf8')
const TODAY = '2026-11-26'
const CLIENT = { fake: 'supabase-client' }
const HOSPITAL = '샘플정형외과의원'
// 도우미 비밀 글자 표시(16진수 16자) — 지어낸 값
const TAG = '0123456789abcdef'

const { SunapScreen, SheetView, SheetSettings, SheetGuide, useBridge, store, runFill, bridge } = vi.hoisted(() => {
  const bridge = {
    state: 'ready' as BridgeState,
    hello: { state: 'ready', helperVersion: '0.14.0', extensionVersion: '0.5.0', helperUpdateAvailable: false } as HelloResult | null,
    helloError: null as string | null,
    call: vi.fn<(cmd: string, args: unknown) => Promise<unknown>>(),
  }
  return {
    bridge,
    SunapScreen: vi.fn((_props: { initialToday: string }) => <p>웹앱 수납일지 화면</p>),
    SheetView: vi.fn((_props: Record<string, unknown>) => <div data-testid="sheet-view" />),
    SheetSettings: vi.fn((_props: Record<string, unknown>) => <div data-testid="sheet-settings" />),
    SheetGuide: vi.fn((_props: { onClose: () => void }) => <div data-testid="sheet-guide" />),
    useBridge: vi.fn((_opts?: unknown) => ({ ...bridge, stream: vi.fn(), onProgress: vi.fn(), close: vi.fn(), retry: vi.fn(), helperUpdateAvailable: false })),
    store: {
      loadGsheetSettings: vi.fn<(client: unknown) => Promise<GsheetSaved>>(),
      listGsheetMonths: vi.fn<(client: unknown) => Promise<GsheetMonth[]>>(),
      listGsheetRuns: vi.fn<(client: unknown, fromIso: string) => Promise<GsheetRun[]>>(),
      addGsheetRun: vi.fn(async () => undefined),
      upsertGsheetMonths: vi.fn(async () => undefined),
    },
    runFill: vi.fn<(deps: RunnerDeps, job: FillJob) => Promise<FillOutcome>>(),
  }
})

vi.mock('@/components/sunap/SunapScreen', () => ({ SunapScreen }))
vi.mock('@/components/gsheet/view/SheetView', () => ({ SheetView }))
vi.mock('@/components/gsheet/settings/SheetSettings', () => ({ SheetSettings }))
vi.mock('@/components/gsheet/settings/SheetGuide', () => ({ SheetGuide }))
vi.mock('@/components/claim/useBridge', () => ({ useBridge }))
vi.mock('@/lib/storage/gsheet', () => store)
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/components/clinic/useClinicProfile', () => ({ useClinicProfile: () => ({ state: 'ready', name: HOSPITAL }) }))
vi.mock('@/lib/gsheet/runner', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/gsheet/runner')>()), runFill }))

import { SunapTab } from './SunapTab'

const SAVED: GsheetSaved = { settings: { ...DEFAULT_GSHEET_SETTINGS, templateUrl: 'https://docs.google.com/spreadsheets/d/FAKEFILEID0001/edit' }, secretTag: TAG }
const MONTHS: GsheetMonth[] = [{ ym: '2026-11', fileId: 'FAKEFILEID0002', gids: { '26': 101 } }]
const RUNS: GsheetRun[] = [
  { at: '2026-11-26T01:00:00.000Z', day: TODAY, via: 'auto', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 7, counts: {}, cells: [] },
]
// 통로가 넘기는 sheet.status 답 그대로(검사만 하고 고치지 않은 묶음 — 부르는 쪽이 readStatus로 다시 읽는다)
const STATUS = (secretTag: string | null, shareWith: string[] = ['a@fake.test', 'b@fake.test']) => ({
  v: 1,
  secretTag,
  bitsheet: false,
  codeVersion: '8',
  url: null,
  shareWith,
  verified: true,
})

const tablist = () => screen.getByRole('tablist', { name: '수납일지 보기' })
const tabs = () => within(tablist()).getAllByRole('tab')
const viewProps = () => SheetView.mock.calls.at(-1)![0] as {
  saved: GsheetSaved
  months: GsheetMonth[]
  runs: GsheetRun[]
  hospitalName: string
  shareCount?: number | null
  onFill: (job: FillJob) => Promise<FillOutcome>
  onOpenSettings: () => void
  onOpenGuide: () => void
}
const settingsProps = () => SheetSettings.mock.calls.at(-1)![0] as {
  client: unknown
  call: (cmd: string, args: Record<string, unknown>) => Promise<unknown>
  saved: GsheetSaved
  onChanged: (saved: GsheetSaved) => void
  onClose: () => void
}
const JOB: FillJob = { day: TODAY, mode: 'fillEmpty', via: 'hand', auto: false }

function setBridge(state: BridgeState, versions: { helper?: string; extension?: string } | null = { helper: '0.14.0', extension: '0.5.0' }, helloError: string | null = null) {
  bridge.state = state
  bridge.helloError = helloError
  bridge.hello = versions === null ? null : { state, helperVersion: versions.helper, extensionVersion: versions.extension, helperUpdateAvailable: false }
}

const renderTab = (desk = false) =>
  render(
    <RoleProvider desk={desk}>
      <SunapTab initialToday={TODAY} />
    </RoleProvider>,
  )

async function shown() {
  await screen.findByTestId('sheet-view')
  return viewProps()
}

beforeEach(() => {
  fillStatus.reset()
  for (const fn of [SunapScreen, SheetView, SheetSettings, SheetGuide, useBridge, runFill]) fn.mockClear()
  for (const fn of Object.values(store)) fn.mockReset()
  store.loadGsheetSettings.mockResolvedValue(SAVED)
  store.listGsheetMonths.mockResolvedValue(MONTHS)
  store.listGsheetRuns.mockResolvedValue(RUNS)
  store.addGsheetRun.mockResolvedValue(undefined)
  store.upsertGsheetMonths.mockResolvedValue(undefined)
  setBridge('ready')
  bridge.call.mockReset().mockImplementation(async (cmd) => (cmd === 'sheet.status' ? STATUS(TAG) : {}))
  runFill.mockReset().mockResolvedValue({ kind: 'busy' })
})
afterEach(() => {
  cleanup()
  fillStatus.reset()
})

describe('AC-8514.1 수납일지 탭 머리', () => {
  it("AC-8514.1: 탭 머리는 두 칸 고르기 [구글 시트] [웹앱 수납일지](tablist '수납일지 보기')이고 기본은 [구글 시트], 숨은 제목 '수납일지'가 그 앞에 있다", async () => {
    renderTab()
    expect(tabs().map((t) => t.textContent)).toEqual(['구글 시트', '웹앱 수납일지'])
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('수납일지')
    expect(h1.className).toContain('sr-only')
    expect(h1.compareDocumentPosition(tablist()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 구글 시트 칸: 보기(TASK-15)를 그리고 웹앱 수납일지 화면은 그리지 않는다
    await shown()
    expect(SunapScreen).not.toHaveBeenCalled()
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0]!.id)
    expect(within(panel).getByTestId('sheet-view')).toBeTruthy()
  })

  it('AC-8514.1: [웹앱 수납일지]를 누르면 지금 수납일지 화면(SunapScreen)이 initialToday 그대로 나오고, 구글 시트 보기·탭 묶음의 숨은 제목은 없다(SunapScreen이 제목을 그린다)', async () => {
    const user = userEvent.setup()
    renderTab()
    await shown()
    await user.click(screen.getByRole('tab', { name: '웹앱 수납일지' }))
    expect(screen.getByText('웹앱 수납일지 화면')).toBeTruthy()
    expect(SunapScreen.mock.calls.at(-1)![0]).toEqual({ initialToday: TODAY })
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true'])
    expect(screen.queryByTestId('sheet-view')).toBeNull()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(readFileSync(join(process.cwd(), 'src/components/sunap/SunapScreen.tsx'), 'utf8')).toContain('<h1 className="sr-only">수납일지</h1>')
    // 다시 [구글 시트]
    await user.click(screen.getByRole('tab', { name: '구글 시트' }))
    await shown()
    expect(screen.queryByText('웹앱 수납일지 화면')).toBeNull()
  })

  it('AC-8514.1: 데스크도 같다 — 탭 머리 두 칸, 기본 [구글 시트], [웹앱 수납일지]는 지금 화면', async () => {
    const user = userEvent.setup()
    renderTab(true)
    expect(tabs().map((t) => [t.textContent, t.getAttribute('aria-selected')])).toEqual([
      ['구글 시트', 'true'],
      ['웹앱 수납일지', 'false'],
    ])
    await shown()
    await user.click(screen.getByRole('tab', { name: '웹앱 수납일지' }))
    expect(screen.getByText('웹앱 수납일지 화면')).toBeTruthy()
  })

  it('AC-8514.1: 탭 머리는 화살표 키로도 옮긴다(고른 칸만 Tab으로 닿는다)', async () => {
    const user = userEvent.setup()
    renderTab()
    await shown()
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1])
    tabs()[0]!.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('웹앱 수납일지 화면')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '웹앱 수납일지' }))
    await user.keyboard('{ArrowLeft}')
    await shown()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '구글 시트' }))
  })

  it('AC-8514.1: 구글 시트 칸만 앱 폭 제한을 푼다(data-wide-page — 시트 틀이 넓게), 웹앱 수납일지 칸은 지금 화면 그대로', async () => {
    const user = userEvent.setup()
    const { container } = renderTab()
    await shown()
    expect(container.querySelectorAll('[data-wide-page]')).toHaveLength(1)
    await user.click(screen.getByRole('tab', { name: '웹앱 수납일지' }))
    expect(container.querySelectorAll('[data-wide-page]')).toHaveLength(0)
  })

  it('AC-8514.1: 소스는 PC 화면만이다(폰 전용 모양 max-md: 없음)', () => {
    expect(SOURCE).not.toMatch(/max-md:|max-sm:|\bsm:/)
  })
})

describe('AC-8514.1 구글 시트 칸 잇기', () => {
  it('AC-8514.1: 서버 설정·달 목록·최근 7일 기록(오늘 포함)을 읽어 보기에 넘기고, 파일 이름 병원 자리는 앱 병원 이름이다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-26T03:00:00.000Z'))
    try {
      renderTab()
      const props = await shown()
      expect(props.saved).toEqual(SAVED)
      expect(props.months).toEqual(MONTHS)
      expect(props.runs).toEqual(RUNS)
      expect(props.hospitalName).toBe(HOSPITAL)
      expect(store.loadGsheetSettings).toHaveBeenCalledWith(CLIENT)
      expect(store.listGsheetMonths).toHaveBeenCalledWith(CLIENT)
      expect(store.listGsheetRuns).toHaveBeenCalledWith(CLIENT, '2026-11-19T03:00:00.000Z')
      // 통로는 Worker 없이 연다(숫자 답뿐)
      expect(useBridge).toHaveBeenCalled()
      expect(useBridge.mock.calls.every(([opts]) => opts === undefined)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it("AC-8514.1: 읽는 동안은 '불러오는 중', 읽지 못하면 오류 카드 E-SETTINGS-FAILED + [다시 시도] → 다시 읽어 보기를 그린다", async () => {
    const user = userEvent.setup()
    let fail!: (e: unknown) => void
    store.loadGsheetSettings.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    renderTab()
    expect(screen.getByRole('status').textContent).toBe('불러오는 중')
    await act(async () => fail(new Error('offline')))
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain('E-SETTINGS-FAILED')
    expect(SheetView).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await shown()
    expect(store.loadGsheetSettings).toHaveBeenCalledTimes(2)
  })

  it('AC-8514.1: [지금 넣기](onFill)는 runFill에 이 화면 통로·서버 설정·넣는 PC 표시·기록 저장(Supabase)을 넘기고 결과를 그대로 돌려준다', async () => {
    runFill.mockResolvedValue({ kind: 'unreachable', code: 'E-GSHEET-NET' })
    renderTab()
    const props = await shown()
    const outcome = await props.onFill(JOB)
    expect(outcome).toEqual({ kind: 'unreachable', code: 'E-GSHEET-NET' })
    expect(runFill).toHaveBeenCalledTimes(1)
    const [deps, job] = runFill.mock.calls[0]!
    expect(job).toEqual(JOB)
    expect(deps.settings).toEqual(SAVED.settings)
    expect(deps.secretTag).toBe(TAG)
    expect(deps.now()).toBeInstanceOf(Date)
    const run: GsheetRunInput = { day: TODAY, via: 'hand', mode: 'fillEmpty', outcome: 'ok', code: null, rows: 3, counts: {}, cells: [] }
    await deps.store.addRun(run)
    expect(store.addGsheetRun).toHaveBeenCalledWith(CLIENT, run)
    await deps.store.upsertMonths(MONTHS)
    expect(store.upsertGsheetMonths).toHaveBeenCalledWith(CLIENT, MONTHS)
    bridge.call.mockClear()
    await deps.call('sheet.fill', { day: TODAY })
    expect(bridge.call).toHaveBeenCalledWith('sheet.fill', { day: TODAY })
  })

  it("AC-8514.1: 넣기 답이 '넣는 PC 아님'이면 넣기 상태를 보기만으로 바꾼다", async () => {
    runFill.mockResolvedValue({ kind: 'viewer' })
    renderTab()
    const props = await shown()
    await waitFor(() => expect(fillStatus.get().pc).toBe('filler'))
    await act(async () => void (await props.onFill(JOB)))
    expect(fillStatus.get().pc).toBe('viewer')
  })

  it('AC-8514.1·AC-8541.2: 도우미가 0.14.0보다 낮거나 확장이 0.5.0보다 낮으면 도우미 부르기는 sheet.*를 보내지 않고 E-GSHEET-EXT로 끝나고, 넣기 상태는 보기만 + 옛 판 표시다', async () => {
    for (const [versions, old] of [
      [{ helper: '0.13.2', extension: '0.5.0' }, { helper: true, extension: false }],
      [{ helper: '0.14.0', extension: '0.4.9' }, { helper: false, extension: true }],
      [{ helper: '0.13.0', extension: '0.4.0' }, { helper: true, extension: true }],
    ] as const) {
      fillStatus.reset()
      setBridge('ready', versions)
      bridge.call.mockClear()
      renderTab()
      const props = await shown()
      act(() => props.onOpenSettings())
      await screen.findByTestId('sheet-settings')
      const { call } = settingsProps()
      await expect(call('sheet.status', {})).rejects.toMatchObject({ code: 'E-GSHEET-EXT' })
      expect(bridge.call).not.toHaveBeenCalled()
      expect(fillStatus.get()).toMatchObject({ pc: 'viewer', oldHelper: old.helper, oldExtension: old.extension })
      cleanup()
    }
  })

  it.each([
    ['no-helper', 'E-HELPER-MISSING'],
    ['no-extension', 'E-EXT-MISSING'],
    ['busy', 'E-BRIDGE-BUSY'],
    ['disconnected', 'E-BRIDGE-DISCONNECTED'],
  ] as const)('AC-8514.1: 통로가 %s면 도우미 부르기는 보내지 않고 %s로 끝난다', async (state, code) => {
    setBridge(state, null)
    renderTab()
    const props = await shown()
    const outcome = runFill.mockImplementation(async (deps) => {
      await deps.call('sheet.status', {})
      return { kind: 'busy' }
    })
    expect(outcome).toBe(runFill)
    await expect(props.onFill(JOB)).rejects.toMatchObject({ code })
    expect(bridge.call).not.toHaveBeenCalled()
  })

  it('AC-8514.1: 통로가 아직 붙는 중이면 도우미 부르기는 hello가 끝날 때까지 기다렸다가 보낸다', async () => {
    setBridge('connecting', null)
    const { rerender } = renderTab()
    await shown()
    const { call } = (await (async () => {
      act(() => viewProps().onOpenSettings())
      await screen.findByTestId('sheet-settings')
      return settingsProps()
    })())
    let settled = false
    const pending = call('sheet.ping', { url: 'x' }).then((r) => {
      settled = true
      return r
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(bridge.call).not.toHaveBeenCalled()
    bridge.call.mockResolvedValueOnce({ ok: true })
    setBridge('ready')
    rerender(
      <RoleProvider desk={false}>
        <SunapTab initialToday={TODAY} />
      </RoleProvider>,
    )
    await expect(pending).resolves.toBeDefined()
    expect(bridge.call).toHaveBeenCalledWith('sheet.ping', { url: 'x' })
  })

  it('AC-8514.1·AC-8514.7: 통로가 준비되면 sheet.status 한 번으로 넣는 PC인지 정하고(서버 표시와 같으면 넣는 PC), 함께 쓸 메일 수를 보기에 넘긴다', async () => {
    renderTab()
    await shown()
    await waitFor(() => expect(fillStatus.get().pc).toBe('filler'))
    expect(bridge.call.mock.calls.filter(([cmd]) => cmd === 'sheet.status')).toHaveLength(1)
    await waitFor(() => expect(viewProps().shareCount).toBe(2))
  })

  it('AC-8514.7: 도우미 비밀 글자 표시가 서버와 다르면 보기만이고 메일 수는 모른다(null)', async () => {
    bridge.call.mockImplementation(async (cmd) => (cmd === 'sheet.status' ? STATUS('fedcba9876543210') : {}))
    renderTab()
    await shown()
    await waitFor(() => expect(fillStatus.get().pc).toBe('viewer'))
    expect(viewProps().shareCount ?? null).toBeNull()
  })

  it('AC-8514.1: [설정]·[설정 열기]는 탭 본문을 설정 화면(SheetSettings)으로 바꾸고 client·도우미 부르기·서버 설정을 넘긴다. 바뀐 설정은 돌아온 보기에 그대로 간다', async () => {
    renderTab()
    const props = await shown()
    act(() => props.onOpenSettings())
    await screen.findByTestId('sheet-settings')
    expect(screen.queryByTestId('sheet-view')).toBeNull()
    // 탭 머리는 그대로
    expect(tabs().map((t) => t.textContent)).toEqual(['구글 시트', '웹앱 수납일지'])
    const s = settingsProps()
    expect(s.client).toBe(CLIENT)
    expect(s.saved).toEqual(SAVED)
    const next: GsheetSaved = { settings: { ...SAVED.settings, autoOn: false }, secretTag: '00000000000000aa' }
    act(() => s.onChanged(next))
    act(() => settingsProps().onClose())
    await shown()
    expect(viewProps().saved).toEqual(next)
  })

  it('AC-8514.1: [안내문 보기]는 안내문(SheetGuide)을 그리고 닫으면 보기로 돌아온다', async () => {
    renderTab()
    const props = await shown()
    act(() => props.onOpenGuide())
    await screen.findByTestId('sheet-guide')
    act(() => (SheetGuide.mock.calls.at(-1)![0] as { onClose: () => void }).onClose())
    await shown()
  })
})
