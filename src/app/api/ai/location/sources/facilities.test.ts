import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { distM, from5174 } from '@/lib/location/coords'
import { isSourceId } from '@/lib/location/sources'
import type { QueryOf, SiteRequest } from '@/types/location'
import {
  ACCIDENT_YEAR,
  FACILITY_ADAPTERS,
  accidentAdapter,
  gymAdapter,
  marketAdapter,
  schoolAdapter,
  seniorAdapter,
} from './facilities'

// 바깥 자료 — 시설·사고(specs/location REQ-7904, design.md 4절, TASK-22): market·senior·gym·accident·school.
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/facilities/의 지어낸 가짜 응답이다(지어낸 시·도 '가상도'의 '가람구'·'나래구',
// 같은 이름 시군구가 있는 '다른도'). 2026 행정 개편 시험만 진짜 시도·시군구 이름에 지어낸 동·길·지점 이름을 붙인다.
// TASK-47(2026-11-22 진짜 열쇠): gym(15155077)은 진짜 답 모양(대문자 칸·결과 코드 '0'·한 쪽 100줄·response로 감쌈)이다.
// TASK-57(2026-11-22 활용신청 뒤 진짜 열쇠): 표준데이터 넷(market 15012894·senior 15114136·school 15021148·accident 15029185)을
// 진짜 답 모양으로 고쳤다 — 감싸개 없는 { header, body }, items.item 배열, 빈 답은 결과 03에 body null, 요청 칸은 글자가 딱 같아야만
// 거른다(앞부분·% 안 됨). 그래서 시장은 전국(1,403곳)을 받고, 경로당은 제공기관 이름(instt_nm), 학교는 시도 교육청 이름(cddcNm),
// 사고는 사고 연도(ACDNT_YEAR, 전국 667곳)로 거른 뒤 받은 줄의 주소·지점 이름으로 시군구를 고른다

const fx = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/facilities/${name}`, import.meta.url), 'utf8')
const TODAY = '2026-11-22'

// 표준데이터의 진짜 빈 답·오류 답(감싸개 없음, body null)
const STD_NODATA = '{"header":{"resultCode":"03","resultMsg":"NODATA_ERROR"},"body":null}'
const STD_ERROR = '{"header":{"resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR (rdnmadr)"},"body":null}'

// 경로당·학교는 시도 이름이 있어야 거를 수 있다(query.ts에 선택 칸으로 더할 것 — TASK-57 보고). 지금 모양에는 칸이 없어 바꿔 넣는다
const withSido = <Q extends object>(q: Q, sidoName: string) => ({ ...q, sidoName }) as Q

const MARKET: QueryOf<'market'> = { kind: 'market', sggName: '가람구' }
const SENIOR = withSido<QueryOf<'senior'>>({ kind: 'senior', sggName: '가람구' }, '가상도')
const GYM: QueryOf<'gym'> = { kind: 'gym', sggName: '가람구' }
const ACCIDENT: QueryOf<'accident'> = { kind: 'accident', sidoName: '가상도', sggName: '가람구' }
const SCHOOL = withSido<QueryOf<'school'>>({ kind: 'school', sggName: '가람구' }, '가상도')

// 요청 하나를 주소(쪽 번호 뺌)와 칸으로 나눈다 — 칸 차례와 퍼센트 인코딩에 매이지 않게
const parts = (r: SiteRequest) => {
  const u = new URL(r.url)
  return { at: `${u.origin}${u.pathname}`, params: Object.fromEntries(u.searchParams) }
}
const pagesOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const STD = 'https://api.data.go.kr/openapi'

// 첫 쪽 + 남은 쪽은 빈 쪽(표준데이터는 진짜 빈 답, gym은 감싼 빈 답·빈 items를 번갈아)
const withEmptyRest = (first: string, pages: number, gym = false) => [
  first,
  ...Array.from({ length: pages - 1 }, (_, i) => (gym ? fx(i % 2 === 0 ? 'nodata.json' : 'empty-items.json') : STD_NODATA)),
]

type Json = { response?: { body: Body }; body?: Body }
type Body = { totalCount: unknown; items: { item: Record<string, unknown>[] } }
const bodyOf = (json: Json) => (json.response?.body ?? json.body) as Body

// 가짜 응답의 전체 건수만 바꾼다(쪽 한도 시험)
const withTotal = (text: string, total: number) => {
  const json = JSON.parse(text) as Json
  bodyOf(json).totalCount = total
  return JSON.stringify(json)
}

// 가짜 응답 첫 줄을 본으로 줄을 바꿔 새 답 한 쪽을 만든다(2026 개편 시험)
const rowsLike = (file: string, patches: Record<string, unknown>[]) => {
  const json = JSON.parse(fx(file)) as Json
  const body = bodyOf(json)
  const base = body.items.item[0]
  body.items.item = patches.map((p) => ({ ...base, ...p }))
  body.totalCount = patches.length
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

describe('AC-7904.1 요청 — 정해 둔 주소·칸(글자가 딱 같아야 거르는 칸만), 정해 둔 쪽 수', () => {
  it('AC-7904.1: market은 전통시장 표준데이터를 거르지 않고(주소 칸은 글자가 딱 같아야만 거름, 전국 1,403곳) 3쪽까지 1,000줄씩 부른다 — 시도 이름이 있어도 같다', () => {
    const want = pagesOf(3).map((pageNo) => ({
      at: `${STD}/tn_pubr_public_trdit_mrkt_api`,
      params: { pageNo, numOfRows: '1000', type: 'json' },
    }))
    expect(marketAdapter.requests(MARKET).map(parts)).toEqual(want)
    expect(marketAdapter.requests(withSido(MARKET, '가상도')).map(parts)).toEqual(want)
  })

  it('AC-7904.1: senior는 마을회관·경로당 표준데이터를 제공기관 이름(instt_nm = 시도 + 시군구)으로 2쪽까지 1,000줄씩 부른다', () => {
    expect(seniorAdapter.requests(SENIOR).map(parts)).toEqual(
      pagesOf(2).map((pageNo) => ({
        at: `${STD}/tn_pubr_public_vill_hall_sen_cent_api`,
        params: { pageNo, numOfRows: '1000', type: 'json', instt_nm: '가상도 가람구' },
      })),
    )
  })

  it('AC-7904.1: senior 제공기관 — 일반구는 그 시(시가 냄), 세종처럼 시도 = 시군구면 시도 이름 하나', () => {
    const insttOf = (q: QueryOf<'senior'>) => [...new Set(seniorAdapter.requests(q).map((r) => parts(r).params.instt_nm))]
    expect(insttOf(withSido({ kind: 'senior', sggName: '가람시 하늘구' }, '가상도'))).toEqual(['가상도 가람시'])
    expect(insttOf(withSido({ kind: 'senior', sggName: '세종특별자치시' }, '세종특별자치시'))).toEqual(['세종특별자치시'])
  })

  it('AC-7904.1: senior 2026 행정 개편 — 새 이름과 옛 이름 제공기관을 함께 부른다(인천 새 구 넷 · 전남광주는 구 → 광주광역시, 시·군 → 전라남도)', () => {
    const insttOf = (sidoName: string, sggName: string) =>
      seniorAdapter.requests(withSido<QueryOf<'senior'>>({ kind: 'senior', sggName }, sidoName)).map((r) => parts(r).params)
    const each = (names: string[]) => names.flatMap((instt_nm) => pagesOf(2).map((pageNo) => ({ pageNo, numOfRows: '1000', type: 'json', instt_nm })))
    expect(insttOf('인천광역시', '제물포구')).toEqual(each(['인천광역시 제물포구', '인천광역시 중구', '인천광역시 동구']))
    expect(insttOf('인천광역시', '검단구')).toEqual(each(['인천광역시 검단구', '인천광역시 서구']))
    expect(insttOf('전남광주통합특별시', '서구')).toEqual(each(['전남광주통합특별시 서구', '광주광역시 서구']))
    expect(insttOf('전남광주통합특별시', '목포시')).toEqual(each(['전남광주통합특별시 목포시', '전라남도 목포시']))
    expect(insttOf('경기도', '화성시 만세구')).toEqual(each(['경기도 화성시']))
  })

  it('AC-7904.1: school은 초중등학교 위치 표준데이터(15021148)를 시도 교육청 이름(cddcNm)으로 5쪽까지 1,000줄씩 부른다(전남광주도 새 이름 교육청)', () => {
    expect(schoolAdapter.requests(SCHOOL).map(parts)).toEqual(
      pagesOf(5).map((pageNo) => ({
        at: `${STD}/tn_pubr_public_elesch_mskul_lc_api`,
        params: { pageNo, numOfRows: '1000', type: 'json', cddcNm: '가상도교육청' },
      })),
    )
    const merged = withSido<QueryOf<'school'>>({ kind: 'school', sggName: '서구' }, '전남광주통합특별시')
    expect(parts(schoolAdapter.requests(merged)[0]).params.cddcNm).toBe('전남광주통합특별시교육청')
  })

  it('AC-7904.1: senior·school은 시도 이름이 없으면 부르지 않고(거를 칸이 없어 전국 앞쪽만 받게 됨) failed다', () => {
    expect(seniorAdapter.requests({ kind: 'senior', sggName: '가람구' })).toEqual([])
    expect(schoolAdapter.requests({ kind: 'school', sggName: '가람구' })).toEqual([])
    expect(seniorAdapter.parse([], { kind: 'senior', sggName: '가람구' }, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(schoolAdapter.parse([], { kind: 'school', sggName: '가람구' }, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.1: accident는 교통사고 다발지역 표준데이터를 사고 연도(ACDNT_YEAR)로만 걸러 전국을 2쪽까지 500줄씩 부른다(한 줄 2.4KB — 한 쪽 2MB 안)', () => {
    expect(ACCIDENT_YEAR).toBe(2024)
    expect(accidentAdapter.requests(ACCIDENT).map(parts)).toEqual(
      pagesOf(2).map((pageNo) => ({
        at: `${STD}/tn_pubr_public_acdnt_area_api`,
        params: { pageNo, numOfRows: '500', type: 'json', ACDNT_YEAR: '2024' },
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
    expect(parts(gymAdapter.requests(withSido(GYM, '가상도'))[0]).params['cond[ROAD_NM_ADDR::LIKE]']).toBe('가상도 가람구')
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

describe('AC-7904.1 답 읽기 — 진짜 답 모양(감싸개 없는 header·body, items.item) 값·기준 날짜', () => {
  it('AC-7904.1: market은 그 시군구 시장의 이름·점(소수 6자리)을 돌려주고(도로명이 비면 지번 주소로), 기준 날짜는 남긴 줄의 데이터기준일자 가운데 가장 새 날이다', () => {
    const got = marketAdapter.parse(withEmptyRest(fx('market-p1.json'), 3), withSido(MARKET, '가상도'), TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-11-09',
      value: {
        items: [
          { name: '하늘별빛시장', lat: 37.510123, lng: 127.005123 },
          { name: '바다오일장', lat: 37.512, lng: 127.015 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: market은 다른 시군구 줄(가람구로라는 길 이름만 같은 줄 포함), 빈 좌표·(0,0), 이름 없는 줄을 빼고, 시도 이름이 있으면 다른 시도의 같은 이름 시군구도 뺀다', () => {
    const names = (q: QueryOf<'market'>) => {
      const got = marketAdapter.parse(withEmptyRest(fx('market-p1.json'), 3), q, TODAY)
      if (!got.ok) throw new Error('읽기 실패')
      return got.value.items.map((i) => i.name)
    }
    expect(names(MARKET)).toEqual(['하늘별빛시장', '바다오일장', '다른도가람시장'])
    expect(names(withSido(MARKET, '가상도'))).toEqual(['하늘별빛시장', '바다오일장'])
  })

  it('AC-7904.1: senior는 영업 중인 경로당·마을회관 이름·점이고(폐업·다른 시군구·빈 좌표 뺌), 기준 날짜는 남긴 줄의 데이터기준일자(crtrYmd) 가운데 가장 새 날이다', () => {
    const got = seniorAdapter.parse(withEmptyRest(fx('senior-p1.json'), 2), SENIOR, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-15',
      value: {
        items: [
          { name: '하늘동경로당', lat: 37.505, lng: 127.004 },
          { name: '바다마을회관', lat: 37.515555, lng: 127.020001 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: senior 줄에 날짜가 없으면 기준 날짜는 받은 한국 날짜다', () => {
    const noDate = rowsLike('senior-p1.json', [{ crtrYmd: '' }])
    const got = seniorAdapter.parse(withEmptyRest(noDate, 2), SENIOR, TODAY)
    expect(got.ok && got.asOf).toBe(TODAY)
  })

  it('AC-7904.1: school은 초·중·고만(특수학교·각종학교 뺌), 운영 중인 학교만(폐교 뺌), 그 시군구만, 급은 초·중·고 글자다', () => {
    const got = schoolAdapter.parse(withEmptyRest(fx('school-p1.json'), 5), SCHOOL, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2026-10-01',
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

  it('AC-7904.1: accident는 그 시도·시군구(시도시군구 칸 끝 번호 뺌) 기준 연도 지점만 지점 이름(acdntAreaLcNm)·발생 건수(occrrncCo)·점으로 돌려주고 그 연도를 적는다', () => {
    const got = accidentAdapter.parse(withEmptyRest(fx('accident-p1.json'), 2), ACCIDENT, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: '2025-09-24',
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
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5, true), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    expect(got.asOf).toBe('2026-11-20')
    expect(got.value.capped).toBe(false)
    expect(got.value.items.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: '하늘튼튼헬스', status: 'open' },
      { name: '바다근력짐', status: 'open' },
    ])
  })
})

describe('AC-7904.1 2026 행정 개편 — 옛 이름으로 적힌 줄도 찾는다(design.md 5절)', () => {
  const spot = (ctprvnSignguNm: string, acdntAreaLcNm: string) => ({ ctprvnSignguNm, acdntAreaLcNm, acdntYear: '2024' })
  const accidentNames = (sidoName: string, sggName: string, rows: Record<string, unknown>[]) => {
    const got = accidentAdapter.parse(withEmptyRest(rowsLike('accident-p1.json', rows), 2), { kind: 'accident', sidoName, sggName }, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    return got.value.items.map((i) => i.name)
  }

  it('AC-7904.1: accident 전남광주통합특별시 서구는 옛 광주광역시 서구 줄(과 새 이름 줄)을 남기고 다른 시도의 서구는 뺀다', () => {
    expect(
      accidentNames('전남광주통합특별시', '서구', [
        spot('광주광역시 서구1', '광주광역시 서구 가상동(가상역 부근)'),
        spot('부산광역시 서구1', '부산광역시 서구 가상동(가상시장 부근)'),
        spot('전남광주통합특별시 서구2', '전남광주통합특별시 서구 가상동(가상교 부근)'),
        spot('전라남도 목포시1', '전라남도 목포시 가상동(가상항 부근)'),
      ]),
    ).toEqual(['광주광역시 서구 가상동(가상역 부근)', '전남광주통합특별시 서구 가상동(가상교 부근)'])
    expect(accidentNames('전남광주통합특별시', '목포시', [spot('전라남도 목포시1', '전라남도 목포시 가상동(가상항 부근)')])).toEqual([
      '전라남도 목포시 가상동(가상항 부근)',
    ])
  })

  it('AC-7904.1: accident 인천 제물포구는 옛 중구·동구 줄을, 화성시 일반구는 옛 화성시 줄을 남긴다', () => {
    expect(
      accidentNames('인천광역시', '제물포구', [
        spot('인천광역시 중구1', '인천광역시 중구 가상동(가상역 부근)'),
        spot('인천광역시 동구1', '인천광역시 동구 가상동(가상시장 부근)'),
        spot('인천광역시 서구1', '인천광역시 서구 가상동(가상교 부근)'),
      ]),
    ).toEqual(['인천광역시 중구 가상동(가상역 부근)', '인천광역시 동구 가상동(가상시장 부근)'])
    expect(
      accidentNames('경기도', '화성시 만세구', [
        spot('경기도 화성시1', '경기도 화성시 가상읍(가상초교 부근)'),
        spot('경기도 수원시 영통구1', '경기도 수원시 영통구 가상동(가상역 부근)'),
      ]),
    ).toEqual(['경기도 화성시 가상읍(가상초교 부근)'])
  })

  it('AC-7904.1: accident 세종특별자치시는 시도 = 시군구라 시도 이름 하나로 찾는다', () => {
    expect(
      accidentNames('세종특별자치시', '세종특별자치시', [spot('세종특별자치시1', '세종특별자치시 가상읍(가상역 부근)')]),
    ).toEqual(['세종특별자치시 가상읍(가상역 부근)'])
  })

  it('AC-7904.1: senior 제물포구는 옛 중구 주소 줄과 새 이름 주소 줄을 남기고 옛 서구 줄은 뺀다', () => {
    const q = withSido<QueryOf<'senior'>>({ kind: 'senior', sggName: '제물포구' }, '인천광역시')
    const page = rowsLike('senior-p1.json', [
      { flctNm: '가상1경로당', lctnRoadNmAddr: '인천광역시 중구 가상로 1', lctnLotnoAddr: '' },
      { flctNm: '가상2경로당', lctnRoadNmAddr: '인천광역시 제물포구 가상로 2', lctnLotnoAddr: '' },
      { flctNm: '가상3경로당', lctnRoadNmAddr: '인천광역시 서구 가상로 3', lctnLotnoAddr: '' },
    ])
    const texts = [page, ...Array.from({ length: seniorAdapter.requests(q).length - 1 }, () => STD_NODATA)]
    const got = seniorAdapter.parse(texts, q, TODAY)
    expect(got.ok && got.value.items.map((i) => i.name)).toEqual(['가상1경로당', '가상2경로당'])
  })

  it('AC-7904.1: market 화성시 일반구는 새 일반구 주소와 시 이름만 적힌 주소를 남기고 다른 시는 뺀다', () => {
    const page = rowsLike('market-p1.json', [
      { mrktNm: '가상1시장', rdnmadr: '경기도 화성시 만세구 가상로 1', lnmadr: '' },
      { mrktNm: '가상2시장', rdnmadr: '경기도 화성시 가상로 2', lnmadr: '' },
      { mrktNm: '가상3시장', rdnmadr: '경기도 수원시 영통구 가상로 3', lnmadr: '' },
    ])
    const got = marketAdapter.parse(withEmptyRest(page, 3), withSido<QueryOf<'market'>>({ kind: 'market', sggName: '화성시 만세구' }, '경기도'), TODAY)
    expect(got.ok && got.value.items.map((i) => i.name)).toEqual(['가상1시장', '가상2시장'])
  })
})

describe('AC-7904.4 EPSG:5174 좌표 자료(체력단련장)는 WGS84로 바꿔 돌려준다', () => {
  it('AC-7904.4: 기준점(x 198000, y 451600)이 proj4로 구한 WGS84 점과 5m 안으로 맞고, 소수 6자리다', () => {
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5, true), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    const first = got.value.items[0]
    expect(distM(first, { lat: 37.56668114, lng: 126.97815021 })).toBeLessThanOrEqual(5)
    expect(Math.round(first.lat * 1e6) / 1e6).toBe(first.lat)
    expect(Math.round(first.lng * 1e6) / 1e6).toBe(first.lng)
  })

  it('AC-7904.4: 줄마다 coords.ts from5174로 바꾼 값 그대로다(좌표 (0,0)·빈 좌표 줄은 뺀다)', () => {
    const got = gymAdapter.parse(withEmptyRest(fx('gym-p1.json'), 5, true), GYM, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    expect(got.value.items).toEqual([
      { name: '하늘튼튼헬스', status: 'open', ...from5174(198000, 451600)! },
      { name: '바다근력짐', status: 'open', ...from5174(198150.5, 451720.25)! },
    ])
  })
})

const ALL = [
  { kind: 'market', pages: 3, rows: 1000, gym: false, run: (texts: string[]) => marketAdapter.parse(texts, MARKET, TODAY) },
  { kind: 'senior', pages: 2, rows: 1000, gym: false, run: (texts: string[]) => seniorAdapter.parse(texts, SENIOR, TODAY) },
  { kind: 'gym', pages: 5, rows: 100, gym: true, run: (texts: string[]) => gymAdapter.parse(texts, GYM, TODAY) },
  { kind: 'accident', pages: 2, rows: 500, gym: false, run: (texts: string[]) => accidentAdapter.parse(texts, ACCIDENT, TODAY) },
  { kind: 'school', pages: 5, rows: 1000, gym: false, run: (texts: string[]) => schoolAdapter.parse(texts, SCHOOL, TODAY) },
] as const

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  for (const { kind, pages, gym, run } of ALL) {
    it(`AC-7904.2: ${kind} — 빈 답(진짜 모양 결과 03·body null, 감싼 NODATA, 빈 items)은 실패가 아니라 빈 목록이고, 기준 날짜는 받은 날이다`, () => {
      for (const empty of [STD_NODATA, fx('nodata.json'), fx('empty-items.json')]) {
        const got = run(Array.from({ length: pages }, () => empty))
        expect(got.ok).toBe(true)
        if (!got.ok) return
        expect(got.asOf).toBe(TODAY)
        expect(got.value.items).toEqual([])
        expect(got.value.capped).toBe(false)
      }
      expect(run(withEmptyRest(STD_NODATA, pages, gym)).ok).toBe(true)
    })

    it(`AC-7904.2: ${kind} — 미등록 열쇠 답(진짜 모양 JSON)은 not-applied다`, () => {
      expect(run(withEmptyRest(fx('not-registered.json'), pages, gym))).toEqual({ ok: false, code: 'not-applied' })
      expect(run([...withEmptyRest(fx(`${kind}-p1.json`), pages - 1, gym), fx('not-registered.json')])).toEqual({
        ok: false,
        code: 'not-applied',
      })
    })

    it(`AC-7904.2: ${kind} — JSON이 아닌 답·오류 번호(진짜 모양 결과 10 포함)·items 모양 틀림·body 없음은 failed다`, () => {
      for (const [label, bad] of [
        ['not-json.html', fx('not-json.html')],
        ['error-code.json', fx('error-code.json')],
        ['결과 10', STD_ERROR],
        ['bad-items.json', fx('bad-items.json')],
        ['no-response.json', fx('no-response.json')],
      ] as const) {
        expect(run(withEmptyRest(bad, pages, gym)), label).toEqual({ ok: false, code: 'failed' })
        expect(run([...withEmptyRest(fx(`${kind}-p1.json`), pages - 1, gym), bad]), `${label} (끝 쪽)`).toEqual({
          ok: false,
          code: 'failed',
        })
      }
    })
  }
})

describe('AC-7904.3 여러 쪽 자료는 정해 둔 쪽 수까지만 받고 넘으면 capped', () => {
  for (const { kind, pages, rows, gym, run } of ALL) {
    it(`AC-7904.3: ${kind} — 전체 건수가 ${pages}쪽 × ${rows}줄을 넘으면 capped: true, 딱 맞으면 false다`, () => {
      const over = run(withEmptyRest(withTotal(fx(`${kind}-p1.json`), pages * rows + 1), pages, gym))
      const exact = run(withEmptyRest(withTotal(fx(`${kind}-p1.json`), pages * rows), pages, gym))
      expect(over.ok && over.value.capped).toBe(true)
      expect(exact.ok && exact.value.capped).toBe(false)
      if (over.ok && exact.ok) expect(over.value.items).toEqual(exact.value.items)
    })
  }
})

describe('AC-7903.3 체력단련장 시간 한도(TASK-88)', () => {
  it('AC-7903.3: 체력단련장은 하위 부르기 한도 15초이고 시간 넘은 부르기를 한 번 더 부른다', () => {
    expect(gymAdapter.timeoutMs).toBe(15_000)
    expect(gymAdapter.retryTimeout).toBe(true)
  })
})
