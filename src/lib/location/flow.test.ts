import { describe, expect, it } from 'vitest'
import { EARTH_R, distM, type LatLng } from './coords'
import { FLOW_LIST_MAX, joinFlow, type BusFile, type FlowInput, type RailFile } from './flow'

// 사람 흐름 잇기(specs/location AC-7909.6, design.md 4·5·6절, 조사 4): 정류장 ID → 이름(flow-bus·flow-rail) → 좌표 파일 →
// 범위 안 하루 평균(버림)·합·못 이은 수. 좌표 파일(design.md 5절 모양)은 이 시험 안의 지어낸 견본이다(정류장·역·노선 이름 모두 지어냄)

const AT: LatLng = { lat: 37.51, lng: 127.01 }
const R = 500
const M_PER_DEG = (EARTH_R * Math.PI) / 180
// 후보 점에서 북쪽·동쪽으로 m만큼 간 점(소수 6자리)
const north = (m: number): LatLng => ({ lat: Math.round((AT.lat + m / M_PER_DEG) * 1e6) / 1e6, lng: AT.lng })
const east = (m: number): LatLng => ({
  lat: AT.lat,
  lng: Math.round((AT.lng + m / (M_PER_DEG * Math.cos((AT.lat * Math.PI) / 180))) * 1e6) / 1e6,
})
const d = (p: LatLng) => distM(AT, p)

// 가람구(99110) 정류장 좌표 파일 견본(bus/<code5>.json)
const P = {
  market: north(100),
  school: north(250),
  park: north(2000),
  starA: north(300),
  starB: north(330),
  forkNear: north(120),
  forkFar: north(1500),
}
const BUS: BusFile = {
  asOf: '2026-11-09',
  src: 'bus-stops',
  stops: [
    { no: 'GRM0001', name: '가람시장 입구', ars: '99-001', ...P.market },
    { no: 'GRM0002', name: '누리초등학교', ars: null, ...P.school },
    { no: 'GRM0003', name: '하늘공원', ars: '99003', ...P.park },
    // 같은 이름 둘이 30m 사이(길 건너 짝) → 첫 곳
    { no: 'GRM0004', name: '별빛마을', ars: null, ...P.starA },
    { no: 'GRM0005', name: '별빛마을', ars: null, ...P.starB },
    // 같은 이름 둘이 멀리 떨어짐 → 어느 곳인지 몰라 잇지 않는다
    { no: 'GRM0006', name: '두갈래', ars: null, ...P.forkNear },
    { no: 'GRM0007', name: '두갈래', ars: null, ...P.forkFar },
  ],
}
// 도시철도역 좌표 파일 견본(rail.json, 전국 한 파일)
const S = { garam1: east(400), garam2: east(420), far: east(5000) }
const RAIL: RailFile = {
  asOf: '2024-12-31',
  src: 'rail-stations',
  stations: [
    { name: '가람', line: '가상1호선', ...S.garam1 },
    { name: '가람', line: '가상2호선', ...S.garam2 },
    { name: '먼들', line: '가상1호선', ...S.far },
  ],
}

