import { compareYmd, isYmd } from '@/lib/analytics/dates'
import type { Outcome } from '@/types/parse'
import type { BitMemos, DayMemoCount, InputPlan, MemoCompare, Visit, VisitMemo, VisitMemoView } from '@/types/precheck'

// 비트 메모 비교(REQ-016, 두 번 입력 막기) [환자 자료 구역]. 순수 함수만 있다. 부르는 곳은 Worker(jobs.ts)다.
// 비교는 도우미의 쓰기 직전 비교(C# MemoMatcher + MemoCompare, AC-035.3)와 같은 답을 내야 한다.
// 사례는 두 쪽 시험이 같은 파일(helper/tests/Precheck.Core.Tests/Claim/memo-compare-cases.test.json)로 본다

const PARTIAL = { ok: false, code: 'E-CLAIM-PARTIAL' } as const
/** replaces 한도(commands.json bit.input, helper BatchCheck.MaxReplaces). 도우미도 이 길이에서 잘라 truncated를 알린다(AC-016.6) */
const MAX_BIT_MEMO = 4000

/**
 * 공백뿐인 글인가. C# string.IsNullOrWhiteSpace(char.IsWhiteSpace)와 같은 글자만 본다.
 * JS trim·\s는 쓰지 않는다: U+FEFF를 공백으로 보고 U+0085를 공백으로 보지 않아 도우미와 답이 갈린다
 */
const BLANK = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]*$/
export const isBlankMemo = (text: string): boolean => BLANK.test(text)

/** 원본 MemoApproval.Matches: 윈도우 줄바꿈 CRLF만 LF로 맞춘다. 홀로 있는 CR·앞뒤 공백·유니코드 조합은 그대로다 */
const lf = (text: string) => text.replaceAll('\r\n', '\n')

/**
 * 뒤에 붙인 메모인가(AC-6611.3): 줄바꿈을 맞춘 비트 메모가 '줄바꿈 + 우리 메모'로 끝나고 그 앞이 공백뿐이 아니다. 우리 메모가 공백뿐이면 아니다.
 * 도우미 0.12.0이 '비트 메모 + 줄바꿈 + 우리 메모'로 넣은 글이다. C# MemoCompare.IsAppended와 같은 규칙이다
 */
function isAppended(bit: string, ours: string): boolean {
  if (isBlankMemo(ours)) return false
  const tail = `\n${ours}`
  return bit.length > tail.length && bit.endsWith(tail) && !isBlankMemo(bit.slice(0, bit.length - tail.length))
}

/**
 * 우리 메모와 비트 메모 비교(AC-016.2). inBit이 null·undefined면 읽지 못한 것이고 빈칸으로 보지 않는다(C#의 null과 같다). 읽었는데 없으면 빈 글자를 넘긴다.
 * 비트 메모가 앞 글 + 줄바꿈 + 우리 메모(뒤에 붙인 메모)여도 같음이다: 다음 입력에서 앞 글을 덮어쓰지 않는다(AC-6611.3)
 */
