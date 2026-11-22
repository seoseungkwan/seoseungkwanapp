import 'server-only'
import { addDays, compareYmd, isYmd } from '@/lib/analytics/dates'
import { noticeNoText, sourceName } from '@/lib/notices/view'
import { checkRuleChange, noAutoRuleIds } from '@/lib/precheck/ruleUpdates'
import type { Basis, RuleDef, RulesFile } from '@/types/precheck'
import type { ReviewNotice, RuleAnswer, RuleChangeRow, RuleCheckCode, RuleVerdict } from '@/types/ruleAuto'
import { cutText } from '../text'

// 고친 규칙 정하기(specs/rule-auto REQ-7809 AC-7809.1~AC-7809.4, design 9절). 순수 함수만 둔다.
// AI 답 한 줄(parseReview 뒤)을 rule_changes에 넣을 줄로 바꾼다. change 답은 앱이 새 규칙을 만들어
// 시행일 검사(기본값 6)와 checkRuleChange(구역의 같은 검사)를 지난 것만 change 줄이 되고, 못 지나면 사람이 봐야 함(human)이다.
// 던지지 않는다 — 이상한 답은 모두 까닭 번호가 붙은 human 줄이다

/** 규칙 하나를 정할 때 필요한 것: 규칙표 · 글 · 원래 규칙(규칙표의 줄) · 지금 판(살아 있는 가장 늦은 판이나 base) · 그 판의 날짜 */
export type DecideCtx = { file: RulesFile; notice: ReviewNotice; base: RuleDef; current: RuleDef; currentFrom: string | null }

/** 까닭 글(requirements 기본값 5). 화면은 DB의 why를 그대로 그린다 */
export const REASON_TEXT = {
  noAuto: '이 규칙은 앱 안 계산으로 돌아 저절로 바꿀 수 없어요.',
  date: '시행일을 글에서 찾지 못했거나 앞뒤가 맞지 않아 직접 확인해야 해요.',
  tries: 'AI가 이 규칙을 살펴보지 못했어요. 직접 확인해 주세요.',
  check: 'AI가 고친 규칙이 점검 규칙 모양에 맞지 않아 직접 확인해야 해요.',
} as const

/** 시행일 창(기본값 6): 글이 올라온 날 −92일 ~ +366일 */
const EFFECTIVE_WINDOW = { before: 92, after: 366 } as const
/** 근거 한 줄의 doc(글 제목) 한도(자) */
const DOC_MAX = 200
/** AI가 고칠 수 있는 칸(기본값 3) — ruleJson은 이 셋만 담는다 */
const EDIT_KEYS = ['title', 'message', 'params'] as const

type Edit = Pick<RuleDef, (typeof EDIT_KEYS)[number]>
type Rec = Record<string, unknown>
const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const blank = (text: string) => text.trim() === ''

function reasonText(code: RuleCheckCode): string {
  if (code === 'no-auto') return REASON_TEXT.noAuto
  if (code === 'date') return REASON_TEXT.date
  if (code === 'tries') return REASON_TEXT.tries
  return REASON_TEXT.check
}

/** 판정 줄 바탕: 규칙·시행일·까닭 번호 없음, 전/후 빈 글 */
function judged(ctx: DecideCtx, verdict: RuleVerdict, why: string): RuleChangeRow {
  return {
    noticeId: ctx.notice.id,
    ruleId: ctx.base.id,
    baseVersion: ctx.file.version,
    verdict,
    byAi: true,
    checkCode: null,
    why,
    before: '',
    after: '',
    effectiveFrom: null,
    rule: null,
  }
}

/** 앱이 사람에게 돌린 줄: 까닭 번호와 그 번호의 까닭 글 */
function human(ctx: DecideCtx, code: RuleCheckCode): RuleChangeRow {
  return { ...judged(ctx, 'human', reasonText(code)), checkCode: code }
}

/** ruleJson → { title, message, params }(칸이 정확히 셋이고 글자·글자·객체). 아니면 null */
function editOf(text: string): Edit | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const keys = Object.keys(parsed)
  if (keys.length !== EDIT_KEYS.length || !EDIT_KEYS.every((key) => Object.hasOwn(parsed, key))) return null
  const { title, message, params } = parsed
  if (typeof title !== 'string' || typeof message !== 'string' || !isRecord(params)) return null
  return { title, message, params }
}

