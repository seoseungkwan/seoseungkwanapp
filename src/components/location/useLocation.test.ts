// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { incomeOf, industryOf } from '@/lib/location/data'
import { collect, collectScan } from '@/lib/location/collect'
import { DEFAULT_DEPT_RULE, fillDeptRule } from '@/lib/location/depts'
import { DEFAULT_SCORE_RULE, fillScoreRule } from '@/lib/location/score'
import { checkSnapshot, fitSnapshot, mergeSnapshot, SNAPSHOT_KEYS } from '@/lib/location/snapshot'
import { addCompany, addPerson, loadContacts } from '@/lib/storage/contacts'
import {
  addCandidate,
  addListing,
  addNote,
  deleteCandidate,
  loadLocation,
  LocationStorageError,
  markCandidateEventsSeen,
  readPhoto,
  resetDeptRule,
  saveDeptRule,
  saveScoreRule,
  updateCandidate,
  updateListing,
  type LocationData,
} from '@/lib/storage/location'
import type { Company, ContactBook, Person } from '@/types/contacts'
import type { Candidate, DeptRule, Listing, LocationNote, LocationPhoto, Query, QueryReply, Snapshot } from '@/types/location'
import { queryLocation, readBus, readDongIndex, readDongs, readKeys, readRail, readTransitIndex } from './clients'
import { CAND_ID, makeCandidate, makeListing, makeSnapshot, OTHER_LISTING, TODAY } from './detail/frame/frame.test.data'
import { DONGS, INDEX, scanData } from './scan/scanData.test.data'
import { usePhotoUrls, useLocation } from './useLocation'

// 입지 분석 잇기(spec location TASK-44 · REQ-7908·REQ-7917·REQ-7919, design.md 6·12·14절, ADR-045).
// 저장 함수·주소록 저장·부르기(clients)·supabaseBrowser는 흉내 낸다(실제 Supabase·바깥 사이트를 부르지 않는다).
// 모으기(collect·collectScan)와 그날 값 합치기(mergeSnapshot·fitSnapshot)는 진짜 함수를 그대로 돌리고 부른 값만 엿본다.
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
    readPhoto: vi.fn(),
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
// 진짜 모으기를 돌리되 부른 값을 본다
vi.mock('@/lib/location/collect', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/location/collect')>()
  return { ...real, collect: vi.fn(real.collect), collectScan: vi.fn(real.collectScan) }
})
vi.mock('@/lib/location/snapshot', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/location/snapshot')>()
  return { ...real, fitSnapshot: vi.fn(real.fitSnapshot), mergeSnapshot: vi.fn(real.mergeSnapshot) }
})

const ROAD = '예시로 12'
const JIBUN = '예시구 가람동 1-2'
const LOT = { bcode: '1199951000', main: 1, sub: 2, san: false }
const PLACE = (name: string, category: string, distM: number, road: string | null = null) => ({ name, category, at: { lat: 37.5, lng: 127 }, distM, road })

/** 바깥 자료 흉내: 카카오만 답하고 공공 자료는 모두 '받지 못함' */
function fakeAsk(q: Query): Promise<QueryReply> {
  const ok = (value: unknown): QueryReply => ({ ok: true, value, src: 'kakao-local', asOf: TODAY })
  switch (q.kind) {
    case 'k-point':
      return Promise.resolve(ok({ road: ROAD, jibun: JIBUN, bjd: LOT.bcode, hjd: null, lot: LOT }))
    case 'k-address':
      return Promise.resolve(ok([{ at: { lat: 37.501, lng: 127.002 }, road: ROAD, jibun: JIBUN, bjd: LOT.bcode, lot: LOT }]))
    case 'k-near':
      if (q.cat === 'PM9') return Promise.resolve(ok({ places: [PLACE('예시온약국', '의료,건강 > 약국', 20, ROAD)], capped: false }))
      if (q.cat === 'MT1') return Promise.resolve(ok({ places: [PLACE('예시마트', '가정,생활 > 마트', 300)], capped: false }))
      return Promise.resolve(
        ok({
          places: [PLACE('예시가람정형외과의원', '의료,건강 > 병원 > 정형외과', 50), PLACE('예시종합병원', '의료,건강 > 병원 > 종합병원', 900)],
          capped: false,
        }),
      )
    case 'k-keyword':
      return Promise.resolve(
        ok({ places: [PLACE('예시일반산업단지', '부동산 > 산업단지', 1500), PLACE('산업단지앞 정류장', '교통,수송 > 버스정류장', 100)], capped: false }),
      )
    default:
      return Promise.resolve({ ok: false, code: 'failed' })
  }
}

/** checkSnapshot을 지나는 그날 값(기준 날짜를 모두 'YYYY-MM-DD'로) — 저장된 값은 이 모양이다.
 * 출처 id는 frame.test.data 그대로(모으기 collect.ts SRC와 같은 id, 모두 SOURCES에 있음) */
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

function data(over: Partial<LocationData> = {}): LocationData {
  return {
    settings: { scoreRule: fillScoreRule(null), deptRule: fillDeptRule(null), homeEswt: null, updatedAt: null },
    candidates: [makeCandidate({ snapshot: validSnapshot() })],
    listings: [makeListing(), OTHER_LISTING],
    notes: [],
    photos: [],
    events: [],
    ...over,
  }
}

