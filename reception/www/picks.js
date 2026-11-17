// 고르기 목록 (reception-pick-lists design.md 3절 REQ-3505 · 이름 바꾸기 reception-arrange-tune REQ-3604 ·
// 칸 고치기 창 [고르기 목록] 탭 reception-other-clinic REQ-5713 AC-5713.7, 승인 시안 docs/mockups/reception-other-clinic/index.html groupsEl).
// 옛 목록 고치기 창(탭 여섯 · POST /api/lists)은 설정의 칸 고치기 창(settings.js)이 되었다. 이 파일은 그 창의 [고르기 목록] 탭 몸만 그린다.
// class 이름은 style.css 머리 글의 화면 틀 그대로다.
// - 초안은 부른 쪽(settings.js)이 가진 설정 문서 picks의 사본이다. [더하기]·▲·▼·✕·[약재 없음]·[바꾸기]는 그 초안을 그 자리에서 바꾸고
//   ui.draw(focus)로 다시 그리게 한다. 저장은 부른 쪽 [저장]이 한다
// - 칸마다 무리: C-ARM 시술·약재, SONO 부위·부위 없이·같이 하는 것(+ 고정 글), PT 종류, 도수 시간, 충격파 타수·부위 수(+ 고정 글), 견인 부위,
//   더한 칸(x1…)은 "고르기" 한 줄(0~8개, 마지막 하나도 ✕ 됨, 비면 넣을 때 고르지 않고 바로 '준비', AC-5713.7)
// - 무리 머리 작은 글은 "하나 이상 골라요 · N개"(늘 하나는 남는 무리·더한 칸) 또는 "안 골라도 돼요 · N개"다(AC-5713.7)
// - 도우미 목록 규칙(PickLists, AC-3501.2·AC-3603.2)에 어긋나는 이름은 더하지 않고 적던 글을 그대로 둔다: 앞뒤 빈칸을 뺀 1~10글자,
//   "|"·제어 글자 없음, 무리 안 겹침 없음, SONO 부위와 부위 없이는 서로 겹치지 않음, 개수 한도.
//   하나는 있어야 하는 무리(시술·PT 종류·도수 시간·충격파 부위 수·견인 부위)의 마지막 하나와 SONO 마지막 부위(부위 + 부위 없이)의 ✕는 꺼진다(AC-3604.3)
// - 이름을 누르면 그 줄이 바꾸기 줄(글 칸 + [바꾸기]·[취소] + 안내)이 된다. 한 번에 한 줄이고, 같은 이름 규칙(자기 자신과는 겹침으로
//   보지 않음, 개수 한도는 보지 않음)에 맞으면 그 이름만 바꾸고 아니면 줄을 연 채 안내 글이 빨개진다. 글 칸의 Esc는 바꾸기 줄만 닫는다.
//   ▲·▼·✕·[약재 없음]을 누르면 바꾸던 줄이 닫힌다(다른 탭은 부른 쪽이 ui.rename을 비운다, AC-3604.2)
// - 목록 이름은 글 마디로만 넣고 브라우저 저장소에 두지 않는다(AC-3505.4)
//
// 쓰는 법 (settings.js 칸 고치기 창)
//   hasList(key)                    그 칸에 고르기 목록 탭이 있는가(X-RAY는 없다)
//   listEditor(key, picks, ui)      [고르기 목록] 탭 몸 [p.lt-top, (p.lt-fixed), div.lt-groups]. picks는 초안(그 자리에서 바뀐다)
//     ui = { typed: { 무리: 적던 글 }, rename: { g, i, text, bad } | null, draw(focus) }   부른 쪽이 창이 닫힐 때까지 갖는다
//   listFocus(root, focus)          다시 그린 뒤 draw가 받은 focus 자리로 초점을 돌린다
//   listSummary(key, picks)         설정 쪽 칸 줄 요약 글: 무리 하나면 목록을 "·"로, 여럿이면 "{무리} N개"를 " · "로 잇는다

import { el } from './dom.js'

const TOP = '칸을 넣을 때 보이는 단추예요 · 이름을 누르면 바꿀 수 있어요 · 모든 줄에서 여러 개를 함께 고를 수 있어요'
const FIXED = '쪽(오른쪽·왼쪽·양쪽)은 늘 있어요. 부위 앞에 붙어 "오른 어깨"처럼 보여요.'
const ESWT_FIXED = '칸에는 "3000타 2부위"처럼 타수와 부위 수가 함께 보여요.'
const RENAME_HINT = '1~10글자 · 같은 이름은 안 돼요'
const EMPTY = '아직 없어요. 아래에 적고 [더하기]를 눌러요'
const NO_DRUG = '약재 없음'
const NEED = '하나 이상 골라요'
const FREE = '안 골라도 돼요'

/** 이름 한도 (AC-3501.2): 앞뒤 빈칸을 뺀 1~10글자, "|"·제어 글자 없음 */
const NAME_MAX = 10
const BAD_CHAR = /[|\u0000-\u001f\u007f]/

