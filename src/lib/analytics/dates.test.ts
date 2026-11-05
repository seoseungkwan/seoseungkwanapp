import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addMonthsToDay,
  compareYmd,
  diffDays,
  eachDay,
  excelSerialToYmd,
  isMonth,
  isYmd,
  monthOf,
  monthRange,
  parseDateCell,
  sameDayLastMonth,
  todayInKorea,
  weekRange,
  weekStartOf,
  weekdayOf,
} from './dates'

describe('AC-013.13 sameDayLastMonth: 한 달 전 같은 날(그달에 없으면 말일)', () => {
  it.each([
    ['2026-10-28', '2026-09-28'],
    ['2026-11-03', '2026-10-03'],
    ['2026-01-15', '2025-12-15'], // 해를 넘긴다
    ['2026-03-31', '2026-02-28'], // 2월 31일은 없다 → 말일
    ['2028-03-31', '2028-02-29'], // 윤년 말일
    ['2026-05-31', '2026-04-30'],
    ['2026-03-28', '2026-02-28'],
    ['2026-07-31', '2026-06-30'],
  ])('%s → %s', (ymd, want) => {
    expect(sameDayLastMonth(ymd)).toBe(want)
  })

  it('AC-013.13: 많아야 31일 전이라 읽는 기간이 늘 35일 안이다', () => {
    for (const day of eachDay({ from: '2026-01-01', to: '2028-12-31' })) {
      expect(diffDays(sameDayLastMonth(day), day)).toBeLessThanOrEqual(31)
    }
  })

  it('AC-013.13: 날짜가 아니면 던진다', () => {
    expect(() => sameDayLastMonth('2026-02-30')).toThrow(RangeError)
  })
})

describe('AC-002.1 isYmd', () => {
  it.each(['2026-10-01', '2026-12-31', '2028-02-29', '1970-01-01'])('%s → 참', (s) => {
    expect(isYmd(s)).toBe(true)
  })

  it.each([
    '2026-02-30', // 없는 날
    '2027-02-29', // 윤년 아님
    '2026-13-01',
    '2026-00-10',
    '2026-10-00',
    '2026-1-5', // 두 자리로 맞춘 글자만
    '20261001',
    ' 2026-10-01',
    '2026-10-01 09:30',
    '',
  ])('%j → 거짓', (s) => {
    expect(isYmd(s)).toBe(false)
  })
})

describe('AC-002.1 isMonth', () => {
  it.each(['2026-01', '2026-10', '2026-12', '1970-01'])('%s → 참', (s) => {
    expect(isMonth(s)).toBe(true)
  })

  it.each([
    '2026-00',
    '2026-13',
    '2026-1', // 두 자리로 맞춘 글자만
    '202610',
    '2026-10-01',
    ' 2026-10',
    '0050-01', // isYmd처럼 100년 앞은 받지 않는다
    '',
  ])('%j → 거짓', (s) => {
    expect(isMonth(s)).toBe(false)
  })
})

describe('AC-002.1 addDays', () => {
  it('10월 1일 하루 전은 9월 30일 (한국 시간에서 하루 밀리지 않는다)', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })

  it('달·해를 넘긴다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-10-24', 100)).toBe('2027-02-01')
    expect(addDays('2026-10-24', 0)).toBe('2026-10-24')
  })

  it('윤년 2월 29일을 지난다', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('잘못된 날짜나 정수가 아닌 날 수는 막는다', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
    expect(() => addDays('2026-10-01', 0.5)).toThrow(RangeError)
  })
})

describe('AC-002.1 diffDays', () => {
  it('b - a를 날 수로 돌려준다', () => {
    expect(diffDays('2026-09-30', '2026-10-01')).toBe(1)
    expect(diffDays('2026-10-01', '2026-09-30')).toBe(-1)
    expect(diffDays('2026-10-24', '2026-10-24')).toBe(0)
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366)
  })
})

