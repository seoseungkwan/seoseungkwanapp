import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RxDetailPoint } from '@/components/stats/view'
import { BUCKET_NAME, comparedNote, comparisonAt, detailNote, GRAIN_NAME, longLabel, tickLabel } from './trendLabels'

// 그래프 글 함수 (treatment-trend REQ-1209·1207·1201, design.md '화면' trendLabels.ts). 처방 추세에서 글자 그대로 옮겼다.
// 칸 점은 이 파일 안에서만 지은 가짜다

const TODAY = '2026-11-13'

function point(start: string, end: string, extra: Partial<RxDetailPoint> = {}): RxDetailPoint {
  return { code: 'RA', start, end, label: start, partial: false, count: 10, newCount: 4, returningCount: 6, quantity: null, amount: null, covered: true, ...extra }
}

describe('AC-1209.2: 칸 단위와 칸 글자', () => {
  it('AC-1209.2: 7·30일은 일, 90일은 주, 12개월은 달이다', () => {
    expect(GRAIN_NAME).toEqual({ '7d': '일', '30d': '일', '90d': '주', '12m': '달' })
  })

  it('AC-1209.2: 막대 아래 눈금 — 달은 n월, 주는 세 칸마다, 일은 7칸까지 모두·그보다 많으면 7칸마다 월.일', () => {
    const nov = point('2026-11-01', '2026-11-13')
    expect(tickLabel(nov, 0, 12, 'month')).toBe('11월')
    expect(tickLabel(nov, 5, 12, 'month')).toBe('11월')
    const week = point('2026-11-02', '2026-11-08')
    expect([0, 1, 2, 3].map((i) => tickLabel(week, i, 13, 'week'))).toEqual(['11.2', '', '', '11.2'])
    const day = point('2026-11-02', '2026-11-02')
    expect([0, 1, 6].map((i) => tickLabel(day, i, 7, 'day'))).toEqual(['11.2', '11.2', '11.2'])
    expect([0, 1, 6, 7].map((i) => tickLabel(day, i, 30, 'day'))).toEqual(['11.2', '', '', '11.2'])
  })

  it('AC-1209.2: 칸 단위 안내 글 — 일·주는 늘 같은 글이다', () => {
    const days = [point('2026-11-02', '2026-11-02')]
    expect(detailNote('day', days, TODAY)).toBe('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.')
    expect(detailNote('day', days, TODAY)).toBe('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.')
    expect(detailNote('week', [point('2026-11-02', '2026-11-08', { partial: true })], TODAY)).toBe(
      '주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.',
    )
  })

  it('AC-1209.2: 12개월 안내 글 — 덜 끝난 칸이 오늘이 든 달 하나뿐일 때만 빗금 글이 앞에 붙는다', () => {
    const october = point('2026-10-01', '2026-10-31')
    const thisMonth = point('2026-11-01', TODAY, { partial: true })
    expect(detailNote('month', [october, point('2026-11-01', TODAY)], TODAY)).toBe('회색 막대는 작년 같은 달이에요.')
    expect(detailNote('month', [october, thisMonth], TODAY)).toBe('빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지). 회색 막대는 작년 같은 달이에요.')
    expect(detailNote('month', [point('2026-10-01', '2026-10-31', { partial: true }), thisMonth], TODAY)).toBe('회색 막대는 작년 같은 달이에요.')
    expect(detailNote('month', [point('2026-10-01', '2026-10-31', { partial: true })], TODAY)).toBe('회색 막대는 작년 같은 달이에요.')
  })

  it('AC-1209.2: 같은 차례 비교 점이 덮였을 때만 비교 건수를 내고, 없거나 덮이지 않았으면 null(회색 막대 없음·표 –)', () => {
    const previous = [point('2026-10-05', '2026-10-05', { count: 7 }), point('2026-10-06', '2026-10-06', { count: 9, covered: false })]
    expect(comparisonAt(previous, 0)).toBe(7)
    expect(comparisonAt(previous, 1)).toBeNull()
    expect(comparisonAt(previous, 2)).toBeNull()
    expect(comparisonAt([point('2026-10-05', '2026-10-05', { count: 0 })], 0)).toBe(0)
  })
})

