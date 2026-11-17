// 어레인지 표 그리기 (reception-arrange design.md 4·7·10절, 승인 시안 docs/mockups/reception-arrange/Arrange.html). class 이름은 style.css
// 머리 글의 화면 틀 그대로다. 도우미 GET /api/board 답의 arrange(design.md 7절)를 그린다.
// - 치료 칸은 판 cfg.cols(보이는 칸만, 설정 차례, reception-other-clinic AC-5703.1·5710.1)로 그린다: 이름·종류(rx 처방 칸·mn 직접 칸)·
//   단계(2 준비 → 완료 · 3 준비 → 준비완료 → 완료)·더한 칸(x1…, 비고 앞)·empty(고른 처방이 없는 처방 칸 → 표 위 안내 줄). 판에 cfg.cols가 없으면
//   우리 의원 처음 값 일곱 칸이다. 부위·시술 칸(SONO·C-ARM 고르기 창·[부위·시술 고르기]·이름표)은 sono·carm 열쇠만이다
// - 줄(arrange.rows)은 열쇠(k)로 같은 판의 목록 줄을 가리킨다: 이름·차트번호·정보·메모·상태·접수 시각은 목록 줄 것이다(AC-3305.3).
//   목록 줄이 없는 열쇠는 그리지 않는다. 칸 단계·시각·순서는 도우미(C# ArrangeBuilder)가 정한 그대로 그리고 화면은 계산하지 않는다
// - 환자 글·칸 이름은 dom.js el()로 글 마디로만 넣는다(AC-3312.1). 이름은 속성(aria-label 등)에도 넣지 않는다
// - 같은 자리에 다시 그리면 뼈대(머리·표·아래 글)는 두고 안만 바꾼다. 표를 옆으로 민 위치(.wrap)가 다시 읽을 때마다 처음으로 가지 않는다(AC-3308.11)
// - 도우미에 묻지 않는다: 누르기는 view.on…으로만 알린다(app.js가 보낸다). 고르기 창·[오늘 치료 종료] 펼침은 그 자리에서 다시 그린 뒤
//   view.onSheet·view.onEnded로 알려 app.js가 다음 그리기에 그대로 넘긴다
// - planOf(판, 쓰기)는 쓰기 하나를 판에 미리 얹은 사본(낙관적 그리기)·되돌리기 띠 글·되돌리기 쓰기(반대 쓰기, design.md 10절)를 준다.
//   미리 얹는 시각은 판의 at(PC 시각)의 시:분이다(휴대폰 시계 없음). 답을 받으면 app.js가 판을 다시 읽어 도우미 값으로 바뀐다
//
// 쓰는 법 (app.js)
//   renderArrange(host, board, view) → .page.arrange    host는 #app. 안에 다른 화면이 있으면 지우고 그린다
//     view.reading · view.onRefresh · view.onTab · view.logoPic   머리(board.js topOf)
//     view.onSettings()  머리 [⚙ 설정]·안내 줄 [설정에서 고르기] (reception-other-clinic AC-5709.2·5710.4). 없으면 두 단추가 꺼져 있다
//     view.sheet         열린 고르기 창 { k, col, kind: 'add'|'done'|'part' } | null. 그 줄·칸이 판에 맞지 않으면 그리지 않는다.
//                        넣기 창 두 모드(AC-5711.2·5711.3): multi(같이 고르기 켜짐)가 참이면 직접 칸은 { …, multi, picked },
//                        충격파는 { …, multi, hits, counts }, C-ARM은 { …, multi, procs, drugs }. 꺼져 있으면 충격파 { …, hit, count },
//                        C-ARM { …, proc, drug }, 직접 칸은 { k, col, kind }. SONO 넣기 창(빈 칸 add · [부위 고르기] part)은 늘 { …, side, picked, withs }
//                        (reception-pick-lists AC-3504.3). 목록은 판 picks뿐이고 목록 밖·겹친 값은 안 고른 것, 고르기가 하나뿐이면 multi는 거짓으로 그린다.
//                        판에 picks가 없으면 X-RAY 말고는 넣기 창이 열리지 않는다(AC-3505.4·AC-3604.4)
//     view.endedOpen     [오늘 치료 종료 N명] 펼침
//     view.toast         되돌리기 띠 { text, undo } | null. undo면 [되돌리기](view.onUndo())
//     view.rxNew         '처방 나옴' 이름표를 붙일 열쇠들 (AC-3310.2)
//     view.flash         이번 그리기에 반짝일 줄의 열쇠들 (AC-3310.2)
//     view.onCell(k, col)          준비·준비완료 칸 누름(step)
//     view.onAdd(k, col, v, t?)    빈 칸 넣기 창에서 고름(add). v·t는 여러 개를 "|"로 이은 글(AC-5703.4). t는 SONO·C-ARM만(없으면 빈 글),
//                                  직접 칸·충격파·X-RAY는 t 없이 부른다. 목록이 빈 더한 칸은 창 없이 v ""로 부른다(AC-5711.1)
//     view.onPart(k, col, v, t)    [부위 고르기]·[시술 고르기] 창에서 고름(part)
//     view.onSet(k, col, v)        완료 창의 [준비로·준비완료로 되돌리기](set todo|ready)
//     view.onRemove(k, col)        완료 창의 [칸에서 빼기](remove)
//     view.onAway(k, on|off)       접수 칸 누름(away): 자리비움 줄은 off(돌아옴), 다른 줄(돌아옴 줄 포함)은 on (reception-arrange-tune AC-3602.3)
//     view.onPtf(k, up|down|off)   [PT 먼저] 누름(ptf): 없음 → up → down → 없음
//     view.onEnd(k) · view.onRestore(k)   [치료 종료](end on) · [다시 넣기](end off)
//     view.onChart(k)              성함·비고 칸 누름(기록부 열기, 비고는 reception-arrange-tune AC-3605.2)
//     view.onUndo()                띠의 [되돌리기]
//     view.onSheet(sheet|null) · view.onEnded(open)   창 열고 닫음·창 값 바뀜 · 펼침 바뀜
//     view.onEditCol(col, 'list', { back: 'sheet' })   넣기 창 맨 아래 [☰ 목록 고치기] (reception-other-clinic AC-5711.4). 넣기 창은 닫지 않고
//                        view.sheet도 그대로다(칸 고치기 창 [저장]·[취소] 뒤 같은 넣기 창으로 돌아오게). 없으면 단추가 꺼져 있다.
//                        다른 창(class sheet-back.list-back)이 이 화면 안에 있으면 다시 그려도 지우지 않고 넣기 창은 그 앞(아래)에 둔다
//   planOf(board, { k, op, col?, v?, t? }) → { board, toast, undo }   맞지 않는 쓰기면 받은 판 그대로·toast null·undo null.
//                      칸은 판 cfg.cols로 본다(숨긴 칸·없는 칸 쓰기는 맞지 않음, 단계 3 칸만 준비완료). add·part 글은 판 picks로 본다
//                      (도우미 AC-5703.4와 같은 규칙: 직접 칸 목록 이름 1~8개 "|", 충격파 타수 0+·부위 수 1+, C-ARM 시술 1+·약재 0+, SONO 지금 규칙).
//                      away는 on(되돌리기 clear)·off(돌아옴, 되돌리기 on)·clear(되돌리기 없음)이고, 칸 쓰기는 그 줄의 backWait를 지운다(AC-3602.3)
//   picksOf(board)     판의 고르기 목록(없으면 null). 더한 칸 목록은 extra[열쇠]. 고르기 목록 글은 화면 파일에 두지 않고 판 picks만 쓴다(AC-3505.4·AC-3604.4)

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

/** 직접 칸에 한 번에 넣는 이름 수 한도 (reception-other-clinic AC-5703.4) */
const LIST_MAX = 8

/** 칸 글의 여러 줄·여러 개·이름표를 잇는 글 (AC-3502.1 · reception-other-clinic AC-5703.4) */
const JOIN = '|'

