import { parseDateCell } from '@/lib/analytics/dates'
import type {
  Company,
  ContactBook,
  ContactCategory,
  Equipment,
  ImportCompany,
  ImportEquipment,
  ImportPayload,
  ImportPerson,
} from '@/types/contacts'
import { categoryOf } from './categories'
import { CONTACT_LIMITS, FIELD_LABELS, cleanText, textLength } from './fields'
import { CONTACT_HEADERS, CONTACT_KEYS, EQUIPMENT_HEADERS, EQUIPMENT_KEYS, cellText, type Cell, type ContactKey, type EquipmentKey, type SheetRows } from './sheet'

// 엑셀 줄 → 넣을 계획(design.md '순수 함수' plan.ts). 지금 주소록과 견줘 새로/바뀜/그대로·넣지 않는 줄·넣기 함수 몸통을 만든다.
// 엑셀의 빈 칸은 지금 값을 지우지 않는다(몸통에 넣지 않음). 엑셀로는 아무것도 지우지 않는다

export type ProblemReason =
  | 'category' | 'no-category' | 'no-company' | 'no-person-name' | 'same-person' // 연락처
  | 'unknown-company' | 'no-equipment-name' | 'date' | 'which-equipment' // 장비(no-company도)
  | 'too-long' // 둘 다

/**
 * 넣지 않는 줄 하나. company = 업체 이름(업체 이름이 비면 ''), item = 담당자 까닭이면 담당자 이름 · 장비 줄이면 장비 이름(업체 이름이 비면 '').
 * field = 까닭의 머리글 글자(분류·글자 수·날짜 까닭만, 그 밖 null), value = 분류·날짜 칸 값(그 밖 ''), limit = too-long 한도
 */
export type RowProblem = {
  sheet: 'contacts' | 'equipment'
  row: number
  reason: ProblemReason
  company: string
  item: string
  field: string | null
  value: string
  limit: number | null
}
/** 고친 담당자·장비. fields = 칸 이름(FIELD_LABELS) */
export type ItemChange = { name: string; fields: string[] }
export type CompanyChange = {
  name: string
  status: 'new' | 'changed' | 'same'
  category: ContactCategory
  work: string
  /** 바뀐 업체 칸 이름(머리글 차례). 새 업체는 빈 목록 */
  fields: string[]
  peopleAdded: number
  equipmentAdded: number
  peopleChanged: ItemChange[]
  equipmentChanged: ItemChange[]
}
export type ImportPlan = {
  /** 적힌 줄 수(모든 칸이 빈 줄 뺌) */
  counts: { contacts: number; equipment: number }
  changes: CompanyChange[]
  /** 주소록에 있는데 엑셀(두 시트 어느 줄)에 없는 업체 이름(가나다) */
  untouched: string[]
  /** 시트(연락처 먼저) · 엑셀 줄 번호 차례 */
  problems: RowProblem[]
  payload: ImportPayload
}

// ── 칸 ──────────────────────────────────────────────────

// 업체 글자 칸(업체 이름 빼고, 머리글 차례)과 넣기 함수 몸통 열쇠(DB 칸 이름)
const COMPANY_DETAIL_KEYS = ['phone', 'work', 'address', 'homepage', 'bizNo', 'account', 'siteId', 'sitePw', 'memo'] as const satisfies readonly ContactKey[]
const DB_KEY = {
  phone: 'phone',
  work: 'work',
  address: 'address',
  homepage: 'homepage',
  bizNo: 'biz_no',
  account: 'account',
  siteId: 'site_id',
  sitePw: 'site_pw',
  memo: 'memo',
} as const satisfies Record<(typeof COMPANY_DETAIL_KEYS)[number], keyof ImportCompany>
const PERSON_KEYS: readonly ContactKey[] = ['personName', 'personMobile', 'personRole']

