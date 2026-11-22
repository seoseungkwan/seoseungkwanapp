import { isEmrKind } from '@/lib/clinic/emrText'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { EmrKind } from '@/types/clinicProfile'
import type { HospitalRow } from '@/types/db'
import type { Hospital } from './hospital.server'

// 관리자 화면의 가입 신청 목록 읽기·상태 바꾸기(브라우저 → Supabase). 서버 코드가 아니다(ADR-004).
// 읽기는 RLS가 막는다(관리자는 모든 병원, 그 밖은 내 줄만). 바꾸기는 DB 함수 set_hospital_status 하나뿐이다 —
// 표 update 권한은 아무에게도 없고, 함수가 관리자인지·허용한 바꿈인지 본다(supabase/rls.test.ts가 증명).
// 실패는 AdminError 하나로 던진다 → 화면은 정해 둔 오류 카드만 보인다(원래 오류 문구는 cause에만 둔다)
/** 가입 신청 한 줄. emr은 가입 신청 때 고른 쓰는 EMR(spec emr-signup AC-7302.4, 넷 밖·없으면 'bit') */
export type Application = Hospital & { emr: EmrKind }
export class AdminError extends Error {}

type ApplicationPick = Pick<HospitalRow, 'id' | 'name' | 'applicant_name' | 'phone' | 'email' | 'status' | 'created_at' | 'emr'>
const COLUMNS = 'id, name, applicant_name, phone, email, status, created_at, emr'

function toApplication(row: ApplicationPick): Application {
  return {
    id: row.id,
    name: row.name,
    applicantName: row.applicant_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    // 읽은 값은 믿지 않는다(SQL 넣기 전 줄·넷 밖 값)
    emr: isEmrKind(row.emr) ? row.emr : 'bit',
  }
}

/** 신청일(created_at) 내림차순. 신청이 없으면 빈 목록 */
export async function listApplications(): Promise<Application[]> {
  let result: { data: ApplicationPick[] | null; error: unknown }
  try {
    // 표 타입을 만들어 두지 않은 클라이언트라 줄 모양은 손으로 맞춘다(types/db.ts)
    result = await supabaseBrowser().from('hospitals').select(COLUMNS).order('created_at', { ascending: false })
  } catch (cause) {
    throw new AdminError('가입 신청 목록을 읽지 못했어요', { cause })
  }
  if (result.error) throw new AdminError('가입 신청 목록을 읽지 못했어요', { cause: result.error })
  return (result.data ?? []).map(toApplication)
}

/** 대기 → 승인·거절, 거절 → 대기만 된다(그 밖은 함수가 오류). 저절로 다시 부르지 않는다 */
export async function setHospitalStatus(id: string, status: 'approved' | 'rejected' | 'pending'): Promise<void> {
  let error: unknown
  try {
    const result = await supabaseBrowser().rpc('set_hospital_status', { p_hospital_id: id, p_status: status })
    error = result.error
  } catch (cause) {
    throw new AdminError('신청 상태를 바꾸지 못했어요', { cause })
  }
  if (error) throw new AdminError('신청 상태를 바꾸지 못했어요', { cause: error })
}

// 관리자 여럿(spec multi-admin REQ-7702). 둘 다 정의자 함수 하나만 부른다 — admins 표 쓰기 권한은 아무에게도 없고,
// 함수가 부른 사람이 관리자인지·자기 자신·주 관리자 병원·승인 안 된 병원인지 본다(supabase/multiAdmin.rls.test.ts가 증명)
/** 주인이 관리자인 승인된 병원 하나. mine = 내(부른 관리자) 병원, owner = 주 관리자 병원 */
export type AdminMark = { hospitalId: string; mine: boolean; owner: boolean }

// 답은 믿지 않는다: 줄 하나라도 모양이 틀리면 틀린 표시로 그리지 않고 막는다
function toAdminMark(row: unknown): AdminMark | null {
  if (typeof row !== 'object' || row === null) return null
  const { hospital_id, is_me, is_owner } = row as Record<string, unknown>
  if (typeof hospital_id !== 'string' || typeof is_me !== 'boolean' || typeof is_owner !== 'boolean') return null
  return { hospitalId: hospital_id, mine: is_me, owner: is_owner }
}

/** '승인' 탭 관리자 표시. rpc('admin_hospitals') 한 번, 받은 차례 그대로. 실패·모양 틀림 → AdminError */
export async function listAdminHospitals(): Promise<AdminMark[]> {
  let result: { data: unknown; error: unknown }
  try {
    result = await supabaseBrowser().rpc('admin_hospitals')
  } catch (cause) {
    throw new AdminError('관리자 목록을 읽지 못했어요', { cause })
  }
  if (result.error) throw new AdminError('관리자 목록을 읽지 못했어요', { cause: result.error })
  if (!Array.isArray(result.data)) throw new AdminError('관리자 목록을 읽지 못했어요')
  const marks: AdminMark[] = []
  for (const row of result.data) {
    const mark = toAdminMark(row)
    if (!mark) throw new AdminError('관리자 목록을 읽지 못했어요')
    marks.push(mark)
  }
  return marks
}

/** 정하기(true)·빼기(false). rpc('set_admin') 한 번, 저절로 다시 부르지 않는다. 실패 → AdminError */
export async function setAdmin(hospitalId: string, admin: boolean): Promise<void> {
  let error: unknown
  try {
    const result = await supabaseBrowser().rpc('set_admin', { p_hospital_id: hospitalId, p_admin: admin })
    error = result.error
  } catch (cause) {
    throw new AdminError('관리자를 바꾸지 못했어요', { cause })
  }
  if (error) throw new AdminError('관리자를 바꾸지 못했어요', { cause: error })
}
