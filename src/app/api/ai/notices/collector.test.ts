import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { addDays } from '@/lib/analytics/dates'
import { costMicroUsd } from '@/lib/ai/cost'
import type { AiUsage } from '@/types/aiReport'
import type {
  Attachment,
  CrtrTab,
  GroupPost,
  GroupRow,
  NoticeSource,
  NoticeState,
  NoticeSummary,
  PostRow,
  ReadMode,
  RuleHit,
  RunUsage,
  SiteRequest,
  SiteResult,
  SourceRow,
  WaitingNotice,
  WeekTop,
} from '@/types/notices'
import type { ClaudeRequest, callClaude } from '../claude'
import { batchCostMicroUsd, type BatchOutcome, type readBatch, type submitBatch } from './batch'
import {
  BACKFILL_UNTIL_MS,
  BATCH_PREP_UNTIL_MS,
  DIRECT_UNTIL_MS,
  LOG_TAG,
  runCollector,
  type CollectorDeps,
  type RunReport,
} from './collector'
import type { RuleBasisIndex } from './ruleMatch'
import { CRTR_LIST_URL } from './sources/hiraCrtr'
import { hiraNoticeListUrl } from './sources/hiraNotice'
import { MOHW_RSS_URL } from './sources/mohwRss'
import { SUMMARY_SYSTEM } from './summaryPrompt'
import { WEEKLY_SYSTEM } from './weeklyPrompt'

// 모으기 흐름(specs/notices REQ-7414 AC-7414.1~7414.9, design 4절, TASK-14).
// 사이트·Claude·일괄·DB는 모두 시험이 넣는 가짜다(진짜 사이트·Claude·Supabase에 붙지 않는다).
// 가짜 DB는 collectStore.ts(TASK-13)와 같이 움직인다: saveSummary = done·일괄 id 지움, failSummary = tries+1·3이면 failed 아니면 wait·일괄 id 지움,
// markBatch = 모든 id를 고쳤을 때만 true, openBatches.oldest = 그 일괄 글의 가장 이른 updated_at. 사이트 쪽 글은 지어낸 짧은 HTML이다

const NOW = new Date('2026-11-21T07:10:00+09:00') // 토요일, 한국 07시대 아침 실행
const NOW_ISO = NOW.toISOString()
const TODAY_0700 = '2026-11-20T22:00:00.000Z' // 한국 2026-11-21 07:00 = 오늘 확인함
const YESTERDAY_2300 = '2026-11-20T14:00:00.000Z' // 한국 2026-11-20 23:00 = 어제
const LAST_WEEK = '2026-11-09' // 오늘(토)의 지난주 월요일
const HOUR = 3_600_000
const SOURCES: NoticeSource[] = ['hira_notice', 'hira_crtr', 'mohw_rss']
const USAGE: AiUsage = { inputTokens: 1000, outputTokens: 200, model: 'claude-opus-5-5' }
const SUMMARY: NoticeSummary = {
  related: true,
  what: '체외충격파 인정 횟수가 바뀌어요.',
  when: '2026년 12월 1일부터예요.',
  who: '의원급 외래예요.',
  forUs: '12월 청구부터 횟수를 확인해요.',
  amends: ['2026-100'],
}
const TOP: WeekTop = { head: '체외충격파 횟수 변경', body: '12월부터 바뀌어요.' }
const RULES: RuleBasisIndex = new Map<string, RuleHit[]>([
  ['2026-100', [{ id: 'R-01', title: '규칙 하나' }]],
  ['2026-50', [{ id: 'R-02', title: '규칙 둘' }]],
  ['2026-300', [{ id: 'R-03', title: '자기 번호 규칙' }]],
])

// ── 사이트 글 ──────────────────────────────────────────────

const HIRA = 'https://www.hira.or.kr'
const viewUrl = (key: number) => `${HIRA}/bbsDummy.do?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=${key}`
const fileUrl = (n: number) => `${HIRA}/bbs/bbsCDownLoad.do?apndNo=${n}&apndBrdBltNo=500&apndBrdTyNo=2&apndBltNo=1`
const crtrPage = (tab: CrtrTab, page: number) => `${CRTR_LIST_URL}|tabGbn=${tab}&pageIndex=${page}`
const popupUrl = (r: CrtrRow) => `${HIRA}/rc/insu/insuadtcrtr/InsuAdtCrtrPopup.do?mtgHmeDd=${r.d}&sno=${r.s}&mtgMtrRegSno=${r.m}`
const rssLink = (no: number) => `https://www.mohw.go.kr/board.es?mid=a10409020000&bid=0026&list_no=${no}&act=view`

type NoticeRow = { key: number; date: string; title?: string }
function noticeList(rows: NoticeRow[]): string {
  const trs = rows.map(
    (r) =>
      `<tr><td class="col-num">1</td><td class="col-tit"><a href="?pgmid=HIRAA020002000100&brdScnBltNo=4&brdBltNo=${r.key}&amp;pageIndex=1">${r.title ?? `공지 ${r.key}`}</a><i class="icon-new">새글</i></td><td class="col-date">${r.date}</td></tr>`,
  )
  return `<table><tbody>${trs.join('')}</tbody></table>`
}
function noticeView(body: string, files: { n: number; name: string }[] = []): string {
  const lis = files.map(
    (f) => `<li><span class="obj-sr-only">pdf</span>${f.name} <a href="#none" onclick="downLoadBbs('${f.n}','500','2','1');" class="btn_file">첨부파일 다운로드</a></li>`,
  )
  return `<div class="viewCont"><div class="fileBox"><ul>${lis.join('')}</ul></div><div class="view"><p>${body}</p></div></div>`
}

type CrtrRow = { d: string; s: string; m: string; ref: string; title: string; date: string }
function crtrList(tab: CrtrTab, rows: CrtrRow[]): string {
  const trs = rows.map(
    (r, i) =>
      `<tr><td class="col-num2">${r.ref}</td><td class="col-tit"><a href="#none" onclick="viewInsuAdtCrtr(${i + 1}, '${r.d}', '${r.s}', '${r.m}', '${i + 1}'); return false;">${r.title}</a></td><td class="col-date">${r.date}</td></tr>`,
  )
  return `<form><input type="hidden" name="decIteTpCd" value="${tab}" /></form><table><tbody>${trs.join('')}</tbody></table>`
}
const crtrPopup = (body: string) => `<div class="viewCont"><div class="title">제목</div><div class="view"><p>${body}</p></div></div>`

type RssItem = { no: number; title: string; desc?: string; date: string }
function rss(items: RssItem[]): string {
  const xs = items.map(
    (i) =>
      `<item><title><![CDATA[${i.title}]]></title><link>https://www.mohw.go.kr/board.es?mid=a10409020000&amp;bid=0026&amp;list_no=${i.no}&amp;act=view</link><description><![CDATA[${i.desc ?? '설명 글'}]]></description><pubDate>${i.date}</pubDate></item>`,
  )
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>복지부</title>${xs.join('')}</channel></rss>`
}

/** 시험이 만든 HWPX(붙임 글자가 든 zip) */
function hwpx(text: string): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p><hp:run><hp:t>${text}</hp:t></hp:run></hp:p></hs:sec>`
  return zipSync({ mimetype: strToU8('application/hwp+zip'), 'Contents/section0.xml': strToU8(xml) }, { level: 1 })
}

// ── 가짜 DB ────────────────────────────────────────────────

type DbNotice = Omit<GroupRow, 'id' | 'posts'> & {
  id: string
  seq: number
  posts: PostRow[]
  batchId: string | null
  updatedAt: string
  summary: NoticeSummary | null
  related: boolean | null
  readMode: ReadMode | null
  attachText: string
  ruleHits: RuleHit[]
}

type Seed = {
  postedOn?: string
  tries?: number
  state?: NoticeState
  noticeNo?: string | null
  body?: string
  title?: string
  attachments?: Attachment[]
  batchId?: string | null
  updatedAt?: string
  summary?: NoticeSummary | null
  readMode?: ReadMode | null
  attachText?: string
}

const groupPost = (p: PostRow): GroupPost => ({
  source: p.source,
  title: p.title,
  url: p.url,
  postedOn: p.postedOn,
  attachments: p.attachments.map((a) => ({ ...a })),
})

