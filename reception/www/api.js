// 도우미에 묻기 (design.md 4·5·6·10절). 이 PC가 내준 화면이 같은 PC의 '/api/…'에만 묻는다(AC-1413.2, ADR-027).
// - 5초 안에 답(몸까지)이 다 오지 않으면 그 요청을 끊는다(AbortController). 끊어도 떨어지지 않는 fetch라도 5초에 실패다(AC-1407.4)
// - 읽기는 200, 쓰기는 204만 성공이다. 읽기 답은 모양을 검사해 틀리면 실패다(AC-1407.4). 화면은 받은 글을 그대로 그린다
// - 밖에서 준 signal(숨김·끊김 때 poll.js가 끊는다)이 끊기면 그 자리에서 실패하고, 그 뒤 온 답은 돌려주지 않는다(AC-1407.11)
// - 쓰기는 도우미 문 지키기(ClientGuard.WriteOk)가 받는 모양: POST · X-Reception: 1 · Content-Type: application/json · 몸은 길마다 한도 이하
//   (/api/xray 256 · /api/arrange 1024 · /api/lists 8192바이트, reception-pick-lists AC-3502.4 · reception-arrange-tune AC-3603.2).
//   Origin 머리는 브라우저가 붙인다(같은 곳 방식). 쿠키는 보내지 않고 되돌림(redirect)은 따라가지 않는다
//   쓰기만 referrerPolicy 'same-origin'이다: 'no-referrer'(문서 기본값 포함)면 아이패드·아이폰 WebKit이 Origin: null을 붙여
//   도우미가 403으로 막는다(크롬은 진짜 Origin을 붙인다). mode가 same-origin이라 리퍼러는 이 PC에만 간다
//
// 쓰는 법
//   getBoard({ fresh, signal })      → GET /api/board(?fresh=1) 답 { state: 'ok', at, every, counts, lists, arrange, picks }
//                                      arrange(reception-arrange design.md 7절)는 있으면 모양을 보고, 없으면(옛 도우미) 그대로 받는다
//                                      (그리는 쪽 arrange.js·alert.js·board.js가 빈 표로 본다)
//                                      picks(고르기 목록, reception-pick-lists AC-3501.4 · reception-arrange-tune AC-3604.5)도
//                                      있으면 모양을 보고, 없으면 그대로 받는다. 어레인지 줄의 back·backWait(돌아옴, AC-3602.4)도 본다
//   getHistory(k, from, { signal })  → GET /api/visit/{k}/history?from=N 답 { visits, next, more, first, total, todaySym, paper(from=0만) }
//   setXray(k, on, { signal })       → POST /api/xray { k, on } → 204
//   setArrange(k, op, col, v, t, { signal }) → POST /api/arrange { k, op, col?, v?, t? } → 204 (reception-arrange design.md 8절.
//                                      col·v는 없으면, t(이름표를 "|"로 이은 글, reception-pick-lists AC-3502.3)는 없거나 빈 글이면 뺀다.
//                                      away v는 on·off·clear(되돌리기, reception-arrange-tune AC-3602.3))
//   setLists(picks, { signal })      → POST /api/lists picks → 204 (reception-pick-lists AC-3501.3. 몸은 picks 모양 칸만 담는다)
//   getPrev(k, { signal })           → GET /api/visit/{k}/prev 답의 prev(지난 내원이 없으면 null) (reception-arrange design.md 9절)
//   getPapers(k, from, { signal })   → GET /api/visit/{k}/papers?from=N 답 { papers: [prev 모양…], total, next } (reception-memo-papers design.md 4절)
//   다른 병원용 설정 (reception-other-clinic design.md 1·4절, AC-5708.2). 받은 값은 부른 쪽 메모리에만 둔다(저장소 없음, AC-5708.3)
//   getSettings({ signal })          → GET /api/settings 답(설정 문서 { rev, logo, tab, setup, nextX, cols, picks })
//   setSettings(doc, { signal })     → POST /api/settings 설정 문서(그 칸만 담음, 32768바이트까지) → 204면 'ok', 409(다른 기기가 먼저 바꿈)면 'conflict' 글
//   getCodes({ signal })             → GET /api/codes 답의 codes [{ c, n, v }] (지난 30일 처방, n은 사전에 없으면 null)
//   getCodeName(code, { signal })    → GET /api/code/{코드} 답의 n(사전 이름, 없으면 null). 코드는 대문자로 바꿔 묻는다
//   setLogo(bytes, type, { signal }) → POST /api/logo 그림 바이트(Content-Type image/png·image/jpeg, 2097152바이트까지) → 204
//   getLogo(ver, { signal })         → GET /api/logo 그림 → data: URL("data:image/png;base64,…"). ver(판 cfg.logo.ver)는 부른 쪽이 기억하는 판 번호다
//   판(getBoard)의 cfg { logo, tab, guide, cols }(AC-5703.1)는 늘 있어야 하고, 어레인지 줄 cells의 열쇠는 cfg.cols 안, picks.extra는 더한 칸만이다(AC-5708.1)
//   실패는 모두 ApiError이고 reason은 'network'·'timeout'·'status'·'shape'·'aborted'·'input'(묻지 않음) 중 하나다

