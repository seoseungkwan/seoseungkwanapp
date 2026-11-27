'use client'

import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import { Icon } from '@/components/common/Icon'
import type { UisUploadLook } from '@/components/dashboard/live/BitDashboard'
import { useDesk } from '@/components/shell/role'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import {
  UIS_SAVING,
  UIS_UPLOAD_DROP,
  UIS_UPLOAD_DROPPING,
  UIS_UPLOAD_ERP,
  UIS_UPLOAD_FILES,
  UIS_UPLOAD_FILES_CAP,
  UIS_UPLOAD_FOLDED,
  UIS_UPLOAD_HELP,
  UIS_UPLOAD_HELP_CLOSE,
  UIS_UPLOAD_HELP_OPEN,
  UIS_UPLOAD_PERIOD,
  UIS_UPLOAD_PICK,
  UIS_UPLOAD_PRIVACY,
  UIS_UPLOAD_TITLE,
  uisReadingText,
} from './texts'
import { UisResult } from './UisResult'
import type { UisUploadView } from './useUisUpload'

// 의사랑 엑셀 올리기 칸(specs/uisarang-upload design.md §10-1, 시안 ?s=dash-empty·reading·dash-data·stats).
// 펼친 모양 = 제목 → 도움말 → 받는 파일 → 기간 줄 → ERP 줄 → 놓는 자리 → 읽는 중 줄 → 결과 → 개인정보 줄.
// 접은 모양 = 한 줄(제목 · 안내 · [파일 고르기] · [도움말 보기]) → ERP 줄 → (펼치면) 도움말·받는 파일·기간 줄·개인정보 줄 → 읽는 중 줄 → 결과.
// 칸 전체에 놓을 수 있고, 읽는 동안은 [파일 고르기]가 잠기고 놓은 파일은 받지 않는다. [도움말 보기]는 화면 안에만 둔다(저장 안 함).
// 원장만 올린다: 데스크·다른 의원을 보는 중이면 그리지 않는다(AC-8810.7). 바깥 위 여백은 놓는 쪽이 준다. PC 화면만(폰 폭 클래스 없음)

export type { UisUploadLook }

const ACCEPT = '.xls,.xlsx,.csv'
const BOX: Record<'dashboard' | 'stats', string> = {
  dashboard: 'grid min-w-0 gap-3 rounded-control bg-canvas px-5 py-4',
  // 통계 탭은 흰 상자 + st 선(시안 .ubox.stbox)
  stats: 'grid min-w-0 gap-3 rounded-st-sm border border-st-line bg-surface px-5 py-4',
}

function ErpLine() {
  return (
    <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3.5 py-2.5 text-small font-medium text-warning">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{UIS_UPLOAD_ERP}</span>
    </p>
  )
}

function FilesList() {
  return (
    <div className="grid gap-0.5">
      <p className="text-caption font-semibold text-muted">{UIS_UPLOAD_FILES_CAP}</p>
      <ul className="grid gap-0.5">
        {UIS_UPLOAD_FILES.map((line) => (
          <li key={line} className="flex items-center gap-2 text-body text-ink">
            <Icon name="doc" size={14} className="shrink-0 text-muted" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PrivacyLine() {
  return (
    <p className="flex items-center gap-1.5 text-caption text-muted">
      <Icon name="lock" size={12} className="shrink-0" />
      {UIS_UPLOAD_PRIVACY}
    </p>
  )
}

function WorkLine({ upload }: { upload: UisUploadView }) {
  if (!upload.busy) return null
  return (
    <p role="status" className="flex items-center gap-2.5 rounded-control bg-surface px-4 py-3 text-body text-ink-2">
      <span className="bit-read-spin shrink-0" aria-hidden="true" />
      {upload.phase === 'reading' ? uisReadingText(upload.count) : UIS_SAVING}
    </p>
  )
}

export function UisUpload({ look, upload, place = 'dashboard' }: { look: UisUploadLook; upload: UisUploadView; place?: 'dashboard' | 'stats' }) {
  const readOnly = useReadOnly()
  const desk = useDesk()
  const [dragging, setDragging] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const helpId = useId()
  // 파일 고르기 창은 누를 때 만든다(칸 안에 파일 칸을 두지 않음). 창이 닫힐 때까지 잡아 두고, 고르는 동안 읽기가 시작됐으면 받지 않는다
  const picker = useRef<HTMLInputElement | null>(null)
  const latest = useRef(upload)
  useEffect(() => {
    latest.current = upload
  })

  if (readOnly || desk) return null

  const openPicker = () => {
    if (upload.busy) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = ACCEPT
    input.addEventListener(
      'change',
      () => {
        if (picker.current === input) picker.current = null
        const chosen = [...(input.files ?? [])]
        if (chosen.length === 0 || latest.current.busy) return
        latest.current.take(chosen)
      },
      { once: true },
    )
    picker.current = input
    input.click()
  }
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault() // 브라우저가 파일을 열지 않게
    if (!upload.busy) setDragging(true)
  }
  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }
  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDragging(false)
    if (upload.busy) return
    const dropped = [...(event.dataTransfer?.files ?? [])]
    if (dropped.length > 0) upload.take(dropped)
  }
  const pickButton = (tone: string) => (
    <button type="button" className={tone} disabled={upload.busy} onClick={openPicker}>
      <Icon name="upload" size={16} className="shrink-0" />
      {UIS_UPLOAD_PICK}
    </button>
  )

  return (
    <section aria-label={UIS_UPLOAD_TITLE} className={BOX[place]} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {look === 'open' ? (
        <>
          <h2 className="text-lead font-semibold text-ink">{UIS_UPLOAD_TITLE}</h2>
          <p className="text-body text-ink-2">{UIS_UPLOAD_HELP}</p>
          <FilesList />
          <p className="text-small text-ink-2">{UIS_UPLOAD_PERIOD}</p>
          <ErpLine />
          <div
            className={`flex min-h-24 flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-control border-[1.5px] border-dashed p-4 ${
              dragging ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong bg-surface text-ink-2'
            }`}
          >
            <Icon name="doc" size={28} className="shrink-0" />
            <p className="text-body">{dragging ? UIS_UPLOAD_DROPPING : UIS_UPLOAD_DROP}</p>
            {pickButton(ds.button.primary)}
          </div>
          <WorkLine upload={upload} />
          <UisResult upload={upload} />
          <PrivacyLine />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="whitespace-nowrap text-body font-semibold text-ink">{UIS_UPLOAD_TITLE}</h2>
            <p className="min-w-0 flex-1 text-small text-ink-2">{dragging ? UIS_UPLOAD_DROPPING : UIS_UPLOAD_FOLDED}</p>
            {pickButton(ds.button.secondarySmall)}
            <button type="button" className={`${ds.textButton} text-small`} aria-expanded={helpOpen} aria-controls={helpId} onClick={() => setHelpOpen((open) => !open)}>
              {helpOpen ? UIS_UPLOAD_HELP_CLOSE : UIS_UPLOAD_HELP_OPEN}
              <Icon name="chev" size={14} className={`shrink-0 transition-transform ${helpOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <ErpLine />
          <div id={helpId} hidden={!helpOpen} className="grid gap-3">
            <p className="text-body text-ink-2">{UIS_UPLOAD_HELP}</p>
            <FilesList />
            <p className="text-small text-ink-2">{UIS_UPLOAD_PERIOD}</p>
            <PrivacyLine />
          </div>
          <WorkLine upload={upload} />
          <UisResult upload={upload} />
        </>
      )}
    </section>
  )
}
