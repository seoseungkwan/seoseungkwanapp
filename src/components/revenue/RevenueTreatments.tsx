import type { RefObject } from 'react'
import { ds } from '@/components/ui/classes'
import { BANNER, BlockHead, BlockSub, ERROR_NUMBER, Note, STRONG, SECTION } from './RevenueParts'
import { TreatmentBars } from './TreatmentBars'
import type { TreatmentsView } from './view'

// 치료별 매출 덩어리 (TASK-9·TASK-14, 시안 gen.py treat()·treat_load_failed()). 머리 오른쪽의 [묶음 고치기]는 onEdit을 넘길 때 그린다(그림만 시험할 때는 넘기지 않는다).
// 묶음을 읽지 못하면 제안으로 바꾸지 않고 안내와 [다시 불러오기]만 있고 [묶음 고치기]는 눌리지 않는다(view.ts가 kind·editDisabled를 정한다).
// retrying = 묶음을 다시 읽는 중. [묶음 고치기]도 새로 읽은 뒤에 열리므로 같이 기다린다

// 편집 화면에서 돌아오면 RevenueScreen이 editRef로 이 단추에 초점을 준다. 붙어 있는 띠에 가리지 않게 scroll-margin을 띠 높이만큼 둔다(AppShell.tsx의 main과 같은 값)

type Props = { view: TreatmentsView; onRetry(): void; retrying: boolean; onEdit?(): void; editRef?: RefObject<HTMLButtonElement | null> }

export function RevenueTreatments({ view, onRetry, retrying, onEdit, editRef }: Props) {
  return (
    <section className={SECTION}>
      <BlockHead title={view.title}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {view.kind !== 'load-failed' && view.chip && <span className={ds.chip.accent}>{view.chip}</span>}
          <BlockSub>{view.sub}</BlockSub>
          {onEdit && (
            <button ref={editRef} type="button" className={`${ds.button.secondarySmall} scroll-mt-25.5 max-md:scroll-mt-23.5`} disabled={view.editDisabled} aria-disabled={view.editDisabled || undefined} aria-busy={retrying} onClick={onEdit}>
              {view.editLabel}
            </button>
          )}
        </div>
      </BlockHead>
      {view.kind === 'rows' && (
        <>
          <TreatmentBars rows={view.rows} />
          <Note>{view.note}</Note>
        </>
      )}
      {view.kind === 'none' && <p className="mt-3 text-small text-muted">{view.text}</p>}
      {view.kind === 'load-failed' && (
        <>
          <div role="alert" className={`${BANNER} bg-negative-soft`}>
            <p>
              <strong className={STRONG}>{view.heading}.</strong> {view.body}
            </p>
            <button type="button" className={ds.button.secondarySmall} aria-busy={retrying} onClick={onRetry}>
              {view.retry}
            </button>
          </div>
          <p className={ERROR_NUMBER}>오류 번호 {view.code}</p>
        </>
      )}
    </section>
  )
}
