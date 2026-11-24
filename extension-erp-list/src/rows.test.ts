// spec erp-copy-list TASK-2(REQ-3904): 날마다 받은 답 + 설정 → 목록 모양(rows.ts buildList·dayChoice, design.md 4절)
// - 줄 차례: 업무일지 1(SCREEN_BOXES = ERP 화면 차례, 상자 안은 planCells 차례) → 업무일지 2(planCells 차례 그대로)
// - 칸 값·까닭은 지금 planCells 그대로, 경고 줄은 지금 warningLines 그대로, 씨암·SONO 줄은 지금 글 그대로
// 가짜 답은 지금 시험 도우미(sampleDay)의 숫자를 날짜·값만 바꾼 사흘(2026-11-01 일 ~ 2026-11-03 화)이다. 환자 정보는 없다
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ETC_NAMES, sampleDay, settingsAll } from '../../extension-erp/src/__tests__/erpPage'
import { planCells, type Planned, type Where } from '../../extension-erp/src/cells'
import { OVERLAP_TEXT, warningLines } from '../../extension-erp/src/panel'
import { RANGE_TEXT } from '../../extension-erp/src/rangeView'
import { defaults } from '../../extension-erp/src/settings'
import type { ClosingDay, OverlapChoice, Settings } from '../../extension-erp/src/types'
import { LIST_TEXT, SCREEN_BOXES, type ListCell, type ListLine, type ListModel } from './listTypes'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// rows.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const load = () => import('./rows')

type Row = Extract<ListLine, { kind: 'row' }>

/** 숫자 칸만 바꾼 복사본(글자·참거짓·null은 그대로) */
function mapNumbers<T>(value: T, f: (n: number) => number): T {
  if (typeof value === 'number') return f(value) as T
  if (Array.isArray(value)) return value.map((v) => mapNumbers(v, f)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapNumbers(v, f)])) as T
  }
  return value
}

/**
 * sampleDay를 그 날짜로 옮긴 답. bump가 숫자면 숫자 칸마다 +bump, null이면 숫자 칸이 모두 0(진료 0건인 날).
 * 경고는 없게 둔다(환불 0 · 입원 0 · 경고 칸 모두 거짓/0). 함께 있는 진료(overlap)는 없다
 */
function dayOf(date: string, bump: number | null): ClosingDay {
  const day = mapNumbers(sampleDay(), (n) => (bump === null ? 0 : n + bump))
  day.date = date
  day.money.refund = 0
  day.inpatientVisits = 0
  day.overlap = null
  day.warnings = { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false }
  return day
}

/** 시안과 같은 사흘: 11/1(일) 진료 0건 · 11/2(월) · 11/3(화) */
function threeDays(): ClosingDay[] {
  return [dayOf('2026-11-01', null), dayOf('2026-11-02', 1), dayOf('2026-11-03', 2)]
}

const keyOf = (where: Where) => JSON.stringify(where)
const rowsOf = (model: ListModel): Row[] => model.lines.filter((l): l is Row => l.kind === 'row')
const heads = (model: ListModel) => model.lines.filter((l) => l.kind !== 'row')

/** 그 묶음(짧은 이름)·줄 이름(·열)의 숫자 줄 하나 */
function rowNamed(model: ListModel, section: string, name: string, col: string | null = null): Row {
  const found = rowsOf(model).filter((r) => r.section === section && r.name === name && r.col === col)
  if (found.length !== 1) throw new Error(`${section} ${name} ${col ?? ''} 줄이 ${found.length}개`)
  return found[0]
}

/** planCells 칸 하나 → 표 칸 모양 */
const cellOf = (p: Planned): ListCell => (p.why ? { why: p.why } : { value: p.value as string })

/** planCells 계획에서 칸 자리로 찾기 */
function plannedAt(plan: Planned[], key: string): Planned {
  const found = plan.find((p) => keyOf(p.where) === key)
  if (!found) throw new Error(`계획에 ${key}가 없다`)
  return found
}

