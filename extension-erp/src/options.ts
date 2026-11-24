// 확장 설정 화면(design.md 4절 · 승인된 목업 docs/mockups/erp-closing-fill/ ⑫~⑮). 글은 목업 그대로다
// 코드 목록은 서비스 워커를 거쳐 도우미 closing.codes로 받고({ cmd, args } → { type: 'result', data } | { type: 'error', code }),
// 고른 것은 chrome.storage.local erpClosing 한 칸에만 둔다. 도우미 답은 저장하지 않는다
// 도우미가 준 코드 이름은 글자(textContent)로만 그린다
// 씨암·SONO 줄 아래 '매출로 셀 코드' 줄(TASK-15)은 design.md 4절 글 그대로다(목업 없이 명세 글로 만듦).
// REQ-3707(TASK-9, design.md 9절): 그 줄은 '셀 코드'만 찾아 더한다. '이 글자 뒤에 숫자'(앞글자) 줄은 없고 저장값의 앞글자는 보이지 않는다
// TASK-18(design.md 5-3 글 그대로, 사용자가 목업 승인을 기다리지 말라고 함): 받는 중 줄 · 닫을 때 묻기(beforeunload) · 저장 실패 글 ·
// [저장] 차례(겹침 막기 → 처방 없는 코드 묻기 → 쓰기) · [처음 값으로] 묻기 · 새 처음 코드 줄. 묻는 글은 저장 바 바로 위 알림 상자(#optAsk)
// 코드 목록 오류 줄은 errors.ts 한 곳의 글만 쓴다(AC-3614.1)
// TASK-21(design.md 5-3): 겹침 막는 글의 조사는 이름 받침으로(josa.ts) · 막는 글·저장 실패 때 상태 줄에 '저장했어요.'를 함께 보이지 않음 ·
// 새 처음 코드 줄의 기타 줄은 그 ERP 줄 이름
// REQ-3708(TASK-11, design.md 10절): '셀 코드' 찾기는 2자 이상이면 0.4초 뒤 도우미 closing.findCodes에 묻는다(비트에 등록된 코드 전부,
// 마지막 질문 답만 씀). 옛 도우미(E-HELPER-UNKNOWN-COMMAND)면 1년 목록 + 새 판 안내 줄, 다른 오류면 errors.ts 글 + 1년 목록.
// 고른 코드 줄(묶음 코드) 찾기는 그대로 1년 목록
// REQ-3709(TASK-11, design.md 11절 · 승인 시안 docs/mockups/erp-closing-range/exclude.html): 건수를 세는 17줄마다 '읽지 않을 처방' 줄.
// 새 규칙 칸에 담는 중인 것은 화면에만 두고(저장할 바꿈이 아님) [규칙 더하기]한 규칙만 [저장]에 들어간다. 같이 있을 처방 찾기는 셀 코드 찾기와 같다
// 의사랑판(spec erp-uisarang TASK-12, design.md 8-9 options · 결정 7, AC-4214.1): 맨 앞에서 의사랑 설정(erpClosingUis)만 저장돼 있으면
// 도우미를 부르지 않고 의사랑 화면(uisOptions.ts). 그 밖은 지금 그대로이고, closing.codes가 E-CLOSING-WRONG-SOURCE면 오류 글 없이 의사랑 화면.
// 두 화면이 같이 쓰는 글(SHARED_TEXT)은 지금 글 그대로다
import { E_BRIDGE_BAD_REPLY, E_CLOSING_WRONG_SOURCE, E_HELPER_MISSING, explain } from './errors.js'
import { josa } from './josa.js'
import {
  addCode,
  addKind,
  cleanCode,
  cleanExcludes,
  conflicts,
  defaults,
  ETC_KEYS,
  load,
  MAX_CODES,
  MAX_RESULTS,
  MAX_WITH,
  newDefaultCodes,
  resetCodes,
  ruleCodes,
  ruleProblem,
  save,
  search,
  unusedCodes,
  without,
} from './settings.js'
import type { Conflict, RuleProblem } from './settings.js'
import { AMOUNT_KEYS, EXCLUDE_KEYS, GROUP_NAMES, RSV_NAMES, RSV_ROWS } from './types.js'
import type { AmountKey, ClosingCodes, ClosingCommand, EtcKey, ExcludeRule, FoundCodes, GroupKey, RsvRow, Settings } from './types.js'
import { startUisOptions, stopUisOptions } from './uisOptions.js'
import type { Send } from './uisTypes.js'
import { savedSources } from './uisSettings.js'

/**
 * 비트·의사랑 설정 화면이 같이 쓰는 글(지금 글 그대로). 의사랑 화면(uisOptions.ts)은 함수 안에서만 읽는다
 * (두 파일이 서로 부르므로 맨 위에서 읽지 않는다)
 */
export const SHARED_TEXT = {
  /** 찾기 칸 안내: 보통 · 20개 다 고름 */
  find: '코드나 이름으로 찾기',
  full: '20개까지 고를 수 있어요',
  /** 찾기 목록에서 이미 고른 줄 꼬리 · 맞는 코드가 없을 때 */
  picked: '골랐어요',
  noMatch: '맞는 코드가 없어요.',
  /** 고른 코드가 없는 줄 */
  none: '고른 코드 없음 · 이 칸은 채우지 않아요',
  /** 기타 줄 ERP 줄 이름 칸 */
  etcLabel: 'ERP 줄 이름',
  etcHint: '업무일지 2 줄 이름과 똑같이',
  /** 코드 조각 [×] 단추 이름 */
  remove: (code: string) => `${code} 빼기`,
  /** 저장 줄 글 셋 · 저장 실패 */
  dirty: '바꾼 것을 아직 저장하지 않았어요.',
  saved: '저장했어요.',
  never: '아직 한 번도 저장하지 않았어요.',
  saveFailed: '저장하지 못했어요. 이 화면을 닫지 말고 [저장]을 다시 눌러 주세요.',
} as const

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

