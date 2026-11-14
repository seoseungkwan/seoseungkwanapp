import { addDays, compareYmd, diffDays, eachDay } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import type { RevenueRangeStore } from '@/lib/storage/revenue'
import type { DateRange } from '@/types/dates'
import { REVENUE_MAX_DAYS, type RevenueDaysResult, type SavedRevenueDay } from '@/types/revenue'

// 매출 읽기 계획과 차례(spec revenue design.md 7절 → specs/stats-revenue design.md '매출 읽기 차례'). 통로·저장소는 인자로만 받는다(call·store).
// 도우미는 한 번에 한 명령씩 처리하고 비트 DB에 부담을 주므로 덩어리는 늘 차례로 읽는다.
// 옛 매출 탭의 달 단위 가져오기 계획·차례는 지웠다(stats-revenue AC-4110.4)

/** 그 덩어리만 실패로 치고 다음 덩어리를 계속하는 번호: 읽기·검사·저장 오류 */
const MONTH_ONLY_CODES: ReadonlySet<string> = new Set(['E-BIT-READ-FAILED', 'E-BRIDGE-BAD-REPLY', 'E-REVENUE-SAVE-FAILED'])
const ERROR_CODE_SHAPE = /^E-[A-Z0-9-]+$/
/** 번호가 없는 오류(글은 화면·기록에 넘기지 않는다) */
const NO_CODE = 'E-PAGE-FAILED'

function codeOf(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : null
  return typeof code === 'string' && ERROR_CODE_SHAPE.test(code) ? code : NO_CODE
}

// ── 통계 매출의 빈 날 읽기(specs/stats-revenue design.md '매출 읽기 차례', REQ-4104) ──

/** 확인 필요한 날의 참고 금액(roughTotal)을 주는 첫 도우미(specs/first90 REQ-4405) */
const ROUGH_HELPER = '0.7.0'

/**
 * planRevenue에 넘기는 그날의 저장 표시(specs/first90 AC-4407.1·AC-4407.2). 참이면 '다 저장됨'이라 다시 읽지 않는다.
 * 지금은 dayCodes(날 단위 처방 금액이 있는지) 그대로다. 단, 확인 필요한 날인데 참고 금액이 없고(null·열쇠 없음) 연결된 도우미가 0.7.0 이상이면
 * 거짓(한 번 다시 읽음)이다. 0.7.0 미만·판을 모르면(연결 정보 없음·읽을 수 없는 판은 compareVersions가 가장 낮게 본다) 그대로 둔다: 옛 도우미로는 참고 금액을 얻지 못해 매번 다시 읽게 되기 때문이다
 */
export function savedMark(
  row: Pick<SavedRevenueDay, 'dayCodes' | 'unconfirmed' | 'roughTotal'>,
  helperVersion: string | null | undefined,
): boolean {
  const roughHelper = typeof helperVersion === 'string' && compareVersions(helperVersion, ROUGH_HELPER) >= 0
  return row.dayCodes && !(row.unconfirmed && typeof row.roughTotal !== 'number' && roughHelper)
}

/**
 * 불러올 기간 whole 가운데 매출을 읽을 날을 31일 이하 덩어리로 묶어 새것부터 준다(AC-4104.1).
 * 고르는 날(기간 첫날 ~ 마지막 끝난 날 = 어제, 오늘 진료 끝이면 오늘): 저장 줄이 없는 날 · 날 단위 처방 금액이 없는 날(saved 값 거짓) ·
 * 어제 · (진료 끝이면) 오늘. 어제·오늘은 진료 중에 읽었을 수 있어 늘 다시 읽는다. 고를 날이 없으면 빈 목록
 */
export function planRevenue(whole: DateRange, today: string, closeToday: boolean, saved: ReadonlyMap<string, boolean>): DateRange[] {
  const yesterday = addDays(today, -1)
  const lastDay = closeToday ? today : yesterday
  const to = compareYmd(whole.to, lastDay) <= 0 ? whole.to : lastDay
  const picked = eachDay({ from: whole.from, to }).filter(
    (day) => saved.get(day) !== true || day === yesterday || (closeToday && day === today),
  )

  // 새것부터 거꾸로 걸으며 이어진 날을 붙인다. 앞(옛) 날과 이어지지 않거나 31일이 차면 새 덩어리
  const ranges: DateRange[] = []
  for (const day of picked.reverse()) {
    const last = ranges.at(-1)
    if (last && last.from === addDays(day, 1) && diffDays(day, last.to) < REVENUE_MAX_DAYS) last.from = day
    else ranges.push({ from: day, to: day })
  }
  return ranges
}

export type RangeSyncResult = {
  /** 멈춘 번호(남은 덩어리는 부르지 않았다). 끝까지 갔으면 null */
  stopped: string | null
  /** 그 덩어리만 실패한 것(차례대로) */
  failed: { range: DateRange; code: string }[]
  /** 받은 답 가운데 dayCodes가 없는 것이 있었다(도우미 예전 판) */
  noDayCodes: boolean
}

/**
 * 덩어리를 한 번에 하나씩 revenue.days → 저장한다(AC-4104.2). 읽기·검사·저장 오류(MONTH_ONLY_CODES)는 그 덩어리만 실패로 적고 계속,
 * 그 밖 번호는 거기서 멈춘다. 덩어리가 끝날 때마다(실패한 덩어리 포함, 멈춘 덩어리 빼고) 진행(한 것/모두)을 알린다. 번호 없는 오류의 글은 옮기지 않는다
 */
export async function syncRanges(deps: {
  call: (range: DateRange) => Promise<RevenueDaysResult>
  store: Pick<RevenueRangeStore, 'saveRange'>
  ranges: readonly DateRange[]
  onProgress?: (p: { done: number; total: number }) => void
}): Promise<RangeSyncResult> {
  const { call, store, ranges, onProgress } = deps
  const failed: RangeSyncResult['failed'] = []
  let noDayCodes = false

  for (const [index, range] of ranges.entries()) {
    try {
      const result = await call(range)
      if (result.dayCodes === undefined) noDayCodes = true
      await store.saveRange(range, result)
    } catch (error) {
      const code = codeOf(error)
      if (!MONTH_ONLY_CODES.has(code)) return { stopped: code, failed, noDayCodes }
      failed.push({ range, code })
    }
    onProgress?.({ done: index + 1, total: ranges.length })
  }
  return { stopped: null, failed, noDayCodes }
}
