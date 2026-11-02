import { compareYmd, isYmd } from '@/lib/analytics/dates'
import type { Outcome } from '@/types/parse'
import type { BitMemos, DayMemoCount, InputPlan, MemoCompare, Visit, VisitMemo, VisitMemoView } from '@/types/precheck'

// 비트 메모 비교(REQ-016, 두 번 입력 막기) [환자 자료 구역]. 순수 함수만 있다. 부르는 곳은 Worker(jobs.ts)다.
// 비교는 도우미의 쓰기 직전 비교(C# MemoMatcher + MemoCompare, AC-035.3)와 같은 답을 내야 한다.
// 사례는 두 쪽 시험이 같은 파일(helper/tests/Precheck.Core.Tests/Claim/memo-compare-cases.test.json)로 본다

const PARTIAL = { ok: false, code: 'E-CLAIM-PARTIAL' } as const

/**
 * 공백뿐인 글인가. C# string.IsNullOrWhiteSpace(char.IsWhiteSpace)와 같은 글자만 본다.
 * JS trim·\s는 쓰지 않는다: U+FEFF를 공백으로 보고 U+0085를 공백으로 보지 않아 도우미와 답이 갈린다
 */
const BLANK = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]*$/
export const isBlankMemo = (text: string): boolean => BLANK.test(text)

/** 원본 MemoApproval.Matches: 윈도우 줄바꿈 CRLF만 LF로 맞춘다. 홀로 있는 CR·앞뒤 공백·유니코드 조합은 그대로다 */
const lf = (text: string) => text.replaceAll('\r\n', '\n')

/** 우리 메모와 비트 메모 비교(AC-016.2). inBit이 null·undefined면 읽지 못한 것이고 빈칸으로 보지 않는다(C#의 null과 같다). 읽었는데 없으면 빈 글자를 넘긴다 */
export function compareMemo(ours: string, inBit: string | null | undefined): MemoCompare {
  if (inBit === null || inBit === undefined) return '조회 못함'
  if (isBlankMemo(inBit)) return '비트에 없음'
  return lf(ours) === lf(inBit) ? '같음' : '다름'
}

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
/** 원본 chartKey: 앞의 0을 뺀 차트번호 */
const chartKey = (value: string) => value.trim().replace(/^0+(?=\d)/, '')

/**
 * 풀린 claim.memos 답 → 비교 재료(AC-016.1·AC-016.6). 잘렸거나(truncated) 뺀 줄이 있거나(invalidRows) 모양이 틀리면 E-CLAIM-PARTIAL로 멈춘다:
 * 읽지 못한 줄을 '비트에 없음'으로 보지 않게. 줄은 원본처럼 내원번호로 묶고 같은 번호가 또 오면 뒤 줄이 앞선다
 */
export function readBitMemos(raw: unknown): Outcome<BitMemos> {
  if (!isRecord(raw) || raw.version !== 1 || raw.truncated !== false || raw.invalidRows !== 0 || !Array.isArray(raw.rows)) return PARTIAL
  const period = raw.period
  if (!isRecord(period) || typeof period.from !== 'string' || typeof period.to !== 'string' || !isYmd(period.from) || !isYmd(period.to)) return PARTIAL
  const rows: BitMemos['rows'] = new Map()
  for (const row of raw.rows) {
    if (!isRecord(row) || typeof row.v !== 'string' || typeof row.p !== 'string' || typeof row.d !== 'string' || typeof row.m !== 'string') return PARTIAL
    rows.set(row.v.trim(), { chart: chartKey(row.p), memo: row.m })
  }
  return { ok: true, value: { period: { from: period.from, to: period.to }, rows } }
}

/**
 * 그 진료의 비트 메모(AC-016.6). undefined면 읽지 못한 것이다: 받은 자료가 없음(AC-016.8) · 읽은 기간 밖(claim.month는 고른 기간보다 앞쪽까지 읽는다, AC-013.13) ·
 * 차트번호가 다른 줄. 원본은 차트번호가 다르면 '비트에 없음'으로 보지만 비었다고 보면 두 번 입력한다. 읽은 기간 안에 줄이 없으면 빈 글자다.
 * 500자에서 잘린 Visit.memosInBit은 쓰지 않는다
 */
export function bitMemoOf(memos: BitMemos | null, visit: Pick<Visit, 'key' | 'chart' | 'date'>): string | undefined {
  if (!memos || compareYmd(visit.date, memos.period.from) < 0 || compareYmd(visit.date, memos.period.to) > 0) return undefined
  const row = memos.rows.get(visit.key)
  if (!row) return ''
  return row.chart === chartKey(visit.chart) ? row.memo : undefined
}

