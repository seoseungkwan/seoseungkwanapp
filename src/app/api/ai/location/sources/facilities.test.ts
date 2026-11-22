import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { distM, from5174 } from '@/lib/location/coords'
import { isSourceId } from '@/lib/location/sources'
import type { QueryOf, SiteRequest } from '@/types/location'
import {
  FACILITY_ADAPTERS,
  accidentAdapter,
  gymAdapter,
  marketAdapter,
  schoolAdapter,
  seniorAdapter,
} from './facilities'

// 바깥 자료 — 시설·사고(specs/location REQ-7904, design.md 4절, TASK-22): market·senior·gym·accident·school.
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/facilities/의 지어낸 가짜 응답이다(지어낸 시·도 '가상도'의 '가람구'·'나래구'·'다솜구').
// TASK-47(2026-11-22 진짜 열쇠): gym(15155077)은 진짜 답 모양(대문자 칸·결과 코드 '0'·한 쪽 100줄)으로 고쳤다. 미등록 열쇠 답도 진짜 모양(JSON)이다.
// 표준데이터 넷(market·senior·school·accident)은 열쇠가 활용신청 전이라(미등록 답) 진짜 줄을 못 봤다 — 칸 이름은 그대로 확인 전이다

const fx = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/facilities/${name}`, import.meta.url), 'utf8')
const TODAY = '2026-11-22'

const MARKET: QueryOf<'market'> = { kind: 'market', sggName: '가람구' }
const SENIOR: QueryOf<'senior'> = { kind: 'senior', sggName: '가람구' }
const GYM: QueryOf<'gym'> = { kind: 'gym', sggName: '가람구' }
const ACCIDENT: QueryOf<'accident'> = { kind: 'accident', sidoName: '가상도', sggName: '가람구' }
const SCHOOL: QueryOf<'school'> = { kind: 'school', sggName: '가람구' }

// 요청 하나를 주소(쪽 번호 뺌)와 칸으로 나눈다 — 칸 차례와 퍼센트 인코딩에 매이지 않게
const parts = (r: SiteRequest) => {
  const u = new URL(r.url)
  return { at: `${u.origin}${u.pathname}`, params: Object.fromEntries(u.searchParams) }
}
const pagesOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

// 첫 쪽 + 남은 쪽은 빈 쪽(NODATA·빈 items를 번갈아)
const withEmptyRest = (first: string, pages: number) =>
  [first, ...Array.from({ length: pages - 1 }, (_, i) => fx(i % 2 === 0 ? 'nodata.json' : 'empty-items.json'))]

// 가짜 응답의 전체 건수만 바꾼다(쪽 한도 시험)
const withTotal = (text: string, total: number) => {
  const json = JSON.parse(text) as { response: { body: { totalCount: unknown } } }
  json.response.body.totalCount = String(total)
  return JSON.stringify(json)
}

describe('AC-7904.1 시설·사고 읽는 곳 모양', () => {
  it('AC-7904.1: 다섯 종류(market·senior·gym·accident·school)만 있고, 열쇠는 공공데이터포털, 출처 id는 종류 이름이며 SOURCES에 있다', () => {
    expect(Object.keys(FACILITY_ADAPTERS).sort()).toEqual(['accident', 'gym', 'market', 'school', 'senior'])
    for (const [kind, adapter] of Object.entries(FACILITY_ADAPTERS)) {
      expect(adapter.kind).toBe(kind)
      expect(adapter.key).toBe('data')
      expect(adapter.src).toBe(kind)
      expect(isSourceId(adapter.src)).toBe(true)
    }
  })

  it('AC-7904.1: 역·정류장 종류는 이 묶음에 없다(좌표 파일에서 센다, TASK-30)', () => {
    const kinds: string[] = Object.values(FACILITY_ADAPTERS).map((a) => a.kind)
    for (const station of ['k-near', 'flow-bus', 'flow-rail', 'flow-volume']) expect(kinds).not.toContain(station)
  })
})

describe('AC-7904.1 요청 — 정해 둔 주소·칸, 시군구 이름으로 거름, 정해 둔 쪽 수', () => {
  it('AC-7904.1: market은 전통시장 표준데이터를 3쪽까지, 1,000줄씩, 도로명 주소 칸에 시군구 이름을 넣어 부른다', () => {
    expect(marketAdapter.requests(MARKET).map(parts)).toEqual(
      pagesOf(3).map((pageNo) => ({
        at: 'https://api.data.go.kr/openapi/tn_pubr_public_trdit_mrkt_api',
        params: { pageNo, numOfRows: '1000', type: 'json', rdnmadr: '가람구' },
      })),
    )
  })

  it('AC-7904.1: senior는 마을회관·경로당 표준데이터를 5쪽까지 부른다', () => {
    expect(seniorAdapter.requests(SENIOR).map(parts)).toEqual(
      pagesOf(5).map((pageNo) => ({
        at: 'https://api.data.go.kr/openapi/tn_pubr_public_vill_hall_sen_cent_api',
        params: { pageNo, numOfRows: '1000', type: 'json', rdnmadr: '가람구' },
      })),
    )
  })

  it('AC-7904.1: school은 초중등학교 위치 표준데이터(15021148)를 5쪽까지 부른다', () => {
    expect(schoolAdapter.requests(SCHOOL).map(parts)).toEqual(
      pagesOf(5).map((pageNo) => ({
        at: 'https://api.data.go.kr/openapi/tn_pubr_public_elesch_mskul_lc_api',
        params: { pageNo, numOfRows: '1000', type: 'json', rdnmadr: '가람구' },
      })),
    )
  })

  it('AC-7904.1: accident는 교통사고 다발지역 표준데이터를 시도·시군구 이름 칸으로 5쪽까지 부른다', () => {
    expect(accidentAdapter.requests(ACCIDENT).map(parts)).toEqual(
      pagesOf(5).map((pageNo) => ({
        at: 'https://api.data.go.kr/openapi/tn_pubr_public_acdnt_area_api',
        params: { pageNo, numOfRows: '1000', type: 'json', sidoSggNm: '가상도 가람구' },
      })),
    )
  })

  it('AC-7904.1: gym은 행정안전부 생활_체력단련장업(15155077)을 5쪽까지(한 쪽 100줄이 사이트 한도), 영업 중(01)만, 도로명 주소 칸으로 부른다', () => {
    expect(gymAdapter.requests(GYM).map(parts)).toEqual(
      pagesOf(5).map((pageNo) => ({
        at: 'https://apis.data.go.kr/1741000/fitness_centers/info',
        params: { pageNo, numOfRows: '100', returnType: 'json', 'cond[ROAD_NM_ADDR::LIKE]': '가람구', 'cond[SALS_STTS_CD::EQ]': '01' },
      })),
    )
    // 몸통에 시도 이름이 있으면 '시도 시군구'로 거른다('중구'처럼 여러 시도에 있는 이름)
    const withSido = { ...GYM, sidoName: '가상도' } as QueryOf<'gym'>
    expect(parts(gymAdapter.requests(withSido)[0]).params['cond[ROAD_NM_ADDR::LIKE]']).toBe('가상도 가람구')
  })

  it('AC-7904.1: 요청 주소에 열쇠 칸(serviceKey)을 넣지 않는다 — fetchSource가 싣는다', () => {
    for (const r of [
      ...marketAdapter.requests(MARKET),
      ...seniorAdapter.requests(SENIOR),
      ...schoolAdapter.requests(SCHOOL),
      ...accidentAdapter.requests(ACCIDENT),
      ...gymAdapter.requests(GYM),
    ]) {
      expect(new URL(r.url).protocol).toBe('https:')
      expect([...new URL(r.url).searchParams.keys()].map((k) => k.toLowerCase())).not.toContain('servicekey')
    }
  })
})

describe('AC-7904.1 답 읽기 — 정해 둔 모양 값·기준 날짜', () => {
  it('AC-7904.1: market은 그 시군구 시장의 이름·점(소수 6자리)을 돌려주고, 기준 날짜는 자료 안 데이터기준일자 가운데 가장 새 날이다', () => {
    const got = marketAdapter.parse(withEmptyRest(fx('market-p1.json'), 3), MARKET, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2025-09-25',
      value: {
        items: [
          { name: '하늘별빛시장', lat: 37.510123, lng: 127.005123 },
          { name: '바다오일장', lat: 37.512, lng: 127.015 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: 다른 시군구 줄(가람구로라는 길 이름만 같은 줄 포함), 좌표 (0,0)·빈 좌표, 이름 없는 줄은 뺀다', () => {
    const got = marketAdapter.parse(withEmptyRest(fx('market-p1.json'), 3), MARKET, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    const names = got.value.items.map((i) => i.name)
    expect(names).not.toContain('나래골목시장')
    expect(names).not.toContain('가람구로시장')
    expect(names).not.toContain('좌표없는시장')
    expect(names).not.toContain('빈좌표시장')
    expect(got.value.items).toHaveLength(2)
  })

  it('AC-7904.1: senior는 경로당·마을회관 이름·점이고, 자료에 날짜가 없으면 기준 날짜는 받은 한국 날짜다', () => {
    const got = seniorAdapter.parse(withEmptyRest(fx('senior-p1.json'), 5), SENIOR, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          { name: '하늘동경로당', lat: 37.505, lng: 127.004 },
          { name: '바다마을회관', lat: 37.515555, lng: 127.020001 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: school은 초·중·고만(특수학교·각종학교 뺌), 운영 중인 학교만(폐교 뺌), 급은 초·중·고 글자다', () => {
    const got = schoolAdapter.parse(withEmptyRest(fx('school-p1.json'), 5), SCHOOL, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-03-01',
      value: {
        items: [
          { name: '가람하늘초등학교', level: '초', lat: 37.506, lng: 127.003 },
          { name: '가람바다중학교', level: '중', lat: 37.511, lng: 127.016 },
          { name: '가람별빛고등학교', level: '고', lat: 37.518, lng: 127.012 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: accident는 기준 연도(받은 줄 가운데 가장 새 사고 연도)의 지점만 이름·사고 수·점으로 돌려주고 그 연도를 적는다', () => {
    const got = accidentAdapter.parse(withEmptyRest(fx('accident-p1.json'), 5), ACCIDENT, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2025-09-25',
      value: {
        year: 2024,
        items: [
          { name: '가상도 가람구 하늘동(하늘사거리 부근)', cases: 7, lat: 37.507, lng: 127.006 },
          { name: '가상도 가람구 바다동(바다역 부근)', cases: 5, lat: 37.514, lng: 127.019 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: gym은 영업 중(01) 줄만 open으로 남기고(폐업 줄은 빼고) 다른 시군구 줄도 뺀다, 기준 날짜는 남긴 줄의 데이터 갱신 날 가운데 가장 새 날이다', () => {
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    expect(got.asOf).toBe('2026-11-20')
    expect(got.value.capped).toBe(false)
    expect(got.value.items.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: '하늘튼튼헬스', status: 'open' },
      { name: '바다근력짐', status: 'open' },
    ])
  })
})

describe('AC-7904.4 EPSG:5174 좌표 자료(체력단련장)는 WGS84로 바꿔 돌려준다', () => {
  it('AC-7904.4: 기준점(x 198000, y 451600)이 proj4로 구한 WGS84 점과 5m 안으로 맞고, 소수 6자리다', () => {
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    const first = got.value.items[0]
    expect(distM(first, { lat: 37.56668114, lng: 126.97815021 })).toBeLessThanOrEqual(5)
    expect(Math.round(first.lat * 1e6) / 1e6).toBe(first.lat)
    expect(Math.round(first.lng * 1e6) / 1e6).toBe(first.lng)
  })

  it('AC-7904.4: 줄마다 coords.ts from5174로 바꾼 값 그대로다(좌표 (0,0)·빈 좌표 줄은 뺀다)', () => {
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    expect(got.value.items).toEqual([
      { name: '하늘튼튼헬스', status: 'open', ...from5174(198000, 451600)! },
      { name: '바다근력짐', status: 'open', ...from5174(198150.5, 451720.25)! },
    ])
  })
})

const ALL = [
  { kind: 'market', pages: 3, rows: 1000, run: (texts: string[]) => marketAdapter.parse(texts, MARKET, TODAY) },
  { kind: 'senior', pages: 5, rows: 1000, run: (texts: string[]) => seniorAdapter.parse(texts, SENIOR, TODAY) },
  { kind: 'gym', pages: 5, rows: 100, run: (texts: string[]) => gymAdapter.parse(texts, GYM, TODAY) },
  { kind: 'accident', pages: 5, rows: 1000, run: (texts: string[]) => accidentAdapter.parse(texts, ACCIDENT, TODAY) },
  { kind: 'school', pages: 5, rows: 1000, run: (texts: string[]) => schoolAdapter.parse(texts, SCHOOL, TODAY) },
] as const

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  for (const { kind, pages, run } of ALL) {
    it(`AC-7904.2: ${kind} — 빈 답(NODATA·빈 items)은 실패가 아니라 빈 목록이고, 기준 날짜는 받은 날이다`, () => {
      const got = run(withEmptyRest(fx('nodata.json'), pages))
      expect(got.ok).toBe(true)
      if (!got.ok) return
      expect(got.asOf).toBe(TODAY)
      expect(got.value.items).toEqual([])
      expect(got.value.capped).toBe(false)
    })

    it(`AC-7904.2: ${kind} — 미등록 열쇠 답(진짜 모양 JSON)은 not-applied다`, () => {
      expect(run(withEmptyRest(fx('not-registered.json'), pages))).toEqual({ ok: false, code: 'not-applied' })
      expect(run([...withEmptyRest(fx(`${kind}-p1.json`), pages - 1), fx('not-registered.json')])).toEqual({
        ok: false,
        code: 'not-applied',
      })
    })

    it(`AC-7904.2: ${kind} — JSON이 아닌 답·오류 번호·items 모양 틀림·response 없음은 failed다`, () => {
      for (const bad of ['not-json.html', 'error-code.json', 'bad-items.json', 'no-response.json']) {
        expect(run(withEmptyRest(fx(bad), pages)), bad).toEqual({ ok: false, code: 'failed' })
        expect(run([...withEmptyRest(fx(`${kind}-p1.json`), pages - 1), fx(bad)]), `${bad} (끝 쪽)`).toEqual({
          ok: false,
          code: 'failed',
        })
      }
    })
  }
})

describe('AC-7904.3 여러 쪽 자료는 정해 둔 쪽 수까지만 받고 넘으면 capped', () => {
  for (const { kind, pages, rows, run } of ALL) {
    it(`AC-7904.3: ${kind} — 전체 건수가 ${pages}쪽 × ${rows}줄을 넘으면 capped: true, 딱 맞으면 false다`, () => {
      const over = run(withEmptyRest(withTotal(fx(`${kind}-p1.json`), pages * rows + 1), pages))
      const exact = run(withEmptyRest(withTotal(fx(`${kind}-p1.json`), pages * rows), pages))
      expect(over.ok && over.value.capped).toBe(true)
      expect(exact.ok && exact.value.capped).toBe(false)
      if (over.ok && exact.ok) expect(over.value.items).toEqual(exact.value.items)
    })
  }
})
