import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Company,
  CompanyFields,
  ContactBook,
  Equipment,
  EquipmentFields,
  ImportPayload,
  Person,
  PersonFields,
  Repair,
  RepairFields,
  WarrantyItem,
} from '@/types/contacts'
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
  listWarrantySoon,
  loadContacts,
  updateCompany,
  updateEquipment,
  updatePerson,
  updateRepair,
} from './contacts'

// 주소록 서버 저장 함수 (spec contacts REQ-6502, design.md '저장 함수'). 실제 Supabase에 붙지 않는다.
// 업체·담당자·장비 이름, 번호, 계좌, 사이트 아이디·비밀번호, id는 모두 지어낸 것이다

const CO1 = '00000000-0000-4000-8000-000000000101'
const CO2 = '00000000-0000-4000-8000-000000000102'
const CO3 = '00000000-0000-4000-8000-000000000103'
const P1 = '00000000-0000-4000-8000-000000000201'
const E1 = '00000000-0000-4000-8000-000000000301'
const E2 = '00000000-0000-4000-8000-000000000302'
const E3 = '00000000-0000-4000-8000-000000000303'
const E4 = '00000000-0000-4000-8000-000000000304'
const R1 = '00000000-0000-4000-8000-000000000401'
const TODAY = '2026-11-21'
const LAST = '2026-12-21' // 오늘 + 30일
const SECRET = 'secret detail' // Supabase 오류 원문
const SITE_PW = 'fake-pw-7731' // 입력값: 오류에 들면 안 된다
const ACCOUNT = '가짜은행 000-0000-7731'

// 읽는 칸·보내는 칸(design.md 'DB'·'저장 함수')
const COMPANY_COLUMNS = 'id,category,name,phone,work,address,homepage,biz_no,account,site_id,site_pw,memo'
const PERSON_COLUMNS = 'id,company_id,name,mobile,role'
const EQUIPMENT_COLUMNS = 'id,company_id,name,serial,bought_on,warranty_until'
const REPAIR_COLUMNS = 'id,equipment_id,day,content,cost'
const WARRANTY_COLUMNS = 'id,company_id,name,warranty_until'
const WARRANTY_COMPANY_COLUMNS = 'id,name'
const COMPANY_KEYS = ['category', 'name', 'phone', 'work', 'address', 'homepage', 'biz_no', 'account', 'site_id', 'site_pw', 'memo']
const PERSON_INSERT_KEYS = ['company_id', 'name', 'mobile', 'role']
const PERSON_UPDATE_KEYS = ['name', 'mobile', 'role']
const EQUIPMENT_INSERT_KEYS = ['company_id', 'name', 'serial', 'bought_on', 'warranty_until']
const EQUIPMENT_UPDATE_KEYS = ['name', 'serial', 'bought_on', 'warranty_until']
const REPAIR_INSERT_KEYS = ['equipment_id', 'day', 'content', 'cost']
const REPAIR_UPDATE_KEYS = ['day', 'content', 'cost']
const DB_ONLY = ['id', 'hospital_id', 'created_at'] // DB가 정하는 칸: 보내지도 읽지도 않는다
const ASC = { ascending: true }

const COMPANY_ROW = {
  id: CO1,
  category: 'supplier',
  name: '예시메디칼',
  phone: '02-000-0000',
  work: '물리치료 기계, 충격파 헤드',
  address: '서울 어딘가 1',
  homepage: 'example.com',
  biz_no: '000-00-00000',
  account: ACCOUNT,
  site_id: 'yesi',
  site_pw: SITE_PW,
  memo: '매달 말에 주문',
}
const COMPANY_FIELDS: CompanyFields = {
  category: 'supplier',
  name: '예시메디칼',
  phone: '02-000-0000',
  work: '물리치료 기계, 충격파 헤드',
  address: '서울 어딘가 1',
  homepage: 'example.com',
  bizNo: '000-00-00000',
  account: ACCOUNT,
  siteId: 'yesi',
  sitePw: SITE_PW,
  memo: '매달 말에 주문',
}
const COMPANY: Company = { ...COMPANY_FIELDS, id: CO1 }
const COMPANY_BODY = {
  category: 'supplier',
  name: '예시메디칼',
  phone: '02-000-0000',
  work: '물리치료 기계, 충격파 헤드',
  address: '서울 어딘가 1',
  homepage: 'example.com',
  biz_no: '000-00-00000',
  account: ACCOUNT,
  site_id: 'yesi',
  site_pw: SITE_PW,
  memo: '매달 말에 주문',
}
const COMPANY2_ROW = {
  id: CO2,
  category: 'repair',
  name: '예시설비',
  phone: '',
  work: '',
  address: '',
  homepage: '',
  biz_no: '',
  account: '',
  site_id: '',
  site_pw: '',
  memo: '',
}
const COMPANY2: Company = {
  id: CO2,
  category: 'repair',
  name: '예시설비',
  phone: '',
  work: '',
  address: '',
  homepage: '',
  bizNo: '',
  account: '',
  siteId: '',
  sitePw: '',
  memo: '',
}

const PERSON_ROW = { id: P1, company_id: CO1, name: '김예시', mobile: '010-0000-0000', role: '영업' }
const PERSON_FIELDS: PersonFields = { name: '김예시', mobile: '010-0000-0000', role: '영업' }
const PERSON: Person = { ...PERSON_FIELDS, id: P1, companyId: CO1 }

const EQUIPMENT_ROW = { id: E1, company_id: CO1, name: '충격파 기계', serial: '0000-0001', bought_on: '2026-01-05', warranty_until: '2028-01-04' }
const EQUIPMENT_FIELDS: EquipmentFields = { name: '충격파 기계', serial: '0000-0001', boughtOn: '2026-01-05', warrantyUntil: '2028-01-04' }
const EQUIPMENT: Equipment = { ...EQUIPMENT_FIELDS, id: E1, companyId: CO1 }

const REPAIR_ROW = { id: R1, equipment_id: E1, day: '2026-11-03', content: '헤드 바꿈', cost: 150000 }
const REPAIR_FIELDS: RepairFields = { day: '2026-11-03', content: '헤드 바꿈', cost: 150000 }
const REPAIR: Repair = { ...REPAIR_FIELDS, id: R1, equipmentId: E1 }

const PAYLOAD: ImportPayload = {
  companies: [
    { name: '예시메디칼', phone: '02-111-1111' },
    { name: '예시상사', category: 'other', site_pw: SITE_PW, account: ACCOUNT },
  ],
  people: [{ company: '예시메디칼', name: '김예시', role: '부장' }],
  equipment: [
    { id: E1, company: '예시메디칼', name: '충격파 기계', serial: '0000-0002' },
    { company: '예시상사', name: '온열기', warranty_until: '2027-01-04' },
  ],
}

type Reply = { data: unknown; error: unknown; status: number }
const OK: Reply = { data: null, error: null, status: 200 }
const okWith = (data: unknown): Reply => ({ ...OK, data })

// postgrest-js가 돌려주는 실패 응답과 같은 모양
function failure(status: number, code = SECRET): Reply {
  return { data: null, error: { message: SECRET, details: SECRET, hint: SECRET, code }, status }
}
const DUPLICATE = failure(409, '23505')

type Step = [string, ...unknown[]]
type Query = { table: string; steps: Step[] }
const METHODS = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'range', 'limit', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single']
const TABLES = ['contacts_companies', 'contacts_people', 'contacts_equipment', 'contacts_repairs']

/**
 * 받은 부름을 묻기(from·rpc)마다 적는 가짜 클라이언트. 기다릴 때마다 정해 둔 답을 차례로 하나씩 준다(마지막 답은 되풀이).
 * 답 목록 하나면 모든 묻기가 같은 줄을 쓰고, 표 이름(rpc는 'rpc:함수')마다 주면 그 표의 줄을 쓴다(네 표를 함께 읽어도 섞이지 않게)
 */
