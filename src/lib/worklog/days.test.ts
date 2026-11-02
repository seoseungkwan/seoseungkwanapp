import { afterEach, describe, expect, it } from 'vitest'
import { clampToToday, dayAfterRollover, nextDay, previousDay, savedTimeText, sheetDateText } from './days'

// 날짜 이동·자정 넘김·날짜 칸 글자 (REQ-002)
const TODAY = '2026-10-28'

describe('sheetDateText', () => {
  it('AC-002.7: 날짜 칸은 2026/10/28 수 모양이다', () => {
    expect(sheetDateText('2026-10-28')).toBe('2026/10/28 수')
  })

  it.each([
    ['2026-10-26', '2026/10/26 월'],
    ['2026-10-27', '2026/10/27 화'],
    ['2026-10-28', '2026/10/28 수'],
    ['2026-10-29', '2026/10/29 목'],
    ['2026-10-30', '2026/10/30 금'],
    ['2026-10-31', '2026/10/31 토'],
    ['2026-11-01', '2026/11/01 일'],
  ])('AC-002.7: 요일 일곱 개 %s', (ymd, text) => {
    expect(sheetDateText(ymd)).toBe(text)
  })
})

describe('previousDay', () => {
  it.each([
    ['2026-10-28', '2026-10-27'],
    ['2026-11-01', '2026-10-31'],
    ['2026-01-01', '2025-12-31'],
    ['2026-03-01', '2026-02-28'],
    ['2024-03-01', '2024-02-29'],
  ])('AC-002.8: %s의 전날은 %s(달·해 넘김, 윤년)', (ymd, expected) => {
    expect(previousDay(ymd)).toBe(expected)
  })
})

describe('nextDay', () => {
  it.each([
    ['2026-10-27', '2026-10-28'],
    ['2026-09-30', '2026-10-01'],
    ['2025-12-31', '2026-01-01'],
    ['2026-02-28', '2026-03-01'],
    ['2024-02-28', '2024-02-29'],
    ['2024-02-29', '2024-03-01'],
  ])('AC-002.8: %s의 다음 날은 %s(달·해 넘김, 윤년)', (ymd, expected) => {
    expect(nextDay(ymd, TODAY)).toBe(expected)
  })

  it('AC-002.8: 오늘의 다음 날은 없다', () => {
    expect(nextDay(TODAY, TODAY)).toBeNull()
  })

  it('AC-002.8: 오늘보다 뒤인 날의 다음 날도 없다', () => {
    expect(nextDay('2026-10-29', TODAY)).toBeNull()
  })

  it('AC-002.8: 일요일을 건너뛰지 않는다(토요일의 다음 날은 일요일, 월요일의 전날도 일요일)', () => {
    expect(sheetDateText('2026-10-31')).toBe('2026/10/31 토')
    expect(nextDay('2026-10-31', '2026-11-02')).toBe('2026-11-01')
    expect(sheetDateText('2026-11-01')).toBe('2026/11/01 일')
    expect(nextDay('2026-11-01', '2026-11-02')).toBe('2026-11-02')
    expect(previousDay('2026-11-02')).toBe('2026-11-01')
    expect(previousDay('2026-11-01')).toBe('2026-10-31')
  })

  it('AC-002.8: 휴일을 건너뛰지 않는다(신정·성탄절)', () => {
    expect(nextDay('2025-12-31', '2026-01-02')).toBe('2026-01-01')
    expect(previousDay('2026-01-02')).toBe('2026-01-01')
    expect(nextDay('2026-12-24', '2026-12-26')).toBe('2026-12-25')
    expect(previousDay('2026-12-26')).toBe('2026-12-25')
  })
})

describe('clampToToday', () => {
  it('AC-002.8: 오늘이거나 지난 날은 그대로다', () => {
    expect(clampToToday(TODAY, TODAY)).toBe(TODAY)
    expect(clampToToday('2026-10-27', TODAY)).toBe('2026-10-27')
    expect(clampToToday('2020-01-02', TODAY)).toBe('2020-01-02')
  })

  it('AC-002.8: 오늘보다 뒤인 날은 오늘로 바꾼다', () => {
    expect(clampToToday('2026-10-29', TODAY)).toBe(TODAY)
    expect(clampToToday('2030-01-01', TODAY)).toBe(TODAY)
  })

  it.each(['', 'abc', '2026-13-01', '2026-02-30', '2025-02-29', '2026-1-5', '2026/10/01'])(
    'AC-002.8: 날짜 모양이 아닌 "%s"는 오늘로 바꾼다',
    (input) => {
      expect(clampToToday(input, TODAY)).toBe(TODAY)
    },
  )
})

describe('dayAfterRollover', () => {
  it('AC-002.9: 옛 오늘을 보고 있었으면 새 오늘로 옮긴다', () => {
    expect(dayAfterRollover('2026-10-28', '2026-10-28', '2026-10-29')).toBe('2026-10-29')
  })

  it('AC-002.9: 달을 넘겨도 옛 오늘을 보고 있었으면 새 오늘로 옮긴다', () => {
    expect(dayAfterRollover('2026-10-31', '2026-10-31', '2026-11-01')).toBe('2026-11-01')
  })

  it('AC-002.9: 지난 날을 보고 있었으면 그대로다', () => {
    expect(dayAfterRollover('2026-10-20', '2026-10-28', '2026-10-29')).toBe('2026-10-20')
  })
})

describe('savedTimeText', () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('저장 시각은 한국 시각 시:분이다', () => {
    expect(savedTimeText(new Date('2026-10-28T05:05:00Z'))).toBe('14:05')
  })

  it('UTC 15:05는 한국 자정 넘어 00:05다', () => {
    expect(savedTimeText(new Date('2026-10-28T15:05:00Z'))).toBe('00:05')
  })

  it('자정은 24:00이 아니라 00:00이다', () => {
    expect(savedTimeText(new Date('2026-10-28T15:00:00Z'))).toBe('00:00')
  })

  it('PC 시간대가 달라도 한국 시각이다', () => {
    process.env.TZ = 'America/New_York'
    expect(savedTimeText(new Date('2026-10-28T05:05:00Z'))).toBe('14:05')
  })
})