/** 답(몸까지)을 기다리는 가장 긴 시간 (AC-1407.4) */
export const TIMEOUT_MS = 5000

/** 고르는 칸(진료 순서 + 칸 넷)과 줄의 상태 칸 (design.md 4절) */
const LISTS = ['queue', 'wait', 'hold', 'pay', 'done']
const LANES = ['wait', 'hold', 'pay', 'done']

/** 줄의 글 칸 (BoardModel.cs WriteRow) */
const ROW_TEXTS = ['laneLabel', 'chart', 'name', 'info', 'time', 'waited', 'memo', 'rxLabel', 'rx']

/** 종이 기록부 자료의 글 칸과 처방 줄의 글 칸 (reception-paper design.md 2절) */
const PAPER_TEXTS = ['res', 'addr', 'tel', 'cel', 'special', 'room', 'ins', 'sym']
const ORDER_TEXTS = ['code', 'name', 'qty', 'tms', 'day']

/** 화면용 열쇠: 16자리 소문자 16진수 (VisitKeys.cs) */
const KEY = /^[0-9a-f]{16}$/

/** PC가 비트를 읽은 시각 "HH:MM:SS" */
const AT = /^\d\d:\d\d:\d\d$/

/** 찍음 표시 시각 "HH:MM" */
const MARK_AT = /^\d\d:\d\d$/

/** PC가 정한 저절로 다시 읽는 간격 every(초)가 들어야 할 범위 (AC-1407.4). 간격 자체는 PC 한 곳(ReceptionTiming)이 정한다 */
const EVERY_RANGE = { min: 2, max: 60 }

/** 처음 일곱 칸(reception-arrange design.md 7절)·칸 단계·쓰기 이름 (8절) */
const ARRANGE_COLS = ['xray', 'sono', 'carm', 'pt', 'ds', 'eswt', 'trac']
const ARRANGE_STEPS = ['todo', 'ready', 'done']
const ARRANGE_OPS = ['step', 'set', 'add', 'remove', 'part', 'away', 'ptf', 'end']
const PTF_STEPS = ['up', 'down']

/** 설정에서 더한 칸 열쇠 x1…x99 (reception-other-clinic AC-5701.2) */
const ADDED_KEY = /^x[1-9][0-9]?$/

/** 칸은 모두 12개까지 (AC-5701.2) */
const COLS_MAX = 12

/** 로고 모양·칸 종류·칸 단계 (design.md 1절) */
const LOGO_MODES = ['pic', 'text', 'none']
const COL_KINDS = ['rx', 'mn']
const COL_STEPS = [2, 3]

/** 칸 이름 1~10글자, 로고 글 1~20글자(앞뒤 빈칸을 뺀 글자 수, AC-5701.1·5701.2) */
const NAME_MAX = 10
const LOGO_TEXT_MAX = 20

/** 제어 글자 (AC-5701.1). 짝 없는 대리쌍은 wellFormed가 본다(뒤를 보는 정규식은 옛 아이패드 사파리가 읽지 못한다) */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/

/** 처방 코드: 대문자로 바꾼 뒤 영문 대문자·숫자·한글·_ 1~16자, 칸마다 40개까지 (AC-5701.3) */
const CODE = /^[0-9A-Z가-힣_]{1,16}$/
const CODES_MAX = 40

/** 지난 30일 처방 목록은 200줄까지 (design.md 4절 TOP 200) */
const RECENT_MAX = 200

