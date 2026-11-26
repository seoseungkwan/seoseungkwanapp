import * as XLSX from 'xlsx'
import type { Cell } from '@/types/parse'

// 시험 전용 가짜 의사랑 FStat 엑셀(specs/uisarang-upload design.md §14). 앱 코드는 이 파일을 부르지 않는다.
// 실제 의사랑 파일은 쓰지 않는다 — 머리 줄·라벨 줄·빈 줄·되풀이 머리 줄·합친 칸·합계 줄만 흉내 내고, 환자 글자는 모두 지어낸 것이다

export const TODAY = '2026-11-27'

export type Row = Cell[]
export type BookFormat = 'biff8' | 'xlsx' | 'html' | 'csv'

/** 지어낸 환자 글자(이름·차트번호·주민번호·전화·주소·보험구분·진료실). 결과·저장 요청 어디에도 나오면 안 된다 */
export const FAKE_TEXTS = [
  '홍길동',
  '김가짜',
  '이가명',
  '900101',
  '1234567',
  '010-0000-0000',
  '010-1111-2222',
  '서울시 가짜동',
  '880077',
  '880078',
  '880079',
  '건강보험',
  '제1진료실',
] as const

const isBlankRow = (row: readonly Cell[]) => row.every((cell) => cell === null || cell === '')

/** 칸 줄 → 엑셀·CSV·HTML 바이트. merges = 합친 칸(엑셀 !merges) */
export function bookBytes(rows: readonly Row[], format: BookFormat = 'biff8', merges: XLSX.Range[] = []): Uint8Array<ArrayBuffer> {
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => [...row]))
  if (merges.length > 0) sheet['!merges'] = merges
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  if (format === 'csv') return new TextEncoder().encode(XLSX.utils.sheet_to_csv(sheet)) as Uint8Array<ArrayBuffer>
  if (format === 'html') return new TextEncoder().encode(XLSX.write(book, { type: 'string', bookType: 'html' }) as string) as Uint8Array<ArrayBuffer>
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: format }) as ArrayBuffer)
}

/** rows[index]가 readGrid에서 몇째 줄인가(빈 줄을 뺀 위에서의 차례, 1부터) */
export function gridRowOf(rows: readonly Row[], index: number): number {
  if (index < 0 || index >= rows.length || isBlankRow(rows[index])) throw new Error(`빈 줄이거나 없는 줄: ${index}`)
  return rows.slice(0, index + 1).filter((row) => !isBlankRow(row)).length
}

/** 머리 칸 이름 → 값으로 한 줄(이름 없는 칸·값 없는 칸은 null) */
export function lineOf(header: readonly (string | null)[], values: Readonly<Record<string, Cell>>): Row {
  return header.map((name) => (name !== null && name in values ? values[name] : null))
}

// ── 머리 줄(design.md §1-1) ────────────────────────────────

export const INCOME_HEADER = [
  '보험구분', '총진료비', '급여총액', '청구액', '진료수납액', '본인부담금', '비급여', '초진수', '재진수', '인원계',
  '방문당진료비', null, '방문당청구액', '현금수납액', '카드수납액', '현금영수증수납액',
] as const
export const RX_HEADER = ['코드', '청구코드', '처방명칭', null, null, '총투여량', '총액'] as const
export const VISITS_HEADER = ['내원일', null, null, '인원수', '신규환자'] as const
export const PATIENTS_HEADER = ['차트번호', '수진자명', '보험구분', '진료실', '주민등록번호', '전화번호', '주소', null, null, '휴대전화', '신규환자'] as const
export const RSV_HEADER = ['예약일', '예약건수', '방문', '미방문'] as const
export const RSV_PATIENTS_HEADER = ['예약일', '차트번호', '수진자명', '보험구분', '진료실', '주민등록번호', '전화번호', '주소', null, '방문여부'] as const

