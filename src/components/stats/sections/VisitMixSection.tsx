import { DonutChart } from '@/components/charts/DonutChart'
import { formatCount } from '@/components/charts/format'
import { visitMix, type StatsInput, type VisitSlice } from '@/components/stats/view'
import { Section } from './parts'

// 내원 구성 도넛 칸 (first90 REQ-4412 AC-4412.1, REQ-4417 AC-4417.1·AC-4417.2, design.md 5-0·5-4, 시안 docs/mockups/first90/redesign.html .s-sub-mix).
// 일별 내원 왼쪽(1100px 이상, 좁으면 위)에 PatientTrendSection이 놓는다. 그림은 꾸밈이고 숫자는 옆 범례 글이 준다.
// 이 기간에 줄이 없으면 그리지 않는다(빈 글은 일별 내원 칸이 맡는다). 서버에서 그대로 그린다(훅 없음)
// 의사랑 의원(uis, uisarang-upload AC-8818.1·design.md §10-7)은 날 줄에 first90이 늘 없어도 옛 도우미 안내 줄을 그리지 않는다. 도넛·범례·셈은 그대로

const TITLE = '내원 구성'
const DESC = '이 기간 누적 내원 · 같은 분이 여러 번 오면 여러 건'
const OLD_NOTE = '지금은 재진에 90일초진이 들어 있어요. 새 도우미(0.7.0)로 다시 불러오면 따로 보여요.'
const MARK: Record<VisitSlice['tone'], string> = { accent: 'bg-accent', f90: 'bg-st-f90', ret: 'bg-st-ret' }

export function VisitMixSection({ input, uis = false }: { input: StatsInput; uis?: boolean }) {
  const mix = visitMix(input)
  if (mix === null) return null
  return (
    <Section title={TITLE} desc={DESC}>
      {/* 380px 미만은 범례가 도넛 아래로 간다(시안 .s-donut-wrap) */}
      <div className="mt-3 flex items-center gap-5 max-md:gap-4 max-[380px]:flex-col max-[380px]:items-stretch">
        <div className="max-[380px]:self-center">
          <DonutChart slices={mix.slices} center={['누적 내원', `${formatCount(mix.total)}건`]} motion />
        </div>
        <ul aria-label={TITLE} className="grid min-w-0 flex-1 gap-3">
          {mix.slices.map((slice) => (
            <li key={slice.key} className="grid grid-cols-[12px_auto_minmax(0,1fr)_auto] items-center gap-x-2 text-body">
              <span aria-hidden="true" className={`size-3 ${MARK[slice.tone]}`} />
              <span className="whitespace-nowrap font-semibold text-st-ink-2">{slice.name}</span>
              <span className="whitespace-nowrap text-right font-semibold tabular-nums text-st-ink">{`${formatCount(slice.value)}건`}</span>
              <span className="min-w-12 whitespace-nowrap text-right tabular-nums text-st-muted">{`${slice.share.toFixed(1)}%`}</span>
            </li>
          ))}
        </ul>
      </div>
      {!uis && !mix.known && <p className="mt-2 text-small text-st-warn-ink">{OLD_NOTE}</p>}
    </Section>
  )
}
