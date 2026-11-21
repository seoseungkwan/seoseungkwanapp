import 'server-only'
import { addDays, todayInKorea, weekStartOf } from '@/lib/analytics/dates'
import { costMicroUsd } from '@/lib/ai/cost'
import type { AiUsage } from '@/types/aiReport'
import type {
  CollectorStore,
  CrtrTab,
  ListItem,
  NoticeSource,
  PostDetail,
  ReadMode,
  Reading,
  SiteRequest,
  SiteResult,
  SourceError,
  SourceRow,
  WaitingNotice,
  WeekTop,
} from '@/types/notices'
import type { callClaude } from '../claude'
import { planReading, sniffFile, type GotFile } from './attachText'
import { BATCH_MAX_BYTES, batchCostMicroUsd, type BatchItem, type BatchOutcome, type readBatch, type submitBatch } from './batch'
import { groupKeyOf, mergeGroup } from './noticeNo'
import { matchRules, type RuleBasisIndex } from './ruleMatch'
import { CRTR_TABS, crtrListRequest, parseHiraCrtrList, parseHiraCrtrPopup } from './sources/hiraCrtr'
import { hiraNoticeListUrl, parseHiraNoticeList, parseHiraNoticeView } from './sources/hiraNotice'
import { MOHW_RSS_URL, parseMohwRss } from './sources/mohwRss'
import { parseSummary, summaryRequest } from './summaryPrompt'
import { parseWeekly, weeklyRequest } from './weeklyPrompt'

// 고시·공지 모으기 흐름(specs/notices REQ-7414, design 4절, ADR-034·036). 하루 아홉 번 같은 흐름이 돈다:
// ① 일괄 결과 거두기 ② 새 글 확인(오늘 확인 안 한 출처만) ③ 지난주 모음 ④ 요약(바로 또는 일괄) ⑤ 지난 글 채우기 ⑥ 실행 마감.
// 사이트·Claude·일괄·DB는 모두 deps로 받는다(시험이 가짜를 넣는다). 시간은 nowMs로 재고, 한국 날짜는 lib/analytics/dates로 낸다.
// 300초(Vercel 무료판) 안에 끝내려고 정해 둔 때가 지나면 새 일을 시작하지 않고 남은 일은 다음 실행이 잇는다(작은 단위로 이어 하기).
// 로그는 console.error(LOG_TAG, 오류 번호) 한 줄씩만(같은 번호는 실행마다 한 번). 글·질문·주소·오류 내용은 로그와 실행 줄에 남기지 않는다

// ── 시간 표(실행 시작부터) ─────────────────────────────────
/** 이때가 지나면 Claude 부름(바로 요약·주간 모음·일괄 거두기)을 새로 시작하지 않는다. 부름 한도 100초라 170초에 시작해도 300초 안이다 */
export const DIRECT_UNTIL_MS = 170_000
/** 이때가 지나면 일괄 요청 준비(붙임 받기)를 새로 시작하지 않는다. 그 뒤 보내기(최대 40초)까지 300초 안 */
export const BATCH_PREP_UNTIL_MS = 230_000
/** 이때가 지나면 사이트 쪽(지난 글 채우기, 그리고 새 글 확인의 목록·글 쪽)을 새로 부르지 않는다 */
export const BACKFILL_UNTIL_MS = 250_000

/** 이 날보다 앞 글은 넣지 않는다(DB notices.posted_on 제약과 같다) */
export const FIRST_DAY = '2026-01-01'
/** 새 글 확인에서 쪽의 줄이 모두 새것일 때 더 보는 쪽 수 한도 */
export const NEW_PAGES_MAX = 5
/** 한 번에 읽는 요약 전 글 수(최근 글부터) */
export const WAITING_LIMIT = 40
/** 바로 요약을 동시에 */
export const DIRECT_PARALLEL = 3
/** 올라온 지 이만큼(한국 날짜, 오늘 포함) 안의 글은 바로 요약한다. 그보다 오래된 글(처음 채우기)은 일괄(반값) */
export const DIRECT_DAYS = 3
/** 끝나지 않은(또는 읽지 못하는) 일괄을 실패로 보는 때 */
export const BATCH_STALE_MS = 24 * 60 * 60 * 1000
export const LOG_TAG = '[notices/collect]'

