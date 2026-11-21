import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonthsToDay, isMonth, isYmd, todayInKorea } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import {
  ADJUST_REASONS,
  DEFAULT_PAY_ITEMS,
  EMPLOYMENTS,
  INCENTIVE_METHODS,
  LEAVE_KINDS,
  OVERTIME_KINDS,
  SAT_ROTATIONS,
  STAFF_FILES_BUCKET,
  STAFF_JOBS,
  type DayChange,
  type DayShift,
  type IncentiveEntry,
  type IncentiveMethod,
  type IncentiveRule,
  type Leave,
  type LeaveBasis,
  type Leftover,
  type Overtime,
  type PayItem,
  type PayLine,
  type PayMonth,
  type SatRotation,
  type StaffErrorCode,
  type StaffMember,
  type StaffSettings,
  type WeekPlan,
} from '@/types/staff'

// 직원 탭 저장 층(spec staff REQ-7610, design.md 5절, ADR-035). 브라우저 → Supabase, 어느 병원 줄인지는 RLS(my_hospital_id(), 승인된 원장만)가 고른다(ADR-004).
// 표는 staff_*(migration 20261121000000_staff.sql, design.md 1절). 보내는 몸통은 정해 둔 칸만 골라 새로 만든다({ ...받은 값 } 금지) —
// hospital_id·id·시각은 보내지 않고, 주민번호 칸은 없다. 받은 값이 DB 규칙(AC-7601.4~7601.6)을 어기면 보내지 않는다.
// 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 버리고(설정은 틀린 칸만 기본값), 목록은 1,000줄씩 끝까지 읽는다(쪽 하나라도 실패하면 반쪽 목록 대신 실패).
// 실패는 StaffStoreError(번호만: E-STAFF-READ-FAILED·E-STAFF-SAVE-FAILED·E-STAFF-FILE-FAILED)다. Supabase 오류 글·입력값은 담지 않는다.
// 자식 표(기본 근무·바뀐 날·더 일한 시간·급여 줄·달 줄)는 열쇠 칸(직원·날·달)에 고치기 권한이 없어(design.md 1절 권한 표) upsert를 쓰지 않는다:
// 그 열쇠 줄을 먼저 고치고, 없으면 열쇠와 함께 넣는다(다른 창이 그새 넣어 겹치면 한 번 더 고친다)

export type StaffClient = Pick<SupabaseClient, 'from' | 'storage'>
type Row = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data: unknown; error: unknown }

/** 오류에는 번호만 담는다 */
export class StaffStoreError extends Error {
  readonly code: StaffErrorCode

  constructor(code: StaffErrorCode) {
    super(code)
    this.name = 'StaffStoreError'
    this.code = code
  }
}

const READ: StaffErrorCode = 'E-STAFF-READ-FAILED'
const SAVE: StaffErrorCode = 'E-STAFF-SAVE-FAILED'
const FILE: StaffErrorCode = 'E-STAFF-FILE-FAILED'

const MEMBERS = 'staff_members'
const PLANS = 'staff_week_plans'
const CHANGES = 'staff_day_changes'
const OVERTIME = 'staff_overtime'
const LEAVES = 'staff_leaves'
const SETTINGS = 'staff_settings'
const RULES = 'staff_incentive_rules'
const LINES = 'staff_pay_lines'
const MONTHS = 'staff_pay_months'
const FILES = 'staff_files'
const APPTS = 'calendar_appts'

const PLAN_COLUMNS = 'id,staff_id,from_day,week,sat_rotation'
const CHANGE_COLUMNS = 'staff_id,day,start_min,end_min,lunch_from,lunch_to,memo'
const OVERTIME_COLUMNS = 'staff_id,day,kind,minutes'
const LEAVE_COLUMNS = 'id,group_id,staff_id,day,kind,part,paid,memo'
const SETTINGS_COLUMNS = 'leave_basis,leftover,pay_items'
const RULE_COLUMNS = 'id,staff_id,name,method,unit_amount,percent,sort'
const LINE_COLUMNS = 'id,month,staff_id,amounts,incentives,adjust,adjust_reason,adjust_memo'
const MONTH_COLUMNS = 'month,employer_cost,cost_saved_on,copied_on'
const PAGE_ROWS = 1000
const BATCH = 10 // 엑셀 고침 줄·규칙 다시 적기는 10개씩 함께 보낸다
const ASC = { ascending: true }

// DB 제약과 같은 한도(글자 수는 DB char_length처럼 코드포인트로 센다)
const NAME_MAX = 20
const JOB_OTHER_MAX = 20
const ADDRESS_MAX = 100
const BANK_MAX = 20
const MEMBER_MEMO_MAX = 500
const CAL_ID_MAX = 40
const DAY_MEMO_MAX = 50
const ITEM_ID_MAX = 40
const ITEM_NAME_MAX = 20
const PAY_ITEMS_MAX = 30
const ADJUST_MAX = 100_000_000
const ADJUST_MEMO_MAX = 30
const KEEP_MONTHS = 36 // 퇴사 + 3년(AC-7601.7)
const PHONE = /^[0-9]{9,11}$/
const ACCOUNT = /^[0-9-]{6,30}$/

// ── 보내기·읽기 ─────────────────────────────────────────────

/** 요청 하나. 던짐·오류 답은 번호만 남긴다(staffFiles.ts도 쓴다) */
export async function requestOrFail<R extends Reply>(code: StaffErrorCode, request: () => PromiseLike<R>): Promise<R> {
  let reply: R
  try {
    reply = await request()
  } catch {
    throw new StaffStoreError(code)
  }
  if (reply.error) throw new StaffStoreError(code)
  return reply
}

/** 1,000줄씩 끝까지 읽는다. 쪽 하나라도 실패하거나 목록이 아니면 반쪽 목록 대신 실패(staffFiles.ts도 쓴다) */
export async function readAllOrFail(code: StaffErrorCode, page: (first: number, last: number) => PromiseLike<Reply>): Promise<unknown[]> {
  const all: unknown[] = []
  for (;;) {
    const { data } = await requestOrFail(code, () => page(all.length, all.length + PAGE_ROWS - 1))
    if (!Array.isArray(data)) throw new StaffStoreError(code)
    all.push(...data)
    if (data.length < PAGE_ROWS) return all
  }
}

