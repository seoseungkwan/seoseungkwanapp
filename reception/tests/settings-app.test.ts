// @vitest-environment jsdom
// 설정 쪽 잇기 app.js (reception-other-clinic TASK-7, REQ-5712·5713, design.md 3·5절). jsdom에 index.html을 넣고 app.js를 부른 뒤
// 가짜 도우미(fixtures.ts fakeServer·settingsServer)에 묻는 가짜 fetch로 끝까지 본다: #/s 들어가기·돌아가기, GET /api/settings 한 번,
// 바로 저장(rev·X-Reception)과 미리 그리기, [되돌리기] 5초 한 번, 409·실패, 로고 그림 올리기(가짜 canvas), 처음 설정 안내,
// 칸 고치기·칸 더하기·이 칸 빼기, 숨김 지우기, 같은 PC 길. 시계는 가짜다. 자료는 가짜다(fixtures.ts)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fx from './fixtures'
import type { FakeServer, FakeSettings } from './fixtures'

interface AppJs {
  app: { stop: () => void } | null
}

const APP_JS = '../www/app.js'
const INDEX_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'www', 'index.html')

const LOADING = '불러오는 중이에요'
const LOGO_TOAST = '로고를 바꿨어요 · 모든 폰·태블릿에 바로 보여요'
const TAB_ON = '어레인지 탭을 켰어요 · 모든 폰·태블릿에 바로 보여요'
const TAB_OFF = '어레인지 탭을 껐어요 · 모든 폰·태블릿에 바로 보여요'
const CONFLICT = '다른 기기에서 설정을 바꿨어요 · 다시 해 주세요'
const SAVE_FAILED = '설정을 저장하지 못했어요'
const BIG = '그림 파일이 너무 커요 · 20MB보다 작은 그림을 골라요'
const LOGO_FAILED = '로고를 올리지 못했어요'
const READ_FAILED = '설정을 읽지 못했어요'
const DIRECT_ADDED = "넣었어요 · 목록 맨 위 '직접 넣은 코드'에 있어요"
/** 시안 판의 환자 이름 (가상환자21~30) */
const NAMES = Array.from({ length: 10 }, (_, i) => `가상환자${21 + i}`)

/** 같은 곳 길만(AC-1413.2 · AC-5714.1): 판·어레인지·설정·지난 30일 처방·코드 이름·로고. 설정 길에는 물음표 글(?…)이 붙지 않는다 */
const SAME_PC_API = /^\/api\/(?:board(?:\?fresh=1)?|visit\/[0-9a-f]{16}\/(?:history\?from=\d+|prev|papers\?from=\d+)|xray|arrange|settings|codes|code\/[0-9A-Z가-힣_%]{1,64}|logo)$/

// ---- 가짜 도우미 ------------------------------------------------------------------------------------

interface Call {
  url: string
  method: string
  body: string | null
  bytes: Uint8Array | null
  init: RequestInit
}

type Reply = (call: Call) => Promise<Response>

let server: FakeServer
let calls: Call[]
let overrides: Array<{ prefix: string; method: string | null; reply: Reply }>
let visibility: DocumentVisibilityState
let running: AppJs['app'] = null

function respond(call: Call): Promise<Response> {
  const type = new Headers(call.init.headers).get('Content-Type') ?? ''
  const r = server.answer(call.method, call.url, call.body, call.bytes ? { type, bytes: call.bytes } : undefined)
  if (r.raw) return Promise.resolve(new Response(r.raw.bytes, { status: r.status, headers: { 'Content-Type': r.raw.type } }))
  return Promise.resolve(new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status }))
}

/** 다음 method prefix 요청 하나를 손으로 답한다 */
function hold(prefix: string, method: string | null = null) {
  let release: () => void = () => {}
  overrides.push({
    prefix,
    method,
    reply: (call) =>
      new Promise<Response>((resolve) => {
        release = () => void respond(call).then(resolve)
      }),
  })
  return { answer: () => release() }
}

function statusNext(prefix: string, status: number, method: string | null = null) {
  overrides.push({ prefix, method, reply: () => Promise.resolve(new Response(null, { status })) })
}

