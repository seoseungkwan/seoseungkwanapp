import { createHandler } from './sunap/handler'

// 수납일지 장부 Web Worker 입구(spec sunap-ilji design.md 'Worker 메시지') [환자 자료 구역]. 메시지를 sunap/handler.ts에 잇기만 한다(시험은 handler를 바로 부른다).
// 화면이 처음 보내는 {type: 'bridge-port'}의 MessagePort(lib/bridge/workerSink가 만든 통로 전용 포트)로 조각·end·abort·sent가 온다.
// 주고받는 메시지 모양은 sunap/messages.ts

// tsconfig lib가 dom이라 Worker 전역 타입이 없다. 쓰는 두 가지만 적는다
type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage(message: unknown): void
}

const scope = self as unknown as WorkerScope
const handler = createHandler({ post: (message) => scope.postMessage(message) })

scope.onmessage = (event) => {
  const message: unknown = event.data
  if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'bridge-port') {
    const port = event.ports[0]
    if (!port) return
    // 옛 포트를 여기서 닫지 않는다(화면이 닫자마자 새 포트를 주면 아직 안 닿은 abort가 사라진다)
    port.onmessage = (portEvent: MessageEvent) => handler.onPort(portEvent.data)
    handler.setPort(port)
    return
  }
  handler.onScreen(message)
}
