import { describe, expect, it } from 'vitest'
import { DEFAULT_RSV_KINDS, type RsvKindDef } from '@/types/sunap'
import { classifyMemo } from './memo'

// 예약 메모 → 종류 id(설정 기본값과 같은 모양의 종류 목록). 메모는 지어낸 글

/** 기본 셋(주사치료 → 진료(경과) → 기타)에 말만 바꾼 목록 */
const kindsOf = (inj: string[], visit: string[], etc: string[]): RsvKindDef[] => [
  { id: 'inj', label: '주사치료', counts: true, words: inj },
  { id: 'visit', label: '진료(경과)', counts: true, words: visit },
  { id: 'etc', label: '기타', counts: false, words: etc },
]
const KINDS = kindsOf(['주사', '블록'], ['경과', '진료'], ['기타'])
const DOSU: RsvKindDef = { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수', '수기'] }

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
    expect(classifyMemo(memo, KINDS)).toBe(kind)
  })

  it('AC-4901.1: 기본 목록이면 말이 여럿 있을 때 inj → visit → etc 차례로 먼저 맞는 것이다', () => {
    expect(classifyMemo('경과 보고 주사', KINDS)).toBe('inj')
    expect(classifyMemo('기타 겸 진료', KINDS)).toBe('visit')
    expect(classifyMemo('기타 주사 경과', KINDS)).toBe('inj')
  })

  it('AC-4901.1: 앞뒤 빈칸은 메모와 말 모두에서 무시한다', () => {
    expect(classifyMemo('  주사  ', KINDS)).toBe('inj')
    expect(classifyMemo('오전 주사', kindsOf(['  주사 '], [], []))).toBe('inj')
  })

  it('AC-4901.1: 영문 대소문자를 가리지 않는다', () => {
    const kinds = kindsOf(['Inj'], ['F/U'], ['ETC'])
    expect(classifyMemo('INJ am', kinds)).toBe('inj')
    expect(classifyMemo('f/u 2주', kinds)).toBe('visit')
    expect(classifyMemo('etc', kinds)).toBe('etc')
  })

  it('AC-4901.1: 빈 말(빈칸뿐인 말 포함)은 무시한다 — 아무 메모에나 맞지 않는다', () => {
    const kinds = kindsOf(['', '   '], [' '], [''])
    expect(classifyMemo('주사 오전', kinds)).toBe('unknown')
    expect(classifyMemo('', kinds)).toBe('unknown')
    expect(classifyMemo('경과', kindsOf([''], ['경과'], []))).toBe('visit')
  })

  it('AC-4901.1: 말 목록이 모두 비면 늘 unknown이다', () => {
    expect(classifyMemo('주사', kindsOf([], [], []))).toBe('unknown')
  })
})

describe('AC-5502.1 classifyMemo — 종류 목록 차례로 처음 말이 든 종류의 id', () => {
  it('AC-5502.1: 새 종류의 말이 메모에 있으면 그 종류 id다', () => {
    const kinds = [...KINDS.slice(0, 2), DOSU, KINDS[2]]
    expect(classifyMemo('도수 오후', kinds)).toBe('kdosu01')
    expect(classifyMemo('수기치료 예약', kinds)).toBe('kdosu01')
    expect(classifyMemo('주사 오전', kinds)).toBe('inj')
    expect(classifyMemo('전화 상담', kinds)).toBe('unknown')
  })

  it('AC-5502.1: 메모에 두 종류 말이 다 있으면 목록에서 위에 있는 종류다(기본 셋 차례가 아니다)', () => {
    expect(classifyMemo('도수 후 주사', [...KINDS.slice(0, 2), DOSU, KINDS[2]])).toBe('inj')
    expect(classifyMemo('도수 후 주사', [DOSU, ...KINDS])).toBe('kdosu01')
    // 기타를 맨 위로 옮기면 기타가 먼저다
    expect(classifyMemo('기타 주사 경과', [KINDS[2], KINDS[0], KINDS[1]])).toBe('etc')
    expect(classifyMemo('경과 보고 주사', [KINDS[1], KINDS[0], KINDS[2]])).toBe('visit')
  })

  it('AC-5502.1: 같은 말이 두 종류에 있으면 위 종류다', () => {
    const same: RsvKindDef = { id: 'kshot01', label: '주사 2', counts: false, words: ['주사'] }
    expect(classifyMemo('주사', [same, ...KINDS])).toBe('kshot01')
    expect(classifyMemo('주사', [...KINDS, same])).toBe('inj')
  })

  it('AC-5502.1: 새 종류 말도 앞뒤 빈칸·영문 대소문자를 가리지 않고, 말이 빈 종류는 메모로 정해지지 않는다', () => {
    const eswt: RsvKindDef = { id: 'keswt01', label: '체외충격파', counts: false, words: [' ESWT '] }
    const empty: RsvKindDef = { id: 'kempty1', label: '직접만', counts: true, words: [] }
    expect(classifyMemo('eswt 2회차', [empty, ...KINDS, eswt])).toBe('keswt01')
    expect(classifyMemo('', [empty, ...KINDS, eswt])).toBe('unknown')
  })

  it('AC-5502.1: 종류 목록이 비면 늘 unknown이다', () => {
    expect(classifyMemo('주사', [])).toBe('unknown')
  })

  it('AC-5502.1: 기본 목록(DEFAULT_RSV_KINDS)으로도 정한다', () => {
    expect(classifyMemo('주사 오전', DEFAULT_RSV_KINDS)).toBe('inj')
    expect(classifyMemo('경과', DEFAULT_RSV_KINDS)).toBe('visit')
    expect(classifyMemo('기타', DEFAULT_RSV_KINDS)).toBe('etc')
  })
})
