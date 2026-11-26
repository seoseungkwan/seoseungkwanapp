import { isYmd } from '@/lib/analytics/dates'
import { settleBatch } from '@/lib/parsers/uisarang/batch'
import { readUisFile } from '@/lib/parsers/uisarang/readFile'
import type { ErrorCode } from '@/types/errors'
import type { UisFileResult, UisRefuseCode } from '@/types/uisarang'

// 의사랑 엑셀 묶음 → 파일마다 결과(specs/uisarang-upload design.md §2·§5). Web Worker 안에서 돈다(시험은 이 함수를 바로 부른다).
// 파일 이름은 받지 않는다 — 넣은 차례로만 가른다. 답에는 숫자·종류·기간·처방 코드·처방명칭·머리 칸 이름만 있다

/** 화면이 바이트를 꺼내지 않은 파일: 50MB 넘음 · 보안 프로그램 잠금·넣은 뒤 지워짐 */
export type UisReadFailure = Extract<UisRefuseCode, 'E-UIS-TOO-BIG' | 'E-UIS-UNREADABLE'>

/** 화면 → Worker: 바이트(transfer로)와 오늘 날짜만. 꺼내지 못한 자리에는 번호 */
export type UisWorkerRequest = { files: Array<ArrayBuffer | UisReadFailure>; today: string }

/** Worker → 화면. 실패에는 번호만(예외 내용은 싣지 않는다) */
export type UisWorkerMessage = { type: 'done'; results: UisFileResult[] } | { type: 'failed'; code: ErrorCode }

const refused = (code: UisRefuseCode): UisFileResult => ({ status: 'refused', code, kind: null, span: null })

/** today가 날짜가 아니면 던진다(Worker가 E-ANALYZE-FAILED로 바꾼다). 파일 하나가 예외를 내면 그 파일만 E-UIS-UNREADABLE */
export function readUisFiles(files: ReadonlyArray<Uint8Array | UisReadFailure>, today: string): UisFileResult[] {
  if (!isYmd(today)) throw new RangeError('오늘 날짜를 YYYY-MM-DD로 주세요')
  const results = files.map((slot) => {
    if (typeof slot === 'string') return refused(slot === 'E-UIS-TOO-BIG' ? slot : 'E-UIS-UNREADABLE')
    try {
      return readUisFile(slot, today)
    } catch {
      return refused('E-UIS-UNREADABLE') // 예외 글에 파일 내용 조각이 섞일 수 있어 번호만
    }
  })
  return settleBatch(results)
}
