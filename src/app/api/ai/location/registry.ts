import 'server-only'
import type { Adapter, QueryKind, Registry } from '@/types/location'
import { bldFloor, bldTitle } from './sources/buildings'
import { clinicHours } from './sources/clinicHours'
import { hospDetail, hospList } from './sources/clinics'
import { FACILITY_ADAPTERS } from './sources/facilities'
import { flowBus, flowRail, flowVolume } from './sources/flow'
import { aptInfoAdapter, aptListAdapter, presaleAdapter } from './sources/homes'
import { kakaoAddress, kakaoKeyword, kakaoNear, kakaoPoint } from './sources/kakao'
import { clinicLicense } from './sources/licenses'
import { nonpay } from './sources/nonpay'
import { householdAdapter, popAgeAdapter } from './sources/people'
import { storesAdapter } from './sources/stores'
import { aptTrade, bizTrade } from './sources/trades'
import { welfare } from './sources/welfare'

// 입지 분석 종류 → 읽는 곳(specs/location design.md 3·4절, TASK-45). 서버 경로(query·keys)가 이 판으로 종류를 찾는다.
// 열세 묶음(sources/<묶음>.ts)의 읽는 곳을 종류 28개에 하나씩 잇는다. 빠진 종류가 있으면 타입 검사가 막는다
const ALL: { readonly [K in QueryKind]: Adapter<K> } = {
  // kakao — 카카오 REST 열쇠
  'k-address': kakaoAddress,
  'k-point': kakaoPoint,
  'k-near': kakaoNear,
  'k-keyword': kakaoKeyword,
  // people
  'pop-age': popAgeAdapter,
  household: householdAdapter,
  // flow
  'flow-volume': flowVolume,
  'flow-bus': flowBus,
  'flow-rail': flowRail,
  // homes
  'apt-list': aptListAdapter,
  'apt-info': aptInfoAdapter,
  presale: presaleAdapter,
  // trades
  'apt-trade': aptTrade,
  'biz-trade': bizTrade,
  // stores
  stores: storesAdapter,
  // buildings
  'bld-title': bldTitle,
  'bld-floor': bldFloor,
  // clinics · clinicHours · nonpay · licenses
  'hosp-list': hospList,
  'hosp-detail': hospDetail,
  'hosp-hours': clinicHours,
  nonpay,
  'clinic-license': clinicLicense,
  // facilities(market·senior·gym·accident·school)
  ...FACILITY_ADAPTERS,
  // welfare — 의료급여·차상위(28개째)
  welfare,
}

export const REGISTRY: Registry = ALL
