import type { SupabaseClient } from '@supabase/supabase-js'
import { addMonthsToDay, isYmd, todayInKorea } from '@/lib/analytics/dates'
import { isEmrKind } from '@/lib/clinic/emrText'
import { CAL_COLORS, type CalColor } from '@/types/calendar'
import {
  CLINIC_ADDRESS_MAX,
  CLINIC_LOGO_BUCKET,
  CLINIC_NAME_MAX,
  CLOSED_DATES_MAX,
  DEFAULT_EMR,
  DEFAULT_HONORIFIC,
  DEFAULT_HOURS,
  HONORIFICS,
  HOURS_STEP,
  LOGO_MAX_BYTES,
  LOGO_MAX_SIDE,
  STAFF_ID_MAX,
  STAFF_MAX,
  STAFF_NAME_MAX,
  STAFF_ROLES,
  WEEKDAY_NAMES,
  type ClinicProfile,
  type ClinicStaff,
  type DayHours,
  type EmrKind,
  type Honorific,
  type StaffRole,
} from '@/types/clinicProfile'

// 병원 정보 읽기·저장·로고 (spec clinic-profile REQ-6601·REQ-6602, design.md 2절, ADR-033 · 쓰는 EMR은 spec emr-choice AC-7102.1, 가입 때 고른 EMR은 spec emr-signup AC-7302.2). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표 clinic_profiles(내 병원 한 줄, 고치기는 원장만)와 비공개 Storage clinic-logos({hospital_id}/{uuid}.png, PNG만, 1,000,000바이트).
// 보내는 몸통은 정해 둔 칸만 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·updated_at은 보내지 않는다(DB 기본값·RLS가 정한다).
// 로고 이름(logo_path)은 uploadLogo·removeLogo만 고친다 — 표 저장은 그 칸을 보내지 않아 그새 바뀐 로고를 덮지 않는다.
// 읽은 줄은 모양을 믿지 않는다: 틀린 칸만 기본값이다(예약 loadCalendarSettings와 같은 방식).
// 실패는 'failed'(로고 받기는 null) 하나뿐이다. Supabase 오류 글은 버리고 밖으로 내지 않는다

type Client = Pick<SupabaseClient, 'from'>
type LogoClient = Pick<SupabaseClient, 'from' | 'storage'>
type SignupClient = Pick<SupabaseClient, 'from' | 'rpc' | 'auth'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Report = (reason: string) => void

const TABLE = 'clinic_profiles'
const COLUMNS = 'display_name, phone, address, honorific, hours, closed_dates, staff, logo_path, emr'
const PNG_TYPE = 'image/png'
const LOGO_INPUT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const LOGO_PATH = new RegExp(`^${UUID}/${UUID}\\.png$`, 'i')
const PHONE = /^[0-9]{9,11}$/

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const lengthOf = (text: string) => [...text].length
const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && lengthOf(value) >= min && lengthOf(value) <= max
const isPhone = (value: unknown): value is string => typeof value === 'string' && PHONE.test(value)
const isHonorific = (value: unknown): value is Honorific => (HONORIFICS as readonly unknown[]).includes(value)
const isRole = (value: unknown): value is StaffRole => (STAFF_ROLES as readonly unknown[]).includes(value)
const isColor = (value: unknown): value is CalColor => (CAL_COLORS as readonly unknown[]).includes(value)
const isMinute = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 1440 && (value as number) % HOURS_STEP === 0

// 앞뒤 빈칸을 빼고, 비면 null. 글자가 아니면 그대로(검사가 잡는다)
function textOrNull(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  return text === '' ? null : text
}

// 전화는 '02-123-4567'처럼 적어도 숫자만 남긴다
function phoneOrNull(value: unknown): unknown {
  const text = textOrNull(value)
  return typeof text === 'string' ? text.replace(/[\s.()-]/g, '') || null : text
}

const cleanDay = (day: DayHours): DayHours => (day === null ? null : { open: day.open, close: day.close, lunchFrom: day.lunchFrom, lunchTo: day.lunchTo })
const cleanStaff = (person: ClinicStaff): ClinicStaff => ({
  id: person.id,
  name: person.name.trim(),
  role: person.role,
  mark: person.mark.trim(),
  color: person.color,
  calendar: person.calendar,
})

