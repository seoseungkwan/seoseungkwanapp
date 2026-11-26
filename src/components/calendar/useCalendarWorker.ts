'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { addDays, compareYmd, diffDays, todayInKorea } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import { BridgeError } from '@/lib/bridge/protocol'
import { CAL_HELPER } from '@/lib/bridge/versions'
import type { WorkerLike } from '@/lib/bridge/workerSink'
import type { BitGhost } from '@/lib/calendar/shapes'
import { listAppts, setApptAuto } from '@/lib/storage/calendar'
import { loadGcalState, setArrivalProgress } from '@/lib/storage/gcal'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ApptAuto, CalAppt } from '@/types/calendar'
import type { BitPerson, CalendarDayAppt, CalendarScreenMessage, CalendarStreamRef, CalendarWorkerMessage } from '@/workers/calendar/messages'
import type { CalView } from './CalendarToolbar'
import { pastArrivalStep } from './gcal/pastArrival'

// 예약 탭 비트 흐름(spec clinic-calendar AC-5905.6·AC-5905.7·AC-5905.8, design.md '흐름'·'다시 읽기', 본보기 sunap/useSunapWorker).
// 비트 PC = 통로(useBridge)가 ready이고 도우미 판이 CAL_HELPER(0.10.0) 이상. 아니면 비트에 아무것도 묻지 않는다(폰·도우미 없는 기기·옛 도우미).
// 화면은 스트림(contact.targets kind 'calfind'·'calday')을 열어 {id}·오류 번호만 Worker에 넘기고, 찾은 사람·도착 auto·비트 예약 칸·오류 번호만 받는다.
// 조각은 통로 포트로만 Worker에 간다(비트 접수 차트번호 목록·생일은 Worker 밖으로 나오지 않는다, AC-5904.3).
// 도착 auto는 기간을 그릴 때와, 오늘이 든 기간을 보는 동안 60초마다 다시 센다. 받은 auto는 하나씩 setApptAuto로 서버에 적는다(ADR-030: 비트에서 서버로 가는 값은 이것 하나).
// 지난 예약 도착 채우기(spec google-link AC-8536.1·AC-8536.2, design.md 13절): 이은 병원(opts.past.on)의 비트 PC면 60초마다 한 주씩
// (gcal/pastArrival 계획 — 도우미 CAL_PAST_HELPER 이상은 1년, 아래 판은 62일 안만) 같은 calday 길로 읽어 같은 도착 셈(Worker past)으로 적고,
// 어디까지 했는지 setArrivalProgress로 남긴다(다른 PC·다음에 이어 한다). 다 하면 onDone 한 번

export const DAYS_POLL_MS = 60_000
export const PAST_POLL_MS = 60_000
const PAST_STUCK_MS = 3 * 60_000 // 답도 오류도 오지 않은 물음(Worker가 멈춤)은 이만큼 뒤 놓는다
// calday가 받는 기간(도우미 CalendarTargets와 같다): 오늘−62일 ~ 오늘+92일, 42일까지
const BACK_DAYS = 62
const AHEAD_DAYS = 92
const MAX_DAYS = 42
const REJECTED = 'E-BRIDGE-REJECTED'
const FAILED = 'E-ANALYZE-FAILED'
const NAME_MAX = 20

type WorkerEventType = 'message' | 'error' | 'messageerror'
export type CalendarWorkerHandle = WorkerLike & {
  addEventListener(type: WorkerEventType, listener: (event: Event) => void): void
  removeEventListener(type: WorkerEventType, listener: (event: Event) => void): void
}

/** 찾은 결과(q = 물은 낱말). 실패면 오류 번호 */
export type CalendarFound = { q: string; rows: BitPerson[]; more: boolean } | { q: string; code: string }

export type CalendarWorkerApi = {
  /** 비트 PC(도우미 0.10.0 이상 연결) */
  bit: boolean
  /** 지금 기간의 비트 예약 칸(Worker가 visibleGhosts로 가린 것) */
  ghosts: BitGhost[]
  found: CalendarFound | null
  /** 비트에서 찾기(q는 findQuery를 지난 값). null = 결과 지우기 */
  find(q: string | null): void
}

