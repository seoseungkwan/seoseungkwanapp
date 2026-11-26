import { todayInKorea } from '@/lib/analytics/dates'
import { isBusyCode } from './plan'
import type { FillJob, FillReply, GsheetRun } from './shapes'

// 넣기 상태 듣기·알리기(spec google-link REQ-8512 AC-8512.4).
// 알리는 쪽: GoogleSheetAuto·손 넣기(TASK-14·23). 듣는 쪽: 탭 줄 '수납일지' 주황 점·띠·결과 줄(TASK-15·23).
// 한 화면 안의 메모리 값뿐이다 — 서버·브라우저 저장소에 두지 않고, 다른 쪽(탭)과 주고받지 않는다.
// subscribe(듣기)·get(지금 값 — 바뀌기 전에는 같은 값)은 React useSyncExternalStore에 그대로 넘길 수 있다.
// 결과 줄: 손 넣기와 '확인 필요'만 띄우고, 저절로 넣은 보통 결과는 줄을 바꾸지 않는다(AC-8515.4). [✕]는 dismissResult.

/** 이 PC가 넣는 PC인지: 아직 모름 · 넣는 PC(비밀 글자 표시가 서버와 같음) · 보기만 */
export type FillPc = 'unknown' | 'filler' | 'viewer'
/** 끝난 넣기 하나(서버 gsheet_runs 줄과 같은 칸 + 넣기 답 숫자) */
export type FillDone = Pick<GsheetRun, 'at' | 'day' | 'via' | 'mode' | 'outcome' | 'code' | 'rows'> & { reply?: FillReply | null }
export type FillStatus = {
  pc: FillPc
  /** 도우미가 옛 판이라 넣지 못함(E-GSHEET-EXT 안내) */
  oldHelper: boolean
  /** 크롬 확장이 옛 판이라 넣지 못함(E-GSHEET-EXT 안내) */
  oldExtension: boolean
  /** 지금 넣는 일(띠 '넣는 중…', [지금 넣기]·[덮어쓰기…] 잠김) */
  filling: FillJob | null
  /** 마지막으로 끝난 넣기 */
  last: FillDone | null
  /** 그날 시트에 넣은 마지막 성공(띠 '마지막 HH:mm (n줄)', err-google 'HH:mm까지 넣은 줄') */
  lastOk: FillDone | null
  /** 넣기 멈춤 = 마지막 넣기가 실패(탭 줄 주황 점·err-google). 다음에 넣으면 풀린다 */
  stopped: FillDone | null
  /** 띠 아래 결과 줄 */
  result: FillDone | null
}

const EMPTY: FillStatus = {
  pc: 'unknown',
  oldHelper: false,
  oldExtension: false,
  filling: null,
  last: null,
  lastOk: null,
  stopped: null,
  result: null,
}

let state: FillStatus = EMPTY
const listeners = new Set<() => void>()

function set(next: FillStatus): void {
  state = next
  for (const listener of [...listeners]) listener()
}

const timeOf = (done: FillDone) => Date.parse(done.at)
const readable = (done: FillDone) => Number.isFinite(timeOf(done))
const newer = (done: FillDone, than: FillDone | null) => than === null || timeOf(done) >= timeOf(than)
const succeeded = (done: FillDone) => done.outcome !== 'fail'
/** 넣은 날의 시트에 넣었나(지난 날 다시 넣기·지난 날 손 넣기가 아님) */
const ownDay = (done: FillDone) => done.day === todayInKorea(new Date(timeOf(done)))

function withRun(from: FillStatus, done: FillDone): FillStatus {
  const next = { ...from }
  if (newer(done, from.last)) {
    next.last = done
    next.stopped = succeeded(done) ? null : done
  }
  if (succeeded(done) && ownDay(done) && newer(done, from.lastOk)) next.lastOk = done
  return next
}

/** 지금 값(바뀌기 전에는 같은 값) */
function get(): FillStatus {
  return state
}

/** 바뀔 때마다 부른다. 돌려준 함수로 거둔다 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 넣는 PC인지·옛 판인지(같은 값이면 알리지 않음) */
function setPc(pc: FillPc, old: { helper: boolean; extension: boolean } = { helper: false, extension: false }): void {
  if (state.pc === pc && state.oldHelper === old.helper && state.oldExtension === old.extension) return
  set({ ...state, pc, oldHelper: old.helper, oldExtension: old.extension })
}

/** 넣기 시작. 다른 넣기가 돌고 있으면 거짓(시작하지 않음) */
function start(job: FillJob): boolean {
  if (state.filling !== null) return false
  set({ ...state, filling: job })
  return true
}

/** 넣기 끝. 다른 넣기가 돌아 못 한 것(BUSY_CODES)은 실패로 안 치고 넣는 중만 푼다 */
function finish(done: FillDone): void {
  const cleared = { ...state, filling: null }
  if (isBusyCode(done.code) || !readable(done)) {
    set(cleared)
    return
  }
  const next = withRun(cleared, done)
  if (done.via === 'hand') next.result = succeeded(done) ? done : null
  else if (done.outcome === 'warn') next.result = done
  set(next)
}

/** 서버 기록으로 채운다(지금 값보다 새 것만, 결과 줄은 띄우지 않음) */
function seed(runs: readonly FillDone[]): void {
  const list = runs.filter((done) => readable(done) && !isBusyCode(done.code)).sort((a, b) => timeOf(a) - timeOf(b))
  if (list.length === 0) return
  set(list.reduce(withRun, state))
}

/** 결과 줄 [✕] */
function dismissResult(): void {
  if (state.result === null) return
  set({ ...state, result: null })
}

/** 처음 상태로(시험·로그아웃). 듣는 쪽은 그대로 두고 알린다 */
function reset(): void {
  set(EMPTY)
}

export const fillStatus = { get, subscribe, setPc, start, finish, seed, dismissResult, reset }
