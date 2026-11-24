// @vitest-environment jsdom
// TASK-14 (spec erp-uisarang) design.md 8-7·9-4: 자료원 정하기(decideSource)와 ERP 화면 의사랑 흐름(createUisFlow)·받기(downloadBytes).
// 가짜 chrome.storage.local · 가짜 send(도우미 답) · 가짜 Dock(부른 차례를 적음)과 시험용 ERP 화면(__tests__/erpPage.ts)으로 본다.
// 의사랑 답 숫자는 시안 예시 관계(notes.md)로 지은 값이다(환자 정보 없음). '오늘'은 가짜 시계 2026-11-10(한국 시간)이다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, mountErpPage, sampleDay, type ErpPage, type ErpPageOptions } from './__tests__/erpPage'
import type { Dock } from './panel'
import { SETTINGS_KEY } from './types'
import { readUisDay, stopOf, uisCells } from './uisCells'
import { createUisFlow, decideSource, downloadBytes, SOURCE_TIMEOUT_MS, type Send } from './uisFlow'
import { toUisArgs } from './uisSettings'
import { UIS_SHEET_NAME, UIS_SHEET_WIDTHS, uisFileName, uisSheetRows } from './uisSheet'
import { UIS_KINDS, UIS_SETTINGS_KEY } from './uisTypes'
import type { UisDay, UisKind, UisReport, UisSettings } from './uisTypes'
import type { UisAction, UisView } from './uisView'
import { workbookBytes, XLSX_TYPE } from './xlsxWrite'

const DAY = '2026-11-09'
const NOW = new Date('2026-11-10T10:00:00+09:00')
const TODAY = '2026-11-10'

// --- 의사랑 답(design.md 3-2)과 설정 ---

const N = { unpaidVisits: null, new: null, first90: null, return: null }
const BANDS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'] as const

function report(kind: UisKind, over: Partial<UisReport> = {}): UisReport {
  return { kind, state: 'ok', cached: false, from: DAY, to: DAY, value: null, columns: [], ...over }
}

/** 시안 예시 숫자 답. states로 보고서 상태를, over로 그 밖 칸을 바꾼다 */
function uisDay(states: Partial<Record<UisKind, Partial<UisReport>>> = {}, over: Partial<UisDay> = {}): UisDay {
  return {
    date: DAY,
    patients: { new: 7, first90: null, return: 57, ptVisit: 31, noExamFee: 2, total: 97 },
    groups: [
      { key: 'carm', patients: 18, total: 482_000, ...N },
      { key: 'sono', patients: 21, total: 731_500, ...N },
      { key: 'manual', patients: 6, total: 498_000, ...N },
      { key: 'eswt', patients: 4, total: 360_000, ...N },
      { key: 'ptVisit', patients: 31, total: null, ...N },
      { key: 'pt', patients: null, total: 862_400, ...N },
      { key: 'etc1', patients: null, total: 154_000, ...N },
    ],
    ages: BANDS.map((band, i) => ({ band, new: i % 2, first90: null, return: i + 3 })),
    money: {
      total: 5_182_300,
      insurer: 3_441_200,
      receivableIn: null,
      unpaidNew: null,
      noncovered: 1_206_000,
      discount: null,
      disabledFund: null,
      received: 1_741_100,
      card: 1_388_600,
      cash: 352_500,
      transfer: null,
      refund: null,
    },
    inpatientVisits: null,
    reservations: { kinds: [], patients: 33 },
    injection: null,
    overlap: null,
    warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false },
    source: 'uisarang',
    uis: {
      folder: 'desktop',
      reports: UIS_KINDS.map((kind) => report(kind, states[kind])),
      open: [],
      deleted: 6,
      kept: 0,
      deleteFailed: 0,
      unknownFiles: 0,
      checks: {
        totalFee: null,
        received: null,
        headcount: null,
        rxTotal: null,
        visitRows: null,
        visitNew: null,
        rsvRows: null,
        rsvVisited: null,
        noDate: false,
      },
      fractional: [],
      negative: [],
      reservations: { total: 34, visited: 29 },
    },
    ...over,
  }
}

/** 고른 설정(건수 5줄 · 매출 6줄, 기타1 이름 = 시험 화면 기타1 줄 이름) */
function uisSettings(): UisSettings {
  return {
    v: 1,
    counts: { carm: ['CA1'], sono: ['SO1'], manual: ['MT1'], eswt: ['ES1'], ptVisit: ['AA222'] },
    sales: { carm: ['CA1'], sono: ['SO1'], manual: ['MT1'], eswt: ['ES1'], pt: ['PT1'], etc1: ['CRYO'] },
    etcNames: { etc1: ETC_NAMES[0], etc2: '', etc3: '', etc4: '' },
  }
}

