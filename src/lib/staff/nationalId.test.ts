import { describe, expect, it } from 'vitest'
import { hasNationalId } from './nationalId'

// 주민번호 모양 (staff AC-7610.6, design.md 4절 nationalId.ts). 직원 주소·메모에 주민번호를 저장하지 않으려고
// 명단 칸(AC-7612.7)·엑셀 읽기(AC-7608.6)·저장 층(AC-7610.6)이 이 한 함수를 쓴다. 번호는 모두 지어낸 것이다

describe('AC-7610.6: hasNationalId — 막는 보기', () => {
  it.each([
    '900101-1234567',
    '900101 - 1234567',
    '900101.1234567',
    '900101 1234567',
    '9001011234567',
    '９００１０１－１２３４５６７',
    '주민 850315-2345678 확인',
  ])('AC-7610.6: %j는 주민번호 모양이다', (text) => {
    expect(hasNationalId(text)).toBe(true)
  })

  it.each(['－', '—', '–', '―', '‐', '‑', '−', 'ㅡ'])('AC-7610.6: 긴 줄표·전각 붙임표 %j도 붙임표로 본다', (dash) => {
    expect(hasNationalId(`900101${dash}1234567`)).toBe(true)
    expect(hasNationalId(`메모 900101 ${dash} 1234567`)).toBe(true)
  })

  it('AC-7610.6: 붙여 쓴 13자리는 뒤 첫 숫자가 1~8이면 막는다', () => {
    for (const first of '12345678') expect(hasNationalId(`900101${first}234567`), first).toBe(true)
  })

  it('AC-7610.6: 전각 숫자만 섞어 써도, 글 사이에 있어도, 번호 글자(①) 바로 뒤에 써도 같은 숫자로 본다', () => {
    expect(hasNationalId('９００１０１1234567')).toBe(true)
    expect(hasNationalId('가짜시 가짜로 1, 900101-1234567 (본인)')).toBe(true)
    expect(hasNationalId('①900101-1234567')).toBe(true)
  })

  it('AC-7610.6: 날짜 모양 앞 6자리 — 월 01~12, 일 01~31만', () => {
    expect(hasNationalId('001231-3234567')).toBe(true)
    expect(hasNationalId('991131-1234567')).toBe(true)
    expect(hasNationalId('901301-1234567')).toBe(false)
    expect(hasNationalId('900001-1234567')).toBe(false)
    expect(hasNationalId('900132-1234567')).toBe(false)
    expect(hasNationalId('900100-1234567')).toBe(false)
  })
})

describe('AC-7610.6: hasNationalId — 막지 않는 보기(반례)', () => {
  it.each([
    ['전화', '010-1234-5678'],
    ['전화', '01012345678'],
    ['전화', '02-123-4567'],
    ['전화', '+82 10-1234-5678'],
    ['계좌', '123456-12-123456'],
    ['계좌', '110-123-456789'],
    ['계좌', '3333-01-1234567'],
    ['계좌', '1002-123-456789'],
    ['붙여 쓴 14자리', '12345678901234'],
    ['날짜', '1990-01-01'],
    ['날짜', '900101'],
    ['금액', '3,200,000'],
  ])('AC-7610.6: %s %j는 주민번호 모양이 아니다', (_kind, text) => {
    expect(hasNationalId(text)).toBe(false)
  })

  it('AC-7610.6: 앞이나 뒤에 다른 숫자가 바로 붙으면(더 긴 숫자의 일부) 아니다', () => {
    expect(hasNationalId('1900101-1234567')).toBe(false)
    expect(hasNationalId('900101-12345678')).toBe(false)
    expect(hasNationalId('19001011234567')).toBe(false)
    expect(hasNationalId('90010112345678')).toBe(false)
  })

  it('AC-7610.6: 붙여 쓴 13자리의 뒤 첫 숫자가 0·9면 아니다', () => {
    expect(hasNationalId('9001010234567')).toBe(false)
    expect(hasNationalId('9001019234567')).toBe(false)
  })

  it('AC-7610.6: 빈 글·주소·메모 보통 글은 아니다', () => {
    for (const text of ['', '○○시 ○○구 ○○로 123, 4층', '도수치료 담당', '보호자 010-1234-5678 · 월급 계좌 110-123-456789 · 1990-01-01 입사 · 3,200,000원']) {
      expect(hasNationalId(text), text).toBe(false)
    }
  })

  it('AC-7610.6: 받은 글은 바꾸지 않는다(맞춘 글로 검사만)', () => {
    const text = '９００１０１－１２３４５６７'
    hasNationalId(text)
    expect(text).toBe('９００１０１－１２３４５６７')
  })
})
