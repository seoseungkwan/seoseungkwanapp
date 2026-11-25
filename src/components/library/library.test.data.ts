import { fireEvent } from '@testing-library/react'
import type { LibraryCategory, LibraryFile } from '@/lib/library/files'

// 자료실 화면 시험이 같이 쓰는 지어낸 목록(승인 시안 docs/mockups/library/index.html의 BASE·NEW_HELPER 그대로 — 파일 이름·크기·날짜는 모두 가짜).
// 시안 시각은 한국 시각이라 여기서는 UTC로 옮겨 적는다(예 한국 11월 25일 09:12 = 2026-11-25T00:12:00Z). 바구니 이름은 uuid 모양의 가짜다

export const KB = 1024
export const MB = 1024 * 1024
export const HELPER_DESC = '청구 도우미 · 비트 자료를 읽는 PC 프로그램'

let serial = 0
export function libraryFile(id: string, fileName: string, category: LibraryCategory, size: number, createdAt: string, description = ''): LibraryFile {
  serial += 1
  return {
    id,
    fileName,
    name: fileName,
    category,
    description,
    storagePath: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    size,
    createdAt,
  }
}

export const F1 = libraryFile('f1', '마감일지도우미_비트판_20261125.zip', 'install', 2_516_582, '2026-11-25T00:12:00Z', '마감일지 채우기 도우미 · 비트 PC에 깔아요')
export const F2 = libraryFile('f2', '비트시트_프로그램_새판.zip', 'install', 3_984_589, '2026-11-24T08:40:00Z', '비트 숫자를 구글 시트에 넣는 프로그램')
export const F3 = libraryFile('f3', '비트시트_설치_설명서.pdf', 'guide', 655_360, '2026-11-24T08:38:00Z', '비트시트 프로그램 까는 순서(사진 12장)')
export const H133 = libraryFile('h133', 'precheck-helper-0.13.3.zip', 'install', 1_153_434, '2026-11-23T02:05:00Z', HELPER_DESC)
export const E040 = libraryFile('e040', 'precheck-extension-0.4.0.zip', 'install', 8_192, '2026-11-20T06:30:00Z', '크롬 확장 · 크롬에 붙이는 작은 프로그램')
export const X1 = libraryFile('x1', '수납일지_샘플.xlsx', 'other', 47_104, '2026-11-18T01:20:00Z', '수납일지 엑셀 예시(숫자는 가짜)')
export const H120 = libraryFile('h120', 'precheck-helper-0.12.0.zip', 'install', 1_048_576, '2026-11-16T05:00:00Z', HELPER_DESC)
export const H110 = libraryFile('h110', 'precheck-helper-0.11.0.zip', 'install', 943_718, '2026-11-12T00:30:00Z', HELPER_DESC)

/** 시안 BASE 여덟(일부러 올린 차례가 아니다 — 화면이 차례를 맞추는지 보려고) */
export const FILES: LibraryFile[] = [H110, F3, E040, F1, H120, X1, F2, H133]

/** 시안 NEW_HELPER: 올린 뒤 최신이 되는 도우미 */
export const H140 = libraryFile('h140', 'precheck-helper-0.14.0.zip', 'install', 1_258_291, '2026-11-25T01:38:00Z', HELPER_DESC)

/** 숨은 파일 칸으로 파일 하나를 고른다(크기는 실제 내용 대신 정해 둔 값) */
export function pickFile(name: string, size: number, type = ''): File {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('파일 칸이 없다')
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

/** 끝나지 않은 약속과 그 끝내기 */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
