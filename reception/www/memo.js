// 어레인지 메모 (reception-memo-papers design.md 3절, REQ-3403·3405, 승인 시안 docs/mockups/reception-memo-papers/Mock.html setupMemo).
// 어레인지 탭 머리의 메모 칸과 크게 여는 창. class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 메모는 이 기기 localStorage 열쇠 reception-memo 하나에 { v: 1, text, ink: PNG data URL | null }만 둔다. 글도 그림도 없으면 열쇠를 지운다.
//   서버로 보내지 않는다(이 파일은 dom.js만 불러오고 묻지 않는다, AC-3405.2). 화면 파일 가운데 이 파일만 localStorage를 쓴다(ESLint 울타리, AC-3405.1)
// - 저장소를 못 쓰거나(막힘·꽉 참) 읽은 값 모양이 틀리면 빈 메모로 보고 멈추지 않는다. 저장하지 못하면 띠로 알린다(AC-3403.5)
// - 큰 창과 띠는 document.body에 붙인다: 판을 저절로 다시 그려도(#app 안을 바꿈) 지워지지 않는다(AC-3403.4)
// - 손글씨는 <canvas>에 그려 toDataURL('image/png')로 담는다. 굵기는 펜 압력, 색은 theme.css --memo-ink·--memo-red를 읽어 쓴다(AC-3403.6)
// - 메모 글은 글 마디로만 넣는다. 작은 그림은 모양을 검사한 PNG data URL만 img에 넣는다(CSP img-src 'self' data:)
//
// 쓰는 법
//   memoBox()    머리 메모 칸 요소(board.js topOf가 어레인지 탭일 때 로고 뒤에 넣는다). 부를 때마다 저장된 메모를 읽어 그린다
//   openMemo()   큰 창을 연다(칸을 누름). 이미 열려 있으면 그 창
//   closeMemo()  열린 창을 저장하고 닫고 메모 띠를 내린다(app.js가 숨김·끊김으로 화면을 지울 때)

import { el, svg } from './dom.js'

/** 저장 열쇠 (AC-3403.3) */
const KEY = 'reception-memo'

/** 받는 그림: PNG data URL만 */
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

/** 띠가 보이는 시간 (AC-3403.4) */
const TOAST_MS = 5000

const REMOVED = '메모를 지웠어요'
const SAVE_FAILED = '메모를 이 기기에 저장하지 못했어요'
const EMPTY = '메모 쓰기 · 펜이나 글자로'
const INK_ONLY = '손글씨 메모'

/** 펜 굵기: 가장 가는 굵기 + 압력(0~1) × 폭. 압력을 모르는 손가락·마우스는 중간(0.5). 지우개는 굵게 */
const PEN_MIN = 1.4
const PEN_SPAN = 3.2
const PRESSURE = 0.5
const ERASER = 26

/** 펜 도구: [열쇠, 글, 색 토큰(없으면 지우개)] */
const TOOLS = [
  ['ink', '검정', '--memo-ink'],
  ['red', '빨강', '--memo-red'],
  ['erase', '지우개', null],
]

/** 열린 큰 창 { node, finish(alert) } | null */
let opened = null
/** 보이는 메모 띠와 그 시계 */
let band = null
let bandTimer = null
/** 마지막으로 만든 머리 칸과 그때 읽은 저장 글 */
let lastBox = null
let lastRaw = null

// ---- 저장소 ---------------------------------------------------------------------------------------

/** 저장된 글. 없거나 못 읽으면 null */
function readRaw() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** 저장된 메모 { text, ink } | null. 못 읽거나 모양이 틀리면 null */
function readMemo() {
  return parse(readRaw())
}

/** 저장 글의 모양 검사: { v: 1, text: 글, ink: PNG data URL | null } 세 칸뿐 */
function parse(raw) {
  if (typeof raw !== 'string') return null
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (Object.keys(value).sort().join(',') !== 'ink,text,v') return null
  if (value.v !== 1 || typeof value.text !== 'string') return null
  if (value.ink !== null && !(typeof value.ink === 'string' && PNG.test(value.ink))) return null
  return hasContent(value.text, value.ink) ? { text: value.text, ink: value.ink } : null
}

/** 메모를 저장한다(null이면 열쇠를 지운다). 못 쓰면 false */
function writeMemo(memo) {
  try {
    if (memo === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ v: 1, text: memo.text, ink: memo.ink }))
    return true
  } catch {
    return false
  }
}

function hasContent(text, ink) {
  return text.trim() !== '' || ink !== null
}

function sameMemo(a, b) {
  return a === b || (a !== null && b !== null && a.text === b.text && a.ink === b.ink)
}

// ---- 머리 칸 ---------------------------------------------------------------------------------------

/**
 * 머리 메모 칸 (AC-3403.1). 없으면 점선 "메모 쓰기 · 펜이나 글자로", 있으면 빨간 칸에 [메모]·글 첫 줄(글이 없으면 "손글씨 메모")·
 * 손글씨 작은 그림·[✕]. 누르면(Enter·Space 포함) 큰 창. 저장 글이 지난번과 같으면 그 칸을 그대로 돌려준다
 * (판을 저절로 다시 그릴 때마다 작은 그림을 새로 읽어 깜빡이지 않게)
 * @returns {HTMLElement}
 */
