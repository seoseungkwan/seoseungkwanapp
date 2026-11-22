// 동마다 까닭 한 줄(spec location REQ-7907 AC-7907.1, 시안 ?s=scan 순위·고른 동의 글). 순수 함수.
// 점수에 가장 크게 보탠 세부 항목(좋음 = 세부 점수 50 이상)과 가장 크게 깎은 세부 항목(나쁨 = 50 아래)을 값과 함께 잇는다:
//   좋음 + 나쁨 → '{좋음}지만 {나쁨}요.' · 좋음만 → '{첫째}고 {둘째}요.' · 나쁨만 → 같은 모양 · 하나뿐 → '{그것}요.'
// 크기 = (세부 점수 − 50) × 항목 무게 × 세부 무게 ÷ 그 항목의 값 있는 세부 무게 합(정수로 견줌, 같으면 score.ts 차례).
// 무게 0인 항목·세부 항목, 시군구 값이라 동마다 같은 산업단지 고용, '1곳당 사는 사람'(경쟁 의원 수와 겹침)은 까닭에 쓰지 않는다
import { distText } from '@/lib/location/coords'
import { commaText } from '@/lib/location/money'
import { fillScoreRule, type ScoreResult, type ScoreRule, type SubId } from '@/lib/location/score'

/** 못 이은 동(AC-7918.1) */
export const UNMATCHED_TEXT = '이 동은 인구 자료와 잇지 못했어요'
/** 점수가 없는 동 */
export const NO_DATA_TEXT = '점수를 매길 자료가 없어요.'

const GOOD_FROM = 50
const AGE_STEP = 10
const LAST_BAND = 10

type Stem = '많' | '적' | '멀' | '가깝' | '없' | '늘었' | '늘지 않았'
const END: Record<Stem, string> = {
  많: '많아요',
  적: '적어요',
  멀: '멀어요',
  가깝: '가까워요',
  없: '없어요',
  늘었: '늘었어요',
  '늘지 않았': '늘지 않았어요',
}
/** 앞말(주어·값) + 끝말 줄기 */
type Clause = { head: string; stem: Stem }
type Form = 'end' | 'and' | 'but'
const say = (c: Clause, form: Form) => `${c.head} ${form === 'end' ? END[c.stem] : `${c.stem}${form === 'and' ? '고' : '지만'}`}`

const n = (v: number) => commaText(Math.floor(Math.max(0, v)))

/** 많을수록 좋은 개수: 좋음 '{n}곳으로 많' · 나쁨 0이면 '없', 아니면 '{n}곳으로 적' */
const count = (subject: string, v: number, good: boolean): Clause =>
  good ? { head: `${subject} ${n(v)}곳으로`, stem: '많' } : v < 1 ? { head: subject, stem: '없' } : { head: `${subject} ${n(v)}곳으로`, stem: '적' }

/** 적을수록 좋은 개수: 좋음 0이면 '없', 아니면 '{n}곳으로 적' · 나쁨 '{이미 }{n}곳으로 많' */
const fewer = (subject: string, v: number, good: boolean, already = ''): Clause =>
  good ? (v < 1 ? { head: subject, stem: '없' } : { head: `${subject} ${n(v)}곳으로`, stem: '적' }) : { head: `${subject} ${already}${n(v)}곳으로`, stem: '많' }

type Say = (v: number, good: boolean, people: string) => Clause
const SAY: Partial<Record<SubId, Say>> = {
  'p-density': (v, good, people) => ({ head: `${people}가 1km²에 ${n(v)}명으로`, stem: good ? '많' : '적' }),
  'p-senior': (v, good) => ({ head: `60세 이상이 ${n(v)}%로`, stem: good ? '많' : '적' }),
  'p-households': (v, good) => ({ head: `세대가 ${n(v)}세대로`, stem: good ? '많' : '적' }),
  'p-trend': (v, good) =>
    good
      ? { head: `4년 사이 사람이 ${n(v)}%`, stem: '늘었' }
      : v < 1
        ? { head: '4년 사이 사람이', stem: '늘지 않았' }
        : { head: `4년 사이 사람이 ${n(v)}%만`, stem: '늘었' },
  'p-accidents': (v, good) => count('교통사고 다발 지점이', v, good),
  'p-schools': (v, good) => count('학교가', v, good),
  'p-facilities': (v, good) => count('경로당·체력단련장이', v, good),
  'c-count': (v, good) => fewer('경쟁 의원이', v, good, '이미 '),
  'c-newOpen': (v, good) => fewer('3년 새 문을 연 경쟁 의원이', v, good),
  't-station': (v, good) => ({ head: `역까지 ${distText(Math.max(0, v))}로`, stem: good ? '가깝' : '멀' }),
  't-stops': (v, good) => count('400m 안 정류장이', v, good),
}

/** 밀도 문장의 '누구': 고른 나이대(10세 칸 번호 0~10)가 이어져 있으면 그 나이, 아니면 '고른 나이대' */
export function bandsText(bands: readonly number[]): string {
  const b = [...new Set(bands)].sort((x, y) => x - y)
  const joined = b.length > 0 && b.every((v, i) => i === 0 || v === b[i - 1] + 1)
  if (!joined) return '고른 나이대 인구'
  const first = b[0]
  const last = b[b.length - 1]
  if (first === 0 && last === LAST_BAND) return '인구'
  if (last === LAST_BAND) return `${first * AGE_STEP}세 이상 인구`
  return `${first * AGE_STEP}~${last * AGE_STEP + AGE_STEP - 1}세 인구`
}

type Pick = { clause: Clause; good: boolean; num: number; den: number; order: number }
/** a의 크기 − b의 크기 부호(분모는 늘 양수) */
const cmp = (a: Pick, b: Pick) => a.num * b.den - b.num * a.den

/** 동 하나의 까닭 한 줄. 점수는 있지만 적을 까닭이 없으면 빈 글 */
export function whyLine(dong: { unmatched: boolean }, result: ScoreResult, rule: ScoreRule): string {
  if (dong.unmatched) return UNMATCHED_TEXT
  if (result.total === null) return NO_DATA_TEXT
  const r = fillScoreRule(rule)
  const people = bandsText(r.bands)
  const picks: Pick[] = []
  let order = 0
  for (const g of result.groups) {
    const gw = r.weights[g.id]
    const den = g.subs.reduce((a, s) => (s.score === null ? a : a + r.items[s.id].w), 0)
    for (const s of g.subs) {
      order += 1
      const text = SAY[s.id]
      const sw = r.items[s.id].w
      if (!text || s.score === null || s.value === null || gw <= 0 || sw <= 0 || den <= 0) continue
      const good = s.score >= GOOD_FROM
      picks.push({ clause: text(s.value, good, people), good, num: (s.score - GOOD_FROM) * gw * sw, den, order })
    }
  }
  const goods = picks.filter((p) => p.good).sort((a, b) => cmp(b, a) || a.order - b.order)
  const bads = picks.filter((p) => !p.good).sort((a, b) => cmp(a, b) || a.order - b.order)
  if (goods.length > 0 && bads.length > 0) return `${say(goods[0].clause, 'but')} ${say(bads[0].clause, 'end')}.`
  const list = goods.length > 0 ? goods : bads
  if (list.length >= 2) return `${say(list[0].clause, 'and')} ${say(list[1].clause, 'end')}.`
  if (list.length === 1) return `${say(list[0].clause, 'end')}.`
  return ''
}
