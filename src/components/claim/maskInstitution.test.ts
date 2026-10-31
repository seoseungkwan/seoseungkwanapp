import { describe, expect, it } from 'vitest'
import { maskInstitution } from './maskInstitution'

// 기관기호는 서버에 올리지 않고 화면에는 뒤 4자리를 가린다(design.md 9-1, AC-006.4)
describe('AC-006.4 maskInstitution', () => {
  it('AC-006.4: 8자리 기관기호는 뒤 4자리를 *로 가린다', () => {
    expect(maskInstitution('12345678')).toBe('1234****')
  })

  it('AC-006.4: 가린 뒤에는 뒤 4자리 숫자가 남지 않는다', () => {
    const masked = maskInstitution('98765432')
    expect(masked).toBe('9876****')
    expect(masked).not.toContain('5432')
  })

  it('AC-006.4: 4자리 이하로 짧으면 모두 가린다(가린 글자 수는 그대로)', () => {
    expect(maskInstitution('1234')).toBe('****')
    expect(maskInstitution('12')).toBe('**')
    expect(maskInstitution('')).toBe('')
  })
})
