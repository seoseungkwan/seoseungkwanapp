import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSourceId } from '@/lib/location/sources'
import type { HospGroup, QueryOf } from '@/types/location'
import { DEPT_CODE, LIST_ROWS, TYPE_CODE, hospDetail, hospList } from './clinics'

// 바깥 자료 — 의원 목록·상세(specs/location REQ-7904 AC-7904.1~3, design.md 4절, TASK-16).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/clinics/의 지어낸 견본(의원 이름·주소·기호 모두 지어냄)이다.
// TASK-47(2026-11-22 진짜 열쇠): 목록·장비 칸은 진짜 답과 같았고, 상세는 2.8판, 기타인력 칸은 dtlGnlNopCdNm·gnlNopCnt로 고쳤다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/clinics/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
const AT = { lat: 37.51, lng: 127.015 }
const listQ = (group: HospGroup, r = 1000): QueryOf<'hosp-list'> => ({ kind: 'hosp-list', at: AT, r, group })
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

const CLINIC_TEXTS = () => [fixture('list-ortho.json'), fixture('list-pain.json'), fixture('list-rehab.json')]

// 견본 의원(가운데 AT, r 1,000m). 거리는 coords.ts distM(하버사인 버림)으로 한 번 구해 적은 값
const ORTHO_1 = {
  ykiho: 'FAKEhira0001+/=',
  name: '견본바른정형외과의원',
  typeName: '의원',
  kind: 'ortho',
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
  kind: 'ortho',
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
  kind: 'rehab',
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
  kind: 'pain',
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
  kind: 'ortho',
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

describe('hosp-list — 심평원 병원정보서비스(의원·한의원·큰 병원)', () => {
  it('AC-7904.1: 읽는 곳은 hosp-list · 공공데이터포털 열쇠 · SOURCES에 있는 출처 id다', () => {
    expect(hospList.kind).toBe('hosp-list')
    expect(hospList.key).toBe('data')
    expect(hospList.src).toBe('hosp-list')
    expect(isSourceId(hospList.src)).toBe(true)
  })

  it('AC-7904.1: 과목·종별 코드는 한 곳 상수다(정형외과 05·마취통증의학과 09·재활의학과 21 · 의원 31·한의원 93·상급종합 01·종합병원 11)', () => {
    expect(DEPT_CODE).toEqual({ ortho: '05', pain: '09', rehab: '21' })
    expect(TYPE_CODE).toEqual({ clinic: '31', korean: '93', big: ['01', '11'] })
  })

  it('AC-7904.1: 의원 무리는 과목(정형외과·마취통증·재활)마다 하나씩 정해 둔 주소·칸으로 요청하고 열쇠는 싣지 않는다', () => {
    const urls = hospList.requests(listQ('clinic')).map((req) => req.url)
    expect(urls.map(parts)).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '05') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '09') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('31', '21') },
    ])
    for (const url of urls) expect(url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 한의원은 종별 93 하나, 큰 병원은 상급종합 01·종합병원 11 둘로 요청한다(과목 칸 없음)', () => {
    expect(hospList.requests(listQ('korean')).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('93') },
    ])
    expect(hospList.requests(listQ('big')).map((req) => parts(req.url))).toEqual([
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('01') },
      { origin: 'https://apis.data.go.kr', path: LIST_PATH, params: listParams('11') },
    ])
  })

  it('AC-7904.1: 의원 답을 읽어 기호·이름·종별·과목·의사 수·개설일·점·주소·거리를 가까운 차례로 돌려준다(기준 날짜는 받은 날)', () => {
    expect(hospList.parse(CLINIC_TEXTS(), listQ('clinic'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: { items: [ORTHO_1, PLAIN_2, REHAB_3, PAIN_6, EDGE_7], capped: false },
    })
  })

  it('AC-7904.1: 두 과목 목록에 같이 나온 의원은 하나로 — 이름에 그 과목이 있으면 그 과목, 없으면 정형외과·마취통증·재활 차례 앞', () => {
    const got = hospList.parse(CLINIC_TEXTS(), listQ('clinic'), TODAY)
    if (!got.ok) throw new Error('읽지 못함')
    const items = got.value.items
    expect(items.filter((h) => h.ykiho === 'FAKEhira0002')).toHaveLength(1)
    expect(items.find((h) => h.ykiho === 'FAKEhira0002')?.kind).toBe('ortho') // 정형외과·마취통증 목록, 이름에 과목 없음
    expect(items.filter((h) => h.ykiho === 'FAKEhira0003')).toHaveLength(1)
    expect(items.find((h) => h.ykiho === 'FAKEhira0003')?.kind).toBe('rehab') // 정형외과·재활 목록, 이름에 재활의학과
  })

  it('AC-7904.1: 범위(r) 밖·좌표 없음·기호 없음 줄은 빼고, 범위 끝(거리 = r)은 넣는다', () => {
    const got = hospList.parse(CLINIC_TEXTS(), listQ('clinic'), TODAY)
    if (!got.ok) throw new Error('읽지 못함')
    const ids = got.value.items.map((h) => h.ykiho)
    expect(ids).not.toContain('FAKEhira0004') // 2,085m
    expect(ids).not.toContain('FAKEhira0005') // 좌표 없음
    expect(got.value.items.at(-1)).toEqual(EDGE_7)
    const korean = hospList.parse([fixture('list-korean.json')], listQ('korean'), TODAY)
    if (!korean.ok) throw new Error('읽지 못함')
    expect(korean.value.items.map((h) => h.name)).toEqual(['견본솔한의원']) // 기호 없는 줄은 뺌
  })

  it('AC-7904.1: 숫자·날짜가 글자로 와도 읽고, 없는 날의 개설일·빈 의사 수는 null이다', () => {
    const got = hospList.parse([fixture('list-pain.json')], { ...listQ('clinic') }, TODAY)
    // 의원 무리는 답 셋이 있어야 한다 — 한 쪽만이면 모양 틀림
    expect(got).toEqual({ ok: false, code: 'failed' })
    const full = hospList.parse(CLINIC_TEXTS(), listQ('clinic'), TODAY)
    if (!full.ok) throw new Error('읽지 못함')
    expect(full.value.items.find((h) => h.ykiho === 'FAKEhira0002')).toEqual(PLAIN_2) // 글자 '1'·'20190702'·'127.018'
    expect(full.value.items.find((h) => h.ykiho === 'FAKEhira0006')).toEqual(PAIN_6) // '20231340' → null, 의사 수 칸 없음 → null
  })

  it('AC-7904.1: 한의원·큰 병원 답을 읽는다(항목 하나가 객체로 옴 · 빈 목록 섞임)', () => {
    expect(hospList.parse([fixture('list-korean.json')], listQ('korean'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          {
            ykiho: 'FAKEhira0101',
            name: '견본솔한의원',
            typeName: '한의원',
            kind: 'korean',
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
    expect(hospList.parse([fixture('list-big-01.json'), fixture('list-big-11.json')], listQ('big'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          {
            ykiho: 'FAKEhira0201',
            name: '견본가상종합병원',
            typeName: '종합병원',
            kind: 'big',
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
    expect(hospList.parse([fixture('list-empty.json')], listQ('korean'), TODAY)).toEqual(empty)
    expect(hospList.parse([fixture('list-nodata.json')], listQ('korean'), TODAY)).toEqual(empty)
    expect(
      hospList.parse([fixture('list-empty.json'), fixture('list-nodata.json'), fixture('list-empty.json')], listQ('clinic'), TODAY),
    ).toEqual(empty)
  })

  it('AC-7904.2: 활용신청 안 됨(미등록 열쇠 답)은 not-applied다 — 한 쪽만 그래도, 다른 쪽이 모양 틀림이어도', () => {
    const notApplied = { ok: false, code: 'not-applied' }
    expect(hospList.parse([fixture('not-registered.json')], listQ('korean'), TODAY)).toEqual(notApplied)
    expect(
      hospList.parse([fixture('list-ortho.json'), fixture('not-registered.json'), fixture('list-rehab.json')], listQ('clinic'), TODAY),
    ).toEqual(notApplied)
    expect(
      hospList.parse([fixture('broken.html'), fixture('not-registered.json'), fixture('list-rehab.json')], listQ('clinic'), TODAY),
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
    for (const text of bad) expect(hospList.parse([text], listQ('korean'), TODAY), text).toEqual(failed)
    expect(hospList.parse([], listQ('korean'), TODAY)).toEqual(failed)
    expect(hospList.parse([fixture('list-big-01.json')], listQ('big'), TODAY)).toEqual(failed)
  })

  it('AC-7904.3: 답이 받은 줄보다 많다고 하면(totalCount) 받은 줄만 돌려주고 capped: true다', () => {
    expect(hospList.parse([fixture('list-capped.json')], listQ('korean'), TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        items: [
          expect.objectContaining({ ykiho: 'FAKEhira0301', name: '견본첫째한의원', kind: 'korean', distM: 117 }),
          expect.objectContaining({ ykiho: 'FAKEhira0302', name: '견본둘째한의원', kind: 'korean', distM: 442 }),
        ],
        capped: true,
      },
    })
    // 의원 무리에서 한 과목만 넘쳐도 capped
    const got = hospList.parse([fixture('list-ortho.json'), fixture('list-capped.json'), fixture('list-rehab.json')], listQ('clinic'), TODAY)
    expect(got.ok && got.value.capped).toBe(true)
  })

  it('AC-7904.3: totalCount 칸이 없으면 한 쪽을 꽉 채웠을 때(LIST_ROWS줄) capped다', () => {
    const full = hospList.parse([pageWithoutTotal(LIST_ROWS)], listQ('korean'), TODAY)
    expect(full.ok && full.value.capped).toBe(true)
    expect(full.ok && full.value.items.length).toBe(LIST_ROWS)
    const short = hospList.parse([pageWithoutTotal(LIST_ROWS - 1)], listQ('korean'), TODAY)
    expect(short.ok && short.value.capped).toBe(false)
  })

  it('AC-7904.3: 어느 무리든 정해 둔 쪽 수(5) 안으로 첫 쪽만 요청한다', () => {
    for (const group of ['clinic', 'korean', 'big'] as const) {
      const reqs = hospList.requests(listQ(group, 20_000))
      expect(reqs.length).toBeGreaterThan(0)
      expect(reqs.length).toBeLessThanOrEqual(5)
      for (const req of reqs) expect(parts(req.url).params.pageNo).toBe('1')
    }
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
