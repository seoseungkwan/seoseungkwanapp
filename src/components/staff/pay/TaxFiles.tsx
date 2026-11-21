'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { addMonths } from '@/lib/analytics/dates'
import { STAFF_FILE_MAX_BYTES, staffFileMime, type StaffFileStore } from '@/lib/storage/staffFiles'
import type { StaffFile } from '@/types/staff'
import { fileKind, fileSize, uploadedDay } from './format'

// '세무사 파일' 칸 (staff AC-7615.8, 시안 pay.html ⑥). 세무사가 보낸 급여대장·명세서를 달마다 묶어 둔다(사람별로 나누지 않음).
// 비공개 바구니 staff-files(lib/storage/staffFiles.ts)에 올린다. 받는 종류는 PDF·ZIP·XLSX·XLS·JPG·PNG, 한 파일 10MB — 밖의 파일은 올리지 않고 E-STAFF-FILE-FAILED.
// 새 달이 맨 위, 처음 세 달 → [더 지난 달 보기]로 세 달씩 더. [지우기]는 한 번 묻는다

const PAGE = 3
const PICK_MONTHS = 13 // 올릴 달 고르기: 보는 달과 앞 12달
const ACCEPT = '.pdf,.zip,.xlsx,.xls,.jpg,.jpeg,.png'

type Failure = 'read' | 'file' | null

export function TaxFiles({ files, month }: { files: StaffFileStore; month: string }) {
  const [list, setList] = useState<StaffFile[] | null>(null)
  const [failure, setFailure] = useState<Failure>(null)
  const [target, setTarget] = useState(month)
  const [shown, setShown] = useState(PAGE)
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const read = useCallback(async () => {
    try {
      setList(await files.listFiles('tax'))
      return true
    } catch {
      setFailure('read')
      return false
    }
  }, [files])

  useEffect(() => {
    let current = true
    files.listFiles('tax').then(
      (rows) => {
        if (current) setList(rows)
      },
      () => {
        if (current) setFailure('read')
      },
    )
    return () => {
      current = false
    }
  }, [files])

  const upload = async (picked: readonly File[]) => {
    if (picked.length === 0 || busy) return
    setBusy(true)
    setFailure(null)
    const good = picked.filter((file) => staffFileMime('tax', file.name) !== null && file.size > 0 && file.size <= STAFF_FILE_MAX_BYTES)
    let failed = good.length !== picked.length
    for (const file of good) {
      try {
        await files.uploadFile({ kind: 'tax', month: target, file })
      } catch {
        failed = true
      }
    }
    await read()
    if (failed) setFailure('file')
    setBusy(false)
  }

  const remove = async (file: StaffFile) => {
    setAsking(null)
    setFailure(null)
    try {
      await files.deleteFile(file)
    } catch {
      setFailure('file')
      return
    }
    await read()
  }

  const download = async (file: StaffFile) => {
    setFailure(null)
    try {
      await files.downloadFile(file)
    } catch {
      setFailure('file')
    }
  }

  const months = [...new Set((list ?? []).map((file) => file.month ?? ''))].filter((m) => m !== '').sort((a, b) => (a < b ? 1 : -1))
  const choices = Array.from({ length: PICK_MONTHS }, (_, i) => addMonths(month, -i))

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        role="group"
        aria-label="세무사 파일 올리기"
        aria-busy={busy || undefined}
        className="flex flex-wrap items-center gap-2 rounded-float border border-dashed border-line-strong bg-surface px-4 py-3 text-small text-ink-2"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void upload([...(event.dataTransfer?.files ?? [])])
        }}
      >
        <span>세무사가 보낸 급여대장·명세서를 달마다 올려 두세요.</span>
        <span className="ml-auto inline-flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-small text-ink-2">
            올릴 달
            <select
              aria-label="올릴 달"
              className="h-8 rounded-control border border-line-strong bg-surface px-2 text-small text-ink"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {choices.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={ds.button.primary} onClick={() => picker.current?.click()}>
            파일 올리기
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            accept={ACCEPT}
            aria-label="세무사 파일 고르기"
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])]
              void upload(picked)
              event.target.value = ''
            }}
          />
        </span>
        <span className="basis-full text-caption text-muted">여러 파일을 한 번에 골라도 돼요. 이 칸으로 끌어다 놓아도 올라가요.</span>
      </div>
      {failure === 'read' && <ErrorCard code="E-STAFF-READ-FAILED" />}
      {failure === 'file' && <ErrorCard code="E-STAFF-FILE-FAILED" />}
      {list !== null && months.length === 0 && <p className="text-small text-muted">아직 올린 파일이 없어요.</p>}
      {months.slice(0, shown).map((m) => {
        const rows = (list ?? []).filter((file) => file.month === m)
        return (
          <section key={m} role="group" aria-label={`${m} 세무사 파일`} className={`${ds.panel} rounded-float`}>
            <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2">
              <b className="text-body font-semibold text-ink">{m}</b>
              <small className="text-caption text-muted">{`파일 ${rows.length}개`}</small>
            </div>
            <ul>
              {rows.map((file) => (
                <li key={file.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-2 last:border-b-0">
                  <span data-cell="" className={ds.chip.neutral}>
                    {fileKind(file.name)}
                  </span>
                  <span data-cell="" className="min-w-0 break-all text-small font-semibold text-ink">
                    {file.name}
                  </span>
                  <span data-cell="" className="text-caption text-muted">{`${fileSize(file.size)} · ${uploadedDay(file.createdAt)} 올림`}</span>
                  <span className="ml-auto inline-flex gap-1.5">
                    <button type="button" className={ds.button.secondarySmall} onClick={() => void download(file)}>
                      받기
                    </button>
                    <button type="button" className={ds.button.ghostSmall} onClick={() => setAsking(file.id)}>
                      지우기
                    </button>
                  </span>
                  {asking === file.id && (
                    <div className="flex basis-full flex-wrap items-center gap-2 rounded-control border border-warning bg-warning-soft px-3 py-2 text-small text-ink-2">
                      <p className="min-w-0 flex-1">이 파일을 지울까요?</p>
                      <button type="button" className={ds.button.danger} onClick={() => void remove(file)}>
                        지우기
                      </button>
                      <button type="button" className={ds.button.secondary} onClick={() => setAsking(null)}>
                        그만두기
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {months.length > shown && (
        <button type="button" className={`${ds.button.secondarySmall} self-start`} onClick={() => setShown((n) => n + PAGE)}>
          더 지난 달 보기
        </button>
      )}
    </div>
  )
}
