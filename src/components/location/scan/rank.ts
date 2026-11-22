// 동네 훑기 동 점수·색 칸·순위(spec location REQ-7907, REQ-7921 AC-7921.7, design.md 8절, 시안 ?s=scan). 순수 함수 — 읽기·저장·부르기 없음.
// 점수는 score.ts scoreItems(그 동 값, 받은 설정, 'scan') 그대로다(세 항목·'훑기 ○' 세부 항목만). 설정을 바꾸면 같은 값으로 다시 센다
import type { ScanDong } from '@/lib/location/collect'
import { fillScoreRule, scoreItems, type ScoreResult, type ScoreRule } from '@/lib/location/score'

export type { ScanDong }

export type DongScore = { code10: string; name: string; unmatched: boolean; result: ScoreResult; total: number | null }

/** 받은 차례 그대로 동마다 점수 */
export function scoreDongs(dongs: readonly ScanDong[], rule: ScoreRule): DongScore[] {
  return dongs.map((d) => {
    const result = scoreItems(d.facts, rule, 'scan')
    return { code10: d.code10, name: d.name, unmatched: d.unmatched, result, total: result.total }
  })
}

/** 경쟁 과목이 0개일 때(AC-7921.7): 경쟁 수를 값 없음으로 — '경쟁' 항목이 값 없는 항목처럼 빠지고 남은 무게로 매긴다. 다시 부르지 않는다 */
export function withoutRivals(dongs: readonly ScanDong[]): ScanDong[] {
  return dongs.map((d) => ({ ...d, facts: { ...d.facts, rivals: null, newRivals: null } }))
}

/** 점수 높은 차례(같으면 받은 차례), 점수 없는 동은 맨 뒤 */
export function rankDongs(rows: readonly DongScore[]): DongScore[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => (b.row.total ?? -1) - (a.row.total ?? -1) || a.i - b.i)
    .map((x) => x.row)
}

export type Tone = 0 | 1 | 2 | 3 | 4
/** 색 칸 이름(연한 → 진한 파랑, 지도 KakaoMap tone 0~4 = --chart-1~5) */
export const TONE_LABELS = ['59 아래', '60~69', '70~74', '75~79', '80 넘게'] as const

/** 점수 → 색 칸(시안 bin). 점수 없음은 가장 연한 칸 */
export function toneOf(total: number | null): Tone {
  if (total === null) return 0
  if (total >= 80) return 4
  if (total >= 75) return 3
  if (total >= 70) return 2
  if (total >= 60) return 1
  return 0
}

/** 항목마다 만점 = 버림(100 × 무게 ÷ 값 있는 항목 무게 합). 값 없는 항목·무게 합 0은 null(result.groups 차례) */
export function maxPoints(result: ScoreResult, rule: ScoreRule): (number | null)[] {
  const weights = fillScoreRule(rule).weights
  const sum = result.groups.reduce((a, g) => (g.score === null ? a : a + weights[g.id]), 0)
  return result.groups.map((g) => (g.score === null || sum <= 0 ? null : Math.floor((100 * weights[g.id]) / sum)))
}
