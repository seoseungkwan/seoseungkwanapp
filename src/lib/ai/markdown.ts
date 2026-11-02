import { formatCount } from '@/components/charts/format'
import type { AiUsage, CardTag, SavedReport } from '@/types/aiReport'
import { costMicroUsd } from './cost'

// 뽑아 보기 명령이 파일로 쓸 Markdown(spec ai-report design.md '뽑아 보기·열쇠 명령', REQ-514).
// 순수 함수만 — 파일 쓰기는 scripts/가 한다. 줄바꿈은 \n

export const TAG_LABEL: Readonly<Record<CardTag, string>> = {
  up: '늘었어요',
  down: '줄었어요',
  watch: '살펴볼 것',
  guess: '추정',
}

// 백만분의 1달러 정수 → '$0.120000' (정수 계산, 반올림 없음)
function dollars(micro: number): string {
  const whole = Math.trunc(micro / 1_000_000)
  const frac = micro - whole * 1_000_000
  return `$${whole}.${String(frac).padStart(6, '0')}`
}

export function reportMarkdown(report: SavedReport, usage: AiUsage): string {
  const [year, month] = report.month.split('-')
  const out: string[] = [`# AI 월간 리포트 · ${Number(year)}년 ${Number(month)}월`]
  if (report.partial) out.push('> 진행 중인 달이에요. 아직 끝나지 않아 숫자가 적게 보일 수 있어요.')
  out.push('## 요약', report.summary, '## 카드')
  for (const card of report.cards) {
    out.push(`### ${TAG_LABEL[card.tag]}`, card.text, card.basis)
  }
  out.push(
    '---',
    `모델 ${usage.model} · 입력 토큰 ${formatCount(usage.inputTokens)} · 출력 토큰 ${formatCount(usage.outputTokens)} · 비용 ${dollars(costMicroUsd(usage))}`,
  )
  return out.join('\n') + '\n'
}
