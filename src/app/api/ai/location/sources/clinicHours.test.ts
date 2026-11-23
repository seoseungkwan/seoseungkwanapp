import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { SOURCES } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import * as hoursModule from './clinicHours'
import {
  HOURS_PAGES,
  HOURS_ROWS,
  HOURS_URL,
  clinicHours,
  hoursFor,
  minutesOf,
  type ClinicHours,
} from './clinicHours'

// 바깥 자료 — 진료 시간(specs/location TASK-17, REQ-7904, design.md 4절 `hosp-hours`).
// 견본 fixtures/location/api/clinicHours/는 국립중앙의료원 전국 병·의원 찾기(15000736) 목록 조회 모양을 본떠 지어낸 것이다
// (의원 이름·주소·전화·기관 번호 모두 지어냄). 진짜 사이트는 부르지 않는다.
// TASK-47(2026-11-22 진짜 열쇠): 위치 조회 답에는 요일 칸(dutyTime1s~8c)이 없고 오늘 하루 startTime·endTime만 온다 →
// 요일 칸이 오는 목록 조회(Q0 시도·Q1 시군구 이름·QZ 종별)로 바꿨다. 목록 조회는 한 쪽 1,000줄까지 받는다.
// TASK-55(2026-11-22 진짜 열쇠, 확인할 것 11): 치과의원 기관 구분 QZ=N이 된다(강남구 522곳, dutyDivNam '치과의원') → 1쪽 더 부른다.
// 진료과목 거르기 QD(D008 정형외과 199곳 · D009 신경외과 112 · D016 재활 134 · D017 마취통증 205, 강남구 의원 C 모두 2,128)도 되지만
// 몸통(sidoName·sggName)에 과목 칸이 없어 쓰지 않는다. dental.xml은 그 진짜 답의 칸 차례를 빌려 값만 지어낸 것이다

const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/clinicHours/${name}`, import.meta.url), 'utf8')

const TODAY = '2026-11-22'
// 몸통의 시도·시군구 이름은 모으기가 동 경계 목록 이름으로 실어 보낸다(카카오 아님, design.md 4절)
const Q: QueryOf<'hosp-hours'> = { kind: 'hosp-hours', sidoName: '가상도', sggName: '가람구' }
// 위도 1도 ≈ 111,195m(지구 반지름 6,371,008.8m) — 북쪽으로 몇 m 옮긴 점
const north = (at: { lat: number; lng: number }, m: number) => ({ lat: at.lat + m / 111_195, lng: at.lng })

const WEEKDAY = (open: number, close: number) => Array.from({ length: 5 }, () => [open, close] as [number, number])

const PAGE_ROWS: ClinicHours[] = [
  {
    name: '푸른숲정형외과의원',
    at: { lat: 37.5003, lng: 127.0301 },
    week: [...WEEKDAY(540, 1110), [540, 780], null, null],
  },
  {
    name: '새벽별 마취통증의학과 의원',
    at: { lat: 37.5008, lng: 127.0295 },
    week: [...WEEKDAY(510, 1260), [540, 900], [600, 780], [600, 780]],
  },
  {
    name: '튼튼&바른한의원',
    at: { lat: 37.4991, lng: 127.0312 },
    week: [...WEEKDAY(570, 1170), [570, 840], null, null],
  },
  // 진료 시간 칸이 하나도 없는 의원 = 진료 시간 자료 없음(요일마다 닫음이 아니다)
  { name: '다솜재활의학과의원', at: { lat: 37.4985, lng: 127.0283 }, week: null },
  // '자리모름의원'(좌표 없음)은 뺀다
]

const PAGE2_ROWS: ClinicHours[] = [
  {
    name: '들쭉 날쭉 정형외과의원',
    at: { lat: 37.5021, lng: 127.0334 },
    // 월 0000~2400 · 화 닫는 시각 빔 · 수 닫는 시각이 여는 시각보다 이름 · 목 '930' · 금 '2460' · 토 '2500' · 일 빈 칸 · 공휴일 앞뒤 공백
    week: [[0, 1440], null, null, null, null, null, null, [540, 720]],
  },
  // 이름이 빈 줄은 뺀다
]

const pageXml = (items: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>` +
  `<body><items>${items}</items><numOfRows>100</numOfRows><pageNo>1</pageNo><totalCount>1</totalCount></body></response>`