function sourceRow(source: NoticeSource, over: Partial<SourceRow> = {}): SourceRow {
  return {
    source,
    state: 'ok',
    errorCode: null,
    checkedAt: TODAY_0700,
    lastOkAt: TODAY_0700,
    stoppedSince: null,
    cursor: {},
    backfillDone: true,
    ...over,
  }
}

function makeStore(log: string[]) {
  let seq = 0
  const db = {
    notices: [] as DbNotice[],
    sources: new Map<NoticeSource, SourceRow>(SOURCES.map((s) => [s, sourceRow(s)])),
    weeks: new Map<string, WeekTop[]>([[LAST_WEEK, []]]),
    usage: [] as { runId: string; u: RunUsage }[],
    finished: [] as { runId: string; counts: Record<string, unknown> }[],
  }
  const hooks: Partial<Record<string, () => void>> = {}
  const enter = (name: string) => {
    log.push(name)
    hooks[name]?.()
  }
  const find = (id: string) => db.notices.find((n) => n.id === id)
  const toGroup = (n: DbNotice): GroupRow => ({
    id: n.id,
    groupKey: n.groupKey,
    title: n.title,
    kind: n.kind,
    postedOn: n.postedOn,
    noticeNo: n.noticeNo,
    body: n.body,
    state: n.state,
    tries: n.tries,
    posts: n.posts.map(groupPost),
  })
  const toWaiting = (n: DbNotice): WaitingNotice => ({
    id: n.id,
    title: n.title,
    kind: n.kind,
    postedOn: n.postedOn,
    noticeNo: n.noticeNo,
    body: n.body,
    tries: n.tries,
    posts: n.posts.map(groupPost),
  })

  const store: CollectorDeps['store'] = {
    startRun: async () => {
      enter('startRun')
      return 'run-1'
    },
    addRunUsage: async (runId, u) => {
      enter('addRunUsage')
      db.usage.push({ runId, u: { ...u } })
      return true
    },
    finishRun: async (runId, counts) => {
      enter('finishRun')
      db.finished.push({ runId, counts: structuredClone(counts) })
      return true
    },
    sources: async () => {
      enter('sources')
      return [...db.sources.values()].map((r) => structuredClone(r))
    },
    saveSource: async (row) => {
      enter('saveSource')
      db.sources.set(row.source, structuredClone(row))
      return true
    },
    knownKeys: async (source, keys) => {
      enter('knownKeys')
      const have = new Set(db.notices.flatMap((n) => n.posts.filter((p) => p.source === source).map((p) => p.sourceKey)))
      return new Set(keys.filter((k) => have.has(k)))
    },
    groupOf: async (groupKey) => {
      enter('groupOf')
      const n = db.notices.find((x) => x.groupKey === groupKey)
      return n ? toGroup(n) : null
    },
    saveGroup: async (group, post) => {
      enter('saveGroup')
      const fields = {
        title: group.title,
        kind: group.kind,
        postedOn: group.postedOn,
        noticeNo: group.noticeNo,
        body: group.body,
        state: group.state,
        tries: group.tries,
      }
      let n: DbNotice | undefined
      if (group.id === undefined) {
        if (db.notices.some((x) => x.groupKey === group.groupKey)) return false
        seq += 1
        n = {
          id: `notice-${seq}`,
          seq,
          groupKey: group.groupKey,
          ...fields,
          posts: [],
          batchId: null,
          updatedAt: NOW_ISO,
          summary: null,
          related: null,
          readMode: null,
          attachText: '',
          ruleHits: [],
        }
        db.notices.push(n)
      } else {
        n = find(group.id)
        if (!n) return false
        Object.assign(n, fields)
      }
      if (db.notices.some((x) => x.posts.some((p) => p.source === post.source && p.sourceKey === post.sourceKey))) return false
      n.posts.push(structuredClone(post))
      return true
    },
    waiting: async (limit) => {
      enter('waiting')
      return db.notices
        .filter((n) => n.state === 'wait')
        .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || b.seq - a.seq)
        .slice(0, limit)
        .map(toWaiting)
    },
    saveSummary: async (id, s) => {
      enter('saveSummary')
      const n = find(id)
      if (!n) return false
      Object.assign(n, {
        summary: structuredClone(s.summary),
        related: s.summary.related,
        readMode: s.readMode,
        attachText: s.attachText,
        ruleHits: structuredClone(s.ruleHits),
        state: 'done',
        batchId: null,
      })
      return true
    },
    failSummary: async (id) => {
      enter('failSummary')
      const n = find(id)
      if (!n) return false
      n.tries += 1
      n.state = n.tries >= 3 ? 'failed' : 'wait'
      n.batchId = null
      return true
    },
    markBatch: async (ids, batchId) => {
      enter('markBatch')
      let all = true
      for (const id of ids) {
        const n = find(id)
        if (!n) {
          all = false
          continue
        }
        n.state = 'batch'
        n.batchId = batchId
        n.updatedAt = NOW_ISO
      }
      return all
    },
    openBatches: async () => {
      enter('openBatches')
      const by = new Map<string, { ids: string[]; oldest: string }>()
      for (const n of db.notices) {
        if (n.state !== 'batch' || n.batchId === null) continue
        const b = by.get(n.batchId)
        if (b) {
          b.ids.push(n.id)
          if (n.updatedAt < b.oldest) b.oldest = n.updatedAt
        } else by.set(n.batchId, { ids: [n.id], oldest: n.updatedAt })
      }
      return [...by].map(([batchId, b]) => ({ batchId, ...b }))
    },
    weekExists: async (weekStart) => {
      enter('weekExists')
      return db.weeks.has(weekStart)
    },
    weekNotices: async (weekStart) => {
      enter('weekNotices')
      const to = addDays(weekStart, 6)
      return db.notices.flatMap((n) =>
        n.state === 'done' && n.related === true && n.summary !== null && n.postedOn >= weekStart && n.postedOn <= to
          ? [{ kind: n.kind, title: n.title, summary: structuredClone(n.summary) }]
          : [],
      )
    },
    saveWeek: async (d) => {
      enter('saveWeek')
      if (db.weeks.has(d.weekStart)) return false
      db.weeks.set(d.weekStart, structuredClone(d.top3))
      return true
    },
    saveReading: async (id, r) => {
      enter('saveReading')
      const n = find(id)
      if (!n) return false
      n.readMode = r.readMode
      n.attachText = r.attachText
      return true
    },
    batchNotices: async (ids) => {
      enter('batchNotices')
      return db.notices
        .filter((n) => ids.includes(n.id))
        .map((n) => ({ id: n.id, noticeNo: n.noticeNo, body: n.body, readMode: n.readMode, attachText: n.attachText }))
    },
  }

  /** 요약 전 글 하나(심평원 공지 글 하나짜리 묶음). 출처 key는 900 + 순번 */
  function seed(over: Seed = {}): DbNotice {
    seq += 1
    const postedOn = over.postedOn ?? '2026-11-20'
    const title = over.title ?? `글 ${seq}`
    const key = 900 + seq
    const n: DbNotice = {
      id: `notice-${seq}`,
      seq,
      groupKey: `post:hira_notice:${key}`,
      title,
      kind: 'notice',
      postedOn,
      noticeNo: over.noticeNo ?? null,
      body: over.body ?? `[${title}]\n본문 ${seq}`,
      state: over.state ?? 'wait',
      tries: over.tries ?? 0,
      batchId: over.batchId ?? null,
      updatedAt: over.updatedAt ?? NOW_ISO,
      summary: over.summary ?? null,
      related: over.summary ? over.summary.related : null,
      readMode: over.readMode ?? null,
      attachText: over.attachText ?? '',
      ruleHits: [],
      posts: [{ source: 'hira_notice', sourceKey: String(key), title, url: viewUrl(key), postedOn, attachments: over.attachments ?? [] }],
    }
    db.notices.push(n)
    return n
  }

  return { store, db, hooks, seed }
}

// ── 가짜 사이트 ────────────────────────────────────────────

const siteId = (req: SiteRequest) => (req.form === undefined ? req.url : `${req.url}|${req.form}`)

function makeSite(log: string[]) {
  const answers = new Map<string, SiteResult>()
  const fetchSite = vi.fn(async (req: SiteRequest): Promise<SiteResult> => {
    const id = siteId(req)
    log.push(`site ${id}`)
    return answers.get(id) ?? { ok: false, fail: 'http' }
  })
  return {
    fetchSite,
    page: (id: string, text: string) => answers.set(id, { ok: true, text }),
    file: (url: string, bytes: Uint8Array) => answers.set(url, { ok: true, bytes }),
    fail: (id: string, fail: Extract<SiteResult, { ok: false }>['fail']) => answers.set(id, { ok: false, fail }),
    asked: () => fetchSite.mock.calls.map(([req]) => siteId(req)),
  }
}

