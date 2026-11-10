// @vitest-environment jsdom
// TASK-4 REQ-3608: 시험용 ERP 화면(__tests__/erpPage.ts, React 18 통제 칸 흉내)에서 칸 찾기·값 넣기·채우기
// TASK-17 REQ-3612·3613: 칸 자리 까닭(locate)·이미 적힌 칸 세기(survey)·[빈 칸만](empty)·되돌리기(undoAll)·짧은 줄 이름(shortPlace)
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allKeys, ETC_NAMES, mountErpPage, sampleDay, settingsAll, settingsFirst, type ErpPageOptions } from './__tests__/erpPage'
import { HELD_SALES, planCells, type Where } from './cells'
import { fillAll, findInput, locate, putValue, shortPlace, survey, undoAll, W1_WAIT_MS, type FillResult } from './fill'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const open = (o: ErpPageOptions = {}) => mountErpPage(document, { etcNames: ETC_NAMES, ...o })

/** 보류 장치가 그대로 도는지 보려고 HELD_SALES를 잠깐 씨암·SONO로 둔다(TASK-15에서 비움). 끝나면 되돌린다 */
function withHeld<T>(run: () => T): T {
  const saved = HELD_SALES.splice(0, HELD_SALES.length, 'carm', 'sono')
  try {
    return run()
  } finally {
    HELD_SALES.splice(0, HELD_SALES.length, ...saved)
  }
}
const fullPlan = () => planCells(sampleDay(), settingsAll())

