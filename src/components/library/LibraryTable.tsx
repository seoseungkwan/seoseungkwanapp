'use client'

import { Icon } from '@/components/common/Icon'
import { CATEGORY_LABEL, dayText, sizeText, type LibraryFile, type LibraryRow, type VersionKind } from '@/lib/library/files'
import { CornerIcon, DownloadIcon } from './icons'
import { look } from './look'

// 자료실 표(spec library AC-8105.1·AC-8105.2·AC-8105.3·AC-8105.5·AC-8106.1·AC-8107.1, 시안 tableBody·rowHtml).
// 줄은 lib/library/files의 libraryRows가 만든 차례 그대로 그린다: 파일 줄(이름 굵게 + 최신 칩 + 설명 · 분류 · 크기 · 올린 날 · [받기] [지우기])과
// 옛 판 접기 줄. 옛 판 줄은 꺾인 화살표 + 옅은 바탕 + 보통 굵기 이름, 방금 올린 줄은 옅은 파랑 바탕이다.
// 칸 폭은 분류 112 · 크기 96(오른쪽 맞춤) · 올린 날 112 · 단추 칸 1%, 이름 칸만 줄바꿈. 감싸개가 옆으로 밀린다(폰 전용 모양 없음)

type LibraryTableProps = {
  /** 거르기 전 모든 파일(빈 자료실과 '이 분류에는 없음'을 가른다) */
  files: readonly LibraryFile[]
  rows: readonly LibraryRow[]
  canEdit: boolean
  freshId: string | null
  busyIds: ReadonlySet<string>
  className: string
  onToggle(kind: VersionKind): void
  onDownload(file: LibraryFile): void
  onDelete(file: LibraryFile): void
  onUpload(): void
}

export function LibraryTable({ files, rows, canEdit, freshId, busyIds, className, onToggle, onDownload, onDelete, onUpload }: LibraryTableProps) {
  return (
    <div className={`${look.panel} ${className}`}>
      <div className={look.tableWrap}>
        <table aria-label="자료실 파일" className={look.table}>
          <thead>
            <tr>
              <th scope="col" className={look.th}>
                이름
              </th>
              <th scope="col" className={`${look.th} w-28`}>
                분류
              </th>
              <th scope="col" className={`${look.thNum} w-24`}>
                크기
              </th>
              <th scope="col" className={`${look.th} w-28`}>
                올린 날
              </th>
              <th scope="col" className={`${look.th} w-[1%]`}>
                <span className="sr-only">받기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow anyFile={files.length > 0} canEdit={canEdit} onUpload={onUpload} />
            ) : (
              rows.map((row) =>
                row.type === 'toggle' ? (
                  <ToggleRow key={`toggle-${row.kind}`} kind={row.kind} count={row.count} open={row.open} onToggle={onToggle} />
                ) : (
                  <FileRow
                    key={row.file.id}
                    row={row}
                    canEdit={canEdit}
                    fresh={row.file.id === freshId}
                    busy={busyIds.has(row.file.id)}
                    onDownload={onDownload}
                    onDelete={onDelete}
                  />
                ),
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** 빈 자료실(관리자 글 + [파일 올리기] / 그 밖 글) 또는 고른 분류에 없음 — 다섯 칸을 잇는 한 줄 */
function EmptyRow({ anyFile, canEdit, onUpload }: { anyFile: boolean; canEdit: boolean; onUpload(): void }) {
  return (
    <tr className="last:*:border-b-0">
      <td colSpan={5} className="border-b border-line px-5 py-8 whitespace-normal">
        {anyFile ? (
          <p className="text-muted">이 분류에는 파일이 없어요.</p>
        ) : (
          <>
            <b className="block text-subtitle font-semibold text-ink">아직 올린 파일이 없어요</b>
            {canEdit ? (
              <>
                <p className="mt-1 text-muted">[파일 올리기]로 첫 파일을 올려 보세요. 올린 파일은 모든 의원이 여기서 받아요.</p>
                <button type="button" onClick={onUpload} className={`mt-4 ${look.primary}`}>
                  <Icon name="upload" />
                  파일 올리기
                </button>
              </>
            ) : (
              <p className="mt-1 text-muted">관리자가 파일을 올리면 여기에 보여요.</p>
            )}
          </>
        )}
      </td>
    </tr>
  )
}

/** [옛 판 {n}개 보기] ↔ [옛 판 {n}개 접기] — 최신 줄 바로 아래 */
function ToggleRow({ kind, count, open, onToggle }: { kind: VersionKind; count: number; open: boolean; onToggle(kind: VersionKind): void }) {
  return (
    <tr className="last:*:border-b-0">
      <td colSpan={5} className="border-b border-line px-5 pb-2 whitespace-nowrap">
        <button type="button" aria-expanded={open} onClick={() => onToggle(kind)} className={look.toggle}>
          {open ? `옛 판 ${count}개 접기` : `옛 판 ${count}개 보기`}
          <Icon name="chev" size={14} className={open ? 'rotate-180' : undefined} />
        </button>
      </td>
    </tr>
  )
}

type FileRowProps = {
  row: Extract<LibraryRow, { type: 'file' }>
  canEdit: boolean
  fresh: boolean
  busy: boolean
  onDownload(file: LibraryFile): void
  onDelete(file: LibraryFile): void
}

function FileRow({ row, canEdit, fresh, busy, onDownload, onDelete }: FileRowProps) {
  const { file, latest, old, hasOld } = row
  // 접기 줄이 바로 아래 붙는 최신 줄은 아래 선이 없다(시안 tr.hasold)
  const cell = (classes: string) => (hasOld ? look.noLine(classes) : classes)
  const tone = fresh ? 'bg-accent-soft' : old ? 'bg-canvas' : ''
  const name = (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className={old ? 'text-body font-medium wrap-anywhere text-ink-2' : 'text-body font-semibold wrap-anywhere text-ink'}>{file.name}</b>
        {latest && <span className={look.chipLatest}>최신</span>}
      </span>
      {file.description !== '' && <span className="block text-muted">{file.description}</span>}
    </>
  )
  return (
    <tr className={`${look.row} ${tone}`}>
      <td className={cell(look.tdName)}>
        {old ? (
          <div className="flex items-start gap-2">
            <CornerIcon className="mt-0.75 shrink-0 text-faint" />
            <div className="min-w-0">{name}</div>
          </div>
        ) : (
          name
        )}
      </td>
      <td className={cell(look.tdSub)}>{CATEGORY_LABEL[file.category]}</td>
      <td className={cell(look.tdNum)}>{sizeText(file.size)}</td>
      <td className={cell(look.tdSub)}>{dayText(file.createdAt)}</td>
      <td className={cell(look.tdAction)}>
        <span className="inline-flex gap-2">
          <button type="button" aria-label={`${file.name} 받기`} aria-busy={busy || undefined} onClick={() => onDownload(file)} className={look.buttonSmall}>
            <DownloadIcon />
            받기
          </button>
          {canEdit && (
            <button type="button" aria-label={`${file.name} 지우기`} onClick={() => onDelete(file)} className={look.dangerSmall}>
              지우기
            </button>
          )}
        </span>
      </td>
    </tr>
  )
}
