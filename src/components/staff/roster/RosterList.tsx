'use client'

import { useId } from 'react'
import { Swatch } from '@/components/calendar/CalendarToolbar'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { WriteOnly } from '@/components/shell/viewing'
import { TableScroll } from '@/components/staff/TableScroll'
import { ds } from '@/components/ui/classes'
import { phoneText } from '@/lib/clinic/format'
import { canPurge, keepUntil, tenure, upcoming } from '@/lib/staff/roster'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { StaffMember } from '@/types/staff'
import { Segment } from '../schedule/parts'
import { weekdayName } from './rosterText'

// 명단 첫 화면(staff AC-7612.1 · AC-7612.5, 시안 list.html ①·⑤): 앞으로 7일 알림 줄 · 재직/퇴사 고르기 · 단추 셋 · 표.
// 넓은 표는 TableScroll 칸만 옆으로 밀린다(폰 전용 모양 없음 — 재직/퇴사 고르기도 근무표와 같은 PC 틀 Segment). 줄을 누르면(이름 단추로도) 직원 카드다
// 관리자가 다른 의원을 보는 중이면(admin-view AC-8009.3) [＋ 직원 더하기]·[엑셀 올리기]·[지우기]가 없다([엑셀 양식 받기]는 받기라 그대로)

export type RosterTab = 'active' | 'left'

export const TEMPLATE_HREF = '/staff/staff-template.xlsx'
export const TEMPLATE_NAME = '직원명단-양식.xlsx'

/** [엑셀 양식 받기] — 양식 파일을 '직원명단-양식.xlsx'로 내려받는다(AC-7612.4) */
export function TemplateLink() {
  return (
    <a href={TEMPLATE_HREF} download={TEMPLATE_NAME} className={ds.button.secondary}>
      엑셀 양식 받기
    </a>
  )
}

/** 예약 시행자 '({표시}) {이름}'(색 표시 + 글자). 병원 정보 목록에 없으면 null */
export function CalendarPerson({ staff }: { staff: ClinicStaff }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Swatch color={staff.color} />
      {`(${staff.mark}) ${staff.name}`}
    </span>
  )
}

// 숫자 칸 머리는 오른쪽 맞춤(왼쪽 맞춤 클래스와 겹치지 않게 바꿔 낀다)
const thNum = ds.table.th.replace('text-left', 'text-right')
const rowButton = `cursor-pointer rounded-control text-left font-semibold text-ink ${ds.focusRing}`
const muted = 'text-muted'

