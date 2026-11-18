import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { addDays, compareYmd, isYmd } from '@/lib/analytics/dates'
import {
  ANY_CODE,
  formatRxVisitSplit,
  rxVisitHeadline,
  rxVisitSplit,
  rxVisitSplitDays,
  type RxSplitDayTotals,
  type RxSplitTotals,
} from '@/lib/analytics/rxVisitSplit'
import { doctorStats } from '@/lib/analytics/doctorStats'
import { dropoff } from '@/lib/analytics/dropoff'
import { patientMix } from '@/lib/analytics/patientMix'
import { patientValue, type ValuePay } from '@/lib/analytics/patientValue'
import { sunapDoctors, sunapRates } from '@/lib/analytics/sunapRates'
import { visitHours } from '@/lib/analytics/visitHours'
import { createPatientIds } from '@/lib/parsers/bit'
import { fillGroupCounts } from '@/lib/payload/groupCounts'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import { toMonthSections } from '@/lib/payload/toMonthSections'
import type { PatientDay, RxGroupDef } from '@/types/analysis'
import type { AnalysisResult } from '@/types/analyze'
import type { ConsumptionRow } from '@/types/consumption'
import type { DateRange } from '@/types/dates'
import type {
  BitSectionsView,
  DropoffLine,
  PatientValue,
  RxSplitLine,
  RxSplitView,
  StatsChecks,
  StatsLoaded,
  StatsLoadRequest,
  StatsSectionsRequest,
  StatsSplitRequest,
  StatsSunapGroups,
  StatsWorkerMessage,
} from '@/types/stats'
import type { DoctorBreakdown } from '@/types/sunap'
import { createAssembler, StatsDataError } from './assemble'
import {
  dashed,
  isRecord,
  parseStatsRows,
  toConsumptionRows,
  toFirstVisits,
  toPatientDays,
  toPatientPays,
  toStatsExtra,
  toVisitRows,
  type StatsExtra,
  type StatsRowsData,
  type StatsSummary,
  type VisitRow,
} from './helperData'

// 통계 Worker의 일 [환자 자료 구역]. 시험은 이 함수들을 바로 부른다(stats.worker.ts는 포트와 잇기만 한다).
// 화면에는 StatsLoaded(숫자·처방코드·처방 이름·날짜)만 가고, 진료 줄은 memory로 Worker 안에만 남는다. 접수 줄은 세는 데만 쓰고 남기지 않는다.
// v3 답의 접수 줄·사람 표·원장님 표는 bit로 Worker 안에만 남고(저장·서버로 안 감), 화면에는 세 칸 보기(묶음 이름과 수)만 간다

// 처방별 신환·재진(split 일)이 쓰는 값. Worker 밖으로 나가지 않는다. 다음 load가 덮어쓴다(keep: false인 load는 덮지 않는다)
export type StatsMemory = {
  range: { from: string; to: string }
  rows: VisitRow[]
  summary: StatsSummary // 불러온 범위 전체의 도우미 합계. 머리 글은 이것이 아니라 days의 합이다
  days: { date: string; visits: number; patients: number; newPatients: number }[]
  names: ReadonlyMap<string, string>
}

// 비트 전용 세 칸(sections 일)이 쓰는 값. Worker 밖으로 나가지 않고 저장하지 않는다. 다음 load가 memory와 함께 덮어쓴다.
// v = 답의 판(4·5면 날 숫자에 90일초진 first90이 있다, spec first90. 5면 신환은 비트 신환 표시 날이다, spec new-mark),
// extra = v3~v5 접수 줄·사람 표·원장님 표·날·원장님 금액(v2 답이면 null),
// first = 환자 → 첫 내원일(v5면 가장 이른 신환 날, v2면 비어 있다).
// patientDays·consumption = 통계 '예약·전환' Block 전환(spec sunap-ilji AC-4906.3)이 세는 접수 줄(환자·날)과 진료 줄. aggregate에 넣은 것과 같은 배열이다.
// groups = 이 load가 실은 묶음 정의(열쇠·코드만). 몇 번까지 받나(stats-insights AC-6103.1)가 메모리 전체를 이것으로 센다.
// pays = 도우미 0.11.0의 v5 답의 환자·날 금액(stats-insights AC-6106.2, 금액 줄이 없는 답이면 null). 신환 1명당 매출만 쓰고 Worker 밖으로 나가지 않는다
export type BitMemory = {
  v: StatsRowsData['v']
  range: DateRange
  extra: StatsExtra | null
  first: ReadonlyMap<number, string>
  patientDays: readonly PatientDay[]
  consumption: readonly ConsumptionRow[]
  groups: readonly RxGroupDef[]
  pays: readonly ValuePay[] | null
}

