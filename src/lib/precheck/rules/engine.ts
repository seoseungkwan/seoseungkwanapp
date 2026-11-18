import type { ClaimMonth, Finding, Grade, RuleDef, RuleSettings, Tables, Visit } from '@/types/precheck'
import { PAST_HANDLERS } from './past'
import { createRun, hit, type RoleMap, type Run } from './run'
import { SAME_DAY_HANDLERS, type Handler } from './sameDay'
import { statusesOf } from './status'
import type { Hit, Outcome } from './types'

// 점검 규칙 엔진(REQ-010) [환자 자료 구역]. 원본 양지바른 사전점검(seoseungkwan/shared@2a1069b) new-medicore-precheck의 evaluate·collect를 옮겼다.
// 결과는 알려 주기만 한다. 규칙표 262개 중 자동으로 판정할 수 있는 것만 돌고(status.ts), 원본과 순서까지 같은지 golden.test.ts가 본다.
// 원본과 다른 점: 전역 값 대신 month·tables를 받는다. 이력은 늘 함께 오므로 이력 건너뜀은 늘 0이다(AC-010.5)

export type { RuleSettings } from '@/types/precheck'
export type { RuleStatus } from './status'

const GRADES: readonly string[] = ['확인필요', '알림', '참고']
const HY12_FROM = ['HY-01', 'HY-02', 'HY-03', 'HY-04', 'HY-06', 'HY-07']
const HANDLERS: Partial<Record<RuleDef['type'], Handler>> = { ...SAME_DAY_HANDLERS, ...PAST_HANDLERS }

/** 바꾼 것이 없는 설정 */
export const NO_SETTINGS: RuleSettings = { off: [], on: [], grade: {} }

export type VisitResult = { hits: Finding[]; skippedNoHistory: 0; skippedNoDx: number; checked: number }
export type ResultRow = { visitKey: string; finding: Finding }
/** 원본 collect의 byRule 한 묶음 */
export type CollectGroup = { ruleId: string; rule: RuleDef; grade: Grade; visits: ResultRow[] }
export type RunTotals = { checked: number; hi: number; mid: number; lo: number; patients: number; historySkips: number }
export type RunResult = {
  /** 진료 번호 → 결과 */
  perVisit: Map<string, VisitResult>
  /** 규칙별 묶음: 등급 차례, 같은 등급이면 건수 많은 차례 */
  groups: CollectGroup[]
  /** 내원별 줄(원본 rows) */
  rows: ResultRow[]
  totals: RunTotals
}

/** 규칙 번호 → 상태(자동·이력·SAM·수동). 지금은 시험(골든·규칙 덮기)만 쓴다 */
export const ruleStatuses = (tables: Pick<Tables, 'rules'>) => statusesOf(tables.rules)

function readSettings(settings: RuleSettings) {
  const pairs = Array.isArray(settings.grade) ? settings.grade : (Object.entries(settings.grade) as [string, Grade][])
  return { off: new Set(settings.off), on: new Set(settings.on), grade: new Map<string, Grade>(pairs) }
}
type Settings = ReturnType<typeof readSettings>

const enabled = (settings: Settings, rule: RuleDef) => (settings.off.has(rule.id) ? false : settings.on.has(rule.id) ? true : rule.enabled_default !== false)

function evaluate(v: Visit, run: Run, settings: Settings, statuses: Map<string, string>): VisitResult {
  const c = run.contextOf(v)
  const hits: Hit[] = []
  let skippedNoDx = 0
  let checked = 0
  if (c.lines.length) {
    for (const rule of run.tables.rules.rules) {
      const status = statuses.get(rule.id)
      const handler = HANDLERS[rule.type]
      if ((status !== 'auto' && status !== 'hist') || !enabled(settings, rule) || !handler) continue
      if (rule.effective_from && c.date < rule.effective_from) continue
      if (rule.effective_to && c.date > rule.effective_to) continue
      let out: Outcome
      try {
        out = handler(rule, c, run)
      } catch {
        out = null // 규칙 하나의 문제로 점검 전체를 멈추지 않는다(원본 그대로)
      }
      checked++
      if (out === 'skip') skippedNoDx++
      else if (out) hits.push(out)
    }
    // HY-12: 히알루론산 기준 밖이면 약값 U항
    const hy = run.C.BY_ID.get('HY-12')
    if (hy && enabled(settings, hy)) {
      const from = hits.filter((h) => HY12_FROM.includes(h.id) && h.grade === '확인필요')
      if (from.length && c.ben.some((l) => [...l.classes].some((x) => /^hyaluronate/.test(x)))) {
        hits.push(hit(hy, '알림', hy.message, `${from.map((h) => h.id).join('·')} 기준 밖 → 약값 U항(전액 본인부담) 처리 확인`))
      }
    }
    // 등급을 직접 고르면 그 등급으로 고정한다(U항·차트 밖 근거로 낮춘 등급보다 먼저)
    hits.forEach((h) => {
      h.grade = settings.grade.get(h.rule.id) || h.grade || h.rule.grade
    })
    hits.sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || a.id.localeCompare(b.id))
  }
  return {
    hits: hits.map((h) => ({ visitKey: v.key, ruleId: h.id, grade: h.grade, message: h.message, detail: h.detail, basis: h.rule.basis })),
    skippedNoHistory: 0,
    skippedNoDx,
    checked,
  }
}

/**
 * 한 달 자료를 점검한다. 원본 collect처럼 진료 차례대로 돌고 규칙별로 묶는다.
 * roles: 처방코드별 약 역할(drugRoles, REQ-6608). 없으면 처방 목록 대기 줄의 성분 역할만 본다
 */
export function runRules(month: ClaimMonth, tables: Tables, settings: RuleSettings, roles: RoleMap = new Map()): RunResult {
  const run = createRun(month, tables, roles)
  const current = readSettings(settings)
  const statuses = statusesOf(tables.rules)
  const perVisit = new Map<string, VisitResult>()
  const byRule = new Map<string, CollectGroup>()
  const rows: ResultRow[] = []
  const totals: RunTotals = { checked: 0, hi: 0, mid: 0, lo: 0, patients: 0, historySkips: 0 }

  for (const v of month.visits) {
    const r = evaluate(v, run, current, statuses)
    perVisit.set(v.key, r)
    if (r.checked) totals.checked++
    if (r.hits.some((h) => h.grade === '확인필요')) totals.patients++
    for (const finding of r.hits) {
      const row = { visitKey: v.key, finding }
      const item = byRule.get(finding.ruleId) ?? { ruleId: finding.ruleId, rule: run.C.BY_ID.get(finding.ruleId) as RuleDef, grade: finding.grade, visits: [] }
      item.visits.push(row)
      byRule.set(finding.ruleId, item)
      rows.push(row)
      if (finding.grade === '확인필요') totals.hi++
      else if (finding.grade === '알림') totals.mid++
      else totals.lo++
    }
  }
  const groups = [...byRule.values()].sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || b.visits.length - a.visits.length)
  return { perVisit, groups, rows, totals }
}
