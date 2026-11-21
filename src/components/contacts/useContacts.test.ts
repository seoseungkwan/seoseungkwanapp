// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCompany,
  addEquipment,
  addPerson,
  addRepair,
  ContactsStorageError,
  deleteCompany,
  deleteEquipment,
  deletePerson,
  deleteRepair,
  importContacts,
  loadContacts,
  updateCompany,
  updateEquipment,
  updatePerson,
  updateRepair,
} from '@/lib/storage/contacts'
import type { Company, CompanyFields, ContactBook, Equipment, ImportPayload, Person, Repair } from '@/types/contacts'
import { BOOK, FACILITY, MEDICAL, PEOPLE, PHARM, REPAIRS, SHOCK } from './parts/book.test.data'
import { useContacts } from './useContacts'

// 주소록 자료 잇기(spec contacts design.md '화면' useContacts, AC-6505.4·AC-6505.5·AC-6505.7·AC-6505.9·AC-6506.4).
// 저장 함수·supabaseBrowser는 흉내 낸다(실제 Supabase에 붙지 않는다). 업체·사람·번호는 모두 지어낸 것이다(parts/book.test.data.ts)

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn(() => CLIENT) }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/contacts')>()),
  loadContacts: vi.fn(),
  addCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  addEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
  addRepair: vi.fn(),
  updateRepair: vi.fn(),
  deleteRepair: vi.fn(),
  importContacts: vi.fn(),
}))

/** 손으로 풀 수 있는 답 */
function later<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const FIELDS: CompanyFields = {
  category: 'repair',
  name: '예시방역',
  phone: '02-000-0031',
  work: '방역·소독',
  address: '',
  homepage: '',
  bizNo: '',
  account: '',
  siteId: '',
  sitePw: '',
  memo: '',
}
const NEW_COMPANY: Company = { ...FIELDS, id: 'c-new' }
const OFFLINE = new ContactsStorageError('offline')

