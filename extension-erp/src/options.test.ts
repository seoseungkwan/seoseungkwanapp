// @vitest-environment jsdom
// 설정 화면(TASK-5 REQ-3607)을 가짜 chrome(runtime.sendMessage·storage.local)으로 시험한다. 글은 승인된 목업
// docs/mockups/erp-closing-fill/ 그대로다. 코드·이름은 목업 예시(환자 정보 없음)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startOptions } from './options'
import { GROUP_KEYS, GROUP_NAMES, RSV_NAMES, RSV_ROWS, SETTINGS_KEY } from './types'
import type { ClosingCodes, Settings } from './types'

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 목업의 코드 목록 예시 + 이름 없는 코드로 1,284개
const SAMPLE: [string, string, number][] = [
  ['SONO1', '비급여초음파', 6820], ['CARM1', '씨암 영상 유도', 6410], ['MM010', '표층열치료', 5960],
  ['MM015', '심층열치료', 5720], ['MM011', '한냉치료', 4310], ['AA254', '재진진찰료', 4120],
  ['ESWT7', '체외충격파(2000타)', 2180], ['KK090', '관절강내주사', 1210], ['CRYO', '크라이오(냉동치료)', 940],
  ['AA222', '물리치료 내원 진찰', 540], ['도수', '도수치료 [1일당] - 의원 (관리급여)', 326],
  ['MA12', '도수치료(50분) 비급여', 286], ['ESWT12', '체외충격파(4000타)', 214], ['ESWT10', '체외충격파(3000타)', 176],
  ['.', '도수상담', 128], ['HA280', '관절조영', 84], ['ESWT17', '체외충격파(6000타)', 25], ['MA4', '도수치료(30분) 비급여', 11],
]
const CODES: ClosingCodes = {
  codes: [
    ...SAMPLE.map(([code, name, visits]) => ({ code, name, visits })),
    ...Array.from({ length: 1284 - SAMPLE.length }, (_, i) => ({ code: `Z${String(i).padStart(4, '0')}`, name: null, visits: 1 })),
  ],
  kinds: [
    { kind: '1', name: '체외충격파' },
    { kind: '2', name: '주사' },
    { kind: '3', name: '경과' },
    { kind: '14', name: '도수30분(호)' },
    { kind: '20', name: '도수30분(원)' },
    { kind: '22', name: '도수30분(현)' },
  ],
}

type Reply = unknown | (() => Promise<unknown>)

function fakeChrome(opts: { stored?: unknown; reply?: Reply } = {}) {
  const data: Record<string, unknown> = {}
  if (opts.stored !== undefined) data[SETTINGS_KEY] = JSON.parse(JSON.stringify(opts.stored))
  const local = {
    get: vi.fn(async (key: string) => (key in data ? { [key]: JSON.parse(JSON.stringify(data[key])) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, JSON.parse(JSON.stringify(items)))
    }),
  }
  const reply = 'reply' in opts ? opts.reply : { type: 'result', data: CODES }
  const sendMessage = vi.fn(async () => (typeof reply === 'function' ? (reply as () => Promise<unknown>)() : reply))
  vi.stubGlobal('chrome', { runtime: { id: 'erp-test', sendMessage }, storage: { local } })
  return { data, local, sendMessage }
}

/** options.html을 jsdom 문서에 그대로 올린다(스크립트는 돌지 않는다) */
function mountPage() {
  const html = readFileSync(path.join(EXT, 'options.html'), 'utf8')
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.title = parsed.title
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
}

const $ = <T extends Element = HTMLElement>(sel: string) => {
  const found = document.querySelector<T>(sel)
  if (!found) throw new Error(`${sel} 없음`)
  return found
}
const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)]
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const row = (key: string) => $(`[data-row="${key}"]`)
const chipCodes = (key: string) => [...row(key).querySelectorAll('.chip b')].map(text)
/** 조각 글: 코드 · 이름 · × 를 칸마다 띄어 읽는다 */
const parts = (el: Element | null | undefined) => [...(el?.children ?? [])].map(text).filter(Boolean).join(' ')
const chipText = (key: string, code: string) =>
  parts([...row(key).querySelectorAll('.chip')].find((c) => text(c.querySelector('b')) === code))
