import { describe, expect, it } from 'vitest'
import { validateUisRxPayload } from '@/lib/payload/uisarang'
import type { UisFileResult, UisRxPayload } from '@/types/uisarang'
import { readUisFile } from './readFile'
import { bookBytes, gridRowOf, RX_LINES, rxRows, TODAY, type RxLine, type RxOptions } from './testBooks'

// 기간별처방통계 → 처방 코드별 처방량·총액(design.md §4-2)

const SPAN = { from: '2026-10-01', to: '2026-10-31' }
// testBooks RX_LINES에서 나오는 모양: 코드 차례 · 앞뒤 빈칸 뗀 같은 코드(' carm ')는 첫 줄 이름으로 더함 · 원 미만은 줄마다 버림
const PAYLOAD: UisRxPayload = {
  v: 1,
  rows: [
    { code: 'CRYO 대관절', name: '냉동치료 대관절', qty: 15, amount: 225_000 },
    { code: 'ESWT 1부위', name: '체외충격파 1부위', qty: 8, amount: 400_000 },
    { code: 'carm', name: '카름정', qty: 120.75, amount: 36_450 },
    { code: 'mm010 100/100', name: '근이완 주사', qty: 0.333, amount: 12_345 },
  ],
  total: 673_795,
}

function payloadOf(result: UisFileResult): UisRxPayload {
  if (result.status !== 'read' || result.read.kind !== 'rx') throw new Error(`받지 못함: ${JSON.stringify(result)}`)
  return result.read.payload
}
const read = (options: RxOptions = {}) => readUisFile(bookBytes(rxRows(options)), TODAY)
const rx = (options: RxOptions = {}) => payloadOf(read(options))
const line = (code: string, name: string, qty: number | string | null, amount: number | string | null): RxLine => ({ code, name, qty, amount })

describe('AC-8804.1 코드 줄 → {code, name, qty, amount} · 같은 코드는 하나로 · 코드 차례', () => {
  it('AC-8804.1: 한 달 파일', () => {
    expect(read()).toStrictEqual({ status: 'read', read: { kind: 'rx', span: { ...SPAN, unit: 'month' }, payload: PAYLOAD } })
  })

  it('AC-8804.1: 코드 칸이 빈 줄은 건너뛰고(소계·설명 줄) 합계 줄은 코드 줄이 아니다', () => {
    const lines = [...RX_LINES, { code: null, name: '쪽 소계', qty: 1, amount: 1 }, { code: '  ', name: '빈 코드', qty: 2, amount: 2 }]
    expect(rx({ lines, total: 673_795 })).toStrictEqual(PAYLOAD)
  })

  it('AC-8804.1: 숫자로 적힌 코드도 글자 코드', () => {
    expect(rx({ lines: [line('B', '비', 1, 10), { code: 12345, name: '숫자 코드', qty: 2, amount: 20 }] })).toStrictEqual({
      v: 1,
      rows: [
        { code: '12345', name: '숫자 코드', qty: 2, amount: 20 },
        { code: 'B', name: '비', qty: 1, amount: 10 },
      ],
      total: 30,
    })
  })

  it('AC-8804.1: 만든 모양은 저장 모양 검사를 그대로 지난다', () => {
    const payload = rx()
    expect(validateUisRxPayload(payload)).toStrictEqual(payload)
  })
})

describe('AC-8804.2 처방량은 소수 그대로 더해 셋째 자리 반올림 · 총액은 줄마다 원 미만을 버린 뒤 더함', () => {
  it('AC-8804.2: 0.1 + 0.2 → 0.3 · 1.0004 + 1.0004 → 2.001 · 빈칸은 0 · 음수 그대로', () => {
    const payload = rx({
      lines: [line('a', '가', 0.1, 10.9), line('a', '가', 0.2, 10.9), line('b', '나', 1.0004, null), line('b', '나', 1.0004, 5), line('c', '다', null, -100.5), line('d', '라', -2, 0)],
      total: 'auto',
    })
    expect(payload.rows).toStrictEqual([
      { code: 'a', name: '가', qty: 0.3, amount: 20 },
      { code: 'b', name: '나', qty: 2.001, amount: 5 },
      { code: 'c', name: '다', qty: 0, amount: -100 },
      { code: 'd', name: '라', qty: -2, amount: 0 },
    ])
    expect(payload.total).toBe(-75)
  })

  it('AC-8804.2: 숫자 글자(쉼표)', () => {
    expect(rx({ lines: [line('a', '가', '1,234.5', '1,000,000')], total: '1,000,000' }).rows).toStrictEqual([{ code: 'a', name: '가', qty: 1234.5, amount: 1_000_000 }])
  })
})