const NEW_ID = '55555555-5555-4555-8555-555555555555'
const savedCandidate = (over: Partial<Candidate> = {}) => makeCandidate({ id: NEW_ID, snapshot: makeSnapshot(), ...over })
const note = (over: Partial<LocationNote> = {}): LocationNote => ({
  id: '66666666-6666-4666-8666-666666666666',
  candidateId: CAND_ID,
  day: TODAY,
  body: '메모',
  createdAt: '2026-11-22T01:00:00.000Z',
  ...over,
})

async function ready() {
  const hook = renderHook(() => useLocation())
  await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
  return hook
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-22T01:40:00Z')) // 한국 2026-11-22 10:40
  vi.mocked(loadLocation).mockResolvedValue(data())
  vi.mocked(readKeys).mockResolvedValue({ data: 'ok', kakao: 'ok' })
  vi.mocked(readDongIndex).mockResolvedValue(null)
  vi.mocked(readDongs).mockResolvedValue(null)
  vi.mocked(readTransitIndex).mockResolvedValue(null)
  vi.mocked(readRail).mockResolvedValue(null)
  vi.mocked(readBus).mockResolvedValue(null)
  vi.mocked(queryLocation).mockImplementation((q) => fakeAsk(q) as never)
  vi.mocked(markCandidateEventsSeen).mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('열 때 (TASK-44 · AC-7908.4)', () => {
  it('AC-7908.4: 열 때 표 여섯(loadLocation)과 열쇠(readKeys)를 한 번씩만 부른다. 지금 의원 환자 숫자(readDays)는 읽지 않는다', async () => {
    const { result, rerender } = await ready()
    rerender()
    expect(loadLocation).toHaveBeenCalledTimes(1)
    expect(loadLocation).toHaveBeenCalledWith(CLIENT)
    expect(readKeys).toHaveBeenCalledTimes(1)
    expect(result.current.keys).toEqual({ data: 'ok', kakao: 'ok' })
    expect(result.current.candidates.map((c) => c.id)).toEqual([CAND_ID])
    // 바깥 자료는 열 때 부르지 않는다(후보를 열 때·저장할 때만)
    expect(queryLocation).not.toHaveBeenCalled()
    for (const file of ['src/components/location/useLocation.ts', 'src/components/location/LocationScreen.tsx']) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/readDays|lib\/storage\/stats|stats_days/)
    }
  })

  it('E-LOC-READ-FAILED: 표를 못 읽으면 failed이고, [다시 읽기](reload)로 다시 읽는다', async () => {
    vi.mocked(loadLocation).mockRejectedValueOnce(new LocationStorageError('E-LOC-READ-FAILED'))
    const { result } = renderHook(() => useLocation())
    await waitFor(() => expect(result.current.load.status).toBe('failed'))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.load.status).toBe('ready'))
    expect(loadLocation).toHaveBeenCalledTimes(2)
  })
})