beforeEach(() => {
  vi.mocked(loadContacts).mockResolvedValue(BOOK)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** 처음 읽기가 끝난 훅 */
async function ready() {
  const view = renderHook(() => useContacts())
  await waitFor(() => expect(view.result.current.load.status).toBe('ready'))
  return view
}
const bookOf = (view: Awaited<ReturnType<typeof ready>>): ContactBook => {
  const { load } = view.result.current
  if (load.status !== 'ready') throw new Error(`읽은 주소록이 없다: ${load.status}`)
  return load.book
}

describe('AC-6505.9: 처음 읽기·다시 읽기', () => {
  it('AC-6505.9: 처음에는 읽는 중이고 supabaseBrowser() 한 개로 loadContacts를 한 번 불러 그 주소록을 쥔다', async () => {
    const view = renderHook(() => useContacts())
    expect(view.result.current.load).toEqual({ status: 'loading' })
    await waitFor(() => expect(view.result.current.load).toEqual({ status: 'ready', book: BOOK }))
    expect(loadContacts).toHaveBeenCalledExactlyOnceWith(CLIENT)
    view.rerender()
    expect(supabaseBrowser).toHaveBeenCalledTimes(1)
    expect(loadContacts).toHaveBeenCalledTimes(1)
  })

  it('AC-6505.9: 읽기가 실패하면 failed, reload()면 읽는 중으로 돌아가 다시 읽는다', async () => {
    vi.mocked(loadContacts).mockRejectedValueOnce(OFFLINE)
    const view = renderHook(() => useContacts())
    await waitFor(() => expect(view.result.current.load).toEqual({ status: 'failed' }))
    const second = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValueOnce(second.promise)
    act(() => view.result.current.reload())
    expect(view.result.current.load).toEqual({ status: 'loading' })
    await act(async () => second.resolve(BOOK))
    expect(view.result.current.load).toEqual({ status: 'ready', book: BOOK })
    expect(loadContacts).toHaveBeenCalledTimes(2)
  })

  it('AC-6505.9: 늦게 온 앞 읽기 답은 버린다(나중에 시작한 읽기가 이긴다)', async () => {
    const first = later<ContactBook>()
    const second = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = renderHook(() => useContacts())
    act(() => view.result.current.reload())
    const fresh: ContactBook = { ...BOOK, companies: [MEDICAL] }
    await act(async () => second.resolve(fresh))
    expect(view.result.current.load).toEqual({ status: 'ready', book: fresh })
    await act(async () => first.resolve(BOOK))
    expect(view.result.current.load).toEqual({ status: 'ready', book: fresh })
    // 늦은 실패도 버린다
    const third = later<ContactBook>()
    const fourth = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValueOnce(third.promise).mockReturnValueOnce(fourth.promise)
    act(() => view.result.current.reload())
    act(() => view.result.current.reload())
    await act(async () => fourth.resolve(BOOK))
    await act(async () => third.reject(OFFLINE))
    expect(view.result.current.load).toEqual({ status: 'ready', book: BOOK })
  })

  it('AC-6505.9: 화면을 떠난 뒤 온 답은 쓰지 않는다(오류 없이 지나간다)', async () => {
    const first = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValueOnce(first.promise)
    const view = renderHook(() => useContacts())
    view.unmount()
    await act(async () => first.resolve(BOOK))
    expect(view.result.current.load).toEqual({ status: 'loading' })
  })
})

describe('AC-6505.4: 업체 저장', () => {
  it('AC-6505.4: id가 없으면 addCompany(client, 칸) → 답 업체를 주소록 끝에 더하고 { ok, id }', async () => {
    vi.mocked(addCompany).mockResolvedValue(NEW_COMPANY)
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.saveCompany(null, FIELDS)
    })
    expect(addCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, FIELDS)
    expect(result).toEqual({ ok: true, id: 'c-new' })
    expect(bookOf(view).companies).toEqual([...BOOK.companies, NEW_COMPANY])
    expect(bookOf(view).people).toBe(BOOK.people)
  })

  it('AC-6505.4: id가 있으면 updateCompany(client, id, 칸) → 그 업체를 답으로 바꾼다(차례 그대로)', async () => {
    const changed: Company = { ...PHARM, phone: '02-111-1111' }
    vi.mocked(updateCompany).mockResolvedValue(changed)
    const view = await ready()
    const fields: CompanyFields = { ...PHARM, phone: '02-111-1111' }
    let result: unknown
    await act(async () => {
      result = await view.result.current.saveCompany(PHARM.id, fields)
    })
    expect(updateCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, PHARM.id, fields)
    expect(result).toEqual({ ok: true, id: PHARM.id })
    expect(bookOf(view).companies).toEqual(BOOK.companies.map((c) => (c.id === PHARM.id ? changed : c)))
  })

  it.each([
    ['duplicate', { ok: false, reason: 'duplicate' }],
    ['invalid', { ok: false, reason: 'failed' }],
  ] as const)('AC-6505.4: 저장 함수가 %s면 주소록은 그대로이고 답은 %o다', async (answer, expected) => {
    vi.mocked(addCompany).mockResolvedValue(answer)
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.saveCompany(null, FIELDS)
    })
    expect(result).toEqual(expected)
    expect(bookOf(view)).toEqual(BOOK)
  })

  it('AC-6505.4: 저장 함수가 던지면(연결 끊김·실패) { ok: false, failed }이고 주소록은 그대로다', async () => {
    vi.mocked(updateCompany).mockRejectedValue(new ContactsStorageError('failed'))
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.saveCompany(MEDICAL.id, MEDICAL)
    })
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(bookOf(view)).toEqual(BOOK)
  })
})

