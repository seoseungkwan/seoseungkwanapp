// @vitest-environment jsdom
// 어레인지 잇기 app.js (TASK-11, reception-arrange design.md 10절). jsdom에 index.html을 넣고 app.js를 부른 뒤 가짜 도우미(fixtures.ts fakeServer)에
// 묻는 가짜 fetch로 끝까지 본다: 탭·해시 길(#/a·#/a/v/{열쇠}), 칸 누름의 낙관적 그리기와 실패 되그리기, 되돌리기 띠 5초, 저절로 읽기에도 지키는 것,
// 기록부 열기·다시 읽기·돌아오기, 처방 나옴 알림(탭이 보일 때만·첫 읽기 아님), 숨김·끊김 지우기. 시계는 가짜다. 자료는 가짜다(fixtures.ts)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeServer } from './fixtures'

interface AppJs {
  app: { stop: () => void } | null
}

const APP_JS = '../www/app.js'
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'index.html')

const TITLE = '접수 현황'
const LOADING = '불러오는 중이에요'
const FAIL = '저장하지 못했어요. 다시 눌러 주세요'
const K = fx.ARRANGE_KEYS
/** 시안 판의 환자 이름 (가상환자21~30) */
const NAMES = Array.from({ length: 10 }, (_, i) => `가상환자${21 + i}`)

/** 같은 곳 길만: 판·상세·직전·찍음·어레인지 표시 (AC-1413.2) */
const SAME_PC_API = /^\/api\/(?:board(?:\?fresh=1)?|visit\/[0-9a-f]{16}\/(?:history\?from=\d+|prev)|xray|arrange)$/

// ---- 가짜 도우미 ------------------------------------------------------------------------------------

interface Call {
  url: string
  method: string
  body: string | null
  init: RequestInit
}

type Reply = (call: Call) => Promise<Response>

let server: FakeServer
let calls: Call[]
let overrides: Array<{ prefix: string; reply: Reply }>
let visibility: DocumentVisibilityState
let vibrate: ReturnType<typeof vi.fn>
let scrollTo: ReturnType<typeof vi.fn>
let scrollY: number
let running: AppJs['app'] = null

function respond(call: Call): Promise<Response> {
  const r = server.answer(call.method, call.url, call.body)
  return Promise.resolve(new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }))
}

/** 다음 prefix 요청 하나를 손으로 답한다(답하지 않으면 5초에 끊긴다) */
function hold(prefix: string) {
  let release: (ok: boolean) => void = () => {}
  overrides.push({
    prefix,
    reply: (call) =>
      new Promise<Response>((resolve, reject) => {
        release = (ok) => (ok ? void respond(call).then(resolve) : reject(new TypeError('Failed to fetch')))
      }),
  })
  return { answer: () => release(true) }
}

function failNext(prefix: string) {
  overrides.push({ prefix, reply: () => Promise.reject(new TypeError('Failed to fetch')) })
}

function statusNext(prefix: string, status: number) {
  overrides.push({ prefix, reply: () => Promise.resolve(new Response(null, { status })) })
}

function urls(): string[] {
  return calls.map((c) => c.url)
}

function boardReads(): number {
  return urls().filter((u) => u.startsWith('/api/board')).length
}

function reads(k: string, what: 'history' | 'prev'): number {
  return urls().filter((u) => u === (what === 'history' ? `/api/visit/${k}/history?from=0` : `/api/visit/${k}/prev`)).length
}

/** 보낸 어레인지 쓰기 몸들 */
function writes(): unknown[] {
  return calls.filter((c) => c.url === '/api/arrange').map((c) => JSON.parse(c.body ?? 'null'))
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(1)
}

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

function loadIndex() {
  const parsed = new DOMParser().parseFromString(readFileSync(INDEX_HTML, 'utf8'), 'text/html')
  document.head.replaceChildren(...[...parsed.head.childNodes].map((n) => document.importNode(n, true)))
  document.body.replaceChildren(...[...parsed.body.childNodes].map((n) => document.importNode(n, true)))
}

async function open({ hash = '' } = {}) {
  loadIndex()
  window.history.replaceState(null, '', hash || '#')
  expect(appEl().textContent).toContain(LOADING)
  vi.resetModules()
  const mod = (await import(/* @vite-ignore */ APP_JS).catch(() => null)) as AppJs | null
  running = mod?.app ?? null
  await settle()
  return appEl()
}

function appEl(): HTMLElement {
  return document.getElementById('app')!
}

function hide() {
  visibility = 'hidden'
  document.dispatchEvent(new Event('visibilitychange'))
}

