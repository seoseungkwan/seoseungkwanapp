import { REVENUE_REST_CODE, type RevenueCodeRow } from '@/types/revenue'

// 편집 화면의 처방 목록(TASK-14, AC-014.2). 받는 줄은 저장된 sales_codes 최근 13달이다.
// _REST는 처방이 아니라 나머지 합계라서 뺀다: moveCode는 막지 않지만 DB(rx_group_codes_ok)가 거부해 저장이 계속 실패한다

export type KnownCode = { code: string; name: string | null; amount: number | null }

/** 코드마다 한 줄(코드 순). 이름은 이름이 있는 가장 늦은 달 것, 금액은 고른 달 것(그 달에 없으면 null) */
export function knownCodes(rows: (RevenueCodeRow & { month: string })[], month: string): KnownCode[] {
  const byCode = new Map<string, KnownCode & { nameMonth: string }>()
  for (const row of rows) {
    if (row.code === REVENUE_REST_CODE) continue
    const item = byCode.get(row.code) ?? { code: row.code, name: null, amount: null, nameMonth: '' }
    if (row.name !== null && row.month > item.nameMonth) {
      item.name = row.name
      item.nameMonth = row.month
    }
    if (row.month === month) item.amount = row.amount
    byCode.set(row.code, item)
  }
  return [...byCode.values()].map(({ code, name, amount }) => ({ code, name, amount })).sort((a, b) => a.code.localeCompare(b.code))
}
