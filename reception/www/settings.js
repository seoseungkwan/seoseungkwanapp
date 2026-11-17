// 설정 쪽 (reception-other-clinic REQ-5712·5713, design.md 3·5절, 승인 시안 docs/mockups/reception-other-clinic notes.md·index.html settingsView·colSheet·addSheet).
// class 이름은 style.css 머리 글의 화면 틀 그대로다. 글은 시안 글 그대로이고 글 마디로만 넣는다(칸 이름·처방 이름에 HTML이 있어도 글자로만)
// - renderSettings: 머리([‹ 어레인지]/[‹ 접수 현황] · 연결됨 · 제목 · 아래 글) + (처음 설정 안내) + [병원 로고]·[탭] + [어레인지 칸] + 띠.
//   읽는 중이면 머리만, 읽지 못했으면 한 줄 + [다시 읽기]다(AC-5712.1). 로고·탭·칸 보이기·차례는 바로 저장(view.onSave, 되돌리기 있음)이다.
//   셋 다 했어요가 되는 저장에는 setup.done 참을 함께 넣는다(AC-5712.7, finishSetup). 받은 문서는 바꾸지 않는다(사본을 고쳐 넘긴다)
// - 다시 그리기(저절로 읽기·띠): 문서·상태·띠·로고 그림·돌아갈 곳이 그대로면 그리지 않는다. 그리면 열린 창(.sheet-back.list-back)은 그대로 두고
//   나머지만 바꾼 뒤 초점이 있던 단추·글 칸(data-keep)에 초점을 돌린다. 열어 둔 병원 이름 글 칸과 적던 글도 남는다(AC-5713.10)
// - openColEditor: 칸 고치기 창. 이름·종류·단계·[넣을 처방]·[고르기 목록]은 창 안 초안만 바꾸고 [저장]이 그때의 최신 문서(ctx.doc)에
//   이 칸만 바꿔 ctx.onSave로 넘긴다. 'ok'면 닫고 아니면 창·초안을 그대로 둔다(AC-5713.1). 넣을 처방은 ctx.getCodes를 창마다 한 번
//   (못 읽었으면 탭을 다시 열 때 한 번 더), 직접 넣은 코드 이름은 ctx.getCodeName을 코드마다 한 번 묻는다(AC-5713.2·5713.5).
//   더한 칸의 [이 칸 빼기]는 바로 저장(되돌리기 있음)하고 닫는다(AC-5713.8). 창은 page(설정 쪽·어레인지 화면) 안에 붙고 다시 그려도 남는다
// - openColAdder: 칸 더하기 창(AC-5713.9). 열쇠 x{nextX}, nextX +1, 맨 끝에 더한다
// - shrinkLogo: 그 기기 브라우저가 그림을 열어 가로 1200·세로 300 안으로 비율 그대로 줄이고 PNG는 PNG, 그 밖은 JPEG로 다시 만든다.
//   다시 만든 그림이라 원본의 메타데이터가 없다. 20MB보다 크면 열지 않는다(big), 열 수 없거나 2MB 안으로 못 만들면 open(AC-5712.3, design.md 5절)
// - 브라우저 저장소를 쓰지 않는다. 로고 미리 보기 그림은 board.js logoOf(data: URL 모양 검사)로만 넣는다(AC-5714.1)
//
// 쓰는 법 (app.js)
//   renderSettings(host, settings | null, view) → .page.settings-page
//     view = { state: 'reading' | 'error' | 'ok', back: 'arrange' | 'board', toast: { text, undo } | null, logoPic: { ver, src } | null,
//              onSave(next, text, { undo }) → Promise<'ok' | 'conflict' | 'fail'>, onUndo(), onReread(), onLogoFile(file),
//              getCodes() → Promise<{ c, n, v }[]>, getCodeName(code) → Promise<string | null> }
//   openColEditor(page, key, ctx)   ctx = { doc(), tab?: 'rx' | 'list', back?: 'sheet' | null, onSave, getCodes, getCodeName }
//   openColAdder(page, ctx)
//   shrinkLogo(file) → Promise<{ bytes: Uint8Array, type: 'image/png' | 'image/jpeg', url: data: URL }>
//   finishSetup(doc) → 처음 설정 셋을 다 했으면 setup.done 참인 사본, 아니면 그 문서

import { logoOf } from './board.js'
import { el } from './dom.js'
import { hasList, listEditor, listFocus, listSummary } from './picks.js'

/* ---- 화면 글 (승인 시안 notes.md '화면에 새로 생기는 글') ---- */
const TITLE = '설정'
const LEAD = '여기서 바꾸면 이 병원의 모든 폰·태블릿 화면이 바로 바뀌어요.'
const CONN = '연결됨'
const READ_FAILED = '설정을 읽지 못했어요'
const REREAD = '다시 읽기'
const UNDO = '되돌리기'

const GUIDE_TITLE = '처음 설정'
const GUIDE_SUB = '이 병원에 맞게 세 가지를 정해요 · 다 하면 이 안내는 사라져요'
const GUIDE_OK = '했어요'
const STEP_LOGO = '로고 정하기'
const STEP_LOGO_D = '접수 현황·어레인지 화면 맨 위에 보일 로고예요'
const STEP_LOGO_GO = '로고 고르러 가기'
const STEP_LOGO_DONE = { pic: '로고 그림으로 정했어요', text: '병원 이름 글자로 정했어요', none: '로고 없이 쓰기로 했어요' }
const STEP_TAB = '어레인지 탭 쓸지 정하기'
const STEP_TAB_D = '치료 칸 표(어레인지)를 쓰나요?'
const STEP_TAB_YES = '써요'
const STEP_TAB_NO = '안 써요'
const STEP_TAB_ON = '어레인지 탭을 써요'
const STEP_TAB_OFF = '어레인지 탭을 안 써요 · [접수 현황] 탭만 보여요'
const STEP_RX = 'SONO·C-ARM 처방 고르기'
const STEP_RX_D = '처방이 나오면 칸에 저절로 들어오게 해요 · 지금 '
const STEP_RX_SKIP = '어레인지 탭을 안 써서 안 해도 돼요'

const LOGO_TITLE = '병원 로고'
const LOGO_SUB = '접수 현황·어레인지 화면 맨 위에 보여요'
const LOGO_MODES = [
  ['pic', '로고 그림'],
  ['text', '병원 이름 글자'],
  ['none', '없이'],
]
const PIC_AGAIN = '다른 그림 고르기'
const PIC_HINT = 'PNG·JPG 그림 · 큰 그림은 알아서 줄여요 · 가로로 긴 그림이 잘 보여요'
const TEXT_LABEL = '병원 이름'
const TEXT_GO = '바꾸기'
const TEXT_HINT = '1~20글자 · 제목 글꼴로 보여요'
const NONE_PREVIEW = '접수 현황'
const NONE_HINT = "로고 없이 '접수 현황' 제목만 보여요"
const LOGO_TOAST = '로고를 바꿨어요 · 모든 폰·태블릿에 바로 보여요'

const TAB_TITLE = '탭'
const TAB_SUB = '[접수 현황] 탭은 늘 있어요'
const TAB_NAME = '어레인지 탭'
const TAB_HINT = '치료 칸 표를 쓰는 병원만 켜요 · 끄면 [접수 현황] 탭만 보여요'
const TAB_ON = '어레인지 탭을 켰어요 · 모든 폰·태블릿에 바로 보여요'
const TAB_OFF = '어레인지 탭을 껐어요 · 모든 폰·태블릿에 바로 보여요'

const COLS_TITLE = '어레인지 칸'
const COLS_SUB = '표에 보이는 차례예요 · [고치기]에서 이름·종류·고르기 목록·넣을 처방을 바꿔요'
const KIND_RX = '처방 칸'
const KIND_MN = '직접 칸'
const KIND_NEW = '더한 칸'
const COL_EDIT = '고치기'
const COL_ADD = '+ 칸 더하기'
const MOVED = '칸 차례를 바꿨어요'
const RULE_SUM = '단순 촬영 코드 전부'

