import { describe, expect, it } from 'vitest'
import type { Rival } from '@/types/location'
import { GAP_DAYS, GAP_SLOTS, HOLIDAY_NOTE, LUNCH_NOTE, gapTable, type GapRival } from './hours'

// 진료 시간 빈틈 표(design.md 11절 hours.ts): 요일 7 × 칸 7, 칸 전체에 문을 연 경쟁 의원 수, 0이면 빈틈
// week = 월~일 + 공휴일 8칸, 분(0900 → 540). null 칸 = 그날 문 닫음, week null = 진료 시간 자료 없음
type Cell = [number, number] | null
const h = (hhmm: number) => Math.floor(hhmm / 100) * 60 + (hhmm % 100)
const span = (from: number, to: number): [number, number] => [h(from), h(to)]
const weekOf = (weekday: Cell, sat: Cell = null, sun: Cell = null, holiday: Cell = null): Cell[] => [
  weekday, weekday, weekday, weekday, weekday, sat, sun, holiday,
]
const ortho = (week: Cell[] | null): GapRival => ({ kind: 'ortho', week })
const zeros = () => Array.from({ length: 7 }, () => [0, 0, 0, 0, 0, 0, 0])

describe('AC-7909.3 진료 시간 빈틈 표', () => {
  it('AC-7909.3: 칸은 아침 8~9 · 오전 9~13 · 점심 13~14 · 오후 14~18 · 저녁 18~19 · 저녁 19~20 · 밤 20~21 일곱이고 요일은 월~일 일곱이다', () => {
    expect(GAP_SLOTS.map((s) => [s.from, s.to, s.label])).toEqual([
      [480, 540, '아침 8~9시'],
      [540, 780, '오전 9~13시'],
      [780, 840, '점심 13~14시'],
      [840, 1080, '오후 14~18시'],
      [1080, 1140, '저녁 18~19시'],
      [1140, 1200, '저녁 19~20시'],
      [1200, 1260, '밤 20~21시'],
    ])
    expect(GAP_SLOTS.map((s) => s.id)).toEqual(['early', 'morning', 'lunch', 'afternoon', 'evening', 'late', 'night'])
    expect(GAP_DAYS).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })

  it('AC-7909.3: 표는 늘 7 × 7이고 경쟁 의원이 없으면 모든 칸이 0(빈틈)이다', () => {
    const t = gapTable([])
    expect(t.counts).toEqual(zeros())
    expect(t.counted).toBe(0)
    expect(t.noHours).toBe(0)
  })

  it('AC-7909.3: 칸 전체에 문을 열어야 센다(일찍 닫거나 늦게 열면 그 칸은 안 셈, 끝 시각이 같으면 셈)', () => {
    // 평일 8:30~18:30 → 아침 8~9는 늦게 열어 안 셈, 저녁 18~19는 일찍 닫아 안 셈
    const a = gapTable([ortho(weekOf(span(830, 1830)))])
    expect(a.counts.map((row) => row[0])).toEqual([0, 1, 1, 1, 0, 0, 0])
    // 평일 8:00~18:00 → 아침 8~9 셈, 오후 14~18은 18:00에 닫아도 셈
    const b = gapTable([ortho(weekOf(span(800, 1800)))])
    expect(b.counts.map((row) => row[2])).toEqual([1, 1, 1, 1, 0, 0, 0])
    // 오전 칸은 9~13 전체라 9:30에 열면 안 셈
    const c = gapTable([ortho(weekOf(span(930, 2100)))])
    expect(c.counts.map((row) => row[4])).toEqual([0, 0, 1, 1, 1, 1, 1])
  })

  it('AC-7909.3: 요일마다 따로 센다(토요일 오전만·일요일 닫음·야간 요일)', () => {
    const week: Cell[] = [span(900, 2000), span(900, 1800), span(900, 2100), span(900, 1800), span(900, 1800), span(900, 1300), null, null]
    const t = gapTable([ortho(week), ortho(weekOf(span(900, 1800), span(900, 1300)))])
    expect(t.counts).toEqual([
      [0, 0, 0, 0, 0, 0, 0], // 아침 8~9
      [2, 2, 2, 2, 2, 2, 0], // 오전 9~13
      [2, 2, 2, 2, 2, 0, 0], // 점심 13~14
      [2, 2, 2, 2, 2, 0, 0], // 오후 14~18
      [1, 0, 1, 0, 0, 0, 0], // 저녁 18~19
      [1, 0, 1, 0, 0, 0, 0], // 저녁 19~20
      [0, 0, 1, 0, 0, 0, 0], // 밤 20~21
    ])
    expect(t.counted).toBe(2)
  })

  it('AC-7909.3: 점심 쉼은 자료에 없어 연 것으로 세고, 점심 칸에 모름 표시와 화면 글이 있다', () => {
    const t = gapTable([ortho(weekOf(span(900, 1800)))])
    expect(t.counts[2]).toEqual([1, 1, 1, 1, 1, 0, 0])
    expect(GAP_SLOTS.filter((s) => s.lunchUnknown).map((s) => s.id)).toEqual(['lunch'])
    // requirements '화면 글 기본값'(후보 자세히 › 진료 시간 빈틈 아래)
    expect(LUNCH_NOTE).toBe('점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요.')
    expect(`${LUNCH_NOTE} ${HOLIDAY_NOTE}`).toBe(
      '점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요. 공휴일 진료는 의원마다 그때그때 달라 세지 않아요.',
    )
  })

  it('AC-7909.3: 공휴일 칸(8번째)은 세지 않는다', () => {
    const t = gapTable([ortho(weekOf(null, null, null, span(900, 1800)))])
    expect(t.counts).toEqual(zeros())
    expect(t.counted).toBe(1)
    expect(HOLIDAY_NOTE).toBe('공휴일 진료는 의원마다 그때그때 달라 세지 않아요.')
  })

  it('AC-7909.3: 한의원은 세지 않고, 진료 시간 자료가 없는 의원은 noHours로 따로 센다', () => {
    const t = gapTable([
      { kind: 'korean', week: weekOf(span(900, 1800)) },
      { kind: 'pain', week: weekOf(span(900, 1800)) },
      { kind: 'rehab', week: weekOf(span(900, 1800)) },
      ortho(null),
    ])
    expect(t.counts[1]).toEqual([2, 2, 2, 2, 2, 0, 0])
    expect(t.counted).toBe(2)
    expect(t.noHours).toBe(1)
  })

  it('AC-7909.3: 여는 시각이 닫는 시각보다 늦은 틀린 칸은 어느 칸에도 세지 않는다', () => {
    const t = gapTable([ortho(weekOf([h(1800), h(900)]))])
    expect(t.counts).toEqual(zeros())
  })

  it('AC-7909.3: 그날 값의 경쟁 의원(types/location.ts Rival) 그대로 넣어 센다', () => {
    const full: Rival = {
      name: '예시정형외과의원',
      kind: 'ortho',
      doctors: 2,
      therapists: null,
      mri: true,
      ct: null,
      openedYear: 2020,
      distM: 300,
      sameBuilding: false,
      week: weekOf(span(900, 1800)),
      eswt: null,
    }
    const rivals: Rival[] = [full, { ...full, kind: 'korean' }, { ...full, week: null }]
    const t = gapTable(rivals)
    expect(t.counts[1]).toEqual([1, 1, 1, 1, 1, 0, 0])
    expect([t.counted, t.noHours]).toEqual([1, 1])
  })
})
