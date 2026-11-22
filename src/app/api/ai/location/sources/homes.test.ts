import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSourceId } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import {
  APT_LIST_PAGES,
  APT_LIST_ROWS,
  PRESALE_AREA,
  PRESALE_PAGES,
  PRESALE_ROWS,
  aptInfoAdapter,
  aptListAdapter,
  presaleAdapter,
} from './homes'

// 아파트 단지·입주 예정(specs/location REQ-7904 AC-7904.1~3, design.md 4절 homes 묶음 — TASK-14).
// 진짜 사이트는 부르지 않는다. 답은 포털 문서 모양에 지어낸 값을 넣은 가짜 파일(fixtures/location/api/homes)이고,
// 지명·단지 이름은 모두 지어낸 것이다('가상도'는 동 경계 견본 fixtures/location/dongs와 같은 가짜 시도)
const fixture = (name: string) => readFileSync(new URL(`../../../../../../fixtures/location/api/homes/${name}`, import.meta.url), 'utf8')
const APT_LIST = fixture('apt-list.json')
const APT_LIST_AFTER = fixture('apt-list-after.json')
const APT_LIST_EMPTY = fixture('apt-list-empty.json')
const NODATA = fixture('nodata.json')
const NOT_REGISTERED = fixture('not-registered.xml')
const APT_INFO = fixture('apt-info.json')
const APT_INFO_EMPTY = fixture('apt-info-empty.json')
const PRESALE = fixture('presale.json')
const PRESALE_AFTER = fixture('presale-after.json')
const PRESALE_EMPTY = fixture('presale-empty.json')
const PRESALE_NOT_REGISTERED = fixture('presale-not-registered.json')

const TODAY = '2026-11-22'
const LIST_Q: QueryOf<'apt-list'> = { kind: 'apt-list', bjd: '9911010100' }
const INFO_Q: QueryOf<'apt-info'> = { kind: 'apt-info', complex: 'A99000001' }
const PRESALE_Q: QueryOf<'presale'> = { kind: 'presale', sidoName: '가상도', from: '2024-01', to: '2026-02' }

const NOT_APPLIED = { ok: false, code: 'not-applied' }
const FAILED = { ok: false, code: 'failed' }

type Json = Record<string, unknown>
const clone = (text: string) => JSON.parse(text) as Json

// 공공데이터포털 답 모양(response.header·body)을 만든다
const portal = (body: unknown, resultCode: unknown = '00') =>
  JSON.stringify({ response: { header: { resultCode, resultMsg: 'NORMAL SERVICE' }, body } })
const listPage = (rows: Json[], totalCount: unknown, pageNo = 1) =>
  portal({ items: rows, numOfRows: String(APT_LIST_ROWS), pageNo: String(pageNo), totalCount })
const complexRow = (n: number) => ({ bjdCode: '9911010100', kaptCode: `A99${String(n).padStart(6, '0')}`, kaptName: `가상 ${n}단지` })
const infoWith = (item: Json) => {
  const doc = clone(APT_INFO) as { response: { body: { item: Json } } }
  doc.response.body.item = { ...doc.response.body.item, ...item }
  return JSON.stringify(doc)
}

// 청약홈(odcloud) 답 모양
type PresaleDoc = { data: Json[]; matchCount: number } & Json
const presaleRows = () => (clone(PRESALE) as PresaleDoc).data
const presalePage = (data: Json[], matchCount: number, page = 1) =>
  JSON.stringify({ currentCount: data.length, data, matchCount, page, perPage: PRESALE_ROWS, totalCount: 5000 })
const presaleRow = (n: number) => ({ ...presaleRows()[0], HOUSE_MANAGE_NO: `2099${String(n).padStart(6, '0')}`, HOUSE_NM: `가상 분양 ${n}` })

