import type { Grade, RuleDef } from '@/types/precheck'
import { overlap, SPINE, up } from './compile'
import { codesText, hasClass, hit, ingredientOf, isInjected, pct, type Run } from './run'
import type { Context, DocItem, Hit, Line, Outcome, RuleParams } from './types'

// 그날 자료만 보는 조건 종류(원본 H.same_day_pair ~ H.claim_code) [환자 자료 구역]. 원본 줄을 그대로 옮겼다. 글자·순서를 바꾸면 골든이 잡는다

export type Handler = (rule: RuleDef, c: Context, run: Run) => Outcome

const paramsOf = (rule: RuleDef) => (rule.params ?? {}) as RuleParams

const HOW: Record<string, string> = {
  lower_points_to_U: '점수가 낮은 쪽을 U항(100/100)으로',
  remove_a: '앞의 행위는 청구 제외',
  remove_b: '뒤의 행위는 청구 제외',
  keep_one: '하나만 청구',
  keep_main: '주된 것(점수 높은 쪽)만',
  main_only: '주된 것만',
  b_to_U: '뒤의 행위를 U항(100/100)으로',
  replace_a_with: '',
  remove_a_if_given_via_iv_line: '수액 줄로 줬으면 정맥주사 청구 제외',
}
const isU = (p: RuleParams) => /U/.test(String(p.resolution || '')) && Boolean(p.sam_check)

/** 같은 날 함께 청구 */
const samedayPair: Handler = (rule, c, run) => {
  const p = paramsOf(rule)
  const { C, matchTarget } = run
  if (p.pairs || p.pairs_group) {
    const pairs = p.pairs ? p.pairs.map((pair) => pair.map(up)) : C.GROUPS.get(p.pairs_group as string)!.pairs!
    const has = (code: string) => c.ben.some((l) => l.edi === code || l.edi.slice(0, 5) === code)
    const found = pairs.filter(([a, b]) => has(a) && has(b))
    return found.length ? hit(rule, null, rule.message, found.map((pair) => pair.join('+')).join(', ')) : null
  }
  const nonCovered = (set: RuleParams['set_a']) => (set?.code_groups ?? []).some((name) => /noncovered|eswt|prolo/.test(name))
  const pick = (set: RuleParams['set_a'], pool: Line[]) => pool.filter((l) => matchTarget(l, set))
  let A = pick(p.set_a, nonCovered(p.set_a) ? c.lines : c.ben)
  if (p.not_in_set_a) {
    const skip = new Set(p.not_in_set_a.map(up))
    A = A.filter((l) => !skip.has(l.edi.slice(0, 5)))
  }
  for (const id of p.exclude_pairs_covered_by ?? []) {
    const q = (C.BY_ID.get(id)?.params ?? {}) as RuleParams
    if (q.set_a && q.set_b && c.ben.some((l) => matchTarget(l, q.set_b))) A = A.filter((l) => !matchTarget(l, q.set_a))
  }
  const B = pick(p.set_b, nonCovered(p.set_b) ? c.lines : c.ben).filter((l) => !A.includes(l))
  let chartB = false
  if (p.set_b && p.set_b.chart_regex_key && !B.length && C.keyTest(p.set_b.chart_regex_key, c.text)) chartB = true
  if (!A.length || (!B.length && !chartB)) return secondary(rule, c, run)
  if (p.absent_same_day && c.ben.some((l) => matchTarget(l, p.absent_same_day))) return null
  if (p.drug_condition) {
    const dc = p.drug_condition
    if (dc.absent_drug_classes && hasClass(c, dc.absent_drug_classes)) return null
    if (dc.only_drug_classes) {
      const inj = c.lines.filter(isInjected)
      if (!inj.length || !inj.every((l) => dc.only_drug_classes!.some((x) => l.classes.has(x)))) return null
    }
  }
  if (p.allowed_if && p.allowed_if.chart_regex && C.rx(p.allowed_if.chart_regex)?.test(c.text)) return null
  let grade: Grade = rule.grade
  let note = ''
  if (p.same_site && c.parsed.joints.size > 1) {
    if (grade === '확인필요') grade = '알림'
    note = ' · 차트에 부위가 여러 곳 — 같은 부위인지 확인'
  }
  if (isU(p) && grade === '확인필요') {
    grade = '알림'
    note += ' · 청구 파일에서 U항 처리 확인'
  }
  const res = String(p.resolution || '').split('(')[0]
  let how = Object.hasOwn(HOW, res) ? HOW[res] : ''
  if (res.startsWith('replace_a_with:')) how = `${res.split(':')[1]}로 청구`
  return hit(rule, grade, rule.message + (how ? ` (${how})` : '') + note, `${codesText(A)} + ${B.length ? codesText(B) : '차트 기록'}`)
}

