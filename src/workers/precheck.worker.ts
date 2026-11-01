import type { PrecheckToScreen } from '@/types/precheck'
import { createPrecheckJobs } from './precheck/jobs'

// 청구 사전점검 Web Worker 입구(design.md 6-2) [환자 자료 구역]. 메시지를 jobs.ts에 잇기만 한다(시험은 jobs를 바로 부른다).
// 화면이 처음 보내는 {type: 'bridge-port'}의 MessagePort(lib/bridge/workerSink가 만든 통로 전용 포트)로 조각·end·abort가 온다.
// 화면 메시지 길과 따로다(AC-004.11). 화면에는 jobs가 만든 숫자·달·오류 번호·규칙 목록만 보낸다(조각 글자·풀린 자료는 보내지 않는다)

// tsconfig lib가 dom이라 Worker 전역 타입이 없다. 쓰는 두 가지만 적는다
type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage(message: PrecheckToScreen): void
}

const scope = self as unknown as WorkerScope
const jobs = createPrecheckJobs({ post: (message) => scope.postMessage(message) })

scope.onmessage = (event) => {
  const message: unknown = event.data
  if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'bridge-port') {
    const port = event.ports[0]
    if (!port) return
    // 옛 포트를 여기서 닫지 않는다. 화면이 abort를 보내고 통로를 닫자마자 새 포트를 주면, 닫는 순간 아직 안 닿은 abort가 사라져
    // 조각이 Worker 메모리에 남는다. 옛 포트는 화면 쪽이 닫으면(workerSink close) 보낸 메시지를 다 전한 뒤 끝난다
    port.onmessage = (portEvent: MessageEvent) => void jobs.fromPort(portEvent.data)
    return
  }
  void jobs.fromScreen(message)
}