/* ---- 칸 고치기·칸 더하기 창 ---- */
const RX_SUB = "처방 칸 · 고른 처방이 나오면 저절로 '준비'가 들어와요. 빈 칸을 눌러 직접 넣을 수도 있어요"
const MN_SUB = '직접 칸 · 빈 칸을 눌러 골라 넣고, 누를 때마다 다음 단계로 넘어가요'
const NAME_HINT = '1~10글자 · 같은 이름은 안 돼요'
const STEP2 = '준비 → 완료'
const STEP3 = '준비 → 준비완료 → 완료'
const FOOT = '저장하면 모든 폰·태블릿 화면이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.'
const FOOT_SHEET = '저장하면 모든 폰·태블릿 화면이 바로 바뀌고, 고르기 창으로 돌아가요. 이미 표에 넣은 칸은 그대로예요.'
const LIST_TAB = '고르기 목록'
const NO_TABS = '고르기 줄이 없어 빈 칸을 누르면 바로 들어가요'
const DROP_COL = '이 칸 빼기'
const CANCEL = '취소'
const SAVE = '저장'

const FIND_HOLDER = '코드나 이름으로 찾기'
const FIND_LABEL = '처방 찾기'
const TOOLS_HEAD = '지난 30일 이 병원 처방 · '
const RX_NOTE = "체크한 처방이 나오면 이 칸에 저절로 '준비'가 들어와요. 한 처방을 여러 칸에 넣어도 돼요."
const DIRECT_T = '목록에 없으면 코드를 직접 넣어요'
const DIRECT_HOLDER = '예: EB470'
const DIRECT_GO = '넣기'
const DIRECT_HINT = '영문·숫자·한글·_ 1~16자 · 지난 30일에 안 나온 처방도 넣을 수 있어요'
const DIRECT_ADDED = "넣었어요 · 목록 맨 위 '직접 넣은 코드'에 있어요"
const DIRECT_BAD = '코드는 영문·숫자·한글·_ 1~16자예요'
const DIRECT_SAME = '이미 이 칸에 넣은 코드예요'
const DIRECT_LISTED = '지난 30일 목록에 있어서 거기에 체크했어요'
const NO_MATCH = '찾는 처방이 없어요 · 아래에서 코드를 직접 넣어요'
const RULE_T = '단순 촬영 코드 전부 (G1~G8로 시작)'
const RULE_D = '나라에서 정한 촬영 코드라 어느 병원이나 같아요. 끄면 아래에서 하나씩 골라요'
const CODES_READING = '읽는 중…'
const CODES_FAILED = '지금 처방 목록을 읽지 못했어요'
const CODES_EMPTY = '지난 30일 처방이 없어요'
const GROUP_TYPED = '직접 넣은 코드'
const GROUP_TYPED_SM = '지난 30일에 없던 것'
const GROUP_REC = '추천'
const GROUP_REST = '다른 처방'
const GROUP_ALL = '지난 30일 처방'
const GROUP_REST_SM = '많이 쓴 순'
const BADGE_TYPED = '직접 넣음'
const BADGE_RULE = '전부에 들어 있어요'
const NO_NAME = '(이름 없음)'

const ADD_TITLE = '칸 더하기'
const ADD_SUB = '표 맨 끝(비고 앞)에 새 칸이 생겨요'
const ADD_HOLDER = '예: IMS'
const ADD_FOOT_RX = '더한 뒤 [고치기]에서 넣을 처방과 고르기 목록을 정해요 · 칸은 모두 12개까지예요'
const ADD_FOOT_MN = '더한 뒤 [고치기]에서 고르기 목록을 정해요 · 칸은 모두 12개까지예요'
const ADD_GO = '더하기'
const KIND_CARDS = [
  ['mn', KIND_MN, '빈 칸을 눌러 골라 넣어요. 다시 누르면 완료예요'],
  ['rx', KIND_RX, "고른 처방이 나오면 저절로 '준비'가 들어와요"],
]

// ---- 규칙 (design.md 1절, api.js와 같다) ----
/** 칸은 모두 12개까지, 칸마다 처방 코드 40개까지, 더한 칸 열쇠 x1…x99 (AC-5701.2·5701.3) */
const COLS_MAX = 12
const CODES_MAX = 40
const ADDED_MAX = 99
/** 칸 이름 1~10글자, 로고 글 1~20글자 (앞뒤 빈칸을 뺀 글자 수, AC-5701.1·5701.2) */
const NAME_MAX = 10
const LOGO_TEXT_MAX = 20
/** 제어 글자 (AC-5701.1) */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
/** 처방 코드: 대문자로 바꾼 뒤 영문 대문자·숫자·한글·_ 1~16자 (AC-5701.3) */
const CODE = /^[0-9A-Z가-힣_]{1,16}$/
/** X-RAY 규칙(rule 참)에 드는 단순 촬영 코드 (ArrangeMap.XrayPattern과 같다) */
const XRAY_CODE = /^G[1-8][0-9]{3}([0-9]{3})?$/
/** 처음 이름과 추천 찾은 말 (AC-5713.3). 이름을 바꾼 칸·더한 칸은 그 칸 이름도 찾은 말이다 */
const FIRST_NAMES = { xray: 'X-RAY', sono: 'SONO', carm: 'C-ARM', pt: 'PT', ds: '도수', eswt: '충격파', trac: '견인' }
const REC_WORDS = { xray: ['촬영', 'X-RAY', 'XRAY', 'X-선'], sono: ['초음파', 'SONO'], carm: ['C-ARM', 'CARM', 'C ARM', '영상증폭'] }
/** 처음 설정 ③에서 보는 칸 (AC-5712.7) */
const SETUP_COLS = ['sono', 'carm']

/** 로고 그림 (design.md 5절): 20MB보다 큰 파일은 열지 않고, 가로 1200·세로 300 안으로 줄여 2MB 안으로 만든다 */
const BIG_BYTES = 20 * 1024 * 1024
const LOGO_BYTES = 2097152
const LOGO_BOX = { width: 1200, height: 300 }
const PNG_TRIES = [
  ['image/png', undefined],
  ['image/jpeg', 0.8],
  ['image/jpeg', 0.7],
]
const JPEG_TRIES = [
  ['image/jpeg', 0.9],
  ['image/jpeg', 0.8],
  ['image/jpeg', 0.7],
]

/** 설정 쪽마다 그린 상태: { doc, view, mark, pane, logoText, logoBad } (메모리에만) */
const pages = new WeakMap()

/** 창마다 다른 글 칸 id(코드 직접 넣기 label for) */
let sheetSeq = 0

// ---- 설정 쪽 -----------------------------------------------------------------------------------------

/**
 * 설정 쪽을 그린다(AC-5712.1).
 * @param {HTMLElement} host #app
 * @param {object | null} settings 설정 문서(읽는 중·못 읽음이면 null)
 * @param {object} [view]
 * @returns {HTMLElement} .page.settings-page
 */
export function renderSettings(host, settings, view = {}) {
  let page = host.querySelector(':scope > .page.settings-page')
  if (!page) {
    host.replaceChildren()
    page = el('div', { class: 'page settings-page' })
    host.appendChild(page)
  }
  let st = pages.get(page)
  if (!st) {
    st = { doc: null, view: {}, mark: null, pane: null, logoText: null, logoBad: false }
    pages.set(page, st)
  }
  const state = view.state === 'error' ? 'error' : view.state === 'reading' || !isDoc(settings) ? 'reading' : 'ok'
  const doc = state === 'ok' ? settings : null
  // 로고가 바뀐 문서가 오면(저장됨·다른 기기) 열어 둔 글 칸·적던 글을 내린다
  if (st.doc && doc && (st.doc.logo.mode !== doc.logo.mode || st.doc.logo.text !== doc.logo.text)) {
    st.pane = null
    st.logoText = null
    st.logoBad = false
  }
  st.doc = doc
  st.view = view
  const back = view.back === 'board' ? 'board' : 'arrange'
  const toast = view.toast && typeof view.toast.text === 'string' ? view.toast : null
  const mark = [doc, state, toast?.text ?? null, toast?.undo === true, view.logoPic?.ver ?? null, view.logoPic?.src ?? null, back]
  if (st.mark && st.mark.every((value, i) => value === mark[i])) return page
  st.mark = mark
  drawPage(page, st)
  return page
}

