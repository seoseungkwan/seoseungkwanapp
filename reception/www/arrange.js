// 어레인지 표 그리기 (reception-arrange design.md 4·7·10절, 승인 시안 docs/mockups/reception-arrange/Arrange.html). class 이름은 style.css
// 머리 글의 화면 틀 그대로다. 도우미 GET /api/board 답의 arrange(design.md 7절)를 그린다.
// - 줄(arrange.rows)은 열쇠(k)로 같은 판의 목록 줄을 가리킨다: 이름·차트번호·정보·메모·상태·접수 시각은 목록 줄 것이다(AC-3305.3).
//   목록 줄이 없는 열쇠는 그리지 않는다. 칸 단계·시각·순서는 도우미(C# ArrangeBuilder)가 정한 그대로 그리고 화면은 계산하지 않는다
// - 환자 글은 dom.js el()로 글 마디로만 넣는다(AC-3312.1). 이름은 속성(aria-label 등)에도 넣지 않는다
// - 같은 자리에 다시 그리면 뼈대(머리·표·아래 글)는 두고 안만 바꾼다. 표를 옆으로 민 위치(.wrap)가 다시 읽을 때마다 처음으로 가지 않는다(AC-3308.11)
// - 도우미에 묻지 않는다: 누르기는 view.on…으로만 알린다(app.js가 보낸다). 고르기 창·[오늘 치료 종료] 펼침은 그 자리에서 다시 그린 뒤
//   view.onSheet·view.onEnded로 알려 app.js가 다음 그리기에 그대로 넘긴다
// - planOf(판, 쓰기)는 쓰기 하나를 판에 미리 얹은 사본(낙관적 그리기)·되돌리기 띠 글·되돌리기 쓰기(반대 쓰기, design.md 10절)를 준다.
//   미리 얹는 시각은 판의 at(PC 시각)의 시:분이다(휴대폰 시계 없음). 답을 받으면 app.js가 판을 다시 읽어 도우미 값으로 바뀐다
//
// 쓰는 법 (app.js)
//   renderArrange(host, board, view) → .page.arrange    host는 #app. 안에 다른 화면이 있으면 지우고 그린다
//     view.reading · view.onRefresh · view.onTab   머리(board.js topOf)
//     view.sheet         열린 고르기 창 { k, col, kind: 'add'|'done'|'part' } | null. 그 줄·칸이 판에 맞지 않으면 그리지 않는다.
//                        충격파 넣기 창은 고른 타수·부위 수 { …, hit, count }도 담는다(AC-3402.2, 목록 밖 값은 안 고른 것)
//                        C-ARM 넣기 창(빈 칸 add · [시술 고르기] part)은 { …, proc, drug }, SONO 넣기 창(빈 칸 add · [부위 고르기] part)은
//                        { …, side, picked, withs }를 담는다(reception-pick-lists AC-3503.1·3504.3). 목록은 판 picks뿐이고 목록 밖 값은 안 고른 것,
//                        판에 picks가 없으면 두 넣기 창은 열리지 않는다(AC-3505.4)
//     view.endedOpen     [오늘 치료 종료 N명] 펼침
//     view.toast         되돌리기 띠 { text, undo } | null. undo면 [되돌리기](view.onUndo())
//     view.rxNew         '처방 나옴' 이름표를 붙일 열쇠들 (AC-3310.2)
//     view.flash         이번 그리기에 반짝일 줄의 열쇠들 (AC-3310.2)
//     view.onCell(k, col)          준비·준비완료 칸 누름(step)
//     view.onAdd(k, col, v, t?)    빈 칸 넣기 창에서 고름(add). t는 SONO·C-ARM 이름표를 "|"로 이은 글(없으면 빈 글)
//     view.onPart(k, col, v, t)    [부위 고르기]·[시술 고르기] 창에서 고름(part)
//     view.onSet(k, col, v)        완료 창의 [준비로·준비완료로 되돌리기](set todo|ready)
//     view.onRemove(k, col)        완료 창의 [칸에서 빼기](remove)
//     view.onAway(k, on|off)       접수 칸 누름(away)
//     view.onPtf(k, up|down|off)   [PT 먼저] 누름(ptf): 없음 → up → down → 없음
//     view.onEnd(k) · view.onRestore(k)   [치료 종료](end on) · [다시 넣기](end off)
//     view.onChart(k)              성함 누름(기록부 열기)
//     view.onUndo()                띠의 [되돌리기]
//     view.onSheet(sheet|null) · view.onEnded(open)   창 열고 닫음 · 펼침 바뀜
//   planOf(board, { k, op, col?, v?, t? }) → { board, toast, undo }   맞지 않는 쓰기면 받은 판 그대로·toast null·undo null.
//                      SONO·C-ARM add·part는 판 picks로 본다(도우미 PickLists.IsSono·IsCarm과 같은 규칙, reception-pick-lists AC-3502.3)
//   CHOICES            X-RAY·PT·도수·충격파·견인 고르기 목록(design.md 4절). C# ArrangeChoices(ArrangeMarks.cs)와 같은 글이다(시험이 견준다).
//                      SONO·C-ARM 목록은 화면에 두지 않고 판 picks만 쓴다(reception-pick-lists AC-3505.4)

import { clear, el } from './dom.js'
import { refreshText, topOf } from './board.js'
import { waitedSpan } from './charts.js'

/** X-RAY 넣기 글 (design.md 4절) */
const XRAY_TAKE = 'X-ray 찍기'

/** SONO 쪽(고정): 단추 글과 부위 앞에 붙는 글 "{쪽} {부위}" (reception-pick-lists AC-3504.2, 시안 SIDES·SIDE_WORD) */
const SIDES = Object.freeze([
  ['오른쪽', '오른'],
  ['왼쪽', '왼'],
  ['양쪽', '양'],
])
const SIDE_WORDS = SIDES.map(([, word]) => word)

/** SONO 칸에 담는 줄 수 한도 (AC-3502.3) */
const SONO_LINES = 6

/** SONO·C-ARM 칸의 여러 줄·이름표를 잇는 글 (AC-3502.1) */
const JOIN = '|'

/** SONO·C-ARM 넣기 창의 글 (시안 carmSheet·sonoSheet) */
const CARM_SUB = '시술과 약재를 골라요'
const SONO_SUB = '쪽을 누르고 부위를 눌러 담아요. 두 부위면 하나 더 담아요'
const PICKED_EMPTY = '아직 없어요 · 아래에서 부위를 눌러요'
const SIDE_HINT = '안 고르면 부위만 담겨요'
const PLAIN_HINT = '쪽·부위 없이 그대로 담겨요'

/** 충격파 부위 수·타수 (reception-memo-papers AC-3402.1, 시안 Mock.html). 칸 글은 "N부위" 또는 "{타수} N부위" */
const ESWT_COUNTS = Object.freeze(['1부위', '2부위', '3부위', '4부위'])
const ESWT_HITS = Object.freeze(['2000타', '3000타', '4000타', '6000타'])

