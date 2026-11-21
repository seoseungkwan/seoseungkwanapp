import * as XLSX from 'xlsx'
import { excelSerialToYmd, parseDateCell } from '@/lib/analytics/dates'
import { hasNationalId } from './nationalId'

// 직원 명단 [엑셀 올리기] 읽기(specs/staff REQ-7608, design.md 4절). 순수 함수 — 네트워크·저장소·supabase 없음.
// 양식은 public/staff/staff-template.xlsx(scripts/make_staff_template.py가 만든다). 형은 @/types/staff를 불러오지 않고
// 같은 칸 이름으로 둔다(StaffMember·WeekPlan·병원 정보 hours를 그대로 넘길 수 있다). 결과 줄은 저장 층 importRoster로 넘긴다

/**
 * 양식 '직원' 시트 첫 줄 22칸(AC-7608.1). 맨 끝 '넘어온 연차(일)'은 2026-11-21에 더했다 — 그 칸이 없는 옛 양식(앞 21칸)도 읽는다(AC-7608.7).
 * 주민번호 칸은 없다
 */
export const ROSTER_HEADERS = [
  '이름*',
  '직종',
  '근무 형태',
  '주 근무시간',
  '입사일*',
  '퇴사일',
  '연락처',
  '생일',
  '주소',
  '은행',
  '계좌번호',
  '올해 이미 쓴 연차(일)',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
  '일',
  '토요일 격주',
  '메모',
  '넘어온 연차(일)',
] as const
export type RosterHeader = (typeof ROSTER_HEADERS)[number]
/** 옛 양식 칸 수(맨 끝 '넘어온 연차(일)'이 없음) */
const OLD_FORM_WIDTH = 21

const JOBS = ['간호사', '간호조무사', '물리치료사', '방사선사', '원무', '기타'] as const
type Job = (typeof JOBS)[number]
type Employment = 'regular' | 'contract' | 'part'
type Shift = { start: number; end: number; lunchFrom: number | null; lunchTo: number | null } | null // 분, null = 쉼
type Sat = 'every' | '1-3' | '2-4'

/** 엑셀에서 오는 직원 칸(StaffMember에서 id·예약 시행자를 뺀 것) */
export type RosterMember = {
  name: string
  job: Job
  jobOther: string | null
  employment: Employment
  weeklyHours: number
  hiredOn: string
  leftOn: string | null
  phone: string | null
  birthday: string | null
  address: string | null
  bank: string | null
  accountNo: string | null
  memo: string | null
  usedBefore: number
  usedBeforeFrom: string | null
  carryStart: number // 넘어온 연차 시작 값(AC-7608.7). 새 사람은 비면 0
}
/** 이미 있는 직원(StaffMember를 그대로 넘겨도 된다) */
export type RosterExisting = { id: string } & Omit<RosterMember, 'usedBefore' | 'usedBeforeFrom'>
/** 지금 기본 근무(WeekPlan을 그대로 넘겨도 된다) */
export type RosterPlan = { staffId: string; from: string; week: readonly Shift[]; sat: Sat }
export type RosterContext = {
  today: string
  /** 병원 정보 진료시간 일곱 칸(월~일). 엑셀로 넣는 기본 근무의 점심을 채운다 */
  hours: readonly ({ lunchFrom: number | null; lunchTo: number | null } | null)[]
  /** 이미 있는 직원의 기본 근무들. 고침 줄의 '기본 근무'가 지금과 같은지 본다 */
  plans: readonly RosterPlan[]
  /** 오늘이 든 연차 기간 시작일(화면은 lib/staff/leave.ts leaveStatus(...).period.from). '올해 이미 쓴 연차'와 함께 저장한다(AC-7608.5) */
  periodStart: (person: { employment: Employment; weeklyHours: number; hiredOn: string; leftOn: string | null }) => string
}
export type RosterRow = {
  line: number // 엑셀 줄 번호(머리 줄 = 1)
  action: 'new' | 'update' | 'problem'
  reason: string | null // 문제 줄의 까닭
  changed: string[] // 고침 줄에서 바뀌는 칸 이름(양식 칸 차례)
  /** 새 줄 = 넣을 모든 칸, 고침 줄 = id·이름·입사일 + 적힌 칸만(올해 쓴 연차 빼고 — 넘어온 연차는 적혔을 때만), 문제 줄 = 읽힌 칸만 */
  member: Partial<RosterMember> & { id?: string }
  /** 새 기본 근무(새 사람은 입사일부터, 고침은 오늘부터). null = 넣지 않음(요일 칸이 다 비었거나 지금과 같음) */
  plan: { week: Shift[]; sat: Sat } | null
  /** 칸마다 적힌 글자 그대로(미리 보기에서 문제 줄을 보일 때). 옛 양식이면 '넘어온 연차(일)'은 '' */
  raw: Record<RosterHeader, string>
}
export type RosterRead = { problem: string | null; rows: RosterRow[] }

