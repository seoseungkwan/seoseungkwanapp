import { describe, expect, it } from 'vitest'
import type { Query, QueryKind } from '@/types/location'
import { KIND_KEY, QUERY_KINDS, checkQuery } from './query'

// 입지 분석 몸통 검사(specs/location REQ-7903 AC-7903.2, design.md 4절). 화면과 서버가 같은 검사를 쓴다.
// 정해 둔 종류 27개 · 종류마다 정해 둔 칸만(빠짐·더함 없음) · 칸마다 범위. 맞으면 정리한 몸통, 아니면 null

const AT = { lat: 37.566535, lng: 126.977969 }

// 종류마다 맞는 몸통 하나(지어낸 코드·이름)
const VALID: { [K in QueryKind]: Extract<Query, { kind: K }> } = {
  'k-address': { kind: 'k-address', q: '서울특별시 중구 세종대로 110' },
  'k-point': { kind: 'k-point', at: AT },
  'k-near': { kind: 'k-near', at: AT, r: 1000, cat: 'PM9' },
  'k-keyword': { kind: 'k-keyword', at: AT, r: 3000, q: '산업단지' },
  'pop-age': { kind: 'pop-age', dongs: ['1111051500', '1111053000'], ym: '2026-09' },
  household: { kind: 'household', dongs: ['1111051500'], ym: '2022-10' },
  'flow-volume': { kind: 'flow-volume', sido: '11', sgg: '11110', ym: '2026-10' },
  'flow-bus': { kind: 'flow-bus', sgg: '11110' },
  'flow-rail': { kind: 'flow-rail', sgg: '11110' },
  accident: { kind: 'accident', sidoName: '서울특별시', sggName: '종로구' },
  'apt-list': { kind: 'apt-list', bjd: '1111010100' },
  'apt-info': { kind: 'apt-info', complex: 'A10027875' },
  presale: { kind: 'presale', sidoName: '경기도', from: '2026-01', to: '2027-12' },
  'apt-trade': { kind: 'apt-trade', sgg: '11110', ym: '2026-05' },
  'biz-trade': { kind: 'biz-trade', sgg: '11110', ym: '2026-05' },
  stores: { kind: 'stores', at: AT, r: 30 },
  'bld-title': { kind: 'bld-title', sgg: '11110', bjdong: '10100', bun: '0012', ji: '0000', plat: '0' },
  'bld-floor': { kind: 'bld-floor', sgg: '11110', bjdong: '10100', bun: '0012', ji: '0003', plat: '1' },
  'hosp-list': { kind: 'hosp-list', at: AT, r: 1500, group: 'clinic' },
  'hosp-detail': { kind: 'hosp-detail', ykiho: 'JDQ4MTg4MSM1MSMkMSMkMCMkODkkMzgxMzUx+/=' },
  'hosp-hours': { kind: 'hosp-hours', at: AT },
  nonpay: { kind: 'nonpay', ykiho: 'JDQ4MTg4MSM1MSMk', item: 'MX122' },
  'clinic-license': { kind: 'clinic-license', event: 'open', from: '2023-11-22', to: '2026-11-22' },
  gym: { kind: 'gym', sggName: '종로구' },
  senior: { kind: 'senior', sggName: '수원시 장안구' },
  market: { kind: 'market', sggName: '종로구' },
  school: { kind: 'school', sggName: '종로구' },
}

const KINDS = Object.keys(VALID) as QueryKind[]
// 한 칸만 바꾼 몸통
const withField = (kind: QueryKind, field: string, value: unknown) => ({ ...VALID[kind], [field]: value })
const withoutField = (kind: QueryKind, field: string) => {
  const copy: Record<string, unknown> = { ...VALID[kind] }
  delete copy[field]
  return copy
}