function show() {
  visibility = 'visible'
  document.dispatchEvent(new Event('visibilitychange'))
}

// ---- 화면 읽기 ------------------------------------------------------------------------------------

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function arrangePage(): HTMLElement | null {
  return appEl().querySelector('.page.arrange')
}

function chartsPage(): HTMLElement | null {
  return appEl().querySelector('.page.charts-page')
}

function tab(label: string): HTMLButtonElement {
  const found = [...appEl().querySelectorAll<HTMLButtonElement>('nav.tabs > button.tab')].find((b) => b.firstChild?.textContent === label)
  if (!found) throw new Error(`탭 ${label} 없음`)
  return found
}

function pressedTabs(): string[] {
  return [...appEl().querySelectorAll('nav.tabs > button.tab')].map((b) => b.getAttribute('aria-pressed') ?? '')
}

function trOf(name: string): HTMLTableRowElement {
  const found = [...appEl().querySelectorAll<HTMLTableRowElement>('table.arr > tbody > tr')].find((tr) => textOf(tr, '.arr-name') === name)
  if (!found) throw new Error(`줄 ${name} 없음`)
  return found
}

function hasRow(name: string): boolean {
  return [...appEl().querySelectorAll('table.arr > tbody > tr .arr-name')].some((n) => n.textContent === name)
}

function cellOf(name: string, col: fx.FakeCol): HTMLElement {
  return trOf(name).querySelector<HTMLElement>(`td.c-${col} > .cell`)!
}

function toastText(): string | null {
  return textOf(appEl(), '.toast .toast-text')
}

function undoButton(): HTMLButtonElement | null {
  return appEl().querySelector('.toast button.toast-undo')
}

/** 가짜 도우미 판의 줄 k에 칸을 얹는다(비트에 처방이 나옴·다른 기기가 넣음) */
function putCell(k: string, col: fx.FakeCol, cell: Partial<fx.FakeCell>) {
  const row = server.board.arrange!.rows.find((r) => r.k === k)!
  row.cells[col] = fx.fakeCell(cell)
}

/** 가짜 도우미 판에서 열쇠 k를 뺀다(목록·어레인지 모두) */
function dropFromBoard(k: string) {
  for (const lane of ['queue', 'wait', 'hold', 'pay', 'done'] as const) server.board.lists[lane] = server.board.lists[lane].filter((r) => r.k !== k)
  server.board.arrange!.rows = server.board.arrange!.rows.filter((r) => r.k !== k)
}

/** 화면 어디에도 환자 글·어레인지 화면·창·띠가 없다 */
function expectNoPatient() {
  const text = document.body.textContent ?? ''
  for (const name of NAMES) expect(text, `화면에 ${name}`).not.toContain(name)
  expect(document.querySelector('.page.arrange, .page.charts-page, .sheet-back, .toast, .rx-new, .paper, tr')).toBeNull()
}

// ---- 준비 ------------------------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 9, 11, 4, 20))
  server = fx.fakeServer(fx.arrangeMockupBoard(), '11:05')
  calls = []
  overrides = []
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' })
  vibrate = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: vibrate })
  scrollY = 0
  scrollTo = vi.fn()
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: scrollTo })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => {
      const call: Call = { url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null, init: init ?? {} }
      calls.push(call)
      const i = overrides.findIndex((o) => call.url.startsWith(o.prefix))
      if (i >= 0) return overrides.splice(i, 1)[0]!.reply(call)
      return respond(call)
    }),
  )
})

afterEach(() => {
  running?.stop()
  running = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'vibrate')
  Reflect.deleteProperty(document, 'visibilityState')
  Reflect.deleteProperty(document, 'hidden')
  Reflect.deleteProperty(window, 'scrollY')
  Reflect.deleteProperty(window, 'scrollTo')
  document.head.replaceChildren()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '#')
  localStorage.clear()
})

// ---- 탭 · 해시 길 (AC-3308.1) ------------------------------------------------------------------------

