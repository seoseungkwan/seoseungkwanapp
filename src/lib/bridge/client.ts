// 통로 코드(design.md 5절·6-1, REQ-004) [환자 자료 구역]. 확장에는 EXTENSION_ID로만 말하고, 환자 자료 조각은
// 풀지 않고(JSON.parse 없음) 바로 sink(Worker 전용 포트)로 넘긴다. 부른 쪽에는 상태·숫자·검사한 답·{id, count}·오류 번호만 간다.
// lib/bridge 밖에서는 이 파일을 import할 수 없다(ESLint). 화면은 workerSink.ts의 connectScreenBridge를 쓴다
import type {
  ArgsOf,
  Bridge,
  BridgeState,
  ChromeRuntimeLike,
  ChunkSink,
  CommandName,
  HelloResult,
  PatientCommand,
  PatientSendCommand,
  PortLike,
  Progress,
  ResultOf,
  SendResult,
  SmallCommand,
  StreamResult,
} from '@/types/bridge'
import { EXTENSION_ID } from './extensionId'
import { checkVersions } from './handshake'
import {
  BridgeError,
  checkHello,
  checkResult,
  isPatientCommand,
  isRecord,
  isSaved,
  isSendCommand,
  isSmallCommand,
  PROTOCOL,
  readReply,
} from './protocol'
import { WEB_VERSIONS } from './versions'

const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
const DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
const REJECTED = 'E-BRIDGE-REJECTED'
const BUSY = 'E-BRIDGE-BUSY'
const HELPER_MISSING = 'E-HELPER-MISSING'

/** 답 모양: hello / 숫자·상태 result / 조각(chunk … end) / store.save result */
type Kind = 'hello' | 'small' | 'stream' | 'save'

type Pending = {
  cmd: CommandName
  kind: Kind
  /** 다음에 올 조각 번호(0부터). end의 count와 맞춰 본다 */
  next: number
  resolve(value: unknown): void
  reject(error: BridgeError): void
}

/** ready가 아닐 때 명령을 거절하는 번호 */
const STATE_CODE: Record<Exclude<BridgeState, 'ready'>, string> = {
  connecting: REJECTED, // hello로 버전을 맞추기 전
  'no-extension': 'E-EXT-MISSING',
  'no-helper': HELPER_MISSING,
  busy: BUSY,
  'update-helper': 'E-HELPER-OLD',
  'update-extension': 'E-EXT-OLD',
  disconnected: DISCONNECTED,
}

const helloState = (state: BridgeState): HelloResult => ({ state, helperUpdateAvailable: false })
const rejected = (code: string) => Promise.reject(new BridgeError(code))