async function inBatches<T>(items: readonly T[], work: (item: T) => Promise<unknown>): Promise<void> {
  for (let at = 0; at < items.length; at += BATCH) await Promise.all(items.slice(at, at + BATCH).map(work))
}

const isDuplicate = (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'

// ── 모양 확인 ───────────────────────────────────────────────

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const lengthOf = (text: string) => [...text].length
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && lengthOf(value) >= min && lengthOf(value) <= max
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isMonthText = (value: unknown): value is string => typeof value === 'string' && isMonth(value)
const isOneOf = <T>(list: readonly T[], value: unknown): value is T => (list as readonly unknown[]).includes(value)
const isWhole = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const isStepped = (value: unknown, min: number, max: number, step: number): value is number =>
  isWhole(value, min, max) && (value as number) % step === 0
// 0.5 단위(DB: x * 2 = trunc(x * 2))
const isHalfStep = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && Number.isInteger(value * 2)
// 0~100, 소수 둘째 자리까지(numeric(5,2))
const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
const isMinute = (value: unknown): value is number => isStepped(value, 0, 1440, 10)
const isMoney = (value: unknown): value is number => isWhole(value, 0, Number.MAX_SAFE_INTEGER)

// 앞뒤 빈칸을 빼고, 비면 null. 없음(undefined)도 null. 글자가 아니면 그대로(검사가 잡는다)
function textOrNull(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value !== 'string') return value
  const text = value.trim()
  return text === '' ? null : text
}

// 전화는 '010-1234-5678'처럼 적어도 숫자만 남긴다
function phoneOrNull(value: unknown): unknown {
  const text = textOrNull(value)
  return typeof text === 'string' ? text.replace(/[\s.()-]/g, '') || null : text
}

function requireId(value: unknown, code: StaffErrorCode): string {
  if (!isFilled(value)) throw new StaffStoreError(code)
  return value
}

function requirePeriod(range: DateRange): [string, string] {
  const from = range?.from
  const to = range?.to
  if (!isDay(from) || !isDay(to) || from > to) throw new StaffStoreError(READ)
  return [from, to]
}

function requireMonths(from: unknown, to: unknown): [string, string] {
  if (!isMonthText(from) || !isMonthText(to) || from > to) throw new StaffStoreError(READ)
  return [from, to]
}

// ── 근무 칸 ─────────────────────────────────────────────────

/** 하루 근무: 0 ≤ 시작 < 끝 ≤ 1440, 10분 단위, 점심은 둘 다 있거나 없고 근무 안. 쉼은 null, 틀리면 undefined. 네 칸만 새 객체로 */
function cleanShift(value: unknown): DayShift | undefined {
  if (value === null) return null
  if (!isRecord(value)) return undefined
  const { start, end, lunchFrom, lunchTo } = value
  if (!isMinute(start) || !isMinute(end) || start >= end) return undefined
  if (lunchFrom === null && lunchTo === null) return { start, end, lunchFrom: null, lunchTo: null }
  if (!isMinute(lunchFrom) || !isMinute(lunchTo) || !(start <= lunchFrom && lunchFrom < lunchTo && lunchTo <= end)) return undefined
  return { start, end, lunchFrom, lunchTo }
}

/** 요일 일곱 칸(월~일). 하나라도 틀리면 null */
function cleanWeek(value: unknown): DayShift[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null
  const week = value.map(cleanShift)
  return week.every((shift) => shift !== undefined) ? (week as DayShift[]) : null
}

// ── 직원 (staff_members) ────────────────────────────────────

type MemberFields = Omit<StaffMember, 'id'>
const MEMBER_FIELDS = [
  'name',
  'job',
  'jobOther',
  'employment',
  'weeklyHours',
  'hiredOn',
  'leftOn',
  'phone',
  'birthday',
  'address',
  'bank',
  'accountNo',
  'calendarStaffId',
  'memo',
  'usedBefore',
  'usedBeforeFrom',
] as const satisfies readonly (keyof MemberFields)[]
const MEMBER_DB: Record<keyof MemberFields, string> = {
  name: 'name',
  job: 'job',
  jobOther: 'job_other',
  employment: 'employment',
  weeklyHours: 'weekly_hours',
  hiredOn: 'hired_on',
  leftOn: 'left_on',
  phone: 'phone',
  birthday: 'birthday',
  address: 'address',
  bank: 'bank',
  accountNo: 'account_no',
  calendarStaffId: 'calendar_staff_id',
  memo: 'memo',
  usedBefore: 'used_before',
  usedBeforeFrom: 'used_before_from',
}
const MEMBER_COLUMNS = ['id', ...MEMBER_FIELDS.map((key) => MEMBER_DB[key])].join(',')
const NEW_ROW_COLUMNS = 'id,name,hired_on'

/** 엑셀로 넣는 새 사람의 빈 칸 값(근무 형태 정규직·주 40시간, AC-7608.3) */
const NEW_MEMBER: Omit<MemberFields, 'name' | 'job' | 'hiredOn'> = {
  jobOther: null,
  employment: 'regular',
  weeklyHours: 40,
  leftOn: null,
  phone: null,
  birthday: null,
  address: null,
  bank: null,
  accountNo: null,
  calendarStaffId: null,
  memo: null,
  usedBefore: 0,
  usedBeforeFrom: null,
}

