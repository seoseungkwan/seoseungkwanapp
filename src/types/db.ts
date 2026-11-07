// Supabase 표 줄 모양(손으로 씀, supabase CLI 타입 생성은 쓰지 않는다).
// 기준은 supabase/migrations/20261028000000_auth.sql, 청구 설정 표는 20261030000000_precheck_settings.sql
import type { DxLink, Grade } from '@/types/precheck'

export type HospitalStatus = 'pending' | 'approved' | 'rejected'

export type HospitalRow = {
  id: string
  owner_id: string
  name: string // 병원 이름 1~50자, 앞뒤 공백 없음
  applicant_name: string // 신청자 이름 1~30자, 앞뒤 공백 없음
  phone: string | null // 숫자 9~11자리
  email: string // 로그인 토큰의 이메일(DB 기본값)
  status: HospitalStatus // 관리자가 set_hospital_status로만 바꾼다
  agreed_at: string
  reviewed_at: string | null
  created_at: string
}

export type AdminRow = {
  user_id: string
  created_at: string
}

// 통계 숫자 저장 표. 기준은 supabase/migrations/20261101000200_stats.sql
export type StatsSourceColumn = 'bit' | 'file'

export type StatsMonthRow = {
  hospital_id: string
  month: string // 'YYYY-MM'
  partial: boolean
  source: StatsSourceColumn
  payload: unknown // 읽은 뒤 validateMonthPayload로 검사한다
  updated_at: string
}

export type StatsDayRow = {
  hospital_id: string
  day: string // 'YYYY-MM-DD'
  partial: boolean
  source: StatsSourceColumn
  payload: unknown // 읽은 뒤 validateDayPayload로 검사한다
  updated_at: string
}

export type StatsCoverageRow = {
  hospital_id: string
  from_day: string // 'YYYY-MM-DD'
  to_day: string // 'YYYY-MM-DD'
  source: StatsSourceColumn
  created_at: string
}

// 통계 탭에서 고른 처방. 기준은 supabase/migrations/20261103000000_rx_picks.sql
export type StatsRxPickRow = {
  hospital_id: string
  code: string // 1~100자, 제어 문자 없음. 한 병원 안에서 대소문자를 가리지 않고 하나다
  name: string // 0~100자, 제어 문자 없음
  pick_order: number // DB가 매기는 고른 차례
}

// 청구 설정 표(precheck design.md 8-1). hospital_id·updated_at·id는 DB가 정한다(읽기만, 보내지 않는다)
export type ClaimRuleSettingRow = {
  hospital_id: string
  rule_id: string // ^[A-Z]{2}-[0-9]{2,3}[a-z]?$
  enabled: boolean
  grade: Grade | null // null = 규칙표 기본 등급
  updated_at: string
}

export type ClaimHospitalSettingsRow = {
  hospital_id: string
  phrases: object // 원본 병원 문구 설정 모양, 256KB 미만
  dx_links: DxLink[] // 256KB 미만
  updated_at: string
}

/** 날짜별 건수(design.md 8-2, 표는 TASK-19 마이그레이션). 글자 칸이 없다 */
export type ClaimDayCountRow = {
  hospital_id: string
  visit_date: string // YYYY-MM-DD
  visits: number // 그 줄을 올릴 때 claim.dates가 준 진료 수(AC-019.3)
  need_memo: number
  entered: number
  needs_check: number
  skipped: number
  updated_at: string
}

/** 월말 마감 남은 일(design.md 8-2, TASK-22가 쓴다). 글자 칸이 없다 */
export type ClaimMonthCountRow = {
  hospital_id: string
  claim_month: string // 그 달 1일 YYYY-MM-01
  incomplete: number
  missing: number
  flagged: number
  updated_at: string
}

/** 날짜별 완료 표시(spec claim-day-done, 20261108000000_claim_day_closes.sql). 넣기는 visit_date만, hospital_id·closed_at은 DB가 정한다. 글자 칸이 없다 */
export type ClaimDayCloseRow = {
  hospital_id: string
  visit_date: string // YYYY-MM-DD
  closed_at: string // 처음 완료로 바꾼 시각
}

/** 연락 남은 건수(design.md 8-2, TASK-26이 쓴다). 병원마다 한 줄, 글자 칸이 없다 */
export type ContactCountRow = {
  hospital_id: string
  followup_left: number
  injection_left: number
  updated_at: string
}

export type MessageTemplateRow = {
  id: string
  hospital_id: string
  kind: 'injection' | 'followup'
  name: string // 1~30자
  body: string // 1~2000자
  sort_order: number // 0~99
  updated_at: string
}
