// 확장이 쓰는 chrome의 모양만 적어 둔다. 시험은 이 모양의 가짜 chrome을 넣는다(design.md 3절, TASK-3)
// 진짜 chrome(@types/chrome)이 이 모양에 맞는지는 `npm run ext:build`(tsc)가 background.ts에서 확인한다

export type WindowStateLike = 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'locked-fullscreen'

export type PortLike = {
  name?: string
  /** 웹 연결을 연 탭에서는 창 번호만 쓴다(AC-038.1) */
  sender?: { origin?: string; tab?: { windowId?: number } }
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
  /** 창 상태만 읽고 바꾼다. manifest 권한이 필요 없다(design.md 19-8, AC-038.3) */
  windows: {
    get(windowId: number, callback: (win?: { state?: WindowStateLike }) => void): void
    update(windowId: number, info: { state: WindowStateLike }, callback: () => void): void
  }
}