describe('AC-7903.2 정해 둔 종류 27개', () => {
  it('AC-7903.2: 종류 목록은 design.md 4절 27개이고 겹치지 않는다', () => {
    expect(QUERY_KINDS).toHaveLength(27)
    expect(new Set(QUERY_KINDS).size).toBe(27)
    expect([...QUERY_KINDS].sort()).toEqual([...KINDS].sort())
  })

  it('AC-7903.2: 열쇠 종류는 카카오 넷(k-*)과 공공데이터포털 스물셋이다', () => {
    expect(Object.keys(KIND_KEY).sort()).toEqual([...KINDS].sort())
    for (const kind of QUERY_KINDS) expect(KIND_KEY[kind], kind).toBe(kind.startsWith('k-') ? 'kakao' : 'data')
    expect(QUERY_KINDS.filter((k) => KIND_KEY[k] === 'kakao')).toEqual(['k-address', 'k-point', 'k-near', 'k-keyword'])
  })

  it('AC-7903.2: 종류마다 맞는 몸통은 그대로 받는다', () => {
    for (const kind of KINDS) expect(checkQuery(VALID[kind]), kind).toEqual(VALID[kind])
  })

  it('AC-7903.2: 모르는 종류·종류 없음·객체가 아닌 몸통은 받지 않는다', () => {
    for (const body of [
      null,
      undefined,
      'k-address',
      42,
      [],
      [VALID['k-address']],
      {},
      { q: '서울특별시청' },
      { kind: 'k-search', q: '서울특별시청' },
      { kind: 'K-ADDRESS', q: '서울특별시청' },
      { kind: 'toString' },
      { kind: '__proto__' },
      { kind: 7, q: '서울특별시청' },
    ])
      expect(checkQuery(body), JSON.stringify(body) ?? String(body)).toBeNull()
  })

  it('AC-7903.2: 정해 둔 칸이 하나라도 빠지거나 더 있으면 받지 않는다', () => {
    for (const kind of KINDS) {
      for (const field of Object.keys(VALID[kind]).filter((f) => f !== 'kind'))
        expect(checkQuery(withoutField(kind, field)), `${kind} - ${field}`).toBeNull()
      expect(checkQuery({ ...VALID[kind], extra: 1 }), `${kind} + extra`).toBeNull()
      expect(checkQuery({ ...VALID[kind], serviceKey: 'abc' }), `${kind} + serviceKey`).toBeNull()
    }
  })
})

