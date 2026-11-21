// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StaffErrorCode, StaffFile } from '@/types/staff'
import { StaffStoreError } from './staff'
import { createStaffFileStore, staffFileMime, type StaffFileClient } from './staffFiles'

// 직원 서류·세무사 파일(spec staff AC-7610.3, design.md 5절, 바구니 staff-files는 design.md 1절). 실제 Supabase에 붙지 않는다.
// 파일 이름·id는 모두 지어낸 것이다

const H = '11111111-1111-4111-8111-111111111111'
const M1 = '00000000-0000-4000-8000-0000000000a1'
const F1 = '00000000-0000-4000-8000-0000000000f1'
const U1 = '00000000-0000-4000-8000-000000000101'
const SECRET = 'secret detail'
const ASC = { ascending: true }
const FILE_COLUMNS = 'id,kind,staff_id,month,name,path,size,mime,created_at'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DOC_PATH = new RegExp(`^${H}/doc/${M1}/[0-9a-f-]{36}\\.pdf$`)
const TAX_PATH = new RegExp(`^${H}/tax/2026-11/[0-9a-f-]{36}\\.xlsx$`)

const DOC_ROW = {
  id: F1,
  kind: 'doc',
  staff_id: M1,
  month: null,
  name: '근로계약서.pdf',
  path: `${H}/doc/${M1}/${U1}.pdf`,
  size: 12345,
  mime: 'application/pdf',
  created_at: '2026-11-21T01:02:03+00:00',
}
const DOC: StaffFile = {
  id: F1,
  kind: 'doc',
  staffId: M1,
  month: null,
  name: '근로계약서.pdf',
  path: `${H}/doc/${M1}/${U1}.pdf`,
  size: 12345,
  mime: 'application/pdf',
  createdAt: '2026-11-21T01:02:03+00:00',
}
const TAX_ROW = { ...DOC_ROW, kind: 'tax', staff_id: null, month: '2026-11', name: '원천세.xlsx', path: `${H}/tax/2026-11/${U1}.xlsx`, mime: XLSX }

type Reply = { data: unknown; error: unknown; status?: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })
const failure = (): Reply => ({ data: null, error: { message: SECRET, details: SECRET, code: SECRET }, status: 400 })

type Call = [string, ...unknown[]]
const CHAIN = ['select', 'eq', 'neq', 'gte', 'lte', 'in', 'order', 'range', 'insert', 'update', 'delete', 'maybeSingle', 'single']

// 받은 부름을 차례로 적는 가짜 클라이언트(표·함수·바구니). 기다릴 때마다(바구니는 부를 때마다) 정해 둔 답을 차례로 하나씩 준다
function fakeClient(...replies: Reply[]) {
  const calls: Call[] = []
  const queue = replies.length > 0 ? [...replies] : [OK]
  const next = () => (queue.length > 1 ? queue.shift() : queue[0]) as Reply
  const builder = () => {
    const query: Record<string, unknown> = {}
    for (const name of CHAIN) {
      query[name] = (...args: unknown[]) => {
        calls.push([name, ...args])
        return query
      }
    }
    query.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(next()).then(resolve, reject)
    return query
  }
  const bucket = Object.fromEntries(
    ['upload', 'remove', 'download'].map((name) => [
      name,
      (...args: unknown[]) => {
        calls.push([name, ...args])
        return Promise.resolve(next())
      },
    ]),
  )
  const client = {
    from(table: string) {
      calls.push(['from', table])
      return builder()
    },
    rpc(name: string, ...args: unknown[]) {
      calls.push(['rpc', name, ...args])
      return builder()
    },
    storage: {
      from(name: string) {
        calls.push(['bucket', name])
        return bucket
      },
    },
  } as unknown as StaffFileClient
  return { client, calls }
}

async function caught(run: () => Promise<unknown>, code: StaffErrorCode = 'E-STAFF-FILE-FAILED'): Promise<void> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(StaffStoreError)
  expect((thrown as StaffStoreError).code).toBe(code)
  expect(String(thrown)).not.toContain(SECRET)
  expect(JSON.stringify(thrown)).not.toContain(SECRET)
}

