import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_MAX_BYTES } from '@/types/inventory'
import { INVOICE_PATH, invoiceAnswerOf, readInvoice } from './invoiceClient'

// 브라우저에서 명세서 읽기 경로 부르기 (spec inventory AC-7508.1·AC-7508.2, design.md 5·6절). 진짜 네트워크는 쓰지 않는다(fetch 가짜).
// 몸통은 { image } 하나(JPEG base64), 답은 { date, vendor, lines: [{ name, qty, unitPrice, amount, itemId, unsure }] }다.
// 물품 이름·거래처·숫자는 지어낸 것이다

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const jpeg = () => new Blob([JPEG_BYTES], { type: 'image/jpeg' })
const base64Of = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

const LINE = { name: '일회용주사기 3ml', qty: 200, unitPrice: 95, amount: 19000, itemId: 'item-5', unsure: false }
const ANSWER = {
  date: '2026-11-21',
  vendor: '메디팜',
  lines: [LINE, { name: '테이핑 테이프 5cm', qty: 12, unitPrice: null, amount: null, itemId: null, unsure: true }],
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const jsonAnswer = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1)
  if (call === undefined) throw new Error('fetch를 부르지 않았어요')
  return { url: String(call[0]), init: call[1] ?? {} }
}

describe('readInvoice 보내기 (AC-7508.1)', () => {
  it('AC-7508.1: /api/ai/inventory/invoice로 { image } 하나(JPEG base64)만 POST한다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer(ANSWER))
    await readInvoice(jpeg())
    const { url, init } = lastCall()
    expect(INVOICE_PATH).toBe('/api/ai/inventory/invoice')
    expect(url).toBe('/api/ai/inventory/invoice')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(Object.keys(body)).toEqual(['image'])
    expect(body.image).toBe(base64Of(JPEG_BYTES))
    expect(String(body.image).startsWith('/9j/')).toBe(true)
  })

  it('AC-7508.1: JPEG가 아니거나 3,000,000바이트를 넘으면 보내지 않고 E-INV-PHOTO', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' })
    expect(await readInvoice(png)).toEqual({ kind: 'error', code: 'E-INV-PHOTO' })
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1)
    big.set([0xff, 0xd8, 0xff])
    expect(await readInvoice(new Blob([big], { type: 'image/jpeg' }))).toEqual({ kind: 'error', code: 'E-INV-PHOTO' })
    expect(await readInvoice(new Blob([], { type: 'image/jpeg' }))).toEqual({ kind: 'error', code: 'E-INV-PHOTO' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7508.2: 200 답이면 날짜·거래처·줄을 그대로 준다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer(ANSWER))
    expect(await readInvoice(jpeg())).toEqual({ kind: 'ok', invoice: ANSWER })
  })

  it('AC-7508.1: 연결이 끊기면 E-AI-BUSY(던지지 않는다)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await readInvoice(jpeg())).toEqual({ kind: 'error', code: 'E-AI-BUSY' })
  })

  it('AC-7508.1: 몸통이 JSON이 아니면 E-AI-FAILED', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    expect(await readInvoice(jpeg())).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})

describe('invoiceAnswerOf 답 읽기 (AC-7508.1·AC-7508.2)', () => {
  it.each([
    [422, 'E-INV-NO-LINES'],
    [502, 'E-INV-READ-FAILED'],
    [503, 'E-AI-BUSY'],
    [402, 'E-AI-LIMIT'],
    [502, 'E-AI-FAILED'],
  ] as const)('AC-7508.1: %i { code: %s }는 그 번호다', (status, code) => {
    expect(invoiceAnswerOf(status, { code })).toEqual({ kind: 'error', code })
  })

  it('AC-7508.1: 몸통 없는 400은 E-INV-PHOTO, 401·403·모르는 번호는 E-AI-FAILED', () => {
    expect(invoiceAnswerOf(400, null)).toEqual({ kind: 'error', code: 'E-INV-PHOTO' })
    expect(invoiceAnswerOf(401, null)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    expect(invoiceAnswerOf(403, null)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    expect(invoiceAnswerOf(500, { code: 'E-SOMETHING' })).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    expect(invoiceAnswerOf(0, null)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it('AC-7508.2: 200 답도 모양을 다시 본다 — 틀리면 E-AI-FAILED', () => {
    const bad: unknown[] = [
      null,
      [],
      { ...ANSWER, lines: [] },
      { ...ANSWER, lines: 'x' },
      { ...ANSWER, date: '2026-13-01' },
      { ...ANSWER, date: 20261121 },
      { ...ANSWER, vendor: 3 },
      { ...ANSWER, vendor: '가'.repeat(41) },
      { ...ANSWER, lines: [{ ...LINE, qty: 0 }] },
      { ...ANSWER, lines: [{ ...LINE, qty: 1.5 }] },
      { ...ANSWER, lines: [{ ...LINE, qty: 1_000_001 }] },
      { ...ANSWER, lines: [{ ...LINE, name: '' }] },
      { ...ANSWER, lines: [{ ...LINE, name: '가'.repeat(61) }] },
      { ...ANSWER, lines: [{ ...LINE, unitPrice: -1 }] },
      { ...ANSWER, lines: [{ ...LINE, amount: 1_000_000_001 }] },
      { ...ANSWER, lines: [{ ...LINE, itemId: 7 }] },
      { ...ANSWER, lines: [{ ...LINE, itemId: '' }] },
      { ...ANSWER, lines: [{ ...LINE, unsure: 'no' }] },
      { ...ANSWER, lines: Array.from({ length: 101 }, () => LINE) },
    ]
    for (const body of bad) expect(invoiceAnswerOf(200, body), JSON.stringify(body)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it('AC-7508.2: 날짜·거래처가 null이어도 받고, 받은 칸만 새로 만든다', () => {
    const answer = invoiceAnswerOf(200, { date: null, vendor: null, lines: [{ ...LINE, extra: '<b>x</b>' }], other: 1 })
    expect(answer).toEqual({ kind: 'ok', invoice: { date: null, vendor: null, lines: [LINE] } })
  })
})