/** 엑셀로 열 수 없는 파일(깨짐·암호). 화면은 E-STAFF-EXCEL-FAILED 문구를 보인다. 예외 글에 파일 내용을 넣지 않는다 */
export class RosterExcelError extends Error {
  readonly code = 'E-STAFF-EXCEL-FAILED' as const
  constructor() {
    super('E-STAFF-EXCEL-FAILED')
    this.name = 'RosterExcelError'
  }
}

const SHEET = '직원'
const MAX_PEOPLE = 300
const EXAMPLE_PREFIX = '보기 줄'
const FORM_PROBLEM = '양식이 달라요. [엑셀 양식 받기]로 받은 파일에 적어 주세요.'
const TOO_MANY = '한 번에 300명까지 올릴 수 있어요.'
const NAME_EMPTY = '이름을 적어 주세요.'
const HIRE_EMPTY = '입사일을 적어 주세요.'
const DUPLICATE = '같은 사람이 위 줄에도 있어요.'
const CARRY_PROBLEM = '넘어온 연차(일)는 -30~100 사이 숫자로 적어 주세요. 반차는 0.5예요.'

const EMPLOYMENTS: Record<string, Employment> = { 정규직: 'regular', 계약직: 'contract', 파트타임: 'part' }
const SAT_ROTATIONS: Record<string, Sat> = { 매주: 'every', '1·3주': '1-3', '2·4주': '2-4' }
const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
// 양식 날짜 칸 확인(DATE(1930,1,1)~DATE(2100,12,31))과 같은 범위
const DATE_MIN = '1930-01-01'
const DATE_MAX = '2100-12-31'
// DB 한도(AC-7601.4) — 넘는 줄은 저장 층이 넣기 전체를 거절하므로 여기서 문제 줄로 뺀다
const NAME_MAX = 20
const JOB_OTHER_MAX = 20
const ADDRESS_MAX = 100
const BANK_MAX = 20
const MEMO_MAX = 500
const PHONE = /^[0-9]{9,11}$/
const ACCOUNT = /^[0-9-]{6,30}$/
const NUMBER = /^-?\d+(?:\.\d+)?$/
const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})$/
const DAY_MINUTES = 1440
const MINUTE_STEP = 10

const COL = Object.fromEntries(ROSTER_HEADERS.map((header, i) => [header, i])) as Record<RosterHeader, number>
const lengthOf = (text: string) => [...text].length
const isHalfStep = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max && Number.isInteger(n * 2)

// text = 읽을 글자(숫자 칸은 숫자 그대로 — 긴 계좌번호가 1.1E+11로 바뀌지 않게), shown = 엑셀에 보이는 글자(날짜 칸은 2021-03-02)
type Cell = { value: string | number | null; text: string; shown: string }
const EMPTY: Cell = { value: null, text: '', shown: '' }

/** 칸 하나: 숫자 칸(엑셀 날짜 값 포함)은 숫자, 나머지는 앞뒤 빈칸을 뗀 글자 */
function readCell(cell: XLSX.CellObject | undefined): Cell {
  if (cell === undefined || cell.v === undefined || cell.v === null) return EMPTY
  if (typeof cell.v === 'number' && cell.t === 'n') return { value: cell.v, text: String(cell.v), shown: (cell.w ?? String(cell.v)).trim() }
  const text = (typeof cell.v === 'string' ? cell.v : (cell.w ?? String(cell.v))).trim()
  return text === '' ? EMPTY : { value: text, text, shown: text }
}

