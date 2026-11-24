'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReadOnly } from '@/components/shell/viewing'
import { BridgeError } from '@/lib/bridge/protocol'
import { connectScreenBridge, type ScreenBridge, type WorkerLike } from '@/lib/bridge/workerSink'
import type { BridgeState, ChromeRuntimeLike, HelloResult } from '@/types/bridge'
import { enterScreen, leaveScreen } from './bitLane'

// 화면이 쓰는 통로 훅 (design.md 5절·6-1, REQ-006). 환자 자료 구역 밖이다: 화면은 connectScreenBridge에 크롬 runtime과 Worker 객체만 넘기고,
// 상태·버전·검사한 답·진행 숫자만 받는다. 조각과 보낼 글자는 받지 않는다(send 없음 — 보낼 글자는 Worker가 통로 포트로 보낸다, AC-004.11).
// 화면을 떠나면 연결을 닫는다(창 하나 규칙: 확장은 웹 연결을 하나만 받는다). 연결 상태·버전은 어디에도 기억하지 않는다(열 때마다 hello)
// 비트 통로 차례(admin-view AC-8021.8, bitLane): 붙기 전 enterScreen, 닫을 때·떠날 때 leaveScreen. 저절로 올리기가 쥐고 있으면 끊기를 알리고 놓인 뒤 붙는다.
// 쥔 쪽이 없으면 지금과 같은 차례로 바로 붙는다.
// 다른 의원을 보는 중(admin-view AC-8008.4, useReadOnly)이면 이 PC 비트에 붙지 않는다: chrome.runtime을 건드리지 않고 통로 차례에도 들지 않으며,
// 상태는 no-extension이고 call·stream은 보내지 않고 E-EXT-MISSING으로 끝난다

export type UseBridge = {
  state: BridgeState
  hello: HelloResult | null
  /**
   * hello가 상태를 바꾸지 않고 오류 번호로 끝났다(모르는 모양의 hello 답 E-BRIDGE-BAD-REPLY, E-HELPER-MISSING 밖의 오류 답 등).
   * 그때 state는 'connecting'에 머문다 → 화면은 이 번호를 보이고 [다시 확인]을 열어 둔다
   */
  helloError: string | null
  helperUpdateAvailable: boolean
  call: ScreenBridge['call']
  stream: ScreenBridge['stream']
  onProgress: ScreenBridge['onProgress']
  /** 지금 연결을 닫는다. 기다리던 요청은 E-BRIDGE-DISCONNECTED로 끝나고 상태는 disconnected다(stats AC-514.12) */
  close: ScreenBridge['close']
  /** 다시 확인: 붙어 있으면 같은 연결로 hello부터, 끊겼거나 막혔으면 새 연결로 */
  retry(): void
}

/** 크롬은 우리 확장(externally_connectable)이 있는 PC 크롬에서만 웹 페이지에 chrome.runtime을 준다 */
function chromeRuntime(): ChromeRuntimeLike | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
}

const notOpen = () => Promise.reject(new BridgeError('E-BRIDGE-REJECTED'))
const missing = () => Promise.reject(new BridgeError('E-EXT-MISSING'))
/** 보는 중의 hello: 확장이 없는 브라우저와 같은 값 */
const VIEW_HELLO: HelloResult = { state: 'no-extension', helperUpdateAvailable: false }
const VIEW_COMMANDS = {
  call: (() => missing()) as ScreenBridge['call'],
  stream: (() => missing()) as ScreenBridge['stream'],
  onProgress: (() => () => {}) as ScreenBridge['onProgress'],
  close: () => {},
}
const codeOf = (e: unknown) => (e instanceof BridgeError ? e.code : 'E-BRIDGE-REJECTED')

/** worker는 같은 객체를 계속 넘긴다(바뀌면 새로 붙는다) */
export function useBridge(opts?: { worker?: WorkerLike }): UseBridge {
  const worker = opts?.worker
  const readOnly = useReadOnly()
  const bridgeRef = useRef<ScreenBridge | null>(null)
  /** hello를 기다리는 중. 통로는 hello 답을 주기 전에 상태부터 바꾼다 → 그동안 상태는 hello 답과 함께 바꿔 둘이 어긋나지 않게 한다 */
  const helloPending = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<BridgeState>('connecting')
  const [hello, setHello] = useState<HelloResult | null>(null)
  const [helloError, setHelloError] = useState<string | null>(null)

  /** 그 연결의 hello. 그동안 화면을 바꿨거나 새로 붙었으면 버린다. 끊긴 연결의 hello는 E-BRIDGE-DISCONNECTED로 거절된다 */
  const runHello = useCallback((bridge: ScreenBridge) => {
    helloPending.current = true
    setHelloError(null)
    bridge.hello().then(
      (h) => {
        if (bridgeRef.current !== bridge) return
        helloPending.current = false
        setHello(h)
        setState(h.state)
      },
      (e: unknown) => {
        if (bridgeRef.current !== bridge) return
        helloPending.current = false
        setHelloError(codeOf(e))
        setState(bridge.state())
      },
    )
  }, [])

  useEffect(() => {
    if (readOnly) return
    let gone = false
    let bridge: ScreenBridge | null = null
    let unsubscribe = () => {}
    // 통로 차례가 비면 붙는다(바로, 또는 저절로 올리기가 놓은 뒤). 그 전에 떠났으면 붙지 않는다
    const connect = () => {
      if (gone) return
      const opened = connectScreenBridge({ runtime: chromeRuntime(), worker })
      bridge = opened
      bridgeRef.current = opened
      setHello(null)
      setState(opened.state())
      unsubscribe = opened.onState((s) => {
        if (bridgeRef.current === opened && !helloPending.current) setState(s)
      })
      runHello(opened)
    }
    if (enterScreen(connect)) connect()
    else {
      setHello(null)
      setState('connecting')
    }
    return () => {
      gone = true
      unsubscribe()
      const opened: ScreenBridge | null = bridge
      if (opened !== null) {
        if (bridgeRef.current === opened) bridgeRef.current = null
        opened.close()
      }
      leaveScreen(connect)
    }
  }, [attempt, worker, runHello, readOnly])

  const retry = useCallback(() => {
    const bridge = bridgeRef.current
    // 붙어 있으면 같은 연결로 다시 묻는다. 새로 붙으면 확장이 아직 옛 연결을 잡고 있어 다른 창(E-BRIDGE-BUSY)으로 볼 수 있다
    if (bridge && bridge.state() === 'ready') {
      setHello(null)
      setState('connecting')
      runHello(bridge)
      return
    }
    setAttempt((n) => n + 1)
  }, [runHello])

  const commands = useMemo(
    () => ({
      call: ((cmd, args) => bridgeRef.current?.call(cmd, args) ?? notOpen()) as ScreenBridge['call'],
      stream: ((cmd, args) => bridgeRef.current?.stream(cmd, args) ?? notOpen()) as ScreenBridge['stream'],
      onProgress: ((fn) => bridgeRef.current?.onProgress(fn) ?? (() => {})) as ScreenBridge['onProgress'],
      close: () => bridgeRef.current?.close(),
    }),
    [],
  )

  if (readOnly) return { state: 'no-extension', hello: VIEW_HELLO, helloError: null, helperUpdateAvailable: false, ...VIEW_COMMANDS, retry }
  return { state, hello, helloError, helperUpdateAvailable: hello?.helperUpdateAvailable ?? false, ...commands, retry }
}
