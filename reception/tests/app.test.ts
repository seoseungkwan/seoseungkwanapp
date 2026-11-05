// @vitest-environment jsdom
// 잇기 app.js (TASK-23, design.md 10절). jsdom에 index.html을 넣고 app.js를 부른 뒤 가짜 도우미(fixtures.ts fakeServer)에 묻는 가짜 fetch로
// 끝까지 본다: 열기 → 칸 고르기 → 줄 누르기(폰: 해시 길 #/v/{열쇠}, 태블릿: 오른쪽) → 더 보기 → X-ray 완료 → 새 접수 알림 →
// [새로 고침] → 숨김(읽는 중이어도 늦은 답을 그리지 않음) → 다시 보임 → 끊김 → 돌아옴. 시계는 가짜다. 자료는 가짜다(fixtures.ts)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeBoard, FakeServer } from './fixtures'

interface AppJs {
  app: { stop: () => void } | null
}

// 화면 파일은 빌드 없는 JS라 형 선언이 없다(design.md 결정 '화면은 빌드 없는 JS'). 경로를 값으로 두어 형 검사가 묻지 않게 한다
const APP_JS = '../www/app.js'
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'index.html')

const TITLE = '접수 현황'
const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const LOADING = '불러오는 중이에요'
const OFFLINE = '지금 볼 수 없어요'

/** 같은 곳 길만: 판·상세·찍음 표시 (AC-1413.2) */
const SAME_PC_API = /^\/api\/(?:board(?:\?fresh=1)?|visit\/[0-9a-f]{16}\/history\?from=\d+|xray)$/

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
/** 길 앞부분이 맞는 다음 요청 하나에 대신 답한다(늦은 답·실패 시험) */
let overrides: Array<{ prefix: string; reply: Reply }>
let visibility: DocumentVisibilityState
let vibrate: ReturnType<typeof vi.fn>
let running: AppJs['app'] = null

function respond(call: Call): Promise<Response> {
  const r = server.answer(call.method, call.url, call.body)
  return Promise.resolve(new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }))
}

/** 다음 prefix 요청 하나를 손으로 답한다. fetch는 끊김을 모르는 척한다(늦은 답 시험) */
function hold(prefix: string) {
  let release: (ok: boolean) => void = () => {}
  let asked = false
  overrides.push({
    prefix,
    reply: (call) =>
      new Promise<Response>((resolve, reject) => {
        asked = true
        release = (ok) => (ok ? void respond(call).then(resolve) : reject(new TypeError('Failed to fetch')))
      }),
  })
  return {
    asked: () => asked,
    answer: () => release(true),
    fail: () => release(false),
  }
}

/** 다음 prefix 요청 하나를 연결 실패로 만든다 */
function failNext(prefix = '/api/board') {
  overrides.push({ prefix, reply: () => Promise.reject(new TypeError('Failed to fetch')) })
}

function urls(): string[] {
  return calls.map((c) => c.url)
}

function boardReads(): string[] {
  return urls().filter((u) => u.startsWith('/api/board'))
}

function historyReads(): string[] {
  return urls().filter((u) => u.startsWith('/api/visit/'))
}

/** 바로 끝나는 일과 0초 예약(jsdom 해시 이동은 예약 둘을 거친다)을 다 돌린다. 시계는 1ms 간다 */
async function settle() {
  await vi.advanceTimersByTimeAsync(0)
  await vi.advanceTimersByTimeAsync(1)
}

async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

// ---- 화면 열기 ------------------------------------------------------------------------------------

/** index.html을 그대로 문서에 넣는다(스크립트는 jsdom이 돌리지 않는다. app.js는 시험이 부른다) */
function loadIndex() {
  const parsed = new DOMParser().parseFromString(readFileSync(INDEX_HTML, 'utf8'), 'text/html')
  document.head.replaceChildren(...[...parsed.head.childNodes].map((n) => document.importNode(n, true)))
  document.body.replaceChildren(...[...parsed.body.childNodes].map((n) => document.importNode(n, true)))
}

/** 화면을 연다: index.html → app.js(module). 첫 읽기가 그려질 때까지 돌린다 */
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

/** 가짜 matchMedia: 태블릿 질의 결과와 돌림 */
function fakeMedia(matches: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  const list = {
    matches,
    media: '(min-width: 1000px) and (orientation: landscape)',
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => list)
  return {
    turn(next: boolean) {
      list.matches = next
      for (const fn of [...listeners]) fn({ matches: next })
    },
  }
}

