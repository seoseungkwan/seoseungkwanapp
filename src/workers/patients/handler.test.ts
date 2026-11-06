import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PatientsWorkerMessage, RecallRecord } from '@/types/patients'
import type { StoreFile, TargetsFile, TargetsReply } from '../../../fixtures/patients/make-fake-patients'
import { RECALL_DEFAULTS } from '@/lib/patients/recall'
import { createHandler } from './handler'
import { MAX_STORE_BYTES, mergeRecall } from './jobs'

// 계산이 번호 없는 오류를 던지는 사례(원본의 TypeError 같은 것)를 짚으려고 켤 수 있게 감싼다. 평소에는 진짜 계산이다
const boom = vi.hoisted(() => ({ followup: false, recall: false }))
vi.mock('./jobs', async (importOriginal) => {
  const real = await importOriginal<typeof import('./jobs')>()
  return {
    ...real,
    buildFollowup: (...args: Parameters<typeof real.buildFollowup>) => {
      if (boom.followup) throw new TypeError('가상환자01 010-0000-0101')
      return real.buildFollowup(...args)
    },
    mergeRecall: (...args: Parameters<typeof real.mergeRecall>) => {
      if (boom.recall) throw new TypeError('가상환자01 010-0000-0101')
      return real.mergeRecall(...args)
    },
  }
})

// handler 안의 조각 모으기를 그대로 쓰되, 시험이 남은 요청 수(메모리)를 볼 수 있게 잡아 둔다
const assemblers = vi.hoisted(() => ({ last: null as { discardUntaken(): number } | null }))
vi.mock('./assemble', async (importOriginal) => {
  const real = await importOriginal<typeof import('./assemble')>()
  return {
    ...real,
    createAssembler: () => {
      const assembler = real.createAssembler()
      assemblers.last = assembler
      return assembler
    },
  }
})
const heldRequests = () => assemblers.last!.discardUntaken()

// Worker 메시지 전체 흐름(AC-604.3·604.4·604.6·604.8). 가짜 포트·가짜 post로 부른다. 시험은 진짜 시각을 기다리지 않는다

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const fake = <T>(name: string): T => JSON.parse(readFileSync(join(ROOT, 'fixtures/patients/fake', name), 'utf8')) as T

const FOLLOWUP = fake<TargetsFile>('targets-followup.json')
const INJECTION = fake<TargetsFile>('targets-injection.json')
const FIRST = fake<StoreFile>('store-first.json').contact
const MARKED = fake<StoreFile>('store-marked.json').contact
const TODAY = FOLLOWUP.today

const KEY_A = 'f|V0401|900101|2026-11-03'
const KEY_B = 'f|V0402|900102|2026-11-03'
const KEY_C = 'r|cartilage|900201|2026-11-02'

const CODE = /^E-[A-Z0-9]+(?:-[A-Z0-9]+)*$/

type Sent = { type: string; ticket: number | string; cmd: string; payload: string }
type Saved = { contact: { v: number; marks: Record<string, string>; recall: { from: string | null; readThrough: string | null; records: RecallRecord[] } } }

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
// 정한 일이 올 때까지 기다린다. 큰 자료의 SHA-256은 스레드에서 돌아 틱으로 재지 못하므로, 틱으로 안 오면 쉬며 기다린다(가짜 시계와 상관없음)
async function until(ready: () => boolean, label: string) {
  for (let i = 0; i < 2000; i++) {
    if (ready()) return
    await tick()
  }
  for (let i = 0; i < 600; i++) {
    if (ready()) return
    await sleep(50)
  }
  throw new Error(`기다린 일이 오지 않음: ${label}`)
}
const settle = async () => {
  for (let i = 0; i < 20; i++) await tick()
}

function harness() {
  const posted: PatientsWorkerMessage[] = []
  const sent: Sent[] = []
  const handler = createHandler({ post: (message) => posted.push(message as PatientsWorkerMessage) })
  handler.setPort({ postMessage: (message) => sent.push(message as Sent) })
  let nextId = 0

  const all = <T extends PatientsWorkerMessage['type']>(type: T) =>
    posted.filter((message): message is Extract<PatientsWorkerMessage, { type: T }> => message.type === type)
  const last = <T extends PatientsWorkerMessage['type']>(type: T) => {
    const list = all(type)
    if (!list.length) throw new Error(`메시지 없음: ${type}`)
    return list[list.length - 1]
  }

  // 통로 포트로 답 하나를 보낸다(chunk … end)
  function deliver(id: string, value: unknown, chunks = 2) {
    const text = JSON.stringify(value)
    const step = Math.ceil(text.length / chunks)
    let seq = 0
    for (let at = 0; at < text.length; at += step) handler.onPort({ type: 'chunk', id, seq: seq++, data: text.slice(at, at + step) })
    handler.onPort({
      type: 'end',
      id,
      count: seq,
      bytes: Buffer.byteLength(text, 'utf8'),
      sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
    })
  }

  const newId = () => `req-${++nextId}`

  // store.load {contact: true}의 답을 그대로 보낸다(도우미 0.3.0은 {contact: {…}})
  async function storedReply(reply: unknown) {
    const id = newId()
    const before = all('stored').length
    deliver(id, reply)
    handler.onScreen({ type: 'stored', id })
    await until(() => all('stored').length > before, 'stored')
    return last('stored')
  }

  const stored = (contact: unknown) => storedReply({ contact })

  async function storedAbort(code: string) {
    const id = newId()
    const before = all('stored').length
    handler.onPort({ type: 'abort', id, code })
    handler.onScreen({ type: 'stored', id })
    await until(() => all('stored').length > before, 'stored')
    return last('stored')
  }

  async function piece(reply: TargetsReply | Record<string, unknown>, asked?: { kind: string; from: string; to: string }) {
    const id = newId()
    const r = reply as TargetsReply
    deliver(id, reply)
    handler.onScreen({ type: 'piece', id, kind: asked?.kind ?? r.kind, from: asked?.from ?? r.from, to: asked?.to ?? r.to })
    await until(() => all('piece').some((m) => m.id === id), 'piece')
    return all('piece').find((m) => m.id === id)!
  }

  async function pieces(replies: TargetsReply[]) {
    for (const reply of replies) await piece(reply)
  }

  const plan = () => {
    handler.onScreen({ type: 'plan', today: TODAY })
    return last('plan')
  }

  // build를 보내고 views가 오거나 store.save가 나갈 때까지 기다린다
  async function build() {
    const views = all('views').length
    const saves = sent.length
    handler.onScreen({ type: 'build', today: TODAY })
    await until(() => all('views').length > views || sent.length > saves, 'build')
  }

  const sentOk = (index: number) => handler.onPort({ type: 'sent', ticket: sent[index].ticket, ok: true })
  const sentFail = (index: number, code?: string) => handler.onPort({ type: 'sent', ticket: sent[index].ticket, ok: false, code })
  const saved = (index: number) => JSON.parse(sent[index].payload) as Saved

  // 탭 열기: plan → 저장 불러오기 → F/U 조각 → 그 달의 정기 주사 조각 → build → 저장 답
  async function open(contact: unknown = FIRST) {
    plan()
    const load = await stored(contact)
    await pieces(FOLLOWUP.pieces)
    await pieces(INJECTION.pieces.filter((p) => load.recall.some((r) => r.from === p.from && r.to === p.to)))
    const saves = sent.length
    await build()
    if (sent.length > saves) {
      sentOk(saves)
      await until(() => all('views').length > 0, 'views')
    }
  }

  return { handler, posted, sent, all, last, deliver, newId, stored, storedReply, storedAbort, piece, pieces, plan, build, sentOk, sentFail, saved, open }
}

// 화면으로 가는 메시지에 보낼 글자·조각이 없다
const FORBIDDEN_KEYS = new Set(['payload', 'data', 'chunk', 'sha256', 'ticket', 'marks', 'rx'])
function expectNoRawText(posted: PatientsWorkerMessage[]) {
  const walk = (value: unknown, index: number) => {
    if (Array.isArray(value)) value.forEach((v) => walk(v, index))
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        expect(FORBIDDEN_KEYS.has(key), `메시지 ${index}`).toBe(false)
        // 쌓인 기록은 건수(coverage.records)로만 나간다
        if (key === 'records') expect(typeof inner, `메시지 ${index}`).toBe('number')
        walk(inner, index)
      }
    }
  }
  posted.forEach((message, index) => {
    walk(message, index)
    const text = JSON.stringify(message)
    // 조각·저장 글자의 모양이 글자로도 없다
    expect(text.includes('"contact":') || text.includes('\\"contact\\"') || text.includes('"chart":[['), `메시지 ${index}`).toBe(false)
  })
}

// 실패로 가는 메시지에는 번호뿐이다(이름·전화·차트번호·증상 글이 없다)
function expectCodesOnly(message: unknown) {
  const text = JSON.stringify(message)
  expect(/가상환자|010-0000|9\d{5}/.test(text), '오류 메시지에 환자 값').toBe(false)
}

const rowOf = <T extends { key: string }>(rows: T[], key: string) => {
  const row = rows.find((r) => r.key === key)
  if (!row) throw new Error('줄 없음')
  return row
}

