import type { Cell, Grid } from '@/types/parse'

// 의사랑 엑셀 칸 읽기 도움(specs/uisarang-upload design.md §3-4) [환자 자료 구역].
// 칸 글자는 Worker 메모리에서만 견주고, 결과에는 숫자·종류·기간·처방 코드·처방명칭·머리 칸 이름만 남긴다

/** 칸 글자에서 빈칸을 모두 뺀 것(머리 칸 이름 · 합계 · 신규 · 전체 견줌) */
export const squash = (cell: Cell | undefined): string => (cell === null || cell === undefined ? '' : String(cell).replace(/\s+/g, ''))

/** 앞뒤 빈칸을 뗀 글자 */
export const textOf = (cell: Cell | undefined): string => (cell === null || cell === undefined ? '' : String(cell).trim())

const NUMBER_TEXT = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

/** 숫자 칸: 숫자는 그대로, 글자는 쉼표·빈칸을 떼고(`-` 앞 음수 됨). 빈칸 = null(없음, 0 아님) · 숫자로 못 바꾸는 글자 = NaN */
export function numberOf(cell: Cell | undefined): number | null {
  if (cell === null || cell === undefined) return null
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : Number.NaN
  const text = cell.replace(/[\s,]/g, '')
  if (text === '') return null
  return NUMBER_TEXT.test(text) ? Number(text) : Number.NaN
}

/** 원 단위: 원 미만은 버린다(반올림하지 않음, -0 없음) */
export const won = (n: number): number => Math.trunc(n) + 0

/** 0 이상 안전한 정수(인원 칸) */
export const isCount = (n: number | null): n is number => n !== null && Number.isSafeInteger(n) && n >= 0

/** 머리 줄을 찾은 표. col = 읽는 칸 이름 → 칸 자리 */
export type Sheet = { grid: Grid; at: number; header: string[]; col: Readonly<Record<string, number>> }

/** 종류마다 읽기의 답. row = 받지 않은 줄(readGrid가 빈 줄을 버린 뒤 위에서의 차례, 1부터) */
export type Body<T> = { ok: true; value: T } | { ok: false; code: 'E-UIS-ROW' | 'E-UIS-TOTAL'; row?: number }

export const ok = <T>(value: T): Body<T> => ({ ok: true, value })
export const badRow = <T>(row?: number): Body<T> => (row === undefined ? { ok: false, code: 'E-UIS-ROW' } : { ok: false, code: 'E-UIS-ROW', row })
export const badTotal = <T>(): Body<T> => ({ ok: false, code: 'E-UIS-TOTAL' })

/** 머리 줄과 칸 글자가 같은 줄(쪽마다 되풀이) */
function isHeaderRepeat(row: readonly Cell[], header: readonly string[]): boolean {
  const length = Math.max(row.length, header.length)
  for (let c = 0; c < length; c++) if (squash(row[c]) !== (header[c] ?? '')) return false
  return true
}

/** 머리 줄 아래 줄들(되풀이 머리 줄은 뺌 · 빈 줄은 readGrid가 이미 뺐다). n = 줄 번호(1부터) */
export function* bodyRows(sheet: Sheet): Generator<{ row: Cell[]; i: number; n: number }> {
  for (let i = sheet.at + 1; i < sheet.grid.length; i++) {
    const row = sheet.grid[i]
    if (!isHeaderRepeat(row, sheet.header)) yield { row, i, n: i + 1 }
  }
}
