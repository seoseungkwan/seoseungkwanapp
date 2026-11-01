// 비고는 서버에 저장되므로 환자 연락처·식별 번호 모양 글자를 막는다.
// 정규식 출처: lib/payload/validate.ts의 PHONE·NATIONAL_ID·JOINED_NATIONAL_ID·MAIL과 같은 글자.
// 그 파일은 환자 자료 구역이고 상수를 내보내지 않아 불러오지 않고 옮겨 쓴다.
// 금액 칸은 12자리까지라 붙여 쓴 13자리 주민번호 모양과 부딪히지 않는다
const PHONE = /(?<!\d)(?:0\d{1,2}[-. ]\d{3,4}[-. ]\d{4}|01[016789]\d{7,8})(?!\d)/
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-\d{7}(?!\d)/
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/

export function notePrivacyProblem(text: string): boolean {
  return [PHONE, NATIONAL_ID, JOINED_NATIONAL_ID, MAIL].some((shape) => shape.test(text))
}
