import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLedger, dayTotals, ledgerDoctors } from '@/lib/sunap/ledger'
import type { RxGroupDef } from '@/types/analysis'
import {
  DEFAULT_RSV_KINDS,
  DEFAULT_RSV_WORDS,
  type Ledger,
  type LedgerSettings,
  type RsvKindDef,
  type SunapLocalDay,
  type SunapLocalMonth,
  type SunapReply,
} from '@/types/sunap'
import { createHandler } from './handler'
import type { SunapStreamRef, SunapWorkerMessage } from './messages'

// 수납일지 장부 Worker 흐름(spec sunap-ilji REQ-4904). 가짜 포트(통로)·가짜 post(화면)로 handler를 바로 부른다.
// 시험 자료는 지어낸 가짜 환자다(이름 '가상환자NN')

const DAY = '2026-11-16'
const MONTH = '2026-11'
const OTHER_DAY = '2026-11-15'
const BLOCK: RxGroupDef = { id: 'g-block', codes: ['MM110'] }
const PT: RxGroupDef = { id: 'g-pt', codes: ['MM301'] }
const SETTINGS: LedgerSettings = { kinds: DEFAULT_RSV_KINDS, blockDef: BLOCK, ptDef: PT }

const REPLY: SunapReply = {
  v: 1,
  day: DAY,
  unsure: false,
  rows: [
    ['10231', '가상환자01', '09:02', 're', 0, 15000, 0, 0, ['MM110', 'MM301'], ['202611191030', '주사 오전']],
    ['10232', '가상환자02', '09:15', 'new', 5000, 0, 0, 0, ['MM301'], null],
    ['10233', '가상환자03', '10:40', 'd90', 0, 0, 0, 0, [], ['202611201400', '']],
  ],
  paid: [
    ['20788', '가상환자04', '11:20', 10000, 0],
    ['20789', '가상환자05', '', 0, 15000],
  ],
}
// 도우미 0.9.0(v2) 답(spec sunap-doctors): 줄 끝 칸이 진료의 코드, 맨 위 doctors가 [코드, 이름|null]. 원장님 이름도 지어낸 가짜
const REPLY2: SunapReply = {
  v: 2,
  day: DAY,
  unsure: false,
  rows: [
    [...REPLY.rows[0], 'D01'],
    [...REPLY.rows[1], 'D02'],
    [...REPLY.rows[2], 'D01'],
  ],
  paid: REPLY.paid,
  doctors: [
    ['D01', '가상원장가'],
    ['D02', null],
  ],
}
const NAMES = /가상환자/
const CHARTS = /1023[123]|2078[89]/
// 다른 날의 PC 저장(그대로 다시 보내야 한다)
const OTHER: SunapLocalDay = { edits: { '30001': { note: '다른 날' } }, closedAt: '2026-11-15T09:30:00.000Z', late: false, fixed: { '30001': 'none' } }

const kst = (text: string) => new Date(`${text}+09:00`).getTime()
// v1 답의 장부 보기: 원장님별 수(doctors)는 null(spec sunap-doctors AC-5003.1·5003.2)
const viewOf = (ledger: Ledger) => ({ type: 'ledger', ...ledger, totals: dayTotals(ledger), doctors: null })

type Sent = { type: string; ticket: number | string; cmd: string; payload: string }
type Saved = { month: string; sunap: SunapLocalMonth }

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
// SHA-256은 스레드에서 돌아 틱만으로 재지 못하므로, 틱으로 안 오면 쉬며 기다린다
async function until(ready: () => boolean, label: string) {
  for (let i = 0; i < 2000; i++) {
    if (ready()) return
    await tick()
  }
  for (let i = 0; i < 200; i++) {
    if (ready()) return
    await sleep(25)
  }
  throw new Error(`기다린 일이 오지 않음: ${label}`)
}
const settle = async () => {
  for (let i = 0; i < 30; i++) await tick()
}

const monthFile = (sunap: unknown) => ({ months: { [MONTH]: { drafts: {}, done: {}, journal: {}, sunap } } })

function harness() {
  const posted: SunapWorkerMessage[] = []
  const sent: Sent[] = []
  const handler = createHandler({ post: (message) => posted.push(message as SunapWorkerMessage) })
  handler.setPort({ postMessage: (message) => sent.push(message as Sent) })
  let nextId = 0
  const newId = () => `req-${++nextId}`

  const all = <T extends SunapWorkerMessage['type']>(type: T) =>
    posted.filter((message): message is Extract<SunapWorkerMessage, { type: T }> => message.type === type)
  const last = <T extends SunapWorkerMessage['type']>(type: T) => {
    const list = all(type)
    if (!list.length) throw new Error(`메시지 없음: ${type}`)
    return list[list.length - 1]
  }

  // 통로 포트로 답 하나(chunk … end)
  function deliver(id: string, value: unknown, chunks = 3, options: { sha?: string; skipSeq?: boolean } = {}) {
    const text = JSON.stringify(value)
    const step = Math.max(1, Math.ceil(text.length / chunks))
    let seq = 0
    for (let at = 0; at < text.length; at += step) {
      if (options.skipSeq && seq === 1) seq++
      handler.onPort({ type: 'chunk', id, seq: seq++, data: text.slice(at, at + step) })
    }
    handler.onPort({
      type: 'end',
      id,
      count: seq,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: options.sha ?? createHash('sha256').update(text, 'utf8').digest('hex'),
    })
  }

  const loadMessage = (targets: SunapStreamRef, store: SunapStreamRef, extra: Record<string, unknown> = {}) => ({
    type: 'load',
    day: DAY,
    kinds: DEFAULT_RSV_KINDS,
    blockDef: BLOCK,
    ptDef: PT,
    targets,
    store,
    ...extra,
  })

  // 화면 흐름: 두 스트림이 끝난 뒤 그 id를 load에 실어 보낸다. 답 하나(ledger 또는 error)를 기다린다
  async function load(options: { reply?: unknown; month?: unknown; store?: unknown; extra?: Record<string, unknown> } = {}) {
    const targets = newId()
    const store = newId()
    deliver(targets, options.reply ?? REPLY)
    deliver(store, options.store ?? monthFile(options.month ?? {}))
    const before = posted.length
    handler.onScreen(loadMessage({ id: targets }, { id: store }, options.extra))
    await until(() => posted.length > before, 'load 답')
    return posted[posted.length - 1]
  }

  // 지금 나간 store.save에 통로가 답한다
  async function ack(ok = true, code?: string) {
    const out = sent[sent.length - 1]
    handler.onPort({ type: 'sent', ticket: out.ticket, ok, ...(code ? { code } : {}) })
    await settle()
  }

  async function screen(message: unknown) {
    handler.onScreen(message)
    await settle()
  }

  const saved = (index = sent.length - 1): Saved => JSON.parse(sent[index].payload) as Saved

  return { handler, posted, sent, all, last, deliver, newId, loadMessage, load, ack, screen, saved }
}

