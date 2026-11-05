'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { mergeRanges } from '@/lib/analytics/coverage'
import { compareYmd } from '@/lib/analytics/dates'
import { readCoverage, readDays, saveStats, type StatsSource } from '@/lib/storage/stats'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import { statsRange, type StatsInput, type StatsPeriod, type StatsRange } from './view'

// 저장된 통계 숫자 읽기·저장 (stats REQ-514, design.md TASK-14). 숫자는 React 상태에만 둔다(AC-514.9).
// 그림은 언제나 표에서 읽은 줄이다. 방금 만든 숫자를 합쳐 보이는 것은 저장에 실패했을 때뿐이다(AC-514.3·514.4·514.6):
// 트리거(AC-506.4)가 옛 줄을 남겼을 수 있고, 다시 읽어야 fromFile이 새로 정해진다

export type SaveInput = Parameters<typeof saveStats>[0]
export type SavedLatest = Awaited<ReturnType<typeof readDays>>['latest']

type Stored = {
  key: string // 어느 기간·어느 읽기의 답인지
  range: StatsRange
  days: DayPayload[]
  covered: DateRange[]
  saved: boolean
  latest: SavedLatest
  fromFile: boolean
}

const spanOf = ({ from, to }: DateRange): DateRange => ({ from, to })

function laterOf(a: SavedLatest, b: SavedLatest): SavedLatest {
  if (a === null || b === null) return a ?? b
  return Date.parse(b.at) > Date.parse(a.at) ? b : a
}

// 고른 기간과 비교 기간만 읽어 그린다. 그 두 곳에 줄이 없을 때만 화면이 읽는 가장 넓은 범위(최근 12개월 + 작년)를 한 번 더 봐서
// '아직 저장된 통계가 없어요'와 '이 기간 자료가 없어요'를 가른다. 이 읽기의 줄은 그리지 않고 fromFile·latest에도 넣지 않는다(읽은 기간의 값이 아니다)
async function readStored(key: string, range: StatsRange, today: string, knownSaved: boolean): Promise<Stored> {
  const [now, before, covered] = await Promise.all([
    readDays(spanOf(range.current)),
    readDays(spanOf(range.previous)),
    readCoverage({ from: range.previous.from, to: range.current.to }),
  ])
  const days = [...before.rows, ...now.rows]
  let saved = knownSaved || days.length > 0
  if (!saved && range.period !== '12m') {
    const widest = statsRange(today, '12m')
    saved = (await readDays({ from: widest.previous.from, to: widest.current.to })).rows.length > 0
  }
  return { key, range, days, covered, saved, latest: laterOf(now.latest, before.latest), fromFile: now.fromFile || before.fromFile }
}

// 저장하지 못한 숫자를 읽은 줄 위에 얹는다. 같은 날은 방금 만든 숫자이고 기간 밖의 날은 넣지 않는다
function withUnsaved({ days, covered, range }: StatsInput, unsaved: SaveInput | null): StatsInput {
  if (unsaved === null) return { days, covered, range }
  const fresh = unsaved.days.filter((row) => compareYmd(row.day, range.previous.from) >= 0 && compareYmd(row.day, range.current.to) <= 0)
  const freshDays = new Set(fresh.map((row) => row.day))
  return {
    days: [...days.filter((row) => !freshDays.has(row.day)), ...fresh],
    covered: unsaved.covered === null ? covered : mergeRanges([...covered, unsaved.covered]),
    range,
  }
}

export type StatsData = {
  revision: number // 저장에 성공하거나 [다시 읽기]를 누를 때마다 는다. 찾기 목록이 넓은 범위를 다시 읽는 때를 안다(rx-picker AC-802.7)
  reading: boolean // 지금 고른 기간을 읽는 중. input은 그동안 앞 기간 그대로다
  readFailed: boolean
  input: StatsInput | null // 한 번도 읽지 못했고 저장하지 못한 숫자도 없으면 null. 읽기에 실패했는데 저장하지 못한 숫자가 있으면 지금 기간 + 그 숫자뿐이다
  saved: boolean // 저장된 숫자가 하나라도 있음(저장하지 못한 숫자를 보이는 동안도)
  latest: SavedLatest // 읽기에 실패하면 null
  fromFile: boolean // 파일 안내(AC-514.7). latest.source로 정하지 않는다
  unsaved: StatsSource | null // 저장하지 못한 방금 만든 숫자의 출처
  saving: boolean
  justSaved: boolean // 이 기간을 그린 뒤 방금 저장했다('· 방금')
  save(input: SaveInput): Promise<boolean>
  retrySave(): Promise<boolean> // 같은 값을 다시 보낸다
  reread(): void
}

export function useStatsData(period: StatsPeriod, today: string): StatsData {
  const [attempt, setAttempt] = useState(0)
  const [stored, setStored] = useState<Stored | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<SaveInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPeriod, setSavedPeriod] = useState<StatsPeriod | null>(null)
  const knownSaved = useRef(false)
  const periodNow = useRef(period)

  const key = `${today}|${period}|${attempt}`

  useEffect(() => {
    // 앞에서 저장한 기간을 떠나면 '방금'을 지운다. 돌아와도 다시 켜지지 않게
    if (periodNow.current !== period) setSavedPeriod(null)
    periodNow.current = period
  }, [period])

  useEffect(() => {
    let current = true
    readStored(key, statsRange(today, period), today, knownSaved.current).then(
      (next) => {
        if (next.saved) knownSaved.current = true
        if (!current) return
        setStored(next)
        setFailedKey(null)
      },
      () => {
        if (current) setFailedKey(key)
      },
    )
    return () => {
      current = false
    }
  }, [key, period, today])

  const save = useCallback(async (input: SaveInput) => {
    setSaving(true)
    try {
      await saveStats(input)
    } catch {
      setUnsaved(input)
      return false
    } finally {
      setSaving(false)
    }
    setUnsaved(null)
    setSavedPeriod(periodNow.current)
    setAttempt((n) => n + 1)
    return true
  }, [])

  const retrySave = useCallback(async () => (unsaved === null ? false : save(unsaved)), [save, unsaved])
  const reread = useCallback(() => setAttempt((n) => n + 1), [])

  const readFailed = failedKey === key
  const input = useMemo(() => {
    // 읽지 못했어도 저장하지 못한 숫자는 그린다("화면에 그대로 있어요"). 앞 읽기의 줄·범위는 다른 기간일 수 있어 쓰지 않는다
    if (readFailed && unsaved !== null) return withUnsaved({ days: [], covered: [], range: statsRange(today, period) }, unsaved)
    return stored === null ? null : withUnsaved(stored, unsaved)
  }, [readFailed, stored, unsaved, today, period])

  return {
    revision: attempt,
    reading: stored?.key !== key && !readFailed,
    readFailed,
    input,
    saved: unsaved !== null || (stored?.saved ?? false),
    // 읽지 못한 기간에 앞 읽기의 출처·파일 표시를 붙이지 않는다
    latest: readFailed ? null : (stored?.latest ?? null),
    fromFile: unsaved?.source === 'file' || (!readFailed && (stored?.fromFile ?? false)),
    unsaved: unsaved?.source ?? null,
    saving,
    justSaved: savedPeriod === period,
    save,
    retrySave,
    reread,
  }
}
