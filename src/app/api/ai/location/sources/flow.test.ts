import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SOURCES } from '@/lib/location/sources'
import type { QueryOf, Registry } from '@/types/location'
import { FLOW_PAGES, FLOW_PATHS, FLOW_ROWS, flowBus, flowRail, flowVolume } from './flow'

// 사람 흐름 바깥 자료 읽기(specs/location REQ-7904 AC-7904.1·AC-7904.2, design.md 4절, 조사 4).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/flow/의 견본이다 — TASK-47이 진짜 답(2026-11-22, 서울 종로구)의
// 모양(Response.header.resultCode '200' · body.items.item · 오류는 { Error: { code, message } })으로 고치고
// 시도 '99'·시군구 '99110'·정류장·역 이름은 지어낸 값으로 바꿨다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/flow/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
// 몸통의 part·ym은 TASK-47이 더할 칸이다(query.ts가 아직 모르면 없는 것으로 본다)
const VOLUME_Q = { kind: 'flow-volume', sido: '99', sgg: '99110', ym: '2026-10' } as QueryOf<'flow-volume'>
const part = (n: number) => ({ ...VOLUME_Q, part: n }) as QueryOf<'flow-volume'>
const BUS_Q = { kind: 'flow-bus', sgg: '99110', ym: '2026-10' } as QueryOf<'flow-bus'>
const RAIL_Q = { kind: 'flow-rail', sgg: '99110', ym: '2026-10' } as QueryOf<'flow-rail'>

// 첫 쪽 + 끝 뒤 쪽들(쪽 수만큼 답이 온다 — 서버 경로가 요청 차례대로 넘긴다). 끝 뒤 쪽은 진짜 답처럼 자료 없음(50)
const pages = (first: string, count: number) => [first, ...Array.from({ length: count - 1 }, () => fixture('page-end.json'))]
const V = FLOW_PAGES['flow-volume']
const B = FLOW_PAGES['flow-bus']
const R = FLOW_PAGES['flow-rail']

// 요청 주소를 origin·경로·칸으로 나눈다
const split = (url: string) => {
  const u = new URL(url)
  return { origin: u.origin, path: u.pathname, params: Object.fromEntries(u.searchParams) }
}

describe('AC-7904.1 사람 흐름 세 종류의 모양', () => {
  it('AC-7904.1: 세 종류 모두 공공데이터포털 열쇠이고 출처 id는 종류 이름 그대로 SOURCES에 있다', () => {
    const ids = new Set(SOURCES.map((s) => s.id))
    for (const adapter of [flowVolume, flowBus, flowRail]) {
      expect(adapter.key).toBe('data')
      expect(adapter.src).toBe(adapter.kind)
      expect(ids.has(adapter.src), adapter.src).toBe(true)
    }
    expect([flowVolume.kind, flowBus.kind, flowRail.kind]).toEqual(['flow-volume', 'flow-bus', 'flow-rail'])
  })

  it('AC-7904.1: 읽는 곳 판(Registry)에 종류 이름으로 그대로 들어간다', () => {
    const registry: Registry = { 'flow-volume': flowVolume, 'flow-bus': flowBus, 'flow-rail': flowRail }
    expect(Object.keys(registry)).toEqual(['flow-volume', 'flow-bus', 'flow-rail'])
  })

  it('AC-7904.1: 진짜 주소 — 정류장별 이용량 월별 · 버스정류장 · 도시철도 노선별 경유역(apis.data.go.kr/1613000)', () => {
    expect(FLOW_PATHS).toEqual({
      'flow-volume': '/1613000/TripVolumebyStop/getMonthlyTripVolumebyStop',
      'flow-bus': '/1613000/BusStop/getBusStop',
      'flow-rail': '/1613000/UrbanRailwayLinespecificStation/getUrbanRailwayLinespecificStation',
    })
    expect(FLOW_ROWS).toBe(1000)
    expect(FLOW_PAGES).toEqual({ 'flow-volume': 10, 'flow-bus': 5, 'flow-rail': 3 })
  })
})