// 답 값 안 어디에도 좌표 칸이 없다(세 자료 모두 좌표가 없다, 조사 1)
function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out)
  else if (typeof v === 'object' && v !== null)
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      keysDeep(x, out)
    }
  return out
}
const COORD_KEYS = ['lat', 'lng', 'x', 'y', 'at', 'point', 'distM']

const params = (url: string) => {
  const u = new URL(url)
  return { base: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams) }
}

describe('AC-7904.1 세 종류의 읽는 곳 모양 · 출처', () => {
  it('AC-7904.1: 종류·열쇠·출처 id가 정해 둔 값이고 출처는 SOURCES에 있다', () => {
    expect([aptListAdapter.kind, aptInfoAdapter.kind, presaleAdapter.kind]).toEqual(['apt-list', 'apt-info', 'presale'])
    expect([aptListAdapter.src, aptInfoAdapter.src, presaleAdapter.src]).toEqual(['apt-list', 'apt-info', 'presale'])
    for (const a of [aptListAdapter, aptInfoAdapter, presaleAdapter]) {
      expect(a.key).toBe('data')
      expect(isSourceId(a.src)).toBe(true)
    }
  })
})

describe('AC-7904.1 apt-list 공동주택 단지 목록', () => {
  it('AC-7904.1: 법정동 코드로 3쪽(100줄씩)을 정해 둔 주소·칸으로 요청하고, 주소에 열쇠는 없다', () => {
    const reqs = aptListAdapter.requests(LIST_Q)
    expect(APT_LIST_PAGES).toBe(3)
    expect(APT_LIST_ROWS).toBe(100)
    expect(reqs).toHaveLength(3)
    expect(reqs.map((r) => params(r.url))).toEqual(
      [1, 2, 3].map((page) => ({
        base: 'https://apis.data.go.kr/1613000/AptListService3/getLegaldongAptList3',
        query: { bjdCode: '9911010100', pageNo: String(page), numOfRows: '100', _type: 'json' },
      })),
    )
    for (const r of reqs) expect(r.url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 답은 단지 코드·이름 목록과 capped이고, 기준 날짜는 받은 날이다(자료 안에 날짜 없음)', () => {
    const got = aptListAdapter.parse([APT_LIST, APT_LIST_AFTER, APT_LIST_AFTER], LIST_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      value: {
        complexes: [
          { code: 'A99000001', name: '가람마을 1단지' },
          { code: 'A99000002', name: '누리뜰' },
          { code: 'A99000003', name: '다솜채 2단지' },
        ],
        capped: false,
      },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: items가 {item: [...]}·{item: {...}} 모양이어도 읽고, 코드·이름이 빈 줄과 쪽 사이 겹친 단지는 뺀다', () => {
    const rows = [complexRow(1), { ...complexRow(2), kaptName: '  ' }, { ...complexRow(3), kaptCode: '' }, { ...complexRow(4), kaptCode: 'A99-04' }]
    const page1 = portal({ items: { item: rows }, totalCount: '5' })
    const page2 = portal({ items: { item: complexRow(1) }, totalCount: '5' })
    const page3 = portal({ items: { item: { ...complexRow(5), kaptName: ' 가상 5단지 ' } }, totalCount: '5' })
    const got = aptListAdapter.parse([page1, page2, page3], LIST_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      value: { complexes: [{ code: 'A99000001', name: '가상 1단지' }, { code: 'A99000005', name: '가상 5단지' }], capped: false },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: 단지 목록 답에 좌표 칸이 없다', () => {
    const got = aptListAdapter.parse([APT_LIST, APT_LIST_AFTER, APT_LIST_AFTER], LIST_Q, TODAY)
    expect(got.ok).toBe(true)
    expect(keysDeep(got).filter((k) => COORD_KEYS.includes(k))).toEqual([])
  })
})

describe('AC-7904.1 apt-info 공동주택 기본 정보', () => {
  it('AC-7904.1: 단지 코드 하나를 정해 둔 주소·칸으로 한 번 요청하고, 주소에 열쇠는 없다', () => {
    const reqs = aptInfoAdapter.requests(INFO_Q)
    expect(reqs.map((r) => params(r.url))).toEqual([
      { base: 'https://apis.data.go.kr/1613000/AptBasisInfoServiceV4/getAphusBassInfoV4', query: { kaptCode: 'A99000001', _type: 'json' } },
    ])
    expect(reqs[0].url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 답은 단지 코드·이름·세대 수·지은 해(사용승인일의 해)·동 수이고 기준 날짜는 받은 날이다', () => {
    expect(aptInfoAdapter.parse([APT_INFO], INFO_Q, TODAY)).toEqual({
      ok: true,
      value: { code: 'A99000001', name: '가람마을 1단지', households: 1234, builtYear: 2009, buildings: 12 },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: 사용승인일 → 지은 해 — 8자리·줄 그은 날은 그 해, 없는 날·빈칸·오늘 뒤는 null', () => {
    const year = (kaptUsedate: unknown) => {
      const got = aptInfoAdapter.parse([infoWith({ kaptUsedate })], INFO_Q, TODAY)
      return got.ok ? (got.value as { builtYear: number | null }).builtYear : 'failed'
    }
    expect(year('20090315')).toBe(2009)
    expect(year('1988-12-01')).toBe(1988)
    expect(year(' 20261122 ')).toBe(2026) // 오늘과 같은 날
    expect(year('20261123')).toBeNull() // 오늘 뒤
    expect(year('20090230')).toBeNull() // 없는 날
    expect(year('200903')).toBeNull()
    expect(year('')).toBeNull()
    expect(year(null)).toBeNull()
    expect(year(20090315)).toBe(2009) // 숫자로 와도
  })

  it('AC-7904.1: 세대·동 수는 0 이상 정수(숫자·숫자 글자·쉼표 글자)만, 아니면 null', () => {
    const counts = (kaptdaCnt: unknown, kaptDongCnt: unknown) => {
      const got = aptInfoAdapter.parse([infoWith({ kaptdaCnt, kaptDongCnt })], INFO_Q, TODAY)
      if (!got.ok) return 'failed'
      const v = got.value as { households: number | null; buildings: number | null }
      return [v.households, v.buildings]
    }
    expect(counts(1234, 12)).toEqual([1234, 12])
    expect(counts('1,234', ' 3 ')).toEqual([1234, 3])
    expect(counts('', null)).toEqual([null, null])
    expect(counts('12.5', -1)).toEqual([null, null])
    expect(counts('약 300', 'x')).toEqual([null, null])
  })

  it('AC-7904.1: 기본 정보 답에 좌표 칸이 없다', () => {
    const got = aptInfoAdapter.parse([APT_INFO], INFO_Q, TODAY)
    expect(got.ok && got.value).not.toBeNull()
    expect(keysDeep(got).filter((k) => COORD_KEYS.includes(k))).toEqual([])
  })
})

describe('AC-7904.1 presale 청약홈 분양정보(입주 예정)', () => {
  it('AC-7904.1: 시도 이름·모집공고 기간으로 3쪽(200줄씩)을 정해 둔 주소·칸으로 요청하고, 주소에 열쇠는 없다', () => {
    const reqs = presaleAdapter.requests(PRESALE_Q)
    expect(PRESALE_PAGES).toBe(3)
    expect(PRESALE_ROWS).toBe(200)
    expect(reqs.map((r) => params(r.url))).toEqual(
      [1, 2, 3].map((page) => ({
        base: 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail',
        query: {
          page: String(page),
          perPage: '200',
          returnType: 'JSON',
          'cond[SUBSCRPT_AREA_CODE_NM::EQ]': '가상도',
          'cond[RCRIT_PBLANC_DE::GTE]': '2024-01-01',
          'cond[RCRIT_PBLANC_DE::LTE]': '2026-02-28', // 끝 달의 말일
        },
      })),
    )
    for (const r of reqs) expect(r.url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 시·도 정식 이름은 청약홈 공급지역 이름(짧은 이름)으로 바꿔 보내고, 짧은 이름은 그대로 보낸다', () => {
    const area = (sidoName: string) =>
      new URL(presaleAdapter.requests({ ...PRESALE_Q, sidoName })[0].url).searchParams.get('cond[SUBSCRPT_AREA_CODE_NM::EQ]')
    const entries = Object.entries(PRESALE_AREA)
    expect(new Set(entries.map(([, short]) => short)).size).toBe(17) // 시·도 열일곱
    for (const [full, short] of entries) {
      expect(area(full)).toBe(short)
      expect(area(short)).toBe(short)
    }
  })

  it('AC-7904.1: 답은 단지 이름·세대·입주 연월(YYYY-MM)·주소 목록과 capped이고, 기준 날짜는 받은 날이다', () => {
    expect(presaleAdapter.parse([PRESALE, PRESALE_AFTER, PRESALE_AFTER], PRESALE_Q, TODAY)).toEqual({
      ok: true,
      value: {
        items: [
          { name: '하늘숲 새뜰', households: 845, moveIn: '2028-08', address: '가상도 가람구 하늘동 200번지 일원' },
          { name: '나래 푸른마을', households: 312, moveIn: '2027-02', address: '가상도 나래구 별빛동 33-1' },
          { name: '다온 리버뷰', households: 1520, moveIn: '2029-11', address: '가상도 가람구 바람동 7' },
        ],
        capped: false,
      },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: 입주 연월 모양 — YYYYMM·YYYY-MM·YYYY.MM은 YYYY-MM, 없는 달·자리 틀림·빈칸은 null', () => {
    const moveIn = (MVN_PREARNGE_YM: unknown) => {
      const rows = [{ ...presaleRows()[0], MVN_PREARNGE_YM }]
      const got = presaleAdapter.parse([presalePage(rows, 1), PRESALE_AFTER, PRESALE_AFTER], PRESALE_Q, TODAY)
      return got.ok ? (got.value as { items: { moveIn: string | null }[] }).items[0].moveIn : 'failed'
    }
    expect(moveIn('202808')).toBe('2028-08')
    expect(moveIn(' 2028-08 ')).toBe('2028-08')
    expect(moveIn('2028.08')).toBe('2028-08')
    expect(moveIn(202808)).toBe('2028-08')
    expect(moveIn('202813')).toBeNull()
    expect(moveIn('202800')).toBeNull()
    expect(moveIn('2028')).toBeNull()
    expect(moveIn('20280815')).toBeNull()
    expect(moveIn('')).toBeNull()
    expect(moveIn(undefined)).toBeNull()
  })

  it('AC-7904.1: 다른 공급지역 줄·이름 빈 줄·쪽 사이 겹친 공고는 빼고, 세대가 정수가 아니면 null, 주소가 없으면 빈 글자다', () => {
    const [a, b] = presaleRows()
    const page1 = presalePage(
      [
        a,
        { ...b, SUBSCRPT_AREA_CODE_NM: '먼바다도' },
        { ...b, HOUSE_MANAGE_NO: '2099000201', HOUSE_NM: ' ' },
        { ...b, HOUSE_MANAGE_NO: '2099000202', HOUSE_NM: '바람결', TOT_SUPLY_HSHLDCO: '미정', HSSPLY_ADRES: undefined },
      ],
      5,
    )
    const page2 = presalePage([a], 5, 2)
    const got = presaleAdapter.parse([page1, page2, PRESALE_AFTER], PRESALE_Q, TODAY)
    expect(got).toEqual({
      ok: true,
      value: {
        items: [
          { name: '하늘숲 새뜰', households: 845, moveIn: '2028-08', address: '가상도 가람구 하늘동 200번지 일원' },
          { name: '바람결', households: null, moveIn: '2027-02', address: '' },
        ],
        capped: false,
      },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: 정식 이름으로 물어도 답 줄은 짧은 공급지역 이름으로 맞춘다', () => {
    const [full, short] = Object.entries(PRESALE_AREA)[0]
    const rows = presaleRows().map((r) => ({ ...r, SUBSCRPT_AREA_CODE_NM: short }))
    const got = presaleAdapter.parse([presalePage(rows, 3), PRESALE_AFTER, PRESALE_AFTER], { ...PRESALE_Q, sidoName: full }, TODAY)
    expect(got.ok && (got.value as { items: unknown[] }).items).toHaveLength(3)
  })

  it('AC-7904.1: 입주 예정 답에 좌표 칸이 없다', () => {
    const got = presaleAdapter.parse([PRESALE, PRESALE_AFTER, PRESALE_AFTER], PRESALE_Q, TODAY)
    expect(got.ok).toBe(true)
    expect(keysDeep(got).filter((k) => COORD_KEYS.includes(k))).toEqual([])
  })
})

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답은 실패가 아니다 — 단지 목록·입주 예정은 빈 목록, 기본 정보는 null', () => {
    const emptyList = { ok: true, value: { complexes: [], capped: false }, asOf: TODAY }
    expect(aptListAdapter.parse([APT_LIST_EMPTY, APT_LIST_EMPTY, APT_LIST_EMPTY], LIST_Q, TODAY)).toEqual(emptyList)
    expect(aptListAdapter.parse([NODATA, NODATA, NODATA], LIST_Q, TODAY)).toEqual(emptyList) // 03 NODATA_ERROR
    expect(aptListAdapter.parse([listPage([], '0'), portal({ items: { item: '' } }), portal('')], LIST_Q, TODAY)).toEqual(emptyList)

    const noInfo = { ok: true, value: null, asOf: TODAY }
    expect(aptInfoAdapter.parse([APT_INFO_EMPTY], INFO_Q, TODAY)).toEqual(noInfo)
    expect(aptInfoAdapter.parse([NODATA], INFO_Q, TODAY)).toEqual(noInfo)
    expect(aptInfoAdapter.parse([portal({ item: null })], INFO_Q, TODAY)).toEqual(noInfo)
    expect(aptInfoAdapter.parse([portal({ item: '' })], INFO_Q, TODAY)).toEqual(noInfo)
    expect(aptInfoAdapter.parse([portal({ item: {} })], INFO_Q, TODAY)).toEqual(noInfo)

    expect(presaleAdapter.parse([PRESALE_EMPTY, PRESALE_EMPTY, PRESALE_EMPTY], PRESALE_Q, TODAY)).toEqual({
      ok: true,
      value: { items: [], capped: false },
      asOf: TODAY,
    })
  })

  it('AC-7904.2: 활용신청 안 됨(미등록 열쇠 답)은 not-applied다 — 어느 쪽에서 와도', () => {
    const json30 = portal(undefined, '30')
    expect(aptListAdapter.parse([NOT_REGISTERED, NOT_REGISTERED, NOT_REGISTERED], LIST_Q, TODAY)).toEqual(NOT_APPLIED)
    expect(aptListAdapter.parse([APT_LIST, APT_LIST_AFTER, json30], LIST_Q, TODAY)).toEqual(NOT_APPLIED)
    expect(aptInfoAdapter.parse([NOT_REGISTERED], INFO_Q, TODAY)).toEqual(NOT_APPLIED)
    expect(aptInfoAdapter.parse([json30], INFO_Q, TODAY)).toEqual(NOT_APPLIED)
    expect(presaleAdapter.parse([PRESALE_NOT_REGISTERED, PRESALE_NOT_REGISTERED, PRESALE_NOT_REGISTERED], PRESALE_Q, TODAY)).toEqual(
      NOT_APPLIED,
    )
    expect(presaleAdapter.parse([PRESALE, NOT_REGISTERED, PRESALE_AFTER], PRESALE_Q, TODAY)).toEqual(NOT_APPLIED)
  })

  it('AC-7904.2: 모양이 틀린 답은 failed다(글자 아님·머리 없음·다른 오류 번호·목록 아닌 items·받은 쪽 수가 다름)', () => {
    const broken = ['<html>점검 중</html>', '', '{"response":{}}', '[]', 'null', portal({ items: [] }, '99'), portal({ items: 7 }), portal(5)]
    for (const text of broken) {
      expect(aptListAdapter.parse([text, APT_LIST_AFTER, APT_LIST_AFTER], LIST_Q, TODAY), text).toEqual(FAILED)
      expect(aptListAdapter.parse([APT_LIST, APT_LIST_AFTER, text], LIST_Q, TODAY), text).toEqual(FAILED)
    }
    expect(aptListAdapter.parse([APT_LIST], LIST_Q, TODAY)).toEqual(FAILED)

    for (const text of ['<html>점검 중</html>', '{"response":{}}', portal({ item: {} }, '22'), portal({ item: 'A99000001' }), portal(5)])
      expect(aptInfoAdapter.parse([text], INFO_Q, TODAY), text).toEqual(FAILED)
    expect(aptInfoAdapter.parse([APT_INFO, APT_INFO], INFO_Q, TODAY)).toEqual(FAILED)
    expect(aptInfoAdapter.parse([], INFO_Q, TODAY)).toEqual(FAILED)

    const presaleBroken = ['<html>점검 중</html>', '{}', '{"data":{}}', '{"code":-1,"msg":"필수 값 없음"}', '[]']
    for (const text of presaleBroken)
      expect(presaleAdapter.parse([text, PRESALE_AFTER, PRESALE_AFTER], PRESALE_Q, TODAY), text).toEqual(FAILED)
    expect(presaleAdapter.parse([PRESALE, PRESALE_AFTER], PRESALE_Q, TODAY)).toEqual(FAILED)
  })
})

describe('AC-7904.3 정해 둔 쪽 수까지만 · 넘으면 capped', () => {
  it('AC-7904.3: 단지 목록 전체 수가 3쪽 × 100줄을 넘으면 받은 300곳과 capped: true, 딱 300이면 false', () => {
    const pages = (total: string) =>
      [0, 1, 2].map((p) =>
        listPage(
          Array.from({ length: APT_LIST_ROWS }, (_, i) => complexRow(p * APT_LIST_ROWS + i + 1)),
          total,
          p + 1,
        ),
      )
    const over = aptListAdapter.parse(pages('301'), LIST_Q, TODAY)
    expect(over.ok && over.value).toMatchObject({ capped: true })
    expect(over.ok && (over.value as { complexes: unknown[] }).complexes).toHaveLength(300)
    const exact = aptListAdapter.parse(pages('300'), LIST_Q, TODAY)
    expect(exact.ok && exact.value).toMatchObject({ capped: false })
  })

  it('AC-7904.3: 입주 예정 맞는 수(matchCount)가 3쪽 × 200줄을 넘으면 capped: true, 딱 600이면 false', () => {
    const pages = (match: number) =>
      [0, 1, 2].map((p) =>
        presalePage(
          Array.from({ length: PRESALE_ROWS }, (_, i) => presaleRow(p * PRESALE_ROWS + i + 1)),
          match,
          p + 1,
        ),
      )
    const over = presaleAdapter.parse(pages(601), PRESALE_Q, TODAY)
    expect(over.ok && over.value).toMatchObject({ capped: true })
    expect(over.ok && (over.value as { items: unknown[] }).items).toHaveLength(600)
    const exact = presaleAdapter.parse(pages(600), PRESALE_Q, TODAY)
    expect(exact.ok && exact.value).toMatchObject({ capped: false })
  })
})