/** 처음 설정 셋을 다 했으면 setup.done 참인 사본, 아니면 받은 문서 그대로 (AC-5712.7) */
export function finishSetup(doc) {
  if (!isDoc(doc) || doc.setup.done) return doc
  if (!stepsOf(doc).every(Boolean)) return doc
  const next = copyOf(doc)
  next.setup.done = true
  return next
}

/** 쪽을 다시 그린다: 열린 창은 그대로 두고 머리·본문·띠만 바꾼 뒤 초점이 있던 자리(data-keep)에 초점을 돌린다 */
function drawPage(page, st) {
  const active = page.ownerDocument.activeElement
  const keep = active && page.contains(active) && !active.closest('.sheet-back') ? active.getAttribute('data-keep') : null
  const sheet = page.querySelector(':scope > .sheet-back.list-back')
  for (const child of [...page.children]) if (child !== sheet) child.remove()
  for (const node of [headOf(st), mainOf(page, st), toastOf(st)]) {
    if (!node) continue
    if (sheet) sheet.before(node)
    else page.appendChild(node)
  }
  if (keep) page.querySelector(`[data-keep="${keep}"]`)?.focus({ preventScroll: true })
}

function headOf(st) {
  const board = st.view.back === 'board'
  return el('header', { class: 'top set-top' }, [
    el('div', { class: 'top-row' }, [el('a', { class: 'back', href: board ? '#/' : '#/a' }, board ? '접수 현황' : '어레인지'), el('span', { class: 'conn' }, CONN)]),
    el('h1', { class: 'set-title' }, TITLE),
    el('p', { class: 'set-lead' }, LEAD),
  ])
}

function mainOf(page, st) {
  const main = el('main', { class: 'set-main' })
  if (st.view.state === 'error' && !st.doc) {
    main.appendChild(
      el('div', { class: 'set-fail' }, [
        el('span', { class: 'set-fail-t' }, READ_FAILED),
        el('button', { type: 'button', class: 'btn-line', on: { click: () => call(st.view.onReread) } }, REREAD),
      ]),
    )
    return main
  }
  if (!st.doc) return main
  const guide = guideOf(page, st)
  if (guide) main.appendChild(guide)
  main.appendChild(el('div', { class: 'set-left' }, [logoCard(page, st), tabCard(st)]))
  main.appendChild(colsCard(page, st))
  return main
}

/** 띠 (arrange.js toastOf와 같은 모양): 글 + ([되돌리기]) */
function toastOf(st) {
  const toast = st.view.toast
  if (!toast || typeof toast.text !== 'string') return null
  return el('div', { class: 'toast', role: 'status' }, [
    el('span', { class: 'toast-text' }, toast.text),
    toast.undo === true ? el('button', { type: 'button', class: 'toast-undo', on: { click: () => call(st.view.onUndo) } }, UNDO) : null,
  ])
}

/** 바로 저장: 셋 다 했으면 setup.done도 넣어 넘긴다(되돌리기 있음) */
function saveNow(st, next, text) {
  st.pane = null
  st.logoText = null
  st.logoBad = false
  if (typeof st.view.onSave === 'function') st.view.onSave(finishSetup(next), text, { undo: true })
}

// ---- 처음 설정 안내 (AC-5712.7) ----

/** 처음 설정 셋 [로고, 탭, SONO·C-ARM 처방]을 했는가 */
function stepsOf(doc) {
  const rx = !doc.tab || SETUP_COLS.every((k) => {
    const col = colOf(doc, k)
    return !col || !col.show || col.kind !== 'rx' || col.codes.length > 0
  })
  return [doc.setup.logo === true, doc.setup.tab === true, rx]
}

function guideOf(page, st) {
  const doc = st.doc
  if (doc.setup.done) return null
  const [logoDone, tabDone, rxDone] = stepsOf(doc)
  const counts = SETUP_COLS.map((k) => `${colOf(doc, k)?.name ?? FIRST_NAMES[k]} ${colOf(doc, k)?.codes.length ?? 0}개`).join(' · ')
  const pending = doc.tab ? SETUP_COLS.map((k) => colOf(doc, k)).filter((col) => col && col.show && col.kind === 'rx' && col.codes.length === 0) : []
  const steps = [
    {
      done: logoDone,
      t: STEP_LOGO,
      d: logoDone ? (STEP_LOGO_DONE[doc.logo.mode] ?? STEP_LOGO_D) : STEP_LOGO_D,
      acts: [el('button', { type: 'button', class: 'btn-line', on: { click: () => page.querySelector('.logo-card > .seg > button')?.focus() } }, STEP_LOGO_GO)],
    },
    {
      done: tabDone,
      t: STEP_TAB,
      d: tabDone ? (doc.tab ? STEP_TAB_ON : STEP_TAB_OFF) : STEP_TAB_D,
      acts: [
        el('button', { type: 'button', class: 'btn-ink', on: { click: () => setTab(st, true) } }, STEP_TAB_YES),
        el('button', { type: 'button', class: 'btn-line', on: { click: () => setTab(st, false) } }, STEP_TAB_NO),
      ],
    },
    {
      done: rxDone,
      t: STEP_RX,
      d: !doc.tab ? STEP_RX_SKIP : rxDone ? `${counts} 골랐어요` : `${STEP_RX_D}${counts}`,
      acts: pending.map((col) =>
        el('button', { type: 'button', class: 'btn-ink', on: { click: () => openColEditor(page, col.k, pageCtx(page, st, 'rx')) } }, `${col.name} 고르기`),
      ),
    },
  ]
  const n = steps.filter((step) => step.done).length
  return el('section', { class: 'set-card set-guide', 'aria-label': GUIDE_TITLE }, [
    el('div', { class: 'sg-head' }, [el('h2', null, GUIDE_TITLE), el('span', { class: 'sg-count' }, `${n}/${steps.length} ${GUIDE_OK}`)]),
    el('p', { class: 'set-sub' }, GUIDE_SUB),
    el(
      'ol',
      { class: 'sg-steps' },
      steps.map((step, i) =>
        el('li', { class: step.done ? 'sg-step done' : 'sg-step' }, [
          el('span', { class: 'sg-num', 'aria-hidden': 'true' }, step.done ? '✓' : String(i + 1)),
          el('span', { class: 'sg-t' }, [step.t, step.done ? el('span', { class: 'sg-ok' }, GUIDE_OK) : null]),
          el('span', { class: 'sg-d' }, step.d),
          !step.done && step.acts.length > 0 ? el('div', { class: 'sg-acts' }, step.acts) : null,
        ]),
      ),
    ),
  ])
}

// ---- 병원 로고 (AC-5712.2·5712.3) ----

