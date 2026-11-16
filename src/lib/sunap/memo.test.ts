import { describe, expect, it } from 'vitest'
import { DEFAULT_RSV_WORDS, type RsvWords } from '@/types/sunap'
import { classifyMemo } from './memo'

// 예약 메모 말 목록(설정 기본값과 같은 모양). 메모는 지어낸 글
const WORDS: RsvWords = { inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] }

describe('AC-4901.1 classifyMemo — 예약 메모 말로 예약 종류를 정한다', () => {
  it.each([
    ['주사 오전', 'inj'],
    ['블록 예약', 'inj'],
    ['경과 보기', 'visit'],
    ['진료', 'visit'],
    ['기타 서류', 'etc'],
    ['전화 상담', 'unknown'],
    ['', 'unknown'],
  ] as const)('AC-4901.1: "%s" → %s', (memo, kind) => {
    expect(classifyMemo(memo, WORDS)).toBe(kind)
  })

  it('AC-4901.1: 말이 여럿 있으면 inj → visit → etc 차례로 먼저 맞는 것이다', () => {
    expect(classifyMemo('경과 보고 주사', WORDS)).toBe('inj')
    expect(classifyMemo('기타 겸 진료', WORDS)).toBe('visit')
    expect(classifyMemo('기타 주사 경과', WORDS)).toBe('inj')
  })

  it('AC-4901.1: 앞뒤 빈칸은 메모와 말 모두에서 무시한다', () => {
    expect(classifyMemo('  주사  ', WORDS)).toBe('inj')
    expect(classifyMemo('오전 주사', { inj: ['  주사 '], visit: [], etc: [] })).toBe('inj')
  })

  it('AC-4901.1: 영문 대소문자를 가리지 않는다', () => {
    const words: RsvWords = { inj: ['Inj'], visit: ['F/U'], etc: ['ETC'] }
    expect(classifyMemo('INJ am', words)).toBe('inj')
    expect(classifyMemo('f/u 2주', words)).toBe('visit')
    expect(classifyMemo('etc', words)).toBe('etc')
  })

  it('AC-4901.1: 빈 말(빈칸뿐인 말 포함)은 무시한다 — 아무 메모에나 맞지 않는다', () => {
    const words: RsvWords = { inj: ['', '   '], visit: [' '], etc: [''] }
    expect(classifyMemo('주사 오전', words)).toBe('unknown')
    expect(classifyMemo('', words)).toBe('unknown')
    expect(classifyMemo('경과', { inj: [''], visit: ['경과'], etc: [] })).toBe('visit')
  })

  it('AC-4901.1: 말 목록이 모두 비면 늘 unknown이다', () => {
    expect(classifyMemo('주사', { inj: [], visit: [], etc: [] })).toBe('unknown')
  })

  it('AC-4901.1: 설정 기본 말(DEFAULT_RSV_WORDS)은 design.md 기본값과 같다', () => {
    expect(DEFAULT_RSV_WORDS).toEqual({ inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] })
    expect(classifyMemo('주사 오전', DEFAULT_RSV_WORDS)).toBe('inj')
  })
})
