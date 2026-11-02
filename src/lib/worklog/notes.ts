import { WORKLOG_CELL_KEYS, type WorklogCellKey, type WorklogChanges } from '@/types/worklog'

// 업무일지 칸 글자(업무사항·비고·숫자 칸 글자·항목 이름)는 서버에 저장되므로 환자 연락처·식별 번호 모양을 막는다.
// 정규식 출처: lib/payload/validate.ts의 PHONE·NATIONAL_ID·JOINED_NATIONAL_ID·MAIL.
// 그 파일은 환자 자료 구역이고 상수를 내보내지 않아 불러오지 않고 옮겨 쓴다.
// 넓힌 까닭: 여기는 사람이 손으로 적는 글이라 구역번호 괄호(02)·(02))·+82·붙임표를 하나만 쓴 전화(010-00001234)·
// 나눔표 앞뒤 빈칸(010 - 0000 - 1234)·빈칸으로 나눈 주민번호까지 막는다. 빈칸은 글자 그대로의 빈칸만 본다(줄바꿈은 아니다).
// 그 파일은 처방코드 같은 숫자를 잘못 거르지 않아야 하므로 넓힌 모양은 업무일지에만 쓴다.
// 0으로 시작하는 9~11자리 숫자는 전화로 본다(금액은 0으로 시작하지 않는다). 붙여 쓴 13자리는 금액 한도(12자리)를 넘는다
const PHONE = /(?<!\d)(?:\+82[-. ]?\(?0?\d{1,2}\)?|\(?0\d{1,2}\)|0\d{1,2}) *[-.]? *\d{3,4} *[-.]? *\d{4}(?!\d)/
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]) *[-. ] *\d{7}(?!\d)/
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const DASHES = /[－—–―‐‑−ㅡ]/g
const NUMBER_MARKS = /\p{No}/gu // ①·² 같은 딸린 숫자
const SHAPES = [PHONE, NATIONAL_ID, JOINED_NATIONAL_ID, MAIL]

// 전각 숫자·전각 붙임표·긴 줄표로 적어도 같은 모양으로 본다. 맞춘 글자는 검사에만 쓰고 받은 글자는 바꾸지 않는다.
// 줄표를 먼저 맞춘다: NFKC가 ㅡ를 다른 글자로 바꾸기 때문이다.
// 두 가지로 맞춘다: NFKC는 ①을 1로 바꾸므로 ①010-0000-1234가 앞뒤 숫자 경계에 걸려 통과한다(그래서 번호 글자를 빈칸으로 바꾼 글자도 본다).
// 빈칸으로만 바꾸면 ⓪①⓪-…처럼 번호 글자로만 적은 전화가 통과한다(그래서 NFKC만 한 글자도 본다)
export function privacyProblem(text: string): boolean {
  const dashed = text.replace(DASHES, '-')
  const forms = [dashed.normalize('NFKC'), dashed.replace(NUMBER_MARKS, ' ').normalize('NFKC')]
  return forms.some((form) => SHAPES.some((shape) => shape.test(form)))
}

// 값이 개인정보 모양인 칸. 모든 입력 칸을 칸 순서대로 본다. 값이 없는 칸과 정해 둔 칸 밖의 열쇠는 돌려주지 않는다
export function blockedCellKeys(cells: WorklogChanges): WorklogCellKey[] {
  return WORKLOG_CELL_KEYS.filter((key) => privacyProblem(cells[key] ?? ''))
}
