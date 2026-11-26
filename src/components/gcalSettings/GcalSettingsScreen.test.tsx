// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalRules, type GcalView } from '@/types/gcal'
import type { CalSettings } from '@/types/calendar'

// 설정 › 구글 캘린더 화면 묶음(spec google-link REQ-8528 AC-8528.1, REQ-8540 AC-8540.3·AC-8540.4, design.md 2절 표 9·12, 15절).
// 안 메뉴 틀(GcalFrame, TASK-17)은 진짜로 그리고, 칸 넷(잇기·맞춤 방법 TASK-17, 시행자·종류 TASK-18, 가져오기 미리 보기 TASK-19)은 받은 값만 본다.
// 차례: 잇지 않음 → ① 잇기 → ② 시행자·종류 → ③ 가져오기 미리 보기(차례로만, 맞춤 방법은 닫힘) → 이은 뒤 맞춤 방법. 주소 ?tab=로 고르고 바꾸면 주소도 바꾼다.
// 가짜 값만(캘린더 이름·주소·비밀 글자는 지어낸 것)

const SOURCE = readFileSync(join(process.cwd(), 'src/components/gcalSettings/GcalSettingsScreen.tsx'), 'utf8')
const HID = '11111111-1111-4111-8111-111111111111'
const SCRIPT = 'https://script.google.com/macros/s/FAKEscriptFAKE0001/exec'
const STORED_SECRET = 'fake-secret-stored-000000000000000000000000'
const NEW_SECRET = 'fake-secret-new-111111111111111111111111111'
const CAL_ID = 'fake-calendar-0001@group.calendar.google.com'
const CAL_NAME = '샘플 예약 캘린더'

const { rpc, CLIENT, gcal, profileStore, calendarStore, gcalCall, loop, pullOnce, pushWaiting, makeGcalDeps, DEPS, colorsDeps, COLORS_DEPS, parts } = vi.hoisted(() => {
  const rpc = vi.fn(async (_name: string) => ({ data: '11111111-1111-4111-8111-111111111111' as string | null, error: null as unknown }))
  const DEPS = { fake: 'gcal-deps' }
  const COLORS_DEPS = { fake: 'colors-deps' }
  const part = (testId: string) => vi.fn((_props: Record<string, unknown>) => <div data-testid={testId} />)
  return {
    rpc,
    CLIENT: { rpc, from: vi.fn() },
    gcal: {
      loadGcalView: vi.fn<(client: unknown) => Promise<GcalView | null>>(),
      loadGcalState: vi.fn(),
      loadGcalLink: vi.fn(),
      saveGcalConnection: vi.fn(async (): Promise<void | 'invalid'> => undefined),
      saveGcalCalendar: vi.fn(async (): Promise<void | 'invalid'> => undefined),
      saveGcalRules: vi.fn(async (): Promise<void | 'invalid'> => undefined),
      unlinkGcal: vi.fn(async () => undefined),
    },
    profileStore: { loadClinicProfile: vi.fn() },
    calendarStore: { loadCalendarSettings: vi.fn() },
    gcalCall: vi.fn(),
    loop: { syncNow: vi.fn(), activeGcalDeps: vi.fn(() => null) },
    pullOnce: vi.fn(),
    pushWaiting: vi.fn(async () => ({ ok: true, sent: 0 })),
    makeGcalDeps: vi.fn((_args: Record<string, unknown>) => DEPS),
    DEPS,
    colorsDeps: vi.fn((_client: unknown, _push: () => Promise<unknown>) => COLORS_DEPS),
    COLORS_DEPS,
    parts: {
      GcalConnect: part('connect'),
      GcalRulesForm: part('rules'),
      StaffKinds: part('colors'),
      ImportPreview: part('import'),
    },
  }
})

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/gcal', () => gcal)
vi.mock('@/lib/storage/clinicProfile', () => profileStore)
vi.mock('@/lib/storage/calendar', () => calendarStore)
vi.mock('@/lib/gcal/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/gcal/client')>()), gcalCall }))
vi.mock('@/lib/gcal/loop', () => loop)
vi.mock('@/lib/gcal/pull', () => ({ pullOnce }))
vi.mock('@/lib/gcal/push', () => ({ pushWaiting }))
vi.mock('@/lib/gcal/deps', () => ({ makeGcalDeps }))
vi.mock('@/components/gcalSettings/colors/save', () => ({ colorsDeps }))
vi.mock('@/components/gcalSettings/connect/Connect', () => ({ GcalConnect: parts.GcalConnect }))
vi.mock('@/components/gcalSettings/rules/Rules', () => ({ GcalRulesForm: parts.GcalRulesForm }))
vi.mock('@/components/gcalSettings/colors/StaffKinds', () => ({ StaffKinds: parts.StaffKinds }))
vi.mock('@/components/gcalSettings/import/ImportPreview', () => ({ ImportPreview: parts.ImportPreview }))