/** 결과를 수로만(견주기 쉽게) */
const counts = (r: FillResult) => ({
  filled: r.filled,
  kept: r.kept,
  skipped: r.skipped.length,
  unpicked: r.unpicked.length,
  noName: r.noName.length,
  unknown: r.unknown,
  held: r.held,
  undo: r.undo.length,
})
const ALL_FILLED = { filled: 131, kept: 0, skipped: 0, unpicked: 0, noName: 0, unknown: 0, held: 0, undo: 131 }
/** 건너뛴 칸을 '까닭 짧은 줄 이름'으로 */
const skips = (r: FillResult) => r.skipped.map((s) => `${s.skip} ${shortPlace(s.where)}`)

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
  // 씨암·SONO 치료별 매출도 채운다(보류는 TASK-15에서 끝남, HELD_SALES = [])
  CARM_AMT: tot(0),
  SONO_AMT: tot(1),
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
  it('AC-3608.3: 1 탭 화면에서 131칸(1: 32, 2: 99)을 덮어쓰고 React 기억이 칸 표 그대로다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    expect(counts(result)).toEqual(ALL_FILLED)
    for (const [code, value] of Object.entries(EXPECTED)) expect(page.state[code], code).toBe(value)
    // 금액칸은 쉼표와 함께 보인다. 도수·충격파 총금액은 치료별 매출 도수·충격파와 같은 값 하나에 칸이 둘
    expect(page.dom('TOTAL_FEE')).toEqual([money('11668530')])
    expect(page.dom('THR_MANUAL_AMT')).toEqual([money(tot(3)), money(tot(3))])
    expect(page.dom('NEW_PATIENT')).toEqual(['7'])
  })

  it('AC-3608.1 AC-3613.2: 넣지 못한 칸은 그 칸만 건너뛰고 까닭과 함께 적는다(치료사별 입력 줄·다른 기타 이름·없어진 낱칸)', async () => {
    const page = open({ therapistRows: true, etcNames: ['크라이오', '기타2', '기타3', '기타4'] })
    document.querySelectorAll('.cdf-field').forEach((f) => {
      if (f.querySelector('label')?.textContent === 'ESWT Radial') f.remove()
    })
    const result = await fillAll(document, fullPlan())
    expect(skips(result).slice(0, 2)).toEqual(['therapist 치료현황 도수치료', 'therapist 치료현황 충격파(체충)'])
    expect(result.skipped).toContainEqual({ where: { j: 2, card: '치료별 신환/90일초진/재진 건수', row: '체외충격파B', col: '신환' }, skip: 'notFound' })
    expect(skips(result)).toContain('notFound 치료별 매출 테이핑')
    expect(skips(result)).toContain('notFound ESWT Radial')
    expect(result.skipped.filter((s) => s.skip === 'notFound')).toHaveLength(9 + 3 + 1)
    expect(result.skipped).toHaveLength(2 + 9 + 3 + 1)
    expect(result.filled).toBe(131 - result.skipped.length)
    expect(result.undo).toHaveLength(result.filled)
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
    expect(counts(result)).toEqual({ filled: 92, kept: 0, skipped: 0, unpicked: 38, noName: 0, unknown: 1, held: 0, undo: 92 })
    for (const k of ['REFUND', 'LIPUS_CNT', 'RSV:injection:reserved', 'ETC2_AMT', 'ETC4_RET', 'ESWT_STD_CNT', 'INJECTION_ONCE_PATIENT']) {
      expect(page.state[k], k).toBe('9999')
      expect(page.log.some((x) => x.key === k), k).toBe(false)
    }
    expect(page.state.CARM_CNT).toBe('400')
    expect(page.state.ETC1_AMT).toBe(tot(6))
    expect(page.state['RSV:manual:reserved']).toBe('93')
  })

  it('AC-3608.4: 보류 칸(보류 묶음을 씨암·SONO로 둔 때)은 이미 적힌 값 그대로이고 이벤트도 없으며 held에 센다. 같은 묶음 건수 칸은 채운다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, withHeld(() => planCells(sampleDay(), settingsFirst())))
    expect(result.held).toBe(2)
    for (const k of ['CARM_AMT', 'SONO_AMT']) {
      expect(page.state[k], k).toBe('9999')
      expect(page.log.some((x) => x.key === k), k).toBe(false)
    }
    expect(result.skipped).toEqual([])
    expect(result.unpicked.map(shortPlace).filter((m) => m.includes('씨암') || m.includes('SONO'))).toEqual([])
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
    const result = await fillAll(document, withHeld(() => planCells(sampleDay(), settingsFirst())))
    expect(result.skipped).toEqual([])
    expect(result.unpicked).toHaveLength(38)
    expect(result.held).toBe(2)
  })

  it('AC-3608.4: HELD_SALES가 비어 있으면(TASK-15부터) 씨암·SONO 치료별 매출도 채운다(131칸, held 0)', async () => {
    const page = open({ values: PRE })
    expect(HELD_SALES).toEqual([])
    const result = await fillAll(document, fullPlan())
    expect(counts(result)).toEqual(ALL_FILLED)
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
    expect(counts(result)).toEqual(ALL_FILLED)
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
    expect(result.filled).toBe(131)
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
    expect(result.skipped).toHaveLength(32)
    expect(result.skipped.every((x) => x.skip === 'notFound')).toBe(true)
    expect(skips(result)[0]).toBe('notFound 환자현황 신환')
    expect(result.filled).toBe(99)
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
    expect(result.filled).toBe(131)
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
    expect(result.filled).toBe(99)
    expect(page.clicks).toEqual([])
  })

  it('AC-3608.5: fieldset[disabled] 안 칸뿐이면(본사 열람) 아무것도 바꾸지 않는다', async () => {
    const page = open({ readOnly: true, values: PRE })
    const keys = allKeys()
    const state = { ...page.state }
    const dom = Object.fromEntries(keys.map((k) => [k, page.dom(k)]))
    const result = await fillAll(document, fullPlan())
    expect(result.filled).toBe(0)
    expect(result.undo).toEqual([])
    expect(result.skipped).toHaveLength(131)
    expect(result.skipped.every((x) => x.skip === 'locked')).toBe(true)
    expect(page.state).toEqual(state)
    for (const k of keys) expect(page.dom(k), k).toEqual(dom[k])
    expect(page.log).toEqual([])
    expect(page.clicks).toEqual([])
  })
})

