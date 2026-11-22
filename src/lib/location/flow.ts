import type { Snapshot } from '@/types/location'
import { distM, type LatLng } from './coords'

// 사람 흐름(승하차 인원) 잇기(specs/location AC-7909.6, design.md 4·5·6절, 조사 4). 순수 함수만 둔다.
// 정류장 ID(flow-volume) → 이름(flow-bus·flow-rail) → 좌표 파일(public/location/transit, design.md 5절) →
// 범위 안 정류장·역마다 하루 평균((승차 + 하차) ÷ 날 수, 버림)과 그 합 · 좌표를 못 이은 수.
// 교통카드 찍은 사람 수라 걷는 사람 수와 다르다(화면 글은 requirements '화면 글 기본값')

// ── 바깥 자료 답 모양(app/api/ai/location/sources/flow.ts가 읽어 돌려줌) ──

export type FlowMode = 'bus' | 'rail'
/** flow-volume 한 줄: 정류장(역) ID마다 한 달 승차·하차와 날 수 */
export type FlowVolumeRow = { id: string; mode: FlowMode; board: number; alight: number; days: number }
export type FlowVolume = { ym: string; rows: FlowVolumeRow[] }
/** flow-bus 한 줄: 정류장 ID → 이름·ARS 번호(없으면 null) */
export type FlowBusName = { id: string; name: string; ars: string | null }
/** flow-rail 한 줄: 역 ID → 역 이름·노선 */
export type FlowRailName = { id: string; name: string; line: string }

// ── 좌표 파일 모양(design.md 5절, TASK-30이 만든다) ──

/** transit/index.json: 정류장 좌표 파일이 있는 시군구 */
export type TransitIndex = { asOf: string; sggs: string[] }
/** transit/bus/<시군구 5자리>.json(전국 버스정류장 위치정보 15067528, 정류장 시군구는 동 경계로 나눔) */
export type BusFile = { asOf: string; src: string; stops: { no: string; name: string; ars: string | null; lng: number; lat: number }[] }
/** transit/rail.json(전국도시철도역사정보표준데이터 15013205, KTX·일반 기차역 없음) */
export type RailFile = { asOf: string; src: string; stations: { name: string; line: string; lng: number; lat: number }[] }

// ── 잇기 ──

/** 그날 값 flow 칸의 값(design.md 6절) */
export type FlowValue = Extract<Snapshot['flow'], { ok: true }>['v']

export type FlowInput = {
  at: LatLng
  radiusM: number
  volume: FlowVolume
  busNames: readonly FlowBusName[]
  railNames: readonly FlowRailName[]
  /** 후보 시군구의 정류장 좌표 파일. transit/index.json에 그 시군구가 없으면 null(버스정보시스템 없는 군) */
  bus: BusFile | null
  /** 도시철도역 좌표 파일. 못 받았으면 null(역 줄은 모두 못 이은 수) */
  rail: RailFile | null
}

/** 잇기 결과. outside = 정류장 좌표 파일이 없는 시군구(`이 지역은 자료 없음`) · none = 그 달 승하차 줄이 하나도 없음 */
export type FlowResult = { ok: true; v: FlowValue } | { ok: false; why: 'outside' | 'none' }

/** 역·정류장 목록은 가까운 차례로 이만큼씩까지(합은 범위 안 모두) */
export const FLOW_LIST_MAX = 60
/** 같은 이름 정류장이 여럿이면 모두 이 거리 안에 모여 있을 때만(길 건너 짝) 첫 곳으로 잇는다 */
export const SAME_NAME_M = 200

type Coord = LatLng
const isCoord = (p: { lat: number; lng: number }) => Number.isFinite(p.lat) && Number.isFinite(p.lng)

// 정류장 이름: 공백을 모두 뺀다. ARS 번호: 공백·줄표를 뺀다('99-001' = '99001')
const stopKey = (name: string) => name.replace(/\s+/g, '')
const arsKey = (ars: string | null) => (ars ?? '').replace(/[\s-]+/g, '')
// 역 이름: 괄호 안·공백을 빼고 끝의 '역'을 뺀다('가람역(가람대)' = '가람'). 노선: 공백을 뺀다
const stationKey = (name: string) => name.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').replace(/역$/, '')
const lineKey = (line: string) => line.replace(/\s+/g, '')

