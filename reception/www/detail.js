// 상세 그리기 (design.md 5절·10절, 승인 시안 Detail.dc.html·Tablet.dc.html 오른쪽 칸에서 지난 진료 목록·처방·[더 보기]를 뺀 것, AC-1404.7).
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 지난 진료는 답의 첫 내원(visits[0], 가장 최근 지난 완료 내원) 하나만 '지난번' 카드로 그린다: 날짜·N일 전·증상(없으면 "적힌 증상이 없어요").
//   글(날짜·N일 전·증상·처음 온 날·모두 N번)은 도우미(C# HistoryBuilder)가 만든 그대로다. 지난 처방·둘째 이후 내원·더 보기는 그리지 않는다
// - 오늘 카드의 상태 이름표·오늘 처방은 화면이 가진 목록 줄(GET /api/board, every초마다 바뀜)로 그리고, 오늘 증상은 상세 답의 todaySym이다(design.md 5절).
//   글은 C# HistoryBuilder.TodayTitle·TodayLabel·NoTodayRx와 같다. 상세 답에 오늘 날짜가 없어 제목 날짜만 기기 날짜(options.today)를 쓴다
// - 환자 글은 dom.js el()로 글 마디로만 넣는다(AC-1407.6). 도우미에 묻는 요청은 하지 않는다: 자료는 app.js가 넘긴다
// - 문서 제목(document.title)은 건드리지 않는다(AC-1407.5). 모듈에 환자 자료를 남기지 않는다(그린 요소에만 있다)
//
// 쓰는 법 (app.js)
//   renderDetail(host, row, history, options) → .page.detail-page   폰 상세(#/v/{열쇠}). host(#app) 안을 지우고 그린다
//   detailPane(row, history, options) → 요소 배열                    태블릿 오른쪽 칸 내용. board.js fillPane(host, 이것)에 넘긴다
//   updateDetail(host, row, options) → true|false                    목록을 다시 읽을 때마다 부른다. 그린 상세가 row.k 환자면
//                                                                    머리(상태·기다린 글·메모)와 오늘 카드만 바꾸고 지난번 카드·오늘 증상은 둔다
//   updateTodaySym(host, k, todaySym) → true|false                   오늘 증상 다시 읽기(AC-1404.8)의 답. 그린 상세가 k 환자면 오늘 카드의 증상 줄만 바꾼다
//     row                  지금 목록 줄(board.lists 안의 그 열쇠 줄)
//     history              getHistory(k, 0) 답 { visits, next, more, first, total, todaySym }
//     options.today        오늘(Date). 없으면 지금 기기 날짜

import { clear, el } from './dom.js'

const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const HEADING = '오늘과 지난번 증상'
const NO_VISITS = '첫 방문이라 지난 진료가 없어요.'

/** 지난번 카드 표시와 증상이 없을 때 글 (AC-1404.7) */
const LAST_BADGE = '지난번'
const NO_SYM = '적힌 증상이 없어요'

/** 오늘 처방이 없을 때 (HistoryBuilder.NoTodayRx, AC-1404.4) */
const NO_TODAY_RX = '아직 처방이 없어요. 진료가 끝나면 여기에 나와요.'

/** 오늘 카드 오른쪽 이름표 (HistoryBuilder.TodayLabel, AC-1404.4) */
const TODAY_LABEL = { wait: '진료 전', hold: '진료보류', pay: '수납대기', done: '수납완료' }

/** 상태 이름표 모양 (JSON lane → class, board.js와 같다) */
const STATUS_CLASS = { wait: 'status-wait', hold: 'status-hold', pay: 'status-pay', done: 'status-done' }

/** 목록 줄의 처방 글 "이름(코드) · 코드 · …"(BoardBuilder RxText, AC-1402.6)을 나누는 글과 "이름(코드)" 모양 */
const RX_JOINER = ' · '
const NAMED_RX = /^(.+)\(([^()]+)\)$/

