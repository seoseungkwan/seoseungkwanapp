// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE, fillDeptRule } from '@/lib/location/depts'
import { scoreFactsOf } from '@/lib/location/facts'
import { weightsText } from '@/lib/location/method'
import { fillScoreRule, scoreItems, type ScoreRule } from '@/lib/location/score'
import { SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import {
  addCandidate,
  addNote,
  loadLocation,
  LocationStorageError,
  markCandidateEventsSeen,
  resetDeptRule,
  saveDeptRule,
  saveScoreRule,
  updateCandidate,
  type LocationData,
  type SavedSettings,
} from '@/lib/storage/location'
import type { Candidate, DeptRule, Query, QueryReply, Snapshot } from '@/types/location'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'
import { CAND_ID, makeCandidate, makeListing, makeRival, makeSnapshot, OTHER_ID, OTHER_LISTING, RIVALS, TODAY } from './detail/frame/frame.test.data'
import { LocationScreen } from './LocationScreen'
import { KakaoMap } from './map/KakaoMap'
import { INDEX } from './scan/scanData.test.data'

// 입지 분석 화면 잇기(spec location TASK-44·TASK-79 · AC-7901.3·AC-7901.4·AC-7908.1~4·AC-7909.1·AC-7916.1·AC-7917.1·AC-7919.3·AC-7919.4·
// AC-7920.1·AC-7920.2·AC-7921.1·AC-7921.2·AC-7921.6, design.md 14·18·19절, 시안 ?s=scan·candidate·plan·report·method·kinds).
// 저장 함수·부르기(clients)·supabaseBrowser만 흉내 내고, 안쪽 부품(훑기·후보 자세히·매물·견주기·개원 준비·보고서·근거·분석 방법·과목 고르기)은 진짜를 그린다.
// 지도(KakaoMap)도 진짜를 그리되 받은 props(표시 점)를 엿본다. 이름·주소는 모두 지어낸 것이다. 오늘은 2026-11-22(한국)

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
  }
})
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/contacts')>()),
  loadContacts: vi.fn(),
  addCompany: vi.fn(),
  addPerson: vi.fn(),
}))
// 지도는 진짜를 그리되 받은 props를 엿본다(열쇠가 비어 지도 자리에는 안내 글이 나온다)
vi.mock('./map/KakaoMap', async (importOriginal) => {
  const real = await importOriginal<typeof import('./map/KakaoMap')>()
  return { ...real, KakaoMap: vi.fn(real.KakaoMap) }
})
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
  // 약국: 같은 건물(카카오 도로명이 후보와 같음) 하나 · 30m 밖 하나
  if (q.kind === 'k-near' && q.cat === 'PM9')
    return Promise.resolve(
      ok({
        places: [
          { name: '예시온약국', category: '의료,건강 > 약국', at: { lat: 37.5, lng: 127 }, distM: 15, road: ROAD },
          { name: '예시먼약국', category: '의료,건강 > 약국', at: { lat: 37.503, lng: 127 }, distM: 300, road: '예시로 99' },
        ],
        capped: false,
      }),
    )
  if (q.kind === 'k-near' || q.kind === 'k-keyword') return Promise.resolve(ok({ places: [], capped: false }))
  return Promise.resolve({ ok: false, code: 'failed' })
}

/** checkSnapshot을 지나는 그날 값(기준 날짜를 모두 'YYYY-MM-DD'로) — 저장된 값은 이 모양이다.
 * 출처 id는 frame.test.data 그대로(모으기 collect.ts SRC와 같은 id, 모두 SOURCES에 있음) */
const ymdOf = (s: string) => (s.length === 4 ? `${s}-12-31` : s.length === 7 ? `${s}-01` : s)
function validSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  const s = makeSnapshot(over)
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

const settingsOf = (deptRule: DeptRule = fillDeptRule(null), scoreRule: ScoreRule = fillScoreRule(null)): SavedSettings => ({
  scoreRule,
  deptRule,
  homeEswt: null,
  updatedAt: null,
})

function data(over: Partial<LocationData> = {}): LocationData {
  return {
    settings: settingsOf(),
    candidates: [A, B, C],
    listings: [makeListing(), OTHER_LISTING],
    notes: [],
    photos: [],
    events: [],
    ...over,
  }
}

const totalOf = (c: Candidate, rule: ScoreRule, deptRule: DeptRule = fillDeptRule(null)) =>
  scoreItems(scoreFactsOf({ candidate: c, listings: data().listings, homeEswt: null, today: TODAY, deptRule }), rule).total
