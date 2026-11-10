// 도우미 답 + 설정 → ERP 마감일지 칸 계획(design.md 4절 칸 표 그대로, REQ-3608). 화면은 보지 않는다
// 칸 이름은 ERP 화면 글자 그대로(notes/erp-closing-fields.md 3·4절). 값은 쉼표 없는 정수 글자이고,
// 코드를 고르지 않은 묶음은 'unpicked', 비트에서 셀 수 없는 값(null)은 'unknown'으로 값 없이 둔다(그 칸은 건드리지 않는다)
import {
  GROUP_NAMES,
  RSV_NAMES,
  RSV_ROWS,
  type AgeBand,
  type ClosingDay,
  type EtcKey,
  type GroupKey,
  type MoneyKey,
  type Settings,
  type Three,
} from './types.js'

/** 칸 자리: 업무일지 1 구역 > 줄 · 업무일지 2 묶음 > 줄 × 열 · 업무일지 2 낱칸(label) */
export type Where =
  | { j: 1; box: string; row: string }
  | { j: 2; card: string; row: string; col: string }
  | { j: 2; field: string }

export type Planned = { where: Where; value: string | null; why?: 'unpicked' | 'unknown' }

/** 업무일지 2 낱칸이 있는 묶음 제목(못 찾은 칸 글에 쓴다) */
export const FIELD_CARD = '운영 지표(치료사별·금액)'

const PATIENT_ROWS: [string, keyof ClosingDay['patients']][] = [
  ['신환', 'new'],
  ['90일초진', 'first90'],
  ['재진', 'return'],
  ['물리치료내원', 'ptVisit'],
  ['진찰료 산정안함', 'noExamFee'],
  ['합계', 'total'],
]
const CARE_ROWS: [string, GroupKey][] = [
  ['씨암', 'carm'],
  ['SONO', 'sono'],
  ['도수상담', 'manualConsult'],
  ['도수치료', 'manual'],
  ['충격파(체충)', 'eswt'],
  ['관절조영술', 'arthro'],
  ['리푸스', 'lipus'],
  ['손발톱케어', 'nail'],
  ['CT', 'ct'],
  ['수술', 'surgery'],
]
const MONEY_ROWS: [string, MoneyKey][] = [
  ['외래 총매출', 'total'],
  ['청구액(-)', 'insurer'],
  ['미수입금(+)', 'receivableIn'],
  ['미수발생(-)', 'unpaidNew'],
  ['비급여', 'noncovered'],
  ['감액', 'discount'],
  ['장애인기금(-)', 'disabledFund'],
  ['진료수납액', 'received'],
  ['카드수납액(-)', 'card'],
  ['현금수납액(-)', 'cash'],
  ['계좌이체액(-)', 'transfer'],
  ['현불/환불(-)', 'refund'],
]
const INPATIENT_ROWS = ['청구', '비급여', '본인부담금', '수납액']

const RSV_COLS: [string, 'total' | 'visited' | 'changed' | 'canceled'][] = [
  ['총갯수', 'total'],
  ['내원', 'visited'],
  ['변경', 'changed'],
  ['취소', 'canceled'],
]
const THREE_COLS: [string, keyof Three][] = [
  ['신환', 'new'],
  ['90일초진', 'first90'],
  ['재진', 'return'],
]
const ETC_KEYS: EtcKey[] = ['etc1', 'etc2', 'etc3', 'etc4']
const COUNT_ROWS: [string, GroupKey][] = [
  ['씨암(주사)', 'carm'],
  ['SONO(주사)', 'sono'],
  ['관절조영', 'arthro'],
  ['도수', 'manual'],
  ['충격파', 'eswt'],
]
const AGE_ROWS: [string, AgeBand][] = [
  ['10대미만', '0'],
  ['10대', '10'],
  ['20대', '20'],
  ['30대', '30'],
  ['40대', '40'],
  ['50대', '50'],
  ['60대', '60'],
  ['70대', '70'],
  ['80대', '80'],
  ['90대', '90'],
]
const SALES_ROWS: [string, GroupKey][] = [
  ['씨암', 'carm'],
  ['SONO', 'sono'],
  ['관절조영', 'arthro'],
  ['도수', 'manual'],
  ['충격파', 'eswt'],
  ['물리치료', 'pt'],
]

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()

/** 쉼표 없는 정수 글자. 원 미만은 버린다(반올림 없음). 숫자가 아니면 null */
function digits(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return String(Math.trunc(n) || 0)
}