// 글·팝업 쪽은 2개씩(fetchSite가 host마다 동시 2개로 줄 세운다), 일괄 준비도 2개씩
const DETAIL_PARALLEL = 2
const PREP_PARALLEL = 2
// 한 묶음에서 받는 붙임 수 한도와 'PDF가 이만큼이면 더 받지 않음'(planReading이 PDF 먼저 3개까지 고른다)
const FILES_MAX = 10
const PDFS_ENOUGH = 3
// 요약 전 글을 다시 읽을 때 이번 실행에서 본(아직 wait인) 글만큼 더 읽어 창이 막히지 않게 한다. 그 한도
const WAITING_MAX = 200

const SOURCES: readonly NoticeSource[] = ['hira_notice', 'hira_crtr', 'mohw_rss']

// ── 모양 ───────────────────────────────────────────────────

/** 실행 결과 = 실행 줄 counts(숫자와 출처 이름만, 글 내용 없음) */
export type RunReport = {
  /** 출처별 새로 넣은 출처 글 수(새 글 확인 + 지난 글 채우기) */
  new: Record<NoticeSource, number>
  /** 이번 새 글 확인에서 멈춘 출처 */
  stopped: NoticeSource[]
  /** 바로 요약해 done으로 적은 글 수 */
  summarized: number
  /** 일괄로 보낸 글 수 */
  batched: number
  /** 일괄 결과를 거둬 done으로 적은 글 수 */
  collected: number
  /** 요약 실패로 tries+1 한 수(바로·일괄·24시간 지난 일괄) */
  failed: number
}

/** 일괄 거두기 때 읽는 글(보낼 때 적어 둔 읽기 결과와 규칙 연결에 쓰는 본문·번호) */
export type BatchNotice = { id: string; noticeNo: string | null; body: string; readMode: ReadMode | null; attachText: string }

/**
 * 일괄 글의 읽기 결과를 맡겨 두는 DB 쪽(design 11절 CollectorStore에 더한 둘). 일괄 결과에는 글 id와 답만 오고
 * 붙임 파일은 두지 않으므로, 보낼 때 뽑은 read_mode·attach_text를 먼저 적고 거둘 때 본문·고시 번호와 함께 다시 읽는다
 */
export interface BatchReadingStore {
  /** 그 글의 read_mode·attach_text만 고친다. 고친 줄이 없거나 오류면 false */
  saveReading(id: string, r: { readMode: ReadMode; attachText: string }): Promise<boolean>
  /** 그 id들의 글(상태 상관없음, 없는 id는 빠짐). 실패는 던진다 */
  batchNotices(ids: string[]): Promise<BatchNotice[]>
}

export type CollectorDeps = {
  store: CollectorStore & BatchReadingStore
  fetchSite: (req: SiteRequest) => Promise<SiteResult>
  callClaude: typeof callClaude
  submitBatch: typeof submitBatch
  readBatch: typeof readBatch
  /** 점검 규칙 색인(`await defaultRuleIndex()`). null(불러오기 실패)이면 요약을 만들지도 거두지도 않는다 — 규칙 연결 없는 요약을 저장하지 않게 */
  ruleIndex: RuleBasisIndex | null
  /** 시간 재기(ms) */
  nowMs: () => number
  /** 지금(한국 날짜·저장 시각) */
  now: () => Date
}

type OpenBatch = Awaited<ReturnType<CollectorStore['openBatches']>>[number]
type SiteFail = Extract<SiteResult, { ok: false }>['fail']
type Detail = PostDetail | null | 'failed' | 'cut'
type Prepared = { item: BatchItem; reading: Reading }

// 목록 읽기 실패 → 출처 오류(AC-7414.4). 0줄은 shape
const SOURCE_ERROR: Readonly<Record<SiteFail, SourceError>> = {
  timeout: 'blocked',
  'blocked-url': 'blocked',
  http: 'http',
  'too-big': 'http',
}

// 출처의 목록 하나(심사기준은 탭마다 하나). key는 지난 글 cursor의 칸 이름
type Feed = { source: NoticeSource; key: string; request: (page: number) => SiteRequest; parse: (text: string) => ListItem[] }

