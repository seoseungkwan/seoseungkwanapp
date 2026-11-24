// @vitest-environment jsdom
// spec erp-copy-list TASK-5: 목록 화면 흐름(list.ts, design.md 6절) — list.html 몸통 + 가짜 chrome(runtime.sendMessage·openOptionsPage·id,
// 설정은 지금 settings.js load가 읽는 가짜 chrome.storage.local)으로 시험한다
// - AC-3903.1~3903.7 처음 안내·기간 막기·처음 한 번·하루씩 묻기(120초·오류 번호·틀린 답)·그만두기·오류 멈춤·다 받으면 표
// - AC-3905.1~3905.3 숫자 칸 복사(클립보드 → execCommand → 실패 쪽지)·표시, AC-3906.1 엑셀 받기, AC-3907.1 [설정 열기]
// 가짜 답은 지금 시험 도우미(sampleDay)의 숫자를 날짜·값만 바꾼 것이다(환자 정보 없음). 오늘은 가짜 시계 2026-11-24 10:00(한국 시간)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleDay } from '../../extension-erp/src/__tests__/erpPage'
import { explain } from '../../extension-erp/src/errors'
import { TEXT } from '../../extension-erp/src/panel'
import { localToday, RANGE_TEXT } from '../../extension-erp/src/rangeView'
import { defaults, toGroups } from '../../extension-erp/src/settings'
import { SETTINGS_KEY, type ClosingDay, type Settings } from '../../extension-erp/src/types'
import { LIST_TEXT, TOAST_MS, type ListLine, type ListModel } from './listTypes'
import { buildList } from './rows'
import { XLSX_TYPE } from './xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIST_HTML = path.join(ROOT, 'extension-erp-list', 'list.html')

// list.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./list')

type Row = Extract<ListLine, { kind: 'row' }>

const NOW = new Date('2026-11-24T10:00:00+09:00')
const TODAY = '2026-11-24'

/** 숫자 칸 모두 바꾼 복사본(글자·참거짓·null은 그대로) */
function mapNumbers<T>(value: T, f: (n: number) => number): T {
  if (typeof value === 'number') return f(value) as T
  if (Array.isArray(value)) return value.map((x) => mapNumbers(x, f)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, mapNumbers(x, f)])) as T
  return value
}

/** sampleDay를 그 날짜로 옮긴 답. 11/1(일)은 진료 0건, 그 밖은 날짜 숫자만큼 더함. 경고·함께 있는 진료 없음 */
function dayOf(date: string): ClosingDay {
  const bump = date === '2026-11-01' ? null : Number(date.slice(8))
  const day = mapNumbers(sampleDay(), (n) => (bump === null ? 0 : n + bump))
  day.date = date
  day.money.refund = 0
  day.inpatientVisits = 0
  day.overlap = null
  day.warnings = { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false }
  return day
}

const ok = (data: unknown) => ({ type: 'result', data })
const fail = (code: unknown) => ({ type: 'error', code })
type Msg = { cmd: string; args: { date: string; groups: unknown } }
const answer = (msg: Msg) => ok(dayOf(msg.args.date))

function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** 가짜 chrome: 저장한 설정(없으면 null) · 답(메시지마다) · 설정 읽기 실패 */
function fakeChrome(o: { stored?: Settings | null; reply?: (msg: Msg) => unknown; getFails?: boolean } = {}) {
  const data: Record<string, unknown> = {}
  const stored = 'stored' in o ? o.stored : defaults()
  if (stored) data[SETTINGS_KEY] = JSON.parse(JSON.stringify(stored))
  const local = {
    get: vi.fn(async (key: string) => {
      if (o.getFails) throw new Error('read')
      return key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {}
    }),
    set: vi.fn(async () => {}),
  }
  const reply = o.reply ?? answer
  // 답 함수가 던지면 sendMessage도 바로 던진다(확장과 끊긴 화면처럼)
  const sendMessage = vi.fn((msg: Msg): Promise<unknown> => {
    const got = reply(msg)
    return got instanceof Promise ? got : Promise.resolve(got)
  })
  const openOptionsPage = vi.fn(async () => {})
  vi.stubGlobal('chrome', { runtime: { id: 'list-test', sendMessage, openOptionsPage }, storage: { local } })
  return { local, sendMessage, openOptionsPage }
}

