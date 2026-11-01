import { ds } from '@/components/ui/classes'
import { BANNER, BlockHead, BlockSub, ERROR_NUMBER, Note, STRONG, SECTION } from './RevenueParts'
import { TreatmentBars } from './TreatmentBars'
import type { TreatmentsView } from './view'

// 치료별 매출 덩어리 (TASK-9, 시안 gen.py treat()·treat_load_failed()). [묶음 고치기]와 편집 화면은 다음 작업(TASK-14)이 머리 오른쪽에 더한다.
// 묶음을 읽지 못하면 제안으로 바꾸지 않고 안내와 [다시 불러오기]만 있다(view.ts가 kind를 정한다)

type Props = { view: TreatmentsView; onRetry(): void; retrying: boolean }

export function RevenueTreatments({ view, onRetry, retrying }: Props) {
  return (
    <section className={SECTION}>
      <BlockHead title={view.title}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {view.kind !== 'load-failed' && view.chip && <span className={ds.chip.accent}>{view.chip}</span>}
          <BlockSub>{view.sub}</BlockSub>
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
