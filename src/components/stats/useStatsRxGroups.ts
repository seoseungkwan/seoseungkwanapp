'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { suggestGroups } from '@/lib/revenue/treatments'
import { listStatsRxGroups, saveStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { RxGroupDef } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { rxCatalog } from './rxPickView'
import { forSave } from './treatmentEdit'
import { groupDefs } from './treatmentView'
import { isSavableLine } from './useRxCatalog'

// 처방별 추세 묶음 읽기·저장·불러오기 준비 (treatment-trend REQ-1204·1205·1211, design.md '묶음 훅').
// 상태는 셋이다: (가) 읽는 중·읽기 실패 (나) 저장된 줄 없음 = 화면 일 숫자로 그릴 때마다 다시 고른 제안 다섯 (다) 저장된 줄 = 받은 그대로.
// 서버 답이 상태가 되는 규칙: 더 나중 읽기가 이미 들어갔거나 읽는 사이 저장이 들어갔으면 그 읽기는 넣지 않는다(옛 모습으로 되돌리지 않는다).
// 묶음은 React 상태와 서버 표에만 있다(AC-1211.3·AC-1213.1)

/** forLoad가 서버 답을 기다리는 한도. 넘으면 그때 화면의 묶음으로 풀린다(AC-1205.9, design.md '기다림 한도 5초') */
export const FOR_LOAD_LIMIT_MS = 5_000

export type StatsRxGroupsView = {
  state: 'reading' | 'ready' | 'read-failed'
  groups: readonly RxGroup[] // sortOrder 차례. 저장된 줄이 없으면 제안 다섯(id null)
  suggested: boolean
  saving: boolean
  saveFailed: boolean
  reread(): void
  save(after: readonly RxGroup[]): Promise<boolean> // forSave 값을 저장. 성공하면 groups가 돌려받은 줄이 된다
  forLoad(): Promise<RxGroupDef[]> // 거절하지 않고 부른 뒤 5초 안에 늘 풀린다(AC-1205.7·AC-1205.9·AC-1204.3)
}

type Held = { kind: 'reading' } | { kind: 'read-failed' } | { kind: 'ready'; rows: readonly RxGroup[] } // rows 0개 = (나)

const READING: Held = { kind: 'reading' }
const NO_GROUPS: readonly RxGroup[] = []

const bySortOrder = (rows: readonly RxGroup[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder)

/** 제안 다섯. 처방은 화면 일 숫자의 코드(대소문자 합침, 가장 최근 날 글자)에서 규칙에 맞는 것. 제안 표시 칸은 떼고 RxGroup 네 칸만 */
function suggestFrom(days: readonly DayPayload[]): RxGroup[] {
  const codes = rxCatalog(days, [], isSavableLine).map(({ code }) => code)
  return suggestGroups(codes).map(({ id, name, codes: picked, sortOrder }) => ({ id, name, codes: picked, sortOrder }))
}

/** 화면의 묶음. (가)이면 없음 */
function shownGroups(held: Held, days: readonly DayPayload[]): readonly RxGroup[] {
  if (held.kind !== 'ready') return NO_GROUPS
  return held.rows.length > 0 ? held.rows : suggestFrom(days)
}

export function useStatsRxGroups(days: readonly DayPayload[]): StatsRxGroupsView {
  const [held, setHeld] = useState<Held>(READING)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  // forLoad·늦은 답은 다시 그리기를 기다리지 않고 지금 값을 본다
  const now = useRef<Held>(READING)
  const daysNow = useRef(days)
  const readsStarted = useRef(0)
  const readShown = useRef(0) // 상태에 넣은 마지막 읽기 번호
  const savesStarted = useRef(0)
  const saveShown = useRef(0) // 상태에 넣은 마지막 저장 번호
  const savesWaiting = useRef(0) // [저장]으로 기다리는 수

  useEffect(() => {
    daysNow.current = days
  }, [days])

  const put = useCallback((next: Held) => {
    now.current = next
    setHeld(next)
  }, [])

  /** 서버에서 읽는다. 실패는 null(빈 목록으로 보지 않는다, AC-1203.3) */
  const read = useCallback(async (): Promise<readonly RxGroup[] | null> => {
    const mine = ++readsStarted.current
    const savedBefore = saveShown.current
    try {
      const rows = bySortOrder(await listStatsRxGroups())
      if (mine > readShown.current && saveShown.current === savedBefore) {
        readShown.current = mine
        put({ kind: 'ready', rows })
      }
      return rows
    } catch {
      return null
    }
  }, [put])

  /** forSave 값을 저장하고 돌려받은 줄을 상태에 넣는다(더 나중 저장이 이미 들어갔으면 넣지 않는다). 실패는 null */
  const write = useCallback(
    async (after: readonly RxGroup[]): Promise<readonly RxGroup[] | null> => {
      const mine = ++savesStarted.current
      try {
        const rows = bySortOrder(await saveStatsRxGroups(forSave(after)))
        if (mine > saveShown.current) {
          saveShown.current = mine
          put({ kind: 'ready', rows })
        }
        return rows
      } catch {
        return null
      }
    },
    [put],
  )

  // 화면 읽기(처음·[다시 읽기]). 실패를 보이는 것은 아직 아무 답도 상태가 되지 않았을 때뿐이다
  const screenRead = useCallback(() => {
    void read().then((rows) => {
      if (rows === null && now.current.kind === 'reading') put({ kind: 'read-failed' })
    })
  }, [put, read])

  useEffect(() => {
    screenRead()
  }, [screenRead])

  const reread = useCallback(() => {
    if (now.current.kind !== 'read-failed') return
    put(READING)
    screenRead()
  }, [put, screenRead])

  const save = useCallback(
    async (after: readonly RxGroup[]) => {
      savesWaiting.current += 1
      setSaving(true)
      const rows = await write(after)
      savesWaiting.current -= 1
      setSaving(savesWaiting.current > 0)
      setSaveFailed(rows === null)
      return rows !== null
    },
    [write],
  )

  // ① 다시 읽어 줄이 있으면 그 정의 ② 줄이 없으면 그때의 제안(처방 든 것이 있을 때만 저장, 실패는 무시)의 정의
  // ③ 읽기 실패·한도 넘김이면 그때 화면의 묶음 정의((가)이면 []). 먼저 풀린 뒤에 온 답은 상태만 바꾼다
  const forLoad = useCallback(
    () =>
      new Promise<RxGroupDef[]>((resolve) => {
        let done = false
        const screenDefs = () => groupDefs(shownGroups(now.current, daysNow.current))
        // finish는 시계를 만든 뒤에만 불린다(시계 답이거나 아래 읽기의 await 뒤)
        const finish = (defs: RxGroupDef[]) => {
          if (done) return
          done = true
          clearTimeout(timer)
          resolve(defs)
        }
        const timer = setTimeout(() => finish(screenDefs()), FOR_LOAD_LIMIT_MS)

        void (async () => {
          if ((await read()) === null) return finish(screenDefs())
          const after = now.current // 읽기가 끝났으니 (나)·(다)다. 그사이 저장이 들어갔으면 그 줄이다
          if (after.kind === 'ready' && after.rows.length > 0) return finish(groupDefs(after.rows))
          const suggestion = suggestFrom(daysNow.current)
          const defs = groupDefs(suggestion)
          if (defs.length > 0) await write(suggestion)
          finish(defs)
        })()
      }),
    [read, write],
  )

  const suggested = held.kind === 'ready' && held.rows.length === 0
  const suggestion = useMemo(() => (suggested ? suggestFrom(days) : NO_GROUPS), [suggested, days])
  const groups = held.kind !== 'ready' ? NO_GROUPS : suggested ? suggestion : held.rows

  return useMemo(
    () => ({ state: held.kind, groups, suggested, saving, saveFailed, reread, save, forLoad }),
    [held.kind, groups, suggested, saving, saveFailed, reread, save, forLoad],
  )
}
