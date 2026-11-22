import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSourceId } from '@/lib/location/sources'
import type { Adapter } from '@/types/location'
import { householdAdapter, popAgeAdapter } from './people'

// 입지 분석 바깥 자료 — 사는 사람(specs/location REQ-7904, design.md 4절 `pop-age`·`household`, TASK-13).
// 가짜 응답은 fixtures/location/api/people/(지어낸 시도·시군구·동 이름과 코드만). TASK-47이 진짜 답 모양으로 고쳤다:
// pop-age·빈 답(자료 없음 코드 '3')·미등록 열쇠(JSON, HTTP 403)는 진짜 답 모양이다. household는 15108071(법정동 기준)이
// 읍면동 단위 줄에 행정동 코드를 비워 보내 행정동별 세대 수를 줄 수 없어서, 같은 행정안전부 묶음의 행정동 기준 인구·세대 API로 바꿨다
// (그 API는 활용신청 전이라 답 모양은 같은 묶음 진짜 답을 따라 지은 것이다)
const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/people/${name}`, import.meta.url), 'utf8')
const POP_AGE = fixture('pop-age.json')
const HOUSEHOLD = fixture('household.json')
const EMPTY = fixture('empty.json')
const NO_DATA = fixture('no-data.json')
const NOT_REGISTERED = fixture('not-registered.json')
const ERROR = fixture('error.json')

const TODAY = '2026-11-22'
const HANEUL = '9911051000' // 가람구 하늘동
const BADA = '9911052000' // 가람구 바다동
const BYEOL = '9911053000' // 가람구 별빛동
const NARAE = '9912051000' // 나래구 어느 동(가짜 응답에 없음)

const popAge = (dongs: string[], ym = '2026-09') => ({ kind: 'pop-age' as const, dongs, ym })
const household = (dongs: string[], ym = '2026-09') => ({ kind: 'household' as const, dongs, ym })

// 답 모양 하나(행안부 주민등록 인구 API의 Response.head·items.item)
const reply = (items: unknown[], code = '0') =>
  JSON.stringify({ Response: { head: { resultCode: code, resultMsg: 'NORMAL_SERVICE', totalCount: String(items.length) }, items: { item: items } } })
const AGES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const ageRow = (admmCd: string, statsYm: string, each: number) => {
  const row: Record<string, string | number> = { statsYm, admmCd, dongNm: '시험동', tong: '', ban: '' }
  for (const age of AGES) {
    row[`male${age}AgeNmprCnt`] = each
    row[`feml${age}AgeNmprCnt`] = String(each)
  }
  return row
}

describe('AC-7904.1 pop-age 요청', () => {
  it('AC-7904.1: 시군구마다 요청 하나 — 행정동별 성/연령 인구 주소·칸(시군구 코드·그 연월 하나·읍면동 단위·전체·JSON), 열쇠는 주소에 없다', () => {
    expect(popAgeAdapter.kind).toBe('pop-age')
    expect(popAgeAdapter.key).toBe('data')
    expect(popAgeAdapter.requests(popAge([HANEUL, BADA]))).toEqual([
      {
        url:
          'https://apis.data.go.kr/1741000/admmSexdAgePpltn/selectAdmmSexdAgePpltn' +
          '?admmCd=9911000000&srchFrYm=202609&srchToYm=202609&lv=3&regSeCd=1&type=JSON&numOfRows=1000&pageNo=1',
      },
    ])
    for (const { url } of popAgeAdapter.requests(popAge([HANEUL]))) expect(url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 시군구가 둘이면 요청 둘(처음 나온 차례), 한 시군구의 동 40개는 요청 하나', () => {
    const urls = popAgeAdapter.requests(popAge([NARAE, HANEUL, '9912052000'], '2022-10')).map((r) => new URL(r.url))
    expect(urls.map((u) => u.searchParams.get('admmCd'))).toEqual(['9912000000', '9911000000'])
    expect(urls.every((u) => u.searchParams.get('srchFrYm') === '202210' && u.searchParams.get('srchToYm') === '202210')).toBe(true)

    const forty = Array.from({ length: 40 }, (_, i) => `99110${51000 + i * 10}`)
    expect(popAgeAdapter.requests(popAge(forty))).toHaveLength(1)
  })

  it('AC-7904.1: 출처 id는 SOURCES에 있는 pop-age다', () => {
    expect(popAgeAdapter.src).toBe('pop-age')
    expect(isSourceId(popAgeAdapter.src)).toBe(true)
    // 서버 판(registry)에 그대로 넣을 수 있는 모양
    const adapter: Adapter<'pop-age'> = popAgeAdapter
    expect(adapter.parse).toBeTypeOf('function')
  })
})

describe('AC-7904.1 pop-age 답 읽기', () => {
  it('AC-7904.1: 물은 동만 물은 차례로, 동마다 10세 나이대 11칸(남+여, 100세 이상 포함) · 기준 날짜는 그 연월 말일', () => {
    expect(popAgeAdapter.parse([POP_AGE], popAge([BYEOL, HANEUL, NARAE]), TODAY)).toEqual({
      ok: true,
      value: [
        { dong: BYEOL, bands: [195, 235, 295, 325, 345, 370, 335, 200, 100, 30, 2] },
        { dong: HANEUL, bands: [980, 1190, 1420, 1630, 1850, 1750, 1480, 920, 510, 140, 10] },
      ],
      asOf: '2026-09-30',
    })
  })

  it('AC-7904.1: 시군구 합계 줄은 동으로 세지 않고, 요청 둘의 답을 함께 읽는다', () => {
    const narae = reply([ageRow(NARAE, '202609', 7)])
    const got = popAgeAdapter.parse([narae, POP_AGE], popAge([NARAE, BADA]), TODAY)
    expect(got).toEqual({
      ok: true,
      value: [
        { dong: NARAE, bands: Array<number>(11).fill(14) },
        { dong: BADA, bands: [590, 650, 810, 1060, 1240, 1340, 1240, 840, 390, 100, 5] },
      ],
      asOf: '2026-09-30',
    })
  })

  it('AC-7904.1: 2월은 윤년 말일, 숫자 칸은 글자·숫자 둘 다 받고, 다른 달 줄은 뺀다', () => {
    const text = reply([ageRow(HANEUL, '202402', 3), ageRow(BADA, '202403', 5)])
    expect(popAgeAdapter.parse([text], popAge([HANEUL, BADA], '2024-02'), TODAY)).toEqual({
      ok: true,
      value: [{ dong: HANEUL, bands: Array<number>(11).fill(6) }],
      asOf: '2024-02-29',
    })
  })

  it('AC-7904.1: 줄이 하나라 items.item이 배열이 아니어도 읽는다', () => {
    const one = JSON.stringify({ Response: { head: { resultCode: '0' }, items: { item: ageRow(HANEUL, '202609', 1) } } })
    expect(popAgeAdapter.parse([one], popAge([HANEUL]), TODAY)).toEqual({
      ok: true,
      value: [{ dong: HANEUL, bands: Array<number>(11).fill(2) }],
      asOf: '2026-09-30',
    })
  })
})

describe('AC-7904.1 household 요청 · 답 읽기', () => {
  it('AC-7904.1: 시군구마다 요청 하나 — 행정동별(통반단위) 인구·세대 주소·칸(행정동 코드 칸 admmCd), 열쇠는 주소에 없다', () => {
    expect(householdAdapter.kind).toBe('household')
    expect(householdAdapter.key).toBe('data')
    expect(householdAdapter.requests(household([BADA, NARAE, HANEUL]))).toEqual([
      {
        url:
          'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus' +
          '?admmCd=9911000000&srchFrYm=202609&srchToYm=202609&lv=3&regSeCd=1&type=JSON&numOfRows=1000&pageNo=1',
      },
      {
        url:
          'https://apis.data.go.kr/1741000/admmPpltnHhStus/selectAdmmPpltnHhStus' +
          '?admmCd=9912000000&srchFrYm=202609&srchToYm=202609&lv=3&regSeCd=1&type=JSON&numOfRows=1000&pageNo=1',
      },
    ])
    for (const { url } of householdAdapter.requests(household([HANEUL]))) expect(url.toLowerCase()).not.toContain('servicekey')
  })

  it('AC-7904.1: 출처 id는 SOURCES에 있는 household다', () => {
    expect(householdAdapter.src).toBe('household')
    expect(isSourceId(householdAdapter.src)).toBe(true)
    const adapter: Adapter<'household'> = householdAdapter
    expect(adapter.requests).toBeTypeOf('function')
  })

  it('AC-7904.1: 동마다 세대 수 — 같은 동 줄이 둘이면 더한다 · 기준 날짜는 그 연월 말일', () => {
    expect(householdAdapter.parse([HOUSEHOLD], household([HANEUL, BADA, BYEOL, NARAE]), TODAY)).toEqual({
      ok: true,
      value: [
        { dong: HANEUL, households: 5050 },
        { dong: BADA, households: 3500 },
        { dong: BYEOL, households: 1020 },
      ],
      asOf: '2026-09-30',
    })
  })
})

describe('AC-7904.2 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답(0건 · 자료 없음 코드 3·03)은 실패가 아니라 빈 목록이고, 기준 날짜는 받은 한국 날짜다', () => {
    for (const text of [EMPTY, NO_DATA, reply([], '03')]) {
      expect(popAgeAdapter.parse([text], popAge([HANEUL]), TODAY)).toEqual({ ok: true, value: [], asOf: TODAY })
      expect(householdAdapter.parse([text], household([HANEUL]), TODAY)).toEqual({ ok: true, value: [], asOf: TODAY })
    }
  })

  it('AC-7904.2: 법정동 기준 답처럼 행정동 코드 칸이 빈 줄은 동으로 세지 않는다', () => {
    const stdgRow = { hhCnt: '827', stdgCd: '9911010100', stdgNm: '푸른동', dongNm: '', admmCd: '', statsYm: '202609' }
    expect(householdAdapter.parse([reply([stdgRow])], household([HANEUL]), TODAY)).toEqual({ ok: true, value: [], asOf: '2026-09-30' })
  })

  it('AC-7904.2: 물은 동이 답에 하나도 없으면 빈 목록(기준 날짜는 답의 연월 말일)', () => {
    expect(popAgeAdapter.parse([POP_AGE], popAge([NARAE]), TODAY)).toEqual({ ok: true, value: [], asOf: '2026-09-30' })
    expect(householdAdapter.parse([HOUSEHOLD], household([NARAE]), TODAY)).toEqual({ ok: true, value: [], asOf: '2026-09-30' })
  })

  it('AC-7904.2: 활용신청 안 한 열쇠 답이 하나라도 있으면 not-applied', () => {
    expect(popAgeAdapter.parse([NOT_REGISTERED], popAge([HANEUL]), TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(householdAdapter.parse([HOUSEHOLD, NOT_REGISTERED], household([HANEUL, NARAE]), TODAY)).toEqual({
      ok: false,
      code: 'not-applied',
    })
  })

  it('AC-7904.2: JSON 아님 · 오류 코드 · 몸통 없음은 failed', () => {
    for (const text of ['<html>점검 중</html>', '', ERROR, JSON.stringify({ other: 1 }), JSON.stringify([1, 2])]) {
      expect(popAgeAdapter.parse([text], popAge([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
      expect(householdAdapter.parse([text], household([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
    }
  })

  it('AC-7904.2: 물은 동 줄의 숫자 칸이 없거나 음수·소수·글자면 failed', () => {
    const broken = (patch: Record<string, unknown>) => reply([{ ...ageRow(HANEUL, '202609', 1), ...patch }])
    for (const patch of [{ feml100AgeNmprCnt: undefined }, { male40AgeNmprCnt: -1 }, { male40AgeNmprCnt: 1.5 }, { male40AgeNmprCnt: '많음' }]) {
      expect(popAgeAdapter.parse([broken(patch)], popAge([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
    }
    const noHh = reply([{ statsYm: '202609', admmCd: HANEUL, hhCnt: '' }])
    expect(householdAdapter.parse([noHh], household([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
  })

  it('AC-7904.2: 연월 칸이 없는 줄 · 같은 달 같은 동이 두 줄인 나이대 답은 failed', () => {
    const noYm = reply([{ ...ageRow(HANEUL, '202609', 1), statsYm: undefined }])
    expect(popAgeAdapter.parse([noYm], popAge([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
    const twice = reply([ageRow(HANEUL, '202609', 1), ageRow(HANEUL, '202609', 2)])
    expect(popAgeAdapter.parse([twice], popAge([HANEUL]), TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})
