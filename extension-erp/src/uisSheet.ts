// [엑셀로 받기] 시트 모양(spec erp-uisarang design.md 7-1·8-5, TASK-10). 의사랑 답 + 설정 → 시트 줄(xlsxWrite.ts workbookBytes에 넘긴다)
// - 줄 차례는 ERP 화면 차례(UIS_SHEET_FIELDS, specs/erp-closing-fill/notes/erp-closing-fields.md 2절 배치). 값·까닭은 uisCells 그대로이고
//   기타 이름이 빈 줄(noName)도 값을 쓴다(엑셀에서는 줄 이름이 필요 없어서)
// - ERP에 있지만 의사랑에서 오지 않는 직접 입력 칸(MOU 감액 · 지출 · 신환경로 · 상담-전환률)도 빈 칸 + '직접 입력'으로 넣어 손으로 넣을 칸이 한눈에 보이게 한다
// - 글자 칸은 머리 글 · 칸 이름 · 까닭 글뿐이다. 답에는 합계 숫자만 있어 환자 정보는 받을 자리가 없다
import type { Where } from './cells.js'
import { RSV_NAMES, RSV_ROWS, type EtcKey } from './types.js'
import { uisCells, type UisCell } from './uisCells.js'
import { UIS_REPORT_NAMES, UIS_TEXT } from './uisText.js'
import type { UisDay, UisSettings } from './uisTypes.js'
import type { SheetValue } from './xlsxWrite.js'

export const UIS_SHEET_NAME = 'ERP 마감일지 의사랑'
/** 열 너비 A 34 · B 11 · C 44(design.md 7-1) */
export const UIS_SHEET_WIDTHS: readonly number[] = Object.freeze([34, 11, 44])

/** 시트 한 줄: 머리(업무일지 · 구역 · 묶음) · uisCells 칸 하나 · 직접 입력 칸(이름과 놓인 구역) */
export type UisSheetField = { section: string } | { cell: Where } | { direct: string; section: string }

/** 1행 머리 글·요일(design.md 7-1 글자 그대로) */
const HEAD = { item: '항목', why: '빈 칸 까닭' }
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const J1 = '업무일지 1'
const J2 = '업무일지 2'

const head = (section: string): UisSheetField => ({ section })
const direct = (section: string, name: string): UisSheetField => ({ direct: name, section })

/** 업무일지 1 구역: 머리 + 줄마다 칸(directRows에 든 줄은 직접 입력) */
function box(name: string, rows: readonly string[], directRows: readonly string[] = []): UisSheetField[] {
  return [head(name), ...rows.map((row) => (directRows.includes(row) ? direct(name, row) : { cell: { j: 1 as const, box: name, row } }))]
}
/** 업무일지 2 표 묶음: 머리 + 줄 × 열(줄마다 열 차례) */
function card(name: string, rows: readonly string[], cols: readonly string[]): UisSheetField[] {
  return [head(name), ...rows.flatMap((row) => cols.map((col) => ({ cell: { j: 2 as const, card: name, row, col } })))]
}

