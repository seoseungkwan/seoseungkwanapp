import type { RuleAlert } from '@/types/notices'
import type { RuleChangeAlert, RuleTally } from '@/types/ruleAuto'
import { dayText, noticeNoText } from './view'

// 점검 규칙 저절로 바꾸기 화면 글자(specs/rule-auto design 11절, AC-7801.2·AC-7801.3).
// 글자는 시안 notes.md '화면 글자'(index.html T) 그대로다. 순수 함수만(화면이 부른다). 날짜 글은 view.ts dayText를 쓴다

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

// ── 대시보드 맨 위 띠 글 (AC-7801.2) ──────────────────────
// 글 하나면 고시 번호 유무로, 둘 이상이면 k = 글 수 · n = 줄 수 합

const CHANGE_TAIL = '틀려 보이면 글 화면에서 되돌릴 수 있어요.'

// 파랑 띠 '점검 규칙이 바뀌었어요'의 글
export function changeBandText(alerts: readonly RuleChangeAlert[]): string {
  const n = sum(alerts.map((a) => a.changeCount))
  if (alerts.length === 1) {
    const no = alerts[0].noticeNo
    return no
      ? `새 고시(${noticeNoText(no)})로 점검 규칙 ${n}개가 저절로 바뀌었어요. ${CHANGE_TAIL}`
      : `새 글로 점검 규칙 ${n}개가 저절로 바뀌었어요. ${CHANGE_TAIL}`
  }
  return `새 고시 ${alerts.length}개로 점검 규칙 ${n}개가 저절로 바뀌었어요. ${CHANGE_TAIL}`
}

const HUMAN_TAIL = '저절로 고칠 수 없는 내용이라 직접 확인해야 해요.'

// 노랑 띠 '점검 규칙 확인 필요'의 글
export function humanBandText(alerts: readonly RuleAlert[]): string {
  const n = sum(alerts.map((a) => a.ruleCount))
  if (alerts.length === 1) {
    const no = alerts[0].noticeNo
    return no
      ? `새 고시(${noticeNoText(no)})가 점검 규칙 ${n}개를 바꿨는데, ${HUMAN_TAIL}`
      : `새 글이 점검 규칙 ${n}개를 바꿨는데, ${HUMAN_TAIL}`
  }
  return `새 고시 ${alerts.length}개가 점검 규칙 ${n}개를 바꿨는데, ${HUMAN_TAIL}`
}

// ── 날짜 글 · 칩 글 (AC-7801.2) ──────────────────────────

// 바뀐 규칙 카드: '2026-12-01' → '12월 1일 진료부터 적용'
export function fromText(ymd: string): string {
  return `${dayText(ymd)} 진료부터 적용`
}

// 설정 → 점검 규칙 칩: '2026-11-20' → '고시로 바뀜 · 11월 20일부터'
export function badgeText(ymd: string): string {
  return `고시로 바뀜 · ${dayText(ymd)}부터`
}

// 글 목록 파랑 칩: 2 → '점검 규칙 2개 바뀜'
export function chipChangedText(n: number): string {
  return `점검 규칙 ${n}개 바뀜`
}

// ── 글 목록 규칙 칩 고르기 (AC-7801.3) ─────────────────────

// tone: w = 노랑(warning) · a = 파랑(accent) · n = 회색(neutral)
export type RuleChip = { text: string; tone: 'w' | 'a' | 'n' }

// 사람이 봐야 함(확인 여부) → 바뀜 차례. 둘 다 0이고 살펴보는 중이 있으면 살펴보는 중 하나. 바꿀 것 없음만·tally 없음은 빈 목록
export function ruleChips(tally: RuleTally | null | undefined, rulesCheckedAt: string | null): RuleChip[] {
  if (!tally) return []
  const chips: RuleChip[] = []
  if (tally.human > 0) chips.push(rulesCheckedAt ? { text: '점검 규칙 확인함', tone: 'n' } : { text: '점검 규칙 확인 필요', tone: 'w' })
  if (tally.changed > 0) chips.push({ text: chipChangedText(tally.changed), tone: 'a' })
  if (chips.length === 0 && tally.pending > 0) chips.push({ text: '점검 규칙 살펴보는 중', tone: 'n' })
  return chips
}
