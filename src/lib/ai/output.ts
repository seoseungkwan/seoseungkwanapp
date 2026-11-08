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
const ANY_LETTER = /\p{L}/u
// 글자 앞뒤에서 뗄 것: 빈칸과 폭 없는 글자(U+200B~U+200D·U+2060·U+FEFF)
const EDGE_BLANK = /[\s\u200B-\u200D\u2060\uFEFF]/

// 지표 ID 앞글자별 label 모양(input.ts가 만드는 모양 그대로). 가운데가 이름이다.
// 세 칸 지표의 숫자 든 이름('40대'·'의료급여 1종'·'매탄1동'·'오전 9시'·원장님 이름)도 같은 예외다(spec stats-bit-ai AC-2905.4). 요일 이름에는 숫자가 없다
const NAME_LABELS: ReadonlyArray<{ id: string; head: string; tails: readonly string[] }> = [
  { id: 'group:', head: "처방 그룹 '", tails: ["' 환자", "' 신환", "' 재진"] },
  { id: 'rx:', head: "처방 '", tails: ["' 환자"] },
  { id: 'region:', head: "동네 '", tails: ["' 환자"] },
  { id: 'age:', head: "연령대 '", tails: ["' 환자"] },
  { id: 'insurance:', head: "보험 '", tails: ["' 환자"] },
  { id: 'town:', head: "동네 '", tails: ["' 환자"] },
  { id: 'hour:', head: "'", tails: ["' 하루 평균 접수"] },
  { id: 'doctor:', head: "원장님 '", tails: ["' 실환자", "' 신환", "' 매출"] },
]

// label에서 이름을 꺼낸다. 앞뒤 정해진 길이로 뗀다 — 이름에 따옴표가 있어도 되게 가운데 따옴표를 찾지 않는다. 모양이 안 맞으면 null
function nameOf({ id, label }: ReportMetric): string | null {
  const shape = NAME_LABELS.find((item) => id.startsWith(item.id))
  if (shape === undefined || !label.startsWith(shape.head)) return null
  const tail = shape.tails.find((item) => label.endsWith(item))
  return tail === undefined ? null : label.slice(shape.head.length, label.length - tail.length)
}

// 숫자 규칙에서 지울 이름: 글자와 숫자가 둘 다 든 것만(숫자·기호뿐인 이름 '1'을 넣으면 문장의 모든 1이 허용된다). 같은 이름은 한 번, 긴 이름부터
function namesOf(input: ReportInput): string[] {
  const names = input.metrics.map((metric) => nameOf(metric)).filter((name): name is string => name !== null && ANY_LETTER.test(name) && ANY_NUMBER.test(name))
  return [...new Set(names)].sort((a, b) => b.length - a.length)
}

// 숫자 규칙: 이름을 지우고(names는 긴 이름부터, 정규식이 아니라 글자 그대로 찾는다), 허용 낱말을 지운 뒤 숫자가 남으면 어김.
// 지운 자리에 빈칸을 둔다 — 앞뒤 숫자가 붙어 새 허용 낱말이 되지 않게('12025년2월' → '1 2월' → '1  ')
export function hasForbiddenNumber(text: string, names: readonly string[] = []): boolean {
  const unnamed = names.reduce((left, name) => left.split(name).join(' '), text)
  const rest = ALLOWED_WORDS.reduce((left, word) => left.replace(word, ' '), unnamed)
  return ANY_NUMBER.test(rest)
}

const isTag = (value: unknown): value is CardTag => TAGS.some((tag) => tag === value)

// 정해진 열쇠가 빠짐없이, 그것만 있는 객체(배열·null 아님)
function exactly(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && own.every((key) => keys.includes(key)) ? (value as Fields) : null
}

// 앞뒤의 빈칸과 폭 없는 글자를 뗀다. 가운데는 건드리지 않는다.
// 한 글자씩 본다 — /[…]+$/ 정규식은 믿지 못할 AI 답의 긴 빈칸 줄에서 시간이 제곱으로 는다
function withoutEdgeBlanks(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && EDGE_BLANK.test(text.charAt(start))) start += 1
  while (end > start && EDGE_BLANK.test(text.charAt(end - 1))) end -= 1
  return text.slice(start, end)
}

// 앞뒤를 뗀 글자가 1~max자면 그 글자, 아니면 null
function trimmedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = withoutEdgeBlanks(value)
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
  const names = namesOf(input)
  const kept: Array<{ card: Card; metric: ReportMetric }> = []
  for (const card of cards) {
    const metric = metrics.get(card.metric)
    if (metric !== undefined && !hasForbiddenNumber(card.text, names)) kept.push({ card, metric })
  }

  // 5. 요약 숫자 규칙, 카드 3~8개
  if (hasForbiddenNumber(summary, names) || kept.length < MIN_CARDS) return null

  // 6. 근거 줄은 앱이 그 지표의 진짜 값으로 붙인다
  return {
    summary,
    cards: kept.slice(0, MAX_CARDS).map(({ card, metric }) => ({ ...card, basis: basisLine(metric, input) })),
  }
}
