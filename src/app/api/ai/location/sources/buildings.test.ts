import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { landCodes } from '@/lib/location/regions'
import { isSourceId } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import { bldFloor, bldTitle } from './buildings'

// 바깥 자료 — 건축물대장 표제부·층별개요(specs/location TASK-20, REQ-7904, design.md 4·5절).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/buildings/의 지어낸 답(가상도 가람구 나래동, 해솔빌딩 등)과
// 이 파일 안에서 만든 쪽 답뿐이다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/buildings/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
const BASE = 'https://apis.data.go.kr/1613000/BldRgstHubService'
const MAIN = '99110-100000002' // 해솔빌딩(주건축물)
const ANNEX = '99110-100000001' // 솔빛창고(부속건축물)

// 법정동 코드·본번·부번·산 → 건축물대장 열쇠(design.md 5절, regions.ts landCodes)
function keyOf(lot: { bcode: string; main: number; sub: number; san: boolean }) {
  const codes = landCodes(lot)
  if (codes === null) throw new Error('견본 지번 모양이 틀렸어요')
  return { sgg: codes.sigunguCd, bjdong: codes.bjdongCd, bun: codes.bun, ji: codes.ji, plat: codes.platGbCd }
}
const KEY = keyOf({ bcode: '9911010100', main: 12, sub: 3, san: false })
const TITLE_Q: QueryOf<'bld-title'> = { kind: 'bld-title', ...KEY }
const FLOOR_Q: QueryOf<'bld-floor'> = { kind: 'bld-floor', ...KEY }

function split(url: string) {
  const u = new URL(url)
  return { at: `${u.origin}${u.pathname}`, params: Object.fromEntries(u.searchParams) }
}

// 공공데이터포털 JSON 쪽 답 하나(items가 ''면 빈 쪽)
function page(items: unknown, totalCount: number, resultCode = '00') {
  return JSON.stringify({
    response: {
      header: { resultCode, resultMsg: resultCode === '00' ? 'NORMAL SERVICE.' : 'ERROR' },
      body: { items: items === '' ? '' : { item: items }, numOfRows: 100, pageNo: 1, totalCount },
    },
  })
}
const floorRows = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => ({
    mgmBldrgstPk: MAIN,
    flrGbCd: '20',
    flrGbCdNm: '지상',
    flrNo: from + i,
    mainPurpsCdNm: '업무시설',
    etcPurps: '',
    area: 10,
  }))

