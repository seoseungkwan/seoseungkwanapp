// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { collectScan } from '@/lib/location/collect'
import { fillDeptRule } from '@/lib/location/depts'
import { fillScoreRule } from '@/lib/location/score'
import { SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import { addCompany } from '@/lib/storage/contacts'
import {
  addCandidate,
  addListing,
  addNote,
  addPhoto,
  deleteCandidate,
  deleteNote,
  deletePhoto,
  loadLocation,
  markCandidateEventsSeen,
  readFlowCache,
  saveDeptRule,
  saveFlowCache,
  saveHomeEswt,
  saveScoreRule,
  updateCandidate,
  updateListing,
  type LocationData,
} from '@/lib/storage/location'
import type { LocationNote, LocationPhoto, Query, QueryReply, Snapshot } from '@/types/location'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'
import { CAND_ID, makeCandidate, makeListing, makeSnapshot, OTHER_LISTING, TODAY } from './detail/frame/frame.test.data'
import { LocationScreen } from './LocationScreen'
import { INDEX } from './scan/scanData.test.data'
import { useLocation } from './useLocation'

// 다른 의원 보기 — 입지 분석 읽기만 (specs/admin-view TASK-10 · REQ-8010 AC-8010.2, design.md '탭마다 읽기만' 입지 분석 줄).
// 저장 함수·부르기(clients)·supabaseBrowser만 흉내 내고 안쪽 부품은 진짜를 그린다(LocationScreen.test.tsx와 같은 틀).
// 보는 중(ViewingProvider viewing=가짜)과 아닐 때(viewing=null)를 견준다. 바깥 자료 읽기(/api/ai/location/*)는 읽기라 그대로다. 이름·주소는 지어낸 것이다
const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/location', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/location')>()
  return {
    ...real,
    loadLocation: vi.fn(),
    saveScoreRule: vi.fn(),
    resetScoreRule: vi.fn(),
    saveDeptRule: vi.fn(),
    resetDeptRule: vi.fn(),
    saveHomeEswt: vi.fn(),
    addCandidate: vi.fn(),
    updateCandidate: vi.fn(),
    deleteCandidate: vi.fn(),
    addListing: vi.fn(),
    updateListing: vi.fn(),
    deleteListing: vi.fn(),
    addNote: vi.fn(),
    deleteNote: vi.fn(),
    addPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    readPhoto: vi.fn(async () => null),
    removePhotos: vi.fn(),
    markCandidateEventsSeen: vi.fn(),
    markEventsSeen: vi.fn(),
    readFlowCache: vi.fn(),
    saveFlowCache: vi.fn(),
  }
})
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/contacts')>()),
  loadContacts: vi.fn(),
  addCompany: vi.fn(),
  addPerson: vi.fn(),
}))
vi.mock('./clients', () => ({
  queryLocation: vi.fn(),
  readKeys: vi.fn(),
  readDongIndex: vi.fn(),
  readDongs: vi.fn(),
  readTransitIndex: vi.fn(),
  readRail: vi.fn(),
  readBus: vi.fn(),
}))
// 진짜 모으기를 돌리되 받은 deps를 엿본다
vi.mock('@/lib/location/collect', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/location/collect')>()
  return { ...real, collect: vi.fn(real.collect), collectScan: vi.fn(real.collectScan) }
})

const VIEW: Viewing = { hospitalId: '00000000-0000-4000-8000-0000000000a1', name: '가짜하늘정형외과의원' }
const ROAD = '예시로 12'
const LOT = { bcode: '1199951000', main: 1, sub: 2, san: false }

function fakeAsk(q: Query): Promise<QueryReply> {
  const ok = (value: unknown): QueryReply => ({ ok: true, value, src: 'kakao-local', asOf: TODAY })
  if (q.kind === 'k-point') return Promise.resolve(ok({ road: ROAD, jibun: '예시구 가람동 1-2', bjd: LOT.bcode, hjd: null, lot: LOT }))
  if (q.kind === 'k-near' || q.kind === 'k-keyword') return Promise.resolve(ok({ places: [], capped: false }))
  return Promise.resolve({ ok: false, code: 'failed' })
}

const ymdOf = (s: string) => (s.length === 4 ? `${s}-12-31` : s.length === 7 ? `${s}-01` : s)
function validSnapshot(): Snapshot {
  const s = makeSnapshot()
  const out: Record<string, unknown> = { ...s }
  for (const key of SNAPSHOT_KEYS) {
    const got = s[key]
    out[key] = got.ok ? { ...got, asOf: ymdOf(got.asOf) } : got
  }
  return out as Snapshot
}

