import { render } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { applyRules, type RevenueDay } from '@/lib/staff/pay'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { StaffStoreError, type StaffStore } from '@/lib/storage/staff'
import type { StaffFileStore } from '@/lib/storage/staffFiles'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import type { StaffBase } from '@/components/staff/useStaffBase'
import type { DateRange } from '@/types/dates'
import {
  DEFAULT_PAY_ITEMS,
  type IncentiveRule,
  type Leave,
  type Overtime,
  type PayLine,
  type PayMonth,
  type StaffErrorCode,
  type StaffFile,
  type StaffMember,
  type StaffSettings,
} from '@/types/staff'
import { PayView } from './PayView'

// 급여 화면 시험 전용 도구(앱 코드는 불러오지 않는다): 지어낸 보기 자료(시안 pay.html · 2026년 11월)와 메모리 안 가짜 저장 층.
// 오늘 2026-11-21(토), 입사일 기준 · 못 쓴 연차는 수당으로 정산. 사람·금액은 요구사항 AC-7606.2·AC-7606.5와 같다

export const TODAY = '2026-11-21'
export const HOSPITAL = '○○정형외과'

const person = (over: Partial<StaffMember> & Pick<StaffMember, 'id' | 'name' | 'job' | 'hiredOn'>): StaffMember => ({
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
  ...over,
})

// 명단 차례(입사일 빠른 사람부터) — useStaffBase가 주는 차례 그대로. 오세린은 퇴사자
export const MEMBERS: StaffMember[] = [
  person({ id: 'choi', name: '최민준', job: '방사선사', hiredOn: '2019-11-25' }),
  person({ id: 'oh', name: '오세린', job: '간호사', hiredOn: '2020-03-02', leftOn: '2024-05-31' }),
  person({ id: 'kim', name: '김하늘', job: '간호조무사', hiredOn: '2021-03-02' }),
  person({ id: 'lee', name: '이도윤', job: '물리치료사', hiredOn: '2023-07-17' }),
  person({ id: 'jung', name: '정유나', job: '원무', employment: 'part', weeklyHours: 24, hiredOn: '2024-09-02' }),
  person({ id: 'park', name: '박서연', job: '물리치료사', hiredOn: '2025-01-06' }),
  person({ id: 'han', name: '한지우', job: '원무', employment: 'contract', hiredOn: '2026-02-02', bank: '○○은행', accountNo: '000-0000-0000' }),
]

export const SETTINGS: StaffSettings = {
  leaveBasis: 'hire',
  leftover: 'pay',
  payItems: [...DEFAULT_PAY_ITEMS.map((item) => ({ ...item })), { id: 'pos', name: '직책수당', kind: 'amount', base: false, removedFrom: null }],
}

export const RULES: IncentiveRule[] = [
  { id: 'r-kim', staffId: 'kim', name: '고정 수당', method: 'fixed', unitAmount: 100_000, percent: null, sort: 0 },
  { id: 'r-lee-1', staffId: 'lee', name: '도수치료 급여', method: 'per_case', unitAmount: 5_000, percent: null, sort: 0 },
  { id: 'r-lee-2', staffId: 'lee', name: '도수치료 비급여', method: 'percent', unitAmount: null, percent: 10, sort: 1 },
  { id: 'r-park', staffId: 'park', name: '도수치료 비급여', method: 'percent', unitAmount: null, percent: 10, sort: 0 },
]

type Actual = { count?: number; sales?: number }

function payLine(id: string, month: string, staffId: string, amounts: Record<string, number>, actuals: Record<string, Actual> = {}): PayLine {
  const rules = RULES.filter((rule) => rule.staffId === staffId)
  const incentives = applyRules([], rules).map((entry) => {
    const actual = actuals[entry.ruleId ?? ''] ?? {}
    return { ...entry, count: actual.count ?? null, sales: actual.sales ?? null }
  })
  return { id, month, staffId, amounts, incentives, adjust: 0, adjustReason: null, adjustMemo: null }
}