/** 여러 개 고른 것을 화면에 잇는 글 (AC-5710.3, 시안 "ICE·HP") */
const DOT = '·'

/** SONO·C-ARM·충격파 넣기 창의 글 (시안 carmSheet·sonoSheet·eswtSheet) */
const CARM_SUB = '시술과 약재를 골라요'
const SONO_SUB = '쪽을 누르고 부위를 눌러 담아요. 두 부위면 하나 더 담아요'
const ESWT_SUB = '타수와 부위 수를 골라요'
const PICKED_EMPTY = '아직 없어요 · 아래에서 부위를 눌러요'
const SIDE_HINT = '안 고르면 부위만 담겨요'
const PLAIN_HINT = '쪽·부위 없이 그대로 담겨요'

/** X-RAY 넣기 창과 직접 칸 넣기 창 두 모드의 작은 글 (reception-other-clinic AC-5711.1·5711.2, 시안 pickView). MULTI_SUB는 충격파·C-ARM 창의 [같이 고르기] 켜짐에도 쓴다 */
const XRAY_SUB = '처방에 없어도 넣을 수 있어요'
const ONE_SUB = '누르면 바로 들어가요'
const MULTI_SUB = '여러 개 골라 [넣기]를 눌러요'
const MULTI_LABEL = '같이 고르기'
const EDIT_LABEL = '☰ 목록 고치기'

/** 직접 칸 넣기 창의 줄 이름 (시안 COLS lists.label): 더한 칸은 '고르기' */
const LIST_LABELS = { pt: '종류', ds: '시간', trac: '부위' }
const ADDED_LABEL = '고르기'

/** 부위·시술 칸(sono·carm 열쇠)의 고르기 단추 글 · 머리 작은 글 (AC-3503.1·3504.1, AC-5710.1) */
const PICKS = { sono: '부위 고르기', carm: '시술 고르기' }
const PART_SUBS = { sono: '부위·준비·순서', carm: '시술·약재·순서' }
const ESWT_HEAD_SUB = '타수·부위 수'

/**
 * 판에 cfg.cols가 없을 때의 칸: 우리 의원 처음 값 일곱 칸(reception-other-clinic AC-5701.5) [열쇠, 이름, 종류, 단계].
 * 이 열쇠들이 '처음 칸'이고 다른 열쇠(x1…x99)는 더한 칸이다
 */
const FIRST_COLS = [
  ['xray', 'X-RAY', 'rx', 2],
  ['sono', 'SONO', 'rx', 3],
  ['carm', 'C-ARM', 'rx', 3],
  ['pt', 'PT', 'mn', 2],
  ['ds', '도수', 'mn', 2],
  ['eswt', '충격파', 'mn', 2],
  ['trac', '견인', 'mn', 2],
]
const FIRST_KEYS = new Set(FIRST_COLS.map(([key]) => key))
/** 더한 칸 열쇠 (AC-5701.3) */
const ADDED_KEY = /^x[1-9]\d?$/
/** 칸은 모두 12개까지 (notes.md) */
const COLS_MAX = 12
/** 치료 칸이 이만큼 이상이면 표 class에 cols-8(·cols-N)을 붙여 칸 폭을 줄인다 (AC-5710.5) */
const MANY_COLS = 8

/** 머리 작은 글에서 목록 이름을 잇는 글 (시안 headSubs) */
const HEAD_JOIN = '·'

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
  ['rtn', '돌아옴'],
  ['ptup', '↑ PT 먼저'],
]

/** 쓰는 법 둘째 줄 (reception-arrange-tune 시안 Mock.html). 첫 줄은 cfg.cols로 만든다(howtoOf, reception-other-clinic AC-5710.2) */
const HOWTO_SECOND =
  '접수 시각을 누르면 자리비움, 다시 누르면 돌아옴이에요(다음 치료 칸을 누를 때까지 돌아온 뒤 기다린 시간이 보여요). 성함이나 비고를 누르면 오늘·직전·그 전 진료기록부가 열려요. [PT 먼저]는 누를 때마다 ↑ 올라감 → ↓ 내려옴 → 지움.'

/** 새 병원 안내 줄 (reception-other-clinic AC-5710.4, 시안 .setup-note) */
const NOTE_TAIL = ' 칸에 넣을 처방을 아직 안 골랐어요. 그동안은 빈 칸을 눌러 직접 넣어요.'
const NOTE_GO = '설정에서 고르기'

const FOOT = '표시(준비완료·완료·자리비움·돌아옴·PT 먼저·치료 종료)는 접수 현황 PC에만 남아요 · 비트 자료는 바뀌지 않아요'
/** 돌아옴 이름표 "돌아옴 HH:MM" (reception-arrange-tune AC-3602.1) */
const BACK_LABEL = '돌아옴'
/** 돌아온 바로 그때의 기다린 글(도우미가 0분부터 센다, AC-3601.4·AC-3602.3) */
const BACK_WAIT_START = '0분째'
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
  const cols = colsOf(board)
  const rows = arrange.rows.filter((row) => lists.has(row.k))
  const redraw = (next) => renderArrange(host, board, { ...view, reading: readingNow(host), ...next })
  const act = actionsOf(host, view, redraw, picks)

  replace(parts.top, topOf(board, { ...view, tab: 'arrange' }))
  replace(parts.asof, `${board.at} 기준 · ${refreshText(board.every)}`)
  replace(parts.howto, [howtoOf(cols), el('br'), HOWTO_SECOND])
  parts.page.querySelector(':scope > .setup-note')?.remove()
  const note = noteOf(cols, act)
  if (note) parts.wrap.before(note)
  parts.table.className = tableClass(cols.length)
  replace(parts.head, headOf(cols, picks))
  const rxNew = new Set(Array.isArray(view.rxNew) ? view.rxNew : [])
  const flash = new Set(Array.isArray(view.flash) ? view.flash : [])
  replace(
    parts.body,
    rows.map((row) => rowOf(row, lists.get(row.k), cols, { rxNew: rxNew.has(row.k), flash: flash.has(row.k) }, act)),
  )
  parts.empty.hidden = rows.length > 0
  replace(parts.ended, endedOf(arrange.ended, lists, view.endedOpen === true, act))

  // 같은 창을 다시 그리면 창 안 세로 위치를 그대로 둔다(긴 SONO 창을 누를 때마다·저절로 다시 그릴 때마다 맨 위로 가지 않게)
  const before = parts.page.querySelector(':scope > .sheet-back:not(.list-back)')
  const top = before?.querySelector(':scope > .sheet')?.scrollTop ?? 0
  const same = before !== null && drawnSheet.get(parts.page) === sheetKey(view.sheet)
  before?.remove()
  parts.page.querySelector(':scope > .toast')?.remove()
  const sheet = sheetOf(view.sheet, rows, lists, cols, act, picks)
  drawnSheet.set(parts.page, sheet ? sheetKey(view.sheet) : null)
  if (sheet) {
    // 넣기 창 위에 뜬 다른 창(칸 고치기 등, .list-back)이 있으면 그 아래에 둔다
    const over = parts.page.querySelector(':scope > .sheet-back.list-back')
    if (over) over.before(sheet)
    else parts.page.appendChild(sheet)
    if (same && top > 0) sheet.querySelector(':scope > .sheet').scrollTop = top
  }
  const toast = toastOf(view.toast, act)
  if (toast) parts.page.appendChild(toast)
  return parts.page
}

