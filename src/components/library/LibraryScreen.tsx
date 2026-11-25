'use client'

import { useMemo, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useReadOnly } from '@/components/shell/viewing'
import {
  CATEGORY_LABEL,
  categoryCounts,
  KIND_LABEL,
  latestOfKind,
  libraryRows,
  versionOf,
  type LibraryFile,
  type LibraryFilter,
  type VersionKind,
} from '@/lib/library/files'
import { downloadLibraryFile } from '@/lib/storage/library'
import { DeleteDialog } from './DeleteDialog'
import { LibraryTable } from './LibraryTable'
import { look } from './look'
import { ShortNotice, useShortNotice } from './ShortNotice'
import { UploadDialog } from './UploadDialog'
import { useLibrary } from './useLibrary'

// 자료실 화면(spec library REQ-8105·REQ-8106·REQ-8107, design.md '화면' LibraryScreen, 승인 시안 docs/mockups/library/index.html libraryHtml).
// 자리 차례: 머리 줄(h1 '자료실' + 파일 {n}개 · 오른쪽 [파일 올리기]) → 안내 글 → (받기 오류 카드) → (올린 뒤 초록 상자) → 분류 칩 → 표 → 표 아래 줄.
// 읽는 중에는 h1·안내 글만, 못 읽으면 오류 카드(640px까지) + [다시 읽기]만. 받기는 승인된 사람 모두, 올리기·지우기는 관리자만이고
// 다른 의원을 보는 중(useReadOnly)에는 [파일 올리기]·[지우기]·표 아래 줄을 그리지 않는다(쓰기는 브라우저 거르기·RLS가 막는다, ADR-046·051).
// 자료실은 모든 의원이 같은 하나다 — 병원 id를 다루지 않는다. 화면 글자는 requirements.md '화면 글자' 그대로다. 폰 전용 모양은 없다

const FILTERS: readonly LibraryFilter[] = ['all', 'install', 'guide', 'other']
const FOOT = '로그인하고 승인된 사람(데스크 포함)은 누구나 받을 수 있어요. 올리기·지우기는 관리자만 해요. 어떤 파일이든 한 파일에 50MB까지 올릴 수 있어요.'

type Dialog = { kind: 'upload' } | { kind: 'delete'; file: LibraryFile } | null
/** 올린 뒤 초록 상자: 파일 이름과 (그 종류의 최신이 된 판 번호 파일이면) 받기 단추 종류 */
type Uploaded = { fileName: string; kind: VersionKind | null }