import { GcalCallError } from '@/lib/gcal/client'
import { GcalSettingsScreen } from './GcalSettingsScreen'

const base: GcalView = {
  scriptUrl: SCRIPT,
  calendarId: null,
  calendarName: null,
  defaultHex: '#039BE5',
  linkedOn: null,
  rules: { ...DEFAULT_GCAL_RULES },
  look: { ...DEFAULT_GCAL_LOOK },
  hasSecret: true,
}
const FIRST: GcalView = { ...base, calendarId: CAL_ID, calendarName: CAL_NAME }
const LINKED: GcalView = { ...FIRST, linkedOn: '2026-11-23' }
const STATE = { pulledUntil: null, lastOkAt: '2026-11-26T05:40:00.000+00:00', failSince: null, failCode: null, arrivalUntil: null, arrivalDone: false }
const PROFILE = { displayName: null, phone: null, address: null, honorific: '원장님', hours: [], closedDates: [], staff: [], logoPath: null, emr: 'bit' }
const CAL_SETTINGS: CalSettings = { kinds: [], staff: [], openHour: 9, closeHour: 18, sunday: false }

type Props = Record<string, (...args: never[]) => unknown> & Record<string, unknown>
const last = (name: keyof typeof parts) => parts[name].mock.calls.at(-1)![0] as Props
const subMenu = () => screen.getByRole('group', { name: '구글 캘린더 안 메뉴' })
const menuButton = (name: string) => within(subMenu()).getByRole('button', { name })
const flow = () => screen.queryByRole('list', { name: '처음 잇기 차례' })
const flowNow = () => flow()?.querySelector('[aria-current="step"]')?.textContent ?? null

let replaceState: ReturnType<typeof vi.spyOn>
const lastUrl = () => replaceState.mock.calls.at(-1)?.[2] as string | undefined

function renderScreen(initialTab: 'connect' | 'colors' | 'import' | 'rules' | null = null, desk = false): ReturnType<typeof render> {
  const wrap = (node: ReactNode) => <RoleProvider desk={desk}>{node}</RoleProvider>
  return render(wrap(<GcalSettingsScreen initialTab={initialTab} />))
}
const shownPart = async () => screen.findByTestId(/^(connect|colors|import|rules)$/)

beforeEach(() => {
  replaceState = vi.spyOn(window.history, 'replaceState')
  for (const fn of [...Object.values(parts), ...Object.values(gcal), gcalCall, pullOnce, pushWaiting, makeGcalDeps, colorsDeps, loop.syncNow, rpc]) fn.mockClear()
  gcal.loadGcalView.mockReset().mockResolvedValue(null)
  gcal.loadGcalState.mockReset().mockResolvedValue(STATE)
  gcal.loadGcalLink.mockReset().mockResolvedValue({ ...FIRST, secret: STORED_SECRET })
  profileStore.loadClinicProfile.mockReset().mockResolvedValue(PROFILE)
  calendarStore.loadCalendarSettings.mockReset().mockResolvedValue(CAL_SETTINGS)
  loop.activeGcalDeps.mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  replaceState.mockRestore()
})