const NOTICE_FEED: Feed = {
  source: 'hira_notice',
  key: 'page',
  request: (page) => ({ url: hiraNoticeListUrl(page), kind: 'page' }),
  parse: parseHiraNoticeList,
}
const CRTR_FEEDS: readonly Feed[] = CRTR_TABS.map((tab: CrtrTab) => ({
  source: 'hira_crtr',
  key: tab,
  request: (page) => crtrListRequest(tab, page),
  parse: (text) => parseHiraCrtrList(text, tab),
}))
// 복지부는 RSS 한 쪽뿐이다(쪽 넘김 없음). 지난 글 채우기도 없다(처음부터 끝, AC-7414.7)
const MOHW_FEED: Feed = { source: 'mohw_rss', key: 'page', request: () => ({ url: MOHW_RSS_URL, kind: 'page' }), parse: parseMohwRss }

const NEW_PLAN: Readonly<Record<NoticeSource, { feeds: readonly Feed[]; pages: number }>> = {
  hira_notice: { feeds: [NOTICE_FEED], pages: NEW_PAGES_MAX },
  hira_crtr: { feeds: CRTR_FEEDS, pages: NEW_PAGES_MAX },
  mohw_rss: { feeds: [MOHW_FEED], pages: 1 },
}
const BACKFILL_PLAN: readonly { source: NoticeSource; feeds: readonly Feed[] }[] = [
  { source: 'hira_notice', feeds: [NOTICE_FEED] },
  { source: 'hira_crtr', feeds: CRTR_FEEDS },
]

const srcCode = (source: NoticeSource) => `E-NOTICE-SRC-${source}`

function emptyRow(source: NoticeSource): SourceRow {
  return {
    source,
    state: 'ok',
    errorCode: null,
    checkedAt: null,
    lastOkAt: null,
    stoppedSince: null,
    cursor: {},
    backfillDone: source === 'mohw_rss',
  }
}

// ── 지난 글 cursor ─────────────────────────────────────────
// 공지 { "page": n } · 심사기준 { "01": n, "02": n, "09": n, "10": n, "done": ["01"] } (design 4절). n = 다 읽은 마지막 쪽

type Cursor = { pages: Record<string, number>; done: Set<string> }

const pageNo = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)

function readCursor(feeds: readonly Feed[], raw: Record<string, unknown>): Cursor {
  const done = Array.isArray(raw.done) ? (raw.done as unknown[]) : []
  return {
    pages: Object.fromEntries(feeds.map((f) => [f.key, pageNo(raw[f.key])])),
    done: new Set(feeds.filter((f) => done.includes(f.key)).map((f) => f.key)),
  }
}

function cursorJson(source: NoticeSource, feeds: readonly Feed[], c: Cursor): Record<string, unknown> {
  if (source !== 'hira_crtr') return { ...c.pages }
  return { ...c.pages, done: feeds.filter((f) => c.done.has(f.key)).map((f) => f.key) }
}

// ── 작은 도구 ──────────────────────────────────────────────

/** items를 limit개씩 동시에(앞에서부터 차례로 꺼낸다) */
async function eachLimit<T>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await work(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
}

/** 한 줄로 세워 하나씩(같은 묶음을 두 출처가 동시에 읽고 쓰지 않게) */
function oneAtATime(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(work: () => Promise<T>) => {
    const run = tail.then(work)
    tail = run.catch(() => undefined)
    return run
  }
}

const pageText = (res: SiteResult): string | null => (res.ok && 'text' in res ? res.text : null)

// 보낼 요청 크기 어림(바이트): PDF base64 + 글자(한글 UTF-8 3바이트)
function requestSize(n: WaitingNotice, r: Reading): number {
  const pdfs = r.pdfs.reduce((sum, p) => sum + p.base64.length, 0)
  const texts = r.texts.reduce((sum, t) => sum + t.text.length, 0)
  return pdfs + 3 * (texts + n.body.length + n.title.length)
}

// ── 한 실행 ────────────────────────────────────────────────

class CollectRun {
  readonly counts: RunReport = {
    new: { hira_notice: 0, hira_crtr: 0, mohw_rss: 0 },
    stopped: [],
    summarized: 0,
    batched: 0,
    collected: 0,
    failed: 0,
  }
  private readonly deps: CollectorDeps
  private readonly runId: string
  private readonly started: number
  private readonly today: string
  private readonly logged = new Set<string>()
  private readonly inTurn = oneAtATime()
  private readonly noBackfill = new Set<NoticeSource>()
  private rows: Map<NoticeSource, SourceRow> | null = null
  private aiLimit = false

