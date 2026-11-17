'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ScreenBridge, WorkerLike } from '@/lib/bridge/workerSink'
import type { RxGroupDef } from '@/types/analysis'
import type { RsvKindDef, SunapTotals } from '@/types/sunap'
import type { SunapLedgerView, SunapOp, SunapPatch, SunapScreenMessage, SunapStreamRef, SunapWorkerMessage } from '@/workers/sunap/messages'

// 수납일지 장부 Worker 흐름(spec sunap-ilji design.md 'Worker 메시지', 본보기 patients/usePatientsWorker).
// 화면은 두 스트림(contact.targets kind 'sunap' · store.load 그 달)을 열어 {id}·오류 번호만 Worker에 넘기고, 장부 보기·마감 숫자·오류 번호만 받는다.
// 조각과 store.save 글자는 통로 포트로만 오간다(useBridge가 Worker에 포트를 준다).
// 불러오기마다 흐름 번호를 늘린다: 늦게 끝난 앞 흐름의 스트림은 Worker에 보내지 않고, 지금 날이 아닌 장부 보기는 쓰지 않는다.
// close는 closed 답(서버에 올릴 숫자)이나 close 오류로, reopen은 다음 장부 보기나 reopen 오류로 풀린다(한 번에 하나씩, 화면이 단추를 막는다)

type WorkerEventType = 'message' | 'error' | 'messageerror'
export type SunapWorkerHandle = WorkerLike & {
  addEventListener(type: WorkerEventType, listener: (event: Event) => void): void
  removeEventListener(type: WorkerEventType, listener: (event: Event) => void): void
}
export type SunapBridge = Pick<ScreenBridge, 'stream'>

/** 불러올 날과 장부 설정(다음 예약 종류 목록·Block·물리치료 묶음 정의, 안 골랐으면 null) */
export type SunapAsk = { day: string; kinds: RsvKindDef[]; blockDef: RxGroupDef | null; ptDef: RxGroupDef | null }
export type SunapClosed = { day: string; totals: SunapTotals; late: boolean }
export type SunapFailure = { code: string }

export type SunapWorkerApi = {
  view: SunapLedgerView | null
  loading: boolean
  /** 그 날 장부가 마지막으로 온 시각(비트에서 HH:mm 불러옴) */
  loadedAt: Date | null
  error: { op: SunapOp; code: string } | null
  load(ask: SunapAsk): void
  edit(chart: string, patch: SunapPatch): void
  close(): Promise<SunapClosed | SunapFailure>
  reopen(): Promise<{ ok: true } | SunapFailure>
}

const REJECTED = 'E-BRIDGE-REJECTED'
const FAILED = 'E-ANALYZE-FAILED'

// 번호가 있는 오류만 번호로 알린다. 다른 오류의 글은 싣지 않는다
const opened = (stream: Promise<{ id: string }>): Promise<SunapStreamRef> =>
  stream.then(
    ({ id }) => ({ id }),
    (error: unknown) => ({ code: error instanceof BridgeError ? error.code : REJECTED }),
  )

/** Worker를 한 번 만들고 화면을 떠나면 끝낸다. 만들기 전에는 null — 통로(useBridge)는 Worker가 생긴 뒤에 연다 */
export function useSunapWorkerObject(): Worker | null {
  const [worker, setWorker] = useState<Worker | null>(null)
  useEffect(() => {
    const created = new Worker(new URL('@/workers/sunap.worker.ts', import.meta.url), { type: 'module' })
    setWorker(created)
    return () => created.terminate()
  }, [])
  return worker
}

export function useSunapWorker(bridge: SunapBridge, worker: SunapWorkerHandle): SunapWorkerApi {
  const { stream } = bridge
  const [view, setView] = useState<SunapLedgerView | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [error, setError] = useState<SunapWorkerApi['error']>(null)
  const flow = useRef(0)
  const day = useRef<string | null>(null)
  const loadingNow = useRef(false)
  const closing = useRef<((result: SunapClosed | SunapFailure) => void) | null>(null)
  const reopening = useRef<((result: { ok: true } | SunapFailure) => void) | null>(null)

  const send = useCallback((message: SunapScreenMessage) => worker.postMessage(message, []), [worker])

  const settleAll = useCallback((code: string) => {
    closing.current?.({ code })
    reopening.current?.({ code })
    closing.current = null
    reopening.current = null
  }, [])

  useEffect(() => {
    const onMessage = (event: Event) => {
      const message = (event as MessageEvent<SunapWorkerMessage>).data
      if (message.type === 'ledger') {
        if (message.day !== day.current) return
        const { day: viewDay, unsure, rows, paid, closedAt, late, totals, doctors } = message
        setView({ day: viewDay, unsure, rows, paid, closedAt, late, totals, doctors })
        setError(null)
        if (loadingNow.current) {
          loadingNow.current = false
          setLoading(false)
          setLoadedAt(new Date())
        }
        reopening.current?.({ ok: true })
        reopening.current = null
        return
      }
      if (message.type === 'closed') {
        closing.current?.({ day: message.day, totals: message.totals, late: message.late })
        closing.current = null
        return
      }
      if (message.type !== 'error') return
      if (message.op === 'close') {
        closing.current?.({ code: message.code })
        closing.current = null
        return
      }
      if (message.op === 'reopen') {
        reopening.current?.({ code: message.code })
        reopening.current = null
        return
      }
      if (message.op === 'load') {
        if (!loadingNow.current) return
        loadingNow.current = false
        setLoading(false)
      }
      setError({ op: message.op, code: message.code })
    }
    // 스크립트를 못 불러옴·잡히지 않은 예외: 그 Worker는 더 쓰지 않는다(화면을 다시 열면 새로 만든다)
    const onFail = (event: Event) => {
      event.preventDefault()
      loadingNow.current = false
      setLoading(false)
      setError({ op: 'load', code: FAILED })
      settleAll(FAILED)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onFail)
    worker.addEventListener('messageerror', onFail)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onFail)
      worker.removeEventListener('messageerror', onFail)
    }
  }, [worker, settleAll])

  const load = useCallback(
    (ask: SunapAsk) => {
      const mine = ++flow.current
      if (day.current !== ask.day) setView(null)
      day.current = ask.day
      loadingNow.current = true
      setLoading(true)
      setError(null)
      // 앞 날에 하던 마감·풀기는 Worker가 버린다
      settleAll(REJECTED)
      void Promise.all([
        opened(stream('contact.targets', { kind: 'sunap', from: ask.day, to: ask.day })),
        opened(stream('store.load', { months: [ask.day.slice(0, 7)] })),
      ]).then(([targets, store]) => {
        if (mine !== flow.current) return
        send({ type: 'load', day: ask.day, kinds: ask.kinds, blockDef: ask.blockDef, ptDef: ask.ptDef, targets, store })
      })
    },
    [send, settleAll, stream],
  )

  const edit = useCallback((chart: string, patch: SunapPatch) => send({ type: 'edit', chart, patch }), [send])

  const close = useCallback(
    () =>
      new Promise<SunapClosed | SunapFailure>((resolve) => {
        closing.current?.({ code: REJECTED })
        closing.current = resolve
        send({ type: 'close', now: Date.now() })
      }),
    [send],
  )

  const reopen = useCallback(
    () =>
      new Promise<{ ok: true } | SunapFailure>((resolve) => {
        reopening.current?.({ code: REJECTED })
        reopening.current = resolve
        send({ type: 'reopen' })
      }),
    [send],
  )

  return { view, loading, loadedAt, error, load, edit, close, reopen }
}
