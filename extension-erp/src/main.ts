// ERP 마감일지 화면(`/h/closing`) 쪽 흐름(design.md 1절·4절 '채우기 흐름', REQ-3609·3612·3613). content.ts가 import()로 불러 startPage()를 부른다
// - 주소가 /h/closing이고 '마감 일자'가 있을 때만 오른쪽 아래에 단추를 붙인다. 화면 안 이동(주소만 바뀜)은 0.5초마다 보고 안다
// - 누르면: 마감 일자 읽기 → 오늘(이 PC 날짜)보다 뒤면 멈춤(도우미 안 부름) → 설정(저장한 적 없으면 설정 화면 열기) →
//   서비스 워커에 closing.day(120초) → 오류면 errors.ts 글 → 날짜가 그대로인지 → 진료 0건이면 멈추고 묻기([그래도 채우기]) →
//   씨암·SONO가 함께 있는 진료 묻기(그날 두 번 센 돈이 있을 때만 — settings.ts overlapAsks, 고른 것을 설정 overlap에 기억, TASK-15·17) → 칸 계획 → 이미 적힌 칸 세기 → 모두 잠김이면 읽기 전용 →
//   적힌 칸이 있으면 묻기([바꾸기]·[빈 칸만]) → 누를 때마다 날짜 다시 확인 → 채움 → 안내. 오류·날짜 바뀜·묻기 닫음이면 어느 칸도 바꾸지 않는다
// - [되돌리기]·[지난 결과]의 기억(넣은 칸과 넣기 전 글자, 마지막 안내)은 이 화면 기억(startPage 안 변수)에만 두고
//   되돌린 뒤·다음 채우기·화면 떠남 때 지운다. 도우미 답과 이 기억은 어디에도 저장하지 않는다(chrome.storage에 쓰는 것은 overlap 선택뿐)
// - [비트 값 채우기](하루)는 저장을 누르지 않는다(사용자가 누름, AC-3703.6). 저장 단추는 [기간 채우기]에서만 누른다
// - [기간 채우기](spec erp-closing-range design.md 6절): 원무 화면이면 안내만 → 설정 → 기간 고르기 → 살펴보기(scanRange) →
//   승인 안내 → 하루씩 채우고 두 저장(runRange) → 끝·멈춤 안내. 살펴보기부터 안내를 닫을 때까지 두 단추·[지난 결과]를 막는다.
//   살펴본 결과·남은 날은 이 화면 기억(ranging)에만 두고 닫기·화면 떠남 때 지운다(AC-3703.5·3704.3)
// - 의사랑판(spec erp-uisarang design.md 8-9 main, TASK-14): 단추 줄을 처음 붙일 때 자료원을 정하고(uisFlow.ts decideSource — 비트 설정만이면
//   도우미를 부르지 않음), 의사랑이면 dock.setSource + 단추 셋([기간 채우기] [엑셀로 받기] [의사랑 값 채우기])을 createUisFlow로 잇는다.
//   정해지기 전 누름은 정해진 뒤 그 흐름으로 간다. 비트면 아래 줄 그대로다. 비트 흐름이 '설정 없음'에 닿았을 때만 다시 정해 본다
//   (그사이 설정 화면이 의사랑 설정을 저장했으면 의사랑으로 — 둘 다 없을 때 도우미를 부르지 않는 대신)
import { planCells } from './cells.js'
import { blocker, dateLabels, draftNotice, readDate, readJournal, save as pressSave, setDate, todayOnly, waitLoaded } from './erpday.js'
import { E_BRIDGE_BAD_REPLY, E_BRIDGE_DISCONNECTED, E_CLOSING_FUTURE_DATE, E_HELPER_TIMEOUT } from './errors.js'
import { fillAll, locate, survey, undoAll, type FillMode, type UndoEntry } from './fill.js'
import { createDock, HOST_ID, type Dock, type View } from './panel.js'
import { rangeDays, runRange, scanRange, type RangeDeps } from './range.js'
import type { RangeAction, RunSummary, ScanSummary } from './rangeTypes.js'
import { load, overlapAsks, saveOverlap, toGroups } from './settings.js'
import type { ClosingDay, MoneyKey, OverlapChoice, Settings } from './types.js'
import { createUisFlow, decideSource, type Send } from './uisFlow.js'
import type { Source } from './uisTypes.js'

