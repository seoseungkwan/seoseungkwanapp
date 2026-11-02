'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { eachDay } from '@/lib/analytics/dates'
import { readCountsMessage } from '@/lib/precheck/counts'
import { checkDayCount, upsertDayCounts, type ClaimDayCount } from '@/lib/storage/claimCounts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import type { UploadDayCount } from '@/types/precheck'
import type { ClaimWorker, HeldVisits } from './claimLoad'

// 건수 올리기(AC-019.3·AC-019.4, design.md 15절). Worker가 불러오기·성공한 비트 메모 다시 불러오기·입력이 끝날 때 dayCounts를 보낸다(jobs.ts). 여기서 진료 수를 붙이고 바뀐 날짜 줄만 올린다.
// 진료 수(visits)는 그 불러오기 앞에 물은 claim.dates다(claimLoad.pressClaimLoad): 날짜 목록이 같은 출처와 견준다(AC-013.1). 메시지가 오지 않으면 아무것도 올리지 않는다: 0인 줄에 진료 수를 붙이면 끝난 날로 읽힌다.
// 실패하면(마이그레이션 전이라 표가 없을 때 포함) 메모리에 두고 다음에 바뀔 때·창 초점이 올 때·화면으로 돌아올 때 다시 올린다. 대기 중인 줄은 받을 때 붙인 진료 수 그대로다. 어떤 실패도 화면으로 던지지 않는다: 숫자만 못 올렸을 뿐 청구 일은 계속된다.
// Worker 하나에 하나다(claimLoad의 번호와 같다): 다른 탭에 다녀와도 못 올린 줄이 남고, 듣는 곳도 하나다. 로그아웃은 전체 페이지 이동이라 메모리와 Worker가 함께 사라진다

/** synced: 받은 건수가 모두 서버에 있다. uploads: 올리기에 성공한 횟수 */
type Snapshot = { lastUploadedAt: string | null; failed: boolean; synced: boolean; uploads: number }

type Uploader = {
  hold(load: number, visits: HeldVisits): void
  readMark(): number
  remember(rows: readonly ClaimDayCount[], mark: number): void
  retry(): void
  subscribe(fn: () => void): () => void
  snapshot(): Snapshot
}

const valueOf = (row: Omit<UploadDayCount, 'visit_date'>) => `${row.visits}|${row.need_memo}|${row.entered}|${row.needs_check}|${row.skipped}`
const zeroRow = (visit_date: string, visits = 0): UploadDayCount => ({ visit_date, visits, need_memo: 0, entered: 0, needs_check: 0, skipped: 0 })
const ZERO_VALUE = valueOf(zeroRow(''))

const uploaders = new WeakMap<ClaimWorker, Uploader>()

