import { describe, expect, it } from 'vitest'
import type { AiUsage, SavedReport } from '@/types/aiReport'
import { reportMarkdown, TAG_LABEL } from './markdown'

const USAGE: AiUsage = { inputTokens: 10000, outputTokens: 4000, model: 'claude-opus-5-5' }

function report(partial: boolean): SavedReport {
  return {
    month: '2026-10',
    partial,
    summary: '신환이 늘었어요.',
    cards: [
      { tag: 'up', text: '신환이 늘었습니다.', metric: 'total.newPatients', basis: '신환 120명 (지난달 100명)' },
      { tag: 'down', text: '재진이 줄었습니다.', metric: 'total.returning', basis: '재진 80명 (지난달 90명)' },
      { tag: 'watch', text: '살펴볼 것입니다.', metric: 'total.patients', basis: '전체 200명' },
      { tag: 'guess', text: '추정입니다.', metric: 'revisit.within7', basis: '7일 안 재방문 30%' },
    ],
    model: 'claude-opus-5-5',
    inputHash: 'h',
    createdAt: '2026-11-01T00:00:00.000Z',
  }
}
const lines = (s: string) => s.split(/\r?\n/)

describe('reportMarkdown', () => {
  it('AC-514.1 제목에 달이 있다', () => {
    expect(lines(reportMarkdown(report(false), USAGE))[0]).toBe('# AI 월간 리포트 · 2026년 10월')
  })
  it('AC-514.1 partial이면 진행 중인 달 줄이 있고 아니면 없다', () => {
    expect(reportMarkdown(report(true), USAGE)).toContain('> 진행 중인 달이에요.')
    expect(reportMarkdown(report(false), USAGE)).not.toContain('진행 중인 달')
  })
  it('AC-514.1 요약과 카드마다 꼬리표 이름·문장·근거 줄', () => {
    const md = reportMarkdown(report(false), USAGE)
    expect(TAG_LABEL).toEqual({ up: '늘었어요', down: '줄었어요', watch: '살펴볼 것', guess: '추정' })
    expect(md).toContain('## 요약\n신환이 늘었어요.')
    for (const c of report(false).cards) {
      expect(md).toContain(`### ${TAG_LABEL[c.tag]}\n${c.text}\n${c.basis}`)
    }
    expect(md).not.toContain('\r')
  })
  it('AC-514.1 끝 줄에 모델·토큰·비용(달러)', () => {
    const md = reportMarkdown(report(false), USAGE)
    const last = lines(md.trimEnd()).at(-1)
    expect(last).toBe('모델 claude-opus-5-5 · 입력 토큰 10,000 · 출력 토큰 4,000 · 비용 $0.120000')
  })
  it('AC-514.1 비용은 소수 여섯째 자리까지 반올림 없이', () => {
    const md = reportMarkdown(report(false), { inputTokens: 1, outputTokens: 0, model: 'claude-opus-5-5' })
    expect(md).toContain('비용 $0.000004')
    const big = reportMarkdown(report(false), { inputTokens: 1_000_000, outputTokens: 1_000_000, model: 'claude-opus-5-5' })
    expect(big).toContain('비용 $24.000000')
  })
})