/** 단추를 붙이는 화면 주소 */
export const PAGE_PATH = '/h/closing'
/** 화면 안 이동을 보는 간격 */
export const WATCH_MS = 500
/** 도우미 답을 기다리는 가장 긴 시간(서비스 워커도 같은 시간에 연결을 닫는다) */
export const READ_TIMEOUT_MS = 120_000

/** 마감 일자 읽기는 erpday.ts로 옮겼다(기간 채우기와 같이 쓴다). 여기서 그대로 다시 내보낸다 */
export { readDate }


/** 단추를 둘 화면인가: 주소가 /h/closing이고 '마감 일자'가 있다 */
export function onClosingPage(doc: Document): boolean {
  const pathname = doc.defaultView?.location.pathname ?? ''
  return (pathname === PAGE_PATH || pathname === `${PAGE_PATH}/`) && dateLabels(doc).length > 0
}

// --- 도우미 답 모양 검사(아는 칸이 맞는 모양일 때만 쓴다) ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isCount = (value: unknown) => value === null || isNumber(value)
/** 원 단위 금액: 0 이상 정수(AC-3711.2 overlap.shared) */
const isWon = (value: unknown) => Number.isInteger(value) && (value as number) >= 0
const numbers = (value: unknown, keys: string[]) => isRecord(value) && keys.every((key) => isNumber(value[key]))
const THREE = ['new', 'first90', 'return']
const MONEY: MoneyKey[] = ['total', 'insurer', 'receivableIn', 'unpaidNew', 'noncovered', 'discount', 'disabledFund', 'received', 'card', 'cash', 'transfer', 'refund']

/** closing.day 답(design.md 2절 모양)이고 부른 날짜의 답이면 그대로, 아니면 null */
export function readDay(data: unknown, date: string): ClosingDay | null {
  if (!isRecord(data) || data.date !== date) return null
  const { patients, groups, ages, money, reservations, injection, overlap, warnings } = data
  const ok =
    numbers(patients, [...THREE, 'noExamFee', 'total']) &&
    isRecord(patients) &&
    isCount(patients.ptVisit) &&
    Array.isArray(groups) &&
    groups.every((g) => numbers(g, [...THREE, 'patients', 'total', 'unpaidVisits']) && isRecord(g) && typeof g.key === 'string') &&
    Array.isArray(ages) &&
    ages.every((a) => numbers(a, THREE) && isRecord(a) && typeof a.band === 'string') &&
    isRecord(money) &&
    MONEY.every((key) => isCount(money[key])) &&
    isNumber(data.inpatientVisits) &&
    isRecord(reservations) &&
    isNumber(reservations.patients) &&
    Array.isArray(reservations.kinds) &&
    reservations.kinds.every((k) => numbers(k, ['total', 'visited', 'changed', 'canceled']) && isRecord(k) && typeof k.kind === 'string') &&
    (injection === null || (numbers(injection, ['newPatients', 'newLines']) && isRecord(injection) && isCount(injection.firstTime))) &&
    // 함께 있는 진료(TASK-15). 예전 도우미는 칸이 없다(없음 = null).
    // 그날 두 번 센 돈 shared(REQ-3711)는 있을 때만 본다: 0 이상 정수가 아니면 틀린 답이고, 없으면(옛 도우미) 그대로 받는다
    (overlap === undefined ||
      overlap === null ||
      (numbers(overlap, ['visits', 'carm', 'sono']) && isRecord(overlap) && (overlap.shared === undefined || isWon(overlap.shared)))) &&
    numbers(warnings, ['unpaidVisits', 'unknownAge']) &&
    isRecord(warnings) &&
    ['moneyUnconfirmed', 'splitUnconfirmed', 'noHistory'].every((key) => typeof warnings[key] === 'boolean')
  return ok ? (data as ClosingDay) : null
}

// --- 서비스 워커에 묻기 ---

type Outcome = { kind: 'day'; day: ClosingDay } | { kind: 'view'; view: View }

