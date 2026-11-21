import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { CONTACT_HEADERS, CONTACT_KEYS, EQUIPMENT_HEADERS, EQUIPMENT_KEYS, type Cell, type ContactKey, type EquipmentKey } from './sheet'
import { MAX_CONTACT_ROWS, MAX_EQUIPMENT_ROWS, MAX_FILE_BYTES, readContactsFile } from './workbook'

// 엑셀 파일 읽기(specs/contacts REQ-6504 AC-6504.1·AC-6504.2, design.md '엑셀 읽기').
// 시험 파일은 여기서 xlsx로 만든다(저장소에 엑셀을 더 넣지 않는다). 업체·사람·번호는 모두 지어낸 것이다

type Row = Cell[]
type Sheet = [name: string, rows: Row[]]

function book(sheets: Sheet[], tweak?: (wb: XLSX.WorkBook) => void): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  tweak?.(wb)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const CONTACT_HEAD: Row = [...CONTACT_HEADERS]
const EQUIPMENT_HEAD: Row = [...EQUIPMENT_HEADERS]

function contactRow(values: Partial<Record<ContactKey, Cell>>): Row {
  return CONTACT_KEYS.map((key) => values[key] ?? null)
}
function equipmentRow(values: Partial<Record<EquipmentKey, Cell>>): Row {
  return EQUIPMENT_KEYS.map((key) => values[key] ?? null)
}
function contactCells(values: Partial<Record<ContactKey, Cell>>): Record<ContactKey, Cell> {
  return Object.fromEntries(CONTACT_KEYS.map((key) => [key, values[key] ?? null])) as Record<ContactKey, Cell>
}
function equipmentCells(values: Partial<Record<EquipmentKey, Cell>>): Record<EquipmentKey, Cell> {
  return Object.fromEntries(EQUIPMENT_KEYS.map((key) => [key, values[key] ?? null])) as Record<EquipmentKey, Cell>
}

const MEDICAL = { category: '거래처', name: '예시메디칼', phone: '02-000-0000', work: '주사기·소모품', personName: '김예시', personMobile: '010-0000-0000', personRole: '영업' }
const MEDICAL_2 = { name: '예시메디칼', personName: '이예시', personMobile: '010-0000-0001', personRole: '수리 기사' }
const FACILITY = { category: '수리·관리', name: '예시설비', phone: 212345678, sitePw: 'Fake-PW-0000', account: '예시은행 000-00-0000' }
const DEVICE = { company: '예시메디칼', name: '예시 치료기', serial: 1001, boughtOn: 46027, warrantyUntil: '2028-01-04' }

// '쓰는 법'에 '연락처'·'장비'와 같은 머리글의 예시 표가 있다(실제 양식과 같다)
const GUIDE: Sheet = [
  '쓰는 법',
  [
    ['주소록 엑셀 양식 쓰는 법'],
    [],
    CONTACT_HEAD,
    contactRow({ category: '거래처', name: '예시안내상사', personName: '안예시' }),
    [],
    EQUIPMENT_HEAD,
    equipmentRow({ company: '예시안내상사', name: '예시 안내기' }),
  ],
]

