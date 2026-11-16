// 목록 고치기 창 (reception-pick-lists design.md 3절, REQ-3505, 승인 시안 docs/mockups/reception-pick-lists/Mock.html listSheet ·
// 탭 여섯·이름 바꾸기는 reception-arrange-tune REQ-3604, 시안 docs/mockups/reception-arrange-tune/Mock.html listSheet).
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 판 picks의 사본(초안)을 창이 갖는다. [더하기]·▲·▼·✕·[약재 없음]·[바꾸기]는 초안만 바꾸고 [저장]이 초안 전체를 onSave(picks)로 넘긴다
//   (AC-3505.2·3505.3). onSave가 참(204)을 주면 창을 닫고, 아니면 창·초안을 그대로 둔다. 기다리는 동안 [저장]은 꺼져 있다
// - 탭은 C-ARM·SONO·PT·도수·충격파·견인이다(AC-3604.1)
// - 도우미 목록 규칙(PickLists, AC-3501.2·AC-3603.2)에 어긋나는 이름은 더하지 않고 적던 글을 그대로 둔다: 앞뒤 빈칸을 뺀 1~10글자,
//   "|"·제어 글자 없음, 무리 안 겹침 없음, SONO 부위와 부위 없이는 서로 겹치지 않음, 개수 한도.
//   하나는 있어야 하는 무리(시술·PT 종류·도수 시간·충격파 부위 수·견인 부위)의 마지막 하나와 SONO 마지막 부위(부위 + 부위 없이)의 ✕는 꺼진다(AC-3604.3)
// - 이름을 누르면 그 줄이 바꾸기 줄(글 칸 + [바꾸기]·[취소] + 안내)이 된다. 한 번에 한 줄이고, 같은 이름 규칙(자기 자신과는 겹침으로
//   보지 않음, 개수 한도는 보지 않음)에 맞으면 그 이름만 바꾸고 아니면 줄을 연 채 안내 글이 빨개진다. 글 칸의 Esc는 바꾸기 줄만 닫는다.
//   다른 탭·▲·▼·✕·[약재 없음]을 누르면 바꾸던 줄이 닫힌다(AC-3604.2)
// - 창은 어레인지 화면(.page.arrange) 안에 붙는다. renderArrange가 다시 그려도 이 창은 지우지 않아 초안·적던 글·초점이 남는다.
//   숨김·끊김으로 화면을 지우면 함께 지워진다. 목록 이름은 글 마디로만 넣고 브라우저 저장소에 두지 않는다(AC-3505.4)
//
// 쓰는 법 (arrange.js)
//   openLists(page, picks, onSave)   page(.page.arrange)에 창을 연다. 이미 열려 있으면 그 창을 둔다
//     picks              판 picks { carm: { procs: [{ n, noDrug }], drugs }, sono: { parts, plains, withs }, pt, ds, eswt: { hits, counts }, trac }
//                        (PT·도수·충격파·견인 무리는 reception-arrange-tune AC-3603.2. 초안이 그대로 갖고 [저장]이 그대로 넘긴다)
//     onSave(picks)      [저장]. 참(또는 참으로 끝나는 Promise)이면 창을 닫는다

import { clear, el } from './dom.js'

const TITLE = '고르기 목록 고치기'
const SUB = '칸을 넣을 때 보이는 단추를 정해요. 이름을 누르면 바꿀 수 있어요'
const FIXED = '쪽(오른쪽·왼쪽·양쪽)은 늘 있어요. 부위 앞에 붙어 "오른 어깨"처럼 보여요.'
const ESWT_FIXED = '칸에는 "3000타 2부위"처럼 타수와 부위 수가 함께 보여요.'
const RENAME_HINT = '1~10글자 · 같은 이름은 안 돼요'
const EMPTY = '아직 없어요. 아래에 적고 [더하기]를 눌러요'
const FOOT = '저장하면 모든 폰·태블릿의 고르기 창이 바로 바뀌어요. 이미 표에 넣은 칸은 그대로예요.'
const NO_DRUG = '약재 없음'

/** 이름 한도 (AC-3501.2): 앞뒤 빈칸을 뺀 1~10글자, "|"·제어 글자 없음 */
const NAME_MAX = 10
const BAD_CHAR = /[|\u0000-\u001f\u007f]/

