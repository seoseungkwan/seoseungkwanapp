'use client'

import { useId } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ReadOnlyArea } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { ownFirst } from '@/lib/admin/compare/sort'
import { CardFrame, CompareCard, type SideRowKey } from './CompareCells'
import type { CompareStatsCells } from './statsInput'

// 통계 나란히 보기 판 (spec admin-view REQ-8016 AC-8016.1~AC-8016.4, 시안 docs/mockups/admin-view ?s=compare-region sideSection, design.md '통계 나란히 보기 칸 표').
// 줄 = 통계 탭 큰 카드 일곱, 칸 = 의원마다 288px. 카드 안 카드가 되지 않게 회색 바탕 위에 제목과 옆으로 미는 칸만 둔다(시안 '모양 결정').
// 격자: 첫 줄 = 의원 머리, 그다음 줄마다 줄 이름(격자 전체 폭, 글은 왼쪽에 붙음 sticky left-0) + 의원 카드들. 줄 높이 = 그 줄에서 가장 높은 카드(격자 기본 늘이기).
// props만 받는다(네트워크 없음). 읽는 중·실패 의원은 그 의원 칸만 바뀐다. 판 전체가 읽기만 구역(ReadOnlyArea)이고 단추는 실패 칸의 [다시 불러오기]뿐이다.
// 의사랑 의원(uis, spec uisarang-upload AC-8813.1)은 머리 지역·내 의원 칩 뒤에 회색 '의사랑' 칩(칸 상태와 따로)

/** 한 의원. cells = 읽는 중 · 읽기 실패 · 칸 값(compareStatsInput). uis = 의사랑 의원(없으면 거짓) */
export type SideClinic = { id: string; name: string; region: string; own: boolean; uis?: boolean; cells: 'reading' | 'failed' | CompareStatsCells }

/** 줄(시안 SIDE_ROWS 차례·글 그대로). name = 통계 탭 큰 카드 이름(TOC_LINKS), cells = 줄 이름 옆 작은 칸 이름들 */
export const SIDE_ROWS: readonly { key: SideRowKey; name: string; cells: string }[] = [
  { key: 'summary', name: '요약', cells: '환자 요약 · 매출 요약 · 평소와 다른 것(그 달 마지막 주를 앞 4주와 견줌) · 이번 달 목표(그 달 목표)' },
  { key: 'patients', name: '환자', cells: '일별 내원 · 환자 구성 · 신환 재방문율 · 몇 번까지 받나' },
  { key: 'revenue', name: '매출', cells: '매출 추이 · 급여·비급여·기타' },
  { key: 'sunap', name: '예약·전환', cells: '신환 예약률 · 90일 예약률 · Block 전환' },
  { key: 'calendar', name: '예약', cells: '예약 수 · 취소율 · 변경율 · 안 옴율' },
  { key: 'rx', name: '처방', cells: '처방별 추세 · 처방별 신환·재진' },
  { key: 'ops', name: '진료 운영', cells: '원장님별 · 시간대별 접수 · 요일별 내원 · 휴일에 따라' },
]

/** 통계 탭 카드(TOC_LINKS) 가운데 나란히 보기 줄이 없는 것과 그 까닭(AC-8016.4) */
export const NOT_DRAWN: Readonly<Record<string, string>> = {
  보고: '시안 줄에 없어 그리지 않는다(design.md 나란히 보기 칸 표)',
}

const TITLE = '통계 나란히 보기'
const DESC = '통계 탭 카드를 의원마다 나란히 · 같은 달 · 옆으로 밀어 봐요'
const MINE = '내 의원'
const UIS_MARK = '의사랑' // 의사랑 의원 표시(순위 표 첫 칸과 같은 글)
const READING = '불러오는 중'
const RETRY = '다시 불러오기'
const REGION_ALL = '전체'
const PICK_REGION: [string, string] = ['지역을 골라 주세요', '지역을 고르면 그 지역 의원들의 통계 카드를 나란히 보여 줘요.']
const noClinic = (region: string): [string, string] => ['의원 없음', `${region}에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.`]
const noMonth = (month: string): [string, string] => ['자료 없음', `${month}에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.`]
const COLUMN_WIDTH = 288