const ok = (data: unknown) => ({ type: 'result', data })
const fail = (code: string) => ({ type: 'error', code })

function deferred<T = unknown>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// --- 가짜 chrome.storage.local ---

function fakeStorage(stored: { bit?: boolean; uis?: UisSettings | null } = {}) {
  const data: Record<string, unknown> = {}
  if (stored.bit) data[SETTINGS_KEY] = { v: 1, picks: {}, etcNames: {}, reservations: {} }
  if (stored.uis) data[UIS_SETTINGS_KEY] = JSON.parse(JSON.stringify(stored.uis))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async () => {}),
  }
  vi.stubGlobal('chrome', { storage: { local } })
  return { local, data }
}

// --- 가짜 Dock: 부른 것을 차례대로 적는다 ---

type Event = [string, unknown?]

function fakeDock(events: Event[], o: { zero?: boolean; written?: 'all' | 'empty' | null } = {}) {
  const log = (name: string) => vi.fn((arg?: unknown) => void events.push([name, arg]))
  return {
    host: document.createElement('div'),
    setReading: log('setReading'),
    show: log('show'),
    askOverlap: vi.fn(async () => null),
    askZero: vi.fn(async (date: string) => {
      events.push(['askZero', date])
      return o.zero ?? true
    }),
    askWritten: vi.fn(async (places: unknown) => {
      events.push(['askWritten', places])
      return o.written === undefined ? 'all' : o.written
    }),
    setLast: log('setLast'),
    hide: log('hide'),
    showRange: log('showRange'),
    setRangeBusy: log('setRangeBusy'),
    setSource: log('setSource'),
    setUisReading: log('setUisReading'),
    showUis: log('showUis'),
    setLastUis: log('setLastUis'),
  }
}

// --- 받기 보기: Blob 주소 만들기·되돌리기와 a[download] 누름 ---

const blobs: Blob[] = []
const revoked: string[] = []
const anchors: { href: string | null; download: string; inBody: boolean }[] = []
const realCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const realRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
document.addEventListener(
  'click',
  (e) => {
    const a = e.target
    if (a instanceof HTMLAnchorElement) {
      anchors.push({ href: a.getAttribute('href'), download: a.download, inBody: a.isConnected })
      e.preventDefault() // jsdom은 이동을 하지 못한다
    }
  },
  true,
)

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

let page: ErpPage | null = null

function setup(
  o: {
    page?: ErpPageOptions
    stored?: { bit?: boolean; uis?: UisSettings | null }
    reply?: unknown | ((msg: unknown) => unknown)
    zero?: boolean
    written?: 'all' | 'empty' | null
  } = {},
) {
  history.replaceState(null, '', '/h/closing')
  page = mountErpPage(document, { etcNames: ETC_NAMES, ...o.page })
  const storage = fakeStorage(o.stored ?? { uis: uisSettings() })
  const events: Event[] = []
  const reply = 'reply' in o ? o.reply : ok(uisDay())
  const send = vi.fn(async (msg: { cmd: string; args: Record<string, unknown> }) => {
    events.push(['send', msg.cmd])
    return typeof reply === 'function' ? (reply as (m: unknown) => unknown)(msg) : reply
  })
  const dock = fakeDock(events, o)
  const openSettings = vi.fn(() => void events.push(['openSettings']))
  const flow = createUisFlow({ doc: document, dock: dock as unknown as Dock, send: send as Send, openSettings, today: () => TODAY })
  const views = () => dock.showUis.mock.calls.map(([v]) => v as UisView)
  return {
    page: page as ErpPage,
    flow,
    dock,
    send,
    events,
    openSettings,
    storage,
    views,
    lastView: () => views().at(-1),
    dayCalls: () => send.mock.calls.filter(([m]) => m.cmd === 'closing.day'),
  }
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(0)
}
const dateInput = () =>
  [...document.querySelectorAll<HTMLInputElement>('input.datepicker-input')].find((i) => i.getAttribute('aria-label') !== '연도 선택') as HTMLInputElement

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  blobs.length = 0
  revoked.length = 0
  anchors.length = 0
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => {
      blobs.push(blob)
      return `blob:erp-test/${blobs.length}`
    }),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn((url: string) => void revoked.push(url)) })
})

afterEach(() => {
  page = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
  history.replaceState(null, '', '/')
  for (const [name, d] of [
    ['createObjectURL', realCreate],
    ['revokeObjectURL', realRevoke],
  ] as const) {
    if (d) Object.defineProperty(URL, name, d)
    else delete (URL as unknown as Record<string, unknown>)[name]
  }
})