export function memoBox() {
  const raw = readRaw()
  if (lastBox !== null && raw === lastRaw) return lastBox
  lastRaw = raw
  lastBox = buildBox(parse(raw))
  return lastBox
}

function buildBox(memo) {
  const attrs = {
    class: memo ? 'memo-box has' : 'memo-box',
    role: 'button',
    tabindex: '0',
    on: {
      click: () => openMemo(),
      keydown: (event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        openMemo()
      },
    },
  }
  if (!memo) return el('div', attrs, [penIcon(), el('span', { class: 'memo-empty' }, EMPTY)])
  return el('div', attrs, [
    el('span', { class: 'memo-tag' }, '메모'),
    el('span', { class: 'memo-prev' }, memo.text.trim().split('\n')[0] || INK_ONLY),
    memo.ink ? thumbOf(memo.ink) : null,
    el(
      'button',
      {
        type: 'button',
        class: 'memo-x',
        'aria-label': '메모 지우기',
        on: {
          click: (event) => {
            event.stopPropagation()
            removeMemo(memo)
          },
          keydown: (event) => event.stopPropagation(),
        },
      },
      '✕',
    ),
  ])
}

/** 손글씨 작은 그림. 주소는 모양을 검사한 PNG data URL이라 el()의 같은 PC 주소 검사 대신 여기서 넣는다 */
function thumbOf(ink) {
  const img = el('img', { class: 'memo-thumb', alt: INK_ONLY })
  img.src = ink
  return img
}

/** 메모 쓰기 펜 그림(선 그림, 색은 칸 글 색) */
function penIcon() {
  return svg(
    'svg',
    {
      class: 'memo-ic',
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    },
    [svg('path', { d: 'M4 20l4-1 11-11-3-3L5 16l-1 4z' }), svg('path', { d: 'M14 6l3 3' })],
  )
}

/** 그려 둔 메모 칸을 모두 저장된 메모로 다시 그린다 */
function refreshBoxes() {
  for (const box of document.querySelectorAll('.memo-box')) box.replaceWith(memoBox())
}

/** 지우기 (AC-3403.4): 바로 지우고 띠 "메모를 지웠어요" [되돌리기]. 되돌리기는 before를 다시 저장한다 */
function removeMemo(before) {
  if (!writeMemo(null)) {
    showBand(SAVE_FAILED, null)
    refreshBoxes()
    return
  }
  refreshBoxes()
  showBand(REMOVED, () => {
    if (!writeMemo(before)) showBand(SAVE_FAILED, null)
    refreshBoxes()
  })
}

// ---- 띠 -------------------------------------------------------------------------------------------

/** 메모 띠: 글 + [되돌리기](undo일 때). 5초 뒤 저절로 내린다. 판 다시 그리기에 안 지워지게 document.body에 붙인다 */
function showBand(text, undo) {
  dropBand()
  band = el('div', { class: 'toast memo-toast', role: 'status' }, [
    el('span', { class: 'toast-text' }, text),
    undo
      ? el(
          'button',
          {
            type: 'button',
            class: 'toast-undo',
            on: {
              click: () => {
                dropBand()
                undo()
              },
            },
          },
          '되돌리기',
        )
      : null,
  ])
  document.body.append(band)
  bandTimer = setTimeout(dropBand, TOAST_MS)
}

function dropBand() {
  if (bandTimer !== null) clearTimeout(bandTimer)
  bandTimer = null
  band?.remove()
  band = null
}

// ---- 큰 창 ----------------------------------------------------------------------------------------

/**
 * 큰 창 (AC-3403.2): "이 기기에만 저장돼요" 안내·글자 칸·펜 도구 [검정]·[빨강]·[지우개]·[펜 글씨 모두 지우기]·그리기 판·
 * [메모 지우기]·[닫기]. [닫기]·창 바깥·Esc는 저장하고 닫는다
 */
