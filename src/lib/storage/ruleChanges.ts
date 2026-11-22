import type { SupabaseClient } from '@supabase/supabase-js'
import { isYmd, todayInKorea } from '@/lib/analytics/dates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { NoticeView, RuleHit } from '@/types/notices'
import type { Basis, RuleUpdate } from '@/types/precheck'
import type { NoticeRuleView, RuleBadge, RuleChangeAlert, RuleCheckView, RuleTally, RuleVerdict } from '@/types/ruleAuto'

// 점검 규칙 저절로 바꾸기의 화면 읽기·쓰기(specs/rule-auto REQ-7812, design 11절). 브라우저 Supabase 클라이언트 + RLS로만 한다(ADR-004).
// 판정 줄(rule_changes)은 공용이라 승인된 원장이면 다 읽고, 내 병원 표시(rule_change_marks)는 RLS가 내 병원 줄만 고른다.
// hospital_id는 보내지 않는다(DB 기본값 my_hospital_id()). 읽은 줄은 모양을 믿지 않는다: 정해 둔 칸만 골라 새로 만들고 꼭 있어야 할 칸이 틀린 줄은 뺀다.
// 실패는 읽기 'failed'(ruleTallies는 null), 쓰기 false, 청구 화면의 readRuleUpdates만 던진다. Supabase 오류 글은 버리고 밖으로 내지 않는다(console도 없음)

const CHANGES = 'rule_changes'
const MARKS = 'rule_change_marks'
const SEE = 'see_rule_changes'
const ALERTS = 'rule_change_alerts'
const MARK_CONFLICT = { onConflict: 'hospital_id,change_id' }
/** notices.ts의 NOTICES_CHANGED와 같은 이름. notices.ts가 이 파일(ruleTallies)을 import하므로 고리를 만들지 않으려고 글자로 둔다 */
const CHANGED = 'notices:changed'

const UPDATES_MAX = 200 // 청구 화면이 읽는 바뀐 판(기본값 14)
const UPDATES_BYTES = 600_000 // 도우미 한 메시지 한도(1,000,000바이트) 안(design 6절)
const READ_MAX = 1000 // Supabase 한 번 읽기 상한(max rows). 꽉 차게 오면 잘렸을 수 있어 실패로 본다

const VERDICTS: readonly RuleVerdict[] = ['none', 'same', 'change', 'human']
const STATES = ['live', 'old'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Rec = Record<string, unknown>
type Client = Pick<SupabaseClient, 'from'>

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isFilled = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isDay = (v: unknown): v is string => typeof v === 'string' && isYmd(v)
const textOr = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const textOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v)
const isUuid = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)
const listOf = <T>(v: unknown[], pick: (item: unknown) => T | null): T[] => v.flatMap((item: unknown) => pick(item) ?? [])
const utf8Bytes = (text: string) => new TextEncoder().encode(text).length

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED))
}

/** 내 병원이 되돌린 판 id. 오류·목록 아님·꽉 찬 답이면 null */
async function revertedIds(client: Client): Promise<Set<string> | null> {
  const { data, error } = await client.from(MARKS).select('change_id').eq('reverted', true).limit(READ_MAX)
  if (error || !Array.isArray(data) || data.length >= READ_MAX) return null
  return new Set(data.flatMap((row: unknown) => (isRecord(row) && isFilled(row.change_id) ? [row.change_id] : [])))
}

// ── 청구 화면 (AC-7812.1) ─────────────────────────────────

/** 서버 판을 쓸 수 없다(오류·200개 넘음·크기 넘음). 청구 화면이 받아 도우미 사본으로 점검한다. 서버 오류 글은 담지 않는다 */
export class RuleUpdatesError extends Error {
  constructor() {
    super('바뀐 판을 읽지 못함')
  }
}

function toUpdate(v: unknown): RuleUpdate | null {
  if (!isRecord(v) || !isUuid(v.id) || !isFilled(v.rule_id) || !isDay(v.effective_from) || !isFilled(v.base_version) || !isRecord(v.rule)) return null
  return { changeId: v.id, ruleId: v.rule_id, from: v.effective_from, baseVersion: v.base_version, rule: v.rule }
}

