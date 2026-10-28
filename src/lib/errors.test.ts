import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ErrorCode } from '@/types/errors'
import { ERRORS, errorInfo } from './errors'

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