function uploaderOf(worker: ClaimWorker): Uploader {
  const known = uploaders.get(worker)
  if (known) return known
  /** 서버에 있다고 아는 값: 날짜 → 값 */
  const onServer = new Map<string, string>()
  /** 아직 올리지 못한 줄: 날짜 → 마지막 값 */
  const waiting = new Map<string, UploadDayCount>()
  /** 읽기와 올리기의 앞뒤를 가리는 차례. 그 날을 마지막으로 올린 차례를 적어 둔다 */
  let clock = 0
  const uploadedAt = new Map<string, number>()
  /** 마지막 불러오기 번호와 그 앞에 물은 진료 수 */
  let held: { load: number; visits: HeldVisits } | null = null
  const listeners = new Set<() => void>()
  let state: Snapshot = { lastUploadedAt: null, failed: false, synced: false, uploads: 0 }
  let sending = false

  const update = (next: Partial<Snapshot>) => {
    state = { ...state, ...next }
    for (const fn of [...listeners]) fn()
  }

  async function flush() {
    if (sending) return
    for (const [date, row] of waiting) if (onServer.get(date) === valueOf(row)) waiting.delete(date)
    if (waiting.size === 0) return update({ failed: false, synced: true })
    const batch = [...waiting.values()]
    sending = true
    update({ synced: false })
    try {
      await upsertDayCounts(supabaseBrowser(), batch)
    } catch {
      sending = false
      return update({ failed: true })
    }
    sending = false
    const at = ++clock
    for (const row of batch) {
      onServer.set(row.visit_date, valueOf(row))
      uploadedAt.set(row.visit_date, at)
      if (waiting.get(row.visit_date) === row) waiting.delete(row.visit_date)
    }
    update({ lastUploadedAt: new Date().toISOString(), failed: false, uploads: state.uploads + 1 })
    void flush() // 올리는 동안 온 값
  }

  /** 틀린 줄은 남겨 두지 않는다: 한 번에 올리므로 맞는 줄까지 영영 막힌다 */
  function push(rows: readonly unknown[]) {
    let bad = false
    for (const row of rows) {
      try {
        const checked = checkDayCount(row)
        waiting.set(checked.visit_date, checked)
      } catch {
        bad = true
      }
    }
    if (bad && waiting.size === 0) return update({ failed: true, synced: false })
    void flush()
  }

  /** 서버나 대기 중인 줄에 0이 아닌 수가 있는 날 */
  const hasCounts = (date: string) => {
    const queued = waiting.get(date)
    if (queued && valueOf(queued) !== ZERO_VALUE) return true
    const server = onServer.get(date)
    return server !== undefined && server !== ZERO_VALUE
  }

  /**
   * 건수 메시지(AC-019.3·AC-019.4). 번호가 다르면 버린다. 줄마다 진료 수를 붙인다: 묻지 못했거나 답에 그 날이 없으면 0이다.
   * 고른 기간에서 Worker 줄이 없는 날: 진료 수가 있으면(증상이 빈 내원만 있는 날) 나머지 0인 줄을 올린다. 없으면(진료가 모두 사라진 날) 수가 있던 날만 모두 0으로 덮는다(지우기 권한이 없다). 묻지 못했으면 건드리지 않는다
   */
  function receive({ load, rows, range }: { load: number; rows: unknown[]; range: DateRange }) {
    if (held?.load !== load) return
    const { visits } = held
    const dateOf = (row: unknown) => (typeof row === 'object' && row !== null ? (row as { visit_date?: unknown }).visit_date : undefined)
    const stamped: unknown[] = rows.map((row) => {
      const date = dateOf(row)
      return { ...(row as object), visits: typeof date === 'string' ? (visits?.get(date) ?? 0) : 0 }
    })
    if (visits) {
      const withRow = new Set(rows.map(dateOf))
      for (const date of eachDay(range)) {
        if (withRow.has(date)) continue
        const count = visits.get(date) ?? 0
        if (count > 0) stamped.push(zeroRow(date, count))
        else if (hasCounts(date)) stamped.push(zeroRow(date))
      }
    }
    push(stamped)
  }

  const uploader: Uploader = {
    hold(load, visits) {
      held = { load, visits }
    },
    /** 서버 건수를 읽기 시작할 때 받아 remember에 함께 넘긴다 */
    readMark: () => ++clock,
    /**
     * 서버에서 읽은 값. 같은 값은 올리지 않는다: 바뀐 시각이 불러올 때마다 새로 찍히지 않게.
     * 대기 중인 날과 읽기를 시작한 뒤에 올린 날은 적지 않는다: 옛 답이 늦게 오면 아는 값이 옛 값이 되어 뒤에 그 값이 실제로 되어도 올리지 않는다
     */
    remember(rows, mark) {
      for (const row of rows) {
        if (waiting.has(row.visit_date) || (uploadedAt.get(row.visit_date) ?? 0) > mark) continue
        onServer.set(row.visit_date, valueOf(row))
      }
      const latest = rows.map((row) => row.updated_at).reduce<string | null>((late, stamp) => (late === null || Date.parse(stamp) > Date.parse(late) ? stamp : late), state.lastUploadedAt)
      if (latest !== state.lastUploadedAt) update({ lastUploadedAt: latest })
    },
    retry() {
      if (waiting.size > 0) void flush()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    snapshot: () => state,
  }
  worker.addEventListener('message', (event) => {
    const message = readCountsMessage((event as MessageEvent<unknown>).data)
    if (message) receive(message)
  })
  uploaders.set(worker, uploader)
  return uploader
}

export function useCountsUpload(worker: ClaimWorker) {
  const uploader = uploaderOf(worker)
  const snapshot = useSyncExternalStore(uploader.subscribe, uploader.snapshot, uploader.snapshot)
  useEffect(() => {
    uploader.retry() // 다른 탭에 다녀왔다. 앱 안 이동에는 초점 사건이 없다
    window.addEventListener('focus', uploader.retry)
    return () => window.removeEventListener('focus', uploader.retry)
  }, [uploader])
  return { hold: uploader.hold, readMark: uploader.readMark, remember: uploader.remember, ...snapshot }
}
