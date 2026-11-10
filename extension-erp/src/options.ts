// 확장 설정 화면(design.md 4절 · 승인된 목업 docs/mockups/erp-closing-fill/ ⑫~⑮). 글은 목업 그대로다
// 코드 목록은 서비스 워커를 거쳐 도우미 closing.codes로 받고({ cmd, args } → { type: 'result', data } | { type: 'error', code }),
// 고른 것은 chrome.storage.local erpClosing 한 칸에만 둔다. 도우미 답은 저장하지 않는다
// 도우미가 준 코드 이름은 글자(textContent)로만 그린다
// 씨암·SONO 줄 아래 '매출로 셀 코드' 줄(TASK-15)은 design.md 4절 글 그대로다(목업 없이 명세 글로 만듦)
// TASK-18(design.md 5-3 글 그대로, 사용자가 목업 승인을 기다리지 말라고 함): 받는 중 줄 · 닫을 때 묻기(beforeunload) · 저장 실패 글 ·
// [저장] 차례(겹침 막기 → 처방 없는 코드 묻기 → 쓰기) · [처음 값으로] 묻기 · 새 처음 코드 줄. 묻는 글은 저장 바 바로 위 알림 상자(#optAsk)
// 코드 목록 오류 줄은 errors.ts 한 곳의 글만 쓴다(AC-3614.1)
import { E_BRIDGE_BAD_REPLY, E_HELPER_MISSING, explain } from './errors.js'
import {
  addCode,
  addKind,
  addPrefix,
  conflicts,
  defaults,
  load,
  MAX_CODES,
  MAX_PREFIXES,
  newDefaultCodes,
  resetCodes,
  save,
  search,
  unusedCodes,
  without,
} from './settings.js'
import type { Conflict } from './settings.js'
import { AMOUNT_KEYS, GROUP_NAMES, RSV_NAMES, RSV_ROWS } from './types.js'
import type { AmountKey, ClosingCodes, EtcKey, GroupKey, RsvRow, Settings } from './types.js'

/** 묶음(design.md 2절 '/' 나눔)과 줄마다 쓰는 칸. 줄 차례를 이어 붙이면 GROUP_KEYS 차례다 */
const SECTIONS: { title: string; about: string; rows: [GroupKey, string][] }[] = [
  {
    title: '치료별 건수 · 매출',
    about:
      "그날 고른 코드 가운데 하나라도 받은 환자 수를 건수로, 그날 고른 코드 처방 줄의 금액 합을 매출로 채워요. 씨암 · SONO 매출은 그 줄의 '매출로 셀 코드'로 세요.",
    rows: [
      ['carm', '업무일지 1 씨암 · 업무일지 2 씨암(주사) 건수 · 매출'],
      ['sono', '업무일지 1 SONO · 업무일지 2 SONO(주사) 건수 · 매출'],
      ['arthro', '업무일지 1 관절조영술 · 업무일지 2 관절조영 건수 · 매출'],
      ['manual', '업무일지 1 도수치료 · 업무일지 2 도수 건수 · 매출 · 도수 총금액'],
      ['eswt', '업무일지 1 충격파(체충) · 업무일지 2 충격파 건수 · 매출 · 충격파 총금액'],
      ['pt', '업무일지 2 물리치료 매출'],
      ['etc1', '업무일지 2 이 이름 줄의 건수 · 매출'],
      ['etc2', '업무일지 2 이 이름 줄의 건수 · 매출'],
      ['etc3', '업무일지 2 이 이름 줄의 건수 · 매출'],
      ['etc4', '업무일지 2 이 이름 줄의 건수 · 매출'],
    ],
  },
  {
    title: '진료 · 치료현황만',
    about: '고른 코드를 받은 환자 수를 업무일지 1 진료 · 치료현황에 채워요.',
    rows: [
      ['manualConsult', '업무일지 1 도수상담'],
      ['lipus', '업무일지 1 리푸스'],
      ['nail', '업무일지 1 손발톱케어'],
      ['ct', '업무일지 1 CT'],
      ['surgery', '업무일지 1 수술'],
    ],
  },
  {
    title: '운영 지표',
    about: '주사1회환자는 그날 고른 주사를 맞았고 그 전 비트 기록에 고른 주사가 없는 환자예요.',
    rows: [
      ['eswtStd', '업무일지 2 ESWT Standard'],
      ['eswtRadial', '업무일지 2 ESWT Radial'],
      ['injection', '업무일지 2 주사1회환자 · 신환주사환자 · 신환주사건수'],
    ],
  },
  {
    title: '환자현황',
    about: '고른 코드를 받은 환자(신환 · 90일초진 아님)를 물리치료내원으로 세고, 재진 · 진찰료 산정안함에서 빼요.',
    rows: [['ptVisit', '업무일지 1 환자현황 물리치료내원']],
  },
]