/** 씨암·SONO 매출 규칙 줄 글(design.md 4절·9절). 안내서(README '4-2')도 이 글 그대로다 */
export const AMOUNT = {
  title: '매출로 셀 코드',
  about: (name: string) => `${name} 코드가 있는 진료에서 아래 코드의 금액만 치료별 매출 ${name}에 넣어요.`,
  codes: '셀 코드',
  empty: '비어 있으면 위 코드 줄 금액만 넣어요.',
}
const isAmountKey = (key: string | undefined): key is AmountKey => (AMOUNT_KEYS as readonly string[]).includes(key ?? '')
const isExcludeKey = (key: string | undefined): key is GroupKey => (EXCLUDE_KEYS as readonly string[]).includes(key ?? '')

/** 등록 코드 찾기 글(REQ-3708 AC-3708.2·3, design.md 10절). 안내서('4-2')도 이 글 그대로다 */
export const FIND = {
  waiting: '찾는 중…',
  none: '등록된 코드에 없어요.',
  added: '더함',
  old: 'ERP 도우미를 새 판으로 바꾸면 비트에 등록된 코드 전부에서 찾을 수 있어요.',
}
/** 찾기 칸에 치기를 멈춘 뒤 도우미에 묻기까지(AC-3708.2) */
export const FIND_DELAY_MS = 400
/** 도우미에 묻는 글자 수(closing.findCodes text: 앞뒤 공백 뗀 2~20자, AC-3708.1) */
const FIND_MIN = 2
const FIND_MAX = 20
/** 옛 도우미가 모르는 명령에 주는 번호(errors.ts 표에는 옛 도우미 글로 있다) */
const E_HELPER_UNKNOWN_COMMAND = 'E-HELPER-UNKNOWN-COMMAND'
/** 1년 목록에서 맞는 코드가 없을 때(지금 글) */
const NO_MATCH = SHARED_TEXT.noMatch

/** 규칙 조각의 {때}(AC-3709.1): 같이 있을 처방이 1개면 '같이 있으면', 2개 이상이면 '하나라도 있으면' 또는 '모두 있으면' */
const WHEN = { one: '같이 있으면', any: '하나라도 있으면', all: '모두 있으면' }
/** 규칙 조각의 코드 뒤 글: '— {같이 있을 코드를 ' · '로 이음} {때} 안 셈' */
const ruleTail = (withs: readonly string[], all: boolean) =>
  `— ${withs.join(' · ')} ${withs.length < 2 ? WHEN.one : all ? WHEN.all : WHEN.any} 안 셈`

/** 읽지 않을 처방 줄 글(REQ-3709 AC-3709.1·4, 승인 시안 exclude.html). 안내서('4-6')도 이 글 그대로다 */
export const EXCLUDE = {
  title: '읽지 않을 처방',
  about: (name: string) =>
    `고른 처방은 같이 있을 처방이 한 진료에 있으면 ${name}에 세지 않아요. 그 처방만 없는 것으로 보고, 같은 진료의 다른 ${name} 처방은 그대로 세요. 그 처방 때문에만 ${name}에 들던 진료는 건수에서도 빠져요.`,
  empty: '규칙이 없으면 지금처럼 모두 세요.',
  code: '이 처방',
  pick: '고르세요',
  with: '같이 있을 처방',
  when: '빼는 때',
  any: '하나라도 있으면',
  all: '모두 있을 때만',
  add: '규칙 더하기',
  hint: "'이 처방'을 고르고 같이 있을 처방을 찾아 담은 뒤 [규칙 더하기]를 누르세요. 규칙은 20개, 같이 있을 처방은 5개까지예요.",
  whenOne: WHEN.one,
  whenAny: WHEN.any,
  whenAll: WHEN.all,
  /** 규칙 조각 글 '{코드} — {같이 있을 처방} {때} 안 셈' */
  rule: (code: string, withs: readonly string[], all: boolean) => `${code} ${ruleTail(withs, all)}`,
  /** 같이 있을 처방 찾기 목록에서 막힌 줄 꼬리 글 */
  self: '이 처방',
  taken: '담음',
  remove: '규칙 지우기',
  /** [규칙 더하기]를 못 할 때 아래 글 자리 까닭(AC-3709.4, settings.ts ruleProblem 차례) */
  problems: {
    noCode: '이 처방을 골라 주세요.',
    noWith: '같이 있을 처방을 하나 이상 담아 주세요.',
    same: '이미 있는 규칙이에요.',
    full: '규칙은 20개까지예요.',
  } satisfies Record<RuleProblem, string>,
}

