'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import {
  CATEGORY_LABEL,
  DESCRIPTION_MAX,
  guessCategory,
  LIBRARY_MAX_BYTES,
  mbText,
  NAME_MAX,
  pickProblem,
  sizeText,
  type LibraryCategory,
  type LibraryFile,
} from '@/lib/library/files'
import { LibraryError, LibraryStopped, uploadLibraryFile, type LibraryErrorCode } from '@/lib/storage/library'
import { keepTabInside, useEscape, useReturnFocus } from './dialogBits'
import { FileIcon } from './icons'
import { look } from './look'

// 올리기 창(spec library REQ-8106 AC-8106.2~AC-8106.8, 시안 layerHtml 올리기 창: 폭 520·안쪽 24·칸 사이 20).
// [파일 고르기](형식 제한 없는 숨은 파일 칸) → 고른 파일 검사(pickProblem: 크기·파일 이름 길이·같은 이름, 네트워크 없음) → 이름(파일 이름으로 채움)·분류(파일 끝으로 짐작)·설명 한 줄.
// 칸 잠금 = 파일 없음 · 검사에 걸림 · 올리는 중. 잠기면 분류 단추는 하나도 눌린 모양이 아니다.
// [올리기] → uploadLibraryFile(진행률 onProgress · 멈춤 AbortController). 되면 onDone(넣은 줄), 멈추면 칸 그대로 + onStopped(짧은 알림), 실패면 단추 줄 위 오류 카드.
// 올리는 중에는 바깥 누름·Esc로 닫히지 않고 [취소]가 멈춤이다. 창이 빠지면(다른 탭으로 감) 올리기를 멈춘다

const CATEGORIES: readonly LibraryCategory[] = ['install', 'guide', 'other']
type Progress = { sent: number; total: number }

type UploadDialogProps = {
  /** 지금 자료실 파일(같은 파일 이름 검사) */
  files: readonly LibraryFile[]
  onDone(file: LibraryFile): void
  onClose(): void
  onStopped(): void
}