export function openMemo() {
  if (opened) {
    opened.node.querySelector('.sheet')?.focus({ preventScroll: true })
    return
  }
  const memo = readMemo()
  const area = el('textarea', { class: 'memo-text', rows: '2', placeholder: '여기를 눌러 키보드로 써요', 'aria-label': '메모 글자' })
  area.value = memo?.text ?? ''
  const pad = el('canvas', { class: 'memo-pad', 'aria-label': '손글씨 판' })
  const toolButtons = TOOLS.map(([key, label]) =>
    el('button', { type: 'button', 'aria-pressed': key === 'ink' ? 'true' : 'false', on: { click: () => pick(key) } }, [
      key === 'erase' ? null : el('span', { class: `pen-dot ${key}` }),
      label,
    ]),
  )

  // 손글씨 판
  const ctx = typeof pad.getContext === 'function' ? pad.getContext('2d') : null
  const css = getComputedStyle(document.documentElement)
  const inks = Object.fromEntries(TOOLS.filter(([, , token]) => token).map(([key, , token]) => [key, css.getPropertyValue(token).trim()]))
  let tool = 'ink'
  let last = null
  /** 판에 그림이 있나 · 이 창에서 판을 고쳤나(안 고쳤으면 앞 그림을 그대로 둔다) */
  let inked = Boolean(memo?.ink)
  let changed = false

  function pick(key) {
    tool = key
    toolButtons.forEach((button, i) => button.setAttribute('aria-pressed', TOOLS[i][0] === key ? 'true' : 'false'))
  }

  function pointOf(event) {
    const rect = pad.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function stroke(event) {
    if (!last || !ctx) return
    const next = pointOf(event)
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : PRESSURE
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over'
    if (tool !== 'erase' && inks[tool]) ctx.strokeStyle = inks[tool]
    ctx.lineWidth = tool === 'erase' ? ERASER : PEN_MIN + pressure * PEN_SPAN
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    last = next
    changed = true
    if (tool !== 'erase') inked = true
  }

  function clearInk() {
    ctx?.clearRect(0, 0, pad.width, pad.height)
    inked = false
    changed = true
    last = null
  }

  /** 지금 창의 메모 { text, ink } | null */
  function current() {
    const ink = !changed ? (memo?.ink ?? null) : inked ? pngOf(pad) : null
    return hasContent(area.value, ink) ? { text: area.value, ink } : null
  }

  function close() {
    node.remove()
    opened = null
  }

  /** 저장하고 닫는다. 저장하지 못하면 alert일 때 띠 */
  function finish(alert) {
    const next = current()
    close()
    if (!sameMemo(next, memo) && !writeMemo(next) && alert) showBand(SAVE_FAILED, null)
    refreshBoxes()
  }

  /** [메모 지우기]: 창을 닫고 바로 지운다. 되돌리기는 창에 있던 메모 */
  function remove() {
    const before = current() ?? memo
    close()
    if (before) removeMemo(before)
    else refreshBoxes()
  }

  const node = el(
    'div',
    {
      class: 'sheet-back memo-back',
      on: {
        click: (event) => {
          if (event.target === event.currentTarget) finish(true)
        },
        keydown: (event) => {
          if (event.key === 'Escape') finish(true)
        },
      },
    },
    el('div', { class: 'sheet memo-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': '메모', tabindex: '-1' }, [
      el('div', { class: 'sheet-h' }, [
        el('span', { class: 'sheet-title' }, '메모'),
        el('span', { class: 'sheet-sub' }, [el('b', null, '이 기기에만'), ' 저장돼요 · 다른 기기에서는 보이지 않아요']),
      ]),
      el('div', { class: 'memo-h' }, '글자로 쓰기'),
      area,
      el('div', { class: 'memo-h' }, '펜으로 쓰기 · 애플펜슬이나 손가락'),
      el('div', { class: 'pen-tools' }, [
        ...toolButtons,
        el('button', { type: 'button', class: 'clear-ink', on: { click: clearInk } }, '펜 글씨 모두 지우기'),
      ]),
      pad,
      el('div', { class: 'memo-foot' }, [
        el('button', { type: 'button', class: 'memo-del', on: { click: remove } }, '메모 지우기'),
        el('span', { class: 'memo-note' }, '닫으면 저절로 저장돼요'),
        el('button', { type: 'button', class: 'sheet-x', on: { click: () => finish(true) } }, '닫기'),
      ]),
    ]),
  )

  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    if (typeof pad.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        pad.setPointerCapture(event.pointerId)
      } catch {
        // 잡지 못해도 판 안에서는 그린다
      }
    }
    last = pointOf(event)
  })
  pad.addEventListener('pointermove', stroke)
  pad.addEventListener('pointerup', () => (last = null))
  pad.addEventListener('pointercancel', () => (last = null))

  document.body.append(node)
  opened = { node, finish }

  // 판 크기: 보이는 크기 × 화면 배율(선명하게). 앞 그림은 판 밑에 깐다
  const ratio = window.devicePixelRatio || 1
  pad.width = Math.round(pad.clientWidth * ratio)
  pad.height = Math.round(pad.clientHeight * ratio)
  ctx?.scale(ratio, ratio)
  if (ctx && memo?.ink) {
    const img = new Image()
    img.addEventListener('load', () => {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.drawImage(img, 0, 0, pad.clientWidth, pad.clientHeight)
      ctx.restore()
    })
    img.src = memo.ink
  }
  node.querySelector('.sheet')?.focus({ preventScroll: true })
}

/** 판의 그림 PNG data URL. 못 만들거나 모양이 틀리면 null */
function pngOf(pad) {
  try {
    const url = pad.toDataURL('image/png')
    return PNG.test(url) ? url : null
  } catch {
    return null
  }
}

/** 열린 창을 저장하고 닫고 메모 띠를 내린다(숨김·끊김, AC-3403.3). 열린 것이 없으면 아무것도 하지 않는다 */
export function closeMemo() {
  opened?.finish(false)
  dropBand()
}