/** TP-08: MM132 단독이면 2부위 이상 기록 확인 */
function secondary(rule: RuleDef, c: Context, run: Run): Hit | null {
  const s = paramsOf(rule).secondary
  if (!s || rule.id !== 'TP-08') return null
  const only = c.ben.filter((l) => l.edi.slice(0, 5) === 'MM132')
  if (!only.length || c.ben.some((l) => l.edi.slice(0, 5) === 'MM131')) return null
  const m = run.C.rx(run.C.regionPath(s.require_chart_regex_key))?.exec(c.text)
  if (m && Number(m[1]) >= (s.min_sites || 2)) return null
  return hit(rule, s.grade || '알림', 'MM132(2부위 이상)는 차트에 부위 수가 보여야 합니다 — 기록 확인', 'MM132')
}

/** 필수 상병 */
const requiredDx: Handler = (rule, c, { matchTarget }) => {
  const p = paramsOf(rule)
  const A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (p.drug_condition && !hasClass(c, p.drug_condition.drug_classes_any)) return null
  if (p.condition && p.condition.co_prescribed_drug_classes_any && !hasClass(c, p.condition.co_prescribed_drug_classes_any)) return null
  if (!c.dx) return 'skip'
  const prefixes = (p.dx_prefixes as string[]).map(up)
  const notCounting = (p.dx_prefixes_not_counting ?? []).map(up)
  const positions = p.positions ?? ['main', 'sub']
  const fits = (d: { code: string }) => prefixes.some((px) => d.code.startsWith(px)) && !notCounting.some((px) => d.code.startsWith(px))
  if (c.dx.some((d) => positions.includes(d.pos) && fits(d))) return null
  if (p.or_drug_history && hasClass(c, p.or_drug_history.drug_classes ?? [])) return null
  const need = prefixes.slice(0, 8).join('·') + (prefixes.length > 8 ? '…' : '')
  if (c.dx.some((d) => d.pos === 'excluded' && fits(d))) {
    // DX-08: 배제상병은 필수 상병으로 세지 않음
    return hit(rule, '참고', `배제상병으로만 있습니다 — ${rule.message} (배제상병은 근거로 약함)`, `${codesText(A)} · 필요한 상병 ${need}`)
  }
  let grade: Grade | undefined = rule.grade
  if (p.dx_uncertain && grade === '확인필요') grade = '알림'
  for (const o of p.outcomes ?? []) {
    if (/S·T/.test(o.when || '') && c.dx.length && c.dx.filter((d) => d.pos !== 'excluded').every((d) => /^[ST]/.test(d.code))) grade = o.grade
  }
  return hit(rule, grade, rule.message, `${codesText(A)} · 필요한 상병 ${need}`)
}

/** 약 요건 */
const drugRequirement: Handler = (rule, c, { C, matchTarget }) => {
  const p = paramsOf(rule)
  let A = c.ben.filter((l) => matchTarget(l, p.target))
  if (p.not_applicable) {
    const skip = new Set(p.not_applicable.map(up))
    A = A.filter((l) => !skip.has(l.edi.slice(0, 5)))
  }
  if (!A.length) return null
  const codes = codesText(A)
  if (p.require_drug_classes_any) {
    const ok = hasClass(c, p.require_drug_classes_any)
    const chartOk = p.also_require_chart_regex_key ? C.keyTest(p.also_require_chart_regex_key, c.text) !== false : true
    if (ok && chartOk) return null
    return hit(rule, null, rule.message + (ok ? ' (투시 기록 확인)' : ''), codes)
  }
  if (p.forbid_only_drug_classes) {
    const inj = c.lines.filter(isInjected)
    if (!inj.length) return null
    if ((p.acceptable_with ?? []).some((x) => c.classes.has(x))) return null
    return inj.every((l) => p.forbid_only_drug_classes!.some((x) => l.classes.has(x))) ? hit(rule, null, rule.message, `${codes} + ${codesText(inj)}`) : null
  }
  if (p.forbidden_drug_classes_any) {
    const bad = c.lines.filter((l) => p.forbidden_drug_classes_any!.some((x) => l.classes.has(x)))
    if (!bad.length) return null
    const mix = p.chart_regex_key && C.keyTest(p.chart_regex_key, c.text)
    const strong = bad.some((l) => l.classes.has('dextrose_injection') && /50\s*%/.test(l.label))
    return hit(rule, mix || strong ? '확인필요' : '알림', rule.message, `${codes} + ${codesText(bad)}`)
  }
  if (p.require_any) {
    const ok = p.require_any.some((item) => (item.injected_drug_line ? c.lines.some(isInjected) : item.chart_regex_key ? C.keyTest(item.chart_regex_key, c.text) === true : false))
    return ok ? null : hit(rule, null, rule.message, codes)
  }
  if (p.forbid_separately_billed_drug_classes) {
    const billed = c.ben.filter((l) => p.forbid_separately_billed_drug_classes!.some((x) => l.classes.has(x)))
    return billed.length ? hit(rule, null, rule.message, `${codes} + ${codesText(billed)}`) : null
  }
  return null
}