describe('AC-1209.4: 숫자 표 첫 칸 글자', () => {
  it('AC-1209.4: 일은 날짜 (요일), 주는 시작 – 끝, 달은 n년 n월이다', () => {
    expect(longLabel(point('2026-11-02', '2026-11-02'), 'day')).toBe('11월 2일 (월)')
    expect(longLabel(point('2026-11-02', '2026-11-08'), 'week')).toBe('11월 2일 – 11월 8일')
    expect(longLabel(point('2026-11-01', TODAY), 'month')).toBe('2026년 11월')
  })
})

describe('AC-1207.8: 견준 짝이 빠졌을 때의 안내 글', () => {
  it('AC-1207.8: 12개월은 끝난 n달, 나머지는 두 기간 모두 자료가 있는 n일이다(표시 칸과 상관없이 날)', () => {
    expect(comparedNote('month', 3)).toBe('증감과 막대는 끝난 3달만 견줘요. 건수는 기간 전체예요.')
    expect(comparedNote('day', 20)).toBe('증감과 막대는 두 기간 모두 자료가 있는 20일만 견줘요. 건수는 기간 전체예요.')
  })
})

describe('AC-1201.6: 처방 골라 보기는 불러오는 경로만 바뀐다', () => {
  const ROOT = process.cwd()
  const DIR = 'src/components/stats/sections'
  // 주석을 뺀 코드 글자
  const code = (file: string) =>
    readFileSync(join(ROOT, DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1')

  it('AC-1201.6: RxPickDetail과 그 시험은 글 함수를 trendLabels에서 불러오고 처방 추세 칸에서 불러오지 않는다', () => {
    expect(code('RxPickDetail.tsx')).toContain("import { comparisonAt, detailNote, longLabel, tickLabel } from './trendLabels'")
    expect(code('RxPickDetail.test.tsx')).toContain("import { detailNote } from './trendLabels'")
    for (const file of ['RxPickDetail.tsx', 'RxPickDetail.test.tsx']) {
      expect(code(file), file).not.toContain('RxTrendSection')
    }
  })

  it('AC-1201.6: 처방 추세 칸이 남아 있는 동안 그 칸도 trendLabels를 쓰고 같은 함수를 따로 두지 않는다', () => {
    const file = 'RxTrendSection.tsx'
    if (!existsSync(join(ROOT, DIR, file))) return // 처방별 추세를 넣을 때 칸째 지운다(TASK-15)
    const text = code(file)
    expect(text).toMatch(/from '\.\/trendLabels'/)
    expect(text).not.toMatch(/\b(?:const|function)\s+(?:GRAIN_NAME|comparedNote|longLabel|tickLabel|comparisonAt|detailNote)\b/)
    expect(text).not.toMatch(/export\s+(?:const|function)\s+(?:longLabel|tickLabel|comparisonAt|detailNote)\b/)
  })
})

// ── 고른 기간 (stats-period AC-1705.4·AC-1708.1) ─────────────────
describe('AC-1705.4·AC-1708.1: 글 함수는 기간 대신 칸(range.bucket)·grain을 받는다', () => {
  it('AC-1705.4: 칸 이름은 day 일·week 주·month 달이다(빠른 단추의 GRAIN_NAME과 같은 칸)', () => {
    expect(BUCKET_NAME).toEqual({ day: '일', week: '주', month: '달' })
  })

  it('AC-1705.4: 고른 기간의 달 칸 안내는 회색 막대가 바로 전(비교) 기간이라고 쓴다', () => {
    const october = point('2026-10-01', '2026-10-31')
    expect(detailNote('month', [october], TODAY, true)).toBe('회색 막대는 비교 기간의 같은 차례 달이에요.')
    expect(detailNote('month', [october, point('2026-11-01', TODAY, { partial: true })], TODAY, true)).toBe(
      '빗금 칸은 아직 끝나지 않은 달이에요(11월은 13일까지). 회색 막대는 비교 기간의 같은 차례 달이에요.',
    )
    expect(detailNote('day', [october], TODAY, true)).toBe('하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.')
  })
})