describe('AC-7904.1 hosp-hours 요청: 정해 둔 주소·칸', () => {
  it('AC-7904.1: 읽는 곳은 hosp-hours · 공공데이터포털 열쇠 · SOURCES에 있는 출처 id다', () => {
    expect(clinicHours.kind).toBe('hosp-hours')
    expect(clinicHours.key).toBe('data')
    expect(clinicHours.src).toBe('hosp-hours')
    const row = SOURCES.find((s) => s.id === clinicHours.src)
    expect(row?.key).toBe('data')
  })

  it('AC-7904.1: 몸통 이름 둘(시도·시군구)로 목록 조회를 의원(C) 3쪽 + 한의원(G) 1쪽 + 치과의원(N) 1쪽(쪽마다 1,000줄) 부르고 주소에 열쇠를 넣지 않는다', () => {
    expect(HOURS_URL).toBe('https://apis.data.go.kr/B552657/HsptlAsembySearchService/getHsptlMdcncListInfoInqire')
    expect(HOURS_PAGES).toBe(3)
    expect(HOURS_ROWS).toBe(1000)
    const reqs = clinicHours.requests(Q)
    expect(
      reqs.map((req) => {
        const url = new URL(req.url)
        expect(`${url.origin}${url.pathname}`).toBe(HOURS_URL)
        expect(req.url.toLowerCase()).not.toContain('servicekey')
        return [...url.searchParams]
      }),
    ).toEqual([
      ...[1, 2, 3].map((page) => [
        ['Q0', '가상도'],
        ['Q1', '가람구'],
        ['QZ', 'C'],
        ['pageNo', String(page)],
        ['numOfRows', '1000'],
      ]),
      [
        ['Q0', '가상도'],
        ['Q1', '가람구'],
        ['QZ', 'G'],
        ['pageNo', '1'],
        ['numOfRows', '1000'],
      ],
      [
        ['Q0', '가상도'],
        ['Q1', '가람구'],
        ['QZ', 'N'],
        ['pageNo', '1'],
        ['numOfRows', '1000'],
      ],
    ])
  })

  it('AC-7922.1: 점 하나로 부르던 위치 조회 길은 없다 — 그 답엔 요일 칸이 없고, 몸통은 이름 둘뿐이다', () => {
    expect(hoursModule).not.toHaveProperty('HOURS_NEAR_URL')
    for (const req of clinicHours.requests(Q)) expect(req.url).not.toContain('getHsptlMdcncLcinfoInqire')
    // 다른 이름이면 그 이름으로
    const other = clinicHours.requests({ kind: 'hosp-hours', sidoName: '전남광주통합특별시', sggName: '광산구' })
    expect(other.map((req) => new URL(req.url).searchParams.get('Q0'))).toEqual(Array(5).fill('전남광주통합특별시'))
    expect(other.map((req) => new URL(req.url).searchParams.get('Q1'))).toEqual(Array(5).fill('광산구'))
  })

  it('AC-7904.1: 만든 요청은 바깥 부르기 규칙(정해 둔 host)을 지나고 serviceKey 하나만 붙는다', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn<SourceFetch>(async (url) => {
      seen.push(url)
      return new Response(fixture('empty.xml'))
    })
    const call = createFetchSource({ fetchImpl })
    for (const req of clinicHours.requests(Q)) {
      const got = await call(req, { kind: 'data', value: 'DATA+FAKE/key==0017' })
      expect(got.ok).toBe(true)
    }
    expect(seen).toHaveLength(5)
    for (const url of seen) expect(new URL(url).searchParams.getAll('serviceKey')).toEqual(['DATA+FAKE/key==0017'])
  })
})

