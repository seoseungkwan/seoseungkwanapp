import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEPTS } from '@/lib/location/depts'
import { isSourceId } from '@/lib/location/sources'
import type { ClinicDeptId, DeptId, QueryOf } from '@/types/location'
import * as clinics from './clinics'
import { LIST_ROWS, TYPE_CODE, hospDetail, hospList } from './clinics'

// 바깥 자료 — 의원 목록·상세(specs/location REQ-7904 AC-7904.1~3, design.md 4·17·18절, TASK-16 · TASK-55).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/clinics/의 지어낸 견본(의원 이름·주소·전화·기호·좌표 모두 지어냄)이다.
// TASK-47(2026-11-22 진짜 열쇠): 목록·장비 칸은 진짜 답과 같았고, 상세는 2.8판, 기타인력 칸은 dtlGnlNopCdNm·gnlNopCnt로 고쳤다.
// TASK-55(2026-11-22 진짜 열쇠): 의원 과목 코드 열아홉(01~16·21·23·25)·치과의원 종별 51·상급종합 01이 진짜 답과 맞았다
// (진료과목정보 getDgsbjtInfo2.8의 코드 ↔ 이름으로 확인). 과목 목록 검색은 부과목까지 찾는다 — 신경외과 목록에 정형외과 의원도 온다.
// list-dental.json · list-ns.json은 그 진짜 답의 칸 차례·값 모양(XPos가 글자로 오는 줄 · hospUrl 칸이 있는 줄)을 빌려 값만 지어낸 것이다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/clinics/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
const AT = { lat: 37.51, lng: 127.015 }
const THREE: ClinicDeptId[] = ['ortho', 'pain', 'rehab']
const clinicQ = (depts: ClinicDeptId[] = THREE, r = 1000): QueryOf<'hosp-list'> => ({
  kind: 'hosp-list',
  at: AT,
  r,
  group: 'clinic',
  depts,
})
const groupQ = (group: 'dental' | 'korean' | 'big', r = 1000): QueryOf<'hosp-list'> => ({ kind: 'hosp-list', at: AT, r, group })
const detailQ = (ykiho = 'FAKEhira0001+/='): QueryOf<'hosp-detail'> => ({ kind: 'hosp-detail', ykiho })

const LIST_PATH = '/B551182/hospInfoServicev2/getHospBasisList'
const DETAIL_PATH = '/B551182/MadmDtlInfoService2.8' // 2.7은 2026-11-22 진짜 답이 '서비스가 없거나 폐기됨'(12)

function parts(url: string) {
  const u = new URL(url)
  return { origin: u.origin, path: u.pathname, params: Object.fromEntries(u.searchParams) }
}

const listParams = (clCd: string, dgsbjtCd?: string) => ({
  pageNo: '1',
  numOfRows: String(LIST_ROWS),
  _type: 'json',
  xPos: '127.015',
  yPos: '37.51',
  radius: '1000',
  clCd,
  ...(dgsbjtCd === undefined ? {} : { dgsbjtCd }),
})

// 과목 id → 심평원 과목 코드(DEPTS 한 곳)
const codeOf = (id: DeptId) => DEPTS.find((d) => d.id === id)?.dgsbjtCd
const CLINIC_TEXTS = () => [fixture('list-ortho.json'), fixture('list-pain.json'), fixture('list-rehab.json')]
// 진짜 답에서 본 과목 코드(2026-11-22 TASK-55, design.md 18절 표 차례)
const REAL_CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '21', '23', '25']
const ALL_CLINIC = DEPTS.filter((d) => d.dgsbjtCd !== null).map((d) => d.id as ClinicDeptId)

