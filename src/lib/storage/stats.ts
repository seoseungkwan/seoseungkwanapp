import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeRanges } from '@/lib/analytics/coverage'
import { diffDays, isYmd } from '@/lib/analytics/dates'
import { validateDayPayload, validateMonthPayload } from '@/lib/payload/validate'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { StatsCoverageRow, StatsDayRow } from '@/types/db'
import type { DateRange } from '@/types/dates'
import type { DayPayload, MonthPayload } from '@/types/payload'

// 통계 숫자 저장·읽기(브라우저 → Supabase, ADR-004). 서버로 가는 값은 검사한 저장 모양·덮은 기간(날짜 둘)·출처뿐이다.
// hospital_id는 보내지 않는다 — DB 기본값이 정하고 권한이 막는다(AC-506.2).
// 실패는 StorageError 하나로 던지고 서버 답은 옮기지 않는다(cause도 없다). 화면은 오류 번호의 정해 둔 문구만 보인다
export type StatsSource = 'bit' | 'file'
export type SupabaseLike = Pick<SupabaseClient, 'from'>

type StorageErrorCode = 'E-STATS-SAVE-FAILED' | 'E-STATS-READ-FAILED'
type Deps = { client?: SupabaseLike }
type Latest = { at: string; source: StatsSource } | null

export class StorageError extends Error {
  readonly code: StorageErrorCode

  constructor(code: StorageErrorCode) {
    super(code)
    this.name = 'StorageError'
    this.code = code
  }
}

const BATCH_ROWS = 200
const PAGE_ROWS = 1000 // Supabase가 한 번에 주는 줄 수 기본값. 넘는 줄은 알리지 않고 잘라 주므로 쪽으로 나눠 다 읽는다
const MAX_COVERED_SPAN = 800 // stats_coverage 제약(to_day - from_day < 800)과 같다. 양 끝을 합쳐 800일까지
const MAX_MONTH_BYTES = 1_048_576 // stats_months 제약(octet_length(payload::text) <= 1048576)과 같다
const MAX_DAY_BYTES = 65_536 // stats_days 제약(octet_length(payload::text) <= 65536)과 같다

// 어디서 실패하든(검사·클라이언트 만들기·보내기·읽기) 번호 하나로 바꾼다. 원래 오류는 버린다
async function attempt<T>(code: StorageErrorCode, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    throw new StorageError(code)
  }
}

const isSource = (value: unknown): value is StatsSource => value === 'bit' || value === 'file'

// 표가 재는 글자(jsonb::text)와 같게 쓴다. 콤마·콜론 뒤에 빈칸이 하나 있어 JSON.stringify로 재면 약 10% 적게 나온다
function jsonbText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonbText).join(', ')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${jsonbText(item)}`)
      .join(', ')}}`
  }
  return JSON.stringify(value)
}

const UTF8 = new TextEncoder()
const tableBytes = (value: unknown): number => UTF8.encode(jsonbText(value)).length

// 표가 받지 않을 크기도 먼저 거른다. 앞 묶음을 저장한 뒤에야 그 줄이 든 묶음째 실패하지 않게
function allChecked<P>(values: readonly unknown[], check: (value: unknown) => P | null, maxBytes: number): P[] {
  return values.map((value) => {
    const checked = check(value)
    if (checked === null) throw new Error('검사에 걸림')
    if (tableBytes(checked) > maxBytes) throw new Error('표가 받지 않는 크기')
    return checked
  })
}

// 날 줄이 표 크기를 넘고 again이 있으면 again을 뺀 줄을 보낸다(그날만 화면에서 '아직 셀 수 없는 날'이 된다).
// 이 칸 때문에 지금 되던 저장이 깨지지 않게. 빼도 넘으면 allChecked가 지금처럼 던진다
function fitDay(payload: DayPayload): DayPayload {
  if (payload.again === undefined || tableBytes(payload) <= MAX_DAY_BYTES) return payload
  const rest = { ...payload }
  delete rest.again
  return rest
}

function checkedDay(value: unknown): DayPayload | null {
  const checked = validateDayPayload(value)
  return checked === null ? null : fitDay(checked)
}

// 표가 받지 않을 기간을 먼저 거른다. 달·일 숫자를 보낸 뒤에야 덮은 기간 줄에서 실패하지 않게
function coverageRow(covered: DateRange | null, source: StatsSource) {
  if (covered === null) return null
  const { from, to } = covered
  if (!isYmd(from) || !isYmd(to)) throw new Error('날짜가 아님')
  const span = diffDays(from, to)
  if (span < 0 || span >= MAX_COVERED_SPAN) throw new Error('표가 받지 않는 기간')
  return { from_day: from, to_day: to, source }
}

async function upsertInBatches(client: SupabaseLike, table: string, onConflict: string, rows: readonly object[]): Promise<void> {
  for (let at = 0; at < rows.length; at += BATCH_ROWS) {
    const { error } = await client.from(table).upsert(rows.slice(at, at + BATCH_ROWS), { onConflict })
    if (error) throw error
  }
}

