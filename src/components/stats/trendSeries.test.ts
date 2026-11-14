import { describe, expect, it } from 'vitest'
import { TREND_SERIES } from './sections/parts'
import { trendSeries } from './trendSeries'

// 내원 막대 갈래 (first90 REQ-4412 AC-4412.2·REQ-4416, design.md 5-4 'stats/trendSeries.ts').
// 통계 일별 내원과 대시보드 기간별 흐름이 같이 쓴다. 모든 칸에 90일초진이 있으면(앎) 세 갈래, 아니면 두 갈래다.
// 처방 자세히 차트가 쓰는 parts.tsx TREND_SERIES는 그대로 둔다

describe('AC-4416.1: trendSeries — 앎이면 신환·90일초진·재진, 모름이면 신환·재진(90일초진 포함)', () => {
  it('AC-4416.1: 앎(true)이면 위부터 신환(accent)·90일초진(f90)·재진(ret) 세 갈래다', () => {
    expect(trendSeries(true)).toEqual([
      { name: '신환', tone: 'accent' },
      { name: '90일초진', tone: 'f90' },
      { name: '재진', tone: 'ret' },
    ])
  })

  it('AC-4416.1: 모름(false)이면 신환(accent)·"재진(90일초진 포함)"(ret) 두 갈래다', () => {
    expect(trendSeries(false)).toEqual([
      { name: '신환', tone: 'accent' },
      { name: '재진(90일초진 포함)', tone: 'ret' },
    ])
  })

  it('AC-4416.1: 부를 때마다 새 배열이다(부르는 쪽이 고쳐도 다음 값이 바뀌지 않는다)', () => {
    const first = trendSeries(true)
    first[0]!.name = '바뀜'
    first.pop()
    expect(trendSeries(true)).toHaveLength(3)
    expect(trendSeries(true)[0]!.name).toBe('신환')
  })

  it('AC-4416.1: 처방 자세히 차트의 TREND_SERIES(신환 accent · 재진 chart-3)는 그대로다', () => {
    expect(TREND_SERIES).toEqual([
      { name: '신환', tone: 'accent' },
      { name: '재진', tone: 'chart-3' },
    ])
  })
})
