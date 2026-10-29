import { afterEach, describe, expect, it } from 'vitest'
import { todayInKorea } from '@/lib/analytics/dates'
import { koreanDateTitle } from './todayTitle'

// 대시보드 제목의 날짜 글자 (REQ-009, design.md '대시보드'). 화면 제목은 "오늘" + 이 값.
// 날짜 계산은 dates.ts 한 곳(weekdayOf·todayInKorea) → 여기서는 글자 꼴만 만든다
describe('koreanDateTitle', () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('AC-009.1: "2026년 10월 29일 (목)" 꼴 — 월·일은 앞 0 없이', () => {
    expect(koreanDateTitle('2026-10-29')).toBe('2026년 10월 29일 (목)')
    expect(koreanDateTitle('2026-10-28')).toBe('2026년 10월 28일 (수)')
    expect(koreanDateTitle('2026-01-05')).toBe('2026년 1월 5일 (월)')
    expect(koreanDateTitle('2027-01-01')).toBe('2027년 1월 1일 (금)')
  })

  it('AC-009.1: 요일 7개가 모두 맞다(월~일)', () => {
    const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
    expect(week.map((d) => koreanDateTitle(d).match(/\((.)\)$/)?.[1])).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })

  it("AC-009.1: 영문 글자가 없다('TODAY'·'Thu' 같은 영문 표기 없음)", () => {
    for (const d of ['2026-10-26', '2026-10-29', '2026-11-01', '2026-12-31']) expect(koreanDateTitle(d)).not.toMatch(/[A-Za-z]/)
  })

  it("AC-009.1: 'YYYY-MM-DD'가 아니거나 없는 날이면 dates.ts처럼 RangeError", () => {
    expect(() => koreanDateTitle('2026-02-30')).toThrow(RangeError)
    expect(() => koreanDateTitle('2026-10-29T09:00')).toThrow(RangeError)
    expect(() => koreanDateTitle('')).toThrow(RangeError)
  })

  it('AC-009.1: todayInKorea와 이으면 서버 시간대가 UTC여도 한국 날짜다(한국 자정 경계)', () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    expect(koreanDateTitle(todayInKorea(new Date('2026-10-28T15:00:00Z')))).toBe('2026년 10월 29일 (목)')
    expect(koreanDateTitle(todayInKorea(new Date('2026-10-28T14:59:59Z')))).toBe('2026년 10월 28일 (수)')
  })
})
