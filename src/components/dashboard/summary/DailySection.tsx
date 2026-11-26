'use client'

import { useId, type ReactNode } from 'react'
import { DeltaText } from '@/components/charts/DeltaText'
import { KpiStat } from '@/components/charts/KpiStat'
import { ds } from '@/components/ui/classes'
import type { Delta } from '@/types/analysis'
import type { DayPayload } from '@/types/payload'
import { isConnected, type SummarySource } from './source'
import { longDate, ptCount, todayView, type TodayView } from './view'

// 일별 현황 구역(dashboard-ux AC-2707.2·AC-2707.4, 앞 tab-frame REQ-311 '오늘 하루 분석'): DashboardAnalysis에서 나눴다.
// 머리(h2 + 연결 전 칩) → 기준일 묶음 "일별 현황 기준일"(AC-2703.1, 날짜 고르기는 부르는 쪽이 준다) → 숫자 칸 여섯(first90 AC-4404.1, 물리치료 desk-feedback AC-6302.3) → [안내 줄] → 보고 문장 자리(sentence).
// 숫자가 없으면(연결 전·읽는 중·읽지 못함) 칩 + 빈 칸 여섯 + 안내 줄이다(숫자를 지어내지 않는다)

export const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4' // 메모 §3 '덩어리 사이'
export const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
export const SECTION_TITLE = 'text-title font-semibold text-ink'
// 보조 글(안내 줄, ui-90 AC-414.6): small(13px) muted + 시안 최대 40em(520px)에 가장 가까운 4px 단위 폭 단계
export const NOTE = 'text-small text-muted max-w-130'
export const NO_DATA = '자료 없음'
/**
 * 숫자 줄 아래 안내 줄의 보고 문장 글. when = '연결하면'·'읽기가 끝나면'.
 * 받는 사람은 병원 호칭이다(clinic-profile AC-6606.3). 호칭은 BitDashboard가 병원 정보에서 읽어(세 가지 가운데 하나) emptyNote로 넘긴다(기본 '원장님').
 * 이 폴더는 정해 둔 곳만 불러와서(DashboardAnalysis.test AC-311.8) 호칭 타입 대신 글자로 받는다
 */
export const sentenceNote = (when: string, honorific: string = '원장님') => `${when} 이 숫자로 ${honorific} 보고 문장을 만들어 숫자 칸 아래에 보여 드려요.`

const LAST_WEEK_LABEL = '지난주 같은 요일보다'
// 90일초진 칸 (first90 AC-4404.1, 첫 시안 docs/mockups/first90/index.html). 칸 아래 글은 지금처럼 없고, 그날 90일초진을 모를 때만 두 글이다(design.md 8)
const F90_LABEL = '90일초진'
const F90_UNKNOWN = '새 도우미(0.7.0)면 나와요'
const RETURNING_NOTE = '90일초진 포함'
// 물리치료 칸 (desk-feedback AC-6302.3, 시안 docs/mockups/desk-feedback/index.html ②). 기준 = 수납일지 [설정] 물리치료 묶음(수납일지 '물리치료' 칸과 같음).
// 칸 아래 글은 없다(시안의 '재진 중'은 넣지 않음, requirements.md '시안과 다르게 정한 것'). 묶음을 안 골랐으면 값 대신 안내 글이다
const PT_LABEL = '물리치료'
const PT_UNSET = '수납일지 설정에서 묶음을 고르면 나와요'
// 의사랑 의원(uisarang-upload AC-8811.4, requirements.md '셀 수 없음 안내' 작은 숫자 칸): 90일초진·물리치료는 의사랑 엑셀로 셀 수 없어 "–" + 이 글(까닭 없음).
// 이 폴더는 정해 둔 곳만 불러와서(DashboardAnalysis.test AC-311.8) 글을 여기 상수로 둔다
const UIS_CANNOT = '의사랑 엑셀로는 셀 수 없어요'
const UIS_CELL: Pick<CountCell, 'value' | 'emptyText'> = { value: null, emptyText: UIS_CANNOT }
// 숫자 칸: 위아래 16·좌우 20, 첫 칸 왼쪽 0, 칸 사이 1px line 세로선.
// 768px 미만 2칸씩 세 줄: 12·16, 왼쪽 칸(홀수 칸) 왼쪽 0·세로선 없음, 둘째 줄부터 위 1px line. 셋째 줄 = 물리치료 · 지난주 같은 요일보다(AC-6302.4)
const KPI_LEFT = 'min-w-0 border-l border-line py-4 pr-5 pl-5 max-md:border-t max-md:border-l-0 max-md:py-3 max-md:pr-4 max-md:pl-0'
const KPI_RIGHT = 'min-w-0 border-l border-line py-4 px-5 max-md:border-t max-md:py-3 max-md:px-4'
const KPI_CELLS = [
  'min-w-0 py-4 pr-5 pl-0 max-md:py-3 max-md:pr-4',
  'min-w-0 border-l border-line py-4 px-5 max-md:py-3 max-md:px-4',
  KPI_LEFT,
  KPI_RIGHT,
  KPI_LEFT,
  KPI_RIGHT,
] as const
const LAST_CELL = KPI_CELLS.length - 1
// 숫자 줄: 숫자가 있든 없든 여섯 칸(first90 AC-4404.1, desk-feedback AC-6302.3·AC-6302.4)
const KPI_ROW = 'grid grid-cols-6 border-b border-line max-md:grid-cols-2'

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
  /** 물리치료 묶음 열쇠(desk-feedback AC-6302.3). undefined = 모름(설정·묶음을 못 읽음 → '자료 없음'), null = 수납일지 설정에서 안 고름(안내 글) */
  ptKey?: string | null
  /** 의사랑 의원(uisarang-upload AC-8811.4): 90일초진·물리치료 칸은 셀 수 없음이다(숫자가 있을 때). 기본 거짓 = 지금 그대로 */
  uis?: boolean
}