/** 설정 화면 글(design.md 5-3) */
const TEXT = {
  loading: '코드 목록을 받는 중이에요(30초쯤).',
  codesFailed: '도우미에서 코드 목록을 받지 못했어요 ',
  codesFailedTail: '고른 코드는 그대로 두고 저장할 수 있어요. 고친 뒤 이 화면을 새로고침(F5)하면 목록을 다시 받아요.',
  saveFailed: SHARED_TEXT.saveFailed,
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

/** 겹침 막는 글 한 줄(design.md 5-3). 이름 뒤 조사는 이름 마지막 글자의 받침으로 고른다(AC-3618.1) */
function conflictLine(c: Conflict): string {
  if (c.kind === 'fixedName') {
    return `${GROUP_NAMES[c.etc]} 줄 이름 ‘${c.name}’${josa(c.name, '은/는')} 업무일지 2에 이미 있는 줄 이름이에요. 다른 이름을 넣어 주세요.`
  }
  if (c.kind === 'sameName') {
    return `${c.etcs.map((etc) => GROUP_NAMES[etc]).join('·')} 줄 이름이 ‘${c.name}’${josa(c.name, '으로/로')} 같아요. 서로 다르게 넣어 주세요.`
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

type FoundCode = FoundCodes['codes'][number]

/** 열린 '셀 코드'·'같이 있을 처방' 찾기 칸의 지금 답(AC-3708.2·3) */
type Found =
  | { status: 'waiting' }
  /** 도우미가 준 등록 코드 */
  | { status: 'ok'; codes: FoundCode[] }
  /** 1년 목록에서 찾음: note = 찾기 칸 아래 줄(옛 도우미 새 판 안내 · 다른 오류의 errors.ts 글) */
  | { status: 'year'; codes: FoundCode[]; note: string }

/** 읽지 않을 처방 새 규칙 칸(화면에만, 저장하지 않음): '이 처방' · 같이 있을 처방 · 빼는 때 · 아래 글 자리 까닭 */
type Tray = { code: string; with: string[]; all: boolean; problem: RuleProblem | null }
const emptyTray = (): Tray => ({ code: '', with: [], all: false, problem: null })

/** 찾기 칸 셋: 고른 코드(1년 목록) · 씨암·SONO 셀 코드 · 같이 있을 처방(둘은 도우미에 묻는다) */
type Where = 'pick' | 'amount' | 'exclude'
/** 찾기 목록(.dd)과 찾기 칸 아래 줄(.old)의 칸 이름 */
const DD_ATTR: Record<Where, string> = { pick: 'data-dd', amount: 'data-add-dd', exclude: 'data-xdd' }
const NOTE_ATTR: Record<Where, string | null> = { pick: null, amount: 'data-anote', exclude: 'data-xnote' }

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
  /** 열린 찾기 칸 하나 */
  open: { where: Where; key: GroupKey; text: string } | null
  /** 열린 셀 코드·같이 있을 처방 찾기의 답. 2자 미만이거나 닫혔으면 null */
  found: Found | null
  /** 도우미가 closing.findCodes를 모름(옛 판): 그 뒤로는 묻지 않고 1년 목록에서 찾는다 */
  helperOld: boolean
  /** 줄마다 읽지 않을 처방 새 규칙 칸 */
  trays: Partial<Record<GroupKey, Tray>>
  /** 도우미 찾기로 받은 코드 이름(1년 목록에 없는 같이 있을 처방 조각에 붙인다) */
  names: Map<string, string | null>
}

let page: Page
let main: HTMLElement
let stop: AbortController | null = null
/** 도우미에 묻기 전 0.4초 시계와 질문 번호(마지막 질문 답만 쓴다) */
let findTimer: ReturnType<typeof setTimeout> | undefined
let findSeq = 0

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

/**
 * 서비스 워커에 도우미 명령 하나를 묻는다. 답이 없거나 연결이 없으면 E-HELPER-MISSING, 오류 번호 모양이 아니면 E-BRIDGE-BAD-REPLY(errors.ts),
 * result가 아니면 E-BRIDGE-BAD-REPLY
 */
async function askHelper(cmd: ClosingCommand, args: Record<string, unknown>): Promise<{ data: unknown } | { code: string }> {
  let reply: unknown
  try {
    reply = await chrome.runtime.sendMessage({ cmd, args })
  } catch {
    return { code: E_HELPER_MISSING }
  }
  if (reply === undefined || reply === null) return { code: E_HELPER_MISSING }
  if (isRecord(reply) && reply.type === 'error') return { code: explain(reply.code).code }
  if (isRecord(reply) && reply.type === 'result') return { data: reply.data }
  return { code: E_BRIDGE_BAD_REPLY }
}

/** 도우미 closing.codes(1년 목록). 답 모양이 틀리면 E-BRIDGE-BAD-REPLY */
async function askCodes(): Promise<Codes> {
  const got = await askHelper('closing.codes', {})
  if ('code' in got) return { status: 'error', code: got.code }
  const data = readCodes(got.data)
  if (!data) return { status: 'error', code: E_BRIDGE_BAD_REPLY }
  return { status: 'ok', list: data.codes, names: new Map(data.codes.map((c) => [c.code, c.name])), kinds: data.kinds }
}

/** closing.findCodes 답 모양 검사(AC-3708.1). 코드 꼴이 아닌 코드는 빼고(더할 수 없다) 겹친 코드는 한 번, 30개까지 */
function readFound(data: unknown): FoundCode[] | null {
  if (!isRecord(data) || !Array.isArray(data.codes)) return null
  const out: FoundCode[] = []
  for (const c of data.codes) {
    if (!isRecord(c) || typeof c.code !== 'string' || !isName(c.name)) return null
    const code = cleanCode(c.code)
    if (code !== null && !out.some((o) => o.code === code)) out.push({ code, name: c.name })
  }
  return out.slice(0, MAX_RESULTS)
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

const isEtcKey = (key: GroupKey): key is EtcKey => (ETC_KEYS as readonly string[]).includes(key)

/** 새 처음 코드 줄의 항목 이름: 기타 줄은 화면의 그 ERP 줄 이름(빈칸 하나로·앞뒤 공백 뗌), 비었으면 '기타N'(AC-3618.6) */
function itemName(key: GroupKey): string {
  const own = isEtcKey(key) ? (page.settings.etcNames[key] ?? '').replace(/\s+/g, ' ').trim() : ''
  return own || GROUP_NAMES[key]
}

/** 기타 줄 이름을 바꾸면 새 처음 코드 줄만 다시 그린다(이름 칸은 그대로라 쓰던 자리를 잃지 않는다) */
function refreshFresh() {
  const shown = main.querySelector('.notice.fresh')
  const next = freshNotice()
  if (shown && next) shown.replaceWith(next)
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
    h('p', {}, h('b', {}, TEXT.fresh), ' ', items.map(({ key, codes }) => `${itemName(key)} ${codes.join('·')}`).join(' · ')),
    h('p', {}, TEXT.freshNote),
    h('button', { type: 'button', class: 'btn btn-2', 'data-fresh': '' }, TEXT.freshAdd),
  )
}

/** 코드 조각. del = [×] 단추의 칸 이름(고른 코드 data-del · 셀 코드 data-adel) */
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
    h('button', { type: 'button', [del]: code, 'aria-label': SHARED_TEXT.remove(code) }, '×'),
  )
}

