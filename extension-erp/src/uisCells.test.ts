// TASK-5 (spec erp-uisarang) design.md 6-1·6-2·8-4·10-2: 의사랑 답 + 설정 → ERP 칸(uisCells·planUisCells), 답 검사(readUisDay),
// 멈춤 판정(stopOf), 읽지 못한 칸 까닭·맞춰 보기 경고 줄. 화면은 보지 않는다. 숫자는 시안 예시 관계로 지은 값(환자 정보 없음)
import { describe, expect, it } from 'vitest'
import { sampleDay } from './__tests__/erpPage'
import { planCells, type Planned, type Where } from './cells'
import { defaults } from './settings'
import { GROUP_NAMES, RSV_NAMES, RSV_ROWS } from './types'
import { checkLines, planUisCells, readUisDay, stopOf, uisCells, unreadLines, type UisCell } from './uisCells'
import { UIS_REPORT_NAMES, UIS_TEXT } from './uisText'
import { UIS_COUNT_KEYS, UIS_KINDS, UIS_SALES_KEYS } from './uisTypes'
import type { UisCountKey, UisDay, UisKind, UisReport, UisSalesKey, UisSettings } from './uisTypes'

const DAY = '2026-11-23'

/** 칸 하나를 글자 열쇠로: 1|구역|줄 · 2|묶음|줄|열 · 2|낱칸 (cells.test.ts와 같은 꼴) */
function key(w: Where): string {
  if (w.j === 1) return `1|${w.box}|${w.row}`
  if ('field' in w) return `2|${w.field}`
  return `2|${w.card}|${w.row}|${w.col}`
}
/** 칸 → 값 글자, 비운 칸은 그 까닭(missing은 'missing:{보고서}') */
function sheet(cells: readonly UisCell[]): Record<string, string> {
  return Object.fromEntries(
    cells.map((c) => [key(c.where), c.why === 'missing' ? `missing:${c.report}` : c.why ? c.why : (c.value as string)]),
  )
}
const pick = (all: Record<string, string>, prefix: string) => Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(prefix)))
const find = (cells: readonly UisCell[], k: string) => cells.find((c) => key(c.where) === k)

// --- 시안 예시 숫자 답(notes.md '예시 숫자 관계') ---

const COUNTS: Record<UisCountKey, number> = {
  carm: 12,
  sono: 9,
  arthro: 3,
  manual: 15,
  eswt: 8,
  manualConsult: 4,
  lipus: 2,
  nail: 1,
  ct: 0,
  surgery: 0,
  eswtStd: 5,
  eswtRadial: 3,
  ptVisit: 31,
}
const SALES: Record<UisSalesKey, number> = {
  carm: 360_000,
  sono: 270_000,
  arthro: 150_000,
  manual: 1_200_000,
  eswt: 640_000,
  pt: 410_000,
  etc1: 90_000,
  etc2: 30_000,
  etc3: 20_000,
  etc4: 10_000,
}
const BANDS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'] as const
const AGE_NEW = [0, 0, 1, 1, 2, 1, 1, 1, 0, 0] // 합 7
const AGE_RETURN = [1, 2, 5, 8, 12, 18, 20, 15, 7, 2] // 합 90

function report(kind: UisKind, over: Partial<UisReport> = {}): UisReport {
  return { kind, state: 'ok', cached: false, from: DAY, to: DAY, value: null, columns: [], ...over }
}

/** 의사랑 답(design.md 3-2). states로 보고서 상태를, over로 칸을 바꾼다 */
function uisDay(states: Partial<Record<UisKind, Partial<UisReport>>> = {}): UisDay {
  const salesOnly = UIS_SALES_KEYS.filter((k) => !(UIS_COUNT_KEYS as readonly string[]).includes(k))
  return {
    date: DAY,
    patients: { new: 7, first90: null, return: 57, ptVisit: 31, noExamFee: 0, total: 97 },
    groups: [
      ...UIS_COUNT_KEYS.map((k) => ({
        key: k,
        patients: COUNTS[k],
        total: k in SALES ? SALES[k as UisSalesKey] : null,
        unpaidVisits: null,
        new: null,
        first90: null,
        return: null,
      })),
      ...salesOnly.map((k) => ({ key: k, patients: null, total: SALES[k], unpaidVisits: null, new: null, first90: null, return: null })),
    ],
    ages: BANDS.map((band, i) => ({ band, new: AGE_NEW[i], first90: null, return: AGE_RETURN[i] })),
    money: {
      total: 5_182_300,
      insurer: 3_034_600,
      receivableIn: null,
      unpaidNew: null,
      noncovered: 1_206_000,
      discount: null,
      disabledFund: null,
      received: 1_741_100,
      card: 1_388_600,
      cash: 352_500,
      transfer: null,
      refund: null,
    },
    inpatientVisits: null,
    reservations: { kinds: [], patients: 41 },
    injection: null,
    overlap: null,
    warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false },
    source: 'uisarang',
    uis: {
      folder: 'desktop',
      reports: UIS_KINDS.map((kind) => report(kind, states[kind])),
      open: [],
      deleted: 6,
      kept: 0,
      deleteFailed: 0,
      unknownFiles: 0,
      checks: {
        totalFee: null,
        received: null,
        headcount: null,
        rxTotal: null,
        visitRows: null,
        visitNew: null,
        rsvRows: null,
        rsvVisited: null,
        noDate: false,
      },
      fractional: [],
      negative: [],
      reservations: { total: 45, visited: 38 },
    },
  }
}

