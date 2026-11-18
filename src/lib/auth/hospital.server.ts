import 'server-only'
import { supabaseServer } from '@/lib/supabase/server'
import type { HospitalRow } from '@/types/db'

// 화면을 그리기 전(서버) 내 사용자·병원 줄·관리자 여부·데스크 줄 읽기. 세션과 hospitals·admins의 내 줄,
// (승인된 원장이면) 병원 정보 이름 한 칸(clinic_profiles.display_name), (내 병원 줄이 없을 때만) 읽기 함수 my_desk()만 읽고
// 쓰지 않는다(ADR-004 인증 예외, ADR-031, ADR-033). 어디로 보낼지는 정하지 않는다(guard.server.ts → gate.ts)

export type Hospital = {
  id: string
  name: string
  applicantName: string
  phone: string | null
  email: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

// 데스크 계정(desk-feedback, ADR-031): 내 병원 줄이 없고 로그인 메일이 어느 승인된 병원의 데스크 메일일 때 그 병원
export type Desk = { hospitalId: string; hospitalName: string }

// desk는 데스크일 때만 있다(선택 칸 — 원장·가입 전 사용자에게는 없다)
export type Me = { email: string; hospital: Hospital | null; isAdmin: boolean; desk?: Desk }

// 로그인이 풀림(세션 만료 등). middleware도 같은 getUser()로 '로그인 안 함'을 본다 → /login으로 보내도 되돌아오지 않는다
export class NotSignedInError extends Error {}
// 로그인은 살아 있는데 hospitals·admins를 읽지 못함(표·권한 없음, Supabase 장애). /login으로 보내면 middleware가 /dashboard로
// 되돌려 끝없이 돈다 → 던져서 오류 화면(app/error.tsx, E-PAGE-FAILED)이 안내한다 (AC-002.8)
export class HospitalReadError extends Error {}

type HospitalPick = Pick<HospitalRow, 'id' | 'name' | 'applicant_name' | 'phone' | 'email' | 'status' | 'created_at'>
const HOSPITAL_COLUMNS = 'id, name, applicant_name, phone, email, status, created_at'

function toHospital(row: HospitalPick): Hospital {
  return {
    id: row.id,
    name: row.name,
    applicantName: row.applicant_name,
    phone: row.phone,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
  }
}

// my_desk() 답(한 줄 또는 빈 목록)에서 그 병원 id·이름. 정해 둔 모양이 아니면 데스크로 보지 않는다(막는 쪽)
function toDesk(data: unknown): Desk | null {
  if (!Array.isArray(data)) return null
  const row: unknown = data[0]
  if (typeof row !== 'object' || row === null) return null
  const { hospital_id: hospitalId, hospital_name: hospitalName } = row as Record<string, unknown>
  if (typeof hospitalId !== 'string' || typeof hospitalName !== 'string') return null
  return { hospitalId, hospitalName }
}

type Server = Awaited<ReturnType<typeof supabaseServer>>

// 승인된 원장의 병원 정보 이름(clinic-profile AC-6606.5·AC-6602.8, ADR-033): 내 병원 줄의 display_name 한 칸만 읽는다(쓰지 않는다).
// 줄 없음·빈 이름·글자 아님·읽기 실패는 null → 가입 이름을 그대로 쓴다. 실패로 오류 화면에 보내지 않는다(SQL을 넣기 전 배포에도 앱이 열린다)
async function clinicName(supabase: Server, hospitalId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('clinic_profiles')
      .select('display_name')
      .eq('hospital_id', hospitalId)
      .maybeSingle<{ display_name: unknown }>()
    if (error || typeof data !== 'object' || data === null) return null
    const name = data.display_name
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
  } catch {
    return null
  }
}

export async function readMe(): Promise<Me> {
  const supabase = await supabaseServer()
  // getUser()는 Supabase 서버에 물어 확인한다(서버에서 getSession()은 믿지 않는다)
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new NotSignedInError('로그인하지 않았어요', { cause: authError })
  const userId = auth.user.id

  // 관리자는 RLS로 모든 병원을 읽을 수 있다 → owner_id로 내 줄만 좁힌다(계정당 병원 하나)
  const [hospital, admin] = await Promise.all([
    supabase.from('hospitals').select(HOSPITAL_COLUMNS).eq('owner_id', userId).maybeSingle<HospitalPick>(),
    supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle<{ user_id: string }>(),
  ])
  if (hospital.error) throw new HospitalReadError('내 병원을 읽지 못했어요', { cause: hospital.error })
  if (admin.error) throw new HospitalReadError('관리자 여부를 읽지 못했어요', { cause: admin.error })

  const me: Me = {
    email: auth.user.email ?? '',
    hospital: hospital.data === null ? null : toHospital(hospital.data),
    isAdmin: admin.data !== null,
  }
  // 원장 판정이 먼저다: 내 병원 줄(어느 상태든)이 있으면 데스크 줄을 읽지 않는다. 없을 때만 읽기 함수 my_desk()를 한 번 부른다(쓰기 없음).
  // 승인된 원장이면 헤더·탭 제목 이름은 병원 정보 이름이 먼저다(없으면 가입 이름). 데스크는 my_desk()가 이미 그 이름을 준다
  if (me.hospital !== null) {
    if (me.hospital.status !== 'approved') return me
    const name = await clinicName(supabase, me.hospital.id)
    return name === null ? me : { ...me, hospital: { ...me.hospital, name } }
  }
  const desk = await supabase.rpc('my_desk')
  // 읽지 못했으면 '데스크 아님'(→ 가입 신청 화면)으로 넘기지 않고 던진다 → 오류 화면 (AC-002.8과 같은 길)
  if (desk.error) throw new HospitalReadError('데스크 계정을 읽지 못했어요', { cause: desk.error })
  const found = toDesk(desk.data)
  return found === null ? me : { ...me, desk: found }
}