// ── 한 실행의 세상 ──────────────────────────────────────────

const answer = (value: unknown) => ({ ok: true as const, text: JSON.stringify(value), usage: USAGE })

function world() {
  const log: string[] = []
  const { store, db, hooks, seed } = makeStore(log)
  const site = makeSite(log)
  let ms = 0
  const claude = vi.fn<typeof callClaude>(async (req) => {
    const week = req.system === WEEKLY_SYSTEM
    log.push(week ? 'claude week' : 'claude summary')
    return week ? answer({ top3: [TOP] }) : answer(SUMMARY)
  })
  const submit = vi.fn<typeof submitBatch>(async (items) => {
    log.push('submitBatch')
    return { ok: true, batchId: 'msgbatch_01', sent: items.map((i) => i.id), left: [] }
  })
  const read = vi.fn<typeof readBatch>(async () => {
    log.push('readBatch')
    return 'processing'
  })
  const deps: CollectorDeps = {
    store,
    fetchSite: site.fetchSite,
    callClaude: claude,
    submitBatch: submit,
    readBatch: read,
    ruleIndex: RULES,
    nowMs: () => ms,
    now: () => NOW,
  }
  const setSource = (source: NoticeSource, over: Partial<SourceRow>) => db.sources.set(source, sourceRow(source, over))
  const keys = (source: NoticeSource) => db.notices.flatMap((n) => n.posts.filter((p) => p.source === source).map((p) => p.sourceKey))
  const byKey = (source: NoticeSource, key: string | number) =>
    db.notices.find((n) => n.posts.some((p) => p.source === source && p.sourceKey === String(key)))
  return {
    log,
    db,
    hooks,
    seed,
    site,
    deps,
    claude,
    submit,
    read,
    setSource,
    keys,
    byKey,
    setMs: (v: number) => {
      ms = v
    },
  }
}

async function runReport(deps: CollectorDeps): Promise<RunReport> {
  const result = await runCollector(deps)
  if (result === 'busy' || result === 'failed') throw new Error(`실행 결과가 ${result}`)
  return result
}

/** 요약 요청의 <notice> 제목 줄 */
function titleOf(req: ClaudeRequest): string {
  const first = Array.isArray(req.user) ? req.user[0] : null
  const text = first !== null && first.type === 'text' ? first.text : String(req.user)
  return /제목: (.*)/.exec(text)?.[1] ?? ''
}

function userText(req: ClaudeRequest): string {
  if (typeof req.user === 'string') return req.user
  return req.user.map((b) => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n')
}

let errors: MockInstance<typeof console.error>

beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  errors.mockRestore()
})

const logged = () => errors.mock.calls.map((c) => c[1] as string)

// ── AC-7414.1 ──────────────────────────────────────────────

describe('AC-7414.1 다른 실행이 돎', () => {
  it('AC-7414.1: startRun이 null이면 사이트·Claude·일괄을 부르지 않고 busy다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null, backfillDone: false })
    w.seed({ postedOn: '2026-11-21' })
    w.deps.store.startRun = async () => null
    expect(await runCollector(w.deps)).toBe('busy')
    expect(w.site.fetchSite).not.toHaveBeenCalled()
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.submit).not.toHaveBeenCalled()
    expect(w.read).not.toHaveBeenCalled()
    expect(w.log).toEqual([])
  })

  it('AC-7414.1: startRun이 던지면(DB 오류) 아무것도 하지 않고 failed다', async () => {
    const w = world()
    w.deps.store.startRun = async () => {
      throw new Error('notices store read failed')
    }
    expect(await runCollector(w.deps)).toBe('failed')
    expect(w.site.fetchSite).not.toHaveBeenCalled()
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.log).toEqual([])
  })
})

// ── AC-7414.2 ──────────────────────────────────────────────

describe('AC-7414.2 차례와 시간 표', () => {
  it('AC-7414.2: 일괄 거두기 → 새 글 확인 → 지난주 모음 → 요약 → 지난 글 채우기 → 실행 마감 차례다', async () => {
    const w = world()
    w.seed({ state: 'batch', batchId: 'msgbatch_old', updatedAt: new Date(NOW.getTime() - HOUR).toISOString() })
    const known = w.seed({ state: 'done', postedOn: '2026-11-10', summary: SUMMARY })
    w.seed({ postedOn: '2026-03-02' })
    w.db.weeks.delete(LAST_WEEK)
    w.setSource('hira_notice', { checkedAt: YESTERDAY_2300, backfillDone: false, cursor: { page: 5 } })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 101, date: '2026-11-20' },
        { key: Number(known.posts[0].sourceKey), date: '2026-11-10' },
      ]),
    )
    w.site.page(viewUrl(101), noticeView('새 글 본문'))
    w.site.page(hiraNoticeListUrl(6), noticeList([{ key: 50, date: '2025-12-20' }]))

    await runReport(w.deps)

    const at = (label: string) => {
      const i = w.log.indexOf(label)
      expect(i, label).toBeGreaterThanOrEqual(0)
      return i
    }
    const order = [
      at('readBatch'),
      at(`site ${hiraNoticeListUrl(1)}`),
      at('claude week'),
      at('claude summary'),
      at('submitBatch'),
      at(`site ${hiraNoticeListUrl(6)}`),
      at('finishRun'),
    ]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(w.log.at(-1)).toBe('finishRun')
  })

  function timed(ms: number) {
    const w = world()
    const recent = w.seed({ postedOn: '2026-11-21' })
    const old = w.seed({ postedOn: '2026-03-02' })
    w.setSource('hira_notice', { backfillDone: false, cursor: { page: 5 } })
    w.site.page(hiraNoticeListUrl(6), noticeList([{ key: 50, date: '2025-12-20' }]))
    w.hooks.weekExists = () => w.setMs(ms) // 새 글 확인·모음까지 ms가 걸렸다
    return { w, recent, old }
  }

  it('AC-7414.2: 170초가 넘으면 새 바로 요약을 시작하지 않는다(일괄 준비·지난 글은 한다)', async () => {
    const { w, recent, old } = timed(DIRECT_UNTIL_MS + 1_000)
    await runReport(w.deps)
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.db.notices.find((n) => n.id === recent.id)).toMatchObject({ state: 'wait', tries: 0 })
    expect(w.submit.mock.calls[0][0].map((i) => i.id)).toEqual([old.id])
    expect(w.site.asked()).toContain(hiraNoticeListUrl(6))
  })

  it('AC-7414.2: 230초가 넘으면 일괄 준비도 하지 않는다(지난 글은 한다)', async () => {
    const { w, recent, old } = timed(BATCH_PREP_UNTIL_MS + 1_000)
    await runReport(w.deps)
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.submit).not.toHaveBeenCalled()
    for (const n of [recent, old]) expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({ state: 'wait', tries: 0 })
    expect(w.site.asked()).toContain(hiraNoticeListUrl(6))
  })

  it('AC-7414.2: 250초가 넘으면 지난 글 채우기를 멈추고 실행을 마감한다', async () => {
    const { w } = timed(BACKFILL_UNTIL_MS + 1_000)
    await runReport(w.deps)
    expect(w.site.fetchSite).not.toHaveBeenCalled()
    expect(w.db.sources.get('hira_notice')).toMatchObject({ cursor: { page: 5 }, backfillDone: false })
    expect(w.log.at(-1)).toBe('finishRun')
  })

  it('AC-7414.2: 바로 요약 도중 170초가 지나면 남은 글은 시작하지 않고 wait로 둔다', async () => {
    const w = world()
    const list = ['2026-11-21', '2026-11-21', '2026-11-20', '2026-11-20', '2026-11-19'].map((postedOn) => w.seed({ postedOn }))
    w.claude.mockImplementation(async () => {
      w.setMs(DIRECT_UNTIL_MS + 1)
      return answer(SUMMARY)
    })
    await runReport(w.deps)
    expect(w.claude.mock.calls.length).toBeLessThanOrEqual(3)
    expect(w.db.notices.find((n) => n.id === list[4].id)).toMatchObject({ state: 'wait', tries: 0 })
  })
})

// ── AC-7414.3 ──────────────────────────────────────────────