  constructor(deps: CollectorDeps, runId: string, started: number) {
    this.deps = deps
    this.runId = runId
    this.started = started
    this.today = todayInKorea(deps.now())
  }

  private past(limitMs: number): boolean {
    return this.deps.nowMs() - this.started >= limitMs
  }

  private nowIso(): string {
    return this.deps.now().toISOString()
  }

  private log(code: string): void {
    if (this.logged.has(code)) return
    this.logged.add(code)
    console.error(LOG_TAG, code)
  }

  private async addUsage(u: AiUsage, batch: boolean): Promise<void> {
    const cost = batch ? batchCostMicroUsd(u) : costMicroUsd(u)
    await this.deps.store.addRunUsage(this.runId, { inputTokens: u.inputTokens, outputTokens: u.outputTokens, costMicroUsd: cost })
  }

  // ① 일괄 결과 거두기 ────────────────────────────────────

  async collectBatches(): Promise<void> {
    const index = this.deps.ruleIndex
    if (index === null) return this.log('E-NOTICE-SUMMARY')
    try {
      for (const open of await this.deps.store.openBatches()) {
        if (this.past(DIRECT_UNTIL_MS)) return
        await this.collectBatch(open, index)
      }
    } catch {
      this.log('E-NOTICE-BATCH')
    }
  }

  private async collectBatch(open: OpenBatch, index: RuleBasisIndex): Promise<void> {
    const read = await this.deps.readBatch(open.batchId)
    if (read === 'processing' || read === 'failed') {
      if (read === 'failed') this.log('E-NOTICE-BATCH')
      // 24시간이 지나도 끝나지 않으면(또는 계속 읽지 못하면) 실패로 보고 wait로 돌려 바로 부르기로 다시 간다
      if (this.deps.now().getTime() - Date.parse(open.oldest) > BATCH_STALE_MS) {
        this.log('E-NOTICE-BATCH')
        for (const id of open.ids) if (await this.deps.store.failSummary(id)) this.counts.failed += 1
      }
      return
    }
    const notices = new Map((await this.deps.store.batchNotices(open.ids)).map((n) => [n.id, n]))
    for (const id of open.ids) {
      const outcome = read.get(id)
      // 사용량은 그 글을 DB에 적었을 때 더한다(적지 못해 다음 실행이 다시 거두면 그때 센다 — 두 번 세지 않게)
      if ((await this.settle(id, outcome, notices.get(id), index)) && outcome?.usage) await this.addUsage(outcome.usage, true)
    }
  }

  // 일괄 답 하나 → done(요약 저장) 또는 실패(tries+1). DB에 적었으면 true
  private async settle(id: string, outcome: BatchOutcome | undefined, notice: BatchNotice | undefined, index: RuleBasisIndex): Promise<boolean> {
    const summary = outcome?.ok ? parseSummary(outcome.text) : null
    if (summary !== null && notice !== undefined && notice.readMode !== null) {
      const saved = await this.deps.store.saveSummary(id, {
        summary,
        readMode: notice.readMode,
        attachText: notice.attachText,
        ruleHits: matchRules(summary.amends, notice.body, notice.noticeNo, index),
      })
      if (saved) this.counts.collected += 1
      else this.log('E-NOTICE-BATCH')
      return saved
    }
    this.log('E-NOTICE-BATCH')
    const failed = await this.deps.store.failSummary(id)
    if (failed) this.counts.failed += 1
    return failed
  }

  // ② 새 글 확인 ───────────────────────────────────────────

  async checkNew(): Promise<void> {
    let list: SourceRow[]
    try {
      list = await this.deps.store.sources()
    } catch {
      for (const source of SOURCES) this.log(srcCode(source))
      return
    }
    const rows = new Map(SOURCES.map((s) => [s, list.find((r) => r.source === s) ?? emptyRow(s)]))
    this.rows = rows
    await Promise.all(SOURCES.map((source) => this.checkSource(rows, source)))
  }

