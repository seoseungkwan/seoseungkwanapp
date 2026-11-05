import { isYmd } from '@/lib/analytics/dates'
import { BridgeError, isErrorCode, isRecord } from '@/lib/bridge/protocol'
import { RECALL_DEFAULTS } from '@/lib/patients/recall'
import { PatientsSourceError } from '@/lib/patients/sourceError'
import type { ContactStoreData, FollowupFilters, FollowupView, PatientsRange, PatientsWorkerMessage, RecallFilters, RecallHistory, RecallView, ViewCodes } from '@/types/patients'
import { createAssembler, type AssembleResult } from './assemble'
import {
  buildFollowup,
  buildRecall,
  contactCounts,
  filterFollowup,
  filterRecall,
  fitStore,
  followupPhones,
  mergeRecall,
  pruneMarks,
  readStoreReply,
  readTargets,
  setMark,
  storePayload,
  withMarks,
} from './jobs'
import { followupPlan, recallPlan } from './plan'

// 환자 탭 Worker 메시지(design.md 'Worker 메시지 약속') [환자 자료 구역]. patients.worker.ts가 잇기만 하고 시험은 이 함수를 바로 부른다.
// 화면으로 가는 것은 보기 모양·복사 글·건수·오류 번호뿐이다. 조각 글자와 store.save 글자는 포트로만 오간다(AC-604.4).
// 오류 글은 싣지 않는다(번호만). 어떤 답이 틀려도 그 종류만 실패하고 Worker는 산다

const BAD_REPLY = 'E-BRIDGE-BAD-REPLY'
const STORE_FAILED = 'E-STORE-FAILED'
const DISCONNECTED = 'E-BRIDGE-DISCONNECTED'
const REJECTED = 'E-BRIDGE-REJECTED'
// 포트의 end는 화면이 piece를 보내기 전에 이미 떠났다. 이만큼 안 오면 오지 않는 것으로 치고 그 종류를 끝낸다
const TAKE_WAIT_MS = 60_000

const RULES = RECALL_DEFAULTS

type Port = { postMessage(message: unknown): void }
type Piece = { range: PatientsRange; chart: string[][]; rx: string[][] }
type ViewKind = 'followup' | 'recall'
type Job = { kind: 'mark'; key: string; on: boolean; today: string } | { kind: 'history'; cycle: number }
// base: 글자를 만들 때의 메모리 기록. 답을 기다리는 사이 build가 기록을 합쳤으면 그 답으로 되돌리지 않는다
type Flight = { ticket: number; batch: Job[]; store: ContactStoreData; base: RecallHistory; trimmed: number; epoch: number }

const rangeKey = (from: string, to: string) => `${from}|${to}`
const isDay = (x: unknown): x is string => typeof x === 'string' && isYmd(x)
const noop = () => {}

// 번호가 있는 오류는 그 번호, 나머지는 글(환자 값이 섞일 수 있다)을 버리고 기본 번호
function codeOf(error: unknown, fallback = BAD_REPLY): string {
  if (error instanceof PatientsSourceError || error instanceof BridgeError) return error.code
  return fallback
}

function followupFilters(x: unknown): FollowupFilters {
  const f = isRecord(x) ? x : {}
  return {
    kind: f.kind === '주사' || f.kind === 'F/U' ? f.kind : '',
    from: typeof f.from === 'string' ? f.from : undefined,
    to: typeof f.to === 'string' ? f.to : undefined,
    includeCond: f.includeCond === true,
    includePast: f.includePast === true,
  }
}

function recallFilters(x: unknown): RecallFilters {
  const f = isRecord(x) ? x : {}
  return {
    from: typeof f.from === 'string' ? f.from : null,
    to: typeof f.to === 'string' ? f.to : null,
    overdue: f.overdue === true,
  }
}

