import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ErrorCode } from '@/types/errors'
import { ERRORS, errorInfo, isErrorCode } from './errors'

// ErrorCode에 번호를 더하거나 빼면 이 목록도 같이 고쳐야 타입 검사가 통과한다
const ALL_CODES = [
  'E-PARSE-COLUMN',
  'E-PARSE-ROW',
  'E-PARSE-EMPTY',
  'E-PARSE-TOO-BIG',
  'E-PARSE-RRN',
  'E-PARSE-UNREADABLE',
  'E-ANALYZE-TIMEOUT',
  'E-ANALYZE-FAILED',
  'E-AUTH-CALLBACK',
  'E-AUTH-START',
  'E-SIGNUP-FAILED',
  'E-ADMIN-FAILED',
  'E-PAGE-FAILED',
  'E-EXT-MISSING',
  'E-HELPER-MISSING',
  'E-HELPER-OLD',
  'E-EXT-OLD',
  'E-BRIDGE-BUSY',
  'E-BRIDGE-DISCONNECTED',
  'E-BRIDGE-REJECTED',
  'E-BRIDGE-BAD-REPLY',
  'E-HELPER-BAD-MESSAGE',
  'E-HELPER-UNKNOWN-COMMAND',
  'E-BIT-NOT-FOUND',
  'E-BIT-DB-FAILED',
  'E-BIT-READ-FAILED',
  'E-BIT-NOT-REGISTERED',
  'E-BIT-HOSPITAL-MISMATCH',
  'E-STORE-FAILED',
  'E-STORE-BROKEN',
] as const satisfies readonly ErrorCode[]

// 청구 사전점검 연결 번호(design.md 4-5 중 확장·도우미·통로 것). 비트 접속 번호는 TASK-6이 더한다
const BRIDGE_CODES = [
  'E-EXT-MISSING',
  'E-HELPER-MISSING',
  'E-HELPER-OLD',
  'E-EXT-OLD',
  'E-BRIDGE-BUSY',
  'E-BRIDGE-DISCONNECTED',
  'E-BRIDGE-REJECTED',
  'E-BRIDGE-BAD-REPLY',
  'E-HELPER-BAD-MESSAGE',
  'E-HELPER-UNKNOWN-COMMAND',
] as const satisfies readonly ErrorCode[]

const AUTH_CODES = [
  'E-AUTH-CALLBACK',
  'E-AUTH-START',
  'E-SIGNUP-FAILED',
  'E-ADMIN-FAILED',
  'E-PAGE-FAILED',
] as const satisfies readonly ErrorCode[]