/** 표 머리 줄 사이의 숫자 줄 묶음(머리 글자 → 줄 key들) */
function blocks(model: ListModel): { head: string; keys: string[] }[] {
  const out: { head: string; keys: string[] }[] = []
  for (const line of model.lines) {
    if (line.kind === 'section') out.push({ head: line.text, keys: [] })
    else if (line.kind === 'row') out[out.length - 1].keys.push(line.key)
  }
  return out
}

/** 칸 자리 → 표 머리(업무일지 1 상자 · 업무일지 2 묶음 · 낱칸은 '운영 지표') */
const headOf = (where: Where) => ('box' in where ? where.box : 'card' in where ? where.card : LIST_TEXT.ops)

// --- 시험이 따로 적어 둔 줄 이름(cells.ts 글자, 시안 notes.md '줄' 절 차례) ---
const CARE = ['씨암', 'SONO', '도수상담', '도수치료', '충격파(체충)', '관절조영술', '리푸스', '손발톱케어', 'CT', '수술']
const MONEY = [
  '외래 총매출',
  '청구액(-)',
  '미수입금(+)',
  '미수발생(-)',
  '비급여',
  '감액',
  '장애인기금(-)',
  '진료수납액',
  '카드수납액(-)',
  '현금수납액(-)',
  '계좌이체액(-)',
  '현불/환불(-)',
]
const INPATIENT = ['청구', '비급여', '본인부담금', '수납액']
const PATIENTS = ['신환', '90일초진', '재진', '물리치료내원', '진찰료 산정안함', '합계']
const RSV_NAMES = ['주사', '경과', '도수', '충격파', '진료예약', '기타(수액,드레싱등)']
const RSV_COLS = ['총갯수', '내원', '변경', '취소']
const THREE = ['신환', '90일초진', '재진']
const COUNTS = ['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파']
const AGES = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
const OPS = ['도수 총금액', '충격파 총금액', 'ESWT Standard', 'ESWT Radial', '주사1회환자', '신환주사환자', '신환주사건수']
const SALES = ['씨암', 'SONO', '관절조영', '도수', '충격파', '물리치료']

/** 숫자 줄 [묶음 짧은 이름, 줄 이름, 열 이름] 차례. etc = 기타1~4 줄 이름 */
function expectedRows(etc: readonly string[]): [string, string, string | null][] {
  return [
    ...CARE.map((n): [string, string, null] => ['치료현황', n, null]),
    ...MONEY.map((n): [string, string, null] => ['외래 수입', n, null]),
    ...INPATIENT.map((n): [string, string, null] => ['입원수입', n, null]),
    ...PATIENTS.map((n): [string, string, null] => ['환자현황', n, null]),
    ...RSV_NAMES.flatMap((n) => RSV_COLS.map((c): [string, string, string] => ['예약', n, c])),
    ['예약', '실예약환자수', null],
    ...[...COUNTS, ...etc].flatMap((n) => THREE.map((c): [string, string, string] => ['치료별 건수', n, c])),
    ...AGES.flatMap((n) => THREE.map((c): [string, string, string] => ['연령별', n, c])),
    ...OPS.map((n): [string, string, null] => ['운영 지표', n, null]),
    ...[...SALES, ...etc].map((n): [string, string, null] => ['치료별 매출', n, null]),
  ]
}

