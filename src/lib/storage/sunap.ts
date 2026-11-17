import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd } from '@/lib/analytics/dates'
import { kindsFromLegacy, readKinds } from '@/lib/sunap/kinds'
import { privacyProblem } from '@/lib/worklog/notes'
import { DEFAULT_RSV_KINDS, SUNAP_TOTAL_KEYS, type RsvKindDef, type RsvWords, type SunapSettings, type SunapTotals } from '@/types/sunap'

// 수납일지 서버 저장 (spec sunap-ilji REQ-4903 AC-4903.4, design.md '저장 함수'). 브라우저 → Supabase, 권한은 RLS가 막는다(ADR-004).
// 표: 마감한 날 합계 숫자 sunap_days · 그날 지출 sunap_spends · 병원 설정 sunap_settings (migration 20261116000000_sunap.sql).
// 환자 줄(이름·차트·고친 칸·비고)은 여기로 오지 않는다. 마감 때 숫자 24칸만 보낸다.
// 보내는 몸통은 정해 둔 열쇠를 골라 새로 만든다({ ...받은 값 } 금지). hospital_id·id·created_at은 DB가 정하고 어느 병원 줄인지는 RLS가 고른다.
// 받은 값이 틀리면(날짜 모양·숫자 범위·지출 종류 등) 보내지 않고 failed다. 지출 내용이 개인정보 모양이면 보내지 않고 'blocked'를 돌려준다.
// 읽은 줄은 모양을 믿지 않는다: 틀린 마감 줄은 없는 것, 틀린 지출 줄은 빼고, 틀린 설정 칸은 기본값이다.
// 실패는 SunapStorageError(종류만: offline·failed)다. Supabase 문구·입력값은 화면까지 가지 않게 넣지 않는다

export type SunapErrorKind = 'offline' | 'failed'

/** 오류에는 종류만 담는다 */
export class SunapStorageError extends Error {
  readonly kind: SunapErrorKind

  constructor(kind: SunapErrorKind) {
    super(`sunap storage ${kind}`)
    this.name = 'SunapStorageError'
    this.kind = kind
  }
}

/** 마감한 날 한 줄. day = YYYY-MM-DD, closedAt = 서버에 적힌 마감 시각(ISO 글자), late = 처음 마감이 그날 뒤였음 */
export type SunapDay = { day: string; closedAt: string; late: boolean; totals: SunapTotals }

// 지출 종류: 현금·카드·기타·현금(주차지원). DB 제약과 같은 넷
export const SPEND_KINDS = ['cash', 'card', 'etc', 'parking'] as const
export type SpendKind = (typeof SPEND_KINDS)[number]
export type SpendInput = { kind: SpendKind; memo: string; amount: number }
export type SunapSpend = SpendInput & { id: string }
export const SPEND_MEMO_MAX = 50
export const SPEND_AMOUNT_MAX = 100_000_000
export const SUNAP_TOTAL_MAX = 1_000_000_000

type Client = Pick<SupabaseClient, 'from'>
type ReadRow = Record<string, unknown> // 읽은 줄은 모양을 믿지 않고 칸마다 확인한다

const DAYS = 'sunap_days'
const SPENDS = 'sunap_spends'
const SETTINGS = 'sunap_settings'
const DAY_COLUMNS = ['work_date', 'closed_at', 'late', ...SUNAP_TOTAL_KEYS].join(',')
const SPEND_COLUMNS = 'id,kind,memo,amount'
const SETTINGS_COLUMNS = 'block_group,pt_group,rsv_words'
const WORD_KEYS = ['inj', 'visit', 'etc'] as const

const failed = () => new SunapStorageError('failed')

function failIfOffline(): void {
  if (globalThis.navigator?.onLine === false) throw new SunapStorageError('offline')
}

// postgrest-js는 연결 실패를 던지지 않고 status 0으로 돌려준다(응답 없음 = offline).
// 그래도 던져지면 원문이 화면으로 새지 않게 failed로 바꾼다 (worklogDays.ts와 같은 모양)
async function send<Reply extends { error: unknown; status: number }>(request: () => PromiseLike<Reply>): Promise<Reply> {
  failIfOffline()
  let reply: Reply
  try {
    reply = await request()
  } catch {
    throw failed()
  }
  if (reply.error) throw new SunapStorageError(reply.status === 0 ? 'offline' : 'failed')
  return reply
}

const isRecord = (value: unknown): value is ReadRow => typeof value === 'object' && value !== null && !Array.isArray(value)
const isDay = (value: unknown): value is string => typeof value === 'string' && isYmd(value)
const isFilled = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isWhole = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max

function requireDay(ymd: unknown): string {
  if (!isDay(ymd)) throw failed()
  return ymd
}

// ── 마감 (sunap_days) ───────────────────────────────────────

