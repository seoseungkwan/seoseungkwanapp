// 지우기 + 연결 끊김·불러오는 중 화면 (design.md 10절, 승인 시안 Offline.dc.html). class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 그리기 전에 화면 자리(#app)를 통째로 비운다. 환자 줄·상세·태블릿 오른쪽 칸이 그 자리에서 사라진다(AC-1407.4, AC-1407.11)
// - 남기는 값은 "마지막 연결 HH:MM"(PC 시각)과 다시 확인하는 간격 every(초)뿐이다. 환자 글은 받지 않는다
// - 확인 글 "N초마다 다시 확인하는 중"의 N은 poll.js가 넘기는 마지막으로 받은 every다(처음 연결 전에는 poll.js 기본값, AC-1403.9).
//   숫자가 아니면 숫자를 지어내지 않는다
// - 끊김 화면에는 단추가 없다. every초마다 저절로 다시 본다(AC-1407.10)
//
// 쓰는 법 (poll.js)
//   renderOffline(host, { lastAt, every })  끊김 화면. lastAt('HH:MM')이 없으면 "마지막 연결" 없이 확인 글만
//   renderLoading(host)                     "불러오는 중이에요"(index.html의 처음 화면과 같은 모양). 숨김 뒤 다시 보일 때

import { clear, el } from './dom.js'

const LOGO = { class: 'off-logo', src: '/logo-wordmark.png', alt: '양지바른정형외과' }
const CHECKING = '다시 확인하는 중'
const LAST_AT = /^\d\d:\d\d$/

/**
 * 연결 끊김 화면을 host 안에 그린다(안에 있던 것은 모두 지운다).
 * @param {HTMLElement} host 화면 자리(#app)
 * @param {{ lastAt?: string | null, every?: number }} [options] 마지막으로 읽은 PC 시각 'HH:MM', 다시 읽는 간격(초)
 * @returns {HTMLElement} .page.off-page
 */
export function renderOffline(host, { lastAt, every } = {}) {
  const checking = Number.isSafeInteger(every) && every > 0 ? `${every}초마다 ${CHECKING}` : CHECKING
  const status = typeof lastAt === 'string' && LAST_AT.test(lastAt) ? `${checking} · 마지막 연결 ${lastAt}` : checking
  return show(
    host,
    el('div', { class: 'page off-page' }, [
      el('header', { class: 'top is-offline' }, [
        el('h1', { class: 'off-title' }, '접수 현황'),
        el('span', { class: 'conn is-off' }, '연결 끊김'),
      ]),
      el('main', { class: 'off' }, [
        el('img', LOGO),
        el('h2', { class: 'off-heading' }, '지금 볼 수 없어요'),
        el('p', { class: 'off-lead' }, '총괄 컴퓨터가 꺼져 있거나, 비트에 아직 로그인하지 않았어요.'),
        el('p', { class: 'off-sub' }, '컴퓨터가 켜지고 비트에 로그인하면 이 화면이 저절로 다시 바뀌어요. 따로 누를 건 없어요.'),
        el('div', { class: 'off-status' }, status),
      ]),
      el('footer', { class: 'foot' }, '연결이 끊기면 환자 정보는 화면에서 바로 지워져요'),
    ]),
  )
}

/**
 * 환자 자료 없는 "불러오는 중이에요" 화면을 host 안에 그린다(안에 있던 것은 모두 지운다).
 * @param {HTMLElement} host 화면 자리(#app)
 * @returns {HTMLElement} .page.off-page
 */
export function renderLoading(host) {
  return show(
    host,
    el('div', { class: 'page off-page' }, [
      el('header', { class: 'top is-offline' }, el('h1', { class: 'off-title' }, '접수 현황')),
      el('main', { class: 'off' }, [el('img', LOGO), el('p', { class: 'off-lead' }, '불러오는 중이에요')]),
    ]),
  )
}

function show(host, page) {
  clear(host)
  host.appendChild(page)
  return page
}
