import { todayInKorea } from '@/lib/analytics/dates'

// 자료실 순수 함수 (specs/library design.md '순수 함수', REQ-8102).
// 판 번호 읽기·분류 짐작·크기와 날짜 글자·표 줄 만들기·고른 파일 검사. 결과는 승인 시안 docs/mockups/library/index.html과 같다.
// React·supabase·네트워크·저장소·시계를 쓰지 않는다(files.test.ts가 소스 글자로도 본다)

export type LibraryCategory = 'install' | 'guide' | 'other'
export type VersionKind = 'helper' | 'extension'
export type LibraryFile = {
  id: string
  /** 올릴 때의 파일 이름 — 판 묶기·받을 때 저장 이름 */
  fileName: string
  /** 목록에 보이는 이름 */
  name: string
  category: LibraryCategory
  description: string
  /** 바구니 library 안 이름(uuid) */
  storagePath: string
  size: number
  createdAt: string
}

/** 한 파일 한도(50MB) — 바구니 file_size_limit·표 size 제약과 같다 */
export const LIBRARY_MAX_BYTES = 52_428_800
export const DESCRIPTION_MAX = 60
/** 파일 이름·보이는 이름 길이 한도 — 표 file_name·name 제약과 같다 */
export const NAME_MAX = 200
export const CATEGORY_LABEL: Record<LibraryCategory, string> = { install: '설치 파일', guide: '설명서', other: '그 밖' }
/** 받기 단추 이름 [{…} 내려받기] */
export const KIND_LABEL: Record<VersionKind, string> = { helper: '도우미', extension: '확장' }

