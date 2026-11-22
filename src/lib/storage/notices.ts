import { isYmd, weekdayOf, weekRange } from '@/lib/analytics/dates'
import { checkMemo, type TextCheck } from '@/lib/notices/askCheck'
import { SOURCES } from '@/lib/notices/view'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type {
  Attachment,
  FillProgress,
  GroupPost,
  NoticeFilter,
  NoticeKind,
  NoticeMark,
  NoticePage,
  NoticeSource,
  NoticeState,
  NoticeSummary,
  NoticeView,
  NoticeWeek,
  ReadMode,
  RuleAlert,
  RuleHit,
  SourceError,
  SourceView,
  WeekItem,
  WeekTop,
} from '@/types/notices'
import { ruleTallies } from './ruleChanges'

// 고시·공지 화면의 읽기·쓰기(specs/notices REQ-7418 · AC-7424.7, design 3절·15절). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 공용 글(notices·notice_posts·notice_sources·notice_weeks)은 승인된 원장만 읽고, 내 병원 표시(notice_marks)·낱말(notice_keywords)은
// 내 병원 줄만 RLS가 고른다. hospital_id는 보내지 않는다(DB 기본값 my_hospital_id()).
// 읽은 줄은 모양을 믿지 않는다: 정해 둔 칸만 골라 새로 만들고 꼭 있어야 할 칸이 틀린 줄은 뺀다(본문·붙임 글자는 받지 않는다).
// 실패는 읽기 'failed', 쓰기 false 하나뿐이다. Supabase 오류 글은 버리고 밖으로 내지 않는다(console도 없음)

/** 읽음·낱말이 바뀌었다고 창에 알리는 이름. 탭 숫자(NoticeBadge)·목록·낱말 칸이 듣고 다시 읽는다 */
export const NOTICES_CHANGED = 'notices:changed'

/** 메모를 보내지 않은 이유(checkMemo가 ok가 아님) */
export type MemoBlocked = Exclude<TextCheck, 'ok'>

const LIST = 'notice_list'
const SEARCH = 'notice_search'
const UNREAD = 'notice_unread_count'
const ALERTS = 'notice_rule_alerts'
const ASK_LEFT = 'notice_ask_left'
const NOTICES = 'notices'
const MARKS = 'notice_marks'
const SOURCE_TABLE = 'notice_sources'
const WEEKS = 'notice_weeks'
const KEYWORDS = 'notice_keywords'

const PAGE_SIZE = 50
const MARK_CONFLICT = { onConflict: 'hospital_id,notice_id' }
const SOURCE_COLUMNS = 'source, state, error_code, checked_at, last_ok_at, stopped_since, backfill_done'
const WEEK_COLUMNS = 'week_start, top3, created_at'
const WEEK_NOTICE_COLUMNS = 'id, title, kind, posted_on, related, summary, state, notice_posts(source)'
const WEEK_LIMIT = 500 // 한 주 글 수 상한(넉넉히)
const TOP_MAX = 3

const KINDS: readonly NoticeKind[] = ['gosi', 'notice', 'interp', 'guide', 'case']
const STATES: readonly NoticeState[] = ['wait', 'batch', 'done', 'failed']
const READ_MODES: readonly ReadMode[] = ['full', 'text', 'body']
const SOURCE_STATES: readonly SourceView['state'][] = ['ok', 'stopped']
const SOURCE_ERRORS: readonly SourceError[] = ['blocked', 'http', 'shape']
// 묶음 안 출처 글 차례(notice_list의 posts 차례·제목 차례와 같다)
const POST_ORDER: readonly NoticeSource[] = ['mohw_rss', 'hira_notice', 'hira_crtr']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Rec = Record<string, unknown>

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFilled = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const textOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)
const isUuid = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)
const nowIso = () => new Date().toISOString()

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTICES_CHANGED))
}

// ── 줄 모양 ──────────────────────────────────────────────

