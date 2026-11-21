import { isYmd } from '@/lib/analytics/dates'
import { AMOUNT_MAX, PHOTO_MAX_BYTES, QTY_MAX, RECEIPT_LINES_MAX, UNIT_PRICE_MAX, VENDOR_MAX } from '@/types/inventory'

// 브라우저에서 명세서 읽기 경로 부르기 (specs/inventory REQ-7508 AC-7508.1·AC-7508.2, design.md 5·6절).
// 줄인 JPEG 사진을 base64로 바꿔 { image } 하나만 POST한다(병원·사용자 값은 보내지 않는다). 던지지 않고 결과를 값으로 돌려준다.
// 서버가 검사한 답이라도 다시 본다: 칸마다 모양·범위가 맞아야 하고, 받은 칸만 새로 만든다(그 밖은 버린다). 모르는 답은 모두 E-AI-FAILED.
// redirect: 'manual' — 로그인이 끊겨 돌려보내는 답을 따라가지 않는다(E-AI-FAILED로 보인다)

export const INVOICE_PATH = '/api/ai/inventory/invoice'

export type InvoiceLineRead = { name: string; qty: number; unitPrice: number | null; amount: number | null; itemId: string | null; unsure: boolean }
export type InvoiceRead = { date: string | null; vendor: string | null; lines: InvoiceLineRead[] }
export type InvoiceCode = 'E-INV-PHOTO' | 'E-INV-NO-LINES' | 'E-INV-READ-FAILED' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
export type InvoiceResult = { kind: 'ok'; invoice: InvoiceRead } | { kind: 'error'; code: InvoiceCode }

const ROUTE_CODES: readonly unknown[] = ['E-INV-NO-LINES', 'E-INV-READ-FAILED', 'E-AI-BUSY', 'E-AI-LIMIT', 'E-AI-FAILED'] satisfies InvoiceCode[]
const LINE_NAME_MAX = 60 // 명세서 이름은 별칭(60자)이 된다(lib/inventory/ai.ts와 같다)
const BAD_PHOTO: InvoiceResult = { kind: 'error', code: 'E-INV-PHOTO' }
const BUSY: InvoiceResult = { kind: 'error', code: 'E-AI-BUSY' }
const FAILED: InvoiceResult = { kind: 'error', code: 'E-AI-FAILED' }

type Fields = Record<string, unknown>
const fieldsOf = (value: unknown): Fields | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null
const intIn = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const nullableInt = (value: unknown, max: number): value is number | null => value === null || intIn(value, 0, max)
const textIn = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim() !== '' && [...value].length <= max

function lineOf(value: unknown): InvoiceLineRead | null {
  const o = fieldsOf(value)
  if (o === null) return null
  const { name, qty, unitPrice, amount, itemId, unsure } = o
  if (!textIn(name, LINE_NAME_MAX) || !intIn(qty, 1, QTY_MAX)) return null
  if (!nullableInt(unitPrice, UNIT_PRICE_MAX) || !nullableInt(amount, AMOUNT_MAX)) return null
  if (!(itemId === null || (typeof itemId === 'string' && itemId !== '')) || typeof unsure !== 'boolean') return null
  return { name, qty, unitPrice, amount, itemId, unsure }
}

/** 경로 답(상태·JSON 몸통, JSON이 아니면 null) → 읽은 명세서 또는 오류 번호 */
export function invoiceAnswerOf(status: number, body: unknown): InvoiceResult {
  const o = fieldsOf(body)
  if (status !== 200) {
    if (o !== null && ROUTE_CODES.includes(o.code)) return { kind: 'error', code: o.code as InvoiceCode }
    return status === 400 ? BAD_PHOTO : FAILED
  }
  if (o === null || !Array.isArray(o.lines) || o.lines.length < 1 || o.lines.length > RECEIPT_LINES_MAX) return FAILED
  const { date, vendor } = o
  if (!(date === null || (typeof date === 'string' && isYmd(date)))) return FAILED
  if (!(vendor === null || textIn(vendor, VENDOR_MAX))) return FAILED
  const lines: InvoiceLineRead[] = []
  for (const value of o.lines) {
    const line = lineOf(value)
    if (line === null) return FAILED
    lines.push(line)
  }
  return { kind: 'ok', invoice: { date, vendor, lines } }
}

/** 바이트 → base64 글(인자 수 한도를 넘지 않게 나눠 바꾼다) */
function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return btoa(binary)
}

const isJpeg = (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

/** 줄인 사진(JPEG, 3,000,000바이트까지)을 읽게 한다. JPEG가 아니거나 크면 보내지 않고 E-INV-PHOTO, 연결이 끊기면 E-AI-BUSY */
export async function readInvoice(photo: Blob): Promise<InvoiceResult> {
  let image: string
  try {
    if (!(photo instanceof Blob) || photo.size > PHOTO_MAX_BYTES) return BAD_PHOTO
    const bytes = new Uint8Array(await photo.arrayBuffer())
    if (!isJpeg(bytes)) return BAD_PHOTO
    image = base64Of(bytes)
  } catch {
    return BAD_PHOTO
  }
  try {
    const response = await fetch(INVOICE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
      redirect: 'manual',
      cache: 'no-store',
    })
    const body: unknown = await response.json().catch(() => null)
    return invoiceAnswerOf(response.status, body)
  } catch {
    return BUSY
  }
}
