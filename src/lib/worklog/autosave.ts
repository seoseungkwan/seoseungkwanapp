import { WorklogStorageError } from '@/lib/storage/worklogDays'
import {
  emptyWorklogDay,
  WORKLOG_CELL_KEYS,
  type WorklogCellKey,
  type MemoFontPt,
  type WorklogChanges,
  type WorklogDay,
  type WorklogNumberKey,
} from '@/types/worklog'
import { cellSaveText } from './cellText'
import { blockedCellKeys } from './notes'

// 자동 저장 제어 (specs/worklog/design.md 10절). 화면 밖 모듈 한 벌로 쓰여 화면이 내려가도 살아 있으므로 React 수명에 기대지 않는다.
// 바뀐 칸만 보낸다: 하루 전체를 보내면 다른 PC가 고친 칸을 덮는다.
// 브라우저 저장소에 사본을 두지 않는다(plan.md §10). 저장 안 된 값은 조용히 잃지 않고 상태로 드러나며 hasUnsaved()가 참이다.
// 비트 칸 목록(bitFields, design.md 20-4절)도 칸처럼 아는 값·최신 값을 들고 바뀌었을 때만(차례는 보지 않는다) save의 셋째 인자로 넘긴다.
// 목록을 모르거나 안 바뀌었으면 인자 둘로 부른다: 저장이 bit_fields를 보내지 않아야 저장된 비트 표시가 지워지지 않는다(AC-017.7)
// 업무사항 글씨 크기(memoFontPt, specs/worklog-memo-font)도 같은 규칙으로 아는 크기·최신 크기를 들고, 바뀌었을 때만 넷째 인자로 넘긴다.
// 크기를 모르거나 안 바뀌었으면 인자 수가 지금과 같다(AC-1504.2). 크기는 칸 글자가 아니라 칸 차이 계산과 섞지 않는다

/** 날짜 하나의 상태. pending = 타이머를 기다리는 중(묶기 800ms·실패 뒤 다시 하기) */
export type DaySaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
/** 바깥에 보이는 전체 상태. pending은 saving으로 보인다 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
export type AutosaveSnapshot = {
  state: SaveState
  savedAt: Date | null
  blocked: { ymd: string; fields: readonly WorklogCellKey[] } | null // 막힌 칸이 있는 가장 이른 날
}
export type AutosaveOptions = {
  save: (
    ymd: string,
    changes: WorklogChanges,
    bitFields?: readonly WorklogNumberKey[],
    memoFontPt?: MemoFontPt,
  ) => Promise<void> // WorklogStorageError를 던진다
  delayMs?: number
  retryDelaysMs?: readonly number[]
  offlineRetryMs?: number
  now?: () => Date
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  onChange?: (snapshot: AutosaveSnapshot) => void
}

/** 읽은 하루·저장 안 된 하루. 비트 칸 목록·업무사항 글씨 크기를 모르면(받은 적 없음) 그 칸이 없다 */
export type AutosaveDay = { day: WorklogDay; bitFields?: WorklogNumberKey[]; memoFontPt?: MemoFontPt }

type Listener = (snapshot: AutosaveSnapshot) => void
type BitList = WorklogNumberKey[] | null // null = 모름
type FontPt = MemoFontPt | null // null = 모름
type DayEntry = {
  state: DaySaveState
  settled: 'idle' | 'saved' // 보낼 칸이 없을 때 돌아갈 상태
  known: WorklogDay // 서버에 있다고 아는 값
  latest: WorklogDay // 최신 값
  sending: WorklogChanges | null // 응답을 기다리는 칸
  knownBits: BitList // 서버에 있다고 아는 비트 칸 목록
  latestBits: BitList // 최신 목록
  sendingBits: BitList // 응답을 기다리는 목록
  knownFont: FontPt // 서버에 있다고 아는 업무사항 글씨 크기
  latestFont: FontPt // 최신 크기
  sendingFont: FontPt // 응답을 기다리는 크기
  attempt: number // 실패 뒤 다시 한 횟수
  timer: ReturnType<typeof setTimeout> | null
  revision: number
}

