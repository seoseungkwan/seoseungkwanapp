import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContactCount } from '@/types/patients'
import { PatientsStorageError } from './messageTemplates'

// 연락 남은 건수 올리기·읽기(브라우저 → Supabase RLS, ADR-004). 서버에는 정수 둘만 간다(ADR-021).
// 병원은 DB 기본값, 바뀐 시각은 DB 기본값·트리거가 채운다

export type StoredContactCount = ContactCount & { updated_at: string }

const TABLE = 'contact_counts'
const COUNT_MAX = 100000

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= COUNT_MAX

/** 정확히 두 칸이고 0~100000 정수여야 한다. 다른 칸이 있으면 거절하고, 통과하면 두 칸만 담은 새 객체를 돌려준다 */
export function checkContactCount(row: unknown): ContactCount {
  if (typeof row === 'object' && row !== null && Object.keys(row).length === 2) {
    const { followup_left, injection_left } = row as Record<string, unknown>
    if (isCount(followup_left) && isCount(injection_left)) return { followup_left, injection_left }
  }
  // 받은 값을 싣지 않는다
  throw new PatientsStorageError('E-PATIENTS-COUNTS-SAVE')
}

export async function upsertContactCount(sb: SupabaseClient, row: ContactCount): Promise<void> {
  const counts = checkContactCount(row)
  let error: unknown
  try {
    const result = await sb.from(TABLE).upsert(counts, { onConflict: 'hospital_id' })
    error = result.error
  } catch (cause) {
    throw new PatientsStorageError('E-PATIENTS-COUNTS-SAVE', { cause })
  }
  if (error) throw new PatientsStorageError('E-PATIENTS-COUNTS-SAVE', { cause: error })
}

/** 줄이 없으면 null. 읽기 실패는 null로 바꾸지 않는다(화면이 '자료 없음'과 오류 카드를 나눠 보인다) */
export async function readContactCount(sb: SupabaseClient): Promise<StoredContactCount | null> {
  let result: { data: StoredContactCount | null; error: unknown }
  try {
    result = await sb.from(TABLE).select('followup_left, injection_left, updated_at').maybeSingle<StoredContactCount>()
  } catch (cause) {
    throw new PatientsStorageError('E-PATIENTS-COUNTS-READ', { cause })
  }
  if (result.error) throw new PatientsStorageError('E-PATIENTS-COUNTS-READ', { cause: result.error })
  return result.data
}