describe('AC-7414.3 새 글 확인', () => {
  it('AC-7414.3: 오늘(한국 날짜) 확인한 출처는 건너뛰고, 어제 확인한 출처는 다시 본다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: TODAY_0700 })
    w.setSource('mohw_rss', { checkedAt: YESTERDAY_2300 })
    w.site.page(MOHW_RSS_URL, rss([{ no: 1, title: '복지부 글', date: 'Fri, 20 Nov 2026 01:00:00 GMT' }]))
    await runReport(w.deps)
    expect(w.site.asked()).toEqual([MOHW_RSS_URL])
    expect(w.db.sources.get('mohw_rss')?.checkedAt).toBe(NOW_ISO)
    expect(w.db.sources.get('hira_notice')?.checkedAt).toBe(TODAY_0700)
  })

  it('AC-7414.3: 쪽의 줄이 모두 새것이면 다음 쪽을 보고, 아는 줄이 있으면 멈춘다', async () => {
    const w = world()
    const known = w.seed({ state: 'done' })
    w.setSource('hira_notice', { checkedAt: null })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 201, date: '2026-11-20' },
        { key: 202, date: '2026-11-19' },
      ]),
    )
    w.site.page(
      hiraNoticeListUrl(2),
      noticeList([
        { key: 203, date: '2026-11-18' },
        { key: Number(known.posts[0].sourceKey), date: '2026-11-17' },
      ]),
    )
    for (const k of [201, 202, 203]) w.site.page(viewUrl(k), noticeView(`본문 ${k}`))
    await runReport(w.deps)
    const asked = w.site.asked()
    expect(asked).toContain(hiraNoticeListUrl(2))
    expect(asked).not.toContain(hiraNoticeListUrl(3))
    expect(w.keys('hira_notice').sort()).toEqual(['201', '202', '203', known.posts[0].sourceKey].sort())
  })

  it('AC-7414.3: 모두 새 글이어도 5쪽까지만 본다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null })
    for (let p = 1; p <= 6; p += 1) {
      w.site.page(hiraNoticeListUrl(p), noticeList([{ key: 300 + p, date: '2026-11-10' }]))
      w.site.page(viewUrl(300 + p), noticeView(`본문 ${p}`))
    }
    await runReport(w.deps)
    const lists = w.site.asked().filter((u) => u.includes('pageIndex='))
    expect(lists).toEqual([1, 2, 3, 4, 5].map(hiraNoticeListUrl))
    expect(w.keys('hira_notice').sort()).toEqual(['301', '302', '303', '304', '305'])
  })

  it('AC-7414.3: 2026-01-01보다 앞 글과 이미 있는 key는 넣지 않고, 앞 글이 나온 쪽에서 멈춘다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 401, date: '2026-01-02' },
        { key: 402, date: '2025-12-31' },
      ]),
    )
    w.site.page(viewUrl(401), noticeView('본문 401'))
    w.site.page(viewUrl(402), noticeView('본문 402'))
    await runReport(w.deps)
    expect(w.keys('hira_notice')).toEqual(['401'])
    expect(w.site.asked()).not.toContain(viewUrl(402))
    expect(w.site.asked()).not.toContain(hiraNoticeListUrl(2))
  })

  it('AC-7414.3: 심평원 공지는 글 쪽을 읽어 본문·붙임 목록을 함께 저장하고 확인 시각을 남긴다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: YESTERDAY_2300, lastOkAt: YESTERDAY_2300 })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 501, date: '2026-11-20', title: '도수치료 안내' },
        { key: 9, date: '2025-11-01' },
      ]),
    )
    w.site.page(
      viewUrl(501),
      noticeView('도수치료 본문 글', [
        { n: 1, name: '안내문' },
        { n: 2, name: '[붙임1] 서식' },
      ]),
    )
    await runReport(w.deps)
    const n = w.byKey('hira_notice', 501)
    expect(n).toMatchObject({ title: '도수치료 안내', postedOn: '2026-11-20' })
    expect(n?.body).toContain('도수치료 본문 글')
    expect(n?.posts[0]).toEqual({
      source: 'hira_notice',
      sourceKey: '501',
      title: '도수치료 안내',
      url: viewUrl(501),
      postedOn: '2026-11-20',
      attachments: [
        { name: '안내문', url: fileUrl(1) },
        { name: '[붙임1] 서식', url: fileUrl(2) },
      ],
    })
    expect(w.db.sources.get('hira_notice')).toMatchObject({ state: 'ok', checkedAt: NOW_ISO, lastOkAt: NOW_ISO, errorCode: null })
  })

  it('AC-7414.3: 심사기준은 탭 넷의 1쪽을 POST로 읽고 팝업 본문을 저장한다(같은 고시 줄은 한 묶음)', async () => {
    const w = world()
    w.setSource('hira_crtr', { checkedAt: null })
    const tabs: CrtrTab[] = ['01', '02', '09', '10']
    const gosi: CrtrRow[] = [
      { d: '20261112', s: '1', m: '0004', ref: '고시 제2026-234호(행위)', title: '가10 격리실 입원료', date: '2026-11-12' },
      { d: '20261112', s: '1', m: '0007', ref: '고시 제2026-234호(행위)', title: '가21-1 안전관찰료', date: '2026-11-12' },
    ]
    const old: CrtrRow = { d: '20251201', s: '1', m: '0001', ref: '', title: '옛 글', date: '2025-12-01' }
    for (const tab of tabs) {
      const rows: CrtrRow[] =
        tab === '01' ? [...gosi, old] : [{ d: `202611${tab}`, s: '2', m: '0001', ref: `${tab} 근거`, title: `탭 ${tab} 글`, date: '2026-11-05' }, old]
      w.site.page(crtrPage(tab, 1), crtrList(tab, rows))
      for (const r of rows) w.site.page(popupUrl(r), crtrPopup(`${r.title} 팝업 본문`))
    }
    await runReport(w.deps)
    const lists = w.site.fetchSite.mock.calls.map(([req]) => req).filter((req) => req.url === CRTR_LIST_URL)
    expect(lists.map((req) => [req.method, req.form])).toEqual(tabs.map((t) => ['POST', `tabGbn=${t}&pageIndex=1`]))
    const group = w.db.notices.find((n) => n.groupKey === 'gosi:2026-234')
    expect(group?.posts.map((p) => p.sourceKey)).toEqual(['20261112-1-0004', '20261112-1-0007'])
    expect(group?.body).toContain('가10 격리실 입원료 팝업 본문')
    expect(group?.body).toContain('가21-1 안전관찰료 팝업 본문')
    expect(w.keys('hira_crtr')).toHaveLength(5)
    expect(w.site.asked()).not.toContain(popupUrl(old))
    expect(w.db.sources.get('hira_crtr')).toMatchObject({ state: 'ok', checkedAt: NOW_ISO })
  })

  it('AC-7414.3: 복지부는 RSS 글을 본문으로 넣고 글·붙임 쪽은 부르지 않는다', async () => {
    const w = world()
    w.setSource('mohw_rss', { checkedAt: null })
    w.site.page(
      MOHW_RSS_URL,
      rss([
        { no: 1492620, title: '요양비 고시 일부개정', desc: '보건복지부고시 제2026-237호 요양비 기준', date: 'Fri, 20 Nov 2026 11:05:00 GMT' },
        { no: 1, title: '옛 훈령', date: 'Wed, 31 Dec 2025 01:00:00 GMT' },
      ]),
    )
    await runReport(w.deps)
    expect(w.site.asked()).toEqual([MOHW_RSS_URL])
    const n = w.byKey('mohw_rss', 1492620)
    expect(n).toMatchObject({ groupKey: 'gosi:2026-237', noticeNo: '2026-237', kind: 'gosi', postedOn: '2026-11-20' })
    expect(n?.body).toContain('요양비 기준')
    expect(n?.posts[0].url).toBe(rssLink(1492620))
    expect(w.keys('mohw_rss')).toEqual(['1492620'])
  })

  it('AC-7414.3: 글 쪽을 읽지 못했거나 본문·붙임이 모두 없는 쪽이면 그 줄은 이번에 넣지 않는다', async () => {
    const w = world()
    const known = w.seed({ state: 'done' })
    w.setSource('hira_notice', { checkedAt: null })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 601, date: '2026-11-20' },
        { key: 602, date: '2026-11-20' },
        { key: 603, date: '2026-11-20' },
        { key: Number(known.posts[0].sourceKey), date: '2026-11-19' },
      ]),
    )
    w.site.page(viewUrl(601), noticeView('본문 601'))
    w.site.fail(viewUrl(602), 'timeout')
    w.site.page(viewUrl(603), '<html><body><p>잠시 후 다시 시도해 주세요</p></body></html>')
    await runReport(w.deps)
    expect(w.byKey('hira_notice', 601)).toBeDefined()
    expect(w.byKey('hira_notice', 602)).toBeUndefined()
    expect(w.byKey('hira_notice', 603)).toBeUndefined()
    expect(w.db.sources.get('hira_notice')).toMatchObject({ state: 'ok', checkedAt: NOW_ISO })
  })

  it('AC-7414.3: 심사기준 팝업 본문이 비면 그 줄은 넣지 않는다', async () => {
    const w = world()
    w.setSource('hira_crtr', { checkedAt: null })
    const ok: CrtrRow = { d: '20261101', s: '1', m: '0001', ref: '근거 가', title: '읽힌 글', date: '2026-11-01' }
    const empty: CrtrRow = { d: '20261101', s: '1', m: '0002', ref: '근거 나', title: '빈 글', date: '2026-11-01' }
    const old: CrtrRow = { d: '20251201', s: '1', m: '0001', ref: '', title: '옛 글', date: '2025-12-01' }
    for (const tab of ['01', '02', '09', '10'] as CrtrTab[]) {
      w.site.page(crtrPage(tab, 1), crtrList(tab, tab === '01' ? [ok, empty, old] : [old]))
    }
    w.site.page(popupUrl(ok), crtrPopup('읽힌 본문'))
    w.site.page(popupUrl(empty), '<div class="viewCont"><div class="title">빈 글</div></div>')
    await runReport(w.deps)
    expect(w.keys('hira_crtr')).toEqual(['20261101-1-0001'])
  })
})

