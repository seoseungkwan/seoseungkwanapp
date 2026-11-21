// 주민번호 모양 (specs/staff AC-7610.6, design.md 4절 · requirements.md 'Claude가 정한 것 13'). 직원 주소·메모에 주민번호를 저장하지 않으려고
// 명단 더하기·고치기 칸(AC-7612.7)·엑셀 올리기 읽기(rosterExcel.ts, AC-7608.6)·저장 층(storage/staff.ts checkMember, AC-7610.6)이 이 한 함수를 쓴다.
// 순수 함수 — 네트워크·저장소·React 없음. 받은 글은 바꾸지 않고, 맞춘 글(전각 숫자 → 숫자, 긴 줄표 → '-')로 검사만 한다
// (lib/worklog/notes.ts privacyProblem과 같은 맞춤 방식. 전화·메일은 보지 않는다).
// 모양: 날짜 모양 앞 6자리(YYMMDD — 월 01~12, 일 01~31) + 나눔 글자 하나('-'·'.'·빈칸, 앞뒤 빈칸 허용) + 숫자 7자리,
// 또는 같은 앞 6자리에 1~8로 시작하는 7자리를 붙여 쓴 13자리. 앞이나 뒤에 다른 숫자가 바로 붙으면(더 긴 숫자의 일부) 아니다.
// 그래서 전화(9~11자리)·나눔표 있는 계좌는 걸리지 않는다. 붙여 쓴 13자리 계좌가 날짜 모양이면 가를 수 없어 막힌다(계좌는 계좌번호 칸에 — 그 칸은 이 검사를 하지 않는다)

const SPLIT = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]) *[-. ] *\d{7}(?!\d)/
const JOINED = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
const DASHES = /[－—–―‐‑−ㅡ]/g
const NUMBER_MARKS = /\p{No}/gu // ①·² 같은 딸린 숫자

/**
 * 글에 주민번호 모양이 있는가.
 * 줄표를 먼저 맞춘다(NFKC가 ㅡ를 다른 글자로 바꾸기 때문이다). 두 가지로 맞춘다: NFKC는 ①을 1로 바꾸므로 ①900101-…가 앞 숫자 경계에 걸려
 * 통과한다(그래서 번호 글자를 빈칸으로 바꾼 글자도 본다)
 */
export function hasNationalId(text: string): boolean {
  if (typeof text !== 'string' || text === '') return false
  const dashed = text.replace(DASHES, '-')
  const forms = [dashed.normalize('NFKC'), dashed.replace(NUMBER_MARKS, ' ').normalize('NFKC')]
  return forms.some((form) => SPLIT.test(form) || JOINED.test(form))
}
