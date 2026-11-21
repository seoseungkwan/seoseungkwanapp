import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isYmd, weekRange } from '@/lib/analytics/dates'
import { supabaseEnv } from '@/lib/supabase/env'
import type {
  Attachment,
  CollectorStore,
  GroupPost,
  GroupRow,
  NoticeKind,
  NoticeSource,
  NoticeState,
  NoticeSummary,
  PostRow,
  ReadMode,
  SourceError,
  SourceRow,
  WaitingNotice,
  WeekInput,
} from '@/types/notices'
import type { BatchNotice, BatchReadingStore } from './collector'
import { WEEK_ITEMS_MAX } from './weeklyPrompt'

// 고시·공지 모으기의 DB 쪽(specs/notices REQ-7415, design 3·4절, ADR-035).
// 모으기 계정(notice_collectors에 있는 Supabase 로그인 계정)이 공개 열쇠로 비밀번호 로그인한 클라이언트로만 쓴다 — 다른 열쇠는 읽지 않는다.
// 공용 표 넷(notices·notice_posts·notice_sources·notice_weeks)과 실행 기록 함수 셋(notice_start_run·notice_add_run_usage·notice_finish_run)만 쓰고
// 병원 조건은 넣지 않는다(공용 표다, ADR-036). 지우기는 없다.
// 오류 내용은 버린다: 쓰기는 false, 읽기(startRun 포함)는 고정 글 STORE_READ_FAILED로 던진다

/** 읽기 실패(DB 오류·던짐·줄 모양이 틀림)의 고정 글. 받은 오류 글은 담지 않는다 */
export const STORE_READ_FAILED = 'notices store read failed'

// ── 모으기 클라이언트 ──────────────────────────────────────

/**
 * 모으기 계정으로 로그인한 Supabase 클라이언트(AC-7415.1). 메일·비밀번호는 서버 환경 변수
 * NOTICES_COLLECTOR_EMAIL·NOTICES_COLLECTOR_PASSWORD에만 있다. 세션은 저장하지 않고 스스로 갱신하지 않는다(실행 한 번 300초 안에 쓰고 버린다).
 * 값이 없거나 공개 주소·열쇠가 없거나 로그인이 실패하면 null이고 오류 글은 버린다
 */
export async function collectorClient(): Promise<SupabaseClient | null> {
  const email = (process.env.NOTICES_COLLECTOR_EMAIL ?? '').trim()
  const password = process.env.NOTICES_COLLECTOR_PASSWORD ?? ''
  if (email === '' || password === '') return null
  try {
    const { url, anonKey } = supabaseEnv()
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) return null
    return client
  } catch {
    return null
  }
}

// ── 값 검사 ────────────────────────────────────────────────

const SOURCES: readonly NoticeSource[] = ['hira_notice', 'hira_crtr', 'mohw_rss']
const KINDS: readonly NoticeKind[] = ['gosi', 'notice', 'interp', 'guide', 'case']
const STATES: readonly NoticeState[] = ['wait', 'batch', 'done', 'failed']
const READ_MODES: readonly ReadMode[] = ['full', 'text', 'body']
const SOURCE_STATES: readonly SourceRow['state'][] = ['ok', 'stopped']
const SOURCE_ERRORS: readonly SourceError[] = ['blocked', 'http', 'shape']

// 요약이 이만큼 실패하면 failed(AC-7414.5)
const FAIL_AT = 3

// 줄 모양이 틀림. reading()이 고정 글로 바꾼다
class BadRow extends Error {}

