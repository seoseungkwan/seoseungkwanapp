import { describe, expect, it } from 'vitest'
import { customRange, dayLabel, presetRange, rangeLabel } from './periods'

// F/U 기간 단추(AC-611.1, 목업 fuRange·rangeLabel). 주는 월~일이다(docs/mockups/patients/README.md)
describe('presetRange', () => {
  it('AC-611.1 내일은 오늘 다음 날 하루다', () => {
    expect(presetRange('tomorrow', '2026-11-04')).toEqual({ from: '2026-11-05', to: '2026-11-05' })
  })

  it('AC-611.1 내일: 월말·연말을 넘긴다', () => {
    expect(presetRange('tomorrow', '2026-10-31')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
    expect(presetRange('tomorrow', '2026-12-31')).toEqual({ from: '2027-01-01', to: '2027-01-01' })
  })

  it('AC-611.1 이번 주·다음 주는 월~일이다', () => {
    expect(presetRange('thisWeek', '2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(presetRange('nextWeek', '2026-11-04')).toEqual({ from: '2026-11-09', to: '2026-11-15' })
  })

  it('AC-611.1 일요일은 그 주의 끝이다: 이번 주는 지난 월요일부터, 다음 주는 내일부터', () => {
    expect(presetRange('thisWeek', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(presetRange('nextWeek', '2026-11-01')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })

  it('AC-611.1 월요일은 그 주의 처음이다', () => {
    expect(presetRange('thisWeek', '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })

  it('AC-611.1 주가 월말을 걸쳐도 이어진다', () => {
    expect(presetRange('thisWeek', '2026-10-28')).toEqual({ from: '2026-10-26', to: '2026-11-01' })
    expect(presetRange('nextWeek', '2026-10-28')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
  })
})

describe('customRange', () => {
  it('AC-611.1 직접 기간은 고른 그대로다', () => {
    expect(customRange('2026-11-05', '2026-11-11')).toEqual({ from: '2026-11-05', to: '2026-11-11' })
  })

  it('AC-611.1 끝이 시작보다 앞이면 시작 하루다(목업 fuRange)', () => {
    expect(customRange('2026-11-05', '2026-11-01')).toEqual({ from: '2026-11-05', to: '2026-11-05' })
  })
})

describe('dayLabel·rangeLabel', () => {
  it('AC-611.1 날짜는 월·일(요일)로 보인다', () => {
    expect(dayLabel('2026-11-05')).toBe('11월 5일 (목)')
    expect(dayLabel('2026-11-01')).toBe('11월 1일 (일)')
    expect(dayLabel('2026-11-02')).toBe('11월 2일 (월)')
  })

  it('AC-611.1 날짜가 아닌 값은 던지지 않고 그대로 돌려준다(그리면서 던지면 전체 오류 화면으로 간다)', () => {
    expect(dayLabel('0002-11-02')).toBe('0002-11-02')
    expect(dayLabel('')).toBe('')
    expect(dayLabel('2026-02-30')).toBe('2026-02-30')
  })

  it('AC-611.1 기간 글: 하루면 그 날, 여러 날이면 시작 ~ 끝', () => {
    expect(rangeLabel({ from: '2026-11-05', to: '2026-11-05' })).toBe('11월 5일 (목)')
    expect(rangeLabel({ from: '2026-11-02', to: '2026-11-08' })).toBe('11월 2일 (월) ~ 11월 8일 (일)')
  })
})
