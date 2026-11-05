// 잇기 (design.md 10절). 다른 화면 파일을 이어 접수 현황 화면 하나로 만든다. 도우미에는 api.js로만 묻는다(같은 PC의 /api/…, AC-1413.2)
// - 읽기 고리(poll.js)가 답의 every초마다 판을 읽으면 그린다: 폰은 목록 또는 상세(해시 길 #/v/{열쇠}), 태블릿은 목록 + 오른쪽 고른 환자(layout.js)
// - 새 접수 알림(alert.js)은 읽기마다 판을 견준다. 처음·끊김 뒤·다시 보인 뒤 첫 읽기(info.first)는 알리지 않는다(AC-1408.1·1408.2)
// - [새로 고침]은 poll.refreshNow(), 읽는 동안 단추는 "읽는 중…"(AC-1407.10). [X-ray 완료]는 xray.js가 표시 뒤 poll.readNow()로 다시 읽는다
// - 숨김(visibilitychange hidden·pagehide)은 poll.pause(): 환자 글을 그 자리에서 지우고 늦은 답을 버린다. 다시 보임(visible·pageshow)은 poll.resume()
//   폰 상세 주소면 다시 보인 뒤 그 상세를 다시 읽는다(AC-1407.11). 끊김 뒤 돌아오면 목록이다(AC-1407.4)
// - 상세 읽기는 차례 번호(ticket)로 늦은 답을 버린다: 숨김·끊김·다른 환자·돌림 때마다 번호가 바뀐다
// - 문서 제목은 늘 "접수 현황"이다(환자 이름이 방문 기록에 남지 않게, AC-1407.5). 환자 자료는 메모리에만 있고 저장하지 않는다
//
// 쓰는 법
//   index.html이 이 파일을 module로 부르면 바로 연다(맨 아래 app). 시험은 app.stop()으로 듣기를 그만둔다

import { createAlert } from './alert.js'
import { getHistory, setXray } from './api.js'
import { fillPane, renderBoard, setReading } from './board.js'
import { detailPane, renderDetail, updateDetail } from './detail.js'
import { createLayout, findRow } from './layout.js'
import { createPoll } from './poll.js'
import { xrayBand } from './xray.js'

const TITLE = '접수 현황'

/** 폰 상세 길: #/v/{화면용 열쇠} */
const DETAIL_ROUTE = /^#\/v\/([0-9a-f]{16})$/

/** 폰 목록 길 */
const LIST_ROUTE = '#/'

/**
 * 접수 현황 화면을 연다.
 * @returns {{ stop: () => void }}
 */