describe('후보 더하기 · 그날 값 굳히기 (AC-7908.1 · AC-7908.2)', () => {
  const DRAFT = { name: '예시빌딩 2층', addressNote: '예시구 가람동', lat: 37.501, lng: 127.002, radiusM: 700 as const, floorLabel: '', memo: '', listingId: null }

  it('AC-7908.2: collect(점, 범위, deps) → fitSnapshot(mergeSnapshot(새 값, 옛 값 없음))을 addCandidate로 저장하고, 몸통은 고른 점·적은 이름·적은 주소 글·범위·그날 값뿐(카카오 주소 글 없음)', async () => {
    vi.mocked(addCandidate).mockImplementation(async (_c, f) => savedCandidate({ ...f, snapshot: f.snapshot ?? null }))
    const { result } = await ready()
    let saved: Candidate | null = null
    await act(async () => {
      saved = await result.current.addCandidate(DRAFT)
    })
    expect(saved).not.toBeNull()
    expect(collect).toHaveBeenCalledTimes(1)
    const [point, radius, deps] = vi.mocked(collect).mock.calls[0]!
    expect(point).toEqual({ lat: 37.501, lng: 127.002 })
    expect(radius).toBe(700)
    // deps: ask = queryLocation, 파일 = clients read*, 소득·고용 = data/index.ts
    expect(deps.ask).toBe(queryLocation)
    await deps.dongFile('11999')
    expect(readDongs).toHaveBeenCalledWith('11999')
    await deps.busFile('11999')
    expect(readBus).toHaveBeenCalledWith('11999')
    await expect(deps.railFile()).rejects.toThrow()
    expect(readRail).toHaveBeenCalled()
    const income = incomeOf('11110')
    expect(await deps.income('11110')).toEqual(income.ok ? { v: income.v, asOf: income.asOf } : null)
    const industry = industryOf('00000')
    expect(industry.ok).toBe(false)
    expect(await deps.industry('00000')).toBeNull()
    expect(deps.now).toBe('2026-11-22T01:40:00.000Z')
    // 차례: 모은 값 → mergeSnapshot(새 값, null) → fitSnapshot → 저장
    const collected = await vi.mocked(collect).mock.results[0]!.value
    expect(mergeSnapshot).toHaveBeenCalledWith(collected, null)
    const merged = vi.mocked(mergeSnapshot).mock.results[0]!.value
    expect(fitSnapshot).toHaveBeenCalledWith(merged)
    const body = vi.mocked(addCandidate).mock.calls[0]![1]
    expect(vi.mocked(addCandidate).mock.calls[0]![0]).toBe(CLIENT)
    expect(Object.keys(body).sort()).toEqual(['addressNote', 'lat', 'lng', 'name', 'radiusM', 'snapshot'])
    expect(body).toMatchObject({ name: '예시빌딩 2층', addressNote: '예시구 가람동', lat: 37.501, lng: 127.002, radiusM: 700 })
    expect(body.snapshot).toBe(vi.mocked(fitSnapshot).mock.results[0]!.value)
    expect(Object.keys(body.snapshot!).sort()).toEqual(['at', 'radiusM', 'v', ...SNAPSHOT_KEYS].sort())
    // 모으기가 k-point를 불렀어도 카카오 주소 글·지번은 몸통 어디에도 없다(ADR-045)
    const text = JSON.stringify(body)
    for (const kakao of [ROAD, JIBUN, '예시온약국', '예시마트', '예시종합병원']) expect(text).not.toContain(kakao)
    expect(result.current.candidates.map((c) => c.id)).toEqual([CAND_ID, NEW_ID])
  })

  it('AC-7908.1: 층을 적었으면 updateCandidate(floorLabel), 메모가 있으면 오늘 날짜 addNote, 매물을 골랐으면 그 매물을 후보에 잇는다(updateListing) — addCandidate 다음 차례로', async () => {
    const order: string[] = []
    vi.mocked(addCandidate).mockImplementation(async (_c, f) => {
      order.push('addCandidate')
      return savedCandidate({ ...f, snapshot: f.snapshot ?? null })
    })
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => {
      order.push('updateCandidate')
      return savedCandidate({ id, floorLabel: ch.floorLabel ?? '' })
    })
    vi.mocked(addNote).mockImplementation(async (_c, candidateId, f) => {
      order.push('addNote')
      return note({ candidateId, ...f })
    })
    vi.mocked(updateListing).mockImplementation(async (_c, id, f) => {
      order.push('updateListing')
      return { ...OTHER_LISTING, ...f, id }
    })
    const { result } = await ready()
    await act(async () => {
      await result.current.addCandidate({ ...DRAFT, floorLabel: '2층', memo: '중개사 예시 씨가 보여 줌', listingId: OTHER_LISTING.id })
    })
    expect(order).toEqual(['addCandidate', 'updateCandidate', 'addNote', 'updateListing'])
    expect(updateCandidate).toHaveBeenCalledWith(CLIENT, NEW_ID, { floorLabel: '2층' })
    expect(addNote).toHaveBeenCalledWith(CLIENT, NEW_ID, { day: TODAY, body: '중개사 예시 씨가 보여 줌' })
    const [, listingId, fields] = vi.mocked(updateListing).mock.calls[0]!
    expect(listingId).toBe(OTHER_LISTING.id)
    expect(fields).toMatchObject({ candidateId: NEW_ID, title: OTHER_LISTING.title, rent: OTHER_LISTING.rent })
    expect(fields).not.toHaveProperty('id')
    expect(result.current.candidates.find((c) => c.id === NEW_ID)?.floorLabel).toBe('2층')
    expect(result.current.notes.map((n) => n.candidateId)).toEqual([NEW_ID])
    expect(result.current.listings.find((l) => l.id === OTHER_LISTING.id)?.candidateId).toBe(NEW_ID)
  })

  it('AC-7908.1: 층·메모·매물이 없으면 이어 하는 저장을 부르지 않고, addCandidate가 실패하면 null이고 아무것도 더하지 않는다', async () => {
    vi.mocked(addCandidate).mockRejectedValueOnce(new LocationStorageError('E-LOC-SAVE-FAILED'))
    const { result } = await ready()
    let saved: Candidate | null = makeCandidate()
    await act(async () => {
      saved = await result.current.addCandidate(DRAFT)
    })
    expect(saved).toBeNull()
    expect(updateCandidate).not.toHaveBeenCalled()
    expect(addNote).not.toHaveBeenCalled()
    expect(updateListing).not.toHaveBeenCalled()
    expect(result.current.candidates).toHaveLength(1)
    expect(result.current.adding).toBeNull()
  })
})

