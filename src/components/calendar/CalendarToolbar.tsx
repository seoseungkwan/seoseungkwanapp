import Link from 'next/link'
import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { weekdayOf } from '@/lib/analytics/dates'
import type { CalSettings, KindColor } from '@/types/calendar'
import type { GcalLook } from '@/types/gcal'
import type { CalPaint } from './colors'
import * as G from './gcal/labels'
import { FIX_LOOK, WaitMark } from './rows/parts'

// 예약 탭 도구 줄·안내 줄 (spec clinic-calendar AC-5905.1·AC-5905.8, 시안 docs/mockups/clinic-calendar ?s=week·phone-week).
// props·콜백만 받는다: 기간 옮기기·보기 바꾸기·판 열기는 화면(CalendarScreen)이 한다. 글은 시안 그대로다.
// 이 파일 아래쪽은 예약 판 부품(AddPanel·DetailPanel·AllDayPanel·RateTable·SummaryLine·gcal/)이 같이 쓰는 작은 조각이다:
// 시각·날짜 글, 색 표시(--cal-* 토큰 이름만 쓴다, 값은 globals.css :root), 도착·변경 표시, 아이콘. 다른 부품 파일은 글(gcal/labels)·표시(rows/parts)만 import한다(순환 없음).
// 톱니(예약 설정)는 설정 › 구글 캘린더 › 시행자·종류로 가는 링크다(google-link AC-8529.3 — 옛 예약 설정 서랍은 지웠다)

export type CalView = 'day' | 'week' | 'month'

const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf 1=월 … 7=일
const pad = (n: number) => String(n).padStart(2, '0')
const year = (ymd: string) => Number(ymd.slice(0, 4))
const month = (ymd: string) => Number(ymd.slice(5, 7))
const date = (ymd: string) => Number(ymd.slice(8, 10))

/** 분 → 'HH:MM'(1440은 '24:00') */
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
/** 요일 한 글자 */
export const weekdayName = (ymd: string) => WEEKDAY[weekdayOf(ymd) - 1]!
/** '11월 18일 (수)' */
export const dayLabel = (ymd: string) => `${month(ymd)}월 ${date(ymd)}일 (${weekdayName(ymd)})`

// 기간 글을 [해, 나머지] 둘로(폰 도구 줄은 해를 숨긴다)
function periodParts(view: CalView, from: string, to: string): [string, string] {
  const head = `${year(from)}년 `
  if (view === 'month') return [head, `${month(from)}월`]
  if (view === 'day') return [head, dayLabel(from)]
  const start = `${month(from)}월 ${date(from)}일`
  if (year(from) !== year(to)) return [head, `${start} – ${year(to)}년 ${month(to)}월 ${date(to)}일`]
  if (month(from) !== month(to)) return [head, `${start} – ${month(to)}월 ${date(to)}일`]
  return [head, `${start} – ${date(to)}일`]
}

/** 보이는 기간 글: 주 '2026년 11월 16일 – 21일', 일 '2026년 11월 17일 (화)', 월 '2026년 11월' */
export function periodLabel(view: CalView, from: string, to: string): string {
  return periodParts(view, from, to).join('')
}

// ── 색(--cal-* 토큰) ─────────────────────────────────────────

/** 예약 색 11색·캘린더 기본 색의 화면 값. 토큰 이름만 쓰고 값은 globals.css :root에 있다 */
export const calVar = (color: CalPaint) => `var(--cal-${color})`
// '시행자 색 따름' 표시의 네 조각(시안 google-link i.gsw.follow의 라벤더·바나나·플라밍고 + 바질, 그라데이션 대신 네 칸)
const FOLLOW: readonly CalPaint[] = ['lavender', 'banana', 'flamingo', 'basil']

/** 색 표시 10px. color null = 시행자 색 따름(네 칸), 'default' = 캘린더 기본 색 */
export function Swatch({ color, className = '' }: { color: KindColor; className?: string }) {
  if (color === null) {
    return (
      <svg aria-hidden="true" data-swatch="follow" width="10" height="10" viewBox="0 0 10 10" className={`shrink-0 rounded-control ${className}`}>
        {FOLLOW.map((c, i) => (
          <rect key={c} x={i % 2 === 0 ? 0 : 5} y={i < 2 ? 0 : 5} width="5" height="5" fill="currentColor" style={{ color: calVar(c) }} />
        ))}
      </svg>
    )
  }
  return <span aria-hidden="true" data-swatch={color} className={`inline-block size-2.5 shrink-0 rounded-control ${className}`} style={{ backgroundColor: calVar(color) }} />
}

