// 입지 분석 저장 (specs/location TASK-24·TASK-62, REQ-7908·REQ-7913·REQ-7915·REQ-7919·REQ-7921 · AC-7908.2·AC-7913.4·AC-7915.2·AC-7919.4·AC-7921.2,
// design.md 6·7·12·18절). 실제 Supabase에 붙지 않는다.
// 가짜 클라이언트가 표·DB 함수(rpc)·사진 저장소(location-photos)에 무엇이 어떤 차례로 나갔는지 적어 둔다.
// 표 권한·RLS·검사 함수·사진 30장 트리거·Storage 정책은 supabase/location.rls.test.ts(TASK-1)가 진짜 Postgres로 본다.
// id·이름·주소·숫자·그림 바이트는 모두 지어낸 값이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import { DEFAULT_SCORE_RULE, type ScoreRule } from '@/lib/location/score'
import type { DeptRule, Snapshot, WatchEvent } from '@/types/location'
import {
  addCandidate,
  addEvents,
  addListing,
  addNote,
  addPhoto,
  deleteCandidate,
  deleteListing,
  deleteNote,
  deletePhoto,
  listUnseenEvents,
  listWatchCandidates,
  loadLocation,
  LocationStorageError,
  markCandidateEventsSeen,
  markEventsSeen,
  readDeptRule,
  readFlowCache,
  readPhoto,
  removePhotos,
  resetDeptRule,
  resetScoreRule,
  saveDeptRule,
  saveFlowCache,
  saveHomeEswt,
  saveScoreRule,
  setWatchChecked,
  updateCandidate,
  updateListing,
  type LocationClient,
} from './location'

const SECRET = 'secret detail' // 서버 답에 섞여 온 글자. 밖으로 나가면 안 된다
const RAW_ERROR = { code: '42501', message: `boom (${SECRET})`, details: SECRET, hint: SECRET }
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

const HOSPITAL = '11111111-2222-4333-8444-555555555555'
const CAND = 'aaaaaaaa-0000-4000-8000-00000000000a'
const CAND2 = 'aaaaaaaa-0000-4000-8000-00000000000b'
const LISTING = 'bbbbbbbb-0000-4000-8000-00000000000b'
const BROKER = 'cccccccc-0000-4000-8000-00000000000c'
const NOTE = 'dddddddd-0000-4000-8000-00000000000d'
const PHOTO_ID = 'eeeeeeee-0000-4000-8000-00000000000e'
const PHOTO_UUID = 'ffffffff-0000-4000-8000-00000000000f'
const PHOTO_PATH = `${HOSPITAL}/${CAND}/${PHOTO_UUID}.jpg`
const EVENT = '12121212-0000-4000-8000-000000000012'
const EVENT2 = '12121212-0000-4000-8000-000000000013'
const BUCKET = 'location-photos'
const T1 = '2026-11-22T01:02:03.456789+00:00'
const T2 = '2026-11-22T05:06:07.000000+00:00'
const NOW = new Date('2026-11-22T03:00:00.000Z')

const SETTINGS_COLUMNS = 'score_rule, dept_rule, home_eswt, updated_at'
const CANDIDATE_COLUMNS =
  'id, name, address_note, lat, lng, radius_m, status, floor_label, area_m2, sign_visible, violation, costs, terms, checks, open_on, tasks_done, snapshot, snapshot_at, watch_checked_on, created_at, updated_at'
const LISTING_COLUMNS =
  'id, candidate_id, title, url, area_m2, floor_label, deposit, rent, premium, mgmt, broker_id, broker_note, memo, lat, lng, created_at, updated_at'
const NOTE_COLUMNS = 'id, candidate_id, day, body, created_at'
const PHOTO_COLUMNS = 'id, candidate_id, path, label, taken_on, created_at'
const EVENT_COLUMNS = 'id, candidate_id, kind, clinic_name, dept, event_on, dist_m, seen_at, created_at'
const WATCH_COLUMNS = 'id, name, status, lat, lng, radius_m, watch_checked_on, created_at, place:snapshot->place'

// 칸 권한(migration grant)에 있는 칸
const CANDIDATE_WRITABLE = [
  'name', 'address_note', 'lat', 'lng', 'radius_m', 'status', 'floor_label', 'area_m2', 'sign_visible', 'violation', 'costs', 'terms',
  'checks', 'open_on', 'tasks_done', 'snapshot', 'snapshot_at', 'watch_checked_on',
]
const LISTING_KEYS = [
  'area_m2', 'broker_id', 'broker_note', 'candidate_id', 'deposit', 'floor_label', 'lat', 'lng', 'memo', 'mgmt', 'premium', 'rent', 'title', 'url',
]

// 그날 값 칸 스물넷(design.md 6절 — 행정동 place·견줄 값 sggAvg 포함)
const SNAPSHOT_KEYS = [
  'people', 'trend', 'flow', 'income', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools', 'accidents', 'industry',
  'pharmacies', 'rivals', 'place', 'sggAvg', 'history', 'station', 'bus', 'market', 'building', 'stores', 'welfare',
]

// JPEG 머리(FF D8 FF)로 시작하는 가짜 그림 바이트
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpegBlob = (bytes: Uint8Array = JPEG) => new Blob([bytes.slice()], { type: 'image/jpeg' })

