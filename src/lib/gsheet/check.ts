import { parseClock } from './plan'
import type { GsheetPinned, GsheetSettings } from './shapes'

// 수납 시트 설정 검사(spec google-link REQ-8512 AC-8512.3) — 글은 승인 시안 notes-sunap `settings`의 '저장 때 막는 글'·
// '진료실 저장 때 막는 글'·'저절로 넣기 막는 글' 그대로, 조건은 비트시트 SettingsForm.TryCollect · ColumnSettings.IsValid ·
// Settings.IsShiftValid · Clock.TryParse 그대로다.
// 비트시트는 첫 막는 글 하나만 보였고, 여기서는 설정 화면 차례(구글 연결 → 시트 → 비트 맞춤 → 저절로 넣기)로 모두 낸다.
// 기호 번호는 웹 화면에서 '시트' 칸으로 옮겼다. 칸 글자가 틀리면 밀어 내릴 칸은 보지 않는다(비트시트도 칸 글자에서 멈춤).
// 코드 주소·함께 쓸 메일은 서버 설정에 없고 이 PC 도우미의 칸 값(pinned, sheet.link 전에 봄)으로 본다(design.md 10-4).

const URL_MSG = '구글에서 받은 주소는 https:// 로 시작해야 해요.'
const MAIL_MSG = '함께 쓸 직원 메일 모양을 확인해 주세요(쉼표로 나눠 적어요).'
const ROWS_MSG = '환자 줄(몇 줄부터 몇 줄까지)을 숫자로 넣어 주세요.'
const COL_MSG = '칸 글자는 A~Z 글자로 넣어 주세요.'
const NOTE_MSG = '비고 칸 글자는 A~Z 글자로 넣어 주세요(비우면 비고를 넣지 않아요).'
const DUP_MSG = '같은 칸 글자를 두 번 쓸 수 없어요.'
const SIGN_MSG = '기호 번호는 0~99 숫자로 넣어 주세요.'
const SHIFT_FORM_MSG = '밀어 내릴 칸은 A:P처럼 넣어 주세요(비우면 줄을 끼우지 않아요).'
const SHIFT_ORDER_MSG = '밀어 내릴 칸은 앞 칸을 먼저 적어 주세요(예: A:P).'
const SHIFT_COVER_MSG = '밀어 내릴 칸은 비트가 채우는 칸과 비고·예약 칸을 모두 품어야 해요(예: A:P).'
const ROOM_MSG = '진료실 번호는 1~10 가운데서 골라 주세요.'
const EVERY_MSG = '몇 분마다는 1~240 사이 숫자로 넣어 주세요.'
const CLOCK_MSG = '시각은 08:00처럼 넣어 주세요.'

/** 비트시트 int 칸이 받는 가장 큰 수 */
const INT_MAX = 2_147_483_647
/** 비트가 채우는 칸(비트시트 ColumnSettings.Owned 차례) */
const OWNED = ['key', 'name', 'sign', 'amount', 'room', 'first', 'day90', 'block', 'therapy'] as const

const isInt = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max
/** 칸 글자 맞춤(비트시트 Norm: 앞뒤 빈칸 빼고 대문자). A~Z 밖 글자는 그대로 두어 아래 검사에서 걸린다 */
const norm = (col: string) => col.trim().replace(/[a-z]/g, (c) => c.toUpperCase())
/** 칸 글자는 두 글자까지, 밀어 내릴 칸은 세 글자까지(비트시트 IsLetters 둘) */
const isColumn = (col: string) => /^[A-Z]{1,2}$/.test(col)
const isShiftLetters = (col: string) => /^[A-Z]{1,3}$/.test(col)
const columnNumber = (col: string) => [...col].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0)

function columnProblem(cols: GsheetSettings['cols']): string | null {
  const all = OWNED.map((key) => norm(cols[key]))
  if (!all.every(isColumn)) return COL_MSG
  const note = norm(cols.note)
  if (note.length > 0) {
    if (!isColumn(note)) return NOTE_MSG
    all.push(note)
  }
  return new Set(all).size === all.length ? null : DUP_MSG
}

function shiftProblem(s: GsheetSettings): string | null {
  const text = norm(s.shiftCols.replace(/ /g, ''))
  if (text.length === 0) return null
  const parts = text.split(':')
  if (parts.length !== 2 || !parts.every(isShiftLetters)) return SHIFT_FORM_MSG
  const first = columnNumber(parts[0])
  const last = columnNumber(parts[1])
  if (first > last) return SHIFT_ORDER_MSG
  const need = [...OWNED.map((key) => norm(s.cols[key])), ...s.staffCols.map(norm), norm(s.cols.note)].filter((c) => c.length > 0)
  const inside = (col: string) => isShiftLetters(col) && columnNumber(col) >= first && columnNumber(col) <= last
  return need.every(inside) ? null : SHIFT_COVER_MSG
}

/** 막는 글(없으면 빈 목록). 하나라도 있으면 저장하지 않는다 */
export function checkGsheetSettings(s: GsheetSettings, pinned: GsheetPinned): string[] {
  const problems: string[] = []
  const add = (problem: string | null) => {
    if (problem !== null) problems.push(problem)
  }
  // 구글 연결
  const url = (pinned.url ?? '').trim()
  add(url.length > 0 && !/^https:\/\//i.test(url) ? URL_MSG : null)
  // 시트
  const mails = pinned.shareWith.map((m) => m.trim()).filter((m) => m.length > 0)
  add(mails.some((m) => !m.includes('@')) ? MAIL_MSG : null)
  add(isInt(s.firstRow, 1, INT_MAX) && isInt(s.lastRow, s.firstRow, INT_MAX) ? null : ROWS_MSG)
  const columns = columnProblem(s.cols)
  add(columns)
  add(Object.values(s.signs).every((n) => isInt(n, 0, 99)) ? null : SIGN_MSG)
  if (columns === null) add(shiftProblem(s))
  // 비트 맞춤
  add(Object.values(s.deptRooms).every((n) => isInt(n, 1, 10)) ? null : ROOM_MSG)
  // 저절로 넣기
  add(isInt(s.everyMin, 1, 240) ? null : EVERY_MSG)
  add([s.from, s.to, s.evening].every((t) => parseClock(t) !== null) ? null : CLOCK_MSG)
  return problems
}