export function compareMemo(ours: string, inBit: string | null | undefined): MemoCompare {
  if (inBit === null || inBit === undefined) return '조회 못함'
  if (isBlankMemo(inBit)) return '비트에 없음'
  const bit = lf(inBit)
  const mine = lf(ours)
  return bit === mine || isAppended(bit, mine) ? '같음' : '다름'
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
 * 500자에서 잘린 Visit.memosInBit은 쓰지 않는다. 4,000자를 넘는 글(도우미와 어긋난 때)도 읽지 못한 것이다: replaces로 보내면 묶음 전체가 거절된다
 */
export function bitMemoOf(memos: BitMemos | null, visit: Pick<Visit, 'key' | 'chart' | 'date'>): string | undefined {
  if (!memos || compareYmd(visit.date, memos.period.from) < 0 || compareYmd(visit.date, memos.period.to) > 0) return undefined
  const row = memos.rows.get(visit.key)
  if (!row) return ''
  return row.chart === chartKey(visit.chart) && row.memo.length <= MAX_BIT_MEMO ? row.memo : undefined
}

export type MemoSource = {
  /** 마지막 [자료 불러오기]에서 받은 비트 메모. 여기서 못 읽은 진료는 다시 불러오기가 성공해도 못 읽은 채다(AC-016.7) */
  atLoad: BitMemos | null
  /** 지금 비트 메모(다시 불러오기가 성공하면 통째로 바뀐다) */
  latest: BitMemos | null
  /** store.load의 입력 기록: 내원번호 → 마지막 상태 */
  journal: ReadonlyMap<string, string>
  /** 직접 확인 기록이 남은 사람의 승인(AC-018.14): 내원번호 → 글 */
  approved?: ReadonlyMap<string, string>
  /** [바꾸지 않기]를 누른 사람의 내원번호(AC-018.14) */
  declined?: ReadonlySet<string>
  /**
   * 완료를 푼 사람 가운데 이 화면에서 비트 메모를 읽은 뒤 입력을 마친 사람: 내원번호 → 그때 넣은 글(AC-2202.3). 받은 사본은 입력 전 값이라 이 글과 견준다.
   * 도우미가 저장 뒤 다시 읽어 확인한 글이고, 그새 바뀌었으면 replaces가 칸 글과 달라 도우미가 바꾸지 않는다(AC-037.1). 4,000자를 넘으면 읽지 못한 것이다(bitMemoOf와 같은 한도)
   */
  entered?: ReadonlyMap<string, string>
}

/** 그 진료를 견줄 비트 글. undefined면 읽지 못한 것이다(AC-016.6·AC-016.7·AC-2202.3) */
function inBitOf(visit: Visit, source: MemoSource): string | undefined {
  const entered = source.entered?.get(visit.key)
  if (entered !== undefined) return entered.length <= MAX_BIT_MEMO ? entered : undefined
  return bitMemoOf(source.atLoad, visit) === undefined ? undefined : bitMemoOf(source.latest, visit)
}

/**
 * 진료마다 비교 상태. 메모를 만들지 않은 진료는 줄이 없다(AC-014.8). 승인은 지금 비트 메모와 같을 때만 친다: 글이 바뀌었으면 도우미가 어차피 건너뛴다(AC-037.2).
 * [바꾸지 않기]는 비교가 다름일 때만 친다: 같음·비트에 없음이면 바꿀 메모가 없어 표시와 상관없이 그 비교대로다(AC-018.14)
 */
export function visitMemos(visits: readonly Visit[], views: readonly VisitMemoView[], source: MemoSource): VisitMemo[] {
  const viewOf = new Map(views.map((view) => [view.visitKey, view]))
  const rows: VisitMemo[] = []
  for (const visit of visits) {
    const view = viewOf.get(visit.key)
    if (!view) continue
    const inBit = inBitOf(visit, source)
    const compare = compareMemo(view.text, inBit)
    const row: VisitMemo = { key: visit.key, date: visit.date, text: view.text, hasMemo: view.hasMemo, unfinished: view.unfinished, compare }
    if (inBit !== undefined && (compare === '같음' || compare === '다름')) row.inBit = inBit
    const approved = source.approved?.get(visit.key)
    if (compare === '다름' && approved !== undefined && compareMemo(approved, inBit) === '같음') row.approved = approved
    if (compare === '다름' && source.declined?.has(visit.key)) row.declined = true
    const last = source.journal.get(visit.key)
    if (last !== undefined) row.lastJournal = last
    rows.push(row)
  }
  return rows
}

/**
 * 보낼 replaces(AC-016.3). 지금 쥔 비트 글이고 칸 글이 이 글일 때만 도우미가 바꾼다(AC-037.1). 묶음을 만드는 곳이 모두 여기서 정한다(inputPlan·jobs.ts).
 * [바꾸지 않기]를 누른 사람과 확인 표시가 남은 메모는 없다. 직접 확인 기록이 남은 사람은 [이 메모로 바꾸기]를 눌렀을 때만 있다: 도우미는 replaces가 오면 새 승인으로 보므로 사이트가 막는다(AC-037.6)
 */
export function replacesOf(row: VisitMemo): string | undefined {
  if (row.compare !== '다름' || row.declined || row.unfinished) return undefined
  if (row.lastJournal === 'skippedByHand' && row.approved === undefined) return undefined
  return row.inBit
}

/**
 * 비교로 나눈 입력 묶음(AC-016.3, 표는 design.md 19-6). 묻지 않기와 상관없다(AC-018.22). 받은 차례 그대로이고, 둘에 걸리면 AC-018.26 차례로 앞선 하나에만 든다.
 * 메모 없는 진료는 글자가 아니라 hasMemo로 가른다: 메모 없는 날에 사람이 친 글은 글자가 있어도 넣지 않는다. 공백뿐인 글은 AC-017.1이 묶음 전체를 거절하므로 함께 뺀다.
 * 같은 날 진료 여럿(직접 입력, AC-018.13)과 지난번 건너뜀(AC-018.20)은 여기서 모른다. inputTargets(TASK-18)가 더 거른다
 */
export function inputPlan(visits: readonly VisitMemo[]): InputPlan {
  const plan: InputPlan = { batch: [], done: [], skipped: [] }
  for (const visit of visits) {
    const { key } = visit
    if (visit.compare === '같음') plan.done.push({ key, reason: '이미 입력됨' })
    else if (!visit.hasMemo || isBlankMemo(visit.text)) plan.skipped.push({ key, reason: '메모 없음' })
    else if (visit.unfinished) plan.skipped.push({ key, reason: '확인 표시' })
    else if (visit.compare === '조회 못함') plan.skipped.push({ key, reason: '조회 못함' })
    else if (visit.compare === '비트에 없음') plan.batch.push(visit)
    else {
      const replaces = replacesOf(visit)
      if (replaces === undefined) plan.skipped.push({ key, reason: '이미 있음' })
      else plan.batch.push({ ...visit, replaces })
    }
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
