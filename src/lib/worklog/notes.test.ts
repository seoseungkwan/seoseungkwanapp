import { describe, expect, it } from 'vitest'
import { notePrivacyProblem } from './notes'

// 비고 개인정보 모양 검사 (REQ-002). 모두 지어낸 번호다
describe('notePrivacyProblem', () => {
  it.each(['010-0000-1234', '010.0000.1234', '010 0000 1234', '02-000-1234', '01000001234'])(
    'AC-002.10: 전화번호 모양 %s는 문제다',
    (text) => {
      expect(notePrivacyProblem(text)).toBe(true)
    },
  )

  it('AC-002.10: 붙임표 있는 주민번호 모양은 문제다', () => {
    expect(notePrivacyProblem('900101-1234567')).toBe(true)
  })

  it('AC-002.10: 붙여 쓴 13자리 주민번호 모양은 문제다', () => {
    expect(notePrivacyProblem('9001011234567')).toBe(true)
  })

  it('AC-002.10: 메일 모양은 문제다', () => {
    expect(notePrivacyProblem('a@b.co')).toBe(true)
  })

  it('AC-002.10: 다른 글자 사이에 섞여 있어도 문제다', () => {
    expect(notePrivacyProblem('가상 환자 010-0000-1234 환불')).toBe(true)
    expect(notePrivacyProblem('환불 900101-1234567 처리')).toBe(true)
    expect(notePrivacyProblem('문의 a@b.co 로 답장')).toBe(true)
  })

  it.each(['1234567', '12,000', '택배비', '', '12,000원 택배비', '2026-10-28 환불'])(
    'AC-002.10: 보통 글자 "%s"는 문제가 아니다',
    (text) => {
      expect(notePrivacyProblem(text)).toBe(false)
    },
  )

  it('AC-002.10: 금액이 받는 가장 긴 12자리 숫자는 문제가 아니다', () => {
    expect(notePrivacyProblem('999999999999')).toBe(false)
  })

  it('AC-002.10: 월·일 모양이 아닌 13자리 숫자는 문제가 아니다', () => {
    expect(notePrivacyProblem('1234567890123')).toBe(false)
  })

  // 앞뒤 숫자 경계: lib/payload/validate.ts와 같은 정규식의 실제 동작을 못 박는다
  it.each([
    ['90010112345678', '붙여 쓴 주민번호 뒤에 숫자'],
    ['19001011234567', '붙여 쓴 주민번호 앞에 숫자'],
    ['900101-12345678', '붙임표 주민번호 뒤에 숫자'],
    ['1900101-1234567', '붙임표 주민번호 앞에 숫자'],
    ['010000012345', '붙여 쓴 전화번호 뒤에 숫자'],
    ['101000001234', '붙여 쓴 전화번호 앞에 숫자'],
    ['010-0000-12345', '나눈 전화번호 뒤에 숫자'],
    ['0101-0000-1234', '나눈 전화번호 앞자리가 네 자리'],
  ])('AC-002.10: 앞뒤에 숫자가 더 붙은 %s는 문제가 아니다(%s)', (text) => {
    expect(notePrivacyProblem(text)).toBe(false)
  })

  it.each(['9001010234567', '9001019234567'])('AC-002.10: 일곱째 자리가 1~8이 아닌 13자리 %s는 문제가 아니다', (text) => {
    expect(notePrivacyProblem(text)).toBe(false)
  })

  it.each(['9001011234567원', '가상9001011234567가상', '가상01000001234가상'])(
    'AC-002.10: 앞뒤에 숫자가 아닌 글자가 붙은 %s는 그대로 문제다',
    (text) => {
      expect(notePrivacyProblem(text)).toBe(true)
    },
  )
})
