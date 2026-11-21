import { describe, expect, it } from 'vitest'
import { matchLines, normalizeName } from './names'

// 명세서 읽은 줄 → 목록 물품 고르기(spec inventory REQ-7502 AC-7502.6). 물품 이름·별칭은 지어낸 값

const items = [
  { id: 'i-syringe', name: '주사기 3cc', hidden: false },
  { id: 'i-gauze', name: '멸균 거즈', hidden: false },
  { id: 'i-old', name: '주사기 5cc', hidden: true },
  { id: 'i-gel', name: 'Ultra Gel 250mL', hidden: false },
]
const line = (name: string, itemId: string | null = null, unsure = false) => ({ name, itemId, unsure })

describe('AC-7502.6 normalizeName', () => {
  it('AC-7502.6: 앞뒤 빈칸을 떼고 빈칸 여럿은 하나로, 영문은 작은 글자로', () => {
    expect(normalizeName('  Ultra   Gel\t250mL  ')).toBe('ultra gel 250ml')
    expect(normalizeName('멸균　 거즈')).toBe('멸균 거즈')
    expect(normalizeName('')).toBe('')
    expect(normalizeName('   ')).toBe('')
  })

  it('AC-7502.6: 풀어 쓴 한글(NFD)도 모은 글자(NFC)로 본다', () => {
    expect(normalizeName('가저')).toBe('가저')
    expect(normalizeName('가저')).toBe(normalizeName('가저'))
  })
})

describe('AC-7502.6 matchLines', () => {
  it('AC-7502.6: (1) 이름이 같은 숨기지 않은 물품을 AI가 고른 것보다 먼저 고른다(앞뒤 빈칸·대소문자 무시)', () => {
    const out = matchLines([line(' ultra  gel 250ML ', 'i-gauze', true)], items, [])
    expect(out).toEqual([{ name: ' ultra  gel 250ML ', itemId: 'i-gel', unsure: false, how: 'name' }])
  })

  it('AC-7502.6: (2) 이름이 같은 물품이 없으면 별칭이 같은 물품(기억한 이름)을 AI보다 먼저 고른다', () => {
    const aliases = [{ alias: '일회용주사기 3ml', itemId: 'i-syringe' }]
    const out = matchLines([line('일회용주사기  3ML', 'i-gauze', true)], items, aliases)
    expect(out).toEqual([{ name: '일회용주사기  3ML', itemId: 'i-syringe', unsure: false, how: 'alias' }])
  })

  it('AC-7502.6: (3) 이름·별칭이 없으면 AI가 고른 숨기지 않은 물품이고, 자신 없음은 그대로 남는다', () => {
    expect(matchLines([line('알콜솜 100매', 'i-gauze', true)], items, [])).toEqual([
      { name: '알콜솜 100매', itemId: 'i-gauze', unsure: true, how: 'ai' },
    ])
    expect(matchLines([line('알콜솜 100매', 'i-gauze', false)], items, [])).toEqual([
      { name: '알콜솜 100매', itemId: 'i-gauze', unsure: false, how: 'ai' },
    ])
  })

  it('AC-7502.6: (4) 아무것도 맞지 않으면 새 물품(itemId null)이다', () => {
    expect(matchLines([line('테이핑 테이프 5cm')], items, [])).toEqual([
      { name: '테이핑 테이프 5cm', itemId: null, unsure: false, how: 'new' },
    ])
  })

  it('AC-7502.6: 숨긴 물품은 이름이 같아도, AI가 골라도 고르지 않는다', () => {
    expect(matchLines([line('주사기 5cc')], items, [])[0]).toMatchObject({ itemId: null, how: 'new' })
    expect(matchLines([line('5cc 주사기', 'i-old', true)], items, [])[0]).toMatchObject({ itemId: null, how: 'new', unsure: false })
  })

  it('AC-7502.6: 숨긴 물품 이름과 같아도 별칭·AI 차례로 내려간다', () => {
    const aliases = [{ alias: '주사기 5cc', itemId: 'i-syringe' }]
    expect(matchLines([line('주사기 5cc')], items, aliases)[0]).toMatchObject({ itemId: 'i-syringe', how: 'alias' })
    expect(matchLines([line('주사기 5cc', 'i-gauze')], items, [])[0]).toMatchObject({ itemId: 'i-gauze', how: 'ai' })
  })

  it('AC-7502.6: 목록에 없는 물품을 가리키는 AI 답·별칭은 건너뛴다(숨긴 물품을 가리키는 별칭도)', () => {
    const aliases = [
      { alias: '없는 물품', itemId: 'i-gone' },
      { alias: '옛 주사기', itemId: 'i-old' },
    ]
    expect(matchLines([line('없는 물품', 'i-gone')], items, aliases)[0]).toMatchObject({ itemId: null, how: 'new' })
    expect(matchLines([line('옛 주사기', 'i-gauze')], items, aliases)[0]).toMatchObject({ itemId: 'i-gauze', how: 'ai' })
  })

  it('AC-7502.6: 별칭 쪽도 normalizeName으로 견준다', () => {
    const aliases = [{ alias: '  Nitrile  Glove M ', itemId: 'i-gauze' }]
    expect(matchLines([line('nitrile glove m')], items, aliases)[0]).toMatchObject({ itemId: 'i-gauze', how: 'alias' })
  })

  it('AC-7502.6: 줄의 다른 칸은 그대로 두고 받은 줄 차례대로 돌려주며 받은 배열을 바꾸지 않는다', () => {
    const lines = [
      { name: '멸균 거즈', itemId: null, unsure: false, qty: 10, unitPrice: 2800, amount: 28000 },
      { name: '테이프', itemId: null, unsure: true, qty: 12, unitPrice: null, amount: null },
    ]
    const copy = structuredClone(lines)
    const out = matchLines(lines, items, [])
    expect(out).toEqual([
      { name: '멸균 거즈', itemId: 'i-gauze', unsure: false, qty: 10, unitPrice: 2800, amount: 28000, how: 'name' },
      { name: '테이프', itemId: null, unsure: false, qty: 12, unitPrice: null, amount: null, how: 'new' },
    ])
    expect(lines).toEqual(copy)
  })

  it('AC-7502.6: 줄이 없으면 빈 목록', () => {
    expect(matchLines([], items, [])).toEqual([])
  })
})
