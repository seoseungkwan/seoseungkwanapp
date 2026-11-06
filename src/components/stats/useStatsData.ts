'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isCovered, mergeRanges } from '@/lib/analytics/coverage'
import { compareYmd } from '@/lib/analytics/dates'
import { readCoverage, readDays, saveStats, type StatsSource } from '@/lib/storage/stats'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { StatsChoice } from './periodPick'
import { rangeOf, readSpan, statsRange, type StatsInput, type StatsRange } from './view'

// 저장된 통계 숫자 읽기·저장 (stats REQ-514, design.md TASK-14). 숫자는 React 상태에만 둔다(AC-514.9).
// 그림은 언제나 표에서 읽은 줄이다. 방금 만든 숫자를 합쳐 보이는 것은 저장에 실패했을 때뿐이다(AC-514.3·514.4·514.6):
// 트리거(AC-506.4)가 옛 줄을 남겼을 수 있고, 다시 읽어야 fromFile이 새로 정해진다.
// 고른 기간(stats-period REQ-1706)은 rangeOf(today, choice, true)(끝나지 않은 기간은 오늘까지)로 읽고, 오늘이 덮였는지(todayDone)로 그릴 range를 정한다.
// 읽은 범위가 늘 더 넓어 todayDone이 바뀌어도 다시 읽지 않는다

export type SaveInput = Parameters<typeof saveStats>[0]
export type SavedLatest = Awaited<ReturnType<typeof readDays>>['latest']

type Stored = {
  key: string // 어느 기간·어느 읽기의 답인지
  choice: StatsChoice
  read: StatsRange // 읽은 범위(rangeOf(today, choice, true))
  days: DayPayload[]
  covered: DateRange[] // readCoverage가 준 덮은 기간(자르지 않음)
  saved: boolean
  latest: SavedLatest
  fromFile: boolean
}

const spanOf = ({ from, to }: DateRange): DateRange => ({ from, to })

// 고른 것의 글자 열쇠. 같은 값을 새로 만들어 넘겨도 다시 읽지 않는다(AC-1706.2)
const keyOf = (choice: StatsChoice) => JSON.stringify(choice)
const choiceOf = (key: string) => JSON.parse(key) as StatsChoice

// readDays를 부르는 범위: current·previous·lastYear(있으면)
const readSpans = (range: StatsRange): DateRange[] => [range.current, range.previous, ...(range.lastYear === null ? [] : [range.lastYear])].map(spanOf)

// readCoverage 범위. 빠른 단추는 지금과 같고(비교 첫날 ~ current 끝), 고른 기간은 가장 앞 비교 첫날 ~ 오늘이다(AC-1706.1)
const coverSpan = (range: StatsRange, today: string): DateRange => (range.period === null ? { from: readSpan(range).from, to: today } : readSpan(range))

// 고른 기간의 덮은 기간은 세 읽기 범위와 겹치는 조각만 남긴다. 그 사이는 줄을 읽지 않아 '덮었는데 줄 없음 = 휴진'으로 보이면 안 된다.
// 빠른 단추는 자르지 않는다(지금과 같다)
function clipCovered(covered: readonly DateRange[], read: StatsRange): DateRange[] {
  if (read.period !== null) return [...covered]
  const pieces = readSpans(read).flatMap((span) =>
    covered.flatMap((part) => {
      const from = compareYmd(part.from, span.from) >= 0 ? part.from : span.from
      const to = compareYmd(part.to, span.to) <= 0 ? part.to : span.to
      return compareYmd(from, to) <= 0 ? [{ from, to }] : []
    }),
  )
  return mergeRanges(pieces)
}

// 같은 날이 두 읽기에 들면(직접 날짜의 바로 전·작년이 겹칠 때) 하나만 둔다. 뒤의 읽기가 이긴다
function uniqueDays(rows: readonly DayPayload[]): DayPayload[] {
  return [...new Map(rows.map((row) => [row.day, row])).values()]
}

function laterOf(a: SavedLatest, b: SavedLatest): SavedLatest {
  if (a === null || b === null) return a ?? b
  return Date.parse(b.at) > Date.parse(a.at) ? b : a
}

