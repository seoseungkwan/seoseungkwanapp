import { compareYmd, monthRange, weekdayOf } from '@/lib/analytics/dates'
import type { ClinicReportInput, ClinicReportMode, ClinicReportNumbers, ClinicReportResult } from '@/types/clinicReport'

// 원장님 보고 문장 (REQ-510). 원본 medicore/reports.py의 format_report·report_notes를 줄·띄어쓰기까지 그대로 옮겼다.
// 일부러 다른 곳은 골든 fixtures/stats/golden/report-*.json의 knownDiffs에 있다: 금액·건당진료비는 원 미만을 버리고(원본은 반올림), 안내 첫 줄도 그에 맞춰 쓴다

type Confirmed = Extract<ClinicReportNumbers, { ok: true }>
type TreatmentKey = keyof Confirmed['treatments']

const UNCONFIRMED = '확인 필요'
const WEEKDAYS = '월화수목금토일'

const DAILY_TREATMENTS: [TreatmentKey, string][] = [
  ['manual', '도수'],
  ['carm', '씨암블락'],
  ['cryo', '크라이오'],
  ['sono', '쏘노'],
  ['eswt', '충격파'],
]
const MONTHLY_TREATMENTS: [TreatmentKey, string][] = [
  ['manual', '도수'],
  ['eswt', '충격파'],
  ['carm', '씨암블락'],
  ['sono', '쏘노'],
  ['cryo', '크라이오'],
]

// 차트 글자(components/charts/format.ts)는 빼기 기호가 달라 쓰지 않는다. 원본은 '-1,000'이다
const NUMBER = new Intl.NumberFormat('en-US')

// 원 미만은 0 쪽으로 버린다. 버린 결과가 0이면 부호 없이 '0원'이다(AC-510.1, 원본은 '-0원' 또는 '-1원'). Intl은 -0을 '-0'으로 쓰므로 + 0으로 부호를 없앤다
const won = (value: number) => `${NUMBER.format(Math.trunc(value) + 0)}원`

function isFuture(mode: ClinicReportMode, period: string, today: string): boolean {
  return compareYmd(mode === 'monthly' ? monthRange(period).from : period, today) > 0
}

function titleOf(mode: ClinicReportMode, period: string): string {
  const month = `${Number(period.slice(0, 4))}년 ${Number(period.slice(5, 7))}월`
  if (mode === 'monthly') return month
  return `${month} ${Number(period.slice(8, 10))}일 ${WEEKDAYS[weekdayOf(period) - 1]}요일`
}

function buildText(mode: ClinicReportMode, numbers: Confirmed, hospitalName: string) {
  const monthly = mode === 'monthly'
  const unconfirmed = numbers.financeUnconfirmed
  // 글자에 줄바꿈이 들어와도 줄 번호가 text의 진짜 줄을 가리키게 한 줄씩 나눠 넣는다
  const lines = [...hospitalName.split('\n'), titleOf(mode, numbers.period), '', `총환                  ${NUMBER.format(numbers.totalVisits)}명`]
  const unconfirmedLines: number[] = []
  const addMoney = (label: string, shown: string) => {
    if (unconfirmed) unconfirmedLines.push(lines.length)
    lines.push(`${label}${unconfirmed ? UNCONFIRMED : shown}`)
  }

  if (!monthly) {
    lines.push(`신환                  ${NUMBER.format(numbers.newPatients)}명`, `재진                  ${NUMBER.format(numbers.returnPatients)}명`)
  }
  if (unconfirmed) {
    const reason = numbers.financeUnconfirmedReason || '환불·변경수납·예치금 또는 연결 중복. 비트 원본에서 확인해 아래 금액을 직접 입력하세요.'
    lines.push(...`※ 금액 확인 필요 — ${reason}`.split('\n'))
  }
  addMoney('총진료비        ', won(numbers.totalAmount))
  addMoney('조합청구액      ', won(numbers.insurerAmount))
  if (!monthly) {
    addMoney('입금액 (현금)         ', won(numbers.cashAmount))
    addMoney('       (카드)         ', won(numbers.cardAmount))
    addMoney('       (계좌이체)     ', won(numbers.transferAmount))
  }
  addMoney('비급여          ', won(numbers.noncoveredAmount))
  lines.push('')

  const unit = monthly ? '건' : '명'
  for (const [key, label] of monthly ? MONTHLY_TREATMENTS : DAILY_TREATMENTS) {
    lines.push(`${label.padEnd(8)}          ${NUMBER.format(numbers.treatments[key])}${unit}`)
  }
  if (monthly) {
    lines.push('')
    // 글자 차례(원본 sorted). localeCompare를 쓰면 기호 차례가 달라진다
    const codes = [...numbers.laCodes].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    for (const { code, count } of codes) lines.push(`    ${code} - ${NUMBER.format(count)}건`)
    if (codes.length === 0) lines.push('    LA 코드 처방 없음')
  }

  lines.push('')
  // 버린 총진료비를 나눠도 나눈 뒤 버린 값과 같다. 정수끼리 나눠야 큰 금액에서 소수 오차가 끼지 않는다
  addMoney('건당진료비      ', numbers.totalVisits > 0 ? won(Math.trunc(numbers.totalAmount) / numbers.totalVisits) : '산출 불가 (총환 0명)')
  if (!monthly) {
    lines.push('', '신환 내원경로', '소개                  0명', '간판                  0명', '인터넷                0명', '기타                  0명')
  }
  lines.push('', '고생하셨습니다 !!')
  return { text: lines.join('\n'), unconfirmedLines }
}

function buildNotes(mode: ClinicReportMode, numbers: Confirmed): string[] {
  const notes = ['총환은 내원 건수 기준이며, 건당진료비는 총진료비 ÷ 총환에서 원 미만을 버립니다.']
  if (mode === 'daily') {
    notes.push(
      '입금액은 비트 원본 수납 구분에 따라 현금·카드·계좌이체를 각각 집계하며 서로 합산하거나 재분류하지 않습니다.',
      '신환 내원경로의 0은 요청에 따른 고정값이며 실제 유입 집계가 아닙니다.',
      '치료 인원은 치료별 당일 환자 중복을 제외한 값입니다.',
    )
  } else {
    notes.push('치료 및 LA 코드 건수는 취소·삭제 등을 제외한 유효 처방 건수이며 총투여량이 아닙니다.')
  }
  if (numbers.financeUnconfirmed) {
    notes.push(
      '이 기간은 환불·변경수납·예치금 또는 연결 중복이 있어 금액을 자동 집계하지 않았습니다(‘확인 필요’). 환자수·치료·LA 집계는 정상이며, 금액은 비트 원본 외래환자경영통계에서 확인해 직접 입력하세요.',
    )
  }
  return [...new Set([...notes, ...numbers.notes])]
}

export function formatClinicReport({ mode, numbers, hospitalName }: ClinicReportInput, today: string): ClinicReportResult {
  if (isFuture(mode, numbers.period, today)) return { error: 'future-date' }
  if (!numbers.ok) return { error: 'unconfirmed', reason: numbers.reason }
  return { ...buildText(mode, numbers, hospitalName), notes: buildNotes(mode, numbers) }
}