function openSheet(buffer: ArrayBuffer | Uint8Array): XLSX.WorkSheet | null {
  let book: XLSX.WorkBook
  try {
    book = XLSX.read(buffer, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false })
  } catch {
    throw new RosterExcelError()
  }
  return Object.hasOwn(book.Sheets, SHEET) ? book.Sheets[SHEET] : null
}

/** 칸이 있는 곳만 훑는다(서식만 깔린 빈 줄 수만큼 돌지 않게). 머리 줄은 모든 칸, 나머지 줄은 22칸까지 */
function gridOf(sheet: XLSX.WorkSheet): { header: Map<number, string>; cells: Map<number, Map<number, Cell>> } {
  const header = new Map<number, string>()
  const cells = new Map<number, Map<number, Cell>>()
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue
    const { r, c } = XLSX.utils.decode_cell(key)
    const cell = readCell(sheet[key] as XLSX.CellObject)
    if (cell.value === null) continue
    if (r === 0) header.set(c, cell.shown)
    else if (c < ROSTER_HEADERS.length) {
      const line = cells.get(r) ?? new Map<number, Cell>()
      line.set(c, cell)
      cells.set(r, line)
    }
  }
  return { header, cells }
}

/** 머리 줄이 새 양식(22칸)이면 22, 옛 양식(앞 21칸만)이면 21, 아니면 null */
function formWidth(header: Map<number, string>): number | null {
  const same = (width: number) => header.size === width && ROSTER_HEADERS.slice(0, width).every((name, c) => header.get(c) === name)
  if (same(ROSTER_HEADERS.length)) return ROSTER_HEADERS.length
  return same(OLD_FORM_WIDTH) ? OLD_FORM_WIDTH : null
}

/** 양식 칸 수 안의 값만 줄로 모은다. 옛 양식은 22번째 칸을 읽지 않는다(그 칸만 적힌 줄은 빈 줄) — 그 칸은 빈 칸 */
function linesOf(cells: Map<number, Map<number, Cell>>, width: number): Map<number, Cell[]> {
  const lines = new Map<number, Cell[]>()
  for (const [r, line] of cells) {
    const row = ROSTER_HEADERS.map((_, c) => (c < width ? (line.get(c) ?? EMPTY) : EMPTY))
    if (row.some((cell) => cell.value !== null)) lines.set(r, row)
  }
  return lines
}

// ── 칸 읽기 ─────────────────────────────────────────────

const label = (header: RosterHeader) => header.replace('*', '')

function readDate(cell: Cell): string | null {
  const ymd = typeof cell.value === 'number' ? excelSerialToYmd(cell.value) : parseDateCell(cell.text.replace(/\./g, '-'))
  return ymd !== null && ymd >= DATE_MIN && ymd <= DATE_MAX ? ymd : null
}

function readNumber(cell: Cell): number {
  if (typeof cell.value === 'number') return cell.value
  return NUMBER.test(cell.text) ? Number(cell.text) : Number.NaN
}

function toMinutes(hour: string, minute: string): number | null {
  const h = Number(hour)
  const m = Number(minute)
  const total = h * 60 + m
  return m < 60 && total <= DAY_MINUTES && total % MINUTE_STEP === 0 ? total : null
}

type Parsed = { reasons: string[]; fields: Partial<RosterMember>; week: Shift[] | null; sat: Sat }

