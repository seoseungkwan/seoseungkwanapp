'use client'

import { formatCount } from '@/components/charts/format'
import type { StatsRange } from '@/components/stats/view'
import { doctorShareText, formatDoctors } from '@/lib/analytics/doctorStats'
import type { DoctorRow, DoctorTable } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { HowCounted } from './HowCounted'
import { BitNoteSection, bitState, type BitSectionsShown } from './PatientMixSection'
import { Section } from './parts'

// 원장님별 (stats-bit-sections AC-2706.1·AC-2706.4·AC-2705.5·AC-2707.2, first90 REQ-4414 AC-4414.4, bit-total AC-6907.2,
// 시안 docs/mockups/first90/redesign.html .s-tbl·.s-docs). 숫자는 Worker가 센 그대로 글자로만 바꾼다(N명·N건·N원, 비중은 doctorShareText).
// 768px 이상은 표(내원·매출 16px 굵게, 끝 줄 합계), 768px 미만은 원장님마다 카드(이름·매출 크게 + 다섯 칸, 합계 카드도 같다).
// 원장님이 한 분 이하면 표 대신 한 줄이다. 설명은 "어떻게 세나요?" 안이다(칸 맨 끝 '확인 필요한 날…' 줄은 bit-total AC-6907.2로 없앴다)

const TITLE = '원장님별'
const DESC = '원장님마다 환자·신환·내원·매출'
const SINGLE = '원장님이 한 분이라 나누어 볼 것이 없어요.'
const FOOT =
  '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 건당 진료비는 매출 ÷ 내원 건수예요.'
// '건당 진료비'(stats-revenue AC-4109.2, 결정 6): 매출 칸과 같은 이름. 숫자 셈은 그대로다
const COLUMNS = ['원장님', '실환자', '신환', '내원', '매출', '건당 진료비', '비중']
const KEY_COLUMNS = new Set([3, 4]) // 내원 · 매출

// 숫자 표(시안 .s-tbl): 15px, 칸 위아래 12px·좌우 16px, 첫 칸 왼쪽(바깥 여백 0), 나머지 오른쪽. 머리는 13px 흐린 600
const TH = 'whitespace-nowrap border-b border-st-line px-4 py-2 text-right text-small font-semibold text-st-muted first:pl-0 first:text-left'
const CELL = 'whitespace-nowrap border-b border-st-line px-4 py-3 text-right tabular-nums first:pl-0 first:text-left'
const TD = `${CELL} text-st-ink-2 first:font-semibold first:text-st-ink`
// 내원·매출: 16px 굵게
const TD_KEY = `${CELL} text-lead font-semibold text-st-ink`
// 합계 줄: 위 1px st-line-2 · 굵은 글자 · 마지막 줄이라 아래 선 없음
const TD_TOTAL = 'whitespace-nowrap border-t border-b-0 border-st-line-2 px-4 py-3 text-right font-semibold tabular-nums text-st-ink first:pl-0 first:text-left'
const TD_TOTAL_KEY = `${TD_TOTAL} text-lead`

const shareOf = (row: DoctorRow, total: boolean) => (total ? (row.share === null ? '–' : '100%') : doctorShareText(row.share))

function cellsOf(row: DoctorRow, total: boolean) {
  return [
    row.label,
    `${formatCount(row.patients)}명`,
    `${formatCount(row.newPatients)}명`,
    `${formatCount(row.visits)}건`,
    `${formatCount(row.amount)}원`,
    row.perVisit === null ? '–' : `${formatCount(row.perVisit)}원`,
    shareOf(row, total),
  ]
}

function DoctorsTable({ view }: { view: DoctorTable }) {
  return (
    <div className="mt-1 overflow-x-auto max-md:hidden">
      <table className="w-full border-collapse text-st-15 leading-6">
        <caption className="sr-only">원장님별 환자·신환·매출</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className={TH}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row, i) => (
            <tr key={i}>
              {cellsOf(row, false).map((cell, j) => (
                <td key={j} className={KEY_COLUMNS.has(j) ? TD_KEY : TD}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            {cellsOf(view.total, true).map((cell, j) => (
              <td key={j} className={KEY_COLUMNS.has(j) ? TD_TOTAL_KEY : TD_TOTAL}>
                {cell}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// 768px 미만 카드 하나(시안 .s-docs li): 이름 · 매출 크게, 아래 내원 · 건당 진료비 · 실환자 · 신환 · 비중
function DoctorCard({ row, total }: { row: DoctorRow; total: boolean }) {
  const cells: [string, string][] = [
    ['내원', `${formatCount(row.visits)}건`],
    ['건당 진료비', row.perVisit === null ? '–' : `${formatCount(row.perVisit)}원`],
    ['실환자', `${formatCount(row.patients)}명`],
    ['신환', `${formatCount(row.newPatients)}명`],
    ['비중', shareOf(row, total)],
  ]
  return (
    <li className={total ? 'border-t border-st-line-2 py-3' : 'border-b border-st-line py-3'}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-lead font-semibold wrap-anywhere text-st-ink">{row.label}</span>
        <span className="whitespace-nowrap text-title font-semibold tabular-nums text-st-ink">
          {formatCount(row.amount)}
          <span className="ml-0.5 text-small font-semibold text-st-ink-2">원</span>
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
        {cells.map(([name, value]) => (
          <div key={name}>
            <dt className="text-caption text-st-muted">{name}</dt>
            <dd className="text-st-15 font-semibold tabular-nums text-st-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function DoctorCards({ view }: { view: DoctorTable }) {
  return (
    <ul aria-label="원장님별 카드" className="md:hidden">
      {view.rows.map((row, i) => (
        <DoctorCard key={i} row={row} total={false} />
      ))}
      <DoctorCard row={view.total} total />
    </ul>
  )
}

type Props = {
  view: BitSectionsShown
  range: StatsRange // 복사 글의 기간 글자(label)
  hospitalName: string
  className?: string
}

export function DoctorsSection({ view, range, hospitalName, className }: Props) {
  const state = bitState(view)
  if (state.kind === 'note') return <BitNoteSection title={TITLE} note={state.note} className={className} />
  if (state.kind === 'waiting') {
    return (
      <Section title={TITLE} desc={DESC} className={className}>
        {null}
      </Section>
    )
  }
  const { doctors } = state
  if (doctors.kind === 'single') {
    return (
      <Section title={TITLE} desc={DESC} className={className}>
        <p className="mt-3 text-body text-ink-2">{SINGLE}</p>
      </Section>
    )
  }
  return (
    <Section title={TITLE} desc={DESC} className={className}>
      {/* 768px 미만 카드가 표 앞이라 넓은 화면에서는 표 바로 다음이 [어떻게 세나요?] · [표 복사] 줄이다(stats-pc-ux AC-4005.1) */}
      <DoctorCards view={doctors} />
      <DoctorsTable view={doctors} />
      <HowCounted side={<CopyButton text={formatDoctors(hospitalName, range.label, doctors)} label="표 복사" fullOnPhone />}>
        <p className="text-small text-muted">{FOOT}</p>
      </HowCounted>
    </Section>
  )
}
