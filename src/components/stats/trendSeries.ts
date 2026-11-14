import type { BarSeries } from '@/components/charts/StackedBarChart'

// 내원 막대 갈래 (first90 REQ-4412 AC-4412.2, design.md 5-4). 통계 일별 내원과 대시보드 기간별 흐름이 같이 쓴다.
// known = 모든 칸에 90일초진 수가 있음 → 위부터 신환(accent)·90일초진(f90)·재진(ret). 아니면 신환·"재진(90일초진 포함)"(ret) 두 갈래다.
// 처방 자세히 차트가 쓰는 sections/parts.tsx의 TREND_SERIES(신환·재진 chart-3)는 그대로 둔다. 부를 때마다 새 배열을 준다
export function trendSeries(known: boolean): BarSeries[] {
  return known
    ? [
        { name: '신환', tone: 'accent' },
        { name: '90일초진', tone: 'f90' },
        { name: '재진', tone: 'ret' },
      ]
    : [
        { name: '신환', tone: 'accent' },
        { name: '재진(90일초진 포함)', tone: 'ret' },
      ]
}