/** 같은 날 한도 */
const samedayLimit: Handler = (rule, c, { C, matchTarget }) => {
  const p = paramsOf(rule)
  if (p.categories) {
    const present = Object.entries(p.categories)
      .filter(([, target]) => c.ben.some((l) => matchTarget(l, target)))
      .map(([name]) => name)
    if (present.length <= (p.max || 2)) return null
    return hit(rule, c.parsed.joints.size > 1 || c.parsed.sites.size > 1 ? '참고' : rule.grade, rule.message, present.join('·'))
  }
  const A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (p.drug_condition && !hasClass(c, p.drug_condition.drug_classes_any)) return null
  const metric = String(p.metric || '')
  if (p.group_by === 'lesion_group') {
    const groups = new Map<string, Line[]>()
    const keys = A.map((line) => C.lesionOf(line, c.parsed))
    const whole = keys.includes('spine_all')
    // LA357(척추부 신경)은 경·흉·요 부위와 상관없이 한 병소 — 같은 날 척추 쪽 차단과 한 묶음으로 센다
    A.forEach((line, i) => {
      const key = whole && (keys[i] === 'spine_all' || SPINE.includes(keys[i])) ? 'spine_all' : keys[i]
      const g = groups.get(key) ?? []
      g.push(line)
      groups.set(key, g)
    })
    const problems: string[] = []
    for (const lines of groups.values()) {
      const codes = [...new Set(lines.map((l) => l.edi.slice(0, 5)))]
      if (codes.length > (p.max_distinct_codes as number)) {
        problems.push(`${codes.join('+')} ${codes.length}종`)
        continue
      }
      if (codes.length === 2 && p.second_block_factor) {
        const ranked = codes.map((code) => ({
          code,
          points: C.pointsOf(code),
          qty: lines.filter((l) => l.edi.slice(0, 5) === code).reduce((s, l) => s + l.qty, 0),
        }))
        if (ranked.every((r) => r.points != null)) {
          ranked.sort((a, b) => (b.points as number) - (a.points as number))
          if (ranked[1].qty >= 1.0) problems.push(`둘째 차단 ${ranked[1].code} ${pct(ranked[1].qty)} (50%로)`)
        }
      }
    }
    return problems.length ? hit(rule, null, rule.message, problems.join(' · ')) : null
  }
  if (metric === 'multiplier_sum') {
    const total = A.reduce((s, l) => s + (l.qty || 0), 0)
    return total > (p.max || 0) + 1e-9 ? hit(rule, null, rule.message, `${codesText(A)} 합계 ${pct(total)}`) : null
  }
  if (metric === 'qty_sum') {
    if (p.per === 'code') {
      const byCode = new Map<string, number>()
      A.forEach((l) => byCode.set(l.edi, (byCode.get(l.edi) || 0) + (l.qty || 1)))
      const bad = [...byCode].filter(([, q]) => q > (p.max || 1)).map(([code, q]) => `${code} ×${q}`)
      return bad.length ? hit(rule, null, rule.message, bad.join(', ')) : null
    }
    const total = A.reduce((s, l) => s + (l.qty || 1), 0)
    return total > (p.max || 0) ? hit(rule, null, rule.message, `${codesText(A)} 수량 ${total}`) : null
  }
  if (metric === 'distinct_ingredients' || metric === 'distinct_codes') {
    if (p.forbidden_name_regex) {
      const bad = A.filter((l) => C.rx(p.forbidden_name_regex)?.test(l.label))
      if (bad.length) return hit(rule, null, rule.message, `${codesText(bad)} (불인정 방법)`)
    }
    const key = metric === 'distinct_codes' ? (l: Line) => l.code : ingredientOf
    if (p.per === 'subgroup') {
      const bad: string[] = []
      for (const sub of p.subgroups ?? []) {
        const lines = A.filter((l) => [...l.classes].some((x) => x.endsWith(`.${sub}`)))
        const keys = new Set(lines.map(key))
        if (keys.size > (p.max || 1)) bad.push(`${sub} ${keys.size}종(${codesText(lines)})`)
      }
      return bad.length ? hit(rule, null, rule.message, bad.join(', ')) : null
    }
    const pool = A.filter((l) => l.route !== 'C')
    const keys = new Set(pool.map(key))
    return keys.size > (p.max || 1) ? hit(rule, null, rule.message, codesText(pool)) : null
  }
  return null
}

