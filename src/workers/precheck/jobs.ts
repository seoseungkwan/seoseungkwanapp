import { addDays, compareYmd, diffDays, isMonth, isYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { dayCounts } from '@/lib/precheck/counts'
import { dxContext, visitDxView } from '@/lib/precheck/dx/recommend'
import { inputTargets, isPlainExclusion, isWriteStuck, NOT_ACCEPTED, NOT_DONE, reasonKind } from '@/lib/precheck/inputTargets'
import { createMemoEngine, unfinished, validatePhrases, type Phrases } from '@/lib/precheck/memo'
import { bitMemoOf, compareMemo, dayMemoCounts, inputPlan, isBlankMemo, readBitMemos, visitMemos } from '@/lib/precheck/memoCompare'
import { runRules } from '@/lib/precheck/rules/engine'
import { PrecheckError, shapeClaimMonth } from '@/lib/precheck/shape'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import type { Outcome } from '@/types/parse'
import type { BitMemos, CheckGroup, CheckSettings, CheckView, ClaimMonth, ClaimView, ClaimVisitView, DxLink, Grade, InputResultLine, InputResultView, InputSelection, InputTargets, InputWhat, LeftReason, MemoInput, MemoScreenView, MemoState, MemoStateOptions, MemoViews, PrecheckToPort, PrecheckToScreen, RuleSettings, RuleSummary, SavedRuleSettings, StuckPerson, StuckView, TargetVisit, Tables, Visit, VisitDxView, VisitMemo } from '@/types/precheck'
import { createAssembler } from './assemble'
import { loadTables as defaultLoadTables } from './tables'

// 청구 Worker가 하는 일(design.md 6-2) [환자 자료 구역]. 시험은 이 파일을 바로 부른다(입구 precheck.worker.ts는 메시지만 잇는다).
// 통로 포트: chunk·end·abort → assemble로 모은다. sent → 설정 사본·달 칸 저장·입력 묶음의 답. 화면: loadStart(번호 load로 새 불러오기 시작, 옛 달을 버림) · month(그 불러오기의 id를 점검용 모양으로) · loadPart(claim.memos·store.load의 id를 받아 둠) · memoReloadStart(비트 메모 다시 불러오기 번호 run) · ruleList(설정 화면용 규칙 목록) · check(점검) · excel(엑셀 바이트) · memoView·editMemo·memoApprove·memoSaveRetry·storeBlock·buildInputBatch·inputExcel(메모 칸, TASK-18). 화면이 지킬 약속은 types/precheck.ts.
// 화면으로 보내는 것은 진료 수·진료 달·오류 번호·규칙 목록·loadPart의 성패·날짜별 건수(날짜와 정수)와, check·memoView의 보기 모양·입력 결과·엑셀의 바이트뿐이다. 조각 글자·풀린 자료·도우미에 보낼 글자(묶음·저장 글자)는 Worker 밖으로 화면에 내보내지 않는다(design.md 5절, AC-004.11)

const PARTIAL = { ok: false, code: 'E-CLAIM-PARTIAL' } as const
const GRADE_ORDER: readonly Grade[] = ['확인필요', '알림', '참고']

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

/** 달 파일 하나의 칸. store.save가 칸 전체를 바꾸므로 받은 그대로(이번 기간 밖 진료 것까지) 들고 있다가 함께 보낸다 */
type MonthWork = { drafts: Map<string, string>; done: Map<string, string | boolean> }
/**
 * 받아 둔 작업 저장: 고친·완료한 메모(내원번호 → 글) · 입력 기록(내원번호 → 마지막 상태) · 완료 표시(글 없는 표시 포함, AC-018.3) · 달 파일별 칸 · 입력 기록의 달.
 * saved는 메모를 얼리는 글이다: 글 없는 완료 표시는 얼리지 않는다(AC-014.11). journal은 도우미가 쓰고 Worker에는 사본이다(design.md 19-6)
 */
type StoredWork = { saved: Map<string, string>; journal: Map<string, string>; done: Set<string>; months: Map<string, MonthWork>; journalMonths: Map<string, string> }
const noWork = (): StoredWork => ({ saved: new Map(), journal: new Map(), done: new Set(), months: new Map(), journalMonths: new Map() })

const isStrings = (x: unknown) => Array.isArray(x) && x.every((value) => typeof value === 'string')

/** 설정 묶음 모양 검사(AC-013.9). 안쪽(연결표 줄)은 dxViews가, 병원 문구는 validatePhrases가 본다. 틀리면 null */
export function readCheckSettings(x: unknown): CheckSettings | null {
  if (!isRecord(x) || !Array.isArray(x.dxLinks) || !(x.phrases === null || isRecord(x.phrases))) return null
  const { rules } = x
  if (!isRecord(rules) || !isStrings(rules.off) || !isStrings(rules.on) || !Array.isArray(rules.grade)) return null
  return x as CheckSettings
}

/**
 * 다 모은 store.load 글자 → 메모 재료·입력 기록과 설정 사본(AC-016.5·AC-013.9). 모양은 types/precheck.ts의 StoreMonthJson. 틀리면 E-CLAIM-PARTIAL:
 * 고친 메모를 못 읽었는데 빈 것으로 보면 사람이 고친 글 대신 자동 메모가 나간다. 같은 진료면 고친 글이 완료 때 글보다 앞선다.
 * 달을 묻지 않은 답(설정 사본만 등)의 work는 null이다: 달 내용을 알려 주지 않으므로 받아 둔 고친 메모를 지우지 않는다.
 * settings는 사본을 물은 답에서만 칸이 있다(없거나 모양이 틀린 사본은 null, 그러면 사본 없음이다)
 */
export function loadStore(text: string): Outcome<{ work: StoredWork | null; settings?: CheckSettings | null }> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return PARTIAL
  }
  if (!isRecord(raw)) return PARTIAL
  const settings = raw.settings === undefined ? {} : { settings: readCheckSettings(raw.settings) }
  const { months } = raw
  if (months === undefined) return { ok: true, value: { work: null, ...settings } }
  if (!isRecord(months)) return PARTIAL
  const work = noWork()
  for (const [month, file] of Object.entries(months)) {
    if (!isMonth(month) || !isRecord(file)) return PARTIAL
    const { drafts, done, journal } = file
    if (!isRecord(drafts) || !isRecord(done) || !isRecord(journal) || !allStrings(drafts) || !allStrings(journal)) return PARTIAL
    if (!Object.values(done).every((value) => typeof value === 'string' || typeof value === 'boolean')) return PARTIAL
    for (const [key, value] of Object.entries(done)) {
      work.done.add(key)
      if (typeof value === 'string') work.saved.set(key, value)
    }
    for (const [key, value] of Object.entries(drafts)) work.saved.set(key, value as string)
    for (const [key, value] of Object.entries(journal)) {
      work.journal.set(key, value as string)
      work.journalMonths.set(key, month)
    }
    work.months.set(month, { drafts: new Map(Object.entries(drafts) as [string, string][]), done: new Map(Object.entries(done) as [string, string | boolean][]) })
  }
  return { ok: true, value: { work, ...settings } }
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
 * 메모 결과를 넘기면 상병 확인이 부위 메모를 본다(AC-014.13). 메모를 만들지 않는 병원은 메모가 없다. 화면까지 잇는 것은 claimView다(AC-013.14)
 */
export function dxViews(month: ClaimMonth, links: readonly DxLink[], memos?: MemoViews): VisitDxView[] {
  const withMemo = new Set(memos?.memos.filter((memo) => memo.hasMemo).map((memo) => memo.visitKey))
  const ctx = dxContext({ trend: month.dxTrend, links, visits: month.visits, hasDx: month.hasDx, hasMemo: (visit) => withMemo.has(visit.key) })
  return month.visits.map((visit) => visitDxView(visit, ctx))
}