/** 저장한 적 없을 때의 값(AC-6602.2). 부를 때마다 새로 만든다. 이름·전화는 없음 — 부르는 쪽이 가입 이름·전화를 쓴다 */
export function defaultProfile(): ClinicProfile {
  return {
    displayName: null,
    phone: null,
    address: null,
    honorific: DEFAULT_HONORIFIC,
    hours: DEFAULT_HOURS.map(cleanDay),
    closedDates: [],
    staff: [],
    logoPath: null,
    emr: DEFAULT_EMR,
  }
}

// ── 검사 ────────────────────────────────────────────────────

/** 하루 진료시간의 까닭(AC-6602.3). 맞으면 null. 휴진(null)은 맞다 */
export function dayProblem(day: DayHours): string | null {
  if (day === null) return null
  if (!isRecord(day)) return '진료시간 모양이 맞지 않아요'
  const { open, close, lunchFrom, lunchTo } = day
  if (!isMinute(open) || !isMinute(close)) return '시간은 10분 단위로 골라 주세요'
  if (open >= close) return '끝나는 시간이 시작 시간보다 늦어야 해요'
  if (lunchFrom === null && lunchTo === null) return null
  if (lunchFrom === null || lunchTo === null) return '점심은 시작과 끝을 함께 고르거나 함께 비워 주세요'
  if (!isMinute(lunchFrom) || !isMinute(lunchTo)) return '시간은 10분 단위로 골라 주세요'
  if (!(open <= lunchFrom && lunchFrom < lunchTo && lunchTo <= close)) return '점심은 진료시간 안에서, 시작이 끝보다 빨라야 해요'
  return null
}

function checkHours(value: unknown, report: Report): void {
  if (!Array.isArray(value) || value.length !== WEEKDAY_NAMES.length) {
    report('진료시간은 월~일 일곱 줄이어야 해요')
    return
  }
  value.forEach((day: DayHours, index) => {
    const problem = dayProblem(day)
    if (problem !== null) report(`${WEEKDAY_NAMES[index]}요일: ${problem}`)
  })
}

function checkClosedDates(value: unknown, report: Report): void {
  if (!Array.isArray(value)) {
    report('휴진일 모양이 맞지 않아요')
    return
  }
  if (value.length > CLOSED_DATES_MAX) report(`휴진일은 ${CLOSED_DATES_MAX}개까지예요`)
  if (!value.every((day) => typeof day === 'string' && isYmd(day))) report('휴진일 날짜 모양이 맞지 않아요')
  else if (new Set(value).size !== value.length) report('같은 휴진일이 두 번 있어요')
}

function checkStaff(value: unknown, report: Report): void {
  if (!Array.isArray(value)) {
    report('원장님·직원 모양이 맞지 않아요')
    return
  }
  if (value.length > STAFF_MAX) report(`원장님·직원은 ${STAFF_MAX}명까지예요`)
  const ids = new Set<unknown>()
  const marks = new Set<string>()
  for (const item of value) {
    const person = isRecord(item) ? item : {}
    if (!isText(person.id, 1, STAFF_ID_MAX) || ids.has(person.id)) report('사람 구분 값이 비었거나 겹쳐요')
    ids.add(person.id)
    if (!isText(textOrNull(person.name), 1, STAFF_NAME_MAX)) report(`이름은 1~${STAFF_NAME_MAX}자로 적어 주세요`)
    if (!isRole(person.role)) report("'원장님'·'직원' 중에서 골라 주세요")
    const mark = typeof person.mark === 'string' ? person.mark.trim() : ''
    if (lengthOf(mark) !== 1) report('예약 표시는 한 글자예요')
    else if (marks.has(mark)) report('예약 표시 글자가 겹쳐요')
    else marks.add(mark)
    if (!isColor(person.color)) report('색을 골라 주세요')
    if (typeof person.calendar !== 'boolean') report("'예약에 보이기' 값이 맞지 않아요")
  }
}

/**
 * 병원 정보 검사: 까닭 목록(비면 통과, 같은 까닭은 한 번). 이름·주소는 앞뒤 빈칸을 뺀 값(비면 없음), 전화는 기호를 뺀 숫자로 본다.
 * 이름 1~50 · 전화 숫자 9~11 · 주소 100 · 호칭 셋 · 쓰는 EMR 넷 · 요일마다 dayProblem(까닭 앞에 '월요일: ') · 휴진일 날짜 모양·겹침 없음·200개 ·
 * 사람 30명·id 1~40 겹침 없음·이름 1~10·원장님/직원·표시 1자 겹침 없음·예약 20색·예약에 보이기 참거짓
 */
