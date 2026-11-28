import { isBlankMemo } from '@/lib/precheck/memoCompare'
import type { InputTargets, TargetRow } from '@/types/precheck'
import type { CopyStatus } from '../rows/MemoDetail'
import type { ListGroup, Show } from '../rows/MemoList'
import { BATCH_NAME, LEFT_GROUPS, LIST_ORDER } from '../rows/leftGroups'

// 두 칸 보기의 목록 펼치기·옮기기·상태 줄 고르기(claim-learn AC-9307.1·AC-9314.1, AC-3101.2·AC-3101.3·AC-3101.5·AC-3101.6·AC-3101.8·AC-3102.2·AC-3103.5~AC-3103.8, design.md memo-split).
// 묶음·까닭·차례는 Worker의 inputTargets가 정했다. 여기는 그 결과를 목록 차례로 펼치고 걸러 보기만 한다. 순수 함수다

const hasHoles = (row: TargetRow) => (row.holes ?? 0) > 0

/**
 * 묶음 전체(보기로 거르기 전): 입력할 사람 먼저, 그다음 LIST_ORDER(AC-3101.2).
 * 빈칸([… 확인]) 있는 사람이 있으면 그 사람이 든 확인 필요 묶음이 맨 위이고 그 안에서 빈칸 있는 사람이 먼저다(claim-learn AC-9307.1, design.md 10절).
 * 빈칸 있는 사람이 없으면 차례는 지금 그대로다. 묶음 안 차례는 Worker가 정한 차례를 지킨다(안정 정렬)
 * 입력할 사람 줄에는 거르기 전 차례(no, 1부터)를 싣는다: 보기로 걸러도 목록 번호가 상세 머리의 {i}(positionOf)와 같다(AC-3101.3)
 */
function allGroups(targets: InputTargets): ListGroup[] {
  const groups: ListGroup[] = []
  if (targets.batch.length > 0) groups.push({ id: 'batch', name: BATCH_NAME, rows: targets.batch.map((row, index) => ({ ...row, no: index + 1 })), total: targets.batch.length })
  for (const reason of LIST_ORDER) {
    const rows = targets.left.find((group) => group.reason === reason)?.rows ?? []
    if (rows.length === 0) continue
    if (reason === 'mark' && rows.some(hasHoles)) {
      groups.unshift({ id: reason, name: LEFT_GROUPS[reason].name, rows: [...rows.filter(hasHoles), ...rows.filter((row) => !hasHoles(row))], total: rows.length })
      continue
    }
    groups.push({ id: reason, name: LEFT_GROUPS[reason].name, rows, total: rows.length })
  }
  return groups
}

const fits = (row: TargetRow, show: Show) => show === 'all' || (show === 'done') === row.done

/** 목록 묶음. 보기로 거르되 머물 사람(stayKey: 고른 채 완료가 바뀐 사람)은 남긴다(AC-3101.5·AC-3101.6). 사람이 없는 묶음은 뺀다 */
export function listGroups(targets: InputTargets, show: Show, stayKey: string | null): ListGroup[] {
  return allGroups(targets)
    .map((group) => ({ ...group, rows: group.rows.filter((row) => fits(row, show) || row.key === stayKey) }))
    .filter((group) => group.rows.length > 0)
}

/** [전체 · 미완료 · 완료]의 수: 지금 고른 조건 안의 사람 수(AC-3101.5) */
export function showCounts(targets: InputTargets): Record<Show, number> {
  const rows = allGroups(targets).flatMap((group) => group.rows)
  const done = rows.filter((row) => row.done).length
  return { all: rows.length, todo: rows.length - done, done }
}

const order = (groups: readonly ListGroup[]) => groups.flatMap((group) => group.rows.map((row) => row.key))

/** 보이는 차례의 앞·뒤 사람(AC-3102.2). 없으면 null */
export function neighbor(groups: readonly ListGroup[], key: string, step: 1 | -1): string | null {
  const keys = order(groups)
  const at = keys.indexOf(key)
  if (at < 0) return null
  return keys[at + step] ?? null
}

/** 고를 사람: 지금 사람이 목록에 있으면 그대로, 아니면 맨 위(AC-3101.8) */
export function keepOrFirst(groups: readonly ListGroup[], key: string | null): string | null {
  const keys = order(groups)
  if (key !== null && keys.includes(key)) return key
  return keys[0] ?? null
}

/** 상세 머리의 '{묶음 이름} {i} / {n}'(AC-3105.1): 보기로 거르기 전 묶음에서 몇째인가 */
export function positionOf(targets: InputTargets, key: string): { id: ListGroup['id']; name: string; index: number; total: number } | null {
  for (const group of allGroups(targets)) {
    const at = group.rows.findIndex((row) => row.key === key)
    if (at >= 0) return { id: group.id, name: group.name, index: at + 1, total: group.total }
  }
  return null
}

/** 우리 메모 글이 있고 확인 표시가 없을 때만 복사할 수 있다(AC-3103.5) */
export const canCopy = (row: TargetRow) => row.hasMemo && !isBlankMemo(row.text) && !row.unfinished

/**
 * 상태 줄 하나(AC-3103.2·AC-3103.3·AC-3103.5~AC-3103.8·AC-3104.6).
 * 차례: 고치는 중 > 입력 중 > 저장 막힘 > 설정 바뀜(claim-learn AC-9314.1) > 복사 실패(완료였으면 다시 복사 실패) > 완료 풀림 > 메모 없음 > 확인 표시 > 방금 복사함(완료일 때) > 완료 > 보통
 */
export function copyStatus({ row, editing, failed, reopened, justCopied, locked, storeStuck, stale = false }: { row: TargetRow; editing: boolean; failed: boolean; reopened: boolean; justCopied: boolean; locked: boolean; storeStuck: boolean; stale?: boolean }): CopyStatus {
  if (editing) return 'editing'
  if (locked) return 'locked'
  if (storeStuck) return 'stuck'
  if (stale) return 'stale'
  if (failed) return row.done ? 'failedAgain' : 'failed'
  if (reopened) return 'reopened'
  if (!row.hasMemo || isBlankMemo(row.text)) return 'none'
  if (row.unfinished) return 'mark'
  if (row.done) return justCopied ? 'copied' : 'done'
  return 'ready'
}