const RSV_ABOUT =
  'ERP 예약 표 줄마다 비트 예약 메모 번호를 고르세요. 고른 번호들의 예약을 더해 총갯수 · 내원 · 변경 · 취소를 채워요. 실예약환자수는 늘 채워요.'
const LEAD = 'ERP 칸마다 셀 비트 처방 코드를 고르세요. 여러 개를 고를 수 있어요. 코드를 고르지 않은 항목의 칸은 건드리지 않아요.'
const FIRST = '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요.'
const FOOT = '환자 이름 · 차트번호는 이 PC의 도우미 밖으로 나가지 않아요. ERP 화면에는 숫자만 넣고, 저장은 ERP에서 직접 눌러요.'

/** 씨암·SONO 매출 규칙 줄 글(design.md 4절) */
const AMOUNT = {
  title: '매출로 셀 코드',
  about: (name: string) =>
    `${name} 코드가 있는 진료에서 아래 코드의 금액만 치료별 매출 ${name}에 넣어요. 앞글자는 바로 뒤가 숫자인 코드만 세요(예: LA → LA358·LA272는 세고 LAYLA는 안 세요).`,
  prefixes: '이 글자 뒤에 숫자',
  prefixChip: (prefix: string) => `${prefix}+숫자`,
  prefixPlaceholder: '예: LA',
  add: '더하기',
  codes: '더 셀 코드',
  empty: '비어 있으면 위 코드 줄 금액만 넣어요.',
}
const isAmountKey = (key: string | undefined): key is AmountKey => (AMOUNT_KEYS as readonly string[]).includes(key ?? '')

/** 설정 화면 글(design.md 5-3) */
const TEXT = {
  loading: '코드 목록을 받는 중이에요(30초쯤).',
  codesFailed: '도우미에서 코드 목록을 받지 못했어요 ',
  codesFailedTail: '고른 코드는 그대로 두고 저장할 수 있어요. 고친 뒤 이 화면을 새로고침(F5)하면 목록을 다시 받아요.',
  saveFailed: '저장하지 못했어요. 이 화면을 닫지 말고 [저장]을 다시 눌러 주세요.',
  unused: (n: number) => `최근 1년에 처방이 없는 코드 ${count(n)}개 — 맞나요?`,
  unusedNote: '다른 의원 코드거나 잘못 고른 코드면 그 칸은 매일 0이 돼요.',
  keep: '그대로 저장',
  back: '돌아가기',
  reset: '고른 코드와 씨암·SONO 매출 규칙을 처음 값으로 바꿀까요?',
  resetNote: '예약 메모 번호와 기타 줄 이름은 그대로 둬요. 바꾼 뒤 [저장]을 눌러야 저장돼요.',
  doReset: '바꾸기',
  cancel: '그만두기',
  fresh: '새 처음 코드가 있어요:',
  freshNote: '[더하기]를 누르면 화면에 더해요. [저장]을 눌러야 저장돼요.',
  freshAdd: '더하기',
  blocked: '저장하지 않았어요.',
}

/** 겹침 막는 글 한 줄(design.md 5-3) */
function conflictLine(c: Conflict): string {
  if (c.kind === 'fixedName') {
    return `${GROUP_NAMES[c.etc]} 줄 이름 ‘${c.name}’은 업무일지 2에 이미 있는 줄 이름이에요. 다른 이름을 넣어 주세요.`
  }
  if (c.kind === 'sameName') {
    return `${c.etcs.map((etc) => GROUP_NAMES[etc]).join('·')} 줄 이름이 ‘${c.name}’으로 같아요. 서로 다르게 넣어 주세요.`
  }
  return `예약 메모 ${c.memo}번이 ${c.rows.map((row) => RSV_NAMES[row]).join('·')} 줄에 함께 있어요. 한 줄에만 두세요.`
}

type Codes =
  | { status: 'loading' }
  | { status: 'ok'; list: ClosingCodes['codes']; names: Map<string, string | null>; kinds: ClosingCodes['kinds'] }
  | { status: 'error'; code: string }

/** 저장 바 바로 위 알림 상자: 처방 없는 코드 묻기 · [처음 값으로] 묻기 · 겹침 막는 글 */
type Ask =
  | { kind: 'unused'; items: { key: GroupKey; code: string }[] }
  | { kind: 'reset' }
  | { kind: 'blocked'; conflicts: Conflict[] }

