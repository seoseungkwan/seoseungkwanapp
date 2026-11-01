import type { CardTag, ReportCard, ReportInput, ReportMetric } from '@/types/aiReport'
import { basisLine } from './basis'

// AI 답 검사(spec ai-report design.md 'AI 답 검사'). 순수 함수만 — 네트워크·DB·SDK·node: 모듈을 쓰지 않는다.
// AI 답은 믿지 않는다: 모양이 조금이라도 다르면 고쳐 쓰지 않고 null, 숫자 규칙·지표 ID를 어긴 카드는 고쳐 쓰지 않고 버린다.
// 근거 줄은 basisLine으로만 만든다 — AI가 준 글자에서 숫자를 꺼내 쓰지 않는다(requirements 배경 8).
// 맞으면 정해진 칸만 골라 새 객체로 돌려준다(받은 객체를 그대로 넘기지 않는다 — validate.ts와 같은 원칙)

export const SUMMARY_MAX = 200
export const CARD_TEXT_MAX = 120
export const MIN_CARDS = 3
export const MAX_CARDS = 8

type AiReport = { summary: string; cards: ReportCard[] }
type Card = { tag: CardTag; text: string; metric: string }
type Fields = Record<string, unknown>

const TOP_KEYS = ['summary', 'cards']
const CARD_KEYS = ['tag', 'text', 'metric']
const TAGS: readonly CardTag[] = ['up', 'down', 'watch', 'guess']

// 써도 되는 숫자 낱말: 'YYYY년' · 'N월'(1~2자리) · '14일' · '7일'
const ALLOWED_WORDS = [/\d{4}년/g, /\d{1,2}월/g, /14일/g, /7일/g]
// 남은 숫자. \d(0~9)보다 넓게 본다 — 전각 숫자(５)·동그라미 숫자(①)도 숫자다
const ANY_NUMBER = /\p{N}/u

// 허용 낱말을 지운 뒤 숫자가 남으면 어김. 지운 자리에 빈칸을 둔다 — 앞뒤 숫자가 붙어 새 허용 낱말이 되지 않게('12025년2월' → '1 2월' → '1  ')
export function hasForbiddenNumber(text: string): boolean {
  const rest = ALLOWED_WORDS.reduce((left, word) => left.replace(word, ' '), text)
  return ANY_NUMBER.test(rest)
}

const isTag = (value: unknown): value is CardTag => TAGS.some((tag) => tag === value)

// 정해진 열쇠가 빠짐없이, 그것만 있는 객체(배열·null 아님)
function exactly(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && own.every((key) => keys.includes(key)) ? (value as Fields) : null
}

// 앞뒤 빈칸을 뺀 글자가 1~max자면 그 글자, 아니면 null
function trimmedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= max ? text : null
}

function cardOf(value: unknown): Card | null {
  const o = exactly(value, CARD_KEYS)
  if (o === null) return null
  const { tag, metric } = o
  const text = trimmedText(o.text, CARD_TEXT_MAX)
  if (!isTag(tag) || typeof metric !== 'string' || text === null) return null
  return { tag, text, metric }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function parseAiReport(text: string, input: ReportInput): AiReport | null {
  // 1·2. 모양과 길이·꼬리표: 하나라도 어긋나면 null
  const o = exactly(parseJson(text), TOP_KEYS)
  if (o === null || !Array.isArray(o.cards)) return null
  const summary = trimmedText(o.summary, SUMMARY_MAX)
  if (summary === null) return null
  const cards: Card[] = []
  for (const item of o.cards) {
    const card = cardOf(item)
    if (card === null) return null
    cards.push(card)
  }

  // 3·4. 카드 거르기: 입력에 없는 지표 ID, 숫자 규칙을 어긴 문장은 뺀다. 같은 지표 ID를 쓴 카드는 모두 남긴다(AC-507.5).
  // Map으로 찾는다 — 'toString' 같은 객체 기본 이름을 지표로 잘못 보지 않게
  const metrics = new Map<string, ReportMetric>(input.metrics.map((m) => [m.id, m]))
  const kept: Array<{ card: Card; metric: ReportMetric }> = []
  for (const card of cards) {
    const metric = metrics.get(card.metric)
    if (metric !== undefined && !hasForbiddenNumber(card.text)) kept.push({ card, metric })
  }

  // 5. 요약 숫자 규칙, 카드 3~8개
  if (hasForbiddenNumber(summary) || kept.length < MIN_CARDS) return null

  // 6. 근거 줄은 앱이 그 지표의 진짜 값으로 붙인다
  return {
    summary,
    cards: kept.slice(0, MAX_CARDS).map(({ card, metric }) => ({ ...card, basis: basisLine(metric, input) })),
  }
}
