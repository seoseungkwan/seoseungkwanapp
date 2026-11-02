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
  need_memo: number
  entered: number
  needs_check: number
  skipped: number
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
