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
// store.load는 들어올 때 한 번, 그 뒤에는 [다시 불러오기](reload)로만 부른다. 도우미의 저장소(WorkStore.cs)는 깨진 파일을 E-STORE-BROKEN으로 한 번만
// 알리고(파일 이름을 바꿔 둔다) 다음 읽기에는 {contact: {}}를 주므로, 저절로 다시 부르면 그 오류를 보이지 못한 채 빈 표시로 시작한다.
// 그래서 effect가 다시 돌아도(StrictMode·deps 바뀜) 부르지 않는다.
//
// reload: Worker에 {type: 'reload'}를 새 스트림보다 먼저 보내고, 그 뒤 옛 흐름의 스트림 결과는 Worker에 보내지 않는다. handler는 옛 흐름을 가려내지 못한다 —
// 다음 plan 뒤에 온 옛 piece는 그 종류를 E-BRIDGE-BAD-REPLY로 실패시키고, 옛 stored는 저장 상태를 실패로 만든다.
// 흐름마다 자기 Flow를 갖고, 지금 Flow가 아닌 흐름의 스트림 결과와 그 흐름이 기다리던 Worker 답은 버린다.
//
// Worker 오류(AC-610.6): error(스크립트를 못 불러옴·잡히지 않은 예외)·messageerror가 나면 그 흐름을 버리고 두 도구 모두 E-ANALYZE-FAILED다.
// 오류는 그 Worker에 남는다(failedWorkers): 명단 자리를 다시 그려도 그 Worker로는 새 흐름을 시작하지 않는다. 스크립트를 못 불러온 Worker는
// 두 번째 오류를 내지 않아 다시 쓰면 '읽는 중'에 멈추므로, [다시 불러오기]는 그 Worker를 끝내고 새 Worker를 만든다(renewers, usePatientsWorkerObject).
// 새 Worker가 오면 useBridge가 새 통로 포트로 다시 붙고(연결 중 → ready), ready에서 명단 자리를 새로 그려 store.load부터 읽는다

export type PatientsBridge = Pick<ScreenBridge, 'stream'>
type WorkerEventType = 'message' | 'error' | 'messageerror'
export type PatientsWorkerHandle = WorkerLike & {
  addEventListener(type: WorkerEventType, listener: (event: Event) => void): void
  removeEventListener(type: WorkerEventType, listener: (event: Event) => void): void
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

/** Worker 오류 뒤: 두 도구 모두 오류 카드, 건수는 올리지 않는다(통계 Worker와 같은 번호) */
const FAILED: Loaded = {
  status: 'done',
  progress: LOADING.progress,
  views: { followup: null, recall: null, codes: { followup: 'E-ANALYZE-FAILED', recall: 'E-ANALYZE-FAILED' } },
  counts: null,
}

/** error·messageerror를 낸 Worker. 이 Worker로는 새 흐름을 시작하지 않는다 */
const failedWorkers = new WeakSet<object>()
/** usePatientsWorkerObject가 만든 Worker → 그 Worker를 끝내고 새 Worker를 만드는 함수. 끝낸 Worker는 빠진다 */
const renewers = new WeakMap<object, () => void>()

/** Worker의 error·messageerror를 듣는다: error는 콘솔에 남지 않게 막고, 오류를 그 Worker에 남긴다. 듣기를 그만두는 함수를 돌려준다 */
function watchFailure(worker: PatientsWorkerHandle, onFail?: () => void): () => void {
  const onError = (event: Event) => {
    event.preventDefault()
    failedWorkers.add(worker)
    onFail?.()
  }
  const onMessageError = () => {
    failedWorkers.add(worker)
    onFail?.()
  }
  worker.addEventListener('error', onError)
  worker.addEventListener('messageerror', onMessageError)
  return () => {
    worker.removeEventListener('error', onError)
    worker.removeEventListener('messageerror', onMessageError)
  }
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
 * Worker 없이 먼저 열고 다시 붙으면 확장이 아직 옛 연결을 잡고 있어 다른 창(E-BRIDGE-BUSY)으로 볼 수 있다.
 * 만들자마자 error·messageerror를 듣는다: 명단 훅은 통로가 ready일 때에야 붙으므로 그 전의 오류도 그 Worker에 남겨 둔다(AC-610.6).
 * 오류를 낸 Worker의 [다시 불러오기]만 새 Worker를 만든다(renewers): 옛 Worker의 듣기를 떼고 끝낸 뒤 새로 만든다(두 개를 함께 두지 않는다)
 */
export function usePatientsWorkerObject(): Worker | null {
  const [worker, setWorker] = useState<Worker | null>(null)
  const [round, setRound] = useState(0)
  useEffect(() => {
    const created = new Worker(new URL('@/workers/patients.worker.ts', import.meta.url), { type: 'module' })
    const unwatch = watchFailure(created)
    renewers.set(created, () => setRound((n) => n + 1))
    setWorker(created)
    return () => {
      renewers.delete(created)
      unwatch()
      created.terminate()
    }
  }, [round])
  return worker
}

/** worker는 useBridge에 넘긴 것과 같은 객체다(통로 포트를 받는 쪽). 통로가 ready일 때 부른다 */
export function usePatientsWorker(bridge: PatientsBridge, worker: PatientsWorkerHandle): PatientsWorkerApi {
  const { stream } = bridge
  // 오류를 낸 Worker로 다시 그리면(통로가 끊겼다 다시 ready) 처음부터 카드다
  const [loaded, setLoaded] = useState<Loaded>(() => (failedWorkers.has(worker) ? FAILED : LOADING))
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
    const onMessage = (event: Event) => {
      // 오류를 낸 Worker의 답은 쓰지 않는다
      if (failedWorkers.has(worker)) return
      const message = (event as MessageEvent<PatientsWorkerMessage>).data
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
    // 그 흐름을 버린다: 기다리던 답(answer)·views·끝난 스트림(alive)이 모두 지금 흐름을 보므로 더는 움직이지 않는다
    const unwatch = watchFailure(worker, () => {
      flowRef.current = null
      setLoaded(FAILED)
    })
    return () => {
      worker.removeEventListener('message', onMessage)
      unwatch()
    }
  }, [worker])

  useEffect(() => {
    mounted.current = true
    if (!started.current) {
      started.current = true
      // 오류를 낸 Worker로는 새 흐름을 시작하지 않는다(store.load 없음). 그린 뒤 붙기 전에 난 오류도 여기서 본다
      if (failedWorkers.has(worker)) setLoaded(FAILED)
      else {
        const flow = newFlow()
        flowRef.current = flow
        void read(flow)
      }
    }
    return () => {
      mounted.current = false
    }
  }, [read, worker])

  const reload = useCallback(() => {
    // 오류를 낸 Worker는 다시 쓰지 않는다: 끝내고 새 Worker를 만든다. 새 흐름은 새 Worker로 다시 붙은 뒤 명단 자리를 새로 그릴 때 시작한다
    if (failedWorkers.has(worker)) {
      renewers.get(worker)?.()
      return
    }
    const flow = newFlow()
    flowRef.current = flow
    send({ type: 'reload' })
    setLoaded(LOADING)
    void read(flow)
  }, [read, send, worker])

  const listen = useCallback((listener: (message: ToolReply) => void) => {
    const all = listeners.current
    all.add(listener)
    return () => void all.delete(listener)
  }, [])

  return { ...loaded, reload, post: send, listen }
}