/** 규칙 엔진을 돌려 보기 모양으로 바꾼다(TASK-10). 메모 재료를 함께 받아 진료마다 메모를 싣는다(TASK-14). 메모를 못 만들어도 규칙 결과는 그대로다(AC-014.8). 화면으로 보내는 모양은 claimView다 */
export function checkMonth(month: ClaimMonth, tables: Tables, settings: RuleSettings, memo: MemoInput = { phrases: null }): CheckView {
  const { perVisit, groups, totals } = runRules(month, tables, settings)
  const memos = memoViews(month, tables, memo)
  const memoOf = new Map(memos.memos.map((view) => [view.visitKey, view]))
  return {
    visits: month.visits.map(({ key, chart, date, name }) => {
      const { hits, skippedNoHistory, skippedNoDx, checked } = perVisit.get(key)!
      return { key, chart, date, name, findings: hits, skippedNoHistory, skippedNoDx, checked, memo: memoOf.get(key) ?? null }
    }),
    groups: groups.map(({ ruleId, rule, grade, visits }) => ({ ruleId, title: rule.title, domain: rule.domain, grade, visitKeys: visits.map((row) => row.visitKey), basis: rule.basis })),
    totals,
    memoBlocked: memos.memoBlocked,
  }
}

/** 켜진 규칙 수. 엔진과 같은 판단이다: off가 on보다 앞서고 어디에도 없으면 규칙표 기본값 */
function enabledRules(tables: Tables, rules: SavedRuleSettings): number {
  const off = new Set(rules.off)
  const on = new Set(rules.on)
  return tables.rules.rules.filter((rule) => (off.has(rule.id) ? false : on.has(rule.id) || rule.enabled_default !== false)).length
}

/** 원본 collect 차례: 등급 차례, 같은 등급이면 건수 많은 차례 */
const byGradeThenCount = (a: CheckGroup, b: CheckGroup) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) || b.visitKeys.length - a.visitKeys.length

/**
 * 화면으로 보내는 점검 결과(AC-013.3·AC-013.13·AC-013.14). 계산은 읽은 달 전체로 하고(내원 간격, AC-014.6) 보기 모양은 고른 기간으로 자른다(design.md 19-9).
 * dxViews에는 메모 결과를 넘긴다(AC-014.13). 틀린 연결표로 던지면 상병 경고만 빠진 결과가 '문제 없음'처럼 보이지 않게 결과 없이 E-SETTINGS-FAILED다
 */
export function claimView(month: ClaimMonth, tables: Tables, settings: CheckSettings, saved: ReadonlyMap<string, string>, visible: DateRange): Outcome<ClaimView> {
  const checked = checkMonth(month, tables, settings.rules, { phrases: settings.phrases, saved })
  const memos: MemoViews = { memoBlocked: checked.memoBlocked, memos: checked.visits.flatMap((visit) => (visit.memo ? [visit.memo] : [])) }
  let dx: VisitDxView[]
  try {
    dx = dxViews(month, settings.dxLinks, memos)
  } catch {
    return { ok: false, code: 'E-SETTINGS-FAILED' }
  }
  const dxOf = new Map(dx.map((view) => [view.visitKey, view]))
  const sourceOf = new Map(month.visits.map((visit) => [visit.key, visit]))
  const visits: ClaimVisitView[] = checked.visits
    .filter((visit) => compareYmd(visit.date, visible.from) >= 0 && compareYmd(visit.date, visible.to) <= 0)
    .map((visit) => {
      const source = sourceOf.get(visit.key)!
      return { ...visit, rx: [...new Set(source.rx.map((line) => line.name))], dxNow: source.dx, dx: dxOf.get(visit.key)! }
    })
  const inside = new Set(visits.map((visit) => visit.key))
  const findings = visits.flatMap((visit) => visit.findings)
  const count = (grade: Grade) => findings.filter((finding) => finding.grade === grade).length
  return {
    ok: true,
    value: {
      period: visible,
      hasDx: month.hasDx,
      enabledRules: enabledRules(tables, settings.rules),
      memoBlocked: checked.memoBlocked,
      visits,
      groups: checked.groups
        .map((group) => ({ ...group, visitKeys: group.visitKeys.filter((key) => inside.has(key)) }))
        .filter((group) => group.visitKeys.length > 0)
        .sort(byGradeThenCount),
      totals: {
        checked: visits.filter((visit) => visit.checked > 0).length,
        hi: count('확인필요'),
        mid: count('알림'),
        lo: count('참고'),
        patients: visits.filter((visit) => visit.findings.some((finding) => finding.grade === '확인필요')).length,
        historySkips: checked.totals.historySkips,
      },
    },
  }
}

const isId = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= 128
const isLoad = (x: unknown): x is number => Number.isSafeInteger(x)
const isRange = (x: unknown): x is DateRange => isRecord(x) && typeof x.from === 'string' && typeof x.to === 'string' && isYmd(x.from) && isYmd(x.to)

/** 진료 달(YYYY-MM)들, 이른 달부터 */
const monthsOf = (month: ClaimMonth) => [...new Set(month.visits.map((v) => v.month))].sort()

const inRange = (date: string, { from, to }: DateRange) => compareYmd(date, from) >= 0 && compareYmd(date, to) <= 0
/** 쓰다 멈춘 기록(AC-017.7·AC-035.4) */
const isStuckState = (state: string | undefined) => state === 'writing' || state === 'writeUnconfirmed'
/** AC-035.8의 빠지는 사람 글. 화면이 스스로 알면 [이어서 입력] 아래에 먼저 보인다(AC-018.16) */
const CANNOT_CONTINUE = '이 환자는 입력에서 빠지는 사람이라 이어서 입력할 수 없습니다. 비트에서 메모 칸을 확인한 뒤 [직접 확인했어요]를 눌러 주세요.'
const NO_MEMO_NOTE = '넣을 메모가 없어 [이어서 입력]은 누를 수 없어요.'
/** 화면에서 미리 뺀 사람의 결과 이유(AC-018.4). 완료·메모 없음은 세지 않는다 */
const PRE_LEFT_REASON: Partial<Record<LeftReason, string>> = {
  diff: '이미 있음: 비트에 다른 메모가 있고 바꾸기를 승인하지 않았어요',
  manual: '직접 입력: 같은 날 진료가 여럿이에요',
  mark: '확인 표시가 남아 입력하지 않았습니다',
  unread: '비트 메모를 읽지 못해 넣지 않았어요',
  held: '지난번에 건너뛴 뒤 메모가 그대로예요',
}

/** 묶음 한 사람(명령 표 bit.input의 items). 화면을 지나지 않는다 */
type InputItem = { visitKey: string; chart: string; name: string; date: string; memo: string; replaces?: string; checkedByHand?: true }
type EndLine = { visitKey: string; result: string; reason: string; previousMemo?: string }
type InputEnd = { status: 'finished' | 'cancelled' | 'stopped'; code: string | null; reason: string | null; fields: string[]; results: EndLine[]; unconfirmed?: { visitKey: string; date: string }[]; noAsk: boolean }

