// 의사랑 답 + 의사랑 설정 → ERP 마감일지 칸(spec erp-uisarang design.md 6-1 표·8-4). 화면은 보지 않는다
// - 칸 자리·차례는 지금 비트 planCells(cells.ts)와 같다(줄 이름은 cells.ts 상수 글자 그대로 — cells.ts는 고치지 않고 여기 다시 적는다).
//   uisCells는 131칸 모두를 까닭과 함께 내고(엑셀로 받기용), planUisCells는 fillAll에 넘길 칸만 낸다(none·missing 뺌)
// - 까닭: none = 의사랑에 없는 칸(75칸) · missing = 그 엑셀이 없음(report에 보고서) · unpicked = 코드 안 고름 ·
//   unknown = 의사랑이 셀 수 없던 값(null, report에 기댄 보고서) · noName = 코드를 골랐는데 기타 줄 이름이 빔(값은 둔다)
// - 답 검사(readUisDay)·멈춤 판정(stopOf)·결과 안내 까닭 줄(unreadLines)·맞춰 보기 경고 줄(checkLines)도 여기 둔다
// - 환자 정보는 받을 자리가 없다(답은 숫자·칸 이름·보고서 상태뿐)
import type { Planned, Where } from './cells.js'
import { GROUP_NAMES, RSV_NAMES, RSV_ROWS, type AgeBand, type EtcKey } from './types.js'
import { UIS_REPORT_NAMES, UIS_TEXT } from './uisText.js'
import { UIS_COUNT_KEYS, UIS_KINDS, UIS_PATIENT, UIS_REQUIRED, UIS_SALES_KEYS } from './uisTypes.js'
import type { UisCountKey, UisDay, UisKind, UisReport, UisSalesKey, UisSettings, UisState } from './uisTypes.js'

export type UisWhy = 'unpicked' | 'unknown' | 'missing' | 'none' | 'noName'
/** 칸 하나. noName이어도 value를 둔다(엑셀용). report = missing이면 없는 보고서, unknown이면 그 칸이 기댄 보고서 */
export type UisCell = { where: Where; value: string | null; why?: UisWhy; report?: UisKind }

// --- 줄 이름(cells.ts와 같은 글자·차례) ---

