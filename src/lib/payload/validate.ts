import { isMonth, isYmd } from '@/lib/analytics/dates'
import type { FollowUp, Totals } from '@/types/analysis'
import { AGAIN_WINDOWS, type AgainCounts, type DayAgainPayload, type DayPayload, type MonthPayload, type MonthSections, type RevisitPayload } from '@/types/payload'
import type { RxPick } from '@/types/rxPicks'

// 저장 전·읽은 뒤에 쓰는 검사. 병원 계정(서버)에 들어가는 모양의 기준이다.
// 하나라도 어긋나면 null — 고쳐 쓰지 않는다(비트가 원본이라 다시 넣으면 된다).
// 맞으면 정해진 열쇠만 골라 새 객체로 돌려준다(넣은 값을 그대로 넘기지 않는다)

export const MIN_REGION_PATIENTS = 5 // 이보다 적은 동네는 저장하지 않는다(합치지도 않는다)
const MAX_TEXT = 100
const MAX_RX = 5_000
const MAX_GROUPS = 1_000
const MAX_REGIONS = 2_000
const GROUP_ID = /^[A-Za-z0-9-]{1,64}$/ // 묶음 열쇠(`t` + 16진수 16자리, treatment-trend)

// 개인 연락처·식별 번호 모양 글자: 전화(붙임표·점·빈칸으로 나눈 것, 나누지 않은 01x 번호) ·
// 숫자6-숫자7(앞 6자리가 월·일 모양, lib/parsers/bit와 같은 모양) · 메일 주소.
// 앞뒤에 숫자가 더 붙으면 아니다 — 9자리 EDI 처방코드 같은 숫자 글자를 잘못 거르지 않게
const PHONE = /(?<!\d)(?:0\d{1,2}[-. ]\d{3,4}[-. ]\d{4}|01[016789]\d{7,8})(?!\d)/
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{7}(?!\d)/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
// 붙여 쓴 13자리(lib/parsers/bit와 같은 모양). 처방코드에는 쓰지 않는다 — 13자리 의약품 표준코드(880…)와 모양이 같다
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
// 제어 문자. stats_rx_picks 칸 제약(`[[:cntrl:]]`)보다 일부러 좁게 받는다. 줄·문단 나눔 글자는 글자 분류 설정에 따라 표가 받기도 하지만 여기서는 거른다
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u

const MONTH_KEYS = ['schemaVersion', 'quality', 'month', 'partial', 'totals', 'rx', 'groups', 'revisit', 'regions']
const DAY_KEYS = ['schemaVersion', 'quality', 'day', 'partial', 'totals', 'rx', 'groups', 'revisit']
const TOTALS_KEYS = ['patients', 'newPatients', 'returning', 'unknown']
const MONTH_RX_KEYS = ['code', 'name', 'type', 'patients', 'newPatients', 'returning', 'followup']
const DAY_RX_KEYS = ['code', 'name', 'type', 'patients', 'newPatients', 'returning']
const MONTH_GROUP_KEYS = ['id', 'patients', 'newPatients', 'returning', 'followup']
const DAY_GROUP_KEYS = ['id', 'patients', 'newPatients', 'returning']
const REVISIT_KEYS = ['cohort', 'within7', 'within14']
const REVISIT_OPTIONAL_KEYS = ['within30', 'after30'] // 없으면 null로 읽는다
const REGION_KEYS = ['name', 'patients']
const AGAIN_KEYS = ['ready', 'rx']
const AGAIN_RX_KEYS = ['code', 'starts', 'back', 'more']
const RX_PICK_KEYS = ['code', 'name']

type Fields = Record<string, unknown>

// 정해진 열쇠(keys)가 빠짐없이, 그것만 있는 객체(배열·null 아님). optional 열쇠는 있어도 되고 없어도 된다
function exactly(value: unknown, keys: readonly string[], optional: readonly string[] = []): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  const complete = keys.every((key) => own.includes(key))
  return complete && own.every((key) => keys.includes(key) || optional.includes(key)) ? (value as Fields) : null
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

