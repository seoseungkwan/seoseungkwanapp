// 잇기 (design.md 10절). 다른 화면 파일을 이어 접수 현황 화면 하나로 만든다. 도우미에는 api.js로만 묻는다(같은 PC의 /api/…, AC-1413.2)
// - 읽기 고리(poll.js)가 답의 every초마다 판을 읽으면 그린다: 폰은 목록 또는 상세(해시 길 #/v/{열쇠}), 태블릿은 목록 + 오른쪽 고른 환자(layout.js)
// - 새 접수 알림(alert.js)은 읽기마다 판을 견준다. 처음·끊김 뒤·다시 보인 뒤 첫 읽기(info.first)는 알리지 않는다(AC-1408.1·1408.2)
// - [새로 고침]은 poll.refreshNow(), 읽는 동안 단추는 "읽는 중…"(AC-1407.10). [X-ray 완료]는 xray.js가 표시 뒤 poll.readNow()로 다시 읽는다
// - 숨김(visibilitychange hidden·pagehide)은 poll.pause(): 환자 글을 그 자리에서 지우고 늦은 답을 버린다. 다시 보임(visible·pageshow)은 poll.resume()
//   폰 상세 주소면 다시 보인 뒤 그 상세를 다시 읽는다(AC-1407.11). 끊김 뒤 돌아오면 목록이다(AC-1407.4)
// - 상세 읽기는 차례 번호(ticket)로 늦은 답을 버린다: 숨김·끊김·다른 환자·돌림 때마다 번호가 바뀐다
// - 상세를 그린 뒤 지난 진료기록부 첫 쪽(papers?from=0)을 한 번 읽어 채운다(detail.js fillPast, reception-memo-papers AC-3404.3).
//   [더 보기]는 detail.js가 onMore(next)로 묻고 여기서 읽는다(같은 차례 번호). 저절로 다시 읽기에는 다시 읽지 않는다(AC-3404.5)
// - 상세가 열린 동안 읽기마다 그 환자 줄의 칸·오늘 처방이 마지막 상세 읽기 때와 다르거나 30초가 지났으면 상세를 한 번 더 읽어
//   종이 카드를 새 paper로 바꾼다(AC-1404.8·1502.4, 특이사항 펼침은 그대로). 한 번에 하나만 읽고, 실패하면 그대로 두었다가 다음 읽기에 다시 본다
// - 태블릿 오른쪽 칸은 상세를 넣은 뒤 특이사항 높이를 잰다(detail.js fitSpecial, AC-1502.2). 폰 상세는 renderDetail이 스스로 잰다.
//   화면 폭이 바뀌면(기기 돌림·창 크기) 글이 다시 접혀 높이가 바뀌므로 다시 잰다
// - 문서 제목은 늘 "접수 현황"이다(환자 이름이 방문 기록에 남지 않게, AC-1407.5). 환자 자료는 메모리에만 있고 저장하지 않는다
// - 어레인지 탭(reception-arrange design.md 10절): 해시 길 #/a는 어레인지 표(arrange.js), #/a/v/{열쇠}는 기록부(charts.js). 머리 탭 단추는
//   해시만 바꾼다(#/a ↔ #/, AC-3308.1). 어레인지 탭이 보이면 처방 나옴을 견준다(alert.js checkRx, AC-3310.1~3)
//   · 칸 누름: 쓰기를 판에 미리 얹어(arrange.js planOf) 그 자리에서 그리고 POST /api/arrange. 204면 판을 다시 읽고, 실패(204 아님·5초)면 미리 얹은 것을
//     버려 판의 값으로 되그리고 띠 "저장하지 못했어요…"(AC-3308.9). 같은 칸(줄 표시는 그 표시)에 나가 있는 쓰기가 있으면 누름을 버린다.
//     답을 기다리는 동안 다시 읽은 판에도 미리 얹은 것을 그대로 얹는다. 204 뒤 다음 판이 오면 내린다
//   · 되돌리기 띠는 5초. [되돌리기]는 planOf가 준 반대 쓰기를 보낸다(앞 쓰기가 아직 나가 있으면 그 쓰기가 끝난 뒤)
//   · 목록 고치기 [저장](reception-pick-lists AC-3505.3): POST /api/lists. 204면 띠 "목록을 저장했어요" 뒤 판을 다시 읽고 창을 닫는다.
//     아니면 띠 "목록을 저장하지 못했어요"이고 창은 그대로다(picks.js). 숨김·끊김 뒤 온 답은 버린다
//   · '처방 나옴' 열쇠와 끝 시각(60초), 고른 창, [오늘 치료 종료] 펼침, 기록부 자료, 표의 세로 위치는 메모리에만 둔다(AC-3308.11·3310.2)
//   · 기록부: 오늘 종이(history?from=0)는 상세와 같은 조건(칸·오늘 처방이 바뀌거나 30초)으로만 다시 읽고 직전 종이(prev)는 한 번만 읽는다.
//     실패한 칸은 다음 저절로 읽기에 다시 본다(AC-3309.3·3309.5). 그 환자가 판에서 사라지면 표(#/a)로 돌아간다
//     그 전 진료기록부(papers?from=1)는 환자를 열 때 한 번만 읽고(실패하면 한 줄, 다시 읽지 않음) [더 보기]는 papers?from=next다.
//     다른 환자·숨김·끊김 뒤 온 답은 버린다(reception-arrange-tune AC-3605.3·3605.4)
//   · 숨김·끊김은 어레인지 상태를 모두 지운다. 숨김 뒤에는 주소(#/a·#/a/v/{열쇠})를 남겨 다시 읽고, 끊김 뒤에는 표(#/a)다(AC-3312.2)
// - 다른 병원용 머리 (reception-other-clinic REQ-5708·5709)
//   · 로고: 판 cfg.logo가 pic이면 getLogo(ver)로 그림을 한 번 받아 data: URL을 메모리에 하나({ ver, src }) 두고 다시 그리기마다 쓴다.
//     ver가 같으면 다시 받지 않고(실패해도 같은 ver는 다시 묻지 않음), ver가 바뀌면 한 번 받는다. 받으면 그 자리에서 다시 그린다(AC-5709.1).
//     목록·어레인지 머리(board.js topOf)와 폰 상세 머리의 작은 로고(detail.js)가 쓰고, 그리기마다 끊김 화면용으로 offline.js rememberLogo에 넣는다.
//     숨김·끊김(wipe)은 그림도 지운다(AC-5708.3). 브라우저 저장소에는 두지 않는다
//   · [⚙ 설정](두 탭 머리)은 설정 쪽 길 #/s를 연다(AC-5709.2). 설정 쪽 그리기는 settings.js(다음 일) 몫이라 지금은 빈 쪽이다
//   · 판 cfg.tab이 거짓이면 #/a·#/a/v/{열쇠}는 [접수 현황](#/)으로 바꾼다(AC-5709.3)
//
// 쓰는 법
//   index.html이 이 파일을 module로 부르면 바로 연다(맨 아래 app). 시험은 app.stop()으로 듣기를 그만둔다

