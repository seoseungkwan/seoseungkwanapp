'use client'

import { useId, type ReactNode } from 'react'
import { DeltaText } from '@/components/charts/DeltaText'
import { KpiStat } from '@/components/charts/KpiStat'
import { ds } from '@/components/ui/classes'
import type { Delta } from '@/types/analysis'
import { isConnected, type SummarySource } from './source'
import { longDate, todayView, type TodayView } from './view'

// 일별 현황 구역(dashboard-ux AC-2707.2·AC-2707.4, 앞 tab-frame REQ-311 '오늘 하루 분석'): DashboardAnalysis에서 나눴다.
// 머리(h2 + 연결 전 칩) → 기준일 묶음 "일별 현황 기준일"(AC-2703.1, 날짜 고르기는 부르는 쪽이 준다) → 숫자 칸 다섯(first90 AC-4404.1) → [안내 줄] → 보고 문장 자리(sentence).
// 숫자가 없으면(연결 전·읽는 중·읽지 못함) 칩 + 지금 빈 칸 넷 + 안내 줄이다(숫자를 지어내지 않는다)

export const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4' // 메모 §3 '덩어리 사이'
export const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
export const SECTION_TITLE = 'text-title font-semibold text-ink'
// 보조 글(안내 줄, ui-90 AC-414.6): small(13px) muted + 시안 최대 40em(520px)에 가장 가까운 4px 단위 폭 단계
export const NOTE = 'text-small text-muted max-w-130'
export const NO_DATA = '자료 없음'

const LAST_WEEK_LABEL = '지난주 같은 요일보다'
// 90일초진 칸 (first90 AC-4404.1, 첫 시안 docs/mockups/first90/index.html). 칸 아래 글은 지금처럼 없고, 그날 90일초진을 모를 때만 두 글이다(design.md 8)
const F90_LABEL = '90일초진'
const F90_UNKNOWN = '새 도우미(0.7.0)면 나와요'
const RETURNING_NOTE = '90일초진 포함'
// 숫자 칸: 위아래 16·좌우 20, 첫 칸 왼쪽 0, 칸 사이 1px line 세로선.
// 768px 미만 2칸씩: 12·16, 왼쪽 칸 왼쪽 0, 둘째 줄부터 위 1px line(왼쪽 칸은 세로선 없음). 다섯째 칸은 셋째 줄 두 칸 폭이다(시안 그대로)
const KPI_CELLS = [
  'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-4',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-4',
  'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0',
  'min-w-0 border-l border-line py-4 px-5 max-md:border-t max-md:py-3 max-md:px-4',
  'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:col-span-2 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0',
] as const
// 숫자 줄: 숫자가 있든 없든 다섯 칸(first90 AC-4404.1)
const KPI_ROW = 'grid grid-cols-5 border-b border-line max-md:grid-cols-2'

// 지난주 칸 앞의 숫자 칸 하나: KpiStat(count · "명") + [칸 아래 글]. emptyText 없음 = KpiStat 기본 '자료 없음'
type CountCell = { label: string; value: number | null; emptyText?: string; note?: string }


export type DailySectionProps = {
  today: string
  source: SummarySource
  /** 고른 날(bit-dashboard AC-605.3). 없으면 오늘이다 */
  day?: string
  emptyChip?: string
  emptyText?: string
  /** 숫자 줄 아래 안내 줄. null이면 없다 */
  emptyNote?: string | null
  /** 날짜 고르기(숫자가 있을 때만). 주면 "일별 현황 기준일" 묶음 안에 그린다 */
  dateLine?: ReactNode
  /** 숫자 칸 아래 보고 문장(ReportBlock) */
  sentence?: ReactNode
}

export function DailySection({
  today,
  source,
  day = today,
  emptyChip = '비트 PC 연결 전',
  emptyText = '연결하면 보여요',
  emptyNote = '연결하면 이 숫자로 원장님 보고 문장을 만들어 숫자 칸 아래에 보여 드려요.',
  dateLine,
  sentence,
}: DailySectionProps) {
  const todayId = useId()
  const dateId = useId()
  const days = isConnected(source) ? source.days : null
  const past = day !== today
  return (
    <section aria-labelledby={todayId} className={SECTION}>
      <div className={SECTION_HEAD}>
        <h2 id={todayId} className={SECTION_TITLE}>
          {past ? `${longDate(day)} 하루 분석` : '오늘 하루 분석'}
        </h2>
        {days === null && <span className={ds.chip.neutral}>{emptyChip}</span>}
      </div>
      {/* 기준일 묶음(AC-2703.1): 이름이 그룹의 이름이고, 적용 범위 글을 옆에 둔다. 기간별 흐름의 "추이 조회 기간"과 따로다 */}
      {dateLine != null && (
        <div role="group" aria-labelledby={dateId} className="mb-2">
          <p id={dateId} className="text-caption font-medium text-muted">
            일별 현황 기준일
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {dateLine}
            <span className="text-small text-muted">숫자 5개와 보고 문장에 적용</span>
          </div>
        </div>
      )}
      <TodayNumbers view={days === null ? null : todayView(day, days)} emptyText={emptyText} past={past} />
      {days === null && emptyNote !== null && <p className={`mt-3 ${NOTE}`}>{emptyNote}</p>}
      {sentence}
    </section>
  )
}

