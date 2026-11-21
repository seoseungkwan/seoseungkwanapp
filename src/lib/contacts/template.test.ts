import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { CONTACT_CATEGORIES } from './categories'
import { CONTACT_HEADERS, CONTACT_SHEET, EQUIPMENT_HEADERS, EQUIPMENT_SHEET, GUIDE_SHEET } from './sheet'
import { readContactsFile } from './workbook'

// 저장소의 엑셀 양식 파일(specs/contacts AC-6504.3, design.md '양식 파일'). [양식 받기]가 이 파일을 그대로 내려준다.
// 시트 이름·머리글·분류 목록이 올리기 코드의 상수와 같은지, 실제 업체 자료가 섞여 커밋되지 않았는지(두 시트에 머리글 줄만) 본다
const FILE = join(process.cwd(), 'public', 'contacts', 'contacts-template.xlsx')
const bytes = () => new Uint8Array(readFileSync(FILE))
const workbook = () => XLSX.read(bytes(), { type: 'array', cellDates: false })

// 값이 든 칸(빈 글자 아님)의 줄 번호(0부터)
function rowsWithValues(ws: XLSX.WorkSheet): number[] {
  const rows = new Set<number>()
  for (const [address, cell] of Object.entries(ws)) {
    if (address.startsWith('!')) continue
    const value = (cell as XLSX.CellObject).v
    if (value === undefined || value === null || value === '') continue
    rows.add(XLSX.utils.decode_cell(address).r)
  }
  return [...rows].sort((a, b) => a - b)
}

// 시트 이름 → xl/workbook.xml의 r:id → xl/_rels/workbook.xml.rels의 Target(절대 '/xl/…'·상대 'worksheets/…' 둘 다) → 시트 XML 글
function sheetXml(name: string): string {
  const cfb = XLSX.CFB.read(bytes(), { type: 'array' })
  const text = (path: string) => {
    const entry = XLSX.CFB.find(cfb, path)
    if (!entry) throw new Error(`없음: ${path}`)
    return new TextDecoder().decode(entry.content as Uint8Array)
  }
  const sheetTag = [...text('/xl/workbook.xml').matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`name="${name}"`))
  const rid = sheetTag?.match(/\br:id="([^"]+)"/)?.[1]
  expect(rid, `${name} 시트`).toBeTruthy()
  const rel = [...text('/xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${rid}"`))
  const target = rel?.match(/\bTarget="([^"]+)"/)?.[1] ?? ''
  return text(target.startsWith('/') ? target : posix.join('/xl', target))
}

describe('AC-6504.3 양식 파일 public/contacts/contacts-template.xlsx', () => {
  it("AC-6504.3: 시트가 '쓰는 법'·'연락처'·'장비' 차례다", () => {
    expect(workbook().SheetNames).toEqual([GUIDE_SHEET, CONTACT_SHEET, EQUIPMENT_SHEET])
  })

  it("AC-6504.3: '연락처'·'장비' 첫 줄이 머리글 상수와 글자·차례가 같다", () => {
    const wb = workbook()
    const head = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })[0]
    expect(head(CONTACT_SHEET)).toEqual([...CONTACT_HEADERS])
    expect(head(EQUIPMENT_SHEET)).toEqual([...EQUIPMENT_HEADERS])
  })

  it("AC-6504.3: '연락처'·'장비'에는 머리글 줄밖에 없다(실제 업체 자료가 섞여 커밋되지 않게)", () => {
    const wb = workbook()
    expect(rowsWithValues(wb.Sheets[CONTACT_SHEET])).toEqual([0])
    expect(rowsWithValues(wb.Sheets[EQUIPMENT_SHEET])).toEqual([0])
  })

  it("AC-6504.3: '연락처' A열에 분류 넷 목록 고르기가 있다(CONTACT_CATEGORIES 글자를 쉼표로 이은 것)", () => {
    const xml = sheetXml(CONTACT_SHEET)
    const lists = [...xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)].filter(([, attrs]) => /\btype="list"/.test(attrs))
    expect(lists).toHaveLength(1)
    const [, attrs, body] = lists[0]
    const sqref = attrs.match(/\bsqref="([^"]+)"/)?.[1] ?? ''
    expect(sqref.split(' ').every((range) => /^A\d+(?::A\d+)?$/.test(range)), sqref).toBe(true)
    expect(sqref).toMatch(/^A2\b/)
    const formula = body.match(/<formula1>([\s\S]*?)<\/formula1>/)?.[1] ?? ''
    expect(formula.replace(/&quot;/g, '"')).toBe(`"${CONTACT_CATEGORIES.map((c) => c.label).join(',')}"`)
    expect(formula.replace(/&quot;/g, '"')).toBe('"거래처,수리·관리,기관·보험,기타"')
  })

  it("AC-6504.3: readContactsFile로 읽으면 'empty'다(예시 표는 '쓰는 법'에만 있다)", async () => {
    expect(await readContactsFile(bytes())).toBe('empty')
    const guide = XLSX.utils.sheet_to_json<unknown[]>(workbook().Sheets[GUIDE_SHEET], { header: 1, raw: true, defval: null })
    expect(guide.some((row) => CONTACT_HEADERS.every((h, i) => row[i] === h)), "'쓰는 법'의 예시 표").toBe(true)
  })
})