const sideLabel = (side: string) => (side === 'bilateral' ? '양측' : side === 'unilateral' ? '편측' : '좌우 미상')

/** 배율 상한(분절·좌우) */
const multiplierCap: Handler = (rule, c, { C, matchTarget }) => {
  const p = paramsOf(rule)
  const A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (p.condition && p.condition.chart_regex_key && C.keyTest(p.condition.chart_regex_key, c.text) !== true) return null
  const side = c.parsed.side
  const claimed = A.reduce((s, l) => s + (l.qty || 0), 0)
  const codes = codesText(A)
  if (p.unit_per_side != null) {
    // 관절천자 편측 단위
    if (side === 'unknown') return p.flag_if_side_missing ? hit(rule, null, `좌우 기록이 없어 수량을 확인할 수 없습니다 — ${rule.message}`, `${codes} ×${claimed}`) : null
    const expected = side === 'bilateral' ? p.expected!.bilateral : p.expected!.unilateral
    return Math.abs(claimed - expected) > 1e-9 ? hit(rule, null, rule.message, `${codes} ×${claimed} / 차트 ${sideLabel(side)}`) : null
  }
  if (Array.isArray(p.site_rules)) {
    // 분지 감산(무릎~발목 50%, 발목 아래 25%)
    const below = p.site_rules.find((s) => /below_ankle/.test(s.chart_regex_key))
    const knee = p.site_rules.find((s) => /knee_to_ankle/.test(s.chart_regex_key))
    if (below && C.keyTest(below.chart_regex_key, c.text) === true && claimed > below.cap + 1e-9) return hit(rule, null, rule.message, `${codes} ${pct(claimed)} / 발목 아래 ${pct(below.cap)}`)
    if (knee && claimed > knee.cap + 1e-9) {
      // 차단 위치 낱말(슬와·하퇴·복재·비골·경골 등)이 있으면 확인필요, '무릎'만 있으면 참고
      if (/슬와|popliteal|하퇴|종아리|saphenous|peroneal|tibial|비골|경골|복재/i.test(c.text)) return hit(rule, null, rule.message, `${codes} ${pct(claimed)} / 무릎~발목 ${pct(knee.cap)}`)
      if (C.keyTest(knee.chart_regex_key, c.text) === true) return hit(rule, '참고', '차단 위치가 무릎~발목이면 50%입니다 — 차단 위치 기록 확인', `${codes} ${pct(claimed)}`)
    }
    return null
  }
  if (p.caps) {
    // 수지·족지
    for (const [code, cap] of Object.entries(p.caps)) {
      const q = A.filter((l) => l.edi.slice(0, 5) === code).reduce((s, l) => s + l.qty, 0)
      if (!q) continue
      const limit = (cap.unilateral != null ? (side === 'bilateral' ? cap.bilateral : cap.unilateral) : side === 'bilateral' ? (cap.per_side_max as number) * 2 : cap.per_side_max) as number
      if (q > limit + 1e-9) return hit(rule, null, rule.message, `${code} ${pct(q)} / 기준 ${pct(limit)}(${sideLabel(side)})`)
    }
    return null
  }
  if (p.per_side) {
    // 늑간신경: 좌우 각각
    const one = (p.cap && p.cap.per_side) || 2
    const cap = side === 'bilateral' ? one * 2 : one
    if (claimed > cap + 1e-9) return hit(rule, '확인필요', rule.message, `${codes} ${pct(claimed)} / 상한 ${pct(cap)}(${sideLabel(side)})`)
    const count = c.parsed.levelCount
    if (count && p.table && p.table.per_side && side !== 'unknown') {
      const each = p.table.per_side[count >= 3 ? '3+' : String(count)]
      const expected = side === 'bilateral' ? each * 2 : each
      if (each != null && Math.abs(claimed - expected) > 1e-9) return hit(rule, '알림', `차트 레벨 수와 배율이 다릅니다 — ${rule.message}`, `${codes} ${pct(claimed)} / 차트 ${count}레벨 ${sideLabel(side)} ${pct(expected)}`)
    }
    return null
  }
  const regions = [...c.parsed.spine.keys()].filter((k) => c.parsed.spine.get(k)!.size)
  const exempt = new Set((p.region_split_exempt ?? []).map(up))
  const allExempt = A.every((l) => exempt.has(l.edi.slice(0, 5)))
  if (p.max_lines_per_visit) {
    for (const [code, max] of Object.entries(p.max_lines_per_visit)) {
      const n = A.filter((l) => l.edi.slice(0, 5) === code).length
      if (n > max) return hit(rule, null, rule.message, `${code} ${n}줄 (한 번에 ${max}줄)`)
    }
  }
  if (p.compare === 'claimed_vs_cap') {
    const capTable = p.cap!
    const cap = side === 'bilateral' ? capTable.bilateral : side === 'unilateral' ? capTable.unilateral : (capTable.side_unknown ?? capTable.bilateral)
    if (cap == null) return null
    if (p.max_segments) {
      for (const [key, set] of c.parsed.spine) if (set.size > p.max_segments) return hit(rule, null, rule.message, `${codes} 차트 ${key} ${set.size}분절 (최대 ${p.max_segments})`)
    }
    if (p.region_split && regions.length > 1 && !allExempt) return null // 경·흉·요가 섞이면 부위별로 따로 셈
    return claimed > cap + 1e-9 ? hit(rule, null, rule.message, `${codes} ${pct(claimed)} / 상한 ${pct(cap)}(${sideLabel(side)})`) : null
  }
  if (p.compare === 'claimed_vs_expected') {
    if (side === 'unknown' || regions.length !== 1) return null
    const segs = c.parsed.spine.get(regions[0])!.size
    if (!segs) return null
    const table = (side === 'bilateral' ? p.table!.bilateral : p.table!.unilateral) as Record<string, number>
    const expected = table[segs >= 3 ? '3+' : String(segs)]
    if (expected == null) return null
    return Math.abs(claimed - expected) > (p.tolerance || 0) + 1e-9 ? hit(rule, null, rule.message, `${codes} 청구 ${pct(claimed)} / 차트 ${segs}분절 ${sideLabel(side)} ${pct(expected)}`) : null
  }
  return null
}

