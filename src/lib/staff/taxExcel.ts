import * as XLSX from 'xlsx'
import { monthOf, monthRange, weekdayOf } from '@/lib/analytics/dates'
import { lineTotal, visibleItems, type PayItem, type PayLine } from './pay'

// 세무사에게 보낼 급여자료 엑셀(staff REQ-7609, design.md 4절). taxSheet는 순수 함수(줄 글만), 엑셀 통·내려받기는 SheetJS xlsx.
// 입력은 셈이 끝난 숫자다: 남은 연차·정산(lib/staff/leave.ts)·더 일한 분·휴일에 일한 날(lib/staff/schedule.ts)은 부르는 쪽(급여 화면)이 넘긴다.
// 칸: 이름·직종·근무 형태·입사일·퇴사일·[그달 보이는 급여 항목]·조정·지급 합계·시간 셋·휴가 셋·남은 연차·메모·계좌(이달 입사자만).
// 주민번호 칸·인센티브 계산 내역은 없다. 날짜·계좌는 글자 칸, 빈 값은 빈 칸이다

export type TaxLeaveKind = 'annual' | 'half' | 'family' | 'sick' | 'maternity' | 'unpaid'
// StaffMember에서 쓰는 칸만
export type TaxMember = {
  id?: string
  name: string
  job: string
  jobOther: string | null
  employment: 'regular' | 'contract' | 'part'
  hiredOn: string
  leftOn: string | null
  bank: string | null
  accountNo: string | null
}
export type TaxPerson = {
  member: TaxMember
  line: Pick<PayLine, 'amounts' | 'incentives' | 'adjust' | 'adjustReason' | 'adjustMemo'> | null // 그달 급여 줄(없으면 null)
  overtime: { extended: number; night: number; holiday: number } // 그달 더 일한 분(monthOvertime)
  holidayWork: { day: string; kind: 'public' | 'closed' }[] // 휴일 시간을 적은 날과 그날이 공휴일인지 휴진일인지(dayKind)
  leaves: { day: string; kind: TaxLeaveKind; part: 'am' | 'pm' | null; paid: boolean }[] // 그달 휴가 줄(다른 달 줄은 세지 않는다)
  remaining: number | null // 그달 끝날 기준 지금 연차 기간 남은 일수(remainingAt), 모르면 null
  settled: { end: string; days: number } | null // 그달에 끝난 연차 기간의 끝날과 정산할 일수('pay'일 때, settleInMonth)
}
export type TaxInput = { month: string; hospitalName: string; items: readonly PayItem[]; people: readonly TaxPerson[] }
export type TaxCell = string | number | null
export type TaxSheet = { fileName: string; sheetName: string; rows: TaxCell[][] }

const EMPLOYMENT = { regular: '정규직', contract: '계약직', part: '파트타임' } as const
const ADJUST_REASON = { prorate: '일할 계산', deduct: '공제', other: '기타' } as const
const WEEKDAYS = '월화수목금토일' // weekdayOf 1=월 … 7=일
const HEAD_FRONT = ['이름', '직종', '근무 형태', '입사일', '퇴사일']
const HEAD_BACK = ['조정 (±)', '지급 합계', '연장 (시간)', '야간 (시간)', '휴일 (시간)', '연차 (일)', '병가 (일)', '무급 (일)', '남은 연차 (일)', '메모', '계좌 (이달 입사자만)']
const TAIL_AFTER_MONEY = HEAD_BACK.length - 2 // 지급 합계 뒤 칸 수(금액 칸 = 급여 항목·조정·지급 합계)
const MONEY_FORMAT = '#,##0'

const orNull = (value: number) => (value === 0 ? null : value)
const mmdd = (day: string) => day.slice(5)

function memoOf(p: TaxPerson, month: string): string | null {
  const parts: string[] = []
  if (p.line !== null) {
    const reason = p.line.adjustReason === null ? '' : ADJUST_REASON[p.line.adjustReason]
    const text = [reason, p.line.adjustMemo ?? ''].filter((part) => part !== '').join(' ')
    if (text !== '') parts.push(text)
  }
  const worked = p.holidayWork.filter((w) => monthOf(w.day) === month).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  for (const w of worked) parts.push(`${mmdd(w.day)}(${WEEKDAYS[weekdayOf(w.day) - 1]}) ${w.kind === 'closed' ? '휴진일' : '공휴일'} 근무`)
  if (p.settled !== null) parts.push(`연차 기간 끝 ${mmdd(p.settled.end)} · ${p.settled.days}일 정산`)
  const leaves = p.leaves.filter((l) => monthOf(l.day) === month)
  const family = leaves.filter((l) => l.kind === 'family').length
  const maternity = leaves.filter((l) => l.kind === 'maternity').length
  if (family > 0) parts.push(`경조사 ${family}일`)
  if (maternity > 0) parts.push(`출산·육아휴직 ${maternity}일`)
  return parts.length === 0 ? null : parts.join(' · ')
}

