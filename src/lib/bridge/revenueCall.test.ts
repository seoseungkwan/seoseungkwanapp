// 명령 표의 revenue.days와 화면 통로로 부르기(TASK-2, REQ-002 · AC-002.1·AC-002.4). Worker 없이 숫자 명령으로 온다. 자료는 모두 가짜다
import { describe, expect, it } from 'vitest'
import type { ChromeRuntimeLike, PatientCommand, PortLike } from '@/types/bridge'
import type { RevenueDayRow, RevenueDaysResult } from '@/types/revenue'
import commands from './commands.json'
import { isPatient, isSmallCommand, PATIENT_COMMANDS, PROTOCOL, SEND_COMMANDS, SMALL_COMMANDS } from './protocol'
import { LATEST_HELPER, MIN_EXTENSION } from './versions'
import { connectScreenBridge } from './workerSink'

// 확장 쪽 가짜 Port(client.test.ts와 같은 모양)
class FakePort implements PortLike {
  sent: Record<string, unknown>[] = []
  disconnected = false
  private messageFns: ((m: unknown) => void)[] = []
  private disconnectFns: (() => void)[] = []
  onMessage = { addListener: (fn: (m: unknown) => void) => void this.messageFns.push(fn) }
  onDisconnect = { addListener: (fn: () => void) => void this.disconnectFns.push(fn) }

  postMessage(m: unknown) {
    if (this.disconnected) throw new Error('Attempting to use a disconnected port object')
    this.sent.push(m as Record<string, unknown>)
  }
  disconnect() {
    this.disconnected = true
  }
  reply(m: unknown) {
    for (const fn of this.messageFns) fn(m)
  }
}

const HELLO_DATA = { helperVersion: LATEST_HELPER, protocol: PROTOCOL, extensionVersion: MIN_EXTENSION, extensionProtocol: PROTOCOL }
const FAKE_CHART = '900001'
const FAKE_NAME = '가상환자01'
const PERIOD = { from: '2026-10-01', to: '2026-10-02' }

const money = {
  total: 1_234_560,
  insurer: 800_100,
  noncovered: 210_000,
  copay: 200_000,
  otherTotal: 24_460,
  cash: 52_000,
  card: 301_500,
  transfer: 20_000,
  receivableIn: 3_000,
}
const noMoney = {
  total: null,
  insurer: null,
  noncovered: null,
  copay: null,
  otherTotal: null,
  cash: null,
  card: null,
  transfer: null,
  receivableIn: null,
}

const ANSWER: RevenueDaysResult = {
  days: [
    { date: '2026-10-01', visits: 42, newPatients: 5, returnVisits: 37, patientsToDate: 40, ...money, unconfirmed: false },
    { date: '2026-10-02', visits: 38, newPatients: 2, returnVisits: 36, patientsToDate: 61, ...noMoney, unconfirmed: true },
  ],
  codes: [
    { code: 'MM001', name: '도수치료(가짜)', count: 12, amount: 960_000 },
    { code: '_REST', name: null, count: 3, amount: null },
  ],
}

/** copay·otherTotal이 없던 옛 모양의 날 줄 */
function oldShape(row: RevenueDayRow): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...row }
  delete copy.copay
  delete copy.otherTotal
  return copy
}

function setup() {
  const ports: FakePort[] = []
  const runtime: ChromeRuntimeLike = {
    connect() {
      const p = new FakePort()
      ports.push(p)
      return p
    },
  }
  let n = 0
  // 매출 탭은 Worker 없이 부른다
  const screen = connectScreenBridge({ runtime, newId: () => `req-${++n}` })
  const seenByScreen: unknown[] = []
  screen.onState((s) => seenByScreen.push(s))
  screen.onProgress((p) => seenByScreen.push(p))
  const track = <T>(p: Promise<T>) =>
    p.then(
      (v) => {
        seenByScreen.push(v)
        return v
      },
      (e: unknown) => {
        seenByScreen.push(e, (e as { code?: unknown }).code, (e as { message?: unknown }).message)
        throw e
      },
    )
  return { screen, port: ports[0], seenByScreen, track }
}

