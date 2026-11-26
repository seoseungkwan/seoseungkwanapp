import { addMonths, todayInKorea } from '@/lib/analytics/dates'
import { GSHEET_PINNED_KEYS, type GsheetMonth, type GsheetRunInput } from '@/types/gsheet'
import { isBusyCode } from './plan'
import { BAD_REPLY, readFill, readMonths, readStatus } from './reply'
import { fillWarnings } from './result'
import type { FillJob, FillReply, FillUnchanged, GsheetSettings } from './shapes'
import { fillStatus, type FillDone } from './status'

// 수납 넣기 돌리기(spec google-link REQ-8513 AC-8513.1·2·5, design.md 10-4·11절 1~6). 저절로 넣기(GoogleSheetAuto, TASK-14)와
// 손 넣기([지금 넣기]·[덮어쓰기…], TASK-23)가 같이 쓴다. 도우미는 받은 call로만 부른다(통로를 쥐거나 빌리는 것은 부르는 쪽 몫).
// 차례:
//   1. sheet.status → 도우미 비밀 글자 표시(secretTag)가 서버 secret_tag와 같을 때만 넣는 PC. 아니면 sheet.fill을 부르지 않고 'viewer'
//   2. 이 쪽에서 그날 처음 넣기 전에 sheet.months로 최근 13달 파일 목록을 받아 gsheet_months에(실패해도 넣기는 함, 다음 넣기 때 다시)
//   3. fillStatus.start → sheet.fill {day, mode, auto, settings} — 손 넣기는 지문 무시(auto 거짓), 저절로(간격 확인)는 받은 auto
//   4. gsheet_runs 한 줄(숫자·참거짓·오류 번호·칸 주소만) → 새 달 파일을 만들었으면 달 목록을 다시 받음 → fillStatus.finish
// 코드 주소·함께 쓸 메일(sheet.status의 pinned)은 어느 명령 args·기록·달 목록에도 넣지 않는다 — 도우미는 자기 sheet.dat 것만 쓴다(ADR-052).
// 보내는 설정은 정해 둔 서른 칸만 골라 새로 만들고, 안쪽까지 scriptUrl·url·shareWith 열쇠를 뺀다.
// 다른 탭이 통로를 쥠(E-BRIDGE-BUSY)·이 쪽에서 다른 넣기가 돌고 있음은 기록 없이 'busy'(다음 차례에 다시, AC-8513.4).
// sheet.status부터 sheet.fill 답까지 FILL_LIMIT_MS(120초)를 넘으면 E-GSHEET-TIMEOUT 실패로 적는다(답이 늦게 와도 버림).
// 기록 counts 열쇠는 FillReply 칸 이름 그대로이고 notPut은 notPutNoName·notPutUnlinked·notPutNegative·notPutNoChart로 펼친다
// (새 달 알림이 읽는 created·cleaned·ratioFixed·shareFailed 포함, AC-8513.5). 파일 id·판 글자는 기록에 넣지 않는다.
// 그날 달 목록을 받았는지는 이 쪽 메모리에만 둔다(로그아웃·시험에서 resetRunner).

/** sheet.status부터 sheet.fill 답까지 기다리는 한도. 넘으면 실패로 적는다 */
export const FILL_LIMIT_MS = 120_000
/** 달 고르기에 쓰는 달 수(이번 달 + 지난 12달) */
const MONTHS_ASKED = 13

const TIMEOUT = 'E-GSHEET-TIMEOUT'
const FAILED = 'E-GSHEET-FAILED'
/** 옛 7판 구글 코드(months·hello를 모름) */
const OLD_CODE = 'E-GSHEET-OLD'
/** gsheet_runs.code와 같은 모양 */
const CODE = /^E-[A-Z0-9-]{1,30}$/
const PINNED = new Set<string>(GSHEET_PINNED_KEYS)

export type SheetCall = (cmd: string, args: Record<string, unknown>) => Promise<unknown>
/** lib/storage/gsheet의 addGsheetRun·upsertGsheetMonths를 client에 묶은 것 */
export type RunnerStore = {
  addRun(run: GsheetRunInput): Promise<void | 'invalid'>
  upsertMonths(months: GsheetMonth[]): Promise<void>
}
export type RunnerDeps = {
  /** 도우미 부르기(통로의 call 또는 화면에서 빌린 call). 오류는 {code: 'E-…'}로 던진다 */
  call: SheetCall
  store: RunnerStore
  now: () => Date
  /** 서버 수납 시트 설정(gsheet_settings.conf) */
  settings: GsheetSettings
  /** 서버 넣는 PC 표시(gsheet_settings.secret_tag) */
  secretTag: string | null
}
/**
 * ran = sheet.fill까지 감(done = fillStatus.finish에 넘긴 것, saved = gsheet_runs에 적었나) · viewer = 넣는 PC 아님 ·
 * busy = 통로나 다른 넣기가 바빠 다음 차례(기록 없음) · unreachable = 도우미에 묻지 못함(기록 없음)
 */