type Page = {
  settings: Settings
  /** 지금 저장돼 있는 설정(처방 없는 코드 묻기가 '새로 고른 코드'를 가리는 데 쓴다). 저장한 적이 없으면 null */
  saved: Settings | null
  everSaved: boolean
  dirty: boolean
  /** 마지막 [저장]이 chrome.storage 오류로 쓰지 못했다(다음 [저장]까지 상태 줄에 실패 글) */
  saveFailed: boolean
  /** 새 처음 코드(AC-3615.6). [더하기]·[저장] 뒤엔 빈 목록 */
  fresh: { key: GroupKey; codes: string[] }[]
  ask: Ask | null
  /** 바꿀 때마다 1씩: 저장하는 동안 또 바꿨는지 본다 */
  rev: number
  codes: Codes
  /** 열린 찾기 칸: 고른 코드 찾기, amount면 씨암·SONO 더 셀 코드 찾기 */
  open: { key: GroupKey; text: string; amount?: boolean } | null
  /** 씨암·SONO 앞글자 칸에 쓰는 중인 글자(다시 그려도 남게) */
  drafts: Partial<Record<AmountKey, string>>
}

let page: Page
let main: HTMLElement
let stop: AbortController | null = null

/** 설정 복사본(화면이 고치는 값과 저장값이 한 객체를 나눠 쓰지 않게) */
const copyOf = (settings: Settings): Settings => JSON.parse(JSON.stringify(settings)) as Settings

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isName = (value: unknown): value is string | null => value === null || typeof value === 'string'

/** closing.codes 답 모양 검사. 아는 칸만 옮긴다 */
function readCodes(data: unknown): ClosingCodes | null {
  if (!isRecord(data) || !Array.isArray(data.codes) || !Array.isArray(data.kinds)) return null
  const codes: ClosingCodes['codes'] = []
  for (const c of data.codes) {
    if (!isRecord(c) || typeof c.code !== 'string' || !isName(c.name) || typeof c.visits !== 'number' || !Number.isFinite(c.visits)) {
      return null
    }
    codes.push({ code: c.code, name: c.name, visits: c.visits })
  }
  const kinds: ClosingCodes['kinds'] = []
  for (const k of data.kinds) {
    if (!isRecord(k) || typeof k.kind !== 'string' || !isName(k.name)) return null
    kinds.push({ kind: k.kind, name: k.name })
  }
  return { codes, kinds }
}

/** 서비스 워커에 closing.codes를 묻는다. 답이 없거나 연결이 없으면 E-HELPER-MISSING, 번호 모양이 아니면 E-BRIDGE-BAD-REPLY(errors.ts) */
async function askCodes(): Promise<Codes> {
  let reply: unknown
  try {
    reply = await chrome.runtime.sendMessage({ cmd: 'closing.codes', args: {} })
  } catch {
    return { status: 'error', code: E_HELPER_MISSING }
  }
  if (reply === undefined || reply === null) return { status: 'error', code: E_HELPER_MISSING }
  if (isRecord(reply) && reply.type === 'error') return { status: 'error', code: explain(reply.code).code }
  const data = isRecord(reply) && reply.type === 'result' ? readCodes(reply.data) : null
  if (!data) return { status: 'error', code: E_BRIDGE_BAD_REPLY }
  return { status: 'ok', list: data.codes, names: new Map(data.codes.map((c) => [c.code, c.name])), kinds: data.kinds }
}

// --- 그리기 ---

type Child = Node | string | null | undefined | false

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) node.setAttribute(name, '')
    else if (typeof value === 'string') node.setAttribute(name, value)
  }
  for (const child of children) if (child) node.append(child)
  return node
}

const count = (n: number) => n.toLocaleString('ko-KR')

function byId(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (!found) throw new Error(`#${id}`)
  return found
}

/** 코드 목록 줄: 받는 중 → 받은 줄 | 오류 줄(굵은 줄 · errors.ts '{무엇이} {어떻게}' · 끝 줄) */
function helperNotice(): HTMLElement {
  const codes = page.codes
  if (codes.status === 'loading') return h('p', { class: 'notice wait' }, TEXT.loading)
  if (codes.status === 'ok') {
    return h('p', { class: 'notice ok' }, `비트에서 최근 1년 처방 코드 ${count(codes.list.length)}개와 예약 메모 ${count(codes.kinds.length)}개를 받았어요.`)
  }
  const said = explain(codes.code)
  return h(
    'div',
    { class: 'notice err' },
    h('b', {}, TEXT.codesFailed, h('span', { class: 'nw' }, `(${said.code})`)),
    h('p', {}, `${said.what} ${said.how}`),
    h('p', {}, TEXT.codesFailedTail),
  )
}