describe('AC-7904.1 flow-volume(정류장별 이용량 15142066)', () => {
  it('AC-7904.1: 시도·시군구 번호·운행 연월로 한 묶음 10쪽(쪽마다 1,000줄)을 요청한다 — 주소에 열쇠는 없다', () => {
    const requests = flowVolume.requests(VOLUME_Q)
    expect(requests).toHaveLength(V)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-volume'],
        params: { ctpv_cd: '99', sgg_cd: '99110', opr_ym: '202610', pageNo: String(i + 1), numOfRows: '1000', dataType: 'JSON' },
      })
      expect(req.url.toLowerCase()).not.toContain('servicekey')
    })
  })

  it('AC-7904.1: 묶음 번호(part)가 있으면 그 묶음의 10쪽을 요청한다(part 2 = 21~30쪽)', () => {
    expect(flowVolume.requests(part(2)).map((r) => split(r.url).params.pageNo)).toEqual(
      Array.from({ length: V }, (_, i) => String(21 + i)),
    )
  })

  it('AC-7904.1: 정류장 ID마다 한 줄 — 이용자 유형·시간대 줄의 승차·하차를 더하고 날 수는 그 달 날 수, B = 버스 · T = 도시철도. 기준 날짜는 그 달 말일', () => {
    const got = flowVolume.parse(pages(fixture('volume-page1.json'), V), VOLUME_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: {
        ym: '2026-10',
        total: 5,
        parts: 1,
        rows: [
          { id: '9900001', mode: 'bus', board: 3100, alight: 2910, days: 31 },
          { id: '9900002', mode: 'bus', board: 1000, alight: 1001, days: 31 },
          { id: '9901', mode: 'rail', board: 31000, alight: 29000, days: 31 },
        ],
      },
    })
  })

  it('AC-7904.1: 묶음 수(parts) = 전체 줄 수 ÷ 묶음 1만 줄 올림 — 묶음 번호를 받으면 한도를 넘어도 그 묶음 줄만 돌려준다', () => {
    const many = fixture('volume-one.json').replace('"totalCount": 1', '"totalCount": 41700')
    const got = flowVolume.parse(pages(many, V), part(0), TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: { ym: '2026-10', total: 41700, parts: 5, rows: [{ id: '9900009', mode: 'bus', board: 12, alight: 8, days: 31 }] },
    })
  })

  it('AC-7904.1: 줄이 하나라 item이 목록이 아닌 답도 읽고, 모르는 교통수단 줄은 뺀다', () => {
    expect(flowVolume.parse(pages(fixture('volume-one.json'), V), VOLUME_Q, TODAY)).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: { ym: '2026-10', total: 1, parts: 1, rows: [{ id: '9900009', mode: 'bus', board: 12, alight: 8, days: 31 }] },
    })
    const other = fixture('volume-one.json').replace('"trfc_mns_se_cd": "B"', '"trfc_mns_se_cd": "Z"')
    expect(flowVolume.parse(pages(other, V), VOLUME_Q, TODAY)).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: { ym: '2026-10', total: 1, parts: 1, rows: [] },
    })
  })

  it('AC-7904.1: 2월은 그 해 날 수(윤년 29일)로 나눈다', () => {
    const feb = { ...VOLUME_Q, ym: '2028-02' } as QueryOf<'flow-volume'>
    const got = flowVolume.parse(pages(fixture('volume-one.json'), V), feb, TODAY)
    expect(got.ok && (got.value as { rows: { days: number }[] }).rows[0].days).toBe(29)
  })
})