describe('전체 흐름', () => {
  it('AC-604.3 plan → stored → piece × n → build: 저장 전이면 정기 주사 조각 목록은 null이다', async () => {
    const h = harness()
    const plan = h.plan()
    expect(plan.followup).toEqual(FOLLOWUP.pieces.map((p) => ({ from: p.from, to: p.to })))
    expect(plan.recall).toBeNull()
    const load = await h.stored(FIRST)
    expect(load.ok).toBe(true)
    expect(load.code).toBeUndefined()
    expect(load.recall).toEqual(INJECTION.pieces.map((p) => ({ from: p.from, to: p.to })))
  })

  it('AC-604.3 store.load가 먼저 끝났으면 plan 답에 정기 주사 조각이 있다', async () => {
    const h = harness()
    const load = await h.stored(MARKED)
    expect(load).toMatchObject({ ok: true, recall: [] })
    expect(h.plan().recall).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: TODAY },
    ])
  })

  it('AC-604.3 조각 답은 id로 짝짓고 조각 글자가 없다', async () => {
    const h = harness()
    h.plan()
    const reply = await h.piece(FOLLOWUP.pieces[0])
    expect(Object.keys(reply).sort()).toEqual(['id', 'ok', 'type'])
    expect(reply.ok).toBe(true)
  })

  it('AC-604.3 end보다 piece 알림이 먼저 와도 기다렸다 답한다', async () => {
    const h = harness()
    h.plan()
    const p = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', id: 'early', kind: p.kind, from: p.from, to: p.to })
    await settle()
    expect(h.all('piece')).toHaveLength(0)
    h.deliver('early', p)
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'early', ok: true })
  })

  it('AC-604.3 build: 두 보기 모양과 건수를 보내고, 기록이 바뀌었으면 views 전에 store.save를 먼저 보낸다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    expect(h.sent).toHaveLength(1)
    expect(h.sent[0]).toMatchObject({ type: 'send', cmd: 'store.save' })
    expect(Object.keys(h.sent[0]).sort()).toEqual(['cmd', 'payload', 'ticket', 'type'])
    await settle()
    expect(h.all('views')).toHaveLength(0)

    h.sentOk(0)
    const views = h.last('views')
    expect(views.followup?.rows).toHaveLength(7)
    expect(views.followup?.marksLoaded).toBe(true)
    expect(views.recall?.rows).toHaveLength(6)
    expect(views.recall?.coverage.trimmed).toBe(0)
    expect(views.counts).toEqual({ followup_left: 2, injection_left: 3 })
    expect(views.codes).toEqual({})
  })

  it('AC-604.6 저장 글자는 {contact: {v: 1, marks, recall}}이고 합친 기록이 들어 있다', async () => {
    const h = harness()
    await h.open()
    const { contact } = h.saved(0)
    expect(contact.v).toBe(1)
    expect(contact.marks).toEqual({})
    expect(contact.recall.readThrough).toBe(TODAY)
    expect(contact.recall.from).toBe('2026-04-01')
    expect(contact.recall.records.length).toBeGreaterThan(5)
  })

  it('AC-604.3 기록이 그대로면 다시 build해도 store.save를 보내지 않고 views만 보낸다', async () => {
    const h = harness()
    await h.open()
    const views = h.all('views').length
    await h.build()
    await settle()
    expect(h.sent).toHaveLength(1)
    expect(h.all('views')).toHaveLength(views + 1)
  })

  it('AC-604.6·AC-604.7 저장해 둔 표시: 열쇠가 그대로면 남고, 바뀌었으면 저장 때 빠진다', async () => {
    const h = harness()
    await h.open(MARKED)
    const views = h.last('views')
    expect(rowOf(views.followup!.rows, KEY_A).contacted).toBe(true)
    expect(rowOf(views.recall!.rows, 'r|vitamin-d|900301|2025-04-10').contacted).toBe(true)
    expect(views.counts).toEqual({ followup_left: 1, injection_left: 2 })
    expect(h.saved(0).contact.marks).toEqual({ [KEY_A]: '2026-11-01', 'r|vitamin-d|900301|2025-04-10': '2025-04-11' })
  })

  it('AC-604.6 정기 주사 기록을 합쳐 저장해도 내일 오실 F/U 줄의 연락함 표시가 남는다', async () => {
    const h = harness()
    await h.open(MARKED)
    expect(h.saved(0).contact.marks[KEY_A]).toBe('2026-11-01')
  })

  it('AC-604.3 화면 메시지에는 어느 단계에서도 보낼 글자·조각이 없다', async () => {
    const h = harness()
    await h.open()
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.sentOk(1)
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.sentFail(2, 'E-STORE-FAILED')
    h.handler.onScreen({ type: 'filter', tool: 'followup', filters: { kind: '', includeCond: false, includePast: false } })
    h.handler.onScreen({ type: 'filter', tool: 'recall', filters: { from: TODAY, to: '2026-12-02', overdue: true } })
    expect(h.posted.length).toBeGreaterThan(10)
    expect(h.sent.length).toBe(3)
    expectNoRawText(h.posted)
    // 보낸 글자가 화면 메시지 어디에도 없다
    const screen = JSON.stringify(h.posted)
    for (const save of h.sent) expect(screen.includes(save.payload)).toBe(false)
  })

  it('AC-604.3 문자로 온 답 하나가 잘못돼도(SHA 다름) 그 종류만 실패한다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    const p = FOLLOWUP.pieces[0]
    const text = JSON.stringify(p)
    h.handler.onPort({ type: 'chunk', id: 'bad', seq: 0, data: text })
    h.handler.onPort({ type: 'end', id: 'bad', count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: '0'.repeat(64) })
    h.handler.onScreen({ type: 'piece', id: 'bad', kind: p.kind, from: p.from, to: p.to })
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'bad', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
  })
})