/** 맨 위 '새 처음 코드' 줄(AC-3615.6). 이미 화면에 있는 코드는 빼고, 남은 것이 없으면 없다 */
function freshNotice(): HTMLElement | null {
  const items = page.fresh
    .map(({ key, codes }) => ({ key, codes: codes.filter((code) => !(page.settings.picks[key] ?? []).includes(code)) }))
    .filter((item) => item.codes.length > 0)
  if (items.length === 0) return null
  return h(
    'div',
    { class: 'notice fresh' },
    h('p', {}, h('b', {}, TEXT.fresh), ' ', items.map(({ key, codes }) => `${GROUP_NAMES[key]} ${codes.join('·')}`).join(' · ')),
    h('p', {}, TEXT.freshNote),
    h('button', { type: 'button', class: 'btn btn-2', 'data-fresh': '' }, TEXT.freshAdd),
  )
}

/** 코드 조각. del = [×] 단추의 칸 이름(고른 코드 data-del · 더 셀 코드 data-adel) */
function codeChip(code: string, del = 'data-del'): HTMLElement {
  let name: HTMLElement | null = null
  // 목록을 모르면(받는 중·못 받음) 코드만 보인다
  if (page.codes.status === 'ok') {
    const known = page.codes.names.get(code)
    if (known === undefined) name = h('span', { class: 'cn gone' }, '(최근 1년 처방 없음)')
    else if (known) name = h('span', { class: 'cn' }, known)
  }
  return h(
    'span',
    { class: 'chip' },
    h('b', {}, code),
    name,
    h('button', { type: 'button', [del]: code, 'aria-label': `${code} 빼기` }, '×'),
  )
}

/** 찾기 결과. amount면 씨암·SONO 더 셀 코드 찾기(data-aadd, 골랐는지는 그 규칙의 더 셀 코드로 본다) */
function results(key: GroupKey, text: string, amount = false): HTMLElement[] {
  if (page.codes.status !== 'ok') return []
  const found = search(page.codes.list, text)
  if (found.length === 0) return [h('p', { class: 'empty' }, '맞는 코드가 없어요.')]
  const mine = amount && isAmountKey(key) ? page.settings.amounts[key].codes : (page.settings.picks[key] ?? [])
  return found.map((c) => {
    const has = mine.includes(c.code)
    return h(
      'button',
      { type: 'button', [amount ? 'data-aadd' : 'data-add']: c.code, disabled: has },
      h('b', {}, c.code),
      h('span', {}, c.name ?? ''),
      h('em', {}, has ? '골랐어요' : `최근 1년 ${count(c.visits)}번`),
    )
  })
}

/** 찾기 칸 안내 글: 목록을 못 받음 · 20개 다 고름 · 보통 */
function findPlaceholder(full: boolean): string {
  if (page.codes.status === 'error') return '코드 목록을 받지 못해 찾을 수 없어요'
  return full ? '20개까지 고를 수 있어요' : '코드나 이름으로 찾기'
}

function codeRow(key: GroupKey, use: string): HTMLElement {
  const name = GROUP_NAMES[key]
  const mine = page.settings.picks[key] ?? []
  const full = mine.length >= MAX_CODES
  const placeholder = findPlaceholder(full)
  const open = page.open?.key === key && !page.open.amount ? page.open.text : ''
  const etc = key === 'etc1' || key === 'etc2' || key === 'etc3' || key === 'etc4'
    ? h(
        'label',
        { class: 'etc' },
        h('span', {}, 'ERP 줄 이름'),
        h('input', {
          type: 'text',
          maxlength: '20',
          'data-etc': key,
          value: page.settings.etcNames[key],
          placeholder: '업무일지 2 줄 이름과 똑같이',
        }),
      )
    : null
  return h(
    'div',
    { class: 'orow', 'data-row': key },
    h('div', { class: 'oname' }, h('b', {}, name), h('small', {}, use)),
    h(
      'div',
      { class: 'opick' },
      etc,
      h(
        'div',
        { class: 'pickline' },
        ...(mine.length > 0 ? mine.map((code) => codeChip(code)) : [h('span', { class: 'none' }, '고른 코드 없음 · 이 칸은 채우지 않아요')]),
        h(
          'div',
          { class: 'find' },
          h('input', {
            type: 'search',
            'data-find': key,
            placeholder,
            value: open,
            disabled: page.codes.status !== 'ok' || full,
            'aria-label': `${name} 코드 찾기`,
            autocomplete: 'off',
          }),
          h('div', { class: 'dd', 'data-dd': key, hidden: !open.trim() }, ...(open.trim() ? results(key, open) : [])),
        ),
      ),
    ),
  )
}

/**
 * 씨암·SONO 줄 바로 아래 '매출로 셀 코드' 줄(design.md 4절, TASK-15): 안내 글 · '이 글자 뒤에 숫자' 앞글자 조각과 [×] + 글자 칸 + [더하기]
 * · '더 셀 코드' 조각 + 찾기 · 둘 다 비면 그 뜻 한 줄. 두 줄 모양은 같다
 */
