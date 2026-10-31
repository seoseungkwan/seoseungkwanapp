// 화면이 쓰는 통로 입구(design.md 5절·6-1, AC-004.11) [환자 자료 구역]. 화면은 Worker 객체만 넘긴다.
// 환자 자료 조각·end·abort와 Worker가 만든 보낼 글자(store.save·bit.input)는 여기서 만든 MessageChannel 포트로만
// Worker와 오간다. 화면이 받는 것은 상태·숫자·검사한 답·진행 숫자·{id, count}·오류 번호뿐이고 send는 없다
import type { Bridge, ChromeRuntimeLike, ChunkSink, PatientSendCommand } from '@/types/bridge'
import { connectBridge } from './client'
import { BridgeError, isRecord } from './protocol'

export type WorkerLike = { postMessage(message: unknown, transfer: Transferable[]): void }
/** 화면은 보낼 글자를 쥐지 않는다 */
export type ScreenBridge = Omit<Bridge, 'send'>

/** worker가 없으면(설치 화면) 조각은 울타리 안에서 버린다 */
const DISCARD: ChunkSink = { chunk() {}, end() {}, abort() {} }

// 통로 → Worker: {type: 'chunk'|'end'|'abort', …}
function portSink(port: MessagePort): ChunkSink {
  return {
    chunk: (id, seq, data) => port.postMessage({ type: 'chunk', id, seq, data }),
    end: (id, count, bytes, sha256) => port.postMessage({ type: 'end', id, count, bytes, sha256 }),
    abort: (id, code) => port.postMessage({ type: 'abort', id, code }),
  }
}

/** Worker가 붙인 표(어느 보내기의 답인지). 글자(64자 이하) 또는 정수 */
const isTicket = (x: unknown): x is string | number =>
  (typeof x === 'string' && x.length >= 1 && x.length <= 64) || Number.isSafeInteger(x)

export function connectScreenBridge(deps: {
  runtime: ChromeRuntimeLike | undefined
  worker?: WorkerLike
  newId?: () => string
}): ScreenBridge {
  let port: MessagePort | null = null
  if (deps.worker) {
    const channel = new MessageChannel()
    port = channel.port1
    deps.worker.postMessage({ type: 'bridge-port' }, [channel.port2])
  }
  const bridge = connectBridge({ runtime: deps.runtime, sink: port ? portSink(port) : DISCARD, newId: deps.newId })

  if (port) {
    const toWorker = port
    // Worker → 통로: {type: 'send', ticket, cmd, payload} → 통로 → Worker: {type: 'sent', ticket, ok, …}
    toWorker.onmessage = (event: MessageEvent) => {
      const m: unknown = event.data
      if (!isRecord(m) || m.type !== 'send' || !isTicket(m.ticket)) return
      const ticket = m.ticket
      // cmd·payload는 bridge.send가 검사한다(store.save·bit.input, 글자만. 아니면 E-BRIDGE-REJECTED)
      bridge.send(m.cmd as PatientSendCommand, m.payload as string).then(
        (r) =>
          toWorker.postMessage(
            'id' in r ? { type: 'sent', ticket, ok: true, id: r.id, count: r.count } : { type: 'sent', ticket, ok: true },
          ),
        (e: unknown) =>
          toWorker.postMessage({ type: 'sent', ticket, ok: false, code: e instanceof BridgeError ? e.code : 'E-BRIDGE-REJECTED' }),
      )
    }
  }

  return {
    state: bridge.state,
    onState: bridge.onState,
    onProgress: bridge.onProgress,
    hello: bridge.hello,
    call: bridge.call,
    stream: bridge.stream,
    close() {
      bridge.close()
      port?.close()
    },
  }
}