describe('AC-8528.1 설정 › 구글 캘린더 틀', () => {
  it("AC-8528.1: 제목 '설정' → 설정 안 메뉴 [설정 | 비트 PC 연결 | 구글 캘린더 + 새](지금 화면) → 구글 캘린더 안 메뉴 셋과 '원장 계정만 …' 글", async () => {
    renderScreen()
    await shownPart()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('설정')
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')])).toEqual([
      ['설정', '/settings', null],
      ['비트 PC 연결', '/claim/setup', null],
      ['구글 캘린더새', '/settings/google-calendar', 'page'],
    ])
    expect(within(subMenu()).getAllByRole('button').map((b) => b.textContent)).toEqual(['잇기', '시행자·종류', '맞춤 방법'])
    expect(screen.getByText('원장 계정만 바꿀 수 있어요 · 데스크 계정은 보기만 해요')).toBeTruthy()
  })

  it("AC-8528.1: 읽는 동안은 '불러오는 중', 읽지 못하면 오류 카드 E-SETTINGS-FAILED + [다시 시도]로 다시 읽는다(틀 머리는 그대로)", async () => {
    const user = userEvent.setup()
    let fail!: (e: unknown) => void
    gcal.loadGcalView.mockImplementationOnce(() => new Promise((_, reject) => (fail = reject)))
    renderScreen()
    expect(screen.getByRole('status').textContent).toBe('불러오는 중')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('설정')
    await act(async () => fail(new Error('offline')))
    expect((await screen.findByRole('alert')).textContent).toContain('E-SETTINGS-FAILED')
    expect(parts.GcalConnect).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByTestId('connect')).toBeTruthy()
    expect(gcal.loadGcalView).toHaveBeenCalledTimes(2)
  })

  it('AC-8528.1: 병원 id를 읽지 못해도(남의 병원·끊김) 읽기 실패와 같다', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    renderScreen()
    expect((await screen.findByRole('alert')).textContent).toContain('E-SETTINGS-FAILED')
  })

  it('AC-8528.1·AC-8540.3: 데스크도 이 화면을 본다 — 설정 안 메뉴에 [설정](/settings) 칸만 없고, 칸은 그대로 그린다(잠금은 각 칸이 한다)', async () => {
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen(null, true)
    expect(await screen.findByTestId('rules')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '설정 안 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['비트 PC 연결', '구글 캘린더새'])
    expect(within(subMenu()).getAllByRole('button').every((b) => !(b as HTMLButtonElement).disabled)).toBe(true)
  })

  it('AC-8528.1: 화면 뿌리가 그 병원 캘린더 기본 색으로 --cal-default를 덮는다(잇기 색 점·가져오기 미리 보기)', async () => {
    gcal.loadGcalView.mockResolvedValue(FIRST)
    const { container } = renderScreen()
    await shownPart()
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--cal-default')).toBe('#039BE5')
  })

  it('AC-8528.1: 소스는 PC 화면만이다(폰 전용 모양 max-md: 없음)', () => {
    expect(SOURCE).not.toMatch(/max-md:|max-sm:|\bsm:/)
  })
})

