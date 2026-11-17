import { BridgeError, isErrorCode, isRecord } from '@/lib/bridge/protocol'
import { buildLedger, closeLocal, dayTotals, ledgerDoctors, reopenLocal } from '@/lib/sunap/ledger'
import type { LedgerRow, LedgerSettings, SunapLocalDay, SunapReply } from '@/types/sunap'
import { createAssembler, type AssembleResult } from '../patients/assemble'
import type { SunapLedgerView, SunapOp, SunapPatch, SunapWorkerMessage } from './messages'
import {
  applyEdit,
  BAD_REPLY,
  own,
  readLoad,
  readLocalDay,
  readPatch,
  readReply,
  readStoreMonth,
  readStreamRef,
  REJECTED,
  withDay,
} from './read'

// 수납일지 장부 Worker 메시지(spec sunap-ilji design.md 'Worker 메시지', REQ-4904) [환자 자료 구역]. sunap.worker.ts가 잇기만 하고 시험은 이 함수를 바로 부른다.
// 화면으로 가는 것은 장부 보기(ledger)·마감 숫자(closed)·오류 번호(error)뿐이다. 조각 글자와 store.save 글자는 통로 포트로만 오간다(AC-4904.4).
// PC 저장은 한 번에 하나만 보내고, 됐다는 답(sent ok)이 온 뒤에만 메모리에 넣고 장부를 다시 보낸다. 실패하면 PC 저장도 메모리도 그 전 그대로다

const STORE_FAILED = 'E-STORE-FAILED'
const DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
// 포트의 end는 화면이 load를 보내기 전에 이미 떠났다. 이만큼 안 오면 오지 않는 것으로 친다
const TAKE_WAIT_MS = 60_000

type Port = { postMessage(message: unknown): void }
type Rec = Record<string, unknown>

// 불러온 날 하나. bit = 고친 칸 없는 장부 줄(비트 값, 차트번호 열쇠). month = 그 달 sunap 칸 전체(다른 날 값 포함, store.save가 칸째 바꾼다)
type Session = {
  epoch: number
  day: string
  month: string
  settings: LedgerSettings
  reply: SunapReply
  bit: Map<string, LedgerRow>
  stored: Rec
  local: SunapLocalDay
}
type Job = { op: 'edit'; chart: string; patch: SunapPatch } | { op: 'close'; now: Date } | { op: 'reopen' }
type Flight = { ticket: number; op: SunapOp; epoch: number; local: SunapLocalDay; stored: Rec }

// 번호가 있는 오류는 그 번호, 나머지는 글(환자 값이 섞일 수 있다)을 버리고 기본 번호
const codeOf = (error: unknown, fallback = BAD_REPLY) => (error instanceof BridgeError ? error.code : fallback)

