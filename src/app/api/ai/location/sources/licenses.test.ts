import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { distM, from5174 } from '@/lib/location/coords'
import { SOURCES } from '@/lib/location/sources'
import { pickEvents, type LicenseRow, type WatchCandidate } from '@/lib/location/watch'
import type { QueryOf, Registry } from '@/types/location'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import {
  LICENSE_DAYS_PER_PAGE,
  LICENSE_MAX_PAGES,
  LICENSE_PAGE_ROWS,
  LICENSE_URL,
  clinicLicense,
  type LicenseValue,
} from './licenses'

// 의원 개업·폐업 읽는 곳(specs/location REQ-7904 AC-7904.1~4, design.md 4절 `clinic-license`, 조사 3).
// 가짜 응답은 fixtures/location/api/licenses/의 지어낸 파일(의원 이름·주소 모두 지어냄)이다. 바깥 사이트는 부르지 않는다.
// TASK-47(2026-11-22 진짜 열쇠): 한 쪽 100줄이 사이트 한도, 조건 칸은 LCPMT_YMD(GTE·LT)·SALS_STTS_CD(EQ)·DAT_UPDT_PNT(GTE·LT)·ROAD_NM_ADDR(LIKE)뿐이라
// 폐업일(CLSBIZ_YMD) 조건은 없다 → 폐업은 영업 상태 03 + 갱신 시각으로 부르고 폐업일은 답에서 거른다. 과목 칸은 MDEXM_SBJCT_CN_NM
const FIXTURES = new URL('../../../../../../fixtures/location/api/licenses/', import.meta.url)
const fixture = (name: string) => readFileSync(fileURLToPath(new URL(name, FIXTURES)), 'utf-8')

const TODAY = '2026-11-22'
// 37일(쪽 하나)
const OPEN: QueryOf<'clinic-license'> = { kind: 'clinic-license', event: 'open', from: '2026-10-15', to: '2026-11-20' }
const CLOSE: QueryOf<'clinic-license'> = { kind: 'clinic-license', event: 'close', from: '2026-10-15', to: '2026-11-20' }
// 3년(checkQuery가 받는 가장 긴 기간)
const THREE_YEARS: QueryOf<'clinic-license'> = { kind: 'clinic-license', event: 'open', from: '2023-11-22', to: '2026-11-22' }
// 몸통에 주소 앞부분(시도 시군구)이 있으면 도로명 주소로 거른다(query.ts에 칸을 더해야 한다 — TASK-47 보고)
const withAddr = (q: QueryOf<'clinic-license'>, addr: string) => ({ ...q, addr }) as QueryOf<'clinic-license'>

function value(texts: string[], q: QueryOf<'clinic-license'>): LicenseValue {
  const got = clinicLicense.parse(texts, q, TODAY)
  if (!got.ok) throw new Error(`읽지 못함: ${got.code}`)
  return got.value
}

// 가짜 답 한 쪽의 줄 하나를 n번 넣은 쪽(전체 수 칸 없음)
function pageOf(rowCount: number): string {
  const base = JSON.parse(fixture('open.json')) as { response: { body: { items: { item: unknown[] } } } }
  const row = base.response.body.items.item[0]
  return JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: Array.from({ length: rowCount }, () => row) } } } })
}

describe('clinic-license 읽는 곳 — 모양', () => {
  it('AC-7904.1: 종류·열쇠·출처가 정해 둔 값이고 출처 id가 SOURCES에 있다(공공데이터포털 열쇠)', () => {
    expect(clinicLicense.kind).toBe('clinic-license')
    expect(clinicLicense.key).toBe('data')
    expect(clinicLicense.src).toBe('clinic-license')
    const source = SOURCES.find((s) => s.id === clinicLicense.src)
    expect(source).toMatchObject({ via: 'api', key: 'data' })
    // 종류 → 읽는 곳 판에 그대로 들어간다(타입 검사)
    const registry: Registry = { 'clinic-license': clinicLicense }
    expect(registry['clinic-license']).toBe(clinicLicense)
  })
})