// 같은 열쇠의 첫 값만 둔다
function firstBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    const key = keyOf(item)
    if (key !== '' && !map.has(key)) map.set(key, item)
  }
  return map
}

type BusStop = BusFile['stops'][number]

// 이름 → 좌표. 같은 이름이 여럿이면 모두 첫 곳에서 SAME_NAME_M 안일 때만 첫 곳, 아니면 어느 곳인지 몰라 null
function stopsByName(stops: readonly BusStop[]): Map<string, BusStop | null> {
  const groups = new Map<string, BusStop[]>()
  for (const stop of stops) {
    const key = stopKey(stop.name)
    if (key === '') continue
    const group = groups.get(key)
    if (group) group.push(stop)
    else groups.set(key, [stop])
  }
  const out = new Map<string, BusStop | null>()
  for (const [key, group] of groups) out.set(key, group.every((s) => distM(group[0], s) <= SAME_NAME_M) ? group[0] : null)
  return out
}

type Placed = { name: string; line: string; at: Coord }

/** ID → 이름 → 좌표를 잇고 범위 안 역·정류장의 하루 평균 승하차와 합을 낸다 */
export function joinFlow(input: FlowInput): FlowResult {
  if (input.bus === null) return { ok: false, why: 'outside' }
  if (input.volume.rows.length === 0) return { ok: false, why: 'none' }

  const fileStops = input.bus.stops.filter(isCoord)
  const byArs = firstBy(fileStops, (s) => arsKey(s.ars))
  const byStopName = stopsByName(fileStops)
  const busNames = firstBy(input.busNames, (n) => n.id)

  const fileStations = (input.rail?.stations ?? []).filter(isCoord)
  const byStation = firstBy(fileStations, (s) => `${stationKey(s.name)}|${lineKey(s.line)}`)
  const railNames = firstBy(input.railNames, (n) => n.id)

  // 정류장: ARS 번호가 먼저, 없거나 파일에 없으면 이름(공백 뺌) — 정류장 파일이 후보 시군구 것이라 이름은 그 시군구 안에서 찾는다
  const placeStop = (id: string): Placed | null => {
    const named = busNames.get(id)
    if (!named) return null
    const ars = arsKey(named.ars)
    const stop = (ars !== '' ? byArs.get(ars) : undefined) ?? byStopName.get(stopKey(named.name)) ?? null
    return stop ? { name: stop.name, line: '', at: stop } : null
  }
  // 역: 이름(괄호·끝 '역' 뺌)과 노선이 둘 다 맞아야 한다
  const placeStation = (id: string): Placed | null => {
    const named = railNames.get(id)
    if (!named) return null
    const station = byStation.get(`${stationKey(named.name)}|${lineKey(named.line)}`)
    return station ? { name: station.name, line: station.line, at: station } : null
  }

  const stations: FlowValue['stations'] = []
  const stops: FlowValue['stops'] = []
  let total = 0
  let unmatched = 0
  for (const row of input.volume.rows) {
    const placed = row.mode === 'rail' ? placeStation(row.id) : placeStop(row.id)
    if (placed === null) {
      unmatched += 1
      continue
    }
    const dist = distM(input.at, placed.at)
    if (dist > input.radiusM) continue
    const perDay = Math.floor((row.board + row.alight) / row.days)
    total += perDay
    if (row.mode === 'rail') stations.push({ name: placed.name, line: placed.line, distM: dist, perDay })
    else stops.push({ name: placed.name, distM: dist, perDay })
  }

  const nearFirst = <T extends { name: string; distM: number }>(list: T[]) =>
    list.sort((a, b) => a.distM - b.distM || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, FLOW_LIST_MAX)
  return { ok: true, v: { ym: input.volume.ym, stations: nearFirst(stations), stops: nearFirst(stops), total, unmatched } }
}