// 견본 의원(가운데 AT, r 1,000m). 거리는 coords.ts distM(하버사인 버림)으로 한 번 구해 적은 값
const ORTHO_1 = {
  ykiho: 'FAKEhira0001+/=',
  name: '견본바른정형외과의원',
  typeName: '의원',
  depts: ['ortho'],
  doctors: 2,
  openedOn: '2024-03-15',
  at: { lat: 37.5104, lng: 127.0159 },
  address: '가상도 가람구 견본로 11, 2층 (나무동)',
  distM: 90,
}
const PLAIN_2 = {
  ykiho: 'FAKEhira0002',
  name: '견본하늘의원',
  typeName: '의원',
  depts: ['ortho', 'pain'],
  doctors: 1,
  openedOn: '2019-07-02',
  at: { lat: 37.5091, lng: 127.018 },
  address: '가상도 가람구 시험로 22 (나무동)',
  distM: 282,
}
const REHAB_3 = {
  ykiho: 'FAKEhira0003',
  name: '견본튼튼재활의학과의원',
  typeName: '의원',
  depts: ['ortho', 'rehab'],
  doctors: 3,
  openedOn: '2010-11-01',
  at: { lat: 37.5121, lng: 127.0102 },
  address: '가상도 가람구 모의길 3 (구름동)',
  distM: 483,
}
const PAIN_6 = {
  ykiho: 'FAKEhira0006',
  name: '견본편한마취통증의학과의원',
  typeName: '의원',
  depts: ['pain'],
  doctors: null,
  openedOn: null,
  at: { lat: 37.5162, lng: 127.0151 },
  address: '가상도 가람구 편한로 6 (나무동)',
  distM: 689,
}
const EDGE_7 = {
  ykiho: 'FAKEhira0007',
  name: '견본끝정형외과의원',
  typeName: '의원',
  depts: ['ortho'],
  doctors: 0,
  openedOn: '2025-09-10',
  at: { lat: 37.519, lng: 127.015 },
  address: '가상도 가람구 끝길 1 (구름동)',
  distM: 1000,
}

// totalCount 칸이 없는 쪽(줄 n개)
function pageWithoutTotal(n: number): string {
  const item = Array.from({ length: n }, (_, i) => ({
    addr: `가상도 가람구 견본로 ${i + 1}`,
    clCdNm: '한의원',
    drTotCnt: 1,
    estbDd: 20200101,
    XPos: 127.015,
    YPos: 37.51,
    yadmNm: `견본${i + 1}한의원`,
    ykiho: `FAKEmany${i + 1}`,
  }))
  return JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item } } } })
}

