// 구글 캘린더 맞춤 순수 셈(spec google-link design.md 10-4·12-1·13절)이 받는 입력 모양과 내는 결과 모양. 환자 자료 구역이다.
// 같은 Phase의 src/types/calendar.ts(TASK-3)·src/types/gcal.ts(TASK-4)를 import하지 않고 같은 이름·같은 칸을 스스로 둔다
// (두 모양이 맞는지는 잇는 TASK의 tsc가 본다). 날짜는 'YYYY-MM-DD', 시작·길이는 분(0시부터), 구글 시각 글자는 한국 시각

// ── 구글 일정 색 11가지 ──────────────────────────────────

/** 구글 colorId 1~11 차례 */
export const G_COLORS = ['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'] as const
export type GColor = (typeof G_COLORS)[number]

/** 색 이름 → 구글 colorId('1'~'11') */
export const G_COLOR_ID = Object.fromEntries(G_COLORS.map((c, i) => [c, String(i + 1)])) as Record<GColor, string>

/** 색판 이름 글(notes-calendar) */
export const G_COLOR_NAME: Record<GColor, string> = {
  lavender: '라벤더',
  sage: '세이지',
  grape: '포도',
  flamingo: '플라밍고',
  banana: '바나나',
  tangerine: '귤',
  peacock: '공작',
  graphite: '흑연',
  blueberry: '블루베리',
  basil: '바질',
  tomato: '토마토',
}
export const DEFAULT_COLOR_NAME = '캘린더 기본 색'

/** 구글 colorId → 색 이름. 없거나 모르는 값은 null(= 캘린더 기본 색) */
export function colorFromId(id: string | null | undefined): GColor | null {
  if (!id || !/^(?:[1-9]|1[01])$/.test(id)) return null
  return G_COLORS[Number(id) - 1]
}

/** 종류 색. null = 시행자 색 따름, 'default' = 캘린더 기본 색 */
export type GKindColor = GColor | 'default' | null

// ── 설정 ────────────────────────────────────────────────

export type GStaff = { id: string; name: string; mark: string; color: GColor }
/** words = 구글 제목에서 알아볼 글 */
export type GKind = { id: string; name: string; len: number; color: GKindColor; words: string[] }
/** 구글 연결 설정 look(design.md 10-2 GcalLook). noKind = '종류 글이 없는 예약'의 종류 id 또는 'fix'(고쳐야 함으로 두기) */
export type GLook = {
  cancel: GColor
  change: GColor
  offWord: string
  offColor: GColor
  noKind: string
  staffByColor: boolean
  noStaffKinds: string[]
  titleLen: boolean
  titleMemo: boolean
}

// ── 예약 줄 (types/calendar.ts CalAppt와 같은 칸) ──────────

export type GApptStatus = 'auto' | 'came' | 'noshow' | 'cancel'
export type GWait = 'new' | 'edit' | 'move' | 'cancel' | 'uncancel' | 'color'
/** 알아본 출처. gStart·gEnd = 구글 시각 'HH:mm' */
export type GHow = {
  staff: 'title' | 'color' | 'picked' | 'none'
  kind: 'title' | 'color' | 'setting' | 'picked'
  memo: boolean
  gStart: string
  gEnd: string
}
export type GAppt = {
  id: string
  day: string
  start: number
  len: number
  name: string
  chart: string | null
  staffId: string | null
  staffName: string | null
  staffMark: string | null
  kindId: string
  kindName: string
  memo: string
  status: GApptStatus
  auto: 'came' | 'noshow' | null
  origDay: string | null
  origStart: number | null
  gEventId: string | null
  gUpdated: string | null
  gTitle: string | null
  gColor: GColor | null
  colorFrom: 'app' | 'google'
  gKeepTitle: boolean
  gMoved: boolean
  gGone: boolean
  gWait: GWait | null
  /** DB가 준 시각 글자 그대로(마이크로초까지). 견줄 때만 시각으로 읽는다 */
  gWaitAt: string | null
  gNote: string | null
  gFrom: 'import' | 'pull' | 'web' | null
  gHow: GHow | null
  createdAt?: string
}

