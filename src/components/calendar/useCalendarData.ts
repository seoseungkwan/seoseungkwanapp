'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareYmd } from '@/lib/analytics/dates'
import { mergeClinic } from '@/lib/calendar/clinic'
import { listAllDay, listAppts, listCalendarCounts, loadCalendarRev, loadCalendarSettings, newGoogleEventId } from '@/lib/storage/calendar'
import { loadClinicProfile } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ApptDraft, CalAllDay, CalAppt, CalCountRow, CalSettings, GWait } from '@/types/calendar'
import type { ClinicProfile } from '@/types/clinicProfile'
import type { CalView } from './CalendarToolbar'

// 예약 탭 자료 읽기(spec clinic-calendar AC-5905.9, design.md '다시 읽기'). 모든 기기가 같은 길이다: 브라우저 → Supabase(RLS 내 병원).
// 보이는 동안(visibilityState 'visible') 5초마다 calendar_rev 숫자 하나만 읽고, 바뀌었을 때만 보이는 기간
// (일·주: listAppts + listAllDay, 월: 이름·차트번호 없는 listCalendarCounts + listAllDay)과 설정을 다시 읽는다.
// 설정은 예약 설정(종류 등)과 병원 정보(시행자·진료시간·휴진일, spec clinic-profile REQ-6603)를 함께 읽어 mergeClinic으로 합친다.
// 병원 정보가 없거나 읽지 못하면 예약 설정 값을 쓴다(처음 읽기). 앞서 읽은 병원 정보가 있으면 한 번의 읽기 실패로는 그것을 그대로 둔다.
// 병원 정보를 저장하면 DB가 calendar_rev를 올린다 → 다른 PC도 5초 안에 다시 읽는다.
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
  /** 마지막으로 읽은 설정(기간을 옮겨도 남는다). 병원 정보와 합친 값(mergeClinic) */
  settings: CalSettings | null
  /** rev를 바로 읽어 바뀌었으면 다시 읽는다(내가 저장한 뒤) */
  refresh(): void
  /** 모두 바로 다시 읽는다([다시 불러오기]) */
  reload(): void
  /** 저장한 값을 지금 기간 자료에 바로 넣는다(서버를 다시 읽기 전에 칸이 보이게) */
  update(change: (snapshot: CalendarSnapshot) => CalendarSnapshot): void
  /** 저장한 설정을 바로 쓴다(병원 정보와 다시 합친다: 병원 정보가 있으면 종류만 바뀐다) */
  setSettings(next: CalSettings): void
}

export const periodKey = (period: CalendarPeriod) => `${period.view}|${period.from}|${period.to}`

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/** 읽은 두 설정. profile null = 병원 정보 없음(예약 설정 값을 쓴다) */
type Base = { cal: CalSettings; profile: ClinicProfile | null }

export function useCalendarData(period: CalendarPeriod): CalendarData {
  const client = useMemo(() => supabaseBrowser(), [])
  const key = periodKey(period)
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null)
  const [base, setBase] = useState<Base | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  // 마지막으로 읽은 병원 정보(다시 읽기 한 번의 실패로 예약 설정 시행자로 바뀌지 않게)
  const lastProfile = useRef<ClinicProfile | null>(null)
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
        const [cal, profile, rows, allday] = await Promise.all([
          loadCalendarSettings(client),
          loadClinicProfile(client).catch(() => 'failed' as const), // 병원 정보 실패는 예약표 읽기를 막지 않는다
          target.view === 'month'
            ? listCalendarCounts(client, target.from, target.to).then((counts) => ({ appts: [] as CalAppt[], counts }))
            : listAppts(client, target.from, target.to).then((appts) => ({ appts, counts: null })),
          listAllDay(client, target.from, target.to),
        ])
        if (mine !== flow.current) return
        lastRev.current = rev
        if (profile !== 'failed') lastProfile.current = profile
        setBase({ cal, profile: lastProfile.current })
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
  const setSettings = useCallback((next: CalSettings) => setBase((prev) => ({ cal: next, profile: prev?.profile ?? null })), [])
  const settings = useMemo(() => (base === null ? null : mergeClinic(base.cal, base.profile)), [base])

  const current = snapshot?.key === key ? snapshot : null
  const status = current ? 'ready' : failedKey === key ? 'failed' : 'loading'
  return { status, snapshot: current, settings, refresh, reload, update, setSettings }
}