/** 칸 규칙(AC-7601.4)을 다 지나면 그 열여섯 칸, 아니면 null. 값은 고치지 않는다(읽은 줄도 이것으로 본다) */
function checkMember(value: Row): MemberFields | null {
  const { name, job, jobOther, employment, weeklyHours, hiredOn, leftOn, phone, birthday, address, bank, accountNo, calendarStaffId, memo, usedBefore, usedBeforeFrom } =
    value
  if (!isText(name, 1, NAME_MAX) || name.trim() !== name) return null
  if (!isOneOf(STAFF_JOBS, job)) return null
  if (job === '기타' ? !isText(jobOther, 1, JOB_OTHER_MAX) : jobOther !== null) return null
  if (!isOneOf(EMPLOYMENTS, employment) || !isHalfStep(weeklyHours, 0, 80) || !isDay(hiredOn)) return null
  if (!(leftOn === null || (isDay(leftOn) && leftOn >= hiredOn))) return null
  if (!(phone === null || (typeof phone === 'string' && PHONE.test(phone)))) return null
  if (!(birthday === null || isDay(birthday))) return null
  if (!(address === null || isText(address, 1, ADDRESS_MAX))) return null
  if (!(bank === null || isText(bank, 1, BANK_MAX))) return null
  if (!(accountNo === null || (typeof accountNo === 'string' && ACCOUNT.test(accountNo)))) return null
  if (!(calendarStaffId === null || isText(calendarStaffId, 1, CAL_ID_MAX))) return null
  if (!(memo === null || isText(memo, 1, MEMBER_MEMO_MAX))) return null
  if (!isHalfStep(usedBefore, 0, 50) || !(usedBeforeFrom === null || isDay(usedBeforeFrom))) return null
  return {
    name,
    job,
    jobOther: jobOther as string | null,
    employment,
    weeklyHours,
    hiredOn,
    leftOn: leftOn as string | null,
    phone: phone as string | null,
    birthday: birthday as string | null,
    address: address as string | null,
    bank: bank as string | null,
    accountNo: accountNo as string | null,
    calendarStaffId: calendarStaffId as string | null,
    memo: memo as string | null,
    usedBefore,
    usedBeforeFrom: usedBeforeFrom as string | null,
  }
}

/** 화면이 준 값을 보낼 모양으로: 정해 둔 칸만 골라 글은 앞뒤 빈칸을 빼고(비면 null), 전화는 숫자만 */
function normalizeMember(value: unknown): Row {
  const input: Row = isRecord(value) ? value : {}
  const nullable = (key: string) => (input[key] === undefined ? null : input[key])
  return {
    name: textOrNull(input.name),
    job: input.job,
    jobOther: textOrNull(input.jobOther),
    employment: input.employment,
    weeklyHours: input.weeklyHours,
    hiredOn: input.hiredOn,
    leftOn: nullable('leftOn'),
    phone: phoneOrNull(input.phone),
    birthday: nullable('birthday'),
    address: textOrNull(input.address),
    bank: textOrNull(input.bank),
    accountNo: textOrNull(input.accountNo),
    calendarStaffId: textOrNull(input.calendarStaffId),
    memo: textOrNull(input.memo),
    usedBefore: input.usedBefore,
    usedBeforeFrom: nullable('usedBeforeFrom'),
  }
}

const memberBody = (fields: MemberFields): Row => Object.fromEntries(MEMBER_FIELDS.map((key) => [MEMBER_DB[key], fields[key]]))

function toMember(row: unknown): StaffMember | null {
  if (!isRecord(row) || !isFilled(row.id)) return null
  const fields = checkMember(Object.fromEntries(MEMBER_FIELDS.map((key) => [key, row[MEMBER_DB[key]]])))
  return fields === null ? null : { id: row.id, ...fields }
}

// ── 휴가·설정·급여 칸 ───────────────────────────────────────

/** 휴가 한 줄(AC-7601.5): 반차만 오전·오후, 병가만 유급·무급을 고르고 무급(결근)은 늘 무급·나머지는 늘 유급, 메모 50자. 일곱 칸 중 묶음 id 뺀 여섯 */
function checkLeave(value: unknown): Row | null {
  if (!isRecord(value)) return null
  const { staffId, day, kind, part, paid } = value
  const memo = textOrNull(value.memo)
  if (!isFilled(staffId) || !isDay(day) || !isOneOf(LEAVE_KINDS, kind)) return null
  if (kind === 'half' ? !(part === 'am' || part === 'pm') : part !== null) return null
  if (kind === 'sick' ? typeof paid !== 'boolean' : paid !== (kind !== 'unpaid')) return null
  if (!(memo === null || isText(memo, 1, DAY_MEMO_MAX))) return null
  return { staff_id: staffId, day, kind, part, paid, memo }
}

function toLeave(row: unknown): Leave | null {
  if (!isRecord(row) || !isFilled(row.id) || !isFilled(row.group_id)) return null
  const leave = checkLeave({ staffId: row.staff_id, day: row.day, kind: row.kind, part: row.part, paid: row.paid, memo: row.memo })
  if (leave === null || leave.memo !== row.memo) return null
  return {
    id: row.id,
    groupId: row.group_id,
    staffId: leave.staff_id as string,
    day: leave.day as string,
    kind: leave.kind as Leave['kind'],
    part: leave.part as Leave['part'],
    paid: leave.paid as boolean,
    memo: leave.memo as string | null,
  }
}

/** 급여 항목 목록(30개까지, id 겹침 없음, 이름 1~20자). 다섯 칸만 새 객체로, 틀리면 null */
function cleanPayItems(value: unknown): PayItem[] | null {
  if (!Array.isArray(value) || value.length > PAY_ITEMS_MAX) return null
  const ids = new Set<string>()
  const items: PayItem[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const { id, kind, base, removedFrom } = item
    const name = textOrNull(item.name)
    if (!isText(id, 1, ITEM_ID_MAX) || ids.has(id)) return null
    if (!isText(name, 1, ITEM_NAME_MAX) || !(kind === 'amount' || kind === 'incentive') || typeof base !== 'boolean') return null
    if (!(removedFrom === null || isMonthText(removedFrom))) return null
    ids.add(id)
    items.push({ id, name, kind, base, removedFrom })
  }
  return items
}

/** 설정 줄이 없을 때의 값(입사일 기준·수당 정산·기본 급여 항목 다섯, AC-7601.6). 부를 때마다 새로 만든다 */
export function defaultStaffSettings(): StaffSettings {
  return { leaveBasis: 'hire', leftover: 'pay', payItems: DEFAULT_PAY_ITEMS.map((item) => ({ ...item })) }
}

const isLeaveBasis = (value: unknown): value is LeaveBasis => value === 'hire' || value === 'jan1'
const isLeftover = (value: unknown): value is Leftover => value === 'pay' || value === 'carry'

type RuleFields = { name: string; method: IncentiveMethod; unitAmount: number | null; percent: number | null }

