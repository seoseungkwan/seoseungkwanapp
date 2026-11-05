// 읽기 고리 (design.md 10절). 답의 every초마다 GET /api/board를 읽어 그리고, 끊기거나 숨겨지면 그 자리에서 지운다.
// - 간격은 PC 한 곳(ReceptionTiming.PollSeconds)이 정해 답의 every(초)로 보낸다. 화면의 간격 숫자는 처음 연결 전에만 쓰는
//   기본값(DEFAULT_EVERY) 하나뿐이다(AC-1403.9). 끊긴 뒤에는 마지막으로 받은 every를 쓴다
// - 다음 읽기는 답이 온 뒤 every초다. 읽기는 한 번에 하나라 요청이 겹치지 않는다(AC-1407.3)
// - 첫 실패(연결 안 됨·5초 넘음·200 아님·모양 틀림)에 판·상세를 모두 버리고 끊김 화면("마지막 연결 HH:MM")을 그린다.
//   그 연결의 signal도 끊어 나가 있던 상세 읽기가 늦게 그려지지 않게 한다. 끊긴 뒤에도 every초마다 다시 읽는다(AC-1407.4)
// - refreshNow(): 그 자리에서 ?fresh=1 하나. 도는 읽기가 있으면 그 뒤 한 번. 읽는 동안 더 불러도 요청이 늘지 않는다.
//   끝나면 그때부터 every초 뒤에 다음 저절로 읽기(AC-1407.10)
// - pause(): 지우기("불러오는 중이에요") + 고리 멈춤. 나가 있던 요청은 끊고 늦은 답은 세대 번호로 버린다. 기다리던 fresh·예약도 없앤다.
//   resume(): 바로 한 번 읽는다(AC-1407.11)
// - 기준 시각은 답의 at 그대로다(휴대폰 시계 없음). "마지막 연결"은 마지막으로 받은 at의 시:분이다
//
// 쓰는 법 (app.js)
//   const poll = createPoll({ host, draw, wipe, onReading })
//     host                 화면 자리(#app). 끊김·불러오는 중 화면을 여기에 그린다(offline.js)
//     draw(board, info)    읽기 성공마다. info.first: 처음·끊김 뒤·다시 보인 뒤 첫 읽기(새 접수 알림 안 함, AC-1408.2)
//                          info.reading: [새로 고침] 읽기가 아직 남았으면 true("읽는 중…")
//     wipe()               끊김·숨김 때. app.js가 가진 환자 자료(상세·고른 환자·앞 열쇠 모음)를 버린다
//     onReading(reading)   [새로 고침] 읽는 중 표시가 바뀔 때(setReading)
//     timers               { setTimeout, clearTimeout } 바꿔 끼우기(기본은 브라우저 것)
//   poll.start()           첫 읽기(= resume)
//   poll.refreshNow()      [새로 고침]: fresh 읽기
//   poll.readNow()         보통 읽기 한 번(찍음 표시 뒤 다시 읽기)
//   poll.pause() / poll.resume()   숨김(visibilitychange hidden·pagehide) / 다시 보임(visible·pageshow)
//   poll.board()           마지막으로 받은 판(끊김·숨김 뒤 null)
//   poll.lastAt()          마지막 연결 'HH:MM'(없으면 null)
//   poll.reading()         [새로 고침] 읽는 중인가
//   poll.signal()          지금 연결의 AbortSignal. getHistory·setXray에 넘기면 끊김·숨김 때 함께 끊긴다

import { getBoard } from './api.js'
import { renderLoading, renderOffline } from './offline.js'

/** 처음 연결 전(답을 한 번도 못 받았을 때)에만 쓰는 저절로 다시 읽는 간격(초). 그 뒤는 답의 every (AC-1403.9, AC-1407.4) */
export const DEFAULT_EVERY = 5

/**
 * 읽기 고리를 만든다. start()를 부르기 전에는 읽지 않는다.
 * @param {{ host: HTMLElement, draw: Function, wipe?: Function, onReading?: Function,
 *           timers?: { setTimeout: Function, clearTimeout: Function } }} options
 */
export function createPoll({ host, draw, wipe, onReading, timers } = {}) {
  const later = timers?.setTimeout ?? ((run, ms) => setTimeout(run, ms))
  const cancel = timers?.clearTimeout ?? ((id) => clearTimeout(id))

  let paused = true
  /** 숨길 때마다 늘린다. 앞 세대의 답은 버린다 */
  let generation = 0
  /** 지금 연결. 끊김·숨김 때 끊고 새로 만든다 */
  let session = new AbortController()
  let timer = null
  let inflight = false
  /** 도는 읽기 뒤에 할 읽기: null · 'plain' · 'fresh' */
  let pending = null
  let reading = false
  let first = true
  let board = null
  let lastAt = null
  /** 마지막으로 받은 읽기 간격(초). 환자 자료가 아니라 끊김·숨김 뒤에도 남긴다 */
  let every = DEFAULT_EVERY

  function setReading(next) {
    if (reading === next) return
    reading = next
    if (typeof onReading === 'function') onReading(next)
  }

  function stopTimer() {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  /** 읽기 하나를 지금 시작한다 */
  function begin(fresh) {
    stopTimer()
    inflight = true
    const gen = generation
    getBoard({ fresh, signal: session.signal }).then(
      (data) => done(gen, fresh, data),
      () => done(gen, fresh, null),
    )
  }

  function done(gen, fresh, data) {
    if (gen !== generation) return
    inflight = false
    if (fresh) setReading(false)
    try {
      if (data) show(data)
      else goOffline()
    } finally {
      if (gen === generation) next()
    }
  }

  /** 기다리던 읽기가 있으면 바로, 없으면 every초 뒤. draw 안에서 readNow()로 이미 읽기가 시작됐으면 그것을 기다린다 */
  function next() {
    if (inflight) return
    if (pending) {
      const fresh = pending === 'fresh'
      pending = null
      begin(fresh)
      return
    }
    timer = later(() => {
      timer = null
      begin(false)
    }, every * 1000)
  }

  function show(data) {
    board = data
    lastAt = data.at.slice(0, 5)
    every = data.every
    const info = { first, reading }
    first = false
    try {
      draw(data, info)
    } catch {
      // 반쯤 그린 환자 화면을 남기지 않는다
      goOffline()
    }
  }

  function goOffline() {
    renderOffline(host, { lastAt, every })
    forget()
  }

  /** 고리가 가진 환자 자료를 버리고 지금 연결을 끊는다. 화면은 부른 쪽이 이미 지웠다 */
  function forget() {
    board = null
    first = true
    session.abort()
    session = new AbortController()
    if (typeof wipe === 'function') wipe()
  }

  function request(fresh) {
    if (paused) return
    if (fresh) {
      if (reading) return
      setReading(true)
    }
    if (inflight) {
      pending = fresh || pending === 'fresh' ? 'fresh' : 'plain'
      return
    }
    begin(fresh)
  }

  function pause() {
    paused = true
    generation += 1
    inflight = false
    pending = null
    stopTimer()
    setReading(false)
    renderLoading(host)
    forget()
  }

  function resume() {
    if (!paused) return
    paused = false
    first = true
    renderLoading(host)
    begin(false)
  }

  return {
    start: resume,
    refreshNow: () => request(true),
    readNow: () => request(false),
    pause,
    resume,
    board: () => board,
    lastAt: () => lastAt,
    reading: () => reading,
    signal: () => session.signal,
  }
}
