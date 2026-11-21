import type { Ref } from 'react'
import { EMPLOYMENT_LABEL, LEAVE_KIND_LABEL, jobLabel } from '@/components/staff/labels'
import { incentiveAmount, lineTotal, visibleItems } from '@/lib/staff/pay'
import { fmtMinutes, type PersonOvertime } from '@/lib/staff/schedule'
import type { IncentiveEntry, Leave, PayItem, PayLine, StaffMember } from '@/types/staff'
import { ADJUST_REASON_LABEL } from './AdjustPanel'
import { monthDay, monthTitle, signedWon, won } from './format'

// 간단 급여 명세서 한 장 (staff AC-7615.10, 시안 pay.html ⑧, design.md 6절): A4(794×1123) SVG 하나.
// 화면 미리 보기·인쇄 면·그림 파일(lib/staff/slipPng.ts)이 이 SVG를 같이 쓴다. 금액이 있는 항목만, 인센티브는 규칙별 계산 한 줄씩,
// 조정은 0원이 아닐 때만 까닭과 함께. 근무 요약은 더 일한 시간·그달 쓴 휴가·남은 연차.
// 글꼴은 서식 안내문과 같은 파일(/poster/fonts/ 700·900)을 다른 이름(SlipPretendard)으로 쓴다(안내문 글꼴 이름은 서식 폴더 안에서만, AC-3510.2).
// 색은 앱 토큰(var)이고, 그림 파일처럼 토큰이 없는 곳에서는 뒤의 기본 색 이름(검정·회색·흰색)으로 그린다

const W = 794
const H = 1123
const LEFT = 72
const RIGHT = W - LEFT
const ROW = 44
const SUB = 26

const STYLE = [
  "@font-face { font-family: SlipPretendard; font-weight: 700; src: url(/poster/fonts/Pretendard-Bold.subset.woff2) format('woff2') }",
  "@font-face { font-family: SlipPretendard; font-weight: 900; src: url(/poster/fonts/Pretendard-Black.subset.woff2) format('woff2') }",
  '.pslip-t { font-family: SlipPretendard, sans-serif; font-weight: 700; fill: var(--ink, black) }',
  '.pslip-x { font-weight: 900 }',
  '.pslip-m { fill: var(--muted, dimgray) }',
  '.pslip-a { fill: var(--accent, royalblue) }',
  '.pslip-l { stroke: var(--line, gainsboro) }',
  '.pslip-s { stroke: var(--line-strong, darkgray) }',
  '.pslip-p { fill: var(--surface, white) }',
].join('\n')

const LEAVE_ORDER: readonly Leave['kind'][] = ['annual', 'half', 'family', 'sick', 'maternity', 'unpaid']

// 글자 폭 어림(한글 1em · 숫자·영문 0.6em · 나머지 0.5em) — 한 줄에 이어 놓는 글자 사이를 띄울 때만 쓴다
const textWidth = (text: string, size: number) => [...text].reduce((sum, ch) => sum + (/[가-힣]/.test(ch) ? size : /[0-9A-Za-z]/.test(ch) ? size * 0.6 : size * 0.5), 0)

function entryText(entry: IncentiveEntry): string {
  const amount = won(incentiveAmount(entry))
  if (entry.method === 'per_case') return `${entry.name} ${won(entry.count ?? 0)}건 × ${won(entry.unitAmount ?? 0)}원 = ${amount}원`
  if (entry.method === 'percent') return `${entry.name} 매출 ${won(entry.sales ?? 0)}원 × ${entry.percent ?? 0}% = ${amount}원`
  return `${entry.name} ${amount}원`
}

const minutesText = (minutes: number) => (minutes === 0 ? '없음' : fmtMinutes(minutes))

/** 쓴 휴가 한 줄씩(종류마다): '연차 1일 (11월 28일)' · '반차 0.5일 (11월 13일)'. 없으면 ['없음'] */
export function leaveLines(leaves: readonly Leave[]): string[] {
  const lines = LEAVE_ORDER.flatMap((kind) => {
    const days = leaves.filter((leave) => leave.kind === kind).map((leave) => leave.day)
    if (days.length === 0) return []
    const count = days.length * (kind === 'half' ? 0.5 : 1)
    return [`${LEAVE_KIND_LABEL[kind]} ${count}일 (${[...days].sort().map(monthDay).join(', ')})`]
  })
  return lines.length === 0 ? ['없음'] : lines
}

type Row = { label: string; value: string; subs: string[] }

export type PaySlipProps = {
  hospital: string
  month: string
  member: StaffMember
  line: PayLine
  items: readonly PayItem[]
  overtime: PersonOvertime | undefined
  leaves: readonly Leave[]
  remaining: number | null
  className?: string
  ref?: Ref<SVGSVGElement>
}