export type CalendarWorkerOpts = {
  view: CalView
  from: string
  to: string
  /** 그 기간 예약(일·주). 아직 못 읽었으면 null(읽은 뒤에 days를 부른다). 도착 셈에 쓸 예약은 부를 때마다 서버에서 새로 읽는다 */
  appts: readonly CalAppt[] | null
  /** 서버에 적은 도착 auto(화면이 칸을 바로 바꾼다) */
  onAuto(pairs: [string, ApptAuto][]): void
  /** 지난 예약 도착 채우기(구글과 이은 병원만 on). onDone = 마지막 주를 끝냄 */
  past?: { on: boolean; onDone(): void }
}

// 번호가 있는 오류만 번호로 알린다. 다른 오류의 글은 싣지 않는다
const opened = (stream: Promise<{ id: string }>): Promise<CalendarStreamRef> =>
  stream.then(
    ({ id }) => ({ id }),
    (error: unknown) => ({ code: error instanceof BridgeError ? error.code : REJECTED }),
  )

const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

/** 비트에 물을 기간: calday 범위(오늘−62일 ~ 오늘+92일, 42일까지) 안으로 자른다. 월 보기는 오늘까지(도착 셈만, 비트 예약 칸은 그리지 않는다). 없으면 null */
export function daysRange(view: CalView, from: string, to: string, today: string): { from: string; to: string } | null {
  const lo = later(from, addDays(today, -BACK_DAYS))
  let hi = earlier(to, view === 'month' ? today : addDays(today, AHEAD_DAYS))
  if (compareYmd(lo, hi) > 0) return null
  if (diffDays(lo, hi) + 1 > MAX_DAYS) hi = addDays(lo, MAX_DAYS - 1)
  return { from: lo, to: hi }
}