export type FillOutcome =
  | { kind: 'ran'; done: FillDone; saved: boolean }
  | { kind: 'viewer' }
  | { kind: 'busy' }
  | { kind: 'unreachable'; code: string }

type Race = <T>(work: Promise<T>) => Promise<T>
type FillResult = { reply: FillReply | FillUnchanged } | { code: string }

const BUSY: FillOutcome = { kind: 'busy' }
const VIEWER: FillOutcome = { kind: 'viewer' }

/** 보내는 설정 칸(GsheetSettings 서른 칸 — 빠지거나 더한 칸이 있으면 타입 검사가 막는다) */
const SETTING_KEYS: Record<keyof GsheetSettings, true> = {
  templateUrl: true,
  namePattern: true,
  hospitalLabel: true,
  folderUrl: true,
  firstRow: true,
  lastRow: true,
  cols: true,
  markValue: true,
  signs: true,
  shiftCols: true,
  staffCols: true,
  bitHospital: true,
  deptRooms: true,
  deptRoomsHospital: true,
  firstKinds: true,
  day90Kinds: true,
  blockCodes: true,
  therapyCodes: true,
  free: true,
  freeInsurance: true,
  carInsurance: true,
  aidInsurance: true,
  noteCar: true,
  noteAid: true,
  autoOn: true,
  everyMin: true,
  from: true,
  to: true,
  eveningOn: true,
  evening: true,
}

// 그날 달 목록을 받은 한국 날짜(이 쪽 메모리). null이면 다음 넣기 전에 묻는다
let monthsDay: string | null = null

/** 그날 달 목록을 받았다는 표시를 지운다(로그아웃·시험) */
export function resetRunner(): void {
  monthsDay = null
}

/** 던진 값의 오류 번호. 번호가 없거나 모양이 틀리면 E-GSHEET-FAILED(원래 글은 버림) */
export function errorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' && CODE.test(code) ? code : FAILED
}

/** 이번 달부터 지난 12달('YYYY-MM', 새 달 먼저) */
export function recentMonths(today: string): string[] {
  const month = today.slice(0, 7)
  return Array.from({ length: MONTHS_ASKED }, (_, i) => addMonths(month, -i))
}

/** 넣기 답의 숫자·참거짓 칸(기록 counts). 글자 칸(파일 id·판·칸 주소)은 넣지 않는다 */
export function countsOf(reply: FillReply): Record<string, number | boolean> {
  return {
    rows: reply.rows,
    patients: reply.patients,
    added: reply.added,
    filled: reply.filled,
    overwritten: reply.overwritten,
    skipped: reply.skipped,
    full: reply.full,
    cancelCleared: reply.cancelCleared,
    cancelKept: reply.cancelKept,
    freeFixed: reply.freeFixed,
    inserted: reply.inserted,
    cleaned: reply.cleaned,
    shareFailed: reply.shareFailed,
    created: reply.created,
    ratioFixed: reply.ratioFixed,
    ratioSkippedCount: reply.ratioSkippedCount,
    ratioFailed: reply.ratioFailed,
    split: reply.split,
    free: reply.free,
    paidOnly: reply.paidOnly,
    notes: reply.notes,
    notPutNoName: reply.notPut.noName,
    notPutUnlinked: reply.notPut.unlinked,
    notPutNegative: reply.notPut.negative,
    notPutNoChart: reply.notPut.noChart,
    oldCode: reply.oldCode,
  }
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** 안쪽까지 코드 주소·메일 열쇠를 뺀 새 값 */
function withoutPinned(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPinned)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).flatMap(([key, inner]) => (PINNED.has(key) ? [] : [[key, withoutPinned(inner)]])))
}

/** 보낼 설정 — 정해 둔 칸만, 코드 주소·메일 열쇠 없이 */
function sendableSettings(settings: GsheetSettings): GsheetSettings {
  const source = settings as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(SETTING_KEYS)) if (Object.hasOwn(source, key)) out[key] = withoutPinned(source[key])
  return out as GsheetSettings
}

/** 한도 타이머 하나. race로 감싼 일은 한도가 지나면 E-GSHEET-TIMEOUT으로 끝난다 */
function limit(ms: number): { race: Race; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(TIMEOUT), { code: TIMEOUT })), ms)
  })
  expired.catch(() => undefined)
  return {
    race: (work) => Promise.race([work, expired]),
    stop: () => clearTimeout(timer),
  }
}

const isFiller = (helperTag: string | null, serverTag: string | null) => helperTag !== null && serverTag !== null && helperTag === serverTag

