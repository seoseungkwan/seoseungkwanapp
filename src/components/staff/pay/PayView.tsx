'use client'

import { useMemo, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { StaffBase } from '@/components/staff/useStaffBase'
import { ds } from '@/components/ui/classes'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import { copyPrev, newLine } from '@/lib/staff/pay'
import { employedIn } from '@/lib/staff/roster'
import { monthOvertime } from '@/lib/staff/schedule'
import { downloadTaxExcel, taxSheet } from '@/lib/staff/taxExcel'
import type { PayItem, PayLine } from '@/types/staff'
import { IncentivePart } from './IncentivePart'
import { LaborCost } from './LaborCost'
import { MonthPay } from './MonthPay'
import { MonthNav, Reading, ToolRow } from './parts'
import { monthLeaves, remainingIn, taxInput } from './payPeople'
import { RulesEditor } from './RulesEditor'
import { SlipPart } from './SlipPart'
import { TaxFiles } from './TaxFiles'
import { usePayData, type LoadRevenue } from './usePayData'

// 급여 화면 (staff REQ-7615, design.md 6절 '급여', 시안 pay.html ①~⑧). 작은 메뉴 다섯(이달 급여·인센티브·세무사 파일·인건비·명세서)이 한 화면 안에서 바뀌고
// 고른 칸은 주소 ?part= 하나로 기억한다(history.replaceState — 다시 그리지 않음). 달 고르기는 다섯 칸이 함께 쓴다(세무사 파일·규칙 고치기는 달이 없다).
// 자료는 usePayData(보는 달 기준)가 읽고 저장한다. 읽기 실패는 E-STAFF-READ-FAILED + [다시 불러오기], 저장 실패는 E-STAFF-SAVE-FAILED(값은 화면에 남음).
// 페이지 제목 '직원'과 탭 작은 메뉴는 staff/layout이 그린다

export const PAY_PARTS = ['month', 'incentive', 'files', 'cost', 'slip'] as const
export type PayPart = (typeof PAY_PARTS)[number]
const PART_LABEL: Record<PayPart, string> = { month: '이달 급여', incentive: '인센티브', files: '세무사 파일', cost: '인건비', slip: '명세서' }

const partOf = (value: string | null): PayPart => (PAY_PARTS as readonly string[]).find((part) => part === value) as PayPart | undefined ?? 'month'

export type PayViewProps = { base: StaffBase; today: string; initialPart: string | null; loadRevenue: LoadRevenue }

export function PayView({ base, today, initialPart, loadRevenue }: PayViewProps) {
  const [part, setPart] = useState<PayPart>(() => partOf(initialPart))
  const [month, setMonth] = useState(() => monthOf(today))
  const [rulesOpen, setRulesOpen] = useState(false)
  const [excelFailed, setExcelFailed] = useState(false)
  const pay = usePayData(base, month, loadRevenue)
  const { data } = pay
  const { settings, clinic } = base
  const items = settings.payItems
  const prevMonth = addMonths(month, -1)

  const members = useMemo(() => base.members.filter((member) => employedIn(member, month)), [base.members, month])
  const overtime = useMemo(() => monthOvertime(data?.overtime ?? [], month), [data, month])

  const choose = (next: PayPart) => {
    setPart(next)
    setRulesOpen(false)
    window.history.replaceState(window.history.state, '', `?part=${next}`)
  }

  const find = (m: string, staffId: string): PayLine | null => data?.lines.find((line) => line.month === m && line.staffId === staffId) ?? null
  const lineOf = (staffId: string): PayLine => find(month, staffId) ?? newLine({ month, staffId, rules: data?.rules ?? [] })
  const prevOf = (staffId: string) => find(prevMonth, staffId)
  const payMonth = data?.months.find((row) => row.month === month) ?? null

  const copyFromPrev = () => {
    for (const member of members) {
      const line = lineOf(member.id)
      const next = copyPrev(line, prevOf(member.id), items, month)
      if (JSON.stringify(next.amounts) !== JSON.stringify(line.amounts)) pay.saveLine(next)
    }
    void pay.saveMonth({ month, employerCost: payMonth?.employerCost ?? null, costSavedOn: payMonth?.costSavedOn ?? null, copiedOn: today })
  }

  const saveItems = async (next: PayItem[]): Promise<boolean> => {
    try {
      await base.store.saveSettings({ ...settings, payItems: next })
    } catch {
      return false
    }
    base.reload()
    return true
  }

  const downloadExcel = () => {
    if (data === null) return
    try {
      const input = taxInput({
        month,
        hospitalName: clinic.name,
        items,
        members,
        lines: data.lines,
        overtime,
        leaves: data.leaves,
        settings,
        days: { hours: clinic.profile.hours, closedDates: clinic.profile.closedDates },
      })
      downloadTaxExcel(taxSheet(input))
      setExcelFailed(false)
    } catch {
      setExcelFailed(true)
    }
  }

  const retry = () => {
    base.reload()
    pay.reload()
  }

  const monthTool = <ToolRow left={<MonthNav month={month} onMonth={setMonth} suffix={part === 'incentive' ? ' 실적' : ''} />} />

  const body = () => {
    if (part === 'files') return <TaxFiles files={base.files} month={month} />
    if (pay.state === 'failed')
      return (
        <div className="flex flex-col items-start gap-3">
          {monthTool}
          <ErrorCard code="E-STAFF-READ-FAILED" />
          <button type="button" className={ds.button.secondary} onClick={retry}>
            다시 불러오기
          </button>
        </div>
      )
    if (data === null)
      return (
        <div className="flex flex-col gap-3">
          {monthTool}
          <Reading />
        </div>
      )
    if (part === 'incentive' && rulesOpen)
      return <RulesEditor members={members} rules={data.rules} onSave={pay.saveRules} onBack={() => setRulesOpen(false)} />
    if (part === 'incentive')
      return <IncentivePart month={month} members={members} lineOf={lineOf} onMonth={setMonth} onSaveLine={pay.saveLine} onOpenRules={() => setRulesOpen(true)} />
    if (part === 'cost')
      return (
        <LaborCost
          month={month}
          today={today}
          members={members}
          items={items}
          lines={data.lines}
          months={data.months}
          revenue={pay.revenue}
          onMonth={setMonth}
          onSaveMonth={pay.saveMonth}
        />
      )
    if (part === 'slip')
      return (
        <SlipPart
          month={month}
          hospital={clinic.name}
          members={members}
          items={items}
          lineOf={lineOf}
          overtimeOf={(staffId) => overtime.people[staffId]}
          leavesOf={(staffId) => monthLeaves(data.leaves, staffId, month)}
          remainingOf={(staffId) => {
            const member = members.find((m) => m.id === staffId)
            return member === undefined ? null : remainingIn(member, data.leaves, settings, month)
          }}
          onMonth={setMonth}
        />
      )
    return (
      <MonthPay
        month={month}
        members={members}
        items={items}
        lineOf={lineOf}
        prevOf={prevOf}
        overtime={overtime}
        payMonth={payMonth}
        onMonth={setMonth}
        onSaveLine={pay.saveLine}
        onCopyPrev={copyFromPrev}
        onSaveItems={saveItems}
        readAllLines={pay.allLines}
        onOpenIncentive={() => choose('incentive')}
        onDownloadExcel={downloadExcel}
      />
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div role="group" aria-label="급여 안 메뉴" className={`${ds.segment.group} self-start print:hidden`}>
        {PAY_PARTS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={part === key}
            className={`${ds.segment.button} ${part === key ? ds.segment.on : ds.segment.off}`}
            onClick={() => choose(key)}
          >
            {PART_LABEL[key]}
          </button>
        ))}
      </div>
      {pay.saveFailed && part !== 'files' && (
        <div className="print:hidden">
          <ErrorCard code="E-STAFF-SAVE-FAILED" />
        </div>
      )}
      {excelFailed && part === 'month' && (
        <div className="print:hidden">
          <ErrorCard code="E-STAFF-FILE-FAILED" />
        </div>
      )}
      {body()}
    </div>
  )
}