export function connectBridge(deps: { runtime: ChromeRuntimeLike | undefined; sink: ChunkSink; newId?: () => string }): Bridge {
  const { runtime, sink } = deps
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const pending = new Map<string, Pending>()
  const stateFns = new Set<(s: BridgeState) => void>()
  const progressFns = new Set<(p: Progress) => void>()
  let current: BridgeState = 'connecting'
  let port: PortLike | null = null
  /** 확장에서 메시지를 한 번이라도 받았나(곧바로 끊김 = 확장 없음을 가린다) */
  let heard = false

  function setState(next: BridgeState) {
    if (next === current) return
    current = next
    for (const fn of [...stateFns]) fn(next)
  }

  /** 그 요청을 끝낸다. 조각을 받던 요청이면 Worker가 모으던 조각을 버리게 한다 */
  function fail(id: string, req: Pending, code: string) {
    pending.delete(id)
    if (req.kind === 'stream') sink.abort(id, code)
    req.reject(new BridgeError(code))
  }

  /** 연결이 끝났다: 기다리던 요청을 모두 끝낸다. hello는 확장 없음·다른 창이면 그 상태로 답한다 */
  function finishAll(next: BridgeState, code: string) {
    setState(next)
    for (const [id, req] of [...pending]) {
      if (req.kind === 'hello' && (next === 'no-extension' || next === 'busy')) {
        pending.delete(id)
        req.resolve(helloState(next))
      } else fail(id, req, code)
    }
  }

  function dropPort(next: BridgeState, code: string) {
    const old = port
    port = null
    old?.disconnect()
    finishAll(next, code)
  }

  function onDisconnect(from: ChromeRuntimeLike) {
    // 크롬은 끊김 까닭을 lastError에 둔다. 읽어 두어야 '확인하지 않은 오류'로 남지 않는다
    const lastError = from.lastError
    port = null
    if (current === 'busy') finishAll('busy', BUSY)
    else if (lastError && !heard) finishAll('no-extension', DISCONNECTED)
    else finishAll('disconnected', DISCONNECTED)
  }

  function onHelloResult(id: string, req: Pending, data: unknown) {
    const hello = checkHello(data)
    if (!hello) return fail(id, req, BAD_REPLY)
    pending.delete(id)
    const check = checkVersions({
      web: WEB_VERSIONS,
      extension: { version: hello.extensionVersion, protocol: hello.extensionProtocol },
      helper: { version: hello.helperVersion, protocol: hello.protocol },
    })
    const state: BridgeState = check.status === 'ok' ? 'ready' : check.status
    setState(state)
    req.resolve({
      state,
      helperVersion: hello.helperVersion,
      extensionVersion: hello.extensionVersion,
      helperUpdateAvailable: check.status === 'ok' && check.helperUpdateAvailable,
    })
  }

  function onResult(id: string, req: Pending, data: unknown) {
    if (req.kind === 'hello') return onHelloResult(id, req, data)
    const ok = req.kind === 'small' ? checkResult(req.cmd as SmallCommand, data) : req.kind === 'save' && isSaved(data)
    // 환자 자료 명령(store.save 말고)에는 result가 오지 않는다(AC-004.6)
    if (!ok) return fail(id, req, BAD_REPLY)
    pending.delete(id)
    req.resolve(data)
  }

  function onError(id: string, req: Pending, code: string) {
    if (code === HELPER_MISSING) setState('no-helper')
    if (req.kind === 'hello' && code === HELPER_MISSING) {
      pending.delete(id)
      req.resolve(helloState('no-helper'))
      return
    }
    fail(id, req, code)
  }

  function onMessage(msg: unknown) {
    heard = true
    if (!isRecord(msg) || typeof msg.id !== 'string') return
    // 확장이 이 연결을 받지 않았다(다른 창이 쓰는 중). id를 모르니 빈 글자로 온다
    if (msg.id === '') {
      if (msg.type === 'error' && msg.code === BUSY) finishAll('busy', BUSY)
      return
    }
    const id = msg.id
    const req = pending.get(id)
    if (!req) return
    const reply = readReply(msg)
    if (!reply) return fail(id, req, BAD_REPLY)
    switch (reply.type) {
      case 'error':
        return onError(id, req, reply.code)
      case 'result':
        return onResult(id, req, reply.data)
      case 'chunk':
        if (req.kind !== 'stream' || reply.seq !== req.next) return fail(id, req, BAD_REPLY)
        req.next++
        sink.chunk(id, reply.seq, reply.data)
        return
      case 'end':
        if (req.kind !== 'stream' || reply.count !== req.next) return fail(id, req, BAD_REPLY)
        pending.delete(id)
        sink.end(id, reply.count, reply.bytes, reply.sha256)
        req.resolve({ id, count: reply.count })
        return
      case 'progress':
        // 진행 숫자는 bit.input에만 온다(AC-004.10). 칸·범위는 readReply가 검사했다
        if (req.cmd !== 'bit.input') return fail(id, req, BAD_REPLY)
        for (const fn of [...progressFns]) fn({ id, done: reply.done, total: reply.total })
        return
    }
  }

  function request<T>(cmd: CommandName, args: Record<string, unknown>, kind: Kind): Promise<T> {
    // 명령은 hello로 버전을 맞춘 뒤(ready)에만 보낸다. hello는 연결이 살아 있으면 언제든(다시 확인)
    const now = current
    const gate = kind === 'hello' ? (port ? null : DISCONNECTED) : now === 'ready' ? null : STATE_CODE[now]
    if (gate) return rejected(gate)
    return new Promise<T>((resolve, reject) => {
      const id = newId()
      pending.set(id, { cmd, kind, next: 0, resolve: resolve as (v: unknown) => void, reject })
      try {
        port!.postMessage({ v: PROTOCOL, id, cmd, args })
      } catch {
        // 이미 끊긴 Port. 크롬은 이때 onDisconnect를 다시 부르지 않는다
        dropPort('disconnected', DISCONNECTED)
      }
    })
  }

  if (runtime && typeof runtime.connect === 'function') {
    try {
      const opened = runtime.connect(EXTENSION_ID)
      port = opened
      opened.onMessage.addListener((m) => {
        if (port === opened) onMessage(m)
      })
      opened.onDisconnect.addListener(() => {
        if (port === opened) onDisconnect(runtime)
      })
    } catch {
      port = null
    }
  }
  if (!port) current = 'no-extension'

  return {
    state: () => current,
    onState(fn) {
      stateFns.add(fn)
      return () => void stateFns.delete(fn)
    },
    onProgress(fn) {
      progressFns.add(fn)
      return () => void progressFns.delete(fn)
    },
    hello() {
      if (!port && (current === 'no-extension' || current === 'busy')) return Promise.resolve(helloState(current))
      return request<HelloResult>('hello', {}, 'hello')
    },
    call<C extends SmallCommand>(cmd: C, args: ArgsOf<C>) {
      if (!isSmallCommand(cmd) || !isRecord(args)) return rejected(REJECTED)
      return request<ResultOf<C>>(cmd, args, 'small')
    },
    stream<C extends PatientCommand>(cmd: C, args: ArgsOf<C>) {
      if (!isPatientCommand(cmd) || !isRecord(args)) return rejected(REJECTED)
      return request<StreamResult>(cmd, args, 'stream')
    },
    send<C extends PatientSendCommand>(cmd: C, payload: string) {
      // payload는 Worker가 만든 JSON 글자. 풀지도 고치지도 않고 args.payload에 그대로 넣는다(AC-004.9)
      if (!isSendCommand(cmd) || typeof payload !== 'string') return rejected(REJECTED)
      return request<SendResult<C>>(cmd, { payload }, cmd === 'store.save' ? 'save' : 'stream')
    },
    close() {
      if (port) dropPort('disconnected', DISCONNECTED)
    },
  }
}