const JOINTS = ['knee', 'shoulder', 'hip', 'ankle', 'elbow', 'wrist', 'hand_finger', 'foot_toe']

/** 부위 대조 */
const dxSiteMatch: Handler = (rule, c, { C, matchTarget }) => {
  const p = paramsOf(rule)
  const A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  const codes = codesText(A)
  if (p.mode === 'unusual_code_with_msk_only_dx') {
    if (!c.dx) return 'skip'
    const used = c.dx.filter((d) => (p.positions ?? ['main', 'sub']).includes(d.pos))
    return used.length && used.every((d) => (p.msk_dx_prefixes ?? ['M', 'S']).some((px) => d.code.startsWith(px))) ? hit(rule, null, rule.message, codes) : null
  }
  if (p.mode === 'chart_keyword_vs_code') return C.keyTest(p.chart_regex_key, c.text) === true ? hit(rule, null, rule.message + (p.suggest_code ? ` (권장 코드 ${p.suggest_code})` : ''), codes) : null
  if (p.mode === 'chart_site_vs_code') {
    if (p.exempt_regex && C.rx(p.exempt_regex)?.test(c.text)) return null
    const joints = [...c.parsed.joints].filter((j) => (p.joint_sites ?? []).includes(j))
    return joints.length ? hit(rule, null, rule.message + (p.suggest_code ? ` (권장 ${p.suggest_code})` : ''), `${codes} · 차트 ${joints.join('·')}`) : null
  }
  if (p.mode === 'chart_site_allowed_list') {
    const joints = [...c.parsed.joints].filter((j) => JOINTS.includes(j))
    if (!joints.length || joints.some((j) => (p.allowed_sites ?? []).includes(j))) return null
    return hit(rule, null, rule.message, `${codes} · 차트 ${joints.join('·')}`)
  }
  if (!c.dx) return 'skip'
  const dxSet = new Set<string>()
  c.dx.filter((d) => (p.positions ?? ['main', 'sub']).includes(d.pos)).forEach((d) => C.dxRegions(d.code).forEach((r) => dxSet.add(r)))
  if (!dxSet.size || dxSet.has('unspecified') || dxSet.has('any')) return null
  const fromChart = String(p.procedure_region).includes('chart_site_map')
  const bad: Line[] = []
  for (const line of A) {
    const regions = fromChart ? new Set(c.parsed.sites) : C.procRegions(line, c.parsed)
    if (regions.size && !overlap(regions, dxSet)) bad.push(line)
  }
  if (!bad.length) return null
  const soft = p.downgrade_if_chart_symptom_matches_procedure_region && [...c.parsed.sites].some((s) => bad.some((l) => C.procRegions(l, c.parsed).has(s)))
  return hit(rule, soft ? '참고' : rule.grade, rule.message, `${codesText(bad)} · 상병 부위 ${[...dxSet].map((r) => (Object.hasOwn(C.keyNames, r) ? C.keyNames[r] : '') || r).join('·')}`)
}

