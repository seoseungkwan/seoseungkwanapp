'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { requestPull } from '@/lib/gcal/loop'
import { getGcalStatus, subscribeGcalStatus, type GcalStatus } from '@/lib/gcal/status'
import { listGcalFixes, loadGcalState, loadGcalView, loadOffNames } from '@/lib/storage/gcal'
import type { GcalFix, GcalState, GcalView, OffName } from '@/types/gcal'

// 예약 탭이 보는 구글 쪽(spec google-link AC-8532.1·AC-8534.1·AC-8535.1, design.md 12절).
// 연결(loadGcalView)·맞춤 상태(loadGcalState)·열린 고쳐야 할 것·off 사람 이름을 읽고, 맞춤 엔진 상태(lib/gcal/status)를 듣는다.
// 이은 병원 = 캘린더를 고르고 이은 날이 있다. 탭에 들어오면 requestPull() 한 번(엔진이 돌고 있을 때만 받는다, TASK-14가 돌린다).
// 엔진 상태가 이어짐이면 그 값을, 아직이면(엔진이 첫 상태를 읽기 전) DB에서 읽은 값을 띠에 쓴다

type StorageClient = Parameters<typeof loadGcalView>[0]

export type GcalScreen = {
  /** 이은 병원의 연결. 잇지 않았거나 못 읽었으면 null(지금 화면 그대로) */
  view: (GcalView & { calendarId: string; linkedOn: string }) | null
  status: GcalStatus
  state: GcalState | null
  fixes: readonly GcalFix[]
  offNames: readonly OffName[]
  /** 고쳐야 할 것을 다시 읽는다(넣기·가져오지 않기 뒤) */
  reloadFixes(): Promise<void>
  /** 맞춤 상태를 다시 읽는다(지난 도착 채우기가 쓴다) */
  reloadState(): Promise<GcalState | null>
}

const NO_FIXES: readonly GcalFix[] = []
const NO_NAMES: readonly OffName[] = []

const linkedView = (view: GcalView | null): GcalScreen['view'] =>
  view !== null && view.calendarId && view.linkedOn ? (view as GcalScreen['view']) : null

export function useGcal(client: StorageClient): GcalScreen {
  const [view, setView] = useState<GcalScreen['view']>(null)
  const [state, setState] = useState<GcalState | null>(null)
  const [fixes, setFixes] = useState<readonly GcalFix[]>(NO_FIXES)
  const [offNames, setOffNames] = useState<readonly OffName[]>(NO_NAMES)
  const status = useSyncExternalStore(subscribeGcalStatus, getGcalStatus, getGcalStatus)
  const pulled = useRef(false)
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
    }
  }, [])

  useEffect(() => {
    let mine = true
    void (async () => {
      let read: GcalScreen['view'] = null
      try {
        read = linkedView(await loadGcalView(client))
      } catch {
        read = null // 못 읽으면 잇지 않은 병원처럼(예약은 그대로 쓴다)
      }
      if (!mine) return
      setView(read)
      if (read === null) return
      if (!pulled.current) {
        pulled.current = true
        requestPull()
      }
      const [st, open, names] = await Promise.all([
        loadGcalState(client).catch(() => null),
        listGcalFixes(client, 'open').catch(() => NO_FIXES),
        loadOffNames(client).catch(() => NO_NAMES),
      ])
      if (!mine) return
      setState(st)
      setFixes(open)
      setOffNames(names)
    })()
    return () => {
      mine = false
    }
  }, [client])

  const reloadFixes = useCallback(async () => {
    try {
      const open = await listGcalFixes(client, 'open')
      if (live.current) setFixes(open)
    } catch {
      // 다음 맞춤 뒤 다시 읽는다
    }
  }, [client])

  const reloadState = useCallback(async () => {
    try {
      const st = await loadGcalState(client)
      if (live.current) setState(st)
      return st
    } catch {
      return null
    }
  }, [client])

  // 엔진이 받아 고쳐야 할 것 수나 마지막 맞춤이 바뀌면 목록을 다시 읽는다
  const linked = view !== null
  const { fixes: fixCount, lastOkAt } = status
  const first = useRef(true)
  useEffect(() => {
    if (!linked) return
    if (first.current) {
      first.current = false
      return // 처음 목록은 위에서 읽었다
    }
    void reloadFixes()
  }, [linked, fixCount, lastOkAt, reloadFixes])

  return { view, status, state, fixes, offNames, reloadFixes, reloadState }
}
