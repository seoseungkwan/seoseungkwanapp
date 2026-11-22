import { useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { LocationPhoto } from '@/types/location'
import { look } from './look'
import { CameraIcon } from './parts'
import { VISIT_TEXT as T, cutText, monthDayText } from './text'

// 보러 갈 때 사진(시안 ?s=plan .photos, AC-7913.4): 사진마다 그림·이름·찍은 날·[지우기], 끝에 [사진 올리기].
// 고른 사진은 부모가 준 shrink(inventory shrinkPhoto와 같은 모양: 긴 변 1,600px JPEG, 못 하면 null)로 줄인 뒤
// 하나씩 onAddPhoto로 넘긴다(이름 = 파일 이름에서 확장자를 뺀 40자, 찍은 날 = 오늘). 후보마다 PHOTO_LIMIT장까지 —
// 넘는 사진은 올리지 않는다. 넘었거나 줄이지 못했거나 올리기가 실패하면 E-LOC-PHOTO, 지우기 실패는 E-LOC-SAVE-FAILED.
// 올리는 동안([사진 올리기] aria-busy) 다시 고른 것은 무시한다. 그림 주소(url)는 부모가 읽어 준다(없으면 자리 글)

/** 후보마다 사진 수 한도(DB 트리거 location_photo_limit와 같음) */
export const PHOTO_LIMIT = 30
/** 고르기 칸이 받는 사진 형식(inventory PHOTO_ACCEPT와 같음 — 줄이기가 읽는 형식) */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
const LABEL_MAX = 40

/** 화면에 그릴 사진 한 장: 줄의 이름·찍은 날 + 부모가 읽어 만든 그림 주소(blob:), 아직 없으면 null */
export type VisitPhoto = Pick<LocationPhoto, 'id' | 'label' | 'takenOn'> & { url: string | null }
export type PhotoFields = { label: string; takenOn: string }

export type VisitPhotosProps = {
  photos: readonly VisitPhoto[]
  today: string
  shrink: (file: Blob) => Promise<Blob | null>
  onAddPhoto: (photo: Blob, fields: PhotoFields) => Promise<unknown>
  onDeletePhoto: (id: string) => Promise<unknown>
}

type PhotoError = 'E-LOC-PHOTO' | 'E-LOC-SAVE-FAILED'

const labelOf = (file: File) => cutText(file.name.replace(/\.[^.]+$/, ''), LABEL_MAX)

export function VisitPhotos({ photos, today, shrink, onAddPhoto, onDeletePhoto }: VisitPhotosProps) {
  const input = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PhotoError | null>(null)

  async function upload(files: File[]) {
    if (running.current || files.length === 0) return
    const room = Math.max(0, PHOTO_LIMIT - photos.length)
    const take = files.slice(0, room)
    let failed = take.length < files.length
    setError(null)
    if (take.length === 0) {
      setError('E-LOC-PHOTO')
      return
    }
    running.current = true
    setBusy(true)
    try {
      for (const file of take) {
        const jpeg = await shrink(file)
        if (jpeg === null) {
          failed = true
          continue
        }
        try {
          await onAddPhoto(jpeg, { label: labelOf(file), takenOn: today })
        } catch {
          failed = true
        }
      }
    } finally {
      running.current = false
      setBusy(false)
      setError(failed ? 'E-LOC-PHOTO' : null)
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await onDeletePhoto(id)
    } catch {
      setError('E-LOC-SAVE-FAILED')
    }
  }

  return (
    <div className="mt-5">
      <p className={look.smallStrong}>
        {T.photos} <span className="font-normal text-muted">{T.photoCount(photos.length)}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {photos.map((p) => (
          <div key={p.id} className="w-38">
            <div className="grid h-26 place-items-center overflow-clip rounded-control bg-line text-caption text-muted">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: 주소(이미지 최적화 대상이 아니다)
                <img src={p.url} alt={p.label || T.photoPlaceholder} className="h-full w-full object-cover" />
              ) : (
                T.photoPlaceholder
              )}
            </div>
            <div className="mt-1 flex items-start justify-between gap-1">
              <p className="min-w-0 text-caption text-ink-2">
                <span className="block truncate">{p.label}</span>
                {p.takenOn && <small className="block text-caption text-muted">{monthDayText(p.takenOn)}</small>}
              </p>
              <button type="button" className={look.photoDelete} aria-label={T.deletePhotoLabel(p.label)} onClick={() => void remove(p.id)}>
                {T.deletePhoto}
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={look.photoAdd}
          aria-busy={busy || undefined}
          onClick={() => {
            if (!running.current) input.current?.click()
          }}
        >
          <CameraIcon />
          <span>{T.addPhoto}</span>
        </button>
        <input
          ref={input}
          type="file"
          accept={PHOTO_ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? [])
            e.currentTarget.value = ''
            void upload(files)
          }}
        />
      </div>
      {error && (
        <div className="mt-3">
          <ErrorCard code={error} />
        </div>
      )}
    </div>
  )
}
