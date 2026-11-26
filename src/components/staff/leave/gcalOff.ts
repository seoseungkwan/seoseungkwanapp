import { addDays, compareYmd } from '@/lib/analytics/dates'
import { composeOffTitle, offDayNames, offScope } from '@/lib/calendar/goff'
import { sendOffDay } from '@/lib/gcal/loop'
import { listAllDay } from '@/lib/storage/calendar'
import { listOffDays, loadGcalView, loadOffNames, type GcalClient } from '@/lib/storage/gcal'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CalAllDay } from '@/types/calendar'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { GcalOffDay, GColor, OffName } from '@/types/gcal'
import type { StaffMember } from '@/types/staff'
import { weekdayName } from './leaveView'

// 직원 탭 휴가 → 구글 캘린더 그날 하루 종일 off 줄 (spec google-link REQ-8537, design.md 12-2, notes-calendar '화면 글 › staff').
// 휴가를 넣으면 DB 트리거가 예약 종일 'off' 줄(이어진 사람은 시행자 id, 이어지지 않은 직원은 'm-' id, 반차는 이어진 사람만)을 만들고
// gcal_off_days.wait를 켠다. 이 화면은 저장 뒤 날마다 맞춤 엔진(lib/gcal sendOffDay)으로 바로 보내고, 못 보내면 조용히 둔다(다음 맞춤이 보냄).
// 여기는 화면이 쓰는 순수 셈(맡는 사람·미리 보기·꼬리표·글)과 저장 층이다. 잇지 않은 병원은 이 파일을 쓰지 않는다(지금 글·동작 그대로, AC-8537.3)

/** 이은 병원의 off 줄 설정 — 캘린더 이름 · 이은 날 · off 낱말·색 · 캘린더 기본 색 · 예약 시행자가 아닌 직원도 · off 줄 사람(calendar_off_names) */
export type GcalOffInfo = {
  calendarName: string
  linkedOn: string
  offWord: string
  offColor: GColor
  defaultHex: string
  offAllStaff: boolean
  people: OffName[]
}

export type GcalOffStore = {
  /** 이은 병원(캘린더를 고르고 처음 가져오기까지 함)이면 설정, 아니면 null */
  loadInfo(): Promise<GcalOffInfo | null>
  listAllDay(from: string, to: string): Promise<CalAllDay[]>
  listOffDays(from: string, to: string): Promise<GcalOffDay[]>
  /** 그날 off 줄을 바로 보낸다. 구글에 적었거나 이미 같으면 참, 이은 날 앞·실패·맞춤이 돌지 않음은 거짓 */
  sendOffDay(day: string): Promise<boolean>
}

export type GcalOff = { info: GcalOffInfo; store: GcalOffStore }
/** 화면이 쓰는 묶음: 연결 + 웹앱이 off 줄에서 맡는 사람 */
export type OffCtx = GcalOff & { scope: OffName[] }

// ── 화면 글 (notes-calendar '화면 글 › staff' 그대로) ──
export const LINKED_HEAD = "예약 달력에 '휴무'로 보이고, 구글 캘린더 그날 off 줄에 이름이 더해져요."
export const STAFF_HEAD = '구글 캘린더 그날 off 줄에 이름이 더해져요.'
export const HALF_HEAD = '예약 달력에 오전·오후 휴무로 보여요. 반차는 구글 off 줄에 넣지 않아요.'
export const NOW_LABEL = '지금'
export const NEXT_LABEL = '저장하면'
export const RESULT_BEFORE = '저장하면 이렇게 바뀌어요'
export const RESULT_AFTER = '저장한 뒤'
export const SAVED_BUTTON = '저장했어요 ✓'
export const GOOGLE_OFF_TAG = '구글 off 줄'
export const GOOGLE_HALF_TAG = '구글에는 안 넣음'
export const ROW_HEAD = '종일'
export const RESULT_NOTES = [
  '하루 종일 쉬는 휴가만 off 줄에 넣어요. 반차는 넣지 않고 예약 달력에만 오전·오후 휴무로 보여요(예: 11/27 이수현 오후 반차).',
  '여러 날 휴가는 날마다 그날 off 줄에 하나씩 더해요. 휴가를 지우면 그 줄에서 이름을 빼고, 아무도 안 남으면 줄을 지워요.',
  '예약 시행자가 아닌 직원(예: 데스크 김예시)도 off 줄에 들어가요. 예약 경고는 없어요.',
  '구글에서 off 줄을 고치면 예약 탭 휴무는 바뀌지만, 직원 탭 휴가 기록은 바꾸지 않아요.',
] as const

