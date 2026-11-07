'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import { BridgeError } from '@/lib/bridge/protocol'
import { LIST_HELPER } from '@/lib/bridge/versions'
import { lapsedRange } from '@/lib/patients/lapsed'
import { reservationRange, shortDay, timeLabel } from '@/lib/patients/reservations'
import type { BitListTool, PatientsRange, PatientsScreenMessage, PatientsWorkerMessage, ReservationPick } from '@/types/patients'
import type { PatientsTool } from './tools'
import type { PatientsBridge, PatientsWorkerHandle } from './usePatientsWorker'

// 비트 명단 두 도구(예약 문자 명단 · 장기 미방문 명단, spec patients-bit-lists)의 읽기(AC-2802.2~2802.6, design.md useBitList).
// 도구마다 이 화면에서 처음 열 때 한 번 읽는다: 들어올 때 읽지 않고, F/U·정기 주사 읽기(usePatientsWorker)를 기다리지도 기다리게 하지도 않는다.
// 읽기 한 번: contact.targets {kind, 그 오늘로 정한 기간} 스트림 → 열리면 바로 Worker에 {list, tool, today, id}(거절되면 code). 사이에 F/U [다시 불러오기]가
// 끼면 Worker가 받지 않은 조각을 버리므로 기다리지 않고 바로 보낸다. Worker 답 list-view는 usePatientsWorker가 넘겨 주지 않아 여기서 Worker 메시지를 직접 듣는다.
// 화면에 오는 것은 읽은 때·줄 수·처음 고를 날·인원수·오류 번호뿐이다(줄은 도구가 filter로 따로 받는다)

export type ReservationsRead = { today: string; readAt: number; total: number; pick: ReservationPick; dayCounts: { tomorrow: number; after: number } }
export type LapsedRead = { today: string; readAt: number; total: number }
/** idle: 아직 열지 않음 · old-helper: 도우미가 낮아 읽지 않음 · reading · ready · failed(code) */
export type BitListPhase = 'idle' | 'old-helper' | 'reading' | 'ready' | 'failed'
/** ready는 마지막으로 다 읽은 결과다. 다시 읽는 동안·실패한 뒤에도 남아 도구가 고른 것을 잃지 않는다 */
export type BitListState<R> = { phase: BitListPhase; code?: string; ready: R | null }

type Reads = { reservations: ReservationsRead; lapsed: LapsedRead }
type States = { [T in BitListTool]: BitListState<Reads[T]> }

export type BitLists = States & {
  /** [다시 불러오기]: 그 도구만 다시 읽는다. Worker가 오류를 냈으면 새 Worker를 만든다(renew) */
  reload(tool: BitListTool): void
  /** [보냄으로 표시 (N명)]: 방금 복사한 줄 열쇠를 저장 한 번에 켠다(답은 열쇠마다 marked) */
  markMany(keys: string[], today: string): void
  /** 표시 저장(store.load) 답: undefined = 아직 모름, null = 불러옴, 글 = 못 불러온 번호 */
  storeCode: string | null | undefined
}

const IDLE: States = { reservations: { phase: 'idle', ready: null }, lapsed: { phase: 'idle', ready: null } }
const WORKER_FAILED = 'E-ANALYZE-FAILED'
const REJECTED = 'E-BRIDGE-REJECTED'
const STORE_FAILED = 'E-STORE-FAILED'
const KIND: Record<BitListTool, 'reservation' | 'lapsed'> = { reservations: 'reservation', lapsed: 'lapsed' }
// 기간은 lib/patients 한 곳에서 정한다(AC-2802.2): 예약 오늘−30일 ~ 오늘+14일, 장기 미방문 24달 전 다음 날 ~ 1달 전
const RANGE: Record<BitListTool, (today: string) => PatientsRange> = { reservations: reservationRange, lapsed: lapsedRange }

const isBitTool = (tool: PatientsTool): tool is BitListTool => tool === 'reservations' || tool === 'lapsed'

// h23: 자정을 '24:00'이 아니라 '00:00'으로(components/shell/kstNow.ts와 같다)
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** 'M월 D일 오전|오후 h:mm에 읽음'(AC-2802.4). 날짜는 dates.ts, 시각은 Asia/Seoul로 읽어 PC 시간대와 상관없다. 시각 글은 예약 시각과 같은 timeLabel */
export function readAtText(readAt: number): string {
  const at = new Date(readAt)
  const ymd = todayInKorea(at)
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  return `${shortDay(ymd)} ${timeLabel(`${ymd.replace(/-/g, '')}${parts.hour}${parts.minute}`)}에 읽음`
}

