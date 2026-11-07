import { toRegion } from '@/lib/parsers/region'
import type { DateRange } from '@/types/dates'
import type { MixDelta, MixRow, MixRowKind, PatientMix } from '@/types/stats'

// 환자 구성(연령대·보험·동네) [환자 자료 구역] (stats-bit-sections REQ-2703·AC-2707.1).
// 접수 줄·사람 표는 세는 데만 쓰고 결과에는 묶음 이름과 수만 남긴다. 날짜는 'YYYY-MM-DD'라 글자 순서가 곧 날짜 순서다

export type { MixDelta, MixRow, PatientMix } from '@/types/stats'

// 접수 한 건(Worker 메모리에만). p = PatientIds 번호(차트번호 없으면 -1), d = YYYY-MM-DD, h = 접수 시(0~23, 모르면 null),
// ins = 보험 이름(비트 그대로), doc = 진료의 코드
export type VisitLine = { p: number; d: string; h: number | null; ins: string | null; doc: string | null }
// 환자 한 명. birth = YYYY-MM-DD, area = 주소 앞부분(도우미가 보낸 앞 낱말 다섯 개까지)
export type Person = { birth: string | null; area: string | null }
// first = 환자 → 첫 내원일(YYYY-MM-DD, 모르면 없음). previous = 견줄 기간(없으면 견주지 않는다, AC-2703.9)
export type MixInput = {
  from: string
  to: string
  previous?: DateRange | null
  visits: readonly VisitLine[]
  people: ReadonlyMap<number, Person>
  first: ReadonlyMap<number, string>
}
export type MixWho = 'all' | 'new'
export type MixUnit = 'city' | 'town'

export const AGE_BANDS = ['10세 미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세 이상'] as const
export const NO_BIRTH = '생년월일 없음'
export const NO_INSURANCE = '보험 모름'
export const NO_ADDRESS = '주소 없음'
export const NO_TOWN = '동 없는 주소'
const NEAR_POOR = '차상위' // 차상위 1종·차상위 2종 … 모두 한 줄(2026-11-07 사용자 결정)
const MAX_AGE = 120
const TOP_PLACES = 10
const EPSILON = 1e-9 // 0.145 × 100 = 14.4999… 같은 부동소수 오차가 반올림을 바꾸지 않게

// 동네 묶음 열쇠의 특별한 자리. 지역 이름(한글·숫자·.·)에는 이 글자가 없다
const NONE_KEY = '\u0000none'
const NO_TOWN_KEY = '\u0000noTown'

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const comma = (n: number) => n.toLocaleString('en-US')

// ── 연령대 ────────────────────────────────────────────────

// day 기준 만 나이의 묶음. 생일(월-일)이 아직 안 왔으면 한 살 뺀다(윤일생은 3월 1일에 한 살 먹는다)
export function ageBand(birth: string | null, day: string): string {
  if (birth === null) return NO_BIRTH
  const years = Number(day.slice(0, 4)) - Number(birth.slice(0, 4))
  const age = day.slice(5) < birth.slice(5) ? years - 1 : years
  if (!(age >= 0 && age <= MAX_AGE)) return NO_BIRTH
  return AGE_BANDS[Math.min(Math.floor(age / 10), AGE_BANDS.length - 1)]
}

// ── 보험 ─────────────────────────────────────────────────

export function insuranceName(name: string | null): string {
  const text = (name ?? '').trim()
  if (text === '') return NO_INSURANCE
  return text.includes(NEAR_POOR) ? NEAR_POOR : text
}

// ── 동네 ─────────────────────────────────────────────────

// lib/parsers/region.ts toRegion과 같은 낱말 규칙. toRegion이 줄인 주소를 시·도 / 시·군·구 / 시 안의 구 / 동·읍·면으로 다시 나눈다
const PROVINCE_SHORT = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
])
const PROVINCE = /^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도)$/
const CITY = /^[가-힣]+(시|군|구)$/
const DISTRICT = /^[가-힣]+구$/
const TOWN = /^[가-힣][가-힣0-9.·]*(동|읍|면|가)$/

// city = 시·군(시 안의 구가 없는 구 포함), district = 시 안의 구. 시·도는 묶음에 넣지 않는다('경기'·'경기도'·없음이 같은 구)
type Place = { city: string; district: string | null; town: string | null }