describe('종류마다 따로', () => {
  async function loaded(h: ReturnType<typeof harness>) {
    h.plan()
    await h.stored(FIRST)
  }

  it('AC-604.3 F/U 조각 하나가 abort면 F/U만 null이고 정기 주사는 보인다', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces.slice(1))
    const first = FOLLOWUP.pieces[0]
    h.handler.onPort({ type: 'abort', id: 'gone', code: 'E-BIT-READ-FAILED' })
    h.handler.onScreen({ type: 'piece', id: 'gone', kind: first.kind, from: first.from, to: first.to })
    await until(() => h.all('piece').some((m) => m.id === 'gone'), 'piece')
    expect(h.all('piece').find((m) => m.id === 'gone')).toEqual({ type: 'piece', id: 'gone', ok: false, code: 'E-BIT-READ-FAILED' })
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    const views = h.last('views')
    expect(views.followup).toBeNull()
    expect(views.codes).toEqual({ followup: 'E-BIT-READ-FAILED' })
    expect(views.recall?.rows).toHaveLength(6)
    expect(views.counts).toBeNull()
    // F/U 47 표가 없으니 기록의 전화로 보인다
    expect(rowOf(views.recall!.rows, 'r|vitamin-d|900101|2026-09-10').phone).toBe('010-0000-9101')
  })

  it('AC-604.3 정기 주사 조각 하나가 실패하면 정기 주사만 null이고 F/U는 보이며 저장하지 않는다', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces.slice(1))
    const first = INJECTION.pieces[0]
    h.handler.onPort({ type: 'abort', id: 'gone', code: 'E-BIT-READ-FAILED' })
    h.handler.onScreen({ type: 'piece', id: 'gone', kind: first.kind, from: first.from, to: first.to })
    await until(() => h.all('piece').some((m) => m.id === 'gone'), 'piece')
    await h.build()
    await settle()
    const views = h.last('views')
    expect(views.recall).toBeNull()
    expect(views.codes).toEqual({ recall: 'E-BIT-READ-FAILED' })
    expect(views.followup?.rows).toHaveLength(7)
    expect(views.followup?.marksLoaded).toBe(true)
    expect(views.counts).toBeNull()
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.3 스트림이 거절돼 id가 없으면 화면이 번호를 알려 그 종류만 실패한다', async () => {
    const h = harness()
    await loaded(h)
    const first = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', kind: first.kind, from: first.from, to: first.to, code: 'E-BRIDGE-DISCONNECTED' })
    expect(h.last('piece')).toEqual({ type: 'piece', id: null, ok: false, code: 'E-BRIDGE-DISCONNECTED' })
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    expect(h.last('views').codes).toEqual({ followup: 'E-BRIDGE-DISCONNECTED' })
    expect(h.last('views').followup).toBeNull()
  })

  it('AC-604.3 화면이 준 번호가 번호 모양이 아니면 그대로 넘기지 않는다', async () => {
    const h = harness()
    await loaded(h)
    const first = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', kind: first.kind, from: first.from, to: first.to, code: '가상환자01' })
    expect(h.last('piece').code).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-604.3 F/U 조각을 다 안 부르고 build하면 F/U만 null(반쪽 자료를 쓰지 않는다)', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces.slice(0, 3))
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    expect(h.last('views').followup).toBeNull()
    expect(h.last('views').codes).toEqual({ followup: 'E-BRIDGE-BAD-REPLY' })
    expect(h.last('views').recall).not.toBeNull()
  })

  it('AC-604.3 정기 주사 조각을 다 안 부르고 build하면 정기 주사만 null이고 저장하지 않는다', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces.slice(0, -1))
    await h.build()
    await settle()
    expect(h.last('views').recall).toBeNull()
    expect(h.last('views').codes).toEqual({ recall: 'E-BRIDGE-BAD-REPLY' })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.3 물어본 기간과 다른 답은 그 조각 실패(다른 달 자료를 쓰지 않는다)', async () => {
    const h = harness()
    await loaded(h)
    const reply = await h.piece(FOLLOWUP.pieces[0], { kind: 'followup', from: FOLLOWUP.pieces[1].from, to: FOLLOWUP.pieces[1].to })
    expect(reply).toMatchObject({ ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    await h.build()
    expect(h.last('views').codes.followup).toBe('E-BRIDGE-BAD-REPLY')
  })

  it.each([
    ['null 줄', (p: TargetsReply) => ({ ...p, chart: [p.chart[0], null] })],
    ['null 칸', (p: TargetsReply) => ({ ...p, rx: [p.rx[0], [null]] })],
    ['칸 이름 틀림', (p: TargetsReply) => ({ ...p, chart: [['이름']] })],
  ])('AC-604.3 F/U 조각 모양이 틀리면(%s) 그 종류만 번호로 끝나고 Worker가 산다', async (_id, broken) => {
    const h = harness()
    await loaded(h)
    const reply = await h.piece(broken(FOLLOWUP.pieces[3]))
    expect(reply).toMatchObject({ ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    const views = h.last('views')
    expect(views.followup).toBeNull()
    expect(views.recall).not.toBeNull()
    expect(views.codes).toEqual({ followup: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-604.3 원본이 멈추는 F/U 자료면 E-PATIENTS-SOURCE이고 환자 값이 없다', async () => {
    const h = harness()
    await loaded(h)
    const head = FOLLOWUP.pieces[0]
    const conflict = {
      ...head,
      chart: [head.chart[0], ['V9', '900101', '가상환자01', '1주 뒤 f/u', '2026-07-10'], ['V9', '900102', '가상환자02', '1주 뒤 f/u', '2026-07-10']],
    }
    await h.piece(conflict)
    await h.pieces(FOLLOWUP.pieces.slice(1))
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    const views = h.last('views')
    expect(views.followup).toBeNull()
    expect(views.codes).toEqual({ followup: 'E-PATIENTS-SOURCE' })
    expect(views.recall?.rows).toHaveLength(6)
    expectCodesOnly(views.codes)
  })

  it('AC-604.3 원본이 멈추는 정기 주사 자료면 E-PATIENTS-SOURCE이고 F/U는 그대로다', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces)
    const april = INJECTION.pieces[0]
    const conflict = {
      ...april,
      chart: [april.chart[0], ['V9', '900201', '가상환자21', '아라간 1차', '2026-04-18'], ['V9', '900202', '가상환자22', '아라간 1차', '2026-04-18']],
    }
    await h.piece(conflict)
    await h.pieces(INJECTION.pieces.slice(1))
    await h.build()
    await settle()
    const views = h.last('views')
    expect(views.recall).toBeNull()
    expect(views.codes).toEqual({ recall: 'E-PATIENTS-SOURCE' })
    expect(views.followup?.rows).toHaveLength(7)
    expect(h.sent).toHaveLength(0)
  })

  it('AC-2201.5 F/U·정기 주사 조각마다 끝에 도우미 83 총계 줄이 있어도 오류 없이 총계 줄 없는 답과 같은 보기 모양이다', async () => {
    // 도우미가 보내는 총계 줄: 【 총 계 】 글자가 있던 No 칸은 빠지고 차트번호 칸에 건수만 남는다(patients-total-row)
    const withTotal = (p: TargetsReply): TargetsReply => ({ ...p, chart: [...p.chart, p.chart[0].map((name) => (name === '차트번호' ? '1,295건' : ''))] })
    const run = async (map: (p: TargetsReply) => TargetsReply) => {
      const h = harness()
      await loaded(h)
      await h.pieces(FOLLOWUP.pieces.map(map))
      await h.pieces(INJECTION.pieces.map(map))
      const saves = h.sent.length
      await h.build()
      // 정기 주사가 멈추면 저장하지 않는다(그때는 views가 바로 온다)
      if (h.sent.length > saves) h.sentOk(saves)
      await until(() => h.all('views').length > 0, 'views')
      return h.last('views')
    }
    const plain = await run((p) => p)
    const totaled = await run(withTotal)
    expect(totaled.codes).toEqual({})
    expect('reasons' in totaled).toBe(false)
    expect(totaled.followup?.rows).toHaveLength(7)
    expect(totaled.recall?.rows).toHaveLength(6)
    expect(totaled).toEqual(plain)
  })

  describe('E-PATIENTS-SOURCE의 이유 낱말(patients-source-reason)', () => {
    it.each([
      ['visit-conflict', [['V9', '900101', '가상환자01', '1주 뒤 f/u', '2026-07-10'], ['V9', '900102', '가상환자02', '1주 뒤 f/u', '2026-07-10']]],
      ['row-unreadable', [['V8', '900101', '', '1주 뒤 f/u', '2026-07-10']]],
    ])('AC-2101.1 F/U가 %s로 멈추면 codes는 그대로이고 reasons에 그 낱말만 있으며 환자 값이 없다', async (reason, rows) => {
      const h = harness()
      await loaded(h)
      const head = FOLLOWUP.pieces[0]
      await h.piece({ ...head, chart: [head.chart[0], ...rows] })
      await h.pieces(FOLLOWUP.pieces.slice(1))
      await h.pieces(INJECTION.pieces)
      await h.build()
      h.sentOk(0)
      const views = h.last('views')
      expect(views.followup).toBeNull()
      expect(views.codes).toEqual({ followup: 'E-PATIENTS-SOURCE' })
      expect(views.reasons).toEqual({ followup: reason })
      expectCodesOnly(views.reasons)
    })

    it('AC-2101.2 정기 주사가 E-PATIENTS-SOURCE로 멈추면 reasons는 {recall: 그 낱말}이다', async () => {
      const h = harness()
      await loaded(h)
      await h.pieces(FOLLOWUP.pieces)
      const april = INJECTION.pieces[0]
      await h.piece({
        ...april,
        chart: [april.chart[0], ['V9', '900201', '가상환자21', '아라간 1차', '2026-04-18'], ['V9', '900202', '가상환자22', '아라간 1차', '2026-04-18']],
      })
      await h.pieces(INJECTION.pieces.slice(1))
      await h.build()
      await settle()
      const views = h.last('views')
      expect(views.codes).toEqual({ recall: 'E-PATIENTS-SOURCE' })
      expect(views.reasons).toEqual({ recall: 'visit-conflict' })
      expectCodesOnly(views.reasons)
    })

    it('AC-2101.3 E-PATIENTS-SOURCE가 아닌 오류만 있으면 views에 reasons 칸이 없다', async () => {
      const h = harness()
      await loaded(h)
      await h.piece({ ...FOLLOWUP.pieces[3], chart: [['이름']] })
      await h.pieces(INJECTION.pieces)
      await h.build()
      h.sentOk(0)
      const views = h.last('views')
      expect(views.codes).toEqual({ followup: 'E-BRIDGE-BAD-REPLY' })
      expect('reasons' in views).toBe(false)
    })

    it('AC-2101.3 이유가 있던 읽기 뒤 새 읽기가 잘 끝나면 reasons 칸이 없다', async () => {
      const h = harness()
      await loaded(h)
      const head = FOLLOWUP.pieces[0]
      await h.piece({ ...head, chart: [head.chart[0], ['V8', '900101', '', '1주 뒤 f/u', '2026-07-10']] })
      await h.pieces(FOLLOWUP.pieces.slice(1))
      await h.pieces(INJECTION.pieces)
      await h.build()
      h.sentOk(0)
      expect(h.last('views').reasons).toEqual({ followup: 'row-unreadable' })

      const again = h.plan()
      await h.pieces(FOLLOWUP.pieces)
      await h.pieces(INJECTION.pieces.filter((p) => again.recall?.some((r) => r.from === p.from && r.to === p.to)))
      const saves = h.sent.length
      const before = h.all('views').length
      await h.build()
      if (h.sent.length > saves) h.sentOk(saves)
      await until(() => h.all('views').length > before, 'views')
      const views = h.last('views')
      expect(views.codes).toEqual({})
      expect('reasons' in views).toBe(false)
    })
  })

  describe('번호 없는 오류(원본의 TypeError 같은 것)', () => {
    afterEach(() => {
      boom.followup = false
      boom.recall = false
    })

    it('AC-604.3 F/U를 만들다 던지면 F/U만 null + E-BRIDGE-BAD-REPLY, 오류 글은 어디에도 없다', async () => {
      const h = harness()
      await loaded(h)
      await h.pieces(FOLLOWUP.pieces)
      await h.pieces(INJECTION.pieces)
      boom.followup = true
      await h.build()
      h.sentOk(0)
      const views = h.last('views')
      expect(views.followup).toBeNull()
      expect(views.codes).toEqual({ followup: 'E-BRIDGE-BAD-REPLY' })
      expect(views.recall?.rows).toHaveLength(6)
      expect(views.counts).toBeNull()
      expect(JSON.stringify(h.posted).includes('TypeError')).toBe(false)
    })

    it('AC-604.3 정기 주사를 합치다 던지면 정기 주사만 null + E-BRIDGE-BAD-REPLY, F/U는 그대로이고 저장하지 않는다', async () => {
      const h = harness()
      await loaded(h)
      await h.pieces(FOLLOWUP.pieces)
      await h.pieces(INJECTION.pieces)
      boom.recall = true
      await h.build()
      await settle()
      const views = h.last('views')
      expect(views.recall).toBeNull()
      expect(views.codes).toEqual({ recall: 'E-BRIDGE-BAD-REPLY' })
      expect(views.followup?.rows).toHaveLength(7)
      expect(h.sent).toHaveLength(0)
      expect(JSON.stringify(h.posted).includes('TypeError')).toBe(false)
    })

    it('AC-604.3 던진 뒤에도 Worker가 산다: 다음 build는 된다', async () => {
      const h = harness()
      await loaded(h)
      await h.pieces(FOLLOWUP.pieces)
      await h.pieces(INJECTION.pieces)
      boom.followup = true
      boom.recall = true
      await h.build()
      expect(h.last('views').codes).toEqual({ followup: 'E-BRIDGE-BAD-REPLY', recall: 'E-BRIDGE-BAD-REPLY' })
      boom.followup = false
      boom.recall = false
      await h.build()
      h.sentOk(0)
      expect(h.last('views').followup).not.toBeNull()
      expect(h.last('views').recall).not.toBeNull()
      expect(h.last('views').codes).toEqual({})
    })
  })

  it('AC-604.3 정기 주사 조각이 모자란 build 뒤 조각이 다 오면 다음 build에서 정기 주사가 보인다', async () => {
    const h = harness()
    await loaded(h)
    await h.pieces(FOLLOWUP.pieces)
    await h.build()
    expect(h.last('views').codes).toEqual({ recall: 'E-BRIDGE-BAD-REPLY' })
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    expect(h.last('views').recall).not.toBeNull()
    expect(h.last('views').codes).toEqual({})
  })

  it('AC-604.5 건수 null은 handler가 정한다: 두 보기 모양이 다 있고 표시를 불러왔을 때만 숫자', async () => {
    const both = harness()
    await both.open()
    expect(both.last('views').counts).toEqual({ followup_left: 2, injection_left: 3 })

    const noFollowup = harness()
    await loaded(noFollowup)
    await noFollowup.pieces(INJECTION.pieces)
    await noFollowup.build()
    noFollowup.sentOk(0)
    expect(noFollowup.last('views').followup).toBeNull()
    expect(noFollowup.last('views').recall).not.toBeNull()
    expect(noFollowup.last('views').counts).toBeNull()

    const noRecall = harness()
    await loaded(noRecall)
    await noRecall.pieces(FOLLOWUP.pieces)
    await noRecall.build()
    expect(noRecall.last('views').followup?.marksLoaded).toBe(true)
    expect(noRecall.last('views').recall).toBeNull()
    expect(noRecall.last('views').counts).toBeNull()

    const noMarks = harness()
    noMarks.plan()
    await noMarks.storedAbort('E-STORE-FAILED')
    await noMarks.pieces(FOLLOWUP.pieces)
    await noMarks.build()
    expect(noMarks.last('views').followup?.marksLoaded).toBe(false)
    expect(noMarks.last('views').counts).toBeNull()
  })
})

