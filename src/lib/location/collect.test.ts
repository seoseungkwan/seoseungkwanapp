import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DeptId, DeptRule, Point, Query, QueryKind, QueryOf, QueryReply, Rival, Snapshot } from '@/types/location'
import { COLLECT_LIMIT, ESWT_ITEM, RIVAL_MAX, collect, collectScan, industryParks, type CollectDeps, type CollectProgress } from './collect'
import { EARTH_R, distM, type LatLng } from './coords'
import { DEPTS } from './depts'
import type { BusFile, RailFile, TransitIndex } from './flow'
import { checkQuery } from './query'
import type { DongFile, DongIndex, LngLat } from './regions'
import { SNAPSHOT_KEYS, checkSnapshot } from './snapshot'
import { isSourceId } from './sources'

// 모으기(specs/location TASK-25·58, design.md 4·5·6·8·18·19절, REQ-7908·7921·7922). 바깥 사이트는 부르지 않는다 — 부르는 함수·파일 읽기는 가짜다.
// 지역·이름은 모두 지어낸 것이다

// ── 가짜 세상 ─────────────────────────────────────────────

const NOW = '2026-11-22T03:00:00.000Z' // 한국 2026-11-22 12:00
const AT: LatLng = { lat: 37.5, lng: 127.0 }
const R = 500

const RAD = Math.PI / 180
const M_PER_LAT = EARTH_R * RAD
const r6 = (v: number) => Math.round(v * 1e6) / 1e6
/** from에서 북쪽 north m · 동쪽 east m 옮긴 점(소수 6자리) */
function moved(north: number, east: number, from: LatLng = AT): Point {
  return { lat: r6(from.lat + north / M_PER_LAT), lng: r6(from.lng + east / (M_PER_LAT * Math.cos(from.lat * RAD))) }
}
const d = (p: LatLng, from: LatLng = AT) => distM(from, p)

const square = (w: number, s: number, e: number, n: number): LngLat[][] => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
]

const D1 = '4111151000'
const D2 = '4111152000'
const LOST = '4111159999'

function baseIndex(): DongIndex {
  return {
    asOf: '2026-07-01',
    sidos: [
      {
        code2: '41',
        name: '가람도',
        sggs: [
          { code5: '41111', name: '나래시 다솜구', bbox: [126.99, 37.49, 127.01, 37.51] },
          { code5: '41113', name: '나래시 별빛구', bbox: [127.004, 37.49, 127.03, 37.51] },
          { code5: '41115', name: '나래시 먼구', bbox: [127.2, 37.7, 127.3, 37.8] },
        ],
      },
    ],
  }
}

function baseDongs(): Record<string, DongFile> {
  return {
    '41111': {
      asOf: '2026-07-02',
      dongs: [
        { code10: D1, name: '다솜1동', areaM2: 10_000, center: [126.996, 37.5], rings: square(126.99, 37.49, 127.002, 37.51) },
        { code10: D2, name: '다솜2동', areaM2: 10_000, center: [127.006, 37.5], rings: square(127.002, 37.49, 127.01, 37.51) },
        { code10: LOST, name: '못이은동', areaM2: 10_000, center: [127.009, 37.509], rings: null, unmatched: true },
      ],
    },
    '41113': {
      asOf: '2026-07-02',
      dongs: [{ code10: '4111351000', name: '별빛1동', areaM2: 10_000, center: [127.02, 37.5], rings: square(127.01, 37.49, 127.03, 37.51) }],
    },
  }
}

const S1 = moved(200, -100) // 다솜정류장 — 후보에서 224m · 다솜1동 가운데에서 323m
const S2 = moved(600, 0) // 먼정류장 — 400m 밖
const S3 = moved(0, 300) // 별빛정류장(이웃 시군구 파일) — 후보에서 300m · 다솜2동 가운데에서 229m
const STATION_A = moved(-450, 0) // 가람역 — 범위 안
const STATION_B = moved(-2000, 0) // 나래역

const TRANSIT: TransitIndex = { asOf: '2026-06-01', sggs: ['41111', '41113'] }
function baseBus(): Record<string, BusFile> {
  return {
    '41111': {
      asOf: '2026-06-01',
      src: 'bus-stops',
      stops: [
        { no: 'S1', name: '다솜정류장', ars: '11001', ...S1 },
        { no: 'S2', name: '먼정류장', ars: '11002', ...S2 },
      ],
    },
    '41113': { asOf: '2026-05-01', src: 'bus-stops', stops: [{ no: 'S3', name: '별빛정류장', ars: '22001', ...S3 }] },
  }
}
const RAIL: RailFile = {
  asOf: '2026-06-01',
  src: 'rail-stations',
  stations: [
    { name: '가람역', line: '1호선', ...STATION_A },
    { name: '나래역', line: '2호선', ...STATION_B },
  ],
}

const BASE_BANDS: Record<string, number[]> = {
  [D1]: [10, 20, 30, 40, 50, 60, 70, 80, 90, 5, 1],
  [D2]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}
