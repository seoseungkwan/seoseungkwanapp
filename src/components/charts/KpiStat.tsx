import type { Delta } from '@/types/analysis'
import { formatCount, formatDelta, formatRate, type DeltaUnit, type DeltaView } from './format'
import { Sparkline } from './Sparkline'

// 숫자 칸 하나 (b2b-redesign REQ-205 AC-205.3, UI_GUIDE '차트'). 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 kpiCell이다.
// 이름(small muted) + 오른쪽 Sparkline → 값(metric, 작은 것 heading-m) + 단위 → 증감 줄.
// 상자가 아니다(테두리·안쪽 여백 없음) — 칸 사이 선과 여백은 놓는 쪽(KPI 줄)이 준다. 보이는 글자가 곧 정보이고 그림은 꾸밈(aria-hidden)이다.
// 값이 없으면 "–" + "자료 없음"만 둔다(숫자를 지어내지 않는다. 아래 글은 emptyText로 바꿀 수 있다, tab-frame REQ-314). 서버에서 그대로 그린다(훅·움직임 없음)

export type KpiStatProps = {
  label: string
  value: number | null
  format: 'count' | 'percent'
  unit: string
  delta?: Delta | null
  deltaUnit?: DeltaUnit // 없으면 percent는 '%p', count는 '명'
  compareLabel?: string // 예: "그 전 주 대비". 기본 크기에서만 보인다
  spark?: number[] | null
  size?: 'md' | 'sm'
  sparkOnPhone?: boolean // false면 768px 미만에서 Sparkline을 숨긴다
  emptyText?: string // 값이 null일 때 "–" 아래 글. 기본 '자료 없음'
}

// 늘어남·줄어듦 삼각형(시안 tri). 색은 줄의 글자색(positive·negative)을 따른다
const ARROW = { up: 'M4 1.2 7.4 6.8H.6z', down: 'M4 6.8 7.4 1.2H.6z' } as const
const TONE: Record<DeltaView['dir'], string> = {
  up: 'text-positive',
  down: 'text-negative',
  flat: 'text-muted',
  none: 'text-muted',
}

export function KpiStat({
  label,
  value,
  format,
  unit,
  delta,
  deltaUnit,
  compareLabel,
  spark,
  size = 'md',
  sparkOnPhone = true,
  emptyText = '자료 없음',
}: KpiStatProps) {
  const small = size === 'sm'
  const valueClass = `${small ? 'mt-0.5 text-heading-m' : 'mt-1 text-metric'} font-semibold`
  const showSpark = value !== null && spark != null && spark.length >= 2

  return (
    <div className="min-w-0">
      <div className={`flex items-start justify-between gap-2 ${small ? 'h-5.5' : 'h-7'}`}>
        <span className="text-small text-muted">{label}</span>
        {showSpark && (
          <span className={`flex shrink-0${sparkOnPhone ? '' : ' max-md:hidden'}`}>
            <Sparkline values={spark} size={size} />
          </span>
        )}
      </div>
      {value === null ? (
        <>
          <p className={`${valueClass} text-muted`}>–</p>
          <p className="text-small text-muted">{emptyText}</p>
        </>
      ) : (
        <>
          <p className={`${valueClass} tabular-nums text-ink`}>
            {format === 'percent' ? formatRate(value) : formatCount(value)}
            <span className="ml-0.5 text-body font-medium tracking-normal text-muted">{unit}</span>
          </p>
          {delta && (
            <DeltaLine
              view={formatDelta(delta, deltaUnit ?? (format === 'percent' ? '%p' : '명'))}
              compareLabel={small ? undefined : compareLabel}
              small={small}
            />
          )}
        </>
      )}
    </div>
  )
}

// 증감 줄: 화살표(늘어남·줄어듦만) + 화면 읽기 글자 + 증감 글자 + 비교 이름(muted). 낱말 사이 빈칸은 화면 읽기가 붙여 읽지 않게 둔다
function DeltaLine({ view, compareLabel, small }: { view: DeltaView; compareLabel?: string; small: boolean }) {
  const arrow = view.dir === 'up' || view.dir === 'down' ? ARROW[view.dir] : null
  return (
    <p className={`flex items-center gap-1 ${small ? 'text-caption' : 'mt-1 text-small'} ${TONE[view.dir]}`}>
      {arrow && (
        <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
          <path d={arrow} fill="currentColor" />
        </svg>
      )}
      {view.srText && <span className="sr-only">{view.srText}</span>}{' '}
      <span className="tabular-nums">{view.text}</span>
      {compareLabel && (
        <>
          {' '}
          <span className="ml-1 text-muted">{compareLabel}</span>
        </>
      )}
    </p>
  )
}
