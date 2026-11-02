import { dxContext, visitDxView } from '@/lib/precheck/dx/recommend'
import { createMemoEngine, unfinished, validatePhrases } from '@/lib/precheck/memo'
import { runRules } from '@/lib/precheck/rules/engine'
import { PrecheckError, shapeClaimMonth } from '@/lib/precheck/shape'
import type { Outcome } from '@/types/parse'
import type { CheckView, ClaimMonth, DxLink, MemoInput, MemoViews, PrecheckToScreen, RuleSettings, RuleSummary, Tables, VisitDxView } from '@/types/precheck'
import { createAssembler } from './assemble'
import { loadTables as defaultLoadTables } from './tables'

// 청구 Worker가 하는 일(design.md 6-2) [환자 자료 구역]. 시험은 이 파일을 바로 부른다(입구 precheck.worker.ts는 메시지만 잇는다).
// 통로 포트: chunk·end·abort → assemble로 모은다. 화면: loadStart(번호 load로 새 불러오기 시작, 옛 달을 버림) · month(그 불러오기의 id를 점검용 모양으로) · ruleList(설정 화면용 규칙 목록). 화면이 지킬 약속은 types/precheck.ts.
// 화면으로 보내는 것은 진료 수·진료 달·오류 번호·규칙 목록뿐이다. 조각 글자·풀린 자료는 Worker 밖으로 내보내지 않는다(design.md 5절)

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

type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
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
      } else if (m.type === 'ruleList') {
        const tables = await loadTables()
        deps.post(tables.ok ? { type: 'ruleList', ok: true, rules: ruleList(tables.value) } : { type: 'ruleList', ok: false, code: tables.code })
      }
    },

    /** 지금 불러와 둔 한 달 자료(뒤 TASK의 점검·메모가 쓴다). Worker 밖으로 보내지 않는다 */
    month(): ClaimMonth | null {
      return current
    },

    check: checkMonth,
  }
}

export type PrecheckJobs = ReturnType<typeof createPrecheckJobs>
