import { ds } from '@/components/ui/classes'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { distText } from '@/lib/location/coords'
import { GAP_DAYS, GAP_SLOTS, HOLIDAY_NOTE, LUNCH_NOTE, gapTable } from '@/lib/location/hours'
import { commaText } from '@/lib/location/money'
import type { DeptRule, Got, Rival, SourceId } from '@/types/location'
import { type HowProps, MUTED, Section } from './Section'
import { gapSummary, inRange, placeAll, shownOf } from './text'

// 후보 자세히 › 진료 시간 빈틈(spec location AC-7909.3·AC-7921.5, design.md 11·18절 hours.ts 칸, 시안 ?s=candidate sec-hours).
// 요일 7 × 칸 7, 칸 전체에 문을 연 범위 안 경쟁 의원(지금 설정의 경쟁 과목) 수, 0이면 `빈틈`. 점심 쉼은 자료에 없어 연 것으로 세고 공휴일은 세지 않는다.
// 새로 경쟁에 넣은 과목 의원(detail 없음)과 진료 시간 자료가 없는 의원은 세지 않고 그 수를 적는다. 경쟁 과목이 0개면 `경쟁 의원 과목을 고르면 보여요.`
// props·콜백만 받는다

export type HoursSectionProps = {
  radiusM: number
  /** 그날 값 rivals — 경쟁 의원마다 detail.week(월~일 + 공휴일 8칸, 분) */
  rivals: Got<Rival[]>
  /** 의원 과목 고르기 설정 */
  deptRule: DeptRule
  onRetry?: () => void
  onOpenSource?: (id: SourceId) => void
  /** 목차 닻(기본 시안 `sec-hours`) */
  id?: string
} & HowProps

const TH = 'h-7 whitespace-nowrap px-1.5 font-medium text-muted'
const CELL = 'h-9 rounded-control bg-canvas text-center tabular-nums text-ink-2'
const GAP = 'h-9 rounded-control bg-accent-soft text-center font-semibold text-accent-strong ring-1 ring-inset ring-chart-2'

export function HoursSection({ radiusM, rivals, deptRule, onRetry, onOpenSource, id = 'sec-hours', howCtx, howOpen, onHow }: HoursSectionProps) {
  const shown = shownOf(rivals)
  const none = deptRule.rival.length === 0
  const comps = shown
    ? placeAll(inRange(shown.v, radiusM), deptRule)
        .filter((p) => p.role === 'rival')
        .map((p) => p.r)
    : []
  const known = comps.flatMap((r) => (r.detail ? [r.detail] : []))
  const fresh = comps.length - known.length // 새로 경쟁에 넣은 과목 — [다시 받기]를 누르면 채워진다
  const table = gapTable(known)
  const gaps = gapSummary(table.counts)
  const blind = comps.length > 0 && table.counted === 0 // 진료 시간 자료가 하나도 없으면 빈틈을 말하지 않는다
  return (
    <Section
      id={id}
      title="진료 시간 빈틈"
      aside={`범위 ${distText(radiusM)} 안 경쟁 의원 ${commaText(table.counted)}곳 · 칸 숫자 = 문 연 의원 수`}
      howId="hours"
      howCtx={howCtx}
      howOpen={howOpen}
      onHow={onHow}
    >
      {none ? (
        <p className={`text-body ${MUTED}`}>경쟁 의원 과목을 고르면 보여요.</p>
      ) : (
        <>
          {shown ? (
            <>
              {fresh > 0 && <p className={ds.help}>{`진료 시간이 아직 없는 ${commaText(fresh)}곳은 빼고 셌어요. [다시 받기]를 누르면 더해져요.`}</p>}
              {!blind && (
                <p data-testid="gap-line" className="rounded-control bg-accent-soft px-3 py-2 text-body text-ink">
                  {gaps.length > 0 ? (
                    <>
                      <b className="font-semibold text-accent-strong">{gaps.join(' · ')}</b>에 문 연 의원이 없어요. 이 시간에 문을 열면 환자를
                      모을 수 있어요.
                    </>
                  ) : (
                    '빈 시간이 없어요. 모든 시간에 문 연 의원이 있어요.'
                  )}
                </p>
              )}
              {!blind && (
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full border-separate border-spacing-1 text-small">
                    <thead>
                      <tr>
                        <th className={`${TH} w-28 text-left`}>시간</th>
                        {GAP_DAYS.map((d) => (
                          <th key={d} className={TH}>
                            {d}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {GAP_SLOTS.map((s, si) => (
                        <tr key={s.id}>
                          <th scope="row" className={`${TH} text-left`}>
                            {s.label}
                          </th>
                          {table.counts[si]!.map((n, d) =>
                            n === 0 ? (
                              <td key={d} className={GAP}>
                                빈틈
                              </td>
                            ) : (
                              <td key={d} className={CELL}>
                                {commaText(n)}
                              </td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {table.noHours > 0 && <p className="text-small text-muted">{`진료 시간 자료가 없는 ${commaText(table.noHours)}곳은 세지 않았어요.`}</p>}
              {!rivals.ok && <WhyLine why={rivals.why} src={rivals.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
            </>
          ) : (
            !rivals.ok && <WhyLine why={rivals.why} src={rivals.src} onRetry={onRetry} place="value" />
          )}
          <div>
            <SourceLine src="hosp-hours" asOf={shown?.asOf} onOpen={onOpenSource} />
            <p className={ds.help}>{`${LUNCH_NOTE} ${HOLIDAY_NOTE}`}</p>
          </div>
        </>
      )}
    </Section>
  )
}