function logoCard(page, st) {
  const doc = st.doc
  const shown = st.pane ?? doc.logo.mode
  const file = el('input', {
    type: 'file',
    class: 'logo-file',
    accept: 'image/png,image/jpeg',
    hidden: true,
    on: {
      change: (event) => {
        const chosen = event.target.files?.[0]
        if (chosen && typeof st.view.onLogoFile === 'function') st.view.onLogoFile(chosen)
        try {
          event.target.value = ''
        } catch {
          /* 고른 파일 값을 못 비우는 브라우저: 같은 파일을 다시 고르면 change가 안 올 뿐이다 */
        }
      },
    },
  })
  const seg = el(
    'div',
    { class: 'seg', role: 'group', 'aria-label': LOGO_TITLE },
    LOGO_MODES.map(([mode, label]) =>
      el('button', { type: 'button', 'aria-pressed': shown === mode ? 'true' : 'false', 'data-keep': `logo-${mode}`, on: { click: () => pickLogo(page, st, mode, file) } }, label),
    ),
  )
  return el('section', { class: 'set-card logo-card' }, [
    el('h2', null, LOGO_TITLE),
    el('p', { class: 'set-sub' }, LOGO_SUB),
    seg,
    el('div', { class: 'logo-pane' }, shown === 'pic' ? picPane(st, file) : shown === 'text' ? textPane(page, st) : nonePane()),
    file,
  ])
}

function picPane(st, file) {
  return [
    el('div', { class: 'logo-preview' }, logoOf(st.doc.logo, st.view.logoPic, 'lp-img')),
    el('div', { class: 'logo-acts' }, [
      el('button', { type: 'button', class: 'btn-line', 'data-keep': 'logo-again', on: { click: () => file.click() } }, PIC_AGAIN),
      el('span', { class: 'hint' }, PIC_HINT),
    ]),
  ]
}

function textPane(page, st) {
  const doc = st.doc
  const preview = el('div', { class: 'logo-preview' })
  const showText = (text) => preview.replaceChildren(...[logoOf({ mode: 'text', text: text.trim(), ver: doc.logo.ver }, null, 'lp-img')].filter(Boolean))
  const hint = el('div', { class: st.logoBad ? 'hint lp-hint is-bad' : 'hint lp-hint' }, TEXT_HINT)
  const input = el('input', {
    type: 'text',
    class: 'txt',
    maxlength: String(LOGO_TEXT_MAX),
    'aria-label': TEXT_LABEL,
    'data-keep': 'logo-name',
    on: {
      input: (event) => {
        st.logoText = event.target.value
        showText(event.target.value)
      },
    },
  })
  input.value = st.logoText ?? doc.logo.text ?? ''
  showText(input.value)
  const form = el(
    'form',
    {
      class: 'name-row',
      on: {
        submit: (event) => {
          event.preventDefault()
          const text = input.value.trim()
          if (!logoTextOk(text)) {
            st.logoBad = true
            hint.className = 'hint lp-hint is-bad'
            return
          }
          const next = copyOf(st.doc)
          next.logo = { mode: 'text', text, ver: st.doc.logo.ver }
          next.setup.logo = true
          saveNow(st, next, LOGO_TOAST)
        },
      },
    },
    [input, el('button', { type: 'submit', class: 'btn-ink', 'data-keep': 'logo-name-go' }, TEXT_GO)],
  )
  return [form, hint, preview]
}

function nonePane() {
  return [el('div', { class: 'logo-preview' }, el('span', { class: 'lp-none' }, NONE_PREVIEW)), el('div', { class: 'hint lp-hint' }, NONE_HINT)]
}

/**
 * [로고 그림]·[병원 이름 글자]·[없이] (AC-5712.2): 바꾸면 바로 저장(setup.logo 참). 이름이 없는 글자는 글 칸을 열고,
 * 그림 파일이 없는(ver 0) 그림은 그림 고르기를 연다. 이미 정한 것을 다시 누르면 보내지 않는다
 */
function pickLogo(page, st, mode, file) {
  const doc = st.doc
  if (mode === 'pic' && !(doc.logo.ver >= 1)) {
    file.click()
    return
  }
  if (mode === 'text' && !(typeof doc.logo.text === 'string' && doc.logo.text.trim() !== '')) {
    st.pane = 'text'
    st.logoText = st.logoText ?? ''
    drawPage(page, st)
    page.querySelector('.logo-card form.name-row > input')?.focus({ preventScroll: true })
    return
  }
  if (doc.logo.mode === mode && doc.setup.logo) {
    if (st.pane !== null) {
      st.pane = null
      drawPage(page, st)
    }
    return
  }
  const next = copyOf(doc)
  next.logo.mode = mode
  next.setup.logo = true
  saveNow(st, next, LOGO_TOAST)
}

/** 로고 글 규칙 (AC-5712.2·5701.1): 1~20글자. 글자 수는 PC(C#)처럼 UTF-16 단위(글의 length, maxlength와 같다)로 센다 */
function logoTextOk(text) {
  return text.length >= 1 && text.length <= LOGO_TEXT_MAX && !CONTROL.test(text)
}

// ---- 탭 (AC-5712.4) ----

function tabCard(st) {
  const on = st.doc.tab === true
  return el('section', { class: 'set-card tab-card' }, [
    el('h2', null, TAB_TITLE),
    el('p', { class: 'set-sub' }, TAB_SUB),
    el('div', { class: 'sw-row' }, [
      el('div', { class: 'sw-text' }, [el('div', { class: 'sw-name' }, TAB_NAME), el('div', { class: 'hint' }, TAB_HINT)]),
      el('button', { type: 'button', class: 'switch', 'aria-pressed': on ? 'true' : 'false', 'data-keep': 'tab', on: { click: () => setTab(st, !on) } }, [
        on ? '켜짐' : '꺼짐',
        el('span', { class: 'knob', 'aria-hidden': 'true' }),
      ]),
    ]),
  ])
}

/** 어레인지 탭 켜기·끄기(탭 묶음·안내 [써요]·[안 써요]): 바로 저장(setup.tab 참) */
function setTab(st, on) {
  const next = copyOf(st.doc)
  next.tab = on
  next.setup.tab = true
  saveNow(st, next, on ? TAB_ON : TAB_OFF)
}

// ---- 어레인지 칸 (AC-5712.5) ----

function colsCard(page, st) {
  const doc = st.doc
  const shown = doc.cols.filter((col) => col.show).length
  const rows = doc.cols.map((col, i) => {
    const lastShown = col.show && shown <= 1
    const cls = ['col-row', col.k === 'sono' || col.k === 'carm' ? `k-${col.k}` : null, col.show ? null : 'is-off'].filter(Boolean).join(' ')
    return el('li', { class: cls }, [
      el('div', { class: 'col-main' }, [
        el('div', { class: 'col-line' }, [
          el('span', { class: 'col-name' }, col.name),
          el('span', { class: col.kind === 'rx' ? 'kind rx' : 'kind mn' }, col.kind === 'rx' ? KIND_RX : KIND_MN),
          col.added ? el('span', { class: 'kind new' }, KIND_NEW) : null,
        ]),
        el('div', { class: 'col-sum' }, summaryOf(col, doc.picks)),
      ]),
      el(
        'button',
        {
          type: 'button',
          class: 'switch sm',
          'aria-pressed': col.show ? 'true' : 'false',
          'aria-label': `${col.name} 보이기`,
          disabled: lastShown,
          'data-keep': `show-${col.k}`,
          on: { click: () => showCol(st, col.k, lastShown) },
        },
        [col.show ? '보이기' : '숨김', el('span', { class: 'knob', 'aria-hidden': 'true' })],
      ),
      el('div', { class: 'col-move' }, [
        el('button', { type: 'button', class: 'lt-btn', 'aria-label': '위로', disabled: i === 0, 'data-keep': `up-${col.k}`, on: { click: () => moveCol(st, i, -1) } }, '▲'),
        el(
          'button',
          { type: 'button', class: 'lt-btn', 'aria-label': '아래로', disabled: i === doc.cols.length - 1, 'data-keep': `down-${col.k}`, on: { click: () => moveCol(st, i, 1) } },
          '▼',
        ),
      ]),
      el('button', { type: 'button', class: 'col-edit', 'data-keep': `edit-${col.k}`, on: { click: () => openColEditor(page, col.k, pageCtx(page, st)) } }, COL_EDIT),
    ])
  })
  return el('section', { class: 'set-card cols-card' }, [
    el('h2', null, COLS_TITLE),
    el('p', { class: 'set-sub' }, COLS_SUB),
    el('ul', { class: 'col-list' }, rows),
    el('button', { type: 'button', class: 'col-add', disabled: doc.cols.length >= COLS_MAX, 'data-keep': 'add', on: { click: () => openColAdder(page, pageCtx(page, st)) } }, COL_ADD),
  ])
}