/** 고른 코드 줄 찾기 결과(1년 목록, 지금 그대로) */
function results(key: GroupKey, text: string): HTMLElement[] {
  if (page.codes.status !== 'ok') return []
  const found = search(page.codes.list, text)
  if (found.length === 0) return [h('p', { class: 'empty' }, NO_MATCH)]
  const mine = page.settings.picks[key] ?? []
  return found.map((c) => {
    const has = mine.includes(c.code)
    return h(
      'button',
      { type: 'button', 'data-add': c.code, disabled: has },
      h('b', {}, c.code),
      h('span', {}, c.name ?? ''),
      h('em', {}, has ? SHARED_TEXT.picked : `최근 1년 ${count(c.visits)}번`),
    )
  })
}

/** 코드 견주기(대문자, AC-3607.7) */
const hasCode = (list: readonly string[], code: string) => list.some((c) => c.toUpperCase() === code.toUpperCase())

/** 줄마다 새 규칙 칸(없으면 빈 칸을 만들어 둔다) */
function trayOf(key: GroupKey): Tray {
  const tray = page.trays[key] ?? emptyTray()
  page.trays[key] = tray
  return tray
}

/** 셀 코드·같이 있을 처방 찾기 목록에서 막힌 줄 꼬리 글: 셀 코드는 이미 더한 '더함', 같이 있을 처방은 '이 처방'·이미 담은 '담음' */
function foundMark(where: 'amount' | 'exclude', key: GroupKey, code: string): string {
  if (where === 'amount') return isAmountKey(key) && hasCode(page.settings.amounts[key].codes, code) ? FIND.added : ''
  const tray = trayOf(key)
  if (tray.code && hasCode([tray.code], code)) return EXCLUDE.self
  return hasCode(tray.with, code) ? EXCLUDE.taken : ''
}

/** 열린 셀 코드·같이 있을 처방 찾기 목록(AC-3708.2·3): 찾는 중 · 코드 · 이름 · 꼬리 글 · 0개 글(등록 코드 / 1년 목록) */
function foundItems(where: 'amount' | 'exclude', key: GroupKey): HTMLElement[] {
  const found = page.found
  if (!found) return []
  if (found.status === 'waiting') return [h('p', { class: 'empty' }, FIND.waiting)]
  if (found.codes.length === 0) return [h('p', { class: 'empty' }, found.status === 'ok' ? FIND.none : NO_MATCH)]
  return found.codes.map((c) => {
    const mark = foundMark(where, key, c.code)
    return h(
      'button',
      { type: 'button', [where === 'amount' ? 'data-aadd' : 'data-xwith']: c.code, disabled: mark !== '' },
      h('b', {}, c.code),
      h('span', {}, c.name ?? ''),
      h('em', {}, mark),
    )
  })
}

/** 찾기 칸 아래 줄: 1년 목록에서 찾았을 때만(옛 도우미 새 판 안내 · 다른 오류 글) */
const foundNote = () => (page.found?.status === 'year' ? page.found.note : '')

/** 열린 찾기 칸이 이것이면 그 칸 */
function openAt(where: Where, key: GroupKey) {
  return page.open?.where === where && page.open.key === key ? page.open : null
}

/** 찾기 목록(.dd)·찾기 칸 아래 줄(.old)의 그 열린 칸 내용 */
function findParts(where: Where, key: GroupKey): { items: HTMLElement[]; note: string } {
  const open = openAt(where, key)
  if (!open) return { items: [], note: '' }
  if (where === 'pick') return { items: open.text.trim() ? results(key, open.text) : [], note: '' }
  return { items: foundItems(where, key), note: foundNote() }
}

/** 찾기 칸 안내 글: 목록을 못 받음 · 20개 다 고름 · 보통 */
function findPlaceholder(full: boolean): string {
  if (page.codes.status === 'error') return '코드 목록을 받지 못해 찾을 수 없어요'
  return full ? SHARED_TEXT.full : SHARED_TEXT.find
}