/**
 * 폰 상세 화면을 host 안에 그린다(안에 있던 화면은 지운다).
 * @param {HTMLElement} host 화면 자리(#app)
 * @param {object} row 목록 줄
 * @param {object} history 상세 답 첫 쪽
 * @param {{ today?: Date }} [options]
 * @returns {HTMLElement} .page.detail-page
 */
export function renderDetail(host, row, history, options = {}) {
  clear(host)
  const page = el('div', { class: 'page detail-page' }, [
    el('header', { class: 'top is-detail' }, [
      el('div', { class: 'top-row' }, [
        el('a', { class: 'back', href: '#/' }, '접수 현황'),
        el('img', { class: 'logo-mark', src: '/logo-mark.png', alt: '양지바른정형외과' }),
      ]),
      patientOf(row, 1),
    ]),
    el('main', { class: 'detail' }, historyOf(row, history, options, 2)),
    el('footer', { class: 'foot' }, FOOT),
  ])
  host.appendChild(page)
  return page
}

/**
 * 태블릿 오른쪽 칸 내용(승인 태블릿 시안, AC-1404.7): 환자 칸·제목·오늘 카드·지난번 카드·끝 줄. 돌아가기·아래 글은 없다.
 * 목록 화면의 제목이 h1·h2라 한 단계 아래 제목을 쓴다.
 * @returns {HTMLElement[]}
 */