/** 휴가 일수(AC-7609.2): 연차 = 연차 1·반차 0.5, 병가 = 유급 병가, 무급 = 무급(결근) + 무급 병가. 그달 줄만 센다 */
function leaveDays(p: TaxPerson, month: string) {
  const leaves = p.leaves.filter((l) => monthOf(l.day) === month)
  return {
    annual: leaves.reduce((sum, l) => sum + (l.kind === 'annual' ? 1 : l.kind === 'half' ? 0.5 : 0), 0),
    sick: leaves.filter((l) => l.kind === 'sick' && l.paid).length,
    unpaid: leaves.filter((l) => l.kind === 'unpaid' || (l.kind === 'sick' && !l.paid)).length,
  }
}

/**
 * 세무사 엑셀 줄(AC-7609.1~7609.3): 1줄 안내, 2줄 머리, 3줄부터 그달 재직자(입사일 ≤ 달 끝, 퇴사일 없음 또는 ≥ 달 첫날)를 넘긴 차례대로,
 * 맨 아래 '합계'(금액·시간·휴가 합, 남은 연차는 비움). 사람 줄의 0인 시간·휴가와 적지 않은 금액은 빈 칸이다
 */
export function taxSheet(input: TaxInput): TaxSheet {
  const { month, hospitalName } = input
  const range = monthRange(month)
  const year = month.slice(0, 4)
  const monthNumber = Number(month.slice(5, 7))
  const items = visibleItems(input.items, month)
  const people = input.people.filter(({ member }) => member.hiredOn <= range.to && (member.leftOn === null || member.leftOn >= range.from))

  const sums = { items: items.map(() => 0), adjust: 0, total: 0, extended: 0, night: 0, holiday: 0, annual: 0, sick: 0, unpaid: 0 }
  const body = people.map((p): TaxCell[] => {
    const { member, line } = p
    const itemCells = items.map((item, i): number | null => {
      let won: number | null
      if (item.kind === 'incentive') won = line !== null && line.incentives.length > 0 ? lineTotal(line, input.items, month).incentive : null
      else won = line?.amounts[item.id] ?? null
      sums.items[i] += won ?? 0
      return won
    })
    const adjust = line?.adjust ?? 0
    const total = line === null ? 0 : lineTotal(line, input.items, month).total
    const leave = leaveDays(p, month)
    sums.adjust += adjust
    sums.total += total
    sums.extended += p.overtime.extended
    sums.night += p.overtime.night
    sums.holiday += p.overtime.holiday
    sums.annual += leave.annual
    sums.sick += leave.sick
    sums.unpaid += leave.unpaid
    const job = member.job === '기타' ? member.jobOther || '기타' : member.job
    const account = monthOf(member.hiredOn) === month && member.accountNo ? [member.bank, member.accountNo].filter((part) => part).join(' ') : null
    return [
      member.name,
      job,
      EMPLOYMENT[member.employment],
      member.hiredOn,
      member.leftOn,
      ...itemCells,
      orNull(adjust),
      total,
      orNull(p.overtime.extended / 60),
      orNull(p.overtime.night / 60),
      orNull(p.overtime.holiday / 60),
      orNull(leave.annual),
      orNull(leave.sick),
      orNull(leave.unpaid),
      p.settled !== null ? p.settled.days : p.remaining,
      memoOf(p, month),
      account,
    ]
  })

  const totalRow: TaxCell[] = [
    '합계',
    null,
    null,
    null,
    null,
    ...sums.items,
    sums.adjust,
    sums.total,
    sums.extended / 60,
    sums.night / 60,
    sums.holiday / 60,
    sums.annual,
    sums.sick,
    sums.unpaid,
    null,
    null,
    null,
  ]
  return {
    fileName: `${month} 급여자료 (${hospitalName}).xlsx`,
    sheetName: `${monthNumber}월 급여`,
    rows: [
      [`${year}년 ${monthNumber}월 급여자료 · ${hospitalName} · 금액은 모두 실수령(손에 받는 돈) 기준, 단위 원`],
      [...HEAD_FRONT, ...items.map((item) => item.name), ...HEAD_BACK],
      ...body,
      totalRow,
    ],
  }
}

/** 엑셀 통: 시트 하나. 금액 칸(급여 항목·조정·지급 합계)은 천 단위 쉼표 모양, 글자는 글자 칸 그대로(aoa_to_sheet는 글자를 바꾸지 않는다) */
export function taxWorkbook(sheet: TaxSheet): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
  const head = sheet.rows[1] ?? []
  const moneyEnd = head.length - TAIL_AFTER_MONEY
  for (let r = 2; r < sheet.rows.length; r += 1) {
    for (let c = HEAD_FRONT.length; c < moneyEnd; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      if (cell?.t === 'n') cell.z = MONEY_FORMAT
    }
  }
  ws['!cols'] = head.map((name) => ({ wch: name === '메모' ? 40 : name === '계좌 (이달 입사자만)' ? 24 : 12 }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, ws, sheet.sheetName)
  return book
}

/** [엑셀 받기](AC-7615.7): 그달 파일을 그 PC에 내려받는다. 서버로 보내지 않는다 */
export function downloadTaxExcel(sheet: TaxSheet): void {
  XLSX.writeFile(taxWorkbook(sheet), sheet.fileName)
}