describe('AC-003.4 ERRORS', () => {
  it('ErrorCode의 모든 번호가 빠짐없이, 그 밖의 번호 없이 있다', () => {
    expectTypeOf<(typeof ALL_CODES)[number]>().toEqualTypeOf<ErrorCode>()
    expect(Object.keys(ERRORS).sort()).toEqual([...ALL_CODES].sort())
  })

  it.each(ALL_CODES)('%s: 무엇이·어떻게 고치나가 비어 있지 않다', (code) => {
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('E-PARSE-UNREADABLE은 세 가지 확인 사항을 안내한다', () => {
    expect(errorInfo('E-PARSE-UNREADABLE').fix).toBe(
      '① 환자별 소모 통계가 맞나요 ② 보안 프로그램·암호로 잠긴 파일인가요 ③ CSV로 다시 뽑아 보세요',
    )
  })

  it('E-ANALYZE-TIMEOUT은 다시 시도·기간 줄이기를 안내한다', () => {
    expect(errorInfo('E-ANALYZE-TIMEOUT').fix).toBe('다시 시도하거나 기간을 줄여 보세요')
  })
})

describe('AC-012.1 인증 오류 문구', () => {
  it.each(AUTH_CODES)('AC-012.1: %s는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('AC-012.1: E-AUTH-CALLBACK은 목업 로그인 실패 카드 문구 그대로다', () => {
    expect(errorInfo('E-AUTH-CALLBACK')).toEqual({
      what: '구글 로그인을 마치지 못했어요',
      fix: '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요.',
    })
  })

  it('AC-012.1: E-AUTH-START는 E-AUTH-CALLBACK과 같은 카드 문구다(번호만 다르다)', () => {
    expect(errorInfo('E-AUTH-START')).toEqual(errorInfo('E-AUTH-CALLBACK'))
  })

  it('AC-012.1: E-SIGNUP-FAILED는 가입 신청을 보내지 못했다고 알리고 다시 누르라고 한다', () => {
    const info = errorInfo('E-SIGNUP-FAILED')
    expect(info.what).toBe('가입 신청을 보내지 못했어요')
    expect(info.fix).toContain('다시 눌러 주세요')
  })

  it('AC-012.1: E-ADMIN-FAILED는 신청 상태를 바꾸지 못했다고 알린다', () => {
    const info = errorInfo('E-ADMIN-FAILED')
    expect(info.what).toBe('신청 상태를 바꾸지 못했어요')
    expect(info.fix).toContain('다시 눌러 주세요')
  })

  it('AC-012.1: E-PAGE-FAILED는 화면을 열지 못했다고 알리고 [다시 시도]를 안내한다', () => {
    const info = errorInfo('E-PAGE-FAILED')
    expect(info.what).toBe('화면을 열지 못했어요')
    expect(info.fix).toContain('[다시 시도]')
  })

  it.each(AUTH_CODES)('AC-012.1: %s 문구는 오류 번호와 함께 문의하라고 한다', (code) => {
    expect(errorInfo(code).fix).toContain('오류 번호와 함께 문의해 주세요')
  })
})

describe('AC-004.3·AC-004.6·AC-004.7·AC-004.9 연결 오류 번호 문구', () => {
  it.each(BRIDGE_CODES)('%s: lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it.each(BRIDGE_CODES)('%s: 번호는 도우미·확장과 같은 E-… 모양이다', (code) => {
    expect(code).toMatch(/^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
  })

  it('E-EXT-MISSING은 확장 설치를, E-HELPER-MISSING은 도우미 설치를 안내한다', () => {
    expect(errorInfo('E-EXT-MISSING').fix).toContain('확장')
    expect(errorInfo('E-EXT-MISSING').fix).toContain('설치')
    expect(errorInfo('E-HELPER-MISSING').fix).toContain('도우미')
    expect(errorInfo('E-HELPER-MISSING').fix).toContain('설치')
  })

  it('E-HELPER-OLD·E-EXT-OLD는 무엇을 업데이트할지 말한다', () => {
    expect(errorInfo('E-HELPER-OLD').fix).toContain('도우미')
    expect(errorInfo('E-EXT-OLD').fix).toContain('확장')
  })

  it('E-BRIDGE-BUSY는 다른 창에서 쓰고 있다고 알린다', () => {
    expect(errorInfo('E-BRIDGE-BUSY').what).toContain('다른 창')
  })
})

// 설치·연결 확인 화면(TASK-6)이 더한 번호: bit.check 단계(find·db·registration)와 등록 단계가 줄 수 있는 것
const BIT_CODES = [
  'E-BIT-NOT-FOUND',
  'E-BIT-DB-FAILED',
  'E-BIT-READ-FAILED',
  'E-BIT-NOT-REGISTERED',
  'E-BIT-HOSPITAL-MISMATCH',
  'E-STORE-FAILED',
  'E-STORE-BROKEN',
] as const satisfies readonly ErrorCode[]

describe('AC-006.6 비트 접속·등록 오류 번호 문구', () => {
  it.each(BIT_CODES)('AC-006.6: %s는 lib/errors.ts에 무엇이·어떻게 고치나가 있다', (code) => {
    expect(Object.keys(ERRORS)).toContain(code)
    const info = errorInfo(code)
    expect(info.what.trim()).not.toBe('')
    expect(info.fix.trim()).not.toBe('')
  })

  it('AC-006.6: 등록이 없거나(E-BIT-NOT-REGISTERED) 등록 파일이 깨지면(E-STORE-BROKEN) [처음 등록]을, 병원이 다르면 [다시 등록]을 안내한다', () => {
    expect(errorInfo('E-BIT-NOT-REGISTERED').fix).toContain('[처음 등록]')
    expect(errorInfo('E-STORE-BROKEN').fix).toContain('[처음 등록]')
    expect(errorInfo('E-BIT-HOSPITAL-MISMATCH').fix).toContain('[다시 등록]')
  })

  it('AC-006.1·AC-006.6: 상태 안내는 목업 승인본 문구다 — 확장 없음·도우미 없음·도우미 업데이트·확장 업데이트·다른 창', () => {
    expect(errorInfo('E-EXT-MISSING')).toEqual({
      what: '크롬 확장 프로그램이 없어요',
      fix: '아래 1번에서 확장을 설치한 뒤 [다시 확인]을 누르세요.',
    })
    expect(errorInfo('E-HELPER-MISSING')).toEqual({
      what: '도우미가 없어요',
      fix: '아래 2번에서 도우미를 내려받아 설치한 뒤 [다시 확인]을 누르세요.',
    })
    expect(errorInfo('E-HELPER-OLD')).toEqual({
      what: '도우미를 업데이트하세요',
      fix: '이 PC의 도우미가 예전 버전이라 청구 화면을 쓸 수 없어요. 고치던 메모는 이 PC에 그대로 있어요.',
    })
    expect(errorInfo('E-EXT-OLD').what).toBe('확장을 업데이트하세요')
    expect(errorInfo('E-BRIDGE-BUSY')).toEqual({
      what: '청구 화면이 다른 창에서 열려 있어요',
      fix: '같은 환자를 두 번 넣지 않도록 청구 화면은 한 창에서만 열 수 있어요. 열려 있는 다른 창이나 탭으로 가서 계속하세요.',
    })
  })

  it('AC-006.6: 화면에 없는 [연결 확인] 단추를 가리키지 않는다(설치 화면 단추는 [다시 확인]·[연결 다시 확인])', () => {
    for (const code of ALL_CODES) expect(errorInfo(code).fix, code).not.toContain('[연결 확인]')
  })

  it('AC-006.6: isErrorCode는 lib/errors.ts에 문구가 있는 번호만 참이다(도우미가 준 모르는 번호는 거짓)', () => {
    for (const code of ALL_CODES) expect(isErrorCode(code), code).toBe(true)
    expect(isErrorCode('E-SOMETHING-NEW')).toBe(false)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode('__proto__')).toBe(false)
  })
})
