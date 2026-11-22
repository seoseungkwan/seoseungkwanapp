import { toTabAccessRows, type MenuPath, type TabAccessRow } from '@/components/shell/menu'
import { supabaseBrowser } from '@/lib/supabase/browser'

// 설정 '관리자만 보는 탭' 칸의 읽기·저장 (multi-admin REQ-7707 AC-7707.1, design.md '탭 목록 함수', ADR-042). 브라우저 → Supabase, 서버 코드가 아니다(ADR-004).
// 주 관리자 확인은 admins 내 줄의 is_owner(정책 '내 관리자 줄 읽기' — 관리자가 아니면 줄이 안 보여 거짓),
// 목록은 공용 표 tab_access(로그인한 사람 모두 읽기), 저장은 DB 함수 set_tab_access 하나(주 관리자만, 표 쓰기 권한은 아무에게도 없다).
// 실패는 TabAccessError 하나로 던진다 → 화면은 정해 둔 오류 카드만 보인다(원래 오류 글은 cause에만 둔다). 저절로 다시 부르지 않는다
export class TabAccessError extends Error {}

const READ_FAILED = '관리자만 보는 탭을 읽지 못했어요'
const SAVE_FAILED = '관리자만 보는 탭을 저장하지 못했어요'

type Reply = { data: unknown; error: unknown }
type Client = ReturnType<typeof supabaseBrowser>

// 클라이언트 만들기·부르기가 던지거나 답이 오류이면 TabAccessError(원래 글은 cause에만)
async function send(message: string, request: (client: Client) => PromiseLike<Reply>): Promise<unknown> {
  let reply: Reply
  try {
    reply = await request(supabaseBrowser())
  } catch (cause) {
    throw new TabAccessError(message, { cause })
  }
  if (reply.error) throw new TabAccessError(message, { cause: reply.error })
  return reply.data
}

/** 내가 주 관리자인가: from('admins').select('is_owner').maybeSingle() 한 번(RLS가 내 줄만 준다). 줄 없음·거짓 → false */
export async function readTabOwner(): Promise<boolean> {
  const data = await send(READ_FAILED, (client) => client.from('admins').select('is_owner').maybeSingle())
  if (data === null) return false
  const owner = typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).is_owner : undefined
  if (typeof owner !== 'boolean') throw new TabAccessError(READ_FAILED)
  return owner
}

/** from('tab_access').select('path, admin_only') 한 번 → toTabAccessRows. 모양이 틀리면 빈 목록으로 보이지 않고 TabAccessError */
export async function readTabAccess(): Promise<TabAccessRow[]> {
  const data = await send(READ_FAILED, (client) => client.from('tab_access').select('path, admin_only'))
  const rows = toTabAccessRows(data)
  if (rows === null) throw new TabAccessError(READ_FAILED)
  return rows
}

/** rpc('set_tab_access', { p_admin_only, p_everyone }) 한 번, 저절로 다시 부르지 않는다 */
export async function saveTabAccess(adminOnly: readonly MenuPath[], everyone: readonly MenuPath[]): Promise<void> {
  await send(SAVE_FAILED, (client) => client.rpc('set_tab_access', { p_admin_only: [...adminOnly], p_everyone: [...everyone] }))
}