// flow-volume 답(정류장 ID마다 한 줄)
const INPUT: FlowInput = {
  at: AT,
  radiusM: R,
  volume: {
    ym: '2026-10',
    rows: [
      { id: '99000001', mode: 'bus', board: 3100, alight: 2910, days: 31 }, // 6,010 ÷ 31 = 193.8 → 193
      { id: '99000002', mode: 'bus', board: 1000, alight: 1001, days: 31 }, // 2,001 ÷ 31 = 64.5 → 64
      { id: '99000003', mode: 'bus', board: 500, alight: 500, days: 31 }, // 범위 밖
      { id: '99000004', mode: 'bus', board: 310, alight: 0, days: 31 }, // 10
      { id: '99000005', mode: 'bus', board: 99, alight: 99, days: 31 }, // 이름이 두 곳(멀리) → 못 이음
      { id: '99000006', mode: 'bus', board: 99, alight: 99, days: 31 }, // 이름 자료에 없음 → 못 이음
      { id: '99000007', mode: 'bus', board: 99, alight: 99, days: 31 }, // 좌표 파일에 없음 → 못 이음
      { id: '99100001', mode: 'rail', board: 31000, alight: 29000, days: 31 }, // 60,000 ÷ 31 = 1,935.4 → 1,935
      { id: '99100002', mode: 'rail', board: 15000, alight: 15001, days: 30 }, // 30,001 ÷ 30 = 1,000.03 → 1,000
      { id: '99100003', mode: 'rail', board: 9000, alight: 9000, days: 30 }, // 범위 밖
      { id: '99100004', mode: 'rail', board: 9000, alight: 9000, days: 30 }, // 좌표 파일에 없는 역 → 못 이음
    ],
  },
  busNames: [
    { id: '99000001', name: '가람시장앞', ars: '99001' }, // 이름은 달라도 ARS 번호(줄표 뺌)로 잇는다
    { id: '99000002', name: '누리 초등학교', ars: null }, // ARS 없음 → 이름(공백 뺌)으로
    { id: '99000003', name: '하늘공원', ars: '99003' },
    { id: '99000004', name: '별빛마을', ars: null },
    { id: '99000005', name: '두갈래', ars: null },
    { id: '99000007', name: '없는정류장', ars: '99999' },
  ],
  railNames: [
    { id: '99100001', name: '가람역(가람대)', line: '가상1호선' }, // 괄호·'역' 빼고 이름 + 노선
    { id: '99100002', name: '가람', line: '가상 2호선' }, // 노선 글자의 공백은 뺀다
    { id: '99100003', name: '먼들역', line: '가상1호선' },
    { id: '99100004', name: '없는역', line: '가상1호선' },
  ],
  bus: BUS,
  rail: RAIL,
}

