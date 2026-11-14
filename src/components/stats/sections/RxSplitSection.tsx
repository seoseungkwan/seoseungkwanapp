'use client'

import { useId, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { InlineBar } from '@/components/charts/InlineBar'
import { ds } from '@/components/ui/classes'
import { formatRxVisitSplit } from '@/lib/analytics/rxVisitSplit'
import type { RxSplitLine, RxSplitView } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { EmptyNote, Note, Section } from './parts'
import { useTabDesc } from './RxSection'

// 처방별 신환·재진 (stats REQ-513 AC-513.7·513.8·513.14, 시안 notes.md §3). view null = 비트 PC에서 불러온 자료가 없음.
// [표 복사]는 병원 이름을 넣은 formatRxVisitSplit 글이다. view.text는 쓰지 않는다(Worker에는 병원 이름이 가지 않아 첫 줄이 빈 줄이다, AC-505.7)
// first90 AC-4413.3: 묶음별 추세와 같은 가로 막대 순위 줄이다(처방 · 막대 · 합계 · 신환 · 재진). 숫자·10개 접기·[표 복사]는 그대로이고,
// 화면 읽기에는 지금처럼 표(role=table, 이름 '처방별 신환·재진 (명)')로 읽힌다. 막대 폭 = 합계 ÷ 가장 큰 합계(접은 줄 포함), 기간을 바꾸면 움직인다(AC-4417.2)

const TITLE = '처방별 신환·재진'
const DESC = '처방마다 서로 다른 환자 수'
const BIT_ONLY = '비트 PC에서 불러오면 보여요'
const BIT_REASON = '진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'
const NOT_LOADED = '이 기간은 아직 불러오지 않았어요'
const NOT_LOADED_HOW = '이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.'
const NO_LINES = '이 기간에 불러온 진료 줄이 없어요.'
const SHOWN = 10

// 순위 줄 칸(TreatmentTable과 같은 모양). 넓으면 한 줄, 좁으면 1줄 처방 + 합계 · 2줄 막대 · 3줄 신환 + 재진(수 앞에 이름표)
const COLUMNS = 'grid w-full items-center gap-x-3 lg:grid-cols-[minmax(160px,260px)_minmax(0,1fr)_88px_88px_88px] max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-lg:gap-x-2 max-lg:gap-y-0.5'
const HEAD = `${COLUMNS} h-9 border-b border-line text-small font-medium text-muted max-lg:sr-only`
const ROW = `${COLUMNS} border-b border-line py-3 text-body text-ink`
const NAME = 'min-w-0 wrap-anywhere font-semibold lg:col-start-1 lg:row-start-1 max-lg:col-start-1 max-lg:row-start-1'
const BAR = 'block [&>span]:w-full lg:col-start-2 lg:row-start-1 max-lg:col-[1/3] max-lg:row-start-2 max-lg:mt-1.5'
const TOTAL = 'text-right text-st-18 leading-7 font-semibold whitespace-nowrap tabular-nums lg:col-start-3 lg:row-start-1 max-lg:col-start-2 max-lg:row-start-1'
const PAIR = 'flex items-baseline justify-end gap-1 lg:row-start-1 max-lg:row-start-3 max-lg:mt-1'
const PAIR_PLACE = { new: 'lg:col-start-4 max-lg:col-start-1 max-lg:justify-start', returning: 'lg:col-start-5 max-lg:col-start-2' } as const
const PAIR_VALUE = 'text-right text-small text-ink-2 tabular-nums'
// 좁을 때만 보이는 이름표. 화면 읽기는 머리 칸으로 읽어 꾸밈이다
const PHONE_LABEL = 'text-small text-muted lg:hidden'

function Pair({ label, value, place }: { label: string; value: number; place: string }) {
  return (
    <span className={`${PAIR} ${place}`}>
      <span aria-hidden="true" className={PHONE_LABEL}>
        {label}
      </span>
      <span role="cell" className={PAIR_VALUE}>
        {formatCount(value)}
      </span>
    </span>
  )
}

function RankRow({ line, max }: { line: RxSplitLine; max: number }) {
  return (
    <div role="row" className={ROW}>
      <span role="cell" className={NAME}>
        {line.label}
      </span>
      <span aria-hidden="true" className={BAR}>
        <InlineBar current={line.total} previous={null} max={max} motion />
      </span>
      <span role="cell" className={TOTAL}>
        {formatCount(line.total)}
      </span>
      <Pair label="신환" value={line.newPatients} place={PAIR_PLACE.new} />
      <Pair label="재진" value={line.returning} place={PAIR_PLACE.returning} />
    </div>
  )
}

type Props = {
  view: RxSplitView | null
  hospitalName: string
  saved: boolean
  name?: string | null // 고른 기간의 이름(stats-period AC-1704.4, 설명 끝 ' · {name}'). 빠른 단추는 주지 않는다(설명이 지금과 같다)
  className?: string
}

export function RxSplitSection({ view, hospitalName, saved, name = null, className }: Props) {
  const [all, setAll] = useState(false)
  const tableId = useId()
  // 처방 카드(옆 글 있음) 안이면 설명은 패널 맨 위 한 줄(lead)이다(first90 AC-4413.1)
  const { head, lead } = useTabDesc(name === null ? DESC : `${DESC} · ${name}`)
  if (view === null) {
    return (
      <Section title={TITLE} desc={saved ? head : undefined} className={className}>
        {saved && lead}
        <EmptyNote title={BIT_ONLY}>{BIT_REASON}</EmptyNote>
      </Section>
    )
  }
  if (view.kind === 'none') {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote title={NOT_LOADED}>{NOT_LOADED_HOW}</EmptyNote>
      </Section>
    )
  }
  if (view.split.lines.length === 0) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{NO_LINES}</EmptyNote>
      </Section>
    )
  }
  const { lines } = view.split
  const shown = all ? lines : lines.slice(0, SHOWN)
  const max = Math.max(0, ...lines.map((line) => line.total))
  return (
    <Section title={TITLE} desc={head} className={className}>
      {lead}
      <p className="mt-2 text-body text-ink-2">{view.headline}</p>
      <div id={tableId} role="table" aria-label={`${TITLE} (명)`} className="mt-3">
        <div role="row" className={HEAD}>
          <span role="columnheader">처방</span>
          <span aria-hidden="true" />
          <span role="columnheader" className="text-right">
            합계
          </span>
          <span role="columnheader" className="text-right">
            신환
          </span>
          <span role="columnheader" className="text-right">
            재진
          </span>
        </div>
        {shown.map((line) => (
          <RankRow key={line.code} line={line} max={max} />
        ))}
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