/** 로고 그림 형식 → 첫 바이트(PNG 서명 · JPEG FF D8 FF, AC-5706.1) */
const LOGO_TYPES = new Map([
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
])

/** 쓰기 몸 한도: 길마다(도우미 라우터와 같다, reception-pick-lists AC-3502.4 · reception-other-clinic design.md 4절) */
const BODY_MAX = { arrange: 1024, lists: 8192, settings: 32768, logo: 2097152 }

/** 직전 진료기록부 날짜 "yyyy-MM-dd" */
const DAY = /^\d{4}-\d\d-\d\d$/

/** 직전 진료기록부의 글 칸 (design.md 9절) */
const PREV_TEXTS = ['date', 'ago', 'room', 'ins', 'sym']

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

/** 쓰기 요청: POST · JSON · X-Reception: 1. WebKit이 진짜 Origin을 붙이게 리퍼러 정책은 same-origin(맨 위 설명) */
function writeRequest(signal, body) {
  return request(signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Reception': '1' },
    referrerPolicy: 'same-origin',
    body,
  })
}

/**
 * 접수 현황 판을 읽는다.
 * @param {{ fresh?: boolean, signal?: AbortSignal }} [options] fresh가 true면 도우미의 묶음 시간을 건너뛴다(AC-1407.10)
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
    if (!isHistory(body, from)) throw new ApiError('shape')
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
    const res = await fetch('/api/xray', writeRequest(inner, JSON.stringify({ k, on })))
    if (res.status !== 204) throw new ApiError('status')
  })
}

/**
 * 어레인지 표시 하나를 쓴다(reception-arrange design.md 8절). 204면 끝난다. 글(v)·이름표(t)가 고르기 목록에 있는지는 도우미가 본다(400).
 * @param {string} k 화면용 열쇠 @param {string} op step·set·add·remove·part·away·ptf·end
 * @param {string} [col] 칸(처음 일곱 칸 xray·sono·carm·pt·ds·eswt·trac 또는 더한 칸 x1…, reception-other-clinic AC-5703.4)
 * @param {string} [v] 글(away는 on·off·clear)
 * @param {string} [t] SONO 같이 하는 것·C-ARM 약재를 "|"로 이은 글(reception-pick-lists AC-3502.3). 빈 글이면 보내지 않는다
 */
export function setArrange(k, op, col, v, t, { signal } = {}) {
  if (!isKey(k) || !ARRANGE_OPS.includes(op)) return Promise.reject(new ApiError('input'))
  if ((col !== undefined && !isColKey(col)) || (v !== undefined && typeof v !== 'string')) return Promise.reject(new ApiError('input'))
  if (t !== undefined && typeof t !== 'string') return Promise.reject(new ApiError('input'))
  const ask = { k, op }
  if (col !== undefined) ask.col = col
  if (v !== undefined) ask.v = v
  if (t !== undefined && t !== '') ask.t = t
  return write(JSON.stringify(ask), BODY_MAX.arrange, signal, (init) => fetch('/api/arrange', init))
}

/**
 * 고르기 목록 전체(C-ARM·SONO·PT·도수·충격파·견인)를 쓴다(reception-pick-lists AC-3501.3 · reception-arrange-tune AC-3604.5).
 * 204면 끝난다. 이름·개수 규칙은 도우미가 본다(400). 몸은 판 picks 모양 칸만 담는다(더 붙은 칸은 뺀다)
 * @param {{ carm: { procs: { n: string, noDrug: boolean }[], drugs: string[] }, sono: { parts: string[], plains: string[], withs: string[] },
 *   pt: string[], ds: string[], eswt: { hits: string[], counts: string[] }, trac: string[] }} picks
 */
export function setLists(picks, { signal } = {}) {
  if (!isPicks(picks)) return Promise.reject(new ApiError('input'))
  const { carm, sono, pt, ds, eswt, trac } = picks
  const body = JSON.stringify({
    carm: { procs: carm.procs.map(({ n, noDrug }) => ({ n, noDrug })), drugs: carm.drugs },
    sono: { parts: sono.parts, plains: sono.plains, withs: sono.withs },
    pt,
    ds,
    eswt: { hits: eswt.hits, counts: eswt.counts },
    trac,
  })
  return write(body, BODY_MAX.lists, signal, (init) => fetch('/api/lists', init))
}