export async function saveStats(
  input: { months: MonthPayload[]; days: DayPayload[]; covered: DateRange | null; source: StatsSource },
  deps?: Deps,
): Promise<{ saved: number }> {
  return attempt('E-STATS-SAVE-FAILED', async () => {
    // 먼저 전부 검사한다. 하나라도 걸리면 아무것도 보내지 않는다
    const { source } = input
    if (!isSource(source)) throw new Error('출처가 아님')
    // 파일의 덜 덮인 달 줄은 검사만 하고 보내지 않는다. 그 줄에는 그 파일 하나가 든 숫자만 있고, 달 줄을 읽는 곳은 feat-ai-report뿐이다.
    // 통계 화면의 달 칸은 일 숫자의 합이다. 비트의 덜 덮인 달 줄은 보낸다
    const monthRows = allChecked(input.months, validateMonthPayload, MAX_MONTH_BYTES)
      .filter((payload) => source !== 'file' || !payload.partial)
      .map((payload) => ({
        month: payload.month,
        partial: payload.partial,
        source,
        payload,
      }))
    const dayRows = allChecked(input.days, checkedDay, MAX_DAY_BYTES).map((payload) => ({
      day: payload.day,
      partial: payload.partial,
      source,
      payload,
    }))
    const covered = coverageRow(input.covered, source)

    const client = deps?.client ?? supabaseBrowser()
    await upsertInBatches(client, 'stats_months', 'hospital_id,month', monthRows)
    await upsertInBatches(client, 'stats_days', 'hospital_id,day', dayRows)
    if (covered !== null) {
      const { error } = await client.from('stats_coverage').insert(covered)
      if (error) throw error
    }
    // 보낸 줄 수다. 트리거가 완전한 줄을 지켜 옛 줄을 남겨도 서버는 오류 없이 답하므로, 실제로 바뀐 줄 수가 아니다
    return { saved: monthRows.length + dayRows.length }
  })
}

export async function readAllPages<Row>(
  page: (first: number, last: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const rows: Row[] = []
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_ROWS - 1)
    if (error) throw error
    // 표 타입을 만들어 두지 않은 클라이언트라 줄 모양은 손으로 맞춘다(types/db.ts). 값은 부르는 쪽이 검사한다
    const got = (data ?? []) as Row[]
    rows.push(...got)
    if (got.length < PAGE_ROWS) return rows
  }
}

type StoredFields = Pick<StatsDayRow, 'partial' | 'source' | 'payload' | 'updated_at'>

async function readPeriod<K extends 'month' | 'day', P extends Record<K, string> & { partial: boolean }>(
  table: string,
  key: K,
  check: (value: unknown) => P | null,
  range: { from: string; to: string },
  deps?: Deps,
): Promise<{ rows: P[]; dropped: number; latest: Latest; fromFile: boolean }> {
  return attempt('E-STATS-READ-FAILED', async () => {
    const client = deps?.client ?? supabaseBrowser()
    const stored = await readAllPages<StoredFields & Record<K, string>>((first, last) =>
      client
        .from(table)
        .select(`${key}, partial, source, payload, updated_at`)
        .gte(key, range.from)
        .lte(key, range.to)
        .order(key, { ascending: true })
        .range(first, last),
    )

    const keyOf = (value: Record<K, string>): string => value[key]
    const rows: P[] = []
    let dropped = 0
    let latest: Latest = null
    let latestTime = -Infinity
    let fromFile = false
    for (const row of stored) {
      const payload = check(row.payload)
      if (payload === null || keyOf(payload) !== keyOf(row) || payload.partial !== row.partial || !isSource(row.source)) {
        dropped += 1
        continue
      }
      rows.push(payload)
      // 시각을 읽는 것과 상관없이 정한다. latest만으로는 최근 비트 줄과 옛 파일 줄이 섞인 기간을 알 수 없다
      if (row.source === 'file') fromFile = true
      // 글자 순서는 소수점 자리 수·시간대에 따라 어긋날 수 있어 시각으로 견준다. 걸러진 줄은 화면에 없으니 보지 않는다.
      // 브라우저가 시각을 읽지 못하면(NaN) 숫자는 그대로 두고 이 비교에서만 빠진다. 출처 글자 때문에 숫자를 잃지 않게
      const time = Date.parse(row.updated_at)
      if (time > latestTime) {
        latestTime = time
        latest = { at: row.updated_at, source: row.source }
      }
    }
    return { rows, dropped, latest, fromFile }
  })
}

export async function readDays(
  range: { from: string; to: string },
  deps?: Deps,
): Promise<{ rows: DayPayload[]; dropped: number; latest: Latest; fromFile: boolean }> {
  return readPeriod('stats_days', 'day', validateDayPayload, range, deps)
}

export async function readMonths(
  range: { from: string; to: string },
  deps?: Deps,
): Promise<{ rows: MonthPayload[]; dropped: number; latest: Latest }> {
  const { rows, dropped, latest } = await readPeriod('stats_months', 'month', validateMonthPayload, range, deps)
  return { rows, dropped, latest }
}

/** 그 기간과 겹치는 덮은 기간을 합쳐 시작 순으로. 겹치는 줄의 기간 밖 날도 그대로 둔다 */
export async function readCoverage(range: { from: string; to: string }, deps?: Deps): Promise<DateRange[]> {
  return attempt('E-STATS-READ-FAILED', async () => {
    const client = deps?.client ?? supabaseBrowser()
    const stored = await readAllPages<Pick<StatsCoverageRow, 'from_day' | 'to_day'>>((first, last) =>
      client
        .from('stats_coverage')
        .select('from_day, to_day')
        .lte('from_day', range.to)
        .gte('to_day', range.from)
        .order('from_day', { ascending: true })
        .order('to_day', { ascending: true })
        .range(first, last),
    )
    return mergeRanges(stored.filter((row) => isYmd(row.from_day) && isYmd(row.to_day)).map((row) => ({ from: row.from_day, to: row.to_day })))
  })
}
