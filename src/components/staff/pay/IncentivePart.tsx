'use client'

import { TableScroll } from '@/components/staff/TableScroll'
import { jobLabel } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { incentiveAmount } from '@/lib/staff/pay'
import type { IncentiveEntry, PayLine, StaffMember } from '@/types/staff'
import { won } from './format'
import { InfoLine, MonthNav, Note, ToolRow, WonInput } from './parts'

// '인센티브' 칸 첫 화면 — 이달 실적 입력 (staff AC-7615.5, 시안 pay.html ②). 줄은 그달 급여 줄이 복사해 둔 인센티브 규칙(없으면 지금 규칙).
// 건수·매출만 적고(0 이상 정수, 칸에서 나가면 그 줄 저장) 금액은 pay.ts incentiveAmount가 센다(원 미만 버림). 실적은 지난달을 가져오지 않는다

const th = 'whitespace-nowrap border-b border-line bg-canvas px-3 py-2 text-left text-caption font-semibold text-muted'
const td = 'whitespace-nowrap border-b border-line px-3 py-2 text-left text-small text-ink'

function howText(entry: IncentiveEntry): { name: string; detail: string } {
  if (entry.method === 'per_case') return { name: '건당 정액', detail: `1건에 ${won(entry.unitAmount ?? 0)}원` }
  if (entry.method === 'percent') return { name: '매출의 %', detail: `매출의 ${entry.percent ?? 0}%` }
  return { name: '고정 수당', detail: `매달 ${won(entry.unitAmount ?? 0)}원` }
}

function calcText(entry: IncentiveEntry): string {
  if (entry.method === 'per_case') return `${won(entry.count ?? 0)}건 × ${won(entry.unitAmount ?? 0)}원`
  if (entry.method === 'percent') return `${won(entry.sales ?? 0)}원 × ${entry.percent ?? 0}%`
  return '매달 같은 금액'
}

export function IncentivePart({
  month,
  members,
  lineOf,
  onMonth,
  onSaveLine,
  onOpenRules,
}: {
  month: string
  members: readonly StaffMember[]
  lineOf: (staffId: string) => PayLine
  onMonth: (month: string) => void
  onSaveLine: (line: PayLine) => void
  onOpenRules: () => void
}) {
  const people = members.map((member) => ({ member, line: lineOf(member.id) }))
  const withRules = people.filter((p) => p.line.incentives.length > 0)
  const without = people.filter((p) => p.line.incentives.length === 0)
  const sumOf = (line: PayLine) => line.incentives.reduce((sum, entry) => sum + incentiveAmount(entry), 0)

  const commit = (line: PayLine, index: number, field: 'count' | 'sales', value: number | null) => {
    const incentives = line.incentives.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    onSaveLine({ ...line, incentives })
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolRow
        left={<MonthNav month={month} onMonth={onMonth} suffix=" 실적" />}
        right={
          <button type="button" className={ds.button.secondary} onClick={onOpenRules}>
            인센티브 규칙 고치기
          </button>
        }
      />
      <InfoLine>건수·매출은 이달 숫자를 그대로 적어요(0 이상). 원 미만은 항목마다 버려요. 빼야 할 돈은 ① 표의 조정 칸에 적어요.</InfoLine>
      <TableScroll label="인센티브 실적 표 (옆으로 밀어 보기)">
        <table aria-label="인센티브 실적 표" className="w-full border-collapse rounded-control border border-line bg-surface text-small tabular-nums">
          <thead>
            <tr>
              <th scope="col" className={th}>
                항목
              </th>
              <th scope="col" className={th}>
                방식
              </th>
              <th scope="col" className={th}>
                이달 실적 (적는 칸)
              </th>
              <th scope="col" className={th}>
                계산
              </th>
              <th scope="col" className={`${th} text-right`}>
                인센티브 (원)
              </th>
            </tr>
          </thead>
          <tbody>
            {withRules.flatMap(({ member, line }) => [
              <tr key={member.id} className="bg-canvas">
                <td colSpan={4} className={`${td} border-t border-line-strong`}>
                  <b className="text-body font-semibold">{member.name}</b>
                  <small className="ml-1.5 text-caption text-muted">{jobLabel(member)}</small>
                </td>
                <td className={`${td} border-t border-line-strong text-right font-semibold`}>{won(sumOf(line))}</td>
              </tr>,
              ...line.incentives.map((entry, i) => {
                const how = howText(entry)
                return (
                  <tr key={`${member.id}-${entry.ruleId ?? i}`}>
                    <td className={`${td} pl-6`}>{entry.name}</td>
                    <td className={`${td} text-ink-2`}>
                      <span className="block">{how.name}</span>
                      <small className="block text-caption text-muted">{how.detail}</small>
                    </td>
                    <td className={td}>
                      {entry.method === 'fixed' ? (
                        <span className="text-caption text-muted">적을 것 없음</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <WonInput
                            label={`${member.name} ${entry.name} ${entry.method === 'per_case' ? '건수' : '매출'}`}
                            value={entry.method === 'per_case' ? entry.count : entry.sales}
                            filled={(entry.method === 'per_case' ? entry.count : entry.sales) !== null}
                            className={entry.method === 'per_case' ? 'max-w-16' : 'max-w-28'}
                            onCommit={(value) => commit(line, i, entry.method === 'per_case' ? 'count' : 'sales', value)}
                          />
                          {entry.method === 'per_case' ? '건' : '원'}
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-caption text-muted`}>{calcText(entry)}</td>
                    <td className={`${td} text-right`}>{won(incentiveAmount(entry))}</td>
                  </tr>
                )
              }),
            ])}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className={`${td} bg-canvas font-semibold`}>{`합계 (${withRules.length}명)`}</td>
              <td className={`${td} bg-canvas text-right font-semibold`}>{won(withRules.reduce((sum, p) => sum + sumOf(p.line), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>
      {without.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-line-strong bg-surface px-4 py-2 text-small text-ink-2">
          <p>
            인센티브 규칙이 없는 사람: <b className="font-semibold text-ink">{without.map((p) => p.member.name).join(' · ')}</b>
          </p>
          <button type="button" className={`${ds.button.secondarySmall} ml-auto`} onClick={onOpenRules}>
            규칙 더하기
          </button>
        </div>
      )}
      <Note>노란 칸 = 이달 적은 실적. 실적 칸은 지난달 숫자를 가져오지 않고 매달 새로 적어요(고정 수당은 적을 것 없음).</Note>
    </div>
  )
}