export type MemoSource = {
  /** 마지막 [자료 불러오기]에서 받은 비트 메모. 여기서 못 읽은 진료는 다시 불러오기가 성공해도 못 읽은 채다(AC-016.7) */
  atLoad: BitMemos | null
  /** 지금 비트 메모(다시 불러오기가 성공하면 통째로 바뀐다) */
  latest: BitMemos | null
  /** store.load의 입력 기록: 내원번호 → 마지막 상태 */
  journal: ReadonlyMap<string, string>
  /** 사람마다 승인한 비트 메모(AC-018.14): 내원번호 → 글 */
  approved?: ReadonlyMap<string, string>
}

/** 진료마다 비교 상태. 메모를 만들지 않은 진료는 줄이 없다(AC-014.8). 승인은 지금 비트 메모와 같을 때만 친다: 글이 바뀌었으면 도우미가 어차피 건너뛴다(AC-037.2) */
export function visitMemos(visits: readonly Visit[], views: readonly VisitMemoView[], source: MemoSource): VisitMemo[] {
  const viewOf = new Map(views.map((view) => [view.visitKey, view]))
  const rows: VisitMemo[] = []
  for (const visit of visits) {
    const view = viewOf.get(visit.key)
    if (!view) continue
    const inBit = bitMemoOf(source.atLoad, visit) === undefined ? undefined : bitMemoOf(source.latest, visit)
    const compare = compareMemo(view.text, inBit)
    const row: VisitMemo = { key: visit.key, date: visit.date, text: view.text, hasMemo: view.hasMemo, unfinished: view.unfinished, compare }
    if (inBit !== undefined && (compare === '같음' || compare === '다름')) row.inBit = inBit
    const approved = source.approved?.get(visit.key)
    if (compare === '다름' && approved !== undefined && compareMemo(approved, inBit) === '같음') row.approved = approved
    const last = source.journal.get(visit.key)
    if (last !== undefined) row.lastJournal = last
    rows.push(row)
  }
  return rows
}

/**
 * 비교와 묻지 않기로 나눈 입력 묶음(AC-016.3, 표는 design.md 19-6). 받은 차례 그대로이고, 둘에 걸리면 AC-018.26 차례로 앞선 하나에만 든다.
 * 메모 없는 진료는 글자가 아니라 hasMemo로 가른다: 메모 없는 날에 사람이 친 글은 글자가 있어도 넣지 않는다. 공백뿐인 글은 AC-017.1이 묶음 전체를 거절하므로 함께 뺀다.
 * 같은 날 진료 여럿(직접 입력, AC-018.13)과 지난번 건너뜀(AC-018.20)은 여기서 모른다. inputTargets(TASK-18)가 더 거른다
 */
export function inputPlan(visits: readonly VisitMemo[], noAsk: boolean): InputPlan {
  const plan: InputPlan = { batch: [], done: [], skipped: [] }
  for (const visit of visits) {
    const { key } = visit
    if (visit.compare === '같음') plan.done.push({ key, reason: '이미 입력됨' })
    else if (!visit.hasMemo || isBlankMemo(visit.text)) plan.skipped.push({ key, reason: '메모 없음' })
    else if (visit.unfinished) plan.skipped.push({ key, reason: '확인 표시' })
    else if (visit.compare === '조회 못함') plan.skipped.push({ key, reason: '조회 못함' })
    else if (visit.compare === '비트에 없음') plan.batch.push(visit)
    else if (visit.approved) plan.batch.push({ ...visit, replaces: visit.approved })
    // 직접 확인 기록이 남은 사람은 묻지 않기가 켜져 있어도 사람이 새로 승인했을 때만 바꾼다(AC-037.6)
    else if (noAsk && visit.lastJournal !== 'skippedByHand') plan.batch.push(visit)
    else plan.skipped.push({ key, reason: '이미 있음' })
  }
  return plan
}

/**
 * 날짜마다 메모 필요 수·입력 수(같음)·이미 있음 수(AC-016.4). 셋 다 hasMemo인 진료만 센다: 입력 수가 메모 필요 수를 넘으면 DB 제약이 거절한다(AC-019.2).
 * 메모가 필요 없는 날도 0으로 남긴다: 빠지면 날짜 목록이 아직 안 불러온 날로 본다(design.md 6-4)
 */
export function dayMemoCounts(rows: readonly VisitMemo[]): DayMemoCount[] {
  const days = new Map<string, DayMemoCount>()
  for (const row of rows) {
    let day = days.get(row.date)
    if (!day) {
      day = { date: row.date, needMemo: 0, entered: 0, already: 0 }
      days.set(row.date, day)
    }
    if (!row.hasMemo) continue
    day.needMemo++
    if (row.compare === '같음') day.entered++
    else if (row.compare === '다름') day.already++
  }
  return [...days.values()].sort((a, b) => compareYmd(a.date, b.date))
}