export function DailySection({
  today,
  source,
  day = today,
  emptyChip = '비트 PC 연결 전',
  emptyText = '연결하면 보여요',
  emptyNote = sentenceNote('연결하면'),
  dateLine,
  sentence,
  ptKey,
  uis = false,
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
            <span className="text-small text-muted">숫자 6개와 보고 문장에 적용</span>
          </div>
        </div>
      )}
      <TodayNumbers view={days === null ? null : todayView(day, days)} emptyText={emptyText} past={past} pt={days === null ? null : ptCell(day, days, ptKey)} uis={uis && days !== null} />
      {days === null && emptyNote !== null && <p className={`mt-3 ${NOTE}`}>{emptyNote}</p>}
      {sentence}
    </section>
  )
}

// 물리치료 칸 값(AC-6302.3): 열쇠를 모르면(undefined) KpiStat 기본 '자료 없음', 안 골랐으면(null) 안내 글, 아니면 그날 줄 숫자(ptCount).
// 그날 줄이 없으면 ptCount가 null이라 '자료 없음'이다(countCells가 다른 칸과 같이 정한다)
type PtCell = Pick<CountCell, 'value' | 'emptyText'>
function ptCell(day: string, days: readonly DayPayload[], ptKey: string | null | undefined): PtCell {
  if (ptKey === undefined) return { value: null }
  if (ptKey === null) return { value: null, emptyText: PT_UNSET }
  return { value: ptCount(day, days, ptKey) }
}

// 숫자 칸(지난주 칸 앞). 숫자 없음(view null) = 같은 다섯(환자 수 · 신환 · 90일초진 · 재진 · 물리치료), 칸마다 emptyText(AC-4404.1·AC-6302.3).
// 숫자 있음 = 환자 수 · 신환 · 90일초진 · 재진 · 물리치료(AC-4404.1·AC-6302.3): 그날 first90이 있으면 그 값과 returning, 없으면 90일초진 "–" + 안내 글, 재진은 지금 값 + "90일초진 포함".
// 그날 줄이 없으면(counts null) 다섯 모두 KpiStat 기본 '자료 없음'이다(물리치료 묶음을 안 골랐어도).
// 의사랑(uis, uisarang-upload AC-8811.4)이면 90일초진·물리치료 두 칸은 그날 줄과 상관없이 셀 수 없음이고, 재진 칸은 지금처럼(first90이 없어 "90일초진 포함")이다
function countCells(first: string, view: TodayView | null, emptyText: string, pt: PtCell | null, uis: boolean): CountCell[] {
  const cells = baseCells(first, view, emptyText, pt)
  return uis ? cells.map((cell) => (cell.label === F90_LABEL || cell.label === PT_LABEL ? { label: cell.label, ...UIS_CELL } : cell)) : cells
}

function baseCells(first: string, view: TodayView | null, emptyText: string, pt: PtCell | null): CountCell[] {
  if (view === null) return [first, '신환', F90_LABEL, '재진', PT_LABEL].map((label) => ({ label, value: null, emptyText }))
  const { counts } = view
  if (counts === null) return [first, '신환', F90_LABEL, '재진', PT_LABEL].map((label) => ({ label, value: null }))
  const head = [
    { label: first, value: counts.patients },
    { label: '신환', value: counts.newPatients },
  ]
  const ptLast: CountCell = { label: PT_LABEL, ...(pt ?? { value: null }) }
  if (counts.first90 === undefined) {
    return [...head, { label: F90_LABEL, value: null, emptyText: F90_UNKNOWN }, { label: '재진', value: counts.returning, note: RETURNING_NOTE }, ptLast]
  }
  return [...head, { label: F90_LABEL, value: counts.first90 }, { label: '재진', value: counts.returning }, ptLast]
}

// 숫자 줄: 숫자 칸 + 지난주 같은 요일보다. view null = 숫자 없음(칸마다 emptyText). pt = 물리치료 칸 값(숫자가 없으면 null).
// past = 지난 날짜(AC-605.3·AC-605.4): 첫 칸 이름이 "환자 수"이고, 그 날은 끝나기를 기다릴 날이 아니라 비교할 수 없으면 "자료 없음"이다
function TodayNumbers({ view, emptyText, past, pt, uis }: { view: TodayView | null; emptyText: string; past: boolean; pt: PtCell | null; uis: boolean }) {
  const cells = countCells(past ? '환자 수' : '오늘 환자 수', view, emptyText, pt, uis)

  return (
    <div className={KPI_ROW}>
      {cells.map(({ label, value, emptyText: empty, note }, i) => (
        <div key={label} className={KPI_CELLS[i]}>
          <KpiStat label={label} value={value} format="count" unit="명" emptyText={empty} />
          {note !== undefined && <p className="text-small text-muted">{note}</p>}
        </div>
      ))}
      <div className={KPI_CELLS[LAST_CELL]}>
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