/** 라벨 줄. span: 글자면 `[조 회 일] 글자` 한 칸, 숫자(엑셀 날짜)면 라벨 오른쪽 칸, null이면 없음. filter: null이면 외/입 구분 줄 없음 */
export type TopOptions = { span?: string | number | null; filter?: string | null; extraLabels?: Row[] }

function topRows(title: string, options: TopOptions, defaults: { span: string; filter: string | null }): Row[] {
  const span = options.span === undefined ? defaults.span : options.span
  const filter = options.filter === undefined ? defaults.filter : options.filter
  const rows: Row[] = [[title]]
  if (filter !== null) rows.push([`[외/입 구분] ${filter}`])
  if (typeof span === 'string') rows.push([`[조 회 일] ${span}`])
  else if (typeof span === 'number') rows.push(['[조 회 일]', span])
  rows.push(...(options.extraLabels ?? []), [])
  return rows
}

// 본문 줄 사이에 되풀이 머리 줄(쪽마다)·빈 줄을 끼운다
function bodyWith(header: readonly (string | null)[], lines: Row[], repeatEvery?: number, blankEvery?: number): Row[] {
  const rows: Row[] = []
  lines.forEach((line, i) => {
    rows.push(line)
    if (blankEvery !== undefined && (i + 1) % blankEvery === 0) rows.push([])
    if (repeatEvery !== undefined && (i + 1) % repeatEvery === 0) rows.push([...header])
  })
  return rows
}

const truncSum = (values: readonly Cell[]) => values.reduce<number>((sum, value) => sum + (typeof value === 'number' ? Math.trunc(value) : 0), 0)

// ── 일일수입통계 ──────────────────────────────────────────

/** 합계 줄: 총진료비 = 급여총액 + 비급여 · 급여총액 = 청구액 + 본인부담금 · 진료수납액 = 현금 + 카드 · 인원계 = 초진수 + 재진수 */
export const INCOME_TOTAL: Readonly<Record<string, Cell>> = {
  보험구분: '합계',
  총진료비: 1_364_000,
  급여총액: 1_114_000,
  청구액: 812_340,
  진료수납액: 551_660,
  본인부담금: 301_660,
  비급여: 250_000,
  초진수: 6,
  재진수: 40,
  인원계: 46,
  방문당진료비: 29_652,
  방문당청구액: 17_659,
  현금수납액: 151_660,
  카드수납액: 400_000,
  현금영수증수납액: 50_000,
}

export type IncomeOptions = TopOptions & {
  total?: Readonly<Record<string, Cell>> // 합계 줄 칸 바꾸기
  below?: Readonly<Record<string, Cell>> // 합계 줄 바로 아래 줄(합친 칸 흉내)
  noTotal?: boolean
  insurance?: Array<Readonly<Record<string, Cell>>> // 보험구분 줄
}

export function incomeRows(options: IncomeOptions = {}): Row[] {
  const insurance = options.insurance ?? [
    { 보험구분: '건강보험', 총진료비: 1_100_000, 급여총액: 950_000, 청구액: 700_000, 진료수납액: 400_000, 인원계: 40 },
    { 보험구분: '의료급여', 총진료비: 264_000, 급여총액: 164_000, 청구액: 112_340, 진료수납액: 151_660, 인원계: 6 },
  ]
  const rows = [...topRows('일일수입통계', options, { span: '2026-11-02', filter: '전체' }), [...INCOME_HEADER], ...insurance.map((values) => lineOf(INCOME_HEADER, values))]
  if (options.noTotal !== true) rows.push(lineOf(INCOME_HEADER, { ...INCOME_TOTAL, ...options.total }))
  if (options.below !== undefined) rows.push(lineOf(INCOME_HEADER, options.below))
  return rows
}

// ── 기간별처방통계 ────────────────────────────────────────

export type RxLine = { code: Cell; name: Cell; qty: Cell; amount: Cell; claim?: Cell }

