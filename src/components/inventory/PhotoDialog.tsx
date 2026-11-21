'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { readPhoto } from '@/lib/storage/inventory'

// 명세서 사진 크게 보기 (specs/inventory AC-7508.5, design.md 6절 TASK-10, 시안 ?s=in-photo). 가운데 확인 창(ds.layer, 640px) + 뒤 가림막(ink 36%).
// 저장한 사진은 비공개 저장소에서 내려받아(readPhoto, Blob) blob: 주소로 보이고(CSP img-src blob:), 닫으면 주소를 거둔다.
// 확인 화면의 아직 저장하지 않은 사진(Blob)도 같은 창으로 본다. 닫기: [닫기]·Esc·가림막

export type PhotoSource = { path: string } | { blob: Blob }

type Shown = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; url: string }

export function PhotoDialog({ title, source, onClose }: { title: string; source: PhotoSource; onClose: () => void }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState<Shown>({ kind: 'loading' })
  const path = 'path' in source ? source.path : null
  const blob = 'blob' in source ? source.blob : null

  useEffect(() => {
    let alive = true
    let url: string | null = null
    const show = (photo: Blob | null) => {
      if (!alive) return
      if (photo === null) {
        setShown({ kind: 'failed' })
        return
      }
      url = URL.createObjectURL(photo)
      setShown({ kind: 'ready', url })
    }
    setShown({ kind: 'loading' })
    if (blob !== null) show(blob)
    else if (path !== null) readPhoto(path).then(show, () => show(null))
    return () => {
      alive = false
      if (url !== null) URL.revokeObjectURL(url)
    }
  }, [path, blob])

  // 열 때 한 번 [닫기]에 초점
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/36 p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${ds.layer} flex max-h-full w-160 max-w-full flex-col`}>
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-5">
          <h2 id={titleId} className="text-subtitle font-semibold text-ink">
            {title}
          </h2>
          <button ref={closeRef} type="button" aria-label="닫기" className={ds.button.ghostSmall} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-5">
          {shown.kind === 'ready' && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: 주소(이미지 최적화 대상이 아니다)
            <img src={shown.url} alt="올린 명세서 사진" className="block h-auto w-full rounded-control border border-line" />
          )}
          {shown.kind === 'loading' && (
            <p role="status" className="py-12 text-center text-small text-muted">
              사진을 불러오는 중이에요…
            </p>
          )}
          {shown.kind === 'failed' && <p className="py-12 text-center text-small text-ink-2">사진을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>}
        </div>
      </div>
    </div>
  )
}
