import type { RxGroupLine } from '@/components/dashboard/summary/source'
import { groupCond, groupDefs, groupKey, groupOut } from '@/components/stats/treatmentView'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { RxGroupDef } from '@/types/analysis'
import type { StatsRxGroup } from '@/types/rxGroups'

// 대시보드 '처방 상위'의 묶음 (spec bit-dashboard REQ-606, design.md '처방 상위 = 통계 탭 묶음'). 통계 탭 처방별 추세 묶음을 읽어 오기만 한다(AC-606.8).
// 열쇠·정의는 통계 탭의 groupKey·groupDefs를 그대로 쓴다(규칙을 두 벌 두지 않는다). summary 폴더의 불러오기 규칙(AC-311.8)과 고리를 피하려고 live에 둔다.
// 대시보드는 제안 묶음을 만들거나 저장하지 않는다(AC-606.4). 한도(10초)는 LiveDashboard가 건다

/** lines: 처방 든 묶음마다 이름·열쇠(통계 탭 차례). defs: 비트 읽기 requestLoad에 실을 묶음 정의(통계 탭과 같음, AC-606.7) */
export type DashboardGroups = { lines: RxGroupLine[]; defs: RxGroupDef[] }

/** 순수. sortOrder 차례로 처방 든 묶음만 한 줄씩. 받은 목록은 고치지 않는다.
 * 열쇠는 빼는 처방·조건까지 담은 groupKey라 defs의 같은 묶음 id와 같다(spec group-exclude AC-3705.5). 둘 다 없으면 지금 열쇠 그대로다 */
export function toDashboardGroups(rows: readonly StatsRxGroup[]): DashboardGroups {
  const lines = [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) =>
      group.codes.length === 0 ? [] : [{ name: group.name, key: groupKey(group.codes, { out: groupOut(group), cond: groupCond(group) }) }],
    )
  return { lines, defs: groupDefs(rows) }
}

/** 이 계정의 통계 탭 묶음을 한 번 읽는다. 어디서 실패하든 null(AC-606.5) */
export async function readDashboardGroups(): Promise<DashboardGroups | null> {
  try {
    return toDashboardGroups(await listStatsRxGroups())
  } catch {
    return null
  }
}