export function PaySlip({ hospital, month, member, line, items, overtime, leaves, remaining, className, ref }: PaySlipProps) {
  const title = `${monthTitle(month)} 급여 명세`
  const sum = lineTotal(line, items, month)
  const pay: Row[] = visibleItems(items, month).flatMap((item): Row[] => {
    if (item.kind === 'incentive') {
      if (sum.incentive <= 0) return []
      const subs = line.incentives.filter((entry) => incentiveAmount(entry) > 0).map(entryText)
      return [{ label: item.name, value: `${won(sum.incentive)}원`, subs }]
    }
    const amount = line.amounts[item.id] ?? 0
    return amount > 0 ? [{ label: item.name, value: `${won(amount)}원`, subs: [] }] : []
  })
  if (line.adjust !== 0) {
    const why = [line.adjustReason === null ? '' : ADJUST_REASON_LABEL[line.adjustReason], line.adjustMemo ?? ''].filter((part) => part !== '').join(' ')
    pay.push({ label: why === '' ? '조정' : `조정 (${why})`, value: `${signedWon(line.adjust)}원`, subs: [] })
  }
  const work: Row[] = [
    {
      label: '더 일한 시간',
      value: `연장 ${minutesText(overtime?.extended ?? 0)} · 야간 ${minutesText(overtime?.night ?? 0)} · 휴일 ${minutesText(overtime?.holiday ?? 0)}`,
      subs: [],
    },
    { label: '쓴 휴가', value: '', subs: leaveLines(leaves) },
    { label: '남은 연차', value: remaining === null ? '–' : `${remaining}일`, subs: [] },
  ]

  // 사람 줄: 이름 · 직종 · 근무 형태 · 입사일을 한 줄에 이어 놓는다
  const who = [
    { text: member.name, size: 24, strong: true },
    { text: jobLabel(member), size: 17, strong: false },
    { text: EMPLOYMENT_LABEL[member.employment], size: 17, strong: false },
    { text: `입사 ${member.hiredOn}`, size: 17, strong: false },
  ]
  let whoX = LEFT
  const whoAt = who.map((part) => {
    const x = whoX
    whoX += textWidth(part.text, part.size) + 16
    return { ...part, x }
  })

  let y = 300
  const block = (rows: Row[], key: string, rightSubs: boolean) =>
    rows.map((row, i) => {
      const top = y
      const lines = row.value === '' && rightSubs ? row.subs : []
      const subs = rightSubs ? [] : row.subs
      const height = ROW + subs.length * SUB + Math.max(0, lines.length - 1) * SUB
      y += height
      return (
        <g key={`${key}-${i}`}>
          <text x={LEFT} y={top + 28} fontSize={17} className="pslip-t">
            {row.label}
          </text>
          {row.value !== '' && (
            <text x={RIGHT} y={top + 28} fontSize={17} textAnchor="end" className="pslip-t">
              {row.value}
            </text>
          )}
          {lines.map((text, j) => (
            <text key={j} x={RIGHT} y={top + 28 + j * SUB} fontSize={17} textAnchor="end" className="pslip-t">
              {text}
            </text>
          ))}
          {subs.map((text, j) => (
            <text key={j} x={LEFT + 12} y={top + 28 + (j + 1) * SUB} fontSize={14} className="pslip-t pslip-m">
              {text}
            </text>
          ))}
          <line x1={LEFT} x2={RIGHT} y1={top + height} y2={top + height} strokeWidth={1} className="pslip-l" />
        </g>
      )
    })

  const payRows = block(pay, 'pay', false)
  const totalTop = y
  y += ROW + 16
  const workTop = y
  y += 56
  const workRows = block(work, 'work', true)

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${member.name} ${title}`} className={className}>
      <style>{STYLE}</style>
      <rect x={0} y={0} width={W} height={H} className="pslip-p" />
      <text x={LEFT} y={100} fontSize={17} className="pslip-t pslip-m">
        {hospital}
      </text>
      <text x={LEFT} y={148} fontSize={34} className="pslip-t pslip-x">
        {title}
      </text>
      {whoAt.map((part, i) => (
        <text key={i} x={part.x} y={200} fontSize={part.size} className={part.strong ? 'pslip-t pslip-x' : 'pslip-t pslip-m'}>
          {part.text}
        </text>
      ))}
      <line x1={LEFT} x2={RIGHT} y1={226} y2={226} strokeWidth={2} className="pslip-s" />
      <text x={LEFT} y={286} fontSize={15} className="pslip-t pslip-a">
        지급 항목 · 실수령 기준
      </text>
      {payRows}
      <line x1={LEFT} x2={RIGHT} y1={totalTop} y2={totalTop} strokeWidth={2} className="pslip-s" />
      <text x={LEFT} y={totalTop + 32} fontSize={20} className="pslip-t pslip-x">
        합계 (실수령)
      </text>
      <text x={RIGHT} y={totalTop + 32} fontSize={22} textAnchor="end" className="pslip-t pslip-x">
        {`${won(sum.total)}원`}
      </text>
      <text x={LEFT} y={workTop + 42} fontSize={15} className="pslip-t pslip-a">
        이달 근무 요약
      </text>
      {workRows}
      <text x={LEFT} y={H - 72} fontSize={14} className="pslip-t pslip-m">
        세금·4대보험 내역은 세무사 명세서로 따로 드려요.
      </text>
    </svg>
  )
}
