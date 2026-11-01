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
import { createPatientIds } from '@/lib/parsers/bit'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import type { AnalysisResult } from '@/types/analyze'
import type { RxSplitLine, RxSplitView, StatsChecks, StatsLoaded, StatsLoadRequest, StatsSplitRequest, StatsWorkerMessage } from '@/types/stats'
import { createAssembler, StatsDataError } from './assemble'
import { dashed, isRecord, parseStatsRows, toConsumptionRows, toPatientDays, toVisitRows, type StatsSummary, type VisitRow } from './helperData'

// 통계 Worker의 일 [환자 자료 구역]. 시험은 이 함수들을 바로 부른다(stats.worker.ts는 포트와 잇기만 한다).
// 화면에는 StatsLoaded(숫자·처방코드·처방 이름·날짜)만 가고, 진료 줄은 memory로 Worker 안에만 남는다. 접수 줄은 세는 데만 쓰고 남기지 않는다

// 처방별 신환·재진(split 일)이 쓰는 값. Worker 밖으로 나가지 않는다. 다음 load가 덮어쓴다
export type StatsMemory = {
  range: { from: string; to: string }
  rows: VisitRow[]
  summary: StatsSummary // 불러온 범위 전체의 도우미 합계. 머리 글은 이것이 아니라 days의 합이다
  days: { date: string; visits: number; patients: number; newPatients: number }[]
  names: ReadonlyMap<string, string>
}

const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

export function loadJob(
  text: string,
  opts: { from: string; to: string; today: string; closeToday: boolean },
): { view: StatsLoaded; memory: StatsMemory } {
  const { from, to, today, closeToday } = opts
  const data = parseStatsRows(text, { from, to })
  const ids = createPatientIds()
  const aggregates = aggregate(toConsumptionRows(data, ids), [], toPatientDays(data, ids))

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
  const view: StatsLoaded = {
    range: { from, to },
    covered: compareYmd(from, lastDone) <= 0 ? { from, to: lastDone } : null,
    quality,
    checks,
    // 도우미는 동네를 읽지 않는다. 모두 '주소 없음'이 된 칸을 저장하지 않는다
    months: toMonthPayload(result)?.map((month) => ({ ...month, regions: [] })) ?? null,
    days: toDayPayloads(result),
    report: data.report,
  }
  const memory: StatsMemory = {
    range: { from, to },
    rows: toVisitRows(data, ids),
    summary: data.summary,
    days: data.days.map(([day, visits, patients, newPatients]) => ({
      date: dashed(day),
      visits,
      patients,
      newPatients,
    })),
    names: new Map(data.codes),
  }
  return { view, memory }
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

// 화면이 기간을 주면 메모리의 진료 줄로 처방별 결과를 낸다. 결과에는 처방마다 수와 이름만 있다(AC-509.4)
export function splitJob(memory: StatsMemory | null, { from, to }: { from: string; to: string }): RxSplitView {
  if (memory === null || !isYmd(from) || !isYmd(to)) return { kind: 'none' }
  if (compareYmd(from, to) > 0 || compareYmd(from, memory.range.from) < 0 || compareYmd(to, memory.range.to) > 0) return { kind: 'none' }

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
  memory(): StatsMemory | null
} {
  const assembler = createAssembler()
  const texts = new Map<string, PendingText>()
  let memory: StatsMemory | null = null
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

    async load({ streamId, from, to, today, closeToday }) {
      latest = streamId
      let reply: StatsWorkerMessage
      try {
        const text = await textOf(streamId).promise
        if (latest !== streamId) return // 화면이 포기하고 새로 불렀다. 옛 자료로 메모리를 되돌리지 않는다
        const loaded = loadJob(text, { from, to, today, closeToday })
        memory = loaded.memory
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

    memory: () => memory,
  }
}
