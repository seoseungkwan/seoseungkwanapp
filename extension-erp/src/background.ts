// 서비스 워커: 도우미 통로(design.md 1절·4절, REQ-3609 AC-3609.6)
// - 같은 확장(ERP 화면의 내용 스크립트·설정 화면)이 보낸 { cmd: closing.codes | closing.day | closing.findCodes | closing.source | closing.uisCodes, args }만 받는다
//   (closing.findCodes는 설정 화면 '셀 코드'·'같이 있을 처방' 찾기, REQ-3708. closing.source·closing.uisCodes는 의사랑판, spec erp-uisarang)
// - 요청마다 도우미 연결을 하나 열어 { v: 1, id, cmd, args }를 보내고, 그 요청의 result·error 하나를 받으면 닫는다.
//   답은 { type: 'result', data } | { type: 'error', code }로 돌려준다. 답은 고치지도 쌓아 두지도 않는다
// - 연결이 끊기면 크롬 lastError 글로 나눈다(AC-3614.2): 'not found'·'forbidden'(ERP 도우미가 안 깔림·허락 안 됨)이면 E-HELPER-MISSING,
//   그 밖(읽는 도중 도우미가 끝남 'Native host has exited.'·글 없음)이면 E-HELPER-STOPPED. 연결 자체를 못 열면 E-HELPER-MISSING,
//   120초 안에 답이 없으면 E-HELPER-TIMEOUT
// - { open: 'options' }는 설정 화면만 연다(내용 스크립트는 확장 화면을 직접 열 수 없다). 도우미는 켜지 않는다
import { E_BRIDGE_BAD_REPLY, E_BRIDGE_REJECTED, E_HELPER_MISSING, E_HELPER_STOPPED, E_HELPER_TIMEOUT } from './errors.js'
import { HOST_NAME, type ClosingCommand } from './types.js'

/** 도우미 봉투 판(helper-erp/commands.json protocol) */
export const PROTOCOL = 1
/** 도우미에 넘기는 명령은 이것뿐이다(helper-erp/commands.json commands 차례). 끝 둘은 의사랑판(spec erp-uisarang AC-4210.1) */
export const COMMANDS: readonly ClosingCommand[] = ['closing.codes', 'closing.day', 'closing.findCodes', 'closing.source', 'closing.uisCodes']
/** 도우미 답을 기다리는 가장 긴 시간 */
export const REPLY_TIMEOUT_MS = 120_000

/** 크롬이 '도우미가 없음·허락 안 됨'일 때 주는 lastError 글 조각(영어, 대소문자 무시) */
const MISSING_WORDS = /not found|forbidden/i

/** 끊길 때의 lastError 글 → 오류 번호 */
export function disconnectCode(message: unknown): string {
  return typeof message === 'string' && MISSING_WORDS.test(message) ? E_HELPER_MISSING : E_HELPER_STOPPED
}

/** 확장 안 메시지의 답 모양(설정 화면 options.ts·ERP 화면 main.ts가 읽는다) */
export type Reply = { type: 'result'; data: unknown } | { type: 'error'; code: string }

/** 확장이 쓰는 chrome의 모양만. 시험은 이 모양의 가짜를 넣는다 */
export type NativePortLike = {
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: { addListener(callback: (message: unknown) => void): void }
  onDisconnect: { addListener(callback: () => void): void }
}

export type BackgroundChrome = {
  runtime: {
    id: string
    lastError?: { message?: string }
    connectNative(host: string): NativePortLike
    openOptionsPage(): Promise<void>
    onMessage: {
      addListener(
        callback: (message: unknown, sender: { id?: string }, sendResponse: (response?: unknown) => void) => boolean | undefined,
      ): void
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 칸이 정확히 이것들뿐인가 */
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join() === [...keys].sort().join()

function readRequest(message: unknown): { cmd: ClosingCommand; args: Record<string, unknown> } | null {
  if (!isRecord(message) || !hasOnly(message, ['args', 'cmd']) || !isRecord(message.args)) return null
  const cmd = COMMANDS.find((c) => c === message.cmd)
  return cmd ? { cmd, args: message.args } : null
}

const isOpenOptions = (message: unknown) => isRecord(message) && hasOnly(message, ['open']) && message.open === 'options'

/** 이 요청의 끝 답이면 넘길 모양, 아니면 null. 봉투를 못 읽은 도우미는 id 빈 글자로 오류를 보낸다 */
function finalReply(message: unknown, id: string): Reply | null {
  if (!isRecord(message)) return null
  if (message.type === 'result' && message.id === id) return { type: 'result', data: message.data }
  if (message.type === 'error' && (message.id === id || message.id === '')) {
    return { type: 'error', code: typeof message.code === 'string' ? message.code : E_BRIDGE_BAD_REPLY }
  }
  return null
}

function askHelper(
  chrome: BackgroundChrome,
  request: { cmd: ClosingCommand; args: Record<string, unknown> },
  respond: (reply: Reply) => void,
) {
  const id = crypto.randomUUID()
  let port: NativePortLike | null = null
  let done = false
  const finish = (reply: Reply) => {
    if (done) return
    done = true
    clearTimeout(timer)
    const open = port
    port = null
    try {
      open?.disconnect()
    } catch {
      // 이미 끊긴 연결
    }
    respond(reply)
  }
  const timer = setTimeout(() => finish({ type: 'error', code: E_HELPER_TIMEOUT }), REPLY_TIMEOUT_MS)
  try {
    port = chrome.runtime.connectNative(HOST_NAME)
  } catch {
    finish({ type: 'error', code: E_HELPER_MISSING })
    return
  }
  const mine = port
  mine.onMessage.addListener((message) => {
    const reply = finalReply(message, id)
    if (reply) finish(reply)
  })
  mine.onDisconnect.addListener(() => {
    // 도우미가 없거나 끝나면 크롬이 lastError를 채운다. 읽어 두어야 '확인하지 않은 오류'로 남지 않는다
    const code = disconnectCode(chrome.runtime.lastError?.message)
    if (port === mine) port = null
    finish({ type: 'error', code })
  })
  try {
    mine.postMessage({ v: PROTOCOL, id, cmd: request.cmd, args: request.args })
  } catch {
    finish({ type: 'error', code: E_HELPER_MISSING })
  }
}

export function startBackground(chrome: BackgroundChrome): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 같은 확장(내용 스크립트·설정 화면)만. 남이 보낸 것은 답도 하지 않는다
    if (!sender || sender.id !== chrome.runtime.id) return false
    const respond = (reply: Reply) => {
      try {
        sendResponse(reply)
      } catch {
        // 보낸 탭이 닫혔다
      }
    }
    if (isOpenOptions(message)) {
      chrome.runtime.openOptionsPage().then(
        () => respond({ type: 'result', data: null }),
        () => respond({ type: 'error', code: E_BRIDGE_REJECTED }),
      )
      return true
    }
    const request = readRequest(message)
    if (!request) {
      respond({ type: 'error', code: E_BRIDGE_REJECTED })
      return false
    }
    askHelper(chrome, request, respond)
    return true // 답은 나중에 보낸다
  })
}

// 서비스 워커로 돌 때만 스스로 켠다(시험은 가짜 chrome으로 startBackground를 부른다).
// 듣는 함수는 맨 위에서 바로 걸어야 크롬이 서비스 워커를 다시 깨웠을 때도 메시지를 받는다
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage && typeof chrome.runtime.connectNative === 'function') {
  startBackground(chrome)
}