const NAMES_DOC: Record<string, string> = {
  site_or_level: '부위·레벨',
  side: '좌우',
  drug: '약제',
  symptom_exam: '증상·이학적검사',
  noninvasive_or_alternative: '비침습 검사·대체 사유',
  purpose: '진단 목적',
  image: '투시 영상',
  capsule_change: '관절낭 변화',
  indication: '대상(위축·유착 등)',
  duration: '시간(20분 이상)',
  stretch: '스트레칭',
  exam: '이학적검사',
  record: '도수 기록',
  rationale: '판단 근거',
  rom_loss_50: '가동범위 50% 제한',
  arthrogram: '관절조영',
}

function docTest(item: DocItem, c: Context, { C }: Run): boolean | null {
  if (item.chart_regex_key) return C.keyTest(item.chart_regex_key, c.text)
  if (item.rom_regex_key) return C.keyTest(item.rom_regex_key, c.text)
  if (item.regex) return C.rx(item.regex)?.test(c.text) ?? null
  if (item.regex_key) return C.keyTest(item.regex_key, c.text)
  if (item.regex_keys) {
    const results = item.regex_keys.map((key) => C.keyTest(key, c.text)).filter((r) => r !== null)
    return results.length ? results.some(Boolean) : null
  }
  if (item.source === 'drug_lines_present') return c.lines.some(isInjected)
  return null // 영상·체크박스 등 프로그램이 볼 수 없는 것
}

/** 기록 요건(차팅 원문) */
const documentation: Handler = (rule, c, run) => {
  const { C, matchTarget } = run
  const p = paramsOf(rule)
  let A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (p.dx_condition && c.dx && !c.dx.some((d) => (p.dx_condition!.dx_prefixes ?? []).some((px) => d.code.startsWith(px)))) return null
  if (p.dx_condition && !c.dx) return 'skip'
  if (p.conditional_codes) {
    for (const code of Object.keys(p.conditional_codes)) if (!/쇄골상부|supraclavicular/i.test(c.text)) A = A.filter((l) => l.edi.slice(0, 5) !== code)
    if (!A.length) return null
  }
  const codes = codesText(A)
  if (p.required_views) {
    // 투시 2방향
    const views = Object.entries(C.views)
      .filter(([, re]) => C.rx(re)?.test(c.text))
      .map(([k]) => k)
    return views.length >= 2 ? null : hit(rule, null, rule.message, `${codes} · 차트 방향 ${views.join('·') || '없음'}`)
  }
  if (p.outcomes && !p.required_all && !p.required_any) {
    // HY-11: K-L 4등급
    return C.keyTest('regions.chart_keywords.kl4', c.text) === true ? hit(rule, '알림', 'K-L 4등급 기록이 있습니다 — 히알루론산 등은 K-L I~III 대상', codes) : null
  }
  if (p.required_per_code) {
    // US-03: 같은 날 초음파 2종 이상이면 코드마다 판단 근거
    if (new Set(A.map((l) => l.edi.slice(0, 5))).size < 2) return null
    return C.keyTest('regions.chart_keywords.symptom_exam', c.text) === true ? null : hit(rule, null, rule.message, codes)
  }
  if (p.required_any) {
    const results = p.required_any.map((item) => docTest(item, c, run))
    const seen = results.filter((r) => r !== null)
    if (!seen.length) return null
    let ok = seen.some(Boolean)
    if (!ok && rule.id === 'LA-13' && c.lines.some((l) => /c-?arm|투시|fluoro/i.test(l.label))) ok = true
    if (ok) return null
    // 근거가 차트 밖(PACS 영상·제출 표시 등)에 있을 수 있으면 확인필요 대신 알림
    const outside = results.some((r) => r === null)
    return hit(rule, outside && rule.grade === '확인필요' ? '알림' : null, rule.message + (outside ? ' (차트에 기록이 없음 — 영상·제출 자료로 갖췄는지 확인)' : ''), codes)
  }
  const missing: string[] = []
  for (const item of p.required_all ?? []) {
    let r: boolean | null
    if (item.element === 'side') {
      if (A.every((l) => (item.skip_for_midline ?? []).includes(l.edi.slice(0, 5)))) continue
      r = c.parsed.side !== 'unknown'
    } else if (item.element === 'site_or_level') r = c.parsed.sites.size > 0 || c.parsed.levels.size > 0
    else r = docTest(item, c, run)
    if (r === false) missing.push((item.element && Object.hasOwn(NAMES_DOC, item.element) ? NAMES_DOC[item.element] : '') || item.element || '기록')
  }
  return missing.length ? hit(rule, null, rule.message, `${codes} · 빠진 기록: ${missing.join(', ')}`) : null
}