function failNext(prefix: string, method: string | null = null) {
  overrides.push({ prefix, method, reply: () => Promise.reject(new TypeError('Failed to fetch')) })
}

function urls(): string[] {
  return calls.map((c) => c.url)
}

function boardReads(): number {
  return urls().filter((u) => u.startsWith('/api/board')).length
}

function settingsReads(): number {
  return calls.filter((c) => c.url === '/api/settings' && c.method === 'GET').length
}

function codesReads(): number {
  return urls().filter((u) => u === '/api/codes').length
}

/** 보낸 설정 쓰기 몸들 */
function settingsWrites(): FakeSettings[] {
  return calls.filter((c) => c.url === '/api/settings' && c.method === 'POST').map((c) => JSON.parse(c.body ?? 'null') as FakeSettings)
}

function lastWrite(): Call {
  return calls.filter((c) => c.url === '/api/settings' && c.method === 'POST').at(-1)!
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

function textsOf(root: ParentNode | null | undefined, selector: string): string[] {
  return [...(root?.querySelectorAll(selector) ?? [])].map((n) => n.textContent?.trim() ?? '')
}

function ownText(node: Element | null | undefined): string {
  return [...(node?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('')
}

function settingsPage(): HTMLElement | null {
  return appEl().querySelector('.page.settings-page')
}

function button(root: ParentNode, selector: string, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>(selector)].find((b) => (ownText(b) || b.textContent?.trim()) === label)
  if (!found) throw new Error(`단추 ${label} 없음`)
  return found
}

function colRow(name: string): HTMLElement {
  const found = [...appEl().querySelectorAll<HTMLElement>('ul.col-list > li.col-row')].find((li) => textOf(li, '.col-name') === name)
  if (!found) throw new Error(`칸 줄 ${name} 없음`)
  return found
}

function colNames(): string[] {
  return textsOf(appEl(), 'ul.col-list > li.col-row .col-name')
}

function tabSwitch(): HTMLButtonElement {
  return appEl().querySelector<HTMLButtonElement>('.tab-card button.switch')!
}

function sheetOf(): HTMLElement | null {
  return appEl().querySelector<HTMLElement>('.sheet-back.list-back > .sheet.col-sheet')
}

function sheetGo(): HTMLButtonElement {
  return sheetOf()!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.go')!
}

function rxRow(code: string): HTMLElement {
  const found = [...sheetOf()!.querySelectorAll<HTMLElement>('ul.rx-list > li.rx-row')].find((li) => li.querySelector('code')?.textContent === code)
  if (!found) throw new Error(`처방 줄 ${code} 없음`)
  return found
}

function typeIn(input: HTMLInputElement, text: string) {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function toastText(): string | null {
  return textOf(appEl(), '.toast .toast-text')
}

function undoButton(): HTMLButtonElement | null {
  return appEl().querySelector('.toast button.toast-undo')
}

function expectSamePc() {
  for (const c of calls) {
    expect(c.url, c.url).toMatch(SAME_PC_API)
    expect([c.init.credentials, c.init.mode], c.url).toEqual(['omit', 'same-origin'])
    if (c.method === 'POST') expect(new Headers(c.init.headers).get('X-Reception'), c.url).toBe('1')
  }
}

/** 화면 어디에도 환자 글·설정 쪽·창·띠가 없다 */
function expectWiped() {
  const text = document.body.textContent ?? ''
  for (const name of NAMES) expect(text, `화면에 ${name}`).not.toContain(name)
  expect(document.querySelector('.page.settings-page, .page.arrange, .sheet-back, .toast, .set-card')).toBeNull()
}

/** 가짜 그림 열기·canvas (settings.test.ts와 같은 모양): 만든 파일은 size바이트 */
function fakeCanvas(width = 2400, height = 600, size = 1000) {
  const open = vi.fn(() => Promise.resolve({ width, height, close: vi.fn() }))
  vi.stubGlobal('createImageBitmap', open)
  const ctx = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done: BlobCallback, type?: string) => {
    const bytes = new Uint8Array(size)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    done(new Blob([bytes], { type }))
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation((type?: string) => `data:${type};base64,iVBORw0KGgo=`)
  return { open }
}

/** 로고 고르기 input에 파일 하나를 고른다(그림 고르기 창은 열지 않는다) */
function chooseFile(file: File) {
  const input = appEl().querySelector<HTMLInputElement>('.logo-card > input.logo-file')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
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
  Object.defineProperty(window, 'scrollTo', { configurable: true, writable: true, value: vi.fn() })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) => {
      const raw = init?.body
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof raw === 'string' ? raw : null,
        bytes: raw instanceof Uint8Array ? Uint8Array.from(raw) : raw instanceof ArrayBuffer ? new Uint8Array(raw) : null,
        init: init ?? {},
      }
      calls.push(call)
      const i = overrides.findIndex((o) => call.url.startsWith(o.prefix) && (o.method === null || o.method === call.method))
      if (i >= 0) return overrides.splice(i, 1)[0]!.reply(call)
      return respond(call)
    }),
  )
})