function popBands(dong: string, ym: string): number[] {
  const base = BASE_BANDS[dong] ?? [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  return base.map((n, i) => (i === 0 ? n + Number(ym.slice(0, 4)) - 2022 : n))
}
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const addBands = (a: readonly number[], b: readonly number[]) => a.map((n, i) => n + b[i])

const WEEK = [[540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 1080], [540, 780], null, null]
const WEEK2 = [[600, 1200], [600, 1200], [600, 1200], [600, 1200], [600, 1200], null, null, null]

// 심평원 의원(지어낸 이름·주소). 점은 심평원 좌표
const T1 = moved(10, 0) // 치과 — 같은 건물
const R1 = moved(25, 0) // 정형외과 — 같은 건물
const I1 = moved(-40, 0) // 내과 — 30m 밖
const K1 = moved(100, 0) // 한의원
const N1 = moved(0, -200) // 신경외과
const R2 = moved(0, 300) // 마취통증·재활
const FAR = moved(0, 900) // 범위 밖 정형외과
type FakeClinic = { ykiho: string; name: string; depts: DeptId[]; doctors: number | null; openedOn: string | null; at: Point; address: string }
const CLINICS: FakeClinic[] = [
  { ykiho: 'Y1', name: '가람정형외과의원', depts: ['ortho'], doctors: 2, openedOn: '2024-03-01', at: R1, address: '가람도 나래시 다솜구 다솜대로 7, 2층' },
  { ykiho: 'Y2', name: '나래마취통증의학과의원', depts: ['pain', 'rehab'], doctors: 1, openedOn: null, at: R2, address: '가람도 나래시 별빛구 별빛로 3' },
  { ykiho: 'Y5', name: '다솜내과의원', depts: ['im'], doctors: 1, openedOn: '2019-05-01', at: I1, address: '가람도 나래시 다솜구 다솜대로 9' },
  { ykiho: 'Y6', name: '별빛신경외과의원', depts: ['ns'], doctors: 3, openedOn: '2020-01-01', at: N1, address: '가람도 나래시 다솜구 다솜대로 30' },
  { ykiho: 'Y8', name: '먼정형외과의원', depts: ['ortho'], doctors: 1, openedOn: '2025-01-01', at: FAR, address: '가람도 나래시 별빛구 먼길 1' },
]
const KOREAN: FakeClinic = { ykiho: 'Y3', name: '다솜한의원', depts: ['korean'], doctors: 1, openedOn: '2010-01-01', at: K1, address: '가람도 나래시 다솜구 다솜대로 11' }
const DENTAL: FakeClinic = { ykiho: 'Y7', name: '가람치과의원', depts: ['dental'], doctors: 1, openedOn: '2015-04-01', at: T1, address: '가람도 나래시 다솜구 다솜대로 7, 1층' }
const CLINIC_IDS = DEPTS.filter((x) => x.dgsbjtCd !== null).map((x) => x.id)
// 카카오 좌표→주소 답에 섞여 온 점(그날 값에 들면 안 된다)
const KAKAO_AT: Point = { lat: 37.432109, lng: 127.123456 }

const ok = (value: unknown, asOf = '2026-11-22'): QueryReply => ({ ok: true, value, src: 'x', asOf })
const FAIL: QueryReply = { ok: false, code: 'failed' }
const places = <T>(items: T[]) => ({ items, capped: false })
/** 의원 목록 답 한 줄(서버 hosp-list 모양): 물은 과목만 depts에 */
const hospItem = (c: FakeClinic, from: Point, depts: DeptId[] = c.depts) => ({ ...c, typeName: '의원', depts, distM: d(c.at, from) })

type Handlers = { [K in QueryKind]?: (q: QueryOf<K>) => QueryReply | Promise<QueryReply> }

function baseHandlers(): Handlers {
  return {
    'k-point': (q) => {
      const east = q.at.lng > 127.002
      return ok({
        road: '가람도 나래시 다솜구 가람로 1',
        jibun: east ? '가람도 나래시 다솜구 별동 5' : '가람도 나래시 다솜구 다솜동 12-3',
        bjd: east ? '4111110200' : '4111110100',
        hjd: east ? D2 : D1,
        at: KAKAO_AT,
        lot: east ? { bcode: '4111110200', main: 5, sub: 0, san: false } : { bcode: '4111110100', main: 12, sub: 3, san: false },
      })
    },
    'pop-age': (q) => ok(q.dongs.map((dong) => ({ dong, bands: popBands(dong, q.ym) })), `${q.ym}-15`),
    household: (q) => ok(q.dongs.map((dong) => ({ dong, households: dong === D1 ? 200 : dong === D2 ? 30 : 5 })), `${q.ym}-15`),
    // 2026-09만 줄이 있다: 1만 줄 묶음 셋(part 0·1·2). 같은 정류장이 두 묶음에 나뉘어 온다
    'flow-volume': (q) => {
      if (q.ym !== '2026-09') return ok({ ym: q.ym, total: 0, parts: 0, rows: [] }, `${q.ym}-30`)
      const parts = [
        [{ id: 'B1', mode: 'bus', board: 1000, alight: 1000, days: 30 }],
        [
          { id: 'B1', mode: 'bus', board: 2000, alight: 2000, days: 30 },
          { id: 'R1', mode: 'rail', board: 9000, alight: 9000, days: 30 },
        ],
        [{ id: 'B9', mode: 'bus', board: 1, alight: 1, days: 1 }],
      ]
      return ok({ ym: q.ym, total: 25_000, parts: 3, rows: parts[q.part ?? 0] ?? [] }, `${q.ym}-30`)
    },
    'flow-bus': () => ok([{ id: 'B1', name: '다솜정류장', ars: '11-001' }]),
    'flow-rail': () => ok([{ id: 'R1', name: '가람역', line: '1호선' }]),
    'apt-trade': (q) =>
      ok({
        deals:
          q.ym === '2026-10'
            ? [
                { bdongName: '다솜동', m2: 84.5, won: 845_000_000, floor: 5, on: '2026-10-03' },
                { bdongName: '먼동', m2: 50, won: 100_000_000, floor: 1, on: '2026-10-04' },
              ]
            : q.ym === '2026-09'
              ? [{ bdongName: '나래읍 별동', m2: 100, won: 500_000_000, floor: 3, on: '2026-09-09' }]
              : q.ym === '2026-04'
                ? [{ bdongName: '다솜동', m2: 10, won: 999_999_999, floor: 1, on: '2026-04-01' }]
                : [],
        capped: false,
      }),
    'biz-trade': (q) =>
      ok({ deals: q.ym === '2026-08' ? [{ bdongName: '다솜동', usage: '제2종근린생활시설', m2: 200, won: 1_000_000_000 }] : [], capped: false }),
    'apt-list': (q) =>
      ok({
        complexes:
          q.bjd === '4111110100'
            ? [
                { code: 'A1', name: '다솜마을1단지', bdongName: '다솜동' },
                { code: 'A2', name: '다솜빌', bdongName: '다솜동' },
              ]
            : [
                { code: 'A3', name: '별동아파트', bdongName: '별동' },
                { code: 'A4', name: '별동주공', bdongName: '별동' },
              ],
        capped: false,
      }),
    'apt-info': (q) =>
      ok(
        q.complex === 'A1'
          ? { code: 'A1', name: '다솜마을1단지', households: 1000, builtYear: 2010, buildings: 10 }
          : q.complex === 'A3'
            ? { code: 'A3', name: '별동아파트', households: 500, builtYear: null, buildings: 5 }
            : q.complex === 'A4'
              ? { code: 'A4', name: '별동주공', households: null, builtYear: 1990, buildings: 3 }
              : null,
      ),
    presale: () =>
      ok({
        items: [
          { name: '다솜 새아파트', households: 800, moveIn: '2027-03', address: '가람도 나래시 다솜구 다솜동 일원' },
          { name: '이번달 입주', households: 50, moveIn: '2026-11', address: '가람도 나래시 다솜구 별동 3' },
          { name: '옛 입주', households: 300, moveIn: '2026-10', address: '가람도 나래시 다솜구 다솜동 1' },
          { name: '먼 아파트', households: 900, moveIn: '2028-01', address: '가람도 나래시 별빛구 먼동 1' },
          { name: '다른 구 같은 동', households: 70, moveIn: '2028-01', address: '가람도 나래시 먼구 다솜동 1' },
          { name: '세대 모름', households: null, moveIn: '2027-01', address: '가람도 나래시 다솜구 별동 2' },
          { name: '날 모름', households: 100, moveIn: null, address: '가람도 나래시 다솜구 별동 2' },
        ],
        capped: false,
      }),
    senior: (q) =>
      ok(
        places(
          q.sggName === '나래시 다솜구'
            ? [
                { name: '다솜경로당', ...moved(100, 0) },
                { name: '둘경로당', ...moved(-100, 100) },
                { name: '먼경로당', ...moved(900, 0) },
              ]
            : [
                { name: '별빛경로당', ...moved(0, 350) },
                { name: '다솜경로당', ...moved(100, 0) },
              ],
        ),
      ),
    gym: (q) =>
      ok(
        places(
          q.sggName === '나래시 다솜구'
            ? [
                { name: '헬스1', status: 'open', ...moved(50, 0) },
                { name: '쉬는헬스', status: 'paused', ...moved(60, 0) },
                { name: '먼헬스', status: 'open', ...moved(0, 2000) },
              ]
            : [],
        ),
      ),
    school: (q) =>
      ok(
        places(
          q.sggName === '나래시 다솜구'
            ? [
                { name: '다솜초', level: '초', ...moved(300, 0) },
                { name: '다솜중', level: '중', ...moved(-300, 0) },
              ]
            : [],
        ),
      ),
    accident: (q) =>
      ok(
        q.sggName === '나래시 다솜구'
          ? {
              year: 2024,
              capped: false,
              items: [
                { name: '사거리', cases: 5, ...moved(10, 10) },
                { name: '고개', cases: 3, ...moved(-200, 0) },
                { name: '먼길', cases: 7, ...moved(3000, 0) },
              ],
            }
          : { year: null, capped: false, items: [] },
      ),
    market: (q) =>
      ok(
        places(
          q.sggName === '나래시 다솜구'
            ? [
                { name: '다솜시장', ...moved(0, 700) },
                { name: '먼시장', ...moved(3000, 0) },
              ]
            : [],
        ),
      ),
    stores: () =>
      ok({
        stores: ['1', '1', '지1', '2', '층 모름'].map((floor, i) => ({ name: `가게${i}`, big: '소매', mid: '약국', floor, at: AT })),
        total: 5,
        capped: false,
        fitness: { gym: 0, pilates: 0 },
        pharmacies: 1,
      }),
    'hosp-list': (q) =>
      ok({
        items:
          q.group === 'clinic'
            ? CLINICS.flatMap((c) => {
                const ds = c.depts.filter((x) => (q.depts as readonly string[]).includes(x))
                return ds.length > 0 ? [hospItem(c, q.at, ds)] : []
              })
            : q.group === 'korean'
              ? [hospItem(KOREAN, q.at)]
              : q.group === 'dental'
                ? [hospItem(DENTAL, q.at)]
                : [],
        capped: false,
      }),
    'hosp-detail': (q) => (q.ykiho === 'Y1' ? ok({ mri: true, ct: false, therapists: 3 }) : q.ykiho === 'Y6' ? ok({ mri: false, ct: true, therapists: null }) : FAIL),
    nonpay: (q) =>
      q.ykiho === 'Y1'
        ? ok({
            rows: [
              { name: '체외충격파(고강도)', won: 80_000 },
              { name: '체외충격파', won: 50_000 },
            ],
            manual: [
              { name: '도수치료 60분', won: 150_000 },
              { name: '도수치료', won: 120_000 },
            ],
          })
        : q.ykiho === 'Y6'
          ? ok({ rows: [], manual: null })
          : FAIL,
    // 진료 시간은 시군구 이름으로 받는다(국립중앙의료원 목록). 점은 그 자료의 점 — 그날 값에는 심평원 점만 남는다
    'hosp-hours': (q) =>
      ok(
        q.sggName === '나래시 다솜구'
          ? [
              { name: '가람 정형외과', at: moved(30, 0), week: WEEK },
              { name: '다른의원', at: R2, week: WEEK },
            ]
          : q.sggName === '나래시 별빛구'
            ? [{ name: '별빛신경외과', at: moved(5, -200), week: WEEK2 }]
            : [],
      ),
    'clinic-license': (q) =>
      ok({
        rows:
          q.event === 'open'
            ? [
                { name: '새정형외과의원', dept: '정형외과', type: '의원', openedOn: '2025-05-01', closedOn: null, address: '', point: moved(100, 0) },
                { name: '먼의원', dept: '내과', type: '의원', openedOn: '2025-06-01', closedOn: null, address: '', point: moved(5000, 0) },
              ]
            : [{ name: '닫은의원', dept: '내과', type: '의원', openedOn: '2015-01-01', closedOn: '2024-01-10', address: '', point: moved(20, 0) }],
        capped: false,
      }),
    'bld-title': () =>
      ok({
        buildings: [
          { pk: 'P1', usage: '제1종근린생활시설', structure: '철근콘크리트구조', above: 5, below: 1, totalM2: 1200.5, approvedOn: '2015-06-30', elevators: 1, parking: 10 },
          { pk: 'P2', usage: '창고시설', structure: '경량철골구조', above: 1, below: 0, totalM2: 50, approvedOn: null, elevators: null, parking: null },
        ],
        capped: false,
      }),
    'bld-floor': () =>
      ok({
        floors: [
          { pk: 'P1', label: '지1', usage: '주차장', m2: 300 },
          { pk: 'P2', label: '1', usage: '창고', m2: 50 },
          { pk: 'P1', label: '1', usage: '의원', m2: 250.25 },
        ],
        capped: false,
      }),
    welfare: (q) =>
      ok(
        { sggName: q.sggNames.join('·'), ym: '2025-12', medical: 300, basic: 500, nearPoor: 200, nearPoorBy: { copay: 100, selfSupport: 50, disabled: 50 } },
        '2025-12-31',
      ),
  }
}

type WorldOptions = {
  handlers?: Handlers
  index?: DongIndex
  dongs?: Record<string, DongFile>
  transit?: TransitIndex
  bus?: Record<string, BusFile>
  deps?: Partial<CollectDeps>
}

function world(opts: WorldOptions = {}) {
  const handlers: Handlers = { ...baseHandlers(), ...opts.handlers }
  const asked: Query[] = []
  const index = opts.index ?? baseIndex()
  const dongs = opts.dongs ?? baseDongs()
  const bus = opts.bus ?? baseBus()
  const deps: CollectDeps = {
    ask: async (q) => {
      asked.push(q)
      const h = handlers[q.kind] as ((q: Query) => QueryReply | Promise<QueryReply>) | undefined
      return h ? h(q) : FAIL
    },
    dongIndex: async () => index,
    dongFile: async (sgg) => dongs[sgg] ?? null,
    transitIndex: async () => opts.transit ?? TRANSIT,
    busFile: async (sgg) => bus[sgg] ?? null,
    railFile: async () => RAIL,
    income: async (sgg) => (sgg === '41111' ? { v: { sggName: '나래시 다솜구', won: 42_000_000, year: 2024 }, asOf: '2025-12-31' } : null),
    industry: async (sgg) => (sgg === '41111' ? { v: { sggName: '나래시 다솜구', employees: 12_000, parks: 3, quarter: '2026-2' }, asOf: '2026-06-30' } : null),
    now: NOW,
    ...opts.deps,
  }
  const askedOf = <K extends QueryKind>(kind: K) => asked.filter((q): q is QueryOf<K> => q.kind === kind)
  return { deps, asked, askedOf }
}

const vOf = <K extends keyof Snapshot>(s: Snapshot, key: K) => {
  const got = s[key] as { ok: boolean; v?: unknown }
  if (!got.ok) throw new Error(`${String(key)} 칸을 못 받았어요: ${JSON.stringify(got)}`)
  return got.v
}
const whyOf = (s: Snapshot, key: (typeof SNAPSHOT_KEYS)[number]) => {
  const got = s[key]
  return got.ok ? 'ok' : got.why
}
const rivalsOf = (s: Snapshot) => vOf(s, 'rivals') as Rival[]
const pick = (lat: number, lng: number): Point => ({ lat, lng })

// 그날 값 안의 점(lat·lng가 둘 다 숫자인 객체) 모두
function pointsIn(v: unknown): Point[] {
  if (Array.isArray(v)) return v.flatMap(pointsIn)
  if (typeof v !== 'object' || v === null) return []
  const o = v as Record<string, unknown>
  const here = typeof o.lat === 'number' && typeof o.lng === 'number' ? [pick(o.lat, o.lng)] : []
  return [...here, ...Object.values(o).flatMap(pointsIn)]
}

/** 차례대로 2개씩(의원 과목 나눠 부르기, TASK-94) */
const pairsOf = <T,>(xs: readonly T[]): T[][] => Array.from({ length: Math.ceil(xs.length / 2) }, (_, i) => xs.slice(i * 2, i * 2 + 2))

// ── 시험 ─────────────────────────────────────────────────

describe('AC-7908.2 collect — 그날 값 모으기', () => {
  it('AC-7908.2: 24칸이 design.md 6절 모양·출처 id·기준 날짜로 채워지고 모양 검사를 지난다', async () => {
    const { deps } = world()
    const s = await collect(AT, R, deps)
    expect(s.v).toBe(1)
    expect(s.at).toBe(NOW)
    expect(s.radiusM).toBe(R)
    expect(SNAPSHOT_KEYS.length).toBe(24)
    expect(checkSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s)
    for (const key of SNAPSHOT_KEYS) {
      expect(s[key].ok, key).toBe(true)
      expect(isSourceId(s[key].src), `${key} ${s[key].src}`).toBe(true)
    }
    expect(Object.fromEntries(SNAPSHOT_KEYS.map((k) => [k, s[k].src]))).toEqual({
      people: 'pop-age',
      trend: 'pop-age',
      flow: 'flow-volume',
      income: 'income',
      aptPrice: 'apt-trade',
      bizPrice: 'biz-trade',
      apts: 'apt-list',
      presale: 'presale',
      seniors: 'senior',
      gyms: 'gym',
      schools: 'school',
      accidents: 'accident',
      industry: 'industry',
      pharmacies: 'stores',
      rivals: 'hosp-list',
      place: 'dongs',
      sggAvg: 'pop-age',
      history: 'clinic-license',
      station: 'rail-stations',
      bus: 'bus-stops',
      market: 'market',
      building: 'building',
      stores: 'stores',
      welfare: 'welfare',
    })
  })

  it('AC-7908.2: 사는 사람은 범위 안 동 몫으로 더하고(못 이은 동은 부르지 않음), 추세는 2022-10부터 해마다 10월', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    const ym = '2026-10'
    expect(vOf(s, 'people')).toEqual({
      total: sum(popBands(D1, ym)) + sum(popBands(D2, ym)),
      bands: addBands(popBands(D1, ym), popBands(D2, ym)),
      households: 230,
      unmatched: 0,
    })
    expect(s.people.ok && s.people.asOf).toBe('2026-10-15')
    expect(vOf(s, 'trend')).toEqual(
      ['2022-10', '2023-10', '2024-10', '2025-10', '2026-10'].map((m) => ({ ym: m, total: sum(popBands(D1, m)) + sum(popBands(D2, m)) })),
    )
    for (const q of askedOf('pop-age')) expect(q.dongs).not.toContain(LOST)
    // 같은 몸통은 한 모으기 안에서 한 번만 부른다
    const keys = askedOf('pop-age').map((q) => `${q.ym}|${q.dongs.join(',')}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('AC-7908.2: 범위 안 동이 못 이은 동이면 세고(unmatched) 그 동은 부르지 않는다 · 지난달 인구가 비면 두 달 전', async () => {
    const dongs = baseDongs()
    dongs['41111'].dongs[1] = { ...dongs['41111'].dongs[1], unmatched: true }
    const { deps, askedOf } = world({
      dongs,
      handlers: { 'pop-age': (q) => ok(q.ym === '2026-10' ? [] : q.dongs.map((dong) => ({ dong, bands: popBands(dong, q.ym) })), `${q.ym}-15`) },
    })
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'people')).toEqual({ total: sum(popBands(D1, '2026-09')), bands: popBands(D1, '2026-09'), households: 200, unmatched: 1 })
    expect(s.people.ok && s.people.asOf).toBe('2026-09-15')
    expect(askedOf('household').map((q) => q.ym)).toContain('2026-09')
    for (const q of askedOf('pop-age')) expect(q.dongs).not.toContain(D2)
  })

  it('AC-7922.1: 사람 흐름은 달마다 part 0을 부르고 답의 parts만큼 1…parts−1을 더 불러 잇는다 · 정류장·역 이름은 그 달(ym)로', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'flow')).toEqual({
      ym: '2026-09',
      stations: [{ name: '가람역', line: '1호선', distM: d(STATION_A), perDay: 600 }],
      stops: [{ name: '다솜정류장', distM: d(S1), perDay: 200 }], // 두 묶음에 나뉜 B1을 더함: (3,000 + 3,000) ÷ 30
      total: 800,
      unmatched: 1,
    })
    expect(s.flow.ok && s.flow.asOf).toBe('2026-09-30')
    expect(askedOf('flow-volume')).toEqual([
      { kind: 'flow-volume', sido: '41', sgg: '41111', ym: '2026-10', part: 0 },
      { kind: 'flow-volume', sido: '41', sgg: '41111', ym: '2026-09', part: 0 },
      { kind: 'flow-volume', sido: '41', sgg: '41111', ym: '2026-09', part: 1 },
      { kind: 'flow-volume', sido: '41', sgg: '41111', ym: '2026-09', part: 2 },
    ])
    // 줄이 없는 달(2026-10)은 이름을 부르지 않는다
    expect(askedOf('flow-bus')).toEqual([{ kind: 'flow-bus', sgg: '41111', ym: '2026-09' }])
    expect(askedOf('flow-rail')).toEqual([{ kind: 'flow-rail', sgg: '41111', ym: '2026-09' }])
  })

  it('AC-7922.1: 묶음이 12개를 넘거나 한 묶음이라도 못 받으면 흐름은 그 까닭이고 나머지 묶음은 부르지 않는다', async () => {
    const many = world({ handlers: { 'flow-volume': (q) => ok({ ym: q.ym, total: 130_000, parts: 13, rows: [{ id: 'B1', mode: 'bus', board: 1, alight: 1, days: 30 }] }, `${q.ym}-30`) } })
    const s = await collect(AT, R, many.deps)
    expect(whyOf(s, 'flow')).toBe('failed')
    expect(many.askedOf('flow-volume').map((q) => q.part)).toEqual([0])

    const broken = world({
      handlers: {
        'flow-volume': (q) =>
          q.part === 1 ? { ok: false, code: 'not-applied' } : ok({ ym: q.ym, total: 20_000, parts: 2, rows: [{ id: 'B1', mode: 'bus', board: 1, alight: 1, days: 30 }] }, `${q.ym}-30`),
      },
    })
    const t = await collect(AT, R, broken.deps)
    expect(whyOf(t, 'flow')).toBe('not-applied')
  })

  it('AC-7908.2: 정류장 좌표 파일이 없는 시군구면 흐름·정류장은 outside이고 흐름 자료를 부르지 않는다', async () => {
    const { deps, askedOf } = world({ transit: { asOf: '2026-06-01', sggs: [] } })
    const s = await collect(AT, R, deps)
    expect(whyOf(s, 'flow')).toBe('outside')
    expect(whyOf(s, 'bus')).toBe('outside')
    expect(askedOf('flow-volume')).toEqual([])
    expect(askedOf('flow-bus')).toEqual([])
  })

  it('AC-7922.4: 가장 가까운 역(좌표 파일의 점 at 포함)과 400m 안 정류장 수는 좌표 파일에서 센다(경계 근처는 이웃 시군구 파일도)', async () => {
    const { deps } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'station')).toEqual({ name: '가람역', line: '1호선', distM: d(STATION_A), at: pick(STATION_A.lat, STATION_A.lng) })
    expect(s.station.ok && s.station.asOf).toBe('2026-06-01')
    expect(vOf(s, 'bus')).toBe(2) // S1(224m) + 이웃 시군구 S3(300m), S2(600m)는 밖
    expect(s.bus.ok && s.bus.asOf).toBe('2026-06-01') // 파일 가운데 가장 새 날짜
  })

  it('AC-7908.2: 실거래는 범위 법정동(표본 점 k-point)만, 지난 6달 ㎡당 평균·건수', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'aptPrice')).toEqual({ perM2: 7_500_000, deals: 2 }) // (10,000,000 + 5,000,000) ÷ 2, 먼동·5월 전은 뺌
    expect(vOf(s, 'bizPrice')).toEqual({ perM2: 5_000_000, deals: 1 })
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    expect(askedOf('apt-trade').map((q) => `${q.sgg}|${q.ym}`).sort()).toEqual(months.map((m) => `41111|${m}`))
    expect(askedOf('biz-trade').map((q) => q.ym).sort()).toEqual(months)
    expect(askedOf('k-point').length).toBeLessThanOrEqual(19)
  })

  it('AC-7908.2: 아파트는 칸이 null인 단지를 거르고, 입주 예정은 지난 입주·범위 밖 동·빈칸을 뺀다', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'apts')).toEqual([
      { name: '다솜마을1단지', households: 1000, builtYear: 2010, bdongName: '다솜동' },
      { name: '별동아파트', households: 500, builtYear: null, bdongName: '별동' },
    ])
    expect(vOf(s, 'presale')).toEqual([
      { name: '이번달 입주', households: 50, moveIn: '2026-11' },
      { name: '다솜 새아파트', households: 800, moveIn: '2027-03' },
    ])
    expect(askedOf('presale')).toEqual([{ kind: 'presale', sidoName: '가람도', from: '2023-11', to: '2026-11' }])
  })

  it('AC-7922.1: 시설·사고는 범위 안만 세고(겹침 한 번, 체력단련장은 영업 중만, 시도 이름도 보냄), 시장은 가장 가까운 곳', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'seniors')).toBe(3)
    expect(vOf(s, 'gyms')).toBe(1)
    expect(vOf(s, 'schools')).toBe(2)
    expect(vOf(s, 'accidents')).toEqual({ spots: 2, cases: 8 })
    expect(vOf(s, 'market')).toEqual({ name: '다솜시장', distM: d(moved(0, 700)) })
    expect(askedOf('senior').map((q) => q.sggName).sort()).toEqual(['나래시 다솜구', '나래시 별빛구'])
    expect(askedOf('accident')).toContainEqual({ kind: 'accident', sidoName: '가람도', sggName: '나래시 다솜구' })
    expect(askedOf('senior').map((q) => q.sggName)).not.toContain('나래시 먼구')
    expect(askedOf('gym')).toEqual(
      expect.arrayContaining([
        { kind: 'gym', sggName: '나래시 다솜구', sidoName: '가람도' },
        { kind: 'gym', sggName: '나래시 별빛구', sidoName: '가람도' },
      ]),
    )
    expect(askedOf('gym').length).toBe(2)
  })

  it('AC-7918.3: 경로당·학교·시장도 시군구마다 시도 이름을 보내고(design.md 17절 10), 보낸 몸통은 모두 checkQuery를 지난다', async () => {
    const { deps, asked, askedOf } = world()
    await collect(AT, R, deps)
    for (const kind of ['senior', 'school', 'market'] as const) {
      const sent = askedOf(kind).sort((a, b) => (a.sggName < b.sggName ? -1 : 1))
      expect(sent, kind).toEqual([
        { kind, sggName: '나래시 다솜구', sidoName: '가람도' },
        { kind, sggName: '나래시 별빛구', sidoName: '가람도' },
      ])
    }
    // 서버 경로가 거절하는 몸통(모르는 칸·범위 밖)을 보내지 않는다
    for (const q of asked) expect(checkQuery(q), q.kind).toEqual(q)
  })

  it('AC-7908.2: 30m 안 가게는 층마다 세고 약국 수(상가정보)도 담는다', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'stores')).toEqual([
      { floor: '지1', count: 1 },
      { floor: '1', count: 2 },
      { floor: '2', count: 1 },
      { floor: '층 모름', count: 1 },
    ])
    expect(vOf(s, 'pharmacies')).toBe(1)
    expect(askedOf('stores')).toEqual([{ kind: 'stores', at: AT, r: 30 }])
  })

  it('AC-7921.5: 의원은 안 보기가 아닌 과목 모두(의원 과목 열아홉 + 치과 + 한의원)를 부르고, 경쟁 과목 의원만 상세·진료 시간·비급여를 붙인다', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(rivalsOf(s)).toEqual([
      { name: '가람치과의원', depts: ['dental'], at: T1, distM: d(T1), sameBuilding: true, address: '가람도 나래시 다솜구 다솜대로 7, 1층', doctors: 1, openedYear: 2015 },
      {
        name: '가람정형외과의원',
        depts: ['ortho'],
        at: R1,
        distM: d(R1),
        sameBuilding: true,
        address: '가람도 나래시 다솜구 다솜대로 7, 2층',
        doctors: 2,
        openedYear: 2024,
        detail: { therapists: 3, mri: true, ct: false, week: WEEK, priced: true, eswt: 50_000, manual: 120_000 },
      },
      { name: '다솜내과의원', depts: ['im'], at: I1, distM: d(I1), sameBuilding: false, address: '', doctors: 1, openedYear: 2019 },
      { name: '다솜한의원', depts: ['korean'], at: K1, distM: d(K1), sameBuilding: false, address: '', doctors: 1, openedYear: 2010 },
      {
        name: '별빛신경외과의원',
        depts: ['ns'],
        at: N1,
        distM: d(N1),
        sameBuilding: false,
        address: '',
        doctors: 3,
        openedYear: 2020,
        // 진료 시간은 이웃 시군구(별빛구) 목록에서 맞춤
        detail: { therapists: null, mri: false, ct: true, week: WEEK2, priced: true, eswt: null, manual: null },
      },
      {
        name: '나래마취통증의학과의원',
        depts: ['pain', 'rehab'],
        at: R2,
        distM: d(R2),
        sameBuilding: false,
        address: '',
        doctors: 1,
        openedYear: null,
        detail: { therapists: null, mri: null, ct: null, week: null, priced: false, eswt: null, manual: null },
      },
    ])
    for (const r of rivalsOf(s)) for (const id of r.depts) expect(DEPTS.map((x) => x.id)).toContain(id)
    // 의원 과목은 차례대로 2과목씩 나눠 부른다(TASK-94)
    expect(askedOf('hosp-list')).toEqual([
      ...pairsOf(CLINIC_IDS).map((depts) => ({ kind: 'hosp-list', at: AT, r: R, group: 'clinic', depts })),
      { kind: 'hosp-list', at: AT, r: R, group: 'dental' },
      { kind: 'hosp-list', at: AT, r: R, group: 'korean' },
    ])
    expect(CLINIC_IDS.length).toBe(19)
    // 상세·비급여는 경쟁 과목(처음 설정: 정형외과·신경외과·마취통증·재활) 의원만, 의원마다 따로(실패한 Y2는 세 번 — TASK-94)
    expect([...new Set(askedOf('hosp-detail').map((q) => q.ykiho))].sort()).toEqual(['Y1', 'Y2', 'Y6'])
    const nonpays = [...new Map(askedOf('nonpay').map((q) => [q.ykiho, q])).values()]
    expect(nonpays.sort((a, b) => (a.ykiho < b.ykiho ? -1 : 1))).toEqual([
      { kind: 'nonpay', ykiho: 'Y1', item: 'SZ084' },
      { kind: 'nonpay', ykiho: 'Y2', item: 'SZ084' },
      { kind: 'nonpay', ykiho: 'Y6', item: 'SZ084' },
    ])
  })

  it('AC-7922.1: 진료 시간은 범위가 닿는 시군구(4곳까지)마다 동 경계 목록 이름으로 부른다', async () => {
    const a = world()
    await collect(AT, R, a.deps)
    expect(a.askedOf('hosp-hours')).toEqual([
      { kind: 'hosp-hours', sidoName: '가람도', sggName: '나래시 다솜구' },
      { kind: 'hosp-hours', sidoName: '가람도', sggName: '나래시 별빛구' },
    ])

    const index = baseIndex()
    const box: [number, number, number, number] = [126.99, 37.49, 127.01, 37.51]
    index.sidos[0].sggs = ['다솜구', '별빛구', '샛별구', '노을구', '바람구'].map((name, i) => ({ code5: `4112${i}`, name: `나래시 ${name}`, bbox: box }))
    const b = world({ index })
    await collect(AT, R, b.deps)
    expect(b.askedOf('hosp-hours').map((q) => q.sggName)).toEqual(['나래시 다솜구', '나래시 별빛구', '나래시 샛별구', '나래시 노을구'])
  })

  it('AC-7922.2: 체외충격파 항목 코드는 SZ084 하나 — 서버 읽는 곳(nonpay.ts)의 값과 같다', () => {
    expect(ESWT_ITEM).toBe('SZ084')
    const server = readFileSync(join(process.cwd(), 'src/app/api/ai/location/sources/nonpay.ts'), 'utf8')
    expect(/export const ESWT_ITEM = '([A-Za-z0-9]+)'/.exec(server)?.[1]).toBe(ESWT_ITEM)
  })

  it('AC-7922.2: 비급여는 가까운 경쟁 의원 20곳까지만 · 의원 목록은 가까운 차례 200곳까지(경쟁 과목 의원은 다 남김)', async () => {
    const around: FakeClinic[] = Array.from({ length: 230 }, (_, i) => ({
      ykiho: `A${i}`,
      name: `둘레내과의원${String(i).padStart(3, '0')}`,
      depts: ['im'],
      doctors: 1,
      openedOn: null,
      at: moved(50 + i, 0),
      address: '가람도 나래시 다솜구 둘레로 1',
    }))
    const rivals: FakeClinic[] = Array.from({ length: 25 }, (_, i) => ({
      ykiho: `B${i}`,
      name: `먼정형외과의원${String(i).padStart(2, '0')}`,
      depts: ['ortho'],
      doctors: 1,
      openedOn: null,
      at: moved(0, 300 + i * 5),
      address: '가람도 나래시 별빛구 먼길 2',
    }))
    const { deps, askedOf } = world({
      handlers: {
        'hosp-list': (q) => ok({ items: q.group === 'clinic' ? [...around, ...rivals].map((c) => hospItem(c, q.at)) : [], capped: false }),
        'hosp-detail': () => ok({ mri: false, ct: false, therapists: null }),
        nonpay: () => ok({ rows: [{ name: '체외충격파', won: 40_000 }], manual: null }),
      },
    })
    const s = await collect(AT, R, deps)
    const list = rivalsOf(s)
    expect(RIVAL_MAX).toBe(200)
    expect(list.length).toBe(200)
    expect(list.map((x) => x.name)).toEqual([...around.slice(0, 175), ...rivals].map((c) => c.name))
    expect(list.filter((x) => x.detail).length).toBe(25)
    expect(askedOf('hosp-detail').length).toBe(25)
    expect(askedOf('nonpay').map((q) => q.ykiho).sort()).toEqual(rivals.slice(0, 20).map((c) => c.ykiho).sort())
    const priced = list.filter((x) => x.detail).map((x) => [x.name, x.detail?.priced, x.detail?.eswt])
    expect(priced).toEqual(rivals.map((c, i) => [c.name, i < 20, i < 20 ? 40_000 : null]))
  })

  it('AC-7921.5: 과목 고르기를 따른다 — 안 보기는 부르지 않고, 한의원을 경쟁으로 고르면 한의원도 상세·비급여를 붙인다', async () => {
    const rule: DeptRule = { v: 1, rival: ['ortho', 'korean'], hide: ['im', 'dental'] }
    const { deps, askedOf } = world({ deps: { deptRule: rule } })
    const s = await collect(AT, R, deps)
    expect(askedOf('hosp-list')).toEqual([
      ...pairsOf(CLINIC_IDS.filter((x) => x !== 'im')).map((depts) => ({ kind: 'hosp-list', at: AT, r: R, group: 'clinic', depts })),
      { kind: 'hosp-list', at: AT, r: R, group: 'korean' },
    ])
    const list = rivalsOf(s)
    expect(list.map((x) => [x.name, x.detail !== undefined])).toEqual([
      ['가람정형외과의원', true],
      ['다솜한의원', true],
      ['별빛신경외과의원', false],
      ['나래마취통증의학과의원', false],
    ])
    // 실패한 곳은 세 번까지 묻는다(TASK-94) — 물은 곳만 본다
    expect([...new Set(askedOf('hosp-detail').map((q) => q.ykiho))].sort()).toEqual(['Y1', 'Y3'])
    expect([...new Set(askedOf('nonpay').map((q) => q.ykiho))].sort()).toEqual(['Y1', 'Y3'])

    // 경쟁 0개: 목록은 받지만 상세·진료 시간·비급여는 부르지 않는다
    const none = world({ deps: { deptRule: { v: 1, rival: [], hide: [] } } })
    const t = await collect(AT, R, none.deps)
    expect(rivalsOf(t).length).toBe(6)
    expect(rivalsOf(t).every((x) => x.detail === undefined)).toBe(true)
    expect(none.askedOf('hosp-detail')).toEqual([])
    expect(none.askedOf('nonpay')).toEqual([])
    expect(none.askedOf('hosp-hours')).toEqual([])
  })

  it('AC-7922.1: 3년 개폐업은 범위가 닿는 시군구마다 주소 앞부분(addr)으로 부르고, 같은 줄은 한 번 · 기간은 이틀 전까지 3년', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'history')).toEqual([
      { kind: 'close', name: '닫은의원', dept: '내과', type: '의원', on: '2024-01-10', distM: d(moved(20, 0)) },
      { kind: 'open', name: '새정형외과의원', dept: '정형외과', type: '의원', on: '2025-05-01', distM: d(moved(100, 0)) },
    ])
    expect(askedOf('clinic-license').map((q) => `${q.event} ${q.from}~${q.to} ${q.addr}`).sort()).toEqual([
      'close 2023-11-21~2026-11-20 가람도 나래시 다솜구',
      'close 2023-11-21~2026-11-20 가람도 나래시 별빛구',
      'open 2023-11-21~2026-11-20 가람도 나래시 다솜구',
      'open 2023-11-21~2026-11-20 가람도 나래시 별빛구',
    ])
  })

  it('AC-7908.2: 아파트 법정동 이름은 공공 답(단지 목록의 읍면동 이름)에서만 담고, 카카오 지번 글의 동 이름은 그날 값 어디에도 없다', async () => {
    const { deps } = world({
      handlers: {
        // 카카오는 지어낸 다른 동 이름을 준다 — 범위 법정동 코드는 같다
        'k-point': (q) => {
          const east = q.at.lng > 127.002
          return ok({
            road: '가람도 나래시 다솜구 가람로 1',
            jibun: east ? '가람도 나래시 다솜구 카카오별동 5' : '가람도 나래시 다솜구 카카오솜동 12-3',
            bjd: east ? '4111110200' : '4111110100',
            hjd: east ? D2 : D1,
            at: KAKAO_AT,
            lot: east ? { bcode: '4111110200', main: 5, sub: 0, san: false } : { bcode: '4111110100', main: 12, sub: 3, san: false },
          })
        },
        'apt-list': (q) =>
          ok({
            complexes:
              q.bjd === '4111110100'
                ? [{ code: 'A1', name: '다솜마을1단지', bdongName: '공공다솜동' }]
                : [
                    { code: 'A3', name: '별동아파트', bdongName: '공공별동' },
                    { code: 'A5', name: '옛답아파트' }, // 칸이 없는 옛 답은 빈 글자
                  ],
            capped: false,
          }),
        'apt-info': (q) => ok({ code: q.complex, name: '', households: 100, builtYear: 2000, buildings: 1 }),
      },
    })
    const s = await collect(AT, R, deps)
    expect((vOf(s, 'apts') as { name: string; bdongName: string }[]).map((a) => [a.name, a.bdongName])).toEqual([
      ['다솜마을1단지', '공공다솜동'],
      ['별동아파트', '공공별동'],
      ['옛답아파트', ''],
    ])
    const text = JSON.stringify(s)
    for (const word of ['카카오솜동', '카카오별동', '카카오']) expect(text, word).not.toContain(word)
  })

  it('AC-7909.3: 3년 개폐업 주소 앞부분은 시도 이름과 시군구 이름이 같으면(세종) 하나만 보낸다', async () => {
    const index: DongIndex = {
      asOf: '2026-07-01',
      sidos: [{ code2: '36', name: '세종특별자치시', sggs: [{ code5: '36110', name: '세종특별자치시', bbox: [126.99, 37.49, 127.03, 37.51] }] }],
    }
    const dongs: Record<string, DongFile> = {
      '36110': {
        asOf: '2026-07-02',
        dongs: [{ code10: '3611051000', name: '다솜동', areaM2: 10_000, center: [127.0, 37.5], rings: square(126.99, 37.49, 127.03, 37.51) }],
      },
    }
    const { deps, askedOf } = world({ index, dongs })
    const s = await collect(AT, R, deps)
    expect(askedOf('clinic-license').map((q) => `${q.event} ${q.addr}`).sort()).toEqual(['close 세종특별자치시', 'open 세종특별자치시'])
    for (const q of askedOf('clinic-license')) expect(checkQuery(q), JSON.stringify(q)).toEqual(q)
    expect(whyOf(s, 'history')).toBe('ok')
  })

  it('AC-7909.3: 3년 개폐업 줄에 업태 글(type)을 남겨 치과의원·한의원을 업태로 가를 수 있다(업태가 없는 옛 답은 빈 글자)', async () => {
    const { deps } = world({
      handlers: {
        'clinic-license': (q) =>
          ok({
            rows:
              q.event === 'open'
                ? [
                    { name: '가람미소의원', dept: '', type: '치과의원', openedOn: '2025-05-01', closedOn: null, address: '', point: moved(100, 0) },
                    { name: '다솜한결의원', dept: '', type: '한의원', openedOn: '2025-04-01', closedOn: null, address: '', point: moved(150, 0) },
                  ]
                : [{ name: '옛답의원', dept: '내과', openedOn: '2015-01-01', closedOn: '2024-01-10', address: '', point: moved(20, 0) }],
            capped: false,
          }),
      },
    })
    const s = await collect(AT, R, deps)
    expect((vOf(s, 'history') as { name: string; type?: string }[]).map((x) => [x.name, x.type])).toEqual([
      ['옛답의원', ''],
      ['가람미소의원', '치과의원'],
      ['다솜한결의원', '한의원'],
    ])
    expect(checkSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('AC-7909.3: 의원 목록 답이 한도에 잘렸으면(capped) rivals에 capped: true를 남긴다 — 잘리지 않았으면 그 칸이 없다', async () => {
    const plainRun = await collect(AT, R, world().deps)
    expect(plainRun.rivals.ok).toBe(true)
    expect('capped' in plainRun.rivals).toBe(false)

    const base = baseHandlers()['hosp-list']!
    const { deps } = world({
      handlers: {
        'hosp-list': async (q) => {
          const reply = await base(q)
          return reply.ok && q.group === 'korean' ? { ...reply, value: { ...(reply.value as object), capped: true } } : reply
        },
      },
    })
    const s = await collect(AT, R, deps)
    expect(s.rivals).toMatchObject({ ok: true, capped: true, src: 'hosp-list' })
    expect(rivalsOf(s).length).toBeGreaterThan(0)
    expect(checkSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('AC-7909.3: 가까운 200곳으로 자른 의원 목록도 capped: true다(조용히 적게 세지 않음)', async () => {
    const around: FakeClinic[] = Array.from({ length: 201 }, (_, i) => ({
      ykiho: `A${i}`,
      name: `둘레내과의원${String(i).padStart(3, '0')}`,
      depts: ['im'],
      doctors: 1,
      openedOn: null,
      at: moved(50 + i, 0),
      address: '가람도 나래시 다솜구 둘레로 1',
    }))
    const { deps } = world({ handlers: { 'hosp-list': (q) => ok({ items: q.group === 'clinic' ? around.map((c) => hospItem(c, q.at)) : [], capped: false }) } })
    const s = await collect(AT, R, deps)
    expect(rivalsOf(s).length).toBe(RIVAL_MAX)
    expect(s.rivals).toMatchObject({ ok: true, capped: true })
  })

  it('AC-7908.2: 건축물대장은 후보 지번으로 부르고 첫째 건물의 pk 층만 골라 합친다(pk는 버림)', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'building')).toEqual({
      usage: '제1종근린생활시설',
      structure: '철근콘크리트구조',
      above: 5,
      below: 1,
      totalM2: 1200.5,
      approvedOn: '2015-06-30',
      elevators: 1,
      parking: 10,
      floors: [
        { label: '지1', usage: '주차장', m2: 300 },
        { label: '1', usage: '의원', m2: 250.25 },
      ],
    })
    const key = { sgg: '41111', bjdong: '10100', bun: '0012', ji: '0003', plat: '0' }
    expect(askedOf('bld-title')).toEqual([{ kind: 'bld-title', ...key }])
    expect(askedOf('bld-floor')).toEqual([{ kind: 'bld-floor', ...key }])
  })

  it('AC-7908.2: 후보 자리에 지번이 없으면 건물은 none이고 건축물대장을 부르지 않는다', async () => {
    const base = baseHandlers()
    const { deps, askedOf } = world({
      handlers: {
        'k-point': async (q) => {
          const reply = await base['k-point']!(q)
          return reply.ok && q.at.lat === AT.lat && q.at.lng === AT.lng ? ok({ ...(reply.value as object), lot: null }) : reply
        },
      },
    })
    const s = await collect(AT, R, deps)
    expect(whyOf(s, 'building')).toBe('none')
    expect(askedOf('bld-title')).toEqual([])
  })

  it('AC-7909.7: 소득·산업단지 고용은 파일 값(후보 시군구), 의료급여는 후보 시군구 이름으로 한 줄 + 그 판 연월 인구', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    expect(vOf(s, 'income')).toEqual({ sggName: '나래시 다솜구', won: 42_000_000, year: 2024 })
    expect(s.income.ok && s.income.asOf).toBe('2025-12-31')
    expect(vOf(s, 'industry')).toEqual({ sggName: '나래시 다솜구', employees: 12_000, parks: 3, quarter: '2026-2' })
    expect(vOf(s, 'welfare')).toEqual({
      sggName: '나래시 다솜구',
      ym: '2025-12',
      medical: 300,
      basic: 500,
      nearPoor: 200,
      population: sum(popBands(D1, '2025-12')) + sum(popBands(D2, '2025-12')),
      basis: null,
    })
    expect(askedOf('welfare')).toEqual([{ kind: 'welfare', sgg: '41111', sidoNames: ['가람도'], sggNames: ['나래시 다솜구'] }])
    expect(askedOf('pop-age').filter((q) => q.ym === '2025-12').flatMap((q) => q.dongs).sort()).toEqual([D1, D2])
  })

  it('AC-7908.2: 의료급여 인구는 그 시군구 모든 행정동을 40개씩 불러 더하고, 못 받으면 population: null', async () => {
    // 45동 시군구(0.001도 네모 9 × 5) — 후보는 그 가운데 한 동에 있다
    const grid: DongFile = {
      asOf: '2026-07-01',
      dongs: Array.from({ length: 45 }, (_, i) => {
        const w = 126.9955 + (i % 9) * 0.001
        const s = 37.4985 + Math.floor(i / 9) * 0.001
        return { code10: `4111150${String(i).padStart(3, '0')}`, name: `칸${i}동`, areaM2: 9_800, center: [w + 0.0005, s + 0.0005] as LngLat, rings: square(w, s, w + 0.001, s + 0.001) }
      }),
    }
    const index: DongIndex = { asOf: '2026-07-01', sidos: [{ code2: '41', name: '가람도', sggs: [{ code5: '41111', name: '나래시 다솜구', bbox: [126.9955, 37.4985, 127.0045, 37.5035] }] }] }
    const codes = grid.dongs.map((x) => x.code10)

    const a = world({ index, dongs: { '41111': grid } })
    const s = await collect(AT, 300, a.deps)
    const welfareAsks = a.askedOf('pop-age').filter((q) => q.ym === '2025-12')
    expect(welfareAsks.map((q) => q.dongs.length).sort((x, y) => y - x)).toEqual([40, 5])
    expect(welfareAsks.flatMap((q) => q.dongs).sort()).toEqual([...codes].sort())
    expect(s.welfare.ok && s.welfare.v.population).toBe(45 * sum(popBands('x', '2025-12')))

    const b = world({
      index,
      dongs: { '41111': grid },
      handlers: { 'pop-age': (q) => (q.ym === '2025-12' ? FAIL : ok(q.dongs.map((dong) => ({ dong, bands: popBands(dong, q.ym) })), `${q.ym}-15`)) },
    })
    const t = await collect(AT, 300, b.deps)
    expect(t.welfare.ok).toBe(true)
    expect(t.welfare.ok && t.welfare.v.population).toBeNull()
  })

  it('AC-7922.3: 판에 없는 새 시군구(제물포구)는 옛 구 묶음 이름으로 찾고 basis를 담으며, 비율 인구는 묶음 새 시군구 행정동 모두의 합', async () => {
    const bbox: [number, number, number, number] = [126.99, 37.49, 127.01, 37.51]
    const index: DongIndex = {
      asOf: '2026-11-01',
      sidos: [
        {
          code2: '28',
          name: '인천광역시',
          sggs: [
            { code5: '28125', name: '제물포구', bbox },
            { code5: '28155', name: '영종구', bbox: [126.4, 37.4, 126.6, 37.6] },
          ],
        },
      ],
    }
    const dongs: Record<string, DongFile> = {
      '28125': {
        asOf: '2026-11-01',
        dongs: [
          { code10: '2812551000', name: '가온동', areaM2: 10_000, center: [126.996, 37.5], rings: square(126.99, 37.49, 127.002, 37.51) },
          { code10: '2812552000', name: '나린동', areaM2: 10_000, center: [127.006, 37.5], rings: square(127.002, 37.49, 127.01, 37.51) },
        ],
      },
      '28155': {
        asOf: '2026-11-01',
        dongs: ['2815551000', '2815552000', '2815553000'].map((code10, i) => ({ code10, name: `섬${i}동`, areaM2: 50_000, center: [126.5, 37.5] as LngLat, rings: square(126.4 + i * 0.05, 37.4, 126.45 + i * 0.05, 37.6) })),
      },
    }
    const { deps, askedOf } = world({ index, dongs })
    const s = await collect(AT, R, deps)
    expect(askedOf('welfare')).toEqual([{ kind: 'welfare', sgg: '28125', sidoNames: ['인천광역시'], sggNames: ['중구', '동구'] }])
    expect(vOf(s, 'welfare')).toEqual({
      sggName: '중구·동구',
      ym: '2025-12',
      medical: 300,
      basic: 500,
      nearPoor: 200,
      population: 5 * sum(popBands('x', '2025-12')),
      basis: '옛 중구·동구',
    })
    expect(askedOf('pop-age').filter((q) => q.ym === '2025-12').flatMap((q) => q.dongs).sort()).toEqual([
      '2812551000',
      '2812552000',
      '2815551000',
      '2815552000',
      '2815553000',
    ])
  })

  it('AC-7922.3: 전남광주통합특별시는 옛 시도 이름(광주광역시·전라남도)으로 찾는다', async () => {
    const index = baseIndex()
    index.sidos[0] = { code2: '12', name: '전남광주통합특별시', sggs: [{ code5: '12110', name: '동구', bbox: [126.99, 37.49, 127.01, 37.51] }] }
    const { deps, askedOf } = world({ index, dongs: { '12110': { ...baseDongs()['41111'] } } })
    const s = await collect(AT, R, deps)
    expect(askedOf('welfare')).toEqual([{ kind: 'welfare', sgg: '12110', sidoNames: ['광주광역시', '전라남도'], sggNames: ['동구'] }])
    expect(s.welfare.ok && s.welfare.v.basis).toBeNull()
  })

  it('AC-7908.2: 의료급여 답에 그 시군구 줄이 없으면 none', async () => {
    const { deps } = world({ handlers: { welfare: () => ok(null, '2025-12-31') } })
    const s = await collect(AT, R, deps)
    expect(whyOf(s, 'welfare')).toBe('none')
  })

  it('AC-7922.4: place는 후보 점의 행정동(동 경계 파일)과 동 경계 목록의 시군구·시도 이름이다', async () => {
    const { deps } = world()
    const s = await collect(AT, R, deps)
    expect(s.place).toEqual({
      ok: true,
      v: { sido: '41', sidoName: '가람도', sgg: '41111', sggName: '나래시 다솜구', dong: D1, dongName: '다솜1동' },
      src: 'dongs',
      asOf: '2026-07-02',
    })
    // 동 경계 밖(시군구 네모 안)이면 동은 null, 어느 시군구에도 없으면 outside
    const outside = await collect(moved(9000, 0), R, world().deps)
    expect(whyOf(outside, 'place')).toBe('outside')
    const dongs = baseDongs()
    dongs['41111'].dongs = dongs['41111'].dongs.map((x) => ({ ...x, rings: null }))
    const t = await collect(AT, R, world({ dongs }).deps)
    expect(t.place.ok && t.place.v).toEqual({ sido: '41', sidoName: '가람도', sgg: '41111', sggName: '나래시 다솜구', dong: null, dongName: null })
  })

  it('AC-7922.4: sggAvg는 후보 시군구 전체의 견줄 값 — 인구는 의료급여 인구와 같은 부름을 나눠 쓴다', async () => {
    const { deps, askedOf } = world()
    const s = await collect(AT, R, deps)
    const ym = '2025-12'
    const centers: LatLng[] = [
      { lat: 37.5, lng: 126.996 },
      { lat: 37.5, lng: 127.006 },
      { lat: 37.509, lng: 127.009 },
    ]
    const stopsAt = (c: LatLng) => [S1, S2, S3].filter((p) => d(p, c) <= 400).length
    const nearestRail = (c: LatLng) => Math.min(d(STATION_A, c), d(STATION_B, c))
    const base = sum(popBands(D1, '2022-10')) + sum(popBands(D2, '2022-10'))
    const last = sum(popBands(D1, '2026-10')) + sum(popBands(D2, '2026-10'))
    expect(s.sggAvg).toEqual({
      ok: true,
      v: {
        sggName: '나래시 다솜구',
        areaM2: 30_000,
        total: sum(popBands(D1, ym)) + sum(popBands(D2, ym)),
        bands: addBands(popBands(D1, ym), popBands(D2, ym)),
        trendPct: Math.trunc(((last - base) * 1000) / base) / 10,
        accidents: 2, // 다솜구 목록 가운데 동 경계 안(먼길은 밖)
        schools: 2,
        seniors: 3,
        gyms: 1, // 영업 중만
        stationM: Math.floor(sum(centers.map(nearestRail)) / 3),
        stops: Math.floor(sum(centers.map(stopsAt)) / 3),
      },
      src: 'pop-age',
      asOf: '2025-12-15',
    })
    expect(s.sggAvg.ok && s.sggAvg.v.trendPct).toBe(1.5)
    // 의료급여 인구와 같은 몸통이라 2025-12는 한 번만
    expect(askedOf('pop-age').filter((q) => q.ym === '2025-12').length).toBe(1)
  })

  it('AC-7908.2: 그날 값의 좌표는 모두 심평원 답·좌표 파일 값이고 카카오 답 값이 아니다(진료 시간 자료의 점도 아님)', async () => {
    const { deps } = world()
    const s = await collect(AT, R, deps)
    const points = pointsIn(JSON.parse(JSON.stringify(s)))
    const allowed = [...CLINICS, KOREAN, DENTAL].map((c) => pick(c.at.lat, c.at.lng)).concat(RAIL.stations.map((x) => pick(x.lat, x.lng)))
    expect(points.length).toBe(7) // 의원 여섯 + 가장 가까운 역
    for (const p of points) expect(allowed).toContainEqual(p)
    expect(points).not.toContainEqual(KAKAO_AT)
    expect(points).not.toContainEqual(moved(30, 0)) // 진료 시간 자료의 점
  })

  it('AC-7908.2: 카카오 답(주소 글·좌표·장소·거리)은 그날 값에 넣지 않고, 장소 찾기·주소 찾기는 부르지 않는다', async () => {
    const { deps, asked } = world()
    const s = await collect(AT, R, deps)
    const text = JSON.stringify(s)
    for (const word of ['가람로', '다솜동 12-3', '별동 5', 'kakao', 'hjd', 'lot', 'road', 'jibun', '4111110100', 'P1', 'pk', 'ykiho', 'Y1', String(KAKAO_AT.lat)]) {
      expect(text, word).not.toContain(word)
    }
    const kinds = new Set(asked.map((q) => q.kind))
    for (const kind of ['k-address', 'k-near', 'k-keyword'] as const) expect(kinds.has(kind), kind).toBe(false)
  })

  it('AC-7908.2: 실패 종류는 ok: false — 열쇠 없음·활용신청 안 됨·던짐은 그 칸만, 파일 값은 그대로', async () => {
    const noKey = world({ deps: { ask: async (q) => ({ ok: false, code: 'no-key', key: q.kind.startsWith('k-') ? 'kakao' : 'data' }) } })
    const s = await collect(AT, R, noKey.deps)
    for (const key of ['people', 'trend', 'flow', 'aptPrice', 'bizPrice', 'apts', 'presale', 'seniors', 'gyms', 'schools', 'accidents', 'pharmacies', 'rivals', 'sggAvg', 'history', 'market', 'building', 'stores', 'welfare'] as const) {
      expect(whyOf(s, key), key).toBe('no-key')
      expect('v' in s[key], key).toBe(false)
    }
    for (const key of ['income', 'industry', 'station', 'bus', 'place'] as const) expect(whyOf(s, key), key).toBe('ok')
    expect(checkSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s)

    const thrown = world({ deps: { ask: async () => Promise.reject(new Error('바깥이 끊겼어요')) } })
    const t = await collect(AT, R, thrown.deps)
    expect(whyOf(t, 'people')).toBe('failed')
    expect(whyOf(t, 'rivals')).toBe('failed')
    expect(whyOf(t, 'station')).toBe('ok')

    const notApplied = world({ handlers: { welfare: () => ({ ok: false, code: 'not-applied' }) } })
    const u = await collect(AT, R, notApplied.deps)
    expect(whyOf(u, 'welfare')).toBe('not-applied')
    expect(whyOf(u, 'people')).toBe('ok')
    // 의료급여를 못 받으면 견줄 값 인구는 가장 새 달로
    expect(u.sggAvg.ok && u.sggAvg.asOf).toBe('2026-10-15')
  })

  it('AC-7908.2: 동 경계 목록을 못 읽으면 지역이 필요한 칸만 failed이고 모으기는 던지지 않는다(의원 목록은 진료 시간 없이 받음)', async () => {
    const { deps, askedOf } = world({ deps: { dongIndex: async () => Promise.reject(new Error('파일 없음')) } })
    const s = await collect(AT, R, deps)
    for (const key of ['people', 'trend', 'flow', 'income', 'industry', 'seniors', 'market', 'bus', 'welfare', 'presale', 'place', 'sggAvg', 'history'] as const)
      expect(whyOf(s, key), key).toBe('failed')
    for (const key of ['rivals', 'building', 'stores', 'station', 'aptPrice', 'apts'] as const) expect(whyOf(s, key), key).toBe('ok')
    expect(rivalsOf(s).find((x) => x.name === '가람정형외과의원')?.detail?.week).toBeNull()
    expect(askedOf('hosp-hours')).toEqual([])
  })

  it(`AC-7908.2: 바깥 부르기는 동시에 ${COLLECT_LIMIT}개까지이고 진행 수(칸 n/24)를 알린다`, async () => {
    const base = world()
    let inFlight = 0
    let most = 0
    const progress: CollectProgress[] = []
    const { deps } = world({
      deps: {
        ask: async (q) => {
          inFlight += 1
          most = Math.max(most, inFlight)
          await new Promise((resolve) => setTimeout(resolve, 1))
          inFlight -= 1
          return base.deps.ask(q)
        },
        onProgress: (p) => progress.push(p),
      },
    })
    await collect(AT, R, deps)
    expect(COLLECT_LIMIT).toBe(4)
    expect(most).toBe(4)
    expect(progress.length).toBe(24)
    expect(progress.map((p) => p.done)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
    expect(progress.every((p) => p.total === 24)).toBe(true)
  })
})

describe('AC-7908.2 카카오 산업단지 찾기 결과 거르기(볼 때만, 그날 값에 넣지 않음)', () => {
  it('AC-7908.2: 산업단지 분류·이름인 곳만 남기고 정류장·식당·관리사무소·같은 이름은 뺀다', () => {
    const p = (name: string, category: string, m: number) => ({ name, category, at: moved(m, 0), distM: m })
    const found = [
      p('가람일반산업단지', '부동산 > 산업단지', 1200),
      p('가람산업단지입구', '교통,수송 > 교통시설 > 버스정류장', 1250),
      p('산업단지식당', '음식점 > 한식', 1300),
      p('나래국가산업단지 관리사무소', '사회,공공기관 > 단체,협회', 1400),
      p('가람일반산업단지', '부동산 > 산업단지', 1500),
      p('다솜농공단지', '부동산 > 산업단지 > 농공단지', 1600),
      p('별빛국가산업단지(별빛공단)', '지역명', 1700),
    ]
    expect(industryParks(found).map((x) => x.name)).toEqual(['가람일반산업단지', '다솜농공단지', '별빛국가산업단지(별빛공단)'])
  })
})

describe('AC-7908.2 collectScan — 동네 훑기 값(동마다, 저장 안 함)', () => {
  it("AC-7908.2: 시군구의 동마다 design.md 8절 '훑기 ○' 세부 값을 낸다(범위 = 그 동, 경쟁 수는 경쟁 과목 의원만)", async () => {
    const { deps, asked, askedOf } = world()
    const scan = await collectScan('41111', deps)
    expect(scan.ok).toBe(true)
    if (!scan.ok) return
    expect(scan.sgg).toBe('41111')
    expect(scan.sggName).toBe('나래시 다솜구')
    expect(scan.at).toBe(NOW)
    const byCode = Object.fromEntries(scan.dongs.map((x) => [x.code10, x]))
    expect(Object.keys(byCode).sort()).toEqual([D1, D2, LOST].sort())

    const ym = '2026-10'
    const trendOf = (dong: string) => ['2022-10', '2023-10', '2024-10', '2025-10', '2026-10'].map((m) => ({ ym: m, total: sum(popBands(dong, m)) }))
    const c1: LatLng = { lat: 37.5, lng: 126.996 }
    const c2: LatLng = { lat: 37.5, lng: 127.006 }
    expect(byCode[D1]).toEqual({
      code10: D1,
      name: '다솜1동',
      unmatched: false,
      facts: {
        areaM2: 10_000,
        people: { total: sum(popBands(D1, ym)), bands: popBands(D1, ym), households: 200 },
        trend: trendOf(D1),
        accidentSpots: 2,
        industryEmployees: 12_000,
        schools: 2,
        seniorCenters: 3,
        gyms: 1,
        rivals: 2, // 정형외과(R1) + 신경외과(N1) — 내과(I1)는 둘레로 보기라 안 셈
        newRivals: 1,
        stationM: Math.min(d(STATION_A, c1), d(STATION_B, c1)),
        stops: 1,
      },
    })
    expect(byCode[D2].facts).toEqual({
      areaM2: 10_000,
      people: { total: sum(popBands(D2, ym)), bands: popBands(D2, ym), households: 30 },
      trend: trendOf(D2),
      accidentSpots: 0,
      industryEmployees: 12_000,
      schools: 0,
      seniorCenters: 0,
      gyms: 0,
      rivals: 1, // 마취통증(R2)
      newRivals: 0,
      stationM: d(STATION_A, c2),
      stops: 1, // 이웃 시군구 파일의 S3
    })
    expect(byCode[LOST].unmatched).toBe(true)
    expect(byCode[LOST].facts.people).toBeNull()

    // 훑기는 후보에서만 쓰는 자료·카카오를 부르지 않는다
    const allowed = new Set<QueryKind>(['pop-age', 'household', 'accident', 'school', 'senior', 'gym', 'hosp-list'])
    for (const q of asked) expect(allowed.has(q.kind), q.kind).toBe(true)
    const list = askedOf('hosp-list')
    // 같은 몸통 규칙: 의원은 안 보기가 아닌 과목 모두(대표 과목을 세려고), 치과·한의원은 경쟁 과목일 때만
    // 의원 과목은 차례대로 2과목씩 나눠 부른다(TASK-94)
    expect(list.map((q) => q.group)).toEqual(pairsOf(CLINIC_IDS).map(() => 'clinic'))
    expect(list.map((q) => q.group === 'clinic' && q.depts)).toEqual(pairsOf(CLINIC_IDS))
    for (const q of list) {
      expect(q.at).toEqual({ lat: 37.5, lng: 127 })
      expect(q.r).toBe(list[0].r)
    }
    expect(list[0].r).toBeGreaterThanOrEqual(d({ lat: 37.49, lng: 126.99 }, { lat: 37.5, lng: 127 }))
    expect(list[0].r).toBeLessThanOrEqual(20_000)
    for (const q of askedOf('pop-age')) expect(q.dongs).not.toContain(LOST)
    expect(askedOf('gym')).toEqual([{ kind: 'gym', sggName: '나래시 다솜구', sidoName: '가람도' }])
    expect(scan.parts.people).toEqual({ ok: true, src: 'pop-age', asOf: '2026-10-15' })
  })

  it('AC-7918.3: 훑기도 경로당·학교에 시도 이름을 보내고, 보낸 몸통은 모두 checkQuery를 지난다', async () => {
    const { deps, asked, askedOf } = world()
    const scan = await collectScan('41111', deps)
    if (!scan.ok) throw new Error('훑기가 실패했어요')
    expect(askedOf('senior')).toEqual([{ kind: 'senior', sggName: '나래시 다솜구', sidoName: '가람도' }])
    expect(askedOf('school')).toEqual([{ kind: 'school', sggName: '나래시 다솜구', sidoName: '가람도' }])
    for (const q of asked) expect(checkQuery(q), q.kind).toEqual(q)
  })

  it('AC-7921.5: 훑기 경쟁 수는 과목 고르기를 따른다 — 한의원만 경쟁이면 한의원 목록만, 경쟁 0개면 부르지 않고 값 없음', async () => {
    const a = world({ deps: { deptRule: { v: 1, rival: ['korean'], hide: [] } } })
    const scan = await collectScan('41111', a.deps)
    if (!scan.ok) throw new Error('훑기가 실패했어요')
    expect(a.askedOf('hosp-list').map((q) => q.group)).toEqual(['korean'])
    expect(scan.dongs.find((x) => x.code10 === D1)?.facts.rivals).toBe(1)
    expect(scan.dongs.find((x) => x.code10 === D2)?.facts.rivals).toBe(0)

    const b = world({ deps: { deptRule: { v: 1, rival: [], hide: [] } } })
    const none = await collectScan('41111', b.deps)
    if (!none.ok) throw new Error('훑기가 실패했어요')
    expect(b.askedOf('hosp-list')).toEqual([])
    for (const dong of none.dongs) expect(dong.facts.rivals).toBeNull()
    expect(none.parts.rivals).toEqual({ ok: false, src: 'hosp-list', why: 'none' })
  })

  it('AC-7908.2: 자료 하나가 실패하면 그 값만 null이고 그 자료 상태에 까닭이 남는다', async () => {
    const progress: CollectProgress[] = []
    const { deps } = world({ handlers: { 'hosp-list': () => ({ ok: false, code: 'no-key', key: 'data' }) }, deps: { onProgress: (p) => progress.push(p) } })
    const scan = await collectScan('41111', deps)
    if (!scan.ok) throw new Error('훑기가 실패했어요')
    for (const dong of scan.dongs) {
      expect(dong.facts.rivals).toBeNull()
      expect(dong.facts.newRivals).toBeNull()
    }
    expect(scan.parts.rivals).toEqual({ ok: false, src: 'hosp-list', why: 'no-key' })
    expect(scan.dongs.find((x) => x.code10 === D1)?.facts.schools).toBe(2)
    expect(progress.at(-1)).toEqual({ done: progress.length, total: progress.length })
  })

  it('AC-7908.2: 동 경계 목록에 없는 시군구는 outside, 파일을 못 읽으면 failed', async () => {
    expect(await collectScan('99999', world().deps)).toEqual({ ok: false, why: 'outside' })
    const broken = world({ deps: { dongFile: async () => Promise.reject(new Error('x')) } })
    expect(await collectScan('41111', broken.deps)).toEqual({ ok: false, why: 'failed' })
  })
})

// 심평원 다시 묻기(design.md 5절, TASK-94 — 사용자 '그냥 시간 상관없이 보이게')
describe('AC-7903.3 심평원은 실패하면 두 번 더(TASK-94)', () => {
  it('AC-7903.3: 상세가 두 번 실패하고 세 번째에 되면 그 값을 붙인다', async () => {
    let n = 0
    const { deps, askedOf } = world({
      handlers: { 'hosp-detail': (q) => (q.ykiho === 'Y1' ? (++n < 3 ? FAIL : ok({ mri: true, ct: false, therapists: 3 })) : FAIL) },
    })
    const s = await collect(AT, R, deps)
    expect(askedOf('hosp-detail').filter((q) => q.ykiho === 'Y1')).toHaveLength(3)
    const y1 = rivalsOf(s).find((x) => x.name === '가람정형외과의원')
    expect(y1?.detail).toMatchObject({ therapists: 3, mri: true, ct: false })
  })

  it('AC-7903.3: 세 번 다 실패하면 세 번만 묻고 그만둔다(심평원 셋 모두)', async () => {
    const { deps, askedOf } = world({ handlers: { 'hosp-detail': () => FAIL, nonpay: () => FAIL } })
    await collect(AT, R, deps)
    for (const kind of ['hosp-detail', 'nonpay'] as const) {
      const per = new Map<string, number>()
      for (const q of askedOf(kind)) per.set(q.ykiho, (per.get(q.ykiho) ?? 0) + 1)
      expect([...per.values()].length, kind).toBeGreaterThan(0)
      for (const [ykiho, times] of per) expect(times, `${kind} ${ykiho}`).toBe(3)
    }
  })

  it('AC-7903.3: 의원 목록이 던지면(실패) 세 번까지 묻는다', async () => {
    let thrown = 0
    const { deps, askedOf } = world({
      handlers: {
        'hosp-list': (q) => {
          if (q.group === 'korean' && thrown++ < 2) throw new Error('x')
          return ok({ items: [], capped: false })
        },
      },
    })
    await collect(AT, R, deps)
    expect(askedOf('hosp-list').filter((q) => q.group === 'korean')).toHaveLength(3)
  })

  it('AC-7903.3: 활용신청 안 됨·열쇠 없음은 다시 묻지 않고, 다른 종류(인구)는 실패해도 한 번', async () => {
    const { deps, askedOf } = world({
      handlers: { 'hosp-detail': () => ({ ok: false, code: 'not-applied' }), nonpay: () => ({ ok: false, code: 'no-key', key: 'data' }), 'pop-age': () => FAIL },
    })
    await collect(AT, R, deps)
    for (const kind of ['hosp-detail', 'nonpay', 'pop-age'] as const) {
      const keys = askedOf(kind).map((q) => JSON.stringify(q))
      expect(keys.length, kind).toBeGreaterThan(0)
      expect(new Set(keys).size, kind).toBe(keys.length)
    }
  })
})
