import { ChartLegend, type LegendItem } from '@/components/charts/ChartLegend'
import { KpiStat } from '@/components/charts/KpiStat'
import { StackedBarChart } from '@/components/charts/StackedBarChart'
import { LogoMark } from '@/components/common/LogoMark'
import { ds } from '@/components/ui/classes'
import { SAMPLE_CLINIC, SAMPLE_KPIS, SAMPLE_SERIES, SAMPLE_TABS, SAMPLE_WEEKS } from './sample'

// 대시보드 미리보기 (b2b-redesign REQ-206 AC-206.2·AC-206.3, design.md '미리보기', UI_GUIDE '미리보기'). 짜임은 승인 시안
// docs/mockups/b2b-redesign/screens.mjs의 preview다. 랜딩 히어로와 로그인 오른쪽이 이 한 컴포넌트를 같이 쓴다.
// 상자 하나(surface·1px line·4px·overflow-clip) 안에 위 줄 → 탭 줄 → KPI 4개 → 쌓은 막대(compact). 숫자는 모두 예시(sample.ts)이고
// 위 줄의 "예시 숫자" 칩과 늘 함께 보인다. 그림일 뿐이라 받는 것·누르는 것·이정표 요소(a·button·header·section …)와 tabindex가 없고,
// 서버에서 그대로 그린다(클라이언트 지시문·타이머 없음). 놓는 쪽(랜딩 .shot 등)은 바깥 자리만 정하고 안쪽 요소를 고르지 않는다

// 탭: 모두 span. 아래 2px 자리를 늘 두고(글자 높이 맞춤) 줄의 1px 선 위에 겹친다. 첫째만 지금 탭
const TAB = 'flex items-center whitespace-nowrap border-b-2 -mb-px'
const tabClass = (i: number) =>
  i === 0 ? `${TAB} border-accent font-semibold text-ink` : `${TAB} border-transparent text-muted${i >= 4 ? ' max-md:hidden' : ''}`

// KPI 칸 사이 선: 768px 이상 한 줄 4칸은 왼쪽 선, 미만 2×2는 오른쪽 칸 왼쪽 선 + 아래 줄 위 선
const KPI_LINE = ['', 'border-l', 'md:border-l max-md:border-t', 'border-l max-md:border-t']

const LEGEND: LegendItem[] = [...SAMPLE_SERIES.map((s) => ({ label: s.name, mark: s.tone })), { label: '집계 중', mark: 'hatch' }]

export function DashboardPreview() {
  return (
    <div className="min-w-0 overflow-clip rounded-control border border-line bg-surface">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-2">
          <LogoMark size={18} className="shrink-0" />
          <span className="truncate text-small font-semibold text-ink">{SAMPLE_CLINIC}</span>
        </div>
        <span className={ds.chip.accent}>예시 숫자</span>
      </div>

      <div className="flex h-9 gap-5 border-b border-line px-4 text-small font-medium">
        {SAMPLE_TABS.map((tab, i) => (
          <span key={tab} className={tabClass(i)}>
            {tab}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-4 border-b border-line max-md:grid-cols-2">
        {SAMPLE_KPIS.map((kpi, i) => (
          <div key={kpi.label} className={`min-w-0 border-line px-4 py-3 ${KPI_LINE[i]}`}>
            <KpiStat size="sm" sparkOnPhone={false} {...kpi} />
          </div>
        ))}
      </div>

      <div className="px-4 pt-3 pb-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-small font-semibold text-ink">주별 환자 수</p>
          <ChartLegend items={LEGEND} />
        </div>
        <div>
          <StackedBarChart compact title="주별 환자 수 (예시)" unit="명" series={SAMPLE_SERIES} buckets={SAMPLE_WEEKS} />
        </div>
      </div>
    </div>
  )
}