  private checkedToday(row: SourceRow): boolean {
    if (row.checkedAt === null) return false
    const at = Date.parse(row.checkedAt)
    return !Number.isNaN(at) && todayInKorea(new Date(at)) === this.today
  }

  private async checkSource(rows: Map<NoticeSource, SourceRow>, source: NoticeSource): Promise<void> {
    const row = rows.get(source)
    if (row === undefined || this.checkedToday(row)) return
    let result: 'ok' | 'cut' | 'db' | { error: SourceError }
    try {
      result = await this.readNew(source)
    } catch {
      result = 'db'
    }
    // 시간이 다 돼 끝까지 보지 못함: 확인 시각을 적지 않는다(다음 실행이 다시 본다)
    if (result === 'cut') return
    if (result === 'db') {
      this.noBackfill.add(source)
      return this.log(srcCode(source))
    }
    const at = this.nowIso()
    let next: SourceRow
    if (result === 'ok') {
      next = { ...row, state: 'ok', errorCode: null, checkedAt: at, lastOkAt: at, stoppedSince: null }
    } else {
      // 확인 시각은 적지 않는다(다음 실행이 다시 확인한다). 처음 멈춘 시각은 그대로 둔다
      const since = row.state === 'stopped' && row.stoppedSince !== null ? row.stoppedSince : at
      next = { ...row, state: 'stopped', errorCode: result.error, stoppedSince: since }
      this.noBackfill.add(source)
      this.counts.stopped.push(source)
      this.log(srcCode(source))
    }
    rows.set(source, next)
    if (!(await this.deps.store.saveSource(next))) this.log(srcCode(source))
  }

  // 1쪽(심사기준은 탭마다 1쪽)부터, 쪽의 줄이 모두 새것이면 다음 쪽(5쪽까지). 목록 실패·1쪽 0줄이면 그 오류
  private async readNew(source: NoticeSource): Promise<'ok' | 'cut' | { error: SourceError }> {
    const plan = NEW_PLAN[source]
    for (const feed of plan.feeds) {
      for (let page = 1; page <= plan.pages; page += 1) {
        if (this.past(BACKFILL_UNTIL_MS)) return 'cut'
        const list = await this.readList(feed, page)
        if ('error' in list) return list
        if (list.items.length === 0) {
          if (page === 1) return { error: 'shape' }
          break
        }
        const got = await this.addRows(feed.source, list.items)
        if (got.cut) return 'cut'
        if (!got.allNew) break
      }
    }
    return 'ok'
  }

  private async readList(feed: Feed, page: number): Promise<{ items: ListItem[] } | { error: SourceError }> {
    const res = await this.deps.fetchSite(feed.request(page))
    if (!res.ok) return { error: SOURCE_ERROR[res.fail] }
    const text = pageText(res)
    return text === null ? { error: 'http' } : { items: feed.parse(text) }
  }

  /**
   * 한 쪽의 줄들: 2026-01-01부터의 모르는 줄만 글·팝업을 읽어 쪽 차례로 넣는다.
   * allNew = 쪽의 줄이 모두 넣을 줄(모르는 줄 · 2026-01-01부터). cut = 시간이 다 돼 읽지 못한 줄이 있음
   */
  private async addRows(source: NoticeSource, items: ListItem[]): Promise<{ allNew: boolean; cut: boolean }> {
    const fresh = items.filter((item) => item.postedOn >= FIRST_DAY)
    const known = await this.deps.store.knownKeys(source, fresh.map((item) => item.key))
    const todo = fresh.filter((item) => !known.has(item.key))
    const details: Detail[] = todo.map(() => 'cut')
    await eachLimit(todo, DETAIL_PARALLEL, async (item, i) => {
      if (!this.past(BACKFILL_UNTIL_MS)) details[i] = await this.readDetail(item)
    })
    for (const [i, item] of todo.entries()) {
      const detail = details[i]
      if (detail !== 'cut' && detail !== 'failed') await this.saveRow(item, detail)
    }
    return { allNew: todo.length === items.length, cut: details.includes('cut') }
  }

