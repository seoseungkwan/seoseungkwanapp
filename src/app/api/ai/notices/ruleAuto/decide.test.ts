import { beforeAll, describe, expect, it } from 'vitest'
import { checkRuleChange, noAutoRuleIds } from '@/lib/precheck/ruleUpdates'
import type { RuleDef, RulesFile } from '@/types/precheck'
import type { ReviewNotice, RuleAnswer, RuleChangeRow, RuleVerdict } from '@/types/ruleAuto'
import { loadTables } from '@/workers/precheck/tables'
import { basisLine, decideRule, triesRows, type DecideCtx } from './decide'

// 고친 규칙 정하기(specs/rule-auto REQ-7809 AC-7809.1~AC-7809.4, design 9절). 진짜 Claude·DB는 부르지 않는다 — AI 답은 시험이 만든 값이다.
// 규칙표는 workers/precheck/tables.ts의 loadTables로만 부른다(AC-007.4). 기준 규칙은 실제 규칙표의 횟수 규칙(count_window)이다

let file: RulesFile
beforeAll(async () => {
  const loaded = await loadTables()
  if (!loaded.ok) throw new Error(loaded.code)
  file = loaded.value.rules
}, 60_000) // 약 표 JSON이 커서 바쁜 기계에서는 첫 읽기가 10초를 넘는다

type Rec = Record<string, unknown>

// 까닭 글(requirements 기본값 5) 그대로
const NO_AUTO_TEXT = '이 규칙은 앱 안 계산으로 돌아 저절로 바꿀 수 없어요.'
const DATE_TEXT = '시행일을 글에서 찾지 못했거나 앞뒤가 맞지 않아 직접 확인해야 해요.'
const TRIES_TEXT = 'AI가 이 규칙을 살펴보지 못했어요. 직접 확인해 주세요.'
const CHECK_TEXT = 'AI가 고친 규칙이 점검 규칙 모양에 맞지 않아 직접 확인해야 해요.'

const POSTED = '2026-11-20'
const EFF = '2026-12-01'
const NOTICE_URL = 'https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=1'

function notice(over: Partial<ReviewNotice> = {}): ReviewNotice {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    title: '신경차단술의 산정기준 일부개정',
    noticeNo: '2026-251',
    postedOn: POSTED,
    kind: 'gosi',
    body: '[보건복지부 고시 제2026-251호]\n같은 병소 신경차단술 기준을 바꿔요.',
    attachText: '시행일: 2026-12-01',
    summary: null,
    url: NOTICE_URL,
    source: 'mohw_rss',
    ruleHits: [{ id: 'LA-18', title: '같은 병소 주 4회 이상' }],
    pending: ['LA-18'],
    tries: 0,
    ...over,
  }
}

const ruleOf = (id: string): RuleDef => {
  const rule = file.rules.find((r) => r.id === id)
  if (!rule) throw new Error(`규칙표에 ${id}가 없다`)
  return rule
}
/** 규칙의 params 깊은 사본을 고친 값 */
const paramsOf = (rule: RuleDef, edit: (p: Rec) => void = () => {}): Rec => {
  const params = structuredClone(rule.params) as Rec
  edit(params)
  return params
}
const thresholds = (p: Rec) => p.thresholds as Rec[]
/** AI가 쓰는 ruleJson: 세 칸만 담은 JSON 글 */
const ruleJson = (rule: RuleDef, edit: (p: Rec) => void = () => {}, patch: Rec = {}) =>
  JSON.stringify({ title: rule.title, message: rule.message, params: paramsOf(rule, edit), ...patch })

