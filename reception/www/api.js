// 도우미에 묻기 (design.md 4·5·6·10절). 이 PC가 내준 화면이 같은 PC의 '/api/…'에만 묻는다(AC-1413.2, ADR-027).
// - 5초 안에 답(몸까지)이 다 오지 않으면 그 요청을 끊는다(AbortController). 끊어도 떨어지지 않는 fetch라도 5초에 실패다(AC-1407.4)
// - 읽기는 200, 쓰기는 204만 성공이다. 읽기 답은 모양을 검사해 틀리면 실패다(AC-1407.4). 화면은 받은 글을 그대로 그린다
// - 밖에서 준 signal(숨김·끊김 때 poll.js가 끊는다)이 끊기면 그 자리에서 실패하고, 그 뒤 온 답은 돌려주지 않는다(AC-1407.11)
// - 쓰기는 도우미 문 지키기(ClientGuard.WriteOk)가 받는 모양: POST · X-Reception: 1 · Content-Type: application/json · 몸 256바이트 이하.
//   Origin 머리는 브라우저가 붙인다(같은 곳 방식). 쿠키는 보내지 않고 되돌림(redirect)은 따라가지 않는다
//
// 쓰는 법
//   getBoard({ fresh, signal })      → GET /api/board(?fresh=1) 답 { state: 'ok', at, counts, lists }
//   getHistory(k, from, { signal })  → GET /api/visit/{k}/history?from=N 답 { visits, next, more, first, total, todaySym }
//   setXray(k, on, { signal })       → POST /api/xray { k, on } → 204
//   실패는 모두 ApiError이고 reason은 'network'·'timeout'·'status'·'shape'·'aborted'·'input'(묻지 않음) 중 하나다

/** 답(몸까지)을 기다리는 가장 긴 시간 (AC-1407.4) */
export const TIMEOUT_MS = 5000

/** 고르는 칸(진료 순서 + 칸 넷)과 줄의 상태 칸 (design.md 4절) */
const LISTS = ['queue', 'wait', 'hold', 'pay', 'done']
const LANES = ['wait', 'hold', 'pay', 'done']

/** 줄의 글 칸 (BoardModel.cs WriteRow) */
const ROW_TEXTS = ['laneLabel', 'chart', 'name', 'info', 'time', 'waited', 'memo', 'rxLabel', 'rx']

/** 화면용 열쇠: 16자리 소문자 16진수 (VisitKeys.cs) */
const KEY = /^[0-9a-f]{16}$/

/** PC가 비트를 읽은 시각 "HH:MM:SS" */
const AT = /^\d\d:\d\d:\d\d$/

/** 찍음 표시 시각 "HH:MM" */
const MARK_AT = /^\d\d:\d\d$/

const MESSAGES = {
  network: '접수 현황 PC에 연결하지 못했어요',
  timeout: '접수 현황 PC가 5초 안에 답하지 않았어요',
  status: '접수 현황 PC가 볼 수 없다고 답했어요',
  shape: '접수 현황 PC의 답 모양이 달라요',
  aborted: '읽기를 그만두었어요',
  input: '묻는 값의 모양이 틀렸어요',
}

/** 묻기 실패. 환자 글은 담지 않는다(까닭 이름만) */
export class ApiError extends Error {
  constructor(reason) {
    super(MESSAGES[reason] ?? MESSAGES.network)
    this.name = 'ApiError'
    this.reason = MESSAGES[reason] ? reason : 'network'
  }
}

/** 같은 곳 방식·쿠키 없음·되돌림 따라가지 않음·저장하지 않음 */
function request(signal, extra) {
  return { cache: 'no-store', credentials: 'omit', mode: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer', signal, ...extra }
}

/**
 * 접수 현황 판을 읽는다.
 * @param {{ fresh?: boolean, signal?: AbortSignal }} [options] fresh가 true면 도우미의 8초 묶음을 건너뛴다(AC-1407.10)
 */
export function getBoard({ fresh = false, signal } = {}) {
  return within(signal, async (inner) => {
    const res = await fetch(`/api/board${fresh === true ? '?fresh=1' : ''}`, request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isBoard(body)) throw new ApiError('shape')
    return body
  })
}

/**
 * 오늘 접수한 환자 한 명의 지난 진료를 읽는다(상세, design.md 5절).
 * @param {string} k 화면용 열쇠 @param {number} from 시작 위치(0, 그 뒤는 앞 답의 next)
 */
export function getHistory(k, from, { signal } = {}) {
  if (!isKey(k) || !isCount(from)) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(`/api/visit/${encodeURIComponent(k)}/history?from=${from}`, request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isHistory(body)) throw new ApiError('shape')
    return body
  })
}

