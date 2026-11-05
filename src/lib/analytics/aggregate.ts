import type {
  Aggregates,
  BucketStats,
  FollowUp,
  Grain,
  GroupStats,
  PatientDay,
  RevisitCounts,
  RxGroupDef,
  RxStats,
  Totals,
} from '@/types/analysis'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import { diffDays, monthOf, monthRange, weekRange, weekStartOf } from './dates'

// ConsumptionRow[] → 일·주·월 칸(버킷)마다 센 숫자. 세기만 한다(완전/부분·증감·재방문 '집계 중'은 다음 단계).
// 처방·그룹·동네는 칸마다 따로 센다(칸 안 서로 다른 환자 수) — 일을 더해 주를 만들면 이틀 온 환자를 두 번 센다.
// 환자 수(totals)는 접수 기준이라 주·달 칸은 일 칸의 합이다 — 한 달에 다섯 번 온 사람은 5다(AC-501.6).
// 줄은 한 번만 훑으며 그 날의 세 칸에 같이 넣는다. rxCode·region은 숫자 번호로 바꿔 Map 열쇠로 쓴다

export const NO_ADDRESS = '주소 없음'

// 칸 안에서 큰 값이 이긴다: 신환 줄이 하나라도 있으면 신환, 없고 재진 줄이 있으면 재진, 둘 다 없으면 알 수 없음
const UNKNOWN = 0
const RETURNING = 1
const NEW = 2

// 신환 재방문 창: 첫 신환일 다음 날부터 이 날수째까지(양 끝 포함)
const REVISIT_DAYS = [7, 14, 30] as const
const NO_GROUPS: readonly number[] = []

type Regions = Map<number, Set<number>> // 지역 번호 → 환자

type RxAcc = {
  days: Map<number, number> // 환자 → 이 칸에서 이 처방을 받은 서로 다른 날 수
  names: Map<string, number> // 이름 → 건수. Map은 처음 나온 순서를 지킨다
  types: Map<string, number>
  regions: Regions // 이 처방을 받은 환자만
}

type BucketAcc = {
  key: string
  range: DateRange
  visit: Map<number, number> // 환자 → UNKNOWN·RETURNING·NEW
  rx: Map<number, RxAcc> // 처방 번호 →
  groups: Map<number, Map<number, number>> // 그룹 자리 → (환자 → 그룹 코드 중 하나라도 받은 서로 다른 날 수)
  regions: Regions
  revisit: RevisitCounts
  totals: Totals // 일 칸은 그날 값, 주·달 칸은 일 칸의 합. 줄을 다 훑은 뒤 채운다
}

// 글자 → 0, 1, 2…(처음 나온 순서). 칸마다 글자 열쇠를 찾지 않게
function numbering() {
  const ids = new Map<string, number>()
  const texts: string[] = []
  const idOf = (text: string): number => {
    let id = ids.get(text)
    if (id === undefined) {
      id = texts.length
      ids.set(text, id)
      texts.push(text)
    }
    return id
  }
  return { idOf, texts }
}

// 칸 key('YYYY-MM-DD'·'YYYY-MM')·rxCode·지역 이름·그룹 id 모두 글자 순서. localeCompare는 브라우저마다 달라 쓰지 않는다
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const dayRange = (date: string): DateRange => ({ from: date, to: date })

// 1회 · 2회 · 3~5회 · 6회+
const followupSlot = (days: number): 0 | 1 | 2 | 3 => (days <= 1 ? 0 : days === 2 ? 1 : days <= 5 ? 2 : 3)

function tally(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1)
}

// 같은 환자가 같은 지역으로 여러 줄이어도 Set이라 한 번만 센다
function addToRegion(regions: Regions, region: number, patient: number): void {
  let patients = regions.get(region)
  if (patients === undefined) {
    patients = new Set()
    regions.set(region, patients)
  }
  patients.add(patient)
}

// 지역별 환자 수, 이름 순. 환자 번호는 여기서 버린다
function regionStats(regions: Regions, regionNames: readonly string[]): { name: string; patients: number }[] {
  return [...regions]
    .map(([id, patients]) => ({ name: regionNames[id], patients: patients.size }))
    .sort((a, b) => compareText(a.name, b.name))
}

