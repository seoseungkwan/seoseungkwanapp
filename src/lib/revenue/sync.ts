import { addDays, addMonths, compareYmd, eachDay, monthOf, monthRange } from '@/lib/analytics/dates'
import type { RevenueStore } from '@/lib/storage/revenue'
import type { DateRange } from '@/types/dates'
import type { RevenueDaysResult } from '@/types/revenue'
import { firstMonth } from './summary'

// 매출 가져오기 계획과 차례(spec revenue design.md 7절, REQ-007). 통로·저장소는 인자로만 받는다(call·store).
// 도우미는 한 번에 한 명령씩 처리하고 비트 DB에 부담을 주므로 달은 늘 차례로 가져온다.

const MONTHS_TO_FETCH = 13
/** 가져올 기간(spec revenue-load-range): 최근 1년(13달)·최근 2년(25달)·전체 기간(ALL_FROM_MONTH부터) */
export type FetchSpan = '1y' | '2y' | 'all'
export const ALL_FROM_MONTH = '2020-01'
/** 그 달만 실패로 치고 다음 달을 계속하는 번호: 읽기·검사·저장 오류 */
const MONTH_ONLY_CODES: ReadonlySet<string> = new Set(['E-BIT-READ-FAILED', 'E-BRIDGE-BAD-REPLY', 'E-REVENUE-SAVE-FAILED'])
const HELPER_OLD_CODE = 'E-HELPER-UNKNOWN-COMMAND'
/** 옛 확장은 모르는 명령을 막는다 */
const EXTENSION_OLD_CODE = 'E-BRIDGE-REJECTED'
const ERROR_CODE_SHAPE = /^E-[A-Z0-9-]+$/
/** 번호가 없는 오류(글은 화면·기록에 넘기지 않는다) */
const NO_CODE = 'E-PAGE-FAILED'

// 그 달에 와야 할 기간: 1일 ~ 말일과 어제 가운데 이른 날. 아직 올 날이 없는 달은 끝이 시작보다 앞이다
function dueRange(month: string, today: string): DateRange {
  const { from, to } = monthRange(month)
  const yesterday = addDays(today, -1)
  return { from, to: compareYmd(to, yesterday) <= 0 ? to : yesterday }
}

/** 어제가 속한 달부터 거꾸로 months달(기본 13달) 가운데 와야 할 날이 하나라도 없는 달. 최근 달부터, 달마다 전체 기간(코드 합계가 달 전체여야 해서) */
export function planFetch(today: string, savedDays: ReadonlySet<string>, months: number = MONTHS_TO_FETCH): DateRange[] {
  const latest = firstMonth(today)
  return Array.from({ length: months }, (_, back) => dueRange(addMonths(latest, -back), today)).filter((range) =>
    eachDay(range).some((day) => !savedDays.has(day)),
  )
}

/** 고른 기간의 달 수(최근 달 포함). 전체 기간은 ALL_FROM_MONTH ~ 최근 달(오늘이 1일이면 지난달) */
export function spanMonths(span: FetchSpan, today: string): number {
  if (span === '1y') return MONTHS_TO_FETCH
  if (span === '2y') return 25
  // 날짜 계산은 dates.ts로만: 최근 달에서 한 달씩 거꾸로 세어 ALL_FROM_MONTH까지('YYYY-MM'은 글자 순서가 곧 달 순서)
  const latest = firstMonth(today)
  let count = 1
  while (addMonths(latest, -count) >= ALL_FROM_MONTH) count++
  return count
}

export type SyncResult = { stopped: string | null; failed: { month: string; code: string }[]; helperOld: boolean; extensionOld: boolean }

type SyncCommon = {
  call: (args: { from: string; to: string }) => Promise<RevenueDaysResult>
  store: RevenueStore
  today: string
  onProgress?: (p: { done: number; total: number; month: string }) => void
}

/** months를 주면([다시 가져오기]) 그 달들만, 없으면 savedDays로 planFetch */
export type SyncDeps = SyncCommon & ({ months: string[]; savedDays?: ReadonlySet<string> } | { months?: undefined; savedDays: ReadonlySet<string> })

function codeOf(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : null
  return typeof code === 'string' && ERROR_CODE_SHAPE.test(code) ? code : NO_CODE
}

export async function syncRevenue(deps: SyncDeps): Promise<SyncResult> {
  const { call, store, today, onProgress } = deps
  // 끝이 시작보다 앞인 기간은 도우미가 E-HELPER-BAD-MESSAGE로 막아 가져오기 전체가 멈추므로 부르지 않는다
  const ranges = deps.months
    ? deps.months.map((month) => dueRange(month, today)).filter((range) => compareYmd(range.from, range.to) <= 0)
    : planFetch(today, deps.savedDays)
  const failed: SyncResult['failed'] = []
  const result = (over: Partial<SyncResult> = {}): SyncResult => ({ stopped: null, failed, helperOld: false, extensionOld: false, ...over })

  for (const [index, range] of ranges.entries()) {
    const month = monthOf(range.from)
    try {
      await store.saveMonth(month, await call(range))
    } catch (error) {
      const code = codeOf(error)
      if (code === HELPER_OLD_CODE) return result({ helperOld: true })
      if (code === EXTENSION_OLD_CODE) return result({ extensionOld: true })
      if (!MONTH_ONLY_CODES.has(code)) return result({ stopped: code })
      failed.push({ month, code })
    }
    onProgress?.({ done: index + 1, total: ranges.length, month })
  }
  return result()
}
