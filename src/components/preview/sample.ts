import type { Delta } from '@/types/analysis'
import type { KpiStatProps } from '@/components/charts/KpiStat'
import type { BarBucket, BarSeries } from '@/components/charts/StackedBarChart'

// 미리보기 예시 자료 (b2b-redesign REQ-206 AC-206.1, design.md '미리보기', UI_GUIDE '미리보기'). 모두 예시이고 실제 자료를 읽지 않는다.
// 8주 값은 승인 시안 docs/mockups/b2b-redesign/parts.mjs의 WEEKS 그대로다(마지막 주 집계 중).
// KPI는 마지막 완료 주와 그 전 주에서 여기서 계산한다 — 예시 자료 파일 안에서만이다(실제 화면은 lib/analytics/compare.ts가 만든 값을 그대로 보여 준다).
// 보이는 글자(버림)는 차트 부품의 format.ts가 만든다

export type SampleKpi = Pick<KpiStatProps, 'label' | 'value' | 'format' | 'unit' | 'delta' | 'deltaUnit' | 'spark'>

export const SAMPLE_CLINIC = '예시정형외과의원'
// 탭 줄: 실제 앱 탭 14개(이름·순서는 components/shell/menu.ts의 MENU와 같다. 미리보기는 shell을 불러오지 않고 시험이 견준다, ui-90 AC-421.2)
export const PREVIEW_TABS = ['대시보드', '통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록', '설정'] as const

// 쌓은 막대 계열: 신환(맨 위·범례 첫째) → 재진. 칸의 values도 이 순서다
export const SAMPLE_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]

const week = (key: string, rangeLabel: string, newPatients: number, returning: number, note?: string): BarBucket => ({
  key,
  label: key,
  rangeLabel,
  state: 'complete',
  values: [newPatients, returning],
  ...(note ? { note } : {}),
})

export const SAMPLE_WEEKS: BarBucket[] = [
  week('9.7', '9월 7일 – 13일', 112, 524),
  week('9.14', '9월 14일 – 20일', 118, 538),
  week('9.21', '9월 21일 – 27일', 92, 431, '추석 연휴'),
  week('9.28', '9월 28일 – 10월 4일', 121, 556),
  week('10.5', '10월 5일 – 11일', 109, 521, '한글날'),
  week('10.12', '10월 12일 – 18일', 126, 571),
  week('10.19', '10월 19일 – 25일', 131, 583),
  { ...week('10.26', '10월 26일 – 11월 1일', 98, 452), state: 'in-progress' },
]

// ── KPI: 마지막 완료 주(10.19) vs 그 전 주(10.12). Sparkline은 완료된 7주
const done = SAMPLE_WEEKS.filter((w) => w.state === 'complete')
const newOf = (w: BarBucket) => w.values[0] ?? 0
const returningOf = (w: BarBucket) => w.values[1] ?? 0
const totalOf = (w: BarBucket) => newOf(w) + returningOf(w)
const newRateOf = (w: BarBucket) => newOf(w) / totalOf(w) // 0~1

// 수 증감: pct는 퍼센트(50 = +50%), 그 전이 0이면 null
const change = (now: number, before: number): Delta => ({
  kind: 'change',
  diff: now - before,
  pct: before === 0 ? null : ((now - before) / before) * 100,
})
// 비율 증감: diff는 0~1 비율 차이(%p), pct는 쓰지 않는다
const rateChange = (now: number, before: number): Delta => ({ kind: 'change', diff: now - before, pct: null })

function countKpi(label: string, of: (w: BarBucket) => number): SampleKpi {
  const [before, now] = done.slice(-2).map(of) as [number, number]
  return { label, value: now, format: 'count', unit: '명', delta: change(now, before), deltaUnit: '명', spark: done.map(of) }
}

function rateKpi(label: string, of: (w: BarBucket) => number): SampleKpi {
  const [before, now] = done.slice(-2).map(of) as [number, number]
  return { label, value: now, format: 'percent', unit: '%', delta: rateChange(now, before), deltaUnit: '%p', spark: done.map(of) }
}

export const SAMPLE_KPIS: SampleKpi[] = [
  countKpi('환자 수', totalOf),
  countKpi('신환', newOf),
  countKpi('재진', returningOf),
  rateKpi('신환율', newRateOf),
]