describe('AC-3904.1 줄 차례·머리·줄 이름', () => {
  it("AC-3904.1: 머리 줄 차례는 '업무일지 1' → 진료 · 치료현황 → 외래 수입 → 입원수입 → 환자현황 → '업무일지 2' → 예약 → 치료별 건수 → 연령별 → '운영 지표' → 치료별 매출(sub '금액(원)')", async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), defaults())
    expect(model.lines[0]).toStrictEqual({ kind: 'journal', text: '업무일지 1' })
    expect(heads(model)).toStrictEqual([
      { kind: 'journal', text: LIST_TEXT.journal1 },
      { kind: 'section', text: '진료 · 치료현황' },
      { kind: 'section', text: '외래 수입' },
      { kind: 'section', text: '입원수입' },
      { kind: 'section', text: '환자현황' },
      { kind: 'journal', text: LIST_TEXT.journal2 },
      { kind: 'section', text: '예약' },
      { kind: 'section', text: '치료별 신환/90일초진/재진 건수' },
      { kind: 'section', text: '연령별 신환/90일초진/재진' },
      { kind: 'section', text: LIST_TEXT.ops },
      { kind: 'section', text: '치료별 매출', sub: LIST_TEXT.salesSub },
    ])
    expect(LIST_TEXT.ops).toBe('운영 지표')
    expect(LIST_TEXT.salesSub).toBe('금액(원)')
    // 업무일지 머리 바로 뒤는 상자 머리다(업무일지 머리 줄에는 숫자 줄이 붙지 않는다)
    model.lines.forEach((line, i) => {
      if (line.kind === 'journal') expect(model.lines[i + 1].kind, line.text).toBe('section')
    })
  })

  it('AC-3904.1: 처음 값 설정(defaults())이면 날마다 131칸(업무일지 1 32 + 업무일지 2 99), 상자마다 10 · 12 · 4 · 6 · 25 · 27 · 30 · 7 · 10줄', async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), defaults())
    expect(model.rowCount).toBe(131)
    expect(rowsOf(model)).toHaveLength(131)
    expect(blocks(model).map((b) => b.keys.length)).toEqual([10, 12, 4, 6, 25, 27, 30, 7, 10])
    const j2 = model.lines.findIndex((l) => l.kind === 'journal' && l.text === LIST_TEXT.journal2)
    expect(model.lines.slice(0, j2).filter((l) => l.kind === 'row')).toHaveLength(32)
    expect(model.lines.slice(j2).filter((l) => l.kind === 'row')).toHaveLength(99)
  })

  it('AC-3904.1: 업무일지 1은 SCREEN_BOXES 차례로 상자마다 planCells 차례, 업무일지 2는 planCells 차례 그대로이고 줄 key = JSON.stringify(칸 자리)', async () => {
    const { buildList } = await load()
    for (const settings of [defaults(), settingsAll()]) {
      const days = threeDays()
      const model = buildList(days, settings)
      const plan = planCells(days[0], settings)
      const j1 = SCREEN_BOXES.flatMap((box) => plan.filter((p) => p.where.j === 1 && p.where.box === box).map((p) => keyOf(p.where)))
      const j2 = plan.filter((p) => p.where.j === 2).map((p) => keyOf(p.where))
      expect(rowsOf(model).map((r) => r.key)).toEqual([...j1, ...j2])
      // 머리 아래 줄은 그 상자·묶음 칸들이 planCells 차례 그대로다(빠지거나 남는 칸 없음)
      for (const block of blocks(model)) {
        expect(block.keys, block.head).toEqual(plan.filter((p) => headOf(p.where) === block.head).map((p) => keyOf(p.where)))
      }
    }
  })

  it("AC-3904.1: 줄 이름·열 이름·묶음 짧은 이름 — 업무일지 1·운영 지표·치료별 매출·'실예약환자수'는 열 없음, 기타 줄은 설정의 ERP 줄 이름", async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), settingsAll())
    expect(rowsOf(model).map((r) => [r.section, r.name, r.col])).toEqual(expectedRows(ETC_NAMES))
    expect(ETC_NAMES).toEqual(['크라이오', '체외충격파B', '수액', '테이핑'])
  })

  it("AC-3904.1: 빈 기타 이름 → '기타N' 줄(고르지 않은 기타 · 코드는 골랐는데 이름이 빈 기타 둘 다)", async () => {
    const { buildList } = await load()
    // 처음 값: 기타1 = 크라이오(고름), 기타2~4는 고르지 않았고 이름도 비었다
    const first = buildList(threeDays(), defaults())
    expect(rowsOf(first).map((r) => [r.section, r.name, r.col])).toEqual(expectedRows(['크라이오', '기타2', '기타3', '기타4']))
    // 기타2를 골랐는데 이름이 비면 그 줄도 '기타2'
    const settings = defaults()
    settings.picks.etc2 = ['X1']
    const named = buildList(threeDays(), settings)
    expect(rowsOf(named).map((r) => [r.section, r.name, r.col])).toEqual(expectedRows(['크라이오', '기타2', '기타3', '기타4']))
  })

  it('AC-3904.1: 답이 하루뿐이어도 같은 줄이고 칸은 하나씩이다', async () => {
    const { buildList } = await load()
    const model = buildList([dayOf('2026-11-02', 1)], settingsAll())
    expect(model.rowCount).toBe(131)
    expect(model.days).toEqual([{ date: '2026-11-02', zero: false }])
    for (const row of rowsOf(model)) expect(row.cells, row.key).toHaveLength(1)
  })
})

