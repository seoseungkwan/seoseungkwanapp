import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { KIND_KEY } from '@/lib/location/query'
import { isSourceId } from '@/lib/location/sources'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import { APT_TRADE_PAGES, BIZ_TRADE_PAGES, TRADE_ROWS, aptTrade, bizTrade } from './trades'

// 실거래 읽는 곳(specs/location REQ-7904, design.md 4절 apt-trade·biz-trade). 진짜 사이트는 부르지 않는다.
// 가짜 응답 fixtures/location/api/trades/: 지어낸 시·도 '가상도' '가람구'(99110)의 하늘동·바다동·구름동. 단지·도로 이름도 지어냈다

const fx = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/trades/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
const APT_Q = { kind: 'apt-trade', sgg: '99110', ym: '2026-10' } as const
const BIZ_Q = { kind: 'biz-trade', sgg: '99110', ym: '2026-10' } as const

// 첫 쪽 하나 + 나머지 쪽(빈 목록)으로 정해 둔 쪽 수만큼의 답 글자
const pages = (n: number, first: string, rest: string) => [first, ...Array.from({ length: n - 1 }, () => rest)]
const aptPages = (first = fx('apt-p1.xml'), rest = fx('apt-rest.xml')) => pages(APT_TRADE_PAGES, first, rest)
const bizPages = (first = fx('biz-p1.xml'), rest = fx('biz-rest.xml')) => pages(BIZ_TRADE_PAGES, first, rest)
const same = (n: number, text: string) => pages(n, text, text)

describe('실거래 읽는 곳 모양', () => {
  it('AC-7904.1: 종류·열쇠·출처 id가 정해 둔 값이고 출처 id는 SOURCES에 있다', () => {
    expect(aptTrade.kind).toBe('apt-trade')
    expect(aptTrade.key).toBe(KIND_KEY['apt-trade'])
    expect(aptTrade.src).toBe('apt-trade')
    expect(isSourceId(aptTrade.src)).toBe(true)
    expect(bizTrade.kind).toBe('biz-trade')
    expect(bizTrade.key).toBe(KIND_KEY['biz-trade'])
    expect(bizTrade.src).toBe('biz-trade')
    expect(isSourceId(bizTrade.src)).toBe(true)
  })
})

describe('요청', () => {
  it('AC-7904.1: 아파트는 시군구 5자리·계약 연월로 1~5쪽(쪽마다 1,000줄)을 부르고 주소에 열쇠가 없다', () => {
    expect(APT_TRADE_PAGES).toBe(5)
    expect(TRADE_ROWS).toBe(1000)
    const reqs = aptTrade.requests(APT_Q)
    expect(reqs).toEqual(
      [1, 2, 3, 4, 5].map((p) => ({
        url: `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?LAWD_CD=99110&DEAL_YMD=202610&pageNo=${p}&numOfRows=1000`,
      })),
    )
    for (const r of reqs) expect(r.url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 상업업무용은 같은 칸으로 1~3쪽을 부른다', () => {
    expect(BIZ_TRADE_PAGES).toBe(3)
    const reqs = bizTrade.requests({ kind: 'biz-trade', sgg: '99120', ym: '2025-01' })
    expect(reqs).toEqual(
      [1, 2, 3].map((p) => ({
        url: `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?LAWD_CD=99120&DEAL_YMD=202501&pageNo=${p}&numOfRows=1000`,
      })),
    )
    for (const r of reqs) expect(r.url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 요청은 정해 둔 host라 바깥 부르기 규칙(fetchSource)이 막지 않고 열쇠는 거기서 한 번만 실린다', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn<SourceFetch>(async (url) => {
      seen.push(url)
      return new Response(fx('empty.xml'))
    })
    const call = createFetchSource({ fetchImpl })
    for (const r of [...aptTrade.requests(APT_Q), ...bizTrade.requests(BIZ_Q)]) {
      expect(await call(r, { kind: aptTrade.key, value: 'DATA+FAKE/key==0015' })).toEqual({ ok: true, text: fx('empty.xml') })
    }
    expect(seen).toHaveLength(APT_TRADE_PAGES + BIZ_TRADE_PAGES)
    for (const url of seen) expect(new URL(url).searchParams.getAll('serviceKey')).toEqual(['DATA+FAKE/key==0015'])
  })
})