/** 웹앱 → 구글 제목 꼴이 보는 칸 */
export type TitleAppt = Pick<GAppt, 'chart' | 'name' | 'kindId' | 'kindName' | 'len' | 'staffId' | 'staffMark' | 'memo'>

// ── 구글 일정 (예약 구글 코드 답, design.md 8-2) ─────────

/** 시각은 Asia/Seoul 'YYYY-MM-DDTHH:mm', 하루 종일은 'YYYY-MM-DD'(end는 다음 날). updated는 구글 RFC3339 */
export type GEvent = {
  id: string
  status: 'confirmed' | 'cancelled'
  summary: string
  description: string
  allDay: boolean
  start: string
  end: string
  colorId: string | null
  updated: string
  recurring: boolean
}

// ── off 줄 ──────────────────────────────────────────────

/** calendar_off_names() 한 사람. 이어지지 않은 직원은 id가 'm-'로 시작한다 */
export type OffPerson = { id: string; name: string }
/** 그날 종일 줄(types/calendar.ts CalAllDay의 칸 일부) */
export type OffLine = { day: string; type: 'memo' | 'off'; staffId: string | null; staffName: string | null; part?: 'am' | 'pm' | null }

// ── 알아보기 ────────────────────────────────────────────

/** linkedOn = 이은 날(처음 가져오기 때는 오늘). 그 0시 전이면 지난 예약 */
export type ParseCtx = {
  staff: readonly GStaff[]
  kinds: readonly GKind[]
  look: GLook
  people: readonly OffPerson[]
  arrival: 'off' | 'title'
  linkedOn: string
}

export type FixReason = 'no-staff' | 'no-staff-color' | 'bad-mark' | 'bad-kind' | 'not-appt' | 'too-long' | 'off-name'
/** 고를 거리. staff = 시행자, kind = 종류, len = 길이, what = 종일 메모로, person = off 줄 사람 */
export type FixNeed = 'staff' | 'kind' | 'len' | 'what' | 'person'
/**
 * 고쳐야 할 것의 알아본 칸(gcal_fixes.guess). needs 첫째가 까닭이다.
 * bad = 까닭 글의 낱말(bad-mark 표시·bad-kind 모르는 글·off-name 못 찾은 이름). bad-kind에서 종류를 고르면 bad 글은 memo 앞에 붙인다.
 * minutes = 구글 시각의 실제 길이(분), people = off 줄에서 맞춘 사람
 */
export type FixGuess = {
  chart: string | null
  name: string | null
  kindId: string | null
  kindName: string | null
  kindBy: 'title' | 'color' | 'setting' | null
  staffId: string | null
  staffName: string | null
  staffMark: string | null
  staffBy: 'title' | 'color' | null
  memo: string
  bad: string | null
  needs: FixNeed[]
  cancel: boolean
  moved: boolean
  gStart: string
  gEnd: string
  minutes: number
  people: OffPerson[]
}
/** 알아본 예약 하나(웹앱 칸). status는 취소 색이면 'cancel', gMoved는 변경 색 */
export type GParsedAppt = {
  day: string
  start: number
  len: number
  chart: string | null
  name: string
  kindId: string
  kindName: string
  staffId: string | null
  staffName: string | null
  staffMark: string | null
  memo: string
  status: 'auto' | 'cancel'
  gMoved: boolean
  gColor: GColor | null
  gHow: GHow
}
/** 고쳐야 할 구글 일정. 하루 종일이면 start 0·len 1440이고 days가 날마다(그 날마다 한 줄) */
export type GParsedFix = {
  reason: FixReason
  day: string
  days: string[]
  start: number
  len: number
  allDay: boolean
  gColor: GColor | null
  guess: FixGuess
}
export type GParsed =
  | { type: 'appt'; past: boolean; appt: GParsedAppt }
  | { type: 'fix'; past: boolean; fix: GParsedFix }
  | { type: 'off'; past: boolean; days: string[]; people: OffPerson[] }
  | { type: 'memo'; past: boolean; days: string[]; memo: string }

