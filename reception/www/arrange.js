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
//     view.sheet         열린 고르기 창 { k, col, kind: 'add'|'done'|'part' } | null. 그 줄·칸이 판에 맞지 않으면 그리지 않는다
//     view.endedOpen     [오늘 치료 종료 N명] 펼침
//     view.toast         되돌리기 띠 { text, undo } | null. undo면 [되돌리기](view.onUndo())
//     view.rxNew         '처방 나옴' 이름표를 붙일 열쇠들 (AC-3310.2)
//     view.flash         이번 그리기에 반짝일 줄의 열쇠들 (AC-3310.2)
//     view.onCell(k, col)          준비·준비완료 칸 누름(step)
//     view.onAdd(k, col, v)        빈 칸 넣기 창에서 고름(add)
//     view.onPart(k, col, v)       부위 창에서 고름(part)
//     view.onSet(k, col, v)        완료 창의 [준비로·준비완료로 되돌리기](set todo|ready)
//     view.onRemove(k, col)        완료 창의 [칸에서 빼기](remove)
//     view.onAway(k, on|off)       접수 칸 누름(away)
//     view.onPtf(k, up|down|off)   [PT 먼저] 누름(ptf): 없음 → up → down → 없음
//     view.onEnd(k) · view.onRestore(k)   [치료 종료](end on) · [다시 넣기](end off)
//     view.onChart(k)              성함 누름(기록부 열기)
//     view.onUndo()                띠의 [되돌리기]
//     view.onSheet(sheet|null) · view.onEnded(open)   창 열고 닫음 · 펼침 바뀜
//   planOf(board, { k, op, col?, v? }) → { board, toast, undo }   맞지 않는 쓰기면 받은 판 그대로·toast null·undo null
//   CHOICES · PARTS    고르기 목록(design.md 4절). C# ArrangeChoices(ArrangeMarks.cs)와 같은 글이다(시험이 견준다)

import { clear, el } from './dom.js'
import { refreshText, topOf } from './board.js'

/** SONO·C-ARM 부위 목록 (design.md 4절, 시안 그대로) */
export const PARTS = Object.freeze(['목', '등', '허리', '오른 어깨', '왼 어깨', '양 어깨', '팔꿈치', '손목', '고관절', '오른 무릎', '왼 무릎', '양 무릎', '발목', '발바닥', '기타'])

/** SONO·C-ARM 넣기에서 부위 없이 넣는 글과 X-RAY 넣기 글 (design.md 4절) */
const LATER = '부위는 나중에'
const XRAY_TAKE = 'X-ray 찍기'

/** 칸마다 직접 넣기(add)의 고르기 목록 (design.md 4절) */
export const CHOICES = Object.freeze({
  xray: Object.freeze([XRAY_TAKE]),
  sono: Object.freeze([...PARTS, LATER]),
  carm: Object.freeze([...PARTS, LATER]),
  pt: Object.freeze(['ICE', 'HP']),
  ds: Object.freeze(['30분', '50분']),
  eswt: Object.freeze(['1부위', '2부위', '3부위', '4부위']),
  trac: Object.freeze(['목', '허리']),
})

/**
 * 칸 일곱 (표 차례, 시안 COLS): key JSON 이름, head·sub 표 머리 글, name 띠·창에 쓰는 이름,
 * rx 처방에서 오는 칸(직접 넣으면 점선 "직접"), three 준비 → 준비완료 → 완료 세 단계(부위·순서가 있는 칸)
 */
