'use client'

import { useEffect, useRef, useState } from 'react'
import { compareYmd, eachDay, todayInKorea } from '@/lib/analytics/dates'
import { missingFiles, type UisMissingKind } from '@/lib/analytics/uisarang'
import { planUisSave } from '@/lib/payload/uisarang'
import { readUisHave, saveUisPlan } from '@/lib/storage/uisarang'
import type { ErrorCode } from '@/types/errors'
import type { UisFileResult, UisPlan } from '@/types/uisarang'
import { runUisarang, UisRunError } from '@/workers/runUisarang'

// 올리기 칸 상태(specs/uisarang-upload design.md §10-1, REQ-8810): idle → reading → saving → done | saveFailed.
// 흐름: runUisarang(Worker에서 읽기) → planUisSave → saveUisPlan → (저장된 파일이 있으면) readUisHave(이번 날 처음~끝) → missingFiles → onSaved() 한 번.
// 파일 이름은 이 화면 상태(결과 줄)에만 둔다 — Worker로는 이름을 지운 같은 바이트 파일을, 저장·읽기로는 이름 없는 값만 넘긴다(AC-8810.8).
// [다시 저장]은 파일을 다시 읽지 않고 실패한 번호의 줄만 다시 보낸다(AC-8810.5). 상태는 놓는 쪽(LiveDashboard·StatsScreen)이 한 번 든다

export type UisUploadPhase = 'idle' | 'reading' | 'saving' | 'done' | 'saveFailed'
/** 결과 줄 하나: 놓은 파일 이름 · 읽은 결과 · 칩(저장함 · 받지 않음 · 건너뜀 · 저장 못 함) */
export type UisUploadRow = { name: string; result: UisFileResult; status: 'saved' | 'refused' | 'skipped' | 'failed' }
/** 아직 없는 파일: 읽음(빈 목록 = 다 있음) · 읽지 못함(E-UIS-READ-FAILED 카드) */
export type UisMissing = { state: 'ready'; items: Array<{ kind: UisMissingKind; days: string[] }> } | { state: 'failed' }

export type UisUploadView = {
  phase: UisUploadPhase
  /** 읽는 파일 수(읽는 중 줄) */
  count: number
  /** 이번에 놓은 때의 오늘(한국 날짜). 기간 글의 올해 */
  today: string | null
  /** 결과 줄(놓은 차례). 읽는 중·저장 중(처음)·읽기 전체 실패면 null */
  rows: UisUploadRow[] | null
  /** 저장된 파일이 없으면 null */
  missing: UisMissing | null
  /** 읽기 전체 실패 번호(E-UIS-TOO-MANY · E-ANALYZE-TIMEOUT · E-ANALYZE-FAILED) */
  error: ErrorCode | null
  /** 읽는 중·저장 중: [파일 고르기] 잠김 · 놓기 무시 */
  busy: boolean
  take(files: readonly File[]): void
  retrySave(): void
}

type Shown = Pick<UisUploadView, 'phase' | 'count' | 'today' | 'rows' | 'missing' | 'error'>
type Held = { names: string[]; results: UisFileResult[]; plan: UisPlan; failed: Set<number>; today: string; missing: UisMissing | null }

const IDLE: Shown = { phase: 'idle', count: 0, today: null, rows: null, missing: null, error: null }

const filesOf = (plan: UisPlan) => [...plan.stats, ...plan.revenue, ...plan.periods].flatMap((entry) => entry.files)

// 저장은 던지지 않지만(saveUisPlan) 혹시 던지면 계획의 파일 모두 실패다
async function trySave(plan: UisPlan): Promise<Set<number>> {
  try {
    return new Set((await saveUisPlan(plan)).failed)
  } catch {
    return new Set(filesOf(plan))
  }
}

// 실패한 번호의 줄만 담은 계획(다시 저장)
function failedPart(plan: UisPlan, failed: ReadonlySet<number>): UisPlan {
  const hit = (entry: { files: number[] }) => entry.files.some((file) => failed.has(file))
  return { stats: plan.stats.filter(hit), revenue: plan.revenue.filter(hit), periods: plan.periods.filter(hit), refused: [] }
}