type Res = { data: unknown; error: unknown }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function dataOf(res: Res): unknown {
  if (res.error) throw new BadRow()
  return res.data
}
function recordOf(v: unknown): Record<string, unknown> {
  if (!isRecord(v)) throw new BadRow()
  return v
}
function listOf(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new BadRow()
  return v
}
function textOf(v: unknown): string {
  if (typeof v !== 'string') throw new BadRow()
  return v
}
function textOrNull(v: unknown): string | null {
  return v === null ? null : textOf(v)
}
function dayOf(v: unknown): string {
  const s = textOf(v)
  if (!isYmd(s)) throw new BadRow()
  return s
}
function intOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new BadRow()
  return v
}
function boolOf(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new BadRow()
  return v
}
function oneOf<T extends string>(list: readonly T[], v: unknown): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) throw new BadRow()
  return v as T
}
function msOf(v: unknown): number {
  const ms = Date.parse(textOf(v))
  if (Number.isNaN(ms)) throw new BadRow()
  return ms
}

// 읽기: 무엇이 던져도 고정 글 하나로
async function reading<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch {
    throw new Error(STORE_READ_FAILED)
  }
}
// 쓰기: 오류·던짐은 false
async function writing(work: () => Promise<boolean>): Promise<boolean> {
  try {
    return await work()
  } catch {
    return false
  }
}
// 고치기는 RLS가 막으면 오류 없이 0줄이다 → 고친 줄 수를 받아 센다
const rowsOk = (res: Res, count = 1): boolean => !res.error && Array.isArray(res.data) && res.data.length === count

// ── 줄 ↔ 모양 ──────────────────────────────────────────────

// 묶음 줄에 붙여 읽는 출처 글(들어온 차례를 created_at으로 다시 맞춘다 — 제목을 주는 글 고르기가 차례를 본다)
const POSTS = 'notice_posts(source, title, url, posted_on, attachments, created_at)'

function attachmentsOf(v: unknown): Attachment[] {
  return listOf(v).map((a) => {
    const r = recordOf(a)
    return { name: textOf(r.name), url: textOf(r.url) }
  })
}

function postsOf(v: unknown): GroupPost[] {
  return listOf(v)
    .map((p) => {
      const r = recordOf(p)
      const post: GroupPost = {
        source: oneOf(SOURCES, r.source),
        title: textOf(r.title),
        url: textOf(r.url),
        postedOn: dayOf(r.posted_on),
        attachments: attachmentsOf(r.attachments),
      }
      return { post, at: msOf(r.created_at) }
    })
    .sort((a, b) => a.at - b.at)
    .map(({ post }) => post)
}

function summaryOf(v: unknown): NoticeSummary | null {
  if (!isRecord(v)) return null
  const { related, what, when, who, forUs, amends } = v
  if (typeof related !== 'boolean' || typeof what !== 'string' || typeof when !== 'string' || typeof who !== 'string' || typeof forUs !== 'string') {
    return null
  }
  if (!Array.isArray(amends) || !amends.every((a): a is string => typeof a === 'string')) return null
  return { related, what, when, who, forUs, amends: [...amends] }
}

function sourceRowOf(v: unknown): SourceRow {
  const r = recordOf(v)
  return {
    source: oneOf(SOURCES, r.source),
    state: oneOf(SOURCE_STATES, r.state),
    errorCode: r.error_code === null ? null : oneOf(SOURCE_ERRORS, r.error_code),
    checkedAt: textOrNull(r.checked_at),
    lastOkAt: textOrNull(r.last_ok_at),
    stoppedSince: textOrNull(r.stopped_since),
    cursor: { ...recordOf(r.cursor) },
    backfillDone: boolOf(r.backfill_done),
  }
}

// notice_posts 줄 제약(design 3절)과 같은 검사. 묶음을 쓴 뒤 출처 글이 늘 거부되면 출처 글 없는 묶음이 남으므로 쓰기 전에 본다
const SITE_URL = /^https:\/\/www\.(hira\.or\.kr|mohw\.go\.kr)\//
const chars = (s: string) => [...s].length
const fits = (s: unknown, min: number, max: number) => typeof s === 'string' && chars(s) >= min && chars(s) <= max
const urlFits = (u: unknown) => fits(u, 1, 500) && SITE_URL.test(u as string)

