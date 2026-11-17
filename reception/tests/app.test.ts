// @vitest-environment jsdom
// 잇기 app.js (TASK-23, design.md 10절). jsdom에 index.html을 넣고 app.js를 부른 뒤 가짜 도우미(fixtures.ts fakeServer)에 묻는 가짜 fetch로
// 끝까지 본다: 열기 → 칸 고르기 → 줄 누르기(폰: 해시 길 #/v/{열쇠}, 태블릿: 오른쪽) → 오늘 증상 다시 읽기(AC-1404.8) → X-ray 완료 → 새 접수 알림 →
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

/** 같은 곳 길만: 판·상세·지난 진료기록부·찍음 표시 (AC-1413.2, reception-memo-papers AC-3404.3) */
const SAME_PC_API = /^\/api\/(?:board(?:\?fresh=1)?|visit\/[0-9a-f]{16}\/(?:history|papers)\?from=\d+|xray)$/

/** 지난 진료기록부 글 (reception-memo-papers AC-3404.3~3404.5) */
const PAST_HEADING = '지난 진료기록부'
const PAST_FAILED = '지금 기록부를 읽지 못했어요'

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
  // 로고 그림(GET /api/logo)은 JSON이 아닌 바이트 몸이다 (reception-other-clinic AC-5706.2)
  if (r.raw) return Promise.resolve(new Response(r.raw.bytes, { status: r.status, headers: { 'Content-Type': r.raw.type } }))
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

/** 상세 읽기(GET /api/visit/{k}/history) */
function historyReads(): string[] {
  return urls().filter((u) => u.startsWith('/api/visit/') && u.includes('/history?'))
}