describe('연락 표시를 못 불러옴 (AC-604.8)', () => {
  async function failedLoad(load: (h: ReturnType<typeof harness>) => Promise<unknown>) {
    const h = harness()
    h.plan()
    await load(h)
    await h.pieces(FOLLOWUP.pieces)
    await h.build()
    return h
  }

  it('AC-604.8 store.load abort → 정기 주사 null·F/U는 marksLoaded false·건수 null·store.save 없음', async () => {
    const h = await failedLoad((x) => x.storedAbort('E-STORE-FAILED'))
    const views = h.last('views')
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-STORE-FAILED', recall: [] })
    expect(views.recall).toBeNull()
    expect(views.codes).toEqual({ recall: 'E-STORE-FAILED' })
    expect(views.followup?.marksLoaded).toBe(false)
    expect(views.followup?.rows.every((r) => !r.contacted)).toBe(true)
    expect(views.counts).toBeNull()
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 깨진 파일이면 빈 것으로 시작하지 않고 E-STORE-BROKEN', async () => {
    const h = await failedLoad((x) => x.stored({ v: 2 }))
    expect(h.last('stored')).toMatchObject({ ok: false, code: 'E-STORE-BROKEN', recall: [] })
    expect(h.last('views').codes).toEqual({ recall: 'E-STORE-BROKEN' })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 contact 없이 안쪽 모양을 바로 준 옛 답 {}는 빈 것으로 시작하지 않고 E-STORE-BROKEN이며 [연락함]이 store.save를 보내지 않는다', async () => {
    const h = await failedLoad((x) => x.storedReply({}))
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-STORE-BROKEN', recall: [] })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    await settle()
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: false, code: 'E-STORE-BROKEN', counts: null })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 스트림이 거절돼 id가 없으면 화면이 번호를 알린다', async () => {
    const h = harness()
    h.plan()
    h.handler.onScreen({ type: 'stored', code: 'E-BRIDGE-DISCONNECTED' })
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-BRIDGE-DISCONNECTED', recall: [] })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.last('marked')).toMatchObject({ ok: false, code: 'E-BRIDGE-DISCONNECTED', counts: null })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 실패 뒤 [연락함]은 그 번호만 돌려주고 포트에 send가 없다', async () => {
    const h = await failedLoad((x) => x.storedAbort('E-BIT-NOT-REGISTERED'))
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    await settle()
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: false, code: 'E-BIT-NOT-REGISTERED', counts: null })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 처음(stored 전) [연락함]은 E-STORE-FAILED만 돌려주고 send가 없다', async () => {
    const h = harness()
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    await settle()
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 stored 없이 build하면 정기 주사 null·F/U 표시 없이·건수 null', async () => {
    const h = harness()
    h.plan()
    await h.pieces(FOLLOWUP.pieces)
    await h.build()
    const views = h.last('views')
    expect(views.recall).toBeNull()
    expect(views.codes.recall).toBe('E-STORE-FAILED')
    expect(views.followup?.marksLoaded).toBe(false)
    expect(views.counts).toBeNull()
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 다시 불러오는 중(reload 뒤 새 stored 전) 옛 줄로 [연락함]을 눌러도 send가 없다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'reload' })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    await settle()
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: false, code: 'E-STORE-FAILED', counts: null })
    expect(h.sent).toHaveLength(saves)
  })

  it('AC-604.8 다시 불러오기가 실패한 뒤 옛 줄로 [연락함]을 눌러도 send가 없고 받은 번호를 준다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'reload' })
    await h.storedAbort('E-STORE-BROKEN')
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    await settle()
    expect(h.last('marked')).toMatchObject({ key: KEY_A, ok: false, code: 'E-STORE-BROKEN', counts: null })
    expect(h.sent).toHaveLength(saves)
  })

  it('AC-604.8 다시 불러오는 중 F/U 조각만으로 build하면 F/U는 표시 없이 보이고 정기 주사 null·건수 null·send 없음', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'reload' })
    await h.pieces(FOLLOWUP.pieces)
    h.handler.onScreen({ type: 'plan', today: TODAY })
    await h.pieces(FOLLOWUP.pieces)
    await h.build()
    await settle()
    expect(h.sent).toHaveLength(saves)
    expect(h.last('views').recall).toBeNull()
    expect(h.last('views').codes).toEqual({ recall: 'E-STORE-FAILED' })
    expect(h.last('views').followup?.marksLoaded).toBe(false)
    expect(h.last('views').counts).toBeNull()
  })

  it.each<[string, (h: ReturnType<typeof harness>) => Promise<unknown>, string]>([
    [
      '처음 불러오기가 실패',
      async (h) => {
        h.plan()
        await h.storedAbort('E-BIT-NOT-REGISTERED')
      },
      'E-BIT-NOT-REGISTERED',
    ],
    [
      '다시 불러오기가 실패',
      async (h) => {
        await h.open()
        h.handler.onScreen({ type: 'reload' })
        await h.storedAbort('E-STORE-BROKEN')
        h.plan()
      },
      'E-STORE-BROKEN',
    ],
    [
      '다시 불러오는 중',
      async (h) => {
        await h.open()
        h.handler.onScreen({ type: 'reload' })
        h.plan()
      },
      'E-STORE-FAILED',
    ],
  ])('AC-604.8 %s: 정기 주사 조각을 다 줘도 합치지 않고 send 없이 codes.recall에 그 번호만', async (_id, setup, code) => {
    const h = harness()
    await setup(h)
    const saves = h.sent.length
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    await settle()
    expect(h.sent).toHaveLength(saves)
    const views = h.last('views')
    expect(views.recall).toBeNull()
    expect(views.codes).toEqual({ recall: code })
    expect(views.followup?.marksLoaded).toBe(false)
    expect(views.followup?.rows.every((r) => !r.contacted)).toBe(true)
    expect(views.counts).toBeNull()
  })

  it('AC-604.8 다시 불러오기가 되면 다시 저장할 수 있다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'reload' })
    await h.stored(h.saved(0).contact)
    h.handler.onScreen({ type: 'plan', today: TODAY })
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces.slice(-1))
    await h.build()
    expect(h.last('views').counts).toEqual({ followup_left: 2, injection_left: 3 })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 1)
    expect(h.saved(saves).contact.marks).toEqual({ [KEY_A]: TODAY })
  })

  it('AC-604.8 reload 전에 시작한 stored가 늦게 끝나도 믿지 않는다(옛 store로 덮어쓰지 않음)', async () => {
    const h = harness()
    h.handler.onScreen({ type: 'stored', id: 'old' })
    h.handler.onScreen({ type: 'reload' })
    h.deliver('old', { contact: MARKED })
    await settle()
    expect(h.all('stored')).toHaveLength(0)
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.last('marked')).toMatchObject({ ok: false, code: 'E-STORE-FAILED' })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.8 다시 불러오기가 실패해도 옛 줄은 고를 수 있다(저장만 막는다)', async () => {
    const h = harness()
    await h.open()
    h.handler.onScreen({ type: 'reload' })
    await h.storedAbort('E-STORE-FAILED')
    h.handler.onScreen({ type: 'filter', tool: 'followup', filters: { kind: '', includeCond: false, includePast: false } })
    expect(h.last('filtered').rows.map((r) => r.key)).toContain(KEY_A)
  })

  it('AC-604.6 다시 불러온 뒤 build 전에는 옛 보기 모양으로 새 저장의 표시를 지우지 않는다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    const saved = h.saved(0).contact
    const other = 'r|vitamin-d|900999|2026-10-01'
    h.handler.onScreen({ type: 'reload' })
    await h.stored({ ...saved, marks: { [other]: '2026-10-02' } })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.saved(saves).contact.marks).toEqual({ [other]: '2026-10-02', [KEY_A]: TODAY })
  })

  it('AC-604.8 build가 진행 중인 조각을 기다리는 사이 reload하면 옛 build는 답하지 않는다', async () => {
    const h = harness()
    await h.open()
    const views = h.all('views').length
    const p = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', id: 'late', kind: p.kind, from: p.from, to: p.to })
    h.handler.onScreen({ type: 'build', today: TODAY })
    h.handler.onScreen({ type: 'reload' })
    h.deliver('late', p)
    await until(() => h.all('piece').some((m) => m.id === 'late'), 'piece')
    await settle()
    expect(h.all('views')).toHaveLength(views)
  })

  it('AC-604.8 stored가 잇따르면 마지막 것만 믿는다', async () => {
    const h = harness()
    h.handler.onScreen({ type: 'stored', id: 'a' })
    h.handler.onScreen({ type: 'stored', id: 'b' })
    h.deliver('b', { contact: FIRST })
    await until(() => h.all('stored').length === 1, 'stored')
    h.deliver('a', { contact: MARKED })
    await settle()
    expect(h.all('stored')).toHaveLength(1)
    expect(h.plan().recall).toEqual(INJECTION.pieces.map((p) => ({ from: p.from, to: p.to })))
  })

  it('AC-604.8 줄에 쌓인 [연락함]은 reload 뒤에 나가지 않고 실패로 답한다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 1)
    h.handler.onScreen({ type: 'reload' })
    expect(h.all('marked').find((m) => m.key === KEY_B)).toMatchObject({ ok: false, code: 'E-STORE-FAILED' })
    // 앞서 나간 저장의 답은 와도 된다. 그 뒤에 나가는 것이 없다
    h.sentOk(saves)
    expect(h.all('marked').find((m) => m.key === KEY_A)).toMatchObject({ ok: true, counts: null })
    await settle()
    expect(h.sent).toHaveLength(saves + 1)
  })

  it('AC-604.8 reload 전에 나간 저장의 답이 새 stored 뒤에 와도 믿지 않는다: 다음 글자는 새로 불러온 표시 + 새 표시뿐', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    const saved = h.saved(0).contact
    const other = 'r|vitamin-d|900999|2026-10-01'
    const reloaded = { ...saved, marks: { [other]: '2026-10-02' }, recall: { ...saved.recall, records: saved.recall.records.slice(1) } }

    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 1)
    h.handler.onScreen({ type: 'reload' })
    await h.stored(reloaded)
    h.sentOk(saves)
    expect(h.sent).toHaveLength(saves + 1)

    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 2)
    const next = h.saved(saves + 1).contact
    expect(next.marks).toEqual({ [other]: '2026-10-02', [KEY_B]: TODAY })
    expect(next.recall).toEqual(reloaded.recall)
  })

  it.each<[string, (h: ReturnType<typeof harness>) => Promise<unknown>]>([
    ['새 stored 전에 답이 와도', async () => {}],
    ['새 stored가 된 뒤에 답이 와도', (h) => h.stored(FIRST)],
  ])('AC-604.8 [연락함] 저장 뒤에 줄 선 기록 저장은 reload 뒤에 나가지 않는다: %s send가 늘지 않는다', async (_id, afterReload) => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.build() // 정기 주사 조각이 모자라 F/U만
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(1)
    await h.pieces(INJECTION.pieces)
    h.handler.onScreen({ type: 'build', today: TODAY }) // 합친 기록의 저장이 앞 저장 뒤에 줄 선다
    await settle()
    expect(h.sent).toHaveLength(1)
    const views = h.all('views').length

    h.handler.onScreen({ type: 'reload' })
    await afterReload(h)
    expect(h.sent).toHaveLength(1)
    h.sentOk(0)
    await settle()
    expect(h.sent).toHaveLength(1)
    // 옛 build의 답도 나가지 않는다(새 읽기의 build가 답한다)
    expect(h.all('views')).toHaveLength(views)
  })
})

