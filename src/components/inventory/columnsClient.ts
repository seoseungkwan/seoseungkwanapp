import { FIELDS, type ColumnMapping } from '@/lib/inventory/ai'

// 브라우저에서 엑셀 칸 맞춤 경로 부르기 (spec inventory AC-7509.2, design.md 5·6절). 던지지 않고 결과를 값으로 돌려준다.
// 보내는 것은 sampleForAi(lib/inventory/excel.ts)가 만든 머리 줄 + 앞 줄 5개까지뿐이다. problem(개인정보 모양)이면 보내지 않는다.
// redirect: 'manual' — 로그인이 끊겨 돌려보내는 답을 따라가지 않는다(E-AI-FAILED로 보인다, 서식 AI 정리와 같다)

export const COLUMNS_PATH = '/api/ai/inventory/columns'

export type ColumnsCode = 'E-INV-PRIVATE' | 'E-INV-NO-NAME' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
export type ColumnsAnswer = { kind: 'ok'; mapping: ColumnMapping } | { kind: 'error'; code: ColumnsCode }

const CODES: readonly unknown[] = ['E-INV-PRIVATE', 'E-INV-NO-NAME', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] satisfies ColumnsCode[]
const error = (code: ColumnsCode): ColumnsAnswer => ({ kind: 'error', code })

const fieldsOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null

// 여덟 칸이 모두 있고(더 없음) 칸마다 0~칸 수−1 정수 또는 null, 두 칸이 같은 번호가 아니며 물품 이름 칸이 있어야 한다
function mappingOf(value: unknown, columnCount: number): ColumnMapping | null {
  const o = fieldsOf(value)
  if (o === null || Object.keys(o).length !== FIELDS.length || !FIELDS.every((field) => field in o)) return null
  const used = new Set<number>()
  for (const field of FIELDS) {
    const column = o[field]
    if (column === null) continue
    if (!Number.isSafeInteger(column) || (column as number) < 0 || (column as number) >= columnCount || used.has(column as number)) return null
    used.add(column as number)
  }
  return o.name === null ? null : (o as ColumnMapping)
}

// 경로 답(상태·JSON 몸통, JSON이 아니면 null) → 맞춘 칸 또는 오류 번호. 모르는 답은 모두 E-AI-FAILED
export function columnsAnswerOf(status: number, body: unknown, columnCount: number): ColumnsAnswer {
  const o = fieldsOf(body)
  if (status !== 200) return o !== null && CODES.includes(o.code) ? error(o.code as ColumnsCode) : error('E-AI-FAILED')
  const mapping = mappingOf(o?.mapping, columnCount)
  return mapping === null ? error('E-AI-FAILED') : { kind: 'ok', mapping }
}

export async function askColumns(sample: { header: string[]; rows: string[][]; problem: boolean }): Promise<ColumnsAnswer> {
  if (sample.problem) return error('E-INV-PRIVATE')
  try {
    const response = await fetch(COLUMNS_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ header: sample.header, rows: sample.rows }),
      redirect: 'manual',
      cache: 'no-store',
    })
    const body: unknown = await response.json().catch(() => null)
    return columnsAnswerOf(response.status, body, sample.header.length)
  } catch {
    return error('E-AI-BUSY')
  }
}
