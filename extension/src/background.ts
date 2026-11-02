// 서비스 워커 입구(design.md 3절·15절, REQ-003): 우리 사이트의 웹 연결 하나를 받아 검사만 하고 도우미와 그대로 이어 준다.
// 답은 고치지도 쌓아 두지도 않는다(hello result에 확장 버전만 붙인다). 기억하는 것은 기다리는 요청의 id·cmd와
// 입력하느라 내린 크롬 창의 번호·상태뿐이다(REQ-038, design.md 19-8)
import type { ChromeLike, PortLike, WindowStateLike } from './chromeLike.js'
import {
  checkRequest,
  E_BRIDGE_BUSY,
  E_HELPER_MISSING,
  errorReply,
  HOST_NAME,
  INPUT_CMD,
  INPUT_KEEP_MS,
  isOurOrigin,
  PROTOCOL,
  replyHead,
  withExtensionInfo,
} from './relay.js'

/** 이 답이 오면 그 요청은 끝난다 */
const FINAL_TYPES = new Set(['result', 'end', 'error'])

/** 입력하느라 내리는 창 하나. restore는 내려간 뒤에야 찬다: 비어 있으면 되돌릴 것이 없다 */
type LoweredWindow = { id: string; windowId: number; restore?: WindowStateLike }

export function startBackground(chrome: ChromeLike, manifest: { version: string }): void {
  const ext = { version: manifest.version, protocol: PROTOCOL }
  let web: PortLike | null = null
  let native: PortLike | null = null
  /** 답을 기다리는 요청 id → cmd */
  const pending = new Map<string, string>()
  let keepTimer: ReturnType<typeof setTimeout> | undefined
  /** 받아들인 웹 연결을 연 탭의 창 번호. 웹이 끊겨도 붙잡은 bit.input에는 그대로 쓴다(AC-003.7) */
  let webWindowId: number | undefined
  /** 그 bit.input이 끝날 때까지 남는다. 실패해도 남아서 같은 요청에서 두 번 내리지 않는다(AC-038.1) */
  let lowered: LoweredWindow | null = null

  function inputPending(): boolean {
    for (const cmd of pending.values()) if (cmd === INPUT_CMD) return true
    return false
  }

  /** 창 일은 입력을 막지 않는다: 실패하면 오류만 읽고 넘어간다. 가려져 있으면 도우미가 멈춘다(AC-036.6) */
  function setWindowState(windowId: number, state: WindowStateLike, done?: (ok: boolean) => void) {
    try {
      chrome.windows.update(windowId, { state }, () => {
        const ok = !chrome.runtime.lastError
        done?.(ok)
      })
    } catch {
      done?.(false)
    }
  }

  /** 크롬 답은 나중에 온다. 그사이 요청이 끝나면 hold가 lowered에서 빠지므로 내리지 않거나 바로 되돌린다(AC-038.2) */
  function lowerWindow(id: string) {
    if (lowered || webWindowId === undefined) return
    const hold: LoweredWindow = { id, windowId: webWindowId }
    lowered = hold
    try {
      chrome.windows.get(hold.windowId, (win) => {
        const failed = chrome.runtime.lastError
        const state = win?.state
        if (failed || !state || lowered !== hold) return
        setWindowState(hold.windowId, 'minimized', (ok) => {
          if (!ok) return
          if (lowered === hold) hold.restore = state
          else setWindowState(hold.windowId, state)
        })
      })
    } catch {
      // chrome.windows를 부르지 못해도 답은 넘긴다
    }
  }

  function restoreWindow() {
    const hold = lowered
    lowered = null
    if (hold?.restore) setWindowState(hold.windowId, hold.restore)
  }

  function forgetNative() {
    if (keepTimer !== undefined) clearTimeout(keepTimer)
    keepTimer = undefined
    pending.clear()
    native = null
    restoreWindow()
  }

  function closeNative() {
    const port = native
    forgetNative()
    port?.disconnect()
  }

  function openNative(): PortLike | null {
    let port: PortLike
    try {
      port = chrome.runtime.connectNative(HOST_NAME)
    } catch {
      return null
    }
    port.onMessage.addListener((m) => {
      if (port === native) fromHelper(m)
    })
    port.onDisconnect.addListener(() => {
      // 도우미가 없거나 끝나면 크롬이 lastError를 채운다. 읽어 두어야 '확인하지 않은 오류'로 남지 않는다
      void chrome.runtime.lastError
      if (port === native) helperGone()
    })
    return port
  }

  function fromHelper(reply: unknown) {
    const { id, type } = replyHead(reply)
    let out = reply
    if (id !== undefined && pending.has(id)) {
      const cmd = pending.get(id)
      if (cmd === 'hello' && type === 'result') out = withExtensionInfo(reply, ext)
      // bit.input의 첫 progress는 PC 확인을 지나 입력을 시작하기 직전이다(AC-038.1)
      if (cmd === INPUT_CMD && type === 'progress') lowerWindow(id)
      if (type !== undefined && FINAL_TYPES.has(type)) {
        pending.delete(id)
        if (lowered?.id === id) restoreWindow()
      }
    }
    if (web) web.postMessage(out)
    // 웹 없이 붙잡고 있던 bit.input이 끝났다(AC-003.7)
    else if (!inputPending()) closeNative()
  }

  function helperGone() {
    const ids = [...pending.keys()]
    forgetNative()
    if (web) for (const id of ids) web.postMessage(errorReply(id, E_HELPER_MISSING))
  }

  function fromWeb(port: PortLike, msg: unknown) {
    if (port !== web) return
    const checked = checkRequest(msg)
    if (!checked.ok) {
      port.postMessage(checked.reply)
      return
    }
    const { id, cmd } = checked.req
    if (!native) native = openNative()
    if (!native) {
      port.postMessage(errorReply(id, E_HELPER_MISSING))
      return
    }
    pending.set(id, cmd)
    native.postMessage(checked.req)
  }

  function webGone(port: PortLike) {
    if (port !== web) return
    web = null
    if (!native) return
    if (!inputPending()) {
      closeNative()
      return
    }
    // bit.input은 도우미가 지금 사람까지 마치게 끝(end·error)까지, 길어도 30분 둔다. 다른 요청의 답은 받을 곳이 없다
    for (const [id, cmd] of pending) if (cmd !== INPUT_CMD) pending.delete(id)
    keepTimer = setTimeout(closeNative, INPUT_KEEP_MS)
  }

  chrome.runtime.onConnectExternal.addListener((port) => {
    // origin 검사가 먼저다. 남의 사이트는 연결만으로 도우미를 켜지 못한다(AC-003.2)
    if (!isOurOrigin(port.sender?.origin)) {
      port.disconnect()
      return
    }
    // 웹 연결이 있거나, 웹 없이 bit.input 도우미 연결을 붙잡고 있으면 받지 않는다(AC-003.5·AC-003.9)
    if (web || native) {
      port.postMessage(errorReply('', E_BRIDGE_BUSY))
      port.disconnect()
      return
    }
    web = port
    webWindowId = port.sender?.tab?.windowId
    port.onMessage.addListener((m) => fromWeb(port, m))
    port.onDisconnect.addListener(() => webGone(port))
  })
}

// 서비스 워커로 돌 때만 스스로 켠다(시험은 가짜 chrome으로 startBackground를 부른다).
// 듣는 함수는 맨 위에서 바로 걸어야 크롬이 서비스 워커를 다시 깨웠을 때도 연결을 받는다
if (typeof chrome !== 'undefined' && chrome.runtime?.onConnectExternal) {
  startBackground(chrome, chrome.runtime.getManifest())
}