const status = () => text($('#optStatus'))
const flush = () => new Promise((r) => setTimeout(r, 0))

function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

const SAVED: Settings = {
  v: 1,
  picks: {
    carm: ['CARM1'],
    sono: ['SONO1'],
    arthro: ['HA280'],
    manual: ['도수', 'MA4'],
    eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17', 'ESWT22'],
    pt: ['MM010', 'MM015', 'MM011'],
    etc1: ['CRYO'],
    manualConsult: ['.'],
    ptVisit: ['AA222'],
  },
  etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
  reservations: { manual: ['14', '20', '22'], eswt: ['1'] },
}

async function open(opts: { stored?: unknown; reply?: Reply } = {}) {
  const fake = fakeChrome(opts)
  mountPage()
  await startOptions()
  return fake
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AC-3607.1 화면 차례와 글', () => {
  it('AC-3607.1: 제목과 첫 줄 설명·맨 아래 개인정보 한 줄이 목업 그대로다', async () => {
    await open()
    expect(document.title).toBe('ERP 마감일지 채우기 · 설정')
    expect(text($('h1'))).toBe('ERP 마감일지 채우기 · 설정')
    expect(text($('.lead-p'))).toBe(
      'ERP 칸마다 셀 비트 처방 코드를 고르세요. 여러 개를 고를 수 있어요. 코드를 고르지 않은 항목의 칸은 건드리지 않아요.',
    )
    expect(text($('.foot'))).toBe(
      '환자 이름 · 차트번호는 이 PC의 도우미 밖으로 나가지 않아요. ERP 화면에는 숫자만 넣고, 저장은 ERP에서 직접 눌러요.',
    )
  })

  it('AC-3607.1: 항목 줄은 design.md 2절 GROUP_KEYS 차례이고 이름은 설정 이름이다', async () => {
    await open()
    const rows = $$('[data-row]')
    expect(rows.map((r) => r.dataset.row)).toEqual([...GROUP_KEYS])
    for (const r of rows) expect(text(r.querySelector('.oname b'))).toBe(GROUP_NAMES[r.dataset.row as keyof typeof GROUP_NAMES])
  })

  it('AC-3607.1: 네 묶음 + 예약으로 나뉘고 묶음마다 한 줄 설명이 있다', async () => {
    await open()
    const secs = $$('.osec').map((s) => [text(s.querySelector('h2')), text(s.querySelector(':scope > p'))])
    expect(secs).toEqual([
      ['치료별 건수 · 매출', '그날 고른 코드 가운데 하나라도 받은 환자 수를 건수로, 그 환자들의 그날 총진료비 합을 매출로 채워요.'],
      ['진료 · 치료현황만', '고른 코드를 받은 환자 수를 업무일지 1 진료 · 치료현황에 채워요.'],
      ['운영 지표', '주사1회환자는 그날 고른 주사를 맞았고 그 전 비트 기록에 고른 주사가 없는 환자예요.'],
      ['환자현황', '고른 코드를 받은 환자(신환 · 90일초진 아님)를 물리치료내원으로 세고, 재진 · 진찰료 산정안함에서 빼요.'],
      [
        '예약',
        'ERP 예약 표 줄마다 비트 예약 메모 번호를 고르세요. 고른 번호들의 예약을 더해 총갯수 · 내원 · 변경 · 취소를 채워요. 실예약환자수는 늘 채워요.',
      ],
    ])
    const keysIn = (i: number) => [...$$('.osec')[i].querySelectorAll<HTMLElement>('[data-row]')].map((r) => r.dataset.row)
    expect(keysIn(0)).toEqual(['carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4'])
    expect(keysIn(1)).toEqual(['manualConsult', 'lipus', 'nail', 'ct', 'surgery'])
    expect(keysIn(2)).toEqual(['eswtStd', 'eswtRadial', 'injection'])
    expect(keysIn(3)).toEqual(['ptVisit'])
  })

  it("AC-3607.1: 줄마다 '쓰는 칸' 작은 글이 목업 그대로다", async () => {
    await open()
    const use = (key: string) => text(row(key).querySelector('.oname small'))
    expect(use('carm')).toBe('업무일지 1 씨암 · 업무일지 2 씨암(주사) 건수 · 매출')
    expect(use('sono')).toBe('업무일지 1 SONO · 업무일지 2 SONO(주사) 건수 · 매출')
    expect(use('arthro')).toBe('업무일지 1 관절조영술 · 업무일지 2 관절조영 건수 · 매출')
    expect(use('manual')).toBe('업무일지 1 도수치료 · 업무일지 2 도수 건수 · 매출 · 도수 총금액')
    expect(use('eswt')).toBe('업무일지 1 충격파(체충) · 업무일지 2 충격파 건수 · 매출 · 충격파 총금액')
    expect(use('pt')).toBe('업무일지 2 물리치료 매출')
    for (const k of ['etc1', 'etc2', 'etc3', 'etc4']) expect(use(k)).toBe('업무일지 2 이 이름 줄의 건수 · 매출')
    expect(use('manualConsult')).toBe('업무일지 1 도수상담')
    expect(use('lipus')).toBe('업무일지 1 리푸스')
    expect(use('nail')).toBe('업무일지 1 손발톱케어')
    expect(use('ct')).toBe('업무일지 1 CT')
    expect(use('surgery')).toBe('업무일지 1 수술')
    expect(use('eswtStd')).toBe('업무일지 2 ESWT Standard')
    expect(use('eswtRadial')).toBe('업무일지 2 ESWT Radial')
    expect(use('injection')).toBe('업무일지 2 주사1회환자 · 신환주사환자 · 신환주사건수')
    expect(use('ptVisit')).toBe('업무일지 1 환자현황 물리치료내원')
  })
})