/** '11/27 (금)' */
export const mdw = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} (${weekdayName(day)})`

/** 오른쪽 날짜 범위: 같은 달 '11/25 – 28', 다른 달 '11/29 – 12/2' */
export function rangeHint(from: string, to: string): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  return `${md(from)} – ${from.slice(0, 7) === to.slice(0, 7) ? Number(to.slice(8, 10)) : md(to)}`
}

export const dayLine = (calendarName: string, day: string) => `구글 캘린더 ${calendarName} · ${mdw(day)} 하루 종일 줄`
export const sentLine = (hm: string) => `구글 캘린더에도 적었어요 · ${hm}`
export const savedNotice = (day: string) => `휴가를 넣었어요. 예약 달력과 구글 캘린더 ${mdw(day)} off 줄에도 더했어요.`

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')
/** 한국 시각 'HH:mm' */
export function koreaHm(at: Date): string {
  const d = new Date(at.getTime() + KOREA_OFFSET_MS)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

// ── 맡는 사람 ──

/** 그 직원의 예약 종일 'off' 줄 staff_id(DB 휴가 트리거와 같은 규칙). 병원 정보에 없는 시행자 id면 줄이 생기지 않아 null */
export function offIdOf(member: Pick<StaffMember, 'id' | 'calendarStaffId'>, staff: readonly ClinicStaff[]): string | null {
  if (member.calendarStaffId === null) return `m-${member.id.replace(/-/g, '')}`
  return staff.some((s) => s.id === member.calendarStaffId) ? member.calendarStaffId : null
}

/** 웹앱이 off 줄에서 맡는 사람(맞춤 엔진과 같다 — '예약 시행자가 아닌 직원도'가 꺼지면 예약에 보이는 시행자만) */
export function scopeOf(info: Pick<GcalOffInfo, 'people' | 'offAllStaff'>, staff: readonly ClinicStaff[]): OffName[] {
  return offScope(
    info.people,
    info.offAllStaff,
    staff.filter((s) => s.calendar).map((s) => s.id),
  )
}

/** 그 직원이 off 줄에 오르면 그 사람(목록 이름), 아니면 null */
export function offPersonOf(member: Pick<StaffMember, 'id' | 'calendarStaffId'>, staff: readonly ClinicStaff[], scope: readonly OffName[]): OffName | null {
  const id = offIdOf(member, staff)
  return id === null ? null : (scope.find((p) => p.id === id) ?? null)
}

type DayPart = { day: string; part: 'am' | 'pm' | null }

/** 휴가 목록 꼬리표: 반차 'half'('구글에는 안 넣음'), 맡는 사람의 이은 날 뒤 하루 종일 'off'('구글 off 줄'), 그 밖 null */
export function leaveTag(leave: DayPart, member: Pick<StaffMember, 'id' | 'calendarStaffId'>, off: OffCtx, staff: readonly ClinicStaff[]): 'off' | 'half' | null {
  if (leave.part !== null) return 'half'
  if (compareYmd(leave.day, off.info.linkedOn) < 0) return null
  return offPersonOf(member, staff, off.scope) ? 'off' : null
}

/** 구글로 보낼 날: 맡는 사람이면 하루 종일 휴가 날(반차 뺌, 이은 날 앞 뺌), 날 차례 한 번씩 */
export function offDaysFor(rows: readonly DayPart[], member: Pick<StaffMember, 'id' | 'calendarStaffId'>, off: OffCtx, staff: readonly ClinicStaff[]): string[] {
  if (offPersonOf(member, staff, off.scope) === null) return []
  const days = rows.filter((r) => r.part === null && compareYmd(r.day, off.info.linkedOn) >= 0).map((r) => r.day)
  return [...new Set(days)].sort(compareYmd)
}

/** 날마다 차례로 보낸다. 모두 보냈으면 참, 하나라도 못 보냈거나 보낼 날이 없으면 거짓(못 보낸 날은 다음 맞춤이 보낸다) */
export async function sendAll(store: Pick<GcalOffStore, 'sendOffDay'>, days: readonly string[]): Promise<boolean> {
  let ok = days.length > 0
  for (const day of days) {
    const sent = await store.sendOffDay(day).catch(() => false)
    if (!sent) ok = false
  }
  return ok
}

// ── 미리 보기 (예약 탭 종일 줄 · 구글 하루 종일 줄) ──

/** 오른쪽 미리 보기 날: 그 앞 이틀 ~ 다음 날(넷) */
export const previewDays = (first: string) => [-2, -1, 0, 1].map((n) => addDays(first, n))

export type Chip = { kind: 'memo' | 'off' | 'half'; text: string }
export type DayPreview = { day: string; app: Chip[]; google: Chip[] }
export type WindowData = { allday: CalAllDay[]; offDays: GcalOffDay[] }
/** 저장으로 바뀔 종일 줄: remove = 그 사람 옛 날 줄 빼기(고치기), add = 새 날 줄(이어지지 않은 직원의 반차는 줄이 없어 넣지 않는다) */
export type OffChange = {
  remove: { staffId: string; days: readonly string[] } | null
  add: { staffId: string; name: string; days: readonly string[]; part: 'am' | 'pm' | null } | null
}

/**
 * 휴가 넣기 칸의 저장으로 바뀔 종일 줄(DB 휴가 트리거와 같은 규칙): 새 날마다 그 사람 'off' 줄(이름은 병원 정보 이름 또는 직원 이름 10자) —
 * 이어지지 않은 직원의 반차는 줄이 없다. 고치기면 옛 사람의 옛 날 줄을 뺀다
 */
export function leaveChange(
  person: Pick<StaffMember, 'id' | 'name' | 'calendarStaffId'> | null,
  rows: readonly DayPart[],
  before: { member: Pick<StaffMember, 'id' | 'calendarStaffId'>; days: readonly string[] } | null,
  staff: readonly ClinicStaff[],
): OffChange {
  const removeId = before === null ? null : offIdOf(before.member, staff)
  const remove = before !== null && removeId !== null ? { staffId: removeId, days: before.days } : null
  const addId = person === null ? null : offIdOf(person, staff)
  if (person === null || addId === null || rows.length === 0) return { remove, add: null }
  const link = staff.find((s) => s.id === person.calendarStaffId) ?? null
  const part = rows[0].part
  if (link === null && part !== null) return { remove, add: null }
  return { remove, add: { staffId: addId, name: (link?.name ?? person.name).slice(0, 10), days: rows.map((r) => r.day), part } }
}

export async function loadWindow(store: Pick<GcalOffStore, 'listAllDay' | 'listOffDays'>, days: readonly string[]): Promise<WindowData> {
  const from = days[0]
  const to = days[days.length - 1]
  const [allday, offDays] = await Promise.all([store.listAllDay(from, to), store.listOffDays(from, to)])
  return { allday, offDays }
}

function applyChange(lines: readonly CalAllDay[], change: OffChange | null): CalAllDay[] {
  if (change === null) return [...lines]
  const { remove, add } = change
  const kept = lines.filter((l) => {
    if (l.type !== 'off') return true
    if (remove && l.staffId === remove.staffId && remove.days.includes(l.day)) return false
    return !(add && l.staffId === add.staffId && add.days.includes(l.day))
  })
  const added: CalAllDay[] = add
    ? add.days.map((day) => ({ id: `new-${day}`, day, type: 'off', memo: null, staffId: add.staffId, staffName: add.name, part: add.part }))
    : []
  return [...added, ...kept] // 새로 든 사람이 그날 앞에
}

function appChips(lines: readonly CalAllDay[], day: string, word: string, marks: ReadonlyMap<string, string>): Chip[] {
  const today = lines.filter((l) => l.day === day)
  const chips: Chip[] = today.flatMap((l) => (l.type === 'memo' && l.memo ? [{ kind: 'memo' as const, text: l.memo }] : []))
  const names = [...new Set(today.filter((l) => l.type === 'off' && !l.part && l.staffName).map((l) => l.staffName as string))]
  if (names.length) chips.push({ kind: 'off', text: `${names.join(', ')} ${word}` })
  for (const l of today) {
    if (l.type !== 'off' || !l.part) continue
    const mark = l.staffId === null ? undefined : marks.get(l.staffId)
    chips.push({ kind: 'half', text: `${mark ? `(${mark}) ` : ''}${l.staffName ?? ''} ${l.part === 'am' ? '오전' : '오후'} 반차` })
  }
  return chips
}

/**
 * 미리 보기 넷째 날. change가 있으면 저장한 뒤 모습을 셈한다 — 예약 탭은 바뀐 종일 줄, 구글은 바뀌는 날만 composeOffTitle
 * (목록 밖 이름은 남김, 이은 날 앞은 보내지 않으므로 그대로), 나머지 날은 지금 구글 제목 그대로.
 * titles = 날마다 { now: 지금 구글 off 제목(없으면 null), next: 저장하면 제목('' = 줄 없음) }
 */
export function previewWindow(
  days: readonly string[],
  data: WindowData,
  off: OffCtx,
  marks: ReadonlyMap<string, string>,
  change: OffChange | null,
): { views: DayPreview[]; titles: Map<string, { now: string | null; next: string }> } {
  const { offWord, linkedOn } = off.info
  const lines = applyChange(data.allday, change)
  const changed = new Set([...(change?.remove?.days ?? []), ...(change?.add?.days ?? [])])
  const titles = new Map<string, { now: string | null; next: string }>()
  const views = days.map((day): DayPreview => {
    const now = data.offDays.find((o) => o.day === day)?.gTitle || null
    const sends = changed.has(day) && compareYmd(day, linkedOn) >= 0
    const offLines = lines.filter((l): l is CalAllDay & { type: 'off' } => l.type === 'off')
    const next = sends ? composeOffTitle(offDayNames(offLines, day, off.scope), now, offWord, off.scope) : (now ?? '')
    titles.set(day, { now, next })
    const memos: Chip[] = lines.filter((l) => l.day === day && l.type === 'memo' && l.memo).map((l) => ({ kind: 'memo', text: l.memo as string }))
    return { day, app: appChips(lines, day, offWord, marks), google: next ? [...memos, { kind: 'off', text: next }] : memos }
  })
  return { views, titles }
}

// ── 저장 층 ──

/** 저장 층 — 연결·사람은 lib/storage/gcal, 종일 줄은 lib/storage/calendar, 보내기는 맞춤 엔진(lib/gcal/loop sendOffDay) */
export function createGcalOffStore(client: GcalClient): GcalOffStore {
  return {
    loadInfo: async () => {
      const view = await loadGcalView(client)
      if (view === null || !view.calendarId || !view.linkedOn) return null
      const people = await loadOffNames(client)
      return {
        calendarName: view.calendarName ?? '',
        linkedOn: view.linkedOn,
        offWord: view.look.offWord,
        offColor: view.look.offColor,
        defaultHex: view.defaultHex,
        offAllStaff: view.rules.offAllStaff,
        people,
      }
    },
    listAllDay: (from, to) => listAllDay(client, from, to),
    listOffDays: (from, to) => listOffDays(client, from, to),
    sendOffDay: async (day) => {
      const out = await sendOffDay(day)
      return out.ok && out.did !== 'dropped'
    },
  }
}

/** 브라우저 저장 층. Supabase 클라이언트를 만들지 못하면(설정 없음) null — 화면은 잇지 않은 병원처럼 그린다 */
export function browserGcalOffStore(): GcalOffStore | null {
  try {
    return createGcalOffStore(supabaseBrowser())
  } catch {
    return null
  }
}
