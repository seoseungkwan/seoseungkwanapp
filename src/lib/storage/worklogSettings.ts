import type { SupabaseClient } from '@supabase/supabase-js'
import { CASH_FLOAT_DEFAULT, CASH_FLOAT_MAX } from '@/types/worklog'
import { WorklogStorageError } from './worklogDays'

// 업무일지 병원 설정 읽기·저장 (specs/worklog-cash-float design.md '읽기·저장', AC-1603.3). 지금은 시재 금액 하나다.
// 내 병원 줄만 보이고 hospital_id는 DB 기본값이 넣는다(RLS). 여기서는 병원 id를 거르지도 보내지도 않는다.
// worklogDays.ts와 따로 둔 까닭: 화면 시험이 worklogDays를 가짜로 바꾸는데 다른 표의 함수가 같은 파일에 있으면 섞인다.
// 실패는 WorklogStorageError(종류만)다. Supabase 문구는 옮기지 않는다

type Client = Pick<SupabaseClient, 'from'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않는다

const TABLE = 'worklog_settings'
const FLOAT_COLUMN = 'cash_float'

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new WorklogStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (worklogDays.ts와 같은 모양)
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

const isFloatWon = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= CASH_FLOAT_MAX

/** 병원 시재 금액. 줄이 없거나 값이 범위 밖·모양이 틀리면 기본 300,000원 */
export async function loadCashFloatSetting(client: Client): Promise<number> {
  failIfOffline()
  const { data } = await send(() => client.from(TABLE).select(FLOAT_COLUMN).maybeSingle<ReadRow>())
  const won = data?.[FLOAT_COLUMN]
  return isFloatWon(won) ? won : CASH_FLOAT_DEFAULT
}

/** 시재 금액만 내 병원 줄 하나에 덮어쓴다. 금액이 맞는지는 화면(parseFloatSetting)과 DB check가 본다 */
export async function saveCashFloatSetting(client: Client, won: number): Promise<void> {
  failIfOffline()
  await send(() => client.from(TABLE).upsert({ [FLOAT_COLUMN]: won }, { onConflict: 'hospital_id' }))
}
