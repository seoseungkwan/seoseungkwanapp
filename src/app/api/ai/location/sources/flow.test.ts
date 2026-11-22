import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SOURCES } from '@/lib/location/sources'
import type { QueryOf, Registry } from '@/types/location'
import { FLOW_PATHS, FLOW_ROWS, flowBus, flowRail, flowVolume } from './flow'

// 사람 흐름 바깥 자료 읽기(specs/location REQ-7904 AC-7904.1·AC-7904.2, design.md 4절, 조사 4).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/flow/의 지어낸 견본이다(지어낸 시도 '99'·시군구 '99110', 정류장·역 이름도 지어냄).
// 진짜 답 모양(주소·칸 이름)은 확인할 것 6 — TASK-47이 진짜 답으로 견본과 읽는 코드를 함께 고친다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/flow/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
const VOLUME_Q: QueryOf<'flow-volume'> = { kind: 'flow-volume', sido: '99', sgg: '99110', ym: '2026-10' }
const BUS_Q: QueryOf<'flow-bus'> = { kind: 'flow-bus', sgg: '99110' }
const RAIL_Q: QueryOf<'flow-rail'> = { kind: 'flow-rail', sgg: '99110' }

// 첫 쪽 + 빈 쪽들(쪽 수만큼 답이 온다 — 서버 경로가 요청 차례대로 넘긴다)
const pages = (first: string, count: number) => [first, ...Array.from({ length: count - 1 }, () => fixture('page-end.json'))]

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
})

describe('AC-7904.1 flow-volume(정류장별 이용량 15142066)', () => {
  it('AC-7904.1: 시도·시군구 번호·연월로 30쪽(쪽마다 1,000줄)을 apis.data.go.kr에 요청한다 — 주소에 열쇠는 없다', () => {
    const requests = flowVolume.requests(VOLUME_Q)
    expect(requests).toHaveLength(30)
    expect(FLOW_ROWS).toBe(1000)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-volume'],
        params: { ctpvCd: '99', sggCd: '99110', crtrYm: '202610', pageNo: String(i + 1), numOfRows: '1000', _type: 'json' },
      })
      expect(req.url.toLowerCase()).not.toContain('servicekey')
    })
    expect(FLOW_PATHS['flow-volume'].startsWith('/1613000/TripVolumebyStop/')).toBe(true)
  })

  it('AC-7904.1: 정류장 ID마다 한 줄로 읽는다 — 시간대 줄의 승차·하차는 더하고 날 수는 가장 큰 값, 숫자 글자(쉼표)도 받는다. 기준 날짜는 그 달 말일', () => {
    const got = flowVolume.parse(pages(fixture('volume-page1.json'), 30), VOLUME_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: {
        ym: '2026-10',
        rows: [
          { id: '99000001', mode: 'bus', board: 3100, alight: 2910, days: 31 },
          { id: '99000002', mode: 'bus', board: 1000, alight: 1001, days: 31 },
          { id: '99100001', mode: 'rail', board: 31000, alight: 29000, days: 31 },
        ],
      },
    })
  })

  it('AC-7904.1: 줄이 하나라 item이 목록이 아닌 답도 읽는다', () => {
    const got = flowVolume.parse(pages(fixture('volume-one.json'), 30), VOLUME_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-31',
      value: { ym: '2026-10', rows: [{ id: '99000009', mode: 'bus', board: 12, alight: 8, days: 31 }] },
    })
  })
})