/** list.html 몸통을 이 문서에 넣는다(스크립트는 돌지 않음) */
function mountPage() {
  const html = readFileSync(LIST_HTML, 'utf8')
  document.body.innerHTML = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? ''
}

let handle: { stop(): void } | null = null

async function start(o: Parameters<typeof fakeChrome>[0] = {}) {
  // chrome·화면을 두기 전에 불러온다(불러올 때 스스로 시작해 둘이 되지 않게)
  const { startList } = await load()
  mountPage()
  const fake = fakeChrome(o)
  handle = startList(document)
  return fake
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const fromIn = () => $<HTMLInputElement>('from')
const toIn = () => $<HTMLInputElement>('to')
const makeBtn = () => $<HTMLButtonElement>('make')
const xlsxBtn = () => $<HTMLButtonElement>('xlsx')
const help = () => $('help')
const stage = () => $('stage')
const toast = () => $('toast')
const flat = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const text = (el: Element | null | undefined) => flat(el?.textContent)
const stageLines = () => [...stage().querySelectorAll('p')].map(text)
const dayCalls = (send: ReturnType<typeof fakeChrome>['sendMessage']) => send.mock.calls.map(([m]) => m.args.date)

/** 마이크로태스크를 여러 번 비운다(타이머 0도 돈다) */
async function settle(times = 30) {
  for (let i = 0; i < times; i += 1) await vi.advanceTimersByTimeAsync(0)
}

function pick(from: string, to: string) {
  fromIn().value = from
  toIn().value = to
}

/** 기간을 고르고 [목록 만들기] → 다 받을 때까지 */
async function makeList(from = '2026-11-01', to = '2026-11-03') {
  pick(from, to)
  makeBtn().click()
  await settle()
}

const controls = () => ({ from: fromIn().disabled, to: toIn().disabled, make: makeBtn().disabled, xlsx: xlsxBtn().disabled })
const OPEN = { from: false, to: false, make: false, xlsx: true }

/** 그 기간을 그 설정으로 만든 목록 모양(화면이 그리는 것과 같은 셈) */
const modelOf = (dates: string[], settings: Settings = defaults()): ListModel => buildList(dates.map(dayOf), settings)
const THREE = ['2026-11-01', '2026-11-02', '2026-11-03']
/** 그 묶음·줄·열의 줄 순번과 줄 */
function rowIndex(model: ListModel, section: string, name: string, col: string | null = null): { index: number; row: Row } {
  const rows = model.lines.filter((l): l is Row => l.kind === 'row')
  const index = rows.findIndex((r) => r.section === section && r.name === name && r.col === col)
  if (index < 0) throw new Error(`${section} ${name} 줄이 없다`)
  return { index, row: rows[index] }
}
const cellButton = (index: number, date: string) => stage().querySelector<HTMLButtonElement>(`button.v[data-k="${index}|${date}"]`) as HTMLButtonElement
const valueAt = (row: Row, i: number) => {
  const cell = row.cells[i]
  if (!('value' in cell)) throw new Error('값 없는 칸')
  return cell.value
}

// --- 클립보드·받기 흉내 ---
function stubClipboard(write: (t: string) => Promise<void>) {
  const writeText = vi.fn(write)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}
function stubExec(result: boolean | 'throw') {
  const seen: string[] = []
  const exec = vi.fn((cmd: string) => {
    seen.push(document.querySelector('textarea')?.value ?? '')
    if (result === 'throw') throw new Error('no ' + cmd)
    return result
  })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
  return { exec, seen }
}
const urlFns = { create: vi.fn((blob: Blob) => (blob ? 'blob:erp-list' : '')), revoke: vi.fn((url: string) => url) }
function stubUrl() {
  urlFns.create.mockClear()
  urlFns.revoke.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: urlFns.create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: urlFns.revoke })
  const clicks: { href: string | null; download: string; inBody: boolean }[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.getAttribute('href'), download: this.download, inBody: document.body.contains(this) })
  })
  return clicks
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  handle?.stop()
  handle = null
  document.body.innerHTML = ''
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(document, 'execCommand')
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('AC-3903.1 처음 화면', () => {
  it('AC-3903.1: 시작일·끝일 처음 값과 max는 둘 다 오늘(localToday), 처음 안내 세 줄, [엑셀로 받기]는 막힘, 도움 줄은 그대로', async () => {
    const { sendMessage } = await start()
    expect(localToday()).toBe(TODAY)
    expect([fromIn().value, toIn().value, fromIn().max, toIn().max]).toEqual([TODAY, TODAY, TODAY, TODAY])
    expect(stageLines()).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
    expect(controls()).toEqual(OPEN)
    expect(text(help())).toBe(RANGE_TEXT.pick.future)
    expect(help().className).toBe('help')
    expect(toast().hidden).toBe(true)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('AC-3903.1: 확장 화면(chrome.runtime.id + main#listMain)으로 열리면 스스로 시작하고, chrome이 없으면 아무것도 하지 않는다', async () => {
    mountPage()
    vi.resetModules()
    await import('./list')
    expect(fromIn().value).toBe('')
    expect(stage().childElementCount).toBe(0)
    fakeChrome()
    vi.resetModules()
    await import('./list')
    expect(fromIn().value).toBe(TODAY)
    expect(stageLines()).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
  })
})

describe('AC-3903.2 기간 막기', () => {
  it("AC-3903.2: 빈 칸 → '시작일과 끝일을 골라 주세요.' · 시작일 > 끝일 → '시작일이 끝일보다 뒤예요.' · 끝일 > 오늘 → '오늘 뒤 날짜는 고를 수 없어요.'(빨강 help why), 도우미에 묻지 않는다", async () => {
    const { sendMessage, local } = await start()
    const cases: [string, string, string][] = [
      ['', '2026-11-03', RANGE_TEXT.pick.empty],
      ['2026-11-03', '', RANGE_TEXT.pick.empty],
      ['2026-11-05', '2026-11-03', RANGE_TEXT.pick.reversed],
      ['2026-11-30', '2026-11-25', RANGE_TEXT.pick.reversed],
      ['2026-11-20', '2026-11-25', RANGE_TEXT.pick.future],
    ]
    for (const [from, to, why] of cases) {
      pick(from, to)
      makeBtn().click()
      await settle(3)
      expect(text(help()), `${from}~${to}`).toBe(why)
      expect(help().className).toBe('help why')
    }
    expect(['시작일과 끝일을 골라 주세요.', '시작일이 끝일보다 뒤예요.', '오늘 뒤 날짜는 고를 수 없어요.']).toEqual([
      RANGE_TEXT.pick.empty,
      RANGE_TEXT.pick.reversed,
      RANGE_TEXT.pick.future,
    ])
    expect(sendMessage).not.toHaveBeenCalled()
    expect(local.get).not.toHaveBeenCalled()
    expect(stageLines()).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
    // 맞는 기간으로 다시 누르면 도움 줄이 처음 글·모양으로 돌아간다
    await makeList('2026-11-02', '2026-11-02')
    expect(help().className).toBe('help')
    expect(text(help())).toBe(RANGE_TEXT.pick.future)
  })

  it('AC-3903.2: 기간 길이는 막지 않는다 — 400일도 시작한다(첫날부터 묻는다)', async () => {
    const pending = deferred()
    const { sendMessage } = await start({ reply: () => pending.promise })
    pick('2025-10-21', TODAY)
    makeBtn().click()
    await settle()
    expect(help().className).toBe('help')
    expect(dayCalls(sendMessage)).toEqual(['2025-10-21'])
    expect(text(stage().querySelector('b.nw'))).toBe(RANGE_TEXT.scanning.count(400, 0))
  })
})

describe('AC-3903.3 처음 한 번', () => {
  it("AC-3903.3: 설정을 저장한 적이 없으면 설정 화면을 새 탭으로 열고 '처음 한 번…'·'설정 화면을 새 탭으로 열었어요.'만 보이며 도우미에 묻지 않는다", async () => {
    const { sendMessage, openOptionsPage } = await start({ stored: null })
    await makeList()
    expect(openOptionsPage).toHaveBeenCalledTimes(1)
    expect(stageLines()).toEqual([TEXT.first, LIST_TEXT.settingsOpened])
    expect(sendMessage).not.toHaveBeenCalled()
    expect(controls()).toEqual(OPEN)
  })

  it('AC-3903.3: 설정 읽기가 던지면 E-BRIDGE-DISCONNECTED 오류 안내다(설정 화면은 열지 않음)', async () => {
    const { sendMessage, openOptionsPage } = await start({ getFails: true })
    await makeList()
    const e = explain('E-BRIDGE-DISCONNECTED')
    expect(stageLines()).toEqual([e.what, e.how, LIST_TEXT.failed('E-BRIDGE-DISCONNECTED')])
    expect(openOptionsPage).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
    expect(controls()).toEqual(OPEN)
  })
})

describe('AC-3903.4 하루씩 묻기', () => {
  it("AC-3903.4: 옛날부터 하루씩, 앞 답을 받은 뒤에 다음 날을 { cmd: 'closing.day', args: { date, groups: toGroups(설정) } }로 묻고, 세는 동안 '3일 중 k일'·칸과 단추가 막힌다", async () => {
    const waits: ReturnType<typeof deferred>[] = []
    const { sendMessage } = await start({
      reply: () => {
        const d = deferred()
        waits.push(d)
        return d.promise
      },
    })
    pick('2026-11-01', '2026-11-03')
    makeBtn().click()
    await settle()
    expect(dayCalls(sendMessage)).toEqual(['2026-11-01'])
    expect(sendMessage.mock.calls[0][0]).toStrictEqual({ cmd: 'closing.day', args: { date: '2026-11-01', groups: toGroups(defaults()) } })
    expect(text(stage().querySelector('.lead'))).toBe(TEXT.reading)
    expect(text(stage().querySelector('b.nw'))).toBe('3일 중 0일')
    expect(controls()).toEqual({ from: true, to: true, make: true, xlsx: true })
    await settle()
    expect(sendMessage).toHaveBeenCalledTimes(1) // 앞 답 전에는 다음 날을 묻지 않는다
    waits[0].resolve(ok(dayOf('2026-11-01')))
    await settle()
    expect(dayCalls(sendMessage)).toEqual(['2026-11-01', '2026-11-02'])
    expect(text(stage().querySelector('b.nw'))).toBe('3일 중 1일')
    expect(controls()).toEqual({ from: true, to: true, make: true, xlsx: true })
    waits[1].resolve(ok(dayOf('2026-11-02')))
    await settle()
    expect(text(stage().querySelector('b.nw'))).toBe('3일 중 2일')
    waits[2].resolve(ok(dayOf('2026-11-03')))
    await settle()
    expect(dayCalls(sendMessage)).toEqual(THREE)
    expect(stage().querySelector('table.tbl')).not.toBeNull()
  })

  it('AC-3903.4: 120초 안에 답이 없으면 E-HELPER-TIMEOUT(다음 날을 묻지 않음)', async () => {
    const { sendMessage } = await start({ reply: () => new Promise(() => {}) })
    pick('2026-11-01', '2026-11-03')
    makeBtn().click()
    await settle()
    await vi.advanceTimersByTimeAsync(120_000 - 1)
    expect(text(stage().querySelector('.lead'))).toBe(TEXT.reading)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(text(stage().querySelector('.small'))).toBe(LIST_TEXT.failed('E-HELPER-TIMEOUT'))
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['sendMessage가 던짐', () => {
      throw new Error('Extension context invalidated.')
    }, 'E-BRIDGE-DISCONNECTED'],
    ['sendMessage가 거절함', () => Promise.reject(new Error('gone')), 'E-BRIDGE-DISCONNECTED'],
    ["{ type: 'error', code: 'E-BIT-NOT-FOUND' }", () => fail('E-BIT-NOT-FOUND'), 'E-BIT-NOT-FOUND'],
    ['번호 모양이 아닌 오류', () => fail('<b>bad</b>'), 'E-BRIDGE-BAD-REPLY'],
    ['다른 날짜 답', () => ok(dayOf('2026-11-02')), 'E-BRIDGE-BAD-REPLY'],
    ['모양이 틀린 답', () => ok({ date: '2026-11-01', patients: null }), 'E-BRIDGE-BAD-REPLY'],
    ['답 없음(undefined)', () => undefined, 'E-BRIDGE-BAD-REPLY'],
  ])('AC-3903.4: %s → %s', async (_name, reply, code) => {
    const { sendMessage } = await start({ reply: reply as (msg: Msg) => unknown })
    await makeList()
    expect(text(stage().querySelector('.small'))).toBe(LIST_TEXT.failed(code))
    expect(sendMessage).toHaveBeenCalledTimes(1)
  })

  it('AC-3903.4: askDay(date, settings)는 하루 답을 { day } 또는 { code }로 돌려준다', async () => {
    const { askDay } = await load()
    fakeChrome()
    const got = await askDay('2026-11-02', defaults())
    expect(got).toStrictEqual({ day: dayOf('2026-11-02') })
    fakeChrome({ reply: () => fail('E-BIT-DB-FAILED') })
    expect(await askDay('2026-11-02', defaults())).toStrictEqual({ code: 'E-BIT-DB-FAILED' })
    fakeChrome({ reply: () => ok(dayOf('2026-11-03')) })
    expect(await askDay('2026-11-02', defaults())).toStrictEqual({ code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-3903.4: 그날 묶음이 답에 없어도 칸 자리는 같아 표가 되고 그 칸만 빈 칸(셀 수 없음)이다', async () => {
    const odd = dayOf('2026-11-02')
    odd.groups = odd.groups.filter((g) => g.key !== 'etc1')
    const { sendMessage } = await start({ reply: (msg) => ok(msg.args.date === '2026-11-02' ? odd : dayOf(msg.args.date)) })
    await makeList()
    expect(sendMessage).toHaveBeenCalledTimes(3)
    expect(stage().querySelector('table.tbl')).not.toBeNull()
    expect(stage().querySelectorAll('td.na span.nt').length).toBeGreaterThan(0)
  })

  it('AC-3903.4: 목록 모양을 만들지 못하면(buildList가 던짐: 날마다 칸 자리가 다름) E-BRIDGE-BAD-REPLY 안내다', async () => {
    vi.resetModules()
    vi.doMock('./rows', () => ({
      buildList: () => {
        throw new Error('cells differ on 2026-11-02')
      },
    }))
    try {
      const { sendMessage } = await start()
      await makeList()
      expect(sendMessage).toHaveBeenCalledTimes(3)
      expect(text(stage().querySelector('.small'))).toBe(LIST_TEXT.failed('E-BRIDGE-BAD-REPLY'))
      expect(stage().querySelector('table')).toBeNull()
      expect(xlsxBtn().disabled).toBe(true)
    } finally {
      vi.doUnmock('./rows')
      vi.resetModules()
    }
  })
})

describe('AC-3903.5 그만두기', () => {
  it('AC-3903.5: [그만두기] → 처음 안내로 돌아가고 막힘이 풀리며([엑셀로 받기]는 막힌 그대로), 늦게 온 답은 화면을 바꾸지 않고 다음 날을 묻지 않는다', async () => {
    const waits: ReturnType<typeof deferred>[] = []
    const { sendMessage } = await start({
      reply: () => {
        const d = deferred()
        waits.push(d)
        return d.promise
      },
    })
    pick('2026-11-01', '2026-11-03')
    makeBtn().click()
    await settle()
    const stop = stage().querySelector<HTMLButtonElement>('.acts button') as HTMLButtonElement
    expect(text(stop)).toBe(RANGE_TEXT.scanning.cancel)
    stop.click()
    await settle()
    expect(stageLines()).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
    expect(controls()).toEqual(OPEN)
    waits[0].resolve(ok(dayOf('2026-11-01')))
    await settle()
    expect(stageLines()).toEqual([LIST_TEXT.hint.lead, LIST_TEXT.hint.body, LIST_TEXT.hint.copy])
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(controls()).toEqual(OPEN)
  })
})

describe('AC-3903.6 오류면 멈춤', () => {
  it('AC-3903.6: 둘째 날 오류 → 셋째 날을 묻지 않고 오류 안내만(표 없음), [엑셀로 받기] 막힘, [목록 만들기]로 다시 한다', async () => {
    let broken = true
    const { sendMessage } = await start({ reply: (msg) => (broken && msg.args.date === '2026-11-02' ? fail('E-HELPER-MISSING') : answer(msg)) })
    await makeList()
    expect(dayCalls(sendMessage)).toEqual(['2026-11-01', '2026-11-02'])
    const e = explain('E-HELPER-MISSING')
    expect(stageLines()).toEqual([e.what, e.how, '목록을 만들지 못했어요. (번호 E-HELPER-MISSING)'])
    expect(stage().querySelector('.lead.err')).not.toBeNull()
    expect(stage().querySelector('table')).toBeNull()
    expect(controls()).toEqual(OPEN)
    broken = false
    makeBtn().click()
    await settle()
    expect(stage().querySelector('table.tbl')).not.toBeNull()
    expect(xlsxBtn().disabled).toBe(false)
  })
})

describe('AC-3903.7 다 받으면 표', () => {
  it("AC-3903.7: 모든 날을 받으면 표를 그리고 [엑셀로 받기]가 열린다(만든 때 = 이 PC 시각). chrome.storage.local.set은 부르지 않는다", async () => {
    stubClipboard(async () => {})
    const clicks = stubUrl()
    const { local } = await start()
    await makeList()
    const model = modelOf(THREE)
    expect(stage().querySelectorAll('tbody tr.r')).toHaveLength(model.rowCount)
    expect(text(stage().querySelector('.sum .l p'))).toBe(`${LIST_TEXT.period('2026-11-01', '2026-11-03')}${LIST_TEXT.size(3, model.rowCount)}`)
    expect(text(stage().querySelector('.sum .made'))).toBe(LIST_TEXT.madeAt('2026-11-24 10:00'))
    expect(controls()).toEqual({ from: false, to: false, make: false, xlsx: false })
    cellButton(0, '2026-11-02')?.click()
    await settle()
    xlsxBtn().click()
    await settle()
    expect(clicks).toHaveLength(1)
    expect(local.set).not.toHaveBeenCalled()
  })

  it('AC-3903.7: 목록을 다시 만들면 복사 표시를 지운다', async () => {
    stubClipboard(async () => {})
    await start()
    await makeList()
    const model = modelOf(THREE)
    const { index } = rowIndex(model, '외래 수입', '외래 총매출')
    cellButton(index, '2026-11-02').click()
    await settle()
    cellButton(index, '2026-11-03').click()
    await settle()
    expect(stage().querySelectorAll('.v.done, .v.now')).toHaveLength(2)
    makeBtn().click()
    await settle()
    expect(stage().querySelector('table.tbl')).not.toBeNull()
    expect(stage().querySelectorAll('.v.done, .v.now')).toHaveLength(0)
  })
})

describe('AC-3905 숫자 칸 복사', () => {
  it("AC-3905.1·AC-3905.2: 숫자 칸을 누르면 그 값 글자 그대로를 클립보드에 넣고 쪽지 '복사했어요' + 꼬리가 1.8초 보이며, 누른 칸은 .now, 그 전 칸은 .done", async () => {
    const writeText = stubClipboard(async () => {})
    await start()
    await makeList()
    const model = modelOf(THREE)
    const money = rowIndex(model, '외래 수입', '외래 총매출')
    const age = rowIndex(model, '연령별', '20대', '신환')
    const first = cellButton(money.index, '2026-11-02')
    first.click()
    await settle()
    const value = valueAt(money.row, 1)
    expect(writeText).toHaveBeenCalledWith(value)
    expect(value).toMatch(/^\d+$/)
    expect(text(first)).toBe(value)
    expect(toast().hidden).toBe(false)
    expect(toast().className).toBe('toast')
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.copied)
    expect(text(toast().querySelector('span'))).toBe(LIST_TEXT.copyTail('11/2', '외래 수입', '외래 총매출', null, value))
    expect([...first.classList]).toEqual(['v', 'now'])
    await vi.advanceTimersByTimeAsync(TOAST_MS)
    expect(toast().hidden).toBe(true)
    const second = cellButton(age.index, '2026-11-03')
    second.click()
    await settle()
    const ageValue = valueAt(age.row, 2)
    expect(writeText).toHaveBeenLastCalledWith(ageValue)
    expect(text(toast().querySelector('span'))).toBe(`11/3 · 연령별 20대 신환 · ${ageValue}`)
    expect([...first.classList]).toEqual(['v', 'done'])
    expect([...second.classList]).toEqual(['v', 'now'])
  })

  it('AC-3905.1·AC-3904.4: 진료 0건인 날의 0도 그대로 복사된다', async () => {
    const writeText = stubClipboard(async () => {})
    await start()
    await makeList()
    const { index } = rowIndex(modelOf(THREE), '외래 수입', '외래 총매출')
    const zero = cellButton(index, '2026-11-01')
    expect(zero.closest('td')?.classList.contains('z')).toBe(true)
    zero.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('0')
    expect(text(toast().querySelector('span'))).toBe('11/1 · 외래 수입 외래 총매출 · 0')
  })

  it("AC-3905.1: writeText가 실패하면 숨긴 글 칸 + execCommand('copy')로 복사한다(글 칸은 지운다)", async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })
    const { exec, seen } = stubExec(true)
    await start()
    await makeList()
    const money = rowIndex(modelOf(THREE), '외래 수입', '외래 총매출')
    cellButton(money.index, '2026-11-03').click()
    await settle()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(seen).toEqual([valueAt(money.row, 2)])
    expect(document.querySelector('textarea')).toBeNull()
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.copied)
    expect([...cellButton(money.index, '2026-11-03').classList]).toEqual(['v', 'now'])
  })

  it("AC-3905.1: 클립보드가 아예 없어도 execCommand('copy')로 복사한다", async () => {
    const { exec } = stubExec(true)
    await start()
    await makeList()
    cellButton(0, '2026-11-02').click()
    await settle()
    expect(exec).toHaveBeenCalledWith('copy')
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.copied)
  })

  it.each([
    ['execCommand가 false', false],
    ['execCommand가 던짐', 'throw'],
  ] as const)("AC-3905.3: 두 방법이 다 실패하면(%s) 쪽지 '복사하지 못했어요. 다시 눌러 주세요.'(.bad)이고 칸 표시는 바뀌지 않는다", async (_name, result) => {
    const writeText = stubClipboard(async () => {})
    await start()
    await makeList()
    const { index } = rowIndex(modelOf(THREE), '외래 수입', '외래 총매출')
    cellButton(index, '2026-11-02').click()
    await settle()
    writeText.mockImplementation(async () => {
      throw new Error('denied')
    })
    stubExec(result)
    cellButton(index, '2026-11-03').click()
    await settle()
    expect(toast().className).toBe('toast bad')
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.copyFailed)
    expect(toast().querySelector('span')).toBeNull()
    expect([...cellButton(index, '2026-11-02').classList]).toEqual(['v', 'now'])
    expect([...cellButton(index, '2026-11-03').classList]).toEqual(['v'])
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('AC-3905.4: 빈 칸·줄 이름·머리를 눌러도 복사하지 않는다', async () => {
    const writeText = stubClipboard(async () => {})
    await start()
    await makeList()
    for (const el of stage().querySelectorAll<HTMLElement>('td.na, th.lab, thead th, .sum, .legend')) el.click()
    await settle()
    expect(writeText).not.toHaveBeenCalled()
    expect(toast().hidden).toBe(true)
  })
})