/** 한 줄의 칸을 읽는다. 적힌 칸만 fields에 넣고, 어긴 칸은 그 칸 이름이 든 까닭을 모은다(이름·입사일 먼저, 그다음 양식 칸 차례) */
function parseLine(cells: readonly Cell[], hours: RosterContext['hours']): Parsed {
  const at = (header: RosterHeader) => cells[COL[header]]
  const first: string[] = []
  const reasons: string[] = []
  const fields: Partial<RosterMember> = {}
  const date = (header: RosterHeader, into: (ymd: string) => void) => {
    const cell = at(header)
    if (cell.value === null) return
    const ymd = readDate(cell)
    if (ymd === null) (header === '입사일*' ? first : reasons).push(`${label(header)} 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.`)
    else into(ymd)
  }
  // subject = 칸 이름 + 은/는. noNationalId = 주민번호 모양이면 문제 줄(주소·메모, AC-7608.6) — 그 글은 넣을 칸에 두지 않는다
  const text = (header: RosterHeader, subject: string, max: number, into: (value: string) => void, noNationalId = false) => {
    const value = at(header).text
    if (value === '') return
    if (lengthOf(value) > max) reasons.push(`${subject} ${max}자까지 적어 주세요.`)
    else if (noNationalId && hasNationalId(value)) reasons.push(`${label(header)}에 주민번호 모양 글이 있어요. 주민번호는 저장하지 않아요.`)
    else into(value)
  }

  const name = at('이름*').text
  if (name === '') first.push(NAME_EMPTY)
  else if (lengthOf(name) > NAME_MAX) first.push(`이름은 ${NAME_MAX}자까지 적어 주세요.`)
  else fields.name = name

  if (at('입사일*').value === null) first.push(HIRE_EMPTY)
  else date('입사일*', (ymd) => (fields.hiredOn = ymd))

  const job = at('직종').text
  if ((JOBS as readonly string[]).includes(job)) Object.assign(fields, { job: job as Job, jobOther: null })
  else if (job !== '') {
    if (lengthOf(job) > JOB_OTHER_MAX) reasons.push(`직종은 ${JOB_OTHER_MAX}자까지 적어 주세요.`)
    else Object.assign(fields, { job: '기타', jobOther: job })
  }

  const employment = at('근무 형태').text
  if (employment !== '') {
    if (Object.hasOwn(EMPLOYMENTS, employment)) fields.employment = EMPLOYMENTS[employment]
    else reasons.push("근무 형태는 '정규직', '계약직', '파트타임' 가운데 하나로 적어 주세요.")
  }

  if (at('주 근무시간').value !== null) {
    const weekly = readNumber(at('주 근무시간'))
    if (isHalfStep(weekly, 0, 80)) fields.weeklyHours = weekly
    else reasons.push('주 근무시간은 0~80 사이 숫자로 적어 주세요(0.5 단위). 예: 40')
  }

  date('퇴사일', (ymd) => (fields.leftOn = ymd))

  if (at('연락처').value !== null) {
    const digits = at('연락처').text.replace(/\D/g, '')
    if (PHONE.test(digits)) fields.phone = digits
    else reasons.push('연락처는 숫자 9~11자리로 적어 주세요. 예: 010-0000-0000')
  }

  date('생일', (ymd) => (fields.birthday = ymd))
  text('주소', '주소는', ADDRESS_MAX, (value) => (fields.address = value), true)
  text('은행', '은행은', BANK_MAX, (value) => (fields.bank = value))

  const account = at('계좌번호').text
  if (account !== '') {
    if (ACCOUNT.test(account)) fields.accountNo = account
    else reasons.push('계좌번호는 숫자와 - 만 6~30자로 적어 주세요.')
  }

  if (at('올해 이미 쓴 연차(일)').value !== null) {
    const used = readNumber(at('올해 이미 쓴 연차(일)'))
    if (isHalfStep(used, 0, 50)) fields.usedBefore = used
    else reasons.push('올해 이미 쓴 연차(일)는 0~50 사이 숫자로 적어 주세요. 반차는 0.5예요.')
  }

  // 요일 칸: 빈 칸 = 쉼. 점심은 병원 정보 그 요일 점심이 근무 안에 들 때만(Claude가 정한 것 9)
  let written = false
  const week = WEEKDAYS.map((day, i): Shift => {
    const value = at(day).text
    if (value === '') return null
    written = true
    const match = TIME_RANGE.exec(value)
    const start = match ? toMinutes(match[1], match[2]) : null
    const end = match ? toMinutes(match[3], match[4]) : null
    if (start === null || end === null) {
      reasons.push(`${day} 칸 모양이 틀렸어요. 09:00-18:00처럼 10분 단위로 적어 주세요.`)
      return null
    }
    if (start >= end) {
      reasons.push(`${day} 칸 끝 시간이 시작 시간보다 늦어야 해요.`)
      return null
    }
    const clinic = hours[i] ?? null
    const lunchIn =
      clinic !== null && clinic.lunchFrom !== null && clinic.lunchTo !== null && start <= clinic.lunchFrom && clinic.lunchFrom < clinic.lunchTo && clinic.lunchTo <= end
    return { start, end, lunchFrom: lunchIn ? clinic.lunchFrom : null, lunchTo: lunchIn ? clinic.lunchTo : null }
  })

  let sat: Sat = 'every'
  const rotation = at('토요일 격주').text.replace(/\s/g, '').replace(/[.,ㆍ・•/]/g, '·')
  if (rotation !== '') {
    if (Object.hasOwn(SAT_ROTATIONS, rotation)) sat = SAT_ROTATIONS[rotation]
    else reasons.push("토요일 격주는 '매주', '1·3주', '2·4주' 가운데 하나로 적어 주세요.")
  }

  text('메모', '메모는', MEMO_MAX, (value) => (fields.memo = value), true)

  // 넘어온 연차(일): −30~100·0.5 단위, 음수는 '-'로 시작하는 글자도(AC-7608.7)
  if (at('넘어온 연차(일)').value !== null) {
    const carry = readNumber(at('넘어온 연차(일)'))
    if (isHalfStep(carry, -30, 100)) fields.carryStart = carry
    else reasons.push(CARRY_PROBLEM)
  }

  if (fields.hiredOn !== undefined && typeof fields.leftOn === 'string' && fields.leftOn < fields.hiredOn) {
    reasons.push('퇴사일이 입사일보다 앞이에요. 퇴사일을 확인해 주세요.')
  }
  return { reasons: [...first, ...reasons], fields, week: written ? week : null, sat }
}

