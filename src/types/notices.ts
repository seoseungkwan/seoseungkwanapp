// 고시·공지 탭의 공용 모양(specs/notices design.md 11절). 서버(모으기·묻기)와 화면이 함께 쓴다.
// 날짜 칸(postedOn·weekStart)은 한국 날짜 'YYYY-MM-DD', 시각 칸(...At·oldest)은 ISO 글자다
import type { RuleTally } from '@/types/ruleAuto'

export type NoticeSource = 'hira_notice' | 'hira_crtr' | 'mohw_rss'
export type NoticeKind = 'gosi' | 'notice' | 'interp' | 'guide' | 'case'
export type CrtrTab = '01' | '02' | '09' | '10'
export type ReadMode = 'full' | 'text' | 'body'
export type NoticeState = 'wait' | 'batch' | 'done' | 'failed'
export type SourceError = 'blocked' | 'http' | 'shape'
export type Attachment = { name: string; url: string }
export type ListItem = {
  source: NoticeSource
  key: string
  title: string
  url: string
  postedOn: string
  kind: NoticeKind
  numberText: string
  tab?: CrtrTab
  ref?: string
  body: string | null
}
export type PostDetail = { body: string; attachments: Attachment[] }
export type SiteRequest = { url: string; method?: 'GET' | 'POST'; form?: string; kind: 'page' | 'file' }
export type SiteResult =
  | { ok: true; text: string }
  | { ok: true; bytes: Uint8Array }
  | { ok: false; fail: 'blocked-url' | 'http' | 'timeout' | 'too-big' }
export type Reading = {
  mode: ReadMode
  pdfs: { name: string; base64: string }[]
  texts: { name: string; text: string }[]
  attachText: string
}
export type NoticeSummary = { related: boolean; what: string; when: string; who: string; forUs: string; amends: string[] }
export type WeekTop = { head: string; body: string }
export type RuleHit = { id: string; title: string }
export type GroupPost = { source: NoticeSource; title: string; url: string; postedOn: string; attachments: Attachment[] }
export type GroupRow = {
  id?: string
  groupKey: string
  title: string
  kind: NoticeKind
  postedOn: string
  noticeNo: string | null
  body: string
  state: NoticeState
  tries: number
  posts: GroupPost[]
}
export type PostRow = GroupPost & { sourceKey: string }
export type WaitingNotice = {
  id: string
  title: string
  kind: NoticeKind
  postedOn: string
  noticeNo: string | null
  body: string
  tries: number
  posts: GroupPost[]
}
export type SourceRow = {
  source: NoticeSource
  state: 'ok' | 'stopped'
  errorCode: SourceError | null
  checkedAt: string | null
  lastOkAt: string | null
  stoppedSince: string | null
  cursor: Record<string, unknown>
  backfillDone: boolean
}
export type WeekInput = { kind: NoticeKind; title: string; summary: NoticeSummary }
export type RunUsage = { inputTokens: number; outputTokens: number; costMicroUsd: number }
export interface CollectorStore {
  startRun(): Promise<string | null>
  addRunUsage(runId: string, u: RunUsage): Promise<boolean>
  finishRun(runId: string, counts: Record<string, unknown>): Promise<boolean>
  sources(): Promise<SourceRow[]>
  saveSource(row: SourceRow): Promise<boolean>
  knownKeys(source: NoticeSource, keys: string[]): Promise<Set<string>>
  groupOf(groupKey: string): Promise<GroupRow | null>
  saveGroup(group: GroupRow, post: PostRow): Promise<boolean>
  waiting(limit: number): Promise<WaitingNotice[]>
  saveSummary(id: string, s: { summary: NoticeSummary; readMode: ReadMode; attachText: string; ruleHits: RuleHit[] }): Promise<boolean>
  failSummary(id: string): Promise<boolean>
  markBatch(ids: string[], batchId: string): Promise<boolean>
  openBatches(): Promise<{ batchId: string; ids: string[]; oldest: string }[]>
  weekExists(weekStart: string): Promise<boolean>
  weekPending(weekStart: string): Promise<boolean>
  weekNotices(weekStart: string): Promise<WeekInput[]>
  saveWeek(d: { weekStart: string; top3: WeekTop[] }): Promise<boolean>
}

// 환자 정보 모양 종류(lib/notices/askCheck.ts가 가져다 쓴다): 주민번호 · 전화번호 · 차트번호 · 긴 숫자
export type PrivateKind = 'rrn' | 'tel' | 'chart' | 'digits'

// 화면
export type NoticeMark = { readAt: string | null; starred: boolean; memo: string; memoAt: string | null; rulesCheckedAt: string | null }
export type NoticeView = {
  id: string
  title: string
  kind: NoticeKind
  postedOn: string
  noticeNo: string | null
  related: boolean | null
  summary: NoticeSummary | null
  readMode: ReadMode | null
  state: NoticeState
  ruleHits: RuleHit[]
  posts: GroupPost[]
  mark: NoticeMark
  unread: boolean
  // 내 병원 낱말 가운데 이 글에 맞은 것(넣은 차례, design 15절). 없으면 []
  keywords: string[]
  // 규칙 칩 숫자(specs/rule-auto AC-7812.5). 없음·null(판정 줄 읽기 실패)이면 규칙 칩을 그리지 않는다
  ruleTally?: RuleTally | null
}
export type NoticeFilter = { related: boolean; sources: NoticeSource[]; starred: boolean; q: string; offset: number }
export type NoticePage = { total: number; unread: number; rows: NoticeView[] }
export type RuleAlert = { id: string; noticeNo: string | null; title: string; ruleCount: number }
// 출처 상태(확인 줄·못 가져옴 띠·채우기 띠). 지난 글 쪽 표시(cursor)는 모으기만 쓴다
export type SourceView = Omit<SourceRow, 'cursor'>
// 처음 채우기 띠: 지금까지 찾은 글 수 · 요약이 끝난(실패 포함) 글 수 · 일괄 요약 중인 글 수
export type FillProgress = { total: number; done: number; batching: number }
// 주간 모음: 그 주(월~일)에 올라온 글 하나(최근 글부터). 출처는 lib/notices/view sourcesText로 그린다
export type WeekItem = {
  id: string
  title: string
  kind: NoticeKind
  postedOn: string
  related: boolean | null
  summary: NoticeSummary | null
  state: NoticeState
  posts: Pick<GroupPost, 'source'>[]
}
export type NoticeWeek = { weekStart: string; createdAt: string; top3: WeekTop[]; items: WeekItem[] }
export type AskReply =
  | { ok: true; answer: string; left: number }
  | { ok: false; kind: 'private'; kinds: PrivateKind[] }
  | { ok: false; kind: 'limit' | 'failed' }