/** 규칙 값(AC-7601.6): 건당·고정은 금액 0 이상(%는 없음), %는 0~100 소수 둘째 자리(금액 없음), 이름 1~20자 */
function checkRuleFields(value: unknown): RuleFields | null {
  if (!isRecord(value)) return null
  const name = textOrNull(value.name)
  const { method, unitAmount, percent } = value
  if (!isText(name, 1, ITEM_NAME_MAX) || !isOneOf(INCENTIVE_METHODS, method)) return null
  if (method === 'percent' ? !(unitAmount === null && isPercent(percent)) : !(isMoney(unitAmount) && percent === null)) return null
  return { name, method, unitAmount: unitAmount as number | null, percent: percent as number | null }
}

const ruleBody = (rule: RuleFields, sort: number): Row => ({ name: rule.name, method: rule.method, unit_amount: rule.unitAmount, percent: rule.percent, sort })

function toRule(row: unknown): IncentiveRule | null {
  if (!isRecord(row) || !isFilled(row.id) || !isFilled(row.staff_id) || !isWhole(row.sort, -2147483648, 2147483647)) return null
  const fields = checkRuleFields({ name: row.name, method: row.method, unitAmount: row.unit_amount, percent: row.percent })
  if (fields === null || fields.name !== row.name) return null
  return { id: row.id, staffId: row.staff_id, ...fields, sort: row.sort }
}

/** 급여 줄 안 인센티브 한 줄(건수·매출은 비거나 0 이상 정수). 일곱 칸만 새 객체로 */
function cleanEntry(value: unknown): IncentiveEntry | null {
  if (!isRecord(value)) return null
  const { ruleId, name, method, unitAmount, percent, count, sales } = value
  if (!(ruleId === null || isFilled(ruleId)) || !isText(name, 1, ITEM_NAME_MAX) || !isOneOf(INCENTIVE_METHODS, method)) return null
  if (!(unitAmount === null || isMoney(unitAmount)) || !(percent === null || isPercent(percent))) return null
  if (!(count === null || isMoney(count)) || !(sales === null || isMoney(sales))) return null
  return { ruleId, name, method, unitAmount, percent, count, sales }
}

function cleanEntries(value: unknown): IncentiveEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries = value.map(cleanEntry)
  return entries.every((entry) => entry !== null) ? (entries as IncentiveEntry[]) : null
}

/** 항목 금액(항목 id → 0 이상 원 단위 정수). 새 객체로 */
function cleanAmounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null
  const amounts: Record<string, number> = {}
  for (const [id, won] of Object.entries(value)) {
    if (!isText(id, 1, ITEM_ID_MAX) || !isMoney(won)) return null
    amounts[id] = won
  }
  return amounts
}

/** 급여 줄의 고칠 수 있는 다섯 칸(AC-7601.6). 틀리면 null */
function lineValues(value: unknown): Row | null {
  if (!isRecord(value)) return null
  const amounts = cleanAmounts(value.amounts)
  const incentives = cleanEntries(value.incentives)
  const { adjust, adjustReason } = value
  const adjustMemo = textOrNull(value.adjustMemo)
  if (amounts === null || incentives === null || !isWhole(adjust, -ADJUST_MAX, ADJUST_MAX)) return null
  if (!(adjustReason === null || isOneOf(ADJUST_REASONS, adjustReason)) || !(adjustMemo === null || isText(adjustMemo, 1, ADJUST_MEMO_MAX))) return null
  return { amounts, incentives, adjust, adjust_reason: adjustReason, adjust_memo: adjustMemo }
}

function toLine(row: unknown): PayLine | null {
  if (!isRecord(row) || !isFilled(row.id) || !isMonthText(row.month) || !(row.staff_id === null || isFilled(row.staff_id))) return null
  const values = lineValues({ amounts: row.amounts, incentives: row.incentives, adjust: row.adjust, adjustReason: row.adjust_reason, adjustMemo: row.adjust_memo })
  if (values === null || values.adjust_memo !== row.adjust_memo) return null
  return {
    id: row.id,
    month: row.month,
    staffId: row.staff_id,
    amounts: values.amounts as Record<string, number>,
    incentives: values.incentives as IncentiveEntry[],
    adjust: values.adjust as number,
    adjustReason: values.adjust_reason as PayLine['adjustReason'],
    adjustMemo: values.adjust_memo as string | null,
  }
}

/**
 * 규칙을 고친 뒤 한 달 줄의 인센티브(AC-7606.4, lib/staff/pay.ts applyRules와 같은 뜻): 지금 규칙 차례대로 이름·방식·값은 규칙 것,
 * 적은 건수·매출은 같은 규칙 id 줄에서 그대로 가져온다. 뺀 규칙 줄은 빠지고 새 규칙은 빈 실적이다
 */
function reapplyRules(entries: readonly IncentiveEntry[], rules: readonly IncentiveRule[]): IncentiveEntry[] {
  return rules.map((rule) => {
    const old = entries.find((entry) => entry.ruleId === rule.id)
    return { ruleId: rule.id, name: rule.name, method: rule.method, unitAmount: rule.unitAmount, percent: rule.percent, count: old?.count ?? null, sales: old?.sales ?? null }
  })
}

function toPayMonth(row: unknown): PayMonth | null {
  if (!isRecord(row) || !isMonthText(row.month)) return null
  const { employer_cost: cost, cost_saved_on: savedOn, copied_on: copiedOn } = row
  if (!(cost === null || isMoney(cost)) || !(savedOn === null || isDay(savedOn)) || !(copiedOn === null || isDay(copiedOn))) return null
  return { month: row.month, employerCost: cost, costSavedOn: savedOn, copiedOn }
}

function toPlan(row: unknown): WeekPlan | null {
  if (!isRecord(row) || !isFilled(row.id) || !isFilled(row.staff_id) || !isDay(row.from_day) || !isOneOf(SAT_ROTATIONS, row.sat_rotation)) return null
  const week = cleanWeek(row.week)
  return week === null ? null : { id: row.id, staffId: row.staff_id, from: row.from_day, week, sat: row.sat_rotation }
}

