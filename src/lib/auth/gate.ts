// 경로 문지기 — middleware(병원 상태 'unknown')와 페이지 guard가 같이 쓴다.
// 돌려주는 값은 같은 origin의 고정 경로뿐이다(열린 리디렉트 금지).

export type HospitalState = 'none' | 'pending' | 'approved' | 'rejected' | 'unknown'

export type GateInput = { path: string; signedIn: boolean; hospital: HospitalState; isAdmin: boolean }

const PUBLIC_PATHS = new Set(['/', '/login', '/auth/callback'])

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path)
}

function isAdminPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}

/** null = 그대로 연다, 문자열 = 보낼 경로. 정해 둔 경로 밖은 막는 쪽으로 정한다. */
export function decideRoute({ path, signedIn, hospital, isAdmin }: GateInput): string | null {
  // 랜딩과 콜백은 누구에게나 연다. 콜백은 코드 교환 뒤 스스로 /dashboard로 보낸다
  if (path === '/' || path === '/auth/callback') return null
  if (!signedIn) return isPublicPath(path) ? null : '/login'

  switch (hospital) {
    // middleware는 DB를 읽지 않는다. 병원 상태는 페이지 guard가 정한다
    case 'unknown':
      return path === '/login' ? '/dashboard' : null
    case 'none':
      return path === '/signup' ? null : '/signup'
    case 'pending':
    case 'rejected':
      return path === '/pending' ? null : '/pending'
    case 'approved':
      if (path === '/login' || path === '/signup' || path === '/pending') return '/dashboard'
      if (isAdminPath(path) && !isAdmin) return '/dashboard'
      return null
  }
}
