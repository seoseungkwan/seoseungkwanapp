// 주소록(specs/contacts design.md '모양'). 환자 자료가 없는 업체·담당자·장비·수리 기록이다.
// 날짜는 모두 한국 날짜 글자 'YYYY-MM-DD'. 줄 id는 DB uuid 글자

/** 분류 넷: 거래처 · 수리·관리 · 기관·보험 · 기타(lib/contacts/categories.ts가 글자와 차례를 둔다) */
export type ContactCategory = 'supplier' | 'repair' | 'agency' | 'other'

export type CompanyFields = {
  category: ContactCategory
  name: string
  phone: string
  work: string
  address: string
  homepage: string
  bizNo: string
  account: string
  siteId: string
  sitePw: string
  memo: string
}
export type Company = CompanyFields & { id: string }

export type PersonFields = { name: string; mobile: string; role: string }
export type Person = PersonFields & { id: string; companyId: string }

export type EquipmentFields = { name: string; serial: string; boughtOn: string | null; warrantyUntil: string | null }
export type Equipment = EquipmentFields & { id: string; companyId: string }

/** cost는 원 정수, 비움 = null(모름) */
export type RepairFields = { day: string; content: string; cost: number | null }
export type Repair = RepairFields & { id: string; equipmentId: string }

/** 줄마다 created_at, id 차례 */
export type ContactBook = { companies: Company[]; people: Person[]; equipment: Equipment[]; repairs: Repair[] }

// ── 넣기 함수 contacts_import(p) 몸통(키 = DB 칸 이름). 선택 키가 없으면 그 칸은 그대로다 ──
export type ImportCompany = {
  name: string
  category?: ContactCategory
  phone?: string
  work?: string
  address?: string
  homepage?: string
  biz_no?: string
  account?: string
  site_id?: string
  site_pw?: string
  memo?: string
}
export type ImportPerson = { company: string; name: string; mobile?: string; role?: string }
/** id는 고칠 때만(계획이 고른 주소록 장비) */
export type ImportEquipment = { id?: string; company: string; name: string; serial?: string; bought_on?: string; warranty_until?: string }
export type ImportPayload = { companies: ImportCompany[]; people: ImportPerson[]; equipment: ImportEquipment[] }

/** 대시보드 무상 수리 알림 한 줄(listWarrantySoon) */
export type WarrantyItem = { equipmentId: string; companyId: string; companyName: string; name: string; warrantyUntil: string }
