'use client'

import { formatCount, percentOf } from '@/components/charts/format'
import type { StatsRange } from '@/components/stats/view'
import { doctorShareText, formatDoctors } from '@/lib/analytics/doctorStats'
import type { DoctorRow, DoctorTable } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { HowCounted } from './HowCounted'
import { BitNoteSection, bitState, type BitSectionsShown } from './PatientMixSection'
import { Section } from './parts'

// 원장님별 (stats-bit-sections AC-2706.1·AC-2706.4·AC-2705.5·AC-2707.2, 시안 docs/mockups/stats-bit-sections).
// 숫자는 Worker가 센 그대로 글자로만 바꾼다(N명·N건·N원, 비중은 doctorShareText). 원장님이 한 분 이하면 표 대신 한 줄이다

const TITLE = '원장님별'
const DESC = '원장님마다 환자·신환·매출'
const SINGLE = '원장님이 한 분이라 나누어 볼 것이 없어요.'
const FOOT =
  '환자 수는 접수할 때 정한 진료의, 매출은 수납할 때 적힌 진료의로 나눠요. 두 원장님께 진료받은 분은 양쪽에 세요(합계는 한 번). 매출은 수납한 날의 총진료비(공단 + 본인부담 + 비급여)예요. 1인당 진료비는 매출 ÷ 내원 건수예요.'
const COLUMNS = ['원장님', '실환자', '신환', '내원', '매출', '1인당 진료비', '비중']

// 숫자 표(시안 .nt): 머리 36px·몸 40px, 첫 칸 왼쪽(바깥 여백 0), 나머지 오른쪽. 휴대폰은 small 글자·칸 사이 6px
const TH = 'h-9 whitespace-nowrap border-b border-line px-3 text-right font-medium text-muted first:pl-0 first:text-left max-md:px-1.5'
const TD = 'h-10 whitespace-nowrap border-b border-line px-3 text-right tabular-nums text-ink first:pl-0 first:text-left max-md:px-1.5'
// 합계 줄: 위 1px line-strong · 굵은 글자 · 마지막 줄이라 아래 선 없음
const TD_TOTAL = 'h-10 whitespace-nowrap border-t border-b-0 border-line-strong px-3 text-right font-semibold tabular-nums text-ink first:pl-0 first:text-left max-md:px-1.5'

// 비중: 작은 막대(꾸밈, 휴대폰은 숨김) + 백분율
function Share({ share }: { share: number | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="block h-2 w-18 overflow-clip bg-canvas max-md:hidden">
        <span className="block h-full bg-accent" style={{ width: `${share === null ? 0 : percentOf(share, 1)}%` }} />
      </span>
      {doctorShareText(share)}
    </span>
  )
}

function cellsOf(row: DoctorRow) {
  return [
    row.label,
    `${formatCount(row.patients)}명`,
    `${formatCount(row.newPatients)}명`,
    `${formatCount(row.visits)}건`,
    `${formatCount(row.amount)}원`,
    row.perVisit === null ? '–' : `${formatCount(row.perVisit)}원`,
  ]
}

function DoctorsTable({ view }: { view: DoctorTable }) {
  return (
    <div className="mt-3 overflow-x-auto border-y border-line">
      <table className="w-full border-collapse text-body max-md:text-small">
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
              {cellsOf(row).map((cell, j) => (
                <td key={j} className={TD}>
                  {cell}
                </td>
              ))}
              <td className={TD}>
                <Share share={row.share} />
              </td>
            </tr>
          ))}
          <tr>
            {cellsOf(view.total).map((cell, j) => (
              <td key={j} className={TD_TOTAL}>
                {cell}
              </td>
            ))}
            <td className={TD_TOTAL}>{view.total.share === null ? '–' : '100%'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

type Props = {
  view: BitSectionsShown
  range: StatsRange // 설명의 기간 이름(name) · 복사 글의 기간 글자(label)
  hospitalName: string
  className?: string
}

export function DoctorsSection({ view, range, hospitalName, className }: Props) {
  const state = bitState(view)
  if (state.kind === 'note') return <BitNoteSection title={TITLE} note={state.note} className={className} />
  const desc = `${DESC} · ${range.name}`
  if (state.kind === 'waiting') {
    return (
      <Section title={TITLE} desc={desc} className={className}>
        {null}
      </Section>
    )
  }
  const { doctors } = state
  if (doctors.kind === 'single') {
    return (
      <Section title={TITLE} desc={desc} className={className}>
        <p className="mt-3 text-body text-ink-2">{SINGLE}</p>
      </Section>
    )
  }
  return (
    <Section title={TITLE} desc={desc} className={className}>
      <DoctorsTable view={doctors} />
      {/* 표 바로 다음 줄: [어떻게 세나요?] · [표 복사], 아래 글은 그 안에 접는다(stats-pc-ux AC-4005.1·AC-4004.2 ⑧) */}
      <HowCounted side={<CopyButton text={formatDoctors(hospitalName, range.label, doctors)} label="표 복사" fullOnPhone />}>
        <p className="text-small text-muted">{FOOT}</p>
      </HowCounted>
    </Section>
  )
}