afterEach(() => {
  vi.useRealTimers()
})

// ── AC-4904.1 load ─────────────────────────────────────────────

describe('AC-4904.1 load: 비트 하루 답 + 그 달 PC 저장 → 장부 보기', () => {
  it('AC-4904.1 조각으로 온 contact.targets(sunap)와 store.load의 그 달 sunap으로 buildLedger 장부 보기를 돌려준다', async () => {
    const h = harness()
    const local: SunapLocalDay = { edits: { '10231': { card: 12000, note: '카드 나눔' } } }
    const out = await h.load({ month: { [DAY]: local, [OTHER_DAY]: OTHER } })
    const ledger = buildLedger(REPLY, local, SETTINGS)
    expect(out).toEqual(viewOf(ledger))
    const view = h.last('ledger')
    expect(view.day).toBe(DAY)
    expect(view.rows.map((row) => [row.chart, row.card, row.block, row.pt, row.rsv.kind, row.edited])).toEqual([
      ['10231', 12000, true, true, 'inj', ['card']],
      ['10232', 0, false, true, 'none', []],
      ['10233', 0, false, false, 'unknown', []],
    ])
    expect(view.rows[0].note).toBe('카드 나눔')
    expect(view.paid).toEqual([
      { chart: '20788', name: '가상환자04', time: '11:20', cash: 10000, card: 0 },
      { chart: '20789', name: '가상환자05', time: '', cash: 0, card: 15000 },
    ])
    expect(view.closedAt).toBeNull()
    expect(view.late).toBe(false)
    // 불러오기는 저장하지 않는다
    expect(h.sent).toEqual([])
  })

  it('AC-4904.1 그 달 sunap이 {}(저장 없음)이면 고친 칸 없는 장부다', async () => {
    const h = harness()
    const out = await h.load({ month: {} })
    const ledger = buildLedger(REPLY, {}, SETTINGS)
    expect(out).toEqual(viewOf(ledger))
  })

  it('AC-4904.1 묶음을 안 골랐으면(null) Block·물리치료는 모두 거짓이다', async () => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.deliver(targets, REPLY)
    h.deliver(store, monthFile({}))
    h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }, { blockDef: null, ptDef: null }))
    await until(() => h.all('ledger').length > 0, 'ledger')
    expect(h.last('ledger').rows.every((row) => !row.block && !row.pt)).toBe(true)
  })

  it('AC-4904.1 화면 load가 조각보다 먼저 와도 조각을 기다려 답한다', async () => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }))
    await settle()
    expect(h.posted).toEqual([])
    h.deliver(targets, REPLY, 5)
    h.deliver(store, monthFile({}), 1)
    await until(() => h.posted.length > 0, 'ledger')
    expect(h.last('ledger').rows).toHaveLength(3)
  })

  const row = (patch: Record<number, unknown>) => {
    const line: unknown[] = [...REPLY.rows[0]]
    for (const [at, value] of Object.entries(patch)) line[Number(at)] = value
    return line
  }
  it.each([
    ['배열이 아님', []],
    ['v가 2', { ...REPLY, v: 2 }],
    ['다른 날 답', { ...REPLY, day: '2026-11-15' }],
    ['unsure 없음', { v: 1, day: DAY, rows: REPLY.rows, paid: REPLY.paid }],
    ['rows가 배열 아님', { ...REPLY, rows: {} }],
    ['줄 칸 9개', { ...REPLY, rows: [REPLY.rows[0].slice(0, 9)] }],
    ['차트번호 빈 글', { ...REPLY, rows: [row({ 0: '' })] }],
    ['같은 차트 두 줄', { ...REPLY, rows: [REPLY.rows[0], REPLY.rows[0]] }],
    ['이름이 숫자', { ...REPLY, rows: [row({ 1: 7 })] }],
    ['시각 모양', { ...REPLY, rows: [row({ 2: '9:02' })] }],
    ['구분 x', { ...REPLY, rows: [row({ 3: 'x' })] }],
    ['음수 금액', { ...REPLY, rows: [row({ 4: -1 })] }],
    ['소수 금액', { ...REPLY, rows: [row({ 5: 1.5 })] }],
    ['금액 글자', { ...REPLY, rows: [row({ 6: '0' })] }],
    ['처방코드 숫자', { ...REPLY, rows: [row({ 8: [110] })] }],
    ['예약 시각 모양', { ...REPLY, rows: [row({ 9: ['2026-11-19', '주사'] })] }],
    ['예약 칸 하나', { ...REPLY, rows: [row({ 9: ['202611191030'] })] }],
    ['paid 칸 4개', { ...REPLY, paid: [['20788', '가상환자04', '11:20', 10000]] }],
    ['paid 시각 모양', { ...REPLY, paid: [['20788', '가상환자04', 'abc', 10000, 0]] }],
    ['paid 음수', { ...REPLY, paid: [['20788', '가상환자04', '11:20', 0, -5]] }],
  ])('AC-4904.1 비트 답 모양이 틀리면(%s) 장부 없이 E-BRIDGE-BAD-REPLY', async (_label, reply) => {
    const h = harness()
    const out = await h.load({ reply })
    expect(out).toEqual({ type: 'error', op: 'load', code: 'E-BRIDGE-BAD-REPLY' })
    expect(h.all('ledger')).toEqual([])
  })

  it('AC-4904.1 조각 번호가 건너뛰거나 sha256이 다르면 E-BRIDGE-BAD-REPLY(반쪽 자료를 쓰지 않는다)', async () => {
    for (const options of [{ skipSeq: true }, { sha: '0'.repeat(64) }]) {
      const h = harness()
      const targets = h.newId()
      const store = h.newId()
      h.deliver(targets, REPLY, 3, options)
      h.deliver(store, monthFile({}))
      h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }))
      await until(() => h.posted.length > 0, 'error')
      expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BRIDGE-BAD-REPLY' }])
    }
  })

  it.each([
    ['months 없음', {}],
    ['그 달 없음', { months: {} }],
    ['sunap 없음(옛 도우미)', { months: { [MONTH]: { drafts: {}, done: {}, journal: {} } } }],
    ['sunap이 배열', monthFile([])],
    ['그 날이 글자', monthFile({ [DAY]: 'x' })],
    ['모르는 칸', monthFile({ [DAY]: { extra: 1 } })],
    ['고친 금액 음수', monthFile({ [DAY]: { edits: { '10231': { cash: -1 } } } })],
    ['고친 예약 unknown', monthFile({ [DAY]: { edits: { '10231': { rsv: 'unknown' } } } })],
    ['고친 칸 모르는 이름', monthFile({ [DAY]: { edits: { '10231': { name: '가상환자01' } } } })],
    ['fixed 종류 x', monthFile({ [DAY]: { fixed: { '10231': 'x' } } })],
    ['closedAt 숫자', monthFile({ [DAY]: { closedAt: 5 } })],
    ['late 글자', monthFile({ [DAY]: { late: 'yes' } })],
  ])('AC-4904.1 PC 저장 모양이 틀리면(%s) E-STORE-BROKEN이고 그 뒤 저장하지 않는다', async (_label, store) => {
    const h = harness()
    const out = await h.load({ store })
    expect(out).toEqual({ type: 'error', op: 'load', code: 'E-STORE-BROKEN' })
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-BRIDGE-REJECTED' })
    expect(h.sent).toEqual([])
  })

  it.each([
    ['날 모양', { day: '2026-11-31' }],
    ['종류 목록 없음', { kinds: undefined }],
    ['종류 목록이 옛 말 모양', { kinds: DEFAULT_RSV_WORDS }],
    ['묶음 모양', { blockDef: { id: 'g', codes: 'MM110' } }],
    ['스트림 표 없음', { targets: undefined }],
  ])('AC-4904.1 화면 load 모양이 틀리면(%s) E-BRIDGE-REJECTED', async (_label, extra) => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.deliver(targets, REPLY)
    h.deliver(store, monthFile({}))
    await h.screen(h.loadMessage({ id: targets }, { id: store }, extra))
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BRIDGE-REJECTED' }])
  })

  it('AC-4904.1 새 load가 앞서면 앞 load의 늦은 답은 쓰지 않는다', async () => {
    const h = harness()
    const oldTargets = h.newId()
    const oldStore = h.newId()
    h.handler.onScreen(h.loadMessage({ id: oldTargets }, { id: oldStore }))
    await settle()
    const fresh = { ...REPLY, rows: [REPLY.rows[1]] }
    await h.load({ reply: fresh })
    h.deliver(oldTargets, REPLY)
    h.deliver(oldStore, monthFile({}))
    await sleep(100)
    await settle()
    expect(h.all('ledger')).toHaveLength(1)
    expect(h.last('ledger').rows.map((r) => r.chart)).toEqual(['10232'])
  })
})

