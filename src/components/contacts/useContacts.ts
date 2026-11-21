'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addCompany,
  addEquipment,
  addPerson,
  addRepair,
  deleteCompany as removeCompany,
  deleteEquipment as removeEquipment,
  deletePerson as removePerson,
  deleteRepair as removeRepair,
  importContacts,
  loadContacts,
  updateCompany,
  updateEquipment,
  updatePerson,
  updateRepair,
} from '@/lib/storage/contacts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { CompanyFields, ContactBook, EquipmentFields, ImportPayload, PersonFields, RepairFields } from '@/types/contacts'
import type { SaveResult } from './parts/types'

// 주소록 자료 잇기(spec contacts design.md '화면' useContacts, AC-6505.4·AC-6505.5·AC-6505.7·AC-6505.9·AC-6506.4).
// 화면을 열 때 loadContacts 한 번(네 표, RLS 내 병원) → 손에 든 주소록. 고치면 그 줄 저장 함수를 부르고 답 줄로 손에 든 주소록을 바꾼다
// (지우기는 DB cascade와 같게 딸린 줄도 뺀다). 저장 함수 답은 부품 모양(SaveResult)으로 바꾼다: 'duplicate' → duplicate,
// 'invalid'(부품이 먼저 막아 생기지 않음)·던짐(연결 끊김·실패) → failed. 읽기는 번호를 세어 늦게 온 앞 읽기 답·떠난 뒤 답을 버린다.
// [넣기]는 importContacts 하나(한 트랜잭션) → 되면 주소록을 다시 읽는다(읽는 동안 앞 주소록을 그대로 쥔다)

export type ContactsLoad = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; book: ContactBook }

export type ContactsData = {
  load: ContactsLoad
  /** [다시 읽기]: 읽는 중으로 돌아가 다시 읽는다 */
  reload(): void
  /** id null = 더하기 */
  saveCompany(id: string | null, fields: CompanyFields): Promise<SaveResult>
  deleteCompany(id: string): Promise<SaveResult>
  savePerson(companyId: string, personId: string | null, fields: PersonFields): Promise<SaveResult>
  deletePerson(id: string): Promise<SaveResult>
  saveEquipment(companyId: string, equipmentId: string | null, fields: EquipmentFields): Promise<SaveResult>
  deleteEquipment(id: string): Promise<SaveResult>
  saveRepair(equipmentId: string, repairId: string | null, fields: RepairFields): Promise<SaveResult>
  deleteRepair(id: string): Promise<SaveResult>
  /** 엑셀 넣기. 'failed' = 넣지 못함(주소록 그대로). 넣은 뒤 다시 읽기가 실패하면 'ok'이고 load가 failed가 된다 */
  importBook(payload: ImportPayload): Promise<'ok' | 'failed'>
}

const FAILED: SaveResult = { ok: false, reason: 'failed' }
const DUPLICATE: SaveResult = { ok: false, reason: 'duplicate' }

/** 같은 id 줄이 있으면 바꾸고(차례 그대로) 없으면 끝에 더한다 — 다시 읽기와 겹쳐도 두 줄이 되지 않게 */
function upsert<T extends { id: string }>(rows: readonly T[], row: T): T[] {
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]
}

/** 업체 하나와 딸린 담당자·장비·그 장비 수리 기록을 뺀다(DB on delete cascade와 같다) */
function withoutCompany(book: ContactBook, id: string): ContactBook {
  const gone = new Set(book.equipment.filter((e) => e.companyId === id).map((e) => e.id))
  return {
    companies: book.companies.filter((c) => c.id !== id),
    people: book.people.filter((p) => p.companyId !== id),
    equipment: book.equipment.filter((e) => e.companyId !== id),
    repairs: book.repairs.filter((r) => !gone.has(r.equipmentId)),
  }
}

