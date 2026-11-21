import * as XLSX from 'xlsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_HEADERS, EQUIPMENT_HEADERS } from '@/lib/contacts/sheet'
import { readContactsFile } from '@/lib/contacts/workbook'
import { readUpload } from './readUpload'

// 고른 파일 읽기(specs/contacts AC-6504.2·AC-6506.2, design.md '화면' import/readUpload.ts).
// 이름 끝이 .xlsx가 아니면(대소문자 무시) 읽기 전에 'not-xlsx'. 파일 내용·이름은 어디로도 보내지 않는다. 업체는 지어낸 것이다

function xlsxBytes(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...CONTACT_HEADERS], ...rows]), '연락처')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...EQUIPMENT_HEADERS]]), '장비')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
const fileOf = (bytes: Uint8Array, name: string) => new File([bytes.slice()], name)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-6504.2·AC-6506.2 readUpload', () => {
  it('AC-6504.2: 이름 끝이 .xlsx(대소문자 무시)인 파일은 readContactsFile과 같은 결과다', async () => {
    const bytes = xlsxBytes([['거래처', '예시메디칼']])
    const expected = await readContactsFile(bytes)
    expect(expected).not.toBeTypeOf('string')
    expect(await readUpload(fileOf(bytes, '주소록-양식.xlsx'))).toEqual(expected)
    expect(await readUpload(fileOf(bytes, 'CONTACTS.XLSX'))).toEqual(expected)
    expect(await readUpload(fileOf(xlsxBytes([]), '빈 양식.Xlsx'))).toBe('empty')
  })

  it("AC-6504.2: 이름 끝이 .xlsx가 아니면 파일을 읽기 전에 'not-xlsx'(.xls·.csv·이름 바꾼 파일)", async () => {
    const bytes = xlsxBytes([['거래처', '예시메디칼']])
    for (const name of ['주소록.xls', '주소록.csv', '주소록.xlsx.txt', '주소록xlsx', '주소록.xlsm', '주소록']) {
      const file = fileOf(bytes, name)
      const read = vi.spyOn(file, 'arrayBuffer')
      expect(await readUpload(file), name).toBe('not-xlsx')
      expect(read, name).not.toHaveBeenCalled()
    }
  })

  it("AC-6504.2: 5,000,000바이트를 넘는 파일은 읽기 전에 'big'", async () => {
    const file = fileOf(new Uint8Array(5_000_001), '큰 주소록.xlsx')
    const read = vi.spyOn(file, 'arrayBuffer')
    expect(await readUpload(file)).toBe('big')
    expect(read).not.toHaveBeenCalled()
  })

  it("AC-6504.2: 파일을 못 읽으면(읽다가 실패) 'not-xlsx'", async () => {
    const file = fileOf(xlsxBytes([]), '주소록.xlsx')
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('읽기 실패'))
    expect(await readUpload(file)).toBe('not-xlsx')
  })

  it('AC-6506.2: 읽는 동안 네트워크 요청이 없다(fetch를 부르지 않음)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await readUpload(fileOf(xlsxBytes([['거래처', '예시메디칼']]), '주소록.xlsx'))
    await readUpload(fileOf(new Uint8Array([1, 2, 3]), '주소록.xlsx'))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
