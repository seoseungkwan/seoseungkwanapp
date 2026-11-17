import type { RxGroupDef } from './analysis'

// 수납일지(spec sunap-ilji). 환자 줄(이름·고친 칸·비고)은 도우미 답 → Worker → 장부 화면으로만 가고 그 PC에 암호화해 둔다.
// 서버에는 마감할 때 SunapTotals(숫자 24칸)만 간다

// 다음 예약 종류 하나(설정, spec sunap-kinds REQ-5501). id = inj·visit·etc(기본 셋, 지울 수 없음) 또는 k+영문 소문자·숫자 6자(새 종류).
// counts = 초진·90일 예약률에 셈. words = 비트 예약 메모에 이 말이 있으면 이 종류(목록 차례로 먼저 맞는 종류)
export type RsvKindDef = { id: string; label: string; counts: boolean; words: string[] }
// 예약 종류: none = 예약 안 하고 가심, unknown = 비트 예약은 있는데 메모에 맞는 말 없음, 나머지는 종류 id.
// 글자라 타입으로 못 좁히고 lib/sunap/kinds.ts의 검사(isHandKind·isFixedKind)로 지킨다
export type RsvKind = string
// 직접 고르기: none 또는 종류 id(unknown 아님)
export type HandRsvKind = string
// 내원 구분: new = 초진(첫 내원일이 그날), d90 = 90일초진, re = 재진. 초진이 90일초진보다 앞선다
export type VisitKind = 'new' | 'd90' | 're'

// 옛 예약 메모 말(sunap-ilji 설정 모양). 메모에 inj 말이 있으면 inj, 없고 visit 말이면 visit, 없고 etc 말이면 etc
export type RsvWords = { inj: string[]; visit: string[]; etc: string[] }
export const DEFAULT_RSV_WORDS: RsvWords = { inj: ['주사', '블록'], visit: ['경과', '진료'], etc: ['기타'] }
// 위 말 목록은 옛 설정 줄(rsv_words = {inj, visit, etc}) 읽기와 DB 기본값 비교에만 쓴다. 지금 설정은 종류 목록이다
export const DEFAULT_RSV_KINDS: RsvKindDef[] = [
  { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
  { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
]

// 서버 설정 줄(sunap_settings). 묶음은 통계 처방 묶음의 id(없으면 아직 안 고름)
export type SunapSettings = { blockGroup: string | null; ptGroup: string | null; kinds: RsvKindDef[] }

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
// 도우미 0.9.0(v2, spec sunap-doctors): 줄 끝에 진료의 코드 한 칸(그날 그 환자 접수의 가장 작은 진료의, 없으면 null)
export type SunapReplyRowV2 = [...SunapReplyRow, doctor: string | null]
// 줄에 나온 진료의 코드마다 한 번: [코드, 이름(모르면 null)]
export type SunapReplyDoctor = [code: string, name: string | null]
export type SunapReply =
  | { v: 1; day: string; unsure: boolean; rows: SunapReplyRow[]; paid: SunapReplyPaid[] }
  | { v: 2; day: string; unsure: boolean; rows: SunapReplyRowV2[]; paid: SunapReplyPaid[]; doctors: SunapReplyDoctor[] }

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
  fixed?: { [chart: string]: RsvKind } // 처음 마감 때 자동(직접 고르지 않은) 예약 종류(none·unknown·종류 id)
}
export type SunapLocalMonth = { [day: string]: SunapLocalDay } // 열쇠 YYYY-MM-DD

// ── 장부 (lib/sunap/ledger.ts buildLedger) ─────────────────────────────
// 장부를 만들 때 쓰는 설정: 다음 예약 종류 목록과 Block·물리치료 묶음 정의(안 골랐으면 null — 그 칸은 모두 빈 칸)
export type LedgerSettings = { kinds: RsvKindDef[]; blockDef: RxGroupDef | null; ptDef: RxGroupDef | null }
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
  doctor: string | null // 진료의 코드(v1 답이면 null)
}
export type PaidRow = { chart: string; name: string; time: string; cash: number; card: number }
// closedAt·late는 PC 저장 그대로(마감 전이면 null·false). doctors = 답의 진료의 이름 목록(v1 답이면 빈 목록)
export type Ledger = {
  day: string
  unsure: boolean
  rows: LedgerRow[]
  paid: PaidRow[]
  closedAt: string | null
  late: boolean
  doctors: SunapReplyDoctor[]
}

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

// 원장님별 표(spec sunap-doctors REQ-5001): 수납일지 하루(ledgerDoctors)·통계 기간(sunapDoctors)이 같이 쓴다.
// code null = 진료의 미지정. label = 이름 → 코드 → '진료의 미지정'. rows는 내원 많은 차례(같으면 이름 글자 차례), total = 줄들의 합
export type DoctorRates = { code: string | null; label: string; rates: SunapRates }
export type DoctorBreakdown = { rows: DoctorRates[]; total: SunapRates }