const A = makeCandidate({ snapshot: validSnapshot() })
const NOTE: LocationNote = { id: '66666666-6666-4666-8666-666666666666', candidateId: CAND_ID, day: '2026-11-20', body: '건물주와 가짜 통화 메모', createdAt: '2026-11-20T01:00:00.000Z' }
const PHOTO: LocationPhoto = {
  id: '77777777-7777-4777-8777-777777777777',
  candidateId: CAND_ID,
  path: `${VIEW.hospitalId}/${CAND_ID}/1.jpg`,
  label: '건물 앞 가짜 사진',
  takenOn: '2026-11-20',
  createdAt: '2026-11-20T01:00:00.000Z',
}
function data(over: Partial<LocationData> = {}): LocationData {
  return {
    settings: { scoreRule: fillScoreRule(null), deptRule: fillDeptRule(null), homeEswt: 50000, updatedAt: null },
    candidates: [A],
    // 중개사 글이 있고 주소록에 안 이은 매물([주소록에 넣기] 자리) · 후보에 안 이은 매물([후보로 저장] 자리)
    listings: [makeListing({ brokerNote: '가짜공인중개사' }), OTHER_LISTING],
    notes: [NOTE],
    photos: [PHOTO],
    events: [],
    ...over,
  }
}

const wrap = (viewing: Viewing | null) =>
  function Wrap({ children }: { children: ReactNode }) {
    return <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
  }
async function open(viewing: Viewing | null, props: Parameters<typeof LocationScreen>[0] = {}) {
  const view = render(<LocationScreen {...props} />, { wrapper: wrap(viewing) })
  await waitFor(() => expect(screen.queryByText('입지 분석 자료를 불러오고 있어요')).toBeNull())
  return view
}
const button = (name: string | RegExp) => screen.queryByRole('button', { name })
const inputsOf = (root: HTMLElement) => Array.from(root.querySelectorAll('input, textarea, select')) as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)[]
/** 적는 칸이 모두 읽기만(readOnly) 또는 막힘(disabled)인가 — 숨은 파일 칸은 뺀다 */
const lockedAll = (root: HTMLElement) => inputsOf(root).filter((el) => !(el instanceof HTMLInputElement && el.type === 'file')).every((el) => el.disabled || ('readOnly' in el && el.readOnly))
const WRITES = [addCandidate, updateCandidate, deleteCandidate, addListing, updateListing, addNote, deleteNote, addPhoto, deletePhoto, saveScoreRule, saveDeptRule, saveHomeEswt, addCompany]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T01:40:00Z'))
  window.history.replaceState(null, '', '/location')
  vi.mocked(loadLocation).mockResolvedValue(data())
  vi.mocked(readKeys).mockResolvedValue({ data: 'ok', kakao: 'ok' })
  vi.mocked(readDongIndex).mockResolvedValue(INDEX)
  vi.mocked(readDongs).mockResolvedValue(null)
  vi.mocked(readTransitIndex).mockResolvedValue(null)
  vi.mocked(readRail).mockResolvedValue(null)
  vi.mocked(readBus).mockResolvedValue(null)
  vi.mocked(queryLocation).mockImplementation((q) => fakeAsk(q) as never)
  vi.mocked(markCandidateEventsSeen).mockResolvedValue()
  vi.mocked(readFlowCache).mockResolvedValue(null)
  vi.mocked(saveFlowCache).mockResolvedValue()
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('AC-8010.2: 보는 중 입지 분석 — 후보 자세히', () => {
  it('AC-8010.2: 보는 의원의 후보는 보이고 [후보 더하기]·[오늘 값으로 다시 받기]가 없으며 범위 막대·간판 고르기는 막힌다. 후보를 열어도 알림 읽음(markCandidateEventsSeen)을 쓰지 않는다', async () => {
    await open(VIEW, { tab: 'detail', candidateId: CAND_ID })
    expect(screen.getByRole('heading', { level: 2, name: A.name })).toBeTruthy()
    // 후보를 열었다 = 카카오 주소 글을 새로 받았다(읽기라 그대로)
    await waitFor(() => expect(vi.mocked(queryLocation).mock.calls.some(([q]) => q.kind === 'k-point')).toBe(true))
    expect(markCandidateEventsSeen).not.toHaveBeenCalled()
    expect(button('후보 더하기')).toBeNull()
    expect(button('오늘 값으로 다시 받기')).toBeNull()
    for (const slider of screen.getAllByRole('slider')) expect((slider as HTMLInputElement).disabled).toBe(true)
    const sign = screen.getByRole('group', { name: '간판 보임' })
    for (const pick of within(sign).getAllByRole('button')) expect((pick as HTMLButtonElement).disabled).toBe(true)
    for (const write of WRITES) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8010.2: 보는 중이 아니면(viewing=null) 지금과 같다 — 단추가 있고 후보를 열면 알림 읽음을 적는다', async () => {
    await open(null, { tab: 'detail', candidateId: CAND_ID })
    await waitFor(() => expect(markCandidateEventsSeen).toHaveBeenCalledWith(CLIENT, CAND_ID))
    expect(button('후보 더하기')).toBeTruthy()
    expect(button('오늘 값으로 다시 받기')).toBeTruthy()
    expect((screen.getAllByRole('slider')[0] as HTMLInputElement).disabled).toBe(false)
  })
})