describe('AC-7904.1 flow-bus(버스정류장 15142032)·flow-rail(도시철도 노선별 경유역 15142034)', () => {
  it('AC-7904.1: flow-bus는 시군구 번호로 20쪽을 요청한다', () => {
    const requests = flowBus.requests(BUS_Q)
    expect(requests).toHaveLength(20)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-bus'],
        params: { sggCd: '99110', pageNo: String(i + 1), numOfRows: '1000', _type: 'json' },
      })
    })
  })

  it('AC-7904.1: flow-bus는 정류장 ID·이름(앞뒤 공백 뺌)·ARS 번호를 읽고 빈 ARS·없는 칸은 null, 기준 날짜는 받은 날', () => {
    const got = flowBus.parse(pages(fixture('bus-page1.json'), 20), BUS_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        { id: '99000001', name: '가람시장앞', ars: '99001' },
        { id: '99000002', name: '누리 초등학교', ars: null },
        { id: '99000004', name: '별빛마을', ars: null },
      ],
    })
  })

  it('AC-7904.1: flow-rail은 시군구 번호로 5쪽을 요청하고 역 ID·역 이름·노선을 읽는다', () => {
    const requests = flowRail.requests(RAIL_Q)
    expect(requests).toHaveLength(5)
    requests.forEach((req, i) => {
      expect(split(req.url)).toEqual({
        origin: 'https://apis.data.go.kr',
        path: FLOW_PATHS['flow-rail'],
        params: { sggCd: '99110', pageNo: String(i + 1), numOfRows: '1000', _type: 'json' },
      })
    })
    const got = flowRail.parse(pages(fixture('rail-page1.json'), 5), RAIL_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        { id: '99100001', name: '가람역(가람대)', line: '가상1호선' },
        { id: '99100002', name: '가람', line: '가상 2호선' },
      ],
    })
  })
})

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답(items 빈 글자 · 자료 없음 코드 03)은 실패가 아니라 빈 목록이다', () => {
    for (const empty of ['empty.json', 'no-data.json']) {
      expect(flowVolume.parse(pages(fixture(empty), 30), VOLUME_Q, TODAY), empty).toEqual({
        ok: true,
        asOf: '2026-10-31',
        value: { ym: '2026-10', rows: [] },
      })
      expect(flowBus.parse(pages(fixture(empty), 20), BUS_Q, TODAY), empty).toEqual({ ok: true, asOf: TODAY, value: [] })
      expect(flowRail.parse(pages(fixture(empty), 5), RAIL_Q, TODAY), empty).toEqual({ ok: true, asOf: TODAY, value: [] })
    }
  })

  it('AC-7904.2: 활용신청 안 된 열쇠 답(SERVICE_KEY_IS_NOT_REGISTERED_ERROR)은 not-applied다', () => {
    const refused = fixture('not-registered.xml')
    expect(flowVolume.parse(pages(refused, 30), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(flowBus.parse(pages(refused, 20), BUS_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(flowRail.parse(pages(refused, 5), RAIL_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    // 뒤 쪽 하나만 거절이어도 같다
    const late = [...pages(fixture('volume-page1.json'), 29), refused]
    expect(flowVolume.parse(late, VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀린 답 · 오류 코드 · JSON이 아닌 글 · 뒤 쪽 하나가 틀림은 failed다', () => {
    const failed = { ok: false, code: 'failed' }
    for (const bad of ['bad-shape.json', 'error-code.json']) {
      expect(flowVolume.parse(pages(fixture(bad), 30), VOLUME_Q, TODAY), bad).toEqual(failed)
      expect(flowBus.parse(pages(fixture(bad), 20), BUS_Q, TODAY), bad).toEqual(failed)
      expect(flowRail.parse(pages(fixture(bad), 5), RAIL_Q, TODAY), bad).toEqual(failed)
    }
    expect(flowVolume.parse(pages('<html>점검 중</html>', 30), VOLUME_Q, TODAY)).toEqual(failed)
    const lateBad = [...pages(fixture('volume-page1.json'), 29), fixture('bad-shape.json')]
    expect(flowVolume.parse(lateBad, VOLUME_Q, TODAY)).toEqual(failed)
  })

  it('AC-7904.2: 칸 값이 틀린 줄(숫자가 아닌 승차 인원 · 빈 노선)은 failed다', () => {
    expect(flowVolume.parse(pages(fixture('volume-bad-row.json'), 30), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowRail.parse(pages(fixture('rail-bad-row.json'), 5), RAIL_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 받은 답 수가 요청한 쪽 수와 다르면 failed다', () => {
    expect(flowVolume.parse(pages(fixture('volume-page1.json'), 29), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowBus.parse([], BUS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 전체 줄 수가 쪽 한도(쪽 수 × 1,000줄)를 넘으면 일부만 더하지 않고 failed다(design.md 4절)', () => {
    expect(flowVolume.parse(pages(fixture('volume-too-many.json'), 30), VOLUME_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(flowBus.parse(pages(fixture('bus-too-many.json'), 20), BUS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})
