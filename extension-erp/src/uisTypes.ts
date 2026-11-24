// 의사랑판(spec erp-uisarang) 공용 이름표와 도우미 답 모양(design.md 8-1·3-2·3-3). 도우미 C# 모델 칸 이름도 같다.
// 비트 이름표(types.ts)는 그대로 두고 여기서 더하기만 한다. 글자만 두고 types.ts는 type으로만 부른다
import type { AgeBand, EtcKey } from './types.js'

/** 의사랑 설정을 두는 chrome.storage.local 칸(비트 erpClosing과 따로, design.md 9-2) */
export const UIS_SETTINGS_KEY = 'erpClosingUis'
/** [코드 목록 읽기]로 받은 처방 코드 목록 칸(설정 [저장]과 따로 곧바로 쓴다, design.md 9-2) */
export const UIS_CODES_KEY = 'erpClosingUisCodes'

/** 의사랑 보고서 6개. 차례 = 저장할 엑셀 번호 = 답 uis.reports 차례(design.md 5-1) */
export const UIS_KINDS = Object.freeze(['income', 'rx', 'visits', 'visitPatients', 'rsv', 'rsvPatients'] as const)
export type UisKind = (typeof UIS_KINDS)[number]
/** 꼭 있어야 할 4개(일일수입통계·기간별처방통계·두 아래쪽 표). 위쪽 표 둘은 맞춰 보기만(design.md 2절 1) */
export const UIS_REQUIRED: readonly UisKind[] = Object.freeze(['income', 'rx', 'visitPatients', 'rsvPatients'])
/** 환자 정보가 든 환자별 표(알아본 바로 뒤 지운다, design.md 5-5) */
export const UIS_PATIENT: readonly UisKind[] = Object.freeze(['visitPatients', 'rsvPatients'])

/** '건수로 셀 코드'를 고르는 묶음 13개(closing.day groups, design.md 3-1). 차례 = GROUP_KEYS 차례 */
export const UIS_COUNT_KEYS = Object.freeze([
  'carm',
  'sono',
  'arthro',
  'manual',
  'eswt',
  'manualConsult',
  'lipus',
  'nail',
  'ct',
  'surgery',
  'eswtStd',
  'eswtRadial',
  'ptVisit',
] as const)
/** '매출로 셀 코드'를 고르는 묶음 10개(closing.day sales key enum, design.md 3-1). 차례 = GROUP_KEYS 차례 */
export const UIS_SALES_KEYS = Object.freeze(['carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4'] as const)
export type UisCountKey = (typeof UIS_COUNT_KEYS)[number]
export type UisSalesKey = (typeof UIS_SALES_KEYS)[number]

/** 보고서 상태(design.md 3-2): missing = 파일도 모아 둔 값도 없음 */
export type UisState = 'ok' | 'missing' | 'otherDate' | 'notAll' | 'twice'
/**
 * 보고서 하나(design.md 3-2). cached = 이번엔 파일이 없어 모아 둔 값을 씀(state는 ok). from·to = 조회일(없으면 null,
 * 예약 아래쪽 표는 예약일). value = notAll일 때 '전체'가 아닌 라벨 값. columns = 못 찾은 칸 이름(design.md 5-3)
 */
export type UisReport = {
  kind: UisKind
  state: UisState
  cached: boolean
  from: string | null
  to: string | null
  value: string | null
  columns: string[]
}

/** 엑셀 폴더 자리(design.md 2절 8): 바탕화면 › ERP마감 · 바탕화면이 OneDrive 안이면 사용자 폴더 › ERP마감 */
export type UisFolder = 'desktop' | 'profile'

/** 0 이상 정수 또는 의사랑이 모르는 값 null(design.md 3-2 'N') */
type N = number | null
/** 맞춰 보기 한 칸 [왼쪽, 오른쪽](design.md 6-2). 둘 가운데 하나라도 없으면 null */
export type UisPair = [number, number] | null
export type UisChecks = {
  totalFee: UisPair
  received: UisPair
  headcount: UisPair
  rxTotal: UisPair
  visitRows: UisPair
  visitNew: UisPair
  rsvRows: UisPair
  rsvVisited: UisPair
  /** 아래쪽 내원 표에 조회일 라벨이 없음 */
  noDate: boolean
}

