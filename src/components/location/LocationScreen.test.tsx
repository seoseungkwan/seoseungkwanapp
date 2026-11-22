// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fillScoreRule, scoreItems, type ScoreRule } from '@/lib/location/score'
import { SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import {
  addCandidate,
  addNote,
  loadLocation,
  LocationStorageError,
  markCandidateEventsSeen,
  saveScoreRule,
  updateCandidate,
  type LocationData,
} from '@/lib/storage/location'
import type { Candidate, Query, QueryReply, Snapshot } from '@/types/location'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'
import { scoreFactsOf } from './detail/frame/facts'
import { CAND_ID, makeCandidate, makeListing, makeSnapshot, OTHER_ID, OTHER_LISTING, TODAY } from './detail/frame/frame.test.data'
import { LocationScreen } from './LocationScreen'
import { INDEX } from './scan/scanData.test.data'

// 입지 분석 화면 잇기(spec location TASK-44 · AC-7901.3·AC-7901.4·AC-7908.1~4·AC-7917.1·AC-7919.3·AC-7919.4, design.md 14절, 시안 ?s=scan·candidate·plan·report).
// 저장 함수·부르기(clients)·supabaseBrowser만 흉내 내고, 안쪽 부품(훑기·후보 자세히·매물·견주기·개원 준비·보고서·근거)은 진짜를 그린다.
// 이름·주소는 모두 지어낸 것이다. 오늘은 2026-11-22(한국)

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/location', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/location')>()
  return {
    ...real,
    loadLocation: vi.fn(),
    saveScoreRule: vi.fn(),
    resetScoreRule: vi.fn(),
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

const SOURCE = readFileSync(join(process.cwd(), 'src/components/location/LocationScreen.tsx'), 'utf8')
const HOOK_SOURCE = readFileSync(join(process.cwd(), 'src/components/location/useLocation.ts'), 'utf8')

const ROAD = '예시로 12'
const JIBUN = '예시구 가람동 1-2'
const LOT = { bcode: '1199951000', main: 1, sub: 2, san: false }

function fakeAsk(q: Query): Promise<QueryReply> {
  const ok = (value: unknown): QueryReply => ({ ok: true, value, src: 'kakao-local', asOf: TODAY })
  if (q.kind === 'k-point') return Promise.resolve(ok({ road: ROAD, jibun: JIBUN, bjd: LOT.bcode, hjd: null, lot: LOT }))
  if (q.kind === 'k-address') return Promise.resolve(ok([{ at: { lat: 37.501, lng: 127.002 }, road: ROAD, jibun: JIBUN, bjd: LOT.bcode, lot: LOT }]))
  if (q.kind === 'k-near' || q.kind === 'k-keyword') return Promise.resolve(ok({ places: [], capped: false }))
  return Promise.resolve({ ok: false, code: 'failed' })
}

/** checkSnapshot을 지나는 그날 값(기준 날짜를 모두 'YYYY-MM-DD'로) — 저장된 값은 이 모양이다 */
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

const THIRD_ID = '99999999-9999-4999-8999-999999999999'
const A = makeCandidate({ snapshot: validSnapshot() })
const B = makeCandidate({ id: OTHER_ID, name: '예시타워 2층', status: 'dropped', createdAt: '2026-11-16T00:00:00.000Z' })
const C = makeCandidate({ id: THIRD_ID, name: '예시상가 1층', lat: 37.51, lng: 127.01, createdAt: '2026-11-17T00:00:00.000Z' })

function data(over: Partial<LocationData> = {}): LocationData {
  return {
    settings: { scoreRule: fillScoreRule(null), homeEswt: null, updatedAt: null },
    candidates: [A, B, C],
    listings: [makeListing(), OTHER_LISTING],
    notes: [],
    photos: [],
    events: [],
    ...over,
  }
}

const totalOf = (c: Candidate, rule: ScoreRule) =>
  scoreItems(scoreFactsOf({ candidate: c, listings: data().listings, homeEswt: null, today: TODAY }), rule).total

async function open(props: Parameters<typeof LocationScreen>[0] = {}) {
  const view = render(<LocationScreen {...props} />)
  await waitFor(() => expect(screen.queryByText('입지 분석 자료를 불러오고 있어요')).toBeNull())
  return view
}
const tabs = () => screen.getByRole('navigation', { name: '입지 분석 안 메뉴' })
const tab = (name: RegExp | string) => within(tabs()).getByRole('button', { name })
const current = () => within(tabs()).getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'page')?.textContent ?? null
const candBar = () => screen.getByRole('group', { name: '후보 고르기' })

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
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('주소로 열기 (AC-7901.3)', () => {
  it('AC-7901.3: ?tab=detail&c=<uuid>면 후보 자세히 탭과 그 후보로 연다 — 후보 고르기는 내려놓은 후보를 빼고 글자는 견주기와 같은 차례(A·C)', async () => {
    await open({ tab: 'detail', candidateId: THIRD_ID })
    expect(current()).toMatch(/^후보 자세히/)
    expect(screen.getByRole('heading', { level: 2, name: '예시상가 1층' })).toBeTruthy()
    expect(screen.getByText('후보 C')).toBeTruthy()
    const buttons = within(candBar()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent?.slice(0, 1))).toEqual(['A', 'C'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true'])
    expect(within(candBar()).queryByText(/예시타워 2층/)).toBeNull()
    // 후보 줄 점수 = 후보 자세히와 같은 식(받은 설정 그대로)
    expect(buttons[0]!.textContent).toContain(`${totalOf(A, fillScoreRule(null))}점`)
  })

  it('AC-7901.3: 없는 후보(c)는 버리고 기본(동네 훑기)으로 연다', async () => {
    await open({ tab: 'detail', candidateId: '12345678-1234-4234-8234-123456789012' })
    expect(current()).toMatch(/^동네 훑기/)
    expect(screen.queryByRole('group', { name: '후보 고르기' })).toBeNull()
  })

  it('AC-7901.3: 탭·후보를 바꾸면 주소(?tab=&c=)도 바뀐다 — 다시 그리지 않고 그 자리에서', async () => {
    await open()
    expect(current()).toMatch(/^동네 훑기/)
    fireEvent.click(tab(/^후보 견주기/))
    expect(window.location.search).toBe('?tab=compare')
    fireEvent.click(tab(/^후보 자세히/))
    await waitFor(() => expect(window.location.search).toBe(`?tab=detail&c=${CAND_ID}`))
    fireEvent.click(within(candBar()).getByRole('button', { name: /예시상가 1층/ }))
    await waitFor(() => expect(window.location.search).toBe(`?tab=detail&c=${THIRD_ID}`))
    expect(loadLocation).toHaveBeenCalledTimes(1)
  })

  it('AC-7901.3·AC-7914.2: ?tab=report면 한 장 보고서를 그리고, 안쪽 탭은 후보 자세히를 가리킨다. 머리·안쪽 탭·후보 고르기는 인쇄에서 빠진다(print:hidden)', async () => {
    await open({ tab: 'report', candidateId: CAND_ID, hospitalName: '가나 정형외과의원' })
    expect(current()).toMatch(/^후보 자세히/)
    expect(screen.getByRole('button', { name: '후보로 돌아가기' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '입지 분석' }).closest('.print\\:hidden')).not.toBeNull()
    expect(tabs().closest('.print\\:hidden')).not.toBeNull()
    expect(candBar().closest('.print\\:hidden')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '후보로 돌아가기' }))
    expect(window.location.search).toBe(`?tab=detail&c=${CAND_ID}`)
  })
})

