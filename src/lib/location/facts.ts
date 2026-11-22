import { isYmd } from '@/lib/analytics/dates'
import type { Candidate, DeptRule, Got, Listing, Rival, ScoreFacts, Snapshot } from '@/types/location'
import { deptOf, deptRole } from './depts'
import type { FlagInput } from './flags'
import { GAP_DAYS, GAP_SLOTS, gapTable } from './hours'
import { perPyeongOf } from './listings'
import { welfareRate } from './snapshot'

// 후보 한 곳 → 점수 값(ScoreFacts, design.md 8절)·위험 신호 입력(FlagInput, 9절). 화면·견주기·보고서가 같이 쓰는 셈 한 곳
// (옛 components/location/detail/frame/facts.ts를 옮김 — 그 화면이 맞춘 셈 그대로: 새 의원 = 개설 연도 > 올해 − 3, 경쟁 0곳이면 빈틈 = 모든 칸).
// 순수 함수(읽기·저장·시계 없음, 오늘은 받는다). 그날 값 칸은 받은 값, 받다가 실패했으면 지난 값(prev, AC-7908.3), 둘 다 없으면 null('값 없음').
// 후보 매물 = 그 후보에 이어진 매물 가운데 마지막으로 고친 것(8절).
// 경쟁 의원 = 범위 안에서 대표 과목(depts.ts deptOf)이 지금 설정의 경쟁 과목인 의원(18절). 과목 설정을 바꾸면 다시 부르지 않고 이 셈만 다시 한다.
// 진료 시간 빈틈·진료비는 그 가운데 모을 때 상세를 받은(detail) 의원만 센다 — 새로 경쟁에 넣은 과목 의원은 detail이 없다(AC-7921.5)

