import 'server-only'
import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'

// 입지 분석 서버 경로 공통(specs/location design.md 3절, ADR-042): 관리자 확인과 답 만들기.
// 관리자 = 승인된 병원 + admins 줄 + 데스크 아님. 로그인 안 함 401, 아니면 403 — 둘 다 몸통 없음, 바깥 부르기 전.
// 병원·관리자 줄을 읽지 못하면 500(몸통 없음). 오류 글은 내보내지도 남기지도 않는다. 모든 답은 Cache-Control: no-store

const NO_STORE = { 'Cache-Control': 'no-store' } as const

/** 몸통 없는 답(400·401·403·500) */
export function emptyReply(status: number): Response {
  return new Response(null, { status, headers: NO_STORE })
}

/** JSON 답(200). 몸통이 있는 답은 모두 200이고 성공·실패는 몸통의 ok로 가린다 */
export function jsonReply(body: unknown): Response {
  return Response.json(body, { status: 200, headers: NO_STORE })
}

/** 관리자면 null, 아니면 돌려줄 답 */
export async function guardAdmin(): Promise<Response | null> {
  try {
    const me = await readMe()
    const admin = me.hospital?.status === 'approved' && me.isAdmin && me.desk === undefined
    return admin ? null : emptyReply(403)
  } catch (err) {
    return emptyReply(err instanceof NotSignedInError ? 401 : 500)
  }
}