describe('처음 화면 · 열쇠 없음 · 읽기 실패 (AC-7917.1 · E-LOC-READ-FAILED)', () => {
  it('AC-7917.1: 두 열쇠가 다 없으면 열쇠 없음 화면 — 머리는 한 번만, 열쇠 칸 없음, 영어 낱말 없음. [매물 붙여 넣기]는 매물 탭으로 간다', async () => {
    vi.mocked(readKeys).mockResolvedValue({ data: 'missing', kakao: 'missing' })
    await open()
    expect(screen.getByRole('heading', { name: '자료 열쇠를 넣으면 시작할 수 있어요' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    const text = (document.body.textContent ?? '').replace(/SGIS|TASIS|KTX|MRI|CT|km|PDF|A4/g, '')
    expect(text).not.toMatch(/[A-Za-z]{2,}/)
    fireEvent.click(screen.getByRole('button', { name: '매물 붙여 넣기' }))
    expect(current()).toMatch(/^매물/)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('AC-7917.1: 열쇠가 없어도 주소에 탭이 있으면(대시보드 알림 링크 등) 그 탭으로 연다', async () => {
    vi.mocked(readKeys).mockResolvedValue({ data: 'missing', kakao: 'missing' })
    await open({ tab: 'compare' })
    expect(current()).toMatch(/^후보 견주기/)
    expect(screen.queryByRole('heading', { name: '자료 열쇠를 넣으면 시작할 수 있어요' })).toBeNull()
  })

  it('처음(후보 없음) 화면 — 머리는 한 번만, [동네 훑기 시작]은 고른 시군구로 훑기 탭을 연다', async () => {
    vi.mocked(loadLocation).mockResolvedValue(data({ candidates: [], listings: [] }))
    await open()
    expect(screen.getByRole('heading', { name: '아직 후보가 없어요' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '동네 훑기 시작' }))
    expect(current()).toMatch(/^동네 훑기/)
    await waitFor(() => expect(readDongs).toHaveBeenCalledWith('11999'))
  })

  it('E-LOC-READ-FAILED: 표를 못 읽으면 오류 카드와 [다시 읽기], 누르면 다시 읽는다', async () => {
    vi.mocked(loadLocation).mockRejectedValueOnce(new LocationStorageError('E-LOC-READ-FAILED'))
    await open()
    expect(screen.getByRole('alert').textContent).toContain('입지 분석 자료를 읽지 못했어요')
    expect(screen.getByRole('alert').textContent).toContain('E-LOC-READ-FAILED')
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    await waitFor(() => expect(screen.getByRole('navigation', { name: '입지 분석 안 메뉴' })).toBeTruthy())
    expect(loadLocation).toHaveBeenCalledTimes(2)
  })
})

describe('후보 더하기 · 카카오 자료 (AC-7908.1 · AC-7908.2 · AC-7908.4)', () => {
  it('AC-7908.1·AC-7908.2: [후보 더하기] → 주소로 찾기 → 저장하면 몸통에 카카오 주소 글·지번이 없고, 저장한 후보를 후보 자세히로 연다', async () => {
    const NEW_ID = '55555555-5555-4555-8555-555555555555'
    vi.mocked(addCandidate).mockImplementation(async (_c, f) => makeCandidate({ id: NEW_ID, ...f, snapshot: f.snapshot ?? null, createdAt: '2026-11-22T01:40:00.000Z' }))
    await open()
    fireEvent.click(screen.getByRole('button', { name: '후보 더하기' }))
    const dialog = screen.getByRole('dialog', { name: '후보 더하기' })
    fireEvent.change(within(dialog).getByLabelText(/^주소/), { target: { value: '예시빌딩' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '찾기' }))
    await waitFor(() => expect(within(dialog).getByRole('radiogroup', { name: '찾은 주소' })).toBeTruthy())
    fireEvent.click(within(dialog).getByRole('button', { name: '후보로 저장' }))
    await waitFor(() => expect(addCandidate).toHaveBeenCalledTimes(1))
    const body = vi.mocked(addCandidate).mock.calls[0]![1]
    expect(body).toMatchObject({ name: '예시빌딩', addressNote: '예시빌딩', lat: 37.501, lng: 127.002, radiusM: 1000 })
    expect(JSON.stringify(body)).not.toContain(ROAD)
    expect(JSON.stringify(body)).not.toContain('가람동 1-2')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(current()).toMatch(/^후보 자세히/)
    expect(window.location.search).toBe(`?tab=detail&c=${NEW_ID}`)
  })

  it('AC-7908.4: 후보를 열 때마다 알림을 읽음으로 하고(markCandidateEventsSeen) 카카오 주소 글을 새로 받아 머리에 보인다 — 저장하지 않는다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    await waitFor(() => expect(screen.getByText(new RegExp(ROAD))).toBeTruthy())
    expect(markCandidateEventsSeen).toHaveBeenCalledWith(CLIENT, CAND_ID)
    fireEvent.click(tab(/^동네 훑기/))
    fireEvent.click(tab(/^후보 자세히/))
    await waitFor(() => expect(markCandidateEventsSeen).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(vi.mocked(queryLocation).mock.calls.filter(([q]) => q.kind === 'k-point')).toHaveLength(2))
    expect(updateCandidate).not.toHaveBeenCalled()
    expect(addCandidate).not.toHaveBeenCalled()
  })
})

describe('점수 설정 (AC-7919.3 · AC-7919.4)', () => {
  it('AC-7919.3·AC-7919.4: 훑기 무게를 바꾸면 다시 부르지 않고 후보 점수가 바로 바뀌고, 무게 판을 떠나면 saveScoreRule로 한 번 저장한다', async () => {
    vi.mocked(saveScoreRule).mockImplementation(async (_c, rule) => ({ scoreRule: rule, homeEswt: null, updatedAt: '2026-11-22T01:41:00Z' }))
    await open({ tab: 'scan' })
    const before = totalOf(A, fillScoreRule(null))
    fireEvent.change(screen.getByRole('slider', { name: '경쟁' }), { target: { value: '0' } })
    fireEvent.click(tab(/^후보 자세히/))
    await waitFor(() => expect(saveScoreRule).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(saveScoreRule).mock.calls[0]![1]
    expect(vi.mocked(saveScoreRule).mock.calls[0]![0]).toBe(CLIENT)
    const after = totalOf(A, saved)
    expect(after).not.toBe(before)
    expect(within(candBar()).getAllByRole('button')[0]!.textContent).toContain(`${after}점`)
    // 바깥 자료(공공 자료)는 다시 부르지 않는다 — 부른 것은 후보를 열 때의 카카오 자료뿐
    expect(vi.mocked(queryLocation).mock.calls.every(([q]) => q.kind.startsWith('k-'))).toBe(true)
    expect(loadLocation).toHaveBeenCalledTimes(1)
  })
})

describe('진행 상태 · 개원 준비 (AC-7913.4 · AC-7914.1)', () => {
  it('AC-7914.1: 견주기에서 진행 상태를 바꾸면 updateCandidate(status)와 날짜 메모 한 줄', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => ({ ...A, id, ...ch }))
    vi.mocked(addNote).mockImplementation(async (_c, candidateId, f) => ({ id: 'n1', candidateId, ...f, createdAt: '2026-11-22T01:40:00Z' }))
    await open({ tab: 'compare' })
    const group = screen.getByRole('group', { name: '예시빌딩 3층 진행 상태' })
    fireEvent.click(within(group).getByRole('button', { name: '2. 중개사 연락' }))
    await waitFor(() => expect(addNote).toHaveBeenCalledWith(CLIENT, CAND_ID, { day: TODAY, body: '진행 상태를 바꿨어요: 보는 중 → 중개사 연락' }))
    expect(updateCandidate).toHaveBeenCalledWith(CLIENT, CAND_ID, { status: 'contacted' })
  })

  it('AC-7913.4: 개원 준비 탭은 지금 의원 값 → 개원 비용 → 개원 일정 → 보러 갈 때(건물 요건 표…) 차례, 사이 40px', async () => {
    await open({ tab: 'prep', candidateId: CAND_ID })
    const heads = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    const at = (t: string) => heads.findIndex((h) => h.startsWith(t))
    expect(at('지금 의원 체외충격파 값')).toBeGreaterThanOrEqual(0)
    expect(at('지금 의원 체외충격파 값')).toBeLessThan(at('개원 비용 계산'))
    expect(at('개원 비용 계산')).toBeLessThan(at('개원 일정표'))
    expect(at('개원 일정표')).toBeLessThan(at('건물 요건 표'))
    expect(screen.getByRole('heading', { name: '지금 의원 체외충격파 값' }).closest('.gap-10')).not.toBeNull()
  })

  it('AC-7913.4: 후보 자세히 진료비의 [지금 의원 값은 개원 준비에서 적어요]는 개원 준비 탭으로 간다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    fireEvent.click(screen.getByRole('button', { name: '지금 의원 값은 개원 준비에서 적어요' }))
    expect(current()).toMatch(/^개원 준비/)
    expect(screen.getByRole('heading', { name: '지금 의원 체외충격파 값' })).toBeTruthy()
  })
})

describe('PC 배치 · 링크 · 같은 id (AC-7901.4)', () => {
  it('AC-7901.4: 동네 훑기·후보 자세히 두 칸 틀은 최소 폭 1,024px이고 넘치면 제 감싸개 안에서만 옆으로 밀린다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    const wide = (el: Element | null) => el?.closest('.min-w-\\[1024px\\]') ?? null
    const frame = wide(screen.getByRole('heading', { level: 2, name: '예시빌딩 3층' }))
    expect(frame).not.toBeNull()
    expect(frame!.parentElement!.className).toContain('overflow-x-auto')
    fireEvent.click(tab(/^동네 훑기/))
    const scan = wide(screen.getByRole('slider', { name: '경쟁' }))
    expect(scan).not.toBeNull()
    expect(scan!.parentElement!.className).toContain('overflow-x-auto')
  })

  it('AC-7901.4: 화면·훅 소스에 폰 전용 모양(max-md:)·폰 모양이 든 공용 묶음·Next Link가 없다 — /location 안에서 다른 탭으로 가는 링크는 평범한 <a href>', () => {
    for (const src of [SOURCE, HOOK_SOURCE]) {
      expect(src).not.toMatch(/max-md:/)
      expect(src).not.toMatch(/from 'next\/link'/)
      expect(src).not.toMatch(/ds\.(?:button|input|textButton|card|panel)\b/)
    }
  })

  it('AC-7909.1: 후보 자세히에 같은 id가 둘 이상 없다 — 틀(32)이 묶음마다 sec-{칸}을 두고, 고칠 수 있는 묶음(35·36)은 props로 피한다. 남은 것은 묶음 부품이 id를 정해 둔 다섯(보고에 적음)', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].sort()
    expect(twice).toEqual(['sec-demand', 'sec-future', 'sec-income', 'sec-people', 'sec-traffic'])
  })

  it('AC-7917.1: 화면이 직접 적은 글(머리·안쪽 탭·후보 고르기)에 영어 낱말이 없다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    const own = [screen.getByRole('heading', { level: 1, name: '입지 분석' }).closest('header'), tabs(), candBar()]
    for (const el of own) expect(el?.textContent ?? '').not.toMatch(/[A-Za-z]{2,}/)
  })
})

describe('그날 값 (AC-7908.3)', () => {
  it('AC-7908.3: [오늘 값으로 다시 받기]는 그날 값을 덮어 저장하고 머리의 기준 날짜가 바뀐다', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => ({ ...A, id, ...ch, snapshotAt: ch.snapshot?.at ?? A.snapshotAt }))
    await open({ tab: 'detail', candidateId: CAND_ID })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /오늘 값으로 다시 받기/ }))
    })
    await waitFor(() => expect(updateCandidate).toHaveBeenCalledTimes(1))
    const changes = vi.mocked(updateCandidate).mock.calls[0]![2]
    expect(Object.keys(changes)).toEqual(['snapshot'])
    expect(changes.snapshot!.at).toBe('2026-11-22T01:40:00.000Z')
    expect(changes.snapshot!.people).toMatchObject({ ok: false, prev: { asOf: '2026-10-31' } })
  })
})