// jsonb 글자(::text)의 바이트 — 열쇠 뒤 ': '·항목 사이 ', '(migration 머리 주석)
const jsonbText = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(jsonbText).join(', ')}]`
    : v !== null && typeof v === 'object'
      ? `{${Object.entries(v)
          .map(([k, x]) => `${JSON.stringify(k)}: ${jsonbText(x)}`)
          .join(', ')}}`
      : JSON.stringify(v)
const jsonbBytes = (v: unknown) => new TextEncoder().encode(jsonbText(v)).length
/** 그 바이트 수가 되도록 채운 글(한글 3바이트 + 영문 1바이트) */
const padTo = (bytes: number) => '가'.repeat(Math.floor(bytes / 3)) + 'a'.repeat(bytes % 3)

// ── 가짜 클라이언트 ─────────────────────────────────────────

type Filter = [op: string, column: string, value: unknown]
type TableCall = {
  kind: 'table'
  table: string
  op?: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  body?: unknown
  columns?: string
  options?: unknown
  filters: Filter[]
  orders: [string, { ascending?: boolean } | undefined][]
  range?: [number, number]
  single: boolean
}
type RpcCall = { kind: 'rpc'; fn: string; args?: unknown }
type StorageCall = { kind: 'storage'; bucket: string; op: 'upload' | 'download' | 'remove'; path?: string; paths?: unknown; body?: unknown; options?: unknown }
type Call = TableCall | RpcCall | StorageCall
type Reply = { data?: unknown; error?: unknown }

// ── 읽은 줄(DB 칸 이름) ──────────────────────────────────────

const candidateRow = (over: Record<string, unknown> = {}) => ({
  id: CAND,
  name: '역앞 자리',
  address_note: '2번 출구 앞',
  lat: 37.512345,
  lng: 127.012345,
  radius_m: 1000,
  status: 'watching',
  floor_label: '2층',
  area_m2: 99.17,
  sign_visible: 'yes',
  violation: null,
  costs: { interior: 1000 },
  terms: { memo: '관리비 따로' },
  checks: { 'b-ramp': 'yes' },
  open_on: '2027-03-02',
  tasks_done: ['t-lease'],
  snapshot: null,
  snapshot_at: null,
  watch_checked_on: null,
  created_at: T1,
  updated_at: T1,
  ...over,
})
const listingRow = (over: Record<string, unknown> = {}) => ({
  id: LISTING,
  candidate_id: CAND,
  title: '역앞 2층 30평',
  url: 'https://example.com/listing/1',
  area_m2: 99.17,
  floor_label: '2층',
  deposit: 30000000,
  rent: 2500000,
  premium: 0,
  mgmt: 300000,
  broker_id: BROKER,
  broker_note: '가나부동산',
  memo: '주차 2대',
  lat: 37.5123,
  lng: 127.0123,
  created_at: T1,
  updated_at: T1,
  ...over,
})
const noteRow = (over: Record<string, unknown> = {}) => ({ id: NOTE, candidate_id: CAND, day: '2026-11-22', body: '중개사와 통화', created_at: T1, ...over })
const photoRow = (over: Record<string, unknown> = {}) => ({
  id: PHOTO_ID,
  candidate_id: CAND,
  path: PHOTO_PATH,
  label: '건물 앞',
  taken_on: '2026-11-22',
  created_at: T1,
  ...over,
})
const eventRow = (over: Record<string, unknown> = {}) => ({
  id: EVENT,
  candidate_id: CAND,
  kind: 'open',
  clinic_name: '가나정형외과의원',
  dept: '정형외과',
  event_on: '2026-11-01',
  dist_m: 420,
  seen_at: null,
  created_at: T1,
  ...over,
})
const settingsRow = (over: Record<string, unknown> = {}) => ({
  score_rule: DEFAULT_SCORE_RULE,
  dept_rule: DEFAULT_DEPT_RULE,
  home_eswt: null,
  updated_at: T1,
  ...over,
})

const BASE_ROW: Record<string, () => Record<string, unknown>> = {
  location_settings: settingsRow,
  location_candidates: candidateRow,
  location_listings: listingRow,
  location_notes: noteRow,
  location_photos: photoRow,
  location_events: eventRow,
}

// 후보 점의 행정동(동 경계 파일)과 시군구 견줄 값(공공 자료만) — 지어낸 코드·이름·숫자
const PLACE = {
  ok: true,
  v: { sido: '99', sidoName: '가나도', sgg: '99910', sggName: '가나시', dong: '9991051000', dongName: '가동' },
  src: 'dongs',
  asOf: '2025-06-30',
}
const SGG_AVG = {
  ok: true,
  v: {
    sggName: '가나시',
    areaM2: 24000000,
    total: 300000,
    bands: [20000, 24000, 28000, 34000, 40000, 46000, 42000, 34000, 20000, 10000, 2000],
    trendPct: -1.2,
    accidents: 12,
    schools: 40,
    seniors: 120,
    gyms: 60,
    stationM: 640,
    stops: 5,
  },
  src: 'pop-age',
  asOf: '2026-10-31',
}

/** 맞는 그날 값(지어낸 숫자). 못 받은 칸은 failed, 하나는 지난 값(prev)이 있다 */
function makeSnapshot(over: Record<string, unknown> = {}): Snapshot {
  const failed = Object.fromEntries(SNAPSHOT_KEYS.map((key) => [key, { ok: false, why: 'failed', src: 'pop-age' }]))
  return {
    v: 1,
    at: '2026-11-22T03:00:00.000Z',
    radiusM: 1000,
    ...failed,
    people: {
      ok: true,
      v: { total: 12000, bands: [900, 1000, 1100, 1300, 1500, 1700, 1600, 1400, 900, 500, 100], households: 5200, unmatched: 0 },
      src: 'pop-age',
      asOf: '2026-10-31',
    },
    seniors: { ok: false, why: 'failed', src: 'senior', prev: { v: 3, asOf: '2026-10-01' } },
    place: PLACE,
    sggAvg: SGG_AVG,
    building: {
      ok: true,
      v: { usage: '근린생활시설', structure: '철근콘크리트', above: 5, below: 1, totalM2: 1200.5, approvedOn: '2005-04-01', elevators: 1, parking: 8, floors: [] },
      src: 'building',
      asOf: '2026-11-22',
    },
    ...over,
  } as unknown as Snapshot
}

/** 별일 없을 때의 답: 읽기는 빈 목록, 넣고·고치고 돌려받기는 그 표의 맞는 줄에 보낸 몸통을 얹어, 저장소는 오류 없음 */
function okReply(call: Call): Reply {
  if (call.kind === 'rpc') return { data: call.fn === 'my_hospital_id' ? HOSPITAL : null }
  if (call.kind === 'storage') {
    if (call.op === 'upload') return { data: { path: call.path } }
    if (call.op === 'download') return { data: jpegBlob() }
    return { data: [] }
  }
  if (call.op === 'select') return { data: call.single ? null : [] }
  if (call.columns === undefined) return { data: null }
  if (call.op === 'delete') return { data: [] }
  const base = BASE_ROW[call.table]?.() ?? {}
  if (call.single) return { data: { ...base, ...(call.body as object) } }
  return { data: (call.body as object[]).map((row) => ({ ...base, ...row })) }
}

/** 표·함수·저장소 부름을 한 줄씩 적는 가짜 클라이언트. reply가 던지면 네트워크 예외와 같다 */
function fakeClient(reply: (call: Call) => Reply = okReply): { client: LocationClient; calls: Call[] } {
  const calls: Call[] = []
  const answer = (call: Call) =>
    Promise.resolve()
      .then(() => reply(call))
      .then((r) => ({ data: r.data === undefined ? null : r.data, error: r.error ?? null }))
  const client = {
    from(table: string) {
      const call: TableCall = { kind: 'table', table, filters: [], orders: [], single: false }
      calls.push(call)
      const filter = (op: string, column: string, value: unknown) => {
        call.filters.push([op, column, value])
        return builder
      }
      const builder = {
        select(columns: string) {
          call.op ??= 'select'
          call.columns = columns.replace(/\s+/g, ' ').trim()
          return builder
        },
        insert(body: unknown) {
          call.op = 'insert'
          call.body = body
          return builder
        },
        update(body: unknown) {
          call.op = 'update'
          call.body = body
          return builder
        },
        upsert(body: unknown, options?: unknown) {
          call.op = 'upsert'
          call.body = body
          call.options = options
          return builder
        },
        delete() {
          call.op = 'delete'
          return builder
        },
        eq: (column: string, value: unknown) => filter('eq', column, value),
        in: (column: string, value: unknown) => filter('in', column, value),
        is: (column: string, value: unknown) => filter('is', column, value),
        order(column: string, options?: { ascending?: boolean }) {
          call.orders.push([column, options])
          return builder
        },
        range(first: number, last: number) {
          call.range = [first, last]
          return builder
        },
        single() {
          call.single = true
          return builder
        },
        maybeSingle() {
          call.single = true
          return builder
        },
        then(ok: (value: unknown) => unknown, bad: (reason: unknown) => unknown) {
          return answer(call).then(ok, bad)
        },
      }
      return builder
    },
    rpc(fn: string, args?: unknown) {
      const call: RpcCall = { kind: 'rpc', fn, args }
      calls.push(call)
      return answer(call)
    },
    storage: {
      from(bucket: string) {
        const send = (call: StorageCall) => {
          calls.push(call)
          return answer(call)
        }
        return {
          upload: (path: string, body: unknown, options?: unknown) => send({ kind: 'storage', bucket, op: 'upload', path, body, options }),
          download: (path: string) => send({ kind: 'storage', bucket, op: 'download', path }),
          remove: (paths: unknown) => send({ kind: 'storage', bucket, op: 'remove', paths }),
        }
      },
    },
  }
  return { client: client as unknown as LocationClient, calls }
}

const stepOf = (call: Call) => (call.kind === 'table' ? `${call.table}:${call.op}` : call.kind === 'rpc' ? `rpc:${call.fn}` : `storage:${call.op}`)
const steps = (calls: Call[]) => calls.map(stepOf)
const tableCalls = (calls: Call[]) => calls.filter((call): call is TableCall => call.kind === 'table')
const storageCalls = (calls: Call[]) => calls.filter((call): call is StorageCall => call.kind === 'storage')
const onlyTable = (calls: Call[]) => {
  const tables = tableCalls(calls)
  expect(tables).toHaveLength(1)
  return tables[0]
}
const bodyOf = (calls: Call[]) => onlyTable(calls).body as Record<string, unknown>

/** 한 단계('표:op'·'rpc:함수'·'storage:op')만 다르게 답한다 */
const by =
  (routes: Record<string, (call: Call) => Reply>) =>
  (call: Call): Reply =>
    routes[stepOf(call)]?.(call) ?? okReply(call)

/** 그 오류(번호)로 실패하는지, Supabase 글이 새지 않는지 */
async function expectFail(work: Promise<unknown>, code: string) {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LocationStorageError)
  expect((error as LocationStorageError).code).toBe(code)
  expect(`${String(error)} ${JSON.stringify(error)} ${(error as Error).message}`).not.toContain(SECRET)
}

beforeEach(() => {
  for (const method of CONSOLE_METHODS) vi.spyOn(console, method)
})
afterEach(() => {
  for (const method of CONSOLE_METHODS) expect(console[method]).not.toHaveBeenCalled()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ── 읽기 ─────────────────────────────────────────────────────

describe('loadLocation — 표 여섯 읽기', () => {
  it('AC-7908.2·AC-7913.4·AC-7919.4·AC-7921.2: 표 여섯을 정해 둔 칸으로 읽어(목록은 1,000줄씩) 앱 모양으로 바꾼다', async () => {
    const snapshot = makeSnapshot()
    const deptRule: DeptRule = { v: 1, rival: ['ortho', 'rehab', 'korean'], hide: ['dental'] }
    const { client, calls } = fakeClient(
      by({
        'location_settings:select': () => ({ data: settingsRow({ home_eswt: 50000, dept_rule: deptRule }) }),
        'location_candidates:select': () => ({ data: [candidateRow({ snapshot, snapshot_at: T2 })] }),
        'location_listings:select': () => ({ data: [listingRow()] }),
        'location_notes:select': () => ({ data: [noteRow()] }),
        'location_photos:select': () => ({ data: [photoRow()] }),
        'location_events:select': () => ({ data: [eventRow()] }),
      }),
    )
    const data = await loadLocation(client)

    const byTable = Object.fromEntries(tableCalls(calls).map((call) => [call.table, call]))
    expect(Object.keys(byTable).sort()).toEqual([
      'location_candidates', 'location_events', 'location_listings', 'location_notes', 'location_photos', 'location_settings',
    ])
    expect(tableCalls(calls).every((call) => call.op === 'select')).toBe(true)
    expect(byTable.location_settings).toMatchObject({ columns: SETTINGS_COLUMNS, single: true })
    expect(byTable.location_candidates).toMatchObject({ columns: CANDIDATE_COLUMNS, range: [0, 999] })
    expect(byTable.location_candidates.orders).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(byTable.location_listings).toMatchObject({ columns: LISTING_COLUMNS, range: [0, 999] })
    expect(byTable.location_notes).toMatchObject({ columns: NOTE_COLUMNS, range: [0, 999] })
    expect(byTable.location_photos).toMatchObject({ columns: PHOTO_COLUMNS, range: [0, 999] })
    expect(byTable.location_events).toMatchObject({ columns: EVENT_COLUMNS, range: [0, 999] })

    expect(data.settings).toEqual({ scoreRule: DEFAULT_SCORE_RULE, deptRule, homeEswt: 50000, updatedAt: T1 })
    expect(data.candidates).toEqual([
      {
        id: CAND,
        name: '역앞 자리',
        addressNote: '2번 출구 앞',
        lat: 37.512345,
        lng: 127.012345,
        radiusM: 1000,
        status: 'watching',
        floorLabel: '2층',
        areaM2: 99.17,
        signVisible: 'yes',
        violation: null,
        costs: { interior: 1000 },
        terms: { memo: '관리비 따로' },
        checks: { 'b-ramp': 'yes' },
        openOn: '2027-03-02',
        tasksDone: ['t-lease'],
        snapshot,
        snapshotAt: T2,
        watchCheckedOn: null,
        createdAt: T1,
        updatedAt: T1,
      },
    ])
    expect(data.listings).toEqual([
      {
        id: LISTING,
        candidateId: CAND,
        title: '역앞 2층 30평',
        url: 'https://example.com/listing/1',
        areaM2: 99.17,
        floorLabel: '2층',
        deposit: 30000000,
        rent: 2500000,
        premium: 0,
        mgmt: 300000,
        brokerId: BROKER,
        brokerNote: '가나부동산',
        memo: '주차 2대',
        lat: 37.5123,
        lng: 127.0123,
        createdAt: T1,
        updatedAt: T1,
      },
    ])
    expect(data.notes).toEqual([{ id: NOTE, candidateId: CAND, day: '2026-11-22', body: '중개사와 통화', createdAt: T1 }])
    expect(data.photos).toEqual([{ id: PHOTO_ID, candidateId: CAND, path: PHOTO_PATH, label: '건물 앞', takenOn: '2026-11-22', createdAt: T1 }])
    expect(data.events).toEqual([
      {
        id: EVENT,
        candidateId: CAND,
        kind: 'open',
        clinicName: '가나정형외과의원',
        dept: '정형외과',
        eventOn: '2026-11-01',
        distM: 420,
        seenAt: null,
        createdAt: T1,
      },
    ])
  })

  it('AC-7919.4: 설정 줄이 없으면 처음 설정이고, 예전 설정은 fillScoreRule로 채운다(빠진 p-welfare = 처음 값)', async () => {
    const empty = await loadLocation(fakeClient().client)
    expect(empty.settings).toEqual({ scoreRule: DEFAULT_SCORE_RULE, deptRule: DEFAULT_DEPT_RULE, homeEswt: null, updatedAt: null })

    const old = structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
    old.weights.people = 50
    delete (old.items as Record<string, unknown>)['p-welfare']
    const { client } = fakeClient(by({ 'location_settings:select': () => ({ data: settingsRow({ score_rule: old }) }) }))
    const { settings } = await loadLocation(client)
    expect(settings.scoreRule.weights.people).toBe(50)
    expect(settings.scoreRule.items['p-welfare']).toEqual(DEFAULT_SCORE_RULE.items['p-welfare'])
  })

  it('AC-7921.2: 과목 고르기는 fillDeptRule을 거친다 — 칸이 없거나 못 읽으면 처음 값, 모르는 id·되풀이는 빼고 목록 차례로', async () => {
    const cases: [unknown, DeptRule][] = [
      [undefined, DEFAULT_DEPT_RULE], // 칸이 없던 옛 줄
      [null, DEFAULT_DEPT_RULE],
      ['ortho', DEFAULT_DEPT_RULE],
      [{ v: 2, rival: [], hide: [] }, DEFAULT_DEPT_RULE],
      [{ v: 1 }, DEFAULT_DEPT_RULE], // 경쟁 칸이 없으면 처음 경쟁, 안 보기 칸이 없으면 없음
      [{ v: 1, rival: [], hide: [] }, { v: 1, rival: [], hide: [] }], // 경쟁 0개도 그대로
      [{ v: 1, rival: ['rehab', 'x-unknown', 'ortho', 'ortho'], hide: ['korean', 'ortho'] }, { v: 1, rival: ['ortho', 'rehab'], hide: ['korean'] }],
    ]
    for (const [raw, expected] of cases) {
      const row = settingsRow({ dept_rule: raw })
      if (raw === undefined) delete (row as Record<string, unknown>).dept_rule
      const { client } = fakeClient(by({ 'location_settings:select': () => ({ data: row }) }))
      const { settings } = await loadLocation(client)
      expect(settings.deptRule).toEqual(expected)
      expect(settings.scoreRule).toEqual(DEFAULT_SCORE_RULE) // 과목 고르기가 틀려도 줄은 그대로 읽는다
      expect(Object.isFrozen(settings.deptRule)).toBe(false) // 화면이 고쳐 쓸 새 값(얼린 처음 값이 아님)
    }
  })

  it('AC-7913.4: 1,000줄이 차면 다음 쪽까지 읽는다(사진 줄)', async () => {
    const page = Array.from({ length: 1000 }, (_, i) =>
      photoRow({ id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`, path: `${HOSPITAL}/${CAND}/${`ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`}.jpg` }),
    )
    const { client, calls } = fakeClient(
      by({ 'location_photos:select': (call) => ({ data: (call as TableCall).range?.[0] === 0 ? page : [photoRow()] }) }),
    )
    const { photos } = await loadLocation(client)
    expect(photos).toHaveLength(1001)
    expect(tableCalls(calls).filter((call) => call.table === 'location_photos').map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('AC-7908.2·AC-7913.4: 모양이 틀린 줄은 빼고, 그날 값이 틀리면(카카오 출처 칸 포함) 그 후보의 그날 값만 비운다', async () => {
    const { client } = fakeClient(
      by({
        'location_candidates:select': () => ({
          data: [
            candidateRow(),
            candidateRow({ id: CAND2, snapshot: { v: 2 }, snapshot_at: T2 }),
            candidateRow({ id: 'cand-3', snapshot: makeSnapshot({ bus: { ok: true, v: 4, src: 'kakao-local', asOf: '2026-11-22' } }) }),
            candidateRow({ id: 'x', radius_m: 800 }),
            candidateRow({ id: 'y', status: 'won' }),
            candidateRow({ id: 'z', lat: 40 }),
            candidateRow({ id: '' }),
            null,
            'row',
          ],
        }),
        'location_photos:select': () => ({
          data: [photoRow(), photoRow({ id: 'p2', path: `${HOSPITAL}/${CAND2}/${PHOTO_UUID}.jpg` }), photoRow({ id: 'p3', path: '../x.jpg' })],
        }),
        'location_events:select': () => ({ data: [eventRow(), eventRow({ id: EVENT2, kind: 'moved' }), eventRow({ id: 'e3', dist_m: 'far' })] }),
      }),
    )
    const data = await loadLocation(client)
    expect(data.candidates.map((c) => [c.id, c.snapshot])).toEqual([
      [CAND, null],
      [CAND2, null],
      ['cand-3', null],
    ])
    expect(data.photos.map((p) => p.id)).toEqual([PHOTO_ID]) // 둘째 폴더가 그 줄의 후보가 아니면 뺀다
    expect(data.events.map((e) => e.id)).toEqual([EVENT])
  })

  it('AC-7913.4: 한 표라도 못 읽거나 목록이 아니면 반쪽 대신 E-LOC-READ-FAILED(Supabase 글 없음)', async () => {
    await expectFail(loadLocation(fakeClient(() => ({ error: RAW_ERROR })).client), 'E-LOC-READ-FAILED')
    await expectFail(loadLocation(fakeClient(by({ 'location_notes:select': () => ({ error: RAW_ERROR }) })).client), 'E-LOC-READ-FAILED')
    await expectFail(loadLocation(fakeClient(by({ 'location_events:select': () => ({ data: { not: 'list' } }) })).client), 'E-LOC-READ-FAILED')
    await expectFail(
      loadLocation(
        fakeClient(() => {
          throw new Error(SECRET)
        }).client,
      ),
      'E-LOC-READ-FAILED',
    )
  })
})

