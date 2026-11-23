import 'server-only'
import { cookies } from 'next/headers'
import { supabaseServer } from '@/lib/supabase/server'
import { VIEW_COOKIE, viewKeyOf } from '@/lib/supabase/viewKey'

// 앱 틀이 그리기 전(서버) 관리자가 이 브라우저에서 보는 의원 읽기 (admin-view REQ-8004 AC-8004.5, ADR-046).
// 보기 쿠키가 있을 때만 rpc('my_admin_view') 한 번 — 서버 클라이언트가 머리 x-ssk-view를 붙이고 DB가 열쇠를 확인한다.
// 쓰지 않는다(ADR-004 인증 예외를 넓힘, tabAccess.server.ts와 같은 모양)

export type AdminView = { hospitalId: string; name: string }

/** 읽지 못함(함수 없음·권한·장애·모양 틀림) — 던져서 오류 화면(E-PAGE-FAILED). 원래 오류 글은 cause에만 둔다 */
export class AdminViewReadError extends Error {}

const MESSAGE = '보는 의원을 읽지 못했어요'

/** 답 모양: 빈 목록 → null, { hospital_id, name } 한 줄 → AdminView, 그 밖 → undefined(모양 틀림) */
function toAdminView(data: unknown): AdminView | null | undefined {
  if (!Array.isArray(data) || data.length > 1) return undefined
  if (data.length === 0) return null
  const row: unknown = data[0]
  if (typeof row !== 'object' || row === null) return undefined
  const { hospital_id: hospitalId, name } = row as Record<string, unknown>
  if (typeof hospitalId !== 'string' || hospitalId === '' || typeof name !== 'string') return undefined
  return { hospitalId, name }
}

/** 보기 쿠키가 없으면 null(DB 안 부름). 있으면 rpc('my_admin_view') 한 번 → 한 줄 | 빈 목록 → null. 쓰지 않는다 */
export async function readAdminView(): Promise<AdminView | null> {
  let result: { data: unknown; error: unknown }
  try {
    const cookieStore = await cookies()
    if (viewKeyOf(cookieStore.get(VIEW_COOKIE)?.value) === null) return null
    const supabase = await supabaseServer()
    result = await supabase.rpc('my_admin_view')
  } catch (cause) {
    throw new AdminViewReadError(MESSAGE, { cause })
  }
  if (result.error) throw new AdminViewReadError(MESSAGE, { cause: result.error })
  // 모양이 틀리면 '보는 중 아님'(내 의원)으로 넘기지 않는다
  const view = toAdminView(result.data)
  if (view === undefined) throw new AdminViewReadError(MESSAGE)
  return view
}