export function checkProfile(profile: ClinicProfile): string[] {
  const value: ReadRow = isRecord(profile) ? profile : {}
  const found: string[] = []
  const report: Report = (reason) => {
    if (!found.includes(reason)) found.push(reason)
  }
  const name = textOrNull(value.displayName)
  if (!(name === null || isText(name, 1, CLINIC_NAME_MAX))) report(`병원 이름은 ${CLINIC_NAME_MAX}자까지예요`)
  const phone = phoneOrNull(value.phone)
  if (!(phone === null || isPhone(phone))) report('전화는 숫자 9~11자리로 적어 주세요')
  const address = textOrNull(value.address)
  if (!(address === null || isText(address, 1, CLINIC_ADDRESS_MAX))) report(`주소는 ${CLINIC_ADDRESS_MAX}자까지예요`)
  if (!isHonorific(value.honorific)) report('호칭은 원장님·대표원장님·선생님 중에서 골라 주세요')
  if (!isEmrKind(value.emr)) report('쓰는 EMR은 비트·의사랑·이지스·그 밖의 EMR 중에서 골라 주세요')
  checkHours(value.hours, report)
  checkClosedDates(value.closedDates, report)
  checkStaff(value.staff, report)
  return found
}

// ── 읽기·저장 ───────────────────────────────────────────────

// 칸 하나를 검사해 맞으면 깨끗한 값, 틀리면 null
function passes(check: (value: unknown, report: Report) => void, value: unknown): boolean {
  let ok = true
  check(value, () => {
    ok = false
  })
  return ok
}

/** 내 병원 정보. 줄이 없으면 null(부르는 쪽이 기본값·가입 이름을 쓴다), 읽기 실패는 'failed'. 틀린 칸만 기본값이다(진료시간은 일곱 칸 함께) */
export async function loadClinicProfile(client: Client): Promise<ClinicProfile | null | 'failed'> {
  let data: unknown
  try {
    const reply = await client.from(TABLE).select(COLUMNS).maybeSingle<ReadRow>()
    if (reply.error) return 'failed'
    data = reply.data
  } catch {
    return 'failed'
  }
  if (data === null || data === undefined) return null
  const row: ReadRow = isRecord(data) ? data : {}
  const name = textOrNull(row.display_name)
  return {
    displayName: isText(name, 1, CLINIC_NAME_MAX) ? name : null,
    phone: isPhone(row.phone) ? row.phone : null,
    address: isText(row.address, 1, CLINIC_ADDRESS_MAX) ? row.address : null,
    honorific: isHonorific(row.honorific) ? row.honorific : DEFAULT_HONORIFIC,
    hours: passes(checkHours, row.hours) ? (row.hours as DayHours[]).map(cleanDay) : DEFAULT_HOURS.map(cleanDay),
    closedDates: passes(checkClosedDates, row.closed_dates) ? [...(row.closed_dates as string[])].sort() : [],
    staff: passes(checkStaff, row.staff) ? (row.staff as ClinicStaff[]).map(cleanStaff) : [],
    logoPath: typeof row.logo_path === 'string' && LOGO_PATH.test(row.logo_path) ? row.logo_path : null,
    emr: isEmrKind(row.emr) ? row.emr : DEFAULT_EMR,
  }
}

/**
 * 표 여덟 칸(쓰는 EMR 포함)을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). checkProfile을 못 지나면 보내지 않고 'invalid'.
 * 오늘보다 1년 넘게 지난 휴진일은 빼고 앞날부터 차례로 보낸다(AC-6602.4). 받은 값은 고치지 않고, 성공하면 보낸 값(로고 이름은 받은 그대로)을 돌려준다
 */