/**
 * 쓰기 하나를 판에 미리 얹은 사본과 되돌리기 띠 글·되돌리기 쓰기 (AC-3308.5·3308.6·3308.7·3308.8·3308.13, design.md 10절).
 * 받은 판은 바꾸지 않는다. 판에 없는 줄·칸(cfg.cols에 없는 칸 포함)이거나 맞지 않는 쓰기면 받은 판 그대로이고 toast·undo가 null이다
 * @param {object} board GET /api/board 답
 * @param {{ k: string, op: string, col?: string, v?: string, t?: string }} ask POST /api/arrange 몸
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
  const col = colsOf(board).find((item) => item.key === ask.col) ?? null
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
      if (!row || !col || cell || !addFits(picksOf(board), col, ask.v, ask.t)) return same
      const added = {
        st: 'todo',
        det: col.parted || col.key === 'xray' ? '' : ask.v,
        part: col.parted ? ask.v : null,
        at: stamp,
        ord: null,
        manual: true,
        tags: col.parted ? tagsOf(ask.t) : [],
      }
      return made(withCell(board, index, col.key, added), `${name} · ${col.name} 직접 넣었어요`, { k, op: 'remove', col: col.key })
    }
    case 'remove': {
      if (!cell) return same
      return made(withCell(board, index, col.key, null), `${name} · ${col.name} 칸에서 뺐어요`, null)
    }
    case 'part': {
      const picks = picksOf(board)
      if (!cell || !col.parted || !fits(picks, col.key, ask.v, ask.t)) return same
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
      // on 자리비움(되돌리기 clear) · off 돌아옴(되돌리기 on) · clear 되돌리기(아무 표시 없음, 조용히 보내 띠는 보이지 않는다) (AC-3602.3)
      if (!row) return same
      if (ask.v === 'on') return made(withRow(board, index, { ...row, away: stamp, back: null, backWait: null }), `${name} · 자리비움 ${stamp}`, { k, op: 'away', v: 'clear' })
      if (ask.v === 'off')
        return made(withRow(board, index, { ...row, away: null, back: stamp, backWait: BACK_WAIT_START }), `${name} · ${BACK_LABEL} ${stamp}`, { k, op: 'away', v: 'on' })
      if (ask.v === 'clear') return made(withRow(board, index, { ...row, away: null, back: null, backWait: null }), `${name} · 자리비움을 되돌렸어요`, null)
      return same
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

// ---- 칸 (판 cfg.cols) ------------------------------------------------------------------------------------

/**
 * 판의 치료 칸 (reception-other-clinic AC-5703.1·5710.1): cfg.cols 차례 그대로 { key, name, rx, three, parted, added, empty, pick, cls }.
 * rx 처방 칸(직접 넣으면 점선 "직접"), three 단계 3(준비완료가 있음), parted 부위·시술 칸(sono·carm 열쇠), added 더한 칸(x1…),
 * empty 고른 처방이 없는 처방 칸(안내 줄), pick 부위·시술이 없는 칸의 고르기 단추 글, cls 머리·칸 class.
 * 열쇠가 맞지 않거나 겹치거나 이름이 빈 칸은 뺀다(12칸까지). cfg.cols가 없으면 우리 의원 처음 값 일곱 칸이다
 */
function colsOf(board) {
  const given = board?.cfg?.cols
  const source = Array.isArray(given)
    ? given
    : FIRST_COLS.map(([k, name, kind, steps]) => ({ k, name, kind, steps, added: false, empty: false }))
  const seen = new Set()
  const cols = []
  for (const item of source) {
    if (!item || typeof item !== 'object' || typeof item.k !== 'string' || !isText(item.name) || seen.has(item.k)) continue
    const added = !FIRST_KEYS.has(item.k)
    if (added && !ADDED_KEY.test(item.k)) continue
    seen.add(item.k)
    cols.push({
      key: item.k,
      name: item.name,
      rx: item.kind === 'rx',
      three: item.steps === 3,
      parted: item.k === 'sono' || item.k === 'carm',
      added,
      empty: item.empty === true,
      pick: PICKS[item.k] ?? null,
      cls: added ? `c-${item.k} c-add` : `c-${item.k}`,
    })
    if (cols.length === COLS_MAX) break
  }
  return cols
}

/** 표 class: 치료 칸 8개 이상이면 cols-8, 9개 이상이면 cols-N도 (AC-5710.5) */
function tableClass(count) {
  if (count < MANY_COLS) return 'arr'
  return count === MANY_COLS ? 'arr cols-8' : `arr cols-8 cols-${Math.min(count, COLS_MAX)}`
}

/** 직접 칸(PT·도수·견인·더한 칸)의 판 picks 고르기 목록 (더한 칸은 extra[열쇠], 없으면 빈 목록) */
function listOf(picks, col) {
  if (!picks) return []
  if (col.added) return Object.hasOwn(picks.extra, col.key) ? picks.extra[col.key] : []
  return Array.isArray(picks[col.key]) ? picks[col.key] : []
}

/**
 * 쓰는 법 첫 줄 (AC-5710.2, design.md 3절): 단계 3인 칸(A) · 처방 칸(R) + 보이는 처방 sono·carm 고르기 단추 · 직접 칸(M)
 */
function howtoOf(cols) {
  const names = (list) => list.map((col) => col.name).join(DOT)
  const three = cols.filter((col) => col.three)
  const rx = cols.filter((col) => col.rx)
  const mn = cols.filter((col) => !col.rx)
  const first =
    three.length > 0 ? `치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 준비완료 → 완료, 준비완료는 ${names(three)}만).` : '치료 칸을 누르면 다음 단계로 넘어가요 (준비 → 완료).'
  let second = ''
  if (rx.length > 0) {
    const picks = rx.filter((col) => col.pick).map((col) => `${col.name}${topicOf(col.name)} [${col.pick}]`)
    second = `${names(rx)}${topicOf(names(rx))} 처방이 나오면 저절로 들어오고${picks.length > 0 ? `(${picks.join(', ')}로 골라요)` : ''}${mn.length > 0 ? ', ' : '.'}`
  }
  if (mn.length > 0) second += `${names(mn)}${topicOf(names(mn))} 빈 칸을 눌러 골라 넣어요(여러 개 골라도 돼요).`
  return second === '' ? first : `${first} ${second}`
}

/** 표 위 안내 줄 (AC-5710.4): empty 칸 이름들 + [설정에서 고르기](view.onSettings). empty 칸이 없으면 null */
function noteOf(cols, act) {
  const names = cols.filter((col) => col.empty).map((col) => col.name)
  if (names.length === 0) return null
  return el('div', { class: 'setup-note', role: 'note' }, [
    el('span', { class: 'sn-text' }, [el('b', null, names.join(DOT)), NOTE_TAIL]),
    el('button', { type: 'button', disabled: !act.has('onSettings'), on: { click: () => act.call('onSettings') } }, NOTE_GO),
  ])
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
      el('p', { class: 'howto' }),
      el('div', { class: 'wrap' }, el('table', { class: 'arr' }, [el('thead'), el('tbody')])),
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
    howto: page.querySelector(':scope > p.howto'),
    wrap: page.querySelector(':scope > .wrap'),
    table: page.querySelector(':scope > .wrap > table'),
    head: page.querySelector(':scope > .wrap > table > thead'),
    body: page.querySelector(':scope > .wrap > table > tbody'),
    empty: page.querySelector(':scope > p.empty-note'),
    ended: page.querySelector(':scope > section.ended'),
  }
}

/**
 * 표 머리 줄 (시안 차례, AC-5710.1): 접수 · 성함 · cfg 칸들 · 비고 · 끝. 접수 작은 글은 "·" 뒤에서만 줄을 바꾼다(시안 span.nw + wbr, AC-3602.2).
 * 칸 작은 글은 headSubOf. 그릴 때마다 새로 만든다(thead는 그대로)
 */
function headOf(cols, picks) {
  const th = (cls, text, sub) => el('th', { class: cls }, [text, sub ? el('span', { class: 'sm' }, sub) : null])
  return el('tr', null, [
    th('c-t', '접수', ['누르면 ', el('span', { class: 'nw' }, '자리비움·'), el('wbr'), '돌아옴']),
    th('c-nm', '성함'),
    ...cols.map((col) => th(col.cls, col.name, headSubOf(col, picks))),
    th('c-memo', '비고', '접수 메모 · 지난번 증상'),
    el('th', { class: 'c-end' }),
  ])
}