function amountRow(key: AmountKey): HTMLElement {
  const name = GROUP_NAMES[key]
  const rule = page.settings.amounts[key]
  const prefixFull = rule.prefixes.length >= MAX_PREFIXES
  const codesFull = rule.codes.length >= MAX_CODES
  const open = page.open?.key === key && page.open.amount ? page.open.text : ''
  const prefixChips = rule.prefixes.map((prefix) =>
    h(
      'span',
      { class: 'chip' },
      h('b', {}, AMOUNT.prefixChip(prefix)),
      h('button', { type: 'button', 'data-pdel': prefix, 'aria-label': `${prefix} 빼기` }, '×'),
    ),
  )
  return h(
    'div',
    { class: 'orow amt', 'data-amount': key },
    h('div', { class: 'oname' }, h('b', {}, AMOUNT.title)),
    h(
      'div',
      { class: 'opick' },
      h('p', { class: 'about' }, AMOUNT.about(name)),
      h(
        'div',
        { class: 'pickline', 'data-prefixes': key },
        h('span', { class: 'sub' }, AMOUNT.prefixes),
        ...prefixChips,
        h(
          'span',
          { class: 'padd' },
          h('input', {
            type: 'text',
            maxlength: '10',
            'data-prefix': key,
            value: page.drafts[key] ?? '',
            placeholder: AMOUNT.prefixPlaceholder,
            'aria-label': `${name} 앞글자 더하기`,
            disabled: prefixFull,
            autocomplete: 'off',
          }),
          h('button', { type: 'button', class: 'btn btn-2', 'data-padd': key, disabled: prefixFull }, AMOUNT.add),
        ),
      ),
      h(
        'div',
        { class: 'pickline', 'data-extras': key },
        h('span', { class: 'sub' }, AMOUNT.codes),
        ...rule.codes.map((code) => codeChip(code, 'data-adel')),
        h(
          'div',
          { class: 'find' },
          h('input', {
            type: 'search',
            'data-afind': key,
            placeholder: findPlaceholder(codesFull),
            value: open,
            disabled: page.codes.status !== 'ok' || codesFull,
            'aria-label': `${name} 더 셀 코드 찾기`,
            autocomplete: 'off',
          }),
          h('div', { class: 'dd', 'data-add-dd': key, hidden: !open.trim() }, ...(open.trim() ? results(key, open, true) : [])),
        ),
      ),
      rule.prefixes.length === 0 && rule.codes.length === 0 && h('p', { class: 'none' }, AMOUNT.empty),
    ),
  )
}

function rsvRow(row: RsvRow): HTMLElement {
  const name = RSV_NAMES[row]
  const mine = page.settings.reservations[row] ?? []
  const codes = page.codes
  const kinds = codes.status === 'ok' ? codes.kinds : []
  const kindName = (kind: string) => kinds.find((k) => k.kind === kind)?.name ?? null
  const chips = mine.map((kind) => {
    const known = kindName(kind)
    return h(
      'span',
      { class: 'chip' },
      h('b', {}, `${kind}번`),
      known ? h('span', { class: 'cn' }, known) : null,
      h('button', { type: 'button', 'data-rdel': kind, 'aria-label': `${kind}번 빼기` }, '×'),
    )
  })
  const options = kinds
    .filter((k) => !mine.includes(k.kind))
    .map((k) => h('option', { value: k.kind }, k.name ? `${k.kind}번 · ${k.name}` : `${k.kind}번`))
  return h(
    'div',
    { class: 'orow', 'data-rsv': row },
    h('div', { class: 'oname' }, h('b', {}, name), h('small', {}, `업무일지 2 예약 표 ${name} 줄`)),
    h(
      'div',
      { class: 'opick' },
      h(
        'div',
        { class: 'pickline' },
        ...(chips.length > 0 ? chips : [h('span', { class: 'none' }, '고른 메모 없음 · 이 줄은 채우지 않아요')]),
        h(
          'select',
          { 'data-radd': row, 'aria-label': `${name} 줄에 예약 메모 더하기`, disabled: codes.status !== 'ok' },
          h('option', { value: '' }, codes.status === 'error' ? '메모 목록을 받지 못했어요' : '예약 메모 더하기'),
          ...options,
        ),
      ),
    ),
  )
}

/** 다시 그린 뒤 입력 중이던 칸으로 돌아갈 선택자 */
function focusTarget(): { selector: string; start: number | null; end: number | null } | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !main.contains(active)) return null
  for (const attr of ['data-etc', 'data-find', 'data-radd', 'data-prefix', 'data-afind']) {
    const value = active.getAttribute(attr)
    if (value !== null) {
      const field = active instanceof HTMLInputElement ? active : null
      return { selector: `[${attr}="${value}"]`, start: field?.selectionStart ?? null, end: field?.selectionEnd ?? null }
    }
  }
  return null
}