export function planCells(answer: ClosingDay, settings: Settings): Planned[] {
  const plan: Planned[] = []
  const picked = (key: GroupKey) => (settings.picks[key] ?? []).some((code) => code.trim() !== '')
  const group = (key: GroupKey) => answer.groups.find((g) => g.key === key)

  /** 칸 하나. 고르지 않았으면 unpicked, 값이 없으면 unknown */
  const put = (where: Where, value: number | null | undefined, isPicked = true) => {
    if (!isPicked) return plan.push({ where, value: null, why: 'unpicked' })
    const text = digits(value)
    plan.push(text === null ? { where, value: null, why: 'unknown' } : { where, value: text })
  }
  /** 기타 줄: ERP 줄 이름 = 설정의 기타 이름. 이름이 비면 기본 이름(기타N) 줄로 적고 건너뛴다 */
  const etcRow = (key: EtcKey) => {
    const name = tidy(settings.etcNames?.[key] ?? '')
    return { row: name || GROUP_NAMES[key], ok: name !== '' && picked(key) }
  }

  // 업무일지 1
  for (const [row, key] of PATIENT_ROWS) {
    put({ j: 1, box: '환자현황', row }, answer.patients[key], key === 'ptVisit' ? picked('ptVisit') : true)
  }
  for (const [row, key] of CARE_ROWS) put({ j: 1, box: '진료 · 치료현황', row }, group(key)?.patients, picked(key))
  for (const [row, key] of MONEY_ROWS) put({ j: 1, box: '외래 수입', row }, answer.money[key])
  for (const row of INPATIENT_ROWS) put({ j: 1, box: '입원수입', row }, answer.inpatientVisits === 0 ? 0 : null)

  // 업무일지 2 예약: 줄마다 고른 메모 번호들의 합
  const kinds = answer.reservations?.kinds ?? []
  for (const rsv of RSV_ROWS) {
    const memo = new Set((settings.reservations[rsv] ?? []).map(tidy).filter(Boolean))
    const mine = kinds.filter((k) => memo.has(tidy(k.kind)))
    for (const [col, field] of RSV_COLS) {
      const sum = answer.reservations ? mine.reduce((s, k) => s + k[field], 0) : null
      put({ j: 2, card: '예약', row: RSV_NAMES[rsv], col }, sum, memo.size > 0)
    }
  }
  put({ j: 2, card: '예약', row: '실예약환자수', col: '총갯수' }, answer.reservations?.patients)

  // 업무일지 2 치료별 신환/90일초진/재진 건수
  const countCard = '치료별 신환/90일초진/재진 건수'
  const counts: { row: string; key: GroupKey; ok: boolean }[] = [
    ...COUNT_ROWS.map(([row, key]) => ({ row, key, ok: picked(key) })),
    ...ETC_KEYS.map((key) => ({ key, ...etcRow(key) })),
  ]
  for (const { row, key, ok } of counts) {
    for (const [col, field] of THREE_COLS) put({ j: 2, card: countCard, row, col }, group(key)?.[field], ok)
  }

  // 업무일지 2 연령별
  for (const [row, band] of AGE_ROWS) {
    const age = answer.ages.find((a) => a.band === band)
    for (const [col, field] of THREE_COLS) put({ j: 2, card: '연령별 신환/90일초진/재진', row, col }, age?.[field])
  }

  // 업무일지 2 운영 지표 낱칸(도수·충격파 총금액 = 치료별 매출 도수·충격파 값)
  put({ j: 2, field: '도수 총금액' }, group('manual')?.total, picked('manual'))
  put({ j: 2, field: '충격파 총금액' }, group('eswt')?.total, picked('eswt'))
  put({ j: 2, field: 'ESWT Standard' }, group('eswtStd')?.patients, picked('eswtStd'))
  put({ j: 2, field: 'ESWT Radial' }, group('eswtRadial')?.patients, picked('eswtRadial'))
  const injection = picked('injection')
  put({ j: 2, field: '주사1회환자' }, answer.injection?.firstTime, injection)
  put({ j: 2, field: '신환주사환자' }, answer.injection?.newPatients, injection)
  put({ j: 2, field: '신환주사건수' }, answer.injection?.newLines, injection)

  // 업무일지 2 치료별 매출
  const sales: { row: string; key: GroupKey; ok: boolean }[] = [
    ...SALES_ROWS.map(([row, key]) => ({ row, key, ok: picked(key) })),
    ...ETC_KEYS.map((key) => ({ key, ...etcRow(key) })),
  ]
  for (const { row, key, ok } of sales) put({ j: 2, card: '치료별 매출', row, col: '금액(원)' }, group(key)?.total, ok)

  return plan
}