// ── AC-7414.4 ──────────────────────────────────────────────

describe('AC-7414.4 한 출처가 막힘', () => {
  it('AC-7414.4: 목록 읽기 실패·0줄인 출처만 stopped(처음 멈춘 시각)이고 다른 출처는 계속한다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: YESTERDAY_2300 })
    w.setSource('hira_crtr', { checkedAt: YESTERDAY_2300 })
    w.setSource('mohw_rss', { checkedAt: YESTERDAY_2300 })
    w.site.fail(hiraNoticeListUrl(1), 'http')
    w.site.page(crtrPage('01', 1), '<html><body>목록 없음</body></html>')
    w.site.page(MOHW_RSS_URL, rss([{ no: 7, title: '복지부 글', date: 'Fri, 20 Nov 2026 01:00:00 GMT' }]))
    const report = await runReport(w.deps)
    expect(w.db.sources.get('hira_notice')).toMatchObject({
      state: 'stopped',
      errorCode: 'http',
      stoppedSince: NOW_ISO,
      checkedAt: YESTERDAY_2300,
      lastOkAt: TODAY_0700,
    })
    expect(w.db.sources.get('hira_crtr')).toMatchObject({ state: 'stopped', errorCode: 'shape', stoppedSince: NOW_ISO })
    expect(w.db.sources.get('mohw_rss')).toMatchObject({ state: 'ok', checkedAt: NOW_ISO })
    expect(w.keys('mohw_rss')).toEqual(['7'])
    expect(report.stopped).toEqual(['hira_notice', 'hira_crtr'])
    expect(logged()).toEqual(expect.arrayContaining(['E-NOTICE-SRC-hira_notice', 'E-NOTICE-SRC-hira_crtr']))
  })

  it.each([
    ['timeout', 'blocked'],
    ['blocked-url', 'blocked'],
    ['http', 'http'],
    ['too-big', 'http'],
  ] as const)('AC-7414.4: 목록 실패 %s는 오류 %s다', async (fail, code) => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null })
    w.site.fail(hiraNoticeListUrl(1), fail)
    await runReport(w.deps)
    expect(w.db.sources.get('hira_notice')).toMatchObject({ state: 'stopped', errorCode: code })
  })

  it('AC-7414.4: 이미 멈춘 출처가 또 실패하면 처음 멈춘 시각을 그대로 둔다', async () => {
    const w = world()
    const since = '2026-11-19T22:00:00.000Z'
    w.setSource('hira_notice', { state: 'stopped', errorCode: 'http', stoppedSince: since, checkedAt: null })
    w.site.fail(hiraNoticeListUrl(1), 'timeout')
    await runReport(w.deps)
    expect(w.db.sources.get('hira_notice')).toMatchObject({ state: 'stopped', errorCode: 'blocked', stoppedSince: since })
  })

  it('AC-7414.4: 멈췄던 출처가 성공하면 ok·성공 시각이고 멈춘 시각·오류를 지운다', async () => {
    const w = world()
    w.setSource('hira_notice', { state: 'stopped', errorCode: 'shape', stoppedSince: '2026-11-19T22:00:00.000Z', checkedAt: YESTERDAY_2300 })
    w.site.page(hiraNoticeListUrl(1), noticeList([{ key: 5, date: '2025-11-01' }]))
    await runReport(w.deps)
    expect(w.db.sources.get('hira_notice')).toEqual(
      sourceRow('hira_notice', { state: 'ok', errorCode: null, stoppedSince: null, checkedAt: NOW_ISO, lastOkAt: NOW_ISO }),
    )
  })

  it('AC-7414.4: 이번에 멈춘 출처는 지난 글 채우기도 하지 않는다', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null, backfillDone: false, cursor: { page: 3 } })
    w.site.fail(hiraNoticeListUrl(1), 'http')
    await runReport(w.deps)
    expect(w.site.asked()).toEqual([hiraNoticeListUrl(1)])
    expect(w.db.sources.get('hira_notice')?.cursor).toEqual({ page: 3 })
  })
})

// ── AC-7414.5 ──────────────────────────────────────────────

