// 상세 그리기 (reception-phone design.md 5절·10절, reception-paper design.md 2·3절). 승인 목업 Paper.html의 상세 화면 그대로다.
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 머리(.patient)는 목록 줄로 그린다. 그 아래 제목 "오늘 진료기록부"와 종이 카드(비트가 인쇄하는 외래진료기록부 모양, AC-1502.1),
//   제목 "지난번 증상"과 '지난번' 카드 하나(AC-1404.7 그대로), 끝 줄. 지난번 카드는 답의 첫 내원(visits[0])의 날짜·N일 전·증상이고
//   글은 도우미(C# HistoryBuilder)가 만든 그대로다. 지난 처방·둘째 이후 내원·더 보기는 그리지 않는다
// - 종이 카드의 차트번호·수진자명(이름·성별·나이)·신환/재진·칸(lane)은 목록 줄(GET /api/board, every초마다 바뀜), 나머지는 상세 답의
//   paper(from=0 답에만 있음)다. 상세 답에 오늘 날짜가 없어 날짜는 기기 날짜(options.today)를 쓴다
// - 증상·상병·처방·원외처방이 모두 비고 줄이 진료대기·진료보류면 그 자리는 "아직 없어요" 한 줄이다(AC-1502.3)
// - 특이사항은 5줄로 자르고(style.css .clamp), 그린 높이가 5줄을 넘을 때만 [전부 보기 ▾]를 보인다(AC-1502.2). 높이는 문서 안에 있어야
//   잴 수 있어 renderDetail·updatePaper는 그린 뒤 스스로 재고, 태블릿은 오른쪽 칸에 넣은 뒤 app.js가 fitSpecial을 부른다
// - 환자 글은 dom.js el()로 글 마디로만 넣는다(AC-1407.6). 도우미에 묻는 요청은 하지 않는다: 자료는 app.js가 넘긴다
// - 문서 제목(document.title)은 건드리지 않는다(AC-1407.5). 모듈에 환자 자료를 남기지 않는다(그린 요소에만 있다)
//
// 쓰는 법 (app.js)
//   renderDetail(host, row, history, options) → .page.detail-page   폰 상세(#/v/{열쇠}). host(#app) 안을 지우고 그린다
//   detailPane(row, history, options) → 요소 배열                    태블릿 오른쪽 칸 내용. board.js fillPane(host, 이것) 뒤 fitSpecial(host)
//   updateDetail(host, row) → true|false                             목록을 다시 읽을 때마다 부른다. 그린 상세가 row.k 환자면
//                                                                    머리(상태·기다린 글·메모)와 종이 카드의 줄 몫(차트번호·수진자명·칸 규칙)만 바꾼다
//   updatePaper(host, k, paper) → true|false                         종이 다시 읽기(AC-1404.8)의 답. 그린 상세가 k 환자면 종이 카드의 paper 몫을
//                                                                    새 paper로 바꾸고 특이사항을 펼쳐 둔 상태는 지킨다(AC-1502.4)
//   fitSpecial(host)                                                 그린 특이사항 높이를 재어 [전부 보기]를 보이거나 숨긴다
//     row                  지금 목록 줄(board.lists 안의 그 열쇠 줄)
//     history              getHistory(k, 0) 답 { visits, next, more, first, total, todaySym, paper }
//     options.today        오늘(Date). 없으면 지금 기기 날짜

import { clear, el } from './dom.js'

const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const PAPER_HEADING = '오늘 진료기록부'
const LAST_HEADING = '지난번 증상'
const NO_VISITS = '첫 방문이라 지난 진료가 없어요.'

/** 지난번 카드 표시와 증상이 없을 때 글 (AC-1404.7). 빈 종이 증상 글도 같다(AC-1502.3) */
const LAST_BADGE = '지난번'
const NO_SYM = '적힌 증상이 없어요'