function codeRow(key: GroupKey, use: string): HTMLElement {
  const name = GROUP_NAMES[key]
  const mine = page.settings.picks[key] ?? []
  const full = mine.length >= MAX_CODES
  const placeholder = findPlaceholder(full)
  const open = openAt('pick', key)?.text ?? ''
  const etc = key === 'etc1' || key === 'etc2' || key === 'etc3' || key === 'etc4'
    ? h(
        'label',
        { class: 'etc' },
        h('span', {}, SHARED_TEXT.etcLabel),
        h('input', {
          type: 'text',
          maxlength: '20',
          'data-etc': key,
          value: page.settings.etcNames[key],
          placeholder: SHARED_TEXT.etcHint,
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
        ...(mine.length > 0 ? mine.map((code) => codeChip(code)) : [h('span', { class: 'none' }, SHARED_TEXT.none)]),
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
 * 씨암·SONO 줄 바로 아래 '매출로 셀 코드' 줄(design.md 4절·9절, TASK-15·TASK-9): 안내 글 한 문장 · '셀 코드' 조각 + 찾기(20개까지)
 * · 셀 코드가 비면 그 뜻 한 줄. 앞글자는 읽지 않아(AC-3707.2) 그리지 않는다. 두 줄 모양은 같다.
 * 찾기는 도우미 등록 코드 찾기(REQ-3708), 찾기 칸 아래 줄은 1년 목록에서 찾았을 때만
 */
function amountRow(key: AmountKey): HTMLElement {
  const name = GROUP_NAMES[key]
  const rule = page.settings.amounts[key]
  const codesFull = rule.codes.length >= MAX_CODES
  const open = openAt('amount', key)?.text ?? ''
  const { items, note } = findParts('amount', key)
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
            'aria-label': `${name} ${AMOUNT.codes} 찾기`,
            autocomplete: 'off',
          }),
          h('div', { class: 'dd', 'data-add-dd': key, hidden: items.length === 0 }, ...items),
        ),
      ),
      h('p', { class: 'old', 'data-anote': key, hidden: !note }, note),
      rule.codes.length === 0 && h('p', { class: 'none' }, AMOUNT.empty),
    ),
  )
}

/** 같이 있을 처방 조각: 이름은 1년 목록, 없으면 도우미 찾기로 받은 이름(없으면 코드만) */
function withChip(code: string): HTMLElement {
  const known = page.codes.status === 'ok' ? page.codes.names.get(code) : undefined
  const name = known ?? page.names.get(code) ?? null
  return h(
    'span',
    { class: 'chip' },
    h('b', {}, code),
    name ? h('span', { class: 'cn' }, name) : null,
    h('button', { type: 'button', 'data-xwdel': code, 'aria-label': `${code} 빼기` }, '×'),
  )
}

/**
 * 건수를 세는 줄 아래 '읽지 않을 처방' 줄(REQ-3709 AC-3709.1, 승인 시안 exclude.html): 안내 글 · 규칙 조각(또는 빈 글) ·
 * 새 규칙 칸('이 처방' · 같이 있을 처방 조각 + 찾기 · 빼는 때 둘 · [규칙 더하기]) · 아래 글(또는 까닭) · 찾기 칸 아래 줄
 */