/** 이 PC 오늘(브라우저 지역 날짜 'YYYY-MM-DD', 기본값 (카)) */
function today(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/** 도우미·서비스 워커 오류 번호 → 안내. 도우미가 오늘 뒤 날짜라고 하면 확장의 같은 멈춤 글(AC-3612.1) */
const errorView = (code: unknown, date: string): View =>
  code === E_CLOSING_FUTURE_DATE ? { kind: 'future', date } : { kind: 'err', code: typeof code === 'string' ? code : E_BRIDGE_BAD_REPLY }

async function askDay(date: string, settings: Settings): Promise<Outcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'late'>((done) => {
    timer = setTimeout(() => done('late'), READ_TIMEOUT_MS)
  })
  let reply: unknown
  try {
    reply = await Promise.race([chrome.runtime.sendMessage({ cmd: 'closing.day', args: { date, groups: toGroups(settings) } }), late])
  } catch {
    return { kind: 'view', view: { kind: 'err', code: E_BRIDGE_DISCONNECTED } }
  } finally {
    clearTimeout(timer)
  }
  if (reply === 'late') return { kind: 'view', view: { kind: 'err', code: E_HELPER_TIMEOUT } }
  if (isRecord(reply) && reply.type === 'error') return { kind: 'view', view: errorView(reply.code, date) }
  const day = isRecord(reply) && reply.type === 'result' ? readDay(reply.data, date) : null
  return day ? { kind: 'day', day } : { kind: 'view', view: { kind: 'err', code: E_BRIDGE_BAD_REPLY } }
}

/** 설정 화면은 서비스 워커가 연다(내용 스크립트는 확장 화면을 열 수 없다) */
function openSettings(): void {
  try {
    chrome.runtime.sendMessage({ open: 'options' }).catch(() => {})
  } catch {
    // 확장과 끊긴 화면: 열 수 없다
  }
}

/** 마지막 채우기의 화면 기억: 채운 날짜·넣은 칸과 넣기 전 글자·그 안내 */
type Memory = { date: string; undo: UndoEntry[]; view: Extract<View, { kind: 'done' }> }

/**
 * 기간 채우기 화면 기억(이 화면 변수에만): 설정 · 지금 단계 · 기간 · 살펴본 결과 · 쓸 함께 있는 진료 선택 · 앞 채우기 결과 ·
 * [그만두기]·[멈추기] 눌림. phase: pick 기간 고르기 · scanning 살펴보는 중 · confirm 승인 안내 · running 채우는 중 ·
 * paused 멈춤(이어서 하기를 기다림) · done 끝
 */
type Ranging = {
  settings: Settings
  phase: 'pick' | 'scanning' | 'confirm' | 'running' | 'paused' | 'done'
  from: string
  to: string
  scan?: ScanSummary
  choice?: OverlapChoice
  run?: RunSummary
  halt: boolean
}

