import { dayText, latestOfKind, sizeText, versionOf, type LibraryFile, type VersionKind } from '@/lib/library/files'
import { downloadLibraryFile, listLibraryFiles } from '@/lib/storage/library'
import type { ErrorCode } from '@/types/errors'

// 비트 PC 연결 화면의 받기 단추([도우미 내려받기]·[새 도우미 내려받기]·[확장 내려받기])가 쓰는 설치 파일 목록·받기
// (specs/library design.md '설정·관리자 칸과 받기 단추', REQ-8109 · 옛 specs/helper-download REQ-5102).
// 자료실(lib/storage/library) 위의 얇은 잇기다: 자료실 목록을 한 번 읽어 도우미·확장마다 파일 이름의 판이 가장 높은 파일을 고르고,
// 받기는 자료실 받기(원래 파일 이름으로 저장)다. Supabase를 직접 부르지 않는다. 올리기·지우기는 자료실 화면(관리자만)이 한다.
// 실패는 InstallFilesError(번호) 하나로 바꾼다. 자료실 오류·원래 오류 글은 버리고 밖으로 내지 않는다

export type InstallKind = VersionKind
export type InstallFile = { kind: InstallKind; version: [number, number, number]; name: string; path: string; size: number; uploadedAt: string }
export type InstallErrorCode = Extract<ErrorCode, `E-INSTALL-${string}`>

/** 설치 파일 목록·받기 실패. 번호만 갖고, 받은 값과 원래 오류 글은 옮기지 않는다 */
export class InstallFilesError extends Error {
  readonly code: ErrorCode
  constructor(code: InstallErrorCode) {
    super(code)
    this.code = code
    this.name = 'InstallFilesError'
  }
}

/** 'precheck-helper-0.9.0.zip' → { kind: 'helper', version: [0, 9, 0] }. 모양이 다르면 null (자료실 versionOf 그대로) */
export const parseInstallName = versionOf

/** 자료실 한 줄 → 받기 단추 쪽 모양. 판 번호는 올릴 때의 파일 이름으로 본다 */
function installOf(file: LibraryFile | null): InstallFile | null {
  if (file === null) return null
  const parsed = versionOf(file.fileName)
  if (parsed === null) return null
  return { kind: parsed.kind, version: parsed.version, name: file.fileName, path: file.storagePath, size: file.size, uploadedAt: file.createdAt }
}

/** 종류마다 가장 높은 판(분류 상관없음, 없으면 null). 자료실 목록을 한 번 읽는다. 실패는 E-INSTALL-READ-FAILED */
export async function latestInstallFiles(): Promise<Record<InstallKind, InstallFile | null>> {
  let files: LibraryFile[]
  try {
    files = await listLibraryFiles()
  } catch {
    throw new InstallFilesError('E-INSTALL-READ-FAILED')
  }
  return { helper: installOf(latestOfKind(files, 'helper')), extension: installOf(latestOfKind(files, 'extension')) }
}

/** 자료실에서 받아 원래 파일 이름으로 저장시킨다. 실패는 E-INSTALL-DOWNLOAD-FAILED */
export async function downloadInstallFile(file: InstallFile): Promise<void> {
  try {
    await downloadLibraryFile({ storagePath: file.path, fileName: file.name })
  } catch {
    throw new InstallFilesError('E-INSTALL-DOWNLOAD-FAILED')
  }
}

/** '0.14.0 · 1.2MB · 11월 25일 올림'(크기는 자료실과 같은 sizeText, 날짜는 한국 날짜) */
export function installMeta(file: InstallFile): string {
  return `${file.version.join('.')} · ${sizeText(file.size)} · ${dayText(file.uploadedAt)} 올림`
}
