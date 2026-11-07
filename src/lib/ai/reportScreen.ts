import { formatCount } from '@/components/charts/format'
import { addMonths, monthOf } from '@/lib/analytics/dates'
import type { AiUsageView, ReportCard, ShownReport } from '@/types/aiReport'
import { TAG_LABEL } from './markdown'

// AI 리포트 화면의 글자(spec ai-report-screen REQ-703, design.md '순수 함수').
// 순수 함수만 — 네트워크·DB·SDK·node 모듈 없음. 달 계산은 lib/analytics/dates.ts로만 한다.
// 'YYYY-MM'은 글자 순서가 곧 달 순서라 그대로 견준다

// 고를 수 있는 처음 달(시안 값). 통계 명세가 진짜 자료 범위를 알게 되면 바꾼다
export const REPORT_FIRST_MONTH = '2026-01'

const JUST_NOW_MS = 60_000
const MICRO_USD_PER_CENT = 10_000
const OPUS_5_5 = 'claude-opus-5-5'

const KOREA_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
})

// ── 달 고르기 ────────────────────────────────────────────

// 지난달. 처음 달보다 앞이면 처음 달
export function firstMonth(today: string): string {
  const prev = addMonths(monthOf(today), -1)
  return prev < REPORT_FIRST_MONTH ? REPORT_FIRST_MONTH : prev
}

export function canGoPrev(month: string): boolean {
  return month > REPORT_FIRST_MONTH
}

export function canGoNext(month: string, today: string): boolean {
  return month < monthOf(today)
}

// ── 달 글자 ──────────────────────────────────────────────

// '2026-10' → '2026년 10월', '2026-01' → '2026년 1월'
export function longMonth(month: string): string {
  const [year, mm] = month.split('-')
  return `${Number(year)}년 ${Number(mm)}월`
}

// '2026-10' → '10월'
export function shortMonth(month: string): string {
  return `${Number(month.split('-')[1])}월`
}

// '9월, 작년 10월' · 1월이면 지난달도 작년이라 '작년 12월, 작년 1월'
export function compareMonths(month: string): string {
  const prev = addMonths(month, -1)
  const prevName = prev.slice(0, 4) === month.slice(0, 4) ? shortMonth(prev) : `작년 ${shortMonth(prev)}`
  return `${prevName}, 작년 ${shortMonth(month)}`
}

export function compareLine(month: string): string {
  return `${longMonth(month)}을 ${compareMonths(month)}과 견줘요`
}

// ── 리포트 머리 ──────────────────────────────────────────

// 시각 차이가 60초 미만이면 '방금'(저장 시각이 조금 미래여도). 그 밖은 PC 시간대와 상관없이 한국 시각
export function madeAtText(createdAt: string, now: Date): string {
  const made = new Date(createdAt)
  if (Math.abs(now.getTime() - made.getTime()) < JUST_NOW_MS) return '방금 만들었어요'
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(made).map((p) => [p.type, p.value]))
  const hour = Number(parts.hour)
  const clock = `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${parts.minute}`
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${clock}에 만들었어요`
}

// 모르는 모델(대신 답한 모델)은 받은 글자 그대로
export function modelName(model: string): string {
  return model === OPUS_5_5 ? 'Claude Opus 5.5' : model
}

// 대시보드 AI 요약의 보조 표시(dashboard-ux AC-2704.2): Opus면 버전 없이 'Claude Opus 기반 분석', 대신 답한 모델이면 그 이름
export function modelBasis(model: string): string {
  return model.startsWith('claude-opus-') ? 'Claude Opus 기반 분석' : `${modelName(model)} 분석`
}

// ── 대시보드 요약 카드 묶음 ──────────────────────────────

const CHANGE_MAX = 3
const WATCH_MAX = 2
const GUESS_MAX = 2

// 대시보드 AI 요약의 카드 묶음 셋(dashboard-ux AC-2704.2): 핵심 변화(up·down 앞 3) · 주의할 지표(watch 앞 2) · 원인 짐작(guess 앞 2). 받은 차례 그대로
export function briefGroups<T extends Pick<ReportCard, 'tag'>>(cards: readonly T[]): { change: T[]; watch: T[]; guess: T[] } {
  return {
    change: cards.filter((card) => card.tag === 'up' || card.tag === 'down').slice(0, CHANGE_MAX),
    watch: cards.filter((card) => card.tag === 'watch').slice(0, WATCH_MAX),
    guess: cards.filter((card) => card.tag === 'guess').slice(0, GUESS_MAX),
  }
}

// ── 옆 칸 ────────────────────────────────────────────────

// 비용은 정수로 센트까지 자른 뒤 글자로 만든다(소수 계산·반올림 없음, plan.md §5)
export function usageText(usage: AiUsageView): { calls: string; tokens: string; cost: string } {
  const cents = Math.floor(usage.costMicroUsd / MICRO_USD_PER_CENT)
  const dollars = Math.floor(cents / 100)
  const restCents = String(cents % 100).padStart(2, '0')
  return {
    calls: `${formatCount(usage.calls)}회`,
    tokens: `${formatCount(usage.tokens)}개`,
    cost: `$${dollars}.${restCents}`,
  }
}

// ── 복사·안내 ────────────────────────────────────────────

export function reportCopyText(report: Pick<ShownReport, 'month' | 'summary' | 'cards'>): string {
  const cards = report.cards.map((card) => `[${TAG_LABEL[card.tag]}] ${card.text}\n${card.basis}`)
  return [`${longMonth(report.month)} 보고`, report.summary, ...cards].join('\n\n')
}

export function partialNotice(
  report: Pick<ShownReport, 'month' | 'partial'>,
  today: string,
): { chip: string; title: string; body: string } | null {
  if (!report.partial) return null
  const name = shortMonth(report.month)
  // 지난 달인데 덜 찬 숫자: 통계 탭에서 그 달을 다시 불러오기 전에는 다시 분석해도 같은 숫자다(spec ai-report-stats REQ-2008)
  if (report.month < monthOf(today)) {
    return {
      chip: '덜 찬 숫자',
      title: `이 리포트는 ${name} 숫자가 다 차기 전에 만들었어요`,
      body: '숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.',
    }
  }
  return {
    chip: '진행 중',
    title: `${name}은 아직 끝나지 않은 달이에요`,
    body: '숫자가 적게 보일 수 있어요. 달이 끝난 뒤 다시 분석하면 다 찬 숫자로 써요.',
  }
}
