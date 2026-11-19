import { describe, expect, it } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type CalSettings } from '@/types/calendar'
import type { ClinicProfile, DayHours } from '@/types/clinicProfile'
import { mergeClinic, plainDays } from './clinic'

// 예약이 병원 정보를 쓴다(spec clinic-profile REQ-6603, design.md 5절). mergeClinic은 형만 받는 순수 함수다(환자 자료 구역 lib/calendar).
// 이름은 ○○로 가린 가짜다

const CAL: CalSettings = {
  ...DEFAULT_CAL_SETTINGS,
  staff: [
    { id: 'ga', name: '한○○', mark: '가', color: 'blue' },
    { id: 'old', name: '옛○○', mark: '옛', color: 'purple' },
  ],
  openHour: 9,
  closeHour: 18,
  sunday: false,
}

const WEEKDAY = { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 }
const PROFILE: ClinicProfile = {
  displayName: '가짜의원',
  phone: null,
  address: null,
  honorific: '원장님',
  hours: [
    WEEKDAY, // 월
    WEEKDAY, // 화
    null, // 수 휴진
    { open: 540, close: 1110, lunchFrom: 780, lunchTo: 840 }, // 목 18:30까지
    { open: 510, close: 1080, lunchFrom: null, lunchTo: null }, // 금 08:30부터, 점심 없음
    { open: 540, close: 780, lunchFrom: null, lunchTo: null }, // 토
    null, // 일
  ],
  closedDates: ['2026-11-20', '2026-12-25'],
  staff: [
    { id: 'na', name: '윤○○', role: 'staff', mark: '나', color: 'teal', calendar: true },
    { id: 'won', name: '원장님', role: 'doctor', mark: '원', color: 'gray', calendar: false },
    { id: 'ga', name: '한○○', role: 'staff', mark: '가', color: 'navy', calendar: true },
  ],
  logoPath: null,
  emr: 'bit',
}

const plain = (open: number, close: number): DayHours => ({ open: open * 60, close: close * 60, lunchFrom: null, lunchTo: null })

describe('AC-6603.1: 시행자는 병원 정보의 예약에 보이기 사람들(병원 정보 차례)', () => {
  it('AC-6603.1: 병원 정보가 있으면 staff = calendar 참인 사람만, 병원 정보 차례, 예약 시행자 모양(id·이름·표시·색)으로', () => {
    const merged = mergeClinic(CAL, PROFILE)
    expect(merged.staff).toEqual([
      { id: 'na', name: '윤○○', mark: '나', color: 'teal' },
      { id: 'ga', name: '한○○', mark: '가', color: 'navy' },
    ])
    expect(merged.staff.map((s) => Object.keys(s))).toEqual([
      ['id', 'name', 'mark', 'color'],
      ['id', 'name', 'mark', 'color'],
    ])
  })

  it('AC-6603.1: 종류는 예약 설정 그대로다', () => {
    expect(mergeClinic(CAL, PROFILE).kinds).toEqual(CAL.kinds)
  })

  it('AC-6603.1: 병원 정보 줄이 없으면(null) 예약 설정의 시행자·보이는 시간·일요일 그대로다', () => {
    const merged = mergeClinic(CAL, null)
    expect(merged).toMatchObject({ kinds: CAL.kinds, staff: CAL.staff, openHour: 9, closeHour: 18, sunday: false })
  })

  it('AC-6603.1: 예약에 보이기인 사람이 없으면 시행자 목록은 비었다(예약 설정 시행자를 섞지 않는다)', () => {
    const merged = mergeClinic(CAL, { ...PROFILE, staff: PROFILE.staff.map((s) => ({ ...s, calendar: false })) })
    expect(merged.staff).toEqual([])
  })
})

describe('AC-6603.2: 시간 줄·요일 진료시간', () => {
  it('AC-6603.2: 시간 줄은 문 여는 요일의 가장 이른 시작 내림(08:30 → 8시) ~ 가장 늦은 끝 올림(18:30 → 19시)', () => {
    const merged = mergeClinic(CAL, PROFILE)
    expect([merged.openHour, merged.closeHour]).toEqual([8, 19])
  })

  it('AC-6603.2: 요일 진료시간(days)·휴진일(closedDates)은 병원 정보 그대로, 일요일이 휴진이면 sunday 거짓', () => {
    const merged = mergeClinic(CAL, PROFILE)
    expect(merged.days).toEqual(PROFILE.hours)
    expect(merged.closedDates).toEqual(['2026-11-20', '2026-12-25'])
    expect(merged.sunday).toBe(false)
  })

  it('AC-6603.2: 일요일이 문 여는 날이면 sunday 참', () => {
    const hours = [...PROFILE.hours.slice(0, 6), { open: 600, close: 780, lunchFrom: null, lunchTo: null }]
    expect(mergeClinic(CAL, { ...PROFILE, hours }).sunday).toBe(true)
  })

  it('AC-6603.2: 병원 정보가 없으면 days = 월~토 openHour~closeHour·점심 없음, 일요일은 sunday일 때만. closedDates = []', () => {
    expect(mergeClinic(CAL, null).days).toEqual([plain(9, 18), plain(9, 18), plain(9, 18), plain(9, 18), plain(9, 18), plain(9, 18), null])
    expect(mergeClinic(CAL, null).closedDates).toEqual([])
    expect(mergeClinic({ ...CAL, sunday: true }, null).days?.[6]).toEqual(plain(9, 18))
    expect(plainDays(8, 20, false)).toEqual([plain(8, 20), plain(8, 20), plain(8, 20), plain(8, 20), plain(8, 20), plain(8, 20), null])
  })

  it('AC-6603.2: 병원 정보가 없을 때 받은 days·closedDates가 있어도 예약 설정 시간으로 다시 만든다', () => {
    const stale: CalSettings = { ...CAL, days: PROFILE.hours, closedDates: ['2026-11-20'] }
    expect(mergeClinic(stale, null)).toEqual({ ...CAL, days: plainDays(9, 18, false), closedDates: [] })
  })

  it('AC-6603.2: 돌려준 값을 고쳐도 받은 병원 정보·예약 설정은 그대로다', () => {
    const merged = mergeClinic(CAL, PROFILE)
    merged.staff[0]!.name = '바꿈'
    merged.days![0] = null
    merged.closedDates!.push('2027-01-01')
    expect(PROFILE.staff[0]!.name).toBe('윤○○')
    expect(PROFILE.hours[0]).toEqual(WEEKDAY)
    expect(PROFILE.closedDates).toEqual(['2026-11-20', '2026-12-25'])
    const fallback = mergeClinic(CAL, null)
    fallback.staff.push({ id: 'x', name: 'x', mark: 'x', color: 'blue' })
    expect(CAL.staff).toHaveLength(2)
  })
})