/** 24칸을 SUNAP_TOTAL_KEYS 차례로 골라 새로 만든다. 하나라도 0~10억 정수가 아니면 null */
function pickTotals(source: unknown): SunapTotals | null {
  if (!isRecord(source)) return null
  const totals = {} as SunapTotals
  for (const key of SUNAP_TOTAL_KEYS) {
    const value = source[key]
    if (!isWhole(value, SUNAP_TOTAL_MAX)) return null
    totals[key] = value
  }
  return totals
}

function toSunapDay(row: unknown): SunapDay | null {
  if (!isRecord(row)) return null
  const { work_date: day, closed_at: closedAt, late } = row
  const totals = pickTotals(row)
  if (!isDay(day) || !isFilled(closedAt) || typeof late !== 'boolean' || totals === null) return null
  return { day, closedAt, late, totals }
}

/** 마감: 그날 줄 하나를 덮어쓴다(onConflict hospital_id,work_date). closed_at = 지금. 받은 숫자가 틀리면 보내지 않고 failed */
export async function closeSunapDay(client: Client, ymd: string, totals: SunapTotals, late: boolean): Promise<void> {
  const day = requireDay(ymd)
  const picked = pickTotals(totals)
  if (picked === null || typeof late !== 'boolean') throw failed()
  const row = { work_date: day, closed_at: new Date().toISOString(), late, ...picked }
  await send(() => client.from(DAYS).upsert(row, { onConflict: 'hospital_id,work_date' }))
}

/** 마감 풀기: 그날 줄을 지운다. 날짜 모양이 아니면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
export async function reopenSunapDay(client: Client, ymd: string): Promise<void> {
  const day = requireDay(ymd)
  await send(() => client.from(DAYS).delete().eq('work_date', day))
}

/** 그날 마감 줄. 줄이 없거나 모양이 틀리면 null(마감 전으로 본다) */
export async function loadSunapDay(client: Client, ymd: string): Promise<SunapDay | null> {
  const day = requireDay(ymd)
  const { data } = await send(() => client.from(DAYS).select(DAY_COLUMNS).eq('work_date', day).maybeSingle<ReadRow>())
  return toSunapDay(data)
}

/** from~to(둘 다 포함) 마감한 날들, 날짜 차례. 모양이 틀린 줄은 뺀다. 답이 목록이 아니면 빈 목록으로 보이지 않고 failed */
export async function listSunapDays(client: Client, from: string, to: string): Promise<SunapDay[]> {
  const start = requireDay(from)
  const end = requireDay(to)
  if (start > end) throw failed()
  const { data } = await send(() =>
    client.from(DAYS).select(DAY_COLUMNS).gte('work_date', start).lte('work_date', end).order('work_date', { ascending: true }),
  )
  if (!Array.isArray(data)) throw failed()
  return data.flatMap((row: unknown) => toSunapDay(row) ?? [])
}

// ── 지출 (sunap_spends) ─────────────────────────────────────

const isKind = (value: unknown): value is SpendKind => (SPEND_KINDS as readonly unknown[]).includes(value)
// DB char_length처럼 코드포인트로 센다
const isMemo = (value: unknown): value is string =>
  typeof value === 'string' && value !== '' && [...value].length <= SPEND_MEMO_MAX
const isAmount = (value: unknown): value is number => isWhole(value, SPEND_AMOUNT_MAX)

function toSpend(row: unknown): SunapSpend | null {
  if (!isRecord(row)) return null
  const { id, kind, memo, amount } = row
  if (!isFilled(id) || !isKind(kind) || !isMemo(memo) || !isAmount(amount)) return null
  return { id, kind, memo, amount }
}

type SpendBody = Partial<SpendInput>

/** 받은 칸만 골라 검사한다. 내용은 앞뒤 빈칸을 뺀다. 개인정보 모양이면 'blocked', 틀린 값이면 failed */
function spendBody(input: Partial<SpendInput>): SpendBody | 'blocked' {
  const body: SpendBody = {}
  if (input.memo !== undefined) {
    if (typeof input.memo !== 'string') throw failed()
    const memo = input.memo.trim()
    if (privacyProblem(memo)) return 'blocked'
    if (!isMemo(memo)) throw failed()
    body.memo = memo
  }
  if (input.kind !== undefined) {
    if (!isKind(input.kind)) throw failed()
    body.kind = input.kind
  }
  if (input.amount !== undefined) {
    if (!isAmount(input.amount)) throw failed()
    body.amount = input.amount
  }
  return body
}

function savedSpend(data: unknown): SunapSpend {
  const spend = toSpend(data)
  if (spend === null) throw failed()
  return spend
}

/** 그날 지출, 넣은 차례. 모양이 틀린 줄은 뺀다 */
export async function listSpends(client: Client, ymd: string): Promise<SunapSpend[]> {
  const day = requireDay(ymd)
  const { data } = await send(() =>
    client
      .from(SPENDS)
      .select(SPEND_COLUMNS)
      .eq('work_date', day)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  )
  if (!Array.isArray(data)) throw failed()
  return data.flatMap((row: unknown) => toSpend(row) ?? [])
}