/** 쓰기 하나: 몸이 그 길 한도를 넘으면 보내지 않는다(input). post가 쓰기 요청을 그 길에 보낸다. 204만 성공이다 */
function write(body, max, signal, post) {
  if (new TextEncoder().encode(body).length > max) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await post(writeRequest(inner, body))
    if (res.status !== 204) throw new ApiError('status')
  })
}

// ---- 다른 병원용 설정·처방 목록·로고 (reception-other-clinic design.md 1·4절, AC-5708.2) ------------------------------

/**
 * 설정 문서 전체를 읽는다(AC-5704.1).
 * @returns {Promise<object>} { rev, logo, tab, setup, nextX, cols, picks }
 */
export function getSettings({ signal } = {}) {
  return within(signal, async (inner) => {
    const res = await fetch('/api/settings', request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isSettings(body)) throw new ApiError('shape')
    return body
  })
}

/**
 * 설정 문서 전체를 쓴다(AC-5704.2). 몸은 설정 문서 칸만 담는다(더 붙은 칸은 뺀다). 이름·개수·바꿀 수 없는 것은 도우미가 본다(400).
 * @param {object} doc getSettings 모양의 문서(rev는 읽은 그대로)
 * @returns {Promise<'ok' | 'conflict'>} 204면 'ok', 409(그 사이 다른 기기가 바꿈)면 'conflict'
 */
export function setSettings(doc, { signal } = {}) {
  if (!isSettings(doc)) return Promise.reject(new ApiError('input'))
  const body = JSON.stringify(settingsBody(doc))
  if (new TextEncoder().encode(body).length > BODY_MAX.settings) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch('/api/settings', writeRequest(inner, body))
    if (res.status === 204) return 'ok'
    if (res.status === 409) return 'conflict'
    throw new ApiError('status')
  })
}

/**
 * 지난 30일 처방 목록을 읽는다(AC-5705.1, 내원 많은 순).
 * @returns {Promise<{ c: string, n: string | null, v: number }[]>}
 */
export function getCodes({ signal } = {}) {
  return within(signal, async (inner) => {
    const res = await fetch('/api/codes', request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isObject(body) || !Array.isArray(body.codes) || body.codes.length > RECENT_MAX || !body.codes.every(isRecentCode)) throw new ApiError('shape')
    return body.codes
  })
}

/**
 * 직접 넣는 코드 하나의 사전 이름을 읽는다(AC-5705.3). 코드는 앞뒤 빈칸을 빼고 대문자로 바꿔 묻는다.
 * @param {string} code
 * @returns {Promise<string | null>} 사전에 없으면 null
 */
export function getCodeName(code, { signal } = {}) {
  const c = typeof code === 'string' ? code.trim().toUpperCase() : ''
  if (!CODE.test(c)) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(`/api/code/${encodeURIComponent(c)}`, request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isObject(body) || typeof body.c !== 'string' || !(body.n === null || typeof body.n === 'string')) throw new ApiError('shape')
    return body.n
  })
}

/**
 * 병원 로고 그림을 올린다(AC-5706.1). 줄이기는 부른 쪽(settings.js)이 이미 했다. 서명·그림 크기는 도우미가 본다(400).
 * @param {ArrayBuffer | ArrayBufferView} bytes 그림 바이트(1~2097152바이트) @param {'image/png' | 'image/jpeg'} type
 */
export function setLogo(bytes, type, { signal } = {}) {
  const body = bytesOf(bytes)
  if (body === null || body.byteLength === 0 || body.byteLength > BODY_MAX.logo || !LOGO_TYPES.has(type)) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(
      '/api/logo',
      request(inner, { method: 'POST', headers: { 'Content-Type': type, 'X-Reception': '1' }, referrerPolicy: 'same-origin', body }),
    )
    if (res.status !== 204) throw new ApiError('status')
  })
}

/**
 * 병원 로고 그림을 읽어 data: URL로 돌려준다(AC-5706.2·5709.1). 부른 쪽이 ver별로 메모리에 하나 두고 ver가 바뀔 때만 다시 부른다.
 * @param {number} ver 판 cfg.logo.ver(1 이상)
 * @returns {Promise<string>} "data:image/png;base64,…" 또는 "data:image/jpeg;base64,…"
 */