describe('AC-8540.4 안 메뉴 · 처음 잇기 차례', () => {
  it('AC-8540.4: 잇지 않은 병원(연결 줄 없음)은 처음 칸이 ① 잇기이고 차례 띠 ①이 지금, [맞춤 방법]은 닫혀 있다', async () => {
    renderScreen()
    expect(await screen.findByTestId('connect')).toBeTruthy()
    expect(last('GcalConnect').view).toBeNull()
    expect(flowNow()).toBe('① 잇기')
    expect(menuButton('잇기').getAttribute('aria-pressed')).toBe('true')
    expect((menuButton('맞춤 방법') as HTMLButtonElement).disabled).toBe(true)
    expect((menuButton('시행자·종류') as HTMLButtonElement).disabled).toBe(false)
    expect(lastUrl()).toBe('/settings/google-calendar?tab=connect')
  })

  it('AC-8540.4: 캘린더를 고르지 않은 병원도 [시행자·종류]는 열린다 — 차례 띠 없이(design.md 2절 표 9), 주소 ?tab=colors', async () => {
    const user = userEvent.setup()
    renderScreen()
    await screen.findByTestId('connect')
    await user.click(menuButton('시행자·종류'))
    expect(await screen.findByTestId('colors')).toBeTruthy()
    expect(flow()).toBeNull()
    expect(last('StaffKinds')).toMatchObject({ profile: PROFILE, settings: CAL_SETTINGS, link: null, deps: COLORS_DEPS })
    expect(lastUrl()).toBe('/settings/google-calendar?tab=colors')
  })

  it.each([
    ['rules', null, 'connect'],
    ['import', null, 'connect'],
    ['rules', FIRST, 'connect'],
    ['import', FIRST, 'colors'],
    ['colors', FIRST, 'colors'],
    ['import', LINKED, 'rules'],
    [null, LINKED, 'rules'],
    ['connect', LINKED, 'connect'],
  ] as const)('AC-8540.4: 주소 ?tab=%s · 연결 %# → 그 차례에 맞는 칸(%s)으로 연다', async (tab, view, shown) => {
    gcal.loadGcalView.mockResolvedValue(view)
    renderScreen(tab)
    expect((await shownPart()).getAttribute('data-testid')).toBe(shown)
    expect(lastUrl()).toBe(`/settings/google-calendar?tab=${shown}`)
  })

  it('AC-8540.4: 처음 잇기 차례 — ① 잇기에서 캘린더를 고르고 다음 → ② 시행자·종류(띠 ②) → 저장하고 다음 → ③ 가져오기 미리 보기(띠 ③) → 가져오면 이은 뒤 맞춤 방법과 알림', async () => {
    renderScreen()
    await screen.findByTestId('connect')
    // ①: 캘린더 저장 → 다음
    gcal.loadGcalView.mockResolvedValue(FIRST)
    await act(async () => {
      await last('GcalConnect').saveCalendar({ calendarId: CAL_ID, calendarName: CAL_NAME, defaultHex: '#039BE5' } as never)
      last('GcalConnect').onNext()
    })
    expect(gcal.saveGcalCalendar).toHaveBeenCalledWith(CLIENT, { calendarId: CAL_ID, calendarName: CAL_NAME, defaultHex: '#039BE5' })
    expect(await screen.findByTestId('colors')).toBeTruthy()
    await waitFor(() => expect(last('StaffKinds').link).toEqual(FIRST))
    expect(flowNow()).toBe('② 시행자·종류 확인')
    expect((menuButton('맞춤 방법') as HTMLButtonElement).disabled).toBe(true)
    expect(last('StaffKinds').band).toBeUndefined()
    // ②: 저장 → ③
    act(() => last('StaffKinds').onNext())
    expect(await screen.findByTestId('import')).toBeTruthy()
    expect(flowNow()).toBe('③ 가져오기 미리 보기')
    expect(menuButton('잇기').getAttribute('aria-pressed')).toBe('true')
    expect(last('ImportPreview').deps).toBe(DEPS)
    expect(makeGcalDeps).toHaveBeenCalledWith({ client: CLIENT, hospitalId: HID, call: gcalCall })
    expect(lastUrl()).toBe('/settings/google-calendar?tab=import')
    // ③ [← 시행자·종류 고치기]
    act(() => last('ImportPreview').onBack())
    expect(await screen.findByTestId('colors')).toBeTruthy()
    act(() => last('StaffKinds').onNext())
    await screen.findByTestId('import')
    // ③ 가져오기 끝 → 이은 뒤
    gcal.loadGcalView.mockResolvedValue(LINKED)
    await act(async () => void last('ImportPreview').onDone!({ result: {}, notice: '가져왔어요 · 1,234개를 넣었어요' } as never))
    expect(await screen.findByTestId('rules')).toBeTruthy()
    expect(flow()).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('가져왔어요 · 1,234개를 넣었어요')
    expect(last('GcalRulesForm').view).toEqual(LINKED)
    expect(lastUrl()).toBe('/settings/google-calendar?tab=rules')
  })

  it('AC-8540.4: 이은 병원은 처음 칸이 맞춤 방법, 안 메뉴 셋이 다 열리고 차례 띠가 없다. 시행자·종류에는 위 이어짐 띠(캘린더 이름·이은 날·마지막 맞춤)를 넘긴다', async () => {
    const user = userEvent.setup()
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen()
    expect(await screen.findByTestId('rules')).toBeTruthy()
    expect(last('GcalRulesForm')).toMatchObject({ view: LINKED, lastOkAt: STATE.lastOkAt })
    expect(flow()).toBeNull()
    expect(within(subMenu()).getAllByRole('button').map((b) => (b as HTMLButtonElement).disabled)).toEqual([false, false, false])
    await user.click(menuButton('시행자·종류'))
    await screen.findByTestId('colors')
    expect(flow()).toBeNull()
    const band = render(<>{last('StaffKinds').band as unknown as ReactNode}</>).container
    expect(band.textContent).toContain('이어져 있어요 · ')
    expect(band.textContent).toContain(CAL_NAME)
    expect(band.textContent).toContain('11/23 (월)부터')
    expect(band.textContent).toMatch(/마지막 맞춤 \d{2}:\d{2}/)
    // [잇기로 돌아가기] → 잇기
    act(() => (last('StaffKinds').onBack as () => void)())
    expect(await screen.findByTestId('connect')).toBeTruthy()
  })

  it('AC-8540.4: 시행자·종류 [저장] 뒤 받은 값으로 다른 칸이 새 값을 본다(병원 정보·종류·제목 꼴)', async () => {
    const user = userEvent.setup()
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen('colors')
    await screen.findByTestId('colors')
    const look = { ...DEFAULT_GCAL_LOOK, cancel: 'banana' as const }
    const kinds = [{ id: 'k1', label: '도수', color: null, len: 30, words: ['도수'] }]
    act(() => (last('StaffKinds').onSaved as (s: unknown) => void)({ profile: { ...PROFILE, phone: '0212345678' }, kinds, look }))
    await user.click(menuButton('맞춤 방법'))
    await screen.findByTestId('rules')
    expect((last('GcalRulesForm').view as unknown as GcalView).look).toEqual(look)
    await user.click(menuButton('시행자·종류'))
    await screen.findByTestId('colors')
    expect(last('StaffKinds')).toMatchObject({ profile: { phone: '0212345678' }, settings: { kinds }, link: { look } })
  })
})