export function createHandler(deps: { post(message: unknown): void }) {
  const post = (message: PatientsWorkerMessage) => deps.post(message)
  const assembler = createAssembler()
  let port: Port | null = null
  let today: string | null = null

  // 읽기 한 번(plan·reload에서 새로 시작한다). 그 전에 시작한 조각의 결과는 쓰지 않는다
  let cycle = 0
  let planned: { followup: PatientsRange[] | null; recall: PatientsRange[] | null } = { followup: null, recall: null }
  let pieces: Record<ViewKind, Map<string, Piece>> = { followup: new Map(), recall: new Map() }
  // 이번 읽기에서 실패한 조각의 번호(새 읽기까지 남는다). 보기 모양의 번호(codes)는 build마다 여기서 시작한다
  let pieceCodes: Pick<ViewCodes, ViewKind> = {}
  let codes: ViewCodes = {}
  // 이 store에 fitStore가 뺀 기록 수(저장을 다시 읽거나 새 읽기면 0)
  let trimmed = 0
  // 이 store에 이미 합친 조각. 다시 build할 때 또 합치면 뺀 기록이 되살아나 다시 빠지면서 뺀 수가 두 번 세어진다
  let mergedPieces = new WeakSet<Piece>()

  // 저장 상태(AC-604.8). 'loaded'가 아니면 어떤 경우에도 store.save를 보내지 않는다
  let saveState: 'unknown' | 'loaded' | 'failed' = 'unknown'
  let storeCode: string | undefined
  let store: ContactStoreData | null = null
  // 저장을 다시 읽기 시작할 때마다(reload·stored) 늘린다. 그 전 stored의 결과는 믿지 않고, 그 전 저장의 답은 메모리에 넣지 않는다
  let epoch = 0
  // 메모리의 기록이 PC 저장과 다르다
  let historyDirty = false

  let views: { followup: FollowupView | null; recall: RecallView | null } = { followup: null, recall: null }
  let recallPhoneTable: Record<string, string> = Object.create(null)

  // 저장 줄(AC-604.4): 한 번에 하나만 보낸다
  let queue: Job[] = []
  let flight: Flight | null = null
  let tickets = 0

  // 진행 중인 take. build는 이것들이 끝난 뒤에 만든다
  const working = new Set<Promise<unknown>>()
  const track = (job: Promise<unknown>) => {
    const tracked: Promise<unknown> = job.catch(noop).finally(() => working.delete(tracked))
    working.add(tracked)
  }

  function takeInTime(id: string): Promise<AssembleResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // 모으던 글자를 지우고 늦은 조각·end를 받지 않는다. end 뒤 검사 중이면 abort가 듣지 않으니(검사가 끝나면 지워진다) 답은 여기서 바로 한다
        assembler.abort(id, BAD_REPLY)
        resolve({ ok: false, code: BAD_REPLY })
      }, TAKE_WAIT_MS)
      void assembler.take(id).then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  const counts = () =>
    saveState === 'loaded' && today && views.followup?.marksLoaded && views.recall ? contactCounts(views.followup, views.recall, today) : null

  const postViews = () => post({ type: 'views', followup: views.followup, recall: views.recall, counts: counts(), codes: { ...codes } })

  const replyMark = (key: string, ok: boolean, code?: string) => post({ type: 'marked', key, ok, ...(ok ? {} : { code }), counts: counts() })

  // ── 저장 줄 ───────────────────────────────────────────

  function failQueued(code: string) {
    const jobs = queue
    queue = []
    for (const job of jobs) if (job.kind === 'mark') replyMark(job.key, false, code)
  }

  function pump() {
    if (flight || !queue.length) return
    if (saveState !== 'loaded' || !store) return failQueued(storeCode ?? STORE_FAILED)
    const batch = queue
    queue = []
    const ticket = ++tickets
    // 글자를 못 만들거나 못 보내도 같은 길로 실패를 답해 줄이 멈추지 않는다
    flight = { ticket, batch, store, base: store.recall, trimmed: 0, epoch }
    try {
      let current = store
      for (const job of batch) if (job.kind === 'mark') current = setMark(current, job.key, job.on, job.today)
      const fit = fitStore({ ...current, marks: pruneMarks(current.marks, views, today ?? '') })
      flight = { ...flight, store: fit.store, trimmed: fit.trimmed }
      if (!port) throw new BridgeError(DISCONNECTED)
      port.postMessage({ type: 'send', ticket, cmd: 'store.save', payload: storePayload(fit.store) })
    } catch {
      settle(false, DISCONNECTED)
    }
  }

  function refreshViews(extraTrimmed: number) {
    if (!store) return
    if (views.followup) views = { ...views, followup: withMarks(views.followup, store.marks) }
    if (!views.recall) return
    // 표시가 늘어 기록을 더 뺐으면 줄도 다시 만든다
    const recall = extraTrimmed > 0 && today ? buildRecall(store.recall, RULES, store.marks, recallPhoneTable, today, trimmed) : withMarks(views.recall, store.marks)
    views = { ...views, recall }
  }

  // 지금 나간 저장의 답(sent) 처리
  function settle(ok: boolean, code: string) {
    const done = flight
    if (!done) return
    flight = null
    const current = done.epoch === epoch
    if (current && ok && store) {
      const sameHistory = store.recall === done.base
      store = { ...store, marks: done.store.marks, recall: sameHistory ? done.store.recall : store.recall }
      if (sameHistory) {
        historyDirty = false
        trimmed += done.trimmed
      }
      delete codes.store
      refreshViews(sameHistory ? done.trimmed : 0)
    }
    const marks = done.batch.filter((job) => job.kind === 'mark')
    const history = done.batch.filter((job) => job.kind === 'history')
    if (current && !ok && history.length) codes.store = code
    for (const job of marks) replyMark(job.key, ok, code)
    const owedBuild = current && history.some((job) => job.cycle === cycle)
    if (owedBuild || (current && ok && marks.length)) postViews()
    pump()
  }

  // ── 저장 불러오기 ─────────────────────────────────────

  // 다시 읽는 동안은 저장을 막고, 줄에서 기다리던 표시는 나가지 않게 실패로 답한다
  function beginLoad() {
    epoch++
    saveState = 'unknown'
    storeCode = undefined
    store = null
    historyDirty = false
    trimmed = 0
    mergedPieces = new WeakSet()
    planned = { ...planned, recall: null }
    failQueued(STORE_FAILED)
  }

  function failLoad(code: string) {
    saveState = 'failed'
    storeCode = code
    post({ type: 'stored', ok: false, code, recall: [] })
  }

  function onStored(m: Record<string, unknown>) {
    beginLoad()
    if (typeof m.id !== 'string') return failLoad(isErrorCode(m.code) ? m.code : STORE_FAILED)
    const asked = epoch
    track(
      takeInTime(m.id).then((result) => {
        if (asked !== epoch) return // reload·새 stored가 앞섰다. 그쪽 답이 온다
        if (!result.ok) return failLoad(result.code)
        try {
          const loaded = readStoreReply(result.json)
          planned = { ...planned, recall: today ? recallPlan(loaded.recall, RULES, today) : null }
          store = loaded
          saveState = 'loaded'
          // 옛 저장으로 만든 보기 모양으로 새 저장의 표시를 지우지 않는다(build가 새로 만들 때까지 없는 것으로 친다)
          views = { followup: null, recall: null }
          post({ type: 'stored', ok: true, recall: planned.recall ?? [] })
        } catch (error) {
          failLoad(codeOf(error))
        }
      }),
    )
  }

  // ── 읽기 ──────────────────────────────────────────────

  function startCycle() {
    cycle++
    pieces = { followup: new Map(), recall: new Map() }
    pieceCodes = {}
    codes = {}
    trimmed = 0
  }

  function onPlan(m: Record<string, unknown>) {
    const day = m.today
    try {
      if (!isDay(day)) throw new BridgeError(BAD_REPLY)
      const followup = followupPlan(day)
      const recall = saveState === 'loaded' && store ? recallPlan(store.recall, RULES, day) : null
      startCycle()
      today = day
      planned = { followup, recall }
      post({ type: 'plan', followup, recall })
    } catch (error) {
      post({ type: 'plan', followup: [], recall: null, code: codeOf(error) })
    }
  }

  function onPiece(m: Record<string, unknown>) {
    const { id, kind, from, to } = m
    const replyId = typeof id === 'string' ? id : null
    const viewKind: ViewKind | null = kind === 'followup' ? 'followup' : kind === 'injection' ? 'recall' : null
    if (!viewKind || typeof from !== 'string' || typeof to !== 'string') {
      post({ type: 'piece', id: replyId, ok: false, code: REJECTED })
      return
    }
    const asked = cycle
    const fail = (code: string) => {
      if (asked === cycle) pieceCodes[viewKind] ??= code
      post({ type: 'piece', id: replyId, ok: false, code })
    }
    // 스트림이 거절되면 화면은 id 없이 받은 번호를 알린다(번호 모양일 때만 믿는다)
    if (replyId === null || m.code !== undefined) return fail(isErrorCode(m.code) ? m.code : BAD_REPLY)
    track(
      takeInTime(replyId).then((result) => {
        if (!result.ok) return fail(result.code)
        if (asked !== cycle) return fail(BAD_REPLY)
        try {
          const tables = readTargets(result.json, { kind: kind as 'followup' | 'injection', from, to })
          pieces[viewKind].set(rangeKey(from, to), { range: { from, to }, ...tables })
          post({ type: 'piece', id: replyId, ok: true })
        } catch (error) {
          fail(codeOf(error))
        }
      }),
    )
  }

  // 그 종류의 조각을 계획 차례로. 하나라도 없으면 null(반쪽 자료를 쓰지 않는다)
  function piecesOf(kind: ViewKind): Piece[] | null {
    const ranges = planned[kind]
    if (!ranges) return null
    const found = ranges.map((r) => pieces[kind].get(rangeKey(r.from, r.to)))
    return found.every((piece): piece is Piece => piece !== undefined) ? found : null
  }

  function makeFollowup(day: string): { view: FollowupView | null; phones: Record<string, string> } {
    const none = { view: null, phones: Object.create(null) as Record<string, string> }
    if (codes.followup) return none
    const list = piecesOf('followup')
    if (!list) {
      codes.followup = BAD_REPLY
      return none
    }
    try {
      const loaded = saveState === 'loaded' && store
      const view = buildFollowup(list, loaded ? store!.marks : Object.create(null), day)
      return { view: { ...view, marksLoaded: !!loaded }, phones: followupPhones(list) }
    } catch (error) {
      codes.followup = codeOf(error)
      return none
    }
  }

  function makeRecall(day: string, phones: Record<string, string>): RecallView | null {
    if (saveState !== 'loaded' || !store) {
      codes.recall = storeCode ?? STORE_FAILED
      return null
    }
    if (codes.recall) return null
    const list = piecesOf('recall')
    if (!list) {
      codes.recall = BAD_REPLY
      return null
    }
    try {
      const fresh = list.filter((piece) => !mergedPieces.has(piece))
      const merged = mergeRecall(store.recall, fresh, RULES, day)
      const fit = fitStore({ ...store, recall: merged })
      const view = buildRecall(fit.store.recall, RULES, fit.store.marks, phones, day, trimmed + fit.trimmed)
      if (JSON.stringify(fit.store.recall) !== JSON.stringify(store.recall)) historyDirty = true
      store = fit.store
      trimmed += fit.trimmed
      for (const piece of fresh) mergedPieces.add(piece)
      recallPhoneTable = phones
      return view
    } catch (error) {
      codes.recall = codeOf(error)
      return null
    }
  }

  function runBuild(day: string) {
    today = day
    codes = { ...pieceCodes }
    const followup = makeFollowup(day)
    views = { followup: followup.view, recall: makeRecall(day, followup.phones) }
    if (saveState === 'loaded' && historyDirty) {
      // 줄에 넣고, 그 저장의 답이 온 뒤 views를 보낸다
      queue.push({ kind: 'history', cycle })
      pump()
      return
    }
    postViews()
  }

  function onBuild(m: Record<string, unknown>) {
    const day = m.today
    if (!isDay(day)) {
      post({ type: 'views', followup: null, recall: null, counts: null, codes: { followup: BAD_REPLY, recall: BAD_REPLY } })
      return
    }
    const asked = cycle
    void Promise.all([...working])
      .then(() => {
        if (asked === cycle) runBuild(day) // 그 사이 새 읽기가 시작됐으면 그쪽 build가 답한다
      })
      .catch(noop)
  }

  // ── 고르기·표시 ───────────────────────────────────────

  function onFilter(m: Record<string, unknown>) {
    if (m.tool === 'followup') {
      const out = views.followup ? filterFollowup(views.followup, followupFilters(m.filters)) : { rows: [], undecided: [], copy: { list: '', listWithDate: '' } }
      post({ type: 'filtered', tool: 'followup', ...out })
    } else if (m.tool === 'recall') {
      const out = views.recall && today ? filterRecall(views.recall, recallFilters(m.filters), today) : { rows: [], copy: { list: '', phones: '', missingPhones: 0 } }
      post({ type: 'filtered', tool: 'recall', ...out })
    }
  }

  // 지금 보기 모양에 있는 줄만 표시할 수 있다. 그 종류의 보기 모양이 없으면 표시는 그대로 두는 규칙이라 받는다
  function knownKey(key: string): boolean {
    const view = key.startsWith('f|') ? views.followup : key.startsWith('r|') ? views.recall : undefined
    if (view === undefined) return false
    return view === null || view.rows.some((row) => row.key === key)
  }

  function onMark(m: Record<string, unknown>) {
    const { key, on, today: day } = m
    const replyKey = typeof key === 'string' ? key : ''
    if (saveState !== 'loaded') return replyMark(replyKey, false, storeCode ?? STORE_FAILED)
    if (typeof key !== 'string' || typeof on !== 'boolean' || !isDay(day) || !knownKey(key)) return replyMark(replyKey, false, REJECTED)
    queue.push({ kind: 'mark', key, on, today: day })
    pump()
  }

  function route(message: unknown) {
    if (!isRecord(message)) return
    switch (message.type) {
      case 'plan':
        return onPlan(message)
      case 'piece':
        return onPiece(message)
      case 'stored':
        return onStored(message)
      case 'reload':
        beginLoad()
        startCycle()
        // 그 전 흐름의 답은 더 쓰지 않는다. 화면이 알려 오지 않으면 다 푼 자료가 메모리에 그대로 남는다
        assembler.discardUntaken()
        return
      case 'build':
        return onBuild(message)
      case 'filter':
        return onFilter(message)
      case 'mark':
        return onMark(message)
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

    // 새 포트를 받으면 옛 포트의 답은 오지 않는다(통로를 닫으면 답이 사라진다). 줄이 멈추지 않게 실패로 친다
    setPort(next: Port): void {
      port = next
      if (flight) settle(false, DISCONNECTED)
    },
  }
}
