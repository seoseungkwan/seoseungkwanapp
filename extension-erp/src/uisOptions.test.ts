// @vitest-environment jsdom
// 의사랑 설정 화면(spec erp-uisarang TASK-12, design.md 8-8·9-5·10-6·11절 1·10·18)을 가짜 chrome.storage.local과 가짜 send로 시험한다.
// 글은 승인된 시안 docs/mockups/erp-uisarang/(?s=optNoFile·optFirst·optSearch·optSaved)과 design.md 10-6 그대로다.
// 코드·처방명칭·숫자는 시안 예시처럼 지은 값이다(환자 정보 없음)
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY } from './types'
import { startUisOptions, stopUisOptions } from './uisOptions'
import { UIS_CODES_KEY, UIS_SETTINGS_KEY } from './uisTypes'
import type { Send, UisCodeRow, UisCodes, UisSettings } from './uisTypes'

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 21자 코드(코드 꼴 20자를 넘음 — 목록에는 보이지만 고를 수 없다) */
const LONG = 'SONOLONGCODE123456789'

/** 의사랑 기간별처방통계에서 읽은 목록 예시: [코드, 처방명칭, 총투여량, 총액]. 도우미처럼 총액 큰 차례 */
const ROWS: [string, string | null, number, number][] = [
  ['AA254', '재진진찰료', 5120, 59187200],
  ['la358', '신경근차단술', 1190, 41888000],
  ['sono5', '초음파 유도 주사', 402, 24120000],
  ['ESWT 1부위', '체외충격파 1부위', 240, 21600000],
  ['KR006', '도수치료', 388, 19400000],
  ['AA154', '초진진찰료', 812, 13218000],
  ['AA222', '재진진찰료(물리치료 · 주사 등)', 2310, 9563400],
  ['CRYO 대관절', '크라이오 대관절', 133, 3990000],
  ['MM080', '경피적전기신경자극치료', 2190, 3285000],
  ['KK090', '관절강내주사', 210, 2730000],
  ['MM101', '간섭파전류치료', 1880, 2632000],
  ['MM010', '표층열치료', 2280, 2052000],
  ['HA280', '관절조영', 9, 1530000],
  ['MM085', '재활저출력레이저치료', 640, 1286400],
  ['CRYO 소관절', '크라이오 소관절', 58, 1160000],
  ['LIDO', '리도카인 주사', 403.5, 403500],
  ['DEXA', '덱사메타손 주사', 121.5, 243000],
  ['SOLU', '솔루메드롤 주사', 31.5, 94500],
  ['mm010 100/100', '표층열치료(100/100)', 77, 69300],
  [LONG, '긴 코드 예시', 3, 300],
  ['SONO-X', null, 2, 100],
  ['sono0', '초음파 표시(0원)', 1620, 0],
  ['carm', '씨암 표시(0원)', 1410, 0],
  ['도수상담', '도수치료 상담', 61, 0],
]
const rows = (list: [string, string | null, number, number][]): UisCodeRow[] =>
  list.map(([code, name, qty, amount]) => ({ code, name, qty, amount }))
const CODES: UisCodes = { v: 1, from: '2026-08-24', to: '2026-11-23', codes: rows(ROWS) }

/** 시안 ⑱ 저장한 모습(목록에 없는 KR006-1 · 기타1 이름 '크라이오') */
const SAVED: UisSettings = {
  v: 1,
  counts: { carm: ['carm'], sono: ['sono0', 'sono5'], manual: ['KR006', 'KR006-1'], manualConsult: ['도수상담'], ptVisit: ['AA222'] },
  sales: { carm: ['la358'], sono: ['sono5'], manual: ['KR006', 'KR006-1'], pt: ['MM010', 'MM080'], etc1: ['CRYO 대관절', 'CRYO 소관절'] },
  etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
}

type Reply = unknown | (() => Promise<unknown>)

function fakeChrome(opts: { settings?: unknown; codes?: unknown } = {}) {
  const data: Record<string, unknown> = {}
  if (opts.settings !== undefined) data[UIS_SETTINGS_KEY] = JSON.parse(JSON.stringify(opts.settings))
  if (opts.codes !== undefined) data[UIS_CODES_KEY] = JSON.parse(JSON.stringify(opts.codes))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, JSON.parse(JSON.stringify(items)))
    }),
  }
  const sendMessage = vi.fn(async () => undefined)
  vi.stubGlobal('chrome', { runtime: { id: 'erp-test', sendMessage }, storage: { local } })
  return { data, local, sendMessage }
}

/** 가짜 send: closing.uisCodes 답(함수면 부를 때마다 그 약속) */
function fakeSend(reply: Reply = { type: 'result', data: { state: 'missing', from: null, to: null, value: null, codes: [] } }) {
  return vi.fn<Send>(async () => (typeof reply === 'function' ? (reply as () => Promise<unknown>)() : reply))
}

/** options.html을 jsdom 문서에 그대로 올린다(스크립트는 돌지 않는다) */
function mountPage() {
  const html = readFileSync(path.join(EXT, 'options.html'), 'utf8')
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.title = parsed.title
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
}