// ── AC-4904.2 edit ─────────────────────────────────────────────

describe('AC-4904.2 edit: 그 날 고친 칸 저장 → 새 장부 보기', () => {
  it('AC-4904.2 그 달 sunap 전체를 store.save {month, sunap}로 포트에 보내고, 저장 답이 온 뒤 새 장부 보기를 돌려준다', async () => {
    const h = harness()
    await h.load({ month: { [OTHER_DAY]: OTHER } })
    const ledgers = h.all('ledger').length
    await h.screen({ type: 'edit', chart: '10232', patch: { cash: 7000 } })
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ type: 'send', cmd: 'store.save' })
    expect(typeof h.sent[0].payload).toBe('string')
    const payload = h.saved()
    expect(Object.keys(payload).sort()).toEqual(['month', 'sunap'])
    expect(payload).toEqual({ month: MONTH, sunap: { [OTHER_DAY]: OTHER, [DAY]: { edits: { '10232': { cash: 7000 } } } } })
    // 저장 답 전에는 새 장부를 보내지 않는다
    expect(h.all('ledger')).toHaveLength(ledgers)
    await h.ack()
    const view = h.last('ledger')
    expect(h.all('ledger')).toHaveLength(ledgers + 1)
    const local: SunapLocalDay = { edits: { '10232': { cash: 7000 } } }
    const ledger = buildLedger(REPLY, local, SETTINGS)
    expect(view).toEqual(viewOf(ledger))
    expect(view.rows[1]).toMatchObject({ cash: 7000, edited: ['cash'] })
  })

  it('AC-4904.2 비트 값과 같아진 칸은 고친 칸에서 지우고, 다 지워지면 그 날 열쇠도 없다', async () => {
    const h = harness()
    await h.load({ month: { [DAY]: { edits: { '10231': { card: 12000, block: false } } }, [OTHER_DAY]: OTHER } })
    await h.screen({ type: 'edit', chart: '10231', patch: { card: 15000 } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10231': { block: false } } })
    await h.ack()
    expect(h.last('ledger').rows[0]).toMatchObject({ card: 15000, block: false, edited: ['block'] })
    await h.screen({ type: 'edit', chart: '10231', patch: { block: true } })
    expect(h.saved().sunap).toEqual({ [OTHER_DAY]: OTHER })
    await h.ack()
    expect(h.last('ledger').rows[0]).toMatchObject({ block: true, edited: [] })
  })

  it('AC-4904.2 {revert: 칸}은 그 칸만 지우고, 빈 비고는 비고를 지운다', async () => {
    const h = harness()
    await h.load({ month: { [DAY]: { edits: { '10233': { rsv: 'inj', note: '전화 예약', cash: 3000 } } } } })
    await h.screen({ type: 'edit', chart: '10233', patch: { revert: 'rsv' } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10233': { note: '전화 예약', cash: 3000 } } })
    await h.ack()
    expect(h.last('ledger').rows[2].rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611201400' })
    await h.screen({ type: 'edit', chart: '10233', patch: { note: '  ' } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10233': { cash: 3000 } } })
    await h.ack()
    await h.screen({ type: 'edit', chart: '10233', patch: { rsv: 'none', note: '안 하고 가심' } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10233': { cash: 3000, rsv: 'none', note: '안 하고 가심' } } })
    await h.ack()
    expect(h.last('ledger').rows[2]).toMatchObject({ note: '안 하고 가심', rsv: { kind: 'none', source: 'hand', at: null } })
  })

  it.each([
    ['장부에 없는 차트', { chart: '99999', patch: { cash: 1000 } }],
    ['차트 없음', { patch: { cash: 1000 } }],
    ['음수 금액', { chart: '10231', patch: { cash: -1 } }],
    ['소수 금액', { chart: '10231', patch: { card: 1.5 } }],
    ['99,999,999 넘음', { chart: '10231', patch: { transfer: 100_000_000 } }],
    ['금액 글자', { chart: '10231', patch: { unpaid: '1000' } }],
    ['Block 글자', { chart: '10231', patch: { block: 'y' } }],
    ['직접 고른 unknown', { chart: '10231', patch: { rsv: 'unknown' } }],
    ['비고 101자', { chart: '10231', patch: { note: 'ㄱ'.repeat(101) } }],
    ['모르는 칸', { chart: '10231', patch: { name: '가상환자09' } }],
    ['빈 patch', { chart: '10231', patch: {} }],
    ['patch 없음', { chart: '10231' }],
    ['모르는 칸 되돌리기', { chart: '10231', patch: { revert: 'name' } }],
    ['되돌리기와 값 함께', { chart: '10231', patch: { revert: 'cash', card: 1000 } }],
  ])('AC-4904.2 받을 수 없는 edit(%s)은 저장하지 않고 E-BRIDGE-REJECTED', async (_label, message) => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'edit', ...message })
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-BRIDGE-REJECTED' })
    expect(h.sent).toEqual([])
  })

  it('AC-4904.2 불러오기 전 edit은 E-BRIDGE-REJECTED이고 저장하지 않는다', async () => {
    const h = harness()
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    expect(h.posted).toEqual([{ type: 'error', op: 'edit', code: 'E-BRIDGE-REJECTED' }])
    expect(h.sent).toEqual([])
  })

  it('AC-4904.2 저장이 실패하면 그 번호를 보내고 고친 칸은 그 전 그대로다', async () => {
    const h = harness()
    await h.load()
    const ledgers = h.all('ledger').length
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    await h.ack(false, 'E-STORE-FAILED')
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-STORE-FAILED' })
    expect(h.all('ledger')).toHaveLength(ledgers)
    await h.screen({ type: 'edit', chart: '10232', patch: { card: 2000 } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10232': { card: 2000 } } })
  })

  it('AC-4904.2 저장은 한 번에 하나: 앞 저장의 답이 온 뒤 그 결과 위에 다음 저장을 보낸다', async () => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    await h.screen({ type: 'edit', chart: '10232', patch: { pt: false } })
    expect(h.sent).toHaveLength(1)
    await h.ack()
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1].ticket).not.toBe(h.sent[0].ticket)
    expect(h.saved(1).sunap[DAY]).toEqual({ edits: { '10231': { cash: 1000 }, '10232': { pt: false } } })
    await h.ack()
    expect(h.last('ledger').rows.map((r) => [r.cash, r.pt])).toEqual([
      [1000, true],
      [5000, false],
      [0, false],
    ])
  })

  it('AC-4904.2 다른 표(ticket)의 저장 답은 듣지 않는다', async () => {
    const h = harness()
    await h.load()
    const ledgers = h.all('ledger').length
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    h.handler.onPort({ type: 'sent', ticket: 'other', ok: true })
    await settle()
    expect(h.all('ledger')).toHaveLength(ledgers)
    await h.ack()
    expect(h.all('ledger')).toHaveLength(ledgers + 1)
  })

  it('AC-4904.2 저장 답을 기다리는 사이 새 포트를 받으면 E-BRIDGE-DISCONNECTED', async () => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    const next: Sent[] = []
    h.handler.setPort({ postMessage: (message) => next.push(message as Sent) })
    await settle()
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-BRIDGE-DISCONNECTED' })
    // 줄은 멈추지 않는다: 다음 저장은 새 포트로 나간다
    await h.screen({ type: 'edit', chart: '10232', patch: { cash: 1 } })
    expect(next).toHaveLength(1)
    expect((JSON.parse(next[0].payload) as Saved).sunap[DAY]).toEqual({ edits: { '10232': { cash: 1 } } })
  })
})

// ── AC-4904.3 close · reopen ───────────────────────────────────

describe('AC-4904.3 close·reopen: closeLocal·reopenLocal 저장', () => {
  it('AC-4904.3 close는 closeLocal을 저장하고, 저장 답이 온 뒤 장부 보기와 closed {totals, late}를 돌려준다', async () => {
    const h = harness()
    await h.load({ month: { [DAY]: { edits: { '10232': { rsv: 'visit' } } }, [OTHER_DAY]: OTHER } })
    const now = kst('2026-11-16T18:30:00')
    await h.screen({ type: 'close', now })
    const payload = h.saved()
    expect(payload.month).toBe(MONTH)
    expect(payload.sunap[OTHER_DAY]).toEqual(OTHER)
    const local: SunapLocalDay = {
      edits: { '10232': { rsv: 'visit' } },
      fixed: { '10231': 'inj', '10233': 'unknown' },
      late: false,
      closedAt: new Date(now).toISOString(),
    }
    expect(payload.sunap[DAY]).toEqual(local)
    expect(h.all('closed')).toEqual([])
    await h.ack()
    const ledger = buildLedger(REPLY, local, SETTINGS)
    const totals = dayTotals(ledger)
    expect(h.last('ledger')).toEqual(viewOf(ledger))
    expect(h.last('ledger').closedAt).toBe(new Date(now).toISOString())
    expect(h.last('closed')).toEqual({ type: 'closed', day: DAY, totals, late: false })
    expect(totals).toMatchObject({
      visits: 3,
      first_n: 1,
      d90_n: 1,
      ret_n: 1,
      rsv_first: 1,
      rsv_d90: 0,
      block_n: 1,
      ret_block: 1,
      pt_n: 2,
      cash_n: 1,
      cash_won: 5000,
      card_n: 1,
      card_won: 15000,
      free_n: 1,
      paid_cash_n: 1,
      paid_cash_won: 10000,
      paid_card_n: 1,
      paid_card_won: 15000,
    })
  })

  it('AC-4904.3 한국 날짜로 다음 날 처음 마감하면 late가 참이다', async () => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'close', now: kst('2026-11-17T09:00:00') })
    expect(h.saved().sunap[DAY]).toMatchObject({ late: true })
    await h.ack()
    expect(h.last('closed')).toMatchObject({ late: true })
    expect(h.last('ledger').late).toBe(true)
  })

  it('AC-4904.3 reopen은 closedAt만 지워 저장하고 fixed·late는 남긴다. 마감한 날의 edit은 받지 않는다', async () => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'close', now: kst('2026-11-17T09:00:00') })
    await h.ack()
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-BRIDGE-REJECTED' })
    expect(h.sent).toHaveLength(1)
    await h.screen({ type: 'reopen' })
    expect(h.sent).toHaveLength(2)
    expect(h.saved().sunap[DAY]).toEqual({ fixed: { '10231': 'inj', '10232': 'none', '10233': 'unknown' }, late: true })
    await h.ack()
    expect(h.last('ledger')).toMatchObject({ closedAt: null, late: true })
    // 풀면 다시 고칠 수 있다
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1000 } })
    expect(h.sent).toHaveLength(3)
  })

  it('AC-4904.3 다시 마감하면 처음 마감 때의 fixed·late를 그대로 두고 마감 시각만 새로 적는다', async () => {
    const h = harness()
    await h.load({ month: { [DAY]: { fixed: { '10231': 'visit', '10232': 'none', '10233': 'unknown' }, late: true } } })
    expect(h.last('ledger').rows[0].rsv.kind).toBe('visit')
    const now = kst('2026-11-18T10:00:00')
    await h.screen({ type: 'close', now })
    expect(h.saved().sunap[DAY]).toEqual({
      fixed: { '10231': 'visit', '10232': 'none', '10233': 'unknown' },
      late: true,
      closedAt: new Date(now).toISOString(),
    })
    await h.ack()
    expect(h.last('closed')).toMatchObject({ late: true, totals: { rsv_first: 0 } })
  })

  it('AC-4904.3 close 저장이 실패하면 closed를 보내지 않고 오류 번호만 보낸다', async () => {
    const h = harness()
    await h.load()
    await h.screen({ type: 'close', now: kst('2026-11-16T18:30:00') })
    await h.ack(false, 'E-STORE-FAILED')
    expect(h.all('closed')).toEqual([])
    expect(h.last('error')).toEqual({ type: 'error', op: 'close', code: 'E-STORE-FAILED' })
    expect(h.last('ledger').closedAt).toBeNull()
  })

  it('AC-4904.3 now가 숫자가 아니거나, 불러오기 전 close·reopen은 E-BRIDGE-REJECTED', async () => {
    const h = harness()
    await h.screen({ type: 'close', now: kst('2026-11-16T18:30:00') })
    await h.screen({ type: 'reopen' })
    expect(h.posted).toEqual([
      { type: 'error', op: 'close', code: 'E-BRIDGE-REJECTED' },
      { type: 'error', op: 'reopen', code: 'E-BRIDGE-REJECTED' },
    ])
    await h.load()
    await h.screen({ type: 'close', now: '2026-11-16' })
    await h.screen({ type: 'close' })
    expect(h.all('error').slice(-2)).toEqual([
      { type: 'error', op: 'close', code: 'E-BRIDGE-REJECTED' },
      { type: 'error', op: 'close', code: 'E-BRIDGE-REJECTED' },
    ])
    expect(h.sent).toEqual([])
  })
})

