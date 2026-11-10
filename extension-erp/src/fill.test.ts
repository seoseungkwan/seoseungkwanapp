// @vitest-environment jsdom
// TASK-4 REQ-3608: 시험용 ERP 화면(__tests__/erpPage.ts, React 18 통제 칸 흉내)에서 칸 찾기·값 넣기·채우기
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allKeys, ETC_NAMES, mountErpPage, sampleDay, settingsAll, settingsFirst, type ErpPageOptions } from './__tests__/erpPage'
import { HELD_SALES, planCells } from './cells'
import { fillAll, findInput, putValue, W1_WAIT_MS } from './fill'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const open = (o: ErpPageOptions = {}) => mountErpPage(document, { etcNames: ETC_NAMES, ...o })
const fullPlan = () => planCells(sampleDay(), settingsAll())

// sampleDay + settingsAll로 채운 뒤 ERP 기억에 있어야 할 값(ERP 칸 코드 → 쉼표 없는 글자)
const tot = (i: number) => String((i + 1) * 1_000_000 + 1_234)
const rsv = (kind: string, v: number[]) =>
  Object.fromEntries(['reserved', 'visited', 'changed', 'canceled'].map((c, n) => [`RSV:${kind}:${c}`, String(v[n])]))
const three = (row: string, i: number) => ({
  [`${row}_NEW`]: String(100 + i),
  [`${row}_F90`]: String(200 + i),
  [`${row}_RET`]: String(300 + i),
})
const BANDS = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
const EXPECTED: Record<string, string> = {
  NEW_PATIENT: '7',
  FIRST90_PATIENT: '10',
  RETURN_PATIENT: '52',
  PT_VISIT_PATIENT: '11',
  NO_EXAM_FEE_PATIENT: '4',
  TOTAL_PATIENT: '84',
  CARM_CNT: '400',
  CLOSING_SONO_CNT: '401',
  MANUAL_CONSULT: '410',
  MANUAL_CNT: '403',
  ESWT_CNT: '404',
  ARTHROGRAPHY_CNT: '402',
  LIPUS_CNT: '411',
  NAILCARE_CNT: '412',
  CT_CNT: '413',
  SURGERY_CNT: '414',
  TOTAL_FEE: '11668530',
  CLAIM_AMOUNT: '6120400',
  UNPAID_IN: '35000',
  UNPAID_NEW: '12000',
  NONINSURED: '2410300',
  DEDUCTION: '8000',
  DISABLED_FUND: '1500',
  RECEIVED: '5571630',
  CARD_AMOUNT: '4012330',
  CASH_AMOUNT: '1208300',
  TRANSFER_AMOUNT: '351000',
  REFUND: '33000',
  INPAT_CLAIM: '0',
  INPAT_NONINSURED: '0',
  INPAT_COPAY: '0',
  INPAT_RECEIVED: '0',
  ...rsv('injection', [51, 52, 53, 54]),
  ...rsv('progress', [61, 62, 63, 64]),
  ...rsv('manual', [93, 96, 99, 102]),
  ...rsv('eswt', [11, 12, 13, 14]),
  ...rsv('consult', [0, 0, 0, 0]),
  ...rsv('etc', [0, 0, 0, 0]),
  RSV_PATIENTS: '77',
  ...three('INJ_CARM', 0),
  ...three('INJ_SONO', 1),
  ...three('ARTHRO', 2),
  ...three('MANUAL', 3),
  ...three('ESWT', 4),
  ...three('ETC1', 6),
  ...three('ETC2', 7),
  ...three('ETC3', 8),
  ...three('ETC4', 9),
  ...Object.fromEntries(
    BANDS.flatMap((b, k) => [
      [`AGE:${b}:newCnt`, String(500 + k)],
      [`AGE:${b}:first90Cnt`, String(600 + k)],
      [`AGE:${b}:revisitCnt`, String(700 + k)],
    ]),
  ),
  THR_MANUAL_AMT: tot(3),
  THR_ESWT_AMT: tot(4),
  ESWT_STD_CNT: '415',
  ESWT_RADIAL_CNT: '416',
  INJECTION_ONCE_PATIENT: '9',
  NEW_INJECTION_PATIENT: '3',
  NEW_INJECTION_CNT: '4',
  // 씨암·SONO 치료별 매출(CARM_AMT·SONO_AMT)은 보류(HELD_SALES)라 채우지 않는다
  ARTHRO_AMT: tot(2),
  PT_AMT: tot(5),
  ETC1_AMT: tot(6),
  ETC2_AMT: tot(7),
  ETC3_AMT: tot(8),
  ETC4_AMT: tot(9),
}
const W1_CODES = Object.keys(EXPECTED).slice(0, 32)