const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

// 몇 번까지 받나는 고른 기간과 상관없어 메모리(BitMemory)마다 한 번만 센다. 다음 load가 메모리를 바꾸면 새로 센다
const dropoffs = new WeakMap<BitMemory, DropoffLine[]>()
function dropoffOf(bit: BitMemory): DropoffLine[] {
  let lines = dropoffs.get(bit)
  if (lines === undefined) {
    lines = dropoff({ rows: bit.consumption, first: bit.first, groups: bit.groups, range: bit.range })
    dropoffs.set(bit, lines)
  }
  return lines
}

// 신환 1명당 매출도 고른 기간과 상관없어 메모리마다 한 번만 센다(금액 줄이 있을 때만 부른다)
const values = new WeakMap<BitMemory, PatientValue>()
function valueOf(bit: BitMemory, pays: readonly ValuePay[]): PatientValue {
  let value = values.get(bit)
  if (value === undefined) {
    value = patientValue({ days: bit.patientDays, rows: bit.consumption, pays, first: bit.first, groups: bit.groups, range: bit.range })
    values.set(bit, value)
  }
  return value
}

// 날(YYYY-MM-DD) → 그날 신환인 접수 줄 수. v5 접수 줄의 firstVisit은 신환 날이다(toPatientDays)
function newLinesByDay(patientDays: readonly PatientDay[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { date, firstVisit } of patientDays) {
    if (firstVisit) counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  return counts
}

// groups = 화면이 준 묶음 열쇠·코드(없으면 []). 일 줄에는 열쇠마다 한 줄을 채우고(그날 없으면 0줄, treatment-trend AC-1205.4),
// 달 줄은 aggregate가 준 그대로 둔다
export function loadJob(
  text: string,
  opts: { from: string; to: string; today: string; closeToday: boolean; groups?: readonly RxGroupDef[] },
): { view: StatsLoaded; memory: StatsMemory; bit: BitMemory } {
  const { from, to, today, closeToday, groups = [] } = opts
  const data = parseStatsRows(text, { from, to })
  const ids = createPatientIds()
  const consumption = toConsumptionRows(data, ids)
  const patientDays = toPatientDays(data, ids)
  const aggregates = aggregate(consumption, groups, patientDays)

  const { noChart, duplicate, noFirst } = data.summary
  const checks: StatsChecks = { noChart, duplicate, noFirst }
  const quality = noChart === 0 && duplicate === 0 && noFirst === 0 ? 'valid' : 'incomplete'
  const result: AnalysisResult = {
    quality,
    skippedInvalidRows: 0,
    unknownVisitRows: 0,
    aggregates,
    // 오늘 줄까지 덮었다고 본다. 오늘 진료가 끝났으면 요약의 오늘을 내일로 넘겨 오늘을 끝난 날로 만든다
    summary: buildSummary({
      aggregates,
      covered: [{ from, to: earlier(to, today) }],
      quality,
      today: closeToday ? addDays(today, 1) : today,
    }),
  }

  // 끝나지 않은 오늘을 덮은 날로 저장하면 다음 날 그날이 휴진 0으로 읽힌다
  const lastDone = earlier(to, closeToday ? today : addDays(today, -1))
  const days = toDayPayloads(result)
  const view: StatsLoaded = {
    range: { from, to },
    covered: compareYmd(from, lastDone) <= 0 ? { from, to: lastDone } : null,
    quality,
    checks,
    // 도우미는 동네를 읽지 않는다. 모두 '주소 없음'이 된 칸을 저장하지 않는다
    months: toMonthPayload(result)?.map((month) => ({ ...month, regions: [] })) ?? null,
    days: days === null ? null : fillGroupCounts(days, groups.map((group) => group.id)),
    report: data.report,
  }
  // v5 답이면 날 합계의 신환은 도우미 날 숫자(VisitDaysSql) 대신 그날 신환 날인 접수 줄 수다(AC-6202.4). v2~v4는 도우미 숫자 그대로
  const newOn = data.v === 5 ? newLinesByDay(patientDays) : null
  const memory: StatsMemory = {
    range: { from, to },
    rows: toVisitRows(data, ids),
    summary: data.summary,
    days: data.days.map(([day, visits, patients, newPatients]) => {
      const date = dashed(day)
      return { date, visits, patients, newPatients: newOn === null ? newPatients : (newOn.get(date) ?? 0) }
    }),
    names: new Map(data.codes),
  }
  // 같은 ids로 바꾼다: 진료 줄·접수 줄·사람 표에서 같은 환자 = 같은 번호. view는 v2 답과 같다(AC-2708.1)
  const extra = toStatsExtra(data, ids)
  const bit: BitMemory = {
    v: data.v,
    range: { from, to },
    extra,
    first: extra === null ? new Map() : toFirstVisits(data, ids),
    patientDays,
    consumption,
    groups,
    pays: toPatientPays(data, ids),
  }
  // v3 답이면 달 줄마다 같은 달의 세 칸 합계를 싣는다(묶음 이름과 수만, spec stats-bit-ai AC-2901.1). 달 줄이 없으면(incomplete) null.
  // v2 답이면 열쇠를 두지 않는다(AC-2901.6) — 화면 값이 지금과 글자 그대로 같다
  if (extra !== null) {
    view.sections =
      view.months === null
        ? null
        : toMonthSections({
            months: view.months,
            from,
            to,
            today,
            visits: extra.visits,
            people: extra.people,
            first: bit.first,
            doctors: extra.doctors,
            doctorDays: extra.doctorDays,
          })
  }
  return { view, memory, bit }
}

// 머리 글의 기간 합계 = 고른 기간 날 숫자의 합(불러온 범위 전체든 일부든, 미완성 불러오기든, AC-509.4).
// 환자 수는 접수 건수라 내원과 같고, 재진은 rxVisitSplit이 환자 − 신환으로 낸다. 처방 줄만 서로 다른 환자 수다
function periodTotals(days: readonly RxSplitDayTotals[]): RxSplitTotals {
  let visits = 0
  let newPatients = 0
  for (const day of days) {
    visits += day.visits
    newPatients += day.newPatients
  }
  return { visits, patients: visits, newPatients }
}

const isPrescription = (line: RxSplitLine) => line.code !== ANY_CODE
const biggestFirst = (a: RxSplitLine, b: RxSplitLine) => b.total - a.total || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

// 기간이 맞는 날짜이고 불러온 범위 안에 다 들어가는지
function isInside(range: DateRange, { from, to }: DateRange): boolean {
  if (!isYmd(from) || !isYmd(to)) return false
  return compareYmd(from, to) <= 0 && compareYmd(from, range.from) >= 0 && compareYmd(to, range.to) <= 0
}

// 화면이 기간을 주면 메모리의 진료 줄로 처방별 결과를 낸다. 결과에는 처방마다 수와 이름만 있다(AC-509.4)
export function splitJob(memory: StatsMemory | null, { from, to }: { from: string; to: string }): RxSplitView {
  if (memory === null || !isInside(memory.range, { from, to })) return { kind: 'none' }

  const within = (day: string) => compareYmd(day, from) >= 0 && compareYmd(day, to) <= 0
  const rows = memory.rows.filter((row) => within(row.d))
  const days = memory.days.filter((day) => within(day.date))
  const range = { from, to }
  const whole = rxVisitSplit(rows, periodTotals(days), [...new Set(rows.map((row) => row.c))], range, memory.names)
  // 원본의 '고른 처방 중 하나라도' 줄은 뺀다: 코드 목록이 그 기간 처방 전부라 고른 것이 없고, 줄은 합계가 큰 차례여야 한다
  const lines = whole.lines.filter(isPrescription).sort(biggestFirst)
  const split = { ...whole, lines }
  return {
    kind: 'split',
    split,
    days: rxVisitSplitDays(rows, days, lines.map((line) => line.code), memory.names).map((day) => ({
      ...day,
      lines: day.lines.filter(isPrescription),
    })),
    text: formatRxVisitSplit('', split), // Worker에는 병원 이름이 가지 않는다(AC-505.7)
    headline: rxVisitHeadline(split),
  }
}

// 화면이 고른 기간과 견줄 기간을 주면 메모리의 접수 줄로 세 칸 보기를 낸다. 결과에는 묶음 이름과 수만 있다(AC-2702.3·AC-2702.4).
// 견줄 기간은 불러온 범위 안에 다 들어갈 때만 센다(일부만 걸치면 견주지 않는다, AC-2703.9). 시간대별·원장님별은 견주지 않는다(범위 밖).
// 묻기에 Block·물리치료 묶음(sunap)이 있으면 같은 기간의 sunapRates(숫자 아홉 칸)를 함께 싣는다(spec sunap-ilji AC-4906.3). 없으면 열쇠가 없다.
// 같은 때 같은 입력 + 접수 줄 진료의로 원장님별 표(sunapDoctors, 원장님 한 분 이하면 null)도 싣는다(spec sunap-doctors AC-5004.1).
// 불러올 때 묶음을 실었으면 몇 번까지 받나(dropoff)도 싣는다(stats-insights AC-6103.1): 고른 기간과 상관없이 불러온 범위 전체, 자료 끝 날 = 불러온 끝.
// 첫 내원일은 세 칸과 같은 first(toFirstVisits)라 v5 답이면 신환 날을 따른다(spec new-mark). 묶음이 없으면 열쇠가 없다.
// 답에 금액 줄(도우미 0.11.0의 v5 pays)이 있었으면 신환 1명당 매출(value)도 싣는다(stats-insights AC-6106.3): dropoff와 같은 범위·첫 내원일·묶음이고
// 묶음이 없어도 센다(받은 치료는 모두 진료만). 금액 줄이 없으면 열쇠가 없다
export function sectionsJob(
  bit: BitMemory | null,
  request: { from: string; to: string; previous?: DateRange | null; sunap?: StatsSunapGroups },
): BitSectionsView {
  const { from, to } = request
  if (bit === null || !isInside(bit.range, { from, to })) return { kind: 'none' }
  const { extra, first } = bit
  if (extra === null) return { kind: 'old-helper' }

  const previous = request.previous ?? null
  const input = {
    from,
    to,
    previous: previous !== null && isInside(bit.range, previous) ? { from: previous.from, to: previous.to } : null,
    visits: extra.visits,
    people: extra.people,
    first,
  }
  const view: Extract<BitSectionsView, { kind: 'ready' }> = {
    kind: 'ready',
    mix: { all: patientMix(input, 'all'), new: patientMix(input, 'new') },
    hours: visitHours(extra.visits, from, to),
    doctors: doctorStats({ from, to, visits: extra.visits, first, doctors: extra.doctors, doctorDays: extra.doctorDays }),
  }
  if (bit.groups.length > 0) view.dropoff = dropoffOf(bit)
  if (bit.pays !== null) view.value = valueOf(bit, bit.pays)
  const { sunap } = request
  if (sunap === undefined) return view
  const counted = { from, to, days: bit.patientDays, rows: bit.consumption, block: sunap.block, pt: sunap.pt }
  return {
    ...view,
    sunap: sunapRates(counted),
    sunapDoctors: withoutCodes(sunapDoctors({ ...counted, visits: extra.visits, doctors: extra.doctors })),
  }
}

// 화면에는 원장님 이름과 수만 보낸다: 진료의 코드는 비운다(stats-bit-sections AC-2702.4, 화면 표는 이름만 쓴다).
// 이름이 없는 진료의는 label이 이미 코드다(AC-2705.3과 같음)
function withoutCodes(table: DoctorBreakdown | null): DoctorBreakdown | null {
  if (table === null) return null
  return { rows: table.rows.map(({ label, rates }) => ({ code: null, label, rates })), total: table.total }
}

type PendingText = { promise: Promise<string>; resolve(text: string | Promise<string>): void; reject(reason: unknown): void }

function pendingText(): PendingText {
  let resolve!: PendingText['resolve']
  let reject!: PendingText['reject']
  const promise = new Promise<string>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => {}) // load가 오기 전에 실패해도 잡히지 않은 거절로 남지 않게
  return { promise, resolve, reject }
}