// ── AC-4904.4 오류 번호만 · 환자 줄은 장부 보기에만 ─────────────────

describe('AC-4904.4 오류는 번호만, 환자 줄은 장부 보기에만', () => {
  it('AC-4904.4 도우미 오류(abort)는 그 번호만 화면에 보낸다', async () => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.handler.onPort({ type: 'abort', id: targets, code: 'E-BIT-READ-FAILED' })
    h.deliver(store, monthFile({}))
    h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }))
    await until(() => h.posted.length > 0, 'error')
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BIT-READ-FAILED' }])
  })

  it('AC-4904.4 store.load 오류도 그 번호만 보낸다', async () => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.deliver(targets, REPLY)
    h.handler.onPort({ type: 'abort', id: store, code: 'E-STORE-FAILED' })
    h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }))
    await until(() => h.posted.length > 0, 'error')
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-STORE-FAILED' }])
  })

  it('AC-4904.4 화면이 스트림 거절 번호를 실어 보내면 그 번호(다른 스트림 답은 버린다)', async () => {
    const h = harness()
    const store = h.newId()
    h.deliver(store, monthFile({}))
    await h.screen(h.loadMessage({ code: 'E-HELPER-OLD' }, { id: store }))
    await until(() => h.posted.length > 0, 'error')
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-HELPER-OLD' }])
  })

  it('AC-4904.4 번호 모양이 아닌 오류 글(환자 값이 섞일 수 있음)은 버리고 E-BRIDGE-BAD-REPLY', async () => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.handler.onPort({ type: 'abort', id: targets, code: '가상환자01 10231 읽기 실패' })
    h.deliver(store, monthFile({}))
    h.handler.onScreen(h.loadMessage({ id: targets }, { id: store }))
    await until(() => h.posted.length > 0, 'error')
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BRIDGE-BAD-REPLY' }])
    await h.load()
    await h.screen({ type: 'edit', chart: '10231', patch: { cash: 1 } })
    await h.ack(false, '가상환자01 저장 실패')
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-STORE-FAILED' })
  })

  it('AC-4904.4 조각이 60초 안에 끝나지 않으면 E-BRIDGE-BAD-REPLY', async () => {
    vi.useFakeTimers()
    const h = harness()
    h.handler.onScreen(h.loadMessage({ id: 'req-slow-1' }, { id: 'req-slow-2' }))
    await vi.advanceTimersByTimeAsync(59_000)
    expect(h.posted).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BRIDGE-BAD-REPLY' }])
  })

  it('AC-4904.4 화면으로는 ledger·closed·error만 가고, 환자 이름·차트는 장부 보기에만 있다. store.save 글자는 포트로만 나간다', async () => {
    const h = harness()
    await h.load({ reply: { ...REPLY, rows: [...REPLY.rows, ['10234', '가상환자06', '12:00', 're', 0, 0, 0, 0, [], null]] } })
    await h.screen({ type: 'edit', chart: '10231', patch: { note: '가상환자01 보호자' } })
    await h.ack()
    await h.screen({ type: 'edit', chart: '99999', patch: { cash: 1 } })
    await h.screen({ type: 'close', now: kst('2026-11-16T18:30:00') })
    await h.ack()
    await h.screen({ type: 'reopen' })
    await h.ack(false, 'E-STORE-FAILED')
    expect(new Set(h.posted.map((m) => m.type))).toEqual(new Set(['ledger', 'closed', 'error']))
    for (const message of h.posted) {
      if (message.type === 'ledger') continue
      const text = JSON.stringify(message)
      expect(text).not.toMatch(NAMES)
      expect(text).not.toMatch(CHARTS)
      expect(text).not.toContain('payload')
    }
    // closed에는 날·숫자 24칸·late만
    const closed = h.last('closed')
    expect(Object.keys(closed).sort()).toEqual(['day', 'late', 'totals', 'type'])
    expect(Object.values(closed.totals).every((value) => Number.isInteger(value))).toBe(true)
    // 포트로는 store.save만
    expect(h.sent.every((m) => m.type === 'send' && m.cmd === 'store.save' && typeof m.payload === 'string')).toBe(true)
    expect(h.sent).toHaveLength(3)
  })

  it('AC-4904.4 모양이 틀린 메시지 하나로 Worker가 멈추지 않는다', async () => {
    const h = harness()
    expect(() => {
      h.handler.onScreen(null)
      h.handler.onScreen('load')
      h.handler.onScreen({ type: 'nope' })
      h.handler.onPort(null)
      h.handler.onPort({ type: 'chunk', id: 'x', seq: 'a', data: 1 })
      h.handler.onPort({ type: 'end', id: 'x' })
      h.handler.onPort({ type: 'sent' })
    }).not.toThrow()
    await settle()
    expect(h.posted).toEqual([])
    const out = await h.load()
    expect(out.type).toBe('ledger')
  })
})