describe('AC-3608.1 AC-3613.2 locate: 칸 자리마다 입력칸 또는 넣지 못한 까닭', () => {
  it('AC-3608.1: 찾은 칸은 { input }이고 findInput과 같은 칸이다', () => {
    const page = open()
    const where: Where = { j: 1, box: '환자현황', row: '신환' }
    expect(locate(document, where)).toEqual({ input: page.inputs('NEW_PATIENT')[0] })
    expect(locate(document, { j: 2, field: 'ESWT Standard' })).toEqual({ input: page.inputs('ESWT_STD_CNT')[0] })
  })

  it("AC-3613.2: 줄은 있는데 입력칸 없이 '치료사별 입력'인 줄은 therapist다('치료사별 입력' 표시는 떼고 견줌)", () => {
    open({ therapistRows: true, spaced: true })
    expect(locate(document, { j: 1, box: '진료 · 치료현황', row: '도수치료' })).toEqual({ skip: 'therapist' })
    expect(locate(document, { j: 1, box: '진료 · 치료현황', row: '충격파(체충)' })).toEqual({ skip: 'therapist' })
    expect(findInput(document, { j: 1, box: '진료 · 치료현황', row: '도수치료' })).toBeNull()
  })

  it('AC-3613.2: 화면에 없는 칸·입력칸 없는 계산 줄·둘 이상 맞는 칸은 notFound다', () => {
    open()
    expect(locate(document, { j: 1, box: '외래 수입', row: '총매출' })).toEqual({ skip: 'notFound' })
    expect(locate(document, { j: 2, card: '치료별 매출', row: '없는 줄', col: '금액(원)' })).toEqual({ skip: 'notFound' })
    expect(locate(document, { j: 2, field: '없는 칸' })).toEqual({ skip: 'notFound' })
    const where: Where = { j: 2, card: '예약', row: '경과', col: '내원' }
    const tr = findInput(document, where)?.closest('tr') as HTMLTableRowElement
    tr.after(tr.cloneNode(true))
    expect(locate(document, where)).toEqual({ skip: 'notFound' })
  })

  it('AC-3612.5: disabled·readOnly·fieldset[disabled] 안 칸은 locked다', () => {
    const page = open({ lockedKeys: ['NEW_PATIENT'] })
    expect(locate(document, { j: 1, box: '환자현황', row: '신환' })).toEqual({ skip: 'locked' })
    ;(page.inputs('TOTAL_FEE')[0] as HTMLInputElement).disabled = true
    expect(locate(document, { j: 1, box: '외래 수입', row: '외래 총매출' })).toEqual({ skip: 'locked' })
    document.body.innerHTML = ''
    open({ readOnly: true })
    expect(locate(document, { j: 2, card: '예약', row: '경과', col: '내원' })).toEqual({ skip: 'locked' })
    expect(locate(document, { j: 1, box: '환자현황', row: '신환' })).toEqual({ skip: 'locked' })
  })
})

describe('AC-3613.2 shortPlace: 짧은 줄 이름(design.md 5-1)', () => {
  it.each<[Where, string]>([
    [{ j: 1, box: '환자현황', row: '신환' }, '환자현황 신환'],
    [{ j: 1, box: '진료 · 치료현황', row: '도수치료' }, '치료현황 도수치료'],
    [{ j: 1, box: '외래 수입', row: '감액' }, '외래 수입 감액'],
    [{ j: 1, box: '입원수입', row: '청구' }, '입원수입 청구'],
    [{ j: 2, card: '예약', row: '경과', col: '내원' }, '예약 경과'],
    [{ j: 2, card: '치료별 신환/90일초진/재진 건수', row: '크라이오', col: '90일초진' }, '치료별 건수 크라이오'],
    [{ j: 2, card: '연령별 신환/90일초진/재진', row: '20대', col: '재진' }, '연령별 20대'],
    [{ j: 2, card: '치료별 매출', row: '기타2', col: '금액(원)' }, '치료별 매출 기타2'],
    [{ j: 2, field: 'ESWT Standard' }, 'ESWT Standard'],
    [{ j: 2, field: '도수 총금액' }, '도수 총금액'],
  ])('AC-3613.2: %o → %s (열 이름은 쓰지 않는다)', (where, name) => {
    expect(shortPlace(where)).toBe(name)
  })
})