// 통로 포트의 조각과 화면의 load를 잇는다. 둘은 다른 길로 오므로 load가 end보다 먼저 올 수 있다
export function createStatsHost(send: (message: StatsWorkerMessage) => void): {
  fromBridge(message: unknown): void
  load(request: StatsLoadRequest): Promise<void>
  split(request: StatsSplitRequest): void
  sections(request: StatsSectionsRequest): void
  memory(): StatsMemory | null
} {
  const assembler = createAssembler()
  const texts = new Map<string, PendingText>()
  let memory: StatsMemory | null = null
  let bit: BitMemory | null = null
  let latest: string | null = null

  const textOf = (id: string) => {
    let text = texts.get(id)
    if (text === undefined) {
      text = pendingText()
      texts.set(id, text)
    }
    return text
  }

  return {
    fromBridge(message) {
      if (!isRecord(message) || typeof message.id !== 'string') return
      const { type, id, seq, data, count, bytes, sha256, code } = message
      if (type === 'chunk' && typeof seq === 'number' && typeof data === 'string') {
        assembler.chunk(id, seq, data)
      } else if (type === 'end' && typeof count === 'number' && typeof bytes === 'number' && typeof sha256 === 'string') {
        textOf(id).resolve(assembler.end(id, count, bytes, sha256))
      } else if (type === 'abort' && typeof code === 'string') {
        assembler.abort(id, code)
        textOf(id).reject(new StatsDataError(code))
      }
    },

    async load({ streamId, from, to, today, closeToday, groups, keep }) {
      latest = streamId
      let reply: StatsWorkerMessage
      try {
        const text = await textOf(streamId).promise
        if (latest !== streamId) return // 화면이 포기하고 새로 불렀다. 옛 자료로 메모리를 되돌리지 않는다
        const loaded = loadJob(text, { from, to, today, closeToday, groups: groups ?? [] })
        // keep: false = 나눠 읽기의 다른 조각. 답만 보내고 처방별·세 칸은 앞서 남긴 조각으로 답한다(AC-3304.1)
        if (keep !== false) {
          memory = loaded.memory
          bit = loaded.bit
        }
        reply = { type: 'loaded', streamId, view: loaded.view }
      } catch (e) {
        if (latest !== streamId) return
        // 예외 메시지·스택에는 자료 조각이 섞일 수 있어 번호만 보낸다
        reply = { type: 'failed', streamId, code: e instanceof StatsDataError ? e.code : 'E-ANALYZE-FAILED' }
      }
      texts.clear() // 다 쓴 글자와 버려진 답을 들고 있지 않는다
      send(reply)
    },

    split(request) {
      let reply: StatsWorkerMessage
      try {
        reply = { type: 'split-result', streamId: request.streamId, view: splitJob(memory, request) }
      } catch {
        // 예외 메시지·스택에는 자료 조각이 섞일 수 있어 번호만 보낸다
        reply = { type: 'failed', streamId: request.streamId, code: 'E-ANALYZE-FAILED' }
      }
      send(reply)
    },

    sections(request) {
      let reply: StatsWorkerMessage
      try {
        reply = { type: 'sections-result', streamId: request.streamId, view: sectionsJob(bit, request) }
      } catch {
        // 예외 메시지·스택에는 자료 조각이 섞일 수 있어 번호만 보낸다
        reply = { type: 'failed', streamId: request.streamId, code: 'E-ANALYZE-FAILED' }
      }
      send(reply)
    },

    memory: () => memory,
  }
}
