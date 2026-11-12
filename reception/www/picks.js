// 목록 고치기 창 (reception-pick-lists design.md 3절, REQ-3505, 승인 시안 docs/mockups/reception-pick-lists/Mock.html listSheet).
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 판 picks의 사본(초안)을 창이 갖는다. [더하기]·▲·▼·✕·[약재 없음]은 초안만 바꾸고 [저장]이 초안 전체를 onSave(picks)로 넘긴다
//   (AC-3505.2·3505.3). onSave가 참(204)을 주면 창을 닫고, 아니면 창·초안을 그대로 둔다. 기다리는 동안 [저장]은 꺼져 있다
// - 도우미 목록 규칙(PickLists, AC-3501.2)에 어긋나는 이름은 더하지 않고 적던 글을 그대로 둔다: 앞뒤 빈칸을 뺀 1~10글자,
//   "|"·제어 글자 없음, 무리 안 겹침 없음, SONO 부위와 부위 없이는 서로 겹치지 않음, 개수 한도.
//   마지막 시술과 SONO 마지막 부위(부위 + 부위 없이)의 ✕는 꺼진다
// - 창은 어레인지 화면(.page.arrange) 안에 붙는다. renderArrange가 다시 그려도 이 창은 지우지 않아 초안·적던 글·초점이 남는다.
//   숨김·끊김으로 화면을 지우면 함께 지워진다. 목록 이름은 글 마디로만 넣고 브라우저 저장소에 두지 않는다(AC-3505.4)
//
// 쓰는 법 (arrange.js)
//   openLists(page, picks, onSave)   page(.page.arrange)에 창을 연다. 이미 열려 있으면 그 창을 둔다
//     picks              판 picks { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs } }
//     onSave(picks)      [저장]. 참(또는 참으로 끝나는 Promise)이면 창을 닫는다

import { clear, el } from './dom.js'

const TITLE = '고르기 목록 고치기'
const SUB = '칸을 넣을 때 보이는 단추를 정해요'
const FIXED = '쪽(오른쪽·왼쪽·양쪽)은 늘 있어요. 부위 앞에 붙어 "오른 어깨"처럼 보여요.'
const EMPTY = '아직 없어요. 아래에 적고 [더하기]를 눌러요'
const FOOT = '저장하면 모든 폰·태블릿의 고르기 창이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.'
const NO_DRUG = '약재 없음'

/** 이름 한도 (AC-3501.2): 앞뒤 빈칸을 뺀 1~10글자, "|"·제어 글자 없음 */
const NAME_MAX = 10
const BAD_CHAR = /[|\u0000-\u001f\u007f]/

/** 탭과 무리 (시안 LISTS): key 초안 칸, sub 작은 글, max 개수 한도(AC-3501.2), flag 시술의 [약재 없음] */
const TABS = [
  {
    key: 'carm',
    name: 'C-ARM',
    fixed: null,
    groups: [
      { key: 'procs', label: '시술', sub: '하나 골라요', max: 12, flag: true },
      { key: 'drugs', label: '약재', sub: '하나 골라요', max: 12, flag: false },
    ],
  },
  {
    key: 'sono',
    name: 'SONO',
    fixed: FIXED,
    groups: [
      { key: 'parts', label: '부위', sub: '여러 개 골라요', max: 40, flag: false },
      { key: 'plains', label: '부위 없이', sub: '쪽·부위 없이 그대로 담겨요', max: 12, flag: false },
      { key: 'withs', label: '같이 하는 것', sub: '체크하면 이름표로 떠요', max: 12, flag: false },
    ],
  },
]

/** 서로 겹치면 안 되는 무리 (SONO 부위 ↔ 부위 없이) */
const APART = { parts: 'plains', plains: 'parts' }

/**
 * 목록 고치기 창을 연다.
 * @param {HTMLElement} page 어레인지 화면(.page.arrange)
 * @param {object} picks 판 picks
 * @param {(picks: object) => Promise<boolean> | boolean} onSave [저장]
 * @returns {HTMLElement} .sheet-back.list-back
 */