/** 지출 한 줄 넣기. DB가 준 줄(새 id)을 돌려준다. 내용이 개인정보 모양이면 보내지 않고 'blocked' */
export async function addSpend(client: Client, ymd: string, spend: SpendInput): Promise<SunapSpend | 'blocked'> {
  const day = requireDay(ymd)
  const body = spendBody({ kind: spend.kind, memo: spend.memo, amount: spend.amount })
  if (body === 'blocked') return body
  if (body.kind === undefined || body.memo === undefined || body.amount === undefined) throw failed()
  const row = { work_date: day, kind: body.kind, memo: body.memo, amount: body.amount }
  const { data } = await send(() => client.from(SPENDS).insert(row).select(SPEND_COLUMNS).single<ReadRow>())
  return savedSpend(data)
}

/** 받은 칸(종류·내용·금액)만 그 id 줄에 고친다. 고친 줄을 돌려준다. 줄이 없으면(남의 줄·지운 줄) failed. 고칠 칸이 없으면 보내지 않고 failed */
export async function updateSpend(client: Client, id: string, patch: Partial<SpendInput>): Promise<SunapSpend | 'blocked'> {
  if (!isFilled(id)) throw failed()
  const body = spendBody({ kind: patch.kind, memo: patch.memo, amount: patch.amount })
  if (body === 'blocked') return body
  if (Object.keys(body).length === 0) throw failed()
  const { data } = await send(() => client.from(SPENDS).update(body).eq('id', id).select(SPEND_COLUMNS).single<ReadRow>())
  return savedSpend(data)
}

/** 지출 한 줄 지우기. 없는 줄을 지워도 오류가 아니다. id가 비면 보내지 않는다(조건 없는 지우기를 보내지 않으려고) */
export async function deleteSpend(client: Client, id: string): Promise<void> {
  if (!isFilled(id)) throw failed()
  await send(() => client.from(SPENDS).delete().eq('id', id))
}

// ── 설정 (sunap_settings) ───────────────────────────────────

const isWordList = (value: unknown): value is string[] => Array.isArray(value) && value.every((word) => typeof word === 'string')
const isGroup = (value: unknown): value is string | null => value === null || isFilled(value)

const defaultKinds = (): RsvKindDef[] => DEFAULT_RSV_KINDS.map((kind) => ({ ...kind, words: [...kind.words] }))

/** 옛 모양(sunap-ilji) 세 목록을 골라 새로 만든다. 하나라도 글자 목록이 아니면 null */
function pickWords(source: unknown): RsvWords | null {
  if (!isRecord(source)) return null
  const words = {} as RsvWords
  for (const key of WORD_KEYS) {
    const list = source[key]
    if (!isWordList(list)) return null
    words[key] = [...list]
  }
  return words
}

/**
 * rsv_words 칸 → 다음 예약 종류 목록(spec sunap-kinds AC-5501.1). 맞는 kinds가 있으면 그것, 없고 옛 모양 {inj, visit, etc}
 * 말 목록이면 기본 이름·예약률에 그 말, 둘 다 아니면 기본값. 언제나 받은 줄과 같이 쓰지 않는 새 값
 */
function kindsOf(rsvWords: unknown): RsvKindDef[] {
  const kinds = isRecord(rsvWords) ? readKinds(rsvWords.kinds) : null
  if (kinds !== null) return kinds
  const legacy = pickWords(rsvWords)
  return legacy !== null ? kindsFromLegacy(legacy) : defaultKinds()
}

/** 병원 설정. 줄이 없으면 기본값(묶음 안 고름 · 기본 종류 목록). 칸 모양이 틀리면 그 칸만 기본값 */
export async function loadSunapSettings(client: Client): Promise<SunapSettings> {
  const { data } = await send(() => client.from(SETTINGS).select(SETTINGS_COLUMNS).maybeSingle<ReadRow>())
  const row = isRecord(data) ? data : {}
  const groupOf = (value: unknown) => (isFilled(value) ? value : null)
  return { blockGroup: groupOf(row.block_group), ptGroup: groupOf(row.pt_group), kinds: kindsOf(row.rsv_words) }
}

/**
 * 설정 세 칸을 내 병원 줄 하나에 덮어쓴다(onConflict hospital_id). 종류 목록은 rsv_words = {kinds}로 보낸다(AC-5501.1).
 * 묶음 모양이 틀리거나 종류 목록이 readKinds(AC-5501.2)에 맞지 않으면 보내지 않고 failed
 */
export async function saveSunapSettings(client: Client, settings: SunapSettings): Promise<void> {
  const kinds = readKinds(settings.kinds)
  if (!isGroup(settings.blockGroup) || !isGroup(settings.ptGroup) || kinds === null) throw failed()
  const row = { block_group: settings.blockGroup, pt_group: settings.ptGroup, rsv_words: { kinds } }
  await send(() => client.from(SETTINGS).upsert(row, { onConflict: 'hospital_id' }))
}