describe('app.js 어레인지 탭', () => {
  it('AC-3308.1: 처음은 [접수 현황]이고, 주소 해시가 #/a면 처음부터 [어레인지]다. 탭을 누르면 해시가 #/a·#/로 바뀌어 그 화면을 그린다(다시 읽지 않음). 문서 제목은 늘 "접수 현황"이다', async () => {
    let app = await open()
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(pressedTabs()).toEqual(['true', 'false'])
    expect(textOf(app, 'nav.tabs .tab-n')).toBe('8명')
    running?.stop()

    app = await open({ hash: '#/a' })
    expect(urls()).toEqual(['/api/board', '/api/board'])
    expect(arrangePage()).not.toBeNull()
    expect(pressedTabs()).toEqual(['false', 'true'])
    expect(document.title).toBe(TITLE)

    tab('접수 현황').click()
    await settle()
    expect(window.location.hash).toBe('#/')
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(arrangePage()).toBeNull()
    expect(pressedTabs()).toEqual(['true', 'false'])
    tab('어레인지').click()
    await settle()
    expect(window.location.hash).toBe('#/a')
    expect(arrangePage()).not.toBeNull()
    expect(boardReads()).toBe(2)
    expect(document.title).toBe(TITLE)
    // 저절로 읽기에도 어레인지 탭 그대로
    await wait(5000)
    expect(arrangePage()).not.toBeNull()
    expect(window.location.hash).toBe('#/a')
    for (const u of urls()) expect(u).toMatch(SAME_PC_API)
  })
})

// ---- 칸 누름 · 보내기 (AC-3308.5 · 3308.8 · 3308.9 · 3308.13) ---------------------------------------------