function renderMain(focus = focusTarget()) {
  const parts: Child[] = [
    freshNotice(),
    !page.everSaved && h('p', { class: 'notice first' }, h('b', {}, FIRST), ' 지금 들어 있는 코드는 처음 값이에요.'),
    h('p', { class: 'lead-p' }, LEAD),
    helperNotice(),
    ...SECTIONS.map((s) =>
      h(
        'section',
        { class: 'osec' },
        h('h2', {}, s.title),
        h('p', {}, s.about),
        ...s.rows.flatMap(([key, use]) => (isAmountKey(key) ? [codeRow(key, use), amountRow(key)] : [codeRow(key, use)])),
      ),
    ),
    h('section', { class: 'osec' }, h('h2', {}, '예약'), h('p', {}, RSV_ABOUT), ...RSV_ROWS.map(rsvRow)),
    h('p', { class: 'foot' }, FOOT),
  ]
  main.replaceChildren(...parts.filter((p): p is Node | string => Boolean(p)))
  if (!focus) return
  const field = main.querySelector<HTMLElement>(focus.selector)
  if (!field || (field instanceof HTMLInputElement && field.disabled) || (field instanceof HTMLSelectElement && field.disabled)) return
  field.focus()
  if (field instanceof HTMLInputElement && field.type === 'text' && focus.start !== null) {
    field.setSelectionRange(focus.start, focus.end ?? focus.start)
  }
}

function renderStatus() {
  const status = byId('optStatus')
  if (page.saveFailed) {
    // 저장 실패(AC-3615.3): 주의 색 글. 크롬 오류 글은 보이지 않는다
    status.className = 'status dirty failed'
    status.textContent = TEXT.saveFailed
    return
  }
  status.className = 'status' + (page.dirty ? ' dirty' : page.everSaved ? ' saved' : '')
  status.textContent = page.dirty ? '바꾼 것을 아직 저장하지 않았어요.' : page.everSaved ? '저장했어요.' : '아직 한 번도 저장하지 않았어요.'
}

/** 저장 바 바로 위 알림 상자를 그린다. focus = 먼저 포커스를 받을 단추(data-ask) */
function renderAsk(focus?: string) {
  const box = byId('optAsk')
  const ask = page.ask
  box.hidden = ask === null
  box.className = 'askbox' + (ask?.kind === 'blocked' ? ' block' : '')
  if (!ask) {
    box.replaceChildren()
    return
  }
  const button = (name: string, label: string) => h('button', { type: 'button', class: 'btn btn-2', 'data-ask': name }, label)
  let lines: HTMLElement[]
  let buttons: HTMLElement[] = []
  if (ask.kind === 'unused') {
    lines = [
      h('b', {}, TEXT.unused(ask.items.length)),
      h('p', {}, ask.items.map(({ key, code }) => `${GROUP_NAMES[key]} ${code}`).join(' · ')),
      h('p', {}, TEXT.unusedNote),
    ]
    buttons = [button('keep', TEXT.keep), button('back', TEXT.back)]
  } else if (ask.kind === 'reset') {
    lines = [h('b', {}, TEXT.reset), h('p', {}, TEXT.resetNote)]
    buttons = [button('reset', TEXT.doReset), button('cancel', TEXT.cancel)]
  } else {
    lines = [...ask.conflicts.map((c) => h('p', {}, conflictLine(c))), h('b', {}, TEXT.blocked)]
  }
  box.replaceChildren(h('div', { class: 'in' }, h('div', { class: 'msg' }, ...lines), buttons.length > 0 && h('div', { class: 'acts' }, ...buttons)))
  if (focus) box.querySelector<HTMLElement>(`[data-ask="${focus}"]`)?.focus()
}

function showAsk(ask: Ask, focus?: string) {
  page.ask = ask
  renderAsk(focus)
}

function closeAsk() {
  page.ask = null
  renderAsk()
}

/** 화면 값을 바꿨다: 저장 안 함 상태로, 열린 묻기·막는 글은 지난 값이라 닫는다 */
function changed() {
  page.dirty = true
  page.rev += 1
  if (page.ask) closeAsk()
  renderStatus()
}

function closeFind() {
  page.open = null
  for (const dd of main.querySelectorAll<HTMLElement>('.dd')) dd.hidden = true
}

// --- 누르기 ---