describe('저장 줄 세우기 (AC-604.4)', () => {
  it('AC-604.4 [연락함] → send, sent 됨 → 그 줄이 연락함인 보기 모양과 줄어든 건수', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    const views = h.all('views').length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 1)
    expect(h.saved(saves).contact.marks).toEqual({ [KEY_A]: TODAY })
    await settle()
    expect(h.all('marked')).toHaveLength(0)
    expect(h.all('views')).toHaveLength(views)

    h.sentOk(saves)
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: true, counts: { followup_left: 1, injection_left: 3 } })
    const next = h.last('views')
    expect(h.all('views')).toHaveLength(views + 1)
    expect(rowOf(next.followup!.rows, KEY_A).contacted).toBe(true)
    expect(rowOf(next.followup!.rows, KEY_B).contacted).toBe(false)
    expect(next.counts).toEqual({ followup_left: 1, injection_left: 3 })
  })

  it('AC-604.4 정기 주사 줄도 같다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_C, on: true, today: TODAY })
    h.sentOk(saves)
    expect(rowOf(h.last('views').recall!.rows, KEY_C).contacted).toBe(true)
    expect(h.last('views').counts).toEqual({ followup_left: 2, injection_left: 2 })
  })

  it('AC-604.4 sent 실패 → 바꾸지 않고 번호만(보기 모양을 다시 보내지 않는다)', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    const views = h.all('views').length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.sentFail(saves, 'E-STORE-FAILED')
    expect(h.last('marked')).toEqual({ type: 'marked', key: KEY_A, ok: false, code: 'E-STORE-FAILED', counts: { followup_left: 2, injection_left: 3 } })
    expect(h.all('views')).toHaveLength(views)
    expectCodesOnly(h.last('marked').code)
  })

  it('AC-604.4 sent 실패에 번호가 없거나 번호 모양이 아니면 E-STORE-FAILED', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.sentFail(saves)
    expect(h.last('marked').code).toBe('E-STORE-FAILED')
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.sentFail(saves + 1, '가상환자01')
    expect(h.last('marked').code).toBe('E-STORE-FAILED')
  })

  it('AC-604.4 잇따라 두 줄: 두 번째 send는 첫 sent 전에 없고, 두 번째 글자에 첫 표시가 들어 있고, 둘 다 남는다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    expect(h.sent).toHaveLength(saves + 1)
    expect(h.saved(saves).contact.marks).toEqual({ [KEY_A]: TODAY })
    await settle()
    expect(h.sent).toHaveLength(saves + 1)
    expect(h.all('marked')).toHaveLength(0)

    h.sentOk(saves)
    expect(h.sent).toHaveLength(saves + 2)
    expect(h.sent[saves + 1].ticket).not.toBe(h.sent[saves].ticket)
    expect(h.saved(saves + 1).contact.marks).toEqual({ [KEY_A]: TODAY, [KEY_B]: TODAY })
    expect(h.all('marked').map((m) => [m.key, m.ok])).toEqual([[KEY_A, true]])

    h.sentOk(saves + 1)
    expect(h.all('marked').map((m) => [m.key, m.ok])).toEqual([
      [KEY_A, true],
      [KEY_B, true],
    ])
    const rows = h.last('views').followup!.rows
    expect(rowOf(rows, KEY_A).contacted && rowOf(rows, KEY_B).contacted).toBe(true)
    expect(h.last('views').counts).toEqual({ followup_left: 0, injection_left: 3 })
    expect(h.sent).toHaveLength(saves + 2)
  })

  it('AC-604.4 첫 저장이 실패하면 첫 표시만 빠지고 두 번째는 남는다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.sentFail(saves, 'E-STORE-FAILED')
    expect(h.saved(saves + 1).contact.marks).toEqual({ [KEY_B]: TODAY })
    h.sentOk(saves + 1)
    expect(h.all('marked').map((m) => [m.key, m.ok])).toEqual([
      [KEY_A, false],
      [KEY_B, true],
    ])
    const rows = h.last('views').followup!.rows
    expect(rowOf(rows, KEY_A).contacted).toBe(false)
    expect(rowOf(rows, KEY_B).contacted).toBe(true)
  })

  it('AC-604.4 앞서 확정된 표시는 뒤 저장이 실패해도 그대로다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.sentOk(saves)
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.sentFail(saves + 1, 'E-STORE-FAILED')
    expect(h.last('marked')).toMatchObject({ key: KEY_B, ok: false, counts: { followup_left: 1, injection_left: 3 } })
    h.handler.onScreen({ type: 'mark', key: KEY_C, on: true, today: TODAY })
    expect(h.saved(saves + 2).contact.marks).toEqual({ [KEY_A]: TODAY, [KEY_C]: TODAY })
  })

  it('AC-604.4 줄에 여럿 쌓이면 차례가 왔을 때 함께 한 번에 저장하고 차례대로 답한다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_C, on: true, today: TODAY })
    h.sentOk(saves)
    expect(h.sent).toHaveLength(saves + 2)
    expect(h.saved(saves + 1).contact.marks).toEqual({ [KEY_A]: TODAY, [KEY_B]: TODAY, [KEY_C]: TODAY })
    h.sentOk(saves + 1)
    expect(h.all('marked').map((m) => m.key)).toEqual([KEY_A, KEY_B, KEY_C])
    expect(h.sent).toHaveLength(saves + 2)
  })

  it('AC-604.4 같은 줄을 켰다 끄면 끈 것이 남는다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.sentOk(saves)
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: false, today: TODAY })
    expect(h.saved(saves + 1).contact.marks).toEqual({})
    h.sentOk(saves + 1)
    expect(rowOf(h.last('views').followup!.rows, KEY_A).contacted).toBe(false)
    expect(h.last('views').counts).toEqual({ followup_left: 2, injection_left: 3 })
  })

  it('AC-604.4 모르는 표의 sent는 무시하고 줄을 넘기지 않는다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    h.handler.onPort({ type: 'sent', ticket: 'nope', ok: true })
    h.handler.onPort({ type: 'sent', ok: true })
    expect(h.sent).toHaveLength(saves + 1)
    expect(h.all('marked')).toHaveLength(0)
    h.sentOk(saves)
    // 같은 표가 두 번 와도 두 번째 저장의 답으로 치지 않는다
    h.sentOk(saves)
    expect(h.all('marked')).toHaveLength(1)
    expect(h.sent).toHaveLength(saves + 2)
  })

  it('AC-604.4 정기 주사 기록 저장도 같은 줄을 쓴다: 앞 [연락함]의 답 뒤에 나가고 그 표시가 들어 있다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.build() // 첫 build: 정기 주사 조각이 모자라 F/U만
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(1)
    await h.pieces(INJECTION.pieces)
    const views = h.all('views').length
    h.handler.onScreen({ type: 'build', today: TODAY })
    await settle()
    expect(h.sent).toHaveLength(1)
    expect(h.all('views')).toHaveLength(views)
    h.sentOk(0)
    expect(h.sent).toHaveLength(2)
    expect(h.saved(1).contact.marks).toEqual({ [KEY_A]: TODAY })
    expect(h.saved(1).contact.recall.readThrough).toBe(TODAY)
    h.sentOk(1)
    expect(h.last('views').recall).not.toBeNull()
    expect(rowOf(h.last('views').followup!.rows, KEY_A).contacted).toBe(true)
  })

  it('AC-604.3 기록 저장이 실패해도 명단은 보이고 codes.store를 함께 보낸다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentFail(0, 'E-STORE-FAILED')
    const views = h.last('views')
    expect(views.codes).toEqual({ store: 'E-STORE-FAILED' })
    expect(views.recall?.rows).toHaveLength(6)
    expect(views.followup?.rows).toHaveLength(7)
    expect(views.counts).toEqual({ followup_left: 2, injection_left: 3 })
  })

  it('AC-604.3 기록 저장이 실패했으면 다시 build할 때 또 저장해 보고, 되면 번호가 사라진다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentFail(0, 'E-STORE-FAILED')
    await h.build()
    expect(h.sent).toHaveLength(2)
    expect(h.saved(1).contact.recall.readThrough).toBe(TODAY)
    h.sentOk(1)
    expect(h.last('views').codes).toEqual({})
  })

  it('AC-604.3 기록 저장이 실패한 뒤 [연락함]이 되면 합친 기록도 함께 저장된다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentFail(0, 'E-STORE-FAILED')
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.saved(1).contact.recall.readThrough).toBe(TODAY)
    h.sentOk(1)
    expect(h.last('views').codes).toEqual({})
  })

  it('AC-604.4 새 포트를 받으면 옛 포트의 답을 기다리지 않는다(줄이 멈추지 않는다)', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    h.handler.onScreen({ type: 'mark', key: KEY_B, on: true, today: TODAY })
    const second: Sent[] = []
    h.handler.setPort({ postMessage: (message) => second.push(message as Sent) })
    expect(h.all('marked')[0]).toMatchObject({ key: KEY_A, ok: false, code: 'E-BRIDGE-DISCONNECTED' })
    expect(second).toHaveLength(1)
    expect(JSON.parse(second[0].payload).contact.marks).toEqual({ [KEY_B]: TODAY })
    // 옛 포트로 늦게 온 답은 무시한다
    h.sentOk(saves)
    expect(h.all('marked')).toHaveLength(1)
    h.handler.onPort({ type: 'sent', ticket: second[0].ticket, ok: true })
    expect(h.last('marked')).toMatchObject({ key: KEY_B, ok: true })
  })

  it('AC-604.4 포트가 없으면 저장하지 못했다고 번호만 돌려준다', async () => {
    const posted: PatientsWorkerMessage[] = []
    const handler = createHandler({ post: (message) => posted.push(message as PatientsWorkerMessage) })
    const text = '{"contact":{}}'
    handler.onPort({ type: 'chunk', id: 'a', seq: 0, data: text })
    handler.onPort({ type: 'end', id: 'a', count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: createHash('sha256').update(text).digest('hex') })
    handler.onScreen({ type: 'stored', id: 'a' })
    await until(() => posted.some((m) => m.type === 'stored'), 'stored')
    handler.onScreen({ type: 'mark', key: 'f|V1|900001|2026-11-03', on: true, today: TODAY })
    expect(posted.filter((m) => m.type === 'marked')).toMatchObject([{ ok: false, code: 'E-BRIDGE-DISCONNECTED' }])
  })

  it('AC-604.4 포트가 던져도 번호로 답하고 줄이 멈추지 않는다', async () => {
    const h = harness()
    await h.open()
    h.handler.setPort({
      postMessage: () => {
        throw new Error('가상환자01')
      },
    })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.last('marked')).toMatchObject({ key: KEY_A, ok: false, code: 'E-BRIDGE-DISCONNECTED' })
    expectCodesOnly(h.last('marked').code)
  })

  it('AC-604.4 그 종류의 보기 모양이 없으면(읽기 실패) 그 종류 표시는 받아 저장하고 다른 종류의 표시도 지우지 않는다', async () => {
    const h = harness()
    h.plan()
    await h.stored(MARKED)
    await h.pieces(FOLLOWUP.pieces)
    await h.build() // 정기 주사 조각이 없어 정기 주사 보기 모양은 null
    expect(h.last('views').recall).toBeNull()
    h.handler.onScreen({ type: 'mark', key: 'r|vitamin-d|900202|2026-10-01', on: true, today: TODAY })
    expect(h.sent).toHaveLength(1)
    expect(h.saved(0).contact.marks).toEqual({
      'f|V0401|900101|2026-11-03': '2026-11-01',
      'r|vitamin-d|900301|2025-04-10': '2025-04-11',
      'r|vitamin-d|900302|2026-01-01': '2025-12-31',
      'r|vitamin-d|900202|2026-10-01': TODAY,
    })
  })

  it('AC-604.4 줄 열쇠가 아니거나 지금 보기 모양에 없는 줄은 저장하지 않고 거절한다', async () => {
    const h = harness()
    await h.open()
    const saves = h.sent.length
    for (const key of ['__proto__', 'constructor', 'f|V0|900101|2026-01-01', 'r|vitamin-d|900101|2020-01-01']) {
      h.handler.onScreen({ type: 'mark', key, on: true, today: TODAY })
      expect(h.last('marked')).toMatchObject({ key, ok: false, code: 'E-BRIDGE-REJECTED' })
    }
    expect(h.sent).toHaveLength(saves)
    expect(({} as Record<string, unknown>)[TODAY]).toBeUndefined()
  })
})

