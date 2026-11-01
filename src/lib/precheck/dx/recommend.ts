import type {
  DxIssue,
  DxLink,
  DxRecommendation,
  DxRow,
  DxSource,
  DxTrend,
  Visit,
  VisitDxView,
} from '@/types/precheck'

// 추천 상병·상병 확인(REQ-011) [환자 자료 구역]. 원본(양지바른 사전점검 seoseungkwan/shared@2a1069b assets/mx999_v22.html)의 줄을 옮겼다:
//   new-medicore-dx-recommend → rulesFor · recommend · issues · missingDx · needsCheck · restore(readDxLinks) · snapshot.rules(packDxLinks)
// 원본의 규칙 제안 고르기(adopt)는 옮기지 않았다. 부르는 TASK가 없다.
// 상병마스터 I·N 표는 원본에서도 여기가 아니라 규칙 DX-01·DX-02다. 규칙 엔진(TASK-10)이 설정을 따라 낸다.
// 보여 주기만 한다. 진료 자료·비트를 바꾸지 않는다(원본도 같다). 일부러 다른 것은 fixtures/precheck/golden/dx-check.json의 knownDiffs

export const TOP = 3
export const LIFT = 150 // 경향 배수(×100)가 150 미만이면 어느 처방에나 붙는 '흔한 상병'
export const EX_SHARE = 700 // 과거 기록에서 70% 이상 배제상병으로 넣던 묶음은 '배제상병으로'. 원본 adopt의 기준이라 지금 쓰는 곳은 없고, AC-011.1이 상수로 둔다
const MAX_RULES = 5000
const RX = /^[0-9A-Za-z가-힣_.-]{1,20}$/
const DX = /^[A-Z][0-9A-Z]{2,7}$/
const text = (value: unknown) => String(value ?? '').trim()
const up = (value: unknown) => text(value).toUpperCase()

type RuleSource = Exclude<DxSource, 'gosi'>
export type DxRule = { rx: string; dx: string; nm: string; ex: boolean; src: RuleSource }
export type DxNeed = { dx: string; nm: string; ex: boolean; src: DxSource; basis: string }

// 고시에 질환이 적힌 처방. 고시에는 KCD 번호가 없어 질환명을 코드로 옮겼다(앞자리가 같으면 인정: M17 → M170·M171…)
const GOSI: readonly { test: (code: string, name: string) => boolean; dx: readonly (readonly [string, string])[]; basis: string }[] = [
  {
    test: (_, name) => /히알루론산/.test(name) && !/점안|안약|외용|겔|크림|연고|필러/.test(name),
    dx: [['M17', '무릎관절증 (M17 전체)'], ['M750', '어깨의 유착성 관절낭염 (견관절주위염)']],
    basis: '보건복지부 고시 제2020-79호(2020.5.1.) 히알루론산 관절강내 주사: 방사선상 K-L 1~3등급 무릎 골관절염, 견관절주위염. 교차결합 고용량(1회 주사) 제품은 무릎만',
  },
  { test: (code) => code === 'MM410', dx: [['M750', '어깨의 유착성 관절낭염']], basis: '고시 제2007-46호: 동결견(유착성 관절낭염)에 실시' },
]

// ── 상병 연결표 ─────────────────────────────────────────

const SOURCE_OF: Record<string, RuleSource> = { s: 'staff', r: 'record', t: 'table' }

/** 저장된 연결표를 읽는다(원본 restore). 한 줄이라도 틀리면 통째로 거절한다. 던지는 글에 값을 싣지 않는다 */
export function readDxLinks(rows: unknown): DxRule[] {
  const bad = () => new TypeError('상병 연결표 모양이 다르다')
  if (!Array.isArray(rows) || rows.length > MAX_RULES) throw bad()
  const list = rows.map((row: unknown): DxRule => {
    if (!Array.isArray(row) || row.length !== 5) throw bad()
    const [rx, dx, nm, ex, src] = row as unknown[]
    if (typeof rx !== 'string' || !RX.test(rx) || typeof dx !== 'string' || !DX.test(dx) || typeof nm !== 'string') throw bad()
    if ((ex !== 0 && ex !== 1) || typeof src !== 'string' || !Object.hasOwn(SOURCE_OF, src)) throw bad()
    return { rx: up(rx), dx, nm: nm.slice(0, 80), ex: ex === 1, src: SOURCE_OF[src] }
  })
  return list.filter((r) => r.dx !== r.rx) // 상병=처방코드인 규칙은 뺀다
}