describe('AC-8010.2: 보는 중 입지 분석 — 매물 · 견주기', () => {
  it('AC-8010.2: 매물 — 저장한 매물은 보이고 [매물 저장]·[주소록에 넣기]·[후보로 저장]이 없으며 협상표 칸은 읽기만', async () => {
    await open(VIEW, { tab: 'listings' })
    expect(screen.getByRole('region', { name: '저장한 매물' })).toBeTruthy()
    expect(button('매물 저장')).toBeNull()
    expect(screen.queryByRole('region', { name: '매물 붙여 넣기' })).toBeNull()
    expect(button('주소록에 넣기')).toBeNull()
    expect(button('후보로 저장')).toBeNull()
    expect(lockedAll(screen.getByRole('region', { name: '임대 조건 협상표' }))).toBe(true)
    // 네이버 부동산 찾기의 동 고르기는 읽기(링크만 바뀜)라 그대로 쓸 수 있다
    for (const select of document.querySelectorAll('select')) expect(select.disabled).toBe(false)
  })

  it('AC-8010.2: 후보 견주기 — 진행 상태 단추는 막히고 [내려놓기]·[지우기]·[무게 바꾸기]가 없다', async () => {
    await open(VIEW, { tab: 'compare' })
    const steps = screen.getByRole('group', { name: new RegExp(A.name) })
    for (const step of within(steps).getAllByRole('button')) expect((step as HTMLButtonElement).disabled).toBe(true)
    for (const name of ['내려놓기', '지우기', '무게 바꾸기']) expect(button(name), name).toBeNull()
  })

  it('AC-8010.2: 보는 중이 아니면(viewing=null) 매물·견주기 쓰기 단추가 지금처럼 있다', async () => {
    await open(null, { tab: 'listings' })
    for (const name of ['매물 저장', '주소록에 넣기', '후보로 저장']) expect(button(name), name).toBeTruthy()
    cleanup()
    await open(null, { tab: 'compare' })
    for (const name of ['내려놓기', '지우기']) expect(button(name), name).toBeTruthy()
  })
})

describe('AC-8010.2: 보는 중 입지 분석 — 개원 준비(메모·사진)', () => {
  it('AC-8010.2: 보는 의원의 사진·메모는 보이고 [사진 올리기]·사진·메모 [지우기]·[메모 더하기]·[내려놓기]가 없으며 적는 칸·고르기는 모두 읽기만', async () => {
    await open(VIEW, { tab: 'prep', candidateId: CAND_ID })
    expect(screen.getByText(PHOTO.label)).toBeTruthy()
    expect(screen.getByText(NOTE.body)).toBeTruthy()
    for (const name of ['사진 올리기', `${PHOTO.label} 사진 지우기`, `${NOTE.day} 메모 지우기`, '메모 더하기', '내려놓기']) expect(button(name), name).toBeNull()
    expect(lockedAll(document.body)).toBe(true)
    // 진행 상태·점검표 O/X 단추는 값만 보이고 막힌다
    // (맨 위 '후보 고르기'는 보는 후보만 바꾸는 읽기라 그대로 누를 수 있다)
    const picker = screen.getByRole('group', { name: '후보 고르기' })
    for (const b of within(picker).getAllByRole('button')) expect((b as HTMLButtonElement).disabled).toBe(false)
    const ox = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') !== null && !picker.contains(b))
    expect(ox.length).toBeGreaterThan(0)
    for (const b of ox) expect((b as HTMLButtonElement).disabled, b.textContent ?? '').toBe(true)
    for (const write of WRITES) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8010.2: 보는 중이 아니면(viewing=null) 사진·메모 단추가 지금처럼 있다', async () => {
    await open(null, { tab: 'prep', candidateId: CAND_ID })
    for (const name of ['사진 올리기', `${PHOTO.label} 사진 지우기`, `${NOTE.day} 메모 지우기`, '메모 더하기', '내려놓기']) expect(button(name), name).toBeTruthy()
  })
})