function isShortText(value: unknown, required: boolean): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT && !(required && value === '')
}

const hasContact = (value: string) => PHONE.test(value) || NATIONAL_ID.test(value) || MAIL.test(value)

// 전화·붙임표 주민번호·붙여 쓴 13자리·메일 모양(서식 탭이 적은 글과 카드 글에 쓴다, specs/forms)
export const hasPrivateShape = (value: string) => hasContact(value) || JOINED_NATIONAL_ID.test(value)

// 처방코드: 전화·붙임표 주민번호·메일 모양이면 거부(붙여 쓴 13자리는 의약품 표준코드와 가를 수 없어 보지 않는다)
function isCode(value: unknown): value is string {
  return isShortText(value, true) && !hasContact(value)
}

// 처방명·유형·동네 이름: 붙여 쓴 주민번호도 거부. 처방명·유형은 빈 글자일 수 있다(집계 필수값이 아니다)
export function isText(value: unknown, required = false): value is string {
  return isShortText(value, required) && !hasPrivateShape(value)
}

function listOf<T>(value: unknown, max: number, itemOf: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  const items: T[] = []
  for (const item of value) {
    const checked = itemOf(item)
    if (checked === null) return null
    items.push(checked)
  }
  return items
}

function totalsOf(value: unknown): Totals | null {
  const o = exactly(value, TOTALS_KEYS)
  if (o === null) return null
  const { patients, newPatients, returning, unknown } = o
  if (!isCount(patients) || !isCount(newPatients) || !isCount(returning) || !isCount(unknown)) return null
  return patients === newPatients + returning + unknown ? { patients, newPatients, returning, unknown } : null
}

function followupOf(value: unknown): FollowUp | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(isCount)) return null
  return [value[0], value[1], value[2], value[3]]
}

// 환자 수·신환·재진: 신환 + 재진 ≤ 환자(나머지는 알 수 없음)
function countsOf(o: Fields): { patients: number; newPatients: number; returning: number } | null {
  const { patients, newPatients, returning } = o
  if (!isCount(patients) || !isCount(newPatients) || !isCount(returning)) return null
  return newPatients + returning <= patients ? { patients, newPatients, returning } : null
}

// 1회·2회·3~5회·6회+ 네 칸의 합 = 환자 수
function followupFor(value: unknown, patients: number): FollowUp | null {
  const followup = followupOf(value)
  return followup !== null && followup[0] + followup[1] + followup[2] + followup[3] === patients ? followup : null
}

function rxOf(value: unknown, withFollowup: boolean) {
  const o = exactly(value, withFollowup ? MONTH_RX_KEYS : DAY_RX_KEYS)
  if (o === null) return null
  const { code, name, type } = o
  const counts = countsOf(o)
  if (!isCode(code) || !isText(name) || !isText(type) || counts === null) return null
  return { code, name, type, ...counts }
}

function groupOf(value: unknown, withFollowup: boolean) {
  const o = exactly(value, withFollowup ? MONTH_GROUP_KEYS : DAY_GROUP_KEYS)
  if (o === null) return null
  const { id } = o
  const counts = countsOf(o)
  return typeof id === 'string' && GROUP_ID.test(id) && counts !== null ? { id, ...counts } : null
}

function monthRxOf(value: unknown): MonthPayload['rx'][number] | null {
  const rx = rxOf(value, true)
  const followup = rx === null ? null : followupFor((value as Fields).followup, rx.patients)
  return rx === null || followup === null ? null : { ...rx, followup }
}

function monthGroupOf(value: unknown): MonthPayload['groups'][number] | null {
  const group = groupOf(value, true)
  const followup = group === null ? null : followupFor((value as Fields).followup, group.patients)
  return group === null || followup === null ? null : { ...group, followup }
}

const isCountOrPending = (value: unknown): value is number | null => value === null || isCount(value)