// 11월: 김하늘 3,200,000 · 이도윤 4,000,000 · 박서연 3,385,000 · 최민준 3,810,000 · 정유나 1,570,000 · 한지우 2,650,000 = 18,615,000
// 10월: 같음 · −40,000 · +95,000 · +90,000 · 같음 · 같음 → 18,470,000
export const LINES: PayLine[] = [
  payLine('o-kim', '2026-10', 'kim', { base: 2_900_000, meal: 200_000 }),
  payLine('o-lee', '2026-10', 'lee', { base: 3_100_000, overtime: 160_000, meal: 200_000 }, { 'r-lee-1': { count: 30 }, 'r-lee-2': { sales: 4_300_000 } }),
  payLine('o-park', '2026-10', 'park', { base: 2_800_000, overtime: 60_000, meal: 200_000 }, { 'r-park': { sales: 2_300_000 } }),
  payLine('o-choi', '2026-10', 'choi', { base: 3_300_000, overtime: 70_000, meal: 200_000, pos: 150_000 }),
  payLine('o-jung', '2026-10', 'jung', { base: 1_450_000, meal: 120_000 }),
  payLine('o-han', '2026-10', 'han', { base: 2_450_000, meal: 200_000 }),
  payLine('n-kim', '2026-11', 'kim', { base: 2_900_000, meal: 200_000 }),
  payLine('n-lee', '2026-11', 'lee', { base: 3_100_000, overtime: 120_000, meal: 200_000 }, { 'r-lee-1': { count: 32 }, 'r-lee-2': { sales: 4_200_000 } }),
  payLine('n-park', '2026-11', 'park', { base: 2_800_000, overtime: 70_000, meal: 200_000 }, { 'r-park': { sales: 3_150_000 } }),
  payLine('n-choi', '2026-11', 'choi', { base: 3_300_000, overtime: 160_000, meal: 200_000, pos: 150_000 }),
  payLine('n-jung', '2026-11', 'jung', { base: 1_450_000, meal: 120_000 }),
  payLine('n-han', '2026-11', 'han', { base: 2_450_000, meal: 200_000 }),
]

export const PAY_MONTHS: PayMonth[] = [
  { month: '2026-10', employerCost: 2_130_000, costSavedOn: '2026-10-20', copiedOn: '2026-10-02' },
  { month: '2026-11', employerCost: 2_150_000, costSavedOn: '2026-11-20', copiedOn: '2026-11-02' },
]

export const OVERTIME: Overtime[] = [
  { staffId: 'kim', day: '2026-11-10', kind: 'night', minutes: 60 },
  { staffId: 'lee', day: '2026-11-11', kind: 'extended', minutes: 120 },
  { staffId: 'park', day: '2026-11-12', kind: 'extended', minutes: 60 },
  { staffId: 'choi', day: '2026-11-15', kind: 'holiday', minutes: 240 },
  { staffId: 'lee', day: '2026-11-18', kind: 'extended', minutes: 120 },
  { staffId: 'park', day: '2026-11-20', kind: 'extended', minutes: 90 },
]

const leave = (id: string, staffId: string, day: string, kind: Leave['kind'], part: Leave['part'] = null): Leave => ({
  id,
  groupId: `g-${id}`,
  staffId,
  day,
  kind,
  part,
  paid: true,
  memo: null,
})

// 이도윤은 이번 기간(2026-07-17~) 연차 6일을 쓰고 11-28 연차를 더 넣었다 → 생김 16 · 쓴 7 · 남은 9 (AC-7604.8)
export const LEAVES: Leave[] = [
  leave('l1', 'lee', '2026-08-03', 'annual'),
  leave('l2', 'lee', '2026-08-04', 'annual'),
  leave('l3', 'lee', '2026-08-05', 'annual'),
  leave('l4', 'lee', '2026-09-10', 'annual'),
  leave('l5', 'lee', '2026-10-14', 'annual'),
  leave('l6', 'lee', '2026-10-15', 'annual'),
  leave('l7', 'kim', '2026-11-07', 'annual'),
  leave('l8', 'park', '2026-11-13', 'half', 'pm'),
  leave('l9', 'jung', '2026-11-18', 'sick'),
  leave('l10', 'lee', '2026-11-28', 'annual'),
]

// 매출: 8월은 자료 없음. 11월 118,400,000 → 인건비 20,765,000 ÷ 매출 = 17.5%
export const REVENUE: RevenueDay[] = [
  { date: '2026-06-10', total: 112_300_000 },
  { date: '2026-07-10', total: 120_500_000 },
  { date: '2026-09-10', total: 115_800_000 },
  { date: '2026-10-10', total: 121_900_000 },
  { date: '2026-11-10', total: 118_400_000 },
]

const taxFile = (id: string, month: string, name: string, size: number, createdAt: string): StaffFile => ({
  id,
  kind: 'tax',
  staffId: null,
  month,
  name,
  path: `h/tax/${month}/${id}.${name.split('.').pop() ?? ''}`,
  size,
  mime: 'application/pdf',
  createdAt,
})

