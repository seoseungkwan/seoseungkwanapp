import { describe, expect, it } from 'vitest'
import { bitCodeList, searchBitCodes } from './bitCodes'

// 비트 코드에서 고르기 목록(spec inventory REQ-7514 AC-7514.1). stats_months 줄의 payload->rx(달마다 처방 코드·이름·환자 수)만 쓴다.
// 코드·이름·수는 지어낸 값

const rx = (code: unknown, name: unknown, patients: unknown) => ({ code, name, type: '약', patients, newPatients: 0, returning: 0 })
const months = [
  {
    month: '2026-09',
    rx: [
      rx('xh0201', '히알루론산  주사', 100),
      rx('MM100', '케토프로펜 패치', 20),
      rx('', '빈 코드', 3),
      rx('BAD1', '   ', 3),
      rx('BAD2', '음수', -1),
      rx('BAD3', '소수', 1.5),
      rx(123, '숫자 코드', 1),
      rx('BAD4', '글자 수', '3'),
      rx('BAD5', null, 3),
      null,
      'x',
    ],
  },
  { month: '2026-10', rx: [rx('XH0201', '히알루론산 주사 2mL', 140), rx('AA200', '주사기 3cc', 120), rx('ZZ900', '리도카인', 120)] },
  { month: '2026-08', rx: { not: 'array' } },
  { month: '2026-07', rx: [rx('mm100', '옛 이름 패치', 5)] },
]

describe('AC-7514.1 bitCodeList', () => {
  it('AC-7514.1: 코드는 대소문자 없이 하나로 묶고(코드·이름은 가장 늦은 달 값) 건수 = 달마다 환자 수 합, 건수 큰 차례·같으면 코드 차례', () => {
    expect(bitCodeList(months, [])).toEqual([
      { code: 'XH0201', name: '히알루론산 주사 2mL', count: 240, taken: false },
      { code: 'AA200', name: '주사기 3cc', count: 120, taken: false },
      { code: 'ZZ900', name: '리도카인', count: 120, taken: false },
      { code: 'MM100', name: '케토프로펜 패치', count: 25, taken: false },
    ])
  })

  it('AC-7514.1: 모양이 틀린 줄(코드 1~100자 글자 아님·이름 없음·수가 0 이상 정수 아님)과 배열이 아닌 rx는 버린다', () => {
    const codes = bitCodeList(months, []).map((c) => c.code)
    for (const bad of ['', 'BAD1', 'BAD2', 'BAD3', 'BAD4', 'BAD5']) expect(codes).not.toContain(bad)
    expect(bitCodeList([{ month: '2026-10', rx: [rx('A'.repeat(100), '백 자', 1), rx('B'.repeat(101), '백한 자', 1)] }], [])).toEqual([
      { code: 'A'.repeat(100), name: '백 자', count: 1, taken: false },
    ])
    expect(bitCodeList([{ month: '2026-10', rx: [rx('C\u00071', '제어 문자', 1), rx('ok', '0명', 0)] }], [])).toEqual([
      { code: 'ok', name: '0명', count: 0, taken: false },
    ])
    expect(bitCodeList([{ month: '2026-10', rx: null }, { month: '2026-11', rx: 'rx' }], [])).toEqual([])
    expect(bitCodeList([], [])).toEqual([])
  })

  it('AC-7514.1: 코드 앞뒤 빈칸은 떼고, 이름은 빈칸을 다듬어 40자로 자른다', () => {
    const long = '가'.repeat(39) + '나다라'
    expect(bitCodeList([{ month: '2026-10', rx: [rx('  QQ1 ', `  ${long}  `, 2), rx('QQ2', ' 압박\t붕대   3인치 ', 1)] }], [])).toEqual([
      { code: 'QQ1', name: '가'.repeat(39) + '나', count: 2, taken: false },
      { code: 'QQ2', name: '압박 붕대 3인치', count: 1, taken: false },
    ])
  })

  it('AC-7514.1: 물품 비트 코드(대소문자 무시)이거나 같은 이름 물품(안 쓰는 물품 포함)이 있으면 taken', () => {
    const items = [
      { name: '다른 물품', bitCode: 'zz900', hidden: false },
      { name: ' 주사기  3CC ', bitCode: null, hidden: true },
      { name: '히알루론산 주사', bitCode: null, hidden: false },
    ]
    expect(bitCodeList(months, items).map((c) => [c.code, c.taken])).toEqual([
      ['XH0201', false],
      ['AA200', true],
      ['ZZ900', true],
      ['MM100', false],
    ])
  })
})

describe('AC-7514.1 searchBitCodes', () => {
  const list = bitCodeList(months, [])

  it('AC-7514.1: 이름·코드에 찾는 말이 들어 있는 것(대소문자·앞뒤 빈칸 무시), 차례는 그대로', () => {
    expect(searchBitCodes(list, ' xh02 ').map((c) => c.code)).toEqual(['XH0201'])
    expect(searchBitCodes(list, '주사').map((c) => c.code)).toEqual(['XH0201', 'AA200'])
    expect(searchBitCodes(list, '2ML').map((c) => c.code)).toEqual(['XH0201'])
    expect(searchBitCodes(list, '없는 말')).toEqual([])
  })

  it('AC-7514.1: 찾는 말이 비면 모두(새 배열)', () => {
    expect(searchBitCodes(list, '')).toEqual(list)
    expect(searchBitCodes(list, '   ')).toEqual(list)
    expect(searchBitCodes(list, '')).not.toBe(list)
  })
})