export function LibraryScreen({ isAdmin }: { isAdmin: boolean }) {
  const readOnly = useReadOnly()
  const canEdit = isAdmin && !readOnly
  const { load, reload } = useLibrary()
  const { notice, say } = useShortNotice()

  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [open, setOpen] = useState<ReadonlySet<VersionKind>>(() => new Set())
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const busy = useRef(new Set<string>())
  const [downloadFailed, setDownloadFailed] = useState(false)
  const [uploaded, setUploaded] = useState<Uploaded | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const files = useMemo(() => (load.status === 'ready' ? load.files : []), [load])
  const rows = useMemo(() => libraryRows(files, filter, open), [files, filter, open])
  const counts = useMemo(() => categoryCounts(files), [files])

  function toggle(kind: VersionKind) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function download(file: LibraryFile) {
    if (busy.current.has(file.id)) return
    busy.current.add(file.id)
    setBusyIds(new Set(busy.current))
    setDownloadFailed(false)
    try {
      await downloadLibraryFile(file)
    } catch {
      setDownloadFailed(true)
    } finally {
      busy.current.delete(file.id)
      setBusyIds(new Set(busy.current))
    }
  }

  async function retry() {
    if (await reload()) say('다시 읽었어요.')
  }

  function openUpload() {
    setUploaded(null)
    setFreshId(null)
    setDialog({ kind: 'upload' })
  }

  function uploadDone(file: LibraryFile) {
    // 판 번호 파일이 그 종류의 최신이 될 때만 받기 단추 줄(더 낮은 옛 판은 받기 단추가 주지 않는다)
    const version = versionOf(file.fileName)
    const latest = version !== null && latestOfKind([...files, file], version.kind)?.id === file.id
    setDialog(null)
    setFilter('all')
    setUploaded({ fileName: file.fileName, kind: latest ? version.kind : null })
    setFreshId(file.id)
    void reload()
  }

  function deleteDone(file: LibraryFile) {
    setDialog(null)
    say(`${file.name} 파일을 지웠어요.`)
    void reload()
  }

  const count = files.length

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-title font-semibold text-ink">자료실</h1>
          {load.status === 'ready' && count > 0 && <span className="text-small whitespace-nowrap text-muted">{`파일 ${count}개`}</span>}
        </div>
        {canEdit && load.status === 'ready' && (
          <button type="button" onClick={openUpload} className={look.primary}>
            <Icon name="upload" />
            파일 올리기
          </button>
        )}
      </div>
      <p className="mt-1 text-ink-2">의원 PC에 깔 파일과 설명서를 여기서 받아요.</p>

      {load.status === 'failed' && (
        <>
          <div className="mt-4 max-w-160">
            <ErrorCard code={load.code} />
          </div>
          <div className="mt-3">
            <button type="button" onClick={() => void retry()} className={look.button}>
              다시 읽기
            </button>
          </div>
        </>
      )}

      {load.status === 'ready' && (
        <>
          {downloadFailed && (
            <div className="mt-4 max-w-160">
              <ErrorCard code="E-LIBRARY-DOWNLOAD-FAILED" />
            </div>
          )}
          {uploaded && <UploadedNotice uploaded={uploaded} />}
          {count > 0 && (
            <div role="group" aria-label="분류" className="mt-4 flex flex-wrap gap-1.5">
              {FILTERS.map((key) => {
                const n = counts[key]
                const on = filter === key
                return (
                  <button key={key} type="button" aria-pressed={on} onClick={() => setFilter(key)} className={on ? look.choiceOn : look.choice}>
                    {key === 'all' ? '전체' : CATEGORY_LABEL[key]}
                    <span className={n === 0 ? 'font-medium text-faint' : on ? 'font-medium text-accent-strong' : 'font-medium text-muted'}>{n}</span>
                  </button>
                )
              })}
            </div>
          )}
          <LibraryTable
            files={files}
            rows={rows}
            canEdit={canEdit}
            freshId={freshId}
            busyIds={busyIds}
            className={count > 0 ? 'mt-3' : 'mt-4'}
            onToggle={toggle}
            onDownload={(file) => void download(file)}
            onDelete={(file) => setDialog({ kind: 'delete', file })}
            onUpload={openUpload}
          />
          {canEdit && count > 0 && <p className="mt-3 pl-5 text-small text-muted">{FOOT}</p>}
        </>
      )}

      {canEdit && dialog?.kind === 'upload' && (
        <UploadDialog files={files} onDone={uploadDone} onClose={() => setDialog(null)} onStopped={() => say('올리기를 멈췄어요. 아무것도 올라가지 않았어요.')} />
      )}
      {canEdit && dialog?.kind === 'delete' && (
        <DeleteDialog file={dialog.file} files={files} onDone={() => deleteDone(dialog.file)} onClose={() => setDialog(null)} />
      )}
      <ShortNotice notice={notice} />
    </div>
  )
}

/** 올린 뒤 초록 상자(시안 .okc): {파일 이름} 파일을 올렸어요 + 둘째 줄 */
function UploadedNotice({ uploaded }: { uploaded: Uploaded }) {
  const line = uploaded.kind
    ? `이제 모든 의원이 받을 수 있어요. 비트 PC 연결 화면의 [${KIND_LABEL[uploaded.kind]} 내려받기]도 이 판을 줘요.`
    : '이제 모든 의원이 자료실에서 받을 수 있어요.'
  return (
    <div role="status" className="mt-4 flex items-start gap-2 rounded-control bg-positive-soft px-4 py-3">
      <Icon name="check" className="mt-0.75 shrink-0 text-positive" />
      <div className="min-w-0">
        <p className="font-semibold wrap-anywhere text-ink">{`${uploaded.fileName} 파일을 올렸어요`}</p>
        <p className="text-small text-ink-2">{line}</p>
      </div>
    </div>
  )
}