/** 요약 네 칸이 글이어야 한다. 요약 안 related가 없으면 줄의 related, amends는 글만 */
function toSummary(v: unknown, rowRelated: unknown): NoticeSummary | null {
  if (!isRecord(v)) return null
  const { what, when, who, forUs } = v
  if (typeof what !== 'string' || typeof when !== 'string' || typeof who !== 'string' || typeof forUs !== 'string') return null
  const related = typeof v.related === 'boolean' ? v.related : rowRelated === true
  const amends = Array.isArray(v.amends) ? v.amends.filter((a): a is string => typeof a === 'string') : []
  return { related, what, when, who, forUs, amends }
}

function toAttachment(v: unknown): Attachment | null {
  if (!isRecord(v) || !isFilled(v.name) || !isFilled(v.url)) return null
  return { name: v.name, url: v.url }
}

function toPost(v: unknown): GroupPost | null {
  if (!isRecord(v) || !oneOf(SOURCES, v.source) || !isFilled(v.title) || !isFilled(v.url) || !isFilled(v.postedOn)) return null
  const attachments = Array.isArray(v.attachments) ? v.attachments.flatMap((a: unknown) => toAttachment(a) ?? []) : []
  return { source: v.source, title: v.title, url: v.url, postedOn: v.postedOn, attachments }
}

function toRuleHit(v: unknown): RuleHit | null {
  if (!isRecord(v) || !isFilled(v.id) || !isFilled(v.title)) return null
  return { id: v.id, title: v.title }
}

/** 내 표시가 없거나 칸이 틀리면 그 칸은 기본값(읽지 않음·별표 없음·빈 메모) */
function toMark(v: unknown): NoticeMark {
  const m = isRecord(v) ? v : {}
  return {
    readAt: textOrNull(m.readAt),
    starred: m.starred === true,
    memo: typeof m.memo === 'string' ? m.memo : '',
    memoAt: textOrNull(m.memoAt),
    rulesCheckedAt: textOrNull(m.rulesCheckedAt),
  }
}

const listOf = <T>(v: unknown, pick: (item: unknown) => T | null): T[] => (Array.isArray(v) ? v.flatMap((item: unknown) => pick(item) ?? []) : [])

/** notice_list 줄 하나. id·제목·종류·날짜·상태·안 읽음이 틀리면 null(그 줄은 뺀다), 안쪽 칸이 틀리면 그 칸만 빈 값 */
function toView(row: unknown): NoticeView | null {
  if (!isRecord(row)) return null
  const { id, title, kind, postedOn, state, unread } = row
  if (!isFilled(id) || !isFilled(title) || !oneOf(KINDS, kind) || !isFilled(postedOn) || !oneOf(STATES, state) || typeof unread !== 'boolean') return null
  const related = typeof row.related === 'boolean' ? row.related : null
  return {
    id,
    title,
    kind,
    postedOn,
    noticeNo: textOrNull(row.noticeNo),
    related,
    summary: toSummary(row.summary, related),
    readMode: oneOf(READ_MODES, row.readMode) ? row.readMode : null,
    state,
    ruleHits: listOf(row.ruleHits, toRuleHit),
    posts: listOf(row.posts, toPost),
    mark: toMark(row.mark),
    unread,
    keywords: listOf(row.keywords, (w) => (isFilled(w) ? w : null)),
  }
}

/** notice_list 답 { total, unread, rows }. 수가 0 이상 정수가 아니거나 rows가 목록이 아니면 null */
function toPage(data: unknown): NoticePage | null {
  if (!isRecord(data) || !isCount(data.total) || !isCount(data.unread) || !Array.isArray(data.rows)) return null
  return { total: data.total, unread: data.unread, rows: listOf(data.rows, toView) }
}

/** notice_search(setof uuid) 답. 줄이 id 글이든 { notice_search: id }든 id만 고른다. 목록이 아니면 null */
function searchIds(data: unknown): string[] | null {
  if (!Array.isArray(data)) return null
  return data.flatMap((item: unknown) => {
    const id = isRecord(item) ? item[SEARCH] : item
    return isFilled(id) ? [id] : []
  })
}

// ── 목록 · 글 하나 (AC-7418.1 · AC-7424.7) ─────────────────

type ListArgs = {
  p_related: boolean
  p_sources: NoticeSource[] | null
  p_starred: boolean
  p_ids: string[] | null
  p_unread_only: boolean
  p_limit: number
  p_offset: number
}

