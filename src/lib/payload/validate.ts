import { isMonth, isYmd } from '@/lib/analytics/dates'
import type { FollowUp, Totals } from '@/types/analysis'
import type { DayPayload, MonthPayload, RevisitPayload } from '@/types/payload'

// 저장 전·읽은 뒤에 쓰는 검사. 병원 계정(서버)에 들어가는 모양의 기준이다.
// 하나라도 어긋나면 null — 고쳐 쓰지 않는다(비트가 원본이라 다시 넣으면 된다).
// 맞으면 정해진 열쇠만 골라 새 객체로 돌려준다(넣은 값을 그대로 넘기지 않는다)

export const MIN_REGION_PATIENTS = 5 // 이보다 적은 동네는 저장하지 않는다(합치지도 않는다)
const MAX_TEXT = 100
const MAX_RX = 5_000
const MAX_GROUPS = 1_000
const MAX_REGIONS = 2_000
const GROUP_ID = /^[A-Za-z0-9-]{1,64}$/ // 나중 rx_groups.id(uuid)

// 개인 연락처·식별 번호 모양 글자: 전화(붙임표·점·빈칸으로 나눈 것, 나누지 않은 01x 번호) ·
// 숫자6-숫자7(앞 6자리가 월·일 모양, lib/parsers/bit와 같은 모양) · 메일 주소.
// 앞뒤에 숫자가 더 붙으면 아니다 — 9자리 EDI 처방코드 같은 숫자 글자를 잘못 거르지 않게
const PHONE = /(?<!\d)(?:0\d{1,2}[-. ]\d{3,4}[-. ]\d{4}|01[016789]\d{7,8})(?!\d)/
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{7}(?!\d)/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
// 붙여 쓴 13자리(lib/parsers/bit와 같은 모양). 처방코드에는 쓰지 않는다 — 13자리 의약품 표준코드(880…)와 모양이 같다
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/

const MONTH_KEYS = ['schemaVersion', 'quality', 'month', 'partial', 'totals', 'rx', 'groups', 'revisit', 'regions']
const DAY_KEYS = ['schemaVersion', 'quality', 'day', 'partial', 'totals', 'rx', 'groups', 'revisit']
const TOTALS_KEYS = ['patients', 'newPatients', 'returning', 'unknown']
const MONTH_RX_KEYS = ['code', 'name', 'type', 'patients', 'newPatients', 'returning', 'followup']
const DAY_RX_KEYS = ['code', 'name', 'type', 'patients', 'newPatients', 'returning']
const MONTH_GROUP_KEYS = ['id', 'patients', 'newPatients', 'returning', 'followup']
const DAY_GROUP_KEYS = ['id', 'patients', 'newPatients', 'returning']
const REVISIT_KEYS = ['cohort', 'within7', 'within14']
const REGION_KEYS = ['name', 'patients']

type Fields = Record<string, unknown>

// 정해진 열쇠가 빠짐없이, 그것만 있는 객체(배열·null 아님)
function exactly(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && own.every((key) => keys.includes(key)) ? (value as Fields) : null
}

const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

function isShortText(value: unknown, required: boolean): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT && !(required && value === '')
}

const hasContact = (value: string) => PHONE.test(value) || NATIONAL_ID.test(value) || MAIL.test(value)

// 처방코드: 전화·붙임표 주민번호·메일 모양이면 거부(붙여 쓴 13자리는 의약품 표준코드와 가를 수 없어 보지 않는다)
function isCode(value: unknown): value is string {
  return isShortText(value, true) && !hasContact(value)
}

// 처방명·유형·동네 이름: 붙여 쓴 주민번호도 거부. 처방명·유형은 빈 글자일 수 있다(집계 필수값이 아니다)
function isText(value: unknown, required = false): value is string {
  return isShortText(value, required) && !hasContact(value) && !JOINED_NATIONAL_ID.test(value)
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

// 7일 ≤ 14일 ≤ 집단 ≤ 그 칸 신환. 7일이 집계 중(null)이면 14일도 집계 중
function revisitOf(value: unknown, newPatients: number): RevisitPayload | null {
  const o = exactly(value, REVISIT_KEYS)
  if (o === null) return null
  const { cohort, within7, within14 } = o
  if (!isCount(cohort) || !isCountOrPending(within7) || !isCountOrPending(within14)) return null
  if (cohort > newPatients) return null
  if (within7 === null) return within14 === null ? { cohort, within7, within14 } : null
  if (within7 > cohort || (within14 !== null && (within7 > within14 || within14 > cohort))) return null
  return { cohort, within7, within14 }
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

export function validateDayPayload(value: unknown): DayPayload | null {
  const o = exactly(value, DAY_KEYS)
  if (o === null || o.schemaVersion !== 2 || o.quality !== 'valid') return null
  const { day, partial } = o
  if (typeof day !== 'string' || !isYmd(day) || typeof partial !== 'boolean') return null
  const totals = totalsOf(o.totals)
  const rx = listOf(o.rx, MAX_RX, (item) => rxOf(item, false))
  const groups = listOf(o.groups, MAX_GROUPS, (item) => groupOf(item, false))
  if (totals === null || rx === null || groups === null) return null
  const revisit = revisitOf(o.revisit, totals.newPatients)
  if (revisit === null) return null
  return { schemaVersion: 2, quality: 'valid', day, partial, totals, rx, groups, revisit }
}
