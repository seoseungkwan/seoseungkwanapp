import { describe, expect, it } from 'vitest'
import { addDays, diffDays } from '@/lib/analytics/dates'
import { RECALL_DEFAULTS, type RecallHistory, type RecallRule } from '@/lib/patients/recall'
import { FOLLOWUP_DAYS, MAX_PIECE_DAYS, followupPlan, recallPlan, type Range } from './plan'

// 읽을 조각 정하기(AC-604.2)

const history = (readThrough: string | null): RecallHistory => ({ from: readThrough ? '2025-01-01' : null, readThrough, records: [] })
const days = (range: Range) => diffDays(range.from, range.to) + 1

describe('followupPlan', () => {
  it('AC-2401.1 상수: 30일, 조각은 31일까지', () => {
    expect(FOLLOWUP_DAYS).toBe(30)
    expect(MAX_PIECE_DAYS).toBe(31)
  })

  it('AC-2401.1 오늘이 월초: 오늘 포함 30일을 조각 하나로', () => {
    expect(followupPlan('2026-11-02')).toEqual([{ from: '2026-10-04', to: '2026-11-02' }])
  })

  it('AC-2401.1 오늘이 월말', () => {
    expect(followupPlan('2026-10-31')).toEqual([{ from: '2026-10-02', to: '2026-10-31' }])
  })

  it('AC-2401.1 윤년 2월을 지나도 30일이다', () => {
    expect(followupPlan('2028-03-01')).toEqual([{ from: '2028-02-01', to: '2028-03-01' }])
  })

  it.each(['2026-01-01', '2026-02-28', '2026-03-31', '2026-12-31', '2028-02-29'])('AC-2401.1 어느 날이든 조각 하나에 오늘 포함 30일 (%s)', (today) => {
    const plan = followupPlan(today)
    expect(plan).toEqual([{ from: addDays(today, -29), to: today }])
    expect(days(plan[0])).toBe(30)
  })
})

describe('recallPlan', () => {
  it('AC-2401.2 F/U 기간을 줄여도 정기 주사는 그대로 달 조각이다(처음 여덟 달 · 이어 읽기 두 달)', () => {
    expect(recallPlan(history(null), RECALL_DEFAULTS, '2026-11-02')).toHaveLength(8)
    expect(recallPlan(history(null), RECALL_DEFAULTS, '2026-11-02')[0]).toEqual({ from: '2026-04-01', to: '2026-04-30' })
    expect(recallPlan(history('2026-10-15'), RECALL_DEFAULTS, '2026-11-02')).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-02' },
    ])
  })

  it('AC-604.2 처음: 켠 규칙 중 가장 긴 간격 + 1개월 전 달의 1일부터 오늘까지 달 조각', () => {
    expect(recallPlan(history(null), RECALL_DEFAULTS, '2026-11-02')).toEqual([
      { from: '2026-04-01', to: '2026-04-30' },
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-06-01', to: '2026-06-30' },
      { from: '2026-07-01', to: '2026-07-31' },
      { from: '2026-08-01', to: '2026-08-31' },
      { from: '2026-09-01', to: '2026-09-30' },
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-02' },
    ])
  })

  it('AC-604.2 오늘이 월말: 말일 맞춤으로 시작 달을 잡고 마지막 조각은 말일까지', () => {
    const plan = recallPlan(history(null), RECALL_DEFAULTS, '2026-09-30')
    expect(plan[0]).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(plan[plan.length - 1]).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(plan).toHaveLength(8)
  })

  it('AC-604.2 윤년 2월은 29일까지', () => {
    expect(recallPlan(history(null), RECALL_DEFAULTS, '2028-09-30')[0]).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('AC-604.2 오늘이 월초 1일: 마지막 조각은 하루', () => {
    const plan = recallPlan(history(null), RECALL_DEFAULTS, '2026-11-01')
    expect(plan[0].from).toBe('2026-04-01')
    expect(plan[plan.length - 1]).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })

  it('AC-604.2 해를 넘겨도 달마다 나눈다', () => {
    const plan = recallPlan(history(null), RECALL_DEFAULTS, '2027-01-15')
    expect(plan[0]).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(plan[plan.length - 2]).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(plan[plan.length - 1]).toEqual({ from: '2027-01-01', to: '2027-01-15' })
  })

  it('AC-604.2 꺼 둔 규칙의 간격은 보지 않는다', () => {
    const rules: RecallRule[] = RECALL_DEFAULTS.map((rule) => ({ ...rule, enabled: rule.id === 'vitamin-d' }))
    expect(recallPlan(history(null), rules, '2026-11-02')[0].from).toBe('2026-07-01')
  })

  it('AC-604.2 켠 규칙이 없으면 처음에는 읽을 것이 없다', () => {
    const rules: RecallRule[] = RECALL_DEFAULTS.map((rule) => ({ ...rule, enabled: false }))
    expect(recallPlan(history(null), rules, '2026-11-02')).toEqual([])
  })

  it('AC-604.2 이어 읽기: 마지막으로 읽은 날이 든 달의 1일부터(그 달을 다시 읽는다)', () => {
    expect(recallPlan(history('2026-10-15'), RECALL_DEFAULTS, '2026-11-02')).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-02' },
    ])
  })

  it('AC-604.2 이어 읽기: 이번 달에 이미 읽었으면 이번 달 조각 하나', () => {
    expect(recallPlan(history('2026-11-02'), RECALL_DEFAULTS, '2026-11-02')).toEqual([{ from: '2026-11-01', to: '2026-11-02' }])
    expect(recallPlan(history('2026-11-01'), RECALL_DEFAULTS, '2026-11-01')).toEqual([{ from: '2026-11-01', to: '2026-11-01' }])
  })

  it('AC-604.2 이어 읽기: 달의 말일에 읽었어도 그 달부터 다시 읽는다', () => {
    expect(recallPlan(history('2026-10-31'), RECALL_DEFAULTS, '2026-11-01')).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: '2026-11-01' },
    ])
  })

  it('AC-604.2 이어 읽기: 해를 넘어도 이어진다', () => {
    expect(recallPlan(history('2026-12-20'), RECALL_DEFAULTS, '2027-01-05')).toEqual([
      { from: '2026-12-01', to: '2026-12-31' },
      { from: '2027-01-01', to: '2027-01-05' },
    ])
  })

  it('AC-604.2 마지막으로 읽은 날이 오늘보다 뒤면(PC 시계가 바뀜) 오늘이 든 달만 읽는다', () => {
    expect(recallPlan(history('2026-12-20'), RECALL_DEFAULTS, '2026-11-02')).toEqual([{ from: '2026-11-01', to: '2026-11-02' }])
  })

  it('AC-604.2 쌓아 두는 36개월보다 오래됐으면 그 앞은 읽지 않는다(어차피 지운다)', () => {
    const plan = recallPlan(history('2020-03-15'), RECALL_DEFAULTS, '2026-11-02')
    expect(plan[0]).toEqual({ from: '2023-11-01', to: '2023-11-30' })
    expect(plan[plan.length - 1]).toEqual({ from: '2026-11-01', to: '2026-11-02' })
    expect(plan).toHaveLength(37)
  })

  it('AC-604.2 조각은 모두 31일 이하이고 빈틈이 없다', () => {
    const plan = recallPlan(history(null), RECALL_DEFAULTS, '2026-08-31')
    plan.forEach((range, index) => {
      expect(days(range), `조각 ${index}`).toBeLessThanOrEqual(MAX_PIECE_DAYS)
      if (index > 0) expect(range.from, `조각 ${index}`).toBe(addDays(plan[index - 1].to, 1))
    })
  })
})