describe('AC-002.1 compareYmd', () => {
  it('앞선 날이 작다', () => {
    expect(compareYmd('2026-09-30', '2026-10-01')).toBeLessThan(0)
    expect(compareYmd('2026-10-01', '2026-09-30')).toBeGreaterThan(0)
    expect(compareYmd('2026-10-01', '2026-10-01')).toBe(0)
  })

  it('정렬에 쓸 수 있다', () => {
    expect(['2026-10-01', '2025-12-31', '2026-09-30'].sort(compareYmd)).toEqual([
      '2025-12-31',
      '2026-09-30',
      '2026-10-01',
    ])
  })
})

describe('AC-002.1 weekdayOf', () => {
  it.each([
    ['2026-10-19', 1], // 월
    ['2026-10-24', 6], // 토
    ['2026-10-25', 7], // 일
    ['1970-01-01', 4], // 목
  ])('%s → %i', (ymd, weekday) => {
    expect(weekdayOf(ymd)).toBe(weekday)
  })
})

describe('AC-002.1 weekStartOf', () => {
  it.each([
    ['2026-10-25', '2026-10-19'], // 일요일 → 그 주 월요일
    ['2026-10-19', '2026-10-19'], // 월요일 → 그대로
    ['2026-10-24', '2026-10-19'],
    ['2026-11-01', '2026-10-26'], // 달 넘김
    ['2027-01-01', '2026-12-28'], // 해 넘김
  ])('%s → %s', (ymd, monday) => {
    expect(weekStartOf(ymd)).toBe(monday)
  })
})

describe('AC-002.1 monthOf', () => {
  it("'YYYY-MM'을 돌려준다", () => {
    expect(monthOf('2026-10-24')).toBe('2026-10')
  })

  it('잘못된 날짜는 막는다', () => {
    expect(() => monthOf('2026-02-30')).toThrow(RangeError)
  })
})

describe('AC-002.1 addMonths', () => {
  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', 0, '2026-10'],
    ['2026-10', -12, '2025-10'],
    ['2026-10', -22, '2024-12'],
  ])('%s %+i → %s', (month, n, expected) => {
    expect(addMonths(month, n)).toBe(expected)
  })

  it('잘못된 달이나 정수가 아닌 달 수는 막는다', () => {
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError)
    expect(() => addMonths('2026-1', 1)).toThrow(RangeError)
    expect(() => addMonths('2026-10', 1.5)).toThrow(RangeError)
  })
})