/** 칸마다 직접 넣기(add)의 고르기 목록 (design.md 4절). SONO·C-ARM은 판 picks다 */
export const CHOICES = Object.freeze({
  xray: Object.freeze([XRAY_TAKE]),
  pt: Object.freeze(['ICE', 'HP']),
  ds: Object.freeze(['30분', '50분']),
  eswt: Object.freeze([...ESWT_COUNTS, ...ESWT_HITS.flatMap((hit) => ESWT_COUNTS.map((count) => `${hit} ${count}`))]),
  trac: Object.freeze(['목', '허리']),
})

/**
 * 칸 일곱 (표 차례, 시안 COLS): key JSON 이름, head·sub 표 머리 글, name 띠·창에 쓰는 이름,
 * rx 처방에서 오는 칸(직접 넣으면 점선 "직접"), three 준비 → 준비완료 → 완료 세 단계(부위·순서가 있는 칸),
 * pick 부위·시술이 없는 칸의 고르기 단추 글
 */
const COLS = [
  { key: 'xray', head: 'X-RAY', sub: '', name: 'X-RAY', rx: true, three: false },
  { key: 'sono', head: 'SONO', sub: '부위·준비·순서', name: 'SONO', rx: true, three: true, pick: '부위 고르기' },
  { key: 'carm', head: 'C-ARM', sub: '시술·약재·순서', name: 'C-ARM', rx: true, three: true, pick: '시술 고르기' },
  { key: 'pt', head: 'PT', sub: 'ICE·HP', name: 'PT', rx: false, three: false },
  { key: 'ds', head: '도수', sub: '30·50분', name: '도수', rx: false, three: false },
  { key: 'eswt', head: '충격파', sub: '타수·부위 수', name: '충격파', rx: false, three: false },
  { key: 'trac', head: '견인', sub: '목·허리', name: '견인', rx: false, three: false },
]
const COL = new Map(COLS.map((col) => [col.key, col]))

/** 칸 단계와 차례 (todo 준비 · ready 준비완료 · done 완료) */
const STEPS = ['todo', 'ready', 'done']

/** 목록 줄을 찾는 칸 넷 (진료 순서는 같은 줄을 다시 담는다) */
const LANES = ['wait', 'hold', 'pay', 'done']

/** 상태 이름표 모양 (JSON lane → class, board.js와 같다) */
const STATUS_CLASS = { wait: 'status-wait', hold: 'status-hold', pay: 'status-pay', done: 'status-done' }

/** 표시 뜻 (시안 .legend): [class, 글] */
const LEGEND = [
  ['todo', '준비'],
  ['ready', '준비완료'],
  ['done', '✓ 완료'],
  ['manual', '직접 넣음'],
  ['away', '자리비움'],
  ['ptup', '↑ PT 먼저'],
]

/** 쓰는 법 두 줄 (시안 .howto) */
const HOWTO = [
  '치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 SONO·C-ARM만). X-RAY·SONO·C-ARM은 처방이 나오면 저절로 들어오고(SONO는 [부위 고르기], C-ARM은 [시술 고르기]로 골라요), PT·도수·충격파·견인은 빈 칸을 눌러 골라 넣어요.',
  '접수 시각을 누르면 자리비움, 성함을 누르면 오늘·직전 진료기록부가 열려요. [PT 먼저]는 누를 때마다 ↑ 올라감 → ↓ 내려옴 → 지움.',
]

const FOOT = '표시(준비완료·완료·자리비움·PT 먼저·치료 종료)는 의원 PC에만 남아요 · 비트 자료는 바뀌지 않아요'
const EMPTY = '지금 안내할 환자가 없어요'
const ENDED_EMPTY = '아직 없어요'
const NO_LAST = '첫 방문이라 지난 증상이 없어요'
const LAST_LABEL = '지난번'
const RX_NEW = '처방 나옴'
const NEW_KIND = '신환'

/** 완료 창의 고르기 글 (시안 tapCell) */
const BACK_TODO = '준비로 되돌리기'
const BACK_READY = '준비완료로 되돌리기'
const TAKE_OUT = '칸에서 빼기'

/** 고르기 창 단추가 이보다 많으면 세 줄로 놓는다(시안 .opts.many) */
const MANY = 6

/** 줄 정보 글 "54세 · 여 · 재진"(BoardBuilder InfoOf)을 나누는 글과 조각 */
const INFO_JOINER = ' · '
const AGE = /^(\d+)세$/
const SEXES = new Set(['남', '여'])

/** 접수 시각 글 "10:42 접수"의 시:분 */
const TIME = /^\d\d:\d\d/

/**
 * 어레인지 화면을 host 안에 그린다.
 * @param {HTMLElement} host 화면 자리(#app)
 * @param {object} board GET /api/board 답(arrange가 없으면 빈 표)
 * @param {object} [view] 위 '쓰는 법'
 * @returns {HTMLElement} .page.arrange
 */
export function renderArrange(host, board, view = {}) {
  const parts = partsOf(host)
  const lists = listRows(board)
  const arrange = arrangeOf(board)
  const picks = picksOf(board)
  const rows = arrange.rows.filter((row) => lists.has(row.k))
  const redraw = (next) => renderArrange(host, board, { ...view, reading: readingNow(host), ...next })
  const act = actionsOf(host, view, redraw, picks)

  replace(parts.top, topOf(board, { ...view, tab: 'arrange' }))
  replace(parts.asof, `${board.at} 기준 · ${refreshText(board.every)}`)
  const rxNew = new Set(Array.isArray(view.rxNew) ? view.rxNew : [])
  const flash = new Set(Array.isArray(view.flash) ? view.flash : [])
  replace(
    parts.body,
    rows.map((row) => rowOf(row, lists.get(row.k), { rxNew: rxNew.has(row.k), flash: flash.has(row.k) }, act)),
  )
  parts.empty.hidden = rows.length > 0
  replace(parts.ended, endedOf(arrange.ended, lists, view.endedOpen === true, act))

  // 같은 창을 다시 그리면 창 안 세로 위치를 그대로 둔다(긴 SONO 창을 누를 때마다·저절로 다시 그릴 때마다 맨 위로 가지 않게)
  const before = parts.page.querySelector(':scope > .sheet-back')
  const top = before?.querySelector(':scope > .sheet')?.scrollTop ?? 0
  const same = before !== null && drawnSheet.get(parts.page) === sheetKey(view.sheet)
  before?.remove()
  parts.page.querySelector(':scope > .toast')?.remove()
  const sheet = sheetOf(view.sheet, rows, lists, act, picks)
  drawnSheet.set(parts.page, sheet ? sheetKey(view.sheet) : null)
  if (sheet) {
    parts.page.appendChild(sheet)
    if (same && top > 0) sheet.querySelector(':scope > .sheet').scrollTop = top
  }
  const toast = toastOf(view.toast, act)
  if (toast) parts.page.appendChild(toast)
  return parts.page
}

/**
 * 쓰기 하나를 판에 미리 얹은 사본과 되돌리기 띠 글·되돌리기 쓰기 (AC-3308.5·3308.6·3308.7·3308.8·3308.13, design.md 10절).
 * 받은 판은 바꾸지 않는다. 판에 없는 줄·칸이거나 맞지 않는 쓰기면 받은 판 그대로이고 toast·undo가 null이다
 * @param {object} board GET /api/board 답
 * @param {{ k: string, op: string, col?: string, v?: string }} ask POST /api/arrange 몸
 * @returns {{ board: object, toast: string | null, undo: object | null }}
 */
