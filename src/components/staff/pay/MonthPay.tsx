'use client'

import { useState } from 'react'
import { TableScroll } from '@/components/staff/TableScroll'
import { EMPLOYMENT_LABEL, jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { lineTotal, visibleItems } from '@/lib/staff/pay'
import type { MonthOvertime } from '@/lib/staff/schedule'
import type { PayItem, PayLine, PayMonth, StaffMember } from '@/types/staff'
import { AdjustPanel } from './AdjustPanel'
import { hoursCell, monthDay, monthNumber, signedWon, won } from './format'
import { ItemsEditor } from './ItemsEditor'
import { InfoLine, MonthNav, Note, ToolRow, WonInput } from './parts'

// '이달 급여' 칸 (staff AC-7615.2·AC-7615.3·AC-7615.4, 시안 pay.html ①·④). 줄은 그달 재직자(명단 차례), 칸은 그달 보이는 지급 항목.
// 금액 칸은 칸에서 나가면 그 줄만 바로 저장한다(usePayData.saveLine). 인센티브 칸은 실적 합계(누르면 인센티브 칸).
// 더 일한 시간은 근무표에서 온 회색 숫자(읽기만)이고 합계에 안 들어간다. 조정 칸은 작은 창(AdjustPanel)을 연다.
// [급여 확정]·잠금은 없다(사용자 결정)

export type MonthPayProps = {
  month: string
  members: readonly StaffMember[]
  items: readonly PayItem[]
  lineOf: (staffId: string) => PayLine
  prevOf: (staffId: string) => PayLine | null
  overtime: MonthOvertime
  payMonth: PayMonth | null
  onMonth: (month: string) => void
  onSaveLine: (line: PayLine) => void
  onCopyPrev: () => void
  onSaveItems: (items: PayItem[]) => Promise<boolean>
  readAllLines: () => Promise<PayLine[]>
  onOpenIncentive: () => void
  onDownloadExcel: () => void
}

const th = 'whitespace-nowrap border-b border-line bg-canvas px-1.5 py-1.5 text-right text-caption font-semibold text-muted'
const thGray = 'whitespace-nowrap border-b border-line bg-canvas px-1.5 py-1.5 text-right text-caption font-medium text-muted'
const td = 'whitespace-nowrap border-b border-line px-1 py-1 text-right'
const tdHours = 'whitespace-nowrap border-b border-line px-2 py-1 text-right text-small text-muted'
const foot = 'whitespace-nowrap bg-canvas px-1.5 py-2 text-right text-small font-semibold text-ink'
const footHours = 'whitespace-nowrap bg-canvas px-2 py-2 text-right text-small font-semibold text-muted'
// 인센티브 칸(시안 .calc): 점선 accent 테두리 · accent-soft, 규칙 없으면 회색
const calcOn =
  'flex h-7.5 w-full min-w-21 cursor-pointer items-center justify-end gap-1 rounded-control border border-dashed border-accent bg-accent-soft px-2 text-small font-semibold text-accent'
const calcOff =
  'flex h-7.5 w-full min-w-21 cursor-pointer items-center justify-end gap-1 rounded-control border border-dashed border-line-strong bg-canvas px-2 text-small text-muted'
const adjustCell =
  'h-7.5 w-full min-w-21 cursor-pointer rounded-control border border-line-strong bg-surface px-2 text-right text-small tabular-nums text-ink hover:border-muted'
const swatch = 'mr-1 inline-block h-3.5 w-4 rounded-control border align-middle'

const OVERTIME_KEYS = ['extended', 'night', 'holiday'] as const

export function MonthPay(props: MonthPayProps) {
  const { month, members, items, lineOf, prevOf, overtime, payMonth } = props
  const [adjustFor, setAdjustFor] = useState<string | null>(null)
  const [editingItems, setEditingItems] = useState(false)
  const shown = visibleItems(items, month)
  const prevMonth = addMonths(month, -1)
  const m = monthNumber(month)
  const joined = members.filter((member) => monthOf(member.hiredOn) === month)
  const leaving = members.filter((member) => member.leftOn !== null && monthOf(member.leftOn) === month)

  const rows = members.map((member) => {
    const line = lineOf(member.id)
    return { member, line, sum: lineTotal(line, items, month), hours: overtime.people[member.id] }
  })
  const problems = rows.filter((row) => row.sum.problem !== null)
  const itemSum = (item: PayItem) =>
    rows.reduce((sum, row) => sum + (item.kind === 'incentive' ? row.sum.incentive : (row.line.amounts[item.id] ?? 0)), 0)
  const adjustRow = rows.find((row) => row.member.id === adjustFor) ?? null

  const commitAmount = (line: PayLine, itemId: string, value: number | null) => {
    const amounts = { ...line.amounts }
    if (value === null) delete amounts[itemId]
    else amounts[itemId] = value
    props.onSaveLine({ ...line, amounts })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolRow
        left={<MonthNav month={month} onMonth={props.onMonth} />}
        right={
          <>
            <button type="button" className={ds.button.secondary} onClick={props.onCopyPrev}>
              지난달 금액 가져오기
            </button>
            <button type="button" aria-pressed={editingItems} className={ds.button.secondary} onClick={() => setEditingItems((on) => !on)}>
              항목 고치기
            </button>
            <button type="button" className={ds.button.primary} onClick={props.onDownloadExcel}>
              엑셀 받기
            </button>
          </>
        }
      />
      {editingItems && (
        <ItemsEditor items={items} month={month} onSave={props.onSaveItems} readAllLines={props.readAllLines} onClose={() => setEditingItems(false)} />
      )}
      <InfoLine>금액은 실수령 기준으로 적어요. 세전 금액과 세금·4대보험은 세무사가 계산해요.</InfoLine>
      <div className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
        {payMonth?.copiedOn != null && <span className={ds.chip.neutral}>{`${monthNumber(prevMonth)}월 금액을 가져왔어요 · ${monthDay(payMonth.copiedOn)}`}</span>}
        <span className={ds.chip.neutral}>{`이달 입사 ${joined.length === 0 ? '없음' : joined.map((p) => p.name).join(' · ')}`}</span>
        <span className={ds.chip.neutral}>{`이달 퇴사 ${leaving.length === 0 ? '없음' : leaving.map((p) => p.name).join(' · ')}`}</span>
        <span className="ml-auto">칸에서 나가면 바로 저장돼요. 언제든 다시 고칠 수 있어요.</span>
      </div>
      <TableScroll label="이달 급여 표 (옆으로 밀어 보기)">
        <table aria-label="이달 급여 표" className="w-full border-collapse rounded-control border border-line bg-surface text-small tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className={`${th} pl-3 text-left`}>
                이름
              </th>
              <th colSpan={shown.length} scope="colgroup" className={`${th} text-center`}>
                지급 항목 · 실수령 기준 (원)
              </th>
              <th colSpan={3} scope="colgroup" className={`${thGray} text-center`}>
                더 일한 시간 · 근무표에서 자동 (시간)
              </th>
              <th rowSpan={2} scope="col" className={th}>
                조정(±)
              </th>
              <th rowSpan={2} scope="col" className={`${th} pr-3`}>
                합계 (원)
              </th>
            </tr>
            <tr>
              {shown.map((item) => (
                <th key={item.id} scope="col" className={th}>
                  {item.name}
                </th>
              ))}
              <th scope="col" className={thGray}>
                연장
              </th>
              <th scope="col" className={thGray}>
                야간
              </th>
              <th scope="col" className={thGray}>
                휴일
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, line, sum, hours }) => {
              const prev = prevOf(member.id)
              const joinedHere = monthOf(member.hiredOn) === month
              const leftHere = member.leftOn !== null && monthOf(member.leftOn) === month
              return (
                <tr key={member.id}>
                  <th scope="row" className="whitespace-nowrap border-b border-line py-1 pr-2 pl-3 text-left font-normal">
                    <b className="block text-body font-semibold text-ink">{member.name}</b>
                    <span className="block text-caption text-muted">{`${jobLabel(member)} · ${EMPLOYMENT_LABEL[member.employment]}`}</span>
                    {(joinedHere || leftHere) && (
                      <span className="mt-0.5 flex gap-1">
                        {joinedHere && <span className={ds.chip.accent}>{`${m}월 입사`}</span>}
                        {leftHere && <span className={ds.chip.neutral}>{`${m}월 퇴사`}</span>}
                      </span>
                    )}
                  </th>
                  {shown.map((item) => (
                    <td key={item.id} className={td}>
                      {item.kind === 'incentive' ? (
                        <button
                          type="button"
                          aria-label={`${member.name} 인센티브 ${line.incentives.length === 0 ? '없음' : `${won(sum.incentive)}원`} — 이달 실적 보기`}
                          className={line.incentives.length === 0 ? calcOff : calcOn}
                          onClick={props.onOpenIncentive}
                        >
                          {`${line.incentives.length === 0 ? '–' : won(sum.incentive)} ›`}
                        </button>
                      ) : (
                        <WonInput
                          label={`${member.name} ${item.name}`}
                          value={line.amounts[item.id] ?? null}
                          changed={line.amounts[item.id] !== undefined && prev?.amounts[item.id] !== line.amounts[item.id]}
                          onCommit={(value) => commitAmount(line, item.id, value)}
                        />
                      )}
                    </td>
                  ))}
                  {OVERTIME_KEYS.map((kind) => (
                    <td key={kind} className={tdHours}>
                      {hoursCell(hours?.[kind] ?? 0)}
                    </td>
                  ))}
                  <td className={td}>
                    <button type="button" aria-label={`${member.name} 조정(±)`} className={adjustCell} onClick={() => setAdjustFor(member.id)}>
                      {line.adjust === 0 ? '' : signedWon(line.adjust)}
                    </button>
                  </td>
                  <td className={`${td} pr-3 font-semibold ${sum.problem !== null ? 'text-negative' : 'text-ink'}`}>{won(sum.total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={`${foot} pl-3 text-left`}>{`합계 (${rows.length}명)`}</td>
              {shown.map((item) => (
                <td key={item.id} className={foot}>
                  {won(itemSum(item))}
                </td>
              ))}
              {OVERTIME_KEYS.map((kind) => (
                <td key={kind} className={footHours}>
                  {hoursCell(members.reduce((sum, member) => sum + (overtime.people[member.id]?.[kind] ?? 0), 0))}
                </td>
              ))}
              <td className={foot}>{won(rows.reduce((sum, row) => sum + row.line.adjust, 0))}</td>
              <td className={`${foot} pr-3`}>{won(rows.reduce((sum, row) => sum + row.sum.total, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      {problems.map(({ member }) => (
        <p key={member.id} role="alert" className={ds.fieldError}>
          {`${member.name} 님 합계가 0원보다 적어요. 저장하지 않았어요.`}
        </p>
      ))}
      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted">
          <span>
            <i className={`${swatch} border-line-strong bg-surface`} />
            {`${monthNumber(prevMonth)}월에서 그대로 가져온 칸`}
          </span>
          <span>
            <i className={`${swatch} border-warning bg-warning-soft`} />
            이달 바꾼 칸
          </span>
          <span>
            <i className={`${swatch} border-dashed border-accent bg-accent-soft`} />
            인센티브 — 실적으로 계산 (누르면 ② 이달 실적)
          </span>
          <span>
            <span className="mr-1 font-semibold text-muted">회색 숫자</span>
            <span>근무표에서 자동 (여기서 못 고침)</span>
          </span>
          <span className="basis-full">
            입사·퇴사한 달에는 이름 아래에 <span className={ds.chip.accent}>2월 입사</span> <span className={ds.chip.neutral}>3월 퇴사</span>처럼 칩이 붙어요.
            {joined.length === 0 && leaving.length === 0 && ` ${m}월은 입사·퇴사가 없어요.`}
          </span>
        </div>
        {adjustRow !== null && (
          <AdjustPanel
            key={adjustRow.member.id}
            line={adjustRow.line}
            name={adjustRow.member.name}
            onSave={props.onSaveLine}
            onClose={() => setAdjustFor(null)}
          />
        )}
      </div>
      <Note>
        합계 = 지급 항목 + 조정. 회색 &apos;더 일한 시간&apos;은 금액이 아니라서 합계에 안 들어가요(연장수당 금액은 원장님이 적어요). [급여 확정]·잠금 단추는 없어요.
      </Note>
    </div>
  )
}
