// spec erp-copy-list TASK-1 AC-3901.3: 새 확장 서비스 워커(background.ts, design.md 3절)를 가짜 chrome으로 시험한다.
// - 지금 확장의 도우미 통로(extension-erp/src/background.js)를 고치지 않고 불러 그대로 켠다(불러올 때 맨 위에서 onMessage를 건다)
// - 확장 아이콘을 누르면 목록 화면(list.html)을 새 탭으로 연다(tabs 권한 없이 tabs.create)
// 자료는 없다(도우미에 묻지 않는다)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const OUR_ID = 'abcdefghijklmnopabcdefghijklmnop'

// background.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadBackground = () => import('./background')

type Listener = (message: unknown, sender: { id?: string }, sendResponse: (reply: unknown) => void) => boolean | undefined

/** 서비스 워커가 보는 chrome 흉내. 주지 않은 칸은 없다 */
function fakeChrome(parts: { runtime?: boolean; action?: boolean; tabs?: boolean } = {}) {
  const { runtime = true, action = true, tabs = true } = parts
  const messageListeners: Listener[] = []
  const clickListeners: (() => void)[] = []
  const onMessage = vi.fn((fn: Listener) => void messageListeners.push(fn))
  const onClicked = vi.fn((fn: () => void) => void clickListeners.push(fn))
  const create = vi.fn(async (props: { url: string }) => ({ id: 1, ...props }))
  const connectNative = vi.fn()
  const openOptionsPage = vi.fn(async () => undefined)
  const getURL = vi.fn((p: string) => `chrome-extension://${OUR_ID}/${p}`)
  const chrome: Record<string, unknown> = {}
  if (runtime) chrome.runtime = { id: OUR_ID, onMessage: { addListener: onMessage }, connectNative, openOptionsPage, getURL }
  if (action) chrome.action = { onClicked: { addListener: onClicked } }
  if (tabs) chrome.tabs = { create }
  return { chrome, onMessage, onClicked, create, connectNative, openOptionsPage, getURL, messageListeners, clickListeners }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('AC-3901.3 서비스 워커: 지금 도우미 통로를 그대로 불러 켠다', () => {
  it("AC-3901.3: background.ts의 첫 import 줄은 import '../../extension-erp/src/background.js'다", () => {
    const text = readFileSync(path.join(SRC, 'background.ts'), 'utf8')
    const first = text.split(/\r?\n/).find((line) => /^\s*(?:import|export)\b/.test(line))
    expect(first?.replace(/\s*\/\/.*$/, '').trim()).toBe("import '../../extension-erp/src/background.js'")
  })

  it('AC-3901.3: chrome(runtime.onMessage·connectNative·action·tabs)이 있을 때 불러오면 runtime.onMessage·action.onClicked에 하나씩 건다', async () => {
    const fake = fakeChrome()
    vi.stubGlobal('chrome', fake.chrome)
    vi.resetModules()
    await loadBackground()
    expect(fake.onMessage).toHaveBeenCalledTimes(1)
    expect(fake.onClicked).toHaveBeenCalledTimes(1)
    expect(fake.connectNative).not.toHaveBeenCalled()
    expect(fake.create).not.toHaveBeenCalled()
  })

  it("AC-3901.3: 건 듣는 함수는 지금 통로다 — 같은 확장의 { open: 'options' }는 설정 화면을 열고, 남이 보낸 것은 답하지 않는다", async () => {
    const fake = fakeChrome()
    vi.stubGlobal('chrome', fake.chrome)
    vi.resetModules()
    await loadBackground()
    const [listener] = fake.messageListeners
    const strangerReply = vi.fn()
    expect(listener({ open: 'options' }, { id: 'someoneelse' }, strangerReply)).toBe(false)
    expect(strangerReply).not.toHaveBeenCalled()
    expect(fake.openOptionsPage).not.toHaveBeenCalled()
    const reply = vi.fn()
    expect(listener({ open: 'options' }, { id: OUR_ID }, reply)).toBe(true)
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ type: 'result', data: null }))
    expect(fake.openOptionsPage).toHaveBeenCalledTimes(1)
    const rejected = vi.fn()
    expect(listener({ cmd: 'hello', args: {} }, { id: OUR_ID }, rejected)).toBe(false)
    expect(rejected).toHaveBeenCalledWith({ type: 'error', code: 'E-BRIDGE-REJECTED' })
    expect(fake.connectNative).not.toHaveBeenCalled()
  })

  it('AC-3901.3: 아이콘을 누르면 tabs.create({ url: runtime.getURL(list.html) })를 한 번 부른다(스스로 켠 것)', async () => {
    const fake = fakeChrome()
    vi.stubGlobal('chrome', fake.chrome)
    vi.resetModules()
    await loadBackground()
    expect(fake.clickListeners).toHaveLength(1)
    fake.clickListeners[0]()
    expect(fake.getURL).toHaveBeenCalledWith('list.html')
    expect(fake.create).toHaveBeenCalledTimes(1)
    expect(fake.create).toHaveBeenCalledWith({ url: `chrome-extension://${OUR_ID}/list.html` })
  })

  it('AC-3901.3: chrome이 없으면(시험·다른 곳) 불러와도 아무것도 걸지 않고 던지지 않는다', async () => {
    vi.unstubAllGlobals()
    expect(typeof (globalThis as { chrome?: unknown }).chrome).toBe('undefined')
    vi.resetModules()
    await expect(loadBackground()).resolves.toBeDefined()
  })

  it('AC-3901.3: action·tabs가 없는 chrome이면 아이콘 듣기는 걸지 않는다(도우미 통로만)', async () => {
    const fake = fakeChrome({ action: false, tabs: false })
    vi.stubGlobal('chrome', fake.chrome)
    vi.resetModules()
    await loadBackground()
    expect(fake.onMessage).toHaveBeenCalledTimes(1)
    expect(fake.onClicked).not.toHaveBeenCalled()
  })
})

describe('AC-3901.3 startListBackground', () => {
  it("AC-3901.3: LIST_PAGE는 'list.html'이다", async () => {
    const { LIST_PAGE } = await loadBackground()
    expect(LIST_PAGE).toBe('list.html')
  })

  it('AC-3901.3: action.onClicked에 하나 걸고, 부르면 tabs.create({ url: getURL(list.html) })를 한 번 부른다', async () => {
    const { startListBackground } = await loadBackground()
    const fake = fakeChrome()
    startListBackground(fake.chrome as unknown as Parameters<typeof startListBackground>[0])
    expect(fake.onClicked).toHaveBeenCalledTimes(1)
    expect(fake.create).not.toHaveBeenCalled()
    fake.clickListeners[0]()
    expect(fake.create).toHaveBeenCalledTimes(1)
    expect(fake.create).toHaveBeenCalledWith({ url: `chrome-extension://${OUR_ID}/list.html` })
    fake.clickListeners[0]()
    expect(fake.create).toHaveBeenCalledTimes(2)
  })

  it('AC-3901.3: 탭을 못 열어도(create가 거절) 서비스 워커가 던지지 않는다', async () => {
    const { startListBackground } = await loadBackground()
    const fake = fakeChrome()
    fake.create.mockRejectedValueOnce(new Error('No current window'))
    startListBackground(fake.chrome as unknown as Parameters<typeof startListBackground>[0])
    expect(() => fake.clickListeners[0]()).not.toThrow()
    await Promise.resolve()
    expect(fake.create).toHaveBeenCalledTimes(1)
  })
})