export function planOf(board, ask) {
  const same = { board, toast: null, undo: null }
  if (!ask || typeof ask.k !== 'string') return same
  const list = listRows(board).get(ask.k)
  if (!list) return same
  const k = ask.k
  const name = typeof list.name === 'string' ? list.name : ''
  const stamp = typeof board.at === 'string' ? board.at.slice(0, 5) : ''
  const arrange = arrangeOf(board)
  const index = arrange.rows.findIndex((row) => row.k === k)
  const row = index >= 0 ? arrange.rows[index] : null
  const col = COL.get(ask.col)
  const cell = row && col ? (row.cells?.[col.key] ?? null) : null
  const made = (next, toast, undo) => ({ board: next, toast, undo })

  switch (ask.op) {
    case 'step': {
      if (!cell || !STEPS.includes(cell.st) || cell.st === 'done') return same
      const st = cell.st === 'todo' && col.three ? 'ready' : 'done'
      return made(
        withCell(board, index, col.key, { ...cell, st, at: stamp, ord: st === 'done' ? null : cell.ord }),
        `${name} · ${col.name} ${st === 'ready' ? '준비완료로' : '완료로'} 바꿨어요`,
        { k, op: 'set', col: col.key, v: cell.st },
      )
    }
    case 'set': {
      if (!cell || !STEPS.includes(ask.v) || !STEPS.includes(cell.st) || cell.st === ask.v || (ask.v === 'ready' && !col.three)) return same
      const back = STEPS.indexOf(ask.v) < STEPS.indexOf(cell.st)
      const label = { todo: '준비로', ready: '준비완료로', done: '완료로' }[ask.v]
      return made(
        withCell(board, index, col.key, { ...cell, st: ask.v, at: ask.v === 'todo' ? cell.at : stamp, ord: ask.v === 'done' ? null : cell.ord }),
        `${name} · ${col.name} ${label} ${back ? '되돌렸어요' : '바꿨어요'}`,
        { k, op: 'set', col: col.key, v: cell.st },
      )
    }
    case 'add': {
      if (!row || !col || cell) return same
      if (col.three ? !fits(picksOf(board), col.key, ask.v, ask.t) : !CHOICES[col.key].includes(ask.v) || isText(ask.t)) return same
      const added = {
        st: 'todo',
        det: col.three || col.key === 'xray' ? '' : ask.v,
        part: col.three ? ask.v : null,
        at: stamp,
        ord: null,
        manual: true,
        tags: col.three ? tagsOf(ask.t) : [],
      }
      return made(withCell(board, index, col.key, added), `${name} · ${col.name} 직접 넣었어요`, { k, op: 'remove', col: col.key })
    }
    case 'remove': {
      if (!cell) return same
      return made(withCell(board, index, col.key, null), `${name} · ${col.name} 칸에서 뺐어요`, null)
    }
    case 'part': {
      const picks = picksOf(board)
      if (!cell || !col.three || !fits(picks, col.key, ask.v, ask.t)) return same
      const before = cell.part
      const beforeT = (Array.isArray(cell.tags) ? cell.tags : []).join(JOIN)
      const back = fits(picks, col.key, before, beforeT) && (before !== ask.v || beforeT !== (ask.t ?? ''))
      return made(
        withCell(board, index, col.key, { ...cell, part: ask.v, tags: tagsOf(ask.t) }),
        `${name} · ${col.name} 부위: ${pickText(col.key, ask.v.split(JOIN), tagsOf(ask.t))}`,
        back ? { k, op: 'part', col: col.key, v: before, ...(beforeT !== '' ? { t: beforeT } : {}) } : null,
      )
    }
    case 'away': {
      if (!row || (ask.v !== 'on' && ask.v !== 'off')) return same
      const on = ask.v === 'on'
      return made(
        withRow(board, index, { ...row, away: on ? stamp : null }),
        on ? `${name} · 자리비움 ${stamp}` : `${name} · 자리비움 풀었어요`,
        { k, op: 'away', v: on ? 'off' : 'on' },
      )
    }
    case 'ptf': {
      if (!row || !['up', 'down', 'off'].includes(ask.v)) return same
      const before = row.ptf?.st === 'up' || row.ptf?.st === 'down' ? row.ptf.st : 'off'
      const toast = { up: '· PT 먼저 올라갔어요', down: '· PT 끝나고 내려왔어요', off: '· PT 먼저 표시를 지웠어요' }[ask.v]
      return made(withRow(board, index, { ...row, ptf: ask.v === 'off' ? null : { st: ask.v, at: stamp } }), `${name} ${toast}`, { k, op: 'ptf', v: before })
    }
    case 'end': {
      if (ask.v === 'on' && row) {
        const next = {
          rows: arrange.rows.filter((item) => item.k !== k),
          ended: [{ k, endedAt: stamp, paid: false }, ...arrange.ended.filter((item) => item.k !== k)],
        }
        return made({ ...board, arrange: next }, `${name} 님을 표에서 뺐어요`, { k, op: 'end', v: 'off' })
      }
      if (ask.v === 'off' && arrange.ended.some((item) => item.k === k)) {
        const next = { rows: arrange.rows, ended: arrange.ended.filter((item) => item.k !== k) }
        return made({ ...board, arrange: next }, `${name} 님을 표에 다시 넣었어요`, { k, op: 'end', v: 'on' })
      }
      return same
    }
    default:
      return same
  }
}

// ---- 뼈대 -----------------------------------------------------------------------------------------------

/** 어레인지 뼈대. 이미 그린 것이 있으면 그것을 쓰고, 없으면 host를 비우고 새로 만든다 */
function partsOf(host) {
  let page = host.children.length === 1 ? host.firstElementChild : null
  if (!page || !page.classList.contains('page') || !page.classList.contains('arrange')) {
    clear(host)
    page = el('div', { class: 'page arrange' }, [
      el('header', { class: 'top' }),
      el('div', { class: 'sub-line' }, [
        el('span', { class: 'asof' }),
        el(
          'span',
          { class: 'legend' },
          LEGEND.map(([cls, text]) => el('span', { class: `lg ${cls}` }, text)),
        ),
      ]),
      el('p', { class: 'howto' }, [HOWTO[0], el('br'), HOWTO[1]]),
      el('div', { class: 'wrap' }, el('table', { class: 'arr' }, [headOf(), el('tbody')])),
      el('p', { class: 'empty-note', hidden: true }, EMPTY),
      el('section', { class: 'ended' }),
      el('footer', { class: 'foot' }, FOOT),
    ])
    host.appendChild(page)
  }
  return {
    page,
    top: page.querySelector(':scope > .top'),
    asof: page.querySelector(':scope > .sub-line > .asof'),
    body: page.querySelector(':scope > .wrap > table.arr > tbody'),
    empty: page.querySelector(':scope > p.empty-note'),
    ended: page.querySelector(':scope > section.ended'),
  }
}

