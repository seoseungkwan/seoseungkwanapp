// 점검 규칙 저절로 바꾸기의 공용 모양(specs/rule-auto design 3절). 서버(모으기·AI 판정)와 화면이 함께 쓴다.
// 환자 자료 구역이 쓰는 RuleUpdate·RuleChangeCheck는 types/precheck.ts에 있다(구역 파일은 그 파일만 import).
// 날짜 칸(effectiveFrom·from·postedOn)은 한국 날짜 'YYYY-MM-DD', 시각 칸(revertedAt)은 ISO 글자다
import type { NoticeKind, NoticeSource, NoticeSummary, RuleHit } from '@/types/notices'
import type { Basis, RuleChangeCheck, RuleDef } from '@/types/precheck'

/** AI 판정 넷(기본값 2): 상관없음 · 바뀔 것 없음 · 바꿈 · 사람이 봐야 함 */
export type RuleVerdict = 'none' | 'same' | 'change' | 'human'

/** rule_changes.check_code: 검사에서 걸린 까닭(checkRuleChange) + 시행일 문제 · 세 번 실패 */
export type RuleCheckCode = Exclude<RuleChangeCheck, 'ok' | 'same'> | 'date' | 'tries'

/** AI 답 한 줄(parseReview 뒤). change가 아니면 effectiveFrom·ruleJson은 '' */
export type RuleAnswer = { id: string; verdict: RuleVerdict; why: string; before: string; after: string; effectiveFrom: string; ruleJson: string }

/** rule_changes에 넣을 줄 */
export type RuleChangeRow = {
  noticeId: string
  ruleId: string
  baseVersion: string
  verdict: RuleVerdict
  byAi: boolean
  checkCode: RuleCheckCode | null
  why: string
  before: string
  after: string
  effectiveFrom: string | null
  rule: RuleDef | null
}

/** rule_review_waiting 글 하나 */
export type ReviewNotice = {
  id: string
  title: string
  noticeNo: string | null
  postedOn: string
  kind: NoticeKind
  body: string
  attachText: string
  summary: NoticeSummary | null
  url: string | null
  source: NoticeSource | null
  ruleHits: RuleHit[]
  pending: string[]
  tries: number
}

/** 모으기가 읽는 살아 있는 바뀐 판(지금 판 고르기) */
export type LiveChange = { ruleId: string; effectiveFrom: string; rule: unknown }

/** 글 화면 줄 하나 */
export type RuleCheckView = {
  changeId: string
  ruleId: string
  verdict: RuleVerdict
  why: string
  before: string
  after: string
  from: string | null
  title: string
  seen: boolean
  reverted: boolean
  revertedAt: string | null
}

/** 글 화면 규칙 상자: 판정 줄 · 판정 줄이 하나도 없는 규칙(살펴보는 중) */
export type NoticeRuleView = { rows: RuleCheckView[]; pending: RuleHit[] }

/** 글 목록·대시보드 칸 칩 숫자: changed·human = live 줄 수(changed는 내 병원이 되돌린 것도 셈), pending = 판정 줄이 없는 규칙 수 */
export type RuleTally = { changed: number; human: number; pending: number }

/** 대시보드 파랑 띠: 내 병원이 아직 안 본, 되돌리지 않은 바뀐 판이 있는 글 */
export type RuleChangeAlert = { id: string; noticeNo: string | null; title: string; changeCount: number }

/** 설정 표 칩: from = 되돌리지 않은 가장 늦은 판 날짜(모두 되돌렸으면 가장 늦은 판 날짜), title·basis = 오늘 쓰이는 판(없으면 null) */
export type RuleBadge = { from: string; title: string | null; basis: Basis[] | null; reverted: boolean }

/** 모으기 DB 쪽 더함(collectStore가 채움, design 10절) */
export interface RuleReviewStore {
  clearOldRuleHits(cutoff: string): Promise<number>
  retireOldChanges(version: string): Promise<number>
  reviewWaiting(cutoff: string, limit: number): Promise<ReviewNotice[]>
  liveChanges(ruleIds: readonly string[], version: string): Promise<LiveChange[]>
  saveRuleChanges(rows: readonly RuleChangeRow[]): Promise<boolean>
  reviewFailed(noticeId: string): Promise<number>
}

/** 실행 기록 counts.rules */
export type RuleReport = { cleared: number; retired: number; reviewed: number; changed: number; human: number; failed: number }