// ── 고침 ─────────────────────────────────────────────

/** 고침 줄에서 비교하는 칸(양식 칸 차례). '기본 근무'는 계좌번호와 메모 사이, 그 뒤 메모·넘어온 연차는 readRoster가 붙인다 */
const CHANGE_FIELDS: readonly (readonly [string, readonly (keyof RosterExisting)[]])[] = [
  ['직종', ['job', 'jobOther']],
  ['근무 형태', ['employment']],
  ['주 근무시간', ['weeklyHours']],
  ['퇴사일', ['leftOn']],
  ['연락처', ['phone']],
  ['생일', ['birthday']],
  ['주소', ['address']],
  ['은행', ['bank']],
  ['계좌번호', ['accountNo']],
]

const sameShift = (a: Shift, b: Shift) =>
  a === null || b === null ? a === b : a.start === b.start && a.end === b.end && a.lunchFrom === b.lunchFrom && a.lunchTo === b.lunchTo

function currentPlan(plans: readonly RosterPlan[], staffId: string, today: string): RosterPlan | null {
  let found: RosterPlan | null = null
  for (const plan of plans) if (plan.staffId === staffId && plan.from <= today && (found === null || plan.from > found.from)) found = plan
  return found
}

function changesOf(fields: Partial<RosterMember>, target: RosterExisting): string[] {
  return CHANGE_FIELDS.filter(([, keys]) => keys.some((key) => key in fields && fields[key as keyof RosterMember] !== target[key])).map(([name]) => name)
}

// ── 읽기 ─────────────────────────────────────────────

/**
 * 올린 엑셀을 읽어 미리 보기 줄을 만든다(AC-7608.1~AC-7608.7).
 * - 시트 '직원' 첫 줄이 ROSTER_HEADERS(또는 옛 양식 앞 21칸)와 다르거나 넣을 줄이 300명을 넘으면 problem만(줄 없음)
 * - 다 빈 줄·메모가 '보기 줄'로 시작하는 줄은 건너뛴다
 * - 같은 이름 + 입사일이 existing에 있으면 고침(적힌 칸만), 파일 안 같은 사람 두 줄은 뒤 줄이 문제
 * - 새 사람 기본값: 직종이 비면 '기타'(직접 적은 직종 없음), 근무 형태 정규직, 주 40시간, 올해 쓴 연차 0, 넘어온 연차 0
 * 엑셀로 열 수 없으면 RosterExcelError를 던진다
 */
