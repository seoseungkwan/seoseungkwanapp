// 폰/태블릿 모양과 고른 환자 (design.md 10절, REQ-1409, 승인 시안 Tablet.dc.html: 왼쪽 목록, 오른쪽 고른 환자 상세).
// - 모양은 style.css 두 칸 질의와 같은 글(TABLET_QUERY)로 matchMedia가 정한다. 기기를 돌려 바뀌면 onChange로 한 번 알린다(AC-1409.1, AC-1409.5)
// - 고른 칸과 고른 환자의 열쇠만 메모리에 둔다(저장소 없음). 판(환자 자료)은 들고 있지 않고 부를 때마다 받는다
// - 태블릿: 아무도 안 골랐으면 고른 칸의 첫 줄을 고른다(오른쪽이 늘 차 있다). 고른 환자는 다시 읽어도·칸을 바꿔도 그대로이고,
//   그날 판의 어느 목록에도 없으면 고른 칸의 첫 줄을, 그 칸도 비었으면 아무도 고르지 않는다(AC-1409.2, AC-1409.3)
// - 폰: 저절로 고르지 않는다. 고른 환자는 app.js가 상세 길(#/v/{열쇠})을 열 때 select(k), 목록(#/)으로 돌아올 때 select(null)로 정한다
// - 끊김·숨김(poll.js wipe)에는 고른 환자를 잊는다. 고른 칸은 그대로다(AC-1409.4, AC-1407.11)
//
// 쓰는 법 (app.js)
//   const layout = createLayout({ matchMedia, onChange })
//     matchMedia(query)     바꿔 끼우기(기본은 window.matchMedia). 없거나 던지면 폰 모양
//     onChange({ tablet, picked })  폰 ↔ 태블릿이 바뀔 때. 폰이고 picked가 있으면 그 상세 길, 태블릿이면 sync(판) 뒤 목록 + 오른쪽을 그린다
//   layout.view()           { lane, tablet, picked } → board.js renderBoard(host, 판, { ...layout.view(), … })
//   layout.sync(판)          읽기 성공마다(poll draw). 아래 '고른 결과' 참고.
//   layout.select(k, 판?)    태블릿 줄 누름(board onSelect)·폰 상세 길 열기(k), 폰 목록으로(null)
//   layout.pickLane(칸, 판?)  칸 단추 누름(board onPick)
//   layout.wipe()           끊김·숨김(poll wipe)
//   layout.tablet() / layout.lane() / layout.picked()   지금 값
//   layout.stop()           바뀜 알림 듣기를 그만둔다
//   고른 결과 { picked, row, changed }
//     picked   고른 열쇠(없으면 null)    row  판에서 찾은 그 줄(판이 없거나 없으면 null)
//     changed  부르기 전과 다른 환자인가. true면 상세를 새로 읽어 fillPane(host, detailPane(row, …)), 아무도 없으면 fillPane(host, null).
//              false면 updateDetail(host, row)로 오늘 카드만 바꾼다(지난 진료는 다시 읽지 않는다, AC-1409.3)
//   findRow(판, k)           그날 판의 모든 목록에서 그 열쇠의 줄(없으면 null). 폰 상세 길에서도 쓴다

import { LANES } from './board.js'

/** 태블릿 두 칸 질의 (AC-1409.1). style.css의 @media 글과 같다 */
export const TABLET_QUERY = '(min-width: 1000px) and (orientation: landscape)'

/** 처음 고른 칸 (AC-1407.1) */
const FIRST_LANE = 'queue'

/**
 * 그날 판의 모든 목록에서 열쇠 k의 줄을 찾는다.
 * @param {{ lists?: Record<string, object[]> } | null | undefined} board GET /api/board 답
 * @param {string | null} k 열쇠
 * @returns {object | null}
 */
export function findRow(board, k) {
  if (!isKey(k)) return null
  for (const lane of LANES) {
    const row = rowsOf(board, lane).find((item) => item?.k === k)
    if (row) return row
  }
  return null
}

/**
 * 폰/태블릿 모양과 고른 칸·고른 환자를 맡는다.
 * @param {{ matchMedia?: (query: string) => MediaQueryList,
 *           onChange?: (info: { tablet: boolean, picked: string | null }) => void }} [options]
 */
export function createLayout({ matchMedia, onChange } = {}) {
  const media = mediaOf(matchMedia)
  let tablet = media?.matches === true
  let lane = FIRST_LANE
  let picked = null

  function heard(event) {
    const next = typeof event?.matches === 'boolean' ? event.matches : media.matches === true
    if (next === tablet) return
    tablet = next
    if (typeof onChange === 'function') onChange({ tablet, picked })
  }
  const unlisten = listen(media, heard)

  /** 판에 맞춰 고른 환자를 정한다. 태블릿만 저절로 고른다. 판이 없으면 고른 것을 그대로 둔다 */
  function settle(board, before) {
    let row = findRow(board, picked)
    if (tablet && !row && isBoard(board)) {
      row = rowsOf(board, lane).find((item) => isKey(item?.k)) ?? null
      picked = row ? row.k : null
    }
    return { picked, row, changed: picked !== before }
  }

  return {
    tablet: () => tablet,
    lane: () => lane,
    picked: () => picked,
    view: () => ({ lane, tablet, picked }),
    sync: (board) => settle(board, picked),
    select(k, board) {
      const before = picked
      picked = isKey(k) ? k : null
      return settle(board, before)
    },
    pickLane(next, board) {
      lane = LANES.includes(next) ? next : FIRST_LANE
      return settle(board, picked)
    },
    wipe() {
      picked = null
    },
    stop: unlisten,
  }
}

/** 질의 목록. 없거나 던지면 null(폰 모양) */
function mediaOf(matchMedia) {
  const ask = typeof matchMedia === 'function' ? matchMedia : typeof globalThis.matchMedia === 'function' ? (query) => globalThis.matchMedia(query) : null
  if (!ask) return null
  try {
    return ask(TABLET_QUERY) ?? null
  } catch {
    return null
  }
}

/** 바뀜 알림을 듣는다(옛 사파리는 addListener만 있다). 그만두는 함수를 돌려준다 */
function listen(media, fn) {
  if (typeof media?.addEventListener === 'function') {
    media.addEventListener('change', fn)
    return () => media.removeEventListener?.('change', fn)
  }
  if (typeof media?.addListener === 'function') {
    media.addListener(fn)
    return () => media.removeListener?.(fn)
  }
  return () => {}
}

function rowsOf(board, lane) {
  const rows = board?.lists?.[lane]
  return Array.isArray(rows) ? rows : []
}

function isBoard(board) {
  return typeof board === 'object' && board !== null
}

function isKey(k) {
  return typeof k === 'string' && k !== ''
}