  /**
   * 심평원 두 곳은 글·팝업 쪽을 읽어 본문·붙임 목록을 받는다. 읽지 못했거나 본문·붙임이 모두 빈 쪽(오류·바뀐 쪽)은 'failed' —
   * 그 줄은 이번에 넣지 않고 다음 확인 때 다시 새 글로 본다. 복지부는 RSS 글이 본문이라 읽지 않는다(null, robots가 글 쪽을 막는다)
   */
  private async readDetail(item: ListItem): Promise<PostDetail | null | 'failed'> {
    if (item.source === 'mohw_rss') return null
    const text = pageText(await this.deps.fetchSite({ url: item.url, kind: 'page' }))
    if (text === null) return 'failed'
    const detail = item.source === 'hira_notice' ? parseHiraNoticeView(text) : parseHiraCrtrPopup(text)
    return detail.body === '' && detail.attachments.length === 0 ? 'failed' : detail
  }

  // 줄 하나 저장 = groupKeyOf → groupOf → mergeGroup → saveGroup(design 4절). 한 줄씩 차례로(같은 묶음 경쟁 없음)
  private saveRow(item: ListItem, detail: PostDetail | null): Promise<void> {
    return this.inTurn(async () => {
      const { store } = this.deps
      const { group, post } = mergeGroup(await store.groupOf(groupKeyOf(item)), item, detail)
      if (await store.saveGroup(group, post)) this.counts.new[item.source] += 1
      else this.log(srcCode(item.source))
    })
  }

  // ③ 지난주 모음 ─────────────────────────────────────────

  async weekly(): Promise<void> {
    const { store } = this.deps
    // 지난 월요일(오늘이 월요일이면 7일 전)
    const weekStart = addDays(weekStartOf(this.today), -7)
    try {
      if (await store.weekExists(weekStart)) return
      // 그 주 글 가운데 요약을 기다리는 글(wait·batch)이 있으면 이번에는 만들지 않고 다음 실행으로 미룬다(기본값 22).
      // 모음은 늘 지난주라 일요일까지 못 만들면 그 주는 건너뛴다
      if (await store.weekPending(weekStart)) return
      const items = await store.weekNotices(weekStart)
      let top3: WeekTop[] = []
      if (items.length > 0) {
        if (this.aiLimit || this.past(DIRECT_UNTIL_MS)) return
        const res = await this.deps.callClaude(weeklyRequest(weekStart, items))
        if (res.usage) await this.addUsage(res.usage, false)
        if (!res.ok && res.code === 'E-AI-LIMIT') this.aiLimit = true
        const parsed = res.ok ? parseWeekly(res.text) : null
        if (parsed === null) return this.log('E-NOTICE-WEEK')
        top3 = parsed
      }
      if (!(await store.saveWeek({ weekStart, top3 }))) this.log('E-NOTICE-WEEK')
    } catch {
      this.log('E-NOTICE-WEEK')
    }
  }

  // ④ 요약 ─────────────────────────────────────────────────

  /**
   * 요약 전 글을 최근 글부터 40개씩 읽어, 3일 안이거나 tries ≥ 1이면 바로(동시에 3개), 아니면 일괄로 모아 보낸다.
   * 보낸 글은 batch가 되어 다음 읽기에서 빠지므로 230초까지 다음 40개를 더 본다(처음 채우기를 하루쯤에 끝내려고)
   */
  async summarize(): Promise<void> {
    const index = this.deps.ruleIndex
    if (index === null) return this.log('E-NOTICE-SUMMARY')
    const tried = new Set<string>()
    const stillWaiting = new Set<string>() // 이번 실행에서 보았지만 wait로 남은 글
    const soon = addDays(this.today, 1 - DIRECT_DAYS)
    try {
      while (!this.past(BATCH_PREP_UNTIL_MS)) {
        const list = await this.deps.store.waiting(Math.min(WAITING_LIMIT + stillWaiting.size, WAITING_MAX))
        const fresh = list.filter((n) => !tried.has(n.id))
        if (fresh.length === 0) return
        for (const n of fresh) {
          tried.add(n.id)
          stillWaiting.add(n.id)
        }
        const direct = fresh.filter((n) => n.postedOn >= soon || n.tries >= 1)
        const later = fresh.filter((n) => !direct.includes(n))
        await eachLimit(direct, DIRECT_PARALLEL, (n) => this.summarizeNow(n, index, stillWaiting))
        await this.sendBatch(await this.prepareBatch(later), stillWaiting)
      }
    } catch {
      this.log('E-NOTICE-SUMMARY')
    }
  }