const fileOf = (name: string, size = 12345, type = '') => new File([new Uint8Array(size)], name, { type })
const named = (calls: Call[], name: string) => calls.filter((call) => call[0] === name)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AC-7610.3 파일 종류', () => {
  it('AC-7610.3: 종류는 확장자로 정한다 — 서류는 PDF·JPG·PNG, 세무사 파일은 PDF·ZIP·XLSX·XLS·JPG·PNG', () => {
    expect(staffFileMime('doc', '계약서.PDF')).toBe('application/pdf')
    expect(staffFileMime('doc', '사진.jpeg')).toBe('image/jpeg')
    expect(staffFileMime('doc', '사진.JPG')).toBe('image/jpeg')
    expect(staffFileMime('doc', '면허.png')).toBe('image/png')
    expect(staffFileMime('doc', '명단.xlsx')).toBeNull()
    expect(staffFileMime('doc', '묶음.zip')).toBeNull()
    expect(staffFileMime('tax', '원천세.xlsx')).toBe(XLSX)
    expect(staffFileMime('tax', '옛날.xls')).toBe('application/vnd.ms-excel')
    expect(staffFileMime('tax', '묶음.zip')).toBe('application/zip')
    expect(staffFileMime('tax', '메모.txt')).toBeNull()
    expect(staffFileMime('tax', '확장자없음')).toBeNull()
  })
})

describe('AC-7610.3 파일 목록 listFiles', () => {
  it('AC-7610.3: 그 종류 줄을 올린 차례로 1,000줄씩 읽고 틀린 줄(경로·종류·크기)은 버린다', async () => {
    const bad = [
      { ...DOC_ROW, id: 'x1', path: `${H}/doc/${M1}/../secret.pdf` },
      { ...DOC_ROW, id: 'x2', mime: XLSX },
      { ...DOC_ROW, id: 'x3', size: 0 },
      { ...DOC_ROW, id: 'x4', staff_id: null },
      { ...DOC_ROW, id: 'x5', name: '' },
    ]
    const { client, calls } = fakeClient(okWith([DOC_ROW, ...bad]))
    await expect(createStaffFileStore(client).listFiles('doc')).resolves.toEqual([DOC])
    expect(calls).toEqual([
      ['from', 'staff_files'],
      ['select', FILE_COLUMNS],
      ['eq', 'kind', 'doc'],
      ['order', 'created_at', ASC],
      ['order', 'id', ASC],
      ['range', 0, 999],
    ])
    const tax = fakeClient(okWith([TAX_ROW]))
    await expect(createStaffFileStore(tax.client).listFiles('tax')).resolves.toEqual([
      { ...DOC, kind: 'tax', staffId: null, month: '2026-11', name: '원천세.xlsx', path: TAX_ROW.path, mime: XLSX },
    ])
    await caught(() => createStaffFileStore(fakeClient(failure()).client).listFiles('doc'), 'E-STAFF-READ-FAILED')
  })
})