describe('AC-7903.2 칸 범위', () => {
  it('AC-7903.2: 점은 { lat 33~39, lng 124~132 } 소수 6자리까지 숫자이고 칸 둘만이다', () => {
    const ok = [
      { lat: 33, lng: 124 },
      { lat: 39, lng: 132 },
      { lat: 35.123456, lng: 129.000001 },
    ]
    for (const at of ok) expect(checkQuery({ kind: 'k-point', at }), JSON.stringify(at)).toEqual({ kind: 'k-point', at })
    const bad: unknown[] = [
      { lat: 32.999999, lng: 127 },
      { lat: 39.000001, lng: 127 },
      { lat: 37, lng: 123.999999 },
      { lat: 37, lng: 132.000001 },
      { lat: 37.1234567, lng: 127 },
      { lat: 37, lng: 127.1234567 },
      { lat: '37.5', lng: 127 },
      { lat: Number.NaN, lng: 127 },
      { lat: Number.POSITIVE_INFINITY, lng: 127 },
      { lat: 37 },
      { lat: 37, lng: 127, alt: 0 },
      [37, 127],
      null,
      '37.5,127',
    ]
    for (const at of bad) expect(checkQuery({ kind: 'k-point', at }), JSON.stringify(at)).toBeNull()
    // 점이 있는 다른 종류도 같은 검사
    for (const kind of ['k-near', 'k-keyword', 'stores', 'hosp-list', 'hosp-hours'] as const)
      expect(checkQuery(withField(kind, 'at', { lat: 40, lng: 127 })), kind).toBeNull()
  })

  it('AC-7903.2: 카카오 장소 찾기 r은 1~20,000m 정수, 분류는 SW8·MT1·PM9·HP8·AG2, 키워드는 산업단지만', () => {
    for (const r of [1, 20_000]) expect(checkQuery(withField('k-near', 'r', r)), String(r)).not.toBeNull()
    for (const r of [0, 20_001, 99.5, -1, '1000', null])
      expect(checkQuery(withField('k-near', 'r', r)), String(r)).toBeNull()
    for (const r of [0, 20_001]) expect(checkQuery(withField('k-keyword', 'r', r)), String(r)).toBeNull()
    for (const cat of ['SW8', 'MT1', 'PM9', 'HP8', 'AG2'])
      expect(checkQuery(withField('k-near', 'cat', cat)), cat).not.toBeNull()
    for (const cat of ['SC4', 'CE7', 'pm9', '', null]) expect(checkQuery(withField('k-near', 'cat', cat)), String(cat)).toBeNull()
    for (const q of ['산업 단지', '공단', '', '정형외과']) expect(checkQuery(withField('k-keyword', 'q', q)), q).toBeNull()
  })

  it('AC-7903.2: 주소 찾기 q는 앞뒤 공백을 뺀 2~100자이고 줄바꿈·제어 글자는 받지 않는다', () => {
    expect(checkQuery({ kind: 'k-address', q: '  서울특별시청 ' })).toEqual({ kind: 'k-address', q: '서울특별시청' })
    expect(checkQuery({ kind: 'k-address', q: '시청' })).not.toBeNull()
    expect(checkQuery({ kind: 'k-address', q: '가'.repeat(100) })).not.toBeNull()
    for (const q of ['가', ' 가 ', '가'.repeat(101), '', '   ', '서울\n중구', '서울\t중구', '서울\u0000중구', 12345, null])
      expect(checkQuery({ kind: 'k-address', q }), JSON.stringify(q)).toBeNull()
  })

  it('AC-7903.2: 인구·세대 행정동 코드는 10자리 숫자 1~40개(겹침 없음), 연월은 2022-10부터', () => {
    const forty = Array.from({ length: 40 }, (_, i) => String(1111051500 + i))
    for (const kind of ['pop-age', 'household'] as const) {
      expect(checkQuery(withField(kind, 'dongs', forty)), kind).not.toBeNull()
      for (const dongs of [[], [...forty, '1111099999'], ['111105150'], ['11110515000'], ['1111O51500'], [1111051500], ['1111051500', '1111051500'], '1111051500'])
        expect(checkQuery(withField(kind, 'dongs', dongs)), `${kind} ${JSON.stringify(dongs)}`).toBeNull()
      expect(checkQuery(withField(kind, 'ym', '2022-10')), kind).not.toBeNull()
      for (const ym of ['2022-09', '2026-13', '2026-00', '2026-1', '202610', '2026-10-01', '', null])
        expect(checkQuery(withField(kind, 'ym', ym)), `${kind} ${String(ym)}`).toBeNull()
    }
  })

  it('AC-7903.2: 사람 흐름은 시도 2자리·시군구 5자리(그 시도 안)·연월, 버스·도시철도는 시군구 5자리', () => {
    for (const [sido, sgg] of [['26', '11110'], ['1', '11110'], ['111', '11110'], ['11', '1111'], ['11', '111100'], ['11', '11A10']])
      expect(checkQuery({ kind: 'flow-volume', sido, sgg, ym: '2026-10' }), `${sido} ${sgg}`).toBeNull()
    for (const ym of ['2026-13', '1999-12', '26-10']) expect(checkQuery(withField('flow-volume', 'ym', ym)), ym).toBeNull()
    for (const kind of ['flow-bus', 'flow-rail'] as const)
      for (const sgg of ['1111', '111100', 'abcde', 11110]) expect(checkQuery(withField(kind, 'sgg', sgg)), `${kind} ${sgg}`).toBeNull()
  })

  it('AC-7903.2: 시도·시군구 이름은 한글·숫자(사이 공백 하나) 2~40자', () => {
    for (const name of ['종로구', '수원시 장안구', '세종특별자치시']) expect(checkQuery(withField('gym', 'sggName', name)), name).not.toBeNull()
    for (const name of ['구', ' 종로구', '종로구 ', '수원시  장안구', 'Jongno', '종로구;', '가'.repeat(41), '', null])
      for (const kind of ['gym', 'senior', 'market', 'school'] as const)
        expect(checkQuery(withField(kind, 'sggName', name)), `${kind} ${String(name)}`).toBeNull()
    for (const field of ['sidoName', 'sggName']) expect(checkQuery(withField('accident', field, 'x')), field).toBeNull()
    expect(checkQuery(withField('presale', 'sidoName', '경기도<script>'))).toBeNull()
  })

  it('AC-7903.2: 단지 목록은 법정동 10자리, 단지 정보는 영문·숫자 1~20자 단지 코드', () => {
    for (const bjd of ['111101010', '11110101000', '111101010A', 1111010100]) expect(checkQuery(withField('apt-list', 'bjd', bjd)), String(bjd)).toBeNull()
    for (const complex of ['', 'A'.repeat(21), 'A1002-875', 'A1002 875']) expect(checkQuery(withField('apt-info', 'complex', complex)), complex).toBeNull()
  })

  it('AC-7903.2: 분양 기간은 시작 ≤ 끝인 연월 둘', () => {
    expect(checkQuery(withField('presale', 'to', '2026-01'))).not.toBeNull()
    expect(checkQuery(withField('presale', 'to', '2025-12'))).toBeNull()
    expect(checkQuery(withField('presale', 'from', '2026-1'))).toBeNull()
  })

  it('AC-7903.2: 실거래는 시군구 5자리·연월', () => {
    for (const kind of ['apt-trade', 'biz-trade'] as const) {
      expect(checkQuery(withField(kind, 'sgg', '1111')), kind).toBeNull()
      expect(checkQuery(withField(kind, 'ym', '2026-5')), kind).toBeNull()
    }
  })

  it('AC-7903.2: 가게 r은 30~2,000m 정수', () => {
    for (const r of [30, 2000]) expect(checkQuery(withField('stores', 'r', r)), String(r)).not.toBeNull()
    for (const r of [29, 2001, 100.5]) expect(checkQuery(withField('stores', 'r', r)), String(r)).toBeNull()
  })

  it('AC-7903.2: 건축물대장은 시군구 5·법정동 5·본번 4·부번 4자리 숫자와 대지 구분 0·1', () => {
    for (const kind of ['bld-title', 'bld-floor'] as const) {
      for (const [field, value] of [
        ['sgg', '1111'],
        ['bjdong', '101000'],
        ['bun', '12'],
        ['bun', '00012'],
        ['ji', '3'],
        ['ji', 'abcd'],
        ['plat', '2'],
        ['plat', 0],
      ] as const)
        expect(checkQuery(withField(kind, field, value)), `${kind} ${field} ${String(value)}`).toBeNull()
    }
  })

  it('AC-7903.2: 의원 목록은 r 1~20,000m와 무리 clinic·korean·big', () => {
    for (const group of ['clinic', 'korean', 'big']) expect(checkQuery(withField('hosp-list', 'group', group)), group).not.toBeNull()
    for (const group of ['hospital', '', 'CLINIC']) expect(checkQuery(withField('hosp-list', 'group', group)), group).toBeNull()
    for (const r of [0, 20_001]) expect(checkQuery(withField('hosp-list', 'r', r)), String(r)).toBeNull()
  })

  it('AC-7903.2: 기관 기호는 1~200자(영문·숫자·+/=), 비급여 항목 코드는 영문·숫자 1~20자', () => {
    for (const ykiho of ['', 'a'.repeat(201), 'JDQ4 MTg4', 'JDQ4&MTg4']) {
      expect(checkQuery(withField('hosp-detail', 'ykiho', ykiho)), ykiho).toBeNull()
      expect(checkQuery(withField('nonpay', 'ykiho', ykiho)), ykiho).toBeNull()
    }
    for (const item of ['', 'M'.repeat(21), 'MX-122']) expect(checkQuery(withField('nonpay', 'item', item)), item).toBeNull()
  })

  it('AC-7903.2: 의원 인허가는 open·close와 있는 날짜 둘(시작 ≤ 끝, 최대 3년)', () => {
    expect(checkQuery(withField('clinic-license', 'event', 'close'))).not.toBeNull()
    for (const event of ['opened', 'OPEN', '']) expect(checkQuery(withField('clinic-license', 'event', event)), event).toBeNull()
    // 3년 꼭 맞는 끝은 되고 하루 넘으면 안 된다. 윤날 시작은 3년 뒤 2월 28일까지
    expect(checkQuery({ ...VALID['clinic-license'], from: '2023-11-22', to: '2026-11-22' })).not.toBeNull()
    expect(checkQuery({ ...VALID['clinic-license'], from: '2023-11-22', to: '2026-11-23' })).toBeNull()
    expect(checkQuery({ ...VALID['clinic-license'], from: '2024-02-29', to: '2027-02-28' })).not.toBeNull()
    expect(checkQuery({ ...VALID['clinic-license'], from: '2024-02-29', to: '2027-03-01' })).toBeNull()
    expect(checkQuery({ ...VALID['clinic-license'], from: '2026-11-22', to: '2026-11-22' })).not.toBeNull()
    expect(checkQuery({ ...VALID['clinic-license'], from: '2026-11-23', to: '2026-11-22' })).toBeNull()
    for (const day of ['2026-02-30', '2026-11-1', '20261122', '2026/11/22', null])
      expect(checkQuery(withField('clinic-license', 'to', day)), String(day)).toBeNull()
  })

  it('AC-7903.2: 받은 몸통은 정해 둔 칸만 담은 새 객체다(원본과 따로)', () => {
    const body = { kind: 'k-near', at: { lat: 37.5, lng: 127 }, r: 500, cat: 'SW8' }
    const q = checkQuery(body)
    expect(q).toEqual(body)
    expect(q).not.toBe(body)
    if (q === null || q.kind !== 'k-near') throw new Error('k-near가 아니다')
    expect(q.at).not.toBe(body.at)
    const dongs = ['1111051500']
    const pop = checkQuery({ kind: 'pop-age', dongs, ym: '2026-09' })
    if (pop === null || pop.kind !== 'pop-age') throw new Error('pop-age가 아니다')
    expect(pop.dongs).not.toBe(dongs)
  })
})