describe('AC-7904.1 flow-bus(버스정류장 15142032)·flow-rail(도시철도 노선별 경유역 15142034)', () => {
  it('AC-7904.1: flow-bus는 시도·시군구 번호와 운행 일자(그 달 1일)로 5쪽을 요청한다', () => {
    const requests = flowBus.requests(BUS_Q)
    expect(requests).toHaveLength(B)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-bus'],
        params: { ctpv_cd: '99', sgg_cd: '99110', opr_ymd: '20261001', pageNo: String(i + 1), numOfRows: '1000', dataType: 'JSON' },
      })
      expect(req.url.toLowerCase()).not.toContain('servicekey')
    })
  })

  it('AC-7904.1: 몸통에 연월이 없으면 운행 일자 칸 없이 요청한다(사이트가 빠진 칸 52로 답해 failed)', () => {
    const noYm = { kind: 'flow-bus', sgg: '99110' } as QueryOf<'flow-bus'>
    expect(split(flowBus.requests(noYm)[0].url).params).not.toHaveProperty('opr_ymd')
    expect(flowBus.parse(pages(fixture('missing-param.json'), B), noYm, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.1: flow-bus는 정류장 ID·이름(앞뒤 공백 뺌)·ARS 번호를 읽고 빈 ARS·숫자 아닌 ARS(~)는 null, 기준 날짜는 받은 날', () => {
    const got = flowBus.parse(pages(fixture('bus-page1.json'), B), BUS_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        { id: '9900001', name: '가람시장앞', ars: '99001' },
        { id: '9900002', name: '누리 초등학교', ars: null },
        { id: '9900004', name: '별빛마을', ars: null },
      ],
    })
  })

  it('AC-7904.1: flow-rail은 전국 목록(시군구 칸 없음)을 운행 일자로 3쪽 요청하고 역 ID·역 이름(뒤 [노선] 뺌)·노선을 읽는다', () => {
    const requests = flowRail.requests(RAIL_Q)
    expect(requests).toHaveLength(R)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-rail'],
        params: { opr_ymd: '20261001', pageNo: String(i + 1), numOfRows: '1000', dataType: 'JSON' },
      })
    })
    const got = flowRail.parse(pages(fixture('rail-page1.json'), R), RAIL_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        { id: '9901', name: '가람(가람대)', line: '가상1호선' },
        { id: '9902', name: '가람', line: '가상 2호선' },
      ],
    })
  })
})

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답(items 빈 글자 · 자료 없음 50 NO_DATA_FOUND)은 실패가 아니라 빈 목록이다', () => {
    for (const empty of ['empty.json', 'no-data.json']) {
      expect(flowVolume.parse(pages(fixture(empty), V), VOLUME_Q, TODAY), empty).toEqual({
        ok: true,
        asOf: '2026-10-31',
        value: { ym: '2026-10', total: 0, parts: 0, rows: [] },
      })
      expect(flowBus.parse(pages(fixture(empty), B), BUS_Q, TODAY), empty).toEqual({ ok: true, asOf: TODAY, value: [] })
      expect(flowRail.parse(pages(fixture(empty), R), RAIL_Q, TODAY), empty).toEqual({ ok: true, asOf: TODAY, value: [] })
    }
  })

  it('AC-7904.2: 활용신청 안 된 열쇠 답(SERVICE_KEY_IS_NOT_REGISTERED_ERROR, JSON)은 not-applied다', () => {
    const refused = fixture('not-registered.json')
    expect(flowVolume.parse(pages(refused, V), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(flowBus.parse(pages(refused, B), BUS_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(flowRail.parse(pages(refused, R), RAIL_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    // 뒤 쪽 하나만 거절이어도 같다
    const late = [...pages(fixture('volume-page1.json'), V - 1), refused]
    expect(flowVolume.parse(late, VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀린 답 · 오류 코드(51 등) · JSON이 아닌 글 · 뒤 쪽 하나가 틀림은 failed다', () => {
    const failed = { ok: false, code: 'failed' }
    for (const bad of ['bad-shape.json', 'error-code.json', 'missing-param.json']) {
      expect(flowVolume.parse(pages(fixture(bad), V), VOLUME_Q, TODAY), bad).toEqual(failed)
      expect(flowBus.parse(pages(fixture(bad), B), BUS_Q, TODAY), bad).toEqual(failed)
      expect(flowRail.parse(pages(fixture(bad), R), RAIL_Q, TODAY), bad).toEqual(failed)
    }
    expect(flowVolume.parse(pages('<html>점검 중</html>', V), VOLUME_Q, TODAY)).toEqual(failed)
    const lateBad = [...pages(fixture('volume-page1.json'), V - 1), fixture('bad-shape.json')]
    expect(flowVolume.parse(lateBad, VOLUME_Q, TODAY)).toEqual(failed)
  })

  it('AC-7904.2: 칸 값이 틀린 줄(숫자가 아닌 승차 인원 · 빈 노선)은 failed다', () => {
    expect(flowVolume.parse(pages(fixture('volume-bad-row.json'), V), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowRail.parse(pages(fixture('rail-bad-row.json'), R), RAIL_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 받은 답 수가 요청한 쪽 수와 다르면 failed다', () => {
    expect(flowVolume.parse(pages(fixture('volume-page1.json'), V - 1), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowBus.parse([], BUS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 묶음 번호 없이 부른 이용량이 한 묶음(1만 줄)을 넘거나 목록이 쪽 한도를 넘으면 일부만 더하지 않고 failed다', () => {
    expect(flowVolume.parse(pages(fixture('volume-too-many.json'), V), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowBus.parse(pages(fixture('bus-too-many.json'), B), BUS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})
