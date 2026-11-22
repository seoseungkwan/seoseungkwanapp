import { addMonthsToDay, isYmd } from '@/lib/analytics/dates'
import type { FlagFacts, Listing, Rival, YesNo } from '@/types/location'
import { distText } from './coords'
import { perPyeongOf, vsAverage } from './listings'
import { commaText, wonText } from './money'
import { floorNumber } from './score'

// 위험 신호(specs/location design.md 9절, AC-7911.3·AC-7911.4). 차례 그대로, 맞는 것만 낸다. 자료가 없는 칸(null)은 그 신호를 내지 않는다.
// 순수 함수: 오늘은 받는다. 제목·설명은 requirements '화면 글 기본값' 그대로이고, 넓이·돈·거리 글은
// area(listings의 평당 값)·money·coords의 한 함수만 쓴다. 층 읽기는 score.ts floorNumber 한 곳.
// 수치(30m·3년·1.3배·5곳·15%·1,000m·500㎡)는 Claude 판단

export const FLAG_ORDER = [
  'violation-yes',
  'violation-check',
  'same-building',
  'closed-here',
  'rent-high',
  'premium-new',
  'many-rivals',
  'few-seniors',
  'far-station',
  'barrier',
] as const
export type FlagId = (typeof FLAG_ORDER)[number]

// 근거 법 id = LAW_BASIS(sources.ts) id: 위반 건축물 = 건축법 79조, 엘리베이터 = 장애인등편의법 시행령 별표 1·2
export const FLAG_LAW = { violation: 'violation', barrier: 'bf' } as const

/** red = 빨간 깃발, check = 확인 필요(위반 건축물을 안 고름·모름). 근거는 법 id(law) 또는 출처 id(src) 하나 */
export type Flag = { id: FlagId; level: 'red' | 'check'; title: string; detail: string; law: string | null; src: string | null }

/** 그날 값 칸(FlagFacts, types/location.ts) + 후보 줄·매물에서 부르는 쪽이 채우는 칸 */
export type FlagInput = FlagFacts & {
  today: string // 한국 날짜 'YYYY-MM-DD'
  radiusM: number // 살필 범위
  violation: YesNo | null // 사용자가 고름, null = 안 고름
  floorLabel: string | null // 후보 층 글자('3층'·'지1층')
  listing: Pick<Listing, 'areaM2' | 'rent' | 'premium'> | null // 후보 매물
  listings: Pick<Listing, 'areaM2' | 'rent'>[] // 저장한 매물 모두(후보 매물 포함)
}

type FlagRival = NonNullable<FlagFacts['rivals']>[number]

const NEAR_M = 30
const YEARS3_MONTHS = -36
const RENT_HIGH_X10 = 13 // 1.3배
const MANY_RIVALS = 5
const FEW_SENIORS_PCT = 15
const SENIOR_BAND = 6 // 60세 이상 = 10세 나이대 11칸의 6~10칸
const BAND_COUNT = 11
const FAR_STATION_M = 1000
const BARRIER_FLOOR = 2
const BARRIER_M2 = 500

const DEPT: Record<Rival['kind'], string> = {
  ortho: '정형외과',
  pain: '마취통증의학과',
  rehab: '재활의학과',
  korean: '한의원',
}

const isRival = (r: FlagRival) => r.kind !== 'korean'
const within3Years = (ymd: string | null, today: string) =>
  ymd !== null && isYmd(ymd) && ymd >= addMonthsToDay(today, YEARS3_MONTHS)
const red = (id: FlagId, title: string, detail: string, src: string): Flag => ({ id, level: 'red', title, detail, law: null, src })

function violationFlag(v: FlagInput['violation']): Flag | null {
  if (v === 'no') return null
  if (v === 'yes')
    return {
      id: 'violation-yes',
      level: 'red',
      title: '위반 건축물이라고 골랐어요',
      detail: '위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 무엇을 어겼는지, 고칠 수 있는지 계약 전에 구청에 물어봐요.',
      law: FLAG_LAW.violation,
      src: null,
    }
  return {
    id: 'violation-check',
    level: 'check',
    title: '위반 건축물인지',
    detail: `건축물대장을 떼어 확인하세요. 위반 건축물이면 의원 개설 신고가 막힐 수 있어요. 확인한 뒤 건물 서류에서 골라요(${v === 'unknown' ? '지금은 모름' : '아직 안 고름'}).`,
    law: FLAG_LAW.violation,
    src: null,
  }
}

function sameBuildingFlag(rivals: FlagInput['rivals']): Flag | null {
  const r = (rivals ?? []).filter((x) => isRival(x) && x.distM <= NEAR_M).sort((a, b) => a.distM - b.distM)[0]
  if (!r) return null
  const parts = [r.name, r.openedYear !== null ? `${r.openedYear}년 문 엶` : null, r.doctors !== null ? `의사 ${commaText(r.doctors)}명` : null]
  return red('same-building', `${NEAR_M}m 안에 ${DEPT[r.kind]}가 있어요`, parts.filter((p) => p !== null).join(' · '), 'hosp-list')
}