describe('AC-3607.3 처음 열었을 때(저장한 적 없음)', () => {
  it('AC-3607.3: 처음 값 코드가 조각으로 들어 있고 이름이 붙는다', async () => {
    await open()
    expect(chipCodes('carm')).toEqual(['CARM1'])
    expect(chipCodes('sono')).toEqual(['SONO1'])
    expect(chipCodes('arthro')).toEqual(['HA280'])
    expect(chipCodes('manual')).toEqual(['도수'])
    expect(chipCodes('eswt')).toEqual(['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'])
    expect(chipCodes('pt')).toEqual(['MM010', 'MM015', 'MM011'])
    expect(chipCodes('etc1')).toEqual(['CRYO'])
    expect(chipCodes('ptVisit')).toEqual(['AA222'])
    for (const k of ['etc2', 'etc3', 'etc4', 'manualConsult', 'lipus', 'nail', 'ct', 'surgery', 'eswtStd', 'eswtRadial', 'injection']) {
      expect(chipCodes(k), k).toEqual([])
      expect(text(row(k).querySelector('.none')), k).toBe('고른 코드 없음 · 이 칸은 채우지 않아요')
    }
    expect(chipText('carm', 'CARM1')).toBe('CARM1 씨암 영상 유도 ×')
    expect(($('[data-etc="etc1"]') as HTMLInputElement).value).toBe('크라이오')
  })

  it('AC-3607.3: 위에 처음 안내, 아래에 아직 저장하지 않았다는 글이 있다', async () => {
    await open()
    expect(text($('.notice.first'))).toBe(
      '처음 한 번 설정 화면에서 코드를 확인하고 [저장]을 눌러 주세요. 지금 들어 있는 코드는 처음 값이에요.',
    )
    expect(status()).toBe('아직 한 번도 저장하지 않았어요.')
  })

  it('AC-3607.1: 도우미에 closing.codes를 한 번 묻고, 받은 코드 수·메모 수를 보인다', async () => {
    const { sendMessage } = await open()
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith({ cmd: 'closing.codes', args: {} })
    expect(text($('.notice.ok'))).toBe('비트에서 최근 1년 처방 코드 1,284개와 예약 메모 6개를 받았어요.')
    expect($$('.notice.err')).toHaveLength(0)
  })

  it('AC-3607.2: 예약 6줄이 RSV 차례로 비어 있다', async () => {
    await open()
    const rows = $$('[data-rsv]')
    expect(rows.map((r) => r.dataset.rsv)).toEqual([...RSV_ROWS])
    for (const r of rows) {
      const k = r.dataset.rsv as keyof typeof RSV_NAMES
      expect(text(r.querySelector('.oname b'))).toBe(RSV_NAMES[k])
      expect(text(r.querySelector('.oname small'))).toBe(`업무일지 2 예약 표 ${RSV_NAMES[k]} 줄`)
      expect(text(r.querySelector('.none'))).toBe('고른 메모 없음 · 이 줄은 채우지 않아요')
      expect(r.querySelectorAll('.chip')).toHaveLength(0)
    }
  })
})