function placeOf(area: string | null): Place | null {
  const region = toRegion(area)
  if (region === null) return null
  const words = region.split(' ')
  let at = PROVINCE_SHORT.has(words[0]) || PROVINCE.test(words[0]) ? 1 : 0
  const city = words[at++]
  if (city === undefined || !CITY.test(city)) return null
  let district: string | null = null
  if (city.endsWith('시') && words[at] !== undefined && DISTRICT.test(words[at])) district = words[at++]
  const town = words[at] !== undefined && TOWN.test(words[at]) ? words[at] : null
  return { city, district, town }
}

// [구·시] 열쇠 = '시·군' 또는 '시 구'(낱말에는 빈칸이 없다). [동] 열쇠 = '[구·시] 열쇠|동'
const cityKeyOf = (place: Place) => (place.district === null ? place.city : `${place.city} ${place.district}`)
const townKeyOf = (place: Place) => (place.town === null ? NO_TOWN_KEY : `${cityKeyOf(place)}|${place.town}`)

// ── 세기 ─────────────────────────────────────────────────

type Count = { people: number; visits: number }
type Tally = Map<string, Count>
type Counts = { total: Count; age: Tally; insurance: Tally; city: Tally; town: Tally }

function add(tally: Tally, key: string, field: keyof Count): void {
  const count = tally.get(key)
  if (count) count[field]++
  else tally.set(key, { people: 0, visits: 0, [field]: 1 })
}

// 같은 날이면 시각이 늦은 것, 시각을 모르면 가장 이른 것으로 본다. 같은 날·같은 시면 뒤 줄(도우미가 시각 차례로 보낸다)
const isLater = (line: VisitLine, seen: VisitLine) =>
  line.d > seen.d || (line.d === seen.d && (line.h ?? -1) >= (seen.h ?? -1))

// 한 기간을 센다. 명은 환자마다 기간 안 마지막 접수로 한 번, 건은 접수마다(AC-2703.2·AC-2703.3)
function countPeriod(input: MixInput, { from, to }: DateRange, who: MixWho, places: (p: number) => Place | null): Counts {
  const counts: Counts = { total: { people: 0, visits: 0 }, age: new Map(), insurance: new Map(), city: new Map(), town: new Map() }
  const ages = new Map<number, string>()
  const ageOf = (p: number) => {
    if (p < 0) return NO_BIRTH
    let band = ages.get(p)
    if (band === undefined) {
      band = ageBand(input.people.get(p)?.birth ?? null, to)
      ages.set(p, band)
    }
    return band
  }
  const isNew = (p: number) => {
    const first = input.first.get(p)
    return first !== undefined && first >= from && first <= to
  }
  const tallyOne = (line: VisitLine, field: keyof Count) => {
    const place = line.p < 0 ? null : places(line.p)
    add(counts.age, ageOf(line.p), field)
    add(counts.insurance, insuranceName(line.ins), field)
    add(counts.city, place === null ? NONE_KEY : cityKeyOf(place), field)
    add(counts.town, place === null ? NONE_KEY : townKeyOf(place), field)
    counts.total[field]++
  }

  const last = new Map<number, VisitLine>()
  for (const line of input.visits) {
    if (line.d < from || line.d > to) continue
    if (who === 'new' && (line.p < 0 || !isNew(line.p))) continue
    tallyOne(line, 'visits')
    if (line.p < 0) continue
    const seen = last.get(line.p)
    if (seen === undefined || isLater(line, seen)) last.set(line.p, line)
  }
  for (const line of last.values()) tallyOne(line, 'people')
  return counts
}

// ── 줄 만들기 ─────────────────────────────────────────────

type Made = { key: string; label: string; count: Count }

const byPeopleThenLabel = (a: Made, b: Made) => b.count.people - a.count.people || compareText(a.label, b.label)

function makeRow(made: Made, kind: MixRowKind, total: number, before: Tally | null): MixRow {
  const previous = kind === 'row' && before !== null ? (before.get(made.key)?.people ?? 0) : null
  return {
    label: made.label,
    people: made.count.people,
    visits: made.count.visits,
    share: total > 0 ? made.count.people / total : 0,
    kind,
    previous,
  }
}