describe('hosp-list — 심평원 병원정보서비스(의원 과목마다·치과의원·한의원·큰 병원)', () => {
  it('AC-7904.1: 읽는 곳은 hosp-list · 공공데이터포털 열쇠 · SOURCES에 있는 출처 id다', () => {
    expect(hospList.kind).toBe('hosp-list')
    expect(hospList.key).toBe('data')
    expect(hospList.src).toBe('hosp-list')
    expect(isSourceId(hospList.src)).toBe(true)
  })

  it('AC-7904.1: 과목 코드는 이 파일에 두지 않고 depts.ts DEPTS 한 곳을 부른다(DEPT_CODE 없음) · 종별은 의원 31·치과의원 51·한의원 93·상급종합 01·종합병원 11', () => {
    expect(clinics).not.toHaveProperty('DEPT_CODE')
    expect(TYPE_CODE).toEqual({ clinic: '31', dental: '51', korean: '93', big: ['01', '11'] })
    // 종별 코드도 DEPTS의 clCd와 같다
    for (const d of DEPTS) {
      const want = d.id === 'dental' ? TYPE_CODE.dental : d.id === 'korean' ? TYPE_CODE.korean : TYPE_CODE.clinic
      expect(d.clCd, d.id).toBe(want)
    }
  })

  it('AC-7918.3: 진짜 답으로 본 의원 과목 코드 열아홉(01~16·21·23·25)이 DEPTS 코드와 같다(2026-11-22 TASK-55)', () => {
    expect(ALL_CLINIC.map(codeOf)).toEqual(REAL_CODES)
  })

  it('AC-7904.1: 의원 무리는 고른 과목마다(DEPTS 차례) 목록 하나를 정해 둔 주소·칸으로 요청하고 열쇠는 싣지 않는다', () => {
    // 몸통 차례와 상관없이 DEPTS 차례(정형외과 → 마취통증 → 재활)
    const urls = hospList.requests(clinicQ(['rehab', 'ortho', 'pain'])).map((req) => req.url)
    expect(urls.map(parts)).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '05') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '09') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '21') },
    ])
    for (const url of urls) expect(url.toLowerCase()).not.toContain('servicekey')
    // 신경외과 하나
    expect(hospList.requests(clinicQ(['ns'])).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '06') },
    ])
  })

  it('AC-7904.1: 의원 과목 열아홉을 다 고르면 목록 열아홉, 과목 코드는 DEPTS 차례 그대로다', () => {
    const reqs = hospList.requests(clinicQ(ALL_CLINIC))
    expect(reqs).toHaveLength(19)
    expect(reqs.map((req) => parts(req.url).params.dgsbjtCd)).toEqual(REAL_CODES)
    expect(reqs.every((req) => parts(req.url).params.clCd === '31')).toBe(true)
  })

  it('AC-7904.1: 치과의원은 종별 51 하나, 한의원은 종별 93 하나, 큰 병원은 상급종합 01·종합병원 11 둘로 요청한다(과목 칸 없음)', () => {
    expect(hospList.requests(groupQ('dental')).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('51') },
    ])
    expect(hospList.requests(groupQ('korean')).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('93') },
    ])
    expect(hospList.requests(groupQ('big')).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('01') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('11') },
    ])
  })

  it('AC-7904.1: 의원 답을 읽어 기호·이름·종별·찾은 과목·의사 수·개설일·점(심평원 XPos·YPos)·주소·거리를 가까운 차례로 돌려준다(기준 날짜는 받은 날)', () => {
    expect(hospList.parse(CLINIC_TEXTS(), clinicQ(), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { items: [ORTHO_1, PLAIN_2, REHAB_3, PAIN_6, EDGE_7], capped: false },
    })
  })

  it('AC-7904.1: 같은 기관 기호는 한 줄로 합쳐 찾은 과목을 DEPTS 차례로 모은다(대표 과목은 고르지 않음 — depts.ts deptOf가 셈)', () => {
    const got = hospList.parse(CLINIC_TEXTS(), clinicQ(), TODAY)
    if (!got.ok) throw new Error('읽지 못함')
    const items = got.value.items
    expect(items.filter((h) => h.ykiho === 'FAKEhira0002')).toHaveLength(1)
    expect(items.find((h) => h.ykiho === 'FAKEhira0002')?.depts).toEqual(['ortho', 'pain'])
    expect(items.filter((h) => h.ykiho === 'FAKEhira0003')).toHaveLength(1)
    expect(items.find((h) => h.ykiho === 'FAKEhira0003')?.depts).toEqual(['ortho', 'rehab'])
    for (const h of items) expect(h).not.toHaveProperty('kind')
  })

  it('AC-7918.3: 과목 목록 검색은 부과목까지 찾는다 — 신경외과 목록(진짜 답 모양)에 온 정형외과 의원은 정형외과 줄과 합쳐 depts 둘이다', () => {
    // 몸통 ['ns', 'ortho'] → 요청은 DEPTS 차례(정형외과 05 · 신경외과 06), 답도 그 차례
    const q = clinicQ(['ns', 'ortho'])
    expect(hospList.requests(q).map((req) => parts(req.url).params.dgsbjtCd)).toEqual(['05', '06'])
    const got = hospList.parse([fixture('list-ortho.json'), fixture('list-ns.json')], q, TODAY)
    if (!got.ok) throw new Error('읽지 못함')
    expect(got.value.items.find((h) => h.ykiho === 'FAKEhira0001+/=')).toEqual({ ...ORTHO_1, depts: ['ortho', 'ns'] })
    expect(got.value.items.find((h) => h.ykiho === 'FAKEhira0501')).toEqual({
      ykiho: 'FAKEhira0501',
      name: '견본든든신경외과의원',
      typeName: '의원',
      depts: ['ns'],
      doctors: 1,
      openedOn: '2021-06-01',
      at: { lat: 37.5117, lng: 127.0112 },
      address: '가상도 가람구 든든로 5, 4층 (구름동)',
      distM: 384,
    })
    expect(got.value.items).toHaveLength(5) // 정형외과 넷(범위 밖·좌표 없음 뺌) + 신경외과 하나
  })

  it('AC-7918.3: 치과의원(종별 51) 진짜 답 모양을 읽는다 — XPos가 글자로 와도, 찾은 과목은 [dental]', () => {
    expect(hospList.parse([fixture('list-dental.json')], groupQ('dental'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          {
            ykiho: 'FAKEhira0401',
            name: '견본하얀치과의원',
            typeName: '치과의원',
            depts: ['dental'],
            doctors: 1,
            openedOn: '2018-04-02',
            at: { lat: 37.5105, lng: 127.0159 },
            address: '가상도 가람구 견본로 11, 3층 (나무동)',
            distM: 96,
          },
          {
            ykiho: 'FAKEhira0402',
            name: '견본미소치과의원',
            typeName: '치과의원',
            depts: ['dental'],
            doctors: 2,
            openedOn: '2012-09-17',
            at: { lat: 37.5082, lng: 127.0213 },
            address: '가상도 가람구 시험로 40 (나무동)',
            distM: 590,
          },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.1: 범위(r) 밖·좌표 없음·기호 없음 줄은 빼고, 범위 끝(거리 = r)은 넣는다', () => {
    const got = hospList.parse(CLINIC_TEXTS(), clinicQ(), TODAY)
    if (!got.ok) throw new Error('읽지 못함')
    const ids = got.value.items.map((h) => h.ykiho)
    expect(ids).not.toContain('FAKEhira0004') // 2,085m
    expect(ids).not.toContain('FAKEhira0005') // 좌표 없음
    expect(got.value.items.at(-1)).toEqual(EDGE_7)
    const korean = hospList.parse([fixture('list-korean.json')], groupQ('korean'), TODAY)
    if (!korean.ok) throw new Error('읽지 못함')
    expect(korean.value.items.map((h) => h.name)).toEqual(['견본솔한의원']) // 기호 없는 줄은 뺌
  })

  it('AC-7904.1: 숫자·날짜가 글자로 와도 읽고, 없는 날의 개설일·빈 의사 수는 null이다', () => {
    // 의원 무리는 고른 과목 수만큼 답이 있어야 한다 — 셋을 골랐는데 한 쪽만이면 모양 틀림
    expect(hospList.parse([fixture('list-pain.json')], clinicQ(), TODAY)).toEqual({ ok: false, code: 'failed' })
    const full = hospList.parse(CLINIC_TEXTS(), clinicQ(), TODAY)
    if (!full.ok) throw new Error('읽지 못함')
    expect(full.value.items.find((h) => h.ykiho === 'FAKEhira0002')).toEqual(PLAIN_2) // 글자 '1'·'20190702'·'127.018'
    expect(full.value.items.find((h) => h.ykiho === 'FAKEhira0006')).toEqual(PAIN_6) // '20231340' → null, 의사 수 칸 없음 → null
  })

  it('AC-7904.1: 한의원·큰 병원 답을 읽는다(항목 하나가 객체로 옴 · 빈 목록 섞임) — 한의원은 [korean], 큰 병원은 과목 없음 []', () => {
    expect(hospList.parse([fixture('list-korean.json')], groupQ('korean'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          {
            ykiho: 'FAKEhira0101',
            name: '견본솔한의원',
            typeName: '한의원',
            depts: ['korean'],
            doctors: 1,
            openedOn: '2015-11-20',
            at: { lat: 37.5112, lng: 127.0133 },
            address: '가상도 가람구 솔길 8 (나무동)',
            distM: 200,
          },
        ],
        capped: false,
      },
    })
    expect(hospList.parse([fixture('list-big-01.json'), fixture('list-big-11.json')], groupQ('big'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          {
            ykiho: 'FAKEhira0201',
            name: '견본가상종합병원',
            typeName: '종합병원',
            depts: [],
            doctors: 120,
            openedOn: '1998-03-01',
            at: { lat: 37.5035, lng: 127.021 },
            address: '가상도 가람구 큰길 100 (바다동)',
            distM: 895,
          },
        ],
        capped: false,
      },
    })
  })

  it('AC-7904.2: 빈 답(totalCount 0 · items 빈 글자)과 자료 없음(03)은 실패가 아니라 빈 목록이다', () => {
    const empty = { ok: true, asOf: TODAY, value: { items: [], capped: false } }
    expect(hospList.parse([fixture('list-empty.json')], groupQ('korean'), TODAY)).toEqual(empty)
    expect(hospList.parse([fixture('list-nodata.json')], groupQ('dental'), TODAY)).toEqual(empty)
    expect(
      hospList.parse([fixture('list-empty.json'), fixture('list-nodata.json'), fixture('list-empty.json')], clinicQ(), TODAY),
    ).toEqual(empty)
  })

  it('AC-7904.2: 활용신청 안 됨(미등록 열쇠 답)은 not-applied다 — 한 쪽만 그래도, 다른 쪽이 모양 틀림이어도', () => {
    const notApplied = { ok: false, code: 'not-applied' }
    expect(hospList.parse([fixture('not-registered.json')], groupQ('korean'), TODAY)).toEqual(notApplied)
    expect(hospList.parse([fixture('not-registered.json')], groupQ('dental'), TODAY)).toEqual(notApplied)
    expect(
      hospList.parse([fixture('list-ortho.json'), fixture('not-registered.json'), fixture('list-rehab.json')], clinicQ(), TODAY),
    ).toEqual(notApplied)
    expect(
      hospList.parse([fixture('broken.html'), fixture('not-registered.json'), fixture('list-rehab.json')], clinicQ(), TODAY),
    ).toEqual(notApplied)
  })

  it('AC-7904.2: 모양 틀림(JSON 아님 · 결과 코드 오류 · 칸 빠짐 · 항목 모양 다름 · 답 수 다름)은 failed다', () => {
    const failed = { ok: false, code: 'failed' }
    const bad = [
      fixture('broken.html'),
      fixture('list-error.json'),
      '',
      '[]',
      '{}',
      '{"response":{}}',
      '{"response":{"header":{"resultCode":"00"}}}',
      '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":"견본"},"totalCount":1}}}',
      '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[1,2]},"totalCount":2}}}',
      '{"response":{"header":{"resultCode":"00"},"body":{"items":"견본","totalCount":1}}}',
    ]
    for (const text of bad) expect(hospList.parse([text], groupQ('korean'), TODAY), text).toEqual(failed)
    expect(hospList.parse([], groupQ('korean'), TODAY)).toEqual(failed)
    expect(hospList.parse([fixture('list-big-01.json')], groupQ('big'), TODAY)).toEqual(failed)
    expect(hospList.parse([fixture('list-dental.json'), fixture('list-dental.json')], groupQ('dental'), TODAY)).toEqual(failed)
  })

  it('AC-7904.3: 답이 받은 줄보다 많다고 하면(totalCount) 받은 줄만 돌려주고 capped: true다', () => {
    expect(hospList.parse([fixture('list-capped.json')], groupQ('korean'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          expect.objectContaining({ ykiho: 'FAKEhira0301', name: '견본첫째한의원', depts: ['korean'], distM: 117 }),
          expect.objectContaining({ ykiho: 'FAKEhira0302', name: '견본둘째한의원', depts: ['korean'], distM: 442 }),
        ],
        capped: true,
      },
    })
    // 의원 무리에서 한 과목만 넘쳐도 capped
    const got = hospList.parse([fixture('list-ortho.json'), fixture('list-capped.json'), fixture('list-rehab.json')], clinicQ(), TODAY)
    expect(got.ok && got.value.capped).toBe(true)
  })

  it('AC-7904.3: totalCount 칸이 없으면 한 쪽을 꽉 채웠을 때(LIST_ROWS줄) capped다', () => {
    const full = hospList.parse([pageWithoutTotal(LIST_ROWS)], groupQ('korean'), TODAY)
    expect(full.ok && full.value.capped).toBe(true)
    expect(full.ok && full.value.items.length).toBe(LIST_ROWS)
    const short = hospList.parse([pageWithoutTotal(LIST_ROWS - 1)], groupQ('korean'), TODAY)
    expect(short.ok && short.value.capped).toBe(false)
  })

  it('AC-7904.3: 정해 둔 쪽 수까지만 첫 쪽을 요청한다 — 의원은 과목마다 1(19까지), 치과의원·한의원 1, 큰 병원 2', () => {
    const qs = [clinicQ(ALL_CLINIC, 20_000), groupQ('dental', 20_000), groupQ('korean', 20_000), groupQ('big', 20_000)]
    expect(qs.map((q) => hospList.requests(q).length)).toEqual([19, 1, 1, 2])
    for (const q of qs) for (const req of hospList.requests(q)) expect(parts(req.url).params.pageNo).toBe('1')
  })
})

