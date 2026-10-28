import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Grid } from '@/types/parse'
import { BIT_HEADER, buildFakeBitTable, toCsv, toCsvBytes } from '../../../fixtures/make-fake-fixtures'
import { MAX_BYTES, MAX_ROWS, decodeText, parseCsv, readGrid, sniffFormat } from './common'

const FAKE_DIR = fileURLToPath(new URL('../../../fixtures/fake-bit/', import.meta.url))
const fakeBytes = (name: string) => new Uint8Array(readFileSync(join(FAKE_DIR, name)))
const utf8 = (text: string) => new TextEncoder().encode(text)
const bytesOf = (...parts: Array<string | number[]>) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...utf8(part)] : part)))

const BOM = [0xef, 0xbb, 0xbf]
const HANGUL_CP949 = [0xc7, 0xd1, 0xb1, 0xdb] // '한글'
const CODE = BIT_HEADER.indexOf('처방코드')
const AMOUNT = BIT_HEADER.indexOf('금액')
const DATE = BIT_HEADER.indexOf('처방일자')
const SLOW = { timeout: 30_000 }

function gridOf(bytes: Uint8Array): Grid {
  const result = readGrid(bytes)
  if (!result.ok) throw new Error(`readGrid 실패: ${result.code}`)
  return result.value
}

function bookBytes(sheet: XLSX.WorkSheet, bookType: 'xlsx' | 'biff8'): Uint8Array {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType, compression: true }))
}

describe('AC-003.1 decodeText', () => {
  it('BOM이 있으면 떼고 UTF-8로 읽는다', () => {
    const text = decodeText(bytesOf(BOM, '처방코드,주소'))
    expect(text).toBe('처방코드,주소')
    expect(text.charCodeAt(0)).not.toBe(0xfeff)
  })

  it('BOM 없는 UTF-8', () => {
    expect(decodeText(utf8('가짜정 10mg,외래'))).toBe('가짜정 10mg,외래')
  })

  it('UTF-8이 아니면 CP949로 읽는다', () => {
    expect(decodeText(new Uint8Array(HANGUL_CP949))).toBe('한글')
  })

  it('가짜 파일 세 인코딩이 같은 글이 된다', () => {
    const plain = decodeText(fakeBytes('fake-utf8.csv'))
    expect(plain.startsWith('환자별 소모 통계')).toBe(true)
    expect(decodeText(fakeBytes('fake-utf8-bom.csv'))).toBe(plain)
    expect(decodeText(fakeBytes('fake-cp949.csv'))).toBe(plain)
  })

  it('빈 바이트 → 빈 글', () => {
    expect(decodeText(new Uint8Array(0))).toBe('')
  })
})

describe('AC-003.1 sniffFormat — 확장자가 아니라 내용으로', () => {
  it.each([
    ['fake.xlsx', 'xlsx'],
    ['fake-dates-serial.xlsx', 'xlsx'],
    ['fake-biff.xls', 'xls'],
    ['fake-html.xls', 'html'], // 이름은 .xls지만 속은 HTML 표
    ['fake-utf8-bom.csv', 'text'],
    ['fake-utf8.csv', 'text'],
    ['fake-cp949.csv', 'text'],
    ['fake-script-name.csv', 'text'], // 칸 안에 '<'가 있어도 첫 글자가 아니면 글
  ] as const)('%s → %s', (name, format) => {
    expect(sniffFormat(fakeBytes(name))).toBe(format)
  })

  it('BOM·공백 뒤 <TABLE>(대문자)도 html', () => {
    expect(sniffFormat(bytesOf(BOM, '\r\n  \t<TABLE><TR><TD>a</TD></TR></TABLE>'))).toBe('html')
    expect(sniffFormat(utf8('<!DOCTYPE html>\n<html><body></body></html>'))).toBe('html')
  })

  it('<로 시작해도 <table·<html이 없으면 글', () => {
    expect(sniffFormat(utf8('<p>안내</p>'))).toBe('text')
  })

  it('<table이 있어도 <로 시작하지 않으면 글', () => {
    expect(sniffFormat(utf8('처방코드,<table>\r\n'))).toBe('text')
  })

  it('빈 바이트 → 글', () => {
    expect(sniffFormat(new Uint8Array(0))).toBe('text')
  })
})