it('시험 재료: 예시 답은 readUisDay를 지나고 멈춤이 없다', () => {
  expect(readUisDay(uisDay(), DAY)).not.toBeNull()
  expect(stopOf(uisDay())).toBeNull()
})

describe('AC-4211.1 decideSource — 단추 이름 정하기(저장 여부 → 필요할 때만 closing.source)', () => {
  const sendWith = (reply: unknown | (() => unknown)) =>
    vi.fn(async () => (typeof reply === 'function' ? (reply as () => unknown)() : reply)) as unknown as Send & ReturnType<typeof vi.fn>

  it('AC-4211.1: 비트 설정(erpClosing)만 저장돼 있으면 비트이고 도우미를 부르지 않는다(값 모양은 보지 않는다)', async () => {
    fakeStorage({ bit: true })
    const send = sendWith(ok({ source: 'uisarang' }))
    expect(await decideSource(send)).toBe('bit')
    expect(send).not.toHaveBeenCalled()
  })

  it('AC-4211.1: 의사랑 설정(erpClosingUis)만 저장돼 있으면 의사랑이고 도우미를 부르지 않는다', async () => {
    fakeStorage({ uis: uisSettings() })
    const send = sendWith(ok({ source: 'bit' }))
    expect(await decideSource(send)).toBe('uisarang')
    expect(send).not.toHaveBeenCalled()
  })

  it("AC-4211.1: 둘 다 저장돼 있으면 closing.source {}를 한 번 묻고 { source: 'uisarang' }일 때만 의사랑이다", async () => {
    fakeStorage({ bit: true, uis: uisSettings() })
    const send = sendWith(ok({ source: 'uisarang' }))
    expect(await decideSource(send)).toBe('uisarang')
    expect(send.mock.calls).toEqual([[{ cmd: 'closing.source', args: {} }]])
  })

  it.each([
    ['비트 답', ok({ source: 'bit' })],
    ['옛 도우미(모르는 명령)', fail('E-HELPER-UNKNOWN-COMMAND')],
    ['도우미 없음', fail('E-HELPER-MISSING')],
    ['틀린 답(source 칸 없음)', ok({})],
    ['틀린 답(data 없음)', ok(null)],
    ['답 없음', undefined],
  ])('AC-4211.1: 둘 다 저장돼 있고 closing.source가 %s이면 비트다', async (_, reply) => {
    fakeStorage({ bit: true, uis: uisSettings() })
    const send = sendWith(reply)
    expect(await decideSource(send)).toBe('bit')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('AC-4211.1: 둘 다 저장돼 있고 서비스 워커에 닿지 못하면(던짐) 비트다', async () => {
    fakeStorage({ bit: true, uis: uisSettings() })
    const send = sendWith(() => Promise.reject(new Error('Extension context invalidated.')))
    expect(await decideSource(send)).toBe('bit')
  })

  it('AC-4211.1: closing.source 답을 5초(SOURCE_TIMEOUT_MS)까지만 기다리고 넘으면 비트다', async () => {
    vi.useFakeTimers()
    expect(SOURCE_TIMEOUT_MS).toBe(5_000)
    fakeStorage({ bit: true, uis: uisSettings() })
    const send = sendWith(() => new Promise(() => {}))
    let got: string | null = null
    void decideSource(send).then((s) => {
      got = s
    })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(got).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(got).toBe('bit')
  })

  it('AC-4211.1 (명세와 다름): 둘 다 없으면 도우미를 부르지 않고 비트다 — 설정 저장 전 비트 화면은 도우미를 부르지 않는다(AC-3609.2·AC-3701.3 시험 그대로, AC-4215.2)', async () => {
    fakeStorage({})
    const send = sendWith(ok({ source: 'uisarang' }))
    expect(await decideSource(send)).toBe('bit')
    expect(send).not.toHaveBeenCalled()
  })

  it('AC-4211.1: 저장소를 읽지 못하면(확장과 끊김) 도우미를 부르지 않고 비트다', async () => {
    const { local } = fakeStorage({ uis: uisSettings() })
    local.get.mockRejectedValue(new Error('Extension context invalidated.'))
    const send = sendWith(ok({ source: 'uisarang' }))
    expect(await decideSource(send)).toBe('bit')
    expect(send).not.toHaveBeenCalled()
  })
})

describe('AC-4211.2 [의사랑 값 채우기] 흐름 차례(design.md 9-4)', () => {
  it("AC-4211.2: 마감 일자가 없으면 지금 글(errDate)이고 설정·도우미를 부르지 않는다", async () => {
    const t = setup({ page: { date: null } })
    await t.flow.fill()
    expect(t.dock.show.mock.calls).toEqual([[{ kind: 'errDate' }]])
    expect(t.send).not.toHaveBeenCalled()
    expect(t.storage.local.get).not.toHaveBeenCalled()
  })

  it('AC-4211.2: 마감 일자가 오늘 뒤면 지금 글(future)이고 도우미를 부르지 않는다', async () => {
    const t = setup({ page: { date: '2026-11-11' } })
    await t.flow.fill()
    expect(t.dock.show.mock.calls).toEqual([[{ kind: 'future', date: '2026-11-11' }]])
    expect(t.send).not.toHaveBeenCalled()
  })

  it('AC-4211.2: 의사랑 설정을 저장한 적이 없으면 설정 화면을 열고 시안 ⑭(first)이며 도우미를 부르지 않는다', async () => {
    const t = setup({ stored: { bit: true } })
    await t.flow.fill()
    expect(t.openSettings).toHaveBeenCalledTimes(1)
    expect(t.views()).toEqual([{ kind: 'first' }])
    expect(t.send).not.toHaveBeenCalled()
  })

  it("AC-4211.2: 읽는 중 표시(setUisReading('fill')) → closing.day(toUisArgs) → 표시 풂 차례이고, 읽는 동안 다시 눌러도 한 번만 부른다", async () => {
    const answer = deferred()
    const t = setup({ reply: () => answer.promise })
    void t.flow.fill()
    await flush()
    expect(t.dayCalls()).toEqual([[{ cmd: 'closing.day', args: toUisArgs(DAY, uisSettings()) }]])
    const sent = t.dayCalls()[0][0].args as { groups: unknown[]; sales: unknown[] }
    expect(sent.groups).toHaveLength(5)
    expect(sent.sales).toHaveLength(6)
    void t.flow.fill()
    void t.flow.exportXlsx()
    await flush()
    expect(t.dayCalls()).toHaveLength(1)
    answer.resolve(ok(uisDay()))
    await flush()
    const order = t.events.map(([name, arg]) => (name === 'setUisReading' ? `reading:${String(arg)}` : name))
    expect(order.indexOf('reading:fill')).toBeLessThan(order.indexOf('send'))
    expect(order.indexOf('send')).toBeLessThan(order.indexOf('reading:null'))
    expect(order.indexOf('reading:null')).toBeLessThan(order.indexOf('showUis'))
  })

  it('AC-4211.2: 도우미 오류는 의사랑 오류 안내(err, 번호 그대로)이고 칸을 바꾸지 않는다', async () => {
    for (const code of ['E-UIS-FOLDER', 'E-HELPER-MISSING', 'E-SOMETHING-NEW']) {
      document.body.innerHTML = ''
      const t = setup({ reply: fail(code) })
      const before = { ...t.page.state }
      await t.flow.fill()
      await flush()
      expect(t.views()).toEqual([{ kind: 'err', code }])
      expect(t.page.state).toEqual(before)
    }
  })

  it('AC-4211.2: 도우미가 오늘 뒤 날짜라고 하면 지금 future 글이다', async () => {
    const t = setup({ reply: fail('E-CLOSING-FUTURE-DATE') })
    await t.flow.fill()
    await flush()
    expect(t.dock.show.mock.calls).toEqual([[{ kind: 'future', date: DAY }]])
  })

  it('AC-4211.2: 서비스 워커에 닿지 못하면 E-BRIDGE-DISCONNECTED, 120초 안에 답이 없으면 E-HELPER-TIMEOUT이다', async () => {
    let t = setup({ reply: () => Promise.reject(new Error('Extension context invalidated.')) })
    await t.flow.fill()
    await flush()
    expect(t.views()).toEqual([{ kind: 'err', code: 'E-BRIDGE-DISCONNECTED' }])
    document.body.innerHTML = ''
    t = setup({ reply: () => new Promise(() => {}) })
    void t.flow.fill()
    await vi.advanceTimersByTimeAsync(119_999)
    expect(t.views()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(t.views()).toEqual([{ kind: 'err', code: 'E-HELPER-TIMEOUT' }])
  })

  it('AC-4211.2: 의사랑 설정을 읽다 끊기면 E-BRIDGE-DISCONNECTED이고 도우미를 부르지 않는다', async () => {
    const t = setup()
    t.storage.local.get.mockRejectedValueOnce(new Error('Extension context invalidated.'))
    await t.flow.fill()
    await flush()
    expect(t.views()).toEqual([{ kind: 'err', code: 'E-BRIDGE-DISCONNECTED' }])
    expect(t.send).not.toHaveBeenCalled()
  })

  it('AC-4211.2: 답에 source가 없으면(비트 도우미) E-CLOSING-WRONG-SOURCE 글이다', async () => {
    const t = setup({ reply: ok(sampleDay()) })
    const before = { ...t.page.state }
    await t.flow.fill()
    await flush()
    expect(t.views()).toEqual([{ kind: 'err', code: 'E-CLOSING-WRONG-SOURCE' }])
    expect(t.page.state).toEqual(before)
  })

  it.each([
    ['숫자 칸이 음수', () => ({ ...uisDay(), patients: { ...uisDay().patients, total: -1 } })],
    ['다른 날짜 답', () => ({ ...uisDay(), date: '2026-11-08' })],
    ['보고서 5개', () => ({ ...uisDay(), uis: { ...uisDay().uis, reports: uisDay().uis.reports.slice(1) } })],
    ['data 없음', () => null],
  ])('AC-4211.2: 틀린 답(%s)은 E-BRIDGE-BAD-REPLY이다', async (_, data) => {
    const t = setup({ reply: ok(data()) })
    await t.flow.fill()
    await flush()
    expect(t.views()).toEqual([{ kind: 'err', code: 'E-BRIDGE-BAD-REPLY' }])
  })

  it('AC-4211.2: 읽는 동안 마감 일자가 바뀌면 지금 글(dateChanged)이고 칸을 바꾸지 않는다', async () => {
    const answer = deferred()
    const t = setup({ reply: () => answer.promise })
    const before = { ...t.page.state }
    void t.flow.fill()
    await flush()
    dateInput().value = '2026-11-08'
    answer.resolve(ok(uisDay()))
    await flush()
    expect(t.dock.show.mock.calls.at(-1)).toEqual([{ kind: 'dateChanged' }])
    expect(t.views()).toEqual([])
    expect(t.page.state).toEqual(before)
  })

  it('AC-4211.2: 환자 합계 0이면 지금 진료 0건 묻기이고, 닫으면 칸을 바꾸지 않는다', async () => {
    const zero = uisDay({}, { patients: { ...uisDay().patients, total: 0 } })
    const t = setup({ reply: ok(zero), zero: false })
    const before = { ...t.page.state }
    await t.flow.fill()
    await flush()
    expect(t.dock.askZero.mock.calls).toEqual([[DAY]])
    expect(t.views()).toEqual([])
    expect(t.page.state).toEqual(before)
  })

  it('AC-4211.2: 이미 적힌 칸이 있으면 지금 묻기(askWritten)이고, 닫으면 칸을 바꾸지 않는다', async () => {
    const t = setup({ page: { values: { TOTAL_FEE: '1234' } }, written: null })
    const before = { ...t.page.state }
    await t.flow.fill()
    await flush()
    expect(t.dock.askWritten).toHaveBeenCalledTimes(1)
    expect(t.dock.askWritten.mock.calls[0][0]).toEqual([{ j: 1, box: '외래 수입', row: '외래 총매출' }])
    expect(t.views()).toEqual([])
    expect(t.page.state).toEqual(before)
  })

  it('AC-4211.2: 채우면 의사랑 칸 계획으로 ERP 칸을 채우고 결과 안내(done: uisCells 전체·fillAll 결과·되돌리기 있음)와 [지난 결과]를 둔다', async () => {
    const t = setup()
    await t.flow.fill()
    await flush()
    const view = t.lastView()
    expect(view).toMatchObject({ kind: 'done', day: uisDay(), cells: uisCells(uisDay(), uisSettings()), canUndo: true })
    if (view?.kind !== 'done') throw new Error('done 아님')
    expect(view.result.filled).toBeGreaterThan(40)
    expect(t.dock.setLastUis.mock.calls.at(-1)).toEqual([view])
    expect(t.page.state).toMatchObject({
      TOTAL_FEE: '5182300',
      NEW_PATIENT: '7',
      RETURN_PATIENT: '57',
      PT_VISIT_PATIENT: '31',
      TOTAL_PATIENT: '97',
      CARM_CNT: '18',
      RSV_PATIENTS: '33',
      CARM_AMT: '482000',
      // 의사랑에 없는 칸(none)은 건드리지 않는다
      FIRST90_PATIENT: '',
      UNPAID_IN: '',
    })
    expect(t.page.clicks).toEqual([])
  })

  it('AC-4211.2: 모든 칸이 잠긴 화면은 지금 읽기 전용 글이다', async () => {
    const t = setup({ page: { readOnly: true } })
    await t.flow.fill()
    await flush()
    expect(t.dock.show.mock.calls.at(-1)).toEqual([{ kind: 'readOnly' }])
    expect(t.views()).toEqual([])
  })

  it("AC-4211.2: 결과 안내 [되돌리기]('undo')는 넣은 칸을 돌리고 지금 되돌림 글, 마감 일자가 다르면 지금 글이다", async () => {
    let t = setup()
    const before = { ...t.page.state }
    await t.flow.fill()
    await flush()
    t.flow.act('undo')
    await flush()
    expect(t.page.state).toEqual(before)
    expect(t.dock.show.mock.calls.at(-1)?.[0]).toMatchObject({ kind: 'undone', gone: 0, edited: 0 })
    expect(t.dock.setLastUis.mock.calls.at(-1)).toEqual([null])
    // 두 번째는 되돌릴 것이 없다
    const shown = t.dock.show.mock.calls.length
    t.flow.act('undo')
    await flush()
    expect(t.dock.show.mock.calls).toHaveLength(shown)

    document.body.innerHTML = ''
    t = setup()
    await t.flow.fill()
    await flush()
    const filled = { ...t.page.state }
    dateInput().value = '2026-11-08'
    t.flow.act('undo')
    await flush()
    expect(t.dock.show.mock.calls.at(-1)).toEqual([{ kind: 'undoDateChanged' }])
    expect(t.page.state).toEqual(filled)
  })

  it("AC-4211.2: 안내 [설정 열기]('settings')는 설정 화면만 열고, 'close'는 아무것도 하지 않는다", async () => {
    const t = setup()
    t.flow.act('settings')
    t.flow.act('close')
    await flush()
    expect(t.openSettings).toHaveBeenCalledTimes(1)
    expect(t.send).not.toHaveBeenCalled()
    expect(t.views()).toEqual([])
  })
})

describe('AC-4212.3 멈춤(stopOf) → 시안 ⑥⑦⑨⑩⑪⑫, 아무 칸도 바꾸지 않음', () => {
  const STOPS: [string, () => UisDay][] = [
    ['⑫ 열림', () => uisDay({}, { uis: { ...uisDay().uis, open: ['visitPatients'] } })],
    ['⑨ 날짜 다름', () => uisDay({ income: { state: 'otherDate', from: '2026-11-08', to: '2026-11-08' } })],
    ['⑩ 조건', () => uisDay({ rx: { state: 'notAll', value: '외래' } })],
    ['⑪ 같은 엑셀 둘', () => uisDay({ income: { state: 'twice' } })],
    ['⑥ 엑셀 없음', () => uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing', from: null, to: null }])))],
    ['⑦ 일부 없음', () => uisDay({ rsvPatients: { state: 'missing', from: null, to: null } })],
  ]

  it.each(STOPS)('AC-4212.3: [의사랑 값 채우기]에서 %s이면 그 멈춤 안내(action fill)이고 칸을 바꾸지 않는다', async (_, make) => {
    const day = make()
    const t = setup({ reply: ok(day) })
    const before = { ...t.page.state }
    await t.flow.fill()
    await flush()
    expect(t.views()).toEqual([{ kind: 'stop', stop: stopOf(day), day, action: 'fill' }])
    expect(t.page.state).toEqual(before)
    expect(blobs).toHaveLength(0)
  })

  it('AC-4212.3: 선택 2개(위쪽 표)만 없으면 묻지 않고 채운다', async () => {
    const day = uisDay({ visits: { state: 'missing', from: null, to: null }, rsv: { state: 'missing', from: null, to: null } })
    const t = setup({ reply: ok(day) })
    await t.flow.fill()
    await flush()
    expect(t.lastView()?.kind).toBe('done')
  })

  it('AC-4212.3: ⑦ [있는 엑셀로 채우기](fillAnyway)는 들고 있는 답으로 진료 0건 묻기부터 이어 가고 다시 읽지 않는다', async () => {
    const day = uisDay({ rsvPatients: { state: 'missing', from: null, to: null } }, { patients: { ...uisDay().patients, total: 0 } })
    const t = setup({ reply: ok(day) })
    await t.flow.fill()
    await flush()
    expect(t.lastView()).toMatchObject({ kind: 'stop', stop: { kind: 'some', missing: ['rsvPatients'] } })
    expect(t.dock.askZero).not.toHaveBeenCalled()
    t.flow.act('fillAnyway')
    await flush()
    expect(t.dock.askZero.mock.calls).toEqual([[DAY]])
    expect(t.dayCalls()).toHaveLength(1)
    const view = t.lastView()
    expect(view).toMatchObject({ kind: 'done', day })
    // 없는 엑셀에 기대는 칸(예약 실예약환자수)은 비워 둔다
    expect(t.page.state.RSV_PATIENTS).toBe('')
    expect(t.page.state.TOTAL_FEE).toBe('5182300')
  })
})

describe('AC-4211.5 들고 있는 답(같은 화면·같은 마감 일자 동안, 저장하지 않음)', () => {
  const SOME = () => uisDay({ rsvPatients: { state: 'missing', from: null, to: null } })

  it('AC-4211.5: 안내 안 [엑셀로 받기]·[의사랑 값 채우기]는 다시 읽지 않고, 단추 줄 [의사랑 값 채우기]·[엑셀로 받기]는 늘 다시 읽는다', async () => {
    const t = setup({ reply: ok(SOME()) })
    await t.flow.fill()
    await flush()
    t.flow.act('export')
    await flush()
    expect(t.lastView()).toMatchObject({ kind: 'exported', fileName: uisFileName(DAY) })
    t.flow.act('fill')
    await flush()
    // 들고 있는 답이 아직 ⑦이면 채우기 차례대로 다시 ⑦
    expect(t.lastView()).toMatchObject({ kind: 'stop', action: 'fill', stop: { kind: 'some' } })
    expect(t.dayCalls()).toHaveLength(1)
    await t.flow.fill()
    await flush()
    expect(t.dayCalls()).toHaveLength(2)
    await t.flow.exportXlsx()
    await flush()
    expect(t.dayCalls()).toHaveLength(3)
    expect(t.storage.local.set).not.toHaveBeenCalled()
  })

  it('AC-4211.5: 받았어요 안내 [의사랑 값 채우기]는 들고 있는 답으로 채운다(다시 읽지 않음)', async () => {
    const t = setup()
    await t.flow.exportXlsx()
    await flush()
    expect(t.lastView()?.kind).toBe('exported')
    t.flow.act('fill')
    await flush()
    expect(t.lastView()).toMatchObject({ kind: 'done', day: uisDay() })
    expect(t.page.state.TOTAL_FEE).toBe('5182300')
    expect(t.dayCalls()).toHaveLength(1)
  })

  it('AC-4211.5: 결과 안내 [엑셀로 받기]는 들고 있는 답으로 받는다(다시 읽지 않음)', async () => {
    const t = setup()
    await t.flow.fill()
    await flush()
    t.flow.act('export')
    await flush()
    expect(t.lastView()).toMatchObject({ kind: 'exported', day: uisDay() })
    expect(blobs).toHaveLength(1)
    expect(t.dayCalls()).toHaveLength(1)
  })

  it('AC-4211.5: 마감 일자가 바뀌면 들고 있는 답을 버린다 — 안내 단추는 지금 dateChanged 글이고, 날짜를 되돌려도 다시 쓰지 않는다', async () => {
    const t = setup({ reply: ok(SOME()) })
    await t.flow.fill()
    await flush()
    const before = { ...t.page.state }
    dateInput().value = '2026-11-08'
    t.flow.act('fillAnyway')
    await flush()
    expect(t.dock.show.mock.calls.at(-1)).toEqual([{ kind: 'dateChanged' }])
    dateInput().value = DAY
    t.flow.act('fillAnyway')
    t.flow.act('export')
    await flush()
    expect(t.page.state).toEqual(before)
    expect(blobs).toHaveLength(0)
    expect(t.views().filter((v) => v.kind !== 'stop')).toEqual([])
    expect(t.dayCalls()).toHaveLength(1)
  })

  it('AC-4211.5: reset()(화면 떠남) 뒤에는 들고 있는 답을 쓰지 않고, 떠나기 전에 시작한 읽기의 답도 버린다', async () => {
    let t = setup({ reply: ok(SOME()) })
    await t.flow.fill()
    await flush()
    t.flow.reset()
    t.flow.act('fillAnyway')
    t.flow.act('export')
    await flush()
    expect(blobs).toHaveLength(0)
    expect(t.views().filter((v) => v.kind !== 'stop')).toEqual([])

    document.body.innerHTML = ''
    const answer = deferred()
    t = setup({ reply: () => answer.promise })
    const before = { ...t.page.state }
    void t.flow.fill()
    await flush()
    t.flow.reset()
    answer.resolve(ok(uisDay()))
    await flush()
    expect(t.views()).toEqual([])
    expect(t.page.state).toEqual(before)
  })
})

describe('AC-4213.3 AC-4213.4 [엑셀로 받기]', () => {
  it("AC-4213.3 AC-4213.4: 단추 줄 [엑셀로 받기]는 읽는 중 표시('export') → closing.day → .xlsx 받기 → 받았어요 안내이고 ERP 칸·저장소는 그대로다", async () => {
    const t = setup()
    const before = { ...t.page.state }
    await t.flow.exportXlsx()
    await flush()
    expect(t.dock.setUisReading.mock.calls[0]).toEqual(['export'])
    expect(t.dayCalls()).toEqual([[{ cmd: 'closing.day', args: toUisArgs(DAY, uisSettings()) }]])
    expect(t.views()).toEqual([{ kind: 'exported', day: uisDay(), fileName: 'ERP마감-의사랑-2026-11-09.xlsx' }])
    // 내용 = 시트 줄(uisSheetRows) → workbookBytes(같은 시각), Blob 종류 XLSX_TYPE
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe(XLSX_TYPE)
    const expected = workbookBytes(uisSheetRows(uisDay(), uisSettings()), { sheetName: UIS_SHEET_NAME, widths: UIS_SHEET_WIDTHS }, new Date())
    expect(await blobBytes(blobs[0])).toEqual(expected)
    expect(anchors).toEqual([{ href: 'blob:erp-test/1', download: 'ERP마감-의사랑-2026-11-09.xlsx', inBody: true }])
    expect(t.page.state).toEqual(before)
    expect(t.storage.local.set).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(revoked).toEqual(['blob:erp-test/1'])
  })

  it('AC-4213.3: 단추 줄 [엑셀로 받기]는 ⑥⑨⑩⑪⑫에서 멈추고(action export, 받지 않음) ⑦은 묻지 않고 받는다', async () => {
    const stops: UisDay[] = [
      uisDay({}, { uis: { ...uisDay().uis, open: ['unknown'] } }),
      uisDay({ rsvPatients: { state: 'otherDate', from: '2026-11-08', to: '2026-11-08' } }),
      uisDay({ income: { state: 'notAll', value: '외래' } }),
      uisDay({ visitPatients: { state: 'twice' } }),
      uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing', from: null, to: null }]))),
    ]
    for (const day of stops) {
      document.body.innerHTML = ''
      const t = setup({ reply: ok(day) })
      await t.flow.exportXlsx()
      await flush()
      expect(t.views()).toEqual([{ kind: 'stop', stop: stopOf(day), day, action: 'export' }])
    }
    expect(blobs).toHaveLength(0)
    const some = uisDay({ income: { state: 'missing', from: null, to: null } })
    document.body.innerHTML = ''
    const t = setup({ reply: ok(some) })
    await t.flow.exportXlsx()
    await flush()
    expect(t.views()).toEqual([{ kind: 'exported', day: some, fileName: uisFileName(DAY) }])
    expect(blobs).toHaveLength(1)
  })

  it('AC-4213.3: 단추 줄 [엑셀로 받기]도 마감 일자 없음·오늘 뒤·설정 없음은 [의사랑 값 채우기]와 같고 도우미를 부르지 않는다', async () => {
    let t = setup({ page: { date: null } })
    await t.flow.exportXlsx()
    expect(t.dock.show.mock.calls).toEqual([[{ kind: 'errDate' }]])
    document.body.innerHTML = ''
    t = setup({ page: { date: '2026-11-12' } })
    await t.flow.exportXlsx()
    expect(t.dock.show.mock.calls).toEqual([[{ kind: 'future', date: '2026-11-12' }]])
    document.body.innerHTML = ''
    t = setup({ stored: {} })
    await t.flow.exportXlsx()
    await flush()
    expect(t.openSettings).toHaveBeenCalledTimes(1)
    expect(t.views()).toEqual([{ kind: 'first' }])
    expect(t.send).not.toHaveBeenCalled()
    expect(blobs).toHaveLength(0)
  })

  it('AC-4213.4: downloadBytes는 Blob 주소 + a[download]를 한 번 누르고 그 a를 떼며, 1초 안에 그 주소를 되돌린다', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4])
    downloadBytes(document, bytes, 'a.xlsx')
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe(XLSX_TYPE)
    expect(await blobBytes(blobs[0])).toEqual(bytes)
    expect(anchors).toEqual([{ href: 'blob:erp-test/1', download: 'a.xlsx', inBody: true }])
    expect(document.querySelector('a')).toBeNull()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(revoked).toEqual(['blob:erp-test/1'])
  })
})

describe('AC-4212.5 의사랑 [기간 채우기]', () => {
  it('AC-4212.5: range()는 시안 ⑬(range) 안내만 보이고 설정·도우미를 부르지 않는다', async () => {
    const t = setup()
    t.flow.range()
    await flush()
    expect(t.views()).toEqual([{ kind: 'range' }])
    expect(t.send).not.toHaveBeenCalled()
    expect(t.storage.local.get).not.toHaveBeenCalled()
    expect(t.dock.showRange).not.toHaveBeenCalled()
  })
})

// 안내 단추 이름이 UisAction 모양인지(시험 안에서만 쓰는 형 확인)
const _actions: UisAction[] = ['close', 'fillAnyway', 'export', 'fill', 'undo', 'settings']
void _actions