// 7일 ≤ 14일 ≤ 30일 ≤ 집단 ≤ 그 칸 신환, 30일 + after30 ≤ 집단.
// 집계 중(null)은 앞에서 뒤로 번진다: 7일 → 14일 → 30일 → after30. 돌려주는 객체에는 다섯 칸이 늘 있다
function revisitOf(value: unknown, newPatients: number): RevisitPayload | null {
  const o = exactly(value, REVISIT_KEYS, REVISIT_OPTIONAL_KEYS)
  if (o === null) return null
  const { cohort, within7, within14, within30 = null, after30 = null } = o
  if (!isCount(cohort) || !isCountOrPending(within7) || !isCountOrPending(within14)) return null
  if (!isCountOrPending(within30) || !isCountOrPending(after30)) return null
  if (cohort > newPatients) return null
  if ((within7 === null && within14 !== null) || (within14 === null && within30 !== null) || (within30 === null && after30 !== null)) return null
  // 뒤 칸이 집계 중이면 집단과 견준다. 숫자인 칸끼리만 이어지므로 이웃만 보면 된다
  if (within7 !== null && within7 > (within14 ?? cohort)) return null
  if (within14 !== null && within14 > (within30 ?? cohort)) return null
  if (within30 !== null && within30 + (after30 ?? 0) > cohort) return null
  return { cohort, within7, within14, within30, after30 }
}

// ── 같은 처방 재방문(again, fu-rate) ──
type AgainReady = DayAgainPayload['ready']

// 참·거짓 셋, 뒤가 true면 앞도 true. 일부인 날(partial)은 모두 false여야 한다
function againReadyOf(value: unknown, partial: boolean): AgainReady | null {
  if (!Array.isArray(value) || value.length !== AGAIN_WINDOWS.length) return null
  const [ready7, ready14, ready30]: unknown[] = value
  if (typeof ready7 !== 'boolean' || typeof ready14 !== 'boolean' || typeof ready30 !== 'boolean') return null
  if ((ready14 && !ready7) || (ready30 && !ready14)) return null
  return partial && ready7 ? null : [ready7, ready14, ready30]
}

// 창마다: ready면 0 이상 정수, 아니면 null(아직 다 지나지 않은 창)
const isAgainCount = (value: unknown, ready: boolean): value is number | null => (ready ? isCount(value) : value === null)

function againCountsOf(value: unknown, ready: AgainReady): AgainCounts | null {
  if (!Array.isArray(value) || value.length !== AGAIN_WINDOWS.length) return null
  const [count7, count14, count30]: unknown[] = value
  if (!isAgainCount(count7, ready[0]) || !isAgainCount(count14, ready[1]) || !isAgainCount(count30, ready[2])) return null
  return [count7, count14, count30]
}

// 처방 한 줄(네 열쇠만). 창마다 back ≤ starts, back ≤ more ≤ N × starts. 숫자인 창끼리 back·more는 7 ≤ 14 ≤ 30.
// ready가 앞에서부터 이어지므로 숫자인 창도 앞에서부터 이어진다 — 처음 만나는 null에서 멈춘다
function againRxOf(value: unknown, ready: AgainReady): DayAgainPayload['rx'][number] | null {
  const o = exactly(value, AGAIN_RX_KEYS)
  if (o === null) return null
  const { code, starts } = o
  if (!isCode(code) || !isCount(starts) || starts < 1) return null
  const back = againCountsOf(o.back, ready)
  const more = againCountsOf(o.more, ready)
  if (back === null || more === null) return null
  let before = { back: 0, more: 0 }
  for (let k = 0; k < AGAIN_WINDOWS.length; k += 1) {
    const backK = back[k]
    const moreK = more[k]
    if (backK === null || moreK === null) break
    if (backK > starts || backK > moreK || moreK > AGAIN_WINDOWS[k] * starts) return null
    if (backK < before.back || moreK < before.more) return null
    before = { back: backK, more: moreK }
  }
  return { code, starts, back, more }
}

