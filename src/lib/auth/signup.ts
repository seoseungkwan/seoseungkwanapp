// 가입 신청 값 검사(순수). 결과는 DB 검사 제약(supabase/migrations/20261028000000_auth.sql)과 같아야 한다:
//   name·applicant_name: char_length(코드포인트) 1~50 / 1~30, 앞뒤 공백 없음(= btrim)
//   phone: null 또는 '^[0-9]{9,11}$'
// 통과한 값은 그대로 hospitals에 넣는다(lib/auth/hospital.ts). 틀린 칸마다 칸 아래에 보일 문구를 돌려준다

export type SignupInput = { name: string; applicantName: string; phone: string; agreed: boolean }
export type SignupValue = { name: string; applicant_name: string; phone: string | null }
export type SignupErrors = Partial<Record<keyof SignupInput, string>>

const NAME_MAX = 50
const APPLICANT_MAX = 30
// DB 정규식 [0-9]와 같다(\d나 다른 나라 숫자를 받지 않는다)
const PHONE = /^[0-9]{9,11}$/
// 연락처에서 빼는 글자: 공백(띄어쓰기·탭 등)과 '-'
const PHONE_SEPARATORS = /[\s-]/g

// DB char_length와 같이 코드포인트로 센다(한자 확장·그림 문자는 UTF-16 두 칸이지만 한 글자)
const lengthOf = (s: string) => [...s].length

// 앞뒤 공백을 빼고 1~max자인지. JS trim은 btrim(띄어쓰기만)보다 넓게 빼므로 결과는 항상 DB를 통과한다
function checkName(raw: string, max: number, label: string): { value: string } | { error: string } {
  const value = raw.trim()
  if (value === '') return { error: `${label}을 적어 주세요.` }
  if (lengthOf(value) > max) return { error: `${label}은 ${max}자까지 적을 수 있어요.` }
  return { value }
}

// 비웠으면(공백뿐 포함) null. 적었으면 공백·'-'를 뺀 숫자 9~11자리
function checkPhone(raw: string): { value: string | null } | { error: string } {
  if (raw.trim() === '') return { value: null }
  const digits = raw.replace(PHONE_SEPARATORS, '')
  if (!PHONE.test(digits)) return { error: '연락처는 숫자 9~11자리로 적어 주세요.' }
  return { value: digits }
}

export function validateSignup(i: SignupInput): { ok: true; value: SignupValue } | { ok: false; errors: SignupErrors } {
  // 칸 이름표는 화면 칸 이름과 같은 "의원 이름"(ui-90 AC-419.3). 검사 규칙·길이는 그대로다
  const name = checkName(i.name, NAME_MAX, '의원 이름')
  const applicant = checkName(i.applicantName, APPLICANT_MAX, '신청자 이름')
  const phone = checkPhone(i.phone)

  const errors: SignupErrors = {}
  if ('error' in name) errors.name = name.error
  if ('error' in applicant) errors.applicantName = applicant.error
  if ('error' in phone) errors.phone = phone.error
  if (!i.agreed) errors.agreed = '가입 신청을 보내려면 동의에 체크해 주세요.'

  if ('error' in name || 'error' in applicant || 'error' in phone || !i.agreed) return { ok: false, errors }
  return { ok: true, value: { name: name.value, applicant_name: applicant.value, phone: phone.value } }
}