describe('AC-7414.5 요약', () => {
  it('AC-7414.5: 최근 글부터, 3일 안이거나 tries ≥ 1이면 바로, 아니면 일괄로 모은다', async () => {
    const w = world()
    const a = w.seed({ postedOn: '2026-11-21' })
    const b = w.seed({ postedOn: '2026-11-19' })
    const c = w.seed({ postedOn: '2026-11-18' })
    const d = w.seed({ postedOn: '2026-11-01', tries: 1 })
    const e = w.seed({ postedOn: '2026-10-01' })
    await runReport(w.deps)
    expect(w.claude.mock.calls.map(([req]) => titleOf(req))).toEqual([a.title, b.title, d.title])
    expect(w.submit.mock.calls[0][0].map((i) => i.id)).toEqual([c.id, e.id])
    for (const n of [a, b, d]) expect(w.db.notices.find((x) => x.id === n.id)?.state).toBe('done')
    for (const n of [c, e]) expect(w.db.notices.find((x) => x.id === n.id)?.state).toBe('batch')
  })

  it('AC-7414.5: 바로 요약은 동시에 3개까지다', async () => {
    const w = world()
    for (let i = 0; i < 6; i += 1) w.seed({ postedOn: '2026-11-21' })
    let active = 0
    let peak = 0
    w.claude.mockImplementation(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return answer(SUMMARY)
    })
    const report = await runReport(w.deps)
    expect(w.claude).toHaveBeenCalledTimes(6)
    expect(peak).toBe(3)
    expect(report.summarized).toBe(6)
  })

  it('AC-7414.5: 붙임을 file로 받아 글자를 뽑아 보내고 요약·read_mode·attach_text·규칙 연결을 저장한다(글 자신의 번호는 뺌)', async () => {
    const w = world()
    const n = w.seed({
      postedOn: '2026-11-21',
      noticeNo: '2026-300',
      body: '[고시 개정]\n변경 전 고시 (고시 제2026-50호, 2026.1.1.)',
      attachments: [{ name: '붙임.hwpx', url: fileUrl(1) }],
    })
    w.site.file(fileUrl(1), hwpx('붙임 안의 글자'))
    w.claude.mockResolvedValue(answer({ ...SUMMARY, amends: ['2026-100', '고시 제2026-300호'] }))
    await runReport(w.deps)
    expect(w.site.fetchSite).toHaveBeenCalledWith({ url: fileUrl(1), kind: 'file' })
    const req = w.claude.mock.calls[0][0]
    expect(req.system).toBe(SUMMARY_SYSTEM)
    expect(userText(req)).toContain('<attachment name="붙임.hwpx">\n붙임 안의 글자\n</attachment>')
    expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({
      state: 'done',
      readMode: 'full',
      attachText: '[붙임.hwpx]\n붙임 안의 글자',
      summary: { ...SUMMARY, amends: ['2026-100', '2026-300'] },
      related: true,
      ruleHits: [
        { id: 'R-01', title: '규칙 하나' },
        { id: 'R-02', title: '규칙 둘' },
      ],
    })
  })

  it('AC-7414.5: 붙임을 받지 못하면 본문만(body)으로 요약한다', async () => {
    const w = world()
    const n = w.seed({ postedOn: '2026-11-21', attachments: [{ name: '옛 파일', url: fileUrl(3) }] })
    w.site.fail(fileUrl(3), 'http')
    await runReport(w.deps)
    expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({ state: 'done', readMode: 'body', attachText: '' })
  })

  it('AC-7414.5: 실패하면 tries+1(wait)이고 3번째 실패는 failed다 — 답 모양이 틀려도 실패다', async () => {
    const w = world()
    const first = w.seed({ postedOn: '2026-11-21', title: '첫 실패' })
    const third = w.seed({ postedOn: '2026-10-01', tries: 2, title: '세 번째 실패' })
    const bad = w.seed({ postedOn: '2026-11-20', title: '틀린 답' })
    w.claude.mockImplementation(async (req) => {
      if (titleOf(req) === '틀린 답') return { ok: true, text: '요약 아님', usage: USAGE }
      return { ok: false, code: 'E-AI-FAILED', usage: null }
    })
    const report = await runReport(w.deps)
    expect(w.db.notices.find((x) => x.id === first.id)).toMatchObject({ state: 'wait', tries: 1, summary: null })
    expect(w.db.notices.find((x) => x.id === third.id)).toMatchObject({ state: 'failed', tries: 3 })
    expect(w.db.notices.find((x) => x.id === bad.id)).toMatchObject({ state: 'wait', tries: 1 })
    expect(report.failed).toBe(3)
    expect(logged()).toContain('E-NOTICE-SUMMARY')
  })

  it('AC-7414.5: AI 사용 한도(E-AI-LIMIT)면 글 탓이 아니라 tries를 올리지 않고 이번 실행의 바로 요약을 멈춘다', async () => {
    const w = world()
    const list = [1, 2, 3, 4, 5].map(() => w.seed({ postedOn: '2026-11-21' }))
    w.claude.mockResolvedValue({ ok: false, code: 'E-AI-LIMIT', usage: null })
    await runReport(w.deps)
    expect(w.claude.mock.calls.length).toBeLessThan(5)
    expect(w.log).not.toContain('failSummary')
    for (const n of list) expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({ state: 'wait', tries: 0 })
  })

  it('AC-7414.5: 점검 규칙 색인이 없으면(null) 요약을 만들지도 거두지도 않는다(규칙 연결 없는 요약을 저장하지 않음)', async () => {
    const w = world()
    w.seed({ postedOn: '2026-11-21' })
    w.seed({ postedOn: '2026-03-01' })
    w.seed({ state: 'batch', batchId: 'msgbatch_a' })
    w.deps.ruleIndex = null
    await runReport(w.deps)
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.submit).not.toHaveBeenCalled()
    expect(w.read).not.toHaveBeenCalled()
    expect(w.log).not.toContain('saveSummary')
    expect(logged()).toContain('E-NOTICE-SUMMARY')
    expect(w.log.at(-1)).toBe('finishRun')
  })

  it('AC-7414.5: 요약 전 글이 40개를 넘으면 일괄로 보낸 뒤 다음 40개를 더 본다', async () => {
    const w = world()
    const list = Array.from({ length: 45 }, (_, i) => w.seed({ postedOn: addDays('2026-06-30', -i) }))
    await runReport(w.deps)
    const sent = w.submit.mock.calls.flatMap(([items]) => items.map((i) => i.id))
    expect(sent).toEqual(list.map((n) => n.id))
    expect(w.submit.mock.calls[0][0]).toHaveLength(40)
  })
})

// ── AC-7414.6 ──────────────────────────────────────────────

describe('AC-7414.6 일괄 보내기 · 거두기', () => {
  it('AC-7414.6: 모은 요청을 submitBatch로 보내고 보낸 글을 batch·일괄 id로 적는다(담지 못한 글은 wait)', async () => {
    const w = world()
    const c = w.seed({ postedOn: '2026-03-02', attachments: [{ name: '붙임.hwpx', url: fileUrl(1) }] })
    const e = w.seed({ postedOn: '2026-02-01' })
    w.site.file(fileUrl(1), hwpx('일괄 붙임 글자'))
    w.submit.mockImplementation(async (items) => ({ ok: true, batchId: 'msgbatch_9', sent: [items[0].id], left: items.slice(1) }))
    const report = await runReport(w.deps)
    const items = w.submit.mock.calls[0][0]
    expect(items.map((i) => i.id)).toEqual([c.id, e.id])
    expect(items[0].req.system).toBe(SUMMARY_SYSTEM)
    expect(userText(items[0].req)).toContain('일괄 붙임 글자')
    expect(w.db.notices.find((x) => x.id === c.id)).toMatchObject({
      state: 'batch',
      batchId: 'msgbatch_9',
      tries: 0,
      readMode: 'full',
      attachText: '[붙임.hwpx]\n일괄 붙임 글자',
    })
    expect(w.db.notices.find((x) => x.id === e.id)).toMatchObject({ state: 'wait', batchId: null, tries: 0 })
    expect(report.batched).toBe(1)
    expect(w.claude).not.toHaveBeenCalled()
  })

  it('AC-7414.6: 보내기가 실패하면 글은 wait 그대로이고 오류 번호를 남긴다', async () => {
    const w = world()
    const c = w.seed({ postedOn: '2026-03-02' })
    w.submit.mockResolvedValue({ ok: false, left: [] })
    await runReport(w.deps)
    expect(w.log).not.toContain('markBatch')
    expect(w.db.notices.find((x) => x.id === c.id)).toMatchObject({ state: 'wait', tries: 0 })
    expect(logged()).toContain('E-NOTICE-BATCH')
  })

  it('AC-7414.6: 거두기에서 성공은 done(보낼 때 적은 read_mode·attach_text, 규칙 연결), 실패·빠짐은 tries+1·wait다', async () => {
    const w = world()
    const hourAgo = new Date(NOW.getTime() - HOUR).toISOString()
    const p = w.seed({
      state: 'batch',
      batchId: 'msgbatch_a',
      updatedAt: hourAgo,
      noticeNo: '2026-300',
      body: '[개정]\n변경 전 고시 (고시 제2026-50호, 2025.12.1.)',
      readMode: 'full',
      attachText: '[붙임]\n붙임 글자',
    })
    const q = w.seed({ state: 'batch', batchId: 'msgbatch_a', updatedAt: hourAgo, readMode: 'body' })
    const r = w.seed({ state: 'batch', batchId: 'msgbatch_a', updatedAt: hourAgo, readMode: 'body' })
    w.read.mockResolvedValue(
      new Map<string, BatchOutcome>([
        [p.id, { ok: true, text: JSON.stringify({ ...SUMMARY, amends: ['2026-100', '2026-300'] }), usage: USAGE }],
        [q.id, { ok: false, usage: USAGE }],
      ]),
    )
    w.hooks.sources = () => w.setMs(DIRECT_UNTIL_MS + 1) // 거둔 뒤 바로 요약이 다시 집지 않게
    const report = await runReport(w.deps)
    expect(w.read).toHaveBeenCalledWith('msgbatch_a')
    expect(w.db.notices.find((x) => x.id === p.id)).toMatchObject({
      state: 'done',
      batchId: null,
      readMode: 'full',
      attachText: '[붙임]\n붙임 글자',
      summary: { ...SUMMARY, amends: ['2026-100', '2026-300'] },
      ruleHits: [
        { id: 'R-01', title: '규칙 하나' },
        { id: 'R-02', title: '규칙 둘' },
      ],
    })
    for (const n of [q, r]) expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({ state: 'wait', tries: 1, batchId: null })
    expect(report).toMatchObject({ collected: 1, failed: 2 })
  })

  it('AC-7414.6: 끝나지 않은 일괄은 24시간 안이면 두고, 24시간이 지나면 실패로 본다', async () => {
    const w = world()
    const fresh = w.seed({ state: 'batch', batchId: 'msgbatch_new', updatedAt: new Date(NOW.getTime() - 23 * HOUR).toISOString() })
    const stale = w.seed({ state: 'batch', batchId: 'msgbatch_old', updatedAt: new Date(NOW.getTime() - 25 * HOUR).toISOString() })
    w.hooks.sources = () => w.setMs(DIRECT_UNTIL_MS + 1) // 거둔 뒤 바로 요약이 다시 집지 않게
    await runReport(w.deps)
    expect(w.read.mock.calls.map(([id]) => id).sort()).toEqual(['msgbatch_new', 'msgbatch_old'])
    expect(w.db.notices.find((x) => x.id === fresh.id)).toMatchObject({ state: 'batch', batchId: 'msgbatch_new', tries: 0 })
    expect(w.db.notices.find((x) => x.id === stale.id)).toMatchObject({ state: 'wait', batchId: null, tries: 1 })
  })

  it('AC-7414.6: 일괄을 읽지 못하면(failed) 24시간 안에는 그대로 두고 오류 번호를 남긴다', async () => {
    const w = world()
    const n = w.seed({ state: 'batch', batchId: 'msgbatch_a', updatedAt: new Date(NOW.getTime() - HOUR).toISOString() })
    w.read.mockResolvedValue('failed')
    await runReport(w.deps)
    expect(w.db.notices.find((x) => x.id === n.id)).toMatchObject({ state: 'batch', tries: 0 })
    expect(logged()).toContain('E-NOTICE-BATCH')
  })
})