const CONTACT_LIMIT: Partial<Record<ContactKey, number>> = {
  ...CONTACT_LIMITS.company,
  personName: CONTACT_LIMITS.person.name,
  personMobile: CONTACT_LIMITS.person.mobile,
  personRole: CONTACT_LIMITS.person.role,
}
const EQUIPMENT_LIMIT: Partial<Record<EquipmentKey, number>> = {
  company: CONTACT_LIMITS.company.name,
  name: CONTACT_LIMITS.equipment.name,
  serial: CONTACT_LIMITS.equipment.serial,
}
const CONTACT_HEADER = Object.fromEntries(CONTACT_KEYS.map((key, i) => [key, CONTACT_HEADERS[i]])) as Record<ContactKey, string>
const EQUIPMENT_HEADER = Object.fromEntries(EQUIPMENT_KEYS.map((key, i) => [key, EQUIPMENT_HEADERS[i]])) as Record<EquipmentKey, string>

function textsOf<K extends string>(keys: readonly K[], cells: Record<K, Cell>): Record<K, string> {
  return Object.fromEntries(keys.map((key) => [key, cellText(cells[key])])) as Record<K, string>
}
const allBlank = (texts: Record<string, string>) => Object.values(texts).every((text) => text === '')

// 날짜 칸: 비면 null, 엑셀 날짜 숫자·날짜 글자는 'YYYY-MM-DD', 못 읽으면 'bad'
function dateOf(cell: Cell): string | null | 'bad' {
  if (cellText(cell) === '') return null
  if (typeof cell !== 'number' && typeof cell !== 'string') return 'bad'
  return parseDateCell(typeof cell === 'string' ? cellText(cell) : cell) ?? 'bad'
}

// ── 연락처 줄 ────────────────────────────────────────────

type ContactLine = { row: number; text: Record<ContactKey, string>; category: ContactCategory | null }

// 검사 차례(첫 까닭 하나): no-company → too-long(업체 이름) → category → too-long(나머지 칸, 머리글 차례) → no-person-name
function contactProblem(row: number, text: Record<ContactKey, string>): RowProblem | null {
  const base = { sheet: 'contacts', row, company: text.name, item: '', field: null, value: '', limit: null } as const
  if (text.name === '') return { ...base, reason: 'no-company', company: '' }
  const tooLong = (key: ContactKey): RowProblem | null => {
    const limit = CONTACT_LIMIT[key]
    if (limit === undefined || textLength(text[key]) <= limit) return null
    return { ...base, reason: 'too-long', field: CONTACT_HEADER[key], limit, item: PERSON_KEYS.includes(key) ? text.personName : '' }
  }
  const nameTooLong = tooLong('name')
  if (nameTooLong) return nameTooLong
  if (text.category !== '' && categoryOf(text.category) === null) return { ...base, reason: 'category', field: CONTACT_HEADER.category, value: text.category }
  for (const key of CONTACT_KEYS) {
    if (key === 'name') continue
    const problem = tooLong(key)
    if (problem) return problem
  }
  if (text.personName === '' && (text.personMobile !== '' || text.personRole !== '')) return { ...base, reason: 'no-person-name' }
  return null
}

type PersonLine = { name: string; mobile: string; role: string }
type CompanyGroup = {
  name: string
  existing: Company | undefined
  category: ContactCategory | null
  detail: Record<(typeof COMPANY_DETAIL_KEYS)[number], string>
  people: PersonLine[]
}

// ── 장비 줄 ──────────────────────────────────────────────

type EquipmentGroup = { company: string; name: string; serial: string; rows: number[]; boughtOn: string | null; warrantyUntil: string | null }

// 검사 차례: no-company → unknown-company → no-equipment-name → too-long(머리글 차례) → date(들여온 날 → 끝나는 날)
function equipmentProblem(
  row: number,
  text: Record<EquipmentKey, string>,
  dates: Record<'boughtOn' | 'warrantyUntil', string | null | 'bad'>,
  known: ReadonlySet<string>,
): RowProblem | null {
  const base = { sheet: 'equipment', row, company: text.company, item: text.name, field: null, value: '', limit: null } as const
  if (text.company === '') return { ...base, reason: 'no-company', item: '' }
  if (!known.has(text.company)) return { ...base, reason: 'unknown-company' }
  if (text.name === '') return { ...base, reason: 'no-equipment-name' }
  for (const key of EQUIPMENT_KEYS) {
    const limit = EQUIPMENT_LIMIT[key]
    if (limit !== undefined && textLength(text[key]) > limit) return { ...base, reason: 'too-long', field: EQUIPMENT_HEADER[key], limit }
  }
  for (const key of ['boughtOn', 'warrantyUntil'] as const) {
    if (dates[key] === 'bad') return { ...base, reason: 'date', field: EQUIPMENT_HEADER[key], value: text[key] }
  }
  return null
}

