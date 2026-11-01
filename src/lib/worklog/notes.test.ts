import { describe, expect, it } from 'vitest'
import { WORKLOG_CELL_KEYS, type WorklogCellKey, type WorklogChanges } from '@/types/worklog'
import { blockedCellKeys, privacyProblem } from './notes'

// 칸 글자 개인정보 모양 검사 (REQ-002). 모두 지어낸 번호다
describe('privacyProblem', () => {
  it.each([
    '010-0000-1234',
    '010.0000.1234',
    '010 0000 1234',
    '02-000-1234',
    '01000001234',
    '010-00001234',
    '0200001234',
    '020001234',
    '(02)000-1234',
    '(010)0000-1234',
    '+82 10-0000-1234',
    '+82-10-0000-1234',
    '+821000001234',
  ])('AC-002.10: 전화번호 모양 %s는 문제다', (text) => {
    expect(privacyProblem(text)).toBe(true)
  })

  it.each(['900101-1234567', '900101 1234567', '900101.1234567'])(
    'AC-002.10: 나누어 쓴 주민번호 모양 %s는 문제다',
    (text) => {
      expect(privacyProblem(text)).toBe(true)
    },
  )

  it('AC-002.10: 붙여 쓴 13자리 주민번호 모양은 문제다', () => {
    expect(privacyProblem('9001011234567')).toBe(true)
  })

  it('AC-002.10: 메일 모양은 문제다', () => {
    expect(privacyProblem('a@b.co')).toBe(true)
  })

  it('AC-002.10: 다른 글자 사이에 섞여 있어도 문제다', () => {
    expect(privacyProblem('가상 환자 010-0000-1234 환불')).toBe(true)
    expect(privacyProblem('가상 환자 (02)000-1234 환불')).toBe(true)
    expect(privacyProblem('환불 900101-1234567 처리')).toBe(true)
    expect(privacyProblem('환불 900101 1234567 처리')).toBe(true)
    expect(privacyProblem('문의 a@b.co 로 답장')).toBe(true)
  })

  it.each([
    '1234567',
    '12,000',
    '2건 12,000',
    '00012',
    '12,000 별도',
    '택배비',
    '',
    '12,000원 택배비',
    '2026-10-28 환불',
    '1,234,500원',
    '100,000',
    '1,000,000',
    '-12,000원',
    '10/28',
  ])('AC-002.10: 보통 글자 "%s"는 문제가 아니다', (text) => {
    expect(privacyProblem(text)).toBe(false)
  })

  it('AC-002.10: 금액이 받는 가장 긴 12자리 숫자는 문제가 아니다', () => {
    expect(privacyProblem('999999999999')).toBe(false)
  })

  it('AC-002.10: 월·일 모양이 아닌 13자리 숫자는 문제가 아니다', () => {
    expect(privacyProblem('1234567890123')).toBe(false)
  })

  it('AC-002.10: 0으로 시작해도 8자리 이하나 12자리 이상인 숫자는 전화 모양이 아니다', () => {
    expect(privacyProblem('01234567')).toBe(false)
    expect(privacyProblem('012345678901')).toBe(false)
  })

  // 앞뒤 숫자 경계: 넓힌 뒤에도 숫자가 더 붙은 값을 잘못 막지 않는지 못 박는다
  it.each([
    ['90010112345678', '붙여 쓴 주민번호 뒤에 숫자'],
    ['19001011234567', '붙여 쓴 주민번호 앞에 숫자'],
    ['900101-12345678', '붙임표 주민번호 뒤에 숫자'],
    ['1900101-1234567', '붙임표 주민번호 앞에 숫자'],
    ['900101 12345678', '빈칸 주민번호 뒤에 숫자'],
    ['010000012345', '붙여 쓴 전화번호 뒤에 숫자'],
    ['101000001234', '붙여 쓴 전화번호 앞에 숫자'],
    ['010-0000-12345', '나눈 전화번호 뒤에 숫자'],
    ['0101-0000-1234', '나눈 전화번호 앞자리가 네 자리'],
  ])('AC-002.10: 앞뒤에 숫자가 더 붙은 %s는 문제가 아니다(%s)', (text) => {
    expect(privacyProblem(text)).toBe(false)
  })

  it.each(['9001010234567', '9001019234567'])('AC-002.10: 일곱째 자리가 1~8이 아닌 13자리 %s는 문제가 아니다', (text) => {
    expect(privacyProblem(text)).toBe(false)
  })

  it.each(['9001011234567원', '가상9001011234567가상', '가상01000001234가상'])(
    'AC-002.10: 앞뒤에 숫자가 아닌 글자가 붙은 %s는 그대로 문제다',
    (text) => {
      expect(privacyProblem(text)).toBe(true)
    },
  )

  it('AC-002.10: 여러 번 불러도 결과가 같다', () => {
    expect(privacyProblem('010-0000-1234')).toBe(true)
    expect(privacyProblem('010-0000-1234')).toBe(true)
  })
})

describe('blockedCellKeys', () => {
  it.each<[WorklogCellKey, string]>([
    ['newPatients', '신환 숫자 칸'],
    ['cashIn', '금액 숫자 칸'],
    ['noteCash', '비고'],
    ['memo', '업무사항'],
    ['nameCashIn', '항목 이름'],
  ])('AC-002.10: 막는 모양이 %s(%s)에 있으면 그 칸을 돌려준다', (key) => {
    expect(blockedCellKeys({ [key]: '010-0000-1234' })).toEqual([key])
  })

  it('AC-002.10: 32칸 어디에 있어도 그 칸을 돌려준다', () => {
    for (const key of WORKLOG_CELL_KEYS) {
      expect(blockedCellKeys({ [key]: '900101-1234567' }), key).toEqual([key])
    }
  })

  it('AC-002.10: 막는 칸만 칸 순서대로 돌려주고 보통 글자 칸은 빠진다', () => {
    const cells: WorklogChanges = {
      memo: '문의 a@b.co',
      cashIn: '12,000 별도',
      noteCash: '택배비',
      cardIn: '01000001234',
      nameSpendFree: '(02)000-1234',
    }
    expect(blockedCellKeys(cells)).toEqual(['cardIn', 'memo', 'nameSpendFree'])
  })

  it('AC-002.10: 값이 없는 칸은 돌려주지 않는다', () => {
    expect(blockedCellKeys({})).toEqual([])
    expect(blockedCellKeys({ memo: '', cashIn: '', noteCash: undefined })).toEqual([])
  })

  it('AC-002.10: 보통 글자만 있으면 빈 목록이다', () => {
    expect(blockedCellKeys({ cashIn: '2건 12,000', memo: '가상 업무사항', nameCashIn: '현금' })).toEqual([])
  })

  it('AC-002.10: 정해 둔 칸 밖의 열쇠는 돌려주지 않는다', () => {
    const cells = { hospitalId: '010-0000-1234', cashIn: '010-0000-1234' } as WorklogChanges
    expect(blockedCellKeys(cells)).toEqual(['cashIn'])
  })
})