describe('AC-3906.1 엑셀로 받기', () => {
  it("AC-3906.1: 표가 보일 때만 열려 있고, 누르면 Blob(XLSX_TYPE) + a[download] 누름, 주소는 한 박자 뒤 지우며 쪽지 '엑셀 파일을 받았어요' + 파일 이름", async () => {
    const clicks = stubUrl()
    await start()
    expect(xlsxBtn().disabled).toBe(true)
    await makeList()
    expect(xlsxBtn().disabled).toBe(false)
    xlsxBtn().click()
    expect(urlFns.create).toHaveBeenCalledTimes(1)
    const blob = urlFns.create.mock.calls[0][0]
    expect(blob.type).toBe(XLSX_TYPE)
    expect(blob.size).toBeGreaterThan(1000)
    expect(clicks).toEqual([{ href: 'blob:erp-list', download: 'ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx', inBody: true }])
    expect(urlFns.revoke).not.toHaveBeenCalled() // 바로 지우면 받기가 끊길 수 있다
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.saved)
    expect(text(toast().querySelector('span'))).toBe(LIST_TEXT.fileName('2026-11-01', '2026-11-03'))
    await vi.advanceTimersByTimeAsync(0)
    expect(urlFns.revoke).toHaveBeenCalledTimes(1)
    expect(urlFns.revoke).toHaveBeenCalledWith('blob:erp-list')
  })

  it('AC-3906.1: 날짜 칸을 바꾼 뒤 눌러도 지금 보이는 표의 기간 이름이다', async () => {
    const clicks = stubUrl()
    await start()
    await makeList()
    pick('2026-10-01', '2026-10-31')
    xlsxBtn().click()
    expect(clicks[0].download).toBe(LIST_TEXT.fileName('2026-11-01', '2026-11-03'))
  })

  it('AC-3906.1: 세는 중·오류·처음 한 번 안내 때는 막혀 있다', async () => {
    const waits: ReturnType<typeof deferred>[] = []
    await start({
      reply: () => {
        const d = deferred()
        waits.push(d)
        return d.promise
      },
    })
    await makeList()
    expect(xlsxBtn().disabled).toBe(true) // 세는 중
    waits[0].resolve(fail('E-HELPER-MISSING'))
    await settle()
    expect(xlsxBtn().disabled).toBe(true) // 오류
    handle?.stop()
    await start({ stored: null })
    await makeList()
    expect(xlsxBtn().disabled).toBe(true) // 처음 한 번
  })

  it('AC-3906.1: saveXlsx(doc, model, now)는 받은 파일 이름을 돌려준다', async () => {
    stubUrl()
    const { saveXlsx } = await load()
    mountPage()
    expect(saveXlsx(document, modelOf(THREE), NOW)).toBe('ERP마감일지_입력목록_2026-11-01_2026-11-03.xlsx')
  })
})

describe('AC-3907.1 설정 열기', () => {
  it("AC-3907.1: [설정 열기] → chrome.runtime.openOptionsPage() + 쪽지 '설정 화면을 새 탭으로 열었어요.'", async () => {
    const { openOptionsPage } = await start()
    $<HTMLButtonElement>('openSettings').click()
    await settle(3)
    expect(openOptionsPage).toHaveBeenCalledTimes(1)
    expect(toast().hidden).toBe(false)
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.settingsOpened)
    expect(toast().querySelector('span')).toBeNull()
  })

  it('AC-3907.1: openOptionsPage가 실패해도 화면은 그대로 쪽지를 보인다', async () => {
    const { openOptionsPage } = await start()
    openOptionsPage.mockImplementation(async () => {
      throw new Error('no')
    })
    $<HTMLButtonElement>('openSettings').click()
    await settle(3)
    expect(text(toast().querySelector('b'))).toBe(LIST_TEXT.settingsOpened)
  })
})