export function UploadDialog({ files, onDone, onClose, onStopped }: UploadDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const descId = useId()
  const pickRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  const [picked, setPicked] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<LibraryCategory>('install')
  const [description, setDescription] = useState('')
  const [nameMissing, setNameMissing] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [failure, setFailure] = useState<LibraryErrorCode | null>(null)

  const uploading = progress !== null
  const problem = picked ? pickProblem({ name: picked.name, size: picked.size }, files) : null
  const locked = picked === null || problem !== null || uploading
  const tooBig = picked !== null && picked.size > LIBRARY_MAX_BYTES

  useReturnFocus()
  useEscape(onClose, uploading)
  useEffect(() => {
    pickRef.current?.focus()
    mounted.current = true
    return () => {
      // 창이 빠지면(다른 탭으로 감) 올리기를 멈춘다 — 아무것도 남지 않는다
      mounted.current = false
      controller.current?.abort()
    }
  }, [])

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // 같은 파일을 다시 골라도 바뀜이 오게
    if (!file) return
    const found = pickProblem({ name: file.name, size: file.size }, files)
    setPicked(file)
    setName(found ? '' : file.name)
    setCategory(guessCategory(file.name))
    setNameMissing(false)
    setFailure(null)
  }

  async function send() {
    if (uploading || picked === null || problem !== null) return
    if (name.trim() === '') {
      setNameMissing(true)
      nameRef.current?.focus()
      return
    }
    setNameMissing(false)
    setFailure(null)
    setProgress({ sent: 0, total: picked.size })
    const stop = new AbortController()
    controller.current = stop
    try {
      const file = await uploadLibraryFile(
        { file: picked, name, category, description },
        {
          signal: stop.signal,
          onProgress: (sent, total) => {
            if (mounted.current && !stop.signal.aborted) setProgress({ sent, total })
          },
        },
      )
      controller.current = null
      if (mounted.current) onDone(file)
    } catch (error) {
      controller.current = null
      if (!mounted.current) return
      setProgress(null)
      if (error instanceof LibraryStopped) onStopped()
      else setFailure(error instanceof LibraryError ? error.code : 'E-LIBRARY-UPLOAD-FAILED')
    }
  }

  function cancel() {
    if (uploading) controller.current?.abort()
    else onClose()
  }

  const percent = progress && progress.total > 0 ? Math.min(100, Math.floor((progress.sent / progress.total) * 100)) : 0
  const nameNoteId = `${nameId}-note`

  return (
    <>
      <div data-scrim aria-hidden="true" onClick={uploading ? undefined : onClose} className="fixed inset-0 z-40 bg-ink/36" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        className={`fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100vh-32px)] w-130 max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto p-6 ${look.layer}`}
      >
        <h2 id={titleId} className="text-subtitle font-semibold wrap-anywhere text-ink">
          파일 올리기
        </h2>

        <div className={look.field}>
          <span className={look.label}>파일</span>
          <div className="flex min-w-0 items-center gap-3">
            <button ref={pickRef} type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className={look.buttonSmall}>
              파일 고르기
            </button>
            {picked ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-ink">
                <FileIcon className="shrink-0 text-muted" />
                <span className="truncate">{picked.name}</span>
                <em className={tooBig ? 'font-semibold whitespace-nowrap text-negative not-italic' : 'whitespace-nowrap text-muted not-italic'}>{`· ${sizeText(picked.size)}`}</em>
              </span>
            ) : (
              <span className="text-muted">아직 고른 파일이 없어요.</span>
            )}
          </div>
          <input ref={inputRef} type="file" hidden tabIndex={-1} onChange={choose} />
          {problem ? <ErrorCard code={problem} /> : <p className={look.help}>어떤 파일이든 돼요. 한 파일에 50MB까지.</p>}
        </div>

        <div className={look.field}>
          <label htmlFor={nameId} className={look.label}>
            이름
          </label>
          <input
            ref={nameRef}
            id={nameId}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={NAME_MAX}
            disabled={locked}
            autoComplete="off"
            aria-invalid={nameMissing || undefined}
            aria-describedby={nameNoteId}
            className={look.input}
          />
          {nameMissing ? (
            <p id={nameNoteId} className={look.fieldError}>
              이름을 적어 주세요.
            </p>
          ) : (
            <p id={nameNoteId} className={look.help}>
              자료실 목록에 보이는 이름이에요. 파일을 고르면 파일 이름으로 채워지고, 고쳐도 돼요.
            </p>
          )}
        </div>

        <div className={look.field}>
          <span className={look.label}>분류</span>
          <div role="group" aria-label="분류" className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((key) => {
              const on = !locked && category === key
              return (
                <button key={key} type="button" aria-pressed={on} disabled={locked} onClick={() => setCategory(key)} className={on ? look.optionOn : look.option}>
                  {CATEGORY_LABEL[key]}
                </button>
              )
            })}
          </div>
        </div>

        <div className={look.field}>
          <label htmlFor={descId} className={look.label}>
            설명 한 줄 <span className={look.labelHint}>선택 · 60자까지</span>
          </label>
          <input
            id={descId}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX}
            placeholder="예) 청구 도우미 · 비트 자료를 읽는 PC 프로그램"
            disabled={locked}
            autoComplete="off"
            className={look.input}
          />
        </div>

        {progress && (
          <div role="status" className="grid gap-1.5 rounded-control bg-canvas px-4 py-3">
            <div className="flex justify-between gap-3 text-small text-ink-2">
              <b className="font-semibold text-ink">{`올리는 중… ${percent}%`}</b>
              <span>{`${mbText(progress.sent)} / ${mbText(progress.total)}`}</span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-clip rounded-control bg-line">
              <i data-bar className="block h-full bg-accent transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
            </div>
            <p className={look.help}>다 올라갈 때까지 이 창을 열어 두세요.</p>
          </div>
        )}

        {failure && <ErrorCard code={failure} />}

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={cancel} className={look.button}>
            취소
          </button>
          <button type="button" disabled={picked === null || problem !== null} aria-busy={uploading || undefined} onClick={() => void send()} className={look.primary}>
            <Icon name="upload" />
            {uploading ? '올리는 중…' : '올리기'}
          </button>
        </div>
      </div>
    </>
  )
}