function fakeClient(replies: Reply[] | Partial<Record<string, Reply[]>> = [OK]) {
  const queries: Query[] = []
  const shared = Array.isArray(replies) ? [...replies] : null
  const queues = new Map<string, Reply[]>()
  const next = (table: string): Reply => {
    let queue = shared
    if (queue === null) {
      queue = queues.get(table) ?? [...((replies as Partial<Record<string, Reply[]>>)[table] ?? [OK])]
      queues.set(table, queue)
    }
    return (queue.length > 1 ? queue.shift() : queue[0]) ?? OK
  }
  const query = (table: string, first: Step[]) => {
    const record: Query = { table, steps: first }
    queries.push(record)
    const builder: Record<string, unknown> = {}
    for (const name of METHODS) {
      builder[name] = (...args: unknown[]) => {
        record.steps.push([name, ...args])
        return builder
      }
    }
    builder.then = (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(next(table)).then(resolve, reject)
    return builder
  }
  const client = {
    from: (table: string) => query(table, []),
    rpc: (fn: string, args?: unknown) => query(`rpc:${fn}`, [['rpc', fn, args]]),
  } as unknown as Pick<SupabaseClient, 'from' | 'rpc'>
  return { client, queries }
}

/** 네 표 답(없는 표는 빈 목록) */
function bookClient(replies: Partial<Record<string, Reply[]>>) {
  return fakeClient(Object.fromEntries(TABLES.map((table) => [table, replies[table] ?? [okWith([])]])))
}

const throwingClient = {
  from() {
    throw new Error(SECRET)
  },
  rpc() {
    throw new Error(SECRET)
  },
} as unknown as Pick<SupabaseClient, 'from' | 'rpc'>

const stepsOf = (queries: Query[], table: string) => queries.filter((q) => q.table === table).map((q) => q.steps)
const rangesOf = (queries: Query[], table: string) =>
  stepsOf(queries, table).flatMap((steps) => steps.filter((step) => step[0] === 'range').map((step) => step.slice(1)))
const sentNothing = (queries: Query[]) => expect(queries).toEqual([])
const many = <T>(n: number, make: (i: number) => T) => Array.from({ length: n }, (_, i) => make(i))
const sentBody = (queries: Query[]) => queries[0]?.steps[0]?.[1] as Record<string, unknown>

// 진짜 postgrest-js에 가짜 fetch만 넣는다. 가짜 클라이언트가 실제 요청 모양과 어긋나지 않는지 본다
function realClient(fakeFetch: typeof fetch) {
  return createClient('http://localhost:54321', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  })
}

function respond(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status: body === null ? 204 : status })
}

function fetchReturning(...bodies: unknown[]) {
  const queue = [...bodies]
  return vi.fn<typeof fetch>(async () => respond(queue.length > 1 ? queue.shift() : queue[0]))
}

/** 주소 경로마다 정해 둔 답(같은 경로를 여러 번 물으면 차례로, 마지막 답은 되풀이) */
function fetchByPath(bodies: Record<string, unknown[]>) {
  const queues = new Map(Object.entries(bodies).map(([path, list]) => [path, [...list]]))
  return vi.fn<typeof fetch>(async (input) => {
    const queue = queues.get(new URL(String(input)).pathname) ?? [[]]
    return respond(queue.length > 1 ? queue.shift() : queue[0])
  })
}

