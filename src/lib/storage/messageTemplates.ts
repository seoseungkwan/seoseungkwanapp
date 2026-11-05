import type { SupabaseClient } from '@supabase/supabase-js'
import type { TemplateKind } from '@/lib/patientMessages/defaults'
import type { ErrorCode } from '@/types/errors'

// 문자 문구 읽기·저장(브라우저 → Supabase RLS, ADR-004). 문구의 원본은 서버다(ADR-021).
// 병원·바뀐 시각·새 줄 id는 DB가 채운다. 칸 권한도 kind·name·body·sort_order 넷뿐이다(20261101000300_patients.sql)

export type MessageTemplate = { id: string; kind: TemplateKind; name: string; body: string; sort_order: number }
/** 화면 순서가 곧 sort_order다 */
export type TemplateDraft = { id?: string; kind: TemplateKind; name: string; body: string }
// 보내는 몸통: 칸 권한이 있는 네 칸뿐이다
type TemplateRow = Omit<MessageTemplate, 'id'>

/** 싣는 것은 오류 번호뿐이다. DB가 준 원래 글은 cause에만 둔다(화면에 보이지 않는다) */
export class PatientsStorageError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.name = 'PatientsStorageError'
    this.code = code
  }
}

const TABLE = 'message_templates'
const COLUMNS = 'id, kind, name, body, sort_order'
const NAME_MAX = 30
const BODY_MAX = 2000
// sort_order는 0~99다
const ROWS_MAX = 100

// 저장은 글을 다듬지 않고 그대로 보낸다. 그래서 길이는 DB char_length처럼 코드포인트로, 앞뒤 공백까지 센다
const fits = (text: string, max: number) => text.trim() !== '' && [...text].length <= max

export function checkTemplate(t: TemplateDraft): 'name' | 'body' | 'kind' | null {
  if (!fits(t.name, NAME_MAX)) return 'name'
  if (!fits(t.body, BODY_MAX)) return 'body'
  if (t.kind !== 'injection' && t.kind !== 'followup') return 'kind'
  return null
}

export async function readTemplates(sb: SupabaseClient): Promise<MessageTemplate[]> {
  let result: { data: MessageTemplate[] | null; error: unknown }
  try {
    result = await sb.from(TABLE).select(COLUMNS).order('sort_order').order('kind')
  } catch (cause) {
    throw new PatientsStorageError('E-PATIENTS-TEMPLATES-READ', { cause })
  }
  // 읽기 실패를 빈 목록으로 바꾸지 않는다. 빈 목록이면 화면이 기본 문구를 저장할 수 있게 되어 서버 줄과 겹친다
  if (result.error || result.data === null) {
    throw new PatientsStorageError('E-PATIENTS-TEMPLATES-READ', { cause: result.error })
  }
  return result.data
}

function requireOk(result: { error: unknown }): void {
  if (result.error) throw result.error
}

/**
 * `before`는 늘 성공한 readTemplates 결과여야 한다. 읽기에 실패한 채 기본 문구를 `before = []`로 저장하면 서버 줄이 겹친다.
 *
 * 고치기 → 지우기 → 더하기(요청 하나) 차례로 보낸다. 더하기가 맨 뒤라서, 중간에 실패해도 같은 값으로 [다시 저장]하면 줄이 겹치지 않는다.
 * 예외: 더하기가 서버에 들어갔는데 답만 잃으면 [다시 저장]이 줄을 또 넣는다(id를 보낼 수 없고 유일 제약도 없다). 겹친 줄은 화면에 보이고 지울 수 있다.
 * 쓰기를 마친 뒤 다시 읽기만 실패하면 저장은 된 것이다. 그때는 E-PATIENTS-TEMPLATES-READ를 그대로 던진다
 * (저장 실패로 알리면 [다시 저장]이 새 줄을 또 넣는다).
 */
export async function saveTemplates(
  sb: SupabaseClient,
  before: MessageTemplate[],
  after: TemplateDraft[],
): Promise<MessageTemplate[]> {
  // 줄 하나가 DB 제약에 걸려 앞 줄만 들어가는 일이 없게, 보내기 전에 다 본다
  if (after.length > ROWS_MAX || after.some((t) => checkTemplate(t) !== null)) {
    throw new PatientsStorageError('E-PATIENTS-TEMPLATES-SAVE')
  }

  const beforeById = new Map(before.map((row) => [row.id, row]))
  const added: TemplateRow[] = []
  const changed: { id: string; row: TemplateRow }[] = []
  after.forEach((t, sort_order) => {
    const row: TemplateRow = { kind: t.kind, name: t.name, body: t.body, sort_order }
    const old = t.id === undefined ? undefined : beforeById.get(t.id)
    if (old === undefined) added.push(row)
    else if (old.kind !== row.kind || old.name !== row.name || old.body !== row.body || old.sort_order !== sort_order) {
      changed.push({ id: old.id, row })
    }
  })
  const keptIds = new Set(after.map((t) => t.id))
  const removedIds = before.filter((row) => !keptIds.has(row.id)).map((row) => row.id)

  try {
    for (const { id, row } of changed) requireOk(await sb.from(TABLE).update(row).eq('id', id))
    if (removedIds.length > 0) requireOk(await sb.from(TABLE).delete().in('id', removedIds))
    if (added.length > 0) requireOk(await sb.from(TABLE).insert(added))
  } catch (cause) {
    throw new PatientsStorageError('E-PATIENTS-TEMPLATES-SAVE', { cause })
  }
  return readTemplates(sb)
}
