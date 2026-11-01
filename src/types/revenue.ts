// 명령 revenue.days의 답 모양(spec revenue design.md 5-2). 매출 탭과 업무일지가 같이 쓰는 계약이다.
// 칸을 더하거나 바꾸면 이 파일·lib/bridge/revenueResult.ts·도우미·sales_days를 함께 바꾸는 명세 변경이다(두 명세를 같이 고친다)

/** 하루 한 줄. 숫자는 0 이상 정수(금액은 원, 원 미만 버림). 정할 수 없으면 null */
export type RevenueDayRow = {
  date: string // YYYY-MM-DD
  visits: number | null
  newPatients: number | null
  returnVisits: number | null
  /** from부터 그날까지 다녀간 서로 다른 환자 수(도우미가 비트 DB 안에서 센다) */
  patientsToDate: number | null
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
  /** 금액을 세지 않은 날: ① 환불·변경수납·예치금·수납 연결 중복(세 검사) ② insurer + copay ≠ 요양비용총액(금액 맞춤 검사) ③ 금액 아홉 칸 가운데 음수. 까닭은 답에 없다 */
  unconfirmed: boolean
}

/** 날 줄의 칸(정확히 이것뿐) */
export const REVENUE_DAY_KEYS = [
  'date',
  'visits',
  'newPatients',
  'returnVisits',
  'patientsToDate',
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
] as const satisfies readonly (keyof RevenueDayRow)[]

/** 금액 아홉 칸. unconfirmed면 모두 null, 아니면 모두 숫자 */
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

/** 기간 전체의 처방 코드 한 줄. amount는 처방일 기준 금액(수납액 아님), 값 빠짐이면 null */
export type RevenueCodeRow = { code: string; name: string | null; count: number; amount: number | null }

/** 코드 줄의 칸(정확히 이것뿐) */
export const REVENUE_CODE_KEYS = ['code', 'name', 'count', 'amount'] as const satisfies readonly (keyof RevenueCodeRow)[]

export type RevenueDaysResult = { days: RevenueDayRow[]; codes: RevenueCodeRow[] }

/** 처방 코드 모양. 예약 코드 _REST = 모양이 맞지 않거나 1,000개를 넘쳐 합친 나머지(이름 없음) */
export const REVENUE_CODE_SHAPE = /^[0-9A-Za-z가-힣_.\-]{1,30}$/
export const REVENUE_REST_CODE = '_REST'
/** 한 번에 읽는 날 수 한도(commands.json maxDays와 같다) */
export const REVENUE_MAX_DAYS = 31
export const REVENUE_MAX_CODES = 1000
/** 처방 이름 글자 수 한도(1~100자) */
export const REVENUE_NAME_MAX = 100