describe('AC-7904.1 hosp-hours 답 읽기: 이름·점·요일 7칸 + 공휴일 [열·닫] 분', () => {
  it("AC-7904.1: '0900' 같은 네 자리 글자를 0시부터 센 분으로 바꾼다(24:00까지, 그 밖은 null)", () => {
    expect(minutesOf('0900')).toBe(540)
    expect(minutesOf('1830')).toBe(1110)
    expect(minutesOf('0000')).toBe(0)
    expect(minutesOf('2400')).toBe(1440)
    expect(minutesOf(' 0930 ')).toBe(570)
    for (const bad of ['', '930', '09:00', 'abcd', '2401', '2460', '2500', '1260', '09000', '-900']) {
      expect(minutesOf(bad)).toBeNull()
    }
  })

  it('AC-7904.1: 쪽 차례대로 의원마다 이름·점·8칸(월~일 + 공휴일)을 돌려주고, 빈 요일은 null이다', () => {
    const got = clinicHours.parse([fixture('page1.xml'), fixture('page2.xml'), fixture('empty.xml')], Q, TODAY)
    expect(got).toEqual({ ok: true, value: [...PAGE_ROWS, ...PAGE2_ROWS], asOf: TODAY })
    if (got.ok) for (const row of got.value) if (row.week) expect(row.week).toHaveLength(8)
  })

  it('AC-7918.3: 치과의원(QZ=N) 진짜 답 모양(한 줄 XML · 칸 차례 그대로 · 좌표 소수 13자리)을 읽는다', () => {
    expect(clinicHours.parse([fixture('dental.xml')], Q, TODAY)).toEqual({
      ok: true,
      asOf: TODAY,
      value: [
        { name: '견본하얀치과의원', at: { lat: 37.510501, lng: 127.015912 }, week: [...WEEKDAY(570, 1110), [570, 840], null, null] },
        { name: '견본미소치과의원', at: { lat: 37.5082, lng: 127.0213 }, week: [...WEEKDAY(600, 1140), null, null, null] },
      ],
    })
    // 의원 C 3쪽 + 한의원 G 1쪽 + 치과의원 N 1쪽을 쪽 차례대로 잇는다
    const all = clinicHours.parse(
      [fixture('page1.xml'), fixture('page2.xml'), fixture('empty.xml'), fixture('empty.xml'), fixture('dental.xml')],
      Q,
      TODAY,
    )
    expect(all.ok && all.value.map((r) => r.name)).toEqual([...PAGE_ROWS, ...PAGE2_ROWS].map((r) => r.name).concat(['견본하얀치과의원', '견본미소치과의원']))
  })

  it('AC-7904.1: 자료에 날짜가 없어 기준 날짜는 받은 한국 날짜다', () => {
    const got = clinicHours.parse([fixture('page1.xml')], Q, '2026-12-01')
    expect(got.ok && got.asOf).toBe('2026-12-01')
  })

  it('AC-7904.1: 이름이 비었거나 좌표가 없거나 범위 밖인 줄은 빼고, 이름의 XML 글자(&amp;·CDATA)는 푼다', () => {
    const item = (name: string, lat: string, lng: string) =>
      `<item><dutyName>${name}</dutyName><dutyTime1s>0900</dutyTime1s><dutyTime1c>1800</dutyTime1c>` +
      `<latitude>${lat}</latitude><longitude>${lng}</longitude></item>`
    const text = pageXml(
      [
        item('가온&amp;나래의원', '37.51', '127.02'),
        item('<![CDATA[별빛 정형외과의원]]>', '37.512345678', '127.0212344'),
        item('바다의원', '0', '0'),
        item('구름의원', '37.51', 'abc'),
        item('', '37.51', '127.02'),
        `<item><dutyName>안개의원</dutyName></item>`,
      ].join(''),
    )
    const got = clinicHours.parse([text], Q, TODAY)
    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.value.map((r) => [r.name, r.at])).toEqual([
      ['가온&나래의원', { lat: 37.51, lng: 127.02 }],
      ['별빛 정형외과의원', { lat: 37.512346, lng: 127.021234 }],
    ])
    expect(got.value[0].week).toEqual([[540, 1080], null, null, null, null, null, null, null])
  })
})