export const TAX_FILES: StaffFile[] = [
  taxFile('f1', '2026-08', '급여대장_8월.pdf', 201_000, '2026-08-21T01:00:00Z'),
  taxFile('f2', '2026-09', '급여대장_9월.pdf', 205_000, '2026-09-22T01:00:00Z'),
  taxFile('f3', '2026-09', '명세서_9월.zip', 1_200_000, '2026-09-22T01:10:00Z'),
  taxFile('f4', '2026-10', '급여대장_10월.pdf', 208_000, '2026-10-21T01:00:00Z'),
  taxFile('f5', '2026-10', '명세서_10월.zip', 1_200_000, '2026-10-21T01:10:00Z'),
  taxFile('f6', '2026-10', '4대보험_고지_10월.pdf', 96_000, '2026-10-24T01:00:00Z'),
  taxFile('f7', '2026-11', '급여대장_11월.pdf', 214_000, '2026-11-20T01:00:00Z'),
  taxFile('f8', '2026-11', '명세서_11월.zip', 1_300_000, '2026-11-20T01:10:00Z'),
]

export type PayDb = {
  members: StaffMember[]
  settings: StaffSettings
  rules: IncentiveRule[]
  lines: PayLine[]
  months: PayMonth[]
  overtime: Overtime[]
  leaves: Leave[]
  revenue: RevenueDay[]
  files: StaffFile[]
  /** 이 이름의 저장 층 함수(와 loadRevenue)는 던진다 */
  failing: Set<string>
}

const clone = <T,>(value: T): T => structuredClone(value)

export function payDb(over: Partial<PayDb> = {}): PayDb {
  return {
    members: clone(MEMBERS),
    settings: clone(SETTINGS),
    rules: clone(RULES),
    lines: clone(LINES),
    months: clone(PAY_MONTHS),
    overtime: clone(OVERTIME),
    leaves: clone(LEAVES),
    revenue: clone(REVENUE),
    files: clone(TAX_FILES),
    failing: new Set(),
    ...over,
  }
}

export type Call = { name: string; args: unknown[] }

const READ: StaffErrorCode = 'E-STAFF-READ-FAILED'
const SAVE: StaffErrorCode = 'E-STAFF-SAVE-FAILED'
const FILE: StaffErrorCode = 'E-STAFF-FILE-FAILED'

const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to

// 부른 값을 적고(파일은 그대로), 실패로 정한 함수면 번호로 던진다
function stepper(db: PayDb, calls: Call[]) {
  return <R,>(name: string, code: StaffErrorCode, args: unknown[], run: () => R): Promise<R> => {
    calls.push({ name, args: args.map((arg) => (typeof arg === 'object' && arg !== null && 'file' in arg ? arg : clone(arg))) })
    if (db.failing.has(name)) return Promise.reject(new StaffStoreError(code))
    return Promise.resolve().then(() => clone(run()))
  }
}