const filmCount = (l: Line) => {
  const n = Number(l.edi.charAt(4))
  return (n > 0 ? n : 1) * Math.max(1, l.qty || 1)
}

/** 단순촬영 매수 */
const imagingCount: Handler = (rule, c, { C, matchTarget }) => {
  const p = paramsOf(rule)
  const A = c.ben.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (rule.id === 'XR-01') {
    if (C.keyTest(p.bilateral_terms_regex_key || 'regions.chart_side_regex.bilateral', c.text) !== true) return null
    if (p.pass_if_regex && C.rx(p.pass_if_regex)?.test(c.text)) return null
    const bad = A.filter((l) => {
      const n = Number(l.edi.charAt(4))
      return n >= 2 || (n === 1 && (l.qty || 1) >= 2)
    })
    return bad.length ? hit(rule, null, `${rule.message} (양측을 한 장에 찍었으면 1매 × 1회, 따로 찍었으면 차트에 "각각")`, bad.map((l) => `${l.code} ×${l.qty || 1}`).join(', ')) : null
  }
  if (rule.id === 'XR-03') {
    const byPart = new Map<string, Line[]>()
    A.forEach((l) => {
      const k = l.edi.slice(0, 4)
      byPart.set(k, (byPart.get(k) ?? []).concat(l))
    })
    const bad = [...byPart.values()].filter((list) => list.length >= 2 || list.some((l) => Number(l.edi.charAt(4)) === 1 && (l.qty || 1) >= 2))
    return bad.length ? hit(rule, null, rule.message, bad.map((list) => list.map((l) => `${l.code} ×${l.qty || 1}`).join('+')).join(', ')) : null
  }
  if (rule.id === 'XR-08') {
    const films = c.ben.filter((l) => C.inGroup(l, 'xr_all')).reduce((s, l) => s + filmCount(l), 0)
    const pacs = A.reduce((s, l) => s + (Number(l.edi.charAt(4)) || 1) * Math.max(1, l.qty || 1), 0)
    return films && pacs > Math.min(films, p.max_count || 5) ? hit(rule, null, rule.message, `PACS ${pacs}매 / 촬영 ${films}매`) : null
  }
  const bad = A.filter((l) => Number(l.edi.charAt(4)) >= 2 || (l.qty || 1) >= 2)
  return bad.length ? hit(rule, null, rule.message, codesText(bad)) : null
}

/** 같은 날 상병 조합 금지 */
const forbiddenDxCombo: Handler = (rule, c, { matchTarget }) => {
  const p = paramsOf(rule)
  const A = c.lines.filter((l) => matchTarget(l, p.target))
  if (!A.length) return null
  if (!c.dx) return 'skip'
  const dx = c.dx
  const found: string[] = []
  for (const [label, list] of Object.entries(p.forbidden_dx_prefixes as Record<string, string[]>)) {
    if (dx.some((d) => d.pos !== 'excluded' && list.some((px) => d.code.startsWith(up(px))))) found.push(label)
  }
  if (p.forbidden_drug_classes && hasClass(c, p.forbidden_drug_classes)) found.push('항응고제')
  return found.length ? hit(rule, null, rule.message, `${codesText(A)} · ${found.join(', ')}`) : null
}

