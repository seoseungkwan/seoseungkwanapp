// 확장의 검사 순수 함수(design.md 3절·4-2, REQ-003). 명령 표·origin은 commands.json 하나에서 온다.
// 서비스 워커는 JSON을 import하지 못할 수 있어, `npm run ext:build`가 이 import를 dist/commands.js(JS 모듈)로 바꿔 쓴다
import commands from '../../src/lib/bridge/commands.json'

/** 웹 → 확장 → 도우미 요청 봉투 */
export type Envelope = { v: number; id: string; cmd: string; args: Record<string, unknown> }
export type ErrorReply = { v: number; id: string; type: 'error'; code: string }

export const PROTOCOL: number = commands.protocol
export const HOST_NAME: string = commands.hostName
export const INPUT_CMD = 'bit.input'
/** 웹이 끊긴 뒤 bit.input의 끝을 기다리는 가장 긴 시간(AC-003.7) */
export const INPUT_KEEP_MS = 30 * 60 * 1000

export const E_BRIDGE_REJECTED = 'E-BRIDGE-REJECTED'
export const E_BRIDGE_BUSY = 'E-BRIDGE-BUSY'
export const E_HELPER_MISSING = 'E-HELPER-MISSING'

// 도우미 Envelope.IdShape와 같다: 답에 그대로 돌려주므로 글자를 좁혀 둔다
const ID_SHAPE = /^[A-Za-z0-9-]{1,64}$/
const ENVELOPE_KEYS = ['args', 'cmd', 'id', 'v'].join()

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** 크롬이 준 sender.origin이 우리 사이트와 글자까지 같은가(AC-003.2) */
export function isOurOrigin(origin: string | undefined): boolean {
  return origin === commands.origin
}

/** id는 모를 때 빈 글자 */
export function errorReply(id: string, code: string): ErrorReply {
  return { v: PROTOCOL, id, type: 'error', code }
}

/** 봉투 모양과 cmd만 본다. args 안쪽은 도우미가 명령 표로 검사한다(AC-003.3). 통과하면 받은 객체를 그대로 돌려준다 */
export function checkRequest(msg: unknown): { ok: true; req: Envelope } | { ok: false; reply: ErrorReply } {
  const id = isRecord(msg) && typeof msg.id === 'string' && ID_SHAPE.test(msg.id) ? msg.id : ''
  const ok =
    isRecord(msg) &&
    id !== '' &&
    Object.keys(msg).sort().join() === ENVELOPE_KEYS &&
    msg.v === PROTOCOL &&
    typeof msg.cmd === 'string' &&
    Object.hasOwn(commands.commands, msg.cmd) &&
    isRecord(msg.args)
  return ok ? { ok: true, req: msg as Envelope } : { ok: false, reply: errorReply(id, E_BRIDGE_REJECTED) }
}

/** hello 답에만 쓴다: result의 data에 확장 버전·protocol을 더한 새 객체. 다른 모양이면 받은 것을 그대로(AC-003.6) */
export function withExtensionInfo(reply: unknown, ext: { version: string; protocol: number }): unknown {
  if (!isRecord(reply) || reply.type !== 'result' || !isRecord(reply.data)) return reply
  return { ...reply, data: { ...reply.data, extensionVersion: ext.version, extensionProtocol: ext.protocol } }
}

/** 도우미 답의 id·type만 읽는다(답은 고치지 않는다) */
export function replyHead(reply: unknown): { id?: string; type?: string } {
  if (!isRecord(reply)) return {}
  return {
    id: typeof reply.id === 'string' ? reply.id : undefined,
    type: typeof reply.type === 'string' ? reply.type : undefined,
  }
}
