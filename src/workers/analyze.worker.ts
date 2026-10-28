import type { WorkerMessage, WorkerRequest } from '@/types/analyze'
import { analyzeFiles } from './analyzeFiles'

// Web Worker 안. 바이트를 받아 읽고 세고 요약해 돌려준다(화면이 멈추지 않게). 환자 자료 구역: 네트워크·console 없음

// tsconfig lib가 dom이라 Worker 전역 타입이 없다. 쓰는 두 가지만 적는다
type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerMessage): void
}

const scope = self as unknown as WorkerScope
const send = (message: WorkerMessage) => scope.postMessage(message)

scope.onmessage = (event) => {
  try {
    const { files, today, groups } = event.data
    const output = analyzeFiles(
      files.map((slot) => (typeof slot === 'string' ? slot : new Uint8Array(slot))), // 글자 = 화면이 못 꺼낸 자리의 번호
      today,
      groups ?? [], // 그룹이 없는 요청도 받는다
      (done, total) => send({ type: 'progress', done, total }),
    )
    send({ type: 'done', output })
  } catch {
    // 예외 메시지·스택에는 파일 내용 조각이 섞일 수 있어 번호만 보낸다
    send({ type: 'failed', code: 'E-ANALYZE-FAILED' })
  }
}
