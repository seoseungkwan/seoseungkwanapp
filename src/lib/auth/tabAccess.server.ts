import 'server-only'
import { toTabAccessRows, type TabAccessRow } from '@/components/shell/menu'
import { supabaseServer } from '@/lib/supabase/server'

// 앱 틀이 그리기 전(서버) 관리자만 보는 탭 목록 읽기 (multi-admin REQ-7706 AC-7706.2, design.md '탭 목록 함수', ADR-042).
// 공용 표 tab_access의 모든 줄(경로·관리자만 참거짓)을 한 번 읽고 쓰지 않는다(ADR-004 인증 예외를 넓힘, hospital.server.ts와 같은 모양).
// 숨길 탭 계산(adminOnlyTabs)과 관리자에게는 읽지 않기는 레이아웃 몫이다

/** 읽지 못함(표 없음·권한·장애·모양 틀림) — 던져서 오류 화면(E-PAGE-FAILED). 원래 오류 글은 cause에만 둔다 */
export class TabAccessReadError extends Error {}

const MESSAGE = '관리자만 보는 탭 목록을 읽지 못했어요'

/** tab_access 모든 줄. from('tab_access').select('path, admin_only') 한 번, 쓰지 않는다 */
export async function readTabAccessRows(): Promise<TabAccessRow[]> {
  let result: { data: unknown; error: unknown }
  try {
    const supabase = await supabaseServer()
    result = await supabase.from('tab_access').select('path, admin_only')
  } catch (cause) {
    throw new TabAccessReadError(MESSAGE, { cause })
  }
  if (result.error) throw new TabAccessReadError(MESSAGE, { cause: result.error })
  // 모양이 틀리면 '숨김 없음'으로 넘기지 않는다(막는 쪽)
  const rows = toTabAccessRows(result.data)
  if (rows === null) throw new TabAccessReadError(MESSAGE)
  return rows
}