export function startApp() {
  const doc = document
  const win = window
  const host = doc.getElementById('app')
  doc.title = TITLE

  /** 그렸거나 읽는 중인 상세의 열쇠(폰 상세 화면 또는 태블릿 오른쪽 칸). 없으면 null */
  let detailK = null
  /** 상세 읽기 차례. 바뀌면 앞서 나간 상세 읽기의 답은 버린다 */
  let ticket = 0
  /** 숨김으로 지우는 중인가(끊김 지우기와 나눈다) */
  let hiding = false

  const notice = createAlert()
  const unlistenNotice = notice.listen(doc)
  const layout = createLayout({ onChange: reshape })
  const poll = createPoll({ host, draw, wipe, onReading: (reading) => setReading(host, reading) })

  const band = (row) => xrayBand(row, { setXray, readNow: poll.readNow, signal: poll.signal })
  const moreOf = (k) => (next) => getHistory(k, next, { signal: poll.signal() })

  /** 목록 그리기 값: 고른 칸·모양·고른 환자 + 누름 처리 */
  function viewOf(reading) {
    return { ...layout.view(), reading: reading === true, onPick, onSelect, onRefresh: () => poll.refreshNow(), xray: band }
  }

  /** 읽기 성공마다 (poll.js) */
  function draw(board, info) {
    notice.check(board, info)
    if (layout.tablet()) drawTablet(board, info.reading)
    else drawPhone(board, info.reading)
    keepTitle()
  }

  /** 끊김·숨김 (poll.js가 화면을 지운 뒤): 앞 열쇠 모음·고른 환자·상세를 버린다 */
  function wipe() {
    notice.forget()
    layout.wipe()
    dropDetail()
    /* 끊김에서 돌아오면 목록이다(AC-1407.4). 숨김 뒤에는 상세 주소를 남겨 다시 읽는다(AC-1407.11) */
    if (!hiding && routeKey() !== null) replaceRoute(LIST_ROUTE)
  }

  /** 앞서 나간 상세 읽기를 버린다. 새 차례 번호를 돌려준다 */
  function dropDetail() {
    detailK = null
    ticket += 1
    return ticket
  }

  // ---- 폰 ------------------------------------------------------------------------------------------

  function drawPhone(board, reading) {
    const k = routeKey()
    if (k !== null) {
      const row = findRow(board, k)
      if (row) {
        phoneDetail(k, row, board)
        return
      }
      /* 그날 판에 없는 환자: 목록으로 */
      replaceRoute(LIST_ROUTE)
    }
    phoneList(board, reading)
  }

  function phoneList(board, reading) {
    if (detailK !== null) dropDetail()
    layout.select(null, board)
    renderBoard(host, board, viewOf(reading))
  }

  /** 폰 상세: 처음이면 지난 진료를 읽어 그리고, 이미 그렸으면 머리와 오늘 카드만 바꾼다(AC-1404.4) */
  function phoneDetail(k, row, board) {
    layout.select(k, board)
    if (detailK === k) {
      updateDetail(host, row)
      return
    }
    const mine = dropDetail()
    detailK = k
    getHistory(k, 0, { signal: poll.signal() }).then(
      (history) => {
        if (mine !== ticket || layout.tablet() || routeKey() !== k) return
        const now = findRow(poll.board(), k)
        if (now) renderDetail(host, now, history, { onMore: moreOf(k) })
        keepTitle()
      },
      () => {
        if (mine !== ticket) return
        /* 상세를 못 읽으면 목록으로 돌아간다 */
        detailK = null
        replaceRoute(LIST_ROUTE)
        const latest = poll.board()
        if (latest && !layout.tablet()) phoneList(latest, poll.reading())
      },
    )
  }

  /** 해시 길이 바뀜: 줄 누름(#/v/{열쇠})·[접수 현황](#/) */
  function routed() {
    const board = poll.board()
    if (!board || layout.tablet()) return
    drawPhone(board, poll.reading())
    keepTitle()
  }

  // ---- 태블릿 ---------------------------------------------------------------------------------------

  function drawTablet(board, reading) {
    const picked = layout.sync(board)
    renderBoard(host, board, viewOf(reading))
    showPane(picked)
  }

  /** 오른쪽 칸: 고른 환자가 같으면 오늘 카드만 바꾸고(AC-1409.3), 다르면 지난 진료를 새로 읽는다. 아무도 없으면 비운다 */
  function showPane({ picked, row }) {
    if (picked === detailK) {
      if (row) updateDetail(host, row)
      return
    }
    const mine = dropDetail()
    detailK = picked
    fillPane(host, null)
    if (picked === null || !row) return
    getHistory(picked, 0, { signal: poll.signal() }).then(
      (history) => {
        if (mine !== ticket || !layout.tablet()) return
        const now = findRow(poll.board(), picked)
        if (now) fillPane(host, detailPane(now, history, { onMore: moreOf(picked) }))
      },
      () => {
        /* 다음 읽기에 다시 읽는다 */
        if (mine === ticket) detailK = null
      },
    )
  }

  /** 태블릿 줄 누름 (board.js가 고른 줄 표시를 이미 바꿨다) */
  function onSelect(k) {
    const board = poll.board()
    if (!board || !layout.tablet()) return
    showPane(layout.select(k, board))
  }

  /** 칸 단추 누름 (board.js가 그 칸을 이미 그렸다). 태블릿에서 고른 환자가 바뀌면 다시 그린다 */
  function onPick(lane) {
    const board = poll.board()
    const picked = layout.pickLane(lane, board)
    if (!board || !layout.tablet() || picked.picked === detailK) return
    renderBoard(host, board, viewOf(poll.reading()))
    showPane(picked)
  }

  // ---- 돌림 (AC-1409.5) ------------------------------------------------------------------------------

  /** 폰 ↔ 태블릿: 폰은 고른 환자의 상세 길, 태블릿은 목록 + 오른쪽에 고른 환자 */
  function reshape({ tablet, picked }) {
    dropDetail()
    const board = poll.board()
    if (!board) return
    if (tablet) {
      if (routeKey() !== null) replaceRoute(LIST_ROUTE)
      drawTablet(board, poll.reading())
    } else {
      renderBoard(host, board, viewOf(poll.reading()))
      replaceRoute(picked ? `#/v/${picked}` : LIST_ROUTE)
      drawPhone(board, poll.reading())
    }
    keepTitle()
  }

  // ---- 숨김·다시 보임 (AC-1407.11) -------------------------------------------------------------------

  function hide() {
    hiding = true
    try {
      poll.pause()
    } finally {
      hiding = false
    }
  }

  function show() {
    poll.resume()
    keepTitle()
  }

  function visibility() {
    if (doc.visibilityState === 'hidden') hide()
    else show()
  }

  // ---- 길 --------------------------------------------------------------------------------------------

  /** 지금 해시 길의 상세 열쇠. 목록이면 null */
  function routeKey() {
    const found = DETAIL_ROUTE.exec(win.location.hash)
    return found ? found[1] : null
  }

  /** 방문 기록을 늘리지 않고 해시 길만 바꾼다(hashchange 없음) */
  function replaceRoute(hash) {
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash)
  }

  function keepTitle() {
    if (doc.title !== TITLE) doc.title = TITLE
  }

  doc.addEventListener('visibilitychange', visibility)
  win.addEventListener('pagehide', hide)
  win.addEventListener('pageshow', show)
  win.addEventListener('hashchange', routed)
  if (doc.visibilityState !== 'hidden') poll.start()

  return {
    stop() {
      doc.removeEventListener('visibilitychange', visibility)
      win.removeEventListener('pagehide', hide)
      win.removeEventListener('pageshow', show)
      win.removeEventListener('hashchange', routed)
      unlistenNotice()
      layout.stop()
      hide()
    },
  }
}

/** 브라우저가 이 파일을 부르면 바로 연다 */
export const app = document.getElementById('app') ? startApp() : null
