import { addMonthsToDay, isYmd } from '@/lib/analytics/dates'

// 위험 신호(specs/location design.md 9절, AC-7911.3). 차례 그대로, 맞는 것만 낸다. 자료가 없는 칸(null)은 그 신호를 내지 않는다.
// 순수 함수: 오늘은 받는다. 같은 Phase의 types/location·sources·area·money·listings를 부르지 않으려고 입력·출력 모양과
// 평 바꾸기·돈 글자를 이 파일 안에 최소한으로 둔다(합칠 때 맞춘다). 글은 시안, 수치(30m·3년·1.3배·5곳·15%·1,000m·500㎡)는 Claude 판단

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

// 근거 id = LAW_BASIS(sources.ts) id 글자. 목록에 있는지는 TASK-3 시험이 본다
export const FLAG_LAW = { violation: 'building-79', barrier: 'accessibility' } as const

// red = 빨간 깃발, check = 확인 필요(위반 건축물을 안 고름·모름)
export type Flag = { id: FlagId; level: 'red' | 'check'; title: string; detail: string; law: string | null }

export type FlagRival = {
  name: string
  kind: 'ortho' | 'pain' | 'rehab' | 'korean'
  distM: number
  doctors: number | null
  openedYear: number | null
}

export type FlagInput = {
  today: string // 한국 날짜 'YYYY-MM-DD'
  radiusM: number // 살필 범위
  violation: 'yes' | 'no' | 'unknown' | null // 사용자가 고름, null = 안 고름
  floorLabel: string | null // 후보 층 글자('3층'·'지1층')
  rivals: FlagRival[] | null // 그날 값 경쟁 의원(한의원 포함)
  history: { kind: 'open' | 'close'; name: string; dept: string; on: string; distM: number }[] | null // 3년 개폐업
  listing: { areaM2: number | null; rent: number | null; premium: number | null } | null // 후보 매물
  listings: { areaM2: number | null; rent: number | null }[] // 저장한 매물 모두(후보 매물 포함)
  building: { approvedOn: string | null; totalM2: number | null; elevators: number | null } | null
  people: { total: number; bands: number[] } | null // 10세 나이대 11칸
  station: { name: string; line: string; distM: number } | null // 가장 가까운 역
}

const NEAR_M = 30
const YEARS3_MONTHS = -36
const RENT_HIGH_X10 = 13 // 1.3배
const MANY_RIVALS = 5
const FEW_SENIORS_PCT = 15
const FAR_STATION_M = 1000
const BARRIER_M2 = 500

const DEPT: Record<FlagRival['kind'], string> = {
  ortho: '정형외과',
  pain: '마취통증의학과',
  rehab: '재활의학과',
  korean: '한의원',
}
const RIVAL_KINDS = ['ortho', 'pain', 'rehab'] as const

const comma = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const monthText = (ymd: string) => `${ymd.slice(0, 4)}년 ${Number(ymd.slice(5, 7))}월`
const radiusText = (m: number) => (m < 1000 ? `${m}m` : `${m / 1000}km`)

// design.md 5절 wonText와 같은 규칙: 만 원으로 나눠떨어지고 100만 원 이상이면 'n억 m만 원'(0인 쪽 뺌), 아니면 '#,###원'
function wonText(won: number): string {
  if (won % 10_000 !== 0 || won < 1_000_000) return `${comma(won)}원`
  const man = won / 10_000
  const eok = Math.floor(man / 10_000)
  const rest = man % 10_000
  return [eok > 0 ? `${comma(eok)}억` : '', rest > 0 ? `${comma(rest)}만` : ''].filter(Boolean).join(' ') + ' 원'
}

// 평당 월세 = 버림(월세 ÷ 평), 평 = ㎡ × 121 ÷ 400. ㎡는 소수 2자리라 100배 정수로 셈
function perPyeong(l: { areaM2: number | null; rent: number | null }): number | null {
  if (l.areaM2 === null || l.rent === null || !(l.areaM2 > 0) || !(l.rent >= 0)) return null
  return Math.floor((l.rent * 40_000) / (Math.round(l.areaM2 * 100) * 121))
}