/** 모든 칸에 이미 적힌 값(덮어쓰기·안 건드림 확인용). 상태는 '확정' */
const TEXT_KEYS = new Set(['offDuty', 'manager', 'teamLead', 'director', 'REMARKS', 'EVT:0:name'])
const PRE: Record<string, string> = Object.fromEntries(
  allKeys().map((k) => [k, k === 'STATUS' ? 'confirmed' : TEXT_KEYS.has(k) ? '직접 쓴 글' : '9999']),
)

const money = (raw: string) => raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

describe('AC-3608.1 findInput: 구역·묶음 제목 + 줄 이름 + 열 머리 / label 글자로 칸을 찾는다', () => {
  it("AC-3608.1: 업무일지 1 = h4.closing-panel-title + 줄 첫 칸 글자 + 그 줄 input('자동' 표시·앞뒤 빈칸 떼고 견줌)", () => {
    const page = open({ badges: true, spaced: true })
    expect(findInput(document, { j: 1, box: '환자현황', row: '신환' })).toBe(page.inputs('NEW_PATIENT')[0])
    expect(findInput(document, { j: 1, box: '환자현황', row: '재진' })).toBe(page.inputs('RETURN_PATIENT')[0])
    expect(findInput(document, { j: 1, box: '외래 수입', row: '외래 총매출' })).toBe(page.inputs('TOTAL_FEE')[0])
    expect(findInput(document, { j: 1, box: '진료 · 치료현황', row: '씨암' })).toBe(page.inputs('CARM_CNT')[0])
    // 같은 줄 이름 '비급여'는 구역으로 가른다
    expect(findInput(document, { j: 1, box: '외래 수입', row: '비급여' })).toBe(page.inputs('NONINSURED')[0])
    expect(findInput(document, { j: 1, box: '입원수입', row: '비급여' })).toBe(page.inputs('INPAT_NONINSURED')[0])
  })

  it('AC-3608.1: 업무일지 2 표 = h3.cdf-section-title + td.rowlabel + thead th 차례의 열', () => {
    const page = open({ badges: true, spaced: true })
    expect(findInput(document, { j: 2, card: '예약', row: '주사', col: '총갯수' })).toBe(page.inputs('RSV:injection:reserved')[0])
    expect(findInput(document, { j: 2, card: '예약', row: '기타(수액,드레싱등)', col: '취소' })).toBe(
      page.inputs('RSV:etc:canceled')[0],
    )
    expect(findInput(document, { j: 2, card: '예약', row: '실예약환자수', col: '총갯수' })).toBe(page.inputs('RSV_PATIENTS')[0])
    // 제목 옆에 '자동' 표시가 붙은 묶음
    expect(findInput(document, { j: 2, card: '연령별 신환/90일초진/재진', row: '10대미만', col: '재진' })).toBe(
      page.inputs('AGE:10대미만:revisitCnt')[0],
    )
    expect(findInput(document, { j: 2, card: '연령별 신환/90일초진/재진', row: '90대', col: '신환' })).toBe(
      page.inputs('AGE:90대:newCnt')[0],
    )
    // 줄 이름 뒤에 '업로드 시 생략 가능'이 붙은 줄
    expect(findInput(document, { j: 2, card: '치료별 매출', row: '씨암', col: '금액(원)' })).toBe(page.inputs('CARM_AMT')[0])
    const manualRow = findInput(document, { j: 2, card: '치료별 매출', row: '도수', col: '금액(원)' })
    expect(manualRow?.closest('table')).not.toBeNull()
    expect(page.inputs('THR_MANUAL_AMT')).toContain(manualRow)
    // 병원이 이름을 바꾼 기타 줄
    expect(findInput(document, { j: 2, card: '치료별 신환/90일초진/재진 건수', row: '크라이오', col: '90일초진' })).toBe(
      page.inputs('ETC1_F90')[0],
    )
  })

  it('AC-3608.1: 업무일지 2 낱칸 = div.cdf-field > label 글자(표시 떼고 똑같을 때만)', () => {
    const page = open({ spaced: true })
    const field = findInput(document, { j: 2, field: '도수 총금액' })
    expect(field?.closest('.cdf-field')).not.toBeNull()
    expect(page.inputs('THR_MANUAL_AMT')).toContain(field)
    expect(findInput(document, { j: 2, field: 'ESWT Standard' })).toBe(page.inputs('ESWT_STD_CNT')[0])
    expect(findInput(document, { j: 2, field: '주사1회환자' })).toBe(page.inputs('INJECTION_ONCE_PATIENT')[0])
    // 글자 일부만 같은 칸(도수 총금액·도수 기본단가)으로 새지 않는다
    expect(findInput(document, { j: 2, field: '도수' })).toBeNull()
  })

  it("AC-3608.1: 못 찾으면 null — 입력칸 없는 '치료사별 입력' 줄·계산 줄·다른 이름 줄·없는 열·없는 구역", () => {
    open({ therapistRows: true, etcNames: ['기타1', '기타2', '기타3', '기타4'] })
    expect(findInput(document, { j: 1, box: '진료 · 치료현황', row: '도수치료' })).toBeNull()
    expect(findInput(document, { j: 1, box: '진료 · 치료현황', row: '충격파(체충)' })).toBeNull()
    expect(findInput(document, { j: 1, box: '외래 수입', row: '총매출' })).toBeNull()
    expect(findInput(document, { j: 1, box: '없는 구역', row: '신환' })).toBeNull()
    expect(findInput(document, { j: 2, card: '치료별 매출', row: '크라이오', col: '금액(원)' })).toBeNull()
    expect(findInput(document, { j: 2, card: '예약', row: '주사', col: '합계' })).toBeNull()
    expect(findInput(document, { j: 2, card: '없는 묶음', row: '주사', col: '총갯수' })).toBeNull()
    expect(findInput(document, { j: 2, field: '없는 칸' })).toBeNull()
  })

  it('AC-3608.1: 2 탭일 때는 업무일지 1 칸이 화면에 없어 null이다', () => {
    open({ tab: 'w2' })
    expect(findInput(document, { j: 1, box: '환자현황', row: '신환' })).toBeNull()
    expect(findInput(document, { j: 2, card: '예약', row: '주사', col: '총갯수' })).not.toBeNull()
  })
})