/** 표 머리 (시안 차례) */
function headOf() {
  const th = (cls, text, sub) => el('th', { class: cls }, [text, sub ? el('span', { class: 'sm' }, sub) : null])
  return el(
    'thead',
    null,
    el('tr', null, [
      th('c-t', '접수', '누르면 자리비움'),
      th('c-nm', '성함'),
      ...COLS.map((col) => th(`c-${col.key}`, col.head, col.sub)),
      th('c-memo', '비고', '접수 메모 · 지난번 증상'),
      el('th', { class: 'c-end' }),
    ]),
  )
}

// ---- 누르기 ---------------------------------------------------------------------------------------------

/** 누르기 처리: 창 열고 닫기·펼침은 그 자리에서 다시 그린 뒤 알리고, 쓰기는 view.on…만 부른다. picks는 판의 고르기 목록(없으면 null) */
function actionsOf(host, view, redraw, picks) {
  const call = (name, ...args) => {
    if (typeof view[name] === 'function') view[name](...args)
  }
  const open = (sheet) => {
    redraw({ sheet })
    call('onSheet', sheet)
    host.querySelector('.sheet-back > .sheet')?.focus({ preventScroll: true })
  }
  const close = () => {
    redraw({ sheet: null })
    call('onSheet', null)
  }
  return {
    call,
    close,
    cell(k, col, cell) {
      if (!cell && col.three) {
        if (picks) open(pickSheet(k, col.key, 'add'))
      } else if (!cell) open(col.key === 'eswt' ? { k, col: col.key, kind: 'add', hit: null, count: null } : { k, col: col.key, kind: 'add' })
      else if (cell.st === 'done') open({ k, col: col.key, kind: 'done' })
      else call('onCell', k, col.key)
    },
    /** [부위 고르기]·[시술 고르기]: 판에 picks가 없으면 열지 않는다(AC-3505.4) */
    part(k, col) {
      if (picks) open(pickSheet(k, col.key, 'part'))
    },
    /**
     * SONO·C-ARM 넣기 창의 단추(group: proc·drug · side·part·plain·with·chip): 고르거나 담고, 고른 것을 다시 누르면 푼다.
     * 창 값을 onSheet로 넘기고 다시 그린 창에서 누른 단추에 초점을 돌려 둔다(AC-3503.1·3504.2)
     */
    choose(sheet, group, label) {
      const next = sheet.col === 'carm' ? nextCarm(sheet, group, label, picks) : nextSono(sheet, group, label, picks)
      redraw({ sheet: next })
      call('onSheet', next)
      const again = [...host.querySelectorAll(`.sheet-back > .sheet > .opts[data-g="${group}"] > button.opt`)].find((b) => textOnly(b) === label)
      again?.focus({ preventScroll: true })
    },
    /** 넣기 창의 [넣기 · …]: 창을 닫고 빈 칸이면 onAdd, [부위 고르기]·[시술 고르기]면 onPart(v, t) */
    put(sheet, v, t) {
      close()
      call(sheet.kind === 'add' ? 'onAdd' : 'onPart', sheet.k, sheet.col, v, t)
    },
    /** 충격파 창의 타수(hit)·부위 수(count) 단추: 고르거나 고른 것을 다시 누르면 풀고, 창 값을 onSheet로 넘긴다(AC-3402.2) */
    eswt(sheet, group, label) {
      const next = { ...sheet, hit: eswtHit(sheet), count: eswtCount(sheet) }
      next[group] = next[group] === label ? null : label
      redraw({ sheet: next })
      call('onSheet', next)
      // 다시 그린 창에서 누른 단추에 초점을 돌려 둔다(타수 줄이 위, 부위 수 줄이 아래)
      const row = host.querySelectorAll('.sheet-back > .sheet > .opts.four')[group === 'hit' ? 0 : 1]
      const again = [...(row?.querySelectorAll(':scope > button.opt') ?? [])].find((b) => b.textContent === label)
      again?.focus({ preventScroll: true })
    },
    pick(sheet, label) {
      close()
      if (sheet.kind === 'add') call('onAdd', sheet.k, sheet.col, label)
      else if (sheet.kind === 'part') call('onPart', sheet.k, sheet.col, label)
      else if (label === BACK_TODO) call('onSet', sheet.k, sheet.col, 'todo')
      else if (label === BACK_READY) call('onSet', sheet.k, sheet.col, 'ready')
      else if (label === TAKE_OUT) call('onRemove', sheet.k, sheet.col)
    },
    ended(open) {
      redraw({ endedOpen: open })
      call('onEnded', open)
    },
  }
}

// ---- 줄 -------------------------------------------------------------------------------------------------

/** 줄 하나: 접수 · 성함(+ [PT 먼저]) · 칸 일곱 · 비고 · [치료 종료] */
function rowOf(row, list, marks, act) {
  const cls = [row.away ? 'away' : null, marks.flash ? 'flash' : null].filter(Boolean).join(' ')
  return el('tr', { class: cls || null, 'data-k': row.k }, [
    el('td', { class: 'c-t' }, awayOf(row, list, act)),
    el('td', { class: 'c-nm' }, [nameOf(row, list, marks.rxNew, act), ptfOf(row, act)]),
    ...COLS.map((col) => el('td', { class: `c-${col.key}` }, cellOf(row.k, col, row.cells?.[col.key] ?? null, act))),
    el('td', { class: 'c-memo' }, memoOf(row, list)),
    el(
      'td',
      { class: 'c-end' },
      el('button', { type: 'button', class: row.allDone === true ? 'end-btn is-go' : 'end-btn', on: { click: () => act.call('onEnd', row.k) } }, ['치료', el('br'), '종료']),
    ),
  ])
}

/** 접수 칸: 접수 시각, 자리비움이면 "자리비움" + 그 시각. 누르면 자리비움 표시·해제 */
function awayOf(row, list, act) {
  const time = typeof list.time === 'string' ? (TIME.exec(list.time)?.[0] ?? list.time) : ''
  return el('button', { type: 'button', class: 't-btn', on: { click: () => act.call('onAway', row.k, row.away ? 'off' : 'on') } }, [
    el('span', { class: 't-time' }, time),
    waitedSpan(list),
    row.away ? el('span', { class: 'away-tag' }, ['자리비움', el('br'), row.away]) : null,
  ])
}

/** 성함 칸의 기록부 여는 단추: 차트번호·상태 이름표(·처방 나옴) / 이름·"나이 · 성별"·신환 표시·› */
function nameOf(row, list, rxNew, act) {
  const info = typeof list.info === 'string' ? list.info.split(INFO_JOINER) : []
  const age = info.map((part) => AGE.exec(part)?.[1]).find(isText)
  const sex = info.find((part) => SEXES.has(part))
  const meta = [age, sex].filter(isText).join(INFO_JOINER)
  return el('button', { type: 'button', class: 'nm-btn', on: { click: () => act.call('onChart', row.k) } }, [
    el('span', { class: 'l1' }, [
      isText(list.chart) ? el('span', { class: 'chart' }, list.chart) : null,
      el('span', { class: ['status', STATUS_CLASS[list.lane]].filter(Boolean).join(' ') }, list.laneLabel),
      rxNew ? el('span', { class: 'rx-new' }, RX_NEW) : null,
    ]),
    el('span', { class: 'l2' }, [
      el('span', { class: 'arr-name' }, typeof list.name === 'string' ? list.name : ''),
      meta !== '' ? el('span', { class: 'meta' }, meta) : null,
      info.at(-1) === NEW_KIND ? el('span', { class: 'new-badge' }, NEW_KIND) : null,
      el('span', { class: 'open', 'aria-hidden': 'true' }, '›'),
    ]),
  ])
}