/** 원본 snapshot.rules 모양으로(병원 설정 dx_links에 저장하는 모양) */
export function packDxLinks(rules: readonly DxRule[]): DxLink[] {
  return rules.map((r) => [r.rx, r.dx, r.nm, r.ex ? 1 : 0, r.src === 'staff' ? 's' : r.src === 'record' ? 'r' : 't'])
}

// ── 문맥 ────────────────────────────────────────────────

export type DxContextInput = {
  /** 상병 추세(12개월). 없으면 null(AC-011.4) */
  trend: DxTrend | null
  /** 병원 설정의 상병 연결표(claim_hospital_settings.dx_links) */
  links: readonly DxLink[]
  /** 한 달 진료. 상병 이름을 찾을 때 쓴다 */
  visits: readonly Visit[]
  /** 상병(83D) 자료가 있나(원본 diagnoses has()). 없으면 상병 확인을 건너뛴다 */
  hasDx: boolean
  /** 그 진료에 메모 초안이 있나(원본 v.memos). 메모(TASK-14)가 생기면 넘긴다 */
  hasMemo?: (visit: Visit) => boolean
}

/** 한 달 점검에서 함께 쓰는 값을 한 번 만들어 둔다(원본 전역 rules·trend·nameMap). 틀린 연결표면 던진다 */
export type DxContext = ReturnType<typeof dxContext>

export function dxContext({ trend, links, visits, hasDx, hasMemo }: DxContextInput) {
  const rules = readDxLinks(links)
  const index = new Map<string, DxRule[]>()
  for (const r of rules) {
    const list = index.get(r.rx)
    if (list) list.push(r)
    else index.set(r.rx, [r])
  }
  // 상병명: 진료의 상병내역 → 경향 → 연결표 → 고시 순서로 찾는다(원본 nameMap)
  const names = new Map<string, string>()
  const name = (code: string, value: string) => {
    if (value && !names.has(code)) names.set(code, value)
  }
  if (hasDx) for (const visit of visits) for (const item of visit.dx) name(item.c, item.n)
  if (trend) for (const entry of trend.codes.values()) for (const d of entry.d) name(d.c, d.nm)
  for (const r of rules) name(r.dx, r.nm)
  for (const g of GOSI) for (const [dx, nm] of g.dx) name(dx, nm)
  return {
    trend,
    index,
    names,
    hasDx,
    hasMemo: hasMemo ?? (() => false),
    /** 처방코드·이름이 같으면 추천도 같다. 진료마다 다시 만들지 않는다(같은 줄을 나눠 쓴다. 고치지 않는다) */
    recommendations: new Map<string, DxRecommendation>(),
  }
}

// ── 추천 ────────────────────────────────────────────────

/** 이 처방에 필요한 상병: 고시 → 연결표(넣은 순서). 같은 상병은 앞의 것만 */
export function rulesFor(code: string, name: string, ctx: DxContext): DxNeed[] {
  const C = up(code)
  const out: DxNeed[] = []
  const seen = new Set<string>()
  const add = (dx: string, nm: string, ex: boolean, src: DxSource, basis: string) => {
    const D = up(dx)
    if (!D || seen.has(D)) return
    seen.add(D)
    out.push({ dx: D, nm: nm || '', ex: !!ex, src, basis: basis || '' })
  }
  for (const g of GOSI) if (g.test(C, text(name))) for (const [dx, nm] of g.dx) add(dx, nm, false, 'gosi', g.basis)
  for (const r of ctx.index.get(C) ?? []) add(r.dx, r.nm, r.ex, r.src, '')
  return out
}