/** 한 달(2026-10). ' carm '은 앞뒤 빈칸을 떼면 carm과 같은 코드 */
export const RX_LINES: readonly RxLine[] = [
  { code: 'carm', claim: 'A1', name: '카름정', qty: 120.5, amount: 36_150 },
  { code: 'CRYO 대관절', claim: 'MM301', name: '냉동치료 대관절', qty: 15, amount: 225_000 },
  { code: 'ESWT 1부위', claim: null, name: '체외충격파 1부위', qty: 8, amount: 400_000 },
  { code: 'mm010 100/100', claim: 'MM010', name: '근이완 주사', qty: 0.333, amount: 12_345.9 },
  { code: ' carm ', claim: 'A1', name: '카름정(추가)', qty: 0.25, amount: 300 },
]

export type RxOptions = TopOptions & {
  lines?: readonly RxLine[]
  total?: Cell | 'auto' | 'none' // auto = 줄 총액(원 미만 버림)의 합
  totalBy?: 'code' | 'name' // 합계 글자가 코드 칸에 · 처방명칭 칸에
  repeatEvery?: number
  blankEvery?: number
}

export function rxRows(options: RxOptions = {}): Row[] {
  const lines = options.lines ?? RX_LINES
  const body = lines.map((l) => lineOf(RX_HEADER, { 코드: l.code, 청구코드: l.claim ?? null, 처방명칭: l.name, 총투여량: l.qty, 총액: l.amount }))
  const rows = [...topRows('기간별처방통계', options, { span: '2026-10-01 ~ 2026-10-31', filter: '전체' }), [...RX_HEADER], ...bodyWith(RX_HEADER, body, options.repeatEvery, options.blankEvery)]
  const total = options.total === undefined ? 'auto' : options.total // null = 합계 총액 칸이 빈칸
  if (total !== 'none') {
    const amount = total === 'auto' ? truncSum(lines.map((l) => l.amount)) : total
    rows.push(lineOf(RX_HEADER, options.totalBy === 'name' ? { 처방명칭: '합계', 총액: amount } : { 코드: '합계', 총액: amount }))
  }
  return rows
}

// ── 내원일별 위쪽 표 ──────────────────────────────────────

export type VisitLine = [day: Cell, patients: Cell, newPatients: Cell]

/** 한 주(2026-11-02 월 ~ 08 일). 일요일은 줄 없음(휴진) */
export const VISIT_LINES: readonly VisitLine[] = [
  ['2026-11-02', 40, 5],
  ['2026-11-03', 52, 7],
  ['2026-11-04', 38, 3],
  ['2026-11-05', 45, 4],
  ['2026-11-06', 50, 6],
  ['2026-11-07', 20, 1],
]

export type VisitsOptions = TopOptions & {
  lines?: readonly VisitLine[]
  total?: [Cell, Cell] | 'auto' | 'none'
  repeatEvery?: number
  blankEvery?: number
}

export function visitsRows(options: VisitsOptions = {}): Row[] {
  const lines = options.lines ?? VISIT_LINES
  const body = lines.map(([day, patients, newPatients]) => lineOf(VISITS_HEADER, { 내원일: day, 인원수: patients, 신규환자: newPatients }))
  const rows = [...topRows('내원일별환자현황', options, { span: '2026-11-02 ~ 2026-11-08', filter: null }), [...VISITS_HEADER], ...bodyWith(VISITS_HEADER, body, options.repeatEvery, options.blankEvery)]
  const total = options.total ?? 'auto'
  if (total !== 'none') {
    const [patients, newPatients] = total === 'auto' ? [truncSum(lines.map((l) => l[1])), truncSum(lines.map((l) => l[2]))] : total
    rows.push(lineOf(VISITS_HEADER, { 내원일: '합계', 인원수: patients, 신규환자: newPatients }))
  }
  return rows
}

// ── 내원일별 아래쪽 표 ────────────────────────────────────