  /**
   * 묶음의 심평원 출처 글 붙임을 받아(kind: 'file') 읽기 계획을 세운다. 받은 파일은 계획에만 쓰고 두지 않는다.
   * 받지 못한 붙임은 건너뛴다(모두 못 받으면 본문만 = body). 시간이 다 되면 'cut'(그 글은 wait 그대로)
   */
  private async readFiles(n: WaitingNotice, untilMs: number): Promise<Reading | 'cut'> {
    const links: { name: string; url: string }[] = []
    for (const post of n.posts) {
      if (post.source === 'mohw_rss') continue // 복지부 붙임은 robots가 막는다(받지 않음)
      for (const a of post.attachments) if (!links.some((l) => l.url === a.url)) links.push(a)
    }
    const files: GotFile[] = []
    let pdfs = 0
    for (const link of links.slice(0, FILES_MAX)) {
      if (pdfs >= PDFS_ENOUGH) break
      if (this.past(untilMs)) return 'cut'
      const res = await this.deps.fetchSite({ url: link.url, kind: 'file' })
      if (!res.ok || !('bytes' in res)) continue
      files.push({ name: link.name, bytes: res.bytes })
      if (sniffFile(res.bytes) === 'pdf') pdfs += 1
    }
    return planReading(files)
  }

  private async summarizeNow(n: WaitingNotice, index: RuleBasisIndex, stillWaiting: Set<string>): Promise<void> {
    if (this.aiLimit || this.past(DIRECT_UNTIL_MS)) return
    const reading = await this.readFiles(n, DIRECT_UNTIL_MS)
    if (reading === 'cut' || this.aiLimit || this.past(DIRECT_UNTIL_MS)) return
    const res = await this.deps.callClaude(summaryRequest(n, reading))
    if (res.usage) await this.addUsage(res.usage, false)
    // AI 사용 한도는 글 탓이 아니다: tries를 올리지 않고 이번 실행의 Claude 부름을 멈춘다
    if (!res.ok && res.code === 'E-AI-LIMIT') {
      this.aiLimit = true
      return this.log('E-NOTICE-SUMMARY')
    }
    const summary = res.ok ? parseSummary(res.text) : null
    if (summary === null) {
      this.log('E-NOTICE-SUMMARY')
      if (await this.deps.store.failSummary(n.id)) this.counts.failed += 1
      return
    }
    const saved = await this.deps.store.saveSummary(n.id, {
      summary,
      readMode: reading.mode,
      attachText: reading.attachText,
      ruleHits: matchRules(summary.amends, n.body, n.noticeNo, index),
    })
    if (!saved) return this.log('E-NOTICE-SUMMARY')
    this.counts.summarized += 1
    stillWaiting.delete(n.id)
  }

  // 일괄 요청 준비: 붙임을 받아 요청을 만든다(230초까지 · 몸통 합 50MB 어림까지, 넘는 글은 wait 그대로)
  private async prepareBatch(list: WaitingNotice[]): Promise<Prepared[]> {
    const out: (Prepared | null)[] = list.map(() => null)
    let bytes = 0
    await eachLimit(list, PREP_PARALLEL, async (n, i) => {
      if (this.past(BATCH_PREP_UNTIL_MS) || bytes >= BATCH_MAX_BYTES) return
      const reading = await this.readFiles(n, BATCH_PREP_UNTIL_MS)
      if (reading === 'cut') return
      const size = requestSize(n, reading)
      if (bytes + size > BATCH_MAX_BYTES) return
      bytes += size
      out[i] = { item: { id: n.id, req: summaryRequest(n, reading) }, reading }
    })
    return out.filter((p): p is Prepared => p !== null)
  }

  // 읽기 결과를 먼저 적고(적지 못한 글은 보내지 않음) → submitBatch → 보낸 글을 batch·일괄 id로 적는다
  private async sendBatch(prepared: Prepared[], stillWaiting: Set<string>): Promise<void> {
    const { store } = this.deps
    const ready: BatchItem[] = []
    for (const p of prepared) {
      if (await store.saveReading(p.item.id, { readMode: p.reading.mode, attachText: p.reading.attachText })) ready.push(p.item)
      else this.log('E-NOTICE-BATCH')
    }
    if (ready.length === 0) return
    const sent = await this.deps.submitBatch(ready)
    if (!sent.ok) return this.log('E-NOTICE-BATCH')
    if (!(await store.markBatch(sent.sent, sent.batchId))) this.log('E-NOTICE-BATCH')
    this.counts.batched += sent.sent.length
    for (const id of sent.sent) stillWaiting.delete(id)
  }

