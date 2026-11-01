'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ScreenBridge, WorkerLike } from '@/lib/bridge/workerSink'
import type {
  ContactCount,
  FollowupView,
  PatientsRange,
  PatientsScreenMessage,
  PatientsWorkerMessage,
  RecallView,
  TargetsKind,
  ViewCodes,
} from '@/types/patients'

// 환자 탭 Worker 흐름(design.md '데이터 흐름'·'Worker 메시지 약속'). 화면은 스트림의 {id}와 오류 번호만 Worker에 알리고, 조각·보낼 글자는 받지 않는다.
// 흐름 한 번: store.load → stored → plan → F/U 조각 차례로 → 정기 주사 조각 차례로 → build → views. 종류마다 따로(AC-604.3): 한 종류가 실패하면 그 종류 읽기만 멈춘다.
//
// store.load는 들어올 때 한 번, 그 뒤에는 [다시 불러오기](reload)로만 부른다. 도우미는 E-STORE-BROKEN을 한 번만 알리고 다음 읽기에는 빈 값을 주므로
// 저절로 다시 부르면 그 오류를 보이지 못한 채 빈 표시로 시작한다(ContactStore.cs). 그래서 effect가 다시 돌아도(StrictMode·deps 바뀜) 부르지 않는다.
//
// reload: Worker에 {type: 'reload'}를 새 스트림보다 먼저 보내고, 그 뒤 옛 흐름의 스트림 결과는 Worker에 보내지 않는다. handler는 옛 흐름을 가려내지 못한다 —
// 다음 plan 뒤에 온 옛 piece는 그 종류를 E-BRIDGE-BAD-REPLY로 실패시키고, 옛 stored는 저장 상태를 실패로 만든다.
// 흐름마다 자기 Flow를 갖고, 지금 Flow가 아닌 흐름의 스트림 결과와 그 흐름이 기다리던 Worker 답은 버린다.

