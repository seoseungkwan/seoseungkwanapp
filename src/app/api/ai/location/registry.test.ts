import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkQuery, KIND_KEY, QUERY_KINDS } from '@/lib/location/query'
import { sourceOf } from '@/lib/location/sources'
import type { Adapter, KeyKind, Query, QueryKind } from '@/types/location'
import { REGISTRY } from './registry'
import * as buildings from './sources/buildings'
import * as clinicHours from './sources/clinicHours'
import * as clinics from './sources/clinics'
import * as facilities from './sources/facilities'
import * as flow from './sources/flow'
import * as homes from './sources/homes'
import * as kakao from './sources/kakao'
import * as licenses from './sources/licenses'
import * as nonpay from './sources/nonpay'
import * as people from './sources/people'
import * as stores from './sources/stores'
import * as trades from './sources/trades'
import * as welfare from './sources/welfare'

// 종류 잇기(specs/location TASK-45, design.md 3·4절). 바깥은 부르지 않는다 — 요청 만들기만 보고, 열쇠는 지어낸 글자다

// design.md 4절 '묶음 → 파일' 그대로(열세 묶음, 종류 28개)
const BUNDLES = { kakao, people, flow, homes, trades, clinics, clinicHours, nonpay, licenses, buildings, stores, facilities, welfare }
type Bundle = keyof typeof BUNDLES
const DESIGN_BUNDLE: Readonly<Record<Bundle, readonly QueryKind[]>> = {
  kakao: ['k-address', 'k-point', 'k-near', 'k-keyword'],
  people: ['pop-age', 'household'],
  flow: ['flow-volume', 'flow-bus', 'flow-rail'],
  homes: ['apt-list', 'apt-info', 'presale'],
  trades: ['apt-trade', 'biz-trade'],
  clinics: ['hosp-list', 'hosp-detail'],
  clinicHours: ['hosp-hours'],
  nonpay: ['nonpay'],
  licenses: ['clinic-license'],
  buildings: ['bld-title', 'bld-floor'],
  stores: ['stores'],
  facilities: ['market', 'senior', 'gym', 'accident', 'school'],
  welfare: ['welfare'],
}

// design.md 4절 표 '열쇠' 칸 그대로: 카카오 넷, 나머지 스물넷은 공공데이터포털
const KAKAO_KINDS: readonly QueryKind[] = ['k-address', 'k-point', 'k-near', 'k-keyword']
const designKey = (k: QueryKind): KeyKind => (KAKAO_KINDS.includes(k) ? 'kakao' : 'data')

// design.md 3절: 열쇠 종류마다 부를 수 있는 host
const DESIGN_HOSTS: Readonly<Record<KeyKind, readonly string[]>> = {
  kakao: ['dapi.kakao.com'],
  data: ['apis.data.go.kr', 'api.data.go.kr', 'api.odcloud.kr'],
}

// 종류마다 checkQuery를 통과하는 몸통 하나(지어낸 값)
const AT = { lat: 37.5665, lng: 126.978 }
const LOT = { sgg: '11110', bjdong: '10100', bun: '0001', ji: '0000', plat: '0' as const }
const SAMPLES: Readonly<Record<QueryKind, Query>> = {
  'k-address': { kind: 'k-address', q: '서울특별시청' },
  'k-point': { kind: 'k-point', at: AT },
  'k-near': { kind: 'k-near', at: AT, r: 1000, cat: 'SW8' },
  'k-keyword': { kind: 'k-keyword', at: AT, r: 5000, q: '산업단지' },
  'pop-age': { kind: 'pop-age', dongs: ['1111051500'], ym: '2025-10' },
  household: { kind: 'household', dongs: ['1111051500'], ym: '2025-10' },
  'flow-volume': { kind: 'flow-volume', sido: '11', sgg: '11110', ym: '2025-10' },
  'flow-bus': { kind: 'flow-bus', sgg: '11110' },
  'flow-rail': { kind: 'flow-rail', sgg: '11110' },
  accident: { kind: 'accident', sidoName: '서울특별시', sggName: '종로구' },
  'apt-list': { kind: 'apt-list', bjd: '1111010100' },
  'apt-info': { kind: 'apt-info', complex: 'A10000001' },
  presale: { kind: 'presale', sidoName: '서울특별시', from: '2025-01', to: '2025-12' },
  'apt-trade': { kind: 'apt-trade', sgg: '11110', ym: '2025-10' },
  'biz-trade': { kind: 'biz-trade', sgg: '11110', ym: '2025-10' },
  stores: { kind: 'stores', at: AT, r: 30 },
  'bld-title': { kind: 'bld-title', ...LOT },
  'bld-floor': { kind: 'bld-floor', ...LOT },
  'hosp-list': { kind: 'hosp-list', at: AT, r: 1000, group: 'clinic' },
  'hosp-detail': { kind: 'hosp-detail', ykiho: 'FAKEYKIHO123' },
  'hosp-hours': { kind: 'hosp-hours', at: AT },
  nonpay: { kind: 'nonpay', ykiho: 'FAKEYKIHO123', item: 'MM045' },
  'clinic-license': { kind: 'clinic-license', event: 'open', from: '2025-10-01', to: '2025-10-31' },
  gym: { kind: 'gym', sggName: '종로구' },
  senior: { kind: 'senior', sggName: '종로구' },
  market: { kind: 'market', sggName: '종로구' },
  school: { kind: 'school', sggName: '종로구' },
  welfare: { kind: 'welfare', sgg: '11110' },
}