/** 칸 줄 요약 글 (시안 summary): X-RAY는 규칙/처방 수, 처방 칸은 처방 수 · 단계, 직접 칸은 고르기 목록 */
function summaryOf(col, picks) {
  if (col.k === 'xray') return col.rule === true ? RULE_SUM : `처방 ${col.codes.length}개`
  if (col.kind === 'rx') return `처방 ${col.codes.length}개 · ${col.steps === 3 ? STEP3 : STEP2}`
  return listSummary(col.k, picks)
}

function showCol(st, k, locked) {
  if (locked) return
  const next = copyOf(st.doc)
  const col = colOf(next, k)
  col.show = !col.show
  saveNow(st, next, col.show ? `${col.name} 칸을 보이게 했어요` : `${col.name} 칸을 숨겼어요`)
}

function moveCol(st, i, by) {
  const to = i + by
  if (to < 0 || to >= st.doc.cols.length) return
  const next = copyOf(st.doc)
  next.cols.splice(to, 0, ...next.cols.splice(i, 1))
  saveNow(st, next, MOVED)
}

/** 설정 쪽에서 여는 창의 ctx: 문서는 쪽이 마지막으로 그린 것, 저장·읽기는 view의 것 */
function pageCtx(page, st, tab) {
  return {
    tab,
    back: null,
    doc: () => st.doc,
    onSave: (next, text, opts) => (typeof st.view.onSave === 'function' ? st.view.onSave(next, text, opts) : 'fail'),
    getCodes: () => (typeof st.view.getCodes === 'function' ? st.view.getCodes() : Promise.reject(new Error('codes'))),
    getCodeName: (code) => (typeof st.view.getCodeName === 'function' ? st.view.getCodeName(code) : Promise.resolve(null)),
  }
}

// ---- 칸 고치기 창 (AC-5713.1~5713.8·5713.10) -----------------------------------------------------------------------

/**
 * 칸 고치기 창을 연다. 이미 창이 열려 있으면 그 창을 둔다.
 * @param {HTMLElement} page 설정 쪽(.page.settings-page) 또는 어레인지 화면(.page.arrange)
 * @param {string} key 칸 열쇠
 * @param {object} ctx
 * @returns {HTMLElement | null} .sheet-back.list-back
 */