describe('다시 받기 (AC-7908.3)', () => {
  it('AC-7908.3: [오늘 값으로 다시 받기]는 fitSnapshot(mergeSnapshot(새 값, checkSnapshot(옛 값)))으로 덮는다 — 새로 못 받은 칸은 옛 값을 지난 값(prev)으로 둔다', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => makeCandidate({ id, ...ch, snapshotAt: ch.snapshot?.at ?? null }))
    const { result } = await ready()
    const old = result.current.candidates[0]!.snapshot!
    expect(checkSnapshot(old)).toEqual(old)
    await act(async () => {
      await result.current.refresh(CAND_ID)
    })
    const [point, radius] = vi.mocked(collect).mock.calls[0]!
    expect(point).toEqual({ lat: 37.5, lng: 127.0 })
    expect(radius).toBe(1000)
    expect(vi.mocked(mergeSnapshot).mock.calls[0]![1]).toEqual(old)
    const [, id, changes] = vi.mocked(updateCandidate).mock.calls[0]!
    expect(id).toBe(CAND_ID)
    expect(Object.keys(changes)).toEqual(['snapshot'])
    expect(changes.snapshot).toBe(vi.mocked(fitSnapshot).mock.results[0]!.value)
    // 새로 받은 시각, 못 받은 칸은 지난 값
    expect(changes.snapshot!.at).toBe('2026-11-22T01:40:00.000Z')
    expect(changes.snapshot!.people).toMatchObject({ ok: false, prev: { v: old.people.ok ? old.people.v : null, asOf: '2026-10-31' } })
    expect(result.current.candidates[0]!.snapshot!.at).toBe('2026-11-22T01:40:00.000Z')
    expect(result.current.refreshing).toEqual({})
  })

  it('AC-7908.3: 범위를 바꾸면 그 범위로 다시 모으고 범위·그날 값을 함께 고친다', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => makeCandidate({ id, ...ch }))
    const { result } = await ready()
    await act(async () => {
      await result.current.refresh(CAND_ID, 1500)
    })
    expect(vi.mocked(collect).mock.calls[0]![1]).toBe(1500)
    const changes = vi.mocked(updateCandidate).mock.calls[0]![2]
    expect(Object.keys(changes).sort()).toEqual(['radiusM', 'snapshot'])
    expect(changes.radiusM).toBe(1500)
    expect(changes.snapshot!.radiusM).toBe(1500)
  })
})

describe('후보를 열 때 — 카카오는 볼 때만 (AC-7908.4 · AC-7915.2)', () => {
  it('AC-7908.4·AC-7915.2: 후보를 열면 markCandidateEventsSeen(그 후보)을 부르고, k-point로 주소 글·필지 번호를, 장소 찾기로 약국·마트·큰 병원·산업단지를 새로 받는다 — 저장 함수에는 아무것도 넘기지 않는다', async () => {
    const { result } = await ready()
    act(() => result.current.openCandidate(CAND_ID))
    await waitFor(() => expect(result.current.viewed?.near.industryPark).toBeDefined())
    expect(markCandidateEventsSeen).toHaveBeenCalledWith(CLIENT, CAND_ID)
    const asked = vi.mocked(queryLocation).mock.calls.map(([q]) => q)
    expect(asked).toEqual(
      expect.arrayContaining([
        { kind: 'k-point', at: { lat: 37.5, lng: 127 } },
        { kind: 'k-near', at: { lat: 37.5, lng: 127 }, r: 1000, cat: 'PM9' },
        { kind: 'k-near', at: { lat: 37.5, lng: 127 }, r: 1000, cat: 'MT1' },
        { kind: 'k-near', at: { lat: 37.5, lng: 127 }, r: 1000, cat: 'HP8' },
        { kind: 'k-keyword', at: { lat: 37.5, lng: 127 }, r: 1000, q: '산업단지' },
      ]),
    )
    expect(asked).toHaveLength(5)
    const v = result.current.viewed!
    expect(v.candidateId).toBe(CAND_ID)
    expect(v.address).toBe(ROAD)
    expect(v.pnu).toBe('1199951000100010002')
    const names = (kind: keyof typeof v.near) => {
      const r = v.near[kind]
      return r && r.ok ? r.value.places.map((p) => p.name) : null
    }
    expect(names('pharmacy')).toEqual(['예시온약국'])
    expect(names('mart')).toEqual(['예시마트'])
    // 큰 병원 = 병원 분류 가운데 종합병원·대학병원만
    expect(names('bigHospital')).toEqual(['예시종합병원'])
    // 산업단지 = 이름·분류가 단지인 곳만(industryParks)
    expect(names('industryPark')).toEqual(['예시일반산업단지'])
    for (const save of [updateCandidate, addCandidate, addNote, updateListing, addListing]) expect(save).not.toHaveBeenCalled()
  })

  it('AC-7908.4: 같은 후보를 다시 열면 다시 부른다(담아 두지 않음). 카카오가 못 받으면 주소 글·필지 번호는 null', async () => {
    const { result } = await ready()
    act(() => result.current.openCandidate(CAND_ID))
    await waitFor(() => expect(result.current.viewed?.address).toBe(ROAD))
    vi.mocked(queryLocation).mockResolvedValue({ ok: false, code: 'no-key', key: 'kakao' })
    act(() => result.current.openCandidate(CAND_ID))
    await waitFor(() => expect(result.current.viewed?.address).toBeNull())
    expect(result.current.viewed?.pnu).toBeNull()
    expect(result.current.viewed?.road).toBeNull()
    expect(result.current.viewed?.near.pharmacy).toEqual({ ok: false, code: 'no-key', key: 'kakao' })
    await waitFor(() => expect(result.current.viewed?.pharmacies).toBeNull())
    expect(vi.mocked(queryLocation).mock.calls.filter(([q]) => q.kind === 'k-point')).toHaveLength(2)
    expect(markCandidateEventsSeen).toHaveBeenCalledTimes(2)
  })

  it('AC-7921.6·AC-7908.4: 후보를 열면 카카오 도로명(road)과 30m 안 약국(이름·거리·도로명)을 볼 때만 받는다 — 저장 함수에는 넘기지 않는다', async () => {
    const pharmacy = (places: ReturnType<typeof PLACE>[]): QueryReply => ({ ok: true, value: { places, capped: false }, src: 'kakao-local', asOf: TODAY })
    vi.mocked(queryLocation).mockImplementation(((q: Query) =>
      q.kind === 'k-near' && q.cat === 'PM9'
        ? Promise.resolve(
            pharmacy([
              PLACE('예시온약국', '의료,건강 > 약국', 20, ROAD),
              PLACE('예시먼약국', '의료,건강 > 약국', 300, '예시로 99'),
              PLACE('예시곁약국', '의료,건강 > 약국', 30),
            ]),
          )
        : fakeAsk(q)) as never)
    const { result } = await ready()
    act(() => result.current.openCandidate(CAND_ID))
    await waitFor(() => expect(result.current.viewed?.pharmacies).toBeDefined())
    await waitFor(() => expect(result.current.viewed?.road).toBe(ROAD))
    expect(result.current.viewed?.pharmacies).toEqual([
      { name: '예시온약국', distM: 20, road: ROAD },
      { name: '예시곁약국', distM: 30, road: null },
    ])
    for (const save of [updateCandidate, addCandidate, addNote, updateListing, addListing]) expect(save).not.toHaveBeenCalled()
  })

  it('AC-7908.1: 주소 찾기(k-address)·찍은 자리(k-point)는 화면에 보일 글만 돌려준다', async () => {
    const { result } = await ready()
    await expect(result.current.findAddress('예시로 12')).resolves.toEqual({
      ok: true,
      hits: [{ at: { lat: 37.501, lng: 127.002 }, road: ROAD, jibun: JIBUN }],
    })
    expect(queryLocation).toHaveBeenCalledWith({ kind: 'k-address', q: '예시로 12' })
    await expect(result.current.spotAddress({ lat: 37.5011111, lng: 127.0022222 })).resolves.toEqual({ ok: true, road: ROAD, jibun: JIBUN })
    expect(queryLocation).toHaveBeenCalledWith({ kind: 'k-point', at: { lat: 37.501111, lng: 127.002222 } })
    vi.mocked(queryLocation).mockResolvedValue({ ok: false, code: 'no-key', key: 'kakao' })
    await expect(result.current.findAddress('예시로 12')).resolves.toEqual({ ok: false, why: 'no-key' })
    vi.mocked(queryLocation).mockResolvedValue({ ok: false, code: 'not-applied' })
    await expect(result.current.spotAddress({ lat: 37.5, lng: 127 })).resolves.toEqual({ ok: false, why: 'failed' })
  })
})

