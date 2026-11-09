// 기록부 화면 그리기 (reception-arrange design.md 10절, REQ-3309, 승인 시안 Arrange.html의 진료기록부 화면). 어레인지 표에서 성함을 누르면
// 해시 길 #/a/v/{열쇠}로 열린다. class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 머리: [‹ 어레인지](#/a)·연결됨, 차트번호·이름·정보 글("54세 · 여 · 재진" 그대로)·신환 표시, 상태 이름표·접수 시각, 메모 상자(AC-3309.1)
// - 몸: "오늘 진료기록부 YYYY-MM-DD" + 오늘 종이(detail.js paperCard 그대로), "직전 진료기록부 {yyyy-MM-dd} · {N일 전}" + 직전 종이
//   (GET /api/visit/{k}/prev, 사람 칸·특이사항 없이 detail.js recordOf의 같은 부분, 회색 테두리). 지난 내원이 없으면 첫 방문 카드.
//   태블릿은 두 칸(왼쪽 오늘 | 오른쪽 직전), 폰은 위아래다(style.css, AC-3309.2)
// - 읽는 중·읽기 실패는 그 칸에 한 줄만 보인다(AC-3309.5). 다시 읽기·실패 뒤 다시 보기는 app.js가 정한다
// - 같은 환자를 다시 그리면 화면 뼈대는 두고 머리·두 칸만 바꾼다. 펼쳐 둔 특이사항은 펼친 채다(AC-1502.4와 같다)
// - 환자 글은 dom.js el()로 글 마디로만 넣는다(AC-3312.1). 도우미에 묻지 않는다: 자료는 app.js가 넘긴다. 문서 제목은 건드리지 않는다
//
// 쓰는 법 (app.js)
//   renderCharts(host, row, today, prev, view) → .page.charts-page[data-k]
//     row         지금 목록 줄(board.lists 안의 그 열쇠 줄)
//     today       'reading' | 'error' | getHistory(k, 0) 답(paper가 있다)
//     prev        'reading' | 'error' | null(지난 내원 없음) | getPrev(k) 답의 prev { date, ago, room, ins, sym, dx, rx, out }
//     view.today  오늘(Date). 없으면 지금 기기 날짜(오늘 종이 머리글·제목 날짜)

import { clear, el } from './dom.js'
import { fitSpecial, paperCard, recordOf } from './detail.js'

const TODAY_HEADING = '오늘 진료기록부'
const PREV_HEADING = '직전 진료기록부'
const READING = '기록부를 읽는 중이에요'
const FAILED = '지금 기록부를 읽지 못했어요'
const NO_PREV = '첫 방문이라 직전 기록부가 없어요.'
const PAPER_TITLE = '외래진료기록부'
const BACK = '어레인지'
const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'

/** 머리 메모 상자의 이름표·신환 표시 글·정보 글 나눔 (board.js·detail.js와 같다) */
const MEMO_LABEL = '메모'
const NEW_KIND = '신환'
const INFO_JOINER = ' · '

/** 상태 이름표 모양 (JSON lane → class, board.js와 같다) */
const STATUS_CLASS = { wait: 'status-wait', hold: 'status-hold', pay: 'status-pay', done: 'status-done' }

/**
 * 기록부 화면을 host 안에 그린다.
 * @param {HTMLElement} host 화면 자리(#app)
 * @param {object} row 목록 줄
 * @param {'reading' | 'error' | object} today 오늘 상세 답
 * @param {'reading' | 'error' | object | null} prev 직전 종이
 * @param {{ today?: Date }} [view]
 * @returns {HTMLElement} .page.charts-page
 */
export function renderCharts(host, row, today, prev, view = {}) {
  const parts = partsOf(host, row.k)
  const open = parts.today.querySelector('.spc-more')?.getAttribute('aria-expanded') === 'true'
  const day = dashedOf(view.today)
  replace(parts.top, headOf(row))
  replace(parts.today, [headingOf(TODAY_HEADING, day), todayOf(row, today, view.today, open)])
  replace(parts.prev, [headingOf(PREV_HEADING, isPrev(prev) ? `${prev.date} · ${prev.ago}` : null), prevOf(prev)])
  fitSpecial(parts.today)
  return parts.page
}

/** 화면 뼈대. 같은 환자의 기록부가 이미 있으면 그것을 쓰고, 아니면 host를 비우고 새로 만든다 */
function partsOf(host, k) {
  let page = host.children.length === 1 ? host.firstElementChild : null
  if (!page || !page.classList.contains('charts-page') || page.getAttribute('data-k') !== k) {
    clear(host)
    page = el('div', { class: 'page charts-page', 'data-k': k }, [
      el('header', { class: 'top chart-top' }),
      el('main', { class: 'charts' }, [el('section', { class: 'chart-today' }), el('section', { class: 'chart-prev' })]),
      el('footer', { class: 'foot' }, FOOT),
    ])
    host.appendChild(page)
  }
  return {
    page,
    top: page.querySelector(':scope > header.top'),
    today: page.querySelector(':scope > main.charts > section.chart-today'),
    prev: page.querySelector(':scope > main.charts > section.chart-prev'),
  }
}