describe('AC-6504.1 readContactsFile — 시트 이름 연락처·장비만 읽는다', () => {
  it('AC-6504.1: 머리글로 칸을 찾아 적힌 줄마다 엑셀 줄 번호와 칸 값을 돌려준다(머리글 줄·빈 줄 뺌, 숫자는 숫자 그대로)', async () => {
    const bytes = book([
      GUIDE,
      ['연락처', [CONTACT_HEAD, contactRow(MEDICAL), contactRow(MEDICAL_2), [], contactRow(FACILITY)]],
      ['장비', [EQUIPMENT_HEAD, [], equipmentRow(DEVICE)]],
    ])
    expect(await readContactsFile(bytes)).toEqual({
      contacts: [
        { row: 2, cells: contactCells(MEDICAL) },
        { row: 3, cells: contactCells(MEDICAL_2) },
        { row: 5, cells: contactCells(FACILITY) },
      ],
      equipment: [{ row: 3, cells: equipmentCells(DEVICE) }],
    })
  })

  it('AC-6504.1: 머리글 차례가 달라도·모르는 칸이 있어도 머리글 글자로 칸을 찾는다', async () => {
    const order = [...CONTACT_KEYS].reverse()
    const head: Row = ['비고', ...order.map((key) => CONTACT_HEADERS[CONTACT_KEYS.indexOf(key)])]
    const row: Row = ['아무 말', ...order.map((key) => (MEDICAL as Partial<Record<ContactKey, Cell>>)[key] ?? null)]
    const bytes = book([
      ['연락처', [head, row]],
      ['장비', [['무상 수리 끝나는 날', '업체 이름', '일련번호', '장비 이름', '들여온 날']]],
    ])
    expect(await readContactsFile(bytes)).toEqual({ contacts: [{ row: 2, cells: contactCells(MEDICAL) }], equipment: [] })
  })

  it("AC-6504.1: '쓰는 법' 시트의 같은 머리글 예시 표는 읽지 않는다(두 시트가 머리글뿐이면 'empty')", async () => {
    const bytes = book([GUIDE, ['연락처', [CONTACT_HEAD]], ['장비', [EQUIPMENT_HEAD]]])
    expect(await readContactsFile(bytes)).toBe('empty')
  })

  it("AC-6504.1: 다른 이름 시트에 같은 머리글·줄이 있어도 읽지 않는다", async () => {
    const other: Sheet = ['Sheet1', [CONTACT_HEAD, contactRow(FACILITY)]]
    const copy: Sheet = ['연락처 (2)', [CONTACT_HEAD, contactRow(FACILITY)]]
    expect(await readContactsFile(book([other, copy, ['연락처', [CONTACT_HEAD]], ['장비', [EQUIPMENT_HEAD]]]))).toBe('empty')
    const result = await readContactsFile(book([other, ['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', [EQUIPMENT_HEAD]]]))
    expect(result).toEqual({ contacts: [{ row: 2, cells: contactCells(MEDICAL) }], equipment: [] })
  })

  it("AC-6504.1: '장비' 시트에 적힌 줄이 없으면 장비 줄은 빈 목록이다", async () => {
    const result = await readContactsFile(book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', [EQUIPMENT_HEAD, [], []]]]))
    expect(result).toEqual({ contacts: [{ row: 2, cells: contactCells(MEDICAL) }], equipment: [] })
  })

  it('AC-6504.1: 모든 칸이 빈 글자·빈칸뿐인 줄과 모르는 칸에만 적힌 줄은 적힌 줄이 아니다', async () => {
    const blank: Row = CONTACT_KEYS.map((_, i) => (i % 2 === 0 ? '' : '   '))
    const onlyExtra: Row = [...contactRow({}), '머리글 없는 칸에 적은 말']
    const bytes = book([
      ['연락처', [CONTACT_HEAD, blank, onlyExtra, contactRow(MEDICAL)]],
      ['장비', [EQUIPMENT_HEAD, equipmentRow({ serial: ' ' })]],
    ])
    expect(await readContactsFile(bytes)).toEqual({ contacts: [{ row: 4, cells: contactCells(MEDICAL) }], equipment: [] })
  })

  it('AC-6504.1: 시트 이름·머리글이 맥에서 온 조합형(NFD) 글자여도 찾는다', async () => {
    const bytes = book([
      ['연락처'.normalize('NFD'), [CONTACT_HEAD.map((h) => String(h).normalize('NFD')), contactRow(MEDICAL)]],
      ['장비'.normalize('NFD'), [EQUIPMENT_HEAD]],
    ])
    expect(await readContactsFile(bytes)).toEqual({ contacts: [{ row: 2, cells: contactCells(MEDICAL) }], equipment: [] })
  })

  it('AC-6504.1: 시트 범위가 엑셀 끝 줄까지 잡혀 있어도 값이 있는 줄까지만 본다', async () => {
    // 첫 시트 XML의 <dimension>을 엑셀 끝 칸·끝 줄(XFD1048576)로 바꾼다(xlsx로 그런 범위를 쓰면 시험이 너무 느려 zip 안 글을 고친다)
    const zip = XLSX.CFB.read(book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', [EQUIPMENT_HEAD]]]), { type: 'array' })
    const sheet = XLSX.CFB.find(zip, '/xl/worksheets/sheet1.xml')
    if (!sheet) throw new Error('sheet1.xml이 없다')
    const xml = new TextDecoder().decode(sheet.content as Uint8Array)
    expect(xml).toMatch(/<dimension ref="A1:N2"\/>/)
    sheet.content = new TextEncoder().encode(xml.replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:XFD1048576"/>'))
    const bytes = new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' }) as ArrayLike<number>)
    const started = performance.now()
    expect(await readContactsFile(bytes)).toEqual({ contacts: [{ row: 2, cells: contactCells(MEDICAL) }], equipment: [] })
    expect(performance.now() - started).toBeLessThan(3000)
  })
})

describe('AC-6504.2 readContactsFile — 읽지 않는 파일', () => {
  it(`AC-6504.2: ${MAX_FILE_BYTES}바이트를 넘으면 읽기 전에 'big', 딱 그만큼이면 big이 아니다`, async () => {
    expect(MAX_FILE_BYTES).toBe(5_000_000)
    expect(await readContactsFile(new Uint8Array(MAX_FILE_BYTES + 1))).toBe('big')
    expect(await readContactsFile(new Uint8Array(MAX_FILE_BYTES))).toBe('not-xlsx')
  })

  it(`AC-6504.2: 적힌 줄이 연락처 ${MAX_CONTACT_ROWS}줄·장비 ${MAX_EQUIPMENT_ROWS}줄을 넘으면 'big'(빈 줄은 세지 않음)`, async () => {
    expect([MAX_CONTACT_ROWS, MAX_EQUIPMENT_ROWS]).toEqual([2000, 1000])
    const people = (n: number) => Array.from({ length: n }, (_, i) => contactRow({ category: '기타', name: `예시상사${i}` }))
    const devices = (n: number) => Array.from({ length: n }, (_, i) => equipmentRow({ company: '예시상사0', name: `예시 기계${i}` }))
    const ok = await readContactsFile(book([['연락처', [CONTACT_HEAD, ...people(2000), [], []]], ['장비', [EQUIPMENT_HEAD, ...devices(1000)]]]))
    expect(ok).not.toBeTypeOf('string')
    if (typeof ok === 'string') return
    expect([ok.contacts.length, ok.equipment.length]).toEqual([2000, 1000])
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD, ...people(2001)]], ['장비', [EQUIPMENT_HEAD]]]))).toBe('big')
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD]], ['장비', [EQUIPMENT_HEAD, ...devices(1001)]]]))).toBe('big')
  })

  it("AC-6504.2: 비밀번호 걸린 엑셀(OLE 묶음 안에 EncryptionInfo·EncryptedPackage)은 'locked'", async () => {
    const cfb = XLSX.CFB.utils.cfb_new()
    XLSX.CFB.utils.cfb_add(cfb, 'EncryptionInfo', new Uint8Array([4, 0, 4, 0, 64, 0, 0, 0]))
    XLSX.CFB.utils.cfb_add(cfb, 'EncryptedPackage', new Uint8Array(512))
    const bytes = new Uint8Array(XLSX.CFB.write(cfb, { type: 'array' }) as ArrayLike<number>)
    expect([...bytes.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    expect(await readContactsFile(bytes)).toBe('locked')
  })

  it("AC-6504.2: zip이 아니면 'not-xlsx' — 글 파일(csv)·빈 파일·옛 엑셀(.xls)·깨진 OLE·아무 바이트", async () => {
    const csv = new TextEncoder().encode(`${CONTACT_HEADERS.join(',')}\n거래처,예시메디칼\n`)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([CONTACT_HEAD, contactRow(MEDICAL)]), '연락처')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([EQUIPMENT_HEAD]), '장비')
    const xls = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }) as ArrayBuffer)
    expect([...xls.subarray(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    const brokenOle = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8])
    for (const bytes of [csv, new Uint8Array(0), xls, brokenOle, new Uint8Array([1, 2, 3, 4, 5])])
      expect(await readContactsFile(bytes)).toBe('not-xlsx')
  })

  it("AC-6504.2: zip이어도 엑셀이 아니거나 깨졌으면 'not-xlsx'", async () => {
    const zip = XLSX.CFB.utils.cfb_new()
    XLSX.CFB.utils.cfb_add(zip, 'note.txt', new TextEncoder().encode('예시'))
    const notBook = new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip' }) as ArrayLike<number>)
    expect([...notBook.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const good = book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', [EQUIPMENT_HEAD]]])
    const cut = good.slice(0, 200)
    for (const bytes of [notBook, cut]) expect(await readContactsFile(bytes)).toBe('not-xlsx')
  })

  it("AC-6504.2: '연락처'·'장비' 시트가 하나라도 없으면 'form'", async () => {
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]]]))).toBe('form')
    expect(await readContactsFile(book([GUIDE, ['장비', [EQUIPMENT_HEAD, equipmentRow(DEVICE)]]]))).toBe('form')
    expect(await readContactsFile(book([['Sheet1', [CONTACT_HEAD, contactRow(MEDICAL)]], ['Sheet2', [EQUIPMENT_HEAD]]]))).toBe('form')
  })

  it("AC-6504.2: 첫 줄 머리글이 하나라도 빠지거나 시트가 비었으면 'form'", async () => {
    const noRole = CONTACT_HEAD.filter((h) => h !== '맡은 일')
    expect(await readContactsFile(book([['연락처', [noRole, contactRow(MEDICAL).slice(0, -1)]], ['장비', [EQUIPMENT_HEAD]]]))).toBe('form')
    const renamed = EQUIPMENT_HEAD.map((h) => (h === '무상 수리 끝나는 날' ? '보증 끝' : h))
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', [renamed]]]))).toBe('form')
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD, contactRow(MEDICAL)]], ['장비', []]]))).toBe('form')
    // 머리글이 첫 줄이 아니라 둘째 줄에 있으면 양식이 아니다(제목 줄을 더하지 말아 달라고 안내한다)
    const titled = XLSX.utils.aoa_to_sheet([['주소록'], CONTACT_HEAD, contactRow(MEDICAL)])
    expect(await readContactsFile(book([['장비', [EQUIPMENT_HEAD]]], (wb) => XLSX.utils.book_append_sheet(wb, titled, '연락처')))).toBe('form')
  })

  it("AC-6504.2: 두 시트 모두 적힌 줄이 없으면 'empty', 한쪽에만 있으면 읽는다", async () => {
    expect(await readContactsFile(book([['연락처', [CONTACT_HEAD, [], []]], ['장비', [EQUIPMENT_HEAD]]]))).toBe('empty')
    const onlyEquipment = await readContactsFile(book([['연락처', [CONTACT_HEAD]], ['장비', [EQUIPMENT_HEAD, equipmentRow(DEVICE)]]]))
    expect(onlyEquipment).toEqual({ contacts: [], equipment: [{ row: 2, cells: equipmentCells(DEVICE) }] })
  })
})