describe('AC-603.1 addMonthsToDay', () => {
  // 기대값은 원본 addMonths 결과다(fixtures/patients/golden/recall-compute.json의 addMonths)
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2100-01-31', 1, '2100-02-28'],
    ['2000-01-31', 1, '2000-02-29'],
    ['2026-08-31', 6, '2027-02-28'],
    ['2026-07-31', 3, '2026-10-31'],
  ] as const)('AC-603.1 말일에 맞춘다: %s + %i달 → %s', (day, n, expected) => {
    expect(addMonthsToDay(day, n)).toBe(expected)
  })

  it.each([
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2026-01-31', -2, '2025-11-30'],
  ] as const)('AC-603.1 해를 넘긴다: %s + %i달 → %s', (day, n, expected) => {
    expect(addMonthsToDay(day, n)).toBe(expected)
  })

  it.each([
    ['2026-03-31', -1, '2026-02-28'],
    ['2024-02-29', -12, '2023-02-28'],
    ['2024-02-29', -36, '2021-02-28'],
    ['2026-11-01', -36, '2023-11-01'],
    ['2026-08-31', -6, '2026-02-28'],
  ] as const)('AC-603.1 음수도 된다: %s + %i달 → %s', (day, n, expected) => {
    expect(addMonthsToDay(day, n)).toBe(expected)
  })

  it('AC-603.1 윤날은 다음 윤년으로 가면 그대로, 아니면 2월 말일이다', () => {
    expect(addMonthsToDay('2024-02-29', 48)).toBe('2028-02-29')
    expect(addMonthsToDay('2024-02-29', 12)).toBe('2025-02-28')
  })

  it('AC-603.1 0달은 그 날 그대로다', () => {
    expect(addMonthsToDay('2026-10-31', 0)).toBe('2026-10-31')
  })

  it('AC-603.1 범위 끝: 9999년 12월까지는 된다', () => {
    expect(addMonthsToDay('9999-11-30', 1)).toBe('9999-12-30')
    expect(addMonthsToDay('9999-12-31', 0)).toBe('9999-12-31')
  })

  // 원본은 10000-01-31 같은 날을 만든다. 우리 날짜는 'YYYY-MM-DD'뿐이라 addMonths처럼 던진다. 부르는 쪽(recall.ts)이 날짜 없음으로 친다
  it.each([
    ['9999-12-31', 1],
    ['9999-07-01', 6],
    ['0100-01-15', -1],
  ] as const)('AC-603.1 네 자리 해를 벗어나면 던진다: %s + %i달', (day, n) => {
    expect(() => addMonthsToDay(day, n)).toThrow(RangeError)
  })

  it.each([['2026-02-30'], ['2026-1-5'], ['10000-01-01'], ['글자'], ['']])('AC-603.1 없는 날은 던진다: %s', (day) => {
    expect(() => addMonthsToDay(day, 1)).toThrow(RangeError)
  })

  it.each([[0.5], [Number.NaN], [Number.POSITIVE_INFINITY], [1e300]])('AC-603.1 쓸 수 없는 달 수는 던진다: %s', (n) => {
    expect(() => addMonthsToDay('2026-01-31', n)).toThrow(RangeError)
  })
})

describe('AC-002.1 monthRange', () => {
  it.each([
    ['2026-02', '2026-02-28'],
    ['2028-02', '2028-02-29'],
    ['2026-04', '2026-04-30'],
    ['2026-12', '2026-12-31'],
  ])('%s → 1일 ~ %s', (month, last) => {
    expect(monthRange(month)).toEqual({ from: `${month}-01`, to: last })
  })
})

