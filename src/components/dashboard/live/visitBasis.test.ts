import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportSentence, todayView } from '@/components/dashboard/summary/view'
import { addDays, addMonths, monthOf } from '@/lib/analytics/dates'
import type { ChromeRuntimeLike, PortLike } from '@/types/bridge'
import type { DayPayload } from '@/types/payload'
import type { StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { LOOKBACK_DAYS, readBitDays, type ReadResult, type StatsWorkerLike } from './readBitDays'

// 내원환자는 접수 기준이다 (bit-dashboard REQ-602, design.md '내원환자는 접수 기준이다'·'위험 / 미해결 질문').
// 지어낸 것은 도우미 답(v2 JSON)과 확장(chrome.runtime), stats.worker.ts를 돌리는 Worker 껍데기뿐이다. 그 답이 진짜 readBitDays → 통로 →
// stats.worker.ts → loadJob(검사·aggregate·buildSummary·toDayPayloads)을 지나고, 나온 일 숫자를 대시보드의 todayView·reportSentence로 읽는다.
// 답을 지어내므로 비트 DB의 줄이 어떻게 답이 되는지는 여기서 돌려 보지 못한다. SQL은 글자만 본다(아래 'SQL 글' 시험들).
// 자료는 모두 지어낸 값이다

const TODAY = '2026-11-01'
const FROM = addDays(TODAY, -LOOKBACK_DAYS)
const T = '20261101'
const PAST = '2026-10-20'
const P = '20261020'
const LONG_AGO = '20250101' // 기간보다 앞의 첫 내원일: 재진
const CODE = 'MM042'

// 가짜 차트번호(9로 시작하는 6자리). 소스에 통째로 쓰지 않고 이어 만든다
const chart = (n: number) => '9' + String(n).padStart(5, '0')

type Reception = [chart: string, day: string, receptions: number, first: string | null]
type RxRow = [chart: string, day: string, code: string | null, first: string | null]

// 도우미 stats.rows 답 v2 (StatsPayload.cs와 같은 열쇠·차례). 기간 합계·날짜별 합계는 접수 줄에서 만들어 답 안의 숫자가 서로 맞게 한다.
// 내원 번호는 답에 없다: "내원 번호가 다른 접수 둘"은 건수 2·duplicate 0, "같은 번호 두 번"은 duplicate 1로 나타난다.
// 보고 숫자는 대시보드가 쓰지 않아 모양만 맞춘다
function v2Reply(input: { patientDays: readonly Reception[]; rows?: readonly RxRow[]; duplicate?: number }): Record<string, unknown> {
  const { patientDays, rows = [], duplicate = 0 } = input
  const compactFrom = FROM.replaceAll('-', '')
  const days = new Map<string, [string, number, number, number]>()
  for (const [, day, receptions, first] of patientDays) {
    const line = days.get(day) ?? [day, 0, 0, 0]
    line[1] += receptions
    line[2] += 1
    if (first === day) line[3] += 1
    days.set(day, line)
  }
  const report = (period: string) => ({ ok: false, period, reason: '가짜' })
  const month = monthOf(TODAY)
  return {
    v: 2,
    from: FROM,
    to: TODAY,
    summary: {
      visits: patientDays.reduce((total, line) => total + line[2], duplicate),
      patients: new Set(patientDays.map((line) => line[0])).size,
      newPatients: new Set(patientDays.filter((line) => line[3] !== null && line[3] >= compactFrom).map((line) => line[0])).size,
      noChart: 0,
      duplicate,
      noFirst: 0,
    },
    days: [...days.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    patientDays,
    codes: [[CODE, '표층열치료']],
    rows,
    report: {
      daily: [report(TODAY), report(addDays(TODAY, -1))],
      monthly: [report(month), report(addMonths(month, -1))],
    },
  }
}

// 확장이 보내는 답. 조각의 조각 수·바이트·SHA-256은 진짜 값이라 Worker의 검사를 그대로 지난다
const HELLO = { helperVersion: '0.3.0', protocol: 1, extensionVersion: '0.1.0', extensionProtocol: 1 }
const CHECK = {
  steps: [
    { name: 'find', ok: true },
    { name: 'db', ok: true },
    { name: 'registration', ok: true },
  ],
  registered: true,
}

function repliesTo(id: string, cmd: string, text: string): unknown[] {
  if (cmd === 'hello') return [{ v: 1, id, type: 'result', data: HELLO }]
  if (cmd === 'bit.check') return [{ v: 1, id, type: 'result', data: CHECK }]
  const parts = text.match(/[\s\S]{1,200}/g) ?? []
  return [
    ...parts.map((data, seq) => ({ v: 1, id, type: 'chunk', seq, data })),
    { v: 1, id, type: 'end', count: parts.length, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text, 'utf8').digest('hex') },
  ]
}

class FakeExtensionPort implements PortLike {
  private messageFns: ((m: unknown) => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: () => {} }

  constructor(private text: string) {}

  postMessage(m: unknown) {
    const { id, cmd } = m as { id: string; cmd: string }
    for (const reply of repliesTo(id, cmd, this.text)) for (const fn of this.messageFns) fn(reply)
  }
  disconnect() {}
}

const opened: MessagePort[] = []

// 시험 환경에는 Worker가 없다. 진짜 stats.worker.ts를 같은 스레드에서 돌리고, 화면으로 가는 값은 Worker처럼 복사해 보낸다
type WorkerScope = {
  onmessage: ((event: { data: StatsWorkerRequest; ports: readonly MessagePort[] }) => void) | null
  postMessage(message: StatsWorkerMessage): void
}

async function startStatsWorker(): Promise<StatsWorkerLike> {
  const scope: WorkerScope = {
    onmessage: null,
    postMessage: (message) => worker.onmessage?.({ data: structuredClone(message) } as MessageEvent<StatsWorkerMessage>),
  }
  const worker = {
    onmessage: null as ((event: MessageEvent<StatsWorkerMessage>) => void) | null,
    onerror: null,
    onmessageerror: null,
    terminate() {},
    postMessage(message: StatsWorkerRequest, transfer: Transferable[] = []) {
      const ports = transfer as MessagePort[]
      opened.push(...ports)
      scope.onmessage?.({ data: message, ports })
    },
  }
  vi.stubGlobal('self', scope)
  vi.resetModules() // stats.worker.ts는 불러올 때 self를 읽는다
  await import('@/workers/stats.worker')
  return worker as unknown as StatsWorkerLike
}

async function readReply(reply: Record<string, unknown>): Promise<ReadResult> {
  const port = new FakeExtensionPort(JSON.stringify(reply))
  const runtime: ChromeRuntimeLike = { connect: () => port }
  const worker = await startStatsWorker()
  return readBitDays({ runtime, createWorker: () => worker, today: TODAY })
}

async function daysFrom(reply: Record<string, unknown>): Promise<readonly DayPayload[]> {
  const result = await readReply(reply)
  if (result.kind !== 'days') throw new Error(`숫자가 나오지 않았다: ${JSON.stringify(result)}`)
  return result.days
}

const rxOf = (days: readonly DayPayload[], day: string) => days.find((d) => d.day === day)?.rx

// StatsSql.cs를 글자로 읽는다(.NET을 돌리지 않는다). 공백은 하나로 줄여 본다. 찾는 글이 없으면 던져, 없는 글이 빈 글자로 통과하지 않게 한다
const squash = (text: string) => text.replace(/\s+/g, ' ')
const statsSql = () => readFileSync(join(process.cwd(), 'helper/src/Precheck.Core/Stats/StatsSql.cs'), 'utf8')

function slice(text: string, start: string, end: string): string {
  const from = text.indexOf(start)
  const to = text.indexOf(end, from + start.length)
  if (from < 0 || to < 0) throw new Error(`찾지 못함: ${start} … ${end}`)
  return text.slice(from, to)
}

const visitsSql = () => squash(slice(statsSql(), 'private const string Visits = @"', '";'))
const periodVisits = () => slice(visitsSql(), 'WITH PeriodVisits AS (', '), Patients AS (')
const firstVisits = () => slice(visitsSql(), 'FirstVisits AS (', 'GROUP BY p.PatientId')
const patientDaysSql = () => squash(slice(statsSql(), 'public const string PatientDaysSql = Visits + @"', '";'))

afterEach(() => {
  vi.unstubAllGlobals()
  for (const port of opened.splice(0)) port.close()
})

describe('AC-602.1 처방 줄이 없는 접수', () => {
  it('AC-602.1: 처방 줄 없는 재진 환자가 그날 환자 수·재진에 들고, 처방 목록에는 처방 있는 환자의 코드만 있다', async () => {
    const days = await daysFrom(
      v2Reply({
        patientDays: [
          [chart(1), T, 1, LONG_AGO],
          [chart(2), T, 1, LONG_AGO],
        ],
        rows: [[chart(1), T, CODE, LONG_AGO]],
      }),
    )
    expect(todayView(TODAY, days).counts).toEqual({ patients: 2, newPatients: 0, returning: 2 })
    expect(rxOf(days, TODAY)?.map((rx) => [rx.code, rx.name, rx.patients])).toEqual([[CODE, '표층열치료', 1]])
  })

  it('AC-602.1: 처방 줄 없는 환자가 그날 첫 내원이면 신환에 든다', async () => {
    const days = await daysFrom(
      v2Reply({
        patientDays: [
          [chart(1), T, 1, LONG_AGO],
          [chart(2), T, 1, T],
        ],
        rows: [[chart(1), T, CODE, LONG_AGO]],
      }),
    )
    expect(todayView(TODAY, days).counts).toEqual({ patients: 2, newPatients: 1, returning: 1 })
  })

  it('AC-602.1: 접수가 모두 처방 없는 날도 그날 숫자가 생기고 처방 목록은 빈 목록이다', async () => {
    const days = await daysFrom(v2Reply({ patientDays: [[chart(2), P, 1, P]] }))
    expect(todayView(PAST, days).counts).toEqual({ patients: 1, newPatients: 1, returning: 0 })
    expect(rxOf(days, PAST)).toEqual([])
  })

  it.each<[string, string | null]>([
    ['빈 글자', ''],
    ['null', null],
  ])('AC-602.1: 처방 코드가 %s인 줄이 답에 있으면 처방 목록을 만들지 않고 E-BRIDGE-BAD-REPLY로 끝난다', async (_name, code) => {
    const reply = v2Reply({ patientDays: [[chart(1), T, 1, LONG_AGO]], rows: [[chart(1), T, code, LONG_AGO]] })
    await expect(readReply(reply)).resolves.toEqual({ kind: 'failed', code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-602.1: 접수 줄이 없는 v1 답으로는 처방 줄로 세지 않고 E-BRIDGE-BAD-REPLY로 끝난다', async () => {
    const reply = v2Reply({ patientDays: [[chart(1), T, 1, LONG_AGO]], rows: [[chart(1), T, CODE, LONG_AGO]] })
    delete reply.patientDays
    await expect(readReply({ ...reply, v: 1 })).resolves.toEqual({ kind: 'failed', code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-601.4: 반대쪽(처방 줄의 환자·날이 접수 줄에 없음)은 어긋남이라 E-STATS-CHANGED로 끝난다', async () => {
    const reply = v2Reply({ patientDays: [[chart(1), T, 1, LONG_AGO]], rows: [[chart(1), P, CODE, LONG_AGO]] })
    await expect(readReply(reply)).resolves.toEqual({ kind: 'failed', code: 'E-STATS-CHANGED' })
  })

  it('AC-602.1 SQL 글: 접수 줄 SQL은 처방 표 OdrInf를 잇지 않는다', () => {
    expect(visitsSql()).not.toContain('OdrInf')
    expect(patientDaysSql()).not.toContain('OdrInf')
  })
})

describe('AC-602.2 같은 날 두 번 접수', () => {
  it('AC-602.2: 첫 내원인 날 내원 번호가 다른 접수 둘은 환자 수 2건, 신환 1건, 재진 1건이고 보고 문장도 같다', async () => {
    const days = await daysFrom(v2Reply({ patientDays: [[chart(3), T, 2, T]], rows: [[chart(3), T, CODE, T]] }))
    const view = todayView(TODAY, days)
    expect(view.counts).toEqual({ patients: 2, newPatients: 1, returning: 1 })
    expect(reportSentence(view)?.full).toBe('오늘 지금까지 환자 2명이 왔습니다. 신환 1명, 재진 1명입니다.')
    expect(rxOf(days, TODAY)?.map((rx) => [rx.code, rx.patients])).toEqual([[CODE, 1]]) // 처방 목록은 그대로 사람 수다
  })

  it('AC-602.2: 첫 내원이 아닌 환자의 두 번 접수는 환자 수 2건, 재진 2건이다', async () => {
    const days = await daysFrom(v2Reply({ patientDays: [[chart(4), T, 2, LONG_AGO]], rows: [[chart(4), T, CODE, LONG_AGO]] }))
    expect(todayView(TODAY, days).counts).toEqual({ patients: 2, newPatients: 0, returning: 2 })
  })

  it('AC-602.2: 첫 내원인 날 두 번 온 환자가 다른 날 다시 오면 그날은 재진이고 신환은 사람당 1건이다', async () => {
    const days = await daysFrom(
      v2Reply({
        patientDays: [
          [chart(3), P, 2, P],
          [chart(3), T, 1, P],
        ],
      }),
    )
    expect(todayView(PAST, days).counts).toEqual({ patients: 2, newPatients: 1, returning: 1 })
    expect(todayView(TODAY, days).counts).toEqual({ patients: 1, newPatients: 0, returning: 1 })
  })

  it('AC-602.2: 같은 내원 번호가 두 번인 답(duplicate)은 2건으로 세지 않고 E-BIT-DATA-UNSURE로 끝난다', async () => {
    const reply = v2Reply({ patientDays: [[chart(3), T, 2, T]], rows: [[chart(3), T, CODE, T]], duplicate: 1 })
    await expect(readReply(reply)).resolves.toEqual({ kind: 'failed', code: 'E-BIT-DATA-UNSURE' })
  })

  // AC-4401.2 다섯째 칸(first90 design.md 2-1): 세는 줄은 그대로 PeriodVisits이고, 접수 번호로 이은 OcmInf에서 '3' 접수만 더 센다
  it('AC-602.2·AC-4401.2 SQL 글: 접수 줄 SQL은 환자·날마다 PeriodVisits 줄 수를 COUNT_BIG(*)로 세고, 다섯째 칸은 접수 번호로 이은 OcmInf의 90일초진(OcmDgsNfs = 3) 수다', () => {
    const sql = patientDaysSql()
    expect(sql).toContain(
      "SELECT v.PatientId,v.VisitDay,COUNT_BIG(*) Visits,LEFT(f.FirstDtm,8) FirstDay, SUM(CASE WHEN o.OcmDgsNfs='3' THEN 1 ELSE 0 END) First90 " +
        'FROM PeriodVisits v LEFT HASH JOIN FirstVisits f ON f.PatientId=v.PatientId JOIN dbo.OcmInf o ON o.OcmNum=v.VisitId ' +
        'WHERE v.PatientId IS NOT NULL GROUP BY v.PatientId,v.VisitDay,f.FirstDtm ORDER BY v.PatientId,v.VisitDay',
    )
    expect(sql.match(/\bHASH\b/g)).toHaveLength(1)
    expect(visitsSql()).not.toContain('OcmDgsNfs')
  })
})

// 진짜 취소 동작은 여기서 시험하지 못한다: 비트 DB가 없고, 취소가 실제로 어떤 상태 값으로 남는지는 의원 PC에서 비트 화면과 견주어 본다(design.md).
// 앞의 시험들은 조건 글이 남아 있는지만 보고, 뒤의 시험들은 그 조건이 만들 답을 지어 넣었을 때 Worker가 무엇을 하는지만 본다
describe('AC-602.3 접수취소', () => {
  it('AC-602.3 SQL 글: PeriodVisits에 외래·상태·제외 조건 글이 그대로 있고 상태 목록은 WN·HN·TN·PN 넷뿐이다', () => {
    expect(periodVisits()).toContain("c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN') AND c.OcmRsuYon<>'O'")
  })

  it('AC-602.3 SQL 글: 숫자를 만드는 접수 줄 SQL은 Visits 글 뒤에 이어져 이 PeriodVisits에서 센다', () => {
    // AC-3401.1 첫 내원은 해시 잇기로 한 번만 만든다(helper-stats-speed). 세는 줄은 그대로 PeriodVisits다
    expect(patientDaysSql()).toContain('FROM PeriodVisits v LEFT HASH JOIN FirstVisits f ON f.PatientId=v.PatientId')
  })

  it('AC-602.3 SQL 글: FirstVisits도 같은 외래 상태 조건으로 가장 이른 접수를 고르고, 기간 앞까지 본다', () => {
    const sql = firstVisits()
    expect(sql).toContain('MIN(c.OcmAcpDtm) FirstDtm')
    expect(sql).toContain("WHERE c.OcmAcpDtm<@to AND c.OcmRsuYon<>'O'")
    expect(sql).toContain("((c.OcmPatTyp='O' AND c.OcmComStt IN ('WN','HN','TN','PN')) OR (c.OcmPatTyp='I' AND c.OcmComStt NOT IN ('VC','CN','CR')))")
    expect(sql).not.toContain('@from')
  })

  it('AC-602.3: 접수 줄이 없는 날은 숫자가 없고, 날짜별 합계(days)가 그날을 세고 있어도 따르지 않는다', async () => {
    const reply = v2Reply({ patientDays: [[chart(5), T, 1, LONG_AGO]] })
    const days = await daysFrom({ ...reply, days: [[P, 1, 1, 0], ...(reply.days as unknown[])] })
    expect(todayView(PAST, days)).toMatchObject({ state: 'none', counts: null })
    expect(todayView(TODAY, days).counts).toEqual({ patients: 1, newPatients: 0, returning: 1 })
  })

  it.each<[string, string, { patients: number; newPatients: number; returning: number }]>([
    ['그날이면 신환', T, { patients: 1, newPatients: 1, returning: 0 }],
    ['앞날이면 재진', P, { patients: 1, newPatients: 0, returning: 1 }],
  ])('AC-602.3: Worker는 첫 내원일을 줄에서 짐작하지 않고 답의 값만 쓴다: 답의 첫 내원일이 %s', async (_name, first, counts) => {
    const days = await daysFrom(v2Reply({ patientDays: [[chart(6), T, 1, first]] }))
    expect(todayView(TODAY, days).counts).toEqual(counts)
    expect(todayView(PAST, days).counts).toBeNull()
  })
})