export function detailPane(row, history, options = {}) {
  return [patientOf(row, 2), ...historyOf(row, history, options, 3)]
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 row.k 환자면 머리와 오늘 카드를 새 줄로 바꾼다(AC-1404.4).
 * @param {ParentNode} host 화면 자리(#app)
 * @returns {boolean} 바꿨으면 true
 */
export function updateDetail(host, row, options = {}) {
  const patient = host.querySelector('.patient')
  if (!patient || !row || patient.getAttribute('data-k') !== row.k) return false
  const level = patient.closest('.page.detail-page') ? 1 : 2
  patient.replaceWith(patientOf(row, level))
  const today = host.querySelector('section.today')
  if (today) today.replaceWith(todayOf(row, today.querySelector(':scope > p.sym'), options, level + 2))
  return true
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 k 환자면 오늘 카드의 증상 줄만 todaySym으로 바꾼다(AC-1404.8). ""이면 줄을 지운다.
 * 없던 줄은 오늘 처방 목록 앞(없으면 카드 끝)에 넣는다. 지난번 카드·머리·오늘 처방은 그대로다.
 * @param {ParentNode} host 화면 자리(#app)
 * @returns {boolean} 바꿨으면 true
 */
export function updateTodaySym(host, k, todaySym) {
  const patient = host.querySelector('.patient')
  const today = host.querySelector('section.today')
  if (!patient || !today || patient.getAttribute('data-k') !== k) return false
  today.querySelector(':scope > p.sym')?.remove()
  const sym = symLine(todaySym)
  if (sym) today.insertBefore(sym, today.querySelector(':scope > ul.rx-list'))
  return true
}

/** 환자 칸: 차트번호·이름·정보, 상태 이름표 + "접수 시각 · 기다린 글", 메모(있을 때만). 못 읽은 칸("")은 그 칸만 비운다(AC-1402.7) */
function patientOf(row, level) {
  return el('div', { class: 'patient', 'data-k': row.k }, [
    el('div', { class: 'name-line' }, [textEl('span', 'chart', row.chart), textEl(`h${level}`, 'detail-name', row.name), textEl('span', 'info', row.info)]),
    el('div', { class: 'status-line' }, [
      el('span', { class: ['status', STATUS_CLASS[row.lane]].filter(Boolean).join(' ') }, row.laneLabel),
      el('span', null, [row.time, row.waited].filter(isText).join(' · ')),
    ]),
    isText(row.memo) ? el('div', { class: 'memo' }, `메모 · ${row.memo}`) : null,
  ])
}

/** 상세 몸(AC-1404.7): 제목·오늘 카드·지난번 카드(없으면 첫 방문 글)·끝 줄 */
function historyOf(row, history, options, level) {
  const last = history.visits[0]
  return [
    el(`h${level}`, { class: 'detail-heading' }, HEADING),
    todayOf(row, symLine(history.todaySym), options, level + 1),
    last ? lastOf(last, level + 1) : el('p', { class: 'no-visits' }, NO_VISITS),
    el('p', { class: 'end-note' }, endNote(history)),
  ]
}

/** 오늘 카드: [오늘] + 날짜, 오른쪽 이름표, 오늘 처방이 없으면 그 글, 오늘 증상, 오늘 처방 목록 */
function todayOf(row, sym, options, level) {
  const day = options.today instanceof Date && !Number.isNaN(options.today.getTime()) ? options.today : new Date()
  const date = `${day.getMonth() + 1}월 ${day.getDate()}일`
  const rx = todayRxOf(row)
  return el('section', { class: 'today' }, [
    el('div', { class: 'today-head' }, [
      el(`h${level}`, { class: 'today-date', 'aria-label': `${date} · 오늘` }, [el('span', { class: 'today-badge' }, '오늘'), date]),
      el('span', { class: 'today-state' }, TODAY_LABEL[row.lane] ?? ''),
    ]),
    rx.length === 0 ? el('p', { class: 'today-empty' }, NO_TODAY_RX) : null,
    sym,
    rx.length > 0 ? rxList(rx) : null,
  ])
}

/** 목록 줄의 이름표가 "오늘"이면 그 처방 글을 [{ name, code }]로 나눈다. "이름(코드)"가 아니면 코드만 있는 처방이다 */
function todayRxOf(row) {
  if (row.rxLabel !== '오늘' || !isText(row.rx)) return []
  return row.rx
    .split(RX_JOINER)
    .filter(isText)
    .map((part) => {
      const named = NAMED_RX.exec(part)
      return named ? { name: named[1], code: named[2] } : { name: '', code: part }
    })
}

/** 지난번 카드: [지난번] + 날짜, N일 전, 증상 줄(없으면 "적힌 증상이 없어요"). 처방은 그리지 않는다 */
function lastOf(visit, level) {
  return el('section', { class: 'visit is-last' }, [
    el('div', { class: 'visit-head' }, [
      el(`h${level}`, { class: 'visit-date' }, [el('span', { class: 'last-badge' }, LAST_BADGE), visit.date]),
      textEl('span', 'visit-ago', visit.ago),
    ]),
    symLine(visit.sym) ?? el('p', { class: 'sym-empty' }, NO_SYM),
  ])
}

function symLine(sym) {
  return isText(sym) ? el('p', { class: 'sym' }, `증상 · ${sym}`) : null
}

/** 처방 목록: 이름 + "(코드)" 작은 글. 이름이 없으면 코드가 그 줄의 글이다 */
function rxList(items) {
  return el(
    'ul',
    { class: 'rx-list' },
    items.map(({ name, code }) =>
      isText(name) ? el('li', { class: 'rx-item' }, [name, isText(code) ? el('span', { class: 'rx-code' }, `(${code})`) : null]) : el('li', { class: 'rx-item' }, code),
    ),
  )
}

/** 끝 줄: "처음 온 날 YYYY년 M월 D일 · 모두 N번 왔어요"(처음 온 날을 못 읽었으면 그 앞부분 없이) */
function endNote(history) {
  const total = `모두 ${history.total}번 왔어요`
  return isText(history.first) ? `처음 온 날 ${history.first} · ${total}` : total
}

/** 글이 있을 때만 요소 */
function textEl(tag, className, text) {
  return isText(text) ? el(tag, { class: className }, text) : null
}

function isText(value) {
  return typeof value === 'string' && value !== ''
}