export function openLists(page, picks, onSave) {
  const opened = page.querySelector(':scope > .sheet-back.list-back')
  if (opened) return opened
  const state = { tab: 'carm', draft: draftOf(picks), typed: { procs: '', drugs: '', parts: '', plains: '', withs: '' }, saving: false }
  const sheet = el('div', { class: 'sheet list-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': TITLE, tabindex: '-1' })
  const close = () => back.remove()
  const back = el(
    'div',
    {
      class: 'sheet-back list-back',
      on: {
        click: (event) => {
          if (event.target === event.currentTarget) close()
        },
        keydown: (event) => {
          if (event.key === 'Escape') close()
        },
      },
    },
    sheet,
  )

  /** 창 안을 다시 그린다. 세로 위치를 지키고 focus({ tab | g, op, i })에 초점을 돌려 둔다 */
  const draw = (focus) => {
    const top = sheet.scrollTop
    const tab = TABS.find((item) => item.key === state.tab)
    clear(sheet)
    for (const child of [
      el('div', { class: 'sheet-h' }, [el('span', { class: 'sheet-title' }, TITLE), el('span', { class: 'sheet-sub' }, SUB)]),
      el('div', { class: 'lt-tabs' }, TABS.map(tabButton)),
      tab.fixed ? el('p', { class: 'lt-fixed' }, tab.fixed) : null,
      el('div', { class: 'lt-groups' }, tab.groups.map(groupOf)),
      el('p', { class: 'lt-foot-note' }, FOOT),
      el('div', { class: 'sheet-go' }, [
        el('button', { type: 'button', class: 'sheet-close', on: { click: close } }, '취소'),
        el('button', { type: 'button', class: 'go', disabled: state.saving, on: { click: save } }, '저장'),
      ]),
    ])
      if (child) sheet.appendChild(child)
    sheet.scrollTop = top
    if (focus) refocus(focus)
  }

  const tabButton = (tab) =>
    el(
      'button',
      {
        type: 'button',
        class: tab.key === state.tab ? 'lt-tab on' : 'lt-tab',
        'aria-pressed': tab.key === state.tab ? 'true' : 'false',
        'data-tab': tab.key,
        on: {
          click: () => {
            state.tab = tab.key
            draw({ tab: tab.key })
          },
        },
      },
      tab.name,
    )

  /** 무리 하나: 머리(이름 · 작은 글 · N개) · 줄(없으면 빈 글) · 글 칸 + [더하기] */
  const groupOf = (group) => {
    const items = state.draft[group.key]
    const input = el('input', {
      type: 'text',
      maxlength: String(NAME_MAX),
      placeholder: `새 ${group.label}`,
      'aria-label': `새 ${group.label}`,
      'data-g': group.key,
      on: {
        input: (event) => {
          state.typed[group.key] = event.target.value
        },
      },
    })
    input.value = state.typed[group.key]
    return el('section', { class: 'lt-group', 'data-g': group.key }, [
      el('h3', null, [group.label, el('span', { class: 'sm' }, `${group.sub} · ${items.length}개`)]),
      items.length > 0 ? el('ul', { class: 'lt-list' }, items.map((item, i) => rowOf(group, item, i))) : el('div', { class: 'lt-empty' }, EMPTY),
      el(
        'form',
        {
          class: 'lt-add',
          on: {
            submit: (event) => {
              event.preventDefault()
              add(group, input.value)
            },
          },
        },
        [input, el('button', { type: 'submit' }, '더하기')],
      ),
    ])
  }

  /** 줄 하나: 이름 · ([약재 없음]) · ▲ · ▼ · ✕ */
  const rowOf = (group, item, i) => {
    const count = state.draft[group.key].length
    const mark = (op) => ({ 'data-g': group.key, 'data-op': op, 'data-i': String(i), on: { click: () => change(group, op, i) } })
    return el('li', { class: 'lt-row' }, [
      el('span', { class: 'lt-name' }, group.flag ? item.n : item),
      group.flag
        ? el('button', { type: 'button', class: item.noDrug ? 'lt-flag on' : 'lt-flag', 'aria-pressed': item.noDrug ? 'true' : 'false', ...mark('flag') }, NO_DRUG)
        : null,
      el('button', { type: 'button', class: 'lt-btn', 'aria-label': '위로', disabled: i === 0, ...mark('up') }, '▲'),
      el('button', { type: 'button', class: 'lt-btn', 'aria-label': '아래로', disabled: i === count - 1, ...mark('down') }, '▼'),
      el('button', { type: 'button', class: 'lt-btn del', 'aria-label': '빼기', disabled: lastOne(group), ...mark('del') }, '✕'),
    ])
  }

  /** ✕를 끄는가: 마지막 시술, SONO 마지막 부위(부위 + 부위 없이) */
  const lastOne = (group) => {
    if (group.key === 'procs') return state.draft.procs.length <= 1
    if (group.key in APART) return state.draft.parts.length + state.draft.plains.length <= 1
    return false
  }

  /** ▲·▼·✕·[약재 없음]: 초안만 바꾼다 */
  const change = (group, op, i) => {
    const list = state.draft[group.key]
    if (op === 'flag') list[i] = { n: list[i].n, noDrug: !list[i].noDrug }
    if (op === 'up' && i > 0) list.splice(i - 1, 0, ...list.splice(i, 1))
    if (op === 'down' && i < list.length - 1) list.splice(i + 1, 0, ...list.splice(i, 1))
    if (op === 'del' && !lastOne(group)) list.splice(i, 1)
    draw({ g: group.key, op, i: op === 'up' ? i - 1 : op === 'down' ? i + 1 : i })
  }

  /** [더하기]: 규칙에 맞으면 끝에 더하고 글 칸을 비운다. 맞지 않으면 적던 글을 그대로 둔다 */
  const add = (group, raw) => {
    state.typed[group.key] = raw
    const name = raw.trim()
    if (!fits(state.draft, group, name)) return
    state.draft[group.key].push(group.flag ? { n: name, noDrug: false } : name)
    state.typed[group.key] = ''
    draw({ g: group.key, op: 'input' })
  }

  /** [저장]: 초안 전체를 넘긴다. 참이면 닫고, 아니면 [저장]을 다시 켠다 */
  const save = () => {
    if (state.saving) return
    state.saving = true
    setSaving(true)
    let result
    try {
      result = typeof onSave === 'function' ? onSave(picksOf(state.draft)) : false
    } catch {
      result = false
    }
    Promise.resolve(result)
      .then(
        (ok) => ok === true,
        () => false,
      )
      .then((ok) => {
        state.saving = false
        if (!back.isConnected) return
        if (ok) close()
        else setSaving(false)
      })
  }

  const setSaving = (saving) => {
    const go = sheet.querySelector(':scope > .sheet-go > button.go')
    if (go) go.disabled = saving
  }

  const refocus = (focus) => {
    const target = focus.tab
      ? sheet.querySelector(`:scope > .lt-tabs > button[data-tab="${focus.tab}"]`)
      : focus.op === 'input'
        ? sheet.querySelector(`.lt-add > input[data-g="${focus.g}"]`)
        : sheet.querySelector(`button[data-g="${focus.g}"][data-op="${focus.op}"][data-i="${focus.i}"]`)
    if (target && !target.disabled) target.focus({ preventScroll: true })
    else sheet.focus({ preventScroll: true })
  }

  draw(null)
  page.appendChild(back)
  sheet.focus({ preventScroll: true })
  return back
}

