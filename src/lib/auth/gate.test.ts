import { describe, expect, it } from 'vitest'
import { decideRoute, isPublicPath, type GateInput, type HospitalState } from './gate'

const ALL_STATES: HospitalState[] = ['none', 'pending', 'approved', 'rejected', 'unknown', 'desk']

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

// desk-feedback REQ-6305: 데스크(내 병원 줄 없음 + 데스크 줄)는 가입·대기·관리자 화면 대신 수납일지로. 앱 경로는 연다 —
// '/dashboard'도 연다: (app) 레이아웃이 경로와 상관없이 '/dashboard'로 판정하므로 여기서 돌리면 모든 화면이 수납일지로 간다(화면 쪽 DeskGate가 바꾼다)
describe("decideRoute() — 데스크 'desk' (desk-feedback AC-6305.2)", () => {
  it.each(['/login', '/signup', '/pending', '/admin', '/admin/x'])('AC-6305.2: %s는 /sunap으로 보낸다(관리자 값과 상관없이)', (path) => {
    expect(decideRoute(signedIn(path, 'desk'))).toBe('/sunap')
    expect(decideRoute(signedIn(path, 'desk', true))).toBe('/sunap')
  })

  it.each(['/dashboard', '/sunap', '/worklog', '/calendar', '/calendar/x', '/stats', '/claim/setup', '/settings', '/administrator'])(
    'AC-6305.2: %s는 그대로 연다(null — 막힌 화면·첫 화면 바꾸기는 DeskGate 몫)',
    (path) => {
      expect(decideRoute(signedIn(path, 'desk'))).toBeNull()
      expect(decideRoute(signedIn(path, 'desk', true))).toBeNull()
    },
  )

  it('AC-6305.2: 로그인 안 했으면 데스크 상태여도 지금과 같다(/login), 랜딩·콜백은 연다', () => {
    expect(decideRoute({ path: '/sunap', signedIn: false, hospital: 'desk', isAdmin: false })).toBe('/login')
    expect(decideRoute({ path: '/login', signedIn: false, hospital: 'desk', isAdmin: false })).toBeNull()
    expect(decideRoute(signedIn('/', 'desk'))).toBeNull()
    expect(decideRoute(signedIn('/auth/callback', 'desk'))).toBeNull()
  })

  it('AC-6305.2: 데스크가 보내지는 곳은 같은 origin의 고정 경로 /sunap 하나뿐이다(받은 경로로 만들지 않는다)', () => {
    for (const path of ['/login', '/signup', '/pending', '/admin', '/admin//evil.example', '//evil.example', 'https://evil.example/']) {
      const to = decideRoute(signedIn(path, 'desk'))
      expect([null, '/sunap'], path).toContain(to)
    }
  })
})