// ── spec sunap-kinds AC-5502.4 종류 목록 · 종류 id 모양 ─────────────────

describe('AC-5502.4 load의 종류 목록(kinds)·직접 고른 값·고정값 모양', () => {
  // 기본 셋(DEFAULT_RSV_KINDS와 같은 값)
  const BASE: RsvKindDef[] = [
    { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
    { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
    { id: 'etc', label: '기타', counts: false, words: ['기타'] },
  ]
  const DOSU: RsvKindDef = { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] }
  const KINDS2: RsvKindDef[] = [BASE[0], BASE[1], DOSU, BASE[2]]
  const SETTINGS2: LedgerSettings = { ...SETTINGS, kinds: KINDS2 }
  // 10233(90일초진)의 예약 메모가 도수
  const DOSU_REPLY: SunapReply = {
    ...REPLY,
    rows: [REPLY.rows[0], REPLY.rows[1], ['10233', '가상환자03', '10:40', 'd90', 0, 0, 0, 0, [], ['202611201400', '도수 오후']]],
  } as SunapReply
  const withKinds = { extra: { kinds: KINDS2 } }

  it('AC-5502.4: load가 실은 kinds로 장부를 만들고 마감 숫자도 그 목록의 counts로 센다', async () => {
    const h = harness()
    const out = await h.load({ reply: DOSU_REPLY, ...withKinds })
    const ledger = buildLedger(DOSU_REPLY, {}, SETTINGS2)
    expect(out).toEqual({ ...viewOf(ledger), totals: dayTotals(ledger, KINDS2) })
    expect(h.last('ledger').rows[2].rsv).toEqual({ kind: 'kdosu01', source: 'bit', at: '202611201400' })
    expect(h.last('ledger').totals.rsv_d90).toBe(1)
  })

  it('AC-5502.4: 마감(closed) 숫자도 load가 실은 kinds의 counts로 센다', async () => {
    const h = harness()
    await h.load({ reply: DOSU_REPLY, ...withKinds })
    await h.screen({ type: 'close', now: kst('2026-11-16T18:30:00') })
    expect(h.saved().sunap[DAY]).toMatchObject({ fixed: { '10231': 'inj', '10232': 'none', '10233': 'kdosu01' } })
    await h.ack()
    expect(h.last('closed').totals).toMatchObject({ rsv_first: 0, rsv_d90: 1 })
  })

  it('AC-5502.4: 기본 목록이면 도수 메모는 종류 모름이고 예약 수에 들지 않는다', async () => {
    const h = harness()
    await h.load({ reply: DOSU_REPLY })
    expect(h.last('ledger').rows[2].rsv.kind).toBe('unknown')
    expect(h.last('ledger').totals.rsv_d90).toBe(0)
  })

  it.each<[string, unknown]>([
    ['kinds 대신 옛 words', undefined],
    ['종류 2개', BASE.slice(0, 2)],
    ['etc 없음', [BASE[0], BASE[1], DOSU]],
    ['새 종류 id 5자', [...BASE, { ...DOSU, id: 'kdosu' }]],
    ['이름이 종류 모름', [...BASE, { ...DOSU, label: '종류 모름' }]],
    ['같은 이름', [...BASE, { ...DOSU, label: '기타' }]],
    ['counts 글자', [...BASE, { ...DOSU, counts: 'true' }]],
    ['말 21자', [...BASE, { ...DOSU, words: ['ㄱ'.repeat(21)] }]],
    ['","로 이은 말 41자', [...BASE, { ...DOSU, words: ['ㄱ'.repeat(20), 'ㄴ'.repeat(20)] }]],
    ['종류 11개', [...BASE, ...Array.from({ length: 8 }, (_, i) => ({ ...DOSU, id: `kdosu0${i}`, label: `도수 ${i}` }))]],
  ])('AC-5502.4: load의 kinds가 틀리면(%s) E-BRIDGE-REJECTED', async (label, kinds) => {
    const h = harness()
    const targets = h.newId()
    const store = h.newId()
    h.deliver(targets, REPLY)
    h.deliver(store, monthFile({}))
    const extra = label === 'kinds 대신 옛 words' ? { kinds: undefined, words: DEFAULT_RSV_WORDS } : { kinds }
    await h.screen(h.loadMessage({ id: targets }, { id: store }, extra))
    expect(h.posted).toEqual([{ type: 'error', op: 'load', code: 'E-BRIDGE-REJECTED' }])
  })

  it('AC-5502.4: PC 저장의 직접 고른 값은 종류 id 모양이면 받는다 — 목록에 있으면 직접, 없으면(지운 종류) 비트 따라가기', async () => {
    const month = { [DAY]: { edits: { '10231': { rsv: 'kdosu01' }, '10233': { rsv: 'kzz9x00' } } } }
    const h = harness()
    expect((await h.load({ month, ...withKinds })).type).toBe('ledger')
    expect(h.last('ledger').rows[0].rsv).toEqual({ kind: 'kdosu01', source: 'hand', at: '202611191030' })
    expect(h.last('ledger').rows[2].rsv).toEqual({ kind: 'unknown', source: 'bit', at: '202611201400' })
    const plain = harness()
    await plain.load({ month })
    expect(plain.last('ledger').rows[0].rsv).toEqual({ kind: 'inj', source: 'bit', at: '202611191030' })
  })

  it("AC-5502.4: PC 저장의 고정값은 'unknown'까지 받고, 목록에 없는 종류 id면 종류 모름이다", async () => {
    const h = harness()
    await h.load({ month: { [DAY]: { fixed: { '10231': 'kdosu01', '10232': 'unknown', '10233': 'etc' } } } })
    expect(h.last('ledger').rows.map((row) => row.rsv.kind)).toEqual(['unknown', 'unknown', 'etc'])
    const k = harness()
    await k.load({ month: { [DAY]: { fixed: { '10231': 'kdosu01' } } }, ...withKinds })
    expect(k.last('ledger').rows[0].rsv).toEqual({ kind: 'kdosu01', source: 'bit', at: '202611191030' })
  })

  it.each<[string, unknown]>([
    ['직접 고른 값 5자 id', { edits: { '10231': { rsv: 'k12345' } } }],
    ['직접 고른 값 대문자 id', { edits: { '10231': { rsv: 'kDOSU01' } } }],
    ['직접 고른 값 Inj', { edits: { '10231': { rsv: 'Inj' } } }],
    ['직접 고른 값 숫자', { edits: { '10231': { rsv: 1 } } }],
    ['고정값 7자 id', { fixed: { '10231': 'k1234567' } }],
    ['고정값 빈 글', { fixed: { '10231': '' } }],
    ['고정값 NONE', { fixed: { '10231': 'NONE' } }],
  ])('AC-5502.4: PC 저장의 예약 값이 종류 id 모양이 아니면(%s) E-STORE-BROKEN', async (_label, day) => {
    const h = harness()
    const out = await h.load({ month: { [DAY]: day }, ...withKinds })
    expect(out).toEqual({ type: 'error', op: 'load', code: 'E-STORE-BROKEN' })
  })

  it('AC-5502.4: 화면이 보낸 고르기(edit rsv)는 종류 id 모양이면 저장하고 새 장부를 보낸다', async () => {
    const h = harness()
    await h.load(withKinds)
    await h.screen({ type: 'edit', chart: '10232', patch: { rsv: 'kdosu01' } })
    expect(h.saved().sunap[DAY]).toEqual({ edits: { '10232': { rsv: 'kdosu01' } } })
    await h.ack()
    expect(h.last('ledger').rows[1].rsv).toEqual({ kind: 'kdosu01', source: 'hand', at: null })
    expect(h.last('ledger').totals.rsv_first).toBe(1)
  })

  it.each<[string, unknown]>([
    ['unknown', 'unknown'],
    ['5자 id', 'k12345'],
    ['대문자 id', 'KDOSU01'],
    ['빈 글', ''],
    ['숫자', 3],
  ])('AC-5502.4: 화면이 보낸 고르기가 종류 id 모양이 아니면(%s) 저장하지 않고 E-BRIDGE-REJECTED', async (_label, rsv) => {
    const h = harness()
    await h.load(withKinds)
    await h.screen({ type: 'edit', chart: '10232', patch: { rsv } })
    expect(h.last('error')).toEqual({ type: 'error', op: 'edit', code: 'E-BRIDGE-REJECTED' })
    expect(h.sent).toEqual([])
  })
})

// ── spec sunap-doctors AC-5003.1 도우미 답 v1·v2 ───────────────────────

describe('AC-5003.1 도우미 답 v:1·v:2 → 장부 줄의 진료의', () => {
  // v2 줄 하나: v1 줄 열 칸 + 진료의 코드
  const line2 = (index: number, doctor: unknown, patch: Record<number, unknown> = {}) => {
    const line: unknown[] = [...REPLY.rows[index], doctor]
    for (const [at, value] of Object.entries(patch)) line[Number(at)] = value
    return line
  }

  it('AC-5003.1: v:1 답(옛 도우미)이면 줄마다 doctor는 null이고 원장님별 수(doctors)도 null이다', async () => {
    const h = harness()
    const out = await h.load()
    expect(out).toEqual(viewOf(buildLedger(REPLY, {}, SETTINGS)))
    expect(h.last('ledger').rows.map((row) => row.doctor)).toEqual([null, null, null])
    expect(h.last('ledger').doctors).toBeNull()
  })

  it('AC-5003.1: v:2 답이면 줄 끝 칸이 doctor이고 그 값으로 장부를 만든다', async () => {
    const h = harness()
    const local: SunapLocalDay = { edits: { '10232': { block: true } } }
    const out = await h.load({ reply: REPLY2, month: { [DAY]: local } })
    const ledger = buildLedger(REPLY2, local, SETTINGS)
    expect(out).toEqual({ type: 'ledger', ...ledger, totals: dayTotals(ledger), doctors: ledgerDoctors(ledger) })
    expect(h.last('ledger').rows.map((row) => [row.chart, row.doctor])).toEqual([
      ['10231', 'D01'],
      ['10232', 'D02'],
      ['10233', 'D01'],
    ])
  })

  it('AC-5003.1: v:2 줄의 진료의가 null(진료의 미지정)이어도 받고, 코드·이름 40자도 받는다', async () => {
    const h = harness()
    const long = 'D'.repeat(40)
    const reply = {
      ...REPLY2,
      rows: [line2(0, long), line2(1, 'D02'), line2(2, null)],
      doctors: [
        [long, '가'.repeat(40)],
        ['D02', null],
      ],
    }
    const out = await h.load({ reply })
    expect(out.type).toBe('ledger')
    expect(h.last('ledger').rows.map((row) => row.doctor)).toEqual([long, 'D02', null])
    expect(h.last('ledger').doctors?.rows.map((row) => row.label)).toEqual(expect.arrayContaining(['가'.repeat(40), 'D02', '진료의 미지정']))
  })

  it.each([
    ['v가 3', { ...REPLY2, v: 3 }],
    ['v:2인데 doctors 없음', { ...REPLY2, doctors: undefined }],
    ['doctors가 배열 아님', { ...REPLY2, doctors: { D01: '가상원장가' } }],
    ['v:2인데 줄 칸 10개', { ...REPLY2, rows: [REPLY.rows[0]] }],
    ['v:2 줄 칸 12개', { ...REPLY2, rows: [[...line2(0, 'D01'), 'D02']] }],
    ['줄 코드가 doctors에 없음', { ...REPLY2, rows: [line2(0, 'D09')] }],
    ['줄 코드 빈 글', { ...REPLY2, rows: [line2(0, '')], doctors: [['', null]] }],
    ['줄 코드 숫자', { ...REPLY2, rows: [line2(0, 1)] }],
    ['줄 코드 41자', { ...REPLY2, rows: [line2(0, 'D'.repeat(41))], doctors: [['D'.repeat(41), null]] }],
    ['doctors 줄이 한 칸', { ...REPLY2, doctors: [['D01'], ['D02', null]] }],
    ['doctors 줄이 세 칸', { ...REPLY2, doctors: [['D01', null, 'x'], ['D02', null]] }],
    ['doctors 코드 41자', { ...REPLY2, rows: [line2(0, 'D02')], doctors: [['D'.repeat(41), null], ['D02', null]] }],
    ['doctors 코드 숫자', { ...REPLY2, rows: [line2(0, 'D02')], doctors: [[1, null], ['D02', null]] }],
    ['doctors 이름 빈 글', { ...REPLY2, doctors: [['D01', ''], ['D02', null]] }],
    ['doctors 이름 41자', { ...REPLY2, doctors: [['D01', '가'.repeat(41)], ['D02', null]] }],
    ['doctors 이름 숫자', { ...REPLY2, doctors: [['D01', 7], ['D02', null]] }],
    ['doctors 같은 코드 두 번', { ...REPLY2, doctors: [['D01', '가상원장가'], ['D01', null], ['D02', null]] }],
    ['v:2 다른 칸 모양(구분 x)', { ...REPLY2, rows: [line2(0, 'D01', { 3: 'x' })] }],
  ])('AC-5003.1: v:2 답 모양이 틀리면(%s) 장부 없이 E-BRIDGE-BAD-REPLY', async (_label, reply) => {
    const h = harness()
    const out = await h.load({ reply })
    expect(out).toEqual({ type: 'error', op: 'load', code: 'E-BRIDGE-BAD-REPLY' })
    expect(h.all('ledger')).toEqual([])
  })
})

// ── spec sunap-doctors AC-5003.2 ledger 메시지의 doctors ────────────────

describe('AC-5003.2 ledger 메시지에 원장님별 수(ledgerDoctors)가 함께 간다', () => {
  // [이름, 내원, 초진, Block, 물리치료, 초진+Block]
  const counts = (h: ReturnType<typeof harness>) =>
    h.last('ledger').doctors?.rows.map((row) => [row.label, row.rates.visits, row.rates.first_n, row.rates.block_n, row.rates.pt_n, row.rates.first_block])

  it('AC-5003.2: 처음 불러올 때 원장님이 두 분이면 doctors = ledgerDoctors(장부)이고 합계는 장부 합계 아홉 칸과 같다', async () => {
    const h = harness()
    await h.load({ reply: REPLY2 })
    const view = h.last('ledger')
    expect(view.doctors).toEqual(ledgerDoctors(buildLedger(REPLY2, {}, SETTINGS)))
    expect(counts(h)).toEqual([
      ['가상원장가', 2, 0, 1, 1, 0],
      ['D02', 1, 1, 0, 1, 0],
    ])
    expect(view.totals).toMatchObject(view.doctors!.total)
  })

  it('AC-5003.2: 원장님이 한 분이면 doctors는 null이다', async () => {
    const h = harness()
    await h.load({ reply: { ...REPLY2, rows: REPLY2.rows.map((line) => [...line.slice(0, 10), 'D01']), doctors: [['D01', '가상원장가']] } })
    expect(h.last('ledger').rows.every((row) => row.doctor === 'D01')).toBe(true)
    expect(h.last('ledger').doctors).toBeNull()
  })

  it('AC-5003.2: Block·물리치료를 고치면 저장 답 뒤 ledger의 원장님별 수도 바뀐다', async () => {
    const h = harness()
    await h.load({ reply: REPLY2 })
    await h.screen({ type: 'edit', chart: '10232', patch: { block: true } })
    await h.ack()
    expect(counts(h)).toEqual([
      ['가상원장가', 2, 0, 1, 1, 0],
      ['D02', 1, 1, 1, 1, 1],
    ])
    await h.screen({ type: 'edit', chart: '10231', patch: { pt: false } })
    await h.ack()
    expect(counts(h)).toEqual([
      ['가상원장가', 2, 0, 1, 0, 0],
      ['D02', 1, 1, 1, 1, 1],
    ])
    const local: SunapLocalDay = { edits: { '10232': { block: true }, '10231': { pt: false } } }
    expect(h.last('ledger').doctors).toEqual(ledgerDoctors(buildLedger(REPLY2, local, SETTINGS)))
  })

  it('AC-5003.2: 마감·풀기 뒤 ledger에도 원장님별 수가 함께 간다', async () => {
    const h = harness()
    const local: SunapLocalDay = { edits: { '10233': { block: true } } }
    await h.load({ reply: REPLY2, month: { [DAY]: local } })
    const expected = ledgerDoctors(buildLedger(REPLY2, local, SETTINGS))
    expect(expected).not.toBeNull()
    const ledgers = h.all('ledger').length
    await h.screen({ type: 'close', now: kst('2026-11-16T18:30:00') })
    await h.ack()
    expect(h.all('ledger')).toHaveLength(ledgers + 1)
    expect(h.last('ledger').doctors).toEqual(expected)
    await h.screen({ type: 'reopen' })
    await h.ack()
    expect(h.all('ledger')).toHaveLength(ledgers + 2)
    expect(h.last('ledger').closedAt).toBeNull()
    expect(h.last('ledger').doctors).toEqual(expected)
  })
})