/** 초안에 더해도 되는 이름인가 (AC-3501.2) */
function fits(draft, group, name) {
  if (name.length < 1 || name.length > NAME_MAX || BAD_CHAR.test(name)) return false
  const list = draft[group.key]
  if (list.length >= group.max) return false
  if ((group.flag ? list.map((item) => item.n) : list).includes(name)) return false
  const apart = APART[group.key]
  return !(apart && draft[apart].includes(name))
}

/** 판 picks → 초안(무리마다 사본) */
function draftOf(picks) {
  const texts = (list) => (Array.isArray(list) ? [...list] : [])
  return {
    procs: (Array.isArray(picks?.carm?.procs) ? picks.carm.procs : []).map((item) => ({ n: item.n, noDrug: item.noDrug === true })),
    drugs: texts(picks?.carm?.drugs),
    parts: texts(picks?.sono?.parts),
    plains: texts(picks?.sono?.plains),
    withs: texts(picks?.sono?.withs),
  }
}

/** 초안 → 판 picks 모양 (POST /api/lists 몸) */
function picksOf(draft) {
  return {
    carm: { procs: draft.procs.map((item) => ({ n: item.n, noDrug: item.noDrug })), drugs: [...draft.drugs] },
    sono: { parts: [...draft.parts], plains: [...draft.plains], withs: [...draft.withs] },
  }
}