/** 약 병용(같은 날 처방) */
const dur: Handler = (rule, c) => {
  const p = paramsOf(rule)
  if (p.kind === 'combination') {
    const A = c.lines.filter((l) => (p.a!.drug_classes ?? []).some((x) => l.classes.has(x)))
    const B = c.lines.filter((l) => (p.b!.drug_classes ?? []).some((x) => l.classes.has(x)) && !(p.b!.exclude_drug_classes ?? []).some((x) => l.classes.has(x)) && !A.includes(l))
    if (!A.length || !B.length) return null
    if (rule.id === 'DR-02') {
      const inj = A.every((l) => l.route === 'B')
      return hit(rule, inj ? '참고' : '알림', rule.message + (inj ? ' (케토롤락 주사 1회 — 하루만 겹치면 사유 생략 가능)' : ' (투약 기간이 2일 이상 겹치면 병용금기 사유 필요)'), `${codesText(A)} + ${codesText(B)}`)
    }
    return hit(rule, null, rule.message, `${codesText(A)} + ${codesText(B)}`)
  }
  if (p.kind === 'same_class_same_day') {
    const A = c.lines.filter((l) => (p.target!.drug_classes ?? []).some((x) => l.classes.has(x)) && l.route !== 'C' && !/외용|패치|겔|크림|플라스타|파프|카타플라스마/.test(l.label))
    const ingredients = new Set(A.map(ingredientOf))
    return ingredients.size >= (p.min_distinct_ingredients || 2) ? hit(rule, null, rule.message, codesText(A)) : null
  }
  // 같은 성분: 약제급여목록 주성분코드가 있는 약끼리만 본다(이름만으로는 틀리기 쉬움)
  const byIngredient = new Map<string, Line[]>()
  for (const l of c.lines) {
    if (!l.info || !l.info[1]) continue
    const key = ingredientOf(l)
    const list = byIngredient.get(key) ?? []
    list.push(l)
    byIngredient.set(key, list)
  }
  const dup = [...byIngredient.values()].filter((list) => new Set(list.map((l) => l.code)).size >= 2)
  return dup.length ? hit(rule, null, rule.message, dup.map((list) => codesText(list)).join(', ')) : null
}

/** 상병마스터(심평원 배포용): 불완전코드·주상병 불가 */
const dxMaster: Handler = (rule, c, { dxI, dxN, tables }) => {
  if (rule.id === 'DX-08') return null // 필수 상병 규칙 안에서 함께 본다
  if (!c.lines.length) return null
  if (!c.dx) return 'skip'
  if (rule.id === 'DX-01') {
    const bad = c.dx.filter((d) => dxI.has(d.code))
    return bad.length ? hit(rule, null, '불완전코드입니다 — 하위 코드(자리수를 더 붙인 코드)로 바꿔 주세요', `${bad.map((d) => d.raw || d.code).join('·')} · 상병마스터 ${tables.dxFlags.version || ''}`) : null
  }
  const bad = c.dx.filter((d) => d.pos === 'main' && (dxN.has(d.code) || /^[VWXY]/.test(d.code)))
  return bad.length ? hit(rule, null, '주상병으로 쓸 수 없는 코드입니다 — 주상병을 다른 상병으로', bad.map((d) => d.raw || d.code).join('·')) : null
}

/** 청구 형식 중 메모 단계에서 볼 수 있는 것 */
const claimCode: Handler = (rule, c, { C }) => {
  if (rule.id === 'DX-06') {
    if (!c.dx) return c.lines.length ? 'skip' : null
    if (!c.dx.length || !c.lines.length) return null
    const mains = c.dx.filter((d) => d.pos === 'main').length
    return mains === 1 ? null : hit(rule, null, mains ? `주상병이 ${mains}개입니다 — 주상병은 1개` : '주상병이 없습니다 — 주상병 1개를 정해 주세요', `주상병 ${mains}개`)
  }
  if (rule.id === 'CL-15') return c.ben.length && !c.text.trim() ? hit(rule, null, rule.message, `처방 ${c.ben.length}줄 · 차트 기록 없음`) : null
  if (rule.id === 'ES-01') {
    const bad = c.ben.filter((l) => C.inGroup(l, 'eswt_clinic'))
    return bad.length ? hit(rule, null, rule.message, `${codesText(bad)} 급여로 입력`) : null
  }
  if (rule.id === 'US-01') {
    const bad = c.ben.filter((l) => C.inGroup(l, 'us_covered'))
    return bad.length ? hit(rule, '알림', '근골격 초음파는 산정특례·의심 1회 등 기준 밖이면 비급여입니다 — 급여로 입력한 것이 맞는지 확인', codesText(bad)) : null
  }
  return null // HY-12는 다른 규칙 결과를 보고 붙인다(engine.ts)
}

export const SAME_DAY_HANDLERS: Partial<Record<RuleDef['type'], Handler>> = {
  same_day_pair: samedayPair,
  required_dx: requiredDx,
  drug_requirement: drugRequirement,
  same_day_limit: samedayLimit,
  multiplier_cap: multiplierCap,
  dx_site_match: dxSiteMatch,
  documentation,
  imaging_count: imagingCount,
  forbidden_dx_combo: forbiddenDxCombo,
  dur,
  dx_master: dxMaster,
  claim_code: claimCode,
}