describe('AC-3904.2 열은 날짜 하나씩, 칸 값은 planCells 값 글자 그대로', () => {
  it('AC-3904.2: from·to·days는 받은 날짜 차례 그대로다', async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), settingsAll())
    expect(model.from).toBe('2026-11-01')
    expect(model.to).toBe('2026-11-03')
    expect(model.days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })

  it('AC-3904.2: 날마다 칸 = 그날 planCells(day, settings) 칸(값 글자 그대로 · 까닭), 칸 수 = 날 수', async () => {
    const { buildList } = await load()
    for (const settings of [defaults(), settingsAll()]) {
      const days = threeDays()
      const model = buildList(days, settings)
      const plans = days.map((day) => planCells(day, settings))
      for (const row of rowsOf(model)) {
        expect(row.cells, row.key).toEqual(plans.map((plan) => cellOf(plannedAt(plan, row.key))))
      }
      // 날마다 칸 key 차례가 같다(줄마다 날짜 칸 하나씩, 빠진 칸·남는 칸 없음)
      for (const plan of plans) expect(plan.map((p) => keyOf(p.where)).sort()).toEqual(rowsOf(model).map((r) => r.key).sort())
    }
  })

  it("AC-3904.2: 숫자 칸 글은 쉼표 없는 정수(예: 외래 총매출 '11668531', 진료수납액 '5571632')", async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), settingsAll())
    expect(rowNamed(model, '외래 수입', '외래 총매출').cells).toEqual([{ value: '0' }, { value: '11668531' }, { value: '11668532' }])
    expect(rowNamed(model, '외래 수입', '진료수납액').cells[2]).toEqual({ value: '5571632' })
    expect(rowNamed(model, '치료별 매출', '씨암').cells[1]).toEqual({ value: '1001235' })
    for (const row of rowsOf(model)) {
      for (const cell of row.cells) if ('value' in cell) expect(cell.value, row.key).toMatch(/^\d+$/)
    }
  })

  it('AC-3904.2: 답이 비면 throw', async () => {
    const { buildList } = await load()
    expect(() => buildList([], settingsAll())).toThrow()
  })
})