describe('clinic-license 요청 — AC-7904.1·AC-7904.3', () => {
  it('AC-7904.1: 개업은 인허가일 기간(첫날 이상 · 끝날 다음 날 미만)으로 정해 둔 주소·칸에 요청한다(열쇠는 싣지 않음)', () => {
    expect(clinicLicense.requests(OPEN)).toEqual([
      {
        url:
          `${LICENSE_URL}?pageNo=1&numOfRows=${LICENSE_PAGE_ROWS}&returnType=json` +
          '&cond%5BLCPMT_YMD%3A%3AGTE%5D=20261015&cond%5BLCPMT_YMD%3A%3ALT%5D=20261121',
      },
    ])
    expect(LICENSE_URL).toBe('https://apis.data.go.kr/1741000/clinics/info')
    expect(LICENSE_PAGE_ROWS).toBe(100)
  })

  it('AC-7904.1: 폐업은 영업 상태 03(폐업)과 갱신 시각(기간 첫날 0시 이상)으로 요청한다 — 폐업일 조건 칸은 사이트에 없다', () => {
    const [only, ...rest] = clinicLicense.requests(CLOSE)
    expect(rest).toEqual([])
    const url = new URL(only.url)
    expect(`${url.origin}${url.pathname}`).toBe(LICENSE_URL)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      pageNo: '1',
      numOfRows: '100',
      returnType: 'json',
      'cond[SALS_STTS_CD::EQ]': '03',
      'cond[DAT_UPDT_PNT::GTE]': '20261015000000',
    })
  })

  it('AC-7904.1: 몸통에 주소 앞부분(시도 시군구)이 있으면 도로명 주소 칸으로 거르고, 없으면 전국이다', () => {
    for (const q of [OPEN, CLOSE]) {
      const params = new URL(clinicLicense.requests(withAddr(q, '가상도 가람구'))[0].url).searchParams
      expect(params.get('cond[ROAD_NM_ADDR::LIKE]')).toBe('가상도 가람구')
      expect(new URL(clinicLicense.requests(q)[0].url).searchParams.has('cond[ROAD_NM_ADDR::LIKE]')).toBe(false)
    }
  })

  it('AC-7904.1: 요청 주소는 fetchSource의 정해 둔 host 규칙을 지나고 열쇠는 거기서만 붙는다', async () => {
    const sent: string[] = []
    const fake: SourceFetch = async (url) => {
      sent.push(url)
      return new Response(fixture('open.json'))
    }
    const call = createFetchSource({ fetchImpl: fake })
    for (const req of clinicLicense.requests(OPEN)) {
      expect(req.url).not.toMatch(/servicekey/i)
      const got = await call(req, { kind: 'data', value: 'DATA+FAKE/key==0002' })
      expect(got.ok).toBe(true)
    }
    expect(sent).toHaveLength(1)
    expect(new URL(sent[0]).searchParams.get('serviceKey')).toBe('DATA+FAKE/key==0002')
  })

  it('AC-7904.3: 쪽은 37일마다 하나씩 늘고 3년이어도 30쪽까지만 요청한다(쪽 번호 1부터 차례로)', () => {
    expect(LICENSE_MAX_PAGES).toBe(30)
    expect(LICENSE_DAYS_PER_PAGE).toBe(37)
    const pageNos = (q: QueryOf<'clinic-license'>) => clinicLicense.requests(q).map((r) => new URL(r.url).searchParams.get('pageNo'))
    expect(pageNos({ ...OPEN, from: '2026-11-20', to: '2026-11-20' })).toEqual(['1'])
    expect(pageNos({ ...OPEN, from: '2026-10-15', to: '2026-11-20' })).toEqual(['1'])
    expect(pageNos({ ...OPEN, from: '2026-10-14', to: '2026-11-20' })).toEqual(['1', '2'])
    const long = clinicLicense.requests(THREE_YEARS)
    expect(long).toHaveLength(30)
    expect(long.map((r) => new URL(r.url).searchParams.get('pageNo'))).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)))
    for (const r of long) expect(new URL(r.url).searchParams.get('cond[LCPMT_YMD::GTE]')).toBe('20231122')
  })
})

