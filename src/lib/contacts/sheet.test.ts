import { describe, expect, it } from 'vitest'
import {
  CONTACT_HEADERS,
  CONTACT_KEYS,
  CONTACT_SHEET,
  EQUIPMENT_HEADERS,
  EQUIPMENT_KEYS,
  EQUIPMENT_SHEET,
  GUIDE_SHEET,
  cellText,
  mapHeaders,
} from './sheet'

// 엑셀 양식 시트·머리글(requirements.md 이미 정한 것 10번 글자 그대로, 가운뎃점은 U+00B7)
describe('AC-6503.2 시트·머리글 상수', () => {
  it('AC-6503.2: 시트 이름은 쓰는 법·연락처·장비다', () => {
    expect([GUIDE_SHEET, CONTACT_SHEET, EQUIPMENT_SHEET]).toEqual(['쓰는 법', '연락처', '장비'])
  })

  it('AC-6503.2: 연락처 머리글 14개·장비 머리글 5개가 양식 차례 그대로다', () => {
    expect(CONTACT_HEADERS).toEqual([
      '분류',
      '업체 이름',
      '대표 전화',
      '하는 일·품목',
      '주소',
      '홈페이지',
      '사업자번호',
      '계좌',
      '사이트 아이디',
      '사이트 비밀번호',
      '업체 메모',
      '담당자 이름',
      '담당자 휴대폰',
      '맡은 일',
    ])
    expect(EQUIPMENT_HEADERS).toEqual(['업체 이름', '장비 이름', '일련번호', '들여온 날', '무상 수리 끝나는 날'])
    expect(CONTACT_HEADERS[3].codePointAt(4)).toBe(0x00b7)
    for (const header of [...CONTACT_HEADERS, ...EQUIPMENT_HEADERS]) expect(header).toBe(header.normalize('NFC'))
  })

  it('AC-6503.2: 칸 열쇠는 머리글과 같은 차례다', () => {
    expect(CONTACT_KEYS).toEqual([
      'category',
      'name',
      'phone',
      'work',
      'address',
      'homepage',
      'bizNo',
      'account',
      'siteId',
      'sitePw',
      'memo',
      'personName',
      'personMobile',
      'personRole',
    ])
    expect(EQUIPMENT_KEYS).toEqual(['company', 'name', 'serial', 'boughtOn', 'warrantyUntil'])
    expect(CONTACT_KEYS).toHaveLength(CONTACT_HEADERS.length)
    expect(EQUIPMENT_KEYS).toHaveLength(EQUIPMENT_HEADERS.length)
  })
})

describe('AC-6503.2 mapHeaders', () => {
  it('AC-6503.2: 차례 그대로인 머리글 줄은 0부터의 칸 자리다', () => {
    expect(mapHeaders([...EQUIPMENT_HEADERS], EQUIPMENT_HEADERS)).toEqual([0, 1, 2, 3, 4])
    expect(mapHeaders([...CONTACT_HEADERS], CONTACT_HEADERS)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  })

  it('AC-6503.2: 차례가 달라도, 모르는 칸·빈 칸이 끼어도 머리글마다 칸 자리를 찾는다', () => {
    const cells = [null, '비고', '무상 수리 끝나는 날', '장비 이름', 7, '업체 이름', '', '들여온 날', '일련번호']
    expect(mapHeaders(cells, EQUIPMENT_HEADERS)).toEqual([5, 3, 8, 7, 2])
  })

  it('AC-6503.2: 칸 글자는 앞뒤 빈칸을 빼고 NFC로 맞춰 견준다', () => {
    const cells = ['  업체 이름 ', '장비 이름'.normalize('NFD'), '일련번호\t', '들여온 날', '무상 수리 끝나는 날']
    expect(mapHeaders(cells, EQUIPMENT_HEADERS)).toEqual([0, 1, 2, 3, 4])
  })

  it('AC-6503.2: 같은 머리글이 둘이면 앞 칸이다', () => {
    expect(mapHeaders(['업체 이름', '업체 이름', '장비 이름', '일련번호', '들여온 날', '무상 수리 끝나는 날'], EQUIPMENT_HEADERS)).toEqual([
      0, 2, 3, 4, 5,
    ])
  })

  it('AC-6503.2: 머리글이 하나라도 없거나 글자가 다르면 null이다', () => {
    expect(mapHeaders(['업체 이름', '장비 이름', '일련번호', '들여온 날'], EQUIPMENT_HEADERS)).toBeNull()
    expect(mapHeaders(['업체이름', '장비 이름', '일련번호', '들여온 날', '무상 수리 끝나는 날'], EQUIPMENT_HEADERS)).toBeNull()
    const otherDot = CONTACT_HEADERS.map((h) => h.replace('·', '・'))
    expect(mapHeaders(otherDot, CONTACT_HEADERS)).toBeNull()
    expect(mapHeaders([], EQUIPMENT_HEADERS)).toBeNull()
  })
})

describe('AC-6503.3 cellText', () => {
  it('AC-6503.3: 글자는 앞뒤 빈칸을 빼고 NFC, 숫자·참거짓은 String(값)(앞자리 0을 되살리지 않음), null은 빈 글자', () => {
    expect(cellText('  예시메디칼 ')).toBe('예시메디칼')
    expect(cellText('예시'.normalize('NFD'))).toBe('예시')
    expect(cellText(212345678)).toBe('212345678')
    expect(cellText(1001)).toBe('1001')
    expect(cellText(1234567890)).toBe('1234567890')
    expect(cellText(true)).toBe('true')
    expect(cellText(null)).toBe('')
    expect(cellText('0212345678')).toBe('0212345678')
  })
})
