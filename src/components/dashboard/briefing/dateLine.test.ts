import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dateLine } from './dateLine'

// 대시보드 맨 위 날짜 줄 글자 (tab-frame REQ-306 AC-306.1, design.md '대시보드 짜임', 메모 §3 '날짜 줄').
// "{월}월 {일}일 {요일}요일" + 그 달 마지막 날이면 덧말 "이번 달 마지막 날". 날짜·요일 계산은 lib/analytics/dates.ts

const SOURCE = readFileSync(fileURLToPath(new URL('./dateLine.ts', import.meta.url)), 'utf8')

describe('dateLine: 날짜 줄 글자 (AC-306.1)', () => {
  it('AC-306.1: 보통 날은 "{월}월 {일}일 {요일}요일"이고 덧말이 없다', () => {
    expect(dateLine('2026-10-29')).toEqual({ date: '10월 29일 목요일', note: null })
    expect(dateLine('2026-11-02')).toEqual({ date: '11월 2일 월요일', note: null })
    expect(dateLine('2026-03-01')).toEqual({ date: '3월 1일 일요일', note: null })
    expect(dateLine('2026-10-30')).toEqual({ date: '10월 30일 금요일', note: null }) // 마지막 날 하루 전
  })

  it('AC-306.1: 요일 이름 일곱(월~일) — 월요일부터 일요일까지 하루씩', () => {
    const week = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
    expect(week.map((d) => dateLine(d).date.split(' ')[2])).toEqual(['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'])
  })

  it('AC-306.1: 그 달의 마지막 날이면 덧말 "이번 달 마지막 날" — 31일·30일 달', () => {
    expect(dateLine('2026-10-31')).toEqual({ date: '10월 31일 토요일', note: '이번 달 마지막 날' })
    expect(dateLine('2026-11-30')).toEqual({ date: '11월 30일 월요일', note: '이번 달 마지막 날' })
    expect(dateLine('2026-04-30')).toEqual({ date: '4월 30일 목요일', note: '이번 달 마지막 날' })
  })

  it('AC-306.1: 2월 — 평년은 28일이 마지막 날, 윤년은 28일이 보통 날이고 29일이 마지막 날', () => {
    expect(dateLine('2026-02-28')).toEqual({ date: '2월 28일 토요일', note: '이번 달 마지막 날' })
    expect(dateLine('2028-02-28')).toEqual({ date: '2월 28일 월요일', note: null })
    expect(dateLine('2028-02-29')).toEqual({ date: '2월 29일 화요일', note: '이번 달 마지막 날' })
  })

  it('AC-306.1: 연말 — 12월 31일은 마지막 날, 다음 날 1월 1일은 보통 날', () => {
    expect(dateLine('2026-12-31')).toEqual({ date: '12월 31일 목요일', note: '이번 달 마지막 날' })
    expect(dateLine('2027-01-01')).toEqual({ date: '1월 1일 금요일', note: null })
  })

  it("AC-306.1: 'YYYY-MM-DD'가 아니거나 없는 날이면 dates.ts처럼 RangeError", () => {
    for (const bad of ['2026-02-30', '2026-13-01', '2026-10-1', '10월 31일', '']) expect(() => dateLine(bad), bad).toThrow(RangeError)
  })

  it('AC-306.1: 날짜·요일 계산은 lib/analytics/dates.ts를 쓴다 — Date·지역 시간 메서드를 쓰지 않는다', () => {
    expect(SOURCE).toMatch(/from '@\/lib\/analytics\/dates'/)
    const code = SOURCE.replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bnew Date\b|\bDate\.|\.get(?:UTC)?(?:Day|Date|Month|FullYear)\(/)
  })
})
