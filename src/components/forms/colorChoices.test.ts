import { describe, expect, it } from 'vitest'
import { BASIC_COLORS } from './colorChoices'

// 색 고르기의 기본 색 16가지 (spec form-style requirements.md '낱말'·AC-6801.3 ③, design.md 4절, TASK-3)

describe('AC-6801.3: 기본 색 16가지', () => {
  it('AC-6801.3: 이름·값·차례가 requirements 낱말 그대로다', () => {
    expect(BASIC_COLORS).toEqual([
      { name: '검정', hex: '#111111' },
      { name: '진회색', hex: '#3a3a3a' },
      { name: '회색', hex: '#6b7280' },
      { name: '흰색', hex: '#ffffff' },
      { name: '남색', hex: '#1f2a44' },
      { name: '파랑', hex: '#2563eb' },
      { name: '하늘', hex: '#0ea5e9' },
      { name: '청록', hex: '#0d9488' },
      { name: '초록', hex: '#16a34a' },
      { name: '연두', hex: '#65a30d' },
      { name: '노랑', hex: '#eab308' },
      { name: '주황', hex: '#f97316' },
      { name: '빨강', hex: '#dc2626' },
      { name: '분홍', hex: '#db2777' },
      { name: '보라', hex: '#7c3aed' },
      { name: '갈색', hex: '#92400e' },
    ])
  })

  it("AC-6801.3: 16개 모두 '#' + 소문자 16진수 6자리이고 이름·값이 겹치지 않는다", () => {
    expect(BASIC_COLORS).toHaveLength(16)
    for (const { hex } of BASIC_COLORS) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(BASIC_COLORS.map((c) => c.name)).size).toBe(16)
    expect(new Set(BASIC_COLORS.map((c) => c.hex)).size).toBe(16)
  })

  it('AC-6801.3: 여러 곳이 같이 쓰니 목록과 칸이 얼려 있다', () => {
    expect(Object.isFrozen(BASIC_COLORS)).toBe(true)
    for (const color of BASIC_COLORS) expect(Object.isFrozen(color), color.name).toBe(true)
  })
})