export function useBitList({
  stream,
  worker,
  tool,
  helperVersion,
  renew,
}: {
  stream: PatientsBridge['stream']
  /** usePatientsWorker와 같은 Worker(통로 포트를 받은 쪽) */
  worker: PatientsWorkerHandle
  /** 지금 보이는 도구. 새 도구가 처음 보일 때 읽는다 */
  tool: PatientsTool
  /** hello의 도우미 버전. 모르면 낮은 것으로 본다 */
  helperVersion?: string
  /** 오류를 낸 Worker를 새로 만든다(usePatientsWorker의 reload) */
  renew(): void
}): BitLists {
  const oldHelper = !helperVersion || compareVersions(helperVersion, LIST_HELPER) < 0
  const [states, setStates] = useState<States>(IDLE)
  const [storeCode, setStoreCode] = useState<string | null | undefined>(undefined)
  const [broken, setBroken] = useState(false)
  // 오류를 낸 Worker에는 더 보내지 않는다(스트림 결과도). 상태보다 먼저 바뀌어야 해서 ref로도 둔다
  const brokenRef = useRef(false)
  const mounted = useRef(false)
  const started = useRef<Record<BitListTool, boolean>>({ reservations: false, lapsed: false })
  // 도구마다 읽기 차례와 그 읽기의 오늘. 앞 읽기의 스트림 결과는 Worker에 보내지 않는다(Worker도 마지막 list에만 답한다)
  const turns = useRef<Record<BitListTool, number>>({ reservations: 0, lapsed: 0 })
  const days = useRef<Record<BitListTool, string>>({ reservations: '', lapsed: '' })

  const send = useCallback((message: PatientsScreenMessage) => worker.postMessage(message, []), [worker])

  const read = useCallback(
    (target: BitListTool) => {
      const today = todayInKorea()
      const turn = ++turns.current[target]
      days.current[target] = today
      setStates((prev) => ({ ...prev, [target]: { phase: 'reading', ready: prev[target].ready } }))
      const live = () => mounted.current && !brokenRef.current && turns.current[target] === turn
      stream('contact.targets', { kind: KIND[target], ...RANGE[target](today) }).then(
        ({ id }) => {
          if (live()) send({ type: 'list', tool: target, today, id })
        },
        // 번호가 있는 오류만 번호로 알린다. 다른 오류의 글은 싣지 않는다
        (error: unknown) => {
          if (live()) send({ type: 'list', tool: target, today, code: error instanceof BridgeError ? error.code : REJECTED })
        },
      )
    },
    [send, stream],
  )

  useEffect(() => {
    const onMessage = (event: Event) => {
      if (brokenRef.current) return
      const message = (event as MessageEvent<PatientsWorkerMessage>).data
      if (!message || typeof message !== 'object') return
      if (message.type === 'stored') {
        setStoreCode(message.ok ? null : (message.code ?? STORE_FAILED))
        return
      }
      if (message.type !== 'list-view' || (message.tool !== 'reservations' && message.tool !== 'lapsed')) return
      const target = message.tool
      const today = days.current[target]
      setStates((prev) => {
        const current = prev[target]
        if (!message.ok) return current.phase === 'idle' ? prev : { ...prev, [target]: { phase: 'failed', code: message.code, ready: current.ready } }
        // 읽고 있을 때의 답만 쓴다
        if (current.phase !== 'reading') return prev
        if (message.tool === 'reservations') {
          const { readAt, total, pick, dayCounts } = message
          return { ...prev, reservations: { phase: 'ready', ready: { today, readAt, total, pick, dayCounts } } }
        }
        const { readAt, total } = message
        return { ...prev, lapsed: { phase: 'ready', ready: { today, readAt, total } } }
      })
    }
    // 그 Worker는 다시 쓰지 않는다. 기본 동작 막기(콘솔)는 usePatientsWorker가 한다
    const onFail = () => {
      brokenRef.current = true
      setBroken(true)
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onFail)
    worker.addEventListener('messageerror', onFail)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onFail)
      worker.removeEventListener('messageerror', onFail)
    }
  }, [worker])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // 처음 열 때 한 번(StrictMode에서 effect가 다시 돌아도 started가 막는다)
  useEffect(() => {
    if (!isBitTool(tool) || oldHelper || brokenRef.current || started.current[tool]) return
    started.current[tool] = true
    read(tool)
  }, [oldHelper, read, tool])

  const reload = useCallback(
    (target: BitListTool) => {
      if (brokenRef.current) return renew()
      if (oldHelper) return
      started.current[target] = true
      read(target)
    },
    [oldHelper, read, renew],
  )

  const markMany = useCallback((keys: string[], today: string) => send({ type: 'mark-many', keys, on: true, today }), [send])

  function view<R>(target: BitListTool, state: BitListState<R>): BitListState<R> {
    if (oldHelper) return { phase: 'old-helper', ready: null }
    // Worker 오류 뒤에는 연 도구가 모두 같은 카드다
    if (broken && (state.phase !== 'idle' || tool === target)) return { phase: 'failed', code: WORKER_FAILED, ready: state.ready }
    return state
  }

  return { reservations: view('reservations', states.reservations), lapsed: view('lapsed', states.lapsed), reload, markMany, storeCode }
}