import { createAlert } from './alert.js'
import { getHistory, getLogo, getPapers, getPrev, setArrange, setLists, setXray } from './api.js'
import { planOf, renderArrange } from './arrange.js'
import { fillPane, renderBoard, setReading } from './board.js'
import { renderCharts } from './charts.js'
import { detailPane, fillPast, fitSpecial, renderDetail, updateDetail, updatePaper } from './detail.js'
import { clear, el } from './dom.js'
import { createLayout, findRow } from './layout.js'
import { closeMemo } from './memo.js'
import { rememberLogo } from './offline.js'
import { createPoll } from './poll.js'
import { xrayBand } from './xray.js'

const TITLE = '접수 현황'

/** 어레인지 표 길과 기록부 길: #/a, #/a/v/{화면용 열쇠} (reception-arrange AC-3308.1·3309.1) */
const ARRANGE_ROUTE = '#/a'
const CHART_ROUTE = /^#\/a\/v\/([0-9a-f]{16})$/

/** 되돌리기 띠가 보이는 시간(AC-3308.5)과 '처방 나옴' 이름표가 남는 시간(AC-3310.2) */
const TOAST_MS = 5000
const RX_NEW_MS = 60_000

/** 쓰기 실패 띠 (AC-3308.9) */
const SAVE_FAILED = '저장하지 못했어요. 다시 눌러 주세요'

/** 목록 고치기 저장 띠 (reception-pick-lists AC-3505.3, requirements 기본값) */
const LISTS_SAVED = '목록을 저장했어요'
const LISTS_FAILED = '목록을 저장하지 못했어요'

/** 칸 하나를 쓰는 op(같은 칸 쓰기가 나가 있으면 누름을 버린다). 나머지(away·ptf·end)는 줄의 그 표시 하나다 */
const CELL_OPS = new Set(['step', 'set', 'add', 'remove', 'part'])