// 남은 저장이 있는데 "저장했어요"로 보이지 않게 나쁜 것이 이긴다
const STATE_RANK: Readonly<Record<SaveState, number>> = { idle: 0, saved: 1, blocked: 2, saving: 3, offline: 4, failed: 5 }
const UNSAVED_STATES: readonly DaySaveState[] = ['pending', 'saving', 'offline', 'failed', 'blocked']
const RETRYABLE_STATES: readonly DaySaveState[] = ['failed', 'offline', 'pending']

function newEntry(known: WorklogDay, bits: readonly WorklogNumberKey[] | undefined, font?: MemoFontPt): DayEntry {
  return {
    state: 'idle',
    settled: 'idle',
    known: { ...known },
    latest: { ...known },
    sending: null,
    knownBits: bits ? [...bits] : null,
    latestBits: bits ? [...bits] : null,
    sendingBits: null,
    knownFont: font ?? null,
    latestFont: font ?? null,
    sendingFont: null,
    attempt: 0,
    timer: null,
    revision: 0,
  }
}

function isDifferent(entry: DayEntry, key: WorklogCellKey): boolean {
  return cellSaveText(key, entry.latest[key]) !== cellSaveText(key, entry.known[key])
}

const sameBits = (a: readonly WorklogNumberKey[], b: readonly WorklogNumberKey[]) =>
  new Set(a).size === new Set(b).size && a.every((key) => b.includes(key))

// 보낼 목록: 최신 목록을 알고, 아는 목록과 다를 때만(모르는 아는 목록과는 늘 다르다). 아니면 null(보내지 않는다)
function bitsToSend(entry: DayEntry): WorklogNumberKey[] | null {
  const { latestBits, knownBits } = entry
  if (latestBits === null || (knownBits !== null && sameBits(latestBits, knownBits))) return null
  return [...latestBits]
}

// 보낼 크기: 최신 크기를 알고, 아는 크기와 다를 때만(모르는 아는 크기와는 늘 다르다). 아니면 null(보내지 않는다)
function fontToSend(entry: DayEntry): FontPt {
  const { latestFont, knownFont } = entry
  return latestFont === null || latestFont === knownFont ? null : latestFont
}

function dayOf(entry: DayEntry): AutosaveDay {
  const day: AutosaveDay = { day: { ...entry.latest } }
  if (entry.latestBits !== null) day.bitFields = [...entry.latestBits]
  if (entry.latestFont !== null) day.memoFontPt = entry.latestFont
  return day
}

// 차이를 보낼 칸과 막힌 칸으로 나눈다. 막는 모양은 save 앞에서 뺀다:
// saveWorklogDay도 빼지만 알리지 않고 버리므로, 막힌 상태는 여기서 정해야 드러난다
function splitDifference(entry: DayEntry): { changes: WorklogChanges; blocked: WorklogCellKey[] } {
  const changes: WorklogChanges = {}
  for (const key of WORKLOG_CELL_KEYS) {
    if (isDifferent(entry, key)) changes[key] = entry.latest[key]
  }
  const blocked = blockedCellKeys(changes)
  for (const key of blocked) delete changes[key]
  return { changes, blocked }
}