describe('AC-3612.3 survey: 이미 적힌 칸 세기(기본값 (차))', () => {
  /** 처음 값 설정의 93칸 계획. 신환 7 · 외래 총매출 11,668,530 · 진료수납액 5,571,630 · 카드 4,012,330 */
  const plan = () => planCells(sampleDay(), settingsFirst())
  const W_NEW: Where = { j: 1, box: '환자현황', row: '신환' }
  const W_FEE: Where = { j: 1, box: '외래 수입', row: '외래 총매출' }
  /** 손으로 적은 칸: 다른 값 둘(신환 3 · 외래 총매출 1,234), 같은 값(재진 52 · 진료수납액 5,571,630), 빈 칸으로 보는 값(0 · '-') */
  const HAND = { NEW_PATIENT: '3', TOTAL_FEE: '1234', RETURN_PATIENT: '52', RECEIVED: '5571630', CARD_AMOUNT: '0', TRANSFER_AMOUNT: '-', CASH_AMOUNT: '0' }

  it("AC-3612.3: 숫자가 있고 넣을 값과 다른 칸만 적힌 칸이다('1,234'는 쉼표를 빼고 견줌, 같은 값·''·'-'·0은 세지 않음)", async () => {
    const page = open({ values: HAND })
    expect(page.dom('TOTAL_FEE')).toEqual(['1,234'])
    expect(page.dom('RECEIVED')).toEqual(['5,571,630'])
    expect(page.dom('TRANSFER_AMOUNT')).toEqual(['-'])
    const seen = await survey(document, plan())
    expect(seen.written).toEqual([W_NEW, W_FEE])
    expect(seen.fillable).toBe(93)
    expect(seen.locked).toBe(0)
  })

  it("AC-3612.3: '11,668,530'과 '11668530'은 같은 값이라 세지 않고, 빈칸·nbsp도 떼고 견준다", async () => {
    const page = open({ values: { TOTAL_FEE: '11668530' } })
    expect(page.dom('TOTAL_FEE')).toEqual(['11,668,530'])
    const el = page.inputs('NEW_PATIENT')[0] as HTMLInputElement
    el.setAttribute('type', 'text')
    el.value = ' 7 '
    expect((await survey(document, plan())).written).toEqual([])
  })

  it('AC-3612.3: 고르지 않은 칸·값 없는 칸은 보지 않는다(이미 적혀 있어도)', async () => {
    open({ values: PRE })
    const seen = await survey(document, plan())
    expect(seen.written).toHaveLength(93)
    expect(seen.fillable).toBe(93)
    expect(seen.written.map(shortPlace)).not.toContain('치료현황 리푸스')
  })

  it('AC-3612.3: 세기만 하고 칸·탭·단추를 건드리지 않는다', async () => {
    const page = open({ values: HAND })
    const state = { ...page.state }
    await survey(document, plan())
    expect(page.state).toEqual(state)
    expect(page.log).toEqual([])
    expect(page.clicks).toEqual([])
    expect(page.tab()).toBe('w1')
  })

  it('AC-3612.3 AC-3608.5: 2 탭이면 업무일지 1 탭을 잠깐 눌러 세고 처음 탭(2)으로 돌아온다', async () => {
    const page = open({ tab: 'w2', values: HAND })
    const seen = await survey(document, plan())
    expect(seen.written).toEqual([W_NEW, W_FEE])
    expect(page.clicks).toEqual(['closing-tab-w1', 'closing-tab-w2'])
    expect(page.tab()).toBe('w2')
    expect(page.log).toEqual([])
  })

  it('AC-3612.5: 읽기 전용 화면이면 채울 칸 0 · 잠긴 칸 = 찾은 칸 모두이고 적힌 칸은 세지 않는다', async () => {
    open({ readOnly: true, values: PRE })
    expect(await survey(document, fullPlan())).toEqual({ written: [], fillable: 0, locked: 131 })
  })

  it('AC-3612.3: 일부만 잠기면 잠긴 칸은 적힌 칸에 세지 않는다(넣지 않을 칸이라)', async () => {
    open({ values: HAND, lockedKeys: ['NEW_PATIENT'] })
    const seen = await survey(document, plan())
    expect(seen.written).toEqual([W_FEE])
    expect(seen.fillable).toBe(92)
    expect(seen.locked).toBe(1)
  })
})