/** 도우미 끝 JSON(helper InputOutcome.ToJson)을 읽는다. 모양이 틀리면 null: 결과를 지어내지 않는다(AC-018.21) */
export function readInputEnd(text: string): InputEnd | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || (raw.status !== 'finished' && raw.status !== 'cancelled' && raw.status !== 'stopped') || typeof raw.noAsk !== 'boolean' || !isStrings(raw.fields) || !Array.isArray(raw.results)) return null
  const optionalText = (x: unknown) => x === null || x === undefined || typeof x === 'string'
  if (!optionalText(raw.code) || !optionalText(raw.reason)) return null
  const results: EndLine[] = []
  for (const row of raw.results as unknown[]) {
    if (!isRecord(row) || typeof row.visitKey !== 'string' || typeof row.result !== 'string' || typeof row.reason !== 'string') return null
    if (row.previousMemo !== undefined && typeof row.previousMemo !== 'string') return null
    results.push({ visitKey: row.visitKey, result: row.result, reason: row.reason, ...(row.previousMemo === undefined ? {} : { previousMemo: row.previousMemo }) })
  }
  let unconfirmed: InputEnd['unconfirmed']
  if (raw.unconfirmed !== undefined) {
    if (!Array.isArray(raw.unconfirmed)) return null
    unconfirmed = []
    for (const row of raw.unconfirmed as unknown[]) {
      if (!isRecord(row) || typeof row.visitKey !== 'string' || typeof row.date !== 'string' || !isYmd(row.date)) return null
      unconfirmed.push({ visitKey: row.visitKey, date: row.date })
    }
  }
  return { status: raw.status, code: (raw.code as string | null | undefined) ?? null, reason: (raw.reason as string | null | undefined) ?? null, fields: raw.fields as string[], results, ...(unconfirmed ? { unconfirmed } : {}), noAsk: raw.noAsk }
}