describe('AC-3904.2 어느 날 칸 key 차례가 첫날과 다르면 throw(흐름이 E-BRIDGE-BAD-REPLY로 보인다)', () => {
  afterEach(() => {
    vi.doUnmock('../../extension-erp/src/cells')
    vi.resetModules()
  })

  async function withPlan(change: (plan: Planned[]) => Planned[]) {
    vi.resetModules()
    vi.doMock('../../extension-erp/src/cells', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../extension-erp/src/cells')>()
      return {
        ...real,
        planCells: (...args: Parameters<typeof real.planCells>) => {
          const plan = real.planCells(...args)
          return args[0].date === '2026-11-02' ? change(plan) : plan
        },
      }
    })
    return (await import('./rows')).buildList
  }

  it('AC-3904.2: 둘째 날 칸이 하나 빠지면 throw', async () => {
    const buildList = await withPlan((plan) => plan.slice(1))
    expect(() => buildList(threeDays(), settingsAll())).toThrow()
  })

  it('AC-3904.2: 둘째 날 칸 차례가 바뀌면 throw', async () => {
    const buildList = await withPlan((plan) => [plan[1], plan[0], ...plan.slice(2)])
    expect(() => buildList(threeDays(), settingsAll())).toThrow()
  })

  it('AC-3904.2: (대조) 바꾸지 않으면 throw하지 않는다', async () => {
    const buildList = await withPlan((plan) => plan)
    expect(buildList(threeDays(), settingsAll()).rowCount).toBe(131)
  })
})

describe('AC-3904.3 빈 칸 까닭', () => {
  /**
   * 까닭 셋이 나오는 사흘: 예약 기타 줄 고르지 않음(unpicked) · 11/2 미수입금(+) null과 11/3 리푸스 묶음 없음(어떤 날만 unknown) ·
   * 주사1회환자 날마다 null(모든 날 unknown) · 기타2 이름 빔(noName)
   */
  function mixed(): { days: ClosingDay[]; settings: Settings } {
    const settings = settingsAll()
    delete settings.reservations.etc
    settings.etcNames.etc2 = ''
    const days = threeDays()
    days[1].money.receivableIn = null
    days[2].groups = days[2].groups.filter((g) => g.key !== 'lipus')
    for (const day of days) if (day.injection) day.injection.firstTime = null
    return { days, settings }
  }

  it("AC-3904.3: 고르지 않은 묶음 줄은 모든 날 { why: 'unpicked' }이고 rowWhy 'unpicked'", async () => {
    const { buildList } = await load()
    const { days, settings } = mixed()
    const model = buildList(days, settings)
    for (const col of RSV_COLS) {
      const row = rowNamed(model, '예약', '기타(수액,드레싱등)', col)
      expect(row.cells).toEqual([{ why: 'unpicked' }, { why: 'unpicked' }, { why: 'unpicked' }])
      expect(row.rowWhy).toBe('unpicked')
    }
    // 처음 값 설정의 고르지 않은 줄(수술)도 같다
    const first = buildList(threeDays(), defaults())
    expect(rowNamed(first, '치료현황', '수술').rowWhy).toBe('unpicked')
  })

  it("AC-3904.3: 어떤 날만 값이 null이거나 묶음이 답에 없으면 그날 칸만 { why: 'unknown' }이고 rowWhy null", async () => {
    const { buildList } = await load()
    const { days, settings } = mixed()
    const model = buildList(days, settings)
    const recv = rowNamed(model, '외래 수입', '미수입금(+)')
    expect(recv.cells).toEqual([{ value: '0' }, { why: 'unknown' }, { value: '35002' }])
    expect(recv.rowWhy).toBeNull()
    const lipus = rowNamed(model, '치료현황', '리푸스')
    expect(lipus.cells).toEqual([{ value: '0' }, { value: '412' }, { why: 'unknown' }])
    expect(lipus.rowWhy).toBeNull()
  })

  it("AC-3904.3: 모든 날 셀 수 없는 줄은 rowWhy 'unknown'", async () => {
    const { buildList } = await load()
    const { days, settings } = mixed()
    const row = rowNamed(buildList(days, settings), '운영 지표', '주사1회환자')
    expect(row.cells).toEqual([{ why: 'unknown' }, { why: 'unknown' }, { why: 'unknown' }])
    expect(row.rowWhy).toBe('unknown')
  })

  it("AC-3904.3: 코드는 골랐는데 ERP 줄 이름이 빈 기타 줄은 '기타N' 이름에 rowWhy 'noName'(치료별 건수 3줄 · 치료별 매출 1줄)", async () => {
    const { buildList } = await load()
    const { days, settings } = mixed()
    const model = buildList(days, settings)
    const noName = rowsOf(model).filter((r) => r.rowWhy === 'noName')
    expect(noName.map((r) => [r.section, r.name, r.col])).toEqual([
      ['치료별 건수', '기타2', '신환'],
      ['치료별 건수', '기타2', '90일초진'],
      ['치료별 건수', '기타2', '재진'],
      ['치료별 매출', '기타2', null],
    ])
    for (const row of noName) expect(row.cells).toEqual([{ why: 'noName' }, { why: 'noName' }, { why: 'noName' }])
  })

  it('AC-3904.3: 값이 있는 줄은 rowWhy null', async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), settingsAll())
    for (const row of rowsOf(model)) expect(row.rowWhy, row.key).toBeNull()
  })

  it("AC-3904.3: reasons는 나온 까닭만 WHY_ORDER 차례(줄에 나온 차례가 unknown → unpicked → noName이어도 ['unpicked', 'unknown', 'noName'])", async () => {
    const { buildList } = await load()
    const { days, settings } = mixed()
    expect(buildList(days, settings).reasons).toEqual(['unpicked', 'unknown', 'noName'])
    expect(buildList(threeDays(), settingsAll()).reasons).toEqual([])
    expect(buildList(threeDays(), defaults()).reasons).toEqual(['unpicked'])
    // 어떤 날만 나온 까닭도 든다
    const one = threeDays()
    one[1].money.receivableIn = null
    expect(buildList(one, settingsAll()).reasons).toEqual(['unknown'])
  })
})

