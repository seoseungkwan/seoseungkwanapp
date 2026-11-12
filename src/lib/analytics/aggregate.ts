import type {
  Aggregates,
  BucketStats,
  FollowUp,
  Grain,
  GroupStats,
  PatientDay,
  RevisitCounts,
  RxAgain,
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
// 같은 처방 재방문(again)은 일 칸에만 있다: 처방·환자마다 받은 날을 모아 두었다가 다 훑은 뒤 센다. 칸에는 처방별 몇 명·몇 번뿐이다
// 묶음(groups)도 모은 뒤 판단한다: 빼는 처방·조건 처방은 그날 어느 줄에든 있을 수 있어서다(spec group-exclude 셈 규칙)

export const NO_ADDRESS = '주소 없음'

// 그날 안에서 큰 값이 그날 표시다: 그날 그 환자의 외래 줄(다른 처방 줄 포함) 중 신환 줄이 하나라도 있으면 신환, 없고 재진 줄이 있으면 재진,
// 둘 다 없으면 알 수 없음. 주·달 칸의 처방·묶음 신환·재진은 그 처방을 받은(묶음을 센) 날들의 그날 표시 중 큰 값이다(spec rx-split-new REQ-3804)
const UNKNOWN = 0
const RETURNING = 1
const NEW = 2

// 신환 재방문 창: 첫 신환일 다음 날부터 이 날수째까지(양 끝 포함)
const REVISIT_DAYS = [7, 14, 30] as const
// 같은 처방 재방문: 시작 = 앞 받은 날보다 이 날수 넘게 뒤인 날(첫 날 포함), 창 = 시작 다음 날부터 이 날수째까지(양 끝 포함)
const AGAIN_GAP = 30
const AGAIN_DAYS = [7, 14, 30] as const
const DAY_ZERO = '1970-01-01' // 일 번호의 0일
const NO_CODE = -1 // 어느 묶음에도 나오지 않는 처방

type Regions = Map<number, Set<number>> // 지역 번호 → 환자

type RxAcc = {
  days: Map<number, number> // 환자 → 이 칸에서 이 처방을 받은 서로 다른 날 수
  visit: Map<number, number> // 환자 → 이 칸에서 이 처방을 받은 날들의 그날 표시 중 큰 값. 줄을 다 훑은 뒤 채운다
  names: Map<string, number> // 이름 → 건수. Map은 처음 나온 순서를 지킨다
  types: Map<string, number>
  regions: Regions // 이 처방을 받은 환자만
}

// 한 환자가 한 칸에서 센 묶음: ats[i]를 센 날의 그날 표시가 seen[i]
type GroupDays = {
  ats: number[] // 센 그룹 자리(센 날마다 한 번씩: 이틀 센 그룹은 두 번)
  seen: number[]
}

type AgainAcc = Omit<RxAgain, 'code'>

type BucketAcc = {
  key: string
  range: DateRange
  at: number // 칸 첫날의 일 번호(DAY_ZERO부터 며칠째). 같은 처방 재방문이 일 칸끼리 날 수를 잰다
  visit: Map<number, number> // 환자 → 그날 표시(UNKNOWN·RETURNING·NEW). 일 칸만 채운다
  rx: Map<number, RxAcc> // 처방 번호 →
  groups: Map<number, GroupDays> // 환자 → 그 칸에서 센 그룹 자리와 그날 표시
  regions: Regions
  revisit: RevisitCounts
  totals: Totals // 일 칸은 그날 값, 주·달 칸은 일 칸의 합. 줄을 다 훑은 뒤 채운다
  again: Map<number, AgainAcc> // 처방 번호 → 그날 시작한 환자 수와 창 숫자. 일 칸만 쓴다
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
    const range = rangeOf(key)
    bucket = {
      key,
      range,
      at: diffDays(DAY_ZERO, range.from),
      visit: new Map(),
      rx: new Map(),
      groups: new Map(),
      regions: new Map(),
      revisit: { cohort: 0, within7: 0, within14: 0, within30: 0, after30: 0 },
      totals: { patients: 0, newPatients: 0, returning: 0, unknown: 0 },
      again: new Map(),
    }
    buckets.set(key, bucket)
  }
  return bucket
}

// 묶음 코드 맞추기 열쇠: 대소문자를 가리지 않는다(화면의 codeKey와 같은 대문자, treatment-trend AC-1205.2).
// 처방 줄(rx)은 코드 글자 그대로 따로 센다
const groupCodeKey = (code: string) => code.toUpperCase()

