import type { RxGroupLine } from '@/components/dashboard/summary/source'
import { groupCond, groupDefs, groupKey, groupOut } from '@/components/stats/treatmentView'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { loadSunapSettings } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { RxGroupDef } from '@/types/analysis'
import type { StatsRxGroup } from '@/types/rxGroups'

// 대시보드 '처방 상위'의 묶음 (spec bit-dashboard REQ-606, design.md '처방 상위 = 통계 탭 묶음'). 통계 탭 처방별 추세 묶음을 읽어 오기만 한다(AC-606.8).
// 열쇠·정의는 통계 탭의 groupKey·groupDefs를 그대로 쓴다(규칙을 두 벌 두지 않는다). summary 폴더의 불러오기 규칙(AC-311.8)과 고리를 피하려고 live에 둔다.
// 대시보드는 제안 묶음을 만들거나 저장하지 않는다(AC-606.4). 한도(10초)는 LiveDashboard가 건다.
// 물리치료 칸(spec desk-feedback AC-6302.1): 수납일지 [설정]의 물리치료 묶음 id(ptGroup)도 함께 읽어 그 묶음 열쇠(pt)를 더한다. 수납일지 '물리치료' 칸과 같은 기준이다

/** lines: 처방 든 묶음마다 이름·열쇠(통계 탭 차례). defs: 비트 읽기 requestLoad에 실을 묶음 정의(통계 탭과 같음, AC-606.7).
 * pt: 물리치료 묶음 열쇠(null = 안 고름·목록에 없음·코드 없음). 칸이 없으면 수납일지 설정을 모른다(읽지 못함) */
export type DashboardGroups = { lines: RxGroupLine[]; defs: RxGroupDef[]; pt?: string | null }

/** 수납일지와 같은 식(SunapScreen defOf): 그 id의 묶음 하나의 groupDefs 열쇠. 없거나 코드가 없으면 null */
function ptKeyOf(rows: readonly StatsRxGroup[], ptGroup: string | null): string | null {
  const group = ptGroup === null ? undefined : rows.find((item) => item.id === ptGroup)
  return group === undefined ? null : (groupDefs([group])[0]?.id ?? null)
}

/** 순수. sortOrder 차례로 처방 든 묶음만 한 줄씩. 받은 목록은 고치지 않는다.
 * 열쇠는 빼는 처방·조건까지 담은 groupKey라 defs의 같은 묶음 id와 같다(spec group-exclude AC-3705.5). 둘 다 없으면 지금 열쇠 그대로다.
 * ptGroup(수납일지 설정의 물리치료 묶음 id)을 주면 pt 칸이 생기고, 주지 않으면(undefined) pt 칸이 없다(AC-6302.1) */
export function toDashboardGroups(rows: readonly StatsRxGroup[], ptGroup?: string | null): DashboardGroups {
  const lines = [...rows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((group) =>
      group.codes.length === 0 ? [] : [{ name: group.name, key: groupKey(group.codes, { out: groupOut(group), cond: groupCond(group) }) }],
    )
  const groups: DashboardGroups = { lines, defs: groupDefs(rows) }
  return ptGroup === undefined ? groups : { ...groups, pt: ptKeyOf(rows, ptGroup) }
}

/** 수납일지 설정의 물리치료 묶음 id. 클라이언트 만들기·읽기·답 모양의 어떤 실패(바로 던짐 포함)도 undefined(모름)다 */
const readPtGroup = (): Promise<string | null | undefined> =>
  Promise.resolve()
    .then(() => loadSunapSettings(supabaseBrowser()))
    .then((settings) => settings.ptGroup)
    .catch(() => undefined)

/** 이 계정의 통계 탭 묶음과 수납일지 설정을 함께 한 번 읽는다. 묶음 읽기가 어디서 실패하든 null(AC-606.5).
 * 수납일지 설정 읽기만 실패하면 pt 칸 없이 묶음은 그대로다(AC-6302.1) */
export async function readDashboardGroups(): Promise<DashboardGroups | null> {
  const ptGroup = readPtGroup()
  try {
    const rows = await listStatsRxGroups()
    return toDashboardGroups(rows, await ptGroup)
  } catch {
    return null
  }
}