describe('AC-7904.1 요청 — design.md 5절 코드 규칙', () => {
  it('AC-7904.1: bld-title은 건축HUB 표제부를 시군구·법정동·대지 구분·번·지로 한 번 부른다(열쇠는 주소에 없음)', () => {
    const reqs = bldTitle.requests(TITLE_Q)
    expect(reqs).toHaveLength(1)
    expect(split(reqs[0].url)).toStrictEqual({
      at: `${BASE}/getBrTitleInfo`,
      params: { sigunguCd: '99110', bjdongCd: '10100', platGbCd: '0', bun: '0012', ji: '0003', numOfRows: '100', pageNo: '1', _type: 'json' },
    })
    expect(reqs[0].url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 산 지번은 대지 구분 1, 부번이 없으면 0000이다', () => {
    const key = keyOf({ bcode: '9911010100', main: 7, sub: 0, san: true })
    const { params } = split(bldTitle.requests({ kind: 'bld-title', ...key })[0].url)
    expect(params).toMatchObject({ platGbCd: '1', bun: '0007', ji: '0000' })
  })

  it('AC-7904.1: bld-floor는 층별개요를 같은 칸으로 3쪽(100줄씩)까지 부른다', () => {
    const reqs = bldFloor.requests(FLOOR_Q)
    expect(reqs.map((r) => split(r.url))).toStrictEqual(
      [1, 2, 3].map((n) => ({
        at: `${BASE}/getBrFlrOulnInfo`,
        params: { sigunguCd: '99110', bjdongCd: '10100', platGbCd: '0', bun: '0012', ji: '0003', numOfRows: '100', pageNo: String(n), _type: 'json' },
      })),
    )
  })

  it('AC-7904.1: 둘 다 공공데이터포털 열쇠이고 출처 id는 SOURCES에 있는 building이다', () => {
    for (const adapter of [bldTitle, bldFloor]) {
      expect(adapter.key).toBe('data')
      expect(adapter.src).toBe('building')
      expect(isSourceId(adapter.src)).toBe(true)
    }
    expect(bldTitle.kind).toBe('bld-title')
    expect(bldFloor.kind).toBe('bld-floor')
  })

  it('AC-7904.1: 열쇠 칸 모양이 틀리면 요청을 만들지 않는다', () => {
    expect(() => bldTitle.requests({ ...TITLE_Q, bun: '12' })).toThrow()
    expect(() => bldFloor.requests({ ...FLOOR_Q, sgg: '9911' })).toThrow()
    expect(() => bldTitle.requests({ ...TITLE_Q, bjdong: '1010a' })).toThrow()
  })
})

describe('AC-7904.1 표제부 읽기', () => {
  it('AC-7904.1: 용도·구조·층수·연면적(㎡ 버림)·사용승인일·승강기(승용+비상용)·주차(넷 합)를 읽고 주건축물이 먼저, 기준 날짜는 받은 날이다', () => {
    expect(bldTitle.parse([fixture('title.json')], TITLE_Q, TODAY)).toStrictEqual({
      ok: true,
      asOf: TODAY,
      value: {
        buildings: [
          {
            pk: MAIN,
            usage: '제1종근린생활시설(의원,소매점,사무소)',
            structure: '철근콘크리트구조',
            above: 5,
            below: 2,
            totalM2: 1234.56,
            approvedOn: '2015-03-10',
            elevators: 2,
            parking: 12,
          },
          {
            pk: ANNEX,
            usage: '창고시설(창고)',
            structure: '경량철골구조',
            above: 1,
            below: 0,
            totalM2: 30.5,
            approvedOn: '2016-01-02',
            elevators: null,
            parking: null,
          },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: 승강기·주차 칸이 없거나 비면 null, 0이면 0이다(확인할 것 4) · 글자 숫자 · 빈 사용승인일은 null · 한 줄 답(배열 아님)', () => {
    expect(bldTitle.parse([fixture('title-one.json')], TITLE_Q, TODAY)).toStrictEqual({
      ok: true,
      asOf: TODAY,
      value: {
        buildings: [
          {
            pk: '99110-100000003',
            usage: '근린생활시설',
            structure: '벽돌조',
            above: 3,
            below: 0,
            totalM2: 456.78,
            approvedOn: null,
            elevators: null,
            parking: 0,
          },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: 기타 용도가 주용도를 품으면(진짜 답 주용도 제1종근린생활시설 · 기타 용도 제1종근린생활시설(지역자치센터)) 기타 용도만 쓴다 — 층별개요도 같다', () => {
    const rows = [
      { mgmBldrgstPk: 'A', mainAtchGbCd: '0', totArea: 100, mainPurpsCdNm: '제1종근린생활시설', etcPurps: '제1종근린생활시설(지역자치센터)' },
      { mgmBldrgstPk: 'B', mainAtchGbCd: '0', totArea: 50, mainPurpsCdNm: '제1종근린생활시설', etcPurps: '파출소' },
    ]
    const got = bldTitle.parse([page(rows, 2)], TITLE_Q, TODAY)
    expect(got.ok && got.value.buildings.map((b) => b.usage)).toEqual(['제1종근린생활시설(지역자치센터)', '제1종근린생활시설(파출소)'])
    const floors = [{ mgmBldrgstPk: 'A', flrGbCd: '20', flrNo: 1, mainPurpsCdNm: '지역자치센터', etcPurps: '제1종근린생활시설(지역자치센터)', area: 10 }]
    const floor = bldFloor.parse([page(floors, 1), fixture('floor-empty.json'), fixture('floor-empty.json')], FLOOR_Q, TODAY)
    expect(floor.ok && floor.value.floors.map((f) => f.usage)).toEqual(['제1종근린생활시설(지역자치센터)'])
  })

  it('AC-7904.1: 없는 날짜(20230230)·0인 사용승인일은 null이고, 승강기 칸이 하나만 있으면 그 값이다', () => {
    const rows = [
      { mgmBldrgstPk: 'A', mainAtchGbCd: '0', totArea: 100, useAprDay: '20230230', rideUseElvtCnt: '3' },
      { mgmBldrgstPk: 'B', mainAtchGbCd: '0', totArea: 50, useAprDay: '0', emgenUseElvtCnt: 0, oudrAutoUtcnt: 2 },
    ]
    const got = bldTitle.parse([page(rows, 2)], TITLE_Q, TODAY)
    expect(got.ok && got.value).toMatchObject({
      buildings: [
        { pk: 'A', approvedOn: null, elevators: 3, parking: null },
        { pk: 'B', approvedOn: null, elevators: 0, parking: 2 },
      ],
    })
  })

  it('AC-7904.1: 위반 건축물 칸은 읽지 않는다(답에 있어도 값에 없다)', () => {
    // title.json 주건축물 줄의 vltnBldYn은 이 시험을 위해 지어낸 '위반 건축물' 칸이다
    expect(fixture('title.json')).toContain('"vltnBldYn": "Y"')
    const got = bldTitle.parse([fixture('title.json')], TITLE_Q, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    for (const b of (got.value as { buildings: object[] }).buildings) {
      expect(Object.keys(b).sort()).toEqual(
        ['above', 'approvedOn', 'below', 'elevators', 'parking', 'pk', 'structure', 'totalM2', 'usage'].sort(),
      )
    }
  })
})

describe('AC-7904.1 층별개요 읽기', () => {
  it('AC-7904.1: 층 이름은 지1·1·옥탑, 아래층부터 차례(같은 층은 답 차례)이고 용도는 주용도(기타 용도), ㎡는 버림이다', () => {
    const texts = [fixture('floor-1.json'), fixture('floor-empty.json'), fixture('floor-empty.json')]
    expect(bldFloor.parse(texts, FLOOR_Q, TODAY)).toStrictEqual({
      ok: true,
      asOf: TODAY,
      value: {
        floors: [
          { pk: MAIN, label: '지2', usage: '주차장', m2: 230 },
          { pk: MAIN, label: '지1', usage: '제2종근린생활시설(노래연습장)', m2: 210 },
          { pk: MAIN, label: '1', usage: '제1종근린생활시설(소매점)', m2: 120.45 },
          { pk: MAIN, label: '1', usage: '제1종근린생활시설(의원)', m2: 80 },
          { pk: ANNEX, label: '1', usage: '창고시설(창고)', m2: 30.5 },
          { pk: MAIN, label: '2', usage: '제1종근린생활시설(의원)', m2: 200 },
          { pk: MAIN, label: '3', usage: '제2종근린생활시설(사무소)', m2: 200.12 },
          { pk: MAIN, label: '옥탑', usage: '제1종근린생활시설(계단실)', m2: 12.5 },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: 옥탑 2층은 옥탑2, 층 구분 코드가 없으면 구분 이름으로, 둘 다 없으면 층 이름 글(층 뺌)·그것도 없으면 층 모름(맨 뒤)', () => {
    const rows = [
      { mgmBldrgstPk: MAIN, flrGbCd: '30', flrGbCdNm: '옥탑', flrNo: 2, mainPurpsCdNm: '계단실', area: 5 },
      { mgmBldrgstPk: MAIN, flrGbCd: '', flrGbCdNm: '', flrNo: '', flrNoNm: '중2층', mainPurpsCdNm: '업무시설', area: 40 },
      { mgmBldrgstPk: MAIN, flrGbCd: '', flrNoNm: '', mainPurpsCdNm: '업무시설', area: '' },
      { mgmBldrgstPk: MAIN, flrGbCd: '20', flrNo: '4', mainPurpsCdNm: '업무시설', area: '99.999' },
      { mgmBldrgstPk: MAIN, flrGbCdNm: '지하', flrNo: 3, mainPurpsCdNm: '', etcPurps: '기계실', area: 60 },
    ]
    const got = bldFloor.parse([page(rows, 5), page('', 5), page('', 5)], FLOOR_Q, TODAY)
    expect(got.ok && got.value).toStrictEqual({
      floors: [
        { pk: MAIN, label: '지3', usage: '기계실', m2: 60 },
        { pk: MAIN, label: '4', usage: '업무시설', m2: 99.99 },
        { pk: MAIN, label: '옥탑2', usage: '계단실', m2: 5 },
        { pk: MAIN, label: '중2', usage: '업무시설', m2: 40 },
        { pk: MAIN, label: '층 모름', usage: '업무시설', m2: 0 },
      ],
      capped: false,
    })
  })

  it('AC-7904.1: 여러 쪽 답을 이어 읽는다', () => {
    const got = bldFloor.parse([page(floorRows(100), 120), page(floorRows(20, 101), 120), page('', 120)], FLOOR_Q, TODAY)
    if (!got.ok) throw new Error('읽기 실패')
    const { floors, capped } = got.value as { floors: { label: string }[]; capped: boolean }
    expect(floors).toHaveLength(120)
    expect(floors[0].label).toBe('1')
    expect(floors[119].label).toBe('120')
    expect(capped).toBe(false)
  })
})

describe('AC-7904.3 쪽 한도', () => {
  it('AC-7904.3: 층별개요가 3쪽(300줄)을 넘으면 300줄과 capped: true다', () => {
    const texts = [page(floorRows(100), 301), page(floorRows(100, 101), 301), page(floorRows(100, 201), 301)]
    const got = bldFloor.parse(texts, FLOOR_Q, TODAY)
    expect(got.ok && got.value).toMatchObject({ capped: true })
    expect(got.ok && (got.value as { floors: unknown[] }).floors).toHaveLength(300)
  })

  it('AC-7904.3: 딱 300줄이면 capped: false다', () => {
    const texts = [page(floorRows(100), 300), page(floorRows(100, 101), 300), page(floorRows(100, 201), 300)]
    expect(bldFloor.parse(texts, FLOOR_Q, TODAY)).toMatchObject({ ok: true, value: { capped: false } })
  })

  it('AC-7904.3: 표제부는 한 쪽(100줄)이라 그보다 많으면 capped: true다', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ mgmBldrgstPk: `P${i}`, mainAtchGbCd: '0', totArea: i + 1 }))
    const got = bldTitle.parse([page(rows, 101)], TITLE_Q, TODAY)
    expect(got.ok && got.value).toMatchObject({ capped: true })
    expect(got.ok && (got.value as { buildings: { pk: string }[] }).buildings[0].pk).toBe('P99')
  })
})

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답은 실패가 아니라 빈 목록이다(표제부·층별개요, 자료 없음 03·빈 items도)', () => {
    const empty = fixture('empty.json')
    expect(bldTitle.parse([empty], TITLE_Q, TODAY)).toStrictEqual({ ok: true, asOf: TODAY, value: { buildings: [], capped: false } })
    expect(bldFloor.parse([empty, empty, empty], FLOOR_Q, TODAY)).toStrictEqual({
      ok: true,
      asOf: TODAY,
      value: { floors: [], capped: false },
    })
    const noData = JSON.stringify({ response: { header: { resultCode: '03', resultMsg: 'NODATA_ERROR' } } })
    expect(bldTitle.parse([noData], TITLE_Q, TODAY)).toStrictEqual({ ok: true, asOf: TODAY, value: { buildings: [], capped: false } })
    const bareItems = JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: {}, totalCount: 0 } } })
    expect(bldTitle.parse([bareItems], TITLE_Q, TODAY)).toMatchObject({ ok: true, value: { buildings: [] } })
  })

  it('AC-7904.2: 활용신청 안 됨(미등록 열쇠) 답은 not-applied다', () => {
    const xml = fixture('not-registered.json')
    expect(bldTitle.parse([xml], TITLE_Q, TODAY)).toStrictEqual({ ok: false, code: 'not-applied' })
    expect(bldFloor.parse([fixture('floor-1.json'), xml, xml], FLOOR_Q, TODAY)).toStrictEqual({ ok: false, code: 'not-applied' })
    const json = JSON.stringify({ response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } } })
    expect(bldTitle.parse([json], TITLE_Q, TODAY)).toStrictEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀리면 failed다', () => {
    const broken = [
      '<html><body>점검 중</body></html>',
      '{',
      '{}',
      '[]',
      JSON.stringify({ response: { header: { resultCode: '99', resultMsg: 'UNKNOWN_ERROR' } } }),
      JSON.stringify({ response: { header: { resultCode: '22', resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } } }),
      JSON.stringify({ response: { header: { resultCode: '00' } } }),
      JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [{ mgmBldrgstPk: 'A' }] } } } }),
      JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: ['글자'] }, totalCount: 1 } } }),
      JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: '글자', totalCount: 1 } } }),
    ]
    for (const text of broken) {
      expect(bldTitle.parse([text], TITLE_Q, TODAY)).toStrictEqual({ ok: false, code: 'failed' })
      expect(bldFloor.parse([fixture('floor-1.json'), text, text], FLOOR_Q, TODAY)).toStrictEqual({ ok: false, code: 'failed' })
    }
    expect(bldTitle.parse([], TITLE_Q, TODAY)).toStrictEqual({ ok: false, code: 'failed' })
  })
})