export type FactsInput = {
  candidate: Candidate
  /** 저장한 매물 모두(후보 매물 포함) */
  listings: readonly Listing[]
  /** 지금 의원 체외충격파 값(원, location_settings.home_eswt) */
  homeEswt: number | null
  /** 한국 날짜 'YYYY-MM-DD' */
  today: string
  /** 의원 과목 고르기(location_settings.dept_rule, fillDeptRule을 거친 값) */
  deptRule: DeptRule
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

/** 그날 값에서 그 출처 id 칸의 기준 날짜(위험 신호·묶음의 출처 줄). 없으면 null */
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

const isRival = (r: Rival, rule: DeptRule) => {
  const dept = deptOf(r, rule)
  return dept !== null && deptRole(dept, rule) === 'rival'
}

/** 범위 안 경쟁 의원. 의원 목록을 못 받았거나 경쟁 과목이 0개면 null('과목 없음' — 경쟁 칸이 모두 값 없음, AC-7921.7) */
function rivalsOf(c: Candidate, rule: DeptRule): Rival[] | null {
  if (rule.rival.length === 0) return null
  const all = shownValue(c.snapshot?.rivals)
  if (all === null) return null
  const r = radiusOf(c)
  return all.filter((x) => x.distM <= r && isRival(x, rule))
}

/** 범위 안 경쟁 의원 수(목차·위험 신호와 같은 셈). 못 받았거나 경쟁 과목이 0개면 null */
export function rivalCount(c: Candidate, rule: DeptRule): number | null {
  return rivalsOf(c, rule)?.length ?? null
}

// 같은 건물·옆 건물 = 후보 30m 안(Rival.sameBuilding과 같은 거리, flags.ts와 같음)
const NEAR_M = 30

/** 후보 30m 안 의원 수(경쟁 포함, 안 보기 뺌 — 대표 과목이 없으면 안 셈). 의원 목록을 못 받았으면 null */
function clinicsNearOf(c: Candidate, rule: DeptRule): number | null {
  const all = shownValue(c.snapshot?.rivals)
  if (all === null) return null
  return all.filter((x) => x.distM <= NEAR_M && deptOf(x, rule) !== null).length
}

type Detail = NonNullable<Rival['detail']>
const detailsOf = (rivals: readonly Rival[]): Detail[] => rivals.flatMap((r) => (r.detail ? [r.detail] : []))

const sumOf = (rows: readonly { households: number }[] | null) => (rows === null ? null : rows.reduce((a, r) => a + r.households, 0))

// 개설 연도만 알아서 '3년 안' = 올해와 앞 두 해에 연 곳(Claude 판단, 옛 화면 셈)
const NEW_OPEN_YEARS = 3
const GAP_WEEKDAYS = GAP_DAYS.length - 1 // 월~토(일요일 뺌)

/** 진료 시간 빈틈 칸 수(월~토, design.md 11절). 경쟁 의원이 0곳이면 모든 칸이 빈틈, 진료 시간을 아는 곳이 없으면 null */
function gapCellsOf(rivals: readonly Rival[] | null): number | null {
  if (rivals === null) return null
  if (rivals.length === 0) return GAP_SLOTS.length * GAP_WEEKDAYS
  // gapTable은 받은 의원을 다 센다(TASK-61). 지금 모양(옛 kind 칸으로 한의원을 거름)과 바뀐 모양 둘 다에 맞게 week만 넘긴다 —
  // 경쟁 의원은 이미 과목 설정으로 골랐다
  const weeks = detailsOf(rivals).map((d) => ({ week: d.week })) as unknown as Parameters<typeof gapTable>[0]
  const t = gapTable(weeks)
  if (t.counted === 0) return null
  return t.counts.reduce((a, row) => a + row.slice(0, GAP_WEEKDAYS).filter((n) => n === 0).length, 0)
}

/** 경쟁 의원 체외충격파 평균 값(원, 버림) — 비급여를 받은 의원만. 올린 곳이 없으면 null */
function eswtAverage(rivals: readonly Rival[] | null): number | null {
  const prices = detailsOf(rivals ?? []).flatMap((d) => (d.priced && d.eswt !== null ? [d.eswt] : []))
  return prices.length === 0 ? null : Math.floor(prices.reduce((a, v) => a + v, 0) / prices.length)
}

/** 사용승인 뒤 다 찬 햇수 */
function yearsSince(ymd: string | null, today: string): number | null {
  if (ymd === null || !isYmd(ymd)) return null
  const years = Number(today.slice(0, 4)) - Number(ymd.slice(0, 4)) - (today.slice(5) < ymd.slice(5) ? 1 : 0)
  return Math.max(0, years)
}

const rentsPerPy = (listings: readonly Listing[]) =>
  listings.map((l) => perPyeongOf(l.rent, l.areaM2)).filter((v): v is number => v !== null)

/** 후보 점수 값(score.ts scoreItems에 그대로 넣는다) */
export function scoreFactsOf({ candidate: c, listings, homeEswt, today, deptRule }: FactsInput): ScoreFacts {
  const s = c.snapshot
  const r = radiusOf(c)
  const people = shownValue(s?.people)
  const rivals = rivalsOf(c, deptRule)
  const building = shownValue(s?.building)
  const welfare = shownValue(s?.welfare)
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
    welfareRate: welfare ? welfareRate(welfare) : null,
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
    clinicsNear: clinicsNearOf(c, deptRule),
    sign: c.signVisible,
    violation: c.violation,
    rentPerPy: listing ? perPyeongOf(listing.rent, listing.areaM2) : null,
    deposit: listing?.deposit ?? null,
    premium: listing?.premium ?? null,
    savedRentsPerPy: rentsPerPy(listings),
  }
}

/** 위험 신호 입력(flags.ts pickFlags에 그대로 넣는다). 의원은 그날 값 모두를 넘기고, 대표 과목은 flags.ts가 받은 설정으로 센다 */
export function flagInputOf({ candidate: c, listings, today, deptRule }: Omit<FactsInput, 'homeEswt'>): FlagInput {
  const s = c.snapshot
  const listing = candidateListing(c.id, listings)
  // deptRule은 flags.ts 입력 칸(TASK-61)이다. 그 칸이 생기기 전 모양에도 맞게 객체를 먼저 만들어 돌려준다
  const input = {
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
    deptRule,
  }
  return input
}
