// '근거와 출처' 점수 칸의 기준 글(specs/location requirements '화면 글 기본값' › 점수 무게 판 › 기준 글, 칸 대신 값).
// 점수 무게 판과 같은 글 조각(weights/text.ts SUB_TEXT의 앞말·뒷말·고르기 글)을 쓴다:
// 많을수록 `{앞말} {값}{뒷말} 100점`(예 `1km²에 10,000명이면 100점`) · 적을수록 `{값}{단위} 이하면 100점 · {값}{단위} 이상이면 0점` ·
// 고르는 값 `고른 값이 '{좋은 쪽}'이면 100점`. 돈은 wonText, 음수는 −
import { SUB_TEXT } from '@/components/location/weights/text'
import { commaText, wonText } from '@/lib/location/money'
import { AGE_BANDS, type ScoreItemRule, type SubId } from '@/lib/location/score'

const MINUS = '−'

const numText = (n: number) => (n < 0 ? `${MINUS}${commaText(-n)}` : commaText(n))

/** 값 + 단위. 원은 돈 글자(`3,000만 원`), 나머지는 쉼표 숫자 + 단위 */
export function valueText(n: number, unit: string): string {
  if (unit === '원' && Number.isSafeInteger(n)) return wonText(n)
  return `${numText(n)}${unit}`
}

// 받침: 한글은 글자로, 숫자는 읽는 소리(영·일·삼·육·칠·팔, 0으로 끝나면 십·백·천·만), 그 밖(%·m·²)은 읽는 소리가 모음으로 끝난다
function endsWithBatchim(text: string): boolean {
  const ch = text.trim().slice(-1)
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  return /[013678]/.test(ch)
}

const ifText = (text: string) => `${text}${endsWithBatchim(text) ? '이면' : '면'}`

/** 많을수록 좋음. 세부 항목 글 조각(앞말·뒷말)이 있으면 점수 무게 판과 같은 글, 없으면 `{값}{단위}{면·이면} 100점` */
export function fullText(full: number, unit: string, id?: SubId): string {
  const t = id === undefined ? undefined : SUB_TEXT[id]
  if (t?.more === undefined) return `${ifText(valueText(full, unit))} 100점`
  return `${t.pre ? `${t.pre} ` : ''}${numText(full / (t.scale ?? 1))}${t.more} 100점`
}

export const lessText = (best: number, worst: number, unit: string) =>
  `${valueText(best, unit)} 이하면 100점 · ${valueText(worst, unit)} 이상이면 0점`

/** 세부 항목 하나의 기준 글. 고르는 값(SUB_TEXT pick — 칸 없는 세부 항목)은 `고른 값이 '{좋은 쪽}'이면 100점` */
export function itemRuleText(item: ScoreItemRule, sub: { id: SubId; unit: string }): string {
  const pick = SUB_TEXT[sub.id]?.pick
  if (pick !== undefined) return `고른 값이 '${pick}'이면 100점`
  return 'full' in item ? fullText(item.full, sub.unit, sub.id) : lessText(item.best, item.worst, sub.unit)
}

/** 무게·기준·모양이 같은가(설정 둘 견주기) */
export function sameItem(a: ScoreItemRule, b: ScoreItemRule): boolean {
  if (a.w !== b.w) return false
  if ('full' in a) return 'full' in b && a.full === b.full
  return !('full' in b) && a.best === b.best && a.worst === b.worst
}

export function sameBands(a: readonly number[], b: readonly number[]): boolean {
  const x = [...a].sort((p, q) => p - q)
  const y = [...b].sort((p, q) => p - q)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** 나이대 칸 번호 → `40~49세 · 50~59세 · …` */
export const bandsText = (bands: readonly number[]) =>
  [...bands]
    .sort((p, q) => p - q)
    .map((i) => AGE_BANDS[i])
    .filter(Boolean)
    .join(' · ')