/** 칸 머리 작은 글: SONO·C-ARM 고정 글, X-RAY 없음, 직접 칸이면 충격파 "타수·부위 수"·그 밖은 판 picks 목록을 "·"로 이은 글(비면 없음) */
function headSubOf(col, picks) {
  if (col.parted) return PART_SUBS[col.key]
  if (col.key === 'xray' || col.rx) return null
  if (col.key === 'eswt') return ESWT_HEAD_SUB
  const sub = listOf(picks, col).join(HEAD_JOIN)
  return sub !== '' ? sub : null
}

// ---- 누르기 ---------------------------------------------------------------------------------------------

/** 누르기 처리: 창 열고 닫기·펼침은 그 자리에서 다시 그린 뒤 알리고, 쓰기는 view.on…만 부른다. picks는 판의 고르기 목록(없으면 null) */
function actionsOf(host, view, redraw, picks) {
  const has = (name) => typeof view[name] === 'function'
  const call = (name, ...args) => {
    if (has(name)) view[name](...args)
  }
  const sheetNow = () => host.querySelector('.sheet-back:not(.list-back) > .sheet')
  const open = (sheet) => {
    redraw({ sheet })
    call('onSheet', sheet)
    sheetNow()?.focus({ preventScroll: true })
  }
  const close = () => {
    redraw({ sheet: null })
    call('onSheet', null)
  }
  /** 창 값을 바꿔 다시 그리고 알린 뒤 다시 그린 창에서 focus(창)가 고른 요소에 초점을 돌려 둔다 */
  const change = (next, focus) => {
    redraw({ sheet: next })
    call('onSheet', next)
    const sheet = sheetNow()
    if (sheet) focus(sheet)?.focus({ preventScroll: true })
  }
  return {
    /** 판의 고르기 목록(없으면 null): 충격파 칸 글을 타수·부위 수로 나눌 때 쓴다 */
    picks,
    has,
    call,
    close,
    cell(k, col, cell) {
      if (!cell) {
        // 판에 picks가 없으면 X-RAY 말고는 넣기 창을 열지 않는다(AC-3505.4·AC-3604.4)
        if (col.key !== 'xray' && !picks) return
        if (col.parted) open(pickSheet(k, col.key, 'add'))
        else if (col.key === 'eswt') open(freshOf({ k, col: col.key, kind: 'add' }))
        // 목록이 빈 더한 칸은 창 없이 바로 넣는다(AC-5711.1)
        else if (col.added && listOf(picks, col).length === 0) call('onAdd', k, col.key, '')
        else open({ k, col: col.key, kind: 'add' })
      } else if (cell.st === 'done') open({ k, col: col.key, kind: 'done' })
      else call('onCell', k, col.key)
    },
    /** [부위 고르기]·[시술 고르기]: 판에 picks가 없으면 열지 않는다(AC-3505.4) */
    part(k, col) {
      if (picks) open(pickSheet(k, col.key, 'part'))
    },
    /**
     * 넣기 창의 고르기 단추(group: pick · hit·count · proc·drug · side·part·plain·with·chip): 고르거나 담고, 고른 것을 다시 누르면 푼다.
     * 창 값을 onSheet로 넘기고 다시 그린 창에서 누른 단추에 초점을 돌려 둔다(AC-3402.2·3503.1·3504.2·5711.2)
     */
    choose(sheet, col, group, label) {
      change(nextOf(sheet, col, group, label, picks), (drawn) =>
        [...drawn.querySelectorAll(`:scope > .opts[data-g="${group}"] > button.opt`)].find((b) => textOnly(b) === label),
      )
    },
    /** [같이 고르기] 켜고 끄기: 고른 것을 비우고 창 값을 onSheet로 넘긴다. 켜기 단추에 초점을 돌려 둔다(AC-5711.2) */
    mode(sheet, multi) {
      const base = { k: sheet.k, col: sheet.col, kind: sheet.kind }
      change(multi ? multiOf(base) : freshOf(base), (drawn) => drawn.querySelector(':scope > .pick-mode > button.switch'))
    },
    /** 넣기 창의 [넣기 · …]: 창을 닫고 빈 칸이면 onAdd, [부위 고르기]·[시술 고르기]면 onPart. t가 없으면 넘기지 않는다 */
    put(sheet, v, t) {
      close()
      call(sheet.kind === 'add' ? 'onAdd' : 'onPart', sheet.k, sheet.col, v, ...(t === undefined ? [] : [t]))
    },
    /** 한 번에 넣는 단추(X-RAY·하나는 한 번에 직접 칸)·완료 창의 고르기 */
    pick(sheet, label) {
      close()
      if (sheet.kind === 'add') call('onAdd', sheet.k, sheet.col, label)
      else if (sheet.kind === 'part') call('onPart', sheet.k, sheet.col, label)
      else if (label === BACK_TODO) call('onSet', sheet.k, sheet.col, 'todo')
      else if (label === BACK_READY) call('onSet', sheet.k, sheet.col, 'ready')
      else if (label === TAKE_OUT) call('onRemove', sheet.k, sheet.col)
    },
    /** [☰ 목록 고치기]: 넣기 창은 그대로 두고 칸 고치기 창을 연다고 알린다(AC-5711.4) */
    edit(col) {
      call('onEditCol', col.key, 'list', { back: 'sheet' })
    },
    ended(open) {
      redraw({ endedOpen: open })
      call('onEnded', open)
    },
  }
}

// ---- 줄 -------------------------------------------------------------------------------------------------

/** 줄 하나: 접수 · 성함(+ [PT 먼저]) · cfg 칸들 · 비고 · [치료 종료] */
function rowOf(row, list, cols, marks, act) {
  const cls = [row.away ? 'away' : null, marks.flash ? 'flash' : null].filter(Boolean).join(' ')
  return el('tr', { class: cls || null, 'data-k': row.k }, [
    el('td', { class: 'c-t' }, awayOf(row, list, act)),
    el('td', { class: 'c-nm' }, [nameOf(row, list, marks.rxNew, act), ptfOf(row, act)]),
    ...cols.map((col) => el('td', { class: col.cls }, cellOf(row.k, col, row.cells?.[col.key] ?? null, act))),
    el('td', { class: 'c-memo' }, memoOf(row, list, act)),
    el(
      'td',
      { class: 'c-end' },
      el('button', { type: 'button', class: row.allDone === true ? 'end-btn is-go' : 'end-btn', on: { click: () => act.call('onEnd', row.k) } }, ['치료', el('br'), '종료']),
    ),
  ])
}

/**
 * 접수 칸: 접수 시각(+ 기다린 글), 자리비움이면 "자리비움" + 그 시각, 아니고 돌아왔으면 "돌아옴 {back}" + (셈 중이면) 돌아온 뒤 기다린 글
 * (reception-arrange-tune AC-3602.1). 누르면 자리비움 줄은 돌아옴(off), 다른 줄은 자리비움(on)
 */
function awayOf(row, list, act) {
  const time = typeof list.time === 'string' ? (TIME.exec(list.time)?.[0] ?? list.time) : ''
  const back = isText(row.back) ? [el('span', { class: 'rtn-tag' }, `${BACK_LABEL} ${row.back}`), isText(row.backWait) ? el('span', { class: 'wt rtn-wt' }, row.backWait) : null] : null
  return el('button', { type: 'button', class: 't-btn', on: { click: () => act.call('onAway', row.k, row.away ? 'off' : 'on') } }, [
    el('span', { class: 't-time' }, time),
    waitedSpan(list),
    row.away ? el('span', { class: 'away-tag' }, ['자리비움', el('br'), row.away]) : back,
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
    col.key === 'eswt' ? eswtText(cell, st === 'done', act.picks?.eswt.hits ?? []) : st === 'done' ? doneText(col, cell) : detOf(k, col, cell, act),
  ])
}

