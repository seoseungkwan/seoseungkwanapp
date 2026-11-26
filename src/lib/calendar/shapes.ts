// 예약 셈(spec clinic-calendar design.md '순수 셈')이 받는 입력 모양. 환자 자료 구역이다.
// 서버 모양 src/types/calendar.ts(TASK-1)와 같은 이름·같은 칸이다. 같은 Phase라 그 파일을 import하지 않는다
// (두 모양이 맞는지는 화면을 잇는 TASK-8의 tsc가 본다). 날짜는 'YYYY-MM-DD', 시작·길이는 분(0시부터)

export type ApptStatus = 'auto' | 'came' | 'noshow' | 'cancel'
export type ApptAuto = 'came' | 'noshow' | null
/** 구글 일정 색 11가지(types/calendar CAL_COLORS와 같은 이름 — 그 파일을 import하지 않는다) */
export type CalColorName = 'lavender' | 'sage' | 'grape' | 'flamingo' | 'banana' | 'tangerine' | 'peacock' | 'graphite' | 'blueberry' | 'basil' | 'tomato'
export type GWait = 'new' | 'edit' | 'move' | 'cancel' | 'uncancel' | 'color'
export type GHow = { staff: 'title' | 'color' | 'picked' | 'none'; kind: 'title' | 'color' | 'setting' | 'picked'; memo: boolean; gStart: string; gEnd: string }

// 시행자 세 칸은 모두 null(시행자 없음)이거나 모두 글이다. g* = 구글 캘린더 짝 칸(google-link design.md 7-1), 시작은 5분 칸
export type CalAppt = {
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
  status: ApptStatus
  auto: ApptAuto
  origDay: string | null
  origStart: number | null
  gEventId: string | null
  gUpdated: string | null
  gTitle: string | null
  gColor: CalColorName | null
  colorFrom: 'app' | 'google'
  gKeepTitle: boolean
  gMoved: boolean
  gGone: boolean
  gWait: GWait | null
  gWaitAt: string | null
  gNote: string | null
  gFrom: 'import' | 'pull' | 'web' | null
  gHow: GHow | null
  createdAt: string
}
type ApptGoogle = Pick<CalAppt, 'gEventId' | 'gUpdated' | 'gTitle' | 'gColor' | 'colorFrom' | 'gKeepTitle' | 'gMoved' | 'gGone' | 'gWait' | 'gNote' | 'gFrom' | 'gHow'>
export type ApptDraft = Omit<CalAppt, 'id' | 'auto' | 'origDay' | 'origStart' | 'gWaitAt' | 'createdAt' | keyof ApptGoogle> & Partial<ApptGoogle>
export type CalCountRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay' | 'gMoved'>
/** 종일 줄. part = 반차 휴무('off' 줄만, 직원 탭 휴가에서 DB 트리거가 적음, spec staff REQ-7616) — 없거나 null이면 종일 */
export type CalAllDay = {
  id: string
  day: string
  type: 'memo' | 'off'
  memo: string | null
  staffId: string | null
  staffName: string | null
  part?: 'am' | 'pm' | null
  gEventId?: string | null
  gUpdated?: string | null
  gWait?: boolean
  gWaitAt?: string | null
}

/** 비트 자체 예약(RsvInf) 칸. 보기만 한다 */
export type BitGhost = { key: string; day: string; start: number; chart: string | null; name: string | null }

// ── 셈 결과 ──────────────────────────────────────────────

/** 칸 놓기: 묶음 안 열 번호(0부터)·묶음의 열 수·오른쪽으로 넓힌 열 수(1 이상) */
export type LayoutBlock = { key: string; start: number; len: number }
export type BlockPlace = { col: number; cols: number; span: number }

/** 더하기·고치기 판 경고. overlap = 겹친 예약 id(시작 이른 차례), off = 그날 그 시행자 휴무 */
export type CalWarnings = { overlap: string[]; off: boolean }

/** 보이는 도착 표시. none = 아직(표시 없음) */
export type ShownStatus = 'came' | 'noshow' | 'cancel' | 'none'

/** 월 보기 한 날. total·kinds·moved는 취소를 뺀 수, noshow는 오늘 전 날만(그 밖은 null) */
export type MonthCell<A = CalAllDay> = {
  day: string
  total: number
  kinds: { kindId: string; kindName: string; n: number }[]
  noshow: number | null
  moved: number
  allday: A[]
}

/** 예약 = 취소 포함(지운 것은 없음), 변경 = 처음 자리 칸이 있거나 구글에서 변경 색이 된 것(gMoved), 안 옴 = shownStatus가 noshow */
export type RateCounts = { total: number; cancel: number; moved: number; noshow: number }
export type RateRow = RateCounts & { id: string; label: string }
export type RateSummary = RateCounts & { byStaff: RateRow[]; byKind: RateRow[] }
export type MonthRate = RateCounts & { month: string }
