// 시험용 ERP 마감일지 화면(`/h/closing`). specs/erp-closing-fill/notes/erp-closing-fields.md 2~6절 구조를 그대로 본떴다.
// - 진짜 화면처럼 칸에 name·id·aria-label이 없다. 구역 제목·줄 이름·열 머리·label 글자로만 찾을 수 있다
// - React 18 통제 칸 흉내: 칸마다 값 추적기(인스턴스 value 설정자)를 두고, 뿌리(div#root)까지 올라온 input 이벤트에서
//   추적 값과 실제 값이 다를 때만 onChange → 화면 기억(state)에 넣고 다시 그린다. 그래서 `el.value = x`만 하면 기억에 안 들어가고,
//   기본 value 설정 함수 + bubbles input 이벤트여야 들어간다. 금액칸은 쉼표를 붙여 다시 그리고, 떠날 때(blur) 표시를 정리한다
// - 업무일지 1 칸은 1 탭일 때만 있고(2 탭이면 사라짐), 업무일지 2 칸은 늘 있되 1 탭이면 `#closing-panel-w2[hidden]`이다
// - 모든 단추 누름·select 바꿈을 적어 둔다(시험이 '저장·삭제·기본단가 단추를 누르지 않았다'를 본다)
// - 기간 채우기(spec erp-closing-range design.md 7절, notes/erp-screen-1113.md): 날마다 서버 값(days) · 날짜 칸 input 이벤트(React 길)나
//   popstate의 history.state.usr.selectDate로 날을 바꾸면 '로딩 중'(1 칸 묶음 자리·.closing-pdf-out '불러오는 중입니다.'·2 .cdf-empty)을 보이다
//   loadMs 뒤 그날을 다시 그린다 · '전체 저장'(1 탭에만)·'일일 상세 저장'(.cdf-save-bar)은 누르면 '저장 중...' → saveMs 뒤 .toast-container 쪽지
//   (2 저장 성공 뒤엔 그날을 다시 불러옴) · 그날 마감일지가 있을 때만 '마감일지 삭제' · showDialog()(새 판 안내 창). 옵션이 없으면 예전 모양 그대로다
// 맨 아래에 시험용 도우미 답·설정(가짜 숫자, 환자 정보 없음)도 둔다
import type { AgeBand, ClosingDay, GroupKey, Settings } from '../types'

export type Tab = 'w1' | 'w2'

/** 그날 서버에 있는 것(기간 채우기 시험용) */
export type ErpDay = {
  /** 그날 마감일지 상태. 없으면(undefined·null) 마감일지 없는 날('마감일지 삭제' 단추 없음, 상태 칸 처음 값 작성중) */
  status?: 'draft' | 'confirmed' | null
  /** 그날 저장된 칸 값(칸 코드 → 글자, 금액칸은 쉼표 없는 숫자) */
  values?: Record<string, string>
  /** 그날을 열면 '저장하지 않은 입력을 되살렸습니다' 띠(.journal-draft-notice)가 보인다 */
  draftNotice?: boolean
  /** 그날을 불러오지 못한다(.load-state-error, 칸 없음) */
  loadError?: boolean
}

/** 저장 단추를 누른 결과: 성공 쪽지 · 오류 쪽지 · 끝내 답 없음('저장 중...' 그대로) */
export type ErpSaveResult = 'ok' | 'error' | 'never'

export type ErpPageOptions = {
  /** 날마다 서버 값(날짜 'YYYY-MM-DD' → 그날). 주면 '마감일지 삭제' 단추는 그날 마감일지가 있을 때만 있다. 없으면 예전처럼 늘 있다 */
  days?: Record<string, ErpDay>
  /** 날짜를 바꾼 뒤(또는 2 저장 뒤) 그날이 다 그려지기까지(ms, 기본 0 = 다음 타이머). 'never'면 끝내 '로딩 중' */
  loadMs?: number | 'never'
  /** 저장 단추를 누른 결과(기본 늘 'ok') */
  saveResult?: (which: Tab, date: string) => ErpSaveResult
  /** 저장 단추를 누른 뒤 쪽지가 뜨기까지(ms, 기본 0 = 다음 타이머) */
  saveMs?: number
  /** 업무일지 2 저장 줄(.cdf-save-bar)이 없다(진료실 0개 등) */
  noSaveBar?: boolean
  /** 날짜 칸 input 이벤트로는 날이 안 바뀐다(React가 칸 글자를 되돌림). popstate의 history.state.usr.selectDate로만 바뀐다 */
  dateInputOff?: boolean
  /** 처음 탭(기본 w1) */
  tab?: Tab
  /** 마감 일자 'YYYY-MM-DD'(기본 2026-11-09). null이면 날짜를 고르지 않은 화면(업무일지 칸 없음) */
  date?: string | null
  /** 원무 권한: 날짜 칸 대신 'YYYY-MM-DD (오늘)' 글자 */
  todayOnly?: boolean
  /** 본사 열람: 모든 칸이 fieldset[disabled] 안 */
  readOnly?: boolean
  /** 도수치료·충격파(체충) 줄이 '치료사별 입력'(입력칸 없이 값만) */
  therapistRows?: boolean
  /** 병원이 붙인 기타1~4 줄 이름(기본 기타1~기타4) */
  etcNames?: [string, string, string, string]
  /** 운영 지표 표의 치료사 이름 */
  therapists?: string[]
  /** 칸 이름 옆 '자동' 표시와 '파일 값' 안내를 붙인다 */
  badges?: boolean
  /** 글자 앞뒤에 빈칸·줄바꿈·nbsp를 붙인다(글자 정리 시험용) */
  spaced?: boolean
  /** 1 탭을 누른 뒤 칸이 생기기까지(ms, 기본 0 = 다음 마이크로태스크). 'never'면 끝내 안 생김 */
  w1Delay?: number | 'never'
  /** 처음 기억 값(칸 코드 → 글자, 손으로 적은 칸). 금액칸은 쉼표 없는 숫자로 주면 화면엔 쉼표와 함께 보인다 */
  values?: Record<string, string>
  /** 이 칸 코드들의 입력칸만 읽기 전용(readonly)으로 둔다(화면 일부만 잠긴 경우) */
  lockedKeys?: string[]
}