const ZERO: Count = { people: 0, visits: 0 }
const isEmpty = (count: Count) => count.people === 0 && count.visits === 0

// 연령대: 나이 차례로 늘 열 줄(AC-2703.1)
function ageRows(now: Counts, before: Counts | null): MixRow[] {
  const total = now.total.people
  const rows = AGE_BANDS.map((band) => makeRow({ key: band, label: band, count: now.age.get(band) ?? ZERO }, 'row', total, before?.age ?? null))
  rows.push(makeRow({ key: NO_BIRTH, label: NO_BIRTH, count: now.age.get(NO_BIRTH) ?? ZERO }, 'none', total, null))
  return rows
}

// 보험: 모두 보이고 많이 온 차례(AC-2703.4)
function insuranceRows(now: Counts, before: Counts | null): MixRow[] {
  const made = [...now.insurance].map(([key, count]) => ({ key, label: key, count }))
  return made.sort(byPeopleThenLabel).map((one) => makeRow(one, 'row', now.total.people, before?.insurance ?? null))
}

// 동네: 많이 온 차례로 열 줄 + '그 밖 N곳' + '동 없는 주소' + '주소 없음'. 뒤 세 줄은 비면 없다(AC-2703.7).
// 차트번호 없는 접수는 '주소 없음'의 건에만 들어 0명이어도 건이 있으면 남긴다(건 합 = 접수 건수, AC-2703.2)
function placeRows(tally: Tally, labelOf: (key: string) => string, total: number, before: Tally | null): MixRow[] {
  const made: Made[] = []
  for (const [key, count] of tally) {
    if (key !== NONE_KEY && key !== NO_TOWN_KEY) made.push({ key, label: labelOf(key), count })
  }
  made.sort(byPeopleThenLabel)
  const rows = made.slice(0, TOP_PLACES).map((one) => makeRow(one, 'row', total, before))
  const others = made.slice(TOP_PLACES)
  if (others.length > 0) {
    const count = others.reduce((sum, one) => ({ people: sum.people + one.count.people, visits: sum.visits + one.count.visits }), ZERO)
    rows.push(makeRow({ key: '', label: `그 밖 ${comma(others.length)}곳`, count }, 'rest', total, null))
  }
  const noTown = tally.get(NO_TOWN_KEY) ?? ZERO
  if (!isEmpty(noTown)) rows.push(makeRow({ key: NO_TOWN_KEY, label: NO_TOWN, count: noTown }, 'noTown', total, null))
  const none = tally.get(NONE_KEY) ?? ZERO
  if (!isEmpty(none)) rows.push(makeRow({ key: NONE_KEY, label: NO_ADDRESS, count: none }, 'none', total, null))
  return rows
}

// 1위 시 = 명이 가장 많은 시(그 시의 구를 모두 더함, 같으면 이름 차례)
function topCityOf(city: Tally): string | null {
  const byCity = new Map<string, number>()
  for (const [key, count] of city) {
    const name = key.split(' ')[0]
    if (key !== NONE_KEY && name.endsWith('시')) byCity.set(name, (byCity.get(name) ?? 0) + count.people)
  }
  let top: { name: string; people: number } | null = null
  for (const [name, people] of byCity) {
    if (top === null || people > top.people || (people === top.people && compareText(name, top.name) < 0)) top = { name, people }
  }
  return top?.name ?? null
}

// [구·시] 화면 이름: 1위 시 안의 구는 구 이름만, 다른 시의 구는 '시 구', 구 없는 시·군은 그 이름(AC-2703.5)
function cityLabeler(topCity: string | null) {
  return (key: string) => {
    const [city, district] = key.split(' ')
    if (district === undefined) return city
    return city === topCity ? district : key
  }
}

// [동] 화면 이름: 동·읍·면 이름. 같은 이름이 다른 [구·시] 묶음에도 있으면 '동 ([구·시] 화면 이름)'(AC-2703.6)
function townLabeler(town: Tally, cityLabel: (key: string) => string) {
  const seen = new Map<string, number>()
  for (const key of town.keys()) {
    if (key === NONE_KEY || key === NO_TOWN_KEY) continue
    const name = key.slice(key.indexOf('|') + 1)
    seen.set(name, (seen.get(name) ?? 0) + 1)
  }
  return (key: string) => {
    const at = key.indexOf('|')
    const name = key.slice(at + 1)
    return (seen.get(name) ?? 0) > 1 ? `${name} (${cityLabel(key.slice(0, at))})` : name
  }
}