export type PatientsBridge = Pick<ScreenBridge, 'stream'>
export type PatientsWorkerHandle = WorkerLike & {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

export type ReadProgress = { done: number; total: number }
export type PatientsViews = { followup: FollowupView | null; recall: RecallView | null; codes: ViewCodes }
/** 도구가 Worker에 보내는 것(TASK-11~) */
export type ToolRequest = Extract<PatientsScreenMessage, { type: 'filter' | 'mark' }>
/** 도구가 Worker에게 받는 것(TASK-11~) */
export type ToolReply = Extract<PatientsWorkerMessage, { type: 'filtered' | 'marked' }>

export type PatientsWorkerApi = {
  status: 'loading' | 'done'
  progress: { followup: ReadProgress; recall: ReadProgress }
  views: PatientsViews | null
  /** 올릴 건수: views·marked 중 나중 것. 올리면 안 될 때는 Worker가 null을 준다(AC-604.5) */
  counts: ContactCount | null
  /** [다시 불러오기] */
  reload(): void
  post(message: ToolRequest): void
  /** 받기를 그만두는 함수를 돌려준다 */
  listen(listener: (message: ToolReply) => void): () => void
}

type Loaded = Pick<PatientsWorkerApi, 'status' | 'progress' | 'views' | 'counts'>
const LOADING: Loaded = {
  status: 'loading',
  progress: { followup: { done: 0, total: 0 }, recall: { done: 0, total: 0 } },
  views: null,
  counts: null,
}

type Flow = {
  /** 이 흐름이 기다리는 Worker 답(stored·plan·piece:<id>). 답이 오면 지운다 */
  waiting: Map<string, (message: PatientsWorkerMessage) => void>
  /** build를 보냈다. 그 전에 오는 views는 옛 흐름의 것이다 */
  built: boolean
}
const newFlow = (): Flow => ({ waiting: new Map(), built: false })

type Opened = { id: string } | { code: string }
// 번호가 있는 오류만 번호로 알린다. 다른 오류의 글은 싣지 않는다
const opened = (stream: Promise<{ id: string }>): Promise<Opened> =>
  stream.then(
    ({ id }) => ({ id }),
    (error: unknown) => ({ code: error instanceof BridgeError ? error.code : 'E-BRIDGE-REJECTED' }),
  )

/**
 * Worker를 한 번 만들고 화면을 떠나면 끝낸다. 만들기 전에는 null이다 — 통로(useBridge)는 Worker가 생긴 뒤에 열어야 한다.
 * Worker 없이 먼저 열고 다시 붙으면 확장이 아직 옛 연결을 잡고 있어 다른 창(E-BRIDGE-BUSY)으로 볼 수 있다
 */
export function usePatientsWorkerObject(): Worker | null {
  const [worker, setWorker] = useState<Worker | null>(null)
  useEffect(() => {
    const created = new Worker(new URL('@/workers/patients.worker.ts', import.meta.url), { type: 'module' })
    setWorker(created)
    return () => created.terminate()
  }, [])
  return worker
}

/** worker는 useBridge에 넘긴 것과 같은 객체다(통로 포트를 받는 쪽). 통로가 ready일 때 부른다 */
export function usePatientsWorker(bridge: PatientsBridge, worker: PatientsWorkerHandle): PatientsWorkerApi {
  const { stream } = bridge
  const [loaded, setLoaded] = useState<Loaded>(LOADING)
  const flowRef = useRef<Flow | null>(null)
  const mounted = useRef(false)
  const started = useRef(false)
  const listeners = useRef(new Set<(message: ToolReply) => void>())

  const send = useCallback((message: PatientsScreenMessage) => worker.postMessage(message, []), [worker])

  const read = useCallback(
    async (flow: Flow) => {
      const alive = () => mounted.current && flowRef.current === flow
      // 답이 먼저 오지 못하게 보내기 전에 부른다
      const replyTo = (key: string) =>
        new Promise<PatientsWorkerMessage>((resolve) => {
          flow.waiting.set(key, resolve)
        })
      // 이 흐름의 날짜 하나. 읽는 사이 자정이 지나도 plan과 build가 같은 날을 본다
      const today = todayInKorea()

      const readKind = async (kind: TargetsKind, ranges: readonly PatientsRange[]) => {
        const name = kind === 'followup' ? 'followup' : 'recall'
        for (const [index, range] of ranges.entries()) {
          const piece = await opened(stream('contact.targets', { kind, ...range }))
          if (!alive()) return
          if ('code' in piece) {
            send({ type: 'piece', kind, ...range, code: piece.code })
            return
          }
          const answer = replyTo(`piece:${piece.id}`)
          send({ type: 'piece', id: piece.id, kind, ...range })
          const reply = await answer
          if (!alive() || reply.type !== 'piece' || !reply.ok) return
          setLoaded((prev) => ({
            ...prev,
            progress: { ...prev.progress, [name]: { done: index + 1, total: ranges.length } },
          }))
        }
      }

      const load = await opened(stream('store.load', { contact: true }))
      if (!alive()) return
      const stored = replyTo('stored')
      send('code' in load ? { type: 'stored', code: load.code } : { type: 'stored', id: load.id })
      await stored
      if (!alive()) return

      const planned = replyTo('plan')
      send({ type: 'plan', today })
      const plan = await planned
      if (!alive() || plan.type !== 'plan') return
      const recall = plan.recall ?? []
      setLoaded((prev) => ({
        ...prev,
        progress: { followup: { done: 0, total: plan.followup.length }, recall: { done: 0, total: recall.length } },
      }))

      await readKind('followup', plan.followup)
      if (!alive()) return
      await readKind('injection', recall)
      if (!alive()) return
      flow.built = true
      send({ type: 'build', today })
    },
    [send, stream],
  )

  useEffect(() => {
    const answer = (key: string, message: PatientsWorkerMessage) => {
      const waiting = flowRef.current?.waiting
      const resolve = waiting?.get(key)
      if (!resolve) return
      waiting!.delete(key)
      resolve(message)
    }
    const onMessage = (event: MessageEvent) => {
      const message = event.data as PatientsWorkerMessage
      switch (message.type) {
        case 'stored':
        case 'plan':
          return answer(message.type, message)
        case 'piece':
          return answer(`piece:${message.id}`, message)
        case 'views':
          if (!flowRef.current?.built) return
          setLoaded((prev) => ({
            ...prev,
            status: 'done',
            views: { followup: message.followup, recall: message.recall, codes: message.codes },
            counts: message.counts,
          }))
          return
        case 'marked':
          setLoaded((prev) => ({ ...prev, counts: message.counts }))
          for (const listener of [...listeners.current]) listener(message)
          return
        case 'filtered':
          for (const listener of [...listeners.current]) listener(message)
          return
      }
    }
    worker.addEventListener('message', onMessage)
    return () => worker.removeEventListener('message', onMessage)
  }, [worker])

  useEffect(() => {
    mounted.current = true
    if (!started.current) {
      started.current = true
      const flow = newFlow()
      flowRef.current = flow
      void read(flow)
    }
    return () => {
      mounted.current = false
    }
  }, [read])

  const reload = useCallback(() => {
    const flow = newFlow()
    flowRef.current = flow
    send({ type: 'reload' })
    setLoaded(LOADING)
    void read(flow)
  }, [read, send])

  const listen = useCallback((listener: (message: ToolReply) => void) => {
    const all = listeners.current
    all.add(listener)
    return () => void all.delete(listener)
  }, [])

  return { ...loaded, reload, post: send, listen }
}
