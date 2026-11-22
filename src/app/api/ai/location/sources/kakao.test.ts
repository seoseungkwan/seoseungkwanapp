import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSourceId } from '@/lib/location/sources'
import type { Adapter, QueryKind, QueryOf, SiteRequest } from '@/types/location'
import { createFetchSource } from '../fetchSource'
import {
  KAKAO_ADDRESS_SIZE,
  KAKAO_MAX_PLACES,
  KAKAO_PAGES,
  KAKAO_PAGE_SIZE,
  kakaoAddress,
  kakaoKeyword,
  kakaoNear,
  kakaoPoint,
} from './kakao'

// 카카오 로컬 읽는 곳(specs/location REQ-7904 AC-7904.1~3, design.md 3·4절).
// 견본 fixtures/location/api/kakao/는 카카오 로컬 문서의 응답 예 모양에 지어낸 값(가상도 가람구 · 가상약국 등)을 넣은 것이다.
// 진짜 카카오는 부르지 않는다(fetch는 시험이 넣는 가짜). 열쇠는 지어낸 글자다
const fixture = (name: string) => readFileSync(new URL(`../../../../../../fixtures/location/api/kakao/${name}`, import.meta.url), 'utf8')
const ADDRESS = fixture('address.json')
const ADDRESS_EMPTY = fixture('address-empty.json')
const C2A = fixture('coord2address.json')
const C2A_EMPTY = fixture('coord2address-empty.json')
const C2R = fixture('coord2regioncode.json')
const C2R_EMPTY = fixture('coord2regioncode-empty.json')
const P1 = fixture('category-p1.json')
const P2 = fixture('category-p2.json')
const P3 = fixture('category-p3.json')
const SMALL = fixture('category-small.json')
const NEAR_EMPTY = fixture('category-empty.json')
const KEYWORD = fixture('keyword.json')
const ERROR = fixture('error.json')
const BROKEN = fixture('broken.json')

const TODAY = '2026-11-22'
const AT = { lat: 37.51, lng: 127.005 }
const HOST = 'https://dapi.kakao.com'

const ADDRESS_Q: QueryOf<'k-address'> = { kind: 'k-address', q: '가람구 하늘로 45' }
const POINT_Q: QueryOf<'k-point'> = { kind: 'k-point', at: AT }
const NEAR_Q: QueryOf<'k-near'> = { kind: 'k-near', at: AT, r: 1000, cat: 'PM9' }
const KEYWORD_Q: QueryOf<'k-keyword'> = { kind: 'k-keyword', at: AT, r: 10000, q: '산업단지' }

const ADAPTERS: [QueryKind, Adapter][] = [
  ['k-address', kakaoAddress],
  ['k-point', kakaoPoint],
  ['k-near', kakaoNear],
  ['k-keyword', kakaoKeyword],
]

// JSON 견본을 조금 바꾼 답(모양 틀림 시험용)
function edited(text: string, change: (body: { documents: Record<string, unknown>[] } & Record<string, unknown>) => void): string {
  const body = JSON.parse(text) as { documents: Record<string, unknown>[] } & Record<string, unknown>
  change(body)
  return JSON.stringify(body)
}

describe('AC-7904.1 카카오 읽는 곳 모양', () => {
  it.each(ADAPTERS)('AC-7904.1: %s — 종류·카카오 열쇠·출처 id가 SOURCES에 있다', (kind, adapter) => {
    expect(adapter.kind).toBe(kind)
    expect(adapter.key).toBe('kakao')
    expect(adapter.src).toBe('kakao-local')
    expect(isSourceId(adapter.src)).toBe(true)
  })

  it('AC-7904.1: 쪽 수 상수 — 15곳씩 3쪽 = 45곳, 주소 찾기는 10개', () => {
    expect(KAKAO_PAGE_SIZE).toBe(15)
    expect(KAKAO_PAGES).toBe(3)
    expect(KAKAO_MAX_PLACES).toBe(45)
    expect(KAKAO_ADDRESS_SIZE).toBe(10)
  })

  it('AC-7904.1: 만든 요청은 모두 정해 둔 부르기 규칙(fetchSource)을 지나고, 주소에 열쇠가 없다', async () => {
    const seen: string[] = []
    const fetchImpl = async (url: string) => {
      seen.push(url)
      return new Response('{}', { status: 200 })
    }
    const call = createFetchSource({ fetchImpl })
    const requests: SiteRequest[] = [
      ...kakaoAddress.requests(ADDRESS_Q),
      ...kakaoPoint.requests(POINT_Q),
      ...kakaoNear.requests(NEAR_Q),
      ...kakaoKeyword.requests(KEYWORD_Q),
    ]
    for (const req of requests) {
      expect(req.url.startsWith(`${HOST}/v2/local/`)).toBe(true)
      expect(req.url).not.toContain('FAKE')
      expect(await call(req, { kind: 'kakao', value: 'kakao-rest-FAKE-0001' })).toEqual({ ok: true, text: '{}' })
    }
    expect(seen).toHaveLength(requests.length)
    expect(seen.every((u) => !u.includes('FAKE'))).toBe(true)
  })
})