function toChange(row: unknown): DayChange | null {
  if (!isRecord(row) || !isFilled(row.staff_id) || !isDay(row.day) || !(row.memo === null || isText(row.memo, 1, DAY_MEMO_MAX))) return null
  const { start_min: start, end_min: end, lunch_from: lunchFrom, lunch_to: lunchTo } = row
  const shift = start === null && end === null && lunchFrom === null && lunchTo === null ? null : cleanShift({ start, end, lunchFrom, lunchTo })
  return shift === undefined ? null : { staffId: row.staff_id, day: row.day, shift, memo: row.memo }
}

function toOvertime(row: unknown): Overtime | null {
  if (!isRecord(row) || !isFilled(row.staff_id) || !isDay(row.day) || !isOneOf(OVERTIME_KINDS, row.kind) || !isStepped(row.minutes, 30, 1440, 30)) return null
  return { staffId: row.staff_id, day: row.day, kind: row.kind, minutes: row.minutes }
}

// ── 저장 층 ─────────────────────────────────────────────────

/** 휴가 한 줄 넣기 값(묶음 id는 저장 층이 정한다) */
export type LeaveDraft = Omit<Leave, 'id' | 'groupId'>
/** 규칙 저장 값. id가 지금 그 직원 규칙이면 고치고, 아니면(새 규칙의 임시 id·null) 새로 넣는다. 차례(sort)는 목록 차례로 다시 매긴다 */
export type RuleDraft = Omit<IncentiveRule, 'id' | 'staffId'> & { id?: string | null }
/** 엑셀 넣기 한 줄(lib/staff/rosterExcel.ts readRoster의 rows와 같은 칸). 'problem'은 건너뛴다. 고침은 id 또는 이름 + 입사일로 사람을 찾는다 */
export type RosterImportRow = {
  action: 'new' | 'update' | 'problem'
  member: Partial<StaffMember>
  plan: { week: readonly DayShift[]; sat: SatRotation } | null
}
/** 그날 그 시행자의 취소 아닌 예약 수 */
export type ApptCount = { day: string; count: number }

export type StaffStore = {
  /** 직원 모두(재직·퇴사), 입사일·이름 차례. 실패 E-STAFF-READ-FAILED */
  listMembers(): Promise<StaffMember[]>
  /** id가 없으면 새로 넣고, 있으면 그 줄을 고친다(열여섯 칸). DB가 준 줄을 돌려준다. 실패·규칙 어김 E-STAFF-SAVE-FAILED */
  saveMember(member: Omit<StaffMember, 'id'>, id?: string): Promise<StaffMember>
  /** 퇴사 3년 지난 사람(AC-7601.7)만: 서류 파일을 바구니에서 먼저 지우고(실패 E-STAFF-FILE-FAILED, 직원 줄 그대로) 직원 줄을 지운다(AC-7610.4) */
  purgeMember(member: StaffMember, today?: string): Promise<void>
  /** 엑셀 넣기(AC-7608.5): 새 줄 한 번(+ 입사일부터 기본 근무) → 고침 줄은 바뀐 칸만 10개씩(+ 오늘부터 기본 근무). 중간 실패는 된 것이 남는다 */
  importRoster(rows: readonly RosterImportRow[], today?: string): Promise<{ added: number; updated: number }>
  /** 기본 근무 모두, 직원·시작일 차례 */
  listPlans(): Promise<WeekPlan[]>
  /** 그 직원·시작일 판 하나를 저장(있으면 고침) */
  savePlan(staffId: string, from: string, week: readonly DayShift[], sat: SatRotation): Promise<WeekPlan>
  listChanges(range: DateRange): Promise<DayChange[]>
  /** 바뀐 날 하나(근무 또는 쉼 + 메모)를 저장 */
  saveChange(change: DayChange): Promise<DayChange>
  /** 그날을 기본 근무로 되돌린다: 바뀐 날·더 일한 시간을 지운다 */
  resetDay(staffId: string, day: string): Promise<void>
  listOvertime(range: DateRange): Promise<Overtime[]>
  /** 더 일한 시간 저장(30분 단위). 0분이면 그 줄을 지운다 */
  saveOvertime(overtime: Overtime): Promise<void>
  listLeaves(range: DateRange): Promise<Leave[]>
  /** 펼친 날마다 한 줄을 새 묶음 id 하나로 한 번에 넣는다(AC-7610.2) */
  addLeaveGroup(rows: readonly LeaveDraft[]): Promise<Leave[]>
  /** 묶음 고치기 = 지우고 같은 묶음 id로 다시 넣기 */
  replaceLeaveGroup(groupId: string, rows: readonly LeaveDraft[]): Promise<Leave[]>
  deleteLeaveGroup(groupId: string): Promise<void>
  /** 휴가 날들 그 시행자의 취소 아닌 예약 수(AC-7610.5). 예약 표에서 날짜 칸만 읽는다. 예약이 있는 날만, 날 차례 */
  countAppts(calendarStaffId: string, days: readonly string[]): Promise<ApptCount[]>
  /** 설정. 줄이 없으면 기본값, 틀린 칸만 기본값 */
  loadSettings(): Promise<StaffSettings>
  /** 설정 세 칸을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). 보낸 값을 돌려준다 */
  saveSettings(settings: StaffSettings): Promise<StaffSettings>
  /** 인센티브 규칙 모두, 직원·차례 */
  listRules(): Promise<IncentiveRule[]>
  /** 한 직원 규칙을 이 목록으로 바꾸고, fromMonth('YYYY-MM') 이후 이미 있는 그 직원 급여 줄의 인센티브만 새 규칙으로 고친다(AC-7606.4). 저장된 규칙을 돌려준다 */
  saveRules(staffId: string, rules: readonly RuleDraft[], fromMonth: string): Promise<IncentiveRule[]>
  listPayLines(fromMonth: string, toMonth: string): Promise<PayLine[]>
  /** 급여 줄 하나 저장(id가 있으면 그 줄, 없으면 그 달·직원 줄). 새 id가 든 줄을 돌려준다 */
  savePayLine(line: PayLine): Promise<PayLine>
  listPayMonths(fromMonth: string, toMonth: string): Promise<PayMonth[]>
  savePayMonth(month: PayMonth): Promise<PayMonth>
}