export function getLogo(ver, { signal } = {}) {
  if (!Number.isSafeInteger(ver) || ver < 1) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch('/api/logo', request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const type = (res.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
    const head = LOGO_TYPES.get(type)
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (!head || bytes.length === 0 || bytes.length > BODY_MAX.logo || !head.every((b, i) => bytes[i] === b)) throw new ApiError('shape')
    return `data:${type};base64,${base64Of(bytes)}`
  })
}

/** 올릴 그림 바이트: ArrayBuffer·ArrayBufferView만(글·배열은 아님) */
function bytesOf(bytes) {
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes)
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return null
}

/** 바이트 → base64 (큰 그림도 한 번에 String.fromCharCode 인자가 넘치지 않게 나눠 바꾼다) */
function base64Of(bytes) {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

/** 설정 문서 몸: 정해 둔 칸만 담는다(rule은 xray 칸에만) */
function settingsBody(doc) {
  const { rev, logo, tab, setup, nextX, cols, picks } = doc
  return {
    rev,
    logo: { mode: logo.mode, text: logo.text, ver: logo.ver },
    tab,
    setup: { logo: setup.logo, tab: setup.tab, done: setup.done },
    nextX,
    cols: cols.map(({ k, name, kind, steps, show, added, rule, codes }) => ({ k, name, kind, steps, show, added, ...(k === 'xray' ? { rule } : {}), codes })),
    picks: { ...picksBody(picks), extra: Object.fromEntries(Object.keys(picks.extra).map((k) => [k, picks.extra[k]])) },
  }
}

/** 고르기 목록 몸: picks 모양 칸만 담는다 */
function picksBody({ carm, sono, pt, ds, eswt, trac }) {
  return {
    carm: { procs: carm.procs.map(({ n, noDrug }) => ({ n, noDrug })), drugs: carm.drugs },
    sono: { parts: sono.parts, plains: sono.plains, withs: sono.withs },
    pt,
    ds,
    eswt: { hits: eswt.hits, counts: eswt.counts },
    trac,
  }
}

/**
 * 오늘 접수한 환자의 직전 내원 종이 기록부를 읽는다(reception-arrange design.md 9절).
 * @param {string} k 화면용 열쇠
 * @returns {Promise<object | null>} prev(지난 내원이 없으면 null)
 */
export function getPrev(k, { signal } = {}) {
  if (!isKey(k)) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(`/api/visit/${encodeURIComponent(k)}/prev`, request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isObject(body) || !(body.prev === null || isPrev(body.prev))) throw new ApiError('shape')
    return body.prev
  })
}

/**
 * 오늘 접수한 환자의 지난 진료기록부 한 쪽을 읽는다(reception-memo-papers design.md 4절). from=0이면 최근 두 장, 그 뒤는 세 장씩이다.
 * @param {string} k 화면용 열쇠 @param {number} from 시작 위치(0, 그 뒤는 앞 답의 next)
 * @returns {Promise<{ papers: object[], total: number, next: number | null }>}
 */
