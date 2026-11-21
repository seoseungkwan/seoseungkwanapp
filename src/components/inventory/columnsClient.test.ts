import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIELDS } from '@/lib/inventory/ai'
import { COLUMNS_PATH, askColumns, columnsAnswerOf } from './columnsClient'

// 브라우저에서 엑셀 칸 맞춤 경로 부르기 (spec inventory AC-7509.2, design.md 5·6절). 진짜 네트워크는 쓰지 않는다(fetch 가짜).
// 몸통은 { header, rows } 둘뿐(sampleForAi가 만든 머리 줄 + 앞 줄 5개까지), 답은 { mapping }(칸마다 엑셀 칸 번호 또는 null)이다.
// 칸 이름·값은 지어낸 것이다

const HEADER = ['구분', '품명', '단위', '현재고', '안전재고', '유효기간', '구입처', '단가', '비고']
const ROWS = [
  ['주사약', '히알루론산 주사 2mL', '개', '6', '10', '2027-03-31', '한빛약품', '18500', ''],
  ['소모품', '주사기 1cc', '개', '300', '100', '', '메디팜', '80', ''],
]
const SAMPLE = { header: HEADER, rows: ROWS, problem: false }
const MAPPING = { category: 0, name: 1, unit: 2, minQty: 4, qty: 3, expiry: 5, vendor: 6, unitPrice: 7 }

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

describe('askColumns 보내기 (AC-7509.2)', () => {
  it('AC-7509.2: /api/ai/inventory/columns로 { header, rows } 둘만 POST한다(problem은 보내지 않는다)', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: MAPPING }))
    await askColumns(SAMPLE)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init } = lastCall()
    expect(COLUMNS_PATH).toBe('/api/ai/inventory/columns')
    expect(url).toBe('/api/ai/inventory/columns')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(init.cache).toBe('no-store')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['header', 'rows'])
    expect(body).toEqual({ header: HEADER, rows: ROWS })
  })

  it('AC-7509.2: 개인정보 모양(problem)이면 보내지 않고 E-INV-PRIVATE', async () => {
    const answer = await askColumns({ ...SAMPLE, problem: true })
    expect(answer).toEqual({ kind: 'error', code: 'E-INV-PRIVATE' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7509.2: 200 { mapping }이면 맞춘 칸을 준다', async () => {
    fetchMock.mockResolvedValue(jsonAnswer({ mapping: { ...MAPPING, expiry: null } }))
    expect(await askColumns(SAMPLE)).toEqual({ kind: 'ok', mapping: { ...MAPPING, expiry: null } })
  })

  it('AC-7509.2: 서버 오류 번호(422 E-INV-PRIVATE·E-INV-NO-NAME, 503 E-AI-BUSY, 402 E-AI-LIMIT, 502 E-AI-FAILED)는 그 번호다', async () => {
    const cases = [
      [422, 'E-INV-PRIVATE'],
      [422, 'E-INV-NO-NAME'],
      [503, 'E-AI-BUSY'],
      [402, 'E-AI-LIMIT'],
      [502, 'E-AI-FAILED'],
    ] as const
    for (const [status, code] of cases) {
      fetchMock.mockResolvedValueOnce(jsonAnswer({ code }, status))
      expect(await askColumns(SAMPLE)).toEqual({ kind: 'error', code })
    }
  })

  it('AC-7509.2: 몸통 없는 400·401·403·돌려보내는 답과 모르는 번호는 E-AI-FAILED, 연결이 끊기면 E-AI-BUSY', async () => {
    for (const status of [400, 401, 403]) {
      fetchMock.mockResolvedValueOnce(new Response(null, { status }))
      expect(await askColumns(SAMPLE)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    }
    fetchMock.mockResolvedValueOnce(jsonAnswer({ code: 'E-INV-READ-FAILED' }, 502))
    expect(await askColumns(SAMPLE)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 500 }))
    expect(await askColumns(SAMPLE)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await askColumns(SAMPLE)).toEqual({ kind: 'error', code: 'E-AI-BUSY' })
  })
})

describe('columnsAnswerOf 답 검사 (AC-7509.2)', () => {
  const count = HEADER.length

  it('AC-7509.2: 여덟 칸이 모두 있고 0~칸 수−1 정수 또는 null이며 물품 이름 칸이 있어야 한다', () => {
    expect(columnsAnswerOf(200, { mapping: MAPPING }, count)).toEqual({ kind: 'ok', mapping: MAPPING })
    const allNullButName = Object.fromEntries(FIELDS.map((field) => [field, field === 'name' ? 8 : null]))
    expect(columnsAnswerOf(200, { mapping: allNullButName }, count)).toEqual({ kind: 'ok', mapping: allNullButName })
  })

  it('AC-7509.2: 칸이 빠지거나 더 있거나, 범위 밖·소수·글자이거나, 두 칸이 같은 번호거나, 물품 이름 칸이 없으면 E-AI-FAILED', () => {
    const missing = Object.fromEntries(Object.entries(MAPPING).filter(([field]) => field !== 'unit'))
    const bad: unknown[] = [
      null,
      [],
      { mapping: null },
      { mapping: missing },
      { mapping: { ...MAPPING, extra: 1 } },
      { mapping: { ...MAPPING, unit: count } },
      { mapping: { ...MAPPING, unit: -1 } },
      { mapping: { ...MAPPING, unit: 1.5 } },
      { mapping: { ...MAPPING, unit: '2' } },
      { mapping: { ...MAPPING, unit: 1 } },
      { mapping: { ...MAPPING, name: null } },
    ]
    for (const body of bad) expect(columnsAnswerOf(200, body, count)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })

  it('AC-7509.2: 200이 아니면 정해 둔 번호만 받는다', () => {
    expect(columnsAnswerOf(422, { code: 'E-INV-NO-NAME' }, count)).toEqual({ kind: 'error', code: 'E-INV-NO-NAME' })
    expect(columnsAnswerOf(500, { mapping: MAPPING }, count)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
    expect(columnsAnswerOf(503, { code: 'E-WHATEVER' }, count)).toEqual({ kind: 'error', code: 'E-AI-FAILED' })
  })
})
