import { createContext, useContext, useId, useMemo, useState, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { formatDelta, type DeltaUnit } from '@/components/charts/format'
import type { BarSeries } from '@/components/charts/StackedBarChart'
import { patientTrend, type StatsInput, type StatsRange } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { compareYmd, monthOf, weekdayOf } from '@/lib/analytics/dates'
import type { Delta } from '@/types/analysis'

// 통계 섹션들이 같이 쓰는 틀·글자 (stats REQ-513, 시안 docs/mockups/stats/notes.md §2·§3·§4). props만 받는다

// 기간 이름 표는 view.ts에 있다(stats-period TASK-1). 섹션은 고른 기간도 그리려고 range.name을 읽는다
export { PERIOD_NAME } from '@/components/stats/view'
export const NO_RANGE_DATA = '불러온 숫자에 이 기간 자료가 없어요.'
export const TREND_SERIES: BarSeries[] = [
  { name: '신환', tone: 'accent' },
  { name: '재진', tone: 'chart-3' },
]

const WEEKDAYS = '월화수목금토일'
export const weekdayName = (ymd: string) => WEEKDAYS[weekdayOf(ymd) - 1]!
export const monthNumber = (ymd: string) => Number(ymd.slice(5, 7))
export const dayNumber = (ymd: string) => Number(ymd.slice(8, 10))
export const longDate = (ymd: string) => `${monthNumber(ymd)}월 ${dayNumber(ymd)}일`
export const dateWithWeekday = (ymd: string) => `${longDate(ymd)} (${weekdayName(ymd)})`
export const yearMonth = (ymd: string) => `${Number(ymd.slice(0, 4))}년 ${monthNumber(ymd)}월`

// statsRange의 불러올 범위 끝이 곧 오늘이다
export const todayOf = (range: StatsRange) => range.load.to
// 고른 기간에 일 줄이 하나라도 있는지(patientTrend는 줄이 없으면 null이다)
export const hasRows = (input: StatsInput) => patientTrend(input) !== null
// 덜 끝난 칸(12개월 달 칸)이 오늘이 든 달 하나뿐인지. '아직 끝나지 않은 달' 글은 이때만 쓴다: 지난 달의 덜 덮인 칸은 끝나지 않은 달이 아니다
export function onlyThisMonthPartial(partialMonths: readonly string[], today: string): boolean {
  return partialMonths.length === 1 && partialMonths[0] === monthOf(today)
}

// 칸 틀 모양. 처방 탭 칸(RxSection)도 같은 위 줄·여백·머리 줄을 쓴다(stats-pc-ux design.md 'RxSection')
export const SECTION = 'mt-12 min-w-0 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4'
export const SECTION_HEAD = 'flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1'
export const HEADING = 'text-title font-semibold text-ink'
// 바로가기 띠에 가리지 않는 scroll-margin(stats-pc-ux AC-4002.6, first90 AC-4411.2): 머리줄 + 띠 + 9px(시안 .s-card scroll-margin 164).
// 넓은 화면 102 + 53(위아래 8 + 링크 36 + 아래 선 1) + 9 = 164px, 휴대폰 94 + 57(위아래 6 + 링크 44 + 선 1) + 9 = 160px
export const TOC_SCROLL = 'scroll-mt-41 max-md:scroll-mt-40'
// 코드로 초점을 옮기는 제목(headingRef): Tab 차례에는 들지 않고, 붙는 머리줄·목차 띠에 가리지 않게 TOC_SCROLL, 코드로 옮긴 초점이라 고리는 그리지 않는다
const FOCUS_HEADING = `${HEADING} ${TOC_SCROLL} focus:outline-none`
// 탭 안 고치기 제목(h3): 탭 칸 h2 `처방` 아래라 한 단계 작다(AC-4003.6)
const PANEL_HEADING = `mt-4 text-subtitle font-semibold text-ink ${TOC_SCROLL} focus:outline-none`

// 목차 자리(stats-pc-ux AC-4002.6): StatsSections가 칸마다 감싼다. Section(·RxSection)이 이 id를 section에 붙이고 안쪽에는 넘기지 않는다(겹친 id 없음).
// 칸 파일마다 id prop을 여러 return에 더하지 않으려고 context로 붙인다(design.md '결정과 트레이드오프')
const AnchorContext = createContext<string | null>(null)
export function SectionAnchor({ id, children }: { id: string; children: ReactNode }) {
  return <AnchorContext.Provider value={id}>{children}</AnchorContext.Provider>
}
// 감싼 목차 id를 읽는다(RxSection). 쓴 쪽은 안쪽을 NoAnchor로 감싼다
export const useSectionAnchor = () => useContext(AnchorContext)
export const NoAnchor = ({ children }: { children: ReactNode }) => <AnchorContext.Provider value={null}>{children}</AnchorContext.Provider>

// 탭 패널(stats-pc-ux AC-4003.2·AC-4003.4): RxSection이 패널마다 준다. active = 고른 탭, slot = 탭 칸 머리 줄 안 설명·단추 자리(붙기 전 첫 그림에는 null)
export type SectionPanel = { active: boolean; slot: HTMLElement | null }
export const SectionPanelContext = createContext<SectionPanel | null>(null)

// ── 큰 카드 (first90 REQ-4411 AC-4411.3, design.md 5-5, 시안 docs/mockups/first90/redesign.html .s-card) ──
// 카드 = 흰 바탕 + 둥근 모서리 + 옅은 그림자(테두리 없음: 상자 안 상자가 되지 않는다). 머리 줄 = h2 + 옆 글 + 오른쪽 자리.
// 카드 안 칸 사이는 얇은 선(border-st-line) 하나뿐이고 첫 칸 위에는 선이 없다
const CARD = 'min-w-0 rounded-st bg-surface px-6 py-5 shadow-st-card max-md:px-4 max-md:py-4'
const CARD_HEAD = 'flex flex-wrap items-baseline gap-x-3 gap-y-1'
const CARD_HEADING = 'text-st-18 leading-7 font-semibold text-st-ink'
const CARD_DESC = 'text-small text-st-muted'
const CARD_BODY = 'mt-4 max-md:mt-3 [&>*+*]:mt-6 [&>*+*]:border-t [&>*+*]:border-st-line [&>*+*]:pt-5'
// 카드 안 작은 칸 제목(h3, 시안 .s-sub h3 15px)
const SUB_HEADING = 'text-st-15 leading-6 font-semibold text-st-ink'

// 카드 문맥: 카드 안 Section이 읽는다. title = 카드 h2(같은 제목 칸 규칙), ownDesc = 카드가 옆 글을 가졌는지,
// slot = 카드 머리 줄 안 옆 글·단추 자리(붙기 전 첫 그림에는 null). 처방 탭 칸(RxSection)도 이 문맥으로 카드 머리를 쓸 수 있다
export type StatsCardContext = { title: string; ownDesc: boolean; slot: HTMLElement | null }
const CardContext = createContext<StatsCardContext | null>(null)
export const useStatsCard = () => useContext(CardContext)

// 카드 머리 줄·카드 안 칸 머리 줄의 옆 글·오른쪽 단추
function CardExtras({ desc, action }: { desc?: string; action?: ReactNode }) {
  return (
    <>
      {desc && <span className={CARD_DESC}>{desc}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </>
  )
}

// 큰 카드. id(선택) = 바로가기 자리(TOC_SCROLL로 띠에 가리지 않는다). 주지 않으면(기다리는 자리) id·scroll-margin이 없다.
// 안의 Section은 h3 작은 칸이고, 카드 제목과 같은 제목의 칸은 칸 머리 없이 옆 글·단추를 카드 머리 자리에 그린다(아래 Section).
// 감싼 목차 자리 id(SectionAnchor)는 안쪽에 넘기지 않는다
export function StatsCard({ id, title, desc, action, children }: { id?: string; title: string; desc?: string; action?: ReactNode; children: ReactNode }) {
  const headingId = useId()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const ownDesc = desc !== undefined
  const context = useMemo(() => ({ title, ownDesc, slot }), [title, ownDesc, slot])
  return (
    <section id={id} aria-labelledby={headingId} className={id ? `${CARD} ${TOC_SCROLL}` : CARD}>
      <div className={CARD_HEAD}>
        <h2 id={headingId} className={CARD_HEADING}>
          {title}
        </h2>
        {desc && <span className={CARD_DESC}>{desc}</span>}
        {/* 같은 제목 칸의 옆 글·단추 자리. contents라 안의 글·단추가 이 머리 줄의 칸이 되고, 비면 자리도 없다 */}
        <div ref={setSlot} className="contents" />
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <CardContext.Provider value={context}>
        <NoAnchor>
          <div className={CARD_BODY}>{children}</div>
        </NoAnchor>
      </CardContext.Provider>
    </section>
  )
}

// 환자 카드 옆 글(AC-4411.3): '최근 30일 · 10월 15일 – 11월 13일'. 끝 = 기간 끝과 마지막 끝난 날 중 이른 날. 해가 다르면 양 끝에 해를 붙인다
export function cardRangeText(range: StatsRange, lastDay: string): string {
  const { from } = range.current
  const to = compareYmd(range.current.to, lastDay) <= 0 ? range.current.to : lastDay
  const date = from.slice(0, 4) === to.slice(0, 4) ? longDate : (ymd: string) => `${Number(ymd.slice(0, 4))}년 ${longDate(ymd)}`
  return `${range.name} · ${date(from)} – ${date(to)}`
}

// 머리 줄 안 설명·오른쪽 단추(보통 칸과 탭 칸 머리 줄이 같은 모양)
function HeadExtras({ desc, action }: { desc?: string; action?: ReactNode }) {
  return (
    <>
      {desc && <span className="text-small text-muted">{desc}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </>
  )
}

// 섹션 틀: 위 1px line-strong + h2 + 옆 설명(small muted) + 오른쪽 단추. 차트 칸(col-span)은 놓는 쪽이 className으로 준다.
// headingRef(선택, treatment-trend AC-1210.2): 칸 모습이 바뀔 때 제목에 초점을 주려고 h2를 넘긴다. 주지 않으면 마크업이 그대로다.
// 두 모드(stats-pc-ux design.md 'Section 두 모드'): 목차 자리(SectionAnchor) 안이면 section에 id + TOC_SCROLL.
// 탭 패널(SectionPanelContext) 안이면 section·h2 없이 내용만 그리고, 고른 탭일 때만 설명·단추를 탭 칸 머리 줄 자리에 portal로 그린다(className은 쓰지 않는다).
// 탭 패널에서 headingRef를 주면(고치기) 패널 맨 위 h3로 제목을 그리고 ref를 붙인다.
// 큰 카드(StatsCard) 안이면(first90 design.md 5-5) h3 작은 칸이다(위 줄·여백 없이, 칸 사이 선은 카드가 긋는다). 제목이 카드 제목과 같으면
// 칸 머리 없이 내용만 그리고 옆 글·단추를 카드 머리 자리에 portal로 그린다 — 카드가 옆 글을 가졌으면 카드 글을 쓰고 칸 글은 그리지 않는다
export function Section({
  title,
  desc,
  action,
  className = '',
  headingRef,
  children,
}: {
  title: string
  desc?: string
  action?: ReactNode
  className?: string
  headingRef?: Ref<HTMLHeadingElement>
  children: ReactNode
}) {
  const id = useId()
  const anchor = useSectionAnchor()
  const panel = useContext(SectionPanelContext)
  const card = useStatsCard()

  if (panel) {
    const extras = panel.active && panel.slot && (desc || action) ? createPortal(<HeadExtras desc={desc} action={action} />, panel.slot) : null
    return (
      <>
        {extras}
        {headingRef && (
          <h3 ref={headingRef} tabIndex={-1} className={PANEL_HEADING}>
            {title}
          </h3>
        )}
        <NoPanel>{children}</NoPanel>
      </>
    )
  }

  if (card) {
    const place = className ? `min-w-0 ${className}` : 'min-w-0'
    if (title === card.title) {
      const shown = card.ownDesc ? undefined : desc
      const extras = card.slot && (shown || action) ? createPortal(<CardExtras desc={shown} action={action} />, card.slot) : null
      return (
        <div className={place}>
          {extras}
          {children}
        </div>
      )
    }
    return (
      <section aria-labelledby={id} className={place}>
        <div className={SECTION_HEAD}>
          <h3 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${SUB_HEADING} ${TOC_SCROLL} focus:outline-none` : SUB_HEADING}>
            {title}
          </h3>
          <CardExtras desc={desc} action={action} />
        </div>
        {children}
      </section>
    )
  }

  return (
    <section id={anchor ?? undefined} aria-labelledby={id} className={anchor ? `${SECTION} ${className} ${TOC_SCROLL}` : `${SECTION} ${className}`}>
      <div className={SECTION_HEAD}>
        <h2 id={id} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? FOCUS_HEADING : HEADING}>
          {title}
        </h2>
        <HeadExtras desc={desc} action={action} />
      </div>
      {anchor ? <NoAnchor>{children}</NoAnchor> : children}
    </section>
  )
}

// 탭 패널 칸의 안쪽(칸 안에 또 Section이 있으면 보통 칸으로 그린다 — 설명이 머리 줄에 두 번 가지 않게)
const NoPanel = ({ children }: { children: ReactNode }) => <SectionPanelContext.Provider value={null}>{children}</SectionPanelContext.Provider>

// 빈 상태 한 줄: **자료 없음** · 안내(그래프·빈 틀 없음, AC-513.4)
export function EmptyNote({ title = '자료 없음', children }: { title?: string; children: string }) {
  return (
    <p className="mt-3 text-body text-ink-2">
      <span className="font-semibold text-ink">{title}</span> · {children}
    </p>
  )
}

// 덜 끝난 칸 표시. 글 뒤에 붙일 때는 왼쪽 6px, 사이가 정해진 자리는 className=""
export const PartialChip = ({ className = 'ml-1.5' }: { className?: string }) => <span className={`${ds.chip.warning} ${className}`}>일부 기간</span>

// 안내 줄(시안 .ch-n)
export const Note = ({ children }: { children: ReactNode }) => <p className="mt-2 text-small text-muted">{children}</p>

const DELTA_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-muted', none: 'text-muted' } as const
const ARROW = { up: '▲', down: '▼' } as const

// 증감 글자: ▲▼ + formatDelta 글자 + "늘어남"·"줄어듦". 색만 쓰지 않는다(AC-513.2, UI_GUIDE). 글자 크기는 놓는 자리를 따른다
export function DeltaText({ delta, unit }: { delta: Delta; unit: DeltaUnit }) {
  const view = formatDelta(delta, unit)
  const arrow = view.dir === 'up' || view.dir === 'down' ? ARROW[view.dir] : null
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${DELTA_TONE[view.dir]}`}>
      <span>
        {arrow && <span aria-hidden="true">{arrow} </span>}
        {view.text}
      </span>
      {view.srText && <span className="text-small font-medium">{view.srText}</span>}
    </span>
  )
}

// 칸이 많으면 휴대폰에서 막대 위 합계를 마지막 끝난 칸만 남긴다(시안 §3 '칸 13개 이상이면 마지막 칸만'). 합계 글자만 text-ink-2다
export const thinTotals = (cells: number) => (cells >= 13 ? 'max-md:[&_.text-ink-2]:invisible' : '')

// 칸이 많은 막대 그림을 감싸는 칸에 준다. 휴대폰에서 쪽이 옆으로 밀리지 않게 한다. StackedBarChart는 대시보드·미리보기와 같이 쓰고 마크업이 시험으로 고정돼 있어 밖에서 고친다.
// 날짜 글자(.text-center): 글자가 칸보다 넓으면 text-center여도 오른쪽으로만 넘친다. 세로 flex 가운데 정렬은 제 칸 가운데에서 양쪽으로 넘쳐 쪽 여백 16px 안에 든다.
// 화면 읽기 표(sr-only): 줄을 못 바꾸는 표는 width: 1px를 넘어 글자만큼 넓어지고, 보이지 않아도 쪽을 민다. 오른쪽 끝을 이 칸에 맞춰 왼쪽으로 넘긴다(왼쪽 넘침은 스크롤이 안 생긴다).
// 표를 줄바꿈시키지 않는다: 글자마다 줄이 바뀌면 표가 수천 px로 길어져 쪽이 아래로 늘어난다
export const CHART_NO_SIDE_SCROLL = ds.chartNoSideScroll // 대시보드와 같은 한 벌(dashboard-ux AC-2707.4)