/**
 * 진료보류 줄의 엑스레이 찍음 표시를 켜거나 끈다(design.md 6절). 204면 끝난다.
 * @param {string} k 화면용 열쇠 @param {boolean} on
 */
export function setXray(k, on, { signal } = {}) {
  if (!isKey(k) || typeof on !== 'boolean') return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(
      '/api/xray',
      request(inner, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Reception': '1' },
        body: JSON.stringify({ k, on }),
      }),
    )
    if (res.status !== 204) throw new ApiError('status')
  })
}

/**
 * run(안쪽 signal)을 5초 안에, 밖 signal이 끊기기 전에 끝낸다. 늦게 온 답·실패는 버린다.
 * 실패는 ApiError로 바꾼다(그 밖의 떨어짐은 연결 안 됨).
 */
function within(signal, run) {
  if (signal?.aborted) return Promise.reject(new ApiError('aborted'))
  const controller = new AbortController()
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (settle, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      settle(value)
    }
    const stop = (reason) => {
      finish(reject, new ApiError(reason))
      controller.abort()
    }
    const onAbort = () => stop('aborted')
    const timer = setTimeout(() => stop('timeout'), TIMEOUT_MS)
    signal?.addEventListener('abort', onAbort)
    run(controller.signal).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error instanceof ApiError ? error : new ApiError('network')),
    )
  })
}

/** 몸을 JSON으로 읽는다. JSON이 아니면 모양 틀림이다 */
async function bodyOf(res) {
  try {
    return await res.json()
  } catch {
    throw new ApiError('shape')
  }
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isCount(n) {
  return Number.isSafeInteger(n) && n >= 0
}

function isKey(k) {
  return typeof k === 'string' && KEY.test(k)
}

/** GET /api/board 200 모양 (design.md 4절, BoardModel.cs ToJson) */
function isBoard(b) {
  if (!isObject(b) || b.state !== 'ok' || typeof b.at !== 'string' || !AT.test(b.at)) return false
  if (!isObject(b.counts) || !isObject(b.lists)) return false
  return LISTS.every((name) => isCount(b.counts[name]) && Array.isArray(b.lists[name]) && b.lists[name].every(isRow))
}

function isRow(r) {
  return (
    isObject(r) &&
    isKey(r.k) &&
    LANES.includes(r.lane) &&
    (r.pos === null || (isCount(r.pos) && r.pos > 0)) &&
    ROW_TEXTS.every((name) => typeof r[name] === 'string') &&
    typeof r.long === 'boolean' &&
    (r.xray === null || (isObject(r.xray) && (r.xray.at === null || (typeof r.xray.at === 'string' && MARK_AT.test(r.xray.at)))))
  )
}

/** GET /api/visit/{k}/history 200 모양 (design.md 5절, HistoryBuilder.cs ToJson) */
function isHistory(h) {
  return (
    isObject(h) &&
    Array.isArray(h.visits) &&
    h.visits.every(isVisit) &&
    (h.next === null || isCount(h.next)) &&
    isCount(h.more) &&
    typeof h.first === 'string' &&
    isCount(h.total) &&
    typeof h.todaySym === 'string'
  )
}

function isVisit(v) {
  return (
    isObject(v) &&
    typeof v.date === 'string' &&
    typeof v.ago === 'string' &&
    typeof v.sym === 'string' &&
    Array.isArray(v.rx) &&
    v.rx.every((x) => isObject(x) && typeof x.name === 'string' && typeof x.code === 'string')
  )
}