describe('AC-3607.1 코드 찾기·더하기·빼기', () => {
  it('AC-3607.1: 찾기 칸에 글자를 넣으면 코드나 이름에 든 코드가 visits 차례로 나오고, 고른 것은 골랐어요로 막힌다', async () => {
    await open()
    // 목업 ⑬: 충격파에 ESWT7·ESWT10만 남기고 '체외'를 찾는다
    ;(row('eswt').querySelector('[data-del="ESWT12"]') as HTMLButtonElement).click()
    ;(row('eswt').querySelector('[data-del="ESWT17"]') as HTMLButtonElement).click()
    expect(chipCodes('eswt')).toEqual(['ESWT7', 'ESWT10'])
    const find = $<HTMLInputElement>('[data-find="eswt"]')
    expect(find.placeholder).toBe('코드나 이름으로 찾기')
    type(find, '체외')
    const dd = $('[data-dd="eswt"]')
    expect(dd.hidden).toBe(false)
    const items = [...dd.querySelectorAll<HTMLButtonElement>('[data-add]')]
    expect(items.map((b) => [text(b.querySelector('b')), text(b.querySelector('span')), text(b.querySelector('em')), b.disabled])).toEqual([
      ['ESWT7', '체외충격파(2000타)', '골랐어요', true],
      ['ESWT12', '체외충격파(4000타)', '최근 1년 214번', false],
      ['ESWT10', '체외충격파(3000타)', '골랐어요', true],
      ['ESWT17', '체외충격파(6000타)', '최근 1년 25번', false],
    ])
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
  })

  it('AC-3607.1: 결과를 누르면 조각으로 더해지고 찾기가 닫히며, 같은 코드는 다시 더해지지 않는다', async () => {
    await open()
    type($<HTMLInputElement>('[data-find="manual"]'), 'ma4')
    const item = $<HTMLButtonElement>('[data-dd="manual"] [data-add="MA4"]')
    item.click()
    expect(chipCodes('manual')).toEqual(['도수', 'MA4'])
    expect(chipText('manual', 'MA4')).toBe('MA4 도수치료(30분) 비급여 ×')
    expect($('[data-dd="manual"]').hidden).toBe(true)
    expect($<HTMLInputElement>('[data-find="manual"]').value).toBe('')
    type($<HTMLInputElement>('[data-find="manual"]'), 'MA4')
    const again = $<HTMLButtonElement>('[data-dd="manual"] [data-add="MA4"]')
    expect(again.disabled).toBe(true)
    again.click()
    expect(chipCodes('manual')).toEqual(['도수', 'MA4'])
  })

  it('AC-3607.1: 대소문자를 가리지 않고, 맞는 것이 없으면 그렇게 말한다', async () => {
    await open()
    type($<HTMLInputElement>('[data-find="lipus"]'), 'sono')
    expect([...$$('[data-dd="lipus"] [data-add]')].map((b) => b.dataset.add)).toEqual(['SONO1'])
    type($<HTMLInputElement>('[data-find="lipus"]'), '없는말')
    expect(text($('[data-dd="lipus"] .empty'))).toBe('맞는 코드가 없어요.')
    type($<HTMLInputElement>('[data-find="lipus"]'), '  ')
    expect($('[data-dd="lipus"]').hidden).toBe(true)
  })

  it('AC-3607.1: 결과는 30개까지다', async () => {
    await open()
    type($<HTMLInputElement>('[data-find="ct"]'), 'z0')
    expect($$('[data-dd="ct"] [data-add]')).toHaveLength(30)
  })

  it('AC-3607.1: 20개를 고르면 찾기 칸이 막히고 20개까지라고 말한다', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `Z${String(i).padStart(4, '0')}`)
    await open({ stored: { ...SAVED, picks: { ...SAVED.picks, surgery: twenty } } })
    const find = $<HTMLInputElement>('[data-find="surgery"]')
    expect(find.disabled).toBe(true)
    expect(find.placeholder).toBe('20개까지 고를 수 있어요')
    ;(row('surgery').querySelector('[data-del="Z0003"]') as HTMLButtonElement).click()
    expect($<HTMLInputElement>('[data-find="surgery"]').disabled).toBe(false)
  })

  it("AC-3607.1: [×]로 모두 빼면 '고른 코드 없음' 글이 보인다", async () => {
    await open()
    const del = $<HTMLButtonElement>('[data-row="carm"] [data-del="CARM1"]')
    expect(del.getAttribute('aria-label')).toBe('CARM1 빼기')
    del.click()
    expect(chipCodes('carm')).toEqual([])
    expect(text(row('carm').querySelector('.none'))).toBe('고른 코드 없음 · 이 칸은 채우지 않아요')
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
  })

  it('AC-3607.1: 바깥을 누르거나 Esc를 누르면 찾기 목록이 닫힌다', async () => {
    await open()
    type($<HTMLInputElement>('[data-find="nail"]'), 'mm')
    expect($('[data-dd="nail"]').hidden).toBe(false)
    $('h1').click()
    expect($('[data-dd="nail"]').hidden).toBe(true)
    type($<HTMLInputElement>('[data-find="nail"]'), 'mm')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect($('[data-dd="nail"]').hidden).toBe(true)
  })

  it('AC-3607.1: 도우미가 준 이름은 글자로만 그린다(태그로 해석하지 않는다)', async () => {
    const evil: ClosingCodes = {
      codes: [{ code: 'XSS1', name: '<img src=x onerror=alert(1)>', visits: 9 }],
      kinds: [{ kind: '9', name: '<b>굵게</b>' }],
    }
    await open({ reply: { type: 'result', data: evil } })
    type($<HTMLInputElement>('[data-find="ct"]'), 'xss')
    const dd = $('[data-dd="ct"]')
    expect(dd.querySelector('img')).toBeNull()
    expect(text(dd.querySelector('[data-add] span'))).toBe('<img src=x onerror=alert(1)>')
    const opt = [...$$<HTMLOptionElement>('[data-radd="etc"] option')].find((o) => o.value === '9')
    expect(opt?.textContent).toBe('9번 · <b>굵게</b>')
  })
})