describe('크기 (AC-604.6)', () => {
  // 기록 한도(1,000자)대로 긴 글 × 많은 건의 10월 조각(파일로 두지 않는다). 합치면 30MB를 넘고, 뺄 기록이 모두 다시 읽는 기간(10월) 안에 있다
  const HUGE_COUNT = 10_500
  const HUGE_LOAD = { v: 1, marks: {}, recall: { from: '2026-10-01', readThrough: '2026-10-15', records: [] } }
  function hugeOctober(): TargetsReply {
    const october = INJECTION.pieces[INJECTION.pieces.length - 2]
    const text = '가'.repeat(1000)
    const rows = Array.from({ length: HUGE_COUNT }, (_, i) => ({ chart: String(900000 + i), date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }))
    return {
      ...october,
      chart: [october.chart[0], ...rows.map(({ chart, date }, i) => [`V${i + 1}`, chart, '가상환자01', text, date])],
      rx: [october.rx[0], ...rows.map(({ chart, date }) => ['A32', chart, date, '010-0000-0001'])],
    }
  }

  // 큰 10월 조각까지 읽고 첫 build의 저장이 나갈 때까지
  async function readHuge() {
    const h = harness()
    h.plan()
    const load = await h.stored(HUGE_LOAD)
    expect(load.recall).toEqual([
      { from: '2026-10-01', to: '2026-10-31' },
      { from: '2026-11-01', to: TODAY },
    ])
    await h.pieces(FOLLOWUP.pieces)
    await h.piece(hugeOctober())
    await h.pieces(INJECTION.pieces.slice(-1))
    await h.build()
    await until(() => h.sent.length === 1, 'send')
    return h
  }

  it('AC-604.6 뺀 기록이 다시 읽는 기간 안에 있어도 다시 build할 때 뺀 수가 늘지 않고 또 저장하지 않는다', { timeout: 120_000 }, async () => {
    const h = await readHuge()
    h.sentOk(0)
    const first = h.last('views').recall!.coverage
    expect(first.trimmed).toBeGreaterThan(0)
    expect(first.trimmed + first.records).toBe(HUGE_COUNT)
    expect(h.saved(0).contact.recall.records).toHaveLength(first.records)

    await h.build()
    await settle()
    expect(h.last('views').recall!.coverage).toEqual(first)
    await h.build()
    await settle()
    expect(h.last('views').recall!.coverage).toEqual(first)
    expect(h.sent).toHaveLength(1)
  })

  it('AC-604.6 기록 저장이 실패한 뒤 다시 build하면 또 저장해 보고 뺀 수는 그대로다', { timeout: 120_000 }, async () => {
    const h = await readHuge()
    h.sentFail(0, 'E-STORE-FAILED')
    const first = h.last('views').recall!.coverage
    expect(first.trimmed).toBeGreaterThan(0)
    expect(h.last('views').codes).toEqual({ store: 'E-STORE-FAILED' })

    await h.build()
    expect(h.sent).toHaveLength(2)
    expect(h.sent[1].payload === h.sent[0].payload).toBe(true)
    h.sentOk(1)
    expect(h.last('views').recall!.coverage).toEqual(first)
    expect(h.last('views').codes).toEqual({})
  })

  it('AC-604.6 같은 읽기에서 저장을 다시 불러오면 조각을 새 저장에 다시 합치고 뺀 수는 처음부터 센다', { timeout: 120_000 }, async () => {
    const h = await readHuge()
    h.sentOk(0)
    const first = h.last('views').recall!.coverage
    expect(first.trimmed).toBeGreaterThan(0)

    await h.stored(HUGE_LOAD)
    await h.build()
    await until(() => h.sent.length === 2, 'send')
    h.sentOk(1)
    expect(h.last('views').recall!.coverage).toEqual(first)
  })

  it('AC-604.3 같은 읽기에서 같은 달 조각을 다시 받으면 다음 build에 그 조각을 합쳐 저장한다', async () => {
    const h = harness()
    await h.open()
    const hasChart = (index: number, chart: string) => h.saved(index).contact.recall.records.some((r) => r.chart === chart)
    expect(hasChart(0, '900302')).toBe(true)

    const october = INJECTION.pieces[INJECTION.pieces.length - 2]
    await h.piece({ ...october, chart: october.chart.slice(0, 2), rx: october.rx.slice(0, 2) })
    await h.build()
    expect(h.sent).toHaveLength(2)
    expect(hasChart(1, '900204')).toBe(true)
    expect(hasChart(1, '900302')).toBe(false)
  })

  it('AC-604.6 30MB 넘는 기록을 합치면 coverage.trimmed > 0이고 records는 줄인 뒤 수, 저장 글자는 한도 안, 증상 글은 그대로', { timeout: 120_000 }, async () => {
    // 기록 한도(1,000자)대로 긴 글을 하나 만들어 나눠 쓴다. 파일로 두지 않는다
    const text = '가'.repeat(1000)
    const count = 10_500
    const records: RecallRecord[] = Array.from({ length: count }, (_, i) => ({
      chart: String(900000 + i),
      name: '가상환자01',
      date: `2025-${String(Math.floor(i / 1000) + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`,
      codes: ['A32'],
      text,
      phone: '',
    }))
    const contact = { v: 1, marks: {}, recall: { from: '2025-01-01', readThrough: '2026-10-15', records } }
    const h = harness()
    h.plan()
    await h.stored(contact)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces.slice(-2))
    await h.build()
    await until(() => h.sent.length === 1, 'send')

    const payload = h.sent[0].payload
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThanOrEqual(MAX_STORE_BYTES + Buffer.byteLength('{"contact":}'))
    const saved = JSON.parse(payload) as Saved
    h.sentOk(0)

    const coverage = h.last('views').recall!.coverage
    expect(coverage.trimmed).toBeGreaterThan(0)
    // 합치며 10월 조각의 기록 둘이 더해진다(900204·900302)
    expect(coverage.records).toBe(count + 2 - coverage.trimmed)
    expect(saved.contact.recall.records).toHaveLength(coverage.records)
    expect(coverage.from).toBe(saved.contact.recall.from)
    expect(saved.contact.recall.from! > '2025-01-01').toBe(true)
    expect(saved.contact.recall.records[0].date).toBe(saved.contact.recall.from)
    expect(saved.contact.recall.records.every((r) => r.date.startsWith('2026') || r.text.length === 1000)).toBe(true)
    expect(h.posted.some((m) => m.type === 'views' && m.recall === null)).toBe(false)

    // 같은 읽기에서 다시 build해도 뺀 수가 남고 또 저장하지 않는다
    await h.build()
    await settle()
    expect(h.last('views').recall!.coverage.trimmed).toBe(coverage.trimmed)
    expect(h.last('views').recall!.coverage.records).toBe(coverage.records)
    expect(h.sent).toHaveLength(1)
  })

  it('AC-604.6 [연락함] 저장도 fitStore를 거친다: 표시로 글자가 30MB를 넘으면 그 저장에서 오래된 기록을 빼고 안내도 바뀐다', { timeout: 120_000 }, async () => {
    const october = INJECTION.pieces.slice(-2)
    const ranged = october.map((p) => ({ range: { from: p.from, to: p.to }, chart: p.chart, rx: p.rx }))
    const long = '가'.repeat(1000)
    const row = (i: number, date: string, text: string): RecallRecord => ({ chart: String(900000 + i), name: '가상환자01', date, codes: ['A32'], text, phone: '' })
    const history = (records: RecallRecord[]) => ({ from: '2025-01-01', readThrough: '2026-10-15', records })
    // 합친 뒤의 저장 글자 크기
    const sized = (records: RecallRecord[]) =>
      Buffer.byteLength(JSON.stringify({ v: 1, marks: {}, recall: mergeRecall(history(records), ranged, RECALL_DEFAULTS, TODAY) }), 'utf8')

    // 합친 뒤 꼭 한도 10바이트 아래가 되게 맞춘다(표시 하나는 10바이트보다 크다). 맞추는 글은 기록 한도(1,000자) 안에서 나눠 넣는다
    const room = MAX_STORE_BYTES - 10
    const fillers = Array.from({ length: 4 }, (_, i) => row(90_000 + i, '2026-01-15', ''))
    const one = Buffer.byteLength(JSON.stringify(row(0, '2025-01-01', long)), 'utf8') + 1
    const count = Math.floor((room - sized(fillers)) / one)
    const records = Array.from({ length: count }, (_, i) => row(i, `2025-${String(Math.floor(i / 1000) + 1).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`, long))
    let rest = room - sized(fillers) - count * one
    for (const filler of fillers) {
      const part = Math.min(rest, 1000)
      filler.text = 'x'.repeat(part)
      rest -= part
    }
    expect(rest).toBe(0)
    const contact = { v: 1, marks: {}, recall: history([...records, ...fillers]) }
    expect(sized(contact.recall.records)).toBe(room)

    const h = harness()
    h.plan()
    await h.stored(contact)
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(october)
    await h.build()
    await until(() => h.sent.length === 1, 'send')
    h.sentOk(0)
    const first = h.last('views').recall!.coverage
    expect(first.trimmed).toBe(0)

    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.sent).toHaveLength(2)
    const saved = h.saved(1).contact
    expect(saved.marks).toEqual({ [KEY_A]: TODAY })
    expect(saved.recall.records).toHaveLength(first.records - 1)
    expect(saved.recall.from).toBe(saved.recall.records[0].date)
    expect(Buffer.byteLength(JSON.stringify(saved), 'utf8')).toBeLessThanOrEqual(MAX_STORE_BYTES)

    h.sentOk(1)
    const after = h.last('views').recall!.coverage
    expect(after.trimmed).toBe(1)
    expect(after.records).toBe(first.records - 1)
    expect(after.from).toBe(saved.recall.from)
  })
})