afterEach(() => {
  running?.stop()
  running = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'visibilityState')
  Reflect.deleteProperty(document, 'hidden')
  Reflect.deleteProperty(window, 'scrollTo')
  document.head.replaceChildren()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '#')
  localStorage.clear()
})

// ---- 들어가기 · 돌아가기 (AC-5712.1) -------------------------------------------------------------------

describe('app.js 설정 쪽 열기', () => {
  it('AC-5712.1: 어레인지 탭의 [⚙ 설정]은 #/s에서 GET /api/settings를 한 번 읽어 설정 쪽을 그리고 머리는 [‹ 어레인지]다. 저절로 읽기에도 다시 읽지 않고, [‹ 어레인지]는 표로, 접수 현황 탭에서 들어오면 [‹ 접수 현황]이다', async () => {
    const app = await open({ hash: '#/a' })
    app.querySelector<HTMLButtonElement>('.page.arrange header.top button.set-open')!.click()
    await settle()
    expect(window.location.hash).toBe('#/s')
    expect(app.children.length).toBe(1)
    expect(settingsPage()).not.toBeNull()
    expect(settingsReads()).toBe(1)
    expect(textOf(app, '.settings-page h1.set-title')).toBe('설정')
    const back = app.querySelector<HTMLAnchorElement>('.settings-page header a.back')!
    expect([back.getAttribute('href'), back.textContent]).toEqual(['#/a', '어레인지'])
    expect(colNames()).toEqual(['X-RAY', 'SONO', 'C-ARM', 'PT', '도수', '충격파', '견인'])
    expect(app.querySelector('.set-guide')).toBeNull()
    // 판은 설정 쪽에서도 5초마다 저절로 읽는다(처음 읽기 1 + 5초 뒤 1). 설정은 다시 읽지 않는다
    await wait(5000)
    expect(boardReads()).toBe(2)
    expect(settingsReads()).toBe(1)
    expect(settingsPage()).not.toBeNull()
    back.click()
    await settle()
    expect(window.location.hash).toBe('#/a')
    expect(app.querySelector('.page.arrange')).not.toBeNull()
    expect(settingsPage()).toBeNull()
    // 접수 현황 탭에서 들어가면 [‹ 접수 현황]이고 다시 들어갈 때마다 다시 읽는다
    window.location.hash = '#/'
    await settle()
    app.querySelector<HTMLButtonElement>('.page.board header.top button.set-open')!.click()
    await settle()
    expect(settingsReads()).toBe(2)
    const again = app.querySelector<HTMLAnchorElement>('.settings-page header a.back')!
    expect([again.getAttribute('href'), again.textContent]).toEqual(['#/', '접수 현황'])
    again.click()
    await settle()
    expect(app.querySelector('.page.board')).not.toBeNull()
    expectSamePc()
  })

  it('AC-5712.1: 설정을 읽지 못하면 "설정을 읽지 못했어요" 한 줄과 [다시 읽기]이고, [다시 읽기]는 GET /api/settings를 다시 읽어 그린다', async () => {
    statusNext('/api/settings', 503)
    const app = await open({ hash: '#/s' })
    expect(textOf(app, '.settings-page main > .set-fail > .set-fail-t')).toBe(READ_FAILED)
    expect(app.querySelector('.set-card')).toBeNull()
    await wait(5000)
    expect(settingsReads()).toBe(1)
    button(app, '.set-fail > button', '다시 읽기').click()
    await settle()
    expect(settingsReads()).toBe(2)
    expect(app.querySelector('.set-fail')).toBeNull()
    expect(colNames()).toHaveLength(7)
    expectSamePc()
  })
})