const HEAD = 'flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2'
const H2 = 'text-title font-semibold text-ink'
const SIDE_TEXT = 'text-small text-muted'
const SCROLL = 'mt-3 overflow-x-auto pb-2'
const GRID = 'grid gap-3'
const COL_HEAD = 'flex min-w-0 flex-col gap-0.5 px-1'
const COL_NAME = 'truncate text-body font-semibold text-ink'
const COL_SUB = 'flex items-center gap-1.5 text-caption text-muted'
const ROW_HEAD = 'col-span-full pt-3'
const ROW_LABEL = 'sticky left-0 inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pr-2'
const ROW_NAME = 'text-lead font-semibold text-ink'
const ROW_CELLS = 'text-small text-muted'
const NOTE_CARD = 'mt-3 rounded-st bg-surface px-6 py-5 shadow-st-card'
const NOTE_TEXT = 'text-body text-ink-2'
const NA = 'mt-1.5 text-small text-muted'

const yearMonth = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`

// 비는 판의 글: 지역 전체면 고르기 안내, 지역에 의원이 없으면 의원 없음, 모든 의원을 읽었고 그달 자료가 하나도 없으면 자료 없음(시안 차례)
function emptyNote(region: string, month: string, clinics: readonly SideClinic[]): [string, string] | null {
  if (region === REGION_ALL) return PICK_REGION
  if (clinics.length === 0) return noClinic(region)
  if (clinics.every((clinic) => typeof clinic.cells === 'object' && !clinic.cells.hasData)) return noMonth(yearMonth(month))
  return null
}

function ClinicCard({ row, clinic, onRetry }: { row: SideRowKey; clinic: SideClinic; onRetry: (id: string) => void }) {
  const { cells } = clinic
  if (cells === 'reading') {
    return (
      <CardFrame name={clinic.name}>
        <p className={NA}>{READING}</p>
      </CardFrame>
    )
  }
  if (cells === 'failed') {
    return (
      <CardFrame name={clinic.name}>
        <ErrorCard code="E-COMPARE-READ" />
        <button type="button" className={`${ds.button.secondarySmall} mt-2`} onClick={() => onRetry(clinic.id)}>
          {RETRY}
        </button>
      </CardFrame>
    )
  }
  return <CompareCard row={row} name={clinic.name} cells={cells} />
}

type Props = {
  /** 고른 달 'YYYY-MM' */
  month: string
  /** 고른 지역(전체면 '전체') */
  region: string
  clinics: readonly SideClinic[]
  /** 읽기 실패 의원의 [다시 불러오기] */
  onRetry: (id: string) => void
}

export function CompareStats({ month, region, clinics, onRetry }: Props) {
  const titleId = useId()
  const note = emptyNote(region, month, clinics)
  const rows = ownFirst(clinics)
  return (
    <ReadOnlyArea>
      <section id="cmp-side" aria-labelledby={titleId}>
        <div className={HEAD}>
          <h2 id={titleId} className={H2}>
            {TITLE}
          </h2>
          <span className={SIDE_TEXT}>{note === null ? `${yearMonth(month)} · ${region} ${rows.length}곳 · ${DESC}` : yearMonth(month)}</span>
        </div>
        {note !== null ? (
          <div className={NOTE_CARD}>
            <p className={NOTE_TEXT}>
              <b className="font-semibold text-ink">{note[0]}</b> · {note[1]}
            </p>
          </div>
        ) : (
          <div className={SCROLL}>
            <div className={GRID} style={{ gridTemplateColumns: `repeat(${rows.length}, ${COLUMN_WIDTH}px)` }}>
              {rows.map((clinic) => (
                <div key={`head-${clinic.id}`} className={COL_HEAD}>
                  <b className={COL_NAME}>{clinic.name}</b>
                  <span className={COL_SUB}>
                    {clinic.region}
                    {clinic.own && <span className={ds.chip.accent}>{MINE}</span>}
                    {clinic.uis === true && <span className={ds.chip.neutral}>{UIS_MARK}</span>}
                  </span>
                </div>
              ))}
              {SIDE_ROWS.flatMap((row) => [
                <div key={`row-${row.key}`} className={ROW_HEAD}>
                  <div className={ROW_LABEL}>
                    <h3 className={ROW_NAME}>{row.name}</h3>
                    <span className={ROW_CELLS}>{row.cells}</span>
                  </div>
                </div>,
                ...rows.map((clinic) => <ClinicCard key={`card-${row.key}-${clinic.id}`} row={row.key} clinic={clinic} onRetry={onRetry} />),
              ])}
            </div>
          </div>
        )}
      </section>
    </ReadOnlyArea>
  )
}