// ── 저장 잇기 (spec google-link AC-8526.1·AC-8526.5, design.md 2절 표 4·5·6) ──
// 이은 병원(캘린더를 고르고 이은 날이 있음)의 이은 날 이후 예약만 같은 쓰기에 g_wait를 싣는다. 화면이 저장 뒤 lib/gcal sendAppt로 바로 보낸다.
// 지우기는 싣지 않는다(DB 트리거가 지움 줄 gcal_deletes를 적고 다음 맞춤이 보낸다)

/** 저장 잇기가 보는 연결: 이은 날·맞춤 방법 도착. 잇지 않은 병원은 null */
export type GoogleSaveLink = { linkedOn: string; arrival: 'off' | 'title' } | null

type GoogleWrite = Partial<Pick<CalAppt, 'gEventId' | 'gFrom' | 'gWait' | 'gKeepTitle' | 'colorFrom' | 'gMoved'>>

const onOrAfter = (day: string, from: string) => compareYmd(day, from) >= 0
// 못 보낸 일이 겹치면 큰 일을 남긴다(통째 보내기가 작은 일을 덮는다). 같은 크기면 새 일
const RANK: Record<GWait, number> = { new: 3, move: 2, edit: 1, cancel: 0, uncancel: 0, color: 0 }
const merge = (before: GWait | null, next: GWait): GWait => (before !== null && RANK[before] > RANK[next] ? before : next)
const TITLE_KEYS = ['name', 'chart', 'len', 'memo', 'staffId', 'kindId'] as const

/** 새 예약: 이은 날 이후면 웹앱이 정한 일정 id('ssk' + 32자)·web·new */
export function googleNew(link: GoogleSaveLink, day: string): GoogleWrite {
  if (link === null || !onOrAfter(day, link.linkedOn)) return {}
  return { gEventId: newGoogleEventId(), gFrom: 'web', gWait: 'new' }
}

/** 웹앱 종일 메모: 이은 날 이후면 넣는 쓰기에 일정 id와 보낼 것 */
export function googleMemo(link: GoogleSaveLink, day: string): { gEventId?: string; gWait?: boolean } {
  if (link === null || !onOrAfter(day, link.linkedOn)) return {}
  return { gEventId: newGoogleEventId(), gWait: true }
}

/**
 * 고치기·옮기기·취소·되돌리기·도착: 바뀐 칸으로 g_wait를 정한다. 날짜·시작 → move, 칸(이름·차트번호·길이·메모·시행자·종류) → edit(+ 구글 제목을 두던
 * 예약은 g_keep_title false, 구글 색이던 예약의 시행자·종류를 바꾸면 color_from app), 취소 → cancel, 되돌리기 → uncancel,
 * 도착(왔음·안 옴·자동) → 맞춤 방법이 'title'일 때만 edit. 짝 없는 예약이 이은 날 이후면 새 예약처럼 보낸다.
 * 날짜·시작을 옮기면 모든 갈래(짝 있음 · 이은 날 뒤 새 짝 · 이은 날 앞이나 짝 없음)에 g_moved를 싣는다: 원래 자리(orig_day·orig_start)로
 * 되돌리면 거짓, 아니면 참(이은 병원의 '변경' = g_moved, google-link AC-8545.2)
 */
export function googlePatch(link: GoogleSaveLink, before: CalAppt, patch: Partial<ApptDraft>): GoogleWrite {
  if (link === null) return {}
  const changed = (k: keyof ApptDraft) => k in patch && patch[k] !== before[k as keyof CalAppt]
  const moved = changed('day') || changed('start')
  const fields = TITLE_KEYS.filter((k) => changed(k))
  let wait: GWait | null = null
  if (moved) wait = 'move'
  else if (fields.length > 0) wait = 'edit'
  if (changed('status')) {
    const next = patch.status
    if (next === 'cancel') wait = merge(wait, 'cancel')
    else if (before.status === 'cancel') wait = merge(wait, 'uncancel')
    else if (link.arrival === 'title') wait = merge(wait, 'edit') // 도착 바뀜(AC-8526.5)
  }
  if (wait === null) return {}
  const day = patch.day ?? before.day
  const start = patch.start ?? before.start
  const movedFlag: GoogleWrite = moved ? { gMoved: !(day === before.origDay && start === before.origStart) } : {}
  if (before.gEventId === null) return onOrAfter(day, link.linkedOn) ? { gEventId: newGoogleEventId(), gFrom: 'web', gWait: 'new', ...movedFlag } : movedFlag
  const out: GoogleWrite = { gWait: merge(before.gWait, wait), ...movedFlag }
  if (fields.length > 0 && before.gKeepTitle) out.gKeepTitle = false
  if ((fields.includes('staffId') || fields.includes('kindId')) && before.colorFrom === 'google') out.colorFrom = 'app'
  return out
}