const KB = 1024
const MB = 1024 * 1024
// 판 번호 붙은 설치 파일(옛 install-files 보관함 이름 규칙과 같다): 판은 숫자 셋, 1~3자리
const VERSION_NAME = /^precheck-(helper|extension)-([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.zip$/
const INSTALL_END = /\.(zip|exe|msi|crx)$/i
const GUIDE_END = /\.(pdf|hwp|hwpx|docx?|pptx?)$/i

/** 'precheck-helper-0.14.0.zip' → { kind: 'helper', version: [0, 14, 0] }. 모양이 다르면 null */
export function versionOf(fileName: string): { kind: VersionKind; version: [number, number, number] } | null {
  const m = VERSION_NAME.exec(fileName)
  if (!m) return null
  return { kind: m[1] as VersionKind, version: [Number(m[2]), Number(m[3]), Number(m[4])] }
}

/** 판을 숫자로 견준다(0.10.0 > 0.9.0). a가 높으면 양수 */
export function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 파일 끝으로 분류를 먼저 골라 둔다(대소문자 무시). 사람이 바꿀 수 있다 */
export function guessCategory(fileName: string): LibraryCategory {
  if (INSTALL_END.test(fileName)) return 'install'
  if (GUIDE_END.test(fileName)) return 'guide'
  return 'other'
}

/** 921,600바이트(900KB) 이상은 MB 소수 한 자리, 아래는 KB 반올림(적어도 1KB). 1KB = 1,024바이트 */
export function sizeText(bytes: number): string {
  if (bytes >= 900 * KB) return mbText(bytes)
  return `${Math.max(1, Math.round(bytes / KB))}KB`
}

/** 늘 MB 소수 한 자리(올리는 중 '보낸 / 전체') */
export function mbText(bytes: number): string {
  return `${(bytes / MB).toFixed(1)}MB`
}

/** 올린 시각 → 한국 날짜 'M월 D일' */
export function dayText(iso: string): string {
  const [, month, day] = todayInKorea(new Date(iso)).split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

export type LibraryFilter = 'all' | LibraryCategory

/** 전체·분류마다 파일 수(옛 판 포함) */
export function categoryCounts(files: readonly LibraryFile[]): Record<LibraryFilter, number> {
  const counts: Record<LibraryFilter, number> = { all: files.length, install: 0, guide: 0, other: 0 }
  for (const f of files) counts[f.category] += 1
  return counts
}

export type LibraryRow =
  | { type: 'file'; file: LibraryFile; latest: boolean; old: boolean; hasOld: boolean }
  | { type: 'toggle'; kind: VersionKind; count: number; open: boolean }

type Versioned = { file: LibraryFile; version: readonly number[] }

/** 판 번호 붙은 파일을 종류마다 판 높은 차례로 묶는다 */
function versionGroups(files: readonly LibraryFile[]): Record<VersionKind, Versioned[]> {
  const groups: Record<VersionKind, Versioned[]> = { helper: [], extension: [] }
  for (const file of files) {
    const v = versionOf(file.fileName)
    if (v) groups[v.kind].push({ file, version: v.version })
  }
  for (const group of Object.values(groups)) group.sort((a, b) => compareVersions(b.version, a.version))
  return groups
}

/** 올린 시각 늦은 것 먼저, 같으면 파일 이름 차례 */
function newestFirst(a: LibraryFile, b: LibraryFile): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  if (diff !== 0 && !Number.isNaN(diff)) return diff
  return a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0
}

/**
 * 표 줄(시안 tableBody). 분류로 거른 뒤 올린 시각 늦은 차례로 두고, 판 번호 파일은 거른 줄 안에서 종류마다
 * 가장 높은 판이 자기 자리에 latest 줄 + (옛 판이 있으면) 접기 줄 하나 + (펼쳤으면) 판 높은 차례의 옛 판 줄이다.
 * 옛 판은 제자리에 다시 그리지 않는다
 */
export function libraryRows(files: readonly LibraryFile[], filter: LibraryFilter, open: ReadonlySet<VersionKind>): LibraryRow[] {
  const shown = files.filter((f) => filter === 'all' || f.category === filter).sort(newestFirst)
  const groups = versionGroups(shown)
  const rows: LibraryRow[] = []
  for (const file of shown) {
    const v = versionOf(file.fileName)
    if (!v) {
      rows.push({ type: 'file', file, latest: false, old: false, hasOld: false })
      continue
    }
    const [top, ...olds] = groups[v.kind]
    if (top.file !== file) continue
    rows.push({ type: 'file', file, latest: true, old: false, hasOld: olds.length > 0 })
    if (olds.length === 0) continue
    const isOpen = open.has(v.kind)
    rows.push({ type: 'toggle', kind: v.kind, count: olds.length, open: isOpen })
    if (isOpen) for (const o of olds) rows.push({ type: 'file', file: o.file, latest: false, old: true, hasOld: false })
  }
  return rows
}

/** 분류와 상관없이 그 종류 가장 높은 판(없으면 null) — 비트 PC 연결 받기 단추가 주는 판 */
export function latestOfKind(files: readonly LibraryFile[], kind: VersionKind): LibraryFile | null {
  return versionGroups(files)[kind][0]?.file ?? null
}

/** 지울 파일이 그 종류 최신이면 { kind, next: 다음 높은 판 또는 null }, 아니면 null(확인 창 둘째 문장) */
export function deleteNote(files: readonly LibraryFile[], file: LibraryFile): { kind: VersionKind; next: LibraryFile | null } | null {
  const v = versionOf(file.fileName)
  if (!v) return null
  const [top, next] = versionGroups(files)[v.kind]
  if (top?.file.id !== file.id) return null
  return { kind: v.kind, next: next?.file ?? null }
}

/**
 * 고른 파일 검사(네트워크 없음). 크기 → 파일 이름 길이 → 같은 파일 이름 차례로 먼저 걸린 하나, 없으면 null.
 * 이름 길이는 DB char_length처럼 글자(코드 포인트) 수로 센다
 */
export function pickProblem(
  picked: { name: string; size: number },
  files: readonly LibraryFile[],
): 'E-LIBRARY-FILE-SIZE' | 'E-LIBRARY-FILE-NAME' | 'E-LIBRARY-FILE-EXISTS' | null {
  if (picked.size > LIBRARY_MAX_BYTES) return 'E-LIBRARY-FILE-SIZE'
  if (Array.from(picked.name).length > NAME_MAX) return 'E-LIBRARY-FILE-NAME'
  if (files.some((f) => f.fileName === picked.name)) return 'E-LIBRARY-FILE-EXISTS'
  return null
}