describe("AC-3612.3 fillAll(doc, plan, 'empty'): [빈 칸만]", () => {
  const plan = () => planCells(sampleDay(), settingsFirst())
  const HAND = { NEW_PATIENT: '3', TOTAL_FEE: '1234', RETURN_PATIENT: '52', RECEIVED: '5571630', CARD_AMOUNT: '0', TRANSFER_AMOUNT: '-' }

  it('AC-3612.3: 적힌 칸은 그대로 두고 kept에 세며, 빈 칸(0·- 포함)·같은 값 칸은 채운다', async () => {
    const page = open({ values: HAND })
    const result = await fillAll(document, plan(), 'empty')
    expect(result.kept).toBe(2)
    expect(result.filled).toBe(91)
    expect(page.state.NEW_PATIENT).toBe('3')
    expect(page.state.TOTAL_FEE).toBe('1234')
    expect(page.log.some((x) => x.key === 'NEW_PATIENT' || x.key === 'TOTAL_FEE')).toBe(false)
    expect(page.state.CARD_AMOUNT).toBe('4012330')
    expect(page.state.TRANSFER_AMOUNT).toBe('351000')
    expect(page.state.RECEIVED).toBe('5571630')
    expect(page.state.RETURN_PATIENT).toBe('52')
    expect(result.undo).toHaveLength(91)
  })

  it("AC-3612.3: 'all'(기본)이면 적힌 칸도 바꾸고 kept는 0이다", async () => {
    const page = open({ values: HAND })
    const result = await fillAll(document, plan())
    expect(result.kept).toBe(0)
    expect(result.filled).toBe(93)
    expect(page.state.NEW_PATIENT).toBe('7')
    expect(page.state.TOTAL_FEE).toBe('11668530')
  })
})

describe('AC-3613.2 fillAll: 까닭별로 나눠 적는다', () => {
  it('AC-3613.2: 코드를 골랐는데 이름이 빈 기타 줄은 noName에, 고르지 않은 칸은 unpicked에 자리째 적고 건드리지 않는다', async () => {
    const page = open({ values: PRE, etcNames: [ETC_NAMES[0], '기타2', ETC_NAMES[2], ETC_NAMES[3]] })
    const settings = settingsAll()
    settings.etcNames.etc2 = ''
    delete settings.picks.lipus
    const result = await fillAll(document, planCells(sampleDay(), settings))
    expect(result.noName.map(shortPlace)).toEqual(['치료별 건수 기타2', '치료별 건수 기타2', '치료별 건수 기타2', '치료별 매출 기타2'])
    expect(result.unpicked).toEqual([{ j: 1, box: '진료 · 치료현황', row: '리푸스' }])
    expect(result.skipped).toEqual([])
    expect(page.state.ETC2_AMT).toBe('9999')
    expect(page.state.ETC2_NEW).toBe('9999')
    expect(page.state.LIPUS_CNT).toBe('9999')
    expect(result.filled).toBe(131 - 5)
  })

  it('AC-3613.2: 일부 잠긴 칸은 locked로 건너뛰고 나머지는 채운다', async () => {
    const page = open({ values: PRE, lockedKeys: ['NEW_PATIENT', 'CARM_AMT'] })
    const result = await fillAll(document, fullPlan())
    expect(skips(result)).toEqual(['locked 환자현황 신환', 'locked 치료별 매출 씨암'])
    expect(page.state.NEW_PATIENT).toBe('9999')
    expect(page.state.CARM_AMT).toBe('9999')
    expect(result.filled).toBe(129)
  })
})