/**
 * 장비 맞추기(design.md '장비 맞추기'). 같은 업체·같은 이름 장비(candidates) 가운데 고칠 장비, 없으면 null(새 장비), 못 고르면 'which'.
 * 일련번호 S가 있으면 ① S인 것 ② 일련번호 빈 것 ③ 새로, 비면 ④ 일련번호 빈 것 ⑤ 같은 이름 ⑥ 새로. 둘 이상이면 'which'
 */
function pickEquipment(candidates: readonly Equipment[], serial: string): Equipment | null | 'which' {
  const one = (list: readonly Equipment[]) => (list.length === 1 ? list[0] : list.length > 1 ? 'which' : undefined)
  const blanks = candidates.filter((m) => cleanText(m.serial) === '')
  if (serial !== '') return one(candidates.filter((m) => cleanText(m.serial) === serial)) ?? one(blanks) ?? null
  return one(blanks) ?? one(candidates) ?? null
}

type EquipmentResult = { added: number; changed: ItemChange[] }

// ── 계획 ─────────────────────────────────────────────────

const byName = (a: string, b: string) => a.localeCompare(b, 'ko')
const changedText = (excel: string, now: string) => excel !== '' && excel !== now

export function buildImportPlan(rows: SheetRows, book: ContactBook): ImportPlan {
  const problems: RowProblem[] = []
  const mentioned = new Set<string>() // 엑셀 어느 줄에든 나온 업체 이름(untouched를 가름)
  const companyByName = new Map<string, Company>()
  for (const company of book.companies) {
    const name = cleanText(company.name)
    if (!companyByName.has(name)) companyByName.set(name, company)
  }

  // 1. 연락처 줄 읽기·검사
  let contactCount = 0
  const lines: ContactLine[] = []
  for (const { row, cells } of rows.contacts) {
    const text = textsOf(CONTACT_KEYS, cells)
    if (allBlank(text)) continue
    contactCount++
    if (text.name !== '') mentioned.add(text.name)
    const problem = contactProblem(row, text)
    if (problem) problems.push(problem)
    else lines.push({ row, text, category: text.category === '' ? null : categoryOf(text.category) })
  }

  // 2. 업체 이름으로 묶기(엑셀에 처음 나온 차례) → 같은 담당자 줄 빼기 → 업체 칸 고르기 → 새 업체 분류 확인
  const byCompany = new Map<string, ContactLine[]>()
  for (const line of lines) {
    const list = byCompany.get(line.text.name)
    if (list) list.push(line)
    else byCompany.set(line.text.name, [line])
  }
  const groups: CompanyGroup[] = []
  for (const [name, groupLines] of byCompany) {
    const kept: ContactLine[] = []
    const seen = new Set<string>()
    for (const line of groupLines) {
      const person = line.text.personName
      if (person !== '' && seen.has(person)) {
        problems.push({ sheet: 'contacts', row: line.row, reason: 'same-person', company: name, item: person, field: null, value: '', limit: null })
        continue
      }
      if (person !== '') seen.add(person)
      kept.push(line)
    }
    const existing = companyByName.get(name)
    const category = kept.find((line) => line.category !== null)?.category ?? null
    if (existing === undefined && category === null) {
      for (const line of kept)
        problems.push({ sheet: 'contacts', row: line.row, reason: 'no-category', company: name, item: '', field: CONTACT_HEADER.category, value: '', limit: null })
      continue
    }
    const first = (key: ContactKey) => kept.find((line) => line.text[key] !== '')?.text[key] ?? ''
    groups.push({
      name,
      existing,
      category,
      detail: Object.fromEntries(COMPANY_DETAIL_KEYS.map((key) => [key, first(key)])) as CompanyGroup['detail'],
      people: kept
        .filter((line) => line.text.personName !== '')
        .map((line) => ({ name: line.text.personName, mobile: line.text.personMobile, role: line.text.personRole })),
    })
  }

  // 3. 장비 줄 읽기·검사(알려진 업체 = 넣는 업체 ∪ 주소록 업체) → (업체, 장비 이름, 일련번호)로 묶기
  const known = new Set([...groups.map((g) => g.name), ...companyByName.keys()])
  let equipmentCount = 0
  const equipmentGroups = new Map<string, EquipmentGroup>()
  for (const { row, cells } of rows.equipment) {
    const text = textsOf(EQUIPMENT_KEYS, cells)
    if (allBlank(text)) continue
    equipmentCount++
    if (text.company !== '') mentioned.add(text.company)
    const dates = { boughtOn: dateOf(cells.boughtOn), warrantyUntil: dateOf(cells.warrantyUntil) }
    const problem = equipmentProblem(row, text, dates, known)
    if (problem) {
      problems.push(problem)
      continue
    }
    const key = JSON.stringify([text.company, text.name, text.serial])
    const group = equipmentGroups.get(key)
    const boughtOn = dates.boughtOn === 'bad' ? null : dates.boughtOn
    const warrantyUntil = dates.warrantyUntil === 'bad' ? null : dates.warrantyUntil
    if (group) {
      group.rows.push(row)
      group.boughtOn ??= boughtOn
      group.warrantyUntil ??= warrantyUntil
    } else equipmentGroups.set(key, { company: text.company, name: text.name, serial: text.serial, rows: [row], boughtOn, warrantyUntil })
  }

  // 4. 장비 맞추기(지금 주소록과만 견줌, 먼저 나온 묶음이 장비를 가짐)
  const equipmentPayload: ImportEquipment[] = []
  const equipmentByCompany = new Map<string, EquipmentResult>()
  const claimed = new Set<string>()
  for (const group of equipmentGroups.values()) {
    const owner = companyByName.get(group.company)
    const candidates = owner ? book.equipment.filter((m) => m.companyId === owner.id && cleanText(m.name) === group.name) : []
    let picked = pickEquipment(candidates, group.serial)
    if (picked !== null && picked !== 'which') {
      if (claimed.has(picked.id)) picked = group.serial !== '' ? null : 'which'
      else claimed.add(picked.id)
    }
    if (picked === 'which') {
      for (const row of group.rows)
        problems.push({ sheet: 'equipment', row, reason: 'which-equipment', company: group.company, item: group.name, field: null, value: '', limit: null })
      continue
    }
    const result = equipmentByCompany.get(group.company) ?? { added: 0, changed: [] }
    equipmentByCompany.set(group.company, result)
    if (picked === null) {
      result.added++
      equipmentPayload.push({
        company: group.company,
        name: group.name,
        ...(group.serial !== '' && { serial: group.serial }),
        ...(group.boughtOn !== null && { bought_on: group.boughtOn }),
        ...(group.warrantyUntil !== null && { warranty_until: group.warrantyUntil }),
      })
      continue
    }
    // 빈칸 아닌 엑셀 값이 지금 값과 다른 칸만(일련번호 빈 장비를 고른 ②는 일련번호를 채운다)
    const serial = changedText(group.serial, cleanText(picked.serial)) ? group.serial : null
    const boughtOn = group.boughtOn !== null && group.boughtOn !== picked.boughtOn ? group.boughtOn : null
    const warrantyUntil = group.warrantyUntil !== null && group.warrantyUntil !== picked.warrantyUntil ? group.warrantyUntil : null
    if (serial === null && boughtOn === null && warrantyUntil === null) continue
    result.changed.push({
      name: group.name,
      fields: [
        ...(serial !== null ? [FIELD_LABELS.equipment.serial] : []),
        ...(boughtOn !== null ? [FIELD_LABELS.equipment.boughtOn] : []),
        ...(warrantyUntil !== null ? [FIELD_LABELS.equipment.warrantyUntil] : []),
      ],
    })
    equipmentPayload.push({
      id: picked.id,
      company: group.company,
      name: group.name,
      ...(serial !== null && { serial }),
      ...(boughtOn !== null && { bought_on: boughtOn }),
      ...(warrantyUntil !== null && { warranty_until: warrantyUntil }),
    })
  }

  // 5. 업체마다 견주기 → changes · 몸통
  const changes: CompanyChange[] = []
  const companies: ImportCompany[] = []
  const people: ImportPerson[] = []
  for (const group of groups) {
    const equipment = equipmentByCompany.get(group.name) ?? { added: 0, changed: [] }
    const { existing } = group
    if (existing === undefined) {
      const category = group.category as ContactCategory // 분류 없는 새 업체는 2에서 넣지 않는 줄이 됐다
      const row: ImportCompany = { name: group.name, category }
      for (const key of COMPANY_DETAIL_KEYS) if (group.detail[key] !== '') row[DB_KEY[key]] = group.detail[key]
      companies.push(row)
      for (const p of group.people) people.push(personRow(group.name, p, p))
      changes.push({
        name: group.name,
        status: 'new',
        category,
        work: group.detail.work,
        fields: [],
        peopleAdded: group.people.length,
        equipmentAdded: equipment.added,
        peopleChanged: [],
        equipmentChanged: [],
      })
      continue
    }

    const fields: string[] = []
    const row: ImportCompany = { name: group.name }
    if (group.category !== null && group.category !== existing.category) {
      fields.push(FIELD_LABELS.company.category)
      row.category = group.category
    }
    for (const key of COMPANY_DETAIL_KEYS) {
      if (!changedText(group.detail[key], existing[key])) continue
      fields.push(FIELD_LABELS.company[key])
      row[DB_KEY[key]] = group.detail[key]
    }
    if (fields.length > 0) companies.push(row)

    let peopleAdded = 0
    const peopleChanged: ItemChange[] = []
    for (const p of group.people) {
      const now = book.people.find((x) => x.companyId === existing.id && cleanText(x.name) === p.name)
      if (now === undefined) {
        peopleAdded++
        people.push(personRow(group.name, p, p))
        continue
      }
      const mobile = changedText(p.mobile, now.mobile)
      const role = changedText(p.role, now.role)
      if (!mobile && !role) continue
      peopleChanged.push({
        name: p.name,
        fields: [...(mobile ? [FIELD_LABELS.person.mobile] : []), ...(role ? [FIELD_LABELS.person.role] : [])],
      })
      people.push(personRow(group.name, p, { mobile: mobile ? p.mobile : '', role: role ? p.role : '' }))
    }

    const changed = fields.length > 0 || peopleAdded > 0 || peopleChanged.length > 0 || equipment.added > 0 || equipment.changed.length > 0
    changes.push({
      name: group.name,
      status: changed ? 'changed' : 'same',
      category: group.category ?? existing.category,
      work: group.detail.work || existing.work,
      fields,
      peopleAdded,
      equipmentAdded: equipment.added,
      peopleChanged,
      equipmentChanged: equipment.changed,
    })
  }

  // 장비 시트에만 나온 주소록 업체(changes 끝에)
  const inContacts = new Set(groups.map((g) => g.name))
  for (const [name, equipment] of equipmentByCompany) {
    const existing = companyByName.get(name)
    if (inContacts.has(name) || existing === undefined) continue
    changes.push({
      name,
      status: equipment.added > 0 || equipment.changed.length > 0 ? 'changed' : 'same',
      category: existing.category,
      work: existing.work,
      fields: [],
      peopleAdded: 0,
      equipmentAdded: equipment.added,
      peopleChanged: [],
      equipmentChanged: equipment.changed,
    })
  }

  const untouched = [...companyByName.keys()].filter((name) => !mentioned.has(name)).sort(byName)
  problems.sort((a, b) => (a.sheet === b.sheet ? 0 : a.sheet === 'contacts' ? -1 : 1) || a.row - b.row)
  return {
    counts: { contacts: contactCount, equipment: equipmentCount },
    changes,
    untouched,
    problems,
    payload: { companies, people, equipment: equipmentPayload },
  }
}

// 담당자 몸통 줄: 빈 글자 칸은 넣지 않는다(그 칸은 그대로)
function personRow(company: string, person: PersonLine, values: Pick<PersonLine, 'mobile' | 'role'>): ImportPerson {
  return {
    company,
    name: person.name,
    ...(values.mobile !== '' && { mobile: values.mobile }),
    ...(values.role !== '' && { role: values.role }),
  }
}

/** 넣을 것이 없음(새로 0·바뀜 0) → [넣기]가 꺼진다 */
export function isEmptyPayload(p: ImportPayload): boolean {
  return p.companies.length === 0 && p.people.length === 0 && p.equipment.length === 0
}