describe('AC-003.1 parseCsv', () => {
  it('쉼표로 나누고 CRLF·LF 둘 다 줄 끝', () => {
    expect(parseCsv('a,b,c\r\nd,e,f\r\n')).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']])
    expect(parseCsv('a,b\nc,d')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseCsv('a\rb')).toEqual([['a'], ['b']])
  })

  it('따옴표 칸 안의 쉼표', () => {
    expect(parseCsv('D1003,"가짜연고 5g, 외용",약품')).toEqual([['D1003', '가짜연고 5g, 외용', '약품']])
  })

  it('따옴표 칸 안의 줄바꿈(CRLF·LF)은 칸 안에 남는다', () => {
    expect(parseCsv('"첫 줄\r\n둘째 줄",x\r\n"셋\n넷",y\r\n')).toEqual([
      ['첫 줄\r\n둘째 줄', 'x'],
      ['셋\n넷', 'y'],
    ])
  })

  it('따옴표 칸 안의 "" → "', () => {
    expect(parseCsv('"말 ""안녕""",z\r\n""""')).toEqual([['말 "안녕"', 'z'], ['"']])
  })

  it('빈 칸·끝 쉼표는 빈 글자 칸', () => {
    expect(parseCsv('a,,c\r\n,\r\nd,e,')).toEqual([['a', '', 'c'], ['', ''], ['d', 'e', '']])
  })

  it('빈 줄은 건너뛴다(빈 배열로 남기지 않는다)', () => {
    expect(parseCsv('\r\n\r\na\r\n\r\n\nb\n\n')).toEqual([['a'], ['b']])
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\r\n\n')).toEqual([])
  })

  it('칸 글자는 바꾸지 않는다(앞뒤 공백·<script> 그대로)', () => {
    expect(parseCsv(' AA154 ,<script>alert(1)</script>')).toEqual([[' AA154 ', '<script>alert(1)</script>']])
  })

  it('생성기 toCsv를 되돌리면 빈 줄만 빠진 같은 표', () => {
    const table = buildFakeBitTable({ rows: 300 })
    expect(parseCsv(toCsv(table))).toEqual(table.filter((row) => row.length > 0))
  })
})

describe('AC-003.1 readGrid — 가짜 비트 파일', () => {
  const lines = buildFakeBitTable().filter((row) => row.length > 0) // 파일들을 만든 표에서 빈 줄만 뺀 것
  const base = gridOf(fakeBytes('fake-utf8-bom.csv'))

  it('CSV: 생성기와 같은 줄 수·제목·기간·머리줄·처방코드 칸', () => {
    expect(base).toHaveLength(lines.length)
    expect(base[0]).toEqual(['환자별 소모 통계'])
    expect(base[1]).toEqual(['기간: 2026-09-01 ~ 2026-10-24'])
    expect(base[2]).toEqual([...BIT_HEADER])
    expect(base.map((row) => row[CODE] ?? null)).toEqual(lines.map((row) => row[CODE] || null))
  })

  it('빈 칸은 null, 줄 끝의 빈 칸은 뗀다(합계 줄은 금액 칸에서 끝남)', () => {
    const total = lines[lines.length - 1]
    expect(base[base.length - 1]).toEqual([null, '합계', ...Array<null>(AMOUNT - 2).fill(null), total[AMOUNT]])
    expect(base.flat()).not.toContain('')
  })

  it.each(['fake-utf8.csv', 'fake-cp949.csv', 'fake.xlsx', 'fake-biff.xls', 'fake-html.xls'])(
    '%s → UTF-8 BOM CSV와 같은 표',
    (name) => {
      expect(gridOf(fakeBytes(name))).toEqual(base)
    },
  )

  it('fake-dates-serial.xlsx의 날짜 칸은 엑셀 숫자 날짜 그대로(숫자)', () => {
    const grid = gridOf(fakeBytes('fake-dates-serial.xlsx'))
    const body = grid.slice(3).filter((row) => row[CODE] !== null && row[CODE] !== '처방코드')
    expect(body).toHaveLength(3000)
    expect(body[0][DATE]).toBe(46266) // 2026-09-01
    expect(body.every((row) => typeof row[DATE] === 'number')).toBe(true)
    // 날짜 칸 말고는 CSV와 같다
    const withoutDate = (g: Grid) => g.map((row) => row.filter((_, c) => c !== DATE))
    expect(withoutDate(grid)).toEqual(withoutDate(base))
  })

  it('fake-empty.csv → 본문 없이 제목·기간·머리줄만(빈 결과 판정은 다음 단계)', () => {
    expect(gridOf(fakeBytes('fake-empty.csv'))).toEqual([
      ['환자별 소모 통계'],
      ['기간: 2026-09-01 ~ 2026-10-24'],
      [...BIT_HEADER],
    ])
  })

  // 혼자 돌면 약 0.35초. 다른 시험과 같이 돌면 1초 가까이 걸려 여유를 둔다(전체 3초 예산은 Worker 단계 시험이 본다)
  it('10만 줄 CSV를 1.5초 안에 읽는다', SLOW, () => {
    const bytes = toCsvBytes(buildFakeBitTable({ rows: 100_000 }), 'utf8-bom')
    const started = performance.now()
    const grid = gridOf(bytes)
    const elapsed = performance.now() - started
    expect(grid.length).toBeGreaterThan(100_000)
    expect(elapsed).toBeLessThan(1500)
  })
})