describe('AC-7909.6 사람 흐름: 범위 안 역·정류장마다 하루 평균 승하차와 합', () => {
  it('AC-7909.6: ID → 이름 → 좌표로 잇고, 범위 안 역·정류장마다 (승차+하차) ÷ 날 수 버림을 가까운 차례로 적고 모두 더한다', () => {
    expect(joinFlow(INPUT)).toEqual({
      ok: true,
      v: {
        ym: '2026-10',
        stations: [
          { name: '가람', line: '가상1호선', distM: d(S.garam1), perDay: 1935 },
          { name: '가람', line: '가상2호선', distM: d(S.garam2), perDay: 1000 },
        ],
        stops: [
          { name: '가람시장 입구', distM: d(P.market), perDay: 193 },
          { name: '누리초등학교', distM: d(P.school), perDay: 64 },
          { name: '별빛마을', distM: d(P.starA), perDay: 10 },
        ],
        total: 1935 + 1000 + 193 + 64 + 10,
        unmatched: 4,
      },
    })
  })

  it('AC-7909.6: 정류장은 ARS 번호가 먼저다 — ARS가 맞으면 이름이 달라도 잇고, ARS가 없거나 파일에 없으면 이름(공백 뺌)으로 잇는다', () => {
    const got = joinFlow({
      ...INPUT,
      volume: { ym: '2026-10', rows: [{ id: 'A1', mode: 'bus', board: 31, alight: 0, days: 31 }, { id: 'A2', mode: 'bus', board: 62, alight: 0, days: 31 }] },
      busNames: [
        { id: 'A1', name: '누리초등학교', ars: '99-001' }, // 이름은 누리초등학교지만 ARS는 가람시장 입구
        { id: 'A2', name: '누 리 초 등 학 교', ars: '12345' }, // ARS가 파일에 없음 → 이름으로
      ],
    })
    expect(got.ok && got.v.stops).toEqual([
      { name: '가람시장 입구', distM: d(P.market), perDay: 1 },
      { name: '누리초등학교', distM: d(P.school), perDay: 2 },
    ])
  })

  it('AC-7909.6: 같은 이름 정류장이 200m 안에 모여 있으면(길 건너 짝) 첫 곳으로, 멀리 떨어져 있으면 잇지 않고 못 이은 수에 센다', () => {
    const got = joinFlow({
      ...INPUT,
      volume: { ym: '2026-10', rows: [{ id: 'B1', mode: 'bus', board: 31, alight: 31, days: 31 }, { id: 'B2', mode: 'bus', board: 31, alight: 31, days: 31 }] },
      busNames: [
        { id: 'B1', name: '별빛마을', ars: null },
        { id: 'B2', name: '두갈래', ars: null },
      ],
    })
    expect(got).toEqual({
      ok: true,
      v: { ym: '2026-10', stations: [], stops: [{ name: '별빛마을', distM: d(P.starA), perDay: 2 }], total: 2, unmatched: 1 },
    })
  })

  it('AC-7909.6: 역은 이름(괄호·끝 역 뺌)과 노선이 둘 다 맞아야 잇는다 — 이름만 같고 노선이 다르면 못 이음', () => {
    const got = joinFlow({
      ...INPUT,
      volume: { ym: '2026-10', rows: [{ id: 'C1', mode: 'rail', board: 30, alight: 0, days: 30 }, { id: 'C2', mode: 'rail', board: 30, alight: 0, days: 30 }] },
      railNames: [
        { id: 'C1', name: ' 가람 역 ', line: '가상2호선' },
        { id: 'C2', name: '가람역', line: '가상9호선' },
      ],
    })
    expect(got).toEqual({
      ok: true,
      v: { ym: '2026-10', stations: [{ name: '가람', line: '가상2호선', distM: d(S.garam2), perDay: 1 }], stops: [], total: 1, unmatched: 1 },
    })
  })

  it('AC-7909.6: 범위 경계 — 거리가 범위와 같으면 넣고 1m라도 넘으면 뺀다', () => {
    const one: FlowInput = {
      ...INPUT,
      volume: { ym: '2026-10', rows: [{ id: '99000002', mode: 'bus', board: 31, alight: 0, days: 31 }] },
    }
    expect(joinFlow({ ...one, radiusM: d(P.school) })).toMatchObject({ ok: true, v: { total: 1, stops: [{ name: '누리초등학교' }] } })
    expect(joinFlow({ ...one, radiusM: d(P.school) - 1 })).toMatchObject({ ok: true, v: { total: 0, stops: [] } })
  })

  it(`AC-7909.6: 목록은 역·정류장 ${FLOW_LIST_MAX}개씩 가까운 차례까지만, 합은 범위 안 모두를 더한다`, () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ no: `M${i}`, name: `많은정류장${i}`, ars: `8${String(i).padStart(4, '0')}`, ...north(400 - i * 5) }))
    const got = joinFlow({
      ...INPUT,
      bus: { ...BUS, stops: many },
      volume: { ym: '2026-10', rows: many.map((_, i) => ({ id: `M${i}`, mode: 'bus' as const, board: 31, alight: 0, days: 31 })) },
      busNames: many.map((s, i) => ({ id: `M${i}`, name: s.name, ars: s.ars })),
    })
    expect(FLOW_LIST_MAX).toBe(60)
    if (!got.ok) throw new Error('잇기 실패')
    expect(got.v.stops).toHaveLength(60)
    expect(got.v.stops[0].name).toBe('많은정류장69')
    expect(got.v.stops.map((s) => s.distM)).toEqual([...got.v.stops.map((s) => s.distM)].sort((a, b) => a - b))
    expect(got.v.total).toBe(70)
  })

  it('AC-7909.6: 정류장 좌표 파일이 없는 시군구(버스정보시스템 없는 군)는 outside — 화면은 `이 지역은 자료 없음`', () => {
    expect(joinFlow({ ...INPUT, bus: null })).toEqual({ ok: false, why: 'outside' })
  })

  it('AC-7909.6: 그 달 승하차 줄이 하나도 없으면 none(0명으로 적지 않는다), 줄은 있는데 범위 안이 없으면 0명이다', () => {
    expect(joinFlow({ ...INPUT, volume: { ym: '2026-10', rows: [] } })).toEqual({ ok: false, why: 'none' })
    expect(joinFlow({ ...INPUT, radiusM: 10 })).toEqual({
      ok: true,
      v: { ym: '2026-10', stations: [], stops: [], total: 0, unmatched: 4 },
    })
  })

  it('AC-7909.6: 역 좌표 파일을 못 받았으면 역 줄은 못 이은 수에 세고 정류장은 그대로다', () => {
    const got = joinFlow({ ...INPUT, rail: null })
    if (!got.ok) throw new Error('잇기 실패')
    expect(got.v.stations).toEqual([])
    expect(got.v.stops).toHaveLength(3)
    expect(got.v.total).toBe(193 + 64 + 10)
    expect(got.v.unmatched).toBe(3 + 4)
  })
})
