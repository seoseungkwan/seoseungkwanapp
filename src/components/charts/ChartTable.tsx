import { formatCount } from './format'
import { STATE_TEXT, type BarBucket, type BarSeries } from './StackedBarChart'

// 쌓은 막대의 보이는 표 (dashboard-ux REQ-2706 AC-2706.1·AC-2706.2·AC-2706.3, design.md §7, 시안 docs/mockups/dashboard-ux/index.html '표로 보기' table.vt).
// 열은 StackedBarChart 화면 읽기 표와 같다: 기간 · 계열… · 합계 · 상태(비교 값이 있으면 비교 기간). 칸마다 한 줄이고 앞으로 올 칸(blank future)은 줄이 없다.
// 0은 "0", 자료 없는 칸(blank no-data)은 계열·합계가 "자료 없음"(0과 다르다)이고 상태는 "–". 상태 글은 완료 · 집계 중 · 일부 기간이다.
// 상자는 높이 한도(max-h-72) 안에서 넘치면 자기 안에서 굴리고(위아래·옆 모두) 머리 줄은 위에 붙는다 — 쪽이 옆으로 밀리지 않는다.
// 캡션은 부르는 쪽이 준다(그래프 이름 · 단위 · 기간 기준). 서버에서 그대로 그린다(훅·움직임 없음). 색은 토큰 클래스로만 준다

export type ChartTableProps = {
  caption: string
  series: BarSeries[]
  buckets: BarBucket[]
}

const NO_DATA = '자료 없음'
// 칸: 위 1px line · 좌우 12px(폰 8px) · 위아래 6px · 줄바꿈 없음 · 숫자는 오른쪽, 첫 열(기간)은 왼쪽
const CELL = 'whitespace-nowrap border-t border-line px-3 py-1.5 text-right max-md:px-2'
const FIRST = 'whitespace-nowrap border-t border-line px-3 py-1.5 text-left max-md:px-2'
// 머리 칸: 위에 붙음(canvas 바탕) · 600 ink-2 · 위 선 없음
const HEAD = 'sticky top-0 whitespace-nowrap bg-canvas px-3 py-1.5 text-right font-semibold text-ink-2 max-md:px-2'
const HEAD_FIRST = 'sticky top-0 whitespace-nowrap bg-canvas px-3 py-1.5 text-left font-semibold text-ink-2 max-md:px-2'

export function ChartTable({ caption, series, buckets }: ChartTableProps) {
  const compared = buckets.some((b) => !b.blank && typeof b.comparison === 'number')
  return (
    <div className="mt-2 max-h-72 overflow-auto rounded-control border border-line">
      <table className="w-full border-collapse text-small tabular-nums">
        <caption className="bg-surface px-3 py-2 text-left text-caption text-muted">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD_FIRST}>
              기간
            </th>
            {series.map((s, i) => (
              <th key={i} scope="col" className={HEAD}>
                {s.name}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              합계
            </th>
            <th scope="col" className={HEAD}>
              상태
            </th>
            {compared && (
              <th scope="col" className={HEAD}>
                비교 기간
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => {
            if (bucket.blank === 'future') return null
            const noData = bucket.blank === 'no-data'
            const total = series.reduce((sum, _, j) => sum + (bucket.values[j] ?? 0), 0)
            const value = noData ? `${CELL} text-muted` : `${CELL} text-ink`
            return (
              <tr key={bucket.key}>
                <th scope="row" className={`${FIRST} font-medium text-ink`}>
                  {bucket.rangeLabel}
                </th>
                {series.map((_, j) => (
                  <td key={j} className={value}>
                    {noData ? NO_DATA : formatCount(bucket.values[j] ?? 0)}
                  </td>
                ))}
                <td className={noData ? value : `${CELL} font-semibold text-ink`}>{noData ? NO_DATA : formatCount(total)}</td>
                <td className={noData || bucket.state === 'complete' ? `${CELL} text-muted` : `${CELL} text-ink`}>{noData ? '–' : STATE_TEXT[bucket.state]}</td>
                {compared && (
                  <td className={`${CELL} text-muted`}>{!noData && typeof bucket.comparison === 'number' ? formatCount(bucket.comparison) : '–'}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