export function createHandler(deps: { post(message: unknown): void }) {
  const post = (message: SunapWorkerMessage) => deps.post(message)
  const postError = (op: SunapOp, code: string) => post({ type: 'error', op, code })
  const assembler = createAssembler()
  let port: Port | null = null

  // load마다 늘린다. 그 전 load의 답·그 전 날의 저장 답은 메모리에 넣지 않는다
  let epoch = 0
  let session: Session | null = null
  let queue: Job[] = []
  let flight: Flight | null = null
  let tickets = 0

  function takeInTime(id: string): Promise<AssembleResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // 모으던 글자를 지우고 늦은 조각·end를 받지 않는다
        assembler.abort(id, BAD_REPLY)
        resolve({ ok: false, code: BAD_REPLY })
      }, TAKE_WAIT_MS)
      void assembler.take(id).then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  // 처음·고침·마감·풀기 모두 여기서 보낸다: 원장님별 수도 고친 값(Block·물리치료)이 든 장부로 센다(spec sunap-doctors AC-5003.2)
  function postLedger(current: Session): SunapLedgerView {
    const ledger = buildLedger(current.reply, current.local, current.settings)
    const view: SunapLedgerView = { ...ledger, totals: dayTotals(ledger, current.settings.kinds), doctors: ledgerDoctors(ledger) }
    post({ type: 'ledger', ...view })
    return view
  }

  // ── 불러오기(AC-4904.1) ───────────────────────────────

  function onLoad(m: Rec) {
    epoch++
    const asked = epoch
    session = null
    // 앞 날에 하려던 일은 보내지 않는다(그 날 장부를 이제 들고 있지 않다)
    const dropped = queue
    queue = []
    for (const job of dropped) postError(job.op, REJECTED)

    const refs = [readStreamRef(m.targets), readStreamRef(m.store)]
    // 표가 맞으면 나머지가 틀려도 그 답을 가져가 메모리에서 지운다
    const takes = refs.map((ref) =>
      ref && 'id' in ref ? takeInTime(ref.id) : Promise.resolve<AssembleResult>({ ok: false, code: ref?.code ?? REJECTED }),
    )
    const ask = readLoad(m)
    const [targets, store] = refs
    if (!ask || !targets || !store) return postError('load', REJECTED)

    void Promise.all(takes).then(([bit, saved]) => {
      if (asked !== epoch) return // 새 load가 앞섰다. 그쪽이 답한다
      if (!bit.ok) return postError('load', bit.code)
      if (!saved.ok) return postError('load', saved.code)
      try {
        const reply = readReply(bit.json, ask.day)
        const stored = readStoreMonth(saved.json, ask.month)
        const local = readLocalDay(own(stored, ask.day))
        const settings: LedgerSettings = { kinds: ask.kinds, blockDef: ask.blockDef, ptDef: ask.ptDef }
        const bitRows = buildLedger(reply, {}, settings).rows
        session = {
          epoch: asked,
          day: ask.day,
          month: ask.month,
          settings,
          reply,
          bit: new Map(bitRows.map((row) => [row.chart, row])),
          stored,
          local,
        }
        postLedger(session)
      } catch (error) {
        session = null
        postError('load', codeOf(error))
      }
    })
  }

  // ── 고치기·마감·풀기(AC-4904.2·4904.3): 저장 줄 ─────────

  function onEdit(m: Rec) {
    const patch = readPatch(m.patch)
    const { chart } = m
    if (!session || typeof chart !== 'string' || !session.bit.has(chart) || !patch) return postError('edit', REJECTED)
    queue.push({ op: 'edit', chart, patch })
    pump()
  }

  function onClose(m: Rec) {
    const { now } = m
    const at = typeof now === 'number' && Number.isFinite(now) ? new Date(now) : null
    if (!session || !at || Number.isNaN(at.getTime())) return postError('close', REJECTED)
    queue.push({ op: 'close', now: at })
    pump()
  }

  function onReopen() {
    if (!session) return postError('reopen', REJECTED)
    queue.push({ op: 'reopen' })
    pump()
  }

  // 지금 PC 저장 위에 그 일을 한 그날 값. 받을 수 없으면 null(마감한 날 고치기)
  function nextLocal(current: Session, job: Job): SunapLocalDay | null {
    if (job.op === 'edit') {
      if (current.local.closedAt !== undefined) return null
      return applyEdit(current.local, job.chart, job.patch, current.bit.get(job.chart)!)
    }
    if (job.op === 'close') return closeLocal(current.local, buildLedger(current.reply, current.local, current.settings), job.now)
    return reopenLocal(current.local)
  }

  function pump() {
    while (!flight && queue.length > 0) {
      const job = queue.shift()!
      const current = session
      let local: SunapLocalDay | null = null
      try {
        local = current ? nextLocal(current, job) : null
      } catch {
        local = null
      }
      if (!current || !local) {
        postError(job.op, REJECTED)
        continue
      }
      const stored = withDay(current.stored, current.day, local)
      const ticket = ++tickets
      flight = { ticket, op: job.op, epoch: current.epoch, local, stored }
      try {
        if (!port) throw new BridgeError(DISCONNECTED)
        // store.save는 보낸 칸만 바꾼다: month와 그 달 sunap 전체만 보낸다(drafts·done·journal은 그대로)
        port.postMessage({ type: 'send', ticket, cmd: 'store.save', payload: JSON.stringify({ month: current.month, sunap: stored }) })
      } catch {
        settle(false, DISCONNECTED)
      }
    }
  }

  // 지금 나간 저장의 답
  function settle(ok: boolean, code: string) {
    const done = flight
    if (!done) return
    flight = null
    if (!ok) postError(done.op, code)
    else if (session && session.epoch === done.epoch) {
      session = { ...session, local: done.local, stored: done.stored }
      try {
        const view = postLedger(session)
        if (done.op === 'close') post({ type: 'closed', day: session.day, totals: view.totals, late: view.late })
      } catch {
        postError(done.op, BAD_REPLY)
      }
    }
    pump()
  }

  function route(message: unknown) {
    if (!isRecord(message)) return
    switch (message.type) {
      case 'load':
        return onLoad(message)
      case 'edit':
        return onEdit(message)
      case 'close':
        return onClose(message)
      case 'reopen':
        return onReopen()
    }
  }

  function routePort(message: unknown) {
    if (!isRecord(message)) return
    const { type, id } = message
    if (type === 'sent') {
      if (flight && message.ticket === flight.ticket) settle(message.ok === true, isErrorCode(message.code) ? message.code : STORE_FAILED)
      return
    }
    if (typeof id !== 'string') return
    if (type === 'chunk') {
      if (typeof message.seq === 'number' && typeof message.data === 'string') assembler.chunk(id, message.seq, message.data)
      else assembler.abort(id, BAD_REPLY)
    } else if (type === 'end') {
      if (typeof message.count === 'number' && typeof message.bytes === 'number' && typeof message.sha256 === 'string') {
        assembler.end(id, message.count, message.bytes, message.sha256)
      } else assembler.abort(id, BAD_REPLY)
    } else if (type === 'abort') {
      assembler.abort(id, isErrorCode(message.code) ? message.code : BAD_REPLY)
    }
  }

  return {
    onScreen(message: unknown): void {
      try {
        route(message)
      } catch {
        // 메시지 하나로 Worker가 멈추지 않는다. 오류 글에는 환자 값이 섞일 수 있어 어디에도 싣지 않는다
      }
    },

    onPort(message: unknown): void {
      try {
        routePort(message)
      } catch {
        // onScreen과 같다
      }
    },

    // 새 포트를 받으면 옛 포트의 답은 오지 않는다. 줄이 멈추지 않게 지금 저장은 실패로 친다
    setPort(next: Port): void {
      port = next
      if (flight) settle(false, DISCONNECTED)
    },
  }
}
