import { describe, expect, it } from 'vitest'
import { createPatientIds } from './patientIds'

describe('AC-004.3 createPatientIds — 차트번호 → 1, 2, 3…', () => {
  it('처음 본 순서대로 1부터', () => {
    const ids = createPatientIds()
    expect(ids.idOf('9000003')).toBe(1)
    expect(ids.idOf('9000001')).toBe(2)
    expect(ids.idOf('9000002')).toBe(3)
  })

  it('같은 차트번호는 같은 번호', () => {
    const ids = createPatientIds()
    const first = ids.idOf('9000001')
    ids.idOf('9000002')
    expect(ids.idOf('9000001')).toBe(first)
  })

  it('앞뒤 공백 차이는 같은 사람', () => {
    const ids = createPatientIds()
    expect(ids.idOf(' 9000001')).toBe(ids.idOf('9000001\t'))
  })

  it('다른 차트번호는 다른 번호(앞 0도 글자 그대로 구분)', () => {
    const ids = createPatientIds()
    const numbers = ['9000001', '9000010', '0012', '12', 'A-12'].map((chart) => ids.idOf(chart))
    expect(new Set(numbers).size).toBe(5)
  })

  it('표마다 따로 센다', () => {
    const a = createPatientIds()
    const b = createPatientIds()
    a.idOf('9000001')
    expect(b.idOf('9000002')).toBe(1)
  })

  it('원래 차트번호를 꺼내는 길이 없다(목록·크기·직렬화)', () => {
    const ids = createPatientIds()
    ids.idOf('9000001')
    expect(Object.keys(ids)).toEqual(['idOf'])
    expect(JSON.stringify(ids)).toBe('{}')
    expect(String(ids)).not.toContain('9000001')
  })
})
