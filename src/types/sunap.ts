import type { RxGroupDef } from './analysis'

// 수납일지(spec sunap-ilji). 환자 줄(이름·고친 칸·비고)은 도우미 답 → Worker → 장부 화면으로만 가고 그 PC에 암호화해 둔다.
// 서버에는 마감할 때 SunapTotals(숫자 24칸)만 간다

// 예약 종류: none = 예약 안 하고 가심, inj = 주사치료, visit = 진료(경과), etc = 기타, unknown = 비트 예약은 있는데 메모에 정해진 말 없음
export type RsvKind = 'none' | 'inj' | 'visit' | 'etc' | 'unknown'
// 직접 고르기는 unknown을 받지 않는다
export type HandRsvKind = Exclude<RsvKind, 'unknown'>
// 내원 구분: new = 초진(첫 내원일이 그날), d90 = 90일초진, re = 재진. 초진이 90일초진보다 앞선다
export type VisitKind = 'new' | 'd90' | 're'

// 예약 메모 말(설정). 메모에 inj 말이 있으면 inj, 없고 visit 말이면 visit, 없고 etc 말이면 etc
export type RsvWords = { inj: string[]; visit: string[]; etc: string[] }
export const DEFAULT_RSV_WORDS: RsvWords = { inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] }

// 서버 설정 줄(sunap_settings). 묶음은 통계 처방 묶음의 id(없으면 아직 안 고름)
export type SunapSettings = { blockGroup: string | null; ptGroup: string | null; words: RsvWords }

// ── 도우미 답 (contact.targets kind 'sunap', design.md '도우미 답') ─────────────
// 예약 = [yyyyMMddHHmm, 메모 앞 40자(없으면 '')]
export type SunapReplyRsv = [at: string, memo: string]
// 금액은 원 정수, 처방코드는 그날 처방의 합집합(중복 없음)
export type SunapReplyRow = [
  chart: string,
  name: string,
  time: string, // 그날 첫 접수 HH:mm
  kind: VisitKind,
  cash: number,
  card: number,
  transfer: number,
  unpaid: number,
  codes: string[],
  rsv: SunapReplyRsv | null,
]
// 미수 입금(예전 미수를 그날 냄): 현금 = 현금, 카드 = 카드+계좌
export type SunapReplyPaid = [chart: string, name: string, time: string, cash: number, card: number]
export type SunapReply = { v: 1; day: string; unsure: boolean; rows: SunapReplyRow[]; paid: SunapReplyPaid[] }

// ── PC 저장 (work-YYYY-MM.dat의 칸 sunap, design.md 'PC 저장') ──────────────
export type SunapEdit = {
  cash?: number
  card?: number
  transfer?: number
  unpaid?: number
  block?: boolean
  pt?: boolean
  rsv?: HandRsvKind
  note?: string // 100자까지
}
export type SunapLocalDay = {
  edits?: { [chart: string]: SunapEdit }
  closedAt?: string // ISO, 마감 중일 때만
  late?: boolean // 처음 마감이 늦었음(한국 날짜로 그날 뒤)
  fixed?: { [chart: string]: RsvKind } // 처음 마감 때 자동(직접 고르지 않은) 예약 종류
}
export type SunapLocalMonth = { [day: string]: SunapLocalDay } // 열쇠 YYYY-MM-DD

// ── 장부 (lib/sunap/ledger.ts buildLedger) ─────────────────────────────
// 장부를 만들 때 쓰는 설정: 메모 말과 Block·물리치료 묶음 정의(안 골랐으면 null — 그 칸은 모두 빈 칸)
export type LedgerSettings = { words: RsvWords; blockDef: RxGroupDef | null; ptDef: RxGroupDef | null }
// 비트 값이 있는 칸 중 직원이 비트 값과 다르게 고친 칸 이름(이 차례로)
export const LEDGER_EDITED_FIELDS = ['cash', 'card', 'transfer', 'unpaid', 'block', 'pt'] as const
export type LedgerEditedField = (typeof LEDGER_EDITED_FIELDS)[number]
// rsv.source: hand = 직원이 고름, bit = 비트 예약 메모(또는 그날 고정값). at = 비트 예약 시각 yyyyMMddHHmm(없거나 none이면 null)
export type LedgerRsv = { kind: RsvKind; source: 'hand' | 'bit'; at: string | null }
export type LedgerRow = {
  chart: string
  name: string
  time: string
  kind: VisitKind
  cash: number
  card: number
  transfer: number
  unpaid: number
  free: boolean // 네 칸 다 0원
  block: boolean
  pt: boolean
  rsv: LedgerRsv
  note: string
  edited: LedgerEditedField[]
}
export type PaidRow = { chart: string; name: string; time: string; cash: number; card: number }
// closedAt·late는 PC 저장 그대로(마감 전이면 null·false)
export type Ledger = { day: string; unsure: boolean; rows: LedgerRow[]; paid: PaidRow[]; closedAt: string | null; late: boolean }

// ── 서버 숫자 (sunap_days 24칸, design.md 'DB') ─────────────────────────
export const SUNAP_TOTAL_KEYS = [
  'visits',
  'first_n',
  'd90_n',
  'ret_n',
  'block_n',
  'pt_n',
  'rsv_first',
  'rsv_d90',
  'first_block',
  'd90_block',
  'ret_block',
  'cash_n',
  'cash_won',
  'card_n',
  'card_won',
  'transfer_n',
  'transfer_won',
  'paid_cash_n',
  'paid_cash_won',
  'paid_card_n',
  'paid_card_won',
  'free_n',
  'unpaid_n',
  'unpaid_won',
] as const
export type SunapTotalKey = (typeof SUNAP_TOTAL_KEYS)[number]
export type SunapTotals = Record<SunapTotalKey, number>

// 통계 탭 Block 전환(lib/analytics/sunapRates.ts): 그 기간 환자·날마다 센 수. 장부 합계와 같은 이름
export type SunapRates = Pick<
  SunapTotals,
  'visits' | 'first_n' | 'd90_n' | 'ret_n' | 'block_n' | 'pt_n' | 'first_block' | 'd90_block' | 'ret_block'
>