/** 후보 둘레 작은 지도(KakaoMap)가 마지막으로 받은 표시 점 */
const miniMarks = (name: string) => vi.mocked(KakaoMap).mock.calls.filter(([p]) => p.label === `${name} 둘레 지도`).at(-1)?.[0].marks ?? []
const section = (id: string) => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`#${id} 없음`)
  return el
}

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
    expect(screen.getByRole('button', { name: '후보 A로 돌아가기' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: '입지 분석' }).closest('.print\\:hidden')).not.toBeNull()
    expect(tabs().closest('.print\\:hidden')).not.toBeNull()
    expect(candBar().closest('.print\\:hidden')).not.toBeNull()
    // 보고서 머리에 후보 글자(후보 고르기 줄과 같은 A)
    expect(screen.getByText(/^입지 분석 보고서 · 후보 A/)).toBeTruthy()
    // 단추 글은 그 후보 글자로(TASK-82 (9) `후보 {글자}로 돌아가기`)
    fireEvent.click(screen.getByRole('button', { name: '후보 A로 돌아가기' }))
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
    vi.mocked(saveScoreRule).mockImplementation(async (_c, rule) => ({ ...settingsOf(fillDeptRule(null), rule), updatedAt: '2026-11-22T01:41:00Z' }))
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
  it('AC-7901.4: 동네 훑기·후보 자세히 두 칸 틀은 최소 폭 976px(창 1024 − 셸 좌우 여백 24px×2)이고 넘치면 제 감싸개 안에서만 옆으로 밀린다', async () => {
    // 셸(AppShell)은 옆 막대 없이 위 막대만 있고, 본문 감싸개 좌우 여백이 px-6(24px)씩이다 → 창 1024에서 본문 폭 976px(시안처럼 딱 맞음)
    const shell = readFileSync(join(process.cwd(), 'src/components/shell/AppShell.tsx'), 'utf8')
    expect(shell).toMatch(/<div className="mx-auto w-full max-w-7xl px-6 /)
    expect(SOURCE).not.toMatch(/min-w-\[1024px\]/)
    await open({ tab: 'detail', candidateId: CAND_ID })
    const wide = (el: Element | null) => el?.closest('.min-w-\\[976px\\]') ?? null
    const frame = wide(screen.getByRole('heading', { level: 2, name: '예시빌딩 3층' }))
    expect(frame).not.toBeNull()
    expect(frame!.parentElement!.className).toContain('overflow-x-auto')
    fireEvent.click(tab(/^동네 훑기/))
    const scan = wide(screen.getByRole('slider', { name: '경쟁' }))
    expect(scan).not.toBeNull()
    expect(scan!.parentElement!.className).toContain('overflow-x-auto')
  })

  it('AC-7901.4: 안쪽 탭·후보 고르기 단추 글자는 text-body(14px, 시안 .subtabs·.cb) — 물려받은 큰 글자가 아니다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    const tabButtons = within(tabs()).getAllByRole('button')
    expect(tabButtons).toHaveLength(6)
    for (const b of tabButtons) expect(b.className.split(/\s+/), b.textContent ?? '').toContain('text-body')
    const candButtons = within(candBar()).getAllByRole('button')
    expect(candButtons.length).toBeGreaterThan(0)
    for (const b of candButtons) expect(b.className.split(/\s+/), b.textContent ?? '').toContain('text-body')
  })

  it('AC-7909.3: 지도 둘레 다른 과 점이 빌려 쓰는 예약 색판(cal-lavender)은 UI_GUIDE 예약 색판 절에 빌림 예외 두 줄(직원 탭·입지 지도)로 적혀 있고, 색은 그대로다', () => {
    const guide = readFileSync(join(process.cwd(), 'docs/UI_GUIDE.md'), 'utf8')
    const part = guide.split(/^### /m).find((s) => s.startsWith('예약 색판')) ?? ''
    const borrow = part.split(/\r?\n/).filter((l) => l.startsWith('- 빌림 예외'))
    expect(borrow).toHaveLength(2)
    expect(borrow[0]).toContain('components/staff/labels.ts')
    expect(borrow[1]).toContain('components/location/map/KakaoMap.tsx')
    expect(borrow[1]).toContain('cal-lavender')
    const map = readFileSync(join(process.cwd(), 'src/components/location/map/KakaoMap.tsx'), 'utf8')
    expect(map).toContain("other: 'block size-1.5 rounded-full bg-cal-lavender ring-1 ring-cal-purple/50'")
  })

  it('AC-7901.4: 화면·훅 소스에 폰 전용 모양(max-md:)·폰 모양이 든 공용 묶음·Next Link가 없다 — /location 안에서 다른 탭으로 가는 링크는 평범한 <a href>', () => {
    for (const src of [SOURCE, HOOK_SOURCE]) {
      expect(src).not.toMatch(/max-md:/)
      expect(src).not.toMatch(/from 'next\/link'/)
      expect(src).not.toMatch(/ds\.(?:button|input|textButton|card|panel)\b/)
    }
  })

  it('AC-7909.1: 후보 자세히에 같은 id가 둘 이상 없다 — 틀은 감싸개에 id를 두지 않고, 묶음 열셋이 제 기본 닻 id(sec-…)를 한 번씩 그린다(우회 id 없음)', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id)
    const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].sort()
    expect(twice).toEqual([])
    const anchors = ['people', 'income', 'demand', 'comp', 'others', 'price', 'hours', 'traffic', 'photo', 'bld', 'vac', 'land', 'future'].map((a) => `sec-${a}`)
    for (const id of anchors) expect(document.querySelectorAll(`#${id}`), id).toHaveLength(1)
    expect(SOURCE).not.toMatch(/sec-price-in|sec-hours-in|head=\{false\}|SiteBlock/)
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