function answer(id: string, over: Partial<RuleAnswer> = {}): RuleAnswer {
  return {
    id,
    verdict: 'change',
    why: '같은 병소 신경차단술 기준이 7일 안 5회로 바뀌었어요.',
    before: '7일 안 4회째부터 알려요.',
    after: '7일 안 5회째부터 알려요.',
    effectiveFrom: EFF,
    ruleJson: '',
    ...over,
  }
}
/** LA-18 기준 횟수만 4 → n으로 바꾼 답 */
const atAnswer = (n: number, over: Partial<RuleAnswer> = {}, base = ruleOf('LA-18')) =>
  answer('LA-18', { ruleJson: ruleJson(base, (p) => (thresholds(p)[0].at = n)), ...over })

function ctxOf(id: string, over: Partial<DecideCtx> = {}): DecideCtx {
  const base = ruleOf(id)
  return { file, notice: notice(), base, current: base, currentFrom: null, ...over }
}

/** 판정 줄 모양(by_ai 참, 규칙·시행일 없음) */
function judgedRow(ruleId: string, verdict: RuleVerdict, why: string, over: Partial<RuleChangeRow> = {}): RuleChangeRow {
  return {
    noticeId: notice().id,
    ruleId,
    baseVersion: file.version,
    verdict,
    byAi: true,
    checkCode: null,
    why,
    before: '',
    after: '',
    effectiveFrom: null,
    rule: null,
    ...over,
  }
}

describe('AC-7809.1 decideRule — none·same·human 답은 그 판정 줄', () => {
  it.each(['none', 'same', 'human'] as const)('AC-7809.1: %s 답은 그 판정과 AI why로 된 줄이다(by_ai 참, rule·시행일·check_code 없음, 전/후 빈 글)', (verdict) => {
    const a = answer('LA-18', { verdict, why: '이 글은 신경차단술 횟수와 상관없어요.', effectiveFrom: EFF, ruleJson: ruleJson(ruleOf('LA-18')) })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(judgedRow('LA-18', verdict, '이 글은 신경차단술 횟수와 상관없어요.'))
  })

  it('AC-7809.1: 저절로 못 바꾸는 규칙(HY-12)도 human 답이면 AI why 그대로이고 check_code는 없다', () => {
    const a = answer('HY-12', { verdict: 'human', why: '수가 계산이 바뀌어 직접 봐야 해요.' })
    expect(decideRule(ctxOf('HY-12'), a)).toEqual(judgedRow('HY-12', 'human', '수가 계산이 바뀌어 직접 봐야 해요.'))
  })

  it('AC-7809.1: 줄의 noticeId는 글 id, baseVersion은 규칙표 판이다', () => {
    const row = decideRule(ctxOf('LA-18', { notice: notice({ id: '00000000-0000-4000-8000-0000000000bb' }) }), answer('LA-18', { verdict: 'none' }))
    expect(row.noticeId).toBe('00000000-0000-4000-8000-0000000000bb')
    expect(row.baseVersion).toBe(file.version)
  })
})

