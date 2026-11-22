import type { ReactNode } from 'react'
import { isSourceId } from '@/lib/location/sources'
import type { Got, SourceId } from '@/types/location'
import { SourceLine } from './SourceLine'
import { WhyLine } from './WhyLine'

// 숫자 칸(시안 .stat): 이름 · 값(단위) · 곁글 · 아래 출처 줄 `{기관} {자료} · 기준 {날짜}`(AC-7906.2).
// 그날 값(Got) 하나를 받는다. 출처 id가 SOURCES에 없으면 그리지 않는다.
// 값이 없으면(no-key·not-applied·failed·none·outside) 값 자리에 design.md 15절 글이 보이고 다른 칸은 그대로다(AC-7917.2).
// 옛 값(prev)이 있으면 그 값을 보이고 `지난 값 · 기준 {날짜}`를 붙인다(출처 줄 기준 날짜도 옛 값의 날짜).
// props·콜백만 받는다(읽기·저장·부르기 없음)

export type FactProps<T> = {
  label: string
  got: Got<T>
  /** 값 → 큰 글자(숫자 글자는 부르는 곳이 money·coords·area 함수로 만든다) */
  value: (v: T) => ReactNode
  unit?: string
  /** 곁글. 함수면 값이 있을 때만 그 값으로 만든다 */
  note?: ReactNode | ((v: T) => ReactNode)
  /** 목록 한도에 걸린 값이면 그 한도 수 → `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.` */
  capped?: number | null
  /** 한 칸에 출처가 둘 이상일 때 출처 줄 끝에 붙이는 글 */
  extra?: string
  /** failed의 [다시 받기] */
  onRetry?: () => void
  /** 출처 줄을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
}

const VALUE = 'mt-0.5 text-heading-m font-semibold tabular-nums text-ink'
const UNIT = 'ml-0.5 text-small font-medium tracking-normal text-muted'

export function Fact<T>({ label, got, value, unit, note, capped, extra, onRetry, onOpenSource }: FactProps<T>) {
  if (!isSourceId(got.src)) return null
  const shown = got.ok ? { v: got.v, asOf: got.asOf } : (got.prev ?? null)
  const noteNode = typeof note === 'function' ? (shown ? note(shown.v) : null) : note
  return (
    <div className="min-w-0">
      <p className="text-small text-muted">{label}</p>
      {shown ? (
        <p className={VALUE}>
          {value(shown.v)}
          {unit && <small className={UNIT}>{unit}</small>}
        </p>
      ) : (
        !got.ok && (
          <div className="mt-0.5">
            <WhyLine why={got.why} src={got.src} onRetry={onRetry} place="value" />
          </div>
        )
      )}
      {noteNode != null && noteNode !== false && <p className="text-small text-ink-2">{noteNode}</p>}
      {shown && !got.ok && <WhyLine why={got.why} src={got.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      {shown && capped != null && capped > 0 && <WhyLine why="capped" count={capped} />}
      <SourceLine src={got.src} asOf={shown?.asOf} extra={extra} onOpen={onOpenSource} />
    </div>
  )
}

// 숫자 칸 줄(시안 .stats · .stats.c3): 칸 사이 세로 선, 줄이 넘어가면 가로 선, 첫 칸은 왼쪽 여백 없음, 아래 선 하나.
// Tailwind가 소스 글자에서 클래스를 찾으므로 칸 수마다 통째로 적는다
const GRID: Record<3 | 4, string> = {
  3: 'grid min-w-0 grid-cols-3 border-b border-line *:border-line *:py-3 *:pr-4 *:not-nth-[3n+1]:border-l *:not-nth-[3n+1]:pl-4 *:nth-[n+4]:border-t',
  4: 'grid min-w-0 grid-cols-4 border-b border-line *:border-line *:py-3 *:pr-4 *:not-nth-[4n+1]:border-l *:not-nth-[4n+1]:pl-4 *:nth-[n+5]:border-t',
}

export function Facts({ cols = 4, children }: { cols?: 3 | 4; children: ReactNode }) {
  return <div className={GRID[cols]}>{children}</div>
}
