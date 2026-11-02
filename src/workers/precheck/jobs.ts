import { compareYmd, isMonth } from '@/lib/analytics/dates'
import { dxContext, visitDxView } from '@/lib/precheck/dx/recommend'
import { createMemoEngine, unfinished, validatePhrases } from '@/lib/precheck/memo'
import { dayMemoCounts, inputPlan, readBitMemos, visitMemos } from '@/lib/precheck/memoCompare'
import { runRules } from '@/lib/precheck/rules/engine'
import { PrecheckError, shapeClaimMonth } from '@/lib/precheck/shape'
import type { Outcome } from '@/types/parse'
import type { BitMemos, CheckView, ClaimMonth, DxLink, MemoInput, MemoState, MemoStateOptions, MemoViews, PrecheckToScreen, RuleSettings, RuleSummary, Tables, VisitDxView } from '@/types/precheck'
import { createAssembler } from './assemble'
import { loadTables as defaultLoadTables } from './tables'

// 청구 Worker가 하는 일(design.md 6-2) [환자 자료 구역]. 시험은 이 파일을 바로 부른다(입구 precheck.worker.ts는 메시지만 잇는다).
// 통로 포트: chunk·end·abort → assemble로 모은다. 화면: loadStart(번호 load로 새 불러오기 시작, 옛 달을 버림) · month(그 불러오기의 id를 점검용 모양으로) · loadPart(claim.memos·store.load의 id를 받아 둠) · memoReloadStart(비트 메모 다시 불러오기 번호 run) · ruleList(설정 화면용 규칙 목록). 화면이 지킬 약속은 types/precheck.ts.
// 화면으로 보내는 것은 진료 수·진료 달·오류 번호·규칙 목록과 loadPart의 성패뿐이다. 조각 글자·풀린 자료는 Worker 밖으로 내보내지 않는다(design.md 5절)

const PARTIAL = { ok: false, code: 'E-CLAIM-PARTIAL' } as const

/** 다 모은 claim.month 글자 → ClaimMonth. JSON은 여기서 한 번만 푼다. 틀리면(잘린 글자·모양·줄 수) E-CLAIM-PARTIAL */
export function loadMonth(text: string): Outcome<ClaimMonth> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return PARTIAL
  }
  try {
    return { ok: true, value: shapeClaimMonth(raw) }
  } catch (error) {
    // 원래 오류 글은 싣지 않는다. 모양 만들기의 뜻밖의 오류도 반쪽 자료로 점검하지 않게 같은 번호로 멈춘다
    return error instanceof PrecheckError ? { ok: false, code: error.code } : PARTIAL
  }
}

/** 다 모은 claim.memos 글자 → 비교 재료(AC-016.1·AC-016.6). JSON은 여기서 한 번만 푼다 */
export function loadMemos(text: string): Outcome<BitMemos> {
  try {
    return readBitMemos(JSON.parse(text))
  } catch {
    return PARTIAL
  }
}

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const allStrings = (x: Rec) => Object.values(x).every((value) => typeof value === 'string')

/** 받아 둔 작업 저장: 고친·완료한 메모(내원번호 → 글)와 입력 기록(내원번호 → 마지막 상태) */
type StoredWork = { saved: Map<string, string>; journal: Map<string, string> }
const noWork = (): StoredWork => ({ saved: new Map(), journal: new Map() })

/**
 * 다 모은 store.load 글자 → 메모 재료와 입력 기록(AC-016.5). 모양은 types/precheck.ts의 StoreMonthJson. 틀리면 E-CLAIM-PARTIAL:
 * 고친 메모를 못 읽었는데 빈 것으로 보면 사람이 고친 글 대신 자동 메모가 나간다. 같은 진료면 고친 글이 완료 때 글보다 앞선다.
 * 달을 묻지 않은 답(설정 사본만 등)은 null이다: 달 내용을 알려 주지 않으므로 받아 둔 고친 메모를 지우지 않는다
 */