describe('AC-8540.4 칸마다 잇는 것', () => {
  it('AC-8540.4: 잇기 [연결 시험]은 그 주소·비밀 글자로 구글 코드 ping을 부르고, 비밀 글자 칸이 비면(null) 저장해 둔 것으로 부른다. 답의 캘린더 목록을 넘긴다', async () => {
    gcal.loadGcalView.mockResolvedValue(FIRST)
    renderScreen('connect')
    await screen.findByTestId('connect')
    const ping = last('GcalConnect').ping as (input: { scriptUrl: string; secret: string | null }) => Promise<unknown>
    gcalCall.mockResolvedValueOnce({ ok: true, version: '1', now: '2026-11-26T05:40:00.000Z', calendars: [{ id: CAL_ID, name: CAL_NAME, access: 'owner', hex: '#039BE5', past: 3, future: 4 }] })
    await expect(ping({ scriptUrl: SCRIPT, secret: NEW_SECRET })).resolves.toMatchObject({
      ok: true,
      version: '1',
      calendars: [{ id: CAL_ID, name: CAL_NAME, access: 'owner', hex: '#039BE5', past: 3, future: 4 }],
    })
    expect(gcalCall).toHaveBeenLastCalledWith({ scriptUrl: SCRIPT, secret: NEW_SECRET }, 'ping')
    gcalCall.mockResolvedValueOnce({ ok: true, version: '1', calendars: [] })
    await ping({ scriptUrl: SCRIPT, secret: null })
    expect(gcalCall).toHaveBeenLastCalledWith({ scriptUrl: SCRIPT, secret: STORED_SECRET }, 'ping')
  })

  it('AC-8540.4: [연결 시험]이 구글 코드 오류면 {ok:false, code}로 돌려주고(던지지 않음), 저장한 비밀 글자가 없으면 E-GCAL-NOKEY', async () => {
    renderScreen('connect')
    await screen.findByTestId('connect')
    const ping = last('GcalConnect').ping as (input: { scriptUrl: string; secret: string | null }) => Promise<unknown>
    gcalCall.mockRejectedValueOnce(new GcalCallError('E-GCAL-KEY'))
    await expect(ping({ scriptUrl: SCRIPT, secret: NEW_SECRET })).resolves.toMatchObject({ ok: false, code: 'E-GCAL-KEY', error: 'E-GCAL-KEY' })
    gcalCall.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(ping({ scriptUrl: SCRIPT, secret: NEW_SECRET })).resolves.toMatchObject({ ok: false, code: 'E-GCAL-REACH' })
    gcal.loadGcalLink.mockResolvedValueOnce(null)
    gcalCall.mockClear()
    await expect(ping({ scriptUrl: SCRIPT, secret: null })).resolves.toMatchObject({ ok: false, code: 'E-GCAL-NOKEY' })
    expect(gcalCall).not.toHaveBeenCalled()
  })

  it('AC-8540.4: 잇기 저장 — 주소·비밀 글자는 saveGcalConnection(비밀 글자 칸이 비면 저장해 둔 것), 고른 캘린더는 saveGcalCalendar', async () => {
    renderScreen('connect')
    await screen.findByTestId('connect')
    const save = last('GcalConnect').saveConnection as (input: { scriptUrl: string; secret: string | null }) => Promise<unknown>
    await save({ scriptUrl: SCRIPT, secret: NEW_SECRET })
    expect(gcal.saveGcalConnection).toHaveBeenLastCalledWith(CLIENT, { scriptUrl: SCRIPT, secret: NEW_SECRET })
    await save({ scriptUrl: SCRIPT, secret: null })
    expect(gcal.saveGcalConnection).toHaveBeenLastCalledWith(CLIENT, { scriptUrl: SCRIPT, secret: STORED_SECRET })
    gcal.loadGcalLink.mockResolvedValueOnce(null)
    await expect(save({ scriptUrl: SCRIPT, secret: null })).resolves.toBe('invalid')
  })

  it('AC-8540.4: 맞춤 방법 — 저장은 saveGcalRules, [지금 맞추기]는 도는 맞춤(syncNow)의 바뀐 수, 맞춤이 안 돌면 한 번 받아 오기(pullOnce)', async () => {
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen()
    await screen.findByTestId('rules')
    const rules: GcalRules = { pullMin: 5, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: false }
    await (last('GcalRulesForm').saveRules as (r: GcalRules) => Promise<unknown>)(rules)
    expect(gcal.saveGcalRules).toHaveBeenCalledWith(CLIENT, rules)
    const syncNow = last('GcalRulesForm').syncNow as () => Promise<unknown>
    loop.syncNow.mockResolvedValueOnce({ ok: true, changed: 3, sent: 1, at: '2026-11-26T05:41:00.000Z' })
    await expect(syncNow()).resolves.toEqual({ ok: true, changed: 3 })
    loop.syncNow.mockResolvedValueOnce({ ok: false, code: 'E-GCAL-LIMIT' })
    await expect(syncNow()).resolves.toEqual({ ok: false, code: 'E-GCAL-LIMIT' })
    loop.syncNow.mockResolvedValueOnce({ ok: false, code: null })
    pullOnce.mockResolvedValueOnce({ ok: true, changed: 2, at: '2026-11-26T05:42:00.000Z', full: false })
    await expect(syncNow()).resolves.toEqual({ ok: true, changed: 2 })
    expect(pullOnce).toHaveBeenCalledWith(DEPS)
    loop.syncNow.mockResolvedValueOnce({ ok: false, code: null })
    pullOnce.mockResolvedValueOnce({ ok: false, code: null, off: false })
    await expect(syncNow()).resolves.toEqual({ ok: false, code: 'E-GCAL-REACH' })
  })

  it('AC-8540.4: [잇기 끊기] → unlinkGcal 뒤 다시 읽어 ① 잇기로 돌아간다. [연결 시험 · 캘린더 바꾸기] → 잇기', async () => {
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen()
    await screen.findByTestId('rules')
    act(() => (last('GcalRulesForm').onChangeCalendar as () => void)())
    expect(await screen.findByTestId('connect')).toBeTruthy()
    expect(flow()).toBeNull()
    act(() => menuButton('맞춤 방법').click())
    await screen.findByTestId('rules')
    gcal.loadGcalView.mockResolvedValue({ ...LINKED, calendarId: null, linkedOn: null })
    await act(async () => void (await (last('GcalRulesForm').unlink as () => Promise<void>)()))
    expect(gcal.unlinkGcal).toHaveBeenCalledWith(CLIENT)
    expect(await screen.findByTestId('connect')).toBeTruthy()
    expect(flowNow()).toBe('① 잇기')
  })

  it('AC-8540.4: 시행자·종류 저장 묶음은 colorsDeps(client, 바뀐 색 보내기 = pushWaiting(맞춤 deps))다', async () => {
    gcal.loadGcalView.mockResolvedValue(LINKED)
    renderScreen('colors')
    await screen.findByTestId('colors')
    expect(colorsDeps).toHaveBeenCalled()
    const [client, push] = colorsDeps.mock.calls.at(-1)!
    expect(client).toBe(CLIENT)
    await push()
    expect(pushWaiting).toHaveBeenCalledWith(DEPS)
  })
})