function fakeStore(db: PayDb, calls: Call[]): StaffStore {
  let seq = 0
  const step = stepper(db, calls)
  const never = (name: string) => () => Promise.reject(new Error(`${name}는 급여 화면이 부르지 않는다`))
  return {
    listMembers: () => step('listMembers', READ, [], () => db.members),
    saveMember: never('saveMember'),
    purgeMember: never('purgeMember'),
    importRoster: never('importRoster'),
    listPlans: () => step('listPlans', READ, [], () => []),
    savePlan: never('savePlan'),
    listChanges: (range) => step('listChanges', READ, [range], () => []),
    saveChange: never('saveChange'),
    resetDay: never('resetDay'),
    listOvertime: (range) => step('listOvertime', READ, [range], () => db.overtime.filter((o) => inRange(o.day, range))),
    saveOvertime: never('saveOvertime'),
    listLeaves: (range) => step('listLeaves', READ, [range], () => db.leaves.filter((l) => inRange(l.day, range))),
    addLeaveGroup: never('addLeaveGroup'),
    replaceLeaveGroup: never('replaceLeaveGroup'),
    deleteLeaveGroup: never('deleteLeaveGroup'),
    countAppts: never('countAppts'),
    loadSettings: () => step('loadSettings', READ, [], () => db.settings),
    saveSettings: (settings) =>
      step('saveSettings', SAVE, [settings], () => {
        db.settings = clone(settings)
        return settings
      }),
    listRules: () => step('listRules', READ, [], () => db.rules),
    saveRules: (staffId, drafts, fromMonth) =>
      step('saveRules', SAVE, [staffId, drafts, fromMonth], () => {
        const saved = drafts.map((draft, sort): IncentiveRule => {
          const { id, ...fields } = draft
          const kept = typeof id === 'string' && db.rules.some((rule) => rule.id === id && rule.staffId === staffId)
          return { ...fields, id: kept ? id : `r-new-${(seq += 1)}`, staffId, sort }
        })
        db.rules = [...db.rules.filter((rule) => rule.staffId !== staffId), ...saved]
        db.lines = db.lines.map((line) => (line.staffId === staffId && line.month >= fromMonth ? { ...line, incentives: applyRules(line.incentives, saved) } : line))
        return saved
      }),
    listPayLines: (fromMonth, toMonth) =>
      step('listPayLines', READ, [fromMonth, toMonth], () => db.lines.filter((line) => line.month >= fromMonth && line.month <= toMonth)),
    savePayLine: (line) =>
      step('savePayLine', SAVE, [line], () => {
        const at = db.lines.findIndex((row) => (line.id !== null && row.id === line.id) || (row.month === line.month && row.staffId === line.staffId))
        const saved = { ...clone(line), id: at >= 0 ? db.lines[at].id : `line-${(seq += 1)}` }
        if (at >= 0) db.lines[at] = saved
        else db.lines.push(saved)
        return saved
      }),
    listPayMonths: (fromMonth, toMonth) => step('listPayMonths', READ, [fromMonth, toMonth], () => db.months.filter((m) => m.month >= fromMonth && m.month <= toMonth)),
    savePayMonth: (month) =>
      step('savePayMonth', SAVE, [month], () => {
        db.months = [...db.months.filter((m) => m.month !== month.month), clone(month)]
        return month
      }),
  }
}

function fakeFiles(db: PayDb, calls: Call[]): StaffFileStore {
  let seq = 0
  const step = stepper(db, calls)
  return {
    listFiles: (kind) => step('listFiles', READ, [kind], () => db.files.filter((f) => f.kind === kind)),
    uploadFile: (input) =>
      step('uploadFile', FILE, [input], () => {
        if (input.kind !== 'tax') throw new StaffStoreError(FILE)
        const saved = taxFile(`up-${(seq += 1)}`, input.month, input.file.name, input.file.size, `${TODAY}T02:00:00Z`)
        db.files.push(saved)
        return saved
      }),
    deleteFile: (file) =>
      step('deleteFile', FILE, [file], () => {
        db.files = db.files.filter((f) => f.id !== file.id)
      }),
    downloadFile: (file) => step('downloadFile', FILE, [file], () => undefined),
  }
}

function fakeClinic(): ClinicProfileView {
  return { state: 'ready', profile: defaultProfile(), saved: true, signupName: HOSPITAL, signupPhone: null, name: HOSPITAL, logoDataUrl: null, reload: () => {} }
}

/** 급여 화면(PayView)을 가짜 저장 층으로 그린다. reload는 db를 다시 읽은 새 직원·설정을 준다(저장 층은 그대로) */
export function renderPay(options: { db?: PayDb; today?: string; part?: string | null } = {}) {
  const db = options.db ?? payDb()
  const calls: Call[] = []
  const store = fakeStore(db, calls)
  const files = fakeFiles(db, calls)
  const clinic = fakeClinic()
  const loadRevenue = (range: DateRange) => {
    calls.push({ name: 'loadRevenue', args: [range] })
    if (db.failing.has('loadRevenue')) return Promise.reject(new Error('revenue'))
    return Promise.resolve(clone(db.revenue.filter((day) => inRange(day.date, range))))
  }
  function Host() {
    const [version, setVersion] = useState(0)
    const base = useMemo<StaffBase>(
      () => ({ state: 'ready', members: clone(db.members), settings: clone(db.settings), plans: [], clinic, store, files, reload: () => setVersion((n) => n + 1) }),
      // version이 늘 때마다 db를 다시 읽은 값을 준다
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [version],
    )
    return <PayView base={base} today={options.today ?? TODAY} initialPart={options.part ?? null} loadRevenue={loadRevenue} />
  }
  const view = render(<Host />)
  const callsOf = (name: string) => calls.filter((call) => call.name === name).map((call) => call.args)
  return { ...view, db, calls, callsOf }
}