async function callList(args: ListArgs): Promise<NoticePage | null> {
  const { data, error } = await supabaseBrowser().rpc(LIST, args)
  return error ? null : toPage(data)
}

/** 규칙 칩 숫자를 붙인다(specs/rule-auto AC-7812.5). 판정 줄 읽기만 실패하면 그 줄들의 ruleTally가 null이고 줄은 그대로다 */
async function withTallies(rows: NoticeView[]): Promise<NoticeView[]> {
  const tallies = await ruleTallies(rows)
  return rows.map((row) => ({ ...row, ruleTally: tallies.get(row.id) ?? null }))
}

/**
 * 글 목록 한 쪽(50개). q(앞뒤 공백 뗌)가 있으면 notice_search가 준 id 안에서, 없으면 거르기 그대로 notice_list를 부른다.
 * 찾은 글이 없으면 notice_list를 부르지 않고 빈 쪽이다. 화면은 받은 줄을 related로 다시 거르지 않는다(꼭 볼 글은 DB가 넣는다)
 */
export async function listNotices(filter: NoticeFilter): Promise<NoticePage | 'failed'> {
  try {
    const q = typeof filter.q === 'string' ? filter.q.trim() : ''
    let ids: string[] | null = null
    if (q !== '') {
      const { data, error } = await supabaseBrowser().rpc(SEARCH, { p_q: q })
      const found = error ? null : searchIds(data)
      if (found === null) return 'failed'
      if (found.length === 0) return { total: 0, unread: 0, rows: [] }
      ids = found
    }
    const page = await callList({
      p_related: filter.related === true,
      p_sources: [...filter.sources],
      p_starred: filter.starred === true,
      p_ids: ids,
      p_unread_only: false,
      p_limit: PAGE_SIZE,
      p_offset: isCount(filter.offset) ? filter.offset : 0,
    })
    return page === null ? 'failed' : { ...page, rows: await withTallies(page.rows) }
  } catch {
    return 'failed'
  }
}

/** 글 하나(거르기 없이 그 id만). 없거나 id가 uuid 모양이 아니면(부르지 않음) null */
export async function openNotice(id: string): Promise<NoticeView | null | 'failed'> {
  if (!isUuid(id)) return null
  try {
    const page = await callList({ p_related: false, p_sources: null, p_starred: false, p_ids: [id], p_unread_only: false, p_limit: 1, p_offset: 0 })
    if (page === null) return 'failed'
    const row = page.rows.find((r) => r.id.toLowerCase() === id.toLowerCase())
    return row === undefined ? null : ((await withTallies([row]))[0] ?? null)
  } catch {
    return 'failed'
  }
}

// ── 내 표시 쓰기 (AC-7418.2) ────────────────────────────────

/** 내 병원 표시 줄의 받은 칸만 넣거나 고친다(upsert는 보낸 칸만 SET한다 — 다른 칸은 그대로). id가 uuid 모양이 아니면 보내지 않는다 */
async function writeMark(id: string, values: Record<string, string | boolean>): Promise<boolean> {
  if (!isUuid(id)) return false
  try {
    const { error } = await supabaseBrowser()
      .from(MARKS)
      .upsert({ notice_id: id, ...values }, MARK_CONFLICT)
    return !error
  } catch {
    return false
  }
}

/** 읽음으로 적는다. 성공하면 창에 notices:changed를 알린다(탭 숫자가 다시 읽는다) */
export async function markRead(id: string): Promise<boolean> {
  const ok = await writeMark(id, { read_at: nowIso() })
  if (ok) announce()
  return ok
}

export function setStar(id: string, starred: boolean): Promise<boolean> {
  return writeMark(id, { starred: starred === true })
}

/** checkMemo가 ok일 때만 앞뒤 공백을 뗀 메모와 메모 시각을 보낸다(빈 메모 = 지우기). 아니면 보내지 않고 그 결과 */
export async function saveMemo(id: string, memo: string): Promise<boolean | MemoBlocked> {
  const check = checkMemo(memo)
  if (check !== 'ok') return check
  return writeMark(id, { memo: memo.trim(), memo_at: nowIso() })
}