describe('AC-7809.2 decideRule — change 답이 검사를 지나면 change 줄', () => {
  it('AC-7809.2: 횟수 규칙(LA-18)의 숫자만 바꾼 답은 change 줄이고 rule = 지금 판에서 title·message·params를 바꾸고 basis 한 줄·시행일을 넣은 규칙이다', () => {
    const base = ruleOf('LA-18')
    const message = "같은 병소에 7일 안 5회 이상 신경차단술을 했으니 '주 2~3회 원칙'을 넘는 사유를 차트에 남기세요."
    const a = atAnswer(5, { ruleJson: ruleJson(base, (p) => (thresholds(p)[0].at = 5), { title: '같은 병소 주 5회 이상', message }) })
    const row = decideRule(ctxOf('LA-18'), a)
    const next: RuleDef = {
      ...base,
      title: '같은 병소 주 5회 이상',
      message,
      params: paramsOf(base, (p) => (thresholds(p)[0].at = 5)),
      basis: [...base.basis, { doc: notice().title, number: '보건복지부 고시 제2026-251호', effective: EFF, url: NOTICE_URL }],
      effective_from: EFF,
      effective_to: null,
    }
    expect(row).toEqual(
      judgedRow('LA-18', 'change', a.why, { before: a.before, after: a.after, effectiveFrom: EFF, rule: next }),
    )
    // Worker가 다시 거르는 검사(원래 규칙 기준)도 지나고, DB 제약(rule.id·rule.effective_from)과 맞는다
    expect(checkRuleChange(file, base, base, row.rule)).toBe('ok')
    expect(row.rule?.id).toBe(row.ruleId)
    expect(row.rule?.effective_from).toBe(row.effectiveFrom)
  })

  it('AC-7809.2: 받은 규칙(base·current)과 규칙표는 바뀌지 않는다', () => {
    const before = structuredClone(ruleOf('LA-18'))
    decideRule(ctxOf('LA-18'), atAnswer(5))
    expect(ruleOf('LA-18')).toEqual(before)
  })

  it('AC-7809.2: basis에 이 고시 한 줄이 맨 뒤에 더해지고 원래 근거 줄은 그대로다', () => {
    const base = ruleOf('LA-18')
    const row = decideRule(ctxOf('LA-18'), atAnswer(5))
    expect(row.verdict).toBe('change')
    expect(row.rule?.basis).toHaveLength(base.basis.length + 1)
    expect(row.rule?.basis.slice(0, -1)).toEqual(base.basis)
    expect(row.rule?.basis.at(-1)).toEqual(basisLine(notice(), EFF))
  })

  it('AC-7809.2: 같은 number의 근거가 이미 있으면 basis에 더하지 않는다(LA-18의 보건복지부 고시 제2023-242호)', () => {
    const base = ruleOf('LA-18')
    expect(base.basis.map((b) => b.number)).toContain('보건복지부 고시 제2023-242호')
    const row = decideRule(ctxOf('LA-18', { notice: notice({ noticeNo: '2023-242' }) }), atAnswer(5))
    expect(row.verdict).toBe('change')
    expect(row.rule?.basis).toEqual(base.basis)
  })

  it('AC-7809.2: 살아 있는 바뀐 판(current)이 있으면 그 판에서 고치고, 그 판보다 늦은 시행일이면 change다', () => {
    const base = ruleOf('LA-18')
    const current: RuleDef = {
      ...base,
      params: paramsOf(base, (p) => (thresholds(p)[0].at = 5)),
      basis: [...base.basis, { doc: '앞 고시', number: '보건복지부 고시 제2026-200호', effective: EFF }],
      effective_from: EFF,
      effective_to: null,
    }
    const ctx = ctxOf('LA-18', { current, currentFrom: EFF })
    const row = decideRule(ctx, atAnswer(6, { effectiveFrom: '2027-01-01' }, current))
    expect(row.verdict).toBe('change')
    expect(row.effectiveFrom).toBe('2027-01-01')
    expect((row.rule?.params.thresholds as Rec[])[0].at).toBe(6)
    expect(row.rule?.basis).toEqual([...current.basis, basisLine(notice(), '2027-01-01')])
    expect(checkRuleChange(file, base, current, row.rule)).toBe('ok')
  })

  it('AC-7809.2: 시행일이 올라온 날 −92일·+366일, 원래 규칙의 effective_from 당일이면 지난다(기본값 6 경계)', () => {
    expect(decideRule(ctxOf('LA-18'), atAnswer(5, { effectiveFrom: '2026-08-20' })).verdict).toBe('change') // 11-20 − 92일
    expect(decideRule(ctxOf('LA-18'), atAnswer(5, { effectiveFrom: '2027-11-21' })).verdict).toBe('change') // 11-20 + 366일
    // MN-03은 2026-07-01부터인 규칙이다
    expect(ruleOf('MN-03').effective_from).toBe('2026-07-01')
    const mn = (eff: string) =>
      decideRule(
        ctxOf('MN-03', { notice: notice({ postedOn: '2026-08-01' }) }),
        answer('MN-03', { effectiveFrom: eff, ruleJson: ruleJson(ruleOf('MN-03'), (p) => (thresholds(p)[0].at = 4)) }),
      )
    expect(mn('2026-07-01').verdict).toBe('change')
  })
})