const CARE_ROWS: [string, UisCountKey][] = [
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
/** 외래 수입 12줄. 키가 없는 줄은 의사랑에 없음(none) */
const MONEY_ROWS: [string, keyof UisDay['money'] | null][] = [
  ['외래 총매출', 'total'],
  ['청구액(-)', 'insurer'],
  ['미수입금(+)', null],
  ['미수발생(-)', null],
  ['비급여', 'noncovered'],
  ['감액', null],
  ['장애인기금(-)', null],
  ['진료수납액', 'received'],
  ['카드수납액(-)', 'card'],
  ['현금수납액(-)', 'cash'],
  ['계좌이체액(-)', null],
  ['현불/환불(-)', null],
]
const INPATIENT_ROWS = ['청구', '비급여', '본인부담금', '수납액']
const RSV_COLS = ['총갯수', '내원', '변경', '취소']
const THREE_COLS = ['신환', '90일초진', '재진']
const COUNT_ROWS = ['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파']
const ETC_KEYS: EtcKey[] = ['etc1', 'etc2', 'etc3', 'etc4']
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
const SALES_ROWS: [string, UisSalesKey][] = [
  ['씨암', 'carm'],
  ['SONO', 'sono'],
  ['관절조영', 'arthro'],
  ['도수', 'manual'],
  ['충격파', 'eswt'],
  ['물리치료', 'pt'],
]
const NO_INJECTION = ['주사1회환자', '신환주사환자', '신환주사건수']

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()

/** 쉼표 없는 정수 글자(cells.ts와 같은 꼴). 숫자가 아니면 null */
function digits(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return String(Math.trunc(n) || 0)
}

/** 칸 하나를 정하는 재료: picked = 코드를 골랐나 · missing = 없는 보고서(있으면 비움) · report = unknown일 때 기댄 보고서 */
type Source = { picked?: boolean; missing: UisKind | null; report: UisKind; noName?: boolean }

/**
 * 의사랑 답 + 설정 → 131칸(design.md 6-1 표, planCells와 같은 차례·자리). 까닭을 보는 차례:
 * none → unpicked → missing → unknown(값 null) → noName(기타 이름 빔, 값은 둔다) → 값
 */
export function uisCells(day: UisDay, s: UisSettings): UisCell[] {
  const cells: UisCell[] = []
  const usable = (kind: UisKind) => day.uis.reports.find((r) => r.kind === kind)?.state === 'ok'
  const need = (kind: UisKind): UisKind | null => (usable(kind) ? null : kind)
  /** 신환·합계: 위쪽 표 또는 아래쪽 표(둘 다 없으면 꼭 있어야 할 아래쪽 표가 없는 것) */
  const visitSide = (): UisKind | null => (usable('visits') || usable('visitPatients') ? null : 'visitPatients')
  const visitReport: UisKind = usable('visits') ? 'visits' : 'visitPatients'
  const counted = (key: UisCountKey) => (s.counts[key] ?? []).length > 0
  const sold = (key: UisSalesKey) => (s.sales[key] ?? []).length > 0
  const group = (key: UisCountKey | UisSalesKey) => day.groups.find((g) => g.key === key)

  const none = (where: Where) => cells.push({ where, value: null, why: 'none' })
  const put = (where: Where, value: number | null | undefined, src: Source) => {
    if (src.picked === false) return cells.push({ where, value: null, why: 'unpicked' })
    if (src.missing) return cells.push({ where, value: null, why: 'missing', report: src.missing })
    const text = digits(value)
    if (text === null) return cells.push({ where, value: null, why: 'unknown', report: src.report })
    return cells.push(src.noName ? { where, value: text, why: 'noName' } : { where, value: text })
  }
  /** 기타 줄 이름: 설정의 기타 이름, 비면 기타N(planCells와 같은 줄) */
  const etcRow = (key: EtcKey) => tidy(s.etcNames?.[key] ?? '') || GROUP_NAMES[key]

  // 업무일지 1 환자현황
  const box = '환자현황'
  const ptVisit = counted('ptVisit')
  put({ j: 1, box, row: '신환' }, day.patients.new, { missing: visitSide(), report: visitReport })
  none({ j: 1, box, row: '90일초진' })
  // 재진 = 재진수 − 물리치료내원: 일일수입통계, 물리치료내원을 골랐으면 처방통계도
  put({ j: 1, box, row: '재진' }, day.patients.return, { missing: need('income') ?? (ptVisit ? need('rx') : null), report: 'income' })
  put({ j: 1, box, row: '물리치료내원' }, day.patients.ptVisit, { picked: ptVisit, missing: need('rx'), report: 'rx' })
  // 진찰료 산정안함 = 환자 합계 − (초진수 + 재진수)
  put({ j: 1, box, row: '진찰료 산정안함' }, day.patients.noExamFee, { missing: need('income') ?? visitSide(), report: 'income' })
  put({ j: 1, box, row: '합계' }, day.patients.total, { missing: visitSide(), report: visitReport })

  // 업무일지 1 진료 · 치료현황: 건수로 셀 코드 총투여량 합
  for (const [row, key] of CARE_ROWS) {
    put({ j: 1, box: '진료 · 치료현황', row }, group(key)?.patients, { picked: counted(key), missing: need('rx'), report: 'rx' })
  }
  // 업무일지 1 외래 수입 · 입원수입
  for (const [row, key] of MONEY_ROWS) {
    const where: Where = { j: 1, box: '외래 수입', row }
    if (key === null) none(where)
    else put(where, day.money[key], { missing: need('income'), report: 'income' })
  }
  for (const row of INPATIENT_ROWS) none({ j: 1, box: '입원수입', row })

  // 업무일지 2 예약: 종류별 줄은 의사랑에 없고 실예약환자수만(design.md 6-3)
  for (const rsv of RSV_ROWS) for (const col of RSV_COLS) none({ j: 2, card: '예약', row: RSV_NAMES[rsv], col })
  put({ j: 2, card: '예약', row: '실예약환자수', col: '총갯수' }, day.reservations.patients, {
    missing: need('rsvPatients'),
    report: 'rsvPatients',
  })

  // 업무일지 2 치료별 신환/90일초진/재진 건수: 의사랑 합계로 나눌 수 없다
  const countCard = '치료별 신환/90일초진/재진 건수'
  for (const row of [...COUNT_ROWS, ...ETC_KEYS.map(etcRow)]) for (const col of THREE_COLS) none({ j: 2, card: countCard, row, col })

  // 업무일지 2 연령별: 아래쪽 표 만 나이 구간별 신규 / 그 밖, 90일초진은 없음
  for (const [row, band] of AGE_ROWS) {
    const age = day.ages.find((a) => a.band === band)
    const card = '연령별 신환/90일초진/재진'
    put({ j: 2, card, row, col: '신환' }, age?.new, { missing: need('visitPatients'), report: 'visitPatients' })
    none({ j: 2, card, row, col: '90일초진' })
    put({ j: 2, card, row, col: '재진' }, age?.return, { missing: need('visitPatients'), report: 'visitPatients' })
  }

  // 업무일지 2 운영 지표 낱칸: 도수·충격파 총금액 = 치료별 매출 도수·충격파 값, ESWT는 건수, 주사 셋은 없음
  const rx = { missing: need('rx'), report: 'rx' as const }
  put({ j: 2, field: '도수 총금액' }, group('manual')?.total, { ...rx, picked: sold('manual') })
  put({ j: 2, field: '충격파 총금액' }, group('eswt')?.total, { ...rx, picked: sold('eswt') })
  put({ j: 2, field: 'ESWT Standard' }, group('eswtStd')?.patients, { ...rx, picked: counted('eswtStd') })
  put({ j: 2, field: 'ESWT Radial' }, group('eswtRadial')?.patients, { ...rx, picked: counted('eswtRadial') })
  for (const field of NO_INJECTION) none({ j: 2, field })

  // 업무일지 2 치료별 매출: 매출로 셀 코드 총액 합(기타 줄은 이름이 비면 noName)
  for (const [row, key] of SALES_ROWS) {
    put({ j: 2, card: '치료별 매출', row, col: '금액(원)' }, group(key)?.total, { ...rx, picked: sold(key) })
  }
  for (const key of ETC_KEYS) {
    const named = tidy(s.etcNames?.[key] ?? '') !== ''
    put({ j: 2, card: '치료별 매출', row: etcRow(key), col: '금액(원)' }, group(key)?.total, { ...rx, picked: sold(key), noName: !named })
  }

  return cells
}

/**
 * fillAll에 넘길 칸 계획(지금 Planned 모양): 값 칸·unpicked·unknown·noName만. none·missing은 넣지 않아 건드리지 않는다.
 * noName 칸은 값 없이 둔다(그 칸은 채우지 않고 건너뛴 칸으로 알린다)
 */
export function planUisCells(day: UisDay, s: UisSettings): Planned[] {
  return uisCells(day, s).flatMap((c): Planned[] => {
    if (c.why === 'none' || c.why === 'missing') return []
    if (c.why === undefined) return [{ where: c.where, value: c.value }]
    return [{ where: c.where, value: c.why === 'noName' ? null : c.value, why: c.why }]
  })
}

// --- 답 검사(AC-4211.4, design.md 3-2 모양) ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
/** 0 이상 정수 */
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
/** 0 이상 정수 또는 의사랑이 모르는 값 null */
const isN = (value: unknown) => value === null || isCount(value)
const allNull = (rec: Record<string, unknown>, keys: readonly string[]) => keys.every((k) => rec[k] === null)
const allN = (rec: Record<string, unknown>, keys: readonly string[]) => keys.every((k) => isN(rec[k]))
const isDateOrNull = (value: unknown) => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
const isStrings = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string')
const within = (value: unknown, allowed: readonly string[]) =>
  Array.isArray(value) && value.every((v) => typeof v === 'string' && allowed.includes(v))

const BANDS: readonly AgeBand[] = AGE_ROWS.map(([, band]) => band)
const STATES: readonly UisState[] = ['ok', 'missing', 'otherDate', 'notAll', 'twice']
const GROUP_KEYS_UIS: readonly string[] = [...new Set<string>([...UIS_COUNT_KEYS, ...UIS_SALES_KEYS])]
const PAIR_KEYS = ['totalFee', 'received', 'headcount', 'rxTotal', 'visitRows', 'visitNew', 'rsvRows', 'rsvVisited'] as const

const isPair = (value: unknown) => value === null || (Array.isArray(value) && value.length === 2 && value.every(isCount))

function isReport(value: unknown, kind: UisKind): boolean {
  if (!isRecord(value)) return false
  return (
    value.kind === kind &&
    STATES.includes(value.state as UisState) &&
    typeof value.cached === 'boolean' &&
    (value.cached === false || value.state === 'ok') &&
    isDateOrNull(value.from) &&
    isDateOrNull(value.to) &&
    (value.value === null || typeof value.value === 'string') &&
    isStrings(value.columns)
  )
}

function isUis(uis: unknown): boolean {
  if (!isRecord(uis)) return false
  const { reports, checks, reservations } = uis
  return (
    (uis.folder === 'desktop' || uis.folder === 'profile') &&
    Array.isArray(reports) &&
    reports.length === UIS_KINDS.length &&
    reports.every((r, i) => isReport(r, UIS_KINDS[i])) &&
    within(uis.open, [...UIS_KINDS, 'unknown']) &&
    ['deleted', 'kept', 'deleteFailed', 'unknownFiles'].every((k) => isCount(uis[k])) &&
    isRecord(checks) &&
    PAIR_KEYS.every((k) => isPair(checks[k])) &&
    typeof checks.noDate === 'boolean' &&
    within(uis.fractional, UIS_COUNT_KEYS) &&
    within(uis.negative, ['return', 'noExamFee']) &&
    (reservations === null || (isRecord(reservations) && isCount(reservations.total) && isCount(reservations.visited)))
  )
}

/**
 * 의사랑 closing.day 답(design.md 3-2)이고 부른 날짜의 답이면 그대로, 아니면 null(= E-BRIDGE-BAD-REPLY).
 * 숫자 칸은 0 이상 정수 또는 null, 의사랑이 늘 모르는 칸은 null, source = 'uisarang', uis.reports 6개가 UIS_KINDS 차례, ages 10줄이 band 차례.
 * 비트 답(source 없음)은 받지 않는다 — 비트 readDay(main.ts)는 따로이고 그대로다
 */
export function readUisDay(data: unknown, date: string): UisDay | null {
  if (!isRecord(data) || data.date !== date || data.source !== 'uisarang') return null
  const { patients, groups, ages, money, reservations, warnings } = data
  const ok =
    isRecord(patients) &&
    allN(patients, ['new', 'return', 'ptVisit', 'noExamFee', 'total']) &&
    patients.first90 === null &&
    Array.isArray(groups) &&
    groups.every(
      (g) =>
        isRecord(g) &&
        typeof g.key === 'string' &&
        GROUP_KEYS_UIS.includes(g.key) &&
        allN(g, ['patients', 'total']) &&
        allNull(g, ['unpaidVisits', 'new', 'first90', 'return']),
    ) &&
    Array.isArray(ages) &&
    ages.length === BANDS.length &&
    ages.every((a, i) => isRecord(a) && a.band === BANDS[i] && allN(a, ['new', 'return']) && a.first90 === null) &&
    isRecord(money) &&
    allN(money, ['total', 'insurer', 'noncovered', 'received', 'card', 'cash']) &&
    allNull(money, ['receivableIn', 'unpaidNew', 'discount', 'disabledFund', 'transfer', 'refund']) &&
    data.inpatientVisits === null &&
    isRecord(reservations) &&
    Array.isArray(reservations.kinds) &&
    reservations.kinds.length === 0 &&
    isN(reservations.patients) &&
    data.injection === null &&
    data.overlap === null &&
    isRecord(warnings) &&
    warnings.moneyUnconfirmed === false &&
    warnings.splitUnconfirmed === false &&
    warnings.unpaidVisits === 0 &&
    isCount(warnings.unknownAge) &&
    warnings.noHistory === false &&
    isUis(data.uis)
  return ok ? (data as UisDay) : null
}

// --- 멈춤 판정(AC-4212.1~4212.3) ---

export type UisStop =
  | { kind: 'open'; kinds: (UisKind | 'unknown')[] }
  | { kind: 'otherDate'; reports: UisReport[]; patientDeleted: boolean }
  | { kind: 'notAll'; report: UisReport }
  | { kind: 'twice'; report: UisReport }
  | { kind: 'missing' }
  | { kind: 'some'; missing: UisKind[] }

/**
 * 채우기·받기 전에 멈출 까닭. 차례: 열린 엑셀(⑫) → 날짜 다름(⑨, 그런 보고서 모두) → 조건(⑩, 첫 보고서) → 같은 엑셀 둘(⑪, 첫 보고서) →
 * 쓸 수 있는 보고서(ok, 모아 둔 값 포함)가 하나도 없음(⑥) → 꼭 있어야 할 4개 가운데 없음(⑦). 선택 2개(위쪽 표)만 없으면 null
 */
export function stopOf(day: UisDay): UisStop | null {
  if (day.uis.open.length > 0) return { kind: 'open', kinds: [...day.uis.open] }
  const reports = day.uis.reports
  const other = reports.filter((r) => r.state === 'otherDate')
  if (other.length > 0) return { kind: 'otherDate', reports: other, patientDeleted: other.some((r) => UIS_PATIENT.includes(r.kind)) }
  const notAll = reports.find((r) => r.state === 'notAll')
  if (notAll) return { kind: 'notAll', report: notAll }
  const twice = reports.find((r) => r.state === 'twice')
  if (twice) return { kind: 'twice', report: twice }
  if (!reports.some((r) => r.state === 'ok')) return { kind: 'missing' }
  const missing = UIS_REQUIRED.filter((kind) => reports.find((r) => r.kind === kind)?.state !== 'ok')
  return missing.length > 0 ? { kind: 'some', missing } : null
}

// --- 결과 안내 줄(design.md 10-2) ---

/**
 * '의사랑에서 읽지 못한 칸' 까닭 줄(10-2 5, 이 차례): 못 찾은 칸이 있는 보고서(UIS_KINDS 차례, 그 보고서에 기댄 칸이 unknown일 때만 —
 * 맞춰 보기에만 쓰는 칸은 여기 알리지 않는다) → 소수 총투여량 묶음(답 차례) → 재진 음수 → 산정안함 음수. 뒤 줄(help)은 그리는 쪽이 붙인다
 */
export function unreadLines(day: UisDay, cells: readonly UisCell[]): string[] {
  const unread = new Set(cells.filter((c) => c.why === 'unknown').map((c) => c.report))
  const lines: string[] = []
  for (const kind of UIS_KINDS) {
    const r = day.uis.reports.find((x) => x.kind === kind)
    if (r && r.state === 'ok' && r.columns.length > 0 && unread.has(kind)) lines.push(UIS_TEXT.unread.column(UIS_REPORT_NAMES[kind], r.columns))
  }
  for (const key of day.uis.fractional) lines.push(UIS_TEXT.unread.fractional(GROUP_NAMES[key]))
  if (day.uis.negative.includes('return')) lines.push(UIS_TEXT.unread.negativeReturn)
  if (day.uis.negative.includes('noExamFee')) lines.push(UIS_TEXT.unread.negativeNoExamFee)
  return lines
}

/**
 * 맞춰 보기 경고 줄(10-2 8, design.md 6-2 차례): 여덟 짝(null·같은 값은 건너뜀) → 조회일 없음 → 나이 못 셈.
 * 처방통계 짝은 답이 [합계 줄, 코드 줄 합]이고 글은 코드 줄 합을 먼저 쓴다. 뒤 줄(after)은 그리는 쪽이 붙인다
 */
export function checkLines(day: UisDay): string[] {
  const c = day.uis.checks
  const w = UIS_TEXT.warn
  const lines: string[] = []
  const pair = (p: [number, number] | null, line: (left: number, right: number) => string) => {
    if (p && p[0] !== p[1]) lines.push(line(p[0], p[1]))
  }
  pair(c.totalFee, w.totalFee)
  pair(c.received, w.received)
  pair(c.headcount, w.headcount)
  pair(c.rxTotal, (sumRow, codeSum) => w.rxTotal(codeSum, sumRow))
  pair(c.visitRows, w.visitRows)
  pair(c.visitNew, w.visitNew)
  pair(c.rsvRows, w.rsvRows)
  pair(c.rsvVisited, w.rsvVisited)
  if (c.noDate) lines.push(w.noDate)
  if (day.warnings.unknownAge > 0) lines.push(w.unknownAge(day.warnings.unknownAge))
  return lines
}