/** 고르기 한 칸. key: 'staff:<id>'·'kind:<id>'·'len:<분>'·'person:<id>'·'memo'·'skip' */
export type FixChoice = { key: string; label: string }

// ── 맞춤 판단 ───────────────────────────────────────────

/**
 * fix = 같은 구글 일정의 고쳐야 할 것 줄(있으면), allDaySeen = 같은 일정 id 종일 줄들의 마지막 g_updated(하루 종일 일정만)
 */
export type SyncCtx = ParseCtx & {
  onGoogleDelete: 'cancel' | 'delete'
  fix?: { state: 'open' | 'skip'; gTitle: string } | null
  allDaySeen?: string | null
}
/** 받기가 짝 예약에 적을 칸(바뀐 칸만) */
export type GApptPatch = Partial<
  Pick<
    GAppt,
    | 'day'
    | 'start'
    | 'len'
    | 'name'
    | 'chart'
    | 'kindId'
    | 'kindName'
    | 'staffId'
    | 'staffName'
    | 'staffMark'
    | 'memo'
    | 'status'
    | 'gColor'
    | 'colorFrom'
    | 'gTitle'
    | 'gKeepTitle'
    | 'gMoved'
    | 'gGone'
    | 'gWait'
    | 'gNote'
    | 'gHow'
    | 'gUpdated'
  >
>
/** 구글에서 받아 넣는 새 예약 줄 */
export type GNewRow = GParsedAppt & {
  gEventId: string
  gTitle: string
  gUpdated: string
  colorFrom: 'google'
  gKeepTitle: true
  gFrom: 'pull' | 'import'
}
export type GDecision =
  | { do: 'none'; why: 'before-link' | 'not-newer' | 'skip-kept' | 'not-ours' }
  | { do: 'update'; wins: 'web' | 'google'; patch: GApptPatch }
  | { do: 'delete' }
  | { do: 'insert'; row: GNewRow; dropFix: boolean }
  | { do: 'fix'; fix: GParsedFix }
  | { do: 'drop-fix' }
  | { do: 'allday'; days: string[]; parsed: GParsed }
  | { do: 'allday-gone' }

// ── 칠하기 ──────────────────────────────────────────────

/** 칸 색이 보는 예약 칸 */
export type PaintAppt = Pick<GAppt, 'status' | 'origDay' | 'origStart' | 'gMoved' | 'colorFrom' | 'gColor' | 'kindId' | 'staffId'>
/** 색 바꿈 대상을 고를 예약 */
export type TargetAppt = PaintAppt & Pick<GAppt, 'id' | 'day'>
export type PaintCtx = {
  look: Pick<GLook, 'cancel' | 'change' | 'offColor'>
  kinds: readonly Pick<GKind, 'id' | 'color'>[]
  staff: readonly Pick<GStaff, 'id' | 'color'>[]
}
/** key 'default' = 캘린더 기본 색(colorId 없음) */
export type GPaint = { key: GColor | 'default'; colorId: string | null; why: 'cancel' | 'change' | 'google' | 'setting' }

/** 예약표에 노란 빗금으로 그리는 고쳐야 할 것 한 칸 */
export type FixCell = { id: string; day: string; start: number; len: number; allDay: boolean; gTitle: string; gColor: GColor | null }
/** 예약표 부품이 받는 구글 prop(TASK-20 받음·TASK-21 넘김). waiting = 구글에 아직 못 보낸 예약 id */
export type RowsGoogle = { ctx: PaintCtx; fixes: FixCell[]; waiting: ReadonlySet<string> }