// 묶음 하나의 셈 규칙. 코드는 묶음 코드 번호(대문자 코드를 0, 1, 2…로 매긴 것)
type GroupRule = {
  include: readonly number[] // 넣는 처방(겹침 없음)
  out: readonly number[] // 빼는 처방
  unless: ReadonlyMap<number, readonly number[]> // 넣는 처방 → 그 처방의 조건 처방(비지 않음)
}

// 묶음 정의 → 셈 규칙과 묶음 코드 번호(묶음에 나오는 코드만). 한 묶음에 같은 코드가 두 번, 대소문자만 달리 있어도 한 번이다.
// 조건은 열쇠(treatmentView keptCond)와 같은 규칙으로 거른다: 넣는 처방에 없는 code는 버리고, 같은 code는 합치고,
// unless에서 code 자신을 빼고, 남은 unless가 비면 버린다. 그래서 열쇠가 같으면 셈도 같다
function groupRules(groups: readonly RxGroupDef[]) {
  const codes = numbering()
  const idsOf = (list: readonly string[]) => [...new Set(list.map((code) => codes.idOf(groupCodeKey(code))))]
  const rules = groups.map((group): GroupRule => {
    const includeKeys = group.codes.map(groupCodeKey)
    const include = idsOf(group.codes)
    const unless = new Map<number, number[]>()
    for (const item of group.cond ?? []) {
      const key = groupCodeKey(item.code)
      if (!includeKeys.includes(key)) continue
      const code = codes.idOf(key)
      const had = unless.get(code) ?? []
      const others = idsOf(item.unless).filter((other) => other !== code && !had.includes(other))
      if (others.length > 0) unless.set(code, [...had, ...others])
    }
    return { include, out: idsOf(group.out ?? []), unless }
  })
  const byCode: number[][] = codes.texts.map(() => []) // 묶음 코드 번호 → 그 코드를 넣는 처방으로 둔 묶음 자리들
  rules.forEach((rule, at) => {
    for (const code of rule.include) byCode[code].push(at)
  })
  const codeIds = new Map(codes.texts.map((code, id) => [code, id]))
  return { rules, byCode, codeIds }
}

// 셈 규칙: 그날 받은 묶음 코드 중 (가) 조건 처방을 그날 하나도 안 받은 넣는 처방이 하나 이상 있고 (나) 빼는 처방이 하나도 없으면 1건
function countsAs(rule: GroupRule, codes: readonly number[]): boolean {
  for (const code of rule.out) if (codes.includes(code)) return false
  for (const code of rule.include) {
    if (!codes.includes(code)) continue
    const unless = rule.unless.get(code)
    if (unless === undefined || !unless.some((other) => codes.includes(other))) return true
  }
  return false
}

// 그 칸에 환자의 하루를 더한다: 그날 센 묶음 자리와 그날 표시(seen)를 이어 붙인다(묶음마다 Map을 찾지 않게 환자 하나에 한 번만 찾는다)
function addGroupDay(bucket: BucketAcc, patient: number, counted: readonly number[], seen: number): void {
  let days = bucket.groups.get(patient)
  if (days === undefined) {
    days = { ats: [], seen: [] }
    bucket.groups.set(patient, days)
  }
  for (const at of counted) {
    days.ats.push(at)
    days.seen.push(seen)
  }
}

