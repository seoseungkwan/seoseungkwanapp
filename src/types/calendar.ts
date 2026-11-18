// 예약 탭(spec clinic-calendar, design.md '모양'). 예약 줄의 환자 이름·차트번호는 서버(calendar_appts, RLS 내 병원)에 둔다(ADR-030).
// 전화·성별·나이·생일·마지막 내원·비트 접수 목록·비트 예약은 이 모양에 없다(비트 찾기 결과는 Worker → 화면으로만, 고른 이름·차트번호만 예약에)

// 시안 20색 이름(화면 토큰 --cal-*, spec calendar-colors AC-6001.1). 차례: 옛 아홉(파랑~갈색) → 새 열 → 회색(지운 종류·시행자 색이라 맨 끝)
export const CAL_COLORS = [
  'blue',
  'teal',
  'purple',
  'orange',
  'pink',
  'lime',
  'navy',
  'sky',
  'brown',
  'red',
  'yellow',
  'green',
  'mint',
  'magenta',
  'wine',
  'forest',
  'lavender',
  'coral',
  'black',
  'gray',
] as const
export type CalColor = (typeof CAL_COLORS)[number]
export type CalKind = { id: string; name: string; len: number; color: CalColor | null } // null = 시행자 색 따름
export type CalStaff = { id: string; name: string; mark: string; color: CalColor }
export type CalSettings = { kinds: CalKind[]; staff: CalStaff[]; openHour: number; closeHour: number; sunday: boolean }
export type ApptStatus = 'auto' | 'came' | 'noshow' | 'cancel'
export type ApptAuto = 'came' | 'noshow' | null
// day = YYYY-MM-DD, start = 그날 0시부터 분(10분 칸), len = 분(5분씩). origDay·origStart = 처음 자리(DB 트리거만 적음)
export type CalAppt = {
  id: string
  day: string
  start: number
  len: number
  name: string
  chart: string | null
  staffId: string
  staffName: string
  staffMark: string
  kindId: string
  kindName: string
  memo: string
  status: ApptStatus
  auto: ApptAuto
  origDay: string | null
  origStart: number | null
}
export type ApptDraft = Omit<CalAppt, 'id' | 'auto' | 'origDay' | 'origStart'>
// 통계·월 보기 수 세기용(이름·차트번호·메모 없음)
export type CalCountRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay'>
// 통계 다시 예약·예약 빈자리용(spec stats-insights AC-6104.1). 이름·메모 없음. 차트번호는 lib/calendar 다시 예약 셈 안에서만 쓴다
export type CalSlotRow = Pick<CalAppt, 'day' | 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'start' | 'len' | 'chart'>
export type CalAllDay = { id: string; day: string; type: 'memo' | 'off'; memo: string | null; staffId: string | null; staffName: string | null }

// 설정 줄이 없을 때(DB 기본값과 같다). 시행자는 비어 있다(설정에서 더한다)
export const DEFAULT_CAL_SETTINGS: CalSettings = {
  kinds: [
    { id: 'dosu', name: '도수', len: 30, color: null },
    { id: 'jabo', name: '자보도수', len: 30, color: null },
    { id: 'shock', name: '충격파', len: 15, color: null },
    { id: 'inj', name: '주사', len: 10, color: 'pink' },
    { id: 'visit', name: '진료', len: 10, color: 'lime' },
  ],
  staff: [],
  openHour: 8,
  closeHour: 20,
  sunday: false,
}
