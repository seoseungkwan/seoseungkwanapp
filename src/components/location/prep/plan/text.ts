// 개원 준비(비용·손익분기·일정) 화면 글 — requirements '화면 글 기본값' › 개원 준비 그대로(없는 글은 시안 ?s=plan 그대로).
// `틀린 칸 글`·`개원일 안 고름`·`개원일 지남` 셋은 기본값·시안에 없어 이 TASK가 정했다(TASK-41 보고)
import type { CostKey } from '@/lib/location/costs'

/** 칸 단위 종류 — costs.ts의 칸 범위와 같다(만 원 칸 × 10,000 · 원 · 연 % 0.01 단위 · 날 수) */
export type CostUnit = 'man' | 'won' | 'rate' | 'days'

export const UNIT_TEXT: Readonly<Record<CostUnit, string>> = { man: '만 원', won: '원', rate: '%', days: '일' }

/** 칸 글이 원 정수(이자는 소수 둘째 자리)로 읽히지 않을 때 그 칸 아래 글 */
export const UNIT_ERROR: Readonly<Record<CostUnit, string>> = {
  man: '숫자만 적어 주세요. 금액은 만 원 단위 정수예요.',
  won: '숫자만 적어 주세요. 금액은 원 단위 정수예요.',
  rate: '0부터 30까지, 소수 둘째 자리까지 적어 주세요.',
  days: '1부터 31까지 정수로 적어 주세요.',
}

/** 칸 옆에 매물 값을 참고 글로 보이는 칸(칸은 채우지 않는다) */
export type ListingRef = 'deposit' | 'premium' | 'rent' | 'mgmt'

export type CostField = {
  key: CostKey
  label: string
  unit: CostUnit
  help?: string
  ref?: ListingRef
  /** 칸 아래 따로 세어 보이는 값: 인테리어 합계 · 한 달 이자 */
  extra?: 'interior' | 'interest'
}

// 시안 COST 차례(design.md 11절 costs 열쇠)
export const COST_FIELDS: readonly CostField[] = [
  { key: 'deposit', label: '보증금', unit: 'man', ref: 'deposit' },
  { key: 'premium', label: '권리금', unit: 'man', ref: 'premium' },
  { key: 'interior', label: '인테리어(평당)', unit: 'man', extra: 'interior' },
  { key: 'equipment', label: '장비', unit: 'man', help: '엑스레이·충격파·물리치료 기계 등 합계' },
  { key: 'otherStart', label: '그 밖의 준비 비용', unit: 'man', help: '간판·가구·전산·첫 소모품 등' },
  { key: 'rent', label: '월세(한 달)', unit: 'man', ref: 'rent' },
  { key: 'mgmt', label: '관리비(한 달)', unit: 'man', ref: 'mgmt' },
  { key: 'payroll', label: '직원 인건비(한 달 합계)', unit: 'man', help: '물리치료사·간호조무사·접수 직원 월급 합계를 직접 적어요' },
  { key: 'otherMonth', label: '그 밖의 운영비(한 달)', unit: 'man', help: '소모품·약·전기·보험·광고 등' },
  { key: 'loan', label: '대출', unit: 'man', help: '처음에 드는 돈에서 빼요' },
  { key: 'rateBp', label: '대출 이자(해마다)', unit: 'rate', help: '한 달 이자로 바꿔 고정비에 넣어요', extra: 'interest' },
]

export const BREAK_EVEN_FIELDS: readonly CostField[] = [
  { key: 'perPatient', label: '환자 1명당 평균 수입', unit: 'won', help: '직접 적어요(건강보험에서 받는 돈 + 환자가 내는 돈)' },
  { key: 'workDays', label: '한 달 진료일', unit: 'days', help: '예: 평일 22일 + 토요일 4일' },
]

/** 값 없는 금액 */
export const EMPTY = '–'

export const PLAN_TEXT = {
  // 지금 의원 체외충격파 값
  eswtTitle: '지금 의원 체외충격파 값',
  eswtAside: '후보 자세히 › 경쟁 의원 진료비에서 둘레 의원 값과 견줘요 · 모든 후보에 같이 써요',
  eswtLabel: '체외충격파 1회 값',
  eswtHelp: '지금 의원에서 받는 값을 직접 적어요. 비우면 견주지 않아요.',

  // 개원 비용 계산
  costTitle: '개원 비용 계산',
  costAside: '빈칸에서 직접 적어요 · 금액은 만 원',
  listingRef: (money: string) => `매물에 적은 값: ${money}`,
  interiorTimes: (pyeong: string) => `× 전용 ${pyeong}평`,
  interiorTotal: '인테리어 합계',
  interest: '한 달 이자',
  sixMonths: '6개월 고정비',
  sixMonthsHelp: '(월세 + 관리비 + 직원 인건비 + 그 밖의 운영비 + 한 달 이자) × 6',
  breakEvenFields: '손익분기에 쓰는 두 칸',

  // 합계 판
  sumTitle: '합계',
  sumDepositPremium: '보증금 + 권리금',
  sumInterior: '인테리어',
  sumEquipment: '장비 · 그 밖의 준비',
  sumStart: '처음에 드는 돈',
  sumMine: '대출 빼면 내 돈',
  loanOver: '대출이 더 많아요',
  blanks: (n: number) => `빈칸 ${n}개는 0으로 더했어요.`,
  allBlank: '칸을 채우면 여기서 더해요.',
  breakEven: '손익분기',
  monthlyFixed: '한 달 고정비',
  perDay: (n: string) => `하루 ${n}`,
  perDayUnit: '명',
  breakEvenHelp: '이만큼 와야 한 달 고정비를 넘겨요.',
  breakEvenMissing: '고정비 칸과 아래 두 칸을 채우면 계산돼요.',
  ownerShare: '원장 몫은 들어 있지 않아요',

  // 개원 일정표
  scheduleTitle: '개원 일정표',
  scheduleAside: '개원일에서 거꾸로 세요 · 차례는 조문에서 끌어낸 어림이에요(보통 3~6개월)',
  openOn: '개원일',
  daysLeft: (today: string, n: string) => `오늘(${today})부터 ${n}일 남았어요.`,
  daysPast: (n: string) => `개원일이 ${n}일 지났어요.`,
  noOpenOn: '개원일을 고르면 그날에서 거꾸로 센 할 일과 날짜가 나와요.',
  colDone: '했음',
  colTask: '할 일',
  colDate: '날짜',
  colUntil: '개원까지',
  colNote: '메모',
  doneLabel: (task: string) => `${task} 했음`,
  onTheDay: '당일',
  daysBefore: (n: number) => `${n}일 전`,
  past: '날짜가 지났어요',
  law: '법 근거',
} as const

/** 요일(dates.ts weekdayOf: 월 1 ~ 일 7) */
export const WEEKDAY = ['월', '화', '수', '목', '금', '토', '일'] as const