// '지'·'B'로 시작하면 지하(0), 아니면 첫 숫자. 숫자가 없으면 모름
function floorOf(label: string | null): number | null {
  const s = label?.trim() ?? ''
  if (/^(?:지|b)/i.test(s)) return 0
  const m = /\d+/.exec(s)
  return m ? Number(m[0]) : null
}

const within3Years = (ymd: string | null, today: string) =>
  ymd !== null && isYmd(ymd) && ymd >= addMonthsToDay(today, YEARS3_MONTHS)

function violationFlag(v: FlagInput['violation']): Flag | null {
  if (v === 'no') return null
  if (v === 'yes')
    return {
      id: 'violation-yes',
      level: 'red',
      title: '건축물대장에 위반 건축물로 올라 있어요',
      detail: '위반 건축물이면 보건소 개설 신고가 막힐 수 있어요. 계약 전에 꼭 물어봐요.',
      law: FLAG_LAW.violation,
    }
  return {
    id: 'violation-check',
    level: 'check',
    title: '위반 건축물 확인 필요',
    detail: '건축물대장을 떼어 위반 건축물 표시가 있는지 확인해요. 있으면 개설 신고가 막힐 수 있어요.',
    law: FLAG_LAW.violation,
  }
}

function sameBuildingFlag(rivals: FlagRival[] | null): Flag | null {
  const near = (rivals ?? []).filter((r) => r.kind !== 'korean' && r.distM <= NEAR_M).sort((a, b) => a.distM - b.distM)
  const r = near[0]
  if (!r) return null
  const parts = [
    r.name,
    r.openedYear !== null ? `${r.openedYear}년 문 엶` : null,
    r.doctors !== null ? `의사 ${r.doctors}명` : null,
    `${r.distM}m`,
    near.length > 1 ? `${NEAR_M}m 안 ${near.length}곳` : null,
  ]
  return {
    id: 'same-building',
    level: 'red',
    title: `같은 건물에 ${DEPT[r.kind]}가 있어요`,
    detail: parts.filter((p) => p !== null).join(' · '),
    law: null,
  }
}

function closedHereFlag(history: FlagInput['history'], today: string): Flag | null {
  const closed = (history ?? [])
    .filter((h) => h.kind === 'close' && h.distM <= NEAR_M && within3Years(h.on, today))
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0))
  const h = closed[0]
  if (!h) return null
  const who = `${h.name}${h.dept ? `(${h.dept})` : ''}${closed.length > 1 ? ` 외 ${closed.length - 1}곳` : ''}`
  return {
    id: 'closed-here',
    level: 'red',
    title: `이 자리에서 ${monthText(h.on)}에 의원이 문을 닫았어요`,
    detail: `${who} · ${h.distM}m. 왜 닫았는지 중개사에게 물어봐요.`,
    law: null,
  }
}

function rentHighFlag(listing: FlagInput['listing'], listings: FlagInput['listings']): Flag | null {
  const mine = listing ? perPyeong(listing) : null
  const all = listings.map(perPyeong).filter((v) => v !== null)
  if (mine === null || all.length < 2) return null
  const avg = Math.floor(all.reduce((s, v) => s + v, 0) / all.length)
  if (avg <= 0 || mine * 10 <= avg * RENT_HIGH_X10) return null
  return {
    id: 'rent-high',
    level: 'red',
    title: `평당 월세가 저장한 매물 평균보다 ${Math.floor(((mine - avg) * 100) / avg)}% 비싸요`,
    detail: `이 매물 ${comma(mine)}원 · 저장한 매물 평균 ${comma(avg)}원`,
    law: null,
  }
}