/** [PT 먼저] 단추: 없음 "PT 먼저" → up "↑ PT 올라감 HH:MM" → down "↓ 내려옴 HH:MM" → 없음 (AC-3308.13) */
function ptfOf(row, act) {
  const st = row.ptf?.st === 'up' || row.ptf?.st === 'down' ? row.ptf.st : 'none'
  const text = st === 'up' ? `↑ PT 올라감 ${row.ptf.at}` : st === 'down' ? `↓ 내려옴 ${row.ptf.at}` : 'PT 먼저'
  const next = st === 'none' ? 'up' : st === 'up' ? 'down' : 'off'
  return el('button', { type: 'button', class: `ptf-btn ${st}`, on: { click: () => act.call('onPtf', row.k, next) } }, text)
}

/**
 * 치료 칸 하나 (AC-3308.4): 빈 칸 "+", 준비 "준비" + 글, 준비완료 "준비완료 HH:MM" + 부위, 완료 "✓ HH:MM" + 작은 글.
 * SONO·C-ARM은 부위(없으면 [부위 고르기])와 순서 "N번", 처방 칸에 직접 넣은 칸은 점선 "직접"
 */
function cellOf(k, col, cell, act) {
  const press = () => act.cell(k, col, cell)
  const attrs = {
    role: 'button',
    tabindex: '0',
    on: {
      click: press,
      keydown: (event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        press()
      },
    },
  }
  if (!cell) return el('div', { ...attrs, class: 'cell empty', 'aria-label': `${col.name} 넣기` }, el('span', { class: 'plus' }, '+'))
  const st = STEPS.includes(cell.st) ? cell.st : 'todo'
  const manual = col.rx && cell.manual === true
  const ord = Number.isSafeInteger(cell.ord) && cell.ord > 0 ? cell.ord : null
  return el('div', { ...attrs, class: `cell ${st}${manual ? ' manual' : ''}` }, [
    ord ? el('span', { class: 'ord' }, `${ord}번`) : null,
    manual ? el('span', { class: 'mn' }, '직접') : null,
    el('span', { class: 'st' }, st === 'todo' ? '준비' : withTime(st === 'ready' ? '준비완료' : '✓', cell.at)),
    col.key === 'eswt' ? eswtText(cell, st === 'done') : st === 'done' ? doneText(col, cell) : detOf(k, col, cell, act),
  ])
}

/** 충격파 칸 글 "{타수} N부위"를 타수와 나머지로 나눈다(타수가 없으면 hit null) */
const ESWT_SPLIT = /^(\S+타) (.+)$/

/** 충격파 칸의 글: 타수가 있으면 타수(위)·부위 수(아래), 없으면 칸 글 하나. 완료 칸의 부위 수는 작은 글(AC-3402.3) */
function eswtText(cell, done) {
  if (!isText(cell.det)) return null
  const split = ESWT_SPLIT.exec(cell.det)
  const rest = el('span', { class: done ? 'det sm' : 'det' }, split ? split[2] : cell.det)
  return split ? [el('span', { class: 'hit' }, split[1]), rest] : rest
}

/** 단계 글 뒤에 시각(모르면 단계 글만) */
function withTime(label, at) {
  return typeof at === 'string' && at !== '' ? `${label} ${at}` : label
}

/** 완료 칸의 작은 글: 부위(SONO·C-ARM은 줄마다 하나 + 이름표) 또는 칸 글 */
function doneText(col, cell) {
  const lines = col.three && isText(cell.part) ? cell.part.split(JOIN) : [isText(cell.part) ? cell.part : cell.det]
  return [...lines.filter(isText).map((line) => el('span', { class: 'det sm' }, line)), col.three ? tagsEl(cell) : null]
}

/**
 * 준비·준비완료 칸의 글: SONO·C-ARM은 부위·시술 줄마다 하나(없으면 [부위 고르기]·[시술 고르기])와 이름표
 * (SONO 같이 하는 것·C-ARM 약재, AC-3503.4·3504.4), 다른 칸은 칸 글
 */
function detOf(k, col, cell, act) {
  if (!col.three) return isText(cell.det) ? el('span', { class: 'det' }, cell.det) : null
  if (isText(cell.part)) return [...cell.part.split(JOIN).filter(isText).map((line) => el('span', { class: 'det' }, line)), tagsEl(cell)]
  return [partButton(k, col, act), tagsEl(cell)]
}

/** 칸의 이름표 줄: tags 글마다 둥근 이름표. 없으면 그리지 않는다 */
function tagsEl(cell) {
  const tags = Array.isArray(cell.tags) ? cell.tags.filter(isText) : []
  return tags.length > 0 ? el('span', { class: 'tags' }, tags.map((tag) => el('span', { class: 'drug' }, tag))) : null
}

/** 부위·시술이 없는 SONO·C-ARM 칸의 [부위 고르기]·[시술 고르기]: 칸 누름 없이 넣기 창을 연다 */
function partButton(k, col, act) {
  return el(
    'button',
    {
      type: 'button',
      class: 'part-btn',
      on: {
        click: (event) => {
          event.stopPropagation()
          act.part(k, col)
        },
        keydown: (event) => event.stopPropagation(),
      },
    },
    col.pick,
  )
}

/** 비고 칸: 메모 상자(있을 때) + "지난번 …"(줄은 " / "로 이음, 없으면 첫 방문 글) */
function memoOf(row, list) {
  return [
    isText(list.memo) ? el('div', { class: 'arr-memo' }, list.memo) : null,
    isText(row.last) ? el('div', { class: 'lastsym' }, [el('span', { class: 'lastsym-label' }, LAST_LABEL), oneLine(row.last)]) : el('div', { class: 'lastsym' }, NO_LAST),
  ]
}

/** 여러 줄 글을 한 줄로: 빈 줄은 빼고 " / "로 잇는다(시안 oneLine) */
function oneLine(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' / ')
}

// ---- 오늘 치료 종료 ----------------------------------------------------------------------------------------

/** 끝난 줄의 시각 글: 수납완료로 저절로 빠진 줄은 "HH:MM 수납"·"수납완료", [치료 종료]로 뺀 줄은 "HH:MM 종료"(AC-3308.15) */
function endedText(item) {
  if (item.paid === true) return typeof item.endedAt === 'string' ? `${item.endedAt} 수납` : '수납완료'
  return `${item.endedAt} 종료`
}

