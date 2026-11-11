// 상세 그리기 (reception-phone design.md 5절·10절, reception-paper design.md 2·3절, reception-memo-papers design.md 4절).
// 승인 목업 Paper.html의 상세 화면과 승인 시안 reception-memo-papers Mock.html(?s=detail)의 지난 진료기록부 그대로다.
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 머리(.patient)는 목록 줄로 그린다. 그 아래 제목 "오늘 진료기록부"와 종이 카드(비트가 인쇄하는 외래진료기록부 모양, AC-1502.1),
//   제목 "지난 진료기록부"와 지난 종이 자리(.past-list, AC-3404.3), 끝 줄. 상세 답의 지난 내원(visits)은 그리지 않는다
// - 지난 종이 자리는 처음에 "기록부를 읽는 중이에요"이고, app.js가 GET /api/visit/{k}/papers?from=0 답을 fillPast로 넘기면 장마다
//   머리(첫 장만 [지난번] · "M월 D일" · "N일 전")와 직전 기록부와 같은 종이 카드(pastCard), 더 있으면 [이전 진료기록부 더 보기 ▾]를 그린다.
//   [더 보기]는 onMore(next)로 읽어 아래에 붙인다(읽는 중에는 다시 부르지 않음, 실패하면 한 줄 + 다시 누름, AC-3404.4).
//   updateDetail·updatePaper는 이 자리를 건드리지 않아 펼친 장·세로 위치가 그대로다(AC-3404.5)
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
//   paperCard(row, paper, options) → article.paper                   오늘 종이 카드 하나(상세와 같은 모양). 어레인지 기록부 화면(charts.js)이 쓴다.
//                                                                    options.open이면 특이사항을 펼친 채 그린다
//   recordOf(paper, { kind, day, lane }) → 요소 배열                   종이 카드의 <내원내역> 칸과 진료 칸(<증상>~<원외처방>).
//                                                                    직전 진료기록부(charts.js, 사람 칸·특이사항 없음)가 같은 모양으로 쓴다
//   fillPast(host, k, papers, { onMore }) → true|false               그린 상세가 k 환자면 지난 종이 자리를 papers(?from=0 답, 실패면 null)로
//                                                                    채운다. onMore(from) → Promise<다음 쪽 답>
//   pastCard(paper) → article.paper.past                             지난 종이 카드 하나(사람 칸·특이사항 없음). 기록부 화면(charts.js)의
//                                                                    직전 종이도 이것이다
//     row                  지금 목록 줄(board.lists 안의 그 열쇠 줄)
//     history              getHistory(k, 0) 답 { visits, next, more, first, total, todaySym, paper }
//     options.today        오늘(Date). 없으면 지금 기기 날짜

import { clear, el } from './dom.js'

const FOOT = '보기만 할 수 있어요 · 비트 자료는 바뀌지 않아요'
const PAPER_HEADING = '오늘 진료기록부'
const NO_VISITS = '첫 방문이라 지난 진료가 없어요.'

/** 지난 진료기록부 (reception-memo-papers AC-3404.3~3404.5, 승인 시안 Mock.html) */
const PAST_HEADING = '지난 진료기록부'
const PAST_READING = '기록부를 읽는 중이에요'
const PAST_FAILED = '지금 기록부를 읽지 못했어요'
const MORE_PAPERS = '이전 진료기록부 더 보기 ▾'

/** [더 보기] 한 번에 붙는 장 수 (도우미 PaperChunk.Next) */
const MORE_STEP = 3

/** 오늘 종이 카드(지난 종이 카드 .paper.past가 아닌 것). updateDetail·updatePaper는 이 카드만 바꾼다 */
const TODAY_CARD = 'article.paper:not(.past)'

/** 지난 종이 날짜 "yyyy-MM-dd" */
const DASHED_DAY = /^(\d{4})-(\d\d)-(\d\d)$/

/** 지난 종이 첫 장 표시. 빈 종이 증상 글 (AC-1502.3) */
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

/** 머리 메모 상자의 이름표와 신환 표시 글 (AC-1503.1·1503.2, board.js와 같다) */
const MEMO_LABEL = '메모'
const NEW_KIND = '신환'

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
 * 태블릿 오른쪽 칸 내용: 환자 칸·제목·종이 카드·제목·지난 종이 자리·끝 줄. 돌아가기·아래 글은 없다.
 * 목록 화면의 제목이 h1·h2라 한 단계 아래 제목을 쓴다. 칸에 넣은 뒤 fitSpecial(host)로 특이사항 높이를 잰다.
 * @returns {HTMLElement[]}
 */