const ETC = { etc1: '크라이오', etc2: '', etc3: '', etc4: '' }
/** 모든 묶음에 코드를 고른 설정(기타 이름은 비트 처음 값과 같게: 기타1만 '크라이오') */
function allPicked(): UisSettings {
  return {
    v: 1,
    counts: Object.fromEntries(UIS_COUNT_KEYS.map((k) => [k, [`${k.toUpperCase()}1`]])),
    sales: Object.fromEntries(UIS_SALES_KEYS.map((k) => [k, [`${k.toUpperCase()}9`]])),
    etcNames: { ...ETC },
  }
}
const nonePicked = (): UisSettings => ({ v: 1, counts: {}, sales: {}, etcNames: { ...ETC } })

/** 비트 처음 값 설정으로 planCells가 내는 칸 자리(차례 그대로) */
const BIT_WHERE = planCells(sampleDay(), defaults()).map((p) => key(p.where))

describe('AC-4211.3 uisCells: design.md 6-1 표 그대로', () => {
  const cells = uisCells(uisDay(), allPicked())
  const all = sheet(cells)

  it('AC-4211.3: 칸은 131칸이고 차례·자리가 지금 planCells(비트, 처음 값 설정)와 같다', () => {
    expect(cells).toHaveLength(131)
    expect(cells.map((c) => key(c.where))).toEqual(BIT_WHERE)
  })

  it('AC-4211.3: 의사랑에 없는 칸(none)은 75칸 — 업무일지 1은 11칸, 업무일지 2는 64칸이다', () => {
    const none = cells.filter((c) => c.why === 'none')
    expect(none).toHaveLength(75)
    expect(none.filter((c) => c.where.j === 1)).toHaveLength(11)
    expect(none.filter((c) => c.where.j === 2)).toHaveLength(64)
    for (const c of none) expect(c.value, key(c.where)).toBeNull()
  })

  it('AC-4211.3: 업무일지 1 환자현황·진료 · 치료현황·외래 수입·입원수입', () => {
    expect(pick(all, '1|')).toEqual({
      '1|환자현황|신환': '7',
      '1|환자현황|90일초진': 'none',
      '1|환자현황|재진': '57',
      '1|환자현황|물리치료내원': '31',
      '1|환자현황|진찰료 산정안함': '0',
      '1|환자현황|합계': '97',
      '1|진료 · 치료현황|씨암': '12',
      '1|진료 · 치료현황|SONO': '9',
      '1|진료 · 치료현황|도수상담': '4',
      '1|진료 · 치료현황|도수치료': '15',
      '1|진료 · 치료현황|충격파(체충)': '8',
      '1|진료 · 치료현황|관절조영술': '3',
      '1|진료 · 치료현황|리푸스': '2',
      '1|진료 · 치료현황|손발톱케어': '1',
      '1|진료 · 치료현황|CT': '0',
      '1|진료 · 치료현황|수술': '0',
      '1|외래 수입|외래 총매출': '5182300',
      '1|외래 수입|청구액(-)': '3034600',
      '1|외래 수입|미수입금(+)': 'none',
      '1|외래 수입|미수발생(-)': 'none',
      '1|외래 수입|비급여': '1206000',
      '1|외래 수입|감액': 'none',
      '1|외래 수입|장애인기금(-)': 'none',
      '1|외래 수입|진료수납액': '1741100',
      '1|외래 수입|카드수납액(-)': '1388600',
      '1|외래 수입|현금수납액(-)': '352500',
      '1|외래 수입|계좌이체액(-)': 'none',
      '1|외래 수입|현불/환불(-)': 'none',
      '1|입원수입|청구': 'none',
      '1|입원수입|비급여': 'none',
      '1|입원수입|본인부담금': 'none',
      '1|입원수입|수납액': 'none',
    })
  })

  it('AC-4208.3: 업무일지 2 예약은 종류 6줄 × 총갯수·내원·변경·취소가 모두 none이고 실예약환자수만 값이다', () => {
    const rsv = pick(all, '2|예약|')
    const expected: Record<string, string> = {}
    for (const row of RSV_ROWS) for (const col of ['총갯수', '내원', '변경', '취소']) expected[`2|예약|${RSV_NAMES[row]}|${col}`] = 'none'
    expected['2|예약|실예약환자수|총갯수'] = '41'
    expect(rsv).toEqual(expected)
    expect(Object.keys(rsv)).toHaveLength(25)
  })

  it('AC-4211.3: 치료별 신환/90일초진/재진 건수 9줄 × 3은 모두 none이다(기타 줄 이름은 설정 이름, 비면 기타N)', () => {
    const card = pick(all, '2|치료별 신환/90일초진/재진 건수|')
    expect(Object.keys(card)).toHaveLength(27)
    expect(new Set(Object.values(card))).toEqual(new Set(['none']))
    for (const row of ['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파', '크라이오', '기타2', '기타3', '기타4']) {
      expect(card[`2|치료별 신환/90일초진/재진 건수|${row}|신환`], row).toBe('none')
    }
  })

  it('AC-4211.3: 연령별은 10줄 × 신환·재진이 아래쪽 표 값이고 90일초진은 none이다', () => {
    const rows = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
    const expected: Record<string, string> = {}
    rows.forEach((row, i) => {
      expected[`2|연령별 신환/90일초진/재진|${row}|신환`] = String(AGE_NEW[i])
      expected[`2|연령별 신환/90일초진/재진|${row}|90일초진`] = 'none'
      expected[`2|연령별 신환/90일초진/재진|${row}|재진`] = String(AGE_RETURN[i])
    })
    expect(pick(all, '2|연령별')).toEqual(expected)
  })

  it('AC-4211.3: 운영 지표 낱칸 — 도수·충격파 총금액은 치료별 매출 도수·충격파와 같은 값, ESWT는 건수, 주사 셋은 none', () => {
    expect({
      도수: all['2|도수 총금액'],
      충격파: all['2|충격파 총금액'],
      std: all['2|ESWT Standard'],
      radial: all['2|ESWT Radial'],
      주사1회: all['2|주사1회환자'],
      신환주사환자: all['2|신환주사환자'],
      신환주사건수: all['2|신환주사건수'],
    }).toEqual({
      도수: '1200000',
      충격파: '640000',
      std: '5',
      radial: '3',
      주사1회: 'none',
      신환주사환자: 'none',
      신환주사건수: 'none',
    })
    expect(all['2|도수 총금액']).toBe(all['2|치료별 매출|도수|금액(원)'])
    expect(all['2|충격파 총금액']).toBe(all['2|치료별 매출|충격파|금액(원)'])
  })

  it('AC-4211.3: 치료별 매출 10줄은 그 묶음 매출로 셀 코드 총액 합이고, 이름 빈 기타 줄은 noName이어도 값을 둔다(엑셀용)', () => {
    expect(pick(all, '2|치료별 매출|')).toEqual({
      '2|치료별 매출|씨암|금액(원)': '360000',
      '2|치료별 매출|SONO|금액(원)': '270000',
      '2|치료별 매출|관절조영|금액(원)': '150000',
      '2|치료별 매출|도수|금액(원)': '1200000',
      '2|치료별 매출|충격파|금액(원)': '640000',
      '2|치료별 매출|물리치료|금액(원)': '410000',
      '2|치료별 매출|크라이오|금액(원)': '90000',
      '2|치료별 매출|기타2|금액(원)': 'noName',
      '2|치료별 매출|기타3|금액(원)': 'noName',
      '2|치료별 매출|기타4|금액(원)': 'noName',
    })
    expect(find(cells, '2|치료별 매출|기타2|금액(원)')).toEqual({
      where: { j: 2, card: '치료별 매출', row: '기타2', col: '금액(원)' },
      value: '30000',
      why: 'noName',
    })
  })

  it('AC-4211.3: 값 칸은 쉼표 없는 정수 글자이고 까닭이 없다', () => {
    for (const c of cells) {
      if (c.why === undefined) expect(c.value, key(c.where)).toMatch(/^\d+$/)
    }
    expect(cells.filter((c) => c.why === undefined)).toHaveLength(131 - 75 - 3)
  })

  it('AC-4211.3: 기타 이름이 있으면 그 이름 줄이다', () => {
    const named = uisCells(uisDay(), { ...allPicked(), etcNames: { etc1: '크라이오', etc2: '테이핑', etc3: '', etc4: '' } })
    expect(sheet(named)['2|치료별 매출|테이핑|금액(원)']).toBe('30000')
    expect(sheet(named)['2|치료별 신환/90일초진/재진 건수|테이핑|재진']).toBe('none')
  })
})

