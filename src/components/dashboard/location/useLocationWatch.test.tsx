// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryLocation } from '@/components/location/clients'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import {
  addEvents,
  listUnseenEvents,
  listWatchCandidates,
  LocationStorageError,
  markCandidateEventsSeen,
  markEventsSeen,
  readDeptRule,
  setWatchChecked,
} from '@/lib/storage/location'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DeptRule, LicenseRow, LocationEvent, Query, QueryReply, WatchCandidate } from '@/types/location'
import type { AlertLine } from './alertLines'
import { LOCATION_WATCH_TIMEOUT_MS, useLocationWatch } from './useLocationWatch'

// 대시보드 새 경쟁 의원 알림 읽기 훅 (specs/location REQ-7915 AC-7915.1·AC-7915.2·AC-7915.3, design.md 12절).
// 저장 함수(lib/storage/location)·바깥 자료 부르기(queryLocation)·Supabase 클라이언트는 잡아 두고 답을 시험이 정한다.
// 진짜 Supabase·서버 경로·바깥 사이트에 붙지 않는다. 후보·의원은 모두 지어낸 값이다
vi.mock('@/lib/storage/location', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/location')>()
  return {
    ...real,
    listWatchCandidates: vi.fn(),
    addEvents: vi.fn(),
    setWatchChecked: vi.fn(),
    listUnseenEvents: vi.fn(),
    markEventsSeen: vi.fn(),
    markCandidateEventsSeen: vi.fn(),
    readDeptRule: vi.fn(),
  }
})
vi.mock('@/components/location/clients', () => ({ queryLocation: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }))

const TODAY = '2026-11-22'
const CLIENT = { from: vi.fn(), rpc: vi.fn(), storage: {} } as unknown as SupabaseClient

// 후보 A(서울 어딘가, 범위 1km)·B(범위 500m): 확인한 적 없음. C: 10일 전에 확인. D: 내려놓음
const cand = (id: string, over: Partial<WatchCandidate> = {}): WatchCandidate => ({
  id,
  name: `예시후보 ${id.slice(0, 1).toUpperCase()}`,
  status: 'watching',
  lat: 37.5,
  lng: 127.0,
  radiusM: 1000,
  watchCheckedOn: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  ...over,
})
const A = cand('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { name: '예시빌딩 3층', createdAt: '2026-11-01T00:00:00.000Z' })
const B = cand('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { name: '예시타워 1층', radiusM: 500, createdAt: '2026-11-02T00:00:00.000Z' })
const C = cand('cccccccc-cccc-4ccc-8ccc-cccccccccccc', { watchCheckedOn: '2026-11-12', createdAt: '2026-11-03T00:00:00.000Z' })
const D = cand('dddddddd-dddd-4ddd-8ddd-dddddddddddd', { status: 'dropped', createdAt: '2026-11-04T00:00:00.000Z' })

// 후보 점(37.5, 127.0)에서 북쪽으로 약 300m(0.0027도)·약 800m(0.0072도)·약 3km(0.027도)
const NEAR = { lat: 37.5027, lng: 127.0 }
const MID = { lat: 37.5072, lng: 127.0 }
const FAR = { lat: 37.527, lng: 127.0 }
const row = (name: string, dept: string, on: { openedOn?: string; closedOn?: string }, point: LicenseRow['point']): LicenseRow & { address: string } => ({
  name,
  dept,
  openedOn: on.openedOn ?? null,
  closedOn: on.closedOn ?? null,
  address: '서울특별시 예시구 예시로 1',
  point,
})
const OPEN_ROWS = [
  row('예시★★정형외과의원', '정형외과', { openedOn: '2026-11-10' }, NEAR),
  row('예시★★정형외과의원', '정형외과', { openedOn: '2026-11-10' }, NEAR), // 같은 줄 두 번 → 한 줄
  row('예시◆◆통증의원', '마취통증의학과', { openedOn: '2026-11-03' }, MID), // A(1km) 안 · B(500m) 밖
  row('예시치과의원', '치과', { openedOn: '2026-11-04' }, NEAR), // 경쟁 의원 아님
  row('예시먼정형외과', '정형외과', { openedOn: '2026-11-05' }, FAR), // 범위 밖
]
const CLOSE_ROWS = [row('예시▼▼재활의학과의원', '재활의학과', { closedOn: '2026-11-05' }, NEAR)]
const ok = (rows: unknown[], capped = false): QueryReply => ({ ok: true, value: { rows, capped }, src: 'clinic-license', asOf: TODAY })

const UNSEEN: LocationEvent[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    candidateId: A.id,
    kind: 'open',
    clinicName: '예시★★정형외과의원',
    dept: '정형외과',
    eventOn: '2026-11-10',
    distM: 300,
    seenAt: null,
    createdAt: '2026-11-22T01:00:00.000Z',
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    candidateId: B.id,
    kind: 'close',
    clinicName: '예시▼▼재활의학과의원',
    dept: '재활의학과',
    eventOn: '2026-11-05',
    distM: 300,
    seenAt: null,
    createdAt: '2026-11-22T01:00:00.000Z',
  },
]
// 훅이 돌려주는 줄 = 안 본 줄 + 후보 이름 + 대표 과목 짧은 이름(처음 설정)
const LINES: AlertLine[] = [
  { ...UNSEEN[0]!, candidateName: '예시빌딩 3층', deptShort: '정형외과' },
  { ...UNSEEN[1]!, candidateName: '예시타워 1층', deptShort: '재활' },
]
const rule = (rival: DeptRule['rival'], hide: DeptRule['hide'] = []): DeptRule => ({ v: 1, rival, hide })

const flush = () =>
  act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve()
  })