describe('AC-3608.2 putValue: 기본 value 설정 함수 + bubbles input 이벤트(React 기억에 들어감)', () => {
  it('AC-3608.2: 숫자칸은 기본 설정 함수로 넣고 bubbles input 이벤트를 쏜다 → React 기억에 들어간다', () => {
    const page = open({ values: { NEW_PATIENT: '3' } })
    const seen: boolean[] = []
    document.addEventListener('input', (e) => seen.push(e.bubbles))
    const el = page.inputs('NEW_PATIENT')[0] as HTMLInputElement
    putValue(el, '12')
    expect(page.state.NEW_PATIENT).toBe('12')
    expect(el.value).toBe('12')
    expect(seen).toEqual([true])
  })

  it('AC-3608.2: (본보기 확인) 그냥 el.value = x 만 하면 화면엔 보여도 React 기억에 안 들어간다', () => {
    const page = open({ values: { NEW_PATIENT: '3' } })
    const el = page.inputs('NEW_PATIENT')[0] as HTMLInputElement
    el.value = '5'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    expect(el.value).toBe('5')
    expect(page.state.NEW_PATIENT).toBe('3')
  })

  it("AC-3608.2: 금액칸(input.money-input)은 '' → input → 쉼표 없는 숫자 → input → blur 차례다", () => {
    const page = open({ values: { TOTAL_FEE: '1000' } })
    const el = page.inputs('TOTAL_FEE')[0] as HTMLInputElement
    expect(el.value).toBe('1,000')
    putValue(el, '11668530')
    expect(page.log.filter((x) => x.key === 'TOTAL_FEE')).toEqual([
      { key: 'TOTAL_FEE', ev: 'input', dom: '' },
      { key: 'TOTAL_FEE', ev: 'input', dom: '11668530' },
      { key: 'TOTAL_FEE', ev: 'blur', dom: '11,668,530' },
    ])
    expect(page.state.TOTAL_FEE).toBe('11668530')
    expect(el.value).toBe('11,668,530')
    expect(document.activeElement).not.toBe(el)
  })

  it('AC-3608.2: 업무일지 2 칸의 input 이벤트가 업무일지 2 영역까지 올라가 고침 있음이 켜진다', () => {
    const page = open()
    expect(page.w2Dirty).toBe(false)
    putValue(page.inputs('RSV_PATIENTS')[0] as HTMLInputElement, '77')
    expect(page.state.RSV_PATIENTS).toBe('77')
    expect(page.w2Dirty).toBe(true)
  })
})

