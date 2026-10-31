// 웹 ↔ 확장 ↔ 도우미 메시지 모양(design.md 4-2·6-1, REQ-004). 명령 이름은 src/lib/bridge/commands.json과 같다
// (protocol.test.ts가 맞춰 본다)

/** 숫자·상태 명령: 답은 result 하나(모양을 검사해 돌려준다, AC-004.6). hello는 Bridge.hello()로만 부른다 */
export type SmallCommand = 'bit.check' | 'bit.register' | 'claim.dates'
/** 환자 자료 명령: 답은 늘 chunk … end(통로는 풀지 않는다, AC-004.5) */
export type PatientCommand = 'claim.month' | 'claim.memos' | 'store.load' | 'sam.latest' | 'contact.targets' | 'stats.rows'
/** 보내는 명령: Worker가 만든 JSON 글자를 args.payload에 그대로(AC-004.9) */
export type PatientSendCommand = 'store.save' | 'bit.input'
export type CommandName = 'hello' | SmallCommand | PatientCommand | PatientSendCommand

type Empty = Record<string, never>
type Period = { from: string; to: string } // YYYY-MM-DD

/** 명령별 args 모양(도우미가 commands.json으로 다시 검사한다) */
export type ArgsMap = {
  hello: Empty
  'bit.check': Empty
  'bit.register': Empty
  'claim.dates': Period
  'claim.month': Period
  'claim.memos': Period
  'store.load': { months?: string[]; settings?: boolean; contact?: boolean }
  'sam.latest': Empty
  'contact.targets': Period & { kind: 'followup' | 'injection' }
  'stats.rows': Period
}
export type ArgsOf<C extends keyof ArgsMap> = ArgsMap[C]

/** bit.check 단계: 비트 찾기 → DB 읽기 → 등록 확인 (AC-005.7) */
export type BitCheckStepName = 'find' | 'db' | 'registration'
export type BitCheckStep = { name: BitCheckStepName; ok: boolean; code?: string }
export type DayCount = { date: string; visits: number; memoInBit: number }

export type ResultMap = {
  // 병원 이름은 없다: 화면은 사이트가 가진 병원 이름을 쓴다 (AC-005.10)
  'bit.check': { steps: BitCheckStep[]; registered: boolean; institutionCode?: string }
  'bit.register': { registered: boolean }
  'claim.dates': { days: DayCount[] }
}
export type ResultOf<C extends SmallCommand> = ResultMap[C]

/** 환자 자료 답이 끝났다: 조각은 sink(Worker)로 갔고, 부른 쪽에는 이것만 */
export type StreamResult = { id: string; count: number }
export type SendResult<C extends PatientSendCommand> = C extends 'store.save' ? { saved: true } : StreamResult

// 웹 → 확장 → 도우미
export type Request = { v: 1; id: string; cmd: CommandName; args: Record<string, unknown> }
export type SendRequest = { v: 1; id: string; cmd: PatientSendCommand; args: { payload: string } }
// 도우미 → 확장 → 웹 (메시지 하나 ≤ 1MB)
export type Reply =
  | { v: 1; id: string; type: 'result'; data: unknown }
  | { v: 1; id: string; type: 'chunk'; seq: number; data: string }
  | { v: 1; id: string; type: 'end'; count: number; bytes: number; sha256: string }
  | { v: 1; id: string; type: 'progress'; done: number; total: number }
  | { v: 1; id: string; type: 'error'; code: string }

export type BridgeState =
  | 'connecting'
  | 'ready'
  | 'no-extension'
  | 'no-helper'
  | 'busy'
  | 'update-helper'
  | 'update-extension'
  | 'disconnected'

/** 환자 자료 조각을 받는 곳(Worker 전용 포트). 통로는 data를 풀지 않고 넘긴다 */
export type ChunkSink = {
  chunk(id: string, seq: number, data: string): void
  end(id: string, count: number, bytes: number, sha256: string): void
  abort(id: string, code: string): void
}

/** hello 결과. 버전을 받지 못한 상태(no-extension·no-helper·busy)에는 버전 칸이 없다 */
export type HelloResult = {
  state: BridgeState
  helperVersion?: string
  extensionVersion?: string
  helperUpdateAvailable: boolean
}

export type Progress = { id: string; done: number; total: number }

/** 통로가 쓰는 chrome.runtime 모양만. 진짜 chrome.runtime이 이 모양에 맞는다(client.test.ts 타입 시험) */
export type PortLike = {
  postMessage(message: unknown): void
  disconnect(): void
  onMessage: { addListener(fn: (message: unknown) => void): void }
  onDisconnect: { addListener(fn: () => void): void }
}
export type ChromeRuntimeLike = {
  connect(extensionId: string): PortLike
  lastError?: { message?: string }
}

export type Bridge = {
  state(): BridgeState
  onState(fn: (s: BridgeState) => void): () => void
  /** bit.input 진행(숫자만, AC-004.10) */
  onProgress(fn: (p: Progress) => void): () => void
  /** 버전 맞추기까지(AC-004.3·004.4) */
  hello(): Promise<HelloResult>
  /** 숫자·상태 명령(답 모양 검사, AC-004.6) */
  call<C extends SmallCommand>(cmd: C, args: ArgsOf<C>): Promise<ResultOf<C>>
  /** 환자 자료 명령: 조각은 sink로, 약속은 {id, count}(AC-004.5) */
  stream<C extends PatientCommand>(cmd: C, args: ArgsOf<C>): Promise<StreamResult>
  /** Worker가 만든 JSON 글자를 봉투 args.payload에 그대로(AC-004.9) */
  send<C extends PatientSendCommand>(cmd: C, payload: string): Promise<SendResult<C>>
  close(): void
}