const wait = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
const draw = (isAdmin: boolean | PromiseLike<boolean> = true, today = TODAY) =>
  renderHook(({ admin, day }) => useLocationWatch(admin, day), { initialProps: { admin: isAdmin, day: today } })
const consoleSpies = () => ['error', 'warn', 'log', 'info', 'debug'].map((name) => vi.spyOn(console, name as 'error'))
const queries = () => vi.mocked(queryLocation).mock.calls.map(([q]) => q)
// 기간마다 open·close 답을 정한다(못 정한 기간·종류는 failed)
const answerLicense = (answers: Record<string, QueryReply>) =>
  vi.mocked(queryLocation).mockImplementation(async (q: Query) => {
    if (q.kind !== 'clinic-license') return { ok: false, code: 'failed' }
    return answers[`${q.event} ${q.from} ${q.to}`] ?? { ok: false, code: 'failed' }
  })
const FIRST = { from: '2026-10-24', to: '2026-11-20' } // 확인한 적 없음: (오늘 − 30) + 1일 ~ 오늘 − 2일

beforeEach(() => {
  vi.mocked(supabaseBrowser).mockReset()
  vi.mocked(supabaseBrowser).mockReturnValue(CLIENT)
  vi.mocked(listWatchCandidates).mockReset()
  vi.mocked(listWatchCandidates).mockResolvedValue([A, B, C, D])
  vi.mocked(addEvents).mockReset()
  vi.mocked(addEvents).mockResolvedValue(undefined)
  vi.mocked(setWatchChecked).mockReset()
  vi.mocked(setWatchChecked).mockResolvedValue(undefined)
  vi.mocked(listUnseenEvents).mockReset()
  vi.mocked(listUnseenEvents).mockResolvedValue(UNSEEN)
  vi.mocked(markEventsSeen).mockReset()
  vi.mocked(markEventsSeen).mockResolvedValue(undefined)
  vi.mocked(markCandidateEventsSeen).mockReset()
  vi.mocked(markCandidateEventsSeen).mockResolvedValue(undefined)
  vi.mocked(readDeptRule).mockReset()
  vi.mocked(readDeptRule).mockResolvedValue(DEFAULT_DEPT_RULE)
  vi.mocked(queryLocation).mockReset()
  answerLicense({ [`open ${FIRST.from} ${FIRST.to}`]: ok(OPEN_ROWS), [`close ${FIRST.from} ${FIRST.to}`]: ok(CLOSE_ROWS) })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useLocationWatch: 관리자 아님 (AC-7915.3)', () => {
  // 약속은 시험 안에서 만든다(표를 읽을 때 만든 거절 약속은 처리 전 거절로 잡힌다)
  it.each([
    ['거짓', () => false],
    ['거짓으로 끝나는 약속', () => Promise.resolve(false)],
    ['못 읽은 약속', () => Promise.reject(new Error('문지기 읽기 실패'))],
  ])('AC-7915.3: 관리자가 아니면(%s) 아무것도 부르지 않고 빈 목록이다', async (_name, admin) => {
    const spies = consoleSpies()
    const { result } = draw(admin() as boolean | Promise<boolean>)
    await flush()
    await wait(LOCATION_WATCH_TIMEOUT_MS)
    expect(supabaseBrowser).not.toHaveBeenCalled()
    for (const fn of [readDeptRule, listWatchCandidates, queryLocation, addEvents, setWatchChecked, listUnseenEvents, markEventsSeen]) expect(fn).not.toHaveBeenCalled()
    expect(result.current.events).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7915.3: 참으로 끝나는 약속(페이지가 넘긴 문지기 값)이면 읽는다', async () => {
    const { result } = draw(Promise.resolve(true))
    await flush()
    expect(listWatchCandidates).toHaveBeenCalledTimes(1)
    expect(result.current.events).toEqual(LINES)
  })
})

