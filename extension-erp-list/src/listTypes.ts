// 'ERP 마감일지 입력 목록' 목록 모양 타입과 새 화면 글 한 곳(spec erp-copy-list design.md 4절·7절, AC-3901.7)
// - 새로 쓴 글은 승인 시안 docs/mockups/erp-copy-list/index.html 글자 그대로다(listTypes.test.ts가 시안을 그려 견준다)
// - 지금 확장에 있는 글(설정 열기·시작일·끝일·막는 글·비트에서 읽는 중…·그만두기·처음 한 번·오류 글·진료 0건 머리 글·씨암·SONO 줄)은
//   여기 다시 적지 않고 그 모듈 상수(panel.js TEXT·FLOW_TEXT·SKIP_TEXT·OVERLAP_TEXT, rangeView.js RANGE_TEXT, errors.js explain)를 쓴다
// - 날짜 글(shortDay·dayHead·isSunday)은 달력 날짜로 센다(이 PC 시간대와 상관없음)
import { HELD_SALES, type Planned } from '../../extension-erp/src/cells.js'
import { SKIP_TEXT, TEXT } from '../../extension-erp/src/panel.js'
import { GROUP_NAMES } from '../../extension-erp/src/types.js'

/** 값 없는 칸의 까닭(cells.ts planCells why) */
export type Why = NonNullable<Planned['why']>

/** '빈 칸 까닭' 상자·엑셀 끝 열 차례 */
export const WHY_ORDER: readonly Why[] = ['unpicked', 'unknown', 'held', 'noName']

/** 까닭마다 줄 이름 옆 꼬리표 · 칸 안 작은 글 · 마우스를 올리면 보이는 긴 글 */
export const WHY_TEXT: Readonly<Record<Why, { tag: string; cell: string; help: string }>> = {
  unpicked: {
    tag: '코드를 고르지 않음',
    cell: '코드 안 고름',
    help: '설정에서 코드를 고르지 않은 항목이라 비워 두었어요. 직접 넣거나 [설정 열기]에서 코드를 고른 뒤 목록을 다시 만들어 주세요.',
  },
  unknown: { tag: '비트로 셀 수 없음', cell: '셀 수 없음', help: '비트로 셀 수 없어 비워 두었어요. 직접 넣어 주세요.' },
  // 지금 보류 묶음(HELD_SALES)은 비어 있어 실제로는 나오지 않는다
  held: { tag: '보류 중', cell: '보류', help: TEXT.held(HELD_SALES.map((key) => GROUP_NAMES[key])) },
  noName: { tag: 'ERP 줄 이름 없음', cell: '줄 이름 없음', help: SKIP_TEXT.noName.help },
}

const ZERO = '진료 0건'

/** 새 화면 글(시안 그대로) */
export const LIST_TEXT = {
  /** 탭 제목·머리 h1·엑셀 시트 이름 */
  title: 'ERP 마감일지 입력 목록',
  make: '목록 만들기',
  xlsx: '엑셀로 받기',
  /** 처음 안내(시안 ①) 세 줄. lead가 굵은 첫 줄 */
  hint: {
    lead: '기간을 고르고 [목록 만들기]를 눌러 주세요.',
    body: '날마다 비트 숫자를 세어, [비트 값 채우기]가 채우는 ERP 칸 차례대로 표를 만들어요. 줄은 ERP 칸, 열은 날짜예요.',
    copy: '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요.',
  },
  /** [설정 열기]·처음 한 번 뒤 쪽지 */
  settingsOpened: '설정 화면을 새 탭으로 열었어요.',
  /** 오류 안내 작은 줄(시안 ⑤) */
  failed: (code: string) => `목록을 만들지 못했어요. (번호 ${code})`,
  /** 목록 위 굵은 기간 */
  period: (from: string, to: string) => `${from} ~ ${to}`,
  /** 굵은 기간 뒤 */
  size: (days: number, rows: number) => ` · ${days}일 · 날마다 ${rows}칸`,
  sumHelp: '숫자 칸을 누르면 복사돼요. ERP 칸에 붙여 넣어 주세요. 빈 칸은 아래 까닭을 보고 직접 넣어 주세요.',
  /** when = 'YYYY-MM-DD HH:MM'(이 PC 시각) */
  madeAt: (when: string) => `목록을 만든 때 ${when}`,
  /** 표가 상자보다 넓을 때만 */
  slide: '표를 옆으로 밀면 다른 날짜가 보여요. 항목 칸은 왼쪽에 그대로 있어요.',
  /** 표 첫 칸 머리·엑셀 A1 */
  head: '항목',
  /** 진료 0건인 날 머리 작은 줄 */
  zero: ZERO,
  /** 엑셀 1행 진료 0건인 날 머리 뒤(화면 글과 같음) */
  xlsxZero: ` ${ZERO}`,
  /** 숫자 칸 title */
  copyTitle: '누르면 복사돼요',
  journal1: '업무일지 1',
  journal2: '업무일지 2',
  /** 업무일지 2 낱칸 묶음 머리 */
  ops: '운영 지표',
  /** 치료별 매출 머리 옆 작은 글 */
  salesSub: '금액(원)',
  /** 빈 칸 까닭 상자 제목·엑셀 끝 열 머리 */
  legend: '빈 칸 까닭',
  /** 경고 상자 줄 */
  warn: (day: string, line: string) => `${day}: ${line}`,
  copied: '복사했어요',
  /** 복사 쪽지 꼬리 '{M/D} · {묶음} {줄}[ {열}] · {값}'. col이 null이면 열을 붙이지 않는다 */
  copyTail: (day: string, section: string, name: string, col: string | null, value: string) =>
    `${day} · ${section} ${name}${col === null ? '' : ` ${col}`} · ${value}`,
  copyFailed: '복사하지 못했어요. 다시 눌러 주세요.',
  saved: '엑셀 파일을 받았어요',
  fileName: (from: string, to: string) => `ERP마감일지_입력목록_${from}_${to}.xlsx`,
  foot: '환자 이름 · 차트번호는 이 PC의 도우미 밖으로 나가지 않아요. 이 화면은 ERP를 건드리지 않아요. 숫자는 직접 붙여 넣고, 저장은 ERP에서 직접 눌러요.',
  /** 요일(일요일부터) */
  weekdays: ['일', '월', '화', '수', '목', '금', '토'],
} as const