async function ready() {
  const t = setup()
  const hello = t.screen.hello()
  t.port.reply({ v: 1, id: 'req-1', type: 'result', data: HELLO_DATA })
  await expect(hello).resolves.toMatchObject({ state: 'ready' })
  return t
}

describe('AC-002.1 명령 표의 revenue.days', () => {
  it('AC-002.1 commands.json에 revenue.days가 patient:false, maxDays:31, args {from: date, to: date}로 있다', () => {
    const table = commands.commands as Record<string, unknown>
    expect(table['revenue.days']).toEqual({
      patient: false,
      maxDays: 31,
      args: { from: { type: 'date' }, to: { type: 'date' } },
    })
  })

  it('AC-002.1 protocol은 1 그대로다', () => {
    expect(commands.protocol).toBe(1)
    expect(PROTOCOL).toBe(1)
  })

  it('AC-002.1 웹은 revenue.days를 숫자 명령으로 안다(SMALL_COMMANDS, 환자 자료·보내기 명령 아님)', () => {
    expect(SMALL_COMMANDS).toContain('revenue.days')
    expect(isSmallCommand('revenue.days')).toBe(true)
    expect(isPatient('revenue.days')).toBe(false)
    expect(PATIENT_COMMANDS).not.toContain('revenue.days')
    expect(SEND_COMMANDS).not.toContain('revenue.days')
  })
})

describe('AC-002.4 화면 통로 connectScreenBridge({runtime})로 revenue.days 부르기', () => {
  it('AC-002.4 call은 확장에 봉투 하나를 보내고, 검사한 답을 그대로 돌려준다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    expect(t.port.sent).toHaveLength(2)
    expect(t.port.sent[1]).toEqual({ v: 1, id: 'req-2', cmd: 'revenue.days', args: { from: '2026-10-01', to: '2026-10-02' } })
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: ANSWER })
    await expect(p).resolves.toEqual(ANSWER)
    // 답을 받은 뒤 더 보내지 않는다
    expect(t.port.sent).toHaveLength(2)
  })

  it('AC-002.4 정해 둔 칸 밖의 칸(chart·name)이 섞인 답은 E-BRIDGE-BAD-REPLY로 거부하고 그 글자는 화면에 닿지 않는다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const leaked = {
      ...ANSWER,
      days: [{ ...ANSWER.days[0], chart: FAKE_CHART, name: FAKE_NAME }, ANSWER.days[1]],
    }
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: leaked })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
    const seen = JSON.stringify(t.seenByScreen)
    expect(seen).not.toContain(FAKE_CHART)
    expect(seen).not.toContain(FAKE_NAME)
  })

  it('AC-002.4 금액이 글자인 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const bad = { ...ANSWER, days: [{ ...ANSWER.days[0], total: '1234560' }, ANSWER.days[1]] }
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: bad })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 copay·otherTotal이 빠진 옛 모양 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days: ANSWER.days.map(oldShape) } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 조각(chunk)을 받지 않는다: 조각이 오면 E-BRIDGE-BAD-REPLY', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'chunk', seq: 0, data: JSON.stringify(ANSWER) })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 revenue.days는 조각 명령(stream)으로 부를 수 없다(E-BRIDGE-REJECTED, 봉투를 보내지 않음)', async () => {
    const t = await ready()
    const p = t.track(t.screen.stream('revenue.days' as unknown as PatientCommand, PERIOD))
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-REJECTED' })
    expect(t.port.sent).toHaveLength(1)
  })

  it('AC-002.4 도우미가 오류 번호로 답하면 그 번호로 거부한다(옛 도우미: E-HELPER-UNKNOWN-COMMAND)', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' })
    await expect(p).rejects.toMatchObject({ code: 'E-HELPER-UNKNOWN-COMMAND' })
  })
})