export async function saveClinicProfile(client: Client, profile: ClinicProfile, today: string = todayInKorea()): Promise<ClinicProfile | 'invalid' | 'failed'> {
  if (checkProfile(profile).length > 0) return 'invalid'
  if (!isYmd(today)) return 'failed'
  const oldest = addMonthsToDay(today, -12)
  const clean: ClinicProfile = {
    displayName: textOrNull(profile.displayName) as string | null,
    phone: phoneOrNull(profile.phone) as string | null,
    address: textOrNull(profile.address) as string | null,
    honorific: profile.honorific,
    hours: profile.hours.map(cleanDay),
    closedDates: profile.closedDates.filter((day) => day >= oldest).sort(),
    staff: profile.staff.map(cleanStaff),
    logoPath: profile.logoPath,
    emr: profile.emr,
  }
  const body = {
    display_name: clean.displayName,
    phone: clean.phone,
    address: clean.address,
    honorific: clean.honorific,
    hours: clean.hours,
    closed_dates: clean.closedDates,
    staff: clean.staff,
    emr: clean.emr,
  }
  try {
    const { error } = await client.from(TABLE).upsert(body, { onConflict: 'hospital_id' })
    if (error) return 'failed'
  } catch {
    return 'failed'
  }
  return clean
}

// ── 로고 ────────────────────────────────────────────────────

const startsWithPng = (bytes: Uint8Array) => PNG_MAGIC.every((byte, index) => bytes[index] === byte)

async function isPngBlob(png: unknown): Promise<boolean> {
  if (!(png instanceof Blob) || png.type !== PNG_TYPE || png.size > LOGO_MAX_BYTES) return false
  try {
    return startsWithPng(new Uint8Array(await png.slice(0, PNG_MAGIC.length).arrayBuffer()))
  } catch {
    return false
  }
}

// 뒷정리(되돌리기·옛 파일 지우기)는 실패해도 결과를 바꾸지 않는다
async function quietly(work: () => PromiseLike<unknown>): Promise<void> {
  try {
    await work()
  } catch {
    // 알리지 않는다
  }
}

/** 내 줄의 병원 id와 지금 로고 이름. 줄이 없으면 null, 읽기 실패는 'failed' */
async function ownRow(client: Client): Promise<{ hospitalId: string; logoPath: string | null } | null | 'failed'> {
  const { data, error } = await client.from(TABLE).select('hospital_id, logo_path').maybeSingle<ReadRow>()
  if (error) return 'failed'
  if (data === null || data === undefined) return null
  if (!isRecord(data) || !isFilled(data.hospital_id)) return 'failed'
  return { hospitalId: data.hospital_id, logoPath: isFilled(data.logo_path) ? data.logo_path : null }
}

/**
 * 로고 올리기(AC-6602.6): 내 줄을 읽고 → 새 이름 {hospital_id}/{uuid}.png를 logo_path에 먼저 적고(바구니 정책이 그 이름만 받는다) → 올리고
 * → 실패면 logo_path를 옛 값으로 되돌려 'failed' → 성공이면 옛 파일을 지운다(지우기 실패는 무시). 돌려주는 값은 새 이름.
 * 줄이 아직 없으면 'failed'다 — 처음 저장할 때는 saveClinicProfile로 줄을 먼저 만든다. PNG(머리 글자·1,000,000바이트)가 아니면 보내지 않는다
 */
export async function uploadLogo(client: LogoClient, png: Blob): Promise<string | 'failed'> {
  if (!(await isPngBlob(png))) return 'failed'
  try {
    const row = await ownRow(client)
    if (row === null || row === 'failed') return 'failed'
    const path = `${row.hospitalId}/${crypto.randomUUID()}.png`
    const named = await client.from(TABLE).update({ logo_path: path }).eq('hospital_id', row.hospitalId)
    if (named.error) return 'failed'
    let uploaded = false
    try {
      const { error } = await client.storage.from(CLINIC_LOGO_BUCKET).upload(path, png, { contentType: PNG_TYPE, upsert: false })
      uploaded = !error
    } catch {
      uploaded = false
    }
    if (!uploaded) {
      await quietly(() => client.from(TABLE).update({ logo_path: row.logoPath }).eq('hospital_id', row.hospitalId))
      return 'failed'
    }
    const old = row.logoPath
    if (old !== null) await quietly(() => client.storage.from(CLINIC_LOGO_BUCKET).remove([old]))
    return path
  } catch {
    return 'failed'
  }
}

/** [로고 빼기](AC-6602.6): logo_path를 비우고 옛 파일을 지운다(지우기 실패는 무시). 로고·줄이 없으면 쓰지 않고 'ok' */
export async function removeLogo(client: LogoClient): Promise<'ok' | 'failed'> {
  try {
    const row = await ownRow(client)
    if (row === 'failed') return 'failed'
    if (row === null || row.logoPath === null) return 'ok'
    const old = row.logoPath
    const { error } = await client.from(TABLE).update({ logo_path: null }).eq('hospital_id', row.hospitalId)
    if (error) return 'failed'
    await quietly(() => client.storage.from(CLINIC_LOGO_BUCKET).remove([old]))
    return 'ok'
  } catch {
    return 'failed'
  }
}