// ── 후보 ─────────────────────────────────────────────────────

describe('addCandidate · updateCandidate · deleteCandidate — 후보 줄', () => {
  it('AC-7908.2: 넣는 몸통은 고른 점·적은 이름·적은 주소 글·범위·그날 값(출처·기준 날짜)·받은 시각뿐 — 카카오 주소 글·좌표·장소·거리는 받아도 보내지 않는다', async () => {
    const kakao = { roadAddress: '가나시 다라로 77', jibunAddress: '가나동 12-3', bcode: '9999910100', places: [{ name: '마바약국', distance: 31 }], distance: 120 }
    const snapshot = makeSnapshot({
      kakao: { ok: true, v: kakao, src: 'kakao-local', asOf: '2026-11-22' }, // 정해 두지 않은 칸
      people: { ...(makeSnapshot().people as object), address: kakao.roadAddress }, // Got 안의 더한 칸
    })
    const { client, calls } = fakeClient()
    const saved = await addCandidate(client, {
      name: '  역앞 자리 ',
      addressNote: '2번 출구 앞',
      lat: 37.512345,
      lng: 127.012345,
      radiusM: 1000,
      snapshot,
      ...kakao,
    } as never)

    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_candidates', op: 'insert', columns: CANDIDATE_COLUMNS, single: true })
    const body = call.body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['address_note', 'lat', 'lng', 'name', 'radius_m', 'snapshot', 'snapshot_at'])
    expect(Object.keys(body).every((key) => CANDIDATE_WRITABLE.includes(key))).toBe(true)
    expect(body).toMatchObject({ name: '역앞 자리', address_note: '2번 출구 앞', lat: 37.512345, lng: 127.012345, radius_m: 1000, snapshot_at: snapshot.at })
    const sent = body.snapshot as Record<string, unknown>
    expect(Object.keys(sent).sort()).toEqual(['at', 'radiusM', 'v', ...SNAPSHOT_KEYS].sort())
    expect(sent.people).toEqual(makeSnapshot().people)
    expect(sent.seniors).toEqual({ ok: false, why: 'failed', src: 'senior', prev: { v: 3, asOf: '2026-10-01' } })
    expect(sent.place).toEqual(PLACE) // 행정동 이름(동 경계 파일) — 카카오 주소 글이 아니다
    expect(sent.sggAvg).toEqual(SGG_AVG)
    const text = JSON.stringify(body)
    for (const leak of [kakao.roadAddress, kakao.jibunAddress, kakao.bcode, '마바약국', 'kakao', 'distance']) expect(text).not.toContain(leak)

    expect(saved).toMatchObject({ id: CAND, name: '역앞 자리', radiusM: 1000, status: 'watching' })
    expect(saved.snapshot).toEqual(sent)
  })

  it('AC-7908.2: 그날 값 칸의 출처가 카카오면(카카오 답은 저장하지 않음 — 새 칸 place·sggAvg도) 보내지 않는다', async () => {
    for (const src of ['kakao-local', 'kakao-map']) {
      for (const over of [
        { pharmacies: { ok: true, v: 2, src, asOf: '2026-11-22' } },
        { place: { ...PLACE, src } },
        { sggAvg: { ok: false, why: 'failed', src } },
      ]) {
        const { client, calls } = fakeClient()
        const snapshot = makeSnapshot(over)
        await expectFail(addCandidate(client, { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 500, snapshot }), 'E-LOC-SAVE-FAILED')
        expect(calls).toEqual([])
      }
    }
  })

  it('AC-7908.2: 이름 1~40자·점 범위·범위 일곱 값·주소 글 100자·그날 값 모양을 어기면 보내지 않는다', async () => {
    const ok = { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 1000 as const }
    const bad: unknown[] = [
      { ...ok, name: '   ' },
      { ...ok, name: '가'.repeat(41) },
      { ...ok, name: '역\n앞' },
      { ...ok, lat: 32.9 },
      { ...ok, lng: 132.1 },
      { ...ok, lat: Number.NaN },
      { ...ok, radiusM: 800 },
      { ...ok, addressNote: '가'.repeat(101) },
      { ...ok, snapshot: { v: 2 } },
      { ...ok, snapshot: makeSnapshot({ at: 'yesterday' }) },
      { ...ok, snapshot: makeSnapshot({ people: { ok: true, src: 'pop-age', asOf: '2026-10-31' } }) }, // v 없음
      { ...ok, snapshot: makeSnapshot({ trend: { ok: false, why: 'gone', src: 'pop-age' } }) },
      { ...ok, snapshot: makeSnapshot({ trend: undefined }) },
      { ...ok, snapshot: makeSnapshot({ place: undefined }) }, // 새 칸이 빠진 옛 모양
      { ...ok, snapshot: makeSnapshot({ sggAvg: { ok: true, src: 'pop-age', asOf: '2026-10-31' } }) },
      null,
    ]
    for (const fields of bad) {
      const { client, calls } = fakeClient()
      await expectFail(addCandidate(client, fields as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
    const { client, calls } = fakeClient()
    await addCandidate(client, { ...ok, name: '가'.repeat(40), lat: 39, lng: 124 })
    expect(bodyOf(calls)).toEqual({ name: '가'.repeat(40), address_note: '', lat: 39, lng: 124, radius_m: 1000 })
  })

  it('AC-7908.2: 그날 값은 jsonb 글자(::text) 65,536바이트까지 — 넘으면 보내지 않는다', async () => {
    const withUsage = (usage: string) =>
      makeSnapshot({ building: { ...(makeSnapshot().building as object), v: { ...(makeSnapshot().building as { v: object }).v, usage } } })
    const base = jsonbBytes(withUsage(''))
    const fits = withUsage(padTo(65536 - base))
    expect(jsonbBytes(fits)).toBe(65536)
    const over = withUsage(padTo(65537 - base))
    expect(JSON.stringify(over).length).toBeLessThan(65536) // 빈칸 없는 JSON 글자 수로 재면 지나가 버린다

    const ok = fakeClient()
    await addCandidate(ok.client, { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 1000, snapshot: fits })
    expect(jsonbBytes(bodyOf(ok.calls).snapshot)).toBe(65536)

    const no = fakeClient()
    await expectFail(addCandidate(no.client, { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 1000, snapshot: over }), 'E-LOC-SAVE-FAILED')
    expect(no.calls).toEqual([])
  })

  it('AC-7913.4: 진행 상태는 다섯 가운데 하나만, 고치기는 바꾼 칸만 그 id 줄에 보낸다', async () => {
    for (const status of ['watching', 'contacted', 'visited', 'reviewing', 'dropped'] as const) {
      const { client, calls } = fakeClient()
      const saved = await updateCandidate(client, CAND, { status })
      const call = onlyTable(calls)
      expect(call).toMatchObject({ table: 'location_candidates', op: 'update', body: { status }, columns: CANDIDATE_COLUMNS, single: true })
      expect(call.filters).toEqual([['eq', 'id', CAND]])
      expect(saved.status).toBe(status)
    }
    for (const changes of [{ status: 'won' }, {}, { status: undefined }, { id: CAND2 }, { hospital_id: HOSPITAL }]) {
      const { client, calls } = fakeClient()
      await expectFail(updateCandidate(client, CAND, changes as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
    const { client, calls } = fakeClient()
    await expectFail(updateCandidate(client, '', { status: 'visited' }), 'E-LOC-SAVE-FAILED')
    expect(calls).toEqual([])
  })

  it('AC-7908.2: 다시 받은 그날 값을 고치면 받은 시각(snapshot_at)도 그 값의 at으로 함께 바뀐다', async () => {
    const snapshot = makeSnapshot({ at: '2026-12-01T00:00:00.000Z', radiusM: 1500 })
    const { client, calls } = fakeClient()
    await updateCandidate(client, CAND, { snapshot, radiusM: 1500 })
    expect(bodyOf(calls)).toEqual({ radius_m: 1500, snapshot, snapshot_at: '2026-12-01T00:00:00.000Z' })

    const cleared = fakeClient()
    await updateCandidate(cleared.client, CAND, { snapshot: null })
    expect(bodyOf(cleared.calls)).toEqual({ snapshot: null, snapshot_at: null })
  })

  it('AC-7913.1·AC-7913.2·AC-7913.3·AC-7913.5: 층·넓이·간판·위반·비용·협상표·점검표·개원일·다 한 일은 칸마다 검사하고 jsonb 크기(2,000·6,000·4,000·2,000바이트)를 넘으면 보내지 않는다', async () => {
    const good = {
      floorLabel: ' 2층 ',
      areaM2: 99.17,
      signVisible: 'unknown' as const,
      violation: 'no' as const,
      costs: { interior: 120000000 },
      terms: { memo: '관리비 따로', deposit: 'yes' },
      checks: { 'b-ramp': { v: 'yes', how: '현장 확인' } },
      openOn: '2027-03-02',
      tasksDone: ['t-lease', 't-permit'],
      watchCheckedOn: '2026-11-20',
    }
    const { client, calls } = fakeClient()
    await updateCandidate(client, CAND, good)
    expect(bodyOf(calls)).toEqual({
      floor_label: '2층',
      area_m2: 99.17,
      sign_visible: 'unknown',
      violation: 'no',
      costs: { interior: 120000000 },
      terms: { memo: '관리비 따로', deposit: 'yes' },
      checks: { 'b-ramp': { v: 'yes', how: '현장 확인' } },
      open_on: '2027-03-02',
      tasks_done: ['t-lease', 't-permit'],
      watch_checked_on: '2026-11-20',
    })

    const cleared = fakeClient()
    await updateCandidate(cleared.client, CAND, { areaM2: null, signVisible: null, violation: null, openOn: null, watchCheckedOn: null })
    expect(bodyOf(cleared.calls)).toEqual({ area_m2: null, sign_visible: null, violation: null, open_on: null, watch_checked_on: null })

    const sized = (limit: number) => ({ memo: padTo(limit - jsonbBytes({ memo: '' })) })
    expect(jsonbBytes(sized(6000))).toBe(6000)
    const edge = fakeClient()
    await updateCandidate(edge.client, CAND, { costs: sized(2000), terms: sized(6000), checks: sized(4000) })
    expect(bodyOf(edge.calls)).toMatchObject({ costs: sized(2000), terms: sized(6000), checks: sized(4000) })

    const bad: unknown[] = [
      { floorLabel: '가'.repeat(21) },
      { areaM2: 0 },
      { areaM2: -3 },
      { areaM2: 99.175 }, // numeric(8,2) — 소수 2자리까지만
      { areaM2: 1_000_000 },
      { signVisible: 'maybe' },
      { violation: true },
      { costs: [] },
      { costs: sized(2001) },
      { terms: sized(6001) },
      { checks: sized(4001) },
      { terms: 'memo' },
      { openOn: '2027-02-30' },
      { tasksDone: 't-lease' },
      { tasksDone: [1] },
      { tasksDone: Array.from({ length: 300 }, (_, i) => `task-${i}`) }, // 2,000바이트 넘음
      { watchCheckedOn: '2026/11/20' },
    ]
    for (const changes of bad) {
      const run = fakeClient()
      await expectFail(updateCandidate(run.client, CAND, changes as never), 'E-LOC-SAVE-FAILED')
      expect(run.calls).toEqual([])
    }
  })

  it('AC-7913.4: 후보를 지우면 그 후보 사진 줄의 파일도 지운다(줄은 DB가 함께 지움) — 차례: 사진 자리 읽기 → 후보 지우기 → 파일 지우기', async () => {
    const second = `${HOSPITAL}/${CAND}/${'ffffffff-0000-4000-8000-0000000000aa'}.jpg`
    const { client, calls } = fakeClient(by({ 'location_photos:select': () => ({ data: [{ path: PHOTO_PATH }, { path: second }, { path: '../etc' }] }) }))
    await deleteCandidate(client, CAND)
    expect(steps(calls)).toEqual(['location_photos:select', 'location_candidates:delete', 'storage:remove'])
    const [read, remove] = [tableCalls(calls)[0], tableCalls(calls)[1]]
    expect(read).toMatchObject({ columns: 'path', filters: [['eq', 'candidate_id', CAND]] })
    expect(remove.filters).toEqual([['eq', 'id', CAND]])
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, paths: [PHOTO_PATH, second] })
  })

  it('AC-7913.4: 사진이 없으면 파일 지우기를 부르지 않고, 파일 지우기가 실패해도 후보 지우기는 된 것으로 본다', async () => {
    const none = fakeClient()
    await deleteCandidate(none.client, CAND)
    expect(steps(none.calls)).toEqual(['location_photos:select', 'location_candidates:delete'])

    const quiet = fakeClient(
      by({ 'location_photos:select': () => ({ data: [{ path: PHOTO_PATH }] }), 'storage:remove': () => ({ error: RAW_ERROR }) }),
    )
    await expect(deleteCandidate(quiet.client, CAND)).resolves.toBeUndefined()
  })

  it('AC-7913.4: 사진 자리를 못 읽으면 후보를 지우지 않는다(파일이 줄 없이 떠돌지 않게)', async () => {
    const { client, calls } = fakeClient(by({ 'location_photos:select': () => ({ error: RAW_ERROR }) }))
    await expectFail(deleteCandidate(client, CAND), 'E-LOC-SAVE-FAILED')
    expect(steps(calls)).toEqual(['location_photos:select'])

    const empty = fakeClient()
    await expectFail(deleteCandidate(empty.client, ''), 'E-LOC-SAVE-FAILED')
    expect(empty.calls).toEqual([])
  })
})

// ── 메모 ─────────────────────────────────────────────────────

describe('addNote · deleteNote — 날짜별 메모', () => {
  it('AC-7913.4: 메모는 후보·날짜·1~500자 글(앞뒤 빈칸 뺌, 줄바꿈 됨)로 넣는다', async () => {
    const { client, calls } = fakeClient()
    const saved = await addNote(client, CAND, { day: '2026-11-22', body: '  중개사와 통화\n월세 조정 가능  ' })
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_notes', op: 'insert', columns: NOTE_COLUMNS, single: true })
    expect(call.body).toEqual({ candidate_id: CAND, day: '2026-11-22', body: '중개사와 통화\n월세 조정 가능' })
    expect(saved).toEqual({ id: NOTE, candidateId: CAND, day: '2026-11-22', body: '중개사와 통화\n월세 조정 가능', createdAt: T1 })

    const max = fakeClient()
    await addNote(max.client, CAND, { day: '2026-11-22', body: '가'.repeat(500) })
    expect(bodyOf(max.calls).body).toBe('가'.repeat(500))
  })

  it('AC-7913.4: 빈칸·줄바꿈만·501자·없는 날짜·틀린 후보 id면 보내지 않는다', async () => {
    const bad: [string, unknown][] = [
      [CAND, { day: '2026-11-22', body: ' \n ' }],
      [CAND, { day: '2026-11-22', body: '가'.repeat(501) }],
      [CAND, { day: '2026-02-30', body: '메모' }],
      [CAND, { day: '2026-11-22', body: 7 }],
      ['', { day: '2026-11-22', body: '메모' }],
      [CAND, null],
    ]
    for (const [candidateId, fields] of bad) {
      const { client, calls } = fakeClient()
      await expectFail(addNote(client, candidateId, fields as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })

  it('AC-7913.4: 메모 지우기는 그 id 줄 하나만', async () => {
    const { client, calls } = fakeClient()
    await deleteNote(client, NOTE)
    expect(onlyTable(calls)).toMatchObject({ table: 'location_notes', op: 'delete', filters: [['eq', 'id', NOTE]] })
    const empty = fakeClient()
    await expectFail(deleteNote(empty.client, ''), 'E-LOC-SAVE-FAILED')
    expect(empty.calls).toEqual([])
  })
})

// ── 사진 ─────────────────────────────────────────────────────

describe('addPhoto · deletePhoto · readPhoto · removePhotos — 현장 사진', () => {
  it('AC-7913.4: 사진은 <병원 id>/<후보 id>/<새 uuid>.jpg로 JPEG를 먼저 올리고 그 자리로 줄을 넣는다', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(PHOTO_UUID)
    const { client, calls } = fakeClient()
    const photo = jpegBlob()
    const saved = await addPhoto(client, CAND, photo, { label: ' 건물 앞 ', takenOn: '2026-11-22' })

    expect(steps(calls)).toEqual(['rpc:my_hospital_id', 'storage:upload', 'location_photos:insert'])
    expect(storageCalls(calls)[0]).toEqual({
      kind: 'storage',
      bucket: BUCKET,
      op: 'upload',
      path: PHOTO_PATH,
      body: photo,
      options: { contentType: 'image/jpeg', upsert: false },
    })
    const insert = tableCalls(calls)[0]
    expect(insert).toMatchObject({ columns: PHOTO_COLUMNS, single: true })
    expect(insert.body).toEqual({ candidate_id: CAND, path: PHOTO_PATH, label: '건물 앞', taken_on: '2026-11-22' })
    expect(saved).toEqual({ id: PHOTO_ID, candidateId: CAND, path: PHOTO_PATH, label: '건물 앞', takenOn: '2026-11-22', createdAt: T1 })
  })

  it('AC-7913.4: JPEG가 아니거나 3,000,000바이트를 넘거나 이름 40자·날짜·후보 id가 틀리면 아무것도 보내지 않고 E-LOC-PHOTO', async () => {
    const big = new Uint8Array(3_000_001)
    big.set(JPEG)
    const max = new Uint8Array(3_000_000)
    max.set(JPEG)
    const bad: [string, unknown, unknown][] = [
      [CAND, new Blob([PNG.slice()], { type: 'image/png' }), { label: '', takenOn: '2026-11-22' }],
      [CAND, new Blob([PNG.slice()], { type: 'image/jpeg' }), { label: '', takenOn: '2026-11-22' }], // 이름표만 JPEG
      [CAND, jpegBlob(big), { label: '', takenOn: '2026-11-22' }],
      [CAND, new Blob([]), { label: '', takenOn: '2026-11-22' }],
      [CAND, 'photo.jpg', { label: '', takenOn: '2026-11-22' }],
      [CAND, jpegBlob(), { label: '가'.repeat(41), takenOn: '2026-11-22' }],
      [CAND, jpegBlob(), { label: '', takenOn: '2026-13-01' }],
      ['../other', jpegBlob(), { label: '', takenOn: '2026-11-22' }],
      [CAND.toUpperCase(), jpegBlob(), { label: '', takenOn: '2026-11-22' }], // 자리 검사는 소문자 uuid만 받는다
    ]
    for (const [candidateId, photo, fields] of bad) {
      const { client, calls } = fakeClient()
      await expectFail(addPhoto(client, candidateId, photo as Blob, fields as never), 'E-LOC-PHOTO')
      expect(calls).toEqual([])
    }
    const ok = fakeClient()
    await addPhoto(ok.client, CAND, jpegBlob(max), { label: '가'.repeat(40), takenOn: '2026-11-22' })
    expect(steps(ok.calls)).toEqual(['rpc:my_hospital_id', 'storage:upload', 'location_photos:insert'])
  })

  it('AC-7913.4: 후보마다 30장을 넘으면(트리거 23514) 올린 파일을 지우고 E-LOC-PHOTO', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(PHOTO_UUID)
    const { client, calls } = fakeClient(
      by({ 'location_photos:insert': () => ({ error: { code: '23514', message: `location photos limit 30 (${SECRET})` } }) }),
    )
    await expectFail(addPhoto(client, CAND, jpegBlob(), { label: '', takenOn: '2026-11-22' }), 'E-LOC-PHOTO')
    expect(steps(calls)).toEqual(['rpc:my_hospital_id', 'storage:upload', 'location_photos:insert', 'storage:remove'])
    expect(storageCalls(calls)[1]).toMatchObject({ bucket: BUCKET, paths: [PHOTO_PATH] })
  })

  it('AC-7913.4: 병원 id를 못 받거나 올리기가 실패하면 줄을 넣지 않는다', async () => {
    const noHospital = fakeClient(by({ 'rpc:my_hospital_id': () => ({ data: null }) }))
    await expectFail(addPhoto(noHospital.client, CAND, jpegBlob(), { label: '', takenOn: '2026-11-22' }), 'E-LOC-PHOTO')
    expect(steps(noHospital.calls)).toEqual(['rpc:my_hospital_id'])

    const upload = fakeClient(by({ 'storage:upload': () => ({ error: RAW_ERROR }) }))
    await expectFail(addPhoto(upload.client, CAND, jpegBlob(), { label: '', takenOn: '2026-11-22' }), 'E-LOC-PHOTO')
    expect(steps(upload.calls)).toEqual(['rpc:my_hospital_id', 'storage:upload'])
  })

  it('AC-7913.4: 사진 지우기는 그 줄을 지우고 DB가 돌려준 자리의 파일을 지운다(파일 지우기 실패는 알리지 않음)', async () => {
    const { client, calls } = fakeClient(by({ 'location_photos:delete': () => ({ data: [{ path: PHOTO_PATH }] }) }))
    await deletePhoto(client, PHOTO_ID)
    expect(steps(calls)).toEqual(['location_photos:delete', 'storage:remove'])
    expect(tableCalls(calls)[0]).toMatchObject({ columns: 'path', filters: [['eq', 'id', PHOTO_ID]] })
    expect(storageCalls(calls)[0]).toMatchObject({ bucket: BUCKET, paths: [PHOTO_PATH] })

    const quiet = fakeClient(by({ 'location_photos:delete': () => ({ data: [{ path: PHOTO_PATH }] }), 'storage:remove': () => ({ error: RAW_ERROR }) }))
    await expect(deletePhoto(quiet.client, PHOTO_ID)).resolves.toBeUndefined()

    const gone = fakeClient()
    await deletePhoto(gone.client, PHOTO_ID)
    expect(steps(gone.calls)).toEqual(['location_photos:delete'])

    const failed = fakeClient(by({ 'location_photos:delete': () => ({ error: RAW_ERROR }) }))
    await expectFail(deletePhoto(failed.client, PHOTO_ID), 'E-LOC-SAVE-FAILED')
    expect(steps(failed.calls)).toEqual(['location_photos:delete'])
  })

  it('AC-7913.4: 사진 읽기는 자리 모양(<병원>/<후보>/<uuid>.jpg)만 내려받고, 틀리거나 실패면 null', async () => {
    const { client, calls } = fakeClient()
    expect(await readPhoto(client, PHOTO_PATH)).toBeInstanceOf(Blob)
    expect(storageCalls(calls)).toEqual([{ kind: 'storage', bucket: BUCKET, op: 'download', path: PHOTO_PATH }])

    for (const path of ['', '../x.jpg', `${HOSPITAL}/${PHOTO_UUID}.jpg`, `${HOSPITAL}/${CAND}/${PHOTO_UUID}.png`, `${PHOTO_PATH}/..`]) {
      const run = fakeClient()
      expect(await readPhoto(run.client, path)).toBeNull()
      expect(run.calls).toEqual([])
    }
    expect(await readPhoto(fakeClient(() => ({ error: RAW_ERROR })).client, PHOTO_PATH)).toBeNull()
    expect(await readPhoto(fakeClient(() => ({ data: 'not a blob' })).client, PHOTO_PATH)).toBeNull()
    expect(
      await readPhoto(
        fakeClient(() => {
          throw new Error(SECRET)
        }).client,
        PHOTO_PATH,
      ),
    ).toBeNull()
  })

  it('AC-7913.4: removePhotos는 자리 모양이 맞는 것만 한 번에 지우고, 지울 것이 없으면 부르지 않는다', async () => {
    const { client, calls } = fakeClient()
    await removePhotos(client, [PHOTO_PATH, 'x', `${HOSPITAL}/../${PHOTO_UUID}.jpg`])
    expect(storageCalls(calls)).toEqual([{ kind: 'storage', bucket: BUCKET, op: 'remove', paths: [PHOTO_PATH] }])

    const none = fakeClient()
    await removePhotos(none.client, ['x'])
    expect(none.calls).toEqual([])

    await expectFail(removePhotos(fakeClient(() => ({ error: RAW_ERROR })).client, [PHOTO_PATH]), 'E-LOC-SAVE-FAILED')
  })
})

// ── 설정 ─────────────────────────────────────────────────────

describe('saveScoreRule · resetScoreRule · saveHomeEswt — 병원마다 설정 한 줄', () => {
  it('AC-7919.4: 점수 설정은 병원마다 한 줄 upsert(on conflict hospital_id) — score_rule 칸 하나만 보내고 저장된 설정을 돌려준다', async () => {
    const rule = structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
    rule.weights.people = 45
    rule.bands = [6, 7, 8, 9, 10]
    rule.items['p-density'] = { w: 35, full: 12000 }
    const { client, calls } = fakeClient()
    const saved = await saveScoreRule(client, rule)

    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_settings', op: 'upsert', options: { onConflict: 'hospital_id' }, columns: SETTINGS_COLUMNS, single: true })
    expect(call.body).toEqual({ score_rule: rule })
    expect(saved).toEqual({ scoreRule: rule, deptRule: DEFAULT_DEPT_RULE, homeEswt: null, updatedAt: T1 })
  })

  it('AC-7919.4·AC-7919.6: p-welfare만 적을수록 좋음(기준 둘) 모양도 저장된다', async () => {
    const rule = structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
    rule.items['p-welfare'] = { w: 10, best: 1, worst: 5 }
    const { client, calls } = fakeClient()
    const saved = await saveScoreRule(client, rule)
    expect((bodyOf(calls).score_rule as ScoreRule).items['p-welfare']).toEqual({ w: 10, best: 1, worst: 5 })
    expect(saved.scoreRule.items['p-welfare']).toEqual({ w: 10, best: 1, worst: 5 })
  })

  it('AC-7919.4: 기준 0·빈칸·100점 값 ≥ 0점 값·나이대 0개·무게 101이면 저장하지 않는다(보내지 않음)', async () => {
    const broken: ((rule: ScoreRule) => void)[] = [
      (r) => (r.items['p-density'] = { w: 40, full: 0 }),
      (r) => (r.items['p-density'] = { w: 40, full: null as unknown as number }),
      (r) => (r.items['c-count'] = { w: 30, best: 6, worst: 6 }),
      (r) => (r.items['c-count'] = { w: 30, best: 7, worst: 6 }),
      (r) => (r.items['t-station'] = { w: 40, best: Number.NaN, worst: 1500 }),
      (r) => (r.bands = []),
      (r) => (r.weights.cost = 101),
      (r) => (r.items['s-floor'] = { w: 1.5, best: 1, worst: 5 }),
    ]
    for (const breakIt of broken) {
      const rule = structuredClone(DEFAULT_SCORE_RULE) as ScoreRule
      breakIt(rule)
      const { client, calls } = fakeClient()
      await expectFail(saveScoreRule(client, rule), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
    for (const raw of [null, 'rule', []]) {
      const { client, calls } = fakeClient()
      await expectFail(saveScoreRule(client, raw as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })

  it('AC-7919.4: 보내는 설정은 정해 둔 칸으로 새로 만든다(모르는 칸·세부 id는 빼고 나이대는 차례대로)', async () => {
    const rule = structuredClone(DEFAULT_SCORE_RULE) as ScoreRule & Record<string, unknown>
    rule.extra = SECRET
    ;(rule.items as Record<string, unknown>)['x-unknown'] = { w: 5, full: 3 }
    ;(rule.weights as Record<string, unknown>).other = 5
    rule.bands = [10, 4, 7]
    const { client, calls } = fakeClient()
    await saveScoreRule(client, rule)
    const sent = bodyOf(calls).score_rule as ScoreRule
    expect(Object.keys(sent).sort()).toEqual(['bands', 'items', 'v', 'weights'])
    expect(Object.keys(sent.weights).sort()).toEqual(Object.keys(DEFAULT_SCORE_RULE.weights).sort())
    expect(Object.keys(sent.items).sort()).toEqual(Object.keys(DEFAULT_SCORE_RULE.items).sort())
    expect(sent.bands).toEqual([4, 7, 10])
    expect(JSON.stringify(bodyOf(calls))).not.toContain(SECRET)
  })

  it('AC-7919.4: [기본값으로 되돌리기]는 처음 설정(DEFAULT_SCORE_RULE)을 같은 upsert로 저장한다', async () => {
    const { client, calls } = fakeClient()
    const saved = await resetScoreRule(client)
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_settings', op: 'upsert', options: { onConflict: 'hospital_id' } })
    expect(call.body).toEqual({ score_rule: DEFAULT_SCORE_RULE })
    expect(saved.scoreRule).toEqual(DEFAULT_SCORE_RULE)
  })

  it('AC-7919.4: 지금 의원 체외충격파 값은 0~9,999,999,999 원 정수나 비움만, home_eswt 칸 하나만 upsert', async () => {
    for (const won of [0, 50000, 9_999_999_999, null]) {
      const { client, calls } = fakeClient()
      const saved = await saveHomeEswt(client, won)
      const call = onlyTable(calls)
      expect(call).toMatchObject({ table: 'location_settings', op: 'upsert', options: { onConflict: 'hospital_id' }, columns: SETTINGS_COLUMNS })
      expect(call.body).toEqual({ home_eswt: won })
      expect(saved.homeEswt).toBe(won)
    }
    for (const won of [-1, 10_000_000_000, 1.5, Number.NaN, '50000']) {
      const { client, calls } = fakeClient()
      await expectFail(saveHomeEswt(client, won as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })
})

describe('saveDeptRule · resetDeptRule · readDeptRule — 의원 과목 고르기(dept_rule)', () => {
  it('AC-7921.2: 과목 고르기는 병원마다 한 줄 upsert(on conflict hospital_id) — dept_rule 칸 하나만, 목록 차례로 새로 만들어 보낸다', async () => {
    const { client, calls } = fakeClient()
    const saved = await saveDeptRule(client, { v: 1, rival: ['rehab', 'korean', 'ortho'], hide: ['dental', 'derm'] })
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_settings', op: 'upsert', options: { onConflict: 'hospital_id' }, columns: SETTINGS_COLUMNS, single: true })
    const sent = { v: 1, rival: ['ortho', 'rehab', 'korean'], hide: ['derm', 'dental'] }
    expect(call.body).toEqual({ dept_rule: sent })
    expect(Object.keys(call.body as object)).toEqual(['dept_rule'])
    expect(saved).toEqual({ scoreRule: DEFAULT_SCORE_RULE, deptRule: sent, homeEswt: null, updatedAt: T1 })
  })

  it('AC-7921.2: 경쟁 0개(rival: [])도 저장된다', async () => {
    const { client, calls } = fakeClient()
    const saved = await saveDeptRule(client, { v: 1, rival: [], hide: ['im'] })
    expect(bodyOf(calls)).toEqual({ dept_rule: { v: 1, rival: [], hide: ['im'] } })
    expect(saved.deptRule).toEqual({ v: 1, rival: [], hide: ['im'] })
  })

  it('AC-7921.2: 모르는 과목 id·경쟁과 안 보기 겹침·되풀이·판 2·더한 칸·배열 아님이면 보내지 않는다(checkDeptRule)', async () => {
    const bad: unknown[] = [
      { v: 1, rival: ['ortho', 'x-unknown'], hide: [] },
      { v: 1, rival: ['ortho'], hide: ['ortho'] },
      { v: 1, rival: ['ortho', 'ortho'], hide: [] },
      { v: 2, rival: ['ortho'], hide: [] },
      { v: 1, rival: ['ortho'], hide: [], extra: SECRET },
      { v: 1, rival: 'ortho', hide: [] },
      { v: 1, rival: ['ortho'] },
      null,
      'rule',
      [],
    ]
    for (const rule of bad) {
      const { client, calls } = fakeClient()
      await expectFail(saveDeptRule(client, rule as never), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })

  it('AC-7921.2: [기본값으로]는 처음 값(경쟁 = 정형외과·신경외과·마취통증의학과·재활의학과, 안 보기 없음)을 같은 upsert로 저장한다', async () => {
    const { client, calls } = fakeClient()
    const saved = await resetDeptRule(client)
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_settings', op: 'upsert', options: { onConflict: 'hospital_id' } })
    expect(call.body).toEqual({ dept_rule: { v: 1, rival: ['ortho', 'ns', 'pain', 'rehab'], hide: [] } })
    expect(JSON.stringify((call.body as Record<string, unknown>).dept_rule)).toBe(JSON.stringify(DEFAULT_DEPT_RULE))
    expect(saved.deptRule).toEqual(DEFAULT_DEPT_RULE)
  })

  it('AC-7921.2·AC-7915.2: 알림 쪽 readDeptRule은 설정 줄의 dept_rule 칸 하나만 읽어 fillDeptRule로 돌려준다', async () => {
    const { client, calls } = fakeClient(
      by({ 'location_settings:select': () => ({ data: { dept_rule: { v: 1, rival: ['pain', 'ortho', 'nope'], hide: ['korean'] } } }) }),
    )
    expect(await readDeptRule(client)).toEqual({ v: 1, rival: ['ortho', 'pain'], hide: ['korean'] })
    expect(onlyTable(calls)).toMatchObject({ table: 'location_settings', op: 'select', columns: 'dept_rule', single: true })
  })

  it('AC-7921.2·AC-7915.1: readDeptRule은 줄이 없거나 줄에 과목 칸이 없으면(예전 줄·틀린 칸 모양) 처음 값', async () => {
    const replies: ((call: Call) => Reply)[] = [() => ({ data: null }), () => ({ data: { dept_rule: 'ortho' } }), () => ({ data: {} })]
    for (const reply of replies) {
      const rule = await readDeptRule(fakeClient(reply).client)
      expect(rule).toEqual(DEFAULT_DEPT_RULE)
      expect(Object.isFrozen(rule)).toBe(false)
    }
  })

  it('AC-7915.1: readDeptRule은 못 읽으면(오류 답·예외·줄 아닌 답) 던지지 않고 null — 알림 확인이 처음 값으로 확인하지 않게 실패를 알린다', async () => {
    const replies: ((call: Call) => Reply)[] = [
      () => ({ error: RAW_ERROR }),
      () => ({ data: 'row' }),
      () => ({ data: [] }),
      () => {
        throw new Error(SECRET)
      },
    ]
    for (const reply of replies) expect(await readDeptRule(fakeClient(reply).client)).toBeNull()
  })
})

// ── 매물 ─────────────────────────────────────────────────────

describe('addListing · updateListing · deleteListing — 붙여 넣은 매물', () => {
  const fields = {
    candidateId: CAND,
    title: ' 역앞 2층 30평 ',
    url: 'https://example.com/listing/1',
    areaM2: 99.17,
    floorLabel: '2층',
    deposit: 30000000,
    rent: 2500000,
    premium: 0,
    mgmt: null,
    brokerId: BROKER,
    brokerNote: '가나부동산',
    memo: '주차 2대\n엘리베이터 있음',
    lat: 37.5123,
    lng: 127.0123,
  }

  it('AC-7910.1·AC-7910.3: 매물은 칸 권한에 있는 열넷만 보낸다(https 링크·원 정수·점은 둘 다 또는 둘 다 비움)', async () => {
    const { client, calls } = fakeClient()
    const saved = await addListing(client, { ...fields, id: LISTING, hospital_id: HOSPITAL } as never)
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_listings', op: 'insert', columns: LISTING_COLUMNS, single: true })
    expect(Object.keys(call.body as object).sort()).toEqual(LISTING_KEYS)
    expect(call.body).toMatchObject({ title: '역앞 2층 30평', candidate_id: CAND, broker_id: BROKER, mgmt: null, memo: '주차 2대\n엘리베이터 있음' })
    expect(saved).toMatchObject({ id: LISTING, title: '역앞 2층 30평', brokerId: BROKER })

    const update = fakeClient()
    await updateListing(update.client, LISTING, { ...fields, url: '', lat: null, lng: null, candidateId: null, brokerId: null })
    expect(onlyTable(update.calls)).toMatchObject({ op: 'update', filters: [['eq', 'id', LISTING]], columns: LISTING_COLUMNS })
    expect(bodyOf(update.calls)).toMatchObject({ url: '', lat: null, lng: null, candidate_id: null, broker_id: null })
  })

  it('AC-7910.1: http 링크·제목 빈칸·금액 소수·음수·점 하나만이면 보내지 않는다', async () => {
    const bad = [
      { ...fields, url: 'http://example.com' },
      { ...fields, url: `https://example.com/${'a'.repeat(481)}` }, // 501자
      { ...fields, title: '  ' },
      { ...fields, title: '가'.repeat(41) },
      { ...fields, rent: 2500000.5 },
      { ...fields, deposit: -1 },
      { ...fields, premium: 10_000_000_000 },
      { ...fields, lat: null },
      { ...fields, lng: 140 },
      { ...fields, memo: '가'.repeat(501) },
      { ...fields, brokerNote: '가'.repeat(41) },
      { ...fields, brokerId: 'broker' },
    ]
    for (const listing of bad) {
      const { client, calls } = fakeClient()
      await expectFail(addListing(client, listing), 'E-LOC-SAVE-FAILED')
      expect(calls).toEqual([])
    }
  })

  it('AC-7910.1: 매물 지우기는 그 id 줄 하나만', async () => {
    const { client, calls } = fakeClient()
    await deleteListing(client, LISTING)
    expect(onlyTable(calls)).toMatchObject({ table: 'location_listings', op: 'delete', filters: [['eq', 'id', LISTING]] })
  })
})

// ── 새 경쟁 의원 알림(대시보드) ──────────────────────────────

describe('새 경쟁 의원 알림 줄 — 대시보드가 부름', () => {
  it('AC-7915.1·AC-7915.2: 알림 확인할 후보는 알림에 쓰는 칸만 읽는다(그날 값 없음 · 후보 이름은 알림 아래 줄에 씀)', async () => {
    const watchRow = (over: Record<string, unknown> = {}) => ({
      id: CAND,
      name: '역앞 자리',
      status: 'watching',
      lat: 37.5,
      lng: 127,
      radius_m: 1000,
      watch_checked_on: '2026-10-01',
      created_at: T1,
      ...over,
    })
    const { client, calls } = fakeClient(
      by({
        'location_candidates:select': () => ({
          data: [
            watchRow(),
            watchRow({ id: CAND2, status: 'gone', watch_checked_on: null }),
            watchRow({ id: 'no-name', name: '' }),
            watchRow({ id: 'name-missing', name: undefined }),
            watchRow({ id: 'name-number', name: 7 }),
          ],
        }),
      }),
    )
    expect(await listWatchCandidates(client)).toEqual([
      { id: CAND, name: '역앞 자리', status: 'watching', lat: 37.5, lng: 127, radiusM: 1000, watchCheckedOn: '2026-10-01', createdAt: T1, place: null },
    ])
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_candidates', op: 'select', columns: WATCH_COLUMNS, range: [0, 999] })
    // 그날 값은 place 칸 하나만(시도·시군구 이름 — 인허가 주소 앞부분), 몸통 전체는 읽지 않는다
    expect(String(call.columns).replace('place:snapshot->place', '')).not.toMatch(/snapshot/)
  })

  it('AC-7915.1: 알림 확인할 후보는 그날 값 place(받은 값, 실패면 지난 값)의 시도·시군구 이름을 함께 읽고, 없거나 모양이 틀리면 null', async () => {
    const place = (v: unknown) => ({ ok: true, v, src: 'dongs', asOf: '2026-07-01' })
    const V = { sido: '36', sidoName: '세종특별자치시', sgg: '36110', sggName: '세종특별자치시', dong: null, dongName: null }
    const rows = [
      { place: place(V) },
      { place: { ok: false, why: 'failed', src: 'dongs', prev: { v: { ...V, sidoName: '가람도', sggName: '나래시 다솜구' }, asOf: '2026-07-01' } } },
      { place: { ok: false, why: 'outside', src: 'dongs' } },
      { place: place({ ...V, sidoName: 3 }) },
      { place: place({ ...V, sggName: '' }) },
      { place: 'x' },
      {},
    ].map((over, i) => ({
      id: `aaaaaaaa-0000-4000-8000-00000000010${i}`,
      name: `자리 ${i}`,
      status: 'watching',
      lat: 37.5,
      lng: 127,
      radius_m: 1000,
      watch_checked_on: null,
      created_at: T1,
      ...over,
    }))
    const { client } = fakeClient(by({ 'location_candidates:select': () => ({ data: rows }) }))
    expect((await listWatchCandidates(client)).map((c) => c.place)).toEqual([
      { sidoName: '세종특별자치시', sggName: '세종특별자치시' },
      { sidoName: '가람도', sggName: '나래시 다솜구' },
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it('AC-7915.1: 알림 줄 넣기는 같은 줄을 건너뛰는 넣기(on conflict do nothing)만 쓰고, 틀린 줄은 빼고 넣는다', async () => {
    const good: WatchEvent = { candidateId: CAND, kind: 'open', clinicName: ' 가나정형외과의원 ', dept: '정형외과', eventOn: '2026-11-01', distM: 420 }
    const { client, calls } = fakeClient()
    await addEvents(client, [
      good,
      { ...good, kind: 'moved' as never },
      { ...good, distM: 3001 },
      { ...good, clinicName: '' },
      { ...good, eventOn: '2026-11-31' },
      { ...good, candidateId: 'x' },
    ])
    const call = onlyTable(calls)
    expect(call).toMatchObject({
      table: 'location_events',
      op: 'upsert',
      options: { onConflict: 'candidate_id,kind,clinic_name,event_on', ignoreDuplicates: true },
    })
    expect(call.columns).toBeUndefined()
    expect(call.body).toEqual([{ candidate_id: CAND, kind: 'open', clinic_name: '가나정형외과의원', dept: '정형외과', event_on: '2026-11-01', dist_m: 420 }])

    const none = fakeClient()
    await addEvents(none.client, [{ ...good, distM: -1 }])
    expect(none.calls).toEqual([])
  })

  it('AC-7915.1: 다 넣은 뒤 그 후보의 마지막 확인 날만 고친다', async () => {
    const { client, calls } = fakeClient()
    await setWatchChecked(client, CAND, '2026-11-22')
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_candidates', op: 'update', body: { watch_checked_on: '2026-11-22' }, filters: [['eq', 'id', CAND]] })
    expect(call.columns).toBeUndefined()
    const bad = fakeClient()
    await expectFail(setWatchChecked(bad.client, CAND, '22-11-2026'), 'E-LOC-SAVE-FAILED')
    expect(bad.calls).toEqual([])
  })

  it('AC-7915.2: 안 본 알림 줄(seen_at 비어 있음)만 최근 차례로 읽는다', async () => {
    const { client, calls } = fakeClient(by({ 'location_events:select': () => ({ data: [eventRow(), eventRow({ id: EVENT2, kind: 'close' })] }) }))
    const events = await listUnseenEvents(client)
    expect(events.map((e) => [e.id, e.kind])).toEqual([
      [EVENT, 'open'],
      [EVENT2, 'close'],
    ])
    const call = onlyTable(calls)
    expect(call).toMatchObject({ columns: EVENT_COLUMNS, filters: [['is', 'seen_at', null]], range: [0, 999] })
    expect(call.orders).toEqual([
      ['event_on', { ascending: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('AC-7915.3: [닫기]는 보이던 줄의, 후보를 열면 그 후보 줄의 seen_at만 지금 시각으로 채운다(이미 본 줄은 그대로)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const shown = fakeClient()
    await markEventsSeen(shown.client, [EVENT, EVENT2, 'x'])
    expect(onlyTable(shown.calls)).toMatchObject({
      table: 'location_events',
      op: 'update',
      body: { seen_at: NOW.toISOString() },
      filters: [
        ['in', 'id', [EVENT, EVENT2]],
        ['is', 'seen_at', null],
      ],
    })
    const none = fakeClient()
    await markEventsSeen(none.client, [])
    expect(none.calls).toEqual([])

    const opened = fakeClient()
    await markCandidateEventsSeen(opened.client, CAND)
    expect(onlyTable(opened.calls)).toMatchObject({
      op: 'update',
      body: { seen_at: NOW.toISOString() },
      filters: [
        ['eq', 'candidate_id', CAND],
        ['is', 'seen_at', null],
      ],
    })
  })
})

// ── 실패 ─────────────────────────────────────────────────────

describe('실패 — 오류 번호만, Supabase 글·입력값 없음', () => {
  const rule = DEFAULT_SCORE_RULE
  const runs: [string, (client: LocationClient) => Promise<unknown>, string][] = [
    ['addCandidate', (c) => addCandidate(c, { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 1000 }), 'E-LOC-SAVE-FAILED'],
    ['updateCandidate', (c) => updateCandidate(c, CAND, { status: 'visited' }), 'E-LOC-SAVE-FAILED'],
    ['deleteCandidate', (c) => deleteCandidate(c, CAND), 'E-LOC-SAVE-FAILED'],
    ['addListing', (c) => addListing(c, { candidateId: null, title: '매물', url: '', areaM2: null, floorLabel: '', deposit: null, rent: null, premium: null, mgmt: null, brokerId: null, brokerNote: '', memo: '', lat: null, lng: null }), 'E-LOC-SAVE-FAILED'],
    ['deleteListing', (c) => deleteListing(c, LISTING), 'E-LOC-SAVE-FAILED'],
    ['addNote', (c) => addNote(c, CAND, { day: '2026-11-22', body: '메모' }), 'E-LOC-SAVE-FAILED'],
    ['deleteNote', (c) => deleteNote(c, NOTE), 'E-LOC-SAVE-FAILED'],
    ['addPhoto', (c) => addPhoto(c, CAND, jpegBlob(), { label: '', takenOn: '2026-11-22' }), 'E-LOC-PHOTO'],
    ['saveScoreRule', (c) => saveScoreRule(c, rule), 'E-LOC-SAVE-FAILED'],
    ['resetScoreRule', (c) => resetScoreRule(c), 'E-LOC-SAVE-FAILED'],
    ['saveHomeEswt', (c) => saveHomeEswt(c, 50000), 'E-LOC-SAVE-FAILED'],
    ['saveDeptRule', (c) => saveDeptRule(c, DEFAULT_DEPT_RULE), 'E-LOC-SAVE-FAILED'],
    ['resetDeptRule', (c) => resetDeptRule(c), 'E-LOC-SAVE-FAILED'],
    ['listWatchCandidates', (c) => listWatchCandidates(c), 'E-LOC-READ-FAILED'],
    ['listUnseenEvents', (c) => listUnseenEvents(c), 'E-LOC-READ-FAILED'],
    ['addEvents', (c) => addEvents(c, [{ candidateId: CAND, kind: 'open', clinicName: '가나의원', dept: '', eventOn: '2026-11-01', distM: 0 }]), 'E-LOC-SAVE-FAILED'],
    ['setWatchChecked', (c) => setWatchChecked(c, CAND, '2026-11-22'), 'E-LOC-SAVE-FAILED'],
    ['markEventsSeen', (c) => markEventsSeen(c, [EVENT]), 'E-LOC-SAVE-FAILED'],
    ['markCandidateEventsSeen', (c) => markCandidateEventsSeen(c, CAND), 'E-LOC-SAVE-FAILED'],
  ]

  it.each(runs)('AC-7913.4·AC-7919.4·AC-7921.2: %s — 오류 답·예외·틀린 답 줄이면 그 오류 번호로 던진다', async (_name, run, code) => {
    await expectFail(run(fakeClient(() => ({ error: RAW_ERROR })).client), code)
    await expectFail(run(fakeClient((call) => ({ ...okReply(call), error: RAW_ERROR })).client), code)
    await expectFail(
      run(
        fakeClient(() => {
          throw new Error(SECRET)
        }).client,
      ),
      code,
    )
  })

  it('AC-7908.2·AC-7913.4: 넣고·고친 뒤 돌려받은 줄 모양이 틀리면 실패로 본다', async () => {
    const wrong = fakeClient((call) => (call.kind === 'table' && call.single ? { data: { id: CAND } } : okReply(call)))
    await expectFail(addCandidate(wrong.client, { name: '역앞', addressNote: '', lat: 37.5, lng: 127, radiusM: 1000 }), 'E-LOC-SAVE-FAILED')
    await expectFail(addNote(wrong.client, CAND, { day: '2026-11-22', body: '메모' }), 'E-LOC-SAVE-FAILED')
    await expectFail(saveScoreRule(wrong.client, rule), 'E-LOC-SAVE-FAILED')
    await expectFail(saveDeptRule(wrong.client, DEFAULT_DEPT_RULE), 'E-LOC-SAVE-FAILED')
  })
})

// 승하차 저장(location_flow_cache, design.md 4·7절, TASK-97): 같은 병원·시군구·달은 한 번 받은 줄을 다음 모으기가 쓴다
describe('readFlowCache · saveFlowCache — 같은 구 승하차는 한 번만 받기(AC-7908.5)', () => {
  const FLOW_ROWS = [
    { id: '4100167', mode: 'bus', board: 12_000, alight: 11_500, days: 30 },
    { id: 'R1', mode: 'rail', board: 90_000, alight: 88_000, days: 31 },
  ] as const
  const KEPT = { asOf: '2026-09-30', rows: FLOW_ROWS.map((r) => ({ ...r })) }
  const flowAnswer = (answer: () => Reply) => (call: Call) => (call.kind === 'table' && call.table === 'location_flow_cache' ? answer() : okReply(call))

  it('AC-7908.5: 시군구·달 한 줄을 as_of·rows만 골라 읽어 { asOf, rows }로 돌려준다', async () => {
    const { client, calls } = fakeClient(flowAnswer(() => ({ data: { as_of: '2026-09-30', rows: FLOW_ROWS } })))
    expect(await readFlowCache(client, '41131', '2026-09')).toEqual(KEPT)
    expect(onlyTable(calls)).toMatchObject({
      table: 'location_flow_cache',
      op: 'select',
      columns: 'as_of, rows',
      single: true,
      filters: [
        ['eq', 'sgg', '41131'],
        ['eq', 'ym', '2026-09'],
      ],
    })
  })

  it('AC-7908.5: 줄 없음·읽기 오류·던짐이면 null이다(모으기가 받아 온다)', async () => {
    const answers: (() => Reply)[] = [
      () => ({ data: null }),
      () => ({ error: RAW_ERROR }),
      () => {
        throw new Error(SECRET)
      },
    ]
    for (const answer of answers) expect(await readFlowCache(fakeClient(flowAnswer(answer)).client, '41131', '2026-09')).toBeNull()
  })

  it('AC-7908.5: 읽은 줄 모양이 틀리면(빈 rows·배열 아님·날짜 아님·틀린 줄 하나) null이다', async () => {
    const row = FLOW_ROWS[0]
    const bad: unknown[] = [
      { as_of: '2026-09-30', rows: [] },
      { as_of: '2026-09-30', rows: { id: 'R1' } },
      { as_of: '2026-9-30', rows: FLOW_ROWS },
      { as_of: null, rows: FLOW_ROWS },
      ...[
        { ...row, mode: 'tram' },
        { ...row, id: '' },
        { ...row, id: 'a b' },
        { ...row, board: -1 },
        { ...row, alight: 1.5 },
        { ...row, board: '12000' },
        { ...row, days: 0 },
        { ...row, days: 32 },
        null,
      ].map((wrong) => ({ as_of: '2026-09-30', rows: [FLOW_ROWS[1], wrong] })),
    ]
    for (const data of bad) expect(await readFlowCache(fakeClient(flowAnswer(() => ({ data }))).client, '41131', '2026-09'), JSON.stringify(data)).toBeNull()
  })

  it('AC-7908.5: 시군구·달 모양이 틀리면 읽지 않고 null이다', async () => {
    for (const [sgg, ym] of [
      ['4113', '2026-09'],
      ['41131', '2026-13'],
      ['41131', '202609'],
    ]) {
      const { client, calls } = fakeClient()
      expect(await readFlowCache(client, sgg, ym)).toBeNull()
      expect(calls).toEqual([])
    }
  })

  it('AC-7908.5: 저장은 칸 넷(sgg·ym·as_of·rows)만 넣고 줄마다 다섯 칸만 새로 만든다(hospital_id는 DB가)', async () => {
    const { client, calls } = fakeClient()
    await saveFlowCache(client, '41131', '2026-09', { asOf: '2026-09-30', rows: [{ ...FLOW_ROWS[0], extra: SECRET } as never, FLOW_ROWS[1]] })
    const call = onlyTable(calls)
    expect(call).toMatchObject({ table: 'location_flow_cache', op: 'insert' })
    expect(call.body).toEqual({ sgg: '41131', ym: '2026-09', as_of: '2026-09-30', rows: FLOW_ROWS })
    expect(Object.keys(call.body as object)).toEqual(['sgg', 'ym', 'as_of', 'rows'])
    expect(JSON.stringify(call.body)).not.toContain(SECRET)
  })

  it('AC-7908.5: 빈 줄·틀린 값·jsonb 1,000,000바이트 넘음은 보내지 않는다', async () => {
    const many = Array.from({ length: 20_000 }, (_, i) => ({ id: `B${i}`, mode: 'bus' as const, board: 100_000, alight: 100_000, days: 30 }))
    const wrong: [string, string, { asOf: string; rows: unknown[] }][] = [
      ['41131', '2026-09', { asOf: '2026-09-30', rows: [] }],
      ['4113', '2026-09', KEPT],
      ['41131', '2026-13', KEPT],
      ['41131', '2026-09', { asOf: '2026-09', rows: KEPT.rows }],
      ['41131', '2026-09', { asOf: '2026-09-30', rows: [{ ...FLOW_ROWS[0], mode: 'tram' }] }],
      ['41131', '2026-09', { asOf: '2026-09-30', rows: many }],
    ]
    for (const [sgg, ym, value] of wrong) {
      const { client, calls } = fakeClient()
      await saveFlowCache(client, sgg, ym, value as never)
      expect(calls, `${sgg} ${ym}`).toEqual([])
    }
  })

  it('AC-7908.5: 넣기 오류(같은 줄 있음 23505 포함)·던짐은 삼킨다(모으기는 그대로)', async () => {
    const answers: (() => Reply)[] = [
      () => ({ error: { ...RAW_ERROR, code: '23505' } }),
      () => ({ error: RAW_ERROR }),
      () => {
        throw new Error(SECRET)
      },
    ]
    for (const answer of answers) await expect(saveFlowCache(fakeClient(flowAnswer(answer)).client, '41131', '2026-09', KEPT)).resolves.toBeUndefined()
  })
})