// ---- 바로 저장 (AC-5712.4·5712.5·5712.6) ----------------------------------------------------------------

describe('app.js 설정 바로 저장', () => {
  it('AC-5712.4 · AC-5712.6: 탭 켜기 단추는 그 자리에서 꺼짐을 그리고 POST /api/settings(rev 그대로·X-Reception: 1)를 보낸다. 204면 띠 "어레인지 탭을 껐어요 · …" + [되돌리기]이고 판을 다시 읽는다. [되돌리기]는 5초 안에 한 번, 앞 문서를 새 rev로 다시 저장한다', async () => {
    const app = await open({ hash: '#/s' })
    const before = structuredClone(server.settings)
    const write = hold('/api/settings', 'POST')
    tabSwitch().click()
    expect(ownText(tabSwitch())).toBe('꺼짐')
    await settle()
    expect(settingsWrites()).toEqual([{ ...before, tab: false }])
    expect(lastWrite().init.method).toBe('POST')
    expect(new Headers(lastWrite().init.headers).get('X-Reception')).toBe('1')
    // 답을 기다리는 동안 저절로 다시 그려도 미리 그린 것 그대로
    await wait(1)
    expect(ownText(tabSwitch())).toBe('꺼짐')
    const reads = boardReads()
    write.answer()
    await settle()
    expect(server.settings.rev).toBe(2)
    expect(server.settings.tab).toBe(false)
    expect(toastText()).toBe(TAB_OFF)
    expect(undoButton()).not.toBeNull()
    expect(boardReads()).toBe(reads + 1)
    expect(settingsReads()).toBe(1)
    undoButton()!.click()
    await settle()
    expect(settingsWrites().at(-1)).toEqual({ ...before, rev: 2 })
    expect(server.settings).toMatchObject({ rev: 3, tab: true })
    expect(ownText(tabSwitch())).toBe('켜짐')
    expect(undoButton()).toBeNull()
    // 다시 켠 뒤 띠는 5초에 내린다
    tabSwitch().click()
    await settle()
    expect(toastText()).toBe(TAB_OFF)
    await wait(5000)
    expect(app.querySelector('.toast')).toBeNull()
    expect(settingsWrites()).toHaveLength(3)
    expectSamePc()
  })

  it('AC-5712.5 · AC-5712.6: 칸 숨기기가 409면 설정을 다시 읽어 그리고 띠 "다른 기기에서 설정을 바꿨어요 · 다시 해 주세요"(되돌리기 없음)다. 그 밖의 실패면 앞 문서로 되그리고 띠 "설정을 저장하지 못했어요"다', async () => {
    const app = await open({ hash: '#/s' })
    // 그 사이 다른 기기가 PT 이름을 바꿈
    const other = structuredClone(server.settings)
    other.rev = 5
    other.cols.find((c) => c.k === 'pt')!.name = '물리치료'
    server.settings = other
    colRow('PT').querySelector<HTMLButtonElement>('button.switch')!.click()
    expect(colRow('PT').classList.contains('is-off')).toBe(true)
    await settle()
    await settle()
    expect(settingsWrites().at(-1)!.rev).toBe(1)
    expect(settingsReads()).toBe(2)
    expect(colNames()).toContain('물리치료')
    expect(colRow('물리치료').classList.contains('is-off')).toBe(false)
    expect(toastText()).toBe(CONFLICT)
    expect(undoButton()).toBeNull()
    expect(server.settings.rev).toBe(5)

    // 다시 해 보면 새 rev로 저장된다
    colRow('물리치료').querySelector<HTMLButtonElement>('button.switch')!.click()
    await settle()
    expect(settingsWrites().at(-1)!.rev).toBe(5)
    expect(server.settings.rev).toBe(6)
    expect(toastText()).toBe('물리치료 칸을 숨겼어요')

    // 실패(500·연결 안 됨)면 앞 문서로
    for (const fail of [() => statusNext('/api/settings', 500, 'POST'), () => failNext('/api/settings', 'POST')]) {
      fail()
      colRow('도수').querySelector<HTMLButtonElement>('button.switch')!.click()
      expect(colRow('도수').classList.contains('is-off')).toBe(true)
      await settle()
      expect(colRow('도수').classList.contains('is-off')).toBe(false)
      expect(toastText()).toBe(SAVE_FAILED)
      expect(undoButton()).toBeNull()
      expect(server.settings.rev).toBe(6)
    }
    expect(app.querySelector('.set-fail')).toBeNull()
    expectSamePc()
  })
})

