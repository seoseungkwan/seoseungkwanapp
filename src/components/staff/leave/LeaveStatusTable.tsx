'use client'

import { ds } from '@/components/ui/classes'
import type { LeaveStatus } from '@/lib/staff/leave'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { Leftover, StaffMember } from '@/types/staff'
import { EMPLOYMENT_LABEL, jobLabel } from '../labels'
import { TableScroll } from '../TableScroll'
import { linkTag } from './LeaveRecord'
import { fmtDays, mmdd, nextOf, ratioOf } from './leaveView'

// 연차 현황 표 (staff AC-7614.1, 시안 leave.html ①). 재직자 한 줄씩(명단 차례): 이름 · 직종 / 이번 연차 기간 / 생긴 · 쓴 · 남은 / 남은 비율 막대 / 다음 새 연차.
// 이름을 누르면 한 사람 휴가 기록(onName). 남은 비율 25% 밑이면 막대가 주황, 남은이 음수면 빨강. 넓은 표라 좁으면 표 칸만 옆으로 밀린다(TableScroll)

export type StatusRow = { member: StaffMember; status: LeaveStatus; link: ClinicStaff | null }

const LOW = 25
const numHead = `${ds.table.th} text-right`
const cell = `${ds.table.td} py-2 align-top`
const numCell = `${ds.table.tdNum} py-2 align-top`

function Meter({ ratio }: { ratio: number | null }) {
  const low = ratio !== null && ratio < LOW
  const width = ratio === null ? 0 : Math.min(100, Math.max(0, ratio))
  return (
    <span className="flex items-center gap-2">
      <span data-meter data-low={low ? 'true' : 'false'} aria-hidden="true" className="block h-2 w-30 shrink-0 overflow-clip rounded-control bg-line">
        <span className={`block h-full rounded-control ${low ? 'bg-warning' : 'bg-accent'}`} style={{ width: `${width}%` }} />
      </span>
      <span className="text-caption text-muted tabular-nums">{ratio === null ? '—' : `${ratio}%`}</span>
    </span>
  )
}

export function LeaveStatusTable({
  labelledBy,
  rows,
  leftover,
  onName,
}: {
  labelledBy: string
  rows: readonly StatusRow[]
  leftover: Leftover
  onName(staffId: string): void
}) {
  return (
    <div className={ds.panel}>
      <TableScroll label="연차 현황 표">
        <table aria-labelledby={labelledBy} className={`${ds.table.table} min-w-225`}>
          <thead>
            <tr>
              <th scope="col" className={ds.table.th}>
                이름 · 직종
              </th>
              <th scope="col" className={ds.table.th}>
                이번 연차 기간
              </th>
              <th scope="col" className={numHead}>
                생긴
              </th>
              <th scope="col" className={numHead}>
                쓴
              </th>
              <th scope="col" className={numHead}>
                남은
              </th>
              <th scope="col" className={ds.table.th}>
                남은 비율
              </th>
              <th scope="col" className={ds.table.th}>
                다음 새 연차
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, status, link }) => {
              const next = nextOf(status)
              const ends = status.endsThisMonth
                ? leftover === 'pay'
                  ? `${mmdd(status.period.to)}에 끝나요 — 남은 ${fmtDays(Math.max(0, status.left))}은 수당으로 정산`
                  : `${mmdd(status.period.to)}에 끝나요 — 남은 ${fmtDays(status.left)}은 다음 기간에 더해요`
                : null
              return (
                <tr key={member.id} className={ds.table.row}>
                  <td className={cell}>
                    <button
                      type="button"
                      onClick={() => onName(member.id)}
                      className={`cursor-pointer font-semibold text-ink underline decoration-line-strong underline-offset-3 hover:decoration-ink ${ds.focusRing}`}
                    >
                      {member.name}
                    </button>
                    {link !== null ? (
                      <>
                        {' '}
                        <span className={`${linkTag} ml-1.5`}>{`예약 (${link.mark})`}</span>
                      </>
                    ) : null}{' '}
                    <span className="block text-caption text-muted">{`${jobLabel(member)} · ${EMPLOYMENT_LABEL[member.employment]}`}</span>
                    {member.employment === 'part' ? (
                      <>
                        {' '}
                        <span className="block text-caption text-accent">{`파트타임 — 주 ${member.weeklyHours}시간 비례`}</span>
                      </>
                    ) : null}
                    {status.firstYear ? (
                      <>
                        {' '}
                        <span className="block text-caption text-accent">1년 미만 — 달마다 1일씩 생겨요</span>
                      </>
                    ) : null}
                  </td>
                  <td className={cell}>
                    {`${status.period.from} ~ ${status.period.to}`}
                    {ends !== null ? (
                      <>
                        {' '}
                        <span className="block text-caption text-warning">{ends}</span>
                      </>
                    ) : null}
                  </td>
                  <td className={numCell}>
                    {fmtDays(status.granted)}
                    {/* 다음 해로 넘김이면 지난 기간에서 넘어온 일수(남은 = 생긴 + 넘어옴 − 쓴) */}
                    {status.carried !== 0 ? (
                      <>
                        {' '}
                        <span className="block text-caption text-muted">{`넘어옴 ${fmtDays(status.carried)}`}</span>
                      </>
                    ) : null}
                  </td>
                  <td className={numCell}>{fmtDays(status.used)}</td>
                  <td className={`${numCell} font-semibold`}>
                    {/* 음수면 빨강(칸의 text-ink와 겹치지 않게 안쪽 글자에 준다) */}
                    <span className={status.left < 0 ? 'text-negative' : undefined}>{fmtDays(status.left)}</span>
                  </td>
                  <td className={cell}>
                    <Meter ratio={ratioOf(status)} />
                  </td>
                  <td className={cell}>
                    {next === null ? (
                      '—'
                    ) : (
                      <>
                        {next.day} <span className="text-caption text-muted">{next.tail}</span>
                        {next.soon !== null ? (
                          <>
                            {' '}
                            <span className={`${ds.chip.warning} ml-1`}>{next.soon}</span>
                          </>
                        ) : null}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )
}