  // ⑤ 지난 글 채우기 ──────────────────────────────────────

  async backfill(): Promise<void> {
    const rows = this.rows
    if (rows === null) return
    for (const plan of BACKFILL_PLAN) {
      const row = rows.get(plan.source)
      if (row === undefined || row.backfillDone || this.noBackfill.has(plan.source)) continue
      try {
        if ((await this.fillSource(rows, plan.source, plan.feeds)) === 'cut') return
      } catch {
        this.log(srcCode(plan.source))
      }
    }
  }

  /**
   * cursor 다음 쪽부터 읽어 넣고 쪽마다 cursor를 적는다. 쪽의 마지막 줄이 2026-01-01보다 앞이면 그 목록(탭)은 끝.
   * 쪽을 끝까지 보지 못했으면(시간) cursor를 올리지 않는다. 목록을 읽지 못했거나 0줄이거나 앞 쪽과 같은 쪽이면
   * 그 출처는 이번 실행에서 멈춘다(상태는 바꾸지 않는다 — 출처 상태는 새 글 확인이 정한다)
   */
  private async fillSource(rows: Map<NoticeSource, SourceRow>, source: NoticeSource, feeds: readonly Feed[]): Promise<'cut' | 'stop' | 'ok'> {
    const start = rows.get(source)
    if (start === undefined) return 'stop'
    const cursor = readCursor(feeds, start.cursor)
    for (const feed of feeds) {
      let firstKey: string | null = null
      while (!cursor.done.has(feed.key)) {
        if (this.past(BACKFILL_UNTIL_MS)) return 'cut'
        const page = cursor.pages[feed.key] + 1
        const list = await this.readList(feed, page)
        if ('error' in list || list.items.length === 0 || list.items[0].key === firstKey) {
          this.log(srcCode(source))
          return 'stop'
        }
        firstKey = list.items[0].key
        const got = await this.addRows(source, list.items)
        if (got.cut) return 'cut'
        cursor.pages[feed.key] = page
        if (list.items[list.items.length - 1].postedOn < FIRST_DAY) cursor.done.add(feed.key)
        const row: SourceRow = {
          ...(rows.get(source) ?? start),
          cursor: cursorJson(source, feeds, cursor),
          backfillDone: feeds.every((f) => cursor.done.has(f.key)),
        }
        rows.set(source, row)
        if (!(await this.deps.store.saveSource(row))) {
          this.log(srcCode(source))
          return 'stop'
        }
      }
    }
    return 'ok'
  }

  // ⑥ 실행 마감 ────────────────────────────────────────────

  async finish(): Promise<RunReport> {
    this.counts.stopped.sort((a, b) => SOURCES.indexOf(a) - SOURCES.indexOf(b))
    try {
      await this.deps.store.finishRun(this.runId, this.counts)
    } catch {
      // 실행 줄을 마감하지 못해도 DB가 6분 뒤 끝난 것으로 본다(notice_start_run)
    }
    return this.counts
  }
}

/**
 * 모으기 한 번. 다른 실행이 돌면(startRun null) 사이트·Claude를 부르지 않고 'busy',
 * 실행 줄을 열지 못하면(DB 오류) 'failed'. 그 밖에는 단계마다 오류를 삼켜 다음 단계로 가고 끝에 실행 줄을 마감한다
 */
export async function runCollector(deps: CollectorDeps): Promise<RunReport | 'busy' | 'failed'> {
  const started = deps.nowMs()
  let runId: string | null
  try {
    runId = await deps.store.startRun()
  } catch {
    return 'failed'
  }
  if (runId === null) return 'busy'
  const run = new CollectRun(deps, runId, started)
  await run.collectBatches()
  await run.checkNew()
  await run.weekly()
  await run.summarize()
  await run.backfill()
  return run.finish()
}
