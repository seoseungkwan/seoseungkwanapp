// 예약 탭 ↔ 병원 구글 캘린더 연결 모양 (spec google-link design.md 7-3·10-2, TASK-4).
// 같은 Phase의 types/calendar.ts(TASK-3) CalColor를 부르지 않고 11색 이름 GColor를 스스로 둔다(둘이 같은지는 TASK-23 시험이 본다)

/** 구글 일정 색 11개 — 구글 colorId 1~11 차례 */
export const G_COLORS = ['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'] as const
export type GColor = (typeof G_COLORS)[number]

/** 색 이름 → 구글 colorId('1'~'11') */
export const G_COLOR_ID: Readonly<Record<GColor, string>> = Object.freeze(
  Object.fromEntries(G_COLORS.map((color, index) => [color, String(index + 1)])) as Record<GColor, string>,
)

/** 캘린더 기본 색(그 병원 default_hex가 없을 때, design.md 2절 표 9) */
export const GCAL_DEFAULT_HEX = '#4285F4'

/** 맞춤 방법 — 받아 오는 간격(분) · 구글에서 지우면 · 도착을 제목에 · off 줄에 모든 직원 */
export type GcalRules = { pullMin: 1 | 2 | 5; onGoogleDelete: 'cancel' | 'delete'; arrival: 'off' | 'title'; offAllStaff: boolean }

/** 제목 꼴 — 취소 색 · 변경 색 · off 낱말·색 · 종류 글 없는 예약(종류 id 또는 'fix') · 색으로 시행자 · 시행자 글 없는 종류 · 제목에 길이·메모 */
export type GcalLook = {
  cancel: GColor
  change: GColor
  offWord: string
  offColor: GColor
  noKind: string | 'fix'
  staffByColor: boolean
  noStaffKinds: string[]
  titleLen: boolean
  titleMemo: boolean
}

/** 병원 하나의 연결(gcal_links 한 줄). secret은 lib/gcal만 읽는다(storage/gcal loadGcalLink) */
export type GcalLink = {
  scriptUrl: string
  secret: string
  calendarId: string | null
  calendarName: string | null
  defaultHex: string
  linkedOn: string | null
  rules: GcalRules
  look: GcalLook
}

/** 화면이 보는 연결 — 비밀 글자는 없고 있는지만 */
export type GcalView = Omit<GcalLink, 'secret'> & { hasSecret: boolean }

/** 맞춤 상태(gcal_state). 시각은 DB가 준 글자 그대로다(design.md 12-1) */
export type GcalState = {
  pulledUntil: string | null
  lastOkAt: string | null
  failSince: string | null
  failCode: string | null
  arrivalUntil: string | null
  arrivalDone: boolean
}

export const DEFAULT_GCAL_LOOK: Readonly<GcalLook> = Object.freeze({
  cancel: 'tomato',
  change: 'graphite',
  offWord: 'off',
  offColor: 'grape',
  noKind: 'dosu',
  staffByColor: true,
  noStaffKinds: Object.freeze(['shock']) as unknown as string[],
  titleLen: true,
  titleMemo: true,
})

export const DEFAULT_GCAL_RULES: Readonly<GcalRules> = Object.freeze({ pullMin: 2, onGoogleDelete: 'cancel', arrival: 'off', offAllStaff: true })

/** 고쳐야 할 까닭(gcal_fixes.reason, design.md 13절 까닭 글) */
export const FIX_REASONS = ['no-staff', 'no-staff-color', 'bad-mark', 'bad-kind', 'not-appt', 'too-long', 'off-name'] as const
export type FixReason = (typeof FIX_REASONS)[number]

/**
 * 알아본 칸(gcal_fixes.guess) — 차트번호 · 이름 · 종류(어디서 알아봤나) · 시행자(어디서 알아봤나) · 메모 ·
 * 고를 거리 word(알아보지 못한 글: bad-mark의 표시, bad-kind의 글, off-name의 이름). 모르는 칸은 null
 */
export type FixGuess = {
  chart: string | null
  name: string | null
  kindId: string | null
  kindHow: 'title' | 'color' | 'setting' | null
  staffId: string | null
  staffHow: 'title' | 'color' | null
  memo: string | null
  word: string | null
}

/** 고쳐야 할 구글 예약 한 줄(gcal_fixes). start·len은 분, gColor null = 캘린더 기본 색 */
export type GcalFix = {
  id: string
  gEventId: string
  day: string
  start: number
  len: number
  allDay: boolean
  gColor: GColor | null
  gTitle: string
  reason: FixReason
  guess: FixGuess
  state: 'open' | 'skip'
  gUpdated: string
}
export type GcalFixInput = Omit<GcalFix, 'id'>

/** 구글에서 지울 것(gcal_deletes — 트리거만 넣는다). label = 지운 줄의 구글 제목·메모 */
export type GcalDelete = { gEventId: string; day: string; kind: 'appt' | 'memo'; label: string | null }

/** 그날 구글 off 줄 짝(gcal_off_days). wait = 보낼 것, waitAt = 트리거가 적은 때(DB 글자 그대로) */
export type GcalOffDay = { day: string; gEventId: string | null; gTitle: string | null; gUpdated: string | null; wait: boolean; waitAt: string | null }
export type GcalOffDayInput = Omit<GcalOffDay, 'waitAt'>

/** off 줄에 오를 사람(calendar_off_names()). 예약 시행자가 아닌 직원은 id가 'm-' + 32자 */
export type OffName = { id: string; name: string }