describe('AC-3607.2 기타 이름·예약 메모', () => {
  it("AC-3607.2: 기타1~4 줄에만 'ERP 줄 이름' 칸(20자까지)이 있다", async () => {
    await open()
    expect($$('[data-etc]').map((i) => i.dataset.etc)).toEqual(['etc1', 'etc2', 'etc3', 'etc4'])
    for (const input of $$<HTMLInputElement>('[data-etc]')) {
      expect(input.maxLength).toBe(20)
      expect(input.placeholder).toBe('업무일지 2 줄 이름과 똑같이')
      expect(text(input.closest('label')?.querySelector('span'))).toBe('ERP 줄 이름')
      expect(input.closest('[data-row]')?.getAttribute('data-row')).toBe(input.dataset.etc)
    }
  })

  it('AC-3607.2: 기타 이름을 고치면 저장 전 글로 바뀌고, 저장하면 앞뒤 공백을 떼고 20자까지 쓴다', async () => {
    const { data } = await open()
    type($<HTMLInputElement>('[data-etc="etc2"]'), '  핫팩  ')
    type($<HTMLInputElement>('[data-etc="etc3"]'), '가'.repeat(25))
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
    $('#optSave').click()
    await flush()
    const saved = data[SETTINGS_KEY] as Settings
    expect(saved.etcNames).toEqual({ etc1: '크라이오', etc2: '핫팩', etc3: '가'.repeat(20), etc4: '' })
  })

  it('AC-3607.2: 예약 줄은 예약 메모 목록에서 여러 개 고르고 [×]로 뺀다', async () => {
    await open()
    const select = () => $<HTMLSelectElement>('[data-radd="manual"]')
    expect(select().getAttribute('aria-label')).toBe('도수 줄에 예약 메모 더하기')
    expect([...select().options].map((o) => o.textContent)).toEqual([
      '예약 메모 더하기',
      '1번 · 체외충격파',
      '2번 · 주사',
      '3번 · 경과',
      '14번 · 도수30분(호)',
      '20번 · 도수30분(원)',
      '22번 · 도수30분(현)',
    ])
    choose(select(), '14')
    choose(select(), '20')
    choose(select(), '22')
    const chips = () => [...$('[data-rsv="manual"]').querySelectorAll('.chip')].map(parts)
    expect(chips()).toEqual(['14번 도수30분(호) ×', '20번 도수30분(원) ×', '22번 도수30분(현) ×'])
    // 고른 번호는 목록에서 빠진다
    expect([...select().options].map((o) => o.value)).toEqual(['', '1', '2', '3'])
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
    $<HTMLButtonElement>('[data-rsv="manual"] [data-rdel="20"]').click()
    expect(chips()).toEqual(['14번 도수30분(호) ×', '22번 도수30분(현) ×'])
  })
})