describe('app.js 어레인지 쓰기', () => {
  it('AC-3308.5: 칸을 누르면 그 자리에서 다음 단계를 그리고 POST /api/arrange {k, op: step, col}을 보낸 뒤 204면 판을 다시 읽는다. 띠 "{이름} · {칸} …로 바꿨어요"와 [되돌리기]가 5초 보이고 [되돌리기]는 앞 단계로 set을 보낸다', async () => {
    await open({ hash: '#/a' })
    const write = hold('/api/arrange')
    cellOf('가상환자23', 'sono').click()
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    expect(textOf(cellOf('가상환자23', 'sono'), '.st')).toBe('준비완료 11:04')
    expect(toastText()).toBe('가상환자23 · SONO 준비완료로 바꿨어요')
    expect(undoButton()).not.toBeNull()
    expect(writes()).toEqual([{ k: K.c, op: 'step', col: 'sono' }])
    const call = calls.find((c) => c.url === '/api/arrange')!
    expect(new Headers(call.init.headers).get('X-Reception')).toBe('1')
    const before = boardReads()
    write.answer()
    await settle()
    expect(boardReads()).toBe(before + 1)
    expect(textOf(cellOf('가상환자23', 'sono'), '.st')).toBe('준비완료 11:05')
    expect(toastText()).toBe('가상환자23 · SONO 준비완료로 바꿨어요')
    await wait(5000)
    expect(toastText()).toBeNull()

    cellOf('가상환자23', 'sono').click()
    await settle()
    expect(cellOf('가상환자23', 'sono').className).toBe('cell done')
    expect(toastText()).toBe('가상환자23 · SONO 완료로 바꿨어요')
    undoButton()!.click()
    expect(toastText()).toBeNull()
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    await settle()
    expect(writes().at(-1)).toEqual({ k: K.c, op: 'set', col: 'sono', v: 'ready' })
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    expect(toastText()).toBeNull()
  })

  it('AC-3308.5 · AC-3308.7: 빈 칸 넣기·부위 고르기·완료 칸 되돌리기도 고른 글로 add·part·set을 보낸다', async () => {
    await open({ hash: '#/a' })
    cellOf('가상환자28', 'pt').click()
    ;[...appEl().querySelectorAll<HTMLButtonElement>('.sheet .opt')].find((b) => b.textContent === 'HP')!.click()
    expect(appEl().querySelector('.sheet-back')).toBeNull()
    expect(textOf(cellOf('가상환자28', 'pt'), '.det')).toBe('HP')
    expect(toastText()).toBe('가상환자28 · PT 직접 넣었어요')
    await settle()
    trOf('가상환자23').querySelector<HTMLButtonElement>('button.part-btn')!.click()
    ;[...appEl().querySelectorAll<HTMLButtonElement>('.sheet .opt')].find((b) => b.textContent === '오른 어깨')!.click()
    await settle()
    cellOf('가상환자21', 'sono').click()
    ;[...appEl().querySelectorAll<HTMLButtonElement>('.sheet .opt')].find((b) => b.textContent === '준비로 되돌리기')!.click()
    await settle()
    expect(writes()).toEqual([
      { k: K.h, op: 'add', col: 'pt', v: 'HP' },
      { k: K.c, op: 'part', col: 'sono', v: '오른 어깨' },
      { k: K.a, op: 'set', col: 'sono', v: 'todo' },
    ])
    expect(textOf(cellOf('가상환자23', 'sono'), '.det')).toBe('오른 어깨')
    expect(cellOf('가상환자21', 'sono').className).toBe('cell todo')
  })

  it('AC-3308.9: 쓰기가 204가 아니거나(500) 연결이 안 되면 그린 것을 판의 값으로 되돌리고 띠에 "저장하지 못했어요. 다시 눌러 주세요"를 보인다', async () => {
    await open({ hash: '#/a' })
    statusNext('/api/arrange', 500)
    cellOf('가상환자23', 'pt').click()
    expect(cellOf('가상환자23', 'pt').className).toBe('cell done')
    await settle()
    expect(cellOf('가상환자23', 'pt').className).toBe('cell todo')
    expect(textOf(cellOf('가상환자23', 'pt'), '.st')).toBe('준비')
    expect(toastText()).toBe(FAIL)
    expect(undoButton()).toBeNull()

    failNext('/api/arrange')
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(trOf('가상환자21').classList.contains('away')).toBe(true)
    await settle()
    expect(trOf('가상환자21').classList.contains('away')).toBe(false)
    expect(toastText()).toBe(FAIL)
    expect(appEl().querySelector('.page.off-page')).toBeNull()
  })

  it('AC-3308.9: 5초 안에 답이 없으면 실패로 되그리고, 같은 칸을 쓰는 중에는 다시 눌러도 보내지 않으며, 그사이 다시 읽은 판에도 미리 그린 것이 남는다', async () => {
    await open({ hash: '#/a' })
    hold('/api/arrange')
    cellOf('가상환자23', 'sono').click()
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    cellOf('가상환자23', 'sono').click()
    cellOf('가상환자23', 'sono').click()
    expect(writes()).toEqual([{ k: K.c, op: 'step', col: 'sono' }])
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    // [새로 고침]: 도우미는 아직 쓰기 전 판을 주지만 미리 그린 칸은 그대로
    appEl().querySelector<HTMLButtonElement>('header.top button.refresh')!.click()
    await settle()
    expect(cellOf('가상환자23', 'sono').className).toBe('cell ready')
    await wait(5000)
    expect(cellOf('가상환자23', 'sono').className).toBe('cell todo')
    expect(toastText()).toBe(FAIL)
    expect(writes()).toEqual([{ k: K.c, op: 'step', col: 'sono' }])
  })

  it('AC-3308.8 · AC-3308.13: 접수 칸·[치료 종료]·[다시 넣기]·[PT 먼저]는 away·end·ptf를 보내고 띠가 보인다', async () => {
    await open({ hash: '#/a' })
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    expect(textOf(trOf('가상환자21'), '.away-tag')).toBe('자리비움11:04')
    expect(toastText()).toBe('가상환자21 · 자리비움 11:04')
    await settle()
    expect(textOf(trOf('가상환자21'), '.away-tag')).toBe('자리비움11:05')

    trOf('가상환자22').querySelector<HTMLButtonElement>('button.end-btn')!.click()
    expect(hasRow('가상환자22')).toBe(false)
    expect(toastText()).toBe('가상환자22 님을 표에서 뺐어요')
    expect(textOf(appEl(), 'button.ended-h')).toBe('오늘 치료 종료 3명 ▾')
    await settle()
    expect(hasRow('가상환자22')).toBe(false)

    appEl().querySelector<HTMLButtonElement>('button.ended-h')!.click()
    const restore = [...appEl().querySelectorAll('section.ended li')].find((li) => textOf(li, '.e-n') === '가상환자30')!
    restore.querySelector<HTMLButtonElement>('button.restore')!.click()
    expect(toastText()).toBe('가상환자30 님을 표에 다시 넣었어요')
    await settle()
    expect(hasRow('가상환자30')).toBe(true)

    trOf('가상환자26').querySelector<HTMLButtonElement>('button.ptf-btn')!.click()
    expect(toastText()).toBe('가상환자26 · PT 끝나고 내려왔어요')
    await settle()
    expect(writes()).toEqual([
      { k: K.a, op: 'away', v: 'on' },
      { k: K.b, op: 'end', v: 'on' },
      { k: K.j, op: 'end', v: 'off' },
      { k: K.f, op: 'ptf', v: 'down' },
    ])
    expect(textOf(trOf('가상환자26'), 'button.ptf-btn')).toBe('↓ 내려옴 11:05')
  })

  it('AC-3308.11: 저절로 다시 읽어도 어레인지 탭·표 뼈대(옆으로 민 위치)·세로 위치·열린 고르기 창·[오늘 치료 종료] 펼침을 지키고, 창의 줄이 판에서 사라지면 창을 닫는다', async () => {
    await open({ hash: '#/a' })
    const wrap = appEl().querySelector('.wrap')
    cellOf('가상환자21', 'sono').click()
    appEl().querySelector<HTMLButtonElement>('button.ended-h')!.click()
    await wait(5000)
    expect(boardReads()).toBe(2)
    expect(appEl().querySelector('.wrap')).toBe(wrap)
    expect(textOf(appEl(), '.sheet .sheet-title')).toBe('SONO · 완료')
    expect(appEl().querySelector('button.ended-h')?.getAttribute('aria-expanded')).toBe('true')
    expect(window.location.hash).toBe('#/a')
    expect(scrollTo).not.toHaveBeenCalled()

    // 다른 기기가 그 줄을 치료 종료함 → 창을 닫는다. 줄이 돌아와도 다시 열리지 않는다
    const row = server.board.arrange!.rows.find((r) => r.k === K.a)!
    server.board.arrange!.rows = server.board.arrange!.rows.filter((r) => r.k !== K.a)
    await wait(5000)
    expect(appEl().querySelector('.sheet-back')).toBeNull()
    server.board.arrange!.rows.unshift(row)
    await wait(5000)
    expect(hasRow('가상환자21')).toBe(true)
    expect(appEl().querySelector('.sheet-back')).toBeNull()
  })

  it('AC-3402.2: 충격파 두 줄 창에서 고른 타수·부위 수는 저절로 다시 읽기(5초)에도 남고, [넣기 · 3000타 2부위]는 add v="3000타 2부위"를 보내 칸에 타수·부위 수를 그린다', async () => {
    await open({ hash: '#/a' })
    const choose = (label: string) => [...appEl().querySelectorAll<HTMLButtonElement>('.sheet .opts.four > button.opt')].find((b) => b.textContent === label)!.click()
    const pressed = () => [...appEl().querySelectorAll('.sheet .opts.four > button.opt[aria-pressed="true"]')].map((b) => b.textContent)
    cellOf('가상환자28', 'eswt').click()
    choose('3000타')
    choose('2부위')
    await wait(5000)
    expect(boardReads()).toBe(2)
    expect(textOf(appEl(), '.sheet .sheet-title')).toBe('충격파 직접 넣기')
    expect(pressed()).toEqual(['3000타', '2부위'])
    const go = appEl().querySelector<HTMLButtonElement>('.sheet .sheet-go > button.go')!
    expect(go.textContent).toBe('넣기 · 3000타 2부위')
    go.click()
    expect(appEl().querySelector('.sheet-back')).toBeNull()
    expect(toastText()).toBe('가상환자28 · 충격파 직접 넣었어요')
    await settle()
    expect(writes()).toEqual([{ k: K.h, op: 'add', col: 'eswt', v: '3000타 2부위' }])
    expect([textOf(cellOf('가상환자28', 'eswt'), '.hit'), textOf(cellOf('가상환자28', 'eswt'), '.det')]).toEqual(['3000타', '2부위'])
  })
})