/** [오늘 치료 종료 N명 ▾|▴] + (펼치면) 끝난 줄: 종료·수납 시각·이름·차트번호·[다시 넣기] 또는 "아직 없어요" */
function endedOf(ended, lists, open, act) {
  const items = ended.filter((item) => lists.has(item.k))
  return [
    el(
      'button',
      { type: 'button', class: 'ended-h', 'aria-expanded': open ? 'true' : 'false', on: { click: () => act.ended(!open) } },
      `오늘 치료 종료 ${items.length}명 ${open ? '▴' : '▾'}`,
    ),
    open && items.length > 0
      ? el(
          'ul',
          { class: 'ended-list' },
          items.map((item) => {
            const list = lists.get(item.k)
            return el('li', null, [
              el('span', { class: 'e-t' }, endedText(item)),
              el('span', { class: 'e-n' }, typeof list.name === 'string' ? list.name : ''),
              el('span', { class: 'e-c' }, typeof list.chart === 'string' ? list.chart : ''),
              el('button', { type: 'button', class: 'restore', on: { click: () => act.call('onRestore', item.k) } }, '다시 넣기'),
            ])
          }),
        )
      : null,
    open && items.length === 0 ? el('p', { class: 'empty-note' }, ENDED_EMPTY) : null,
  ]
}

// ---- 고르기 창 · 되돌리기 띠 -----------------------------------------------------------------------------------

/**
 * 열린 고르기 창. 그 줄이 판에 없거나 칸이 창 종류에 맞지 않으면(다른 기기가 바꿈) 그리지 않는다(AC-3308.11).
 * SONO·C-ARM 넣기 창은 판 picks가 없으면 그리지 않는다(AC-3505.4)
 */
function sheetOf(sheet, rows, lists, act, picks) {
  if (!sheet || typeof sheet !== 'object') return null
  const row = rows.find((item) => item.k === sheet.k)
  const col = COL.get(sheet.col)
  if (!row || !col) return null
  const cell = row.cells?.[col.key] ?? null
  const name = lists.get(row.k)?.name ?? ''
  let title
  let sub
  let options
  if (sheet.kind === 'add' && !cell && col.key === 'eswt') return eswtSheetOf(sheet, col, name, act)
  if (col.three && ((sheet.kind === 'add' && !cell) || (sheet.kind === 'part' && cell))) {
    if (!picks) return null
    return col.key === 'carm' ? carmSheetOf(sheet, col, name, picks, act) : sonoSheetOf(sheet, col, name, picks, act)
  }
  if (sheet.kind === 'add' && !cell) {
    title = `${col.name} 직접 넣기`
    sub = `${name} · 처방에 없어도 넣을 수 있어요`
    options = CHOICES[col.key]
  } else if (sheet.kind === 'done' && cell?.st === 'done') {
    title = `${col.name} · 완료`
    sub = typeof cell.at === 'string' && cell.at !== '' ? `${name} · ${cell.at}에 완료로 바꿨어요` : `${name} · 완료로 바꿨어요`
    options = [BACK_TODO, col.three ? BACK_READY : null, cell.manual === true ? TAKE_OUT : null].filter(Boolean)
  } else return null
  return sheetBack(title, act, [
    el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, sub)]),
    el(
      'div',
      { class: options.length > MANY ? 'opts many' : 'opts' },
      options.map((label) => el('button', { type: 'button', class: 'opt', on: { click: () => act.pick(sheet, label) } }, label)),
    ),
    el('button', { type: 'button', class: 'sheet-x', on: { click: () => act.close() } }, '닫기'),
  ])
}

/**
 * 충격파 넣기 창 (AC-3402.2, 시안 eswtSheet): [타수] 넷 · [부위 수] 넷 두 줄과 [닫기]·[넣기 · …].
 * 부위 수를 고르기 전에는 [넣기]가 꺼져 있고 타수는 안 골라도 된다. 고른 값은 sheet.hit·sheet.count(목록 밖 값은 안 고른 것)
 */
function eswtSheetOf(sheet, col, name, act) {
  const title = `${col.name} 직접 넣기`
  const hit = eswtHit(sheet)
  const count = eswtCount(sheet)
  const value = count === null ? null : hit === null ? count : `${hit} ${count}`
  const row = (label, group, options, chosen) => [
    el('div', { class: 'opt-label' }, label),
    el(
      'div',
      { class: 'opts four', role: 'group', 'aria-label': label },
      options.map((option) =>
        el(
          'button',
          { type: 'button', class: option === chosen ? 'opt on' : 'opt', 'aria-pressed': option === chosen ? 'true' : 'false', on: { click: () => act.eswt(sheet, group, option) } },
          option,
        ),
      ),
    ),
  ]
  return sheetBack(title, act, [
    el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, `${name} · 타수와 부위 수를 골라요`)]),
    row('타수', 'hit', ESWT_HITS, hit),
    row('부위 수', 'count', ESWT_COUNTS, count),
    el('div', { class: 'sheet-go' }, [
      el('button', { type: 'button', class: 'sheet-close', on: { click: () => act.close() } }, '닫기'),
      el(
        'button',
        { type: 'button', class: 'go', disabled: value === null, on: { click: () => value !== null && act.pick(sheet, value) } },
        value === null ? '넣기' : `넣기 · ${value}`,
      ),
    ]),
  ])
}

/**
 * C-ARM 넣기 창 (AC-3503.1·3503.2, 시안 carmSheet): 시술 줄 · 약재 줄(약재가 없으면 줄 없음)과 [닫기]·[넣기 · {시술} {약재}].
 * 시술을 고르기 전에는 [넣기]가 꺼져 있다. 약재 없음 시술이면 약재 줄이 흐려 눌리지 않고 "{시술}은|는 약재 없이 넣어요"이며 약재를 보내지 않는다
 */
function carmSheetOf(sheet, col, name, picks, act) {
  const title = `${col.name} 넣기`
  const chosen = carmState(sheet, picks)
  const proc = picks.carm.procs.find((item) => item.n === chosen.proc) ?? null
  const noDrug = proc?.noDrug === true
  const drug = noDrug ? null : chosen.drug
  const tags = drug === null ? [] : [drug]
  return sheetBack(title, act, [
    el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, `${name} · ${CARM_SUB}`)]),
    el('div', { class: 'opt-label' }, '시술'),
    optsOf('opts four', 'proc', '시술', picks.carm.procs.map((item) => item.n), (label) => label === chosen.proc, sheet, act),
    picks.carm.drugs.length > 0
      ? [
          el('div', { class: 'opt-label' }, '약재'),
          optsOf(noDrug ? 'opts trio no-drug' : 'opts trio', 'drug', '약재', picks.carm.drugs, (label) => label === drug, sheet, act, noDrug),
        ]
      : null,
    noDrug ? el('p', { class: 'opt-note' }, `${proc.n}${topicOf(proc.n)} 약재 없이 넣어요`) : null,
    goOf(proc === null ? null : pickText('carm', [proc.n], tags), () => act.put(sheet, proc.n, tags.join(JOIN)), act),
  ])
}

/**
 * SONO 넣기 창 (AC-3504.1~3504.3, 시안 sonoSheet): 고른 것(이름표, 누르면 뺌) · 쪽 · 부위 · 부위 없이 · 같이 하는 것(체크)과
 * [닫기]·[넣기 · {줄} · {줄} + {같이}]. 무리가 비면 그 줄은 없다(부위가 없으면 쪽도). 고른 것이 없으면 [넣기]가 꺼져 있다
 */
