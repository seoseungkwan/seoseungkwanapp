import { aggregate } from '@/lib/analytics/aggregate'
import { buildSummary } from '@/lib/analytics/compare'
import { addDays, compareYmd } from '@/lib/analytics/dates'
import { createPatientIds } from '@/lib/parsers/bit'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import type { AnalysisResult } from '@/types/analyze'
import type { StatsChecks, StatsLoaded, StatsLoadRequest, StatsWorkerMessage } from '@/types/stats'
import { createAssembler, StatsDataError } from './assemble'
import { dashed, isRecord, parseStatsRows, toConsumptionRows, toPatientDays, toVisitRows, type StatsSummary, type VisitRow } from './helperData'

// 통계 Worker의 일 [환자 자료 구역]. 시험은 이 함수들을 바로 부른다(stats.worker.ts는 포트와 잇기만 한다).
// 화면에는 StatsLoaded(숫자·처방코드·처방 이름·날짜)만 가고, 진료 줄은 memory로 Worker 안에만 남는다. 접수 줄은 세는 데만 쓰고 남기지 않는다

// 처방별 신환·재진(split 일)이 쓰는 값. Worker 밖으로 나가지 않는다. 다음 load가 덮어쓴다
export type StatsMemory = {
  range: { from: string; to: string }
  rows: VisitRow[]
  summary: StatsSummary
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

    memory: () => memory,
  }
}