function premiumNewFlag(input: FlagInput): Flag | null {
  const premium = input.listing?.premium ?? null
  const approvedOn = input.building?.approvedOn ?? null
  if (premium === null || !(premium > 0) || approvedOn === null || !within3Years(approvedOn, input.today)) return null
  return {
    id: 'premium-new',
    level: 'red',
    title: `새 건물인데 권리금 ${wonText(premium)}을 달라고 해요`,
    detail: `${monthText(approvedOn)} 사용승인한 건물이에요. 깎을 수 있는지 협상표에 적어 둬요.`,
    law: null,
  }
}

function manyRivalsFlag(rivals: FlagRival[] | null, radiusM: number): Flag | null {
  const inRange = (rivals ?? []).filter((r) => r.kind !== 'korean' && r.distM <= radiusM)
  if (inRange.length < MANY_RIVALS) return null
  const counts = RIVAL_KINDS.map((k) => [k, inRange.filter((r) => r.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${DEPT[k]} ${n}곳`)
  return {
    id: 'many-rivals',
    level: 'red',
    title: `${radiusText(radiusM)} 안에 경쟁 의원이 ${inRange.length}곳 있어요`,
    detail: `${counts.join(' · ')} · 한의원은 빼고 셌어요.`,
    law: null,
  }
}

function fewSeniorsFlag(people: FlagInput['people'], radiusM: number): Flag | null {
  if (!people || !(people.total > 0) || people.bands.length !== 11) return null
  const seniors = people.bands.slice(6).reduce((s, n) => s + n, 0)
  if (seniors * 100 >= people.total * FEW_SENIORS_PCT) return null
  return {
    id: 'few-seniors',
    level: 'red',
    title: `60대 이상이 ${Math.floor((seniors * 100) / people.total)}%뿐이에요`,
    detail: `${radiusText(radiusM)} 안 ${comma(people.total)}명 가운데 ${comma(seniors)}명이에요. 무릎·허리로 오래 다니는 환자가 적을 수 있어요.`,
    law: null,
  }
}

function farStationFlag(station: FlagInput['station']): Flag | null {
  if (!station || station.distM <= FAR_STATION_M) return null
  const km = (Math.floor(station.distM / 100) / 10).toFixed(1)
  const minutes = Math.ceil((station.distM * 3) / 200) // 시속 4km
  const name = station.line ? `${station.name}(${station.line})` : station.name
  return {
    id: 'far-station',
    level: 'red',
    title: `역까지 ${km}km예요 — 걸어서 ${minutes}분`,
    detail: `가장 가까운 역은 ${name}이에요. 어르신은 차나 버스로 와야 해요.`,
    law: null,
  }
}

function barrierFlag(input: FlagInput): Flag | null {
  const floor = floorOf(input.floorLabel)
  const b = input.building
  if (floor === null || floor < 2 || !b || b.elevators !== 0) return null
  const big = (b.totalM2 ?? 0) >= BARRIER_M2 || (input.listing?.areaM2 ?? 0) >= BARRIER_M2
  if (!big) return null
  return {
    id: 'barrier',
    level: 'red',
    title: `${floor}층인데 승강기가 없어요`,
    detail: '넓이 500㎡ 이상 의원은 장애인 편의시설(계단 또는 승강기 등)을 갖춰야 해요. 휠체어·보행기 환자가 올라오기 어려워요.',
    law: FLAG_LAW.barrier,
  }
}

export function pickFlags(input: FlagInput): Flag[] {
  const flags = [
    violationFlag(input.violation),
    sameBuildingFlag(input.rivals),
    closedHereFlag(input.history, input.today),
    rentHighFlag(input.listing, input.listings),
    premiumNewFlag(input),
    manyRivalsFlag(input.rivals, input.radiusM),
    fewSeniorsFlag(input.people, input.radiusM),
    farStationFlag(input.station),
    barrierFlag(input),
  ]
  return flags.filter((f): f is Flag => f !== null)
}