function Alerts({ members, today }: { members: readonly StaffMember[]; today: string }) {
  const headId = useId()
  const alerts = upcoming(members, today)
  if (alerts.length === 0) return null
  const nameOf = new Map(members.map((m) => [m.id, m.name]))
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-warning-soft px-3 py-2 text-small">
      <span id={headId} className="font-semibold text-warning">
        앞으로 7일
      </span>
      <ul aria-labelledby={headId} className="flex flex-wrap gap-2">
        {alerts.map((alert) => (
          <li key={`${alert.kind}-${alert.staffId}-${alert.day}`} className="inline-flex items-center gap-1 rounded-control border border-line bg-surface px-2 py-0.5 text-ink">
            {alert.kind === 'birthday' ? '🎂 생일 ' : `🎉 입사 ${alert.years}주년 `}
            <b>{nameOf.get(alert.staffId)}</b> <small className="text-caption text-muted">{`${alert.day.slice(5)} ${weekdayName(alert.day)}요일`}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RosterList({
  members,
  active,
  left,
  today,
  tab,
  remaining,
  calendarStaff,
  onTab,
  onOpen,
  onAdd,
  onPickExcel,
  onPurge,
}: {
  members: readonly StaffMember[]
  active: readonly StaffMember[]
  left: readonly StaffMember[]
  today: string
  tab: RosterTab
  /** 남은 연차 글('3일'), 아직 모르면 '–' */
  remaining(member: StaffMember): string
  calendarStaff(id: string | null): ClinicStaff | null
  onTab(tab: RosterTab): void
  onOpen(member: StaffMember): void
  onAdd(): void
  onPickExcel(): void
  onPurge(member: StaffMember): void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Alerts members={members} today={today} />
      <div className="flex flex-wrap items-center gap-2">
        <Segment
          label="재직·퇴사"
          options={[
            ['active', `재직 ${active.length}`],
            ['left', `퇴사 ${left.length}`],
          ]}
          value={tab}
          onChange={onTab}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <WriteOnly>
            <button type="button" className={ds.button.primary} onClick={onAdd}>
              ＋ 직원 더하기
            </button>
          </WriteOnly>
          <TemplateLink />
          <WriteOnly>
            <button type="button" className={ds.button.secondary} onClick={onPickExcel}>
              엑셀 올리기
            </button>
          </WriteOnly>
        </div>
      </div>
      <div className={ds.panel}>
        {tab === 'active' ? (
          <TableScroll label="재직 직원">
            <table aria-label="재직 직원" className={ds.table.table}>
              <thead>
                <tr>
                  {['이름', '직종', '근무 형태 (주 시간)', '입사일', '근속'].map((head) => (
                    <th key={head} className={ds.table.th}>
                      {head}
                    </th>
                  ))}
                  <th className={thNum}>남은 연차</th>
                  <th className={ds.table.th}>연락처</th>
                  <th className={ds.table.th}>예약 시행자</th>
                </tr>
              </thead>
              <tbody>
                {active.map((member) => {
                  const staff = calendarStaff(member.calendarStaffId)
                  return (
                    <tr key={member.id} className={`${ds.table.row} cursor-pointer`} onClick={() => onOpen(member)}>
                      <td className={ds.table.td}>
                        <button type="button" className={rowButton}>
                          {member.name}
                        </button>
                      </td>
                      <td className={ds.table.td}>{jobLabel(member)}</td>
                      <td className={ds.table.td}>{`${EMPLOYMENT_LABEL[member.employment]} · 주 ${member.weeklyHours}시간`}</td>
                      <td className={ds.table.tdSub}>{member.hiredOn}</td>
                      <td className={ds.table.td}>{tenure(member.hiredOn, today)}</td>
                      <td className={ds.table.tdNum}>{remaining(member)}</td>
                      <td className={ds.table.tdSub}>{member.phone === null ? <span className={muted}>없음</span> : phoneText(member.phone)}</td>
                      <td className={ds.table.td}>{staff === null ? <span className={muted}>없음</span> : <CalendarPerson staff={staff} />}</td>
                    </tr>
                  )
                })}
                {active.length === 0 && (
                  <tr>
                    <td colSpan={8} className={ds.table.emptyRow}>
                      재직 중인 직원이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
        ) : (
          <TableScroll label="퇴사 직원">
            <table aria-label="퇴사 직원" className={ds.table.table}>
              <thead>
                <tr>
                  {['이름', '직종', '입사일', '퇴사일', '보관'].map((head) => (
                    <th key={head} className={ds.table.th}>
                      {head}
                    </th>
                  ))}
                  <th className={ds.table.th} />
                </tr>
              </thead>
              <tbody>
                {left.map((member) => {
                  const purge = canPurge(member, today)
                  return (
                    <tr key={member.id} className={`${ds.table.row} cursor-pointer`} onClick={() => onOpen(member)}>
                      <td className={ds.table.td}>
                        <button type="button" className={rowButton}>
                          {member.name}
                        </button>
                      </td>
                      <td className={ds.table.td}>{jobLabel(member)}</td>
                      <td className={ds.table.tdSub}>{member.hiredOn}</td>
                      <td className={ds.table.tdSub}>{member.leftOn}</td>
                      <td className={ds.table.td}>
                        {purge ? <span className={ds.chip.warning}>지울 때가 됐어요</span> : <span className={muted}>{`${keepUntil(member.leftOn!)}까지 보관`}</span>}
                      </td>
                      <td className={ds.table.td}>
                        {purge && (
                          <WriteOnly>
                            <button
                              type="button"
                              className={ds.button.secondarySmall}
                              onClick={(event) => {
                                event.stopPropagation()
                                onPurge(member)
                              }}
                            >
                              지우기
                            </button>
                          </WriteOnly>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {left.length === 0 && (
                  <tr>
                    <td colSpan={6} className={ds.table.emptyRow}>
                      퇴사한 직원이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </div>
  )
}
