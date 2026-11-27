'use client'

import { useId, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { dayListText } from '@/lib/analytics/uisarang'
import { uisLineText } from './spanText'
import {
  UIS_ALL_PRESENT,
  UIS_CHIP,
  UIS_MISSING_DESC,
  UIS_MISSING_HEAD,
  UIS_RETRY_SAVE,
  UIS_SKIPPED_RSV,
  UIS_SKIPPED_SAME,
  uisMissingColumns,
  uisMissingName,
  uisResultCounts,
  uisResultHead,
  uisRowAt,
} from './texts'
import type { UisUploadRow, UisUploadView } from './useUisUpload'

// 결과 줄 · 저장 실패 · 아직 없는 파일 상자(specs/uisarang-upload requirements '화면 글자' 결과, 시안 ?s=dash-missing·dash-ok·refused).
// 올리기 칸(UisUpload)의 grid 안에 칸마다 한 덩어리로 놓인다. 파일 이름은 글자로만 그린다

const CHIP_CLASS: Record<UisUploadRow['status'], string> = {
  saved: ds.chip.positive,
  refused: ds.chip.negative,
  skipped: ds.chip.neutral,
  failed: ds.chip.negative,
}

// 받지 않음 카드 안 덧붙임: 빠진 칸 · 줄 번호(그 번호일 때만). 검사를 못 지난 모양(read인데 받지 않음)은 E-UIS-ROW 덧붙임 없음
function belowOf(row: UisUploadRow): ReactNode {
  const { result, status } = row
  if (status === 'refused') {
    if (result.status !== 'refused') return <ErrorCard code="E-UIS-ROW" />
    const detail =
      result.code === 'E-UIS-COLUMN' && result.columns !== undefined && result.columns.length > 0
        ? uisMissingColumns(result.columns)
        : result.code === 'E-UIS-ROW' && result.row !== undefined
          ? uisRowAt(result.row)
          : undefined
    return <ErrorCard code={result.code} detail={detail} />
  }
  if (status === 'skipped' && result.status === 'skipped') {
    return <p className="text-small text-ink-2">{result.why === 'rsv' ? UIS_SKIPPED_RSV : UIS_SKIPPED_SAME}</p>
  }
  return null
}

function Row({ row, today }: { row: UisUploadRow; today: string }) {
  const below = belowOf(row)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-body font-semibold text-ink [overflow-wrap:anywhere]">{row.name}</p>
        <p className="text-small text-muted">{uisLineText(row.result, today)}</p>
      </div>
      <span className={`${CHIP_CLASS[row.status]} mt-0.5 self-start whitespace-nowrap`}>{UIS_CHIP[row.status]}</span>
      {below !== null && <div className="col-span-2">{below}</div>}
    </li>
  )
}

const countOf = (rows: readonly UisUploadRow[], status: UisUploadRow['status']) => rows.filter((row) => row.status === status).length

export function UisResult({ upload }: { upload: UisUploadView }) {
  const headId = useId()
  const missingId = useId()
  if (upload.error !== null) return <ErrorCard code={upload.error} />
  const { rows, missing } = upload
  if (rows === null) return null
  const today = upload.today ?? ''

  return (
    <>
      <div className="min-w-0 overflow-x-auto rounded-control border border-line bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-4 py-3">
          <p id={headId} className="text-body font-semibold text-ink">
            {uisResultHead(rows.length)}
          </p>
          <p className="text-small text-muted">{uisResultCounts(countOf(rows, 'saved'), countOf(rows, 'refused'), countOf(rows, 'skipped'))}</p>
        </div>
        <ul aria-labelledby={headId} className="list-none">
          {rows.map((row, i) => (
            <Row key={i} row={row} today={today} />
          ))}
        </ul>
      </div>
      {upload.phase === 'saveFailed' && (
        <div>
          <ErrorCard code="E-UIS-SAVE-FAILED" />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" className={ds.button.secondarySmall} onClick={upload.retrySave}>
              {UIS_RETRY_SAVE}
            </button>
          </div>
        </div>
      )}
      {missing?.state === 'failed' && <ErrorCard code="E-UIS-READ-FAILED" />}
      {missing?.state === 'ready' && missing.items.length > 0 && (
        <div role="group" aria-labelledby={missingId} className="grid gap-1.5 rounded-control bg-warning-soft px-4 py-3">
          <p id={missingId} className="text-body font-semibold text-ink">
            {UIS_MISSING_HEAD}
          </p>
          <p className="text-small text-ink-2">{UIS_MISSING_DESC}</p>
          <ul className="grid list-none gap-0.5">
            {missing.items.map((item) => (
              <li key={item.kind} className="text-small text-ink">
                {uisMissingName(item.kind)} · <span className="text-ink-2">{dayListText(item.days, today)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {missing?.state === 'ready' && missing.items.length === 0 && (
        <p className="flex items-center gap-1.5 text-body font-medium text-positive">
          <Icon name="check" size={16} className="shrink-0" />
          {UIS_ALL_PRESENT}
        </p>
      )}
    </>
  )
}