/** 머리: [‹ 어레인지]·연결됨 / 차트번호·이름·정보·신환 표시 / 상태·접수 시각 / 메모 상자(있을 때) */
function headOf(row) {
  const info = isText(row.info) ? row.info : ''
  return [
    el('div', { class: 'top-row' }, [el('a', { class: 'back', href: '#/a' }, BACK), el('span', { class: 'conn' }, '연결됨')]),
    el('div', { class: 'who' }, [
      textEl('span', 'chart', row.chart),
      el('h1', { class: 'detail-name' }, isText(row.name) ? row.name : ''),
      textEl('span', 'meta', info),
      info.split(INFO_JOINER).at(-1) === NEW_KIND ? el('span', { class: 'new-badge' }, NEW_KIND) : null,
    ]),
    el('div', { class: 'state' }, [
      el('span', { class: ['status', STATUS_CLASS[row.lane]].filter(Boolean).join(' ') }, row.laneLabel),
      el('span', null, isText(row.time) ? row.time : ''),
      waitedText(row) ? el('span', { class: 'sep' }, '·') : null,
      waitedSpan(row),
    ]),
    isText(row.memo) ? el('div', { class: 'memo' }, [el('span', { class: 'memo-label' }, MEMO_LABEL), row.memo]) : null,
  ]
}

/** 칸 제목: 글 + (날짜 글이 있으면) 흐린 날짜 */
function headingOf(text, date) {
  return el('h2', { class: 'charts-h' }, [text, isText(date) ? el('span', { class: 'h-dt' }, date) : null])
}

/** 오늘 칸: 오늘 종이(상세와 같은 paperCard) · 읽는 중 · 실패 한 줄 */
function todayOf(row, today, date, open) {
  if (today === 'reading') return noteOf(READING, false)
  if (!today || typeof today !== 'object' || !today.paper) return noteOf(FAILED, true)
  return paperCard(row, today.paper, { today: date, open })
}

/** 직전 칸: 직전 종이(회색) · 첫 방문 카드 · 읽는 중 · 실패 한 줄 */
function prevOf(prev) {
  if (prev === 'reading') return noteOf(READING, false)
  if (prev === null) return el('div', { class: 'paper none-card' }, NO_PREV)
  if (!isPrev(prev)) return noteOf(FAILED, true)
  return el('article', { class: 'paper past' }, [
    el('div', { class: 'paper-head' }, [el('span', { class: 'paper-title' }, PAPER_TITLE), el('span', { class: 'paper-date' }, prev.date)]),
    ...recordOf(prev, { day: prev.date.replaceAll('-', '') }),
  ])
}

function noteOf(text, failed) {
  return el('p', { class: failed ? 'chart-note is-error' : 'chart-note' }, text)
}

function isPrev(prev) {
  return prev !== null && typeof prev === 'object' && typeof prev.date === 'string' && typeof prev.ago === 'string'
}

/** 오늘 날짜 "YYYY-MM-DD" (오늘 종이 머리글과 같은 기기 날짜) */
function dashedOf(today) {
  const day = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date()
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
}

/** 글이 있을 때만 요소 */
function textEl(tag, className, text) {
  return isText(text) ? el(tag, { class: className }, text) : null
}

/** 안을 비우고 children(요소·글)을 넣는다. 글은 글 마디로만 들어간다 */
function replace(node, children) {
  clear(node)
  for (const child of [children].flat()) if (child !== null && child !== undefined && child !== false) node.append(child)
}

/** 목록 줄 기다린 글의 진료보류 모양 "보류 {시간}째" */
const HOLD_WAITED = /^보류 (.+)째$/

/**
 * 기다린 글(AC-3308.14·AC-3309.6): 같은 k 목록 줄의 waited 그대로, 진료보류 "보류 {시간}째"만 "{시간}째 대기"로.
 * 시간 글은 목록 그대로라 목록 화면과 숫자가 늘 같다. 없으면 ""
 */
export function waitedText(row) {
  const text = isText(row?.waited) ? row.waited : ''
  const hold = HOLD_WAITED.exec(text)
  return hold ? `${hold[1]}째 대기` : text
}

/** 기다린 글 span: 목록 줄 long(진료대기·진료보류 60분 이상)이면 주황(wt is-long). 글이 없으면 null */
export function waitedSpan(row) {
  const text = waitedText(row)
  return text ? el('span', { class: row.long === true ? 'wt is-long' : 'wt' }, text) : null
}

function isText(value) {
  return typeof value === 'string' && value !== ''
}
