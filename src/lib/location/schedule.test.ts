import { describe, expect, it } from 'vitest'
import { OPEN_TASKS, buildSchedule, checkTasksDone, daysUntilOpen, toggleTaskDone } from './schedule'

// 개원 일정표(design.md 11절, 시안 TASKS). D = 목표 개원일, 날짜는 lib/analytics/dates.ts addDays

const OPEN_ON = '2027-05-03' // 시안 개원일
const TODAY = '2026-11-22'

const IDS = [
  'contract',
  'loan',
  'design',
  'equipment',
  'construction',
  'power',
  'hiring',
  'promo',
  'xray-prep',
  'open-report',
  'nhis-report',
  'xray-report',
  'training',
  'open',
]

describe('AC-7913.2 개원 일정', () => {
  it('AC-7913.2: 할 일은 시안의 열넷이고 글·날수·차례가 같다', () => {
    expect(OPEN_TASKS.map((t) => [t.daysBefore, t.text, t.note])).toEqual([
      [150, '자리 정하고 계약하기', '특약: 의원 개설 신고가 안 되면 계약을 없던 일로'],
      [140, '대출 상담·받기', ''],
      [130, '인테리어 설계 맡기기', '엑스레이실·물리치료실 자리부터'],
      [120, '장비 고르고 주문하기', '엑스레이는 들어오는 데 오래 걸려요'],
      [90, '인테리어 공사 시작', '보통 8~10주'],
      [60, '전기 용량 늘리기 신청', '한국전력 · 건물 관리사무소'],
      [60, '직원 뽑기 공고', '물리치료사·간호조무사·접수'],
      [30, '간판·홍보물·홈페이지', '홍보할 아파트 차례(후보 자세히)'],
      [30, '방사선 장비 설치 신고 준비', ''],
      [10, '의원 개설 신고(보건소)', ''],
      [7, '요양기관 신고(심평원)', '개설 신고 뒤'],
      [5, '방사선 장비 검사 받고 신고', ''],
      [3, '직원 교육·모의 진료', ''],
      [0, '개원', ''],
    ])
  })

  it('AC-7913.2: 할 일 id는 고정이고 겹치지 않는다(다 함 표시는 id로 저장)', () => {
    expect(OPEN_TASKS.map((t) => t.id)).toEqual(IDS)
    expect(new Set(IDS).size).toBe(14)
  })

  it('AC-7913.2: 법 근거 id는 개설 신고(의료법 33조)·요양기관 신고(국민건강보험법 43조)·방사선 장비 신고(쓰기 3일 전까지)에만 있다', () => {
    const laws = Object.fromEntries(OPEN_TASKS.map((t) => [t.id, t.law]))
    expect(laws['open-report']).toBe('open')
    expect(laws['nhis-report']).toBe('nhis')
    expect(laws['xray-report']).toBe('xray')
    const others = OPEN_TASKS.filter((t) => !['open-report', 'nhis-report', 'xray-report'].includes(t.id))
    expect(others.every((t) => t.law === null)).toBe(true)
  })

  it('AC-7913.2: 개원일에서 거꾸로 센 날짜가 할 일마다 붙는다', () => {
    const rows = buildSchedule(OPEN_ON, TODAY, [])
    expect(rows.map((r) => [r.id, r.on])).toEqual([
      ['contract', '2026-12-04'],
      ['loan', '2026-12-14'],
      ['design', '2026-12-24'],
      ['equipment', '2027-01-03'],
      ['construction', '2027-02-02'],
      ['power', '2027-03-04'],
      ['hiring', '2027-03-04'],
      ['promo', '2027-04-03'],
      ['xray-prep', '2027-04-03'],
      ['open-report', '2027-04-23'],
      ['nhis-report', '2027-04-26'],
      ['xray-report', '2027-04-28'],
      ['training', '2027-04-30'],
      ['open', '2027-05-03'],
    ])
    expect(rows[9]).toMatchObject({ text: '의원 개설 신고(보건소)', law: 'open', daysBefore: 10 })
  })

  it('AC-7913.2: 개원일을 고치면 모두 다시 센다(윤달 넘김 포함)', () => {
    const rows = buildSchedule('2028-03-01', TODAY, [])
    expect(rows.find((r) => r.id === 'training')?.on).toBe('2028-02-27')
    expect(rows.find((r) => r.id === 'xray-report')?.on).toBe('2028-02-25')
    expect(rows.find((r) => r.id === 'open')?.on).toBe('2028-03-01')
  })

  it('AC-7913.2: 오늘보다 앞선 할 일만 지난 것이다(오늘은 지나지 않음)', () => {
    const rows = buildSchedule(OPEN_ON, '2026-12-14', [])
    expect(rows.find((r) => r.id === 'contract')?.past).toBe(true)
    expect(rows.find((r) => r.id === 'loan')?.past).toBe(false)
    expect(rows.filter((r) => r.past).map((r) => r.id)).toEqual(['contract'])
    expect(buildSchedule(OPEN_ON, TODAY, []).some((r) => r.past)).toBe(false)
    expect(buildSchedule(OPEN_ON, '2027-05-04', []).every((r) => r.past)).toBe(true)
  })

  it('AC-7913.2: 다 함 표시는 저장된 id로 붙고 모르는 id는 무시한다', () => {
    const rows = buildSchedule(OPEN_ON, TODAY, ['contract', 'open', 'nope'])
    expect(rows.filter((r) => r.done).map((r) => r.id)).toEqual(['contract', 'open'])
  })

  it('AC-7913.2: 개원일이 날짜 모양이 아니면 할 일 줄이 없고, 오늘이 날짜 모양이 아니면 지난 것이 없다(던지지 않는다)', () => {
    expect(buildSchedule('', TODAY, [])).toEqual([])
    expect(buildSchedule('2027-02-30', TODAY, [])).toEqual([])
    const rows = buildSchedule(OPEN_ON, '', [])
    expect(rows).toHaveLength(14)
    expect(rows.some((r) => r.past)).toBe(false)
  })

  it('AC-7913.2: 개원까지 남은 날을 센다', () => {
    expect(daysUntilOpen(OPEN_ON, TODAY)).toBe(162)
    expect(daysUntilOpen(OPEN_ON, OPEN_ON)).toBe(0)
    expect(daysUntilOpen(OPEN_ON, '2027-05-04')).toBe(-1)
    expect(daysUntilOpen('x', TODAY)).toBeNull()
  })

  it('AC-7913.2: 다 함 표시를 켜고 끄면 할 일 차례대로 겹침 없이 남는다', () => {
    expect(toggleTaskDone([], 'open')).toEqual(['open'])
    expect(toggleTaskDone(['open'], 'contract')).toEqual(['contract', 'open'])
    expect(toggleTaskDone(['contract', 'open'], 'contract')).toEqual(['open'])
    expect(toggleTaskDone(['open'], 'nope')).toEqual(['open'])
    const before = ['open']
    toggleTaskDone(before, 'loan')
    expect(before).toEqual(['open'])
  })

  it('AC-7913.2: 저장된 다 함 표시는 아는 id만 할 일 차례로 한 번씩 남긴다', () => {
    expect(checkTasksDone(['open', 'contract', 'open', 'nope', 3, null])).toEqual(['contract', 'open'])
    for (const raw of [null, undefined, 'open', { open: true }, 1]) expect(checkTasksDone(raw)).toEqual([])
  })
})