describe('AC-3612.4 undoAll: 넣은 칸만 넣기 전 글자로', () => {
  it('AC-3612.4: undo에는 실제로 값을 넣은 칸과 넣기 전 화면 글자(금액칸은 쉼표 그대로)가 있다', async () => {
    const page = open({ values: { NEW_PATIENT: '3', TOTAL_FEE: '1234' } })
    const result = await fillAll(document, planCells(sampleDay(), settingsFirst()))
    expect(result.undo).toHaveLength(93)
    const of = (key: string) => result.undo.find((u) => u.input === page.inputs(key)[0])
    expect(of('NEW_PATIENT')?.before).toBe('3')
    expect(of('TOTAL_FEE')?.before).toBe('1,234')
    expect(of('RETURN_PATIENT')?.before).toBe('')
    expect(of('NEW_PATIENT')?.where).toEqual({ j: 1, box: '환자현황', row: '신환' })
    // AC-3618.2: 칸마다 넣은 값(쉼표 없는 글자)도 기억한다
    expect(of('NEW_PATIENT')?.after).toBe('7')
    expect(of('TOTAL_FEE')?.after).toBe('11668530')
    expect(result.undo.every((u) => typeof u.after === 'string' && u.after !== '')).toBe(true)
    // 고르지 않은 칸은 넣지 않았으니 없다
    expect(result.undo.some((u) => u.input === page.inputs('LIPUS_CNT')[0])).toBe(false)
  })

  it("AC-3612.4: 모두 채우기 전 값으로 돌린다(금액칸은 '' → 값 → blur, 같은 값 두 칸인 도수 총금액도)", async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    expect(page.state.TOTAL_FEE).toBe('11668530')
    page.log.length = 0
    expect(await undoAll(document, result.undo)).toEqual({ restored: 131, gone: 0, edited: 0 })
    for (const code of Object.keys(EXPECTED)) expect(page.state[code], code).toBe('9999')
    expect(page.dom('THR_MANUAL_AMT')).toEqual(['9,999', '9,999'])
    expect(page.log.filter((x) => x.key === 'TOTAL_FEE')).toEqual([
      { key: 'TOTAL_FEE', ev: 'input', dom: '' },
      { key: 'TOTAL_FEE', ev: 'input', dom: '9,999' },
      { key: 'TOTAL_FEE', ev: 'blur', dom: '9,999' },
    ])
    expect(page.clicks).toEqual([])
  })

  it('AC-3612.4: 빈 칸이었던 칸은 빈 칸으로, [빈 칸만]으로 그대로 둔 칸은 건드리지 않는다', async () => {
    const page = open({ values: { NEW_PATIENT: '3' } })
    const result = await fillAll(document, planCells(sampleDay(), settingsFirst()), 'empty')
    expect(page.state.RETURN_PATIENT).toBe('52')
    page.log.length = 0
    await undoAll(document, result.undo)
    expect(page.state.RETURN_PATIENT).toBe('')
    expect(page.state.TOTAL_FEE).toBe('')
    expect(page.state.NEW_PATIENT).toBe('3')
    expect(page.log.some((x) => x.key === 'NEW_PATIENT')).toBe(false)
  })

  it('AC-3612.4: 화면에서 없어진 칸은 건너뛰고 gone에 센다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    findInput(document, { j: 2, card: '치료별 매출', row: '물리치료', col: '금액(원)' })?.closest('tr')?.remove()
    expect(await undoAll(document, result.undo)).toEqual({ restored: 130, gone: 1, edited: 0 })
    expect(page.state.PT_AMT).toBe(EXPECTED.PT_AMT)
    expect(page.state.ARTHRO_AMT).toBe('9999')
  })

  it('AC-3612.4 AC-3608.5: 탭을 바꿔 업무일지 1 칸이 새로 그려졌으면 같은 자리를 다시 찾아 돌리고 처음 탭으로 돌아온다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    ;(document.querySelector('#closing-tab-w2') as HTMLElement).click()
    expect(page.inputs('NEW_PATIENT')).toEqual([])
    expect(await undoAll(document, result.undo)).toEqual({ restored: 131, gone: 0, edited: 0 })
    for (const code of Object.keys(EXPECTED)) expect(page.state[code], code).toBe('9999')
    expect(page.clicks).toEqual(['closing-tab-w2', 'closing-tab-w1', 'closing-tab-w2'])
    expect(page.tab()).toBe('w2')
  })

  it('AC-3612.4: 되돌릴 칸이 없으면 아무것도 하지 않는다', async () => {
    const page = open()
    expect(await undoAll(document, [])).toEqual({ restored: 0, gone: 0, edited: 0 })
    expect(page.log).toEqual([])
    expect(page.clicks).toEqual([])
  })
})

