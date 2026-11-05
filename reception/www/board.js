// 목록 그리기 (design.md 10절, 승인 시안 Main.dc.html·Tablet.dc.html). 도우미 GET /api/board 답(design.md 4절)을 그대로 그린다.
// - 글은 도우미(C#)가 만든 그대로다. 화면은 계산하지 않고 기준 시각도 답의 at만 쓴다(휴대폰 시계 없음, AC-1407.10)
// - 환자 글은 dom.js el()로 글 마디로만 넣는다(AC-1407.6). class 이름은 style.css 머리 글의 화면 틀 그대로다
// - 같은 자리에 다시 그리면 뼈대(머리·칸·줄 칸·오른쪽 칸)는 두고 안만 바꾼다. 태블릿 줄 칸·오른쪽 칸의 굴림 자리가 10초마다 맨 위로 가지 않는다
//
// 쓰는 법 (app.js)
//   renderBoard(host, board, view) → .page.board    host는 #app. 안에 다른 화면이 있으면 지우고 목록을 그린다
//     view.lane          고른 칸 'queue'|'wait'|'hold'|'pay'|'done' (기본·모르는 값은 'queue')
//     view.reading       true면 [새로 고침]이 "읽는 중…"·disabled
//     view.tablet        true면 줄이 고르는 단추(aria-pressed)이고 오른쪽 칸(aside.pane)이 있다. 아니면 줄은 #/v/{열쇠} 링크
//     view.picked        태블릿에서 고른 줄의 열쇠(.row.is-picked)
//     view.onPick(lane)  칸 단추를 누름. 그 자리에서 그 칸을 다시 그린 뒤 부른다
//     view.onSelect(k)   태블릿 줄을 누름. 그 자리에서 고른 줄 표시를 바꾼 뒤 부른다
//     view.onRefresh()   [새로 고침]을 누름. 그 자리에서 "읽는 중…"·disabled로 바꾼 뒤 한 번 부른다(읽는 동안 더 누르지 못한다)
//     view.xray(row)     엑스레이 칸이 있는 줄(진료보류)의 아래 띠 요소(xray.js). 없으면 띠 없음
//   setReading(host, reading)  [새로 고침] 단추만 바꾼다
//   fillPane(host, nodes)      태블릿 오른쪽 칸의 내용을 바꾼다(아래 글은 그대로). null이면 비운다

import { clear, el } from './dom.js'

/** 고르는 칸: 진료 순서 + 칸 넷 */
export const LANES = ['queue', 'wait', 'hold', 'pay', 'done']

/** 칸 넷 단추 (시안 차례) */
const TILES = [
  ['wait', '진료대기'],
  ['hold', '진료보류'],
  ['pay', '수납대기'],
  ['done', '수납완료'],
]

/** 칸 제목 (시안 글) */
const HEADINGS = {
  queue: '진료대기와 진료보류 · 접수한 순서',
  wait: '진료대기 · 접수한 순서',
  hold: '진료보류 · 접수한 순서',
  pay: '수납대기 · 접수한 순서',
  done: '수납완료 환자 · 최근 순',
}

/** 상태 이름표 모양 (JSON lane → class) */
const STATUS_CLASS = { wait: 'status-wait', hold: 'status-hold', pay: 'status-pay', done: 'status-done' }

const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'

/**
 * 목록 화면을 host 안에 그린다.
 * @param {HTMLElement} host 화면 자리(#app)
 * @param {{ at: string, counts?: Record<string, number>, lists?: Record<string, object[]> }} board GET /api/board 답
 * @param {object} [view] 위 '쓰는 법'
 * @returns {HTMLElement} .page.board
 */
export function renderBoard(host, board, view = {}) {
  const lane = LANES.includes(view.lane) ? view.lane : 'queue'
  const tablet = view.tablet === true
  const parts = partsOf(host, tablet)
  // 누른 자리에서 바로 다시 그린다. 읽는 중 표시는 지금 단추의 것을 이어받는다
  const redraw = (next) => renderBoard(host, board, { ...view, reading: readingNow(host), ...next })
  const pick = (key) => {
    redraw({ lane: key })
    if (typeof view.onPick === 'function') view.onPick(key)
  }
  const select = (k) => {
    redraw({ picked: k })
    if (typeof view.onSelect === 'function') view.onSelect(k)
  }

  replace(parts.top, [
    el('div', { class: 'top-row' }, [
      el('img', { class: 'logo', src: '/logo-wordmark.png', alt: '양지바른정형외과' }),
      el('div', { class: 'top-status' }, [el('span', { class: 'conn' }, '연결됨'), refreshButton(view)]),
    ]),
    el('div', { class: 'title-block' }, [
      el('h1', { class: 'top-title' }, '접수 현황'),
      el('p', { class: 'asof' }, `${board.at} 기준 · 10초마다 저절로 바뀌어요`),
    ]),
  ])

  replace(parts.picker, [
    el('button', { type: 'button', class: 'queue', 'aria-pressed': pressed(lane === 'queue'), on: { click: () => pick('queue') } }, [
      el('span', { class: 'queue-label' }, '진료 순서 · 대기와 보류 한눈에'),
      el('span', { class: 'queue-count' }, `${countOf(board, 'queue')}명`),
    ]),
    el(
      'div',
      { class: 'tiles' },
      TILES.map(([key, label]) =>
        el('button', { type: 'button', class: 'tile', 'aria-pressed': pressed(lane === key), on: { click: () => pick(key) } }, [
          el('span', { class: 'tile-count' }, countOf(board, key)),
          el('span', { class: 'tile-label' }, label),
        ]),
      ),
    ),
  ])

  replace(parts.heading, HEADINGS[lane])
  const scroll = parts.rows.scrollTop
  replace(
    parts.rows,
    listOf(board, lane).map((row) => rowOf(row, lane, view, select)),
  )
  parts.rows.scrollTop = scroll
  return parts.page
}