/**
 * 탭과 무리 (시안 LISTS): key 초안 칸, sub 작은 글, min 늘 남는 개수(마지막 ✕ 끄기, AC-3604.3), max 개수 한도(AC-3501.2·AC-3603.2),
 * flag 시술의 [약재 없음]. SONO 부위·부위 없이는 둘을 합쳐 하나가 남는다(APART)
 */
const TABS = [
  {
    key: 'carm',
    name: 'C-ARM',
    fixed: null,
    groups: [
      { key: 'procs', label: '시술', sub: '하나 골라요', min: 1, max: 12, flag: true },
      { key: 'drugs', label: '약재', sub: '하나 골라요', min: 0, max: 12, flag: false },
    ],
  },
  {
    key: 'sono',
    name: 'SONO',
    fixed: FIXED,
    groups: [
      { key: 'parts', label: '부위', sub: '여러 개 골라요', min: 0, max: 40, flag: false },
      { key: 'plains', label: '부위 없이', sub: '쪽·부위 없이 그대로 담겨요', min: 0, max: 12, flag: false },
      { key: 'withs', label: '같이 하는 것', sub: '체크하면 이름표로 떠요', min: 0, max: 12, flag: false },
    ],
  },
  { key: 'pt', name: 'PT', fixed: null, groups: [{ key: 'pt', label: '종류', sub: '하나 골라요', min: 1, max: 8, flag: false }] },
  { key: 'ds', name: '도수', fixed: null, groups: [{ key: 'ds', label: '시간', sub: '하나 골라요', min: 1, max: 8, flag: false }] },
  {
    key: 'eswt',
    name: '충격파',
    fixed: ESWT_FIXED,
    groups: [
      { key: 'hits', label: '타수', sub: '안 골라도 돼요', min: 0, max: 8, flag: false },
      { key: 'counts', label: '부위 수', sub: '하나 골라요', min: 1, max: 8, flag: false },
    ],
  },
  { key: 'trac', name: '견인', fixed: null, groups: [{ key: 'trac', label: '부위', sub: '하나 골라요', min: 1, max: 8, flag: false }] },
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
  /** rename: 바꾸는 줄 { g 무리, i 자리, text 적던 글, bad 규칙에 어긋남 } | null (한 번에 한 줄, 지금 탭) */
  const typed = Object.fromEntries(TABS.flatMap((tab) => tab.groups.map((group) => [group.key, ''])))
  const state = { tab: 'carm', draft: draftOf(picks), typed, rename: null, saving: false }
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

  /** 창 안을 다시 그린다. 세로 위치를 지키고 focus({ tab | rename | g, op, i })에 초점을 돌려 둔다 */
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
            state.rename = null
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

  /** 줄 하나: 이름 단추(누르면 바꾸기 줄) · ([약재 없음]) · ▲ · ▼ · ✕. 바꾸는 줄이면 바꾸기 줄 */
  const rowOf = (group, item, i) => {
    const name = group.flag ? item.n : item
    if (state.rename && state.rename.g === group.key && state.rename.i === i) return renameRowOf(group, name)
    const count = state.draft[group.key].length
    const mark = (op) => ({ 'data-g': group.key, 'data-op': op, 'data-i': String(i), on: { click: () => change(group, op, i) } })
    return el('li', { class: 'lt-row' }, [
      el('button', { type: 'button', class: 'lt-name', ...mark('name') }, name),
      group.flag
        ? el('button', { type: 'button', class: item.noDrug ? 'lt-flag on' : 'lt-flag', 'aria-pressed': item.noDrug ? 'true' : 'false', ...mark('flag') }, NO_DRUG)
        : null,
      el('button', { type: 'button', class: 'lt-btn', 'aria-label': '위로', disabled: i === 0, ...mark('up') }, '▲'),
      el('button', { type: 'button', class: 'lt-btn', 'aria-label': '아래로', disabled: i === count - 1, ...mark('down') }, '▼'),
      el('button', { type: 'button', class: 'lt-btn del', 'aria-label': '빼기', disabled: lastOne(group), ...mark('del') }, '✕'),
    ])
  }

  /** 바꾸기 줄 (시안 rowHtml is-rename): 글 칸(이름) + [바꾸기]·[취소] + 안내(규칙에 어긋나면 is-bad). 글 칸의 Enter는 [바꾸기], Esc는 이 줄만 닫는다 */
  const renameRowOf = (group, name) => {
    const rename = state.rename
    const input = el('input', {
      type: 'text',
      class: 'lt-rename',
      maxlength: String(NAME_MAX),
      'aria-label': `${name} 이름 바꾸기`,
      on: {
        input: (event) => {
          rename.text = event.target.value
        },
        keydown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            applyRename(group)
          } else if (event.key === 'Escape') {
            // 창의 Esc(창 닫기)보다 먼저 받아 바꾸기 줄만 닫는다
            event.stopPropagation()
            closeRename(group)
          }
        },
      },
    })
    input.value = rename.text
    return el('li', { class: 'lt-row is-rename' }, [
      input,
      el('button', { type: 'button', class: 'lt-ok', on: { click: () => applyRename(group) } }, '바꾸기'),
      el('button', { type: 'button', class: 'lt-no', on: { click: () => closeRename(group) } }, '취소'),
      el('p', { class: rename.bad ? 'lt-hint is-bad' : 'lt-hint' }, RENAME_HINT),
    ])
  }

  /** [바꾸기]: 규칙에 맞으면 초안의 그 이름만 바꾸고(약재 없음·차례 그대로) 줄을 닫는다. 아니면 줄을 연 채 안내를 빨갛게 한다 */
  const applyRename = (group) => {
    const rename = state.rename
    if (!rename) return
    const list = state.draft[group.key]
    const name = rename.text.trim()
    if (!fits(state.draft, group, name, rename.i)) {
      rename.bad = true
      draw({ rename: true })
      return
    }
    list[rename.i] = group.flag ? { n: name, noDrug: list[rename.i].noDrug } : name
    closeRename(group)
  }

  /** 바꾸기 줄을 닫고 그 줄 이름 단추에 초점을 둔다 */
  const closeRename = (group) => {
    const i = state.rename?.i ?? 0
    state.rename = null
    draw({ g: group.key, op: 'name', i })
  }

  /** ✕를 끄는가: 늘 남는 개수(min)의 마지막 하나, SONO 마지막 부위(부위 + 부위 없이) */
  const lastOne = (group) => {
    if (group.key in APART) return state.draft.parts.length + state.draft.plains.length <= 1
    return group.min > 0 && state.draft[group.key].length <= group.min
  }

  /** 이름(바꾸기 줄 열기)·▲·▼·✕·[약재 없음]: 초안만 바꾼다. 이름 말고는 바꾸던 줄을 닫는다 */
  const change = (group, op, i) => {
    const list = state.draft[group.key]
    if (op === 'name') {
      const item = list[i]
      state.rename = { g: group.key, i, text: group.flag ? item.n : item, bad: false }
      draw({ rename: true })
      return
    }
    state.rename = null
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
    if (focus.rename) {
      const input = sheet.querySelector('.lt-rename')
      if (input) {
        input.focus({ preventScroll: true })
        input.setSelectionRange(input.value.length, input.value.length)
        return
      }
    }
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

/**
 * 초안에 더해도 되는 이름인가 (AC-3501.2). self가 있으면 그 자리 이름 바꾸기다: 자기 자신과는 겹침으로 보지 않고 개수 한도는 보지 않는다(AC-3604.2)
 */
function fits(draft, group, name, self = -1) {
  if (name.length < 1 || name.length > NAME_MAX || BAD_CHAR.test(name)) return false
  const list = draft[group.key]
  if (self < 0 && list.length >= group.max) return false
  if ((group.flag ? list.map((item) => item.n) : list).some((item, i) => i !== self && item === name)) return false
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
    pt: texts(picks?.pt),
    ds: texts(picks?.ds),
    hits: texts(picks?.eswt?.hits),
    counts: texts(picks?.eswt?.counts),
    trac: texts(picks?.trac),
  }
}

/** 초안 → 판 picks 모양 (POST /api/lists 몸, 여섯 무리 reception-arrange-tune AC-3603.2) */
function picksOf(draft) {
  return {
    carm: { procs: draft.procs.map((item) => ({ n: item.n, noDrug: item.noDrug })), drugs: [...draft.drugs] },
    sono: { parts: [...draft.parts], plains: [...draft.plains], withs: [...draft.withs] },
    pt: [...draft.pt],
    ds: [...draft.ds],
    eswt: { hits: [...draft.hits], counts: [...draft.counts] },
    trac: [...draft.trac],
  }
}
