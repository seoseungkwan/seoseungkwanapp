import { compareUisCode, isUisRxText, UIS_RX_MAX_ROWS, validateUisRxPayload } from '@/lib/payload/uisarang'
import type { UisRead, UisRxRow, UisSpan } from '@/types/uisarang'
import { badRow, badTotal, bodyRows, numberOf, ok, squash, textOf, won, type Body, type Sheet } from './cells'

// 기간별처방통계 → 처방 코드별 처방량·총액(specs/uisarang-upload design.md §4-2) [환자 자료 구역].
// 처방량은 환자 수가 아니라 총투여량의 합이다 — 환자 수 칸은 만들지 않는다

const TOTAL = '합계'
const round3 = (x: number) => Math.round(x * 1000) / 1000 + 0

export function readRx(sheet: Sheet, span: UisSpan): Body<UisRead> {
  const { col } = sheet
  const byCode = new Map<string, UisRxRow>()
  let lines = 0
  let total: number | null | undefined
  for (const { row, n } of bodyRows(sheet)) {
    if (squash(row[col['코드']]) === TOTAL || squash(row[col['처방명칭']]) === TOTAL) {
      const value = numberOf(row[col['총액']])
      if (Number.isNaN(value)) return badRow(n)
      total = value === null ? null : won(value)
      break
    }
    const code = textOf(row[col['코드']])
    if (code === '') continue // 코드 칸이 빈 줄(소계·설명)은 건너뛴다
    const name = textOf(row[col['처방명칭']])
    // 저장 모양 검사와 같은 글자 규칙(1~100자 · 제어 글자 · 전화·주민번호·메일 모양)
    if (!isUisRxText(code) || !isUisRxText(name)) return badRow(n)
    const qty = numberOf(row[col['총투여량']])
    const amount = numberOf(row[col['총액']])
    if (Number.isNaN(qty) || Number.isNaN(amount)) return badRow(n)
    lines++
    const before = byCode.get(code)
    if (before === undefined) {
      if (byCode.size >= UIS_RX_MAX_ROWS) return badRow(n)
      byCode.set(code, { code, name, qty: qty ?? 0, amount: won(amount ?? 0) }) // 이름은 첫 줄
    } else {
      before.qty += qty ?? 0
      before.amount += won(amount ?? 0) // 줄마다 원 미만을 버린 뒤 더한다
    }
  }
  if (total === undefined) return badTotal()
  const rows = [...byCode.values()].map((r) => ({ ...r, qty: round3(r.qty) })).sort((a, b) => compareUisCode(a.code, b.code))
  const sum = rows.reduce((s, r) => s + r.amount, 0)
  // 줄마다 버림 차이는 줄 수까지 봐 준다(소계 줄을 두 번 센 엑셀을 잡는다)
  if (total !== null && Math.abs(sum - total) > lines) return badTotal()
  const payload = validateUisRxPayload({ v: 1, rows, total })
  return payload === null ? badRow() : ok({ kind: 'rx', span, payload })
}