function hide(how: 'visibilitychange' | 'pagehide' = 'visibilitychange') {
  visibility = 'hidden'
  if (how === 'pagehide') window.dispatchEvent(new Event('pagehide'))
  else document.dispatchEvent(new Event('visibilitychange'))
}

function show(how: 'visibilitychange' | 'pageshow' = 'visibilitychange') {
  visibility = 'visible'
  if (how === 'pageshow') window.dispatchEvent(new Event('pageshow'))
  else document.dispatchEvent(new Event('visibilitychange'))
}

// ---- 화면 읽기 ------------------------------------------------------------------------------------

function textOf(root: ParentNode | null | undefined, selector: string): string | null {
  return root?.querySelector(selector)?.textContent?.trim() ?? null
}

function textsOf(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((n) => n.textContent?.trim() ?? '')
}

/** 단추 글(↻ 아이콘 뺌) */
function labelOf(button: Element | null): string {
  if (!button) return ''
  return [...button.childNodes]
    .filter((n) => !(n instanceof Element && n.getAttribute('aria-hidden') === 'true'))
    .map((n) => n.textContent ?? '')
    .join('')
    .trim()
}

function refreshButton(): HTMLButtonElement | null {
  return appEl().querySelector<HTMLButtonElement>('.page.board header.top button.refresh')
}

function tile(label: string): HTMLButtonElement {
  const found = [...appEl().querySelectorAll<HTMLButtonElement>('.tiles > button.tile')].find((b) => textOf(b, '.tile-label') === label)
  if (!found) throw new Error(`칸 ${label} 없음`)
  return found
}

/** 목록 줄(이름으로) */
function rowOf(name: string): HTMLElement {
  const found = [...appEl().querySelectorAll<HTMLElement>('.page.board .rows > .row')].find((r) => textOf(r, '.name') === name)
  if (!found) throw new Error(`줄 ${name} 없음`)
  return found
}

function rowNames(): string[] {
  return textsOf(appEl(), '.page.board .rows > .row .name')
}

function detailPage(): HTMLElement | null {
  return appEl().querySelector('.page.detail-page')
}

function pane(): HTMLElement | null {
  return appEl().querySelector('.page.board > aside.pane')
}

function moreButton(root: ParentNode | null): HTMLButtonElement | null {
  return root?.querySelector<HTMLButtonElement>('button.more') ?? null
}

/** 가짜 판의 환자 글(이름·차트번호·메모·처방·정보) 모두 */
function patientTexts(b: FakeBoard = fx.mockupBoard()): string[] {
  const out = new Set<string>()
  for (const row of Object.values(b.lists).flat()) for (const v of [row.name, row.chart, row.memo, row.rx, row.info]) if (v) out.add(v)
  for (let i = 0; i < 5; i += 1) out.add(fx.fakeVisit(i).sym)
  return [...out]
}

/** 화면 어디에도 환자 글·줄·상세가 없다 */
function expectNoPatient() {
  const text = document.body.textContent ?? ''
  for (const t of patientTexts()) expect(text, `화면에 ${t}`).not.toContain(t)
  expect(document.querySelector('.row, .rows, .patient, .visit, .pane')).toBeNull()
}

/** 화면의 주소는 같은 PC 길('/…')이나 '#…'뿐이다 (AC-1413.2) */
function expectSamePcLinks() {
  for (const node of document.querySelectorAll('[src], [href]')) {
    const value = node.getAttribute('src') ?? node.getAttribute('href') ?? ''
    expect(value, node.outerHTML.slice(0, 80)).toMatch(/^(?:\/(?![/\\])|#)/)
  }
}

// ---- 준비 ------------------------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  // 기기 날짜 = 가짜 오늘(상세 오늘 카드 제목). 기준 시각은 답의 at만 쓴다
  vi.setSystemTime(new Date(2026, 10, 5, 9, 0, 0))
  server = fx.fakeServer()
  calls = []
  overrides = []
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' })
  vibrate = vi.fn(() => true)
  Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: vibrate })
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
  document.head.replaceChildren()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '#')
})

// ---- 시험 -----------------------------------------------------------------------------------------