// 그날 줄과 견준다: 코드가 그날 rx에 있고 starts ≤ 그 처방 환자 수, 같은 코드는 한 번만. 하나라도 어긋나면 null
function againOf(value: unknown, rx: DayPayload['rx'], partial: boolean): DayAgainPayload | null {
  const o = exactly(value, AGAIN_KEYS)
  if (o === null) return null
  const ready = againReadyOf(o.ready, partial)
  if (ready === null) return null
  const rows = listOf(o.rx, MAX_RX, (item) => againRxOf(item, ready))
  if (rows === null) return null
  const patientsOf = new Map(rx.map((line) => [line.code, line.patients]))
  const seen = new Set<string>()
  for (const row of rows) {
    const patients = patientsOf.get(row.code)
    if (patients === undefined || row.starts > patients || seen.has(row.code)) return null
    seen.add(row.code)
  }
  return { ready, rx: rows }
}

function regionOf(value: unknown): MonthPayload['regions'][number] | null {
  const o = exactly(value, REGION_KEYS)
  if (o === null) return null
  const { name, patients } = o
  return isText(name, true) && isCount(patients) && patients >= MIN_REGION_PATIENTS ? { name, patients } : null
}

export function validateMonthPayload(value: unknown): MonthPayload | null {
  const o = exactly(value, MONTH_KEYS)
  if (o === null || o.schemaVersion !== 2 || o.quality !== 'valid') return null
  const { month, partial } = o
  if (typeof month !== 'string' || !isMonth(month) || typeof partial !== 'boolean') return null
  const totals = totalsOf(o.totals)
  const rx = listOf(o.rx, MAX_RX, monthRxOf)
  const groups = listOf(o.groups, MAX_GROUPS, monthGroupOf)
  const regions = listOf(o.regions, MAX_REGIONS, regionOf)
  if (totals === null || rx === null || groups === null || regions === null) return null
  const revisit = revisitOf(o.revisit, totals.newPatients)
  if (revisit === null) return null
  return { schemaVersion: 2, quality: 'valid', month, partial, totals, rx, groups, revisit, regions }
}

// again은 선택 칸: 없으면(이 기능 전에 저장한 줄) 돌려주는 객체에도 없다. undefined는 없는 것과 같다(JSON에 남지 않는 값)
export function validateDayPayload(value: unknown): DayPayload | null {
  const o = exactly(value, DAY_KEYS, ['again'])
  if (o === null || o.schemaVersion !== 2 || o.quality !== 'valid') return null
  const { day, partial } = o
  if (typeof day !== 'string' || !isYmd(day) || typeof partial !== 'boolean') return null
  const totals = totalsOf(o.totals)
  const rx = listOf(o.rx, MAX_RX, (item) => rxOf(item, false))
  const groups = listOf(o.groups, MAX_GROUPS, (item) => groupOf(item, false))
  if (totals === null || rx === null || groups === null) return null
  const revisit = revisitOf(o.revisit, totals.newPatients)
  if (revisit === null) return null
  const payload: DayPayload = { schemaVersion: 2, quality: 'valid', day, partial, totals, rx, groups, revisit }
  if (o.again === undefined) return payload
  const again = againOf(o.again, rx, partial)
  return again === null ? null : { ...payload, again }
}

/** 통계 탭에서 고른 처방 한 줄(AC-811.1). 코드는 isCode, 이름은 isText를 지나고 둘 다 제어 문자가 없어야 한다 */
export function validateRxPick(value: unknown): RxPick | null {
  const o = exactly(value, RX_PICK_KEYS)
  if (o === null) return null
  const { code, name } = o
  if (!isCode(code) || !isText(name) || CONTROL.test(code) || CONTROL.test(name)) return null
  return { code, name }
}