/** 손 넣기는 지문을 무시한다(force). 그 밖은 계획이 정한 그대로(간격 확인만 참) */
const autoOf = (job: FillJob) => job.via !== 'hand' && job.auto === true

/** 최근 13달 파일 목록을 받아 파일이 있는 달만 적는다. 적었거나 옛 코드라 못 물으면 그날은 다시 묻지 않는다 */
async function refreshMonths(deps: RunnerDeps, settings: GsheetSettings, today: string, race: Race): Promise<void> {
  try {
    const reply = readMonths(await race(deps.call('sheet.months', { settings, months: recentMonths(today) })))
    if (reply === null) return
    const found = reply.months.flatMap((m) => (m.fileId === null ? [] : [{ ym: m.ym, fileId: m.fileId, gids: m.gids }]))
    if (found.length > 0) await race(deps.store.upsertMonths(found))
    monthsDay = today
  } catch (error) {
    if (errorCode(error) === OLD_CODE) monthsDay = today
  }
}

/** 넣기 기록 한 줄(숫자만) */
function runOf(job: FillJob, result: FillResult): GsheetRunInput {
  const base = { day: job.day, via: job.via, mode: job.mode }
  if ('code' in result) return { ...base, outcome: 'fail', code: result.code, rows: 0, counts: {}, cells: [] }
  const { reply } = result
  if ('unchanged' in reply) return { ...base, outcome: 'same', code: null, rows: reply.rows, counts: {}, cells: [] }
  const outcome = fillWarnings(reply).length > 0 ? 'warn' : 'ok'
  return { ...base, outcome, code: null, rows: reply.rows, counts: countsOf(reply), cells: [...reply.ratioSkipped] }
}

async function save(store: RunnerStore, run: GsheetRunInput, race: Race): Promise<boolean> {
  try {
    return (await race(store.addRun(run))) !== 'invalid'
  } catch {
    return false
  }
}

/** 넣은 뒤 달 목록: 옛 7판은 넣기 답 파일 id만(gid 없음), 새 달 파일을 만들었으면 다시 받는다 */
async function afterFill(deps: RunnerDeps, settings: GsheetSettings, job: FillJob, reply: FillReply, today: string, race: Race): Promise<void> {
  if (reply.oldCode) {
    if (reply.fileId === null) return
    try {
      await race(deps.store.upsertMonths([{ ym: job.day.slice(0, 7), fileId: reply.fileId, gids: {} }]))
    } catch {
      // 다음 넣기 답으로 다시 적는다
    }
    return
  }
  if (!reply.created) return
  monthsDay = null
  await refreshMonths(deps, settings, today, race)
}

/** 넣기 한 번(design.md 11절). 던지지 않는다 */
export async function runFill(deps: RunnerDeps, job: FillJob): Promise<FillOutcome> {
  if (fillStatus.get().filling !== null) return BUSY
  const fill = limit(FILL_LIMIT_MS)
  let result: FillResult
  let settings: GsheetSettings
  let today: string
  try {
    let status
    try {
      status = readStatus(await fill.race(deps.call('sheet.status', {})))
    } catch (error) {
      const code = errorCode(error)
      return isBusyCode(code) ? BUSY : { kind: 'unreachable', code }
    }
    if (status === null) return { kind: 'unreachable', code: BAD_REPLY }
    if (!isFiller(status.secretTag, deps.secretTag)) return VIEWER
    settings = sendableSettings(deps.settings)
    today = todayInKorea(deps.now())
    if (monthsDay !== today) await refreshMonths(deps, settings, today, fill.race)
    if (!fillStatus.start(job)) return BUSY
    try {
      const reply = readFill(await fill.race(deps.call('sheet.fill', { day: job.day, mode: job.mode, auto: autoOf(job), settings })))
      result = reply === null ? { code: BAD_REPLY } : { reply }
    } catch (error) {
      result = { code: errorCode(error) }
    }
  } finally {
    fill.stop()
  }

  const base = { day: job.day, via: job.via, mode: job.mode }
  if ('code' in result && isBusyCode(result.code)) {
    fillStatus.finish({ ...base, at: deps.now().toISOString(), outcome: 'fail', code: result.code, rows: 0 })
    return BUSY
  }
  const after = limit(FILL_LIMIT_MS)
  let saved: boolean
  try {
    const run = runOf(job, result)
    saved = await save(deps.store, run, after.race)
    const full = 'reply' in result && !('unchanged' in result.reply) ? result.reply : null
    if (full !== null) await afterFill(deps, settings, job, full, today, after.race)
    const done: FillDone = { ...base, at: deps.now().toISOString(), outcome: run.outcome, code: run.code, rows: run.rows, reply: full }
    fillStatus.finish(done)
    return { kind: 'ran', done, saved }
  } finally {
    after.stop()
  }
}