export type ErpPage = {
  root: HTMLElement
  /** React 기억(저장 때 서버로 가는 값). 칸 코드 → 글자, 금액칸은 쉼표 없는 숫자 */
  state: Record<string, string>
  /** 뿌리에 닿은 input 이벤트와 금액칸 blur(칸 코드, 그때 칸 글자) */
  log: { key: string; ev: 'input' | 'blur'; dom: string }[]
  /** 눌린 단추(id, 없으면 글자, 없으면 title) */
  clicks: string[]
  /** select change 이벤트(칸 코드) */
  changes: string[]
  /** ERP 쪽(window)까지 올라온 keydown의 key(ERP 화면 단축키가 그대로 받는지 본다) */
  keys: string[]
  /** 업무일지 2 영역이 input 이벤트를 받아 '고침 있음'이 켜졌는가(그날을 다시 그리면 꺼짐) */
  readonly w2Dirty: boolean
  /** 눌린 저장 단추(누른 차례): 어느 저장 · 그때 마감 일자 · 그때 기억(state) 복사 */
  saves: { which: Tab; date: string; state: Record<string, string> }[]
  /** 지금 고른 마감 일자(불러오는 중이어도 고른 날) */
  date(): string | null
  /** ERP 안내 창(새 판 안내, .dialog-overlay)을 띄운다. 크기가 있는 창이다. 띄운 창을 돌려준다(remove()로 닫힘) */
  showDialog(): HTMLElement
  tab(): Tab
  /** 지금 화면에 붙은, 그 코드에 묶인 칸들 */
  inputs(key: string): (HTMLInputElement | HTMLTextAreaElement)[]
  /** 지금 화면에 붙은, 그 코드에 묶인 칸들의 글자 */
  dom(key: string): string[]
}

type Kind = 'number' | 'text' | 'money' | 'textarea'
type Binding = { key: string; kind: Kind; tracked: string }
type Child = Node | string | null | false | undefined

// --- 화면 정의(조사 파일 3·4절, ERP 화면 파일의 줄 목록 그대로) ---

type W1Row = { code: string; label: string; unit: '명' | '건' | '원'; note?: string } | { derived: string; sub?: string }
const W1_BOXES: Record<string, W1Row[]> = {
  '진료 · 치료현황': [
    { code: 'CARM_CNT', label: '씨암', unit: '건' },
    { code: 'CLOSING_SONO_CNT', label: 'SONO', unit: '건' },
    { code: 'MANUAL_CONSULT', label: '도수상담', unit: '건' },
    { code: 'MANUAL_CNT', label: '도수치료', unit: '건' },
    { code: 'ESWT_CNT', label: '충격파(체충)', unit: '건' },
    { code: 'ARTHROGRAPHY_CNT', label: '관절조영술', unit: '건' },
    { code: 'LIPUS_CNT', label: '리푸스', unit: '건' },
    { code: 'NAILCARE_CNT', label: '손발톱케어', unit: '건' },
    { code: 'CT_CNT', label: 'CT', unit: '건' },
    { code: 'SURGERY_CNT', label: '수술', unit: '건' },
  ],
  '외래 수입': [
    { code: 'TOTAL_FEE', label: '외래 총매출', unit: '원' },
    { derived: '총매출', sub: '(입원 수납액 포함)' },
    { code: 'CLAIM_AMOUNT', label: '청구액(-)', unit: '원' },
    { code: 'UNPAID_IN', label: '미수입금(+)', unit: '원' },
    { code: 'UNPAID_NEW', label: '미수발생(-)', unit: '원' },
    { code: 'NONINSURED', label: '비급여', unit: '원' },
    { derived: '요양급여총액' },
    { code: 'DEDUCTION', label: '감액', unit: '원' },
    { code: 'MOU_DEDUCTION', label: 'MOU 감액', unit: '원' },
    { code: 'DISABLED_FUND', label: '장애인기금(-)', unit: '원' },
    { code: 'RECEIVED', label: '진료수납액', unit: '원' },
    { code: 'CARD_AMOUNT', label: '카드수납액(-)', unit: '원' },
    { code: 'CASH_AMOUNT', label: '현금수납액(-)', unit: '원' },
    { code: 'TRANSFER_AMOUNT', label: '계좌이체액(-)', unit: '원' },
    { code: 'REFUND', label: '현불/환불(-)', unit: '원' },
  ],
  입원수입: [
    { code: 'INPAT_CLAIM', label: '청구', unit: '원' },
    { code: 'INPAT_NONINSURED', label: '비급여', unit: '원' },
    { code: 'INPAT_COPAY', label: '본인부담금', unit: '원' },
    { code: 'INPAT_RECEIVED', label: '수납액', unit: '원' },
  ],
  지출: [
    { code: 'EXP:cash', label: '현금', unit: '원' },
    { code: 'EXP:card', label: '카드', unit: '원' },
    { code: 'EXP:free', label: 'FREE', unit: '원' },
  ],
  합계: [{ derived: '건당진료비' }],
  환자현황: [
    { code: 'NEW_PATIENT', label: '신환', unit: '명' },
    { code: 'FIRST90_PATIENT', label: '90일초진', unit: '명' },
    { code: 'RETURN_PATIENT', label: '재진', unit: '명', note: '물리치료내원 · 진찰료 산정안함 제외' },
    { code: 'PT_VISIT_PATIENT', label: '물리치료내원', unit: '명' },
    { code: 'NO_EXAM_FEE_PATIENT', label: '진찰료 산정안함', unit: '명' },
    { code: 'TOTAL_PATIENT', label: '합계', unit: '명' },
  ],
  신환경로: [
    { code: 'ROUTE_REFERRAL', label: '지인소개', unit: '명' },
    { code: 'ROUTE_SIGN', label: '간판', unit: '명' },
    { code: 'ROUTE_INTERNET', label: '인터넷', unit: '명' },
    { code: 'ROUTE_PROMO', label: '홍보물', unit: '명' },
    { code: 'ROUTE_ETC', label: '기타', unit: '명' },
  ],
}
const W1_COLS = [['진료 · 치료현황'], ['외래 수입'], ['입원수입', '지출', '합계'], ['환자현황', '신환경로']]
const W1_STAFF = [
  ['offDuty', '휴무자', '예) 이름, 이름, 이름'],
  ['manager', '담당', '담당'],
  ['teamLead', '팀장', '팀장'],
  ['director', '원장', '원장'],
]
const THERAPIST_ROWS = new Set(['MANUAL_CNT', 'ESWT_CNT'])
const BADGE_ROWS = new Set(['NEW_PATIENT', 'FIRST90_PATIENT', 'RETURN_PATIENT', 'TOTAL_FEE', 'CARD_AMOUNT', 'CASH_AMOUNT', 'CARM_CNT'])