// ---- 로고 그림 (AC-5712.2·5712.3) ----------------------------------------------------------------------------

describe('app.js 로고 그림 올리기', () => {
  it('AC-5712.2 · AC-5712.3: 그림 파일이 없을 때 [로고 그림]은 그림 고르기를 열고, 고른 그림은 줄여 POST /api/logo(Content-Type·X-Reception)로 올린 뒤 설정을 다시 읽어 미리 보기와 머리 로고를 그 그림으로 그리고 띠 "로고를 바꿨어요 · …"다(되돌리기 없음)', async () => {
    fakeCanvas()
    const app = await open({ hash: '#/s' })
    const input = app.querySelector<HTMLInputElement>('.logo-card > input.logo-file')!
    const pick = vi.spyOn(input, 'click').mockImplementation(() => {})
    button(app, '.logo-card > .seg > button', '로고 그림').click()
    expect(pick).toHaveBeenCalledTimes(1)
    expect(settingsWrites()).toEqual([])
    chooseFile(new File([fx.fakeLogoJpeg()], '사진.jpg', { type: 'image/jpeg' }))
    await settle()
    await settle()
    const up = calls.filter((c) => c.url === '/api/logo' && c.method === 'POST')
    expect(up).toHaveLength(1)
    expect(new Headers(up[0]!.init.headers).get('Content-Type')).toBe('image/jpeg')
    expect(new Headers(up[0]!.init.headers).get('X-Reception')).toBe('1')
    expect(server.logoWrites).toEqual([{ type: 'image/jpeg', size: 1000 }])
    expect(server.settings.logo).toEqual({ mode: 'pic', text: null, ver: 1 })
    expect(settingsReads()).toBe(2)
    expect(toastText()).toBe(LOGO_TOAST)
    expect(undoButton()).toBeNull()
    const img = app.querySelector<HTMLImageElement>('.logo-card .logo-preview > img.lp-img')!
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,iVBORw0KGgo=')
    expect(button(app, '.logo-card > .seg > button', '로고 그림').getAttribute('aria-pressed')).toBe('true')
    // 판을 다시 읽어도 받은 그림을 다시 묻지 않고 어레인지 머리에 그린다
    await wait(5000)
    window.location.hash = '#/a'
    await settle()
    expect(app.querySelector<HTMLImageElement>('header.top img.logo')!.getAttribute('src')).toBe('data:image/jpeg;base64,iVBORw0KGgo=')
    expect(calls.filter((c) => c.url === '/api/logo' && c.method === 'GET')).toEqual([])
    expectSamePc()
  })

  it('AC-5712.3: 20MB보다 큰 파일은 보내지 않고 띠 "그림 파일이 너무 커요 · …"이고, 열 수 없는 그림·도우미가 받지 않은 그림(400)은 "로고를 올리지 못했어요"다', async () => {
    const canvas = fakeCanvas()
    const app = await open({ hash: '#/s' })
    const huge = new File([new Uint8Array(10)], 'big.png', { type: 'image/png' })
    Object.defineProperty(huge, 'size', { value: 20 * 1024 * 1024 + 1 })
    chooseFile(huge)
    await settle()
    expect(toastText()).toBe(BIG)
    expect(canvas.open).not.toHaveBeenCalled()
    canvas.open.mockImplementationOnce(() => Promise.reject(new Error('깨진 그림')))
    chooseFile(new File([new Uint8Array(10)], 'broken.png', { type: 'image/png' }))
    await settle()
    await settle()
    expect(toastText()).toBe(LOGO_FAILED)
    statusNext('/api/logo', 400, 'POST')
    chooseFile(new File([fx.fakeLogoPng()], 'logo.png', { type: 'image/png' }))
    await settle()
    await settle()
    expect(toastText()).toBe(LOGO_FAILED)
    expect(server.logoWrites).toEqual([])
    expect(server.settings.logo.ver).toBe(0)
    expect(app.querySelector('.logo-card img')).toBeNull()
    expect(settingsReads()).toBe(1)
    expectSamePc()
  })
})

