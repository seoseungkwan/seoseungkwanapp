import { MEMO_FONT_DEFAULT, MEMO_FONT_PTS, type MemoFontPt } from '@/types/worklog'

// 업무사항 글씨 크기 규칙 (specs/worklog-memo-font design.md '규칙'). 순수 함수다: 저장·화면·통로를 부르지 않는다

const PTS: readonly number[] = MEMO_FONT_PTS

/** 목록 안 숫자만 그대로, 그 밖(빈 값·글자·목록 밖 숫자·배열·객체)은 기본 11 */
export function toMemoFontPt(value: unknown): MemoFontPt {
  return typeof value === 'number' && PTS.includes(value) ? (value as MemoFontPt) : MEMO_FONT_DEFAULT
}

/** 목록에서 한 칸 옆. 끝에서 더 가면 그대로 */
export function stepMemoFont(pt: MemoFontPt, step: -1 | 1): MemoFontPt {
  const index = MEMO_FONT_PTS.indexOf(pt)
  return MEMO_FONT_PTS[index + step] ?? pt
}

/** 8에서 작게·16에서 크게만 거짓 */
export function canStepMemoFont(pt: MemoFontPt, step: -1 | 1): boolean {
  return stepMemoFont(pt, step) !== pt
}
