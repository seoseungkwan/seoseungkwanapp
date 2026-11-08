import type { StatsWorkerMessage, StatsWorkerRequest } from '@/types/stats'
import { createStatsHost } from './stats/jobs'

// Web Worker 안. 일은 stats/jobs.ts가 하고 여기서는 포트와 잇기만 한다. 환자 자료 구역: 네트워크·console 없음

// tsconfig lib가 dom이라 Worker 전역 타입이 없다. 쓰는 두 가지만 적는다
type WorkerScope = {
  onmessage: ((event: MessageEvent<StatsWorkerRequest>) => void) | null
  postMessage(message: StatsWorkerMessage): void
}

const scope = self as unknown as WorkerScope
const host = createStatsHost((message) => scope.postMessage(message))

scope.onmessage = (event) => {
  const message = event.data
  if (message.type === 'bridge-port') {
    // 통로 조각은 이 포트로만 온다(lib/bridge/workerSink.ts)
    const [port] = event.ports
    port.onmessage = (portEvent) => host.fromBridge(portEvent.data)
  } else if (message.type === 'load') {
    void host.load(message)
  } else if (message.type === 'split') {
    host.split(message)
  } else if (message.type === 'sections') {
    host.sections(message)
  }
}