const THREE = ['신환', '90일초진', '재진']
/** 기타 줄은 이름 없는 자리(기타1~4)로 둔다 — 시트 이름은 설정의 기타 이름을 쓴 칸에서 가져온다 */
const ETC_ROWS = ['기타1', '기타2', '기타3', '기타4']
const AGE_ROWS = ['10대미만', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80대', '90대']
const SALES_ROWS = ['씨암', 'SONO', '관절조영', '도수', '충격파', '물리치료', ...ETC_ROWS]
const CONSULT = '상담-전환률'

/** design.md 7-1 UIS_SHEET_FIELDS(ERP 화면 차례). 칸 131 · 직접 입력 18 · 머리 14 */
export const UIS_SHEET_FIELDS: readonly UisSheetField[] = Object.freeze([
  head(J1),
  ...box('진료 · 치료현황', ['씨암', 'SONO', '도수상담', '도수치료', '충격파(체충)', '관절조영술', '리푸스', '손발톱케어', 'CT', '수술']),
  ...box(
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
    ['MOU 감액'],
  ),
  ...box('입원수입', ['청구', '비급여', '본인부담금', '수납액']),
  ...box('지출', ['현금', '카드', 'FREE'], ['현금', '카드', 'FREE']),
  ...box('환자현황', ['신환', '90일초진', '재진', '물리치료내원', '진찰료 산정안함', '합계']),
  ...box('신환경로', ['지인소개', '간판', '인터넷', '홍보물', '기타'], ['지인소개', '간판', '인터넷', '홍보물', '기타']),
  head(J2),
  ...card(
    '예약',
    RSV_ROWS.map((r) => RSV_NAMES[r]),
    ['총갯수', '내원', '변경', '취소'],
  ),
  { cell: { j: 2, card: '예약', row: '실예약환자수', col: '총갯수' } },
  ...card('치료별 신환/90일초진/재진 건수', ['씨암(주사)', 'SONO(주사)', '관절조영', '도수', '충격파', ...ETC_ROWS], THREE),
  head(CONSULT),
  ...['도수치료', '체외충격파', '기타'].flatMap((row) => ['상담건수', '예약건수', '실행건수'].map((col) => direct(CONSULT, `${row} ${col}`))),
  ...card('연령별 신환/90일초진/재진', AGE_ROWS, THREE),
  head('운영 지표'),
  ...['도수 총금액', '충격파 총금액', 'ESWT Standard', 'ESWT Radial', '주사1회환자', '신환주사환자', '신환주사건수'].map(
    (field): UisSheetField => ({ cell: { j: 2, field } }),
  ),
  head('치료별 매출 금액(원)'),
  ...SALES_ROWS.map((row): UisSheetField => ({ cell: { j: 2, card: '치료별 매출', row, col: '금액(원)' } })),
])

/** 칸 자리 글자 열쇠: 1|구역|줄 · 2|묶음|줄|열 · 2|낱칸 */
function placeKey(w: Where): string {
  if (w.j === 1) return `1|${w.box}|${w.row}`
  if ('field' in w) return `2|${w.field}`
  return `2|${w.card}|${w.row}|${w.col}`
}

/** 시트 칸 이름(design.md 7-1): 업무일지 1 = 줄 · 업무일지 2 표 = '{줄} {열}'(치료별 매출·실예약환자수는 줄만) · 낱칸 = 칸 이름 */
function nameOf(w: Where): string {
  if (w.j === 1) return w.row
  if ('field' in w) return w.field
  return w.card === '치료별 매출' || w.row === '실예약환자수' ? w.row : `${w.row} ${w.col}`
}

/** 빈 칸 까닭 글. 값이 있는 칸(noName 포함)은 null */
function whyOf(c: UisCell): string | null {
  switch (c.why) {
    case 'none':
      return UIS_TEXT.why.none
    case 'unpicked':
      return UIS_TEXT.why.unpicked
    case 'unknown':
      return UIS_TEXT.why.unknown
    case 'missing':
      return c.report ? UIS_TEXT.why.missing(UIS_REPORT_NAMES[c.report]) : UIS_TEXT.why.unknown
    default:
      return c.value === null ? UIS_TEXT.why.unknown : null
  }
}

/** 'YYYY-MM-DD' → '{M/D} ({요일})'. 요일은 달력 날짜를 UTC로 세어 이 PC 시간대와 상관없다 */
function dayHead(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d} (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

const NO_ETC_NAMES: Record<EtcKey, string> = { etc1: '', etc2: '', etc3: '', etc4: '' }

/**
 * 의사랑 답 + 설정 → 시트 줄(design.md 7-1): 1행 [항목, {M/D} ({요일}), 빈 칸 까닭] → UIS_SHEET_FIELDS 차례로
 * 머리 줄 [글] · 칸 줄 [이름, 숫자 또는 null, 까닭 또는 null]
 */
export function uisSheetRows(day: UisDay, s: UisSettings): SheetValue[][] {
  const cells = uisCells(day, s)
  // 기타 줄 이름은 설정마다 다르고 고정 줄 이름과 겹칠 수도 있어, 이름 없는 설정으로 같은 차례의 칸 자리(기타1~4)를 얻어 차례로 짝짓는다
  const places = uisCells(day, { ...s, etcNames: NO_ETC_NAMES }).map((c) => placeKey(c.where))
  const byPlace = new Map(places.map((k, i) => [k, cells[i]]))
  if (places.length !== cells.length || byPlace.size !== cells.length) throw new Error('uis sheet cells')

  const rows: SheetValue[][] = [[HEAD.item, dayHead(day.date), HEAD.why]]
  for (const f of UIS_SHEET_FIELDS) {
    if ('direct' in f) rows.push([f.direct, null, UIS_TEXT.why.direct])
    else if ('cell' in f) {
      const c = byPlace.get(placeKey(f.cell))
      if (!c) throw new Error('uis sheet field')
      rows.push([nameOf(c.where), c.value === null ? null : Number(c.value), whyOf(c)])
    } else rows.push([f.section])
  }
  return rows
}

/** 받는 파일 이름(design.md 7-1) */
export function uisFileName(date: string): string {
  return `ERP마감-의사랑-${date}.xlsx`
}
