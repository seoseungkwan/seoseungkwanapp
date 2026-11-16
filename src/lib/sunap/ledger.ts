import { compareYmd, todayInKorea } from '@/lib/analytics/dates'
import { groupMatches } from '@/lib/analytics/groupMatch'
import { addVisit, doctorBreakdown } from '@/lib/analytics/sunapRates'
import {
  LEDGER_EDITED_FIELDS,
  SUNAP_TOTAL_KEYS,
  type DoctorBreakdown,
  type HandRsvKind,
  type Ledger,
  type LedgerRow,
  type LedgerRsv,
  type LedgerSettings,
  type RsvKind,
  type RsvWords,
  type SunapEdit,
  type SunapLocalDay,
  type SunapReply,
  type SunapReplyDoctor,
  type SunapReplyRow,
  type SunapReplyRowV2,
  type SunapTotalKey,
  type SunapTotals,
} from '@/types/sunap'
import { classifyMemo } from './memo'

// 수납일지 장부 규칙 [환자 자료 구역] (spec sunap-ilji REQ-4901). 순수 함수만: 받은 답·PC 저장을 바꾸지 않고 새 값을 돌려준다

const HAND_KINDS = new Set<unknown>(['none', 'inj', 'visit', 'etc'] satisfies HandRsvKind[])
export const MAX_WON = 99_999_999
const WON = /^([\d,]+)\s*원?$/

// 차트번호 열쇠로 PC 저장을 찾는다(Object 기본 이름 constructor 같은 열쇠에 속지 않게 자기 칸만)
function own<T>(table: { [key: string]: T } | undefined, key: string): T | undefined {
  return table !== undefined && Object.hasOwn(table, key) ? table[key] : undefined
}

const isHandKind = (kind: unknown): kind is HandRsvKind => HAND_KINDS.has(kind)

// 직접 고름(hand) → 그날 고정(fixed) → 비트 예약 없음(none) → 메모 말(AC-4901.4). 직접 고르기는 unknown을 받지 않는다.
// 시각은 비트 예약 시각이고, 종류가 none이면 없다
function rsvOf(bit: SunapReplyRow[9], edit: SunapEdit, fixed: RsvKind | undefined, words: RsvWords): LedgerRsv {
  const at = bit === null ? null : bit[0]
  if (isHandKind(edit.rsv)) return { kind: edit.rsv, source: 'hand', at: edit.rsv === 'none' ? null : at }
  const kind = fixed ?? (bit === null ? 'none' : classifyMemo(bit[1], words))
  return { kind, source: 'bit', at: kind === 'none' ? null : at }
}

// 비트 줄 + 고친 칸 → 장부 줄(AC-4901.3). 고친 칸은 그 값이 이기고, 비트 값과 다르면 edited에 그 칸 이름이 들어간다.
// Block·물리치료는 고친 값이 없으면 그날 처방코드로 groupMatches(묶음을 안 골랐으면 빈 칸)
// v2 답(도우미 0.9.0)이면 줄 끝 칸이 진료의 코드이고 맨 위 doctors가 이름 목록이다. v1 답이면 줄마다 null·빈 목록(spec sunap-doctors AC-5001.1)
export function buildLedger(reply: SunapReply, local: SunapLocalDay, settings: LedgerSettings): Ledger {
  const lines: SunapReplyRowV2[] = reply.v === 2 ? reply.rows : reply.rows.map((line): SunapReplyRowV2 => [...line, null])
  const rows = lines.map((line): LedgerRow => {
    const [chart, name, time, kind, cash, card, transfer, unpaid, codes, rsv, doctor] = line
    const edit = own(local.edits, chart) ?? {}
    const bit = {
      cash,
      card,
      transfer,
      unpaid,
      block: groupMatches(settings.blockDef, codes),
      pt: groupMatches(settings.ptDef, codes),
    }
    const value = {
      cash: edit.cash ?? bit.cash,
      card: edit.card ?? bit.card,
      transfer: edit.transfer ?? bit.transfer,
      unpaid: edit.unpaid ?? bit.unpaid,
      block: edit.block ?? bit.block,
      pt: edit.pt ?? bit.pt,
    }
    return {
      chart,
      name,
      time,
      kind,
      ...value,
      free: value.cash === 0 && value.card === 0 && value.transfer === 0 && value.unpaid === 0,
      rsv: rsvOf(rsv, edit, own(local.fixed, chart), settings.words),
      note: edit.note ?? '',
      edited: LEDGER_EDITED_FIELDS.filter((field) => edit[field] !== undefined && edit[field] !== bit[field]),
      doctor,
    }
  })
  return {
    day: reply.day,
    unsure: reply.unsure,
    rows,
    paid: reply.paid.map(([chart, name, time, cash, card]) => ({ chart, name, time, cash, card })),
    closedAt: local.closedAt ?? null,
    late: local.late ?? false,
    doctors: reply.v === 2 ? reply.doctors.map(([code, name]): SunapReplyDoctor => [code, name]) : [],
  }
}

