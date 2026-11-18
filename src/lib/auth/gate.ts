// 경로 문지기 — middleware(병원 상태 'unknown')와 페이지 guard가 같이 쓴다.
// 돌려주는 값은 같은 origin의 고정 경로뿐이다(열린 리디렉트 금지).

// 'desk' = 내 병원 줄 없음 + 데스크 줄 있음(desk-feedback, ADR-031)
export type HospitalState = 'none' | 'pending' | 'approved' | 'rejected' | 'unknown' | 'desk'

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
    // 데스크: 가입·대기·관리자 화면 대신 수납일지(관리자 값과 상관없이). 앱 경로는 연다 — '/dashboard'도 연다:
    // (app) 레이아웃은 경로와 상관없이 '/dashboard'로 판정하므로 여기서 돌리면 모든 화면이 수납일지로 간다.
    // 첫 화면 바꾸기와 막힌 화면은 화면 쪽 DeskGate가 하고, 자료는 RLS가 막는다
    case 'desk':
      if (path === '/login' || path === '/signup' || path === '/pending' || isAdminPath(path)) return '/sunap'
      return null
  }
}