describe('AC-6505.5: 담당자·장비·수리 기록 저장', () => {
  it('AC-6505.5: 담당자 더하기·고치기 → addPerson(client, 업체 id, 칸)·updatePerson(client, id, 칸), 답으로 주소록을 바꾼다. 겹침은 duplicate', async () => {
    const added: Person = { id: 'p9', companyId: FACILITY.id, name: '정예시', mobile: '010-0000-0099', role: '기사' }
    const changed: Person = { ...PEOPLE[0]!, role: '부장' }
    vi.mocked(addPerson).mockResolvedValueOnce(added).mockResolvedValueOnce('duplicate')
    vi.mocked(updatePerson).mockResolvedValue(changed)
    const view = await ready()
    const results: unknown[] = []
    await act(async () => {
      results.push(await view.result.current.savePerson(FACILITY.id, null, { name: '정예시', mobile: '010-0000-0099', role: '기사' }))
      results.push(await view.result.current.savePerson(MEDICAL.id, 'p1', { name: '김예시', mobile: '010-0000-0001', role: '부장' }))
      results.push(await view.result.current.savePerson(MEDICAL.id, null, { name: '박예시', mobile: '', role: '' }))
    })
    expect(addPerson).toHaveBeenNthCalledWith(1, CLIENT, FACILITY.id, { name: '정예시', mobile: '010-0000-0099', role: '기사' })
    expect(updatePerson).toHaveBeenCalledExactlyOnceWith(CLIENT, 'p1', { name: '김예시', mobile: '010-0000-0001', role: '부장' })
    expect(results).toEqual([{ ok: true, id: 'p9' }, { ok: true, id: 'p1' }, { ok: false, reason: 'duplicate' }])
    expect(bookOf(view).people).toEqual([changed, ...PEOPLE.slice(1), added])
  })

  it('AC-6505.5: 장비 더하기·고치기 → addEquipment·updateEquipment(빈 날짜는 null 그대로), invalid는 failed', async () => {
    const fields = { name: '온열 치료기', serial: '', boughtOn: null, warrantyUntil: '2026-12-01' }
    const added: Equipment = { id: 'e9', companyId: MEDICAL.id, ...fields }
    const changed: Equipment = { ...SHOCK, serial: 'ESW-0000-02' }
    vi.mocked(addEquipment).mockResolvedValueOnce(added).mockResolvedValueOnce('invalid')
    vi.mocked(updateEquipment).mockResolvedValue(changed)
    const view = await ready()
    const results: unknown[] = []
    await act(async () => {
      results.push(await view.result.current.saveEquipment(MEDICAL.id, null, fields))
      results.push(await view.result.current.saveEquipment(MEDICAL.id, SHOCK.id, { ...SHOCK, serial: 'ESW-0000-02' }))
      results.push(await view.result.current.saveEquipment(MEDICAL.id, null, fields))
    })
    expect(addEquipment).toHaveBeenNthCalledWith(1, CLIENT, MEDICAL.id, fields)
    expect(vi.mocked(addEquipment).mock.calls[0]![2].boughtOn).toBeNull()
    expect(updateEquipment).toHaveBeenCalledExactlyOnceWith(CLIENT, SHOCK.id, { ...SHOCK, serial: 'ESW-0000-02' })
    expect(results).toEqual([{ ok: true, id: 'e9' }, { ok: true, id: SHOCK.id }, { ok: false, reason: 'failed' }])
    expect(bookOf(view).equipment).toEqual([changed, ...BOOK.equipment.slice(1), added])
  })

  it('AC-6505.5: 수리 기록 더하기·고치기 → addRepair(client, 장비 id, 칸)·updateRepair(client, id, 칸)', async () => {
    const added: Repair = { id: 'r9', equipmentId: SHOCK.id, day: '2026-11-21', content: '헤드 점검', cost: 30000 }
    const changed: Repair = { ...REPAIRS[1]!, cost: 10000 }
    vi.mocked(addRepair).mockResolvedValue(added)
    vi.mocked(updateRepair).mockResolvedValue(changed)
    const view = await ready()
    await act(async () => {
      await view.result.current.saveRepair(SHOCK.id, null, { day: '2026-11-21', content: '헤드 점검', cost: 30000 })
      await view.result.current.saveRepair(SHOCK.id, 'r2', { day: '2026-10-02', content: '헤드 교체 (무상)', cost: 10000 })
    })
    expect(addRepair).toHaveBeenCalledExactlyOnceWith(CLIENT, SHOCK.id, { day: '2026-11-21', content: '헤드 점검', cost: 30000 })
    expect(updateRepair).toHaveBeenCalledExactlyOnceWith(CLIENT, 'r2', { day: '2026-10-02', content: '헤드 교체 (무상)', cost: 10000 })
    expect(bookOf(view).repairs).toEqual([REPAIRS[0], changed, ...REPAIRS.slice(2), added])
  })

  it('AC-6505.5: 같은 id 줄이 이미 있으면 더하지 않고 바꾼다(다시 읽기와 겹쳐도 두 줄이 되지 않는다)', async () => {
    vi.mocked(addPerson).mockResolvedValue(PEOPLE[0]!)
    const view = await ready()
    await act(async () => {
      await view.result.current.savePerson(MEDICAL.id, null, { name: '김예시', mobile: '', role: '' })
    })
    expect(bookOf(view).people).toEqual(PEOPLE)
  })
})