describe('AC-003.1 readGrid — 칸 값을 바꾸지 않는다', () => {
  it('따옴표 안 쉼표·줄바꿈 CSV', () => {
    expect(gridOf(bytesOf(BOM, '처방명칭,유형\r\n"가짜연고 5g, 외용","첫 줄\r\n둘째 줄"\r\n'))).toEqual([
      ['처방명칭', '유형'],
      ['가짜연고 5g, 외용', '첫 줄\r\n둘째 줄'],
    ])
  })

  it('HTML 표 칸은 글자 그대로(앞 0·날짜 모양·숫자 모양을 숫자·날짜로 바꾸지 않는다)', () => {
    const html = '<html><body><table><tr><td>00123</td><td>2026-10-01</td><td>20261001</td><td>9000001</td></tr></table></body></html>'
    expect(gridOf(utf8(html))).toEqual([['00123', '2026-10-01', '20261001', '9000001']])
  })

  it('CP949 HTML 표, BOM·공백 뒤 대문자 태그', () => {
    expect(gridOf(bytesOf('<html><table><tr><td>', HANGUL_CP949, '</td></tr></table></html>'))).toEqual([['한글']])
    expect(gridOf(bytesOf(BOM, '\r\n  \t<TABLE><TR><TD>a</TD><TD></TD><TD>b</TD></TR></TABLE>'))).toEqual([['a', null, 'b']])
  })

  // sniffFormat이 html로 본 앞 공백(탭 포함)을 SheetJS는 건너뛰지 않는다(탭으로 시작하면 CSV/TSV로 읽음)
  it.each([
    ['탭', '\t<html><table><tr><td>a</td><td>b</td></tr></table></html>'],
    ['줄바꿈 + 탭', '\r\n\t<table><tr><td>a</td><td>b</td></tr></table>'],
    ['CP949 + 탭', ['\t\t<table><tr><td>', HANGUL_CP949, '</td><td>b</td></tr></table>']],
  ] as const)('%s으로 시작하는 HTML 표도 같은 표', (_, input) => {
    const bytes = typeof input === 'string' ? utf8(input) : bytesOf(...input)
    expect(sniffFormat(bytes)).toBe('html')
    expect(gridOf(bytes)).toEqual([[typeof input === 'string' ? 'a' : '한글', 'b']])
  })

  it.each(['xlsx', 'biff8'] as const)('%s: 날짜 서식 숫자 칸도 Date가 아니라 숫자, 글자 칸은 글자', (bookType) => {
    const sheet = XLSX.utils.aoa_to_sheet([['날짜', '코드', '참거짓'], [46296, '00123', true]])
    sheet['A2'].z = 'yyyy-mm-dd' // 실제 엑셀이 날짜를 담는 모양
    expect(gridOf(bookBytes(sheet, bookType))).toEqual([['날짜', '코드', '참거짓'], [46296, '00123', 'true']])
  })
})

describe('AC-003.2 readGrid — 오류', () => {
  it('MAX_BYTES(50MB)를 넘으면 E-PARSE-TOO-BIG', () => {
    expect(MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(readGrid(new Uint8Array(MAX_BYTES + 1))).toEqual({ ok: false, code: 'E-PARSE-TOO-BIG' })
  })

  it('MAX_ROWS(100만) 줄까지 받고, 넘으면 E-PARSE-TOO-BIG', SLOW, () => {
    expect(MAX_ROWS).toBe(1_000_000)
    expect(gridOf(utf8('a\n'.repeat(MAX_ROWS)))).toHaveLength(MAX_ROWS)
    expect(readGrid(utf8('a\n'.repeat(MAX_ROWS + 1)))).toEqual({ ok: false, code: 'E-PARSE-TOO-BIG' })
  })

  it('엑셀 시트가 읽는 줄 수 상한에서 잘리면 E-PARSE-TOO-BIG(빈 줄 때문에 남은 줄이 적어도)', SLOW, () => {
    const sheet = XLSX.utils.aoa_to_sheet([['a']])
    XLSX.utils.sheet_add_aoa(sheet, [['z']], { origin: `A${MAX_ROWS + 5}` })
    expect(readGrid(bookBytes(sheet, 'xlsx'))).toEqual({ ok: false, code: 'E-PARSE-TOO-BIG' })
  })

  it.each([
    ['깨진 zip', bytesOf([0x50, 0x4b, 0x03, 0x04], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])],
    ['반만 남은 xlsx', fakeBytes('fake.xlsx').subarray(0, 2000)],
    ['깨진 OLE(암호 걸린 엑셀·옛 xls 모양)', bytesOf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], Array<number>(504).fill(0))],
    ['표 없는 HTML', utf8('<html><body>보안 프로그램으로 잠긴 문서</body></html>')],
  ])('%s → E-PARSE-UNREADABLE(예외 내용은 내보내지 않는다)', (_, bytes) => {
    expect(readGrid(bytes)).toStrictEqual({ ok: false, code: 'E-PARSE-UNREADABLE' })
  })

  it('0바이트·빈 줄·빈 칸뿐 → E-PARSE-EMPTY', () => {
    const empty = { ok: false, code: 'E-PARSE-EMPTY' }
    expect(readGrid(new Uint8Array(0))).toEqual(empty)
    expect(readGrid(bytesOf(BOM, '\r\n\r\n'))).toEqual(empty)
    expect(readGrid(utf8(',,\r\n,,,\r\n'))).toEqual(empty)
    expect(readGrid(bookBytes(XLSX.utils.aoa_to_sheet([]), 'xlsx'))).toEqual(empty)
  })
})
