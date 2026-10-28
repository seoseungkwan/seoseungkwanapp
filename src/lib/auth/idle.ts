// 30분 자동 로그아웃의 시계(REQ-010). 순수 — 창·문서·탭 사이 채널은 부르는 쪽이 넣는다. 브라우저 저장소는 쓰지 않는다

export type IdleDeps = {
  target: EventTarget // 창: 누름·키·스크롤
  doc: Document // 화면 보이기 바뀜
  // 같은 브라우저의 다른 탭. onmessage 인자를 MessageEvent로 두어야 진짜 BroadcastChannel을 그대로 넣을 수 있다(strictFunctionTypes)
  channel?: { postMessage(m: unknown): void; onmessage: ((e: MessageEvent) => void) | null; close(): void }
}

// 움직임으로 치는 것(AC-010.1). 스크롤은 거품이 오르지 않으므로 capture로 안쪽 상자 것까지 받는다
const TARGET_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const
const DOC_EVENT = 'visibilitychange'
const LISTEN = { capture: true, passive: true }
const ACTIVITY = 'activity'

// 마지막 움직임에서 timeoutMs가 지나면 onIdle을 한 번 부르고 스스로 멈춘다. 돌려받은 함수 = 정리(여러 번 불러도 된다)
export function startIdleLogout(opts: { timeoutMs: number; onIdle: () => void } & IdleDeps): () => void {
  const { timeoutMs, onIdle, target, doc, channel } = opts
  let last = Date.now()
  let timer = setTimeout(idle, timeoutMs)
  let stopped = false

  function idle() {
    stop()
    onIdle()
  }

  // 잠자기 등으로 타이머가 밀려 이미 30분이 지났으면, 그 뒤 첫 움직임은 다시 세지 않고 로그아웃한다
  function seen() {
    if (stopped) return false
    if (Date.now() - last >= timeoutMs) {
      idle()
      return false
    }
    last = Date.now()
    clearTimeout(timer)
    timer = setTimeout(idle, timeoutMs)
    return true
  }

  function local() {
    if (seen()) channel?.postMessage(ACTIVITY)
  }

  function stop() {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    for (const type of TARGET_EVENTS) target.removeEventListener(type, local, LISTEN)
    doc.removeEventListener(DOC_EVENT, local, LISTEN)
    if (channel) {
      channel.onmessage = null
      channel.close()
    }
  }

  for (const type of TARGET_EVENTS) target.addEventListener(type, local, LISTEN)
  doc.addEventListener(DOC_EVENT, local, LISTEN)
  if (channel) channel.onmessage = () => void seen() // 다른 탭 소식: 다시 세기만 하고 다시 보내지 않는다

  return stop
}