function excludeRow(key: GroupKey): HTMLElement {
  const name = GROUP_NAMES[key]
  const rules = page.settings.excludes?.[key] ?? []
  const tray = trayOf(key)
  const open = openAt('exclude', key)?.text ?? ''
  const { items, note } = findParts('exclude', key)
  const radio = (all: boolean, label: string) =>
    h(
      'label',
      { class: 'rad' },
      h('input', { type: 'radio', name: `xall-${key}`, value: all ? 'all' : 'any', 'data-xall': key, checked: tray.all === all }),
      label,
    )
  const ruleChip = (rule: ExcludeRule, i: number) =>
    h(
      'div',
      { class: 'rule' },
      h('b', {}, rule.code),
      h('span', {}, ruleTail(rule.with, rule.all)),
      h('button', { type: 'button', 'data-xrdel': String(i), 'aria-label': EXCLUDE.remove }, '×'),
    )
  return h(
    'div',
    { class: 'orow exc', 'data-excludes': key },
    h('div', { class: 'oname' }, h('b', {}, EXCLUDE.title)),
    h(
      'div',
      { class: 'opick' },
      h('p', { class: 'about' }, EXCLUDE.about(name)),
      rules.length > 0 ? h('div', { class: 'rules' }, ...rules.map(ruleChip)) : h('p', { class: 'none' }, EXCLUDE.empty),
      h(
        'div',
        { class: 'tray' },
        h(
          'div',
          { class: 'pickline' },
          h('span', { class: 'sub' }, EXCLUDE.code),
          h(
            'select',
            { 'data-xcode': key, 'aria-label': `${name} ${EXCLUDE.title} ${EXCLUDE.code}` },
            h('option', { value: '', selected: !tray.code }, EXCLUDE.pick),
            ...ruleCodes(page.settings, key).map((code) => h('option', { value: code, selected: code === tray.code }, code)),
          ),
        ),
        h(
          'div',
          { class: 'pickline' },
          h('span', { class: 'sub' }, EXCLUDE.with),
          ...tray.with.map(withChip),
          h(
            'div',
            { class: 'find' },
            h('input', {
              type: 'search',
              'data-xfind': key,
              placeholder: findPlaceholder(false),
              value: open,
              disabled: page.codes.status !== 'ok' || tray.with.length >= MAX_WITH,
              'aria-label': `${name} ${EXCLUDE.with} 찾기`,
              autocomplete: 'off',
            }),
            h('div', { class: 'dd', 'data-xdd': key, hidden: items.length === 0 }, ...items),
          ),
        ),
        h('div', { class: 'pickline' }, h('span', { class: 'sub' }, EXCLUDE.when), radio(false, EXCLUDE.any), radio(true, EXCLUDE.all)),
        h(
          'div',
          { class: 'acts2' },
          h('button', { type: 'button', class: 'btn btn-2', 'data-xadd': key, disabled: !tray.code && tray.with.length === 0 }, EXCLUDE.add),
        ),
      ),
      tray.problem ? h('p', { class: 'hint err' }, EXCLUDE.problems[tray.problem]) : h('p', { class: 'hint' }, EXCLUDE.hint),
      h('p', { class: 'old', 'data-xnote': key, hidden: !note }, note),
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
  for (const attr of ['data-etc', 'data-find', 'data-radd', 'data-afind', 'data-xfind', 'data-xcode']) {
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
        // 줄 차례: 고른 코드 줄 → (씨암·SONO) 매출로 셀 코드 줄 → (건수 세는 17줄) 읽지 않을 처방 줄
        ...s.rows.flatMap(([key, use]) => [codeRow(key, use), isAmountKey(key) && amountRow(key), isExcludeKey(key) && excludeRow(key)]),
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
  // 막는 글이 열려 있으면 앞서 보이던 '저장했어요.'를 함께 보이지 않는다(비움, AC-3618.5)
  const blocked = page.ask?.kind === 'blocked'
  const saved = page.everSaved && !blocked
  status.className = 'status' + (page.dirty ? ' dirty' : saved ? ' saved' : '')
  status.textContent = page.dirty ? SHARED_TEXT.dirty : saved ? SHARED_TEXT.saved : page.everSaved ? '' : SHARED_TEXT.never
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
  renderStatus()
}

function closeAsk() {
  page.ask = null
  renderAsk()
  renderStatus()
}

/** 화면 값을 바꿨다: 저장 안 함 상태로, 열린 묻기·막는 글은 지난 값이라 닫는다 */
function changed() {
  page.dirty = true
  page.rev += 1
  if (page.ask) closeAsk()
  renderStatus()
}

/** 아직 묻지 않은 도우미 질문은 그만두고, 이미 물은 질문의 답은 버린다(질문 번호를 올림) */
function stopAsking() {
  clearTimeout(findTimer)
  findTimer = undefined
  findSeq += 1
}

/**
 * 열린 찾기 칸 하나만 목록·칸 아래 줄을 보이고 다른 것은 닫는다. 그 자리에서 내용만 바꿔 써서(다시 그리지 않음)
 * 치던 찾기 칸과 글자 자리가 그대로다
 */
function showFind() {
  const open = page.open
  const dd = open ? main.querySelector<HTMLElement>(`[${DD_ATTR[open.where]}="${open.key}"]`) : null
  const noteAttr = open ? NOTE_ATTR[open.where] : null
  const note = open && noteAttr ? main.querySelector<HTMLElement>(`[${noteAttr}="${open.key}"]`) : null
  for (const other of main.querySelectorAll<HTMLElement>('.dd')) if (other !== dd) other.hidden = true
  for (const other of main.querySelectorAll<HTMLElement>('.old')) if (other !== note) other.hidden = true
  if (!open) return
  const parts = findParts(open.where, open.key)
  if (dd) {
    dd.hidden = parts.items.length === 0
    dd.replaceChildren(...parts.items)
  }
  if (note) {
    note.hidden = !parts.note
    note.textContent = parts.note
  }
}

/** 열린 찾기 칸을 잊는다(묻던 질문도 그만둠). 화면은 부른 쪽이 그린다 */
function forgetFind() {
  stopAsking()
  page.open = null
  page.found = null
}

function closeFind() {
  forgetFind()
  showFind()
}

// --- 누르기 ---

/** 고른 코드 줄 찾기 칸 하나만 연다(1년 목록, 다른 찾기 목록은 닫는다) */
function openPick(key: GroupKey, text: string) {
  stopAsking()
  page.open = { where: 'pick', key, text }
  page.found = null
  showFind()
}

/** 도우미에 물을 글자: 앞뒤 공백을 떼고 20자까지, 2자 미만이면 null(AC-3708.1·2) */
function findText(value: string): string | null {
  const text = value.trim().slice(0, FIND_MAX).trim()
  return text.length >= FIND_MIN ? text : null
}

/** 1년 목록에서 찾은 답(옛 도우미·다른 오류일 때, AC-3708.3). note = 찾기 칸 아래 줄 */
function yearFound(text: string, note: string): Found {
  const codes = page.codes.status === 'ok' ? search(page.codes.list, text).map(({ code, name }) => ({ code, name })) : []
  return { status: 'year', codes, note }
}

/** 다른 오류의 찾기 칸 아래 줄: errors.ts '{무엇이} {어떻게} ({번호})' */
function errorNote(code: string): string {
  const said = explain(code)
  return `${said.what} ${said.how} (${said.code})`
}

/**
 * 셀 코드·같이 있을 처방 찾기 칸에 쳤다(AC-3708.2·3): 2자 미만이면 목록을 닫고, 옛 도우미면 바로 1년 목록,
 * 아니면 '찾는 중…'을 보이고 치기를 멈춘 지 0.4초 뒤 도우미에 묻는다(그 사이 또 치면 처음부터)
 */
function startFind(where: 'amount' | 'exclude', key: GroupKey, value: string) {
  stopAsking()
  page.open = { where, key, text: value }
  const text = findText(value)
  if (text === null) page.found = null
  else if (page.helperOld) page.found = yearFound(text, FIND.old)
  else {
    page.found = { status: 'waiting' }
    const mine = page
    const seq = findSeq
    findTimer = setTimeout(() => void askFound(mine, seq, text), FIND_DELAY_MS)
  }
  showFind()
}

/** 도우미 closing.findCodes. 그 사이 화면을 다시 열었거나 다른 글자로 물었거나 찾기를 닫았으면 답을 버린다(마지막 질문 답만) */
async function askFound(mine: Page, seq: number, text: string) {
  const got = await askHelper('closing.findCodes', { text })
  if (page !== mine || seq !== findSeq || !page.open) return
  if ('data' in got) {
    const codes = readFound(got.data)
    page.found = codes ? { status: 'ok', codes } : yearFound(text, errorNote(E_BRIDGE_BAD_REPLY))
  } else if (got.code === E_HELPER_UNKNOWN_COMMAND) {
    page.helperOld = true
    page.found = yearFound(text, FIND.old)
  } else {
    page.found = yearFound(text, errorNote(got.code))
  }
  showFind()
}

function onInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const find = target.dataset.find as GroupKey | undefined
  if (find) {
    openPick(find, target.value)
    return
  }
  const afind = target.dataset.afind
  if (isAmountKey(afind)) {
    startFind('amount', afind, target.value)
    return
  }
  const xfind = target.dataset.xfind
  if (isExcludeKey(xfind)) {
    startFind('exclude', xfind, target.value)
    return
  }
  const etc = target.dataset.etc as EtcKey | undefined
  if (etc) {
    page.settings.etcNames[etc] = target.value
    changed()
    refreshFresh()
  }
}

function onChange(event: Event) {
  const target = event.target
  const xcode = target instanceof HTMLSelectElement ? target.dataset.xcode : undefined
  if (isExcludeKey(xcode)) {
    pickRuleCode(xcode, (target as HTMLSelectElement).value)
    return
  }
  const xall = target instanceof HTMLInputElement ? target.dataset.xall : undefined
  if (isExcludeKey(xall)) {
    pickRuleAll(xall, (target as HTMLInputElement).value === 'all')
    return
  }
  if (!(target instanceof HTMLSelectElement) || !target.value) return
  const row = target.dataset.radd as RsvRow | undefined
  if (!row) return
  page.settings.reservations[row] = addKind(page.settings.reservations[row] ?? [], target.value)
  changed()
  renderMain({ selector: `[data-radd="${row}"]`, start: null, end: null })
}

/** 씨암·SONO '매출로 셀 코드' 줄 단추(셀 코드 더하기·빼기). 그 줄 단추였으면 true */
function onAmountClick(target: Element): boolean {
  const key = target.closest<HTMLElement>('[data-amount]')?.dataset.amount
  if (!isAmountKey(key)) return false
  const rule = page.settings.amounts[key]
  const add = target.closest<HTMLElement>('[data-aadd]')
  if (add) {
    page.settings.amounts[key] = { ...rule, codes: addCode(rule.codes, add.dataset.aadd ?? '') }
    forgetFind()
    changed()
    renderMain({ selector: `[data-afind="${key}"]`, start: null, end: null })
    return true
  }
  const del = target.closest<HTMLElement>('[data-adel]')
  if (del) {
    page.settings.amounts[key] = { ...rule, codes: without(rule.codes, del.dataset.adel ?? '') }
    dropRulesOf(key)
    changed()
    renderMain()
    return true
  }
  return false
}

// --- 읽지 않을 처방(REQ-3709 AC-3709.1·4) ---

/** 줄에서 코드를 뺀 뒤: 그 코드가 '이 처방'인 규칙(normalize와 같은 다듬기)과 새 규칙 칸의 '이 처방'을 뺀다 */
function dropRulesOf(key: GroupKey) {
  page.settings.excludes = cleanExcludes(page.settings.excludes, page.settings.picks, page.settings.amounts)
  const tray = page.trays[key]
  if (tray?.code && !ruleCodes(page.settings, key).includes(tray.code)) {
    tray.code = ''
    tray.problem = null
  }
}

/** 그 줄 규칙 목록을 바꿔 둔다(비면 그 줄 칸을 뺀다) */
function setRules(key: GroupKey, rules: ExcludeRule[]) {
  const excludes = { ...(page.settings.excludes ?? {}) }
  if (rules.length > 0) excludes[key] = rules
  else delete excludes[key]
  page.settings.excludes = excludes
}

/** '이 처방'을 골랐다(화면에만): 같이 있을 처방에 같은 코드가 있으면 뺀다 */
function pickRuleCode(key: GroupKey, code: string) {
  const tray = trayOf(key)
  tray.code = code
  tray.with = without(tray.with, code)
  tray.problem = null
  renderMain({ selector: `[data-xcode="${key}"]`, start: null, end: null })
}

/** '빼는 때'를 골랐다(화면에만) */
function pickRuleAll(key: GroupKey, all: boolean) {
  const tray = trayOf(key)
  tray.all = all
  tray.problem = null
  renderMain({ selector: `[data-xall="${key}"][value="${all ? 'all' : 'any'}"]`, start: null, end: null })
}

/** [규칙 더하기](AC-3709.4): 되면 목록 끝에 더하고 새 규칙 칸을 비운다(저장할 바꿈). 안 되면 아래 글 자리에 까닭 */
function addRule(key: GroupKey) {
  const tray = trayOf(key)
  const rules = page.settings.excludes?.[key] ?? []
  const rule: ExcludeRule = { code: tray.code, with: [...tray.with], all: tray.all }
  const problem = ruleProblem(rules, rule)
  if (problem) {
    tray.problem = problem
    renderMain({ selector: `[data-xadd="${key}"]`, start: null, end: null })
    return
  }
  setRules(key, [...rules, rule])
  page.trays[key] = emptyTray()
  changed()
  renderMain({ selector: `[data-xcode="${key}"]`, start: null, end: null })
}

/** '읽지 않을 처방' 줄 단추(같이 있을 처방 담기·빼기 · [규칙 더하기] · 규칙 [×]). 그 줄 단추였으면 true */
function onExcludeClick(target: Element): boolean {
  const key = target.closest<HTMLElement>('[data-excludes]')?.dataset.excludes
  if (!isExcludeKey(key)) return false
  const tray = trayOf(key)
  const pick = target.closest<HTMLElement>('[data-xwith]')
  if (pick) {
    const code = pick.dataset.xwith ?? ''
    const found = page.found && page.found.status !== 'waiting' ? page.found.codes.find((c) => c.code === code) : undefined
    if (found) page.names.set(code, found.name)
    if (code && code !== tray.code && !tray.with.includes(code) && tray.with.length < MAX_WITH) tray.with = [...tray.with, code]
    tray.problem = null
    forgetFind()
    renderMain({ selector: `[data-xfind="${key}"]`, start: null, end: null })
    return true
  }
  const wdel = target.closest<HTMLElement>('[data-xwdel]')
  if (wdel) {
    tray.with = without(tray.with, wdel.dataset.xwdel ?? '')
    tray.problem = null
    renderMain()
    return true
  }
  if (target.closest('[data-xadd]')) {
    addRule(key)
    return true
  }
  const rdel = target.closest<HTMLElement>('[data-xrdel]')
  if (rdel) {
    const at = Number(rdel.dataset.xrdel)
    setRules(key, (page.settings.excludes?.[key] ?? []).filter((_, i) => i !== at))
    changed()
    renderMain()
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
  if (onAmountClick(target) || onExcludeClick(target)) return
  const add = target.closest<HTMLElement>('[data-add]')
  const key = target.closest<HTMLElement>('[data-row]')?.dataset.row as GroupKey | undefined
  if (add && key) {
    page.settings.picks[key] = addCode(page.settings.picks[key] ?? [], add.dataset.add ?? '')
    forgetFind()
    changed()
    renderMain({ selector: `[data-find="${key}"]`, start: null, end: null })
    return
  }
  const del = target.closest<HTMLElement>('[data-del]')
  if (del && key) {
    page.settings.picks[key] = without(page.settings.picks[key] ?? [], del.dataset.del ?? '')
    dropRulesOf(key)
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
  forgetFind()
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
    // 고른 코드·매출 규칙만 처음 값이고 읽지 않을 처방 규칙·새 규칙 칸은 비운다(기타 줄 이름·예약 메모·overlap·defaultsSeen은 그대로), 저장은 [저장]
    closeAsk()
    page.settings = resetCodes(page.settings)
    page.trays = {}
    forgetFind()
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

/** 의사랑 화면이 도우미에 묻는 길(서비스 워커 { cmd, args }, 답은 받은 그대로) */
const sendToHelper: Send = (cmd, args) => chrome.runtime.sendMessage({ cmd, args })

/**
 * 설정 화면을 연다. 의사랑 설정만 저장돼 있으면 의사랑 화면(도우미를 부르지 않음, AC-4214.1). 그 밖은 저장한 설정(없으면 처음 값)을
 * 그리고, 도우미 코드 목록이 오면 다시 그린다. 도우미가 의사랑 자료원이라고 하면(E-CLOSING-WRONG-SOURCE) 오류 글 없이 의사랑 화면
 */
export async function startOptions(): Promise<void> {
  stop?.abort()
  stopAsking()
  stopUisOptions()
  const controller = new AbortController()
  stop = controller
  const signal = controller.signal
  // 설정 값은 읽지 않고 있는지만 본다. 못 보면 지금처럼 비트 화면부터
  const sources = await savedSources().catch(() => ({ bit: false, uis: false }))
  if (signal.aborted) return
  if (sources.uis && !sources.bit) {
    await startUisOptions(document, { send: sendToHelper })
    return
  }
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
    found: null,
    helperOld: false,
    trays: {},
    names: new Map(),
  }

  main.addEventListener('input', onInput, { signal })
  main.addEventListener('change', onChange, { signal })
  main.addEventListener('click', onClick, { signal })
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
  if (got.status === 'error' && got.code === E_CLOSING_WRONG_SOURCE) {
    // 비트 화면 누르기·나가기 확인을 떼고 의사랑 화면으로 바꿔 그린다
    controller.abort()
    stopAsking()
    await startUisOptions(document, { send: sendToHelper })
    return
  }
  page.codes = got
  renderMain()
}

// 확장 설정 화면으로 열렸을 때만 스스로 시작한다(시험은 startOptions를 직접 부른다)
if (typeof chrome !== 'undefined' && chrome.runtime?.id && document.getElementById('optMain')) void startOptions()