/** 종이 카드 글 (승인 목업 Paper.html, AC-1502.1~1502.3) */
const PAPER_TITLE = '외래진료기록부'
const SPECIAL_HEAD = '특이사항'
const NO_SPECIAL = '적힌 특이사항이 없어요'
const UNFOLD = '전부 보기 ▾'
const FOLD = '접기 ▴'
const VISIT_HEAD = '내원내역'
const BEFORE_HEAD = '증상 · 상병 · 처방'
const BEFORE_TEXT = '아직 없어요. 진료가 끝나면 여기에 나와요.'
const NONE = '없어요'
const EMPTY_VALUE = '—'
const ORDER_HEADS = ['코드', '명칭', '용량', '횟수', '일수']

/** 사람 칸: [이름, 칸]. chart·who는 목록 줄, 나머지는 paper다. 주·소와 전·화 사이는 목업처럼 빈칸 넷(줄 바꿈 없는 빈칸) */
const PERSON = [
  ['차트번호', 'chart'],
  ['수진자명', 'who'],
  ['주민등록', 'res'],
  ['주    소', 'addr'],
  ['전    화', 'tel'],
  ['이동전화', 'cel'],
]

/** 사람 칸 중 paper에서 오는 것 (updatePaper가 바꾼다) */
const PAPER_PERSON = ['res', 'addr', 'tel', 'cel']

/** 진료 전 칸: 이 칸이고 진료 칸이 모두 비면 "아직 없어요" 한 줄 (AC-1502.3) */
const BEFORE_LANES = new Set(['wait', 'hold'])

/** 빈 진료 칸. 칸이 바뀌어 다시 그릴 때 쓴다(환자 글이 없다) */
const BLANK = Object.freeze({ sym: '', dx: [], rx: [], out: [] })

/** 목록 줄 정보 글 "54세 · 여 · 재진"(BoardBuilder InfoOf, AC-1402.5)을 나누는 글과 조각 */
const INFO_JOINER = ' · '
const AGE = /^(\d+)세$/
const SEX_LETTER = new Map([
  ['남', 'M'],
  ['여', 'F'],
])
const KINDS = new Set(['신환', '재진'])

/** 상태 이름표 모양 (JSON lane → class, board.js와 같다) */
const STATUS_CLASS = { wait: 'status-wait', hold: 'status-hold', pay: 'status-pay', done: 'status-done' }

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
  fitSpecial(page)
  return page
}

/**
 * 태블릿 오른쪽 칸 내용: 환자 칸·제목·종이 카드·제목·지난번 카드·끝 줄. 돌아가기·아래 글은 없다.
 * 목록 화면의 제목이 h1·h2라 한 단계 아래 제목을 쓴다. 칸에 넣은 뒤 fitSpecial(host)로 특이사항 높이를 잰다.
 * @returns {HTMLElement[]}
 */
