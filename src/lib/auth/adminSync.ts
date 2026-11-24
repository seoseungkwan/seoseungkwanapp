import { isYmd } from '@/lib/analytics/dates'
import { isFillMonths, type UploadRow } from '@/lib/autoUpload/range'
import { supabaseBrowser } from '@/lib/supabase/browser'

// 저절로 올리기 — 관리자 쪽 브라우저 → DB(spec admin-view REQ-8020 AC-8020.3, design.md '저절로 올리기 — 셈 · 글 · 브라우저 함수', ADR-048).
// 본보기 lib/auth/admin.ts·adminView.ts. 서버 코드가 아니다(ADR-004). 셋 모두 정의자 함수 하나를 한 번만 부르고 표는 쓰지 않는다 —
// 함수가 부른 사람이 관리자인지·승인된 병원인지·아홉 값인지 본다(supabase/adminSync.rls.test.ts가 증명). 답은 믿지 않는다:
// 줄 하나라도 모양이 틀리면 반쪽 목록 대신 막는다. 실패는 AdminSyncError 하나로 던진다 → 화면은 정해 둔 오류 번호 글만 보인다
// (채울 기간 바꾸기 = E-AUTO-MONTHS, 목록·가장 이른 달 읽기 = 그 화면의 E-PAGE-FAILED). 원래 오류는 cause에만 둔다. 저절로 다시 부르지 않는다
export class AdminSyncError extends Error {}

export type { UploadRow }

type Reply = { data: unknown; error: unknown }
type ReadRow = Record<string, unknown>

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDayOrNull = (value: unknown): value is string | null => value === null || (typeof value === 'string' && isYmd(value))
const isFirstOrNull = (value: unknown): value is string | null => value === null || (isDayOrNull(value) && value.endsWith('-01'))
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string'

/** 클라이언트 만들기·보내기·오류 답을 한 곳에서 AdminSyncError로 바꾼다(원래 오류는 cause에만) */
async function call(message: string, send: (client: ReturnType<typeof supabaseBrowser>) => PromiseLike<Reply>): Promise<unknown> {
  let reply: Reply
  try {
    reply = await send(supabaseBrowser())
  } catch (cause) {
    throw new AdminSyncError(message, { cause })
  }
  if (reply.error) throw new AdminSyncError(message, { cause: reply.error })
  return reply.data
}

function toUploadRow(row: ReadRow): [string, UploadRow] | null {
  const { hospital_id, months, through_day, filled_from, last_ok_at, error_code, error_at } = row
  if (typeof hospital_id !== 'string' || hospital_id === '' || !isFillMonths(months)) return null
  if (!isDayOrNull(through_day) || !isFirstOrNull(filled_from)) return null
  if (!isTextOrNull(last_ok_at) || !isTextOrNull(error_code) || !isTextOrNull(error_at)) return null
  return [hospital_id, { months, throughDay: through_day, filledFrom: filled_from, lastOkAt: last_ok_at, errorCode: error_code, errorAt: error_at }]
}

/** 가입 승인 '승인' 표의 채울 기간·저절로 올림 칸. rpc('admin_auto_upload_list') 한 번 → 승인된 병원 id마다 한 줄 */
export async function listUploadStatus(): Promise<Map<string, UploadRow>> {
  const message = '저절로 올림 상태를 읽지 못했어요'
  const data = await call(message, (client) => client.rpc('admin_auto_upload_list'))
  if (!Array.isArray(data)) throw new AdminSyncError(message)
  const map = new Map<string, UploadRow>()
  for (const value of data as unknown[]) {
    const entry = isRecord(value) ? toUploadRow(value) : null
    if (entry === null || map.has(entry[0])) throw new AdminSyncError(message)
    map.set(entry[0], entry[1])
  }
  return map
}

/** 채울 기간 바꾸기. rpc('set_auto_upload_months') 한 번, 허용한 값·병원인지는 함수가 본다(줄여도 저장된 숫자는 지우지 않음) */
export async function setUploadMonths(hospitalId: string, months: number): Promise<void> {
  await call('채울 기간을 바꾸지 못했어요', (client) => client.rpc('set_auto_upload_months', { p_hospital_id: hospitalId, p_months: months }))
}

/** 의원 비교 달 고르기의 가장 이른 달. rpc('admin_compare_first_month') 한 번 → 'YYYY-MM', 저장된 줄이 없으면 null */
export async function readCompareFirstMonth(): Promise<string | null> {
  const message = '의원 비교 달을 읽지 못했어요'
  const data = await call(message, (client) => client.rpc('admin_compare_first_month'))
  if (!isFirstOrNull(data)) throw new AdminSyncError(message)
  return data === null ? null : data.slice(0, 7)
}