// ---- 처음 설정 안내 (AC-5712.7·5712.8) ---------------------------------------------------------------------

describe('app.js 처음 설정 안내', () => {
  it('AC-5712.8 · AC-5712.7: 어레인지 안내 줄 [설정에서 고르기]는 설정 쪽을 열고 안내가 맨 위다. 로고·탭·SONO·C-ARM 처방을 고르면 셋 다 했어요가 되는 저장에 setup.done 참을 함께 보내고 안내가 사라진다', async () => {
    server = fx.settingsServer(fx.freshSettings())
    const app = await open({ hash: '#/a' })
    app.querySelector<HTMLButtonElement>('.page.arrange > .setup-note > button')!.click()
    await settle()
    expect(window.location.hash).toBe('#/s')
    const main = app.querySelector('.settings-page main.set-main')!
    expect(main.firstElementChild!.matches('section.set-guide')).toBe(true)
    expect(textOf(main, '.sg-count')).toBe('0/3 했어요')
    button(app, '.sg-acts > button', '써요').click()
    await settle()
    expect(server.settings.setup).toEqual({ logo: false, tab: true, done: false })
    expect(toastText()).toBe(TAB_ON)
    button(app, '.logo-card > .seg > button', '없이').click()
    await settle()
    expect(server.settings.setup).toEqual({ logo: true, tab: true, done: false })
    expect(textOf(app, '.sg-count')).toBe('2/3 했어요')
    // ③ SONO 고르기: 칸 고치기 창을 [넣을 처방] 탭으로 열어 지난 30일 처방을 한 번 읽는다
    button(app, '.sg-acts > button', 'SONO 고르기').click()
    await settle()
    expect(codesReads()).toBe(1)
    expect(textOf(sheetOf(), '.sheet-title')).toBe('SONO 칸 고치기')
    rxRow('SONO1').click()
    sheetGo().click()
    await settle()
    expect(sheetOf()).toBeNull()
    expect(toastText()).toBe('SONO 칸을 저장했어요')
    expect(undoButton()).toBeNull()
    expect(server.settings.cols.find((c) => c.k === 'sono')!.codes).toEqual(['SONO1'])
    expect(server.settings.setup.done).toBe(false)
    button(app, '.sg-acts > button', 'C-ARM 고르기').click()
    await settle()
    expect(codesReads()).toBe(2)
    rxRow('CARM1').click()
    sheetGo().click()
    await settle()
    expect(settingsWrites().at(-1)!.setup).toEqual({ logo: true, tab: true, done: true })
    expect(server.settings.setup.done).toBe(true)
    expect(app.querySelector('.set-guide')).toBeNull()
    // 어레인지 표의 안내 줄도 사라진다
    window.location.hash = '#/a'
    await settle()
    await wait(5000)
    expect(app.querySelector('.page.arrange > .setup-note')).toBeNull()
    expectSamePc()
  })
})

// ---- 칸 고치기 · 칸 더하기 · 이 칸 빼기 (AC-5713.1·5713.2·5713.5·5713.8·5713.9) ------------------------------