function requestAt(fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>, index = 0) {
  const [input, init] = fakeFetch.mock.calls[index] ?? []
  const url = new URL(String(input))
  return { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

function requestOf(fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>) {
  expect(fakeFetch).toHaveBeenCalledTimes(1)
  return requestAt(fakeFetch)
}

async function caught(run: () => Promise<unknown>): Promise<ContactsStorageError> {
  const thrown: unknown = await run().then(
    () => {
      throw new Error('오류가 나야 한다')
    },
    (error: unknown) => error,
  )
  expect(thrown).toBeInstanceOf(ContactsStorageError)
  return thrown as ContactsStorageError
}

/** 오류에는 종류만: Supabase 문구도, 입력값(업체 이름·계좌·사이트 비밀번호)도 없다 */
function expectNoSecret(error: ContactsStorageError) {
  for (const secret of [SECRET, SITE_PW, ACCOUNT, '예시메디칼', '김예시', '충격파']) {
    expect(error.message).not.toContain(secret)
    expect(String(error)).not.toContain(secret)
    expect(error.stack ?? '').not.toContain(secret)
    expect(JSON.stringify(error)).not.toContain(secret)
  }
  expect(error.cause).toBeUndefined()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ── 읽기 ─────────────────────────────────────────────────────

describe('AC-6502.1 loadContacts', () => {
  it('AC-6502.1: 네 표를 정해 둔 칸만 created_at·id 차례로 1,000줄씩 읽어 ContactBook으로 바꾼다', async () => {
    const { client, queries } = bookClient({
      contacts_companies: [okWith([COMPANY_ROW, COMPANY2_ROW])],
      contacts_people: [okWith([PERSON_ROW])],
      contacts_equipment: [okWith([EQUIPMENT_ROW])],
      contacts_repairs: [okWith([REPAIR_ROW])],
    })
    const book: ContactBook = await loadContacts(client)
    expect(book).toEqual({ companies: [COMPANY, COMPANY2], people: [PERSON], equipment: [EQUIPMENT], repairs: [REPAIR] })
    const columns = [COMPANY_COLUMNS, PERSON_COLUMNS, EQUIPMENT_COLUMNS, REPAIR_COLUMNS]
    TABLES.forEach((table, i) => {
      expect(stepsOf(queries, table)).toEqual([[['select', columns[i]], ['order', 'created_at', ASC], ['order', 'id', ASC], ['range', 0, 999]]])
    })
    expect(queries).toHaveLength(4)
  })

  it('AC-6502.1: 읽는 칸에 hospital_id·created_at이 없다', () => {
    for (const columns of [COMPANY_COLUMNS, PERSON_COLUMNS, EQUIPMENT_COLUMNS, REPAIR_COLUMNS]) {
      expect(columns.split(',')).not.toContain('hospital_id')
      expect(columns.split(',')).not.toContain('created_at')
    }
  })

  it('AC-6502.1: 1,000줄이 넘는 표는 나눠 읽어 모두 돌려준다(꽉 찬 쪽 다음 쪽을 더 읽는다)', async () => {
    const first = many(1000, (i) => ({ ...PERSON_ROW, id: `p-${i}`, name: `사람${i}` }))
    const second = many(3, (i) => ({ ...PERSON_ROW, id: `p-x${i}`, name: `더${i}` }))
    const { client, queries } = bookClient({ contacts_people: [okWith(first), okWith(second)] })
    const book = await loadContacts(client)
    expect(book.people).toHaveLength(1003)
    expect(book.people.at(-1)?.id).toBe('p-x2')
    expect(rangesOf(queries, 'contacts_people')).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(rangesOf(queries, 'contacts_companies')).toEqual([[0, 999]])
  })

  it('AC-6502.1: 딱 1,000줄이면 다음 쪽(빈 쪽)까지 읽고 멈춘다', async () => {
    const { client, queries } = bookClient({ contacts_repairs: [okWith(many(1000, (i) => ({ ...REPAIR_ROW, id: `r-${i}` }))), okWith([])] })
    expect((await loadContacts(client)).repairs).toHaveLength(1000)
    expect(rangesOf(queries, 'contacts_repairs')).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('AC-6502.1: 한 표의 둘째 쪽이 실패하면 반쪽 주소록이 아니라 failed다', async () => {
    const { client } = bookClient({ contacts_equipment: [okWith(many(1000, (i) => ({ ...EQUIPMENT_ROW, id: `e-${i}` }))), failure(500)] })
    expect((await caught(() => loadContacts(client))).kind).toBe('failed')
  })

  it('AC-6502.1: 한 표의 답이 목록이 아니면 빈 표로 보이지 않고 failed다', async () => {
    const { client } = bookClient({ contacts_people: [okWith(null)] })
    expect((await caught(() => loadContacts(client))).kind).toBe('failed')
  })

  it('AC-6502.1: 한도까지 찬 칸·빈 선택 칸·날짜와 비용 비움은 그대로 읽는다(글자 수는 코드포인트)', async () => {
    const fullCompany = {
      ...COMPANY_ROW,
      name: '😀'.repeat(40),
      phone: '0'.repeat(30),
      work: '가'.repeat(100),
      address: '가'.repeat(200),
      homepage: 'a'.repeat(200),
      biz_no: '1'.repeat(20),
      account: '가'.repeat(100),
      site_id: 'a'.repeat(100),
      site_pw: 'b'.repeat(100),
      memo: '가'.repeat(1000),
    }
    const { client } = bookClient({
      contacts_companies: [okWith([fullCompany, COMPANY2_ROW])],
      contacts_people: [okWith([{ ...PERSON_ROW, name: '가'.repeat(20), mobile: '', role: '' }])],
      contacts_equipment: [okWith([{ ...EQUIPMENT_ROW, name: '가'.repeat(60), serial: '', bought_on: null, warranty_until: null }])],
      contacts_repairs: [okWith([{ ...REPAIR_ROW, content: '가'.repeat(200), cost: null }, { ...REPAIR_ROW, id: 'r-2', cost: 9_999_999_999 }])],
    })
    const book = await loadContacts(client)
    expect(book.companies.map((c) => c.id)).toEqual([CO1, CO2])
    expect(book.companies[0]?.sitePw).toBe('b'.repeat(100))
    expect(book.people).toEqual([{ ...PERSON, name: '가'.repeat(20), mobile: '', role: '' }])
    expect(book.equipment).toEqual([{ ...EQUIPMENT, name: '가'.repeat(60), serial: '', boughtOn: null, warrantyUntil: null }])
    expect(book.repairs.map((r) => r.cost)).toEqual([null, 9_999_999_999])
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 없음', { id: null }],
    ['id 빈 글자', { id: '' }],
    ['분류 틀림', { category: 'hospital' }],
    ['분류 없음', { category: null }],
    ['업체 이름 빈 글자', { name: '' }],
    ['업체 이름 41자', { name: '가'.repeat(41) }],
    ['대표 전화 숫자', { phone: 212345678 }],
    ['대표 전화 31자', { phone: '0'.repeat(31) }],
    ['하는 일·품목 101자', { work: '가'.repeat(101) }],
    ['주소 없음', { address: null }],
    ['홈페이지 201자', { homepage: 'a'.repeat(201) }],
    ['사업자번호 21자', { biz_no: '1'.repeat(21) }],
    ['계좌 101자', { account: '가'.repeat(101) }],
    ['사이트 아이디 빠짐', { site_id: undefined }],
    ['사이트 비밀번호 101자', { site_pw: 'b'.repeat(101) }],
    ['업체 메모 1001자', { memo: '가'.repeat(1001) }],
  ])('AC-6502.1: 모양이 틀린 업체 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = bookClient({ contacts_companies: [okWith([{ ...COMPANY_ROW, ...patch }, COMPANY2_ROW])] })
    expect((await loadContacts(client)).companies).toEqual([COMPANY2])
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 없음', { id: null }],
    ['업체 id 빈 글자', { company_id: '' }],
    ['이름 빈 글자', { name: '' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['휴대폰 없음', { mobile: null }],
    ['휴대폰 31자', { mobile: '0'.repeat(31) }],
    ['맡은 일 41자', { role: '가'.repeat(41) }],
    ['맡은 일 숫자', { role: 1 }],
  ])('AC-6502.1: 모양이 틀린 담당자 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = bookClient({ contacts_people: [okWith([{ ...PERSON_ROW, ...patch }, { ...PERSON_ROW, id: 'p-2' }])] })
    expect((await loadContacts(client)).people).toEqual([{ ...PERSON, id: 'p-2' }])
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 없음', { id: null }],
    ['업체 id 없음', { company_id: null }],
    ['장비 이름 빈 글자', { name: '' }],
    ['장비 이름 61자', { name: '가'.repeat(61) }],
    ['일련번호 없음', { serial: null }],
    ['일련번호 61자', { serial: '1'.repeat(61) }],
    ['들여온 날 모양 틀림', { bought_on: '2026/01/05' }],
    ['들여온 날 숫자', { bought_on: 20260105 }],
    ['무상 수리 끝나는 날 없는 날', { warranty_until: '2026-02-30' }],
    ['무상 수리 끝나는 날 빈 글자', { warranty_until: '' }],
  ])('AC-6502.1: 모양이 틀린 장비 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = bookClient({ contacts_equipment: [okWith([{ ...EQUIPMENT_ROW, ...patch }, { ...EQUIPMENT_ROW, id: E2 }])] })
    expect((await loadContacts(client)).equipment).toEqual([{ ...EQUIPMENT, id: E2 }])
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 빈 글자', { id: '' }],
    ['장비 id 없음', { equipment_id: null }],
    ['날짜 없음', { day: null }],
    ['날짜 13월', { day: '2026-13-01' }],
    ['내용 빈 글자', { content: '' }],
    ['내용 201자', { content: '가'.repeat(201) }],
    ['비용 음수', { cost: -1 }],
    ['비용 정수 아님', { cost: 1.5 }],
    ['비용 글자', { cost: '150000' }],
    ['비용 100억', { cost: 10_000_000_000 }],
    ['비용 빠짐', { cost: undefined }],
  ])('AC-6502.1: 모양이 틀린 수리 기록 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = bookClient({ contacts_repairs: [okWith([{ ...REPAIR_ROW, ...patch }, { ...REPAIR_ROW, id: 'r-2' }])] })
    expect((await loadContacts(client)).repairs).toEqual([{ ...REPAIR, id: 'r-2' }])
  })

  it('AC-6502.1: 줄이 객체가 아니면(null·글자·목록) 뺀다', async () => {
    const { client } = bookClient({ contacts_companies: [okWith([null, 'x', [COMPANY_ROW], COMPANY_ROW])] })
    expect((await loadContacts(client)).companies).toEqual([COMPANY])
  })

  it('AC-6502.1: 읽은 줄의 다른 열쇠(hospital_id·created_at 등)는 옮기지 않는다', async () => {
    const extra = { hospital_id: 'h-1', created_at: '2026-11-21T00:00:00Z', other: SECRET }
    const { client } = bookClient({
      contacts_companies: [okWith([{ ...COMPANY_ROW, ...extra }])],
      contacts_people: [okWith([{ ...PERSON_ROW, ...extra }])],
      contacts_equipment: [okWith([{ ...EQUIPMENT_ROW, ...extra }])],
      contacts_repairs: [okWith([{ ...REPAIR_ROW, ...extra }])],
    })
    const book = await loadContacts(client)
    expect(Object.keys(book.companies[0] ?? {}).sort()).toEqual(Object.keys(COMPANY).sort())
    expect(Object.keys(book.people[0] ?? {}).sort()).toEqual(Object.keys(PERSON).sort())
    expect(Object.keys(book.equipment[0] ?? {}).sort()).toEqual(Object.keys(EQUIPMENT).sort())
    expect(Object.keys(book.repairs[0] ?? {}).sort()).toEqual(Object.keys(REPAIR).sort())
  })

  it('AC-6502.1: 진짜 클라이언트로도 표마다 select·created_at·id 차례·offset/limit만 묻는다', async () => {
    const fakeFetch = fetchByPath({
      '/rest/v1/contacts_companies': [[COMPANY_ROW]],
      '/rest/v1/contacts_people': [[PERSON_ROW]],
      '/rest/v1/contacts_equipment': [[EQUIPMENT_ROW]],
      '/rest/v1/contacts_repairs': [[REPAIR_ROW]],
    })
    await expect(loadContacts(realClient(fakeFetch))).resolves.toEqual({ companies: [COMPANY], people: [PERSON], equipment: [EQUIPMENT], repairs: [REPAIR] })
    expect(fakeFetch).toHaveBeenCalledTimes(4)
    const requests = fakeFetch.mock.calls.map((_call, i) => requestAt(fakeFetch, i))
    const columns: Record<string, string> = {
      '/rest/v1/contacts_companies': COMPANY_COLUMNS,
      '/rest/v1/contacts_people': PERSON_COLUMNS,
      '/rest/v1/contacts_equipment': EQUIPMENT_COLUMNS,
      '/rest/v1/contacts_repairs': REPAIR_COLUMNS,
    }
    expect(requests.map((r) => r.url.pathname).sort()).toEqual(Object.keys(columns).sort())
    for (const request of requests) {
      expect(request.method).toBe('GET')
      expect(request.url.searchParams.get('select')).toBe(columns[request.url.pathname])
      expect(request.url.searchParams.get('order')).toBe('created_at.asc,id.asc')
      expect([request.url.searchParams.get('offset'), request.url.searchParams.get('limit')]).toEqual(['0', '1000'])
      expect([...request.url.searchParams.keys()].sort()).toEqual(['limit', 'offset', 'order', 'select'])
    }
  })
})

// ── 업체 ─────────────────────────────────────────────────────

describe('AC-6502.2 addCompany', () => {
  it('AC-6502.2: 정해 둔 열한 칸만 넣고 DB가 준 줄을 Company로 돌려준다', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    await expect(addCompany(client, COMPANY_FIELDS)).resolves.toEqual(COMPANY)
    expect(queries).toEqual([{ table: 'contacts_companies', steps: [['insert', COMPANY_BODY], ['select', COMPANY_COLUMNS], ['single']] }])
    expect(Object.keys(sentBody(queries))).toEqual(COMPANY_KEYS)
  })

  it('AC-6502.2: 받은 값의 다른 열쇠(id·hospital_id·created_at 등)는 펼쳐 보내지 않는다', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    const extra = { id: CO2, hospital_id: 'h-1', created_at: '2026-11-21T00:00:00Z', companyId: CO2, site_pw: 'other', note: SECRET }
    await addCompany(client, { ...COMPANY_FIELDS, ...extra } as CompanyFields)
    const body = sentBody(queries)
    expect(body).toEqual(COMPANY_BODY)
    for (const key of [...DB_ONLY, 'companyId', 'note', 'bizNo', 'siteId', 'sitePw']) expect(body).not.toHaveProperty(key)
  })

  it('AC-6502.2: 글자는 앞뒤 빈칸을 빼고 NFC로 맞춰 보낸다(가운데 빈칸은 그대로)', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    const decomposed = '예시메디칼'.normalize('NFD')
    expect(decomposed).not.toBe('예시메디칼')
    await addCompany(client, { ...COMPANY_FIELDS, name: `  ${decomposed}\n`, memo: '\t매달  말에 주문 ', sitePw: ` ${SITE_PW} `, account: ` ${ACCOUNT}` })
    expect(sentBody(queries)).toEqual({ ...COMPANY_BODY, name: '예시메디칼', memo: '매달  말에 주문', site_pw: SITE_PW, account: ACCOUNT })
  })

  it('AC-6502.2: 한도까지는 보낸다(글자 수는 앞뒤 빈칸을 뺀 코드포인트)', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    await addCompany(client, { ...COMPANY_FIELDS, name: ` ${'😀'.repeat(40)} `, memo: '가'.repeat(1000), sitePw: 'b'.repeat(100) })
    expect(sentBody(queries)).toMatchObject({ name: '😀'.repeat(40), memo: '가'.repeat(1000), site_pw: 'b'.repeat(100) })
  })

  it.each<[string, Record<string, unknown>]>([
    ['분류 틀림', { category: 'hospital' }],
    ['분류 없음', { category: undefined }],
    ['업체 이름 빈칸뿐', { name: '   ' }],
    ['업체 이름 41자', { name: '가'.repeat(41) }],
    ['업체 이름 글자 아님', { name: undefined }],
    ['대표 전화 31자', { phone: '0'.repeat(31) }],
    ['하는 일·품목 101자', { work: '가'.repeat(101) }],
    ['주소 201자', { address: '가'.repeat(201) }],
    ['홈페이지 201자', { homepage: 'a'.repeat(201) }],
    ['사업자번호 21자', { bizNo: '1'.repeat(21) }],
    ['계좌 101자', { account: '가'.repeat(101) }],
    ['사이트 아이디 101자', { siteId: 'a'.repeat(101) }],
    ['사이트 비밀번호 101자', { sitePw: 'b'.repeat(101) }],
    ['업체 메모 1001자', { memo: '가'.repeat(1001) }],
    ['업체 메모 null', { memo: null }],
  ])('AC-6502.2: 칸 검사를 못 지나면(%s) 보내지 않고 invalid다', async (_name, patch) => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    await expect(addCompany(client, { ...COMPANY_FIELDS, ...patch } as CompanyFields)).resolves.toBe('invalid')
    sentNothing(queries)
  })

  it('AC-6502.2: 같은 이름 업체를 DB가 겹침(23505)으로 거부하면 duplicate다', async () => {
    const { client } = fakeClient([DUPLICATE])
    await expect(addCompany(client, COMPANY_FIELDS)).resolves.toBe('duplicate')
  })

  it('AC-6502.2: DB가 준 줄 모양이 틀리면 failed다', async () => {
    const { client } = fakeClient([okWith({ ...COMPANY_ROW, category: 'x' })])
    expect((await caught(() => addCompany(client, COMPANY_FIELDS))).kind).toBe('failed')
  })

  it('AC-6502.2: 진짜 클라이언트로도 POST 한 번에 정해 둔 열한 칸만 보내고 정해 둔 칸만 돌려받는다', async () => {
    const fakeFetch = fetchReturning(COMPANY_ROW)
    await expect(addCompany(realClient(fakeFetch), { ...COMPANY_FIELDS, id: CO2 } as CompanyFields)).resolves.toEqual(COMPANY)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/contacts_companies')
    expect(request.method).toBe('POST')
    expect(request.url.searchParams.get('select')).toBe(COMPANY_COLUMNS)
    expect(request.headers.get('Prefer')).toContain('return=representation')
    expect(request.body).toEqual(COMPANY_BODY)
    expect(Object.keys(request.body)).toEqual(COMPANY_KEYS)
  })

  it('AC-6502.2: 진짜 클라이언트에서 겹침(409, 23505)이면 duplicate다', async () => {
    const fakeFetch = vi.fn<typeof fetch>(async () => respond({ message: SECRET, details: SECRET, hint: SECRET, code: '23505' }, 409))
    await expect(addCompany(realClient(fakeFetch), COMPANY_FIELDS)).resolves.toBe('duplicate')
  })
})

