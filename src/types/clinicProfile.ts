import type { CalColor } from '@/types/calendar'

// 병원 정보 한 곳(spec clinic-profile REQ-6601·REQ-6602, design.md 2절, ADR-033). 표 clinic_profiles 한 줄(RLS 내 병원, 고치기는 원장만, 데스크는 읽기만)과
// 비공개 Storage clinic-logos. 서식·문자·예약·통계·대시보드·AI가 읽는다. 한도는 DB 제약(migration 20261119000000_clinic_profile.sql)과 같다

export const HONORIFICS = ['원장님', '대표원장님', '선생님'] as const
export type Honorific = (typeof HONORIFICS)[number]

/** 하루 진료시간. 0시부터 분, 10분 단위. 점심은 둘 다 있거나 둘 다 null(점심 없음). null = 휴진 */
export type DayHours = { open: number; close: number; lunchFrom: number | null; lunchTo: number | null } | null

/** 쓰는 EMR(spec emr-choice REQ-7102, design.md 1절). DB 제약(migration 20261119300000_clinic_emr.sql)과 같은 넷. 글자는 lib/clinic/emrText.ts */
export const EMR_KINDS = ['bit', 'uisarang', 'egis', 'other'] as const // 비트 · 의사랑 · 이지스 · 그 밖의 EMR
export type EmrKind = (typeof EMR_KINDS)[number]
export const DEFAULT_EMR: EmrKind = 'bit'

export const STAFF_ROLES = ['doctor', 'staff'] as const // 원장님 · 직원
export type StaffRole = (typeof STAFF_ROLES)[number]
/** 원장님·직원 한 사람. id·이름·표시·색은 예약 시행자와 같은 모양(calendar = '예약에 보이기') */
export type ClinicStaff = { id: string; name: string; role: StaffRole; mark: string; color: CalColor; calendar: boolean }

export type ClinicProfile = {
  displayName: string | null // null = 가입 이름을 쓴다
  phone: string | null // 숫자만 9~11자
  address: string | null
  honorific: Honorific
  hours: DayHours[] // 일곱 칸, 월(0)~일(6)
  closedDates: string[] // YYYY-MM-DD 오름차순
  staff: ClinicStaff[]
  logoPath: string | null // clinic-logos 안 {hospital_id}/{uuid}.png
  emr: EmrKind // 쓰는 EMR. 저장한 적 없거나 읽은 값이 넷 밖이면 'bit'
}

/** hours 칸 차례의 요일 이름 */
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 저장한 적 없을 때(AC-6602.2): 월~금 09:00~18:00 점심 13:00~14:00, 토 09:00~13:00, 일 휴진 */
export const DEFAULT_HOURS: readonly DayHours[] = [
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 1080, lunchFrom: 780, lunchTo: 840 },
  { open: 540, close: 780, lunchFrom: null, lunchTo: null },
  null,
]
export const DEFAULT_HONORIFIC: Honorific = '원장님'

// DB 제약과 같은 한도(글자 수는 DB char_length처럼 코드포인트로 센다)
export const CLINIC_NAME_MAX = 50
export const CLINIC_ADDRESS_MAX = 100
export const HOURS_STEP = 10 // 분
export const CLOSED_DATES_MAX = 200
export const STAFF_MAX = 30
export const STAFF_NAME_MAX = 10
export const STAFF_ID_MAX = 40
export const LOGO_MAX_BYTES = 1_000_000
export const LOGO_MAX_SIDE = 1200 // px, 긴 변
export const CLINIC_LOGO_BUCKET = 'clinic-logos'