const RSV_KINDS = [
  ['injection', '주사'],
  ['progress', '경과'],
  ['manual', '도수'],
  ['eswt', '충격파'],
  ['consult', '진료예약'],
  ['etc', '기타(수액,드레싱등)'],
] as const
const RSV_COLS = [
  ['reserved', '총갯수'],
  ['visited', '내원'],
  ['changed', '변경'],
  ['canceled', '취소'],
] as const
const COUNT_ROWS = [
  ['INJ_CARM', '씨암(주사)'],
  ['INJ_SONO', 'SONO(주사)'],
  ['ARTHRO', '관절조영'],
  ['MANUAL', '도수'],
  ['ESWT', '충격파'],
  ['ETC1', ''],
  ['ETC2', ''],
  ['ETC3', ''],
  ['ETC4', ''],
] as const
const THREE_COLS = [
  ['NEW', '신환'],
  ['F90', '90일초진'],
  ['RET', '재진'],
] as const
const CONSULT_ROWS = [
  ['MANUAL', '도수치료'],
  ['ESWT', '체외충격파'],
  ['ETC', '기타'],
] as const
const CONSULT_COLS = [
  ['consult', '상담건수'],
  ['rsv', '예약건수'],
  ['done', '실행건수'],
] as const
const AGE_BANDS = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대'] as const
const AGE_COLS = [
  ['newCnt', '신환'],
  ['first90Cnt', '90일초진'],
  ['revisitCnt', '재진'],
] as const
const THERAPIST_COLS = [
  ['manual', '도수'],
  ['eswt', '충격파'],
  ['consult', '상담'],
] as const
const OPS_FIELDS = [
  ['THR_MANUAL_AMT', '도수 총금액'],
  ['THR_ESWT_AMT', '충격파 총금액'],
  ['ESWT_STD_CNT', 'ESWT Standard'],
  ['ESWT_RADIAL_CNT', 'ESWT Radial'],
  ['INJECTION_ONCE_PATIENT', '주사1회환자'],
  ['NEW_INJECTION_PATIENT', '신환주사환자'],
  ['NEW_INJECTION_CNT', '신환주사건수'],
] as const
const SALES_ROWS = [
  ['CARM_AMT', '씨암'],
  ['SONO_AMT', 'SONO'],
  ['ARTHRO_AMT', '관절조영'],
  ['THR_MANUAL_AMT', '도수'],
  ['THR_ESWT_AMT', '충격파'],
  ['PT_AMT', '물리치료'],
  ['ETC1_AMT', ''],
  ['ETC2_AMT', ''],
  ['ETC3_AMT', ''],
  ['ETC4_AMT', ''],
] as const
/** '업로드 시 생략 가능' 표시가 붙는 칸 */
const FILL_TAG = new Set(['CARM_AMT', 'SONO_AMT', 'THR_MANUAL_AMT', 'THR_ESWT_AMT'])
const FILL_TAG_TEXT = '업로드 시 생략 가능'

/** 업무일지 2 칸 코드(예약·건수·상담·연령·치료사·낱칸·기본단가·매출·이벤트) */
function w2Keys(therapists: string[]): string[] {
  return [
    ...RSV_KINDS.flatMap(([k]) => RSV_COLS.map(([c]) => `RSV:${k}:${c}`)),
    'RSV_PATIENTS',
    ...COUNT_ROWS.flatMap(([k]) => THREE_COLS.map(([c]) => `${k}_${c}`)),
    ...CONSULT_ROWS.flatMap(([k]) => CONSULT_COLS.map(([c]) => `CONSULT:${k}:${c}`)),
    ...AGE_BANDS.flatMap((b) => AGE_COLS.map(([c]) => `AGE:${b}:${c}`)),
    ...therapists.flatMap((n) => THERAPIST_COLS.map(([c]) => `THR:${n}:${c}`)),
    ...OPS_FIELDS.map(([k]) => k),
    'BASE:manual',
    'BASE:eswt',
    ...SALES_ROWS.map(([k]) => k),
    'EVT:0:name',
    'EVT:0:count',
    'EVT:0:amount',
  ]
}

/** 화면 전체의 칸 코드(업무일지 1·2, 담당자, 특이사항·상태 포함) */
export function allKeys(therapists: string[] = ['김도수', '박충격']): string[] {
  const w1 = Object.values(W1_BOXES).flatMap((rows) => rows.flatMap((r) => ('code' in r ? [r.code] : [])))
  return [...new Set([...W1_STAFF.map(([k]) => k), ...w1, ...w2Keys(therapists), 'REMARKS', 'STATUS'])]
}

/** 쪽지가 사라지기까지(ERP 12717줄) */
const TOAST_MS = 3000
const DAY = /^\d{4}-\d{2}-\d{2}$/

// --- 금액칸 글자 ---

