import { readUisFiles, type UisWorkerMessage, type UisWorkerRequest } from './readUisFiles'

// Web Worker 안. 의사랑 엑셀 바이트를 받아 읽고 숫자만 돌려준다(specs/uisarang-upload). 환자 자료 구역: 네트워크·console·저장소 없음.
// 환자 줄(차트번호·주민번호·이름·전화·주소)은 이 안에서만 읽고 나이대 수·날 숫자로만 바뀐다

// tsconfig lib가 dom이라 Worker 전역 타입이 없다. 쓰는 두 가지만 적는다
type WorkerScope = {
  onmessage: ((event: MessageEvent<UisWorkerRequest>) => void) | null
  postMessage(message: UisWorkerMessage): void
}

const scope = self as unknown as WorkerScope
const send = (message: UisWorkerMessage) => scope.postMessage(message)

scope.onmessage = (event) => {
  try {
    const { files, today } = event.data
    const results = readUisFiles(
      files.map((slot) => (typeof slot === 'string' ? slot : new Uint8Array(slot))), // 글자 = 화면이 꺼내지 못한 자리의 번호
      today,
    )
    send({ type: 'done', results })
  } catch {
    // 예외 메시지·스택에는 파일 내용 조각이 섞일 수 있어 번호만 보낸다
    send({ type: 'failed', code: 'E-ANALYZE-FAILED' })
  }
}