/** 여러 개 글 조각을 "·"로 잇고 "·" 뒤에서 줄을 바꿀 수 있게 한다(wbr, AC-5710.3). 조각은 글 마디로만 */
function dotted(pieces) {
  return pieces.flatMap((piece, i) => (i < pieces.length - 1 ? [`${piece}${DOT}`, el('wbr')] : [piece]))
}

/**
 * 충격파 칸의 글 (AC-3402.3·3604.4, reception-other-clinic AC-5703.4·5710.3): "|" 조각이면 앞쪽의 판 picks 타수 이름들이 타수(위),
 * 나머지가 부위 수들(아래). 옛 글("{타수} {부위 수}")은 picks 타수 이름 + 빈칸으로 시작할 때만 나누고(여럿 맞으면 긴 이름), 아니면 칸 글 하나.
 * 완료 칸의 부위 수는 작은 글
 */
function eswtText(cell, done, hits) {
  if (!isText(cell.det)) return null
  const det = cell.det
  const cls = done ? 'det sm' : 'det'
  if (det.includes(JOIN)) {
    const pieces = det.split(JOIN)
    let lead = 0
    while (lead < pieces.length - 1 && hits.includes(pieces[lead])) lead++
    const rest = el('span', { class: cls }, dotted(pieces.slice(lead)))
    return lead === 0 ? rest : [el('span', { class: 'hit' }, dotted(pieces.slice(0, lead))), rest]
  }
  const hit = hits.filter((name) => det.length > name.length + 1 && det.startsWith(`${name} `)).reduce((long, name) => (long === null || name.length > long.length ? name : long), null)
  const rest = el('span', { class: cls }, hit === null ? det : det.slice(hit.length + 1))
  return hit === null ? rest : [el('span', { class: 'hit' }, hit), rest]
}

/** 단계 글 뒤에 시각(모르면 단계 글만) */
function withTime(label, at) {
  return typeof at === 'string' && at !== '' ? `${label} ${at}` : label
}

/** 부위·시술 칸 글: SONO는 줄마다 하나, C-ARM은 시술들을 "·"로 이은 글 하나 (AC-3504.4 · AC-5710.3) */
function partLines(col, part, cls) {
  const lines = part.split(JOIN).filter(isText)
  if (col.key === 'carm') return lines.length > 0 ? [el('span', { class: cls }, dotted(lines))] : []
  return lines.map((line) => el('span', { class: cls }, line))
}

/** 완료 칸의 작은 글: 부위(SONO 줄마다·C-ARM 시술들) + 이름표, 다른 칸은 칸 글("|" 조각은 "·"로) */
function doneText(col, cell) {
  if (col.parted) return [...(isText(cell.part) ? partLines(col, cell.part, 'det sm') : []), tagsEl(cell)]
  const text = isText(cell.part) ? cell.part : cell.det
  return isText(text) ? el('span', { class: 'det sm' }, dotted(text.split(JOIN))) : null
}

/**
 * 준비·준비완료 칸의 글: SONO·C-ARM은 부위·시술(없으면 [부위 고르기]·[시술 고르기])과 이름표
 * (SONO 같이 하는 것·C-ARM 약재, AC-3503.4·3504.4), 다른 칸은 칸 글("|" 조각은 "·"로, AC-5710.3)
 */