/** 찾기 칸 하나만 연다(다른 찾기 목록은 닫는다) */
function openFind(key: GroupKey, text: string, amount: boolean) {
  page.open = { key, text, amount }
  const mine = main.querySelector<HTMLElement>(amount ? `[data-add-dd="${key}"]` : `[data-dd="${key}"]`)
  for (const dd of main.querySelectorAll<HTMLElement>('.dd')) {
    if (dd !== mine) dd.hidden = true
  }
  if (mine) {
    mine.hidden = !text.trim()
    mine.replaceChildren(...(text.trim() ? results(key, text, amount) : []))
  }
}

/** 앞글자 칸 글자를 대문자로 더한다(꼴이 틀렸거나 겹치거나 5개면 그대로 두고 글자도 남긴다) */
function addPrefixFrom(key: AmountKey) {
  const rule = page.settings.amounts[key]
  const input = main.querySelector<HTMLInputElement>(`[data-prefix="${key}"]`)
  const next = addPrefix(rule.prefixes, input?.value ?? page.drafts[key] ?? '')
  if (next.length === rule.prefixes.length) return
  page.settings.amounts[key] = { ...rule, prefixes: next }
  page.drafts[key] = ''
  changed()
  renderMain({ selector: `[data-prefix="${key}"]`, start: null, end: null })
}

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const find = target.dataset.find as GroupKey | undefined
  if (find) {
    openFind(find, target.value, false)
    return
  }
  const afind = target.dataset.afind
  if (isAmountKey(afind)) {
    openFind(afind, target.value, true)
    return
  }
  const prefix = target.dataset.prefix
  if (isAmountKey(prefix)) {
    page.drafts[prefix] = target.value
    return
  }
  const etc = target.dataset.etc as EtcKey | undefined
  if (etc) {
    page.settings.etcNames[etc] = target.value
    changed()
  }
}

function onChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement) || !target.value) return
  const row = target.dataset.radd as RsvRow | undefined
  if (!row) return
  page.settings.reservations[row] = addKind(page.settings.reservations[row] ?? [], target.value)
  changed()
  renderMain({ selector: `[data-radd="${row}"]`, start: null, end: null })
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target
  if (event.key !== 'Enter' || !(target instanceof HTMLInputElement)) return
  const prefix = target.dataset.prefix
  if (!isAmountKey(prefix)) return
  event.preventDefault()
  addPrefixFrom(prefix)
}

/** 씨암·SONO '매출로 셀 코드' 줄 단추. 그 줄 단추였으면 true */
function onAmountClick(target: Element): boolean {
  const key = target.closest<HTMLElement>('[data-amount]')?.dataset.amount
  if (!isAmountKey(key)) return false
  const rule = page.settings.amounts[key]
  const add = target.closest<HTMLElement>('[data-aadd]')
  if (add) {
    page.settings.amounts[key] = { ...rule, codes: addCode(rule.codes, add.dataset.aadd ?? '') }
    page.open = null
    changed()
    renderMain({ selector: `[data-afind="${key}"]`, start: null, end: null })
    return true
  }
  const del = target.closest<HTMLElement>('[data-adel]')
  if (del) {
    page.settings.amounts[key] = { ...rule, codes: without(rule.codes, del.dataset.adel ?? '') }
    changed()
    renderMain()
    return true
  }
  const pdel = target.closest<HTMLElement>('[data-pdel]')
  if (pdel) {
    page.settings.amounts[key] = { ...rule, prefixes: without(rule.prefixes, pdel.dataset.pdel ?? '') }
    changed()
    renderMain()
    return true
  }
  if (target.closest('[data-padd]')) {
    addPrefixFrom(key)
    return true
  }
  return false
}

/** 새 처음 코드 [더하기]: 화면에 더한다(항목마다 20개까지, 저장은 [저장]) */
function addFresh() {
  for (const { key, codes } of page.fresh) {
    page.settings.picks[key] = codes.reduce<string[]>((list, code) => addCode(list, code), page.settings.picks[key] ?? [])
  }
  page.fresh = []
  changed()
  renderMain()
}

function onClick(event: Event) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('[data-fresh]')) {
    addFresh()
    return
  }
  if (onAmountClick(target)) return
  const add = target.closest<HTMLElement>('[data-add]')
  const key = target.closest<HTMLElement>('[data-row]')?.dataset.row as GroupKey | undefined
  if (add && key) {
    page.settings.picks[key] = addCode(page.settings.picks[key] ?? [], add.dataset.add ?? '')
    page.open = null
    changed()
    renderMain({ selector: `[data-find="${key}"]`, start: null, end: null })
    return
  }
  const del = target.closest<HTMLElement>('[data-del]')
  if (del && key) {
    page.settings.picks[key] = without(page.settings.picks[key] ?? [], del.dataset.del ?? '')
    changed()
    renderMain()
    return
  }
  const rdel = target.closest<HTMLElement>('[data-rdel]')
  const row = target.closest<HTMLElement>('[data-rsv]')?.dataset.rsv as RsvRow | undefined
  if (rdel && row) {
    page.settings.reservations[row] = without(page.settings.reservations[row] ?? [], rdel.dataset.rdel ?? '')
    changed()
    renderMain()
  }
}