describe('보기 모양 거르기', () => {
  it('AC-604.3 filter: 원본 옮김으로 거른 줄과 복사 글', async () => {
    const h = harness()
    await h.open()
    h.handler.onScreen({ type: 'filter', tool: 'followup', filters: { kind: '', includeCond: false, includePast: false, from: '2026-11-03', to: '2026-11-03' } })
    const followup = h.last('filtered')
    expect(followup.tool).toBe('followup')
    expect(followup.rows.map((r) => r.key)).toEqual([KEY_A, KEY_B])
    expect(followup.copy.list).toContain('\tfu')

    h.handler.onScreen({ type: 'filter', tool: 'recall', filters: { from: TODAY, to: '2026-12-02', overdue: false } })
    const recall = h.last('filtered')
    expect(recall.tool).toBe('recall')
    expect(recall.rows.map((r) => r.key)).toEqual([KEY_C, 'r|vitamin-d|900203|2026-11-03'])
    expect(recall.copy.missingPhones).toBe(0)
  })

  it('AC-604.3 보기 모양이 없으면 빈 줄과 빈 복사 글(지어낸 줄 없음)', () => {
    const h = harness()
    h.handler.onScreen({ type: 'filter', tool: 'followup', filters: { kind: '', includeCond: false, includePast: false } })
    expect(h.last('filtered')).toEqual({ type: 'filtered', tool: 'followup', rows: [], undecided: [], copy: { list: '', listWithDate: '' } })
    h.handler.onScreen({ type: 'filter', tool: 'recall', filters: { from: null, to: null, overdue: true } })
    expect(h.last('filtered')).toEqual({ type: 'filtered', tool: 'recall', rows: [], copy: { list: '', phones: '', missingPhones: 0 } })
  })

  it('AC-604.3 고른 값 모양이 틀려도 죽지 않고 기본값으로 거른다', async () => {
    const h = harness()
    await h.open()
    h.handler.onScreen({ type: 'filter', tool: 'followup', filters: { kind: 3, from: 4, to: {} } })
    expect(h.last('filtered').rows.map((r) => r.key)).toContain(KEY_A)
    h.handler.onScreen({ type: 'filter', tool: 'followup' })
    expect(h.last('filtered').rows.map((r) => r.key)).toContain(KEY_A)
    h.handler.onScreen({ type: 'filter', tool: 'recall', filters: 'x' })
    expect(h.last('filtered').tool).toBe('recall')
  })
})