export function createStaffStore(client: StaffClient): StaffStore {
  const fail = (code: StaffErrorCode) => new StaffStoreError(code)

  const readMembers = async (code: StaffErrorCode) =>
    (
      await readAllOrFail(code, (first, last) =>
        client.from(MEMBERS).select(MEMBER_COLUMNS).order('hired_on', ASC).order('name', ASC).order('id', ASC).range(first, last),
      )
    ).flatMap((row) => toMember(row) ?? [])

  /** 열쇠 줄을 고치고, 없으면 열쇠와 함께 넣는다. 넣다가 겹치면(23505) 한 번 더 고친다. DB가 준 줄 */
  async function saveByKey(table: string, key: Row, values: Row, columns: string): Promise<unknown> {
    const update = async () => {
      const { data } = await requestOrFail(SAVE, () => {
        let query = client.from(table).update(values)
        for (const [column, value] of Object.entries(key)) query = query.eq(column, value as string)
        return query.select(columns)
      })
      if (!Array.isArray(data)) throw fail(SAVE)
      return data[0] as unknown
    }
    const found = await update()
    if (found !== undefined) return found
    let reply: Reply
    try {
      reply = await client.from(table).insert({ ...key, ...values }).select(columns).single()
    } catch {
      throw fail(SAVE)
    }
    if (!reply.error) return reply.data
    if (isDuplicate(reply.error)) {
      const again = await update()
      if (again !== undefined) return again
    }
    throw fail(SAVE)
  }

  async function savePlanRow(staffId: string, from: string, week: DayShift[], sat: SatRotation): Promise<WeekPlan> {
    const plan = toPlan(await saveByKey(PLANS, { staff_id: staffId, from_day: from }, { week, sat_rotation: sat }, PLAN_COLUMNS))
    if (plan === null) throw fail(SAVE)
    return plan
  }

  function cleanPlan(plan: RosterImportRow['plan']): { week: DayShift[]; sat: SatRotation } | null | undefined {
    if (plan === null) return null
    const week = cleanWeek(plan?.week)
    return week !== null && isOneOf(SAT_ROTATIONS, plan?.sat) ? { week, sat: plan.sat } : undefined
  }

  function cleanLeaves(rows: readonly LeaveDraft[]): Row[] {
    if (!Array.isArray(rows) || rows.length === 0) throw fail(SAVE)
    const clean = rows.map(checkLeave)
    if (clean.some((row) => row === null)) throw fail(SAVE)
    return clean as Row[]
  }

  async function insertLeaves(groupId: string, rows: Row[]): Promise<Leave[]> {
    const { data } = await requestOrFail(SAVE, () => client.from(LEAVES).insert(rows.map((row) => ({ group_id: groupId, ...row }))).select(LEAVE_COLUMNS))
    if (!Array.isArray(data)) throw fail(SAVE)
    return data.flatMap((row) => toLeave(row) ?? [])
  }

  const list = async <T>(page: (first: number, last: number) => PromiseLike<Reply>, convert: (row: unknown) => T | null): Promise<T[]> =>
    (await readAllOrFail(READ, page)).flatMap((row) => convert(row) ?? [])

  return {
    listMembers: () => readMembers(READ),

    async saveMember(member, id) {
      const fields = checkMember(normalizeMember(member))
      if (fields === null) throw fail(SAVE)
      const body = memberBody(fields)
      const { data } =
        id === undefined
          ? await requestOrFail(SAVE, () => client.from(MEMBERS).insert(body).select(MEMBER_COLUMNS).single())
          : await requestOrFail(SAVE, () => client.from(MEMBERS).update(body).eq('id', requireId(id, SAVE)).select(MEMBER_COLUMNS).single())
      const saved = toMember(data)
      if (saved === null) throw fail(SAVE)
      return saved
    },

    async purgeMember(member, today = todayInKorea()) {
      const id = requireId(member?.id, SAVE)
      let keepUntil: string
      try {
        keepUntil = isDay(member.leftOn) ? addMonthsToDay(member.leftOn, KEEP_MONTHS) : ''
      } catch {
        keepUntil = ''
      }
      if (keepUntil === '' || !isDay(today) || keepUntil >= today) throw fail(SAVE)
      const rows = await readAllOrFail(FILE, (first, last) =>
        client.from(FILES).select('path').eq('kind', 'doc').eq('staff_id', id).order('id', ASC).range(first, last),
      )
      const paths = rows.flatMap((row) => (isRecord(row) && isFilled(row.path) ? [row.path] : []))
      if (paths.length > 0) await requestOrFail(FILE, () => client.storage.from(STAFF_FILES_BUCKET).remove(paths))
      const { data } = await requestOrFail(SAVE, () => client.from(MEMBERS).delete().eq('id', id).select('id'))
      if (!Array.isArray(data) || data.length !== 1) throw fail(SAVE)
    },

    async importRoster(rows, today = todayInKorea()) {
      if (!Array.isArray(rows) || !isDay(today)) throw fail(SAVE)
      const defined = (member: unknown): Row =>
        Object.fromEntries(Object.entries(isRecord(member) ? member : {}).filter(([, value]) => value !== undefined))
      // 1) 보내기 전에 모두 본다: 한 줄이라도 틀리면 아무것도 보내지 않는다
      const fresh = rows
        .filter((row) => row.action === 'new')
        .map((row) => {
          const fields = checkMember(normalizeMember({ ...NEW_MEMBER, ...defined(row.member) }))
          const plan = cleanPlan(row.plan)
          if (fields === null || plan === undefined) throw fail(SAVE)
          return { fields, plan }
        })
      const changes = rows.filter((row) => row.action === 'update')
      const existing = changes.length > 0 ? await readMembers(SAVE) : []
      const updates = changes.map((row) => {
        const input = defined(row.member)
        const name = typeof input.name === 'string' ? input.name.trim() : null
        const target = isFilled(input.id)
          ? existing.find((member) => member.id === input.id)
          : existing.find((member) => member.name === name && member.hiredOn === input.hiredOn)
        if (target === undefined) throw fail(SAVE)
        // '올해 이미 쓴 연차'는 새 직원 줄에만 넣는다(AC-7608.4)
        const fields = checkMember(normalizeMember({ ...target, ...input, usedBefore: target.usedBefore, usedBeforeFrom: target.usedBeforeFrom }))
        const plan = cleanPlan(row.plan)
        if (fields === null || plan === undefined) throw fail(SAVE)
        const body: Row = {}
        for (const key of MEMBER_FIELDS) if (fields[key] !== target[key]) body[MEMBER_DB[key]] = fields[key]
        return { id: target.id, body, plan }
      })
      // 2) 새 줄 한 번 + 그 사람들 기본 근무(입사일부터) 한 번
      if (fresh.length > 0) {
        const { data } = await requestOrFail(SAVE, () => client.from(MEMBERS).insert(fresh.map((row) => memberBody(row.fields))).select(NEW_ROW_COLUMNS))
        if (!Array.isArray(data)) throw fail(SAVE)
        const idOf = new Map<string, string>()
        for (const row of data) if (isRecord(row) && isFilled(row.id)) idOf.set(`${String(row.name)}|${String(row.hired_on)}`, row.id)
        const planRows = fresh.flatMap(({ fields, plan }) => {
          if (plan === null) return []
          const staffId = idOf.get(`${fields.name}|${fields.hiredOn}`)
          if (staffId === undefined) throw fail(SAVE)
          return [{ staff_id: staffId, from_day: fields.hiredOn, week: plan.week, sat_rotation: plan.sat }]
        })
        if (planRows.length > 0) await requestOrFail(SAVE, () => client.from(PLANS).insert(planRows))
      }
      // 3) 고침 줄은 바뀐 칸만 10개씩, 그다음 오늘부터의 기본 근무 10개씩
      await inBatches(
        updates.filter((row) => Object.keys(row.body).length > 0),
        (row) => requestOrFail(SAVE, () => client.from(MEMBERS).update(row.body).eq('id', row.id)),
      )
      await inBatches(
        updates.filter((row) => row.plan !== null),
        (row) => savePlanRow(row.id, today, row.plan!.week, row.plan!.sat),
      )
      return { added: fresh.length, updated: updates.length }
    },

    listPlans: () => list((first, last) => client.from(PLANS).select(PLAN_COLUMNS).order('staff_id', ASC).order('from_day', ASC).range(first, last), toPlan),

    async savePlan(staffId, from, week, sat) {
      const clean = cleanWeek(week)
      if (!isFilled(staffId) || !isDay(from) || clean === null || !isOneOf(SAT_ROTATIONS, sat)) throw fail(SAVE)
      return savePlanRow(staffId, from, clean, sat)
    },

    async listChanges(range) {
      const [from, to] = requirePeriod(range)
      return list(
        (first, last) => client.from(CHANGES).select(CHANGE_COLUMNS).gte('day', from).lte('day', to).order('day', ASC).order('staff_id', ASC).range(first, last),
        toChange,
      )
    },

    async saveChange(change) {
      const shift = change?.shift === null ? null : cleanShift(change?.shift)
      const memo = textOrNull(change?.memo)
      if (!isFilled(change?.staffId) || !isDay(change.day) || shift === undefined || !(memo === null || isText(memo, 1, DAY_MEMO_MAX))) throw fail(SAVE)
      const values = { start_min: shift?.start ?? null, end_min: shift?.end ?? null, lunch_from: shift?.lunchFrom ?? null, lunch_to: shift?.lunchTo ?? null, memo }
      const saved = toChange(await saveByKey(CHANGES, { staff_id: change.staffId, day: change.day }, values, CHANGE_COLUMNS))
      if (saved === null) throw fail(SAVE)
      return saved
    },

    async resetDay(staffId, day) {
      if (!isFilled(staffId) || !isDay(day)) throw fail(SAVE)
      await requestOrFail(SAVE, () => client.from(CHANGES).delete().eq('staff_id', staffId).eq('day', day))
      await requestOrFail(SAVE, () => client.from(OVERTIME).delete().eq('staff_id', staffId).eq('day', day))
    },

    async listOvertime(range) {
      const [from, to] = requirePeriod(range)
      return list(
        (first, last) =>
          client.from(OVERTIME).select(OVERTIME_COLUMNS).gte('day', from).lte('day', to).order('day', ASC).order('staff_id', ASC).order('kind', ASC).range(first, last),
        toOvertime,
      )
    },

    async saveOvertime(overtime) {
      const { staffId, day, kind, minutes } = overtime ?? ({} as Partial<Overtime>)
      if (!isFilled(staffId) || !isDay(day) || !isOneOf(OVERTIME_KINDS, kind)) throw fail(SAVE)
      if (minutes === 0) {
        await requestOrFail(SAVE, () => client.from(OVERTIME).delete().eq('staff_id', staffId).eq('day', day).eq('kind', kind))
        return
      }
      if (!isStepped(minutes, 30, 1440, 30)) throw fail(SAVE)
      await saveByKey(OVERTIME, { staff_id: staffId, day, kind }, { minutes }, OVERTIME_COLUMNS)
    },

    async listLeaves(range) {
      const [from, to] = requirePeriod(range)
      return list(
        (first, last) => client.from(LEAVES).select(LEAVE_COLUMNS).gte('day', from).lte('day', to).order('day', ASC).order('staff_id', ASC).range(first, last),
        toLeave,
      )
    },

    async addLeaveGroup(rows) {
      return insertLeaves(crypto.randomUUID(), cleanLeaves(rows))
    },

    async replaceLeaveGroup(groupId, rows) {
      const group = requireId(groupId, SAVE)
      const clean = cleanLeaves(rows)
      await requestOrFail(SAVE, () => client.from(LEAVES).delete().eq('group_id', group))
      return insertLeaves(group, clean)
    },

    async deleteLeaveGroup(groupId) {
      const group = requireId(groupId, SAVE)
      await requestOrFail(SAVE, () => client.from(LEAVES).delete().eq('group_id', group))
    },

    async countAppts(calendarStaffId, days) {
      const wanted = [...new Set(Array.isArray(days) ? days.filter(isDay) : [])].sort()
      if (!isFilled(calendarStaffId) || wanted.length === 0) return []
      const rows = await readAllOrFail(READ, (first, last) =>
        client
          .from(APPTS)
          .select('day')
          .eq('staff_id', calendarStaffId)
          .gte('day', wanted[0])
          .lte('day', wanted[wanted.length - 1])
          .neq('status', 'cancel')
          .order('day', ASC)
          .order('id', ASC)
          .range(first, last),
      )
      const counts = new Map<string, number>(wanted.map((day) => [day, 0]))
      for (const row of rows) {
        const day = isRecord(row) ? row.day : undefined
        if (typeof day === 'string' && counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1)
      }
      return wanted.flatMap((day) => {
        const count = counts.get(day) ?? 0
        return count > 0 ? [{ day, count }] : []
      })
    },

    async loadSettings() {
      const { data } = await requestOrFail(READ, () => client.from(SETTINGS).select(SETTINGS_COLUMNS).maybeSingle())
      const row: Row = isRecord(data) ? data : {}
      const fallback = defaultStaffSettings()
      return {
        leaveBasis: isLeaveBasis(row.leave_basis) ? row.leave_basis : fallback.leaveBasis,
        leftover: isLeftover(row.leftover) ? row.leftover : fallback.leftover,
        payItems: cleanPayItems(row.pay_items) ?? fallback.payItems,
      }
    },

    async saveSettings(settings) {
      const payItems = cleanPayItems(settings?.payItems)
      if (!isLeaveBasis(settings?.leaveBasis) || !isLeftover(settings.leftover) || payItems === null) throw fail(SAVE)
      const clean: StaffSettings = { leaveBasis: settings.leaveBasis, leftover: settings.leftover, payItems }
      await requestOrFail(SAVE, () =>
        client.from(SETTINGS).upsert({ leave_basis: clean.leaveBasis, leftover: clean.leftover, pay_items: clean.payItems }, { onConflict: 'hospital_id' }),
      )
      return clean
    },

    listRules: () =>
      list((first, last) => client.from(RULES).select(RULE_COLUMNS).order('staff_id', ASC).order('sort', ASC).order('id', ASC).range(first, last), toRule),

    async saveRules(staffId, rules, fromMonth) {
      if (!isFilled(staffId) || !isMonthText(fromMonth) || !Array.isArray(rules)) throw fail(SAVE)
      const clean = rules.map((rule, sort) => {
        const fields = checkRuleFields(rule)
        if (fields === null) throw fail(SAVE)
        return { id: isFilled(rule.id) ? rule.id : null, fields, sort }
      })
      const { data } = await requestOrFail(SAVE, () => client.from(RULES).select('id').eq('staff_id', staffId))
      if (!Array.isArray(data)) throw fail(SAVE)
      const have = new Set(data.flatMap((row) => (isRecord(row) && isFilled(row.id) ? [row.id] : [])))
      const kept = clean.filter((rule) => rule.id !== null && have.has(rule.id))
      const added = clean.filter((rule) => !(rule.id !== null && have.has(rule.id)))
      const dropped = [...have].filter((id) => !kept.some((rule) => rule.id === id))
      if (dropped.length > 0) await requestOrFail(SAVE, () => client.from(RULES).delete().eq('staff_id', staffId).in('id', dropped))
      await inBatches(kept, (rule) => requestOrFail(SAVE, () => client.from(RULES).update(ruleBody(rule.fields, rule.sort)).eq('id', rule.id as string)))
      if (added.length > 0) {
        await requestOrFail(SAVE, () => client.from(RULES).insert(added.map((rule) => ({ staff_id: staffId, ...ruleBody(rule.fields, rule.sort) }))))
      }
      const saved = (
        await readAllOrFail(SAVE, (first, last) =>
          client.from(RULES).select(RULE_COLUMNS).eq('staff_id', staffId).order('sort', ASC).order('id', ASC).range(first, last),
        )
      ).flatMap((row) => toRule(row) ?? [])
      // 보는 달부터만 고친다(앞 달 금액이 바뀌지 않게, ADR-035)
      const lines = (
        await readAllOrFail(SAVE, (first, last) =>
          client.from(LINES).select(LINE_COLUMNS).eq('staff_id', staffId).gte('month', fromMonth).order('month', ASC).order('id', ASC).range(first, last),
        )
      )
        .flatMap((row) => toLine(row) ?? [])
        .filter((line) => line.month >= fromMonth)
      const changed = lines.flatMap((line) => {
        const incentives = reapplyRules(line.incentives, saved)
        return JSON.stringify(incentives) === JSON.stringify(line.incentives) ? [] : [{ id: line.id as string, incentives }]
      })
      await inBatches(changed, (line) => requestOrFail(SAVE, () => client.from(LINES).update({ incentives: line.incentives }).eq('id', line.id)))
      return saved
    },

    async listPayLines(fromMonth, toMonth) {
      const [from, to] = requireMonths(fromMonth, toMonth)
      return list(
        (first, last) => client.from(LINES).select(LINE_COLUMNS).gte('month', from).lte('month', to).order('month', ASC).order('id', ASC).range(first, last),
        toLine,
      )
    },

    async savePayLine(line) {
      const values = lineValues(line)
      if (values === null || !isMonthText(line.month)) throw fail(SAVE)
      let data: unknown
      if (line.id !== null && line.id !== undefined) {
        const id = requireId(line.id, SAVE)
        ;({ data } = await requestOrFail(SAVE, () => client.from(LINES).update(values).eq('id', id).select(LINE_COLUMNS).single()))
      } else {
        if (!isFilled(line.staffId)) throw fail(SAVE)
        data = await saveByKey(LINES, { month: line.month, staff_id: line.staffId }, values, LINE_COLUMNS)
      }
      const saved = toLine(data)
      if (saved === null) throw fail(SAVE)
      return saved
    },

    async listPayMonths(fromMonth, toMonth) {
      const [from, to] = requireMonths(fromMonth, toMonth)
      return list((first, last) => client.from(MONTHS).select(MONTH_COLUMNS).gte('month', from).lte('month', to).order('month', ASC).range(first, last), toPayMonth)
    },

    async savePayMonth(month) {
      const checked = toPayMonth({ month: month?.month, employer_cost: month?.employerCost, cost_saved_on: month?.costSavedOn, copied_on: month?.copiedOn })
      if (checked === null) throw fail(SAVE)
      const values = { employer_cost: checked.employerCost, cost_saved_on: checked.costSavedOn, copied_on: checked.copiedOn }
      const saved = toPayMonth(await saveByKey(MONTHS, { month: checked.month }, values, MONTH_COLUMNS))
      if (saved === null) throw fail(SAVE)
      return saved
    },
  }
}
