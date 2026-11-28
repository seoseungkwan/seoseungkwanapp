import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { applyLearned, autoLearn, autoTemplate, slotWords, type LearnContext, type Slots } from '@/lib/precheck/memo/learn'
import type { LearnRule, LearnWhen } from '@/lib/precheck/memo/types'
import type { CheckSettings, ClaimMemosJson, InputSelection, MemoRowRaw, MemoScreenView, PrecheckFromScreen, PrecheckToPort, PrecheckToScreen, StoreLoadJson, StoreMonthJson } from '@/types/precheck'
import { createPrecheckJobs } from './jobs'
import { loadTables } from './tables'

// 청구 메모 학습의 Worker 쪽(specs/claim-learn design.md 4·5·5-1·5-2·6·7·10절, TASK-5). 학습 함수(learn.ts)의 origins·autoTemplate·autoLearn과
// Worker 메시지 learnAuto·learnDraft·firstLearn·learnUsed, 메모 보기의 learned·holes·sameDay·handStats를 본다. 시험 자료는 가짜 달 fixtures/precheck/fake/claim-month-memo.json

const FAKE = (name: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/precheck/fake/${name}`, import.meta.url)), 'utf-8')
const MEMO_MONTH = FAKE('claim-month-memo.json')
/** 가짜 달을 고친 글자 */
const monthWith = (edit: (raw: { s83: Record<string, string>[]; history: Record<string, unknown>[] } & Record<string, unknown>) => void) => {
  const raw = JSON.parse(MEMO_MONTH)
  edit(raw)
  return JSON.stringify(raw)
}

const PHRASES = ourClinicPhrases()
const WORDS = slotWords(PHRASES)
const WHEN: LearnWhen = { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] }
/** 허리 MBB 줄을 바꾸는 학습(지어낸 문장) */
const R: LearnRule = { id: 'l0000a001', name: 'LA358 · 허리', kind: 'replace', from: '{좌우} MBB {레벨}', to: '{좌우} MBB {레벨} 시행 (C-arm guide 하에)', after: '', when: { ...WHEN }, on: true, left: 3, made: '2026-11-01' }
const rule = (patch: Partial<LearnRule> = {}): LearnRule => ({ ...R, when: { ...R.when }, ...patch })
const CTX: LearnContext = { codes: new Set(['LA358']), regions: new Set(['lumbar']), chartText: '', doctors: [], words: WORDS }

// ── learn.ts: applyLearned의 origins ──────────

describe('AC-9301.1 applyLearned origins: 보이는 줄마다 바탕 엔진 줄과 쓴 학습', () => {
  const TEXT = '◈Rt MBB L4,5\n◈SNB\n\n◈PDNB'

  it('AC-9301.1: 다섯째 값 origins를 주면 줄마다 {line, engine, rule}을 함께 준다(바꾼 줄 = 엔진 줄과 학습, 더한 줄 = 엔진 줄 없음, 뺀 줄은 없음)', () => {
    const rules = [rule({ when: { ...WHEN, regions: [] }, to: '{좌우} MBB {레벨} 시행' }), rule({ id: 'l0000a002', kind: 'add', from: '', to: '◈C-arm', after: 'SNB' }), rule({ id: 'l0000a003', kind: 'remove', from: 'PDNB', to: '' })]
    const result = applyLearned(TEXT, rules, CTX, undefined, 'origins')
    expect(result.text).toBe('◈Rt MBB L4,5 시행\n◈SNB\n◈C-arm\n')
    expect(result.used).toEqual(['l0000a001', 'l0000a003', 'l0000a002'])
    expect(result.origins).toEqual([
      { line: '◈Rt MBB L4,5 시행', engine: '◈Rt MBB L4,5', rule: 'l0000a001' },
      { line: '◈SNB', engine: '◈SNB', rule: null },
      { line: '◈C-arm', engine: null, rule: 'l0000a002' },
      { line: '', engine: '', rule: null },
    ])
    expect(result.origins.map((origin) => origin.line).join('\n')).toBe(result.text)
  })

  it('AC-9301.1·AC-9316.1: origins 없이 부르면 지금처럼 {text, used}뿐이고 글·쓴 학습은 origins를 줄 때와 같다', () => {
    const plain = applyLearned(TEXT, [R], CTX, undefined)
    expect(Object.keys(plain).sort()).toEqual(['text', 'used'])
    const withOrigins = applyLearned(TEXT, [R], CTX, undefined, 'origins')
    expect({ text: withOrigins.text, used: withOrigins.used }).toEqual(plain)
  })

  it('AC-9301.1: 쓸 학습이 없으면 줄마다 엔진 줄 그대로이고, 한 줄 모드는 글 전체가 한 줄이다', () => {
    expect(applyLearned(TEXT, [], CTX, undefined, 'origins').origins).toEqual(TEXT.split('\n').map((line) => ({ line, engine: line, rule: null })))
    const one = applyLearned('◈Rt MBB L4,5 ◈SNB', [rule({ from: '{좌우} MBB {레벨} ◈SNB', to: '{좌우} MBB {레벨} 시행 ◈SNB' })], CTX, 'oneLine', 'origins')
    expect(one.origins).toEqual([{ line: '◈Rt MBB L4,5 시행 ◈SNB', engine: '◈Rt MBB L4,5 ◈SNB', rule: 'l0000a001' }])
  })
})

// ── learn.ts: autoTemplate ──────────

describe('AC-9301.1 autoTemplate: 새 문장의 그 진료 값을 바뀌는 칸으로', () => {
  it('AC-9301.1: 그 진료의 좌우·레벨·부위 글자와 같은 글자만 {좌우}·{레벨}·{부위}로 바꾼다', () => {
    expect(autoTemplate('Rt MBB L4,5 시행 (C-arm guide 하에)', { 좌우: 'Rt', 레벨: 'L4,5' }, WORDS)).toBe('{좌우} MBB {레벨} 시행 (C-arm guide 하에)')
    expect(autoTemplate('요추부 MBB L4,5 Rt', { 부위: '요추부', 레벨: 'L4,5', 좌우: 'Rt' }, WORDS)).toBe('{부위} MBB {레벨} {좌우}')
  })

  it('AC-9301.1: 그 진료 값과 다른 글자·칸 값이 없는 글자는 그대로 둔다(글자 그대로 안내는 학습 창이 한다)', () => {
    expect(autoTemplate('Lt MBB L3,4', { 좌우: 'Rt', 레벨: 'L4,5' }, WORDS)).toBe('Lt MBB L3,4')
    expect(autoTemplate('Rt MBB L4,5', {}, WORDS)).toBe('Rt MBB L4,5')
  })
})

// ── learn.ts: autoLearn ──────────

describe('AC-9301.1 autoLearn: 고친 줄마다 학습을 저절로 만든다', () => {
  /** 엔진 줄의 칸 값(Worker는 줄에서 잡는다): 시험에서는 정해 둔 값 */
  const slotsOf = (line: string): Slots => (line.includes('L4,5') ? { 좌우: 'Rt', 레벨: 'L4,5' } : {})
  const ENGINE = '◈Rt MBB L4,5\n◈SNB'
  const run = (edited: string, options: { shown?: string; rules?: LearnRule[]; when?: LearnWhen; forbidden?: string[] } = {}) => {
    const rules = options.rules ?? []
    const shown = applyLearned(options.shown ?? ENGINE, rules, CTX, undefined, 'origins')
    return autoLearn({ shown: shown.text, edited, origins: shown.origins, when: options.when ?? WHEN, slotsOf, words: WORDS, phrases: PHRASES, rules, forbidden: options.forbidden ?? ['가상환자01', '900001'] })
  }
  const NONE = { add: [], update: [], style: [], personal: 0 }

  it('AC-9301.1: 바꾼 줄은 줄 바꿈 학습이다: 줄 틀 = 엔진 줄의 틀, 문장 = 새 줄의 그 진료 값을 칸으로, 조건 = 처방 코드 + 부위, 켜짐·남은 확인 3·조건 이름', () => {
    expect(run('◈Rt MBB L4,5 시행 (C-arm guide 하에)\n◈SNB')).toEqual({
      ...NONE,
      add: [{ kind: 'replace', from: '{좌우} MBB {레벨}', to: '{좌우} MBB {레벨} 시행 (C-arm guide 하에)', after: '', when: WHEN, on: true, left: 3, name: 'LA358 · 허리' }],
    })
  })

  it('AC-9301.1: 더한 줄은 줄 더함(앞 줄 틀 = 앞 엔진 줄의 틀), 뺀 줄은 줄 뺌이다', () => {
    expect(run('◈Rt MBB L4,5\n◈C-arm guide 하에\n◈SNB').add).toEqual([{ kind: 'add', from: '', to: '◈C-arm guide 하에', after: '{좌우} MBB {레벨}', when: WHEN, on: true, left: 3, name: 'LA358 · 허리' }])
    expect(run('◈Rt MBB L4,5').add).toEqual([{ kind: 'remove', from: 'SNB', to: '', after: '', when: WHEN, on: true, left: 3, name: 'LA358 · 허리' }])
  })

  it('AC-9301.1: 이미 학습이 쓴 줄을 다시 고치면 같은 줄 틀·같은 조건의 그 학습 문장을 바꾸고 새로 더하지 않는다', () => {
    const result = run('◈Rt MBB L4,5 시행함\n◈SNB', { rules: [rule({ to: '{좌우} MBB {레벨} 시행' })] })
    expect(result).toEqual({ ...NONE, update: [{ id: R.id, to: '{좌우} MBB {레벨} 시행함' }] })
  })

  it('AC-9301.1: 쓴 학습의 조건이 이번 조건과 다르면 바꾸지 않고 새로 더한다', () => {
    const other = rule({ to: '{좌우} MBB {레벨} 시행', when: { ...WHEN, regions: [] } })
    const result = run('◈Rt MBB L4,5 시행함\n◈SNB', { rules: [other] })
    expect(result.update).toEqual([])
    expect(result.add).toEqual([expect.objectContaining({ kind: 'replace', from: '{좌우} MBB {레벨}', to: '{좌우} MBB {레벨} 시행함', when: WHEN })])
  })

  it('AC-9301.1: 옛 줄에 빈칸 표시([… 확인])가 있던 줄을 채운 고침은 학습하지 않는다', () => {
    expect(run('◈ICNB Rt 3 level', { shown: '◈ICNB [좌우 확인] 3 level' })).toEqual(NONE)
  })

  it('AC-9301.1·AC-9303.1: 알아보는 모양 고침(좌우 표기)인 줄은 학습하지 않고 style에 넣는다', () => {
    const result = run('◈우측 MBB L4,5\n◈SNB')
    expect(result.add).toEqual([])
    expect(result.style).toEqual([expect.objectContaining({ field: 'sideStyle', from: 'Rt', to: '우측' })])
  })

  it('AC-9301.5: 전화·주민번호·메일 모양이나 그 진료의 환자 이름·차트번호가 든 줄은 학습하지 않고 센다', () => {
    const result = run(`◈Rt MBB L4,5 ${['010', '1234', '5678'].join('-')}\n◈SNB\n◈가상환자01 보호자 동행\n◈차트 900001`)
    expect(result).toEqual({ ...NONE, personal: 3 })
  })

  it('AC-9301.1: 조건이 하나도 없거나(코드·부위 없음) 고친 줄이 없거나 300자를 넘으면 학습이 없다', () => {
    expect(run('◈Rt MBB L4,5 시행\n◈SNB', { when: { ...WHEN, codes: [], regions: [] } })).toEqual(NONE)
    expect(run('  ◈Rt MBB L4,5  \n\n◈SNB  ')).toEqual(NONE)
    expect(run(`◈Rt MBB L4,5 ${'가'.repeat(300)}\n◈SNB`)).toEqual(NONE)
  })

  it('AC-9301.5·AC-9316.2: 만든 학습에는 학습 모양 칸뿐이고 환자 값이 없다', () => {
    const { add } = run('◈Rt MBB L4,5 시행\n◈SNB')
    expect(Object.keys(add[0]).sort()).toEqual(['after', 'from', 'kind', 'left', 'name', 'on', 'to', 'when'])
    expect(JSON.stringify(add)).not.toMatch(/가상환자|900001/)
  })
})

// ── Worker ──────────

const DAY = { from: '2026-10-12', to: '2026-10-12' }
const SETTINGS: CheckSettings = { rules: { schema: 1, off: [], on: [], grade: [] }, phrases: PHRASES, dxLinks: [] }
const SELECT: InputSelection = { mode: 'date', from: DAY.from, to: DAY.to, typed: '', chip: '', kind: 'range', day: DAY.from, rangeFrom: DAY.from, rangeTo: DAY.to }
/** 학습을 실은 설정 */
const withLearned = (rules: LearnRule[], learnKinds?: string[]): CheckSettings => ({ ...SETTINGS, phrases: { ...ourClinicPhrases(), learned: rules, ...(learnKinds ? { learnKinds } : {}) } as Phrases })
/** 진료: m41·m72·m73 = 허리 MBB(학습 R이 맞음), m44 = 허리 MBB 다른 줄 틀, m10 = 빈칸([좌우 확인]) */
const [M41, M72, M73, M44, M10] = ['m41', 'm72', 'm73', 'm44', 'm10']

function chunked(text: string) {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += 4096) parts.push(text.slice(i, i + 4096))
  return { parts, end: { count: parts.length, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text, 'utf8').digest('hex') } }
}

type Made = { jobs: ReturnType<typeof createPrecheckJobs>; posts: PrecheckToScreen[]; sent: PrecheckToPort[]; asks: number }
let ids = 0
async function stream(made: Pick<Made, 'jobs'>, id: string, text: string) {
  const { parts, end } = chunked(text)
  for (const [seq, data] of parts.entries()) await made.jobs.fromPort({ type: 'chunk', id, seq, data })
  await made.jobs.fromPort({ type: 'end', id, ...end })
}
const memosJson = (rows: MemoRowRaw[]) => JSON.stringify({ version: 1, period: DAY, truncated: false, invalidRows: 0, rows } satisfies ClaimMemosJson)
const storeJson = (work: Partial<StoreMonthJson>) => JSON.stringify({ months: { '2026-10': { drafts: {}, done: {}, journal: {}, ...work } } } satisfies StoreLoadJson)

async function ready(options: { settings?: CheckSettings; store?: Partial<StoreMonthJson>; month?: string } = {}): Promise<Made> {
  const posts: PrecheckToScreen[] = []
  const sent: PrecheckToPort[] = []
  const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables, toPort: (m) => sent.push(m) })
  const made = { jobs, posts, sent, asks: 0 }
  await jobs.fromScreen({ type: 'loadStart', load: 1 } satisfies PrecheckFromScreen)
  await stream(made, 'month', options.month ?? MEMO_MONTH)
  await jobs.fromScreen({ type: 'month', id: 'month', load: 1 } satisfies PrecheckFromScreen)
  await stream(made, 'memos', memosJson([]))
  await jobs.fromScreen({ type: 'loadPart', part: 'memos', id: 'memos', load: 1 } satisfies PrecheckFromScreen)
  await stream(made, 'store', storeJson(options.store ?? {}))
  await jobs.fromScreen({ type: 'loadPart', part: 'store', id: 'store', load: 1 } satisfies PrecheckFromScreen)
  await jobs.fromScreen({ type: 'check', check: 1, load: 1, visible: DAY, settings: options.settings ?? SETTINGS } satisfies PrecheckFromScreen)
  expect(posts.at(-1)).toMatchObject({ type: 'check', ok: true })
  posts.length = 0
  sent.length = 0
  return made
}
const viewOf = async (made: Made): Promise<MemoScreenView> => {
  const ask = ++made.asks
  await made.jobs.fromScreen({ type: 'memoView', ask, selection: SELECT } satisfies PrecheckFromScreen)
  const answer = made.posts.filter((m) => m.type === 'memoView' && m.ask === ask).at(-1)
  if (answer?.type !== 'memoView' || !answer.ok) throw new Error('memoView 답이 없다')
  return answer.view
}
const rowOf = (view: MemoScreenView, key: string) => view.table.find((row) => row.key === key)!
const targetOf = (view: MemoScreenView, key: string) => [...view.targets.batch, ...view.targets.left.flatMap((group) => group.rows)].find((row) => row.key === key)!
const postsOf = <T extends PrecheckToScreen['type']>(made: Made, type: T) => made.posts.filter((m): m is Extract<PrecheckToScreen, { type: T }> => m.type === type)
const edit = (made: Made, visitKey: string, text: string) => made.jobs.fromScreen({ type: 'editMemo', visitKey, text } satisfies PrecheckFromScreen)
const copied = (made: Made, visitKey: string, text: string) => made.jobs.fromScreen({ type: 'memoCopied', visitKey, text } satisfies PrecheckFromScreen)
const LEARNED_TEXT = '◈Rt MBB L4,5 시행 (C-arm guide 하에)'

describe('AC-9302.1·AC-9302.6 Worker 덧씌우기: 메모 보기에 학습 글과 learned 꼬리표', { timeout: 60_000 }, () => {
  it('AC-9302.1·AC-9302.6: 조건이 맞는 진료의 엔진 줄이 학습 문장으로 바뀌고 줄(표·목록)에 learned {id, name, left}가 실린다', async () => {
    const view = await viewOf(await ready({ settings: withLearned([R]) }))
    for (const key of [M41, M73]) {
      expect(rowOf(view, key).text).toBe(LEARNED_TEXT)
      expect(rowOf(view, key).learned).toEqual([{ id: R.id, name: R.name, left: 3 }])
      expect(targetOf(view, key).learned).toEqual([{ id: R.id, name: R.name, left: 3 }])
    }
    expect(rowOf(view, M72).text).toBe('◈Both MBB L4,5,S1 시행 (C-arm guide 하에)')
    expect(rowOf(view, M44).text).toBe('◈MBB L4-S1 Rt')
    expect(rowOf(view, M44)).not.toHaveProperty('learned')
  })

  it('AC-9302.6: 남은 확인이 0인 학습도 꼬리표는 실린다(left 0). 꺼 둔 학습은 쓰지 않는다', async () => {
    expect(rowOf(await viewOf(await ready({ settings: withLearned([rule({ left: 0 })]) })), M41).learned).toEqual([{ id: R.id, name: R.name, left: 0 }])
    const off = rowOf(await viewOf(await ready({ settings: withLearned([rule({ on: false })]) })), M41)
    expect(off.text).toBe('◈Rt MBB L4,5')
    expect(off).not.toHaveProperty('learned')
  })

  it('AC-9316.1: 학습이 없으면 메모 글·줄 칸이 학습 칸이 없을 때와 한 글자도 같다', async () => {
    const plain = await viewOf(await ready())
    const empty = await viewOf(await ready({ settings: withLearned([]) }))
    expect(empty.table).toEqual(plain.table)
    expect(plain.table.some((row) => 'learned' in row)).toBe(false)
  })

  it('AC-9302.5: 이미 완료한 진료·비트 메모가 이미 있는 진료·사람이 고친 진료에는 학습을 쓰지 않는다', async () => {
    const done = rowOf(await viewOf(await ready({ settings: withLearned([R]), store: { done: { [M41]: true } } })), M41)
    expect(done.text).toBe('◈Rt MBB L4,5')
    expect(done).not.toHaveProperty('learned')
    const inBit = monthWith((raw) => {
      for (const row of raw.history) if (row.v === M41) row.m = '비트에 있던 다른 글(가상)'
    })
    expect(rowOf(await viewOf(await ready({ settings: withLearned([R]), month: inBit })), M41).text).toBe('◈Rt MBB L4,5')
    const drafted = rowOf(await viewOf(await ready({ settings: withLearned([R]), store: { drafts: { [M41]: '◈사람이 고친 글(가상)' } } })), M41)
    expect(drafted.text).toBe('◈사람이 고친 글(가상)')
    expect(drafted).not.toHaveProperty('learned')
  })

  it('AC-9302.5: 학습을 쓴 메모를 복사로 완료한 뒤 학습이 바뀌어도 그 진료의 글은 그대로다', async () => {
    const made = await ready({ settings: withLearned([R]) })
    await copied(made, M41, LEARNED_TEXT)
    await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: withLearned([rule({ to: '{좌우} MBB {레벨} 다른 문장' })]) } satisfies PrecheckFromScreen)
    const view = await viewOf(made)
    expect(rowOf(view, M41).text).toBe(LEARNED_TEXT)
    expect(rowOf(view, M73).text).toBe('◈Rt MBB L4,5 다른 문장')
  })

  it('AC-9302.3: 진료한 원장님 조건은 도우미 0.15.0 진료의(visitDoctors)로 맞추고, 진료의를 모르면 맞지 않는다', async () => {
    const byDoctor = withLearned([rule({ when: { ...WHEN, doctors: ['D01'] } })])
    const known = monthWith((raw) => {
      raw.visitDoctors = [['900010', '20261012', 'D01']]
      raw.doctors = [['D01', '가상원장']]
    })
    const view = await viewOf(await ready({ settings: byDoctor, month: known }))
    expect(rowOf(view, M41).text).toBe(LEARNED_TEXT)
    expect(rowOf(view, M73).text).toBe('◈Rt MBB L4,5')
    expect(rowOf(await viewOf(await ready({ settings: byDoctor })), M41).text).toBe('◈Rt MBB L4,5')
  })
})

describe('AC-9301.1 learnAuto: 고친 글을 저장한 뒤 저절로 학습', { timeout: 60_000 }, () => {
  it('AC-9301.1: 고친 글을 저장(store.save)하고 바뀐 줄마다 만든 학습을 learnAuto로 보낸다', async () => {
    const made = await ready()
    await viewOf(made)
    made.posts.length = 0
    await edit(made, M73, LEARNED_TEXT)
    expect(made.sent.filter((m) => m.cmd === 'store.save')).toHaveLength(1)
    expect(postsOf(made, 'learnAuto')).toEqual([
      {
        type: 'learnAuto',
        visitKey: M73,
        add: [{ kind: 'replace', from: '{좌우} MBB {레벨}', to: '{좌우} MBB {레벨} 시행 (C-arm guide 하에)', after: '', when: WHEN, on: true, left: 3, name: 'LA358 · 허리' }],
        update: [],
        style: [],
        personal: 0,
      },
    ])
    expect(JSON.stringify(postsOf(made, 'learnAuto'))).not.toMatch(/가상환자|9\d{5}/)
  })

  it('AC-9301.1: 학습이 쓴 줄을 다시 고치면 그 학습 바꾸기(update)이고, 그 진료에 쓰인 학습은 learnUsed edited로 알린다', async () => {
    const made = await ready({ settings: withLearned([R]) })
    expect(rowOf(await viewOf(made), M41).text).toBe(LEARNED_TEXT)
    made.posts.length = 0
    await edit(made, M41, '◈Rt MBB L4,5 시행')
    expect(postsOf(made, 'learnUsed')).toEqual([{ type: 'learnUsed', ids: [R.id], how: 'edited' }])
    expect(postsOf(made, 'learnAuto')).toEqual([{ type: 'learnAuto', visitKey: M41, add: [], update: [{ id: R.id, to: '{좌우} MBB {레벨} 시행' }], style: [], personal: 0 }])
  })

  it('AC-9301.1: 빈칸만 채운 고침·앞뒤 빈칸만 다른 고침이면 learnAuto가 없다(고친 글은 그대로 저장)', async () => {
    const made = await ready()
    const view = await viewOf(made)
    expect(rowOf(view, M10).text).toBe('◈ICNB [좌우 확인] 3 level')
    await edit(made, M10, '◈ICNB Rt 3 level')
    await edit(made, M73, '  ◈Rt MBB L4,5  ')
    expect(made.sent.filter((m) => m.cmd === 'store.save')).toHaveLength(2)
    expect(postsOf(made, 'learnAuto')).toEqual([])
  })

  it('AC-9301.5: 개인정보 모양 줄은 학습하지 않고 personal로 센다', async () => {
    const made = await ready()
    await viewOf(made)
    await edit(made, M73, `◈Rt MBB L4,5\n◈보호자 ${['010', '1234', '5678'].join('-')}`)
    expect(postsOf(made, 'learnAuto')).toEqual([{ type: 'learnAuto', visitKey: M73, add: [], update: [], style: [], personal: 1 }])
  })
})

describe('AC-9301.2 learnDraft: [조건 바꾸기]의 학습 창 재료', { timeout: 60_000 }, () => {
  const draftOf = async (made: Made, visitKey: string) => {
    made.posts.length = 0
    await made.jobs.fromScreen({ type: 'learnDraft', visitKey } satisfies PrecheckFromScreen)
    const answers = postsOf(made, 'learnDraft')
    expect(answers).toHaveLength(1)
    return answers[0]
  }

  it('AC-9301.2·AC-9301.3: 방금 학습한 줄 차이(옛 → 새, 줄 틀·문장)와 그 진료의 시술 코드·다른 코드·부위·진료의·금지 글·바뀌는 칸 글자를 준다', async () => {
    const doctors = monthWith((raw) => {
      raw.visitDoctors = [['900018', '20261012', 'D01']]
      raw.doctors = [['D01', '가상원장']]
    })
    const made = await ready({ month: doctors })
    await viewOf(made)
    await edit(made, M73, LEARNED_TEXT)
    expect(await draftOf(made, M73)).toEqual({
      type: 'learnDraft',
      visitKey: M73,
      ok: true,
      diffs: [{ kind: 'replace', old: '◈Rt MBB L4,5', new: LEARNED_TEXT, before: '', from: '{좌우} MBB {레벨}', to: '{좌우} MBB {레벨} 시행 (C-arm guide 하에)', after: '', update: null, skip: null, style: null }],
      codes: ['LA358'],
      withCodes: [],
      regions: ['lumbar'],
      doctors: [{ code: 'D01', name: '가상원장' }],
      forbidden: expect.arrayContaining(['가상환자18', '900018']),
      words: WORDS,
    })
  })

  it('AC-9301.2: 설정이 새 학습으로 다시 와도(메모가 학습 글이 되어도) 그 고침의 줄 차이를 준다', async () => {
    const made = await ready()
    await viewOf(made)
    await edit(made, M73, LEARNED_TEXT)
    await made.jobs.fromScreen({ type: 'check', check: 2, load: 1, visible: DAY, settings: withLearned([R]) } satisfies PrecheckFromScreen)
    const draft = await draftOf(made, M73)
    if (!draft.ok) throw new Error('learnDraft ok가 거짓이다')
    expect(draft.diffs).toEqual([expect.objectContaining({ kind: 'replace', old: '◈Rt MBB L4,5', new: LEARNED_TEXT })])
  })

  it('AC-9301.2: 진료의를 모르는 진료(옛 도우미)면 doctors가 비고, 고치지 않은 진료는 줄 차이가 비며, 없는 진료는 ok 거짓이다', async () => {
    const made = await ready()
    await viewOf(made)
    expect(await draftOf(made, M41)).toMatchObject({ ok: true, diffs: [], doctors: [], codes: ['LA358'], regions: ['lumbar'] })
    expect(await draftOf(made, 'no-such-visit')).toEqual({ type: 'learnDraft', visitKey: 'no-such-visit', ok: false })
  })
})

describe('AC-9302.7 learnUsed: 학습이 쓰인 메모를 끝내면 done', { timeout: 60_000 }, () => {
  it('AC-9302.7: [복사(완료)]로 끝내면 그 진료에 쓰인 학습을 done으로 알린다. 학습이 없는 메모면 보내지 않는다', async () => {
    const made = await ready({ settings: withLearned([R]) })
    const view = await viewOf(made)
    await copied(made, M41, LEARNED_TEXT)
    expect(postsOf(made, 'learnUsed')).toEqual([{ type: 'learnUsed', ids: [R.id], how: 'done' }])
    made.posts.length = 0
    await copied(made, M44, rowOf(view, M44).text)
    expect(postsOf(made, 'learnUsed')).toEqual([])
  })

  it('AC-9302.7: 비트 입력이 완료로 끝난 진료마다 쓰인 학습을 한 번에 done으로 알린다(같은 학습은 진료 수만큼)', async () => {
    const made = await ready({ settings: withLearned([R]) })
    await viewOf(made)
    await made.jobs.fromScreen({ type: 'buildInputBatch', run: 1, what: 'selection', selection: SELECT } satisfies PrecheckFromScreen)
    const send = made.sent.find((m) => m.cmd === 'bit.input')!
    const end = JSON.stringify({ status: 'finished', code: null, reason: null, fields: [], noAsk: false, results: [M41, M73, M44].map((visitKey) => ({ visitKey, result: '완료', reason: '' })) })
    const id = `input${++ids}`
    await stream(made, id, end)
    made.posts.length = 0
    await made.jobs.fromPort({ type: 'sent', ticket: send.ticket, ok: true, id, count: 1 })
    expect(postsOf(made, 'inputDone')).toHaveLength(1)
    expect(postsOf(made, 'learnUsed')).toEqual([{ type: 'learnUsed', ids: [R.id, R.id], how: 'done' }])
  })
})

describe('AC-9305.1 firstLearn: 처음 학습 종류', { timeout: 60_000 }, () => {
  const firstOf = async (made: Made) => {
    made.posts.length = 0
    await made.jobs.fromScreen({ type: 'firstLearn' } satisfies PrecheckFromScreen)
    const answers = postsOf(made, 'firstLearn')
    expect(answers).toHaveLength(1)
    return answers[0]
  }

  it('AC-9305.1: 메모가 필요한 진료를 시술 코드 묶음 + 부위로 묶어 진료 수 많은 차례로 주고, 종류마다 이름·수·예시 진료(차트 줄·처방·지금 메모)가 있다', async () => {
    const made = await ready()
    const view = await viewOf(made)
    const answer = await firstOf(made)
    expect(answer.total).toBe(view.table.filter((row) => row.hasMemo).length)
    const counts = answer.kinds.map((kind) => kind.count)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
    expect(answer.kinds.reduce((sum, kind) => sum + kind.count, 0)).toBeLessThanOrEqual(answer.total)
    for (const kind of answer.kinds) {
      expect(kind.key.length).toBeLessThanOrEqual(120)
      expect(kind.key).toMatch(/^[^|]*\|[a-z,]*$/)
    }
    expect(answer.kinds[0]).toEqual({
      key: 'LA358|lumbar',
      name: 'MBB · 허리',
      count: expect.any(Number),
      done: false,
      example: { visitKey: M41, chart: ['요추 통증', '우측 MBB L4,5'], rx: [{ code: 'LA358', name: 'LA358', qty: 1 }], memo: '◈Rt MBB L4,5' },
    })
    expect(answer.kinds[0].count).toBeGreaterThanOrEqual(7)
    const both = answer.kinds.find((kind) => kind.key === 'LA272+LA358|lumbar')
    expect(both?.name).toBe('MBB + SNB · 허리')
  })

  it('AC-9305.3: 병원 문구의 learnKinds에 있는 종류는 done이고, 예시는 완료하지 않은 진료가 먼저다', async () => {
    const made = await ready({ settings: withLearned([], ['LA358|lumbar']), store: { done: { [M41]: true } } })
    await viewOf(made)
    const kind = (await firstOf(made)).kinds.find((row) => row.key === 'LA358|lumbar')!
    expect(kind.done).toBe(true)
    expect(kind.example.visitKey).not.toBe(M41)
  })

  it('AC-9305.4: 점검 전(불러온 진료 없음)이면 total 0·종류 없음이다', async () => {
    const posts: PrecheckToScreen[] = []
    const jobs = createPrecheckJobs({ post: (m) => posts.push(m), loadTables })
    await jobs.fromScreen({ type: 'firstLearn' } satisfies PrecheckFromScreen)
    expect(posts).toEqual([{ type: 'firstLearn', total: 0, kinds: [] }])
  })
})

describe('AC-9307.1·AC-9309.1 빈칸 수와 하루 두 번', { timeout: 60_000 }, () => {
  it('AC-9307.1: 메모 글의 [… 확인] 개수를 holes로 싣는다(없으면 칸이 없다)', async () => {
    const view = await viewOf(await ready())
    expect(rowOf(view, M10).holes).toBe(1)
    expect(targetOf(view, M10).holes).toBe(1)
    expect(rowOf(view, M73)).not.toHaveProperty('holes')
  })

  it('AC-9309.1: 같은 차트번호·같은 날 진료가 둘 이상이면 두 진료 모두 sameDay(그 수)를 싣는다', async () => {
    const twice = monthWith((raw) => {
      for (const row of raw.s83) if (row['내원번호'] === 'm05') row['차트번호'] = '900019'
      for (const row of raw.history) if (row.v === 'm05') row.p = '900019'
    })
    const view = await viewOf(await ready({ month: twice }))
    expect(rowOf(view, 'm04').sameDay).toBe(2)
    expect(rowOf(view, 'm05').sameDay).toBe(2)
    expect(rowOf(view, M73)).not.toHaveProperty('sameDay')
  })
})

describe('AC-9318.1·AC-9318.2 handStats: 손 간 정도', { timeout: 60_000 }, () => {
  it('AC-9318.1: need = 메모가 필요한 진료 수, learned = 학습이 쓰인 메모 수, edited = 사람이 고친 글이 있는 진료 수', async () => {
    const made = await ready({ settings: withLearned([R]) })
    const view = await viewOf(made)
    const need = view.table.filter((row) => row.hasMemo).length
    expect(need).toBeGreaterThan(0)
    expect(view.handStats).toEqual({ need, learned: 3, edited: 0 })
    await edit(made, M44, '◈MBB L4-S1 Rt 시행')
    expect((await viewOf(made)).handStats).toEqual({ need, learned: 3, edited: 1 })
  })

  it('AC-9318.2: 학습이 쓰인 메모를 고치지 않고 완료하면 learned에 남고 edited에 들지 않는다. 학습 글을 고치면 learned에서 빠지고 edited에 든다', async () => {
    const made = await ready({ settings: withLearned([R]) })
    const before = (await viewOf(made)).handStats!
    await copied(made, M41, LEARNED_TEXT)
    expect((await viewOf(made)).handStats).toEqual(before)
    await edit(made, M73, '◈Rt MBB L4,5 시행')
    expect((await viewOf(made)).handStats).toEqual({ need: before.need, learned: before.learned - 1, edited: 1 })
  })
})
