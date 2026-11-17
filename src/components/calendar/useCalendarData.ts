'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listAllDay, listAppts, listCalendarCounts, loadCalendarRev, loadCalendarSettings } from '@/lib/storage/calendar'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalAllDay, CalAppt, CalCountRow, CalSettings } from '@/types/calendar'
import type { CalView } from './CalendarToolbar'

// 예약 탭 자료 읽기(spec clinic-calendar AC-5905.9, design.md '다시 읽기'). 모든 기기가 같은 길이다: 브라우저 → Supabase(RLS 내 병원).
// 보이는 동안(visibilityState 'visible') 5초마다 calendar_rev 숫자 하나만 읽고, 바뀌었을 때만 보이는 기간
// (일·주: listAppts + listAllDay, 월: 이름·차트번호 없는 listCalendarCounts + listAllDay)과 설정을 다시 읽는다.
// 숨은 탭은 읽지 않고 다시 보이면 바로 읽는다. 내가 저장한 뒤에는 refresh()로 바로 읽는다(5초를 기다리지 않는다).
// rev를 먼저 읽고 자료를 읽는다: 그 사이 바뀐 것은 다음 rev가 다르게 나와 다시 읽는다. 늦게 온 앞 읽기 답은 버린다.
// 실시간 연결(Realtime)은 쓰지 않는다 → CSP connect-src는 그대로다(ADR-030)

export const REV_POLL_MS = 5_000

/** 읽는 기간(양 끝 포함). 월 보기는 월 칸이 덮는 주 전부 */
export type CalendarPeriod = { view: CalView; from: string; to: string }

/** 한 기간의 자료. 일·주는 예약 줄(appts), 월은 수 세기 줄(counts, appts는 빈 목록) */
export type CalendarSnapshot = { key: string; appts: CalAppt[]; counts: CalCountRow[] | null; allday: CalAllDay[] }

export type CalendarData = {
  /** 지금 기간: 읽는 중 · 읽음 · 처음 읽기가 실패함(앞서 읽은 자료가 있으면 다시 읽기 실패는 ready 그대로) */
  status: 'loading' | 'ready' | 'failed'
  /** 지금 기간의 자료(아직 없으면 null) */
  snapshot: CalendarSnapshot | null
  /** 마지막으로 읽은 설정(기간을 옮겨도 남는다) */
  settings: CalSettings | null
  /** rev를 바로 읽어 바뀌었으면 다시 읽는다(내가 저장한 뒤) */
  refresh(): void
  /** 모두 바로 다시 읽는다([다시 불러오기]) */
  reload(): void
  /** 저장한 값을 지금 기간 자료에 바로 넣는다(서버를 다시 읽기 전에 칸이 보이게) */
  update(change: (snapshot: CalendarSnapshot) => CalendarSnapshot): void
  /** 저장한 설정을 바로 쓴다 */
  setSettings(next: CalSettings): void
}

export const periodKey = (period: CalendarPeriod) => `${period.view}|${period.from}|${period.to}`

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

export function useCalendarData(period: CalendarPeriod): CalendarData {
  const client = useMemo(() => supabaseBrowser(), [])
  const key = periodKey(period)
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null)
  const [settings, setSettingsState] = useState<CalSettings | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const periodNow = useRef(period)
  periodNow.current = period
  // 읽기마다 늘린다. 지금 번호가 아닌 답은 버린다(기간을 옮겼거나 새로 읽기 시작함)
  const flow = useRef(0)
  const lastRev = useRef<number | null>(null)
  const loading = useRef(false)
  const polling = useRef(false)

  /** 지금 기간을 읽는다. knownRev = 방금 읽은 rev(없으면 먼저 읽는다) */
  const load = useCallback(
    async (knownRev?: number) => {
      const mine = ++flow.current
      const target = periodNow.current
      const targetKey = periodKey(target)
      loading.current = true
      try {
        const rev = knownRev ?? (await loadCalendarRev(client))
        const [nextSettings, rows, allday] = await Promise.all([
          loadCalendarSettings(client),
          target.view === 'month'
            ? listCalendarCounts(client, target.from, target.to).then((counts) => ({ appts: [] as CalAppt[], counts }))
            : listAppts(client, target.from, target.to).then((appts) => ({ appts, counts: null })),
          listAllDay(client, target.from, target.to),
        ])
        if (mine !== flow.current) return
        lastRev.current = rev
        setSettingsState(nextSettings)
        setSnapshot({ key: targetKey, ...rows, allday })
        setFailedKey(null)
      } catch {
        if (mine === flow.current) setFailedKey(targetKey)
      } finally {
        if (mine === flow.current) loading.current = false
      }
    },
    [client],
  )

  /** rev 하나만 읽고 바뀌었으면 다시 읽는다. 숨었거나 읽는 중이면 하지 않는다 */
  const poll = useCallback(async () => {
    if (!isVisible() || polling.current || loading.current) return
    polling.current = true
    const mine = flow.current
    try {
      const rev = await loadCalendarRev(client)
      if (mine === flow.current && rev !== lastRev.current) await load(rev)
    } catch {
      // 다음 5초에 다시 본다
    } finally {
      polling.current = false
    }
  }, [client, load])

  useEffect(() => {
    void load()
  }, [key, load])

  useEffect(() => {
    const timer = setInterval(() => void poll(), REV_POLL_MS)
    const onVisible = () => {
      if (isVisible()) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      flow.current += 1 // 떠난 뒤 온 답은 쓰지 않는다
    }
  }, [poll])

  const refresh = useCallback(() => void poll(), [poll])
  const reload = useCallback(() => void load(), [load])
  const update = useCallback((change: (snap: CalendarSnapshot) => CalendarSnapshot) => {
    setSnapshot((prev) => (prev !== null && prev.key === periodKey(periodNow.current) ? change(prev) : prev))
  }, [])
  const setSettings = useCallback((next: CalSettings) => setSettingsState(next), [])

  const current = snapshot?.key === key ? snapshot : null
  const status = current ? 'ready' : failedKey === key ? 'failed' : 'loading'
  return { status, snapshot: current, settings, refresh, reload, update, setSettings }
}
