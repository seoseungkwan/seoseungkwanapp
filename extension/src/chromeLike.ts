// 확장이 쓰는 chrome의 모양만 적어 둔다. 시험은 이 모양의 가짜 chrome을 넣는다(design.md 3절, TASK-3)
// 진짜 chrome(@types/chrome)이 이 모양에 맞는지는 `npm run ext:build`(tsc)가 background.ts에서 확인한다

export type PortLike = {
  name?: string
  sender?: { origin?: string }
  postMessage(m: unknown): void
  disconnect(): void
  onMessage: { addListener(fn: (m: unknown) => void): void }
  onDisconnect: { addListener(fn: () => void): void }
}

export type ChromeLike = {
  runtime: {
    onConnectExternal: { addListener(fn: (p: PortLike) => void): void }
    connectNative(host: string): PortLike
    lastError?: { message?: string }
  }
}