describe('AC-4211.3 uisCells: 코드를 고르지 않은 칸(unpicked)', () => {
  const cells = uisCells(uisDay(), nonePicked())
  const all = sheet(cells)

  it('AC-4211.3: 진료 · 치료현황 10줄 · 치료별 매출 10줄 · 운영 지표 낱칸 4칸 · 물리치료내원이 unpicked다', () => {
    const unpicked = cells.filter((c) => c.why === 'unpicked').map((c) => key(c.where))
    expect(unpicked).toEqual([
      '1|환자현황|물리치료내원',
      ...['씨암', 'SONO', '도수상담', '도수치료', '충격파(체충)', '관절조영술', '리푸스', '손발톱케어', 'CT', '수술'].map(
        (r) => `1|진료 · 치료현황|${r}`,
      ),
      '2|도수 총금액',
      '2|충격파 총금액',
      '2|ESWT Standard',
      '2|ESWT Radial',
      ...['씨암', 'SONO', '관절조영', '도수', '충격파', '물리치료', '크라이오', '기타2', '기타3', '기타4'].map(
        (r) => `2|치료별 매출|${r}|금액(원)`,
      ),
    ])
    for (const c of cells.filter((c) => c.why === 'unpicked')) expect(c.value).toBeNull()
  })

  it('AC-4211.3: 물리치료내원을 고르지 않아도 재진은 값이다(재진수 그대로)', () => {
    expect(all['1|환자현황|재진']).toBe('57')
  })

  it('AC-4211.3: 건수 코드만 고르면 매출 칸은 unpicked, 매출 코드만 고르면 건수 칸은 unpicked다(따로 고른다)', () => {
    const only = sheet(uisCells(uisDay(), { v: 1, counts: { manual: ['MT1'] }, sales: { eswt: ['ES9'] }, etcNames: { ...ETC } }))
    expect(only['1|진료 · 치료현황|도수치료']).toBe('15')
    expect(only['2|치료별 매출|도수|금액(원)']).toBe('unpicked')
    expect(only['2|도수 총금액']).toBe('unpicked')
    expect(only['1|진료 · 치료현황|충격파(체충)']).toBe('unpicked')
    expect(only['2|치료별 매출|충격파|금액(원)']).toBe('640000')
    expect(only['2|충격파 총금액']).toBe('640000')
  })

  it('AC-4211.3: 기타 줄을 고르지 않았으면 이름이 비어도 unpicked다(이름 있으면 그 이름 줄)', () => {
    expect(all['2|치료별 매출|기타2|금액(원)']).toBe('unpicked')
    expect(all['2|치료별 매출|크라이오|금액(원)']).toBe('unpicked')
  })
})

