// Supabase 표 줄 모양(손으로 씀, supabase CLI 타입 생성은 쓰지 않는다).
// 기준은 supabase/migrations/20261028000000_auth.sql
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