// ── 통계 비트 세 칸 달 합계(sections, spec stats-bit-ai AC-2902.2·AC-2903.2) ──
// 저장 전(lib/storage)과 AI 서버가 읽은 뒤(app/api/ai) 같은 검사를 쓴다. 셈이 늘 지키는 관계도 본다:
// 연령대 명의 합 = 실환자, 요일 합 = 시간 합, 그 요일 접수가 있으면(그때만) 문 연 날이 있다, 원장님 신환 ≤ 실환자
const SECTIONS_KEYS = ['v', 'month', 'partial', 'mix', 'hours', 'doctors']
const MIX_KEYS = ['people', 'age', 'insurance', 'town']
const HOURS_KEYS = ['openDays', 'weekdays', 'hours', 'unknown']
const PEOPLE_KEYS = ['name', 'people']
const DOCTOR_KEYS = ['name', 'patients', 'newPatients', 'amount']
const AGE_ROWS = 10 // 연령대 아홉 묶음 + 생년월일 없음
const WEEK_DAYS = 7
const HOUR_CELLS = 13 // 8~20시
const MAX_WEEKDAY_IN_MONTH = 5 // 한 달에 같은 요일은 많아야 다섯 번
const MAX_INSURANCE = 100
const MAX_TOWNS = 10 // 화면 [동]의 보통 줄 수
const MAX_DOCTORS = 100

type Named = { name: string }

// 이름이 겹치면 AI 지표 ID가 겹친다
const hasUniqueNames = (rows: readonly Named[]) => new Set(rows.map((row) => row.name)).size === rows.length
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

function peopleRowOf(value: unknown, minPeople: number): { name: string; people: number } | null {
  const o = exactly(value, PEOPLE_KEYS)
  if (o === null) return null
  const { name, people } = o
  return isText(name, true) && isCount(people) && people >= minPeople ? { name, people } : null
}

function countsOfLength(value: unknown, length: number): number[] | null {
  return Array.isArray(value) && value.length === length && value.every(isCount) ? [...value] : null
}

function mixOf(value: unknown): MonthSections['mix'] | null {
  const o = exactly(value, MIX_KEYS)
  if (o === null || !isCount(o.people)) return null
  const people = o.people
  const age = listOf(o.age, AGE_ROWS, (item) => peopleRowOf(item, 0))
  const insurance = listOf(o.insurance, MAX_INSURANCE, (item) => peopleRowOf(item, MIN_REGION_PATIENTS))
  const town = listOf(o.town, MAX_TOWNS, (item) => peopleRowOf(item, MIN_REGION_PATIENTS))
  if (age === null || insurance === null || town === null) return null
  if (age.length !== AGE_ROWS || sum(age.map((row) => row.people)) !== people) return null
  if (![age, insurance, town].every(hasUniqueNames)) return null
  if (![...insurance, ...town].every((row) => row.people <= people)) return null
  return { people, age, insurance, town }
}

function hoursOf(value: unknown): MonthSections['hours'] | null {
  const o = exactly(value, HOURS_KEYS)
  if (o === null || !isCount(o.unknown)) return null
  const openDays = countsOfLength(o.openDays, WEEK_DAYS)
  const weekdays = countsOfLength(o.weekdays, WEEK_DAYS)
  const hours = countsOfLength(o.hours, HOUR_CELLS)
  if (openDays === null || weekdays === null || hours === null) return null
  if (sum(weekdays) !== sum(hours)) return null
  const fits = openDays.every((days, i) => days <= MAX_WEEKDAY_IN_MONTH && (days > 0) === (weekdays[i] > 0))
  return fits ? { openDays, weekdays, hours, unknown: o.unknown } : null
}

function doctorOf(value: unknown): MonthSections['doctors'][number] | null {
  const o = exactly(value, DOCTOR_KEYS)
  if (o === null) return null
  const { name, patients, newPatients, amount } = o
  if (!isText(name, true) || !isCount(patients) || !isCount(newPatients) || !Number.isSafeInteger(amount)) return null
  return newPatients <= patients ? { name, patients, newPatients, amount: amount as number } : null
}

export function validateMonthSections(value: unknown): MonthSections | null {
  const o = exactly(value, SECTIONS_KEYS)
  if (o === null || o.v !== 1) return null
  const { month, partial } = o
  if (typeof month !== 'string' || !isMonth(month) || typeof partial !== 'boolean') return null
  const mix = mixOf(o.mix)
  const hours = hoursOf(o.hours)
  const doctors = listOf(o.doctors, MAX_DOCTORS, doctorOf)
  if (mix === null || hours === null || doctors === null || !hasUniqueNames(doctors)) return null
  return { v: 1, month, partial, mix, hours, doctors }
}