function moneyRaw(text: string): string {
  const negative = /^\s*-/.test(text)
  const digits = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits === '' ? '' : (negative ? '-' : '') + digits
}
function moneyShow(raw: string): string {
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// --- 화면 만들기 ---

export function mountErpPage(doc: Document, options: ErpPageOptions = {}): ErpPage {
  const opts = {
    tab: 'w1' as Tab,
    date: '2026-11-09' as string | null,
    todayOnly: false,
    readOnly: false,
    therapistRows: false,
    etcNames: ['기타1', '기타2', '기타3', '기타4'],
    therapists: ['김도수', '박충격'],
    badges: false,
    spaced: false,
    w1Delay: 0 as number | 'never',
    lockedKeys: [] as string[],
    loadMs: 0 as number | 'never',
    saveMs: 0,
    noSaveBar: false,
    dateInputOff: false,
    ...options,
  }
  const keys = allKeys(opts.therapists)
  /** 서버에 있는 날마다 값. 저장하면 그날 것이 바뀐다 */
  const db = new Map<string, ErpDay>(Object.entries(opts.days ?? {}))
  /** 고른 마감 일자 */
  let current: string | null = opts.date
  const state: Record<string, string> = {}
  /** 그날 서버 값으로 기억을 새로 채운다(같은 state 객체를 고친다) */
  function resetState(extra?: Record<string, string>) {
    const day = current ? db.get(current) : undefined
    for (const k of Object.keys(state)) delete state[k]
    for (const k of keys) state[k] = ''
    state.STATUS = day?.status ?? 'draft'
    Object.assign(state, day?.values ?? {}, extra ?? {})
  }
  resetState(opts.values)
  /** 그날 마감일지가 있나(days를 안 주면 예전처럼 늘 있음) */
  const hasJournal = () => opts.days === undefined || Boolean(current && db.get(current)?.status)

  const log: ErpPage['log'] = []
  const clicks: string[] = []
  const changes: string[] = []
  const keyLog: string[] = []
  const locked = new Set(opts.lockedKeys)
  const registry = new Map<HTMLInputElement | HTMLTextAreaElement, Binding>()
  let tab: Tab = opts.tab
  let w2Dirty = false

  const t = (s: string) => (opts.spaced ? `\n    ${s}  ` : s)

  function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | boolean | undefined> = {},
    ...kids: Child[]
  ): HTMLElementTagNameMap[K] {
    const el = doc.createElement(tag)
    for (const [name, v] of Object.entries(attrs)) {
      if (v === true) el.setAttribute(name, '')
      else if (typeof v === 'string') el.setAttribute(name, v)
    }
    for (const kid of kids) {
      if (kid === null || kid === false || kid === undefined) continue
      el.append(kid)
    }
    return el
  }

  const display = (b: Binding) => (b.kind === 'money' ? moneyShow(state[b.key] ?? '') : (state[b.key] ?? ''))

  /** React가 그 코드의 칸들을 기억 값으로 다시 그린다(인스턴스 설정자 → 추적 값도 같이 바뀜) */
  function rerender(key: string) {
    for (const [el, b] of registry) {
      if (b.key !== key || !el.isConnected) continue
      const show = display(b)
      if (el.value !== show) el.value = show
    }
  }

  /** 통제 칸 하나. React의 값 추적기처럼 인스턴스에 value 설정자를 둔다 */
  function bind<E extends HTMLInputElement | HTMLTextAreaElement>(el: E, key: string, kind: Kind): E {
    const proto = Object.getPrototypeOf(el) as object
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    if (!desc?.get || !desc.set) throw new Error('value 설정자를 찾지 못했다')
    const { get, set } = desc
    const b: Binding = { key, kind, tracked: '' }
    Object.defineProperty(el, 'value', {
      configurable: true,
      get(this: E) {
        return get.call(this)
      },
      set(this: E, v: unknown) {
        b.tracked = String(v)
        set.call(this, v)
      },
    })
    registry.set(el, b)
    el.value = display(b)
    if (locked.has(key)) el.readOnly = true
    return el
  }

  const numberInput = (key: string, cls?: string) =>
    bind(h('input', { type: 'number', placeholder: '-', class: cls }), key, 'number')
  const moneyInput = (key: string, cls?: string) =>
    bind(
      h('input', {
        autocomplete: 'off',
        spellcheck: 'false',
        type: 'text',
        inputmode: 'decimal',
        class: cls ? `money-input ${cls}` : 'money-input',
        placeholder: '-',
      }),
      key,
      'money',
    )
  const button = (text: string, attrs: Record<string, string> = {}) =>
    h('button', { type: 'button', class: 'btn btn-secondary', ...attrs }, text)
  const badge = () =>
    h(
      'span',
      { class: 'af-badge', 'aria-label': '자동 입력 - 일일 환자현황(시험.xlsx) 파일에서 자동으로 채운 칸입니다.' },
      '자동',
    )
  const fillTag = () => h('span', { class: 'cdf-fill-tag cdf-no-print' }, FILL_TAG_TEXT)

  // --- 업무일지 1 ---
  function w1Row(row: W1Row): HTMLTableRowElement {
    if ('derived' in row) {
      return h(
        'tr',
        {},
        h('td', {}, t(row.derived), row.sub ? h('span', {}, row.sub) : null),
        h('td', {}, h('div', {}, h('span', {}, '-'))),
      )
    }
    if (opts.therapistRows && THERAPIST_ROWS.has(row.code)) {
      return h(
        'tr',
        {},
        h('td', {}, t(row.label), h('span', {}, '치료사별 입력')),
        h('td', {}, h('div', {}, h('span', {}, '3'), h('span', {}, row.unit))),
      )
    }
    const input = row.unit === '원' ? moneyInput(row.code) : numberInput(row.code)
    const withBadge = opts.badges && BADGE_ROWS.has(row.code)
    return h(
      'tr',
      {},
      h('td', {}, t(row.label), withBadge ? badge() : null),
      h(
        'td',
        {},
        h(
          'div',
          {},
          input,
          h('span', {}, row.unit),
          opts.readOnly ? null : button('', { class: 'btn btn-secondary btn-sm', title: '이 항목만 저장' }),
        ),
        row.note ? h('div', {}, h('span', { class: 'af-note af-note--ref' }, row.note)) : null,
        withBadge && row.code === 'TOTAL_FEE' ? h('div', {}, h('span', { class: 'af-note af-note--diff' }, '파일 값 1,234')) : null,
      ),
    )
  }

  function w1Fieldset(): HTMLFieldSetElement {
    const remarks = bind(h('textarea', { placeholder: '특이사항을 입력하세요' }), 'REMARKS', 'textarea')
    const status = h('select', {}, h('option', { value: 'draft' }, '작성중'), h('option', { value: 'confirmed' }, '확정'))
    status.value = state.STATUS
    status.addEventListener('change', () => {
      state.STATUS = status.value
    })
    return h(
      'fieldset',
      { disabled: opts.readOnly },
      h(
        'div',
        {},
        h('h4', { class: 'closing-panel-title' }, '담당자 · 휴무자'),
        h(
          'div',
          {},
          ...W1_STAFF.map(([key, label, ph]) =>
            h('div', {}, h('label', {}, label), bind(h('input', { placeholder: ph }), key, 'text')),
          ),
        ),
      ),
      h(
        'div',
        { class: 'closing-w1-wrap' },
        h(
          'div',
          { class: 'closing-w1-grid' },
          ...W1_COLS.map((col) =>
            h(
              'div',
              { class: 'closing-w1-col' },
              ...col.map((title) =>
                h(
                  'div',
                  { class: 'closing-w1-box' },
                  h('h4', { class: 'closing-panel-title' }, t(title)),
                  h('div', {}, h('table', {}, h('tbody', {}, ...W1_BOXES[title].map(w1Row)))),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        'div',
        {},
        h('div', {}, h('label', {}, '특이사항 ', h('span', {}, '업무일지 2 와 같은 칸')), remarks),
        h('div', {}, h('label', {}, '상태'), status),
      ),
      saveCard(),
    )
  }

  /** 업무일지 1 저장 카드(1 탭에만, ERP 182159줄). '중간저장'은 누르면 적어 두기만 한다 */
  function saveCard(): HTMLDivElement {
    const middle = button('중간저장')
    const all = h('button', { class: 'btn btn-primary' }, '전체 저장')
    saver('w1', all, [middle, all])
    return h('div', { class: 'card' }, middle, all)
  }

  /** 업무일지 2 저장 줄(진료실 1개 이상·불러오는 중 아님·오류 없음·본사 열람 아님일 때만, 조사 6절) */
  function makeSaveBar(): HTMLDivElement {
    const middle = button('중간저장')
    const daily = h('button', { class: 'btn btn-primary' }, '일일 상세 저장')
    const reset = button('초기화')
    saver('w2', daily, [middle, daily, reset])
    return h('div', { class: 'cdf-save-bar cdf-no-print' }, middle, daily, reset)
  }

  /**
   * 저장 단추(ERP 그대로 확인 창 없음): 누르면 그때 기억을 saves에 적고 묶음 단추를 막고 글자 '저장 중...' →
   * saveMs 뒤 단추를 되돌리고 쪽지(성공 '저장되었습니다.' · 오류 '저장 중 오류가 발생했습니다.'). 'never'면 끝나지 않는다.
   * 성공하면 그날 서버 값이 지금 기억이 되고(마감일지 생김), 2 저장 뒤엔 그날을 다시 불러온다(조사 3절 onSaved)
   */
  function saver(which: Tab, btn: HTMLButtonElement, group: HTMLButtonElement[]) {
    btn.addEventListener('click', () => {
      if (loading || !current || btn.disabled || btn.closest('fieldset[disabled]')) return
      const date = current
      saves.push({ which, date, state: { ...state } })
      const label = btn.textContent ?? ''
      btn.textContent = '저장 중...'
      for (const b of group) b.disabled = true
      const result = opts.saveResult?.(which, date) ?? 'ok'
      if (result === 'never') return
      setTimeout(() => {
        btn.textContent = label
        for (const b of group) b.disabled = false
        if (result === 'error') {
          toast('error', '저장 중 오류가 발생했습니다.')
          return
        }
        const before = db.get(date)
        db.set(date, { status: which === 'w1' ? state.STATUS : (before?.status ?? state.STATUS), values: { ...state } })
        toast('success', '저장되었습니다.')
        if (date !== current) return
        if (which === 'w1') paintDelete()
        else startLoading()
      }, opts.saveMs)
    })
  }

  let toastBox: HTMLElement | null = null
  /** 쪽지(.toast-container 안, 3초 뒤 사라짐, ERP 12689줄) */
  function toast(kind: 'success' | 'error', message: string) {
    if (!toastBox) {
      toastBox = h('div', { class: 'toast-container' })
      root.append(toastBox)
    }
    const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', { class: 'toast-message' }, message))
    toastBox.append(el)
    setTimeout(() => el.remove(), TOAST_MS)
  }

  // --- 업무일지 2 ---
  const card = (title: Child[], ...kids: Child[]) =>
    h('div', { class: 'card' }, h('h3', { class: 'cdf-section-title' }, ...title), ...kids)
  const table = (head: string[], ...rows: HTMLTableRowElement[]) =>
    h(
      'div',
      {},
      h(
        'table',
        { class: 'cdf-table' },
        h('thead', {}, h('tr', {}, ...head.map((x) => h('th', {}, t(x))))),
        h('tbody', {}, ...rows),
      ),
    )
  const rowlabel = (label: string, ...extra: Child[]) => h('td', { class: 'rowlabel' }, t(label), ...extra)
  const etcName = (key: string) => opts.etcNames[Number(key.slice(3, 4)) - 1]

  function w2Content(): HTMLFieldSetElement {
    return h(
      'fieldset',
      { disabled: opts.readOnly, style: 'display: contents' },
      h(
        'div',
        { class: 'cdf-cols' },
        h(
          'section',
          { class: 'cdf-col', 'aria-label': '직접 입력' },
          card(
            ['예약'],
            table(
              ['구분', ...RSV_COLS.map(([, n]) => n)],
              ...RSV_KINDS.map(([k, n]) =>
                h('tr', {}, rowlabel(n), ...RSV_COLS.map(([c]) => h('td', {}, numberInput(`RSV:${k}:${c}`, 'cdf-input')))),
              ),
              h('tr', {}, h('td', { class: 'rowlabel' }, h('b', {}, '총갯수')), ...RSV_COLS.map(() => h('td', {}, '-'))),
              h('tr', {}, rowlabel('실예약환자수'), h('td', {}, numberInput('RSV_PATIENTS', 'cdf-input')), h('td'), h('td'), h('td')),
            ),
          ),
          card(
            ['치료별 신환/90일초진/재진 건수'],
            table(
              ['치료', ...THREE_COLS.map(([, n]) => n)],
              ...COUNT_ROWS.map(([k, n]) =>
                h('tr', {}, rowlabel(n || etcName(k)), ...THREE_COLS.map(([c]) => h('td', {}, numberInput(`${k}_${c}`, 'cdf-input')))),
              ),
            ),
          ),
          card(
            ['상담-전환률'],
            table(
              ['구분', ...CONSULT_COLS.map(([, n]) => n)],
              ...CONSULT_ROWS.map(([k, n]) =>
                h('tr', {}, rowlabel(n), ...CONSULT_COLS.map(([c]) => h('td', {}, numberInput(`CONSULT:${k}:${c}`, 'cdf-input')))),
              ),
            ),
          ),
          h(
            'details',
            { class: 'usr-legacy', open: true },
            h('summary', {}, '기존 3분류 수기 연령표(신환·90일초진·재진)'),
            card(
              ['연령별 신환/90일초진/재진', opts.badges ? badge() : null],
              opts.badges ? h('div', {}, h('span', { class: 'af-note af-note--diff' }, '기간별통계 파일 값과 다른 칸: 20대 신환 3')) : null,
              table(
                ['연령대', ...AGE_COLS.map(([, n]) => n)],
                ...AGE_BANDS.map((band) =>
                  h(
                    'tr',
                    {},
                    h('td', { class: 'rowlabel', 'data-label': '연령대' }, t(band)),
                    ...AGE_COLS.map(([c, n]) => h('td', { 'data-label': n }, numberInput(`AGE:${band}:${c}`, 'cdf-input'))),
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'section',
          { class: 'cdf-col', 'aria-label': '금액 · 이벤트 · 특이사항' },
          card(
            ['운영 지표(치료사별·금액)'],
            table(
              ['치료사', ...THERAPIST_COLS.map(([, n]) => n)],
              ...(opts.therapists.length === 0
                ? [h('tr', {}, h('td', { colspan: '4' }, '등록된 치료사가 없습니다.'))]
                : opts.therapists.map((name) =>
                    h('tr', {}, rowlabel(name), ...THERAPIST_COLS.map(([c]) => h('td', {}, numberInput(`THR:${name}:${c}`, 'cdf-input')))),
                  )),
            ),
            h(
              'div',
              {},
              ...OPS_FIELDS.map(([k, n]) =>
                h(
                  'div',
                  { class: 'cdf-field' },
                  h('label', {}, t(n), !opts.readOnly && FILL_TAG.has(k) ? fillTag() : null),
                  k.endsWith('_AMT') ? moneyInput(k, 'cdf-input') : numberInput(k, 'cdf-input'),
                ),
              ),
            ),
            h(
              'div',
              {},
              h('div', {}, '기본단가(병원별) - 저장해두면 총금액을 치료사별 건수 합 × 단가로 자동 계산합니다.'),
              h(
                'div',
                {},
                h('div', { class: 'cdf-field' }, h('label', {}, '도수 기본단가'), moneyInput('BASE:manual', 'cdf-input')),
                h('div', { class: 'cdf-field' }, h('label', {}, '충격파 기본단가'), moneyInput('BASE:eswt', 'cdf-input')),
                opts.readOnly ? null : button('기본단가 저장'),
                opts.readOnly ? null : button('총금액 재계산(건수×단가)'),
              ),
            ),
          ),
          card(
            ['치료별 매출'],
            table(
              ['치료', '금액(원)'],
              ...SALES_ROWS.map(([k, n]) =>
                h(
                  'tr',
                  {},
                  rowlabel(n || etcName(k), !opts.readOnly && FILL_TAG.has(k) ? fillTag() : null),
                  h('td', {}, moneyInput(k, 'cdf-input cdf-input--amt')),
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: 'card' },
            h('h3', { class: 'cdf-section-title' }, '이벤트 진행'),
            h(
              'div',
              {},
              h(
                'table',
                { class: 'cdf-table cdf-event-table' },
                h(
                  'thead',
                  {},
                  h(
                    'tr',
                    {},
                    h('th', { class: 'cdf-th-name' }, '이벤트명'),
                    h('th', { class: 'cdf-th-num' }, '실행갯수'),
                    h('th', { class: 'cdf-th-num cdf-th-amt' }, '금액(원)'),
                    h('th', { class: 'cdf-no-print cdf-th-del', 'aria-label': '행 삭제' }),
                  ),
                ),
                h(
                  'tbody',
                  {},
                  h(
                    'tr',
                    {},
                    h('td', {}, bind(h('input', { class: 'cdf-input', type: 'text', placeholder: '이벤트명' }), 'EVT:0:name', 'text')),
                    h('td', {}, numberInput('EVT:0:count', 'cdf-input')),
                    h('td', {}, moneyInput('EVT:0:amount', 'cdf-input cdf-input--amt')),
                    h(
                      'td',
                      { class: 'cdf-no-print' },
                      opts.readOnly ? null : button('×', { class: 'btn btn-secondary btn-sm', title: '행 삭제' }),
                    ),
                  ),
                ),
              ),
            ),
            opts.readOnly ? null : h('div', { class: 'cdf-no-print' }, button('+ 이벤트 추가')),
          ),
          card(
            ['특이사항', h('span', { class: 'cdf-shared-note' }, '업무일지 1 과 같은 칸')],
            bind(h('textarea', { class: 'cdf-textarea', placeholder: '특이사항' }), 'REMARKS', 'textarea'),
          ),
        ),
      ),
    )
  }

  // --- 화면 뼈대 ---
  const tabButton = (key: Tab, label: string) => h('button', { type: 'button', role: 'tab', id: `closing-tab-${key}` }, label)
  const tabW1 = tabButton('w1', '업무일지 1')
  const tabW2 = tabButton('w2', '업무일지 2')
  const cardTitle = h('h3', { class: 'card-title' })
  /** '마감 일자' 날짜 칸. React 통제 칸처럼 값 추적기를 두어, 기본 value 설정 함수 + input 이벤트일 때만 날을 바꾼다 */
  const dateEl = opts.todayOnly ? null : h('input', { class: 'datepicker-input', type: 'text', value: opts.date ?? '' })
  let dateTracked = ''
  if (dateEl) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(dateEl) as object, 'value')
    if (!desc?.get || !desc.set) throw new Error('value 설정자를 찾지 못했다')
    const { get, set } = desc
    Object.defineProperty(dateEl, 'value', {
      configurable: true,
      get(this: HTMLInputElement) {
        return get.call(this)
      },
      set(this: HTMLInputElement, v: unknown) {
        dateTracked = String(v)
        set.call(this, v)
      },
    })
    dateTracked = String(get.call(dateEl))
    dateEl.addEventListener('input', () => {
      const actual = String(get.call(dateEl))
      if (actual === dateTracked) return
      if (opts.dateInputOff) {
        dateEl.value = current ?? ''
        return
      }
      dateTracked = actual
      if (DAY.test(actual)) pick(actual)
    })
  }
  const dateRow = h('div', {}, h('label', {}, '마감 일자'), dateEl ?? h('strong', {}, `${opts.date ?? ''} (오늘)`), button('PDF 출력'))
  const w2Head = h(
    'div',
    {},
    h(
      'h4',
      { class: 'closing-panel-title' },
      '일일 상세',
      h('span', {}, '(연령 · 치료별 매출 · 건수 ·'),
      ' ',
      h('span', {}, '상담 · 예약 · 이벤트)'),
    ),
    h('p', {}, '마감일지 양식 2번째 시트(일일현황) 전체를 아래에서 입력·저장합니다.'),
    h('div', { class: 'cdf-upload-notice cdf-no-print', role: 'note' }, '통계 파일(EMR 소모통계)을 업로드하면 치료별 매출의 금액이 채워집니다.'),
  )
  const mainCard = h('div', { class: 'card' }, cardTitle, dateRow)
  const w2Panel = h('div', { role: 'tabpanel', id: 'closing-panel-w2', 'aria-labelledby': 'closing-tab-w2' })
  // 업무일지 2 영역: textarea가 아닌 칸의 input 이벤트로 '고침 있음'을 켠다(ERP 그대로)
  w2Panel.addEventListener('input', (e) => {
    if (!opts.readOnly && (e.target as Element | null)?.tagName !== 'TEXTAREA') w2Dirty = true
  })
  const pageTitle = h('h2', {}, '마감일지')
  const delButton = h('button', { class: 'btn btn-danger' }, '마감일지 삭제')

  const root = h(
    'div',
    { id: 'root' },
    h(
      'div',
      { class: 'page' },
      pageTitle,
      delButton,
      h(
        'div',
        {},
        h('input', { class: 'datepicker-input', 'aria-label': '연도 선택', readonly: true, value: (opts.date ?? '2026').slice(0, 4) }),
        ...Array.from({ length: 12 }, (_, i) => button(`${i + 1}월`)),
      ),
      h('div', { class: 'tabs closing-journal-tabs', role: 'tablist', 'aria-label': '업무일지' }, tabW1, tabW2),
      mainCard,
      w2Panel,
    ),
  )

  const saves: ErpPage['saves'] = []
  /** 그날을 불러오는 중(날을 바꾼 뒤·2 저장 뒤 loadMs 동안) */
  let loading = false
  /** 그날을 불러오지 못했다(.load-state-error) */
  let failed = false
  let loadTimer: ReturnType<typeof setTimeout> | undefined
  /** 그날마다 붙는 띠·오류 상자 */
  let marks: Element[] = []
  let w2Fieldset: HTMLFieldSetElement | null = null
  let saveBar: HTMLDivElement | null = null
  const w1Loading = h('div', { class: 'closing-w1-loading' }, '로딩 중...')
  const pdfOut = h('div', { class: 'closing-pdf-out' }, '불러오는 중입니다.')
  const w2Empty = h('div', { class: 'cdf-empty' }, '로딩 중...')

  /** 화면에서 뗀 칸은 추적에서 뺀다 */
  function forget(node: Node) {
    for (const el of [...registry.keys()]) if (node.contains(el)) registry.delete(el)
  }

  let w1Mounted: HTMLFieldSetElement | null = null
  function mountW1() {
    if (tab !== 'w1' || w1Mounted || !current || loading || failed) return
    w1Mounted = w1Fieldset()
    mainCard.append(w1Mounted)
  }
  function unmountW1() {
    if (!w1Mounted) return
    w1Mounted.remove()
    forget(w1Mounted)
    w1Mounted = null
  }
  function dropW2() {
    for (const node of [w2Fieldset, saveBar]) {
      if (!node) continue
      node.remove()
      forget(node)
    }
    w2Fieldset = null
    saveBar = null
  }
  function paintTabs() {
    for (const [btn, key] of [
      [tabW1, 'w1'],
      [tabW2, 'w2'],
    ] as const) {
      btn.setAttribute('aria-selected', String(tab === key))
      btn.className = `tab-btn${tab === key ? ' active' : ''}`
    }
    cardTitle.textContent = `업무일지 ${tab === 'w1' ? 1 : 2}${current ? ` - ${current}` : ''}`
    w2Panel.hidden = tab !== 'w2'
  }
  function paintDelete() {
    if (!hasJournal()) delButton.remove()
    else if (!delButton.isConnected) pageTitle.after(delButton)
  }
  /** 그날을 그린다: 마감일지 삭제 단추 · (오류면 오류 상자만) · 되살린 입력 띠 · 업무일지 2 칸·저장 줄 · 1 탭이면 업무일지 1 */
  function paintDay() {
    paintTabs()
    paintDelete()
    if (!current) return
    const day = db.get(current)
    failed = Boolean(day?.loadError)
    if (failed) {
      const box = h('div', { class: 'load-state-error', role: 'alert' }, h('p', {}, '이 날짜의 업무일지를 불러오지 못했습니다.'), button('다시 시도'))
      mainCard.append(box)
      marks.push(box)
      return
    }
    if (day?.draftNotice) {
      const band = h(
        'div',
        { class: 'journal-draft-notice', role: 'status' },
        h('span', {}, '업무일지 1 - 저장하지 않은 입력을 되살렸습니다'),
        button('되살린 입력 버리기'),
      )
      dateRow.after(band)
      marks.push(band)
    }
    w2Fieldset = w2Content()
    w2Panel.append(w2Fieldset)
    if (!opts.readOnly && !opts.noSaveBar) {
      saveBar = makeSaveBar()
      w2Panel.append(saveBar)
    }
    mountW1()
  }
  /** 그날을 다시 불러온다: 칸을 떼고 '로딩 중' 표시 → loadMs 뒤 그날 서버 값으로 다시 그림 */
  function startLoading() {
    clearTimeout(loadTimer)
    loading = true
    for (const m of marks) m.remove()
    marks = []
    failed = false
    unmountW1()
    dropW2()
    delButton.remove()
    paintTabs()
    if (tab === 'w1') mainCard.append(w1Loading)
    mainCard.append(pdfOut)
    w2Panel.append(w2Empty)
    if (opts.loadMs === 'never') return
    loadTimer = setTimeout(() => {
      loading = false
      w1Loading.remove()
      pdfOut.remove()
      w2Empty.remove()
      resetState()
      w2Dirty = false
      paintDay()
    }, opts.loadMs)
  }
  /** 날을 고른다(날짜 칸·popstate). 같은 날이면 아무것도 안 한다 */
  function pick(date: string) {
    if (date === current) return
    current = date
    if (dateEl && dateEl.value !== date) dateEl.value = date
    startLoading()
  }
  function select(next: Tab) {
    if (next === tab) return
    tab = next
    paintTabs()
    if (next === 'w2') {
      unmountW1()
      w1Loading.remove()
      mainCard.append(w2Head)
      return
    }
    w2Head.remove()
    if (loading) {
      mainCard.append(w1Loading)
      return
    }
    const delay = opts.w1Delay
    if (delay === 'never') return
    if (delay === 0) queueMicrotask(mountW1)
    else setTimeout(mountW1, delay)
  }
  tabW1.addEventListener('click', () => select('w1'))
  tabW2.addEventListener('click', () => select('w2'))

  paintDay()
  if (tab !== 'w1') mainCard.append(w2Head)

  // 둘째 길(조사 1절): React Router가 history.state.usr를 location.state로 읽고, selectDate가 바뀌면 그날을 불러온다. 원무 권한은 오늘로 고정
  const view = doc.defaultView
  view?.addEventListener('popstate', () => {
    if (!root.isConnected || opts.todayOnly) return
    const next = (view.history.state as { usr?: { selectDate?: unknown } } | null)?.usr?.selectDate
    if (typeof next === 'string' && DAY.test(next)) pick(next)
  })

  /** ERP 안내 창(새 판 안내, 조사 8절). jsdom에는 배치가 없어 화면을 덮는 크기를 직접 준다 */
  function showDialog(): HTMLElement {
    const overlay = h(
      'div',
      { class: 'dialog-overlay' },
      h('div', { class: 'dialog-box', role: 'dialog' }, h('p', {}, '시스템이 업데이트되었습니다'), button('지금 업데이트'), button('현 화면 유지')),
    )
    overlay.getBoundingClientRect = () =>
      ({ x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON: () => ({}) }) as DOMRect
    root.append(overlay)
    return overlay
  }

  // --- React 뿌리 이벤트 ---
  root.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLTextAreaElement
    const b = registry.get(el)
    if (!b) return
    const proto = Object.getPrototypeOf(el) as object
    const actual = String(Object.getOwnPropertyDescriptor(proto, 'value')?.get?.call(el) ?? '')
    log.push({ key: b.key, ev: 'input', dom: actual })
    if (actual === b.tracked) return // 추적 값과 같으면 React는 바뀐 것이 없다고 본다(onChange 없음)
    b.tracked = actual
    state[b.key] = b.kind === 'money' ? moneyRaw(actual) : actual
    rerender(b.key)
  })
  root.addEventListener(
    'blur',
    (e) => {
      const el = e.target as HTMLInputElement
      const b = registry.get(el)
      if (!b || b.kind !== 'money') return
      rerender(b.key)
      log.push({ key: b.key, ev: 'blur', dom: el.value })
    },
    true,
  )
  root.addEventListener('change', (e) => {
    if ((e.target as Element | null)?.tagName === 'SELECT') changes.push('STATUS')
  })
  root.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as Element | null)?.closest('button')
      if (btn) clicks.push(btn.id || (btn.textContent ?? '').trim() || btn.title)
    },
    true,
  )

  doc.defaultView?.addEventListener('keydown', (e) => keyLog.push(e.key))

  doc.body.append(root)

  const live = (key: string) => [...registry].filter(([el, b]) => b.key === key && el.isConnected).map(([el]) => el)
  return {
    root,
    state,
    log,
    clicks,
    changes,
    keys: keyLog,
    get w2Dirty() {
      return w2Dirty
    },
    saves,
    date: () => current,
    showDialog,
    tab: () => tab,
    inputs: live,
    dom: (key) => live(key).map((el) => el.value),
  }
}

// --- 시험용 도우미 답·설정(가짜 숫자, 환자 정보 없음) ---

const KEYS: GroupKey[] = [
  'carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4',
  'manualConsult', 'lipus', 'nail', 'ct', 'surgery', 'eswtStd', 'eswtRadial', 'injection', 'ptVisit',
]
const BANDS: AgeBand[] = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90']

/**
 * 칸마다 다른 숫자가 나오게 만든 2026-11-09 답. 묶음 i번째(GROUP_KEYS 차례):
 * new 100+i · first90 200+i · return 300+i · patients 400+i · total (i+1)×1,000,000 + 1,234.
 * 연령 k번째: 500+k · 600+k · 700+k. 예약 메모 1·3·7·14·20·22번
 */
export function sampleDay(): ClosingDay {
  return {
    date: '2026-11-09',
    patients: { new: 7, first90: 10, return: 52, ptVisit: 11, noExamFee: 4, total: 84 },
    groups: KEYS.map((key, i) => ({
      key,
      new: 100 + i,
      first90: 200 + i,
      return: 300 + i,
      patients: 400 + i,
      total: (i + 1) * 1_000_000 + 1_234,
      unpaidVisits: 0,
    })),
    ages: BANDS.map((band, k) => ({ band, new: 500 + k, first90: 600 + k, return: 700 + k })),
    money: {
      total: 11_668_530,
      insurer: 6_120_400,
      receivableIn: 35_000,
      unpaidNew: 12_000,
      noncovered: 2_410_300,
      discount: 8_000,
      disabledFund: 1_500,
      received: 5_571_630,
      card: 4_012_330,
      cash: 1_208_300,
      transfer: 351_000,
      refund: 33_000,
    },
    inpatientVisits: 0,
    reservations: {
      kinds: [
        { kind: '1', total: 11, visited: 12, changed: 13, canceled: 14 },
        { kind: '3', total: 51, visited: 52, changed: 53, canceled: 54 },
        { kind: '7', total: 61, visited: 62, changed: 63, canceled: 64 },
        { kind: '14', total: 21, visited: 22, changed: 23, canceled: 24 },
        { kind: '20', total: 31, visited: 32, changed: 33, canceled: 34 },
        { kind: '22', total: 41, visited: 42, changed: 43, canceled: 44 },
      ],
      patients: 77,
    },
    injection: { firstTime: 9, newPatients: 3, newLines: 4 },
    warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false },
  }
}

/** settingsAll의 기타 이름. ERP 시험 화면 기타1~4 줄 이름으로 주면 맞는다 */
export const ETC_NAMES: [string, string, string, string] = ['크라이오', '체외충격파B', '수액', '테이핑']

/** 묶음 19개를 모두 고르고 예약 6줄도 모두 고른 설정(진료예약 9번·기타 5번은 그날 예약이 없는 메모) */
export function settingsAll(): Settings {
  return {
    v: 1,
    picks: Object.fromEntries(KEYS.map((k) => [k, [`C-${k}`]])),
    etcNames: { etc1: ETC_NAMES[0], etc2: ETC_NAMES[1], etc3: ETC_NAMES[2], etc4: ETC_NAMES[3] },
    reservations: {
      injection: ['3'],
      followup: ['7'],
      manual: ['14', '20', '22'],
      eswt: ['1'],
      clinic: ['9'],
      etc: ['5'],
    },
  }
}

/** 이미 정한 것 7의 처음 값 + 예약 도수(14·20·22)·충격파(1)를 고른 설정(목업 예시와 같은 고름) */
export function settingsFirst(): Settings {
  return {
    v: 1,
    picks: {
      carm: ['CARM1'],
      sono: ['SONO1'],
      arthro: ['HA280'],
      manual: ['도수'],
      eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
      pt: ['MM010', 'MM015', 'MM011'],
      etc1: ['CRYO'],
      ptVisit: ['AA222'],
    },
    etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
    reservations: { manual: ['14', '20', '22'], eswt: ['1'] },
  }
}
