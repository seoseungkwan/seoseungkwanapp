import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/supabase/browser'

// 의원 비교 읽기(spec admin-view REQ-8005 AC-8005.2, design.md '브라우저 함수'·'비교 읽기 ⑧ admin_rows', ADR-047).
// 관리자만 부르는 정의자 함수 admin_rows 하나로 읽는다 — 관리자인지·종류·병원 수·기간 한도·승인된 의원·칸(이름·연락처·차트번호 없음)은
// 함수가 정한다(supabase/adminView.rls.test.ts가 증명). Supabase 답은 한 번에 1,000줄까지라 range 쪽으로 짧은 쪽이 올 때까지 다 읽는다
// (함수가 (병원, 날·달·id) 차례로 주어 쪽이 겹치지 않는다). 줄 하나라도 모양이 틀리거나 쪽 하나라도 실패하면 반쪽 목록 대신 AdminRowsError.
// 원래 오류는 cause에만 둔다. 저절로 다시 부르지 않는다. row 안 칸은 부르는 쪽이 지금 lib/storage 줄 검사로 본다

/** design.md '비교 읽기' 표의 종류 열여덟(표 차례) */
export const ADMIN_ROW_KINDS = [
  'stats_days',
  'stats_months',
  'stats_day_totals',
  'stats_coverage',
  'stats_rx_groups',
  'stats_goals',
  'sales_days',
  'sales_code_totals',
  'sales_codes',
  'sunap_settings',
  'sunap_days',
  'calendar_settings',
  'calendar_allday',
  'calendar_counts',
  'clinic_profiles',
  'staff_members',
  'staff_pay',
  'staff_settings',
] as const

export type AdminRowKind = (typeof ADMIN_ROW_KINDS)[number]
export type AdminRow = { hospitalId: string; row: Record<string, unknown> }
export class AdminRowsError extends Error {}

type Client = Pick<SupabaseClient, 'rpc'>
type Deps = { client?: Client }

const FUNCTION = 'admin_rows'
const PAGE_ROWS = 1000
const MESSAGE = '의원 비교 숫자를 읽지 못했어요'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isKind = (value: unknown): value is AdminRowKind => (ADMIN_ROW_KINDS as readonly unknown[]).includes(value)

function toAdminRow(value: unknown): AdminRow {
  if (!isRecord(value)) throw new AdminRowsError(MESSAGE)
  const { hospital_id, row } = value
  if (typeof hospital_id !== 'string' || hospital_id === '' || !isRecord(row)) throw new AdminRowsError(MESSAGE)
  return { hospitalId: hospital_id, row }
}

/** rpc('admin_rows', …).range(i, i + 999)를 짧은 쪽이 올 때까지. from~to는 둘 다 포함, 한도는 함수가 본다 */
export async function readAdminRows(
  kind: AdminRowKind,
  hospitalIds: readonly string[],
  from: string,
  to: string,
  deps?: Deps,
): Promise<AdminRow[]> {
  if (!isKind(kind)) throw new AdminRowsError(MESSAGE)
  const args = { p_kind: kind, p_hospital_ids: [...hospitalIds], p_from: from, p_to: to }
  let client: Client
  try {
    client = deps?.client ?? supabaseBrowser()
  } catch (cause) {
    throw new AdminRowsError(MESSAGE, { cause })
  }
  const all: AdminRow[] = []
  for (;;) {
    let reply: { data: unknown; error: unknown }
    try {
      reply = await client.rpc(FUNCTION, args).range(all.length, all.length + PAGE_ROWS - 1)
    } catch (cause) {
      throw new AdminRowsError(MESSAGE, { cause })
    }
    if (reply.error) throw new AdminRowsError(MESSAGE, { cause: reply.error })
    if (!Array.isArray(reply.data)) throw new AdminRowsError(MESSAGE)
    for (const value of reply.data as unknown[]) all.push(toAdminRow(value))
    if (reply.data.length < PAGE_ROWS) return all
  }
}