describe('분석 방법 (AC-7920.1)', () => {
  it('AC-7920.1: 처음 화면(후보 없음) 시작 단계 아래 처음 안내 한 장 — 무게 숫자는 지금 설정 값이고, [근거와 출처 모두 보기]는 근거와 출처로 간다', async () => {
    const rule = fillScoreRule(null)
    const weights = { ...rule.weights, people: 20, rivals: 35 }
    vi.mocked(loadLocation).mockResolvedValue(data({ candidates: [], listings: [], settings: settingsOf(fillDeptRule(null), { ...rule, weights }) }))
    await open()
    const card = screen.getByRole('heading', { level: 2, name: '이 탭은 이렇게 분석해요' }).closest('section')!
    expect(card.textContent).toContain(weightsText(weights))
    fireEvent.click(within(card).getByRole('link', { name: '근거와 출처 모두 보기' }))
    expect(current()).toMatch(/^근거와 출처/)
  })

  it('AC-7920.1: 다른 화면 머리의 [분석 방법]은 같은 글의 오른쪽 판을 연다 — Esc·[닫기]로 닫히고, [근거와 출처 모두 보기]는 판을 닫고 근거와 출처로 간다', async () => {
    await open({ tab: 'compare' })
    const header = screen.getByRole('heading', { level: 1, name: '입지 분석' }).closest('header')!
    const button = within(header).getByRole('button', { name: '분석 방법' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(button)
    const panel = screen.getByRole('dialog', { name: '분석 방법' })
    expect(within(panel).getByRole('heading', { name: '이 탭은 이렇게 분석해요' })).toBeTruthy()
    expect(panel.textContent).toContain(weightsText(fillScoreRule(null).weights))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button)
    fireEvent.click(within(screen.getByRole('dialog', { name: '분석 방법' })).getAllByRole('button', { name: '닫기' }).at(-1)!)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button)
    fireEvent.click(within(screen.getByRole('dialog', { name: '분석 방법' })).getByRole('link', { name: '근거와 출처 모두 보기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(current()).toMatch(/^근거와 출처/)
  })
})

describe('의원 과목 고르기 (AC-7921.1 · AC-7921.2)', () => {
  const ALL_FOUR_AND_KOREAN: DeptRule = { v: 1, rival: ['ortho', 'ns', 'pain', 'rehab', 'korean'], hide: [] }

  it('AC-7921.1·AC-7921.2: 경쟁 의원 제목 옆 [과목 고르기]는 과목 고르기 판(지금 후보 글자·범위 안 수)을 열고, 바꾸면 다시 부르지 않고 후보 점수·지도 점이 바로 바뀌며, 판을 닫으면 saveDeptRule로 한 번 저장한다', async () => {
    vi.mocked(saveDeptRule).mockImplementation(async (_c, r) => settingsOf(r))
    await open({ tab: 'detail', candidateId: CAND_ID })
    fireEvent.click(within(section('sec-comp')).getAllByRole('button', { name: '과목 고르기' })[0]!)
    const dialog = screen.getByRole('dialog', { name: '의원 과목 고르기' })
    // 그날 값 의원: 정형외과·통증·한의원 하나씩(범위 1km 안)
    expect(within(dialog).getAllByText('후보 A 1km 안 1곳')).toHaveLength(3)
    const before = totalOf(A, fillScoreRule(null))
    expect(within(candBar()).getAllByRole('button')[0]!.textContent).toContain(`${before}점`)
    expect(miniMarks('예시빌딩 3층').find((m) => m.label === '예시다온한의원')?.kind).toBe('korean')

    fireEvent.click(within(within(dialog).getByRole('group', { name: '한의원' })).getByRole('button', { name: '경쟁 의원' }))
    const after = totalOf(A, fillScoreRule(null), ALL_FOUR_AND_KOREAN)
    expect(after).not.toBe(before)
    expect(within(candBar()).getAllByRole('button')[0]!.textContent).toContain(`${after}점`)
    expect(miniMarks('예시빌딩 3층').find((m) => m.label === '예시다온한의원')?.kind).toBe('rival')
    expect(saveDeptRule).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(saveDeptRule).toHaveBeenCalledTimes(1))
    expect(saveDeptRule).toHaveBeenCalledWith(CLIENT, ALL_FOUR_AND_KOREAN)
    expect(screen.queryByRole('dialog')).toBeNull()
    // 바깥 자료(공공 자료)는 다시 부르지 않고, 후보 그날 값도 다시 받지 않는다
    expect(vi.mocked(queryLocation).mock.calls.every(([q]) => q.kind.startsWith('k-'))).toBe(true)
    expect(updateCandidate).not.toHaveBeenCalled()
  })

  it('AC-7921.1·AC-7921.2: 동네 훑기 점수 무게 판의 [과목 고르기]도 같은 판을 열고, [기본값으로]는 처음 값으로 되돌려 resetDeptRule로 저장한다 — 훑기는 다시 부르지 않는다', async () => {
    vi.mocked(loadLocation).mockResolvedValue(data({ settings: settingsOf({ v: 1, rival: ['ortho'], hide: [] }) }))
    vi.mocked(resetDeptRule).mockResolvedValue(settingsOf(fillDeptRule(null)))
    await open({ tab: 'scan' })
    fireEvent.click(screen.getAllByRole('button', { name: '과목 고르기' })[0]!)
    const dialog = screen.getByRole('dialog', { name: '의원 과목 고르기' })
    expect(dialog.textContent).toContain('경쟁 의원으로 보는 과목: 정형외과 (1개)')
    fireEvent.click(within(dialog).getByRole('button', { name: '기본값으로' }))
    expect(dialog.textContent).toContain('경쟁 의원으로 보는 과목: 정형외과 · 신경외과 · 마취통증의학과 · 재활의학과 (4개)')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(resetDeptRule).toHaveBeenCalledWith(CLIENT))
    expect(saveDeptRule).not.toHaveBeenCalled()
    expect(readDongs).not.toHaveBeenCalled()
    expect(queryLocation).not.toHaveBeenCalled()
  })
})

describe('후보 자세히 잇기 (AC-7916.1 · AC-7909.1 · AC-7920.2 · AC-7921.6)', () => {
  it('AC-7916.1: 후보 둘레 작은 지도에 후보·경쟁 의원(주황)·한의원(회색, 둘레로 보기일 때)·둘레 다른 과 의원(연보라, 범위 밖은 흐리게)·역(검은 네모) — 점은 그날 값 좌표이고 안 보기 과목은 없다. 범례는 고른 과목을 따른다', async () => {
    const IM = makeRival({ name: '예시바른내과의원', depts: ['im'], distM: 1200, at: { lat: 37.51, lng: 127.01 } })
    const DERM = makeRival({ name: '예시맑은피부과의원', depts: ['derm'], distM: 300, at: { lat: 37.502, lng: 127.001 } })
    const snapshot = validSnapshot({ rivals: { ok: true, v: [...RIVALS, IM, DERM], src: 'hosp-list', asOf: '2026-11-15' } })
    const deptRule: DeptRule = { v: 1, rival: [...DEFAULT_DEPT_RULE.rival], hide: ['derm'] }
    vi.mocked(loadLocation).mockResolvedValue(data({ candidates: [{ ...A, snapshot }, B, C], settings: settingsOf(deptRule) }))
    await open({ tab: 'detail', candidateId: CAND_ID })
    const shape = miniMarks('예시빌딩 3층').map((m) => [m.kind, m.label, m.at, m.outside === true])
    expect(shape).toEqual([
      ['candidate', 'A', { lat: 37.5, lng: 127 }, false],
      ['rival', '예시가람정형외과', RIVALS[0]!.at, false],
      ['rival', '예시하늘통증의학과', RIVALS[1]!.at, false],
      ['korean', '예시다온한의원', RIVALS[2]!.at, false],
      ['other', '예시바른내과의원', { lat: 37.51, lng: 127.01 }, true],
      ['station', '예시가람역', { lat: 37.501, lng: 127.004 }, false],
    ])
    expect(
      screen.getByText('파란 표시 = 후보 · 주황 점 = 경쟁 의원 · 회색 점 = 한의원(따로 셈) · 연보라 작은 점 = 둘레 다른 과 의원 · 검은 네모 = 역 · 흐린 점 = 범위 밖'),
    ).toBeTruthy()
    expect(SOURCE).not.toMatch(/좌표가 없어 아직 찍지 않는다/)
  })

  it('AC-7909.1: 후보 고르기 단추는 `{글자} {이름} · {행정동 이름}`(그날 값 place) — 행정동 이름이 없으면 이름만', async () => {
    const plain = makeCandidate({ id: THIRD_ID, name: '예시상가 1층', snapshot: null, createdAt: '2026-11-17T00:00:00.000Z' })
    vi.mocked(loadLocation).mockResolvedValue(data({ candidates: [A, B, plain] }))
    await open({ tab: 'detail', candidateId: CAND_ID })
    const [a, c] = within(candBar()).getAllByRole('button')
    expect(a!.textContent).toContain('예시빌딩 3층 · 가람동')
    expect(c!.textContent).toContain('예시상가 1층')
    expect(c!.textContent).not.toContain('·')
  })

  it("AC-7920.2: '이렇게 봤어요'는 그 후보 그날 값 기준 날짜·고른 경쟁 과목으로 채우고, 펼침은 묶음마다 따로 쥐어 범위를 바꿔 다시 받아도 그대로다", async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => ({ ...A, id, ...ch, snapshotAt: ch.snapshot?.at ?? A.snapshotAt }))
    await open({ tab: 'detail', candidateId: CAND_ID })
    expect(section('sec-comp').textContent).toContain('범위 안 경쟁 의원(정형외과·신경외과·마취통증·재활)을 세고')
    fireEvent.click(within(section('sec-hours')).getByRole('button', { name: '더 보기' }))
    // [[nmc]](진료 시간) = 그날 값 의원 목록(rivals) 기준 날짜
    expect(section('sec-hours').textContent).toContain('(요일별·공휴일 진료 시간, 기준 2026년 11월 15일)')
    expect(within(section('sec-people')).getByRole('button', { name: '더 보기' })).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: '살필 범위' }), { target: { value: '4' } })
    await waitFor(() => expect(updateCandidate).toHaveBeenCalledTimes(1), { timeout: 4000 })
    expect(vi.mocked(updateCandidate).mock.calls[0]![2].radiusM).toBe(1500)
    await waitFor(() => expect(section('sec-hours').textContent).toContain('범위 1.5km'))
    expect(within(section('sec-hours')).getByRole('button', { name: '접기' })).toBeTruthy()
    expect(within(section('sec-people')).getByRole('button', { name: '더 보기' })).toBeTruthy()
  })

  it('AC-7921.6: 둘레 다른 과 의원 묶음은 틀 칸 others에 한 번 — 30m 안 의원·약국(카카오 k-near 약국, 볼 때만)을 카카오 도로명과 견줘 같은 건물·옆 건물로 가르고, 저장하지 않는다', async () => {
    await open({ tab: 'detail', candidateId: CAND_ID })
    await waitFor(() => expect(screen.getByTestId('others-near').textContent).toContain('같은 건물: 약국 1'))
    const near = screen.getByTestId('others-near').textContent ?? ''
    expect(near).toContain('옆 건물: 정형외과 1')
    expect(near).not.toContain('약국 2')
    expect(section('sec-others').contains(screen.getByTestId('others-near'))).toBe(true)
    // 경쟁 묶음도 같은 카카오 도로명으로 30m 안 의원을 가른다
    expect(section('sec-comp').textContent).toContain('옆 건물')
    for (const save of [updateCandidate, addCandidate]) expect(save).not.toHaveBeenCalled()
  })
})
