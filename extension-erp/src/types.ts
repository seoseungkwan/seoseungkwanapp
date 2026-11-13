// 새 확장 'ERP 마감일지 채우기'가 쓰는 이름표와 도우미 답 모양(design.md 2절·4절). 도우미 C# 모델 칸 이름도 같다

/** ERP 도우미 이름(기존 도우미와 따로인 ERP 전용 도우미, helper-erp/commands.json hostName) */
export const HOST_NAME = 'com.seoseungkwan.erp_helper'

/** 설정을 두는 chrome.storage.local 칸 이름. 도우미 답은 저장하지 않는다 */
export const SETTINGS_KEY = 'erpClosing'

/** 묶음 key. 차례 = closing.day args 차례 = 설정 화면 차례(design.md 2절) */
export const GROUP_KEYS = [
  'carm',
  'sono',
  'arthro',
  'manual',
  'eswt',
  'pt',
  'etc1',
  'etc2',
  'etc3',
  'etc4',
  'manualConsult',
  'lipus',
  'nail',
  'ct',
  'surgery',
  'eswtStd',
  'eswtRadial',
  'injection',
  'ptVisit',
] as const
export type GroupKey = (typeof GROUP_KEYS)[number]
export type EtcKey = 'etc1' | 'etc2' | 'etc3' | 'etc4'

/** 묶음마다 설정 화면 이름(design.md 2절) */
export const GROUP_NAMES: Record<GroupKey, string> = {
  carm: '씨암',
  sono: 'SONO',
  arthro: '관절조영',
  manual: '도수',
  eswt: '충격파',
  pt: '물리치료',
  etc1: '기타1',
  etc2: '기타2',
  etc3: '기타3',
  etc4: '기타4',
  manualConsult: '도수상담',
  lipus: '리푸스',
  nail: '손발톱케어',
  ct: 'CT',
  surgery: '수술',
  eswtStd: 'ESWT Standard',
  eswtRadial: 'ESWT Radial',
  injection: '주사',
  ptVisit: '물리치료내원',
}

/** 업무일지 2 예약 표 6줄(design.md 4절 차례) */
export const RSV_ROWS = ['injection', 'followup', 'manual', 'eswt', 'clinic', 'etc'] as const
export type RsvRow = (typeof RSV_ROWS)[number]

export const RSV_NAMES: Record<RsvRow, string> = {
  injection: '주사',
  followup: '경과',
  manual: '도수',
  eswt: '충격파',
  clinic: '진료예약',
  etc: '기타(수액,드레싱등)',
}

/**
 * 코드 꼴(helper-erp/commands.json closing.day codes·amountCodes pattern과 같다, design.md 2절): 앞뒤 공백 없음, 가운데는 빈칸 하나씩
 * ('PROLO C'·'HYALU MINI'는 됨). 글자 수는 1~20자(MAX_CODE_LENGTH)
 */
export const CODE_PATTERN = /^\S(?: ?\S)*$/
export const MAX_CODE_LENGTH = 20
/** 매출 규칙 앞글자 꼴(commands.json amountPrefixes pattern과 같다): 빈칸 없는 1~10자 */
export const PREFIX_PATTERN = /^\S{1,10}$/

/** 씨암·SONO 매출 규칙을 두는 묶음(TASK-15) */
export const AMOUNT_KEYS = ['carm', 'sono'] as const
export type AmountKey = (typeof AMOUNT_KEYS)[number]
/** 매출 규칙 한 묶음: 앞글자(바로 뒤가 숫자인 코드만 셈)·더 셀 코드 */
export type AmountRule = { prefixes: string[]; codes: string[] }
/** 씨암·SONO 표시 코드가 함께 있는 진료를 어디에 넣나(ERP 화면에서 작성자가 고름) */
export type OverlapChoice = 'carm' | 'sono' | 'both'

/**
 * 읽지 않을 처방 규칙 하나(REQ-3709, design.md 11절): 진료에 with가(all이면 모두, 아니면 하나라도) 있으면
 * 그 묶음을 셀 때 code를 그 진료에 없는 것으로 본다
 */
