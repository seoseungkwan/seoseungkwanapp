'use client'

import type { ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { sunapPct } from '@/components/stats/sunapView'
import { ds } from '@/components/ui/classes'
import type { SunapRates, SunapTotals } from '@/types/sunap'
import { HowCounted } from './HowCounted'
import { bitState, type BitSectionsShown } from './PatientMixSection'
import { EmptyNote, Note, Section } from './parts'

// 통계 '예약·전환' 칸 (spec sunap-ilji REQ-4906 AC-4906.2·AC-4906.3, 시안 docs/mockups/sunap-ilji/index.html ?s=stats).
// 큰 카드 '예약·전환'(StatsSections) 안의 칸 셋: 초진 예약률 · 90일 예약률(수납일지 마감한 날의 합) · Block 전환(비트에서 바로 센 기간 전체).
// 넓은 화면은 세 열, 휴대폰은 한 열이다. 글은 시안 그대로이고 원장님별 표·시안 꼬리표 '새 칸'은 없다(design.md '시안과 다른 곳').
// 비율은 sunapView(sunapPct)가 만들고 분모가 0이면 '–'다. 숫자는 props로만 받는다(저장소·Worker는 StatsScreen이 잇는다)

/** 마감한 날 한 줄에서 이 칸이 쓰는 것(listSunapDays의 SunapDay가 그대로 들어온다. 섹션은 저장소를 부르지 않는다) */
export type SunapClosedDay = { day: string; late: boolean; totals: Pick<SunapTotals, 'first_n' | 'rsv_first' | 'd90_n' | 'rsv_d90'> }
/** 마감한 날(listSunapDays). 'reading' = 읽는 중, 'failed' = 읽기 실패 */
export type SunapClosed = readonly SunapClosedDay[] | 'reading' | 'failed'
/** 수납일지 설정의 Block·물리치료 묶음. none = 안 골랐거나 고른 묶음이 통계 묶음에 없음, chosen = 둘 다 찾아 세 칸 묻기에 싣는다 */
export type SunapGroupsState = 'reading' | 'failed' | 'none' | 'chosen'
/** StatsSections가 받는 값(StatsScreen의 useStatsSunap) */
export type StatsSunapShown = { closed: SunapClosed; groups: SunapGroupsState; onReread(): void }

type Props = StatsSunapShown & {
  bit: BitSectionsShown // 세 칸 답. sunapRates는 답의 sunap에 있다(묶음을 실어 물었을 때만)
  worked: readonly string[] // 진료한 날(기간 안 저장된 날 숫자에서 환자가 있는 날). 비면 모른다
}

const RSV_FIRST = '초진 예약률'
const RSV_D90 = '90일 예약률'
const RSV_DESC = '수납일지 마감한 날만'
const BLOCK = 'Block 전환'
const BLOCK_DESC = '비트에서 바로 · 기간 전체'
const RESERVED = '주사치료·진료(경과) 예약'
const NO_CLOSED = '수납일지를 마감한 날이 없어요'
const NO_GROUPS = '수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요'
const RETRY = '다시 읽기'
// [어떻게 세나요?] 안 글. 시안의 원장님별 표 아래 글·옆 글을 원장님 말만 빼고 옮겼다
const HOW = [
  '예약률 = 수납일지 마감한 날의 합 · 주사치료·진료(경과) 예약만(예약 안 하고 가심·기타·종류 모름은 빼요)',
  'Block 전환은 비트에서 바로 · 수납일지에서 고친 체크는 안 들어가요',
  '초진+Block % = 초진 중 · 90일+Block % = 90일초진 중 · 재진+Block % = Block 받은 사람 중(엑셀과 같음)',
  'Block·물리치료 % = 내원 중',
]

// 세 열(휴대폰 한 열). 칸 사이는 얇은 세로선(휴대폰은 가로선)
const GRID = 'grid grid-cols-3 max-md:grid-cols-1'
const CELL_FIRST = 'pr-5 max-md:pr-0 max-md:pb-4'
const CELL_NEXT = 'border-l border-st-line px-5 max-md:border-t max-md:border-l-0 max-md:px-0 max-md:py-4'
const CELL_LAST = 'border-l border-st-line pl-5 max-md:border-t max-md:border-l-0 max-md:pt-4 max-md:pl-0'
const BIG = 'mt-2 text-st-34 leading-tight font-semibold text-st-ink tabular-nums'
// 줄: 이름 | 가운데 글 | 값 (시안 .kv). 아래 묶음은 위 선 하나로 나눈다(시안 hr)
const LIST = 'grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 text-small leading-5'
const LIST_TOP = `mt-3 ${LIST}`
const LIST_BELOW = `mt-1.5 border-t border-st-line pt-1.5 ${LIST}`
const LINE = 'mt-3 text-body text-ink-2'

type Row = { label: ReactNode; middle?: string; value?: string; sub?: boolean; warn?: boolean }

function Rows({ rows, below = false }: { rows: readonly Row[]; below?: boolean }) {
  return (
    <dl className={below ? LIST_BELOW : LIST_TOP}>
      {rows.map((row, i) => (
        <div key={i} className="contents">
          <dt className={`min-w-0 ${row.sub ? 'text-st-muted' : 'text-st-ink-2'}`}>{row.label}</dt>
          <dd className="text-right whitespace-nowrap text-st-muted tabular-nums">{row.middle ?? ''}</dd>
          <dd className={`text-right font-semibold whitespace-nowrap tabular-nums ${row.warn ? 'text-st-warn-ink' : 'text-st-ink'}`}>{row.value ?? ''}</dd>
        </div>
      ))}
    </dl>
  )
}

const people = (n: number) => `${formatCount(n)}명`
const dayCount = (n: number) => `${formatCount(n)}일`
const fraction = (part: number, whole: number) => `${formatCount(part)}/${formatCount(whole)}`

type ClosedSums = { days: number; late: number; first: number; rsvFirst: number; d90: number; rsvD90: number; dates: ReadonlySet<string> }

function sumClosed(days: readonly SunapClosedDay[]): ClosedSums {
  const sums = { days: days.length, late: 0, first: 0, rsvFirst: 0, d90: 0, rsvD90: 0 }
  for (const { late, totals } of days) {
    if (late) sums.late++
    sums.first += totals.first_n
    sums.rsvFirst += totals.rsv_first
    sums.d90 += totals.d90_n
    sums.rsvD90 += totals.rsv_d90
  }
  return { ...sums, dates: new Set(days.map((day) => day.day)) }
}

// 예약률 두 칸의 안쪽. 읽는 중·실패는 비움(실패 카드는 칸 아래 하나), 마감한 날이 없으면 한 줄
function RateBody({ sums, kind, worked }: { sums: ClosedSums | 'blank' | 'empty'; kind: 'first' | 'd90'; worked: readonly string[] }) {
  if (sums === 'blank') return null
  if (sums === 'empty') return <p className={LINE}>{NO_CLOSED}</p>
  const known = worked.length > 0
  if (kind === 'first') {
    return (
      <>
        <p className={BIG}>{sunapPct(sums.rsvFirst, sums.first)}</p>
        <Rows
          rows={[
            { label: '초진', value: people(sums.first) },
            { label: RESERVED, value: people(sums.rsvFirst) },
          ]}
        />
        <Rows
          below
          rows={[
            { label: '마감한 날', middle: known ? `진료한 날 ${formatCount(worked.length)}일 중` : '', value: dayCount(sums.days), sub: true },
            { label: '늦은 마감 섞임', value: dayCount(sums.late), sub: true, warn: sums.late > 0 },
          ]}
        />
      </>
    )
  }
  const notClosed = worked.filter((day) => !sums.dates.has(day)).length
  return (
    <>
      <p className={BIG}>{sunapPct(sums.rsvD90, sums.d90)}</p>
      <Rows
        rows={[
          { label: '90일초진', value: people(sums.d90) },
          { label: RESERVED, value: people(sums.rsvD90) },
        ]}
      />
      {notClosed > 0 && <Rows below rows={[{ label: `마감 안 한 날 ${formatCount(notClosed)}일은 빼고 셈`, sub: true }]} />}
    </>
  )
}

function BlockRows({ rates }: { rates: SunapRates }) {
  return (
    <>
      <Rows
        rows={[
          { label: '초진+Block', middle: fraction(rates.first_block, rates.first_n), value: sunapPct(rates.first_block, rates.first_n) },
          { label: '90일+Block', middle: fraction(rates.d90_block, rates.d90_n), value: sunapPct(rates.d90_block, rates.d90_n) },
          {
            label: (
              <>
                재진+Block <span className="text-st-muted">(Block 중)</span>
              </>
            ),
            middle: fraction(rates.ret_block, rates.block_n),
            value: sunapPct(rates.ret_block, rates.block_n),
          },
        ]}
      />
      <Rows
        below
        rows={[
          { label: 'Block', middle: fraction(rates.block_n, rates.visits), value: sunapPct(rates.block_n, rates.visits) },
          { label: '물리치료', middle: fraction(rates.pt_n, rates.visits), value: sunapPct(rates.pt_n, rates.visits) },
        ]}
      />
    </>
  )
}

// Block 전환 칸의 안쪽. 설정을 읽는 중·실패는 비움, 묶음을 안 골랐으면 한 줄(비트 답보다 먼저),
// 그다음은 세 칸과 같은 빈 상태 갈래(bitState). 답에 sunap이 없으면(묶음을 실어 물은 답을 기다림) 비움
function BlockBody({ groups, bit }: { groups: SunapGroupsState; bit: BitSectionsShown }) {
  if (groups === 'reading' || groups === 'failed') return null
  if (groups === 'none') return <p className={LINE}>{NO_GROUPS}</p>
  const state = bitState(bit)
  if (state.kind === 'waiting') return null
  if (state.kind === 'note') return <EmptyNote title={state.note.title}>{state.note.text}</EmptyNote>
  return state.sunap === undefined ? null : <BlockRows rates={state.sunap} />
}

export function SunapSection({ closed, groups, bit, worked, onReread }: Props) {
  const sums = closed === 'reading' || closed === 'failed' ? 'blank' : closed.length === 0 ? 'empty' : sumClosed(closed)
  const failed = closed === 'failed' || groups === 'failed'
  return (
    <div>
      <div className={GRID}>
        <Section title={RSV_FIRST} desc={RSV_DESC} className={CELL_FIRST}>
          <RateBody sums={sums} kind="first" worked={worked} />
        </Section>
        <Section title={RSV_D90} desc={RSV_DESC} className={CELL_NEXT}>
          <RateBody sums={sums} kind="d90" worked={worked} />
        </Section>
        <Section title={BLOCK} desc={BLOCK_DESC} className={CELL_LAST}>
          <BlockBody groups={groups} bit={bit} />
        </Section>
      </div>
      {failed && (
        // 오류 카드 + 카드 밖 [다시 읽기](매출 칸 읽기 실패와 같은 모양)
        <div className="mt-4">
          <ErrorCard code="E-STATS-READ-FAILED" />
          <div className="mt-2">
            <button type="button" onClick={onReread} className={`${ds.button.secondarySmall} max-md:w-full`}>
              {RETRY}
            </button>
          </div>
        </div>
      )}
      <div className="mt-4">
        <HowCounted>
          {HOW.map((line) => (
            <Note key={line}>{line}</Note>
          ))}
        </HowCounted>
      </div>
    </div>
  )
}