/** [저장] 차례(design.md 4절): 겹침이면 막는 글(쓰지 않음) → 코드 목록을 받았고 처방 없는 새 코드가 있으면 묻기 → 쓰기 */
function onSave() {
  const found = conflicts(page.settings)
  if (found.length > 0) {
    showAsk({ kind: 'blocked', conflicts: found })
    return
  }
  if (page.codes.status === 'ok') {
    const items = unusedCodes(page.settings, page.saved, page.codes.list)
    if (items.length > 0) {
      showAsk({ kind: 'unused', items }, 'back')
      return
    }
  }
  void write()
}

/** chrome.storage에 쓴다. 못 쓰면 저장 실패 글이고 화면의 바꾼 것·저장 안 함 상태는 그대로다(AC-3615.3) */
async function write() {
  closeAsk()
  page.saveFailed = false
  const rev = page.rev
  let saved: Settings
  try {
    saved = await save(page.settings)
  } catch {
    page.saveFailed = true
    renderStatus()
    return
  }
  page.everSaved = true
  page.saved = saved
  page.fresh = [] // defaultsSeen이 지금 판으로 쓰였다
  if (page.rev === rev) {
    page.settings = copyOf(saved)
    page.dirty = false
  }
  page.open = null
  renderMain()
  renderStatus()
}

/** [처음 값으로]: 먼저 묻는다(AC-3615.5) */
function onReset() {
  showAsk({ kind: 'reset' }, 'cancel')
}

function onAskClick(event: Event) {
  const name = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ask]')?.dataset.ask : undefined
  if (name === 'keep') {
    void write()
  } else if (name === 'back') {
    closeAsk()
    byId('optSave').focus()
  } else if (name === 'reset') {
    // 고른 코드·매출 규칙만 처음 값(기타 줄 이름·예약 메모·overlap·defaultsSeen은 그대로), 저장은 [저장]
    closeAsk()
    page.settings = resetCodes(page.settings)
    page.open = null
    page.drafts = {}
    changed()
    renderMain()
  } else if (name === 'cancel') {
    closeAsk()
    byId('optReset').focus()
  }
}

/** 저장하지 않은 바꿈이 있으면 탭을 닫거나 새로고침할 때 크롬 나가기 확인 창을 띄운다(AC-3615.2, 창 글은 크롬 것) */
function onLeave(event: BeforeUnloadEvent) {
  if (!page.dirty) return
  event.preventDefault()
  event.returnValue = ''
}

/** 설정 화면을 연다. 저장한 설정(없으면 처음 값)을 그리고, 도우미 코드 목록이 오면 다시 그린다 */
export async function startOptions(): Promise<void> {
  stop?.abort()
  const controller = new AbortController()
  stop = controller
  const signal = controller.signal
  main = byId('optMain')
  const codes = askCodes()
  const stored = await load().catch(() => null)
  page = {
    settings: stored ? copyOf(stored) : defaults(),
    saved: stored,
    everSaved: stored !== null,
    dirty: false,
    saveFailed: false,
    fresh: stored ? newDefaultCodes(stored) : [],
    ask: null,
    rev: 0,
    codes: { status: 'loading' },
    open: null,
    drafts: {},
  }

  main.addEventListener('input', onInput, { signal })
  main.addEventListener('change', onChange, { signal })
  main.addEventListener('click', onClick, { signal })
  main.addEventListener('keydown', onKeydown, { signal })
  byId('optSave').addEventListener('click', onSave, { signal })
  byId('optReset').addEventListener('click', onReset, { signal })
  byId('optAsk').addEventListener('click', onAskClick, { signal })
  window.addEventListener('beforeunload', onLeave, { signal })
  document.addEventListener(
    'click',
    (event) => {
      if (page.open && !(event.target instanceof Element && event.target.closest('.find'))) closeFind()
    },
    { signal },
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && page.open) closeFind()
    },
    { signal },
  )
  renderMain()
  renderStatus()
  renderAsk()

  const got = await codes
  if (signal.aborted) return
  page.codes = got
  renderMain()
}

// 확장 설정 화면으로 열렸을 때만 스스로 시작한다(시험은 startOptions를 직접 부른다)
if (typeof chrome !== 'undefined' && chrome.runtime?.id && document.getElementById('optMain')) void startOptions()
