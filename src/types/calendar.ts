import type { DayHours } from '@/types/clinicProfile'

// 예약 탭(spec clinic-calendar, design.md '모양'). 예약 줄의 환자 이름·차트번호는 서버(calendar_appts, RLS 내 병원)에 둔다(ADR-030).
// 전화·성별·나이·생일·마지막 내원·비트 접수 목록·비트 예약은 이 모양에 없다(비트 찾기 결과는 Worker → 화면으로만, 고른 이름·차트번호만 예약에)

// 구글 일정 색 11가지(화면 토큰 --cal-*, spec google-link design.md 10-1 · ADR-055). 차례 = 구글 colorId 1~11 차례(설정 색판 차례도 같다)
export const CAL_COLORS = ['lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato'] as const
export type CalColor = (typeof CAL_COLORS)[number]
/** 색 이름 → 구글 colorId('1'~'11') */
export const CAL_COLOR_ID: Readonly<Record<CalColor, string>> = Object.freeze(
  Object.fromEntries(CAL_COLORS.map((color, i) => [color, String(i + 1)])) as Record<CalColor, string>,
)
/** 종류 색. null = 시행자 색 따름, 'default' = 캘린더 기본 색(--cal-default, 구글 colorId 없음) */
export type KindColor = CalColor | 'default' | null
/** words = 구글 일정 제목에서 이 종류를 알아볼 글(design.md 13절, 비면 저장 함수가 기본 글로 채운다) */
export type CalKind = { id: string; name: string; len: number; color: KindColor; words: string[] }
export type CalStaff = { id: string; name: string; mark: string; color: CalColor }
/**
 * 예약 설정. kinds는 예약 설정 줄(calendar_settings) 값이고, staff·openHour·closeHour·sunday·days·closedDates는
 * 화면에서 병원 정보와 합친 값이다(spec clinic-profile REQ-6603, lib/calendar/clinic mergeClinic).
 * days = 요일 진료시간(월~일, null = 휴진 요일)·closedDates = 휴진일(YYYY-MM-DD). mergeClinic이 늘 채운다 — 없으면 시간 표는 회색·휴진 없이 그린다
 */
export type CalSettings = {
  kinds: CalKind[]
  staff: CalStaff[]
  openHour: number
  closeHour: number
  sunday: boolean
  days?: DayHours[]
  closedDates?: string[]
}
export type ApptStatus = 'auto' | 'came' | 'noshow' | 'cancel'
export type ApptAuto = 'came' | 'noshow' | null
/** 아직 구글로 못 보낸 바뀜(google-link design.md 7-1 g_wait). null = 구글과 같음 */
export type GWait = 'new' | 'edit' | 'move' | 'cancel' | 'uncancel' | 'color'
export const G_WAITS: readonly GWait[] = ['new', 'edit', 'move', 'cancel', 'uncancel', 'color']
/** 들어온 길: 처음 가져오기·받기·웹앱 */
export type GFrom = 'import' | 'pull' | 'web'
/** 구글 제목에서 알아본 출처(g_how). gStart·gEnd = 구글 일정 시작·끝 글 그대로 */
export type GHow = { staff: 'title' | 'color' | 'picked' | 'none'; kind: 'title' | 'color' | 'setting' | 'picked'; memo: boolean; gStart: string; gEnd: string }
// day = YYYY-MM-DD, start = 그날 0시부터 분(5분 칸, google-link AC-8503.6), len = 분(5분씩). origDay·origStart = 처음 자리(DB 트리거만 적음).
// 시행자 세 칸(staffId·staffName·staffMark)은 모두 null(시행자 없음 — 구글에서 온 지난 예약)이거나 모두 글이다.
// g* = 구글 캘린더 짝 칸(design.md 7-1). gWaitAt·createdAt은 DB만 적는다(읽기만). 시각 글은 DB가 준 그대로(마이크로초까지) 둔다
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
  gColor: CalColor | null // null = 캘린더 기본 색
  colorFrom: 'app' | 'google'
  gKeepTitle: boolean
  gMoved: boolean
  gGone: boolean
  gWait: GWait | null
  gWaitAt: string | null
  gNote: string | null
  gFrom: GFrom | null
  gHow: GHow | null
  createdAt: string
}
/** 사용자가 넣고 고치는 구글 칸(gWaitAt·createdAt은 DB만 적는다) */
export type ApptGoogle = Pick<CalAppt, 'gEventId' | 'gUpdated' | 'gTitle' | 'gColor' | 'colorFrom' | 'gKeepTitle' | 'gMoved' | 'gGone' | 'gWait' | 'gNote' | 'gFrom' | 'gHow'>
/** 넣기·고치기 초안. 구글 칸은 받은 것만 보낸다(없으면 DB 기본값) */
export type ApptDraft = Omit<CalAppt, 'id' | 'auto' | 'origDay' | 'origStart' | 'gWaitAt' | 'createdAt' | keyof ApptGoogle> & Partial<ApptGoogle>
// 통계·월 보기 수 세기용(이름·차트번호·메모 없음). gMoved = 구글에서 변경 색이 됨(변경 수에 센다, AC-8503.4)
export type CalCountRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay' | 'gMoved'>
// 통계 다시 예약·예약 빈자리용(spec stats-insights AC-6104.1). 이름·메모 없음. 차트번호는 lib/calendar 다시 예약 셈 안에서만 쓴다
export type CalSlotRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'start' | 'len' | 'chart'>
/** 종일 줄. part = 반차 휴무('off' 줄만, 직원 탭 휴가에서 DB 트리거가 적음, spec staff REQ-7616) — 없거나 null이면 종일 */
export type CalAllDay = {
  id: string
  day: string
  type: 'memo' | 'off'
  memo: string | null
  staffId: string | null
  staffName: string | null
  part?: 'am' | 'pm' | null
  /** 구글 일정 짝(종일 메모만, google-link design.md 7-2). 웹앱이 넣는 메모는 'ssk' + 32자 16진수. 읽은 메모 줄에는 늘 있다 */
  gEventId?: string | null
  gUpdated?: string | null
  gWait?: boolean
  gWaitAt?: string | null // DB 트리거만 적는다(읽기만)
  /** 구글 일정 색(메모 줄만, google-link REQ-8554 design.md 21-13). 'default' = 구글에서 색 없음, null = 웹앱에만 있음·아직 못 읽음 */
  gColor?: CalColor | 'default' | null
}

// 설정 줄이 없을 때(DB 기본값과 같다, google-link design.md 7-4). 시행자는 비어 있다(설정에서 더한다)
export const DEFAULT_CAL_SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
    { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
    { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
    { id: 'inj', name: '주사', len: 10, color: null, words: ['주사'] },
    { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
  ],
  staff: [],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}

/** 종류의 기본 알아볼 글(design.md 7-4): 기본 종류는 id로, 그 밖은 [이름] */
export function defaultKindWords(kind: Pick<CalKind, 'id' | 'name'>): string[] {
  const byId: Record<string, string[]> = { dosu: ['도수'], jabo: ['자보도수', '자보'], shock: ['충격파', '타'], inj: ['주사'], visit: ['진료'] }
  return Object.hasOwn(byId, kind.id) ? [...byId[kind.id]!] : [kind.name.trim()]
}
