import { Icon } from '@/components/common/Icon'
import { usageText } from '@/lib/ai/reportScreen'
import type { AiUsageView } from '@/types/aiReport'

// AI 리포트 옆 칸(spec ai-report-screen REQ-712, 시안 <aside>). props만 받아 그린다.
// 왼쪽 선과 칸 위치는 화면(AiReportScreen)이 감싸서 맡는다. 태블릿에서 두 절을 나란히 두는 것만 여기서 한다(절이 aside의 바로 아래 칸이라서)

const UNKNOWN = { calls: '—', tokens: '—', cost: '—' }
const SECTION_TITLE = 'text-small font-semibold text-ink'

export function UsageAside({ usage }: { usage: AiUsageView | null }) {
  const text = usage === null ? UNKNOWN : usageText(usage)
  const rows = [
    { label: '분석 횟수', value: text.calls },
    { label: '토큰', value: text.tokens },
    { label: '비용', value: text.cost },
  ]
  return (
    <aside aria-label="AI 사용량과 보내는 자료" className="md:max-lg:grid md:max-lg:grid-cols-2 md:max-lg:gap-x-6">
      <section>
        <h2 className={SECTION_TITLE}>이번 달 AI 사용량</h2>
        <dl className="mt-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 py-1 text-small">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-small text-muted">정확한 청구 금액은 Anthropic 콘솔에서 봐요.</p>
      </section>
      <section className="mt-5 border-t border-line pt-5 md:max-lg:mt-0 md:max-lg:border-t-0 md:max-lg:pt-0">
        <h2 className={SECTION_TITLE}>AI에게 보내는 것</h2>
        <p className="mt-2 flex gap-1.5 text-small text-ink-2">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive" />
          <span>집계 숫자와 처방·동네 이름만 보내요. 환자 이름과 차트번호는 보내지 않아요.</span>
        </p>
      </section>
    </aside>
  )
}
