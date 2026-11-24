// TASK-10 (spec erp-uisarang) design.md 7-1·8-5: [엑셀로 받기] 시트 모양(uisSheetRows·UIS_SHEET_FIELDS·uisFileName).
// 숫자는 시안 예시 관계로 지은 값(환자 정보 없음). 만든 줄은 TASK-6 workbookBytes로 .xlsx를 만들고 저장소의 SheetJS `xlsx` 0.20.3으로
// 다시 읽어 같은 칸 값·숫자 칸인지 본다. 글은 design.md 7-1 글자 그대로 적어 견준다
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { Where } from './cells'
import { RSV_NAMES, RSV_ROWS } from './types'
import { planUisCells, uisCells } from './uisCells'
import { UIS_COUNT_KEYS, UIS_KINDS, UIS_SALES_KEYS } from './uisTypes'
import type { UisCountKey, UisDay, UisKind, UisReport, UisSalesKey, UisSettings } from './uisTypes'
import { workbookBytes, type SheetValue } from './xlsxWrite'

// uisSheet.ts가 없을 때 파일 전체가 아니라 그 시험만 실패하게 시험 안에서 불러온다
const loadSheet = () => import('./uisSheet')

const DAY = '2026-11-23' // 월요일
const WHEN = new Date(2026, 10, 23, 18, 30, 0)

// --- 시안 예시 숫자 답(notes.md '예시 숫자 관계', uisCells.test.ts와 같은 값) ---

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