describe('useLocationWatch: 확인하고 줄을 넣는다 (AC-7915.1)', () => {
  it('AC-7915.1: 확인할 후보(내려놓지 않음·확인 없음 또는 30일 넘음)만 같은 기간에 clinic-license open·close를 한 번씩 받는다', async () => {
    draw()
    await flush()
    expect(vi.mocked(listWatchCandidates).mock.calls).toEqual([[CLIENT]])
    // A·B는 확인한 적 없음(같은 기간 한 묶음), C는 10일 전 확인, D는 내려놓음 → 부르지 않음
    expect(queries()).toEqual([
      { kind: 'clinic-license', event: 'open', from: FIRST.from, to: FIRST.to },
      { kind: 'clinic-license', event: 'close', from: FIRST.from, to: FIRST.to },
    ])
  })

  it('AC-7915.1: 범위 안 정형외과·마취통증의학과·재활의학과 의원의 개업·폐업만 후보마다 줄로 넣고(같은 줄은 한 번), 그 뒤 그 후보들의 확인 날을 오늘로 고친다', async () => {
    draw()
    await flush()
    expect(addEvents).toHaveBeenCalledTimes(1)
    const [client, events] = vi.mocked(addEvents).mock.calls[0]!
    expect(client).toBe(CLIENT)
    expect(events.map((e) => [e.candidateId, e.kind, e.clinicName, e.dept, e.eventOn])).toEqual([
      [A.id, 'open', '예시★★정형외과의원', '정형외과', '2026-11-10'],
      [A.id, 'open', '예시◆◆통증의원', '마취통증의학과', '2026-11-03'],
      [A.id, 'close', '예시▼▼재활의학과의원', '재활의학과', '2026-11-05'],
      [B.id, 'open', '예시★★정형외과의원', '정형외과', '2026-11-10'],
      [B.id, 'close', '예시▼▼재활의학과의원', '재활의학과', '2026-11-05'],
    ])
    for (const e of events) expect(e.distM).toBeLessThanOrEqual(e.candidateId === A.id ? A.radiusM : B.radiusM)
    expect(vi.mocked(setWatchChecked).mock.calls.sort()).toEqual([
      [CLIENT, A.id, TODAY],
      [CLIENT, B.id, TODAY],
    ])
    // 확인 날 고치기는 줄을 넣은 뒤다
    expect(vi.mocked(addEvents).mock.invocationCallOrder[0]!).toBeLessThan(Math.min(...vi.mocked(setWatchChecked).mock.invocationCallOrder))
  })

  it('AC-7915.1: 과목 고르기 설정을 readDeptRule(client)로 한 번 읽어 그 경쟁 과목(대표 과목)만 넣는다 — 치과만 경쟁이면 치과 줄만', async () => {
    vi.mocked(readDeptRule).mockResolvedValue(rule(['dental']))
    const { result } = draw()
    await flush()
    expect(vi.mocked(readDeptRule).mock.calls).toEqual([[CLIENT]])
    expect(vi.mocked(addEvents).mock.calls[0]![1].map((e) => [e.candidateId, e.kind, e.clinicName])).toEqual([
      [A.id, 'open', '예시치과의원'],
      [B.id, 'open', '예시치과의원'],
    ])
    expect(setWatchChecked).toHaveBeenCalledTimes(2)
    // 안 본 줄(정형외과·재활)도 지금 설정의 경쟁 과목이 아니라 보이지 않는다
    expect(result.current.events).toEqual([])
  })

  it('AC-7915.1: 경쟁 과목이 0개면 clinic-license를 부르지 않고, 넣기·확인 날 고치기도 없으며 알림 줄도 없다', async () => {
    const spies = consoleSpies()
    vi.mocked(readDeptRule).mockResolvedValue(rule([]))
    const { result } = draw()
    await flush()
    await wait(LOCATION_WATCH_TIMEOUT_MS)
    expect(queryLocation).not.toHaveBeenCalled()
    expect(addEvents).not.toHaveBeenCalled()
    expect(setWatchChecked).not.toHaveBeenCalled()
    expect(result.current.events).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7915.1: 설정 읽기가 던져도 처음 값(정형외과·신경외과·마취통증·재활)으로 확인하고 그린다', async () => {
    vi.mocked(readDeptRule).mockRejectedValue(new Error('설정 읽기 실패'))
    const { result } = draw()
    await flush()
    expect(vi.mocked(addEvents).mock.calls[0]![1].map((e) => e.clinicName)).toEqual([
      '예시★★정형외과의원',
      '예시◆◆통증의원',
      '예시▼▼재활의학과의원',
      '예시★★정형외과의원',
      '예시▼▼재활의학과의원',
    ])
    expect(result.current.events).toEqual(LINES)
  })

  it('AC-7915.1: 새 줄이 없으면 넣지 않고 확인 날만 고친다', async () => {
    answerLicense({ [`open ${FIRST.from} ${FIRST.to}`]: ok([]), [`close ${FIRST.from} ${FIRST.to}`]: ok([]) })
    draw()
    await flush()
    expect(addEvents).not.toHaveBeenCalled()
    expect(setWatchChecked).toHaveBeenCalledTimes(2)
  })

  it('AC-7915.1: 다음에 열 때 확인한 후보(확인 날 = 오늘)는 다시 부르지 않는다', async () => {
    vi.mocked(listWatchCandidates).mockResolvedValue([
      { ...A, watchCheckedOn: TODAY },
      { ...B, watchCheckedOn: TODAY },
    ])
    draw()
    await flush()
    expect(queryLocation).not.toHaveBeenCalled()
    expect(addEvents).not.toHaveBeenCalled()
    expect(setWatchChecked).not.toHaveBeenCalled()
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
  })

  it('AC-7915.1: 한 번에 5곳까지(만든 차례)이고, 기간이 다른 후보는 그 기간으로 따로 받는다(확인 날 다음 기간 = 확인 날 − 1일부터)', async () => {
    const many = [
      cand('00000000-0000-4000-8000-000000000001', { createdAt: '2026-10-01T00:00:00.000Z', watchCheckedOn: '2026-10-01' }),
      ...['2', '3', '4', '5', '6'].map((n, i) => cand(`00000000-0000-4000-8000-00000000000${n}`, { createdAt: `2026-10-0${i + 2}T00:00:00.000Z` })),
    ]
    vi.mocked(listWatchCandidates).mockResolvedValue(many)
    vi.mocked(queryLocation).mockResolvedValue(ok([]))
    draw()
    await flush()
    expect(queries()).toEqual([
      { kind: 'clinic-license', event: 'open', from: '2026-09-30', to: FIRST.to },
      { kind: 'clinic-license', event: 'close', from: '2026-09-30', to: FIRST.to },
      { kind: 'clinic-license', event: 'open', from: FIRST.from, to: FIRST.to },
      { kind: 'clinic-license', event: 'close', from: FIRST.from, to: FIRST.to },
    ])
    // 여섯째(만든 차례 맨 뒤)는 다음 번에 본다
    expect(vi.mocked(setWatchChecked).mock.calls.map(([, id]) => id).sort()).toEqual(many.slice(0, 5).map((c) => c.id).sort())
  })

  it('AC-7915.1: 오래 내려놓았다 되살린 후보처럼 기간이 3년을 넘으면 받을 수 있는 가장 긴 기간(끝에서 36달)으로 당겨 받는다', async () => {
    vi.mocked(listWatchCandidates).mockResolvedValue([cand(A.id, { watchCheckedOn: '2022-05-01' })])
    vi.mocked(queryLocation).mockResolvedValue(ok([]))
    draw()
    await flush()
    expect(queries()).toEqual([
      { kind: 'clinic-license', event: 'open', from: '2023-11-21', to: FIRST.to },
      { kind: 'clinic-license', event: 'close', from: '2023-11-21', to: FIRST.to },
    ])
    expect(setWatchChecked).toHaveBeenCalledTimes(1)
  })

  it('AC-7915.1: 답 값에서 모양이 틀린 줄은 빼고 쓴다(점 없음·날짜 아님은 pickEvents가 뺀다)', async () => {
    answerLicense({
      [`open ${FIRST.from} ${FIRST.to}`]: ok([
        { name: 3, dept: '정형외과', openedOn: '2026-11-10', closedOn: null, point: NEAR },
        { name: '예시틀린점정형외과', dept: '정형외과', openedOn: '2026-11-10', closedOn: null, point: { lat: '37.5' } },
        row('예시점없음정형외과', '정형외과', { openedOn: '2026-11-10' }, null),
        row('예시날짜틀림정형외과', '정형외과', { openedOn: '2026-13-40' }, NEAR),
        row('예시맞는정형외과', '정형외과', { openedOn: '2026-11-11' }, NEAR),
      ]),
      [`close ${FIRST.from} ${FIRST.to}`]: ok([]),
    })
    vi.mocked(listWatchCandidates).mockResolvedValue([A])
    draw()
    await flush()
    expect(vi.mocked(addEvents).mock.calls[0]![1].map((e) => e.clinicName)).toEqual(['예시맞는정형외과'])
  })
})