function statusOf(result: UisFileResult, at: number, held: Held): UisUploadRow['status'] {
  if (result.status === 'refused' || held.plan.refused.includes(at)) return 'refused'
  if (result.status === 'skipped') return 'skipped'
  return held.failed.has(at) ? 'failed' : 'saved'
}

const rowsOf = (held: Held): UisUploadRow[] => held.results.map((result, at) => ({ name: held.names[at] ?? '', result, status: statusOf(result, at, held) }))

// 저장된 파일이 덮는 날(오늘 이하, 차례대로)
function savedDays(held: Held): string[] {
  const days = new Set<string>()
  held.results.forEach((result, at) => {
    if (result.status !== 'read' || statusOf(result, at, held) !== 'saved') return
    for (const day of eachDay({ from: result.read.span.from, to: result.read.span.to })) if (compareYmd(day, held.today) <= 0) days.add(day)
  })
  return [...days].sort(compareYmd)
}

async function missingOf(days: readonly string[], today: string): Promise<UisMissing | null> {
  if (days.length === 0) return null
  try {
    const have = await readUisHave({ from: days[0]!, to: days[days.length - 1]! })
    return { state: 'ready', items: missingFiles(days, have, today) }
  } catch {
    return { state: 'failed' }
  }
}

// 파일 이름을 지운 같은 바이트 파일(Worker 쪽으로 이름이 가지 않게)
const nameless = (file: File) => new File([file], '', { type: file.type, lastModified: file.lastModified })

export function useUisUpload({ onSaved }: { onSaved?: () => void } = {}): UisUploadView {
  const [shown, setShown] = useState<Shown>(IDLE)
  // 읽기·저장이 도는 동안 참(같은 틱에 두 번 놓아도 하나만 돈다)
  const working = useRef(false)
  const held = useRef<Held | null>(null)
  const alive = useRef(true)
  // 늘 마지막에 받은 onSaved를 부른다
  const saved = useRef(onSaved)
  useEffect(() => {
    saved.current = onSaved
  })
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const show = (next: Shown) => {
    if (alive.current) setShown(next)
  }
  // 저장이 끝난 뒤: 아직 없는 파일을 읽고 결과를 보인 뒤, 저장된 것이 늘었으면 onSaved 한 번
  const settle = async (hold: Held, grew: boolean) => {
    if (grew) hold.missing = await missingOf(savedDays(hold), hold.today)
    working.current = false
    show({ phase: hold.failed.size > 0 ? 'saveFailed' : 'done', count: hold.results.length, today: hold.today, rows: rowsOf(hold), missing: hold.missing, error: null })
    if (grew && alive.current) saved.current?.()
  }

  // 두 함수는 ref와 setState만 쓴다 — 앞 그림의 함수가 불려도 같다
  const take = (files: readonly File[]) => {
    if (working.current || files.length === 0) return
    working.current = true
    const list = [...files]
    const names = list.map((file) => file.name)
    const today = todayInKorea()
    held.current = null
    show({ phase: 'reading', count: list.length, today, rows: null, missing: null, error: null })
    void (async () => {
      let results: UisFileResult[]
      try {
        results = await runUisarang(list.map(nameless), { today })
      } catch (error) {
        working.current = false
        show({ phase: 'done', count: list.length, today, rows: null, missing: null, error: error instanceof UisRunError ? error.code : 'E-ANALYZE-FAILED' })
        return
      }
      const plan = planUisSave(results)
      show({ phase: 'saving', count: list.length, today, rows: null, missing: null, error: null })
      const failed = await trySave(plan)
      const hold: Held = { names, results, plan, failed, today, missing: null }
      held.current = hold
      await settle(hold, results.some((result, at) => statusOf(result, at, hold) === 'saved'))
    })()
  }

  const retrySave = () => {
    const hold = held.current
    if (working.current || hold === null || hold.failed.size === 0) return
    working.current = true
    setShown((current) => ({ ...current, phase: 'saving' }))
    void (async () => {
      const before = hold.failed.size
      hold.failed = await trySave(failedPart(hold.plan, hold.failed))
      await settle(hold, hold.failed.size < before)
    })()
  }

  return { ...shown, busy: shown.phase === 'reading' || shown.phase === 'saving', take, retrySave }
}