// 고른 기간의 환자 구성. 견줄 기간(input.previous)이 있으면 같은 [전체|신환]·같은 묶음 열쇠로 지난 명을 채운다
export function patientMix(input: MixInput, who: MixWho): PatientMix {
  const cache = new Map<number, Place | null>()
  const places = (p: number) => {
    let place = cache.get(p)
    if (place === undefined) {
      place = placeOf(input.people.get(p)?.area ?? null)
      cache.set(p, place)
    }
    return place
  }
  const now = countPeriod(input, { from: input.from, to: input.to }, who, places)
  const before = input.previous ? countPeriod(input, input.previous, who, places) : null
  const cityLabel = cityLabeler(topCityOf(now.city))
  const total = now.total.people
  return {
    total: { ...now.total },
    compared: before !== null,
    age: ageRows(now, before),
    insurance: insuranceRows(now, before),
    city: placeRows(now.city, cityLabel, total, before?.city ?? null),
    town: placeRows(now.town, townLabeler(now.town, cityLabel), total, before?.town ?? null),
  }
}

// ── 화면 글 ───────────────────────────────────────────────

// 비율 = 명 ÷ 묶음 전체 명, 백분율 정수 반올림. 0보다 크고 1% 미만이면 '1% 미만'(AC-2703.8)
export function mixShareText(share: number): string {
  const percent = share * 100
  if (percent > 0 && percent < 1) return '1% 미만'
  return `${Math.round(percent + EPSILON)}%`
}

// 막대 길이(0~100): 그 묶음의 가장 큰 보통 줄 명에 견준다. 그 밖·없음 줄은 기준이 되지 않고 100에서 자른다(시안 그대로)
export function mixBar(row: MixRow, rows: readonly MixRow[]): number {
  const largest = (list: readonly MixRow[]) => list.reduce((max, one) => Math.max(max, one.people), 0)
  const max = largest(rows.filter((one) => one.kind === 'row')) || largest(rows)
  if (max === 0) return 0
  return Number(Math.min(100, (row.people / max) * 100).toFixed(2))
}

// 지난 기간과 견준 증감(AC-2703.9). (이번 − 지난) ÷ 지난을 백분율 정수로(크기를 반올림), 지난 0이면 '새로', 둘 다 0이면 '–'.
// 보통 줄이 아니거나 견주지 않았으면 null
export function mixDelta(row: MixRow): MixDelta | null {
  if (row.kind !== 'row' || row.previous === null) return null
  const { people, previous } = row
  if (previous === 0) {
    return people > 0 ? { dir: 'none', text: '새로', srText: '지난 기간에 없던 줄' } : { dir: 'none', text: '–', srText: '변화 없음' }
  }
  const change = ((people - previous) * 100) / previous
  const size = Math.round(Math.abs(change) + EPSILON)
  if (size === 0) return { dir: 'flat', text: '0%', srText: '변화 없음' }
  return change > 0 ? { dir: 'up', text: `${size}%`, srText: '늘어남' } : { dir: 'down', text: `${size}%`, srText: '줄어듦' }
}

const WHO_NAME: Record<MixWho, string> = { all: '전체', new: '신환' }
const UNIT_NAME: Record<MixUnit, string> = { city: '구·시', town: '동' }

// [표 복사] 글(AC-2707.1). 병원 이름은 화면이 넣는다(Worker에는 가지 않는다)
export function formatPatientMix(hospital: string, rangeLabel: string, who: MixWho, unit: MixUnit, mix: PatientMix): string {
  const block = (title: string, rows: readonly MixRow[]) => [
    title,
    ...rows.map((row) => `${row.label}\t${comma(row.people)}명\t${comma(row.visits)}건\t${mixShareText(row.share)}`),
  ]
  return [
    `${hospital} 환자 구성 (${rangeLabel}, ${WHO_NAME[who]})`,
    '',
    ...block('연령대', mix.age),
    '',
    ...block('보험', mix.insurance),
    '',
    ...block(`동네(${UNIT_NAME[unit]})`, unit === 'city' ? mix.city : mix.town),
  ].join('\n')
}
