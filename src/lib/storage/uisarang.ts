import type { SupabaseClient } from '@supabase/supabase-js'
import { uisUnitOf, validateUisAgePayload, validateUisRxPayload } from '@/lib/payload/uisarang'
import { createRevenueStore } from '@/lib/storage/revenue'
import { StorageError, readAllPages, readCoverage, readDays, saveStats } from '@/lib/storage/stats'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import type { UisHave, UisPeriodKind, UisPeriodPayload, UisPeriodRow, UisPlan } from '@/types/uisarang'

// 의사랑 숫자 저장·읽기(specs/uisarang-upload design.md §9, 브라우저 → Supabase + RLS, ADR-004·ADR-056).
// 서버로 가는 값은 검사한 저장 모양(날 줄·매출 날 줄·처방·나이대)과 날짜·종류뿐이다. 환자 줄·파일 이름을 만드는 코드(lib/parsers·workers)를 부르지 않는다.
// hospital_id·updated_at은 보내지 않는다(DB 기본값·트리거). 실패는 파일 차례 번호·오류 번호로만 내고 Supabase 답은 옮기지 않는다

type Client = Pick<SupabaseClient, 'from' | 'rpc'>
type Deps = { client?: Client }

const TABLE = 'uis_periods'
const ON_CONFLICT = 'hospital_id,kind,from_day,to_day'
const PERIOD_BATCH = 50
const READ_FAILED = 'E-UIS-READ-FAILED'

type StoredPeriod = { kind: unknown; from_day: unknown; to_day: unknown; payload: unknown; updated_at: unknown }

// 처방·나이대 줄 하나 검사: 종류에 맞는 모양 · 기간 모양(처방은 하루·한 주·한 달, 나이대는 하루). 아니면 null
function periodRowOf<K extends UisPeriodKind>(kind: K, from: unknown, to: unknown, payload: unknown): { from: string; to: string; payload: UisPeriodPayload<K> } | null {
  if (typeof from !== 'string' || typeof to !== 'string') return null
  const unit = uisUnitOf(from, to)
  if (unit === null || (kind === 'age' && unit !== 'day')) return null
  const checked = kind === 'rx' ? validateUisRxPayload(payload) : validateUisAgePayload(payload)
  return checked === null ? null : { from, to, payload: checked as UisPeriodPayload<K> }
}

async function attemptFiles(files: readonly number[], failed: Set<number>, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    for (const file of files) failed.add(file)
  }
}

/**
 * 저장 계획을 보낸다(design.md §9): 날 숫자는 saveStats(출처 uisarang · 달 줄 없음), 매출은 날마다 save_revenue_range(날 단위 처방 줄 없음 → null),
 * 처방·나이대는 uis_periods upsert(50줄씩, 칸 kind·from_day·to_day·payload만). 줄 하나가 실패해도 나머지는 계속하고,
 * 실패한 줄의 파일 차례 번호를 한 번씩 차례로 돌려준다. 던지지 않는다
 */
export async function saveUisPlan(plan: UisPlan, deps?: Deps): Promise<{ failed: number[] }> {
  const failed = new Set<number>()
  const allFiles = [...plan.stats, ...plan.revenue, ...plan.periods].flatMap((entry) => entry.files)
  let client: Client
  try {
    client = deps?.client ?? supabaseBrowser()
  } catch {
    return { failed: [...new Set(allFiles)].sort((a, b) => a - b) }
  }

  for (const entry of plan.stats) {
    await attemptFiles(entry.files, failed, () => saveStats({ months: [], days: entry.days, covered: entry.covered, source: 'uisarang' }, { client }))
  }
  const revenue = createRevenueStore(client as SupabaseClient)
  for (const entry of plan.revenue) {
    const { row } = entry
    await attemptFiles(entry.files, failed, () => revenue.saveRange({ from: row.date, to: row.date }, { days: [row], codes: [] }))
  }

  // 보내기 전에 다시 검사한다 — 검사를 못 지난 줄은 보내지 않고 그 파일만 실패다
  const rows: Array<{ files: number[]; row: { kind: UisPeriodKind; from_day: string; to_day: string; payload: unknown } }> = []
  for (const entry of plan.periods) {
    const checked = periodRowOf(entry.kind, entry.from, entry.to, entry.payload)
    if (checked === null) for (const file of entry.files) failed.add(file)
    else rows.push({ files: entry.files, row: { kind: entry.kind, from_day: checked.from, to_day: checked.to, payload: checked.payload } })
  }
  for (let at = 0; at < rows.length; at += PERIOD_BATCH) {
    const batch = rows.slice(at, at + PERIOD_BATCH)
    const files = batch.flatMap((item) => item.files)
    await attemptFiles(files, failed, async () => {
      const { error } = await client.from(TABLE).upsert(batch.map((item) => item.row), { onConflict: ON_CONFLICT })
      if (error) throw new Error('저장 실패')
    })
  }
  return { failed: [...failed].sort((a, b) => a - b) }
}

async function readOrFail<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    throw new StorageError(READ_FAILED)
  }
}

/** 기간과 겹치는(from_day ≤ 끝 · to_day ≥ 시작) 처방·나이대 줄을 1,000줄씩 모두 읽어 검사를 지난 것만 기간 차례로. 실패 = StorageError E-UIS-READ-FAILED */
export async function readUisPeriods<K extends UisPeriodKind>(kind: K, range: DateRange, deps?: Deps): Promise<UisPeriodRow<UisPeriodPayload<K>>[]> {
  return readOrFail(async () => {
    const client = deps?.client ?? supabaseBrowser()
    const stored = await readAllPages<StoredPeriod>((first, last) =>
      client
        .from(TABLE)
        .select('kind, from_day, to_day, payload, updated_at')
        .eq('kind', kind)
        .lte('from_day', range.to)
        .gte('to_day', range.from)
        .order('from_day')
        .order('to_day')
        .range(first, last),
    )
    return stored.flatMap((row) => {
      if (row.kind !== kind || typeof row.updated_at !== 'string') return []
      const checked = periodRowOf(kind, row.from_day, row.to_day, row.payload)
      return checked === null ? [] : [{ kind, ...checked, updatedAt: row.updated_at }]
    })
  })
}

/**
 * 이번에 넣은 날 범위에 이미 있는 것(아직 없는 파일 셈, design.md §8 missingFiles): 덮은 기간(stats_coverage) · 진료한 날(stats_days 환자 1명 이상) ·
 * 매출 날(sales_days) · 처방 줄 기간 · 나이대 날. 하나라도 읽지 못하면 StorageError E-UIS-READ-FAILED
 */
export async function readUisHave(range: DateRange, deps?: Deps): Promise<UisHave> {
  return readOrFail(async () => {
    const client = deps?.client ?? supabaseBrowser()
    const [covered, days, sales, rx, age] = await Promise.all([
      readCoverage(range, { client }),
      readDays(range, { client }),
      createRevenueStore(client as SupabaseClient).loadDays(range),
      readUisPeriods('rx', range, { client }),
      readUisPeriods('age', range, { client }),
    ])
    return {
      covered,
      worked: days.rows.filter((payload) => payload.totals.patients > 0).map((payload) => payload.day),
      income: sales.map((row) => row.date),
      rx: rx.map(({ from, to }) => ({ from, to })),
      age: age.map((row) => row.from),
    }
  })
}