/** 점검 규칙 확인 시각만 적는다(규칙은 바꾸지 않는다) */
export function checkRules(id: string): Promise<boolean> {
  return writeMark(id, { rules_checked_at: nowIso() })
}

// ── 숫자 · 경고 · 출처 상태 · 채우기 · 남은 묻기 · 주간 모음 (AC-7418.3) ──

async function readCount(fn: string): Promise<number | 'failed'> {
  try {
    const { data, error } = await supabaseBrowser().rpc(fn)
    return error || !isCount(data) ? 'failed' : data
  } catch {
    return 'failed'
  }
}

/** 탭 숫자·대시보드: 안 읽은 관련 글(꼭 볼 글 포함) 수 */
export function unreadCount(): Promise<number | 'failed'> {
  return readCount(UNREAD)
}

/** 오늘(한국 날짜) 남은 묻기 수(20 − 오늘 수) */
export function askLeft(): Promise<number | 'failed'> {
  return readCount(ASK_LEFT)
}

function toAlert(v: unknown): RuleAlert | null {
  if (!isRecord(v) || !isFilled(v.id) || !isFilled(v.title) || !isCount(v.rule_count)) return null
  return { id: v.id, noticeNo: textOrNull(v.notice_no), title: v.title, ruleCount: v.rule_count }
}

/** 대시보드 맨 위 노랑 띠: 사람이 봐야 함 판정 줄이 있고 내가 확인하지 않은 글(최근 글부터, rule_count = 그 줄 수 — specs/rule-auto AC-7806.4) */
export async function ruleAlerts(): Promise<RuleAlert[] | 'failed'> {
  try {
    const { data, error } = await supabaseBrowser().rpc(ALERTS)
    return error || !Array.isArray(data) ? 'failed' : listOf(data, toAlert)
  } catch {
    return 'failed'
  }
}

function toSource(v: unknown): SourceView | null {
  if (!isRecord(v) || !oneOf(SOURCES, v.source) || !oneOf(SOURCE_STATES, v.state)) return null
  return {
    source: v.source,
    state: v.state,
    errorCode: oneOf(SOURCE_ERRORS, v.error_code) ? v.error_code : null,
    checkedAt: textOrNull(v.checked_at),
    lastOkAt: textOrNull(v.last_ok_at),
    stoppedSince: textOrNull(v.stopped_since),
    backfillDone: v.backfill_done === true,
  }
}

/** 출처마다 상태 한 줄(출처 칩 차례, 출처마다 처음 맞는 줄 하나). 쪽 표시(cursor)는 읽지 않는다 */
export async function sourceStates(): Promise<SourceView[] | 'failed'> {
  try {
    const { data, error } = await supabaseBrowser().from(SOURCE_TABLE).select(SOURCE_COLUMNS)
    if (error || !Array.isArray(data)) return 'failed'
    const rows = listOf(data, toSource)
    return SOURCES.flatMap((source) => rows.find((row) => row.source === source) ?? [])
  } catch {
    return 'failed'
  }
}

/** 처음 채우기 띠: 전체 글 수 · 요약이 끝난(done·failed) 글 수 · 일괄 중(batch) 글 수. 줄은 받지 않고 수만 센다 */
export async function fillProgress(): Promise<FillProgress | 'failed'> {
  try {
    const client = supabaseBrowser()
    const head = () => client.from(NOTICES).select('id', { count: 'exact', head: true })
    const [total, done, batching] = await Promise.all([head(), head().in('state', ['done', 'failed']), head().eq('state', 'batch')])
    for (const reply of [total, done, batching]) if (reply.error || !isCount(reply.count)) return 'failed'
    return { total: total.count as number, done: done.count as number, batching: batching.count as number }
  } catch {
    return 'failed'
  }
}

const isMonday = (ymd: unknown): ymd is string => typeof ymd === 'string' && isYmd(ymd) && weekdayOf(ymd) === 1

function toTop(v: unknown): WeekTop | null {
  if (!isRecord(v) || typeof v.head !== 'string' || typeof v.body !== 'string') return null
  return { head: v.head, body: v.body }
}