function sonoSheetOf(sheet, col, name, picks, act) {
  const title = `${col.name} 넣기`
  const chosen = sonoState(sheet, picks)
  const count = chosen.picked.length
  const label = (text, hint) => el('div', { class: 'opt-label' }, [text, hint ? el('span', { class: 'opt-hint' }, hint) : null])
  const chips =
    count > 0
      ? chosen.picked.map((line) =>
          el('button', { type: 'button', class: 'picked-chip', on: { click: () => act.choose(sheet, 'chip', line) } }, [line, el('span', { 'aria-hidden': 'true' }, '✕')]),
        )
      : el('span', { class: 'picked-empty' }, PICKED_EMPTY)
  const withs = picks.sono.withs.map((item) => {
    const on = chosen.withs.includes(item)
    return el(
      'button',
      { type: 'button', class: on ? 'opt check on' : 'opt check', 'aria-pressed': on ? 'true' : 'false', on: { click: () => act.choose(sheet, 'with', item) } },
      [el('span', { class: 'box', 'aria-hidden': 'true' }, on ? '✓' : ''), item],
    )
  })
  return sheetBack(
    title,
    act,
    [
      el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, `${name} · ${SONO_SUB}`)]),
      label(count > 0 ? `고른 것 · ${count}개` : '고른 것'),
      el('div', { class: 'picked' }, chips),
      picks.sono.parts.length > 0
        ? [
            label('쪽', SIDE_HINT),
            optsOf('opts trio', 'side', '쪽', SIDES.map(([side]) => side), (item) => item === chosen.side, sheet, act),
            label('부위'),
            optsOf('opts four parts', 'part', '부위', picks.sono.parts, null, sheet, act),
          ]
        : null,
      picks.sono.plains.length > 0
        ? [label('부위 없이', PLAIN_HINT), optsOf('opts trio', 'plain', '부위 없이', picks.sono.plains, (item) => chosen.picked.includes(item), sheet, act)]
        : null,
      picks.sono.withs.length > 0 ? [label('같이 하는 것'), el('div', { class: 'opts duo', role: 'group', 'aria-label': '같이 하는 것', 'data-g': 'with' }, withs)] : null,
      goOf(count === 0 ? null : pickText('sono', chosen.picked, chosen.withs), () => act.put(sheet, chosen.picked.join(JOIN), chosen.withs.join(JOIN)), act),
    ],
    'sheet sono-sheet',
  )
}

/**
 * 넣기 창의 고르기 줄 하나(data-g = group). isOn이 있으면 고른 단추는 on·aria-pressed다(없으면 담는 단추라 고른 표시가 없다).
 * off면 줄 단추를 모두 끈다(약재 없음)
 */
function optsOf(cls, group, label, items, isOn, sheet, act, off = false) {
  return el(
    'div',
    { class: cls, role: 'group', 'aria-label': label, 'data-g': group },
    items.map((item) => {
      const on = isOn !== null && isOn(item)
      return el(
        'button',
        {
          type: 'button',
          class: on ? 'opt on' : 'opt',
          'aria-pressed': isOn === null ? null : on ? 'true' : 'false',
          disabled: off,
          on: { click: () => act.choose(sheet, group, item) },
        },
        item,
      )
    }),
  )
}

/** 넣기 창 아래 [닫기]·[넣기]: 넣을 글(value)이 없으면 [넣기]는 꺼져 있고, 있으면 [넣기 · {value}]이고 누르면 put() */
function goOf(value, put, act) {
  return el('div', { class: 'sheet-go' }, [
    el('button', { type: 'button', class: 'sheet-close', on: { click: () => act.close() } }, '닫기'),
    el('button', { type: 'button', class: 'go', disabled: value === null, on: { click: () => value !== null && put() } }, value === null ? '넣기' : `넣기 · ${value}`),
  ])
}

/** 넣기 창 값의 글(넣기 단추·부위 띠): C-ARM "{시술} {약재}", SONO "{줄} · {줄}" + " + {같이} · {같이}" */
function pickText(colKey, lines, tags) {
  if (colKey === 'carm') return [...lines, ...tags].join(' ')
  return tags.length > 0 ? `${lines.join(' · ')} + ${tags.join(' · ')}` : lines.join(' · ')
}

/** 이름 끝 글자에 받침이 있으면 "은", 없으면(한글이 아닌 글자 포함) "는" (AC-3503.2, Claude 결정) */
function topicOf(word) {
  const code = word.charCodeAt(word.length - 1)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0 ? '은' : '는'
}

/** 새로 여는 SONO·C-ARM 넣기 창 값 */
function pickSheet(k, col, kind) {
  return col === 'carm' ? { k, col, kind, proc: null, drug: null } : { k, col, kind, side: null, picked: [], withs: [] }
}

/** C-ARM 창 값 { proc, drug }: 목록 밖 값은 안 고른 것(null) */
function carmState(sheet, picks) {
  return {
    proc: picks.carm.procs.some((item) => item.n === sheet?.proc) ? sheet.proc : null,
    drug: picks.carm.drugs.includes(sheet?.drug) ? sheet.drug : null,
  }
}

/** SONO 창 값 { side, picked, withs }: 목록 밖·겹친 값은 뺀다. 담은 것은 6줄까지 */
function sonoState(sheet, picks) {
  const picked = []
  for (const line of Array.isArray(sheet?.picked) ? sheet.picked : []) if (isSonoLine(line, picks) && !picked.includes(line) && picked.length < SONO_LINES) picked.push(line)
  const withs = []
  for (const item of Array.isArray(sheet?.withs) ? sheet.withs : []) if (picks.sono.withs.includes(item) && !withs.includes(item)) withs.push(item)
  return { side: SIDES.some(([side]) => side === sheet?.side) ? sheet.side : null, picked, withs }
}

/** C-ARM 창 단추 하나를 누른 다음 창 값: 고른 것을 다시 누르면 푼다 */
function nextCarm(sheet, group, label, picks) {
  const chosen = carmState(sheet, picks)
  if (group === 'proc') chosen.proc = chosen.proc === label ? null : label
  if (group === 'drug') chosen.drug = chosen.drug === label ? null : label
  return { k: sheet.k, col: sheet.col, kind: sheet.kind, proc: chosen.proc, drug: chosen.drug }
}

/** SONO 창 단추 하나를 누른 다음 창 값: 쪽은 고르고 풀고, 부위("{쪽} {부위}")·부위 없이는 담고 빼고, 이름표는 빼고, 같이 하는 것은 체크 */
function nextSono(sheet, group, label, picks) {
  const chosen = sonoState(sheet, picks)
  const flip = (list, item, max) => (list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list)
  let { side, picked, withs } = chosen
  if (group === 'side') side = side === label ? null : label
  if (group === 'part') picked = flip(picked, side === null ? label : `${SIDES.find(([item]) => item === side)[1]} ${label}`, SONO_LINES)
  if (group === 'plain') picked = flip(picked, label, SONO_LINES)
  if (group === 'chip') picked = picked.filter((line) => line !== label)
  if (group === 'with') withs = flip(withs, label, Infinity)
  return { k: sheet.k, col: sheet.col, kind: sheet.kind, side, picked, withs }
}

