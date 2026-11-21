import { describe, expect, it } from 'vitest'
import { particle } from './korean'

// 받침 조사(requirements.md '화면 글자' 지우기 확인 창·미리 보기 까닭 글, design.md '예')
describe('AC-6503.10 particle', () => {
  it('AC-6503.10: 끝 글자에 받침이 있으면 앞 글자, 없으면 뒤 글자다', () => {
    expect(particle('예시메디칼', '을/를')).toBe('을')
    expect(particle('예시설비', '을/를')).toBe('를')
    expect(particle('충격파 기계', '은/는')).toBe('는')
    expect(particle('일련번호', '은/는')).toBe('는')
    expect(particle('들여온 날', '은/는')).toBe('은')
    expect(particle('김예시', '이/가')).toBe('가')
    expect(particle('온열기 헤드', '이/가')).toBe('가')
    expect(particle('예시상사 본점', '이/가')).toBe('이')
  })

  it('AC-6503.10: 한글이 아닌 끝 글자는 받침 있음으로 본다', () => {
    expect(particle('ABC', '이/가')).toBe('이')
    expect(particle('X-100', '을/를')).toBe('을')
    expect(particle('충격파(2호)', '은/는')).toBe('은')
    expect(particle('', '이/가')).toBe('이')
  })

  it('AC-6503.10: NFD로 온 이름도 받침을 맞게 본다', () => {
    expect(particle('예시설비'.normalize('NFD'), '을/를')).toBe('를')
    expect(particle('예시메디칼'.normalize('NFD'), '을/를')).toBe('을')
  })
})
