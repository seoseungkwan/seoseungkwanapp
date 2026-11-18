import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_HOURS, type DayHours } from '@/types/clinicProfile'
import { calendarRange, clockText, hoursText, phoneText } from './format'

// 병원 정보 표시 도우미(spec clinic-profile design.md 2절, TASK-2). 순수 함수라 네트워크·React·supabase를 쓰지 않는다.
// 전화·진료시간은 모두 지어낸 값이다

const day = (open: number, close: number, lunchFrom: number | null = null, lunchTo: number | null = null): DayHours => ({ open, close, lunchFrom, lunchTo })
const week = (...days: DayHours[]): DayHours[] => days

describe('AC-6605.1 전화 글(phoneText)', () => {
  it.each([
    ['021234567', '02-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['0311234567', '031-123-4567'],
    ['03112345678', '031-1234-5678'],
    ['01012345678', '010-1234-5678'],
    ['07012345678', '070-1234-5678'],
    ['05051234567', '0505-123-4567'],
  ])('AC-6605.1: %s → %s', (digits, text) => {
    expect(phoneText(digits)).toBe(text)
  })

  it('AC-6605.1: 비었으면 빈 글자, 모양을 모르면 받은 숫자 그대로다', () => {
    expect(phoneText(null)).toBe('')
    expect(phoneText('')).toBe('')
    expect(phoneText('123456789')).toBe('123456789')
  })
})

describe('AC-6605.1 진료시간 글(hoursText)', () => {
  it('AC-6605.1: 기본 진료시간은 "평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진"이다', () => {
    expect(hoursText(DEFAULT_HOURS)).toBe('평일 09:00~18:00(점심 13:00~14:00), 토 09:00~13:00, 일·공휴일 휴진')
  })

  it('AC-6605.1: 월~금이 같지 않으면 같은 시간끼리 묶는다(셋 넘게 이어지면 ~, 아니면 ·). 휴진 요일은 끝에 공휴일과 함께', () => {
    const weekday = day(540, 1080, 780, 840)
    const friday = day(540, 1020)
    expect(hoursText(week(weekday, weekday, weekday, weekday, friday, null, null))).toBe(
      '월~목 09:00~18:00(점심 13:00~14:00), 금 09:00~17:00, 토·일·공휴일 휴진',
    )
    expect(hoursText(week(weekday, friday, weekday, friday, weekday, friday, null))).toBe(
      '월·수·금 09:00~18:00(점심 13:00~14:00), 화·목·토 09:00~17:00, 일·공휴일 휴진',
    )
  })

  it('AC-6605.1: 일곱 요일이 다 같으면 "매일"이고 휴진 글이 없다. 문 여는 날이 없으면 빈 글자(문구를 그대로 둔다)', () => {
    const all = day(480, 1440)
    expect(hoursText(week(all, all, all, all, all, all, all))).toBe('매일 08:00~24:00')
    expect(hoursText(week(null, null, null, null, null, null, null))).toBe('')
  })

  it('AC-6605.1: 시각은 두 자리 시:분이다', () => {
    expect(clockText(0)).toBe('00:00')
    expect(clockText(550)).toBe('09:10')
    expect(clockText(1440)).toBe('24:00')
  })
})

describe('AC-6603.2 예약 시간 줄(calendarRange)', () => {
  it('AC-6603.2: 문 여는 요일의 가장 이른 시작을 정시로 내리고, 가장 늦은 끝을 정시로 올린다', () => {
    expect(calendarRange(DEFAULT_HOURS)).toEqual({ openHour: 9, closeHour: 18 })
    expect(calendarRange(week(day(550, 1090), day(510, 1000), null, null, null, day(600, 1210), null))).toEqual({ openHour: 8, closeHour: 21 })
  })

  it('AC-6603.2: 휴진 요일은 보지 않고, 문 여는 날이 없으면 8~20이다', () => {
    expect(calendarRange(week(null, null, null, null, null, null, day(300, 1440)))).toEqual({ openHour: 5, closeHour: 24 })
    expect(calendarRange(week(null, null, null, null, null, null, null))).toEqual({ openHour: 8, closeHour: 20 })
  })
})

describe('TASK-2 순수 함수 울타리', () => {
  it('AC-6603.2·AC-6605.1: format.ts는 React·supabase·저장소·네트워크를 부르지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/clinic/format.ts'), 'utf8')
    for (const word of ['react', 'supabase', '@/lib/storage', 'fetch(', 'localStorage', 'console.']) expect(source, word).not.toContain(word)
  })
})
