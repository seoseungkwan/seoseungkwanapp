import { compareYmd, isYmd } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import type { DayCount, VisitMemo } from '@/types/precheck'
import { dayMemoCounts } from './memoCompare'

// 날짜별 건수(REQ-019) [환자 자료 구역]. 환자 줄을 받아 날짜와 정수만 내놓는다. 서버로 가는 것은 이 다섯 칸과 화면이 붙이는 진료 수뿐이다(ADR-021, AC-019.3).
// 올리기와 모양 검사는 lib/storage/claimCounts.ts, 재시도는 components/claim/useCountsUpload.ts가 맡는다

export type { DayCount }

/**
 * dayCounts의 재료. rows는 고른 기간의 비교 줄(visitMemos), finished는 입력을 마친 사람(완료 표시·입력 기록 done),
 * results는 이번 입력의 결과(내원번호 → '확인 필요'·'건너뜀'). 완료한 사람은 비트 메모를 다시 읽기 전까지 비교가 그대로라 finished로 안다
 */
export type CountsView = { rows: readonly VisitMemo[]; finished: ReadonlySet<string>; results: ReadonlyMap<string, string> }

/** 입력 기록의 마지막 상태(AC-017.7) 가운데 사람이 봐야 하는 것 */
const CHECK_STATES: ReadonlySet<string | undefined> = new Set(['check', 'writing', 'writeUnconfirmed'])
const SKIP_STATES: ReadonlySet<string | undefined> = new Set(['skipped', 'skippedByHand'])

/**
 * 날짜마다 {visit_date, need_memo, entered, needs_check, skipped}(AC-019.3). 메모가 필요한 진료만 센다: 입력 수가 메모 필요 수를 넘으면 DB 제약이 거절한다(AC-019.2).
 * 한 사람은 한 칸에만 든다: 입력됨 → 확인 필요 → 건너뜀. 이번 결과가 입력 기록보다 앞서고, 비트에 다른 메모가 있는 사람(이미 있음)은 건너뜀이다.
 * 조회 못함은 어느 칸에도 넣지 않는다(남은 일이다). 줄이 없으면 빈 목록이다
 */
export function dayCounts({ rows, finished, results }: CountsView): DayCount[] {
  const memo = dayMemoCounts(rows.map((row) => (finished.has(row.key) ? { ...row, compare: '같음' as const } : row)))
  const counts = new Map(memo.map((day): [string, DayCount] => [day.date, { visit_date: day.date, need_memo: day.needMemo, entered: day.entered, needs_check: 0, skipped: 0 }]))
  for (const row of rows) {
    if (!row.hasMemo || row.compare === '같음' || finished.has(row.key)) continue
    const count = counts.get(row.date)!
    const result = results.get(row.key)
    if (result === '확인 필요' || (result === undefined && CHECK_STATES.has(row.lastJournal))) count.needs_check++
    else if (result === '건너뜀' || SKIP_STATES.has(row.lastJournal) || row.compare === '다름') count.skipped++
  }
  return [...counts.values()].sort((a, b) => compareYmd(a.visit_date, b.visit_date))
}

/** 받은 메시지가 건수이면 번호·줄·고른 기간(줄의 모양 검사는 올리기 전에 한다), 아니면 null */
export function readCountsMessage(data: unknown): { load: number; rows: unknown[]; range: DateRange } | null {
  if (typeof data !== 'object' || data === null) return null
  const { type, load, rows, range } = data as { type?: unknown; load?: unknown; rows?: unknown; range?: unknown }
  if (type !== 'dayCounts' || !Number.isSafeInteger(load) || !Array.isArray(rows) || typeof range !== 'object' || range === null) return null
  const { from, to } = range as { from?: unknown; to?: unknown }
  if (typeof from !== 'string' || typeof to !== 'string' || !isYmd(from) || !isYmd(to)) return null
  return { load: load as number, rows, range: { from, to } }
}