/**
 * 의사랑 closing.day 답(design.md 3-2 모양 그대로). 비트 답(types.ts ClosingDay)과 칸 이름·차례가 같고, 의사랑이 모르는 칸은 null이다.
 * 의사랑만의 것은 source·uis에 더한다
 */
export type UisDay = {
  /** 'YYYY-MM-DD' */
  date: string
  patients: { new: N; first90: null; return: N; ptVisit: N; noExamFee: N; total: N }
  /** args groups 차례 { patients = 건수, total = 같은 key의 sales 합 } → sales에만 있는 key를 sales 차례로 { patients: null, total } */
  groups: {
    key: UisCountKey | UisSalesKey
    patients: N
    total: N
    unpaidVisits: null
    new: null
    first90: null
    return: null
  }[]
  /** 늘 10줄, band 차례 */
  ages: { band: AgeBand; new: N; first90: null; return: N }[]
  money: {
    total: N
    insurer: N
    receivableIn: null
    unpaidNew: null
    noncovered: N
    discount: null
    disabledFund: null
    received: N
    card: N
    cash: N
    transfer: null
    refund: null
  }
  inpatientVisits: null
  reservations: { kinds: []; patients: N }
  injection: null
  overlap: null
  warnings: { moneyUnconfirmed: false; splitUnconfirmed: false; unpaidVisits: 0; unknownAge: number; noHistory: false }
  source: 'uisarang'
  uis: {
    folder: UisFolder
    /** 늘 6개, UIS_KINDS 차례 */
    reports: UisReport[]
    /** 한셀 등에 열려 읽지 못한 파일의 보고서(파일 이름으로 짐작, design.md 5-4) */
    open: (UisKind | 'unknown')[]
    /** 이번에 지운 파일 수(종류 모름 포함) */
    deleted: number
    /** 남겨 둔 파일 수(날짜 다름·같은 날 둘) */
    kept: number
    deleteFailed: number
    /** 종류 모름·깨짐·20MB 넘음으로 지운 파일 수 */
    unknownFiles: number
    checks: UisChecks
    /** 소수 총투여량 때문에 null로 둔 건수 묶음 key */
    fractional: UisCountKey[]
    negative: ('return' | 'noExamFee')[]
    /** 예약 참고 숫자(design.md 6-1): 위쪽 표 { 예약건수, 이행건수 } 또는 아래쪽 표 { 줄 수, 방문 줄 수 } */
    reservations: { total: number; visited: number } | null
  }
}

/** 의사랑 closing.day args(design.md 3-1). 코드를 고른 묶음만, UIS_*_KEYS 차례 */
export type UisDayArgs = {
  date: string
  groups: { key: UisCountKey; codes: string[] }[]
  sales: { key: UisSalesKey; codes: string[] }[]
}

/** 의사랑 설정(design.md 9-2, chrome.storage.local erpClosingUis). 처음 값은 모두 빈 목록·기타 이름 '' */
export type UisSettings = {
  v: 1
  counts: Partial<Record<UisCountKey, string[]>>
  sales: Partial<Record<UisSalesKey, string[]>>
  etcNames: Record<EtcKey, string>
}

/** 처방 코드 한 줄(design.md 3-3): qty = 총투여량 합(소수 가능), amount = 총액 원 정수. 환자 정보 없음 */
export type UisCodeRow = { code: string; name: string | null; qty: number; amount: number }
/** chrome.storage.local erpClosingUisCodes(design.md 9-2): 읽은 처방통계 기간과 코드 목록 */
export type UisCodes = { v: 1; from: string; to: string; codes: UisCodeRow[] }
/** closing.uisCodes 답(design.md 3-3) */
export type UisCodesAnswer = {
  state: 'ok' | 'missing' | 'notAll' | 'twice' | 'open'
  from: string | null
  to: string | null
  value: string | null
  codes: UisCodeRow[]
}

/** 이 PC의 ERP 도우미가 읽는 곳(closing.source 답, design.md 3-4) */
export type Source = 'bit' | 'uisarang'

/** ⑫ 한셀 열림 안내 끝 번호(오류가 아니라 보일 번호, design.md 11절 16) */
export const UIS_OPEN_CODE = 'E-UIS-FILE-OPEN'