/** 설정에서 더한 칸 열쇠 x1…x99 (reception-other-clinic AC-5701.2) */
const ADDED_KEY = /^x[1-9][0-9]?$/

/**
 * 칸마다 무리 (시안 COLS lists): key 무리 이름(data-g), path 초안 picks 안 자리, min 늘 남는 개수(마지막 ✕ 끄기, AC-3604.3),
 * max 개수 한도(AC-3501.2·AC-3603.2), flag 시술의 [약재 없음]. SONO 부위·부위 없이는 둘을 합쳐 하나가 남는다(APART)
 */
const LISTS = {
  carm: {
    fixed: null,
    groups: [
      { key: 'procs', path: ['carm', 'procs'], label: '시술', min: 1, max: 12, flag: true },
      { key: 'drugs', path: ['carm', 'drugs'], label: '약재', min: 0, max: 12 },
    ],
  },
  sono: {
    fixed: FIXED,
    groups: [
      { key: 'parts', path: ['sono', 'parts'], label: '부위', min: 0, max: 40 },
      { key: 'plains', path: ['sono', 'plains'], label: '부위 없이', min: 0, max: 12 },
      { key: 'withs', path: ['sono', 'withs'], label: '같이 하는 것', min: 0, max: 12 },
    ],
  },
  pt: { fixed: null, groups: [{ key: 'pt', path: ['pt'], label: '종류', min: 1, max: 8 }] },
  ds: { fixed: null, groups: [{ key: 'ds', path: ['ds'], label: '시간', min: 1, max: 8 }] },
  eswt: {
    fixed: ESWT_FIXED,
    groups: [
      { key: 'hits', path: ['eswt', 'hits'], label: '타수', min: 0, max: 8 },
      { key: 'counts', path: ['eswt', 'counts'], label: '부위 수', min: 1, max: 8 },
    ],
  },
  trac: { fixed: null, groups: [{ key: 'trac', path: ['trac'], label: '부위', min: 1, max: 8 }] },
}

/** 서로 겹치면 안 되는 무리 (SONO 부위 ↔ 부위 없이) */
const APART = { parts: 'plains', plains: 'parts' }

/** 칸의 목록 틀. 더한 칸은 "고르기" 한 줄(0~8개, 머리 글은 "하나 이상 골라요", AC-5713.7). 없으면 null */
function specOf(key) {
  if (Object.hasOwn(LISTS, key)) return LISTS[key]
  if (typeof key === 'string' && ADDED_KEY.test(key))
    return { fixed: null, groups: [{ key: 'extra', path: ['extra', key], label: '고르기', min: 0, max: 8, need: true, holder: '새 항목', aria: '새 고르기' }] }
  return null
}

/** 그 칸에 고르기 목록이 있는가 */
export function hasList(key) {
  return specOf(key) !== null
}

/** 초안 picks 안의 무리 목록(그 자리를 바꾼다). 없으면 빈 목록을 만든다 */
function listAt(picks, group) {
  const [head, tail] = group.path
  if (tail === undefined) {
    if (!Array.isArray(picks[head])) picks[head] = []
    return picks[head]
  }
  if (typeof picks[head] !== 'object' || picks[head] === null) picks[head] = {}
  if (!Array.isArray(picks[head][tail])) picks[head][tail] = []
  return picks[head][tail]
}

/** 이름 목록(시술은 { n, noDrug }의 n) */
function namesOf(list, group) {
  return group.flag ? list.map((item) => item?.n) : list
}

/**
 * [고르기 목록] 탭 몸.
 * @param {string} key 칸 열쇠
 * @param {object} picks 초안(설정 문서 picks 사본, 그 자리에서 바뀐다)
 * @param {{ typed: Record<string, string>, rename: object | null, draw: (focus?: object) => void }} ui
 * @returns {HTMLElement[]}
 */