export function loadStore(text: string): Outcome<StoredWork | null> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return PARTIAL
  }
  if (!isRecord(raw)) return PARTIAL
  const { months } = raw
  if (months === undefined) return { ok: true, value: null }
  if (!isRecord(months)) return PARTIAL
  const work = noWork()
  for (const [month, file] of Object.entries(months)) {
    if (!isMonth(month) || !isRecord(file)) return PARTIAL
    const { drafts, done, journal } = file
    if (!isRecord(drafts) || !isRecord(done) || !isRecord(journal) || !allStrings(drafts) || !allStrings(journal)) return PARTIAL
    if (!Object.values(done).every((value) => typeof value === 'string' || typeof value === 'boolean')) return PARTIAL
    for (const [key, value] of Object.entries(done)) if (typeof value === 'string') work.saved.set(key, value)
    for (const [key, value] of Object.entries(drafts)) work.saved.set(key, value as string)
    for (const [key, value] of Object.entries(journal)) work.journal.set(key, value as string)
  }
  return { ok: true, value: work }
}

/** 설정 화면 '점검 규칙' 칸에 보일 것만(TASK-12). 환자 자료가 아니다 */
export function ruleList(tables: Tables): RuleSummary[] {
  return tables.rules.rules.map(({ id, title, domain, grade, basis, enabled_default }) => ({
    id,
    title,
    domain,
    grade,
    basis,
    enabled_default,
  }))
}

/**
 * 진료마다 메모(TASK-14). 설정 줄이 없거나 검사를 지나지 못하면 메모를 만들지 않는다. 기본값으로 대신 만들지 않는다(AC-014.8).
 * 사람이 고쳤거나 완료한 메모는 그대로 두고 빠진 문장만 알린다(AC-014.4). 손대지 않은 메모는 저장하지 않으므로 늘 지금 설정으로 새로 만든다(AC-014.11, 원본 protectWork)
 */
export function memoViews(month: ClaimMonth, tables: Tables, input: MemoInput): MemoViews {
  const checked = validatePhrases(input.phrases)
  if (!checked.ok) return { memoBlocked: 'E-MEMO-NO-SETTINGS', memos: [] }
  const engine = createMemoEngine(checked.value, tables)
  return {
    memoBlocked: null,
    memos: engine.analyzeMonth(month).map((visit) => {
      const saved = input.saved?.get(visit.key)
      const text = saved ?? engine.fullText(visit)
      return { visitKey: visit.key, text, edited: saved !== undefined, missing: engine.savedMemoMissing(saved, visit), hasMemo: visit.memos.length > 0, unfinished: unfinished(text) }
    }),
  }
}

/**
 * 진료마다 추천 상병과 상병 확인 경고(TASK-11). 점검 결과 보기 모양에 규칙 결과와 함께 넣는다(jobs.check, TASK-10). 진료 자료를 바꾸지 않는다.
 * 메모 결과를 넘기면 상병 확인이 부위 메모를 본다(AC-014.13). 메모를 만들지 않는 병원은 메모가 없다. 화면까지 잇는 것은 TASK-13이다
 */
export function dxViews(month: ClaimMonth, links: readonly DxLink[], memos?: MemoViews): VisitDxView[] {
  const withMemo = new Set(memos?.memos.filter((memo) => memo.hasMemo).map((memo) => memo.visitKey))
  const ctx = dxContext({ trend: month.dxTrend, links, visits: month.visits, hasDx: month.hasDx, hasMemo: (visit) => withMemo.has(visit.key) })
  return month.visits.map((visit) => visitDxView(visit, ctx))
}

/** 규칙 엔진을 돌려 보기 모양으로 바꾼다(TASK-10). 메모 재료를 함께 받아 진료마다 메모를 싣는다(TASK-14). 메모를 못 만들어도 규칙 결과는 그대로다(AC-014.8). 화면으로 보내는 일은 TASK-13이 잇는다 */
export function checkMonth(month: ClaimMonth, tables: Tables, settings: RuleSettings, memo: MemoInput = { phrases: null }): CheckView {
  const { perVisit, groups, totals } = runRules(month, tables, settings)
  const memos = memoViews(month, tables, memo)
  const memoOf = new Map(memos.memos.map((view) => [view.visitKey, view]))
  return {
    visits: month.visits.map(({ key, chart, date, name }) => {
      const { hits, skippedNoHistory, skippedNoDx, checked } = perVisit.get(key)!
      return { key, chart, date, name, findings: hits, skippedNoHistory, skippedNoDx, checked, memo: memoOf.get(key) ?? null }
    }),
    groups: groups.map(({ ruleId, rule, grade, visits }) => ({ ruleId, title: rule.title, domain: rule.domain, grade, visitKeys: visits.map((row) => row.visitKey) })),
    totals,
    memoBlocked: memos.memoBlocked,
  }
}