/** SONO 한 줄: 부위 없이 글, 부위, "{오른|왼|양} {부위}" (AC-3502.3) */
function isSonoLine(line, picks) {
  if (typeof line !== 'string' || line === '') return false
  if (picks.sono.plains.includes(line) || picks.sono.parts.includes(line)) return true
  const space = line.indexOf(' ')
  return space > 0 && SIDE_WORDS.includes(line.slice(0, space)) && picks.sono.parts.includes(line.slice(space + 1))
}

/**
 * SONO·C-ARM 쓰기 글이 지금 목록에 맞는가 (AC-3502.3, 도우미 PickLists.IsCarm·IsSono와 같다): C-ARM은 v = 시술 하나 · t = 약재 0~1개
 * (약재 없음 시술이면 t 없음), SONO는 v = 겹침 없는 1~6줄 · t = 같이 하는 것의 겹침 없는 일부. 목록(picks)이 없으면 맞지 않는다
 */
function fits(picks, colKey, v, t) {
  if (!picks || !isText(v) || (t !== undefined && typeof t !== 'string')) return false
  const tags = tagsOf(t)
  if (colKey === 'carm') {
    const proc = picks.carm.procs.find((item) => item.n === v)
    if (!proc) return false
    return proc.noDrug ? tags.length === 0 : tags.length <= 1 && tags.every((tag) => picks.carm.drugs.includes(tag))
  }
  const lines = v.split(JOIN)
  return (
    lines.length <= SONO_LINES &&
    new Set(lines).size === lines.length &&
    lines.every((line) => isSonoLine(line, picks)) &&
    new Set(tags).size === tags.length &&
    tags.every((tag) => picks.sono.withs.includes(tag))
  )
}

/** "|"로 이은 이름표 글 → 글 목록(없거나 빈 글이면 빈 목록) */
function tagsOf(t) {
  return typeof t === 'string' && t !== '' ? t.split(JOIN) : []
}

/** 창이 같은 창인가를 보는 열쇠(줄·칸·종류) */
function sheetKey(sheet) {
  return sheet && typeof sheet === 'object' ? `${sheet.k}:${sheet.col}:${sheet.kind}` : null
}

/** 화면마다 마지막에 그린 창의 열쇠 (창 세로 위치를 지킬지 본다) */
const drawnSheet = new WeakMap()

/** 단추 안의 글 마디만(체크 칸 ✓ 빼고) */
function textOnly(node) {
  return [...node.childNodes]
    .filter((child) => child.nodeType === 3)
    .map((child) => child.textContent)
    .join('')
}

/** 창 값의 타수·부위 수: 목록 글이 아니면 null */
function eswtHit(sheet) {
  return ESWT_HITS.includes(sheet?.hit) ? sheet.hit : null
}

function eswtCount(sheet) {
  return ESWT_COUNTS.includes(sheet?.count) ? sheet.count : null
}

/** 고르기 창의 어두운 바탕 + 창(class는 cls). 바깥 누름·Esc는 닫기 */
function sheetBack(title, act, children, cls = 'sheet') {
  const close = (event) => {
    if (event.target === event.currentTarget) act.close()
  }
  return el(
    'div',
    {
      class: 'sheet-back',
      on: {
        click: close,
        keydown: (event) => {
          if (event.key === 'Escape') act.close()
        },
      },
    },
    el('div', { class: cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, children),
  )
}

/** 되돌리기 띠: 글 + [되돌리기](undo일 때) */
function toastOf(toast, act) {
  if (!toast || !isText(toast.text)) return null
  return el('div', { class: 'toast', role: 'status' }, [
    el('span', { class: 'toast-text' }, toast.text),
    toast.undo === true ? el('button', { type: 'button', class: 'toast-undo', on: { click: () => act.call('onUndo') } }, '되돌리기') : null,
  ])
}

// ---- 판 자료 --------------------------------------------------------------------------------------------

/** 판의 어레인지 표. 없거나 모양이 틀리면 빈 표 */
function arrangeOf(board) {
  const arrange = board?.arrange
  return {
    rows: Array.isArray(arrange?.rows) ? arrange.rows.filter((row) => row && typeof row.k === 'string') : [],
    ended: Array.isArray(arrange?.ended) ? arrange.ended.filter((item) => item && typeof item.k === 'string') : [],
  }
}

/**
 * 판의 SONO·C-ARM 고르기 목록 picks (reception-pick-lists AC-3501.4). 없거나 모양이 틀리면 null(두 넣기 창이 열리지 않는다).
 * 글이 아닌 이름은 뺀다
 */
export function picksOf(board) {
  const picks = board?.picks
  if (!picks || typeof picks !== 'object' || !picks.carm || typeof picks.carm !== 'object' || !picks.sono || typeof picks.sono !== 'object') return null
  const texts = (list) => (Array.isArray(list) ? list.filter(isText) : [])
  const procs = Array.isArray(picks.carm.procs) ? picks.carm.procs.filter((item) => item && isText(item.n)) : []
  return {
    carm: { procs: procs.map((item) => ({ n: item.n, noDrug: item.noDrug === true })), drugs: texts(picks.carm.drugs) },
    sono: { parts: texts(picks.sono.parts), plains: texts(picks.sono.plains), withs: texts(picks.sono.withs) },
  }
}

/** 칸 넷의 목록 줄: 열쇠 → 줄 */
function listRows(board) {
  const out = new Map()
  for (const lane of LANES) {
    const rows = board?.lists?.[lane]
    if (Array.isArray(rows)) for (const row of rows) if (row && typeof row.k === 'string' && !out.has(row.k)) out.set(row.k, row)
  }
  return out
}

/** index번째 어레인지 줄을 바꾼 판 사본 */
function withRow(board, index, row) {
  const arrange = arrangeOf(board)
  const rows = arrange.rows.map((item, i) => (i === index ? row : item))
  return { ...board, arrange: { rows, ended: arrange.ended } }
}

/** index번째 줄의 칸 하나를 바꾼 판 사본. allDone은 칸이 하나 이상이고 모두 완료일 때 true (AC-3305.8) */
function withCell(board, index, key, cell) {
  const row = arrangeOf(board).rows[index]
  const cells = { ...row.cells, [key]: cell }
  const present = Object.values(cells).filter(Boolean)
  return withRow(board, index, { ...row, cells, allDone: present.length > 0 && present.every((item) => item.st === 'done') })
}

/** 그린 머리의 [새로 고침]이 읽는 중인가 */
function readingNow(host) {
  return host.querySelector('.page header.top button.refresh')?.disabled === true
}

/** 안을 비우고 children(요소·글)을 넣는다. 글은 글 마디로만 들어간다 */
function replace(node, children) {
  clear(node)
  for (const child of [children].flat()) if (child !== null && child !== undefined && child !== false) node.append(child)
}

function isText(value) {
  return typeof value === 'string' && value !== ''
}