describe('AC-4211.3 uisCells: 의사랑이 셀 수 없던 값(unknown)', () => {
  it('AC-4211.3: 답의 값이 null이면 unknown이고 그 칸을 기댄 보고서를 단다', () => {
    const day = uisDay()
    day.patients.new = null
    day.patients.return = null
    day.patients.noExamFee = null
    day.patients.total = null
    day.money.insurer = null
    day.groups.find((g) => g.key === 'sono')!.patients = null
    day.groups.find((g) => g.key === 'pt')!.total = null
    day.reservations.patients = null
    day.ages[3].new = null
    const cells = uisCells(day, allPicked())
    const got = (k: string) => {
      const c = find(cells, k)
      return { value: c?.value, why: c?.why, report: c?.report }
    }
    expect(got('1|환자현황|신환')).toEqual({ value: null, why: 'unknown', report: 'visits' })
    expect(got('1|환자현황|재진')).toEqual({ value: null, why: 'unknown', report: 'income' })
    expect(got('1|환자현황|진찰료 산정안함')).toEqual({ value: null, why: 'unknown', report: 'income' })
    expect(got('1|환자현황|합계')).toEqual({ value: null, why: 'unknown', report: 'visits' })
    expect(got('1|외래 수입|청구액(-)')).toEqual({ value: null, why: 'unknown', report: 'income' })
    expect(got('1|진료 · 치료현황|SONO')).toEqual({ value: null, why: 'unknown', report: 'rx' })
    expect(got('2|치료별 매출|물리치료|금액(원)')).toEqual({ value: null, why: 'unknown', report: 'rx' })
    expect(got('2|예약|실예약환자수|총갯수')).toEqual({ value: null, why: 'unknown', report: 'rsvPatients' })
    expect(got('2|연령별 신환/90일초진/재진|30대|신환')).toEqual({ value: null, why: 'unknown', report: 'visitPatients' })
  })

  it('AC-4211.3: 위쪽 표가 없으면 신환·합계의 보고서는 아래쪽 표다', () => {
    const day = uisDay({ visits: { state: 'missing', from: null, to: null } })
    day.patients.new = null
    const c = find(uisCells(day, allPicked()), '1|환자현황|신환')
    expect(c).toMatchObject({ why: 'unknown', report: 'visitPatients' })
  })

  it('AC-4211.3: 고른 묶음이 답에 없으면 unknown이다', () => {
    const day = uisDay()
    day.groups = day.groups.filter((g) => g.key !== 'lipus')
    expect(find(uisCells(day, allPicked()), '1|진료 · 치료현황|리푸스')).toMatchObject({ value: null, why: 'unknown', report: 'rx' })
  })

  it('AC-4211.3: 이름 빈 기타 줄 값이 null이면 noName이 아니라 unknown이다', () => {
    const day = uisDay()
    day.groups.find((g) => g.key === 'etc3')!.total = null
    expect(find(uisCells(day, allPicked()), '2|치료별 매출|기타3|금액(원)')).toMatchObject({ value: null, why: 'unknown', report: 'rx' })
  })
})