export function detailPane(row, history, options = {}) {
  return [patientOf(row, 2), ...historyOf(row, history, options, 3)]
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 row.k 환자면 머리와 종이 카드의 줄 몫을 새 줄로 바꾼다(AC-1404.4·1502.3).
 * paper 몫(사람 칸 나머지·특이사항·내원내역·적힌 진료 칸)과 지난 종이 자리는 그대로다.
 * @param {ParentNode} host 화면 자리(#app)
 * @returns {boolean} 바꿨으면 true
 */
export function updateDetail(host, row) {
  const patient = host.querySelector('.patient')
  if (!patient || !row || patient.getAttribute('data-k') !== row.k) return false
  const level = patient.closest('.page.detail-page') ? 1 : 2
  patient.replaceWith(patientOf(row, level))
  const card = host.querySelector(TODAY_CARD)
  if (card) followRow(card, row)
  return true
}

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 k 환자면 종이 카드의 paper 몫을 새 paper로 바꾼다(AC-1502.4, AC-1404.8 다시 읽기).
 * 특이사항을 펼쳐 두었으면 새 글도 펼친 채다. 머리·지난 종이 자리·줄 몫(차트번호·수진자명·신환/재진·칸)·날짜는 그대로다.
 * @param {ParentNode} host 화면 자리(#app)
 * @param {string} k 화면용 열쇠
 * @param {object} paper 상세 답의 paper
 * @returns {boolean} 바꿨으면 true
 */
export function updatePaper(host, k, paper) {
  const patient = host.querySelector('.patient')
  const card = host.querySelector(TODAY_CARD)
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

/**
 * 환자 칸: 차트번호·이름·정보(+ 신환 표시), 상태 이름표 + "접수 시각 · 기다린 글", 메모 상자(있을 때만, 이름표 + 글).
 * 못 읽은 칸("")은 그 칸만 비운다(AC-1402.7). 메모·신환 모양은 목록 줄(board.js)과 같다(AC-1503.1·1503.2)
 */
function patientOf(row, level) {
  return el('div', { class: 'patient', 'data-k': row.k }, [
    el('div', { class: 'name-line' }, [textEl('span', 'chart', row.chart), textEl(`h${level}`, 'detail-name', row.name), infoOf(row.info)]),
    el('div', { class: 'status-line' }, [
      el('span', { class: ['status', STATUS_CLASS[row.lane]].filter(Boolean).join(' ') }, row.laneLabel),
      el('span', null, [row.time, row.waited].filter(isText).join(' · ')),
    ]),
    isText(row.memo) ? el('div', { class: 'memo' }, [el('span', { class: 'memo-label' }, MEMO_LABEL), row.memo]) : null,
  ])
}

/**
 * 정보 글 span. 끝 조각이 "신환"이면 글에서 그 조각(과 앞 " · ")을 빼고 바로 뒤에 신환 표시를 붙인다(AC-1503.2). 그 밖이면 글 그대로다.
 * 줄 정보 글은 바꾸지 않는다(종이 카드의 수진자명·신환/재진은 factsOf가 원래 글로 읽는다)
 */
function infoOf(info) {
  const parts = isText(info) ? info.split(INFO_JOINER) : []
  if (parts.at(-1) !== NEW_KIND) return textEl('span', 'info', info)
  return [textEl('span', 'info', parts.slice(0, -1).join(INFO_JOINER)), el('span', { class: 'new-badge' }, NEW_KIND)]
}

/** 상세 몸(AC-1502.1·3404.3): 제목·종이 카드·제목·지난 종이 자리(읽는 중, fillPast가 채운다)·끝 줄 */
function historyOf(row, history, options, level) {
  return [
    el(`h${level}`, { class: 'detail-heading' }, PAPER_HEADING),
    paperOf(row, history.paper, dayOf(options)),
    el(`h${level}`, { class: 'detail-heading' }, PAST_HEADING),
    el('div', { class: 'past-list' }, pastNote(PAST_READING)),
    el('p', { class: 'end-note' }, endNote(history)),
  ]
}

// ---- 종이 카드 (AC-1502.1~1502.4) ----------------------------------------------------------------------
// 카드 요소의 data-lane·data-kind·data-day는 줄 몫(칸·신환/재진)과 날짜다(환자를 알아볼 글이 아니다). updatePaper가 paper 몫을
// 다시 그릴 때 이것으로 칸 규칙·보험 뒤 신환/재진·날짜를 정한다. 차트번호·수진자명 칸은 updateDetail만 바꾼다

/**
 * 오늘 종이 카드 하나(상세 화면·태블릿 오른쪽 칸과 같은 모양, AC-1502.1). 어레인지 기록부 화면의 "오늘 진료기록부"가 쓴다(AC-3309.1)
 * @param {object} row 목록 줄 @param {object} paper 상세 답의 paper
 * @param {{ today?: Date, open?: boolean }} [options] open이면 특이사항을 펼친 채
 * @returns {HTMLElement} article.paper
 */
export function paperCard(row, paper, options = {}) {
  return paperOf(row, paper, dayOf(options), options.open === true)
}

/**
 * 종이 카드의 <내원내역> 칸과 진료 칸(<증상>·<상병>·<처방>·<원외처방>). 사람 칸·특이사항은 없다.
 * 직전 진료기록부(charts.js)가 오늘 카드와 같은 모양으로 쓴다(AC-3309.1)
 * @param {{ room: string, ins: string, sym: string, dx: object[], rx: object[], out: object[] }} paper
 * @param {{ kind?: string, day: string, lane?: string }} options kind 신환|재진(보험 뒤 괄호, 모르면 ''), day 'YYYYMMDD',
 *   lane 진료 전 칸이면 빈 진료 칸을 한 줄로(AC-1502.3). 모르면 ''
 * @returns {HTMLElement[]}
 */
export function recordOf(paper, { kind = '', day, lane = '' }) {
  return [sectionOf(VISIT_HEAD, visitLineOf(paper, kind, day)), bodyOf(lane, paper, day)]
}

/** 종이 카드: 머리글·사람 칸·줄·특이사항 상자·<내원내역>·진료 칸(증상~원외처방 자리) */
function paperOf(row, paper, day, open = false) {
  const facts = factsOf(row)
  return el('article', { class: 'paper', 'data-lane': row.lane, 'data-kind': facts.kind, 'data-day': day.compact }, [
    el('div', { class: 'paper-head' }, [el('span', { class: 'paper-title' }, PAPER_TITLE), el('span', { class: 'paper-date' }, day.dashed)]),
    el(
      'dl',
      { class: 'kv' },
      PERSON.flatMap(([label, key]) => [el('dt', null, label), valueOf(key, key === 'chart' ? row.chart : key === 'who' ? facts.who : paper[key])]),
    ),
    el('hr', { class: 'rule' }),
    specialOf(paper.special, open),
    ...recordOf(paper, { kind: facts.kind, day: day.compact, lane: row.lane }),
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

// ---- 지난 진료기록부 여러 장 (reception-memo-papers AC-3404.3~3404.5) ------------------------------------------
// 지난 종이 글은 그린 요소에만 있다. 다음 쪽 시작 위치(next)·남은 수는 [더 보기] 처리기만 안다

/**
 * 그린 상세(폰 화면 또는 태블릿 오른쪽 칸)가 k 환자면 지난 종이 자리를 papers?from=0 답으로 채운다(AC-3404.3·3404.5).
 * 지난 내원이 없으면 첫 방문 글, papers가 답 모양이 아니면(첫 읽기 실패, null) "지금 기록부를 읽지 못했어요" 한 줄이다.
 * @param {ParentNode} host 화면 자리(#app)
 * @param {string} k 화면용 열쇠
 * @param {{ papers: object[], total: number, next: number | null } | null} papers
 * @param {{ onMore?: (from: number) => Promise<object> }} [options] [더 보기]가 다음 쪽(from=next)을 읽는 곳(app.js)
 * @returns {boolean} 채웠으면 true
 */
export function fillPast(host, k, papers, options = {}) {
  const patient = host.querySelector('.patient')
  const list = host.querySelector('.past-list')
  if (!patient || !list || patient.getAttribute('data-k') !== k) return false
  clear(list)
  if (!isPage(papers)) list.append(pastNote(PAST_FAILED))
  else if (papers.papers.length === 0) list.append(el('p', { class: 'no-visits' }, NO_VISITS))
  else appendPage(list, papers, true, options.onMore)
  return true
}

/**
 * 지난 종이 카드 하나(AC-3404.3): 머리글(외래진료기록부·yyyy-MM-dd) + <내원내역> + 진료 칸(recordOf). 사람 칸·특이사항은 없고 테두리는 회색이다.
 * 어레인지 기록부 화면(charts.js)의 직전 종이도 이 카드다(AC-3309.1)
 * @param {{ date: string, room: string, ins: string, sym: string, dx: object[], rx: object[], out: object[] }} paper
 * @returns {HTMLElement} article.paper.past
 */
export function pastCard(paper) {
  return el('article', { class: 'paper past' }, [
    el('div', { class: 'paper-head' }, [el('span', { class: 'paper-title' }, PAPER_TITLE), el('span', { class: 'paper-date' }, paper.date)]),
    ...recordOf(paper, { day: paper.date.replaceAll('-', '') }),
  ])
}

/** 한 쪽을 [더 보기] 앞(없으면 끝)에 장마다 머리 + 카드로 붙이고, [더 보기]를 그 쪽의 next로 바꾼다(없으면 뺀다). first면 첫 장에 [지난번] */
function appendPage(list, page, first, onMore) {
  const old = list.querySelector(':scope > button.more-papers')
  page.papers.forEach((paper, i) => {
    list.insertBefore(pastHead(paper, first && i === 0), old)
    list.insertBefore(pastCard(paper), old)
  })
  old?.remove()
  if (page.next !== null) list.append(moreOf(list, page, onMore))
}

/**
 * [이전 진료기록부 더 보기 ▾] + "N번 더 있어요 · 누를 때마다 3장씩"(AC-3404.4). 누르면 onMore(next)를 한 번 부르고 읽는 동안 꺼 둔다.
 * 답이 오면 아래에 붙이고, 실패하면 "지금 기록부를 읽지 못했어요"를 단추 앞에 두고 다시 누를 수 있게 한다
 */
function moreOf(list, page, onMore) {
  const next = page.next
  const press = () => {
    if (button.disabled || typeof onMore !== 'function') return
    button.disabled = true
    button.setAttribute('aria-busy', 'true')
    Promise.resolve()
      .then(() => onMore(next))
      .then((more) => {
        if (!isPage(more)) throw new TypeError('지난 종이 답 모양이 틀렸다')
        list.querySelector(':scope > p.past-note')?.remove()
        appendPage(list, more, false, onMore)
      })
      .catch(() => {
        button.disabled = false
        button.removeAttribute('aria-busy')
        if (!list.querySelector(':scope > p.past-note')) list.insertBefore(pastNote(PAST_FAILED), button)
      })
  }
  const button = el('button', { type: 'button', class: 'more-papers', on: { click: press } }, [
    MORE_PAPERS,
    el('small', null, `${page.total - next}번 더 있어요 · 누를 때마다 ${MORE_STEP}장씩`),
  ])
  return button
}

/** 장 머리: (첫 장만 [지난번]) · "M월 D일" · "N일 전" */
function pastHead(paper, last) {
  return el('div', { class: 'past-h' }, [last ? el('span', { class: 'last-badge' }, LAST_BADGE) : null, el('strong', null, monthDay(paper.date)), textEl('span', 'visit-ago', paper.ago)])
}

/** "yyyy-MM-dd" → "M월 D일". 모양이 틀리면 "" */
function monthDay(date) {
  const found = DASHED_DAY.exec(typeof date === 'string' ? date : '')
  return found ? `${Number(found[2])}월 ${Number(found[3])}일` : ''
}

/** 지난 종이 자리의 한 줄(읽는 중·읽지 못함) */
function pastNote(text) {
  return el('p', { class: 'past-note' }, text)
}

/** 지난 종이 한 쪽 답 모양 { papers: [], total, next } (모양 검사는 api.js가 한다. 여기서는 그릴 수 있는지만) */
function isPage(page) {
  return (
    page !== null &&
    typeof page === 'object' &&
    Array.isArray(page.papers) &&
    Number.isSafeInteger(page.total) &&
    (page.next === null || Number.isSafeInteger(page.next))
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