export function openColEditor(page, key, ctx) {
  const opened = page.querySelector(':scope > .sheet-back.list-back')
  if (opened) return opened
  const doc = ctx.doc()
  const col = isDoc(doc) ? colOf(doc, key) : null
  if (!col) return null
  const xray = key === 'xray'
  const seq = (sheetSeq += 1)
  const d = {
    kind: col.kind,
    steps: col.steps,
    rule: col.rule === true,
    codes: [...col.codes],
    picks: copyOf(doc.picks),
    tab: ctx.tab ?? (col.kind === 'rx' ? 'rx' : 'list'),
    list: null,
    names: new Map(),
    find: '',
    entry: '',
    msg: null,
    saving: false,
    ui: { typed: {}, rename: null, draw: (focus) => drawBody(focus) },
  }
  /** 넣을 처방 탭의 바뀌는 곳 */
  const rx = { rule: null, hint: null, list: null, msg: null, entry: null }

  const sheet = el('div', { class: 'sheet list-sheet col-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${col.name} 칸 고치기`, tabindex: '-1' })
  const back = el('div', { class: 'sheet-back list-back', on: { click: (event) => event.target === event.currentTarget && close(), keydown: (event) => event.key === 'Escape' && close() } }, sheet)
  const sub = el('span', { class: 'sheet-sub' })
  const nameInput = el('input', { type: 'text', class: 'txt', maxlength: String(NAME_MAX), 'aria-label': '칸 이름', on: { input: () => drawGo() } })
  nameInput.value = col.name
  const hint = el('span', { class: 'cf-hint hint' }, NAME_HINT)
  const kindSeg = segOf('종류', [
    ['mn', KIND_MN],
    ['rx', KIND_RX],
  ], () => d.kind, (kind) => {
    d.kind = kind
    drawHead()
    drawTabs()
    drawBody()
  })
  const stepSeg = segOf('단계', [
    [2, STEP2],
    [3, STEP3],
  ], () => d.steps, (steps) => {
    d.steps = steps
  })
  const tabs = el('div', { class: 'lt-tabs' })
  const body = el('div', { class: 'col-body' })
  const go = el('button', { type: 'button', class: col.added ? 'go short' : 'go', on: { click: save } }, SAVE)
  sheet.append(
    el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, `${col.name} 칸 고치기`), sub]),
    el('div', { class: 'cf' }, [el('span', { class: 'cf-l' }, '이름'), nameInput, hint, el('span', { class: 'cf-l' }, '종류'), kindSeg, el('span', { class: 'cf-l' }, '단계'), stepSeg]),
    tabs,
    body,
    el('p', { class: 'lt-foot-note' }, ctx.back === 'sheet' ? FOOT_SHEET : FOOT),
    el('div', { class: 'sheet-go' }, [
      col.added ? el('button', { type: 'button', class: 'del-col', on: { click: dropCol } }, DROP_COL) : null,
      el('button', { type: 'button', class: 'sheet-close', on: { click: close } }, CANCEL),
      go,
    ]),
  )

  function drawHead() {
    sub.textContent = d.kind === 'rx' ? RX_SUB : MN_SUB
  }

  /** 탭 [넣을 처방 · N개](처방 칸만) [고르기 목록](목록이 있는 칸만). 고른 탭이 없어지면 첫 탭, 탭이 없으면 탭 줄도 없다 */
  function tabList() {
    const list = []
    if (d.kind === 'rx') list.push(['rx', `넣을 처방 · ${xray && d.rule ? '전부' : `${d.codes.length}개`}`])
    if (hasList(key)) list.push(['list', LIST_TAB])
    return list
  }

  function drawTabs() {
    const list = tabList()
    if (!list.some(([k]) => k === d.tab)) d.tab = list[0]?.[0] ?? null
    const active = page.ownerDocument.activeElement
    const focused = active && tabs.contains(active) ? active.getAttribute('data-tab') : null
    tabs.replaceChildren(
      ...list.map(([k, label]) =>
        el('button', { type: 'button', class: k === d.tab ? 'lt-tab on' : 'lt-tab', 'aria-pressed': k === d.tab ? 'true' : 'false', 'data-tab': k, on: { click: () => pickTab(k) } }, label),
      ),
    )
    if (list.length === 0) tabs.remove()
    else if (!tabs.isConnected || tabs.parentNode !== sheet) body.before(tabs)
    if (focused) tabs.querySelector(`[data-tab="${focused}"]`)?.focus({ preventScroll: true })
  }

  function pickTab(k) {
    d.tab = k
    d.ui.rename = null
    if (k === 'rx' && d.list === 'error') d.list = null
    drawTabs()
    drawBody()
    tabs.querySelector(`[data-tab="${k}"]`)?.focus({ preventScroll: true })
  }

  /** 탭 몸을 다시 그린다(창 세로 위치는 그대로). focus는 고르기 목록의 초점 자리(picks.js) */
  function drawBody(focus) {
    const top = sheet.scrollTop
    if (d.tab === 'rx') body.replaceChildren(...rxBody())
    else if (d.tab === 'list') body.replaceChildren(...listEditor(key, d.picks, d.ui))
    else body.replaceChildren(el('p', { class: 'hint' }, NO_TABS))
    sheet.scrollTop = top
    if (focus) listFocus(sheet, focus)
  }

  /** [저장]: 이름이 맞지 않으면 꺼진다. 기다리는 동안도 꺼진다 */
  function drawGo() {
    const ok = nameOk(nameInput.value, ctx, key)
    hint.className = ok ? 'cf-hint hint' : 'cf-hint hint is-bad'
    go.disabled = d.saving || !ok
  }

  // ---- 넣을 처방 탭 (AC-5713.2~5713.6) ----

  function rxBody() {
    if (d.list === null) readCodes()
    rx.rule = xray
      ? el(
          'div',
          { class: 'rx-rule', role: 'checkbox', 'aria-checked': 'true', tabindex: '0', on: { click: flipRule, keydown: (event) => pressed(event) && flipRule() } },
          [el('span', { class: 'box', 'aria-hidden': 'true' }), el('span', { class: 'rr-t' }, RULE_T), el('span', { class: 'rr-d' }, RULE_D)],
        )
      : null
    const find = el('input', {
      type: 'search',
      class: 'txt',
      placeholder: FIND_HOLDER,
      'aria-label': FIND_LABEL,
      on: {
        input: (event) => {
          d.find = event.target.value
          drawList()
        },
      },
    })
    find.value = d.find
    rx.hint = el('span', { class: 'hint' })
    rx.list = el('ul', { class: 'rx-list' })
    const id = `rd-in-${seq}`
    rx.entry = el('input', {
      type: 'text',
      class: 'txt',
      id,
      maxlength: '16',
      placeholder: DIRECT_HOLDER,
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-describedby': `rd-msg-${seq}`,
      on: {
        input: (event) => {
          d.entry = event.target.value
        },
      },
    })
    rx.entry.value = d.entry
    rx.msg = el('p', { class: 'rd-msg', role: 'status', id: `rd-msg-${seq}` })
    const form = el(
      'form',
      {
        class: 'rx-direct',
        on: {
          submit: (event) => {
            event.preventDefault()
            direct()
          },
        },
      },
      [el('label', { class: 'rd-t', for: id }, DIRECT_T), el('div', { class: 'rd-row' }, [rx.entry, el('button', { type: 'submit', class: 'btn-ink' }, DIRECT_GO)]), rx.msg],
    )
    drawRx()
    return [rx.rule, el('div', { class: 'rx-tools' }, [find, rx.hint]), rx.list, form, el('p', { class: 'hint rx-note' }, RX_NOTE)].filter(Boolean)
  }

  /** 규칙 상자·안내 글(고른 것 N개)·목록·직접 넣기 글을 초안대로 */
  function drawRx(focusCode) {
    if (rx.rule) {
      rx.rule.className = d.rule ? 'rx-rule' : 'rx-rule off'
      rx.rule.setAttribute('aria-checked', d.rule ? 'true' : 'false')
      rx.rule.firstChild.textContent = d.rule ? '✓' : ''
    }
    const n = d.codes.length
    rx.hint.replaceChildren(TOOLS_HEAD, el('b', null, xray && d.rule ? `단순 촬영 코드 전부 + 따로 고른 것 ${n}개` : `고른 것 ${n}개`))
    rx.msg.className = d.msg?.bad ? 'rd-msg bad' : 'rd-msg'
    rx.msg.textContent = d.msg?.text ?? DIRECT_HINT
    drawList(focusCode)
  }

  /** 목록 ul만 다시 그린다(찾기 칸·직접 넣기 칸은 그대로). 초점이 있던 줄(또는 focusCode 줄)에 초점을 돌린다 */
  function drawList(focusCode) {
    if (!rx.list) return
    const active = page.ownerDocument.activeElement
    const code = focusCode ?? (active && rx.list.contains(active) ? active.getAttribute('data-code') : null)
    const top = rx.list.scrollTop
    rx.list.replaceChildren(...rxItems())
    rx.list.scrollTop = top
    if (code) [...rx.list.children].find((li) => li.getAttribute('data-code') === code)?.focus({ preventScroll: true })
  }

  /** 세 무리: 직접 넣은 코드(30일 목록에 없는 초안 codes) → 추천(찾은 말) → 다른 처방(많이 쓴 순). 찾기 글이 있으면 코드·이름에 든 줄만 */
  function rxItems() {
    const none = (text) => [el('li', { class: 'rx-none' }, text)]
    if (d.list === null || d.list === 'reading') return none(CODES_READING)
    if (d.list === 'error') return none(CODES_FAILED)
    const listed = new Set(d.list.map((row) => row.c))
    const typed = d.codes.filter((c) => !listed.has(c))
    if (d.list.length === 0 && typed.length === 0) return none(CODES_EMPTY)
    const q = d.find.trim().toLowerCase()
    const match = (row) => q === '' || row.c.toLowerCase().includes(q) || (row.n ?? '').toLowerCase().includes(q)
    const words = recWords(col, key)
    const upper = words.map((w) => w.toUpperCase())
    const isRec = (row) => upper.some((w) => row.c.toUpperCase().includes(w) || (row.n ?? '').toUpperCase().includes(w))
    const typedRows = typed.map((c) => ({ c, n: d.names.get(c) ?? null, v: null })).filter(match)
    const recRows = d.list.filter((row) => isRec(row) && match(row))
    const restRows = d.list.filter((row) => !isRec(row) && match(row))
    const items = []
    if (typedRows.length > 0) items.push(groupHead(GROUP_TYPED, GROUP_TYPED_SM), ...typedRows.map((row) => rxRow(row, 'typed')))
    if (recRows.length > 0) items.push(groupHead(GROUP_REC, `찾은 말 ${words.join('·')}`), ...recRows.map((row) => rxRow(row, 'rec')))
    if (restRows.length > 0) items.push(groupHead(items.length > 0 ? GROUP_REST : GROUP_ALL, GROUP_REST_SM), ...restRows.map((row) => rxRow(row, null)))
    return items.length > 0 ? items : none(NO_MATCH)
  }

  /** 처방 줄 하나: 체크 상자 · 코드 · 이름(+ 이름표) · N명. X-RAY 규칙에 드는 줄은 회색 체크이고 바꿀 수 없다 */
  function rxRow(row, tag) {
    const typed = tag === 'typed'
    const ruled = !typed && xray && d.rule && XRAY_CODE.test(row.c)
    const on = ruled || d.codes.includes(row.c)
    const press = () => toggle(row.c, ruled)
    return el(
      'li',
      {
        class: `rx-row${on ? ' on' : ''}${ruled ? ' ruled' : ''}`,
        role: 'checkbox',
        'aria-checked': on ? 'true' : 'false',
        'aria-disabled': ruled ? 'true' : null,
        tabindex: '0',
        'data-code': row.c,
        on: { click: press, keydown: (event) => pressed(event) && press() },
      },
      [
        el('span', { class: 'box', 'aria-hidden': 'true' }, on ? '✓' : null),
        el('code', null, row.c),
        el('span', { class: 'rx-n' }, [
          typeof row.n === 'string' && row.n !== '' ? row.n : NO_NAME,
          tag === 'rec' ? el('span', { class: 'also rec' }, GROUP_REC) : null,
          typed ? el('span', { class: 'also typed' }, BADGE_TYPED) : null,
          ruled ? el('span', { class: 'also rule' }, BADGE_RULE) : null,
          typed ? null : othersOf(row.c),
        ]),
        el('span', { class: 'rx-v' }, typed ? '' : `${row.v}명`),
      ],
    )
  }

  /** 다른 처방 칸(최신 문서)에도 든 코드면 "{칸}에도 넣음" (X-RAY는 규칙에 드는 코드도) */
  function othersOf(code) {
    const latest = ctx.doc()
    const cols = isDoc(latest) ? latest.cols : []
    return cols
      .filter((o) => o.k !== key && o.kind === 'rx' && ((o.k === 'xray' && o.rule === true && XRAY_CODE.test(code)) || o.codes.includes(code)))
      .map((o) => el('span', { class: o.k === 'xray' ? 'also rule' : o.k === 'sono' ? 'also sono' : 'also' }, `${o.name}에도 넣음`))
  }

  function toggle(code, ruled) {
    if (ruled) return
    const at = d.codes.indexOf(code)
    if (at >= 0) d.codes.splice(at, 1)
    else if (d.codes.length < CODES_MAX) d.codes.push(code)
    else return
    drawRx(code)
    drawTabs()
  }

  function flipRule() {
    d.rule = !d.rule
    drawRx()
    drawTabs()
  }

  /** 코드 직접 넣기 [넣기] (AC-5713.5) */
  function direct() {
    const raw = rx.entry.value
    d.entry = raw
    const code = raw.trim().toUpperCase()
    if (!CODE.test(code)) d.msg = { bad: true, text: DIRECT_BAD }
    else if (d.codes.includes(code) || (xray && d.rule && XRAY_CODE.test(code))) d.msg = { bad: true, text: DIRECT_SAME }
    else if (d.codes.length >= CODES_MAX) return
    else {
      const listed = Array.isArray(d.list) && d.list.some((row) => row.c === code)
      d.codes.push(code)
      if (!listed) askName(code)
      d.msg = { bad: false, text: listed ? DIRECT_LISTED : DIRECT_ADDED }
      d.entry = ''
      rx.entry.value = ''
      drawTabs()
    }
    drawRx()
  }

  /** 지난 30일 처방 목록: 창마다 한 번 읽는다(못 읽었으면 탭을 다시 열 때 한 번 더). 읽으면 직접 넣은 코드 이름을 묻는다 */
  function readCodes() {
    d.list = 'reading'
    let asked
    try {
      asked = Promise.resolve(ctx.getCodes())
    } catch (error) {
      asked = Promise.reject(error)
    }
    asked.then(
      (list) => {
        d.list = Array.isArray(list) ? list.filter((row) => row && typeof row.c === 'string') : []
        const listed = new Set(d.list.map((row) => row.c))
        for (const c of d.codes) if (!listed.has(c)) askName(c)
        if (back.isConnected && d.tab === 'rx') drawList()
      },
      () => {
        d.list = 'error'
        if (back.isConnected && d.tab === 'rx') drawList()
      },
    )
  }

  /** 직접 넣은 코드의 사전 이름: 코드마다 한 번 묻는다. 없거나 못 읽으면 "(이름 없음)" */
  function askName(code) {
    if (d.names.has(code)) return
    d.names.set(code, null)
    let asked
    try {
      asked = Promise.resolve(ctx.getCodeName(code))
    } catch {
      asked = Promise.resolve(null)
    }
    asked
      .then(
        (name) => (typeof name === 'string' ? name : null),
        () => null,
      )
      .then((name) => {
        d.names.set(code, name)
        if (back.isConnected && d.tab === 'rx') drawList()
      })
  }

  // ---- 저장·빼기·닫기 ----

  /** [저장] (AC-5713.1): 최신 문서에 이 칸(이름·종류·단계·codes·rule·목록)만 바꿔 넘긴다. 'ok'면 닫는다 */
  function save() {
    if (d.saving) return
    if (!nameOk(nameInput.value, ctx, key)) {
      drawGo()
      return
    }
    const latest = ctx.doc()
    if (!isDoc(latest) || !colOf(latest, key)) return
    const next = copyOf(latest)
    const target = colOf(next, key)
    target.name = nameInput.value.trim()
    target.kind = d.kind
    target.steps = d.steps
    target.codes = [...d.codes]
    if (xray) target.rule = d.rule
    if (hasList(key)) {
      if (target.added) next.picks.extra = { ...next.picks.extra, [key]: [...(d.picks.extra?.[key] ?? [])] }
      else next.picks[key] = copyOf(d.picks[key])
    }
    d.saving = true
    drawGo()
    settleSave(ctx.onSave, [next, `${target.name} 칸을 저장했어요`, { undo: false }]).then((result) => {
      d.saving = false
      if (!back.isConnected) return
      if (result === 'ok') close()
      else drawGo()
    })
  }

  /** [이 칸 빼기] (AC-5713.8): 그 칸과 picks.extra 목록을 뺀 문서를 바로 저장(되돌리기 있음)하고 닫는다 */
  function dropCol() {
    const latest = ctx.doc()
    if (!isDoc(latest)) return
    const next = copyOf(latest)
    const name = colOf(latest, key)?.name ?? col.name
    next.cols = next.cols.filter((c) => c.k !== key)
    if (next.picks.extra) delete next.picks.extra[key]
    settleSave(ctx.onSave, [next, `${name} 칸을 뺐어요`, { undo: true }])
    close()
  }

  function close() {
    if (!back.isConnected) return
    back.remove()
    const target = page.querySelector(`[data-keep="edit-${key}"]`) ?? page.querySelector(':scope > .sheet-back:not(.list-back) button.pick-edit') ?? page.querySelector('[data-keep="add"]')
    target?.focus({ preventScroll: true })
  }

  drawHead()
  drawTabs()
  drawBody()
  drawGo()
  page.appendChild(back)
  sheet.focus({ preventScroll: true })
  return back
}

