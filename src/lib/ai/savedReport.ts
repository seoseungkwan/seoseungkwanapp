import { isMonth } from '@/lib/analytics/dates'
import type { CardTag, ReportCard, SavedReport, ShownReport } from '@/types/aiReport'

// 저장된 리포트·서버 답 검사(spec ai-report-screen design.md '순수 함수'). 순수 함수만 — 네트워크·DB·SDK·node: 모듈을 쓰지 않는다.
// 저장 JSON도 서버 답도 믿지 않는다: 모양이 조금이라도 다르면 null. 맞으면 정해 둔 칸만 골라 새 객체로 돌려준다(남는 칸은 버린다 — output.ts와 같은 원칙).
// 카드 개수는 보지 않는다. 3~8개 규칙은 AI 답을 받을 때 output.ts가 본다

type Fields = Record<string, unknown>

const TAGS: readonly CardTag[] = ['up', 'down', 'watch', 'guess']

const isTag = (value: unknown): value is CardTag => TAGS.some((tag) => tag === value)

// 배열·null이 아닌 객체
function fieldsOf(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null
}

function cardOf(value: unknown): ReportCard | null {
  const o = fieldsOf(value)
  if (o === null) return null
  const { tag, text, metric, basis } = o
  if (!isTag(tag) || typeof text !== 'string' || typeof metric !== 'string' || typeof basis !== 'string') return null
  return { tag, text, metric, basis }
}

function cardsOf(value: unknown): ReportCard[] | null {
  if (!Array.isArray(value)) return null
  const cards: ReportCard[] = []
  for (const item of value) {
    const card = cardOf(item)
    if (card === null) return null
    cards.push(card)
  }
  return cards
}

// 두 모양이 함께 쓰는 검사. 만든 시각은 날짜로 읽혀야 한다 — 뒤에서 시각 글자를 만들 때 터지지 않게
function shownOf(fields: { [K in keyof ShownReport]: unknown }): ShownReport | null {
  const { month, partial, summary, model, createdAt } = fields
  if (typeof month !== 'string' || !isMonth(month)) return null
  if (typeof partial !== 'boolean' || typeof summary !== 'string' || typeof model !== 'string') return null
  if (typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) return null
  const cards = cardsOf(fields.cards)
  return cards === null ? null : { month, partial, summary, cards, model, createdAt }
}

// DB 줄: { month, report: { partial, summary, cards }, input_hash, model, created_at }
export function parseSavedReport(row: unknown): SavedReport | null {
  const o = fieldsOf(row)
  const report = fieldsOf(o?.report)
  if (o === null || report === null || typeof o.input_hash !== 'string') return null
  const shown = shownOf({
    month: o.month,
    partial: report.partial,
    summary: report.summary,
    cards: report.cards,
    model: o.model,
    createdAt: o.created_at,
  })
  return shown === null ? null : { ...shown, inputHash: o.input_hash }
}

// 서버 답의 리포트: { month, partial, summary, cards, model, createdAt }. POST 답의 inputHash는 여기서 버려진다
export function parseShownReport(value: unknown): ShownReport | null {
  const o = fieldsOf(value)
  if (o === null) return null
  const { month, partial, summary, cards, model, createdAt } = o
  return shownOf({ month, partial, summary, cards, model, createdAt })
}