describe('AC-7904.1 k-address 주소 찾기', () => {
  it('AC-7904.1: 요청은 주소 찾기 한 번, 찾는 글은 주소 칸에 인코딩, 10개까지', () => {
    expect(kakaoAddress.requests(ADDRESS_Q)).toEqual([
      {
        url: `${HOST}/v2/local/search/address.json?query=%EA%B0%80%EB%9E%8C%EA%B5%AC%20%ED%95%98%EB%8A%98%EB%A1%9C%2045&analyze_type=similar&page=1&size=10`,
      },
    ])
  })

  it('AC-7904.1: 답 → 점(소수 6자리)·도로명·지번·법정동 코드·본번·부번·산, 기준 날짜는 받은 날', () => {
    expect(kakaoAddress.parse([ADDRESS], ADDRESS_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        {
          at: { lat: 37.510988, lng: 127.005123 },
          road: '가상도 가람구 하늘로 45',
          jibun: '가상도 가람구 하늘동 120-3',
          bjd: '9911010100',
          lot: { bcode: '9911010100', main: 120, sub: 3, san: false },
        },
        {
          at: { lat: 37.5031, lng: 127.0152 },
          road: null,
          jibun: '가상도 가람구 바다동 산 7',
          bjd: '9911010200',
          lot: { bcode: '9911010200', main: 7, sub: 0, san: true },
        },
        // 동 이름만 찾은 줄: 번지가 없어 lot이 없다
        { at: { lat: 37.51, lng: 127.005 }, road: null, jibun: '가상도 가람구 하늘동', bjd: '9911010100', lot: null },
      ],
    })
  })

  it('AC-7904.1: 답이 10개를 넘어도 10개까지만', () => {
    const many = edited(ADDRESS, (b) => {
      b.documents = Array.from({ length: 12 }, () => b.documents[0])
    })
    const got = kakaoAddress.parse([many], ADDRESS_Q, TODAY)
    expect(got.ok && (got.value as unknown[]).length).toBe(10)
  })

  it('AC-7904.2: 찾은 주소가 없으면 빈 목록(실패 아님)', () => {
    expect(kakaoAddress.parse([ADDRESS_EMPTY], ADDRESS_Q, TODAY)).toEqual({ ok: true, value: [], asOf: TODAY })
  })

  it('AC-7904.2: 모양이 틀리면 failed — 카카오는 활용신청이 없어 not-applied를 쓰지 않는다', () => {
    for (const text of [
      BROKEN,
      ERROR,
      '',
      '<html>점검 중</html>',
      edited(ADDRESS, (b) => {
        b.documents[0].x = '경도'
      }),
      edited(ADDRESS, (b) => {
        b.documents[0].y = '12.5' // 우리나라 밖
      }),
      edited(ADDRESS, (b) => {
        b.documents[0].address = { address_name: 7 }
      }),
      edited(ADDRESS, (b) => {
        b.documents = 'x' as unknown as Record<string, unknown>[]
      }),
    ]) {
      expect(kakaoAddress.parse([text], ADDRESS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    }
    expect(kakaoAddress.parse([], ADDRESS_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})

describe('AC-7904.1 k-point 좌표 → 주소·지역 코드', () => {
  it('AC-7904.1: 요청은 좌표→주소, 좌표→지역 코드 두 번(x = 경도, y = 위도)', () => {
    expect(kakaoPoint.requests(POINT_Q)).toEqual([
      { url: `${HOST}/v2/local/geo/coord2address.json?x=127.005&y=37.51&input_coord=WGS84` },
      { url: `${HOST}/v2/local/geo/coord2regioncode.json?x=127.005&y=37.51&input_coord=WGS84` },
    ])
  })

  it('AC-7904.1: 답 → 도로명·지번·법정동·행정동 코드·본번·부번·산', () => {
    expect(kakaoPoint.parse([C2A, C2R], POINT_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        road: '가상도 가람구 하늘로 45',
        jibun: '가상도 가람구 하늘동 120-3',
        bjd: '9911010100',
        hjd: '9911051000',
        lot: { bcode: '9911010100', main: 120, sub: 3, san: false },
      },
    })
  })

  it('AC-7904.2: 주소가 없는 점(바다 위 등)은 실패가 아니고 빈 칸이다', () => {
    expect(kakaoPoint.parse([C2A_EMPTY, C2R], POINT_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { road: null, jibun: null, bjd: '9911010100', hjd: '9911051000', lot: null },
    })
    expect(kakaoPoint.parse([C2A_EMPTY, C2R_EMPTY], POINT_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { road: null, jibun: null, bjd: null, hjd: null, lot: null },
    })
  })

  it('AC-7904.2: 답 하나라도 모양이 틀리거나 답 수가 다르면 failed', () => {
    expect(kakaoPoint.parse([C2A], POINT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(kakaoPoint.parse([BROKEN, C2R], POINT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(kakaoPoint.parse([C2A, ERROR], POINT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    const badCode = edited(C2R, (b) => {
      b.documents[0].code = 99
    })
    expect(kakaoPoint.parse([C2A, badCode], POINT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})

describe('AC-7904.1·AC-7904.3 k-near 카테고리 장소', () => {
  it('AC-7904.1: 요청은 가까운 차례로 15곳씩 3쪽, 범위·분류 칸 그대로', () => {
    const base = `${HOST}/v2/local/search/category.json?category_group_code=PM9&x=127.005&y=37.51&radius=1000&sort=distance`
    expect(kakaoNear.requests(NEAR_Q)).toEqual([
      { url: `${base}&page=1&size=15` },
      { url: `${base}&page=2&size=15` },
      { url: `${base}&page=3&size=15` },
    ])
  })

  it('AC-7904.1: 답 → 이름·분류·점·거리(정수 m), 가까운 차례. 거리 칸이 비면 하버사인으로 센다', () => {
    // 카카오는 마지막 쪽 뒤를 부르면 같은 쪽을 다시 줄 수 있다 — 끝 쪽(is_end) 뒤는 읽지 않는다
    expect(kakaoNear.parse([SMALL, SMALL, SMALL], NEAR_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        capped: false,
        places: [
          { name: '나래내과의원', category: '의료,건강 > 병원 > 내과', at: { lat: 37.5103, lng: 127.0059 }, distM: 85 },
          { name: '가람종합병원', category: '의료,건강 > 병원 > 종합병원', at: { lat: 37.5108, lng: 127.0086 }, distM: 320 },
          { name: '다온요양병원', category: '의료,건강 > 병원 > 요양병원', at: { lat: 37.5163, lng: 127.005 }, distM: 700 },
          { name: '하늘대학병원', category: '의료,건강 > 병원 > 대학병원', at: { lat: 37.5045, lng: 127.0187 }, distM: 1210 },
        ],
      },
    })
    // 끝 쪽 뒤의 답은 깨져 있어도 읽지 않는다
    expect(kakaoNear.parse([SMALL, BROKEN, BROKEN], NEAR_Q, TODAY).ok).toBe(true)
  })

  it('AC-7904.3: 45곳을 넘으면(모두 120곳) 세 쪽 45곳과 capped: true', () => {
    const got = kakaoNear.parse([P1, P2, P3], NEAR_Q, TODAY)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const value = got.value as { places: { name: string; distM: number }[]; capped: boolean }
    expect(value.capped).toBe(true)
    expect(value.places).toHaveLength(45)
    expect(value.places[0]).toEqual({ name: '가상약국 1호', category: '의료,건강 > 약국', at: { lat: 37.5101, lng: 127.005 }, distM: 11 })
    expect(value.places[44].name).toBe('가상약국 45호')
    expect(value.places.every((p) => Number.isInteger(p.distM))).toBe(true)
  })

  it('AC-7904.3: 답 줄이 45곳을 넘게 와도 45곳까지만, capped: true', () => {
    const big = edited(P1, (b) => {
      const docs = [P1, P2, P3].flatMap((t) => (JSON.parse(t) as { documents: Record<string, unknown>[] }).documents)
      docs.push({ ...docs[44], id: '90009999', place_name: '가상약국 46호', distance: '999' })
      b.documents = docs
      b.meta = { same_name: null, pageable_count: 46, total_count: 46, is_end: true }
    })
    const got = kakaoNear.parse([big, big, big], NEAR_Q, TODAY)
    expect(got.ok && (got.value as { places: unknown[] }).places).toHaveLength(45)
    expect(got.ok && (got.value as { capped: boolean }).capped).toBe(true)
  })

  it('AC-7904.3: 같은 곳이 두 쪽에 나오면 한 번만 센다', () => {
    const got = kakaoNear.parse([P1, P1, P3], NEAR_Q, TODAY)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    const value = got.value as { places: { name: string }[]; capped: boolean }
    expect(value.places).toHaveLength(30)
    expect(new Set(value.places.map((p) => p.name)).size).toBe(30)
    expect(value.capped).toBe(true)
  })

  it('AC-7904.2: 찾은 곳이 없으면 빈 목록(실패 아님)', () => {
    expect(kakaoNear.parse([NEAR_EMPTY, NEAR_EMPTY, NEAR_EMPTY], NEAR_Q, TODAY)).toEqual({
      ok: true,
      value: { places: [], capped: false },
      asOf: TODAY,
    })
  })

  it('AC-7904.2: 모양이 틀리면 failed', () => {
    for (const texts of [
      [BROKEN, P2, P3],
      [P1, ERROR, P3],
      [ERROR, ERROR, ERROR],
      [P1, P2],
      [
        edited(SMALL, (b) => {
          delete b.documents[0].place_name
        }),
        SMALL,
        SMALL,
      ],
      [
        edited(SMALL, (b) => {
          b.documents[1].x = ''
        }),
        SMALL,
        SMALL,
      ],
      [
        edited(SMALL, (b) => {
          b.meta = {}
        }),
        SMALL,
        SMALL,
      ],
    ]) {
      expect(kakaoNear.parse(texts, NEAR_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    }
  })
})

describe('AC-7904.1·AC-7904.3 k-keyword 산업단지', () => {
  it('AC-7904.1: 요청은 찾는 말 산업단지로 15곳씩 3쪽', () => {
    const base = `${HOST}/v2/local/search/keyword.json?query=%EC%82%B0%EC%97%85%EB%8B%A8%EC%A7%80&x=127.005&y=37.51&radius=10000&sort=distance`
    expect(kakaoKeyword.requests(KEYWORD_Q)).toEqual([
      { url: `${base}&page=1&size=15` },
      { url: `${base}&page=2&size=15` },
      { url: `${base}&page=3&size=15` },
    ])
  })

  it('AC-7904.1: 답 → 이름·분류(카카오 분류 글 그대로)·점·거리', () => {
    expect(kakaoKeyword.parse([KEYWORD, KEYWORD, KEYWORD], KEYWORD_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        capped: false,
        places: [
          { name: '가람일반산업단지', category: '부동산 > 산업단지', at: { lat: 37.5012, lng: 127.0311 }, distM: 2350 },
          { name: '가람일반산업단지 관리사무소', category: '사회,공공기관 > 단체,협회', at: { lat: 37.5009, lng: 127.0318 }, distM: 2410 },
          { name: '나래국가산업단지', category: '부동산 > 산업단지', at: { lat: 37.52, lng: 127.1 }, distM: 8800 },
        ],
      },
    })
  })

  it('AC-7904.3: 45곳을 넘으면 45곳과 capped: true', () => {
    const got = kakaoKeyword.parse([P1, P2, P3], KEYWORD_Q, TODAY)
    expect(got.ok && (got.value as { places: unknown[] }).places).toHaveLength(45)
    expect(got.ok && (got.value as { capped: boolean }).capped).toBe(true)
  })

  it('AC-7904.2: 빈 답은 빈 목록, 모양 틀림은 failed', () => {
    expect(kakaoKeyword.parse([NEAR_EMPTY, NEAR_EMPTY, NEAR_EMPTY], KEYWORD_Q, TODAY)).toEqual({
      ok: true,
      value: { places: [], capped: false },
      asOf: TODAY,
    })
    expect(kakaoKeyword.parse([ERROR, ERROR, ERROR], KEYWORD_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})