function postFits(p: PostRow): boolean {
  return (
    SOURCES.includes(p.source) &&
    fits(p.sourceKey, 1, 100) &&
    fits(p.title, 1, 300) &&
    urlFits(p.url) &&
    isYmd(p.postedOn) &&
    Array.isArray(p.attachments) &&
    p.attachments.length <= 10 &&
    p.attachments.every((a) => fits(a.name, 1, 200) && urlFits(a.url))
  )
}

// notices.read_mode·attach_text 제약(design 3절)과 같은 검사. 넘치면 DB가 거부하므로 부르기 전에 본다
const readingFits = (r: { readMode: unknown; attachText: unknown }) => READ_MODES.includes(r.readMode as ReadMode) && fits(r.attachText, 0, 20000)

// 일괄 거두기 때 읽는 글. 모양이 틀린 줄은 null(건너뛴다 — 그 글은 거둘 때 없는 글이 되어 실패로 센다)
function batchNoticeOf(v: unknown): BatchNotice | null {
  try {
    const r = recordOf(v)
    return {
      id: textOf(r.id),
      noticeNo: textOrNull(r.notice_no),
      body: textOf(r.body),
      readMode: r.read_mode === null ? null : oneOf(READ_MODES, r.read_mode),
      attachText: textOf(r.attach_text),
    }
  } catch {
    return null
  }
}

// ── 가게 ───────────────────────────────────────────────────