/** 의사랑 답(design.md 3-2). states로 보고서 상태를 바꾼다 */
function uisDay(states: Partial<Record<UisKind, Partial<UisReport>>> = {}, date = DAY): UisDay {
  const salesOnly = UIS_SALES_KEYS.filter((k) => !(UIS_COUNT_KEYS as readonly string[]).includes(k))
  return {
    date,
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

/** 모든 묶음에 코드를 고른 설정(기타 이름은 기타1만 '크라이오', 기타2~4는 빔 = noName) */
function allPicked(etcNames: UisSettings['etcNames'] = { etc1: '크라이오', etc2: '', etc3: '', etc4: '' }): UisSettings {
  return {
    v: 1,
    counts: Object.fromEntries(UIS_COUNT_KEYS.map((k) => [k, [`${k.toUpperCase()}1`]])),
    sales: Object.fromEntries(UIS_SALES_KEYS.map((k) => [k, [`${k.toUpperCase()}9`]])),
    etcNames,
  }
}

// --- 시트 읽기 도우미 ---

/** 숫자 줄 하나: 어느 업무일지·머리 아래 줄인가 + [이름, 값, 까닭] */
type Line = { journal: string; section: string; name: string; value: SheetValue; why: SheetValue }

/** 1행 뒤 줄을 머리 줄(칸 하나)과 숫자 줄(칸 셋)로 나눈다. 다른 모양 줄이 있으면 시험이 실패한다 */
function parse(rows: SheetValue[][]): { heads: string[]; lines: Line[] } {
  const heads: string[] = []
  const lines: Line[] = []
  let journal = ''
  let section = ''
  for (const row of rows.slice(1)) {
    if (row.length === 1) {
      expect(typeof row[0]).toBe('string')
      const text = row[0] as string
      heads.push(text)
      if (text.startsWith('업무일지 ')) {
        journal = text
        section = ''
      } else section = text
    } else {
      expect(row, JSON.stringify(row)).toHaveLength(3)
      expect(typeof row[0]).toBe('string')
      lines.push({ journal, section, name: row[0] as string, value: row[1], why: row[2] })
    }
  }
  return { heads, lines }
}

/** uisCells 칸 자리 → 시트에서 놓일 곳(design.md 7-1 칸 이름 규칙) */
function placeOf(w: Where): { journal: string; section: string; name: string } {
  if (w.j === 1) return { journal: '업무일지 1', section: w.box, name: w.row }
  if ('field' in w) return { journal: '업무일지 2', section: '운영 지표', name: w.field }
  const section = w.card === '치료별 매출' ? '치료별 매출 금액(원)' : w.card
  const name = w.card === '치료별 매출' || w.row === '실예약환자수' ? w.row : `${w.row} ${w.col}`
  return { journal: '업무일지 2', section, name }
}

const at = (lines: readonly Line[], journal: string, section: string, name: string) =>
  lines.filter((l) => l.journal === journal && l.section === section && l.name === name)

/** 그 칸 자리의 숫자 줄(꼭 하나) */
function lineOf(lines: readonly Line[], w: Where): Line {
  const p = placeOf(w)
  const found = at(lines, p.journal, p.section, p.name)
  expect(found, `${p.journal} › ${p.section} › ${p.name}`).toHaveLength(1)
  return found[0]
}

// --- 기대하는 줄(design.md 7-1 UIS_SHEET_FIELDS, ERP 화면 차례) ---

const THREE = ['신환', '90일초진', '재진']
const cross = (rows: readonly string[], cols: readonly string[]) => rows.flatMap((r) => cols.map((c) => `${r} ${c}`))

const J1_LINES: [string, string[]][] = [
  ['진료 · 치료현황', ['씨암', 'SONO', '도수상담', '도수치료', '충격파(체충)', '관절조영술', '리푸스', '손발톱케어', 'CT', '수술']],
  [
    '외래 수입',
    [
      '외래 총매출',
      '청구액(-)',
      '미수입금(+)',
      '미수발생(-)',
      '비급여',
      '감액',
      'MOU 감액',
      '장애인기금(-)',
      '진료수납액',
      '카드수납액(-)',
      '현금수납액(-)',
      '계좌이체액(-)',
      '현불/환불(-)',
    ],
  ],
  ['입원수입', ['청구', '비급여', '본인부담금', '수납액']],
  ['지출', ['현금', '카드', 'FREE']],
  ['환자현황', ['신환', '90일초진', '재진', '물리치료내원', '진찰료 산정안함', '합계']],
  ['신환경로', ['지인소개', '간판', '인터넷', '홍보물', '기타']],
]
const AGE_NAMES = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
/** 업무일지 2(기타 줄 이름은 설정의 기타 이름, 비면 기타N) */
function j2Lines(etc: readonly string[]): [string, string[]][] {
  return [
    ['예약', [...cross(RSV_ROWS.map((r) => RSV_NAMES[r]), ['총갯수', '내원', '변경', '취소']), '실예약환자수']],
    ['치료별 신환/90일초진/재진 건수', cross(['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파', ...etc], THREE)],
    ['상담-전환률', cross(['도수치료', '체외충격파', '기타'], ['상담건수', '예약건수', '실행건수'])],
    ['연령별 신환/90일초진/재진', cross(AGE_NAMES, THREE)],
    ['운영 지표', ['도수 총금액', '충격파 총금액', 'ESWT Standard', 'ESWT Radial', '주사1회환자', '신환주사환자', '신환주사건수']],
    ['치료별 매출 금액(원)', ['씨암', 'SONO', '관절조영', '도수', '충격파', '물리치료', ...etc]],
  ]
}
const ETC_SHOWN = ['크라이오', '기타2', '기타3', '기타4']

/** 머리 줄(칸 하나) 차례 */
const HEADS = [
  '업무일지 1',
  '진료 · 치료현황',
  '외래 수입',
  '입원수입',
  '지출',
  '환자현황',
  '신환경로',
  '업무일지 2',
  '예약',
  '치료별 신환/90일초진/재진 건수',
  '상담-전환률',
  '연령별 신환/90일초진/재진',
  '운영 지표',
  '치료별 매출 금액(원)',
]

/** 직접 입력 칸 18줄(MOU 감액 · 지출 · 신환경로 · 상담-전환률) */
const DIRECT = [
  '업무일지 1|외래 수입|MOU 감액',
  '업무일지 1|지출|현금',
  '업무일지 1|지출|카드',
  '업무일지 1|지출|FREE',
  '업무일지 1|신환경로|지인소개',
  '업무일지 1|신환경로|간판',
  '업무일지 1|신환경로|인터넷',
  '업무일지 1|신환경로|홍보물',
  '업무일지 1|신환경로|기타',
  ...cross(['도수치료', '체외충격파', '기타'], ['상담건수', '예약건수', '실행건수']).map((n) => `업무일지 2|상담-전환률|${n}`),
]

/** 까닭 다섯 글(design.md 7-1 글자 그대로) */
const WHY: Record<'direct' | 'none' | 'unpicked' | 'unknown', string> = {
  direct: '직접 입력',
  none: '의사랑에 없음',
  unpicked: '코드 안 고름',
  unknown: '못 읽음',
}
const missingWhy = (report: string) => `못 읽음 (${report} 없음)`

describe('AC-4213.1 uisSheetRows: design.md 7-1 시트 모양', () => {
  it('AC-4213.1: 1행은 [항목, {M/D} ({요일}), 빈 칸 까닭]이고 요일은 마감 일자 달력으로 센다', async () => {
    const { uisSheetRows } = await loadSheet()
    expect(uisSheetRows(uisDay(), allPicked())[0]).toEqual(['항목', '11/23 (월)', '빈 칸 까닭'])
    expect(uisSheetRows(uisDay({}, '2026-11-01'), allPicked())[0]).toEqual(['항목', '11/1 (일)', '빈 칸 까닭'])
    expect(uisSheetRows(uisDay({}, '2026-12-31'), allPicked())[0]).toEqual(['항목', '12/31 (목)', '빈 칸 까닭'])
    expect(uisSheetRows(uisDay({}, '2027-01-02'), allPicked())[0]).toEqual(['항목', '1/2 (토)', '빈 칸 까닭'])
  })

  it('AC-4213.1: 머리 줄은 업무일지 1 → 구역 여섯 → 업무일지 2 → 묶음 여섯 차례이고 칸이 하나뿐이다', async () => {
    const { uisSheetRows } = await loadSheet()
    const { heads } = parse(uisSheetRows(uisDay(), allPicked()))
    expect(heads).toEqual(HEADS)
  })

  it('AC-4213.1: 숫자 줄은 149줄(업무일지 1: 41, 업무일지 2: 108)이고 이름·차례가 ERP 화면 차례다', async () => {
    const { uisSheetRows } = await loadSheet()
    const rows = uisSheetRows(uisDay(), allPicked())
    const { lines } = parse(rows)
    expect(rows).toHaveLength(1 + 14 + 149)
    expect(lines).toHaveLength(149)
    expect(lines.filter((l) => l.journal === '업무일지 1')).toHaveLength(41)
    expect(lines.filter((l) => l.journal === '업무일지 2')).toHaveLength(108)
    const want = [
      ...J1_LINES.flatMap(([section, names]) => names.map((n) => `업무일지 1|${section}|${n}`)),
      ...j2Lines(ETC_SHOWN).flatMap(([section, names]) => names.map((n) => `업무일지 2|${section}|${n}`)),
    ]
    expect(want).toHaveLength(149)
    expect(lines.map((l) => `${l.journal}|${l.section}|${l.name}`)).toEqual(want)
  })

  it('AC-4213.1: 값이 있는 칸은 planUisCells 값(숫자 칸)이고 까닭이 없다', async () => {
    const { uisSheetRows } = await loadSheet()
    const day = uisDay()
    const s = allPicked()
    const { lines } = parse(uisSheetRows(day, s))
    const planned = planUisCells(day, s).filter((p) => p.value !== null)
    expect(planned.length).toBeGreaterThan(50)
    for (const p of planned) {
      const line = lineOf(lines, p.where)
      expect(line.value, line.name).toBe(Number(p.value))
      expect(typeof line.value).toBe('number')
      expect(line.why, line.name).toBeNull()
    }
    // 시안 예시 숫자 몇 줄을 글자 그대로
    expect(at(lines, '업무일지 1', '외래 수입', '외래 총매출')[0]).toMatchObject({ value: 5_182_300, why: null })
    expect(at(lines, '업무일지 1', '환자현황', '진찰료 산정안함')[0]).toMatchObject({ value: 0, why: null })
    expect(at(lines, '업무일지 2', '예약', '실예약환자수')[0]).toMatchObject({ value: 41, why: null })
    expect(at(lines, '업무일지 2', '연령별 신환/90일초진/재진', '60대 재진')[0]).toMatchObject({ value: 20, why: null })
    expect(at(lines, '업무일지 2', '운영 지표', '도수 총금액')[0]).toMatchObject({ value: 1_200_000, why: null })
    expect(at(lines, '업무일지 2', '치료별 매출 금액(원)', '크라이오')[0]).toMatchObject({ value: 90_000, why: null })
  })

  it('AC-4213.1: uisCells 131칸이 모두 한 번씩 시트에 있고, 나머지 18줄은 직접 입력이다', async () => {
    const { uisSheetRows } = await loadSheet()
    const day = uisDay()
    const s = allPicked()
    const { lines } = parse(uisSheetRows(day, s))
    const cells = uisCells(day, s)
    expect(cells).toHaveLength(131)
    const seen = new Set(cells.map((c) => lineOf(lines, c.where)))
    expect(seen.size).toBe(131)
    const rest = lines.filter((l) => !seen.has(l))
    expect(rest.map((l) => `${l.journal}|${l.section}|${l.name}`)).toEqual(DIRECT)
  })

  it('AC-4213.1: 기타 이름이 빈 줄(noName)도 값을 쓰고 까닭은 비운다(planUisCells는 값 없음)', async () => {
    const { uisSheetRows } = await loadSheet()
    const day = uisDay()
    const s = allPicked()
    const { lines } = parse(uisSheetRows(day, s))
    const sales = (name: string) => at(lines, '업무일지 2', '치료별 매출 금액(원)', name)
    expect(sales('기타2')).toEqual([{ journal: '업무일지 2', section: '치료별 매출 금액(원)', name: '기타2', value: 30_000, why: null }])
    expect(sales('기타3')[0]).toMatchObject({ value: 20_000, why: null })
    expect(sales('기타4')[0]).toMatchObject({ value: 10_000, why: null })
    const plan = planUisCells(day, s).filter((p) => p.why === 'noName')
    expect(plan).toHaveLength(3)
    for (const p of plan) expect(p.value).toBeNull()
  })

  it('AC-4213.1: 기타 이름이 고정 줄과 같거나 서로 같아도 칸마다 제 값을 쓴다(차례로 짝지음)', async () => {
    const { uisSheetRows } = await loadSheet()
    const { lines } = parse(uisSheetRows(uisDay(), allPicked({ etc1: '도수', etc2: '도수', etc3: '', etc4: '' })))
    expect(at(lines, '업무일지 2', '치료별 매출 금액(원)', '도수').map((l) => l.value)).toEqual([1_200_000, 90_000, 30_000])
    expect(at(lines, '업무일지 2', '치료별 신환/90일초진/재진 건수', '도수 신환').map((l) => l.why)).toEqual([
      WHY.none,
      WHY.none,
      WHY.none,
    ])
    expect(lines).toHaveLength(149)
  })

  it('AC-4213.1: 빈 칸이면 끝 열에 까닭 하나 — 직접 입력 · 의사랑에 없음 · 코드 안 고름 · 못 읽음 · 못 읽음 ({보고서} 없음)', async () => {
    const { uisSheetRows } = await loadSheet()
    // 일일수입통계·예약 아래쪽 표가 없고, 리푸스 건수·물리치료 매출은 코드를 안 고르고, 손발톱케어는 의사랑이 셀 수 없음(null)
    const day = uisDay({ income: { state: 'missing', from: null, to: null }, rsvPatients: { state: 'missing', from: null, to: null } })
    day.groups = day.groups.map((g) => (g.key === 'nail' ? { ...g, patients: null } : g))
    const s = allPicked()
    delete s.counts.lipus
    delete s.sales.pt
    const { lines } = parse(uisSheetRows(day, s))
    const line = (journal: string, section: string, name: string) => at(lines, journal, section, name)[0]

    expect(line('업무일지 1', '외래 수입', 'MOU 감액')).toMatchObject({ value: null, why: WHY.direct })
    expect(line('업무일지 1', '외래 수입', '감액')).toMatchObject({ value: null, why: WHY.none })
    expect(line('업무일지 1', '진료 · 치료현황', '리푸스')).toMatchObject({ value: null, why: WHY.unpicked })
    expect(line('업무일지 2', '치료별 매출 금액(원)', '물리치료')).toMatchObject({ value: null, why: WHY.unpicked })
    expect(line('업무일지 1', '진료 · 치료현황', '손발톱케어')).toMatchObject({ value: null, why: WHY.unknown })
    expect(line('업무일지 1', '외래 수입', '외래 총매출')).toMatchObject({ value: null, why: missingWhy('일일수입통계') })
    expect(line('업무일지 1', '환자현황', '재진')).toMatchObject({ value: null, why: missingWhy('일일수입통계') })
    expect(line('업무일지 2', '예약', '실예약환자수')).toMatchObject({ value: null, why: missingWhy('예약환자통계 아래쪽 표') })

    // 칸마다: 값이 있으면 까닭 없음, 비면 까닭 하나(uisCells 까닭과 같은 글)
    const cells = uisCells(day, s)
    for (const c of cells) {
      const l = lineOf(lines, c.where)
      const want =
        c.why === 'missing' ? missingWhy(c.report === 'income' ? '일일수입통계' : '예약환자통계 아래쪽 표') : c.why && c.why !== 'noName' ? WHY[c.why] : null
      expect(l.why, l.name).toBe(want)
      expect(l.value === null, l.name).toBe(want !== null)
    }
    expect(new Set(lines.map((l) => l.why))).toEqual(
      new Set([null, WHY.direct, WHY.none, WHY.unpicked, WHY.unknown, missingWhy('일일수입통계'), missingWhy('예약환자통계 아래쪽 표')]),
    )
  })

  it('AC-4213.1: 내원 아래쪽 표·처방통계가 없으면 그 보고서 이름으로 못 읽음 까닭을 쓴다', async () => {
    const { uisSheetRows } = await loadSheet()
    const day = uisDay({ rx: { state: 'missing', from: null, to: null }, visitPatients: { state: 'missing', from: null, to: null } })
    const { lines } = parse(uisSheetRows(day, allPicked()))
    expect(at(lines, '업무일지 2', '연령별 신환/90일초진/재진', '40대 신환')[0]).toMatchObject({
      value: null,
      why: missingWhy('내원일별환자현황 아래쪽 표'),
    })
    expect(at(lines, '업무일지 2', '연령별 신환/90일초진/재진', '40대 90일초진')[0]).toMatchObject({ value: null, why: WHY.none })
    expect(at(lines, '업무일지 1', '진료 · 치료현황', '씨암')[0]).toMatchObject({ value: null, why: missingWhy('기간별처방통계') })
    expect(at(lines, '업무일지 2', '치료별 매출 금액(원)', '기타2')[0]).toMatchObject({ value: null, why: missingWhy('기간별처방통계') })
    // 신환·합계는 위쪽 표가 있으면 그것으로 채운다
    expect(at(lines, '업무일지 1', '환자현황', '합계')[0]).toMatchObject({ value: 97, why: null })
  })

  it('AC-4213.1: 직접 입력 18줄은 MOU 감액(감액 다음) · 지출 · 신환경로 · 상담-전환률 자리에 빈 칸 + 직접 입력이다', async () => {
    const { uisSheetRows } = await loadSheet()
    const rows = uisSheetRows(uisDay(), allPicked())
    const { lines } = parse(rows)
    const direct = lines.filter((l) => l.why === WHY.direct)
    expect(direct.map((l) => `${l.journal}|${l.section}|${l.name}`)).toEqual(DIRECT)
    for (const l of direct) expect(l.value).toBeNull()
    const names = rows.map((r) => r[0])
    expect(names.indexOf('MOU 감액')).toBe(names.indexOf('감액') + 1)
    expect(names.indexOf('장애인기금(-)')).toBe(names.indexOf('MOU 감액') + 1)
    // 지출은 입원수입 뒤, 신환경로는 환자현황 뒤, 상담-전환률은 치료별 건수와 연령별 사이
    expect(names.indexOf('지출')).toBe(names.indexOf('수납액') + 1)
    expect(names.indexOf('신환경로')).toBe(names.indexOf('합계') + 1)
    expect(names.indexOf('상담-전환률')).toBe(names.indexOf('기타4 재진') + 1)
    expect(names.indexOf('연령별 신환/90일초진/재진')).toBe(names.indexOf('기타 실행건수') + 1)
  })

  it('AC-4213.1: UIS_SHEET_FIELDS는 머리 14 · 칸 131 · 직접 입력 18이고 직접 입력은 제 구역을 안다', async () => {
    const { UIS_SHEET_FIELDS } = await loadSheet()
    const heads = UIS_SHEET_FIELDS.filter((f) => !('cell' in f) && !('direct' in f))
    const cells = UIS_SHEET_FIELDS.filter((f) => 'cell' in f)
    const direct = UIS_SHEET_FIELDS.filter((f): f is { direct: string; section: string } => 'direct' in f)
    expect(heads).toHaveLength(14)
    expect(cells).toHaveLength(131)
    expect(direct).toHaveLength(18)
    expect(direct.slice(0, 9).map((f) => `${f.section}|${f.direct}`)).toEqual(DIRECT.slice(0, 9).map((d) => d.split('|').slice(1).join('|')))
    expect(new Set(direct.slice(9).map((f) => f.section))).toEqual(new Set(['상담-전환률']))
  })

  it('AC-4213.1: 시트 이름·열 너비·파일 이름', async () => {
    const { UIS_SHEET_NAME, UIS_SHEET_WIDTHS, uisFileName } = await loadSheet()
    expect(UIS_SHEET_NAME).toBe('ERP 마감일지 의사랑')
    expect([...UIS_SHEET_WIDTHS]).toEqual([34, 11, 44])
    expect(uisFileName('2026-11-23')).toBe('ERP마감-의사랑-2026-11-23.xlsx')
  })

  it('AC-4213.1: 환자 정보가 없다 — 글자 칸은 머리 글 · 칸 이름 · 까닭뿐, 값 열은 숫자 또는 빈 칸', async () => {
    const { uisSheetRows } = await loadSheet()
    const day = uisDay({ income: { state: 'missing', from: null, to: null } })
    const rows = uisSheetRows(day, allPicked())
    const { heads, lines } = parse(rows)
    const names = new Set([
      ...J1_LINES.flatMap(([, n]) => n),
      ...j2Lines(ETC_SHOWN).flatMap(([, n]) => n),
    ])
    const reasons = new Set([WHY.direct, WHY.none, WHY.unpicked, WHY.unknown, missingWhy('일일수입통계')])
    expect(rows[0]).toEqual(['항목', '11/23 (월)', '빈 칸 까닭'])
    expect(heads).toEqual(HEADS)
    for (const l of lines) {
      expect(names.has(l.name), l.name).toBe(true)
      expect(l.value === null || (Number.isSafeInteger(l.value) && (l.value as number) >= 0), l.name).toBe(true)
      expect(l.why === null || reasons.has(l.why as string), String(l.why)).toBe(true)
    }
  })

  it('AC-4213.1: workbookBytes로 만든 파일을 SheetJS로 다시 읽으면 같은 칸 값·숫자 칸·글 칸이다', async () => {
    const { uisSheetRows, UIS_SHEET_NAME, UIS_SHEET_WIDTHS } = await loadSheet()
    const day = uisDay({ income: { state: 'missing', from: null, to: null } })
    const rows = uisSheetRows(day, allPicked())
    const bytes = workbookBytes(rows, { sheetName: UIS_SHEET_NAME, widths: UIS_SHEET_WIDTHS }, WHEN)
    const wb = XLSX.read(bytes, { type: 'array' })
    expect(wb.SheetNames).toEqual(['ERP 마감일지 의사랑'])
    const ws = wb.Sheets[wb.SheetNames[0]]
    expect(ws['!ref']).toBe(`A1:C${rows.length}`)
    rows.forEach((row, r) => {
      for (let c = 0; c < 3; c += 1) {
        const want = row[c] ?? null
        const got = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
        const ref = XLSX.utils.encode_cell({ r, c })
        if (want === null) expect(got, ref).toBeUndefined()
        else {
          expect(got?.t, ref).toBe(typeof want === 'number' ? 'n' : 's')
          expect(got?.v, ref).toBe(want)
        }
      }
    })
    // 줄 차례 그대로 다시 읽힌다(빈 줄 없음)
    const back = XLSX.utils.sheet_to_json<SheetValue[]>(ws, { header: 1, defval: null, blankrows: true })
    expect(back.map((r) => r[0])).toEqual(rows.map((r) => r[0]))
  })
})