describe('AC-3904.4 진료 0건인 날', () => {
  it("AC-3904.4: patients.total 0인 날만 zero 참이고, 그날 값은 그대로('0' 포함)", async () => {
    const { buildList } = await load()
    const model = buildList(threeDays(), settingsAll())
    expect(model.days).toEqual([
      { date: '2026-11-01', zero: true },
      { date: '2026-11-02', zero: false },
      { date: '2026-11-03', zero: false },
    ])
    expect(rowNamed(model, '환자현황', '합계').cells[0]).toEqual({ value: '0' })
    for (const row of rowsOf(model)) expect(row.cells[0], row.key).toEqual({ value: '0' })
  })

  it('AC-3904.4: 진료 0건은 patients.total로만 본다(다른 값이 있어도 그 값 그대로, 합계가 있으면 다른 칸이 0이어도 zero 거짓)', async () => {
    const { buildList } = await load()
    const zero = dayOf('2026-11-01', null)
    zero.reservations.patients = 4
    const busy = dayOf('2026-11-02', null)
    busy.patients.total = 1
    const model = buildList([zero, busy], settingsAll())
    expect(model.days).toEqual([
      { date: '2026-11-01', zero: true },
      { date: '2026-11-02', zero: false },
    ])
    expect(rowNamed(model, '예약', '실예약환자수').cells).toEqual([{ value: '4' }, { value: '0' }])
  })
})