/** ERP 화면에서 단추를 붙이고 지킨다. stop()은 단추를 떼고 보기를 멈춘다 */
export function startPage(doc: Document = document): { stop(): void } {
  doc.getElementById(HOST_ID)?.remove() // 앞서 붙은 것(확장을 다시 읽은 뒤 등)
  /** 화면을 떠날 때마다 1씩: 떠나기 전에 시작한 읽기의 답은 버린다 */
  let visit = 0
  let busy = false
  /** [되돌리기]·[지난 결과] 기억(이 화면에만) */
  let memory: Memory | null = null
  /** 기간 채우기 기억(이 화면에만) */
  let ranging: Ranging | null = null
  /** 이 PC의 자료원(spec erp-uisarang). 정하기 전에는 null */
  let source: Source | null = null
  let deciding = false
  /** 정하기 전에 누른 단추(마지막 것 하나). 정해지면 그 흐름으로 */
  let queued: (() => void) | null = null
  const send: Send = (message) => chrome.runtime.sendMessage(message)
  const dock: Dock = createDock(doc, {
    onFill: () => press(() => (source === 'uisarang' ? void uis.fill() : void run())),
    onOpenSettings: openSettings,
    onUndo: () => void undo(),
    onRange: () => press(() => (source === 'uisarang' ? uis.range() : void openRange())),
    onRangeAction: (action) => void rangeAct(action),
    onExport: () => press(() => void (source === 'uisarang' && uis.exportXlsx())),
    onUisAction: (action) => uis.act(action),
  })
  const uis = createUisFlow({ doc, dock, send, openSettings, today: () => today() })

  /** 단추 누름: 자료원이 정해졌으면 곧바로, 아니면 정해진 뒤 */
  function press(go: () => void) {
    if (source === null) queued = go
    else go()
  }

  /** 자료원을 정한다(이 화면에서 한 번, 단추 줄을 처음 붙일 때). 의사랑이면 단추 줄을 바꾼다 */
  function decide() {
    if (deciding) return
    deciding = true
    void decideSource(send).then((found) => {
      applySource(found)
      const go = queued
      queued = null
      go?.()
    })
  }
  function applySource(found: Source) {
    source = found
    if (found === 'uisarang') dock.setSource('uisarang')
  }

  /**
   * 비트 흐름이 비트 설정 없음에 닿았을 때: 그사이 설정 화면이 의사랑 설정을 저장했으면 의사랑으로 정하고 true
   * (설정이 둘 다 없는 화면은 도우미를 부르지 않고 비트로 정했으므로)
   */
  async function nowUis(): Promise<boolean> {
    if ((await decideSource(send)) !== 'uisarang') return false
    applySource('uisarang')
    return true
  }

  const remember = (next: Memory | null) => {
    memory = next
    dock.setLast(next ? next.view : null)
  }

  async function run() {
    if (busy) return
    const mine = visit
    const still = () => mine === visit
    dock.hide()
    const date = readDate(doc)
    if (!date) {
      dock.show({ kind: 'errDate' })
      return
    }
    if (date > today()) {
      dock.show({ kind: 'future', date })
      return
    }
    /** 누른 뒤 마감 일자가 바뀌었으면 알리고 true(AC-3609.3) */
    const moved = () => {
      if (readDate(doc) === date) return false
      dock.show({ kind: 'dateChanged' })
      return true
    }
    busy = true
    try {
      let settings: Settings | null
      try {
        settings = await load()
      } catch {
        if (still()) dock.show({ kind: 'err', code: E_BRIDGE_DISCONNECTED })
        return
      }
      if (!still()) return
      if (!settings) {
        if (await nowUis()) {
          if (still()) void uis.fill()
          return
        }
        if (!still()) return
        openSettings()
        dock.show({ kind: 'first' })
        return
      }
      dock.setReading(true)
      const outcome = await askDay(date, settings)
      if (!still()) return
      dock.setReading(false)
      if (outcome.kind === 'view') {
        dock.show(outcome.view)
        return
      }
      if (moved()) return
      const day = outcome.day
      // 진료 0건인 날(AC-3612.2): 멈추고, [그래도 채우기]면 날짜를 다시 보고 이어 간다
      if (day.patients.total === 0) {
        const go = await dock.askZero(date)
        if (!still() || !go || moved()) return
      }
      // 씨암·SONO가 함께 있는 진료(AC-3609.7): 채우기 전에 묻고, 누를 때 날짜를 다시 보고, 고른 것을 기억한 뒤 그대로 채운다.
      // 그날 돈이 두 번 세지 않으면(AC-3711.2: 도우미 shared가 0, shared 없는 옛 도우미면 씨암·SONO 돈 코드가 다름 AC-3710.1)
      // 묻지 않고 고른 것 없이(둘 다 넣은 값) 채우며 끝 안내에 함께 있는 진료 줄이 없고 지난번 고른 것은 읽지도 쓰지도 않는다
      const overlap = overlapAsks(day.overlap, settings) ? day.overlap : null
      let choice: OverlapChoice | undefined
      if (overlap) {
        const picked = await dock.askOverlap({ visits: overlap.visits, carm: overlap.carm, sono: overlap.sono, last: settings.overlap })
        if (!still() || picked === null || moved()) return
        choice = picked
        try {
          await saveOverlap(picked)
        } catch {
          // 기억하지 못해도(확장과 끊김 등) 고른 대로 채운다. 다음엔 '(지난번)'이 예전 것으로 보일 뿐이다
        }
        if (!still()) return
      }
      const plan = planCells(day, settings, choice)
      // 이미 적힌 칸(AC-3612.3)·읽기 전용 화면(AC-3612.5). 세는 동안 업무일지 1 탭을 잠깐 바꿨다 돌아올 수 있다
      const seen = await survey(doc, plan)
      if (!still()) return
      if (seen.fillable === 0 && seen.locked > 0) {
        dock.show({ kind: 'readOnly' })
        return
      }
      let mode: FillMode = 'all'
      if (seen.written.length > 0) {
        const answer = await dock.askWritten(seen.written)
        if (!still() || answer === null) return
        mode = answer
      }
      if (moved()) return
      // 다음 채우기: 앞 기억을 지우고 이번 것만 둔다
      remember(null)
      const result = await fillAll(doc, plan, mode)
      if (!still()) return
      const view: Memory['view'] = {
        kind: 'done',
        date,
        result,
        day,
        canUndo: result.undo.length > 0,
        ...(overlap && choice ? { overlap: { visits: overlap.visits, choice } } : {}),
      }
      remember({ date, undo: result.undo, view })
      dock.show(view)
    } finally {
      if (still()) {
        busy = false
        dock.setReading(false)
      }
    }
  }

  /** [되돌리기](AC-3612.4·3618.2): 채울 때와 같은 마감 일자일 때만 넣은 칸을 넣기 전 글자로 돌리고(손으로 고친 칸은 그대로) 기억을 지운다 */
  async function undo() {
    if (busy || !memory) return
    const mine = visit
    const kept = memory
    if (readDate(doc) !== kept.date) {
      dock.show({ kind: 'undoDateChanged' })
      return
    }
    busy = true
    try {
      // 채운 뒤 손으로 고친 칸은 그대로 두고 edited로 센다(AC-3618.2)
      const { restored, gone, edited } = await undoAll(doc, kept.undo)
      if (mine !== visit) return
      remember(null)
      dock.show({ kind: 'undone', restored, gone, edited })
    } finally {
      if (mine === visit) busy = false
    }
  }

  // --- 기간 채우기(spec erp-closing-range design.md 6절) ---

  /**
   * [기간 채우기]: 원무 화면이면 안내만 → 설정(없으면 설정 화면 열기) → 기간 고르기.
   * 처음 값(AC-3701.1): 끝일 = 마감 일자(오늘 뒤면 오늘) · 시작일 = 끝일 달 1일. 마감 일자를 못 읽으면 둘 다 오늘
   */
  async function openRange() {
    if (busy) return
    const mine = visit
    ranging = null
    if (todayOnly(doc)) {
      dock.showRange({ kind: 'todayOnly' })
      return
    }
    let settings: Settings | null
    try {
      settings = await load()
    } catch {
      if (mine === visit && !busy) dock.show({ kind: 'err', code: E_BRIDGE_DISCONNECTED })
      return
    }
    if (mine !== visit || busy) return
    if (!settings) {
      if (await nowUis()) {
        if (mine === visit && !busy) uis.range()
        return
      }
      if (mine !== visit || busy) return
      openSettings()
      dock.show({ kind: 'first' })
      return
    }
    const now = today()
    const date = readDate(doc)
    const end = date && date < now ? date : now
    ranging = { settings, phase: 'pick', from: date ? `${end.slice(0, 8)}01` : now, to: end, halt: false }
    dock.showRange({ kind: 'pick', from: ranging.from, to: end, today: now })
  }

  /** 기간 흐름이 쓰는 부품: erpday.ts 함수에 doc을 묶는다. 화면을 떠났거나 안내를 닫았으면 gone */
  function rangeDeps(r: Ranging, mine: number): RangeDeps {
    return {
      setDate: (date) => setDate(doc, date),
      waitLoaded: (date) => waitLoaded(doc, date),
      blocker: () => blocker(doc),
      draftNotice: () => draftNotice(doc),
      readJournal: () => readJournal(doc),
      async askDay(date) {
        const outcome = await askDay(date, r.settings)
        if (outcome.kind === 'day') {
          // 묻지 않는 날(AC-3711.2·3711.3: 그날 두 번 센 돈이 없음)은 함께 있는 진료가 없는 날과 같게 넘긴다.
          // 그러면 range.ts의 overlapVisits는 묻는 날만 더하고, 'overlapUnpicked' 멈춤도 묻는 날에만, 칸은 둘 다 넣은 값이다
          const { day } = outcome
          return { day: overlapAsks(day.overlap, r.settings) ? day : { ...day, overlap: null } }
        }
        const code = outcome.view.kind === 'err' ? outcome.view.code : E_CLOSING_FUTURE_DATE
        return { block: { kind: 'helper', code } }
      },
      dateIs: (date) => readDate(doc) === date,
      // 넣을 칸(까닭 없음·값 있음, fill.ts eachTodo와 같은 고름) 중 화면에 없는 칸. 업무일지 1 칸은 waitLoaded가 둔 1 탭에서 찾는다
      async missingCells(day, choice) {
        const todo = planCells(day, r.settings, choice).filter((p) => !p.why && p.value !== null)
        return todo.filter((p) => {
          const at = locate(doc, p.where)
          return 'skip' in at && at.skip === 'notFound'
        }).length
      },
      async fill(day, choice) {
        await fillAll(doc, planCells(day, r.settings, choice), 'all')
      },
      save: (which) => pressSave(doc, which),
      gone: () => mine !== visit || ranging !== r,
    }
  }

  /** 기간 채우기를 끝낸다: 기억을 지우고 단추를 푼다 */
  function endRange() {
    ranging = null
    busy = false
    dock.setRangeBusy(false)
  }

  /** 살펴보기 → 승인 안내 / 멈춤 안내(저장 0일) / 그만두면 닫기 */
  async function scanFlow(r: Ranging) {
    const mine = visit
    const live = () => mine === visit && ranging === r
    r.phase = 'scanning'
    r.halt = false
    const days = rangeDays(r.from, r.to)
    dock.showRange({ kind: 'scanning', total: days.length, done: 0 })
    const out = await scanRange(
      days,
      rangeDeps(r, mine),
      (done) => {
        if (live()) dock.showRange({ kind: 'scanning', total: days.length, done })
      },
      () => r.halt,
    )
    if ('gone' in out || !live()) return
    if ('cancelled' in out) {
      dock.hide()
      endRange()
      return
    }
    if ('block' in out) {
      r.phase = 'paused'
      const run: RunSummary = { from: r.from, to: r.to, total: days.length, saved: [], skipped: [], failed: [], remaining: days }
      dock.showRange({ kind: 'blocked', block: out.block, run })
      return
    }
    r.scan = out.scan
    r.phase = 'confirm'
    // overlapVisits는 묻는 날(AC-3711.3)의 함께 있는 진료 수만 더한 것이다(rangeDeps askDay). 묻는 날이 없으면 그 줄이 없고
    // 지난번 고른 것도 읽지 않는다(AC-3710.1)
    const ask = out.scan.overlapVisits > 0
    dock.showRange({ kind: 'confirm', scan: out.scan, ...(ask && r.settings.overlap ? { last: r.settings.overlap } : {}) })
  }

  /** 하루씩 채우고 저장 → 끝·멈춤 안내. prior = 앞 결과(처음이면 진료 0건 날을 건너뛴 날로 넣은 것) */
  async function fillFlow(r: Ranging, days: string[], prior: RunSummary) {
    const mine = visit
    const live = () => mine === visit && ranging === r
    r.phase = 'running'
    r.halt = false
    // 진행 안내는 runRange가 날마다 시작할 때 그린다(첫날은 곧바로)
    const out = await runRange(
      days,
      rangeDeps(r, mine),
      r.choice,
      (saved, current) => {
        if (live()) dock.showRange({ kind: 'running', total: prior.total, saved, current, ...(r.halt ? { stopping: true } : {}) })
      },
      () => r.halt,
      prior,
    )
    if ('gone' in out || !live()) return
    r.run = out.run
    if (out.outcome === 'blocked' && out.block) {
      r.phase = 'paused'
      dock.showRange({ kind: 'blocked', block: out.block, run: out.run })
    } else if (out.outcome === 'stopped') {
      r.phase = 'paused'
      dock.showRange({ kind: 'stopped', run: out.run })
    } else {
      r.phase = 'done'
      dock.showRange({ kind: 'end', run: out.run })
    }
  }

  /** 기간 안내 단추(design.md 6절). 단계에 맞지 않는 동작(떨어진 단추·두 번 누름)은 무시한다 */
  async function rangeAct(action: RangeAction) {
    const r = ranging
    if (!r) return
    switch (action.kind) {
      case 'scan': {
        // 기간 고르기와 같은 막는 규칙을 한 번 더(빈 칸·시작일 > 끝일·오늘 뒤, 기간 길이는 막지 않음 — AC-3701.2)
        if (busy || r.phase !== 'pick' || rangeDays(action.from, action.to).length === 0 || action.to > today()) return
        busy = true
        dock.setRangeBusy(true)
        remember(null)
        r.from = action.from
        r.to = action.to
        await scanFlow(r)
        return
      }
      case 'cancelScan':
        if (r.phase === 'scanning') r.halt = true
        return
      case 'stop':
        // 멈춤 표시만: [멈추기]는 이미 '멈추는 중…'으로 막혔고, runRange가 날짜를 바꾸기 전에 본다
        if (r.phase === 'running') r.halt = true
        return
      case 'start': {
        const scan = r.scan
        if (r.phase !== 'confirm' || !scan) return
        r.phase = 'running'
        const mine = visit
        // 살펴볼 때 묻는 날이 있었을 때만 고른 것(승인 때 고른 것·지난번 고른 것)을 쓴다(AC-3711.3). 묻는 날이 없으면 고른 것 없이 채우고
        // 지난번 고른 것은 읽지도 쓰지도 않는다. 그런데 채울 때 묻는 날이 새로 생기면 range.ts가 'overlapUnpicked'로 멈춘다
        const ask = scan.overlapVisits > 0
        r.choice = ask ? (action.choice ?? r.settings.overlap) : undefined
        // 묻기에서 새로 고른 것만 기억한다(지금 saveOverlap). 기억하지 못해도 고른 대로 채운다
        if (ask && action.choice && action.choice !== r.settings.overlap) {
          try {
            await saveOverlap(action.choice)
          } catch {
            // 확장과 끊김 등: 다음엔 지난번 것이 예전 것으로 보일 뿐이다
          }
          if (mine !== visit || ranging !== r) return
        }
        const prior: RunSummary = {
          from: scan.from,
          to: scan.to,
          total: scan.fill.length,
          saved: [],
          skipped: scan.zero.map((date) => ({ date, why: 'zero' as const })),
          failed: [],
          remaining: [...scan.fill],
        }
        await fillFlow(r, scan.fill, prior)
        return
      }
      case 'resume':
        if (r.phase !== 'paused') return
        // 채우다 멈췄으면 남은 날부터(같은 승인), 살펴보다 멈췄으면 다시 살펴본다(아무 칸도 바꾸지 않으므로)
        if (r.run) await fillFlow(r, r.run.remaining, r.run)
        else await scanFlow(r)
        return
      case 'close':
        // 안내는 dock이 이미 닫았다. 도는 중에는 닫기가 없다
        if (r.phase === 'scanning' || r.phase === 'running') return
        if (r.phase === 'pick') ranging = null
        else endRange()
        return
    }
  }

  function leave() {
    visit += 1
    busy = false
    ranging = null
    queued = null
    uis.reset()
    remember(null)
    dock.setReading(false)
    dock.setUisReading(null)
    dock.setRangeBusy(false)
    dock.hide()
    dock.host.remove()
  }

  function watch() {
    const here = onClosingPage(doc)
    if (here && !dock.host.isConnected) {
      doc.body.append(dock.host)
      decide()
    } else if (!here && dock.host.isConnected) leave()
  }

  watch()
  const timer = setInterval(watch, WATCH_MS)
  return {
    stop() {
      clearInterval(timer)
      leave()
    },
  }
}
