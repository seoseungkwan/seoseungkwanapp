import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeskAddResult, DeskMember } from '@/types/desk'

// 데스크 계정 저장 (specs/desk-feedback REQ-6304 AC-6304.1, design.md '③ 설정 데스크 계정 칸', ADR-031). 브라우저 → Supabase 함수, 권한은 함수가 막는다(ADR-004).
// 표 hospital_members에는 사용자 표 권한이 없어 정의자 함수 셋(desk_members·add_desk_member·remove_desk_member, migration 20261118100000_desk_accounts.sql)만 부른다.
// 어느 병원 줄인지는 함수가 my_hospital_id()로 고른다(원장이 아니면 빈 목록·거절·아무것도 안 함).
// 읽은 줄은 모양을 믿지 않는다: 정해 둔 네 칸만 골라 새로 만들고 틀린 줄은 뺀다. 더하기 답이 다섯 글자 가운데 하나가 아니면 failed다.
// 실패는 DeskStorageError(종류만: offline·failed)다. Supabase 문구·메일은 화면까지 가지 않게 넣지 않는다

export type DeskErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class DeskStorageError extends Error {
  readonly kind: DeskErrorKind

  constructor(kind: DeskErrorKind) {
    super(`desk storage ${kind}`)
    this.name = 'DeskStorageError'
    this.kind = kind
  }
}

type Client = Pick<SupabaseClient, 'rpc'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다

const LIST = 'desk_members'
const ADD = 'add_desk_member'
const REMOVE = 'remove_desk_member'
const ADD_RESULTS: readonly DeskAddResult[] = ['added', 'bad', 'taken', 'used', 'limit']
const EMAIL_MAX = 254
// DB 검사와 같은 모양: 빈칸·@ 없는 앞 @ 빈칸·@ 없는 뒤 . 빈칸·@ 없는 끝
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const failed = () => new DeskStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new DeskStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (sunap.ts와 같은 모양)
async function send<Reply extends { error: unknown; status: number }>(request: () => PromiseLike<Reply>): Promise<Reply> {
  failIfOffline()
  let reply: Reply
  try {
    reply = await request()
  } catch {
    throw failed()
  }
  if (reply.error) throw new DeskStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isTime = (value: unknown): value is string => isFilled(value) && Number.isFinite(Date.parse(value))
const isAddResult = (value: unknown): value is DeskAddResult => (ADD_RESULTS as readonly unknown[]).includes(value)

/** 앞뒤 빈칸을 빼고 소문자로 바꾼 메일. 메일 모양이 아니거나 254자(코드포인트, DB char_length와 같게)를 넘으면 null */
export function deskEmail(text: string): string | null {
  const email = text.trim().toLowerCase()
  if ([...email].length > EMAIL_MAX || !EMAIL_SHAPE.test(email)) return null
  return email
}

function toMember(row: unknown): DeskMember | null {
  if (!isRecord(row)) return null
  const { id, email, created_at: addedAt, signed_in_at: signedInAt } = row
  if (!isFilled(id) || !isFilled(email) || !isTime(addedAt)) return null
  if (signedInAt !== null && !isTime(signedInAt)) return null
  return { id, email, addedAt, signedInAt }
}

/** 내 병원 데스크 계정들, 더한 차례. 틀린 줄은 뺀다. 답이 목록이 아니면 빈 목록으로 보이지 않고 failed */
export async function listDeskMembers(client: Client): Promise<DeskMember[]> {
  const { data } = await send(() => client.rpc(LIST))
  if (!Array.isArray(data)) throw failed()
  return data.flatMap((row: unknown) => toMember(row) ?? [])
}

/** 데스크 메일 하나를 더한다. 메일 모양이 아니면 보내지 않고 'bad'. 함수 답이 다섯 글자 가운데 하나가 아니면 failed */
export async function addDeskMember(client: Client, text: string): Promise<DeskAddResult> {
  const email = deskEmail(text)
  if (email === null) return 'bad'
  const { data } = await send(() => client.rpc(ADD, { p_email: email }))
  if (!isAddResult(data)) throw failed()
  return data
}

/** 그 줄 하나를 뺀다. id가 빈 글자면 보내지 않고 failed */
export async function removeDeskMember(client: Client, id: string): Promise<void> {
  if (!isFilled(id)) throw failed()
  await send(() => client.rpc(REMOVE, { p_id: id }))
}
