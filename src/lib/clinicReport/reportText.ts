import { compareYmd, monthRange, weekdayOf } from '@/lib/analytics/dates'
import type { ClinicReportInput, ClinicReportMode, ClinicReportNumbers, ClinicReportResult } from '@/types/clinicReport'

// 원장님 보고 문장 (REQ-510). 원본 medicore/reports.py의 format_report·report_notes를 줄·띄어쓰기까지 그대로 옮겼다.
// 일부러 다른 곳은 골든 fixtures/stats/golden/report-*.json의 knownDiffs에 있다: 금액·건당진료비는 원 미만을 버리고(원본은 반올림), 안내 첫 줄도 그에 맞춰 쓴다
// 확인 필요(financeUnconfirmed) 벌도 원본과 다르다(bit-total REQ-6908, design.md 5절): '※ 금액 확인 필요' 줄 없이 금액 줄을 '–'로 두고 안내를 바꾼다.
// 도우미 0.13.0은 이 벌을 보내지 않는다(늘 금액까지 채움, AC-6912.4). 0.13.0 전 도우미를 쓰는 동안만 쓰는 길이다

type Confirmed = Extract<ClinicReportNumbers, { ok: true }>
type TreatmentKey = keyof Confirmed['treatments']

// 0.13.0 전 도우미가 세지 않은 금액(AC-6908.2)
const UNCOUNTED = '–'
const UNCOUNTED_NOTE =
  '이 기간은 환불·변경수납·예치금 또는 연결 중복이 있어 지금 도우미가 금액을 세지 않았습니다(–). 도우미를 0.13.0으로 올린 뒤 [비트에서 불러오기]를 다시 하면 채워집니다.'
// 0.13.0 전 도우미 안내 바꾸기(AC-6908.4). 정확히 같은 글만 본다. 새 금액 안내는 도우미 0.13.0의 글(AC-6912.5)과 같다
const OLD_HELPER_MONEY =
  "금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있으면 금액을 '확인 필요'로 두고 환자수·치료·LA만 집계합니다."
const NEW_HELPER_MONEY =
  '금액은 외래환자경영통계의 회계일 기준 정상수납·미수입금 조건으로 집계합니다. 환불·변경수납·예치금 또는 연결 중복이 있는 기간도 같은 조건으로 집계해 비트 원본 통계와 다를 수 있습니다.'
const OLD_HELPER_UNCOUNTED = '이 기간은 금액을 자동 집계하지 않았습니다(환자수·치료·LA는 정상). 비트 원본 외래환자경영통계에서 금액을 확인해 직접 입력하세요.'
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

function buildText(mode: ClinicReportMode, numbers: Confirmed, hospitalName: string): string {
  const monthly = mode === 'monthly'
  const uncounted = numbers.financeUnconfirmed
  const lines = [hospitalName, titleOf(mode, numbers.period), '', `총환                  ${NUMBER.format(numbers.totalVisits)}명`]
  // 세지 않은 벌은 받은 금액이 있어도 글에 쓰지 않는다(총환 0명이어도 '–', AC-6908.2)
  const addMoney = (label: string, shown: string) => {
    lines.push(`${label}${uncounted ? UNCOUNTED : shown}`)
  }

  if (!monthly) {
    lines.push(`신환                  ${NUMBER.format(numbers.newPatients)}명`, `재진                  ${NUMBER.format(numbers.returnPatients)}명`)
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
  return lines.join('\n')
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
  if (numbers.financeUnconfirmed) notes.push(UNCOUNTED_NOTE)
  return [...new Set([...notes, ...numbers.notes.flatMap((note) => helperNote(note, numbers.financeUnconfirmed))])]
}

// 도우미 안내 한 줄 → 보일 글(없거나 하나, AC-6908.4). 받은 목록은 고치지 않는다
function helperNote(note: string, uncounted: boolean): string[] {
  if (note === OLD_HELPER_UNCOUNTED) return []
  // 세지 않은 벌에 '같은 조건으로 집계해'를 쓰면 '–'·웹 안내(AC-6908.3)와 어긋나서 뺀다
  if (note === OLD_HELPER_MONEY) return uncounted ? [] : [NEW_HELPER_MONEY]
  return [note]
}

export function formatClinicReport({ mode, numbers, hospitalName }: ClinicReportInput, today: string): ClinicReportResult {
  if (isFuture(mode, numbers.period, today)) return { error: 'future-date' }
  if (!numbers.ok) return { error: 'unconfirmed', reason: numbers.reason }
  return { text: buildText(mode, numbers, hospitalName), notes: buildNotes(mode, numbers) }
}
