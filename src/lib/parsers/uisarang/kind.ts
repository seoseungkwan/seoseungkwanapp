import type { Grid } from '@/types/parse'
import type { UisKind } from '@/types/uisarang'
import { squash } from './cells'

// 엑셀 종류 알아보기(specs/uisarang-upload design.md §3-1) [환자 자료 구역]. 머리 줄 칸 이름으로만 정한다 — 파일 이름은 보지 않는다

/** 머리 줄을 찾는 위쪽 줄 수 */
export const HEADER_SCAN_ROWS = 30

/** 줄을 읽는 종류(예약환자통계 둘은 건너뛴다) */
export type ReadKind = Exclude<UisKind, 'rsv' | 'rsvPatients'>

const KINDS: ReadonlyArray<{ kind: UisKind; need: readonly string[]; not: readonly string[] }> = [
  { kind: 'income', need: ['보험구분', '진료수납액'], not: [] },
  { kind: 'rx', need: ['코드', '처방명칭', '총액'], not: [] },
  { kind: 'visits', need: ['내원일', '인원수', '신규환자'], not: ['차트번호'] },
  { kind: 'visitPatients', need: ['차트번호', '신규환자'], not: ['예약일'] },
  { kind: 'rsv', need: ['예약일', '예약건수'], not: ['차트번호'] },
  { kind: 'rsvPatients', need: ['예약일', '차트번호', '방문여부'], not: [] },
]

/** 종류마다 읽는 칸(design.md §4). 이 칸이 머리 줄에 없거나 둘이면 E-UIS-COLUMN. 그 밖 칸(이름·전화·주소 …)은 읽지 않는다 */
export const READ_COLUMNS: Readonly<Record<ReadKind, readonly string[]>> = {
  income: ['보험구분', '총진료비', '급여총액', '청구액', '진료수납액', '본인부담금', '비급여', '인원계', '현금수납액', '카드수납액'],
  rx: ['코드', '처방명칭', '총투여량', '총액'],
  visits: ['내원일', '인원수', '신규환자'],
  visitPatients: ['차트번호', '주민등록번호', '신규환자'],
}

/** at = 머리 줄 차례(0부터) · header = 칸마다 빈칸을 뺀 이름(이름 없는 칸은 '') */
export type HeaderHit = { kind: UisKind; at: number; header: string[] }

/**
 * 위 30줄 안에서 어느 종류의 꼭 있는 칸을 모두 갖고 없어야 하는 칸은 없는 첫 줄.
 * 한 줄이 두 종류에 맞거나 서로 다른 줄에서 두 종류가 맞으면 null(모름). 같은 종류의 머리 줄이 되풀이되면 첫 줄
 */
export function findHeader(grid: Grid): HeaderHit | null {
  let hit: HeaderHit | null = null
  const end = Math.min(grid.length, HEADER_SCAN_ROWS)
  for (let at = 0; at < end; at++) {
    const header = grid[at].map(squash)
    const names = new Set(header)
    const kinds = KINDS.filter((k) => k.need.every((name) => names.has(name)) && !k.not.some((name) => names.has(name)))
    if (kinds.length === 0) continue
    if (kinds.length > 1) return null
    if (hit === null) hit = { kind: kinds[0].kind, at, header }
    else if (hit.kind !== kinds[0].kind) return null
  }
  return hit
}

/** 읽는 칸의 자리. 없거나 둘인 칸은 읽는 칸 차례로 columns에(머리 칸 이름만 — 환자 글자가 아니다) */
export function columnIndex(
  header: readonly string[],
  names: readonly string[],
): { ok: true; index: Record<string, number> } | { ok: false; columns: string[] } {
  const index: Record<string, number> = {}
  const columns: string[] = []
  for (const name of names) {
    const at = header.indexOf(name)
    if (at === -1 || header.indexOf(name, at + 1) !== -1) columns.push(name)
    else index[name] = at
  }
  return columns.length > 0 ? { ok: false, columns } : { ok: true, index }
}