export function detailPane(row, history, options = {}) {
  return [patientOf(row, 2), ...historyOf(row, history, options, 3)]
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 row.k 환자면 머리와 종이 카드의 줄 몫을 새 줄로 바꾼다(AC-1404.4·1502.3).
 * paper 몫(사람 칸 나머지·특이사항·내원내역·적힌 진료 칸)과 지난번 카드는 그대로다.
 * @param {ParentNode} host 화면 자리(#app)
 * @returns {boolean} 바꿨으면 true
 */
export function updateDetail(host, row) {
  const patient = host.querySelector('.patient')
  if (!patient || !row || patient.getAttribute('data-k') !== row.k) return false
  const level = patient.closest('.page.detail-page') ? 1 : 2
  patient.replaceWith(patientOf(row, level))
  const card = host.querySelector('article.paper')
  if (card) followRow(card, row)
  return true
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 k 환자면 종이 카드의 paper 몫을 새 paper로 바꾼다(AC-1502.4, AC-1404.8 다시 읽기).
 * 특이사항을 펼쳐 두었으면 새 글도 펼친 채다. 머리·지난번 카드·줄 몫(차트번호·수진자명·신환/재진·칸)·날짜는 그대로다.
 * @param {ParentNode} host 화면 자리(#app)
 * @param {string} k 화면용 열쇠
 * @param {object} paper 상세 답의 paper
 * @returns {boolean} 바꿨으면 true
 */
export function updatePaper(host, k, paper) {
  const patient = host.querySelector('.patient')
  const card = host.querySelector('article.paper')
  if (!patient || !card || patient.getAttribute('data-k') !== k) return false
  const day = card.getAttribute('data-day') ?? ''
  for (const key of PAPER_PERSON) card.querySelector(`:scope > dl.kv > dd[data-field="${key}"]`)?.replaceWith(valueOf(key, paper[key]))
  const open = card.querySelector(':scope > .spc > button.spc-more')?.getAttribute('aria-expanded') === 'true'
  card.querySelector(':scope > .spc')?.replaceWith(specialOf(paper.special, open))
  card.querySelector(':scope > .sec > .visit-line')?.replaceWith(visitLineOf(paper, card.getAttribute('data-kind') ?? '', day))
  card.querySelector(':scope > .paper-body')?.replaceWith(bodyOf(card.getAttribute('data-lane') ?? '', paper, day))
  fitSpecial(card)
  return true
}

/**
 * 그린 특이사항(host 안 첫 종이 카드)의 높이를 재어, 5줄로 자른 높이를 넘을 때만 [전부 보기 ▾]를 보인다(AC-1502.2).
 * 펼쳐 두었으면 넘는 동안 펼친 채이고, 5줄 이하가 되면 접고 단추를 숨긴다. 문서 밖(그리기 전)이면 높이가 0이라 단추를 숨긴다.
 * @param {ParentNode} host 화면 자리(#app) 또는 그 안
 */
export function fitSpecial(host) {
  const text = host.querySelector('.paper > .spc > p.spc-text')
  const button = host.querySelector('.paper > .spc > button.spc-more')
  if (!text || !button) return
  const open = button.getAttribute('aria-expanded') === 'true'
  /* 자른 채로 잰다: 보이는 높이(clientHeight)보다 글 높이(scrollHeight)가 크면 5줄을 넘는다(1px은 반올림 틈) */
  text.classList.add('clamp')
  const over = text.scrollHeight > text.clientHeight + 1
  button.hidden = !over
  setOpen(text, button, open && over)
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

/** 상세 몸(AC-1502.1): 제목·종이 카드·제목·지난번 카드(없으면 첫 방문 글)·끝 줄 */
function historyOf(row, history, options, level) {
  const last = history.visits[0]
  return [
    el(`h${level}`, { class: 'detail-heading' }, PAPER_HEADING),
    paperOf(row, history.paper, dayOf(options)),
    el(`h${level}`, { class: 'detail-heading' }, LAST_HEADING),
    last ? lastOf(last, level + 1) : el('p', { class: 'no-visits' }, NO_VISITS),
    el('p', { class: 'end-note' }, endNote(history)),
  ]
}

// ---- 종이 카드 (AC-1502.1~1502.4) ----------------------------------------------------------------------
// 카드 요소의 data-lane·data-kind·data-day는 줄 몫(칸·신환/재진)과 날짜다(환자를 알아볼 글이 아니다). updatePaper가 paper 몫을
// 다시 그릴 때 이것으로 칸 규칙·보험 뒤 신환/재진·날짜를 정한다. 차트번호·수진자명 칸은 updateDetail만 바꾼다

/** 종이 카드: 머리글·사람 칸·줄·특이사항 상자·<내원내역>·진료 칸(증상~원외처방 자리) */
function paperOf(row, paper, day) {
  const facts = factsOf(row)
  return el('article', { class: 'paper', 'data-lane': row.lane, 'data-kind': facts.kind, 'data-day': day.compact }, [
    el('div', { class: 'paper-head' }, [el('span', { class: 'paper-title' }, PAPER_TITLE), el('span', { class: 'paper-date' }, day.dashed)]),
    el(
      'dl',
      { class: 'kv' },
      PERSON.flatMap(([label, key]) => [el('dt', null, label), valueOf(key, key === 'chart' ? row.chart : key === 'who' ? facts.who : paper[key])]),
    ),
    el('hr', { class: 'rule' }),
    specialOf(paper.special, false),
    sectionOf(VISIT_HEAD, visitLineOf(paper, facts.kind, day.compact)),
    bodyOf(row.lane, paper, day.compact),
  ])
}

/**
 * 줄 몫을 새 줄로(updateDetail): 차트번호·수진자명 칸, 칸 규칙.
 * 칸 규칙(AC-1502.3)이 칸에 따라 달라지는 것은 진료 칸이 모두 빈 때뿐이다. 그때 그릴 것에는 환자 글이 없어 마지막 paper를 두지 않고
 * 빈 진료 칸으로 다시 그린다. 적힌 진료 칸은 칸과 상관없이 같아 그대로 둔다. 새 paper는 칸이 바뀐 다음 읽기에 온다(AC-1404.8)
 */
function followRow(card, row) {
  const facts = factsOf(row)
  card.querySelector(':scope > dl.kv > dd[data-field="chart"]')?.replaceWith(valueOf('chart', row.chart))
  card.querySelector(':scope > dl.kv > dd[data-field="who"]')?.replaceWith(valueOf('who', facts.who))
  if (card.getAttribute('data-lane') === row.lane) return
  card.setAttribute('data-lane', row.lane)
  const body = card.querySelector(':scope > .paper-body')
  if (body?.hasAttribute('data-blank')) body.replaceWith(bodyOf(row.lane, BLANK, card.getAttribute('data-day') ?? ''))
}

/** 사람 칸 값. 비면 흐린 "—" */
function valueOf(key, value) {
  return el('dd', { 'data-field': key }, isText(value) ? value : el('span', { class: 'empty' }, EMPTY_VALUE))
}

/** 특이사항 상자: 비면 점선 상자 글, 있으면 줄 바꿈 그대로의 글(open이 아니면 5줄로 자름) + [전부 보기] 단추(높이를 잰 뒤에 보임) */
function specialOf(special, open) {
  const head = el('div', { class: 'sec-h' }, SPECIAL_HEAD)
  if (!isText(special)) return el('div', { class: 'spc is-none' }, [head, el('p', { class: 'spc-text' }, NO_SPECIAL)])
  return el('div', { class: 'spc' }, [
    head,
    el('p', { class: open ? 'spc-text' : 'spc-text clamp' }, special),
    el('button', { type: 'button', class: 'spc-more', hidden: true, 'aria-expanded': open ? 'true' : 'false', on: { click: toggleSpecial } }, open ? FOLD : UNFOLD),
  ])
}

/** [전부 보기 ▾] ↔ [접기 ▴] */
function toggleSpecial(event) {
  const button = event.currentTarget
  const text = button.parentElement?.querySelector(':scope > p.spc-text')
  if (text) setOpen(text, button, button.getAttribute('aria-expanded') !== 'true')
}

function setOpen(text, button, open) {
  text.classList.toggle('clamp', !open)
  button.setAttribute('aria-expanded', open ? 'true' : 'false')
  button.textContent = open ? FOLD : UNFOLD
}

/** <내원내역> 줄: "내원 : YYYYMMDD", 진료실, 보험(신환|재진). 빈 진료실·보험 글은 뺀다 */
function visitLineOf(paper, kind, day) {
  const ins = isText(paper.ins) && isText(kind) ? `${paper.ins}(${kind})` : isText(paper.ins) ? paper.ins : kind
  return el('div', { class: 'visit-line' }, [el('span', null, `내원 : ${day}`), textEl('span', null, paper.room), textEl('span', null, ins)])
}

/**
 * 진료 칸(AC-1502.3): 진료 칸이 모두 비고 진료 전 칸(진료대기·진료보류)이면 <증상 · 상병 · 처방> 한 줄,
 * 아니면 <증상>·<상병>·<처방>·<원외처방>. 모두 비었으면 data-blank(칸이 바뀌면 updateDetail이 다시 그린다)
 */
function bodyOf(lane, paper, day) {
  const blank = !isText(paper.sym) && paper.dx.length === 0 && paper.rx.length === 0 && paper.out.length === 0
  if (blank && BEFORE_LANES.has(lane)) return el('div', { class: 'paper-body', 'data-blank': true }, sectionOf(BEFORE_HEAD, noneOf(BEFORE_TEXT)))
  return el('div', { class: 'paper-body', 'data-blank': blank }, [
    sectionOf('증상', isText(paper.sym) ? el('div', { class: 'paper-sym' }, [el('span', { class: 'paper-sym-day' }, day), el('pre', null, paper.sym)]) : noneOf(NO_SYM)),
    sectionOf('상병', paper.dx.length > 0 ? el('ul', { class: 'dx' }, paper.dx.map(dxOf)) : noneOf(NONE)),
    sectionOf('처방', ordersOf(paper.rx)),
    sectionOf('원외처방', ordersOf(paper.out)),
  ])
}

/** 칸 하나: <제목> + 내용 (꺾쇠는 style.css .sec-h가 그린다) */
function sectionOf(head, content) {
  return el('div', { class: 'sec' }, [el('div', { class: 'sec-h' }, head), content])
}

function noneOf(text) {
  return el('div', { class: 'none' }, text)
}

/** 상병 한 줄: 코드(주상병이면 style.css가 '주' 표시를 붙임)·이름 */
function dxOf(dx) {
  return el('li', null, [el('code', { class: dx.main ? 'main' : null }, dx.code), el('span', null, dx.name)])
}

/** 처방 표: 코드·명칭·용량·횟수·일수. 줄이 없으면 "없어요" */
function ordersOf(rows) {
  if (rows.length === 0) return noneOf(NONE)
  return el('table', { class: 'rx' }, [
    el('thead', null, el('tr', null, ORDER_HEADS.map((head, i) => el('th', { class: i >= 2 ? 'n' : null }, head)))),
    el(
      'tbody',
      null,
      rows.map((r) =>
        el('tr', null, [el('td', { class: 'c' }, el('code', null, r.code)), el('td', null, r.name), el('td', { class: 'n' }, r.qty), el('td', { class: 'n' }, r.tms), el('td', { class: 'n' }, r.day)]),
      ),
    ),
  ])
}

/** 줄 정보 글에서 수진자명 "이름 (M/54)"과 신환·재진. 모르는 성별·나이는 빼고, 둘 다 모르면 이름만이다 */
function factsOf(row) {
  const parts = isText(row.info) ? row.info.split(INFO_JOINER) : []
  const age = parts.map((part) => AGE.exec(part)?.[1]).find(isText)
  const sex = parts.map((part) => SEX_LETTER.get(part)).find(isText)
  const tag = [sex, age].filter(isText).join('/')
  return {
    who: isText(row.name) && tag !== '' ? `${row.name} (${tag})` : isText(row.name) ? row.name : '',
    kind: parts.find((part) => KINDS.has(part)) ?? '',
  }
}

/** 오늘 날짜 글: 머리글 "YYYY-MM-DD", 내원·증상 "YYYYMMDD" */
function dayOf(options) {
  const day = options.today instanceof Date && !Number.isNaN(options.today.getTime()) ? options.today : new Date()
  const y = String(day.getFullYear())
  const m = String(day.getMonth() + 1).padStart(2, '0')
  const d = String(day.getDate()).padStart(2, '0')
  return { dashed: `${y}-${m}-${d}`, compact: `${y}${m}${d}` }
}

// ---- 지난번 카드 (AC-1404.7) ------------------------------------------------------------------------------

/** 지난번 카드: [지난번] + 날짜, N일 전, 증상 줄(없으면 "적힌 증상이 없어요"). 처방은 그리지 않는다 */
function lastOf(visit, level) {
  return el('section', { class: 'visit is-last' }, [
    el('div', { class: 'visit-head' }, [
      el(`h${level}`, { class: 'visit-date' }, [el('span', { class: 'last-badge' }, LAST_BADGE), visit.date]),
      textEl('span', 'visit-ago', visit.ago),
    ]),
    isText(visit.sym) ? el('p', { class: 'sym' }, `증상 · ${visit.sym}`) : el('p', { class: 'sym-empty' }, NO_SYM),
  ])
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