/** 폰 상세 길: #/v/{화면용 열쇠} */
const DETAIL_ROUTE = /^#\/v\/([0-9a-f]{16})$/

/** 폰 목록 길 */
const LIST_ROUTE = '#/'

/** 설정 쪽 길 (reception-other-clinic AC-5709.2) */
const SETTINGS_ROUTE = '#/s'

/** 종이 다시 읽기: 칸·오늘 처방이 그대로여도 마지막 상세 읽기에서 이만큼 지나면 다시 읽는다(AC-1404.8) */
const PAPER_AGAIN_MS = 30_000

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
  /** 그린 상세의 마지막 상세 읽기: 그때 줄의 칸·오늘 처방 글과 시각. 그리기 전이면 null (AC-1404.8) */
  let paperMark = null
  /** 종이 다시 읽는 중인가 */
  let paperBusy = false

  // ---- 어레인지 상태 (메모리에만, 숨김·끊김에 지운다) ----
  /** 열린 고르기 창 { k, col, kind, …창 값 } | null (창 값은 arrange.js가 정한다: 충격파 hit·count, C-ARM proc·drug, SONO side·picked·withs) */
  let sheet = null
  /** [오늘 치료 종료] 펼침 */
  let endedOpen = false
  /** 되돌리기 띠 { text, undo: 쓰기 | null } | null 과 그 5초 */
  let toast = null
  let toastTimer = null
  /** '처방 나옴' 줄: 열쇠 → 이름표를 내릴 시각(ms) */
  const rxNew = new Map()
  /** 이번 그리기에 반짝일 줄 */
  let flash = []
  /** 나가 있거나(saved false) 204를 받고 다음 판을 기다리는(saved true) 쓰기 { key, ask, saved, after } (차례대로 판에 얹는다) */
  let writes = []
  /** 숨김·끊김마다 바뀐다. 앞 세대 쓰기의 답은 버린다 */
  let writeGen = 0
  /** 기록부를 열 때의 표 세로 위치(돌아오면 되살린다, AC-3309.4) */
  let backY = 0
  /** 열린 기록부 { k, today, prev, mark, busyToday, busyPrev } | null */
  let chart = null

  // ---- 로고 그림 (메모리에만, 숨김·끊김에 지운다, reception-other-clinic AC-5709.1·5708.3) ----
  /** 받은 로고 그림 { ver, src: data: URL } | null */
  let logoPic = null
  /** 받는 중인 ver와 받지 못한 ver(같은 ver는 다시 묻지 않는다) */
  let logoAsk = null
  let logoFailed = null
  /** 숨김·끊김마다 바뀐다. 앞 세대 그림 읽기의 답은 버린다 */
  let logoGen = 0

  const notice = createAlert()
  const unlistenNotice = notice.listen(doc)
  const layout = createLayout({ onChange: reshape })
  const poll = createPoll({ host, draw, wipe, onReading: (reading) => setReading(host, reading) })

  const band = (row) => xrayBand(row, { setXray, readNow: poll.readNow, signal: poll.signal })

  /** 목록 그리기 값: 고른 칸·모양·고른 환자 + 누름 처리 */
  function viewOf(reading) {
    return {
      ...layout.view(),
      reading: reading === true,
      onPick,
      onSelect,
      onRefresh: () => poll.refreshNow(),
      xray: band,
      tab: 'board',
      onTab,
      onSettings: openSettings,
      logoPic,
    }
  }

  /** 읽기 성공마다 (poll.js) */
  function draw(board, info) {
    closedTab(board)
    readLogo(board)
    const rang = notice.check(board, info)
    const fresh = notice.checkRx(board, info, tabOf() === 'arrange', { quiet: rang })
    if (fresh.length > 0) {
      const until = Date.now() + RX_NEW_MS
      for (const k of fresh) rxNew.set(k, until)
      flash = fresh
    }
    /* 204를 받은 쓰기는 이 판에 들어 있다 */
    writes = writes.filter((write) => !write.saved)
    try {
      paint(board, info.reading)
    } finally {
      flash = []
    }
    keepTitle()
  }

  /** 지금 길의 화면을 판으로 그린다(설정 쪽 · 어레인지 탭 · 태블릿 · 폰). 끊김 화면용으로 그 판의 로고를 적어 둔다 */
  function paint(board, reading) {
    if (settingsOpen()) drawSettings()
    else if (tabOf() === 'arrange') drawArrange(board, reading)
    else if (layout.tablet()) drawTablet(board, reading)
    else drawPhone(board, reading)
    rememberLogo(board.cfg?.logo ?? null, logoPic)
  }

  /** 마지막 판으로 지금 화면을 다시 그린다(로고 그림이 온 뒤) */
  function repaint() {
    const board = poll.board()
    if (!board) return
    paint(board, poll.reading())
    keepTitle()
  }

  /**
   * 판 cfg.logo가 pic이면 그 ver의 그림을 한 번 받는다(AC-5709.1). 이미 받았거나 받는 중이거나 받지 못한 ver면 묻지 않는다.
   * 받으면 다시 그린다. 숨김·끊김(logoGen이 바뀜) 뒤 온 답은 버린다
   */
  function readLogo(board) {
    const logo = board?.cfg?.logo
    if (logo?.mode !== 'pic' || !Number.isSafeInteger(logo.ver) || logo.ver < 1) return
    const ver = logo.ver
    if (logoPic?.ver === ver || logoAsk === ver || logoFailed === ver) return
    const gen = logoGen
    logoAsk = ver
    getLogo(ver, { signal: poll.signal() }).then(
      (src) => {
        if (gen !== logoGen || logoAsk !== ver) return
        logoAsk = null
        logoPic = { ver, src }
        repaint()
      },
      () => {
        if (gen !== logoGen || logoAsk !== ver) return
        logoAsk = null
        logoFailed = ver
      },
    )
  }

  /** 숨김·끊김: 받은 로고 그림과 끊김 화면용 로고를 지운다(AC-5708.3) */
  function forgetLogo() {
    logoPic = null
    logoAsk = null
    logoFailed = null
    logoGen += 1
    rememberLogo(null)
  }

  /** 폰 상세 머리의 작은 로고 값 (detail.js) */
  function detailLogo(board) {
    return { logo: board?.cfg?.logo ?? null, logoPic }
  }

  /** 어레인지 탭이 꺼진 판(AC-5709.3): #/a·#/a/v/{열쇠}는 [접수 현황](#/)으로 바꾼다(방문 기록을 늘리지 않음) */
  function closedTab(board) {
    if (board?.cfg?.tab !== false || tabOf() !== 'arrange') return
    replaceRoute(LIST_ROUTE)
    leaveArrange()
  }

  // ---- 설정 쪽 (reception-other-clinic AC-5709.2) -------------------------------------------------------

  /** [⚙ 설정] (board.js 머리): 설정 쪽 길로. 그리기는 hashchange(routed)가 한다 */
  function openSettings() {
    if (win.location.hash !== SETTINGS_ROUTE) win.location.hash = SETTINGS_ROUTE
  }

  /** 설정 쪽: 상세·어레인지 창을 내리고 빈 쪽을 그린다(설정 쪽 그리기는 settings.js, 다음 일) */
  function drawSettings() {
    if (detailK !== null) dropDetail()
    leaveArrange()
    if (host.querySelector(':scope > .page.settings-page')) return
    clear(host)
    host.appendChild(el('div', { class: 'page settings-page' }))
  }

  function settingsOpen() {
    return win.location.hash === SETTINGS_ROUTE
  }

  /** 끊김·숨김 (poll.js가 화면을 지운 뒤): 앞 열쇠 모음·고른 환자·상세·어레인지 상태를 버린다. 열린 메모 창은 저장하고 닫는다(AC-3403.3) */
  function wipe() {
    notice.forget()
    layout.wipe()
    dropDetail()
    wipeArrange()
    forgetLogo()
    closeMemo()
    /* 끊김에서 돌아오면 목록·어레인지 표다(AC-1407.4·3312.2). 숨김 뒤에는 상세·기록부 주소를 남겨 다시 읽는다(AC-1407.11·3312.2) */
    if (!hiding && routeKey() !== null) replaceRoute(LIST_ROUTE)
    if (!hiding && chartKey() !== null) replaceRoute(ARRANGE_ROUTE)
  }

  /** 앞서 나간 상세 읽기를 버린다. 새 차례 번호를 돌려준다 */
  function dropDetail() {
    detailK = null
    paperMark = null
    paperBusy = false
    ticket += 1
    return ticket
  }

  /** 상세를 읽어 그린 때의 줄을 적어 둔다 */
  function markPaper(row) {
    paperMark = { lane: row.lane, rx: rxOf(row), at: Date.now() }
  }

  /** 그린 상세 k의 줄이 바뀌었거나 30초가 지났으면 상세를 다시 읽어 종이 카드를 새 paper로 바꾼다(AC-1404.8·1502.4) */
  function refreshPaper(k, row) {
    if (paperBusy || paperMark === null || detailK !== k) return
    if (paperMark.lane === row.lane && paperMark.rx === rxOf(row) && Date.now() - paperMark.at < PAPER_AGAIN_MS) return
    const mine = ticket
    paperBusy = true
    getHistory(k, 0, { signal: poll.signal() }).then(
      (history) => {
        if (mine !== ticket || detailK !== k) return
        paperBusy = false
        updatePaper(host, k, history.paper)
        markPaper(row)
      },
      () => {
        /* 그대로 두고 다음 읽기에 다시 본다 */
        if (mine === ticket) paperBusy = false
      },
    )
  }

  /**
   * 그린 상세 k의 지난 진료기록부 첫 쪽을 한 번 읽어 채운다(AC-3404.3). 실패하면 그 자리에 한 줄이고 다시 읽지 않는다(AC-3404.5).
   * 차례 번호(mine)가 바뀌면(숨김·끊김·다른 환자·돌림) 답을 버린다. [더 보기]의 다음 쪽도 같은 차례 번호로만 받는다(AC-3404.4)
   */
  function readPast(k, mine) {
    const live = () => mine === ticket && detailK === k
    const onMore = (from) =>
      getPapers(k, from, { signal: poll.signal() }).then((papers) => {
        if (!live()) throw new Error('늦은 답')
        return papers
      })
    getPapers(k, 0, { signal: poll.signal() }).then(
      (papers) => {
        if (live()) fillPast(host, k, papers, { onMore })
      },
      () => {
        if (live()) fillPast(host, k, null)
      },
    )
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

  /** 폰 상세: 처음이면 상세를 읽어 그리고, 이미 그렸으면 머리와 종이 카드의 줄 몫만 바꾸고 종이를 다시 읽을지 정한다(AC-1404.4·1404.8) */
  function phoneDetail(k, row, board) {
    layout.select(k, board)
    if (detailK === k) {
      updateDetail(host, row, detailLogo(board))
      refreshPaper(k, row)
      return
    }
    const mine = dropDetail()
    detailK = k
    getHistory(k, 0, { signal: poll.signal() }).then(
      (history) => {
        if (mine !== ticket || layout.tablet() || routeKey() !== k) return
        const now = findRow(poll.board(), k)
        if (now) {
          renderDetail(host, now, history, detailLogo(poll.board()))
          markPaper(now)
          readPast(k, mine)
        }
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

  /**
   * 해시 길이 바뀜: 줄 누름(#/v/{열쇠})·[접수 현황](#/)·탭(#/a ↔ #/)·성함 누름(#/a/v/{열쇠})·[‹ 어레인지]·뒤로 가기.
   * 읽지 않고 마지막 판으로 그린다. 기록부에서 표로 돌아오면 표의 세로 위치를 되살린다(AC-3309.4)
   */
  function routed() {
    const board = poll.board()
    if (!board) return
    closedTab(board)
    if (settingsOpen()) drawSettings()
    else if (tabOf() === 'arrange') {
      const back = chart !== null && chartKey() === null
      drawArrange(board, poll.reading())
      if (back) scrollBack()
    } else {
      leaveArrange()
      if (!layout.tablet()) drawPhone(board, poll.reading())
      else if (!host.querySelector('.page.board')) drawTablet(board, poll.reading())
    }
    keepTitle()
  }

  /** 탭 단추 (board.js·arrange.js): 해시만 바꾼다. 그리기는 hashchange(routed)가 한다 */
  function onTab(tab) {
    const next = tab === 'arrange' ? ARRANGE_ROUTE : LIST_ROUTE
    if (win.location.hash !== next) win.location.hash = next
  }

  // ---- 어레인지 표 (reception-arrange REQ-3308) ---------------------------------------------------------

  /** 어레인지 탭 그리기: 기록부 길이면 기록부, 아니면 표. 기록부 환자가 그날 판에 없으면 표로 돌아간다(AC-3309.3) */
  function drawArrange(board, reading) {
    if (detailK !== null) dropDetail()
    const k = chartKey()
    if (k !== null) {
      const row = findRow(board, k)
      if (row) {
        drawChart(k, row)
        return
      }
      replaceRoute(ARRANGE_ROUTE)
      chart = null
      drawTable(board, reading)
      scrollBack()
      return
    }
    chart = null
    drawTable(board, reading)
  }

  /** 표: 나가 있는 쓰기를 얹은 판으로 그린다. 그 줄이 판에서 사라져 그리지 못한 창은 닫는다(AC-3308.11) */
  function drawTable(board, reading) {
    const now = Date.now()
    for (const [k, until] of rxNew) if (until <= now) rxNew.delete(k)
    renderArrange(host, shownOf(board), arrangeView(reading))
    if (sheet !== null && !host.querySelector('.sheet-back')) sheet = null
  }

  /** 표가 보이면 마지막 판으로 다시 그린다(누름·띠 끝남) */
  function redrawTable() {
    const board = poll.board()
    if (board && tabOf() === 'arrange' && chartKey() === null) drawTable(board, poll.reading())
  }

  /** 판에 나가 있는 쓰기(낙관적 그리기)를 차례대로 얹은 사본 */
  function shownOf(board) {
    let shown = board
    for (const write of writes) shown = planOf(shown, write.ask).board
    return shown
  }

  function arrangeView(reading) {
    return {
      reading: reading === true,
      onRefresh: () => poll.refreshNow(),
      onTab,
      sheet,
      endedOpen,
      toast: toast ? { text: toast.text, undo: toast.undo !== null } : null,
      rxNew: [...rxNew.keys()],
      flash,
      onCell: (k, col) => press(k, { k, op: 'step', col }),
      // t: SONO·C-ARM 이름표를 "|"로 이은 글(빈 글이면 api.js가 보내지 않는다, reception-pick-lists AC-3503.3·3504.3)
      onAdd: (k, col, v, t) => press(k, { k, op: 'add', col, v, t }),
      onPart: (k, col, v, t) => press(k, { k, op: 'part', col, v, t }),
      onSet: (k, col, v) => press(k, { k, op: 'set', col, v }),
      onRemove: (k, col) => press(k, { k, op: 'remove', col }),
      onAway: (k, v) => send({ k, op: 'away', v }),
      onPtf: (k, v) => send({ k, op: 'ptf', v }),
      onEnd: (k) => send({ k, op: 'end', v: 'on' }),
      onRestore: (k) => send({ k, op: 'end', v: 'off' }),
      onChart: openChart,
      onUndo: undo,
      onSheet: (next) => {
        sheet = next
        if (next) seen(next.k)
      },
      onEnded: (open) => {
        endedOpen = open
      },
      onLists: saveLists,
      onSettings: openSettings,
      logoPic,
    }
  }

  /**
   * 목록 고치기 [저장] (reception-pick-lists AC-3505.3): 초안 전체를 보내 204면 띠 "목록을 저장했어요" 뒤 판을 다시 읽고 참,
   * 아니면 띠 "목록을 저장하지 못했어요"이고 거짓(창은 그대로). 숨김·끊김 뒤 온 답은 버린다(거짓)
   */
  function saveLists(picks) {
    const gen = writeGen
    const settle = (ok) => {
      if (gen !== writeGen) return false
      setToast({ text: ok ? LISTS_SAVED : LISTS_FAILED, undo: null })
      redrawTable()
      if (ok) poll.readNow()
      return ok
    }
    return setLists(picks, { signal: poll.signal() }).then(
      () => settle(true),
      () => settle(false),
    )
  }

  /** 그 줄의 칸을 누름: '처방 나옴'을 내리고 보낸다(AC-3310.2) */
  function press(k, ask) {
    seen(k)
    send(ask)
  }

  /** '처방 나옴' 이름표를 내린다(칸·성함 누름) */
  function seen(k) {
    if (rxNew.delete(k)) redrawTable()
  }

  /**
   * 쓰기 하나(AC-3308.5·3308.9): 미리 얹어 그리고 보낸다. 같은 칸(표시)에 나가 있는 쓰기가 있으면 버린다
   * (되돌리기 quiet면 그 쓰기가 끝난 뒤 보낸다). 맞지 않는 쓰기(planOf가 띠를 주지 않음)는 보내지 않는다
   */
  function send(ask, { quiet = false } = {}) {
    const board = poll.board()
    if (!board) return
    const key = CELL_OPS.has(ask.op) ? `${ask.k}:${ask.col}` : `${ask.k}:${ask.op}`
    const busy = writes.find((write) => write.key === key && !write.saved)
    if (busy) {
      if (quiet) busy.after = ask
      return
    }
    const plan = planOf(shownOf(board), ask)
    if (plan.toast === null) return
    const write = { key, ask, saved: false, after: null }
    writes.push(write)
    if (!quiet) setToast({ text: plan.toast, undo: plan.undo })
    redrawTable()
    const gen = writeGen
    setArrange(ask.k, ask.op, ask.col, ask.v, ask.t, { signal: poll.signal() }).then(
      () => {
        if (gen !== writeGen || !writes.includes(write)) return
        write.saved = true
        if (write.after) send(write.after, { quiet: true })
        else poll.readNow()
      },
      () => {
        if (gen !== writeGen || !writes.includes(write)) return
        writes = writes.filter((item) => item !== write)
        setToast({ text: SAVE_FAILED, undo: null })
        redrawTable()
      },
    )
  }

  /** 띠의 [되돌리기]: 띠를 내리고 반대 쓰기를 보낸다 */
  function undo() {
    const last = toast
    setToast(null)
    if (last?.undo) send(last.undo, { quiet: true })
    redrawTable()
  }

  /** 되돌리기 띠를 바꾼다. 5초 뒤 내린다 */
  function setToast(next) {
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = null
    toast = next
    if (next)
      toastTimer = setTimeout(() => {
        toastTimer = null
        toast = null
        redrawTable()
      }, TOAST_MS)
  }

  /** [접수 현황] 탭으로: 창·띠·기록부를 내린다(나가 있는 쓰기는 그대로 끝난다) */
  function leaveArrange() {
    chart = null
    sheet = null
    setToast(null)
  }

  /** 숨김·끊김: 어레인지 상태를 모두 버리고 나가 있는 쓰기의 답도 버린다(AC-3312.2) */
  function wipeArrange() {
    leaveArrange()
    rxNew.clear()
    flash = []
    writes = []
    writeGen += 1
  }

  // ---- 기록부 (reception-arrange REQ-3309) ---------------------------------------------------------------

  /** 성함 누름: '처방 나옴'을 내리고 표의 세로 위치를 적은 뒤 #/a/v/{열쇠}로 간다(뒤로 가기로 표에 돌아온다) */
  function openChart(k) {
    rxNew.delete(k)
    backY = typeof win.scrollY === 'number' ? win.scrollY : 0
    win.location.hash = `#/a/v/${k}`
  }

  /** 기록부: 처음이면 오늘·직전·그 전을 읽고, 열려 있으면 머리·오늘 종이를 새 줄로 그리고 오늘 종이를 다시 읽을지 정한다 */
  function drawChart(k, row) {
    const fresh = chart === null || chart.k !== k
    if (fresh) {
      chart = { k, today: 'reading', prev: 'reading', older: 'reading', mark: null, busyToday: false, busyPrev: false }
      sheet = null
      if (typeof win.scrollTo === 'function') win.scrollTo(0, 0)
    }
    const mine = chart
    renderCharts(host, row, mine.today, mine.prev, chartView(mine))
    readToday(mine, row)
    readPrev(mine)
    if (fresh) readOlder(mine)
  }

  /** 기록부 화면의 그 전 진료기록부 값: 답(또는 읽는 중·실패)과 [더 보기]가 다음 쪽을 읽는 곳. 기록부가 바뀌면(다른 환자·숨김·끊김) 답을 버린다 */
  function chartView(c) {
    return {
      older: c.older,
      onMore: (from) =>
        getPapers(c.k, from, { signal: poll.signal() }).then((papers) => {
          if (chart !== c) throw new Error('늦은 답')
          return papers
        }),
    }
  }

  /** 그 전 진료기록부 첫 쪽(papers?from=1): 열 때 한 번만 읽는다. 실패하면 한 줄이고 다시 읽지 않는다(AC-3605.3·3605.4) */
  function readOlder(c) {
    getPapers(c.k, 1, { signal: poll.signal() }).then(
      (papers) => {
        if (chart !== c) return
        c.older = papers
        redrawChart(c)
      },
      () => {
        if (chart !== c) return
        c.older = 'error'
        redrawChart(c)
      },
    )
  }

  /** 오늘 종이: 처음·실패 뒤·칸이나 오늘 처방이 바뀜·30초 지남이면 읽는다(AC-1404.8과 같은 조건, AC-3309.3) */
  function readToday(c, row) {
    if (c.busyToday || chart !== c) return
    if (c.mark !== null && c.mark.lane === row.lane && c.mark.rx === rxOf(row) && Date.now() - c.mark.at < PAPER_AGAIN_MS) return
    c.busyToday = true
    getHistory(c.k, 0, { signal: poll.signal() }).then(
      (history) => {
        if (chart !== c) return
        c.busyToday = false
        c.today = history
        c.mark = { lane: row.lane, rx: rxOf(row), at: Date.now() }
        redrawChart(c)
      },
      () => {
        if (chart !== c) return
        c.busyToday = false
        /* 처음 읽기가 실패하면 한 줄, 다시 읽기가 실패하면 그대로 둔다. 다음 저절로 읽기에 다시 본다(AC-3309.5) */
        if (c.today === 'reading') {
          c.today = 'error'
          redrawChart(c)
        }
      },
    )
  }

  /** 직전 종이: 열 때 한 번만 읽는다(실패하면 다음 저절로 읽기에 다시 본다) */
  function readPrev(c) {
    if (c.busyPrev || chart !== c || (c.prev !== 'reading' && c.prev !== 'error')) return
    c.busyPrev = true
    getPrev(c.k, { signal: poll.signal() }).then(
      (prev) => {
        if (chart !== c) return
        c.busyPrev = false
        c.prev = prev
        redrawChart(c)
      },
      () => {
        if (chart !== c) return
        c.busyPrev = false
        if (c.prev !== 'error') {
          c.prev = 'error'
          redrawChart(c)
        }
      },
    )
  }

  function redrawChart(c) {
    const row = findRow(poll.board(), c.k)
    if (chart === c && chartKey() === c.k && row) renderCharts(host, row, c.today, c.prev, chartView(c))
  }

  /** 기록부를 열 때의 표 세로 위치로 */
  function scrollBack() {
    if (typeof win.scrollTo === 'function') win.scrollTo(0, backY)
  }

  // ---- 태블릿 ---------------------------------------------------------------------------------------

  function drawTablet(board, reading) {
    const picked = layout.sync(board)
    renderBoard(host, board, viewOf(reading))
    showPane(picked)
  }

  /** 오른쪽 칸: 고른 환자가 같으면 머리와 종이 카드의 줄 몫만 바꾸고 종이를 다시 읽을지 정하며(AC-1409.3·1404.8), 다르면 상세를 새로 읽는다. 아무도 없으면 비운다 */
  function showPane({ picked, row }) {
    if (picked === detailK) {
      if (row) {
        updateDetail(host, row)
        refreshPaper(picked, row)
      }
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
        if (now) {
          fillPane(host, detailPane(now, history))
          fitSpecial(host)
          markPaper(now)
          readPast(picked, mine)
        }
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
    /* 설정 쪽은 그대로 둔다(모양은 style.css가 바꾼다) */
    if (settingsOpen()) {
      drawSettings()
      keepTitle()
      return
    }
    /* 어레인지 탭은 같은 화면을 다시 그린다(모양은 style.css가 바꾼다) */
    if (tabOf() === 'arrange') {
      drawArrange(board, poll.reading())
      keepTitle()
      return
    }
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

  /** 지금 해시 길의 탭: #/a·#/a/v/{열쇠}면 'arrange', 그 밖은 'board' (AC-3308.1) */
  function tabOf() {
    const hash = win.location.hash
    return hash === ARRANGE_ROUTE || CHART_ROUTE.test(hash) ? 'arrange' : 'board'
  }

  /** 지금 해시 길의 기록부 열쇠. 아니면 null */
  function chartKey() {
    const found = CHART_ROUTE.exec(win.location.hash)
    return found ? found[1] : null
  }

  /** 방문 기록을 늘리지 않고 해시 길만 바꾼다(hashchange 없음) */
  function replaceRoute(hash) {
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash)
  }

  function keepTitle() {
    if (doc.title !== TITLE) doc.title = TITLE
  }

  /** 화면 폭이 바뀜: 그린 특이사항 높이를 다시 잰다(AC-1502.2). 상세가 없으면 아무것도 하지 않는다 */
  function refit() {
    fitSpecial(host)
  }

  doc.addEventListener('visibilitychange', visibility)
  win.addEventListener('pagehide', hide)
  win.addEventListener('pageshow', show)
  win.addEventListener('hashchange', routed)
  win.addEventListener('resize', refit)
  if (doc.visibilityState !== 'hidden') poll.start()

  return {
    stop() {
      doc.removeEventListener('visibilitychange', visibility)
      win.removeEventListener('pagehide', hide)
      win.removeEventListener('pageshow', show)
      win.removeEventListener('hashchange', routed)
      win.removeEventListener('resize', refit)
      unlistenNotice()
      layout.stop()
      hide()
    },
  }
}

/** 줄의 오늘 처방 글(이름표 + 글). 바뀌면 종이를 다시 읽는다(AC-1404.8) */
function rxOf(row) {
  return `${row.rxLabel ?? ''}|${row.rx ?? ''}`
}

/** 브라우저가 이 파일을 부르면 바로 연다 */
export const app = document.getElementById('app') ? startApp() : null
