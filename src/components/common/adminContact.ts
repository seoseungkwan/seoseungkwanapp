// 오류·거절 화면의 관리자 메일(ui-90 REQ-409, docs/UI_GUIDE.md '문구'). 서버·브라우저 둘 다 쓴다.
// 진짜 주소는 총괄이 환경 변수 NEXT_PUBLIC_ADMIN_CONTACT_EMAIL로 넣는다(비밀값이 아니다). 코드에는 대체 주소 하나만 둔다
const FALLBACK = 'admin@example.com'
const MAX_LENGTH = 254
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 설정값이 메일 모양(앞뒤 빈칸 뺀 뒤, 254자 이하)이면 그 값을, 비었거나 없거나 모양이 아니면 대체 주소를 돌려준다 */
export function adminContactEmail(): string {
  // 이름을 글자 그대로 쓴다. Next가 빌드 때 그 자리에 값을 넣는다(process.env[name]은 못 넣는다)
  const value = (process.env.NEXT_PUBLIC_ADMIN_CONTACT_EMAIL ?? '').trim()
  return value.length <= MAX_LENGTH && EMAIL_SHAPE.test(value) ? value : FALLBACK
}