describe('basisLine — 근거 한 줄(design 9절)', () => {
  it('AC-7809.2: 고시 번호가 있으면 number는 보건복지부 고시 제…호, doc은 글 제목, effective는 시행일, url은 글 주소다', () => {
    expect(basisLine(notice(), EFF)).toEqual({ doc: '신경차단술의 산정기준 일부개정', number: '보건복지부 고시 제2026-251호', effective: EFF, url: NOTICE_URL })
  })

  it('AC-7809.2: 고시 번호가 없으면 number는 출처 이름과 올라온 날, 출처가 없으면 고시·공지와 올라온 날이다', () => {
    expect(basisLine(notice({ noticeNo: null, source: 'hira_notice' }), EFF).number).toBe('심평원 공지 2026-11-20')
    expect(basisLine(notice({ noticeNo: null, source: 'hira_crtr' }), EFF).number).toBe('심평원 심사기준 2026-11-20')
    expect(basisLine(notice({ noticeNo: null, source: null }), EFF).number).toBe('고시·공지 2026-11-20')
  })

  it('AC-7809.2: 글 주소가 없으면 url 칸이 없고, doc은 제목 200자까지다', () => {
    const line = basisLine(notice({ url: null, title: '가'.repeat(250) }), EFF)
    expect(line).not.toHaveProperty('url')
    expect(line.doc).toBe('가'.repeat(200))
  })
})

