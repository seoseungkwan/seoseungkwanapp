// 서비스 워커 입구(design.md 3절·15절, REQ-003): 우리 사이트의 웹 연결 하나를 받아 검사만 하고 도우미와 그대로 이어 준다.
// 답은 고치지도 쌓아 두지도 않는다(hello result에 확장 버전만 붙인다). 기억하는 것은 기다리는 요청의 id·cmd뿐이다
import type { ChromeLike, PortLike } from './chromeLike.js'
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

export function startBackground(chrome: ChromeLike, manifest: { version: string }): void {
  const ext = { version: manifest.version, protocol: PROTOCOL }
  let web: PortLike | null = null
  let native: PortLike | null = null
  /** 답을 기다리는 요청 id → cmd */
  const pending = new Map<string, string>()
  let keepTimer: ReturnType<typeof setTimeout> | undefined

  function inputPending(): boolean {
    for (const cmd of pending.values()) if (cmd === INPUT_CMD) return true
    return false
  }

  function forgetNative() {
    if (keepTimer !== undefined) clearTimeout(keepTimer)
    keepTimer = undefined
    pending.clear()
    native = null
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
      if (pending.get(id) === 'hello' && type === 'result') out = withExtensionInfo(reply, ext)
      if (type !== undefined && FINAL_TYPES.has(type)) pending.delete(id)
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
    port.onMessage.addListener((m) => fromWeb(port, m))
    port.onDisconnect.addListener(() => webGone(port))
  })
}

// 서비스 워커로 돌 때만 스스로 켠다(시험은 가짜 chrome으로 startBackground를 부른다).
// 듣는 함수는 맨 위에서 바로 걸어야 크롬이 서비스 워커를 다시 깨웠을 때도 연결을 받는다
if (typeof chrome !== 'undefined' && chrome.runtime?.onConnectExternal) {
  startBackground(chrome, chrome.runtime.getManifest())
}