function base64Of(bytes: Uint8Array): string {
  let text = ''
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(text)
}

/** 로고 받기(AC-6604.3): 비공개 바구니에서 받아 PNG 머리를 확인하고 data:image/png;base64 글로 준다(밖 주소를 쓰지 않는다). 아니면 null */
export async function downloadLogo(client: Pick<SupabaseClient, 'storage'>, path: string): Promise<string | null> {
  if (typeof path !== 'string' || !LOGO_PATH.test(path)) return null
  try {
    const { data, error } = await client.storage.from(CLINIC_LOGO_BUCKET).download(path)
    if (error || !(data instanceof Blob)) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    if (bytes.length > LOGO_MAX_BYTES || !startsWithPng(bytes)) return null
    return `data:${PNG_TYPE};base64,${base64Of(bytes)}`
  } catch {
    return null
  }
}

/**
 * 고른 그림 파일(PNG·JPEG·WEBP)을 긴 변 1,200px 안으로 줄여(키우지 않음) PNG로 다시 만든다(브라우저, AC-6602.6).
 * 다시 만든 PNG가 1,000,000바이트를 넘으면 'too-big', 읽지 못하면 'unreadable'(다른 형식은 열어 보지도 않는다)
 */
export async function normalizeLogo(file: Blob): Promise<Blob | 'too-big' | 'unreadable'> {
  if (!(file instanceof Blob) || !LOGO_INPUT_TYPES.includes(file.type)) return 'unreadable'
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return 'unreadable'
  }
  try {
    if (!(bitmap.width > 0 && bitmap.height > 0)) return 'unreadable'
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) return 'unreadable'
    context.drawImage(bitmap, 0, 0, width, height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, PNG_TYPE))
    if (png === null) return 'unreadable'
    return png.size > LOGO_MAX_BYTES ? 'too-big' : png
  } catch {
    return 'unreadable'
  } finally {
    bitmap.close()
  }
}

// ── 가입 이름 ───────────────────────────────────────────────

/** 가입 신청 때 적은 이름·전화(전화는 숫자 9~11자 모양일 때만) */
export type Signup = { name: string; phone: string | null }

/**
 * 가입 이름·전화(AC-6602.2 기본값, 병원 정보 이름이 없을 때의 이름). 원장은 내 세션 사용자 id로 내 병원 가입 줄(hospitals)의 두 칸만 읽고,
 * 내 병원 줄이 없으면(데스크) my_desk()의 이름(전화 없음)이다. 읽지 못하면 null
 */
export async function loadSignup(client: SignupClient): Promise<Signup | null> {
  try {
    const { data: auth } = await client.auth.getSession()
    const userId = auth?.session?.user?.id
    if (!isFilled(userId)) return null
    const own = await client.from('hospitals').select('name, phone').eq('owner_id', userId).maybeSingle<ReadRow>()
    if (own.error) return null
    if (isRecord(own.data)) return isFilled(own.data.name) ? { name: own.data.name, phone: isPhone(own.data.phone) ? own.data.phone : null } : null
    const desk = await client.rpc('my_desk')
    if (desk.error || !Array.isArray(desk.data)) return null
    const row: unknown = desk.data[0]
    return isRecord(row) && isFilled(row.hospital_name) ? { name: row.hospital_name, phone: null } : null
  } catch {
    return null
  }
}

/**
 * 가입 신청 때 고른 쓰는 EMR(spec emr-signup AC-7302.2, design.md 2절). DB 함수 my_signup_emr()가 승인된 원장·데스크에게 내 병원 가입 줄의 emr을 준다
 * (데스크는 hospitals를 못 읽어 함수로 읽는다). 넷 중 하나가 아니거나 오류(함수가 아직 없음 포함)·던짐이면 null — 부르는 쪽은 'bit'(지금 그대로)다
 */
export async function loadSignupEmr(client: Pick<SupabaseClient, 'rpc'>): Promise<EmrKind | null> {
  try {
    const { data, error } = await client.rpc('my_signup_emr')
    return !error && isEmrKind(data) ? data : null
  } catch {
    return null
  }
}