/** 셋 가운데 하나 고르기(종류·단계): 누르면 set 뒤 눌림 표시를 바꾼다(단추는 그대로라 초점이 남는다) */
function segOf(label, options, get, set) {
  const buttons = options.map(([value, text]) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': get() === value ? 'true' : 'false',
        on: {
          click: (event) => {
            set(value)
            paint()
            event.currentTarget.focus({ preventScroll: true })
          },
        },
      },
      text,
    ),
  )
  const paint = () => options.forEach(([value], i) => buttons[i].setAttribute('aria-pressed', get() === value ? 'true' : 'false'))
  return el('div', { class: 'seg', role: 'group', 'aria-label': label }, buttons)
}

/** 처방 목록 무리 머리 줄(고를 수 없는 줄) */
function groupHead(text, small) {
  return el('li', { class: 'rx-gh', role: 'presentation' }, [text, el('span', { class: 'sm' }, small)])
}

/** 추천 찾은 말: 칸마다 정한 말 + 처음 이름과 다른(또는 더한) 칸 이름 (AC-5713.3) */
function recWords(col, key) {
  const words = [...(REC_WORDS[key] ?? [])]
  const name = typeof col.name === 'string' ? col.name.trim() : ''
  if (name !== '' && (col.added || name !== FIRST_NAMES[key]) && !words.includes(name)) words.push(name)
  return words
}

/**
 * 칸 이름 규칙 (AC-5713.1): 앞뒤 빈칸을 뺀 1~10글자, "|"·제어 글자 없음, 다른 칸 이름과 겹침 없음(자기 이름은 된다).
 * 글자 수는 PC(C#, PickLists.CleanText)처럼 UTF-16 단위(글의 length, maxlength와 같다)로 센다
 */
function nameOk(raw, ctx, key) {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length < 1 || name.length > NAME_MAX || name.includes('|') || CONTROL.test(name)) return false
  const latest = ctx.doc()
  return !(isDoc(latest) ? latest.cols : []).some((c) => c.k !== key && typeof c.name === 'string' && c.name.trim() === name)
}

// ---- 칸 더하기 창 (AC-5713.9) -----------------------------------------------------------------------------

/**
 * 칸 더하기 창을 연다. 칸이 12개면 열지 않는다.
 * @param {HTMLElement} page
 * @param {object} ctx
 * @returns {HTMLElement | null}
 */