function detOf(k, col, cell, act) {
  if (!col.parted) return isText(cell.det) ? el('span', { class: 'det' }, dotted(cell.det.split(JOIN))) : null
  if (isText(cell.part)) return [...partLines(col, cell.part, 'det'), tagsEl(cell)]
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

/**
 * 비고 칸: 기록부 여는 단추(칸 가득, 누르면 성함과 같이 onChart, reception-arrange-tune AC-3605.2) 안에
 * 메모 상자(있을 때) + "지난번 …"(줄은 " / "로 이음, 세 줄까지, 없으면 첫 방문 글)
 */
function memoOf(row, list, act) {
  return el('button', { type: 'button', class: 'memo-btn', on: { click: () => act.call('onChart', row.k) } }, [
    isText(list.memo) ? el('div', { class: 'arr-memo' }, list.memo) : null,
    isText(row.last) ? el('div', { class: 'lastsym' }, [el('span', { class: 'lastsym-label' }, LAST_LABEL), oneLine(row.last)]) : el('div', { class: 'lastsym' }, NO_LAST),
  ])
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
 * 열린 고르기 창. 그 줄이 판에 없거나 칸이 cfg.cols에 없거나 창 종류에 맞지 않으면(다른 기기가 바꿈) 그리지 않는다(AC-3308.11).
 * SONO·C-ARM·직접 칸·충격파 넣기 창은 판 picks가 없으면 그리지 않는다(AC-3505.4·AC-3604.4). 목록이 빈 더한 칸은 창이 없다(AC-5711.1)
 */
function sheetOf(sheet, rows, lists, cols, act, picks) {
  if (!sheet || typeof sheet !== 'object') return null
  const row = rows.find((item) => item.k === sheet.k)
  const col = cols.find((item) => item.key === sheet.col)
  if (!row || !col) return null
  const cell = row.cells?.[col.key] ?? null
  const name = lists.get(row.k)?.name ?? ''
  if (sheet.kind === 'add' && !cell) {
    if (col.key === 'xray') return xraySheetOf(sheet, col, name, act)
    if (!picks) return null
    if (col.key === 'eswt') return eswtSheetOf(sheet, col, name, picks, act)
    if (col.parted) return col.key === 'carm' ? carmSheetOf(sheet, col, name, picks, act) : sonoSheetOf(sheet, col, name, picks, act)
    const items = listOf(picks, col)
    if (col.added && items.length === 0) return null
    return listSheetOf(sheet, col, name, items, act)
  }
  if (sheet.kind === 'part' && cell && col.parted) {
    if (!picks) return null
    return col.key === 'carm' ? carmSheetOf(sheet, col, name, picks, act) : sonoSheetOf(sheet, col, name, picks, act)
  }
  if (sheet.kind === 'done' && cell?.st === 'done') {
    const title = `${col.name} · 완료`
    const sub = typeof cell.at === 'string' && cell.at !== '' ? `${name} · ${cell.at}에 완료로 바꿨어요` : `${name} · 완료로 바꿨어요`
    const options = [BACK_TODO, col.three ? BACK_READY : null, cell.manual === true ? TAKE_OUT : null].filter(Boolean)
    return sheetBack(title, act, [headSheet(title, sub), oneOpts('opts', null, null, options, sheet, act), closeX(act)])
  }
  return null
}

/** X-RAY 넣기 창 (AC-3308.7): "X-ray 찍기" 하나. 목록 고치기는 없다 */
function xraySheetOf(sheet, col, name, act) {
  const title = `${col.name} 직접 넣기`
  return sheetBack(title, act, [headSheet(title, `${name} · ${XRAY_SUB}`), oneOpts('opts', null, null, [XRAY_TAKE], sheet, act), closeX(act)])
}

/**
 * 직접 칸 넣기 창 (reception-other-clinic AC-5711.1·5711.2, 시안 pickView): 줄 이름 + [같이 고르기](고르기가 둘 이상일 때).
 * 꺼짐(하나는 한 번에): 단추를 누르면 그것 하나를 넣고 닫힌다 + [닫기]. 켜짐: 체크 상자 단추 + [닫기] [넣기 · …](고른 것을 목록 차례로).
 * 맨 아래 [☰ 목록 고치기]
 */
function listSheetOf(sheet, col, name, items, act) {
  const title = `${col.name} 직접 넣기`
  const label = col.added ? ADDED_LABEL : (LIST_LABELS[col.key] ?? ADDED_LABEL)
  const can = items.length > 1
  const multi = can && sheet.multi === true
  const picked = multi ? inOrder(items, sheet.picked) : []
  return sheetBack(
    title,
    act,
    [
      headSheet(title, `${name} · ${multi ? MULTI_SUB : ONE_SUB}`),
      modeOf(label, can, multi, sheet, act),
      multi
        ? checkOpts('opts duo', 'pick', label, items, picked, sheet, col, act)
        : oneOpts(items.length > MANY ? 'opts many' : 'opts', 'pick', label, items, sheet, act),
      multi ? goOf(picked.length > 0 ? picked.join(DOT) : null, () => act.put(sheet, picked.join(JOIN)), act) : closeX(act),
      editButton(col, act),
    ],
    'sheet pick-sheet',
  )
}

/**
 * 충격파 넣기 창 (AC-3402.2, 시안 eswtSheet): [타수] 줄 · [부위 수] 줄(판 picks.eswt, 타수 목록이 비면 타수 줄 없음, AC-3604.4)과
 * [닫기]·[넣기 · …]. 부위 수를 고르기 전에는 [넣기]가 꺼져 있고 타수는 안 골라도 된다. 첫 줄 이름 오른쪽에 [같이 고르기]
 * (켜면 줄마다 여러 개, reception-other-clinic AC-5711.3). v는 타수들 먼저 "|"로 이은 글(AC-5703.4). 맨 아래 [☰ 목록 고치기]
 */
function eswtSheetOf(sheet, col, name, picks, act) {
  const title = `${col.name} 직접 넣기`
  const { hits, counts } = picks.eswt
  const can = eswtMulti(picks)
  const chosen = eswtState(sheet, picks, can)
  const value = chosen.counts.length === 0 ? null : [chosen.hits.join(DOT), chosen.counts.join(DOT)].filter(isText).join(' ')
  const opts = (group, label, items, on) =>
    chosen.multi ? checkOpts('opts four', group, label, items, on, sheet, col, act) : pickOpts('opts four', group, label, items, on, sheet, col, act)
  const rows =
    hits.length > 0
      ? [modeOf('타수', can, chosen.multi, sheet, act), opts('hit', '타수', hits, chosen.hits), el('div', { class: 'opt-label' }, '부위 수'), opts('count', '부위 수', counts, chosen.counts)]
      : [modeOf('부위 수', can, chosen.multi, sheet, act), opts('count', '부위 수', counts, chosen.counts)]
  return sheetBack(title, act, [
    headSheet(title, `${name} · ${chosen.multi ? MULTI_SUB : ESWT_SUB}`),
    rows,
    goOf(value, () => act.put(sheet, [...chosen.hits, ...chosen.counts].join(JOIN)), act),
    editButton(col, act),
  ])
}

/**
 * C-ARM 넣기 창 (AC-3503.1·3503.2, 시안 carmSheet): 시술 줄 · 약재 줄(약재가 없으면 줄 없음)과 [닫기]·[넣기 · {시술} {약재}].
 * 시술을 고르기 전에는 [넣기]가 꺼져 있다. 고른 시술이 모두 약재 없음이면 약재 줄이 흐려 눌리지 않고 "{시술}은|는 약재 없이 넣어요"이며
 * 약재를 보내지 않는다. 시술 줄 이름 오른쪽에 [같이 고르기](켜면 시술·약재를 여러 개, reception-other-clinic AC-5711.3). 맨 아래 [☰ 목록 고치기]
 */
function carmSheetOf(sheet, col, name, picks, act) {
  const title = `${col.name} 넣기`
  const names = picks.carm.procs.map((item) => item.n)
  const can = carmMulti(picks)
  const chosen = carmState(sheet, picks, can)
  const procs = picks.carm.procs.filter((item) => chosen.procs.includes(item.n))
  const noDrug = procs.length > 0 && procs.every((item) => item.noDrug === true)
  const drugs = noDrug ? [] : chosen.drugs
  const opts = (cls, group, label, items, on, off) =>
    chosen.multi ? checkOpts(cls, group, label, items, on, sheet, col, act, off) : pickOpts(cls, group, label, items, on, sheet, col, act, off)
  const lead = chosen.procs.join(DOT)
  return sheetBack(title, act, [
    headSheet(title, `${name} · ${chosen.multi ? MULTI_SUB : CARM_SUB}`),
    modeOf('시술', can, chosen.multi, sheet, act),
    opts('opts four', 'proc', '시술', names, chosen.procs, false),
    picks.carm.drugs.length > 0 ? [el('div', { class: 'opt-label' }, '약재'), opts(noDrug ? 'opts trio no-drug' : 'opts trio', 'drug', '약재', picks.carm.drugs, drugs, noDrug)] : null,
    noDrug ? el('p', { class: 'opt-note' }, `${lead}${topicOf(lead)} 약재 없이 넣어요`) : null,
    goOf(chosen.procs.length === 0 ? null : pickText('carm', chosen.procs, drugs), () => act.put(sheet, chosen.procs.join(JOIN), drugs.join(JOIN)), act),
    editButton(col, act),
  ])
}

/**
 * SONO 넣기 창 (AC-3504.1~3504.3, 시안 sonoSheet): 고른 것(이름표, 누르면 뺌) · 쪽 · 부위 · 부위 없이 · 같이 하는 것(체크)과
 * [닫기]·[넣기 · {줄} · {줄} + {같이}]. 무리가 비면 그 줄은 없다(부위가 없으면 쪽도). 고른 것이 없으면 [넣기]가 꺼져 있다.
 * 이미 줄마다 여러 개를 담는 창이라 [같이 고르기]는 없다(AC-5703.4 "sono는 지금 규칙"). 맨 아래 [☰ 목록 고치기](AC-5711.4)
 */
function sonoSheetOf(sheet, col, name, picks, act) {
  const title = `${col.name} 넣기`
  const chosen = sonoState(sheet, picks)
  const count = chosen.picked.length
  const label = (text, hint) => el('div', { class: 'opt-label' }, [text, hint ? el('span', { class: 'opt-hint' }, hint) : null])
  const chips =
    count > 0
      ? chosen.picked.map((line) =>
          el('button', { type: 'button', class: 'picked-chip', on: { click: () => act.choose(sheet, col, 'chip', line) } }, [line, el('span', { 'aria-hidden': 'true' }, '✕')]),
        )
      : el('span', { class: 'picked-empty' }, PICKED_EMPTY)
  return sheetBack(
    title,
    act,
    [
      headSheet(title, `${name} · ${SONO_SUB}`),
      label(count > 0 ? `고른 것 · ${count}개` : '고른 것'),
      el('div', { class: 'picked' }, chips),
      picks.sono.parts.length > 0
        ? [
            label('쪽', SIDE_HINT),
            pickOpts('opts trio', 'side', '쪽', SIDES.map(([side]) => side), chosen.side === null ? [] : [chosen.side], sheet, col, act),
            label('부위'),
            pickOpts('opts four parts', 'part', '부위', picks.sono.parts, null, sheet, col, act),
          ]
        : null,
      picks.sono.plains.length > 0 ? [label('부위 없이', PLAIN_HINT), pickOpts('opts trio', 'plain', '부위 없이', picks.sono.plains, chosen.picked, sheet, col, act)] : null,
      picks.sono.withs.length > 0 ? [label('같이 하는 것'), checkOpts('opts duo', 'with', '같이 하는 것', picks.sono.withs, chosen.withs, sheet, col, act)] : null,
      goOf(count === 0 ? null : pickText('sono', chosen.picked, chosen.withs), () => act.put(sheet, chosen.picked.join(JOIN), chosen.withs.join(JOIN)), act),
      editButton(col, act),
    ],
    'sheet sono-sheet',
  )
}

/** 창 머리: 제목 + 작은 글 */
function headSheet(title, sub) {
  return el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, title), el('span', { class: 'sheet-sub' }, sub)])
}

/** 창 아래 [닫기] (한 번에 넣는 창) */
function closeX(act) {
  return el('button', { type: 'button', class: 'sheet-x', on: { click: () => act.close() } }, '닫기')
}