/** 모으기 흐름(collector.ts)이 쓰는 DB 쪽(일괄 글의 읽기 결과 둘 포함). supabase는 collectorClient()가 준 클라이언트 */
export function collectorStore(supabase: SupabaseClient): CollectorStore & BatchReadingStore {
  const notices = () => supabase.from('notices')

  return {
    // 실행 시작. 다른 실행이 돌면 null. 오류는 읽기처럼 던진다(null은 '돎'만 뜻한다)
    startRun: () =>
      reading(async () => {
        const data = dataOf(await supabase.rpc('notice_start_run'))
        return data === null ? null : textOf(data)
      }),

    addRunUsage: (runId, u) =>
      writing(async () => {
        const res = await supabase.rpc('notice_add_run_usage', { p_id: runId, p_input: u.inputTokens, p_output: u.outputTokens, p_cost: u.costMicroUsd })
        return !res.error
      }),

    finishRun: (runId, counts) =>
      writing(async () => {
        const res = await supabase.rpc('notice_finish_run', { p_id: runId, p_counts: counts })
        return !res.error
      }),

    sources: () =>
      reading(async () => {
        const res = await supabase
          .from('notice_sources')
          .select('source, state, error_code, checked_at, last_ok_at, stopped_since, cursor, backfill_done')
          .order('source')
        return listOf(dataOf(res)).map(sourceRowOf)
      }),

    saveSource: (row) =>
      writing(async () => {
        const res = await supabase
          .from('notice_sources')
          .upsert(
            {
              source: row.source,
              state: row.state,
              error_code: row.errorCode,
              checked_at: row.checkedAt,
              last_ok_at: row.lastOkAt,
              stopped_since: row.stoppedSince,
              cursor: row.cursor,
              backfill_done: row.backfillDone,
            },
            { onConflict: 'source' },
          )
          .select('source')
        return rowsOk(res)
      }),

    knownKeys: (source, keys) =>
      reading(async () => {
        const wanted = [...new Set(keys)]
        if (wanted.length === 0) return new Set<string>()
        const res = await supabase.from('notice_posts').select('source_key').eq('source', source).in('source_key', wanted)
        const found = listOf(dataOf(res)).map((r) => textOf(recordOf(r).source_key))
        return new Set(found.filter((k) => wanted.includes(k)))
      }),

    groupOf: (groupKey) =>
      reading(async () => {
        const res = await notices()
          .select(`id, group_key, title, kind, posted_on, notice_no, body, state, tries, ${POSTS}`)
          .eq('group_key', groupKey)
          .maybeSingle()
        const data = dataOf(res)
        if (data === null) return null
        const r = recordOf(data)
        const group: GroupRow = {
          id: textOf(r.id),
          groupKey: textOf(r.group_key),
          title: textOf(r.title),
          kind: oneOf(KINDS, r.kind),
          postedOn: dayOf(r.posted_on),
          noticeNo: textOrNull(r.notice_no),
          body: textOf(r.body),
          state: oneOf(STATES, r.state),
          tries: intOf(r.tries),
          posts: postsOf(r.notice_posts),
        }
        return group
      }),

    // 묶음 줄(있던 줄은 id로 고치고, 없으면 넣어 id를 받는다) → 그 id로 출처 글 한 줄. group.posts는 쓰지 않는다(출처 글은 post만 더한다)
    saveGroup: (group, post) =>
      writing(async () => {
        if (!postFits(post)) return false
        const fields = {
          title: group.title,
          kind: group.kind,
          posted_on: group.postedOn,
          notice_no: group.noticeNo,
          body: group.body,
          state: group.state,
          tries: group.tries,
        }
        let noticeId: string
        if (group.id !== undefined) {
          const res = await notices().update(fields).eq('id', group.id).select('id')
          if (!rowsOk(res)) return false
          noticeId = group.id
        } else {
          const res = await notices()
            .insert({ group_key: group.groupKey, ...fields })
            .select('id')
            .single()
          if (res.error || !isRecord(res.data) || typeof res.data.id !== 'string') return false
          noticeId = res.data.id
        }
        const res = await supabase.from('notice_posts').insert({
          notice_id: noticeId,
          source: post.source,
          source_key: post.sourceKey,
          title: post.title,
          url: post.url,
          posted_on: post.postedOn,
          attachments: post.attachments.map((a) => ({ name: a.name, url: a.url })),
        })
        return !res.error
      }),

    waiting: (limit) =>
      reading(async () => {
        const res = await notices()
          .select(`id, title, kind, posted_on, notice_no, body, tries, ${POSTS}`)
          .eq('state', 'wait')
          .order('posted_on', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit)
        return listOf(dataOf(res)).map((row): WaitingNotice => {
          const r = recordOf(row)
          return {
            id: textOf(r.id),
            title: textOf(r.title),
            kind: oneOf(KINDS, r.kind),
            postedOn: dayOf(r.posted_on),
            noticeNo: textOrNull(r.notice_no),
            body: textOf(r.body),
            tries: intOf(r.tries),
            posts: postsOf(r.notice_posts),
          }
        })
      }),

    saveSummary: (id, s) =>
      writing(async () => {
        const { related, what, when, who, forUs, amends } = s.summary
        const res = await notices()
          .update({
            summary: { related, what, when, who, forUs, amends: [...amends] },
            related,
            read_mode: s.readMode,
            attach_text: s.attachText,
            rule_hits: s.ruleHits.map((h) => ({ id: h.id, title: h.title })),
            state: 'done',
            batch_id: null,
          })
          .eq('id', id)
          .select('id')
        return rowsOk(res)
      }),

    // tries + 1, FAIL_AT이 되면 failed 아니면 wait(다음 실행이 바로 부르기로 다시). 읽은 tries 그대로일 때만 고친다
    failSummary: (id) =>
      writing(async () => {
        const cur = await notices().select('tries').eq('id', id).maybeSingle()
        if (cur.error || !isRecord(cur.data)) return false
        const tries = intOf(cur.data.tries)
        const next = tries + 1
        const res = await notices()
          .update({ tries: next, state: next >= FAIL_AT ? 'failed' : 'wait', batch_id: null })
          .eq('id', id)
          .eq('tries', tries)
          .select('id')
        return rowsOk(res)
      }),

    markBatch: (ids, batchId) =>
      writing(async () => {
        const unique = [...new Set(ids)]
        if (unique.length === 0) return true
        const res = await notices().update({ state: 'batch', batch_id: batchId }).in('id', unique).select('id')
        return rowsOk(res, unique.length)
      }),

    // batch 글을 일괄 id마다. oldest = 그 일괄 글들의 가장 이른 updated_at(markBatch 때 DB가 적은 시각)
    openBatches: () =>
      reading(async () => {
        const res = await notices().select('id, batch_id, updated_at').eq('state', 'batch')
        const byBatch = new Map<string, { ids: string[]; oldest: number }>()
        for (const row of listOf(dataOf(res))) {
          const r = recordOf(row)
          const batchId = textOrNull(r.batch_id)
          const id = textOf(r.id)
          const at = msOf(r.updated_at)
          if (batchId === null) continue
          const seen = byBatch.get(batchId)
          if (seen) {
            seen.ids.push(id)
            seen.oldest = Math.min(seen.oldest, at)
          } else byBatch.set(batchId, { ids: [id], oldest: at })
        }
        return [...byBatch]
          .sort(([, a], [, b]) => a.oldest - b.oldest)
          .map(([batchId, b]) => ({ batchId, ids: b.ids, oldest: new Date(b.oldest).toISOString() }))
      }),

    weekExists: (weekStart) =>
      reading(async () => {
        const res = await supabase.from('notice_weeks').select('week_start').eq('week_start', weekStart).maybeSingle()
        return dataOf(res) !== null
      }),

    // 그 주(월~일, 한국 날짜) 글 가운데 요약을 기다리는 글(wait·batch)이 있나(기본값 22). 한 줄만 읽는다
    weekPending: (weekStart) =>
      reading(async () => {
        const { from, to } = weekRange(weekStart)
        const res = await notices().select('id').in('state', ['wait', 'batch']).gte('posted_on', from).lte('posted_on', to).limit(1)
        return listOf(dataOf(res)).length > 0
      }),

    // 그 주(월~일, 한국 날짜) 요약이 끝난 관련 글. 요약 모양이 틀린 줄은 건너뛴다(한 줄 때문에 모음을 못 만들지 않게)
    weekNotices: (weekStart) =>
      reading(async () => {
        const { from, to } = weekRange(weekStart)
        const res = await notices()
          .select('kind, title, summary')
          .eq('state', 'done')
          .eq('related', true)
          .gte('posted_on', from)
          .lte('posted_on', to)
          .order('posted_on')
          .order('created_at')
          .limit(WEEK_ITEMS_MAX)
        const out: WeekInput[] = []
        for (const row of listOf(dataOf(res))) {
          const r = recordOf(row)
          const summary = summaryOf(r.summary)
          if (summary) out.push({ kind: oneOf(KINDS, r.kind), title: textOf(r.title), summary })
        }
        return out
      }),

    saveWeek: (d) =>
      writing(async () => {
        const res = await supabase
          .from('notice_weeks')
          .insert({ week_start: d.weekStart, top3: d.top3.map((t) => ({ head: t.head, body: t.body })) })
        return !res.error
      }),

    // 일괄로 보내기 전에 그 글의 읽기 결과만 적는다(일괄 결과에는 글 id와 답만 온다)
    saveReading: (id, r) =>
      writing(async () => {
        if (!readingFits(r)) return false
        const res = await notices().update({ read_mode: r.readMode, attach_text: r.attachText }).eq('id', id).select('id')
        return rowsOk(res)
      }),

    // 일괄을 거둘 때 그 글들(상태 상관없음). 없는 id는 빠지고 모양이 틀린 줄은 건너뛴다
    batchNotices: (ids) =>
      reading(async () => {
        const unique = [...new Set(ids)]
        if (unique.length === 0) return []
        const res = await notices().select('id, notice_no, body, read_mode, attach_text').in('id', unique)
        return listOf(dataOf(res))
          .map(batchNoticeOf)
          .filter((n): n is BatchNotice => n !== null)
      }),
  }
}