describe('AC-8010.2: 보는 중 입지 분석 — 점수 설정 · 과목 고르기', () => {
  it('AC-8010.2: 점수 무게 판은 값만 보이고 [기본 무게로]가 없으며 막대는 막힌다. 과목 고르기 판도 [기본값으로]가 없고 고르기가 막힌다 — 저장하지 않는다', async () => {
    await open(VIEW, { tab: 'scan' })
    const weights = screen.getByRole('region', { name: '점수 무게' })
    expect(within(weights).queryByRole('button', { name: '기본 무게로' })).toBeNull()
    for (const slider of within(weights).getAllByRole('slider')) expect((slider as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(within(weights).getByRole('button', { name: '과목 고르기' }))
    const picker = await screen.findByRole('dialog')
    expect(within(picker).queryByRole('button', { name: '기본값으로' })).toBeNull()
    const roles = within(picker)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') !== null)
    expect(roles.length).toBeGreaterThan(0)
    for (const b of roles) expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(picker).getAllByRole('button', { name: '닫기' }).at(-1)!)
    expect(saveScoreRule).not.toHaveBeenCalled()
    expect(saveDeptRule).not.toHaveBeenCalled()
  })

  it('AC-8010.2: 보는 중이 아니면(viewing=null) [기본 무게로]가 있고 막대를 움직일 수 있다', async () => {
    await open(null, { tab: 'scan' })
    const weights = screen.getByRole('region', { name: '점수 무게' })
    expect(within(weights).getByRole('button', { name: '기본 무게로' })).toBeTruthy()
    expect((within(weights).getAllByRole('slider')[0] as HTMLInputElement).disabled).toBe(false)
  })
})

describe('AC-8010.2: 보는 중 입지 분석 — 저절로 쓰기 (useLocation)', () => {
  async function ready(viewing: Viewing | null) {
    const hook = renderHook(() => useLocation(), { wrapper: wrap(viewing) })
    await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
    return hook
  }

  it('AC-8010.2: 보는 중 동네 훑기 모으기의 승하차 담아 두기(flowCache.save)는 saveFlowCache를 부르지 않고, 읽기(readFlowCache)는 그대로다. 후보를 열어도 markCandidateEventsSeen을 부르지 않는다', async () => {
    const { result } = await ready(VIEW)
    act(() => result.current.pickSgg('41131'))
    await waitFor(() => expect(collectScan).toHaveBeenCalled())
    const [, deps] = vi.mocked(collectScan).mock.calls[0]!
    const kept = { asOf: '2026-09-30', rows: [{ id: 'B1', mode: 'bus' as const, board: 1, alight: 1, days: 30 }] }
    vi.mocked(readFlowCache).mockResolvedValue(kept)
    expect(await deps.flowCache!.read('41131', '2026-09')).toEqual(kept)
    expect(readFlowCache).toHaveBeenCalledWith(CLIENT, '41131', '2026-09')
    await deps.flowCache!.save('41131', '2026-09', kept)
    expect(saveFlowCache).not.toHaveBeenCalled()
    act(() => result.current.openCandidate(CAND_ID))
    await waitFor(() => expect(result.current.viewed?.address).toBe(ROAD))
    expect(markCandidateEventsSeen).not.toHaveBeenCalled()
  })

  it('AC-8010.2: 보는 중이 아니면(viewing=null) 승하차 담아 두기·알림 읽음을 지금처럼 쓴다', async () => {
    const { result } = await ready(null)
    act(() => result.current.pickSgg('41131'))
    await waitFor(() => expect(collectScan).toHaveBeenCalled())
    const [, deps] = vi.mocked(collectScan).mock.calls[0]!
    const kept = { asOf: '2026-09-30', rows: [] }
    await deps.flowCache!.save('41131', '2026-09', kept)
    expect(saveFlowCache).toHaveBeenCalledWith(CLIENT, '41131', '2026-09', kept)
    act(() => result.current.openCandidate(CAND_ID))
    expect(markCandidateEventsSeen).toHaveBeenCalledWith(CLIENT, CAND_ID)
  })
})