/** 비트 찾기 낱말: 차트번호 칸은 숫자 1~10자리, 이름 칸은 앞뒤 빈칸을 뺀 2~20자(숫자·LIKE 글자 %·_·[ 없음). 아니면 null(찾지 않는다) */
export function findQuery(field: 'name' | 'chart', text: string): string | null {
  const q = text.trim()
  if (field === 'chart') return /^\d{1,10}$/.test(q) ? q : null
  const length = [...q].length
  return length >= 2 && length <= NAME_MAX && !/[\d%_[]/.test(q) ? q : null
}

// Worker에 싣는 예약 칸(도착 셈·비트 예약 가리기에 쓰는 일곱 칸만. 이름·메모·담당은 싣지 않는다)
const dayAppt = (a: CalendarDayAppt): CalendarDayAppt => ({ id: a.id, day: a.day, start: a.start, len: a.len, chart: a.chart, status: a.status, auto: a.auto })

/** Worker를 한 번 만들고 화면을 떠나면 끝낸다. 만들기 전에는 null — 통로(useBridge)는 Worker가 생긴 뒤에 연다 */
export function useCalendarWorkerObject(): Worker | null {
  const [worker, setWorker] = useState<Worker | null>(null)
  useEffect(() => {
    const created = new Worker(new URL('@/workers/calendar.worker.ts', import.meta.url), { type: 'module' })
    setWorker(created)
    return () => created.terminate()
  }, [])
  return worker
}

export function useCalendarWorker(worker: CalendarWorkerHandle, opts: CalendarWorkerOpts): CalendarWorkerApi {
  const { state, hello, stream } = useBridge({ worker })
  const version = hello?.helperVersion
  const bit = state === 'ready' && version !== undefined && compareVersions(version, CAL_HELPER) >= 0
  const client = useMemo(() => supabaseBrowser(), [])
  const key = `${opts.view}|${opts.from}|${opts.to}`
  const ready = opts.view === 'month' || opts.appts !== null
  const latest = useRef(opts)
  latest.current = opts
  const bitNow = useRef(bit)
  bitNow.current = bit

  const [found, setFound] = useState<CalendarFound | null>(null)
  const [ghostView, setGhostView] = useState<{ key: string; ghosts: BitGhost[] } | null>(null)
  const findFlow = useRef(0)
  const asked = useRef<string | null>(null) // Worker에 보낸 찾기의 q(지웠으면 null)
  const daysFlow = useRef(0)
  const sentKey = useRef<string | null>(null) // Worker에 보낸 days의 기간
  const sentSlots = useRef(new Map<string, { day: string; start: number }>()) // Worker에 보낸 예약의 자리(id → 날짜·시작)
  const pastBusy = useRef(false) // 지난 주 하나를 묻는 중(답이나 오류가 올 때까지)
  const pastAt = useRef(0)
  const pastSent = useRef<{ slots: Map<string, { day: string; start: number }>; next: string; done: boolean } | null>(null)

  const send = useCallback((message: CalendarScreenMessage) => worker.postMessage(message, []), [worker])

  useEffect(() => {
    const applyDays = async (message: Extract<CalendarWorkerMessage, { type: 'days' }>) => {
      if (sentKey.current !== null) setGhostView({ key: sentKey.current, ghosts: message.ghosts })
      const slots = sentSlots.current
      const known = message.auto.filter(([id]) => slots.has(id)) // 보낸 목록에 없는 id는 자리를 모르니 적지 않는다
      const written = await Promise.all(
        known.map(([id, auto]) =>
          setApptAuto(client, id, auto, slots.get(id)!).then(
            () => [id, auto] as [string, ApptAuto],
            () => null, // 다음 60초에 Worker가 다시 준다(서버 값이 그대로라)
          ),
        ),
      )
      const done = written.filter((pair) => pair !== null)
      if (done.length > 0) latest.current.onAuto(done)
    }
    // 지난 한 주: 다 적었을 때만 진행을 남긴다(하나라도 못 적으면 다음 60초에 그 주를 다시)
    const applyPast = async (message: Extract<CalendarWorkerMessage, { type: 'past' }>) => {
      const sent = pastSent.current
      pastSent.current = null
      try {
        if (sent === null) return
        const known = message.auto.filter(([id]) => sent.slots.has(id))
        const written = await Promise.all(
          known.map(([id, auto]) =>
            setApptAuto(client, id, auto, sent.slots.get(id)!).then(
              () => true,
              () => false,
            ),
          ),
        )
        if (written.includes(false)) return
        await setArrivalProgress(client, sent.next, sent.done)
        if (sent.done) latest.current.past?.onDone()
      } catch {
        // 다음 60초에 같은 주를 다시
      } finally {
        pastBusy.current = false
      }
    }
    const onMessage = (event: Event) => {
      const message = (event as MessageEvent<CalendarWorkerMessage>).data
      if (message.type === 'found') {
        const q = asked.current
        if (q !== null) setFound({ q, rows: message.rows, more: message.more })
      } else if (message.type === 'days') {
        void applyDays(message)
      } else if (message.type === 'past') {
        void applyPast(message)
      } else if (message.type === 'error' && message.op === 'find') {
        const q = asked.current
        if (q !== null) setFound({ q, code: message.code })
      } else if (message.type === 'error' && message.op === 'past') {
        pastSent.current = null
        pastBusy.current = false
      }
      // days 오류는 오류 번호뿐이다: 서버에 아무것도 적지 않고 다음 60초에 다시 묻는다
    }
    // 스크립트를 못 불러옴·잡히지 않은 예외: 찾던 것은 오류로 끝낸다
    const onFail = (event: Event) => {
      event.preventDefault()
      const q = asked.current
      if (q !== null) setFound({ q, code: FAILED })
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onFail)
    worker.addEventListener('messageerror', onFail)
    return () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onFail)
      worker.removeEventListener('messageerror', onFail)
    }
  }, [client, worker])

  const find = useCallback(
    (q: string | null) => {
      const mine = ++findFlow.current
      if (q === null || !bitNow.current) {
        asked.current = null
        setFound(null)
        return
      }
      const today = todayInKorea()
      void opened(stream('contact.targets', { kind: 'calfind', from: today, to: today, q })).then((targets) => {
        if (mine !== findFlow.current) return
        asked.current = q
        send({ type: 'find', targets })
      })
    },
    [send, stream],
  )

  const runDays = useCallback(async () => {
    const { view, from, to } = latest.current
    const range = daysRange(view, from, to, todayInKorea())
    if (range === null) return
    const mine = ++daysFlow.current
    let list: readonly CalendarDayAppt[]
    try {
      // 일·주·월 모두 부를 때마다 서버에서 새로 읽는다: 화면이 숨어 5초 다시 읽기가 멈춘 동안 다른 PC가 옮긴 예약을 옛 자리로 셈하지 않으려고(검토 고침)
      list = await listAppts(client, range.from, range.to)
    } catch {
      return // 다음 60초(또는 다음 기간)에 다시
    }
    if (mine !== daysFlow.current) return
    const targets = await opened(stream('contact.targets', { kind: 'calday', from: range.from, to: range.to }))
    if (mine !== daysFlow.current) return
    sentKey.current = `${view}|${from}|${to}`
    sentSlots.current = new Map(list.map((a) => [a.id, { day: a.day, start: a.start }]))
    send({ type: 'days', targets, now: Date.now(), appts: list.map(dayAppt) })
  }, [client, send, stream])

  // 지난 한 주 묻기: 계획(gcal_state 진행 + 도우미 판) → 그 주 예약을 서버에서 읽어 calday로 묻는다. 계획이 끝이면 다 함으로 적고 알림
  const runPast = useCallback(async () => {
    if (version === undefined || (pastBusy.current && Date.now() - pastAt.current < PAST_STUCK_MS)) return
    pastBusy.current = true
    pastAt.current = Date.now()
    let asking = false
    try {
      const st = await loadGcalState(client)
      const today = todayInKorea()
      const step = pastArrivalStep({ today, until: st.arrivalUntil, done: st.arrivalDone, helper: version })
      if (step === null) return
      if (step.kind === 'finish') {
        await setArrivalProgress(client, st.arrivalUntil ?? addDays(today, -1), true)
        latest.current.past?.onDone()
        return
      }
      const list = await listAppts(client, step.from, step.to)
      const targets = await opened(stream('contact.targets', { kind: 'calday', from: step.from, to: step.to }))
      pastSent.current = { slots: new Map(list.map((a) => [a.id, { day: a.day, start: a.start }])), next: step.next, done: step.done }
      asking = true
      send({ type: 'past', targets, now: Date.now(), appts: list.map(dayAppt) })
    } catch {
      // 다음 60초에 다시
    } finally {
      if (!asking) pastBusy.current = false
    }
  }, [client, send, stream, version])

  const pastOn = bit && opts.past?.on === true
  useEffect(() => {
    if (!pastOn) return
    void runPast()
    const timer = setInterval(() => void runPast(), PAST_POLL_MS)
    return () => clearInterval(timer)
  }, [pastOn, runPast])

  // 기간을 그릴 때(예약을 읽은 뒤) 한 번, 오늘이 든 기간이면 60초마다
  useEffect(() => {
    if (!bit || !ready) return
    void runDays()
    const today = todayInKorea()
    const { from, to } = latest.current
    if (compareYmd(from, today) > 0 || compareYmd(to, today) < 0) return
    const timer = setInterval(() => void runDays(), DAYS_POLL_MS)
    return () => clearInterval(timer)
  }, [bit, key, ready, runDays])

  const ghosts = bit && ghostView !== null && ghostView.key === key ? ghostView.ghosts : NO_GHOSTS
  return { bit, ghosts, found: bit ? found : null, find }
}

const NO_GHOSTS: BitGhost[] = []