describe('점수 설정 (AC-7919.3 · AC-7919.4)', () => {
  it('AC-7919.3: 설정을 바꾸면(changeRule) 다시 부르지 않고 손에 든 설정만 바꾼다', async () => {
    const { result } = await ready()
    expect(result.current.rule).toEqual(DEFAULT_SCORE_RULE)
    const next = { ...DEFAULT_SCORE_RULE, weights: { ...DEFAULT_SCORE_RULE.weights, rivals: 0 } }
    act(() => result.current.changeRule(next))
    expect(result.current.rule).toBe(next)
    expect(loadLocation).toHaveBeenCalledTimes(1)
    expect(queryLocation).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
    expect(saveScoreRule).not.toHaveBeenCalled()
  })

  it('AC-7919.4: 저장(saveRule)은 saveScoreRule 하나로 하고, 실패하면 저장 실패 알림(E-LOC-SAVE-FAILED)을 켠다', async () => {
    const next = { ...DEFAULT_SCORE_RULE, weights: { ...DEFAULT_SCORE_RULE.weights, rivals: 5 } }
    vi.mocked(saveScoreRule).mockResolvedValueOnce({ scoreRule: next, deptRule: fillDeptRule(null), homeEswt: null, updatedAt: '2026-11-22T01:41:00Z' })
    const { result } = await ready()
    await act(async () => result.current.saveRule(next))
    expect(saveScoreRule).toHaveBeenCalledWith(CLIENT, next)
    expect(result.current.saveError).toBe(false)
    vi.mocked(saveScoreRule).mockRejectedValueOnce(new LocationStorageError('E-LOC-SAVE-FAILED'))
    await act(async () => result.current.saveRule(next))
    await waitFor(() => expect(result.current.saveError).toBe(true))
    act(() => result.current.clearSaveError())
    expect(result.current.saveError).toBe(false)
  })
})

