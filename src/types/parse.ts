import type { ErrorCode } from './errors'

// 빈 칸은 null. 글자 칸은 글자 그대로, 엑셀 숫자 칸(엑셀 날짜 숫자 포함)은 숫자 그대로
export type Cell = string | number | null
// 파일 형식과 상관없이 같은 모양: 다 빈 줄은 없고, 줄 끝의 빈 칸은 떼어 줄마다 길이가 다르다
export type Grid = Cell[][]
export type Outcome<T> = { ok: true; value: T } | { ok: false; code: ErrorCode }
