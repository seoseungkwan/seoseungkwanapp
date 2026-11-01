import { describe, expect, it } from 'vitest'
import {
  ACTIVE_COOKIE,
  ACTIVE_MAX_AGE_SEC,
  ACTIVE_WRITE_EVERY_MS,
  activeCookieOptions,
  activeCookieString,
  cookieNames,
  expireCookieString,
  isSessionCookie,
  shouldWrite,
} from './activity'

describe('움직임 쿠키 값', () => {
  it('AC-401.1: 이름 app-active, 31분(30분 자동 로그아웃 + 쓰기 간격 60초)', () => {
    expect(ACTIVE_COOKIE).toBe('app-active')
    expect(ACTIVE_MAX_AGE_SEC).toBe(1860)
    expect(ACTIVE_WRITE_EVERY_MS).toBe(60_000)
    expect(ACTIVE_MAX_AGE_SEC * 1000).toBe(30 * 60 * 1000 + ACTIVE_WRITE_EVERY_MS)
  })

  it('AC-401.1·AC-405.1: 서버 응답용 옵션 — Path /·SameSite Lax·httpOnly 아님·Max-Age 1860, Secure는 받은 대로', () => {
    expect(activeCookieOptions(false)).toEqual({ path: '/', sameSite: 'lax', httpOnly: false, maxAge: 1860, secure: false })
    expect(activeCookieOptions(true)).toEqual({ path: '/', sameSite: 'lax', httpOnly: false, maxAge: 1860, secure: true })
  })

  it('AC-401.8·AC-405.2: document.cookie용 글자 — http면 Secure 없음, https면 끝에 Secure', () => {
    expect(activeCookieString(false)).toBe('app-active=1; Max-Age=1860; Path=/; SameSite=Lax')
    expect(activeCookieString(true)).toBe('app-active=1; Max-Age=1860; Path=/; SameSite=Lax; Secure')
  })
})

describe('쿠키 지우기 글자', () => {
  it('AC-403.1·AC-405.2: 값 비우고 Max-Age 0 — https면 Secure', () => {
    expect(expireCookieString('sb-abcd-auth-token', false)).toBe('sb-abcd-auth-token=; Max-Age=0; Path=/; SameSite=Lax')
    expect(expireCookieString('app-active', true)).toBe('app-active=; Max-Age=0; Path=/; SameSite=Lax; Secure')
  })
})

describe('isSessionCookie()', () => {
  it.each(['sb-abcd-auth-token', 'sb-abcd-auth-token.0', 'sb-abcd-auth-token.1', 'sb-abcdefghij0123456789-auth-token.12'])(
    'AC-401.2: %s는 세션 쿠키다',
    (name) => {
      expect(isSessionCookie(name)).toBe(true)
    },
  )

  it.each([
    'sb-abcd-auth-token-code-verifier', // 코드 검증값은 세션 쿠키가 아니다(콜백 코드 교환에 쓴다)
    'app-active',
    'sb-abcd-auth-tokenx',
    'sb-abcd-auth-token.',
    'sb--auth-token',
    'xsb-abcd-auth-token',
    'sb-ABCD-auth-token',
    '',
  ])('AC-401.2: %j는 세션 쿠키가 아니다', (name) => {
    expect(isSessionCookie(name)).toBe(false)
  })
})

describe('cookieNames()', () => {
  it('AC-403.1: document.cookie 글자에서 이름만 순서대로', () => {
    expect(cookieNames('sb-abcd-auth-token.0=base64-xx; app-active=1; theme=dark')).toEqual([
      'sb-abcd-auth-token.0',
      'app-active',
      'theme',
    ])
  })

  it('AC-403.1: 빈 글자·공백·= 없는 조각·값 안의 =도 다룬다', () => {
    expect(cookieNames('')).toEqual([])
    expect(cookieNames('   ')).toEqual([])
    expect(cookieNames('a=1;b=2')).toEqual(['a', 'b'])
    expect(cookieNames(' a = 1 ;  ; flag ; c=x=y')).toEqual(['a', 'flag', 'c'])
  })
})

describe('shouldWrite()', () => {
  it('AC-401.8: 아직 안 썼으면 쓴다', () => {
    expect(shouldWrite(null, 1_000)).toBe(true)
  })

  it('AC-401.8: 마지막으로 쓴 지 60초가 안 됐으면 쓰지 않고, 60초가 되면 쓴다', () => {
    expect(shouldWrite(1_000, 1_000)).toBe(false)
    expect(shouldWrite(1_000, 1_000 + 59_999)).toBe(false)
    expect(shouldWrite(1_000, 1_000 + 60_000)).toBe(true)
  })
})