export type ExcludeRule = { code: string; with: string[]; all: boolean }
/** 읽지 않을 처방 규칙을 두는 묶음: 건수를 세는 17줄(주사1회환자 injection·물리치료내원 ptVisit은 없음) */
export const EXCLUDE_KEYS: readonly GroupKey[] = GROUP_KEYS.filter((key) => key !== 'injection' && key !== 'ptVisit')

/**
 * 설정 모양(design.md 4절). picks = 묶음마다 고른 처방 코드, reservations = 예약 줄마다 고른 예약 메모 번호,
 * amounts = 씨암·SONO 매출 규칙(TASK-15), overlap = 지난번 고른 함께 있는 진료 선택(ERP 화면이 saveOverlap으로만 쓴다),
 * defaultsSeen = 마지막 [저장] 때의 처음 값 판(TASK-18, settings.ts DEFAULTS_VERSION. 선택 칸이고 normalize가 늘 채운다 — 없으면 1),
 * excludes = 줄마다 읽지 않을 처방 규칙(REQ-3709, EXCLUDE_KEYS 줄만. 규칙이 있는 줄만 두고, 하나도 없으면 칸이 없다)
 */
export type Settings = {
  v: 1
  picks: Partial<Record<GroupKey, string[]>>
  etcNames: Record<EtcKey, string>
  reservations: Partial<Record<RsvRow, string[]>>
  amounts: Record<AmountKey, AmountRule>
  excludes?: Partial<Record<GroupKey, ExcludeRule[]>>
  overlap?: OverlapChoice
  defaultsSeen?: number
}

/** 새 확장이 ERP 도우미에 보내는 명령 셋(helper-erp/commands.json commands). closing.findCodes는 REQ-3708(도우미 0.3.0) */
export type ClosingCommand = 'closing.codes' | 'closing.day' | 'closing.findCodes'
/**
 * closing.day args. 매출 규칙 두 칸은 carm·sono에만, 둘 중 하나라도 있을 때만 붙인다.
 * exclude는 읽지 않을 처방 규칙이 있는 묶음에만 붙인다(REQ-3709 AC-3709.3, 없으면 지금 모양이라 옛 도우미에서도 된다)
 */
export type ClosingDayArgs = {
  date: string
  groups: { key: GroupKey; codes: string[]; amountPrefixes?: string[]; amountCodes?: string[]; exclude?: ExcludeRule[] }[]
}

// --- 도우미 답(`{ v, id, type: 'result', data }`의 data) ---

export type Three = { new: number; first90: number; return: number }

export type ClosingCodes = {
  codes: { code: string; name: string | null; visits: number }[]
  kinds: { kind: string; name: string | null }[]
}

/** closing.findCodes { text } 답(REQ-3708 AC-3708.1): 비트에 등록된 코드 가운데 맞는 것, 코드 차례로 30개까지 */
export type FoundCodes = { codes: { code: string; name: string | null }[] }

export type AgeBand = '0' | '10' | '20' | '30' | '40' | '50' | '60' | '70' | '80' | '90'

export type MoneyKey =
  | 'total'
  | 'insurer'
  | 'receivableIn'
  | 'unpaidNew'
  | 'noncovered'
  | 'discount'
  | 'disabledFund'
  | 'received'
  | 'card'
  | 'cash'
  | 'transfer'
  | 'refund'

export type ClosingDay = {
  /** 'YYYY-MM-DD' */
  date: string
  patients: { new: number; first90: number; return: number; ptVisit: number | null; noExamFee: number; total: number }
  /** args 차례 */
  groups: ({ key: GroupKey; patients: number; total: number; unpaidVisits: number } & Three)[]
  /** 늘 10줄 */
  ages: ({ band: AgeBand } & Three)[]
  money: Record<MoneyKey, number | null>
  inpatientVisits: number
  reservations: {
    kinds: { kind: string; total: number; visited: number; changed: number; canceled: number }[]
    patients: number
  }
  injection: { firstTime: number | null; newPatients: number; newLines: number } | null
  /** carm·sono 둘 다 매출 규칙이 있을 때만(TASK-15): 함께 있는 진료 수와 그 진료들만의 각 규칙 금액. 아니면 null(예전 도우미는 칸이 없다) */
  overlap?: { visits: number; carm: number; sono: number } | null
  warnings: { moneyUnconfirmed: boolean; splitUnconfirmed: boolean; unpaidVisits: number; unknownAge: number; noHistory: boolean }
}