// ---- 기록부 (AC-3309.1 · 3309.3 · 3309.4 · 3309.5) ---------------------------------------------------------

describe('app.js 기록부', () => {
  it('AC-3309.1 · AC-3309.4: 성함을 누르면 #/a/v/{열쇠}로 기록부가 열려 오늘(history?from=0)과 직전(prev)을 한 번씩 읽고, [‹ 어레인지]·뒤로 가기는 #/a 표로 돌아와 세로 위치를 되살린다', async () => {
    await open({ hash: '#/a' })
    scrollY = 420
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    await settle()
    expect(window.location.hash).toBe(`#/a/v/${K.a}`)
    expect(chartsPage()).not.toBeNull()
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([1, 1])
    expect(textOf(chartsPage(), 'h1.detail-name')).toBe('가상환자21')
    expect(chartsPage()!.querySelector('section.chart-today article.paper')).not.toBeNull()
    expect(textOf(chartsPage(), 'section.chart-prev h2 .h-dt')).toBe('2026-10-26 · 14일 전')
    expect(document.title).toBe(TITLE)

    appEl().querySelector<HTMLAnchorElement>('a.back')!.click()
    await settle()
    expect(window.location.hash).toBe('#/a')
    expect(arrangePage()).not.toBeNull()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420)

    scrollY = 260
    trOf('가상환자22').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    await settle()
    expect(window.location.hash).toBe(`#/a/v/${K.b}`)
    window.history.back()
    await settle()
    await settle()
    expect(window.location.hash).toBe('#/a')
    expect(arrangePage()).not.toBeNull()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 260)
    for (const u of urls()) expect(u).toMatch(SAME_PC_API)
  })

  it('AC-3309.1: 지난 내원이 없는 환자(prev null)는 "첫 방문이라 직전 기록부가 없어요."다', async () => {
    await open({ hash: `#/a/v/${K.c}` })
    expect(chartsPage()).not.toBeNull()
    expect(textOf(chartsPage(), 'section.chart-prev .none-card')).toBe('첫 방문이라 직전 기록부가 없어요.')
  })

  it('AC-3309.3: 기록부가 열린 동안 오늘 종이는 칸·오늘 처방이 바뀌거나 30초가 지날 때만 다시 읽고 직전 종이는 다시 읽지 않는다. 그 환자가 판에서 사라지면 어레인지 표로 돌아간다', async () => {
    await open({ hash: `#/a/v/${K.a}` })
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([1, 1])
    await wait(5000)
    await wait(5000)
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([1, 1])
    // 칸이 바뀜(수납완료 → 수납대기)
    const row = server.board.lists.done.find((r) => r.k === K.a)!
    server.board.lists.done = server.board.lists.done.filter((r) => r.k !== K.a)
    server.board.lists.pay.push({ ...row, lane: 'pay', laneLabel: '수납대기' })
    await wait(5000)
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([2, 1])
    expect(textOf(chartsPage(), '.state .status')).toBe('수납대기')
    await wait(30_000)
    expect(reads(K.a, 'history')).toBe(3)
    expect(reads(K.a, 'prev')).toBe(1)

    dropFromBoard(K.a)
    await wait(5000)
    expect(window.location.hash).toBe('#/a')
    expect(chartsPage()).toBeNull()
    expect(arrangePage()).not.toBeNull()
  })

  it('AC-3309.5: 기록부 읽기가 실패하면 그 칸에 "지금 기록부를 읽지 못했어요" 한 줄만 보이고(끊김 화면 아님) 다음 저절로 읽기에 다시 본다', async () => {
    await open({ hash: '#/a' })
    failNext(`/api/visit/${K.a}/history`)
    failNext(`/api/visit/${K.a}/prev`)
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    await settle()
    expect(chartsPage()).not.toBeNull()
    expect([...chartsPage()!.querySelectorAll('p.chart-note.is-error')].map((p) => p.textContent)).toEqual(['지금 기록부를 읽지 못했어요', '지금 기록부를 읽지 못했어요'])
    expect(appEl().querySelector('.page.off-page')).toBeNull()
    await wait(5000)
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([2, 2])
    expect(chartsPage()!.querySelector('p.chart-note')).toBeNull()
    expect(chartsPage()!.querySelector('section.chart-today article.paper')).not.toBeNull()
    expect(chartsPage()!.querySelector('section.chart-prev article.paper.past')).not.toBeNull()
  })
})