export function listEditor(key, picks, ui) {
  const spec = specOf(key)
  if (!spec) return []
  if (!ui.typed) ui.typed = {}
  const lastOne = (group) => {
    if (group.key in APART) return listAt(picks, LISTS.sono.groups[0]).length + listAt(picks, LISTS.sono.groups[1]).length <= 1
    return group.min > 0 && listAt(picks, group).length <= group.min
  }
  const groupOf = (group) => {
    const items = listAt(picks, group)
    const input = el('input', {
      type: 'text',
      maxlength: String(NAME_MAX),
      placeholder: group.holder ?? `새 ${group.label}`,
      'aria-label': group.aria ?? `새 ${group.label}`,
      'data-g': group.key,
      on: {
        input: (event) => {
          ui.typed[group.key] = event.target.value
        },
      },
    })
    input.value = ui.typed[group.key] ?? ''
    const sub = `${group.min > 0 || group.need ? NEED : FREE} · ${items.length}개`
    return el('section', { class: 'lt-group', 'data-g': group.key }, [
      el('h3', null, [group.label, el('span', { class: 'sm' }, sub)]),
      items.length > 0 ? el('ul', { class: 'lt-list' }, items.map((item, i) => rowOf(group, item, i, items.length))) : el('div', { class: 'lt-empty' }, EMPTY),
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
  const rowOf = (group, item, i, count) => {
    const name = group.flag ? item.n : item
    if (ui.rename && ui.rename.g === group.key && ui.rename.i === i) return renameRowOf(group, name)
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
    const rename = ui.rename
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
    const rename = ui.rename
    if (!rename) return
    const list = listAt(picks, group)
    const name = rename.text.trim()
    if (!fits(picks, group, name, rename.i)) {
      rename.bad = true
      ui.draw({ rename: true })
      return
    }
    list[rename.i] = group.flag ? { n: name, noDrug: list[rename.i].noDrug === true } : name
    closeRename(group)
  }

  /** 바꾸기 줄을 닫고 그 줄 이름 단추에 초점을 둔다 */
  const closeRename = (group) => {
    const i = ui.rename?.i ?? 0
    ui.rename = null
    ui.draw({ g: group.key, op: 'name', i })
  }

  /** 이름(바꾸기 줄 열기)·▲·▼·✕·[약재 없음]: 초안만 바꾼다. 이름 말고는 바꾸던 줄을 닫는다 */
  const change = (group, op, i) => {
    const list = listAt(picks, group)
    if (op === 'name') {
      const item = list[i]
      ui.rename = { g: group.key, i, text: group.flag ? item.n : item, bad: false }
      ui.draw({ rename: true })
      return
    }
    ui.rename = null
    if (op === 'flag') list[i] = { n: list[i].n, noDrug: list[i].noDrug !== true }
    if (op === 'up' && i > 0) list.splice(i - 1, 0, ...list.splice(i, 1))
    if (op === 'down' && i < list.length - 1) list.splice(i + 1, 0, ...list.splice(i, 1))
    if (op === 'del' && !lastOne(group)) list.splice(i, 1)
    ui.draw({ g: group.key, op, i: op === 'up' ? i - 1 : op === 'down' ? i + 1 : i })
  }

  /** [더하기]: 규칙에 맞으면 끝에 더하고 글 칸을 비운다. 맞지 않으면 적던 글을 그대로 둔다 */
  const add = (group, raw) => {
    ui.typed[group.key] = raw
    const name = raw.trim()
    if (!fits(picks, group, name)) return
    listAt(picks, group).push(group.flag ? { n: name, noDrug: false } : name)
    ui.typed[group.key] = ''
    ui.draw({ g: group.key, op: 'input' })
  }

  return [
    el('p', { class: 'hint lt-top' }, TOP),
    spec.fixed ? el('p', { class: 'lt-fixed' }, spec.fixed) : null,
    el('div', { class: 'lt-groups' }, spec.groups.map(groupOf)),
  ].filter(Boolean)
}

/**
 * 다시 그린 목록에서 초점을 돌린다: { rename } 바꾸기 글 칸, { g, op: 'input' } 그 무리 글 칸, { g, op, i } 그 줄 단추.
 * 꺼진 단추면 root(창)에 둔다
 */
export function listFocus(root, focus) {
  if (!focus) return
  if (focus.rename) {
    const input = root.querySelector('.lt-rename')
    if (input) {
      input.focus({ preventScroll: true })
      input.setSelectionRange(input.value.length, input.value.length)
      return
    }
  }
  const target =
    focus.op === 'input'
      ? root.querySelector(`.lt-add > input[data-g="${focus.g}"]`)
      : root.querySelector(`.lt-groups button[data-g="${focus.g}"][data-op="${focus.op}"][data-i="${focus.i}"]`)
  if (target && !target.disabled) target.focus({ preventScroll: true })
  else root.focus({ preventScroll: true })
}

/** 설정 쪽 칸 줄의 요약 글 (시안 listJoin): 무리 하나면 목록을 "·"로, 여럿이면 "{무리} N개"를 " · "로 잇는다. 목록이 없으면 빈 글 */
export function listSummary(key, picks) {
  const spec = specOf(key)
  if (!spec || typeof picks !== 'object' || picks === null) return ''
  const read = (group) => {
    const [head, tail] = group.path
    const list = tail === undefined ? picks[head] : picks[head]?.[tail]
    return Array.isArray(list) ? namesOf(list, group) : []
  }
  const lists = spec.groups.map(read)
  if (lists.length === 1) return lists[0].join('·')
  return spec.groups.map((group, i) => `${group.label} ${lists[i].length}개`).join(' · ')
}

/**
 * 초안에 더해도 되는 이름인가 (AC-3501.2). self가 있으면 그 자리 이름 바꾸기다: 자기 자신과는 겹침으로 보지 않고 개수 한도는 보지 않는다(AC-3604.2)
 */
function fits(picks, group, name, self = -1) {
  if (name.length < 1 || name.length > NAME_MAX || BAD_CHAR.test(name)) return false
  const list = listAt(picks, group)
  if (self < 0 && list.length >= group.max) return false
  if (namesOf(list, group).some((item, i) => i !== self && item === name)) return false
  const apart = APART[group.key]
  return !(apart && listAt(picks, LISTS.sono.groups.find((g) => g.key === apart)).includes(name))
}
