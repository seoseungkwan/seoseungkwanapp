'use client'

// 개원 일정표 (spec location AC-7913.2, design.md 11절, 시안 ?s=plan, 글은 requirements '화면 글 기본값' › 개원 준비).
// 목표 개원일에서 거꾸로 센 할 일 열넷(schedule.ts OPEN_TASKS 글·날수 그대로)과 날짜·개원까지 날·메모를 보인다.
// 법 근거가 있는 할 일(open·nhis·xray)은 '근거와 출처'의 그 법 근거 줄(#law-<id>)로 가는 링크를 단다.
// 지난 할 일은 회색이고, 안 했으면 `날짜가 지났어요`가 붙는다. 다 함 표시는 할 일 id 배열(location_candidates.tasks_done)로 onDone에 넘긴다.
// 부품은 props·콜백만 쓴다. 오늘은 부르는 쪽이 한국 날짜로 넘긴다(시계를 읽지 않는다)
import Link from 'next/link'
import { useId, type MouseEvent } from 'react'
import { asOfText } from '@/components/location/common/text'
import { isYmd, weekdayOf } from '@/lib/analytics/dates'
import { commaText } from '@/lib/location/money'
import { buildSchedule, daysUntilOpen, toggleTaskDone, type OpenTaskId } from '@/lib/location/schedule'
import { look } from './look'
import { PLAN_TEXT as T, WEEKDAY } from './text'

export type OpenScheduleProps = {
  /** 목표 개원일 'YYYY-MM-DD'(location_candidates.open_on). 안 골랐으면 null */
  openOn: string | null
  /** 오늘(한국 날짜 'YYYY-MM-DD') */
  today: string
  /** 다 한 할 일 id(location_candidates.tasks_done) */
  done: readonly string[]
  /** 고른 개원일(비우면 null) */
  onOpenOn: (openOn: string | null) => void
  /** 바뀐 다 함 표시(할 일 차례의 id 배열) */
  onDone: (done: OpenTaskId[]) => void
  /** 주면 법 근거 링크를 그냥 누를 때 주소 이동 대신 부른다(새 탭 누르기는 그대로) */
  onOpenLaw?: (id: string) => void
}

const lawHref = (id: string) => `/location?tab=sources#law-${id}`
const dateText = (ymd: string) => `${asOfText(ymd)} (${WEEKDAY[weekdayOf(ymd) - 1]})`
const plainClick = (e: MouseEvent) => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey

function daysLine(openOn: string | null, today: string): string | null {
  if (openOn === null || !isYmd(openOn)) return T.noOpenOn
  const n = daysUntilOpen(openOn, today)
  if (n === null) return null
  return n >= 0 ? T.daysLeft(asOfText(today), commaText(n)) : T.daysPast(commaText(-n))
}

export function OpenSchedule({ openOn, today, done, onOpenOn, onDone, onOpenLaw }: OpenScheduleProps) {
  const uid = useId()
  const headId = `${uid}-head`
  const dateId = `${uid}-date`
  const rows = openOn === null ? [] : buildSchedule(openOn, today, done)
  const line = daysLine(openOn, today)

  const openLaw = onOpenLaw
    ? (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(e)) return
        e.preventDefault()
        onOpenLaw(id)
      }
    : undefined

  return (
    <section aria-labelledby={headId}>
      <div className={look.head}>
        <h2 id={headId} className={look.h2}>
          {T.scheduleTitle}
        </h2>
        <span className={look.aside}>{T.scheduleAside}</span>
      </div>
      <div className={look.inline}>
        <div className={`${look.field} w-50`}>
          <label htmlFor={dateId} className={look.label}>
            {T.openOn}
          </label>
          <input
            id={dateId}
            type="date"
            className={look.date}
            value={openOn ?? ''}
            onChange={(e) => onOpenOn(isYmd(e.target.value) ? e.target.value : null)}
          />
        </div>
        {line !== null && <p className={`${look.help} self-center`}>{line}</p>}
      </div>
      {rows.length > 0 && (
        <div className={look.tableWrap}>
          <table className={look.table}>
            <thead>
              <tr>
                <th className={`${look.th} w-11`}>{T.colDone}</th>
                <th className={look.th}>{T.colTask}</th>
                <th className={look.th}>{T.colDate}</th>
                <th className={look.thNum}>{T.colUntil}</th>
                <th className={look.th}>{T.colNote}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.done || row.past ? look.rowGray : look.rowNow}>
                  <td className={look.td}>
                    <input
                      type="checkbox"
                      className={look.check}
                      checked={row.done}
                      aria-label={T.doneLabel(row.text)}
                      onChange={() => onDone(toggleTaskDone(done, row.id))}
                    />
                  </td>
                  <td className={look.td}>
                    <span className={row.done ? look.struck : undefined}>
                      {row.daysBefore === 0 ? <b className="font-semibold">{row.text}</b> : row.text}
                    </span>
                  </td>
                  <td className={look.tdDate}>{dateText(row.on)}</td>
                  <td className={look.tdNum}>{row.daysBefore === 0 ? T.onTheDay : T.daysBefore(row.daysBefore)}</td>
                  <td className={look.td}>
                    <div className={look.note}>
                      {row.note !== '' && <span>{row.note}</span>}
                      {row.law !== null && (
                        <Link href={lawHref(row.law)} prefetch={false} className={look.link} onClick={openLaw?.(row.law)}>
                          {T.law}
                        </Link>
                      )}
                      {row.past && !row.done && <span className={look.chip}>{T.past}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