describe('의원 과목 고르기 (AC-7921.2)', () => {
  const MINE: DeptRule = { v: 1, rival: ['ortho', 'korean'], hide: ['derm'] }
  const savedSettings = (deptRule: DeptRule) => ({ scoreRule: fillScoreRule(null), deptRule, homeEswt: null, updatedAt: '2026-11-22T01:41:00Z' })
  const DRAFT = { name: '예시빌딩 2층', addressNote: '예시구 가람동', lat: 37.501, lng: 127.002, radiusM: 700 as const, floorLabel: '', memo: '', listingId: null }

  it('AC-7921.2: 열 때 loadLocation의 settings.deptRule을 쥐고, changeDeptRule은 다시 부르지도 저장하지도 않고 손에 든 설정만 바꾼다', async () => {
    vi.mocked(loadLocation).mockResolvedValue(data({ settings: { ...data().settings, deptRule: MINE } }))
    const { result } = await ready()
    expect(result.current.deptRule).toEqual(MINE)
    const next: DeptRule = { v: 1, rival: ['pain'], hide: [] }
    act(() => result.current.changeDeptRule(next))
    expect(result.current.deptRule).toBe(next)
    expect(loadLocation).toHaveBeenCalledTimes(1)
    expect(queryLocation).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
    expect(saveDeptRule).not.toHaveBeenCalled()
  })

  it('AC-7921.2: 저장(saveDeptRule)은 storage saveDeptRule 하나로 하고, 처음 값([기본값으로])이면 resetDeptRule로 되돌린다. 실패하면 저장 실패 알림(E-LOC-SAVE-FAILED)', async () => {
    vi.mocked(saveDeptRule).mockImplementation(async (_c, r) => savedSettings(r))
    vi.mocked(resetDeptRule).mockResolvedValue(savedSettings(fillDeptRule(null)))
    const { result } = await ready()
    await act(async () => result.current.saveDeptRule(MINE))
    expect(saveDeptRule).toHaveBeenCalledWith(CLIENT, MINE)
    expect(resetDeptRule).not.toHaveBeenCalled()
    expect(result.current.settings?.deptRule).toEqual(MINE)
    await act(async () => result.current.saveDeptRule(fillDeptRule(DEFAULT_DEPT_RULE)))
    expect(resetDeptRule).toHaveBeenCalledWith(CLIENT)
    expect(saveDeptRule).toHaveBeenCalledTimes(1)
    expect(result.current.settings?.deptRule).toEqual(DEFAULT_DEPT_RULE)
    expect(result.current.saveError).toBe(false)
    vi.mocked(saveDeptRule).mockRejectedValueOnce(new LocationStorageError('E-LOC-SAVE-FAILED'))
    await act(async () => result.current.saveDeptRule(MINE))
    await waitFor(() => expect(result.current.saveError).toBe(true))
  })

  it('AC-7921.2·AC-7908.3: 후보 더하기·[다시 받기]·동네 훑기 모으기는 지금 손에 든 과목 고르기(deps.deptRule)로 부른다', async () => {
    vi.mocked(addCandidate).mockImplementation(async (_c, f) => savedCandidate({ ...f, snapshot: f.snapshot ?? null }))
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => makeCandidate({ id, ...ch }))
    vi.mocked(collectScan).mockResolvedValueOnce({ ok: false, why: 'failed' } as never)
    const { result } = await ready()
    act(() => result.current.changeDeptRule(MINE))
    await act(async () => {
      await result.current.addCandidate(DRAFT)
    })
    await act(async () => result.current.refresh(CAND_ID))
    act(() => result.current.pickSgg('11999'))
    await waitFor(() => expect(collectScan).toHaveBeenCalledTimes(1))
    expect(vi.mocked(collect).mock.calls.map(([, , deps]) => deps.deptRule)).toEqual([MINE, MINE])
    expect(vi.mocked(collectScan).mock.calls[0]![1].deptRule).toEqual(MINE)
  })
})