function closedHereFlag(input: FlagInput): Flag | null {
  const h = (input.history ?? [])
    .filter((x) => x.kind === 'close' && x.distM <= NEAR_M && within3Years(x.on, input.today))
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))[0]
  if (!h) return null
  const floor = input.floorLabel?.trim() ?? ''
  const here = floor === '' ? '이 자리에서' : `이 자리(${floor})에서`
  const when = `${h.on.slice(0, 4)}년 ${Number(h.on.slice(5, 7))}월`
  return red('closed-here', `${here} ${when}에 의원이 문을 닫았어요`, `${h.name} · 왜 닫았는지 중개사에게 물어봐요.`, 'clinic-license')
}

function rentHighFlag(input: FlagInput): Flag | null {
  const mine = input.listing ? perPyeongOf(input.listing.rent, input.listing.areaM2) : null
  const all = input.listings.map((l) => perPyeongOf(l.rent, l.areaM2)).filter((v) => v !== null)
  if (mine === null || all.length < 2) return null
  const avg = Math.floor(all.reduce((s, v) => s + v, 0) / all.length)
  if (avg <= 0 || mine * 10 <= avg * RENT_HIGH_X10) return null
  const pct = vsAverage(mine, avg)?.pct ?? 0
  return red(
    'rent-high',
    `월세가 저장한 매물 평균보다 ${pct}% 비싸요`,
    `이 매물 평당 ${wonText(mine)} · 저장한 매물 ${all.length}개 평균 ${wonText(avg)} · 30% 넘게 비싸면 알려 드려요`,
    'user',
  )
}

function premiumNewFlag(input: FlagInput): Flag | null {
  const premium = input.listing?.premium ?? null
  const approvedOn = input.building?.approvedOn ?? null
  if (premium === null || !(premium > 0) || approvedOn === null || !within3Years(approvedOn, input.today)) return null
  return red(
    'premium-new',
    `새 건물인데 권리금 ${wonText(premium)}을 달라고 해요`,
    `${approvedOn.slice(0, 4)}년에 사용승인 난 건물이에요. 깎을 수 있는지 협상표에 적어 둬요.`,
    'user',
  )
}

function manyRivalsFlag(input: FlagInput): Flag | null {
  const n = (input.rivals ?? []).filter((r) => isRival(r) && r.distM <= input.radiusM).length
  if (n < MANY_RIVALS) return null
  const total = input.people?.total ?? 0
  const perRival = total > 0 ? ` · 1곳당 사는 사람 ${commaText(Math.floor(total / n))}명` : ''
  return red('many-rivals', `범위 안에 정형외과·통증·재활 의원이 ${n}곳이에요`, `${MANY_RIVALS}곳 이상이면 알려 드려요${perRival}`, 'hosp-list')
}

function fewSeniorsFlag(people: FlagInput['people']): Flag | null {
  if (!people || !(people.total > 0) || people.bands.length !== BAND_COUNT) return null
  const seniors = people.bands.slice(SENIOR_BAND).reduce((s, n) => s + n, 0)
  if (seniors * 100 >= people.total * FEW_SENIORS_PCT) return null
  return red(
    'few-seniors',
    `60세 이상이 ${Math.floor((seniors * 100) / people.total)}%뿐이에요`,
    `사는 사람 ${commaText(people.total)}명 가운데 ${commaText(seniors)}명 · ${FEW_SENIORS_PCT}%보다 적으면 알려 드려요`,
    'pop-age',
  )
}

function farStationFlag(input: FlagInput): Flag | null {
  const station = input.station
  if (!station || station.distM <= FAR_STATION_M) return null
  const stops = input.bus !== null ? ` · 400m 안 정류장 ${commaText(input.bus)}곳` : ''
  return red(
    'far-station',
    `역까지 ${distText(station.distM)}예요`,
    `가장 가까운 역 ${station.name}${stops} · ${distText(FAR_STATION_M)} 넘게 멀면 알려 드려요`,
    'rail-stations',
  )
}

function barrierFlag(input: FlagInput): Flag | null {
  const floor = floorNumber(input.floorLabel)
  const b = input.building
  if (floor === null || floor < BARRIER_FLOOR || !b || b.elevators !== 0) return null
  const big = (b.totalM2 ?? 0) >= BARRIER_M2 || (input.listing?.areaM2 ?? 0) >= BARRIER_M2
  if (!big) return null
  return {
    id: 'barrier',
    level: 'red',
    title: '2층 이상 자리인데 엘리베이터가 없어요',
    detail: '넓이가 500㎡ 이상인 의원은 계단이나 엘리베이터 같은 장애인 편의시설이 꼭 있어야 해요.',
    law: FLAG_LAW.barrier,
    src: null,
  }
}

export function pickFlags(input: FlagInput): Flag[] {
  const flags = [
    violationFlag(input.violation),
    sameBuildingFlag(input.rivals),
    closedHereFlag(input),
    rentHighFlag(input),
    premiumNewFlag(input),
    manyRivalsFlag(input),
    fewSeniorsFlag(input.people),
    farStationFlag(input),
    barrierFlag(input),
  ]
  return flags.filter((f): f is Flag => f !== null)
}