const COLS = [
  { key: 'xray', head: 'X-RAY', sub: '', name: 'X-RAY', rx: true, three: false },
  { key: 'sono', head: 'SONO', sub: '부위·준비·순서', name: 'SONO', rx: true, three: true },
  { key: 'carm', head: 'C-ARM', sub: '부위·준비·순서', name: 'C-ARM', rx: true, three: true },
  { key: 'pt', head: 'PT', sub: 'ICE·HP', name: 'PT', rx: false, three: false },
  { key: 'ds', head: '도수', sub: '30·50분', name: '도수', rx: false, three: false },
  { key: 'eswt', head: '충격파', sub: '부위 수', name: '충격파', rx: false, three: false },
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
  '치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 SONO·C-ARM만). X-RAY·SONO·C-ARM은 처방이 나오면 저절로 들어오고, PT·도수·충격파·견인은 빈 칸을 눌러 골라 넣어요.',
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
  const rows = arrange.rows.filter((row) => lists.has(row.k))
  const redraw = (next) => renderArrange(host, board, { ...view, reading: readingNow(host), ...next })
  const act = actionsOf(host, view, redraw)

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

  parts.page.querySelector(':scope > .sheet-back')?.remove()
  parts.page.querySelector(':scope > .toast')?.remove()
  const sheet = sheetOf(view.sheet, rows, lists, act)
  if (sheet) parts.page.appendChild(sheet)
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
      if (!row || !col || cell || !CHOICES[col.key].includes(ask.v)) return same
      const added = {
        st: 'todo',
        det: col.three || col.key === 'xray' ? '' : ask.v,
        part: col.three && ask.v !== LATER ? ask.v : null,
        at: stamp,
        ord: null,
        manual: true,
      }
      return made(withCell(board, index, col.key, added), `${name} · ${col.name} 직접 넣었어요`, { k, op: 'remove', col: col.key })
    }
    case 'remove': {
      if (!cell) return same
      return made(withCell(board, index, col.key, null), `${name} · ${col.name} 칸에서 뺐어요`, null)
    }
    case 'part': {
      if (!cell || !col.three || !PARTS.includes(ask.v)) return same
      const before = cell.part
      return made(
        withCell(board, index, col.key, { ...cell, part: ask.v }),
        `${name} · ${col.name} 부위: ${ask.v}`,
        PARTS.includes(before) && before !== ask.v ? { k, op: 'part', col: col.key, v: before } : null,
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
          ended: [{ k, endedAt: stamp }, ...arrange.ended.filter((item) => item.k !== k)],
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

/** 누르기 처리: 창 열고 닫기·펼침은 그 자리에서 다시 그린 뒤 알리고, 쓰기는 view.on…만 부른다 */
function actionsOf(host, view, redraw) {
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
      if (!cell) open({ k, col: col.key, kind: 'add' })
      else if (cell.st === 'done') open({ k, col: col.key, kind: 'done' })
      else call('onCell', k, col.key)
    },
    part: (k, col) => open({ k, col: col.key, kind: 'part' }),
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
    st === 'done' ? doneText(cell) : detOf(k, col, cell, act),
  ])
}

/** 단계 글 뒤에 시각(모르면 단계 글만) */
function withTime(label, at) {
  return typeof at === 'string' && at !== '' ? `${label} ${at}` : label
}

/** 완료 칸의 작은 글: 부위 또는 칸 글 */
function doneText(cell) {
  const text = isText(cell.part) ? cell.part : cell.det
  return isText(text) ? el('span', { class: 'det sm' }, text) : null
}

/** 준비·준비완료 칸의 글: SONO·C-ARM은 부위(없으면 [부위 고르기]), 다른 칸은 칸 글 */
function detOf(k, col, cell, act) {
  if (!col.three) return isText(cell.det) ? el('span', { class: 'det' }, cell.det) : null
  if (isText(cell.part)) return el('span', { class: 'det' }, cell.part)
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
    '부위 고르기',
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

/** [오늘 치료 종료 N명 ▾|▴] + (펼치면) 끝난 줄: 종료 시각·이름·차트번호·[다시 넣기] 또는 "아직 없어요" */
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
              el('span', { class: 'e-t' }, `${item.endedAt} 종료`),
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

/** 열린 고르기 창. 그 줄이 판에 없거나 칸이 창 종류에 맞지 않으면(다른 기기가 바꿈) 그리지 않는다(AC-3308.11) */
function sheetOf(sheet, rows, lists, act) {
  if (!sheet || typeof sheet !== 'object') return null
  const row = rows.find((item) => item.k === sheet.k)
  const col = COL.get(sheet.col)
  if (!row || !col) return null
  const cell = row.cells?.[col.key] ?? null
  const name = lists.get(row.k)?.name ?? ''
  let title
  let sub
  let options
  if (sheet.kind === 'add' && !cell) {
    title = `${col.name} 직접 넣기`
    sub = `${name} · 처방에 없어도 넣을 수 있어요`
    options = CHOICES[col.key]
  } else if (sheet.kind === 'done' && cell?.st === 'done') {
    title = `${col.name} · 완료`
    sub = typeof cell.at === 'string' && cell.at !== '' ? `${name} · ${cell.at}에 완료로 바꿨어요` : `${name} · 완료로 바꿨어요`
    options = [BACK_TODO, col.three ? BACK_READY : null, cell.manual === true ? TAKE_OUT : null].filter(Boolean)
  } else if (sheet.kind === 'part' && cell && col.three) {
    title = `${col.name} 부위 고르기`
    sub = `${name} · 비트에 부위가 없어서 골라요`
    options = PARTS
  } else return null
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
    el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: '-1' }, [
      el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, sub)]),
      el(
        'div',
        { class: options.length > MANY ? 'opts many' : 'opts' },
        options.map((label) => el('button', { type: 'button', class: 'opt', on: { click: () => act.pick(sheet, label) } }, label)),
      ),
      el('button', { type: 'button', class: 'sheet-x', on: { click: () => act.close() } }, '닫기'),
    ]),
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
