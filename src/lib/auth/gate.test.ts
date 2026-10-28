import { describe, expect, it } from 'vitest'
import { decideRoute, isPublicPath, type GateInput, type HospitalState } from './gate'

const ALL_STATES: HospitalState[] = ['none', 'pending', 'approved', 'rejected', 'unknown']

function signedIn(path: string, hospital: HospitalState, isAdmin = false): GateInput {
  return { path, signedIn: true, hospital, isAdmin }
}

describe('isPublicPath()', () => {
  it.each(['/', '/login', '/auth/callback'])('AC-002.1: %s는 공개 경로다', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it.each(['/signup', '/pending', '/dashboard', '/admin', '/login/x', '/auth', '/auth/callbackx', ''])(
    'AC-002.1: %s는 공개 경로가 아니다',
    (path) => {
      expect(isPublicPath(path)).toBe(false)
    },
  )
})

describe('decideRoute() — 로그인 안 함', () => {
  it.each(['/', '/login', '/auth/callback'])('AC-002.1: %s는 그대로 연다', (path) => {
    for (const hospital of ALL_STATES) {
      expect(decideRoute({ path, signedIn: false, hospital, isAdmin: false })).toBeNull()
    }
  })

  it.each(['/signup', '/pending', '/dashboard', '/admin', '/admin/x', '/stats', '/login/x'])(
    'AC-002.1: %s는 /login으로 보낸다',
    (path) => {
      for (const hospital of ALL_STATES) {
        expect(decideRoute({ path, signedIn: false, hospital, isAdmin: true })).toBe('/login')
      }
    },
  )
})

describe('decideRoute() — 병원 줄 없음', () => {
  it.each(['/login', '/pending', '/dashboard', '/admin', '/stats'])(
    'AC-002.2: %s는 /signup으로 보낸다',
    (path) => {
      expect(decideRoute(signedIn(path, 'none'))).toBe('/signup')
      expect(decideRoute(signedIn(path, 'none', true))).toBe('/signup')
    },
  )

  it('AC-002.2: /signup은 그대로 연다', () => {
    expect(decideRoute(signedIn('/signup', 'none'))).toBeNull()
  })
})

describe('decideRoute() — 승인 대기·거절', () => {
  it.each(['pending', 'rejected'] as const)('AC-002.3: %s면 /pending 밖은 /pending으로 보낸다', (hospital) => {
    for (const path of ['/login', '/signup', '/dashboard', '/admin', '/stats']) {
      expect(decideRoute(signedIn(path, hospital))).toBe('/pending')
      expect(decideRoute(signedIn(path, hospital, true))).toBe('/pending')
    }
  })

  it.each(['pending', 'rejected'] as const)('AC-002.3: %s면 /pending은 그대로 연다', (hospital) => {
    expect(decideRoute(signedIn('/pending', hospital))).toBeNull()
  })
})

describe('decideRoute() — 승인됨', () => {
  it.each(['/login', '/signup', '/pending'])('AC-002.4: %s는 /dashboard로 보낸다', (path) => {
    expect(decideRoute(signedIn(path, 'approved'))).toBe('/dashboard')
    expect(decideRoute(signedIn(path, 'approved', true))).toBe('/dashboard')
  })

  it('AC-002.4: /dashboard는 그대로 연다', () => {
    expect(decideRoute(signedIn('/dashboard', 'approved'))).toBeNull()
  })

  it.each(['/admin', '/admin/x'])('AC-002.5: 관리자는 %s를 연다', (path) => {
    expect(decideRoute(signedIn(path, 'approved', true))).toBeNull()
  })

  it.each(['/admin', '/admin/x'])('AC-002.5: 관리자가 아니면 %s에서 /dashboard로 보낸다', (path) => {
    expect(decideRoute(signedIn(path, 'approved', false))).toBe('/dashboard')
  })

  it('AC-002.5: /administrator 같은 이름은 관리자 경로로 보지 않는다', () => {
    expect(decideRoute(signedIn('/administrator', 'approved', false))).toBeNull()
  })
})

describe('decideRoute() — 랜딩·콜백', () => {
  it('AC-002.6: /는 로그인 여부·병원 상태·관리자 여부와 상관없이 그대로 연다', () => {
    for (const s of [true, false]) {
      for (const hospital of ALL_STATES) {
        for (const isAdmin of [true, false]) {
          expect(decideRoute({ path: '/', signedIn: s, hospital, isAdmin })).toBeNull()
        }
      }
    }
  })

  // 콜백은 코드 교환을 스스로 처리하고 /dashboard로 보낸다
  it('AC-002.1: 로그인했어도 /auth/callback은 병원 상태와 상관없이 그대로 연다', () => {
    for (const hospital of ALL_STATES) {
      expect(decideRoute(signedIn('/auth/callback', hospital))).toBeNull()
    }
  })
})

// middleware는 DB를 읽지 않으므로 병원 상태를 'unknown'으로 넘긴다
describe("decideRoute() — 병원 상태 'unknown'(middleware)", () => {
  it('AC-002.4: 로그인한 사람이 /login을 열면 /dashboard로 보낸다', () => {
    expect(decideRoute(signedIn('/login', 'unknown'))).toBe('/dashboard')
  })

  it.each(['/signup', '/pending', '/dashboard', '/admin', '/stats'])(
    'AC-002.1: 로그인한 사람의 %s는 페이지 guard에 맡긴다(null)',
    (path) => {
      expect(decideRoute(signedIn(path, 'unknown'))).toBeNull()
    },
  )
})