describe('AC-3607.3 저장·처음 값으로', () => {
  it("AC-3607.3: [저장]은 erpClosing 한 열쇠에 design.md 4절 모양으로 쓰고 '저장했어요.'가 된다", async () => {
    const { data, local } = await open()
    choose($<HTMLSelectElement>('[data-radd="eswt"]'), '1')
    type($<HTMLInputElement>('[data-find="manualConsult"]'), '도수상담')
    $<HTMLButtonElement>('[data-dd="manualConsult"] [data-add="."]').click()
    $('#optSave').click()
    await flush()
    expect(local.set).toHaveBeenCalledTimes(1)
    expect(Object.keys(local.set.mock.calls[0][0] as object)).toEqual([SETTINGS_KEY])
    expect(data[SETTINGS_KEY]).toEqual({
      v: 1,
      picks: {
        carm: ['CARM1'],
        sono: ['SONO1'],
        arthro: ['HA280'],
        manual: ['도수'],
        eswt: ['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'],
        pt: ['MM010', 'MM015', 'MM011'],
        etc1: ['CRYO'],
        manualConsult: ['.'],
        ptVisit: ['AA222'],
      },
      etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
      reservations: { eswt: ['1'] },
    })
    expect(status()).toBe('저장했어요.')
    expect($('#optStatus').classList.contains('saved')).toBe(true)
    expect($$('.notice.first')).toHaveLength(0)
  })

  it('AC-3607.3: 저장한 설정이 있으면 그 값을 보이고 처음 안내 없이 저장했어요다', async () => {
    const { sendMessage } = await open({ stored: SAVED })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(chipCodes('manual')).toEqual(['도수', 'MA4'])
    expect(chipCodes('manualConsult')).toEqual(['.'])
    expect([...$('[data-rsv="eswt"]').querySelectorAll('.chip b')].map(text)).toEqual(['1번'])
    expect($$('.notice.first')).toHaveLength(0)
    expect(status()).toBe('저장했어요.')
  })

  it('AC-3607.3: [처음 값으로]는 화면만 처음 값으로 바꾸고 저장하지 않는다', async () => {
    const { data, local } = await open({ stored: SAVED })
    $('#optReset').click()
    await flush()
    expect(chipCodes('manual')).toEqual(['도수'])
    expect(chipCodes('eswt')).toEqual(['ESWT7', 'ESWT10', 'ESWT12', 'ESWT17'])
    expect(chipCodes('manualConsult')).toEqual([])
    expect($('[data-rsv="manual"]').querySelectorAll('.chip')).toHaveLength(0)
    expect(status()).toBe('바꾼 것을 아직 저장하지 않았어요.')
    expect($('#optStatus').classList.contains('dirty')).toBe(true)
    expect(local.set).not.toHaveBeenCalled()
    expect(data[SETTINGS_KEY]).toEqual(SAVED)
  })

  it('AC-3607.3: 단추 글은 [처음 값으로]·[저장]이다', async () => {
    await open()
    expect(text($('#optReset'))).toBe('처음 값으로')
    expect(text($('#optSave'))).toBe('저장')
  })
})

