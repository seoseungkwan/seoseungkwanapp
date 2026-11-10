import type { Ref } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import type { ClosureNotice, ThemeId } from '@/types/forms'
import { Poster } from './Poster'

// 서식 화면 오른쪽: 안내문 미리보기(A4 세로)와 [저장] [인쇄·PDF] [그림 파일] [지우기], 저장 상태와 오류
// (spec forms AC-3505.4·REQ-3506·REQ-3507, 시안 screen.html '미리보기'). 앱 화면 색·글자는 토큰과 ds만 쓴다

type SaveMark = 'saved' | 'dirty' | null

type Props = {
  notice: ClosureNotice // 미리보기 값(시작 날짜 있는 카드만)
  theme: ThemeId
  posterRef: Ref<HTMLDivElement> // 그림 파일이 이 안의 <svg>를 쓴다
  ready: boolean // 검사를 넘어 저장·뽑기를 할 수 있다
  canDelete: boolean
  saveMark: SaveMark
  saving: boolean
  deleting: boolean
  imaging: boolean
  storeError: 'save' | 'delete' | null
  imageFailed: boolean
  onSave: () => void
  onPrint: () => void
  onImage: () => void
  onDelete: () => void
}

export function PreviewPanel(props: Props) {
  const { notice, theme, posterRef, ready, canDelete, saveMark, saving, deleting, imaging, storeError, imageFailed } = props
  const empty = notice.cards.length === 0
  return (
    <section aria-label="미리보기" className={`${ds.panel} p-4`}>
      <h2 className="text-body font-semibold text-ink">
        미리보기 <span className="text-caption font-normal text-muted">A4 세로</span>
      </h2>
      <div className="relative mt-3 overflow-clip rounded-control border border-line">
        <div ref={posterRef} className="*:block *:h-auto *:w-full">
          <Poster notice={notice} theme={theme} />
        </div>
        {empty && (
          // 빈 카드 자리(AC-3505.4): 시안의 점선 상자 자리(x 160·y 560·폭 474·높이 250 / 794×1123)
          <div className="absolute top-1/2 left-[20%] flex h-[22%] w-[60%] items-center justify-center rounded-float border-2 border-dashed border-muted px-3 text-center text-small text-muted">
            날짜를 적으면 여기에 카드가 생겨요
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={ds.button.primary} disabled={!ready} aria-busy={saving || undefined} onClick={props.onSave}>
          저장
        </button>
        <button type="button" className={ds.button.secondary} disabled={!ready} onClick={props.onPrint}>
          인쇄·PDF
        </button>
        <button type="button" className={ds.button.secondary} disabled={!ready} aria-busy={imaging || undefined} onClick={props.onImage}>
          그림 파일
        </button>
        {canDelete && (
          <button type="button" className={ds.button.danger} aria-busy={deleting || undefined} onClick={props.onDelete}>
            지우기
          </button>
        )}
      </div>
      <p role="status" className="mt-2 text-caption">
        {saveMark === 'saved' && <span className="text-positive">저장됨</span>}
        {saveMark === 'dirty' && <span className="text-warning">저장하지 않은 내용이 있어요</span>}
      </p>
      {storeError && (
        <div className="mt-2 flex flex-col items-start gap-2">
          <ErrorCard code="E-FORMS-SAVE-FAILED" />
          {storeError === 'save' && (
            <button type="button" className={ds.button.secondarySmall} onClick={props.onSave}>
              다시 저장
            </button>
          )}
        </div>
      )}
      {imageFailed && (
        <div className="mt-2">
          <ErrorCard code="E-FORMS-IMAGE-FAILED" />
        </div>
      )}
    </section>
  )
}