export function openColAdder(page, ctx) {
  const opened = page.querySelector(':scope > .sheet-back.list-back')
  if (opened) return opened
  const doc = ctx.doc()
  if (!isDoc(doc) || doc.cols.length >= COLS_MAX) return null
  const d = { kind: 'rx', steps: 2, saving: false }
  const sheet = el('div', { class: 'sheet list-sheet col-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': ADD_TITLE, tabindex: '-1' })
  const back = el('div', { class: 'sheet-back list-back', on: { click: (event) => event.target === event.currentTarget && close(), keydown: (event) => event.key === 'Escape' && close() } }, sheet)
  const input = el('input', { type: 'text', class: 'txt', placeholder: ADD_HOLDER, maxlength: String(NAME_MAX), 'aria-label': '칸 이름', on: { input: () => drawGo() } })
  const hint = el('span', { class: 'cf-hint hint' }, NAME_HINT)
  const foot = el('p', { class: 'lt-foot-note' })
  const cardButtons = KIND_CARDS.map(([kind, title, text]) =>
    el(
      'button',
      {
        type: 'button',
        'aria-pressed': 'false',
        on: {
          click: (event) => {
            d.kind = kind
            drawKind()
            event.currentTarget.focus({ preventScroll: true })
          },
        },
      },
      [el('span', { class: 'kc-t' }, title), el('span', { class: 'kc-d' }, text)],
    ),
  )
  const go = el('button', { type: 'button', class: 'go', on: { click: add } }, ADD_GO)
  sheet.append(
    el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, ADD_TITLE), el('span', { class: 'sheet-sub' }, ADD_SUB)]),
    el('div', { class: 'cf' }, [
      el('span', { class: 'cf-l' }, '이름'),
      input,
      hint,
      el('span', { class: 'cf-l' }, '종류'),
      el('div', { class: 'kind-cards', role: 'group', 'aria-label': '종류' }, cardButtons),
      el('span', { class: 'cf-l' }, '단계'),
      segOf('단계', [
        [2, STEP2],
        [3, STEP3],
      ], () => d.steps, (steps) => {
        d.steps = steps
      }),
    ]),
    foot,
    el('div', { class: 'sheet-go' }, [el('button', { type: 'button', class: 'sheet-close', on: { click: close } }, CANCEL), go]),
  )

  function drawKind() {
    KIND_CARDS.forEach(([kind], i) => cardButtons[i].setAttribute('aria-pressed', d.kind === kind ? 'true' : 'false'))
    foot.textContent = d.kind === 'rx' ? ADD_FOOT_RX : ADD_FOOT_MN
  }

  /** [더하기]는 이름이 비거나 규칙에 맞지 않으면 꺼진다. 안내 글은 적은 글이 규칙에 맞지 않을 때만 빨갛다 */
  function drawGo() {
    const ok = nameOk(input.value, ctx, null)
    hint.className = ok || input.value === '' ? 'cf-hint hint' : 'cf-hint hint is-bad'
    go.disabled = d.saving || !ok
  }

  function add() {
    if (d.saving || !nameOk(input.value, ctx, null)) return
    const latest = ctx.doc()
    if (!isDoc(latest) || latest.cols.length >= COLS_MAX || latest.nextX > ADDED_MAX) return
    const next = copyOf(latest)
    const k = `x${next.nextX}`
    const name = input.value.trim()
    next.nextX += 1
    next.cols.push({ k, name, kind: d.kind, steps: d.steps, show: true, added: true, codes: [] })
    next.picks.extra = { ...next.picks.extra, [k]: [] }
    d.saving = true
    drawGo()
    settleSave(ctx.onSave, [next, `${name} 칸을 더했어요`, { undo: false }]).then((result) => {
      d.saving = false
      if (!back.isConnected) return
      if (result === 'ok') close()
      else drawGo()
    })
  }

  function close() {
    if (!back.isConnected) return
    back.remove()
    page.querySelector('[data-keep="add"]')?.focus({ preventScroll: true })
  }

  drawKind()
  drawGo()
  page.appendChild(back)
  sheet.focus({ preventScroll: true })
  return back
}

// ---- 로고 줄이기 (AC-5712.3, design.md 5절) -------------------------------------------------------------------

/**
 * 고른 그림 파일을 이 기기 브라우저가 열어 줄이고 다시 만든다.
 * @param {Blob} file
 * @returns {Promise<{ bytes: Uint8Array, type: string, url: string }>} big(20MB 넘음)·open(열 수 없음·2MB 안으로 못 만듦)이면 Error
 */
export function shrinkLogo(file) {
  if (!file || typeof file.size !== 'number') return Promise.reject(new Error('open'))
  if (file.size > BIG_BYTES) return Promise.reject(new Error('big'))
  const tries = file.type === 'image/png' ? PNG_TRIES : JPEG_TRIES
  return openPicture(file).then(async (picture) => {
    try {
      const { width, height } = picture
      if (!(width > 0 && height > 0)) throw new Error('open')
      const scale = Math.min(LOGO_BOX.width / width, LOGO_BOX.height / height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('open')
      let painted = null
      for (const [type, quality] of tries) {
        if (painted !== type) {
          paintPicture(ctx, canvas, picture.source, type)
          painted = type
        }
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, quality))
        if (!blob || blob.size === 0 || blob.size > LOGO_BYTES || (blob.type !== '' && blob.type !== type)) continue
        return { bytes: await bytesOfBlob(blob), type, url: canvas.toDataURL(type, quality) }
      }
      throw new Error('open')
    } finally {
      picture.close()
    }
  })
}

/** 그림을 연다: createImageBitmap(EXIF 방향 그대로), 없으면 data: URL 그림 요소(PNG·JPEG만, board.js logoOf). 못 열면 open */
function openPicture(file) {
  if (typeof createImageBitmap === 'function')
    return Promise.resolve()
      .then(() => createImageBitmap(file))
      .then(
        (bitmap) => ({ source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() }),
        () => {
          throw new Error('open')
        },
      )
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('open'))
    reader.onload = () => {
      const img = logoOf({ mode: 'pic', ver: 1 }, { ver: 1, src: String(reader.result) }, 'lp-img')
      if (!img) {
        reject(new Error('open'))
        return
      }
      img.addEventListener('load', () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }))
      img.addEventListener('error', () => reject(new Error('open')))
    }
    reader.readAsDataURL(file)
  })
}

/** 캔버스에 그림을 그린다. JPEG는 투명한 곳이 검게 되지 않게 바탕(--surface)을 먼저 칠한다 */
function paintPicture(ctx, canvas, source, type) {
  if (type === 'image/jpeg') {
    const ground = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
    if (ground !== '') {
      ctx.fillStyle = ground
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
}

function bytesOfBlob(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('open'))
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.readAsArrayBuffer(blob)
  })
}

// ---- 작은 도구 -------------------------------------------------------------------------------------------

/** 설정 문서 모양(그리기에 드는 만큼) */
function isDoc(doc) {
  return (
    typeof doc === 'object' &&
    doc !== null &&
    typeof doc.logo === 'object' &&
    doc.logo !== null &&
    typeof doc.setup === 'object' &&
    doc.setup !== null &&
    Array.isArray(doc.cols) &&
    typeof doc.picks === 'object' &&
    doc.picks !== null
  )
}

function colOf(doc, k) {
  return doc.cols.find((col) => col.k === k) ?? null
}

/** 설정 문서 사본(JSON 값만이라 JSON으로 옮긴다) */
function copyOf(value) {
  return JSON.parse(JSON.stringify(value))
}

/** onSave를 부르고 그 끝('ok'·'conflict'·'fail')을 돌려준다. 던지거나 거절하면 'fail' */
function settleSave(onSave, args) {
  let result
  try {
    result = typeof onSave === 'function' ? onSave(...args) : 'fail'
  } catch {
    result = 'fail'
  }
  return Promise.resolve(result).then(
    (value) => value,
    () => 'fail',
  )
}

/** Space·Enter (체크 줄·규칙 상자) */
function pressed(event) {
  if (event.key !== ' ' && event.key !== 'Enter') return false
  event.preventDefault()
  return true
}

function call(fn) {
  if (typeof fn === 'function') fn()
}
