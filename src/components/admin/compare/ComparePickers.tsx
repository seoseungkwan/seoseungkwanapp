'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { nearestMonth, type CompareMonths } from '@/lib/admin/compare/months'
import { REGION_UNKNOWN, SIDO_LIST, type Sido } from '@/lib/admin/region'
import { addMonths, monthRange } from '@/lib/analytics/dates'

// 의원 비교 머리 · 고르기 · 바로가기(spec admin-view REQ-8015 AC-8015.1, REQ-8023 AC-8023.2, design.md '화면 글자' 의원 비교·2차 의원 비교 달 10년).
// 시안 docs/mockups/admin-view ?s=compare 그대로: 작은 '관리자' → h1 → (안쪽 메뉴 자리) → 안내 → 고르기 줄(지역 · ◀ [연도] [월] ▶ · 옆 글) → 아래 줄 → 붙는 바로가기 띠.
// props·콜백만 받는다. 고를 수 있는 달은 부르는 쪽이 compareMonths로 만든 값을 넘기고, 바꾸면 onChange로 알린다(PC 화면만, 폰 전용 모양 없음)

/** 지역 고르기 값 = 화면 글자 그대로 */
export type RegionPick = '전체' | Sido | typeof REGION_UNKNOWN
export type ComparePick = { region: RegionPick; month: string }

/** 바로가기 알약 넷과 그 카드 id(순위·나란히 보기·월급·매출 카드가 이 id를 쓴다) */
export const COMPARE_SECTIONS = [
  { id: 'cmp-rank', name: '의원 순위' },
  { id: 'cmp-side', name: '통계 나란히 보기' },
  { id: 'cmp-pay', name: '직군별 월급' },
  { id: 'cmp-sales', name: '매출·환자 수' },
] as const

const INTRO = '승인한 의원들의 한 달 숫자를 나란히 봐요. 의원마다 저장된 숫자로 세고, 환자 이름 같은 개인정보는 없어요.'
const ALL = '전체'

/** 'YYYY-MM' → '2026년 10월' */
export const monthText = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`

const CAPTION = 'mb-1.5 text-caption text-muted'
// 시안 .sel: 32px · line-strong · 13px ink, 최소 128px
const SELECT = `h-8 min-w-32 cursor-pointer rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink transition hover:border-muted ${ds.focusRing}`
// 시안 .stepbox: 32px 한 상자 안에 ◀ [연도] [월] ▶, 사이 1px line
const STEP_BOX = 'inline-flex h-8 shrink-0 items-stretch overflow-clip rounded-control border border-line-strong bg-surface'
const STEP_BUTTON = `flex w-8 cursor-pointer items-center justify-center text-ink-2 transition not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`
const STEP_SELECT = 'h-full cursor-pointer border-0 border-l border-line bg-surface pr-1.5 pl-2 text-small font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 시안 .toc: 붙는 회색 띠(머리줄 102px 아래) + 아래 1px line, 앱 틀 안쪽 여백까지 넓힌다. 알약 36px · 14px 600
const TOC = 'sticky top-25.5 z-9 mt-5 -mx-6 border-b border-st-line bg-st-canvas px-6 py-2'
const TOC_STRIP = 'flex min-w-0 gap-1 overflow-x-auto'
const TOC_LINK =
  'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-body font-semibold no-underline transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const TOC_IDLE = `${TOC_LINK} text-st-ink-2 hover:bg-st-line`
const TOC_CURRENT = `${TOC_LINK} bg-st-ink text-surface`

type Props = ComparePick & {
  months: CompareMonths
  /** 보이는 의원 수(지역을 고르면 그 지역) */
  count: number
  /** 지역 모름인 승인된 의원이 있으면 고르기 끝에 '지역 모름' */
  unknownRegion: boolean
  onChange(next: ComparePick): void
  /** 관리자 안쪽 메뉴 자리(h1 아래) */
  nav?: ReactNode
}

export function ComparePickers({ region, month, months, count, unknownRegion, onChange, nav }: Props) {
  const [current, setCurrent] = useState(0)
  const year = Number(month.slice(0, 4))
  const monthNumber = Number(month.slice(5, 7))
  const yearMonths = months.years.find((entry) => entry.year === year)?.months ?? []
  const regions: readonly RegionPick[] = unknownRegion ? [ALL, ...SIDO_LIST, REGION_UNKNOWN] : [ALL, ...SIDO_LIST]
  const lastDay = Number(monthRange(month).to.slice(8))
  const where = region === ALL ? `의원 ${count}곳` : `${region} 의원 ${count}곳`
  const prevOff = month <= months.first
  const nextOff = month >= months.last

  const go = (next: string) => onChange({ region, month: next })
  const jump = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    event.preventDefault()
    setCurrent(index)
    document.getElementById(COMPARE_SECTIONS[index]!.id)?.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-small font-semibold text-muted">
            <Icon name="userCheck" size={14} className="shrink-0" />
            관리자
          </p>
          <h1 className="text-title font-semibold text-ink">의원 비교</h1>
        </div>
        {nav}
      </div>
      <p className="mt-4 max-w-140 text-body text-ink-2">{INTRO}</p>

      <div className="mt-6 border-t border-line-strong pt-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p className={CAPTION}>지역</p>
            <select aria-label="지역" value={region} onChange={(event) => onChange({ region: event.target.value as RegionPick, month })} className={SELECT}>
              {regions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className={CAPTION}>달</p>
            <div role="group" aria-label="달 고르기" className={STEP_BOX}>
              <button type="button" aria-label="앞 달" disabled={prevOff} onClick={() => go(addMonths(month, -1))} className={STEP_BUTTON}>
                <Icon name="chev" size={16} className="rotate-90" />
              </button>
              <select aria-label="연도" value={String(year)} onChange={(event) => go(nearestMonth(months.years, Number(event.target.value), monthNumber))} className={STEP_SELECT}>
                {months.years.map((entry) => (
                  <option key={entry.year} value={String(entry.year)}>
                    {`${entry.year}년`}
                  </option>
                ))}
              </select>
              <select
                aria-label="월"
                value={String(monthNumber)}
                onChange={(event) => go(`${month.slice(0, 4)}-${event.target.value.padStart(2, '0')}`)}
                className={STEP_SELECT}
              >
                {yearMonths.map((value) => (
                  <option key={value} value={String(value)}>
                    {`${value}월`}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="다음 달" disabled={nextOff} onClick={() => go(addMonths(month, 1))} className={`${STEP_BUTTON} border-l border-line`}>
                <Icon name="chev" size={16} className="-rotate-90" />
              </button>
            </div>
          </div>
          <p className="pb-2 text-caption text-muted">{`${monthText(months.first)}부터 ${monthText(months.last)}까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지`}</p>
        </div>
        <p className="mt-3 text-small text-muted">
          <span className="font-semibold text-ink">{monthText(month)}</span>
          {` · ${monthNumber}월 1일 – ${monthNumber}월 ${lastDay}일 · ${where}`}
        </p>
      </div>

      <nav aria-label="의원 비교 바로가기" className={TOC}>
        <div className={TOC_STRIP}>
          {COMPARE_SECTIONS.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={index === current ? 'true' : undefined}
              onClick={(event) => jump(event, index)}
              className={index === current ? TOC_CURRENT : TOC_IDLE}
            >
              {section.name}
            </a>
          ))}
        </div>
      </nav>
    </div>
  )
}