export function readRoster(buffer: ArrayBuffer | Uint8Array, existing: readonly RosterExisting[], ctx: RosterContext): RosterRead {
  const sheet = openSheet(buffer)
  if (sheet === null) return { problem: FORM_PROBLEM, rows: [] }
  const { header, cells: grid } = gridOf(sheet)
  const width = formWidth(header)
  if (width === null) return { problem: FORM_PROBLEM, rows: [] }
  const lines = linesOf(grid, width)

  const people = [...lines.entries()]
    .filter(([, cells]) => !cells[COL['메모']].text.startsWith(EXAMPLE_PREFIX))
    .sort(([a], [b]) => a - b)
  if (people.length > MAX_PEOPLE) return { problem: TOO_MANY, rows: [] }

  const keyOf = (name: string, hiredOn: string) => `${name}\u0000${hiredOn}`
  const byKey = new Map(existing.map((member) => [keyOf(member.name, member.hiredOn), member]))
  const seen = new Set<string>()

  const rows = people.map(([r, cells]): RosterRow => {
    const line = r + 1
    const raw = Object.fromEntries(ROSTER_HEADERS.map((name, c) => [name, cells[c].shown])) as Record<RosterHeader, string>
    const { reasons, fields, week, sat } = parseLine(cells, ctx.hours)
    const key = fields.name !== undefined && fields.hiredOn !== undefined ? keyOf(fields.name, fields.hiredOn) : null
    if (key !== null) {
      if (seen.has(key)) reasons.unshift(DUPLICATE)
      seen.add(key)
    }
    if (reasons.length > 0 || key === null) return { line, action: 'problem', reason: reasons.join(' '), changed: [], member: fields, plan: null, raw }

    const target = byKey.get(key)
    if (target !== undefined) {
      // '올해 이미 쓴 연차'는 새 직원 줄에만(AC-7608.4)
      const written: Partial<RosterMember> = { ...fields }
      delete written.usedBefore
      const changed = changesOf(written, target)
      const now = currentPlan(ctx.plans, target.id, ctx.today)
      const samePlan = week !== null && now !== null && now.sat === sat && week.every((shift, i) => sameShift(shift, now.week[i] ?? null))
      const plan = week !== null && !samePlan ? { week, sat } : null
      if (plan !== null) changed.push('기본 근무')
      if ('memo' in written && written.memo !== target.memo) changed.push('메모')
      // 넘어온 연차는 고침 줄에도 넣는다 — 적혔고 지금 값과 다를 때만 바뀐 칸(양식 칸 차례로 맨 끝, AC-7608.7)
      if ('carryStart' in written && written.carryStart !== target.carryStart) changed.push('넘어온 연차')
      return { line, action: 'update', reason: null, changed, member: { id: target.id, ...written }, plan, raw }
    }

    const employment = fields.employment ?? 'regular'
    const weeklyHours = fields.weeklyHours ?? 40
    const hiredOn = fields.hiredOn as string
    const leftOn = fields.leftOn ?? null
    const usedBefore = fields.usedBefore ?? 0
    const member: RosterMember = {
      name: fields.name as string,
      job: fields.job ?? '기타',
      jobOther: fields.jobOther ?? null,
      employment,
      weeklyHours,
      hiredOn,
      leftOn,
      phone: fields.phone ?? null,
      birthday: fields.birthday ?? null,
      address: fields.address ?? null,
      bank: fields.bank ?? null,
      accountNo: fields.accountNo ?? null,
      memo: fields.memo ?? null,
      usedBefore,
      usedBeforeFrom: usedBefore > 0 ? ctx.periodStart({ employment, weeklyHours, hiredOn, leftOn }) : null,
      carryStart: fields.carryStart ?? 0,
    }
    return { line, action: 'new', reason: null, changed: [], member, plan: week === null ? null : { week, sat }, raw }
  })
  return { problem: null, rows }
}