describe('AC-3904.5 경고 줄', () => {
  it("AC-3904.5: warnings는 날짜 차례 · 날 안에서 warningLines 차례이고 '{M/D}: {글}' 꼴이다", async () => {
    const { buildList } = await load()
    const days = threeDays()
    days[1].warnings.unpaidVisits = 2
    days[1].warnings.unknownAge = 3
    days[2].warnings.moneyUnconfirmed = true
    days[2].money.refund = 33_000
    days[2].inpatientVisits = 1
    const model = buildList(days, settingsAll())
    expect(model.warnings).toEqual([
      ...warningLines(days[1]).map((line) => `11/2: ${line}`),
      ...warningLines(days[2]).map((line) => `11/3: ${line}`),
    ])
    expect(model.warnings).toHaveLength(5)
    expect(model.warnings[0]).toBe('11/2: 수납이 끝나지 않은 진료 2건이 있어요.')
    expect(model.warnings[1]).toBe('11/2: 생년월일이 없는 환자 3명은 연령별 표에 넣지 않았어요.')
    expect(model.warnings[3]).toBe('11/3: 환불 33,000원이 있어요. 금액을 확인해 주세요.')
    expect(model.warnings[4]).toBe('11/3: 입원 접수가 있어 입원수입 칸은 채우지 않았어요.')
    for (const line of model.warnings) expect(line).toMatch(/^\d{1,2}\/\d{1,2}: \S/)
  })

  it('AC-3904.5: 경고 없는 사흘이면 빈 배열', async () => {
    const { buildList } = await load()
    const days = threeDays()
    for (const day of days) expect(warningLines(day)).toEqual([])
    expect(buildList(days, settingsAll()).warnings).toEqual([])
  })
})