// ── 도착·변경 표시(시안 .mk) ──────────────────────────────────

/** 왔음: 초록 동그라미 ✓ */
export function CameMark() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" className="shrink-0 text-positive">
      <circle cx="6.5" cy="6.5" r="6.5" fill="currentColor" />
      <path d="M3.6 6.8 5.6 8.7 9.3 4.5" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="stroke-surface" />
    </svg>
  )
}

/** 안 옴: 주황 동그라미 ! */
export function NoshowMark() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" className="shrink-0 text-negative">
      <circle cx="6.5" cy="6.5" r="6.5" fill="currentColor" />
      <path d="M6.5 3.3v4" fill="none" strokeWidth="1.7" strokeLinecap="round" className="stroke-surface" />
      <circle cx="6.5" cy="9.6" r="0.95" className="fill-surface" />
    </svg>
  )
}

const TAG = 'inline-flex h-3.5 shrink-0 items-center rounded-control px-1 text-caption leading-none font-semibold'
/** 회색 '취소' 꼬리표 */
export const CancelTag = () => <span className={`${TAG} bg-line text-ink-2`}>취소</span>
/** 파란 '변경' 꼬리표(날짜나 시작 시간을 옮긴 예약) */
export const MovedTag = () => <span className={`${TAG} bg-accent-soft text-accent-strong ring-1 ring-chart-2 ring-inset`}>변경</span>

// ── 아이콘(시안 ICON, 16칸 선) ────────────────────────────────

const ICON_PATHS = {
  left: 'M10 3.5 5.5 8l4.5 4.5',
  right: 'M6 3.5 10.5 8 6 12.5',
  plus: 'M8 3v10M3 8h10',
  info: 'M8 7.2v4M8 4.8v.2',
  repeat: 'M2 6.5h12M5 1.8v2.4M11 1.8v2.4M7 10.2h4M9.3 8.4 11 10.2l-1.7 1.8',
  sync: 'M13 6.5A5 5 0 0 0 3.6 5M3 9.5A5 5 0 0 0 12.4 11M3.3 2.5v2.8h2.8M12.7 13.5v-2.8H9.9',
  lock: 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2',
  bit: 'M6 14h4M8 11v3',
} as const
export type CalIconName = keyof typeof ICON_PATHS | 'gear' | 'warn'

/** 시안의 작은 선 아이콘(꾸밈, 색은 글자색) */
export function CalIcon({ name, size = 16, className = '' }: { name: CalIconName; size?: number; className?: string }) {
  if (name === 'warn') {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" className={`shrink-0 text-warning ${className}`}>
        <path d="M8 1.8 15 14H1z" fill="currentColor" />
        <path d="M8 6v3.6" fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-surface" />
        <circle cx="8" cy="11.7" r=".9" className="fill-surface" />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`shrink-0 ${className}`}>
      {name === 'gear' && (
        <>
          <circle cx="8" cy="8" r="2.1" />
          <path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M3.8 12.2l1.1-1.1M11.1 4.9l1.1-1.1" />
        </>
      )}
      {(name === 'info' || name === 'sync' || name === 'lock' || name === 'bit' || name === 'repeat') && (
        <>
          {name === 'info' && <circle cx="8" cy="8" r="6.5" />}
          {name === 'lock' && <rect x="3" y="7" width="10" height="7" rx="1.5" />}
          {name === 'bit' && <rect x="2" y="3" width="12" height="8" rx="1.5" />}
          {name === 'repeat' && <rect x="2" y="3" width="12" height="11" rx="1.5" />}
          <path d={ICON_PATHS[name]} />
        </>
      )}
      {(name === 'left' || name === 'right' || name === 'plus') && <path d={ICON_PATHS[name]} strokeWidth={name === 'plus' ? 1.8 : 1.6} />}
    </svg>
  )
}

