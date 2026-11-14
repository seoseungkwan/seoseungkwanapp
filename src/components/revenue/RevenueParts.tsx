import type { ReactNode } from 'react'
import type { DeltaText, Kpi, Notice, SrTable, Tone } from './types'

// 통계 매출 칸(stats/sections/RevenueSection)이 쓰는 작은 부품(시안 docs/mockups/revenue/gen.py의 .kpis·.ban·.d-note). 훅이 없다. 글자는 모두 보기 값(types.ts 모양)으로 받는다.
// 옛 매출 탭 화면만 쓰던 제목 줄·덩어리 머리·오류 번호 부품은 지웠다(stats-revenue AC-4110.4).
// 시안의 15px·2px 모서리처럼 단계 밖 값은 가까운 토큰으로 바꿨다(UI_GUIDE '간격', '모서리')

// 알림 줄(시안 .ban): 글 왼쪽 · 단추 오른쪽, 넘치면 줄바꿈. 바탕은 놓는 쪽이 정한다
export const BANNER = 'mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-control px-4 py-3 text-body text-ink-2'
export const STRONG = 'font-semibold text-ink'

const GLYPH = {
  up: 'M8 12.5v-9M4.5 7 8 3.5 11.5 7',
  down: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
} as const

/** 시안 gen.py ICONS의 화살표. 공용 Icon에 없는 그림이고 그 파일은 다른 기능 것이라 여기 둔다. 늘 꾸밈이다 */
export function Glyph({ name, size }: { name: keyof typeof GLYPH; size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={GLYPH[name]} />
    </svg>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-130 text-small text-muted">{children}</p>
}

/** 덩어리 안 안내 줄: 굵은 앞말 + 이어지는 글 */
export function NoticeLine({ notice }: { notice: Notice }) {
  return (
    <div role="note" className={`${BANNER} bg-warning-soft`}>
      <p>
        <strong className={STRONG}>{notice.lead}</strong>
        {notice.rest}
      </p>
    </div>
  )
}

const TONE: Record<Tone, string> = {
  ink: 'text-ink',
  warn: 'text-warning',
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-muted',
  none: 'text-muted',
}

// 폰 2칸 × 2줄(12·16, 왼쪽 칸 왼쪽 0, 둘째 줄 위 1px line), 768px부터 4칸(16·20, 첫 칸 왼쪽 0, 칸 사이 1px line)
const KPI_CELLS = [
  'min-w-0 py-3 pr-4 md:py-4 md:pr-5',
  'min-w-0 border-l border-line px-4 py-3 md:px-5 md:py-4',
  'min-w-0 border-t border-line py-3 pr-4 md:border-t-0 md:border-l md:py-4 md:pr-5 md:pl-5',
  'min-w-0 border-t border-l border-line px-4 py-3 md:border-t-0 md:px-5 md:py-4',
] as const

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="mt-2 grid grid-cols-2 border-b border-line md:grid-cols-4">
      {kpis.map((kpi, index) => (
        <div key={kpi.name} className={KPI_CELLS[index]}>
          <p className="text-small text-muted">{kpi.name}</p>
          <p className={`mt-1 flex items-center gap-1 text-heading-m font-semibold tabular-nums md:text-metric ${TONE[kpi.tone]}`}>
            {kpi.tone === 'up' && <Glyph name="up" size={20} />}
            {kpi.tone === 'down' && <Glyph name="down" size={20} />}
            <span>{kpi.value}</span>
            {kpi.srText && <span className="sr-only">{kpi.srText}</span>}
          </p>
          {kpi.sub && <p className="text-caption text-muted md:text-small">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  )
}

/** 표 칸의 증감: 화살표 + 글자 + 화면 읽기 글자. 값이 없으면 "–"만 */
export function DeltaCell({ delta }: { delta: DeltaText }) {
  if (delta.dir === 'none') return <span className="text-muted">{delta.text}</span>
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium ${TONE[delta.dir]}`}>
      {delta.dir === 'up' && <Glyph name="up" size={12} />}
      {delta.dir === 'down' && <Glyph name="down" size={12} />}
      {delta.text}
      {delta.srText && <span className="sr-only">{delta.srText}</span>}
    </span>
  )
}

/** 그림의 숫자를 화면 읽기로 주는 표 */
export function ReaderTable({ table }: { table: SrTable }) {
  return (
    <table className="sr-only">
      <caption>{table.caption}</caption>
      <thead>
        <tr>
          {table.head.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row[0]}>
            {row.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
