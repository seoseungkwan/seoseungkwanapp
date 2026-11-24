'use client'

import { formatCount } from '@/components/charts/format'
import { StatsCard } from '@/components/stats/sections/parts'
import type { JobPay, PayByJob } from '@/lib/admin/compare/pay'
import type { CompareRow } from '@/lib/admin/compare/rank'
import { ownFirst } from '@/lib/admin/compare/sort'
import { STAFF_JOBS } from '@/types/staff'
import { monthText } from './ComparePickers'
import { Empty, manOnly, NameCell, NONE, NOTE, regionEmpty, STICKY, STICKY_HEAD, TABLE, TABLE_WRAP, TD_NA, TD_TONE } from './RankTable'

// 의원 비교 직군별 월급 표(spec admin-view REQ-8015 AC-8015.3·AC-8015.6, REQ-8023 AC-8023.3, design.md '화면 글자' 직군별 월급).
// 시안 docs/mockups/admin-view ?s=compare .rank.pay 그대로: 칸 = 의원 + 직군 여섯 + 파트타임(모두 왼쪽 정렬), 줄 = 내 의원 먼저 + 이름 차례.
// 직군 칸 = 평균(만 원 아래 버림) + 사람 수·가장 적은~많은(한 명이면 금액 + 1명). 급여 없는 의원은 그 줄에 한 칸 글.
// 아래 줄 '전체'는 직군마다 모든 사람 평균 = Σ(의원 평균 × 사람 수) ÷ Σ사람 수(원 미만 버림). 파트타임은 평균에 넣지 않고 사람 수만

const TITLE = '직군별 월급'
const DESC = '정규직·계약직 · 실수령 기준 · 평균과 가장 적은~많은'
const FOOT = '파트타임은 일하는 시간이 달라 평균에 넣지 않고 사람 수만 적어요.'

// 시안 .pay: 칸은 왼쪽 정렬·위 맞춤, 칸 안은 두 줄(600 ink / 12px muted)
const PAY_TH = 'border-b border-line px-3 py-1.5 text-left align-bottom font-semibold whitespace-nowrap text-muted last:pr-0'
const PAY_TD = 'border-b border-line px-3 py-2 text-left align-top whitespace-nowrap group-hover:bg-canvas last:pr-0'
// 아래 줄: 위 1px line-strong · 600 ink(빈 칸은 600 muted), 아래 선 없음
const PAY_FOOT = 'border-t border-line-strong px-3 py-2 text-left align-top font-semibold whitespace-nowrap last:pr-0'
const LINE_A = 'block font-semibold text-ink'
const LINE_B = 'block text-caption text-muted'

const range = (pay: Pick<JobPay, 'min' | 'max'>) => `${formatCount(Math.trunc(pay.min / 10000))}만~${formatCount(Math.trunc(pay.max / 10000))}만 원`
const paid = (pay: PayByJob | null): pay is PayByJob => pay !== null && !pay.none

function JobCell({ pay }: { pay: JobPay | null }) {
  if (pay === null || pay.count === 0) return <td className={`${PAY_TD} ${TD_NA}`}>{NONE}</td>
  return (
    <td className={`${PAY_TD} ${TD_TONE}`}>
      {pay.count === 1 ? (
        <>
          <span className={LINE_A}>{manOnly(pay.avg)}</span>
          <span className={LINE_B}>1명</span>
        </>
      ) : (
        <>
          <span className={LINE_A}>{`평균 ${manOnly(pay.avg)}`}</span>
          <span className={LINE_B}>{`${pay.count}명 · ${range(pay)}`}</span>
        </>
      )}
    </td>
  )
}

// 직군 하나의 모든 사람 평균(의원 평균 × 사람 수의 합 ÷ 사람 수, 원 미만 버림)·가장 적은~많은. 사람이 없으면 null
function allOf(pays: readonly PayByJob[], job: (typeof STAFF_JOBS)[number]): JobPay | null {
  const lines = pays.flatMap((pay) => (pay.jobs[job] ? [pay.jobs[job]] : []))
  const count = lines.reduce((total, line) => total + line.count, 0)
  if (count === 0) return null
  const sum = lines.reduce((total, line) => total + line.avg * line.count, 0)
  return { count, avg: Math.floor(sum / count), min: Math.min(...lines.map((line) => line.min)), max: Math.max(...lines.map((line) => line.max)) }
}

type Props = { month: string; region: string; rows: readonly CompareRow[] }

export function PayTable({ month, region, rows }: Props) {
  const ordered = ownFirst(rows)
  const pays = ordered.map((row) => row.pay).filter(paid)
  const empty = rows.length === 0 ? regionEmpty(region) : pays.length === 0 ? (['급여 없음', `${monthText(month)} 급여를 적은 의원이 없어요.`] as [string, string]) : null
  const showRegion = region === '전체'
  const monthNumber = Number(month.slice(5, 7))

  return (
    <StatsCard id="cmp-pay" title={TITLE} desc={`${monthText(month)} 급여 · ${DESC}`}>
      <div>
        {empty ? (
          <Empty note={empty} />
        ) : (
          <>
            <div className={TABLE_WRAP}>
              <table aria-label={TITLE} className={TABLE}>
                <thead>
                  <tr>
                    <th className={`${STICKY_HEAD} border-b py-1.5 align-bottom font-semibold text-muted`}>의원</th>
                    {STAFF_JOBS.map((job) => (
                      <th key={job} className={PAY_TH}>
                        {job}
                      </th>
                    ))}
                    <th className={PAY_TH}>파트타임</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((row) => {
                    const pay = paid(row.pay) ? row.pay : null
                    return (
                      <tr key={row.id} className="group">
                        <NameCell row={row} showRegion={showRegion} />
                        {pay ? (
                          <>
                            {STAFF_JOBS.map((job) => (
                              <JobCell key={job} pay={pay.jobs[job]} />
                            ))}
                            <td className={`${PAY_TD} ${pay.partTime > 0 ? TD_TONE : TD_NA}`}>{pay.partTime > 0 ? `${pay.partTime}명` : NONE}</td>
                          </>
                        ) : (
                          <td colSpan={STAFF_JOBS.length + 1} className={`${PAY_TD} ${TD_NA}`}>
                            {`급여 없음 · ${monthNumber}월 급여를 적지 않았어요`}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className={`${STICKY} h-10 border-t border-t-line-strong font-semibold text-ink`}>{`전체 ${rows.length}곳`}</td>
                    {STAFF_JOBS.map((job) => {
                      const all = allOf(pays, job)
                      return all === null ? (
                        <td key={job} className={`${PAY_FOOT} ${TD_NA}`}>
                          {NONE}
                        </td>
                      ) : (
                        <td key={job} className={`${PAY_FOOT} text-ink`}>
                          <span className={LINE_A}>{`평균 ${manOnly(all.avg)}`}</span>
                          <span className="block text-caption font-normal text-muted">{`${all.count}명 · ${range(all)}`}</span>
                        </td>
                      )
                    })}
                    <td className={`${PAY_FOOT} text-ink`}>{`${pays.reduce((total, pay) => total + pay.partTime, 0)}명`}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={NOTE}>{FOOT}</p>
          </>
        )}
      </div>
    </StatsCard>
  )
}