// ── AC-7414.7 ──────────────────────────────────────────────

describe('AC-7414.7 지난 글 채우기', () => {
  it('AC-7414.7: 심평원 공지는 cursor 다음 쪽부터 넣고, 마지막 줄이 2026-01-01보다 앞인 쪽에서 채움 끝이다', async () => {
    const w = world()
    w.setSource('hira_notice', { backfillDone: false, cursor: { page: 3 } })
    w.site.page(
      hiraNoticeListUrl(4),
      noticeList([
        { key: 701, date: '2026-02-10' },
        { key: 702, date: '2026-02-09' },
      ]),
    )
    w.site.page(
      hiraNoticeListUrl(5),
      noticeList([
        { key: 703, date: '2026-01-02' },
        { key: 704, date: '2025-12-30' },
      ]),
    )
    for (const k of [701, 702, 703, 704]) w.site.page(viewUrl(k), noticeView(`지난 본문 ${k}`))
    const report = await runReport(w.deps)
    const lists = w.site.asked().filter((u) => u.includes('pageIndex='))
    expect(lists).toEqual([hiraNoticeListUrl(4), hiraNoticeListUrl(5)])
    expect(w.keys('hira_notice').sort()).toEqual(['701', '702', '703'])
    expect(w.byKey('hira_notice', 701)?.body).toContain('지난 본문 701')
    expect(w.db.sources.get('hira_notice')).toMatchObject({ cursor: { page: 5 }, backfillDone: true, checkedAt: TODAY_0700 })
    expect(report.new.hira_notice).toBe(3)
  })

  it('AC-7414.7: 심사기준은 탭마다 cursor 다음 쪽부터 채우고, 끝난 탭을 done에 적어 넷 다 끝나면 채움 끝이다', async () => {
    const w = world()
    w.setSource('hira_crtr', { backfillDone: false, cursor: { '01': 2, '02': 7, '09': 0, '10': 0, done: ['02', '09', '10'] } })
    const rows: CrtrRow[] = [
      { d: '20260105', s: '1', m: '0001', ref: '근거', title: '1월 글', date: '2026-01-05' },
      { d: '20251229', s: '1', m: '0001', ref: '근거', title: '옛 글', date: '2025-12-29' },
    ]
    w.site.page(crtrPage('01', 3), crtrList('01', rows))
    for (const r of rows) w.site.page(popupUrl(r), crtrPopup(`${r.title} 본문`))
    await runReport(w.deps)
    expect(w.site.asked().filter((u) => u.startsWith(CRTR_LIST_URL))).toEqual([crtrPage('01', 3)])
    expect(w.keys('hira_crtr')).toEqual(['20260105-1-0001'])
    expect(w.db.sources.get('hira_crtr')).toMatchObject({
      cursor: { '01': 3, '02': 7, '09': 0, '10': 0, done: ['01', '02', '09', '10'] },
      backfillDone: true,
    })
  })

  it('AC-7414.7: 아직 끝나지 않은 탭은 쪽을 넘겨 가며 채우고 쪽마다 cursor를 적는다', async () => {
    const w = world()
    w.setSource('hira_crtr', { backfillDone: false, cursor: { done: ['01', '02', '10'] } })
    const p1: CrtrRow = { d: '20260301', s: '1', m: '0001', ref: '근거 1', title: '3월 지침', date: '2026-03-01' }
    const p2: CrtrRow = { d: '20251001', s: '1', m: '0001', ref: '근거 2', title: '옛 지침', date: '2025-10-01' }
    w.site.page(crtrPage('09', 1), crtrList('09', [p1]))
    w.site.page(crtrPage('09', 2), crtrList('09', [p2]))
    w.site.page(popupUrl(p1), crtrPopup('3월 지침 본문'))
    await runReport(w.deps)
    expect(w.site.asked().filter((u) => u.startsWith(CRTR_LIST_URL))).toEqual([crtrPage('09', 1), crtrPage('09', 2)])
    expect(w.db.sources.get('hira_crtr')).toMatchObject({ cursor: { '09': 2, done: ['01', '02', '09', '10'] }, backfillDone: true })
  })

  it('AC-7414.7: 복지부는 채울 것이 없다(RSS를 더 부르지 않는다)', async () => {
    const w = world()
    w.setSource('mohw_rss', { backfillDone: false })
    await runReport(w.deps)
    expect(w.site.fetchSite).not.toHaveBeenCalled()
  })

  it('AC-7414.7: 채우던 쪽 목록을 읽지 못하거나 0줄이면 cursor를 그대로 두고 이번 채우기를 멈춘다', async () => {
    const w = world()
    w.setSource('hira_notice', { backfillDone: false, cursor: { page: 3 } })
    w.setSource('hira_crtr', { backfillDone: false, cursor: { done: ['02', '09', '10'] } })
    w.site.fail(hiraNoticeListUrl(4), 'timeout')
    w.site.page(crtrPage('01', 1), '<html><body>목록 없음</body></html>')
    await runReport(w.deps)
    expect(w.db.sources.get('hira_notice')).toMatchObject({ cursor: { page: 3 }, backfillDone: false, state: 'ok' })
    expect(w.db.sources.get('hira_crtr')).toMatchObject({ cursor: { done: ['02', '09', '10'] }, backfillDone: false, state: 'ok' })
    expect(logged()).toEqual(expect.arrayContaining(['E-NOTICE-SRC-hira_notice', 'E-NOTICE-SRC-hira_crtr']))
  })

  it('AC-7414.7: 다음 쪽이 앞 쪽과 같은 줄이면(쪽 넘김이 안 됨) 그 출처 채우기를 멈춘다', async () => {
    const w = world()
    w.setSource('hira_notice', { backfillDone: false, cursor: { page: 3 } })
    const same = noticeList([{ key: 801, date: '2026-05-01' }])
    w.site.page(hiraNoticeListUrl(4), same)
    w.site.page(hiraNoticeListUrl(5), same)
    w.site.page(viewUrl(801), noticeView('본문 801'))
    await runReport(w.deps)
    expect(w.site.asked()).not.toContain(hiraNoticeListUrl(6))
    expect(w.db.sources.get('hira_notice')).toMatchObject({ cursor: { page: 4 }, backfillDone: false })
  })

  it('AC-7414.7: 쪽 도중 시간이 다 되면 그 쪽 cursor를 올리지 않는다(다음 실행이 그 쪽부터)', async () => {
    const w = world()
    w.setSource('hira_notice', { backfillDone: false, cursor: { page: 3 } })
    w.site.page(
      hiraNoticeListUrl(4),
      noticeList([
        { key: 811, date: '2026-05-01' },
        { key: 812, date: '2026-05-01' },
        { key: 813, date: '2026-05-01' },
      ]),
    )
    w.hooks.knownKeys = () => w.setMs(BACKFILL_UNTIL_MS + 1)
    await runReport(w.deps)
    expect(w.site.asked()).toEqual([hiraNoticeListUrl(4)])
    expect(w.db.sources.get('hira_notice')).toMatchObject({ cursor: { page: 3 }, backfillDone: false })
  })
})

