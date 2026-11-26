import { compareYmd, eachDay } from '@/lib/analytics/dates'
import { shownStatus } from './rules'
import type { CalAllDay, CalCountRow, MonthCell, MonthRate, RateCounts, RateRow, RateSummary } from './shapes'

// 월 보기 수·취소/변경/안 옴 수(spec clinic-calendar AC-5902.5·AC-5907.1). 순수 함수다.
// 월 칸은 취소를 세지 않는다(변경도 취소 뺌). 요약 줄·통계는 취소도 센다: 예약 = 기간의 줄(취소 포함, 지운 것은 이미 없음)

// gMoved(구글에서 변경 색이 됨, google-link AC-8503.4)는 처음 자리처럼 '변경'에 센다. 칸이 없는 줄(옛 모양)은 거짓으로 본다.
// 구글과 이은 병원(linked, 예약 탭 월 보기·요약 줄만 — google-link AC-8545.1)은 gMoved만 '변경'이다. 통계 탭·월간 보고·의원 비교는 기본값(거짓) 그대로(AC-8545.3)
type Moved = { gMoved?: boolean }
type MonthInput = Pick<CalCountRow, 'day' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay'> & Moved
type RateInput = Pick<CalCountRow, 'staffId' | 'staffName' | 'kindId' | 'kindName' | 'status' | 'auto' | 'origDay'> & Moved

export const NO_RATE = '–'
/** 시행자 없는 예약(시행자 세 칸 null)의 묶음 id·이름(시행자별 표·다시 예약, google-link design.md 10-1) */
export const NO_STAFF_ID = ''
export const NO_STAFF_LABEL = '시행자 없음'

/** 변경 = 처음 자리가 있거나 구글에서 변경 색이 됨. 이은 병원(linked)은 gMoved만 */
const isMoved = (row: Pick<CalCountRow, 'origDay'> & Moved, linked: boolean) => row.gMoved === true || (!linked && Boolean(row.origDay))

/** part ÷ whole → '33.3%'(소수 첫째 자리 반올림, 통계 sunapPct와 같은 규칙). whole이 0이면 '–' */
export function ratePct(part: number, whole: number): string {
  if (whole === 0) return NO_RATE
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`
}

/** from~to 날마다 한 칸(날짜 차례). 예약 수·종류별 수(많은 차례)·변경은 취소를 뺀 수, 안 옴은 오늘 전 날만 세고 그 밖은 null.
 * 종일 항목은 그날 것 그대로. linked = 구글과 이은 병원(변경은 gMoved만) */
export function monthCells<A extends Pick<CalAllDay, 'day'>>(
  appts: readonly MonthInput[],
  allday: readonly A[],
  from: string,
  to: string,
  today: string,
  linked = false,
): MonthCell<A>[] {
  const cells = new Map<string, MonthCell<A>>(
    eachDay({ from, to }).map((day) => [day, { day, total: 0, kinds: [], noshow: compareYmd(day, today) < 0 ? 0 : null, moved: 0, allday: [] }]),
  )
  for (const a of appts) {
    const cell = cells.get(a.day)
    if (!cell || a.status === 'cancel') continue
    cell.total++
    const kind = cell.kinds.find((k) => k.kindId === a.kindId)
    if (kind) kind.n++
    else cell.kinds.push({ kindId: a.kindId, kindName: a.kindName, n: 1 })
    if (isMoved(a, linked)) cell.moved++
    if (cell.noshow !== null && shownStatus(a) === 'noshow') cell.noshow++
  }
  for (const item of allday) cells.get(item.day)?.allday.push(item)
  const out = [...cells.values()]
  for (const cell of out) cell.kinds.sort((x, y) => y.n - x.n) // 같은 수는 먼저 나온 차례(안정 정렬)
  return out
}

const zero = (): RateCounts => ({ total: 0, cancel: 0, moved: 0, noshow: 0 })

function add(counts: RateCounts, row: Pick<CalCountRow, 'status' | 'auto' | 'origDay'> & Moved, linked = false): void {
  counts.total++
  if (row.status === 'cancel') counts.cancel++
  if (isMoved(row, linked)) counts.moved++
  if (shownStatus(row) === 'noshow') counts.noshow++
}

/** 기간 예약의 예약·취소·변경·안 옴 수와 시행자별·종류별 같은 네 수. 표는 예약 많은 차례(같으면 먼저 나온 차례),
 * 이름은 그 id의 마지막(가장 늦은) 줄에 저장된 이름 — 지운 시행자·종류도 그 이름 그대로 나온다. 시행자 없는 예약은 '시행자 없음' 한 줄(NO_STAFF_ID).
 * linked = 구글과 이은 병원의 예약 탭 요약 줄(변경은 gMoved만). 통계 탭·월간 보고·의원 비교는 기본값 */
export function rateSummary(rows: readonly RateInput[], linked = false): RateSummary {
  const total = zero()
  const byStaff = new Map<string, RateRow>()
  const byKind = new Map<string, RateRow>()
  const group = (map: Map<string, RateRow>, id: string, label: string, row: RateInput) => {
    const r = map.get(id) ?? { id, label, ...zero() }
    r.label = label
    add(r, row, linked)
    map.set(id, r)
  }
  for (const row of rows) {
    add(total, row, linked)
    group(byStaff, row.staffId ?? NO_STAFF_ID, row.staffId === null ? NO_STAFF_LABEL : (row.staffName ?? NO_STAFF_LABEL), row)
    group(byKind, row.kindId, row.kindName, row)
  }
  const ranked = (map: Map<string, RateRow>) => [...map.values()].sort((a, b) => b.total - a.total)
  return { ...total, byStaff: ranked(byStaff), byKind: ranked(byKind) }
}

/** 준 달('YYYY-MM') 차례로 달마다 네 수. 준 달 밖 줄은 뺀다 */
export function monthTrend(rows: readonly (RateInput & Pick<CalCountRow, 'day'>)[], months: readonly string[]): MonthRate[] {
  const byMonth = new Map<string, MonthRate>(months.map((month) => [month, { month, ...zero() }]))
  for (const row of rows) {
    const m = byMonth.get(row.day.slice(0, 7))
    if (m) add(m, row)
  }
  return [...byMonth.values()]
}
