'use client'

import { useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import type { StatsRange } from '@/components/stats/view'
import { formatPatientMix, mixBar, mixDelta, mixShareText, type MixUnit, type MixWho } from '@/lib/analytics/patientMix'
import type { BitSectionsView, MixRow, PatientMix } from '@/types/stats'
import { CopyButton } from './CopyButton'
import { EmptyNote, longDate, Section } from './parts'

// 환자 구성 (stats-bit-sections AC-2706.1·AC-2706.2·AC-2703.9·AC-2707.1, 시안 docs/mockups/stats-bit-sections).
// [전체][신환]·[구·시][동]은 화면 안에서만 바꾼다: Worker가 둘 다 실어 보내 다시 묻지 않는다. 글자·비율·증감은 patientMix.ts 함수가 만든다.
// 세 칸(환자 구성·시간대별 접수·원장님별)이 같이 쓰는 빈 상태 갈래(bitState)도 여기 둔다

// null = 이 기기에서 불러오지 않음 · 'waiting' = 이 기간 답을 기다림(제목·설명만) · 그 밖 = Worker 답
export type BitSectionsShown = BitSectionsView | null | 'waiting'
type Ready = Extract<BitSectionsView, { kind: 'ready' }>
type Note = { title: string; text: string }

const NOT_HERE: Note = { title: '비트 PC에서 불러오면 보여요', text: '진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.' }
const NOT_LOADED: Note = { title: '이 기간은 아직 불러오지 않았어요', text: '이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.' }
const OLD_HELPER: Note = {
  title: '도우미를 업데이트하면 보여요',
  text: '새 도우미가 나이·보험·동네·접수 시각·원장님을 함께 읽어 와요. 비트 PC 연결 화면에서 업데이트할 수 있어요.',
}
const NO_VISITS: Note = { title: '자료 없음', text: '이 기간에 불러온 접수가 없어요.' }

// 세 칸 공통 갈래(AC-2706.5·AC-2706.6). note면 제목만 두고 안내 한 줄, 접수가 하나도 없으면 세 칸 모두 같은 안내다
export function bitState(view: BitSectionsShown): { kind: 'waiting' } | { kind: 'note'; note: Note } | Ready {
  if (view === 'waiting') return { kind: 'waiting' }
  if (view === null) return { kind: 'note', note: NOT_HERE }
  if (view.kind === 'none') return { kind: 'note', note: NOT_LOADED }
  if (view.kind === 'old-helper') return { kind: 'note', note: OLD_HELPER }
  if (view.mix.all.total.visits === 0) return { kind: 'note', note: NO_VISITS }
  return view
}

// 빈 상태 칸: 제목 + 안내 한 줄(지금 EmptyNote 모양)
export function BitNoteSection({ title, note, className }: { title: string; note: Note; className?: string }) {
  return (
    <Section title={title} className={className}>
      <EmptyNote title={note.title}>{note.text}</EmptyNote>
    </Section>
  )
}

const TITLE = '환자 구성'
const DESC = '어떤 분들이 오시는지'
const WHO_NAME: Record<MixWho, string> = { all: '전체', new: '신환' }
const WHO_OPTIONS: readonly (readonly [MixWho, string])[] = [
  ['all', '전체'],
  ['new', '신환'],
]
const UNIT_OPTIONS: readonly (readonly [MixUnit, string])[] = [
  ['city', '구·시'],
  ['town', '동'],
]
const NO_PREVIOUS = '지난 기간 자료가 없어 견주지 못해요. 지난 기간이 든 기간을 불러오면 보여요.'
const FOOT = '명은 기간 안 마지막 내원 때의 나이·보험·주소로 한 번만 세요. 보험·동네는 비트에 적힌 이름 그대로예요(차상위는 한 줄로 묶어요).'

// 단추 묶음(목업 .seg, FollowupTool과 같은 모양). 휴대폰은 44px이고 [전체][신환]은 줄을 채운다. 동네 열 머리의 [구·시][동]은 글자만큼이다
const SEG_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:auto-cols-fr max-md:grid-flow-col'
const SEG_GROUP_FIT = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:auto-cols-fr max-md:grid-flow-col'
const SEG_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-2'
const SEG_ON = 'bg-accent-soft font-semibold text-accent-strong'
const SEG_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

// 1024px 이상 4·4·4 세 열, 오른쪽 두 열은 왼쪽 1px line + 안쪽 24. 좁으면 위아래로 쌓고 열 사이에 위 선(시안 .cols·.col)
const COLUMNS = 'mt-4 grid grid-cols-1 lg:grid-cols-3 lg:gap-x-6'
const COLUMN_SIDE = 'min-w-0 max-lg:mt-5 max-lg:border-t max-lg:border-line max-lg:pt-4 lg:border-l lg:border-line lg:pl-6'
// 줄: 이름 | 막대 | N명 | N건 · P% | 증감(견줄 때만). 칸 폭은 시안 .r 그대로
const ROW_BASE = 'grid min-h-8.5 items-center gap-y-0.5 border-b border-line py-1.5 text-small'
const ROW_COMPARED = `${ROW_BASE} grid-cols-[84px_minmax(24px,1fr)_56px_92px_44px] gap-x-1.5`
const ROW_PLAIN = `${ROW_BASE} grid-cols-[84px_minmax(24px,1fr)_58px_96px] gap-x-2`
// 증감 색은 parts.tsx DeltaText와 같다: ▲ positive · ▼ negative · 0%·새로·– muted
const DELTA_TONE = { up: 'text-positive', down: 'text-negative', flat: 'text-muted', none: 'text-muted' } as const
const ARROW = { up: '▲', down: '▼' } as const

function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
  fit = false,
}: {
  label: string
  options: readonly (readonly [T, string])[]
  value: T
  onChange(next: T): void
  fit?: boolean
}) {
  return (
    <div role="group" aria-label={label} className={fit ? SEG_GROUP_FIT : SEG_GROUP}>
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={option === value} onClick={() => onChange(option)} className={`${SEG_BUTTON} ${option === value ? SEG_ON : SEG_OFF}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

// 증감 한 칸(AC-2703.9). 화살표는 화면 읽기에서 빼고 뜻은 숨긴 글로 준다. 보통 줄이 아니면 빈 칸이다
function MixDeltaText({ row }: { row: MixRow }) {
  const delta = mixDelta(row)
  if (delta === null) return <span />
  const arrow = delta.dir === 'up' || delta.dir === 'down' ? ARROW[delta.dir] : null
  return (
    <span className={`whitespace-nowrap text-right text-caption tabular-nums ${DELTA_TONE[delta.dir]}`}>
      {arrow && <span aria-hidden="true">{arrow}</span>}
      {delta.text}
      <span className="sr-only"> {delta.srText}</span>
    </span>
  )
}

function MixRows({ name, rows, compared }: { name: string; rows: readonly MixRow[]; compared: boolean }) {
  return (
    <ol aria-label={name} className="mt-2 border-t border-line">
      {rows.map((row) => {
        const plain = row.kind === 'row'
        return (
          <li key={`${row.kind}:${row.label}`} className={compared ? ROW_COMPARED : ROW_PLAIN}>
            <span className={`min-w-0 wrap-anywhere ${plain ? 'text-ink' : 'text-muted'}`}>{row.label}</span>
            <span aria-hidden="true" className="block h-2 overflow-clip bg-canvas">
              <span className={`block h-full ${plain ? 'bg-accent' : 'bg-chart-prev'}`} style={{ width: `${mixBar(row, rows)}%` }} />
            </span>
            <span className="whitespace-nowrap text-right font-semibold tabular-nums text-ink">{formatCount(row.people)}명</span>
            <span className="whitespace-nowrap text-right tabular-nums text-muted">{`${formatCount(row.visits)}건 · ${mixShareText(row.share)}`}</span>
            {compared && <MixDeltaText row={row} />}
          </li>
        )
      })}
    </ol>
  )
}

function ColumnHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
      <h3 className="text-subtitle font-semibold text-ink">{title}</h3>
      {children}
    </div>
  )
}

// 견줘요 줄: 지금 통계 탭의 견줄 기간 이름 + 날짜(AC-2703.9). 빠른 단추 이름은 '지난 30일'처럼 '지난'이 이미 있다
function compareLine(range: StatsRange, mix: PatientMix): string {
  if (!mix.compared) return NO_PREVIOUS
  const { name, from, to } = range.previous
  return `${name}(${longDate(from)} ~ ${longDate(to)})과 견줘요 · 명 기준`
}

type Props = {
  view: BitSectionsShown
  range: StatsRange // 설명의 기간 이름(name) · 복사 글의 기간 글자(label) · 견줄 기간(previous)
  hospitalName: string
  className?: string
}

export function PatientMixSection({ view, range, hospitalName, className }: Props) {
  const [who, setWho] = useState<MixWho>('all')
  const [unit, setUnit] = useState<MixUnit>('city')
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
  const mix = state.mix[who]
  return (
    <Section title={TITLE} desc={desc} className={className}>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segments<MixWho> label="누구를 셀까" options={WHO_OPTIONS} value={who} onChange={setWho} />
        <span className="text-small text-muted">{`명 = 서로 다른 환자 · 건 = 접수 건수 · ${WHO_NAME[who]} ${formatCount(mix.total.people)}명`}</span>
      </div>
      <p className="mt-2 text-small text-muted">{compareLine(range, mix)}</p>
      <div className={COLUMNS}>
        <div className="min-w-0">
          <ColumnHead title="연령대" />
          <MixRows name="연령대" rows={mix.age} compared={mix.compared} />
        </div>
        <div className={COLUMN_SIDE}>
          <ColumnHead title="보험" />
          <MixRows name="보험" rows={mix.insurance} compared={mix.compared} />
        </div>
        <div className={COLUMN_SIDE}>
          <ColumnHead title="동네">
            <Segments<MixUnit> label="동네 단위" options={UNIT_OPTIONS} value={unit} onChange={setUnit} fit />
          </ColumnHead>
          <MixRows name="동네" rows={unit === 'city' ? mix.city : mix.town} compared={mix.compared} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="text-small text-muted">{FOOT}</p>
        <CopyButton text={formatPatientMix(hospitalName, range.label, who, unit, mix)} label="표 복사" fullOnPhone />
      </div>
    </Section>
  )
}
