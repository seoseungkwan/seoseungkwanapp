import { addDays, addMonths, diffDays, monthRange, weekStartOf } from '@/lib/analytics/dates'
import type { Grade, RuleDef } from '@/types/precheck'
import { sameGroup, sameJoint, up } from './compile'
import { codesText, hasClass, hit, type Run } from './run'
import type { Handler } from './sameDay'
import type { Context, Line, ParsedChart, RuleParams, Target, Threshold, WindowSpec } from './types'

// 과거 기록이 필요한 조건 종류(원본 H.visit_fee · interval · count_window · episode_period · prerequisite) [환자 자료 구역].
// 12개월 이력은 늘 함께 온다(AC-010.5). 원본의 '이력을 아직 안 받음' 길(historyReady 거짓 → 'history')은 옮기지 않았다

const GRADES: readonly string[] = ['확인필요', '알림', '참고']
const paramsOf = (rule: RuleDef) => (rule.params ?? {}) as RuleParams

/** 원본 addMonths: 달력으로 n달 뒤 같은 날. 그 달에 없는 날이면 그 달 마지막 날 */
function addCalendarMonths(day: string, n: number): string {
  const month = addMonths(day.slice(0, 7), n)
  const last = Number(monthRange(month).to.slice(8, 10))
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, '0')}`
}

type Entry = { date: string; lines: Line[]; parsed: ParsedChart; classes: Set<string>; today?: true }

function dosesOf(c: Context, run: Run, target: Target | undefined, drugCondition?: { drug_classes_any?: string[] }, extraCodes?: string[] | null): Entry[] {
  const out: Entry[] = []
  const extra = new Set((extraCodes ?? []).map(up))
  const match = (lines: Line[], classes: Set<string>) => {
    const hits = lines.filter((l) => run.matchTarget(l, target) || extra.has(l.edi.slice(0, 5)))
    if (!hits.length) return null
    if (drugCondition && !(drugCondition.drug_classes_any ?? []).some((x) => classes.has(x))) return null
    return hits
  }
  for (const visit of run.pastOf(c)) {
    const hits = match(visit.lines, visit.classes)
    if (hits) out.push({ date: visit.date, lines: hits, parsed: visit.parsed, classes: visit.classes })
  }
  const today = match(c.ben, c.classes)
  if (today) out.push({ date: c.date, lines: today, parsed: c.parsed, classes: c.classes, today: true })
  return out
}

function lesionKey(entry: Entry, run: Run): string {
  const groups = new Set(entry.lines.map((l) => run.C.lesionOf(l, entry.parsed)))
  return groups.size === 1 ? [...groups][0] : 'unknown'
}

function sameSite(a: Entry, b: Entry, mode: unknown, run: Run): boolean {
  const m = String(mode || '')
  if (!m || m === 'false') return true
  if (/lesion/.test(m)) return sameGroup(lesionKey(a, run), lesionKey(b, run))
  return sameJoint(a.parsed, b.parsed)
}

function episodeOf(entries: Entry[], mode: string, gap: number, run: Run): Entry[] {
  const today = entries[entries.length - 1]
  const same = entries.filter((e) => sameSite(e, today, mode, run))
  let start = 0
  for (let i = 1; i < same.length; i++) if (diffDays(same[i - 1].date, same[i].date) > gap) start = i
  return same.slice(start)
}

/** 진찰료 */
const visitFee: Handler = (rule, c, run) => {
  const { C, pastOf, dxOf } = run
  const p = paramsOf(rule)
  const fee = c.ben.find((l) => /^AA(154|254|222)/.test(l.edi))
  if (!fee) return null
  if (rule.id === 'VF-01') {
    if (!fee.edi.startsWith('AA254')) return null
    const services = c.ben.filter((l) => ['pt_section1', 'pt_section2', 'local_injections', 'im_sc', 'iv_push'].some((g) => C.inGroup(l, g)))
    const others = c.ben.filter((l) => l !== fee && !services.includes(l) && !l.classes.size && !/^(GB04|JX|MX|JT|MT)/.test(l.edi))
    if (!services.length || others.length) return null
    if (C.keyTest(p.condition && p.condition.physician_exam_absent_regex_key, c.text) !== false) return null
    return hit(rule, null, rule.message, `AA254 + ${codesText(services)}`)
  }
  if (fee.edi.startsWith('AA222')) return null
  if (!c.dx) return 'skip'
  const keys = new Set(c.dx.filter((d) => d.pos !== 'excluded').map((d) => d.code.slice(0, 3)))
  let last: string | null = null
  let known = false
  for (const visit of pastOf(c)) {
    const dx = visit.v ? dxOf(visit.v) : null
    if (dx && dx.length) {
      if (dx.some((d) => d.pos !== 'excluded' && keys.has(d.code.slice(0, 3)))) {
        last = visit.date
        known = true
      }
    } else if (visit.lines.length) {
      last = visit.date
      known = false
    }
  }
  if (!last) return null
  const gap = diffDays(last, c.date)
  const detail = `직전 내원 ${last} (${gap}일 전${known ? ', 같은 상병' : ', 상병 미상'})`
  if (rule.id === 'VF-02' && fee.edi.startsWith('AA154') && gap <= 30) return hit(rule, known ? null : '알림', rule.message, detail)
  if (rule.id === 'VF-03' && fee.edi.startsWith('AA154') && gap > 30 && gap <= 90 && known) {
    if (C.rx(p.condition && p.condition.closure_record_absent_regex)?.test(c.text)) return null
    return hit(rule, null, rule.message, detail)
  }
  if (rule.id === 'VF-04' && fee.edi.startsWith('AA254') && gap > 90) return hit(rule, null, rule.message, detail)
  return null
}

/** 간격 */
const interval: Handler = (rule, c, run) => {
  const p = paramsOf(rule)
  if (!c.ben.some((l) => run.matchTarget(l, p.target))) return null
  if (p.drug_condition && !hasClass(c, p.drug_condition.drug_classes_any)) return null
  const prev = p.previous && (p.previous.codes || p.previous.code_groups || p.previous.drug_classes) ? p.previous : p.target
  const entries = dosesOf(c, run, prev, (p.previous && p.previous.drug_condition) || p.drug_condition)
  const current = entries[entries.length - 1]
  if (!current || !current.today) return null
  const mode = p.same_site || (p.previous && p.previous.same_site) || ''
  if (p.min_months) {
    // 히알루론산 재주기: 직전 주기 마지막 투여 후 6개월
    const doses = entries.filter((e) => sameSite(e, current, 'joint', run))
    let start = doses.length - 1
    while (start > 0 && diffDays(doses[start - 1].date, doses[start].date) <= 14) start--
    if (start !== doses.length - 1) return null // 오늘은 주기 중간
    const previousLast = doses[start - 1]
    if (!previousLast) return null
    if (c.date >= addCalendarMonths(previousLast.date, p.min_months)) return null
    const single = current.lines.every((l) => l.classes.has('hyaluronate_single'))
    return hit(rule, single ? '알림' : null, rule.message, `직전 주기 마지막 ${previousLast.date} → ${p.min_months}개월 안`)
  }
  const earlier = entries.slice(0, -1).filter((e) => sameSite(e, current, mode, run))
  if (!earlier.length) return null
  const last = earlier[earlier.length - 1]
  const gap = diffDays(last.date, c.date)
  if (p.min_interval && p.min_interval.months) {
    const limit = addDays(addCalendarMonths(last.date, p.min_interval.months), -(p.min_interval.minus_days || 0))
    return c.date < limit ? hit(rule, null, rule.message, `직전 ${last.date} (+${gap}일)`) : null
  }
  if (p.previous && p.previous.same_cycle && gap > 14) return null
  if (gap >= (p.min_days as number)) return null
  let grade: Grade | undefined = rule.grade
  if (p.outcomes) {
    const same = sameGroup(lesionKey(current, run), lesionKey(last, run))
    for (const o of p.outcomes) {
      if (o.when === 'same_lesion_group' && same) grade = o.grade
      if (o.when === 'different_site' && !same) grade = o.grade
    }
  }
  return hit(rule, grade, rule.message, `직전 ${last.date} · ${gap}일 간격 (기준 ${p.min_days}일 이상)`)
}

export const WINDOWS = new Set(['rolling_days', 'calendar_week', 'calendar_year', 'fiscal_year', 'episode', 'cycle', 'course', 'lifetime_available_history'])

function windowFilter(entries: Entry[], w: WindowSpec | undefined, today: string, run: Run): Entry[] {
  const type = w?.type
  if (!w || !type || type === 'lifetime_available_history') return entries
  if (type === 'rolling_days') {
    const from = addDays(today, -((w.days as number) - 1))
    return entries.filter((e) => e.date >= from)
  }
  if (type === 'calendar_week') {
    const key = weekStartOf(today)
    return entries.filter((e) => weekStartOf(e.date) === key)
  }
  if (type === 'calendar_year') return entries.filter((e) => e.date.slice(0, 4) === today.slice(0, 4))
  if (type === 'fiscal_year') {
    const year = today.slice(0, 4)
    const start = w.start_overrides && w.start_overrides[year] ? w.start_overrides[year] : `${year}-01-01`
    return entries.filter((e) => e.date >= start && e.date.slice(0, 4) === year)
  }
  if (type === 'episode') return episodeOf(entries, 'lesion_group', w.new_episode_gap_days || 90, run)
  if (type === 'cycle') {
    if (/6개월/.test(String(w.cycle_definition || ''))) {
      let first = 0
      for (let i = 1; i < entries.length; i++) if (entries[i].date >= addCalendarMonths(entries[first].date, 6)) first = i
      return entries.slice(first)
    }
    let start = entries.length - 1
    while (start > 0 && diffDays(entries[start - 1].date, entries[start].date) <= 14) start--
    return entries.slice(start)
  }
  // course: 상병(앞 3자리)별 치료 묶음 — 30일 넘게 비면 새 묶음
  let start = entries.length - 1
  while (start > 0 && diffDays(entries[start - 1].date, entries[start].date) <= (w.new_course_gap_days || 30)) start--
  return entries.slice(start)
}

/** 규칙의 기간·기준 목록(원본 windowsOf). status.ts도 쓴다 */
export function windowsOf(p: RuleParams): { window?: WindowSpec; thresholds: Threshold[] }[] {
  const list: { window?: WindowSpec; thresholds: Threshold[] }[] = p.windows
    ? p.windows.map((w) => ({ window: w.window, thresholds: w.thresholds ?? [{ at: w.at, grade: w.grade, message: w.message }] }))
    : [{ window: p.window, thresholds: p.thresholds ?? [] }]
  for (const w of p.additional_windows ?? []) list.push({ window: w.window, thresholds: [{ at: w.at, grade: w.grade }] })
  return list
}

function countUnits(scoped: Entry[], unit: string): number {
  if (/^qty/.test(unit)) return scoped.reduce((s, e) => s + e.lines.reduce((t, l) => t + (l.qty || 1), 0), 0)
  if (/^cycle/.test(unit)) {
    if (/6개월/.test(unit)) {
      let n = 0
      let first: string | null = null
      for (const e of scoped) {
        if (!first || e.date >= addCalendarMonths(first, 6)) {
          n++
          first = e.date
        }
      }
      return n
    }
    let n = 0
    for (let i = 0; i < scoped.length; i++) if (i === 0 || diffDays(scoped[i - 1].date, scoped[i].date) > 14) n++
    return n
  }
  if (/^episode/.test(unit)) {
    let n = 0
    for (let i = 0; i < scoped.length; i++) if (i === 0 || diffDays(scoped[i - 1].date, scoped[i].date) > 90) n++
    return n
  }
  return new Set(scoped.map((e) => e.date)).size
}

/** 기간 안 횟수 */
const countWindow: Handler = (rule, c, run) => {
  const { C, matchTarget } = run
  const p = paramsOf(rule)
  if (!c.ben.some((l) => matchTarget(l, p.target))) return null
  if (p.drug_condition && !hasClass(c, p.drug_condition.drug_classes_any)) return null
  if (p.dx_condition && c.dx && !c.dx.some((d) => (p.dx_condition!.dx_prefixes ?? []).some((px) => d.code.startsWith(px)))) return null
  if (p.site && c.parsed.joints.size && !c.parsed.joints.has(p.site)) return null
  const countTarget = /any code/.test(String(p.count_unit || '')) ? { code_groups: ['bmd'] } : p.target
  let entries = dosesOf(c, run, countTarget, p.drug_condition, p.include_history_codes ? Object.keys(p.include_history_codes) : null)
  const current = entries[entries.length - 1]
  if (!current || !current.today) return null
  const groupBy = String(p.group_by || (p.window && p.window.group_by) || '')
  if (/lesion_group/.test(groupBy)) entries = entries.filter((e) => sameGroup(lesionKey(e, run), lesionKey(current, run)))
  else if (/same_(joint|knee|shoulder)/.test(groupBy)) entries = entries.filter((e) => sameJoint(e.parsed, current.parsed))
  let best: { grade: Grade; rank: number; at: number; count: number; message: string } | null = null
  for (const w of windowsOf(p)) {
    const scoped = windowFilter(entries, w.window || p.window, c.date, run)
    const count = countUnits(scoped, String(p.count_unit || 'visit_day'))
    for (const t of w.thresholds) {
      if (!t || t.at == null || t.phase || count < t.at) continue
      if (t.drug_class && !c.classes.has(t.drug_class)) continue
      if (t.unless_regex && C.rx(t.unless_regex)?.test(c.text)) continue
      const grade = t.grade || rule.grade
      const rank = GRADES.indexOf(grade)
      if (!best || rank < best.rank || (rank === best.rank && t.at > best.at)) best = { grade, rank, at: t.at, count, message: t.message || '' }
    }
  }
  if (!best) return null
  return hit(rule, best.grade, rule.message + (best.message ? ` — ${best.message}` : ''), `${best.count}회째`)
}

/** 치료 기간 */
const episodePeriod: Handler = (rule, c, run) => {
  const p = paramsOf(rule)
  if (!c.ben.some((l) => run.matchTarget(l, p.target))) return null
  const ep = p.episode ?? {}
  const entries = dosesOf(c, run, p.target)
  const scoped =
    ep.type === 'episode'
      ? episodeOf(entries, 'lesion_group', ep.new_episode_gap_days || 90, run)
      : windowFilter(entries, { type: 'course', new_course_gap_days: ep.new_course_gap_days || 30 }, c.date, run)
  if (!scoped.length) return null
  const first = scoped[0].date
  const elapsed = diffDays(first, c.date)
  const detail = `첫 시행 ${first} → ${elapsed}일째`
  if (p.max_period && p.max_period.calendar_months) {
    if (c.date <= addDays(addCalendarMonths(first, p.max_period.calendar_months), -1)) return null
    const dx = c.dx
    const exception = p.exception_dx_prefixes && dx && Object.values(p.exception_dx_prefixes).some((list) => dx.some((d) => list.some((px) => d.code.startsWith(up(px)))))
    return hit(rule, exception ? p.exception_grade || '참고' : null, rule.message + (exception ? ' (예외 상병 — 사유 기재 확인)' : ''), detail)
  }
  if (p.max_period && p.max_period.days) return elapsed > p.max_period.days ? hit(rule, null, rule.message, detail) : null
  let out = null
  for (const o of p.outcomes ?? []) if (elapsed > (o.after_days as number)) out = hit(rule, o.grade, rule.message, detail)
  return out
}

/** 앞선 치료 */
const prerequisite: Handler = (rule, c, { C, matchTarget, pastOf }) => {
  const p = paramsOf(rule)
  if (!c.ben.some((l) => matchTarget(l, p.target))) return null
  if (p.exceptions_regex && C.rx(p.exceptions_regex)?.test(c.text)) return null
  const past = pastOf(c)
  if (past.some((visit) => visit.lines.some((l) => matchTarget(l, p.target)) && diffDays(visit.date, c.date) <= 90)) return null // 이미 진행 중인 도수치료
  const need = p.required_prior!
  const prior = past.filter((visit) => visit.lines.some((l) => matchTarget(l, need)) && diffDays(visit.date, c.date) <= 90)
  const count = prior.length
  const span = count ? diffDays(prior[0].date, addDays(c.date, -1)) : 0
  if (count >= (need.min_count || 4) && span >= (need.min_span_days || 14)) return null
  return hit(rule, null, rule.message, `앞선 물리치료 ${count}회 · ${span}일`)
}

export const PAST_HANDLERS: Partial<Record<RuleDef['type'], Handler>> = {
  visit_fee: visitFee,
  interval,
  count_window: countWindow,
  episode_period: episodePeriod,
  prerequisite,
}
