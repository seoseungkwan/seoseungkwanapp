import { describe, expect, it } from 'vitest'
import { TERM_KEYS, TERM_MAX, TERM_ROWS, termOf, withTerm } from './terms'

// 임대 조건 협상표 (spec location AC-7910.3, design.md 11절 `terms` 열쇠 여섯 × { now, want } 글 100자 + terms.memo 임대 조건 메모)

describe('AC-7910.3: 협상표 여섯 줄', () => {
  it('AC-7910.3: 줄은 design.md 열쇠 여섯 차례이고 이름·도움말은 시안 글 그대로', () => {
    expect(TERM_KEYS).toEqual(['freeRent', 'mgmt', 'raise', 'restore', 'period', 'premium'])
    expect(TERM_ROWS.map((r) => [r.key, r.label, r.help])).toEqual([
      ['freeRent', '무상 기간', '공사하는 동안 월세를 안 내는 기간'],
      ['mgmt', '관리비', '평당 얼마인지, 전기·물값이 들어 있는지'],
      ['raise', '월세 올리는 비율', '해마다인지 2년마다인지'],
      ['restore', '원상 복구', '나갈 때 어디까지 되돌려 놓나'],
      ['period', '계약 기간', '처음 몇 년, 더 살 권리'],
      ['premium', '권리금', '바닥 권리금·시설 권리금'],
    ])
    expect(TERM_MAX).toBe(100)
  })

  it('AC-7910.3: 저장된 terms에서 칸마다 지금 제안·바라는 것을 읽는다(모양이 틀리면 빈 글자)', () => {
    const terms = { freeRent: { now: '2개월', want: '3개월' }, mgmt: '78만 원', raise: { now: 5 }, memo: '메모' }
    expect(termOf(terms, 'freeRent')).toEqual({ now: '2개월', want: '3개월' })
    expect(termOf(terms, 'mgmt')).toEqual({ now: '', want: '' })
    expect(termOf(terms, 'raise')).toEqual({ now: '', want: '' })
    expect(termOf({}, 'period')).toEqual({ now: '', want: '' })
  })

  it('AC-7910.3: 한 칸을 고치면 그 열쇠만 바뀌고 임대 조건 메모(terms.memo)와 다른 열쇠는 그대로 남는다', () => {
    const terms = { memo: '전기 증설 반반?', period: { now: '5년', want: '5년 + 5년 더' } }
    const next = withTerm(terms, 'freeRent', 'want', ' 3개월 ')
    expect(next).toEqual({ memo: '전기 증설 반반?', period: { now: '5년', want: '5년 + 5년 더' }, freeRent: { now: '', want: '3개월' } })
    expect(terms).toEqual({ memo: '전기 증설 반반?', period: { now: '5년', want: '5년 + 5년 더' } })
  })

  it('AC-7910.3: 두 칸이 다 비면 그 열쇠를 뺀다, 글은 100자까지', () => {
    expect(withTerm({ period: { now: '5년', want: '' }, memo: 'm' }, 'period', 'now', '  ')).toEqual({ memo: 'm' })
    expect(withTerm({}, 'restore', 'now', '가'.repeat(120))).toEqual({ restore: { now: '가'.repeat(100), want: '' } })
  })
})
