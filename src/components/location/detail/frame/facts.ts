import { isYmd } from '@/lib/analytics/dates'
import type { FlagInput } from '@/lib/location/flags'
import { GAP_DAYS, GAP_SLOTS, gapTable } from '@/lib/location/hours'
import { perPyeongOf } from '@/lib/location/listings'
import type { Candidate, Got, Listing, Rival, ScoreFacts, Snapshot } from '@/types/location'

// 후보 한 곳 → 점수 값(ScoreFacts, design.md 8절)·위험 신호 입력(FlagInput, 9절). 순수 함수(읽기·저장·시계 없음, 오늘은 받는다).
// 그날 값 칸은 받은 값, 받다가 실패했으면 지난 값(prev, AC-7908.3), 둘 다 없으면 null('값 없음')이다.
// 후보 매물 = 그 후보에 이어진 매물 가운데 마지막으로 고친 것(8절). 경쟁 의원은 범위 안 정형외과·마취통증의학과·재활의학과(한의원 뺌)

export type FrameFactsInput = {
  candidate: Candidate
  /** 저장한 매물 모두(후보 매물 포함) */
  listings: readonly Listing[]
  /** 지금 의원 체외충격파 값(원, location_settings.home_eswt) */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string
}

/** 그날 값 한 칸의 보이는 값: 받은 값 → 지난 값 → null */
export function shownValue<T>(got: Got<T> | null | undefined): T | null {
  if (!got) return null
  if (got.ok) return got.v
  return got.prev ? got.prev.v : null
}

/** 그 값의 기준 날짜(받은 값 → 지난 값 → null) */
export function shownAsOf(got: Got<unknown> | null | undefined): string | null {
  if (!got) return null
  if (got.ok) return got.asOf
  return got.prev ? got.prev.asOf : null
}

const isGot = (v: unknown): v is Got<unknown> => typeof v === 'object' && v !== null && 'src' in v && 'ok' in v

/** 그날 값에서 그 출처 id 칸의 기준 날짜(위험 신호의 출처 줄). 없으면 null */
export function sourceAsOf(s: Snapshot | null, src: string): string | null {
  if (!s) return null
  for (const v of Object.values(s)) {
    if (!isGot(v) || v.src !== src) continue
    const asOf = shownAsOf(v)
    if (asOf) return asOf
  }
  return null
}

/** 후보 매물 = 그 후보에 이어진 매물 가운데 마지막으로 고친 것 */
export function candidateListing(candidateId: string, listings: readonly Listing[]): Listing | null {
  return listings.filter((l) => l.candidateId === candidateId).reduce<Listing | null>((a, l) => (a === null || l.updatedAt > a.updatedAt ? l : a), null)
}

/** 그날 값을 받은 범위(그날 값이 없으면 후보 줄의 범위) */
const radiusOf = (c: Candidate) => c.snapshot?.radiusM ?? c.radiusM

/** 범위 안 경쟁 의원(한의원 뺌). 의원 목록을 못 받았으면 null */
function rivalsOf(c: Candidate): Rival[] | null {
  const all = shownValue(c.snapshot?.rivals)
  if (all === null) return null
  const r = radiusOf(c)
  return all.filter((x) => x.kind !== 'korean' && x.distM <= r)
}

/** 범위 안 경쟁 의원 수(목차·위험 신호와 같은 셈). 못 받았으면 null */
export function rivalCount(c: Candidate): number | null {
  return rivalsOf(c)?.length ?? null
}

const sumOf = (rows: readonly { households: number }[] | null) => (rows === null ? null : rows.reduce((a, r) => a + r.households, 0))

// 개설 연도만 알아서 '3년 안' = 올해와 앞 두 해에 연 곳(Claude 판단)
const NEW_OPEN_YEARS = 3

/** 진료 시간 빈틈 칸 수(월~토, design.md 11절). 경쟁 의원이 없으면 모든 칸이 빈틈, 진료 시간을 아는 곳이 없으면 null */
function gapCellsOf(rivals: readonly Rival[] | null): number | null {
  if (rivals === null) return null
  const weekdays = GAP_DAYS.length - 1 // 일요일 뺌
  if (rivals.length === 0) return GAP_SLOTS.length * weekdays
  const t = gapTable(rivals)
  if (t.counted === 0) return null
  return t.counts.reduce((a, row) => a + row.slice(0, weekdays).filter((n) => n === 0).length, 0)
}

