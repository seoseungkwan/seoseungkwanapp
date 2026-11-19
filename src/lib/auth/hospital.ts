import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SignupValue } from './signup'

// 가입 신청 넣기(브라우저 → Supabase RLS). 소유자·이메일·상태·날짜는 DB 기본값이 넣는다(열 권한도 네 칸뿐: 이름·신청자·연락처·쓰는 EMR, emr-signup AC-7301.1).
// 실패는 SignupError 하나로 던진다 → 화면은 E-SIGNUP-FAILED 카드만 보인다(원래 오류 문구는 cause에만 둔다)
export class SignupError extends Error {}

// owner_id unique: 이 계정 줄이 이미 있다(다른 탭에서 먼저 보냄 등) → 신청은 된 것
const ALREADY_APPLIED = '23505'

export async function submitSignup(v: SignupValue): Promise<void> {
  let error: { code?: string } | null
  try {
    // 받은 값에 다른 칸이 섞여 와도 네 칸만 보낸다(emr-signup AC-7302.1). 넣은 줄은 다시 읽지 않는다(select 없음)
    const result = await supabaseBrowser()
      .from('hospitals')
      .insert({ name: v.name, applicant_name: v.applicant_name, phone: v.phone, emr: v.emr })
    error = result.error
  } catch (cause) {
    throw new SignupError('가입 신청을 보내지 못했어요', { cause })
  }
  if (error === null || error.code === ALREADY_APPLIED) return
  throw new SignupError('가입 신청을 보내지 못했어요', { cause: error })
}