describe('clinic-license 답 읽기 — AC-7904.1·AC-7904.4', () => {
  it('AC-7904.1: 이름·과목·인허가일·폐업일·주소·점을 돌려주고 기준 날짜는 받은 한국 날짜다', () => {
    const got = clinicLicense.parse([fixture('open.json')], OPEN, TODAY)
    expect(got).toEqual({
      ok: true,
      asOf: TODAY,
      value: {
        capped: false,
        rows: [
          {
            name: '가람정형외과의원',
            dept: '정형외과',
            openedOn: '2026-10-20',
            closedOn: null,
            address: '가상도 가람구 바다로 12, 2층',
            point: from5174(198120.4, 451733.9),
          },
          {
            // 도로명 주소가 비면 지번 주소, 숫자 좌표도 읽는다
            name: '나래재활의학과의원',
            dept: '재활의학과, 정형외과',
            openedOn: '2026-11-03',
            closedOn: null,
            address: '가상도 가람구 물빛동 56',
            point: from5174(198410, 451390),
          },
        ],
      },
    })
  })

  it('AC-7904.1: 폐업 답은 폐업일이 기간 안인 줄만 돌려준다(기간 밖·폐업일 없음은 뺌)', () => {
    const got = value([fixture('close.json')], CLOSE)
    expect(got.capped).toBe(false)
    expect(got.rows.map((r) => [r.name, r.openedOn, r.closedOn])).toEqual([
      ['하늘정형외과의원', '2019-03-05', '2026-11-05'],
      ['푸른마취통증의학과의원', '2021-07-12', '2026-11-19'],
    ])
  })

  it('AC-7904.1: 칸 이름이 옛 인허가 자료 모양(BPLCNM·APVPERMYMD·DCBYMD·X·Y)이어도 같은 값으로 읽는다', () => {
    expect(value([fixture('old-names.json')], OPEN).rows).toEqual([
      {
        name: '온누리정형외과의원',
        dept: '정형외과',
        openedOn: '2026-10-20',
        closedOn: '2026-11-18',
        address: '가상도 가람구 바다로 12, 2층',
        point: from5174(198120.4, 451733.9),
      },
    ])
    expect(value([fixture('old-names.json')], CLOSE).rows.map((r) => r.closedOn)).toEqual(['2026-11-18'])
  })

  it('AC-7904.1: 같은 의원이 겹쳐 오면 한 번만 넣는다', () => {
    const names = value([fixture('open.json')], OPEN).rows.map((r) => r.name)
    expect(names.filter((n) => n === '가람정형외과의원')).toHaveLength(1)
  })

  it('AC-7904.1: 돌려준 줄은 알림 판정(watch.ts LicenseRow)에 그대로 넘긴다', () => {
    const rows: readonly LicenseRow[] = value([fixture('open.json')], OPEN).rows
    const near = from5174(198120.4, 451733.9)!
    // 나래재활의학과의원은 약 450m 떨어져 있다
    const cand: WatchCandidate = { id: 'cand-1', status: 'watching', ...near, radiusM: 500, watchCheckedOn: null, createdAt: '2026-10-01T00:00:00Z' }
    const events = pickEvents({ kind: 'open', from: OPEN.from, to: OPEN.to, rows }, cand)
    expect(events.map((e) => [e.clinicName, e.eventOn])).toEqual([
      ['가람정형외과의원', '2026-10-20'],
      ['나래재활의학과의원', '2026-11-03'],
    ])
  })

  it('AC-7904.4: EPSG:5174 좌표를 WGS84로 바꿔 돌려준다(coords.from5174, 서울 기준점 옆 몇백 m)', () => {
    const [first, second] = value([fixture('open.json')], OPEN).rows
    expect(first.point).toEqual({ lat: 37.567888, lng: 126.979513 })
    expect(second.point).toEqual({ lat: 37.56479, lng: 126.982791 })
    // 서울 기준점(198000, 451600 = 37.56668114, 126.97815021)에서 x +120m · y +134m 옮긴 점이라 180m 안이다
    expect(distM(first.point, { lat: 37.56668114, lng: 126.97815021 })).toBeLessThan(200)
  })

  it('AC-7904.4: 좌표가 비었거나 (0,0)·글자·한국 밖인 줄과 이름이 빈 줄·기간 밖 줄은 뺀다', () => {
    const names = value([fixture('open.json')], OPEN).rows.map((r) => r.name)
    // 다솜(좌표 빈칸) · 라온(0,0 — from5174는 바다 위 점을 내놓아 따로 뺀다) · 바다(글자) · 새솔(한국 밖) · 이름 빈 줄 · 마루(기간 밖)
    expect(from5174(0, 0)).not.toBeNull()
    for (const gone of ['다솜내과의원', '라온의원', '바다통증의학과의원', '새솔의원', '마루가정의학과의원', '']) expect(names).not.toContain(gone)
    expect(names).toEqual(['가람정형외과의원', '나래재활의학과의원'])
  })
})