/** 쪽지가 보이는 시간 */
export const TOAST_MS = 1800

/** 업무일지 1 상자의 ERP 화면 차례(specs/erp-closing-fill/notes/erp-closing-fields.md 2절) */
export const SCREEN_BOXES = ['진료 · 치료현황', '외래 수입', '입원수입', '환자현황'] as const

/** 상자·묶음 머리 → 쪽지에 쓰는 짧은 이름(없으면 머리 그대로). fill.ts 짧은 이름과 같다 */
export const SHORT_SECTION: Readonly<Record<string, string>> = {
  '진료 · 치료현황': '치료현황',
  '치료별 신환/90일초진/재진 건수': '치료별 건수',
  '연령별 신환/90일초진/재진': '연령별',
}

/** 표 칸 하나: 값(쉼표 없는 정수 글자) 또는 비운 까닭 */
export type ListCell = { value: string } | { why: Why }

/** 표 줄 하나 */
export type ListLine =
  /** '업무일지 1' · '업무일지 2' */
  | { kind: 'journal'; text: string }
  /** 상자·묶음 머리. 치료별 매출만 sub '금액(원)' */
  | { kind: 'section'; text: string; sub?: string }
  /** 숫자 줄. key = 칸 자리(JSON), section = 쪽지 짧은 이름, cells = 날짜 차례, rowWhy = 모든 날 같은 까닭이면 그것 */
  | { kind: 'row'; key: string; section: string; name: string; col: string | null; cells: ListCell[]; rowWhy: Why | null }

/** 목록 화면·엑셀이 같이 쓰는 모양 */
export type ListModel = {
  from: string
  to: string
  days: { date: string; zero: boolean }[]
  lines: ListLine[]
  /** 숫자 줄 수('날마다 {R}칸') */
  rowCount: number
  /** 나온 까닭(WHY_ORDER 차례) */
  reasons: Why[]
  /** 표 위 경고 상자 줄(이미 '{M/D}: {경고 글}' 꼴) */
  warnings: string[]
  /** '빈 칸 까닭' 상자 끝 씨암·SONO 줄, 없으면 null */
  overlap: string | null
}

/** 'YYYY-MM-DD' → 숫자 셋 */
function ymd(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

/** 'YYYY-MM-DD' → 'M/D' */
export function shortDay(date: string): string {
  const { m, d } = ymd(date)
  return `${m}/${d}`
}

/** 요일 번호(0 = 일요일). 달력 날짜를 UTC로 세어 이 PC 시간대와 상관없다 */
function weekday(date: string): number {
  const { y, m, d } = ymd(date)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 'YYYY-MM-DD' → '{M/D} ({요일})' 머리 글 */
export function dayHead(date: string): string {
  return `${shortDay(date)} (${LIST_TEXT.weekdays[weekday(date)]})`
}

/** 일요일인가(머리 요일 글 주황) */
export function isSunday(date: string): boolean {
  return weekday(date) === 0
}