/** 줄 이름 + (고르기가 둘 이상이면) [같이 고르기] 켜기 단추 (AC-5711.2, 시안 .pick-mode) */
function modeOf(label, can, multi, sheet, act) {
  return el('div', { class: 'pick-mode' }, [
    el('span', { class: 'opt-label' }, label),
    can
      ? el('button', { type: 'button', class: 'switch sm', 'aria-pressed': multi ? 'true' : 'false', on: { click: () => act.mode(sheet, !multi) } }, [
          MULTI_LABEL,
          el('span', { class: 'knob', 'aria-hidden': 'true' }),
        ])
      : null,
  ])
}

/** 넣기 창 맨 아래 [☰ 목록 고치기] (AC-5711.4): view.onEditCol이 없으면 꺼져 있다 */
function editButton(col, act) {
  return el('button', { type: 'button', class: 'pick-edit', disabled: !act.has('onEditCol'), on: { click: () => act.edit(col) } }, EDIT_LABEL)
}

/** 누르면 그것 하나로 넣고 닫히는 단추 줄(X-RAY·완료 창·하나는 한 번에 직접 칸). group이 있으면 data-g·이름(aria-label)을 단다 */
function oneOpts(cls, group, label, items, sheet, act) {
  return el(
    'div',
    group ? { class: cls, role: 'group', 'aria-label': label, 'data-g': group } : { class: cls },
    items.map((item) => el('button', { type: 'button', class: 'opt', on: { click: () => act.pick(sheet, item) } }, item)),
  )
}

/**
 * 넣기 창의 고르는 단추 줄 하나(data-g = group). on이 있으면 고른 단추는 on·aria-pressed다(없으면 담는 단추라 고른 표시가 없다).
 * off면 줄 단추를 모두 끈다(약재 없음)
 */
function pickOpts(cls, group, label, items, on, sheet, col, act, off = false) {
  return el(
    'div',
    { class: cls, role: 'group', 'aria-label': label, 'data-g': group },
    items.map((item) => {
      const picked = on !== null && on.includes(item)
      return el(
        'button',
        {
          type: 'button',
          class: picked ? 'opt on' : 'opt',
          'aria-pressed': on === null ? null : picked ? 'true' : 'false',
          disabled: off,
          on: { click: () => act.choose(sheet, col, group, item) },
        },
        item,
      )
    }),
  )
}