// 가장 많이 나온 것, 같으면 먼저 나온 것
function mostCommon(counts: Map<string, number>): string {
  let best = ''
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function bucketIn(buckets: Map<string, BucketAcc>, key: string, rangeOf: (key: string) => DateRange): BucketAcc {
  let bucket = buckets.get(key)
  if (bucket === undefined) {
    bucket = {
      key,
      range: rangeOf(key),
      visit: new Map(),
      rx: new Map(),
      groups: new Map(),
      regions: new Map(),
      revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
      totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
    }
    buckets.set(key, bucket)
  }
  return bucket
}

// 묶음 코드 맞추기 열쇠: 대소문자를 가리지 않는다(화면의 codeKey와 같은 대문자, treatment-trend AC-1205.2).
// 처방 줄(rx)은 코드 글자 그대로 따로 센다
const groupCodeKey = (code: string) => code.toUpperCase()

// 처방코드 열쇠 → 그 코드가 든 그룹 자리들(한 그룹에 같은 코드가 두 번, 대소문자만 달리 있어도 한 번)
function groupsByCode(groups: readonly RxGroupDef[]): Map<string, number[]> {
  const byCode = new Map<string, number[]>()
  groups.forEach((group, at) => {
    for (const code of new Set(group.codes.map(groupCodeKey))) {
      const list = byCode.get(code)
      if (list === undefined) byCode.set(code, [at])
      else list.push(at)
    }
  })
  return byCode
}

// 파일 길의 일 칸: 줄 표시로 센 그날 환자
function addVisits(totals: Totals, visit: Map<number, number>): void {
  for (const seen of visit.values()) {
    totals.patients++
    if (seen === NEW) totals.newPatients++
    else if (seen === RETURNING) totals.returning++
    else totals.unknown++
  }
}

function addTotals(into: Totals, day: Totals): void {
  into.patients += day.patients
  into.newPatients += day.newPatients
  into.returning += day.returning
  into.unknown += day.unknown
}

// patientDays(도우미 길의 접수 줄)가 있으면 일 칸 totals는 접수대로 세고 처방 없는 날의 칸도 만들며, 재방문도 접수를 본다.
// 없으면(파일 길) 일 칸 totals는 줄 표시로 센다. 어느 쪽이든 칸의 visit·rx·groups·regions에는 접수 줄을 쓰지 않는다
export function aggregate(rows: ConsumptionRow[], groups: readonly RxGroupDef[] = [], patientDays?: readonly PatientDay[]): Aggregates {
  const buckets: Record<Grain, Map<string, BucketAcc>> = { day: new Map(), week: new Map(), month: new Map() }
  const bucketsOfDate = new Map<string, readonly [BucketAcc, BucketAcc, BucketAcc]>() // 날짜 → 그 날의 일·주·월 칸
  const rxCodes = numbering()
  const regionNames = numbering()
  const groupsOf = groupsByCode(groups)
  const groupsOfRx: (readonly number[])[] = [] // 처방 번호 → 그 코드가 든 그룹 자리들. 번호마다 한 번만 찾는다
  const firstNew = new Map<number, string>() // 환자 → 첫 신환일(묶음 전체에서 가장 이른 신환 외래 줄·첫 내원 접수 줄의 날)
  const visitDays = new Map<number, Set<string>>() // 환자 → 외래로 온 날(외래 줄·접수 줄)

  const trioOf = (date: string) => {
    let trio = bucketsOfDate.get(date)
    if (trio === undefined) {
      trio = [
        bucketIn(buckets.day, date, dayRange),
        bucketIn(buckets.week, weekStartOf(date), weekRange),
        bucketIn(buckets.month, monthOf(date), monthRange),
      ]
      bucketsOfDate.set(date, trio)
    }
    return trio
  }
  const noteVisit = (patient: number, date: string, isNew: boolean) => {
    let days = visitDays.get(patient)
    if (days === undefined) {
      days = new Set()
      visitDays.set(patient, days)
    }
    days.add(date)
    const seenNew = firstNew.get(patient)
    if (isNew && (seenNew === undefined || date < seenNew)) firstNew.set(patient, date)
  }

  for (const row of rows) {
    if (row.outpatient === false) continue // 입원 줄. null은 외래로 본다
    const trio = trioOf(row.date)
    const { patient } = row
    const visit = row.firstVisit === true ? NEW : row.firstVisit === false ? RETURNING : UNKNOWN
    const rx = rxCodes.idOf(row.rxCode)
    const region = regionNames.idOf(row.region ?? NO_ADDRESS)
    // 같은 환자·같은 날·같은 처방 여러 줄 = 1건. 일 칸에 이미 있으면 주·월 칸에서도 그 날을 이미 셌다
    const newCase = trio[0].rx.get(rx)?.days.has(patient) !== true
    // 그룹도 같다: 같은 환자·같은 날에 그룹 코드 여러 줄 = 그 그룹의 하루
    let inGroups = groupsOfRx[rx]
    if (inGroups === undefined) {
      inGroups = groupsOf.get(groupCodeKey(row.rxCode)) ?? NO_GROUPS
      groupsOfRx[rx] = inGroups
    }
    const newGroupDays = inGroups === NO_GROUPS ? NO_GROUPS : inGroups.filter((at) => trio[0].groups.get(at)?.has(patient) !== true)

    noteVisit(patient, row.date, visit === NEW)

    for (const bucket of trio) {
      const seen = bucket.visit.get(patient)
      if (seen === undefined || seen < visit) bucket.visit.set(patient, visit)
      addToRegion(bucket.regions, region, patient)

      for (const at of newGroupDays) {
        let groupDays = bucket.groups.get(at)
        if (groupDays === undefined) {
          groupDays = new Map()
          bucket.groups.set(at, groupDays)
        }
        groupDays.set(patient, (groupDays.get(patient) ?? 0) + 1)
      }

      let acc = bucket.rx.get(rx)
      if (acc === undefined) {
        acc = { days: new Map(), names: new Map(), types: new Map(), regions: new Map() }
        bucket.rx.set(rx, acc)
      }
      addToRegion(acc.regions, region, patient) // 중복 줄도 넣는다 — 칸 지역과 같은 규칙

      if (!newCase) continue
      acc.days.set(patient, (acc.days.get(patient) ?? 0) + 1)
      tally(acc.names, row.rxName)
      tally(acc.types, row.rxType)
    }
  }

  for (const { patient, date, receptions, firstVisit } of patientDays ?? []) {
    const [day] = trioOf(date)
    day.totals.patients += receptions
    if (firstVisit) day.totals.newPatients++
    noteVisit(patient, date, firstVisit)
  }

  // 일 칸 totals를 마무리하고 주·달 칸에 더한다. 날짜마다 한 번이라 일 칸도 한 번씩이다
  for (const [day, week, month] of bucketsOfDate.values()) {
    if (patientDays === undefined) addVisits(day.totals, day.visit)
    else day.totals.returning = day.totals.patients - day.totals.newPatients
    addTotals(week.totals, day.totals)
    addTotals(month.totals, day.totals)
  }

  // 신환 재방문: 첫 신환일이 든 일·주·월 칸에 더한다. 다른 날(다음 날부터 N일째까지)의 외래 줄만 재방문이다.
  // 다음 날 이후 외래 줄은 있는데 30일 안에는 없으면 첫 재방문이 31일째 이후다(after30)
  for (const [patient, first] of firstNew) {
    const later = [...(visitDays.get(patient) ?? [])].map((date) => diffDays(first, date)).filter((gap) => gap >= 1)
    const [within7, within14, within30] = REVISIT_DAYS.map((limit) => later.some((gap) => gap <= limit))
    const after30 = !within30 && later.length > 0
    for (const bucket of bucketsOfDate.get(first) ?? []) {
      bucket.revisit.cohort++
      if (within7) bucket.revisit.within7++
      if (within14) bucket.revisit.within14++
      if (within30) bucket.revisit.within30++
      if (after30) bucket.revisit.after30++
    }
  }

  const finish = (grain: Grain): BucketStats[] =>
    [...buckets[grain].values()]
      .sort((a, b) => compareText(a.key, b.key))
      .map((bucket) => toStats(bucket, rxCodes.texts, regionNames.texts, groups))
  return { day: finish('day'), week: finish('week'), month: finish('month') }
}

// 환자 → 날 수 묶음에서 그 칸의 신환·재진 수와 F/U
function countPatients(days: Map<number, number>, visit: Map<number, number>) {
  const followup: FollowUp = [0, 0, 0, 0]
  let newPatients = 0
  let returning = 0
  for (const [patient, count] of days) {
    followup[followupSlot(count)]++
    const seen = visit.get(patient)
    if (seen === NEW) newPatients++
    else if (seen === RETURNING) returning++
  }
  return { patients: days.size, newPatients, returning, followup }
}

// 센 것 → 화면용 숫자. 환자 번호는 여기서 버린다(몇 명인지만 남긴다)
function toStats(
  bucket: BucketAcc,
  rxCodes: readonly string[],
  regionNames: readonly string[],
  groups: readonly RxGroupDef[],
): BucketStats {
  const rx: RxStats[] = []
  for (const [id, acc] of bucket.rx) {
    const { patients, newPatients, returning, followup } = countPatients(acc.days, bucket.visit)
    rx.push({
      code: rxCodes[id],
      name: mostCommon(acc.names),
      type: mostCommon(acc.types),
      patients,
      newPatients,
      returning,
      followup,
      regions: regionStats(acc.regions, regionNames),
    })
  }

  const groupStats: GroupStats[] = [...bucket.groups].map(([at, days]) => ({
    id: groups[at].id,
    ...countPatients(days, bucket.visit),
  }))

  return {
    key: bucket.key,
    range: bucket.range,
    totals: bucket.totals,
    rx: rx.sort((a, b) => compareText(a.code, b.code)),
    regions: regionStats(bucket.regions, regionNames),
    groups: groupStats.sort((a, b) => compareText(a.id, b.id)),
    revisit: { ...bucket.revisit },
  }
}