describe('AC-3618.2 undoAll: 채운 뒤 손으로 고친 칸은 그대로', () => {
  /** 직원이 손으로 고친 것처럼 넣는다(같은 넣는 법) */
  const typeBy = (input: HTMLInputElement | HTMLTextAreaElement | undefined, value: string) => putValue(input as HTMLInputElement, value)

  it('AC-3618.2: 지금 글자가 넣은 값과 다른 칸은 돌리지 않고 edited에 세며, 나머지는 넣기 전 글자로 돌린다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    typeBy(page.inputs('NEW_PATIENT')[0], '8')
    typeBy(page.inputs('TOTAL_FEE')[0], '12000000')
    page.log.length = 0
    expect(await undoAll(document, result.undo)).toEqual({ restored: 129, gone: 0, edited: 2 })
    expect(page.state.NEW_PATIENT).toBe('8')
    expect(page.state.TOTAL_FEE).toBe('12000000')
    expect(page.state.FIRST90_PATIENT).toBe('9999')
    expect(page.state.ARTHRO_AMT).toBe('9999')
    expect(page.log.some((x) => x.key === 'NEW_PATIENT' || x.key === 'TOTAL_FEE')).toBe(false)
  })

  it("AC-3618.2: 금액칸이 쉼표와 함께 보여도('11,668,530') 넣은 값('11668530')과 같은 값이라 돌린다", async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    expect(page.dom('TOTAL_FEE')).toEqual(['11,668,530'])
    expect(await undoAll(document, result.undo)).toEqual({ restored: 131, gone: 0, edited: 0 })
    expect(page.state.TOTAL_FEE).toBe('9999')
  })

  it("AC-3618.2: 넣은 값이 0이면 지금 글자 ''·'-'도 같은 값으로 보고 돌린다", async () => {
    const page = open({ values: { INPAT_CLAIM: '5' } })
    const result = await fillAll(document, planCells(sampleDay(), settingsFirst()))
    const entry = result.undo.find((u) => u.input === page.inputs('INPAT_CLAIM')[0])
    expect(entry?.after).toBe('0')
    for (const shown of ['', '-']) {
      const input = page.inputs('INPAT_CLAIM')[0] as HTMLInputElement
      input.value = shown
      expect(await undoAll(document, entry ? [entry] : []), JSON.stringify(shown)).toEqual({ restored: 1, gone: 0, edited: 0 })
    }
    expect(page.state.INPAT_CLAIM).toBe('5')
  })

  it('AC-3618.2 AC-3612.4: 새로 그려진 업무일지 1 칸도 같은 자리로 다시 찾고, 그 칸을 손으로 고쳤으면 그대로 둔다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    ;(document.querySelector('#closing-tab-w2') as HTMLElement).click()
    ;(document.querySelector('#closing-tab-w1') as HTMLElement).click()
    // 업무일지 1 칸은 다음 차례에 다시 그려진다
    await new Promise((done) => setTimeout(done, 0))
    typeBy(page.inputs('NEW_PATIENT')[0], '8')
    ;(document.querySelector('#closing-tab-w2') as HTMLElement).click()
    expect(page.inputs('NEW_PATIENT')).toEqual([])
    expect(await undoAll(document, result.undo)).toEqual({ restored: 130, gone: 0, edited: 1 })
    expect(page.state.NEW_PATIENT).toBe('8')
    expect(page.state.FIRST90_PATIENT).toBe('9999')
    expect(page.tab()).toBe('w2')
  })

  it('AC-3618.2: 같은 값을 두 칸이 보이는 도수 총금액은 손으로 고쳤으면 두 칸 모두 그대로 둔다', async () => {
    const page = open({ values: PRE })
    const result = await fillAll(document, fullPlan())
    typeBy(page.inputs('THR_MANUAL_AMT')[0], '5000')
    const done = await undoAll(document, result.undo)
    expect(done).toEqual({ restored: 129, gone: 0, edited: 2 })
    expect(page.state.THR_MANUAL_AMT).toBe('5000')
  })
})
