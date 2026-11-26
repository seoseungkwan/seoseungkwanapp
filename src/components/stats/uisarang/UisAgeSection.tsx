'use client'

import { useMemo } from 'react'
import { formatCount } from '@/components/charts/format'
import { Section } from '@/components/stats/sections/parts'
import type { StatsInput } from '@/components/stats/view'
import { AGE_BANDS, NO_BIRTH } from '@/lib/analytics/patientMix'
import { sumAges } from '@/lib/analytics/uisarang'
import { FOOT, ReadFailed, ReadingLine, TABLE, TABLE_WRAP, TD, TD_NUM, TH, TH_NUM, workedSet } from './parts'
import { UIS_MIX_HEAD, UIS_MIX_TABLE, UIS_MIX_TITLE, UIS_WHY, uisMixDesc, uisMixMissing } from './texts'
import { UisNote } from './UisNote'
import type { UisPeriodsView } from './useUisPeriods'

// 통계 환자 카드의 의사랑 환자 구성(specs/uisarang-upload AC-8812.3, 시안 ageHtml): 비트 환자 구성(PatientMixSection) 자리.
// 아래쪽 표(나이대 줄)를 기간 안 날마다 더한 열 줄 표: 나이대 · 내원(건) · 비율 · 신환(명) · 비율. 내원 비율 옆에 작은 막대(가장 큰 줄 = 48px).
// 진료한 날인데 아래쪽 표가 없는 날이 있으면 표 아래 그 날 수 줄, 그 아래 보험·동네 자리 셀 수 없음 안내

const ROWS = [...AGE_BANDS, NO_BIRTH]
const BAR_MAX = 48 // px

/** 비율 글(시안 pct): 소수 첫째 자리(셋째 자리 아닌 천분율에서 반올림) · 전체가 0이면 0%. 월간 보고서 나이대 칸도 같은 셈을 쓴다 */
export function ageShareText(n: number, total: number): string {
  return total === 0 ? '0%' : `${(Math.round((n / total) * 1000) / 10).toFixed(1)}%`
}

export function UisAgeSection({ periods, input, className }: { periods: UisPeriodsView; input: StatsInput; className?: string }) {
  const worked = useMemo(() => workedSet(input), [input])
  const sums = useMemo(() => (periods.state === 'ready' ? sumAges(periods.age, input.range.current, worked) : null), [periods, input.range, worked])
  if (sums === null) {
    return (
      <Section title={UIS_MIX_TITLE} className={className}>
        {periods.state === 'failed' ? <ReadFailed /> : <ReadingLine />}
      </Section>
    )
  }
  const visits = sums.bands.reduce((total, n) => total + n, 0)
  const fresh = sums.newBands.reduce((total, n) => total + n, 0)
  const most = Math.max(0, ...sums.bands)
  return (
    <Section title={UIS_MIX_TITLE} desc={uisMixDesc(formatCount(sums.days))} className={className}>
      <div className={TABLE_WRAP}>
        <table aria-label={UIS_MIX_TABLE} className={TABLE}>
          <thead>
            <tr>
              {UIS_MIX_HEAD.map((head, i) => (
                <th key={i} scope="col" className={i === 0 ? TH : TH_NUM}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((band, i) => {
              const n = sums.bands[i] ?? 0
              const m = sums.newBands[i] ?? 0
              return (
                <tr key={band}>
                  <td className={TD}>{band}</td>
                  <td className={TD_NUM}>{`${formatCount(n)}건`}</td>
                  <td className={TD_NUM}>
                    {ageShareText(n, visits)}
                    <span aria-hidden="true" className="ml-2 inline-block h-2 rounded-control bg-st-h4 align-middle" style={{ width: most === 0 ? 0 : Math.round((n / most) * BAR_MAX) }} />
                  </td>
                  <td className={TD_NUM}>{`${formatCount(m)}명`}</td>
                  <td className={TD_NUM}>{ageShareText(m, fresh)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sums.missingDays > 0 && <p className={FOOT}>{uisMixMissing(formatCount(sums.missingDays))}</p>}
      <UisNote>{UIS_WHY.mix}</UisNote>
    </Section>
  )
}