describe('hosp-detail — 심평원 의료기관별상세정보서비스(장비·물리치료사)', () => {
  it('AC-7904.1: 읽는 곳은 hosp-detail · 공공데이터포털 열쇠 · SOURCES에 있는 출처 id다', () => {
    expect(hospDetail.kind).toBe('hosp-detail')
    expect(hospDetail.key).toBe('data')
    expect(hospDetail.src).toBe('hosp-detail')
    expect(isSourceId(hospDetail.src)).toBe(true)
  })

  it('AC-7904.1: 의료장비·기타인력 두 주소로 기관 기호를 실어 요청한다(+ / = 는 인코딩, 열쇠는 싣지 않음)', () => {
    const urls = hospDetail.requests(detailQ()).map((req) => req.url)
    const params = { ykiho: 'FAKEhira0001+/=', pageNo: '1', numOfRows: '100', _type: 'json' }
    expect(urls.map(parts)).toEqual([
      { origin: 'https://apis.data.go.kr', path: `${DETAIL_PATH}/getMedOftInfo2.8`, params },
      { origin: 'https://apis.data.go.kr', path: `${DETAIL_PATH}/getEtcHstInfo2.8`, params },
    ])
    for (const url of urls) {
      expect(url).toContain('ykiho=FAKEhira0001%2B%2F%3D')
      expect(url.toLowerCase()).not.toContain('servicekey')
    }
  })

  it('AC-7904.1: MRI·CT 있음과 물리치료사 수를 돌려준다(기준 날짜는 받은 날)', () => {
    expect(hospDetail.parse([fixture('detail-equip.json'), fixture('detail-staff.json')], detailQ(), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { mri: true, ct: true, therapists: 3 },
    })
  })

  it('AC-7904.1: MRI·CT가 장비 목록에 없거나 0대면 false다', () => {
    expect(hospDetail.parse([fixture('detail-equip-other.json'), fixture('detail-staff.json')], detailQ(), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { mri: false, ct: false, therapists: 3 },
    })
  })

  it('AC-7904.1: 물리치료사 줄이 없거나 수 칸이 없거나 0이면 null이다', () => {
    for (const staff of ['detail-staff-zero.json', 'detail-staff-none.json', 'detail-staff-nofield.json']) {
      expect(hospDetail.parse([fixture('detail-equip.json'), fixture(staff)], detailQ(), TODAY), staff).toEqual({
        ok: true,
        asOf: TODAY,
        value: { mri: true, ct: true, therapists: null },
      })
    }
  })

  it('AC-7904.2: 빈 답·자료 없음(03)은 실패가 아니다 — 장비 없음 false · 물리치료사 null', () => {
    const none = { ok: true, asOf: TODAY, value: { mri: false, ct: false, therapists: null } }
    expect(hospDetail.parse([fixture('detail-equip-none.json'), fixture('list-empty.json')], detailQ(), TODAY)).toEqual(none)
    expect(hospDetail.parse([fixture('list-nodata.json'), fixture('list-nodata.json')], detailQ(), TODAY)).toEqual(none)
  })

  it('AC-7904.2: 활용신청 안 됨(미등록 열쇠 답)은 not-applied다', () => {
    const notApplied = { ok: false, code: 'not-applied' }
    expect(hospDetail.parse([fixture('not-registered.json'), fixture('detail-staff.json')], detailQ(), TODAY)).toEqual(notApplied)
    expect(hospDetail.parse([fixture('detail-equip.json'), fixture('not-registered.json')], detailQ(), TODAY)).toEqual(notApplied)
  })

  it('AC-7904.2: 모양 틀림(JSON 아님 · 결과 코드 오류 · 칸 빠짐 · 답 수 다름)은 failed다', () => {
    const failed = { ok: false, code: 'failed' }
    expect(hospDetail.parse([fixture('broken.html'), fixture('detail-staff.json')], detailQ(), TODAY)).toEqual(failed)
    expect(hospDetail.parse([fixture('detail-equip.json'), fixture('list-error.json')], detailQ(), TODAY)).toEqual(failed)
    expect(hospDetail.parse(['{}', fixture('detail-staff.json')], detailQ(), TODAY)).toEqual(failed)
    expect(hospDetail.parse([fixture('detail-equip.json')], detailQ(), TODAY)).toEqual(failed)
  })
})

// 심평원이 아침 내내 한 번에 13~60초이거나 결과 코드 99(2026-11-23) → 50초까지 기다리고 시간 넘은 부르기는 한 번 더(design.md 3절, TASK-94)
describe('AC-7903.3 심평원 시간 한도(TASK-94)', () => {
  it('AC-7903.3: 의원 목록·상세는 부르기마다 50초이고 시간 넘은 부르기는 한 번 더', () => {
    for (const adapter of [hospList, hospDetail]) {
      expect(adapter.timeoutMs, adapter.kind).toBe(50_000)
      expect(adapter.retryTimeout, adapter.kind).toBe(true)
    }
  })
})