describe('AC-3608.3 fillAll: 칸 표 그대로 채운다', () => {
  it('AC-3608.3: 1 탭 화면에서 129칸(1: 32, 2: 99 − 보류 2)을 덮어쓰고 React 기억이 칸 표 그대로다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    expect(result).toEqual({ filled: 129, missing: [], unpicked: 0, unknown: 0, held: 2 })
    for (const [code, value] of Object.entries(EXPECTED)) expect(page.state[code], code).toBe(value)
    // 금액칸은 쉼표와 함께 보인다. 도수·충격파 총금액은 치료별 매출 도수·충격파와 같은 값 하나에 칸이 둘
    expect(page.dom('TOTAL_FEE')).toEqual([money('11668530')])
    expect(page.dom('THR_MANUAL_AMT')).toEqual([money(tot(3)), money(tot(3))])
    expect(page.dom('NEW_PATIENT')).toEqual(['7'])
  })

  it('AC-3608.1: 못 찾은 칸은 그 칸만 건너뛰고 못 찾은 칸에 적는다(치료사별 입력 줄·다른 기타 이름·없어진 낱칸)', async () => {
    const page = open({ therapistRows: true, etcNames: ['크라이오', '기타2', '기타3', '기타4'] })
    document.querySelectorAll('.cdf-field').forEach((f) => {
      if (f.querySelector('label')?.textContent === 'ESWT Radial') f.remove()
    })
    const result = await fillAll(document, fullPlan())
    expect(result.missing.slice(0, 2)).toEqual([
      '업무일지 1 › 진료 · 치료현황 › 도수치료',
      '업무일지 1 › 진료 · 치료현황 › 충격파(체충)',
    ])
    expect(result.missing).toContain('업무일지 2 › 치료별 신환/90일초진/재진 건수 › 체외충격파B › 신환')
    expect(result.missing).toContain('업무일지 2 › 치료별 매출 › 테이핑 › 금액(원)')
    expect(result.missing).toContain('업무일지 2 › 운영 지표(치료사별·금액) › ESWT Radial')
    expect(result.missing).toHaveLength(2 + 9 + 3 + 1)
    expect(result.filled).toBe(131 - 2 - result.missing.length)
    // 나머지는 멈추지 않고 채운다
    expect(page.state.CARM_CNT).toBe('400')
    expect(page.state.ETC1_AMT).toBe(tot(6))
    expect(page.state.ETC2_AMT).toBe('')
    expect(page.state.MANUAL_CNT).toBe('')
  })
})