async function open(opts: { settings?: unknown; codes?: unknown; reply?: Reply } = {}) {
  const fake = fakeChrome(opts)
  const send = fakeSend(opts.reply)
  mountPage()
  await startUisOptions(document, { send })
  return { ...fake, send }
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => {
  const found = root.querySelector<T>(sel)
  if (!found) throw new Error(`${sel} 없음`)
  return found
}
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const flush = () => new Promise((r) => setTimeout(r, 0))
const status = () => text($('#optStatus'))
const row = (key: string) => $(`[data-row="${key}"]`)
const kline = (key: string, kind: 'counts' | 'sales') => $(`[data-kind="${kind}"]`, row(key))
const findOf = (key: string, kind: 'counts' | 'sales') => $<HTMLInputElement>(`[data-find="${key}"][data-kind="${kind}"]`)
const ddOf = (key: string, kind: 'counts' | 'sales') => $(`[data-dd="${key}-${kind}"]`)
const chipCodes = (key: string, kind: 'counts' | 'sales') => $$('.chip b', kline(key, kind)).map(text)
/** 조각 글: 코드 · 이름 · × 를 칸마다 띄어 읽는다 */
const parts = (el: Element | null | undefined) => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ')
const chipText = (key: string, kind: 'counts' | 'sales', code: string) =>
  parts($$('.chip', kline(key, kind)).find((c) => text(c.querySelector('b')) === code))
/** 열린 찾기 목록의 줄: [코드, 처방명칭, 꼬리, 막힘] */
const results = (key: string, kind: 'counts' | 'sales') =>
  $$<HTMLButtonElement>('button', ddOf(key, kind)).map((b) => [text(b.querySelector('b')), text(b.querySelector('span')), text(b.querySelector('em')), b.disabled])
function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function leaveBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
/** 찾기 칸에 글자를 넣고 그 코드 줄을 누른다 */
function pick(key: string, kind: 'counts' | 'sales', search: string, code: string) {
  type(findOf(key, kind), search)
  const button = $$<HTMLButtonElement>('button[data-add]', ddOf(key, kind)).find((b) => b.dataset.add === code)
  if (!button) throw new Error(`${code} 줄 없음`)
  button.click()
}
/** 표 칸 글: 칸 안 글 조각(줄바꿈 br 사이)을 띄어 읽는다 */
const cellText = (td: Element) =>
  [...td.childNodes]
    .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
const answer = (data: unknown) => ({ type: 'result', data })

/** design.md 9-5 줄 차례(건수와 매출 · 매출만 · 건수만) */
const ROW_ORDER = [
  'carm',
  'sono',
  'arthro',
  'manual',
  'eswt',
  'pt',
  'etc1',
  'etc2',
  'etc3',
  'etc4',
  'manualConsult',
  'lipus',
  'nail',
  'ct',
  'surgery',
  'eswtStd',
  'eswtRadial',
  'ptVisit',
]
const BOTH = ['carm', 'sono', 'arthro', 'manual', 'eswt']
const SALES_ONLY = ['pt', 'etc1', 'etc2', 'etc3', 'etc4']

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => {
  stopUisOptions()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('AC-4214.2 화면 차례와 글(design.md 9-5·10-6, 시안 ⑯)', () => {
  it('AC-4214.2 AC-4214.6: 맨 위 상자(폴더 자리 설명까지)·처음 안내·첫 줄·맨 아래 줄이 글 그대로이고 [처음 값으로]는 없다', async () => {
    const { send } = await open({ codes: CODES })
    expect(text($('h1'))).toBe('ERP 마감일지 채우기 · 설정')
    expect(text($('.notice.src'))).toBe(
      "의사랑 통계 엑셀에서 읽어요. 이 PC의 ERP 도우미는 ERP마감 폴더에 저장한 의사랑 통계 엑셀을 읽어 ERP 칸을 채워요. ERP마감 폴더는 보통 바탕화면에 있고, 바탕화면이 OneDrive와 이어진 PC에서는 사용자 폴더에 있어요(설치할 때 알려 준 자리 · ERP 화면 안내의 '저장할 곳').",
    )
    expect(text($('.notice.src b'))).toBe('의사랑 통계 엑셀에서 읽어요.')
    expect(text($('.notice.first'))).toBe(
      '처음 한 번 ERP 항목마다 의사랑 처방 코드를 고르고 [저장]을 눌러 주세요. 처방 코드는 의원마다 달라 처음에는 고른 코드가 없어요.',
    )
    expect(text($('.lead-p'))).toBe(
      'ERP 칸마다 셀 의사랑 처방 코드를 고르세요. 건수와 매출은 따로 골라요. 여러 개를 고를 수 있어요. 코드를 고르지 않은 칸은 건드리지 않아요.',
    )
    expect(text($('.foot'))).toBe(
      '환자 이름 · 차트번호 · 주민번호는 이 PC의 도우미 밖으로 나가지 않아요. ERP 화면에는 숫자만 넣고, 저장은 ERP에서 직접 눌러요.',
    )
    expect($('#optReset').hidden).toBe(true)
    expect($('#optAsk').hidden).toBe(true)
    expect(text($('#optSave'))).toBe('저장')
    expect(status()).toBe('아직 한 번도 저장하지 않았어요.')
    // 여는 것만으로는 도우미를 부르지 않는다
    expect(send).not.toHaveBeenCalled()
  })

  it('AC-4214.2: 맨 위 상자 · 처음 안내 · 첫 줄 · 코드 목록 줄 · 묶음 다섯 · 엑셀 표 · 맨 아래 줄 차례다', async () => {
    await open({ codes: CODES })
    const main = $('#optMain')
    expect([...main.children].map((c) => c.className)).toEqual([
      'notice src',
      'notice first',
      'lead-p',
      'notice codes',
      'osec',
      'osec',
      'osec',
      'osec',
      'osec',
      'osec',
      'foot',
    ])
    expect($$('.osec > h2').map(text)).toEqual(['치료별 건수 · 매출', '진료 · 치료현황만', '운영 지표', '환자현황', '예약', '매일 저장할 엑셀 6개'])
  })

  it('AC-4214.2: 줄은 9-5 차례(건수와 매출 · 매출만 · 건수만)이고 줄마다 건수·매출 이름표를 따로 둔다', async () => {
    await open({ codes: CODES })
    expect($$('[data-row]').map((r) => r.dataset.row)).toEqual(ROW_ORDER)
    for (const key of ROW_ORDER) {
      const labels = $$('.kline', row(key)).map((k) => [k.dataset.kind, text(k.querySelector('.sub'))])
      if (BOTH.includes(key)) expect(labels, key).toEqual([['counts', '건수로 셀 코드'], ['sales', '매출로 셀 코드']])
      else if (SALES_ONLY.includes(key)) expect(labels, key).toEqual([['sales', '매출로 셀 코드']])
      else expect(labels, key).toEqual([['counts', '건수로 셀 코드']])
    }
    expect(text($('.oname b', row('carm')))).toBe('씨암')
    expect(text($('.oname small', row('carm')))).toBe('업무일지 1 씨암 · 업무일지 2 씨암 매출')
    expect(text($('.oname b', row('eswtStd')))).toBe('ESWT Standard')
    expect(text($('.oname b', row('ptVisit')))).toBe('물리치료내원')
    expect(text($('.oname small', row('ptVisit')))).toBe('업무일지 1 환자현황 물리치료내원 · 재진')
  })

  it('AC-4214.2: 묶음 설명이 시안 글 그대로다', async () => {
    await open({ codes: CODES })
    expect($$('.osec > p').slice(0, 4).map(text)).toEqual([
      '건수는 고른 코드의 총투여량을 더해 업무일지 1 진료 · 치료현황에, 매출은 고른 코드의 총액을 더해 업무일지 2 치료별 매출에 채워요. 총투여량은 환자 수가 아니라 처방한 양이라, 건수에는 한 번에 1씩 나가는 코드만 고르세요.',
      '고른 코드의 총투여량을 더해 업무일지 1 진료 · 치료현황에 채워요.',
      '고른 코드의 총투여량을 더해 채워요. 주사1회환자 · 신환주사환자 · 신환주사건수는 의사랑 합계로 셀 수 없어 직접 넣어요.',
      '고른 코드의 총투여량을 물리치료내원으로 채우고, 일일수입통계 재진수에서 빼서 재진을 채워요.',
    ])
  })

  it('AC-4214.2: 씨암 · SONO 줄 아래에 시술 코드 주의 한 줄(조사는 이름 받침으로), 기타 줄에는 ERP 줄 이름 칸', async () => {
    await open({ codes: CODES })
    expect(text($('.hint', row('carm')))).toBe(
      '시술 코드(예: la358)를 매출에 고르면 씨암을 쓰지 않은 진료의 그 시술 금액도 그날 것이 모두 들어가요.',
    )
    expect(text($('.hint', row('sono')))).toBe(
      '시술 코드(예: la358)를 매출에 고르면 SONO를 쓰지 않은 진료의 그 시술 금액도 그날 것이 모두 들어가요.',
    )
    expect($$('.hint', row('arthro'))).toHaveLength(0)
    for (const key of ['etc1', 'etc2', 'etc3', 'etc4']) {
      const input = $<HTMLInputElement>(`[data-etc="${key}"]`)
      expect(text(input.closest('label')?.querySelector('span'))).toBe('ERP 줄 이름')
      expect(input.placeholder).toBe('업무일지 2 줄 이름과 똑같이')
      expect(input.maxLength).toBe(20)
      expect(input.value).toBe('')
    }
    expect($$('[data-etc]')).toHaveLength(4)
  })

  it('AC-4214.2: 고른 코드가 없으면 줄마다 고른 코드 없음 글이고 찾기 칸은 열려 있다', async () => {
    await open({ codes: CODES })
    for (const k of $$('.kline')) {
      expect(text(k.querySelector('.none'))).toBe('고른 코드 없음 · 이 칸은 채우지 않아요')
      const input = $<HTMLInputElement>('input[data-find]', k)
      expect(input.disabled).toBe(false)
      expect(input.placeholder).toBe('코드나 이름으로 찾기')
    }
    expect(findOf('sono', 'counts').getAttribute('aria-label')).toBe('SONO 건수로 셀 코드 찾기')
    expect(findOf('sono', 'sales').getAttribute('aria-label')).toBe('SONO 매출로 셀 코드 찾기')
  })
})

describe('AC-4214.5 예약 묶음은 안내 한 줄만', () => {
  it("AC-4214.5: 예약 묶음에 '예약 합계를 넣을 줄'·고르기가 없고 design.md 10-6 안내 한 줄만 있다", async () => {
    await open({ codes: CODES })
    const sec = $$('.osec').find((s) => text(s.querySelector('h2')) === '예약')
    if (!sec) throw new Error('예약 묶음 없음')
    expect([...sec.children].map((c) => c.tagName)).toEqual(['H2', 'P'])
    expect(text(sec.querySelector('p'))).toBe(
      '의사랑 예약에는 종류가 없어 실예약환자수만 채워요. 종류별 줄과 변경 · 취소는 직접 넣어 주세요. 예약건수 · 내원 수는 채운 뒤 안내에 보여요.',
    )
    expect(document.body.textContent).not.toContain('예약 합계를 넣을 줄')
    expect($$('select')).toHaveLength(0)
    expect($$('[data-rsv]')).toHaveLength(0)
  })
})

describe("AC-4214.2 '매일 저장할 엑셀 6개' 표(design.md 10-6 ★ '꼭' 열)", () => {
  it("AC-4214.2: 표는 6줄이고 '꼭' 열은 1 · 2 · 4 · 6번 '꼭', 3 · 5번 '있으면 좋음'이다", async () => {
    await open({ codes: CODES })
    const sec = $$('.osec').find((s) => text(s.querySelector('h2')) === '매일 저장할 엑셀 6개')
    if (!sec) throw new Error('엑셀 표 묶음 없음')
    expect(text(sec.querySelector(':scope > p'))).toBe(
      '마감할 때마다 의사랑 통계(FStat)에서 아래 6개를 엑셀로 저장해 ERP마감 폴더에 두세요.',
    )
    expect($$('.rtable th', sec).map(text)).toEqual(['', '의사랑 통계 메뉴', '표', '이름 예', '채우는 칸', '꼭'])
    const lines = $$('.rtable tbody tr', sec).map((tr) => [...tr.children].map(cellText))
    expect(lines).toEqual([
      ['1', '수입통계 › 일일수입통계', '표 하나', '통계-일일수입통계.xls', '외래 수입 6칸 · 재진', '꼭'],
      ['2', '진료통계 › 기간별처방통계', '위쪽 표', '통계-기간별처방통계.xls', '치료별 건수 · 치료별 매출 · 물리치료내원', '꼭'],
      ['3', '인원통계 › 내원일별환자현황', '위쪽 표', '통계-내원일별환자현황.xls', '신환 · 환자 합계 · 진찰료 산정안함', '있으면 좋음'],
      [
        '4',
        '인원통계 › 내원일별환자현황',
        '아래쪽 표 그날 줄을 누른 뒤 환자 정보 있음',
        '통계-내원일별환자현황-환자별.xls',
        '연령별 신환 · 재진',
        '꼭',
      ],
      ['5', '인원통계 › 예약환자통계', '위쪽 표', '통계-예약환자통계.xls', '예약 총갯수 · 내원', '있으면 좋음'],
      ['6', '인원통계 › 예약환자통계', '아래쪽 표 그날 줄을 누른 뒤 환자 정보 있음', '통계-예약환자통계-환자별.xls', '실예약환자수', '꼭'],
    ])
    // 보고서 이름은 굵게, 환자별 표 두 줄에만 '환자 정보 있음'
    expect($$('.rtable tbody td b', sec).map(text)).toEqual([
      '일일수입통계',
      '기간별처방통계',
      '내원일별환자현황',
      '내원일별환자현황',
      '예약환자통계',
      '예약환자통계',
    ])
    expect($$('.rtable .pi', sec).map(text)).toEqual(['환자 정보 있음', '환자 정보 있음'])
  })

  it("AC-4214.2 AC-4214.6: 표 밑 줄은 없고(표 바로 뒤가 저장법) · 저장법 세 줄(셋째 줄은 실제 지우기 규칙) · '-환자별' 안내는 저장법 둘째 줄 한 번뿐 · 환자별 표 안내", async () => {
    await open({ codes: CODES })
    const sec = $$('.osec').find((s) => text(s.querySelector('h2')) === '매일 저장할 엑셀 6개')
    if (!sec) throw new Error('엑셀 표 묶음 없음')
    expect($$('.rtable + p', sec)).toHaveLength(0)
    expect($('.rtable', sec).nextElementSibling?.className).toBe('howto')
    expect($$('.hint', sec).filter((el) => el.tagName === 'P')).toHaveLength(0)
    expect($$('.howto p', sec).map(text)).toEqual([
      "조회일은 마감 일자 하루로, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추를 눌러 저장해요.",
      "이름은 바꿔도 돼요(도우미가 표 머리글로 어느 보고서인지 알아봐요). 아래쪽 표는 위쪽 표와 이름이 겹치지 않게 끝에 '-환자별'을 붙여 주세요.",
      '이 폴더에는 마감 엑셀만 두세요. 읽은 엑셀은 지워요. 환자 정보가 든 4 · 6번은 날짜가 달라도 늘 바로 지우고, 의사랑 통계 엑셀이 아닌 엑셀도 지워요. 날짜가 다르거나 같은 보고서가 여럿인 합계 엑셀은 그대로 둬요.',
    ])
    expect($$('p', sec).filter((el) => text(el).includes('-환자별')).map(text)).toEqual([$$('.howto p', sec).map(text)[1]])
    expect(text($('.priv', sec))).toBe(
      '4 · 6번 환자별 표에는 환자 이름 · 주민번호가 들어 있어요. ERP 도우미가 이 PC 안에서만 읽고 바로 지워요. 주민번호로는 나이만 셈하고, ERP에는 숫자만 넣어요.',
    )
    expect(text($('.priv b', sec))).toBe('4 · 6번 환자별 표에는 환자 이름 · 주민번호가 들어 있어요.')
  })
})

describe('AC-4214.2 코드 목록 줄(시안 ⑮ ⑯)', () => {
  it('AC-4214.2 AC-4214.6: 코드 목록이 없으면 주황 상자 · 3단계(폴더는 ERP마감 폴더) · [코드 목록 읽기]이고 찾기 칸은 막혀 있다', async () => {
    await open()
    const box = $('.notice.nofile')
    expect(text($('b', box))).toBe('처방 코드 목록이 아직 없어요.')
    expect($$('ol li', box).map(text)).toEqual([
      '의사랑 통계 › 진료통계 › 기간별처방통계를 열어 주세요.',
      "조회일을 최근 석 달로, 외/입 구분을 '전체'로 두고 [검색]을 눌러 주세요.",
      '표 오른쪽 위 초록 엑셀 단추로 ERP마감 폴더에 저장해 주세요.',
    ])
    expect(text($(':scope > p', box))).toBe('그다음 [코드 목록 읽기]를 눌러 주세요.')
    const button = $<HTMLButtonElement>('[data-reread]', box)
    expect(text(button)).toBe('코드 목록 읽기')
    expect(button.className).toBe('btn btn-1')
    expect($$('.notice.codes')).toHaveLength(0)
    for (const input of $$<HTMLInputElement>('input[data-find]')) {
      expect(input.disabled).toBe(true)
      expect(input.placeholder).toBe('코드 목록이 없어 찾을 수 없어요')
    }
  })

  it('AC-4214.2: 코드 목록이 있으면 읽은 기간 · 코드 수 줄과 [코드 목록 다시 읽기]다', async () => {
    await open({ codes: CODES })
    const box = $('.notice.codes')
    expect($$('p', box).map(text)).toEqual([
      '의사랑 기간별처방통계(2026-08-24~2026-11-23)에서 처방 코드 24개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.',
      '새 코드가 생기면 기간별처방통계를 다시 저장하고 [코드 목록 다시 읽기]를 눌러 주세요.',
    ])
    const button = $<HTMLButtonElement>('[data-reread]', box)
    expect(text(button)).toBe('코드 목록 다시 읽기')
    expect(button.className).toBe('btn btn-2')
    expect($$('.notice.nofile')).toHaveLength(0)
  })

  it('AC-4214.2: 기억해 둔 목록 모양이 틀리면 목록이 없는 것으로 본다', async () => {
    await open({ codes: { v: 2, codes: [] } })
    expect($$('.notice.nofile')).toHaveLength(1)
  })
})

describe('AC-4214.2 코드 찾기(시안 ⑰)', () => {
  it("AC-4214.2: 'so'를 넣으면 코드나 처방명칭에 든 줄이 목록 차례로 나오고 건수 꼬리는 '총투여량 N', 소수는 주황 + 안내 한 줄", async () => {
    await open({ codes: CODES })
    type(findOf('sono', 'counts'), 'so')
    const dd = ddOf('sono', 'counts')
    expect(dd.hidden).toBe(false)
    expect(results('sono', 'counts')).toEqual([
      ['sono5', '초음파 유도 주사', '총투여량 402', false],
      ['SOLU', '솔루메드롤 주사', '총투여량 31.5', false],
      [LONG, '긴 코드 예시', '총투여량 3', true],
      ['SONO-X', '', '총투여량 2', false],
      ['sono0', '초음파 표시(0원)', '총투여량 1,620', false],
    ])
    expect(text($('.cnt', dd))).toBe('주황 숫자는 총투여량에 소수가 있는 코드예요. 건수로는 맞지 않을 수 있어요.')
    expect(dd.firstElementChild?.classList.contains('cnt')).toBe(true)
    const frac = $$('em.frac', dd).map((em) => text(em.closest('button')?.querySelector('b')))
    expect(frac).toEqual(['SOLU'])
    // 대소문자 무시
    type(findOf('sono', 'counts'), 'SO')
    expect(results('sono', 'counts').map((r) => r[0])).toEqual(['sono5', 'SOLU', LONG, 'SONO-X', 'sono0'])
    // 처방명칭으로도 찾는다
    type(findOf('sono', 'counts'), '주사')
    expect(results('sono', 'counts').map((r) => r[0])).toEqual(['sono5', 'AA222', 'KK090', 'LIDO', 'DEXA', 'SOLU'])
    // 다른 찾기 목록은 닫혀 있다
    expect(ddOf('sono', 'sales').hidden).toBe(true)
  })

  it("AC-4214.2: 매출 찾기 꼬리는 '총액 N원'이고 소수 안내는 없다", async () => {
    await open({ codes: CODES })
    type(findOf('sono', 'sales'), 'so')
    expect(results('sono', 'sales')).toEqual([
      ['sono5', '초음파 유도 주사', '총액 24,120,000원', false],
      ['SOLU', '솔루메드롤 주사', '총액 94,500원', false],
      [LONG, '긴 코드 예시', '총액 300원', true],
      ['SONO-X', '', '총액 100원', false],
      ['sono0', '초음파 표시(0원)', '총액 0원', false],
    ])
    expect($$('.cnt', ddOf('sono', 'sales'))).toHaveLength(0)
    expect($$('em.frac', ddOf('sono', 'sales'))).toHaveLength(0)
  })

  it('AC-4214.2: 소수 총투여량이 없는 찾기에는 안내 줄이 없다', async () => {
    await open({ codes: CODES })
    type(findOf('manual', 'counts'), 'KR')
    expect(results('manual', 'counts')).toEqual([['KR006', '도수치료', '총투여량 388', false]])
    expect($$('.cnt', ddOf('manual', 'counts'))).toHaveLength(0)
  })

  it('AC-4214.2: 찾기는 30개까지 보인다', async () => {
    const many: UisCodes = {
      ...CODES,
      codes: Array.from({ length: 40 }, (_, i) => ({ code: `Z${String(i).padStart(2, '0')}`, name: null, qty: 1, amount: 40 - i })),
    }
    await open({ codes: many })
    type(findOf('ct', 'counts'), 'z')
    expect(results('ct', 'counts')).toHaveLength(30)
    expect(results('ct', 'counts')[0][0]).toBe('Z00')
    expect(results('ct', 'counts')[29][0]).toBe('Z29')
  })

  it("AC-4214.2: 맞는 코드가 없으면 '맞는 코드가 없어요.', 빈 글자면 목록을 닫는다", async () => {
    await open({ codes: CODES })
    type(findOf('ct', 'counts'), '없는코드')
    expect(text($('.empty', ddOf('ct', 'counts')))).toBe('맞는 코드가 없어요.')
    expect($$('button', ddOf('ct', 'counts'))).toHaveLength(0)
    type(findOf('ct', 'counts'), '  ')
    expect(ddOf('ct', 'counts').hidden).toBe(true)
  })

  it('AC-4214.2: 코드를 누르면 그 이름표 줄에만 조각이 생기고 목록이 닫히며, 다시 찾으면 골랐어요로 막힌다', async () => {
    await open({ codes: CODES })
    pick('sono', 'counts', 'so', 'sono5')
    expect(chipCodes('sono', 'counts')).toEqual(['sono5'])
    expect(chipText('sono', 'counts', 'sono5')).toBe('sono5 초음파 유도 주사 ×')
    expect(chipCodes('sono', 'sales')).toEqual([])
    expect(ddOf('sono', 'counts').hidden).toBe(true)
    expect(findOf('sono', 'counts').value).toBe('')
    expect(document.activeElement).toBe(findOf('sono', 'counts'))
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
    expect($('#optStatus').classList.contains('dirty')).toBe(true)
    type(findOf('sono', 'counts'), 'so')
    expect(results('sono', 'counts')[0]).toEqual(['sono5', '초음파 유도 주사', '골랐어요', true])
    // 매출 줄에서는 따로 고른다
    pick('sono', 'sales', 'so', 'sono5')
    expect(chipCodes('sono', 'sales')).toEqual(['sono5'])
    expect(chipText('sono', 'sales', 'sono5')).toBe('sono5 초음파 유도 주사 ×')
  })

  it('AC-4214.2: 21자 넘는 코드는 목록에 보이되 눌러도 고르지 않는다', async () => {
    await open({ codes: CODES })
    type(findOf('sono', 'counts'), 'long')
    const button = $<HTMLButtonElement>(`[data-add="${LONG}"]`, ddOf('sono', 'counts'))
    expect(button.disabled).toBe(true)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(chipCodes('sono', 'counts')).toEqual([])
    expect(status()).toBe('아직 한 번도 저장하지 않았어요.')
  })

  it("AC-4214.2: 가운데 빈칸이 든 코드도 고를 수 있고, 조각 [×]로 뺀다", async () => {
    await open({ codes: CODES })
    pick('etc1', 'sales', 'cryo', 'CRYO 대관절')
    pick('etc1', 'sales', 'cryo', 'CRYO 소관절')
    expect(chipCodes('etc1', 'sales')).toEqual(['CRYO 대관절', 'CRYO 소관절'])
    const del = $<HTMLButtonElement>('[data-del="CRYO 대관절"]', kline('etc1', 'sales'))
    expect(del.getAttribute('aria-label')).toBe('CRYO 대관절 빼기')
    expect(text(del)).toBe('×')
    del.click()
    expect(chipCodes('etc1', 'sales')).toEqual(['CRYO 소관절'])
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
  })

  it("AC-4214.2: 20개를 고르면 찾기 칸이 '20개까지 고를 수 있어요'로 막힌다", async () => {
    const many: UisCodes = {
      ...CODES,
      codes: Array.from({ length: 25 }, (_, i) => ({ code: `Q${String(i).padStart(2, '0')}`, name: null, qty: 1, amount: 25 - i })),
    }
    const counts = Array.from({ length: 19 }, (_, i) => `Q${String(i).padStart(2, '0')}`)
    await open({ codes: many, settings: { v: 1, counts: { ct: counts }, sales: {}, etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' } } })
    expect(findOf('ct', 'counts').disabled).toBe(false)
    pick('ct', 'counts', 'q', 'Q19')
    expect(chipCodes('ct', 'counts')).toHaveLength(20)
    expect(findOf('ct', 'counts').disabled).toBe(true)
    expect(findOf('ct', 'counts').placeholder).toBe('20개까지 고를 수 있어요')
  })

  it("AC-4214.2: 저장한 코드가 목록에 없으면 조각 꼬리가 '(처방통계에 없음)', 목록에 있으면 처방명칭(대소문자 무시)", async () => {
    await open({ codes: CODES, settings: { ...SAVED, counts: { ...SAVED.counts, ct: ['MM010 100/100'] } } })
    expect(chipText('manual', 'counts', 'KR006')).toBe('KR006 도수치료 ×')
    expect(chipText('manual', 'counts', 'KR006-1')).toBe('KR006-1 (처방통계에 없음) ×')
    expect($('.cn.gone', kline('manual', 'counts')).textContent).toBe('(처방통계에 없음)')
    expect(chipText('ct', 'counts', 'MM010 100/100')).toBe('MM010 100/100 표층열치료(100/100) ×')
    expect(chipText('carm', 'sales', 'la358')).toBe('la358 신경근차단술 ×')
  })

  it('AC-4214.2: 코드 목록이 없으면 조각은 코드만 보인다', async () => {
    await open({ settings: SAVED })
    expect(chipText('manual', 'counts', 'KR006-1')).toBe('KR006-1 ×')
    expect(chipText('manual', 'counts', 'KR006')).toBe('KR006 ×')
  })

  it('AC-4214.2: 찾기 밖을 누르거나 Esc를 누르면 목록이 닫힌다', async () => {
    await open({ codes: CODES })
    type(findOf('sono', 'counts'), 'so')
    expect(ddOf('sono', 'counts').hidden).toBe(false)
    $('h1').click()
    expect(ddOf('sono', 'counts').hidden).toBe(true)
    type(findOf('sono', 'counts'), 'so')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(ddOf('sono', 'counts').hidden).toBe(true)
  })

  it('AC-4214.2: 도우미가 준 코드 · 처방명칭은 글자로만 그린다', async () => {
    const odd: UisCodes = { ...CODES, codes: rows([['<b>X1</b>', '<img src=x onerror=alert(1)>', 1, 10]]) }
    await open({ codes: odd })
    type(findOf('ct', 'counts'), 'x1')
    const button = $('button', ddOf('ct', 'counts'))
    expect(text(button.querySelector('b'))).toBe('<b>X1</b>')
    expect(text(button.querySelector('span'))).toBe('<img src=x onerror=alert(1)>')
    expect($$('img', ddOf('ct', 'counts'))).toHaveLength(0)
  })
})

describe('AC-4214.3 AC-4206.5 [코드 목록 읽기](design.md 10-6 다섯 결과 글)', () => {
  const NEW: UisCodes = { v: 1, from: '2026-09-01', to: '2026-11-23', codes: rows(ROWS.slice(0, 5)) }

  it('AC-4214.3 AC-4206.5: ok면 closing.uisCodes를 한 번 부르고 목록을 erpClosingUisCodes에 곧바로 쓰고 ok 글을 보인다([저장]과 따로)', async () => {
    const { send, local, data } = await open({ reply: answer({ state: 'ok', from: NEW.from, to: NEW.to, value: null, codes: NEW.codes }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('closing.uisCodes', {})
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0] as object)).toEqual([UIS_CODES_KEY])
    expect(data[UIS_CODES_KEY]).toEqual(NEW)
    expect(data[UIS_SETTINGS_KEY]).toBeUndefined()
    expect(text($('.notice.codes p'))).toBe(
      '의사랑 기간별처방통계(2026-09-01~2026-11-23)에서 처방 코드 5개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.',
    )
    expect($$('.notice.nofile')).toHaveLength(0)
    expect($$('.said')).toHaveLength(0)
    // 목록을 읽은 것은 저장할 바꿈이 아니다
    expect(status()).toBe('아직 한 번도 저장하지 않았어요.')
    expect(leaveBlocked()).toBe(false)
    // 찾기 칸이 열린다
    expect(findOf('sono', 'counts').disabled).toBe(false)
    type(findOf('sono', 'counts'), 'so')
    expect(results('sono', 'counts').map((r) => r[0])).toEqual(['sono5'])
  })

  it('AC-4214.3: [코드 목록 다시 읽기]도 같고, 새 목록이 오면 조각 꼬리도 새 목록으로 바뀐다', async () => {
    const { data } = await open({
      codes: { ...CODES, codes: rows(ROWS.filter(([c]) => c !== 'KR006')) },
      settings: SAVED,
      reply: answer({ state: 'ok', from: NEW.from, to: NEW.to, value: null, codes: NEW.codes }),
    })
    expect(chipText('manual', 'counts', 'KR006')).toBe('KR006 (처방통계에 없음) ×')
    expect(text($('[data-reread]'))).toBe('코드 목록 다시 읽기')
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(data[UIS_CODES_KEY]).toEqual(NEW)
    expect(chipText('manual', 'counts', 'KR006')).toBe('KR006 도수치료 ×')
    // 고른 코드는 그대로이고 저장 상태도 그대로
    expect(data[UIS_SETTINGS_KEY]).toEqual(SAVED)
    expect(status()).toBe('저장했어요.')
  })

  it('AC-4214.3 AC-4206.5: ok 답의 기간이 null이어도 글자로 바꿔 쓰고, 기간 없이 글을 보인다', async () => {
    const { data } = await open({ reply: answer({ state: 'ok', from: null, to: null, value: null, codes: NEW.codes }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(data[UIS_CODES_KEY]).toEqual({ ...NEW, from: '', to: '' })
    expect(text($('.notice.codes p'))).toBe('의사랑 기간별처방통계에서 처방 코드 5개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.')
  })

  it('AC-4214.3 AC-4206.5: ok 답의 코드는 2,000개까지, 모양이 틀린 줄은 빼고 쓴다', async () => {
    const many = Array.from({ length: 2005 }, (_, i) => ({ code: `C${i}`, name: null, qty: 1, amount: 3000 - i }))
    const { data } = await open({ reply: answer({ state: 'ok', from: '2026-09-01', to: '2026-11-23', value: null, codes: [{ code: 1 }, ...many] }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect((data[UIS_CODES_KEY] as UisCodes).codes).toEqual(many.slice(0, 2000))
    expect(text($('.notice.codes p'))).toContain('처방 코드 2,000개를 읽었어요.')
  })

  it('AC-4214.3 AC-4214.6: missing이면 목록은 그대로이고 ERP마감 폴더에 엑셀이 없다는 글 + 3단계다', async () => {
    const { local, data } = await open({ codes: CODES, reply: answer({ state: 'missing', from: null, to: null, value: null, codes: [] }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(local.set).not.toHaveBeenCalled()
    expect(data[UIS_CODES_KEY]).toEqual(CODES)
    const box = $('.notice.codes')
    expect(text($('.said', box))).toBe('ERP마감 폴더에 기간별처방통계 엑셀이 없어요.')
    expect($$('ol li', box).map(text)).toEqual([
      '의사랑 통계 › 진료통계 › 기간별처방통계를 열어 주세요.',
      "조회일을 최근 석 달로, 외/입 구분을 '전체'로 두고 [검색]을 눌러 주세요.",
      '표 오른쪽 위 초록 엑셀 단추로 ERP마감 폴더에 저장해 주세요.',
    ])
    // 앞서 읽은 목록 줄은 그대로 보인다
    expect(text($('p', box))).toBe(
      '의사랑 기간별처방통계(2026-08-24~2026-11-23)에서 처방 코드 24개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.',
    )
  })

  it('AC-4214.3 AC-4214.6: 목록이 없을 때 missing이면 주황 상자에 그 글이 더해진다(3단계는 한 벌)', async () => {
    await open({ reply: answer({ state: 'missing', from: null, to: null, value: null, codes: [] }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    const box = $('.notice.nofile')
    expect(text($('b', box))).toBe('처방 코드 목록이 아직 없어요.')
    expect(text($('.said', box))).toBe('ERP마감 폴더에 기간별처방통계 엑셀이 없어요.')
    expect($$('ol', box)).toHaveLength(1)
  })

  it.each([
    ['notAll', { state: 'notAll', from: '2026-09-01', to: '2026-11-23', value: '외래' }, "기간별처방통계 엑셀의 외/입 구분이 '외래'예요. '전체'로 다시 저장해 주세요."],
    ['twice', { state: 'twice', from: null, to: null, value: null }, '기간별처방통계 엑셀이 여러 개 있어요. 하나만 남겨 주세요.'],
    ['open', { state: 'open', from: null, to: null, value: null }, '기간별처방통계 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.'],
  ])('AC-4214.3 AC-4214.6 AC-4206.5: %s면 목록은 그대로(답에 코드가 있어도 받지 않음)이고 design.md 10-6 글이다(twice는 수 없이)', async (_, got, line) => {
    const { local, data } = await open({ codes: CODES, reply: answer({ ...got, codes: NEW.codes }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(local.set).not.toHaveBeenCalled()
    expect(data[UIS_CODES_KEY]).toEqual(CODES)
    expect(text($('.notice.codes .said'))).toBe(line)
    expect($$('.notice.codes ol')).toHaveLength(0)
    expect(text($('.notice.codes p'))).toContain('처방 코드 24개를 읽었어요.')
  })

  it.each([
    [
      'E-UIS-FOLDER',
      { type: 'error', code: 'E-UIS-FOLDER' },
      'ERP마감 폴더를 만들거나 열지 못했어요. ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요. 계속되면 이 번호를 알려 주세요. (E-UIS-FOLDER)',
    ],
    [
      '표에 없는 번호',
      { type: 'error', code: 'E-UIS-SOMETHING' },
      '의사랑 엑셀을 읽지 못했어요. 잠시 뒤 다시 해 주세요. 계속되면 이 번호를 알려 주세요. (E-UIS-SOMETHING)',
    ],
    [
      '옛 도우미',
      { type: 'error', code: 'E-HELPER-UNKNOWN-COMMAND' },
      'ERP 도우미가 예전 판이에요. 새 판을 설치해 주세요. 확장과 ERP 도우미는 꼭 같이 바꿔요. (E-HELPER-UNKNOWN-COMMAND)',
    ],
    [
      '번호 꼴이 아닌 오류',
      { type: 'error', code: 'oops <b>' },
      '도우미 답의 모양이 맞지 않아 쓰지 않았어요. 확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요. (E-BRIDGE-BAD-REPLY)',
    ],
    [
      '답 없음',
      null,
      'ERP 도우미가 이 PC에 없어요. ERP 도우미를 설치해 주세요. 받은 zip을 풀고 install.cmd를 두 번 누르면 돼요. (E-HELPER-MISSING)',
    ],
    [
      '모르는 state',
      answer({ state: 'maybe', from: null, to: null, value: null, codes: [] }),
      '도우미 답의 모양이 맞지 않아 쓰지 않았어요. 확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요. (E-BRIDGE-BAD-REPLY)',
    ],
    [
      '코드가 목록이 아님',
      answer({ state: 'ok', from: '2026-09-01', to: '2026-11-23', value: null, codes: 'x' }),
      '도우미 답의 모양이 맞지 않아 쓰지 않았어요. 확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요. (E-BRIDGE-BAD-REPLY)',
    ],
    [
      '기간이 글자가 아님',
      answer({ state: 'ok', from: 20260901, to: '2026-11-23', value: null, codes: [] }),
      '도우미 답의 모양이 맞지 않아 쓰지 않았어요. 확장과 ERP 도우미를 같은 새 판으로 바꿔 주세요. 계속되면 이 번호를 알려 주세요. (E-BRIDGE-BAD-REPLY)',
    ],
  ])('AC-4214.3 AC-4206.5: 오류(%s)면 explainFor(의사랑) 글이고 목록은 그대로다', async (_, reply, line) => {
    const { local, data } = await open({ codes: CODES, reply })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(local.set).not.toHaveBeenCalled()
    expect(data[UIS_CODES_KEY]).toEqual(CODES)
    expect(text($('.notice.codes .said.err'))).toBe(line)
    expect(document.body.textContent).not.toContain('oops')
  })

  it('AC-4214.3: send가 던지면(서비스 워커와 끊김) E-HELPER-MISSING 글이다', async () => {
    await open({
      codes: CODES,
      reply: () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')),
    })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect(text($('.said.err'))).toContain('(E-HELPER-MISSING)')
    expect(document.body.textContent).not.toContain('Receiving end')
  })

  it('AC-4214.3: 읽는 동안 단추가 막혀 두 번 부르지 않고, 다시 누르면 앞 결과 글은 사라진다', async () => {
    let settle: (v: unknown) => void = () => {}
    const replies = [
      answer({ state: 'twice', from: null, to: null, value: null, codes: [] }),
      () => new Promise((ok) => (settle = ok)),
    ]
    let n = 0
    const { send } = await open({ codes: CODES, reply: () => Promise.resolve(typeof replies[n] === 'function' ? (replies[n++] as () => Promise<unknown>)() : replies[n++]) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect($$('.said')).toHaveLength(1)
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    expect($<HTMLButtonElement>('[data-reread]').disabled).toBe(true)
    expect($$('.said')).toHaveLength(0)
    $<HTMLButtonElement>('[data-reread]').click()
    $<HTMLButtonElement>('[data-reread]').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(send).toHaveBeenCalledTimes(2)
    settle(answer({ state: 'open', from: null, to: null, value: null, codes: [] }))
    await flush()
    expect($<HTMLButtonElement>('[data-reread]').disabled).toBe(false)
    expect(text($('.said'))).toBe('기간별처방통계 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.')
  })
})

describe('AC-4214.4 [저장]·나가기 확인', () => {
  it("AC-4214.4: [저장]은 erpClosingUis 한 열쇠에 9-2 모양으로 쓰고 '저장했어요.'가 되며 비트 erpClosing은 읽지도 쓰지도 않는다", async () => {
    const { local, data } = await open({ codes: CODES })
    pick('sono', 'counts', 'so', 'sono5')
    pick('sono', 'counts', 'so', 'sono0')
    pick('sono', 'sales', 'so', 'sono5')
    pick('ptVisit', 'counts', 'AA222', 'AA222')
    pick('etc1', 'sales', 'cryo', 'CRYO 대관절')
    type($<HTMLInputElement>('[data-etc="etc1"]'), '  크라이오  ')
    expect(leaveBlocked()).toBe(true)
    $('#optSave').click()
    await flush()
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0] as object)).toEqual([UIS_SETTINGS_KEY])
    expect(data[UIS_SETTINGS_KEY]).toEqual({
      v: 1,
      counts: { sono: ['sono5', 'sono0'], ptVisit: ['AA222'] },
      sales: { sono: ['sono5'], etc1: ['CRYO 대관절'] },
      etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
    })
    expect(local.get.mock.calls.map((c) => c[0])).not.toContain(SETTINGS_KEY)
    expect(data[SETTINGS_KEY]).toBeUndefined()
    expect(status()).toBe('저장했어요.')
    expect($('#optStatus').classList.contains('saved')).toBe(true)
    expect($$('.notice.first')).toHaveLength(0)
    expect(leaveBlocked()).toBe(false)
    // 화면 값도 정리한 값
    expect($<HTMLInputElement>('[data-etc="etc1"]').value).toBe('크라이오')
  })

  it('AC-4214.4: 기타 줄에 매출 코드를 골랐는데 이름이 비어도 저장은 된다(그 줄은 ERP 화면에서 noName으로 건너뜀)', async () => {
    const { data } = await open({ codes: CODES })
    pick('etc2', 'sales', 'cryo', 'CRYO 소관절')
    $('#optSave').click()
    await flush()
    expect(data[UIS_SETTINGS_KEY]).toEqual({
      v: 1,
      counts: {},
      sales: { etc2: ['CRYO 소관절'] },
      etcNames: { etc1: '', etc2: '', etc3: '', etc4: '' },
    })
    expect(status()).toBe('저장했어요.')
    expect($<HTMLInputElement>('[data-etc="etc2"]').placeholder).toBe('업무일지 2 줄 이름과 똑같이')
  })

  it('AC-4214.4: 저장한 설정이 있으면 그 값을 보이고 처음 안내 없이 저장했어요다(시안 ⑱)', async () => {
    await open({ codes: CODES, settings: SAVED })
    expect(chipCodes('carm', 'counts')).toEqual(['carm'])
    expect(chipCodes('carm', 'sales')).toEqual(['la358'])
    expect(chipCodes('sono', 'counts')).toEqual(['sono0', 'sono5'])
    expect(chipCodes('pt', 'sales')).toEqual(['MM010', 'MM080'])
    expect(chipCodes('etc1', 'sales')).toEqual(['CRYO 대관절', 'CRYO 소관절'])
    expect($<HTMLInputElement>('[data-etc="etc1"]').value).toBe('크라이오')
    expect(text($('.none', kline('arthro', 'counts')))).toBe('고른 코드 없음 · 이 칸은 채우지 않아요')
    expect($$('.notice.first')).toHaveLength(0)
    expect(status()).toBe('저장했어요.')
    expect(leaveBlocked()).toBe(false)
  })

  it('AC-4214.4: 저장값 모양이 틀리면 처음 값으로 보이고 저장한 적 없는 상태다', async () => {
    await open({ codes: CODES, settings: { v: 9 } })
    expect($$('.chip')).toHaveLength(0)
    expect($$('.notice.first')).toHaveLength(1)
    expect(status()).toBe('아직 한 번도 저장하지 않았어요.')
  })

  it('AC-4214.4: 기타 이름을 바꾸면 저장하지 않음 상태가 되고 쓰던 칸이 그대로다', async () => {
    await open({ codes: CODES, settings: SAVED })
    const input = $<HTMLInputElement>('[data-etc="etc2"]')
    input.focus()
    type(input, '핫팩')
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
    expect(document.activeElement).toBe(input)
    expect(leaveBlocked()).toBe(true)
  })

  it('AC-4214.4: chrome.storage가 쓰지 못하면 저장 실패 글이고 바꾼 것·나가기 확인이 그대로다', async () => {
    const { local, data } = await open({ codes: CODES, settings: SAVED })
    type($<HTMLInputElement>('[data-etc="etc2"]'), '핫팩')
    local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES quota exceeded'))
    $('#optSave').click()
    await flush()
    expect(status()).toBe('저장하지 못했어요. 이 화면을 닫지 말고 [저장]을 다시 눌러 주세요.')
    expect($('#optStatus').classList.contains('dirty')).toBe(true)
    expect(leaveBlocked()).toBe(true)
    expect(data[UIS_SETTINGS_KEY]).toEqual(SAVED)
    expect(document.body.textContent).not.toContain('QUOTA')
    $('#optSave').click()
    await flush()
    expect(status()).toBe('저장했어요.')
    expect(leaveBlocked()).toBe(false)
  })

  it('AC-4214.4: 화면을 다시 열면 앞 화면의 나가기 확인은 남지 않는다', async () => {
    await open({ codes: CODES })
    pick('ct', 'counts', 'AA', 'AA254')
    expect(leaveBlocked()).toBe(true)
    await open({ codes: CODES })
    expect(leaveBlocked()).toBe(false)
    stopUisOptions()
    expect(leaveBlocked()).toBe(false)
  })
})

describe('AC-4214.2 화면 모양(시안에만 있는 모양은 의사랑 화면이 한 벌 더한다)', () => {
  it('AC-4214.2: 시안의 코드 목록 상자 · 이름표 줄 · 엑셀 표 모양을 한 번만 더한다', async () => {
    await open({ codes: CODES })
    await startUisOptions(document, { send: fakeSend() })
    const styles = $$('style[data-uis]')
    expect(styles).toHaveLength(1)
    const css = styles[0].textContent ?? ''
    for (const sel of ['.notice.src', '.notice.codes', '.notice.nofile', '.kline', '.dd button em.frac', '.dd .cnt', '.rtable', '.howto', '.priv', '.said']) {
      expect(css, sel).toContain(sel)
    }
    expect(css).toContain('--warning-soft')
  })
})

describe("AC-4214.6 설정 화면 폴더 글은 모두 'ERP마감 폴더'(design.md 10-6 ★ 폴더 글, 고침 10)", () => {
  it("AC-4214.6: 맨 위 상자 · 3단계 · missing · 표 앞 글 어디에도 '바탕화면 ›' · '사용자 폴더 ›' 글이 없다(코드 목록 답에 폴더 자리가 없어서)", async () => {
    await open({ reply: answer({ state: 'missing', from: null, to: null, value: null, codes: [] }) })
    $<HTMLButtonElement>('[data-reread]').click()
    await flush()
    const all = text($('#optMain'))
    expect(all).toContain('ERP마감 폴더에 기간별처방통계 엑셀이 없어요.')
    expect(all).not.toMatch(/›\s*ERP마감/)
    expect(all.match(/ERP마감 폴더에 저장해 주세요\./g)).toHaveLength(1)
  })
})

describe('AC-4211.6 도우미 부르기 타입 Send는 uisTypes.ts 한 곳(design.md 8-1, 고침 12)', () => {
  const SRC = path.join(EXT, 'src')
  const sources = () => readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
  const code = (f: string) => readFileSync(path.join(SRC, f), 'utf8')

  it("AC-4211.6: 확장 소스에서 'type Send' 정의는 uisTypes.ts 한 곳뿐이고 그곳이 내보낸다", () => {
    expect(sources().filter((f) => /\btype\s+Send\b/.test(code(f)))).toEqual(['uisTypes.ts'])
    expect(code('uisTypes.ts')).toMatch(/^export type Send = \(cmd: ClosingCommand, args: Record<string, unknown>\) => Promise<unknown>$/m)
  })

  it('AC-4211.6: Send를 쓰는 소스(uisOptions.ts · options.ts · uisFlow.ts가 있으면 그것도)는 모두 uisTypes.js에서 가져온다', () => {
    const users = sources().filter((f) => f !== 'uisTypes.ts' && /\bSend\b/.test(code(f)))
    expect(users).toEqual(expect.arrayContaining(['options.ts', 'uisOptions.ts']))
    for (const f of users) {
      const from = [...code(f).matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gm)]
        .filter(([, names]) => names.split(',').some((n) => n.trim().replace(/^type\s+/, '') === 'Send'))
        .map(([, , spec]) => spec)
      expect(from, f).toEqual(['./uisTypes.js'])
    }
  })
})