/** 경쟁 의원 체외충격파 평균 값(원, 버림). 올린 곳이 없으면 null */
function eswtAverage(rivals: readonly Rival[] | null): number | null {
  const prices = (rivals ?? []).map((r) => r.eswt).filter((v): v is number => v !== null)
  return prices.length === 0 ? null : Math.floor(prices.reduce((a, v) => a + v, 0) / prices.length)
}

/** 사용승인 뒤 다 찬 햇수 */
function yearsSince(ymd: string | null, today: string): number | null {
  if (ymd === null || !isYmd(ymd)) return null
  const years = Number(today.slice(0, 4)) - Number(ymd.slice(0, 4)) - (today.slice(5) < ymd.slice(5) ? 1 : 0)
  return Math.max(0, years)
}

/** (기초 의료급여 + 차상위 3종) ÷ 주민등록 인구 × 100(%), 소수 첫째 자리 버림. 인구가 없으면 null */
function welfareRateOf(s: Snapshot | null): number | null {
  const w = shownValue(s?.welfare)
  if (!w || w.population === null || !(w.population > 0)) return null
  return Math.floor(((w.medical + w.nearPoor) * 1000) / w.population) / 10
}

const rentsPerPy = (listings: readonly Listing[]) =>
  listings.map((l) => perPyeongOf(l.rent, l.areaM2)).filter((v): v is number => v !== null)

/** 후보 점수 값(score.ts scoreItems에 그대로 넣는다) */
export function scoreFactsOf({ candidate: c, listings, homeEswt, today }: FrameFactsInput): ScoreFacts {
  const s = c.snapshot
  const r = radiusOf(c)
  const people = shownValue(s?.people)
  const rivals = rivalsOf(c)
  const building = shownValue(s?.building)
  const listing = candidateListing(c.id, listings)
  const thisYear = Number(today.slice(0, 4))
  return {
    areaM2: Math.PI * r * r,
    people: people && { total: people.total, bands: people.bands, households: people.households },
    apartments: sumOf(shownValue(s?.apts)),
    presale: sumOf(shownValue(s?.presale)),
    trend: shownValue(s?.trend),
    accidentSpots: shownValue(s?.accidents)?.spots ?? null,
    industryEmployees: shownValue(s?.industry)?.employees ?? null,
    schools: shownValue(s?.schools),
    seniorCenters: shownValue(s?.seniors),
    gyms: shownValue(s?.gyms),
    welfareRate: welfareRateOf(s),
    rivals: rivals?.length ?? null,
    newRivals: rivals && rivals.filter((x) => x.openedYear !== null && x.openedYear > thisYear - NEW_OPEN_YEARS).length,
    gapCells: gapCellsOf(rivals),
    rivalEswt: eswtAverage(rivals),
    homeEswt,
    stationM: shownValue(s?.station)?.distM ?? null,
    stops: shownValue(s?.bus),
    flow: shownValue(s?.flow)?.total ?? null,
    floorLabel: c.floorLabel,
    elevators: building?.elevators ?? null,
    parking: building?.parking ?? null,
    buildingAge: yearsSince(building?.approvedOn ?? null, today),
    pharmacies: shownValue(s?.pharmacies),
    sign: c.signVisible,
    violation: c.violation,
    rentPerPy: listing ? perPyeongOf(listing.rent, listing.areaM2) : null,
    deposit: listing?.deposit ?? null,
    premium: listing?.premium ?? null,
    savedRentsPerPy: rentsPerPy(listings),
  }
}

/** 위험 신호 입력(flags.ts pickFlags에 그대로 넣는다) */
export function flagInputOf({ candidate: c, listings, today }: Omit<FrameFactsInput, 'homeEswt'>): FlagInput {
  const s = c.snapshot
  const listing = candidateListing(c.id, listings)
  return {
    rivals: shownValue(s?.rivals),
    history: shownValue(s?.history),
    building: shownValue(s?.building),
    people: shownValue(s?.people),
    station: shownValue(s?.station),
    bus: shownValue(s?.bus),
    today,
    radiusM: radiusOf(c),
    violation: c.violation,
    floorLabel: c.floorLabel,
    listing: listing && { areaM2: listing.areaM2, rent: listing.rent, premium: listing.premium },
    listings: listings.map((l) => ({ areaM2: l.areaM2, rent: l.rent })),
  }
}