describe('AC-002.1 weekRange', () => {
  it('월요일 ~ 일요일', () => {
    expect(weekRange('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(weekRange('2026-12-28')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
  })

  it('월요일이 아니면 막는다', () => {
    expect(() => weekRange('2026-10-20')).toThrow(RangeError)
  })
})

describe('AC-002.1 eachDay', () => {
  it('양 끝을 포함해 하루씩 늘어놓는다', () => {
    expect(eachDay({ from: '2026-09-29', to: '2026-10-02' })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(eachDay({ from: '2026-10-24', to: '2026-10-24' })).toEqual(['2026-10-24'])
    expect(eachDay(monthRange('2026-02'))).toHaveLength(28)
  })

  it('끝이 시작보다 앞이면 빈 목록', () => {
    expect(eachDay({ from: '2026-10-02', to: '2026-10-01' })).toEqual([])
  })
})

describe('AC-002.3 todayInKorea', () => {
  it('UTC 15:30은 한국 다음 날 0:30', () => {
    expect(todayInKorea(new Date('2026-10-24T15:30:00Z'))).toBe('2026-10-25')
  })

  it('UTC 14:59는 한국 같은 날 23:59', () => {
    expect(todayInKorea(new Date('2026-10-24T14:59:59Z'))).toBe('2026-10-24')
  })

  it('해를 넘긴다', () => {
    expect(todayInKorea(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })

  it('인자 없이 부르면 지금 한국 날짜', () => {
    expect(isYmd(todayInKorea())).toBe(true)
  })
})

describe('AC-002.2 excelSerialToYmd', () => {
  it.each([
    [46296, '2026-10-01'],
    [46296.75, '2026-10-01'], // 시각 소수는 버린다
    [25569, '1970-01-01'],
    [0, '1899-12-30'], // 기준일
    [61, '1900-03-01'],
  ])('%d → %s', (serial, ymd) => {
    expect(excelSerialToYmd(serial)).toBe(ymd)
  })

  it.each([NaN, Infinity, -Infinity])('%d → null', (serial) => {
    expect(excelSerialToYmd(serial)).toBeNull()
  })
})

describe('AC-002.2 parseDateCell', () => {
  it.each<[string | number, string]>([
    ['2026-10-01', '2026-10-01'],
    ['2026-1-5', '2026-01-05'],
    ['2026.10.01', '2026-10-01'],
    ['2026.1.5', '2026-01-05'],
    ['2026/10/01', '2026-10-01'],
    ['20261001', '2026-10-01'],
    ['2026-10-01 09:30', '2026-10-01'],
    ['2026-10-01 9:05:30', '2026-10-01'],
    ['2026-10-01T09:30:00', '2026-10-01'],
    ['2026-10-01T09:30:00.123', '2026-10-01'],
    ['  2026-10-01  ', '2026-10-01'],
    ['\t2026/10/01 09:30 ', '2026-10-01'],
    [46296, '2026-10-01'], // 엑셀 숫자 날짜
    [46296.5, '2026-10-01'],
    ['46296', '2026-10-01'], // 숫자 글자
    [' 46296 ', '2026-10-01'],
    [20000, '1954-10-03'], // 엑셀 숫자 날짜 범위 양 끝
    [80000, '2119-01-11'],
  ])('%j → %s', (value, ymd) => {
    expect(parseDateCell(value)).toBe(ymd)
  })

  it.each<[string | number | null | undefined]>([
    ['2026-13-45'],
    ['2026-02-30'],
    ['20261301'],
    [''],
    ['   '],
    [null],
    [undefined],
    ['abc'],
    [5],
    ['5'],
    [19999], // 엑셀 숫자 날짜 범위 밖
    [80001],
    [-46296],
    [NaN],
    [Infinity],
    ['2026-10'],
    ['2026-10/01'], // 구분 글자가 섞임
    ['2026-10-01abc'],
    ['2026-10-01 오후'],
    ['2026-10-01T09:30:00Z'], // 시간대가 붙으면 한국 날짜가 달라질 수 있어 추측하지 않는다
  ])('%j → null', (value) => {
    expect(parseDateCell(value)).toBeNull()
  })
})

describe('AC-002.1 시간대', () => {
  it('PC 시간대가 한국이 아니어도 같은 답을 낸다', () => {
    const run = () => [
      addDays('2026-10-01', -1),
      addDays('2026-12-31', 1),
      weekStartOf('2026-10-25'),
      weekStartOf('2026-11-01'),
      parseDateCell('2026-10-01'),
      parseDateCell('2026-10-01T09:30:00'),
      parseDateCell('20261001'),
      parseDateCell(46296),
      todayInKorea(new Date('2026-10-24T15:30:00Z')),
    ]
    const expected = [
      '2026-09-30',
      '2027-01-01',
      '2026-10-19',
      '2026-10-26',
      '2026-10-01',
      '2026-10-01',
      '2026-10-01',
      '2026-10-01',
      '2026-10-25',
    ]
    // 시간대가 실제로 바뀌었는지 함께 본다(안 바뀌면 이 시험은 아무것도 확인하지 않는다)
    const offset = () => new Date(Date.UTC(2026, 9, 1)).getTimezoneOffset()
    const original = process.env.TZ
    try {
      expect(offset()).toBe(-540)
      expect(run()).toEqual(expected)

      process.env.TZ = 'America/Los_Angeles'
      expect(offset()).toBe(420)
      expect(run()).toEqual(expected)
    } finally {
      process.env.TZ = original
    }
    expect(offset()).toBe(-540)
  })
})
