import { describe, expect, it } from 'vitest'
import { CONTACT_CATEGORIES, categoryLabel, categoryOf } from './categories'

// 주소록 분류 넷(requirements.md 이미 정한 것 2, design.md '순수 함수' categories.ts)
describe('AC-6503.3 분류', () => {
  it('AC-6503.3: 분류는 넷이고 거래처 → 수리·관리 → 기관·보험 → 기타 차례다(가운뎃점은 U+00B7)', () => {
    expect(CONTACT_CATEGORIES).toEqual([
      { id: 'supplier', label: '거래처' },
      { id: 'repair', label: '수리·관리' },
      { id: 'agency', label: '기관·보험' },
      { id: 'other', label: '기타' },
    ])
    expect(CONTACT_CATEGORIES[1].label.charCodeAt(2)).toBe(0x00b7)
    expect(CONTACT_CATEGORIES[2].label.charCodeAt(2)).toBe(0x00b7)
  })

  it('AC-6503.3: categoryOf는 네 글자 가운데 하나와 같을 때만 id다(앞뒤 빈칸은 뺀다)', () => {
    expect(categoryOf('거래처')).toBe('supplier')
    expect(categoryOf('수리·관리')).toBe('repair')
    expect(categoryOf('기관·보험')).toBe('agency')
    expect(categoryOf('기타')).toBe('other')
    expect(categoryOf(' 거래처 ')).toBe('supplier')
    expect(categoryOf('병원')).toBeNull()
    expect(categoryOf('')).toBeNull()
    expect(categoryOf('supplier')).toBeNull()
    // 다른 점 글자는 다른 분류다(엑셀 목록 고르기 글자 그대로만)
    expect(categoryOf('수리・관리')).toBeNull()
    expect(categoryOf('수리 관리')).toBeNull()
  })

  it('AC-6503.3: categoryOf는 NFD로 온 한글도 같은 분류로 본다', () => {
    expect(categoryOf('거래처'.normalize('NFD'))).toBe('supplier')
  })

  it('AC-6503.3: categoryLabel은 id의 글자다', () => {
    expect(categoryLabel('supplier')).toBe('거래처')
    expect(categoryLabel('repair')).toBe('수리·관리')
    expect(categoryLabel('agency')).toBe('기관·보험')
    expect(categoryLabel('other')).toBe('기타')
  })
})