/** 지난 진료기록부 읽기(GET /api/visit/{k}/papers, reception-memo-papers) */
function pastReads(): string[] {
  return urls().filter((u) => u.startsWith('/api/visit/') && u.includes('/papers?'))
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

/**
 * 가짜 판의 환자 글(이름·차트번호·메모·처방·정보의 보이는 조각, AC-1503.2)과 상세 글(지난번 증상·종이 기록부의 사람 칸·특이사항·증상·처방) 모두
 */
function patientTexts(b: FakeBoard = fx.mockupBoard()): string[] {
  const out = new Set<string>()
  // 처방 글(rx)은 목록 줄에 안 보여도(AC-1504.1) 받은 판에 있으니 함께 본다
  for (const row of Object.values(b.lists).flat()) for (const v of [...fx.rowTexts(row), row.rx]) if (v) out.add(v)
  for (let i = 0; i < 5; i += 1) out.add(fx.fakeVisit(i).sym)
  // 지난 진료기록부(reception-memo-papers): 장마다 진료실·증상·상병·처방
  for (let i = 0; i < 5; i += 1) {
    const past = fx.fakePastPaper(i)
    for (const v of [past.room, past.sym, ...past.dx.map((d) => d.name), ...past.rx.map((r) => r.name), ...past.out.map((r) => r.name)]) out.add(v)
  }
  const paper = fx.fakeTreatedPaper('오른쪽 어깨 통증 계속됨')
  for (const v of [paper.res, paper.addr, paper.cel, paper.special, paper.sym, ...paper.dx.map((d) => d.name), ...paper.rx.map((r) => r.name)]) if (v) out.add(v)
  return [...out]
}

/** 머리 메모 상자(AC-1503.1): [이름표 span.memo-label 글, 이름표 뒤 글 마디]. 상자가 없으면 null */
function memoOf(root: ParentNode | null | undefined): [string | null, string] | null {
  const memo = root?.querySelector('.patient > .memo')
  if (!memo) return null
  const text = [...memo.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '')
  return [memo.querySelector(':scope > span.memo-label')?.textContent ?? null, text.join('')]
}

/** 화면 어디에도 환자 글·줄·상세가 없다 */
function expectNoPatient() {
  const text = document.body.textContent ?? ''
  for (const t of patientTexts()) expect(text, `화면에 ${t}`).not.toContain(t)
  expect(document.querySelector('.row, .rows, .patient, .visit, .pane, .paper')).toBeNull()
}

/** 종이 카드 (reception-paper AC-1502.1) */
function paperOf(root: ParentNode | null | undefined): HTMLElement | null {
  return root?.querySelector<HTMLElement>('article.paper') ?? null
}

/** 종이 카드의 오늘 증상 글(줄 바꿈 그대로). 증상 칸이 없거나 비었으면 null */
function paperSym(root: ParentNode | null | undefined): string | null {
  return paperOf(root)?.querySelector('.paper-sym > pre')?.textContent ?? null
}

/** 종이 카드 진료 칸(증상~원외처방 자리)의 칸 제목들 */
function paperHeads(root: ParentNode | null | undefined): string[] {
  return textsOf(paperOf(root) ?? document.createElement('div'), ':scope > .paper-body > .sec > .sec-h')
}

/** 특이사항 n줄 */
function specialLines(n: number): string {
  return Array.from({ length: n }, (_, i) => `가상 특이사항 ${i + 1}`).join('\n')
}

/**
 * jsdom은 모양을 그리지 않는다: 글의 줄마다 perLine()글자씩 접어 센 줄 수 × 20px가 글 높이이고, 접힘(.clamp)이면 보이는 높이는
 * 5줄까지다(detail.test.ts와 같은 흉내). perLine을 바꾸면 화면 폭이 바뀐 것과 같다
 */
function fakeHeights(perLine: () => number = () => Number.POSITIVE_INFINITY) {
  const lines = (node: Element) =>
    (node.textContent ?? '').split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine())), 0)
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: function (this: HTMLElement) { return lines(this) * 20 } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: function (this: HTMLElement) {
      return (this.classList.contains('clamp') ? Math.min(lines(this), 5) : lines(this)) * 20
    },
  })
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
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
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
  it('AC-1407.5 · AC-1502.1 · AC-3404.3: 폰에서 줄을 누르면 #/v/{열쇠}로 상세(종이 진료기록부·지난 진료기록부)가 열리고 옛 [더 보기]는 없으며, [접수 현황]으로 돌아온다. 문서 제목은 늘 "접수 현황"이다', async () => {
    const app = await open()
    tile('진료대기').click()
    rowOf('가상환자02').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    expect(window.location.hash).toBe(`#/v/${fx.fakeKey(2)}`)
    expect(historyReads()).toEqual([`/api/visit/${fx.fakeKey(2)}/history?from=0`])
    expect(pastReads()).toEqual([`/api/visit/${fx.fakeKey(2)}/papers?from=0`])
    const page = detailPage()!
    expect(page).not.toBeNull()
    expect(document.title).toBe(TITLE)
    expect(textOf(page, '.patient .detail-name')).toBe('가상환자02')
    expect(memoOf(page)).toEqual(['메모', '오른쪽 어깨 통증 심해짐'])
    expect(page.querySelector('section.today')).toBeNull()
    expect(textsOf(page, 'main.detail > h2.detail-heading')).toEqual(['오늘 진료기록부', PAST_HEADING])
    const paper = paperOf(page)!
    // 날짜는 기기 날짜, 차트번호·수진자명·재진은 목록 줄, 나머지는 상세 답의 paper
    expect(textOf(paper, '.paper-head .paper-date')).toBe('2026-11-05')
    expect(textsOf(paper, 'dl.kv > dd')).toEqual(['910234', '가상환자02 (F/54)', '720304-*******', '가상시 가상구 예시로 12 (가상맨션 101동 202호)', '—', '010-0000-1234'])
    expect(textOf(paper, '.spc > p.spc-text')).toBe('가상 특이사항: 페니실린 알레르기')
    expect(textsOf(paper, '.visit-line > span')).toEqual(['내원 : 20261105', '1진료실', '국민건강보험(재진)'])
    // 진료대기이고 아직 아무것도 적히지 않았다
    expect(paperHeads(page)).toEqual(['증상 · 상병 · 처방'])
    expect(textOf(paper, '.paper-body .none')).toBe('아직 없어요. 진료가 끝나면 여기에 나와요.')
    // 지난 진료기록부: papers?from=0의 두 장(첫 장만 [지난번]) + [이전 진료기록부 더 보기 ▾]
    expect(page.querySelector('section.visit, ul.rx-list, .visits')).toBeNull()
    expect(textsOf(page, '.past-list > .past-h > strong')).toEqual(['10월 29일', '10월 22일'])
    expect(textsOf(page, '.past-list > .past-h > .last-badge')).toEqual(['지난번'])
    expect(textsOf(page, '.past-list > .past-h > .visit-ago')).toEqual(['7일 전', '14일 전'])
    expect(page.querySelectorAll('.past-list > article.paper.past')).toHaveLength(2)
    expect(textOf(page, '.past-list > article.paper.past .paper-sym pre')).toBe('오른쪽 어깨 통증 조금 줄었음, 밤에 아픔')
    expect(textOf(page, '.past-list > button.more-papers > small')).toBe('34번 더 있어요 · 누를 때마다 3장씩')
    expect(moreButton(page)).toBeNull()
    expect(textOf(page, 'p.end-note')).toContain('모두 37번 왔어요')
    expect(textOf(page, 'a.back')).toBe('접수 현황')

    // [접수 현황]으로 돌아온다: 고른 칸(진료대기) 그대로
    page.querySelector<HTMLAnchorElement>('a.back')!.click()
    await settle()
    expect(window.location.hash).toBe('#/')
    expect(detailPage()).toBeNull()
    expect(textOf(app, 'h2.list-heading')).toBe('진료대기 · 접수한 순서')
    expect(rowNames()).toEqual(['가상환자01', '가상환자02', '가상환자03'])
    expect(document.title).toBe(TITLE)
  })

  it('AC-1404.8 · AC-1502.4 · AC-3404.5: 상세가 열린 동안 그 환자 줄의 칸이 바뀌면 다음 읽기에 상세를 한 번 더 읽어 종이 카드를 새 paper로 바꾼다(지난 종이는 다시 읽지 않고 요소 그대로). 그 뒤 같은 줄이면 다시 읽지 않는다', async () => {
    await open()
    tile('진료대기').click()
    rowOf('가상환자02').querySelector<HTMLAnchorElement>('a.row-main')!.click()
    await settle()
    const page = detailPage()!
    const past = page.querySelector('.past-list')
    expect(past).not.toBeNull()
    expect(paperSym(page)).toBeNull()
    expect(paperHeads(page)).toEqual(['증상 · 상병 · 처방'])

    // 진료를 받고 진료보류로 옮겼다: 오늘 증상이 생겼다
    const moved = (b: FakeBoard): FakeBoard => {
      const row = b.lists.wait[1]!
      return fx.boardOf(
        { wait: b.lists.wait.filter((r) => r.k !== row.k), hold: [...b.lists.hold, { ...row, lane: 'hold', laneLabel: '진료보류', memo: '엑스레이 찍으러 감', waited: '보류 1분째', xray: { at: null } }], pay: b.lists.pay, done: b.lists.done },
        b.at,
      )
    }
    server.board = moved(fx.mockupBoard('13:42:20'))
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(historyReads()).toEqual([`/api/visit/${fx.fakeKey(2)}/history?from=0`, `/api/visit/${fx.fakeKey(2)}/history?from=0`])
    expect(detailPage()).toBe(page)
    expect(textOf(page, '.patient .status-line > .status')).toBe('진료보류')
    expect(memoOf(page)).toEqual(['메모', '엑스레이 찍으러 감'])
    expect(paperSym(page)).toBe('오른쪽 어깨 통증 계속됨')
    expect(paperHeads(page)).toEqual(['증상', '상병', '처방', '원외처방'])
    expect(textsOf(page, 'article.paper:not(.past) ul.dx > li > code')).toEqual(['M7581', 'M5456'])
    expect(page.querySelector('.past-list')).toBe(past)
    expect(pastReads()).toEqual([`/api/visit/${fx.fakeKey(2)}/papers?from=0`])
    expect(document.title).toBe(TITLE)

    server.board = moved(fx.mockupBoard('13:42:30'))
    await wait(5000)
    expect(boardReads().length).toBe(3)
    expect(historyReads().length).toBe(2)
    expect(pastReads().length).toBe(1)
    expect(paperSym(page)).toBe('오른쪽 어깨 통증 계속됨')
  })

  it('AC-1404.8 · AC-1502.4: 칸·오늘 처방이 그대로면 마지막 상세 읽기에서 30초가 지나기 전에는 다시 읽지 않고, 지나면 한 번 읽어 종이 카드를 새 paper로 바꾼다. 오늘 처방 글이 바뀌어도 다시 읽는다', async () => {
    server.syms.set(fx.fakeKey(2), '어깨 아픔 1')
    await open({ hash: `#/v/${fx.fakeKey(2)}` })
    const page = detailPage()!
    expect(paperSym(page)).toBe('어깨 아픔 1')
    expect(historyReads().length).toBe(1)

    server.syms.set(fx.fakeKey(2), '어깨 아픔 2')
    await wait(25000)
    expect(boardReads().length).toBeGreaterThanOrEqual(5)
    expect(historyReads().length).toBe(1)
    expect(paperSym(page)).toBe('어깨 아픔 1')
    await wait(10000)
    expect(historyReads().length).toBe(2)
    expect(paperSym(page)).toBe('어깨 아픔 2')

    // 오늘 처방이 생겼다(칸은 그대로)
    const next = fx.mockupBoard('13:43:00')
    next.lists.wait[1] = { ...next.lists.wait[1]!, rxLabel: '오늘', rx: '체외충격파(ESWT7)' }
    server.board = fx.boardOf({ wait: next.lists.wait, hold: next.lists.hold, pay: next.lists.pay, done: next.lists.done }, '13:43:00')
    server.syms.set(fx.fakeKey(2), '어깨 아픔 3')
    await wait(5000)
    expect(historyReads().length).toBe(3)
    expect(paperSym(page)).toBe('어깨 아픔 3')
    expect(detailPage()).toBe(page)
  })

  it('AC-1404.8 · AC-1502.4: 다시 읽기는 한 번에 하나이고, 실패하면 종이 카드를 그대로 두었다가 다음 읽기에 다시 보며, 기다리는 사이 목록으로 돌아가면 늦은 답을 그리지 않는다', async () => {
    server.syms.set(fx.fakeKey(2), '어깨 아픔 1')
    await open({ hash: `#/v/${fx.fakeKey(2)}` })
    const page = detailPage()!
    server.syms.set(fx.fakeKey(2), '어깨 아픔 2')
    const held = hold(`/api/visit/${fx.fakeKey(2)}/`)
    for (let i = 0; i < 8 && !held.asked(); i += 1) await wait(5000)
    expect(held.asked()).toBe(true)
    expect(historyReads().length).toBe(2)
    // 읽는 중에 다시 그려도(같은 주소의 hashchange) 또 부르지 않는다
    window.dispatchEvent(new Event('hashchange'))
    await settle()
    expect(detailPage()).toBe(page)
    expect(historyReads().length).toBe(2)
    held.fail()
    await settle()
    expect(paperSym(page)).toBe('어깨 아픔 1')
    await wait(5000)
    expect(historyReads().length).toBe(3)
    expect(paperSym(page)).toBe('어깨 아픔 2')

    // 기다리는 사이 [접수 현황]으로 돌아가면 늦은 답은 버린다
    server.syms.set(fx.fakeKey(2), '어깨 아픔 3')
    const late = hold(`/api/visit/${fx.fakeKey(2)}/`)
    for (let i = 0; i < 8 && !late.asked(); i += 1) await wait(5000)
    expect(late.asked()).toBe(true)
    page.querySelector<HTMLAnchorElement>('a.back')!.click()
    await settle()
    late.answer()
    await settle()
    expect(detailPage()).toBeNull()
    expect(document.body.textContent).not.toContain('어깨 아픔 3')
    expect(document.title).toBe(TITLE)
  })

  it('AC-1502.2 · AC-1502.4 · AC-3404.5: 폰 상세의 긴 특이사항은 [전부 보기 ▾]로 펼치고, 저절로 다시 읽어 종이 카드가 새 paper로 바뀌어도 펼친 채다(머리·지난 종이는 다시 읽지 않고 그대로)', async () => {
    fakeHeights()
    server.papers.set(fx.fakeKey(2), fx.fakeTreatedPaper('어깨 아픔 1', { special: specialLines(9) }))
    await open({ hash: `#/v/${fx.fakeKey(2)}` })
    const page = detailPage()!
    const past = page.querySelector('.past-list')
    const cards = [...page.querySelectorAll('.past-list > article.paper.past')]
    expect(cards).toHaveLength(2)
    const more = page.querySelector<HTMLButtonElement>('article.paper .spc > button.spc-more')!
    expect(more.hidden).toBe(false)
    expect(more.textContent).toBe('전부 보기 ▾')
    more.click()
    expect(page.querySelector('.spc > p.spc-text')?.classList.contains('clamp')).toBe(false)

    server.papers.set(fx.fakeKey(2), fx.fakeTreatedPaper('어깨 아픔 2\n둘째 줄', { special: specialLines(11), room: '2진료실' }))
    await wait(35000)
    expect(historyReads().length).toBe(2)
    expect(detailPage()).toBe(page)
    expect(paperSym(page)).toBe('어깨 아픔 2\n둘째 줄')
    expect(textOf(page, 'article.paper .spc > p.spc-text')).toBe(specialLines(11))
    expect(page.querySelector('.spc > p.spc-text')?.classList.contains('clamp')).toBe(false)
    expect(textOf(page, 'article.paper .spc > button.spc-more')).toBe('접기 ▴')
    expect(textsOf(page, 'article.paper:not(.past) .visit-line > span')).toEqual(['내원 : 20261105', '2진료실', '국민건강보험(재진)'])
    expect(page.querySelector('.past-list')).toBe(past)
    expect([...page.querySelectorAll('.past-list > article.paper.past')]).toEqual(cards)
    expect(pastReads().length).toBe(1)
    expect(document.title).toBe(TITLE)
  })

  it('AC-1502.2: 화면 폭이 바뀌면(기기 돌림·창 크기) 특이사항 높이를 다시 재어, 접혀 5줄을 넘게 된 글에도 [전부 보기 ▾]가 생긴다', async () => {
    let perLine = 100
    fakeHeights(() => perLine)
    server.papers.set(fx.fakeKey(2), fx.fakePaper({ special: specialLines(5) }))
    await open({ hash: `#/v/${fx.fakeKey(2)}` })
    const more = () => detailPage()!.querySelector<HTMLButtonElement>('article.paper .spc > button.spc-more')!
    expect(more().hidden).toBe(true)

    // 좁아져(세로로 돌림) 줄마다 둘로 접힌다: 10줄
    perLine = 6
    window.dispatchEvent(new Event('resize'))
    expect(more().hidden).toBe(false)
    expect(more().textContent).toBe('전부 보기 ▾')
    more().click()
    expect(more().textContent).toBe('접기 ▴')

    // 다시 넓어지면 5줄 안이라 단추가 없고 접힌 모양(5줄)으로 돌아간다
    perLine = 100
    window.dispatchEvent(new Event('resize'))
    expect(more().hidden).toBe(true)
    expect(detailPage()!.querySelector('.spc > p.spc-text')?.classList.contains('clamp')).toBe(true)
  })

  it('AC-1407.5 · AC-3404.3: 상세 주소(#/v/{열쇠})로 바로 열어도 그 상세를 읽어 그린다. 그날 판에 없는 열쇠면 목록이다. 신환은 지난 진료기록부 자리에 첫 방문 글이다', async () => {
    await open({ hash: `#/v/${fx.fakeKey(1)}` })
    expect(urls()).toEqual(['/api/board', `/api/visit/${fx.fakeKey(1)}/history?from=0`, `/api/visit/${fx.fakeKey(1)}/papers?from=0`])
    const page = detailPage()!
    expect(textOf(page, '.patient .detail-name')).toBe('가상환자01')
    expect(textOf(page, '.past-list > p.no-visits')).toBe('첫 방문이라 지난 진료가 없어요.')
    expect(page.querySelector('.past-list > button.more-papers')).toBeNull()
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

describe('app.js 지난 진료기록부 여러 장 (reception-memo-papers REQ-3404)', () => {
  const k2 = fx.fakeKey(2)
  const cardsOf = () => [...(detailPage()?.querySelectorAll('.past-list > article.paper.past') ?? [])]
  const moreOf = () => detailPage()?.querySelector<HTMLButtonElement>('.past-list > button.more-papers') ?? null

  it('AC-3404.4: [이전 진료기록부 더 보기 ▾]를 누르면 papers?from=next를 한 번 읽어 아래에 3장을 붙이고, 읽는 중에는 다시 보내지 않는다. 실패하면 "지금 기록부를 읽지 못했어요"와 함께 다시 누를 수 있다', async () => {
    await open({ hash: `#/v/${k2}` })
    expect(pastReads()).toEqual([`/api/visit/${k2}/papers?from=0`])
    expect(cardsOf()).toHaveLength(2)
    const first = cardsOf()[0]

    const held = hold(`/api/visit/${k2}/papers`)
    moreOf()!.click()
    moreOf()!.click()
    await settle()
    moreOf()!.click()
    await settle()
    expect(held.asked()).toBe(true)
    expect(pastReads()).toEqual([`/api/visit/${k2}/papers?from=0`, `/api/visit/${k2}/papers?from=2`])
    held.fail()
    await settle()
    expect(cardsOf()).toHaveLength(2)
    expect(textOf(detailPage(), '.past-list > p.past-note')).toBe(PAST_FAILED)
    expect(moreOf()!.disabled).toBe(false)

    moreOf()!.click()
    await settle()
    expect(pastReads()).toEqual([`/api/visit/${k2}/papers?from=0`, `/api/visit/${k2}/papers?from=2`, `/api/visit/${k2}/papers?from=2`])
    expect(cardsOf()).toHaveLength(5)
    expect(cardsOf()[0]).toBe(first)
    expect(detailPage()!.querySelector('.past-list > p.past-note')).toBeNull()
    expect(textsOf(detailPage()!, '.past-list > .past-h > .last-badge')).toEqual(['지난번'])
    expect(textOf(detailPage(), '.past-list > button.more-papers > small')).toBe('31번 더 있어요 · 누를 때마다 3장씩')
    expect(document.title).toBe(TITLE)
  })

  it('AC-3404.4: 지난 내원이 모두 보이면(끝 쪽) [더 보기]가 사라진다', async () => {
    server.pasts.set(k2, 4)
    await open({ hash: `#/v/${k2}` })
    expect(textOf(detailPage(), '.past-list > button.more-papers > small')).toBe('2번 더 있어요 · 누를 때마다 3장씩')
    moreOf()!.click()
    await settle()
    expect(cardsOf()).toHaveLength(4)
    expect(moreOf()).toBeNull()
  })

  it('AC-3404.5: 지난 종이 첫 읽기가 실패하면 그 자리에 "지금 기록부를 읽지 못했어요" 한 줄이고, 저절로 다시 읽기(목록·오늘 종이)에도 지난 종이는 다시 읽지 않는다', async () => {
    failNext(`/api/visit/${k2}/papers`)
    await open({ hash: `#/v/${k2}` })
    const list = detailPage()!.querySelector('.past-list')!
    expect([...list.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual(['p.past-note'])
    expect(textOf(list, 'p.past-note')).toBe(PAST_FAILED)
    await wait(35000)
    expect(historyReads().length).toBe(2)
    expect(pastReads().length).toBe(1)
    expect(detailPage()!.querySelector('.past-list')).toBe(list)
    expect(textOf(list, 'p.past-note')).toBe(PAST_FAILED)
  })

  it('AC-3404.5 · AC-1407.11: 숨기면 펼친 지난 종이도 그 자리에서 지우고 [더 보기]의 늦은 답을 그리지 않는다. 다시 보이면 상세와 지난 종이 첫 쪽을 다시 읽는다', async () => {
    await open({ hash: `#/v/${k2}` })
    moreOf()!.click()
    await settle()
    expect(cardsOf()).toHaveLength(5)
    const late = hold(`/api/visit/${k2}/papers`)
    moreOf()!.click()
    await settle()
    expect(late.asked()).toBe(true)
    hide('pagehide')
    expectNoPatient()
    late.answer()
    await settle()
    expectNoPatient()
    expect(document.querySelector('.past-list')).toBeNull()

    show('pageshow')
    await settle()
    expect(historyReads()).toEqual([`/api/visit/${k2}/history?from=0`, `/api/visit/${k2}/history?from=0`])
    expect(pastReads().at(-1)).toBe(`/api/visit/${k2}/papers?from=0`)
    expect(cardsOf()).toHaveLength(2)
    expect(document.title).toBe(TITLE)
  })
})

describe('app.js 태블릿 두 칸', () => {
  it('AC-1409.2 · AC-3404.3 · AC-3404.5: 태블릿은 처음에 고른 칸의 첫 줄을 골라 오른쪽에 상세(지난 진료기록부 포함)를 그린다. 줄을 누르면 화면(해시)을 옮기지 않고 오른쪽이 그 환자로 바뀌고, 다시 읽어도 지난 진료·지난 종이는 다시 읽지 않는다', async () => {
    fakeMedia(true)
    const app = await open()
    expect(urls()).toEqual(['/api/board', `/api/visit/${fx.fakeKey(1)}/history?from=0`, `/api/visit/${fx.fakeKey(1)}/papers?from=0`])
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
    expect(pastReads().at(-1)).toBe(`/api/visit/${fx.fakeKey(2)}/papers?from=0`)
    expect(pane()!.querySelector('section.visit')).toBeNull()
    expect(textsOf(pane()!, '.past-list > .past-h > .visit-ago')).toEqual(['7일 전', '14일 전'])
    expect(pane()!.querySelectorAll('.past-list > article.paper.past')).toHaveLength(2)
    expect(moreButton(pane())).toBeNull()
    const past = pane()!.querySelector('.past-list')

    const reads = historyReads().length
    const pastCount = pastReads().length
    server.board = fx.mockupBoard('13:42:20')
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(historyReads().length).toBe(reads)
    expect(pastReads().length).toBe(pastCount)
    expect(textOf(app, 'p.asof')).toBe('13:42:20 기준 · 5초마다 저절로 바뀌어요')
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자02')
    expect(pane()!.querySelector('.past-list')).toBe(past)
    expect(pane()!.querySelectorAll('.past-list > article.paper.past')).toHaveLength(2)

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

  it('AC-1502.2 · AC-1502.4: 태블릿 오른쪽 칸도 종이 카드이고 긴 특이사항에 [전부 보기 ▾]가 있다. 다시 읽기는 오른쪽 종이 카드를 바꾸고(펼침 그대로), 다른 환자를 고른 뒤 온 늦은 답은 버린다', async () => {
    fakeHeights()
    fakeMedia(true)
    server.papers.set(fx.fakeKey(1), fx.fakePaper({ special: specialLines(8) }))
    await open()
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자01')
    expect(paperOf(pane())).not.toBeNull()
    expect(paperHeads(pane())).toEqual(['증상 · 상병 · 처방'])
    const more = pane()!.querySelector<HTMLButtonElement>('article.paper .spc > button.spc-more')!
    expect(more.hidden).toBe(false)
    more.click()
    expect(more.textContent).toBe('접기 ▴')

    // 진료를 받아 수납대기로: 다음 읽기에 종이를 다시 읽는다(펼친 특이사항 그대로)
    const base = fx.mockupBoard('13:42:20')
    const row = { ...base.lists.wait[0]!, waited: '수납 1분째', rxLabel: '오늘', rx: '가상 표층열치료(MM015)' }
    server.board = fx.boardOf({ wait: base.lists.wait.slice(1), hold: base.lists.hold, pay: [row, ...base.lists.pay], done: base.lists.done }, '13:42:20')
    server.papers.set(fx.fakeKey(1), fx.fakeTreatedPaper('가상 진료 끝', { special: specialLines(8) }))
    await wait(5000)
    expect(historyReads().at(-1)).toBe(`/api/visit/${fx.fakeKey(1)}/history?from=0`)
    expect(textOf(pane(), '.patient .status-line > .status')).toBe('수납대기')
    expect(paperSym(pane())).toBe('가상 진료 끝')
    expect(textOf(pane(), 'article.paper .spc > button.spc-more')).toBe('접기 ▴')

    // 다시 읽는 사이 다른 환자를 고르면 늦은 답은 그 환자 칸에 그리지 않는다
    server.papers.set(fx.fakeKey(1), fx.fakeTreatedPaper('늦은 답 증상'))
    const late = hold(`/api/visit/${fx.fakeKey(1)}/`)
    for (let i = 0; i < 8 && !late.asked(); i += 1) await wait(5000)
    expect(late.asked()).toBe(true)
    rowOf('가상환자02').querySelector<HTMLButtonElement>('button.row-main')!.click()
    await settle()
    late.answer()
    await settle()
    expect(textOf(pane(), '.patient .detail-name')).toBe('가상환자02')
    expect(document.body.textContent).not.toContain('늦은 답 증상')
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
  it('AC-1413.2: 열기부터 칸·줄·상세·X-ray 완료·새로 고침·숨김·다시 보임·끊김·돌아옴까지 요청은 모두 같은 곳 /api/…뿐이고 화면 주소도 같은 PC 길뿐이다', async () => {
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
    expect(moreButton(detailPage())).toBeNull()
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
      new Set(['/api/board', '/api/xray', '/api/visit/k/history', '/api/visit/k/papers']),
    )
    expect(titles).toEqual([TITLE, TITLE, TITLE, TITLE])
  })
})

// ---- 다른 병원용 머리 (reception-other-clinic REQ-5708·5709) ---------------------------------------------------

/** 로고 그림 읽기(GET /api/logo) */
function logoReads(): string[] {
  return urls().filter((u) => u === '/api/logo')
}

/** 판 cfg를 바꿔 끼운다(다음 읽기부터) */
function useCfg(cfg: fx.FakeCfg) {
  server.board = fx.withCfg(server.board, cfg)
}

/** 우리 의원 처음 값(로고 그림 ver 1)과 그 그림(PNG) */
function usePicLogo(ver = 1) {
  useCfg({ ...fx.oursCfg(), logo: { mode: 'pic', text: null, ver } })
  server.logo = { type: 'image/png', bytes: fx.fakeLogoPng() }
}

/** 화면의 주소는 같은 PC 길('/…')·'#…'이고, 로고 그림(img.logo·img.logo-mark·img.off-logo)만 data:image/png·jpeg다 (AC-5714.1) */
function expectSamePcOrLogo() {
  for (const node of document.querySelectorAll('[src], [href]')) {
    const value = node.getAttribute('src') ?? node.getAttribute('href') ?? ''
    if (node.matches('img.logo, img.logo-mark, img.off-logo') && value.startsWith('data:'))
      expect(value, node.outerHTML.slice(0, 80)).toMatch(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/)
    else expect(value, node.outerHTML.slice(0, 80)).toMatch(/^(?:\/(?![/\\])|#)/)
  }
}

describe('app.js 로고 (reception-other-clinic AC-5709.1·AC-5708.3)', () => {
  it('AC-5709.1: cfg.logo가 pic이면 GET /api/logo 하나로 받은 그림(data: URL)을 머리에 그리고, ver가 같으면 다시 받지 않는다(5초마다 그림을 받지 않음). ver가 바뀌면 한 번 다시 받는다', async () => {
    usePicLogo(1)
    const app = await open()
    expect(urls()).toEqual(['/api/board', '/api/logo'])
    const src = `data:image/png;base64,${Buffer.from(fx.fakeLogoPng()).toString('base64')}`
    expect(app.querySelector('.page.board header.top > .top-row > img.logo')?.getAttribute('src')).toBe(src)
    await wait(5000)
    await wait(5000)
    expect(boardReads().length).toBe(3)
    expect(logoReads().length).toBe(1)
    expect(app.querySelector('header.top img.logo')?.getAttribute('src')).toBe(src)
    // 설정에서 새 그림을 올림: 판의 ver가 2가 된다
    server.board.cfg.logo.ver = 2
    server.logo = { type: 'image/jpeg', bytes: fx.fakeLogoJpeg() }
    await wait(5000)
    await settle()
    expect(logoReads().length).toBe(2)
    expect(app.querySelector('header.top img.logo')?.getAttribute('src')).toBe(`data:image/jpeg;base64,${Buffer.from(fx.fakeLogoJpeg()).toString('base64')}`)
    await wait(5000)
    expect(logoReads().length).toBe(2)
    expectSamePcOrLogo()
  })

  it('AC-5709.1: 받은 그림은 폰 상세 머리의 작은 로고(img.logo-mark)와 어레인지 탭 머리에도 쓰고 다시 받지 않는다', async () => {
    usePicLogo(1)
    const app = await open()
    window.location.hash = `#/v/${fx.fakeKey(2)}`
    await settle()
    const page = detailPage()!
    expect(page.querySelector('header.top.is-detail > .top-row > img.logo-mark')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    window.location.hash = '#/a'
    await settle()
    expect(app.querySelector('.page.arrange header.top > .top-row > img.logo')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    await wait(5000)
    expect(logoReads().length).toBe(1)
  })

  it('AC-5709.1: 그림 읽기가 실패하면(404·연결 안 됨) 로고 자리 없이 그리고, 같은 ver는 다음 읽기마다 다시 묻지 않는다', async () => {
    usePicLogo(1)
    server.logo = null
    const app = await open()
    expect(logoReads().length).toBe(1)
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(app.querySelector('header.top img, header.top .logo-text')).toBeNull()
    await wait(5000)
    await wait(5000)
    expect(logoReads().length).toBe(1)
  })

  it('AC-5709.1: cfg.logo가 text면 그 글(span.logo-text)이고 none이면 로고 자리가 없다. 둘 다 GET /api/logo를 묻지 않는다', async () => {
    useCfg({ ...fx.freshCfg(), logo: { mode: 'text', text: '가나다정형외과', ver: 0 } })
    const app = await open()
    expect(textOf(app, '.page.board header.top > .top-row > span.logo-text')).toBe('가나다정형외과')
    server.board.cfg.logo = { mode: 'none', text: '가나다정형외과', ver: 0 }
    await wait(5000)
    expect(app.querySelector('header.top .logo-text, header.top img')).toBeNull()
    expect(app.textContent).not.toContain('가나다정형외과')
    expect(logoReads()).toEqual([])
  })

  it('AC-5708.3 · AC-5709.4: 로고 그림은 메모리에만 두고 숨김(wipe)이면 지워 다시 보일 때 한 번 다시 받는다. 브라우저 저장소에는 아무것도 남지 않는다', async () => {
    usePicLogo(1)
    localStorage.clear()
    sessionStorage.clear()
    await open()
    expect(logoReads().length).toBe(1)
    hide()
    expect(appEl().querySelector('img')).toBeNull()
    show()
    await settle()
    expect(logoReads().length).toBe(2)
    expect(appEl().querySelector('header.top img.logo')).not.toBeNull()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('AC-5709.4 · AC-5708.3: 끊기면 끊김 화면에 앞 판의 로고를 그리고(다시 확인 실패에도 그대로), 지우기(wipe)로 메모리의 그림은 비워 돌아온 뒤 한 번 다시 받는다', async () => {
    usePicLogo(1)
    const app = await open()
    failNext()
    await wait(5000)
    expect(textOf(app, '.off-heading')).toBe(OFFLINE)
    expect(app.querySelector('main.off > img.off-logo')?.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expectNoPatient()
    failNext()
    await wait(5000)
    expect(textOf(app, '.off-heading')).toBe(OFFLINE)
    expect(app.querySelector('main.off > img.off-logo')).not.toBeNull()
    expect(logoReads().length).toBe(1)
    await wait(5000)
    await settle()
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(logoReads().length).toBe(2)
    expect(app.querySelector('header.top img.logo')).not.toBeNull()
    expectSamePcOrLogo()
  })
})

describe('app.js [⚙ 설정]·어레인지 탭 끄기 (reception-other-clinic AC-5709.2·AC-5709.3)', () => {
  it('AC-5709.2 · AC-5712.1: 접수 현황·어레인지 두 탭 머리의 [⚙ 설정]을 누르면 설정 쪽(#/s)이 열린다(GET /api/settings로 읽어 제목 "설정"인 설정 쪽을 그림). 저절로 읽기가 와도 설정 쪽 그대로이고 뒤로 가면 그 탭이다', async () => {
    const app = await open()
    app.querySelector<HTMLButtonElement>('.page.board header.top .top-status > button.set-open')!.click()
    await settle()
    expect(window.location.hash).toBe('#/s')
    expect(app.children.length).toBe(1)
    expect(app.querySelector('.page.settings-page')).not.toBeNull()
    expect(urls().filter((u) => u === '/api/settings')).toHaveLength(1)
    expect(textOf(app, '.page.settings-page h1.set-title')).toBe('설정')
    expect(app.querySelector('.page.board, .page.arrange, .page.detail-page')).toBeNull()
    expectNoPatient()
    await wait(5000)
    expect(boardReads().length).toBe(2)
    expect(app.querySelector('.page.settings-page')).not.toBeNull()
    expect(app.querySelector('.page.board')).toBeNull()
    expect(document.title).toBe(TITLE)
    window.location.hash = '#/'
    await settle()
    expect(app.querySelector('.page.board')).not.toBeNull()
    // 어레인지 탭에서도
    window.location.hash = '#/a'
    await settle()
    app.querySelector<HTMLButtonElement>('.page.arrange header.top .top-status > button.set-open')!.click()
    await settle()
    expect(window.location.hash).toBe('#/s')
    expect(app.querySelector('.page.settings-page')).not.toBeNull()
    expect(app.querySelector('.page.arrange')).toBeNull()
  })

  it('AC-5709.2: 설정 주소(#/s)로 바로 열어도 설정 쪽이고, 태블릿·돌림에도 설정 쪽 그대로다', async () => {
    const media = fakeMedia(true)
    const app = await open({ hash: '#/s' })
    expect(app.querySelector('.page.settings-page')).not.toBeNull()
    expect(app.querySelector('.page.board')).toBeNull()
    media.turn(false)
    await settle()
    expect(app.querySelector('.page.settings-page')).not.toBeNull()
    expect(window.location.hash).toBe('#/s')
    expect(historyReads()).toEqual([])
  })

  it('AC-5709.3: cfg.tab이 거짓이면 [어레인지] 탭 단추가 없고 #/a(·#/a/v/{열쇠}) 주소는 [접수 현황](#/)으로 간다', async () => {
    useCfg({ ...fx.freshCfg(), tab: false })
    const app = await open({ hash: '#/a' })
    expect(window.location.hash).toBe('#/')
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(app.querySelector('.page.arrange')).toBeNull()
    expect(textsOf(app, 'header.top > nav.tabs > button.tab')).toEqual(['접수 현황'])
    window.location.hash = `#/a/v/${fx.fakeKey(2)}`
    await settle()
    expect(window.location.hash).toBe('#/')
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(historyReads()).toEqual([])
    // 어레인지 탭을 보던 중에 꺼지면 다음 읽기에 [접수 현황]으로
    server.board.cfg.tab = true
    await wait(5000)
    window.location.hash = '#/a'
    await settle()
    expect(app.querySelector('.page.arrange')).not.toBeNull()
    server.board.cfg.tab = false
    await wait(5000)
    expect(window.location.hash).toBe('#/')
    expect(app.querySelector('.page.board')).not.toBeNull()
    expect(textsOf(app, 'header.top > nav.tabs > button.tab')).toEqual(['접수 현황'])
  })

  it('AC-5714.1: 로고 그림까지 요청은 모두 같은 PC의 /api/…이고, 화면 주소는 같은 PC 길과 로고 data:image URL뿐이다', async () => {
    usePicLogo(1)
    await open()
    window.location.hash = `#/v/${fx.fakeKey(2)}`
    await settle()
    expectSamePcOrLogo()
    window.location.hash = '#/a'
    await settle()
    expectSamePcOrLogo()
    for (const c of calls) {
      expect(c.url, c.url).toMatch(/^\/api\/(?:board(?:\?fresh=1)?|visit\/[0-9a-f]{16}\/(?:history|papers)\?from=\d+|logo)$/)
      expect([c.init.credentials, c.init.mode]).toEqual(['omit', 'same-origin'])
    }
    expect(logoReads().length).toBe(1)
  })
})