/** 출처 글은 출처만, 정해 둔 차례로 한 번씩 */
function weekPosts(v: unknown): Pick<GroupPost, 'source'>[] {
  const have = new Set(Array.isArray(v) ? v.map((p: unknown) => (isRecord(p) ? p.source : null)) : [])
  return POST_ORDER.filter((source) => have.has(source)).map((source) => ({ source }))
}

function toWeekItem(v: unknown): WeekItem | null {
  if (!isRecord(v)) return null
  const { id, title, kind, posted_on: postedOn, state } = v
  if (!isFilled(id) || !isFilled(title) || !oneOf(KINDS, kind) || !isFilled(postedOn) || !oneOf(STATES, state)) return null
  const related = typeof v.related === 'boolean' ? v.related : null
  return { id, title, kind, postedOn, related, summary: toSummary(v.summary, related), state, posts: weekPosts(v.notice_posts) }
}

/**
 * 주간 모음 하나: weekStart(월요일 'YYYY-MM-DD') 또는 'latest'(가장 최근 모음). 모음 머리와 그 주(월~일)에 올라온 글들(최근 글부터).
 * 모음이 없거나 weekStart가 월요일 날짜가 아니면(부르지 않음) null
 */
export async function readWeek(weekStart: string): Promise<NoticeWeek | null | 'failed'> {
  const latest = weekStart === 'latest'
  if (!latest && !isMonday(weekStart)) return null
  try {
    const client = supabaseBrowser()
    const head = client.from(WEEKS).select(WEEK_COLUMNS)
    const picked = latest ? head.order('week_start', { ascending: false }).limit(1) : head.eq('week_start', weekStart)
    const { data, error } = await picked.maybeSingle()
    if (error) return 'failed'
    if (data === null) return null
    if (!isRecord(data) || !isMonday(data.week_start) || !isFilled(data.created_at)) return 'failed'
    const { from, to } = weekRange(data.week_start)
    const notices = await client
      .from(NOTICES)
      .select(WEEK_NOTICE_COLUMNS)
      .gte('posted_on', from)
      .lte('posted_on', to)
      .order('posted_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(WEEK_LIMIT)
    if (notices.error || !Array.isArray(notices.data)) return 'failed'
    return {
      weekStart: data.week_start,
      createdAt: data.created_at,
      top3: listOf(data.top3, toTop).slice(0, TOP_MAX),
      items: listOf(notices.data, toWeekItem),
    }
  } catch {
    return 'failed'
  }
}

// ── 내 낱말 (AC-7424.7) ───────────────────────────────────

/** 내 병원 낱말을 넣은 차례로(같은 시각이면 정규화 글자 차례, DB 맞춤 줄의 차례와 같다). 답이 목록이 아니면 failed */
export async function readKeywords(): Promise<string[] | 'failed'> {
  try {
    const { data, error } = await supabaseBrowser()
      .from(KEYWORDS)
      .select('word')
      .order('created_at', { ascending: true })
      .order('word_norm', { ascending: true })
    if (error || !Array.isArray(data)) return 'failed'
    return listOf(data, (row) => (isRecord(row) && isFilled(row.word) ? row.word : null))
  } catch {
    return 'failed'
  }
}

/** 낱말 하나를 넣는다(몸통 { word }만, 검사·다듬기는 부르는 쪽의 checkKeyword). 겹침·31번째·제약 거부는 false. 성공하면 notices:changed */
export async function addKeyword(word: string): Promise<boolean> {
  let ok: boolean
  try {
    const { error } = await supabaseBrowser().from(KEYWORDS).insert({ word })
    ok = !error
  } catch {
    ok = false
  }
  if (ok) announce()
  return ok
}

/** 그 글자 그대로인 낱말 줄을 지운다. 없는 줄을 지워도 오류가 없으면 true. 성공하면 notices:changed */
export async function removeKeyword(word: string): Promise<boolean> {
  let ok: boolean
  try {
    const { error } = await supabaseBrowser().from(KEYWORDS).delete().eq('word', word)
    ok = !error
  } catch {
    ok = false
  }
  if (ok) announce()
  return ok
}
