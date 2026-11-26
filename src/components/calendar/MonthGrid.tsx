import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, weekdayOf, weekStartOf } from '@/lib/analytics/dates'
import { monthCells } from '@/lib/calendar/counts'
import type { CalAllDay } from '@/lib/calendar/shapes'
import type { CalCountRow, CalSettings } from '@/types/calendar'
import { allDayChipClass, allDayText, dateNum, dayLabel } from './rows/parts'

// 월 보기(spec clinic-calendar AC-5905.1·AC-5906.3, 시안 ?s=month·기본값 6번). 목록이 아니라 날마다 수만 그린다(monthCells):
// `예약 N`(취소 뺌) · 종일 칩 · 종류별 수(설정 차례, 지운 종류는 뒤) · `안 옴 N`(오늘 전 날만) · `변경 N`.
// 월~일 7칸으로 그 달을 덮는 주 전부. 날을 누르면 그날 일 보기(onDay). 이름·차트번호 없는 수 세기 줄만 받는다.
// 달 밖 날은 옅은 바탕 + muted 글(시안은 faint 글이지만 UI_GUIDE '대비': 글자는 muted 이상).
// 병원 정보 휴진일(closedDates, spec clinic-profile AC-6603.3)은 칸에 '휴진' + 회색 바탕. 수는 그대로 세고 누르면 그날 일 보기다.
// 반차 휴무 칩은 '오전 휴무'·'오후 휴무'(rows/parts allDayText, spec staff AC-7616.1)
// 구글과 이은 병원(linked, spec google-link AC-8545.1)은 `변경 N`에 g_moved인 예약만 센다(처음 자리만 있는 예약은 세지 않음)

export type MonthGridProps = {
  month: string // 'YYYY-MM'
  rows: readonly CalCountRow[]
  allday: readonly CalAllDay[]
  settings: Pick<CalSettings, 'kinds' | 'staff' | 'closedDates'>
  today: string
  /** 구글과 이은 병원. 주지 않으면 지금 그대로(처음 자리도 변경) */
  linked?: boolean
  onDay: (day: string) => void
}

const WEEK_HEAD = ['월', '화', '수', '목', '금', '토', '일']

function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDays(next, -1)
}

export function MonthGrid({ month, rows, allday, settings, today, linked = false, onDay }: MonthGridProps) {
  const first = `${month}-01`
  const last = lastDayOf(month)
  const cells = monthCells(rows, allday, weekStartOf(first), addDays(weekStartOf(last), 6), today, linked)
  const kindOrder = (id: string) => {
    const i = settings.kinds.findIndex((k) => k.id === id)
    return i < 0 ? settings.kinds.length : i
  }
  const closedDates = new Set(settings.closedDates ?? [])
  return (
    <section aria-label="월 보기" className="min-w-0 overflow-clip rounded-control border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line-strong bg-canvas">
        {WEEK_HEAD.map((w) => (
          <span key={w} className="px-2 py-1.5 text-caption font-semibold text-muted">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const out = compareYmd(cell.day, first) < 0 || compareYmd(cell.day, last) > 0
          const isToday = cell.day === today
          const closed = closedDates.has(cell.day)
          // 설정 차례로(같으면 monthCells 차례), 지운 종류는 뒤
          const kinds = cell.kinds.map((k, at) => ({ ...k, at })).sort((x, y) => kindOrder(x.kindId) - kindOrder(y.kindId) || x.at - y.at)
          const dim = out ? 'text-muted' : ''
          const shade = closed ? 'bg-canvas' : out ? 'bg-canvas/60' : ''
          return (
            <button
              key={cell.day}
              type="button"
              data-out={out ? 'true' : undefined}
              data-closed={closed ? 'true' : undefined}
              aria-label={`${dayLabel(cell.day)}${closed ? ' 휴진' : ''} 예약 ${cell.total}`}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => onDay(cell.day)}
              className={`relative flex min-h-31 min-w-0 cursor-pointer flex-col gap-1 border-b border-line px-2 pt-1.5 pb-2 text-left hover:bg-canvas max-md:min-h-16 max-md:items-center max-md:gap-0.5 max-md:p-1 ${shade} ${(i + 1) % 7 ? 'border-r' : ''} ${ds.focusRing}`}
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={
                    isToday
                      ? 'grid size-6 place-items-center rounded-full bg-accent text-small font-semibold text-surface tabular-nums'
                      : `text-small font-semibold tabular-nums ${out || weekdayOf(cell.day) === 7 ? 'text-muted' : 'text-ink'}`
                  }
                >
                  {dateNum(cell.day)}
                </span>
                {closed ? <span className="text-caption font-semibold whitespace-nowrap text-muted">휴진</span> : null}
                {cell.total ?<span className={`whitespace-nowrap text-small font-semibold max-md:hidden ${out ? 'text-muted' : 'text-ink'}`}>예약 {cell.total}</span> : null}
              </span>
              {cell.allday.length ? <span aria-hidden="true" className="hidden size-1.5 rounded-full bg-muted max-md:block" /> : null}
              {cell.allday.map((it) => (
                <span key={it.id} className={`block truncate rounded-control px-1.5 py-px text-caption font-semibold max-md:hidden ${allDayChipClass(it, settings.staff)}`}>
                  {allDayText(it, settings.staff)}
                </span>
              ))}
              {kinds.length ? (
                <span data-kinds className={`text-caption max-md:hidden ${dim || 'text-muted'}`}>
                  {kinds.map((k, at) => `${at ? ' · ' : ''}${k.kindName} ${k.n}`).join('')}
                </span>
              ) : null}
              {cell.noshow || cell.moved ? (
                <span className="flex flex-wrap gap-x-2.5 max-md:hidden">
                  {cell.noshow ? <span className={`text-caption font-semibold ${dim || 'text-negative'}`}>안 옴 {cell.noshow}</span> : null}
                  {cell.moved ? <span className={`text-caption font-semibold ${dim || 'text-accent-strong'}`}>변경 {cell.moved}</span> : null}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
