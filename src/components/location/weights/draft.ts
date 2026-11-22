// 점수 무게 판이 고치는 중인 설정(칸 글 그대로) ↔ 저장 모양 ScoreRule. 순수 함수 — 칸 검사는 score.ts checkScoreRule 한 곳
import {
  DEFAULT_SCORE_RULE,
  SCORE_GROUPS,
  checkScoreRule,
  fillScoreRule,
  type GroupId,
  type RuleProblem,
  type ScoreItemRule,
  type ScoreRule,
  type ScoreRuleDraft,
  type ScoreSubDef,
  type SubId,
} from '@/lib/location/score'
import { SUB_TEXT } from './text'

export type CriterionField = 'full' | 'best' | 'worst'
/** 세부 항목 하나: 무게(막대) · 적을수록 모양인가 · 기준 칸 글 셋(안 쓰는 모양의 칸도 쥐고 있어 p-welfare 방향을 바꿔도 남는다) */
export type SubDraft = { w: number; less: boolean } & Record<CriterionField, string>
export type Draft = { weights: Record<GroupId, number>; bands: number[]; items: Record<SubId, SubDraft> }

const ALL_SUBS: readonly ScoreSubDef[] = SCORE_GROUPS.flatMap((g) => g.subs)
const scaleOf = (id: SubId) => SUB_TEXT[id].scale ?? 1
const numText = (v: number) => v.toLocaleString('ko-KR')
const textOf = (v: number | undefined, scale: number) => (v === undefined ? '' : numText(v / scale))

/** 칸 글 → 저장 값. 빈칸 null, 정수(쉼표·빈칸 무시, 앞 − 허용)가 아니면 NaN — 둘 다 checkScoreRule이 막는다 */
export function parseCriterion(text: string, scale = 1): number | null {
  const t = text.replace(/[,\s]/g, '')
  if (t === '') return null
  if (!/^-?\d+$/.test(t)) return Number.NaN
  return Number(t) * scale
}

function subDraft(s: ScoreSubDef, item: ScoreItemRule): SubDraft {
  const k = scaleOf(s.id)
  const base = s.dir === 'more' ? { full: s.full, best: s.flip?.best, worst: s.flip?.worst } : { full: undefined, best: s.best, worst: s.worst }
  return {
    w: item.w,
    less: !('full' in item),
    full: textOf('full' in item ? item.full : base.full, k),
    best: textOf('best' in item ? item.best : base.best, k),
    worst: textOf('worst' in item ? item.worst : base.worst, k),
  }
}

/** 받은 설정(틀린 칸·빠진 세부 항목은 fillScoreRule이 처음 값으로) → 판 글 */
export function toDraft(rule: ScoreRule): Draft {
  const r = fillScoreRule(rule)
  return {
    weights: { ...r.weights },
    bands: [...r.bands],
    items: Object.fromEntries(ALL_SUBS.map((s) => [s.id, subDraft(s, r.items[s.id])])) as Record<SubId, SubDraft>,
  }
}

/** 판 글 → 저장 모양. 칸 검사를 하나라도 어기면 rule은 null이고 problems에 칸마다 글 */
export function readDraft(d: Draft): { rule: ScoreRule | null; problems: RuleProblem[] } {
  const items = Object.fromEntries(
    ALL_SUBS.map((s) => {
      const x = d.items[s.id]
      const k = scaleOf(s.id)
      return [s.id, x.less ? { w: x.w, best: parseCriterion(x.best, k), worst: parseCriterion(x.worst, k) } : { w: x.w, full: parseCriterion(x.full, k) }]
    }),
  ) as NonNullable<ScoreRuleDraft['items']>
  const bands = [...d.bands].sort((a, b) => a - b)
  const problems = checkScoreRule({ weights: d.weights, bands, items })
  if (problems.length > 0) return { rule: null, problems }
  return { rule: { v: 1, weights: { ...d.weights }, bands, items: items as Record<SubId, ScoreItemRule> }, problems }
}

/** 같은 설정인지 견줄 글(차례·빠진 칸을 fillScoreRule로 맞춘 JSON) */
export const ruleKey = (rule: ScoreRule) => JSON.stringify(fillScoreRule(rule))

const withSub = (d: Draft, id: SubId, patch: Partial<SubDraft>): Draft => ({ ...d, items: { ...d.items, [id]: { ...d.items[id], ...patch } } })

export const setWeight = (d: Draft, id: GroupId, w: number): Draft => ({ ...d, weights: { ...d.weights, [id]: w } })
export const setSubWeight = (d: Draft, id: SubId, w: number): Draft => withSub(d, id, { w })
export const setCriterion = (d: Draft, id: SubId, field: CriterionField, text: string): Draft => withSub(d, id, { [field]: text })
export const setLess = (d: Draft, id: SubId, less: boolean): Draft => withSub(d, id, { less })
export const toggleBand = (d: Draft, band: number): Draft => ({
  ...d,
  bands: d.bands.includes(band) ? d.bands.filter((b) => b !== band) : [...d.bands, band].sort((a, b) => a - b),
})

/** [기본 무게로]: 바깥 무게 다섯만 처음 값 */
export const resetWeights = (d: Draft): Draft => ({ ...d, weights: { ...DEFAULT_SCORE_RULE.weights } })

/** 항목 [기본값으로]: 그 항목의 세부 무게·기준만 처음 값(사는 사람·수요는 나이대도). 바깥 무게는 그대로 */
export function resetGroup(d: Draft, id: GroupId): Draft {
  const group = SCORE_GROUPS.find((g) => g.id === id)
  if (!group) return d
  const items = { ...d.items }
  for (const s of group.subs) items[s.id] = subDraft(s, DEFAULT_SCORE_RULE.items[s.id])
  return { ...d, items, bands: id === 'people' ? [...DEFAULT_SCORE_RULE.bands] : d.bands }
}
