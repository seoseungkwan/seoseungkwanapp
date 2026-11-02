'use client'

import { useId, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { formatRxVisitSplit } from '@/lib/analytics/rxVisitSplit'
import type { RxSplitLine, RxSplitView } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { NumberTable } from './DetailToggle'
import { EmptyNote, Note, Section } from './parts'

// 처방별 신환·재진 (stats REQ-513 AC-513.7·513.8, 시안 notes.md §3). view null = 비트 PC에서 불러온 자료가 없음.
// [표 복사]는 병원 이름을 넣은 formatRxVisitSplit 글이다. view.text는 쓰지 않는다(Worker에는 병원 이름이 가지 않아 첫 줄이 빈 줄이다, AC-505.7)

const TITLE = '처방별 신환·재진'
const DESC = '처방마다 서로 다른 환자 수'
const BIT_ONLY = '비트 PC에서 불러오면 보여요'
const BIT_REASON = '진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'
const NO_LINES = '이 기간에 불러온 진료 줄이 없어요.'
const SHOWN = 10
const COLUMNS = ['처방', '신환', '재진', '합계']

const rowOf = (line: RxSplitLine) => [
  line.label,
  formatCount(line.newPatients),
  formatCount(line.returning),
  <span key="total" className="font-semibold">
    {formatCount(line.total)}
  </span>,
]

export function RxSplitSection({ view, hospitalName, saved, className }: { view: RxSplitView | null; hospitalName: string; saved: boolean; className?: string }) {
  const [all, setAll] = useState(false)
  const tableId = useId()
  if (view === null) {
    return (
      <Section title={TITLE} desc={saved ? DESC : undefined} className={className}>
        <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>
      </Section>
    )
  }
  if (view.kind === 'none' || view.split.lines.length === 0) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{NO_LINES}</EmptyNote>
      </Section>
    )
  }
  const { lines } = view.split
  const shown = all ? lines : lines.slice(0, SHOWN)
  return (
    <Section title={TITLE} desc={DESC} className={className}>
      <p className="mt-2 text-body text-ink-2">{view.headline}</p>
      <div id={tableId} className={`mt-3 border-y border-line ${ds.table.wrap}`}>
        <NumberTable caption={`${TITLE} (명)`} columns={COLUMNS} rows={shown.map(rowOf)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {lines.length > SHOWN ? (
          <button type="button" aria-expanded={all} aria-controls={tableId} onClick={() => setAll(!all)} className={ds.textButton}>
            {all ? `${SHOWN}개만 보기` : `모두 보기 (${formatCount(lines.length)}개)`}
          </button>
        ) : (
          <span />
        )}
        <CopyButton text={formatRxVisitSplit(hospitalName, view.split)} label="표 복사" />
      </div>
      <Note>명 = 그 기간에 그 처방을 받은 서로 다른 환자 수예요. 합계가 큰 차례예요.</Note>
    </Section>
  )
}