export function useContacts(): ContactsData {
  const client = useMemo(() => supabaseBrowser(), [])
  const [load, setLoad] = useState<ContactsLoad>({ status: 'loading' })
  // 읽기마다 늘린다. 지금 번호가 아닌 답은 버린다(새로 읽기 시작함·화면을 떠남)
  const flow = useRef(0)

  /** 읽는다(실패는 load = failed). showLoading = 읽는 동안 읽는 중 모양([다시 읽기]) */
  const read = useCallback(
    async (showLoading: boolean): Promise<void> => {
      const mine = ++flow.current
      if (showLoading) setLoad({ status: 'loading' })
      try {
        const book = await loadContacts(client)
        if (mine === flow.current) setLoad({ status: 'ready', book })
      } catch {
        if (mine === flow.current) setLoad({ status: 'failed' })
      }
    },
    [client],
  )

  useEffect(() => {
    void read(false) // 처음 모양이 이미 읽는 중이다
    return () => {
      flow.current += 1 // 떠난 뒤 온 답은 쓰지 않는다
    }
  }, [read])

  const reload = useCallback(() => void read(true), [read])

  /** 손에 든 주소록을 바꾼다(읽은 주소록이 있을 때만) */
  const change = useCallback((next: (book: ContactBook) => ContactBook) => {
    setLoad((prev) => (prev.status === 'ready' ? { status: 'ready', book: next(prev.book) } : prev))
  }, [])

  /** 저장 함수를 부르고 답 줄로 주소록을 바꾼다 */
  const save = useCallback(
    async <T extends { id: string }>(task: () => Promise<T | 'invalid' | 'duplicate'>, put: (book: ContactBook, row: T) => ContactBook): Promise<SaveResult> => {
      let answer: T | 'invalid' | 'duplicate'
      try {
        answer = await task()
      } catch {
        return FAILED
      }
      if (answer === 'duplicate') return DUPLICATE
      if (answer === 'invalid') return FAILED
      const row = answer
      change((book) => put(book, row))
      return { ok: true, id: row.id }
    },
    [change],
  )

  /** 지우기 함수를 부르고 되면 주소록에서 뺀다 */
  const remove = useCallback(
    async (task: () => Promise<void>, drop: (book: ContactBook) => ContactBook): Promise<SaveResult> => {
      try {
        await task()
      } catch {
        return FAILED
      }
      change(drop)
      return { ok: true }
    },
    [change],
  )

  const saveCompany = useCallback(
    (id: string | null, fields: CompanyFields) =>
      save(
        () => (id === null ? addCompany(client, fields) : updateCompany(client, id, fields)),
        (book, row) => ({ ...book, companies: upsert(book.companies, row) }),
      ),
    [client, save],
  )
  const deleteCompany = useCallback((id: string) => remove(() => removeCompany(client, id), (book) => withoutCompany(book, id)), [client, remove])

  const savePerson = useCallback(
    (companyId: string, personId: string | null, fields: PersonFields) =>
      save(
        () => (personId === null ? addPerson(client, companyId, fields) : updatePerson(client, personId, fields)),
        (book, row) => ({ ...book, people: upsert(book.people, row) }),
      ),
    [client, save],
  )
  const deletePerson = useCallback(
    (id: string) => remove(() => removePerson(client, id), (book) => ({ ...book, people: book.people.filter((p) => p.id !== id) })),
    [client, remove],
  )

  const saveEquipment = useCallback(
    (companyId: string, equipmentId: string | null, fields: EquipmentFields) =>
      save(
        () => (equipmentId === null ? addEquipment(client, companyId, fields) : updateEquipment(client, equipmentId, fields)),
        (book, row) => ({ ...book, equipment: upsert(book.equipment, row) }),
      ),
    [client, save],
  )
  const deleteEquipment = useCallback(
    (id: string) =>
      remove(
        () => removeEquipment(client, id),
        (book) => ({ ...book, equipment: book.equipment.filter((e) => e.id !== id), repairs: book.repairs.filter((r) => r.equipmentId !== id) }),
      ),
    [client, remove],
  )

  const saveRepair = useCallback(
    (equipmentId: string, repairId: string | null, fields: RepairFields) =>
      save(
        () => (repairId === null ? addRepair(client, equipmentId, fields) : updateRepair(client, repairId, fields)),
        (book, row) => ({ ...book, repairs: upsert(book.repairs, row) }),
      ),
    [client, save],
  )
  const deleteRepair = useCallback(
    (id: string) => remove(() => removeRepair(client, id), (book) => ({ ...book, repairs: book.repairs.filter((r) => r.id !== id) })),
    [client, remove],
  )

  const importBook = useCallback(
    async (payload: ImportPayload): Promise<'ok' | 'failed'> => {
      try {
        await importContacts(client, payload)
      } catch {
        return 'failed'
      }
      await read(false)
      return 'ok'
    },
    [client, read],
  )

  return { load, reload, saveCompany, deleteCompany, savePerson, deletePerson, saveEquipment, deleteEquipment, saveRepair, deleteRepair, importBook }
}