// 숫자 칸(지난주 칸 앞). 숫자 없음(view null) = 같은 넷(환자 수 · 신환 · 90일초진 · 재진), 칸마다 emptyText(AC-4404.1).
// 숫자 있음 = 환자 수 · 신환 · 90일초진 · 재진(AC-4404.1): 그날 first90이 있으면 그 값과 returning, 없으면 90일초진 "–" + 안내 글, 재진은 지금 값 + "90일초진 포함".
// 그날 줄이 없으면(counts null) 넷 모두 KpiStat 기본 '자료 없음'이다
function countCells(first: string, view: TodayView | null, emptyText: string): CountCell[] {
  if (view === null) return [first, '신환', F90_LABEL, '재진'].map((label) => ({ label, value: null, emptyText }))
  const { counts } = view
  if (counts === null) return [first, '신환', F90_LABEL, '재진'].map((label) => ({ label, value: null }))
  const head = [
    { label: first, value: counts.patients },
    { label: '신환', value: counts.newPatients },
  ]
  if (counts.first90 === undefined) {
    return [...head, { label: F90_LABEL, value: null, emptyText: F90_UNKNOWN }, { label: '재진', value: counts.returning, note: RETURNING_NOTE }]
  }
  return [...head, { label: F90_LABEL, value: counts.first90 }, { label: '재진', value: counts.returning }]
}

// 숫자 줄: 숫자 칸 + 지난주 같은 요일보다. view null = 숫자 없음(칸마다 emptyText).
// past = 지난 날짜(AC-605.3·AC-605.4): 첫 칸 이름이 "환자 수"이고, 그 날은 끝나기를 기다릴 날이 아니라 비교할 수 없으면 "자료 없음"이다
function TodayNumbers({ view, emptyText, past }: { view: TodayView | null; emptyText: string; past: boolean }) {
  const cells = countCells(past ? '환자 수' : '오늘 환자 수', view, emptyText)

  return (
    <div className={KPI_ROW}>
      {cells.map(({ label, value, emptyText: empty, note }, i) => (
        <div key={label} className={KPI_CELLS[i]}>
          <KpiStat label={label} value={value} format="count" unit="명" emptyText={empty} />
          {note !== undefined && <p className="text-small text-muted">{note}</p>}
        </div>
      ))}
      <div className={KPI_CELLS[4]}>
        {view?.compare.kind === 'delta' ? (
          <DeltaStat delta={view.compare.delta} weekday={view.compare.weekday} />
        ) : (
          <KpiStat
            label={LAST_WEEK_LABEL}
            value={null}
            format="count"
            unit="명"
            emptyText={view === null ? emptyText : view.compare.kind === 'no-last-week' ? '지난주 자료가 없어요' : past ? NO_DATA : '오늘 진료가 끝나면 비교해요'}
          />
        )}
      </div>
    </div>
  )
}

// 지난주 칸(마지막 칸)의 값이 증감일 때. KpiStat의 값은 숫자 하나라 증감을 값으로 쓸 수 없어 같은 글자 단계로 따로 둔다:
// 이름(small muted) → 값 줄(600: DeltaText — 화살표 꾸밈 12px + 화면 읽기 글자 + 증감 글자, KpiStat 증감 줄과 같은 부품·색 규칙, dashboard-ux AC-2706.4) → "지난주 {요일}요일"(small muted).
// 값 줄은 PC 20/36, 폰 16/32다(bit-dashboard design.md '### 날짜 고르기', 시안 .kpi-v.sm). metric(28)이면 좁은 폭에서 세 줄로 꺾이고, 글자 토큰의 줄 높이는 28·24라 줄 높이를 따로 준다
const DELTA_VALUE = 'mt-1 flex flex-wrap items-center gap-x-1 text-title leading-9 font-semibold tabular-nums max-md:text-subtitle max-md:leading-8'

function DeltaStat({ delta, weekday }: { delta: Delta; weekday: string }) {
  return (
    <div className="min-w-0">
      <div className="flex h-7 items-start">
        <span className="text-small text-muted">{LAST_WEEK_LABEL}</span>
      </div>
      <DeltaText delta={delta} unit="명" className={DELTA_VALUE} arrow={12} />
      <p className="text-small text-muted">{`지난주 ${weekday}요일`}</p>
    </div>
  )
}