/** newText를 주면 신규환자 칸 글자 그대로, 아니면 isNew면 '신규' */
export type PatientLine = { chart: Cell; rrn: Cell; isNew?: boolean; newText?: Cell; name?: string }

/** 그날(2026-11-03) 열일곱 명 — 이름·번호·전화·주소는 지어낸 것 */
export const PATIENT_LINES: readonly PatientLine[] = [
  { chart: '880077', name: '홍길동', rrn: '900101-1234567', isNew: true }, // 36 → 30대
  { chart: '880078', name: '김가짜', rrn: '161104-4123456' }, // 9 → 10세 미만
  { chart: 880079, name: '이가명', rrn: '151103-3123456', isNew: true }, // 11 → 10대
  { chart: '000881', rrn: '450101-1******' }, // 81 → 80세 이상
  { chart: '880080', rrn: '850505 2123456' }, // 41 → 40대
  { chart: '880081', rrn: null }, // 생년월일 없음
  { chart: '880082', rrn: '901301-1234567' }, // 없는 날 → 없음
  { chart: '880083', rrn: '270101-3123456' }, // 그날 뒤 → 없음
  { chart: '880084', rrn: '000101-0123456' }, // 1800년대 → 80세 이상
  { chart: '880085', rrn: '991231-9123456', isNew: true }, // 1800년대 → 80세 이상
  { chart: '880086', rrn: '051103-3123456' }, // 21 → 20대
  { chart: '880087', rrn: '061104-4123456' }, // 19 → 10대
  { chart: '880088', rrn: '*******-*******' }, // 가려짐 → 없음
  { chart: '880089', rrn: '560505-5123456' }, // 70 → 70대
  { chart: '880090', rrn: '010203-7123456' }, // 25 → 20대
  { chart: '880091', rrn: '760607-6123456' }, // 50 → 50대
  { chart: '880092', rrn: '660708-2123456' }, // 60 → 60대
]

export type PatientsOptions = TopOptions & { lines?: readonly PatientLine[]; repeatEvery?: number; blankEvery?: number; footer?: Row[] }

export function patientRows(options: PatientsOptions = {}): Row[] {
  const lines = options.lines ?? PATIENT_LINES
  const body = lines.map((p) =>
    lineOf(PATIENTS_HEADER, {
      차트번호: p.chart,
      수진자명: p.name ?? '김가짜',
      보험구분: '건강보험',
      진료실: '제1진료실',
      주민등록번호: p.rrn,
      전화번호: '010-0000-0000',
      주소: '서울시 가짜동 1-2',
      휴대전화: '010-1111-2222',
      신규환자: p.newText !== undefined ? p.newText : p.isNew === true ? '신규' : null,
    }),
  )
  return [
    ...topRows('내원일별환자현황', options, { span: '2026-11-03', filter: null }),
    [...PATIENTS_HEADER],
    ...bodyWith(PATIENTS_HEADER, body, options.repeatEvery, options.blankEvery),
    ...(options.footer ?? []),
  ]
}

// ── 예약환자통계(웹앱은 쓰지 않는다 — 조회일·조건·줄이 엉망이어도 건너뜀) ──

export function rsvRows(): Row[] {
  return [['예약환자통계'], ['[조 회 일] 못 읽는 글자'], ['[진료실] 제1진료실'], [...RSV_HEADER], ['2026-11-03', '많음', '가짜', null]]
}

export function rsvPatientRows(): Row[] {
  return [
    ['예약환자통계'],
    ['[조 회 일] 2026-11-03 ~ 2026-12-31'],
    [...RSV_PATIENTS_HEADER],
    lineOf(RSV_PATIENTS_HEADER, {
      예약일: '2026-11-03',
      차트번호: '880077',
      수진자명: '홍길동 가짜',
      보험구분: '건강보험',
      진료실: '제1진료실',
      주민등록번호: '900101-1234567',
      전화번호: '010-0000-0000',
      주소: '서울시 가짜동',
      방문여부: '방문',
    }),
  ]
}