describe('AC-7809.3 decideRule — 검사 실패는 human 줄(까닭 번호·기본값 5 글)', () => {
  const humanRow = (ruleId: string, checkCode: RuleChangeRow['checkCode'], why: string) => judgedRow(ruleId, 'human', why, { checkCode })

  it('AC-7809.3: 코드 묶음을 뺀 답(LA-18 target에서 tfesi)은 human·removed다', () => {
    const a = answer('LA-18', { ruleJson: ruleJson(ruleOf('LA-18'), (p) => ((p.target as Rec).code_groups = ['la_all'])) })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(humanRow('LA-18', 'removed', CHECK_TEXT))
  })

  it.each([
    ['names', 'LA-18', (p: Rec) => ((p.target as Rec).code_groups = ['la_all', 'tfesi', 'zz_no_such_group'])],
    // IJ-02는 기준 둘(참고·확인필요)을 둔다 — 등급 낱말이 이미 params에 있어 새 낱말 검사(names)보다 grade가 걸린다
    ['grade', 'IJ-02', (p: Rec) => thresholds(p).forEach((t) => (t.grade = '확인필요'))],
    ['status', 'LA-18', (p: Rec) => (p.thresholds = [{ grade: '알림' }])],
  ] as const)('AC-7809.3: checkRuleChange가 %s이면(%s) human 줄이고 check_code가 그 번호다', (code, id, edit) => {
    const a = answer(id, { ruleJson: ruleJson(ruleOf(id), edit) })
    expect(decideRule(ctxOf(id), a)).toEqual(humanRow(id, code, CHECK_TEXT))
  })

  it('AC-7809.3: 글이 너무 긴 규칙(message 301자)은 human·size다', () => {
    const a = answer('LA-18', { ruleJson: ruleJson(ruleOf('LA-18'), () => {}, { message: '가'.repeat(301) }) })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(humanRow('LA-18', 'size', CHECK_TEXT))
  })

  it.each([
    ['JSON이 아님', '{title'],
    ['빈 글자(너무 길어 parseReview가 비움)', ''],
    ['배열', '[]'],
    ['글자', '"규칙"'],
    ['null', 'null'],
  ])('AC-7809.3: ruleJson이 %s이면 human·shape다', (_name, text) => {
    expect(decideRule(ctxOf('LA-18'), answer('LA-18', { ruleJson: text }))).toEqual(humanRow('LA-18', 'shape', CHECK_TEXT))
  })

  it.each([
    ['칸이 넷(grade 더함)', { grade: '참고' }],
    ['칸이 넷(basis 더함)', { basis: [] }],
    ['title이 글자가 아님', { title: 5 }],
    ['message가 글자가 아님', { message: null }],
    ['params가 배열', { params: [] }],
    ['params가 null', { params: null }],
  ] as [string, Rec][])('AC-7809.3: ruleJson의 %s이면 human·shape다', (_name, patch) => {
    const a = answer('LA-18', { ruleJson: ruleJson(ruleOf('LA-18'), (p) => (thresholds(p)[0].at = 5), patch) })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(humanRow('LA-18', 'shape', CHECK_TEXT))
  })

  it('AC-7809.3: ruleJson에 칸이 빠지면(params 없음) human·shape다', () => {
    const a = answer('LA-18', { ruleJson: JSON.stringify({ title: '제목', message: '글', other: {} }) })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(humanRow('LA-18', 'shape', CHECK_TEXT))
  })

  it.each(['why', 'before', 'after'] as const)('AC-7809.3: change 답의 %s가 빈 글이면 human·shape다', (key) => {
    for (const blank of ['', '  ']) {
      expect(decideRule(ctxOf('LA-18'), atAnswer(5, { [key]: blank })), `${key}=${JSON.stringify(blank)}`).toEqual(humanRow('LA-18', 'shape', CHECK_TEXT))
    }
  })

  it.each([
    ['빈 글자', ''],
    ['실제 날짜가 아님', '2026-02-30'],
    ['꼴이 다름', '2026/12/01'],
    ['올라온 날 −93일', '2026-08-19'],
    ['올라온 날 +367일', '2027-11-22'],
  ])('AC-7809.3: 시행일이 %s이면 human·date다', (_name, eff) => {
    expect(decideRule(ctxOf('LA-18'), atAnswer(5, { effectiveFrom: eff }))).toEqual(humanRow('LA-18', 'date', DATE_TEXT))
  })

  it('AC-7809.3: 시행일이 원래 규칙의 effective_from보다 이르면 human·date다(MN-03 2026-07-01)', () => {
    const a = answer('MN-03', { effectiveFrom: '2026-06-30', ruleJson: ruleJson(ruleOf('MN-03'), (p) => (thresholds(p)[0].at = 4)) })
    expect(decideRule(ctxOf('MN-03', { notice: notice({ postedOn: '2026-08-01' }) }), a)).toEqual(humanRow('MN-03', 'date', DATE_TEXT))
  })

  it('AC-7809.3: 시행일이 원래 규칙의 effective_to보다 늦으면 human·date, 그날이면 지난다', () => {
    const base: RuleDef = { ...ruleOf('LA-18'), effective_to: '2026-12-31' }
    const ctx = ctxOf('LA-18', { base, current: base })
    expect(decideRule(ctx, atAnswer(5, { effectiveFrom: '2027-01-01' }, base))).toEqual(humanRow('LA-18', 'date', DATE_TEXT))
    expect(decideRule(ctx, atAnswer(5, { effectiveFrom: '2026-12-31' }, base)).verdict).toBe('change')
  })

  it('AC-7809.3: 살아 있는 바뀐 판이 있으면 그 판의 날짜와 같거나 이른 시행일은 human·date다', () => {
    const base = ruleOf('LA-18')
    const current: RuleDef = { ...base, params: paramsOf(base, (p) => (thresholds(p)[0].at = 5)), effective_from: EFF, effective_to: null }
    const ctx = ctxOf('LA-18', { current, currentFrom: EFF })
    for (const eff of [EFF, '2026-11-30']) {
      expect(decideRule(ctx, atAnswer(6, { effectiveFrom: eff }, current)), eff).toEqual(humanRow('LA-18', 'date', DATE_TEXT))
    }
  })

  it("AC-7809.3: 고친 것이 지금 판과 같으면(칸 차례만 다름) 'same' 줄이고 AI why다", () => {
    const base = ruleOf('LA-18')
    const reordered = JSON.stringify({ params: paramsOf(base), message: base.message, title: base.title })
    const a = answer('LA-18', { why: '기준이 그대로예요.', ruleJson: reordered })
    expect(decideRule(ctxOf('LA-18'), a)).toEqual(judgedRow('LA-18', 'same', '기준이 그대로예요.'))
  })

  it.each(['HY-12', 'DX-08', 'LA-23'])('AC-7809.3: 저절로 못 바꾸는 규칙(%s)에 change가 오면 human·no-auto 글이다', (id) => {
    expect(noAutoRuleIds(file).has(id)).toBe(true)
    const a = answer(id, { ruleJson: ruleJson(ruleOf(id)) })
    expect(decideRule(ctxOf(id), a)).toEqual(humanRow(id, 'no-auto', NO_AUTO_TEXT))
  })

  it('AC-7809.3: 저절로 못 바꾸는 종류(visit_fee·dx_master·claim_code) 규칙도 human·no-auto다', () => {
    for (const type of ['visit_fee', 'dx_master', 'claim_code']) {
      const rule = file.rules.find((r) => r.type === type)
      if (!rule) throw new Error(`${type} 규칙이 없다`)
      expect(decideRule(ctxOf(rule.id), answer(rule.id, { ruleJson: ruleJson(rule) })), rule.id).toEqual(humanRow(rule.id, 'no-auto', NO_AUTO_TEXT))
    }
  })

  it('AC-7809.3: 까닭 차례는 no-auto → shape → date다(앞의 것이 이긴다)', () => {
    expect(decideRule(ctxOf('HY-12'), answer('HY-12', { why: '', ruleJson: '{', effectiveFrom: '' })).checkCode).toBe('no-auto')
    expect(decideRule(ctxOf('LA-18'), answer('LA-18', { ruleJson: '{', effectiveFrom: '' })).checkCode).toBe('shape')
    expect(decideRule(ctxOf('LA-18'), atAnswer(5, { effectiveFrom: '', ruleJson: ruleJson(ruleOf('LA-18'), (p) => (thresholds(p)[0].grade = '참고')) })).checkCode).toBe('date')
  })

  it('AC-7809.3: 까닭 글은 DB 제약(why 120자, 제어 문자 없음) 안이다', () => {
    for (const text of [NO_AUTO_TEXT, DATE_TEXT, TRIES_TEXT, CHECK_TEXT]) {
      expect(text.length).toBeLessThanOrEqual(120)
      expect(text).not.toMatch(/\p{Cc}/u)
    }
  })
})

describe('AC-7809.4 triesRows — 세 번 실패한 글의 남은 규칙', () => {
  it('AC-7809.4: 남은 규칙마다 human 줄(by_ai 거짓, check_code tries, 세 번 실패 글)이다', () => {
    const n = notice({ tries: 3 })
    expect(triesRows(n, ['LA-18', 'MN-03'], file.version)).toEqual([
      judgedRow('LA-18', 'human', TRIES_TEXT, { byAi: false, checkCode: 'tries' }),
      judgedRow('MN-03', 'human', TRIES_TEXT, { byAi: false, checkCode: 'tries' }),
    ])
  })

  it('AC-7809.4: baseVersion은 받은 값이고, 남은 규칙이 없으면 빈 목록이다', () => {
    expect(triesRows(notice(), ['LA-18'], 'v-test')[0].baseVersion).toBe('v-test')
    expect(triesRows(notice(), [], file.version)).toEqual([])
  })
})