describe('AC-7904.2 hosp-hours 빈 답 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 빈 답은 실패가 아니라 빈 목록이다', () => {
    expect(clinicHours.parse([fixture('empty.xml')], Q, TODAY)).toEqual({ ok: true, value: [], asOf: TODAY })
    expect(clinicHours.parse([fixture('empty.xml'), fixture('empty.xml'), fixture('empty.xml')], Q, TODAY)).toEqual({
      ok: true,
      value: [],
      asOf: TODAY,
    })
    expect(clinicHours.parse([pageXml('')], Q, TODAY)).toEqual({ ok: true, value: [], asOf: TODAY })
  })

  it('AC-7904.2: 미등록 열쇠 답은 not-applied다(다른 쪽이 정상이어도)', () => {
    expect(clinicHours.parse([fixture('not-registered.json')], Q, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    expect(clinicHours.parse([fixture('page1.xml'), fixture('not-registered.json'), fixture('empty.xml')], Q, TODAY)).toEqual({
      ok: false,
      code: 'not-applied',
    })
  })

  it('AC-7904.2: 모양이 틀린 답(오류 번호·XML 아님·몸통 없음·쪽 없음)은 failed다', () => {
    const bad = [
      fixture('error.xml'),
      '점검 중입니다',
      '<html><body><p>점검 중</p></body></html>',
      '{"response":{"header":{"resultCode":"00"}}}',
      '<response><header><resultCode>00</resultCode></header></response>',
      '<response><header><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items/></body></response>',
    ]
    for (const text of bad) expect(clinicHours.parse([text], Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(clinicHours.parse([fixture('page1.xml'), fixture('error.xml')], Q, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(clinicHours.parse([], Q, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})

describe('AC-7904.1 의원 맞추기: 이름(공백·의원 빼고 같음) + 50m 안', () => {
  const rows = PAGE_ROWS
  const first = PAGE_ROWS[0]

  it("AC-7904.1: 공백·'의원'을 뺀 이름이 같고 50m 안이면 그 의원의 8칸을 돌려준다", () => {
    expect(hoursFor({ name: '푸른숲 정형외과', at: north(first.at, 40) }, rows)).toEqual(first.week)
    expect(hoursFor({ name: '푸른숲 정형외과 의원', at: north(first.at, 48) }, rows)).toEqual(first.week)
    expect(hoursFor({ name: '새벽별마취통증의학과의원', at: PAGE_ROWS[1].at }, rows)).toEqual(PAGE_ROWS[1].week)
  })

  it('AC-7904.1: 50m를 넘거나 이름이 다르면 못 맞추고 진료 시간은 null이다', () => {
    expect(hoursFor({ name: '푸른숲정형외과의원', at: north(first.at, 60) }, rows)).toBeNull()
    expect(hoursFor({ name: '푸른숲내과의원', at: first.at }, rows)).toBeNull()
    expect(hoursFor({ name: '푸른숲정형외과의원', at: first.at }, [])).toBeNull()
  })

  it('AC-7904.1: 맞춘 의원에 진료 시간 자료가 없으면 null이다', () => {
    expect(hoursFor({ name: '다솜 재활의학과', at: PAGE_ROWS[3].at }, rows)).toBeNull()
  })

  it('AC-7904.1: 같은 이름이 여럿이면 가장 가까운 곳, 빼고 나면 이름이 비는 경우는 맞추지 않는다', () => {
    const at = { lat: 37.51, lng: 127.02 }
    const near: ClinicHours = { name: '가온정형외과의원', at: north(at, 10), week: [[540, 1080], null, null, null, null, null, null, null] }
    const far: ClinicHours = { name: '가온 정형외과', at: north(at, 30), week: [[600, 1200], null, null, null, null, null, null, null] }
    expect(hoursFor({ name: '가온정형외과', at }, [far, near])).toEqual(near.week)
    const blank: ClinicHours = { name: '의원', at, week: near.week }
    expect(hoursFor({ name: ' 의원 ', at }, [blank])).toBeNull()
  })
})

// 시 아래 구(성남시 수정구 등)는 빈칸이 있으면 0곳이라 붙여서 묻는다(진짜 답 2026-11-23, TASK-92)
describe('AC-7904.1 진료 시간 시군구 이름 빈칸(TASK-92)', () => {
  it('AC-7904.1: Q1은 시군구 이름의 빈칸을 빼고(가상시 가람구 → 가상시가람구), 빈칸 없는 이름은 그대로', () => {
    const q1s = (sggName: string) => clinicHours.requests({ kind: 'hosp-hours', sidoName: '가상도', sggName }).map((r) => new URL(r.url).searchParams.get('Q1'))
    expect(q1s('가상시 가람구')).toEqual(Array(5).fill('가상시가람구'))
    expect(q1s('가람구')).toEqual(Array(5).fill('가람구'))
  })
})