describe('AC-3904.6 씨암·SONO 함께 있는 진료(dayChoice·overlap)', () => {
  const SONO_SALES = keyOf({ j: 2, card: '치료별 매출', row: 'SONO', col: '금액(원)' })
  const CARM_SALES = keyOf({ j: 2, card: '치료별 매출', row: '씨암', col: '금액(원)' })
  const valueAt = (plan: Planned[], key: string) => cellOf(plannedAt(plan, key))
  const cellAt = (model: ListModel, key: string, day: number) => {
    const row = rowsOf(model).find((r) => r.key === key)
    if (!row) throw new Error(`${key} 줄이 없다`)
    return row.cells[day]
  }
  const withChoice = (choice?: OverlapChoice): Settings => {
    const settings = settingsAll()
    if (choice) settings.overlap = choice
    return settings
  }

  it("AC-3904.6: 묻는 날 + settings.overlap 'carm' → 그날 SONO 매출은 planCells(day, s, 'carm') 값, 줄은 '…지난번 고른 대로 씨암에 넣어요.'", async () => {
    const { buildList, dayChoice } = await load()
    const settings = withChoice('carm')
    const days = threeDays()
    days[1].overlap = { visits: 3, carm: 50_000, sono: 40_000, shared: 40_000 }
    expect(dayChoice(days[1], settings)).toBe('carm')
    const model = buildList(days, settings)
    const carmPlan = planCells(days[1], settings, 'carm')
    expect(cellAt(model, SONO_SALES, 1)).toEqual(valueAt(carmPlan, SONO_SALES))
    // SONO 매출(sampleDay 2,001,234 + 1) − 씨암에 넣기로 한 함께 있는 진료의 SONO 쪽 40,000
    expect(cellAt(model, SONO_SALES, 1)).toEqual({ value: String(2_001_234 + 1 - 40_000) })
    expect(cellAt(model, SONO_SALES, 1)).not.toEqual(valueAt(planCells(days[1], settings), SONO_SALES))
    expect(cellAt(model, CARM_SALES, 1)).toEqual(valueAt(carmPlan, CARM_SALES))
    expect(model.overlap).toBe(RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into.carm))
    expect(model.overlap).toBe('씨암·SONO를 같이 받은 진료는 지난번 고른 대로 씨암에 넣어요.')
  })

  it("AC-3904.6: 지난번 고른 것이 'sono'·'both'면 그 고른 것으로 셈하고 그 글을 쓴다", async () => {
    const { buildList, dayChoice } = await load()
    for (const choice of ['sono', 'both'] as const) {
      const settings = withChoice(choice)
      const days = threeDays()
      days[2].overlap = { visits: 2, carm: 30_000, sono: 20_000, shared: 20_000 }
      expect(dayChoice(days[2], settings)).toBe(choice)
      const model = buildList(days, settings)
      const plan = planCells(days[2], settings, choice)
      expect(cellAt(model, CARM_SALES, 2), choice).toEqual(valueAt(plan, CARM_SALES))
      expect(cellAt(model, SONO_SALES, 2), choice).toEqual(valueAt(plan, SONO_SALES))
      expect(model.overlap).toBe(RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into[choice]))
    }
  })

  it("AC-3904.6: 묻는 날 + 고른 것 없음 → 값은 planCells(day, s)(둘 다 넣은 값), 줄은 OVERLAP_TEXT.done(K, 'both')(K = 묻는 날 visits 합)", async () => {
    const { buildList, dayChoice } = await load()
    const settings = withChoice()
    const days = threeDays()
    days[0].overlap = { visits: 5, carm: 1_000, sono: 2_000, shared: 0 } // 두 번 센 돈이 없어 묻지 않는 날(K에 안 듦)
    days[1].overlap = { visits: 3, carm: 50_000, sono: 40_000, shared: 40_000 }
    days[2].overlap = { visits: 4, carm: 10_000, sono: 9_000, shared: 1_000 }
    for (const day of days) expect(dayChoice(day, settings), day.date).toBeUndefined()
    const model = buildList(days, settings)
    days.forEach((day, i) => {
      const plan = planCells(day, settings)
      expect(cellAt(model, SONO_SALES, i), day.date).toEqual(valueAt(plan, SONO_SALES))
      expect(cellAt(model, CARM_SALES, i), day.date).toEqual(valueAt(plan, CARM_SALES))
    })
    expect(model.overlap).toBe(OVERLAP_TEXT.done(7, 'both'))
    expect(model.overlap).toBe('함께 있는 진료 7건은 씨암·SONO 둘 다에 넣었어요.')
  })

  it('AC-3904.6: 묻지 않는 날은 settings.overlap이 있어도 고른 것 없음 값이고, 묻는 날이 없으면 overlap null', async () => {
    const { buildList, dayChoice } = await load()
    const settings = withChoice('carm')
    const days = threeDays()
    days[2].overlap = { visits: 2, carm: 1_000, sono: 2_000, shared: 0 }
    expect(dayChoice(days[0], settings)).toBeUndefined() // overlap null
    expect(dayChoice(days[2], settings)).toBeUndefined() // 두 번 센 돈 0
    const model = buildList(days, settings)
    expect(cellAt(model, SONO_SALES, 2)).toEqual(valueAt(planCells(days[2], settings), SONO_SALES))
    expect(cellAt(model, SONO_SALES, 2)).not.toEqual(valueAt(planCells(days[2], settings, 'carm'), SONO_SALES))
    expect(model.overlap).toBeNull()
    expect(buildList(threeDays(), withChoice()).overlap).toBeNull()
  })

  it('AC-3904.6: 두 번 센 돈(shared) 칸이 없는 옛 도우미 답이면 설정만 보고(씨암·SONO 돈 코드가 겹칠 때만) 묻는 날이다', async () => {
    const { buildList, dayChoice } = await load()
    const shared = withChoice('sono')
    shared.picks.sono = ['C-sono', 'C-carm']
    const apart = withChoice('sono')
    const day = dayOf('2026-11-02', 1)
    day.overlap = { visits: 2, carm: 1_000, sono: 2_000 }
    expect(dayChoice(day, shared)).toBe('sono')
    expect(dayChoice(day, apart)).toBeUndefined()
    expect(buildList([day], shared).overlap).toBe(RANGE_TEXT.confirm.overlapLast(OVERLAP_TEXT.into.sono))
    expect(buildList([day], apart).overlap).toBeNull()
  })

  it('AC-3904.6: rows.ts는 고른 것을 저장하지 않는다(saveOverlap을 부르지 않음, 글자 검사)', () => {
    const code = readFileSync(path.join(HERE, 'rows.ts'), 'utf8')
    expect(code).not.toMatch(/saveOverlap/)
  })
})