describe('진행 상태 · 매물 · 주소록 (AC-7913.4 · AC-7914.1 · AC-7910.4)', () => {
  it('AC-7913.4·AC-7914.1: 진행 상태를 바꾸면 updateCandidate(status) 뒤 오늘 날짜 메모 한 줄을 남긴다(견주기 곁글 "진행 메모에 날짜가 남아요")', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => makeCandidate({ id, ...ch }))
    vi.mocked(addNote).mockImplementation(async (_c, candidateId, f) => note({ candidateId, ...f }))
    const { result } = await ready()
    await act(async () => result.current.setStatus(CAND_ID, 'contacted'))
    await waitFor(() => expect(addNote).toHaveBeenCalledTimes(1))
    expect(updateCandidate).toHaveBeenCalledWith(CLIENT, CAND_ID, { status: 'contacted' })
    expect(addNote).toHaveBeenCalledWith(CLIENT, CAND_ID, { day: TODAY, body: '진행 상태를 바꿨어요: 보는 중 → 중개사 연락' })
    expect(vi.mocked(updateCandidate).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(addNote).mock.invocationCallOrder[0]!)
    await waitFor(() => expect(result.current.candidates[0]!.status).toBe('contacted'))
    expect(result.current.notes.map((n) => n.body)).toEqual(['진행 상태를 바꿨어요: 보는 중 → 중개사 연락'])
    // 같은 상태면 아무것도 하지 않는다
    await act(async () => result.current.setStatus(CAND_ID, 'contacted'))
    expect(updateCandidate).toHaveBeenCalledTimes(1)
  })

  const BROKER = {
    company: {
      category: 'other' as const,
      name: '예시공인중개사',
      phone: '02-000-0000',
      work: '부동산 중개',
      address: '',
      homepage: '',
      bizNo: '',
      account: '',
      siteId: '',
      sitePw: '',
      memo: '',
    },
    person: { name: '김예시', mobile: '', role: '' },
  }
  const COMPANY: Company = { ...BROKER.company, id: '77777777-7777-4777-8777-777777777777' }
  const PERSON: Person = { ...BROKER.person, id: 'p1', companyId: COMPANY.id }
  const FIELDS = (() => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = makeListing({ id: 'x', candidateId: null, title: '예시상가 1층' })
    void _id
    void _c
    void _u
    return rest
  })()
  const SAVED: Listing = makeListing({ ...FIELDS, id: '88888888-8888-4888-8888-888888888888' })

  it('AC-7910.4: 매물 저장 → addListing → 중개사가 있으면 addCompany → addPerson → updateListing(brokerId)로 잇는다', async () => {
    vi.mocked(addListing).mockResolvedValue(SAVED)
    vi.mocked(addCompany).mockResolvedValue(COMPANY)
    vi.mocked(addPerson).mockResolvedValue(PERSON)
    vi.mocked(updateListing).mockImplementation(async (_c, id, f) => ({ ...SAVED, ...f, id }))
    const { result } = await ready()
    await act(async () => result.current.saveListing(FIELDS, BROKER))
    expect(addListing).toHaveBeenCalledWith(CLIENT, FIELDS)
    expect(addCompany).toHaveBeenCalledWith(CLIENT, BROKER.company)
    expect(addPerson).toHaveBeenCalledWith(CLIENT, COMPANY.id, BROKER.person)
    expect(updateListing).toHaveBeenCalledWith(CLIENT, SAVED.id, { ...FIELDS, brokerId: COMPANY.id })
    expect(result.current.listings.find((l) => l.id === SAVED.id)?.brokerId).toBe(COMPANY.id)
    expect(loadContacts).not.toHaveBeenCalled()
  })

  it("AC-7910.4: 같은 이름 업체가 있으면('duplicate') 주소록에서 그 업체를 찾아 잇는다. 담당자가 이미 있어도('duplicate') 잇기는 한다", async () => {
    vi.mocked(addCompany).mockResolvedValue('duplicate')
    vi.mocked(addPerson).mockResolvedValue('duplicate')
    const book: ContactBook = { companies: [{ ...COMPANY, name: '다른업체', id: 'c-other' }, COMPANY], people: [], equipment: [], repairs: [] }
    vi.mocked(loadContacts).mockResolvedValue(book)
    vi.mocked(updateListing).mockImplementation(async (_c, id, f) => ({ ...OTHER_LISTING, ...f, id }))
    const { result } = await ready()
    await act(async () => result.current.addBroker(OTHER_LISTING.id, BROKER))
    expect(loadContacts).toHaveBeenCalledWith(CLIENT)
    expect(addPerson).toHaveBeenCalledWith(CLIENT, COMPANY.id, BROKER.person)
    expect(vi.mocked(updateListing).mock.calls[0]![2]).toMatchObject({ brokerId: COMPANY.id, title: OTHER_LISTING.title })
  })

  it('AC-7910.4: 업체를 넣지 못하면(invalid) 던져서 매물 화면이 오류를 보이게 한다(매물은 고치지 않음)', async () => {
    vi.mocked(addCompany).mockResolvedValue('invalid')
    const { result } = await ready()
    await expect(act(async () => result.current.addBroker(OTHER_LISTING.id, BROKER))).rejects.toThrow()
    expect(updateListing).not.toHaveBeenCalled()
  })
})

describe('동네 훑기 (AC-7907.1 · AC-7919.3)', () => {
  it('AC-7907.1: 시군구를 고르면 그 동 경계(readDongs)를 읽고 collectScan(시군구, deps) 결과를 그대로 넘긴다(저장하지 않음)', async () => {
    vi.mocked(readDongIndex).mockResolvedValue(INDEX)
    vi.mocked(readDongs).mockResolvedValue({ asOf: '2026-06-30', dongs: DONGS })
    const scanned = { ok: true as const, ...scanData() }
    vi.mocked(collectScan).mockResolvedValueOnce(scanned as never)
    const { result } = await ready()
    expect(result.current.index).toEqual(INDEX)
    act(() => result.current.pickSgg('11999'))
    expect(result.current.scan.sgg).toBe('11999')
    await waitFor(() => expect(result.current.scan.result).toBe(scanned))
    expect(result.current.scan.dongs).toEqual(DONGS)
    expect(result.current.scan.progress).toBeNull()
    const [sgg, deps] = vi.mocked(collectScan).mock.calls[0]!
    expect(sgg).toBe('11999')
    expect(deps.ask).toBe(queryLocation)
    expect(await deps.dongIndex()).toEqual(INDEX)
    // 열 때 읽은 동 목록·고른 시군구 동 경계는 다시 읽지 않는다
    await deps.dongFile('11999')
    expect(readDongIndex).toHaveBeenCalledTimes(1)
    expect(readDongs).toHaveBeenCalledTimes(1)
    for (const save of [updateCandidate, addCandidate, saveScoreRule]) expect(save).not.toHaveBeenCalled()
  })
})