describe('app.js 칸 고치기', () => {
  it('AC-5713.1 · AC-5713.2 · AC-5713.5: [고치기]는 GET /api/codes를 한 번 읽고(탭을 오가도 다시 읽지 않음) 직접 넣은 코드는 GET /api/code/{코드}로 이름을 읽는다. [저장]은 설정 문서 전체를 보내고 띠 "{칸} 칸을 저장했어요"(되돌리기 없음)다', async () => {
    server.codeNames.set('EB470', '가상 초음파 재검사')
    await open({ hash: '#/s' })
    colRow('SONO').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await settle()
    expect(codesReads()).toBe(1)
    button(sheetOf()!, '.lt-tabs > button', '고르기 목록').click()
    button(sheetOf()!, '.lt-tabs > button', '넣을 처방 · 5개').click()
    await settle()
    expect(codesReads()).toBe(1)
    const form = sheetOf()!.querySelector<HTMLFormElement>('form.rx-direct')!
    typeIn(form.querySelector<HTMLInputElement>('input.txt')!, 'eb470')
    form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()
    await settle()
    expect(urls().filter((u) => u.startsWith('/api/code/'))).toEqual(['/api/code/EB470'])
    expect(textOf(sheetOf(), 'form.rx-direct > p.rd-msg')).toBe(DIRECT_ADDED)
    expect(textOf(rxRow('EB470'), '.rx-n')).toContain('가상 초음파 재검사')
    typeIn(sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!, '초음파')
    // 답을 기다리는 동안 [저장]은 꺼져 있다
    const write = hold('/api/settings', 'POST')
    sheetGo().click()
    expect(sheetGo().disabled).toBe(true)
    await settle()
    write.answer()
    await settle()
    expect(sheetOf()).toBeNull()
    const saved = settingsWrites().at(-1)!
    const sono = saved.cols.find((c) => c.k === 'sono')!
    expect([sono.name, sono.codes]).toEqual(['초음파', ['SONO1', 'SONO', 'EB422', 'EB466', 'HA280', 'EB470']])
    expect(server.settings.rev).toBe(2)
    expect(toastText()).toBe('초음파 칸을 저장했어요')
    expect(undoButton()).toBeNull()
    expect(colNames()).toContain('초음파')
    expect(document.activeElement).toBe(colRow('초음파').querySelector('button.col-edit'))
    expect(codesReads()).toBe(1)
    expectSamePc()
  })

  it('AC-5713.1 · AC-5712.6: 칸 고치기 [저장]이 409면 창·초안을 둔 채 설정을 다시 읽고 띠를 보인다. 다시 [저장]하면 새 문서에 그 칸만 바꿔 저장한다. 실패면 창이 남고 띠 "설정을 저장하지 못했어요"다', async () => {
    await open({ hash: '#/s' })
    const other = structuredClone(server.settings)
    other.rev = 4
    other.cols.find((c) => c.k === 'trac')!.name = '견인치료'
    server.settings = other
    colRow('PT').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await settle()
    const name = sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!
    typeIn(name, '물리')
    sheetGo().click()
    await settle()
    await settle()
    expect(sheetOf()).not.toBeNull()
    expect(name.value).toBe('물리')
    expect(toastText()).toBe(CONFLICT)
    expect(colNames()).toContain('견인치료')
    sheetGo().click()
    await settle()
    expect(sheetOf()).toBeNull()
    expect(settingsWrites().at(-1)!.rev).toBe(4)
    expect(server.settings.cols.map((c) => c.name)).toEqual(['X-RAY', 'SONO', 'C-ARM', '물리', '도수', '충격파', '견인치료'])

    colRow('도수').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await settle()
    typeIn(sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!, '도수치료')
    statusNext('/api/settings', 403, 'POST')
    sheetGo().click()
    await settle()
    expect(sheetOf()).not.toBeNull()
    expect(sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!.value).toBe('도수치료')
    expect(toastText()).toBe(SAVE_FAILED)
    // 띠가 내린 뒤 저절로 다시 그려도 창·적던 글이 남는다
    await wait(5000)
    expect(sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!.value).toBe('도수치료')
    expect(server.settings.cols.find((c) => c.k === 'ds')!.name).toBe('도수')
    expectSamePc()
  })

  it('AC-5713.9 · AC-5713.8: [+ 칸 더하기]는 x{nextX} 칸을 맨 끝에 더해 저장하고 띠 "{칸} 칸을 더했어요"다. 그 칸의 [이 칸 빼기]는 칸과 목록을 뺀 문서를 저장하고 띠 "{칸} 칸을 뺐어요" + [되돌리기]이고 [되돌리기]는 칸을 되살린다', async () => {
    await open({ hash: '#/s' })
    button(appEl(), 'button.col-add', '+ 칸 더하기').click()
    const adder = sheetOf()!
    expect(adder.getAttribute('aria-label')).toBe('칸 더하기')
    typeIn(adder.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!, '주사')
    const mn = [...adder.querySelectorAll<HTMLButtonElement>('.kind-cards > button')].find((b) => textOf(b, '.kc-t') === '직접 칸')!
    mn.click()
    sheetGo().click()
    await settle()
    expect(sheetOf()).toBeNull()
    const added = settingsWrites().at(-1)!
    expect(added.nextX).toBe(2)
    expect(added.cols.at(-1)).toEqual({ k: 'x1', name: '주사', kind: 'mn', steps: 2, show: true, added: true, codes: [] })
    expect(added.picks.extra).toEqual({ x1: [] })
    expect(toastText()).toBe('주사 칸을 더했어요')
    expect(undoButton()).toBeNull()
    expect(colNames().at(-1)).toBe('주사')
    expect(server.board.cfg.cols.at(-1)).toMatchObject({ k: 'x1', name: '주사', added: true })

    colRow('주사').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await settle()
    sheetOf()!.querySelector<HTMLButtonElement>(':scope > .sheet-go > button.del-col')!.click()
    await settle()
    expect(sheetOf()).toBeNull()
    const removed = settingsWrites().at(-1)!
    expect(removed.cols.map((c) => c.k)).toEqual(['xray', 'sono', 'carm', 'pt', 'ds', 'eswt', 'trac'])
    expect([removed.nextX, removed.picks.extra]).toEqual([2, {}])
    expect(toastText()).toBe('주사 칸을 뺐어요')
    expect(colNames()).not.toContain('주사')
    undoButton()!.click()
    await settle()
    const restored = settingsWrites().at(-1)!
    expect(restored.cols.at(-1)).toMatchObject({ k: 'x1', name: '주사' })
    expect([restored.nextX, restored.picks.extra]).toEqual([2, { x1: [] }])
    expect(server.settings.cols.map((c) => c.k)).toContain('x1')
    expect(colNames().at(-1)).toBe('주사')
    expectSamePc()
  })
})

// ---- 지우기 (AC-3312.2와 같은 규칙) ---------------------------------------------------------------------------

describe('app.js 설정 쪽 지우기', () => {
  it('AC-5712.1 · AC-5713.10: 화면이 숨겨지면 설정 쪽·열린 칸 고치기 창·띠를 지우고, 다시 보이면 판과 설정을 다시 읽어 창 없이 설정 쪽이다', async () => {
    await open({ hash: '#/s' })
    tabSwitch().click()
    await settle()
    colRow('SONO').querySelector<HTMLButtonElement>('button.col-edit')!.click()
    await settle()
    typeIn(sheetOf()!.querySelector<HTMLInputElement>(':scope > .cf > input.txt')!, '적던')
    hide()
    await settle()
    expectWiped()
    show()
    await settle()
    await settle()
    expect(window.location.hash).toBe('#/s')
    expect(settingsPage()).not.toBeNull()
    expect(sheetOf()).toBeNull()
    expect(appEl().querySelector('.toast')).toBeNull()
    expect(settingsReads()).toBe(2)
    expect(ownText(tabSwitch())).toBe('꺼짐')
    expectSamePc()
  })
})