describe('AC-3608.4 fillAll: 고르지 않은 칸·직접 입력 칸·select·textarea·기본단가·단추는 건드리지 않는다', () => {
  it('AC-3608.4: 직접 입력 칸·특이사항·상태·기본단가는 그대로이고, 단추는 하나도 누르지 않는다', async () => {
    const page = open({ values: PRE })
    const keys = allKeys()
    const before = Object.fromEntries(keys.map((k) => [k, page.dom(k)]))
    const status = document.querySelector('select') as HTMLSelectElement
    expect(status.value).toBe('confirmed')
    await fillAll(document, fullPlan())
    const untouched = keys.filter((k) => !(k in EXPECTED))
    expect(untouched).toEqual(
      expect.arrayContaining(['offDuty', 'ROUTE_REFERRAL', 'MOU_DEDUCTION', 'EXP:cash', 'BASE:manual', 'BASE:eswt', 'REMARKS']),
    )
    for (const k of untouched) {
      expect(page.state[k], k).toBe(PRE[k])
      expect(page.dom(k), k).toEqual(before[k])
    }
    // 그 칸들에는 이벤트도 쏘지 않았다
    expect(page.log.filter((x) => !(x.key in EXPECTED))).toEqual([])
    expect(status.value).toBe('confirmed')
    expect(page.changes).toEqual([])
    expect(page.clicks).toEqual([])
  })

  it('AC-3608.4: 값이 null이거나 고르지 않은 항목의 칸은 이미 적힌 값도 그대로 둔다', async () => {
    const page = open({ values: PRE })
    const day = sampleDay()
    day.money.refund = null
    const result = await fillAll(document, planCells(day, settingsFirst()))
    expect(result).toEqual({ filled: 90, missing: [], unpicked: 38, unknown: 1, held: 2 })
    for (const k of ['REFUND', 'LIPUS_CNT', 'RSV:injection:reserved', 'ETC2_AMT', 'ETC4_RET', 'ESWT_STD_CNT', 'INJECTION_ONCE_PATIENT']) {
      expect(page.state[k], k).toBe('9999')
      expect(page.log.some((x) => x.key === k), k).toBe(false)
    }
    expect(page.state.CARM_CNT).toBe('400')
    expect(page.state.ETC1_AMT).toBe(tot(6))
    expect(page.state['RSV:manual:reserved']).toBe('93')
  })

  it('AC-3608.4: 보류 칸(씨암·SONO 치료별 매출)은 이미 적힌 값 그대로이고 이벤트도 없으며 held에 센다. 같은 묶음 건수 칸은 채운다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, planCells(sampleDay(), settingsFirst()))
    expect(result.held).toBe(2)
    for (const k of ['CARM_AMT', 'SONO_AMT']) {
      expect(page.state[k], k).toBe('9999')
      expect(page.log.some((x) => x.key === k), k).toBe(false)
    }
    expect(result.missing.filter((m) => m.includes('씨암') || m.includes('SONO'))).toEqual([])
    expect(page.state.CARM_CNT).toBe('400')
    expect(page.state.CLOSING_SONO_CNT).toBe('401')
    expect(page.state.INJ_CARM_NEW).toBe('100')
    expect(page.state.INJ_SONO_RET).toBe('301')
    expect(page.state.ARTHRO_AMT).toBe(tot(2))
  })

  it('AC-3608.4: 보류 칸은 화면에 없어도 못 찾은 칸·고르지 않은 칸에 세지 않는다', async () => {
    open()
    const where = { j: 2, card: '치료별 매출', row: '씨암', col: '금액(원)' } as const
    findInput(document, where)?.closest('tr')?.remove()
    expect(findInput(document, where)).toBeNull()
    const result = await fillAll(document, planCells(sampleDay(), settingsFirst()))
    expect(result.missing).toEqual([])
    expect(result.unpicked).toBe(38)
    expect(result.held).toBe(2)
  })

  it('AC-3608.4: HELD_SALES를 비우면 씨암·SONO 치료별 매출도 지금처럼 채운다(131칸, held 0)', async () => {
    const page = open({ values: PRE })
    const saved = HELD_SALES.splice(0)
    let plan: ReturnType<typeof fullPlan>
    try {
      plan = fullPlan()
    } finally {
      HELD_SALES.push(...saved)
    }
    const result = await fillAll(document, plan)
    expect(result).toEqual({ filled: 131, missing: [], unpicked: 0, unknown: 0, held: 0 })
    expect(page.state.CARM_AMT).toBe(tot(0))
    expect(page.state.SONO_AMT).toBe(tot(1))
  })
})

