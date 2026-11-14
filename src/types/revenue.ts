// 명령 revenue.days의 답 모양(spec revenue design.md 5-2). 매출 탭과 업무일지가 같이 쓰는 계약이다.
// 칸을 더하거나 바꾸면 이 파일·lib/bridge/revenueResult.ts·도우미·sales_days를 함께 바꾸는 명세 변경이다(두 명세를 같이 고친다)

/** 하루 한 줄. 숫자는 0 이상 정수(금액은 원, 원 미만 버림). 정할 수 없으면 null */
export type RevenueDayRow = {
  date: string // YYYY-MM-DD
  visits: number | null
  newPatients: number | null
  returnVisits: number | null
  total: number | null
  insurer: number | null
  noncovered: number | null
  /** 급여 본인부담금(요양비용총액 = insurer + copay) */
  copay: number | null
  /** 기타 = total − (insurer + copay) − noncovered. 나머지라서 총액에 섞인 다른 금액도 여기에 든다 */
  otherTotal: number | null
  cash: number | null
  card: number | null
  transfer: number | null
  receivableIn: number | null
  /** 그날 금액을 셀 수 없음, 금액 아홉 칸 모두 null: ① 환불·변경수납·예치금·수납 연결 중복(세 검사) ② total·cash·card·transfer·receivableIn 가운데 음수. 까닭은 답에 없다 */
  unconfirmed: boolean
  /** 나눔만 셀 수 없음, insurer·noncovered·copay·otherTotal만 null이고 남는 다섯 칸은 숫자: ① insurer + copay ≠ 요양비용총액(금액 맞춤 검사) ② 그 네 칸 가운데 음수. unconfirmed와 함께 참이 되지 않는다. 까닭은 답에 없다 */
  splitUnconfirmed: boolean
}

/** 날 줄의 칸(정확히 이것뿐) */
export const REVENUE_DAY_KEYS = [
  'date',
  'visits',
  'newPatients',
  'returnVisits',
  'total',
  'insurer',
  'noncovered',
  'copay',
  'otherTotal',
  'cash',
  'card',
  'transfer',
  'receivableIn',
  'unconfirmed',
  'splitUnconfirmed',
] as const satisfies readonly (keyof RevenueDayRow)[]

/** 금액 아홉 칸. unconfirmed면 모두 null, splitUnconfirmed면 REVENUE_SPLIT_KEYS 넷만 null, 둘 다 거짓이면 모두 숫자 */
export const REVENUE_MONEY_KEYS = [
  'total',
  'insurer',
  'noncovered',
  'copay',
  'otherTotal',
  'cash',
  'card',
  'transfer',
  'receivableIn',
] as const satisfies readonly (keyof RevenueDayRow)[]

/** 나눔 네 칸. splitUnconfirmed면 이 넷만 null */
export const REVENUE_SPLIT_KEYS = ['insurer', 'noncovered', 'copay', 'otherTotal'] as const satisfies readonly (keyof RevenueDayRow)[]

/** 남는 다섯 칸. splitUnconfirmed여도 숫자 */
export const REVENUE_KEPT_KEYS = ['total', 'cash', 'card', 'transfer', 'receivableIn'] as const satisfies readonly (keyof RevenueDayRow)[]

/** 기간 전체의 처방 코드 한 줄. amount는 처방일 기준 금액(수납액 아님), 값 빠짐이면 null */
export type RevenueCodeRow = { code: string; name: string | null; count: number; amount: number | null }

/** 코드 줄의 칸(정확히 이것뿐) */
export const REVENUE_CODE_KEYS = ['code', 'name', 'count', 'amount'] as const satisfies readonly (keyof RevenueCodeRow)[]

/** 날 단위 처방 한 줄(도우미 0.6.0부터, specs/stats-revenue): [날짜, 코드, 건수, 금액 또는 null(값 빠짐)] */
export type RevenueDayCodeRow = readonly [date: string, code: string, count: number, amount: number | null]

/** dayCodes 없음 = 옛 도우미(0.6.0 전). 있으면 날 줄과 같은 기간의 날 단위 처방 줄 */
export type RevenueDaysResult = { days: RevenueDayRow[]; codes: RevenueCodeRow[]; dayCodes?: RevenueDayCodeRow[] }

/** 저장된 날 줄(읽기용). dayCodes = 그날 날 단위 처방 줄을 함께 저장했는지(sales_days.day_codes) */
export type SavedRevenueDay = RevenueDayRow & { dayCodes: boolean }
/** 범위 안 날 단위 처방 줄을 코드마다 더한 것(sales_code_totals). amount는 null을 뺀 합, missing = 금액이 빠진 줄이 있었음 */
export type RevenueCodeTotal = { code: string; count: number; amount: number; missing: boolean }
/** 옛 달 합계 한 줄(sales_codes). month는 'YYYY-MM' */
export type RevenueMonthCode = RevenueCodeRow & { month: string }

/** 처방 코드 모양. 예약 코드 _REST = 모양이 맞지 않거나 1,000개를 넘쳐 합친 나머지(이름 없음) */
export const REVENUE_CODE_SHAPE = /^[0-9A-Za-z가-힣_.\-]{1,30}$/
export const REVENUE_REST_CODE = '_REST'
/** 한 번에 읽는 날 수 한도(commands.json maxDays와 같다) */
export const REVENUE_MAX_DAYS = 31
export const REVENUE_MAX_CODES = 1000
/** dayCodes 하루 줄 수 한도(도우미 MaxDayCodesPerDay와 같다. 넘친 날은 도우미가 _REST로 접는다) */
export const REVENUE_DAY_CODES_PER_DAY = 300
/** dayCodes 한 답의 줄 수 한도 = REVENUE_MAX_DAYS × REVENUE_DAY_CODES_PER_DAY(save_revenue_range도 9,300줄까지 받는다) */
export const REVENUE_MAX_DAY_CODES = 9300
/** 처방 이름 글자 수 한도(1~100자) */
export const REVENUE_NAME_MAX = 100