// 고른 기간과 비교 기간만 읽어 그린다. 그곳에 줄이 없을 때만 화면이 읽는 가장 넓은 범위(최근 12개월 + 작년)를 한 번 더 봐서
// '아직 저장된 통계가 없어요'와 '이 기간 자료가 없어요'를 가른다. 이 읽기의 줄은 그리지 않고 fromFile·latest에도 넣지 않는다(읽은 기간의 값이 아니다)
async function readStored(key: string, choice: StatsChoice, today: string, knownSaved: boolean): Promise<Stored> {
  const read = rangeOf(today, choice, true)
  const [covered, ...answers] = await Promise.all([readCoverage(coverSpan(read, today)), ...readSpans(read).map((span) => readDays(span))])
  // 앞의 읽기(작년·바로 전)를 먼저 둔다(지금처럼 비교 기간 줄 다음에 고른 기간 줄)
  const days = uniqueDays([...answers].reverse().flatMap((answer) => answer.rows))
  let saved = knownSaved || days.length > 0
  if (!saved && read.period !== '12m') {
    const widest = statsRange(today, '12m')
    saved = (await readDays({ from: widest.previous.from, to: widest.current.to })).rows.length > 0
  }
  return {
    key,
    choice,
    read,
    days,
    covered,
    saved,
    latest: answers.reduce<SavedLatest>((latest, answer) => laterOf(latest, answer.latest), null),
    fromFile: answers.some((answer) => answer.fromFile),
  }
}

// 저장하지 못한 숫자를 읽은 줄 위에 얹는다. 같은 날은 방금 만든 숫자이고 가장 앞 비교 첫날 ~ current 끝 밖의 날은 넣지 않는다(AC-1706.3).
// 그 덮은 기간도 읽은 덮은 기간처럼 자른다
function withUnsaved({ days, covered, range }: StatsInput, read: StatsRange, unsaved: SaveInput | null): StatsInput {
  if (unsaved === null) return { days, covered, range }
  const span = readSpan(range)
  const fresh = unsaved.days.filter((row) => compareYmd(row.day, span.from) >= 0 && compareYmd(row.day, span.to) <= 0)
  const freshDays = new Set(fresh.map((row) => row.day))
  return {
    days: [...days.filter((row) => !freshDays.has(row.day)), ...fresh],
    covered: unsaved.covered === null ? covered : mergeRanges([...covered, ...clipCovered([unsaved.covered], read)]),
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
  todayDone: boolean // 읽은 덮은 기간에 오늘이 듦(오늘 진료 끝으로 저장함). 읽지 못했으면 거짓
  coveredTo: string | null // 자르지 않은 덮은 기간의 끝(출처 줄 '…까지 끝난 날로 저장했어요', AC-1706.5). 덮은 기간이 없으면 null
  save(input: SaveInput): Promise<boolean>
  retrySave(): Promise<boolean> // 같은 값을 다시 보낸다
  reread(): void
}

// choice = 빠른 단추(글자) 또는 고른 기간. 다시 읽는 열쇠는 고른 것이다(todayDone이 아니다)
export function useStatsData(choice: StatsChoice, today: string): StatsData {
  const [attempt, setAttempt] = useState(0)
  const [stored, setStored] = useState<Stored | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<SaveInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPeriod, setSavedPeriod] = useState<string | null>(null)
  const knownSaved = useRef(false)
  const chosenKey = keyOf(choice)
  const periodNow = useRef(chosenKey)
  const chosen = useMemo(() => choiceOf(chosenKey), [chosenKey])

  const key = `${today}|${chosenKey}|${attempt}`

  useEffect(() => {
    // 앞에서 저장한 기간을 떠나면 '방금'을 지운다. 돌아와도 다시 켜지지 않게
    if (periodNow.current !== chosenKey) setSavedPeriod(null)
    periodNow.current = chosenKey
  }, [chosenKey])

  useEffect(() => {
    let current = true
    readStored(key, chosen, today, knownSaved.current).then(
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
  }, [key, chosen, today])

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
  const todayDone = !readFailed && stored !== null && isCovered({ from: today, to: today }, stored.covered)
  const input = useMemo(() => {
    // 읽지 못했어도 저장하지 못한 숫자는 그린다("화면에 그대로 있어요"). 앞 읽기의 줄·범위는 다른 기간일 수 있어 쓰지 않는다
    if (readFailed && unsaved !== null) return withUnsaved({ days: [], covered: [], range: rangeOf(today, chosen, false) }, rangeOf(today, chosen, true), unsaved)
    if (stored === null) return null
    // 읽는 동안은 앞 기간 그대로다(stored.choice). 그릴 기간은 오늘이 덮였으면 오늘까지 끝난 날로 센다(AC-1706.2)
    const range = rangeOf(today, stored.choice, todayDone)
    return withUnsaved({ days: stored.days, covered: clipCovered(stored.covered, stored.read), range }, stored.read, unsaved)
  }, [readFailed, stored, unsaved, today, chosen, todayDone])
  const coveredTo = useMemo(() => {
    const uncut = [...(readFailed || stored === null ? [] : stored.covered), ...(unsaved === null || unsaved.covered === null ? [] : [unsaved.covered])]
    return mergeRanges(uncut).at(-1)?.to ?? null
  }, [readFailed, stored, unsaved])

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
    justSaved: savedPeriod === chosenKey,
    todayDone,
    coveredTo,
    save,
    retrySave,
    reread,
  }
}