export function createPrecheckJobs(deps: {
  post(message: PrecheckToScreen): void
  loadTables?: () => Promise<Outcome<Tables>>
  /** 통로 포트로 보낸다(도우미에 보낼 글자, 화면을 지나지 않는다). 포트가 없으면 보내지 않는다 */
  toPort?(message: PrecheckToPort): void
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
  /**
   * 이 불러오기에서 store.load {settings}로 받았거나 저장이 됐다는 답을 받은 설정 사본(AC-013.9). 새 loadStart가 지운다: 불러올 때마다 다시 묻고,
   * 다른 병원의 settings.dat면 거절되어 답이 없으므로 옛 사본을 남기면 '사본 없음'이어야 할 때 그것으로 점검한다
   */
  let settingsCopy: CheckSettings | null = null
  /** 저장 답을 기다리는 사본: 표(ticket) → 설정 */
  const savingCopies = new Map<number, CheckSettings>()
  let nextTicket = 1
  /** 마지막으로 답한 점검 결과(엑셀 재료). 새 loadStart·실패한 점검이 버린다 */
  let lastCheck: { check: number; view: ClaimView } | null = null
  /** 점검에 쓴 표·설정·고른 기간(메모 칸 재료)과 그 설정의 코드 사전(병원 문구가 검사를 지나지 못하면 null). 새 loadStart가 버린다 */
  let memoContext: { tables: Tables; settings: CheckSettings; visible: DateRange; codes: Pick<Phrases, 'CODEMAP' | 'CODEMAP_DEL'> | null } | null = null
  /** 메모 결과 캐시: 고를 때마다 메모를 다시 만들지 않게. 고친 글이나 설정이 바뀌면 지운다 */
  let viewsCache: MemoViews | null = null

  // ── 메모 칸(TASK-18). 모두 Worker 메모리에만 있다 ──
  /** 사람마다 승인: 내원번호 → 승인한 비트 글(AC-018.14). 풀 때는 지운다: visitMemos는 글이 같으면 다시 승인으로 치므로 남기면 X→Y→X에 되살아난다 */
  const approved = new Map<string, string>()
  /** 묻지 않기(AC-018.22). 끝 JSON으로만 바뀌고 오류 봉투로는 바뀌지 않는다. 새 통로에서 거짓으로 돌아간다 */
  let noAsk = false
  /** 지난번 건너뛴 사람: 내원번호 → 그때 글(AC-018.20). 원본 nmAutoHeld처럼 메모리에만 둔다 */
  const held = new Map<string, string>()
  /** 도우미가 같은 날 내원이 여럿이라 돌려준 사람(AC-018.13). 새 [자료 불러오기] 전까지 */
  const foundByPc = new Set<string>()
  /** 비트 메모를 받은 뒤 입력을 마친 사람(AC-018.25). 성공한 다시 불러오기가 지운다 */
  const afterEntry = new Set<string>()
  /** 이번 입력 결과가 완료가 아닌 사람: 내원번호 → 결과(날짜별 건수의 재료, AC-019.3). 새 [자료 불러오기]부터는 입력 기록이 대신한다 */
  const inputOutcomes = new Map<string, string>()
  /**
   * 마지막 답의 unconfirmed(AC-035.4). 날짜를 아는 유일한 자리라 [자료 불러오기]로 지우지 않는다: 띠가 그 날을 불러오라고 한 뒤에도 날짜가 있어야 한다(AC-018.16).
   * keepEdits 없는 loadStart(떠날 때, 사람이나 기관기호가 다를 때)는 지운다: 다른 의원의 사람을 띠에 보이지 않는다
   */
  let lastUnconfirmed: { visitKey: string; date: string }[] = []
  /** 달 칸 저장이 막혔다(AC-018.17). 달 칸 store.load가 성공해야 풀린다 */
  let storeBlocked = false
  /** 아직 PC에 저장되었다는 답을 못 받은 고친 글: 내원번호 → 글과 달 */
  let unsaved = new Map<string, { text: string; month: string }>()
  /** 저장해야 할 달과 그 달의 바뀐 차례. 답이 오면 그 차례까지 저장된 것이다 */
  const dirtyMonths = new Set<string>()
  const monthVersions = new Map<string, number>()
  const savingMonths = new Map<number, { month: string; version: number }>()
  /** 보낸 입력 묶음. 답을 기다리는 동안 다음 묶음을 보내지 않는다 */
  let inputRun: { run: number; ticket: number; items: InputItem[]; code: string | null; diffAtSend: string[]; lines: InputResultLine[]; uncounted: number; placeholders: Map<string, { date: string | null; month: string }> } | null = null
  /** 마지막 결과: [이어서 하기]·[다시 하기]·[엑셀로 저장]의 재료 */
  let lastInput: { items: InputItem[]; code: string | null; resume: string[]; retry: string[]; placeholders: Map<string, { date: string | null; month: string }>; rows: import('@/lib/precheck/excel').InputExcelRow[] } | null = null

  /** 조각이 다 오지 않았다(AC-009.2): 그 id의 조각은 assemble이 버렸다. 화면에 알리기만 한다 */
  const postPartial = (id: string) => deps.post({ type: 'partial', id, code: 'E-CLAIM-PARTIAL' })

  /**
   * 서버에서 읽은 설정을 도우미 사본으로 저장한다(AC-013.9). 글자는 포트로 바로 간다. 칸은 settings 하나뿐이다: 달 칸과 한 호출에 섞으면 파일 하나만 막혀도 호출 전체가 같은 번호로 거절된다.
   * 도우미가 거절해도(Phase 3 전 E-HELPER-UNKNOWN-COMMAND, 다른 병원의 settings.dat E-BIT-HOSPITAL-MISMATCH) 파일은 그대로이고 점검도 그대로다. 그 거절이 '건너뜀'이다
   */
  function saveCopy(settings: CheckSettings) {
    if (!deps.toPort) return
    const ticket = nextTicket++
    savingCopies.set(ticket, settings)
    deps.toPort({ type: 'send', ticket, cmd: 'store.save', payload: JSON.stringify({ settings }) })
  }

  /** 화면의 check(AC-013.5·AC-013.9·AC-013.14). 어떤 경우에도 답한다: 답이 없으면 화면이 기다리다 멈춘다. 오류 답에는 번호만 싣는다 */
  async function runCheck(check: number, load: number, visible: DateRange, fromScreen: unknown): Promise<void> {
    const fail = (code: ErrorCode) => {
      lastCheck = null
      deps.post({ type: 'check', check, load, ok: false, code })
    }
    const tables = await loadTables()
    if (!tables.ok) return fail(tables.code)
    // 번호는 표를 기다린 뒤에 본다(month와 같음): 기다리는 사이에 온 새 불러오기를 놓치지 않는다
    if (load !== latestLoad || !current) return fail('E-CLAIM-PARTIAL')
    const fromServer = fromScreen !== null
    const settings = fromServer ? readCheckSettings(fromScreen) : settingsCopy
    if (!settings) return fail('E-SETTINGS-FAILED')
    let view: Outcome<ClaimView>
    try {
      view = claimView(current, tables.value, settings, work.saved, visible)
    } catch {
      return fail('E-RULES-LOAD-FAILED') // 엔진의 뜻밖의 오류. 원래 글은 환자 글자를 담을 수 있어 싣지 않는다
    }
    if (!view.ok) return fail(view.code)
    // 승인은 사람이 나란히 본 글에만 친다: 자동 메모 글이 달라졌으면 푼다(AC-018.14). 실패한 점검은 여기 오지 않아 풀지 않는다
    const textOf = () => new Map(currentViews().memos.map((memo) => [memo.visitKey, memo.text]))
    const shownBefore = approved.size > 0 ? textOf() : null
    lastCheck = { check, view: view.value }
    // 병원 문구 검사는 점검 때 한 번이다: 코드 칸·코드 단추는 사람마다 코드마다 사전을 찾는다(AC-018.10·AC-018.11)
    const phrases = validatePhrases(settings.phrases)
    memoContext = { tables: tables.value, settings, visible, codes: phrases.ok ? phrases.value : null }
    viewsCache = null
    if (shownBefore) {
      const shownNow = textOf()
      for (const key of approved.keys()) if (shownNow.get(key) !== shownBefore.get(key)) approved.delete(key)
    }
    postDayCounts()
    deps.post({ type: 'check', check, load, ok: true, view: view.value, usedCopy: fromServer ? null : settings })
    if (fromServer) saveCopy(settings)
    saveDirtyMonths() // 막힌 동안 남긴 고친 글이 있으면 달 칸이 다시 읽힌 지금 저장한다(AC-018.17)
  }

  // ── 달 칸 저장(AC-018.2·AC-018.17) ──

  /** 고친·완료한 글이 바뀐 달을 적어 둔다 */
  function markMonth(month: string) {
    monthVersions.set(month, (monthVersions.get(month) ?? 0) + 1)
    dirtyMonths.add(month)
  }

  /**
   * 그 달의 store.save. 칸은 month·drafts·done뿐이다: settings·contact와 한 호출에 섞으면 파일 하나만 막혀도 호출 전체가 같은 번호로 거절된다.
   * 웹이 보내는 journal은 도우미가 저장하지 않으므로 보내지 않는다. store.load로 그 달을 받지 못했으면 보내지 않는다: 칸 전체를 바꾸므로 받지 못한 고친 메모를 덮는다(AC-018.17)
   */
  function saveMonth(month: string) {
    const file = work.months.get(month)
    if (!deps.toPort || storeBlocked || !file) return
    const ticket = nextTicket++
    savingMonths.set(ticket, { month, version: monthVersions.get(month) ?? 0 })
    deps.toPort({ type: 'send', ticket, cmd: 'store.save', payload: JSON.stringify({ month, drafts: Object.fromEntries(file.drafts), done: Object.fromEntries(file.done) }) })
  }
  function saveDirtyMonths() {
    for (const month of dirtyMonths) saveMonth(month)
  }

  /** 받아 둔 칸에 남은 고친 글을 다시 얹는다(막힌 채 새 [자료 불러오기]를 해도 고친 메모가 남는다, AC-018.17) */
  function applyUnsaved() {
    for (const [key, { text, month }] of unsaved) {
      work.saved.set(key, text)
      work.months.get(month)?.drafts.set(key, text)
      dirtyMonths.add(month)
    }
    viewsCache = null
  }

  // ── 메모 칸 보기 모양 ──

  function currentViews(): MemoViews {
    if (!current || !memoContext) return { memoBlocked: null, memos: [] }
    viewsCache ??= memoViews(current, memoContext.tables, { phrases: memoContext.settings.phrases, saved: work.saved })
    return viewsCache
  }

  /** 코드 사전 찾기(원본 cm: 글자 그대로 → 대문자 → 소문자). 병원 문구의 CODEMAP을 쓰고, 지운 코드는 없는 코드다 */
  function codeInfo(code: string) {
    const codes = memoContext?.codes
    if (!codes) return null
    const { CODEMAP, CODEMAP_DEL } = codes
    for (const key of [code, code.toUpperCase(), code.toLowerCase()]) if (Object.hasOwn(CODEMAP, key) && !CODEMAP_DEL.includes(key)) return CODEMAP[key]
    return null
  }

  /** 고른 기간의 진료 + 비교 상태 */
  function memoRows(): { rows: VisitMemo[]; visitOf: Map<string, Visit>; views: MemoViews } {
    const views = currentViews()
    const visible = memoContext?.visible
    const inside = visible ? (current?.visits ?? []).filter((visit) => inRange(visit.date, visible)) : []
    return { views, rows: visitMemos(inside, views.memos, { atLoad: memosAtLoad, latest: bitMemos, journal: work.journal, approved }), visitOf: new Map(inside.map((visit) => [visit.key, visit])) }
  }

  const rxNamesOf = (visit: Visit) => [...new Set(visit.rx.map((line) => line.name))]

  function targetVisits(rows: readonly VisitMemo[], visitOf: ReadonlyMap<string, Visit>): TargetVisit[] {
    const warned = new Set(lastCheck?.view.visits.filter((visit) => visit.findings.length > 0).map((visit) => visit.key))
    return rows.map((row) => {
      const visit = visitOf.get(row.key)!
      return { ...row, chart: visit.chart, name: visit.name, rx: visit.rx.map((line) => line.code), rxNames: rxNamesOf(visit), warned: warned.has(row.key) }
    })
  }

  /** 끝난 사람(AC-018.3): 완료 표시와 입력 기록의 마지막이 done인 사람. 입력 중에 떠나면 도우미는 journal에만 적어 done 칸에 글이 없다(helper WorkStoreJournal) */
  function finishedKeys(): ReadonlySet<string> {
    const keys = new Set(work.done)
    for (const [key, state] of work.journal) if (state === 'done') keys.add(key)
    return keys
  }

  function targetsFor(selection: InputSelection, rows: readonly VisitMemo[], visitOf: ReadonlyMap<string, Visit>, visible: DateRange): InputTargets {
    return inputTargets(targetVisits(rows, visitOf), selection, { visible, noAsk, done: finishedKeys(), held, foundByPc, codeInfo })
  }

  /**
   * 쓰다 멈춘 사람(AC-018.16): 입력 기록 사본의 writing·writeUnconfirmed와 마지막 답의 unconfirmed. 날짜를 모르면(store.load의 journal로만 안다) 달만 안다.
   * 고른 기간 밖이면 그 날·달을 불러오게 한다. 다 드는 가장 짧은 기간이 35일을 넘으면 가장 이른 날부터 35일이고, 그 기간을 불러온 뒤에도 밖인 사람은 자료에 없는 진료처럼 친다
   */
  function stuckView(rows: readonly VisitMemo[], visitOf: ReadonlyMap<string, Visit>, visible: DateRange): StuckView | null {
    const found = new Map<string, { date: string | null; month: string }>()
    for (const [key, state] of work.journal) if (isStuckState(state)) found.set(key, { date: null, month: work.journalMonths.get(key) ?? monthOf(visible.from) })
    for (const { visitKey, date } of lastUnconfirmed) found.set(visitKey, { date, month: monthOf(date) })
    if (found.size === 0) return null
    const spans = [...found.values()].map(({ date, month }) => (date ? { from: date, to: date } : monthRange(month)))
    const from = spans.map((span) => span.from).sort(compareYmd)[0]
    const last = spans.map((span) => span.to).sort(compareYmd).at(-1)!
    const target: DateRange = { from, to: diffDays(from, last) > 34 ? addDays(from, 34) : last }
    const targetLoaded = compareYmd(visible.from, target.from) <= 0 && compareYmd(visible.to, target.to) >= 0
    const rowOf = new Map(rows.map((row) => [row.key, row]))
    const sameDay = new Map<string, number>()
    for (const visit of current?.visits ?? []) sameDay.set(`${visit.chart}|${visit.date}`, (sameDay.get(`${visit.chart}|${visit.date}`) ?? 0) + 1)
    const people: StuckPerson[] = [...found].map(([key, { date, month }]) => {
      const row = rowOf.get(key)
      const visit = visitOf.get(key)
      if (row && visit) {
        const count = sameDay.get(`${visit.chart}|${visit.date}`) ?? 1
        const reason: LeftReason | null = !row.hasMemo || isBlankMemo(row.text) ? 'nomemo' : count > 1 || foundByPc.has(key) ? 'manual' : row.unfinished ? 'mark' : null
        return { key, state: 'known', date: visit.date, month: visit.month, name: visit.name, chart: visit.chart, rxNames: rxNamesOf(visit), reason, text: row.text, sameDay: count }
      }
      const covered = date ? inRange(date, visible) : compareYmd(visible.from, monthRange(month).from) <= 0 && compareYmd(visible.to, monthRange(month).to) >= 0
      return { key, state: covered || targetLoaded ? 'noData' : 'outside', date, month, name: null, chart: null, rxNames: [], reason: null, text: '', sameDay: 1 }
    })
    const outside = people.some((person) => person.state === 'outside')
    const canContinue = people.every((person) => person.state === 'known' && person.reason === null)
    const onlyNoMemo = people.every((person) => person.state === 'noData' || person.reason === 'nomemo' || person.reason === null)
    return {
      people,
      canContinue,
      canByHand: !outside,
      big: people.some((person) => person.state === 'known'),
      loadRange: outside ? target : null,
      note: canContinue || outside ? null : onlyNoMemo ? NO_MEMO_NOTE : CANNOT_CONTINUE,
    }
  }

  function memoScreenView(selection: InputSelection): MemoScreenView | null {
    if (!memoContext || !current) return null
    const { visible } = memoContext
    const { rows, visitOf, views } = memoRows()
    const blocked = views.memoBlocked
    const bit = { has: bitMemos !== null, count: bitMemos?.rows.size ?? 0, period: bitMemos?.period ?? null }
    const targets = targetsFor(selection, rows, visitOf, visible)
    const viewOf = new Map(views.memos.map((view) => [view.visitKey, view]))
    const finished = finishedKeys()
    return {
      period: visible,
      memoBlocked: blocked,
      noAsk,
      targets,
      table: rows.map((row) => {
        const visit = visitOf.get(row.key)!
        const memo = viewOf.get(row.key)
        return { ...row, chart: visit.chart, name: visit.name, rxNames: rxNamesOf(visit), edited: memo?.edited ?? false, missing: memo?.missing ?? [], done: finished.has(row.key) || row.compare === '같음', unsaved: unsaved.has(row.key), afterEntry: afterEntry.has(row.key) }
      }),
      stuck: blocked ? null : stuckView(rows, visitOf, visible),
      bit,
    }
  }

  /**
   * 날짜별 건수를 화면에 보낸다(AC-019.3·AC-019.4). 불러오기(점검)·성공한 비트 메모 다시 불러오기·입력이 끝날 때 그 답 바로 앞에 부른다. 실패한 쪽에서는 부르지 않는다(AC-016.8).
   * 믿을 수 없는 수는 보내지 않는다: 메모를 만들지 않는 병원, 불러올 때 비트 메모를 받지 못한 때(뒤에 다시 불러와도 그 불러오기의 비교는 모두 조회 못함이다), 달 칸이 막힌 때(완료 표시가 없어 입력 수가 떨어진다).
   * 진료가 없는 기간이면 빈 줄과 기간을 보낸다: 사라진 날을 화면이 덮을 수 있게. 건수는 곁일이다: 여기서 난 오류로 점검·입력 답이 막히지 않는다
   */
  function postDayCounts() {
    if (!memoContext || latestLoad === null || !memosAtLoad || !bitMemos || storeBlocked) return
    try {
      const { rows, views } = memoRows()
      if (views.memoBlocked) return
      deps.post({ type: 'dayCounts', load: latestLoad, rows: dayCounts({ rows, finished: finishedKeys(), results: inputOutcomes }), range: memoContext.visible })
    } catch {
      // 원래 글은 환자 글자를 담을 수 있어 어디에도 싣지 않는다. 다음 불러오기에 다시 만든다
    }
  }

  // ── 입력 묶음(AC-018.3·AC-018.16·AC-018.20·AC-018.21) ──

  /** 메모가 있는 보통 줄. 승인이 있으면 replaces로 싣는다(AC-037.1) */
  function itemOf(row: VisitMemo, visit: Visit): InputItem {
    return { visitKey: row.key, chart: visit.chart, name: visit.name, date: visit.date, memo: row.text, ...(row.approved === undefined ? {} : { replaces: row.approved }) }
  }

  function buildBatch(what: InputWhat, selection: InputSelection): { items: InputItem[]; code: string | null; placeholders: Map<string, { date: string | null; month: string }>; preLeft: { reason: LeftReason; row: { key: string; date: string; month: string; name: string; chart: string; text: string; inBit?: string } }[]; uncounted: number; diffAtSend: string[] } | null {
    if (!memoContext || !current || storeBlocked) return null
    const { visible } = memoContext
    const { rows, visitOf, views } = memoRows()
    if (views.memoBlocked) return null
    const targets = targetsFor(selection, rows, visitOf, visible)
    const diffAtSend = targets.left.find((group) => group.reason === 'diff')?.rows.map((row) => row.key) ?? []
    const none = new Map<string, { date: string | null; month: string }>()
    const rowOf = new Map(rows.map((row) => [row.key, row]))
    const plain = (keys: readonly string[]) => keys.flatMap((key) => {
      const row = rowOf.get(key)
      const visit = visitOf.get(key)
      return row && visit ? [itemOf(row, visit)] : []
    })
    if (what === 'selection') {
      if (stuckView(rows, visitOf, visible) || targets.batch.length === 0) return null
      const preLeft = targets.left.flatMap((group) => (group.reason === 'done' || group.reason === 'nomemo' ? [] : group.rows.map((row) => ({ reason: group.reason, row: { key: row.key, date: row.date, month: visitOf.get(row.key)!.month, name: row.name, chart: row.chart, text: row.text, ...(row.inBit === undefined ? {} : { inBit: row.inBit }) } }))))
      const uncounted = targets.left.reduce((sum, group) => sum + (group.reason === 'done' || group.reason === 'nomemo' ? group.rows.length : 0), 0)
      return { items: plain(targets.batch.map((row) => row.key)), code: targets.code, placeholders: none, preLeft, uncounted, diffAtSend }
    }
    if (what === 'held') {
      const keys = targets.left.find((group) => group.reason === 'held')?.rows.map((row) => row.key) ?? []
      if (keys.length === 0) return null
      for (const key of keys) held.delete(key)
      return { items: plain(keys), code: targets.code, placeholders: none, preLeft: [], uncounted: 0, diffAtSend }
    }
    if (what === 'retry') {
      if (!lastInput || lastInput.retry.length === 0) return null
      for (const key of lastInput.retry) held.delete(key)
      return { items: plain(lastInput.retry), code: lastInput.code, placeholders: none, preLeft: [], uncounted: 0, diffAtSend }
    }
    if (what === 'resume') {
      if (!lastInput || lastInput.resume.length === 0) return null
      // [이어서 하기]에는 checkedByHand를 싣지 않는다: 다시 실으면 쓰다 멈춘 사람으로 보지 않아 저장 안 된 글이 새 확인 없이 넘어갈 수 있다(AC-018.21).
      // 글과 승인은 지금 값이다: 그새 [다시 점검]·[바꾸지 않기]를 했으면 표에 보이는 글이 들어가야 한다(AC-014.11·AC-018.14). 빈 메모·자리 채움 값은 보낸 그대로다
      const resume = new Set(lastInput.resume)
      const items = lastInput.items
        .filter((item) => resume.has(item.visitKey))
        .map((item) => {
          const row = rowOf.get(item.visitKey)
          const next: InputItem = { visitKey: item.visitKey, chart: item.chart, name: item.name, date: item.date, memo: item.memo }
          if (row && !isBlankMemo(item.memo)) {
            next.memo = isBlankMemo(row.text) ? ' ' : row.text
            if (row.approved !== undefined) next.replaces = row.approved
          } else if (item.replaces !== undefined) next.replaces = item.replaces
          return next
        })
      // 자리 채움 값도 보낸 그대로이므로 그 표시를 잇는다: 잃으면 결과 줄과 엑셀에 그 값이 보인다(AC-018.15)
      return { items, code: lastInput.code, placeholders: lastInput.placeholders, preLeft: [], uncounted: 0, diffAtSend }
    }
    const stuck = stuckView(rows, visitOf, visible)
    if (!stuck) return null
    if (what === 'continueStuck') {
      if (!stuck.canContinue) return null
      return { items: plain(stuck.people.map((person) => person.key)), code: null, placeholders: none, preLeft: [], uncounted: 0, diffAtSend }
    }
    if (!stuck.canByHand) return null
    // [직접 확인했어요]: 거르기를 지나지 않고 모두 보낸다(뺄지는 도우미가 정한다, AC-035.8). 빈 메모는 한 칸 공백, 자료에 없는 진료는 자리 채움 값이고 이 값은 비트에 닿지 않는다(AC-018.16)
    const placeholders = new Map<string, { date: string | null; month: string }>()
    const taken = new Set<string>()
    let order = 0
    const fill = () => String(++order).padStart(20, '0')
    const items: InputItem[] = stuck.people.map((person) => {
      approved.delete(person.key) // 도우미는 replaces를 새 승인으로 본다: 남기면 손으로 다루던 메모가 바뀐다(AC-018.14·AC-037.6)
      const row = rowOf.get(person.key)
      const visit = visitOf.get(person.key)
      if (person.state === 'known' && row && visit) {
        // 같은 차트번호·내원일이 또 있으면 묶음 검사에 걸려 풀리지 않는다. 어차피 열지 않는 사람이라 자리 채움 번호와 한 칸 공백으로 보낸다.
        // 메모를 실으면 도우미가 '내원일 없음'으로 돌려줘 [다시 하기]에 든다. 공백이면 '넣을 메모가 없어'가 앞선다(helper InputBatch.DropReason)
        const again = taken.has(`${visit.chart}|${visit.date}`)
        taken.add(`${visit.chart}|${visit.date}`)
        const memo = again || !row.hasMemo || isBlankMemo(row.text) ? ' ' : row.text
        return { visitKey: person.key, chart: again ? fill() : visit.chart, name: visit.name, date: visit.date, memo, checkedByHand: true }
      }
      placeholders.set(person.key, { date: person.date, month: person.month })
      return { visitKey: person.key, chart: fill(), name: '-', date: person.date ?? `${person.month}-01`, memo: ' ', checkedByHand: true }
    })
    viewsCache = null
    return { items, code: null, placeholders, preLeft: [], uncounted: 0, diffAtSend }
  }

  /**
   * 끝 JSON을 받아 Worker 메모리와 사본에 적고 화면에 넘길 결과를 만든다(AC-018.21·AC-016.3·AC-018.13·AC-018.20·AC-018.22, design.md 19-6).
   * 완료한 메모는 글을 done에 남긴다: 표시만 남기면 다시 불러온 뒤 설정이 바뀌었을 때 글이 바뀐다(AC-014.11)
   */
  function applyInputResults(end: InputEnd, run: NonNullable<typeof inputRun>): InputResultView {
    const wasNoAsk = noAsk
    noAsk = end.noAsk
    const itemOfKey = new Map(run.items.map((item) => [item.visitKey, item]))
    const visits = new Map((current?.visits ?? []).map((visit) => [visit.key, visit]))
    const rowOf = new Map(memoRows().rows.map((row) => [row.key, row]))
    const quiet = end.code === 'E-STORE-FAILED' || (end.unconfirmed?.length ?? 0) > 0
    const noWindow = end.results.length > 0 && end.results.every((line) => isPlainExclusion(line.reason))
    const resolved = new Set<string>()
    const lines: InputResultLine[] = []
    for (const line of end.results) {
      const key = line.visitKey
      const item = itemOfKey.get(key)
      const visit = visits.get(key)
      const byHand = item?.checkedByHand === true
      const notDone = line.result === '확인 필요' && line.reason.startsWith(NOT_DONE)
      if (line.result === '완료') {
        approved.delete(key)
        held.delete(key)
        afterEntry.add(key)
        resolved.add(key)
        work.done.add(key)
        if (item && visit) {
          work.saved.set(key, work.saved.get(key) ?? item.memo)
          work.months.get(visit.month)?.done.set(key, item.memo)
          markMonth(visit.month)
        }
        if (!quiet) work.journal.set(key, 'done')
      } else if (byHand && (line.result === '건너뜀' || notDone)) {
        resolved.add(key)
        if (!quiet) {
          // [확인] 없이 끝난 묶음은 도우미 기록도 skipped다. skippedByHand는 덮지 않는다
          if (!noWindow) work.journal.set(key, 'skippedByHand')
          else if (work.journal.get(key) !== 'skippedByHand') work.journal.set(key, 'skipped')
        }
      } else if (byHand && line.result === '확인 필요' && line.reason.startsWith(NOT_ACCEPTED)) {
        // 도우미 기록은 SkippedByHand로 바뀌었다(AC-035.5). 안 적으면 다시 불러오기 전까지 띠가 [비트에 입력]을 막는다(AC-016.3)
        resolved.add(key)
        if (!quiet && (isStuckState(work.journal.get(key)) || lastUnconfirmed.some((person) => person.visitKey === key))) work.journal.set(key, 'skippedByHand')
      }
      if (line.result === '건너뜀') {
        const kind = reasonKind(line.reason)
        if (kind === 'manual') foundByPc.add(key)
        else if (kind !== 'nomemo' && kind !== 'already' && kind !== 'changed' && item) held.set(key, item.memo)
      }
      const place = run.placeholders.get(key)
      const row = rowOf.get(key)
      const retry = line.result === '건너뜀' && !place && visit !== undefined && !['already', 'manual', 'nomemo'].includes(reasonKind(line.reason)) && row !== undefined && !row.unfinished && row.compare !== '조회 못함'
      lines.push({
        key,
        date: place ? place.date : (visit?.date ?? item?.date ?? null),
        month: place ? place.month : (visit?.month ?? (item ? monthOf(item.date) : '')),
        name: place ? null : (visit?.name ?? null),
        chart: place ? null : (visit?.chart ?? null),
        result: line.result,
        reason: line.reason,
        ...(line.previousMemo === undefined ? {} : { previousMemo: line.previousMemo }),
        ...(item && !place && !isBlankMemo(item.memo) ? { memo: item.memo } : {}), // 한 칸 공백은 보내려고 채운 값이다(AC-018.15)
        retry,
      })
    }
    for (const line of run.lines) lines.push(line) // 화면에서 미리 뺀 사람(AC-018.4)
    if (end.status !== 'cancelled') {
      for (const line of lines) {
        if (line.result === '완료') inputOutcomes.delete(line.key)
        else inputOutcomes.set(line.key, line.result)
      }
    }

    if (end.unconfirmed) lastUnconfirmed = end.unconfirmed
    else if (!quiet) lastUnconfirmed = lastUnconfirmed.filter((person) => !resolved.has(person.visitKey))
    // 이번 입력에서 처음 쓰다 멈춘 사람은 답의 unconfirmed에도 사본에도 없고 결과 줄로만 안다(AC-018.16). 사본은 적지 않는다(도우미 기록과 같은지 모른다, design.md 19-6)
    const writeStuck = end.results.filter((line) => isWriteStuck(line.result, line.reason) && !run.placeholders.has(line.visitKey))
    for (const { visitKey } of writeStuck) {
      const date = visits.get(visitKey)?.date ?? itemOfKey.get(visitKey)?.date
      if (date && !lastUnconfirmed.some((person) => person.visitKey === visitKey)) lastUnconfirmed = [...lastUnconfirmed, { visitKey, date }]
    }

    viewsCache = null
    saveDirtyMonths()

    const firstNoAsk = !wasNoAsk && end.noAsk ? run.diffAtSend.filter((key) => !itemOfKey.has(key) && work.journal.get(key) !== 'skippedByHand').length : null
    // 쓰다 멈춘 사람도 함께 보낸다: 빼면 도우미가 다른 사람을 열지 않고 멈춘다(AC-035.4). 도우미가 그 사람을 맨 앞에서 먼저 한다(AC-017.7)
    // 결과 줄이 없는 사람도 남은 사람이다: 지문이 틀리면 미리 뺀 사람의 줄만 오고, 줄이 하나도 없을 수도 있다(AC-018.21)
    const answered = new Set(end.results.map((line) => line.visitKey))
    const unanswered = run.items.filter((item) => !answered.has(item.visitKey)).map((item) => item.visitKey)
    const notDone = (line: EndLine) => line.result === '확인 필요' && line.reason.startsWith(NOT_DONE)
    const resume = [...unanswered, ...end.results.filter((line) => notDone(line) || isWriteStuck(line.result, line.reason)).map((line) => line.visitKey)]
    const retry = lines.filter((line) => line.retry).map((line) => line.key)
    lastInput = {
      items: run.items,
      code: run.code,
      resume: end.status === 'stopped' ? resume : [],
      retry,
      placeholders: run.placeholders,
      rows: lines.map((line) => ({ date: line.date ?? line.month, chart: line.chart ?? '', name: line.name ?? '', result: line.result, reason: line.reason, memo: line.memo ?? '', existing: line.previousMemo ?? rowOf.get(line.key)?.inBit ?? '' })),
    }
    return {
      status: end.status,
      code: end.code,
      reason: end.reason,
      fields: end.fields,
      done: lines.filter((line) => line.result === '완료'),
      check: lines.filter((line) => line.result === '확인 필요'),
      skipped: lines.filter((line) => line.result !== '완료' && line.result !== '확인 필요'),
      uncounted: run.uncounted,
      retry: retry.length,
      entered: end.results.filter((line) => line.result === '완료').length,
      left: unanswered.length + end.results.filter(notDone).length,
      firstNoAsk,
    }
  }

  /** 화면의 buildInputBatch: 묶음 글자는 여기서 만들어 포트로 바로 보낸다(AC-004.11). 답은 inputStart 하나다 */
  function startInput(runNumber: number, what: InputWhat, selection: InputSelection) {
    if (inputRun) return deps.post({ type: 'inputStart', run: runNumber, ok: false, code: 'E-BRIDGE-BUSY' })
    const built = deps.toPort ? buildBatch(what, selection) : null
    if (!built || built.items.length === 0) return deps.post({ type: 'inputStart', run: runNumber, ok: false, code: 'E-HELPER-BAD-MESSAGE' })
    const ticket = nextTicket++
    const lines: InputResultLine[] = built.preLeft.map(({ reason, row }) => ({ key: row.key, date: row.date, month: row.month, name: row.name, chart: row.chart, result: '건너뜀', reason: PRE_LEFT_REASON[reason] ?? '', memo: row.text, retry: reason === 'held' }))
    inputRun = { run: runNumber, ticket, items: built.items, code: built.code, diffAtSend: built.diffAtSend, lines, uncounted: built.uncounted, placeholders: built.placeholders }
    const handChecked = built.items.some((item) => item.checkedByHand)
    deps.toPort!({ type: 'send', ticket, cmd: 'bit.input', payload: JSON.stringify(built.code ? { code: built.code, items: built.items } : { items: built.items }) })
    deps.post({ type: 'inputStart', run: runNumber, ok: true, count: built.items.length, askPc: !noAsk || handChecked })
  }

  /** 보낸 묶음의 답. id가 있으면 끝 JSON이 조각으로 와 있다 */
  async function finishInput(run: NonNullable<typeof inputRun>, answer: Rec) {
    const fail = (code: string) => {
      if (inputRun === run) inputRun = null
      deps.post({ type: 'inputDone', run: run.run, ok: false, code })
    }
    if (answer.ok !== true) return fail(typeof answer.code === 'string' ? answer.code : 'E-BRIDGE-REJECTED')
    if (!isId(answer.id)) return fail('E-CLAIM-PARTIAL')
    const assembled = await assembler.take(answer.id)
    if (inputRun !== run) return // 그새 통로가 바뀌었다: 화면이 답을 기다리지 않는다
    const end = assembled.ok ? readInputEnd(assembled.text) : null
    if (!end) return fail('E-CLAIM-PARTIAL')
    inputRun = null
    const result = applyInputResults(end, run)
    postDayCounts()
    deps.post({ type: 'inputDone', run: run.run, ok: true, result })
  }

  /** [엑셀로 저장](AC-018.15): 누를 때만 만든다 */
  async function runInputExcel(ask: number) {
    const fail = () => deps.post({ type: 'inputExcel', ask, ok: false, code: 'E-CLAIM-PARTIAL' })
    if (!lastInput || !memoContext) return fail()
    try {
      const { buildInputExcel, inputExcelName } = await import('@/lib/precheck/excel')
      deps.post({ type: 'inputExcel', ask, ok: true, bytes: buildInputExcel(lastInput.rows), fileName: inputExcelName(memoContext.visible) })
    } catch {
      fail()
    }
  }

  /** 화면의 excel(AC-013.4). 그 점검 결과로만 만든다. xlsx는 누를 때만 불러온다(규칙표와 같이 고정 경로 import()) */
  async function runExcel(check: number): Promise<void> {
    const fail = () => deps.post({ type: 'excel', check, ok: false, code: 'E-CLAIM-PARTIAL' })
    if (lastCheck?.check !== check) return fail()
    const { view } = lastCheck
    try {
      const { buildClaimExcel, claimExcelName } = await import('@/lib/precheck/excel')
      deps.post({ type: 'excel', check, ok: true, bytes: buildClaimExcel(view), fileName: claimExcelName(view.period) })
    } catch {
      fail()
    }
  }

  return {
    /** 통로 포트로 온 메시지(design.md 6-1): chunk·end·abort, sent(설정 사본 저장 결과) */
    async fromPort(m: unknown): Promise<void> {
      if (!isRecord(m)) return
      if (m.type === 'sent' && typeof m.ticket === 'number') {
        const saved = savingCopies.get(m.ticket)
        if (saved) {
          // 사본 저장 실패는 조용히 건너뛴다(settings.dat의 같은 번호 포함, AC-018.17)
          savingCopies.delete(m.ticket)
          if (m.ok === true) settingsCopy = saved
          return
        }
        const saving = savingMonths.get(m.ticket)
        if (saving) {
          savingMonths.delete(m.ticket)
          if (m.ok === true) {
            if (saving.version === (monthVersions.get(saving.month) ?? 0)) {
              dirtyMonths.delete(saving.month)
              for (const [key, edit] of unsaved) if (edit.month === saving.month) unsaved.delete(key)
            }
            deps.post({ type: 'memoSave', ok: true })
          } else {
            const code = typeof m.code === 'string' ? m.code : 'E-STORE-FAILED'
            if (code === 'E-BIT-HOSPITAL-MISMATCH') storeBlocked = true
            deps.post({ type: 'memoSave', ok: false, code, blocked: storeBlocked })
          }
          return
        }
        if (inputRun?.ticket === m.ticket) await finishInput(inputRun, m)
        return
      }
      if (!isId(m.id)) return
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
        lastCheck = null
        settingsCopy = null
        savingCopies.clear()
        memoContext = null
        viewsCache = null
        approved.clear()
        held.clear()
        foundByPc.clear()
        afterEntry.clear()
        inputOutcomes.clear()
        lastInput = null
        savingMonths.clear()
        // 저장하지 못한 고친 메모는 메모리에만 있다. [자료 불러오기]·[멈추기]로 지우면 옛 글이 비트에 들어가고(AC-018.2) "고친 메모는 이 화면에 그대로 있어요"가 거짓이 된다(AC-018.17)
        if (m.keepEdits === true) {
          applyUnsaved()
        } else {
          unsaved = new Map()
          dirtyMonths.clear()
          storeBlocked = false
          lastUnconfirmed = []
        }
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
            else {
              // 비트 메모 글이 승인한 글과 달라진 사람의 승인을 지운다. 지우지 않으면 글이 돌아왔을 때(X→Y→X) 되살아난다(AC-018.14)
              for (const [key, text] of approved) {
                const visit = current?.visits.find((row) => row.key === key)
                const inBit = visit ? bitMemoOf(memos.value, visit) : undefined
                if (inBit === undefined || compareMemo(text, inBit) !== '같음') approved.delete(key)
              }
              afterEntry.clear()
              postDayCounts()
            }
          }
          answer(memos)
        } else {
          const stored = loadStore(assembled.text)
          if (stored.ok) {
            if (stored.value.work) {
              work = stored.value.work
              storeBlocked = false // 달 칸이 읽혔다(AC-018.17)
              applyUnsaved()
              // 그 달을 읽었는데 기록이 쓰다 멈춤이 아니면 풀린 사람이다(떠나 있는 동안 끝났을 수 있다). 읽지 않은 달은 모른다
              lastUnconfirmed = lastUnconfirmed.filter((person) => !work.months.has(monthOf(person.date)) || isStuckState(work.journal.get(person.visitKey)))
            }
            if (stored.value.settings !== undefined) settingsCopy = stored.value.settings
          }
          answer(stored)
        }
      } else if (m.type === 'ruleList') {
        const tables = await loadTables()
        deps.post(tables.ok ? { type: 'ruleList', ok: true, rules: ruleList(tables.value) } : { type: 'ruleList', ok: false, code: tables.code })
      } else if (m.type === 'check' && isLoad(m.check) && isLoad(m.load) && isRange(m.visible) && m.settings !== undefined) {
        await runCheck(m.check, m.load, m.visible, m.settings)
      } else if (m.type === 'excel' && isLoad(m.check)) {
        await runExcel(m.check)
      } else if (m.type === 'memoView' && isLoad(m.ask) && isRecord(m.selection)) {
        const view = memoScreenView(m.selection as InputSelection)
        deps.post(view ? { type: 'memoView', ask: m.ask, ok: true, view } : { type: 'memoView', ask: m.ask, ok: false, code: 'E-CLAIM-PARTIAL' })
      } else if (m.type === 'editMemo' && typeof m.visitKey === 'string' && typeof m.text === 'string') {
        const visit = current?.visits.find((row) => row.key === m.visitKey)
        if (!visit) return
        // 글이 그대로면 고친 것이 아니다: 저장하면 자동 메모가 얼어 설정을 바꿔도 다시 만들어지지 않는다(AC-014.11)
        if (currentViews().memos.find((memo) => memo.visitKey === visit.key)?.text === m.text) return
        approved.delete(visit.key) // 우리 메모를 고치면 승인이 풀린다(AC-018.14)
        work.saved.set(visit.key, m.text)
        work.months.get(visit.month)?.drafts.set(visit.key, m.text)
        unsaved.set(visit.key, { text: m.text, month: visit.month })
        viewsCache = null
        markMonth(visit.month)
        saveMonth(visit.month)
      } else if (m.type === 'memoApprove' && typeof m.visitKey === 'string') {
        if (m.approved !== true) approved.delete(m.visitKey)
        else {
          const row = memoRows().rows.find((item) => item.key === m.visitKey)
          // 보인 비트 메모를 담는다(AC-018.14). 메모를 만들지 않은 병원은 줄이 없다
          if (row?.compare === '다름' && row.inBit !== undefined) approved.set(row.key, row.inBit)
        }
      } else if (m.type === 'memoSaveRetry') {
        saveDirtyMonths()
      } else if (m.type === 'storeBlock') {
        storeBlocked = true
      } else if (m.type === 'buildInputBatch' && isLoad(m.run) && isRecord(m.selection) && typeof m.what === 'string') {
        startInput(m.run, m.what as InputWhat, m.selection as InputSelection)
      } else if (m.type === 'inputExcel' && isLoad(m.ask)) {
        await runInputExcel(m.ask)
      }
    },

    /**
     * 새 bridge-port를 받았다(design.md 6-1). 새 통로의 도우미는 새 프로세스라 묻지 않기가 꺼져 있다(AC-018.22).
     * 옛 통로로 보낸 것의 답은 오지 않는다: useBridge가 닫으면서 보낸 거절도 포트가 먼저 닫혀 닿지 않는다.
     * 입력 묶음은 잊는다(도우미는 끝까지 하고 결과를 작업 저장에 남긴다, AC-003.7·AC-017.9). 저장 답을 못 받은 달은 저장 안 됨으로 남아 다시 보낸다
     */
    portChanged(): void {
      noAsk = false
      viewsCache = null
      inputRun = null
      savingCopies.clear()
      savingMonths.clear()
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