describe('AC-3608.5 fillAll: 탭·숨은 칸·읽기 전용', () => {
  it('AC-3608.5: 1 칸 기다림은 2초까지다', () => {
    expect(W1_WAIT_MS).toBe(2000)
  })

  it('AC-3608.5: 2 탭이면 #closing-tab-w1을 눌러 칸이 생기면 채우고 처음 탭(2)으로 돌아온다', async () => {
    const page = open({ tab: 'w2', values: PRE })
    const result = await fillAll(document, fullPlan())
    expect(result).toEqual({ filled: 129, missing: [], unpicked: 0, unknown: 0, held: 2 })
    expect(page.clicks).toEqual(['closing-tab-w1', 'closing-tab-w2'])
    expect(page.tab()).toBe('w2')
    for (const [code, value] of Object.entries(EXPECTED)) expect(page.state[code], code).toBe(value)
  })

  it('AC-3608.5: 1 칸이 늦게(1.5초) 생겨도 기다렸다 채운다', async () => {
    vi.useFakeTimers()
    const page = open({ tab: 'w2', w1Delay: 1500 })
    const pending = fillAll(document, fullPlan())
    await vi.advanceTimersByTimeAsync(1600)
    const result = await pending
    expect(result.filled).toBe(129)
    expect(page.state.NEW_PATIENT).toBe('7')
    expect(page.tab()).toBe('w2')
  })

  it('AC-3608.5: 2초 안에 1 칸이 안 생기면 1 칸은 못 찾은 칸, 2 칸은 채우고 2 탭으로 돌아온다', async () => {
    vi.useFakeTimers()
    const page = open({ tab: 'w2', w1Delay: 'never' })
    let done = false
    const pending = fillAll(document, fullPlan()).then((r) => {
      done = true
      return r
    })
    await vi.advanceTimersByTimeAsync(W1_WAIT_MS - 100)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    const result = await pending
    expect(result.missing).toHaveLength(32)
    expect(result.missing[0]).toBe('업무일지 1 › 환자현황 › 신환')
    expect(result.filled).toBe(97)
    expect(page.tab()).toBe('w2')
    expect(page.clicks).toEqual(['closing-tab-w1', 'closing-tab-w2'])
    expect(page.state.RSV_PATIENTS).toBe('77')
    expect(W1_CODES.every((c) => page.state[c] === '')).toBe(true)
  })

  it('AC-3608.5: 1 탭이면 숨은 업무일지 2 칸(#closing-panel-w2[hidden])도 채우고 탭 단추를 누르지 않는다', async () => {
    const page = open()
    const panel = document.querySelector('#closing-panel-w2') as HTMLElement
    expect(panel.hidden).toBe(true)
    const result = await fillAll(document, fullPlan())
    expect(result.filled).toBe(129)
    expect(page.state.RSV_PATIENTS).toBe('77')
    expect(page.state.ARTHRO_AMT).toBe(tot(2))
    expect(page.w2Dirty).toBe(true)
    expect(panel.hidden).toBe(true)
    expect(page.clicks).toEqual([])
  })

  it('AC-3608.5: 업무일지 1에 채울 값이 없으면 2 탭에서 탭 단추를 누르지 않는다', async () => {
    const page = open({ tab: 'w2' })
    const result = await fillAll(
      document,
      fullPlan().filter((p) => p.where.j === 2),
    )
    expect(result.filled).toBe(97)
    expect(page.clicks).toEqual([])
  })

  it('AC-3608.5: fieldset[disabled] 안 칸뿐이면(본사 열람) 아무것도 바꾸지 않는다', async () => {
    const page = open({ readOnly: true, values: PRE })
    const keys = allKeys()
    const state = { ...page.state }
    const dom = Object.fromEntries(keys.map((k) => [k, page.dom(k)]))
    const result = await fillAll(document, fullPlan())
    expect(result.filled).toBe(0)
    expect(page.state).toEqual(state)
    for (const k of keys) expect(page.dom(k), k).toEqual(dom[k])
    expect(page.log).toEqual([])
    expect(page.clicks).toEqual([])
  })
})
