// 엑스레이 'X-ray 완료' 표시 띠 (design.md 6절·10절, 승인 시안 Main.dc.html·Tablet.dc.html 진료보류 줄). class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 두 모양: 전 = "X-ray 전" + [X-ray 완료], 완료 = "X-ray 완료 HH:MM" + [표시 취소](AC-1405.1·1405.2).
//   시각은 도우미가 준 줄의 xray.at 그대로다(휴대폰 시계 없음). 글은 dom.js el()로 글 마디로만 넣는다(AC-1407.6)
// - 누르면 setXray(열쇠, 켬/끔)를 한 번 부른다. 답을 기다리는 동안 그 줄의 단추는 disabled라 두 번 못 누르고,
//   그 사이 목록이 다시 그려져도(10초 읽기) 그 줄의 새 단추도 disabled다. 성공(204)하면 다시 읽기를 한 번 해 새 판으로 그린다.
//   실패하면(ApiError) 다시 읽지 않고 단추를 풀어 다시 누를 수 있게 둔다. 띠만 바뀌고 줄의 자리는 그대로다
// - 도우미에 직접 묻지 않는다: setXray·readNow·signal을 app.js가 넘긴다. 모듈에는 누르는 중인 화면 열쇠만 잠깐 둔다(답이 오면 지운다)
//
// 쓰는 법 (app.js)
//   renderBoard(host, board, { …, xray: (row) => xrayBand(row, { setXray, readNow: poll.readNow, signal: poll.signal }) })
//   xrayBand(row, deps) → div.xray | null   엑스레이 칸(row.xray)이 없는 줄은 null
//     deps.setXray(k, on, { signal })  api.js setXray. 204면 끝나는 약속, 실패는 ApiError
//     deps.readNow()                   poll.readNow. 성공 뒤 한 번 부른다
//     deps.signal()                    poll.signal. 지금 연결의 AbortSignal(끊김·숨김 때 함께 끊긴다). 없어도 된다

import { el } from './dom.js'

/** 누르는 중인 화면 열쇠 → 그동안 그린 그 줄의 단추들 */
const pressing = new Map()

/**
 * 진료보류 줄 아래 띠를 만든다.
 * @param {{ k: string, xray?: { at: string | null } | null }} row GET /api/board 줄
 * @param {{ setXray?: Function, readNow?: Function, signal?: Function }} [deps] 위 '쓰는 법'
 * @returns {HTMLElement | null}
 */
export function xrayBand(row, deps = {}) {
  if (!row || !row.xray || typeof row.k !== 'string') return null
  const at = row.xray.at
  const marked = typeof at === 'string' && at !== ''
  const button = el(
    'button',
    { type: 'button', class: marked ? 'btn-light' : 'btn-dark', on: { click: () => press(row.k, !marked, deps, button) } },
    marked ? '표시 취소' : 'X-ray 완료',
  )
  const waiting = pressing.get(row.k)
  if (waiting) {
    button.disabled = true
    waiting.add(button)
  }
  return el('div', { class: 'xray' }, [
    el('span', { class: marked ? 'xray-tag is-done' : 'xray-tag is-before' }, marked ? `X-ray 완료 ${at}` : 'X-ray 전'),
    button,
  ])
}

/** setXray 한 번. 그 줄이 이미 누르는 중이면 아무것도 하지 않는다 */
function press(k, on, deps, button) {
  if (pressing.has(k) || typeof deps.setXray !== 'function') return
  const buttons = new Set([button])
  pressing.set(k, buttons)
  button.disabled = true
  call(deps, k, on).then(
    () => {
      // 단추는 다시 읽은 판이 새 띠로 바꿀 때까지 disabled로 둔다(옛 모양을 또 누르지 않게)
      pressing.delete(k)
      if (typeof deps.readNow === 'function') deps.readNow()
    },
    () => {
      pressing.delete(k)
      for (const each of buttons) each.disabled = false
    },
  )
}

/** setXray를 부른다. 바로 던져도 실패한 약속으로 받는다 */
function call(deps, k, on) {
  try {
    const signal = typeof deps.signal === 'function' ? deps.signal() : undefined
    return Promise.resolve(deps.setXray(k, on, { signal }))
  } catch (error) {
    return Promise.reject(error)
  }
}