/**
 * 청구 점검에 쓸 바뀐 판: live change 줄(시행일·만든 때 차례) 가운데 내 병원이 되돌리지 않은 것. 규칙 모양은 Worker가 다시 거른다.
 * 200개를 넘거나, 돌려줄 목록의 JSON이 600,000바이트(UTF-8)를 넘거나, 읽기가 실패하면 던진다 — 받은 클라이언트로 읽는다(청구 화면의 설정 읽기와 같은 클라이언트)
 */
export async function readRuleUpdates(sb: SupabaseClient): Promise<RuleUpdate[]> {
  try {
    const { data, error } = await sb
      .from(CHANGES)
      .select('id, rule_id, effective_from, base_version, rule')
      .eq('verdict', 'change')
      .eq('state', 'live')
      .order('effective_from', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(UPDATES_MAX + 1)
    if (error || !Array.isArray(data) || data.length > UPDATES_MAX) throw new RuleUpdatesError()
    const all = listOf(data, toUpdate)
    if (all.length === 0) return []
    const reverted = await revertedIds(sb)
    if (reverted === null) throw new RuleUpdatesError()
    const list = all.filter((u) => !reverted.has(u.changeId))
    if (utf8Bytes(JSON.stringify(list)) > UPDATES_BYTES) throw new RuleUpdatesError()
    return list
  } catch {
    throw new RuleUpdatesError()
  }
}

// ── 글 화면 규칙 상자 (AC-7812.2) ─────────────────────────────

type Judged = {
  id: string
  ruleId: string
  verdict: RuleVerdict
  state: (typeof STATES)[number]
  why: string
  before: string
  after: string
  from: string | null
  title: string | null
}

/** 판정 줄 하나. id·규칙 번호·판정·state가 틀리거나 change인데 날짜가 없으면 null. 글 칸이 글이 아니면 빈 글자 */
function toJudged(v: unknown): Judged | null {
  if (!isRecord(v) || !isUuid(v.id) || !isFilled(v.rule_id) || !oneOf(VERDICTS, v.verdict) || !oneOf(STATES, v.state)) return null
  const from = isDay(v.effective_from) ? v.effective_from : null
  if (v.verdict === 'change' && from === null) return null
  return {
    id: v.id,
    ruleId: v.rule_id,
    verdict: v.verdict,
    state: v.state,
    why: textOr(v.why, ''),
    before: textOr(v.before_text, ''),
    after: textOr(v.after_text, ''),
    from: v.verdict === 'change' ? from : null,
    title: isFilled(v.title) ? v.title : null,
  }
}

type Mark = { seen: boolean; reverted: boolean; revertedAt: string | null }

async function readMarks(client: Client, changeIds: string[]): Promise<Map<string, Mark> | null> {
  const { data, error } = await client.from(MARKS).select('change_id, seen_at, reverted, reverted_at').in('change_id', changeIds)
  if (error || !Array.isArray(data)) return null
  const marks = new Map<string, Mark>()
  for (const row of data) {
    if (!isRecord(row) || !isFilled(row.change_id)) continue
    marks.set(row.change_id, { seen: isFilled(row.seen_at), reverted: row.reverted === true, revertedAt: textOrNull(row.reverted_at) })
  }
  return marks
}

const NO_MARK: Mark = { seen: false, reverted: false, revertedAt: null }

/**
 * 글 하나의 규칙 상자: 그 글의 판정 줄(모든 state)과 live change 줄의 내 표시.
 * live 줄은 RuleCheckView(ruleHits 차례, 연결에 없는 규칙은 뒤에 번호 차례), 판정 줄이 하나도 없는 ruleHits는 pending, old 줄만 있는 규칙은 어디에도 없다
 */
export async function readNoticeRules(id: string, ruleHits: readonly RuleHit[]): Promise<NoticeRuleView | 'failed'> {
  if (!isUuid(id)) return 'failed'
  try {
    const client = supabaseBrowser()
    const { data, error } = await client
      .from(CHANGES)
      .select('id, rule_id, verdict, why, before_text, after_text, effective_from, title:rule->>title, state')
      .eq('notice_id', id)
    if (error || !Array.isArray(data)) return 'failed'
    const rows = listOf(data, toJudged)
    const live = rows.filter((row) => row.state === 'live')
    const changeIds = live.filter((row) => row.verdict === 'change').map((row) => row.id)
    const marks = changeIds.length === 0 ? new Map<string, Mark>() : await readMarks(client, changeIds)
    if (marks === null) return 'failed'
    const hitTitle = new Map(ruleHits.map((hit) => [hit.id, hit.title]))
    const place = (ruleId: string) => {
      const at = ruleHits.findIndex((hit) => hit.id === ruleId)
      return at === -1 ? ruleHits.length : at
    }
    const views = live
      .map((row): RuleCheckView => {
        const mark = row.verdict === 'change' ? (marks.get(row.id) ?? NO_MARK) : NO_MARK
        const original = hitTitle.get(row.ruleId) ?? row.ruleId
        return {
          changeId: row.id,
          ruleId: row.ruleId,
          verdict: row.verdict,
          why: row.why,
          before: row.before,
          after: row.after,
          from: row.from,
          title: row.verdict === 'change' ? (row.title ?? original) : original,
          ...mark,
        }
      })
      .sort((a, b) => place(a.ruleId) - place(b.ruleId) || a.ruleId.localeCompare(b.ruleId))
    const judged = new Set(rows.map((row) => row.ruleId))
    return { rows: views, pending: ruleHits.filter((hit) => !judged.has(hit.id)) }
  } catch {
    return 'failed'
  }
}

// ── 되돌리기 · 본 것 (AC-7812.3) ──────────────────────────────

/** 내 병원 표시에 { change_id, reverted }만 넣거나 고친다(되돌린 시각·본 때는 트리거가 맞춘다). 성공하면 notices:changed */
export async function setRuleReverted(changeId: string, reverted: boolean): Promise<boolean> {
  if (!isUuid(changeId)) return false
  let ok: boolean
  try {
    const { error } = await supabaseBrowser()
      .from(MARKS)
      .upsert({ change_id: changeId, reverted: reverted === true }, MARK_CONFLICT)
    ok = !error
  } catch {
    ok = false
  }
  if (ok) announce()
  return ok
}

/** 그 글의 바뀐 판을 내 병원에서 본 것으로 적는다(see_rule_changes). 성공하면 notices:changed(파랑 띠가 다시 읽는다) */
export async function seeRuleChanges(noticeId: string): Promise<boolean> {
  if (!isUuid(noticeId)) return false
  let ok: boolean
  try {
    const { error } = await supabaseBrowser().rpc(SEE, { p_notice: noticeId })
    ok = !error
  } catch {
    ok = false
  }
  if (ok) announce()
  return ok
}

// ── 대시보드 파랑 띠 · 설정 칩 (AC-7812.4) ──────────────────────

function toChangeAlert(v: unknown): RuleChangeAlert | null {
  if (!isRecord(v) || !isFilled(v.id) || !isFilled(v.title) || !isCount(v.change_count)) return null
  return { id: v.id, noticeNo: textOrNull(v.notice_no), title: v.title, changeCount: v.change_count }
}

/** 내 병원이 아직 안 본, 되돌리지 않은 바뀐 판이 있는 글(최근 글부터, DB 차례 그대로) */
export async function ruleChangeAlerts(): Promise<RuleChangeAlert[] | 'failed'> {
  try {
    const { data, error } = await supabaseBrowser().rpc(ALERTS)
    return error || !Array.isArray(data) ? 'failed' : listOf(data, toChangeAlert)
  } catch {
    return 'failed'
  }
}

type Version = { id: string; ruleId: string; from: string; title: string | null; basis: Basis[] | null }

function toBasis(v: unknown): Basis | null {
  if (!isRecord(v) || typeof v.doc !== 'string' || typeof v.number !== 'string') return null
  return {
    doc: v.doc,
    number: v.number,
    ...(typeof v.effective === 'string' ? { effective: v.effective } : {}),
    ...(typeof v.url === 'string' ? { url: v.url } : {}),
  }
}

function toVersion(v: unknown): Version | null {
  if (!isRecord(v) || !isUuid(v.id) || !isFilled(v.rule_id) || !isDay(v.effective_from)) return null
  return {
    id: v.id,
    ruleId: v.rule_id,
    from: v.effective_from,
    title: isFilled(v.title) ? v.title : null,
    basis: Array.isArray(v.basis) ? listOf(v.basis, toBasis) : null,
  }
}

const latest = (list: Version[]): Version | undefined => list.reduce<Version | undefined>((last, v) => (last === undefined || v.from > last.from ? v : last), undefined)

/** 기본값 12: 칩 날짜는 되돌리지 않은 가장 늦은 판(모두 되돌렸으면 가장 늦은 판), 제목·근거는 오늘 쓰이는 판(없으면 null) */
function badgeOf(versions: Version[], reverted: ReadonlySet<string>, today: string): RuleBadge {
  const kept = versions.filter((v) => !reverted.has(v.id))
  const shown = latest(kept.length > 0 ? kept : versions) as Version
  const now = latest(kept.filter((v) => v.from <= today))
  return { from: shown.from, title: now?.title ?? null, basis: now?.basis ?? null, reverted: kept.length === 0 }
}

/** 설정 → 점검 규칙 칩: 바뀐 판이 있는 규칙 id → RuleBadge(오늘 = 한국 날짜) */
export async function readRuleBadges(): Promise<Map<string, RuleBadge> | 'failed'> {
  try {
    const client = supabaseBrowser()
    const { data, error } = await client
      .from(CHANGES)
      .select('id, rule_id, effective_from, title:rule->>title, basis:rule->basis')
      .eq('verdict', 'change')
      .eq('state', 'live')
      .limit(READ_MAX)
    if (error || !Array.isArray(data) || data.length >= READ_MAX) return 'failed'
    const versions = listOf(data, toVersion)
    const badges = new Map<string, RuleBadge>()
    if (versions.length === 0) return badges
    const reverted = await revertedIds(client)
    if (reverted === null) return 'failed'
    const today = todayInKorea()
    for (const ruleId of new Set(versions.map((v) => v.ruleId))) {
      badges.set(
        ruleId,
        badgeOf(
          versions.filter((v) => v.ruleId === ruleId),
          reverted,
          today,
        ),
      )
    }
    return badges
  } catch {
    return 'failed'
  }
}

// ── 글 목록 칩 숫자 (AC-7812.5) ───────────────────────────────

const ZERO: RuleTally = { changed: 0, human: 0, pending: 0 }

type TallyRow = { noticeId: string; ruleId: string; verdict: RuleVerdict; live: boolean }

function toTallyRow(v: unknown): TallyRow | null {
  if (!isRecord(v) || !isFilled(v.notice_id) || !isFilled(v.rule_id) || !oneOf(VERDICTS, v.verdict) || !oneOf(STATES, v.state)) return null
  return { noticeId: v.notice_id, ruleId: v.rule_id, verdict: v.verdict, live: v.state === 'live' }
}

/**
 * 글마다 규칙 칩 숫자. ruleHits가 있는 글만 판정 줄을 한 번에(in) 읽는다: changed·human = live 줄 수(changed는 내 병원이 되돌린 판도 센다),
 * pending = 판정 줄(old 포함)이 하나도 없는 연결 규칙 수. ruleHits가 빈 글은 모두 0. 읽기가 실패하면 ruleHits가 있는 글은 null이다(던지지 않는다)
 */
export async function ruleTallies(notices: readonly Pick<NoticeView, 'id' | 'ruleHits'>[]): Promise<Map<string, RuleTally | null>> {
  const tallies = new Map<string, RuleTally | null>(notices.map((n) => [n.id, n.ruleHits.length === 0 ? { ...ZERO } : null]))
  const hit = notices.filter((n) => n.ruleHits.length > 0)
  if (hit.length === 0) return tallies
  try {
    const { data, error } = await supabaseBrowser()
      .from(CHANGES)
      .select('notice_id, rule_id, verdict, state')
      .in(
        'notice_id',
        hit.map((n) => n.id),
      )
      .limit(READ_MAX)
    if (error || !Array.isArray(data) || data.length >= READ_MAX) return tallies
    const rows = listOf(data, toTallyRow)
    for (const notice of hit) {
      const mine = rows.filter((row) => row.noticeId === notice.id)
      const judged = new Set(mine.map((row) => row.ruleId))
      tallies.set(notice.id, {
        changed: mine.filter((row) => row.live && row.verdict === 'change').length,
        human: mine.filter((row) => row.live && row.verdict === 'human').length,
        pending: notice.ruleHits.filter((h) => !judged.has(h.id)).length,
      })
    }
    return tallies
  } catch {
    return tallies
  }
}