describe('AC-6502.2 updateCompany', () => {
  it('AC-6502.2: 정해 둔 열한 칸만 그 id 줄에 고치고 고친 줄을 돌려준다', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    await expect(updateCompany(client, CO1, COMPANY_FIELDS)).resolves.toEqual(COMPANY)
    expect(queries).toEqual([
      { table: 'contacts_companies', steps: [['update', COMPANY_BODY], ['eq', 'id', CO1], ['select', COMPANY_COLUMNS], ['single']] },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(COMPANY_KEYS)
  })

  it('AC-6502.2: 받은 값의 id·hospital_id·created_at은 보내지 않고 글자는 맞춰 보낸다', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    const extra = { id: CO2, hospital_id: 'h-1', created_at: '2026-11-21T00:00:00Z' }
    await updateCompany(client, CO1, { ...COMPANY_FIELDS, ...extra, name: ' 예시메디칼 ' } as CompanyFields)
    expect(sentBody(queries)).toEqual(COMPANY_BODY)
  })

  it('AC-6502.2: 다른 업체와 이름이 겹치면(23505) duplicate다', async () => {
    const { client } = fakeClient([DUPLICATE])
    await expect(updateCompany(client, CO1, { ...COMPANY_FIELDS, name: '예시설비' })).resolves.toBe('duplicate')
  })

  it('AC-6502.2: 칸 검사를 못 지나면 보내지 않고 invalid다', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    await expect(updateCompany(client, CO1, { ...COMPANY_FIELDS, name: '' })).resolves.toBe('invalid')
    sentNothing(queries)
  })

  it('AC-6502.2: id가 빈 글자면 보내지 않고 failed다(조건 없는 고치기를 보내지 않는다)', async () => {
    const { client, queries } = fakeClient([okWith(COMPANY_ROW)])
    expect((await caught(() => updateCompany(client, '', COMPANY_FIELDS))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.2: 진짜 클라이언트로도 PATCH 한 번에 id=eq와 정해 둔 열한 칸만 보낸다', async () => {
    const fakeFetch = fetchReturning(COMPANY_ROW)
    await expect(updateCompany(realClient(fakeFetch), CO1, COMPANY_FIELDS)).resolves.toEqual(COMPANY)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/contacts_companies')
    expect(request.method).toBe('PATCH')
    expect(request.url.searchParams.get('id')).toBe(`eq.${CO1}`)
    expect(request.url.searchParams.get('select')).toBe(COMPANY_COLUMNS)
    expect(Object.keys(request.body)).toEqual(COMPANY_KEYS)
  })
})

// ── 담당자 ───────────────────────────────────────────────────

describe('AC-6502.2 addPerson·updatePerson', () => {
  it('AC-6502.2: 담당자는 업체 id와 이름·휴대폰·맡은 일만 넣고 DB가 준 줄을 Person으로 돌려준다', async () => {
    const { client, queries } = fakeClient([okWith(PERSON_ROW)])
    await expect(addPerson(client, CO1, PERSON_FIELDS)).resolves.toEqual(PERSON)
    expect(queries).toEqual([
      {
        table: 'contacts_people',
        steps: [['insert', { company_id: CO1, name: '김예시', mobile: '010-0000-0000', role: '영업' }], ['select', PERSON_COLUMNS], ['single']],
      },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(PERSON_INSERT_KEYS)
  })

  it('AC-6502.2: 받은 값의 다른 열쇠는 보내지 않고 글자는 앞뒤 빈칸을 빼고 NFC로 보낸다', async () => {
    const { client, queries } = fakeClient([okWith(PERSON_ROW)])
    const extra = { id: P1, hospital_id: 'h-1', companyId: CO2, company_id: CO2 }
    await addPerson(client, CO1, { ...extra, name: ` ${'김예시'.normalize('NFD')} `, mobile: ' 010-0000-0000', role: '영업\n' } as PersonFields)
    expect(sentBody(queries)).toEqual({ company_id: CO1, name: '김예시', mobile: '010-0000-0000', role: '영업' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['이름 빈칸뿐', { name: ' ' }],
    ['이름 21자', { name: '가'.repeat(21) }],
    ['휴대폰 31자', { mobile: '0'.repeat(31) }],
    ['맡은 일 41자', { role: '가'.repeat(41) }],
    ['맡은 일 글자 아님', { role: null }],
  ])('AC-6502.2: 담당자 칸 검사를 못 지나면(%s) 보내지 않고 invalid다', async (_name, patch) => {
    const { client, queries } = fakeClient([okWith(PERSON_ROW)])
    await expect(addPerson(client, CO1, { ...PERSON_FIELDS, ...patch } as PersonFields)).resolves.toBe('invalid')
    await expect(updatePerson(client, P1, { ...PERSON_FIELDS, ...patch } as PersonFields)).resolves.toBe('invalid')
    sentNothing(queries)
  })

  it('AC-6502.2: 같은 업체에 같은 이름 담당자를 DB가 겹침(23505)으로 거부하면 duplicate다', async () => {
    await expect(addPerson(fakeClient([DUPLICATE]).client, CO1, PERSON_FIELDS)).resolves.toBe('duplicate')
    await expect(updatePerson(fakeClient([DUPLICATE]).client, P1, PERSON_FIELDS)).resolves.toBe('duplicate')
  })

  it('AC-6502.2: 고치기는 이름·휴대폰·맡은 일만 그 id 줄에 보낸다(업체는 바꾸지 않는다)', async () => {
    const { client, queries } = fakeClient([okWith({ ...PERSON_ROW, role: '부장' })])
    await expect(updatePerson(client, P1, { ...PERSON_FIELDS, role: '부장', companyId: CO2 } as PersonFields)).resolves.toEqual({ ...PERSON, role: '부장' })
    expect(queries).toEqual([
      {
        table: 'contacts_people',
        steps: [['update', { name: '김예시', mobile: '010-0000-0000', role: '부장' }], ['eq', 'id', P1], ['select', PERSON_COLUMNS], ['single']],
      },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(PERSON_UPDATE_KEYS)
  })

  it('AC-6502.2: 업체 id·담당자 id가 빈 글자면 보내지 않고 failed다', async () => {
    const { client, queries } = fakeClient([okWith(PERSON_ROW)])
    expect((await caught(() => addPerson(client, '', PERSON_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updatePerson(client, '', PERSON_FIELDS))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.2: DB가 준 줄 모양이 틀리면 failed다', async () => {
    expect((await caught(() => addPerson(fakeClient([okWith({ ...PERSON_ROW, name: '' })]).client, CO1, PERSON_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updatePerson(fakeClient([okWith(null)]).client, P1, PERSON_FIELDS))).kind).toBe('failed')
  })
})

// ── 장비 ─────────────────────────────────────────────────────

describe('AC-6502.2 addEquipment·updateEquipment', () => {
  const INSERTED = { company_id: CO1, name: '충격파 기계', serial: '0000-0001', bought_on: '2026-01-05', warranty_until: '2028-01-04' }

  it('AC-6502.2: 장비는 업체 id와 이름·일련번호·두 날짜만 넣고 DB가 준 줄을 Equipment로 돌려준다', async () => {
    const { client, queries } = fakeClient([okWith(EQUIPMENT_ROW)])
    await expect(addEquipment(client, CO1, EQUIPMENT_FIELDS)).resolves.toEqual(EQUIPMENT)
    expect(queries).toEqual([{ table: 'contacts_equipment', steps: [['insert', INSERTED], ['select', EQUIPMENT_COLUMNS], ['single']] }])
    expect(Object.keys(sentBody(queries))).toEqual(EQUIPMENT_INSERT_KEYS)
  })

  it('AC-6502.2: 날짜 비움은 null로 보내고, 글자는 맞춰 보내고, 다른 열쇠는 보내지 않는다', async () => {
    const { client, queries } = fakeClient([okWith({ ...EQUIPMENT_ROW, serial: '', bought_on: null, warranty_until: null })])
    const extra = { id: E2, hospital_id: 'h-1', bought_on: '2020-01-01', companyId: CO2 }
    await addEquipment(client, CO1, { ...extra, name: ' 충격파 기계 ', serial: '  ', boughtOn: null, warrantyUntil: null } as EquipmentFields)
    expect(sentBody(queries)).toEqual({ company_id: CO1, name: '충격파 기계', serial: '', bought_on: null, warranty_until: null })
  })

  it.each<[string, Record<string, unknown>]>([
    ['장비 이름 빈칸뿐', { name: '  ' }],
    ['장비 이름 61자', { name: '가'.repeat(61) }],
    ['일련번호 61자', { serial: '1'.repeat(61) }],
    ['일련번호 글자 아님', { serial: undefined }],
    ['들여온 날 13월', { boughtOn: '2026-13-01' }],
    ['들여온 날 빈 글자', { boughtOn: '' }],
    ['무상 수리 끝나는 날 모양 틀림', { warrantyUntil: '2028.01.04' }],
    ['무상 수리 끝나는 날 숫자', { warrantyUntil: 46027 }],
  ])('AC-6502.2: 장비 칸 검사를 못 지나면(%s) 보내지 않고 invalid다', async (_name, patch) => {
    const { client, queries } = fakeClient([okWith(EQUIPMENT_ROW)])
    await expect(addEquipment(client, CO1, { ...EQUIPMENT_FIELDS, ...patch } as EquipmentFields)).resolves.toBe('invalid')
    await expect(updateEquipment(client, E1, { ...EQUIPMENT_FIELDS, ...patch } as EquipmentFields)).resolves.toBe('invalid')
    sentNothing(queries)
  })

  it('AC-6502.2: 무상 수리 끝나는 날이 들여온 날보다 앞서도 보낸다', async () => {
    const { client, queries } = fakeClient([okWith(EQUIPMENT_ROW)])
    await addEquipment(client, CO1, { ...EQUIPMENT_FIELDS, boughtOn: '2026-02-01', warrantyUntil: '2026-01-01' })
    expect(sentBody(queries)).toMatchObject({ bought_on: '2026-02-01', warranty_until: '2026-01-01' })
  })

  it('AC-6502.2: 고치기는 이름·일련번호·두 날짜만 그 id 줄에 보낸다(업체는 바꾸지 않는다)', async () => {
    const { client, queries } = fakeClient([okWith(EQUIPMENT_ROW)])
    await expect(updateEquipment(client, E1, EQUIPMENT_FIELDS)).resolves.toEqual(EQUIPMENT)
    expect(queries).toEqual([
      {
        table: 'contacts_equipment',
        steps: [
          ['update', { name: '충격파 기계', serial: '0000-0001', bought_on: '2026-01-05', warranty_until: '2028-01-04' }],
          ['eq', 'id', E1],
          ['select', EQUIPMENT_COLUMNS],
          ['single'],
        ],
      },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(EQUIPMENT_UPDATE_KEYS)
  })

  it('AC-6502.2: 장비에는 겹침이 없다 — 23505가 와도 duplicate가 아니라 failed다', async () => {
    expect((await caught(() => addEquipment(fakeClient([DUPLICATE]).client, CO1, EQUIPMENT_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updateEquipment(fakeClient([DUPLICATE]).client, E1, EQUIPMENT_FIELDS))).kind).toBe('failed')
  })

  it('AC-6502.2: 업체 id·장비 id가 빈 글자면 보내지 않고 failed다', async () => {
    const { client, queries } = fakeClient([okWith(EQUIPMENT_ROW)])
    expect((await caught(() => addEquipment(client, '', EQUIPMENT_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updateEquipment(client, '', EQUIPMENT_FIELDS))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.2: DB가 준 줄 모양이 틀리면 failed다', async () => {
    const { client } = fakeClient([okWith({ ...EQUIPMENT_ROW, warranty_until: '2028/01/04' })])
    expect((await caught(() => addEquipment(client, CO1, EQUIPMENT_FIELDS))).kind).toBe('failed')
  })
})

// ── 수리 기록 ────────────────────────────────────────────────

describe('AC-6502.2 addRepair·updateRepair', () => {
  it('AC-6502.2: 수리 기록은 장비 id와 날짜·내용·비용만 넣고 DB가 준 줄을 Repair로 돌려준다', async () => {
    const { client, queries } = fakeClient([okWith(REPAIR_ROW)])
    await expect(addRepair(client, E1, REPAIR_FIELDS)).resolves.toEqual(REPAIR)
    expect(queries).toEqual([
      {
        table: 'contacts_repairs',
        steps: [['insert', { equipment_id: E1, day: '2026-11-03', content: '헤드 바꿈', cost: 150000 }], ['select', REPAIR_COLUMNS], ['single']],
      },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(REPAIR_INSERT_KEYS)
  })

  it('AC-6502.2: 비용 비움은 null로 보내고, 글자는 맞춰 보내고, 다른 열쇠는 보내지 않는다', async () => {
    const { client, queries } = fakeClient([okWith({ ...REPAIR_ROW, cost: null })])
    const extra = { id: R1, hospital_id: 'h-1', equipmentId: E2, equipment_id: E2 }
    await addRepair(client, E1, { ...extra, day: ' 2026-11-03 ', content: ` ${'헤드 바꿈'.normalize('NFD')}\n`, cost: null } as RepairFields)
    expect(sentBody(queries)).toEqual({ equipment_id: E1, day: '2026-11-03', content: '헤드 바꿈', cost: null })
  })

  it('AC-6502.2: 비용 0과 9,999,999,999는 보낸다', async () => {
    for (const cost of [0, 9_999_999_999]) {
      const { client, queries } = fakeClient([okWith({ ...REPAIR_ROW, cost })])
      await expect(addRepair(client, E1, { ...REPAIR_FIELDS, cost })).resolves.toEqual({ ...REPAIR, cost })
      expect(sentBody(queries)).toMatchObject({ cost })
    }
  })

  it.each<[string, Record<string, unknown>]>([
    ['날짜 빈 글자', { day: '' }],
    ['날짜 모양 틀림', { day: '2026/11/03' }],
    ['날짜 없는 날', { day: '2026-02-30' }],
    ['날짜 글자 아님', { day: null }],
    ['내용 빈칸뿐', { content: '  ' }],
    ['내용 201자', { content: '가'.repeat(201) }],
    ['비용 음수', { cost: -1 }],
    ['비용 정수 아님', { cost: 1.5 }],
    ['비용 100억', { cost: 10_000_000_000 }],
    ['비용 글자', { cost: '150,000' }],
    ['비용 빠짐', { cost: undefined }],
  ])('AC-6502.2: 수리 기록 칸 검사를 못 지나면(%s) 보내지 않고 invalid다', async (_name, patch) => {
    const { client, queries } = fakeClient([okWith(REPAIR_ROW)])
    await expect(addRepair(client, E1, { ...REPAIR_FIELDS, ...patch } as RepairFields)).resolves.toBe('invalid')
    await expect(updateRepair(client, R1, { ...REPAIR_FIELDS, ...patch } as RepairFields)).resolves.toBe('invalid')
    sentNothing(queries)
  })

  it('AC-6502.2: 고치기는 날짜·내용·비용만 그 id 줄에 보낸다(장비는 바꾸지 않는다)', async () => {
    const { client, queries } = fakeClient([okWith({ ...REPAIR_ROW, cost: 90000 })])
    await expect(updateRepair(client, R1, { ...REPAIR_FIELDS, cost: 90000 })).resolves.toEqual({ ...REPAIR, cost: 90000 })
    expect(queries).toEqual([
      {
        table: 'contacts_repairs',
        steps: [['update', { day: '2026-11-03', content: '헤드 바꿈', cost: 90000 }], ['eq', 'id', R1], ['select', REPAIR_COLUMNS], ['single']],
      },
    ])
    expect(Object.keys(sentBody(queries))).toEqual(REPAIR_UPDATE_KEYS)
  })

  it('AC-6502.2: 수리 기록에는 겹침이 없다 — 23505가 와도 duplicate가 아니라 failed다', async () => {
    expect((await caught(() => addRepair(fakeClient([DUPLICATE]).client, E1, REPAIR_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updateRepair(fakeClient([DUPLICATE]).client, R1, REPAIR_FIELDS))).kind).toBe('failed')
  })

  it('AC-6502.2: 장비 id·수리 기록 id가 빈 글자면 보내지 않고 failed다', async () => {
    const { client, queries } = fakeClient([okWith(REPAIR_ROW)])
    expect((await caught(() => addRepair(client, '', REPAIR_FIELDS))).kind).toBe('failed')
    expect((await caught(() => updateRepair(client, '', REPAIR_FIELDS))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.2: DB가 준 줄 모양이 틀리면 failed다', async () => {
    const { client } = fakeClient([okWith({ ...REPAIR_ROW, cost: '150000' })])
    expect((await caught(() => updateRepair(client, R1, REPAIR_FIELDS))).kind).toBe('failed')
  })
})

// ── 지우기 ───────────────────────────────────────────────────

type Remove = (client: Pick<SupabaseClient, 'from' | 'rpc'>, id: string) => Promise<void>
describe.each<[string, Remove, string, string]>([
  ['deleteCompany', deleteCompany, 'contacts_companies', CO1],
  ['deletePerson', deletePerson, 'contacts_people', P1],
  ['deleteEquipment', deleteEquipment, 'contacts_equipment', E1],
  ['deleteRepair', deleteRepair, 'contacts_repairs', R1],
])('AC-6502.2 %s', (_name, remove, table, id) => {
  it('AC-6502.2: 그 id 줄 하나만 지운다', async () => {
    const { client, queries } = fakeClient()
    await expect(remove(client, id)).resolves.toBeUndefined()
    expect(queries).toEqual([{ table, steps: [['delete'], ['eq', 'id', id]] }])
  })

  it('AC-6502.2: id가 빈 글자면 보내지 않고 failed다(조건 없는 지우기를 보내지 않는다)', async () => {
    const { client, queries } = fakeClient()
    expect((await caught(() => remove(client, ''))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.2: 진짜 클라이언트로도 DELETE 한 번에 id=eq만 보낸다', async () => {
    const fakeFetch = fetchReturning(null)
    await remove(realClient(fakeFetch), id)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe(`/rest/v1/${table}`)
    expect(request.method).toBe('DELETE')
    expect([...request.url.searchParams.entries()]).toEqual([['id', `eq.${id}`]])
  })
})

// ── 엑셀 넣기 ────────────────────────────────────────────────

describe('AC-6502.3 importContacts', () => {
  it('AC-6502.3: rpc(contacts_import, { p: 몸통 }) 하나만 부르고 몸통을 그대로 넘긴다', async () => {
    const before = structuredClone(PAYLOAD)
    const { client, queries } = fakeClient()
    await expect(importContacts(client, PAYLOAD)).resolves.toBeUndefined()
    expect(queries).toEqual([{ table: 'rpc:contacts_import', steps: [['rpc', 'contacts_import', { p: PAYLOAD }]] }])
    const args = queries[0]?.steps[0]?.[2] as { p: unknown }
    expect(Object.keys(args)).toEqual(['p'])
    expect(args.p).toBe(PAYLOAD)
    expect(PAYLOAD).toEqual(before)
  })

  it('AC-6502.3: 빈 몸통도 바꾸지 않고 그대로 넘긴다', async () => {
    const empty: ImportPayload = { companies: [], people: [], equipment: [] }
    const { client, queries } = fakeClient()
    await importContacts(client, empty)
    expect(queries).toEqual([{ table: 'rpc:contacts_import', steps: [['rpc', 'contacts_import', { p: { companies: [], people: [], equipment: [] } }]] }])
  })

  it('AC-6502.3: 23505가 와도 duplicate가 아니라 failed이고 오류에 몸통 값이 없다', async () => {
    const error = await caught(() => importContacts(fakeClient([DUPLICATE]).client, PAYLOAD))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-6502.3: 진짜 클라이언트로도 POST /rpc/contacts_import 한 번에 { p: 몸통 }만 보낸다', async () => {
    const fakeFetch = fetchReturning(null)
    await importContacts(realClient(fakeFetch), PAYLOAD)
    const request = requestOf(fakeFetch)
    expect(request.url.pathname).toBe('/rest/v1/rpc/contacts_import')
    expect(request.method).toBe('POST')
    expect(request.body).toEqual({ p: PAYLOAD })
  })
})

// ── 대시보드 무상 수리 알림 ──────────────────────────────────

describe('AC-6502.4 listWarrantySoon', () => {
  const SOON = (id: string, companyId: string, name: string, until: string) => ({ id, company_id: companyId, name, warranty_until: until })

  it('AC-6502.4: 끝나는 날이 오늘~오늘+30인 장비를 읽고 그 업체 id·이름만 읽어 붙인다', async () => {
    const { client, queries } = fakeClient({
      contacts_equipment: [okWith([SOON(E1, CO1, '충격파 기계', TODAY), SOON(E2, CO2, '온열기', LAST)])],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }, { id: CO2, name: '예시설비' }])],
    })
    const items: WarrantyItem[] = await listWarrantySoon(client, TODAY)
    expect(items).toEqual([
      { equipmentId: E1, companyId: CO1, companyName: '예시메디칼', name: '충격파 기계', warrantyUntil: TODAY },
      { equipmentId: E2, companyId: CO2, companyName: '예시설비', name: '온열기', warrantyUntil: LAST },
    ])
    expect(queries).toEqual([
      {
        table: 'contacts_equipment',
        steps: [
          ['select', WARRANTY_COLUMNS],
          ['gte', 'warranty_until', TODAY],
          ['lte', 'warranty_until', LAST],
          ['order', 'warranty_until', ASC],
          ['order', 'name', ASC],
          ['order', 'id', ASC],
          ['range', 0, 999],
        ],
      },
      { table: 'contacts_companies', steps: [['select', WARRANTY_COMPANY_COLUMNS], ['in', 'id', [CO1, CO2]]] },
    ])
  })

  it('AC-6502.4: 읽는 칸에 사이트 비밀번호·계좌(와 다른 업체 칸)가 없다', () => {
    for (const columns of [WARRANTY_COLUMNS, WARRANTY_COMPANY_COLUMNS]) {
      for (const key of ['site_pw', 'site_id', 'account', 'biz_no', 'memo', 'phone', 'hospital_id']) expect(columns.split(',')).not.toContain(key)
    }
  })

  it('AC-6502.4: 끝나는 날 이른 차례, 같으면 장비 이름 가나다 차례다(DB가 준 차례와 상관없이)', async () => {
    const { client } = fakeClient({
      contacts_equipment: [
        okWith([SOON(E1, CO1, '초음파기', '2026-12-01'), SOON(E2, CO1, '온열기', '2026-11-25'), SOON(E3, CO2, '가습기', '2026-12-01'), SOON(E4, CO1, '나침반', '2026-12-01')]),
      ],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }, { id: CO2, name: '예시설비' }])],
    })
    const items = await listWarrantySoon(client, TODAY)
    expect(items.map((item) => [item.warrantyUntil, item.name])).toEqual([
      ['2026-11-25', '온열기'],
      ['2026-12-01', '가습기'],
      ['2026-12-01', '나침반'],
      ['2026-12-01', '초음파기'],
    ])
  })

  it('AC-6502.4: 같은 업체는 한 번만 묻고, 업체가 안 보이는 장비 줄은 뺀다', async () => {
    const { client, queries } = fakeClient({
      contacts_equipment: [okWith([SOON(E1, CO1, '충격파 기계', TODAY), SOON(E2, CO1, '온열기', TODAY), SOON(E3, CO3, '가습기', TODAY)])],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }])],
    })
    const items = await listWarrantySoon(client, TODAY)
    expect(items.map((item) => item.equipmentId)).toEqual([E2, E1])
    expect(stepsOf(queries, 'contacts_companies')).toEqual([[['select', WARRANTY_COMPANY_COLUMNS], ['in', 'id', [CO1, CO3]]]])
  })

  it('AC-6502.4: 그 기간 장비가 없으면 업체를 묻지 않고 빈 목록이다', async () => {
    const { client, queries } = fakeClient({ contacts_equipment: [okWith([])] })
    await expect(listWarrantySoon(client, TODAY)).resolves.toEqual([])
    expect(queries.map((q) => q.table)).toEqual(['contacts_equipment'])
  })

  it.each<[string, Record<string, unknown>]>([
    ['id 없음', { id: null }],
    ['업체 id 없음', { company_id: '' }],
    ['장비 이름 빈 글자', { name: '' }],
    ['장비 이름 61자', { name: '가'.repeat(61) }],
    ['끝나는 날 없음', { warranty_until: null }],
    ['끝나는 날 모양 틀림', { warranty_until: '2026/11/30' }],
    ['끝나는 날 어제', { warranty_until: '2026-11-20' }],
    ['끝나는 날 31일 뒤', { warranty_until: '2026-12-22' }],
  ])('AC-6502.4: 모양이 틀리거나 기간 밖인 장비 줄(%s)은 뺀다', async (_name, patch) => {
    const { client } = fakeClient({
      contacts_equipment: [okWith([{ ...SOON(E1, CO1, '충격파 기계', TODAY), ...patch }, SOON(E2, CO1, '온열기', LAST)])],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }])],
    })
    expect((await listWarrantySoon(client, TODAY)).map((item) => item.equipmentId)).toEqual([E2])
  })

  it('AC-6502.4: 업체 줄 모양이 틀리면(이름 빈 글자·41자·글자 아님) 그 업체 장비는 뺀다', async () => {
    const { client } = fakeClient({
      contacts_equipment: [okWith([SOON(E1, CO1, '가', TODAY), SOON(E2, CO2, '나', TODAY), SOON(E3, CO3, '다', TODAY), SOON(E4, CO1, '라', TODAY)])],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }, { id: CO2, name: '' }, { id: CO3, name: '가'.repeat(41) }, null])],
    })
    expect((await listWarrantySoon(client, TODAY)).map((item) => item.equipmentId)).toEqual([E1, E4])
  })

  it('AC-6502.4: 장비가 1,000줄이 넘으면 나눠 읽는다', async () => {
    const first = many(1000, (i) => SOON(`e-${i}`, CO1, `장비${i}`, TODAY))
    const { client, queries } = fakeClient({
      contacts_equipment: [okWith(first), okWith([SOON(E1, CO1, '충격파 기계', TODAY)])],
      contacts_companies: [okWith([{ id: CO1, name: '예시메디칼' }])],
    })
    expect(await listWarrantySoon(client, TODAY)).toHaveLength(1001)
    expect(rangesOf(queries, 'contacts_equipment')).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('AC-6502.4: 업체 답이 목록이 아니면 failed다', async () => {
    const { client } = fakeClient({ contacts_equipment: [okWith([SOON(E1, CO1, '충격파 기계', TODAY)])], contacts_companies: [okWith(null)] })
    expect((await caught(() => listWarrantySoon(client, TODAY))).kind).toBe('failed')
  })

  it.each(['', '2026-11-31', '2026/11/21', 'today'])('AC-6502.4: 오늘이 날짜가 아니면(%s) 보내지 않고 failed다', async (today) => {
    const { client, queries } = fakeClient()
    expect((await caught(() => listWarrantySoon(client, today))).kind).toBe('failed')
    sentNothing(queries)
  })

  it('AC-6502.4: 해와 달이 넘어가도 오늘+30일을 한국 날짜로 센다', async () => {
    const { client, queries } = fakeClient({ contacts_equipment: [okWith([])] })
    await listWarrantySoon(client, '2026-12-15')
    expect(queries[0]?.steps.slice(1, 3)).toEqual([
      ['gte', 'warranty_until', '2026-12-15'],
      ['lte', 'warranty_until', '2027-01-14'],
    ])
  })

  it('AC-6502.4: 진짜 클라이언트로도 장비 기간·차례와 업체 id·이름만 묻는다', async () => {
    const fakeFetch = fetchByPath({
      '/rest/v1/contacts_equipment': [[SOON(E1, CO1, '충격파 기계', TODAY), SOON(E2, CO2, '온열기', LAST)]],
      '/rest/v1/contacts_companies': [
        [
          { id: CO1, name: '예시메디칼' },
          { id: CO2, name: '예시설비' },
        ],
      ],
    })
    expect(await listWarrantySoon(realClient(fakeFetch), TODAY)).toHaveLength(2)
    expect(fakeFetch).toHaveBeenCalledTimes(2)
    const equipment = requestAt(fakeFetch, 0)
    expect(equipment.url.pathname).toBe('/rest/v1/contacts_equipment')
    expect(equipment.method).toBe('GET')
    expect(equipment.url.searchParams.get('select')).toBe(WARRANTY_COLUMNS)
    expect(equipment.url.searchParams.getAll('warranty_until')).toEqual([`gte.${TODAY}`, `lte.${LAST}`])
    expect(equipment.url.searchParams.get('order')).toBe('warranty_until.asc,name.asc,id.asc')
    const companies = requestAt(fakeFetch, 1)
    expect(companies.url.pathname).toBe('/rest/v1/contacts_companies')
    expect(companies.method).toBe('GET')
    expect(companies.url.searchParams.get('select')).toBe(WARRANTY_COMPANY_COLUMNS)
    expect(companies.url.searchParams.get('id')).toBe(`in.(${CO1},${CO2})`)
  })
})

// ── 모든 함수 같은 실패 규칙 ─────────────────────────────────
// 오프라인이면 보내지 않고 offline, 응답 없음(status 0)은 offline, 그 밖은 failed. 오류에는 종류만 있다(Supabase 문구·입력값 없음)

type Run = (client: Pick<SupabaseClient, 'from' | 'rpc'>) => Promise<unknown>
const ALL: [string, Run][] = [
  ['loadContacts', (c) => loadContacts(c)],
  ['addCompany', (c) => addCompany(c, COMPANY_FIELDS)],
  ['updateCompany', (c) => updateCompany(c, CO1, COMPANY_FIELDS)],
  ['deleteCompany', (c) => deleteCompany(c, CO1)],
  ['addPerson', (c) => addPerson(c, CO1, PERSON_FIELDS)],
  ['updatePerson', (c) => updatePerson(c, P1, PERSON_FIELDS)],
  ['deletePerson', (c) => deletePerson(c, P1)],
  ['addEquipment', (c) => addEquipment(c, CO1, EQUIPMENT_FIELDS)],
  ['updateEquipment', (c) => updateEquipment(c, E1, EQUIPMENT_FIELDS)],
  ['deleteEquipment', (c) => deleteEquipment(c, E1)],
  ['addRepair', (c) => addRepair(c, E1, REPAIR_FIELDS)],
  ['updateRepair', (c) => updateRepair(c, R1, REPAIR_FIELDS)],
  ['deleteRepair', (c) => deleteRepair(c, R1)],
  ['importContacts', (c) => importContacts(c, PAYLOAD)],
  ['listWarrantySoon', (c) => listWarrantySoon(c, TODAY)],
]

describe.each(ALL)('AC-6502.2 %s 실패', (_name, run) => {
  it('AC-6502.2: 브라우저가 오프라인이면 부르지 않고 offline이다', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const { client, queries } = fakeClient()
    const error = await caught(() => run(client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
    sentNothing(queries)
  })

  it('AC-6502.2: 응답 status가 0이면 offline이고 오류에는 종류만 있다', async () => {
    const error = await caught(() => run(fakeClient([failure(0)]).client))
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it.each([400, 401, 403, 404, 406, 409, 500])('AC-6502.2: 응답 status가 %i이면 failed이고 오류에는 종류만 있다', async (status) => {
    const error = await caught(() => run(fakeClient([failure(status)]).client))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-6502.2: 클라이언트가 던져도 failed이고 원문이 없다', async () => {
    const error = await caught(() => run(throwingClient))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })

  it('AC-6502.2: 진짜 클라이언트에서 연결이 끊기면 offline이고 원문이 없다', async () => {
    // 읽기는 라이브러리가 끊긴 연결을 몇 번 더 해 본다. 기다리지 않게 시계만 가짜로 돌린다
    vi.useFakeTimers()
    const fakeFetch = vi.fn<typeof fetch>(async () => {
      throw new TypeError(SECRET)
    })
    const pending = caught(() => run(realClient(fakeFetch)))
    await vi.runAllTimersAsync()
    const error = await pending
    expect(error.kind).toBe('offline')
    expectNoSecret(error)
  })

  it('AC-6502.2: 진짜 클라이언트에서 DB 제약이 거부하면(23514) failed이고 원문이 없다', async () => {
    const body = JSON.stringify({ message: SECRET, details: SECRET, hint: SECRET, code: '23514' })
    const fakeFetch = vi.fn<typeof fetch>(async () => new Response(body, { status: 400 }))
    const error = await caught(() => run(realClient(fakeFetch)))
    expect(error.kind).toBe('failed')
    expectNoSecret(error)
  })
})

describe('AC-6502.2 ContactsStorageError', () => {
  it('AC-6502.2: 이름은 ContactsStorageError, 글은 contacts storage {종류}만 담는다', () => {
    const error = new ContactsStorageError('offline')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContactsStorageError')
    expect(error.kind).toBe('offline')
    expect(error.message).toBe('contacts storage offline')
    expect(new ContactsStorageError('failed').message).toBe('contacts storage failed')
  })
})