export function getPapers(k, from, { signal } = {}) {
  if (!isKey(k) || !isCount(from)) return Promise.reject(new ApiError('input'))
  return within(signal, async (inner) => {
    const res = await fetch(`/api/visit/${encodeURIComponent(k)}/papers?from=${from}`, request(inner))
    if (res.status !== 200) throw new ApiError('status')
    const body = await bodyOf(res)
    if (!isPapers(body, from)) throw new ApiError('shape')
    return body
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

/**
 * GET /api/board 200 모양 (design.md 4절, BoardModel.cs ToJson). cfg는 늘 있어야 하고(reception-other-clinic AC-5708.1),
 * 어레인지 줄 cells의 열쇠는 cfg.cols 안, picks.extra(없어도 됨)의 열쇠는 cfg의 더한 칸이다
 */
function isBoard(b) {
  if (!isObject(b) || b.state !== 'ok' || typeof b.at !== 'string' || !AT.test(b.at)) return false
  if (!isEvery(b.every)) return false
  if (!isCfg(b.cfg)) return false
  if (!isObject(b.counts) || !isObject(b.lists)) return false
  const keys = new Set(b.cfg.cols.map((col) => col.k))
  if (b.arrange !== undefined && !isArrange(b.arrange, keys)) return false
  if (b.picks !== undefined && !(isPicks(b.picks) && (b.picks.extra === undefined || isExtra(b.picks.extra, addedKeys(b.cfg.cols), false)))) return false
  return LISTS.every((name) => isCount(b.counts[name]) && Array.isArray(b.lists[name]) && b.lists[name].every(isRow))
}

/** 판 cfg { logo, tab, guide, cols: [{ k, name, kind, steps, added, empty }] } (AC-5703.1): 보이는 칸 1~12개, 열쇠·이름은 겹치지 않는다 */
function isCfg(c) {
  return (
    isObject(c) &&
    isLogo(c.logo) &&
    typeof c.tab === 'boolean' &&
    typeof c.guide === 'boolean' &&
    Array.isArray(c.cols) &&
    c.cols.length >= 1 &&
    c.cols.length <= COLS_MAX &&
    c.cols.every((col) => isColBase(col) && typeof col.empty === 'boolean') &&
    unique(c.cols.map((col) => col.k)) &&
    unique(c.cols.map((col) => col.name.trim()))
  )
}

/** 로고 { mode, text, ver } (AC-5701.1): text는 null 또는 1~20글자, mode가 text면 null이 아니다 */
function isLogo(l) {
  return (
    isObject(l) &&
    LOGO_MODES.includes(l.mode) &&
    isCount(l.ver) &&
    (l.text === null || isText(l.text, LOGO_TEXT_MAX)) &&
    (l.mode !== 'text' || l.text !== null)
  )
}

/** 판·설정 공통 칸 { k, name, kind, steps, added } (AC-5701.2): 처음 일곱 칸은 added 거짓, 더한 칸(x1…)은 참 */
function isColBase(col) {
  return (
    isObject(col) &&
    isColKey(col.k) &&
    isText(col.name, NAME_MAX) &&
    !col.name.includes('|') &&
    COL_KINDS.includes(col.kind) &&
    COL_STEPS.includes(col.steps) &&
    col.added === ADDED_KEY.test(col.k)
  )
}

/** 칸 열쇠: 처음 일곱 칸 또는 더한 칸 x1…x99 */
function isColKey(k) {
  return typeof k === 'string' && (ARRANGE_COLS.includes(k) || ADDED_KEY.test(k))
}

/** 글: 앞뒤 빈칸을 뺀 1~max글자(코드 포인트), 제어 글자·짝 없는 대리쌍 없음 */
function isText(text, max) {
  if (typeof text !== 'string' || CONTROL.test(text) || !wellFormed(text)) return false
  const length = [...text.trim()].length
  return length >= 1 && length <= max
}

/** 짝 없는 대리쌍(깨진 글자)이 없다 */
function wellFormed(text) {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false
  }
  return true
}

function unique(list) {
  return new Set(list).size === list.length
}

/** 칸 목록의 더한 칸 열쇠 */
function addedKeys(cols) {
  return cols.filter((col) => col.added === true).map((col) => col.k)
}

/**
 * picks.extra { 더한 칸 열쇠: 이름 목록 } (AC-5701.4·5703.6). 판은 보이는 더한 칸 안이면 되고(exact 거짓),
 * 설정 문서는 더한 칸 열쇠와 정확히 같아야 한다(exact 참)
 */
function isExtra(extra, keys, exact) {
  if (!isObject(extra)) return false
  const names = Object.keys(extra)
  if (!names.every((k) => keys.includes(k) && isTexts(extra[k]))) return false
  return !exact || names.length === keys.length
}

/** 판의 arrange 모양 (reception-arrange design.md 7절, ArrangeBuilder). 줄 cells의 열쇠는 keys(cfg.cols) 안이다 */
function isArrange(a, keys) {
  return (
    isObject(a) &&
    Array.isArray(a.rows) &&
    a.rows.every((row) => isArrangeRow(row, keys)) &&
    Array.isArray(a.ended) &&
    a.ended.every(isEnded)
  )
}

/**
 * 설정 문서 (design.md 1절, AC-5701.1~4): 처음 일곱 칸이 모두 한 번씩, 더한 칸 열쇠는 nextX보다 작고, 칸은 12개까지·보이는 칸 1개 이상,
 * rule은 xray 칸에만, codes는 칸마다 40개까지(한 칸 안에서 겹치지 않음), picks.extra는 더한 칸 열쇠와 정확히 같다
 */
function isSettings(d) {
  return (
    isObject(d) &&
    isCount(d.rev) &&
    isLogo(d.logo) &&
    typeof d.tab === 'boolean' &&
    isObject(d.setup) &&
    typeof d.setup.logo === 'boolean' &&
    typeof d.setup.tab === 'boolean' &&
    typeof d.setup.done === 'boolean' &&
    isCount(d.nextX) &&
    Array.isArray(d.cols) &&
    d.cols.length <= COLS_MAX &&
    d.cols.every((col) => isSettingsCol(col, d.nextX)) &&
    unique(d.cols.map((col) => col.k)) &&
    unique(d.cols.map((col) => col.name.trim())) &&
    ARRANGE_COLS.every((k) => d.cols.some((col) => col.k === k)) &&
    d.cols.some((col) => col.show) &&
    isPicks(d.picks) &&
    isExtra(d.picks.extra, addedKeys(d.cols), true)
  )
}

/** 설정 칸 하나 { k, name, kind, steps, show, added, rule(xray만), codes } */
function isSettingsCol(col, nextX) {
  return (
    isColBase(col) &&
    typeof col.show === 'boolean' &&
    (col.k === 'xray' ? typeof col.rule === 'boolean' : col.rule === undefined) &&
    (!col.added || Number(col.k.slice(1)) < nextX) &&
    Array.isArray(col.codes) &&
    col.codes.length <= CODES_MAX &&
    col.codes.every((code) => typeof code === 'string' && CODE.test(code)) &&
    unique(col.codes)
  )
}

/** 지난 30일 처방 한 줄 { c, n, v } */
function isRecentCode(r) {
  return isObject(r) && typeof r.c === 'string' && CODE.test(r.c) && (r.n === null || typeof r.n === 'string') && isCount(r.v)
}

/** 끝난 줄 { k, endedAt, paid }: paid는 참·거짓·없음, endedAt은 "HH:MM"이고 수납완료로 빠진 줄(paid)만 null도 된다(AC-3308.15) */
function isEnded(e) {
  if (!isObject(e) || !isKey(e.k)) return false
  if (e.paid !== undefined && typeof e.paid !== 'boolean') return false
  return isMark(e.endedAt) || (e.paid === true && e.endedAt === null)
}

/**
 * 어레인지 줄 { k, away, back, backWait, ptf, last, cells, allDone }: back은 돌아온 시:분, backWait는 "12분째" 같은 글 (reception-arrange-tune AC-3602.4).
 * cells의 열쇠는 keys(판 cfg.cols의 k) 안이다(숨긴 칸·지운 칸 열쇠 없음, reception-other-clinic AC-5703.2)
 */
function isArrangeRow(r, keys) {
  return (
    isObject(r) &&
    isKey(r.k) &&
    (r.away === null || isMark(r.away)) &&
    (r.back === null || isMark(r.back)) &&
    (r.backWait === null || (typeof r.backWait === 'string' && r.backWait !== '')) &&
    (r.ptf === null || (isObject(r.ptf) && PTF_STEPS.includes(r.ptf.st) && isMark(r.ptf.at))) &&
    typeof r.last === 'string' &&
    isObject(r.cells) &&
    Object.keys(r.cells).every((col) => keys.has(col) && (r.cells[col] === null || isCell(r.cells[col]))) &&
    typeof r.allDone === 'boolean'
  )
}

/**
 * 고르기 목록 { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs }, pt, ds, eswt: { hits, counts }, trac }
 * (reception-pick-lists AC-3501.4 · reception-arrange-tune AC-3604.5). 모양만 본다(이름·개수 규칙은 도우미 PickLists가 본다)
 */
function isPicks(p) {
  return (
    isObject(p) &&
    isObject(p.carm) &&
    Array.isArray(p.carm.procs) &&
    p.carm.procs.every((proc) => isObject(proc) && typeof proc.n === 'string' && typeof proc.noDrug === 'boolean') &&
    isTexts(p.carm.drugs) &&
    isObject(p.sono) &&
    isTexts(p.sono.parts) &&
    isTexts(p.sono.plains) &&
    isTexts(p.sono.withs) &&
    isTexts(p.pt) &&
    isTexts(p.ds) &&
    isObject(p.eswt) &&
    isTexts(p.eswt.hits) &&
    isTexts(p.eswt.counts) &&
    isTexts(p.trac)
  )
}

/** 글 목록 */
function isTexts(list) {
  return Array.isArray(list) && list.every((text) => typeof text === 'string')
}

/** 칸 { st, det, part, at, ord, manual, tags }: part는 여러 줄이면 "|"로 이은 글, tags는 늘 글 목록이다(reception-pick-lists AC-3502.2) */
function isCell(c) {
  return (
    isObject(c) &&
    ARRANGE_STEPS.includes(c.st) &&
    typeof c.det === 'string' &&
    (c.part === null || typeof c.part === 'string') &&
    isTexts(c.tags) &&
    // 비트 처방 시각이 빈 줄이면 시각을 모른다(null). 그 한 칸 때문에 판 전체를 버리지 않는다
    (c.at === null || typeof c.at === 'string') &&
    (c.ord === null || (isCount(c.ord) && c.ord > 0)) &&
    typeof c.manual === 'boolean'
  )
}

/** 직전 종이 { date, ago, room, ins, sym, dx, rx, out } (design.md 9절, 칸 모양은 reception-paper paper와 같다) */
function isPrev(p) {
  return (
    isObject(p) &&
    PREV_TEXTS.every((name) => typeof p[name] === 'string') &&
    DAY.test(p.date) &&
    Array.isArray(p.dx) &&
    p.dx.every((d) => isObject(d) && typeof d.code === 'string' && typeof d.name === 'string' && typeof d.main === 'boolean') &&
    Array.isArray(p.rx) &&
    p.rx.every(isOrder) &&
    Array.isArray(p.out) &&
    p.out.every(isOrder)
  )
}

/**
 * 지난 진료기록부 한 쪽 { papers, total, next } (reception-memo-papers design.md 4절, PastPapers.ToJson). 종이 칸은 직전 종이와 같다.
 * next는 더 있으면 이번 시작 위치보다 크고 total 이하인 다음 시작 위치, 없으면 null이다(같은 쪽을 다시 묻지 않게)
 */
function isPapers(p, from) {
  return (
    isObject(p) &&
    Array.isArray(p.papers) &&
    p.papers.every(isPrev) &&
    isCount(p.total) &&
    (p.next === null || (isCount(p.next) && p.next > from && p.next <= p.total))
  )
}

/** 표시 시각 "HH:MM" */
function isMark(at) {
  return typeof at === 'string' && MARK_AT.test(at)
}

/** 읽기 간격(초): 2~60 정수. 없거나 그 밖이면 모양이 틀린 답이다 (AC-1407.4) */
function isEvery(n) {
  return Number.isSafeInteger(n) && n >= EVERY_RANGE.min && n <= EVERY_RANGE.max
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

/**
 * GET /api/visit/{k}/history 200 모양 (design.md 5절, HistoryBuilder.cs ToJson). from=0 답은 paper가 있어야 한다(AC-1502.5).
 * from>0 답에는 paper가 오지 않고(AC-1501.1) 화면도 쓰지 않아 보지 않는다
 */
function isHistory(h, from) {
  return (
    isObject(h) &&
    Array.isArray(h.visits) &&
    h.visits.every(isVisit) &&
    (h.next === null || isCount(h.next)) &&
    isCount(h.more) &&
    typeof h.first === 'string' &&
    isCount(h.total) &&
    typeof h.todaySym === 'string' &&
    (from !== 0 || isPaper(h.paper))
  )
}

/** 종이 기록부 자료 (reception-paper design.md 2절): 글 칸 여덟, 상병 { code, name, main }, 처방·원외처방 { code, name, qty, tms, day } */
function isPaper(p) {
  return (
    isObject(p) &&
    PAPER_TEXTS.every((name) => typeof p[name] === 'string') &&
    Array.isArray(p.dx) &&
    p.dx.every((d) => isObject(d) && typeof d.code === 'string' && typeof d.name === 'string' && typeof d.main === 'boolean') &&
    Array.isArray(p.rx) &&
    p.rx.every(isOrder) &&
    Array.isArray(p.out) &&
    p.out.every(isOrder)
  )
}

function isOrder(o) {
  return isObject(o) && ORDER_TEXTS.every((name) => typeof o[name] === 'string')
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
