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
const PERIOD = { from: '2026-10-01', to: '2026-10-03' }

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

/** 나눔 네 칸만 빈 날의 금액(남는 다섯 칸은 숫자) */
const noSplit = { ...money, insurer: null, noncovered: null, copay: null, otherTotal: null }

const ANSWER: RevenueDaysResult = {
  days: [
    { date: '2026-10-01', visits: 42, newPatients: 5, returnVisits: 37, ...money, unconfirmed: false, splitUnconfirmed: false },
    { date: '2026-10-02', visits: 38, newPatients: 2, returnVisits: 36, ...noMoney, unconfirmed: true, splitUnconfirmed: false },
    { date: '2026-10-03', visits: 30, newPatients: 1, returnVisits: 29, ...noSplit, unconfirmed: false, splitUnconfirmed: true },
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
    expect(t.port.sent[1]).toEqual({ v: 1, id: 'req-2', cmd: 'revenue.days', args: { from: '2026-10-01', to: '2026-10-03' } })
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
      days: [{ ...ANSWER.days[0], chart: FAKE_CHART, name: FAKE_NAME }, ...ANSWER.days.slice(1)],
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
    const bad = { ...ANSWER, days: [{ ...ANSWER.days[0], total: '1234560' }, ...ANSWER.days.slice(1)] }
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: bad })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 copay·otherTotal이 빠진 옛 모양 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days: ANSWER.days.map(oldShape) } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 splitUnconfirmed가 빠진 옛 모양 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const days = ANSWER.days.slice(0, 2).map((row) => {
      const copy: Record<string, unknown> = { ...row }
      delete copy.splitUnconfirmed
      return copy
    })
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.2·AC-002.3 없어진 칸 patientsToDate가 남아 있는 옛 모양 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const days = ANSWER.days.map((row) => ({ ...row, patientsToDate: 40 }))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 두 표시가 둘 다 참인 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const both = { ...ANSWER.days[2], unconfirmed: true }
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days: [both] } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-002.4 표시 없이 나눔 칸이 빈 답도 E-BRIDGE-BAD-REPLY다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const unmarked = { ...ANSWER.days[2], splitUnconfirmed: false }
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, days: [unmarked] } })
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

// 도우미 0.6.0의 셋째 열쇠 dayCodes(stats-revenue TASK-3, REQ-4102). 날 줄은 ANSWER의 10월 1일~3일
const NEW_ANSWER: RevenueDaysResult = {
  ...ANSWER,
  dayCodes: [
    ['2026-10-01', 'MM101', 3, 45_000],
    ['2026-10-01', '_REST', 1, null],
    ['2026-10-03', 'MX122', 2, 0],
  ],
}

/** 그날 서로 다른 코드 n줄 */
const codesOn = (date: string, n: number) => Array.from({ length: n }, (_, i) => [date, `C${i}`, 1, i])

const BAD_DAY_CODES: [string, unknown][] = [
  ['① 목록이 아님', { 0: ['2026-10-01', 'MM101', 3, 45_000] }],
  ['② 칸 셋', [['2026-10-01', 'MM101', 3]]],
  ['② 칸 다섯', [['2026-10-01', 'MM101', 3, 45_000, 0]]],
  ['③ days에 없는 날', [['2026-10-04', 'MM101', 3, 45_000]]],
  ['④ 코드 모양', [['2026-10-01', 'MM 101', 3, 45_000]]],
  ['⑤ 같은 날 같은 코드', [['2026-10-01', 'MM101', 3, 45_000], ['2026-10-01', 'MM101', 1, 100]]],
  ['⑥ 하루 301줄', codesOn('2026-10-02', 301)],
  ['⑦ 9,301줄', [...codesOn('2026-10-01', 3101), ...codesOn('2026-10-02', 3100), ...codesOn('2026-10-03', 3100)]],
  ['⑧ 건수 음수', [['2026-10-01', 'MM101', -1, 45_000]]],
  ['⑧ 건수 소수', [['2026-10-01', 'MM101', 1.5, 45_000]]],
  ['⑨ 금액 글자', [['2026-10-01', 'MM101', 3, '45000']]],
]

describe('AC-4102.1·AC-4102.2 화면 통로로 dayCodes가 든 답 부르기', () => {
  it('AC-4102.1 dayCodes가 든 새 답을 검사해 그대로 돌려준다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: NEW_ANSWER })
    await expect(p).resolves.toEqual(NEW_ANSWER)
  })

  it('AC-4102.1 옛 답(dayCodes 없음)도 지금처럼 받는다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: ANSWER })
    await expect(p).resolves.toEqual(ANSWER)
  })

  it('AC-4102.1 넷째 열쇠가 있으면 E-BRIDGE-BAD-REPLY이고 그 글자는 화면에 닿지 않는다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...NEW_ANSWER, patients: [FAKE_CHART, FAKE_NAME] } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
    const seen = JSON.stringify(t.seenByScreen)
    expect(seen).not.toContain(FAKE_CHART)
    expect(seen).not.toContain(FAKE_NAME)
  })

  it.each(BAD_DAY_CODES)('AC-4102.2 dayCodes가 틀리면(%s) E-BRIDGE-BAD-REPLY다', async (_label, dayCodes) => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, dayCodes } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-4102.2 dayCodes 줄에 섞인 다섯째 칸(차트번호·이름)은 거부되고 화면에 닿지 않는다', async () => {
    const t = await ready()
    const p = t.track(t.screen.call('revenue.days', PERIOD))
    const dayCodes = [['2026-10-01', 'MM101', 3, 45_000, FAKE_CHART], ['2026-10-01', 'MX122', 1, 100, FAKE_NAME]]
    t.port.reply({ v: 1, id: 'req-2', type: 'result', data: { ...ANSWER, dayCodes } })
    await expect(p).rejects.toMatchObject({ code: 'E-BRIDGE-BAD-REPLY' })
    const seen = JSON.stringify(t.seenByScreen)
    expect(seen).not.toContain(FAKE_CHART)
    expect(seen).not.toContain(FAKE_NAME)
  })
})