describe('app.js 열기와 목록 (폰)', () => {
  it('AC-1407.1: index.html을 열면 "불러오는 중이에요" 뒤 GET /api/board 하나로 승인 시안의 목록(머리·진료 순서·칸 넷·줄·아래 글)을 그리고 진료 순서가 골라져 있다', async () => {
    const app = await open()
    expect(urls()).toEqual(['/api/board'])
    expect(document.title).toBe(TITLE)
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(textOf(app, 'header.top .top-title')).toBe('접수 현황')
    expect(textOf(app, 'header.top .conn')).toBe('연결됨')
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')
    expect(labelOf(refreshButton())).toBe('새로 고침')
    const queue = app.querySelector('.picker > button.queue')!
    expect(queue.getAttribute('aria-pressed')).toBe('true')
    expect(textOf(queue, '.queue-label')).toBe('진료 순서 · 대기와 보류 한눈에')
    expect(textOf(queue, '.queue-count')).toBe('5명')
    expect(textsOf(app, '.tiles > button.tile .tile-label')).toEqual(['진료대기', '진료보류', '수납대기', '수납완료'])
    expect(textsOf(app, '.tiles > button.tile .tile-count')).toEqual(['3', '2', '2', '2'])
    expect(textsOf(app, '.tiles > button.tile').map(() => 'x').length).toBe(4)
    expect([...app.querySelectorAll('.tiles > button.tile')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false'])
    expect(textOf(app, 'h2.list-heading')).toBe('진료대기와 진료보류 · 접수한 순서')
    expect(rowNames()).toEqual(['가상환자01', '가상환자04', '가상환자05', '가상환자02', '가상환자03'])
    expect(textOf(app, '.page.board > footer.foot')).toBe(FOOT)
    // 폰: 줄은 상세 링크, 오른쪽 칸 없음
    expect(rowOf('가상환자02').querySelector('a.row-main')?.getAttribute('href')).toBe(`#/v/${fx.fakeKey(2)}`)
    expect(pane()).toBeNull()
  })

  it('AC-1407.3: 답의 every초(지금 5초)마다 다시 읽어 그리고 고른 칸(수납완료)은 그대로다', async () => {
    const app = await open()
    tile('수납완료').click()
    expect(textOf(app, 'h2.list-heading')).toBe('수납완료 환자 · 최근 순')
    expect(rowNames()).toEqual(['가상환자08', '가상환자09'])

    const next = fx.mockupBoard('13:42:20')
    next.lists.done = next.lists.done.slice(0, 1)
    next.counts.done = 1
    server.board = next
    await wait(4998)
    expect(boardReads().length).toBe(1)
    await wait(2)
    expect(boardReads()).toEqual(['/api/board', '/api/board'])
    expect(textOf(app, 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    expect([...app.querySelectorAll('.tiles > button.tile')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true'])
    expect(textOf(app, 'h2.list-heading')).toBe('수납완료 환자 · 최근 순')
    expect(rowNames()).toEqual(['가상환자08'])
    await wait(5000)
    expect(boardReads().length).toBe(3)
  })

  it('AC-1407.3: 진료보류 줄의 [X-ray 완료]를 누르면 POST /api/xray 하나 뒤 바로 다시 읽어 "X-ray 완료 HH:MM"을 그리고 줄 자리는 그대로다. [표시 취소]로 "X-ray 전"이 돌아온다', async () => {
    const app = await open()
    tile('진료보류').click()
    const before = rowOf('가상환자04')
    expect(textOf(before, '.xray .xray-tag')).toBe('X-ray 전')
    expect(textOf(rowOf('가상환자05'), '.xray .xray-tag')).toBe('X-ray 완료 10:55')
    before.querySelector<HTMLButtonElement>('.xray button')!.click()
    await settle()
    const post = calls.find((c) => c.url === '/api/xray')!
    expect(post.method).toBe('POST')
    expect(JSON.parse(post.body ?? '')).toEqual({ k: fx.fakeKey(4), on: true })
    expect(urls()).toEqual(['/api/board', '/api/xray', '/api/board'])
    expect(rowNames()).toEqual(['가상환자04', '가상환자05'])
    expect(textOf(rowOf('가상환자04'), '.xray .xray-tag')).toBe('X-ray 완료 13:43')
    expect(textOf(rowOf('가상환자04'), '.xray button')).toBe('표시 취소')
    expect(textOf(app, 'h2.list-heading')).toBe('진료보류 · 접수한 순서')

    rowOf('가상환자04').querySelector<HTMLButtonElement>('.xray button')!.click()
    await settle()
    expect(JSON.parse(calls.filter((c) => c.url === '/api/xray').at(-1)!.body ?? '')).toEqual({ k: fx.fakeKey(4), on: false })
    expect(textOf(rowOf('가상환자04'), '.xray .xray-tag')).toBe('X-ray 전')
    expect(textOf(rowOf('가상환자04'), '.xray button')).toBe('X-ray 완료')
  })
})

describe('app.js 폰 상세 (해시 길)', () => {
  it('AC-1407.5: 폰에서 줄을 누르면 #/v/{열쇠}로 상세(오늘 카드·지난 진료 5번)가 열리고, [지난 진료 더 보기]로 다음 20번을 이어 붙이고, [접수 현황]으로 돌아온다. 문서 제목은 늘 "접수 현황"이다', async () => {
    const app = await open()
    tile('진료대기').click()
    rowOf('가상환자02').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    expect(window.location.hash).toBe(`#/v/${fx.fakeKey(2)}`)
    expect(historyReads()).toEqual([`/api/visit/${fx.fakeKey(2)}/history?from=0`])
    const page = detailPage()!
    expect(page).not.toBeNull()
    expect(document.title).toBe(TITLE)
    expect(textOf(page, '.patient .detail-name')).toBe('가상환자02')
    expect(textOf(page, '.patient .memo')).toBe('메모 · 오른쪽 어깨 통증 심해짐')
    expect(textOf(page, 'section.today .today-date')).toContain('11월 5일')
    expect(textOf(page, 'section.today .today-state')).toBe('진료 전')
    expect(textsOf(page, '.visits > section.visit .visit-date')).toEqual(['10월 29일', '10월 22일', '10월 15일', '10월 8일', '10월 1일'])
    expect(textOf(page, 'button.more')).toBe('지난 진료 더 보기 · 31번 더 있어요')
    expect(textOf(page, 'p.end-note')).toContain('모두 37번 왔어요')
    expect(textOf(page, 'a.back')).toBe('접수 현황')

    // 5초 뒤 다시 읽으면 오늘 카드와 머리만 바뀌고 지난 진료는 다시 읽지 않는다
    const next = fx.mockupBoard('13:42:20')
    const moved = next.lists.wait[1]!
    next.lists.wait.splice(1, 1)
    next.lists.hold.push({ ...moved, lane: 'hold', laneLabel: '진료보류', memo: '엑스레이 찍으러 감', waited: '보류 1분째', xray: { at: null } })
    server.board = fx.boardOf({ wait: next.lists.wait, hold: next.lists.hold, pay: next.lists.pay, done: next.lists.done }, '13:42:20')
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(historyReads().length).toBe(1)
    expect(detailPage()).toBe(page)
    expect(textOf(page, '.patient .memo')).toBe('메모 · 엑스레이 찍으러 감')
    expect(textOf(page, 'section.today .today-state')).toBe('진료보류')
    expect(page.querySelectorAll('.visits > section.visit').length).toBe(5)
    expect(document.title).toBe(TITLE)

    // [더 보기]: 다음 20번을 이어 붙인다
    moreButton(page)!.click()
    await settle()
    expect(historyReads().at(-1)).toBe(`/api/visit/${fx.fakeKey(2)}/history?from=5`)
    expect(page.querySelectorAll('.visits > section.visit').length).toBe(25)
    expect(textOf(page, 'button.more')).toBe('지난 진료 더 보기 · 11번 더 있어요')
    expect(document.title).toBe(TITLE)

    // [접수 현황]으로 돌아온다: 고른 칸(진료대기) 그대로
    page.querySelector<HTMLAnchorElement>('a.back')!.click()
    await settle()
    expect(window.location.hash).toBe('#/')
    expect(detailPage()).toBeNull()
    expect(textOf(app, 'h2.list-heading')).toBe('진료대기 · 접수한 순서')
    expect(rowNames()).toEqual(['가상환자01', '가상환자03'])
    expect(document.title).toBe(TITLE)
  })

  it('AC-1407.5: 상세 주소(#/v/{열쇠})로 바로 열어도 그 상세를 읽어 그린다. 그날 판에 없는 열쇠면 목록이다. 신환은 첫 방문 글이다', async () => {
    await open({ hash: `#/v/${fx.fakeKey(1)}` })
    expect(urls()).toEqual(['/api/board', `/api/visit/${fx.fakeKey(1)}/history?from=0`])
    const page = detailPage()!
    expect(textOf(page, '.patient .detail-name')).toBe('가상환자01')
    expect(textOf(page, 'p.no-visits')).toBe('첫 방문이라 지난 진료가 없어요.')
    expect(moreButton(page)).toBeNull()
    expect(document.title).toBe(TITLE)

    running?.stop()
    calls = []
    await open({ hash: `#/v/${fx.fakeKey(77)}` })
    expect(urls()).toEqual(['/api/board'])
    expect(detailPage()).toBeNull()
    expect(rowNames().length).toBe(5)
  })

  it('AC-1407.5: 상세를 보던 환자가 그날 판에서 사라지면 목록으로 돌아온다', async () => {
    await open({ hash: `#/v/${fx.fakeKey(3)}` })
    expect(textOf(detailPage(), '.patient .detail-name')).toBe('가상환자03')
    const next = fx.mockupBoard('13:42:20')
    server.board = fx.boardOf({ wait: next.lists.wait.filter((r) => r.k !== fx.fakeKey(3)), hold: next.lists.hold, pay: next.lists.pay, done: next.lists.done }, '13:42:20')
    await wait(5000)
    expect(detailPage()).toBeNull()
    expect(rowNames()).toEqual(['가상환자01', '가상환자04', '가상환자05', '가상환자02'])
    expect(window.location.hash).not.toContain(fx.fakeKey(3))
  })
})

describe('app.js 태블릿 두 칸', () => {
  it('AC-1409.2: 태블릿은 처음에 고른 칸의 첫 줄을 골라 오른쪽에 상세를 그린다. 줄을 누르면 화면(해시)을 옮기지 않고 오른쪽이 그 환자로 바뀌고, 다시 읽어도 지난 진료는 다시 읽지 않는다', async () => {
    fakeMedia(true)
    const app = await open()
    expect(urls()).toEqual(['/api/board', `/api/visit/${fx.fakeKey(1)}/history?from=0`])
    expect(app.querySelector('.page.board > aside.pane')).not.toBeNull()
    expect(rowOf('가상환자01').classList.contains('is-picked')).toBe(true)
    expect(rowOf('가상환자01').querySelector('button.row-main')?.getAttribute('aria-pressed')).toBe('true')
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자01')
    expect(textOf(pane(), 'p.pane-foot')).toBe(FOOT)

    rowOf('가상환자02').querySelector<HTMLButtonElement>('button.row-main')!.click()
    await settle()
    expect(window.location.hash).toBe('')
    expect(detailPage()).toBeNull()
    expect(historyReads().at(-1)).toBe(`/api/visit/${fx.fakeKey(2)}/history?from=0`)
    expect(rowOf('가상환자02').classList.contains('is-picked')).toBe(true)
    expect(rowOf('가상환자01').classList.contains('is-picked')).toBe(false)
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자02')
    expect(pane()!.querySelectorAll('.visits > section.visit').length).toBe(5)

    moreButton(pane())!.click()
    await settle()
    expect(historyReads().at(-1)).toBe(`/api/visit/${fx.fakeKey(2)}/history?from=5`)
    expect(pane()!.querySelectorAll('.visits > section.visit').length).toBe(25)

    const reads = historyReads().length
    server.board = fx.mockupBoard('13:42:20')
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(historyReads().length).toBe(reads)
    expect(textOf(app, 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자02')
    expect(pane()!.querySelectorAll('.visits > section.visit').length).toBe(25)

    // 칸을 바꿔도 고른 환자 그대로
    tile('수납대기').click()
    await settle()
    expect(textOf(app, 'h2.list-heading')).toBe('수납대기 · 접수한 순서')
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자02')
    expect(historyReads().length).toBe(reads)
    expect(document.title).toBe(TITLE)
  })

  it('AC-1409.2: 태블릿에서 고른 칸에 줄이 없으면 오른쪽은 비어 있고(새 글 없음), 줄이 생기면 그 칸의 첫 줄을 고른다', async () => {
    fakeMedia(true)
    server.board = fx.boardOf({}, '13:40:00')
    await open()
    expect(urls()).toEqual(['/api/board'])
    expect(pane()).not.toBeNull()
    expect(pane()!.querySelector('.patient')).toBeNull()
    expect(textsOf(pane()!, ':scope > *')).toEqual([FOOT])

    server.board = fx.mockupBoard('13:40:10')
    await wait(5000)
    expect(historyReads()).toEqual([`/api/visit/${fx.fakeKey(1)}/history?from=0`])
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자01')
  })

  it('AC-1409.2 (돌림 AC-1409.5): 기기를 돌려도 고른 환자 그대로다: 태블릿 오른쪽 → 폰 상세(#/v/{열쇠}) → 다시 태블릿 오른쪽', async () => {
    const media = fakeMedia(true)
    await open()
    rowOf('가상환자03').querySelector<HTMLButtonElement>('button.row-main')!.click()
    await settle()
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자03')

    media.turn(false)
    await settle()
    expect(window.location.hash).toBe(`#/v/${fx.fakeKey(3)}`)
    expect(pane()).toBeNull()
    expect(textOf(detailPage(), '.patient .detail-name')).toBe('가상환자03')

    media.turn(true)
    await settle()
    expect(detailPage()).toBeNull()
    expect(window.location.hash).not.toContain(fx.fakeKey(3))
    expect(rowOf('가상환자03').classList.contains('is-picked')).toBe(true)
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자03')
    expect(document.title).toBe(TITLE)
  })
})

describe('app.js [새로 고침]', () => {
  it('AC-1407.10: [새로 고침]을 누르면 GET /api/board?fresh=1 하나를 읽는 동안 "읽는 중…"(disabled)이고 더 눌러도 요청이 늘지 않는다. 끝나면 기준 시각이 답의 at으로 바뀌고 다음 저절로 읽기는 그때부터 every초(5초) 뒤다', async () => {
    const app = await open()
    await wait(3000)
    server.board = fx.mockupBoard('13:42:14')
    const fresh = hold('/api/board?fresh=1')
    refreshButton()!.click()
    await settle()
    expect(fresh.asked()).toBe(true)
    expect(refreshButton()!.disabled).toBe(true)
    expect(labelOf(refreshButton())).toBe('읽는 중…')
    refreshButton()!.click()
    refreshButton()!.click()
    await wait(2000)
    expect(boardReads()).toEqual(['/api/board', '/api/board?fresh=1'])
    expect(textOf(app, 'p.asof')).toBe('13:42:10 기준 · 5초마다 저절로 바뀌어요')

    fresh.answer()
    await settle()
    expect(refreshButton()!.disabled).toBe(false)
    expect(labelOf(refreshButton())).toBe('새로 고침')
    expect(textOf(app, 'p.asof')).toBe('13:42:14 기준 · 5초마다 저절로 바뀌어요')
    await wait(4997)
    expect(boardReads().length).toBe(2)
    await wait(3)
    expect(boardReads()).toEqual(['/api/board', '/api/board?fresh=1', '/api/board'])
  })

  it('AC-1407.10: 저절로 읽기가 도는 중에 누르면 그것이 끝난 뒤 바로 fresh 읽기를 한 번 한다. 그 읽기가 실패하면 끊김 화면이고 거기에는 [새로 고침]이 없다', async () => {
    await open()
    const plain = hold('/api/board')
    await wait(5000)
    expect(plain.asked()).toBe(true)
    refreshButton()!.click()
    await settle()
    expect(boardReads()).toEqual(['/api/board', '/api/board'])
    expect(labelOf(refreshButton())).toBe('읽는 중…')
    const fresh = hold('/api/board?fresh=1')
    server.board = fx.mockupBoard('13:42:20')
    plain.answer()
    await settle()
    expect(boardReads()).toEqual(['/api/board', '/api/board', '/api/board?fresh=1'])
    // 도는 읽기는 그렸지만 fresh 읽기가 남아 단추는 아직 "읽는 중…"이다
    expect(textOf(appEl(), 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    expect(refreshButton()!.disabled).toBe(true)
    expect(labelOf(refreshButton())).toBe('읽는 중…')
    fresh.fail()
    await settle()
    expect(textOf(appEl(), '.off-heading')).toBe(OFFLINE)
    expect(appEl().querySelector('button')).toBeNull()
    expectNoPatient()
  })
})

describe('app.js 새 접수 알림', () => {
  it('AC-1408.1: 앞에 없던 열쇠가 오면 한 번 알린다(새 접수가 여럿이어도 한 번). 칸만 옮긴 환자와 처음 읽기·끊김 뒤·다시 보인 뒤 첫 읽기는 알리지 않는다', async () => {
    await open()
    expect(vibrate).not.toHaveBeenCalled()

    // 칸만 옮김(진료대기 → 수납대기): 열쇠가 같아 알리지 않는다
    const base = fx.mockupBoard('13:42:20')
    const movedRow = base.lists.wait[2]!
    server.board = fx.boardOf({ wait: base.lists.wait.slice(0, 2), hold: base.lists.hold, pay: [...base.lists.pay, movedRow], done: base.lists.done }, '13:42:20')
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(vibrate).not.toHaveBeenCalled()

    // 새 접수 둘: 한 번만
    const fresh1 = fx.fakeRow({ k: fx.fakeKey(10), chart: '910111', name: '가상환자10', time: '13:41 접수', waited: '방금 접수' })
    const fresh2 = fx.fakeRow({ k: fx.fakeKey(11), chart: '910112', name: '가상환자11', time: '13:42 접수', waited: '방금 접수' })
    server.board = fx.boardOf({ wait: [...base.lists.wait.slice(0, 2), fresh1, fresh2], hold: base.lists.hold, pay: [...base.lists.pay, movedRow], done: base.lists.done }, '13:42:30')
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenLastCalledWith([200, 100, 200])
    expect(rowNames()).toContain('가상환자10')
    await wait(5000)
    expect(vibrate).toHaveBeenCalledTimes(1)

    // 끊김 뒤 첫 읽기: 새 열쇠가 있어도 알리지 않는다
    failNext()
    await wait(5000)
    expect(textOf(appEl(), '.off-heading')).toBe(OFFLINE)
    const fresh3 = fx.fakeRow({ k: fx.fakeKey(12), chart: '910113', name: '가상환자12', time: '13:43 접수' })
    server.board = fx.boardOf({ wait: [fresh3], hold: [], pay: [], done: [] }, '13:43:00')
    await wait(5000)
    expect(rowNames()).toEqual(['가상환자12'])
    expect(vibrate).toHaveBeenCalledTimes(1)

    // 숨겼다 다시 보인 뒤 첫 읽기도 알리지 않는다
    hide()
    const fresh4 = fx.fakeRow({ k: fx.fakeKey(13), chart: '910114', name: '가상환자13', time: '13:44 접수' })
    server.board = fx.boardOf({ wait: [fresh3, fresh4] }, '13:44:00')
    show()
    await settle()
    expect(rowNames()).toEqual(['가상환자12', '가상환자13'])
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})

describe('app.js 끊김', () => {
  it('AC-1407.4: 읽기에 처음 실패하면 그 자리에서 환자 줄·상세를 모두 지우고 연결 끊김 화면("마지막 연결 HH:MM")을 보인다. 마지막으로 받은 every초(5초) 뒤 다시 읽어 성공하면 목록으로 돌아온다(폰 상세를 보던 중이어도 목록)', async () => {
    const app = await open({ hash: `#/v/${fx.fakeKey(2)}` })
    expect(detailPage()).not.toBeNull()
    failNext()
    await wait(5000)
    expect(textOf(app, '.off-heading')).toBe(OFFLINE)
    expect(textOf(app, '.off-status')).toBe('5초마다 다시 확인하는 중 · 마지막 연결 13:42')
    expect(refreshButton()).toBeNull()
    expectNoPatient()
    expect(document.title).toBe(TITLE)

    await wait(5000)
    expect(boardReads().length).toBe(3)
    expect(detailPage()).toBeNull()
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(rowNames().length).toBe(5)
    expect(historyReads().length).toBe(1)
  })
})

describe('app.js 숨김·다시 보임', () => {
  it('AC-1407.11: 숨기면(visibilitychange hidden) 그 자리에서 환자 글이 사라지고 고리가 멈춘다. 읽는 중에 숨겨도 늦은 답을 그리지 않고 다음 읽기도 없다', async () => {
    await open()
    const late = hold('/api/board')
    await wait(5000)
    expect(late.asked()).toBe(true)
    hide()
    expect(textOf(appEl(), '.off-lead')).toBe(LOADING)
    expectNoPatient()
    late.answer()
    await settle()
    expectNoPatient()
    await wait(60000)
    expect(boardReads().length).toBe(2)
    expect(document.title).toBe(TITLE)
  })

  it('AC-1407.11: [새로 고침] 읽기·상세 읽기 중에 숨겨도(pagehide) 늦은 답을 그리지 않고 기다리던 fresh 읽기와 예약도 없앤다', async () => {
    // 상세 읽기 중에 숨김
    await open()
    const history = hold('/api/visit/')
    rowOf('가상환자02').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    expect(history.asked()).toBe(true)
    hide('pagehide')
    history.answer()
    await settle()
    expectNoPatient()
    expect(detailPage()).toBeNull()

    // [새로 고침] 읽기 중에 숨김(도는 읽기 뒤 기다리던 fresh도 없앤다)
    show('pageshow')
    await settle()
    expect(textOf(detailPage(), '.patient .detail-name')).toBe('가상환자02')
    window.location.hash = '#/'
    await settle()
    expect(detailPage()).toBeNull()
    const plain = hold('/api/board')
    await wait(5000)
    expect(plain.asked()).toBe(true)
    const before = boardReads().length
    refreshButton()!.click()
    expect(labelOf(refreshButton())).toBe('읽는 중…')
    hide('pagehide')
    plain.answer()
    await settle()
    await wait(60000)
    expect(boardReads().length).toBe(before)
    expectNoPatient()
  })

  it('AC-1407.11: 다시 보이면(visible·pageshow) "불러오는 중이에요"에서 바로 한 번 읽어 목록(고른 칸 그대로)을, 폰 상세 주소면 그 상세를 다시 읽어 그린다. 실패하면 끊김 화면이다', async () => {
    const app = await open()
    tile('수납대기').click()
    hide()
    expect(textOf(app, '.off-lead')).toBe(LOADING)
    const reads = boardReads().length
    const slow = hold('/api/board')
    show()
    expect(textOf(app, '.off-lead')).toBe(LOADING)
    expectNoPatient()
    await settle()
    expect(boardReads().length).toBe(reads + 1)
    slow.answer()
    await settle()
    expect(textOf(app, 'h2.list-heading')).toBe('수납대기 · 접수한 순서')
    expect(rowNames()).toEqual(['가상환자06', '가상환자07'])

    // 폰 상세 주소: 다시 보이면 그 상세를 다시 읽는다
    rowOf('가상환자07').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    expect(textOf(detailPage(), '.patient .detail-name')).toBe('가상환자07')
    hide('pagehide')
    expectNoPatient()
    show('pageshow')
    await settle()
    expect(historyReads()).toEqual([`/api/visit/${fx.fakeKey(7)}/history?from=0`, `/api/visit/${fx.fakeKey(7)}/history?from=0`])
    expect(textOf(detailPage(), '.patient .detail-name')).toBe('가상환자07')
    expect(window.location.hash).toBe(`#/v/${fx.fakeKey(7)}`)

    // 다시 보인 뒤 첫 읽기가 실패하면 끊김 화면
    hide()
    failNext()
    show()
    await settle()
    expect(textOf(app, '.off-heading')).toBe(OFFLINE)
    expectNoPatient()
    expect(document.title).toBe(TITLE)
  })
})

describe('app.js 같은 곳만 (끝까지)', () => {
  it('AC-1413.2: 열기부터 칸·줄·더 보기·X-ray 완료·새로 고침·숨김·다시 보임·끊김·돌아옴까지 요청은 모두 같은 곳 /api/…뿐이고 화면 주소도 같은 PC 길뿐이다', async () => {
    const titles: string[] = []
    const app = await open()
    titles.push(document.title)
    expectSamePcLinks()
    tile('진료보류').click()
    rowOf('가상환자04').querySelector<HTMLButtonElement>('.xray button')!.click()
    await settle()
    rowOf('가상환자04').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    expectSamePcLinks()
    moreButton(detailPage())!.click()
    await settle()
    titles.push(document.title)
    detailPage()!.querySelector<HTMLAnchorElement>('a.back')!.click()
    await settle()
    refreshButton()!.click()
    await settle()
    hide()
    show('pageshow')
    await settle()
    failNext()
    await wait(5000)
    titles.push(document.title)
    expectSamePcLinks()
    await wait(5000)
    expect(app.querySelector('.page.board')).not.toBeNull()
    titles.push(document.title)

    expect(calls.length).toBeGreaterThanOrEqual(8)
    for (const c of calls) {
      expect(c.url, c.url).toMatch(SAME_PC_API)
      expect(c.init.credentials).toBe('omit')
    }
    expect(new Set(urls().map((u) => u.split('?')[0]!.replace(/[0-9a-f]{16}/, 'k')))).toEqual(
      new Set(['/api/board', '/api/xray', '/api/visit/k/history']),
    )
    expect(titles).toEqual([TITLE, TITLE, TITLE, TITLE])
  })
})