describe('useLocationWatch: 확인 실패는 조용히 (AC-7915.3)', () => {
  it.each([
    ['열쇠 없음', { ok: false, code: 'no-key', key: 'data' } as QueryReply],
    ['활용 신청 안 됨', { ok: false, code: 'not-applied' } as QueryReply],
    ['실패', { ok: false, code: 'failed' } as QueryReply],
    ['틀린 값 모양', { ok: true, value: { capped: false }, src: 'clinic-license', asOf: TODAY } as QueryReply],
  ])('AC-7915.3: 기간 답 하나라도 못 받으면(%s) 그 묶음은 넣지도 확인 날을 고치지도 않고(다음에 같은 기간을 다시 본다), 안 본 줄은 그대로 읽는다', async (_name, bad) => {
    const spies = consoleSpies()
    answerLicense({ [`open ${FIRST.from} ${FIRST.to}`]: ok(OPEN_ROWS), [`close ${FIRST.from} ${FIRST.to}`]: bad })
    const { result } = draw()
    await flush()
    expect(addEvents).not.toHaveBeenCalled()
    expect(setWatchChecked).not.toHaveBeenCalled()
    expect(result.current.events).toEqual(LINES)
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7915.3: 한 묶음이 실패해도 다른 기간 묶음은 그대로 확인한다', async () => {
    vi.mocked(listWatchCandidates).mockResolvedValue([A, cand(C.id, { watchCheckedOn: '2026-10-01' })])
    answerLicense({ [`open 2026-09-30 ${FIRST.to}`]: ok([]), [`close 2026-09-30 ${FIRST.to}`]: ok([]) }) // A의 기간은 실패
    draw()
    await flush()
    expect(vi.mocked(setWatchChecked).mock.calls).toEqual([[CLIENT, C.id, TODAY]])
  })

  it('AC-7915.3: 줄 넣기가 실패하면 확인 날을 고치지 않는다(다음에 다시 넣는다)', async () => {
    vi.mocked(addEvents).mockRejectedValue(new LocationStorageError('E-LOC-SAVE-FAILED'))
    const { result } = draw()
    await flush()
    expect(addEvents).toHaveBeenCalledTimes(1)
    expect(setWatchChecked).not.toHaveBeenCalled()
    expect(result.current.events).toEqual(LINES)
  })

  it('AC-7915.3: 확인 날 고치기가 실패해도 조용히 넘어가고 안 본 줄을 읽는다', async () => {
    vi.mocked(setWatchChecked).mockRejectedValue(new LocationStorageError('E-LOC-SAVE-FAILED'))
    const { result } = draw()
    await flush()
    expect(result.current.events).toEqual(LINES)
  })

  it('AC-7915.3: 후보 읽기가 실패하면 부르지 않고, 안 본 줄은 그대로 읽는다(후보 이름만 null)', async () => {
    vi.mocked(listWatchCandidates).mockRejectedValue(new LocationStorageError('E-LOC-READ-FAILED'))
    const { result } = draw()
    await flush()
    expect(queryLocation).not.toHaveBeenCalled()
    expect(result.current.events).toEqual(LINES.map((l) => ({ ...l, candidateName: null })))
  })

  it('AC-7915.3: 안 본 줄 읽기가 실패하면 빈 목록이고 오류를 밖으로 던지지 않으며 console을 쓰지 않는다', async () => {
    const spies = consoleSpies()
    vi.mocked(listUnseenEvents).mockRejectedValue(new LocationStorageError('E-LOC-READ-FAILED'))
    const { result } = draw()
    await flush()
    await wait(LOCATION_WATCH_TIMEOUT_MS)
    expect(result.current.events).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('AC-7915.3: supabaseBrowser가 던지거나(설정 없음) from 없는 클라이언트면 읽지 않고 빈 목록이다', async () => {
    vi.mocked(supabaseBrowser).mockImplementation(() => {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL이 비었어요')
    })
    let view = draw()
    await flush()
    expect(listWatchCandidates).not.toHaveBeenCalled()
    expect(view.result.current.events).toEqual([])
    cleanup()
    vi.mocked(supabaseBrowser).mockReturnValue({ auth: { signOut: vi.fn() } } as unknown as SupabaseClient)
    view = draw()
    await flush()
    expect(listWatchCandidates).not.toHaveBeenCalled()
    expect(queryLocation).not.toHaveBeenCalled()
    expect(view.result.current.events).toEqual([])
  })

  it('AC-7915.3: 20초 한도 안에 온 답은 쓴다', async () => {
    expect(LOCATION_WATCH_TIMEOUT_MS).toBe(20_000)
    let release!: (events: LocationEvent[]) => void
    vi.mocked(listUnseenEvents).mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const { result } = draw()
    await flush()
    await wait(LOCATION_WATCH_TIMEOUT_MS - 1)
    await act(async () => release(UNSEEN))
    expect(result.current.events).toEqual(LINES)
  })

  it('AC-7915.3: 20초 한도를 넘기면 빈 목록이고, 한도 뒤 늦게 온 답은 버린다(확인이 오래 걸려도 같다)', async () => {
    let release!: (reply: QueryReply) => void
    vi.mocked(queryLocation).mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const { result } = draw()
    await flush()
    await wait(LOCATION_WATCH_TIMEOUT_MS)
    expect(result.current.events).toEqual([])
    await act(async () => release(ok([])))
    await flush()
    expect(result.current.events).toEqual([])
  })

  it('AC-7915.3: 떠난 뒤 온 답은 쓰지 않는다(오류·console 없음)', async () => {
    const spies = consoleSpies()
    let release!: (events: LocationEvent[]) => void
    vi.mocked(listUnseenEvents).mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const { result, unmount } = draw()
    await flush()
    unmount()
    await act(async () => release(UNSEEN))
    expect(result.current.events).toEqual([])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('useLocationWatch: 한 번만 · [닫기] (AC-7915.2)', () => {
  it('AC-7915.2: 처음 한 번 읽고, 다시 그려도·오늘이 바뀌어도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음)', async () => {
    const { result, rerender, unmount } = draw()
    await flush()
    expect(result.current.events).toEqual(LINES)
    rerender({ admin: true, day: TODAY })
    rerender({ admin: true, day: '2026-11-23' })
    await flush()
    expect(listWatchCandidates).toHaveBeenCalledTimes(1)
    expect(listUnseenEvents).toHaveBeenCalledTimes(1)
    unmount()
    draw(true, '2026-11-23')
    await flush()
    expect(listUnseenEvents).toHaveBeenCalledTimes(2)
  })

  it('AC-7915.2: close(id)는 그 줄을 바로 감추고 그 줄만 본 것으로 적는다(markEventsSeen) — 다른 줄은 그대로다', async () => {
    const { result } = draw()
    await flush()
    act(() => result.current.close(UNSEEN[0]!.id))
    expect(result.current.events).toEqual([LINES[1]])
    await flush()
    expect(vi.mocked(markEventsSeen).mock.calls).toEqual([[CLIENT, [UNSEEN[0]!.id]]])
    expect(listUnseenEvents).toHaveBeenCalledTimes(1) // 다시 읽지 않는다
  })

  it('AC-7915.2: [닫기]는 줄마다 따로다 — 같은 후보의 두 줄 가운데 하나를 닫으면 그 줄 id 하나만 본 것으로 적고 그 후보의 다른 줄은 남는다(후보 줄 모두 적기는 부르지 않음)', async () => {
    const PAIN_A: LocationEvent = { ...UNSEEN[0]!, id: 'e0000000-0000-4000-8000-000000000003', clinicName: '예시◆◆통증의원', dept: '마취통증의학과', eventOn: '2026-11-03' }
    vi.mocked(listUnseenEvents).mockResolvedValue([...UNSEEN, PAIN_A])
    const { result } = draw()
    await flush()
    expect(result.current.events.map((l) => [l.id, l.candidateName])).toEqual([
      [UNSEEN[0]!.id, '예시빌딩 3층'],
      [UNSEEN[1]!.id, '예시타워 1층'],
      [PAIN_A.id, '예시빌딩 3층'],
    ])
    act(() => result.current.close(PAIN_A.id))
    expect(result.current.events).toEqual(LINES)
    await flush()
    expect(vi.mocked(markEventsSeen).mock.calls).toEqual([[CLIENT, [PAIN_A.id]]])
    expect(markCandidateEventsSeen).not.toHaveBeenCalled()
    act(() => result.current.close(UNSEEN[0]!.id))
    await flush()
    expect(result.current.events).toEqual([LINES[1]])
    expect(vi.mocked(markEventsSeen).mock.calls).toEqual([
      [CLIENT, [PAIN_A.id]],
      [CLIENT, [UNSEEN[0]!.id]],
    ])
  })

  it('AC-7915.2: 보이는 줄은 지금 설정의 경쟁 과목만이다 — 재활을 둘레로 보기로 바꾸면 재활 줄은 빠지고 나머지는 후보 이름·짧은 이름이 붙는다', async () => {
    vi.mocked(readDeptRule).mockResolvedValue(rule(['ortho', 'ns', 'pain']))
    const { result } = draw()
    await flush()
    expect(result.current.events).toEqual([LINES[0]])
    // 새로 넣는 줄도 같은 설정이다(재활 폐업 줄 없음)
    expect(vi.mocked(addEvents).mock.calls[0]![1].map((e) => e.dept)).toEqual(['정형외과', '마취통증의학과', '정형외과'])
  })

  it('AC-7915.2: 본 것으로 적기가 실패해도 줄은 감춘 채이고 조용하다(다음에 열면 다시 뜬다)', async () => {
    const spies = consoleSpies()
    vi.mocked(markEventsSeen).mockRejectedValue(new LocationStorageError('E-LOC-SAVE-FAILED'))
    const { result } = draw()
    await flush()
    act(() => result.current.close(UNSEEN[1]!.id))
    await flush()
    expect(result.current.events).toEqual([LINES[0]])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('useLocationWatch: 소스 (AC-7915.1·AC-7915.3)', () => {
  const text = () => readFileSync(join(process.cwd(), 'src/components/dashboard/location/useLocationWatch.ts'), 'utf8')

  it("AC-7915.1: 'use client' 훅이고, 저장은 lib/storage 함수·부르기는 queryLocation·판정은 lib/location/watch만 쓴다 — Supabase 표·fetch·console·브라우저 저장소를 직접 쓰지 않는다", () => {
    const source = text()
    expect(source).toMatch(/^'use client'/)
    expect(source).toMatch(/import \{[^}]*\bqueryLocation\b[^}]*\} from '@\/components\/location\/clients'/)
    expect(source).toMatch(/import \{[^}]*\bdueCandidates\b[^}]*\bpickEvents\b[^}]*\} from '@\/lib\/location\/watch'/)
    expect(source).toMatch(/import \{[^}]*\blistWatchCandidates\b[^}]*\} from '@\/lib\/storage\/location'/)
    expect(source).toMatch(/import \{[^}]*\breadDeptRule\b[^}]*\} from '@\/lib\/storage\/location'/)
    expect(source).toMatch(/import \{[^}]*\balertLines\b[^}]*\} from '\.\/alertLines'/)
    expect(source).not.toMatch(/WATCH_DEPTS/)
    expect(source).not.toMatch(/console\.|\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|\.from\(/)
  })
})
