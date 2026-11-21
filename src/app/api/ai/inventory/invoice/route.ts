import type { SupabaseClient } from '@supabase/supabase-js'
import { NotSignedInError, readMe } from '@/lib/auth/hospital.server'
import { costMicroUsd } from '@/lib/ai/cost'
import { todayInKorea } from '@/lib/analytics/dates'
import { INVOICE_SCHEMA, invoiceFromAnswer, invoiceSystem, invoiceUser } from '@/lib/inventory/ai'
import { supabaseServer } from '@/lib/supabase/server'
import type { AiUsage } from '@/types/aiReport'
import { callClaude } from '../../claude'
import { addUsage } from '../../store'

// POST /api/ai/inventory/invoice (spec inventory REQ-7505, design.md 5절). 들어온 물품 명세서 사진을 Claude가 읽는다.
// 집계만 보낸다는 규칙의 예외: 브라우저가 줄인 사진 한 장(JPEG base64)과 서버가 DB에서 읽은 물품 이름·단위 목록만 보낸다.
// 병원·사용자 값은 보내지 않는다. 사진은 저장하지 않는다(저장은 [저장]을 누른 뒤 브라우저가 Storage에 한다).
// 400·401·403은 상태만(몸통·로그 없음). { code }로 답하는 모든 경우에 console.error('[api/ai/inventory/invoice]', code) 한 줄만 — 사진·글·답·숫자는 남기지 않는다.
// 이 파일은 Next가 아는 이름(POST·runtime·maxDuration)만 export한다
export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_IMAGE = 4_000_000 // 글자 수. Vercel 몸통 한도 4.5MB 안
const JPEG_BASE64 = /^\/9j\/[A-Za-z0-9+/]+={0,2}$/
const MAX_ITEMS = 500

type InvoiceErrorCode = 'E-INV-READ-FAILED' | 'E-INV-NO-LINES' | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED'
const STATUS: Record<InvoiceErrorCode, number> = {
  'E-INV-READ-FAILED': 502,
  'E-INV-NO-LINES': 422,
  'E-AI-LIMIT': 402,
  'E-AI-BUSY': 503,
  'E-AI-FAILED': 502,
}

type Item = { id: string; name: string; unit: string }

function status(code: number): Response {
  return new Response(null, { status: code })
}

function fail(code: InvoiceErrorCode): Response {
  console.error('[api/ai/inventory/invoice]', code)
  return Response.json({ code }, { status: STATUS[code] })
}

// { image } 하나이고 JPEG base64(/9j/로 시작, 4,000,000자까지)이면 그 글자, 아니면 null
async function readImage(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== 'image') return null
  const image = (body as { image: unknown }).image
  if (typeof image !== 'string' || image.length > MAX_IMAGE || !JPEG_BASE64.test(image)) return null
  return image
}

const isItem = (row: unknown): row is Item => {
  if (typeof row !== 'object' || row === null) return false
  const { id, name, unit } = row as Record<string, unknown>
  return typeof id === 'string' && typeof name === 'string' && typeof unit === 'string'
}

// 숨기지 않은 물품을 목록 차례로 500개까지. 병원 조건은 넣지 않는다 — RLS가 내 병원 줄만 보여 준다.
// 읽기가 실패하거나 모양이 다르면 null(오류 내용은 버린다)
async function readItems(sb: SupabaseClient): Promise<Item[] | null> {
  try {
    const { data, error } = await sb
      .from('inventory_items')
      .select('id, name, unit')
      .eq('hidden', false)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .limit(MAX_ITEMS)
    if (error || !Array.isArray(data) || !data.every(isItem)) return null
    return data.slice(0, MAX_ITEMS)
  } catch {
    return null
  }
}

// 이번 달 사용량에 더한다. 실패해도 답은 그대로다(오류 내용은 남기지 않는다)
async function recordUsage(sb: SupabaseClient, usage: AiUsage): Promise<void> {
  try {
    await addUsage(sb, { ...usage, costMicroUsd: costMicroUsd(usage) })
  } catch {
    // 사용량을 못 더해도 읽은 명세서는 돌려준다
  }
}

export async function POST(request: Request): Promise<Response> {
  const image = await readImage(request)
  if (image === null) return status(400)

  let approved: boolean
  try {
    const me = await readMe()
    approved = me.hospital !== null && me.hospital.status === 'approved'
  } catch (err) {
    if (err instanceof NotSignedInError) return status(401)
    return fail('E-AI-FAILED')
  }
  if (!approved) return status(403)

  let sb: SupabaseClient
  try {
    sb = await supabaseServer()
  } catch {
    return fail('E-INV-READ-FAILED')
  }
  const items = await readItems(sb)
  if (items === null) return fail('E-INV-READ-FAILED')

  try {
    const result = await callClaude({
      system: invoiceSystem(),
      user: invoiceUser(items.map(({ name, unit }) => ({ name, unit }))),
      schema: INVOICE_SCHEMA,
      effort: 'medium',
      image: { mediaType: 'image/jpeg', data: image },
    })
    if (result.usage !== null) await recordUsage(sb, result.usage)
    if (!result.ok) return fail(result.code === 'E-AI-BUSY' || result.code === 'E-AI-LIMIT' ? result.code : 'E-AI-FAILED')

    const answer = invoiceFromAnswer(result.text, items.length, todayInKorea())
    if (!answer.ok) return fail(answer.code)
    // 답의 물품 번호(1부터, 목록 안인지는 invoiceFromAnswer가 봤다) → 그 차례 물품 id
    const lines = answer.lines.map((line) => ({
      name: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      amount: line.amount,
      itemId: line.item === null ? null : (items[line.item - 1]?.id ?? null),
      unsure: line.unsure,
    }))
    return Response.json(
      { date: answer.date, vendor: answer.vendor, lines },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return fail('E-AI-FAILED')
  }
}