describe('사진 주소 (AC-7913.4)', () => {
  const PHOTO = (id: string): LocationPhoto => ({
    id,
    candidateId: CAND_ID,
    path: `h/${CAND_ID}/${id}.jpg`,
    label: '입구',
    takenOn: TODAY,
    createdAt: '2026-11-22T01:00:00.000Z',
  })

  it('AC-7913.4: readPhoto로 받은 사진을 blob 주소로 바꿔 넘기고, 사진이 빠지거나 다 쓰면(화면을 떠나면) 되돌린다(revoke)', async () => {
    const made: string[] = []
    const revoked: string[] = []
    const real = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:photo-${made.length + 1}`
      made.push(url)
      return url
    })
    URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url))
    onTestFinished(() => {
      URL.createObjectURL = real.create
      URL.revokeObjectURL = real.revoke
    })
    const read = vi.fn(async (path: string) => (path.includes('bad') ? null : new Blob(['jpeg'], { type: 'image/jpeg' })))
    const a = PHOTO('aaaa')
    const b = PHOTO('bbbb')
    const bad = PHOTO('bad1')
    const { result, rerender, unmount } = renderHook(({ photos }) => usePhotoUrls(read, photos), { initialProps: { photos: [a, b, bad] } })
    await waitFor(() => expect(result.current).toEqual({ aaaa: 'blob:photo-1', bbbb: 'blob:photo-2', bad1: null }))
    expect(read).toHaveBeenCalledTimes(3)
    rerender({ photos: [a] })
    await waitFor(() => expect(revoked).toEqual(['blob:photo-2']))
    expect(read).toHaveBeenCalledTimes(3) // 있던 사진은 다시 받지 않는다
    unmount()
    expect(revoked).toEqual(['blob:photo-2', 'blob:photo-1'])
  })

  it('AC-7913.4: 훅의 readPhoto는 storage readPhoto(client, 자리)다', async () => {
    vi.mocked(readPhoto).mockResolvedValue(null)
    const { result } = await ready()
    await expect(result.current.readPhoto('h/c/x.jpg')).resolves.toBeNull()
    expect(readPhoto).toHaveBeenCalledWith(CLIENT, 'h/c/x.jpg')
  })
})

// 후보 지우기(AC-7914.3 · AC-7902.4, design.md 14절, TASK-93)
describe('후보 지우기 (AC-7914.3 · AC-7902.4)', () => {
  const OTHER = '77777777-7777-4777-8777-777777777777'
  const photo = (id: string, candidateId: string): LocationPhoto => ({ id, candidateId, path: `h/${id}.jpg`, label: '', takenOn: null, createdAt: '2026-11-22T01:00:00.000Z' })
  const twoCandidates = () =>
    data({
      candidates: [makeCandidate({ snapshot: validSnapshot() }), makeCandidate({ id: OTHER, name: '다른 후보' })],
      notes: [note(), note({ id: '99999999-9999-4999-8999-999999999991', candidateId: OTHER })],
      photos: [photo('99999999-9999-4999-8999-999999999992', CAND_ID), photo('99999999-9999-4999-8999-999999999993', OTHER)],
    })

  it('AC-7914.3: removeCandidate는 deleteCandidate 뒤 그 후보와 메모·사진을 빼고, 매물은 후보 칸만 비운다', async () => {
    vi.mocked(loadLocation).mockResolvedValue(twoCandidates())
    vi.mocked(deleteCandidate).mockResolvedValue(undefined)
    const { result } = await ready()
    await act(async () => result.current.removeCandidate(CAND_ID))
    expect(deleteCandidate).toHaveBeenCalledWith(CLIENT, CAND_ID)
    expect(result.current.candidates.map((c) => c.id)).toEqual([OTHER])
    expect(result.current.notes.map((n) => n.candidateId)).toEqual([OTHER])
    expect(result.current.photos.map((p) => p.candidateId)).toEqual([OTHER])
    const mine = makeListing()
    expect(result.current.listings.find((l) => l.id === mine.id)?.candidateId).toBeNull()
    expect(result.current.listings.find((l) => l.id === OTHER_LISTING.id)?.candidateId).toBe(OTHER_LISTING.candidateId)
    expect(result.current.saveError).toBe(false)
  })

  it('AC-7914.3: 지우기에 실패하면 던지지 않고 아무것도 빼지 않으며 저장 실패 알림', async () => {
    vi.mocked(loadLocation).mockResolvedValue(twoCandidates())
    vi.mocked(deleteCandidate).mockRejectedValue(new LocationStorageError('E-LOC-SAVE-FAILED'))
    const { result } = await ready()
    await act(async () => result.current.removeCandidate(CAND_ID))
    expect(result.current.candidates).toHaveLength(2)
    expect(result.current.notes).toHaveLength(2)
    expect(result.current.photos).toHaveLength(2)
    expect(result.current.saveError).toBe(true)
  })
})

// 같은 후보를 받는 중이면 다시 부르지 않는다(AC-7917.4, TASK-95 — 겹쳐 돌지 않게)
describe('다시 받기 겹치지 않기 (AC-7917.4)', () => {
  it('AC-7917.4: 받는 중에 refresh를 또 부르면 모으기를 다시 부르지 않고, 끝난 뒤에는 다시 부를 수 있다', async () => {
    vi.mocked(updateCandidate).mockImplementation(async (_c, id, ch) => makeCandidate({ id, ...ch }))
    let finish: (s: Snapshot) => void = () => {}
    vi.mocked(collect).mockImplementationOnce(() => new Promise<Snapshot>((r) => (finish = r)))
    const { result } = await ready()
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.refresh(CAND_ID)
    })
    await waitFor(() => expect(result.current.refreshing[CAND_ID]).toBeTruthy())
    await act(async () => result.current.refresh(CAND_ID))
    expect(collect).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish(validSnapshot())
      await first
    })
    expect(result.current.refreshing).toEqual({})
    await act(async () => result.current.refresh(CAND_ID))
    expect(collect).toHaveBeenCalledTimes(2)
  })
})