describe('AC-6505.7: 지우기 — 손에 든 주소록에서 딸린 줄도 뺀다', () => {
  it('AC-6505.7: 업체를 지우면 deleteCompany(client, id) 뒤 그 업체·담당자·장비·그 장비 수리 기록이 빠지고 다른 업체 줄은 그대로다', async () => {
    vi.mocked(deleteCompany).mockResolvedValue(undefined)
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.deleteCompany(MEDICAL.id)
    })
    expect(deleteCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, MEDICAL.id)
    expect(result).toEqual({ ok: true })
    const book = bookOf(view)
    expect(book.companies).toEqual(BOOK.companies.filter((c) => c.id !== MEDICAL.id))
    expect(book.people).toEqual(PEOPLE.filter((p) => p.companyId !== MEDICAL.id))
    expect(book.equipment.map((e) => e.id)).toEqual(['e3', 'e4'])
    expect(book.repairs).toEqual([]) // 수리 기록은 모두 예시메디칼 장비(e1·e2) 것이었다
  })

  it('AC-6505.7: 장비를 지우면 그 장비와 그 수리 기록만 빠진다', async () => {
    vi.mocked(deleteEquipment).mockResolvedValue(undefined)
    const view = await ready()
    await act(async () => {
      await view.result.current.deleteEquipment(SHOCK.id)
    })
    expect(deleteEquipment).toHaveBeenCalledExactlyOnceWith(CLIENT, SHOCK.id)
    expect(bookOf(view).equipment.map((e) => e.id)).toEqual(['e2', 'e3', 'e4'])
    expect(bookOf(view).repairs.map((r) => r.id)).toEqual(['r3'])
    expect(bookOf(view).companies).toBe(BOOK.companies)
  })

  it('AC-6505.7: 담당자·수리 기록을 지우면 그 줄만 빠진다', async () => {
    vi.mocked(deletePerson).mockResolvedValue(undefined)
    vi.mocked(deleteRepair).mockResolvedValue(undefined)
    const view = await ready()
    await act(async () => {
      await view.result.current.deletePerson('p2')
      await view.result.current.deleteRepair('r1')
    })
    expect(deletePerson).toHaveBeenCalledExactlyOnceWith(CLIENT, 'p2')
    expect(deleteRepair).toHaveBeenCalledExactlyOnceWith(CLIENT, 'r1')
    expect(bookOf(view).people.map((p) => p.id)).toEqual(['p1', 'p3', 'p4', 'p5'])
    expect(bookOf(view).repairs.map((r) => r.id)).toEqual(['r2', 'r3', 'r4'])
  })

  it('AC-6505.7: 지우기가 실패하면 { ok: false, failed }이고 주소록은 그대로다', async () => {
    vi.mocked(deleteCompany).mockRejectedValue(OFFLINE)
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.deleteCompany(MEDICAL.id)
    })
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(bookOf(view)).toEqual(BOOK)
  })
})

describe('AC-6506.4: 엑셀 넣기', () => {
  const PAYLOAD: ImportPayload = { companies: [{ name: '예시방역', category: 'repair' }], people: [], equipment: [] }

  it('AC-6506.4: importContacts(client, 몸통)를 한 번 부르고 몸통을 바꾸지 않으며, 되면 주소록을 다시 읽어 바꾼 뒤 ok', async () => {
    const after: ContactBook = { ...BOOK, companies: [...BOOK.companies, NEW_COMPANY] }
    vi.mocked(importContacts).mockResolvedValue(undefined)
    const view = await ready()
    vi.mocked(loadContacts).mockResolvedValueOnce(after)
    const sent = structuredClone(PAYLOAD)
    let result: unknown
    await act(async () => {
      result = await view.result.current.importBook(sent)
    })
    expect(importContacts).toHaveBeenCalledExactlyOnceWith(CLIENT, sent)
    expect(sent).toEqual(PAYLOAD)
    expect(result).toBe('ok')
    expect(loadContacts).toHaveBeenCalledTimes(2)
    expect(view.result.current.load).toEqual({ status: 'ready', book: after })
  })

  it('AC-6506.4: 다시 읽는 동안에도 앞 주소록을 그대로 쥔다(읽는 중으로 돌아가지 않는다)', async () => {
    vi.mocked(importContacts).mockResolvedValue(undefined)
    const view = await ready()
    const reread = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValueOnce(reread.promise)
    let done: Promise<unknown> = Promise.resolve()
    await act(async () => {
      done = view.result.current.importBook(PAYLOAD)
    })
    expect(view.result.current.load).toEqual({ status: 'ready', book: BOOK })
    await act(async () => {
      reread.resolve(BOOK)
      await done
    })
  })

  it('AC-6506.4: 넣기가 실패하면 failed이고 다시 읽지 않으며 주소록은 그대로다', async () => {
    vi.mocked(importContacts).mockRejectedValue(new ContactsStorageError('failed'))
    const view = await ready()
    let result: unknown
    await act(async () => {
      result = await view.result.current.importBook(PAYLOAD)
    })
    expect(result).toBe('failed')
    expect(loadContacts).toHaveBeenCalledTimes(1)
    expect(view.result.current.load).toEqual({ status: 'ready', book: BOOK })
  })

  it('AC-6506.4: 넣기는 됐는데 다시 읽기가 실패하면 ok이고 읽기 실패(failed)로 바뀐다', async () => {
    vi.mocked(importContacts).mockResolvedValue(undefined)
    const view = await ready()
    vi.mocked(loadContacts).mockRejectedValueOnce(OFFLINE)
    let result: unknown
    await act(async () => {
      result = await view.result.current.importBook(PAYLOAD)
    })
    expect(result).toBe('ok')
    expect(view.result.current.load).toEqual({ status: 'failed' })
  })
})