// 묶음 파일이 내보낸 값 가운데 읽는 곳 모양(kind·src·key 글자 + requests·parse 함수)인 것
const isAdapter = (v: unknown): v is Adapter => {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.kind === 'string' &&
    typeof a.src === 'string' &&
    typeof a.key === 'string' &&
    typeof a.requests === 'function' &&
    typeof a.parse === 'function'
  )
}
const adaptersIn = (mod: object): Adapter[] => [...new Set(Object.values(mod).filter(isAdapter))]

const registered = (k: QueryKind): Adapter | undefined => REGISTRY[k] as Adapter | undefined
const sorted = (xs: readonly string[]) => [...xs].sort()

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('종류 잇기(registry)', () => {
  it('AC-7904.1: 열세 묶음을 이어 종류 28개가 빠짐없이 하나씩 있고, 칸 이름과 읽는 곳의 종류가 같다', () => {
    expect(QUERY_KINDS).toHaveLength(28)
    expect(sorted(Object.keys(REGISTRY))).toEqual(sorted(QUERY_KINDS))
    for (const k of QUERY_KINDS) {
      expect(registered(k), k).toBeDefined()
      expect(registered(k)?.kind, k).toBe(k)
    }
    // 같은 읽는 곳이 두 종류에 걸리지 않는다
    expect(new Set(Object.values(REGISTRY)).size).toBe(28)
  })

  it('AC-7904.1: 종류마다 design.md 4절 묶음 파일이 내보낸 읽는 곳 그대로다(의료급여 welfare 포함, 겹침 없음)', () => {
    expect(Object.keys(BUNDLES)).toHaveLength(13)
    const all = Object.values(DESIGN_BUNDLE).flat()
    expect(all).toHaveLength(28)
    expect(sorted(all)).toEqual(sorted(QUERY_KINDS))

    for (const [bundle, mod] of Object.entries(BUNDLES) as [Bundle, object][]) {
      const found = adaptersIn(mod)
      expect(sorted(found.map((a) => a.kind)), bundle).toEqual(sorted(DESIGN_BUNDLE[bundle]))
      for (const a of found) expect(registered(a.kind as QueryKind), `${bundle} ${a.kind}`).toBe(a)
    }
    // 시설 묶음은 FACILITY_ADAPTERS 판으로도 내보낸다 — 같은 것이 이어져 있다
    for (const [k, a] of Object.entries(facilities.FACILITY_ADAPTERS)) expect(registered(k as QueryKind), k).toBe(a)
    expect(registered('welfare')).toBe(welfare.welfare)
  })

  it('AC-7904.1: 출처 id는 SOURCES에 있는 바로 받는 자료(api)이고, 그 출처의 열쇠와 읽는 곳의 열쇠가 같다', () => {
    for (const k of QUERY_KINDS) {
      const a = registered(k)
      const src = sourceOf(a?.src ?? '')
      expect(src, `${k} → ${a?.src}`).toBeDefined()
      expect(src?.via, k).toBe('api')
      expect(src?.key, k).toBe(a?.key)
    }
  })

  it('AC-7903.2: 열쇠 종류가 design.md 4절과 같다(카카오 넷 · 공공데이터포털 스물넷)', () => {
    for (const k of QUERY_KINDS) {
      expect(registered(k)?.key, k).toBe(designKey(k))
      expect(KIND_KEY[k], k).toBe(designKey(k))
    }
    const keys = QUERY_KINDS.map((k) => registered(k)?.key)
    expect(keys.filter((x) => x === 'kakao')).toHaveLength(4)
    expect(keys.filter((x) => x === 'data')).toHaveLength(24)
  })

  it('AC-7903.2: 종류마다 만든 요청 주소에 열쇠가 없고, 그 열쇠의 정해 둔 host(https)만 쓴다', () => {
    const fakeData = 'FAKE-DATA-KEY-T45'
    const fakeKakao = 'FAKE-KAKAO-KEY-T45'
    vi.stubEnv('DATA_GO_KR_KEY', fakeData)
    vi.stubEnv('KAKAO_REST_KEY', fakeKakao)

    for (const k of QUERY_KINDS) {
      const q = SAMPLES[k]
      expect(checkQuery(q), k).toEqual(q) // 몸통 견본이 정해 둔 칸·범위 안이다
      const a = registered(k)
      expect(a, k).toBeDefined()
      if (!a) continue
      const reqs = a.requests(q)
      expect(reqs.length, k).toBeGreaterThan(0)
      for (const r of reqs) {
        const url = new URL(r.url)
        expect(url.protocol, k).toBe('https:')
        expect(DESIGN_HOSTS[a.key], `${k} ${url.hostname}`).toContain(url.hostname)
        expect(r.url, k).not.toContain(fakeData)
        expect(r.url, k).not.toContain(fakeKakao)
        expect([...url.searchParams.keys()].map((n) => n.toLowerCase()), k).not.toContain('servicekey')
      }
    }
  })
})
