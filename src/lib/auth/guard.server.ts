import 'server-only'
import { redirect } from 'next/navigation'
import { decideRoute } from './gate'
import { NotSignedInError, readMe, type Me } from './hospital.server'

// 화면을 그리기 전 병원 상태 확인((app) 레이아웃·/signup·/pending이 같이 쓴다). 어디로 보낼지는 gate 한 곳이 정한다.
// 맞지 않는 상태면 redirect()로 그리기를 멈추고, 맞으면 Me를 돌려준다. 보내는 곳은 gate가 고른 고정 경로뿐이다(받은 경로로 만들지 않는다)
export async function guardPage(path: string): Promise<Me> {
  let me: Me
  try {
    me = await readMe()
  } catch (error) {
    // 로그인이 풀렸을 때만 /login. 그 밖(내 병원·관리자 줄을 읽지 못함, 빌드 때 cookies()가 던지는 Next 신호 등)은 그대로 던진다 —
    // 로그인한 채로 /login에 가면 middleware가 /dashboard로 되돌려 끝없이 돈다. 읽기 실패는 오류 화면(app/error.tsx)이 안내한다 (AC-002.8)
    if (error instanceof NotSignedInError) redirect('/login')
    throw error
  }
  // 상태 = 내 병원 줄 상태(원장 판정이 먼저) → 없으면 데스크 줄이 있을 때 'desk'(desk-feedback) → 아니면 'none'
  const hospital = me.hospital?.status ?? (me.desk ? 'desk' : 'none')
  // redirect()는 던져서 멈춘다 → try 밖에서 부른다
  const to = decideRoute({ path, signedIn: true, hospital, isAdmin: me.isAdmin })
  if (to !== null) redirect(to)
  return me
}