describe('clinic-license 빈 답·활용신청 안 됨·모양 틀림 — AC-7904.2', () => {
  it('AC-7904.2: 빈 답(자료 없음 코드 · 빈 목록)은 실패가 아니라 빈 목록이다', () => {
    for (const name of ['empty.json', 'empty-items.json']) {
      expect(clinicLicense.parse([fixture(name)], OPEN, TODAY), name).toEqual({ ok: true, value: { rows: [], capped: false }, asOf: TODAY })
    }
  })

  it('AC-7904.2: 활용신청 안 된 열쇠 답은 not-applied다(한 쪽이라도)', () => {
    expect(clinicLicense.parse([fixture('not-registered.json')], OPEN, TODAY)).toEqual({ ok: false, code: 'not-applied' })
    const texts = clinicLicense.requests(THREE_YEARS).map((_, i) => (i === 7 ? fixture('not-registered.json') : fixture('many.json')))
    expect(clinicLicense.parse(texts, THREE_YEARS, TODAY)).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 모양이 틀리거나(줄이 글자 · JSON 아님) 오류 코드면 failed다', () => {
    for (const name of ['broken.json', 'not-json.txt', 'error.json']) {
      expect(clinicLicense.parse([fixture(name)], OPEN, TODAY), name).toEqual({ ok: false, code: 'failed' })
    }
  })

  it('AC-7904.2: 받은 쪽 수가 요청 쪽 수와 다르면 failed다', () => {
    expect(clinicLicense.parse([], OPEN, TODAY)).toEqual({ ok: false, code: 'failed' })
    expect(clinicLicense.parse([fixture('open.json'), fixture('open.json')], OPEN, TODAY)).toEqual({ ok: false, code: 'failed' })
  })
})

describe('clinic-license 쪽 한도 — AC-7904.3', () => {
  it('AC-7904.3: 30쪽을 받아도 전체 수가 받은 줄보다 많으면 capped: true다', () => {
    const texts = clinicLicense.requests(THREE_YEARS).map(() => fixture('many.json'))
    const got = value(texts, THREE_YEARS)
    expect(got.capped).toBe(true)
    expect(got.rows.map((r) => r.name)).toEqual(['가람정형외과의원', '나래재활의학과의원'])
  })

  it('AC-7904.3: 전체 수가 받은 줄 수 안이면 capped: false다', () => {
    expect(value([fixture('open.json')], OPEN).capped).toBe(false)
  })

  it('AC-7904.3: 전체 수 칸이 없으면 마지막 쪽이 꽉 찼을 때(100줄) capped: true다', () => {
    expect(value([pageOf(LICENSE_PAGE_ROWS)], OPEN).capped).toBe(true)
    expect(value([pageOf(LICENSE_PAGE_ROWS - 1)], OPEN).capped).toBe(false)
  })
})