describe('AC-8804.3 합계 줄 총액 = total · 맞지 않으면 E-UIS-TOTAL', () => {
  it('AC-8804.3: 처방명칭이 합계인 줄도 합계 줄', () => {
    expect(rx({ totalBy: 'name' })).toStrictEqual(PAYLOAD)
  })

  it('AC-8804.3: 합계 총액이 빈칸이면 total null', () => {
    expect(rx({ total: null })).toStrictEqual({ ...PAYLOAD, total: null })
  })

  it('AC-8804.3: 줄마다 버림 차이는 코드 줄 수까지 봐 준다', () => {
    expect(rx({ total: 673_795 + 5 }).total).toBe(673_800) // 코드 줄 다섯
    expect(read({ total: 673_795 + 6 })).toStrictEqual({ status: 'refused', code: 'E-UIS-TOTAL', kind: 'rx', span: SPAN })
    expect(read({ total: 673_795 - 6 })).toMatchObject({ code: 'E-UIS-TOTAL' })
  })

  it('AC-8804.3: 소계 줄을 코드 줄로 두 번 센 엑셀은 E-UIS-TOTAL', () => {
    expect(read({ lines: [...RX_LINES, line('소계1', '쪽 소계', 0, 673_795)], total: 673_795 })).toMatchObject({ code: 'E-UIS-TOTAL' })
  })

  it('AC-8804.3: 합계 줄이 없으면 E-UIS-TOTAL', () => {
    expect(read({ total: 'none' })).toStrictEqual({ status: 'refused', code: 'E-UIS-TOTAL', kind: 'rx', span: SPAN })
  })
})

describe('AC-8804.4 코드·이름 검사 — 어기면 E-UIS-ROW(그 줄 차례)', () => {
  const longName = '가'.repeat(101)
  it.each([
    ['이름 101자', line('a', longName, 1, 1)],
    ['코드 101자', line('a'.repeat(101), '가', 1, 1)],
    ['이름 빈칸', line('a', '  ', 1, 1)],
    ['전화 모양', line('a', '문의 010-1234-5678', 1, 1)],
    ['주민번호 모양', line('900101-1234567', '가', 1, 1)],
    ['메일 모양', line('a', 'x@y.co', 1, 1)],
    ['처방량 글자', line('a', '가', '한 개', 1)],
    ['총액 글자', line('a', '가', 1, '1.2.3')],
  ])('AC-8804.4: %s', (_, bad) => {
    const rows = rxRows({ lines: [RX_LINES[0], bad], total: 1 })
    const at = rows.findIndex((row) => row[0] === bad.code && row[2] === bad.name)
    expect(readUisFile(bookBytes(rows), TODAY)).toStrictEqual({ status: 'refused', code: 'E-UIS-ROW', kind: 'rx', span: SPAN, row: gridRowOf(rows, at) })
  })

  it('AC-8804.4: 제어 글자(CSV에서만 남는다)', () => {
    const rows = rxRows({ lines: [line('a', '가\u0007나', 1, 1)], total: 1 })
    expect(readUisFile(bookBytes(rows, 'csv'), TODAY)).toMatchObject({ status: 'refused', code: 'E-UIS-ROW' })
  })

  it('AC-8804.4: 코드 3,000개까지 받고 넘으면 E-UIS-ROW', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => line(`c${String(i).padStart(4, '0')}`, '가', 1, 1))
    expect(rx({ lines: many(3000), total: 'auto' }).rows).toHaveLength(3000)
    const rows = rxRows({ lines: many(3001), total: 'auto' })
    expect(readUisFile(bookBytes(rows), TODAY)).toMatchObject({ status: 'refused', code: 'E-UIS-ROW', row: gridRowOf(rows, rows.findIndex((row) => row[0] === 'c3000')) })
  }, 30_000)
})

describe('AC-8804.5 처방 줄에는 환자 수 칸이 없다', () => {
  it('AC-8804.5: 열쇠는 code·name·qty·amount뿐(모양 열쇠는 v·rows·total)', () => {
    const payload = rx()
    expect(Object.keys(payload).sort()).toEqual(['rows', 'total', 'v'])
    for (const row of payload.rows) expect(Object.keys(row).sort()).toEqual(['amount', 'code', 'name', 'qty'])
  })
})

describe('AC-8802.6·AC-8802.9 되풀이 머리 줄·빈 줄 · 줄 번호', () => {
  it('AC-8802.6: 머리 줄이 쪽마다 되풀이되고 빈 줄이 끼어도 같다', () => {
    expect(rx({ repeatEvery: 2, blankEvery: 1 })).toStrictEqual(PAYLOAD)
  })

  it('AC-8802.9: 빈 줄 아래의 잘못된 줄 번호는 빈 줄을 뺀 위에서의 차례(엑셀 왼쪽 번호와 다르다)', () => {
    const rows = rxRows({ lines: [...RX_LINES.slice(0, 3), line('bad', '가', '??', 1)], blankEvery: 1, total: 1 })
    const at = rows.findIndex((row) => row[0] === 'bad')
    const row = gridRowOf(rows, at)
    expect(row).toBeLessThan(at + 1) // 빈 줄이 위에 있다
    expect(readUisFile(bookBytes(rows), TODAY)).toMatchObject({ code: 'E-UIS-ROW', row })
  })
})