// ── AC-7414.8 ──────────────────────────────────────────────

describe('AC-7414.8 지난주 모음', () => {
  it('AC-7414.8: 지난주(월~일) 모음이 없으면 그 주 관련 글로 하나 만든다', async () => {
    const w = world()
    w.db.weeks.delete(LAST_WEEK)
    w.seed({ state: 'done', postedOn: '2026-11-10', title: '월요일 글', summary: SUMMARY })
    w.seed({ state: 'done', postedOn: '2026-11-15', title: '일요일 글', summary: SUMMARY })
    w.seed({ state: 'done', postedOn: '2026-11-16', title: '이번 주 글', summary: SUMMARY })
    await runReport(w.deps)
    expect(w.claude).toHaveBeenCalledTimes(1)
    const req = w.claude.mock.calls[0][0]
    expect(req.system).toBe(WEEKLY_SYSTEM)
    expect(req.user).toContain('<week from="2026-11-09" to="2026-11-15">')
    expect(req.user).toContain('월요일 글')
    expect(req.user).toContain('일요일 글')
    expect(req.user).not.toContain('이번 주 글')
    expect(w.db.weeks.get(LAST_WEEK)).toEqual([TOP])
  })

  it('AC-7414.8: 관련 글이 0개면 AI 없이 빈 모음을 만든다', async () => {
    const w = world()
    w.db.weeks.delete(LAST_WEEK)
    await runReport(w.deps)
    expect(w.claude).not.toHaveBeenCalled()
    expect(w.db.weeks.get(LAST_WEEK)).toEqual([])
  })

  it('AC-7414.8: 모음이 있으면 만들지 않는다', async () => {
    const w = world()
    w.seed({ state: 'done', postedOn: '2026-11-10', summary: SUMMARY })
    await runReport(w.deps)
    expect(w.log).not.toContain('weekNotices')
    expect(w.log).not.toContain('saveWeek')
    expect(w.claude).not.toHaveBeenCalled()
  })

  it('AC-7414.8: 월요일이면 7일 전 월요일 주를 만든다', async () => {
    const w = world()
    w.deps.now = () => new Date('2026-11-23T07:10:00+09:00')
    for (const s of SOURCES) w.setSource(s, { checkedAt: '2026-11-22T22:00:00.000Z' })
    await runReport(w.deps)
    expect(w.db.weeks.get('2026-11-16')).toEqual([])
  })

  it('AC-7414.8: 답 모양이 틀리면 저장하지 않고 오류 번호를 남긴다(다음 실행이 다시)', async () => {
    const w = world()
    w.db.weeks.delete(LAST_WEEK)
    w.seed({ state: 'done', postedOn: '2026-11-10', summary: SUMMARY })
    w.claude.mockResolvedValue({ ok: true, text: '모음 아님', usage: USAGE })
    await runReport(w.deps)
    expect(w.db.weeks.has(LAST_WEEK)).toBe(false)
    expect(logged()).toContain('E-NOTICE-WEEK')
  })
})

// ── AC-7414.9 ──────────────────────────────────────────────

describe('AC-7414.9 사용량 · 실행 기록 · 로그', () => {
  it('AC-7414.9: Claude 부름마다 실행 줄에 토큰과 비용을 더한다(일괄은 절반)', async () => {
    const w = world()
    w.db.weeks.delete(LAST_WEEK)
    w.seed({ state: 'done', postedOn: '2026-11-10', summary: SUMMARY })
    w.seed({ postedOn: '2026-11-21' })
    const b = w.seed({ state: 'batch', batchId: 'msgbatch_a', readMode: 'body', updatedAt: new Date(NOW.getTime() - HOUR).toISOString() })
    w.read.mockResolvedValue(new Map<string, BatchOutcome>([[b.id, { ok: true, text: JSON.stringify(SUMMARY), usage: USAGE }]]))
    await runReport(w.deps)
    const full = { inputTokens: 1000, outputTokens: 200, costMicroUsd: costMicroUsd(USAGE) }
    const half = { inputTokens: 1000, outputTokens: 200, costMicroUsd: batchCostMicroUsd(USAGE) }
    expect(half.costMicroUsd).toBe(Math.floor(full.costMicroUsd / 2))
    expect(w.db.usage).toEqual([
      { runId: 'run-1', u: half },
      { runId: 'run-1', u: full },
      { runId: 'run-1', u: full },
    ])
  })

  it('AC-7414.9: 실행 줄에는 출처별 건수·멈춘 출처·숫자만 남고 글 내용은 없다(돌려주는 값도 같다)', async () => {
    const w = world()
    w.setSource('hira_notice', { checkedAt: null })
    w.setSource('hira_crtr', { checkedAt: null })
    w.setSource('mohw_rss', { checkedAt: null })
    w.site.page(
      hiraNoticeListUrl(1),
      noticeList([
        { key: 901, date: '2026-11-20', title: '비밀 같은 제목' },
        { key: 1, date: '2025-01-01' },
      ]),
    )
    w.site.page(viewUrl(901), noticeView('본문 글자'))
    w.site.page(crtrPage('01', 1), '<html></html>')
    w.site.page(MOHW_RSS_URL, rss([{ no: 3, title: '복지부 제목', desc: '설명 글자', date: 'Mon, 09 Mar 2026 01:00:00 GMT' }]))
    const report = await runReport(w.deps)
    const expected: RunReport = {
      new: { hira_notice: 1, hira_crtr: 0, mohw_rss: 1 },
      stopped: ['hira_crtr'],
      summarized: 1,
      batched: 1,
      collected: 0,
      failed: 0,
    }
    expect(report).toEqual(expected)
    expect(w.db.finished).toEqual([{ runId: 'run-1', counts: expected }])
    const text = JSON.stringify(w.db.finished)
    for (const word of ['비밀', '본문', '복지부 제목', '설명']) expect(text).not.toContain(word)
  })

  it('AC-7414.9: console에는 [notices/collect]와 오류 번호 한 줄씩만 남긴다', async () => {
    const w = world()
    w.db.weeks.delete(LAST_WEEK)
    w.seed({ state: 'done', postedOn: '2026-11-10', title: '모음 글 제목', summary: SUMMARY })
    w.seed({ postedOn: '2026-11-21', title: '요약 글 제목' })
    w.seed({ postedOn: '2026-03-01', title: '일괄 글 제목' })
    w.setSource('hira_notice', { checkedAt: null })
    w.site.fail(hiraNoticeListUrl(1), 'http')
    w.claude.mockResolvedValue({ ok: false, code: 'E-AI-FAILED', usage: null })
    w.submit.mockResolvedValue({ ok: false, left: [] })
    await runReport(w.deps)
    expect(errors.mock.calls.length).toBeGreaterThan(0)
    for (const call of errors.mock.calls) {
      expect(call).toHaveLength(2)
      expect(call[0]).toBe(LOG_TAG)
      expect(call[1]).toMatch(/^E-NOTICE-(SRC-(hira_notice|hira_crtr|mohw_rss)|SUMMARY|BATCH|WEEK)$/)
    }
    expect(logged()).toEqual(expect.arrayContaining(['E-NOTICE-SRC-hira_notice', 'E-NOTICE-SUMMARY', 'E-NOTICE-BATCH', 'E-NOTICE-WEEK']))
    expect(new Set(logged()).size).toBe(logged().length)
  })

  it('AC-7414.9: DB 읽기가 던져도 그 단계만 건너뛰고 실행을 마감한다', async () => {
    const w = world()
    const boom = async () => {
      throw new Error('notices store read failed')
    }
    w.deps.store.openBatches = boom
    w.deps.store.sources = boom
    w.deps.store.weekExists = boom
    w.deps.store.waiting = boom
    const report = await runReport(w.deps)
    expect(report).toMatchObject({ summarized: 0, batched: 0, collected: 0, failed: 0 })
    expect(w.db.finished).toHaveLength(1)
    expect(w.site.fetchSite).not.toHaveBeenCalled()
    expect(logged()).toEqual(expect.arrayContaining(['E-NOTICE-BATCH', 'E-NOTICE-WEEK', 'E-NOTICE-SUMMARY']))
  })
})