describe('AC-7610.3 파일 올리기 uploadFile', () => {
  it('AC-7610.3: staff_files 줄을 먼저 넣고 → 바구니 {병원}/doc/{직원}/{uuid}.{확장자}에 덮어쓰기 없이 올린다(종류는 확장자로)', async () => {
    const { client, calls } = fakeClient(okWith(H), okWith(DOC_ROW), okWith({ path: DOC_ROW.path }))
    const file = fileOf('근로계약서.pdf', 12345, 'application/x-unknown')
    await expect(createStaffFileStore(client).uploadFile({ kind: 'doc', staffId: M1, file })).resolves.toEqual(DOC)
    expect(calls.map((call) => call[0])).toEqual(['rpc', 'from', 'insert', 'select', 'single', 'bucket', 'upload'])
    expect(calls[0]).toEqual(['rpc', 'my_hospital_id'])
    const [, row] = named(calls, 'insert')[0] as [string, Record<string, unknown>]
    expect(Object.keys(row)).toEqual(['kind', 'staff_id', 'month', 'name', 'path', 'size', 'mime'])
    expect(row).toMatchObject({ kind: 'doc', staff_id: M1, month: null, name: '근로계약서.pdf', size: 12345, mime: 'application/pdf' })
    expect(row.path).toMatch(DOC_PATH)
    expect(named(calls, 'select')[0]).toEqual(['select', FILE_COLUMNS])
    expect(named(calls, 'bucket')[0]).toEqual(['bucket', 'staff-files'])
    const [, path, body, options] = named(calls, 'upload')[0] as [string, string, Blob, unknown]
    expect(path).toBe(row.path)
    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe('application/pdf')
    expect(body.size).toBe(12345)
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false })
  })

  it('AC-7610.3: 세무사 파일은 {병원}/tax/{YYYY-MM}/{uuid}.{확장자}, 직원 없이 달과 함께 넣는다', async () => {
    const { client, calls } = fakeClient(okWith(H), okWith(TAX_ROW), OK)
    await createStaffFileStore(client).uploadFile({ kind: 'tax', month: '2026-11', file: fileOf('원천세.XLSX') })
    const [, row] = named(calls, 'insert')[0] as [string, Record<string, unknown>]
    expect(row).toMatchObject({ kind: 'tax', staff_id: null, month: '2026-11', name: '원천세.XLSX', mime: XLSX })
    expect(row.path).toMatch(TAX_PATH)
  })

  it('AC-7610.3: 바구니 올리기가 실패하면 넣은 줄을 지우고 E-STAFF-FILE-FAILED', async () => {
    const { client, calls } = fakeClient(okWith(H), okWith(DOC_ROW), failure(), OK)
    await caught(() => createStaffFileStore(client).uploadFile({ kind: 'doc', staffId: M1, file: fileOf('근로계약서.pdf') }))
    expect(calls.slice(-3)).toEqual([['from', 'staff_files'], ['delete'], ['eq', 'id', F1]])
  })

  it('AC-7610.3: 줄 넣기가 실패하면(20개 한도 등) 올리지 않는다', async () => {
    const { client, calls } = fakeClient(okWith(H), failure())
    await caught(() => createStaffFileStore(client).uploadFile({ kind: 'doc', staffId: M1, file: fileOf('근로계약서.pdf') }))
    expect(named(calls, 'upload')).toEqual([])
  })

  it('AC-7610.3: 받을 수 없는 파일(종류·0바이트·10MB 넘음·달 모양·직원 없음)은 아무것도 보내지 않는다', async () => {
    const { client, calls } = fakeClient()
    const store = createStaffFileStore(client)
    await caught(() => store.uploadFile({ kind: 'doc', staffId: M1, file: fileOf('명단.xlsx') }))
    await caught(() => store.uploadFile({ kind: 'doc', staffId: M1, file: fileOf('빈.pdf', 0) }))
    await caught(() => store.uploadFile({ kind: 'tax', month: '2026-11', file: fileOf('큰.zip', 10_000_001) }))
    await caught(() => store.uploadFile({ kind: 'tax', month: '2026-13', file: fileOf('원천세.pdf') }))
    await caught(() => store.uploadFile({ kind: 'doc', staffId: '', file: fileOf('계약서.pdf') }))
    expect(calls).toEqual([])
  })

  it('AC-7610.3: 내 병원 id를 모르면(승인 전) 보내지 않는다. 이름이 100자를 넘으면 확장자를 남기고 줄인다', async () => {
    const none = fakeClient(okWith(null))
    await caught(() => createStaffFileStore(none.client).uploadFile({ kind: 'doc', staffId: M1, file: fileOf('계약서.pdf') }))
    expect(named(none.calls, 'insert')).toEqual([])
    const long = fakeClient(okWith(H), okWith(DOC_ROW), OK)
    await createStaffFileStore(long.client).uploadFile({ kind: 'doc', staffId: M1, file: fileOf(`${'가'.repeat(120)}.pdf`) })
    const [, row] = named(long.calls, 'insert')[0] as [string, Record<string, unknown>]
    expect([...(row.name as string)]).toHaveLength(100)
    expect(row.name).toBe(`${'가'.repeat(96)}.pdf`)
  })
})

describe('AC-7610.3 파일 지우기·받기', () => {
  it('AC-7610.3: 지우기는 바구니 → 줄 차례다', async () => {
    const { client, calls } = fakeClient(okWith([{ name: DOC.path }]), OK)
    await createStaffFileStore(client).deleteFile(DOC)
    expect(calls).toEqual([['bucket', 'staff-files'], ['remove', [DOC.path]], ['from', 'staff_files'], ['delete'], ['eq', 'id', F1]])
  })

  it('AC-7610.3: 바구니 지우기가 실패하면 줄은 그대로 두고 E-STAFF-FILE-FAILED', async () => {
    const { client, calls } = fakeClient(failure())
    await caught(() => createStaffFileStore(client).deleteFile(DOC))
    expect(named(calls, 'delete')).toEqual([])
  })

  it('AC-7610.3: 받기는 바구니에서 내려받아 원래 이름으로 저장하게 하고 임시 주소를 바로 거둔다', async () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const seen: { download: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.href })
    })
    const blob = new Blob(['%PDF'], { type: 'application/pdf' })
    const { client, calls } = fakeClient(okWith(blob))
    await createStaffFileStore(client).downloadFile(DOC)
    expect(calls).toEqual([['bucket', 'staff-files'], ['download', DOC.path]])
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(seen).toEqual([{ download: '근로계약서.pdf', href: 'blob:fake-url' }])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
    expect(document.querySelectorAll('a')).toHaveLength(0)
  })

  it('AC-7610.3: 받기 실패는 E-STAFF-FILE-FAILED', async () => {
    await caught(() => createStaffFileStore(fakeClient(failure()).client).downloadFile(DOC))
    await caught(() => createStaffFileStore(fakeClient(okWith('not a blob')).client).downloadFile(DOC))
  })
})
