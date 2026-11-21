import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, compareYmd, isYmd } from '@/lib/analytics/dates'
import { cleanText, companyProblems, CONTACT_LIMITS, equipmentProblems, personProblems, repairProblems, textLength } from '@/lib/contacts/fields'
import { WARRANTY_SOON_DAYS } from '@/lib/contacts/warranty'
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

// 주소록 서버 저장 (spec contacts REQ-6502, design.md '저장 함수'). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 업체 contacts_companies · 담당자 contacts_people · 장비 contacts_equipment · 수리 기록 contacts_repairs, 넣기 함수 contacts_import
// (migration 20261121000000_contacts.sql). 사이트 비밀번호·계좌도 다른 칸처럼 보낸다(ADR-034) — 오류·로그에는 담지 않는다.
// 보내는 몸통은 정해 둔 칸을 골라 새로 만든다({ ...받은 값 } 금지). id·hospital_id·created_at은 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 글자는 cleanText(앞뒤 빈칸 빼고 NFC)로 맞추고 lib/contacts의 칸 검사(…Problems)를 못 지나면 보내지 않고 'invalid'다.
// 업체·담당자 이름 겹침(23505)만 'duplicate'다(장비·수리 기록에는 겹침 제약이 없다).
// 읽은 줄은 모양을 믿지 않는다: 틀린 줄은 빼고, 넣기·고치기 답 줄이 틀리면 failed다. 읽기는 1,000줄씩 나눠 모두 읽는다.
// 실패는 ContactsStorageError(종류만: offline·failed)다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다

export type ContactsErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class ContactsStorageError extends Error {
  readonly kind: ContactsErrorKind

  constructor(kind: ContactsErrorKind) {
    super(`contacts storage ${kind}`)
    this.name = 'ContactsStorageError'
    this.kind = kind
  }
}

type Client = Pick<SupabaseClient, 'from' | 'rpc'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다
type Reply = { data?: unknown; error: unknown; status: number }

const COMPANIES = 'contacts_companies'
const PEOPLE = 'contacts_people'
const EQUIPMENT = 'contacts_equipment'
const REPAIRS = 'contacts_repairs'
const IMPORT = 'contacts_import'
const COMPANY_COLUMNS = 'id,category,name,phone,work,address,homepage,biz_no,account,site_id,site_pw,memo'
const PERSON_COLUMNS = 'id,company_id,name,mobile,role'
const EQUIPMENT_COLUMNS = 'id,company_id,name,serial,bought_on,warranty_until'
const REPAIR_COLUMNS = 'id,equipment_id,day,content,cost'
const WARRANTY_COLUMNS = 'id,company_id,name,warranty_until' // 대시보드 알림: 사이트 비밀번호·계좌 없음
const WARRANTY_COMPANY_COLUMNS = 'id,name'
const PAGE_ROWS = 1000
const ASC = { ascending: true }
const DUPLICATE = '23505' // unique (hospital_id, name) · unique (company_id, name)

const failed = () => new ContactsStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new ContactsStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (calendar.ts와 같은 모양)
async function ask<R extends Reply>(request: () => PromiseLike<R>): Promise<R> {
  failIfOffline()
  try {
    return await request()
  } catch {
    throw failed()
  }
}