function againIn(day: BucketAcc, rx: number): AgainAcc {
  let counts = day.again.get(rx)
  if (counts === undefined) {
    counts = { starts: 0, back: [0, 0, 0], more: [0, 0, 0] }
    day.again.set(rx, counts)
  }
  return counts
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
  const { rules, byCode, codeIds } = groupRules(groups)
  const groupCodeOfRx: number[] = [] // 처방 번호 → 묶음 코드 번호(NO_CODE: 어느 묶음에도 없음). 번호마다 한 번만 찾는다
  const dayCodes = new Map<readonly [BucketAcc, BucketAcc, BucketAcc], Map<number, number[]>>() // 그날의 세 칸 → (환자 → 그날 받은 묶음 코드)
  const firstNew = new Map<number, string>() // 환자 → 첫 신환일(묶음 전체에서 가장 이른 신환 외래 줄·첫 내원 접수 줄의 날)
  const visitDays = new Map<number, Set<string>>() // 환자 → 외래로 온 날(외래 줄·접수 줄)
  const rxDays = new Map<number, Map<number, BucketAcc[]>>() // 처방 번호 → (환자 → 그 처방을 외래로 받은 서로 다른 날의 일 칸). 진료 줄만

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
    // 묶음은 환자·날마다 받은 묶음 코드만 모은다. 판단은 다 훑은 뒤 한 번
    let groupCode = groupCodeOfRx[rx]
    if (groupCode === undefined) {
      groupCode = codeIds.get(groupCodeKey(row.rxCode)) ?? NO_CODE
      groupCodeOfRx[rx] = groupCode
    }
    if (groupCode !== NO_CODE) {
      let byPatient = dayCodes.get(trio)
      if (byPatient === undefined) {
        byPatient = new Map()
        dayCodes.set(trio, byPatient)
      }
      const codes = byPatient.get(patient)
      if (codes === undefined) byPatient.set(patient, [groupCode])
      else if (!codes.includes(groupCode)) codes.push(groupCode)
    }

    noteVisit(patient, row.date, visit === NEW)
    if (newCase) {
      let byPatient = rxDays.get(rx)
      if (byPatient === undefined) {
        byPatient = new Map()
        rxDays.set(rx, byPatient)
      }
      const days = byPatient.get(patient)
      if (days === undefined) byPatient.set(patient, [trio[0]])
      else days.push(trio[0])
    }

    // 그날 표시는 일 칸에만 모은다. 주·달 칸은 다 훑은 뒤 받은(센) 날의 그날 표시를 올린다
    const [day] = trio
    const seen = day.visit.get(patient)
    if (seen === undefined || seen < visit) day.visit.set(patient, visit)

    for (const bucket of trio) {
      addToRegion(bucket.regions, region, patient)

      let acc = bucket.rx.get(rx)
      if (acc === undefined) {
        acc = { days: new Map(), visit: new Map(), names: new Map(), types: new Map(), regions: new Map() }
        bucket.rx.set(rx, acc)
      }
      addToRegion(acc.regions, region, patient) // 중복 줄도 넣는다 — 칸 지역과 같은 규칙

      if (!newCase) continue
      acc.days.set(patient, (acc.days.get(patient) ?? 0) + 1)
      tally(acc.names, row.rxName)
      tally(acc.types, row.rxType)
    }
  }

  // 처방 신환·재진: 그날 표시는 그날 줄을 다 훑어야 정해진다. 날마다 그날 받은 처방·환자의 그날 표시를
  // 그날의 일·주·달 칸 같은 처방에 큰 값으로 올린다(일 칸은 그날 표시 그대로가 된다)
  for (const trio of bucketsOfDate.values()) {
    const [day] = trio
    for (const [rx, dayAcc] of day.rx) {
      for (const patient of dayAcc.days.keys()) {
        const seen = day.visit.get(patient) ?? UNKNOWN // 진료 줄에서 온 환자라 늘 있다
        for (const bucket of trio) {
          const acc = bucket.rx.get(rx)
          if (acc === undefined) continue // 그날 줄이 세 칸에 같이 넣었으므로 늘 있다
          const best = acc.visit.get(patient)
          if (best === undefined || best < seen) acc.visit.set(patient, seen)
        }
      }
    }
  }

  // 묶음: 환자·날마다 셈 규칙(countsAs)으로 판단해, 센 묶음을 그날 표시와 함께 그날의 일·주·달 칸에 더한다. 같은 환자·같은 날·같은 묶음 = 1건.
  // 판단할 묶음은 그날 받은 코드를 넣는 처방으로 둔 묶음뿐이고, seenAt(묶음 자리 → 마지막으로 판단한 환자·날 차례)으로 한 번씩만 판단한다
  const seenAt = rules.map(() => 0)
  const counted: number[] = [] // 지금 환자·날에 센 묶음 자리
  let visitNo = 0
  for (const [trio, byPatient] of dayCodes) {
    for (const [patient, codes] of byPatient) {
      visitNo++
      counted.length = 0
      for (const code of codes) {
        for (const at of byCode[code]) {
          if (seenAt[at] === visitNo) continue
          seenAt[at] = visitNo
          if (countsAs(rules[at], codes)) counted.push(at)
        }
      }
      if (counted.length === 0) continue
      const seen = trio[0].visit.get(patient) ?? UNKNOWN // 진료 줄에서 온 환자·날이라 늘 있다
      for (const bucket of trio) addGroupDay(bucket, patient, counted, seen)
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

  // 같은 처방 재방문: 처방·환자마다 받은 날을 늘어놓고, 앞 날보다 30일 넘게 뒤인 날(첫 날 포함)이 시작이다.
  // 시작 뒤의 날 중 다음 날부터 N일째까지인 날 수가 more, 하나라도 있으면 back 1. 시작한 날의 일 칸에 더한다
  for (const [rx, byPatient] of rxDays) {
    for (const days of byPatient.values()) {
      if (days.length > 1) days.sort((a, b) => a.at - b.at)
      for (let i = 0; i < days.length; i++) {
        const { at } = days[i]
        if (i > 0 && at - days[i - 1].at <= AGAIN_GAP) continue
        const counts = againIn(days[i], rx)
        counts.starts++
        for (let k = 0; k < AGAIN_DAYS.length; k++) {
          let more = 0
          while (i + more + 1 < days.length && days[i + more + 1].at - at <= AGAIN_DAYS[k]) more++
          counts.more[k] += more
          if (more > 0) counts.back[k]++
        }
      }
    }
  }

  const finish = (grain: Grain): BucketStats[] =>
    [...buckets[grain].values()]
      .sort((a, b) => compareText(a.key, b.key))
      .map((bucket) => toStats(bucket, rxCodes.texts, regionNames.texts, groups, grain === 'day'))
  return { day: finish('day'), week: finish('week'), month: finish('month') }
}

// 환자 → 날 수 묶음에서 그 칸의 신환·재진 수와 F/U. visit = 환자 → 그 처방을 받은 날들의 그날 표시 중 큰 값
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
  withAgain: boolean,
): BucketStats {
  const rx: RxStats[] = []
  for (const [id, acc] of bucket.rx) {
    const { patients, newPatients, returning, followup } = countPatients(acc.days, acc.visit)
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

  return {
    key: bucket.key,
    range: bucket.range,
    totals: bucket.totals,
    rx: rx.sort((a, b) => compareText(a.code, b.code)),
    regions: regionStats(bucket.regions, regionNames),
    groups: groupStats(bucket, groups),
    revisit: { ...bucket.revisit },
    ...(withAgain ? { again: againStats(bucket.again, rxCodes) } : {}),
  }
}

// 칸의 그룹 숫자: 그룹마다 센 서로 다른 환자 수·그중 신환·재진(센 날들의 그날 표시 중 큰 값)·F/U(센 날 수). 환자 번호는 여기서 버린다.
// 그 칸에 환자가 없는 그룹은 빠지고 id 순
function groupStats(bucket: BucketAcc, groups: readonly RxGroupDef[]): GroupStats[] {
  const statOf: (GroupStats | undefined)[] = [] // 그룹 자리 →
  const days = groups.map(() => 0) // 그룹 자리 → 지금 환자를 그 그룹으로 센 날 수. 환자마다 비운다
  const best = groups.map(() => UNKNOWN) // 그룹 자리 → 지금 환자를 그 그룹으로 센 날들의 그날 표시 중 큰 값. 환자마다 비운다
  for (const { ats, seen: seenOf } of bucket.groups.values()) {
    for (let i = 0; i < ats.length; i++) {
      const at = ats[i]
      days[at]++
      if (best[at] < seenOf[i]) best[at] = seenOf[i]
    }
    for (const at of ats) {
      const count = days[at]
      if (count === 0) continue // 같은 그룹 둘째 날부터는 이미 셌다
      const seen = best[at]
      days[at] = 0
      best[at] = UNKNOWN
      let stat = statOf[at]
      if (stat === undefined) {
        stat = { id: groups[at].id, patients: 0, newPatients: 0, returning: 0, followup: [0, 0, 0, 0] }
        statOf[at] = stat
      }
      stat.patients++
      stat.followup[followupSlot(count)]++
      if (seen === NEW) stat.newPatients++
      else if (seen === RETURNING) stat.returning++
    }
  }
  return statOf.filter((stat) => stat !== undefined).sort((a, b) => compareText(a.id, b.id))
}

// 일 칸의 같은 처방 재방문: 시작이 있는 처방만, 처방코드 순
function againStats(again: Map<number, AgainAcc>, rxCodes: readonly string[]): RxAgain[] {
  return [...again]
    .map(([id, counts]) => ({ code: rxCodes[id], ...counts }))
    .sort((a, b) => compareText(a.code, b.code))
}