describe('아파트 매매 답 읽기', () => {
  it('AC-7904.1: 법정동 이름·㎡(소수 2자리 버림)·원(만 원 × 10,000)·층·계약 날을 돌려주고, 기준 날짜는 받은 한국 날짜다', () => {
    expect(aptTrade.parse(aptPages(), APT_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        capped: false,
        deals: [
          { bdongName: '하늘동', m2: 84.97, won: 825_000_000, floor: 12, on: '2026-10-05' },
          { bdongName: '바다동', m2: 59.99, won: 1_120_000_000, floor: null, on: '2026-10-17' },
          { bdongName: '구름동', m2: 201.5, won: 11_250_000_000, floor: -1, on: '2026-10-28' },
        ],
      },
    })
  })

  it('AC-7904.1: 해제된 거래(해제 여부 O)는 뺀다', () => {
    const parsed = aptTrade.parse(aptPages(), APT_Q, TODAY)
    expect(parsed.ok && parsed.value.deals.some((d) => d.won === 950_000_000)).toBe(false)
    // 해제 표시를 지우면 그 줄이 들어온다(빼는 까닭이 해제 표시뿐인지)
    const kept = aptTrade.parse(aptPages(fx('apt-p1.xml').replace('<cdealType>O</cdealType>', '<cdealType> </cdealType>')), APT_Q, TODAY)
    expect(kept.ok && kept.value.deals.filter((d) => d.won === 950_000_000)).toEqual([
      { bdongName: '하늘동', m2: 84.97, won: 950_000_000, floor: 3, on: '2026-10-09' },
    ])
  })

  it("AC-7904.1: '만 원' 글자는 앞뒤 공백·쉼표를 빼고 원 정수로 바꾼다", () => {
    const text = fx('apt-p1.xml').replace('<dealAmount>112,000</dealAmount>', '<dealAmount> 7,005 </dealAmount>')
    const parsed = aptTrade.parse(aptPages(text), APT_Q, TODAY)
    expect(parsed.ok && parsed.value.deals.map((d) => d.won)).toEqual([825_000_000, 70_050_000, 11_250_000_000])
    expect(parsed.ok && parsed.value.deals.every((d) => Number.isSafeInteger(d.won))).toBe(true)
  })

  it('AC-7904.2: 거래가 없는 달(빈 목록·자료 없음 03)은 실패가 아니라 빈 목록이다', () => {
    const empty = { ok: true, asOf: TODAY, value: { capped: false, deals: [] } }
    expect(aptTrade.parse(same(APT_TRADE_PAGES, fx('empty.xml')), APT_Q, TODAY)).toEqual(empty)
    expect(aptTrade.parse(same(APT_TRADE_PAGES, fx('nodata.xml')), APT_Q, TODAY)).toEqual(empty)
  })

  it('AC-7904.2: 활용신청 안 된 열쇠의 답은 not-applied다(뒤 쪽 하나만 그래도)', () => {
    expect(aptTrade.parse(same(APT_TRADE_PAGES, fx('not-registered.json')), APT_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    const later = aptPages()
    later[3] = '{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}'
    expect(aptTrade.parse(later, APT_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀리면 failed다', () => {
    const p1 = fx('apt-p1.xml')
    const broken: [string, string][] = [
      ['빈 글자', ''],
      ['HTML', '<html><body>점검 중이에요</body></html>'],
      ['다른 JSON', '{"hello":"world"}'],
      ['요청 한도 넘음(22)', fx('limit.xml')],
      ['몸통 없음', '<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header></response>'],
      ['전체 수 없음', p1.replace('<totalCount>4</totalCount>', '')],
      ['금액 칸 없음', p1.replace('<dealAmount>112,000</dealAmount>', '')],
      ['금액이 숫자 아님', p1.replace('112,000', '11만2000')],
      ['넓이 0', p1.replace('<excluUseAr>59.99</excluUseAr>', '<excluUseAr>0</excluUseAr>')],
      ['넓이가 숫자 아님', p1.replace('<excluUseAr>59.99</excluUseAr>', '<excluUseAr>약 60</excluUseAr>')],
      ['법정동 이름 빈칸', p1.replace('<umdNm>바다동</umdNm>', '<umdNm> </umdNm>')],
      ['없는 날', p1.replace('<dealDay>17</dealDay>', '<dealDay>32</dealDay>')],
      ['층이 숫자 아님', p1.replace('<floor>12</floor>', '<floor>12층</floor>')],
    ]
    for (const [why, text] of broken) {
      expect([why, aptTrade.parse(aptPages(text), APT_Q, TODAY)]).toEqual([why, { ok: false, code: 'failed' }])
    }
    // 쪽 수가 요청과 다름
    expect(aptTrade.parse([], APT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(aptTrade.parse([p1], APT_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.3: 5쪽까지만 받고, 받은 줄이 전체 수보다 적으면 capped: true다', () => {
    const many = (t: string) => t.replace('<totalCount>4</totalCount>', '<totalCount>5321</totalCount>')
    const parsed = aptTrade.parse(aptPages(many(fx('apt-p1.xml')), many(fx('apt-rest.xml'))), APT_Q, TODAY)
    expect(parsed.ok && parsed.value.capped).toBe(true)
    expect(parsed.ok && parsed.value.deals).toHaveLength(3)
    // 해제된 줄도 받은 줄로 센다: 전체 4줄을 다 받았으면 capped가 아니다
    const all = aptTrade.parse(aptPages(), APT_Q, TODAY)
    expect(all.ok && all.value.capped).toBe(false)
  })
})

describe('상업업무용 매매 답 읽기', () => {
  it('AC-7904.1: 법정동 이름·용도·㎡(소수 2자리 버림)·원을 돌려주고, 지번이 일부만(1**·빈칸) 나온 줄도 받는다', () => {
    expect(bizTrade.parse(bizPages(), BIZ_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        capped: false,
        deals: [
          { bdongName: '하늘동', usage: '제2종근린생활', m2: 330.58, won: 1_850_000_000 },
          { bdongName: '바다동', usage: '업무', m2: 45.67, won: 320_000_000 },
          { bdongName: '바다동', usage: '제1종근린생활', m2: 1234.56, won: 10_500_000_000 },
        ],
      },
    })
  })

  it('AC-7904.1: 해제된 거래는 뺀다', () => {
    const parsed = bizTrade.parse(bizPages(), BIZ_Q, TODAY)
    expect(parsed.ok && parsed.value.deals.some((d) => d.bdongName === '구름동')).toBe(false)
    const kept = bizTrade.parse(bizPages(fx('biz-p1.xml').replace('<cdealType>O</cdealType>', '<cdealType> </cdealType>')), BIZ_Q, TODAY)
    expect(kept.ok && kept.value.deals.filter((d) => d.bdongName === '구름동')).toEqual([
      { bdongName: '구름동', usage: '판매', m2: 512.4, won: 2_100_000_000 },
    ])
  })

  it('AC-7904.2: 빈 답은 빈 목록, 활용신청 안 됨은 not-applied, 모양 틀림은 failed다', () => {
    expect(bizTrade.parse(same(BIZ_TRADE_PAGES, fx('empty.xml')), BIZ_Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { capped: false, deals: [] },
    })
    expect(bizTrade.parse(same(BIZ_TRADE_PAGES, fx('not-registered.json')), BIZ_Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    const p1 = fx('biz-p1.xml')
    const broken: [string, string][] = [
      ['요청 한도 넘음(22)', fx('limit.xml')],
      ['넓이 칸 없음', p1.replace('<buildingAr>45.678</buildingAr>', '')],
      ['금액이 숫자 아님', p1.replace('32,000', '삼억이천')],
      ['법정동 칸 없음', p1.replace('<umdNm>하늘동</umdNm>', '')],
    ]
    for (const [why, text] of broken) {
      expect([why, bizTrade.parse(bizPages(text), BIZ_Q, TODAY)]).toEqual([why, { ok: false, code: 'failed' }])
    }
    expect(bizTrade.parse(aptPages(), BIZ_Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.3: 3쪽까지만 받고, 받은 줄이 전체 수보다 적으면 capped: true다', () => {
    const many = (t: string) => t.replace('<totalCount>4</totalCount>', '<totalCount>3001</totalCount>')
    const parsed = bizTrade.parse(bizPages(many(fx('biz-p1.xml')), many(fx('biz-rest.xml'))), BIZ_Q, TODAY)
    expect(parsed.ok && parsed.value.capped).toBe(true)
    expect(parsed.ok && parsed.value.deals).toHaveLength(3)
  })
})