// 원장님별 표(spec sunap-doctors AC-5001.1~5001.3): 장부 줄의 구분·고친 값이 든 Block·물리치료·진료의로 센다.
// total은 dayTotals의 같은 아홉 칸과 같다. 원장님(미지정 빼고)이 한 분 이하면 null. 이름은 names(주지 않으면 장부의 doctors)
export function ledgerDoctors(ledger: Ledger, names: readonly SunapReplyDoctor[] = ledger.doctors): DoctorBreakdown | null {
  return doctorBreakdown(ledger.rows, new Map(names))
}

// 서버에 올리는 숫자 24칸(AC-4901.5). 결제 건수는 그 칸이 0원이 아닌 줄 수, 금액은 그 칸의 합.
// 초진·90일 예약은 주사치료·진료(경과) 예약만, 재진+Block = 재진 줄 중 Block, FREE = 네 칸 다 0원.
// 미수 입금은 paid 줄에서 현금·카드 따로 세고 내원 수에는 넣지 않는다
export function dayTotals(ledger: Ledger): SunapTotals {
  const totals = Object.fromEntries(SUNAP_TOTAL_KEYS.map((key) => [key, 0])) as SunapTotals
  const add = (count: SunapTotalKey, sum: SunapTotalKey, won: number) => {
    if (won === 0) return
    totals[count]++
    totals[sum] += won
  }
  for (const row of ledger.rows) {
    // 구분·Block·물리치료 아홉 칸은 통계 Block 전환·원장님별 표와 같은 규칙(addVisit)
    addVisit(totals, row.kind, row.block, row.pt)
    if (row.rsv.kind === 'inj' || row.rsv.kind === 'visit') {
      if (row.kind === 'new') totals.rsv_first++
      else if (row.kind === 'd90') totals.rsv_d90++
    }
    if (row.free) totals.free_n++
    add('cash_n', 'cash_won', row.cash)
    add('card_n', 'card_won', row.card)
    add('transfer_n', 'transfer_won', row.transfer)
    add('unpaid_n', 'unpaid_won', row.unpaid)
  }
  for (const paid of ledger.paid) {
    add('paid_cash_n', 'paid_cash_won', paid.cash)
    add('paid_card_n', 'paid_card_won', paid.card)
  }
  return totals
}

// 마감(AC-4901.6). 처음 마감(fixed 없음)이면 직접 고르지 않은 줄의 지금 예약 종류를 fixed에 두고
// late = 한국 날짜로 now가 그날 뒤. 이미 fixed가 있으면 fixed·late는 그대로 두고 마감 시각만 새로 적는다
export function closeLocal(local: SunapLocalDay, ledger: Ledger, now: Date): SunapLocalDay {
  const closedAt = now.toISOString()
  if (local.fixed !== undefined) return { ...local, closedAt }
  const fixed: { [chart: string]: RsvKind } = {}
  for (const row of ledger.rows) if (row.rsv.source !== 'hand') fixed[row.chart] = row.rsv.kind
  return { ...local, fixed, late: compareYmd(todayInKorea(now), ledger.day) > 0, closedAt }
}

// 마감 풀기: closedAt만 지운다. fixed·late·고친 칸은 남는다
export function reopenLocal(local: SunapLocalDay): SunapLocalDay {
  const opened = { ...local }
  delete opened.closedAt
  return opened
}

// 금액 칸 글자 → 원 정수(AC-4901.7). 빈 글은 0, 쉼표·뒤 '원'은 된다. 음수·소수·한글 단위·99,999,999 넘음은 invalid
export function parseWon(text: string): number | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const match = WON.exec(trimmed)
  const digits = match === null ? '' : match[1].replaceAll(',', '')
  if (digits === '') return 'invalid'
  const won = Number(digits)
  return won <= MAX_WON ? won : 'invalid'
}