/** 체크 상자 단추 줄([같이 고르기] 켜짐·SONO 같이 하는 것, AC-3504.1·5711.2). off면 줄 단추를 모두 끈다(약재 없음) */
function checkOpts(cls, group, label, items, on, sheet, col, act, off = false) {
  return el(
    'div',
    { class: cls, role: 'group', 'aria-label': label, 'data-g': group },
    items.map((item) => {
      const picked = on.includes(item)
      return el(
        'button',
        {
          type: 'button',
          class: picked ? 'opt check on' : 'opt check',
          'aria-pressed': picked ? 'true' : 'false',
          disabled: off,
          on: { click: () => act.choose(sheet, col, group, item) },
        },
        [el('span', { class: 'box', 'aria-hidden': 'true' }, picked ? '✓' : ''), item],
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

/** 넣기 창 값의 글(넣기 단추·부위 띠): C-ARM "{시술·시술} {약재·약재}", SONO "{줄} · {줄}" + " + {같이} · {같이}" */
function pickText(colKey, lines, tags) {
  if (colKey === 'carm') return [lines.join(DOT), tags.join(DOT)].filter(isText).join(' ')
  return tags.length > 0 ? `${lines.join(' · ')} + ${tags.join(' · ')}` : lines.join(' · ')
}

/**
 * 이름 끝 글자로 정한 조사 "은"·"는" (reception-other-clinic design.md 3절): 한글은 받침이 있으면 "은", 영문은 L·M·N·R이면 "은",
 * 숫자는 0·1·3·6·7·8이면 "은", 그 밖은 "는"
 */
function topicOf(word) {
  const last = word.at(-1) ?? ''
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0 ? '은' : '는'
  if (/^[a-z]$/i.test(last)) return /^[lmnr]$/i.test(last) ? '은' : '는'
  if (/^\d$/.test(last)) return '013678'.includes(last) ? '은' : '는'
  return '는'
}

/** 새로 여는 SONO·C-ARM 넣기 창 값 */
function pickSheet(k, col, kind) {
  return col === 'carm' ? { k, col, kind, proc: null, drug: null } : { k, col, kind, side: null, picked: [], withs: [] }
}

/** [같이 고르기] 꺼진 창 값(창을 열 때·끌 때): 충격파 { hit, count }, C-ARM { proc, drug }, 직접 칸은 열쇠·칸·종류만 */
function freshOf(base) {
  if (base.col === 'eswt') return { ...base, hit: null, count: null }
  if (base.col === 'carm') return { ...base, proc: null, drug: null }
  return base
}

/** [같이 고르기] 켠 창 값(고른 것 없음): 충격파 { hits, counts }, C-ARM { procs, drugs }, 직접 칸 { picked } */
function multiOf(base) {
  if (base.col === 'eswt') return { ...base, multi: true, hits: [], counts: [] }
  if (base.col === 'carm') return { ...base, multi: true, procs: [], drugs: [] }
  return { ...base, multi: true, picked: [] }
}

/** items 가운데 values에 있는 것만 items 차례로(목록 밖·겹친 값은 뺀다) */
function inOrder(items, values) {
  const given = Array.isArray(values) ? values : []
  return items.filter((item) => given.includes(item))
}

/** 하나 고른 값이 목록에 있으면 [값], 아니면 [] */
function oneOf(items, value) {
  return items.includes(value) ? [value] : []
}

/** [같이 고르기]가 있는가: 충격파·C-ARM은 어느 한 줄이라도 고르기가 둘 이상일 때 (AC-5711.2) */
function eswtMulti(picks) {
  return picks.eswt.hits.length > 1 || picks.eswt.counts.length > 1
}

function carmMulti(picks) {
  return picks.carm.procs.length > 1 || picks.carm.drugs.length > 1
}

/** 충격파 창 값 { multi, hits, counts }: 목록 밖·겹친 값은 안 고른 것. can이 거짓(고르기가 하나뿐)이면 multi는 거짓 */
function eswtState(sheet, picks, can) {
  const { hits, counts } = picks.eswt
  if (can && sheet?.multi === true) return { multi: true, hits: inOrder(hits, sheet.hits), counts: inOrder(counts, sheet.counts) }
  return { multi: false, hits: oneOf(hits, sheet?.hit), counts: oneOf(counts, sheet?.count) }
}

/** C-ARM 창 값 { multi, procs, drugs }: 목록 밖·겹친 값은 안 고른 것. can이 거짓이면 multi는 거짓 */
function carmState(sheet, picks, can) {
  const names = picks.carm.procs.map((item) => item.n)
  if (can && sheet?.multi === true) return { multi: true, procs: inOrder(names, sheet.procs), drugs: inOrder(picks.carm.drugs, sheet.drugs) }
  return { multi: false, procs: oneOf(names, sheet?.proc), drugs: oneOf(picks.carm.drugs, sheet?.drug) }
}

/** SONO 창 값 { side, picked, withs }: 목록 밖·겹친 값은 뺀다. 담은 것은 6줄까지 */
function sonoState(sheet, picks) {
  const picked = []
  for (const line of Array.isArray(sheet?.picked) ? sheet.picked : []) if (isSonoLine(line, picks) && !picked.includes(line) && picked.length < SONO_LINES) picked.push(line)
  const withs = []
  for (const item of Array.isArray(sheet?.withs) ? sheet.withs : []) if (picks.sono.withs.includes(item) && !withs.includes(item)) withs.push(item)
  return { side: SIDES.some(([side]) => side === sheet?.side) ? sheet.side : null, picked, withs }
}

/** 목록 차례를 지키며 item을 넣거나 뺀다 */
function toggled(items, chosen, item) {
  return chosen.includes(item) ? chosen.filter((x) => x !== item) : items.filter((x) => x === item || chosen.includes(x))
}

/** 넣기 창 단추 하나를 누른 다음 창 값 (칸마다) */
function nextOf(sheet, col, group, label, picks) {
  const base = { k: sheet.k, col: sheet.col, kind: sheet.kind }
  if (col.key === 'sono') return nextSono(sheet, group, label, picks)
  if (col.key === 'carm') {
    const names = picks.carm.procs.map((item) => item.n)
    const chosen = carmState(sheet, picks, carmMulti(picks))
    if (chosen.multi) {
      if (group === 'proc') return { ...base, multi: true, procs: toggled(names, chosen.procs, label), drugs: chosen.drugs }
      return { ...base, multi: true, procs: chosen.procs, drugs: toggled(picks.carm.drugs, chosen.drugs, label) }
    }
    const proc = chosen.procs[0] ?? null
    const drug = chosen.drugs[0] ?? null
    if (group === 'proc') return { ...base, proc: proc === label ? null : label, drug }
    return { ...base, proc, drug: drug === label ? null : label }
  }
  if (col.key === 'eswt') {
    const chosen = eswtState(sheet, picks, eswtMulti(picks))
    if (chosen.multi) {
      if (group === 'hit') return { ...base, multi: true, hits: toggled(picks.eswt.hits, chosen.hits, label), counts: chosen.counts }
      return { ...base, multi: true, hits: chosen.hits, counts: toggled(picks.eswt.counts, chosen.counts, label) }
    }
    const hit = chosen.hits[0] ?? null
    const count = chosen.counts[0] ?? null
    if (group === 'hit') return { ...base, hit: hit === label ? null : label, count }
    return { ...base, hit, count: count === label ? null : label }
  }
  // 직접 칸 [같이 고르기] 켜짐: 고른 것을 목록 차례로
  const items = listOf(picks, col)
  return { ...base, multi: true, picked: toggled(items, inOrder(items, sheet.picked), label) }
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

/** "|" 글이 목록 이름을 목록 차례로 겹침 없이 min~max개 이은 것인가 (빈 조각은 맞지 않는다) */
function inListOrder(items, pieces, min, max) {
  if (pieces.length < min || pieces.length > max) return false
  let last = -1
  for (const piece of pieces) {
    const at = items.indexOf(piece)
    if (at <= last) return false
    last = at
  }
  return true
}

/**
 * SONO·C-ARM 쓰기 글이 지금 목록에 맞는가 (AC-3502.3, 도우미 AC-5703.4와 같다): C-ARM은 v = 시술 1개 이상 · t = 약재 0개 이상
 * (각각 목록 차례, 겹침 없음, 고른 시술이 모두 약재 없음이면 t 없음), SONO는 v = 겹침 없는 1~6줄 · t = 같이 하는 것의 겹침 없는 일부.
 * 목록(picks)이 없으면 맞지 않는다
 */
function fits(picks, colKey, v, t) {
  if (!picks || !isText(v) || (t !== undefined && typeof t !== 'string')) return false
  const tags = tagsOf(t)
  if (colKey === 'carm') {
    const names = picks.carm.procs.map((item) => item.n)
    const pieces = v.split(JOIN)
    if (!inListOrder(names, pieces, 1, Infinity) || !inListOrder(picks.carm.drugs, tags, 0, Infinity)) return false
    const noDrug = picks.carm.procs.filter((item) => pieces.includes(item.n)).every((item) => item.noDrug)
    return !noDrug || tags.length === 0
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

/**
 * 빈 칸 넣기(add) 글이 지금 목록에 맞는가 (도우미 AC-5703.4와 같다): SONO·C-ARM은 fits, X-RAY는 "X-ray 찍기",
 * 충격파는 타수 0개 이상 + 부위 수 1개 이상(타수 먼저, 각각 목록 차례), 직접 칸은 목록 이름 1~8개(목록 차례, 겹침 없음),
 * 목록이 빈 더한 칸은 ""만. 이름표(t)는 SONO·C-ARM만
 */
function addFits(picks, col, v, t) {
  if (col.parted) return fits(picks, col.key, v, t)
  if (isText(t)) return false
  if (col.key === 'xray') return v === XRAY_TAKE
  if (!picks || typeof v !== 'string') return false
  if (col.key === 'eswt') {
    const pieces = v.split(JOIN)
    let lead = 0
    while (lead < pieces.length && picks.eswt.hits.includes(pieces[lead])) lead++
    return inListOrder(picks.eswt.hits, pieces.slice(0, lead), 0, Infinity) && inListOrder(picks.eswt.counts, pieces.slice(lead), 1, Infinity)
  }
  const items = listOf(picks, col)
  if (col.added && items.length === 0) return v === ''
  return inListOrder(items, v.split(JOIN), 1, LIST_MAX)
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
 * 판의 고르기 목록 picks { carm, sono, pt, ds, eswt: { hits, counts }, trac, extra: { 더한 칸 열쇠: 목록 } }
 * (reception-pick-lists AC-3501.4 · reception-arrange-tune AC-3604.4 · reception-other-clinic AC-5703.2).
 * 없거나 모양이 틀리면 null(SONO·C-ARM·직접 칸·충격파 넣기 창이 열리지 않는다). 글이 아닌 이름은 빼고, 없는 무리는 빈 목록이다
 */
export function picksOf(board) {
  const picks = board?.picks
  if (!picks || typeof picks !== 'object' || !picks.carm || typeof picks.carm !== 'object' || !picks.sono || typeof picks.sono !== 'object') return null
  const texts = (list) => (Array.isArray(list) ? list.filter(isText) : [])
  const procs = Array.isArray(picks.carm.procs) ? picks.carm.procs.filter((item) => item && isText(item.n)) : []
  const eswt = picks.eswt && typeof picks.eswt === 'object' ? picks.eswt : {}
  const extra = picks.extra && typeof picks.extra === 'object' ? picks.extra : {}
  return {
    carm: { procs: procs.map((item) => ({ n: item.n, noDrug: item.noDrug === true })), drugs: texts(picks.carm.drugs) },
    sono: { parts: texts(picks.sono.parts), plains: texts(picks.sono.plains), withs: texts(picks.sono.withs) },
    pt: texts(picks.pt),
    ds: texts(picks.ds),
    eswt: { hits: texts(eswt.hits), counts: texts(eswt.counts) },
    trac: texts(picks.trac),
    extra: Object.fromEntries(
      Object.keys(extra)
        .filter((key) => ADDED_KEY.test(key) && Array.isArray(extra[key]))
        .map((key) => [key, texts(extra[key])]),
    ),
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

/**
 * index번째 줄의 칸 하나를 바꾼 판 사본. allDone은 칸이 하나 이상이고 모두 완료일 때 true (AC-3305.8).
 * 칸 쓰기는 돌아온 뒤 기다린 셈을 멈추므로 backWait를 지운다(back은 둔다, reception-arrange-tune AC-3602.3)
 */
function withCell(board, index, key, cell) {
  const row = arrangeOf(board).rows[index]
  const cells = { ...row.cells, [key]: cell }
  const present = Object.values(cells).filter(Boolean)
  return withRow(board, index, { ...row, cells, backWait: null, allDone: present.length > 0 && present.every((item) => item.st === 'done') })
}

/** 그린 머리의 [새로 고침]이 읽는 중인가 */
function readingNow(host) {
  return host.querySelector('.page header.top button.refresh')?.disabled === true
}

/** 안을 비우고 children(요소·글)을 넣는다. 글은 글 마디로만 들어간다 */
function replace(node, children) {
  clear(node)
  for (const child of [children].flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child)
}

function isText(value) {
  return typeof value === 'string' && value !== ''
}