/** [새로 고침] 단추만 "새로 고침" ↔ "읽는 중…"(disabled)으로 바꾼다 */
export function setReading(host, reading) {
  const button = host.querySelector('.page.board button.refresh')
  if (button) showReading(button, reading === true)
}

/** 태블릿 오른쪽 칸의 내용(아래 글 앞)을 nodes로 바꾼다. 오른쪽 칸이 없으면(폰) 아무것도 하지 않는다 */
export function fillPane(host, nodes) {
  const pane = host.querySelector('.page.board > .pane')
  if (!pane) return
  const foot = pane.querySelector(':scope > .pane-foot')
  for (const child of [...pane.childNodes]) if (child !== foot) pane.removeChild(child)
  for (const node of [nodes].flat()) if (node instanceof Node) pane.insertBefore(node, foot)
}

/** 목록 뼈대. 이미 그린 목록이 있으면 그것을 쓰고, 없으면 host를 비우고 새로 만든다 */
function partsOf(host, tablet) {
  let page = host.children.length === 1 ? host.firstElementChild : null
  if (!page || !page.classList.contains('page') || !page.classList.contains('board')) {
    clear(host)
    page = el('div', { class: 'page board' }, [
      el('header', { class: 'top' }),
      el('div', { class: 'picker' }),
      el('main', { class: 'list' }, [el('h2', { class: 'list-heading' }), el('div', { class: 'rows' })]),
      el('footer', { class: 'foot' }, FOOT),
    ])
    host.appendChild(page)
  }
  let pane = page.querySelector(':scope > .pane')
  if (tablet && !pane) {
    pane = el('aside', { class: 'pane', 'aria-label': '처방 내역' }, el('p', { class: 'pane-foot' }, FOOT))
    page.insertBefore(pane, page.querySelector(':scope > .foot'))
  } else if (!tablet && pane) {
    pane.remove()
  }
  return {
    page,
    top: page.querySelector(':scope > .top'),
    picker: page.querySelector(':scope > .picker'),
    heading: page.querySelector(':scope > .list > .list-heading'),
    rows: page.querySelector(':scope > .list > .rows'),
  }
}

/** 줄 하나: 폰은 상세 링크, 태블릿은 고르는 단추. 진료 순서에서만 순서 번호·상태 이름표 */
function rowOf(row, lane, view, select) {
  const tablet = view.tablet === true
  const picked = tablet && row.k === view.picked
  const body = [
    el('span', { class: 'row-head' }, [
      lane === 'queue' && [
        el('span', { class: 'pos' }, row.pos),
        el('span', { class: ['status', STATUS_CLASS[row.lane]].filter(Boolean).join(' ') }, row.laneLabel),
      ],
      textSpan('chart', row.chart),
      textSpan('name', row.name),
      textSpan('info', row.info),
    ]),
    el('span', { class: 'row-time' }, [textSpan(null, row.time), el('span', { class: waitedClass(row) }, row.waited)]),
    row.memo ? el('span', { class: 'memo' }, `메모 · ${row.memo}`) : null,
    el('span', { class: 'rx-line' }, [el('span', { class: 'rx-label' }, row.rxLabel), el('span', { class: 'rx-text' }, row.rx)]),
  ]
  const main = tablet
    ? el('button', { type: 'button', class: 'row-main', 'aria-pressed': pressed(picked), on: { click: () => select(row.k) } }, body)
    : el('a', { class: 'row-main', href: `#/v/${encodeURIComponent(row.k)}` }, body)
  const band = row.xray && typeof view.xray === 'function' ? view.xray(row) : null
  return el('div', { class: picked ? 'row is-picked' : 'row', 'data-k': row.k }, [main, band])
}

/** 기다린 글 모양: 오래 기다림은 주황, 끝남은 끝남 색, 나머지는 보통 */
function waitedClass(row) {
  if (row.long === true) return 'waited is-long'
  if (row.lane === 'done') return 'waited is-done'
  return 'waited'
}

/** 글이 있을 때만 span. 아직 못 읽은 칸("")은 그 칸만 비운다(AC-1402.7) */
function textSpan(className, text) {
  if (typeof text !== 'string' || text === '') return null
  return el('span', className ? { class: className } : null, text)
}

function refreshButton(view) {
  const button = el('button', {
    type: 'button',
    class: 'refresh',
    on: {
      click: () => {
        if (button.disabled || typeof view.onRefresh !== 'function') return
        showReading(button, true)
        view.onRefresh()
      },
    },
  })
  showReading(button, view.reading === true)
  return button
}

function showReading(button, reading) {
  button.disabled = reading
  clear(button)
  button.append(el('span', { 'aria-hidden': 'true' }, '↻'), reading ? '읽는 중…' : '새로 고침')
}

function readingNow(host) {
  return host.querySelector('.page.board button.refresh')?.disabled === true
}

function pressed(yes) {
  return yes ? 'true' : 'false'
}

function countOf(board, key) {
  const n = board.counts?.[key]
  return Number.isInteger(n) ? n : listOf(board, key).length
}

function listOf(board, key) {
  const rows = board.lists?.[key]
  return Array.isArray(rows) ? rows : []
}

/** 안을 비우고 children(요소·글)을 넣는다. 글은 글 마디로만 들어간다 */
function replace(node, children) {
  clear(node)
  for (const child of [children].flat()) node.append(child)
}