describe('이상한 값에도 멈추지 않는다', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const shaOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

  it('AC-604.1 시간이 지나 끝낸 조각은 메모리에서 지운다: 늦은 조각·end를 받지 않고 남은 요청이 없다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const digest = vi.spyOn(crypto.subtle, 'digest')
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    digest.mockClear()
    const p = FOLLOWUP.pieces[0]
    const text = JSON.stringify(p)
    const half = Math.ceil(text.length / 2)
    h.handler.onPort({ type: 'chunk', id: 'slow', seq: 0, data: text.slice(0, half) })
    h.handler.onScreen({ type: 'piece', id: 'slow', kind: p.kind, from: p.from, to: p.to })
    await vi.advanceTimersByTimeAsync(60_000)
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'slow', ok: false, code: 'E-BRIDGE-BAD-REPLY' })

    // 나머지가 맞는 값으로 늦게 와도 모으지도 검사하지도 않는다
    h.handler.onPort({ type: 'chunk', id: 'slow', seq: 1, data: text.slice(half) })
    h.handler.onPort({ type: 'end', id: 'slow', count: 2, bytes: Buffer.byteLength(text, 'utf8'), sha256: shaOf(text) })
    await settle()
    expect(digest).not.toHaveBeenCalled()
    expect(heldRequests()).toBe(0)
    expect(h.all('piece')).toHaveLength(1)
  })

  it('AC-604.1 시간이 지나 끝낸 store.load도 메모리에서 지우고, 늦은 조각·end는 받지 않으며 정기 주사만 번호로 끝난다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const digest = vi.spyOn(crypto.subtle, 'digest')
    const h = harness()
    h.plan()
    const text = JSON.stringify({ contact: FIRST })
    h.handler.onPort({ type: 'chunk', id: 'slow', seq: 0, data: text })
    h.handler.onScreen({ type: 'stored', id: 'slow' })
    await vi.advanceTimersByTimeAsync(60_000)
    await until(() => h.all('stored').length === 1, 'stored')
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-BRIDGE-BAD-REPLY', recall: [] })

    h.handler.onPort({ type: 'end', id: 'slow', count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: shaOf(text) })
    await settle()
    expect(digest).not.toHaveBeenCalled()
    expect(heldRequests()).toBe(0)
    expect(h.all('stored')).toHaveLength(1)
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: TODAY })
    expect(h.last('marked')).toMatchObject({ ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.3 end 뒤 검사가 끝나지 않아도 시간이 지나면 그 종류만 번호로 끝낸다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise<ArrayBuffer>(() => {}))
    const p = FOLLOWUP.pieces[0]
    h.deliver('stuck', p)
    h.handler.onScreen({ type: 'piece', id: 'stuck', kind: p.kind, from: p.from, to: p.to })
    await vi.advanceTimersByTimeAsync(60_000)
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'stuck', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-604.1 아무도 가져가지 않은 요청은 reload에서 지운다: 끝난 결과를 내주지 않고 오던 조각·end도 받지 않는다', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest')
    const h = harness()
    const p = FOLLOWUP.pieces[0]
    h.deliver('old-load', { contact: MARKED })
    h.deliver('old-piece', p)
    const text = JSON.stringify(p)
    h.handler.onPort({ type: 'chunk', id: 'old-open', seq: 0, data: text })
    await settle()
    digest.mockClear()

    h.handler.onScreen({ type: 'reload' })
    h.handler.onPort({ type: 'end', id: 'old-open', count: 1, bytes: Buffer.byteLength(text, 'utf8'), sha256: shaOf(text) })
    await settle()
    expect(digest).not.toHaveBeenCalled()

    h.handler.onScreen({ type: 'stored', id: 'old-load' })
    await until(() => h.all('stored').length === 1, 'stored')
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-BRIDGE-BAD-REPLY', recall: [] })
    h.handler.onScreen({ type: 'piece', id: 'old-piece', kind: p.kind, from: p.from, to: p.to })
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'old-piece', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    expect(heldRequests()).toBe(0)
  })

  it('AC-604.1 reload 뒤에 새로 온 요청은 그대로 쓴다', async () => {
    const h = harness()
    h.deliver('old', { contact: MARKED })
    await settle()
    h.handler.onScreen({ type: 'reload' })
    expect(await h.stored(FIRST)).toMatchObject({ ok: true })
    h.plan()
    expect((await h.piece(FOLLOWUP.pieces[0])).ok).toBe(true)
  })

  it('AC-604.3 __proto__·constructor 열쇠가 든 저장도 읽고 그대로 저장하며 줄 표시는 그대로다', async () => {
    const h = harness()
    const contact = JSON.parse('{"v":1,"marks":{"__proto__":"2026-11-01","constructor":"2026-11-01"},"recall":{"from":null,"readThrough":null,"records":[]}}') as unknown
    await h.open(contact)
    expect(Object.keys(h.saved(0).contact.marks).sort()).toEqual(['__proto__', 'constructor'])
    expect(h.last('views').followup?.rows.every((r) => !r.contacted)).toBe(true)
    expect(h.last('views').counts).toEqual({ followup_left: 2, injection_left: 3 })
  })

  it('AC-604.3 차트번호 constructor 줄: 전화를 하나도 못 불렀어도 전화는 글자이고 건수가 정수다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    const [p0, ...rest] = FOLLOWUP.pieces
    const odd = {
      ...p0,
      chart: [p0.chart[0], ['V9', 'constructor', '가상환자09', '내일 재내원', '2026-11-02']],
      rx: [['차트번호']],
    }
    // 머리 줄이 달라지지 않게 나머지도 전화 칸 없이 준다
    await h.piece(odd)
    await h.pieces(rest.map((p) => ({ ...p, rx: [['차트번호']] })))
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    const views = h.last('views')
    expect(views.followup?.phoneLoaded).toBe(false)
    expect(views.followup?.rows.every((r) => typeof r.phone === 'string')).toBe(true)
    expect(views.recall?.rows.every((r) => typeof r.phone === 'string')).toBe(true)
    expect(Number.isInteger(views.counts?.followup_left)).toBe(true)
  })

  it('AC-604.3 끝나지 않는 조각(end·abort가 안 옴)은 그 종류만 번호로 끝낸다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    const p = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', id: 'never', kind: p.kind, from: p.from, to: p.to })
    await settle()
    expect(h.all('piece')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(59_999)
    await settle()
    expect(h.all('piece')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'never', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
  })

  it('AC-604.3 끝나지 않는 store.load도 정기 주사만 번호로 끝낸다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const h = harness()
    h.plan()
    h.handler.onScreen({ type: 'stored', id: 'never' })
    await vi.advanceTimersByTimeAsync(60_000)
    await until(() => h.all('stored').length === 1, 'stored')
    expect(h.last('stored')).toEqual({ type: 'stored', ok: false, code: 'E-BRIDGE-BAD-REPLY', recall: [] })
  })

  it('AC-604.3 build는 진행 중인 조각이 끝난 뒤에 만든다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    await h.pieces(FOLLOWUP.pieces.slice(0, 3))
    const last = FOLLOWUP.pieces[3]
    h.handler.onScreen({ type: 'piece', id: 'late', kind: last.kind, from: last.from, to: last.to })
    h.handler.onScreen({ type: 'build', today: TODAY })
    await settle()
    expect(h.all('views')).toHaveLength(0)
    h.deliver('late', last)
    await until(() => h.all('views').length === 1, 'views')
    expect(h.last('views').followup?.rows).toHaveLength(7)
  })

  it('AC-604.3 새 plan 뒤에 끝난 옛 조각은 쓰지 않고 답만 한다', async () => {
    const h = harness()
    h.plan()
    const p = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', id: 'old', kind: p.kind, from: p.from, to: p.to })
    h.plan()
    h.deliver('old', p)
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toMatchObject({ id: 'old', ok: false })
    await h.pieces(FOLLOWUP.pieces.slice(1))
    await h.build()
    expect(h.last('views').followup).toBeNull()
    expect(h.last('views').codes.followup).toBe('E-BRIDGE-BAD-REPLY')
  })

  it('AC-604.3 새 plan은 앞 읽기의 실패 번호를 지운다', async () => {
    const h = harness()
    h.plan()
    await h.stored(FIRST)
    const first = FOLLOWUP.pieces[0]
    h.handler.onScreen({ type: 'piece', kind: first.kind, from: first.from, to: first.to, code: 'E-BIT-READ-FAILED' })
    h.plan()
    await h.pieces(FOLLOWUP.pieces)
    await h.pieces(INJECTION.pieces)
    await h.build()
    h.sentOk(0)
    expect(h.last('views').codes).toEqual({})
    expect(h.last('views').followup).not.toBeNull()
  })

  it('AC-604.3 오늘 값이 날짜가 아니면 번호로 답한다(plan·build)', async () => {
    const h = harness()
    h.handler.onScreen({ type: 'plan', today: '어제' })
    expect(h.last('plan')).toEqual({ type: 'plan', followup: [], recall: null, code: 'E-BRIDGE-BAD-REPLY' })
    h.handler.onScreen({ type: 'build', today: 3 })
    await until(() => h.all('views').length === 1, 'views')
    expect(h.last('views')).toEqual({
      type: 'views',
      followup: null,
      recall: null,
      counts: null,
      codes: { followup: 'E-BRIDGE-BAD-REPLY', recall: 'E-BRIDGE-BAD-REPLY' },
    })
  })

  it('AC-604.3 모양이 틀린 메시지는 던지지 않고 무시하거나 번호로 답한다', async () => {
    const h = harness()
    for (const message of [null, undefined, 3, 'x', [], {}, { type: 'nope' }]) {
      expect(() => h.handler.onScreen(message)).not.toThrow()
      expect(() => h.handler.onPort(message)).not.toThrow()
    }
    expect(() => h.handler.onPort({ type: 'chunk', id: 3, seq: 0, data: 'x' })).not.toThrow()
    expect(() => h.handler.onPort({ type: 'end' })).not.toThrow()
    expect(() => h.handler.onPort({ type: 'abort' })).not.toThrow()

    h.handler.onScreen({ type: 'mark', on: 'x' })
    expect(h.last('marked')).toMatchObject({ ok: false })

    await h.stored(FIRST)
    h.handler.onScreen({ type: 'mark', key: 3, on: true, today: TODAY })
    expect(h.last('marked')).toMatchObject({ key: '', ok: false, code: 'E-BRIDGE-REJECTED' })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: 'x', today: TODAY })
    expect(h.last('marked')).toMatchObject({ key: KEY_A, ok: false, code: 'E-BRIDGE-REJECTED' })
    h.handler.onScreen({ type: 'mark', key: KEY_A, on: true, today: '어제' })
    expect(h.last('marked')).toMatchObject({ key: KEY_A, ok: false, code: 'E-BRIDGE-REJECTED' })

    h.handler.onScreen({ type: 'piece', id: 'k', kind: 'other', from: 'a', to: 'b' })
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'k', ok: false, code: 'E-BRIDGE-REJECTED' })
    expect(h.sent).toHaveLength(0)
  })

  it('AC-604.1 abort의 번호가 번호 모양이 아니면 그대로 넘기지 않는다', async () => {
    const h = harness()
    h.plan()
    const p = FOLLOWUP.pieces[0]
    h.handler.onPort({ type: 'abort', id: 'x', code: '가상환자01' })
    h.handler.onScreen({ type: 'piece', id: 'x', kind: p.kind, from: p.from, to: p.to })
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'x', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
    expect(CODE.test(String(h.last('piece').code))).toBe(true)
  })

  it('AC-604.1 조각 칸 모양이 틀리면 그 요청을 끝내고 반쪽 자료를 쓰지 않는다', async () => {
    const h = harness()
    h.plan()
    const p = FOLLOWUP.pieces[0]
    h.handler.onPort({ type: 'chunk', id: 'x', seq: 0, data: 3 })
    h.handler.onScreen({ type: 'piece', id: 'x', kind: p.kind, from: p.from, to: p.to })
    await until(() => h.all('piece').length === 1, 'piece')
    expect(h.last('piece')).toEqual({ type: 'piece', id: 'x', ok: false, code: 'E-BRIDGE-BAD-REPLY' })
  })
})