// ---- 처방 나옴 (AC-3310.1 · 3310.2 · 3310.3) ------------------------------------------------------------

describe('app.js 처방 나옴 알림', () => {
  it('AC-3310.1 · AC-3310.2: 어레인지 탭이 보일 때 처방 칸이 늘면 한 번 알리고 그 줄은 반짝이며 "처방 나옴"이 그 줄의 칸·성함을 누르거나 60초가 지날 때까지 남는다. 직접 넣은 칸은 알리지 않는다', async () => {
    await open({ hash: '#/a' })
    putCell(K.f, 'xray', { at: '11:05' })
    putCell(K.h, 'sono', { at: '11:05', ord: 3 })
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)
    for (const name of ['가상환자26', '가상환자28']) {
      expect(textOf(trOf(name), '.rx-new'), name).toBe('처방 나옴')
      expect(trOf(name).classList.contains('flash'), name).toBe(true)
    }
    expect(appEl().querySelectorAll('.rx-new').length).toBe(2)
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(appEl().querySelectorAll('tr.flash').length).toBe(0)
    expect(appEl().querySelectorAll('.rx-new').length).toBe(2)

    cellOf('가상환자28', 'sono').click()
    expect(trOf('가상환자28').querySelector('.rx-new')).toBeNull()
    await settle()
    expect(trOf('가상환자28').querySelector('.rx-new')).toBeNull()
    expect(textOf(trOf('가상환자26'), '.rx-new')).toBe('처방 나옴')
    await wait(60_000)
    expect(appEl().querySelector('.rx-new')).toBeNull()

    putCell(K.g, 'xray', { manual: true })
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)

    // 기록부 화면이 보여도 알린다
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    await settle()
    putCell(K.e, 'xray', {})
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(2)
  })

  it('AC-3310.3: 처음 열기·다시 보인 뒤 첫 읽기·[접수 현황] 탭이 보일 때는 처방 칸이 늘어도 알리지 않는다. 새 접수 알림(REQ-1408)은 어레인지 탭에서도 그대로다', async () => {
    putCell(K.f, 'xray', {})
    await open({ hash: '#/a' })
    expect(vibrate).not.toHaveBeenCalled()
    tab('접수 현황').click()
    await settle()
    putCell(K.g, 'xray', {})
    await wait(5000)
    expect(vibrate).not.toHaveBeenCalled()
    tab('어레인지').click()
    await settle()
    await wait(5000)
    expect(vibrate).not.toHaveBeenCalled()
    hide()
    putCell(K.h, 'xray', {})
    show()
    await settle()
    expect(arrangePage()).not.toBeNull()
    expect(vibrate).not.toHaveBeenCalled()
    expect(appEl().querySelector('.rx-new')).toBeNull()

    server.board.lists.wait.push(fx.fakeRow({ k: fx.fakeKey(31), name: '가상환자31', chart: '910031', time: '11:06 접수' }))
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

// ---- 숨김 · 끊김 (AC-3312.2) ---------------------------------------------------------------------------

describe('app.js 어레인지 지우기', () => {
  it('AC-3312.2: 화면이 숨겨지면 어레인지 표·고르기 창·되돌리기 띠·처방 나옴 기억을 그 자리에서 지우고, 다시 보이면 #/a 어레인지 탭을 다시 읽는다', async () => {
    await open({ hash: '#/a' })
    putCell(K.f, 'xray', {})
    await wait(5000)
    expect(appEl().querySelector('.rx-new')).not.toBeNull()
    trOf('가상환자22').querySelector<HTMLButtonElement>('button.t-btn')!.click()
    cellOf('가상환자21', 'sono').click()
    expect(appEl().querySelector('.sheet-back')).not.toBeNull()
    expect(appEl().querySelector('.toast')).not.toBeNull()
    hide()
    expectNoPatient()
    expect(window.location.hash).toBe('#/a')
    const before = boardReads()
    show()
    await settle()
    expect(boardReads()).toBe(before + 1)
    expect(arrangePage()).not.toBeNull()
    expect(appEl().querySelector('.sheet-back, .toast, .rx-new')).toBeNull()
  })

  it('AC-3312.2: 기록부(#/a/v/{열쇠})가 숨겨지면 지우고, 다시 보이면 그 기록부를 다시 읽는다. 연결이 끊기면 지우고 돌아오면 어레인지 표다', async () => {
    await open({ hash: `#/a/v/${K.a}` })
    expect(chartsPage()).not.toBeNull()
    hide()
    expectNoPatient()
    expect(window.location.hash).toBe(`#/a/v/${K.a}`)
    show()
    await settle()
    expect(chartsPage()).not.toBeNull()
    expect([reads(K.a, 'history'), reads(K.a, 'prev')]).toEqual([2, 2])

    failNext('/api/board')
    await wait(5000)
    expect(appEl().querySelector('.page.off-page')).not.toBeNull()
    expectNoPatient()
    expect(window.location.hash).toBe('#/a')
    await wait(5000)
    expect(arrangePage()).not.toBeNull()
    expect(chartsPage()).toBeNull()
  })
})

// ---- 어레인지 메모 (reception-memo-papers REQ-3403) ----------------------------------------------------------

describe('app.js 어레인지 메모', () => {
  const KEY = 'reception-memo'
  const INK = 'data:image/png;base64,ZHJhd24='

  beforeEach(() => {
    // jsdom에는 그림 판이 없다: 가짜 getContext·toDataURL
    const ctx = { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, drawImage() {}, save() {}, restore() {} }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => INK)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function memoBox(): HTMLElement | null {
    return appEl().querySelector<HTMLElement>('header.top .memo-box')
  }

  function memoSheet(): HTMLElement | null {
    return document.querySelector<HTMLElement>('body > .sheet-back.memo-back > .sheet.memo-sheet')
  }

  function writeMemo(text: string) {
    memoBox()!.click()
    const area = memoSheet()!.querySelector<HTMLTextAreaElement>('textarea.memo-text')!
    area.value = text
    area.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function stored(): unknown {
    const raw = localStorage.getItem(KEY)
    return raw === null ? null : JSON.parse(raw)
  }

  it('AC-3403.3: 쓴 메모는 이 기기에 저장되어 저절로 다시 읽기(5초)·숨김 뒤 다시 보임·새로 고침(다시 열기)에도 머리 칸에 남고, 도우미로는 보내지 않는다', async () => {
    await open({ hash: '#/a' })
    expect(memoBox()?.className).toBe('memo-box')
    writeMemo('오후 3시 원장님 외출')
    memoSheet()!.querySelector<HTMLButtonElement>('.memo-foot > button.sheet-x')!.click()
    expect(stored()).toEqual({ v: 1, text: '오후 3시 원장님 외출', ink: null })
    expect(textOf(memoBox(), '.memo-prev')).toBe('오후 3시 원장님 외출')
    await wait(5000)
    expect(boardReads()).toBe(2)
    expect(textOf(memoBox(), '.memo-prev')).toBe('오후 3시 원장님 외출')
    hide()
    expect(memoBox()).toBeNull()
    show()
    await settle()
    expect(textOf(memoBox(), '.memo-prev')).toBe('오후 3시 원장님 외출')
    running?.stop()
    await open({ hash: '#/a' })
    expect(textOf(memoBox(), '.memo-prev')).toBe('오후 3시 원장님 외출')
    for (const call of calls) {
      expect(call.url).toMatch(SAME_PC_API)
      expect(call.body ?? '').not.toContain('원장님')
    }
  })

  it('AC-3403.2 · AC-3312.2: 메모 창이 열린 채 숨기면 창의 글을 저장하고 닫아 화면에 아무것도 남지 않고, 다시 보이면 머리 칸에 그 메모가 있다', async () => {
    await open({ hash: '#/a' })
    writeMemo('택배 4시')
    expect(memoSheet()).not.toBeNull()
    hide()
    expect(memoSheet()).toBeNull()
    expectNoPatient()
    expect(stored()).toEqual({ v: 1, text: '택배 4시', ink: null })
    show()
    await settle()
    expect(textOf(memoBox(), '.memo-prev')).toBe('택배 4시')
  })

  it('AC-3403.2 · AC-3312.2: 연결이 끊기면 열린 메모 창을 저장하고 닫고, 돌아오면 어레인지 머리 칸에 그 메모가 있다', async () => {
    await open({ hash: '#/a' })
    writeMemo('ICE팩 7층')
    failNext('/api/board')
    await wait(5000)
    expect(appEl().querySelector('.page.off-page')).not.toBeNull()
    expect(memoSheet()).toBeNull()
    expect(document.querySelector('.sheet-back, .toast')).toBeNull()
    expect(stored()).toEqual({ v: 1, text: 'ICE팩 7층', ink: null })
    await wait(5000)
    expect(arrangePage()).not.toBeNull()
    expect(textOf(memoBox(), '.memo-prev')).toBe('ICE팩 7층')
  })

  it('AC-3403.4: [✕]로 지우면 띠 "메모를 지웠어요"가 판을 다시 그려도 남고, [되돌리기]는 앞 메모를 다시 저장해 머리 칸에 그린다', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, text: '택배 4시', ink: null }))
    await open({ hash: '#/a' })
    memoBox()!.querySelector<HTMLButtonElement>('button.memo-x')!.click()
    expect(stored()).toBeNull()
    expect(memoBox()?.className).toBe('memo-box')
    const band = () => document.querySelector<HTMLElement>('body > .toast.memo-toast')
    expect(textOf(band(), '.toast-text')).toBe('메모를 지웠어요')
    appEl().querySelector<HTMLButtonElement>('header.top button.refresh')!.click()
    await settle()
    expect(boardReads()).toBe(2)
    expect(band()).not.toBeNull()
    band()!.querySelector<HTMLButtonElement>('button.toast-undo')!.click()
    expect(band()).toBeNull()
    expect(stored()).toEqual({ v: 1, text: '택배 4시', ink: null })
    expect(textOf(memoBox(), '.memo-prev')).toBe('택배 4시')
  })

  it('AC-3403.1: 메모 칸은 어레인지 표 머리에만 있다. 접수 현황 탭·기록부(#/a/v/{열쇠}) 화면에는 없다', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, text: '택배 4시', ink: null }))
    await open()
    expect(appEl().querySelector('.page.board')).not.toBeNull()
    expect(document.querySelector('.memo-box')).toBeNull()
    tab('어레인지').click()
    await settle()
    expect(memoBox()).not.toBeNull()
    trOf('가상환자21').querySelector<HTMLButtonElement>('button.nm-btn')!.click()
    await settle()
    expect(chartsPage()).not.toBeNull()
    expect(document.querySelector('.memo-box')).toBeNull()
  })
})