describe('AC-4211.3 uisCells: 엑셀이 없어 비운 칸(missing)', () => {
  it('AC-4211.3: 기간별처방통계가 없으면 고른 건수·매출 칸이 모두 missing:rx이고, 물리치료내원을 골랐으면 재진도 missing:rx다', () => {
    const all = sheet(uisCells(uisDay({ rx: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(all['1|진료 · 치료현황|씨암']).toBe('missing:rx')
    expect(all['1|환자현황|물리치료내원']).toBe('missing:rx')
    expect(all['1|환자현황|재진']).toBe('missing:rx')
    expect(all['2|도수 총금액']).toBe('missing:rx')
    expect(all['2|ESWT Radial']).toBe('missing:rx')
    expect(all['2|치료별 매출|기타4|금액(원)']).toBe('missing:rx')
    expect(Object.values(all).filter((v) => v === 'missing:rx')).toHaveLength(1 + 1 + 10 + 4 + 10)
  })

  it('AC-4211.3: 기간별처방통계가 없어도 물리치료내원을 고르지 않았으면 재진은 재진수 값이고, 고르지 않은 칸은 unpicked다', () => {
    const all = sheet(uisCells(uisDay({ rx: { state: 'missing', from: null, to: null } }), nonePicked()))
    expect(all['1|환자현황|재진']).toBe('57')
    expect(all['1|진료 · 치료현황|씨암']).toBe('unpicked')
    expect(all['2|치료별 매출|도수|금액(원)']).toBe('unpicked')
  })

  it('AC-4211.3: 일일수입통계가 없으면 외래 수입 6칸 · 재진 · 진찰료 산정안함이 missing:income이다', () => {
    const all = sheet(uisCells(uisDay({ income: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(Object.entries(all).filter(([, v]) => v === 'missing:income').map(([k]) => k)).toEqual([
      '1|환자현황|재진',
      '1|환자현황|진찰료 산정안함',
      '1|외래 수입|외래 총매출',
      '1|외래 수입|청구액(-)',
      '1|외래 수입|비급여',
      '1|외래 수입|진료수납액',
      '1|외래 수입|카드수납액(-)',
      '1|외래 수입|현금수납액(-)',
    ])
  })

  it('AC-4211.3: 내원 위쪽 표만 없으면 신환·합계는 아래쪽 표 값이고, 둘 다 없으면 신환·합계·산정안함·연령별이 missing:visitPatients다', () => {
    const upperOnly = sheet(uisCells(uisDay({ visits: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(upperOnly['1|환자현황|신환']).toBe('7')
    expect(upperOnly['1|환자현황|합계']).toBe('97')
    const both = sheet(
      uisCells(
        uisDay({ visits: { state: 'missing', from: null, to: null }, visitPatients: { state: 'missing', from: null, to: null } }),
        allPicked(),
      ),
    )
    expect(both['1|환자현황|신환']).toBe('missing:visitPatients')
    expect(both['1|환자현황|합계']).toBe('missing:visitPatients')
    expect(both['1|환자현황|진찰료 산정안함']).toBe('missing:visitPatients')
    expect(both['2|연령별 신환/90일초진/재진|50대|재진']).toBe('missing:visitPatients')
    expect(Object.values(both).filter((v) => v === 'missing:visitPatients')).toHaveLength(3 + 20)
  })

  it('AC-4211.3: 아래쪽 내원 표만 없으면(위쪽 표 있음) 연령별만 missing:visitPatients다', () => {
    const all = sheet(uisCells(uisDay({ visitPatients: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(all['1|환자현황|신환']).toBe('7')
    expect(all['1|환자현황|진찰료 산정안함']).toBe('0')
    expect(Object.values(all).filter((v) => v === 'missing:visitPatients')).toHaveLength(20)
  })

  it('AC-4211.3: 예약 아래쪽 표가 없으면 실예약환자수만 missing:rsvPatients이고, 예약 위쪽 표가 없어도 칸은 그대로다', () => {
    const all = sheet(uisCells(uisDay({ rsvPatients: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(Object.entries(all).filter(([, v]) => v.startsWith('missing')).map(([k]) => k)).toEqual(['2|예약|실예약환자수|총갯수'])
    const upper = sheet(uisCells(uisDay({ rsv: { state: 'missing', from: null, to: null } }), allPicked()))
    expect(Object.values(upper).some((v) => v.startsWith('missing'))).toBe(false)
  })

  it('AC-4211.3: 모아 둔 값을 쓴 보고서(cached, state ok)는 있는 것으로 본다', () => {
    const all = sheet(uisCells(uisDay({ rx: { cached: true }, income: { cached: true } }), allPicked()))
    expect(Object.values(all).some((v) => v.startsWith('missing'))).toBe(false)
  })
})

describe('AC-4211.3 planUisCells: fillAll에 넘길 칸 계획', () => {
  const BIT_SET = new Set(BIT_WHERE)

  it('AC-4211.3: 계획에는 값 칸·unpicked·unknown·noName만 있고 none 75칸은 없다(모두 있으면 56칸)', () => {
    const plan = planUisCells(uisDay(), allPicked())
    expect(plan).toHaveLength(131 - 75)
    expect(new Set(plan.map((p) => p.why ?? 'value'))).toEqual(new Set(['value', 'noName']))
    const noneKeys = uisCells(uisDay(), allPicked())
      .filter((c) => c.why === 'none')
      .map((c) => key(c.where))
    for (const k of noneKeys) expect(plan.map((p) => key(p.where))).not.toContain(k)
  })

  it('AC-4211.3: 계획의 칸 자리는 모두 지금 planCells(비트, 처음 값 설정) 칸 자리 가운데 하나이고 차례도 같다', () => {
    for (const s of [allPicked(), nonePicked()]) {
      const plan = planUisCells(uisDay(), s)
      const keys = plan.map((p) => key(p.where))
      for (const k of keys) expect(BIT_SET.has(k), k).toBe(true)
      expect(keys).toEqual(BIT_WHERE.filter((k) => keys.includes(k)))
    }
  })

  it('AC-4211.3: 엑셀이 없어 비운 칸(missing)은 계획에 없다', () => {
    const plan = planUisCells(uisDay({ rsvPatients: { state: 'missing', from: null, to: null } }), allPicked())
    expect(plan).toHaveLength(131 - 75 - 1)
    expect(plan.map((p) => key(p.where))).not.toContain('2|예약|실예약환자수|총갯수')
  })

  it('AC-4211.3: noName 칸은 계획에서 값이 없고, 칸 모양은 fillAll이 받는 Planned 그대로다(보고서 칸 없음)', () => {
    const day = uisDay()
    day.money.card = null
    const plan = planUisCells(day, allPicked())
    const etc2 = plan.find((p) => key(p.where) === '2|치료별 매출|기타2|금액(원)')
    expect(etc2).toEqual({ where: { j: 2, card: '치료별 매출', row: '기타2', col: '금액(원)' }, value: null, why: 'noName' })
    expect(plan.find((p) => key(p.where) === '1|외래 수입|카드수납액(-)')).toEqual({
      where: { j: 1, box: '외래 수입', row: '카드수납액(-)' },
      value: null,
      why: 'unknown',
    })
    expect(plan.find((p) => key(p.where) === '1|환자현황|신환')).toEqual({ where: { j: 1, box: '환자현황', row: '신환' }, value: '7' })
    for (const p of plan) expect(Object.keys(p).every((k) => ['where', 'value', 'why'].includes(k)), key(p.where)).toBe(true)
  })

  it('AC-4211.3: 코드를 하나도 고르지 않으면 unpicked 25칸이 계획에 있고(건너뛴 칸 안내용) 값 칸은 그대로다', () => {
    const plan: Planned[] = planUisCells(uisDay(), nonePicked())
    expect(plan.filter((p) => p.why === 'unpicked')).toHaveLength(25)
    expect(plan.filter((p) => !p.why)).toHaveLength(131 - 75 - 25)
  })

  it('AC-4208.3: 예약 표에서 계획에 있는 칸은 실예약환자수 하나뿐이다', () => {
    const rsv = planUisCells(uisDay(), allPicked()).filter((p) => 'card' in p.where && p.where.card === '예약')
    expect(rsv).toEqual([{ where: { j: 2, card: '예약', row: '실예약환자수', col: '총갯수' }, value: '41' }])
  })
})

// --- 답 검사 ---

type Mutate = (d: Record<string, any>) => void // eslint-disable-line @typescript-eslint/no-explicit-any

describe('AC-4211.4 readUisDay: design.md 3-2 모양일 때만 받는다', () => {
  it('AC-4211.4: 맞는 답은 그대로 받는다(null 칸·cached·otherDate 보고서·열림·경고 포함)', () => {
    const day = uisDay({ rsv: { state: 'missing', from: null, to: null }, rx: { cached: true }, income: { state: 'otherDate', from: '2026-11-22', to: '2026-11-22' } })
    day.patients.new = null
    day.uis.open = ['visitPatients', 'unknown']
    day.uis.checks.totalFee = [5_182_300, 5_182_000]
    day.uis.checks.noDate = true
    day.uis.fractional = ['sono']
    day.uis.negative = ['return', 'noExamFee']
    day.uis.reservations = null
    day.uis.reports[2] = report('visits', { state: 'notAll', value: '외래', columns: ['신규환자'] })
    day.warnings.unknownAge = 2
    day.groups = []
    expect(readUisDay(JSON.parse(JSON.stringify(day)), DAY)).toEqual(day)
    const plain = uisDay()
    expect(readUisDay(plain, DAY)).toBe(plain)
  })

  it('AC-4211.4: 비트 답(source 없음)·객체가 아닌 것·다른 날 답은 null이다', () => {
    expect(readUisDay(sampleDay(), sampleDay().date)).toBeNull()
    expect(readUisDay(null, DAY)).toBeNull()
    expect(readUisDay([uisDay()], DAY)).toBeNull()
    expect(readUisDay(uisDay(), '2026-11-22')).toBeNull()
  })

  const BROKEN: [string, Mutate][] = [
    ['source 없음', (d) => delete d.source],
    ['source가 bit', (d) => (d.source = 'bit')],
    ['uis 없음', (d) => delete d.uis],
    ['null 아닌 곳 null(uis.deleted)', (d) => (d.uis.deleted = null)],
    ['null 아닌 곳 null(warnings.unknownAge)', (d) => (d.warnings.unknownAge = null)],
    ['음수(patients.new)', (d) => (d.patients.new = -1)],
    ['음수(money.total)', (d) => (d.money.total = -5)],
    ['소수(money.received)', (d) => (d.money.received = 1741100.5)],
    ['소수(groups[0].patients)', (d) => (d.groups[0].patients = 1.5)],
    ['숫자가 글자(ages[0].new)', (d) => (d.ages[0].new = '0')],
    ['정해진 null이 숫자(patients.first90)', (d) => (d.patients.first90 = 0)],
    ['정해진 null이 숫자(money.transfer)', (d) => (d.money.transfer = 0)],
    ['정해진 null이 숫자(groups[0].new)', (d) => (d.groups[0].new = 0)],
    ['정해진 null이 숫자(inpatientVisits)', (d) => (d.inpatientVisits = 0)],
    ['예약 종류가 있음', (d) => (d.reservations.kinds = [{ kind: '1', total: 1, visited: 1, changed: 0, canceled: 0 }])],
    ['injection이 객체', (d) => (d.injection = { firstTime: 1, newPatients: 1, newLines: 1 })],
    ['모르는 묶음 key', (d) => (d.groups[0].key = 'injection')],
    ['ages 9줄', (d) => d.ages.pop()],
    ['ages band 차례 틀림', (d) => d.ages.reverse()],
    ['reports 5개', (d) => d.uis.reports.pop()],
    ['reports 차례 틀림', (d) => d.uis.reports.reverse()],
    ['report state 모름', (d) => (d.uis.reports[0].state = 'stale')],
    ['report cached가 참거짓 아님', (d) => (d.uis.reports[0].cached = 'yes')],
    ['cached인데 state가 ok 아님', (d) => Object.assign(d.uis.reports[1], { cached: true, state: 'missing' })],
    ['report columns가 글자 목록 아님', (d) => (d.uis.reports[0].columns = [3])],
    ['report from이 날짜 꼴 아님', (d) => (d.uis.reports[0].from = '11/23')],
    ['folder 모름', (d) => (d.uis.folder = 'onedrive')],
    ['open에 모르는 보고서', (d) => (d.uis.open = ['income', 'x'])],
    ['checks 짝이 하나', (d) => (d.uis.checks.totalFee = [1])],
    ['checks 짝에 소수', (d) => (d.uis.checks.received = [1.5, 2])],
    ['checks noDate 없음', (d) => delete d.uis.checks.noDate],
    ['fractional에 매출만 묶음', (d) => (d.uis.fractional = ['pt'])],
    ['negative에 모르는 값', (d) => (d.uis.negative = ['total'])],
    ['uis.reservations 모양 틀림', (d) => (d.uis.reservations = { total: 1 })],
    ['warnings 참거짓이 참', (d) => (d.warnings.moneyUnconfirmed = true)],
  ]
  it.each(BROKEN)('AC-4211.4: 틀린 모양(%s)은 null이다', (_name, mutate) => {
    const d = JSON.parse(JSON.stringify(uisDay())) as Record<string, unknown>
    mutate(d)
    expect(readUisDay(d, DAY)).toBeNull()
  })
})

// --- 멈춤 판정 ---

describe('AC-4212.1·AC-4212.2·AC-4212.3 stopOf: open → otherDate → notAll → twice → missing → some', () => {
  it('AC-4212.3: 모두 있으면 멈추지 않는다', () => {
    expect(stopOf(uisDay())).toBeNull()
  })

  it('AC-4212.1: 열린 엑셀이 있으면 다른 판정보다 먼저 open이다', () => {
    const day = uisDay({ income: { state: 'otherDate' }, rx: { state: 'notAll', value: '외래' }, rsv: { state: 'twice' } })
    day.uis.open = ['visitPatients', 'unknown']
    expect(stopOf(day)).toEqual({ kind: 'open', kinds: ['visitPatients', 'unknown'] })
    const missing = uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing' as const }])))
    missing.uis.open = ['rx']
    expect(stopOf(missing)).toEqual({ kind: 'open', kinds: ['rx'] })
  })

  it('AC-4212.2: 날짜 다른 보고서가 있으면 그 보고서들 모두(UIS_KINDS 차례)로 otherDate — notAll·twice보다 먼저', () => {
    const day = uisDay({
      rsv: { state: 'otherDate', from: '2026-11-22', to: '2026-11-22' },
      income: { state: 'otherDate', from: '2026-11-20', to: '2026-11-23' },
      rx: { state: 'notAll', value: '외래' },
      visits: { state: 'twice' },
    })
    expect(stopOf(day)).toEqual({
      kind: 'otherDate',
      reports: [day.uis.reports[0], day.uis.reports[4]],
      patientDeleted: false,
    })
  })

  it('AC-4212.2: 환자별 엑셀이 날짜 다름이면 patientDeleted가 참이다', () => {
    const day = uisDay({ rsvPatients: { state: 'otherDate', from: '2026-11-22', to: '2026-11-22' } })
    expect(stopOf(day)).toEqual({ kind: 'otherDate', reports: [day.uis.reports[5]], patientDeleted: true })
    const visit = uisDay({ visitPatients: { state: 'otherDate', from: null, to: null }, income: { state: 'otherDate' } })
    expect(stopOf(visit)).toMatchObject({ kind: 'otherDate', patientDeleted: true })
  })

  it('AC-4212.2: 조건이 전체가 아니면 첫 notAll 보고서 — twice보다 먼저', () => {
    const day = uisDay({ income: { state: 'twice' }, rsv: { state: 'notAll', value: '입원' }, rx: { state: 'notAll', value: '외래' } })
    expect(stopOf(day)).toEqual({ kind: 'notAll', report: day.uis.reports[1] })
  })

  it('AC-4212.2: 같은 엑셀 둘이면 첫 twice 보고서', () => {
    const day = uisDay({ rsvPatients: { state: 'twice' }, visits: { state: 'twice' } })
    expect(stopOf(day)).toEqual({ kind: 'twice', report: day.uis.reports[2] })
  })

  it('AC-4212.3: 쓸 수 있는 보고서가 하나도 없으면 missing이다', () => {
    const day = uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing' as const, from: null, to: null }])))
    expect(stopOf(day)).toEqual({ kind: 'missing' })
  })

  it('AC-4212.3: 꼭 있어야 할 4개 가운데 없는 것이 있으면 some(UIS_KINDS 차례)이다', () => {
    expect(stopOf(uisDay({ rsvPatients: { state: 'missing' } }))).toEqual({ kind: 'some', missing: ['rsvPatients'] })
    expect(stopOf(uisDay({ rsvPatients: { state: 'missing' }, income: { state: 'missing' }, visits: { state: 'missing' } }))).toEqual({
      kind: 'some',
      missing: ['income', 'rsvPatients'],
    })
  })

  it('AC-4212.3: 선택 보고서(위쪽 표)만 있으면 missing이 아니라 꼭 4개가 모두 없는 some이다', () => {
    const day = uisDay({
      income: { state: 'missing' },
      rx: { state: 'missing' },
      visitPatients: { state: 'missing' },
      rsvPatients: { state: 'missing' },
    })
    expect(stopOf(day)).toEqual({ kind: 'some', missing: ['income', 'rx', 'visitPatients', 'rsvPatients'] })
  })

  it('AC-4212.3: 선택 2개(위쪽 표)만 없으면 멈추지 않는다', () => {
    expect(stopOf(uisDay({ visits: { state: 'missing' }, rsv: { state: 'missing' } }))).toBeNull()
  })

  it('AC-4212.3: 모아 둔 값을 쓴 보고서(cached)는 있는 것이다', () => {
    expect(stopOf(uisDay({ income: { cached: true }, rx: { cached: true }, rsvPatients: { cached: true } }))).toBeNull()
    expect(stopOf(uisDay({ income: { cached: true }, rx: { state: 'missing' } }))).toEqual({ kind: 'some', missing: ['rx'] })
  })
})

// --- 결과 안내 줄 ---

describe('AC-4212.4 unreadLines: 의사랑에서 읽지 못한 칸 까닭(design.md 10-2 5)', () => {
  it('AC-4212.4: 다 읽었으면 없음', () => {
    const day = uisDay()
    expect(unreadLines(day, uisCells(day, allPicked()))).toEqual([])
  })

  it('AC-4212.4: 못 찾은 칸이 있는 보고서(그 보고서 칸이 비었을 때) → 소수 묶음 → 재진 음수 → 산정안함 음수 차례', () => {
    const day = uisDay({ income: { columns: ['청구액'] }, rx: { columns: ['총투여량', '총액'] } })
    day.money.insurer = null
    day.groups.find((g) => g.key === 'carm')!.patients = null
    day.groups.find((g) => g.key === 'sono')!.patients = null
    day.patients.return = null
    day.patients.noExamFee = null
    day.uis.fractional = ['sono', 'ptVisit']
    day.uis.negative = ['return', 'noExamFee']
    expect(unreadLines(day, uisCells(day, allPicked()))).toEqual([
      "일일수입통계에 '청구액' 칸이 없어요.",
      "기간별처방통계에 '총투여량' · '총액' 칸이 없어요.",
      `${GROUP_NAMES.sono} 건수: 고른 코드의 총투여량에 소수가 있어요.`,
      `${GROUP_NAMES.ptVisit} 건수: 고른 코드의 총투여량에 소수가 있어요.`,
      UIS_TEXT.unread.negativeReturn,
      UIS_TEXT.unread.negativeNoExamFee,
    ])
    expect(UIS_TEXT.unread.column(UIS_REPORT_NAMES.income, ['청구액'])).toBe("일일수입통계에 '청구액' 칸이 없어요.")
  })

  it('AC-4212.4: 못 찾은 칸이 있어도 그 보고서에서 비운 칸이 없으면(맞춰 보기에만 쓰는 칸) 까닭 줄을 내지 않는다', () => {
    const day = uisDay({ income: { columns: ['인원계'] }, visits: { columns: ['신규환자'] } })
    day.patients.new = null
    expect(unreadLines(day, uisCells(day, allPicked()))).toEqual(["내원일별환자현황 위쪽 표에 '신규환자' 칸이 없어요."])
  })
})

describe('AC-4212.4 checkLines: 맞춰 보기 경고(design.md 6-2·10-2 8 차례)', () => {
  it('AC-4212.4: 경고가 없으면 없음', () => {
    expect(checkLines(uisDay())).toEqual([])
  })

  it('AC-4212.4: 여덟 짝 → 조회일 없음 → 나이 못 셈 차례이고, 처방통계 짝은 [합계 줄, 코드 줄 합]을 글 차례(코드 줄 합 먼저)로 바꿔 넣는다', () => {
    const day = uisDay()
    day.uis.checks = {
      totalFee: [5_182_300, 5_182_000],
      received: [1_741_100, 1_741_000],
      headcount: [97, 96],
      rxTotal: [4_000_000, 3_990_000],
      visitRows: [95, 97],
      visitNew: [6, 7],
      rsvRows: [44, 45],
      rsvVisited: [37, 38],
      noDate: true,
    }
    day.warnings.unknownAge = 2
    expect(checkLines(day)).toEqual([
      UIS_TEXT.warn.totalFee(5_182_300, 5_182_000),
      UIS_TEXT.warn.received(1_741_100, 1_741_000),
      UIS_TEXT.warn.headcount(97, 96),
      UIS_TEXT.warn.rxTotal(3_990_000, 4_000_000),
      UIS_TEXT.warn.visitRows(95, 97),
      UIS_TEXT.warn.visitNew(6, 7),
      UIS_TEXT.warn.rsvRows(44, 45),
      UIS_TEXT.warn.rsvVisited(37, 38),
      UIS_TEXT.warn.noDate,
      UIS_TEXT.warn.unknownAge(2),
    ])
    expect(checkLines(day)[3]).toBe('기간별처방통계 코드 줄 총액 합(3,990,000원)이 합계 줄(4,000,000원)과 달라요.')
    expect(checkLines(day)[4]).toBe('내원일별환자현황 아래쪽 표 환자 수(95명)가 인원수(97명)와 달라요. 연령별 표가 2명 모자랄 수 있어요.')
  })

  it('AC-4212.4: null 짝·같은 값 짝은 건너뛴다(뒤 줄 "채우기는 했어요."는 그리는 쪽이 붙인다)', () => {
    const day = uisDay()
    day.uis.checks.headcount = [97, 97]
    day.uis.checks.visitRows = [99, 97]
    expect(checkLines(day)).toEqual([UIS_TEXT.warn.visitRows(99, 97)])
    expect(checkLines(day)).not.toContain(UIS_TEXT.warn.after)
  })
})