/** 시행일 검사(기본값 6): 실제 날짜 · 올라온 날 −92 ~ +366일 · 원래 규칙 창 안 · 지금 판 날짜보다 뒤 */
function effectiveOk(ctx: DecideCtx, eff: string): boolean {
  const { notice, base, currentFrom } = ctx
  if (!isYmd(eff) || !isYmd(notice.postedOn)) return false
  if (compareYmd(eff, addDays(notice.postedOn, -EFFECTIVE_WINDOW.before)) < 0) return false
  if (compareYmd(eff, addDays(notice.postedOn, EFFECTIVE_WINDOW.after)) > 0) return false
  if (base.effective_from !== null && compareYmd(eff, base.effective_from) < 0) return false
  if (base.effective_to !== null && compareYmd(eff, base.effective_to) > 0) return false
  if (currentFrom !== null && (!isYmd(currentFrom) || compareYmd(eff, currentFrom) <= 0)) return false
  return true
}

/**
 * 고친 규칙의 근거 한 줄(design 9절): doc = 글 제목 200자까지, number = 고시 번호 글(없으면 '출처 이름 올라온 날',
 * 출처도 없으면 '고시·공지 올라온 날'), effective = 시행일, url = 글 주소(없으면 칸 없음)
 */
export function basisLine(notice: ReviewNotice, effective: string): Basis {
  const from = notice.source ? sourceName(notice.source) : '고시·공지'
  const number = notice.noticeNo ? noticeNoText(notice.noticeNo) : `${from} ${notice.postedOn}`
  const line: Basis = { doc: cutText(notice.title, DOC_MAX), number, effective }
  return notice.url ? { ...line, url: notice.url } : line
}

/**
 * AI 답 한 줄 → rule_changes 줄(AC-7809.1~AC-7809.3).
 * none·same·human 답 = 그 판정과 AI why. change 답 = 저절로 못 바꾸는 규칙(no-auto) → 글 칸·ruleJson 모양(shape) →
 * 시행일(date) 차례로 보고, 지금 판에서 title·message·params를 바꾸고 basis 한 줄·시행일을 넣은 새 규칙을
 * checkRuleChange로 본다: 'ok'면 change 줄, 'same'이면 same 줄(AI why), 그 밖은 그 까닭 번호의 human 줄
 */
export function decideRule(ctx: DecideCtx, a: RuleAnswer): RuleChangeRow {
  if (a.verdict !== 'change') return judged(ctx, a.verdict, a.why)
  if (noAutoRuleIds(ctx.file).has(ctx.base.id)) return human(ctx, 'no-auto')
  const edit = editOf(a.ruleJson)
  if (edit === null || [a.why, a.before, a.after].some(blank)) return human(ctx, 'shape')
  const eff = a.effectiveFrom
  if (!effectiveOk(ctx, eff)) return human(ctx, 'date')

  const { current } = ctx
  const line = basisLine(ctx.notice, eff)
  const basis = current.basis.some((b) => b.number === line.number) ? current.basis : [...current.basis, line]
  const next: RuleDef = { ...current, title: edit.title, message: edit.message, params: edit.params, basis, effective_from: eff, effective_to: null }
  const check = checkRuleChange(ctx.file, ctx.base, current, next)
  if (check === 'ok') return { ...judged(ctx, 'change', a.why), before: a.before, after: a.after, effectiveFrom: eff, rule: next }
  if (check === 'same') return judged(ctx, 'same', a.why)
  return human(ctx, check)
}

/** 세 번 실패한 글의 남은 규칙마다 human 줄(AC-7809.4): by_ai 거짓 · check_code tries · 세 번 실패 글 */
export function triesRows(notice: ReviewNotice, pending: readonly string[], baseVersion: string): RuleChangeRow[] {
  return pending.map((ruleId) => ({
    noticeId: notice.id,
    ruleId,
    baseVersion,
    verdict: 'human',
    byAi: false,
    checkCode: 'tries',
    why: REASON_TEXT.tries,
    before: '',
    after: '',
    effectiveFrom: null,
    rule: null,
  }))
}