/** 추천 목록: 고시 → 연결표·직접 추가(넣은 순서) → 우리 병원 경향만 있는 상병(많이 쓴 순) → 흔한 상병 */
export function recommendDx(code: string, name: string, ctx: DxContext): DxRecommendation {
  const key = `${up(code)}\u0000${name}`
  const known = ctx.recommendations.get(key)
  if (known) return known
  const rows = new Map<string, DxRow>()
  const row = (dx: string): DxRow => {
    let r = rows.get(dx)
    if (!r) {
      r = { dx, nm: ctx.names.get(dx) || '', src: [], ex: false, basis: '', t: null, pos: rows.size }
      rows.set(dx, r)
    }
    return r
  }
  for (const r of rulesFor(code, name, ctx)) {
    const x = row(r.dx)
    if (!x.src.includes(r.src)) x.src.push(r.src)
    x.ex = x.ex || r.ex
    if (r.basis) x.basis = r.basis
    if (r.nm && !x.nm) x.nm = r.nm
  }
  const t = ctx.trend ? (ctx.trend.codes.get(up(code)) ?? null) : null
  if (t) {
    for (const d of t.d) {
      const x = row(d.c)
      const n = d.m + d.s + d.x
      x.t = { n, m: d.m, s: d.s, x: d.x, share: t.n ? n / t.n : 0, common: d.l != null && d.l < LIFT }
      if (d.nm && !x.nm) x.nm = d.nm
    }
  }
  const order = (r: DxRow) => (r.src.includes('gosi') ? 0 : r.src.length ? 1 : r.t && r.t.common ? 3 : 2)
  const used = (r: DxRow) => (r.t ? r.t.n : 0)
  const result = {
    visits: t ? t.n : 0,
    list: [...rows.values()].sort(
      (a, b) => order(a) - order(b) || (order(a) < 2 ? a.pos - b.pos : used(b) - used(a)) || a.dx.localeCompare(b.dx),
    ),
  }
  ctx.recommendations.set(key, result)
  return result
}

// ── 상병 확인 ───────────────────────────────────────────

const covers = (code: string, rule: string) => code.startsWith(rule)
const group = (code: string, dx: string) => covers(code, dx) || code.slice(0, 3) === dx.slice(0, 3)

/**
 * 고시·연결표 규칙이 있는 급여 처방인데 그 상병이 주·부·배제 어디에도 없으면 확인필요.
 * 고시가 없는 처방(연결표·직접 추가·기록 규칙)은 추천에 나오는 우리 병원 상병(흔한 상병 제외)이 하나라도 있어도 통과한다
 */
export function dxIssues(visit: Visit, ctx: DxContext): DxIssue[] {
  if (!ctx.hasDx) return []
  const have = visit.dx.map((item) => up(item.c))
  if (!have.length) return []
  const out: DxIssue[] = []
  const seen = new Set<string>()
  for (const item of visit.rx) {
    const code = up(item.code)
    if (!code || seen.has(code) || !item.benefit) continue
    const need = rulesFor(code, item.name, ctx)
    if (!need.length) continue
    seen.add(code)
    const gosi = need.some((r) => r.src === 'gosi')
    if (have.some((c) => need.some((r) => covers(c, r.dx) || (r.src !== 'gosi' && group(c, r.dx))))) continue
    const rec = recommendDx(code, item.name, ctx).list.filter((r) => !(r.t && r.t.common && !r.src.length))
    if (!gosi && have.some((c) => rec.some((r) => group(c, r.dx)))) continue
    out.push({
      code,
      name: text(item.name),
      gosi,
      record: need.every((r) => r.src === 'record'),
      rec: rec.filter((r) => !have.some((c) => covers(c, r.dx))).slice(0, TOP),
    })
  }
  return out
}

/** 상병 자료가 있는데 시술(메모)·급여 처방 진료에 상병이 없다 */
export function missingDx(visit: Visit, ctx: DxContext): boolean {
  return ctx.hasDx && !visit.dx.length && (ctx.hasMemo(visit) || visit.rx.some((item) => item.benefit))
}

/** 환자 목록 [확인필요]: 상병이 없거나 규칙의 상병이 빠진 진료 */
export function needsCheck(visit: Visit, ctx: DxContext): boolean {
  return ctx.hasDx && (missingDx(visit, ctx) || dxIssues(visit, ctx).length > 0)
}

// ── 보기 모양 ───────────────────────────────────────────

/** 진료 하나의 추천 상병·상병 확인. 처방마다(같은 코드는 한 번) 추천을 싣고, 추천이 없는 처방은 뺀다 */
export function visitDxView(visit: Visit, ctx: DxContext): VisitDxView {
  const issues = dxIssues(visit, ctx)
  const missing = missingDx(visit, ctx)
  const recommendations: VisitDxView['recommendations'] = []
  const seen = new Set<string>()
  for (const item of visit.rx) {
    const code = up(item.code)
    if (!code || seen.has(code)) continue
    seen.add(code)
    const rec = recommendDx(code, item.name, ctx)
    if (rec.list.length) recommendations.push({ code, name: text(item.name), ...rec })
  }
  return { visitKey: visit.key, missingDx: missing, needsCheck: missing || issues.length > 0, issues, recommendations }
}