describe('AC-3607.4 도우미에서 코드 목록을 받지 못했을 때·목록에 없는 코드', () => {
  it("AC-3607.4: 목록에 없는 고른 코드 옆에는 '(최근 1년 처방 없음)'이 붙는다", async () => {
    await open({ stored: SAVED })
    expect(chipText('eswt', 'ESWT22')).toBe('ESWT22 (최근 1년 처방 없음) ×')
    expect(row('eswt').querySelector('.chip .cn.gone')).not.toBeNull()
    expect(chipText('eswt', 'ESWT7')).toBe('ESWT7 체외충격파(2000타) ×')
  })

  it('AC-3607.4: 도우미를 부르지 못하면 번호와 함께 안내하고, 고른 코드는 코드만 보이며 찾기·메모 고르기는 막힌다', async () => {
    const { data } = await open({
      stored: SAVED,
      reply: () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')),
    })
    const err = $('.notice.err')
    expect(text(err.querySelector('b'))).toBe('도우미에서 코드 목록을 받지 못했어요 (E-HELPER-MISSING)')
    expect(text(err)).toContain(
      '고른 코드는 그대로 두고 저장할 수 있어요. 코드를 새로 찾으려면 도우미를 켠 뒤 이 화면을 다시 열어 주세요.',
    )
    expect($$('.notice.ok')).toHaveLength(0)
    expect(chipText('eswt', 'ESWT7')).toBe('ESWT7 ×')
    expect(chipText('eswt', 'ESWT22')).toBe('ESWT22 ×')
    expect([...$('[data-rsv="manual"]').querySelectorAll('.chip')].map(parts)).toEqual(['14번 ×', '20번 ×', '22번 ×'])
    for (const input of $$<HTMLInputElement>('[data-find]')) {
      expect(input.disabled).toBe(true)
      expect(input.placeholder).toBe('코드 목록을 받지 못해 찾을 수 없어요')
    }
    for (const select of $$<HTMLSelectElement>('[data-radd]')) {
      expect(select.disabled).toBe(true)
      expect(select.options[0].textContent).toBe('메모 목록을 받지 못했어요')
    }
    // 빼고 저장은 된다
    $<HTMLButtonElement>('[data-row="manual"] [data-del="MA4"]').click()
    $('#optSave').click()
    await flush()
    expect((data[SETTINGS_KEY] as Settings).picks.manual).toEqual(['도수'])
    expect(status()).toBe('저장했어요.')
  })

  it('AC-3607.4: 도우미가 오류 번호로 답하면 그 번호를 보인다', async () => {
    await open({ reply: { type: 'error', code: 'E-BIT-READ-FAILED' } })
    expect(text($('.notice.err b'))).toBe('도우미에서 코드 목록을 받지 못했어요 (E-BIT-READ-FAILED)')
  })

  it('AC-3607.4: 답이 없으면 E-HELPER-MISSING, 번호 모양이 아니거나 답 모양이 틀리면 E-BRIDGE-BAD-REPLY다', async () => {
    await open({ reply: undefined })
    expect(text($('.notice.err b'))).toBe('도우미에서 코드 목록을 받지 못했어요 (E-HELPER-MISSING)')
    await open({ reply: { type: 'error', code: 'System.Exception: 가상환자01' } })
    expect(text($('.notice.err b'))).toBe('도우미에서 코드 목록을 받지 못했어요 (E-BRIDGE-BAD-REPLY)')
    expect(document.body.textContent).not.toContain('가상환자01')
    await open({ reply: { type: 'result', data: { codes: [{ code: 1 }], kinds: [] } } })
    expect(text($('.notice.err b'))).toBe('도우미에서 코드 목록을 받지 못했어요 (E-BRIDGE-BAD-REPLY)')
  })
})
