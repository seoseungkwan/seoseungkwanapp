import type { SupabaseClient } from '@supabase/supabase-js'
import { cellSaveText } from '@/lib/worklog/cellText'
import { blockedCellKeys } from '@/lib/worklog/notes'
import { emptyWorklogDay, WORKLOG_CELL_KEYS, WORKLOG_COLUMNS, type WorklogChanges, type WorklogDay } from '@/types/worklog'

// 업무일지 하루 읽기·저장 (specs/worklog/design.md 9절).
// 내 병원 줄만 보이고 들어가는 것은 RLS와 DB 기본값이 한다. 여기서는 병원 id를 거르지도 보내지도 않는다

export type WorklogErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다 */
export class WorklogStorageError extends Error {
  readonly kind: WorklogErrorKind

  constructor(kind: WorklogErrorKind) {
    super(`worklog storage ${kind}`)
    this.name = 'WorklogStorageError'
    this.kind = kind
  }
}

type Client = Pick<SupabaseClient, 'from'>
type Row = Record<string, string | null>

const TABLE = 'worklog_days'
const SELECT = WORKLOG_CELL_KEYS.map((key) => WORKLOG_COLUMNS[key]).join(',')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new WorklogStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다
async function send<Reply extends { error: unknown; status: number }>(request: () => PromiseLike<Reply>): Promise<Reply> {
  let reply: Reply
  try {
    reply = await request()
  } catch {
    throw new WorklogStorageError('failed')
  }
  if (reply.error) throw new WorklogStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

function toDay(row: Row): WorklogDay {
  const day = emptyWorklogDay()
  for (const key of WORKLOG_CELL_KEYS) day[key] = row[WORKLOG_COLUMNS[key]] ?? ''
  return day
}

// 열쇠를 골라서 만든다({ ...changes } 금지). 받은 칸 말고는 채우지 않는다: null로 보내면 다른 PC가 고친 칸이 지워진다.
// 막는 모양은 자동 저장이 이미 빼고 주지만 서버로 가는 마지막 문이라 한 번 더 뺀다.
// 긴 글자를 자르지 않는다(DB 제약이 거부 → failed. 몰래 잘라 저장하지 않으려고)
function changedColumns(changes: WorklogChanges): Row {
  const blocked = blockedCellKeys(changes)
  const columns: Row = {}
  for (const key of WORKLOG_CELL_KEYS) {
    const text = changes[key]
    if (text === undefined || blocked.includes(key)) continue
    columns[WORKLOG_COLUMNS[key]] = cellSaveText(key, text) || null
  }
  return columns
}

export async function loadWorklogDay(client: Client, ymd: string): Promise<WorklogDay | null> {
  failIfOffline()
  const { data } = await send(() => client.from(TABLE).select(SELECT).eq('work_date', ymd).maybeSingle<Row>())
  return data === null ? null : toDay(data)
}

export async function saveWorklogDay(client: Client, ymd: string, changes: WorklogChanges): Promise<void> {
  const columns = changedColumns(changes)
  if (Object.keys(columns).length === 0) return
  failIfOffline()
  const row: Row = { work_date: ymd, ...columns }
  await send(() => client.from(TABLE).upsert(row, { onConflict: 'hospital_id,work_date' }))
}