const isId = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= 128
const isLoad = (x: unknown): x is number => Number.isSafeInteger(x)

/** 진료 달(YYYY-MM)들, 이른 달부터 */
const monthsOf = (month: ClaimMonth) => [...new Set(month.visits.map((v) => v.month))].sort()

export function createPrecheckJobs(deps: {
  post(message: PrecheckToScreen): void
  loadTables?: () => Promise<Outcome<Tables>>
}) {
  const assembler = createAssembler()
  const loadTables = deps.loadTables ?? defaultLoadTables
  /**
   * 마지막으로 불러온 한 달 자료(점검·메모는 이것으로 한다). 화면의 loadStart·month로만 바뀐다.
   * 포트로 온 실패로는 비우지 않는다: 통로는 claim.memos·store.load·sam.latest·bit.input의 실패도 같은 abort로 보내고
   * Worker는 어느 명령의 id인지 모른다(AC-013.2: memos 실패에도 점검을 계속한다)
   */
  let current: ClaimMonth | null = null
  /** 화면이 마지막으로 시작한 불러오기 번호. null이면 어떤 month도 쓰지 않는다(아직 loadStart가 없거나 번호가 틀렸다) */
  let latestLoad: number | null = null
  /** 마지막 [자료 불러오기]에서 받은 비트 메모. 여기서 못 읽은 진료는 다시 불러오기가 성공해도 못 읽은 채다(AC-016.7) */
  let memosAtLoad: BitMemos | null = null
  /** 지금 비트 메모. 마지막 번호의 성공한 loadPart로만 통째로 바뀐다. 실패로는 바뀌지 않는다(AC-016.8) */
  let bitMemos: BitMemos | null = null
  /** 받아 둔 store.load. 없으면 빈 내용이다(AC-013.2) */
  let work = noWork()
  /** 이 불러오기에서 memoReloadStart를 받았나, 그 마지막 번호. 새 loadStart가 지운다(AC-016.7) */
  let reloadStarted = false
  let latestRun: number | null = null

  /** 조각이 다 오지 않았다(AC-009.2): 그 id의 조각은 assemble이 버렸다. 화면에 알리기만 한다 */
  const postPartial = (id: string) => deps.post({ type: 'partial', id, code: 'E-CLAIM-PARTIAL' })

  return {
    /** 통로 포트로 온 메시지(design.md 6-1): chunk·end·abort. sent(보내기 결과)는 이 step에서 쓰지 않는다 */
    async fromPort(m: unknown): Promise<void> {
      if (!isRecord(m) || !isId(m.id)) return
      if (m.type === 'chunk' && typeof m.data === 'string' && typeof m.seq === 'number') {
        assembler.chunk(m.id, m.seq, m.data)
      } else if (m.type === 'end' && typeof m.count === 'number' && typeof m.bytes === 'number' && typeof m.sha256 === 'string') {
        const result = await assembler.end(m.id, m.count, m.bytes, m.sha256)
        if (!result.ok) postPartial(m.id)
      } else if (m.type === 'abort' && typeof m.code === 'string') {
        assembler.abort(m.id, m.code)
        postPartial(m.id)
      }
    },

    /** 화면에서 온 메시지 */
    async fromScreen(m: unknown): Promise<void> {
      if (!isRecord(m)) return
      if (m.type === 'loadStart') {
        // 새 불러오기 시작: 옛 달을 먼저 버린다. 통로가 문에서 거절하면(lib/bridge/client.ts request) abort도 오지 않는다
        latestLoad = isLoad(m.load) ? m.load : null
        current = null
        memosAtLoad = null
        bitMemos = null
        work = noWork()
        reloadStarted = false
        latestRun = null
      } else if (m.type === 'month' && isId(m.id) && isLoad(m.load)) {
        const id = m.id
        const load = m.load
        const assembled = await assembler.take(id)
        // 번호는 take가 끝난 뒤에 본다. 마지막 불러오기가 아니면 달을 넣지도 지우지도 않는다(옛 달이 새 달을 덮거나, 옛 실패가 새 달을 지우지 않게)
        const replaced = load !== latestLoad
        const loaded = assembled.ok && !replaced ? loadMonth(assembled.text) : PARTIAL
        if (!replaced) current = loaded.ok ? loaded.value : null // 반쪽 자료로 점검하지 않는다. 전에 불러온 달도 버린다
        deps.post(
          loaded.ok
            ? { type: 'month', id, load, ok: true, visits: loaded.value.visits.length, months: monthsOf(loaded.value) }
            : { type: 'month', id, load, ok: false, code: loaded.code },
        )
      } else if (m.type === 'memoReloadStart') {
        // 번호만 적는다. 달·비트 메모·점검 결과는 그대로다(AC-016.7·AC-016.8). 답은 없다
        reloadStarted = true
        latestRun = isLoad(m.run) ? m.run : null
      } else if (m.type === 'loadPart' && (m.part === 'memos' || m.part === 'store') && isId(m.id) && isLoad(m.load)) {
        const part = m.part
        const id = m.id
        const load = m.load
        const run = m.run
        const reload = isLoad(run)
        if (run !== undefined && (!reload || part !== 'memos')) return // 약속 밖의 모양. month처럼 답하지 않고 조각도 찾아 가지 않는다
        const numbers = reload ? { id, load, run } : { id, load }
        const answer = (outcome: Outcome<unknown>) =>
          deps.post(outcome.ok ? { type: 'loadPart', part, ...numbers, ok: true } : { type: 'loadPart', part, ...numbers, ok: false, code: outcome.code })
        const assembled = await assembler.take(id)
        // 번호는 take가 끝난 뒤에 본다(month와 같음): 옛 조각도 찾아 버리고, 기다리는 사이에 온 새 번호도 놓치지 않는다
        const replaced = load !== latestLoad || (reload ? run !== latestRun : part === 'memos' && reloadStarted)
        if (!assembled.ok || replaced) {
          answer(PARTIAL)
        } else if (part === 'memos') {
          const memos = loadMemos(assembled.text)
          if (memos.ok) {
            bitMemos = memos.value
            if (!reload) memosAtLoad = memos.value
          }
          answer(memos)
        } else {
          const stored = loadStore(assembled.text)
          if (stored.ok && stored.value) work = stored.value
          answer(stored)
        }
      } else if (m.type === 'ruleList') {
        const tables = await loadTables()
        deps.post(tables.ok ? { type: 'ruleList', ok: true, rules: ruleList(tables.value) } : { type: 'ruleList', ok: false, code: tables.code })
      }
    },

    /** 지금 불러와 둔 한 달 자료(뒤 TASK의 점검·메모가 쓴다). Worker 밖으로 보내지 않는다 */
    month(): ClaimMonth | null {
      return current
    },

    /** 규칙 결과와 메모(TASK-10·14). 고친 메모를 넘기지 않으면 store.load에서 받아 둔 것을 쓴다(AC-014.4) */
    check(month: ClaimMonth, tables: Tables, settings: RuleSettings, memo: MemoInput = { phrases: null }): CheckView {
      return checkMonth(month, tables, settings, { phrases: memo.phrases, saved: memo.saved ?? work.saved })
    },

    /** memoViews·dxViews에 넘길 메모 재료: store.load에서 받아 둔 고친 메모를 잇는다(TASK-13이 쓴다) */
    memoInput(phrases: unknown): MemoInput {
      return { phrases, saved: work.saved }
    },

    /** 고른 기간의 비교·입력 묶음·날짜별 수(AC-016.2~AC-016.4). 받아 둔 자료로 그때 만들므로 다시 불러오기가 성공하면 새 값이다. Worker 밖으로는 환자 줄 화면에만 간다 */
    memoState(tables: Tables, phrases: unknown, options: MemoStateOptions): MemoState {
      const views: MemoViews = current ? memoViews(current, tables, { phrases, saved: work.saved }) : { memoBlocked: null, memos: [] }
      const { from, to } = options.visible
      const inside = (current?.visits ?? []).filter((visit) => compareYmd(visit.date, from) >= 0 && compareYmd(visit.date, to) <= 0)
      const rows = visitMemos(inside, views.memos, { atLoad: memosAtLoad, latest: bitMemos, journal: work.journal, approved: options.approved })
      return { memoBlocked: views.memoBlocked, rows, plan: inputPlan(rows, options.noAsk ?? false), days: dayMemoCounts(rows) }
    },
  }
}

export type PrecheckJobs = ReturnType<typeof createPrecheckJobs>
