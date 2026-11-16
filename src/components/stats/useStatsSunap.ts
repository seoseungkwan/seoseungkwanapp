'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listSunapDays, loadSunapSettings, type SunapDay } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { RxGroupDef } from '@/types/analysis'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { StatsSunapGroups } from '@/types/stats'
import type { SunapSettings } from '@/types/sunap'
import type { SunapClosed, SunapGroupsState } from './sections/SunapSection'
import { sunapSpan } from './sunapView'
import { groupDefs } from './treatmentView'
import type { StatsRxGroupsView } from './useStatsRxGroups'
import type { StatsRange } from './view'

// 통계 '예약·전환' 칸의 서버 숫자 (spec sunap-ilji REQ-4906 AC-4906.2·AC-4906.3, tasks.md TASK-6).
// 마감한 날: 고른 기간(sunapSpan)의 listSunapDays. 기간이 바뀔 때·[다시 읽기]에 다시 읽고 늦게 온 앞 답은 버린다(useStatsRevenue와 같은 방식).
// 묶음: loadSunapSettings의 Block·물리치료 묶음 id로 통계 처방 묶음(useStatsRxGroups) 목록에서 정의를 찾는다. 둘 다 찾으면 defs(세 칸 묻기에 싣는다),
//   하나라도 안 골랐거나 목록에 없으면(지워진 묶음 = 안 고름, design.md 'DB') none이다. 정의는 groupDefs 그대로(열쇠·코드·빼는 처방·조건)다.
// 숫자·설정은 React 상태에만 둔다. 저장하지 않는다

type Held<T> = { key: string; value: T | null } // value null = 읽기 실패

export type StatsSunap = {
  closed: SunapClosed
  groups: SunapGroupsState
  defs: StatsSunapGroups | null // groups가 'chosen'일 때만 있다
  reread(): void // 설정·마감한 날을 다시 읽는다(통계 묶음 읽기 실패면 그것도)
}

// 서버 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다
const settingsRead = () => Promise.resolve().then(() => loadSunapSettings(supabaseBrowser()))
const closedRead = (from: string, to: string) => Promise.resolve().then(() => listSunapDays(supabaseBrowser(), from, to))

function defOf(groups: readonly StatsRxGroup[], id: string | null): RxGroupDef | null {
  if (id === null) return null
  const group = groups.find((item) => item.id === id)
  return group === undefined ? null : (groupDefs([group])[0] ?? null)
}

export function useStatsSunap(range: StatsRange, rx: StatsRxGroupsView): StatsSunap {
  const { from, to } = sunapSpan(range)
  const [attempt, setAttempt] = useState(0)
  const settingsKey = String(attempt)
  const closedKey = `${from}|${to}|${attempt}`
  const [settings, setSettings] = useState<Held<SunapSettings> | null>(null)
  const [days, setDays] = useState<Held<SunapDay[]> | null>(null)

  useEffect(() => {
    let current = true
    settingsRead().then(
      (value) => {
        if (current) setSettings({ key: settingsKey, value })
      },
      () => {
        if (current) setSettings({ key: settingsKey, value: null })
      },
    )
    return () => {
      current = false
    }
  }, [settingsKey])

  useEffect(() => {
    let current = true
    closedRead(from, to).then(
      (value) => {
        if (current) setDays({ key: closedKey, value })
      },
      () => {
        if (current) setDays({ key: closedKey, value: null })
      },
    )
    return () => {
      current = false
    }
  }, [closedKey, from, to])

  const closed: SunapClosed = days === null || days.key !== closedKey ? 'reading' : (days.value ?? 'failed')
  const shownSettings = settings === null || settings.key !== settingsKey ? 'reading' : (settings.value ?? 'failed')
  const { state: rxState, groups: rxGroups, reread: rxReread } = rx

  const chosen = useMemo((): { groups: SunapGroupsState; defs: StatsSunapGroups | null } => {
    if (shownSettings === 'reading' || rxState === 'reading') return { groups: 'reading', defs: null }
    if (shownSettings === 'failed' || rxState === 'read-failed') return { groups: 'failed', defs: null }
    const block = defOf(rxGroups, shownSettings.blockGroup)
    const pt = defOf(rxGroups, shownSettings.ptGroup)
    return block !== null && pt !== null ? { groups: 'chosen', defs: { block, pt } } : { groups: 'none', defs: null }
  }, [shownSettings, rxState, rxGroups])

  const reread = useCallback(() => {
    setAttempt((n) => n + 1)
    rxReread()
  }, [rxReread])

  return { closed, groups: chosen.groups, defs: chosen.defs, reread }
}
