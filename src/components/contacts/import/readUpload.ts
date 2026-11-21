import { MAX_FILE_BYTES, readContactsFile, type ReadResult } from '@/lib/contacts/workbook'

// 고른 파일 → 읽은 줄 또는 못 쓰는 까닭(design.md '화면' import/readUpload.ts, AC-6504.2).
// 이름 끝이 .xlsx가 아니면(대소문자 무시) 읽지 않고 'not-xlsx', 5MB를 넘으면 읽지 않고 'big'. 파일 내용·이름은 어디로도 보내지 않는다

const XLSX_NAME = /\.xlsx$/i

export async function readUpload(file: File): Promise<ReadResult> {
  if (!XLSX_NAME.test(file.name)) return 'not-xlsx'
  if (file.size > MAX_FILE_BYTES) return 'big'
  try {
    return await readContactsFile(new Uint8Array(await file.arrayBuffer()))
  } catch {
    // 파일을 못 읽음(읽는 동안 지워짐 등)·엑셀 읽기 도구를 못 불러옴 → 못 읽은 파일
    return 'not-xlsx'
  }
}