export function createAutosave(options: AutosaveOptions) {
  const {
    save,
    delayMs = 800,
    retryDelaysMs = [2000, 5000, 15000],
    offlineRetryMs = 15000,
    now = () => new Date(),
    onChange,
  } = options
  const days = new Map<string, DayEntry>()
  const listeners = new Set<Listener>(onChange ? [onChange] : [])
  let savedAt: Date | null = null
  let generation = 0 // dispose()가 올린다. 그 전에 나간 저장의 응답을 버리려고
  let lastNotified = JSON.stringify(snapshot())

  function snapshot(): AutosaveSnapshot {
    let state: SaveState = 'idle'
    let blocked: AutosaveSnapshot['blocked'] = null
    for (const [ymd, entry] of days) {
      const visible = entry.state === 'pending' ? 'saving' : entry.state
      if (STATE_RANK[visible] > STATE_RANK[state]) state = visible
      if (blocked && ymd >= blocked.ymd) continue
      const fields = splitDifference(entry).blocked
      if (fields.length > 0) blocked = { ymd, fields }
    }
    return { state, savedAt, blocked }
  }

  function notify(): void {
    const current = snapshot()
    const signature = JSON.stringify(current)
    if (signature === lastNotified) return
    lastNotified = signature
    for (const listener of listeners) listener(current)
  }

  // 전역 setTimeout은 부를 때 찾는다. 묶지 않고 부른다: 브라우저의 setTimeout은 다른 객체의 메서드로 부르면 던진다
  function arm(ymd: string, entry: DayEntry, ms: number): void {
    disarm(entry)
    const set = options.timers?.setTimeout ?? setTimeout
    entry.timer = set(() => {
      entry.timer = null
      send(ymd, entry)
    }, ms)
  }

  function disarm(entry: DayEntry): void {
    if (entry.timer === null) return
    const clear = options.timers?.clearTimeout ?? clearTimeout
    clear(entry.timer)
    entry.timer = null
  }

  function send(ymd: string, entry: DayEntry): void {
    disarm(entry)
    const { changes, blocked } = splitDifference(entry)
    const bits = bitsToSend(entry)
    const font = fontToSend(entry)
    if (Object.keys(changes).length === 0 && bits === null && font === null) {
      entry.attempt = 0
      entry.state = blocked.length > 0 ? 'blocked' : entry.settled
      notify()
      return
    }
    entry.state = 'saving'
    entry.sending = changes
    entry.sendingBits = bits
    entry.sendingFont = font
    entry.revision += 1
    notify()
    const sentIn = generation
    // async로 감싼다: save가 바로 던져도 실패로 다루려고. 목록이 없으면 셋째 인자를, 크기가 없으면 넷째 인자를 넘기지 않는다
    void (async () => {
      if (font !== null) return save(ymd, changes, bits ?? undefined, font)
      return bits === null ? save(ymd, changes) : save(ymd, changes, bits)
    })().then(
      () => {
        if (sentIn === generation) succeeded(ymd, entry, changes, bits, font)
      },
      (err: unknown) => {
        if (sentIn === generation) failed(ymd, entry, err)
      },
    )
  }

  function succeeded(
    ymd: string,
    entry: DayEntry,
    sent: WorklogChanges,
    sentBits: WorklogNumberKey[] | null,
    sentFont: FontPt,
  ): void {
    Object.assign(entry.known, sent)
    if (sentBits !== null) entry.knownBits = [...sentBits]
    if (sentFont !== null) entry.knownFont = sentFont
    entry.sending = null
    entry.sendingBits = null
    entry.sendingFont = null
    entry.attempt = 0
    entry.revision += 1
    entry.settled = 'saved'
    savedAt = now()
    send(ymd, entry) // 그 사이 바뀐 것이 있으면 남은 차이만 바로 다시, 없으면 blocked·saved
  }

  // known을 건드리지 않는다: 다음 시도가 그때의 차이를 다시 구한다
  function failed(ymd: string, entry: DayEntry, err: unknown): void {
    entry.sending = null
    entry.sendingBits = null
    entry.sendingFont = null
    entry.revision += 1
    if (err instanceof WorklogStorageError && err.kind === 'offline') {
      entry.attempt = 0
      entry.state = 'offline'
      arm(ymd, entry, offlineRetryMs)
    } else if (entry.attempt < retryDelaysMs.length) {
      entry.state = 'pending'
      arm(ymd, entry, retryDelaysMs[entry.attempt])
      entry.attempt += 1
    } else {
      entry.state = 'failed'
    }
    notify()
  }

  function entryOf(ymd: string): DayEntry {
    let entry = days.get(ymd)
    if (!entry) {
      entry = newEntry(emptyWorklogDay(), undefined)
      days.set(ymd, entry)
    }
    return entry
  }

  // 저장 중이 아니면 묶기 타이머를 다시 건다. 저장 중이면 끝난 뒤 남은 차이가 바로 간다
  function schedule(ymd: string, entry: DayEntry): void {
    if (entry.state !== 'saving') {
      entry.attempt = 0
      entry.state = 'pending'
      arm(ymd, entry, delayMs)
    }
    notify()
  }

  // bitFields를 주지 않으면 최신 목록을 그대로 둔다(모르는 목록을 [](빈 목록)로 바꾸지 않는다). 크기는 건드리지 않는다(AC-1504.2)
  function change(ymd: string, day: WorklogDay, bitFields?: readonly WorklogNumberKey[]): void {
    const entry = entryOf(ymd)
    entry.latest = { ...day }
    if (bitFields !== undefined) entry.latestBits = [...bitFields]
    schedule(ymd, entry)
  }

  // 업무사항 글씨 크기만 바꾼다. 칸 값·목록은 건드리지 않는다(날짜 칸이 없으면 빈 하루·모르는 목록·모르는 크기로 만든다)
  function changeMemoFont(ymd: string, pt: MemoFontPt): void {
    const entry = entryOf(ymd)
    entry.latestFont = pt
    schedule(ymd, entry)
  }

  // 타이머·상태를 건드리지 않는다. 보내는 중인 칸도 저장 안 된 칸이다:
  // 그 사이 되돌린 값이 곧 서버에 들어갈 값으로 바뀌면 되돌림을 잃는다.
  // 초점 칸의 known을 올리면 그 칸의 옛 화면 값이 차이가 되어 다른 PC 값을 덮으므로 올리지 않는다.
  // 읽은 목록도 같다: 저장 안 된 목록(보내는 중 포함)이 아니면 아는 목록·최신 목록이 서버 목록이 된다. 목록을 받지 않으면 그대로 둔다.
  // 읽은 크기(memoFontPt)도 목록과 같은 규칙이다(AC-1504.3)
  function serverDay(
    ymd: string,
    server: WorklogDay | null,
    focusKey: WorklogCellKey | null = null,
    bitFields?: readonly WorklogNumberKey[],
    memoFontPt?: MemoFontPt,
  ): AutosaveDay {
    const incoming = server ?? emptyWorklogDay()
    const entry = days.get(ymd)
    if (!entry) {
      const fresh = newEntry(incoming, bitFields, memoFontPt)
      days.set(ymd, fresh)
      return dayOf(fresh)
    }
    for (const key of WORKLOG_CELL_KEYS) {
      if (key === focusKey || entry.sending?.[key] !== undefined || isDifferent(entry, key)) continue
      entry.known[key] = incoming[key]
      entry.latest[key] = incoming[key]
    }
    if (bitFields !== undefined && entry.sendingBits === null && bitsToSend(entry) === null) {
      entry.knownBits = [...bitFields]
      entry.latestBits = [...bitFields]
    }
    if (memoFontPt !== undefined && entry.sendingFont === null && fontToSend(entry) === null) {
      entry.knownFont = memoFontPt
      entry.latestFont = memoFontPt
    }
    return dayOf(entry)
  }

  function dispose(): void {
    generation += 1
    for (const entry of days.values()) disarm(entry)
    days.clear()
    savedAt = null
    notify()
  }

  return {
    change,
    changeMemoFont,
    serverDay,
    revision(ymd: string): number {
      return days.get(ymd)?.revision ?? 0
    },
    flush(): void {
      for (const [ymd, entry] of days) {
        if (entry.state === 'pending') send(ymd, entry)
      }
    },
    retry(): void {
      for (const [ymd, entry] of days) {
        if (!RETRYABLE_STATES.includes(entry.state)) continue
        entry.attempt = 0
        send(ymd, entry)
      }
    },
    online(): void {
      for (const [ymd, entry] of days) {
        if (entry.state === 'offline') send(ymd, entry)
      }
    },
    hasUnsaved(): boolean {
      return [...days.values()].some((entry) => UNSAVED_STATES.includes(entry.state))
    },
    snapshot,
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    pendingDay(ymd: string): AutosaveDay | null {
      const entry = days.get(ymd)
      return entry && UNSAVED_STATES.includes(entry.state) ? dayOf(entry) : null
    },
    dispose,
  }
}
