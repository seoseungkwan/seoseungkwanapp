// 날마다 받은 도우미 답(날짜 차례) + 설정 → 'ERP 마감일지 입력 목록' 표 모양(spec erp-copy-list design.md 4절, REQ-3904)
// - 칸 값·까닭은 지금 [비트 값 채우기]의 칸 계획(cells.js planCells) 그대로다. 여기서 숫자를 새로 세지 않는다
// - 줄 차례: 업무일지 1은 ERP 화면 상자 차례(SCREEN_BOXES, 상자 안은 계획 차례), 업무일지 2는 계획 차례 그대로
// - 경고 줄은 지금 하루 채우기의 warningLines 글, 씨암·SONO 줄은 지금 기간 채우기·하루 채우기 글 그대로다
// - 씨암·SONO를 어디에 넣을지 묻지 않고, 고른 것을 어디에도 쓰지 않는다(읽기만)
import { planCells, type Planned, type Where } from '../../extension-erp/src/cells.js'
import { OVERLAP_TEXT, warningLines } from '../../extension-erp/src/panel.js'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView.js'
import { overlapAsks } from '../../extension-erp/src/settings.js'
import type { ClosingDay, OverlapChoice, Settings } from '../../extension-erp/src/types.js'
import {
  LIST_TEXT,
  SCREEN_BOXES,
  SHORT_SECTION,
  WHY_ORDER,
  shortDay,
  type ListCell,
  type ListLine,
  type ListModel,
  type Why,
} from './listTypes.js'

/** 업무일지 2 치료별 매출 묶음(cells.ts 글자). 머리 옆에 '금액(원)'을 붙이고 열 이름은 줄에 붙이지 않는다 */
const SALES_CARD = '치료별 매출'
/** 예약 표에서 열 이름을 붙이지 않는 줄(열이 총갯수 하나뿐) */
const RSV_PATIENTS = '실예약환자수'

/** 칸 자리 → 표 머리(업무일지 1 상자 · 업무일지 2 묶음 · 낱칸은 '운영 지표') */
function headOf(where: Where): string {
  if ('box' in where) return where.box
  if ('card' in where) return where.card
  return LIST_TEXT.ops
}

/** 칸 자리 → 줄 이름 · 열 이름(열이 여럿인 표만) */
function nameOf(where: Where): { name: string; col: string | null } {
  if ('box' in where) return { name: where.row, col: null }
  if ('card' in where) return { name: where.row, col: where.card === SALES_CARD || where.row === RSV_PATIENTS ? null : where.col }
  return { name: where.field, col: null }
}

/** 계획 칸 하나 → 표 칸. 값도 까닭도 없는 칸은 셀 수 없음으로 본다 */
function cellOf(planned: Planned): ListCell {
  if (planned.why) return { why: planned.why }
  return planned.value === null ? { why: 'unknown' } : { value: planned.value }
}

/**
 * 그날 칸 계획에 넘길 고른 것(AC-3904.6): 그날 씨암·SONO 돈이 두 번 셈하는 날(overlapAsks)만 설정의 지난번 고른 것,
 * 아니면 고른 것 없음(undefined = planCells 기본값, '둘 다 넣기'와 같은 값)
 */
export function dayChoice(day: ClosingDay, settings: Settings): OverlapChoice | undefined {
  return overlapAsks(day.overlap, settings) ? settings.overlap : undefined
}

/** 씨암·SONO 줄(AC-3904.6). 묻는 날이 없으면 null */
function overlapLine(answers: readonly ClosingDay[], settings: Settings): string | null {
  const asking = answers.filter((day) => overlapAsks(day.overlap, settings))
  if (asking.length === 0) return null
  if (settings.overlap) return RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into[settings.overlap])
  const visits = asking.reduce((sum, day) => sum + (day.overlap?.visits ?? 0), 0)
  return OVERLAP_TEXT.done(visits, 'both')
}

/**
 * 날짜 차례 답(빠진 날 없음) + 설정 → 목록 모양(design.md 4절 buildList 차례).
 * answers가 비거나, 어느 날 칸 자리 차례가 첫날과 다르면 throw(목록 화면은 E-BRIDGE-BAD-REPLY로 보인다)
 */
export function buildList(answers: readonly ClosingDay[], settings: Settings): ListModel {
  if (answers.length === 0) throw new Error('no answers')
  const plans = answers.map((day) => planCells(day, settings, dayChoice(day, settings)))
  const first = plans[0]
  const keys = first.map((p) => JSON.stringify(p.where))
  plans.forEach((plan, i) => {
    const same = plan.length === keys.length && plan.every((p, k) => JSON.stringify(p.where) === keys[k])
    if (!same) throw new Error(`cells differ on ${answers[i].date}`)
  })

  const seen = new Set<Why>()
  /** 첫날 계획 k번째 칸 자리의 숫자 줄(날짜 차례 칸) */
  const rowAt = (k: number): ListLine => {
    const where = first[k].where
    const cells = plans.map((plan) => cellOf(plan[k]))
    const whys = cells.map((cell) => ('why' in cell ? cell.why : null))
    for (const why of whys) if (why) seen.add(why)
    const rowWhy = whys.every((why) => why !== null && why === whys[0]) ? whys[0] : null
    const head = headOf(where)
    return { kind: 'row', key: keys[k], section: SHORT_SECTION[head] ?? head, ...nameOf(where), cells, rowWhy }
  }

  const lines: ListLine[] = [{ kind: 'journal', text: LIST_TEXT.journal1 }]
  for (const box of SCREEN_BOXES) {
    lines.push({ kind: 'section', text: box })
    first.forEach((p, k) => {
      if (p.where.j === 1 && p.where.box === box) lines.push(rowAt(k))
    })
  }
  lines.push({ kind: 'journal', text: LIST_TEXT.journal2 })
  let head: string | null = null
  first.forEach((p, k) => {
    if (p.where.j !== 2) return
    const next = headOf(p.where)
    if (next !== head) {
      head = next
      lines.push(next === SALES_CARD ? { kind: 'section', text: next, sub: LIST_TEXT.salesSub } : { kind: 'section', text: next })
    }
    lines.push(rowAt(k))
  })

  return {
    from: answers[0].date,
    to: answers[answers.length - 1].date,
    days: answers.map((day) => ({ date: day.date, zero: day.patients.total === 0 })),
    lines,
    rowCount: lines.filter((line) => line.kind === 'row').length,
    reasons: WHY_ORDER.filter((why) => seen.has(why)),
    warnings: answers.flatMap((day) => warningLines(day).map((line) => LIST_TEXT.warn(shortDay(day.date), line))),
    overlap: overlapLine(answers, settings),
  }
}