/** 아이콘만 있는 단추(36px, 폰 44px). bordered = 테두리 있는 보조 모양 */
export const iconButton = (bordered: boolean) =>
  `inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-control border text-ink-2 transition not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 ${ds.focusRing} ${
    bordered ? 'border-line-strong bg-surface' : 'border-transparent'
  }`

// ── 도구 줄 ─────────────────────────────────────────────────

const UNIT: Record<CalView, string> = { day: '날', week: '주', month: '달' }
const VIEWS: readonly [CalView, string][] = [
  ['day', '일'],
  ['week', '주'],
  ['month', '월'],
]

type ToolbarProps = {
  view: CalView
  from: string // 보이는 기간 첫날(YYYY-MM-DD)
  to: string // 보이는 기간 끝날
  onView(view: CalView): void
  onToday(): void
  onPrev(): void
  onNext(): void
  onAdd(): void
}

/** [오늘]·◀▶·기간 제목 | [일·주·월]·[설정]·[+ 예약 더하기]. 폰은 두 줄(제목의 해는 숨김, 단추 글은 '예약') */
export function CalendarToolbar({ view, from, to, onView, onToday, onPrev, onNext, onAdd }: ToolbarProps) {
  const [head, rest] = periodParts(view, from, to)
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-center gap-1.5 max-md:w-full">
        <button type="button" className={ds.button.secondary} onClick={onToday}>
          오늘
        </button>
        <button type="button" aria-label={`이전 ${UNIT[view]}`} className={iconButton(false)} onClick={onPrev}>
          <CalIcon name="left" size={18} />
        </button>
        <button type="button" aria-label={`다음 ${UNIT[view]}`} className={iconButton(false)} onClick={onNext}>
          <CalIcon name="right" size={18} />
        </button>
        <h1 className="ml-1.5 min-w-0 truncate text-title font-semibold text-ink tabular-nums max-md:ml-0.5 max-md:flex-1 max-md:text-lead max-md:font-semibold">
          <span className="max-md:hidden">{head}</span>
          {rest}
        </h1>
      </div>
      <div className="flex min-w-0 items-center gap-2 max-md:w-full">
        <div role="group" aria-label="보기" className={`${ds.segment.group} max-md:flex-1 max-md:grid-cols-3`}>
          {VIEWS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              className={`${ds.segment.button} ${view === value ? ds.segment.on : ds.segment.off}`}
              onClick={() => onView(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Link href={G.GCAL_COLORS_HREF} aria-label="예약 설정" title="예약 설정 (설정 › 구글 캘린더 › 시행자·종류)" className={iconButton(true)}>
          <CalIcon name="gear" size={18} />
        </Link>
        <button type="button" aria-label="예약 더하기" className={ds.button.primary} onClick={onAdd}>
          <CalIcon name="plus" />
          <span className="max-md:hidden">예약 더하기</span>
          <span className="md:hidden">예약</span>
        </button>
      </div>
    </div>
  )
}

// ── 안내 줄 ─────────────────────────────────────────────────

const GROUP = 'inline-flex flex-wrap items-center gap-x-3 gap-y-1'
const GROUP_NAME = 'font-semibold text-ink-2'
const ITEM = 'inline-flex items-center gap-1 whitespace-nowrap'

/** 이은 병원의 안내 줄(google-link AC-8532.1, notes-calendar `week` 안내 줄): 색 묶음이 '색 (구글과 같음)'이고 휴무·반차·취소·변경·캘린더 기본 색을 더한다.
 * waiting = 아직 못 보낸 것이 있음(구글 · 아직 못 보냄), fixes = 고쳐야 할 구글 예약이 있음 */
export type LegendGoogle = { look: Pick<GcalLook, 'cancel' | 'change' | 'offColor' | 'offWord'>; waiting: boolean; fixes: boolean }

function LegendBody({ settings, bit, google }: { settings: CalSettings; bit: boolean; google: LegendGoogle | null }) {
  const fixed = settings.kinds.filter((kind) => kind.color !== null)
  const follow = settings.kinds.filter((kind) => kind.color === null).map((kind) => kind.name)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-caption text-muted">
      {bit ? (
        <span className="inline-flex h-5.5 items-center gap-1.5 rounded-control bg-positive-soft px-2 font-semibold whitespace-nowrap text-positive">
          <svg aria-hidden="true" width="6" height="6" viewBox="0 0 6 6" className="shrink-0">
            <circle cx="3" cy="3" r="3" fill="currentColor" />
          </svg>
          비트 연결됨
        </span>
      ) : (
        <span className="inline-flex h-5.5 items-center rounded-control border border-line-strong bg-surface px-2 font-medium whitespace-nowrap text-muted">
          비트 없는 기기
        </span>
      )}
      <span className={GROUP}>
        <span className={GROUP_NAME}>{google ? G.LEGEND_COLOR : '색'}</span>
        {settings.staff.map((person) => (
          <span key={person.id} className={ITEM}>
            <Swatch color={person.color} />({person.mark}) {person.name}
          </span>
        ))}
        {fixed.map((kind) => (
          <span key={kind.id} className={ITEM}>
            <Swatch color={kind.color} />
            {kind.name}
          </span>
        ))}
        {bit && (
          <span className={ITEM}>
            <span aria-hidden="true" className="inline-block h-2.5 w-4.5 shrink-0 rounded-control border border-dashed border-muted bg-canvas" />
            비트 예약
          </span>
        )}
        {google && (
          <>
            <span className={ITEM}>
              <Swatch color={google.look.offColor} />
              {G.legendOff(google.look.offWord)}
            </span>
            <span className={ITEM}>
              <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-control border border-line-strong bg-surface" />
              {G.LEGEND_HALF}
            </span>
            <span className={ITEM}>
              <Swatch color={google.look.cancel} />
              {G.LEGEND_CANCEL}
            </span>
            <span className={ITEM}>
              <Swatch color={google.look.change} />
              {G.LEGEND_CHANGE}
            </span>
            <span className={ITEM}>
              <Swatch color="default" />
              {G.LEGEND_DEFAULT}
            </span>
          </>
        )}
        {follow.length > 0 && <span>{google ? G.legendFollow(follow.join('·')) : `${follow.join('·')}는 담당 색`}</span>}
      </span>
      <span className={GROUP}>
        <span className={GROUP_NAME}>도착</span>
        <span className={ITEM}>
          <CameMark />
          왔음
        </span>
        <span className={ITEM}>
          <NoshowMark />안 옴
        </span>
        <CancelTag />
        <span>표시 없음 = 아직</span>
        <span>{bit ? '비트 접수를 보고 저절로 표시해요' : '도착 표시는 비트 PC가 정해요'}</span>
      </span>
      <span className={GROUP}>
        <span className={GROUP_NAME}>변경</span>
        <span className={ITEM}>
          <MovedTag />
          날짜나 시작 시간을 옮긴 예약
        </span>
      </span>
      {google && (google.waiting || google.fixes) && (
        <span className={GROUP}>
          <span className={GROUP_NAME}>{G.LEGEND_GOOGLE}</span>
          {google.waiting && (
            <span className={ITEM}>
              <WaitMark />
              {G.LEGEND_WAIT}
            </span>
          )}
          {google.fixes && (
            <span className={ITEM}>
              <span aria-hidden="true" className={`inline-block h-2.5 w-4.5 shrink-0 rounded-control ${FIX_LOOK}`} />
              {G.LEGEND_FIX}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

/** 도구 줄 아래 안내 줄: 비트 연결 · 색 · 도착 · 변경. 폰은 [색·도착 표시 보기]로 접어 둔다(시안 기본값 23) */
export function CalendarLegend({ settings, bit, google = null }: { settings: CalSettings; bit: boolean; google?: LegendGoogle | null }): ReactNode {
  return (
    <>
      <div className="max-md:hidden">
        <LegendBody settings={settings} bit={bit} google={google} />
      </div>
      <details className="md:hidden">
        <summary className="cursor-pointer py-0.5 text-small text-ink-2">색·도착 표시 보기</summary>
        <div className="mt-2 rounded-control border border-line bg-surface px-3 py-2">
          <LegendBody settings={settings} bit={bit} google={google} />
        </div>
      </details>
    </>
  )
}