function checked<R extends Reply>(reply: R): R {
  if (reply.error) throw new ContactsStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

const send = async <R extends Reply>(request: () => PromiseLike<R>): Promise<R> => checked(await ask(request))

/** 1,000줄씩 끝까지 읽는다. 쪽 하나라도 실패하거나 목록이 아니면 반쪽 목록 대신 failed */
async function readPages(page: (first: number, last: number) => PromiseLike<Reply>): Promise<unknown[]> {
  const all: unknown[] = []
  for (;;) {
    const { data } = await send(() => page(all.length, all.length + PAGE_ROWS - 1))
    if (!Array.isArray(data)) throw failed()
    all.push(...data)
    if (data.length < PAGE_ROWS) return all
  }
}

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isString = (value: unknown): value is string => typeof value === 'string'
const isDateCell = (value: unknown): value is string | null => value === null || typeof value === 'string' // 날짜 모양은 …Problems가 본다
const isCostCell = (value: unknown): value is number | null => value === null || typeof value === 'number'
const isName = (value: unknown, max: number): value is string => isString(value) && value !== '' && textLength(value) <= max
const clean = (value: unknown): string | null => (isString(value) ? cleanText(value) : null)

function requireId(id: unknown): string {
  if (!isFilled(id)) throw failed()
  return id
}

// ── 줄 읽기(읽기·넣기 답 같은 검사) ─────────────────────────

const COMPANY_TEXT_KEYS = ['name', 'phone', 'work', 'address', 'homepage', 'bizNo', 'account', 'siteId', 'sitePw', 'memo'] as const

function toCompany(row: unknown): Company | null {
  if (!isRecord(row) || !isFilled(row.id)) return null
  const company = {
    id: row.id,
    category: row.category,
    name: row.name,
    phone: row.phone,
    work: row.work,
    address: row.address,
    homepage: row.homepage,
    bizNo: row.biz_no,
    account: row.account,
    siteId: row.site_id,
    sitePw: row.site_pw,
    memo: row.memo,
  }
  if (!COMPANY_TEXT_KEYS.every((key) => isString(company[key]))) return null
  return companyProblems(company as Company).length === 0 ? (company as Company) : null
}

function toPerson(row: unknown): Person | null {
  if (!isRecord(row)) return null
  const { id, company_id: companyId, name, mobile, role } = row
  if (!isFilled(id) || !isFilled(companyId) || !isString(name) || !isString(mobile) || !isString(role)) return null
  const person: Person = { id, companyId, name, mobile, role }
  return personProblems(person).length === 0 ? person : null
}

function toEquipment(row: unknown): Equipment | null {
  if (!isRecord(row)) return null
  const { id, company_id: companyId, name, serial, bought_on: boughtOn, warranty_until: warrantyUntil } = row
  if (!isFilled(id) || !isFilled(companyId) || !isString(name) || !isString(serial) || !isDateCell(boughtOn) || !isDateCell(warrantyUntil)) return null
  const equipment: Equipment = { id, companyId, name, serial, boughtOn, warrantyUntil }
  return equipmentProblems(equipment).length === 0 ? equipment : null
}

function toRepair(row: unknown): Repair | null {
  if (!isRecord(row)) return null
  const { id, equipment_id: equipmentId, day, content, cost } = row
  if (!isFilled(id) || !isFilled(equipmentId) || !isString(day) || !isString(content) || !isCostCell(cost)) return null
  const repair: Repair = { id, equipmentId, day, content, cost }
  return repairProblems(repair).length === 0 ? repair : null
}

// ── 보낼 몸통(정해 둔 칸만 골라 새로 만든다. 칸 검사를 못 지나면 'invalid') ──

function companyBody(fields: CompanyFields): ReadRow | 'invalid' {
  const c = {
    category: fields.category,
    name: clean(fields.name),
    phone: clean(fields.phone),
    work: clean(fields.work),
    address: clean(fields.address),
    homepage: clean(fields.homepage),
    bizNo: clean(fields.bizNo),
    account: clean(fields.account),
    siteId: clean(fields.siteId),
    sitePw: clean(fields.sitePw),
    memo: clean(fields.memo),
  }
  if (!COMPANY_TEXT_KEYS.every((key) => c[key] !== null) || companyProblems(c as CompanyFields).length > 0) return 'invalid'
  return {
    category: c.category,
    name: c.name,
    phone: c.phone,
    work: c.work,
    address: c.address,
    homepage: c.homepage,
    biz_no: c.bizNo,
    account: c.account,
    site_id: c.siteId,
    site_pw: c.sitePw,
    memo: c.memo,
  }
}

function personBody(fields: PersonFields): ReadRow | 'invalid' {
  const name = clean(fields.name)
  const mobile = clean(fields.mobile)
  const role = clean(fields.role)
  if (name === null || mobile === null || role === null || personProblems({ name, mobile, role }).length > 0) return 'invalid'
  return { name, mobile, role }
}

function equipmentBody(fields: EquipmentFields): ReadRow | 'invalid' {
  const name = clean(fields.name)
  const serial = clean(fields.serial)
  const { boughtOn, warrantyUntil } = fields
  if (name === null || serial === null || !isDateCell(boughtOn) || !isDateCell(warrantyUntil)) return 'invalid'
  if (equipmentProblems({ name, serial, boughtOn, warrantyUntil }).length > 0) return 'invalid'
  return { name, serial, bought_on: boughtOn, warranty_until: warrantyUntil }
}

function repairBody(fields: RepairFields): ReadRow | 'invalid' {
  const day = clean(fields.day)
  const content = clean(fields.content)
  const { cost } = fields
  if (day === null || content === null || !isCostCell(cost) || repairProblems({ day, content, cost }).length > 0) return 'invalid'
  return { day, content, cost }
}

/** 넣기·고치기 답 줄 하나를 읽기와 같은 검사로 바꾼다(틀리면 failed) */
function savedRow<T>(reply: Reply, toRow: (row: unknown) => T | null): T {
  const row = toRow(checked(reply).data)
  if (row === null) throw failed()
  return row
}

const saveRow = async <T>(request: () => PromiseLike<Reply>, toRow: (row: unknown) => T | null): Promise<T> => savedRow(await ask(request), toRow)

/** 업체·담당자: 이름 겹침(23505)은 오류가 아니라 'duplicate' */
async function saveNamed<T>(request: () => PromiseLike<Reply>, toRow: (row: unknown) => T | null): Promise<T | 'duplicate'> {
  const reply = await ask(request)
  return isRecord(reply.error) && reply.error.code === DUPLICATE ? 'duplicate' : savedRow(reply, toRow)
}

/** 그 id 줄 하나 지우기. id가 비면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
async function deleteRow(client: Client, table: string, id: string): Promise<void> {
  const target = requireId(id)
  await send(() => client.from(table).delete().eq('id', target))
}

// ── 읽기 ─────────────────────────────────────────────────────

/** 네 표를 모두 읽는다(표마다 created_at·id 차례, 1,000줄씩). 모양이 틀린 줄은 뺀다. 한 표라도 실패하면 반쪽 주소록 대신 오류 */
export async function loadContacts(client: Client): Promise<ContactBook> {
  const read = (table: string, columns: string) =>
    readPages((first, last) => client.from(table).select(columns).order('created_at', ASC).order('id', ASC).range(first, last))
  const [companies, people, equipment, repairs] = await Promise.all([
    read(COMPANIES, COMPANY_COLUMNS),
    read(PEOPLE, PERSON_COLUMNS),
    read(EQUIPMENT, EQUIPMENT_COLUMNS),
    read(REPAIRS, REPAIR_COLUMNS),
  ])
  return {
    companies: companies.flatMap((row) => toCompany(row) ?? []),
    people: people.flatMap((row) => toPerson(row) ?? []),
    equipment: equipment.flatMap((row) => toEquipment(row) ?? []),
    repairs: repairs.flatMap((row) => toRepair(row) ?? []),
  }
}

// ── 업체 ─────────────────────────────────────────────────────

/** 업체 하나 넣기. 같은 이름 업체가 있으면 'duplicate' */
export async function addCompany(client: Client, fields: CompanyFields): Promise<Company | 'invalid' | 'duplicate'> {
  const body = companyBody(fields)
  if (body === 'invalid') return body
  return saveNamed(() => client.from(COMPANIES).insert(body).select(COMPANY_COLUMNS).single<ReadRow>(), toCompany)
}

/** 그 id 업체의 열한 칸을 고친다. 다른 업체와 이름이 겹치면 'duplicate' */
export async function updateCompany(client: Client, id: string, fields: CompanyFields): Promise<Company | 'invalid' | 'duplicate'> {
  const target = requireId(id)
  const body = companyBody(fields)
  if (body === 'invalid') return body
  return saveNamed(() => client.from(COMPANIES).update(body).eq('id', target).select(COMPANY_COLUMNS).single<ReadRow>(), toCompany)
}

/** 업체 지우기(담당자·장비·수리 기록은 DB가 함께 지운다) */
export async function deleteCompany(client: Client, id: string): Promise<void> {
  await deleteRow(client, COMPANIES, id)
}

// ── 담당자 ───────────────────────────────────────────────────

/** 그 업체에 담당자 하나 넣기. 같은 업체에 같은 이름이 있으면 'duplicate' */
export async function addPerson(client: Client, companyId: string, fields: PersonFields): Promise<Person | 'invalid' | 'duplicate'> {
  const company = requireId(companyId)
  const body = personBody(fields)
  if (body === 'invalid') return body
  const row = { company_id: company, ...body }
  return saveNamed(() => client.from(PEOPLE).insert(row).select(PERSON_COLUMNS).single<ReadRow>(), toPerson)
}

/** 그 id 담당자의 이름·휴대폰·맡은 일을 고친다(업체는 바꾸지 않는다) */
export async function updatePerson(client: Client, id: string, fields: PersonFields): Promise<Person | 'invalid' | 'duplicate'> {
  const target = requireId(id)
  const body = personBody(fields)
  if (body === 'invalid') return body
  return saveNamed(() => client.from(PEOPLE).update(body).eq('id', target).select(PERSON_COLUMNS).single<ReadRow>(), toPerson)
}

export async function deletePerson(client: Client, id: string): Promise<void> {
  await deleteRow(client, PEOPLE, id)
}

// ── 장비 ─────────────────────────────────────────────────────

/** 그 업체에 장비 하나 넣기(겹침 제약 없음). 날짜 비움은 null */
export async function addEquipment(client: Client, companyId: string, fields: EquipmentFields): Promise<Equipment | 'invalid'> {
  const company = requireId(companyId)
  const body = equipmentBody(fields)
  if (body === 'invalid') return body
  const row = { company_id: company, ...body }
  return saveRow(() => client.from(EQUIPMENT).insert(row).select(EQUIPMENT_COLUMNS).single<ReadRow>(), toEquipment)
}

/** 그 id 장비의 이름·일련번호·두 날짜를 고친다(업체는 바꾸지 않는다) */
export async function updateEquipment(client: Client, id: string, fields: EquipmentFields): Promise<Equipment | 'invalid'> {
  const target = requireId(id)
  const body = equipmentBody(fields)
  if (body === 'invalid') return body
  return saveRow(
    () => client.from(EQUIPMENT).update(body).eq('id', target).select(EQUIPMENT_COLUMNS).single<ReadRow>(),
    toEquipment,
  )
}

/** 장비 지우기(수리 기록은 DB가 함께 지운다) */
export async function deleteEquipment(client: Client, id: string): Promise<void> {
  await deleteRow(client, EQUIPMENT, id)
}

// ── 수리 기록 ────────────────────────────────────────────────

/** 그 장비에 수리 기록 한 줄 넣기. 비용 비움은 null(모름) */
export async function addRepair(client: Client, equipmentId: string, fields: RepairFields): Promise<Repair | 'invalid'> {
  const equipment = requireId(equipmentId)
  const body = repairBody(fields)
  if (body === 'invalid') return body
  const row = { equipment_id: equipment, ...body }
  return saveRow(() => client.from(REPAIRS).insert(row).select(REPAIR_COLUMNS).single<ReadRow>(), toRepair)
}

/** 그 id 수리 기록의 날짜·내용·비용을 고친다(장비는 바꾸지 않는다) */
export async function updateRepair(client: Client, id: string, fields: RepairFields): Promise<Repair | 'invalid'> {
  const target = requireId(id)
  const body = repairBody(fields)
  if (body === 'invalid') return body
  return saveRow(() => client.from(REPAIRS).update(body).eq('id', target).select(REPAIR_COLUMNS).single<ReadRow>(), toRepair)
}

export async function deleteRepair(client: Client, id: string): Promise<void> {
  await deleteRow(client, REPAIRS, id)
}

// ── 엑셀 넣기 ────────────────────────────────────────────────

/** 넣을 계획의 몸통을 넣기 함수 하나로 보낸다(한 트랜잭션: 틀리면 아무것도 바뀌지 않는다). 몸통은 바꾸지 않고 그대로 넘긴다 */
export async function importContacts(client: Client, payload: ImportPayload): Promise<void> {
  await send(() => client.rpc(IMPORT, { p: payload }))
}

// ── 대시보드 무상 수리 알림 ──────────────────────────────────

type SoonRow = { id: string; companyId: string; name: string; warrantyUntil: string }

function toSoon(row: unknown, from: string, to: string): SoonRow | null {
  if (!isRecord(row)) return null
  const { id, company_id: companyId, name, warranty_until: until } = row
  if (!isFilled(id) || !isFilled(companyId) || !isName(name, CONTACT_LIMITS.equipment.name)) return null
  if (!isString(until) || !isYmd(until) || until < from || until > to) return null
  return { id, companyId, name, warrantyUntil: until }
}

/**
 * 무상 수리 끝나는 날이 today ~ today+30(한국 날짜)인 장비와 그 업체 이름. 끝나는 날 이른 차례, 같으면 장비 이름 가나다.
 * 업체는 id·이름만 읽는다(사이트 비밀번호·계좌 없음). 업체가 안 보이는 장비 줄은 뺀다. today가 날짜가 아니면 보내지 않고 failed
 */
export async function listWarrantySoon(client: Client, today: string): Promise<WarrantyItem[]> {
  if (!isString(today) || !isYmd(today)) throw failed()
  const last = addDays(today, WARRANTY_SOON_DAYS)
  const found = await readPages((first, end) =>
    client
      .from(EQUIPMENT)
      .select(WARRANTY_COLUMNS)
      .gte('warranty_until', today)
      .lte('warranty_until', last)
      .order('warranty_until', ASC)
      .order('name', ASC)
      .order('id', ASC)
      .range(first, end),
  )
  const soon = found.flatMap((row) => toSoon(row, today, last) ?? [])
  if (soon.length === 0) return []
  const ids = [...new Set(soon.map((item) => item.companyId))]
  const { data } = await send(() => client.from(COMPANIES).select(WARRANTY_COMPANY_COLUMNS).in('id', ids))
  if (!Array.isArray(data)) throw failed()
  const names = new Map<string, string>()
  for (const row of data) {
    if (isRecord(row) && isFilled(row.id) && isName(row.name, CONTACT_LIMITS.company.name)) names.set(row.id, row.name)
  }
  return soon
    .flatMap((item) => {
      const companyName = names.get(item.companyId)
      if (companyName === undefined) return []
      return [{ equipmentId: item.id, companyId: item.companyId, companyName, name: item.name, warrantyUntil: item.warrantyUntil }]
    })
    .sort((a, b) => compareYmd(a.warrantyUntil, b.warrantyUntil) || a.name.localeCompare(b.name, 'ko'))
}
