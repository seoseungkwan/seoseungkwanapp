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

/** 설정 모양(design.md 4절). picks = 묶음마다 고른 처방 코드, reservations = 예약 줄마다 고른 예약 메모 번호 */
export type Settings = {
  v: 1
  picks: Partial<Record<GroupKey, string[]>>
  etcNames: Record<EtcKey, string>
  reservations: Partial<Record<RsvRow, string[]>>
}

/** 새 확장이 ERP 도우미에 보내는 명령 둘(helper-erp/commands.json commands) */
export type ClosingCommand = 'closing.codes' | 'closing.day'
export type ClosingDayArgs = { date: string; groups: { key: GroupKey; codes: string[] }[] }

// --- 도우미 답(`{ v, id, type: 'result', data }`의 data) ---

export type Three = { new: number; first90: number; return: number }

export type ClosingCodes = {
  codes: { code: string; name: string | null; visits: number }[]
  kinds: { kind: string; name: string | null }[]
}

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
  warnings: { moneyUnconfirmed: boolean; splitUnconfirmed: boolean; unpaidVisits: number; unknownAge: number; noHistory: boolean }
}
